// Engram G0 records and catalog envelopes for the diagram lot
// (frozen spec M3-R4 deb64b75, §7.4). Governed data, S1 draft stage:
// no receipt exists, so every record is draft/superseded and every
// admission test expects missing-receipt until U-QUAL resolves (DS + Engram).
// Production namespace/owner lookups remain U-ID; "diagram"/"engram" below
// are the specified candidate identities, not registry evidence.
import { canonicalBytes, sha256Hex } from "./canonical.js";
import { entryDigestOf, pinsDigestOf } from "./digests.js";
import type { Digest, OntologyRecord, Pin } from "./types.js";
import type { OntologyPayload, RegistryEnvelope } from "./catalog.js";
import { ARCHIMATE_V2, GENERIC_V2, UML_V2, diagramPresentationBinding } from "./diagram-profiles.js";
import type { GovernedProfile } from "./diagram-profiles.js";
import {
  ARCHIMATE_V1_CONTENT,
  ARCHIMATE_V1_PIN,
  GENERIC_V1_CONTENT,
  GENERIC_V1_PIN,
  UML_V1_CONTENT,
  UML_V1_PIN,
} from "./diagram-skeletons.js";
import {
  ARCHIMATE_MIGRATION_ID,
  GENERIC_MIGRATION_ID,
  UML_MIGRATION_ID,
} from "./diagram-migrations.js";
import { DIAGRAM_PRESENTATION_CONTRACT_SCHEMA, DIAGRAM_SEMANTIC_SCHEMA } from "./diagram-schemas.js";

export const DIAGRAM_NAMESPACE = "diagram" as const;
export const DIAGRAM_OWNER = "engram" as const;
export const DIAGRAM_PROVENANCE = {
  sourceRef: "m3/SPEC_EVOL_GD_M3_DIAGRAM_MODEL-FROZEN-deb64b75.md",
  sourceRevision: "deb64b75e884bfefbdd97de698c899805568271ea1fc521fffe02cbc20288c2f",
} as const;

/** Transitional executor/adapter refs: explicitly unqualified (U-QUAL). */
export const TRANSITIONAL_COMPATIBILITY = {
  renderer: "transitional:ds-diagram-core-executor-unqualified",
  adapter: "transitional:ds-schema-adapter-unqualified",
} as const;

export const GENERIC_V2_PIN: Pin = { id: "generic", version: "2.0.0", contentDigest: GENERIC_V2.contentDigest };
export const ARCHIMATE_V2_PIN: Pin = { id: "archimate", version: "2.0.0", contentDigest: ARCHIMATE_V2.contentDigest };
export const UML_V2_PIN: Pin = { id: "uml", version: "2.0.0", contentDigest: UML_V2.contentDigest };

// --- Lot corpus manifest (S1 draft corpus, not admission evidence) ---
// Each entry pins a fixture file by its raw-byte SHA-256 (§8.5 discipline).

export interface CorpusFixturePin {
  readonly path: string;
  readonly sha256: Digest;
}

export const LOT_CORPUS_FIXTURES: readonly CorpusFixturePin[] = [
  { path: "tests/fixtures/pinned-sources/ds-generic-ts.bytes", sha256: "b19967fe65483abdbf0e271f197e13691904e4b087c1542de23c52e2ad4f45c3" },
  { path: "tests/fixtures/pinned-sources/ds-skeletons-ts.bytes", sha256: "0a01fd2569e68c2b99ca754f28dc7cbbbd9a1d491ffa9981161cae3bbf56b54e" },
  { path: "tests/fixtures/pinned-sources/archimate-skeleton-document.json", sha256: "8395ccc32ac25ae1354271817a3358bfe6f96243ecdfe2e5ef45ae1f48683951" },
  { path: "tests/fixtures/pinned-sources/uml-skeleton-document.json", sha256: "eea74144a37d9e44456278eeb36b06c5c2d7f9b4d19136a6b8ed3ce6ea3b08d8" },
  { path: "tests/fixtures/pinned-sources/bpmn-canvas-canonical-ts.bytes", sha256: "287d8cb87beb7384fc89a8d6141681010dcba50ee895aaadc3b31345541191ba" },
  { path: "tests/fixtures/pinned-sources/m3-a3-serialization-specimen.json", sha256: "2f280be912e381881f3c8c68e7fb28189f95a515121927a64d4bbb04e9062c76" },
  { path: "tests/fixtures/generic-v1-minimal-document.json", sha256: "76bbe5b8f1323c85a141830156a6e47cce5aa3b9198988ad5c172b1f23fbbd16" },
];

