/**
 * G0 Guardian registration for the Application Context ontology profile (`app-context@1`, §2.4).
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  hashOntologyProfile,
  normalizeOntologyProfile,
  parseOntologyProfile,
  validateOntologyProfile,
} from "../ontology-profile.js";
import type { NormalizedOntologyProfile } from "../types.js";
import type { AdmissionEntry } from "./admission.js";
import { canonicalBytes, sha256Hex } from "./canonical.js";
import type { OntologyPayload, RegistryEnvelope } from "./catalog.js";
import { pinsDigestOf, resultDigestOf, stableForHash } from "./digests.js";
import type { Digest, OntologyRecord, Pin } from "./types.js";

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

export const APP_CONTEXT_PROFILE_ID = "app-context" as const;
export const APP_CONTEXT_PROFILE_VERSION = "1" as const;
export const APP_CONTEXT_CANONICAL_REF = "engram:app-context@1" as const;
export const APP_CONTEXT_NAMESPACE = "engram" as const;
export const APP_CONTEXT_OWNER = "engram" as const;
export const APP_CONTEXT_CORPUS_REF = "engram:app-context-lot-corpus/1" as const;

export const APP_CONTEXT_PINNED_RAW_SHA256: Digest =
  "eb59b3165988e1a45b87363fdf34fbf050eb29e872612122cbbd0eb333618aa4";
export const APP_CONTEXT_PINNED_CONTENT_DIGEST: Digest =
  "f04ea89ae549471fe0dc62460dccd5b3c87204717b98ea7f4235cbf0d835819a";
export const APP_CONTEXT_PINNED_PINS_DIGEST: Digest =
  "36b8297f5f5a5f0079e17e822b96bfa8cb1b0dd7146cd5146a01a5eb809be6b9";
export const APP_CONTEXT_PINNED_RESULT_DIGEST: Digest =
  "77e4ad3d2ec1379737aae6ddc84f5b6d1a5936a8bbefffd0d2c26ed6e96cdcbd";
export const APP_CONTEXT_CORPUS_DIGEST: Digest =
  "115c85ae99cfb1b9b7e301ed455e2cd601a391255a410fb082b5510a83cd7099";

export interface DerivedAppContextProfileDigests {
  readonly normalized: NormalizedOntologyProfile;
  readonly profilePin: Pin;
  readonly contentDigest: Digest;
  readonly pinsDigest: Digest;
  readonly resultDigest: Digest;
}

function resolveAppContextProfilePath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, "../../profiles/app-context/v1/profile.yaml"),
    resolve(here, "../profiles/app-context/v1/profile.yaml"),
    join(process.cwd(), "profiles", "app-context", "v1", "profile.yaml"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[0]!;
}

function isHexDigest(value: unknown): value is Digest {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function isValidPin(pin: unknown): pin is Pin {
  if (pin === null || typeof pin !== "object") return false;
  const candidate = pin as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.version === "string" &&
    isHexDigest(candidate.contentDigest)
  );
}

function pinsEqual(a: Pin, b: Pin): boolean {
  return a.id === b.id && a.version === b.version && a.contentDigest === b.contentDigest;
}

/**
 * Parses, validates, and normalizes an `app-context@1` profile YAML source,
 * rejecting any profile whose normalized identity is not `app-context@1`
 * before constructing a `Pin` or any digest.
 */
export function computeAppContextProfileDigests(
  rawProfileYaml: string,
  sourcePath: string = resolveAppContextProfilePath(),
): DerivedAppContextProfileDigests {
  const parsed = parseOntologyProfile(rawProfileYaml, sourcePath);
  const validationErrors = validateOntologyProfile(parsed);
  if (validationErrors.length > 0) {
    throw new Error(
      `Invalid app-context@1 ontology profile at ${sourcePath}: ${validationErrors.join("; ")}`,
    );
  }
  const normalized = normalizeOntologyProfile(parsed);
  if (
    normalized.id !== APP_CONTEXT_PROFILE_ID ||
    normalized.version !== APP_CONTEXT_PROFILE_VERSION
  ) {
    throw new Error(
      `Invalid ontology profile identity: expected ${APP_CONTEXT_PROFILE_ID}@${APP_CONTEXT_PROFILE_VERSION}, got ${String(normalized.id)}@${String(normalized.version)}`,
    );
  }

  const { profile_hash: _profileHash, ...normalizedWithoutHash } = normalized;
  const contentDigest: Digest = hashOntologyProfile(normalized);
  const profilePin: Pin = deepFreeze({
    id: normalized.id,
    version: normalized.version,
    contentDigest,
  });
  const pinsDigest = pinsDigestOf({
    layers: [profilePin],
  });
  const resultDigest = resultDigestOf({
    effectiveDeclarations: stableForHash(normalizedWithoutHash) as Record<string, unknown>,
    effectiveRuleSet: [],
    severityPolicyDigest: null,
  });

  return deepFreeze({
    normalized,
    profilePin,
    contentDigest,
    pinsDigest,
    resultDigest,
  });
}

