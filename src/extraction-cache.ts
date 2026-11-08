import type { ExtractionMergeConflict } from "./extract-git.js";
import { JSON_PROJECTION_VERSION, type JsonValue, toJsonValue } from "./json-value.js";
import { canonicalBytes, digestOfPreimage } from "./ontology-guardian/canonical.js";
import { type Digest, isDigest } from "./ontology-guardian/types.js";
import type { Extraction } from "./types.js";

/** 64-char lowercase hex SHA-256 extraction key. Same alias as Digest. */
export type ExtractionKey = Digest;

export const EXTRACTION_KEY_SCHEMA_V1 = "engram.extraction-key/v1" as const;

/**
 * Cache-entry schema. `/v2` is the first shipped value: the `/v1`
 * shape existed only in round 3 of this specification and never shipped
 * (§8 row 97). The bump records the R3-M5 shape change (stored
 * `mergeConflicts`); because the constant is bound in the key preimage
 * (§1(d).1), any future entry-shape change must bump it and thereby
 * changes every key by construction.
 */
export const EXTRACTION_CACHE_ENTRY_SCHEMA_V2 = "engram.extraction-cache-entry/v2" as const;

/**
 * Engram-owned semantics version. Bump when any of: prompt template
 * (profile-prompts), the extraction schema string printed into every model
 * prompt (EXTRACTION_SCHEMA_V1, §3(b)), page rendering (§3(d)), chunk
 * packing/splitting (§3(d)), or chunk validation (§3(d)) changes in a way
 * that changes model calls or accepted outputs. The cache-entry schema and
 * the §0.2 projection version are NOT in this bump list: both are bound
 * directly in the key preimage below, so changing either constant changes
 * every key by construction. This is the default for engramVersion (§1(d)).
 */
export const EXTRACTION_SEMANTICS_VERSION = "engram-extraction-semantics/1" as const;

const COVERAGE_RECORD_SCHEMA_V1 = "engram.coverage-record/v1" as const;

export interface ExtractionIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface ExtractionModelPolicyV1 {
  readonly provider: string;
  readonly model: string;
  readonly temperature: number | null;
  readonly maxOutputTokens: number | null;
  readonly verifierModel?: string | null;
}

export interface ExtractionChunkingV1 {
  readonly maxChunkChars: number;
  readonly splitter: "v1";
}

export interface ExtractionPromptIdentityV1 {
  readonly registries: Readonly<Record<string, string>>;
  readonly maxRegistrySamplesPerRegistry?: number;
}

export interface ExtractionIdentityInput {
  readonly docSha: string;
  readonly profileDigest: string;
  readonly promptVersion: string;
  readonly engramVersion?: string;
  readonly modelPolicy: ExtractionModelPolicyV1;
  readonly chunking: ExtractionChunkingV1;
  readonly prompt?: ExtractionPromptIdentityV1;
}

export interface NormalizedExtractionIdentityV1 {
  readonly schema: typeof EXTRACTION_KEY_SCHEMA_V1;
  readonly entrySchema: typeof EXTRACTION_CACHE_ENTRY_SCHEMA_V2;
  readonly projectionVersion: typeof JSON_PROJECTION_VERSION;
  readonly docSha: Digest;
  readonly profileDigest: Digest;
  readonly promptVersion: string;
  readonly engramVersion: string;
  readonly semanticsVersion: typeof EXTRACTION_SEMANTICS_VERSION;
  readonly modelPolicy: {
    readonly provider: string;
    readonly model: string;
    readonly temperature: number | null;
    readonly maxOutputTokens: number | null;
    readonly verifierModel: string | null;
  };
  readonly chunking: { readonly maxChunkChars: number; readonly splitter: "v1" };
  readonly prompt: {
    readonly registries: Readonly<Record<string, Digest | "absent">>;
    readonly maxRegistrySamplesPerRegistry: number;
  };
}

export type NormalizeExtractionIdentityResult =
  | { readonly ok: true; readonly identity: NormalizedExtractionIdentityV1 }
  | { readonly ok: false; readonly issues: readonly ExtractionIssue[] };

export type ComputeExtractionKeyResult =
  | { readonly ok: true; readonly key: ExtractionKey; readonly identity: NormalizedExtractionIdentityV1 }
  | { readonly ok: false; readonly issues: readonly ExtractionIssue[] };

export type ExtractionTerminalStatus =
  | "ok"
  | "refused"
  | "timeout"
  | "too-large"
  | "abandoned";

export type ExtractionRefusalCode =
  | "provider_content_filter"
  | "empty_completion"
  | "invalid_json_output"
  | "schema_validation_failed"
  | "profile_validation_failed"
  | "rate_limited"
  | "upstream_error"
  | "document_too_large"
  | "deadline_exceeded"
  | "coverage_abandoned"
  | "invalid_identity"
  | "invalid_bounds"
  | "invalid_document_input"
  | "invalid_extraction_payload"
  | "unsupported_client"
  | "client_configuration_error"
  | "cache_unavailable"
  | "coverage_unavailable";

export interface ExtractionReceiptV1 {
  readonly extractionKey: ExtractionKey | null;
  readonly docSha: string;
  readonly profileDigest: string;
  readonly promptVersion: string;
  readonly engramVersion: string;
  readonly status: ExtractionTerminalStatus;
  readonly fromCache: boolean;
  readonly attempts: number;
  readonly model: string | null;
  readonly provider: string | null;
  readonly modelSource: "response" | "client" | "unknown";
  readonly latencyMs: number;
  readonly tokensIn: number | null;
  readonly tokensOut: number | null;
  readonly retryable: boolean;
  readonly refusalCode?: ExtractionRefusalCode;
  readonly refusalReason?: string;
  readonly diagnostics: readonly string[];
}

export interface CachedExtractionEntryV2 {
  readonly schema: typeof EXTRACTION_CACHE_ENTRY_SCHEMA_V2;
  readonly extractionKey: ExtractionKey;
  readonly identity: NormalizedExtractionIdentityV1;
  readonly payloadDigest: Digest;
  readonly extraction: Extraction;
  readonly mergeConflicts: readonly ExtractionMergeConflict[];
  readonly receipt: ExtractionReceiptV1;
  readonly createdAt: string;
}

export interface ExtractionCachePort {
  get(key: ExtractionKey): Promise<unknown> | unknown;
  putIfAbsent(
    key: ExtractionKey,
    entry: CachedExtractionEntryV2,
  ): Promise<"stored" | "exists"> | "stored" | "exists";
  replaceInvalid?(
    key: ExtractionKey,
    entry: CachedExtractionEntryV2,
    observed: unknown,
  ): Promise<"stored" | "exists"> | "stored" | "exists";
}

export type ExtractionCacheLookupResult =
  | { readonly status: "hit"; readonly extractionKey: ExtractionKey; readonly entry: CachedExtractionEntryV2 }
  | {
      readonly status: "miss";
      readonly extractionKey: ExtractionKey;
      readonly reason: "not_found" | "identity_mismatch" | "digest_mismatch" | "invalid_entry";
      readonly diagnostic?: string;
      readonly observed?: unknown;
    }
  | { readonly status: "invalid_identity"; readonly issues: readonly ExtractionIssue[] }
  | { readonly status: "cache_unavailable"; readonly extractionKey: ExtractionKey; readonly diagnostic: string };

export type CreateCachedExtractionEntryResult =
  | { readonly ok: true; readonly entry: CachedExtractionEntryV2 }
  | {
      readonly ok: false;
      readonly refusalCode: "invalid_identity" | "invalid_extraction_payload";
      readonly issues: readonly ExtractionIssue[];
      readonly diagnostic?: string;
    };

export type CoverageStatus = "pending" | "covered" | "abandoned";

export interface CoverageKey {
  readonly city: string;
  readonly docSha: Digest;
  readonly profileDigest: Digest;
}

export interface CoverageRecordV1 {
  readonly schema: "engram.coverage-record/v1";
  readonly key: CoverageKey;
  readonly status: CoverageStatus;
  readonly extractionKey: ExtractionKey | null;
  readonly failureCount: number;
  readonly retryableFailureCount: number;
  readonly totalFailureCount: number;
  readonly maxFailures: number;
  readonly maxRetryableFailures: number;
  readonly lastStatus: ExtractionTerminalStatus | null;
  readonly lastRefusalCode: ExtractionRefusalCode | null;
  readonly lastReason: string | null;
  readonly updatedAt: string;
}

export interface CoverageRegistryPort {
  get(key: CoverageKey): Promise<unknown> | unknown;
  put(record: CoverageRecordV1): Promise<void> | void;
}

export interface CoverageTransitionInput {
  readonly current: CoverageRecordV1 | null;
  readonly key: CoverageKey;
  readonly extractionKey: ExtractionKey;
  readonly outcome:
    | { readonly kind: "ok" }
    | {
        readonly kind: "failed";
        readonly status: Exclude<ExtractionTerminalStatus, "ok" | "abandoned">;
        readonly refusalCode: ExtractionRefusalCode;
        readonly retryable: boolean;
        readonly reason?: string;
      }
    | { readonly kind: "reset"; readonly reason?: string };
  readonly maxFailures?: number;
  readonly maxRetryableFailures?: number;
  readonly nowIso: string;
}

export type CoverageGateResult =
  | { readonly action: "skip_covered"; readonly record: CoverageRecordV1 }
  | { readonly action: "skip_abandoned"; readonly record: CoverageRecordV1 }
  | {
      readonly action: "proceed";
      readonly record: CoverageRecordV1 | null;
      readonly diagnostic?: string;
    }
  | { readonly action: "unavailable"; readonly diagnostic: string };

export interface ProducedExtraction {
  readonly extraction: Extraction;
  readonly mergeConflicts?: readonly ExtractionMergeConflict[];
  readonly receipt: ExtractionReceiptV1;
}

export interface RefusedProduction {
  readonly refused: ExtractionReceiptV1;
}

export type GetOrExtractResult =
  | {
      readonly status: "ok";
      readonly extraction: Extraction;
      readonly mergeConflicts: readonly ExtractionMergeConflict[];
      readonly receipt: ExtractionReceiptV1;
      readonly cacheWrite: "stored" | "exists" | "hit" | "repaired" | "write_failed" | "not_attempted";
    }
  | {
      readonly status: "refused";
      readonly refusalCode: ExtractionRefusalCode;
      readonly receipt: ExtractionReceiptV1;
      readonly cacheWrite: "not_attempted";
    };

const VALID_TERMINAL_STATUSES = new Set<string>([
  "ok",
  "refused",
  "timeout",
  "too-large",
  "abandoned",
]);

