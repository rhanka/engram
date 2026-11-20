// @sentropic/engram-live/batch-codec — L3a-E1 canonical batch encoding, digest
// verification and pre-delivery 4 MiB guard
// (spec/SPEC_LIVE_GIT_INDEXING.md §§3, 6, 13; spec/SPEC_L3A_GENERIC_MODULE_STORAGE_PORT.md
// §§12.3, 17.4; plan/09 L3a-E1).
//
// Guarantees:
//   - Byte-stable canonical encoding across object key order, omitted vs
//     undefined optional properties, and -0/+0 numbers.
//   - Lossless, collision-free binary encoding for Uint8Array fields (raw Git
//     path bytes, commit messages, non-UTF-8 identities, sealed ciphertext).
//   - Domain-separated SHA-256 batch digest over every envelope field and fact
//     (algorithm-qualified OIDs, ordered parents, ref-observation identity and
//     complete relationship endpoints, roles and versions).
//   - Strict pre-delivery 4 MiB ceiling (MAX_FACT_BATCH_BYTES = 4,194,304 bytes):
//     oversized batches are refused BEFORE delivery and zero prefix is emitted
//     or acknowledged.
//
// Neutrality: imports ONLY ./contracts.js and node:crypto.

import { createHash } from "node:crypto";
import {
  BATCH_CODEC_VERSION,
  MAX_FACT_BATCH_BYTES,
  validateFactBatch,
  type FactBatchDto,
  type LiveFactDto,
  type LiveScope,
} from "./contracts.js";

export type BatchCodecErrorCode =
  | "invalid-batch"
  | "digest-mismatch"
  | "batch-too-large"
  | "invalid-encoding"
  | "unsupported-codec-version"
  | "invalid-limit"
  | "receipt-mismatch";

export class BatchCodecError extends Error {
  readonly code: BatchCodecErrorCode;
  readonly byteLength?: number;
  readonly maxBytes?: number;

  constructor(
    code: BatchCodecErrorCode,
    message: string,
    detail?: { readonly byteLength?: number; readonly maxBytes?: number },
  ) {
    super(message);
    this.name = "BatchCodecError";
    this.code = code;
    this.byteLength = detail?.byteLength;
    this.maxBytes = detail?.maxBytes;
  }
}

export interface FactBatchPayloadInput {
  readonly scope: LiveScope;
  readonly producerName: string;
  readonly contractVersion: number;
  readonly policyVersion: string;
  readonly generationId: string;
  readonly batchId: string;
  readonly facts: readonly LiveFactDto[];
}

export interface EncodeFactBatchOptions {
  /** Must stay <= MAX_FACT_BATCH_BYTES (4 MiB); callers cannot relax the fixed ceiling. */
  readonly maxBytes?: number;
  /** Default true: verifies batch.batchDigest equals the canonical payload digest. */
  readonly verifyDigest?: boolean;
}

export interface DecodeFactBatchOptions {
  /** Must stay <= MAX_FACT_BATCH_BYTES (4 MiB); checked before parsing JSON. */
  readonly maxBytes?: number;
}

export interface EncodedFactBatch {
  readonly codecVersion: typeof BATCH_CODEC_VERSION;
  readonly batchId: string;
  readonly batchDigest: string;
  readonly byteLength: number;
  readonly bytes: Uint8Array;
}

export interface BuiltFactBatch {
  readonly batch: FactBatchDto;
  readonly encoded: EncodedFactBatch;
}

export interface BatchDeliveryPort<TReceipt = { readonly received: true; readonly batchId: string }> {
  deliver(batch: FactBatchDto, encoded: EncodedFactBatch): Promise<TReceipt>;
}

export interface DeliverEncodedBatchResult<TReceipt> {
  readonly batch: FactBatchDto;
  readonly encoded: EncodedFactBatch;
  readonly receipt: TReceipt;
}

export const MAX_CANONICAL_DEPTH = 32;