/**
 * Verifies that a profile YAML source matches the pinned `app-context@1`
 * registration (identity, content digest, pins digest, and result digest).
 */
export function verifyRegisteredAppContextProfile(
  rawProfileYaml: string,
  sourcePath: string = resolveAppContextProfilePath(),
): DerivedAppContextProfileDigests {
  const derived = computeAppContextProfileDigests(rawProfileYaml, sourcePath);
  if (derived.contentDigest !== APP_CONTEXT_PINNED_CONTENT_DIGEST) {
    throw new Error(
      `app-context@1 profile contentDigest mismatch: expected pinned ${APP_CONTEXT_PINNED_CONTENT_DIGEST}, got ${derived.contentDigest}`,
    );
  }
  if (derived.pinsDigest !== APP_CONTEXT_PINNED_PINS_DIGEST) {
    throw new Error(
      `app-context@1 profile pinsDigest mismatch: expected pinned ${APP_CONTEXT_PINNED_PINS_DIGEST}, got ${derived.pinsDigest}`,
    );
  }
  if (derived.resultDigest !== APP_CONTEXT_PINNED_RESULT_DIGEST) {
    throw new Error(
      `app-context@1 profile resultDigest mismatch: expected pinned ${APP_CONTEXT_PINNED_RESULT_DIGEST}, got ${derived.resultDigest}`,
    );
  }
  const expectedCorpusDigest = sha256Hex(
    canonicalBytes({
      family: "ENG",
      profilePin: derived.profilePin,
      pinsDigest: derived.pinsDigest,
      resultDigest: derived.resultDigest,
    }),
  );
  if (expectedCorpusDigest !== APP_CONTEXT_CORPUS_DIGEST) {
    throw new Error(
      `app-context@1 profile corpusDigest mismatch: expected pinned ${APP_CONTEXT_CORPUS_DIGEST}, got ${expectedCorpusDigest}`,
    );
  }
  return derived;
}

/**
 * Asserts internal coherence of an `app-context@1` G0 `OntologyPayload`
 * before admission projection (DESIGN-NOTE-L1-PINS §3):
 * - exact canonical identity (`engram:app-context@1`, `engram-profile`, `profile`);
 * - equality of the outer and `artifactBinding` profile pins;
 * - equality of the two ordered stacks;
 * - a stack of exactly one layer, equal to the profile pin;
 * - `digests.contentDigest` equal to the profile pin's `contentDigest`;
 * - recomputed `pinsDigestOf({ layers: stack })` equal to declared `digests.pinsDigest`.
 * Rejects any contradiction and never overwrites.
 */
export function assertAppContextPayloadCoherent(payload: OntologyPayload): void {
  if (payload.visibility !== "public") {
    throw new Error("app-context payload coherence requires visibility === 'public'");
  }
  if (payload.canonicalRef !== APP_CONTEXT_CANONICAL_REF) {
    throw new Error(
      `app-context payload canonicalRef mismatch: expected ${APP_CONTEXT_CANONICAL_REF}, got ${String(payload.canonicalRef)}`,
    );
  }
  if (payload.namespace !== APP_CONTEXT_NAMESPACE || payload.owner !== APP_CONTEXT_OWNER) {
    throw new Error(
      `app-context payload namespace/owner mismatch: expected ${APP_CONTEXT_NAMESPACE}/${APP_CONTEXT_OWNER}`,
    );
  }
  if (payload.profileShape !== "engram-profile") {
    throw new Error(
      `app-context payload profileShape mismatch: expected engram-profile, got ${String(payload.profileShape)}`,
    );
  }
  if (payload.artifactKind !== "profile" || payload.artifactBinding.artifactKind !== "profile") {
    throw new Error("app-context payload coherence requires artifactKind === 'profile'");
  }
  if (!isValidPin(payload.profilePin) || !isValidPin(payload.artifactBinding.profilePin)) {
    throw new Error("app-context payload profilePin and artifactBinding.profilePin must be valid Pins");
  }
  if (
    payload.profilePin.id !== APP_CONTEXT_PROFILE_ID ||
    payload.profilePin.version !== APP_CONTEXT_PROFILE_VERSION ||
    payload.artifactBinding.profilePin.id !== APP_CONTEXT_PROFILE_ID ||
    payload.artifactBinding.profilePin.version !== APP_CONTEXT_PROFILE_VERSION
  ) {
    throw new Error(
      `app-context payload requires profilePin ${APP_CONTEXT_PROFILE_ID}@${APP_CONTEXT_PROFILE_VERSION}`,
    );
  }
  if (!pinsEqual(payload.profilePin, payload.artifactBinding.profilePin)) {
    throw new Error(
      "app-context payload contradiction: outer profilePin does not equal artifactBinding.profilePin",
    );
  }
  if (!Array.isArray(payload.stack) || !Array.isArray(payload.artifactBinding.stack)) {
    throw new Error("app-context payload stack and artifactBinding.stack must be arrays");
  }
  if (
    payload.stack.length !== payload.artifactBinding.stack.length ||
    payload.stack.some(
      (layer, idx) =>
        !isValidPin(layer) ||
        !isValidPin(payload.artifactBinding.stack[idx]) ||
        !pinsEqual(layer, payload.artifactBinding.stack[idx]!),
    )
  ) {
    throw new Error(
      "app-context payload contradiction: outer stack does not equal artifactBinding.stack",
    );
  }
  if (payload.stack.length !== 1 || !pinsEqual(payload.stack[0]!, payload.profilePin)) {
    throw new Error(
      "app-context payload contradiction: stack must contain exactly one layer equal to profilePin",
    );
  }
  if (payload.digests.contentDigest !== payload.profilePin.contentDigest) {
    throw new Error(
      "app-context payload contradiction: digests.contentDigest does not equal profilePin.contentDigest",
    );
  }
  const recomputedPinsDigest = pinsDigestOf({ layers: payload.stack });
  if (recomputedPinsDigest !== payload.digests.pinsDigest) {
    throw new Error(
      `app-context payload contradiction: recomputed pinsDigest ${recomputedPinsDigest} does not equal declared digests.pinsDigest ${String(payload.digests.pinsDigest)}`,
    );
  }
}

