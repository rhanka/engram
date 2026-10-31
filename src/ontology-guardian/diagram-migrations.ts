// Engram explicit @1 → @2 migrations (frozen spec M3-R4 deb64b75, §3.13).
// Method (round-3 design note, section A): every migration starts from a
// deep copy of the complete pinned input document, applies only explicitly
// declared patches (path → operation → spec justification), then runs a
// lossless audit: every input leaf path is either present unchanged in the
// output or listed in the declared patch set with its target. Undeclared
// loss is a typed refusal, never a silent drop.
// Refinements resolve through the shared §5.1 resolver below (full ancestry,
// compatible promotion, incompatible overlap refusal, residual rebase).
// Presentation moves are keyed by (view id, occurrence id) and restricted to
// source-family declarations and explicitly authorized slots; the output
// view is validated against the pinned ViewDocument shape before commit.
// Pure functions over governed document data. Atomic: any blocking item
// refuses the whole state — the exact original is returned, no candidate.
// No executor, layout or rendering (G2).
// Operations are recorded in canonical order: profileRefs, typeDefinitions
// by UTF-16 id, entities, relations, ports by id, then views/occurrences by
// id. Record insertion order never changes report bytes: every map iteration
// below walks UTF-16-sorted keys, including attribute maps.
import { canonicalBytes, sha256Hex } from "./canonical.js";
import { checkViewShape } from "./diagram-view-shape.js";
import { resolveViewSchemaVersion } from "./diagram-schemas.js";
import {
  boundaryPreflightRefusal,
  migrateRetainedViewsV1ToV2,
} from "./diagram-view-migration.js";
import type { BoundaryPreflightRefusal, ViewSchemaMigrationReport } from "./diagram-view-migration.js";
import { checkSemanticShape } from "./diagram-document-shape.js";
import type { Digest, Pin } from "./types.js";
import { ARCHIMATE_CATALOGUE } from "./diagram-matrix-data.js";
import { expandArchimateTuples } from "./diagram-profiles.js";
import { ARCHIMATE_V2, GENERIC_V2, UML_V2 } from "./diagram-profiles.js";
import { ARCHIMATE_V1_DECLARATION, ARCHIMATE_V1_CONTENT, GENERIC_V1_CONTENT, UML_V1_CONTENT } from "./diagram-skeletons.js";

// ---------------------------------------------------------------------------
// Governed migration input/output shapes
// ---------------------------------------------------------------------------

export interface MigAttribute {
  readonly kind: string;
  readonly value?: unknown;
  readonly items?: readonly MigAttribute[];
  readonly fields?: Readonly<Record<string, MigAttribute>>;
  readonly [extra: string]: unknown;
}

export interface MigEntity {
  readonly id: string;
  readonly profile: string;
  readonly type: string;
  readonly attributes: Readonly<Record<string, MigAttribute>>;
}

export interface MigEndpoint {
  readonly role: string;
  readonly target: string;
}

export interface MigRelation {
  readonly id: string;
  readonly profile: string;
  readonly type: string;
  readonly endpoints: readonly MigEndpoint[];
  readonly attributes: Readonly<Record<string, MigAttribute>>;
}

export interface MigOccurrence {
  readonly id: string;
  readonly entity: string;
  readonly strokeStyle?: "solid" | "dashed";
}

/** Fold/visual group carried on a retained view (spec §4.1.1, occurrence-bound). */
export interface MigGroup {
  readonly id: string;
  readonly label?: string;
  readonly collapsed?: boolean;
  readonly occurrence?: string;
}

export interface MigView {
  readonly viewId: string;
  readonly semanticDocumentId: string;
  readonly revision: number;
  readonly entityOccurrences: Readonly<Record<string, MigOccurrence>>;
  readonly relationOccurrences?: Readonly<Record<string, unknown>>;
  readonly portOccurrences?: Readonly<Record<string, unknown>>;
  readonly groups?: Readonly<Record<string, MigGroup>>;
  readonly filters?: readonly unknown[];
  /** Retained view presentation, carried through the transaction (§3.13). */
  readonly presentation?: Record<string, unknown>;
  readonly [extra: string]: unknown;
}

export interface MigDocument {
  readonly documentId: string;
  readonly revision: number;
  readonly profileRefs: readonly string[];
  readonly entities: Readonly<Record<string, MigEntity>>;
  readonly relations: Readonly<Record<string, MigRelation>>;
  readonly ports?: Readonly<Record<string, unknown>>;
  readonly views?: readonly MigView[];
  readonly resources?: unknown;
  readonly extensions?: unknown;
  readonly typeDefinitions?: Readonly<Record<string, unknown>>;
  /** Native document version marker, preserved byte for byte (§2.1). */
  readonly schemaVersion?: unknown;
  readonly [extra: string]: unknown;
}

export interface MigrationOperation {
  readonly path: string;
  readonly action: string;
  readonly detail?: string;
  readonly specRef?: string;
}

/**
 * Closed report-reason vocabulary (spec §3.13.1 step 3 names
 * type-definition-conflict with detail incompatible-attribute-schema;
 * Appendix C.1: report reasons, not diagnostics).
 */
export type MigrationRefusalReason =
  | "missing-source-profile"
  | "target-already-present"
  | "missing-type-mapping"
  | "multiplicity-syntax"
  | "multiplicity-invalid"
  | "unmapped-stereotype"
  | "stereotype-application-invalid"
  | "missing-presentation-destination"
  | "missing-presentation-contract"
  | "destination-conflict"
  | "incompatible-attribute-schema"
  | "type-definition-conflict"
  | "endpoint-role-unknown"
  | "relationship-matrix-violation";

export interface UnmigratedItem {
  readonly path: string;
  readonly reason: MigrationRefusalReason;
  /** Spec detail string carried where the spec names one (e.g. §3.13.1 step 3). */
  readonly detail?: string;
}

export type MigrationOutcome = "ok" | "refused";

interface MigrationCommon {
  readonly migrationId: string;
  readonly from: Pin;
  readonly to: Pin;
  readonly originalSha256: Digest;
  readonly originalCanonical: MigDocument;
  readonly operations: readonly MigrationOperation[];
}

export interface MigrationSuccess extends MigrationCommon {
  readonly outcome: "ok";
  readonly unmigrated: readonly [];
  readonly target: MigDocument;
  /** Presentation moves keyed by "viewId/occurrenceId" (per-view scoping, §3.13.1 step 4). */
  readonly presentationMoves?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly foldSeeds?: readonly string[];
  readonly residuals?: Readonly<Record<string, unknown>>;
}

export interface MigrationRefusal extends MigrationCommon {
  readonly outcome: "refused";
  readonly unmigrated: readonly [UnmigratedItem, ...UnmigratedItem[]];
  readonly target: null;
}

export type MigrationReport = MigrationSuccess | MigrationRefusal;

function refuse(
  migrationId: string, from: Pin, to: Pin, source: MigDocument,
  operations: MigrationOperation[], unmigrated: [UnmigratedItem, ...UnmigratedItem[]],
): MigrationRefusal {
  return {
    migrationId, from, to,
    originalSha256: sha256Hex(canonicalBytes(source)),
    originalCanonical: structuredClone(source),
    operations: orderedOperations(operations, migrationId), unmigrated, outcome: "refused", target: null,
  };
}

/** Complete retained-view set; conflicting duplicate identities refuse preflight. */
function transactionSnapshot(source: MigDocument, supplied?: readonly MigView[]): MigDocument {
  if (supplied === undefined) return structuredClone(source);
  const views = [...(source.views ?? [])];
  for (const view of supplied) {
    const same = isRecord(view) ? views.find(v => isRecord(v) && v.viewId === view.viewId) : undefined;
    if (same === undefined || canonicalBytes(same) !== canonicalBytes(view)) views.push(view);
  }
  return { ...structuredClone(source), views: structuredClone(views) };
}

function orderedOperations(operations: readonly MigrationOperation[], migrationId: string): MigrationOperation[] {
  const groups = ["profileRefs", "typeDefinitions", "entities", "relations", "ports", "views"];
  const rank = (path: string): number => { const index = groups.indexOf(path.split(".")[0]!); return index < 0 ? groups.length : index; };
  const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
  return operations.map(operation => ({ ...operation, specRef: operation.specRef ?? (migrationId === GENERIC_MIGRATION_ID ? "§3.13.1" : "§3.13.2 + §3.13.1 common contract") }))
    .sort((a, b) => rank(a.path) - rank(b.path) || compare(a.path, b.path) || compare(a.action, b.action) || compare(a.detail ?? "", b.detail ?? ""));
}

function getText(attr: MigAttribute | undefined): string | null {
  return attr !== undefined && attr.kind === "text" && typeof attr.value === "string" ? attr.value : null;
}

function sortedKeys(record: Readonly<Record<string, unknown>> | undefined): string[] {
  return Object.keys(record ?? {}).sort();
}

/** UTF-16-sorted attribute entries: report order never depends on insertion. */
function sortedAttributes(attributes: Readonly<Record<string, MigAttribute>>): [string, MigAttribute][] {
  return Object.keys(attributes).sort().map((key) => [key, attributes[key]!] as [string, MigAttribute]);
}

/** Every entity/relation/port type id declared by a governed @2 profile. */
function governedIds(declaration: Record<string, unknown>): Set<string> {
  const ids = new Set<string>();
  for (const group of ["entityTypes", "portTypes", "relationTypes"]) {
    for (const entry of (declaration[group] as readonly Record<string, unknown>[] | undefined) ?? []) {
      if (typeof entry["id"] === "string") ids.add(entry["id"] as string);
    }
  }
  return ids;
}

/**
 * Rewrite the profile marker on every record that carries the source
 * profile — entities, relations, ports and type-definition values alike
 * (§3.13.1 step 1: every matching .profile, not just entities).
 */
function rewriteRecordProfile<T>(record: T, sourceProfile: string, targetProfile: string): T {
  if (typeof record !== "object" || record === null || Array.isArray(record)) return record;
  const value = record as Record<string, unknown>;
  if (value["profile"] !== sourceProfile) return record;
  return { ...value, profile: targetProfile } as T;
}

/**
 * Exhaustive post-scan: no migrated record may retain the source profile.
 * Covers entities, relations, ports and type-definition values.
 */
function findStraySourceProfile(target: MigDocument, sourceProfile: string): string | null {
  for (const id of sortedKeys(target.entities)) {
    if (target.entities[id]!.profile === sourceProfile) return `entities.${id}.profile`;
  }
  for (const id of sortedKeys(target.relations)) {
    if (target.relations[id]!.profile === sourceProfile) return `relations.${id}.profile`;
  }
  for (const id of sortedKeys(target.ports as Readonly<Record<string, unknown>> | undefined)) {
    const port = (target.ports as Readonly<Record<string, unknown>>)[id];
    if (typeof port === "object" && port !== null && (port as Record<string, unknown>)["profile"] === sourceProfile) {
      return `ports.${id}.profile`;
    }
  }
  for (const id of sortedKeys(target.typeDefinitions)) {
    const definition = target.typeDefinitions![id];
    if (typeof definition === "object" && definition !== null && (definition as Record<string, unknown>)["profile"] === sourceProfile) {
      return `typeDefinitions.${id}.profile`;
    }
  }
  return null;
}

function checkTargetClean(
  target: MigDocument, sourceProfile: string, targetProfile: string,
): string | null {
  if (target.profileRefs.includes(sourceProfile)) return "profileRefs";
  if (!target.profileRefs.includes(targetProfile)) return "profileRefs";
  return findStraySourceProfile(target, sourceProfile);
}

// ---------------------------------------------------------------------------
// Shared §5.1 resolver (migration scope): full ancestry, container
// capability, abstractness and effective attribute schemas for one type.
// Refinement definitions are document typeDefinitions entries carrying a
// baseType (or supertypes) plus additive attributes. A refinement that
// redeclares an inherited attribute with a different kind or an
// incompatible bound is a type-definition-conflict (§3.13.1 step 3,
// Appendix C.5); compatible overlaps promote.
// ---------------------------------------------------------------------------

export interface EffectiveType {
  readonly baseId: string;
  readonly chain: readonly string[];
  readonly container: boolean;
  readonly abstractBase: boolean;
  readonly attrs: Readonly<Record<string, { readonly kind: string }>>;
}

type ResolverError =
  | { readonly error: "unknown"; readonly chain: readonly string[] }
  | { readonly error: "cycle"; readonly chain: readonly string[] }
  | { readonly error: "conflict"; readonly attribute: string; readonly baseType: string };

