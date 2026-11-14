import {
  EXTRACTION_CACHE_ENTRY_SCHEMA_V2,
  EXTRACTION_KEY_SCHEMA_V1,
  EXTRACTION_SEMANTICS_VERSION,
  checkCoverageGate,
  computeExtractionKey,
  createCachedExtractionEntry,
  getOrExtract,
  lookupCachedExtraction,
  normalizeExtractionIdentity,
  transitionCoverageRecord,
} from "./extraction-cache.js";
import type {
  CachedExtractionEntryV2,
  ComputeExtractionKeyResult,
  CoverageGateResult,
  CoverageKey,
  CoverageRecordV1,
  CoverageRegistryPort,
  CoverageStatus,
  CoverageTransitionInput,
  CreateCachedExtractionEntryResult,
  ExtractionCacheLookupResult,
  ExtractionCachePort,
  ExtractionChunkingV1,
  ExtractionIdentityInput,
  ExtractionIssue,
  ExtractionKey,
  ExtractionModelPolicyV1,
  ExtractionPromptIdentityV1,
  ExtractionReceiptV1,
  ExtractionRefusalCode,
  ExtractionTerminalStatus,
  GetOrExtractResult,
  NormalizedExtractionIdentityV1,
  NormalizeExtractionIdentityResult,
  ProducedExtraction,
  RefusedProduction,
} from "./extraction-cache.js";
import {
  extractionCitationKey,
  unionExtractionCitations,
} from "./citations.js";
import { mergeExtractionsWithCitations, mergeExtractionsWithCitationsPrepared } from "./extract-git.js";
import type {
  ExtractionMergeConflict,
  ExtractionMergeConflictKind,
  MergeExtractionsOptions,
  MergeExtractionsResult,
} from "./extract-git.js";

/** Prepared replacement for the accepted-chunk merge at production intake.
 * Lot A passes the run's build context here when activating that call site. */
export function mergeAcceptedChunksPrepared(acceptedChunks: readonly Extraction[], context: { root?: string } = {}): MergeExtractionsResult {
  return mergeExtractionsWithCitationsPrepared(acceptedChunks, { root: context.root });
}
import {
  PROFILE_BUNDLE_SCHEMA_V1,
  bundleProfile,
  checkProfileCompatibility,
  computeRegistryRecordsDigest,
} from "./profile-bundle.js";
import type {
  BundledRegistrySnapshotV1,
  BundleProfileResult,
  ProfileBreakingChange,
  ProfileBundleIssue,
  ProfileBundleV1,
  ProfileComparableInput,
  ProfileCompatibilityOptions,
  ProfileCompatibilityResult,
  ProfileNonBreakingChange,
} from "./profile-bundle.js";
import { parseJsonFromLlmText } from "./llm-execution.js";
import type {
  TextJsonGenerationClient,
  TextJsonGenerationInput,
} from "./llm-execution.js";
import { canonicalBytes } from "./ontology-guardian/canonical.js";
import { stableForHash } from "./ontology-guardian/digests.js";
import { isDigest } from "./ontology-guardian/types.js";
import type { Digest } from "./ontology-guardian/types.js";
import { validateOntologyProfile } from "./ontology-profile.js";
import { buildProfileChunkPrompt } from "./profile-prompts.js";
import { validateProfileExtraction } from "./profile-validate.js";
import { validateSemanticFragment } from "./semantic-fragment-validation.js";
import { validateExtraction } from "./validate.js";
import { toJsonValue } from "./json-value.js";
import type {
  Extraction,
  NormalizedOntologyProfile,
  OntologyCitation,
  OntologyProfile,
  RegistryRecord,
} from "./types.js";

// Re-export F-EN1 and F-EN4 runtime symbols and F-EN1/F-EN2/F-EN4 types from @sentropic/engram/extraction-batch
export {
  EXTRACTION_CACHE_ENTRY_SCHEMA_V2,
  EXTRACTION_KEY_SCHEMA_V1,
  EXTRACTION_SEMANTICS_VERSION,
  checkCoverageGate,
  computeExtractionKey,
  createCachedExtractionEntry,
  getOrExtract,
  lookupCachedExtraction,
  normalizeExtractionIdentity,
  transitionCoverageRecord,
  extractionCitationKey,
  unionExtractionCitations,
  mergeExtractionsWithCitations,
};
export type {
  CachedExtractionEntryV2,
  ComputeExtractionKeyResult,
  CoverageGateResult,
  CoverageKey,
  CoverageRecordV1,
  CoverageRegistryPort,
  CoverageStatus,
  CoverageTransitionInput,
  CreateCachedExtractionEntryResult,
  ExtractionCacheLookupResult,
  ExtractionCachePort,
  ExtractionChunkingV1,
  ExtractionIdentityInput,
  ExtractionIssue,
  ExtractionKey,
  ExtractionModelPolicyV1,
  ExtractionPromptIdentityV1,
  ExtractionReceiptV1,
  ExtractionRefusalCode,
  ExtractionTerminalStatus,
  GetOrExtractResult,
  NormalizedExtractionIdentityV1,
  NormalizeExtractionIdentityResult,
  ProducedExtraction,
  RefusedProduction,
  ExtractionMergeConflict,
  ExtractionMergeConflictKind,
  MergeExtractionsOptions,
  MergeExtractionsResult,
  BundledRegistrySnapshotV1,
  BundleProfileResult,
  ProfileBreakingChange,
  ProfileBundleIssue,
  ProfileBundleV1,
  ProfileComparableInput,
  ProfileCompatibilityOptions,
  ProfileCompatibilityResult,
  ProfileNonBreakingChange,
};

// ============================================================================
// §3(b) Public API Types & Constants
// ============================================================================

export interface HeadlessDocumentPage {
  readonly page: number;
  readonly text: string;
}

export interface HeadlessDocumentInput {
  readonly docSha: string;
  readonly sourceFile: string;
  readonly pages: readonly HeadlessDocumentPage[];
}

export interface HeadlessExecutionBounds {
  readonly timeoutMs: number;
  readonly maxDocumentBytes: number;
  readonly maxDocumentPages?: number;
  readonly maxAttempts: number;
  readonly maxChunkChars?: number;
}

export interface HeadlessLlmTurnResponse {
  readonly status: "ok" | "refused";
  readonly text?: string;
  readonly tokensIn: number | null;
  readonly tokensOut: number | null;
  readonly model?: string;
  readonly provider?: string;
  readonly finishReason?: string | null;
  readonly refusalCode?: "provider_content_filter" | "empty_completion" | "rate_limited" | "upstream_error";
  readonly refusalReason?: string;
  readonly retryable?: boolean;
}

export interface HeadlessLlmClient {
  readonly provider: string;
  readonly model?: string;
  generate(
    input: Omit<TextJsonGenerationInput, "outputPath"> & { readonly signal?: AbortSignal },
  ): Promise<HeadlessLlmTurnResponse>;
}

export interface HeadlessClock {
  nowMs(): number;
  nowIso(): string;
  setTimeout?(fn: () => void, ms: number): unknown;
  clearTimeout?(handle: unknown): void;
}

export interface HeadlessExtractInput {
  /** Same fresh-locator preparation context as the downstream build. */
  readonly root?: string;
  readonly document: HeadlessDocumentInput;
  readonly profileBundle: ProfileBundleV1;
  readonly modelPolicy: ExtractionModelPolicyV1;
  readonly promptVersion: string;
  readonly engramVersion?: string;
  readonly bounds: HeadlessExecutionBounds;
  readonly client: HeadlessLlmClient;
  readonly registries?: Readonly<Record<string, readonly RegistryRecord[]>>;
  readonly maxRegistrySamplesPerRegistry?: number;
  readonly cache?: ExtractionCachePort;
  readonly coverage?: {
    readonly port: CoverageRegistryPort;
    readonly city: string;
    readonly maxFailures?: number;
    readonly maxRetryableFailures?: number;
  };
  readonly clock?: HeadlessClock;
}

export interface HeadlessExtractResult {
  readonly extraction: Extraction | null;
  readonly receipt: ExtractionReceiptV1;
  readonly mergeConflicts: readonly ExtractionMergeConflict[];
  readonly suggestedExitCode: 0 | 64 | 65 | 75;
}

export interface HeadlessBatchResult {
  readonly results: readonly HeadlessExtractResult[];
  readonly summary: {
    readonly total: number;
    readonly ok: number;
    readonly okFromCache: number;
    readonly refused: number;
    readonly timeout: number;
    readonly tooLarge: number;
    readonly abandoned: number;
    readonly tokensIn: number | null;
    readonly tokensOut: number | null;
    readonly tokensUnknownCount: number;
  };
  readonly suggestedExitCode: 0 | 64 | 65 | 75;
}

export const EXTRACTION_SCHEMA_V1 = "engram_extraction_v1" as const;

export interface AdaptedHeadlessLlmClient extends HeadlessLlmClient {
  readonly adaptedFrom: TextJsonGenerationClient;
}

// ============================================================================
// Internal Helpers
// ============================================================================

const DEFAULT_MAX_CHUNK_CHARS = 20_000;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;
  if (Object.getOwnPropertySymbols(value).length > 0) return false;
  return true;
}

function getOwnDataProp(
  obj: Record<string, unknown>,
  key: string,
): { present: boolean; validDescriptor: boolean; value: unknown } {
  const desc = Object.getOwnPropertyDescriptor(obj, key);
  if (!desc) return { present: false, validDescriptor: true, value: undefined };
  if (!desc.enumerable || !("value" in desc)) {
    return { present: true, validDescriptor: false, value: undefined };
  }
  return { present: true, validDescriptor: true, value: desc.value };
}

function defineOwnProp(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Object.isFrozen(value)) return value;
  Object.freeze(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
  } else {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

function isPositiveFiniteInt(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 1;
}

function isNonNegativeFiniteInt(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}

function isWellFormedUnicode(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = i + 1 < value.length ? value.charCodeAt(i + 1) : -1;
      if (next < 0xdc00 || next > 0xdfff) return false;
      i++;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function resolveClock(clock?: HeadlessClock): Required<HeadlessClock> {
  return {
    nowMs: () => {
      try {
        return clock && typeof clock.nowMs === "function" ? clock.nowMs() : Date.now();
      } catch {
        return Date.now();
      }
    },
    nowIso: () => {
      try {
        return clock && typeof clock.nowIso === "function" ? clock.nowIso() : new Date().toISOString();
      } catch {
        return new Date().toISOString();
      }
    },
    setTimeout: (fn: () => void, ms: number) => {
      if (clock && typeof clock.setTimeout === "function") {
        return clock.setTimeout(fn, ms);
      }
      return globalThis.setTimeout(fn, ms);
    },
    clearTimeout: (handle: unknown) => {
      if (clock && typeof clock.clearTimeout === "function") {
        clock.clearTimeout(handle);
        return;
      }
      globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>);
    },
  };
}

function clampLatency(startMs: number, endMs: number): number {
  const delta = endMs - startMs;
  if (!Number.isFinite(delta) || delta < 0) return 0;
  return Math.floor(delta);
}

function hasOwnProtoKey(val: unknown): boolean {
  if (!isPlainObject(val) && !Array.isArray(val)) return false;
  if (Array.isArray(val)) {
    return val.some((item) => hasOwnProtoKey(item));
  }
  if (Object.prototype.hasOwnProperty.call(val, "__proto__")) return true;
  for (const k of Object.keys(val)) {
    if (hasOwnProtoKey(val[k])) return true;
  }
  return false;
}

function hasLinkingNormalizeFn(doc: Record<string, unknown>): boolean {
  const nt = doc.node_types;
  if (!isPlainObject(nt)) return false;
  for (const spec of Object.values(nt)) {
    if (!isPlainObject(spec)) continue;
    const linking = spec.linking;
    if (!isPlainObject(linking)) continue;
    const norm = linking.normalize;
    if (!isPlainObject(norm)) continue;
    if (typeof norm.fn === "string") return true;
  }
  return false;
}

function isValidRegistryBindingShape(b: unknown): b is BundledRegistrySnapshotV1["binding"] {
  if (!isPlainObject(b)) return false;
  if (Object.values(b).some((v) => v === undefined)) return false;
  return (
    typeof b.source === "string" &&
    typeof b.id_column === "string" &&
    typeof b.label_column === "string" &&
    typeof b.node_type === "string" &&
    Array.isArray(b.alias_columns) &&
    b.alias_columns.every((x) => typeof x === "string") &&
    (b.partition_column === undefined || typeof b.partition_column === "string") &&
    !Object.prototype.hasOwnProperty.call(b, "bound_source_path") &&
    toJsonValue(b).ok
  );
}

function deepKeySortCopy<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => deepKeySortCopy(item)) as unknown as T;
  }
  const src = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(src).sort()) {
    const val = src[key];
    if (val !== undefined) {
      defineOwnProp(out, key, deepKeySortCopy(val));
    }
  }
  return out as unknown as T;
}

