// Engram explicit @1 → @2 migrations (frozen spec M3-R4 deb64b75, §3.13).
// Pure functions over governed document data. Atomic: any blocking item
// refuses the whole state — the exact original is returned, no candidate.
// No executor, layout or rendering (G2). Full semantic target validation
// stays DS execution (U-QUAL); the structural post-scan (no source profile
// left on any migrated record) runs here before any success.
// Operations are recorded in canonical order: profileRefs, typeDefinitions
// by UTF-16 id, entities, relations, ports by id, then views by id. Record
// insertion order never changes report bytes: every map iteration below
// walks UTF-16-sorted keys, including attribute maps.
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

export interface MigView {
  readonly viewId: string;
  readonly revision: number;
  readonly entityOccurrences: Readonly<Record<string, MigOccurrence>>;
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

/** Closed report-reason vocabulary (spec Appendix C.1: report reasons). */
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
  | "endpoint-role-unknown"
  | "relationship-matrix-violation";

export interface UnmigratedItem {
  readonly path: string;
  readonly reason: MigrationRefusalReason;
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

/** Every entity/relation id declared by a governed @2 profile. */
function governedIds(declaration: Record<string, unknown>): Set<string> {
  const ids = new Set<string>();
  for (const group of ["entityTypes", "relationTypes", "portTypes"]) {
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

/** Presentation-only slots move to typed view presentation, never to @2 semantics. */
const PRESENTATION_SLOTS: Readonly<Record<string, number>> = {
  kicker: 80, body: 400, detail: 400, subtitle: 600, footer: 120, icon: 40,
};

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

function readPresentationText(view: MigView, occurrenceId: string): { holder: Record<string, unknown>; text: Record<string, unknown> } | null {
  const presentation = view.presentation;
  if (typeof presentation !== "object" || presentation === null) return null;
  const diagram = (presentation as Record<string, unknown>)["diagram"];
  if (typeof diagram !== "object" || diagram === null) return null;
  const entities = (diagram as Record<string, unknown>)["entities"];
  if (typeof entities !== "object" || entities === null) return null;
  const holder = (entities as Record<string, Record<string, unknown>>)[occurrenceId];
  if (holder === undefined) return null;
  const text = holder["text"];
  if (typeof text !== "object" || text === null) return null;
  return { holder, text: text as Record<string, unknown> };
}

export function migrateGenericV1ToV2(source: MigDocument, options: GenericMigrationOptions = {}): MigrationReport {
  const from: Pin = { id: "generic", version: "1.0.0", contentDigest: GENERIC_V1_CONTENT };
  const to: Pin = { id: "generic", version: "2.0.0", contentDigest: GENERIC_V2.contentDigest };
  const ops: MigrationOperation[] = [];
  const fail = (path: string, reason: MigrationRefusalReason): MigrationRefusal =>
    refuse(GENERIC_MIGRATION_ID, from, to, source, ops, [{ path, reason }]);

  const refs = [...source.profileRefs];
  if (refs.filter((r) => r === "generic@1").length !== 1) {
    return fail("", refs.includes("generic@2") ? "target-already-present" : "missing-source-profile");
  }
  if (refs.includes("generic@2")) return fail("", "target-already-present");
  const nextRefs = refs.map((r) => (r === "generic@1" ? "generic@2" : r));
  ops.push({ path: "profileRefs", action: "replace-profile-ref", detail: "generic@1→generic@2" });

  const reserved = governedIds(GENERIC_V2.declaration as Record<string, unknown>);
  const nextDefinitions: Record<string, unknown> = {};
  for (const id of sortedKeys(source.typeDefinitions)) {
    if (reserved.has(id)) return fail(`typeDefinitions.${id}`, "incompatible-attribute-schema");
    nextDefinitions[id] = rewriteRecordProfile(source.typeDefinitions![id], "generic@1", "generic@2");
    ops.push({ path: `typeDefinitions.${id}`, action: "preserve-residual-refinement" });
  }

  // Retained views for this transaction: every presentation slot needs a
  // retained occurrence destination, and the moves commit into those views.
  const retainedViews = options.views ?? source.views ?? [];
  const occurrenceByEntity = new Map<string, string[]>();
  for (const v of retainedViews) {
    for (const occId of sortedKeys(v.entityOccurrences)) {
      const occ = v.entityOccurrences[occId]!;
      const list = occurrenceByEntity.get(occ.entity) ?? [];
      list.push(occ.id);
      occurrenceByEntity.set(occ.entity, list);
    }
  }
  for (const list of occurrenceByEntity.values()) list.sort();
  const moves: Record<string, Record<string, unknown>> = {};
  for (const id of sortedKeys(source.entities)) {
    const entity = source.entities[id]!;
    for (const slot of Object.keys(PRESENTATION_SLOTS).sort()) {
      const attr = entity.attributes[slot];
      if (attr === undefined) continue;
      const value = getText(attr);
      if (value === null) return fail(`entities.${id}.attributes.${slot}`, "incompatible-attribute-schema");
      if (value.length > PRESENTATION_SLOTS[slot]!) {
        return fail(`entities.${id}.attributes.${slot}`, "incompatible-attribute-schema");
      }
      const destinations = occurrenceByEntity.get(id) ?? [];
      if (destinations.length === 0) return fail(`entities.${id}.attributes.${slot}`, "missing-presentation-destination");
      for (const occ of destinations) {
        (moves[occ] ??= {})[slot] = value;
      }
      ops.push({ path: `entities.${id}.attributes.${slot}`, action: "move-to-view-presentation", detail: `occurrences:${destinations.length}` });
    }
  }
  if (Object.keys(moves).length > 0 && options.contractPin === undefined) {
    return fail("presentation.contractPin", "missing-presentation-contract");
  }
  if (options.contractPin !== undefined && Object.keys(moves).length > 0) {
    ops.push({
      path: "presentation.contractPin",
      action: "bind-presentation-contract",
      detail: `${options.contractPin.id}/${options.contractPin.version}`,
    });
  }

  const entities: Record<string, MigEntity> = {};
  const foldSeeds: string[] = [];
  for (const id of sortedKeys(source.entities)) {
    const entity = source.entities[id]!;
    if (entity.profile === "generic@1") {
      if (entity.type === "container") {
        const collapsed = entity.attributes["collapsed"];
        const nextAttrs: Record<string, MigAttribute> = {};
        for (const [k, v] of sortedAttributes(entity.attributes)) {
          if (k === "collapsed" || k in PRESENTATION_SLOTS) continue;
          nextAttrs[k] = v;
        }
        const state = collapsed === undefined ? "was-absent" : collapsed.value === true ? "was-true" : "was-false";
        ops.push({ path: `entities.${id}.attributes.collapsed`, action: "remove-semantic-collapsed", detail: state });
        if (collapsed !== undefined && collapsed.value === true && options.seedFolds === true) {
          for (const occ of occurrenceByEntity.get(id) ?? []) foldSeeds.push(occ);
        }
        entities[id] = { id, profile: "generic@2", type: entity.type, attributes: nextAttrs };
      } else {
        const nextAttrs: Record<string, MigAttribute> = {};
        for (const [k, v] of sortedAttributes(entity.attributes)) {
          if (k in PRESENTATION_SLOTS) continue;
          nextAttrs[k] = v;
        }
        entities[id] = { id, profile: "generic@2", type: entity.type, attributes: nextAttrs };
      }
      ops.push({ path: `entities.${id}.profile`, action: "rewrite-profile", detail: "generic@1→generic@2" });
    } else {
      entities[id] = entity;
    }
  }

  const relations: Record<string, MigRelation> = {};
  let linkBoundRecorded = false;
  for (const id of sortedKeys(source.relations)) {
    const rel = source.relations[id]!;
    if (rel.profile === "generic@1") {
      const nextAttrs: Record<string, MigAttribute> = {};
      for (const [k, v] of sortedAttributes(rel.attributes)) nextAttrs[k] = v;
      relations[id] = { ...rel, profile: "generic@2", attributes: nextAttrs };
      ops.push({ path: `relations.${id}.profile`, action: "rewrite-profile", detail: "generic@1→generic@2" });
      if (rel.type === "link" && !linkBoundRecorded) {
        linkBoundRecorded = true;
        ops.push({ path: "relations.*.attributes.label", action: "record-bound-change", detail: "link.label 120→200; values never rewritten" });
      }
    } else {
      relations[id] = rel;
    }
  }

  const ports: Record<string, unknown> = {};
  for (const id of sortedKeys(source.ports as Readonly<Record<string, unknown>> | undefined)) {
    const port = (source.ports as Record<string, unknown>)[id]!;
    const next = rewriteRecordProfile(port, "generic@1", "generic@2");
    ports[id] = next;
    if (next !== port) {
      ops.push({ path: `ports.${id}.profile`, action: "rewrite-profile", detail: "generic@1→generic@2" });
    }
  }

  // Commit the moves into the retained views: clone every retained view,
  // apply each slot under presentation.diagram.entities, refuse atomically
  // on a conflicting destination value.
  const migratedViews: MigView[] = [];
  const sortedViews = [...retainedViews].sort((a, b) => (a.viewId < b.viewId ? -1 : a.viewId > b.viewId ? 1 : 0));
  for (const view of sortedViews) {
    const cloned = structuredClone(view) as unknown as Record<string, unknown>;
    const occMoves = Object.keys(moves).sort();
    if (occMoves.length > 0) {
      const presentation = (cloned["presentation"] as Record<string, unknown> | undefined) ?? {};
      const diagram = (presentation["diagram"] as Record<string, unknown> | undefined) ?? {};
      const diagramEntities = (diagram["entities"] as Record<string, Record<string, unknown>> | undefined) ?? {};
      for (const occ of occMoves) {
        if (view.entityOccurrences[occ] === undefined) continue;
        const slots = moves[occ]!;
        const existing = diagramEntities[occ] ?? {};
        const existingText = (existing["text"] as Record<string, unknown> | undefined) ?? {};
        for (const slot of Object.keys(slots).sort()) {
          if (existingText[slot] !== undefined && existingText[slot] !== slots[slot]) {
            return fail(`views.${view.viewId}.presentation.diagram.entities.${occ}.text.${slot}`, "destination-conflict");
          }
        }
        diagramEntities[occ] = {
          ...existing,
          form: existing["form"] ?? formForEntityType(source.entities[view.entityOccurrences[occ]!.entity]?.type ?? "node"),
          text: { ...existingText, ...slots },
        };
      }
      diagram["entities"] = diagramEntities;
      presentation["diagram"] = diagram;
      cloned["presentation"] = presentation;
    }
    migratedViews.push(cloned as unknown as MigView);
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
  return {
    migrationId: GENERIC_MIGRATION_ID, from, to,
    originalSha256: sha256Hex(canonicalBytes(source)),
    originalCanonical: structuredClone(source),
    operations: ops, unmigrated: [],
    ...(Object.keys(moves).length > 0 ? { presentationMoves: moves } : {}),
    ...(foldSeeds.length > 0 ? { foldSeeds: [...foldSeeds].sort() } : {}),
    ...(source.typeDefinitions !== undefined ? { residuals: nextDefinitions } : {}),
    outcome: "ok", target,
  };
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
  const fail = (path: string, reason: MigrationRefusalReason): MigrationRefusal =>
    refuse(ARCHIMATE_MIGRATION_ID, from, to, source, ops, [{ path, reason }]);

  if (source.profileRefs.filter((r) => r === "archimate@1").length !== 1) {
    return fail("", source.profileRefs.includes("archimate@2") ? "target-already-present" : "missing-source-profile");
  }
  if (source.profileRefs.includes("archimate@2")) return fail("", "target-already-present");

  const reserved = governedIds(ARCHIMATE_V2.declaration as Record<string, unknown>);
  const nextDefinitions: Record<string, unknown> = {};
  for (const id of sortedKeys(source.typeDefinitions)) {
    if (reserved.has(id)) return fail(`typeDefinitions.${id}`, "incompatible-attribute-schema");
    nextDefinitions[id] = rewriteRecordProfile(source.typeDefinitions![id], "archimate@1", "archimate@2");
    ops.push({ path: `typeDefinitions.${id}`, action: "preserve-residual-refinement" });
  }

  const catalogueById = new Map(ARCHIMATE_CATALOGUE.map((c) => [c.id, c]));
  const tuples = expandArchimateTuples();
  const allows = (relationship: string, s: string, t: string): boolean =>
    tuples.some((x) => x.relationType === relationship && x.sourceType === s && x.targetType === t);

  const entityTypeOf = new Map<string, string>();
  const entities: Record<string, MigEntity> = {};
  for (const id of sortedKeys(source.entities)) {
    const entity = source.entities[id]!;
    if (entity.profile !== "archimate@1") {
      entities[id] = entity;
      continue;
    }
    if (entity.type === "junction" || entity.type === "grouping") {
      const mapped = mapping[id];
      if (mapped !== undefined && mapped !== entity.type) {
        return fail(`entities.${id}.type`, "incompatible-attribute-schema");
      }
      entityTypeOf.set(id, entity.type);
      entities[id] = { ...entity, profile: "archimate@2" };
      ops.push({ path: `entities.${id}.profile`, action: "rewrite-profile", detail: "archimate@1→archimate@2; meaning retained" });
      continue;
    }
    const mapped = mapping[id];
    if (mapped === undefined) return fail(`entities.${id}`, "missing-type-mapping");
    const row = catalogueById.get(mapped);
    if (row === undefined) return fail(`entities.${id}`, "missing-type-mapping");
    entityTypeOf.set(id, mapped);
    const nextAttrs: Record<string, MigAttribute> = {};
    const name = entity.attributes["name"];
    if (mapped !== "grouping") {
      if (getText(name) === null) return fail(`entities.${id}.attributes.name`, "incompatible-attribute-schema");
      nextAttrs["name"] = name!;
    } else if (name !== undefined) {
      nextAttrs["name"] = name;
    }
    if (row.layer !== "none") {
      nextAttrs["layer"] = { kind: "enum", value: row.layer };
      ops.push({ path: `entities.${id}.attributes.layer`, action: "derive-from-catalogue", detail: row.layer });
    } else {
      ops.push({ path: `entities.${id}.attributes.layer`, action: "drop-fabricated-layer", detail: "none is not a value" });
    }
    nextAttrs["aspect"] = { kind: "enum", value: row.aspect };
    ops.push({ path: `entities.${id}.type`, action: "map-to-catalogue", detail: `${entity.type}→${mapped}` });
    entities[id] = { id, profile: "archimate@2", type: mapped, attributes: nextAttrs };
  }

  const relations: Record<string, MigRelation> = {};
  for (const id of sortedKeys(source.relations)) {
    const rel = source.relations[id]!;
    if (rel.profile !== "archimate@1") {
      relations[id] = rel;
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
    for (const [k, v] of sortedAttributes(rel.attributes)) nextAttrs[k] = v;
    relations[id] = { ...rel, profile: "archimate@2", attributes: nextAttrs };
    ops.push({ path: `relations.${id}.profile`, action: "rewrite-profile", detail: `matrix allows ${rel.type}(${srcType}→${tgtType})` });
  }

  const ports: Record<string, unknown> = {};
  for (const id of sortedKeys(source.ports as Readonly<Record<string, unknown>> | undefined)) {
    const port = (source.ports as Record<string, unknown>)[id]!;
    if (typeof port === "object" && port !== null && (port as Record<string, unknown>)["profile"] === "archimate@1") {
      return fail(`ports.${id}.profile`, "incompatible-attribute-schema");
    }
    ports[id] = port;
  }

  const target: MigDocument = {
    documentId: source.documentId, revision: source.revision,
    profileRefs: source.profileRefs.map((r) => (r === "archimate@1" ? "archimate@2" : r)),
    entities, relations,
    ...(source.ports !== undefined ? { ports } : {}),
    ...(source.views !== undefined ? { views: source.views } : {}),
    ...(source.schemaVersion !== undefined ? { schemaVersion: source.schemaVersion } : {}),
    ...(source.resources !== undefined ? { resources: source.resources } : {}),
    ...(source.extensions !== undefined ? { extensions: source.extensions } : {}),
    ...(source.typeDefinitions !== undefined ? { typeDefinitions: nextDefinitions } : {}),
  };
  const stray = checkTargetClean(target, "archimate@1", "archimate@2");
  if (stray !== null) return fail(stray, "incompatible-attribute-schema");
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

/** A declared stereotype, resolved in the source document — never trusted from the caller. */
function resolveDeclaredStereotype(
  source: MigDocument, ref: string,
): { extends: readonly string[] } | { missing: true } | { wrongType: true } {
  const record = source.entities[ref];
  if (record === undefined) return { missing: true };
  if (record.type !== "stereotype") return { wrongType: true };
  const extendsAttr = record.attributes["extends"];
  if (extendsAttr === undefined || extendsAttr.kind !== "collection" || !Array.isArray(extendsAttr.items)) {
    return { wrongType: true };
  }
  const values: string[] = [];
  for (const item of extendsAttr.items) {
    if ((item.kind !== "text" && item.kind !== "enum") || typeof item.value !== "string") return { wrongType: true };
    values.push(item.value);
  }
  return { extends: values };
}

export function migrateUmlV1ToV2(source: MigDocument, input: UmlMigrationInput): MigrationReport {
  const from: Pin = { id: "uml", version: "1.0.0", contentDigest: UML_V1_CONTENT };
  const to: Pin = { id: "uml", version: "2.0.0", contentDigest: UML_V2.contentDigest };
  const ops: MigrationOperation[] = [];
  const fail = (path: string, reason: MigrationRefusalReason): MigrationRefusal =>
    refuse(UML_MIGRATION_ID, from, to, source, ops, [{ path, reason }]);

  if (source.profileRefs.filter((r) => r === "uml@1").length !== 1) {
    return fail("", source.profileRefs.includes("uml@2") ? "target-already-present" : "missing-source-profile");
  }
  if (source.profileRefs.includes("uml@2")) return fail("", "target-already-present");

  const reserved = governedIds(UML_V2.declaration as Record<string, unknown>);
  const nextDefinitions: Record<string, unknown> = {};
  for (const id of sortedKeys(source.typeDefinitions)) {
    if (reserved.has(id)) return fail(`typeDefinitions.${id}`, "incompatible-attribute-schema");
    nextDefinitions[id] = rewriteRecordProfile(source.typeDefinitions![id], "uml@1", "uml@2");
    ops.push({ path: `typeDefinitions.${id}`, action: "preserve-residual-refinement" });
  }

  const entities: Record<string, MigEntity> = {};
  for (const id of sortedKeys(source.entities)) {
    const entity = source.entities[id]!;
    if (entity.profile !== "uml@1") {
      entities[id] = entity;
      continue;
    }
    const nextAttrs: Record<string, MigAttribute> = {};
    for (const [key, attr] of sortedAttributes(entity.attributes)) {
      if (key === "multiplicity" && (entity.type === "property")) {
        const raw = getText(attr);
        if (raw === null) return fail(`entities.${id}.attributes.multiplicity`, "multiplicity-syntax");
        const parsed = parseMultiplicity(raw);
        if (!parsed.ok) return fail(`entities.${id}.attributes.multiplicity`, parsed.reason);
        nextAttrs[key] = multiplicityStruct(parsed.lower, parsed.upper);
        ops.push({ path: `entities.${id}.attributes.multiplicity`, action: "parse-multiplicity", detail: `${raw}→${parsed.lower}/${parsed.upper}` });
      } else if (key === "stereotypes" && attr.kind === "collection" && Array.isArray(attr.items)) {
        const converted: MigAttribute[] = [];
        for (let i = 0; i < attr.items.length; i++) {
          const item = attr.items[i]!;
          const label = item.kind === "text" && typeof item.value === "string" ? item.value : null;
          if (label === null) return fail(`entities.${id}.attributes.stereotypes[${i}]`, "unmapped-stereotype");
          const ref = input.stereotypes[label];
          if (ref === undefined) return fail(`entities.${id}.attributes.stereotypes[${i}]`, "unmapped-stereotype");
          // The declaration is resolved in the candidate semantic context:
          // a dangling, wrong-type or inapplicable target refuses.
          const declared = resolveDeclaredStereotype(source, ref);
          if ("missing" in declared) return fail(`entities.${id}.attributes.stereotypes[${i}]`, "unmapped-stereotype");
          if ("wrongType" in declared) return fail(`entities.${id}.attributes.stereotypes[${i}]`, "stereotype-application-invalid");
          if (!declared.extends.includes(entity.type)) {
            return fail(`entities.${id}.attributes.stereotypes[${i}]`, "stereotype-application-invalid");
          }
          converted.push({ kind: "reference", value: ref });
        }
        nextAttrs[key] = { kind: "collection", items: converted };
        ops.push({ path: `entities.${id}.attributes.stereotypes`, action: "map-stereotypes", detail: `${attr.items.length} item(s)` });
      } else {
        nextAttrs[key] = attr;
      }
    }
    // A declared stereotype record migrates with the document; its
    // declaration was already resolved above before any applicant used it.
    entities[id] = { id, profile: "uml@2", type: entity.type, attributes: nextAttrs };
    ops.push({ path: `entities.${id}.profile`, action: "rewrite-profile", detail: "uml@1→uml@2" });
  }

  const relations: Record<string, MigRelation> = {};
  for (const id of sortedKeys(source.relations)) {
    const rel = source.relations[id]!;
    if (rel.profile !== "uml@1") {
      relations[id] = rel;
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
      } else {
        nextAttrs[key] = attr;
      }
    }
    relations[id] = { ...rel, profile: "uml@2", attributes: nextAttrs };
    ops.push({ path: `relations.${id}.profile`, action: "rewrite-profile", detail: "uml@1→uml@2" });
  }

  const ports: Record<string, unknown> = {};
  for (const id of sortedKeys(source.ports as Readonly<Record<string, unknown>> | undefined)) {
    const port = (source.ports as Record<string, unknown>)[id]!;
    if (typeof port === "object" && port !== null && (port as Record<string, unknown>)["profile"] === "uml@1") {
      return fail(`ports.${id}.profile`, "incompatible-attribute-schema");
    }
    ports[id] = port;
  }

  const target: MigDocument = {
    documentId: source.documentId, revision: source.revision,
    profileRefs: source.profileRefs.map((r) => (r === "uml@1" ? "uml@2" : r)),
    entities, relations,
    ...(source.ports !== undefined ? { ports } : {}),
    ...(source.views !== undefined ? { views: source.views } : {}),
    ...(source.schemaVersion !== undefined ? { schemaVersion: source.schemaVersion } : {}),
    ...(source.resources !== undefined ? { resources: source.resources } : {}),
    ...(source.extensions !== undefined ? { extensions: source.extensions } : {}),
    ...(source.typeDefinitions !== undefined ? { typeDefinitions: nextDefinitions } : {}),
  };
  const stray = checkTargetClean(target, "uml@1", "uml@2");
  if (stray !== null) return fail(stray, "incompatible-attribute-schema");
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
