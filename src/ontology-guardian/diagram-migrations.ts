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
import type { Digest, Pin } from "./types.js";
import { ARCHIMATE_CATALOGUE } from "./diagram-matrix-data.js";
import { expandArchimateTuples } from "./diagram-profiles.js";
import { ARCHIMATE_V2, GENERIC_V2, UML_V2 } from "./diagram-profiles.js";
import { ARCHIMATE_V1_CONTENT, GENERIC_V1_CONTENT, UML_V1_CONTENT } from "./diagram-skeletons.js";

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
    operations, unmigrated, outcome: "refused", target: null,
  };
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
  if (typeof base !== "object" || base === null || typeof overlay !== "object" || overlay === null) return false;
  const b = base as Record<string, unknown>;
  const o = overlay as Record<string, unknown>;
  for (const key of ["maxLength", "minLength", "required", "integer", "min", "max", "item", "values", "units", "refKind", "targetTypes"]) {
    const bv = canonicalBytes(b[key] ?? null);
    const ov = canonicalBytes(o[key] ?? null);
    if (bv !== ov) return false;
  }
  return true;
}

function refinementBaseOf(definition: unknown): string | string[] | null {
  if (typeof definition !== "object" || definition === null || Array.isArray(definition)) return null;
  const record = definition as Record<string, unknown>;
  if (typeof record["baseType"] === "string") return record["baseType"] as string;
  if (Array.isArray(record["supertypes"])) {
    const supers = (record["supertypes"] as unknown[]).filter((s): s is string => typeof s === "string");
    return supers.length === (record["supertypes"] as unknown[]).length ? supers : null;
  }
  return null;
}

function refinementAttrsOf(definition: unknown): Readonly<Record<string, unknown>> {
  if (typeof definition !== "object" || definition === null || Array.isArray(definition)) return {};
  const attributes = (definition as Record<string, unknown>)["attributes"];
  if (typeof attributes !== "object" || attributes === null || Array.isArray(attributes)) return {};
  return attributes as Readonly<Record<string, unknown>>;
}

