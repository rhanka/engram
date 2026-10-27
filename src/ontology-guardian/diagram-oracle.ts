// Engram acceptance oracle and deterministic case builders for the diagram
// lot (frozen spec M3-R4 deb64b75, §§8.4/8.7, A.1/A.2, C.6).
// Governed data plus pure builders only. Full corpus execution and receipt
// issuance stay owner-side (U-QUAL); the hashes below are the specified
// expected values the builders must reproduce from pinned bytes.
import { canonicalBytes, sha256Hex } from "./canonical.js";
import { ARCHIMATE_CATALOGUE, ARCHIMATE_CONCEPT_NAMES } from "./diagram-matrix-data.js";
import { ARCHIMATE_RELATIONSHIP_IDS } from "./diagram-profiles.js";
import type { MigDocument, MigEntity, MigRelation } from "./diagram-migrations.js";
import type { NativeViewDocument } from "./diagram-native-types.js";

/**
 * stable-id/1, transcribed from the pinned bpmn-canvas bytes
 * (tests/fixtures/pinned-sources/bpmn-canvas-canonical-ts.bytes):
 * `g_` plus the canonical digest of ["profile-mechanism/1", owner, slot, key].
 * Callers supply the allocation owner explicitly; the sealed expectations
 * below are replayed by executing this function, never by copying literals.
 */
export function stableId(ownerId: string, slot: string, stableKey: string): string {
  return `g_${sha256Hex(canonicalBytes(["profile-mechanism/1", ownerId, slot, stableKey]))}`;
}

/** Sealed stable-id allocations from identity-stable-id.json (role: allocations). */
export const SEALED_STABLE_ID_ALLOCATIONS: readonly { readonly owner: string; readonly slot: string; readonly key: string }[] = [
  { owner: "Process_1", slot: "aid", key: "new-note" },
  { owner: "Definitions_support", slot: "collaboration", key: "Process_A" },
  { owner: "Process_é", slot: "aid", key: "clé" },
  { owner: "𐀀owner", slot: "slot-1", key: "key-𐀀" },
];

export const ORACLE_SCHEMA_VERSION = "m3-r4-oracle/1" as const;
export const ORACLE_SOURCE = {
  sourceRef: "m3/SPEC_EVOL_GD_M3_DIAGRAM_MODEL-FROZEN-deb64b75.md",
  sourceRevision: "deb64b75e884bfefbdd97de698c899805568271ea1fc521fffe02cbc20288c2f",
} as const;

/** Derived-projection digests (§8.7): the specified expected values. */
export const ORACLE_PROJECTION_DIGESTS = {
  whole: "08cae540e5535727fc1f4b7bba3aa12d84908790b6c918dc263b65560ab4f2de",
  categoryTokens: "a77e2a62ddd6d576f06005969361ee15c241789fe8a571e6195dfb5c2782b3bf",
  a1Summaries: "e363601a0c116197a471a599e92dc94da16147f0e7e78346c1ab7c7df9a49018",
  a5EntitiesPresentation: "527a0b18c1afee9e71591d6c2e3ef8d68294c89d5f0e593527b31a47b207a2b8",
} as const;

/** Sealed JCS numbers vector (§8.5): the exact expected canonical text. */
export const JCS_NUMBERS_CASE: readonly number[] = [
  1e21, 1e-7, 0, 5e-324, 1, 100000000000000000000, 123456789012345680000, 0.000001,
];
export const JCS_NUMBERS_CANONICAL =
  "[1e+21,1e-7,0,5e-324,1,100000000000000000000,123456789012345680000,0.000001]";

/** Sealed stable-id expectations (§8.5), produced by stable-id/1 (owner: bpmn-canvas). */
export const STABLE_ID_EXPECTATIONS: readonly string[] = [
  "g_61b268027699fa668a9b0e3eced8130a2b2e188f426051e9ad25ebb1e33a800c",
  "g_0a8caa16444f4c61e14ffc4d7b77eb0dd75f8764840be0d3d7b8be550c0923d1",
  "g_fda08c83ba8214a3e2d869831822d1cc754d9ef15cf9b93fe975e9b48dec7a6b",
  "g_58599b7f84255d80c005b2dcda149676afeb0f7045dd6a162ea609ea523ac618",
];

/** One ArchiMate matrix case: every ordered pair × every relation has a verdict. */
export interface ArchimateMatrixCase {
  readonly relationType: string;
  readonly sourceType: string;
  readonly targetType: string;
  readonly expected: "allowed" | "rejected";
}

/**
 * Deterministic builder for the complete 62×62×11 = 42,284-case corpus
 * (Appendix A.4): each expanded tuple yields an allowed case, every absent
 * tuple a rejection. Concept order follows the pinned source order.
 */
export function buildArchimateMatrixCases(
  tuples: ReadonlyArray<{ relationType: string; sourceType: string; targetType: string }>,
  relationshipIds: readonly string[],
): ArchimateMatrixCase[] {
  const typeId = (name: string): string =>
    name === "Relationship" ? "@relation" : name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
  const allowed = new Set(tuples.map((t) => `${t.relationType}\0${t.sourceType}\0${t.targetType}`));
  const cases: ArchimateMatrixCase[] = [];
  for (const sourceName of ARCHIMATE_CONCEPT_NAMES) {
    for (const targetName of ARCHIMATE_CONCEPT_NAMES) {
      for (const relationType of relationshipIds) {
        const sourceType = typeId(sourceName);
        const targetType = typeId(targetName);
        cases.push({
          relationType, sourceType, targetType,
          expected: allowed.has(`${relationType}\0${sourceType}\0${targetType}`) ? "allowed" : "rejected",
        });
      }
    }
  }
  return cases;
}