const ZERO_DIGEST = "0".repeat(64);
const TAG_KEY = "$t";
const VALUE_KEY = "v";
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function resolveMaxBytes(requested?: number): number {
  if (requested === undefined) return MAX_FACT_BATCH_BYTES;
  if (typeof requested !== "number" || !Number.isSafeInteger(requested) || requested <= 0 || requested > MAX_FACT_BATCH_BYTES) {
    throw new BatchCodecError(
      "invalid-limit",
      `batch byte limit must be a positive safe integer <= ${MAX_FACT_BATCH_BYTES}`,
      { maxBytes: MAX_FACT_BATCH_BYTES },
    );
  }
  return requested;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || value instanceof Uint8Array) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function setOwnProperty(target: Record<string, unknown>, key: string, value: unknown): void {
  if (key === "__proto__") {
    Object.defineProperty(target, key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  } else {
    target[key] = value;
  }
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let i = 0; i < left.byteLength; i++) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

function sortKeys(keys: string[]): string[] {
  return keys.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

function serializeCanonicalJson(value: unknown, depth = 0): string {
  if (depth > MAX_CANONICAL_DEPTH) {
    throw new BatchCodecError(
      "invalid-encoding",
      `canonical encoding exceeds maximum nesting depth of ${MAX_CANONICAL_DEPTH}`,
    );
  }
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new BatchCodecError("invalid-encoding", "canonical encoding refuses non-finite numbers");
    }
    return Object.is(value, -0) ? "0" : JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (value instanceof Uint8Array) {
    const base64 = Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString("base64");
    return `{"$t":"bytes","v":${JSON.stringify(base64)}}`;
  }
  if (Array.isArray(value)) {
    const nextDepth = depth + 1;
    if (nextDepth > MAX_CANONICAL_DEPTH) {
      throw new BatchCodecError(
        "invalid-encoding",
        `canonical encoding exceeds maximum nesting depth of ${MAX_CANONICAL_DEPTH}`,
      );
    }
    const items: string[] = [];
    for (let i = 0; i < value.length; i++) {
      const element = value[i];
      if (element === undefined) {
        throw new BatchCodecError("invalid-encoding", "canonical encoding refuses undefined array elements");
      }
      items.push(serializeCanonicalJson(element, nextDepth));
    }
    return `[${items.join(",")}]`;
  }
  if (isPlainRecord(value)) {
    const nextDepth = depth + 1;
    if (nextDepth > MAX_CANONICAL_DEPTH) {
      throw new BatchCodecError(
        "invalid-encoding",
        `canonical encoding exceeds maximum nesting depth of ${MAX_CANONICAL_DEPTH}`,
      );
    }
    const definedKeys = sortKeys(
      Object.keys(value).filter((key) => value[key] !== undefined),
    );
    const body = `{${definedKeys
      .map((key) => `${JSON.stringify(key)}:${serializeCanonicalJson(value[key], nextDepth)}`)
      .join(",")}}`;
    if (definedKeys.includes(TAG_KEY)) {
      return `{"$t":"object","v":${body}}`;
    }
    return body;
  }
  if (typeof value === "object") {
    throw new BatchCodecError("invalid-encoding", "canonical encoding refuses non-plain object prototypes");
  }
  throw new BatchCodecError("invalid-encoding", `canonical encoding refuses unsupported value type "${typeof value}"`);
}

function decodeCanonicalValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_CANONICAL_DEPTH) {
    throw new BatchCodecError(
      "invalid-encoding",
      `canonical decoding exceeds maximum nesting depth of ${MAX_CANONICAL_DEPTH}`,
    );
  }
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    const nextDepth = depth + 1;
    if (nextDepth > MAX_CANONICAL_DEPTH) {
      throw new BatchCodecError(
        "invalid-encoding",
        `canonical decoding exceeds maximum nesting depth of ${MAX_CANONICAL_DEPTH}`,
      );
    }
    return value.map((item) => decodeCanonicalValue(item, nextDepth));
  }
  if (isPlainRecord(value)) {
    const keys = Object.keys(value);
    if (keys.includes(TAG_KEY)) {
      if (keys.length !== 2 || !keys.includes(VALUE_KEY)) {
        throw new BatchCodecError("invalid-encoding", "malformed canonical tag envelope");
      }
      if (value[TAG_KEY] === "bytes") {
        const encoded = value[VALUE_KEY];
        if (typeof encoded !== "string" || !BASE64_PATTERN.test(encoded)) {
          throw new BatchCodecError("invalid-encoding", "invalid canonical base64 byte payload");
        }
        const buf = Buffer.from(encoded, "base64");
        if (buf.toString("base64") !== encoded) {
          throw new BatchCodecError("invalid-encoding", "non-canonical base64 byte payload");
        }
        return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength).slice();
      }
      if (value[TAG_KEY] === "object") {
        const nextDepth = depth + 1;
        if (nextDepth > MAX_CANONICAL_DEPTH) {
          throw new BatchCodecError(
            "invalid-encoding",
            `canonical decoding exceeds maximum nesting depth of ${MAX_CANONICAL_DEPTH}`,
          );
        }
        const inner = value[VALUE_KEY];
        if (!isPlainRecord(inner)) {
          throw new BatchCodecError("invalid-encoding", "canonical object escape must wrap an object");
        }
        const decodedInner: Record<string, unknown> = {};
        for (const key of Object.keys(inner)) {
          setOwnProperty(decodedInner, key, decodeCanonicalValue(inner[key], nextDepth));
        }
        return decodedInner;
      }
      throw new BatchCodecError("invalid-encoding", "unknown canonical tag discriminator");
    }
    const nextDepth = depth + 1;
    if (nextDepth > MAX_CANONICAL_DEPTH) {
      throw new BatchCodecError(
        "invalid-encoding",
        `canonical decoding exceeds maximum nesting depth of ${MAX_CANONICAL_DEPTH}`,
      );
    }
    const decoded: Record<string, unknown> = {};
    for (const key of keys) {
      setOwnProperty(decoded, key, decodeCanonicalValue(value[key], nextDepth));
    }
    return decoded;
  }
  throw new BatchCodecError("invalid-encoding", "unsupported decoded JSON value");
}