/**
 * Single derivation function for the `sentropic.engram.app-context` G0
 * `RegistryEnvelope` and its embedded `OntologyPayload` from
 * `profiles/app-context/v1/profile.yaml` (DESIGN-NOTE-L1-PINS §2).
 */
export function buildAppContextEntry(
  rawProfileYaml: string = readFileSync(resolveAppContextProfilePath(), "utf8"),
  sourcePath: string = resolveAppContextProfilePath(),
): Extract<RegistryEnvelope, { readonly kind: "ontology" }> {
  const rawSha256: Digest = sha256Hex(rawProfileYaml);
  const derived = computeAppContextProfileDigests(rawProfileYaml, sourcePath);
  const profilePin: Pin = derived.profilePin;
  const stack: readonly Pin[] = deepFreeze([profilePin]);
  const contentDigest: Digest = profilePin.contentDigest;
  const pinsDigest: Digest = pinsDigestOf({ layers: stack });
  const canonicalRef = `${APP_CONTEXT_NAMESPACE}:${profilePin.id}@${profilePin.version}`;

  const digests = deepFreeze({
    contentDigest,
    pinsDigest,
    resultEvidence: {
      evidenceState: "resolved" as const,
      digest: derived.resultDigest,
    },
  });

  const payload: OntologyPayload = deepFreeze({
    canonicalRef,
    namespace: APP_CONTEXT_NAMESPACE,
    owner: APP_CONTEXT_OWNER,
    profileShape: "engram-profile",
    artifactKind: "profile",
    profilePin,
    stack,
    digests,
    ruleSheets: [],
    lifecycle: "draft",
    provenance: {
      sourceRef: "profiles/app-context/v1/profile.yaml",
      sourceRevision: rawSha256,
    },
    lineage: {
      parents: [],
      mappings: [],
      migrations: [],
    },
    conflictPolicy: "engram:g0-conflicts@1",
    completeness: "complete",
    corpusRef: {
      ref: APP_CONTEXT_CORPUS_REF,
      digest: APP_CONTEXT_CORPUS_DIGEST,
    },
    receipts: [],
    migrations: [],
    consumers: [],
    compatibility: {
      renderer: "transitional:engram-app-context-renderer-unqualified",
      adapter: "transitional:engram-app-context-adapter-unqualified",
    },
    visibility: "public",
    linkedTools: [
      "engram_context_for_target",
      "engram_specs_for_target",
      "engram_targets_for_spec",
      "engram_read_spec_section",
      "engram_get_context_item",
    ],
    artifactBinding: {
      artifactKind: "profile",
      profilePin,
      stack,
    },
  });

  assertAppContextPayloadCoherent(payload);

  return deepFreeze({
    format: "sentropic.registry-entry/v1",
    contractVersion: "1.1.4",
    kind: "ontology",
    id: "sentropic.engram.app-context",
    name: "Engram Application Context Ontology Profile (v1)",
    description:
      "Multi-plane application context ontology profile (specs, track delivery, data model, UI routes/components, API endpoints, code symbols, git history, and MCP configuration).",
    entryVersion: "1.0.0",
    publisher: {
      packageName: "@sentropic/engram",
      packageVersion: "0.26.0",
    },
    compatibility: {
      entryContract: "1.1.4",
      packages: [],
      schemaProfiles: ["app-context/1"],
      requiredHostFeatures: ["ontology-descriptors"],
      optionalHostFeatures: [],
    },
    parameters: {
      schemaVersion: "1",
      schema: { $ref: "engram:app-context" },
      defaults: {},
    },
    bindings: [
      {
        key: "profile",
        contract: `engram:engram-profile/1#sha256=${contentDigest}`,
        required: true,
      },
    ],
    assets: [
      {
        role: "profile-data",
        path: "profiles/app-context/v1/profile.yaml",
        mediaType: "application/yaml",
        sha256: rawSha256,
      },
    ],
    ontology: payload,
  });
}