export interface ArchimateDocumentCase extends ArchimateMatrixCase {
  readonly document: MigDocument;
  readonly view: NativeViewDocument;
  readonly expectedSemanticDiagnostics: readonly Record<string, unknown>[];
  readonly expectedViewDiagnostics: readonly [];
}

/** Complete, unlaid-out native inputs for every pair, including RelationRef targets.
 * Expected diagnostics are C.2 fixture data, never a claimed executor result.
 */
export function materializeArchimateMatrixCase(row: ArchimateMatrixCase): ArchimateDocumentCase {
  const entities: Record<string, MigEntity> = {};
  const relations: Record<string, MigRelation> = {};
  const makeEntity = (id: string, type: string): void => {
    const entry = ARCHIMATE_CATALOGUE.find(entry => entry.id === type);
    if (entry === undefined) throw new Error(`unknown corpus catalogue type: ${type}`);
    entities[id] = { id, profile: "archimate@2", type, attributes: {
      ...(type === "junction" ? { operator: { kind: "enum", value: "and" } } : { name: { kind: "text", value: id } }),
      ...(entry.layer === "none" ? {} : { layer: { kind: "enum", value: entry.layer } }),
      aspect: { kind: "enum", value: entry.aspect },
    } };
  };
  const target = (side: string, type: string): string => {
    if (type !== "@relation") { const id = `entity:${side}`; makeEntity(id, type); return id; }
    makeEntity("entity:anchor-actor", "business-actor"); makeEntity("entity:anchor-process", "business-process");
    const id = `relation:${side}-anchor`;
    relations[id] = { id, profile: "archimate@2", type: "assignment", attributes: {}, endpoints: [
      { role: "source", target: "entity:anchor-actor" }, { role: "target", target: "entity:anchor-process" },
    ] };
    return id;
  };
  const source = target("source", row.sourceType), destination = target("target", row.targetType);
  relations["relation:case"] = { id: "relation:case", profile: "archimate@2", type: row.relationType, attributes: {},
    endpoints: [{ role: "source", target: source }, { role: "target", target: destination }] };
  const occurrence = (id: string): string => `occurrence:${id.replace(":", "-")}`;
  const document: MigDocument = { documentId: "document:matrix-case", schemaVersion: { major: 2, minor: 0 }, revision: 1,
    profileRefs: ["archimate@2"], entities, relations, ports: {}, resources: {}, extensions: [], typeDefinitions: {} };
  const view: NativeViewDocument = { viewId: "view:matrix-case", semanticDocumentId: document.documentId, revision: 1,
    entityOccurrences: Object.fromEntries(Object.entries(entities).map(([id]) => [occurrence(id), {
      id: occurrence(id), entity: id, geometry: { x: 0, y: 0, width: 460, height: 200 },
    }])),
    relationOccurrences: Object.fromEntries(Object.entries(relations).map(([id, relation]) => [occurrence(id), {
      id: occurrence(id), relation: id,
      endpoints: relation.endpoints.map(endpoint => ({ role: endpoint.role, occurrence: occurrence(endpoint.target) })),
    }])), portOccurrences: {}, groups: {}, filters: [], presentation: { camera: { x: 0, y: 0, zoom: 1 } },
  };
  return { ...row, document, view, expectedViewDiagnostics: [], expectedSemanticDiagnostics: row.expected === "allowed" ? [] : [{
    code: "relationship-matrix-violation", severity: "error", path: "relations.relation:case.endpoints",
    message: `relation relation:case of type ${row.relationType} is not allowed from ${row.sourceType} to ${row.targetType} by matrix archimate-3.2`,
    refs: ["relation:case", source, destination],
    details: { matrixId: "archimate-3.2", relationType: row.relationType, sourceType: row.sourceType, targetType: row.targetType },
  }] };
}

/** One A.2 multiplicity oracle row: parsed bounds or the specified refusal. */
export type UmlMultiplicityExpectation =
  | { readonly ok: true; readonly lower: number; readonly upper: number }
  | { readonly ok: false; readonly reason: "multiplicity-syntax" | "multiplicity-invalid" };

export interface UmlMultiplicityCase {
  readonly input: string;
  readonly expected: UmlMultiplicityExpectation;
}

/** Appendix A.2 admitted notations and refusals, transcribed in order. */
export const UML_MULTIPLICITY_ORACLE: readonly UmlMultiplicityCase[] = [
  { input: "1", expected: { ok: true, lower: 1, upper: 1 } },
  { input: "0..1", expected: { ok: true, lower: 0, upper: 1 } },
  { input: "1..5", expected: { ok: true, lower: 1, upper: 5 } },
  { input: "*", expected: { ok: true, lower: 0, upper: -1 } },
  { input: "1..*", expected: { ok: true, lower: 1, upper: -1 } },
  { input: " 1", expected: { ok: false, reason: "multiplicity-syntax" } },
  { input: "1 ", expected: { ok: false, reason: "multiplicity-syntax" } },
  { input: "one", expected: { ok: false, reason: "multiplicity-syntax" } },
  { input: "", expected: { ok: false, reason: "multiplicity-syntax" } },
  { input: "1...2", expected: { ok: false, reason: "multiplicity-syntax" } },
];

/**
 * Appendix C.6 deterministic case id:
 * "case_" + SHA-256(raw source-pin file bytes || "\n" || RFC 8785(mutation)).
 */
export function derivedCaseId(sourcePinFileBytes: string, mutation: unknown): string {
  return `case_${sha256Hex(`${sourcePinFileBytes}\n${canonicalBytes(mutation)}`)}`;
}