function deepCloneValue<T>(value: T, depth = 0): T {
  if (depth > MAX_CANONICAL_DEPTH) {
    throw new BatchCodecError(
      "invalid-encoding",
      `canonical value cloning exceeds maximum nesting depth of ${MAX_CANONICAL_DEPTH}`,
    );
  }
  if (value instanceof Uint8Array) {
    return Uint8Array.from(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    const nextDepth = depth + 1;
    if (nextDepth > MAX_CANONICAL_DEPTH) {
      throw new BatchCodecError(
        "invalid-encoding",
        `canonical value cloning exceeds maximum nesting depth of ${MAX_CANONICAL_DEPTH}`,
      );
    }
    return value.map((item) => deepCloneValue(item, nextDepth)) as unknown as T;
  }
  if (isPlainRecord(value)) {
    const nextDepth = depth + 1;
    if (nextDepth > MAX_CANONICAL_DEPTH) {
      throw new BatchCodecError(
        "invalid-encoding",
        `canonical value cloning exceeds maximum nesting depth of ${MAX_CANONICAL_DEPTH}`,
      );
    }
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry !== undefined) {
        setOwnProperty(out, key, deepCloneValue(entry, nextDepth));
      }
    }
    return out as T;
  }
  return value;
}

/**
 * Deterministic canonical UTF-8 encoding of any supported DTO/value graph.
 * Object keys are sorted lexicographically at every depth, undefined object
 * properties are omitted, -0 normalizes to 0, and Uint8Array values use an
 * injective tagged base64 representation.
 */
export function canonicalEncodeValue(value: unknown): Uint8Array {
  return new Uint8Array(Buffer.from(serializeCanonicalJson(value), "utf8"));
}

function canonicalPayloadEnvelope(input: FactBatchPayloadInput): Record<string, unknown> {
  return {
    codecVersion: BATCH_CODEC_VERSION,
    scope: input.scope,
    producerName: input.producerName,
    contractVersion: input.contractVersion,
    policyVersion: input.policyVersion,
    generationId: input.generationId,
    batchId: input.batchId,
    facts: input.facts,
  };
}