const profilePath = resolveAppContextProfilePath();
const rawProfileYaml = readFileSync(profilePath, "utf8");
const verifiedProfile = verifyRegisteredAppContextProfile(rawProfileYaml, profilePath);

export const ENVELOPE_APP_CONTEXT_V1: RegistryEnvelope = buildAppContextEntry(
  rawProfileYaml,
  profilePath,
);
export const PAYLOAD_APP_CONTEXT_V1: OntologyPayload = ENVELOPE_APP_CONTEXT_V1.ontology;
export const APP_CONTEXT_PIN: Pin = PAYLOAD_APP_CONTEXT_V1.profilePin;
export const APP_CONTEXT_PINS_DIGEST: Digest = PAYLOAD_APP_CONTEXT_V1.digests.pinsDigest;
export const APP_CONTEXT_RESULT_DIGEST: Digest = verifiedProfile.resultDigest;

export const RECORD_APP_CONTEXT_V1: OntologyRecord = deepFreeze({
  namespace: PAYLOAD_APP_CONTEXT_V1.namespace,
  id: PAYLOAD_APP_CONTEXT_V1.profilePin.id,
  version: PAYLOAD_APP_CONTEXT_V1.profilePin.version,
  owner: PAYLOAD_APP_CONTEXT_V1.owner,
  lifecycle: "draft",
  completeness: PAYLOAD_APP_CONTEXT_V1.completeness,
  visibility: "public",
  profileShape: PAYLOAD_APP_CONTEXT_V1.profileShape,
  artifactKind: "profile",
  profileRef: {
    canonicalRef: PAYLOAD_APP_CONTEXT_V1.canonicalRef,
    contentDigest: PAYLOAD_APP_CONTEXT_V1.digests.contentDigest,
  },
  corpusRef: PAYLOAD_APP_CONTEXT_V1.corpusRef,
  digests: PAYLOAD_APP_CONTEXT_V1.digests,
  lineage: {
    parents: [],
    mappings: [],
    migrations: [],
  },
  consumers: PAYLOAD_APP_CONTEXT_V1.consumers,
});

/**
 * Projects a G0 `OntologyPayload` (`artifactKind: "profile"`) into an
 * `AdmissionEntry` for `checkAdmission` after enforcing payload coherence.
 */
export function projectAppContextAdmissionEntry(
  payload: OntologyPayload = PAYLOAD_APP_CONTEXT_V1,
): AdmissionEntry {
  assertAppContextPayloadCoherent(payload);
  if (payload.visibility !== "public" || payload.artifactKind !== "profile") {
    throw new Error("unreachable: assertAppContextPayloadCoherent guarantees public profile payload");
  }
  return deepFreeze({
    family: "ENG",
    artifactKind: payload.artifactKind,
    profileShape: payload.profileShape,
    generatedBpmn: false,
    qualificationScope: {
      libraries: [{ id: "@sentropic/engram", version: "0.26.0" }],
      proofSets: [],
      selections: [{ phase: "build", readinessPolicy: "strict" }],
    },
    ruleSheetRuleIds: payload.ruleSheets.map((sheet) => sheet.ruleIds),
    stack: payload.stack,
    pinsDigest: payload.digests.pinsDigest,
    resultEvidence: payload.digests.resultEvidence,
    profilePin: payload.profilePin,
    corpusDigest: payload.corpusRef.digest,
    selections: payload.ruleSheets.flatMap((sheet) => sheet.selections),
    ruleSheetPins: payload.ruleSheets.map((sheet) => sheet.sheetPin),
    visibility: payload.visibility,
  });
}

export const APP_CONTEXT_ADMISSION_ENTRY: AdmissionEntry =
  projectAppContextAdmissionEntry(PAYLOAD_APP_CONTEXT_V1);
