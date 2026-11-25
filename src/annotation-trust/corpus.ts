// Lot 7: G0 corpus manifest pinning annotation-trust fixtures by raw-byte SHA-256 (§1, §7).
import { canonicalBytes, sha256Hex } from "../ontology-guardian/canonical.js";
import type { CorpusFixturePin } from "../ontology-guardian/diagram-registry.js";
import type { Digest } from "../ontology-guardian/types.js";
import { deepFreeze } from "../ontology-profile.js";

export const ANNOTATION_TRUST_CORPUS_REF = "engram:annotation-trust-feedback-corpus/0.2.3" as const;
export const ANNOTATION_TRUST_CORPUS_FIXTURES: readonly CorpusFixturePin[] = deepFreeze([
  { path: "tests/fixtures/annotation-trust/prefix-bindings.json",
    sha256: "0025a871c9ab20e60ef8e71614b79e81c518bd3ba5cf3a64ea0ffbf2288e7af2" },
  { path: "tests/fixtures/annotation-trust/worked-correction.jsonld",
    sha256: "10688cfc68cbe3aa636ad91587102c7e340e143ffa79ea56e85c927d20da0e22" },
]);
export const ANNOTATION_TRUST_CORPUS_DIGEST: Digest = sha256Hex(
  canonicalBytes({ corpus: ANNOTATION_TRUST_CORPUS_REF, fixtures: ANNOTATION_TRUST_CORPUS_FIXTURES }),
);