function declarationById(declaration: Record<string, unknown>, group: string): Map<string, Record<string, unknown>> {
  const out = new Map<string, Record<string, unknown>>();
  for (const entry of (declaration[group] as readonly Record<string, unknown>[] | undefined) ?? []) {
    if (typeof entry["id"] === "string") out.set(entry["id"] as string, entry);
  }
  return out;
}

function schemaKindOf(schema: unknown): string | null {
  if (typeof schema !== "object" || schema === null) return null;
  const kind = (schema as Record<string, unknown>)["kind"];
  return typeof kind === "string" ? kind : null;
}

/** Same-kind bound comparison for declared attribute schemas; true when compatible. */
function sameKindBoundsCompatible(base: unknown, overlay: unknown): boolean {
  if (!isRecord(base) || !isRecord(overlay)) return false;
  const normalize = (schema: Record<string, unknown>): Record<string, unknown> => {
    const { name: _name, required = false, ...rest } = schema;
    return { ...rest, required };
  };
  return canonicalBytes(normalize(base)) === canonicalBytes(normalize(overlay));
}

function refinementBaseOf(definition: unknown): string | null {
  return isRecord(definition) && typeof definition["baseType"] === "string" ? definition["baseType"] : null;
}

/** Native AttributeSchema[]; a malformed declaration is never an empty overlay. */
function refinementAttrsOf(definition: unknown): Readonly<Record<string, unknown>> | null {
  if (!isRecord(definition) || !Array.isArray(definition["attributes"])) return null;
  const out: Record<string, unknown> = Object.create(null);
  for (const schema of definition["attributes"]) {
    if (!isRecord(schema) || typeof schema["name"] !== "string" || schemaKindOf(schema) === null || Object.hasOwn(out, schema["name"])) return null;
    out[schema["name"]] = schema;
  }
  return out;
}

export function resolveEffectiveType(
  targetDeclaration: Record<string, unknown>,
  typeDefinitions: Readonly<Record<string, unknown>> | undefined,
  typeId: string,
): { readonly ok: true; readonly effective: EffectiveType } | { readonly ok: false; readonly failure: ResolverError } {
  const declared = new Map<string, Record<string, unknown>>();
  for (const group of ["entityTypes", "portTypes", "relationTypes"]) {
    for (const [id, entry] of declarationById(targetDeclaration, group)) declared.set(id, entry);
  }
  const active = new Set<string>();
  const chain: string[] = [];
  const schemas: Record<string, unknown> = Object.create(null);
  let failure: ResolverError | null = null;
  let container = false;
  let baseId: string | undefined;
  const visit = (id: string): void => {
    if (failure !== null) return;
    if (active.has(id)) { failure = { error: "cycle", chain: [...chain, id] }; return; }
    // Repeated ancestry in a diamond is already merged; active detects cycles.
    if (chain.includes(id)) return;
    active.add(id); chain.push(id);
    const native = declared.get(id);
    const definition = native ?? typeDefinitions?.[id];
    if (!isRecord(definition)) { failure = { error: "unknown", chain: [...chain] }; return; }
    if (native === undefined && definition["profile"] !== targetDeclaration["id"]) {
      failure = { error: "unknown", chain: [...chain] }; return;
    }
    if (native !== undefined && baseId === undefined) baseId = id;
    if (native?.["container"] === true) container = true;
    const parents = native !== undefined ? (native["supertypes"] ?? []) : [refinementBaseOf(definition)];
    if (!Array.isArray(parents) || parents.some(parent => typeof parent !== "string")) {
      failure = { error: "unknown", chain: [...chain] }; return;
    }
    for (const parent of parents) visit(parent as string);
    if (failure !== null) return;
    const attributes = refinementAttrsOf(definition);
    // Native relation/port declarations can omit an empty attributes list.
    if (attributes === null && !(native !== undefined && native["attributes"] === undefined)) {
      failure = { error: "conflict", attribute: "<attributes>", baseType: baseId ?? id }; return;
    }
    for (const name of Object.keys(attributes ?? {}).sort()) {
      const schema = attributes![name];
      if (schemas[name] !== undefined && !sameKindBoundsCompatible(schemas[name], schema)) {
        failure = { error: "conflict", attribute: name, baseType: baseId ?? id }; return;
      }
      schemas[name] = schema;
    }
    active.delete(id);
  };
  visit(typeId);
  if (failure !== null) return { ok: false, failure };
  if (baseId === undefined) return { ok: false, failure: { error: "unknown", chain } };
  if (declared.get(typeId)?.["abstract"] === true) {
    return { ok: false, failure: { error: "conflict", attribute: "<abstract>", baseType: baseId } };
  }
  const attrs: Record<string, { kind: string }> = Object.create(null);
  for (const [name, schema] of Object.entries(schemas)) attrs[name] = schema as { kind: string };
  return { ok: true, effective: { baseId, chain, container, abstractBase: declared.get(baseId)?.["abstract"] === true, attrs } };
}

/** Promote compatible overlaps, retaining native arrays for residual fields. */
function promoteRefinements(
  declaration: Record<string, unknown>, definitions: Record<string, unknown>,
  ops: MigrationOperation[], declared: Set<string>,
): { path: string } | null {
  for (const id of sortedKeys(definitions)) {
    const definition = definitions[id];
    if (!isRecord(definition) || definition["profile"] !== declaration["id"]) continue;
    const resolved = resolveEffectiveType(declaration, definitions, id);
    if (!resolved.ok) {
      const attribute = resolved.failure.error === "conflict" ? resolved.failure.attribute : "baseType";
      return { path: `typeDefinitions.${id}.attributes.${attribute}` };
    }
    const baseId = refinementBaseOf(definition)!;
    // Resolving an abstract parent through its concrete refinement is allowed.
    const parent = resolveEffectiveType(declaration, definitions, baseId);
    const inherited = parent.ok ? parent.effective.attrs : Object.create(null);
    const attrs = definition["attributes"] as Record<string, unknown>[];
    const residual = attrs.filter(schema => inherited[schema["name"] as string] === undefined);
    if (residual.length !== attrs.length) {
      definitions[id] = { ...definition, attributes: residual };
      ops.push({ path: `typeDefinitions.${id}.attributes`, action: "promote-compatible-overlap", detail: "§3.13.1 step 2" });
      for (const schema of attrs) {
        if (inherited[schema["name"] as string] !== undefined) declared.add(patchPath("typeDefinitions", id, "attributes", schema["name"] as string));
      }
    }
  }
  return null;
}

/** Empty promoted refinements retire only after all records have destinations. */
function rebasePromotedRefinements(
  definitions: Record<string, unknown>, entities: Record<string, MigEntity>, relations: Record<string, MigRelation>,
  ports: Record<string, unknown>, owner: string, ops: MigrationOperation[], declared: Set<string>,
): void {
  const retired = new Map<string, string>();
  for (const id of sortedKeys(definitions)) {
    const definition = definitions[id];
    if (isRecord(definition) && definition["profile"] === owner && Array.isArray(definition["attributes"]) && definition["attributes"].length === 0) {
      retired.set(id, refinementBaseOf(definition)!);
    }
  }
  const destination = (id: string): string => { while (retired.has(id)) id = retired.get(id)!; return id; };
  for (const id of sortedKeys(definitions)) {
    if (retired.has(id)) {
      delete definitions[id];
      ops.push({ path: `typeDefinitions.${id}`, action: "retire-promoted-refinement", detail: `§3.13.1 step 2: →${destination(id)}` });
      declared.add(patchPath("typeDefinitions", id));
      continue;
    }
    const definition = definitions[id];
    if (!isRecord(definition) || definition["profile"] !== owner || typeof definition["baseType"] !== "string") continue;
    const baseType = destination(definition["baseType"]);
    if (baseType !== definition["baseType"]) {
      definitions[id] = { ...definition, baseType };
      ops.push({ path: `typeDefinitions.${id}.baseType`, action: "rebase-residual-refinement", detail: "§3.13.1 step 2" });
      declared.add(patchPath("typeDefinitions", id, "baseType"));
    }
  }
  for (const id of sortedKeys(ports)) {
    const port = ports[id];
    if (!isRecord(port) || port["profile"] !== owner || typeof port["type"] !== "string") continue;
    const type = destination(port["type"]);
    if (type !== port["type"]) {
      ports[id] = { ...port, type };
      declared.add(patchPath("ports", id, "type"));
      ops.push({ path: `ports.${id}.type`, action: "rebase-promoted-type", detail: "§3.13.1 step 2" });
    }
  }
  for (const [kind, records] of [["entities", entities], ["relations", relations]] as const) {
    for (const id of sortedKeys(records)) {
      const record = records[id]!;
      if (record.profile !== owner) continue;
      const type = destination(record.type);
      if (type !== record.type) {
        records[id] = { ...record, type } as MigEntity & MigRelation;
        ops.push({ path: `${kind}.${id}.type`, action: "rebase-promoted-type", detail: "§3.13.1 step 2" });
        declared.add(patchPath(kind, id, "type"));
      }
    }
  }
}

/**
 * Value-kind overlap check: an entity attribute whose name is declared by
 * the effective schema must carry that kind. Attributes under a declared
 * conversion (presentation slots, collapsed, multiplicity, stereotypes,
 * stereotype extends, derived layer/aspect/name) are exempt — they have
 * their own conversion path.
 */