const VALID_REFUSAL_CODES = new Set<string>([
  "provider_content_filter",
  "empty_completion",
  "invalid_json_output",
  "schema_validation_failed",
  "profile_validation_failed",
  "rate_limited",
  "upstream_error",
  "document_too_large",
  "deadline_exceeded",
  "coverage_abandoned",
  "invalid_identity",
  "invalid_bounds",
  "invalid_document_input",
  "invalid_extraction_payload",
  "unsupported_client",
  "client_configuration_error",
  "cache_unavailable",
  "coverage_unavailable",
]);

const VALID_COVERAGE_STATUSES = new Set<string>(["pending", "covered", "abandoned"]);
const VALID_MODEL_SOURCES = new Set<string>(["response", "client", "unknown"]);

function isWellFormedUnicode(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const unit = s.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = i + 1 < s.length ? s.charCodeAt(i + 1) : -1;
      if (next < 0xdc00 || next > 0xdfff) return false;
      i++;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function getOwnDataProp(obj: unknown, key: string): { present: boolean; validDescriptor: boolean; value: unknown } {
  if (typeof obj !== "object" || obj === null) {
    return { present: false, validDescriptor: false, value: undefined };
  }
  try {
    const desc = Object.getOwnPropertyDescriptor(obj, key);
    if (!desc) {
      return { present: false, validDescriptor: true, value: undefined };
    }
    if (!desc.enumerable || !("value" in desc)) {
      return { present: true, validDescriptor: false, value: undefined };
    }
    return { present: true, validDescriptor: true, value: desc.value };
  } catch {
    return { present: true, validDescriptor: false, value: undefined };
  }
}

function readOwnProp(obj: unknown, key: string): unknown {
  const prop = getOwnDataProp(obj, key);
  return prop.validDescriptor ? prop.value : undefined;
}

function defineOwnProp<T extends object>(target: T, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

function cloneJsonValue<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (let i = 0; i < value.length; i++) {
      const desc = Object.getOwnPropertyDescriptor(value, i);
      out.push(desc && "value" in desc ? cloneJsonValue(desc.value) : undefined);
    }
    return out as unknown as T;
  }
  const out: Record<string, unknown> = {};
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Object.getOwnPropertyNames(descriptors)) {
    const desc = descriptors[key];
    if (desc && desc.enumerable && "value" in desc) {
      defineOwnProp(out, key, cloneJsonValue(desc.value));
    }
  }
  return out as unknown as T;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const desc = Object.getOwnPropertyDescriptor(value, i);
      if (desc && "value" in desc) {
        deepFreeze(desc.value);
      }
    }
    return Object.freeze(value);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Object.getOwnPropertyNames(descriptors)) {
    const desc = descriptors[key];
    if (desc && "value" in desc) {
      deepFreeze(desc.value);
    }
  }
  return Object.freeze(value);
}

function errorMessage(err: unknown): string {
  if (err instanceof Error && typeof err.message === "string" && err.message.length > 0) {
    return isWellFormedUnicode(err.message) ? err.message : "unserializable_error_message";
  }
  try {
    const str = String(err);
    return str.length > 0 && isWellFormedUnicode(str) ? str : "unknown_error";
  } catch {
    return "unknown_error";
  }
}

function measureLatency(nowMs: number, endMs: () => number): number {
  try {
    const delta = endMs() - nowMs;
    return Number.isFinite(delta) ? delta : 0;
  } catch {
    // ignore clock errors and report 0
    return 0;
  }
}

function computePayloadDigest(projectedExtraction: JsonValue, projectedConflicts: JsonValue): Digest {
  const preimage: Record<string, JsonValue> = {};
  defineOwnProp(preimage, "extraction", projectedExtraction);
  defineOwnProp(preimage, "mergeConflicts", projectedConflicts);
  return digestOfPreimage(preimage);
}

/**
 * Deterministic normalization of `ExtractionIdentityInput` (§1(d).1).
 * Collects all issues in the normative field order and never throws.
 */
export function normalizeExtractionIdentity(
  input: ExtractionIdentityInput,
): NormalizeExtractionIdentityResult {
  const issues: ExtractionIssue[] = [];
  const rootOk = isPlainObject(input);

  // 1. docSha
  let docSha = "";
  const docShaProp = rootOk ? getOwnDataProp(input, "docSha") : { present: false, validDescriptor: false, value: undefined };
  if (docShaProp.validDescriptor && typeof docShaProp.value === "string") {
    const lower = docShaProp.value.trim().toLowerCase();
    if (isDigest(lower)) {
      docSha = lower;
    } else {
      issues.push({
        code: "invalid_identity",
        path: "docSha",
        message: "docSha must be a 64-character hex SHA-256 digest",
      });
    }
  } else {
    issues.push({
      code: "invalid_identity",
      path: "docSha",
      message: "docSha must be a 64-character hex SHA-256 digest",
    });
  }

  // 2. profileDigest
  let profileDigest = "";
  const profileDigestProp = rootOk
    ? getOwnDataProp(input, "profileDigest")
    : { present: false, validDescriptor: false, value: undefined };
  if (profileDigestProp.validDescriptor && typeof profileDigestProp.value === "string") {
    const lower = profileDigestProp.value.trim().toLowerCase();
    if (isDigest(lower)) {
      profileDigest = lower;
    } else {
      issues.push({
        code: "invalid_identity",
        path: "profileDigest",
        message: "profileDigest must be a 64-character hex SHA-256 digest",
      });
    }
  } else {
    issues.push({
      code: "invalid_identity",
      path: "profileDigest",
      message: "profileDigest must be a 64-character hex SHA-256 digest",
    });
  }

  // 3. promptVersion
  let promptVersion = "";
  const promptVersionProp = rootOk
    ? getOwnDataProp(input, "promptVersion")
    : { present: false, validDescriptor: false, value: undefined };
  if (
    promptVersionProp.validDescriptor &&
    typeof promptVersionProp.value === "string" &&
    isWellFormedUnicode(promptVersionProp.value)
  ) {
    const norm = promptVersionProp.value.trim().normalize("NFC");
    if (norm.length > 0) {
      promptVersion = norm;
    } else {
      issues.push({
        code: "invalid_identity",
        path: "promptVersion",
        message: "promptVersion must be a non-empty string",
      });
    }
  } else {
    issues.push({
      code: "invalid_identity",
      path: "promptVersion",
      message: "promptVersion must be a non-empty well-formed string",
    });
  }

  // 4. engramVersion
  let engramVersion: string = EXTRACTION_SEMANTICS_VERSION;
  const engramVersionProp = rootOk
    ? getOwnDataProp(input, "engramVersion")
    : { present: false, validDescriptor: true, value: undefined };
  if (!engramVersionProp.validDescriptor) {
    issues.push({
      code: "invalid_identity",
      path: "engramVersion",
      message: "engramVersion must be a valid string when supplied",
    });
  } else if (engramVersionProp.present && engramVersionProp.value !== undefined) {
    if (typeof engramVersionProp.value === "string" && isWellFormedUnicode(engramVersionProp.value)) {
      const norm = engramVersionProp.value.trim().normalize("NFC");
      engramVersion = norm.length > 0 ? norm : EXTRACTION_SEMANTICS_VERSION;
    } else {
      issues.push({
        code: "invalid_identity",
        path: "engramVersion",
        message: "engramVersion must be a well-formed string when supplied",
      });
    }
  }

  // 5–9. modelPolicy
  const mpProp = rootOk ? getOwnDataProp(input, "modelPolicy") : { present: false, validDescriptor: false, value: undefined };
  const mpObj = mpProp.validDescriptor && isPlainObject(mpProp.value) ? mpProp.value : null;

  // 5. modelPolicy.provider
  let provider = "";
  const providerProp = mpObj ? getOwnDataProp(mpObj, "provider") : { present: false, validDescriptor: false, value: undefined };
  if (
    providerProp.validDescriptor &&
    typeof providerProp.value === "string" &&
    isWellFormedUnicode(providerProp.value)
  ) {
    const norm = providerProp.value.trim().toLowerCase();
    if (norm.length > 0) {
      provider = norm;
    } else {
      issues.push({
        code: "invalid_identity",
        path: "modelPolicy.provider",
        message: "modelPolicy.provider must be a non-empty string",
      });
    }
  } else {
    issues.push({
      code: "invalid_identity",
      path: "modelPolicy.provider",
      message: "modelPolicy.provider must be a non-empty well-formed string",
    });
  }

  // 6. modelPolicy.model
  let model = "";
  const modelProp = mpObj ? getOwnDataProp(mpObj, "model") : { present: false, validDescriptor: false, value: undefined };
  if (modelProp.validDescriptor && typeof modelProp.value === "string" && isWellFormedUnicode(modelProp.value)) {
    const norm = modelProp.value.trim();
    if (norm.length > 0) {
      model = norm;
    } else {
      issues.push({
        code: "invalid_identity",
        path: "modelPolicy.model",
        message: "modelPolicy.model must be a non-empty string",
      });
    }
  } else {
    issues.push({
      code: "invalid_identity",
      path: "modelPolicy.model",
      message: "modelPolicy.model must be a non-empty well-formed string",
    });
  }

  // 7. modelPolicy.temperature
  let temperature: number | null = null;
  const tempProp = mpObj ? getOwnDataProp(mpObj, "temperature") : { present: false, validDescriptor: false, value: undefined };
  if (!tempProp.present || !tempProp.validDescriptor) {
    issues.push({
      code: "invalid_identity",
      path: "modelPolicy.temperature",
      message: "modelPolicy.temperature must be a finite number or null",
    });
  } else if (tempProp.value === null) {
    temperature = null;
  } else if (typeof tempProp.value === "number" && Number.isFinite(tempProp.value)) {
    const quantized = Number(tempProp.value.toFixed(6));
    temperature = Object.is(quantized, -0) ? 0 : quantized;
  } else {
    issues.push({
      code: "invalid_identity",
      path: "modelPolicy.temperature",
      message: "modelPolicy.temperature must be a finite number or null",
    });
  }

  // 8. modelPolicy.maxOutputTokens
  let maxOutputTokens: number | null = null;
  const maxTokensProp = mpObj
    ? getOwnDataProp(mpObj, "maxOutputTokens")
    : { present: false, validDescriptor: false, value: undefined };
  if (!maxTokensProp.present || !maxTokensProp.validDescriptor) {
    issues.push({
      code: "invalid_identity",
      path: "modelPolicy.maxOutputTokens",
      message: "modelPolicy.maxOutputTokens must be a positive finite integer or null",
    });
  } else if (maxTokensProp.value === null) {
    maxOutputTokens = null;
  } else if (
    typeof maxTokensProp.value === "number" &&
    Number.isFinite(maxTokensProp.value) &&
    Number.isInteger(maxTokensProp.value) &&
    maxTokensProp.value >= 1
  ) {
    maxOutputTokens = maxTokensProp.value;
  } else {
    issues.push({
      code: "invalid_identity",
      path: "modelPolicy.maxOutputTokens",
      message: "modelPolicy.maxOutputTokens must be a positive finite integer or null",
    });
  }

  // 9. modelPolicy.verifierModel
  let verifierModel: string | null = null;
  if (mpObj) {
    const vmProp = getOwnDataProp(mpObj, "verifierModel");
    if (!vmProp.validDescriptor) {
      issues.push({
        code: "invalid_identity",
        path: "modelPolicy.verifierModel",
        message: "modelPolicy.verifierModel must be a string, null, or omitted",
      });
    } else if (!vmProp.present || vmProp.value === undefined || vmProp.value === null) {
      verifierModel = null;
    } else if (typeof vmProp.value === "string" && isWellFormedUnicode(vmProp.value)) {
      const trimmed = vmProp.value.trim();
      verifierModel = trimmed.length === 0 ? null : trimmed;
    } else {
      issues.push({
        code: "invalid_identity",
        path: "modelPolicy.verifierModel",
        message: "modelPolicy.verifierModel must be a well-formed string, null, or omitted",
      });
    }
  }

  // 10–11. chunking
  const chunkingProp = rootOk ? getOwnDataProp(input, "chunking") : { present: false, validDescriptor: false, value: undefined };
  const chunkingObj = chunkingProp.validDescriptor && isPlainObject(chunkingProp.value) ? chunkingProp.value : null;

  // 10. chunking.maxChunkChars
  let maxChunkChars = 0;
  const maxChunkProp = chunkingObj
    ? getOwnDataProp(chunkingObj, "maxChunkChars")
    : { present: false, validDescriptor: false, value: undefined };
  if (
    maxChunkProp.validDescriptor &&
    typeof maxChunkProp.value === "number" &&
    Number.isFinite(maxChunkProp.value) &&
    Number.isInteger(maxChunkProp.value) &&
    maxChunkProp.value >= 1
  ) {
    maxChunkChars = maxChunkProp.value;
  } else {
    issues.push({
      code: "invalid_identity",
      path: "chunking.maxChunkChars",
      message: "chunking.maxChunkChars must be a positive finite integer",
    });
  }

  // 11. chunking.splitter
  const splitterProp = chunkingObj
    ? getOwnDataProp(chunkingObj, "splitter")
    : { present: false, validDescriptor: false, value: undefined };
  if (!splitterProp.validDescriptor || splitterProp.value !== "v1") {
    issues.push({
      code: "invalid_identity",
      path: "chunking.splitter",
      message: 'chunking.splitter must be "v1"',
    });
  }

  // 12–13. prompt
  const normalizedRegistries: Record<string, Digest | "absent"> = {};
  let maxRegistrySamplesPerRegistry = 3;

  const promptProp = rootOk ? getOwnDataProp(input, "prompt") : { present: false, validDescriptor: true, value: undefined };
  if (!promptProp.validDescriptor) {
    issues.push({
      code: "invalid_identity",
      path: "prompt.registries",
      message: "prompt must be a plain object when supplied",
    });
  } else if (promptProp.present && promptProp.value !== undefined) {
    if (!isPlainObject(promptProp.value)) {
      issues.push({
        code: "invalid_identity",
        path: "prompt.registries",
        message: "prompt must be a plain object when supplied",
      });
    } else {
      const promptObj = promptProp.value;
      // 12. prompt.registries
      const regProp = getOwnDataProp(promptObj, "registries");
      if (!regProp.present || !regProp.validDescriptor || !isPlainObject(regProp.value)) {
        issues.push({
          code: "invalid_identity",
          path: "prompt.registries",
          message: "prompt.registries must be a plain object",
        });
      } else {
        const regObj = regProp.value;
        if (Object.getOwnPropertySymbols(regObj).length > 0) {
          issues.push({
            code: "invalid_identity",
            path: "prompt.registries",
            message: "prompt.registries must not contain symbol keys",
          });
        }
        const regDescriptors = Object.getOwnPropertyDescriptors(regObj);
        const regKeys = Object.getOwnPropertyNames(regDescriptors).sort();
        for (const regId of regKeys) {
          const desc = regDescriptors[regId]!;
          if (!desc.enumerable || !("value" in desc)) {
            issues.push({
              code: "invalid_identity",
              path: "prompt.registries",
              message: "prompt.registries properties must be enumerable data properties",
            });
            continue;
          }
          if (regId.trim().length === 0 || !isWellFormedUnicode(regId)) {
            issues.push({
              code: "invalid_identity",
              path: "prompt.registries",
              message: "prompt.registries keys must be non-empty well-formed strings",
            });
            continue;
          }
          const val = desc.value;
          if (val === "absent") {
            defineOwnProp(normalizedRegistries, regId, "absent");
          } else if (typeof val === "string") {
            const lower = val.trim().toLowerCase();
            if (isDigest(lower)) {
              defineOwnProp(normalizedRegistries, regId, lower);
            } else {
              issues.push({
                code: "invalid_identity",
                path: `prompt.registries.${regId}`,
                message: `prompt.registries.${regId} must be a 64-hex digest or "absent"`,
              });
            }
          } else {
            issues.push({
              code: "invalid_identity",
              path: `prompt.registries.${regId}`,
              message: `prompt.registries.${regId} must be a 64-hex digest or "absent"`,
            });
          }
        }
      }

      // 13. prompt.maxRegistrySamplesPerRegistry
      const samplesProp = getOwnDataProp(promptObj, "maxRegistrySamplesPerRegistry");
      if (!samplesProp.validDescriptor) {
        issues.push({
          code: "invalid_identity",
          path: "prompt.maxRegistrySamplesPerRegistry",
          message: "prompt.maxRegistrySamplesPerRegistry must be a non-negative finite integer",
        });
      } else if (samplesProp.present && samplesProp.value !== undefined) {
        if (
          typeof samplesProp.value === "number" &&
          Number.isFinite(samplesProp.value) &&
          Number.isInteger(samplesProp.value) &&
          samplesProp.value >= 0
        ) {
          maxRegistrySamplesPerRegistry = Object.is(samplesProp.value, -0) ? 0 : samplesProp.value;
        } else {
          issues.push({
            code: "invalid_identity",
            path: "prompt.maxRegistrySamplesPerRegistry",
            message: "prompt.maxRegistrySamplesPerRegistry must be a non-negative finite integer",
          });
        }
      }
    }
  }

  if (issues.length > 0) {
    return deepFreeze({ ok: false, issues });
  }

  const normalized: NormalizedExtractionIdentityV1 = {
    schema: EXTRACTION_KEY_SCHEMA_V1,
    entrySchema: EXTRACTION_CACHE_ENTRY_SCHEMA_V2,
    projectionVersion: JSON_PROJECTION_VERSION,
    docSha,
    profileDigest,
    promptVersion,
    engramVersion,
    semanticsVersion: EXTRACTION_SEMANTICS_VERSION,
    modelPolicy: {
      provider,
      model,
      temperature,
      maxOutputTokens,
      verifierModel,
    },
    chunking: {
      maxChunkChars,
      splitter: "v1",
    },
    prompt: {
      registries: normalizedRegistries,
      maxRegistrySamplesPerRegistry,
    },
  };

  return deepFreeze({ ok: true, identity: normalized });
}