function validatePayloadInput(input: FactBatchPayloadInput): void {
  const candidate: Record<string, unknown> = {
    ...(input as unknown as Record<string, unknown>),
    batchDigest: ZERO_DIGEST,
  };
  const checked = validateFactBatch(candidate);
  if (!checked.ok) {
    throw new BatchCodecError(
      "invalid-batch",
      `invalid fact batch payload: ${checked.errors.join("; ")}`,
    );
  }
}

/**
 * Compute the canonical SHA-256 hex digest of a typed fact batch payload.
 * Validates the envelope and every fact before hashing; byte-stable across
 * key order and sensitive to any fact, parent-order, OID-algorithm,
 * ref-observation-identity or relationship change.
 */
export function computeFactBatchDigest(input: FactBatchPayloadInput): string {
  validatePayloadInput(input);
  const payloadBytes = canonicalEncodeValue(canonicalPayloadEnvelope(input));
  return createHash("sha256").update(payloadBytes).digest("hex");
}

/**
 * Encode a validated FactBatchDto into its canonical wire bytes, verifying its
 * batchDigest (by default) and enforcing the 4 MiB ceiling before returning.
 */
export function encodeFactBatch(
  batch: FactBatchDto,
  options?: EncodeFactBatchOptions,
): EncodedFactBatch {
  const maxBytes = resolveMaxBytes(options?.maxBytes);
  const checked = validateFactBatch(batch);
  if (!checked.ok) {
    throw new BatchCodecError(
      "invalid-batch",
      `invalid fact batch: ${checked.errors.join("; ")}`,
    );
  }
  if (options?.verifyDigest !== false) {
    const expectedDigest = computeFactBatchDigest({
      scope: batch.scope,
      producerName: batch.producerName,
      contractVersion: batch.contractVersion,
      policyVersion: batch.policyVersion,
      generationId: batch.generationId,
      batchId: batch.batchId,
      facts: batch.facts,
    });
    if (batch.batchDigest !== expectedDigest) {
      throw new BatchCodecError(
        "digest-mismatch",
        `batch ${batch.batchId} digest does not match canonical batch bytes`,
      );
    }
  }
  const bytes = canonicalEncodeValue({
    codecVersion: BATCH_CODEC_VERSION,
    batch,
  });
  if (bytes.byteLength > maxBytes) {
    throw new BatchCodecError(
      "batch-too-large",
      `encoded batch ${batch.batchId} is ${bytes.byteLength} bytes, exceeding the ${maxBytes}-byte limit`,
      { byteLength: bytes.byteLength, maxBytes },
    );
  }
  return {
    codecVersion: BATCH_CODEC_VERSION,
    batchId: batch.batchId,
    batchDigest: batch.batchDigest,
    byteLength: bytes.byteLength,
    bytes,
  };
}

/**
 * Build a complete FactBatchDto with its canonical SHA-256 batchDigest and
 * wire encoding, refusing invalid facts or batches exceeding 4 MiB.
 */
export function buildFactBatch(
  input: FactBatchPayloadInput,
  options?: Pick<EncodeFactBatchOptions, "maxBytes">,
): BuiltFactBatch {
  const maxBytes = resolveMaxBytes(options?.maxBytes);
  const batchDigest = computeFactBatchDigest(input);
  const batch: FactBatchDto = deepCloneValue({
    scope: input.scope,
    producerName: input.producerName,
    contractVersion: input.contractVersion,
    policyVersion: input.policyVersion,
    generationId: input.generationId,
    batchId: input.batchId,
    batchDigest,
    facts: input.facts,
  });
  const encoded = encodeFactBatch(batch, { maxBytes, verifyDigest: true });
  return { batch, encoded };
}

/**
 * Decode canonical wire bytes back into a validated FactBatchDto, checking the
 * 4 MiB ceiling BEFORE JSON parsing and verifying the canonical digest.
 */