export function resolveEffectiveType(
  targetDeclaration: Record<string, unknown>,
  typeDefinitions: Readonly<Record<string, unknown>> | undefined,
  typeId: string,
): { readonly ok: true; readonly effective: EffectiveType } | { readonly ok: false; readonly failure: ResolverError } {
  const declared = declarationById(targetDeclaration, "entityTypes");
  // Walk the refinement chain outward: typeId → … → declared base.
  const chain: string[] = [typeId];
  const visited = new Set<string>([typeId]);
  let cursor: string | null = typeId;
  const overlays: { id: string; attributes: Readonly<Record<string, unknown>> }[] = [];
  while (cursor !== null && !declared.has(cursor)) {
    const definition = typeDefinitions?.[cursor];
    if (definition === undefined) return { ok: false, failure: { error: "unknown", chain: [...chain] } };
    const base = refinementBaseOf(definition);
    if (base === null) return { ok: false, failure: { error: "unknown", chain: [...chain] } };
    const bases = Array.isArray(base) ? base : [base];
    if (bases.length === 0) return { ok: false, failure: { error: "unknown", chain: [...chain] } };
    overlays.push({ id: cursor, attributes: refinementAttrsOf(definition) });
    cursor = bases[0]!;
    if (visited.has(cursor)) return { ok: false, failure: { error: "cycle", chain: [...chain, cursor] } };
    visited.add(cursor);
    chain.push(cursor);
  }
  const baseId = cursor ?? typeId;
  const base = declared.get(baseId);
  if (base === undefined) return { ok: false, failure: { error: "unknown", chain: [...chain] } };
  // Merge base-first, checking every redeclaration for kind/bound conflicts.
  const merged: Record<string, { kind: string }> = {};
  const baseAttrs = (base["attributes"] as readonly Record<string, unknown>[] | undefined) ?? [];
  for (const schema of baseAttrs) {
    if (typeof schema["name"] === "string" && typeof schema["kind"] === "string") {
      merged[schema["name"] as string] = { kind: schema["kind"] as string };
    }
  }
  const baseSchemas: Record<string, unknown> = {};
  for (const schema of baseAttrs) {
    if (typeof schema["name"] === "string") baseSchemas[schema["name"] as string] = schema;
  }
  for (let i = overlays.length - 1; i >= 0; i--) {
    for (const name of Object.keys(overlays[i]!.attributes).sort()) {
      const overlay = overlays[i]!.attributes[name];
      const kind = schemaKindOf(overlay);
      const baseSchema = baseSchemas[name];
      if (baseSchema !== undefined) {
        if (kind === null || kind !== schemaKindOf(baseSchema) || !sameKindBoundsCompatible(baseSchema, overlay)) {
          return { ok: false, failure: { error: "conflict", attribute: name, baseType: baseId } };
        }
        continue;
      }
      if (kind !== null) merged[name] = { kind };
    }
  }
  let container = (base as Record<string, unknown>)["container"] === true;
  if ((base as Record<string, unknown>)["abstract"] === true && chain.length === 1) {
    // Instantiating the abstract base itself refuses (Appendix C.2
    // abstract-instantiated); a concrete refinement stays instantiable.
    return { ok: false, failure: { error: "conflict", attribute: "<abstract>", baseType: baseId } };
  }
  for (const overlay of overlays) {
    if (overlay.id !== baseId && declared.get(overlay.id)?.["container"] === true) container = true;
    void overlay;
  }
  // Container capability also flows from any declared intermediate base.
  for (const id of chain) {
    if (declared.get(id)?.["container"] === true) container = true;
  }
  return {
    ok: true,
    effective: {
      baseId, chain, container,
      abstractBase: (base as Record<string, unknown>)["abstract"] === true,
      attrs: merged,
    },
  };
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
  exempt: Readonly<Set<string>>,
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

function collectLeaves(value: unknown, base: string, out: Map<string, string>): void {
  if (typeof value !== "object" || value === null) {
    out.set(base, canonicalBytes(value));
    return;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      out.set(base, canonicalBytes(value));
      return;
    }
    value.forEach((item, index) => collectLeaves(item, `${base}.${index}`, out));
    return;
  }
  const keys = Object.keys(value as Record<string, unknown>);
  if (keys.length === 0) {
    out.set(base, canonicalBytes(value));
    return;
  }
  for (const key of keys.sort()) {
    collectLeaves((value as Record<string, unknown>)[key], base === "" ? key : `${base}.${key}`, out);
  }
}

/** Source subtrees audited for lossless migration (DiagramState inputs). */
function auditSourceLeaves(source: MigDocument, retainedViews: readonly MigView[]): Map<string, string> {
  const out = new Map<string, string>();
  collectLeaves(source.profileRefs, "profileRefs", out);
  collectLeaves(source.entities, "entities", out);
  collectLeaves(source.relations, "relations", out);
  if (source.ports !== undefined) collectLeaves(source.ports, "ports", out);
  if (source.typeDefinitions !== undefined) collectLeaves(source.typeDefinitions, "typeDefinitions", out);
  if (source.schemaVersion !== undefined) collectLeaves(source.schemaVersion, "schemaVersion", out);
  if (source.resources !== undefined) collectLeaves(source.resources, "resources", out);
  if (source.extensions !== undefined) collectLeaves(source.extensions, "extensions", out);
  out.set("documentId", canonicalBytes(source.documentId));
  out.set("revision", canonicalBytes(source.revision));
  retainedViews.forEach((view, index) => collectLeaves(view, `retainedViews.${index}`, out));
  return out;
}

function auditTargetLeaves(target: MigDocument): Map<string, string> {
  const out = new Map<string, string>();
  collectLeaves(target.profileRefs, "profileRefs", out);
  collectLeaves(target.entities, "entities", out);
  collectLeaves(target.relations, "relations", out);
  if (target.ports !== undefined) collectLeaves(target.ports, "ports", out);
  if (target.typeDefinitions !== undefined) collectLeaves(target.typeDefinitions, "typeDefinitions", out);
  if (target.schemaVersion !== undefined) collectLeaves(target.schemaVersion, "schemaVersion", out);
  if (target.resources !== undefined) collectLeaves(target.resources, "resources", out);
  if (target.extensions !== undefined) collectLeaves(target.extensions, "extensions", out);
  out.set("documentId", canonicalBytes(target.documentId));
  out.set("revision", canonicalBytes(target.revision));
  (target.views ?? []).forEach((view, index) => collectLeaves(view, `retainedViews.${index}`, out));
  return out;
}