/**
 * Row 2 bundle re-validation and profile re-derivation (§3(c).1 Row 2, §3(d).2).
 * Never reads or compares `bundle.profile` (R4-m3).
 * Reuses EN-L0 `bundleProfile` and `checkProfileCompatibility` (R-m6).
 */
function revalidateFullBundleAndRederiveProfile(
  rawBundle: unknown,
):
  | {
      readonly ok: true;
      readonly digest: Digest;
      readonly rederivedProfile: NormalizedOntologyProfile;
      readonly sortedProfile: NormalizedOntologyProfile;
      readonly registries: Readonly<Record<string, BundledRegistrySnapshotV1>>;
    }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly diagnostic?: "invalid_profile_bundle";
    } {
  try {
    if (!isPlainObject(rawBundle) || rawBundle.schema !== PROFILE_BUNDLE_SCHEMA_V1) {
      return {
        ok: false,
        reason: "profileBundle is not a valid ProfileBundleV1 object",
        diagnostic: "invalid_profile_bundle",
      };
    }

    if (rawBundle.registriesMode === "bindings-only") {
      return {
        ok: false,
        reason: "profileBundle must be full-mode (bindings-only bundles cannot key extraction caching)",
      };
    }

    if (
      rawBundle.registriesMode !== "full" ||
      typeof rawBundle.digest !== "string" ||
      !isDigest(rawBundle.digest) ||
      typeof rawBundle.profileId !== "string" ||
      typeof rawBundle.profileVersion !== "string" ||
      typeof rawBundle.profileHash !== "string" ||
      !isPlainObject(rawBundle.extensions) ||
      !isPlainObject(rawBundle.registries) ||
      !isPlainObject(rawBundle.documentProjection)
    ) {
      return {
        ok: false,
        reason: "profileBundle failed structural shape validation",
        diagnostic: "invalid_profile_bundle",
      };
    }

    const docProj = toJsonValue(rawBundle.documentProjection);
    if (!docProj.ok || !isPlainObject(docProj.value) || hasOwnProtoKey(docProj.value)) {
      return {
        ok: false,
        reason: "profileBundle.documentProjection failed JSON projection or __proto__ check",
        diagnostic: "invalid_profile_bundle",
      };
    }

    const stableDocProj = toJsonValue(stableForHash(docProj.value));
    if (
      !stableDocProj.ok ||
      !isPlainObject(stableDocProj.value) ||
      canonicalBytes(stableDocProj.value) !== canonicalBytes(docProj.value)
    ) {
      return {
        ok: false,
        reason: "profileBundle.documentProjection is not in canonical stableForHash form",
        diagnostic: "invalid_profile_bundle",
      };
    }

    // Step (iii): linking.normalize.fn fence on documentProjection
    if (hasLinkingNormalizeFn(docProj.value)) {
      return {
        ok: false,
        reason: "profileBundle.documentProjection contains unsupported linking.normalize.fn",
        diagnostic: "invalid_profile_bundle",
      };
    }

    // Step (iv): validateOntologyProfile on documentProjection (wrapped in try/catch per R-M2)
    let profileErrors: string[];
    try {
      profileErrors = validateOntologyProfile(docProj.value as unknown as OntologyProfile);
    } catch (err) {
      return {
        ok: false,
        reason: `profileBundle.documentProjection failed profile validation: ${err instanceof Error ? err.message : String(err)}`,
        diagnostic: "invalid_profile_bundle",
      };
    }
    if (profileErrors.length > 0) {
      return {
        ok: false,
        reason: `profileBundle.documentProjection failed profile validation: ${profileErrors[0]}`,
        diagnostic: "invalid_profile_bundle",
      };
    }

    // Step (v) & EN-L0 re-derivation via `bundleProfile` (R-m6)
    const rederivedRes = bundleProfile(docProj.value as unknown as OntologyProfile);
    if (!rederivedRes.ok) {
      return {
        ok: false,
        reason: `profileBundle.documentProjection failed normalization: ${rederivedRes.errors[0]?.message ?? rederivedRes.refusalCode}`,
        diagnostic: "invalid_profile_bundle",
      };
    }

    const rederivedBundle = rederivedRes.bundle;
    const rederivedProfile = rederivedBundle.profile;

    // Validate registry snapshots against re-derived profile & full-mode invariants
    const declaredRegIds = Object.keys(rederivedProfile.registries).sort();
    const bundleRegIds = Object.keys(rawBundle.registries).sort();
    if (
      declaredRegIds.length !== bundleRegIds.length ||
      declaredRegIds.some((id, idx) => id !== bundleRegIds[idx])
    ) {
      return {
        ok: false,
        reason: "profileBundle.registries keys do not match declared profile registries",
        diagnostic: "invalid_profile_bundle",
      };
    }

    const validatedRegistries: Record<string, BundledRegistrySnapshotV1> = {};
    for (const regId of declaredRegIds) {
      const snap = rawBundle.registries[regId];
      if (
        !isPlainObject(snap) ||
        snap.registryId !== regId ||
        !isValidRegistryBindingShape(snap.binding) ||
        typeof snap.recordCount !== "number" ||
        !Number.isInteger(snap.recordCount) ||
        snap.recordCount < 0 ||
        typeof snap.recordsDigest !== "string" ||
        !isDigest(snap.recordsDigest)
      ) {
        return {
          ok: false,
          reason: `profileBundle.registries.${regId} is malformed`,
          diagnostic: "invalid_profile_bundle",
        };
      }

      const expectedBinding = rederivedBundle.registries[regId]!.binding;
      const snapBindingProj = toJsonValue(snap.binding);
      const expectedBindingProj = toJsonValue(expectedBinding);
      if (
        !snapBindingProj.ok ||
        !expectedBindingProj.ok ||
        canonicalBytes(snapBindingProj.value) !== canonicalBytes(expectedBindingProj.value)
      ) {
        return {
          ok: false,
          reason: `profileBundle.registries.${regId}.binding does not match re-derived profile binding`,
          diagnostic: "invalid_profile_bundle",
        };
      }

      defineOwnProp(validatedRegistries, regId, {
        registryId: regId,
        binding: snapBindingProj.value as unknown as BundledRegistrySnapshotV1["binding"],
        recordCount: snap.recordCount,
        recordsDigest: snap.recordsDigest,
      });
    }

    // Reuse EN-L0 `checkProfileCompatibility` (with `profile` replaced by `rederivedProfile` so
    // `rawBundle.profile` is never trusted or read) to validate scalar metadata, extensions
    // (against EN-L0's CONSUMED_KEYS), and bundle digest (via EN-L0's computeBundleDigest) (R-m6)
    const candidateBundle: ProfileBundleV1 = {
      schema: PROFILE_BUNDLE_SCHEMA_V1,
      digest: rawBundle.digest,
      profileId: rawBundle.profileId,
      profileVersion: rawBundle.profileVersion,
      profileHash: rawBundle.profileHash,
      profile: rederivedProfile,
      documentProjection: docProj.value,
      extensions: rawBundle.extensions,
      registries: validatedRegistries,
      registriesMode: "full",
    };

    const compatCheck = checkProfileCompatibility(candidateBundle, candidateBundle);
    if (!compatCheck.ok) {
      return {
        ok: false,
        reason:
          compatCheck.validationIssues[0]?.message ??
          "profileBundle failed EN-L0 digest, scalar metadata, or extensions validation",
        diagnostic: "invalid_profile_bundle",
      };
    }

    const sortedProfile = deepFreeze(deepKeySortCopy(rederivedProfile));
    return {
      ok: true,
      digest: rawBundle.digest,
      rederivedProfile,
      sortedProfile,
      registries: validatedRegistries,
    };
  } catch (err) {
    return {
      ok: false,
      reason: `profileBundle failed validation: ${err instanceof Error ? err.message : String(err)}`,
      diagnostic: "invalid_profile_bundle",
    };
  }
}

function sortRegistryRecordsCopy(records: readonly RegistryRecord[]): RegistryRecord[] {
  return [...records].sort((a, b) => {
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    const pa = a.partition ?? "";
    const pb = b.partition ?? "";
    if (pa < pb) return -1;
    if (pa > pb) return 1;
    return 0;
  });
}

// ============================================================================
// §3(d).2 Page Rendering & Splitter v1
// ============================================================================

function splitPageTextV1(text: string, maxChunkChars: number): string[] {
  if (text.length <= maxChunkChars) {
    return [text];
  }
  const pieces: string[] = [];
  let remaining = text;
  while (remaining.length > maxChunkChars) {
    let cut = -1;
    const lastNl = remaining.lastIndexOf("\n", maxChunkChars - 1);
    if (lastNl >= 0) {
      cut = lastNl + 1;
    } else {
      const lastSpace = remaining.lastIndexOf(" ", maxChunkChars - 1);
      if (lastSpace >= 0) {
        cut = lastSpace + 1;
      } else {
        cut = maxChunkChars;
        if (cut > 1) {
          const prevCode = remaining.charCodeAt(cut - 1);
          if (prevCode >= 0xd800 && prevCode <= 0xdbff) {
            cut = cut - 1;
          }
        }
      }
    }
    pieces.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut);
  }
  if (remaining.length > 0) {
    pieces.push(remaining);
  }
  return pieces;
}

function renderAndPackPages(
  pages: readonly HeadlessDocumentPage[],
  maxChunkChars: number,
): string[] {
  const sorted = [...pages].sort((a, b) => a.page - b.page);
  const chunks: string[] = [];
  let currentPacked: string | null = null;

  const flushPacked = () => {
    if (currentPacked !== null) {
      chunks.push(currentPacked);
      currentPacked = null;
    }
  };

  for (const p of sorted) {
    const wholeRendered = `[[page ${p.page}]]\n${p.text}`;
    if (wholeRendered.length <= maxChunkChars) {
      if (currentPacked === null) {
        currentPacked = wholeRendered;
      } else if (currentPacked.length + 1 + wholeRendered.length <= maxChunkChars) {
        currentPacked = `${currentPacked}\n${wholeRendered}`;
      } else {
        flushPacked();
        currentPacked = wholeRendered;
      }
    } else {
      flushPacked();
      const pieces = splitPageTextV1(p.text, maxChunkChars);
      for (let i = 0; i < pieces.length; i++) {
        const piece = pieces[i]!;
        if (i === 0) {
          chunks.push(`[[page ${p.page}]]\n${piece}`);
        } else {
          chunks.push(`[[page ${p.page}]]\n[[page ${p.page} continued ${i + 1}]]\n${piece}`);
        }
      }
    }
  }

  flushPacked();
  return chunks;
}

// ============================================================================
// §3(c).3 Adapter Implementation (`adaptTextJsonClient`)
// ============================================================================

function isAdaptedClient(client: HeadlessLlmClient): client is AdaptedHeadlessLlmClient {
  return (
    client !== null &&
    typeof client === "object" &&
    "adaptedFrom" in client &&
    (client as AdaptedHeadlessLlmClient).adaptedFrom != null
  );
}

export function adaptTextJsonClient(client: TextJsonGenerationClient): AdaptedHeadlessLlmClient {
  const adapted: AdaptedHeadlessLlmClient = {
    provider: client.provider,
    ...(client.model !== undefined ? { model: client.model } : {}),
    adaptedFrom: client,
    async generate(input) {
      let capturedText: string | undefined;
      let validateCalled = false;

      const genInput: TextJsonGenerationInput = {
        schema: input.schema,
        prompt: input.prompt,
        ...(input.maxOutputTokens !== undefined ? { maxOutputTokens: input.maxOutputTokens } : {}),
        validateResponse(rawText: string) {
          validateCalled = true;
          capturedText = rawText;
        },
      };

      let result;
      try {
        result = await client.generateJson(genInput);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("input.validateResponse requires the GraphifyMesh")) {
          return {
            status: "refused",
            tokensIn: null,
            tokensOut: null,
            model: client.model,
            provider: client.provider,
            refusalReason: "unsupported_client",
            retryable: false,
          };
        }
        throw err;
      }

      const audit = result && isPlainObject(result.audit) ? result.audit : {};
      const usage = isPlainObject(audit.usage) ? audit.usage : null;
      const tokensIn =
        usage && typeof usage.inputTokens === "number" && Number.isFinite(usage.inputTokens)
          ? usage.inputTokens
          : null;
      const tokensOut =
        usage && typeof usage.outputTokens === "number" && Number.isFinite(usage.outputTokens)
          ? usage.outputTokens
          : null;
      const finishReason = typeof audit.finishReason === "string" ? audit.finishReason : null;
      const reportedModel = client.model ?? (typeof result?.model === "string" ? result.model : undefined);
      const reportedProvider = typeof result?.provider === "string" ? result.provider : client.provider;

      if (
        !result ||
        result.status === "instructions_written" ||
        result.status !== "completed" ||
        !validateCalled ||
        typeof capturedText !== "string"
      ) {
        return {
          status: "refused",
          tokensIn,
          tokensOut,
          ...(reportedModel !== undefined ? { model: reportedModel } : {}),
          provider: reportedProvider,
          finishReason,
          refusalReason: "client_did_not_expose_text",
          retryable: false,
        };
      }

      return {
        status: "ok",
        text: capturedText,
        tokensIn,
        tokensOut,
        ...(reportedModel !== undefined ? { model: reportedModel } : {}),
        provider: reportedProvider,
        finishReason,
      };
    },
  };

  return Object.freeze(adapted);
}

