import { canonicalizeJcs } from "./canonical-json.js";
import { receiptDigest } from "./digests.js";
import type {
  BoundedCurrentProjectionV1,
  BoundedProjectionExportV1,
  BoundedProjectionObjectV1,
  Cursor,
  Digest,
  MemoryOperation,
  MemoryProjectionEnvelopeV2,
  OpaqueRef,
  ProjectionOmissionReason,
  Result,
  ValidIntervalV1,
} from "./contracts/index.js";

/**
 * The raw-byte merge ceiling from `src/merge-driver.ts` (`50 * 1024 * 1024`).
 * A bounded current projection is accepted at exactly this size and refused at
 * one byte more; it is never silently truncated to fit.
 */
export const MEMORY_PROJECTION_RAW_BYTE_CEILING = 52_428_800;

const OMISSION_REASONS: ReadonlyArray<ProjectionOmissionReason> = [
  "pending", "rejected", "withdrawn", "accepted_disputed",
  "historical", "expired", "trust_invalid", "tombstoned",
];

/** A current accepted record reduced to only the fields a projection may carry. */
export interface BoundedProjectionEntryV1 {
  node_id: string;
  record_id: string;
  record_digest: Digest;
  scope_ref: OpaqueRef;
  valid_time: ValidIntervalV1;
  projection_cursor: Cursor;
  citation_refs: ReadonlyArray<OpaqueRef>;
}

export interface BoundedProjectionInputV1 {
  high_water_cursor: Cursor;
  projection_cursor: Cursor;
  current: ReadonlyArray<BoundedProjectionEntryV1>;
  omitted: ReadonlyArray<{ record_id: string; reason: ProjectionOmissionReason }>;
}

function refusal<T>(operation: MemoryOperation, code: "PROJECTION_OVERSIZED" | "INVALID_SCHEMA", message: string): Result<T> {
  return { ok: false, error: { code, operation, message, retryable: false } };
}

/** Builds one neutral, verifiable current-projection envelope for a record. */
export function boundedProjectionEnvelopeV2(entry: BoundedProjectionEntryV1): MemoryProjectionEnvelopeV2 {
  const body = {
    schema_version: 2 as const,
    record_id: entry.record_id,
    record_digest: entry.record_digest,
    scope_ref: entry.scope_ref,
    valid_time: { t: entry.valid_time.t, ...(entry.valid_time.t_end === undefined ? {} : { t_end: entry.valid_time.t_end }) },
    projection_cursor: entry.projection_cursor,
  };
  return { ...body, envelope_digest: receiptDigest("projection-envelope", body, "envelope_digest") };
}

function projectionObject(entry: BoundedProjectionEntryV1): BoundedProjectionObjectV1 {
  return { node_id: entry.node_id, projection: boundedProjectionEnvelopeV2(entry), citation_refs: [...entry.citation_refs] };
}

/**
 * Assembles the bounded current projection. It contains only current accepted
 * projection envelopes, their citation references, and projection metadata; it
 * carries no record bodies, pending data, journal events, or receipts. Object
 * order is deterministic by node id so the digest is stable.
 */
export function buildBoundedCurrentProjectionV1(input: BoundedProjectionInputV1): BoundedCurrentProjectionV1 {
  const objects = input.current
    .map(projectionObject)
    .sort((left, right) => left.node_id.localeCompare(right.node_id));
  const body = {
    schema_version: 1 as const,
    projection_schema_version: 1 as const,
    high_water_cursor: input.high_water_cursor,
    projection_cursor: input.projection_cursor,
    objects,
  };
  return { ...body, projection_digest: receiptDigest("bounded-current-projection", body, "projection_digest") };
}

/** The exact UTF-8 byte length of the canonical raw projection, as a merge-driver would measure it. */
export function measureRawProjectionBytesV1(projection: BoundedCurrentProjectionV1): number {
  return new TextEncoder().encode(canonicalizeJcs(projection)).byteLength;
}