export const LOT_CORPUS_REF = "engram:diagram-lot-corpus/1" as const;
export const LOT_CORPUS_DIGEST: Digest = sha256Hex(
  canonicalBytes({ corpus: LOT_CORPUS_REF, fixtures: LOT_CORPUS_FIXTURES.map((f) => ({ path: f.path, sha256: f.sha256 })) }),
);

// @1 skeleton corpora: the pinned source-document bytes themselves.
export const GENERIC_V1_CORPUS = { ref: "engram:generic-1-minimal-corpus", digest: "76bbe5b8f1323c85a141830156a6e47cce5aa3b9198988ad5c172b1f23fbbd16" as Digest };
export const ARCHIMATE_V1_CORPUS = {
  ref: "engram:archimate-1-skeleton-corpus",
  digest: "8395ccc32ac25ae1354271817a3358bfe6f96243ecdfe2e5ef45ae1f48683951" as Digest,
};
export const UML_V1_CORPUS = {
  ref: "engram:uml-1-skeleton-corpus",
  digest: "eea74144a37d9e44456278eeb36b06c5c2d7f9b4d19136a6b8ed3ce6ea3b08d8" as Digest,
};

function baseRecord(
  id: string, pin: Pin, governed: GovernedProfile, canonicalRef: string,
): OntologyRecord {
  return {
    namespace: DIAGRAM_NAMESPACE,
    id,
    version: pin.version,
    owner: DIAGRAM_OWNER,
    lifecycle: "draft",
    completeness: "complete",
    visibility: "public",
    profileShape: "diagram-profile",
    artifactKind: "base",
    profileRef: { canonicalRef, contentDigest: governed.contentDigest },
    corpusRef: { ref: LOT_CORPUS_REF, digest: LOT_CORPUS_DIGEST },
    digests: {
      contentDigest: governed.contentDigest,
      pinsDigest: pinsDigestOf({ layers: [pin] }),
      resultEvidence: { evidenceState: "unresolved" },
    },
    lineage: { parents: [], mappings: [], migrations: [migrationOf(id)] },
    consumers: [],
  };
}

function migrationOf(id: string): string {
  if (id === "generic") return GENERIC_MIGRATION_ID;
  if (id === "archimate") return ARCHIMATE_MIGRATION_ID;
  return UML_MIGRATION_ID;
}

export const RECORD_GENERIC_V2 = baseRecord("generic", GENERIC_V2_PIN, GENERIC_V2, "engram:generic@2");
export const RECORD_ARCHIMATE_V2 = baseRecord("archimate", ARCHIMATE_V2_PIN, ARCHIMATE_V2, "engram:archimate@2");
export const RECORD_UML_V2 = baseRecord("uml", UML_V2_PIN, UML_V2, "engram:uml@2");

function supersededRecord(
  id: string, pin: Pin, contentDigest: Digest, completeness: "skeleton" | "complete",
  canonicalRef: string, corpusRef: { ref: string; digest: Digest }, successor: Pin, migrationRef: string,
): OntologyRecord {
  return {
    namespace: DIAGRAM_NAMESPACE,
    id,
    version: pin.version,
    owner: DIAGRAM_OWNER,
    lifecycle: "superseded",
    completeness,
    visibility: "public",
    profileShape: "diagram-profile",
    artifactKind: "base",
    profileRef: { canonicalRef, contentDigest },
    corpusRef,
    digests: {
      contentDigest,
      pinsDigest: pinsDigestOf({ layers: [pin] }),
      resultEvidence: { evidenceState: "unresolved" },
    },
    lineage: { parents: [], mappings: [], migrations: [migrationRef] },
    consumers: [],
    supersededBy: successor,
    migrationRef,
  };
}

export const RECORD_GENERIC_V1 = supersededRecord(
  "generic", GENERIC_V1_PIN, GENERIC_V1_CONTENT, "complete",
  "engram:generic@1", GENERIC_V1_CORPUS, GENERIC_V2_PIN, GENERIC_MIGRATION_ID,
);
export const RECORD_ARCHIMATE_V1 = supersededRecord(
  "archimate", ARCHIMATE_V1_PIN, ARCHIMATE_V1_CONTENT, "skeleton",
  "engram:archimate@1", ARCHIMATE_V1_CORPUS, ARCHIMATE_V2_PIN, ARCHIMATE_MIGRATION_ID,
);
export const RECORD_UML_V1 = supersededRecord(
  "uml", UML_V1_PIN, UML_V1_CONTENT, "skeleton",
  "engram:uml@1", UML_V1_CORPUS, UML_V2_PIN, UML_MIGRATION_ID,
);

// --- diagram-presentation@1 contract record ---

