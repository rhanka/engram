// Proposed archi@1 complete diagram profile and draft G0 registry record
// (spec/SPEC_EVOL_ARCHI_CARDS.md §2.1–§2.5).
import { canonicalBytes, sha256Hex } from "./canonical.js";
import type { OntologyPayload, RegistryEnvelope } from "./catalog.js";
import { contentDiagramDigest, pinsDigestOf } from "./digests.js";
import type { GovernedProfile } from "./diagram-profiles.js";
import type { CorpusFixturePin } from "./diagram-registry.js";
import { DIAGRAM_SEMANTIC_SCHEMA } from "./diagram-schemas.js";
import type { Digest, OntologyRecord, Pin } from "./types.js";

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

const KEY = "^[a-z][a-z0-9-]*$";
const text = (name: string, maxLength?: number, required = false) => ({
  name, kind: "text" as const, ...(required ? { required: true } : {}), ...(maxLength === undefined ? {} : { maxLength }),
});
const enumeration = (name: string, values: readonly string[], required = false) => ({
  name, kind: "enum" as const, values: [...values], ...(required ? { required: true } : {}),
});
const LIFECYCLE = ["current", "proposed", "retired"] as const;
const EVIDENCE = {
  name: "evidence", kind: "collection" as const, required: true,
  item: { kind: "text" as const, maxLength: 200 }, minItems: 1, maxItems: 8,
};
const CATEGORY = { name: "category", kind: "text" as const, minLength: 1, maxLength: 40, pattern: KEY, patternName: "key" };
const commonEntity = (roleRequired: boolean) => [
  text("name", 200, true), text("shortName", 40), text("role", 400, roleRequired),
  enumeration("lifecycle", LIFECYCLE, true), EVIDENCE, CATEGORY,
];
const commonRelation = [enumeration("lifecycle", LIFECYCLE, true), EVIDENCE, text("label", 120)];

const KINDS: Readonly<Record<string, readonly [string, boolean, readonly string[] | null, boolean, boolean, readonly Record<string, unknown>[]]>> = {
  actor: ["Actor", false, ["human", "agent", "team", "org"], false, false, []],
  system: ["System", true, null, false, true, []],
  repo: ["Repository", true, null, false, true, [text("url", 200)]],
  package: ["Package", true, ["library", "plugin", "app"], true, true, [text("version", 40)]],
  component: ["Component", false, null, false, true, []],
  runtime: ["Runtime", false, ["cli", "mcp-server", "daemon", "job", "hook"], true, true, []],
  service: ["Service", false, null, false, true, []],
  api: ["API", false, ["mcp", "http", "cli"], true, true, [enumeration("access", ["read-only", "read-write"], true)]],
  store: ["Store", false, ["jsonl", "file", "database", "object-store", "graph"], true, true, [enumeration("writerPolicy", ["single-writer", "multi-writer"], true)]],
  artifact: ["Artifact", false, ["skill", "manifest", "schema", "doc"], true, true, []],
  host: ["Host", true, ["workstation", "cluster", "cloud-project"], true, true, []],
};

const RELATIONS: readonly (readonly [string, readonly string[], readonly string[], string | null, readonly Record<string, unknown>[]])[] = [
  ["partOf", ["component", "artifact", "package", "runtime", "service", "api", "store", "system"], ["package", "system"], "archi-composition", []],
  ["managedIn", ["system", "package", "component", "runtime", "service", "api", "store", "artifact"], ["repo"], "archi-source", []],
  ["runsOn", ["runtime", "service"], ["host"], "archi-deployment", []],
  ["ownedBy", ["repo", "system", "package", "component", "runtime", "service", "api", "store", "artifact", "host"], ["actor"], "archi-ownership", []],
  ["operatedBy", ["service", "host"], ["actor", "system"], "archi-operation", []],
  ["deployedAs", ["package"], ["runtime", "service"], null, []],
  ["dependsOn", ["package"], ["package"], null, []],
  ["executedBy", ["component", "package"], ["runtime"], null, []],
  ["loadedBy", ["package", "artifact"], ["runtime"], null, []],
  ["invokes", ["runtime"], ["runtime"], null, [enumeration("trigger", ["hook", "poll", "mcp-stdio", "command", "schedule"], true), text("event", 80)]],
  ["providesApi", ["runtime", "service"], ["api"], null, []],
  ["consumesApi", ["runtime", "service", "actor"], ["api"], null, []],
  ["uses", ["actor"], ["runtime", "service", "system"], null, []],
  ["accesses", ["runtime", "service", "component"], ["store"], null, [enumeration("mode", ["read", "append", "write"], true)]],
  ["documents", ["artifact"], ["runtime", "api", "component", "package"], null, []],
];