/**
 * Computes the canonical SHA-256 extraction key over the normalized identity (§1(d).2).
 * Never throws.
 */
export function computeExtractionKey(
  input: ExtractionIdentityInput,
): ComputeExtractionKeyResult {
  const norm = normalizeExtractionIdentity(input);
  if (!norm.ok) {
    return norm;
  }
  const key = digestOfPreimage(norm.identity);
  return deepFreeze({
    ok: true,
    key,
    identity: norm.identity,
  });
}

function isValidReceiptForEntry(receipt: unknown, expectedKey: ExtractionKey): receipt is ExtractionReceiptV1 {
  if (!isPlainObject(receipt)) return false;
  const statusProp = getOwnDataProp(receipt, "status");
  if (!statusProp.validDescriptor || statusProp.value !== "ok") return false;
  const keyProp = getOwnDataProp(receipt, "extractionKey");
  if (!keyProp.validDescriptor || keyProp.value !== expectedKey) return false;
  const modelProp = getOwnDataProp(receipt, "model");
  if (
    !modelProp.validDescriptor ||
    (modelProp.value !== null && (typeof modelProp.value !== "string" || !isWellFormedUnicode(modelProp.value)))
  ) {
    return false;
  }
  const providerProp = getOwnDataProp(receipt, "provider");
  if (
    !providerProp.validDescriptor ||
    (providerProp.value !== null && (typeof providerProp.value !== "string" || !isWellFormedUnicode(providerProp.value)))
  ) {
    return false;
  }
  const sourceProp = getOwnDataProp(receipt, "modelSource");
  if (!sourceProp.validDescriptor || typeof sourceProp.value !== "string" || !VALID_MODEL_SOURCES.has(sourceProp.value)) {
    return false;
  }
  return true;
}

/**
 * Validates and constructs a deep-frozen `CachedExtractionEntryV2` (§1(c).4).
 * Never throws and never freezes caller-owned input objects.
 */