// ============================================================================
// §3(c).5 Error & Turn Classification
// ============================================================================

type ClassifiedAttemptFailure =
  | {
      readonly row: 11;
      readonly status: "refused";
      readonly refusalCode: "unsupported_client";
      readonly retryable: false;
      readonly exitCode: 64;
      readonly reason: string;
      readonly diagnostic?: string;
    }
  | {
      readonly row: 12;
      readonly status: "timeout";
      readonly refusalCode: "deadline_exceeded";
      readonly retryable: true;
      readonly exitCode: 75;
      readonly reason: string;
    }
  | {
      readonly row: 13;
      readonly status: "refused";
      readonly refusalCode: "provider_content_filter";
      readonly retryable: false;
      readonly exitCode: 0;
      readonly reason: string;
    }
  | {
      readonly row: 14;
      readonly status: "refused";
      readonly refusalCode: "empty_completion";
      readonly retryable: false;
      readonly exitCode: 0;
      readonly reason: string;
    }
  | {
      readonly row: 15;
      readonly status: "refused";
      readonly refusalCode: "rate_limited" | "upstream_error";
      readonly retryable: true;
      readonly exitCode: 75;
      readonly reason: string;
    }
  | {
      readonly row: 16;
      readonly status: "refused";
      readonly refusalCode: "invalid_json_output";
      readonly retryable: false;
      readonly exitCode: 0;
      readonly reason: string;
      readonly retryChunk: true;
    }
  | {
      readonly row: 17;
      readonly status: "refused";
      readonly refusalCode: "schema_validation_failed";
      readonly retryable: false;
      readonly exitCode: 0;
      readonly reason: string;
      readonly retryChunk: true;
    }
  | {
      readonly row: 18;
      readonly status: "refused";
      readonly refusalCode: "profile_validation_failed";
      readonly retryable: false;
      readonly exitCode: 0;
      readonly reason: string;
      readonly retryChunk: true;
    }
  | {
      readonly row: 23;
      readonly status: "refused";
      readonly refusalCode: "client_configuration_error";
      readonly retryable: false;
      readonly exitCode: 64;
      readonly reason: string;
    }
  | {
      readonly row: 24;
      readonly status: "refused";
      readonly refusalCode: "rate_limited" | "upstream_error";
      readonly retryable: false;
      readonly exitCode: 0;
      readonly reason: string;
      readonly diagnostic: "unclassified_client_error" | "native_refusal_non_retryable";
    };

function hasOwnProp(obj: unknown, key: string): boolean {
  return obj !== null && typeof obj === "object" && Object.prototype.hasOwnProperty.call(obj, key);
}

function getOwnPropValue(obj: unknown, key: string): unknown {
  if (!hasOwnProp(obj, key)) return undefined;
  const desc = Object.getOwnPropertyDescriptor(obj as object, key);
  return desc && "value" in desc ? desc.value : undefined;
}

function isMeshCandidate(val: unknown): boolean {
  return (
    val !== null &&
    typeof val === "object" &&
    typeof getOwnPropValue(val, "providerId") === "string" &&
    typeof getOwnPropValue(val, "retryable") === "boolean"
  );
}

function isCandidateErrorNode(val: unknown): boolean {
  if (val === null || typeof val !== "object") return false;
  if (isMeshCandidate(val)) return true;
  const status = getOwnPropValue(val, "status");
  const statusCode = getOwnPropValue(val, "statusCode");
  const code = getOwnPropValue(val, "code");
  const isRetryable = getOwnPropValue(val, "isRetryable");
  return (
    (typeof status === "number" && Number.isFinite(status)) ||
    (typeof statusCode === "number" && Number.isFinite(statusCode)) ||
    typeof code === "string" ||
    isRetryable === true
  );
}

function isRetryWrapper(val: unknown): boolean {
  if (val === null || typeof val !== "object") return false;
  const name = getOwnPropValue(val, "name");
  if (name === "AI_RetryError") return true;
  const errors = getOwnPropValue(val, "errors");
  return Array.isArray(errors) && hasOwnProp(val, "lastError");
}

function selectUnwrappedErrorCandidate(thrown: unknown): unknown {
  if (isCandidateErrorNode(thrown)) return thrown;
  let current: unknown = thrown;
  for (let depth = 0; depth < 3; depth++) {
    if (current === null || typeof current !== "object") break;
    let next: unknown = undefined;
    if (isRetryWrapper(current) && hasOwnProp(current, "lastError")) {
      next = getOwnPropValue(current, "lastError");
    } else if (hasOwnProp(current, "cause")) {
      next = getOwnPropValue(current, "cause");
    } else if (hasOwnProp(current, "lastError")) {
      next = getOwnPropValue(current, "lastError");
    }
    if (next === undefined || next === null) break;
    if (isCandidateErrorNode(next)) return next;
    current = next;
  }
  return thrown;
}

function extractNumericStatus(node: unknown): number | null {
  if (node === null || typeof node !== "object") return null;
  const s = getOwnPropValue(node, "status");
  if (typeof s === "number" && Number.isFinite(s)) return s;
  const sc = getOwnPropValue(node, "statusCode");
  if (typeof sc === "number" && Number.isFinite(sc)) return sc;
  return null;
}

function classifyThrownGenerateError(
  err: unknown,
  deadlineFired: boolean,
): ClassifiedAttemptFailure {
  const topMsg =
    err instanceof Error
      ? err.message
      : err !== null && typeof err === "object" && typeof getOwnPropValue(err, "message") === "string"
        ? (getOwnPropValue(err, "message") as string)
        : String(err);

  // §3(c).5 message-based rules use `err.message` on `Error` instances and `String(err)` otherwise
  const ruleMsg = err instanceof Error ? err.message : String(err);

  const topName =
    err instanceof Error
      ? err.name
      : err !== null && typeof err === "object" && typeof getOwnPropValue(err, "name") === "string"
        ? (getOwnPropValue(err, "name") as string)
        : "";

  // (i) AbortError or deadline fired -> Row 12
  if (deadlineFired || topName === "AbortError") {
    return {
      row: 12,
      status: "timeout",
      refusalCode: "deadline_exceeded",
      retryable: true,
      exitCode: 75,
      reason: topMsg || "deadline_exceeded",
    };
  }

  // (ii) Missing provider credential -> Row 23
  if (ruleMsg.startsWith("Missing provider credential")) {
    return {
      row: 23,
      status: "refused",
      refusalCode: "client_configuration_error",
      retryable: false,
      exitCode: 64,
      reason: topMsg,
    };
  }

  // (ii-b) Graphify mesh: -> Row 23
  if (ruleMsg.startsWith("Graphify mesh: ")) {
    return {
      row: 23,
      status: "refused",
      refusalCode: "client_configuration_error",
      retryable: false,
      exitCode: 64,
      reason: topMsg,
    };
  }

  // (iii) Exact empty message -> Row 14
  if (ruleMsg === "LLM returned empty or filtered response") {
    return {
      row: 14,
      status: "refused",
      refusalCode: "empty_completion",
      retryable: false,
      exitCode: 0,
      reason: topMsg,
    };
  }

  // (iv) Direct LLM JSON parse / size rejections -> Row 16
  if (
    ruleMsg.startsWith("Direct LLM response was not valid JSON") ||
    ruleMsg.startsWith("Direct LLM response exceeds")
  ) {
    return {
      row: 16,
      status: "refused",
      refusalCode: "invalid_json_output",
      retryable: false,
      exitCode: 0,
      reason: topMsg,
      retryChunk: true,
    };
  }

  // (v)-(vii) Unwrapped error chain (up to 3 levels), mesh candidate first
  const candidate = selectUnwrappedErrorCandidate(err);

  if (isMeshCandidate(candidate)) {
    const statusCode = extractNumericStatus(candidate);
    const rawCode = getOwnPropValue(candidate, "code");
    const lowerCode = typeof rawCode === "string" ? rawCode.toLowerCase() : "";
    const retryable = getOwnPropValue(candidate, "retryable");
    const retryReason = getOwnPropValue(candidate, "retryReason");

    if (
      statusCode === 401 ||
      statusCode === 403 ||
      statusCode === 404 ||
      lowerCode === "unauthorized" ||
      lowerCode === "forbidden" ||
      lowerCode === "invalid_api_key" ||
      lowerCode.includes("reauth") ||
      lowerCode.includes("reenroll")
    ) {
      return {
        row: 23,
        status: "refused",
        refusalCode: "client_configuration_error",
        retryable: false,
        exitCode: 64,
        reason: topMsg,
      };
    }

    if (retryable === true) {
      const code =
        retryReason === "rate_limit" || statusCode === 429 ? "rate_limited" : "upstream_error";
      return {
        row: 15,
        status: "refused",
        refusalCode: code,
        retryable: true,
        exitCode: 75,
        reason: topMsg,
      };
    }
  }

  const status = extractNumericStatus(candidate);
  const rawCode =
    candidate !== null && typeof candidate === "object" ? getOwnPropValue(candidate, "code") : undefined;
  const upperCode = typeof rawCode === "string" ? rawCode.toUpperCase() : "";
  const isRetryableFlag =
    candidate !== null && typeof candidate === "object" && getOwnPropValue(candidate, "isRetryable") === true;

  // (v) status 401, 403, or 404 -> Row 23
  if (status === 401 || status === 403 || status === 404) {
    return {
      row: 23,
      status: "refused",
      refusalCode: "client_configuration_error",
      retryable: false,
      exitCode: 64,
      reason: topMsg,
    };
  }

  // (vi) status 429 -> Row 15 rate_limited
  if (status === 429) {
    return {
      row: 15,
      status: "refused",
      refusalCode: "rate_limited",
      retryable: true,
      exitCode: 75,
      reason: topMsg,
    };
  }

  // (vii) status 408, 409, 5xx, network codes, isRetryable === true, or "fetch failed" -> Row 15
  if (
    status === 408 ||
    status === 409 ||
    (status !== null && status >= 500 && status <= 599) ||
    upperCode === "ENOTFOUND" ||
    upperCode === "ECONNRESET" ||
    upperCode === "ECONNREFUSED" ||
    upperCode === "ETIMEDOUT" ||
    isRetryableFlag ||
    ruleMsg.includes("fetch failed")
  ) {
    return {
      row: 15,
      status: "refused",
      refusalCode: "upstream_error",
      retryable: true,
      exitCode: 75,
      reason: topMsg,
    };
  }

  // (ix) Unclassified client error -> Row 24
  return {
    row: 24,
    status: "refused",
    refusalCode: "upstream_error",
    retryable: false,
    exitCode: 0,
    reason: topMsg || "unclassified_client_error",
    diagnostic: "unclassified_client_error",
  };
}

function classifyNativeRefusalResponse(turn: HeadlessLlmTurnResponse): ClassifiedAttemptFailure {
  const reason = turn.refusalReason ?? turn.refusalCode ?? "refused";
  // Adapter-specific reasons mapped to Row 11
  if (turn.refusalReason === "unsupported_client") {
    return {
      row: 11,
      status: "refused",
      refusalCode: "unsupported_client",
      retryable: false,
      exitCode: 64,
      reason: "unsupported_client",
    };
  }
  if (turn.refusalReason === "client_did_not_expose_text") {
    return {
      row: 11,
      status: "refused",
      refusalCode: "unsupported_client",
      retryable: false,
      exitCode: 64,
      reason: "client_did_not_expose_text",
      diagnostic: "client_did_not_expose_text",
    };
  }

  // Code-first dispatch (§3(c).5)
  if (turn.refusalCode === "empty_completion") {
    return {
      row: 14,
      status: "refused",
      refusalCode: "empty_completion",
      retryable: false,
      exitCode: 0,
      reason,
    };
  }
  if (turn.refusalCode === "provider_content_filter") {
    return {
      row: 13,
      status: "refused",
      refusalCode: "provider_content_filter",
      retryable: false,
      exitCode: 0,
      reason,
    };
  }

  const code: "rate_limited" | "upstream_error" =
    turn.refusalCode === "rate_limited" ? "rate_limited" : "upstream_error";

  if (turn.retryable === true) {
    return {
      row: 15,
      status: "refused",
      refusalCode: code,
      retryable: true,
      exitCode: 75,
      reason,
    };
  }

  return {
    row: 24,
    status: "refused",
    refusalCode: code,
    retryable: false,
    exitCode: 0,
    reason,
    diagnostic: "native_refusal_non_retryable",
  };
}

function isContentFilterFinishReason(finishReason: string | null | undefined): boolean {
  if (typeof finishReason !== "string") return false;
  const normalized = finishReason.toLowerCase().replace(/-/g, "_");
  return normalized.includes("content_filter");
}

// ============================================================================
// §3(d).3 Citation Stamping, Page Matching, QuoteSpan, and Profile Pruning
// ============================================================================