const PART_OF: readonly (readonly [string, string])[] = [
  ["component", "package"], ["artifact", "package"], ["package", "system"], ["runtime", "system"],
  ["service", "system"], ["api", "system"], ["store", "system"], ["system", "system"],
];
const role = (name: string, entityTypes: readonly string[]) => ({
  role: name, cardinality: { min: 1, max: 1 }, targets: ["entity"], entityTypes: [...entityTypes],
});

/** proposed: closed 55-tuple relationship matrix for archi@1 (§2.3). */
export const ARCHI1_TUPLES = deepFreeze(
  RELATIONS.flatMap(([id, S, T]) =>
    (id === "partOf" ? PART_OF : S.flatMap((s) => T.map((t) => [s, t] as const))).map(([sourceType, targetType]) => ({
      relationType: id, sourceType, targetType,
    })),
  ),
);

/** proposed: native Profile declaration for archi@1 with poll trigger (§2.1–§2.5). */
export const ARCHI1_DECLARATION = deepFreeze({
  id: "archi@1", name: "archi", version: 1, completeness: "complete" as const,
  entityTypes: Object.entries(KINDS).map(([id, [label, container, forms, formRequired, roleRequired, extra]]) => ({
    id, label, ...(container ? { container: true } : {}),
    attributes: [...commonEntity(roleRequired), ...(forms ? [enumeration("form", forms, formRequired)] : []), ...extra],
  })),
  portTypes: [],
  relationTypes: RELATIONS.map(([id, S, T, h, extra]) => ({
    id, label: id, direction: "directed", roles: [role("source", S), role("target", T)],
    attributes: [...commonRelation, ...extra],
    ...(h ? { hierarchy: { id: h, shape: "tree", parentRole: "target", childRole: "source" } } : {}),
  })),
  constraints: [
    ...RELATIONS.filter((r) => r[3] !== null).map(([id, , , h]) => ({
      kind: "hierarchy", relationType: id, hierarchyId: h!, parentRole: "target", childRole: "source",
    })),
    { kind: "acyclic-hierarchy", hierarchyId: "archi-composition" },
    { kind: "required-parent", childTypes: ["component"], parentFamilyRoots: ["package"], hierarchyId: "archi-composition" },
    { kind: "relationship-matrix", matrixId: "archi-1", sourceRole: "source", targetRole: "target", tuples: ARCHI1_TUPLES },
  ],
  limits: { maxEntities: 100000, maxRelations: 500000, maxEndpointsPerRelation: 2 },
  notes: [],
});

/** proposed: governed profile bundle for archi@1 (§2.5). */
export const ARCHI_V1: GovernedProfile = deepFreeze({
  declaration: ARCHI1_DECLARATION,
  contentDigest: contentDiagramDigest({
    profile: ARCHI1_DECLARATION.id, completeness: ARCHI1_DECLARATION.completeness,
    entityTypes: ARCHI1_DECLARATION.entityTypes, portTypes: ARCHI1_DECLARATION.portTypes,
    relationTypes: ARCHI1_DECLARATION.relationTypes, constraints: ARCHI1_DECLARATION.constraints,
    limits: ARCHI1_DECLARATION.limits, notes: ARCHI1_DECLARATION.notes,
  }),
  artifactDigest: sha256Hex(canonicalBytes(ARCHI1_DECLARATION)),
});