export function createCachedExtractionEntry(input: {
  readonly identity: ExtractionIdentityInput;
  readonly extraction: Extraction;
  readonly mergeConflicts?: readonly ExtractionMergeConflict[];
  readonly receipt: ExtractionReceiptV1;
  readonly createdAt: string;
}): CreateCachedExtractionEntryResult {
  if (!isPlainObject(input)) {
    return deepFreeze({
      ok: false,
      refusalCode: "invalid_extraction_payload",
      issues: [
        {
          code: "invalid_extraction_payload",
          path: "input",
          message: "input must be a plain object",
        },
      ],
      diagnostic: "input",
    });
  }

  const identityProp = getOwnDataProp(input, "identity");
  const keyRes = computeExtractionKey(identityProp.value as ExtractionIdentityInput);
  if (!keyRes.ok) {
    return deepFreeze({
      ok: false,
      refusalCode: "invalid_identity",
      issues: keyRes.issues,
      diagnostic: keyRes.issues[0]?.path ?? "identity",
    });
  }

  const receiptProp = getOwnDataProp(input, "receipt");
  if (!receiptProp.validDescriptor || !isValidReceiptForEntry(receiptProp.value, keyRes.key)) {
    const statusProp = isPlainObject(receiptProp.value) ? getOwnDataProp(receiptProp.value, "status") : null;
    const keyMatchProp = isPlainObject(receiptProp.value) ? getOwnDataProp(receiptProp.value, "extractionKey") : null;
    const path =
      statusProp && statusProp.value !== "ok"
        ? "receipt.status"
        : keyMatchProp && keyMatchProp.value !== keyRes.key
          ? "receipt.extractionKey"
          : "receipt";
    return deepFreeze({
      ok: false,
      refusalCode: "invalid_extraction_payload",
      issues: [
        {
          code: "invalid_extraction_payload",
          path,
          message: "receipt must have status 'ok', matching extractionKey, and valid model fields",
        },
      ],
      diagnostic: path,
    });
  }

  const receiptProj = toJsonValue(receiptProp.value);
  if (!receiptProj.ok || !isPlainObject(receiptProj.value)) {
    const failPath = !receiptProj.ok && receiptProj.path ? `receipt.${receiptProj.path}` : "receipt";
    return deepFreeze({
      ok: false,
      refusalCode: "invalid_extraction_payload",
      issues: [
        {
          code: !receiptProj.ok ? receiptProj.reason : "invalid_extraction_payload",
          path: failPath,
          message: "receipt failed JSON projection",
        },
      ],
      diagnostic: failPath,
    });
  }

  const createdAtProp = getOwnDataProp(input, "createdAt");
  if (
    !createdAtProp.validDescriptor ||
    typeof createdAtProp.value !== "string" ||
    !isWellFormedUnicode(createdAtProp.value)
  ) {
    return deepFreeze({
      ok: false,
      refusalCode: "invalid_extraction_payload",
      issues: [
        {
          code: "invalid_extraction_payload",
          path: "createdAt",
          message: "createdAt must be a well-formed string",
        },
      ],
      diagnostic: "createdAt",
    });
  }

  const extractionProp = getOwnDataProp(input, "extraction");
  if (!extractionProp.validDescriptor || !isPlainObject(extractionProp.value)) {
    return deepFreeze({
      ok: false,
      refusalCode: "invalid_extraction_payload",
      issues: [
        {
          code: "invalid_extraction_payload",
          path: "extraction",
          message: "extraction must be a plain object",
        },
      ],
      diagnostic: "extraction",
    });
  }

  const extProj = toJsonValue(extractionProp.value);
  if (!extProj.ok || !isPlainObject(extProj.value)) {
    const failPath = !extProj.ok && extProj.path ? extProj.path : "extraction";
    const reason = !extProj.ok ? extProj.reason : "invalid_extraction_payload";
    return deepFreeze({
      ok: false,
      refusalCode: "invalid_extraction_payload",
      issues: [
        {
          code: reason,
          path: failPath,
          message: `extraction failed JSON projection at ${failPath}: ${reason}`,
        },
      ],
      diagnostic: failPath,
    });
  }

  const conflictsProp = getOwnDataProp(input, "mergeConflicts");
  let rawConflicts: unknown = [];
  if (conflictsProp.present && conflictsProp.value !== undefined) {
    if (!conflictsProp.validDescriptor || !Array.isArray(conflictsProp.value)) {
      return deepFreeze({
        ok: false,
        refusalCode: "invalid_extraction_payload",
        issues: [
          {
            code: "invalid_extraction_payload",
            path: "mergeConflicts",
            message: "mergeConflicts must be an array when supplied",
          },
        ],
        diagnostic: "mergeConflicts",
      });
    }
    rawConflicts = conflictsProp.value;
  }

  const conflictsProj = toJsonValue(rawConflicts);
  if (!conflictsProj.ok || !Array.isArray(conflictsProj.value)) {
    const subPath = !conflictsProj.ok ? conflictsProj.path : "";
    const failPath = subPath
      ? `mergeConflicts${subPath.startsWith("[") ? "" : "."}${subPath}`
      : "mergeConflicts";
    const reason = !conflictsProj.ok ? conflictsProj.reason : "invalid_extraction_payload";
    return deepFreeze({
      ok: false,
      refusalCode: "invalid_extraction_payload",
      issues: [
        {
          code: reason,
          path: failPath,
          message: `mergeConflicts failed JSON projection at ${failPath}: ${reason}`,
        },
      ],
      diagnostic: failPath,
    });
  }

  const payloadDigest = computePayloadDigest(extProj.value, conflictsProj.value);
  const receiptCopy = cloneJsonValue(receiptProj.value) as unknown as ExtractionReceiptV1;
  defineOwnProp(receiptCopy as unknown as Record<string, unknown>, "fromCache", false);

  const entry: CachedExtractionEntryV2 = {
    schema: EXTRACTION_CACHE_ENTRY_SCHEMA_V2,
    extractionKey: keyRes.key,
    identity: cloneJsonValue(keyRes.identity),
    payloadDigest,
    extraction: cloneJsonValue(extProj.value) as unknown as Extraction,
    mergeConflicts: cloneJsonValue(conflictsProj.value) as unknown as readonly ExtractionMergeConflict[],
    receipt: receiptCopy,
    createdAt: createdAtProp.value,
  };

  return deepFreeze({ ok: true, entry });
}

async function lookupCachedExtractionResolved(
  cache: ExtractionCachePort,
  extractionKey: ExtractionKey,
  normalizedIdentity: NormalizedExtractionIdentityV1,
): Promise<ExtractionCacheLookupResult> {
  let raw: unknown;
  try {
    if (!cache || typeof cache.get !== "function") {
      return deepFreeze({
        status: "cache_unavailable",
        extractionKey,
        diagnostic: "cache_port_missing_get",
      });
    }
    raw = await cache.get(extractionKey);
  } catch (err) {
    return deepFreeze({
      status: "cache_unavailable",
      extractionKey,
      diagnostic: errorMessage(err),
    });
  }

  if (raw === null || raw === undefined) {
    return Object.freeze({
      status: "miss",
      extractionKey,
      reason: "not_found",
    });
  }

  // Step (i): plain object, schema, extractionKey, mergeConflicts array, well-shaped receipt
  if (!isPlainObject(raw)) {
    return Object.freeze({
      status: "miss",
      extractionKey,
      reason: "invalid_entry",
      diagnostic: "entry_not_plain_object",
      observed: raw,
    });
  }

  const schemaProp = getOwnDataProp(raw, "schema");
  const entryKeyProp = getOwnDataProp(raw, "extractionKey");
  const conflictsProp = getOwnDataProp(raw, "mergeConflicts");
  const receiptProp = getOwnDataProp(raw, "receipt");

  if (
    !schemaProp.validDescriptor ||
    schemaProp.value !== EXTRACTION_CACHE_ENTRY_SCHEMA_V2 ||
    !entryKeyProp.validDescriptor ||
    entryKeyProp.value !== extractionKey ||
    !conflictsProp.validDescriptor ||
    !Array.isArray(conflictsProp.value) ||
    !receiptProp.validDescriptor ||
    !isPlainObject(receiptProp.value)
  ) {
    return Object.freeze({
      status: "miss",
      extractionKey,
      reason: "invalid_entry",
      diagnostic: "entry_envelope_invalid",
      observed: raw,
    });
  }

  const rObj = receiptProp.value;
  const rModel = getOwnDataProp(rObj, "model");
  const rProvider = getOwnDataProp(rObj, "provider");
  const rSource = getOwnDataProp(rObj, "modelSource");
  if (
    !rModel.validDescriptor ||
    (rModel.value !== null && (typeof rModel.value !== "string" || !isWellFormedUnicode(rModel.value))) ||
    !rProvider.validDescriptor ||
    (rProvider.value !== null && (typeof rProvider.value !== "string" || !isWellFormedUnicode(rProvider.value))) ||
    !rSource.validDescriptor ||
    typeof rSource.value !== "string" ||
    !VALID_MODEL_SOURCES.has(rSource.value)
  ) {
    return Object.freeze({
      status: "miss",
      extractionKey,
      reason: "invalid_entry",
      diagnostic: "receipt_fields_invalid",
      observed: raw,
    });
  }

  // Step (ii): entry.identity component-wise equal to normalizeExtractionIdentity(identity) via canonicalBytes over §0.2 projection
  const identityProp = getOwnDataProp(raw, "identity");
  if (!identityProp.validDescriptor || !isPlainObject(identityProp.value)) {
    return Object.freeze({
      status: "miss",
      extractionKey,
      reason: "invalid_entry",
      diagnostic: "identity",
      observed: raw,
    });
  }
  const idProj = toJsonValue(identityProp.value);
  if (!idProj.ok) {
    return Object.freeze({
      status: "miss",
      extractionKey,
      reason: "invalid_entry",
      diagnostic: idProj.path ? `identity.${idProj.path}` : "identity",
      observed: raw,
    });
  }
  const storedIdBytes = canonicalBytes(idProj.value);
  const expectedIdBytes = canonicalBytes(normalizedIdentity);
  if (storedIdBytes !== expectedIdBytes) {
    return Object.freeze({
      status: "miss",
      extractionKey,
      reason: "identity_mismatch",
      diagnostic: "identity_mismatch",
      observed: raw,
    });
  }

  // Step (iii): payloadDigest === digestOfPreimage({extraction, mergeConflicts}) over §0.2 projections
  const extractionProp = getOwnDataProp(raw, "extraction");
  if (!extractionProp.validDescriptor || !isPlainObject(extractionProp.value)) {
    return Object.freeze({
      status: "miss",
      extractionKey,
      reason: "invalid_entry",
      diagnostic: "extraction",
      observed: raw,
    });
  }

  const extProj = toJsonValue(extractionProp.value);
  if (!extProj.ok || !isPlainObject(extProj.value)) {
    const diag = !extProj.ok ? extProj.path || "extraction" : "extraction";
    return Object.freeze({
      status: "miss",
      extractionKey,
      reason: "invalid_entry",
      diagnostic: diag,
      observed: raw,
    });
  }

  const confProj = toJsonValue(conflictsProp.value);
  if (!confProj.ok || !Array.isArray(confProj.value)) {
    const subPath = !confProj.ok ? confProj.path : "";
    const diag = subPath
      ? `mergeConflicts${subPath.startsWith("[") ? "" : "."}${subPath}`
      : "mergeConflicts";
    return Object.freeze({
      status: "miss",
      extractionKey,
      reason: "invalid_entry",
      diagnostic: diag,
      observed: raw,
    });
  }

  const payloadDigestProp = getOwnDataProp(raw, "payloadDigest");
  const computedPayloadDigest = computePayloadDigest(extProj.value, confProj.value);
  if (
    !payloadDigestProp.validDescriptor ||
    typeof payloadDigestProp.value !== "string" ||
    payloadDigestProp.value !== computedPayloadDigest
  ) {
    return Object.freeze({
      status: "miss",
      extractionKey,
      reason: "digest_mismatch",
      diagnostic: "payload_digest_mismatch",
      observed: raw,
    });
  }

  const rProj = toJsonValue(rObj);
  if (!rProj.ok || !isPlainObject(rProj.value)) {
    return Object.freeze({
      status: "miss",
      extractionKey,
      reason: "invalid_entry",
      diagnostic: !rProj.ok && rProj.path ? `receipt.${rProj.path}` : "receipt",
      observed: raw,
    });
  }

  const createdAtProp = getOwnDataProp(raw, "createdAt");
  if (
    !createdAtProp.validDescriptor ||
    typeof createdAtProp.value !== "string" ||
    !isWellFormedUnicode(createdAtProp.value)
  ) {
    return Object.freeze({
      status: "miss",
      extractionKey,
      reason: "invalid_entry",
      diagnostic: "createdAt",
      observed: raw,
    });
  }

  const validatedEntry: CachedExtractionEntryV2 = deepFreeze({
    schema: EXTRACTION_CACHE_ENTRY_SCHEMA_V2,
    extractionKey,
    identity: cloneJsonValue(normalizedIdentity),
    payloadDigest: computedPayloadDigest,
    extraction: cloneJsonValue(extProj.value) as unknown as Extraction,
    mergeConflicts: cloneJsonValue(confProj.value) as unknown as readonly ExtractionMergeConflict[],
    receipt: cloneJsonValue(rProj.value) as unknown as ExtractionReceiptV1,
    createdAt: createdAtProp.value,
  });

  return deepFreeze({
    status: "hit",
    extractionKey,
    entry: validatedEntry,
  });
}

