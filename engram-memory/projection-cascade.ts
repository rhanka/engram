import { receiptDigest } from "./digests.js";
import type {
  CanonicalMemoryStorePort,
  CanonicalTransactionReceiptV1,
  Cursor,
  Instant,
  ProjectionBatchV1,
  ProjectionInvalidationReceiptV1,
  ProjectionInvalidationSurfaceV1,
  Result,
} from "./contracts/index.js";

export interface ProjectionInvalidationCascadeInputV1 {
  store: CanonicalMemoryStorePort;
  surfaces: ReadonlyArray<ProjectionInvalidationSurfaceV1>;
  after_cursor: Cursor;
  limit?: number;
  deadline_at: Instant;
}

export interface ProjectionInvalidationCascadeResultV1 {
  batch: ProjectionBatchV1;
  receipt: ProjectionInvalidationReceiptV1;
  acknowledgement: CanonicalTransactionReceiptV1;
}

function refusal<T>(message: string, code: "PROJECTION_STALE" | "INVALID_SCHEMA" = "PROJECTION_STALE"): Result<T> {
  return { ok: false, error: { code, operation: "projection_invalidate", message, retryable: false } };
}

/**
 * Drives a tombstone, expiry, or withdrawal removal batch into every derived
 * projection surface — FTS, nodes, edges, vectors, caches, aggregates, and
 * exports — and folds the per-surface acknowledgements into ONE
 * cursor-acknowledged receipt. Every surface must acknowledge the same
 * `through_cursor`; a lagging surface leaves the receipt incomplete rather than
 * silently dropping influence.
 */
export async function runProjectionInvalidationCascadeV1(
  input: ProjectionInvalidationCascadeInputV1,
): Promise<Result<ProjectionInvalidationCascadeResultV1>> {
  if (input.surfaces.length === 0) return refusal("cascade requires at least one derived projection surface", "INVALID_SCHEMA");
  const ids = new Set<string>();
  for (const surface of input.surfaces) {
    if (ids.has(surface.projection_id)) return refusal("cascade surfaces must have distinct projection ids", "INVALID_SCHEMA");
    ids.add(surface.projection_id);
  }
  const batch = await input.store.nextProjectionBatch({ after: input.after_cursor, limit: input.limit ?? 2_000 });
  if (!batch.ok) return batch;
  const through = batch.value.through_cursor_inclusive;

  const receipts: Array<{ projection_id: string; cursor: Cursor; digest: import("./contracts/index.js").Digest }> = [];
  let complete = true;
  for (const surface of input.surfaces) {
    const applied = await surface.invalidate(batch.value);
    if (!applied.ok) return applied;
    if (applied.value.projection_id !== surface.projection_id) return refusal("surface returned a foreign projection id");
    if (applied.value.cursor !== through) complete = false;
    receipts.push({ projection_id: applied.value.projection_id, cursor: applied.value.cursor, digest: applied.value.digest });
  }
  const ordered = [...receipts].sort((left, right) => left.projection_id.localeCompare(right.projection_id));
  const body = { through_cursor: through, projection_receipts: ordered, complete };
  const receipt: ProjectionInvalidationReceiptV1 = { ...body, receipt_digest: receiptDigest("projection-invalidation", body) };
  const acknowledgement = await input.store.acknowledgeProjection(receipt);
  if (!acknowledgement.ok) return acknowledgement;
  return { ok: true, value: { batch: batch.value, receipt, acknowledgement: acknowledgement.value } };
}