/** proposed: exact Pin for archi@1 (§2.5). */
export const ARCHI_V1_PIN: Pin = deepFreeze({ id: "archi", version: "1.0.0", contentDigest: ARCHI_V1.contentDigest });

/** proposed: corpus reference for archi@1 S1 draft fixtures (§2.5, §6.1). */
export const ARCHI_CORPUS_REF = "engram:diagram-archi-corpus/1" as const;

/** proposed: raw-byte SHA-256 pins of every committed archi@1 corpus fixture (§2.5, §6.1). */
export const ARCHI_CORPUS_FIXTURES: readonly CorpusFixturePin[] = deepFreeze([
  { path: "tests/fixtures/archi/hosts-r3/document.json", sha256: "766b5bfc16080556889431caf10fc54925393ac5ce2097e0ca373c40d4bafe48" },
  { path: "tests/fixtures/archi/hosts-r3/manifest.json", sha256: "90f39d252002d283746e5fd0fe18601a6dd0691c816677d4e8948baeaaffb692" },
  { path: "tests/fixtures/archi/hosts-r3/view-specs/deploiement-hosts.json", sha256: "2f92579b1cefeeffc4fb013a4cee9ad277c3ff5463a7fde9d3125ffcdf3bca54" },
  { path: "tests/fixtures/archi/hosts-r3/view-specs/roles-hosts.json", sha256: "707d55e0e00410e23eacb2a0540f68d6896d8da3f9aaeb66dbcbe2031a6a07db" },
  { path: "tests/fixtures/archi/joint-r2-teintes/document.json", sha256: "b0626677981eff1faffe41da33d6f6c12863a06e11dac93c0fef55cc0ac6b644" },
  { path: "tests/fixtures/archi/joint-r2-teintes/manifest.json", sha256: "763f0d0e230d7319cacd192791a3821efd515cfba6f07ba2db1c49175fa74ef7" },
  { path: "tests/fixtures/archi/joint-r2-teintes/view-specs/roles-teintes.json", sha256: "ada1a60751f64901d5aac7fe8e370fbe0e664bccd8cf6b89fcffb2239cba00d0" },
  { path: "tests/fixtures/archi/joint-r2/document.json", sha256: "93fe81e1d1dbd8c56151cd9c0231c37997316ca2f77d8a476d37ff9416b8e181" },
  { path: "tests/fixtures/archi/joint-r2/manifest.json", sha256: "006b477ce8749c623433b4ceebc8d8bd5b094e40a1f38822076281ff341d0ece" },
  { path: "tests/fixtures/archi/joint-r2/view-specs/deploiement.json", sha256: "00a74b813f570ba24448883418bf713693f84b73a913578cdb91b83a6db9ae1d" },
  { path: "tests/fixtures/archi/joint-r2/view-specs/h2a-repo.json", sha256: "ebbec3006bddb1962e80109518ed5b6648814eb24742f5550f4343474ae26ffe" },
  { path: "tests/fixtures/archi/joint-r2/view-specs/roles-replie.json", sha256: "87fa1553a803727b2b3383dd19f5a4392d826705711b9276ddce9ce197db4221" },
  { path: "tests/fixtures/archi/joint-r2/view-specs/roles.json", sha256: "6225e4c0c207ff0eb76b1132ea1354c839777792b1c0a15afe8d155d2368cda7" },
]);