/**
 * Validates and looks up a cached extraction entry from `unknown` (§1(c).2, §1(c).3).
 * Never throws.
 */
export async function lookupCachedExtraction(
  cache: ExtractionCachePort,
  identity: ExtractionIdentityInput,
): Promise<ExtractionCacheLookupResult> {
  const keyRes = computeExtractionKey(identity);
  if (!keyRes.ok) {
    return deepFreeze({
      status: "invalid_identity",
      issues: keyRes.issues,
    });
  }
  return lookupCachedExtractionResolved(cache, keyRes.key, keyRes.identity);
}

function appendClampedReason(base: string | null, clamped: readonly string[]): string | null {
  if (clamped.length === 0) return base;
  const suffix = clamped.join(";");
  return base && base.length > 0 ? `${base};${suffix}` : suffix;
}

/**
 * Pure and total coverage state machine transition (§1(c).6).
 * Never throws.
 */
export function transitionCoverageRecord(
  input: CoverageTransitionInput,
): CoverageRecordV1 {
  const inObj = isPlainObject(input) ? input : ({} as Record<string, unknown>);
  const clamped: string[] = [];

  let effectiveMaxFailures = 3;
  const mfProp = getOwnDataProp(inObj, "maxFailures");
  if (mfProp.present && mfProp.value !== undefined) {
    if (
      typeof mfProp.value === "number" &&
      Number.isFinite(mfProp.value) &&
      mfProp.value >= 1
    ) {
      effectiveMaxFailures = Math.floor(mfProp.value);
    } else {
      effectiveMaxFailures = 1;
      clamped.push("maxFailures_clamped");
    }
  }

  let effectiveMaxRetryableFailures = 10;
  const mrfProp = getOwnDataProp(inObj, "maxRetryableFailures");
  if (mrfProp.present && mrfProp.value !== undefined) {
    if (
      typeof mrfProp.value === "number" &&
      Number.isFinite(mrfProp.value) &&
      mrfProp.value >= 1
    ) {
      effectiveMaxRetryableFailures = Math.floor(mrfProp.value);
    } else {
      effectiveMaxRetryableFailures = 1;
      clamped.push("maxRetryableFailures_clamped");
    }
  }

  const normDigestField = (v: unknown): string =>
    typeof v === "string" && isWellFormedUnicode(v) ? v.trim().toLowerCase() : "";

  const keyProp = getOwnDataProp(inObj, "key");
  const rawKey = keyProp.validDescriptor && isPlainObject(keyProp.value) ? keyProp.value : null;
  const rawCity = rawKey ? readOwnProp(rawKey, "city") : undefined;
  const rawDocSha = rawKey ? readOwnProp(rawKey, "docSha") : undefined;
  const rawProfileDigest = rawKey ? readOwnProp(rawKey, "profileDigest") : undefined;
  const keyCopy: CoverageKey = {
    city: typeof rawCity === "string" && isWellFormedUnicode(rawCity) ? rawCity : "",
    docSha: normDigestField(rawDocSha),
    profileDigest: normDigestField(rawProfileDigest),
  };

  const extKeyProp = getOwnDataProp(inObj, "extractionKey");
  const inputExtractionKey = normDigestField(
    extKeyProp.validDescriptor ? extKeyProp.value : undefined,
  );

  const nowIsoProp = getOwnDataProp(inObj, "nowIso");
  const nowIso =
    nowIsoProp.validDescriptor && typeof nowIsoProp.value === "string" && isWellFormedUnicode(nowIsoProp.value)
      ? nowIsoProp.value
      : "";

  const curProp = getOwnDataProp(inObj, "current");
  const cur = curProp.validDescriptor && isPlainObject(curProp.value) ? curProp.value : null;

  const curFailureCount = cur ? readOwnProp(cur, "failureCount") : undefined;
  const prevFailures =
    typeof curFailureCount === "number" && Number.isFinite(curFailureCount) && curFailureCount >= 0
      ? Math.floor(curFailureCount)
      : 0;
  const curRetryableCount = cur ? readOwnProp(cur, "retryableFailureCount") : undefined;
  const prevRetryable =
    typeof curRetryableCount === "number" && Number.isFinite(curRetryableCount) && curRetryableCount >= 0
      ? Math.floor(curRetryableCount)
      : 0;
  const curTotalCount = cur ? readOwnProp(cur, "totalFailureCount") : undefined;
  const prevTotal =
    typeof curTotalCount === "number" && Number.isFinite(curTotalCount) && curTotalCount >= 0
      ? Math.floor(curTotalCount)
      : 0;
  const curExtKey = cur ? readOwnProp(cur, "extractionKey") : undefined;
  const prevExtractionKey =
    typeof curExtKey === "string" && isWellFormedUnicode(curExtKey)
      ? normDigestField(curExtKey)
      : null;

  const outcomeProp = getOwnDataProp(inObj, "outcome");
  const outcome =
    outcomeProp.validDescriptor && isPlainObject(outcomeProp.value)
      ? outcomeProp.value
      : {}; // malformed outcome: same path as an unknown kind, never a reset (§1(c).6)
  const outcomeKind = readOwnProp(outcome, "kind");
  const outcomeReason = readOwnProp(outcome, "reason");
  const outcomeStatus = readOwnProp(outcome, "status");
  const outcomeRefusalCode = readOwnProp(outcome, "refusalCode");
  const outcomeRetryable = readOwnProp(outcome, "retryable");

  // Rule 1: outcome.kind === "reset"
  if (outcomeKind === "reset") {
    const baseReason =
      typeof outcomeReason === "string" && outcomeReason.length > 0 && isWellFormedUnicode(outcomeReason)
        ? outcomeReason
        : "reset";
    return deepFreeze({
      schema: COVERAGE_RECORD_SCHEMA_V1,
      key: keyCopy,
      status: "pending",
      extractionKey: null,
      failureCount: 0,
      retryableFailureCount: 0,
      totalFailureCount: 0,
      maxFailures: effectiveMaxFailures,
      maxRetryableFailures: effectiveMaxRetryableFailures,
      lastStatus: null,
      lastRefusalCode: null,
      lastReason: appendClampedReason(baseReason, clamped),
      updatedAt: nowIso,
    });
  }

  // Rule 2: current.status === "abandoned" (absorbing for any non-reset outcome)
  const curStatus = cur ? readOwnProp(cur, "status") : undefined;
  if (cur && curStatus === "abandoned") {
    const isFailed = outcomeKind === "failed";
    const curKeyObj = readOwnProp(cur, "key");
    const cCity = isPlainObject(curKeyObj) ? readOwnProp(curKeyObj, "city") : undefined;
    const cDocSha = isPlainObject(curKeyObj) ? readOwnProp(curKeyObj, "docSha") : undefined;
    const cProfileDigest = isPlainObject(curKeyObj) ? readOwnProp(curKeyObj, "profileDigest") : undefined;
    const curKey = isPlainObject(curKeyObj)
      ? {
          city: typeof cCity === "string" && isWellFormedUnicode(cCity) ? cCity : keyCopy.city,
          docSha:
            typeof cDocSha === "string" && isWellFormedUnicode(cDocSha)
              ? normDigestField(cDocSha)
              : keyCopy.docSha,
          profileDigest:
            typeof cProfileDigest === "string" && isWellFormedUnicode(cProfileDigest)
              ? normDigestField(cProfileDigest)
              : keyCopy.profileDigest,
        }
      : keyCopy;
    const curMaxFailures = readOwnProp(cur, "maxFailures");
    const keptMaxFailures =
      typeof curMaxFailures === "number" && Number.isFinite(curMaxFailures) && curMaxFailures >= 1
        ? Math.floor(curMaxFailures)
        : effectiveMaxFailures;
    const curMaxRetryable = readOwnProp(cur, "maxRetryableFailures");
    const keptMaxRetryable =
      typeof curMaxRetryable === "number" && Number.isFinite(curMaxRetryable) && curMaxRetryable >= 1
        ? Math.floor(curMaxRetryable)
        : effectiveMaxRetryableFailures;
    const curLastStatus = readOwnProp(cur, "lastStatus");
    const keptLastStatus =
      typeof curLastStatus === "string" && VALID_TERMINAL_STATUSES.has(curLastStatus)
        ? (curLastStatus as ExtractionTerminalStatus)
        : null;
    const curLastRefusalCode = readOwnProp(cur, "lastRefusalCode");
    const keptLastRefusalCode =
      typeof curLastRefusalCode === "string" && VALID_REFUSAL_CODES.has(curLastRefusalCode)
        ? (curLastRefusalCode as ExtractionRefusalCode)
        : null;
    const curLastReason = readOwnProp(cur, "lastReason");
    const keptLastReason =
      typeof curLastReason === "string" && isWellFormedUnicode(curLastReason) ? curLastReason : null;

    return deepFreeze({
      schema: COVERAGE_RECORD_SCHEMA_V1,
      key: curKey,
      status: "abandoned",
      extractionKey: prevExtractionKey,
      failureCount: prevFailures,
      retryableFailureCount: prevRetryable,
      totalFailureCount: isFailed ? prevTotal + 1 : prevTotal,
      maxFailures: keptMaxFailures,
      maxRetryableFailures: keptMaxRetryable,
      lastStatus: keptLastStatus,
      lastRefusalCode: keptLastRefusalCode,
      lastReason: keptLastReason,
      updatedAt: nowIso,
    });
  }

  // Rule 3: outcome.kind === "ok" (from pending / covered / no record)
  if (outcomeKind === "ok") {
    return deepFreeze({
      schema: COVERAGE_RECORD_SCHEMA_V1,
      key: keyCopy,
      status: "covered",
      extractionKey: inputExtractionKey,
      failureCount: 0,
      retryableFailureCount: 0,
      totalFailureCount: prevTotal,
      maxFailures: effectiveMaxFailures,
      maxRetryableFailures: effectiveMaxRetryableFailures,
      lastStatus: "ok",
      lastRefusalCode: null,
      lastReason: appendClampedReason(null, clamped),
      updatedAt: nowIso,
    });
  }

  // Outcome kind === "failed"
  const failStatus: ExtractionTerminalStatus =
    typeof outcomeStatus === "string" && VALID_TERMINAL_STATUSES.has(outcomeStatus)
      ? (outcomeStatus as ExtractionTerminalStatus)
      : "refused";
  const failRefusalCode: ExtractionRefusalCode =
    typeof outcomeRefusalCode === "string" && VALID_REFUSAL_CODES.has(outcomeRefusalCode)
      ? (outcomeRefusalCode as ExtractionRefusalCode)
      : "upstream_error";
  const failReasonBase =
    typeof outcomeReason === "string" && isWellFormedUnicode(outcomeReason) ? outcomeReason : null;
  const failReason = appendClampedReason(failReasonBase, clamped);

  // Rule 4: outcome.kind === "failed" with status === "too-large" (not from abandoned)
  if (failStatus === "too-large") {
    return deepFreeze({
      schema: COVERAGE_RECORD_SCHEMA_V1,
      key: keyCopy,
      status: "pending",
      extractionKey: prevExtractionKey,
      failureCount: prevFailures,
      retryableFailureCount: prevRetryable,
      totalFailureCount: prevTotal + 1,
      maxFailures: effectiveMaxFailures,
      maxRetryableFailures: effectiveMaxRetryableFailures,
      lastStatus: "too-large",
      lastRefusalCode: failRefusalCode,
      lastReason: failReason,
      updatedAt: nowIso,
    });
  }

  // Rule 5: outcome.kind === "failed", retryable: true
  if (outcomeRetryable === true) {
    const nextRetryable = prevRetryable + 1;
    const status: CoverageStatus =
      nextRetryable >= effectiveMaxRetryableFailures ? "abandoned" : "pending";
    return deepFreeze({
      schema: COVERAGE_RECORD_SCHEMA_V1,
      key: keyCopy,
      status,
      extractionKey: prevExtractionKey,
      failureCount: prevFailures,
      retryableFailureCount: nextRetryable,
      totalFailureCount: prevTotal + 1,
      maxFailures: effectiveMaxFailures,
      maxRetryableFailures: effectiveMaxRetryableFailures,
      lastStatus: failStatus,
      lastRefusalCode: failRefusalCode,
      lastReason: failReason,
      updatedAt: nowIso,
    });
  }

  // Rule 6: outcome.kind === "failed", retryable: false, status not "too-large"
  const nextFailures = prevFailures + 1;
  const status: CoverageStatus = nextFailures >= effectiveMaxFailures ? "abandoned" : "pending";
  return deepFreeze({
    schema: COVERAGE_RECORD_SCHEMA_V1,
    key: keyCopy,
    status,
    extractionKey: prevExtractionKey,
    failureCount: nextFailures,
    retryableFailureCount: prevRetryable,
    totalFailureCount: prevTotal + 1,
    maxFailures: effectiveMaxFailures,
    maxRetryableFailures: effectiveMaxRetryableFailures,
    lastStatus: failStatus,
    lastRefusalCode: failRefusalCode,
    lastReason: failReason,
    updatedAt: nowIso,
  });
}