/**
 * Declared patch coverage: a source leaf path is covered when it is
 * unchanged in the target, or when a declared patch path names it (exact
 * path or a parent record path recorded alongside the operation).
 */
function findUndeclaredLoss(
  sourceLeaves: Map<string, string>,
  targetLeaves: Map<string, string>,
  declared: Readonly<Set<string>>,
): string | null {
  for (const [path, bytes] of [...sourceLeaves.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (targetLeaves.get(path) === bytes) continue;
    let covered = false;
    for (const patch of declared) {
      if (path === patch || path.startsWith(`${patch}.`) || patch.startsWith(`${path}.`)) {
        covered = true;
        break;
      }
    }
    if (!covered) return path;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Retained-view validation against the pinned ViewDocument shape (spec
// §§2.2/3.2.2/4.4.2): closed field sets, occurrence bindings, complete
// presentation values and provenance pairing. A view that fails refuses
// before any write (design note, section B).
// ---------------------------------------------------------------------------

const VIEW_TOP_FIELDS: Readonly<Set<string>> = new Set([
  "viewId", "semanticDocumentId", "revision",
  "entityOccurrences", "relationOccurrences", "portOccurrences",
  "groups", "filters", "presentation", "summaryLabels",
]);
const OCCURRENCE_FIELDS: Readonly<Set<string>> = new Set(["id", "entity", "group", "geometry"]);
const REL_OCCURRENCE_FIELDS: Readonly<Set<string>> = new Set(["id", "relation", "endpoints", "waypoints", "strokeStyle"]);
const ENDPOINT_FIELDS: Readonly<Set<string>> = new Set(["role", "occurrence", "semanticTarget", "sourceOccurrence"]);
const PORT_OCCURRENCE_FIELDS: Readonly<Set<string>> = new Set(["id", "port", "ownerOccurrence", "side", "order", "anchor", "geometry"]);
const GROUP_FIELDS: Readonly<Set<string>> = new Set(["id", "label", "collapsed", "occurrence"]);
const FILTER_FIELDS: Readonly<Set<string>> = new Set(["kind", "collapsed", "occurrences", "label", "mode"]);
const PRESENTATION_FIELDS: Readonly<Set<string>> = new Set(["camera", "grid", "theme", "diagram"]);
const DIAGRAM_FIELDS: Readonly<Set<string>> = new Set(["contractPin", "entities", "legends", "categoryTokens"]);
const ENTITY_PRESENTATION_FIELDS: Readonly<Set<string>> = new Set(["form", "text", "icon", "categoryRef"]);
const TEXT_SLOT_FIELDS: Readonly<Set<string>> = new Set(["title", "kicker", "body", "detail", "subtitle", "footer"]);
const SUMMARY_DEFINITION_FIELDS: Readonly<Set<string>> = new Set([
  "id", "sourceOccurrence", "targetOccurrence", "label", "relationIds", "strokeStyle",
]);

function closedKeys(value: unknown, allowed: Readonly<Set<string>>): string | null {
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

export interface GenericMigrationOptions {
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

export function migrateGenericV1ToV2(source: MigDocument, options: GenericMigrationOptions = {}): MigrationReport {
  const from: Pin = { id: "generic", version: "1.0.0", contentDigest: GENERIC_V1_CONTENT };
  const to: Pin = { id: "generic", version: "2.0.0", contentDigest: GENERIC_V2.contentDigest };
  const ops: MigrationOperation[] = [];
  const declared = new Set<string>();
  const fail = (path: string, reason: MigrationRefusalReason, detail?: string): MigrationRefusal =>
    refuse(GENERIC_MIGRATION_ID, from, to, source, ops,
      detail === undefined ? [{ path, reason }] : [{ path, reason, detail }]);

  const refs = [...source.profileRefs];
  if (refs.filter((r) => r === "generic@1").length !== 1) {
    return fail("", refs.includes("generic@2") ? "target-already-present" : "missing-source-profile");
  }
  if (refs.includes("generic@2")) return fail("", "target-already-present");
  const nextRefs = refs.map((r) => (r === "generic@1" ? "generic@2" : r));
  ops.push({ path: "profileRefs", action: "replace-profile-ref", detail: "generic@1→generic@2" });
  nextRefs.forEach((ref, index) => {
    if (ref !== refs[index]) declared.add(`profileRefs.${index}`);
  });

  const targetDecl = GENERIC_V2.declaration as Record<string, unknown>;
  const reserved = governedIds(targetDecl);
  const nextDefinitions: Record<string, unknown> = {};
  for (const id of sortedKeys(source.typeDefinitions)) {
    if (reserved.has(id)) return fail(`typeDefinitions.${id}`, "incompatible-attribute-schema");
    const definition = structuredClone(source.typeDefinitions![id]);
    const rebased = rewriteRecordProfile(definition, "generic@1", "generic@2");
    const cleaned = stripMigratedSlots(rebased, `typeDefinitions.${id}`, ops, declared);
    nextDefinitions[id] = cleaned;
    ops.push({ path: `typeDefinitions.${id}`, action: "preserve-residual-refinement" });
    if ((definition as Record<string, unknown>)["profile"] === "generic@1") {
      declared.add(`typeDefinitions.${id}.profile`);
    }
  }

  // Retained views for this transaction. Moves are keyed by
  // (view id, occurrence id): two views may reuse an occurrence id for
  // different entities, and each view keeps its own entity's strings.
  const retainedViews = options.views ?? source.views ?? [];
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
    declared.add("presentation.contractPin");
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
    const resolved = resolveEffectiveType(targetDecl, source.typeDefinitions, entity.type);
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
    const nextAttrs: Record<string, MigAttribute> = {};
    const moved = new Set<string>();
    for (const [key, value] of sortedAttributes(entity.attributes)) {
      if (TEXT_SLOT_NAMES.includes(key) || key === ICON_SLOT) {
        moved.add(key);
        continue;
      }
      if (key === "collapsed" && resolved.effective.container) continue;
      nextAttrs[key] = structuredClone(value);
    }
    for (const slot of [...moved].sort()) {
      ops.push({ path: `entities.${id}.attributes.${slot}`, action: "move-to-view-presentation", detail: "per-view occurrence destinations" });
      declared.add(`entities.${id}.attributes.${slot}`);
    }
    if (resolved.effective.container && entity.attributes["collapsed"] !== undefined) {
      const collapsed = entity.attributes["collapsed"];
      const state = collapsed.value === true ? "was-true" : collapsed.value === false ? "was-false" : "was-absent";
      ops.push({ path: `entities.${id}.attributes.collapsed`, action: "remove-semantic-collapsed", detail: state });
      declared.add(`entities.${id}.attributes.collapsed`);
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
    entities[id] = { id, profile: "generic@2", type: entity.type, attributes: nextAttrs };
    ops.push({ path: `entities.${id}.profile`, action: "rewrite-profile", detail: "generic@1→generic@2" });
    declared.add(`entities.${id}.profile`);
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
    const nextAttrs: Record<string, MigAttribute> = {};
    for (const [k, v] of sortedAttributes(rel.attributes)) nextAttrs[k] = structuredClone(v);
    relations[id] = { ...structuredClone(rel), profile: "generic@2", attributes: nextAttrs };
    ops.push({ path: `relations.${id}.profile`, action: "rewrite-profile", detail: "generic@1→generic@2" });
    declared.add(`relations.${id}.profile`);
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
      declared.add(`ports.${id}.profile`);
    }
  }

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
      diagram["contractPin"] = { ...options.contractPin! };
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
          form: existing["form"] ?? formForEntityType(source.entities[view.entityOccurrences[occId]!.entity]?.type ?? "node"),
          text: existingText,
        };
        presentationMoves[`${view.viewId}/${occId}`] = reportSlots;
        declared.add(`retainedViews.${retainedViews.indexOf(view)}.presentation.diagram.entities.${occId}`);
      }
      diagram["entities"] = diagramEntities;
      if (diagram["legends"] === undefined) diagram["legends"] = {};
      if (diagram["categoryTokens"] === undefined) diagram["categoryTokens"] = [];
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
        declared.add(`retainedViews.${retainedViews.indexOf(view)}.groups.${groupId}`);
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
  const loss = findUndeclaredLoss(auditSourceLeaves(source, retainedViews), auditTargetLeaves(target), declared);
  if (loss !== null) return fail(loss, "incompatible-attribute-schema", `undeclared-path-loss:${loss}`);
  return {
    migrationId: GENERIC_MIGRATION_ID, from, to,
    originalSha256: sha256Hex(canonicalBytes(source)),
    originalCanonical: structuredClone(source),
    operations: ops, unmigrated: [],
    ...(Object.keys(presentationMoves).length > 0 ? { presentationMoves } : {}),
    ...(foldSeeds.length > 0 ? { foldSeeds: [...foldSeeds].sort() } : {}),
    ...(source.typeDefinitions !== undefined ? { residuals: nextDefinitions } : {}),
    outcome: "ok", target,
  };
}

/**
 * Strip migrated presentation slots from a residual refinement definition
 * (rebased residual, §3.13.1 step 2): the slots moved to typed view
 * presentation are removed from the residual; every removal is a declared
 * patch path.
 */
function stripMigratedSlots(
  definition: unknown, basePath: string,
  ops: MigrationOperation[], declared: Set<string>,
): unknown {
  if (!isRecord(definition)) return definition;
  const attributes = definition["attributes"];
  if (!isRecord(attributes)) return definition;
  let changed = false;
  const next = { ...attributes };
  for (const slot of [...TEXT_SLOT_NAMES, ICON_SLOT, "subtitle"]) {
    if (next[slot] !== undefined) {
      delete next[slot];
      changed = true;
      ops.push({ path: `${basePath}.attributes.${slot}`, action: "remove-migrated-slot", detail: "moved to typed view presentation" });
      declared.add(`${basePath}.attributes.${slot}`);
    }
  }
  void changed;
  return { ...definition, attributes: next };
}

// ---------------------------------------------------------------------------
// archimate@1 → archimate@2 (spec §3.13.2 + §3.9 matrix)
// ---------------------------------------------------------------------------

export const ARCHIMATE_MIGRATION_ID = "engram:migration-archimate-1-2" as const;

export function migrateArchimateV1ToV2(
  source: MigDocument, mapping: Readonly<Record<string, string>>,
): MigrationReport {
  const from: Pin = { id: "archimate", version: "1.0.0", contentDigest: ARCHIMATE_V1_CONTENT };
  const to: Pin = { id: "archimate", version: "2.0.0", contentDigest: ARCHIMATE_V2.contentDigest };
  const ops: MigrationOperation[] = [];
  const declared = new Set<string>();
  const fail = (path: string, reason: MigrationRefusalReason, detail?: string): MigrationRefusal =>
    refuse(ARCHIMATE_MIGRATION_ID, from, to, source, ops,
      detail === undefined ? [{ path, reason }] : [{ path, reason, detail }]);

  if (source.profileRefs.filter((r) => r === "archimate@1").length !== 1) {
    return fail("", source.profileRefs.includes("archimate@2") ? "target-already-present" : "missing-source-profile");
  }
  if (source.profileRefs.includes("archimate@2")) return fail("", "target-already-present");
  const nextRefs = source.profileRefs.map((r) => (r === "archimate@1" ? "archimate@2" : r));
  ops.push({ path: "profileRefs", action: "replace-profile-ref", detail: "archimate@1→archimate@2" });
  nextRefs.forEach((ref, index) => {
    if (ref !== source.profileRefs[index]) declared.add(`profileRefs.${index}`);
  });

  const targetDecl = ARCHIMATE_V2.declaration as Record<string, unknown>;
  const reserved = governedIds(targetDecl);
  const nextDefinitions: Record<string, unknown> = {};
  for (const id of sortedKeys(source.typeDefinitions)) {
    if (reserved.has(id)) return fail(`typeDefinitions.${id}`, "incompatible-attribute-schema");
    const definition = source.typeDefinitions![id];
    const cleaned = stripMigratedSlots(
      rewriteRecordProfile(structuredClone(definition), "archimate@1", "archimate@2"),
      `typeDefinitions.${id}`, ops, declared,
    );
    nextDefinitions[id] = cleaned;
    ops.push({ path: `typeDefinitions.${id}`, action: "preserve-residual-refinement" });
    if (isRecord(definition) && definition["profile"] === "archimate@1") {
      declared.add(`typeDefinitions.${id}.profile`);
    }
  }

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
    if (entity.type === "junction" || entity.type === "grouping") {
      const mapped = mapping[id];
      if (mapped !== undefined && mapped !== entity.type) {
        return fail(`entities.${id}.type`, "incompatible-attribute-schema");
      }
      const resolved = resolveEffectiveType(targetDecl, source.typeDefinitions, entity.type);
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
      entityTypeOf.set(id, entity.type);
      entities[id] = {
        id, profile: "archimate@2", type: entity.type,
        attributes: structuredClone(entity.attributes) as Record<string, MigAttribute>,
      };
      ops.push({ path: `entities.${id}.profile`, action: "rewrite-profile", detail: "archimate@1→archimate@2; meaning retained" });
      declared.add(`entities.${id}.profile`);
      continue;
    }
    const mapped = mapping[id];
    if (mapped === undefined) return fail(`entities.${id}`, "missing-type-mapping");
    const row = catalogueById.get(mapped);
    if (row === undefined) return fail(`entities.${id}`, "missing-type-mapping");
    // A refined @1 element resolves through the shared resolver first:
    // an incompatible redeclaration refuses, and the explicit mapping
    // must name the resolved nearest catalogue ancestor (spec §3.13.2
    // assignment + §5.1/matrix nearest-ancestor rule). An unresolvable
    // chain refuses fail-closed; it never silently keeps the mapping.
    if (source.typeDefinitions?.[entity.type] !== undefined) {
      const own = resolveEffectiveType(targetDecl, source.typeDefinitions, entity.type);
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
    const resolved = resolveEffectiveType(targetDecl, source.typeDefinitions, mapped);
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
      declared.add(`entities.${id}.attributes.layer`);
    } else {
      delete nextAttrs["layer"];
      ops.push({ path: `entities.${id}.attributes.layer`, action: "drop-fabricated-layer", detail: "none is not a value" });
      declared.add(`entities.${id}.attributes.layer`);
    }
    nextAttrs["aspect"] = { kind: "enum", value: row.aspect };
    ops.push({ path: `entities.${id}.attributes.aspect`, action: "derive-from-catalogue", detail: row.aspect });
    declared.add(`entities.${id}.attributes.aspect`);
    ops.push({ path: `entities.${id}.type`, action: "map-to-catalogue", detail: `${entity.type}→${mapped}` });
    declared.add(`entities.${id}.type`);
    for (const [key] of sortedAttributes(nextAttrs)) {
      if (resolved.effective.attrs[key] === undefined && !conversionExempt.has(key)) {
        ops.push({ path: `entities.${id}.attributes.${key}`, action: "retain-domain-attribute", detail: "present-unchanged" });
      }
    }
    entities[id] = { id, profile: "archimate@2", type: mapped, attributes: nextAttrs };
    ops.push({ path: `entities.${id}.profile`, action: "rewrite-profile", detail: "archimate@1→archimate@2" });
    declared.add(`entities.${id}.profile`);
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
    const nextAttrs: Record<string, MigAttribute> = {};
    for (const [k, v] of sortedAttributes(rel.attributes)) nextAttrs[k] = structuredClone(v);
    relations[id] = { ...structuredClone(rel), profile: "archimate@2", attributes: nextAttrs };
    ops.push({ path: `relations.${id}.profile`, action: "rewrite-profile", detail: `matrix allows ${rel.type}(${srcType}→${tgtType})` });
    declared.add(`relations.${id}.profile`);
  }

  const ports: Record<string, unknown> = {};
  for (const id of sortedKeys(source.ports as Readonly<Record<string, unknown>> | undefined)) {
    const port = (source.ports as Record<string, unknown>)[id]!;
    if (typeof port === "object" && port !== null && (port as Record<string, unknown>)["profile"] === "archimate@1") {
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
  const loss = findUndeclaredLoss(auditSourceLeaves(source, retainedViews), auditTargetLeaves(target), declared);
  if (loss !== null) return fail(loss, "incompatible-attribute-schema", `undeclared-path-loss:${loss}`);
  return {
    migrationId: ARCHIMATE_MIGRATION_ID, from, to,
    originalSha256: sha256Hex(canonicalBytes(source)),
    originalCanonical: structuredClone(source),
    operations: ops, unmigrated: [],
    ...(source.typeDefinitions !== undefined ? { residuals: nextDefinitions } : {}),
    outcome: "ok", target,
  };
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
const UML_STEREOTYPE_TARGETS: Readonly<Set<string>> = new Set([
  "class", "interface", "package", "property", "operation",
]);

/** A declared stereotype, resolved in the source document — never trusted from the caller. */
function resolveDeclaredStereotype(
  source: MigDocument, ref: string,
): { extends: readonly string[] } | { missing: true } | { invalid: true } {
  const record = source.entities[ref];
  if (record === undefined) return { missing: true };
  // Ownership: the declaring record belongs to the source family.
  if (record.profile !== "uml@1") return { invalid: true };
  if (record.type !== "stereotype") return { invalid: true };
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

export function migrateUmlV1ToV2(source: MigDocument, input: UmlMigrationInput): MigrationReport {
  const from: Pin = { id: "uml", version: "1.0.0", contentDigest: UML_V1_CONTENT };
  const to: Pin = { id: "uml", version: "2.0.0", contentDigest: UML_V2.contentDigest };
  const ops: MigrationOperation[] = [];
  const declared = new Set<string>();
  const fail = (path: string, reason: MigrationRefusalReason, detail?: string): MigrationRefusal =>
    refuse(UML_MIGRATION_ID, from, to, source, ops,
      detail === undefined ? [{ path, reason }] : [{ path, reason, detail }]);

  if (source.profileRefs.filter((r) => r === "uml@1").length !== 1) {
    return fail("", source.profileRefs.includes("uml@2") ? "target-already-present" : "missing-source-profile");
  }
  if (source.profileRefs.includes("uml@2")) return fail("", "target-already-present");
  const nextRefs = source.profileRefs.map((r) => (r === "uml@1" ? "uml@2" : r));
  ops.push({ path: "profileRefs", action: "replace-profile-ref", detail: "uml@1→uml@2" });
  nextRefs.forEach((ref, index) => {
    if (ref !== source.profileRefs[index]) declared.add(`profileRefs.${index}`);
  });

  const targetDecl = UML_V2.declaration as Record<string, unknown>;
  const reserved = governedIds(targetDecl);
  const nextDefinitions: Record<string, unknown> = {};
  for (const id of sortedKeys(source.typeDefinitions)) {
    if (reserved.has(id)) return fail(`typeDefinitions.${id}`, "incompatible-attribute-schema");
    const definition = source.typeDefinitions![id];
    const cleaned = stripMigratedSlots(
      rewriteRecordProfile(structuredClone(definition), "uml@1", "uml@2"),
      `typeDefinitions.${id}`, ops, declared,
    );
    nextDefinitions[id] = cleaned;
    ops.push({ path: `typeDefinitions.${id}`, action: "preserve-residual-refinement" });
    if (isRecord(definition) && definition["profile"] === "uml@1") {
      declared.add(`typeDefinitions.${id}.profile`);
    }
  }

  // Conversion-exempt attribute names per record kind (declared conversions).
  const exemptFor = (entity: MigEntity): Set<string> => {
    if (entity.type === "property") return new Set(["multiplicity"]);
    if (entity.type === "stereotype") return new Set(["extends"]);
    return new Set(["stereotypes"]);
  };

  const entities: Record<string, MigEntity> = {};
  for (const id of sortedKeys(source.entities)) {
    const entity = source.entities[id]!;
    if (entity.profile !== "uml@1") {
      entities[id] = structuredClone(entity);
      continue;
    }
    const resolved = resolveEffectiveType(targetDecl, source.typeDefinitions, entity.type);
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
    const exempt = exemptFor(entity);
    const overlap = checkValueKindOverlap(entity.attributes, resolved.effective, exempt);
    if (overlap !== null) {
      return fail(`entities.${id}.attributes.${overlap.attribute}`, "type-definition-conflict", "incompatible-attribute-schema");
    }
    const nextAttrs: Record<string, MigAttribute> = {};
    for (const [key, attr] of sortedAttributes(entity.attributes)) {
      if (key === "multiplicity" && entity.type === "property") {
        const raw = getText(attr);
        if (raw === null) return fail(`entities.${id}.attributes.multiplicity`, "multiplicity-syntax");
        const parsed = parseMultiplicity(raw);
        if (!parsed.ok) return fail(`entities.${id}.attributes.multiplicity`, parsed.reason);
        nextAttrs[key] = multiplicityStruct(parsed.lower, parsed.upper);
        ops.push({ path: `entities.${id}.attributes.multiplicity`, action: "parse-multiplicity", detail: `${raw}→${parsed.lower}/${parsed.upper}` });
        declared.add(`entities.${id}.attributes.multiplicity`);
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
          if (!declaredStereotype.extends.includes(entity.type)) {
            return fail(`entities.${id}.attributes.stereotypes[${i}]`, "stereotype-application-invalid");
          }
          converted.push({ kind: "reference", value: ref });
        }
        nextAttrs[key] = { kind: "collection", items: converted };
        ops.push({ path: `entities.${id}.attributes.stereotypes`, action: "map-stereotypes", detail: `${attr.items.length} item(s)` });
        declared.add(`entities.${id}.attributes.stereotypes`);
      } else if (key === "extends" && entity.type === "stereotype" && attr.kind === "collection" && Array.isArray(attr.items)) {
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
        declared.add(`entities.${id}.attributes.extends`);
      } else {
        nextAttrs[key] = structuredClone(attr);
        if (resolved.effective.attrs[key] === undefined) {
          ops.push({ path: `entities.${id}.attributes.${key}`, action: "retain-domain-attribute", detail: "present-unchanged" });
        }
      }
    }
    entities[id] = { id, profile: "uml@2", type: entity.type, attributes: nextAttrs };
    ops.push({ path: `entities.${id}.profile`, action: "rewrite-profile", detail: "uml@1→uml@2" });
    declared.add(`entities.${id}.profile`);
  }

  const relations: Record<string, MigRelation> = {};
  for (const id of sortedKeys(source.relations)) {
    const rel = source.relations[id]!;
    if (rel.profile !== "uml@1") {
      relations[id] = structuredClone(rel);
      continue;
    }
    const nextAttrs: Record<string, MigAttribute> = {};
    for (const [key, attr] of sortedAttributes(rel.attributes)) {
      if ((key === "sourceMultiplicity" || key === "targetMultiplicity") && rel.type === "association") {
        const raw = getText(attr);
        if (raw === null) return fail(`relations.${id}.attributes.${key}`, "multiplicity-syntax");
        const parsed = parseMultiplicity(raw);
        if (!parsed.ok) return fail(`relations.${id}.attributes.${key}`, parsed.reason);
        nextAttrs[key] = multiplicityStruct(parsed.lower, parsed.upper);
        ops.push({ path: `relations.${id}.attributes.${key}`, action: "parse-multiplicity", detail: `${raw}→${parsed.lower}/${parsed.upper}` });
        declared.add(`relations.${id}.attributes.${key}`);
      } else {
        nextAttrs[key] = structuredClone(attr);
      }
    }
    relations[id] = { ...structuredClone(rel), profile: "uml@2", attributes: nextAttrs };
    ops.push({ path: `relations.${id}.profile`, action: "rewrite-profile", detail: "uml@1→uml@2" });
    declared.add(`relations.${id}.profile`);
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
  const loss = findUndeclaredLoss(auditSourceLeaves(source, retainedViews), auditTargetLeaves(target), declared);
  if (loss !== null) return fail(loss, "incompatible-attribute-schema", `undeclared-path-loss:${loss}`);
  return {
    migrationId: UML_MIGRATION_ID, from, to,
    originalSha256: sha256Hex(canonicalBytes(source)),
    originalCanonical: structuredClone(source),
    operations: ops, unmigrated: [],
    ...(source.typeDefinitions !== undefined ? { residuals: nextDefinitions } : {}),
    outcome: "ok", target,
  };
}

// @1 source pins live in diagram-skeletons.ts (transcribed @1 declarations).