/** proposed: content-bound corpus digest for archi@1 S1 draft fixtures (§2.5). */
export const ARCHI_CORPUS_DIGEST: Digest = sha256Hex(
  canonicalBytes({ corpus: ARCHI_CORPUS_REF, fixtures: ARCHI_CORPUS_FIXTURES }),
);
const ARCHI_DIGESTS = {
  contentDigest: ARCHI_V1_PIN.contentDigest, pinsDigest: pinsDigestOf({ layers: [ARCHI_V1_PIN] }),
  resultEvidence: { evidenceState: "unresolved" as const },
};

/** proposed: draft G0 OntologyRecord for archi@1 (§2.5). */
export const RECORD_ARCHI_V1: OntologyRecord = deepFreeze({
  namespace: "diagram", id: "archi", version: ARCHI_V1_PIN.version, owner: "engram",
  lifecycle: "draft", completeness: "complete", visibility: "public", profileShape: "diagram-profile", artifactKind: "base",
  profileRef: { canonicalRef: "engram:archi@1", contentDigest: ARCHI_V1.contentDigest },
  corpusRef: { ref: ARCHI_CORPUS_REF, digest: ARCHI_CORPUS_DIGEST },
  digests: ARCHI_DIGESTS, lineage: { parents: [], mappings: [], migrations: [] }, consumers: [],
});

/** proposed: draft G0 OntologyPayload for archi@1 (§2.5). */
export const PAYLOAD_ARCHI_V1: OntologyPayload = deepFreeze({
  canonicalRef: "engram:archi@1", namespace: "diagram", owner: "engram",
  profileShape: "diagram-profile", artifactKind: "base", profilePin: ARCHI_V1_PIN, stack: [ARCHI_V1_PIN],
  digests: ARCHI_DIGESTS, ruleSheets: [], lifecycle: "draft",
  provenance: { sourceRef: "spec/SPEC_EVOL_ARCHI_CARDS.md", sourceRevision: "e46d822009e99bdb4f1e471a3cc2109bdd42ed1e" },
  lineage: { parents: [], mappings: [], migrations: [] }, conflictPolicy: "engram:g0-conflicts@1",
  completeness: "complete", corpusRef: { ref: ARCHI_CORPUS_REF, digest: ARCHI_CORPUS_DIGEST },
  receipts: [], migrations: [], consumers: [],
  compatibility: { renderer: "transitional:ds-diagram-core-executor-unqualified", adapter: "transitional:ds-schema-adapter-unqualified" },
  visibility: "public", linkedTools: [],
  artifactBinding: { artifactKind: "base", basePin: ARCHI_V1_PIN, bijectionEvidence: { evidenceState: "unresolved" } },
});

/** proposed: draft G0 RegistryEnvelope for archi@1 (§2.5). */
export const ENVELOPE_ARCHI_V1: RegistryEnvelope = deepFreeze({
  format: "sentropic.registry-entry/v1", contractVersion: "1.1.4", kind: "ontology",
  id: "engram-archi-1", name: "archi@1", description: "Governed archi@1 architecture vocabulary (S1 draft).",
  entryVersion: "1", publisher: { packageName: "engram-diagram-lot", packageVersion: "0.1.0" },
  compatibility: {
    entryContract: "1.1.4", packages: [], schemaProfiles: [`${DIAGRAM_SEMANTIC_SCHEMA.pin.id}/${DIAGRAM_SEMANTIC_SCHEMA.pin.version}`],
    requiredHostFeatures: ["ontology-descriptors"], optionalHostFeatures: [],
  },
  parameters: { schemaVersion: DIAGRAM_SEMANTIC_SCHEMA.pin.version, schema: { $ref: `engram:${DIAGRAM_SEMANTIC_SCHEMA.pin.id}` }, defaults: {} },
  bindings: [{ key: "profile", contract: `engram:diagram-profile/1#sha256=${DIAGRAM_SEMANTIC_SCHEMA.digest}`, required: true }],
  assets: [{ role: "profile-data", path: "profiles/archi-1.json", mediaType: "application/json", sha256: ARCHI_V1.artifactDigest }],
  ontology: PAYLOAD_ARCHI_V1,
});