function isNonNegativeInt(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && Number.isInteger(v) && v >= 0;
}

function isPositiveInt(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && Number.isInteger(v) && v >= 1;
}

function isValidCoverageRecordShape(raw: unknown, queriedKey: CoverageKey): raw is CoverageRecordV1 {
  if (!isPlainObject(raw)) return false;
  if (!isPlainObject(queriedKey)) return false;

  const schemaProp = getOwnDataProp(raw, "schema");
  if (!schemaProp.validDescriptor || schemaProp.value !== COVERAGE_RECORD_SCHEMA_V1) return false;

  const keyProp = getOwnDataProp(raw, "key");
  if (!keyProp.validDescriptor || !isPlainObject(keyProp.value)) return false;
  const kObj = keyProp.value;
  const kCity = getOwnDataProp(kObj, "city");
  const kDocSha = getOwnDataProp(kObj, "docSha");
  const kProfileDigest = getOwnDataProp(kObj, "profileDigest");
  const qCity = getOwnDataProp(queriedKey, "city");
  const qDocSha = getOwnDataProp(queriedKey, "docSha");
  const qProfileDigest = getOwnDataProp(queriedKey, "profileDigest");
  if (
    !kCity.validDescriptor ||
    typeof kCity.value !== "string" ||
    !qCity.validDescriptor ||
    typeof qCity.value !== "string" ||
    kCity.value !== qCity.value ||
    !kDocSha.validDescriptor ||
    typeof kDocSha.value !== "string" ||
    !isDigest(kDocSha.value) ||
    !qDocSha.validDescriptor ||
    typeof qDocSha.value !== "string" ||
    kDocSha.value !== qDocSha.value.trim().toLowerCase() ||
    !kProfileDigest.validDescriptor ||
    typeof kProfileDigest.value !== "string" ||
    !isDigest(kProfileDigest.value) ||
    !qProfileDigest.validDescriptor ||
    typeof qProfileDigest.value !== "string" ||
    kProfileDigest.value !== qProfileDigest.value.trim().toLowerCase()
  ) {
    return false;
  }

  const statusProp = getOwnDataProp(raw, "status");
  if (
    !statusProp.validDescriptor ||
    typeof statusProp.value !== "string" ||
    !VALID_COVERAGE_STATUSES.has(statusProp.value)
  ) {
    return false;
  }

  const extKeyProp = getOwnDataProp(raw, "extractionKey");
  if (
    !extKeyProp.validDescriptor ||
    (extKeyProp.value !== null && (typeof extKeyProp.value !== "string" || !isDigest(extKeyProp.value)))
  ) {
    return false;
  }

  const fcProp = getOwnDataProp(raw, "failureCount");
  const rfcProp = getOwnDataProp(raw, "retryableFailureCount");
  const tfcProp = getOwnDataProp(raw, "totalFailureCount");
  if (
    !fcProp.validDescriptor ||
    !isNonNegativeInt(fcProp.value) ||
    !rfcProp.validDescriptor ||
    !isNonNegativeInt(rfcProp.value) ||
    !tfcProp.validDescriptor ||
    !isNonNegativeInt(tfcProp.value)
  ) {
    return false;
  }

  const mfProp = getOwnDataProp(raw, "maxFailures");
  const mrfProp = getOwnDataProp(raw, "maxRetryableFailures");
  if (
    !mfProp.validDescriptor ||
    !isPositiveInt(mfProp.value) ||
    !mrfProp.validDescriptor ||
    !isPositiveInt(mrfProp.value)
  ) {
    return false;
  }

  const lastStatusProp = getOwnDataProp(raw, "lastStatus");
  if (
    !lastStatusProp.validDescriptor ||
    (lastStatusProp.value !== null &&
      (typeof lastStatusProp.value !== "string" || !VALID_TERMINAL_STATUSES.has(lastStatusProp.value)))
  ) {
    return false;
  }

  const lastRefusalProp = getOwnDataProp(raw, "lastRefusalCode");
  if (
    !lastRefusalProp.validDescriptor ||
    (lastRefusalProp.value !== null &&
      (typeof lastRefusalProp.value !== "string" || !VALID_REFUSAL_CODES.has(lastRefusalProp.value)))
  ) {
    return false;
  }

  const lastReasonProp = getOwnDataProp(raw, "lastReason");
  if (
    !lastReasonProp.validDescriptor ||
    (lastReasonProp.value !== null &&
      (typeof lastReasonProp.value !== "string" || !isWellFormedUnicode(lastReasonProp.value)))
  ) {
    return false;
  }

  const updatedAtProp = getOwnDataProp(raw, "updatedAt");
  if (
    !updatedAtProp.validDescriptor ||
    typeof updatedAtProp.value !== "string" ||
    !isWellFormedUnicode(updatedAtProp.value)
  ) {
    return false;
  }

  const proj = toJsonValue(raw);
  return proj.ok && isPlainObject(proj.value);
}

/**
 * Port-backed coverage gate (§1(c).6).
 * Validates stored coverage records from `unknown`, distinguishes unknown schemas
 * from invalid known-schema records, and never throws.
 */
export async function checkCoverageGate(
  registry: CoverageRegistryPort,
  key: CoverageKey,
  current: { readonly extractionKey: ExtractionKey },
): Promise<CoverageGateResult> {
  let raw: unknown;
  try {
    if (!registry || typeof registry.get !== "function") {
      return deepFreeze({
        action: "unavailable",
        diagnostic: "coverage_port_missing_get",
      });
    }
    raw = await registry.get(key);
  } catch (err) {
    return deepFreeze({
      action: "unavailable",
      diagnostic: errorMessage(err),
    });
  }

  if (raw === null || raw === undefined) {
    return deepFreeze({
      action: "proceed",
      record: null,
    });
  }

  // Check for unknown schema before general shape predicate (§1(c).6, R4-M2)
  if (isPlainObject(raw)) {
    const schemaProp = getOwnDataProp(raw, "schema");
    if (
      schemaProp.validDescriptor &&
      typeof schemaProp.value === "string" &&
      schemaProp.value !== COVERAGE_RECORD_SCHEMA_V1 &&
      isWellFormedUnicode(schemaProp.value)
    ) {
      return deepFreeze({
        action: "unavailable",
        diagnostic: `coverage_record_unknown_schema:${schemaProp.value}`,
      });
    }
  }

  if (!isValidCoverageRecordShape(raw, key)) {
    return deepFreeze({
      action: "proceed",
      record: null,
      diagnostic: "coverage_record_invalid",
    });
  }

  const record = deepFreeze(cloneJsonValue(raw));
  const currentKeyProp = isPlainObject(current) ? getOwnDataProp(current, "extractionKey") : null;
  const currentExtractionKey =
    currentKeyProp && currentKeyProp.validDescriptor && typeof currentKeyProp.value === "string"
      ? currentKeyProp.value
      : "";

  if (record.status === "covered" && record.extractionKey === currentExtractionKey.trim().toLowerCase()) {
    return deepFreeze({
      action: "skip_covered",
      record,
    });
  }

  if (record.status === "abandoned") {
    return deepFreeze({
      action: "skip_abandoned",
      record,
    });
  }

  return deepFreeze({
    action: "proceed",
    record,
  });
}

