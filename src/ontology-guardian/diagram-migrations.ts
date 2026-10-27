// Engram explicit @1 → @2 migrations (frozen spec M3-R4 deb64b75, §3.13).
// Pure functions over governed document data. Atomic: any blocking item
// refuses the whole state — the exact original is returned, no candidate.
// No executor, layout or rendering (G2). Full target validation stays DS
// execution (U-QUAL); the post-scan (no source profile left) runs here.
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
}

export interface MigrationOperation {
  readonly path: string;
  readonly action: string;
  readonly detail?: string;
}

export interface UnmigratedItem {
  readonly path: string;
  readonly reason: string;
}

export type MigrationOutcome = "ok" | "refused";

export interface MigrationReport {
  readonly migrationId: string;
  readonly from: Pin;
  readonly to: Pin;
  readonly originalSha256: Digest;
  readonly originalCanonical: MigDocument;
  readonly operations: readonly MigrationOperation[];
  readonly unmigrated: readonly UnmigratedItem[];
  readonly presentationMoves?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly foldSeeds?: readonly string[];
  readonly residuals?: Readonly<Record<string, Readonly<Record<string, MigAttribute>>>>;
  readonly outcome: MigrationOutcome;
  readonly target: MigDocument | null;
}

function refuse(
  migrationId: string, from: Pin, to: Pin, source: MigDocument,
  operations: MigrationOperation[], unmigrated: UnmigratedItem[],
): MigrationReport {
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
  readonly views?: readonly MigView[];
  readonly seedFolds?: boolean;
}