function locatorPart(value: string | number | null | undefined): string {
  return value === undefined || value === null ? "" : String(value);
}

function processCitationsForItem(
  citations: readonly OntologyCitation[] | undefined,
  pageTextByLocator: ReadonlyMap<string, string>,
  normalizedDocSha: Digest,
  sourceFile: string,
  stats: {
    overwrittenCount: number;
    unknownPage: boolean;
    outOfBounds: boolean;
  },
): OntologyCitation[] | undefined {
  if (!Array.isArray(citations)) return undefined;
  const kept: OntologyCitation[] = [];

  for (const cit of citations) {
    if (!isPlainObject(cit)) continue;
    const pageLoc = locatorPart(cit.page as string | number | null | undefined);
    const pageText = pageTextByLocator.get(pageLoc);
    if (pageText === undefined) {
      stats.unknownPage = true;
      continue;
    }

    if (cit.quoteSpan !== undefined && cit.quoteSpan !== null) {
      if (
        !Array.isArray(cit.quoteSpan) ||
        cit.quoteSpan.length !== 2 ||
        typeof cit.quoteSpan[0] !== "number" ||
        typeof cit.quoteSpan[1] !== "number" ||
        !Number.isInteger(cit.quoteSpan[0]) ||
        !Number.isInteger(cit.quoteSpan[1]) ||
        cit.quoteSpan[0] < 0 ||
        cit.quoteSpan[0] > cit.quoteSpan[1] ||
        cit.quoteSpan[1] > pageText.length
      ) {
        stats.outOfBounds = true;
        continue;
      }
    }

    const hadDifferentIdentity =
      (cit.docSha !== undefined && cit.docSha !== normalizedDocSha) ||
      (cit.source_file !== undefined && cit.source_file !== sourceFile);
    if (hadDifferentIdentity) {
      stats.overwrittenCount++;
    }

    const stamped: Record<string, unknown> = {};
    for (const k of Object.keys(cit)) {
      defineOwnProp(stamped, k, (cit as Record<string, unknown>)[k]);
    }
    defineOwnProp(stamped, "docSha", normalizedDocSha);
    defineOwnProp(stamped, "source_file", sourceFile);
    kept.push(stamped as unknown as OntologyCitation);
  }

  return kept;
}