function buildSynthesizedRefusalReceipt(params: {
  extractionKey: ExtractionKey | null;
  identityInput: unknown;
  normalizedIdentity: NormalizedExtractionIdentityV1 | null;
  latencyMs: number;
  retryable: boolean;
  refusalCode: ExtractionRefusalCode;
  refusalReason: string;
  diagnostics: readonly string[];
}): ExtractionReceiptV1 {
  const norm = params.normalizedIdentity;
  const rawObj = isPlainObject(params.identityInput) ? params.identityInput : null;

  let docSha = "";
  if (norm) {
    docSha = norm.docSha;
  } else if (rawObj) {
    const p = getOwnDataProp(rawObj, "docSha");
    if (p.validDescriptor && typeof p.value === "string" && isWellFormedUnicode(p.value)) {
      const lower = p.value.trim().toLowerCase();
      docSha = isDigest(lower) ? lower : p.value;
    }
  }

  let profileDigest = "";
  if (norm) {
    profileDigest = norm.profileDigest;
  } else if (rawObj) {
    const p = getOwnDataProp(rawObj, "profileDigest");
    if (p.validDescriptor && typeof p.value === "string" && isWellFormedUnicode(p.value)) {
      const lower = p.value.trim().toLowerCase();
      profileDigest = isDigest(lower) ? lower : p.value;
    }
  }

  let promptVersion = "";
  if (norm) {
    promptVersion = norm.promptVersion;
  } else if (rawObj) {
    const p = getOwnDataProp(rawObj, "promptVersion");
    if (p.validDescriptor && typeof p.value === "string" && isWellFormedUnicode(p.value)) {
      const trimmed = p.value.trim().normalize("NFC");
      promptVersion = trimmed.length > 0 ? trimmed : p.value;
    }
  }

  let engramVersion: string = EXTRACTION_SEMANTICS_VERSION;
  if (norm) {
    engramVersion = norm.engramVersion;
  } else if (rawObj) {
    const p = getOwnDataProp(rawObj, "engramVersion");
    if (p.validDescriptor && typeof p.value === "string" && isWellFormedUnicode(p.value)) {
      const trimmed = p.value.trim().normalize("NFC");
      engramVersion = trimmed.length > 0 ? trimmed : EXTRACTION_SEMANTICS_VERSION;
    }
  }

  return deepFreeze({
    extractionKey: params.extractionKey,
    docSha,
    profileDigest,
    promptVersion,
    engramVersion,
    status: "refused",
    fromCache: false,
    attempts: 0,
    model: null,
    provider: null,
    modelSource: "unknown",
    latencyMs: params.latencyMs,
    tokensIn: null,
    tokensOut: null,
    retryable: params.retryable,
    refusalCode: params.refusalCode,
    refusalReason: params.refusalReason,
    diagnostics: [...params.diagnostics],
  });
}

function isValidRefusedReceipt(receipt: unknown, expectedKey: ExtractionKey): receipt is ExtractionReceiptV1 & {
  readonly refusalCode: ExtractionRefusalCode;
} {
  if (!isPlainObject(receipt)) return false;
  const keyProp = getOwnDataProp(receipt, "extractionKey");
  if (!keyProp.validDescriptor || keyProp.value !== expectedKey) return false;
  const statusProp = getOwnDataProp(receipt, "status");
  if (
    !statusProp.validDescriptor ||
    typeof statusProp.value !== "string" ||
    !VALID_TERMINAL_STATUSES.has(statusProp.value) ||
    statusProp.value === "ok"
  ) {
    return false;
  }
  const codeProp = getOwnDataProp(receipt, "refusalCode");
  if (
    !codeProp.validDescriptor ||
    typeof codeProp.value !== "string" ||
    !VALID_REFUSAL_CODES.has(codeProp.value)
  ) {
    return false;
  }
  const proj = toJsonValue(receipt);
  return proj.ok && isPlainObject(proj.value);
}

function appendDiagnostics(base: readonly string[], extras: readonly string[]): string[] {
  const out = Array.isArray(base) ? [...base] : [];
  for (const d of extras) {
    if (!out.includes(d)) {
      out.push(d);
    }
  }
  return out;
}

function buildProducedReturn(params: {
  entry: CachedExtractionEntryV2;
  producedReceipt: ExtractionReceiptV1;
  extraDiagnostics: readonly string[];
  cacheWrite: "stored" | "repaired" | "write_failed" | "not_attempted";
}): GetOrExtractResult {
  const receiptCopy = cloneJsonValue(params.producedReceipt) as unknown as Record<string, unknown>;
  defineOwnProp(receiptCopy, "fromCache", false);
  defineOwnProp(
    receiptCopy,
    "diagnostics",
    appendDiagnostics(params.producedReceipt.diagnostics ?? [], params.extraDiagnostics),
  );
  const frozenReceipt = deepFreeze(receiptCopy as unknown as ExtractionReceiptV1);
  const frozenConflicts = deepFreeze(cloneJsonValue(params.entry.mergeConflicts));
  const unfrozenExtraction = cloneJsonValue(params.entry.extraction);

  return Object.freeze({
    status: "ok",
    extraction: unfrozenExtraction,
    mergeConflicts: frozenConflicts,
    receipt: frozenReceipt,
    cacheWrite: params.cacheWrite,
  });
}

function buildLostRaceReturn(params: {
  storedEntry: CachedExtractionEntryV2;
  producedReceipt: ExtractionReceiptV1;
  extraDiagnostics: readonly string[];
}): GetOrExtractResult {
  const receiptCopy = cloneJsonValue(params.producedReceipt) as unknown as Record<string, unknown>;
  defineOwnProp(receiptCopy, "fromCache", false);
  defineOwnProp(receiptCopy, "model", params.storedEntry.receipt.model);
  defineOwnProp(receiptCopy, "provider", params.storedEntry.receipt.provider);
  defineOwnProp(receiptCopy, "modelSource", params.storedEntry.receipt.modelSource);
  defineOwnProp(
    receiptCopy,
    "diagnostics",
    appendDiagnostics(params.producedReceipt.diagnostics ?? [], [
      ...params.extraDiagnostics,
      "cache_write_lost_race",
    ]),
  );
  const frozenReceipt = deepFreeze(receiptCopy as unknown as ExtractionReceiptV1);
  const frozenConflicts = deepFreeze(cloneJsonValue(params.storedEntry.mergeConflicts));
  const unfrozenExtraction = cloneJsonValue(params.storedEntry.extraction);

  return Object.freeze({
    status: "ok",
    extraction: unfrozenExtraction,
    mergeConflicts: frozenConflicts,
    receipt: frozenReceipt,
    cacheWrite: "exists",
  });
}

/**
 * Cache orchestration (`getOrExtract`, §1(c).5).
 * Validates identity, checks cache, invokes `produce` at most once on a miss,
 * performs write-once / conditional repair / vanished-value retry, and never throws.
 */
