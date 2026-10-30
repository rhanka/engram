// request-lifecycle@1 G0 record and catalog binding (SPEC_REQUEST_LIFECYCLE_ONTOLOGY.md §2.2, Amendment A1).
// Governed data only, mirroring the OpenERP pattern (openerp-profile.ts, openerp-registry.ts):
// identity, digests and lineage from the committed preimages. corpusRef, receipts, consumers,
// compatibility, linkedTools, provenance and licence closure are admission tasks, never invented
// here (OQ-RL-6, OQ-RL-8). catalog.ts stays a pure type module and is not modified.
import type { Digest, OntologyRecord, Pin } from "../ontology-guardian/types.js";
import { pinsDigestOf } from "../ontology-guardian/digests.js";

/** §2.2 spec vectors (recomputed by tests through the guardian module). */
export const REQUEST_LIFECYCLE_CONTENT_DIGEST: Digest =
  "ff25f82dfc392bbcf7cbbe67bde7f55b9a53c12fd4771e25fb104d1f66f77282";
export const REQUEST_LIFECYCLE_PIN: Pin = {
  id: "request-lifecycle",
  version: "1",
  contentDigest: REQUEST_LIFECYCLE_CONTENT_DIGEST,
};
export const REQUEST_LIFECYCLE_PINS_DIGEST: Digest =
  "dc7f4b125e6ae070c0d310d2af7fd39939447a89c0b8b9b5371c9c933bea54d3";

/** P-PINS over the single-layer stack (guardian preimage, never profile bytes). */
export function requestLifecyclePinsDigestOf(pin: Pin = REQUEST_LIFECYCLE_PIN): Digest {
  return pinsDigestOf({ layers: [pin] });
}

/** G0 public lineage reference strings (not Pins); empty until a mapping target is frozen (OQ-RL-3). */
export const REQUEST_LIFECYCLE_LINEAGE_MAPPINGS: readonly string[] = [];

/** §2.2 exact record (G0 §1.4, closed). Draft: corpusRef absent; result digest unknown (OQ-RL-8). */
export const RECORD_REQUEST_LIFECYCLE_V1: OntologyRecord = {
  namespace: "request-lifecycle",
  id: "request-lifecycle",
  version: "1",
  owner: "engram gr-conductor",
  lifecycle: "draft",
  completeness: "complete",
  visibility: "public",
  profileShape: "track-vocabulary",
  artifactKind: "profile",
  profileRef: { canonicalRef: "request-lifecycle@1", contentDigest: REQUEST_LIFECYCLE_CONTENT_DIGEST },
  digests: {
    contentDigest: REQUEST_LIFECYCLE_CONTENT_DIGEST,
    pinsDigest: REQUEST_LIFECYCLE_PINS_DIGEST,
    resultEvidence: { evidenceState: "unresolved" },
  },
  lineage: {
    parents: [],
    mappings: REQUEST_LIFECYCLE_LINEAGE_MAPPINGS,
    migrations: [],
  },
  consumers: [],
};

/** Catalog binding: the profile variant (relationMatrixRef absent, public entry). */
export const REQUEST_LIFECYCLE_ARTIFACT_BINDING = {
  artifactKind: "profile",
  profilePin: REQUEST_LIFECYCLE_PIN,
  stack: [REQUEST_LIFECYCLE_PIN],
} as const;

/** Instantiated static payload fields (no value invented); unresolved fields stay absent as admission tasks. */
export const REQUEST_LIFECYCLE_CATALOG_STATIC = {
  canonicalRef: "request-lifecycle@1",
  namespace: "request-lifecycle",
  owner: "engram gr-conductor",
  profileShape: "track-vocabulary",
  artifactKind: "profile",
  profilePin: REQUEST_LIFECYCLE_PIN,
  stack: [REQUEST_LIFECYCLE_PIN],
  digests: {
    contentDigest: REQUEST_LIFECYCLE_CONTENT_DIGEST,
    pinsDigest: REQUEST_LIFECYCLE_PINS_DIGEST,
    resultEvidence: { evidenceState: "unresolved" },
  },
  ruleSheets: [],
  lifecycle: "draft",
  lineage: {
    parents: [],
    mappings: REQUEST_LIFECYCLE_LINEAGE_MAPPINGS,
    migrations: [],
  },
  conflictPolicy:
    "Evolution by versions plus explicit mappings only; composition refused at the family level (TRK) per G0 §2.5/D-B7 (spec §2.1.2, D1)",
  completeness: "complete",
  migrations: [],
  visibility: "public",
} as const;