export function migrateGenericV1ToV2(source: MigDocument, options: GenericMigrationOptions = {}): MigrationReport {
  const from: Pin = { id: "generic", version: "1.0.0", contentDigest: GENERIC_V1_CONTENT };
  const to: Pin = { id: "generic", version: "2.0.0", contentDigest: GENERIC_V2.contentDigest };
  const ops: MigrationOperation[] = [];
  const blocked: UnmigratedItem[] = [];
  const fail = (path: string, reason: string): MigrationReport => refuse(GENERIC_MIGRATION_ID, from, to, source, ops, [...blocked, { path, reason }]);

  const refs = [...source.profileRefs];
  if (refs.filter((r) => r === "generic@1").length !== 1) {
    return fail("", refs.includes("generic@2") ? "target-already-present" : "missing-source-profile");
  }
  if (refs.includes("generic@2")) return fail("", "target-already-present");
  const nextRefs = refs.map((r) => (r === "generic@1" ? "generic@2" : r));
  ops.push({ path: "profileRefs", action: "replace-profile-ref", detail: "generic@1→generic@2" });

  const reserved = new Set(["node", "container", "legend", "legend-key", "link", "contains", "association", "port"]);
  for (const id of Object.keys(source.typeDefinitions ?? {}).sort()) {
    if (reserved.has(id)) return fail(`typeDefinitions.${id}`, "incompatible-attribute-schema");
    ops.push({ path: `typeDefinitions.${id}`, action: "preserve-residual-refinement" });
  }

  // Presentation-slot preflight: every slot needs a retained occurrence destination.
  const views = options.views ?? [];
  const occurrenceByEntity = new Map<string, string[]>();
  for (const v of views) {
    for (const occ of Object.values(v.entityOccurrences)) {
      const list = occurrenceByEntity.get(occ.entity) ?? [];
      list.push(occ.id);
      occurrenceByEntity.set(occ.entity, list);
    }
  }
  const moves: Record<string, Record<string, unknown>> = {};
  for (const id of Object.keys(source.entities).sort()) {
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

  const entities: Record<string, MigEntity> = {};
  const foldSeeds: string[] = [];
  for (const id of Object.keys(source.entities).sort()) {
    const entity = source.entities[id]!;
    if (entity.profile === "generic@1") {
      if (entity.type === "container") {
        const collapsed = entity.attributes["collapsed"];
        const nextAttrs: Record<string, MigAttribute> = {};
        for (const [k, v] of Object.entries(entity.attributes)) {
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
        for (const [k, v] of Object.entries(entity.attributes)) {
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
  for (const id of Object.keys(source.relations).sort()) {
    const rel = source.relations[id]!;
    if (rel.profile === "generic@1") {
      relations[id] = { ...rel, profile: "generic@2" };
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
  for (const id of Object.keys(source.ports ?? {}).sort()) {
    const port = (source.ports as Record<string, Record<string, unknown>>)[id]!;
    if (port["profile"] === "generic@1") {
      ports[id] = { ...port, profile: "generic@2" };
      ops.push({ path: `ports.${id}.profile`, action: "rewrite-profile", detail: "generic@1→generic@2" });
    } else {
      ports[id] = port;
    }
  }

  const target: MigDocument = {
    documentId: source.documentId, revision: source.revision, profileRefs: nextRefs,
    entities, relations,
    ...(source.ports !== undefined ? { ports } : {}),
    ...(source.views !== undefined ? { views: source.views } : {}),
    ...(source.resources !== undefined ? { resources: source.resources } : {}),
    ...(source.extensions !== undefined ? { extensions: source.extensions } : {}),
    ...(source.typeDefinitions !== undefined ? { typeDefinitions: source.typeDefinitions } : {}),
  };
  for (const [path, record] of Object.entries(target.entities)) {
    void path;
    if (record.profile === "generic@1") return fail("post-scan", "incompatible-attribute-schema");
  }
  for (const record of Object.values(target.relations)) {
    if (record.profile === "generic@1") return fail("post-scan", "incompatible-attribute-schema");
  }
  for (const port of Object.values((target.ports ?? {}) as Record<string, Record<string, unknown>>)) {
    if (port["profile"] === "generic@1") return fail("post-scan", "incompatible-attribute-schema");
  }
  return {
    migrationId: GENERIC_MIGRATION_ID, from, to,
    originalSha256: sha256Hex(canonicalBytes(source)),
    originalCanonical: structuredClone(source),
    operations: ops, unmigrated: [],
    ...(Object.keys(moves).length > 0 ? { presentationMoves: moves } : {}),
    ...(foldSeeds.length > 0 ? { foldSeeds: [...foldSeeds].sort() } : {}),
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
  const fail = (path: string, reason: string): MigrationReport => refuse(ARCHIMATE_MIGRATION_ID, from, to, source, ops, [{ path, reason }]);

  if (source.profileRefs.filter((r) => r === "archimate@1").length !== 1) {
    return fail("", source.profileRefs.includes("archimate@2") ? "target-already-present" : "missing-source-profile");
  }
  if (source.profileRefs.includes("archimate@2")) return fail("", "target-already-present");

  const catalogueById = new Map(ARCHIMATE_CATALOGUE.map((c) => [c.id, c]));
  const tuples = expandArchimateTuples();
  const allows = (relationship: string, s: string, t: string): boolean =>
    tuples.some((x) => x.relationType === relationship && x.sourceType === s && x.targetType === t);

  const entityTypeOf = new Map<string, string>();
  const entities: Record<string, MigEntity> = {};
  for (const id of Object.keys(source.entities).sort()) {
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
  for (const id of Object.keys(source.relations).sort()) {
    const rel = source.relations[id]!;
    if (rel.profile !== "archimate@1") {
      relations[id] = rel;
      continue;
    }
    const src = rel.endpoints.find((e) => e.role === "source").target;
    const tgt = rel.endpoints.find((e) => e.role === "target").target;
    const srcType = entityTypeOf.get(src);
    const tgtType = entityTypeOf.get(tgt);
    if (srcType === undefined || tgtType === undefined) return fail(`relations.${id}.endpoints`, "missing-type-mapping");
    if (!allows(rel.type, srcType, tgtType)) return fail(`relations.${id}.endpoints`, "relationship-matrix-violation");
    relations[id] = { ...rel, profile: "archimate@2" };
    ops.push({ path: `relations.${id}.profile`, action: "rewrite-profile", detail: `matrix allows ${rel.type}(${srcType}→${tgtType})` });
  }

  const target: MigDocument = {
    documentId: source.documentId, revision: source.revision,
    profileRefs: source.profileRefs.map((r) => (r === "archimate@1" ? "archimate@2" : r)),
    entities, relations,
    ...(source.ports !== undefined ? { ports: source.ports } : {}),
    ...(source.views !== undefined ? { views: source.views } : {}),
    ...(source.resources !== undefined ? { resources: source.resources } : {}),
    ...(source.extensions !== undefined ? { extensions: source.extensions } : {}),
  };
  return {
    migrationId: ARCHIMATE_MIGRATION_ID, from, to,
    originalSha256: sha256Hex(canonicalBytes(source)),
    originalCanonical: structuredClone(source),
    operations: ops, unmigrated: [], outcome: "ok", target,
  };
}

// ---------------------------------------------------------------------------
// uml@1 → uml@2 (spec §3.13.2 + §3.11)
// ---------------------------------------------------------------------------

export const UML_MIGRATION_ID = "engram:migration-uml-1-2" as const;

export interface UmlMigrationInput {
  readonly stereotypes: Readonly<Record<string, string>>;
  readonly declaredStereotypes?: Readonly<Record<string, { readonly extends: readonly string[] }>>;
}

export function migrateUmlV1ToV2(source: MigDocument, input: UmlMigrationInput): MigrationReport {
  const from: Pin = { id: "uml", version: "1.0.0", contentDigest: UML_V1_CONTENT };
  const to: Pin = { id: "uml", version: "2.0.0", contentDigest: UML_V2.contentDigest };
  const ops: MigrationOperation[] = [];
  const fail = (path: string, reason: string): MigrationReport => refuse(UML_MIGRATION_ID, from, to, source, ops, [{ path, reason }]);

  if (source.profileRefs.filter((r) => r === "uml@1").length !== 1) {
    return fail("", source.profileRefs.includes("uml@2") ? "target-already-present" : "missing-source-profile");
  }
  if (source.profileRefs.includes("uml@2")) return fail("", "target-already-present");

  const entities: Record<string, MigEntity> = {};
  for (const id of Object.keys(source.entities).sort()) {
    const entity = source.entities[id]!;
    if (entity.profile !== "uml@1") {
      entities[id] = entity;
      continue;
    }
    const nextAttrs: Record<string, MigAttribute> = {};
    for (const [key, attr] of Object.entries(entity.attributes)) {
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
          const declared = input.declaredStereotypes?.[ref];
          if (declared === undefined) return fail(`entities.${id}.attributes.stereotypes[${i}]`, "unmapped-stereotype");
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
    entities[id] = { id, profile: "uml@2", type: entity.type, attributes: nextAttrs };
    ops.push({ path: `entities.${id}.profile`, action: "rewrite-profile", detail: "uml@1→uml@2" });
  }

  const relations: Record<string, MigRelation> = {};
  for (const id of Object.keys(source.relations).sort()) {
    const rel = source.relations[id]!;
    if (rel.profile !== "uml@1") {
      relations[id] = rel;
      continue;
    }
    const nextAttrs: Record<string, MigAttribute> = {};
    for (const [key, attr] of Object.entries(rel.attributes)) {
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

  const target: MigDocument = {
    documentId: source.documentId, revision: source.revision,
    profileRefs: source.profileRefs.map((r) => (r === "uml@1" ? "uml@2" : r)),
    entities, relations,
    ...(source.ports !== undefined ? { ports: source.ports } : {}),
    ...(source.views !== undefined ? { views: source.views } : {}),
    ...(source.resources !== undefined ? { resources: source.resources } : {}),
    ...(source.extensions !== undefined ? { extensions: source.extensions } : {}),
  };
  return {
    migrationId: UML_MIGRATION_ID, from, to,
    originalSha256: sha256Hex(canonicalBytes(source)),
    originalCanonical: structuredClone(source),
    operations: ops, unmigrated: [], outcome: "ok", target,
  };
}

// @1 source pins live in diagram-skeletons.ts (transcribed @1 declarations).