function validateAndPruneChunkExtraction(params: {
  rawParsed: unknown;
  sortedProfile: NormalizedOntologyProfile;
  pageTextByLocator: ReadonlyMap<string, string>;
  normalizedDocSha: Digest;
  sourceFile: string;
  acceptedTokensIn: number | null;
  acceptedTokensOut: number | null;
}):
  | {
      readonly ok: true;
      readonly extraction: Extraction;
      readonly diagnostics: readonly string[];
    }
  | {
      readonly ok: false;
      readonly row: 17 | 18;
      readonly reason: string;
    } {
  // 1. Base & semantic fragment validation (Row 17)
  const semanticErrors = validateSemanticFragment(params.rawParsed);
  const baseErrors = validateExtraction(params.rawParsed);
  if (semanticErrors.length > 0 || baseErrors.length > 0) {
    const first = semanticErrors[0] ?? baseErrors[0] ?? "schema_validation_failed";
    return { ok: false, row: 17, reason: first };
  }

  if (!isPlainObject(params.rawParsed)) {
    return { ok: false, row: 17, reason: "fragment must be a plain object" };
  }

  const fragment = structuredClone(params.rawParsed) as unknown as Extraction;
  const initialItemCount =
    (Array.isArray(fragment.nodes) ? fragment.nodes.length : 0) +
    (Array.isArray(fragment.edges) ? fragment.edges.length : 0);

  // 2. Citation page matching, quoteSpan validation, and identity stamping
  const citStats = {
    overwrittenCount: 0,
    unknownPage: false,
    outOfBounds: false,
  };

  if (Array.isArray(fragment.nodes)) {
    for (const node of fragment.nodes) {
      if (isPlainObject(node) && Array.isArray(node.citations)) {
        node.citations = processCitationsForItem(
          node.citations,
          params.pageTextByLocator,
          params.normalizedDocSha,
          params.sourceFile,
          citStats,
        );
      }
    }
  }

  if (Array.isArray(fragment.edges)) {
    for (const edge of fragment.edges) {
      if (isPlainObject(edge) && Array.isArray(edge.citations)) {
        edge.citations = processCitationsForItem(
          edge.citations,
          params.pageTextByLocator,
          params.normalizedDocSha,
          params.sourceFile,
          citStats,
        );
      }
    }
  }

  const chunkDiagnostics: string[] = [];
  if (citStats.overwrittenCount > 0) {
    chunkDiagnostics.push(`citation_identity_overwritten:${citStats.overwrittenCount}`);
  }
  if (citStats.unknownPage) {
    chunkDiagnostics.push("citation_page_unknown");
  }
  if (citStats.outOfBounds) {
    chunkDiagnostics.push("quote_span_out_of_bounds");
  }

  // 3. Profile validation & per-item pruning + cascade (§3(d).3)
  let val1;
  try {
    val1 = validateProfileExtraction(fragment, { profile: params.sortedProfile });
  } catch (err) {
    return {
      ok: false,
      row: 18,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
  if (!val1.valid) {
    const errorIssues = val1.issues.filter((iss) => iss.severity === "error");
    if (
      errorIssues.some(
        (iss) =>
          iss.code === "base_schema" ||
          (iss.nodeId === undefined && iss.edgeIndex === undefined),
      )
    ) {
      return {
        ok: false,
        row: 18,
        reason: errorIssues[0]?.message ?? "profile_validation_failed",
      };
    }

    const droppedNodeIds = new Set<string>();
    const droppedEdgeIndexes = new Set<number>();

    for (const iss of errorIssues) {
      if (typeof iss.nodeId === "string") {
        droppedNodeIds.add(iss.nodeId);
        const diag = `pruned_node:${iss.nodeId}:${iss.code}`;
        if (!chunkDiagnostics.includes(diag)) {
          chunkDiagnostics.push(diag);
        }
      }
      if (typeof iss.edgeIndex === "number") {
        droppedEdgeIndexes.add(iss.edgeIndex);
        const diag = `pruned_edge:${iss.edgeIndex}:${iss.code}`;
        if (!chunkDiagnostics.includes(diag)) {
          chunkDiagnostics.push(diag);
        }
      }
    }

    if (droppedNodeIds.size > 0 && Array.isArray(fragment.nodes)) {
      fragment.nodes = fragment.nodes.filter((n) => !droppedNodeIds.has(n.id));
    }

    // Cascade dropped node IDs to edges (using pre-prune edge index)
    if (Array.isArray(fragment.edges)) {
      const survivingEdges: Extraction["edges"] = [];
      for (let idx = 0; idx < fragment.edges.length; idx++) {
        const edge = fragment.edges[idx]!;
        if (droppedEdgeIndexes.has(idx)) {
          continue;
        }
        if (droppedNodeIds.has(edge.source) || droppedNodeIds.has(edge.target)) {
          const diag = `pruned_edge:${idx}:dangling`;
          if (!chunkDiagnostics.includes(diag)) {
            chunkDiagnostics.push(diag);
          }
          continue;
        }
        survivingEdges.push(edge);
      }
      fragment.edges = survivingEdges;
    }

    // Cascade to hyperedges, mentions, occurrences, mappings when nodes were dropped
    if (droppedNodeIds.size > 0) {
      if (Array.isArray(fragment.hyperedges)) {
        const survivingHyperedges: NonNullable<Extraction["hyperedges"]> = [];
        for (const he of fragment.hyperedges) {
          if (!isPlainObject(he) || !Array.isArray(he.nodes)) {
            survivingHyperedges.push(he);
            continue;
          }
          const origLen = he.nodes.length;
          const filteredNodes = he.nodes.filter((nid) => !droppedNodeIds.has(nid));
          if (filteredNodes.length < 2) {
            chunkDiagnostics.push(`pruned_hyperedge:${he.id}:dangling`);
          } else {
            if (filteredNodes.length < origLen) {
              chunkDiagnostics.push(`pruned_hyperedge_ref:${he.id}:dangling`);
            }
            survivingHyperedges.push({
              ...he,
              nodes: filteredNodes,
            });
          }
        }
        fragment.hyperedges = survivingHyperedges;
      }

      if (Array.isArray(fragment.mentions)) {
        fragment.mentions = fragment.mentions.map((m) => {
          if (isPlainObject(m) && typeof m.node_id === "string" && droppedNodeIds.has(m.node_id)) {
            chunkDiagnostics.push(`pruned_mention_ref:${m.id}:dangling`);
            const copy: Record<string, unknown> = {};
            for (const k of Object.keys(m)) {
              if (k !== "node_id") {
                defineOwnProp(copy, k, (m as unknown as Record<string, unknown>)[k]);
              }
            }
            return copy as unknown as typeof m;
          }
          return m;
        });
      }

      if (Array.isArray(fragment.occurrences)) {
        fragment.occurrences = fragment.occurrences.map((occ) => {
          if (
            isPlainObject(occ) &&
            Array.isArray(occ.linked_entity_ids) &&
            occ.linked_entity_ids.some((id) => droppedNodeIds.has(id))
          ) {
            chunkDiagnostics.push(`pruned_occurrence_ref:${occ.id}:dangling`);
            return {
              ...occ,
              linked_entity_ids: occ.linked_entity_ids.filter((id) => !droppedNodeIds.has(id)),
            };
          }
          return occ;
        });
      }

      if (Array.isArray(fragment.mappings)) {
        const survivingMappings: NonNullable<Extraction["mappings"]> = [];
        for (const mp of fragment.mappings) {
          if (
            isPlainObject(mp) &&
            (droppedNodeIds.has(mp.source_id) || droppedNodeIds.has(mp.target_id))
          ) {
            chunkDiagnostics.push(`pruned_mapping:${mp.id}:dangling`);
            continue;
          }
          survivingMappings.push(mp);
        }
        fragment.mappings = survivingMappings;
      }
    }

    // If pruning dropped all items the model returned, the attempt fails as Row 18
    const postPruneItemCount =
      (Array.isArray(fragment.nodes) ? fragment.nodes.length : 0) +
      (Array.isArray(fragment.edges) ? fragment.edges.length : 0);
    if (initialItemCount > 0 && postPruneItemCount === 0) {
      return {
        ok: false,
        row: 18,
        reason: "all returned items failed profile validation and were pruned",
      };
    }

    // Re-validate once after pruning
    let val2;
    try {
      val2 = validateProfileExtraction(fragment, { profile: params.sortedProfile });
    } catch (err) {
      return {
        ok: false,
        row: 18,
        reason: err instanceof Error ? err.message : String(err),
      };
    }
    if (!val2.valid) {
      const err2 = val2.issues.find((i) => i.severity === "error");
      return {
        ok: false,
        row: 18,
        reason: err2?.message ?? "profile_validation_failed after pruning",
      };
    }
  }

  // Overwrite chunk input_tokens / output_tokens with client-reported counts (null -> 0)
  fragment.input_tokens = params.acceptedTokensIn ?? 0;
  fragment.output_tokens = params.acceptedTokensOut ?? 0;

  return {
    ok: true,
    extraction: fragment,
    diagnostics: chunkDiagnostics,
  };
}

// ============================================================================
// Coverage Transition Helper & Batch Row-24 Deferral Hook
// ============================================================================

interface DeferredRow24Transition {
  readonly port: CoverageRegistryPort;
  readonly record: CoverageRecordV1;
}

interface InternalExtractBatchContext {
  readonly deferRow24Transitions: boolean;
}

interface InternalExtractDocumentOutcome {
  readonly result: HeadlessExtractResult;
  readonly endedInRow24: boolean;
  readonly row24Reason: {
    readonly refusalCode: ExtractionRefusalCode;
    readonly diagnostic: "unclassified_client_error" | "native_refusal_non_retryable";
  } | null;
  readonly heldRow24Transition: DeferredRow24Transition | null;
}

function appendUniqueDiagnostics(
  base: readonly string[],
  extras: readonly string[],
): string[] {
  const out = [...base];
  for (const d of extras) {
    if (!out.includes(d)) {
      out.push(d);
    }
  }
  return out;
}

function withReceiptDiagnostics(
  receipt: ExtractionReceiptV1,
  extras: readonly string[],
): ExtractionReceiptV1 {
  if (extras.length === 0) return receipt;
  const merged = appendUniqueDiagnostics(receipt.diagnostics, extras);
  if (merged.length === receipt.diagnostics.length) return receipt;
  const copy: Record<string, unknown> = {};
  for (const k of Object.keys(receipt)) {
    defineOwnProp(copy, k, (receipt as unknown as Record<string, unknown>)[k]);
  }
  defineOwnProp(copy, "diagnostics", merged);
  return deepFreeze(copy as unknown as ExtractionReceiptV1);
}

function findStoredSourceFile(extraction: Extraction): string | null {
  if (!isPlainObject(extraction)) return null;
  if (Array.isArray(extraction.nodes)) {
    for (const node of extraction.nodes) {
      if (!isPlainObject(node)) continue;
      if (Array.isArray(node.citations)) {
        for (const cit of node.citations) {
          if (!isPlainObject(cit)) continue;
          if (typeof cit.source_file === "string" && cit.source_file.length > 0) {
            return cit.source_file;
          }
        }
      }
    }
  }
  if (Array.isArray(extraction.edges)) {
    for (const edge of extraction.edges) {
      if (!isPlainObject(edge)) continue;
      if (Array.isArray(edge.citations)) {
        for (const cit of edge.citations) {
          if (!isPlainObject(cit)) continue;
          if (typeof cit.source_file === "string" && cit.source_file.length > 0) {
            return cit.source_file;
          }
        }
      }
    }
  }
  if (Array.isArray(extraction.nodes)) {
    for (const node of extraction.nodes) {
      if (!isPlainObject(node)) continue;
      if (typeof node.source_file === "string" && node.source_file.length > 0) {
        return node.source_file;
      }
    }
  }
  if (Array.isArray(extraction.edges)) {
    for (const edge of extraction.edges) {
      if (!isPlainObject(edge)) continue;
      if (typeof edge.source_file === "string" && edge.source_file.length > 0) {
        return edge.source_file;
      }
    }
  }
  return null;
}

async function applyPreGateCoverageTransition(params: {
  coverage: NonNullable<HeadlessExtractInput["coverage"]>;
  coverageKey: CoverageKey;
  extractionKey: ExtractionKey;
  nowIso: string;
  outcome: CoverageTransitionInput["outcome"];
}): Promise<string[]> {
  const gateRes = await checkCoverageGate(params.coverage.port, params.coverageKey, {
    extractionKey: params.extractionKey,
  });
  if (gateRes.action === "unavailable") {
    if (gateRes.diagnostic.startsWith("coverage_record_unknown_schema:")) {
      return [gateRes.diagnostic];
    }
    return ["coverage_write_failed"];
  }

  const diags: string[] = [];
  if (gateRes.action === "proceed" && gateRes.diagnostic === "coverage_record_invalid") {
    diags.push("coverage_record_invalid");
  }

  const nextRecord = transitionCoverageRecord({
    current: gateRes.record,
    key: params.coverageKey,
    extractionKey: params.extractionKey,
    outcome: params.outcome,
    maxFailures: params.coverage.maxFailures,
    maxRetryableFailures: params.coverage.maxRetryableFailures,
    nowIso: params.nowIso,
  });

  try {
    await params.coverage.port.put(nextRecord);
  } catch {
    diags.push("coverage_write_failed");
  }

  return diags;
}

function buildEarlyRefusalResult(params: {
  extractionKey: ExtractionKey | null;
  docSha: string;
  profileDigest: string;
  promptVersion: string;
  engramVersion: string;
  model: string | null;
  provider: string | null;
  modelSource: "response" | "client" | "unknown";
  latencyMs: number;
  refusalCode: ExtractionRefusalCode;
  refusalReason: string;
  diagnostics: readonly string[];
  exitCode: 0 | 64 | 65 | 75;
}): InternalExtractDocumentOutcome {
  const receipt: ExtractionReceiptV1 = deepFreeze({
    extractionKey: params.extractionKey,
    docSha: params.docSha,
    profileDigest: params.profileDigest,
    promptVersion: params.promptVersion,
    engramVersion: params.engramVersion,
    status: "refused",
    fromCache: false,
    attempts: 0,
    model: params.model,
    provider: params.provider,
    modelSource: params.modelSource,
    latencyMs: params.latencyMs,
    tokensIn: null,
    tokensOut: null,
    retryable: false,
    refusalCode: params.refusalCode,
    refusalReason: params.refusalReason,
    diagnostics: [...params.diagnostics],
  });

  return {
    result: Object.freeze({
      extraction: null,
      receipt,
      mergeConflicts: Object.freeze([]),
      suggestedExitCode: params.exitCode,
    }),
    endedInRow24: false,
    row24Reason: null,
    heldRow24Transition: null,
  };
}

// ============================================================================
// §3(b) & §3(d) Per-Document Extraction (`extractDocumentBatch`)
// ============================================================================

async function extractDocumentBatchInternal(
  input: HeadlessExtractInput,
  batchCtx: InternalExtractBatchContext,
): Promise<InternalExtractDocumentOutcome> {
  const inObj =
    input !== null && typeof input === "object" && !Array.isArray(input)
      ? (input as unknown as Record<string, unknown>)
      : {};
  const clock = resolveClock(
    inObj.clock !== null && typeof inObj.clock === "object"
      ? (inObj.clock as HeadlessClock)
      : undefined,
  );
  const startMs = clock.nowMs();

  // Extract raw strings for receipt fallback before validation
  const rawDoc = isPlainObject(inObj.document) ? inObj.document : {};
  const rawDocSha = typeof rawDoc.docSha === "string" ? rawDoc.docSha : "";
  const normDocShaCandidate = rawDocSha.trim().toLowerCase();
  const displayDocSha = isDigest(normDocShaCandidate) ? normDocShaCandidate : rawDocSha;

  const rawBundle = isPlainObject(inObj.profileBundle) ? inObj.profileBundle : {};
  const rawProfileDigest = typeof rawBundle.digest === "string" ? rawBundle.digest : "";
  const normProfileDigestCandidate = rawProfileDigest.trim().toLowerCase();
  const displayProfileDigest = isDigest(normProfileDigestCandidate)
    ? normProfileDigestCandidate
    : rawProfileDigest;

  const rawPromptVersion = typeof inObj.promptVersion === "string" ? inObj.promptVersion : "";
  const rawEngramVersion =
    typeof inObj.engramVersion === "string" && inObj.engramVersion.trim().length > 0
      ? inObj.engramVersion.trim().normalize("NFC")
      : EXTRACTION_SEMANTICS_VERSION;

  const rawClient =
    inObj.client !== null && typeof inObj.client === "object"
      ? (inObj.client as HeadlessLlmClient)
      : null;
  const clientProvider =
    rawClient && typeof rawClient.provider === "string" && rawClient.provider.trim().length > 0
      ? rawClient.provider.trim()
      : null;
  const clientModel =
    rawClient && typeof rawClient.model === "string" && rawClient.model.trim().length > 0
      ? rawClient.model.trim()
      : null;
  const initialModelSource: "client" | "unknown" = clientModel !== null ? "client" : "unknown";

  // --------------------------------------------------------------------------
  // Row 1: Validate bounds, coverage config, cache-for-coverage, client provider
  // --------------------------------------------------------------------------
  const bounds = isPlainObject(inObj.bounds) ? inObj.bounds : null;
  const hasCache = inObj.cache !== undefined && inObj.cache !== null;
  const hasCoverage = inObj.coverage !== undefined && inObj.coverage !== null;
  const covObj = hasCoverage && isPlainObject(inObj.coverage) ? inObj.coverage : null;

  const boundsValid =
    bounds !== null &&
    isPositiveFiniteInt(bounds.timeoutMs) &&
    isPositiveFiniteInt(bounds.maxDocumentBytes) &&
    (bounds.maxDocumentPages === undefined || isPositiveFiniteInt(bounds.maxDocumentPages)) &&
    (bounds.maxChunkChars === undefined || isPositiveFiniteInt(bounds.maxChunkChars)) &&
    typeof bounds.maxAttempts === "number" &&
    Number.isFinite(bounds.maxAttempts) &&
    Number.isInteger(bounds.maxAttempts) &&
    bounds.maxAttempts >= 1;

  const coverageConfigValid =
    !hasCoverage ||
    (hasCache &&
      covObj !== null &&
      covObj.port !== null &&
      typeof covObj.port === "object" &&
      typeof covObj.city === "string" &&
      covObj.city.trim().length > 0 &&
      isWellFormedUnicode(covObj.city) &&
      (covObj.maxFailures === undefined || isPositiveFiniteInt(covObj.maxFailures)) &&
      (covObj.maxRetryableFailures === undefined || isPositiveFiniteInt(covObj.maxRetryableFailures)));

  const clientValid =
    rawClient !== null &&
    clientProvider !== null &&
    isWellFormedUnicode(clientProvider) &&
    typeof rawClient.generate === "function";

  if (!boundsValid || !coverageConfigValid || !clientValid) {
    return buildEarlyRefusalResult({
      extractionKey: null,
      docSha: displayDocSha,
      profileDigest: displayProfileDigest,
      promptVersion: rawPromptVersion,
      engramVersion: rawEngramVersion,
      model: clientModel,
      provider: clientProvider,
      modelSource: initialModelSource,
      latencyMs: clampLatency(startMs, clock.nowMs()),
      refusalCode: "invalid_bounds",
      refusalReason: "invalid execution bounds, coverage configuration, or client provider",
      diagnostics: ["invalid_bounds"],
      exitCode: 64,
    });
  }

  const validBounds = bounds as unknown as HeadlessExecutionBounds;
  const maxChunkChars = validBounds.maxChunkChars ?? DEFAULT_MAX_CHUNK_CHARS;
  const validClient = rawClient!;
  const validCoverage = hasCoverage
    ? (covObj as unknown as NonNullable<HeadlessExtractInput["coverage"]>)
    : undefined;

  // --------------------------------------------------------------------------
  // Row 2 & Row 4: Bundle re-validation, registry digest check, identity & policy
  // --------------------------------------------------------------------------
  const bundleCheck = revalidateFullBundleAndRederiveProfile(inObj.profileBundle);
  if (!bundleCheck.ok) {
    return buildEarlyRefusalResult({
      extractionKey: null,
      docSha: displayDocSha,
      profileDigest: displayProfileDigest,
      promptVersion: rawPromptVersion,
      engramVersion: rawEngramVersion,
      model: clientModel,
      provider: clientProvider,
      modelSource: initialModelSource,
      latencyMs: clampLatency(startMs, clock.nowMs()),
      refusalCode: "invalid_identity",
      refusalReason: bundleCheck.reason,
      diagnostics: bundleCheck.diagnostic ? [bundleCheck.diagnostic] : ["invalid_identity"],
      exitCode: 65,
    });
  }

  // Row 4: Verify caller-supplied registries against bundle snapshots
  const sortedPromptRegistries: Record<string, RegistryRecord[]> = {};
  const promptRegistriesIdentityMap: Record<string, string> = {};

  if (inObj.registries !== undefined) {
    if (!isPlainObject(inObj.registries)) {
      return buildEarlyRefusalResult({
        extractionKey: null,
        docSha: displayDocSha,
        profileDigest: bundleCheck.digest,
        promptVersion: rawPromptVersion,
        engramVersion: rawEngramVersion,
        model: clientModel,
        provider: clientProvider,
        modelSource: initialModelSource,
        latencyMs: clampLatency(startMs, clock.nowMs()),
        refusalCode: "invalid_identity",
        refusalReason: "registries must be a plain object mapping registryId to record arrays",
        diagnostics: ["registry_digest_mismatch"],
        exitCode: 65,
      });
    }

    for (const supId of Object.keys(inObj.registries)) {
      if (!Object.prototype.hasOwnProperty.call(bundleCheck.registries, supId)) {
        return buildEarlyRefusalResult({
          extractionKey: null,
          docSha: displayDocSha,
          profileDigest: bundleCheck.digest,
          promptVersion: rawPromptVersion,
          engramVersion: rawEngramVersion,
          model: clientModel,
          provider: clientProvider,
          modelSource: initialModelSource,
          latencyMs: clampLatency(startMs, clock.nowMs()),
          refusalCode: "invalid_identity",
          refusalReason: `undeclared registry '${supId}' supplied`,
          diagnostics: ["registry_digest_mismatch"],
          exitCode: 65,
        });
      }

      const snap = bundleCheck.registries[supId]!;
      const records = inObj.registries[supId];
      if (!Array.isArray(records)) {
        return buildEarlyRefusalResult({
          extractionKey: null,
          docSha: displayDocSha,
          profileDigest: bundleCheck.digest,
          promptVersion: rawPromptVersion,
          engramVersion: rawEngramVersion,
          model: clientModel,
          provider: clientProvider,
          modelSource: initialModelSource,
          latencyMs: clampLatency(startMs, clock.nowMs()),
          refusalCode: "invalid_identity",
          refusalReason: `records for registry '${supId}' must be an array`,
          diagnostics: ["registry_digest_mismatch"],
          exitCode: 65,
        });
      }

      for (const rec of records) {
        if (
          !isPlainObject(rec as unknown) ||
          rec.registryId !== supId ||
          rec.nodeType !== snap.binding.node_type
        ) {
          return buildEarlyRefusalResult({
            extractionKey: null,
            docSha: displayDocSha,
            profileDigest: bundleCheck.digest,
            promptVersion: rawPromptVersion,
            engramVersion: rawEngramVersion,
            model: clientModel,
            provider: clientProvider,
            modelSource: initialModelSource,
            latencyMs: clampLatency(startMs, clock.nowMs()),
            refusalCode: "invalid_identity",
            refusalReason: `record in registry '${supId}' mismatched registryId or nodeType`,
            diagnostics: ["registry_digest_mismatch"],
            exitCode: 65,
          });
        }
      }

      const computedDigest = computeRegistryRecordsDigest(records);
      if (!computedDigest || computedDigest !== snap.recordsDigest) {
        return buildEarlyRefusalResult({
          extractionKey: null,
          docSha: displayDocSha,
          profileDigest: bundleCheck.digest,
          promptVersion: rawPromptVersion,
          engramVersion: rawEngramVersion,
          model: clientModel,
          provider: clientProvider,
          modelSource: initialModelSource,
          latencyMs: clampLatency(startMs, clock.nowMs()),
          refusalCode: "invalid_identity",
          refusalReason: `records digest for registry '${supId}' did not match bundle snapshot`,
          diagnostics: ["registry_digest_mismatch"],
          exitCode: 65,
        });
      }

      defineOwnProp(sortedPromptRegistries, supId, sortRegistryRecordsCopy(records));
    }
  }

  for (const regId of Object.keys(bundleCheck.registries).sort()) {
    const snap = bundleCheck.registries[regId]!;
    if (Object.prototype.hasOwnProperty.call(sortedPromptRegistries, regId)) {
      defineOwnProp(promptRegistriesIdentityMap, regId, snap.recordsDigest!);
    } else {
      defineOwnProp(promptRegistriesIdentityMap, regId, "absent");
    }
  }

  // Build ExtractionIdentityInput (§3(d).6) and normalize/compute key (Row 2)
  const identityInput: ExtractionIdentityInput = {
    docSha: rawDocSha,
    profileDigest: bundleCheck.digest,
    promptVersion: rawPromptVersion,
    ...(inObj.engramVersion !== undefined ? { engramVersion: inObj.engramVersion as string } : {}),
    modelPolicy: inObj.modelPolicy as ExtractionModelPolicyV1,
    chunking: {
      maxChunkChars,
      splitter: "v1",
    },
    prompt: {
      registries: promptRegistriesIdentityMap,
      ...(inObj.maxRegistrySamplesPerRegistry !== undefined
        ? { maxRegistrySamplesPerRegistry: inObj.maxRegistrySamplesPerRegistry as number }
        : {}),
    },
  };

  const keyRes = computeExtractionKey(identityInput);
  if (!keyRes.ok) {
    return buildEarlyRefusalResult({
      extractionKey: null,
      docSha: displayDocSha,
      profileDigest: bundleCheck.digest,
      promptVersion: rawPromptVersion,
      engramVersion: rawEngramVersion,
      model: clientModel,
      provider: clientProvider,
      modelSource: initialModelSource,
      latencyMs: clampLatency(startMs, clock.nowMs()),
      refusalCode: "invalid_identity",
      refusalReason: keyRes.issues.map((i) => `${i.path}: ${i.message}`).join("; ") || "invalid_identity",
      diagnostics: keyRes.issues.map((i) => `invalid_identity:${i.path}`),
      exitCode: 65,
    });
  }

  const extractionKey = keyRes.key;
  const normId = keyRes.identity;

  // §3(c).4 Declared-policy check
  const policyDiagnostics: string[] = [];
  if (validClient.provider.trim().toLowerCase() !== normId.modelPolicy.provider) {
    return buildEarlyRefusalResult({
      extractionKey: null,
      docSha: normId.docSha,
      profileDigest: normId.profileDigest,
      promptVersion: normId.promptVersion,
      engramVersion: normId.engramVersion,
      model: clientModel,
      provider: clientProvider,
      modelSource: initialModelSource,
      latencyMs: clampLatency(startMs, clock.nowMs()),
      refusalCode: "invalid_identity",
      refusalReason: "client.provider does not match modelPolicy.provider",
      diagnostics: ["invalid_identity:client.provider"],
      exitCode: 65,
    });
  }

  if (validClient.model !== undefined) {
    if (typeof validClient.model !== "string" || validClient.model.trim() !== normId.modelPolicy.model) {
      return buildEarlyRefusalResult({
        extractionKey: null,
        docSha: normId.docSha,
        profileDigest: normId.profileDigest,
        promptVersion: normId.promptVersion,
        engramVersion: normId.engramVersion,
        model: clientModel,
        provider: clientProvider,
        modelSource: initialModelSource,
        latencyMs: clampLatency(startMs, clock.nowMs()),
        refusalCode: "invalid_identity",
        refusalReason: "client.model does not match modelPolicy.model",
        diagnostics: ["invalid_identity:client.model"],
        exitCode: 65,
      });
    }
  } else {
    policyDiagnostics.push("client_model_undeclared");
  }

  // --------------------------------------------------------------------------
  // Row 3: Validate document input (sourceFile, pages array, unique int pages)
  // --------------------------------------------------------------------------
  const sourceFile = typeof rawDoc.sourceFile === "string" ? rawDoc.sourceFile : "";
  const pages = Array.isArray(rawDoc.pages) ? rawDoc.pages : null;
  let docValid =
    sourceFile.trim().length > 0 &&
    isWellFormedUnicode(sourceFile) &&
    pages !== null &&
    pages.length > 0;

  const seenPageNumbers = new Set<number>();
  const pageTextByLocator = new Map<string, string>();
  let totalUtf8Bytes = 0;

  if (docValid && pages !== null) {
    for (const p of pages) {
      if (
        !isPlainObject(p) ||
        !isNonNegativeFiniteInt(p.page) ||
        typeof p.text !== "string" ||
        !isWellFormedUnicode(p.text) ||
        seenPageNumbers.has(p.page)
      ) {
        docValid = false;
        break;
      }
      seenPageNumbers.add(p.page);
      pageTextByLocator.set(String(p.page), p.text);
      totalUtf8Bytes += Buffer.byteLength(p.text, "utf8");
    }
  }

  if (!docValid || pages === null) {
    return buildEarlyRefusalResult({
      extractionKey,
      docSha: normId.docSha,
      profileDigest: normId.profileDigest,
      promptVersion: normId.promptVersion,
      engramVersion: normId.engramVersion,
      model: clientModel,
      provider: clientProvider,
      modelSource: initialModelSource,
      latencyMs: clampLatency(startMs, clock.nowMs()),
      refusalCode: "invalid_document_input",
      refusalReason: "document.sourceFile must be non-empty and pages must have unique non-negative integer page numbers",
      diagnostics: ["invalid_document_input"],
      exitCode: 65,
    });
  }

  const validPages = pages as unknown as readonly HeadlessDocumentPage[];
  const coverageKey: CoverageKey | null = validCoverage
    ? {
        city: validCoverage.city,
        docSha: normId.docSha,
        profileDigest: normId.profileDigest,
      }
    : null;

  // State captured from inside `produce`
  let produceEndedRow:
    | 6
    | 7
    | 8
    | 11
    | 12
    | 13
    | 14
    | 15
    | 16
    | 17
    | 18
    | 22
    | 23
    | 24
    | null = null;
  let produceSuggestedExit: 0 | 64 | 65 | 75 = 0;
  let gateProceedRecord: CoverageRecordV1 | null = null;
  let gateHadInvalidRecordDiag = false;
  let row24ReasonCaptured: {
    readonly refusalCode: ExtractionRefusalCode;
    readonly diagnostic: "unclassified_client_error" | "native_refusal_non_retryable";
  } | null = null;

  // --------------------------------------------------------------------------
  // Compose with §1 `getOrExtract` (§3(d).1)
  // --------------------------------------------------------------------------
  const cacheResult = await getOrExtract({
    identity: identityInput,
    ...(hasCache ? { cache: inObj.cache as ExtractionCachePort } : {}),
    nowIso: clock.nowIso(),
    nowMs: startMs,
    endMs: () => clock.nowMs(),
    produce: async (key: ExtractionKey): Promise<ProducedExtraction | RefusedProduction> => {
      // 1. Row 6: Size check (UTF-8 bytes > maxDocumentBytes or pages > maxDocumentPages)
      if (
        totalUtf8Bytes > validBounds.maxDocumentBytes ||
        (validBounds.maxDocumentPages !== undefined && validPages.length > validBounds.maxDocumentPages)
      ) {
        produceEndedRow = 6;
        produceSuggestedExit = 0;
        const refusalReceipt: ExtractionReceiptV1 = deepFreeze({
          extractionKey: key,
          docSha: normId.docSha,
          profileDigest: normId.profileDigest,
          promptVersion: normId.promptVersion,
          engramVersion: normId.engramVersion,
          status: "too-large",
          fromCache: false,
          attempts: 0,
          model: clientModel,
          provider: clientProvider,
          modelSource: initialModelSource,
          latencyMs: clampLatency(startMs, clock.nowMs()),
          tokensIn: null,
          tokensOut: null,
          retryable: false,
          refusalCode: "document_too_large",
          refusalReason: "document exceeds configured byte or page bounds",
          diagnostics: [...policyDiagnostics, "document_too_large"],
        });
        return { refused: refusalReceipt };
      }

      // 2. Rows 7, 8, 9: Coverage gate (when coverage is injected)
      const gateDiagnostics: string[] = [...policyDiagnostics];
      if (validCoverage && coverageKey) {
        const gateRes = await checkCoverageGate(validCoverage.port, coverageKey, {
          extractionKey: key,
        });

        if (gateRes.action === "unavailable") {
          produceEndedRow = 7;
          produceSuggestedExit = 75;
          const isUnknownSchema = gateRes.diagnostic.startsWith("coverage_record_unknown_schema:");
          const diags = isUnknownSchema
            ? [...gateDiagnostics, gateRes.diagnostic]
            : [...gateDiagnostics, "coverage_unavailable", ...(gateRes.diagnostic ? [gateRes.diagnostic] : [])];
          const refusalReceipt: ExtractionReceiptV1 = deepFreeze({
            extractionKey: key,
            docSha: normId.docSha,
            profileDigest: normId.profileDigest,
            promptVersion: normId.promptVersion,
            engramVersion: normId.engramVersion,
            status: "refused",
            fromCache: false,
            attempts: 0,
            model: clientModel,
            provider: clientProvider,
            modelSource: initialModelSource,
            latencyMs: clampLatency(startMs, clock.nowMs()),
            tokensIn: null,
            tokensOut: null,
            retryable: true,
            refusalCode: "coverage_unavailable",
            refusalReason: gateRes.diagnostic || "coverage_unavailable",
            diagnostics: diags,
          });
          return { refused: refusalReceipt };
        }

        if (gateRes.action === "skip_abandoned") {
          produceEndedRow = 8;
          produceSuggestedExit = 0;
          const refusalReceipt: ExtractionReceiptV1 = deepFreeze({
            extractionKey: key,
            docSha: normId.docSha,
            profileDigest: normId.profileDigest,
            promptVersion: normId.promptVersion,
            engramVersion: normId.engramVersion,
            status: "abandoned",
            fromCache: false,
            attempts: 0,
            model: clientModel,
            provider: clientProvider,
            modelSource: initialModelSource,
            latencyMs: clampLatency(startMs, clock.nowMs()),
            tokensIn: null,
            tokensOut: null,
            retryable: false,
            refusalCode: "coverage_abandoned",
            refusalReason: "document is marked abandoned in coverage registry",
            diagnostics: [...gateDiagnostics, "coverage_abandoned"],
          });
          return { refused: refusalReceipt };
        }

        if (gateRes.action === "skip_covered") {
          // Row 9: coverage claims covered under current key, but cache missed -> proceed with diagnostic
          gateProceedRecord = gateRes.record;
          gateDiagnostics.push("covered_but_cache_miss");
        } else {
          gateProceedRecord = gateRes.record;
          if (gateRes.diagnostic === "coverage_record_invalid") {
            gateHadInvalidRecordDiag = true;
            gateDiagnostics.push("coverage_record_invalid");
          }
        }
      }

      // 3. Row 11: Mode fence before first chunk (for adapted clients)
      const adapted = isAdaptedClient(validClient);
      if (adapted) {
        const mode = validClient.adaptedFrom.mode;
        if (mode === "assistant" || mode === "batch") {
          produceEndedRow = 11;
          produceSuggestedExit = 64;
          const refusalReceipt: ExtractionReceiptV1 = deepFreeze({
            extractionKey: key,
            docSha: normId.docSha,
            profileDigest: normId.profileDigest,
            promptVersion: normId.promptVersion,
            engramVersion: normId.engramVersion,
            status: "refused",
            fromCache: false,
            attempts: 0,
            model: clientModel,
            provider: clientProvider,
            modelSource: initialModelSource,
            latencyMs: clampLatency(startMs, clock.nowMs()),
            tokensIn: null,
            tokensOut: null,
            retryable: false,
            refusalCode: "unsupported_client",
            refusalReason: `adapted client mode '${mode}' cannot run headless`,
            diagnostics: [...gateDiagnostics, "unsupported_client"],
          });
          return { refused: refusalReceipt };
        }
      }

      // 4. Render & pack pages into chunks (§3(d).2)
      const renderedChunks = renderAndPackPages(validPages, maxChunkChars);
      const promptState = {
        profile: bundleCheck.sortedProfile,
        ...(Object.keys(sortedPromptRegistries).length > 0
          ? { registries: sortedPromptRegistries }
          : {}),
      };
      const promptOptions =
        input.maxRegistrySamplesPerRegistry !== undefined
          ? { maxRegistrySamplesPerRegistry: input.maxRegistrySamplesPerRegistry }
          : {};

      // 5. Setup whole-document deadline timer
      let deadlineFired = false;
      const abortController = typeof AbortController !== "undefined" ? new AbortController() : null;
      let timeoutTrigger: (() => void) | null = null;
      const timeoutPromise = new Promise<"DEADLINE_EXPIRED">((resolve) => {
        timeoutTrigger = () => {
          deadlineFired = true;
          try {
            abortController?.abort();
          } catch {
            // ignore abort errors
          }
          resolve("DEADLINE_EXPIRED");
        };
      });
      const timerHandle = clock.setTimeout(() => {
        timeoutTrigger?.();
      }, validBounds.timeoutMs);

      let startedAttempts = 0;
      let tokensInUnknown = false;
      let tokensOutUnknown = false;
      let sumTokensIn = 0;
      let sumTokensOut = 0;
      let lastReportedModel: string | null = null;
      let firstReportedModel: string | null = null;
      let modelVaried = false;
      let lastReportedProvider: string | null = null;
      const runDiagnostics: string[] = [...gateDiagnostics];
      const acceptedChunks: Extraction[] = [];

      const recordAttemptMetadata = (turn?: HeadlessLlmTurnResponse) => {
        if (!turn) {
          tokensInUnknown = true;
          tokensOutUnknown = true;
          return;
        }
        if (typeof turn.tokensIn === "number" && Number.isFinite(turn.tokensIn)) {
          sumTokensIn += turn.tokensIn;
        } else {
          tokensInUnknown = true;
        }
        if (typeof turn.tokensOut === "number" && Number.isFinite(turn.tokensOut)) {
          sumTokensOut += turn.tokensOut;
        } else {
          tokensOutUnknown = true;
        }
        if (typeof turn.model === "string" && turn.model.trim().length > 0) {
          const m = turn.model.trim();
          if (firstReportedModel === null) {
            firstReportedModel = m;
          } else if (m !== firstReportedModel) {
            modelVaried = true;
          }
          lastReportedModel = m;
          if (m !== normId.modelPolicy.model) {
            const diffDiag = `reported_model_differs_from_policy:${m}`;
            if (!runDiagnostics.includes(diffDiag)) {
              runDiagnostics.push(diffDiag);
            }
          }
        }
        if (typeof turn.provider === "string" && turn.provider.trim().length > 0) {
          lastReportedProvider = turn.provider.trim();
        }
      };

      const buildAttemptRefusalReceipt = (failure: ClassifiedAttemptFailure): ExtractionReceiptV1 => {
        const finalDiagnostics = [...runDiagnostics];
        if (modelVaried && !finalDiagnostics.includes("model_varied_across_attempts")) {
          finalDiagnostics.push("model_varied_across_attempts");
        }
        if ("diagnostic" in failure && failure.diagnostic && !finalDiagnostics.includes(failure.diagnostic)) {
          finalDiagnostics.push(failure.diagnostic);
        }
        if (!finalDiagnostics.includes(failure.refusalCode)) {
          finalDiagnostics.push(failure.refusalCode);
        }

        const resolvedModel = lastReportedModel ?? clientModel;
        const resolvedProvider = lastReportedProvider ?? clientProvider;
        const resolvedModelSource: "response" | "client" | "unknown" =
          resolvedModel === null
            ? "unknown"
            : adapted
              ? "client"
              : lastReportedModel !== null
                ? "response"
                : "client";

        return deepFreeze({
          extractionKey: key,
          docSha: normId.docSha,
          profileDigest: normId.profileDigest,
          promptVersion: normId.promptVersion,
          engramVersion: normId.engramVersion,
          status: failure.status,
          fromCache: false,
          attempts: startedAttempts,
          model: resolvedModel,
          provider: resolvedProvider,
          modelSource: resolvedModelSource,
          latencyMs: clampLatency(startMs, clock.nowMs()),
          tokensIn: startedAttempts === 0 || tokensInUnknown ? null : sumTokensIn,
          tokensOut: startedAttempts === 0 || tokensOutUnknown ? null : sumTokensOut,
          retryable: failure.retryable,
          refusalCode: failure.refusalCode,
          refusalReason: failure.reason,
          diagnostics: finalDiagnostics,
        });
      };

      try {
        for (const renderedChunk of renderedChunks) {
          const chunkPrompt = buildProfileChunkPrompt(
            promptState,
            {
              filePath: sourceFile,
              fileType: "document",
              text: renderedChunk,
            },
            promptOptions,
          );

          let chunkAccepted = false;
          let lastChunkFailure: ClassifiedAttemptFailure | null = null;

          for (let attempt = 1; attempt <= validBounds.maxAttempts; attempt++) {
            if (deadlineFired || clock.nowMs() - startMs >= validBounds.timeoutMs) {
              deadlineFired = true;
              const timeoutFailure: ClassifiedAttemptFailure = {
                row: 12,
                status: "timeout",
                refusalCode: "deadline_exceeded",
                retryable: true,
                exitCode: 75,
                reason: "document deadline exceeded before attempt start",
              };
              produceEndedRow = 12;
              produceSuggestedExit = 75;
              return { refused: buildAttemptRefusalReceipt(timeoutFailure) };
            }

            startedAttempts++;

            const genCallPromise = Promise.resolve().then(() =>
              validClient.generate({
                schema: EXTRACTION_SCHEMA_V1,
                prompt: chunkPrompt,
                ...(normId.modelPolicy.maxOutputTokens !== null
                  ? { maxOutputTokens: normId.modelPolicy.maxOutputTokens }
                  : {}),
                ...(abortController ? { signal: abortController.signal } : {}),
              }),
            );

            // Prevent unhandled rejection if deadline abandons the turn
            genCallPromise.catch(() => {});

            let turnResult: HeadlessLlmTurnResponse;
            try {
              const raced = await Promise.race([genCallPromise, timeoutPromise]);
              if (raced === "DEADLINE_EXPIRED" || deadlineFired) {
                recordAttemptMetadata(undefined);
                const timeoutFailure: ClassifiedAttemptFailure = {
                  row: 12,
                  status: "timeout",
                  refusalCode: "deadline_exceeded",
                  retryable: true,
                  exitCode: 75,
                  reason: "document deadline exceeded while awaiting model turn",
                };
                produceEndedRow = 12;
                produceSuggestedExit = 75;
                return { refused: buildAttemptRefusalReceipt(timeoutFailure) };
              }
              turnResult = raced;
            } catch (err) {
              recordAttemptMetadata(undefined);
              const classified = classifyThrownGenerateError(err, deadlineFired);
              lastChunkFailure = classified;
              if (
                (classified.row === 15 || classified.row === 16) &&
                attempt < validBounds.maxAttempts
              ) {
                continue;
              }
              produceEndedRow = classified.row;
              produceSuggestedExit = classified.exitCode;
              if (classified.row === 24) {
                row24ReasonCaptured = {
                  refusalCode: classified.refusalCode,
                  diagnostic: classified.diagnostic,
                };
              }
              return { refused: buildAttemptRefusalReceipt(classified) };
            }

            // If deadline fired concurrently as turn settled
            if (deadlineFired) {
              recordAttemptMetadata(undefined);
              const timeoutFailure: ClassifiedAttemptFailure = {
                row: 12,
                status: "timeout",
                refusalCode: "deadline_exceeded",
                retryable: true,
                exitCode: 75,
                reason: "document deadline exceeded",
              };
              produceEndedRow = 12;
              produceSuggestedExit = 75;
              return { refused: buildAttemptRefusalReceipt(timeoutFailure) };
            }

            recordAttemptMetadata(turnResult);

            // Native / adapted `status: "refused"` response
            if (turnResult.status === "refused") {
              const classified = classifyNativeRefusalResponse(turnResult);
              lastChunkFailure = classified;
              if (classified.row === 15 && attempt < validBounds.maxAttempts) {
                continue;
              }
              produceEndedRow = classified.row;
              produceSuggestedExit = classified.exitCode;
              if (classified.row === 24) {
                row24ReasonCaptured = {
                  refusalCode: classified.refusalCode,
                  diagnostic: classified.diagnostic,
                };
              }
              return { refused: buildAttemptRefusalReceipt(classified) };
            }

            // Row 13: finishReason content_filter check
            if (isContentFilterFinishReason(turnResult.finishReason)) {
              const filterFailure: ClassifiedAttemptFailure = {
                row: 13,
                status: "refused",
                refusalCode: "provider_content_filter",
                retryable: false,
                exitCode: 0,
                reason: `finishReason '${turnResult.finishReason}' indicates content filtering`,
              };
              produceEndedRow = 13;
              produceSuggestedExit = 0;
              return { refused: buildAttemptRefusalReceipt(filterFailure) };
            }

            // Parse JSON from returned text
            let parsedJson: unknown;
            try {
              parsedJson = parseJsonFromLlmText(turnResult.text ?? "");
            } catch (parseErr) {
              const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
              if (msg === "LLM returned empty or filtered response") {
                const emptyFailure: ClassifiedAttemptFailure = {
                  row: 14,
                  status: "refused",
                  refusalCode: "empty_completion",
                  retryable: false,
                  exitCode: 0,
                  reason: msg,
                };
                produceEndedRow = 14;
                produceSuggestedExit = 0;
                return { refused: buildAttemptRefusalReceipt(emptyFailure) };
              }
              lastChunkFailure = {
                row: 16,
                status: "refused",
                refusalCode: "invalid_json_output",
                retryable: false,
                exitCode: 0,
                reason: msg,
                retryChunk: true,
              };
              if (attempt < validBounds.maxAttempts) {
                continue;
              }
              produceEndedRow = 16;
              produceSuggestedExit = 0;
              return { refused: buildAttemptRefusalReceipt(lastChunkFailure) };
            }

            // Validate & prune chunk extraction (Rows 17 & 18)
            const chunkCheck = validateAndPruneChunkExtraction({
              rawParsed: parsedJson,
              sortedProfile: bundleCheck.sortedProfile,
              pageTextByLocator,
              normalizedDocSha: normId.docSha,
              sourceFile,
              acceptedTokensIn: turnResult.tokensIn,
              acceptedTokensOut: turnResult.tokensOut,
            });

            if (!chunkCheck.ok) {
              lastChunkFailure =
                chunkCheck.row === 17
                  ? {
                      row: 17,
                      status: "refused",
                      refusalCode: "schema_validation_failed",
                      retryable: false,
                      exitCode: 0,
                      reason: chunkCheck.reason,
                      retryChunk: true,
                    }
                  : {
                      row: 18,
                      status: "refused",
                      refusalCode: "profile_validation_failed",
                      retryable: false,
                      exitCode: 0,
                      reason: chunkCheck.reason,
                      retryChunk: true,
                    };
              if (attempt < validBounds.maxAttempts) {
                continue;
              }
              produceEndedRow = chunkCheck.row;
              produceSuggestedExit = 0;
              return { refused: buildAttemptRefusalReceipt(lastChunkFailure) };
            }

            // Chunk accepted!
            for (const d of chunkCheck.diagnostics) {
              if (!runDiagnostics.includes(d)) {
                runDiagnostics.push(d);
              }
            }
            acceptedChunks.push(chunkCheck.extraction);
            chunkAccepted = true;
            break;
          }

          if (!chunkAccepted && lastChunkFailure) {
            produceEndedRow = lastChunkFailure.row;
            produceSuggestedExit = lastChunkFailure.exitCode;
            return { refused: buildAttemptRefusalReceipt(lastChunkFailure) };
          }
        }

        // All chunks accepted -> merge via §4 `mergeExtractionsWithCitations`
        const merged = mergeAcceptedChunksPrepared(acceptedChunks, { root: input.root });
        produceEndedRow = 22;
        produceSuggestedExit = 0;

        if (modelVaried && !runDiagnostics.includes("model_varied_across_attempts")) {
          runDiagnostics.push("model_varied_across_attempts");
        }

        const resolvedModel = lastReportedModel ?? clientModel;
        const resolvedProvider = lastReportedProvider ?? clientProvider;
        const resolvedModelSource: "response" | "client" | "unknown" =
          resolvedModel === null
            ? "unknown"
            : adapted
              ? "client"
              : lastReportedModel !== null
                ? "response"
                : "client";

        const okReceipt: ExtractionReceiptV1 = deepFreeze({
          extractionKey: key,
          docSha: normId.docSha,
          profileDigest: normId.profileDigest,
          promptVersion: normId.promptVersion,
          engramVersion: normId.engramVersion,
          status: "ok",
          fromCache: false,
          attempts: startedAttempts,
          model: resolvedModel,
          provider: resolvedProvider,
          modelSource: resolvedModelSource,
          latencyMs: clampLatency(startMs, clock.nowMs()),
          tokensIn: startedAttempts === 0 || tokensInUnknown ? null : sumTokensIn,
          tokensOut: startedAttempts === 0 || tokensOutUnknown ? null : sumTokensOut,
          retryable: false,
          diagnostics: runDiagnostics,
        });

        return {
          extraction: merged.extraction,
          mergeConflicts: merged.conflicts,
          receipt: okReceipt,
        };
      } finally {
        clock.clearTimeout(timerHandle);
      }
    },
  });

  // --------------------------------------------------------------------------
  // Post-getOrExtract: Handle cache hit, Row 5, Row 19, Row 20, and Coverage (Row 21)
  // --------------------------------------------------------------------------
  let finalReceipt = cacheResult.receipt;
  let finalExtraction: Extraction | null = cacheResult.status === "ok" ? cacheResult.extraction : null;
  let finalConflicts: readonly ExtractionMergeConflict[] =
    cacheResult.status === "ok" ? cacheResult.mergeConflicts : [];
  let finalExitCode: 0 | 64 | 65 | 75 = 0;
  let endedInRow24 = false;
  let heldRow24Transition: DeferredRow24Transition | null = null;

  // Case 1: Cache Hit (Row 10)
  if (cacheResult.status === "ok" && cacheResult.cacheWrite === "hit") {
    finalExitCode = 0;
    const hitExtraDiags: string[] = [...policyDiagnostics];
    const storedSf = finalExtraction ? findStoredSourceFile(finalExtraction) : null;
    if (storedSf !== null && storedSf !== sourceFile) {
      hitExtraDiags.push(`source_file_differs_from_cached:${storedSf}`);
    }
    if (validCoverage && coverageKey) {
      const covDiags = await applyPreGateCoverageTransition({
        coverage: validCoverage,
        coverageKey,
        extractionKey,
        nowIso: clock.nowIso(),
        outcome: { kind: "ok" },
      });
      hitExtraDiags.push(...covDiags);
    }
    finalReceipt = withReceiptDiagnostics(finalReceipt, hitExtraDiags);
  }
  // Case 2: Row 5 (`cache_unavailable`) -> no coverage transition, no coverage read (R3-m11)
  else if (
    cacheResult.status === "refused" &&
    cacheResult.refusalCode === "cache_unavailable" &&
    produceEndedRow === null
  ) {
    finalExitCode = 75;
    finalReceipt = withReceiptDiagnostics(finalReceipt, policyDiagnostics);
  }
  // Case 3: Row 6 (`too-large`) -> pre-gate coverage read & transition
  else if (produceEndedRow === 6) {
    finalExitCode = 0;
    if (validCoverage && coverageKey) {
      const covDiags = await applyPreGateCoverageTransition({
        coverage: validCoverage,
        coverageKey,
        extractionKey,
        nowIso: clock.nowIso(),
        outcome: {
          kind: "failed",
          status: "too-large",
          refusalCode: "document_too_large",
          retryable: false,
          reason: finalReceipt.refusalReason ?? "document_too_large",
        },
      });
      finalReceipt = withReceiptDiagnostics(finalReceipt, covDiags);
    }
  }
  // Case 4: Rows 7 (`coverage_unavailable`), 8 (`abandoned`), 11 (`unsupported_client`), 23 (`client_configuration_error`) -> no coverage transition
  else if (
    produceEndedRow === 7 ||
    produceEndedRow === 8 ||
    produceEndedRow === 11 ||
    produceEndedRow === 23
  ) {
    finalExitCode = produceSuggestedExit;
  }
  // Case 5: Row 19 (`invalid_extraction_payload` when `produce` succeeded at Row 22 but `getOrExtract` failed projection)
  else if (
    produceEndedRow === 22 &&
    cacheResult.status === "refused" &&
    cacheResult.refusalCode === "invalid_extraction_payload"
  ) {
    finalExitCode = 0;
    const extraDiags: string[] = [];
    if (gateHadInvalidRecordDiag) {
      extraDiags.push("coverage_record_invalid");
    }
    if (validCoverage && coverageKey) {
      const nextRecord = transitionCoverageRecord({
        current: gateProceedRecord,
        key: coverageKey,
        extractionKey,
        outcome: {
          kind: "failed",
          status: "refused",
          refusalCode: "invalid_extraction_payload",
          retryable: false,
          reason: finalReceipt.refusalReason ?? "invalid_extraction_payload",
        },
        maxFailures: validCoverage.maxFailures,
        maxRetryableFailures: validCoverage.maxRetryableFailures,
        nowIso: clock.nowIso(),
      });
      try {
        await validCoverage.port.put(nextRecord);
      } catch {
        extraDiags.push("coverage_write_failed");
      }
    }
    finalReceipt = withReceiptDiagnostics(finalReceipt, extraDiags);
  }
  // Case 6: Row 20 / Row 22 (Fresh `ok`)
  else if (cacheResult.status === "ok") {
    finalExitCode = 0;
    const extraDiags: string[] = [];
    if (gateHadInvalidRecordDiag) {
      extraDiags.push("coverage_record_invalid");
    }
    if (validCoverage && coverageKey) {
      const nextRecord = transitionCoverageRecord({
        current: gateProceedRecord,
        key: coverageKey,
        extractionKey,
        outcome: { kind: "ok" },
        maxFailures: validCoverage.maxFailures,
        maxRetryableFailures: validCoverage.maxRetryableFailures,
        nowIso: clock.nowIso(),
      });
      try {
        await validCoverage.port.put(nextRecord);
      } catch {
        extraDiags.push("coverage_write_failed");
      }
    }
    finalReceipt = withReceiptDiagnostics(finalReceipt, extraDiags);
  }
  // Case 7: Rows 12, 13, 14, 15, 16, 17, 18, 24 (Post-gate failure transitions)
  else {
    finalExitCode = produceSuggestedExit;
    endedInRow24 = produceEndedRow === 24;

    if (validCoverage && coverageKey) {
      const nextRecord = transitionCoverageRecord({
        current: gateProceedRecord,
        key: coverageKey,
        extractionKey,
        outcome: {
          kind: "failed",
          status: finalReceipt.status === "timeout" ? "timeout" : "refused",
          refusalCode: finalReceipt.refusalCode ?? "upstream_error",
          retryable: finalReceipt.retryable,
          ...(finalReceipt.refusalReason !== undefined
            ? { reason: finalReceipt.refusalReason }
            : {}),
        },
        maxFailures: validCoverage.maxFailures,
        maxRetryableFailures: validCoverage.maxRetryableFailures,
        nowIso: clock.nowIso(),
      });

      if (endedInRow24 && batchCtx.deferRow24Transitions) {
        heldRow24Transition = {
          port: validCoverage.port,
          record: nextRecord,
        };
      } else {
        try {
          await validCoverage.port.put(nextRecord);
        } catch {
          finalReceipt = withReceiptDiagnostics(finalReceipt, ["coverage_write_failed"]);
        }
      }
    }
  }

  const frozenResult: HeadlessExtractResult = Object.freeze({
    extraction: finalExtraction,
    receipt: deepFreeze(finalReceipt),
    mergeConflicts: deepFreeze(finalConflicts),
    suggestedExitCode: finalExitCode,
  });

  return {
    result: frozenResult,
    endedInRow24,
    row24Reason: endedInRow24 ? row24ReasonCaptured : null,
    heldRow24Transition,
  };
}

export async function extractDocumentBatch(
  input: HeadlessExtractInput,
): Promise<HeadlessExtractResult> {
  const outcome = await extractDocumentBatchInternal(input, {
    deferRow24Transitions: false,
  });
  return outcome.result;
}

// ============================================================================
// §3(b) & §3(c).2 Batch Orchestration (`runHeadlessExtractionBatch`)
// ============================================================================

export async function runHeadlessExtractionBatch(
  inputs: readonly HeadlessExtractInput[],
  options?: { readonly concurrency?: number },
): Promise<HeadlessBatchResult> {
  const items = Array.isArray(inputs) ? inputs : [];
  if (items.length === 0) {
    return Object.freeze({
      results: Object.freeze([]),
      summary: Object.freeze({
        total: 0,
        ok: 0,
        okFromCache: 0,
        refused: 0,
        timeout: 0,
        tooLarge: 0,
        abandoned: 0,
        tokensIn: 0,
        tokensOut: 0,
        tokensUnknownCount: 0,
      }),
      suggestedExitCode: 0,
    });
  }

  const rawConcurrency = options && typeof options === "object" ? options.concurrency : undefined;
  const concurrency =
    typeof rawConcurrency === "number" && Number.isFinite(rawConcurrency) && rawConcurrency >= 1
      ? Math.floor(rawConcurrency)
      : 1;

  const outcomes = new Array<InternalExtractDocumentOutcome>(items.length);
  let nextIndex = 0;

  const workerCount = Math.min(concurrency, items.length);
  const workers: Promise<void>[] = [];
  for (let w = 0; w < workerCount; w++) {
    workers.push(
      (async () => {
        while (true) {
          const idx = nextIndex++;
          if (idx >= items.length) break;
          outcomes[idx] = await extractDocumentBatchInternal(items[idx]!, {
            deferRow24Transitions: true,
          });
        }
      })(),
    );
  }

  await Promise.all(workers);

  // §3(c).2 Batch row-24 guard (Owner Option O-1, Option C)
  const nonCachedOutcomes = outcomes.filter((o) => !o.result.receipt.fromCache);
  let row24GuardFires = false;
  if (
    nonCachedOutcomes.length >= 2 &&
    nonCachedOutcomes.every((o) => o.endedInRow24 && o.row24Reason !== null)
  ) {
    const firstReason = nonCachedOutcomes[0]!.row24Reason!;
    row24GuardFires = nonCachedOutcomes.every(
      (o) =>
        o.row24Reason!.refusalCode === firstReason.refusalCode &&
        o.row24Reason!.diagnostic === firstReason.diagnostic,
    );
  }

  // If the guard does NOT fire, flush all held row-24 coverage transitions in input order
  const finalResults: HeadlessExtractResult[] = [];
  for (let i = 0; i < outcomes.length; i++) {
    const o = outcomes[i]!;
    let res = o.result;
    if (!row24GuardFires && o.heldRow24Transition !== null) {
      try {
        await o.heldRow24Transition.port.put(o.heldRow24Transition.record);
      } catch {
        const updatedReceipt = withReceiptDiagnostics(res.receipt, ["coverage_write_failed"]);
        res = Object.freeze({
          extraction: res.extraction,
          receipt: updatedReceipt,
          mergeConflicts: res.mergeConflicts,
          suggestedExitCode: res.suggestedExitCode,
        });
      }
    }
    finalResults.push(res);
  }

  // Compute summary & batch suggestedExitCode (§3(c).2, §3(d).5)
  let ok = 0;
  let okFromCache = 0;
  let refused = 0;
  let timeout = 0;
  let tooLarge = 0;
  let abandoned = 0;
  let sumTokensIn = 0;
  let sumTokensOut = 0;
  let numericTokensInCount = 0;
  let numericTokensOutCount = 0;
  let tokensUnknownCount = 0;

  for (const r of finalResults) {
    const rec = r.receipt;
    switch (rec.status) {
      case "ok":
        ok++;
        if (rec.fromCache) okFromCache++;
        break;
      case "refused":
        refused++;
        break;
      case "timeout":
        timeout++;
        break;
      case "too-large":
        tooLarge++;
        break;
      case "abandoned":
        abandoned++;
        break;
    }

    const hasIn = typeof rec.tokensIn === "number" && Number.isFinite(rec.tokensIn);
    const hasOut = typeof rec.tokensOut === "number" && Number.isFinite(rec.tokensOut);
    if (hasIn) {
      sumTokensIn += rec.tokensIn!;
      numericTokensInCount++;
    }
    if (hasOut) {
      sumTokensOut += rec.tokensOut!;
      numericTokensOutCount++;
    }
    if (!hasIn || !hasOut) {
      tokensUnknownCount++;
    }
  }

  let batchExitCode: 0 | 64 | 65 | 75 = 0;
  if (row24GuardFires) {
    batchExitCode = 64;
  } else if (
    finalResults.some((r) => r.suggestedExitCode === 75 && r.receipt.status !== "abandoned")
  ) {
    batchExitCode = 75;
  } else if (finalResults.some((r) => r.suggestedExitCode === 64)) {
    batchExitCode = 64;
  } else if (
    finalResults.some(
      (r) => r.suggestedExitCode === 65 && r.receipt.refusalCode === "invalid_identity",
    )
  ) {
    batchExitCode = 65;
  } else {
    batchExitCode = 0;
  }

  return Object.freeze({
    results: Object.freeze(finalResults),
    summary: Object.freeze({
      total: finalResults.length,
      ok,
      okFromCache,
      refused,
      timeout,
      tooLarge,
      abandoned,
      tokensIn: numericTokensInCount > 0 ? sumTokensIn : null,
      tokensOut: numericTokensOutCount > 0 ? sumTokensOut : null,
      tokensUnknownCount,
    }),
    suggestedExitCode: batchExitCode,
  });
}