function checkValueKindOverlap(
  attributes: Readonly<Record<string, MigAttribute>>,
  effective: EffectiveType,
  exempt: ReadonlySet<string>,
): { readonly attribute: string; readonly baseType: string } | null {
  for (const [name, attr] of sortedAttributes(attributes)) {
    if (exempt.has(name)) continue;
    const schema = effective.attrs[name];
    if (schema !== undefined && attr.kind !== schema.kind) {
      return { attribute: name, baseType: effective.baseId };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Lossless audit: every source leaf is present unchanged in the target or
// covered by a declared patch path. Operates over the transaction inputs
// (semantic document plus retained views) and the committed target.
// ---------------------------------------------------------------------------

/** Segment encoding prevents ids/attribute names containing dots from aliasing. */
export function patchPath(...segments: readonly (string | number)[]): string {
  return canonicalBytes(segments.map(String));
}

function collectLeaves(value: unknown, path: readonly string[], out: Map<string, string>): void {
  if (typeof value !== "object" || value === null) {
    out.set(canonicalBytes(["leaf", ...path]), canonicalBytes(value));
    return;
  }
  const isArray = Array.isArray(value);
  out.set(canonicalBytes(["shape", ...path]), isArray ? "array" : "object");
  if (isArray) {
    const byView = path.length === 1 && path[0] === "views";
    const bySchema = path.length === 3 && path[0] === "typeDefinitions" && path[2] === "attributes";
    value.forEach((item, index) => {
      const key = byView && isRecord(item) ? String(item["viewId"])
        : bySchema && isRecord(item) ? String(item["name"]) : String(index);
      collectLeaves(item, [...path, key], out);
    });
  } else {
    for (const key of Object.keys(value).sort()) collectLeaves((value as Record<string, unknown>)[key], [...path, key], out);
  }
}

function auditStateLeaves(state: MigDocument): Map<string, string> {
  const out = new Map<string, string>();
  collectLeaves(state, [], out);
  return out;
}

/** Complete bidirectional audit. Only views/declaration sets ignore array order;
 * every other value, path and object/array distinction remains observable.
 */
export function auditMigrationLoss(source: MigDocument, target: MigDocument, declared: ReadonlySet<string>): string | null {
  const original = auditStateLeaves(source), candidate = auditStateLeaves(target);
  const patches = [...declared].map(path => JSON.parse(path) as string[]);
  const prefix = (parent: readonly string[], child: readonly string[]): boolean => parent.length <= child.length && parent.every((key, index) => child[index] === key);
  for (const auditKey of [...new Set([...original.keys(), ...candidate.keys()])].sort()) {
    if (original.get(auditKey) === candidate.get(auditKey)) continue;
    const [kind, ...path] = JSON.parse(auditKey) as string[];
    const covered = patches.some(patch => prefix(patch, path) ||
      (!original.has(auditKey) && kind === "shape" && prefix(path, patch)));
    if (!covered) return path.join(".");
  }
  return null;
}

/** Single atomic commit boundary, also exercised with corrupted candidates. */
export function commitMigration(candidate: MigrationSuccess, declared: ReadonlySet<string>): MigrationReport {
  const loss = auditMigrationLoss(candidate.originalCanonical, candidate.target, declared);
  if (loss !== null) {
    return refuse(candidate.migrationId, candidate.from, candidate.to, candidate.originalCanonical,
      [...candidate.operations], [{ path: loss, reason: "incompatible-attribute-schema", detail: `undeclared-path-loss:${loss}` }]);
  }
  const failure = checkSourceViews(candidate.target);
  if (failure !== null) return refuse(candidate.migrationId, candidate.from, candidate.to, candidate.originalCanonical,
    [...candidate.operations], [{ path: failure, reason: "incompatible-attribute-schema" }]);
  return candidate;
}

// ---------------------------------------------------------------------------
// Retained-view validation against the pinned ViewDocument shape (spec
// §§2.2/3.2.2/4.4.2): closed field sets, occurrence bindings, complete
// presentation values and provenance pairing. A view that fails refuses
// before any write (design note, section B).
// ---------------------------------------------------------------------------

const VIEW_TOP_FIELDS: ReadonlySet<string> = new Set([
  "viewId", "semanticDocumentId", "revision",
  "entityOccurrences", "relationOccurrences", "portOccurrences",
  "groups", "filters", "presentation", "summaryLabels",
]);
const OCCURRENCE_FIELDS: ReadonlySet<string> = new Set(["id", "entity", "group", "geometry", "z"]);
const REL_OCCURRENCE_FIELDS: ReadonlySet<string> = new Set(["id", "relation", "endpoints", "waypoints", "strokeStyle"]);
const ENDPOINT_FIELDS: ReadonlySet<string> = new Set(["role", "occurrence", "semanticTarget", "sourceOccurrence"]);
const PORT_OCCURRENCE_FIELDS: ReadonlySet<string> = new Set(["id", "port", "ownerOccurrence", "side", "order", "anchor", "geometry"]);
const GROUP_FIELDS: ReadonlySet<string> = new Set(["id", "label", "collapsed", "occurrence"]);
const FILTER_FIELDS: ReadonlySet<string> = new Set(["id", "kind", "types", "attribute", "value", "mode"]);
const PRESENTATION_FIELDS: ReadonlySet<string> = new Set(["camera", "grid", "theme", "diagram"]);
const DIAGRAM_FIELDS: ReadonlySet<string> = new Set(["contractPin", "entities", "legends", "categoryTokens"]);
const ENTITY_PRESENTATION_FIELDS: ReadonlySet<string> = new Set(["form", "text", "icon", "categoryRef"]);
const TEXT_SLOT_FIELDS: ReadonlySet<string> = new Set(["title", "kicker", "body", "detail", "subtitle", "footer"]);
const SUMMARY_DEFINITION_FIELDS: ReadonlySet<string> = new Set([
  "id", "sourceOccurrence", "targetOccurrence", "label", "relationIds", "strokeStyle", "relationOccurrences",
]);

function closedKeys(value: unknown, allowed: ReadonlySet<string>): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return "<record>";
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    if (!allowed.has(key)) return key;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Structural validation of one committed retained view. Returns the first
 * offending path, or null when the view holds the pinned shape.
 */
export function checkRetainedView(view: MigView, entities: Readonly<Record<string, MigEntity>>): string | null {
  if (!isRecord(view)) return "views.<record>";
  const shape = checkViewShape(view);
  if (shape !== null) return `views.${view.viewId}.${shape}`;
  const top = closedKeys(view as unknown as Record<string, unknown>, VIEW_TOP_FIELDS);
  if (top !== null) return `views.${view.viewId}.${top}`;
  if (typeof view.viewId !== "string" || view.viewId.length === 0) return `views.${view.viewId}.viewId`;
  if (typeof view.semanticDocumentId !== "string" || view.semanticDocumentId.length === 0) {
    return `views.${view.viewId}.semanticDocumentId`;
  }
  if (!Number.isInteger(view.revision) || (view.revision as number) < 0) return `views.${view.viewId}.revision`;
  for (const occId of sortedKeys(view.entityOccurrences as unknown as Readonly<Record<string, unknown>> | undefined)) {
    const occ = (view.entityOccurrences as Readonly<Record<string, unknown>>)[occId];
    if (!isRecord(occ)) return `views.${view.viewId}.entityOccurrences.${occId}`;
    const bad = closedKeys(occ, OCCURRENCE_FIELDS);
    if (bad !== null) return `views.${view.viewId}.entityOccurrences.${occId}.${bad}`;
    if (occ["id"] !== occId) return `views.${view.viewId}.entityOccurrences.${occId}.id`;
    if (typeof occ["entity"] !== "string" || entities[occ["entity"] as string] === undefined) {
      return `views.${view.viewId}.entityOccurrences.${occId}.entity`;
    }
  }
  const relOccs = (view.relationOccurrences ?? {}) as Readonly<Record<string, unknown>>;
  for (const occId of sortedKeys(relOccs)) {
    const occ = relOccs[occId];
    if (!isRecord(occ)) return `views.${view.viewId}.relationOccurrences.${occId}`;
    const bad = closedKeys(occ, REL_OCCURRENCE_FIELDS);
    if (bad !== null) return `views.${view.viewId}.relationOccurrences.${occId}.${bad}`;
    const endpoints = occ["endpoints"];
    if (!Array.isArray(endpoints)) return `views.${view.viewId}.relationOccurrences.${occId}.endpoints`;
    endpoints.forEach((endpoint, index) => {
      if (!isRecord(endpoint)) return;
      void index;
    });
    for (let index = 0; index < endpoints.length; index++) {
      const endpoint = endpoints[index] as unknown;
      if (!isRecord(endpoint)) return `views.${view.viewId}.relationOccurrences.${occId}.endpoints.${index}`;
      const badEndpoint = closedKeys(endpoint, ENDPOINT_FIELDS);
      if (badEndpoint !== null) return `views.${view.viewId}.relationOccurrences.${occId}.endpoints.${index}.${badEndpoint}`;
      if (typeof endpoint["role"] !== "string" || typeof endpoint["occurrence"] !== "string") {
        return `views.${view.viewId}.relationOccurrences.${occId}.endpoints.${index}`;
      }
      const hasTarget = endpoint["semanticTarget"] !== undefined;
      const hasSource = endpoint["sourceOccurrence"] !== undefined;
      if (hasTarget !== hasSource) return `views.${view.viewId}.relationOccurrences.${occId}.endpoints.${index}`;
    }
    const stroke = occ["strokeStyle"];
    if (stroke !== undefined && stroke !== "solid" && stroke !== "dashed") {
      return `views.${view.viewId}.relationOccurrences.${occId}.strokeStyle`;
    }
  }
  const portOccs = (view.portOccurrences ?? {}) as Readonly<Record<string, unknown>>;
  for (const occId of sortedKeys(portOccs)) {
    const occ = portOccs[occId];
    if (!isRecord(occ)) return `views.${view.viewId}.portOccurrences.${occId}`;
    const bad = closedKeys(occ, PORT_OCCURRENCE_FIELDS);
    if (bad !== null) return `views.${view.viewId}.portOccurrences.${occId}.${bad}`;
    if (occ["id"] !== occId) return `views.${view.viewId}.portOccurrences.${occId}.id`;
  }
  const groups = (view.groups ?? {}) as Readonly<Record<string, unknown>>;
  for (const groupId of sortedKeys(groups)) {
    const group = groups[groupId];
    if (!isRecord(group)) return `views.${view.viewId}.groups.${groupId}`;
    const bad = closedKeys(group, GROUP_FIELDS);
    if (bad !== null) return `views.${view.viewId}.groups.${groupId}.${bad}`;
    if (group["id"] !== groupId) return `views.${view.viewId}.groups.${groupId}.id`;
    const occurrence = group["occurrence"];
    if (occurrence !== undefined && (view.entityOccurrences as Readonly<Record<string, unknown>>)[occurrence as string] === undefined) {
      return `views.${view.viewId}.groups.${groupId}.occurrence`;
    }
  }
  for (let index = 0; index < (view.filters ?? []).length; index++) {
    const filter = (view.filters as readonly unknown[])[index];
    if (!isRecord(filter)) return `views.${view.viewId}.filters.${index}`;
    const bad = closedKeys(filter, FILTER_FIELDS);
    if (bad !== null) return `views.${view.viewId}.filters.${index}.${bad}`;
    if (typeof filter["kind"] !== "string") return `views.${view.viewId}.filters.${index}.kind`;
  }
  const presentation = view.presentation;
  if (presentation !== undefined) {
    if (!isRecord(presentation)) return `views.${view.viewId}.presentation`;
    const bad = closedKeys(presentation, PRESENTATION_FIELDS);
    if (bad !== null) return `views.${view.viewId}.presentation.${bad}`;
    const diagram = presentation["diagram"];
    if (diagram !== undefined) {
      const failed = checkDiagramValue(diagram, view.viewId);
      if (failed !== null) return failed;
    }
  }
  const summaries = (view as unknown as Record<string, unknown>)["summaryLabels"];
  if (summaries !== undefined) {
    if (!isRecord(summaries)) return `views.${view.viewId}.summaryLabels`;
    for (const summaryId of sortedKeys(summaries as Readonly<Record<string, unknown>>)) {
      const summary = (summaries as Readonly<Record<string, unknown>>)[summaryId];
      if (!isRecord(summary)) return `views.${view.viewId}.summaryLabels.${summaryId}`;
      const bad = closedKeys(summary, SUMMARY_DEFINITION_FIELDS);
      if (bad !== null) return `views.${view.viewId}.summaryLabels.${summaryId}.${bad}`;
    }
  }
  return null;
}

function checkSourceViews(source: MigDocument): string | null {
  const { views: _views, ...semantic } = source;
  const semanticFailure = checkSemanticShape(semantic);
  if (semanticFailure !== null) return semanticFailure;
  const seen = new Set<string>();
  if (source.views !== undefined && !Array.isArray(source.views)) return "views";
  for (const item of source.views ?? []) {
    if (!isRecord(item)) return "views.<record>";
    const view = item as unknown as MigView;
    if (seen.has(view.viewId)) return `views.${view.viewId}`;
    seen.add(view.viewId);
    const failure = checkRetainedView(view, source.entities);
    if (failure !== null) return failure;
    if (view.semanticDocumentId !== source.documentId || view.revision > source.revision) return `views.${view.viewId}.semanticDocumentId`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// View-schema composition boundary (SPEC §4.4 option (i), owner G1).
// Every retained view carries an explicit exact view-schema pin; views are
// converted by the separate view migration before profile preflight.
// ---------------------------------------------------------------------------

/**
 * Explicit per-view view-schema associations for a profile migration call.
 * Each retained view id maps to its exact authenticated view-schema pin.
 * An absent map entry never implies @2: it refuses at the gate. A call with
 * no retained view supplies an explicit empty set.
 */
export interface ProfileViewOptions {
  readonly viewSchemas: Readonly<Record<string, Pin>>;
}

/**
 * Pre-canonical boundary evidence for a profile source. When canonical
 * bytes cannot be formed (non-JSON runtime data, lone surrogates), no
 * profile `MigrationReport` is fabricated: the boundary refusal carries the
 * actual cause and the supplied original where available.
 */
function preCanonicalBoundary(source: MigDocument): BoundaryPreflightRefusal | null {
  try {
    canonicalBytes(source);
    return null;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const reason = detail.startsWith("invalid-unicode") ? "canonical-evidence-unavailable" : "non-json-input";
    return boundaryPreflightRefusal(reason, detail, source);
  }
}

/**
 * Exact-pin view-schema gate for every retained view (separate-list F2-a:
 * each cause reuses the existing `incompatible-attribute-schema` member with
 * a documented detail). The gate routes associations only — presence,
 * resolution, digest and version; the retained @2 shape itself stays with
 * the strict guard (`checkSourceViews`), which applies the identical
 * `checkViewShape` to the same views. Returns the first failure, or null
 * when every retained view carries an authenticated @2 association.
 */
function checkViewSchemaGates(source: MigDocument, viewSchemas: Readonly<Record<string, Pin>>): UnmigratedItem[] {
  const associations = viewSchemas;
  const failures: UnmigratedItem[] = [];
  for (const item of source.views ?? []) {
    const viewId = isRecord(item) && typeof item["viewId"] === "string" ? item["viewId"] : null;
    const path = viewId === null ? "views.<record>" : `views.${viewId}`;
    if (viewId === null || !Object.hasOwn(associations, viewId)) {
      failures.push({ path, reason: "incompatible-attribute-schema", detail: `view-schema association absent for retained view ${path}` });
      continue;
    }
    const pin = associations[viewId]!;
    const known = isRecord(pin) && pin["id"] === "diagram-view-schema"
      ? resolveViewSchemaVersion(typeof pin["version"] === "string" ? pin["version"] : "")
      : undefined;
    if (known === undefined) {
      failures.push({ path, reason: "incompatible-attribute-schema", detail: `unresolved/unsupported view-schema association ${describeAttemptedPin(pin)} for retained view ${path}` });
      continue;
    }
    if (known.digest !== (pin as Pin).contentDigest) {
      failures.push({ path, reason: "incompatible-attribute-schema", detail: `view-schema association digest mismatch for retained view ${path}` });
      continue;
    }
    if ((pin as Pin).version !== "2") {
      failures.push({ path, reason: "incompatible-attribute-schema", detail: `view conversion required before strict profile preflight for retained view ${path}` });
      continue;
    }
  }
  failures.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return failures;
}

function describeAttemptedPin(pin: unknown): string {
  if (!isRecord(pin)) return String(pin);
  return `${String(pin["id"])}/${String(pin["version"])}#${String(pin["contentDigest"])}`;
}

function checkDiagramValue(diagram: unknown, viewId: string): string | null {
  if (!isRecord(diagram)) return `views.${viewId}.presentation.diagram`;
  const bad = closedKeys(diagram, DIAGRAM_FIELDS);
  if (bad !== null) return `views.${viewId}.presentation.diagram.${bad}`;
  for (const field of ["contractPin", "entities", "legends", "categoryTokens"] as const) {
    if (diagram[field] === undefined) return `views.${viewId}.presentation.diagram.${field}`;
  }
  const pin = diagram["contractPin"];
  if (!isRecord(pin) || typeof pin["id"] !== "string" || typeof pin["version"] !== "string" || typeof pin["contentDigest"] !== "string") {
    return `views.${viewId}.presentation.diagram.contractPin`;
  }
  if (!/^[0-9a-f]{64}$/.test(pin["contentDigest"] as string)) {
    return `views.${viewId}.presentation.diagram.contractPin`;
  }
  if (!isRecord(diagram["entities"]) || !isRecord(diagram["legends"]) || !Array.isArray(diagram["categoryTokens"])) {
    return `views.${viewId}.presentation.diagram`;
  }
  for (const occId of sortedKeys(diagram["entities"] as Readonly<Record<string, unknown>>)) {
    const entry = (diagram["entities"] as Readonly<Record<string, unknown>>)[occId];
    if (!isRecord(entry)) return `views.${viewId}.presentation.diagram.entities.${occId}`;
    const badEntry = closedKeys(entry, ENTITY_PRESENTATION_FIELDS);
    if (badEntry !== null) return `views.${viewId}.presentation.diagram.entities.${occId}.${badEntry}`;
    if (!isRecord(entry["text"])) return `views.${viewId}.presentation.diagram.entities.${occId}.text`;
    const badText = closedKeys(entry["text"], TEXT_SLOT_FIELDS);
    if (badText !== null) return `views.${viewId}.presentation.diagram.entities.${occId}.text.${badText}`;
    if (entry["icon"] !== undefined && !ICON_VALUE.test(entry["icon"] as string)) {
      return `views.${viewId}.presentation.diagram.entities.${occId}.icon`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Multiplicity parser (spec §3.11): n, n..m, n..* and * only, no trimming
// ---------------------------------------------------------------------------

export type MultiplicityParse =
  | { readonly ok: true; readonly lower: number; readonly upper: number }
  | { readonly ok: false; readonly reason: "multiplicity-syntax" | "multiplicity-invalid" };

const SAFE_MAX = 9007199254740991;

export function parseMultiplicity(raw: string): MultiplicityParse {
  if (raw === "*") return { ok: true, lower: 0, upper: -1 };
  const m = /^([0-9]+)(\.\.(\*|[0-9]+))?$/.exec(raw);
  if (m === null) return { ok: false, reason: "multiplicity-syntax" };
  const lower = Number(m[1]);
  const upper = m[3] === undefined ? lower : m[3] === "*" ? -1 : Number(m[3]);
  if (lower > SAFE_MAX || (upper !== -1 && upper > SAFE_MAX)) return { ok: false, reason: "multiplicity-syntax" };
  if (upper !== -1 && lower > upper) return { ok: false, reason: "multiplicity-invalid" };
  return { ok: true, lower, upper };
}

export function multiplicityStruct(lower: number, upper: number): MigAttribute {
  return {
    kind: "struct", type: "multiplicity",
    fields: {
      lower: { kind: "quantity", value: lower, unit: "unit" },
      upper: { kind: "quantity", value: upper, unit: "unit" },
    },
  };
}

// ---------------------------------------------------------------------------
// generic@1 → generic@2 (spec §3.13.1)
// ---------------------------------------------------------------------------

export const GENERIC_MIGRATION_ID = "engram:migration-generic-1-2" as const;

/** Explicitly authorized presentation slots and their view bounds (§3.2.2). */
const TEXT_SLOT_BOUNDS: Readonly<Record<string, number>> = {
  kicker: 80, body: 400, detail: 400, subtitle: 600, footer: 120,
};
const TEXT_SLOT_NAMES: readonly string[] = Object.keys(TEXT_SLOT_BOUNDS).sort();
const ICON_SLOT = "icon" as const;
const ICON_MAX = 40;
const ICON_VALUE = /^[a-z][a-z0-9-]*$/;

export interface GenericMigrationOptions extends ProfileViewOptions {
  /** Retained views for this transaction; defaults to source.views (§3.13). */
  readonly views?: readonly MigView[];
  readonly seedFolds?: boolean;
  /** Pinned presentation contract the moved slots are validated against. */
  readonly contractPin?: Pin;
}

function formForEntityType(type: string): string {
  if (type === "container") return "container";
  if (type === "legend") return "legend";
  if (type === "legend-key") return "legend-key";
  return "card";
}

function groupIdForOccurrence(occurrenceId: string): string {
  const local = occurrenceId.includes(":") ? occurrenceId.slice(occurrenceId.lastIndexOf(":") + 1) : occurrenceId;
  return `grp.${local.length}.${local}`;
}

interface TextMove {
  readonly kind: "text";
  readonly slot: string;
  readonly value: string;
}

interface IconMove {
  readonly kind: "icon";
  readonly value: string;
}

type SlotMove = TextMove | IconMove;

export function migrateGenericV1ToV2(source: MigDocument, options: GenericMigrationOptions): MigrationReport | BoundaryPreflightRefusal {
  if (!isRecord(source)) return boundaryPreflightRefusal("non-json-input", "profile source is not a JSON object", source);
  const boundary = preCanonicalBoundary(source);
  if (boundary !== null) return boundary;
  source = transactionSnapshot(source, options.views);
  const from: Pin = { id: "generic", version: "1.0.0", contentDigest: GENERIC_V1_CONTENT };
  const to: Pin = { id: "generic", version: "2.0.0", contentDigest: GENERIC_V2.contentDigest };
  const ops: MigrationOperation[] = [];
  const declared = new Set<string>();
  const fail = (path: string, reason: MigrationRefusalReason, detail?: string): MigrationRefusal =>
    refuse(GENERIC_MIGRATION_ID, from, to, source, ops,
      detail === undefined ? [{ path, reason }] : [{ path, reason, detail }]);

  const viewGate = checkViewSchemaGates(source, options.viewSchemas);
  if (viewGate.length > 0) {
    return refuse(GENERIC_MIGRATION_ID, from, to, source, ops,
      viewGate as [UnmigratedItem, ...UnmigratedItem[]]);
  }
  const sourceViewFailure = checkSourceViews(source);
  if (sourceViewFailure !== null) return fail(sourceViewFailure, "incompatible-attribute-schema");
  const refs = [...source.profileRefs];
  if (refs.filter((r) => r === "generic@1").length !== 1) {
    return fail("", refs.includes("generic@2") ? "target-already-present" : "missing-source-profile");
  }
  if (refs.includes("generic@2")) return fail("", "target-already-present");
  const nextRefs = refs.map((r) => (r === "generic@1" ? "generic@2" : r));
  ops.push({ path: "profileRefs", action: "replace-profile-ref", detail: "generic@1→generic@2" });
  nextRefs.forEach((ref, index) => {
    if (ref !== refs[index]) declared.add(patchPath("profileRefs", index));
  });

  const targetDecl = GENERIC_V2.declaration as Record<string, unknown>;
  const reserved = governedIds(targetDecl);
  const nextDefinitions: Record<string, unknown> = Object.create(null);
  for (const id of sortedKeys(source.typeDefinitions)) {
    if (reserved.has(id)) return fail(`typeDefinitions.${id}`, "incompatible-attribute-schema");
    const definition = structuredClone(source.typeDefinitions![id]);
    const rebased = rewriteRecordProfile(definition, "generic@1", "generic@2");
    const cleaned = isRecord(definition) && definition["profile"] === "generic@1"
      ? stripMigratedSlots(rebased, ["typeDefinitions", id], ops, declared) : definition;
    nextDefinitions[id] = cleaned;
    ops.push({ path: `typeDefinitions.${id}`, action: "preserve-residual-refinement" });
    if ((definition as Record<string, unknown>)["profile"] === "generic@1") {
      declared.add(patchPath("typeDefinitions", id, "profile"));
    }
  }

  const refinementFailure = promoteRefinements(targetDecl, nextDefinitions, ops, declared);
  if (refinementFailure !== null) return fail(refinementFailure.path, "type-definition-conflict", "incompatible-attribute-schema");

  // Retained views for this transaction. Moves are keyed by
  // (view id, occurrence id): two views may reuse an occurrence id for
  // different entities, and each view keeps its own entity's strings.
  const retainedViews = source.views ?? [];
  const movesByView = new Map<string, Map<string, SlotMove[]>>();
  for (const view of retainedViews) {
    const perOcc = new Map<string, SlotMove[]>();
    for (const occId of sortedKeys(view.entityOccurrences as unknown as Readonly<Record<string, unknown>> | undefined)) {
      const occ = view.entityOccurrences[occId]!;
      const entity = source.entities[occ.entity];
      if (entity === undefined) {
        return fail(`views.${view.viewId}.entityOccurrences.${occId}.entity`, "incompatible-attribute-schema");
      }
      // Only the source-family declarations move; unrelated profiles and
      // their domain attributes are left untouched (§3.13.3).
      if (entity.profile !== "generic@1") continue;
      const slotMoves: SlotMove[] = [];
      for (const slot of TEXT_SLOT_NAMES) {
        const attr = entity.attributes[slot];
        if (attr === undefined) continue;
        const value = getText(attr);
        if (value === null) return fail(`entities.${entity.id}.attributes.${slot}`, "incompatible-attribute-schema");
        if (value.length > TEXT_SLOT_BOUNDS[slot]!) {
          return fail(`entities.${entity.id}.attributes.${slot}`, "incompatible-attribute-schema");
        }
        slotMoves.push({ kind: "text", slot, value });
      }
      const iconAttr = entity.attributes[ICON_SLOT];
      if (iconAttr !== undefined) {
        const value = getText(iconAttr);
        if (value === null || value.length > ICON_MAX || !ICON_VALUE.test(value)) {
          return fail(`entities.${entity.id}.attributes.${ICON_SLOT}`, "incompatible-attribute-schema");
        }
        slotMoves.push({ kind: "icon", value });
      }
      if (slotMoves.length > 0) perOcc.set(occId, slotMoves);
    }
    movesByView.set(view.viewId, perOcc);
  }
  let moveCount = 0;
  for (const perOcc of movesByView.values()) moveCount += perOcc.size;
  // Every presentation slot needs a retained occurrence destination: an
  // entity carrying slots with no drawing refuses before any rewrite.
  const occurrenceCount = new Map<string, number>();
  for (const view of retainedViews) {
    for (const occId of sortedKeys(view.entityOccurrences as unknown as Readonly<Record<string, unknown>> | undefined)) {
      const entityId = view.entityOccurrences[occId]!.entity;
      occurrenceCount.set(entityId, (occurrenceCount.get(entityId) ?? 0) + 1);
    }
  }
  for (const id of sortedKeys(source.entities)) {
    const entity = source.entities[id]!;
    if (entity.profile !== "generic@1") continue;
    for (const slot of [...TEXT_SLOT_NAMES, ICON_SLOT]) {
      if (entity.attributes[slot] !== undefined && (occurrenceCount.get(id) ?? 0) === 0) {
        return fail(`entities.${id}.attributes.${slot}`, "missing-presentation-destination");
      }
    }
  }
  if (moveCount > 0 && options.contractPin === undefined) {
    return fail("presentation.contractPin", "missing-presentation-contract");
  }
  if (options.contractPin !== undefined && moveCount > 0) {
    const pin = options.contractPin;
    if (typeof pin.id !== "string" || typeof pin.version !== "string" || !/^[0-9a-f]{64}$/.test(pin.contentDigest)) {
      return fail("presentation.contractPin", "missing-presentation-contract");
    }
    ops.push({
      path: "presentation.contractPin",
      action: "bind-presentation-contract",
      detail: `${pin.id}/${pin.version}`,
    });

  }

  // Entity conversion over a deep copy: only declared paths change.
  // Refinements resolve through the shared resolver; compatible overlaps
  // promote, incompatible overlaps refuse, additional domain attributes
  // are retained unchanged on the migrated record.
  const conversionExempt = new Set<string>([...TEXT_SLOT_NAMES, ICON_SLOT, "collapsed"]);
  const entities: Record<string, MigEntity> = {};
  const foldSeeds: string[] = [];
  for (const id of sortedKeys(source.entities)) {
    const entity = source.entities[id]!;
    if (entity.profile !== "generic@1") {
      entities[id] = structuredClone(entity);
      continue;
    }
    const resolved = resolveEffectiveType(targetDecl, nextDefinitions, entity.type);
    if (!resolved.ok) {
      if (resolved.failure.error === "conflict") {
        return fail(`entities.${id}.attributes.${resolved.failure.attribute}`, "type-definition-conflict", "incompatible-attribute-schema");
      }
      return fail(`entities.${id}.type`, "incompatible-attribute-schema");
    }
    const overlap = checkValueKindOverlap(entity.attributes, resolved.effective, conversionExempt);
    if (overlap !== null) {
      return fail(`entities.${id}.attributes.${overlap.attribute}`, "type-definition-conflict", "incompatible-attribute-schema");
    }
    const nextAttrs: Record<string, MigAttribute> = structuredClone(entity.attributes) as Record<string, MigAttribute>;
    const moved = new Set<string>();
    for (const [key, value] of sortedAttributes(entity.attributes)) {
      if (TEXT_SLOT_NAMES.includes(key) || key === ICON_SLOT) {
        moved.add(key);
        delete nextAttrs[key];
        continue;
      }
      if (key === "collapsed" && resolved.effective.container) { delete nextAttrs[key]; continue; }
      nextAttrs[key] = structuredClone(value);
    }
    for (const slot of [...moved].sort()) {
      ops.push({ path: `entities.${id}.attributes.${slot}`, action: "move-to-view-presentation", detail: "per-view occurrence destinations" });
      declared.add(patchPath("entities", id, "attributes", slot));
    }
    if (resolved.effective.container && entity.attributes["collapsed"] !== undefined) {
      const collapsed = entity.attributes["collapsed"];
      const state = collapsed.value === true ? "was-true" : collapsed.value === false ? "was-false" : "was-absent";
      ops.push({ path: `entities.${id}.attributes.collapsed`, action: "remove-semantic-collapsed", detail: state });
      declared.add(patchPath("entities", id, "attributes", "collapsed"));
      if (collapsed.value === true && options.seedFolds === true) {
        for (const view of retainedViews) {
          for (const occId of sortedKeys(view.entityOccurrences as unknown as Readonly<Record<string, unknown>> | undefined)) {
            if (view.entityOccurrences[occId]!.entity === id) foldSeeds.push(`${view.viewId}/${occId}`);
          }
        }
      }
    } else if (resolved.effective.container) {
      ops.push({ path: `entities.${id}.attributes.collapsed`, action: "remove-semantic-collapsed", detail: "was-absent" });
    }
    for (const [key] of sortedAttributes(nextAttrs)) {
      if (resolved.effective.attrs[key] === undefined) {
        ops.push({ path: `entities.${id}.attributes.${key}`, action: "retain-domain-attribute", detail: "present-unchanged" });
      }
    }
    entities[id] = { ...structuredClone(entity), profile: "generic@2", attributes: nextAttrs };
    ops.push({ path: `entities.${id}.profile`, action: "rewrite-profile", detail: "generic@1→generic@2" });
    declared.add(patchPath("entities", id, "profile"));
  }

  const relations: Record<string, MigRelation> = {};
  let linkBoundRecorded = false;
  for (const id of sortedKeys(source.relations)) {
    const rel = source.relations[id]!;
    if (rel.profile !== "generic@1") {
      relations[id] = structuredClone(rel);
      continue;
    }
    if (!Array.isArray(rel.endpoints)) return fail(`relations.${id}.endpoints`, "incompatible-attribute-schema");
    for (let index = 0; index < rel.endpoints.length; index++) {
      const endpoint = rel.endpoints[index]!;
      if (typeof endpoint.role !== "string" || typeof endpoint.target !== "string") {
        return fail(`relations.${id}.endpoints.${index}`, "incompatible-attribute-schema");
      }
    }
    const nextAttrs: Record<string, MigAttribute> = structuredClone(rel.attributes) as Record<string, MigAttribute>;
    for (const [k, v] of sortedAttributes(rel.attributes)) nextAttrs[k] = structuredClone(v);
    relations[id] = { ...structuredClone(rel), profile: "generic@2", attributes: nextAttrs };
    ops.push({ path: `relations.${id}.profile`, action: "rewrite-profile", detail: "generic@1→generic@2" });
    declared.add(patchPath("relations", id, "profile"));
    if (rel.type === "link" && !linkBoundRecorded) {
      linkBoundRecorded = true;
      ops.push({ path: "relations.*.attributes.label", action: "record-bound-change", detail: "link.label 120→200; values never rewritten" });
    }
  }

  const ports: Record<string, unknown> = {};
  for (const id of sortedKeys(source.ports as Readonly<Record<string, unknown>> | undefined)) {
    const port = (source.ports as Record<string, unknown>)[id]!;
    const cloned = structuredClone(port);
    const next = rewriteRecordProfile(cloned, "generic@1", "generic@2");
    ports[id] = next;
    if (isRecord(port) && port["profile"] === "generic@1") {
      ops.push({ path: `ports.${id}.profile`, action: "rewrite-profile", detail: "generic@1→generic@2" });
      declared.add(patchPath("ports", id, "profile"));
    }
  }

  rebasePromotedRefinements(nextDefinitions, entities, relations, ports, "generic@2", ops, declared);

  // Commit the moves into the retained views: clone every retained view,
  // place each slot in its typed presentation field (text slots under
  // text, icon under icon — never text), complete the pinned diagram
  // value, refuse atomically on a conflicting destination value, then
  // commit requested fold groups per view.
  const presentationMoves: Record<string, Record<string, unknown>> = {};
  const migratedViews: MigView[] = [];
  const sortedViews = [...retainedViews].sort((a, b) => (a.viewId < b.viewId ? -1 : a.viewId > b.viewId ? 1 : 0));
  for (const view of sortedViews) {
    const cloned = structuredClone(view) as unknown as Record<string, unknown>;
    const perOcc = movesByView.get(view.viewId) ?? new Map<string, SlotMove[]>();
    if (perOcc.size > 0) {
      const presentation = (cloned["presentation"] as Record<string, unknown> | undefined) ?? {};
      const existingDiagram = presentation["diagram"];
      if (existingDiagram !== undefined && !isRecord(existingDiagram)) {
        return fail(`views.${view.viewId}.presentation.diagram`, "incompatible-attribute-schema");
      }
      const diagram = { ...(isRecord(existingDiagram) ? existingDiagram : {}) } as Record<string, unknown>;
      const knownDiagramKeys = new Set(["contractPin", "entities", "legends", "categoryTokens"]);
      for (const key of Object.keys(diagram).sort()) {
        if (!knownDiagramKeys.has(key)) return fail(`views.${view.viewId}.presentation.diagram.${key}`, "incompatible-attribute-schema");
      }
      if (diagram["contractPin"] !== undefined && canonicalBytes(diagram["contractPin"]) !== canonicalBytes(options.contractPin)) {
        return fail(`views.${view.viewId}.presentation.diagram.contractPin`, "destination-conflict");
      }
      diagram["contractPin"] = { ...options.contractPin! };
      declared.add(patchPath("views", view.viewId, "presentation", "diagram", "contractPin"));
      const diagramEntities = { ...((diagram["entities"] as Record<string, Record<string, unknown>>) ?? {}) };
      for (const occId of [...perOcc.keys()].sort()) {
        if (view.entityOccurrences[occId] === undefined) continue;
        const slotMoves = perOcc.get(occId)!;
        const existing = { ...(diagramEntities[occId] ?? {}) } as Record<string, unknown>;
        const existingText = { ...((existing["text"] as Record<string, unknown>) ?? {}) };
        const reportSlots: Record<string, unknown> = {};
        for (const move of slotMoves) {
          if (move.kind === "text") {
            if (existingText[move.slot] !== undefined && existingText[move.slot] !== move.value) {
              return fail(`views.${view.viewId}.presentation.diagram.entities.${occId}.text.${move.slot}`, "destination-conflict");
            }
            existingText[move.slot] = move.value;
            reportSlots[move.slot] = move.value;
          } else {
            if (existing["icon"] !== undefined && existing["icon"] !== move.value) {
              return fail(`views.${view.viewId}.presentation.diagram.entities.${occId}.icon`, "destination-conflict");
            }
            existing["icon"] = move.value;
            reportSlots[ICON_SLOT] = move.value;
          }
        }
        diagramEntities[occId] = {
          ...existing,
          form: existing["form"] ?? (() => {
            const entity = entities[view.entityOccurrences[occId]!.entity]!;
            const resolved = resolveEffectiveType(targetDecl, nextDefinitions, entity.type);
            return formForEntityType(resolved.ok ? resolved.effective.baseId : entity.type);
          })(),
          text: existingText,
        };
        presentationMoves[`${view.viewId}/${occId}`] = reportSlots;
        if (existing["form"] === undefined) declared.add(patchPath("views", view.viewId, "presentation", "diagram", "entities", occId, "form"));
        if (slotMoves.every(move => move.kind === "icon") && existing["text"] === undefined) declared.add(patchPath("views", view.viewId, "presentation", "diagram", "entities", occId, "text"));
        for (const move of slotMoves) {
          ops.push({ path: `views.${view.viewId}.presentation.diagram.entities.${occId}.${move.kind === "icon" ? "icon" : "text." + move.slot}`, action: "write-presentation-slot", detail: `entities.${view.entityOccurrences[occId]!.entity}.attributes.${move.kind === "icon" ? "icon" : move.slot}`, specRef: "§3.13.1 step 4" });
          declared.add(patchPath("views", view.viewId, "presentation", "diagram", "entities", occId, ...(move.kind === "icon" ? ["icon"] : ["text", move.slot])));
        }
      }
      diagram["entities"] = diagramEntities;
      if (diagram["legends"] === undefined) { diagram["legends"] = {}; declared.add(patchPath("views", view.viewId, "presentation", "diagram", "legends")); }
      if (diagram["categoryTokens"] === undefined) { diagram["categoryTokens"] = []; declared.add(patchPath("views", view.viewId, "presentation", "diagram", "categoryTokens")); }
      presentation["diagram"] = diagram;
      cloned["presentation"] = presentation;
    }
    if (options.seedFolds === true) {
      const groups = { ...((cloned["groups"] as Record<string, MigGroup>) ?? {}) };
      for (const occId of sortedKeys(view.entityOccurrences as unknown as Readonly<Record<string, unknown>> | undefined)) {
        const qualified = `${view.viewId}/${occId}`;
        if (!foldSeeds.includes(qualified)) continue;
        const groupId = groupIdForOccurrence(occId);
        const existing = groups[groupId];
        if (existing !== undefined && existing.occurrence !== undefined && existing.occurrence !== occId) {
          return fail(`views.${view.viewId}.groups.${groupId}`, "destination-conflict");
        }
        groups[groupId] = { ...(existing ?? { id: groupId }), id: groupId, occurrence: occId, collapsed: true };
        ops.push({ path: `views.${view.viewId}.groups.${groupId}`, action: "seed-view-fold", detail: occId, specRef: "§3.13.1 step 5" });
        if (existing === undefined) declared.add(patchPath("views", view.viewId, "groups", groupId, "id"));
        declared.add(patchPath("views", view.viewId, "groups", groupId, "occurrence"));
        declared.add(patchPath("views", view.viewId, "groups", groupId, "collapsed"));
      }
      cloned["groups"] = groups;
    }
    migratedViews.push(cloned as unknown as MigView);
  }

  // Validate every retained view against the pinned shape before commit.
  const migratedEntities = entities;
  for (const view of migratedViews) {
    const failed = checkRetainedView(view, migratedEntities);
    if (failed !== null) return fail(failed, "incompatible-attribute-schema");
  }

  const target: MigDocument = {
    ...structuredClone(source),
    documentId: source.documentId, revision: source.revision, profileRefs: nextRefs,
    entities, relations,
    ...(source.ports !== undefined ? { ports } : {}),
    ...(migratedViews.length > 0 || source.views !== undefined || options.views !== undefined ? { views: migratedViews } : {}),
    ...(source.schemaVersion !== undefined ? { schemaVersion: source.schemaVersion } : {}),
    ...(source.resources !== undefined ? { resources: source.resources } : {}),
    ...(source.extensions !== undefined ? { extensions: source.extensions } : {}),
    ...(source.typeDefinitions !== undefined ? { typeDefinitions: nextDefinitions } : {}),
  };
  const stray = checkTargetClean(target, "generic@1", "generic@2");
  if (stray !== null) return fail(stray, "incompatible-attribute-schema");
  return commitMigration({
    migrationId: GENERIC_MIGRATION_ID, from, to,
    originalSha256: sha256Hex(canonicalBytes(source)),
    originalCanonical: structuredClone(source),
    operations: orderedOperations(ops, GENERIC_MIGRATION_ID), unmigrated: [],
    ...(Object.keys(presentationMoves).length > 0 ? { presentationMoves } : {}),
    ...(foldSeeds.length > 0 ? { foldSeeds: [...foldSeeds].sort() } : {}),
    ...(source.typeDefinitions !== undefined ? { residuals: nextDefinitions } : {}),
    outcome: "ok", target,
  }, declared);
}

/**
 * Strip migrated presentation slots from a residual refinement definition
 * (rebased residual, §3.13.1 step 2): the slots moved to typed view
 * presentation are removed from the residual; every removal is a declared
 * patch path.
 */
function stripMigratedSlots(
  definition: unknown, basePath: readonly string[],
  ops: MigrationOperation[], declared: Set<string>,
): unknown {
  if (!isRecord(definition) || !Array.isArray(definition["attributes"])) return definition;
  const attributes = definition["attributes"] as Record<string, unknown>[];
  const next = attributes.filter(schema => ![...TEXT_SLOT_NAMES, ICON_SLOT].includes(schema["name"] as string));
  if (next.length !== attributes.length) {
    ops.push({ path: basePath.join(".") + ".attributes", action: "remove-migrated-slot", detail: "§3.13.1 step 4: moved to typed view presentation" });
    for (const schema of attributes) {
      if (!next.includes(schema)) declared.add(patchPath(...basePath, "attributes", schema["name"] as string));
    }
  }
  return { ...definition, attributes: next };
}

// ---------------------------------------------------------------------------
// archimate@1 → archimate@2 (spec §3.13.2 + §3.9 matrix)
// ---------------------------------------------------------------------------

export const ARCHIMATE_MIGRATION_ID = "engram:migration-archimate-1-2" as const;

/** Closed §3.13.2 input: one entity reference → catalogue type map. */
export interface ArchimateMigrationMapping {
  readonly entityTypes: Readonly<Record<string, string>>;
}

export function migrateArchimateV1ToV2(
  source: MigDocument, mapping: ArchimateMigrationMapping, options: ProfileViewOptions,
): MigrationReport | BoundaryPreflightRefusal {
  if (!isRecord(source)) return boundaryPreflightRefusal("non-json-input", "profile source is not a JSON object", source);
  const boundary = preCanonicalBoundary(source);
  if (boundary !== null) return boundary;
  const from: Pin = { id: "archimate", version: "1.0.0", contentDigest: ARCHIMATE_V1_CONTENT };
  const to: Pin = { id: "archimate", version: "2.0.0", contentDigest: ARCHIMATE_V2.contentDigest };
  const ops: MigrationOperation[] = [];
  const declared = new Set<string>();
  const fail = (path: string, reason: MigrationRefusalReason, detail?: string): MigrationRefusal =>
    refuse(ARCHIMATE_MIGRATION_ID, from, to, source, ops,
      detail === undefined ? [{ path, reason }] : [{ path, reason, detail }]);

  if (!isRecord(mapping) || Object.keys(mapping).length !== 1 || !Object.hasOwn(mapping, "entityTypes") ||
      !isRecord(mapping.entityTypes) || Object.values(mapping.entityTypes).some(value => typeof value !== "string")) {
    return fail("mapping", "incompatible-attribute-schema");
  }
  const entityTypes = mapping.entityTypes;
  const viewGate = checkViewSchemaGates(source, options.viewSchemas);
  if (viewGate.length > 0) {
    return refuse(ARCHIMATE_MIGRATION_ID, from, to, source, ops,
      viewGate as [UnmigratedItem, ...UnmigratedItem[]]);
  }
  const sourceViewFailure = checkSourceViews(source);
  if (sourceViewFailure !== null) return fail(sourceViewFailure, "incompatible-attribute-schema");
  if (source.profileRefs.filter((r) => r === "archimate@1").length !== 1) {
    return fail("", source.profileRefs.includes("archimate@2") ? "target-already-present" : "missing-source-profile");
  }
  if (source.profileRefs.includes("archimate@2")) return fail("", "target-already-present");
  const nextRefs = source.profileRefs.map((r) => (r === "archimate@1" ? "archimate@2" : r));
  ops.push({ path: "profileRefs", action: "replace-profile-ref", detail: "archimate@1→archimate@2" });
  nextRefs.forEach((ref, index) => {
    if (ref !== source.profileRefs[index]) declared.add(patchPath("profileRefs", index));
  });

  const targetDecl = ARCHIMATE_V2.declaration as Record<string, unknown>;
  const reserved = governedIds(targetDecl);
  const nextDefinitions: Record<string, unknown> = Object.create(null);
  for (const id of sortedKeys(source.typeDefinitions)) {
    if (reserved.has(id)) return fail(`typeDefinitions.${id}`, "incompatible-attribute-schema");
    const definition = source.typeDefinitions![id];
    const cleaned = rewriteRecordProfile(structuredClone(definition), "archimate@1", "archimate@2");
    nextDefinitions[id] = cleaned;
    ops.push({ path: `typeDefinitions.${id}`, action: "preserve-residual-refinement" });
    if (isRecord(definition) && definition["profile"] === "archimate@1") {
      declared.add(patchPath("typeDefinitions", id, "profile"));
    }
  }

  // A native @1 element refinement is assigned through its instances. Rebase
  // its root declaration, retaining the residual identity and every schema.
  for (const id of sortedKeys(nextDefinitions)) {
    const definition = nextDefinitions[id];
    if (!isRecord(definition) || definition["profile"] !== "archimate@2" || definition["baseType"] !== "element") continue;
    const assignments = new Set<string>();
    for (const entity of Object.values(source.entities)) {
      if (entity.profile !== "archimate@1") continue;
      const own = resolveEffectiveType(ARCHIMATE_V1_DECLARATION, source.typeDefinitions, entity.type);
      if (own.ok && own.effective.chain.includes(id)) {
        if (entityTypes[entity.id] === undefined) return fail(`entities.${entity.id}`, "missing-type-mapping");
        assignments.add(entityTypes[entity.id]!);
      }
    }
    if (assignments.size !== 1) return fail(`typeDefinitions.${id}.baseType`, "missing-type-mapping");
    const mappedBase = [...assignments][0]!;
    if (!ARCHIMATE_CATALOGUE.some(row => row.id === mappedBase)) return fail(`typeDefinitions.${id}.baseType`, "missing-type-mapping");
    nextDefinitions[id] = { ...definition, baseType: mappedBase };
    ops.push({ path: `typeDefinitions.${id}.baseType`, action: "rebase-residual-refinement", detail: `§3.13.2: element→${mappedBase}` });
    declared.add(patchPath("typeDefinitions", id, "baseType"));
  }
  const refinementFailure = promoteRefinements(targetDecl, nextDefinitions, ops, declared);
  if (refinementFailure !== null) return fail(refinementFailure.path, "type-definition-conflict", "incompatible-attribute-schema");

  const catalogueById = new Map(ARCHIMATE_CATALOGUE.map((c) => [c.id, c]));
  const tuples = expandArchimateTuples();
  const allows = (relationship: string, s: string, t: string): boolean =>
    tuples.some((x) => x.relationType === relationship && x.sourceType === s && x.targetType === t);

  // Copy-then-patch: every authored attribute survives unless a declared
  // patch names it. Layer/aspect are derived catalogue data (§3.9), never
  // freely authored values that could contradict the mapped type.
  const conversionExempt = new Set<string>(["name", "layer", "aspect", "operator"]);
  const entityTypeOf = new Map<string, string>();
  const entities: Record<string, MigEntity> = {};
  for (const id of sortedKeys(source.entities)) {
    const entity = source.entities[id]!;
    if (entity.profile !== "archimate@1") {
      entities[id] = structuredClone(entity);
      continue;
    }
    const sourceResolved = resolveEffectiveType(ARCHIMATE_V1_DECLARATION, source.typeDefinitions, entity.type);
    const sourceKind = sourceResolved.ok ? sourceResolved.effective.baseId : entity.type;
    if (sourceKind === "junction" || sourceKind === "grouping") {
      const mapped = entityTypes[id];
      if (mapped !== undefined && mapped !== sourceKind) {
        return fail(`entities.${id}.type`, "incompatible-attribute-schema");
      }
      const resolved = resolveEffectiveType(targetDecl, nextDefinitions, entity.type);
      if (!resolved.ok) {
        if (resolved.failure.error === "conflict") {
          return fail(`entities.${id}.attributes.${resolved.failure.attribute}`, "type-definition-conflict", "incompatible-attribute-schema");
        }
        return fail(`entities.${id}.type`, "incompatible-attribute-schema");
      }
      const overlap = checkValueKindOverlap(entity.attributes, resolved.effective, conversionExempt);
      if (overlap !== null) {
        return fail(`entities.${id}.attributes.${overlap.attribute}`, "type-definition-conflict", "incompatible-attribute-schema");
      }
      entityTypeOf.set(id, sourceKind);
      entities[id] = {
        ...structuredClone(entity), profile: "archimate@2", type: entity.type,
        attributes: structuredClone(entity.attributes) as Record<string, MigAttribute>,
      };
      ops.push({ path: `entities.${id}.profile`, action: "rewrite-profile", detail: "archimate@1→archimate@2; meaning retained" });
      declared.add(patchPath("entities", id, "profile"));
      continue;
    }
    const mapped = entityTypes[id];
    if (mapped === undefined) return fail(`entities.${id}`, "missing-type-mapping");
    const row = catalogueById.get(mapped);
    if (row === undefined) return fail(`entities.${id}`, "missing-type-mapping");
    // A refined @1 element resolves through the shared resolver first:
    // an incompatible redeclaration refuses, and the explicit mapping
    // must name the resolved nearest catalogue ancestor (spec §3.13.2
    // assignment + §5.1/matrix nearest-ancestor rule). An unresolvable
    // chain refuses fail-closed; it never silently keeps the mapping.
    if (source.typeDefinitions?.[entity.type] !== undefined) {
      const own = resolveEffectiveType(targetDecl, nextDefinitions, entity.type);
      if (!own.ok) {
        if (own.failure.error === "conflict") {
          return fail(`entities.${id}.attributes.${own.failure.attribute}`, "type-definition-conflict", "incompatible-attribute-schema");
        }
        return fail(`entities.${id}.type`, "incompatible-attribute-schema");
      }
      if (own.effective.baseId !== mapped) {
        return fail(`entities.${id}.type`, "incompatible-attribute-schema");
      }
    }
    const residualType = nextDefinitions[entity.type] === undefined ? mapped : entity.type;
    const resolved = resolveEffectiveType(targetDecl, nextDefinitions, residualType);
    if (!resolved.ok) {
      if (resolved.failure.error === "conflict") {
        return fail(`entities.${id}.attributes.${resolved.failure.attribute}`, "type-definition-conflict", "incompatible-attribute-schema");
      }
      return fail(`entities.${id}.type`, "incompatible-attribute-schema");
    }
    const overlap = checkValueKindOverlap(entity.attributes, resolved.effective, conversionExempt);
    if (overlap !== null) {
      return fail(`entities.${id}.attributes.${overlap.attribute}`, "type-definition-conflict", "incompatible-attribute-schema");
    }
    entityTypeOf.set(id, mapped);
    // Start from the complete authored record; the declared patches below
    // overwrite only the mapped type and the derived catalogue fields.
    const nextAttrs: Record<string, MigAttribute> = structuredClone(entity.attributes) as Record<string, MigAttribute>;
    const name = entity.attributes["name"];
    if (mapped !== "grouping") {
      if (getText(name) === null) return fail(`entities.${id}.attributes.name`, "incompatible-attribute-schema");
    } else if (name === undefined) {
      delete nextAttrs["name"];
    }
    if (row.layer !== "none") {
      nextAttrs["layer"] = { kind: "enum", value: row.layer };
      ops.push({ path: `entities.${id}.attributes.layer`, action: "derive-from-catalogue", detail: row.layer });
      declared.add(patchPath("entities", id, "attributes", "layer"));
    } else {
      delete nextAttrs["layer"];
      ops.push({ path: `entities.${id}.attributes.layer`, action: "drop-fabricated-layer", detail: "none is not a value" });
      declared.add(patchPath("entities", id, "attributes", "layer"));
    }
    nextAttrs["aspect"] = { kind: "enum", value: row.aspect };
    ops.push({ path: `entities.${id}.attributes.aspect`, action: "derive-from-catalogue", detail: row.aspect });
    declared.add(patchPath("entities", id, "attributes", "aspect"));
    ops.push({ path: `entities.${id}.type`, action: "map-to-catalogue", detail: `${entity.type}→${mapped}` });
    declared.add(patchPath("entities", id, "type"));
    for (const [key] of sortedAttributes(nextAttrs)) {
      if (resolved.effective.attrs[key] === undefined && !conversionExempt.has(key)) {
        ops.push({ path: `entities.${id}.attributes.${key}`, action: "retain-domain-attribute", detail: "present-unchanged" });
      }
    }
    entities[id] = { ...structuredClone(entity), profile: "archimate@2", type: residualType, attributes: nextAttrs };
    ops.push({ path: `entities.${id}.profile`, action: "rewrite-profile", detail: "archimate@1→archimate@2" });
    declared.add(patchPath("entities", id, "profile"));
  }

  const relations: Record<string, MigRelation> = {};
  for (const id of sortedKeys(source.relations)) {
    const rel = source.relations[id]!;
    if (rel.profile !== "archimate@1") {
      relations[id] = structuredClone(rel);
      continue;
    }
    const srcEp = rel.endpoints.find((e) => e.role === "source");
    const tgtEp = rel.endpoints.find((e) => e.role === "target");
    // No role is guessed: a relation without its source/target role blocks.
    if (srcEp === undefined || tgtEp === undefined) return fail(`relations.${id}.endpoints`, "endpoint-role-unknown");
    const src = srcEp.target;
    const tgt = tgtEp.target;
    const srcType = entityTypeOf.get(src);
    const tgtType = entityTypeOf.get(tgt);
    if (srcType === undefined || tgtType === undefined) return fail(`relations.${id}.endpoints`, "missing-type-mapping");
    if (!allows(rel.type, srcType, tgtType)) return fail(`relations.${id}.endpoints`, "relationship-matrix-violation");
    const nextAttrs: Record<string, MigAttribute> = structuredClone(rel.attributes) as Record<string, MigAttribute>;
    for (const [k, v] of sortedAttributes(rel.attributes)) nextAttrs[k] = structuredClone(v);
    relations[id] = { ...structuredClone(rel), profile: "archimate@2", attributes: nextAttrs };
    ops.push({ path: `relations.${id}.profile`, action: "rewrite-profile", detail: `matrix allows ${rel.type}(${srcType}→${tgtType})` });
    declared.add(patchPath("relations", id, "profile"));
  }

  const ports: Record<string, unknown> = {};
  for (const id of sortedKeys(source.ports as Readonly<Record<string, unknown>> | undefined)) {
    const port = (source.ports as Record<string, unknown>)[id]!;
    if (typeof port === "object" && port !== null && (port as Record<string, unknown>)["profile"] === "archimate@1") {
      return fail(`ports.${id}.profile`, "incompatible-attribute-schema");
    }
    ports[id] = structuredClone(port);
  }

  rebasePromotedRefinements(nextDefinitions, entities, relations, ports, targetDecl["id"] as string, ops, declared);

  // Retained views travel unchanged; each is validated before commit.
  const retainedViews = source.views ?? [];
  const carriedViews = structuredClone(retainedViews);
  for (const view of carriedViews) {
    const failed = checkRetainedView(view, entities);
    if (failed !== null) return fail(failed, "incompatible-attribute-schema");
  }

  const target: MigDocument = {
    ...structuredClone(source),
    documentId: source.documentId, revision: source.revision,
    profileRefs: nextRefs,
    entities, relations,
    ...(source.ports !== undefined ? { ports } : {}),
    ...(carriedViews.length > 0 ? { views: carriedViews } : {}),
    ...(source.schemaVersion !== undefined ? { schemaVersion: source.schemaVersion } : {}),
    ...(source.resources !== undefined ? { resources: source.resources } : {}),
    ...(source.extensions !== undefined ? { extensions: source.extensions } : {}),
    ...(source.typeDefinitions !== undefined ? { typeDefinitions: nextDefinitions } : {}),
  };
  const stray = checkTargetClean(target, "archimate@1", "archimate@2");
  if (stray !== null) return fail(stray, "incompatible-attribute-schema");
  return commitMigration({
    migrationId: ARCHIMATE_MIGRATION_ID, from, to,
    originalSha256: sha256Hex(canonicalBytes(source)),
    originalCanonical: structuredClone(source),
    operations: orderedOperations(ops, ARCHIMATE_MIGRATION_ID), unmigrated: [],
    ...(source.typeDefinitions !== undefined ? { residuals: nextDefinitions } : {}),
    outcome: "ok", target,
  }, declared);
}

// ---------------------------------------------------------------------------
// uml@1 → uml@2 (spec §3.13.2 + §3.11)
// ---------------------------------------------------------------------------

export const UML_MIGRATION_ID = "engram:migration-uml-1-2" as const;

export interface UmlMigrationInput {
  readonly stereotypes: Readonly<Record<string, string>>;
}

/**
 * Declared stereotype kinds from the pinned uml@2 declaration (§3.11,
 * stereotype.extends item enum). Caller text converts to these enum
 * values; anything outside refuses.
 */
const UML_STEREOTYPE_TARGETS: ReadonlySet<string> = new Set(
  (((UML_V2.declaration["entityTypes"] as Record<string, unknown>[]).find(type => type["id"] === "stereotype")!["attributes"] as Record<string, unknown>[])
    .find(schema => schema["name"] === "extends")!["item"] as { values: string[] }).values,
);

/** A declared stereotype, resolved in the source document — never trusted from the caller. */
function resolveDeclaredStereotype(
  source: MigDocument, ref: string,
): { extends: readonly string[] } | { missing: true } | { invalid: true } {
  const record = source.entities[ref];
  if (record === undefined) return { missing: true };
  // Ownership: the declaring record belongs to the source family.
  if (record.profile !== "uml@1") return { invalid: true };
  const definitions = Object.fromEntries(Object.entries(source.typeDefinitions ?? {}).map(([id, definition]) =>
    [id, rewriteRecordProfile(definition, "uml@1", "uml@2")]));
  const resolved = resolveEffectiveType(UML_V2.declaration as Record<string, unknown>, definitions, record.type);
  if (!resolved.ok || !resolved.effective.chain.includes("stereotype")) return { invalid: true };
  const extendsAttr = record.attributes["extends"];
  if (extendsAttr === undefined || extendsAttr.kind !== "collection" || !Array.isArray(extendsAttr.items)) {
    return { invalid: true };
  }
  const values: string[] = [];
  for (const item of extendsAttr.items) {
    if ((item.kind !== "text" && item.kind !== "enum") || typeof item.value !== "string") return { invalid: true };
    if (!UML_STEREOTYPE_TARGETS.has(item.value)) return { invalid: true };
    values.push(item.value);
  }
  // Complete extends schema (§3.11): bounded collection, 1..5, no duplicates.
  if (values.length < 1 || values.length > 5) return { invalid: true };
  if (new Set(values).size !== values.length) return { invalid: true };
  return { extends: values };
}

export function migrateUmlV1ToV2(source: MigDocument, input: UmlMigrationInput, options: ProfileViewOptions): MigrationReport | BoundaryPreflightRefusal {
  if (!isRecord(source)) return boundaryPreflightRefusal("non-json-input", "profile source is not a JSON object", source);
  const boundary = preCanonicalBoundary(source);
  if (boundary !== null) return boundary;
  const from: Pin = { id: "uml", version: "1.0.0", contentDigest: UML_V1_CONTENT };
  const to: Pin = { id: "uml", version: "2.0.0", contentDigest: UML_V2.contentDigest };
  const ops: MigrationOperation[] = [];
  const declared = new Set<string>();
  const fail = (path: string, reason: MigrationRefusalReason, detail?: string): MigrationRefusal =>
    refuse(UML_MIGRATION_ID, from, to, source, ops,
      detail === undefined ? [{ path, reason }] : [{ path, reason, detail }]);

  const viewGate = checkViewSchemaGates(source, options.viewSchemas);
  if (viewGate.length > 0) {
    return refuse(UML_MIGRATION_ID, from, to, source, ops,
      viewGate as [UnmigratedItem, ...UnmigratedItem[]]);
  }
  const sourceViewFailure = checkSourceViews(source);
  if (sourceViewFailure !== null) return fail(sourceViewFailure, "incompatible-attribute-schema");
  if (source.profileRefs.filter((r) => r === "uml@1").length !== 1) {
    return fail("", source.profileRefs.includes("uml@2") ? "target-already-present" : "missing-source-profile");
  }
  if (source.profileRefs.includes("uml@2")) return fail("", "target-already-present");
  const nextRefs = source.profileRefs.map((r) => (r === "uml@1" ? "uml@2" : r));
  ops.push({ path: "profileRefs", action: "replace-profile-ref", detail: "uml@1→uml@2" });
  nextRefs.forEach((ref, index) => {
    if (ref !== source.profileRefs[index]) declared.add(patchPath("profileRefs", index));
  });

  const targetDecl = UML_V2.declaration as Record<string, unknown>;
  const reserved = governedIds(targetDecl);
  const nextDefinitions: Record<string, unknown> = Object.create(null);
  for (const id of sortedKeys(source.typeDefinitions)) {
    if (reserved.has(id)) return fail(`typeDefinitions.${id}`, "incompatible-attribute-schema");
    const definition = source.typeDefinitions![id];
    const cleaned = rewriteRecordProfile(structuredClone(definition), "uml@1", "uml@2");
    nextDefinitions[id] = cleaned;
    ops.push({ path: `typeDefinitions.${id}`, action: "preserve-residual-refinement" });
    if (isRecord(definition) && definition["profile"] === "uml@1") {
      declared.add(patchPath("typeDefinitions", id, "profile"));
    }
  }

  // Validate native declarations independently of current attribute values.
  const refinementFailure = promoteRefinements(targetDecl, nextDefinitions, ops, declared);
  if (refinementFailure !== null) return fail(refinementFailure.path, "type-definition-conflict", "incompatible-attribute-schema");

  // Conversion-exempt attribute names per record kind (declared conversions).
  const exemptFor = (kind: string): Set<string> => {
    if (kind === "property") return new Set(["multiplicity"]);
    if (kind === "stereotype") return new Set(["extends"]);
    return new Set(["stereotypes"]);
  };

  const entities: Record<string, MigEntity> = {};
  for (const id of sortedKeys(source.entities)) {
    const entity = source.entities[id]!;
    if (entity.profile !== "uml@1") {
      entities[id] = structuredClone(entity);
      continue;
    }
    const resolved = resolveEffectiveType(targetDecl, nextDefinitions, entity.type);
    if (!resolved.ok) {
      if (resolved.failure.error === "conflict") {
        return fail(`entities.${id}.attributes.${resolved.failure.attribute}`, "type-definition-conflict", "incompatible-attribute-schema");
      }
      return fail(`entities.${id}.type`, "incompatible-attribute-schema");
    }
    // A stereotype declaring record must resolve to the stereotype base
    // itself (ownership + ancestry in the candidate semantic context).
    if (entity.type === "stereotype" && resolved.effective.baseId !== "stereotype") {
      return fail(`entities.${id}.type`, "stereotype-application-invalid");
    }
    const effectiveKind = resolved.effective.baseId;
    const exempt = exemptFor(effectiveKind);
    const overlap = checkValueKindOverlap(entity.attributes, resolved.effective, exempt);
    if (overlap !== null) {
      return fail(`entities.${id}.attributes.${overlap.attribute}`, "type-definition-conflict", "incompatible-attribute-schema");
    }
    const nextAttrs: Record<string, MigAttribute> = structuredClone(entity.attributes) as Record<string, MigAttribute>;
    for (const [key, attr] of sortedAttributes(entity.attributes)) {
      if (key === "multiplicity" && effectiveKind === "property") {
        const raw = getText(attr);
        if (raw === null) return fail(`entities.${id}.attributes.multiplicity`, "multiplicity-syntax");
        const parsed = parseMultiplicity(raw);
        if (!parsed.ok) return fail(`entities.${id}.attributes.multiplicity`, parsed.reason);
        nextAttrs[key] = multiplicityStruct(parsed.lower, parsed.upper);
        ops.push({ path: `entities.${id}.attributes.multiplicity`, action: "parse-multiplicity", detail: `${raw}→${parsed.lower}/${parsed.upper}` });
        declared.add(patchPath("entities", id, "attributes", "multiplicity"));
      } else if (key === "stereotypes" && attr.kind === "collection" && Array.isArray(attr.items)) {
        const converted: MigAttribute[] = [];
        for (let i = 0; i < attr.items.length; i++) {
          const item = attr.items[i]!;
          const label = item.kind === "text" && typeof item.value === "string" ? item.value : null;
          if (label === null) return fail(`entities.${id}.attributes.stereotypes[${i}]`, "unmapped-stereotype");
          const ref = input.stereotypes[label];
          if (ref === undefined) return fail(`entities.${id}.attributes.stereotypes[${i}]`, "unmapped-stereotype");
          // The declaration is resolved in the candidate semantic context:
          // a dangling, wrong-profile, wrong-type or inapplicable target refuses.
          const declaredStereotype = resolveDeclaredStereotype(source, ref);
          if ("missing" in declaredStereotype) return fail(`entities.${id}.attributes.stereotypes[${i}]`, "unmapped-stereotype");
          if ("invalid" in declaredStereotype) return fail(`entities.${id}.attributes.stereotypes[${i}]`, "stereotype-application-invalid");
          if (!declaredStereotype.extends.some(kind => resolved.effective.chain.includes(kind))) {
            return fail(`entities.${id}.attributes.stereotypes[${i}]`, "stereotype-application-invalid");
          }
          converted.push({ kind: "reference", value: ref });
        }
        nextAttrs[key] = { kind: "collection", items: converted };
        ops.push({ path: `entities.${id}.attributes.stereotypes`, action: "map-stereotypes", detail: `${attr.items.length} item(s)` });
        declared.add(patchPath("entities", id, "attributes", "stereotypes"));
      } else if (key === "extends" && effectiveKind === "stereotype" && attr.kind === "collection" && Array.isArray(attr.items)) {
        // The declaring record's own extends converts from @1 text items
        // to @2 enum items; no text value survives into the enum target.
        const converted: MigAttribute[] = [];
        for (let i = 0; i < attr.items.length; i++) {
          const item = attr.items[i]!;
          const value = (item.kind === "text" || item.kind === "enum") && typeof item.value === "string" ? item.value : null;
          if (value === null || !UML_STEREOTYPE_TARGETS.has(value)) {
            return fail(`entities.${id}.attributes.extends[${i}]`, "stereotype-application-invalid");
          }
          converted.push({ kind: "enum", value });
        }
        if (converted.length < 1 || converted.length > 5) {
          return fail(`entities.${id}.attributes.extends`, "stereotype-application-invalid");
        }
        if (new Set(converted.map((c) => c.value as string)).size !== converted.length) {
          return fail(`entities.${id}.attributes.extends`, "stereotype-application-invalid");
        }
        nextAttrs[key] = { kind: "collection", items: converted };
        ops.push({ path: `entities.${id}.attributes.extends`, action: "convert-stereotype-extends", detail: `${attr.items.length} item(s) text→enum` });
        declared.add(patchPath("entities", id, "attributes", "extends"));
      } else {
        nextAttrs[key] = structuredClone(attr);
        if (resolved.effective.attrs[key] === undefined) {
          ops.push({ path: `entities.${id}.attributes.${key}`, action: "retain-domain-attribute", detail: "present-unchanged" });
        }
      }
    }
    entities[id] = { ...structuredClone(entity), profile: "uml@2", attributes: nextAttrs };
    ops.push({ path: `entities.${id}.profile`, action: "rewrite-profile", detail: "uml@1→uml@2" });
    declared.add(patchPath("entities", id, "profile"));
  }

  const relations: Record<string, MigRelation> = {};
  for (const id of sortedKeys(source.relations)) {
    const rel = source.relations[id]!;
    if (rel.profile !== "uml@1") {
      relations[id] = structuredClone(rel);
      continue;
    }
    const nextAttrs: Record<string, MigAttribute> = structuredClone(rel.attributes) as Record<string, MigAttribute>;
    for (const [key, attr] of sortedAttributes(rel.attributes)) {
      if ((key === "sourceMultiplicity" || key === "targetMultiplicity") && rel.type === "association") {
        const raw = getText(attr);
        if (raw === null) return fail(`relations.${id}.attributes.${key}`, "multiplicity-syntax");
        const parsed = parseMultiplicity(raw);
        if (!parsed.ok) return fail(`relations.${id}.attributes.${key}`, parsed.reason);
        nextAttrs[key] = multiplicityStruct(parsed.lower, parsed.upper);
        ops.push({ path: `relations.${id}.attributes.${key}`, action: "parse-multiplicity", detail: `${raw}→${parsed.lower}/${parsed.upper}` });
        declared.add(patchPath("relations", id, "attributes", key));
      } else {
        nextAttrs[key] = structuredClone(attr);
      }
    }
    relations[id] = { ...structuredClone(rel), profile: "uml@2", attributes: nextAttrs };
    ops.push({ path: `relations.${id}.profile`, action: "rewrite-profile", detail: "uml@1→uml@2" });
    declared.add(patchPath("relations", id, "profile"));
  }

  const ports: Record<string, unknown> = {};
  for (const id of sortedKeys(source.ports as Readonly<Record<string, unknown>> | undefined)) {
    const port = (source.ports as Record<string, unknown>)[id]!;
    if (typeof port === "object" && port !== null && (port as Record<string, unknown>)["profile"] === "uml@1") {
      return fail(`ports.${id}.profile`, "incompatible-attribute-schema");
    }
    ports[id] = structuredClone(port);
  }

  // Retained views travel unchanged; each is validated before commit.
  const retainedViews = source.views ?? [];
  const carriedViews = structuredClone(retainedViews);
  for (const view of carriedViews) {
    const failed = checkRetainedView(view, entities);
    if (failed !== null) return fail(failed, "incompatible-attribute-schema");
  }

  const target: MigDocument = {
    ...structuredClone(source),
    documentId: source.documentId, revision: source.revision,
    profileRefs: nextRefs,
    entities, relations,
    ...(source.ports !== undefined ? { ports } : {}),
    ...(carriedViews.length > 0 ? { views: carriedViews } : {}),
    ...(source.schemaVersion !== undefined ? { schemaVersion: source.schemaVersion } : {}),
    ...(source.resources !== undefined ? { resources: source.resources } : {}),
    ...(source.extensions !== undefined ? { extensions: source.extensions } : {}),
    ...(source.typeDefinitions !== undefined ? { typeDefinitions: nextDefinitions } : {}),
  };
  const stray = checkTargetClean(target, "uml@1", "uml@2");
  if (stray !== null) return fail(stray, "incompatible-attribute-schema");
  return commitMigration({
    migrationId: UML_MIGRATION_ID, from, to,
    originalSha256: sha256Hex(canonicalBytes(source)),
    originalCanonical: structuredClone(source),
    operations: orderedOperations(ops, UML_MIGRATION_ID), unmigrated: [],
    ...(source.typeDefinitions !== undefined ? { residuals: nextDefinitions } : {}),
    outcome: "ok", target,
  }, declared);
}

// ---------------------------------------------------------------------------
// Staged composition (SPEC §4.4 option (i), owner G1): the @1 → @2 view
// migration runs as a separate, independently pinned stage before the
// profile migration. Both stage receipts are retained; when the second stage
// refuses, its input is the @2-view intermediate while the pre-conversion
// original stays available through the view stage report.
// ---------------------------------------------------------------------------

/** Two stage receipts of one composed conversion; no single transaction. */
export interface StagedMigrationResult {
  readonly viewStage: ViewSchemaMigrationReport | BoundaryPreflightRefusal;
  readonly profileStage: MigrationReport | BoundaryPreflightRefusal | null;
}

/** Explicit pins for the composed view stage: exact @1 in, exact @2 out. */
export interface ViewStagePins {
  readonly source: Pin;
  readonly target: Pin;
}

function stageConvertedViews(
  source: MigDocument, supplied: readonly MigView[] | undefined, viewPins: ViewStagePins,
): { readonly views: MigView[]; readonly stage: ViewSchemaMigrationReport | BoundaryPreflightRefusal } {
  const merged = transactionSnapshot(source, supplied);
  const views = [...(merged.views ?? [])] as MigView[];
  const stage = migrateRetainedViewsV1ToV2(views, viewPins);
  if ("boundary" in stage || stage.outcome === "refused") return { views, stage };
  return { views: stage.target as unknown as MigView[], stage };
}

function stageViewSchemas(views: readonly MigView[], target: Pin): Readonly<Record<string, Pin>> {
  return Object.fromEntries(views.map(view => [view.viewId, target]));
}

function profileSourceWithViews(source: MigDocument, converted: readonly MigView[]): MigDocument {
  if (converted.length === 0 && source.views === undefined) return source;
  return { ...source, views: structuredClone(converted) };
}

/** Run the @1 → @2 view stage, then generic@1 → generic@2 on the result. */
export function migrateGenericWithViewsV1ToV2(
  source: MigDocument, options: Omit<GenericMigrationOptions, "viewSchemas"> & { readonly viewPins: ViewStagePins },
): StagedMigrationResult {
  const { viewPins, ...profileOptions } = options;
  const { views, stage } = stageConvertedViews(source, options.views, viewPins);
  if ("boundary" in stage || stage.outcome === "refused") return { viewStage: stage, profileStage: null };
  // The converted views replace the embedded pre-conversion views; merging
  // them would duplicate every converted view id with conflicting bytes.
  const profileSource = { ...source };
  delete profileSource.views;
  const profileStage = migrateGenericV1ToV2(profileSource, {
    ...profileOptions,
    ...(views.length > 0 || source.views !== undefined || options.views !== undefined ? { views } : {}),
    viewSchemas: stageViewSchemas(views, viewPins.target),
  });
  return { viewStage: stage, profileStage };
}

/** Run the @1 → @2 view stage, then archimate@1 → archimate@2 on the result. */
export function migrateArchimateWithViewsV1ToV2(
  source: MigDocument, mapping: ArchimateMigrationMapping,
  options: { readonly viewPins: ViewStagePins },
): StagedMigrationResult {
  const { views, stage } = stageConvertedViews(source, undefined, options.viewPins);
  if ("boundary" in stage || stage.outcome === "refused") return { viewStage: stage, profileStage: null };
  const profileStage = migrateArchimateV1ToV2(profileSourceWithViews(source, views), mapping, {
    viewSchemas: stageViewSchemas(views, options.viewPins.target),
  });
  return { viewStage: stage, profileStage };
}

/** Run the @1 → @2 view stage, then uml@1 → uml@2 on the result. */
export function migrateUmlWithViewsV1ToV2(
  source: MigDocument, input: UmlMigrationInput,
  options: { readonly viewPins: ViewStagePins },
): StagedMigrationResult {
  const { views, stage } = stageConvertedViews(source, undefined, options.viewPins);
  if ("boundary" in stage || stage.outcome === "refused") return { viewStage: stage, profileStage: null };
  const profileStage = migrateUmlV1ToV2(profileSourceWithViews(source, views), input, {
    viewSchemas: stageViewSchemas(views, options.viewPins.target),
  });
  return { viewStage: stage, profileStage };
}

// @1 source pins live in diagram-skeletons.ts (transcribed @1 declarations).