export const CONTRACT_DESCRIPTOR = {
  id: "diagram-presentation@1",
  artifactKind: "contract",
  schemaPin: DIAGRAM_PRESENTATION_CONTRACT_SCHEMA.pin,
  compatibilityMatrixVersion: "1",
} as const;

export const CONTRACT_CONTENT: Digest = sha256Hex(canonicalBytes({ ...CONTRACT_DESCRIPTOR }));
export const CONTRACT_PIN: Pin = { id: "diagram-presentation", version: "1", contentDigest: CONTRACT_CONTENT };

export const RECORD_CONTRACT: OntologyRecord = {
  namespace: DIAGRAM_NAMESPACE,
  id: "diagram-presentation",
  version: "1",
  owner: DIAGRAM_OWNER,
  lifecycle: "draft",
  completeness: "complete",
  visibility: "public",
  profileShape: "mechanism-descriptor",
  artifactKind: "contract",
  profileRef: { canonicalRef: "engram:diagram-presentation@1", contentDigest: CONTRACT_CONTENT },
  corpusRef: { ref: LOT_CORPUS_REF, digest: LOT_CORPUS_DIGEST },
  digests: {
    contentDigest: CONTRACT_CONTENT,
    pinsDigest: pinsDigestOf({ layers: [CONTRACT_PIN] }),
    resultEvidence: { evidenceState: "unresolved" },
  },
  lineage: { parents: [], mappings: [], migrations: [] },
  consumers: [],
};

export function contractBindingOf(): { artifactKind: "contract"; schemaPin: Pin; compatibilityMatrixVersion: "1" } {
  return diagramPresentationBinding(DIAGRAM_PRESENTATION_CONTRACT_SCHEMA.pin);
}

/** Supersession table (§3.13.4): replacements carry empty composition ancestry. */
export interface SupersessionRow {
  readonly from: Pin;
  readonly supersededBy: Pin;
  readonly migrationRef: string;
}

export const SUPERSESSION: readonly SupersessionRow[] = [
  { from: GENERIC_V1_PIN, supersededBy: GENERIC_V2_PIN, migrationRef: GENERIC_MIGRATION_ID },
  { from: ARCHIMATE_V1_PIN, supersededBy: ARCHIMATE_V2_PIN, migrationRef: ARCHIMATE_MIGRATION_ID },
  { from: UML_V1_PIN, supersededBy: UML_V2_PIN, migrationRef: UML_MIGRATION_ID },
];

// --- Catalog envelopes ---

function profilePayload(
  record: OntologyRecord, pin: Pin, governed: GovernedProfile, canonicalRef: string,
): OntologyPayload {
  if (record.lifecycle === "superseded" || record.artifactKind !== "base") throw new Error("profile-payload-requires-draft-base");
  return {
    canonicalRef,
    namespace: record.namespace,
    owner: record.owner,
    profileShape: "diagram-profile",
    artifactKind: "base",
    profilePin: pin,
    stack: [pin],
    digests: {
      contentDigest: governed.contentDigest,
      pinsDigest: pinsDigestOf({ layers: [pin] }),
      resultEvidence: { evidenceState: "unresolved" },
    },
    ruleSheets: [],
    lifecycle: "draft",
    provenance: { ...DIAGRAM_PROVENANCE },
    lineage: { parents: [], mappings: [], migrations: [migrationOf(record.id)] },
    conflictPolicy: "engram:g0-conflicts@1",
    completeness: "complete",
    corpusRef: { ref: LOT_CORPUS_REF, digest: LOT_CORPUS_DIGEST },
    receipts: [],
    migrations: [migrationOf(record.id)],
    consumers: [],
    compatibility: { ...TRANSITIONAL_COMPATIBILITY },
    visibility: "public",
    linkedTools: [],
    artifactBinding: {
      artifactKind: "base",
      basePin: pin,
      bijectionEvidence: { evidenceState: "unresolved" },
    },
  };
}

function envelopeOf(
  id: string, name: string, description: string, schema: { pin: Pin; digest: Digest; schema: Record<string, unknown> },
  assetPath: string, assetDigest: Digest, payload: OntologyPayload,
): RegistryEnvelope {
  return {
    format: "sentropic.registry-entry/v1",
    contractVersion: "1.1.4",
    kind: "ontology",
    id,
    name,
    description,
    entryVersion: "1",
    publisher: { packageName: "engram-diagram-lot", packageVersion: "0.1.0" },
    compatibility: {
      entryContract: "1.1.4",
      packages: [],
      schemaProfiles: [`${schema.pin.id}/${schema.pin.version}`],
      requiredHostFeatures: ["ontology-descriptors"],
      optionalHostFeatures: [],
    },
    parameters: {
      schemaVersion: schema.pin.version,
      schema: { $ref: `engram:${schema.pin.id}` },
      defaults: {},
    },
    bindings: [
      { key: "profile", contract: `engram:diagram-profile/1#sha256=${DIAGRAM_SEMANTIC_SCHEMA.digest}`, required: true },
    ],
    assets: [{ role: "profile-data", path: assetPath, mediaType: "application/json", sha256: assetDigest }],
    ontology: payload,
  };
}