export async function getOrExtract(input: {
  readonly identity: ExtractionIdentityInput;
  readonly cache?: ExtractionCachePort;
  readonly nowIso: string;
  readonly nowMs: number;
  readonly endMs: () => number;
  readonly produce: (
    key: ExtractionKey,
  ) => Promise<ProducedExtraction | RefusedProduction>;
}): Promise<GetOrExtractResult> {
  const inObj = isPlainObject(input) ? input : ({} as Record<string, unknown>);
  const nowMsProp = getOwnDataProp(inObj, "nowMs");
  const nowMs = nowMsProp.validDescriptor && typeof nowMsProp.value === "number" ? nowMsProp.value : 0;
  const endMsProp = getOwnDataProp(inObj, "endMs");
  const endMs =
    endMsProp.validDescriptor && typeof endMsProp.value === "function"
      ? (endMsProp.value as () => number)
      : () => nowMs;
  const nowIsoProp = getOwnDataProp(inObj, "nowIso");
  const nowIso =
    nowIsoProp.validDescriptor && typeof nowIsoProp.value === "string" && isWellFormedUnicode(nowIsoProp.value)
      ? nowIsoProp.value
      : "";
  const identityInput = getOwnDataProp(inObj, "identity").value as ExtractionIdentityInput;

  // Step (i): computeExtractionKey
  const keyRes = computeExtractionKey(identityInput);
  if (!keyRes.ok) {
    const reason = keyRes.issues.map((i) => `${i.path}: ${i.message}`).join("; ") || "invalid_identity";
    const diagnostics = keyRes.issues.map((i) => `invalid_identity:${i.path}`);
    const receipt = buildSynthesizedRefusalReceipt({
      extractionKey: null,
      identityInput,
      normalizedIdentity: null,
      latencyMs: measureLatency(nowMs, endMs),
      retryable: false,
      refusalCode: "invalid_identity",
      refusalReason: reason,
      diagnostics,
    });
    return deepFreeze({
      status: "refused",
      refusalCode: "invalid_identity",
      receipt,
      cacheWrite: "not_attempted",
    });
  }

  const key = keyRes.key;
  const normId = keyRes.identity;

  const cacheProp = getOwnDataProp(inObj, "cache");
  const cache =
    cacheProp.validDescriptor && cacheProp.value !== undefined && cacheProp.value !== null
      ? (cacheProp.value as ExtractionCachePort)
      : undefined;

  let missReasonDiagnostic: string | null = null;
  let observedInvalid = false;
  let observedValue: unknown = undefined;

  // Step (ii): cache lookup when cache is injected
  if (cache !== undefined) {
    const lookup = await lookupCachedExtractionResolved(cache, key, normId);
    if (lookup.status === "hit") {
      const hitReceipt: ExtractionReceiptV1 = deepFreeze({
        extractionKey: key,
        docSha: normId.docSha,
        profileDigest: normId.profileDigest,
        promptVersion: normId.promptVersion,
        engramVersion: normId.engramVersion,
        status: "ok",
        fromCache: true,
        attempts: 0,
        model: lookup.entry.receipt.model,
        provider: lookup.entry.receipt.provider,
        modelSource: lookup.entry.receipt.modelSource,
        latencyMs: measureLatency(nowMs, endMs),
        tokensIn: null,
        tokensOut: null,
        retryable: false,
        diagnostics: ["cache_hit"],
      });
      return Object.freeze({
        status: "ok",
        extraction: cloneJsonValue(lookup.entry.extraction),
        mergeConflicts: deepFreeze(cloneJsonValue(lookup.entry.mergeConflicts)),
        receipt: hitReceipt,
        cacheWrite: "hit",
      });
    }

    if (lookup.status === "cache_unavailable") {
      const receipt = buildSynthesizedRefusalReceipt({
        extractionKey: key,
        identityInput,
        normalizedIdentity: normId,
        latencyMs: measureLatency(nowMs, endMs),
        retryable: true,
        refusalCode: "cache_unavailable",
        refusalReason: lookup.diagnostic,
        diagnostics: ["cache_unavailable", ...(lookup.diagnostic ? [lookup.diagnostic] : [])],
      });
      return deepFreeze({
        status: "refused",
        refusalCode: "cache_unavailable",
        receipt,
        cacheWrite: "not_attempted",
      });
    }

    if (lookup.status === "miss") {
      missReasonDiagnostic = lookup.reason;
      if (lookup.reason !== "not_found") {
        observedInvalid = true;
        observedValue = lookup.observed;
      }
    }
  }

  const baseDiagnostics: string[] = missReasonDiagnostic ? [missReasonDiagnostic] : [];

  // Step (iii): call produce(key) once inside try/catch
  const produceProp = getOwnDataProp(inObj, "produce");
  if (!produceProp.validDescriptor || typeof produceProp.value !== "function") {
    const receipt = buildSynthesizedRefusalReceipt({
      extractionKey: key,
      identityInput,
      normalizedIdentity: normId,
      latencyMs: measureLatency(nowMs, endMs),
      retryable: false,
      refusalCode: "upstream_error",
      refusalReason: "produce is not a function",
      diagnostics: [...baseDiagnostics, "produce_threw"],
    });
    return deepFreeze({
      status: "refused",
      refusalCode: "upstream_error",
      receipt,
      cacheWrite: "not_attempted",
    });
  }

  let produced: ProducedExtraction | RefusedProduction;
  try {
    produced = await (produceProp.value as (k: ExtractionKey) => Promise<ProducedExtraction | RefusedProduction>)(key);
  } catch (err) {
    const msg = errorMessage(err);
    const receipt = buildSynthesizedRefusalReceipt({
      extractionKey: key,
      identityInput,
      normalizedIdentity: normId,
      latencyMs: measureLatency(nowMs, endMs),
      retryable: false,
      refusalCode: "upstream_error",
      refusalReason: msg,
      diagnostics: [...baseDiagnostics, "produce_threw"],
    });
    return deepFreeze({
      status: "refused",
      refusalCode: "upstream_error",
      receipt,
      cacheWrite: "not_attempted",
    });
  }

  if (!isPlainObject(produced)) {
    const receipt = buildSynthesizedRefusalReceipt({
      extractionKey: key,
      identityInput,
      normalizedIdentity: normId,
      latencyMs: measureLatency(nowMs, endMs),
      retryable: false,
      refusalCode: "invalid_extraction_payload",
      refusalReason: "produce returned a non-object value",
      diagnostics: [...baseDiagnostics, "invalid_extraction_payload"],
    });
    return deepFreeze({
      status: "refused",
      refusalCode: "invalid_extraction_payload",
      receipt,
      cacheWrite: "not_attempted",
    });
  }

  // Outcome (a): { refused }
  const refusedProp = getOwnDataProp(produced, "refused");
  if (refusedProp.present && refusedProp.value !== undefined) {
    if (!refusedProp.validDescriptor || !isValidRefusedReceipt(refusedProp.value, key)) {
      const receipt = buildSynthesizedRefusalReceipt({
        extractionKey: key,
        identityInput,
        normalizedIdentity: normId,
        latencyMs: measureLatency(nowMs, endMs),
        retryable: false,
        refusalCode: "invalid_extraction_payload",
        refusalReason: "refused receipt failed validation",
        diagnostics: [...baseDiagnostics, "invalid_extraction_payload"],
      });
      return deepFreeze({
        status: "refused",
        refusalCode: "invalid_extraction_payload",
        receipt,
        cacheWrite: "not_attempted",
      });
    }
    const frozenRefused = deepFreeze(cloneJsonValue(refusedProp.value));
    return deepFreeze({
      status: "refused",
      refusalCode: frozenRefused.refusalCode,
      receipt: frozenRefused,
      cacheWrite: "not_attempted",
    });
  }

  // Outcome (c): ProducedExtraction
  const prodExtProp = getOwnDataProp(produced, "extraction");
  const prodConflictsProp = getOwnDataProp(produced, "mergeConflicts");
  const prodReceiptProp = getOwnDataProp(produced, "receipt");

  if (!prodExtProp.validDescriptor || !prodReceiptProp.validDescriptor || !isPlainObject(prodReceiptProp.value)) {
    const receipt = buildSynthesizedRefusalReceipt({
      extractionKey: key,
      identityInput,
      normalizedIdentity: normId,
      latencyMs: measureLatency(nowMs, endMs),
      retryable: false,
      refusalCode: "invalid_extraction_payload",
      refusalReason: "produced extraction or receipt is invalid",
      diagnostics: [...baseDiagnostics, "invalid_extraction_payload"],
    });
    return deepFreeze({
      status: "refused",
      refusalCode: "invalid_extraction_payload",
      receipt,
      cacheWrite: "not_attempted",
    });
  }

  const entryRes = createCachedExtractionEntry({
    identity: identityInput,
    extraction: prodExtProp.value as Extraction,
    ...(prodConflictsProp.present && prodConflictsProp.value !== undefined
      ? { mergeConflicts: prodConflictsProp.value as readonly ExtractionMergeConflict[] }
      : {}),
    receipt: prodReceiptProp.value as unknown as ExtractionReceiptV1,
    createdAt: nowIso,
  });

  if (!entryRes.ok) {
    const receipt = buildSynthesizedRefusalReceipt({
      extractionKey: key,
      identityInput,
      normalizedIdentity: normId,
      latencyMs: measureLatency(nowMs, endMs),
      retryable: false,
      refusalCode: "invalid_extraction_payload",
      refusalReason: entryRes.issues.map((i) => `${i.path}: ${i.message}`).join("; ") || "invalid_extraction_payload",
      diagnostics: [
        ...baseDiagnostics,
        "invalid_extraction_payload",
        ...(entryRes.diagnostic ? [entryRes.diagnostic] : []),
      ],
    });
    return deepFreeze({
      status: "refused",
      refusalCode: "invalid_extraction_payload",
      receipt,
      cacheWrite: "not_attempted",
    });
  }

  const entry = entryRes.entry;
  const producedReceipt = entry.receipt;

  // Without a cache, cacheWrite: "not_attempted"
  if (cache === undefined) {
    return buildProducedReturn({
      entry,
      producedReceipt,
      extraDiagnostics: baseDiagnostics,
      cacheWrite: "not_attempted",
    });
  }

  // Step (iv): cache write + repair + vanished-value retry (§1(c).4, §1(c).5)
  let repairAttempted = false;
  let vanishedRetryAttempted = false;

  const finishWriteFailed = (includeUnrepairable: boolean, includeRereadFailed = false): GetOrExtractResult => {
    const diags = [...baseDiagnostics, "cache_write_failed"];
    if (includeRereadFailed) {
      diags.push("cache_reread_failed");
    } else if (includeUnrepairable) {
      diags.push("cache_entry_unrepairable");
    }
    return buildProducedReturn({
      entry,
      producedReceipt,
      extraDiagnostics: diags,
      cacheWrite: "write_failed",
    });
  };

  const attemptVanishedValueRetry = async (): Promise<GetOrExtractResult> => {
    vanishedRetryAttempted = true;
    let retryWriteOut: "stored" | "exists";
    try {
      retryWriteOut = await cache.putIfAbsent(key, entry);
    } catch {
      return finishWriteFailed(observedInvalid);
    }
    if (retryWriteOut === "stored") {
      return buildProducedReturn({
        entry,
        producedReceipt,
        extraDiagnostics: baseDiagnostics,
        cacheWrite: "stored",
      });
    }
    if (retryWriteOut !== "exists") {
      return finishWriteFailed(observedInvalid);
    }
    // One final re-read
    const finalReread = await lookupCachedExtractionResolved(cache, key, normId);
    if (finalReread.status === "cache_unavailable") {
      return finishWriteFailed(false, true);
    }
    if (finalReread.status === "hit") {
      return buildLostRaceReturn({
        storedEntry: finalReread.entry,
        producedReceipt,
        extraDiagnostics: baseDiagnostics,
      });
    }
    if (finalReread.status === "miss" && finalReread.reason !== "not_found") {
      observedInvalid = true;
    }
    return finishWriteFailed(observedInvalid);
  };

  const attemptRepairWithObserved = async (observed: unknown): Promise<GetOrExtractResult> => {
    repairAttempted = true;
    let repairOut: "stored" | "exists";
    try {
      if (typeof cache.replaceInvalid !== "function") {
        return finishWriteFailed(true);
      }
      repairOut = await cache.replaceInvalid(key, entry, observed);
    } catch {
      return finishWriteFailed(true);
    }
    if (repairOut === "stored") {
      return buildProducedReturn({
        entry,
        producedReceipt,
        extraDiagnostics: baseDiagnostics,
        cacheWrite: "repaired",
      });
    }
    if (repairOut !== "exists") {
      return finishWriteFailed(true);
    }
    // Stored value changed since observation -> re-read once
    const rereadAfterRepair = await lookupCachedExtractionResolved(cache, key, normId);
    if (rereadAfterRepair.status === "cache_unavailable") {
      return finishWriteFailed(false, true);
    }
    if (rereadAfterRepair.status === "hit") {
      return buildLostRaceReturn({
        storedEntry: rereadAfterRepair.entry,
        producedReceipt,
        extraDiagnostics: baseDiagnostics,
      });
    }
    if (
      rereadAfterRepair.status === "miss" &&
      rereadAfterRepair.reason === "not_found" &&
      !vanishedRetryAttempted
    ) {
      return attemptVanishedValueRetry();
    }
    return finishWriteFailed(true);
  };

  // If step (ii) observed an invalid entry and the port implements replaceInvalid, repair directly
  let hasReplaceInvalid = false;
  try {
    hasReplaceInvalid = typeof cache.replaceInvalid === "function";
  } catch {
    hasReplaceInvalid = false;
  }
  if (observedInvalid && hasReplaceInvalid) {
    return attemptRepairWithObserved(observedValue);
  }

  // Otherwise attempt putIfAbsent once (even when observedInvalid is true and replaceInvalid is absent,
  // because the invalid value may have been removed since observation, §1(c).4)
  let writeOut: "stored" | "exists";
  try {
    if (typeof cache.putIfAbsent !== "function") {
      return finishWriteFailed(observedInvalid);
    }
    writeOut = await cache.putIfAbsent(key, entry);
  } catch {
    return finishWriteFailed(observedInvalid);
  }

  if (writeOut === "stored") {
    return buildProducedReturn({
      entry,
      producedReceipt,
      extraDiagnostics: baseDiagnostics,
      cacheWrite: "stored",
    });
  }

  if (writeOut !== "exists") {
    return finishWriteFailed(observedInvalid);
  }

  // Re-read after putIfAbsent returned "exists"
  const reread = await lookupCachedExtractionResolved(cache, key, normId);
  if (reread.status === "cache_unavailable") {
    return finishWriteFailed(false, true);
  }
  if (reread.status === "hit") {
    return buildLostRaceReturn({
      storedEntry: reread.entry,
      producedReceipt,
      extraDiagnostics: baseDiagnostics,
    });
  }
  if (reread.status === "miss") {
    if (reread.reason === "not_found" && !vanishedRetryAttempted) {
      return attemptVanishedValueRetry();
    }
    if (reread.reason !== "not_found") {
      observedInvalid = true;
      observedValue = reread.observed;
      if (!repairAttempted && hasReplaceInvalid) {
        return attemptRepairWithObserved(observedValue);
      }
    }
  }

  return finishWriteFailed(observedInvalid);
}
