import { normalizeCanonicalJson, type CanonicalJsonValue } from "./canonical-json.js";
import { receiptDigest } from "./digests.js";
import { isCanonicalCursor } from "./validation.js";
import type { MemoryProjectionEnvelopeV2, ProjectedObjectV2 } from "./contracts/index.js";

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

type JsonObject = Record<string, CanonicalJsonValue>;

function exactObject(value: unknown, keys: readonly string[]): JsonObject | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const object = value as JsonObject;
  const actual = Object.keys(object);
  return actual.length === keys.length && actual.every((key) => keys.includes(key)) ? object : undefined;
}

function opaque(value: unknown): value is string {
  return typeof value === "string" && new TextEncoder().encode(value).byteLength >= 1 && new TextEncoder().encode(value).byteLength <= 512;
}

function isEnvelope(input: unknown): input is MemoryProjectionEnvelopeV2 {
  let value: CanonicalJsonValue;
  try {
    value = normalizeCanonicalJson(input);
  } catch {
    return false;
  }
  const envelope = exactObject(value, ["schema_version", "record_id", "record_digest", "scope_ref", "valid_time", "projection_cursor", "envelope_digest"]);
  const validTime = envelope === undefined ? undefined : exactObject(envelope.valid_time, ["t", "t_end"])
    ?? exactObject(envelope.valid_time, ["t"]);
  const validStart = validTime?.t;
  const validEnd = validTime?.t_end;
  if (envelope === undefined || envelope.schema_version !== 2 || !opaque(envelope.record_id) || !DIGEST_PATTERN.test(String(envelope.record_digest))
    || !opaque(envelope.scope_ref) || validTime === undefined || typeof validStart !== "number" || !Number.isSafeInteger(validStart)
    || (Object.hasOwn(validTime, "t_end") && (typeof validEnd !== "number" || !Number.isSafeInteger(validEnd) || validEnd < validStart))
    || !isCanonicalCursor(envelope.projection_cursor) || !DIGEST_PATTERN.test(String(envelope.envelope_digest))) return false;
  return envelope.envelope_digest === receiptDigest("projection-envelope", envelope as unknown as Record<string, unknown>);
}

/** Pure structural invariant: projected data has a valid canonical envelope and no body-shaped extras. */
export function hasProjectionEnvelope(value: unknown): value is ProjectedObjectV2 {
  let normalized: CanonicalJsonValue;
  try {
    normalized = normalizeCanonicalJson(value);
  } catch {
    return false;
  }
  const node = exactObject(normalized, ["node_id", "projection"]);
  const edge = exactObject(normalized, ["edge_id", "source_node_id", "target_node_id", "projection"]);
  const vector = exactObject(normalized, ["vector_id", "projection"]);
  if (node !== undefined) return opaque(node.node_id) && isEnvelope(node.projection);
  if (edge !== undefined) return opaque(edge.edge_id) && opaque(edge.source_node_id) && opaque(edge.target_node_id) && isEnvelope(edge.projection);
  return vector !== undefined && opaque(vector.vector_id) && isEnvelope(vector.projection);
}