export const PAYLOAD_GENERIC_V2 = profilePayload(RECORD_GENERIC_V2, GENERIC_V2_PIN, GENERIC_V2, "engram:generic@2");
export const PAYLOAD_ARCHIMATE_V2 = profilePayload(RECORD_ARCHIMATE_V2, ARCHIMATE_V2_PIN, ARCHIMATE_V2, "engram:archimate@2");
export const PAYLOAD_UML_V2 = profilePayload(RECORD_UML_V2, UML_V2_PIN, UML_V2, "engram:uml@2");

export const PAYLOAD_CONTRACT: OntologyPayload = {
  canonicalRef: "engram:diagram-presentation@1",
  namespace: DIAGRAM_NAMESPACE,
  owner: DIAGRAM_OWNER,
  profileShape: "mechanism-descriptor",
  artifactKind: "contract",
  profilePin: CONTRACT_PIN,
  stack: [CONTRACT_PIN],
  digests: {
    contentDigest: CONTRACT_CONTENT,
    pinsDigest: pinsDigestOf({ layers: [CONTRACT_PIN] }),
    resultEvidence: { evidenceState: "unresolved" },
  },
  ruleSheets: [],
  lifecycle: "draft",
  provenance: { ...DIAGRAM_PROVENANCE },
  lineage: { parents: [], mappings: [], migrations: [] },
  conflictPolicy: "engram:g0-conflicts@1",
  completeness: "complete",
  corpusRef: { ref: LOT_CORPUS_REF, digest: LOT_CORPUS_DIGEST },
  receipts: [],
  migrations: [],
  consumers: [],
  compatibility: { ...TRANSITIONAL_COMPATIBILITY },
  visibility: "public",
  linkedTools: [],
  artifactBinding: {
    artifactKind: "contract",
    schemaPin: DIAGRAM_PRESENTATION_CONTRACT_SCHEMA.pin,
    compatibilityMatrixVersion: "1",
  },
};

export const ENVELOPE_GENERIC_V2 = envelopeOf(
  "engram-generic-2", "generic@2", "Governed generic diagram profile (S1 draft).",
  { ...DIAGRAM_SEMANTIC_SCHEMA, schema: DIAGRAM_SEMANTIC_SCHEMA.schema as Record<string, unknown> },
  "profiles/generic-2.json", GENERIC_V2.artifactDigest, PAYLOAD_GENERIC_V2,
);
export const ENVELOPE_ARCHIMATE_V2 = envelopeOf(
  "engram-archimate-2", "archimate@2", "Governed ArchiMate completion (S1 draft).",
  { ...DIAGRAM_SEMANTIC_SCHEMA, schema: DIAGRAM_SEMANTIC_SCHEMA.schema as Record<string, unknown> },
  "profiles/archimate-2.json", ARCHIMATE_V2.artifactDigest, PAYLOAD_ARCHIMATE_V2,
);
export const ENVELOPE_UML_V2 = envelopeOf(
  "engram-uml-2", "uml@2", "Governed UML class-diagram completion (S1 draft).",
  { ...DIAGRAM_SEMANTIC_SCHEMA, schema: DIAGRAM_SEMANTIC_SCHEMA.schema as Record<string, unknown> },
  "profiles/uml-2.json", UML_V2.artifactDigest, PAYLOAD_UML_V2,
);
export const ENVELOPE_CONTRACT = envelopeOf(
  "engram-diagram-presentation-1", "diagram-presentation@1", "Governed typed presentation contract (S1 draft).",
  { ...DIAGRAM_PRESENTATION_CONTRACT_SCHEMA, schema: DIAGRAM_PRESENTATION_CONTRACT_SCHEMA.schema as Record<string, unknown> },
  "contracts/diagram-presentation-1.json", CONTRACT_CONTENT, PAYLOAD_CONTRACT,
);

/** P-ENTRY, computed externally and never embedded (§7.3.1). */
export function envelopeEntryDigest(envelope: RegistryEnvelope): Digest {
  return entryDigestOf(envelope as unknown as Record<string, unknown>);
}