function countOmissions(omitted: BoundedProjectionInputV1["omitted"]): Record<ProjectionOmissionReason, number> {
  const counts = Object.fromEntries(OMISSION_REASONS.map((reason) => [reason, 0])) as Record<ProjectionOmissionReason, number>;
  for (const entry of omitted) counts[entry.reason] += 1;
  return counts;
}

/**
 * Produces the bounded export manifest. It refuses — without dropping any
 * current entry — when the raw projection exceeds the merge ceiling, so a
 * caller can never mistake a silently truncated projection for a complete one.
 */
export function exportBoundedCurrentProjectionV1(input: BoundedProjectionInputV1): Result<BoundedProjectionExportV1> {
  const ids = new Set<string>();
  for (const entry of input.current) {
    if (ids.has(entry.node_id)) return refusal("projection_invalidate", "INVALID_SCHEMA", "bounded projection has a duplicate node id");
    ids.add(entry.node_id);
  }
  const projection = buildBoundedCurrentProjectionV1(input);
  const rawByteSize = measureRawProjectionBytesV1(projection);
  if (rawByteSize > MEMORY_PROJECTION_RAW_BYTE_CEILING) {
    return refusal(
      "projection_invalidate",
      "PROJECTION_OVERSIZED",
      `bounded current projection of ${projection.objects.length} objects is ${rawByteSize} bytes, exceeds the ${MEMORY_PROJECTION_RAW_BYTE_CEILING}-byte ceiling; refused without omitting any current entry`,
    );
  }
  const omittedByReason = countOmissions(input.omitted);
  const body = {
    schema_version: 1 as const,
    projection_schema_version: 1 as const,
    high_water_cursor: input.high_water_cursor,
    projection_cursor: input.projection_cursor,
    included_count: projection.objects.length,
    omitted_total: input.omitted.length,
    omitted_by_reason: omittedByReason,
    raw_byte_size: rawByteSize,
    raw_byte_ceiling: MEMORY_PROJECTION_RAW_BYTE_CEILING,
    projection,
    projection_digest: projection.projection_digest,
  };
  return { ok: true, value: { ...body, export_digest: receiptDigest("bounded-projection-export", body, "export_digest") } };
}

/**
 * A deterministic synthetic fixture that produces a bounded current projection
 * whose canonical raw size is exactly `targetBytes`. It pads one citation
 * reference with a fixed filler so the size is reproducible and independent of
 * any dirty working artifact.
 */
export function syntheticBoundedProjectionInputAtBytesV1(targetBytes: number): BoundedProjectionInputV1 {
  const digest = `sha256:${"0".repeat(64)}` as Digest;
  const base = (filler: string): BoundedProjectionInputV1 => ({
    high_water_cursor: "2",
    projection_cursor: "2",
    current: [{
      node_id: "node:current:0001",
      record_id: "mem_current_0001",
      record_digest: digest,
      scope_ref: "scope:bounded",
      valid_time: { t: 1 },
      projection_cursor: "2",
      citation_refs: filler === "" ? ["source:bounded"] : ["source:bounded", filler],
    }],
    omitted: [
      { record_id: "mem_pending_0001", reason: "pending" },
      { record_id: "mem_tombstoned_0001", reason: "tombstoned" },
    ],
  });
  const empty = measureRawProjectionBytesV1(buildBoundedCurrentProjectionV1(base("")));
  // The empty base already carries a first citation ref; the filler element adds
  // its own quotes plus a comma. Measure that fixed overhead, then pad by bytes.
  const oneByteFiller = measureRawProjectionBytesV1(buildBoundedCurrentProjectionV1(base("x")));
  const fillerOverhead = oneByteFiller - empty; // bytes added by an "x" filler element (quotes + comma + one char)
  const remaining = targetBytes - empty - (fillerOverhead - 1);
  if (remaining < 1) throw new Error(`synthetic bounded projection target ${targetBytes} is below the minimum representable size ${empty + fillerOverhead}`);
  return base("x".repeat(remaining));
}