export function decodeFactBatch(
  bytes: Uint8Array,
  options?: DecodeFactBatchOptions,
): FactBatchDto {
  const maxBytes = resolveMaxBytes(options?.maxBytes);
  if (!(bytes instanceof Uint8Array)) {
    throw new BatchCodecError("invalid-encoding", "encoded batch must be a Uint8Array");
  }
  if (bytes.byteLength > maxBytes) {
    throw new BatchCodecError(
      "batch-too-large",
      `encoded batch is ${bytes.byteLength} bytes, exceeding the ${maxBytes}-byte limit`,
      { byteLength: bytes.byteLength, maxBytes },
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new BatchCodecError("invalid-encoding", "encoded batch is not valid UTF-8 JSON");
  }
  if (!isPlainRecord(parsed)) {
    throw new BatchCodecError("invalid-encoding", "encoded batch envelope must be an object");
  }
  const envelopeKeys = Object.keys(parsed);
  if (envelopeKeys.length !== 2 || !envelopeKeys.includes("codecVersion") || !envelopeKeys.includes("batch")) {
    throw new BatchCodecError("invalid-encoding", "encoded batch envelope must carry exact keys codecVersion and batch");
  }
  if (parsed.codecVersion !== BATCH_CODEC_VERSION) {
    throw new BatchCodecError(
      "unsupported-codec-version",
      `unsupported batch codec version "${String(parsed.codecVersion)}" (expected "${BATCH_CODEC_VERSION}")`,
    );
  }
  const decodedBatch = decodeCanonicalValue(parsed.batch, 1);
  const checked = validateFactBatch(decodedBatch);
  if (!checked.ok) {
    throw new BatchCodecError(
      "invalid-batch",
      `decoded fact batch is invalid: ${checked.errors.join("; ")}`,
    );
  }
  const batch = decodedBatch as FactBatchDto;
  const canonicalBytes = canonicalEncodeValue({
    codecVersion: BATCH_CODEC_VERSION,
    batch,
  });
  if (!bytesEqual(canonicalBytes, bytes)) {
    throw new BatchCodecError(
      "invalid-encoding",
      "encoded batch bytes are not in canonical wire form",
    );
  }
  const expectedDigest = computeFactBatchDigest({
    scope: batch.scope,
    producerName: batch.producerName,
    contractVersion: batch.contractVersion,
    policyVersion: batch.policyVersion,
    generationId: batch.generationId,
    batchId: batch.batchId,
    facts: batch.facts,
  });
  if (batch.batchDigest !== expectedDigest) {
    throw new BatchCodecError(
      "digest-mismatch",
      `decoded batch ${batch.batchId} digest does not match canonical batch bytes`,
    );
  }
  return batch;
}

/**
 * Single pre-delivery gate: validates the batch, verifies its canonical digest,
 * encodes the full batch and enforces the 4 MiB ceiling BEFORE invoking
 * sink.deliver. An oversized or invalid batch never reaches the sink and zero
 * prefix is ever emitted or acknowledged.
 */
export async function deliverCheckedFactBatch<TReceipt>(
  batch: FactBatchDto,
  sink: BatchDeliveryPort<TReceipt>,
  options?: EncodeFactBatchOptions,
): Promise<DeliverEncodedBatchResult<TReceipt>> {
  const isolatedBatch = deepCloneValue(batch);
  const encoded = encodeFactBatch(isolatedBatch, options);
  const deliveryEncoded: EncodedFactBatch = {
    codecVersion: encoded.codecVersion,
    batchId: encoded.batchId,
    batchDigest: encoded.batchDigest,
    byteLength: encoded.byteLength,
    bytes: Uint8Array.from(encoded.bytes),
  };
  const receipt = await sink.deliver(deepCloneValue(isolatedBatch), deliveryEncoded);
  if (
    typeof receipt === "object" &&
    receipt !== null &&
    "batchId" in receipt &&
    (receipt as { batchId?: unknown }).batchId !== isolatedBatch.batchId
  ) {
    throw new BatchCodecError(
      "receipt-mismatch",
      `sink receipt batchId does not match delivered batch ${isolatedBatch.batchId}`,
    );
  }
  return { batch: isolatedBatch, encoded, receipt };
}
