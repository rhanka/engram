import { receiptDigest } from "./digests.js";
import type {
  CanonicalMemoryStorePort,
  CanonicalTransactionReceiptV1,
  ClockPort,
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
  /**
   * X2 tour 4 (MINEUR-4): the engine passes its clock so the deadline is enforced BEFORE the
   * acknowledgement transaction, not after. Direct callers that omit it keep the previous behavior
   * (the engine's per-round check still bounds the call).
   */
  clock?: ClockPort;
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
  const appliedBatch = await applyProjectionBatchV1({ store: input.store, surfaces: input.surfaces, batch: batch.value });
  if (!appliedBatch.ok) return appliedBatch;
  const { batch: settled, receipt } = appliedBatch.value;
  // X2 tour 4 (MINEUR-4): the deadline is enforced BEFORE the acknowledgement transaction — a round
  // that overran it applied private artifacts but must never publish them into a success receipt.
  // Instants are fixed-width UTC, so lexicographic order is chronological order.
  if (input.clock !== undefined && input.clock.now() >= input.deadline_at) {
    return { ok: false, error: { code: "DEADLINE_EXCEEDED", operation: "projection_invalidate", message: "invalidation deadline elapsed before publication", retryable: false } };
  }
  const acknowledgement = await input.store.acknowledgeProjection(receipt);
  if (!acknowledgement.ok) return acknowledgement;
  return { ok: true, value: { batch: settled, receipt, acknowledgement: acknowledgement.value } };
}

export interface ProjectionBatchPublicationInputV1 {
  store: CanonicalMemoryStorePort;
  surfaces: ReadonlyArray<ProjectionInvalidationSurfaceV1>;
  batch: ProjectionBatchV1;
}

export interface ProjectionBatchPublicationV1 {
  batch: ProjectionBatchV1;
  receipt: ProjectionInvalidationReceiptV1;
}

/**
 * Applies ONE already-read batch to every surface and folds the acknowledgements into a receipt —
 * without acknowledging it. The engine's publication phase (X2 tour 5, invisible replay) drives one
 * call per buffered batch and acknowledges only after the final deadline check; the single-round
 * cascade above keeps its read → apply → pre-acknowledgement-check → acknowledge order.
 */
export async function applyProjectionBatchV1(
  input: ProjectionBatchPublicationInputV1,
): Promise<Result<ProjectionBatchPublicationV1>> {
  if (input.surfaces.length === 0) return refusal("cascade requires at least one derived projection surface", "INVALID_SCHEMA");
  const ids = new Set<string>();
  for (const surface of input.surfaces) {
    if (ids.has(surface.projection_id)) return refusal("cascade surfaces must have distinct projection ids", "INVALID_SCHEMA");
    ids.add(surface.projection_id);
  }
  // X2 tour 4 (MAJEUR-1, normative §4): the tombstone filter is evaluated when the surface APPLIES
  // the batch, not when it was read. A batch read before a concurrent tombstone commit still carries
  // the record in `records`; settling it here — after the last await before publication — strips any
  // record tombstoned as of now into `removals` (reason `memory:tombstoned`), over the existing store
  // contract (readJournal fold, no new method). A guard failure keeps the batch as read: the store's
  // read-time filter already applied, so the guard can only remove more, never less.
  const settled = await settleBatchAtApplyTime(input, input.batch);
  if (!settled.ok) return settled;
  const through = settled.value.through_cursor_inclusive;

  const receipts: Array<{ projection_id: string; cursor: Cursor; digest: import("./contracts/index.js").Digest }> = [];
  let complete = true;
  for (const surface of input.surfaces) {
    let applied: Awaited<ReturnType<ProjectionInvalidationSurfaceV1["invalidate"]>>;
    try {
      applied = await surface.invalidate(settled.value);
    } catch {
      // X2 resume (tour 3, normative §5): an untyped surface exception is an uncertain outcome, never a
      // certification. No acknowledgement is created for the attempted work; committed progress survives.
      return { ok: false, error: { code: "PROJECTION_STALE", operation: "projection_invalidate", message: "projection surface did not return a typed result", retryable: false } };
    }
    if (!applied.ok) {
      // X2 resume (tour 3, normative §5): a surface NOT_FOUND certifies nothing about the journal — only the
      // store's explicit exhaustion result denotes outbox exhaustion. It becomes PROJECTION_STALE so the
      // caller can never read it as journal exhaustion or acknowledge the attempted range.
      if (applied.error.code === "NOT_FOUND") {
        return { ok: false, error: { code: "PROJECTION_STALE", operation: "projection_invalidate", message: applied.error.message, retryable: false } };
      }
      return applied;
    }
    if (applied.value.projection_id !== surface.projection_id) return refusal("surface returned a foreign projection id");
    if (applied.value.cursor !== through) complete = false;
    receipts.push({ projection_id: applied.value.projection_id, cursor: applied.value.cursor, digest: applied.value.digest });
  }
  const ordered = [...receipts].sort((left, right) => left.projection_id.localeCompare(right.projection_id));
  const body = { through_cursor: through, projection_receipts: ordered, complete };
  const receipt: ProjectionInvalidationReceiptV1 = { ...body, receipt_digest: receiptDigest("projection-invalidation", body) };
  return { ok: true, value: { batch: settled.value, receipt } };
}

/**
 * X2 tour 4 (MAJEUR-1): re-settles a read batch at apply time. The tombstone filter is evaluated
 * now — not when the batch was read — by folding the journal's last `to_state` per record carried in
 * `records` (tombstoned is terminal, so last `to_state === "tombstoned"` means currently tombstoned).
 * A record tombstoned since the read moves to `removals` (`memory:tombstoned`) and the batch digest
 * is recomputed. Over the existing store contract only (`readJournal`, like the engine's own fold).
 * If the journal cannot be fully observed (truncated page, failure), the batch keeps its read-time
 * settlement: the store's read-time filter already applied, so the guard can only remove more.
 */
async function settleBatchAtApplyTime(
  input: { store: CanonicalMemoryStorePort },
  batch: ProjectionBatchV1,
): Promise<Result<ProjectionBatchV1>> {
  if (batch.records.length === 0) return { ok: true, value: batch };
  const wanted = new Set(batch.records.map((record) => record.record_id));
  const lastState = new Map<string, string>();
  const PAGE = 2_000;
  let after: Cursor = "0";
  for (;;) {
    let page: Awaited<ReturnType<CanonicalMemoryStorePort["readJournal"]>>;
    try {
      page = await input.store.readJournal({ after, limit: PAGE });
    } catch {
      return { ok: true, value: batch };
    }
    if (!page.ok) return { ok: true, value: batch };
    for (const event of page.value) {
      if (event.record_id !== undefined && wanted.has(event.record_id)) lastState.set(event.record_id, event.to_state);
      after = event.cursor;
    }
    // A full page may hide a longer journal: without the complete fold, keep the read settlement.
    if (page.value.length < PAGE) break;
    return { ok: true, value: batch };
  }
  const tombstoned = [...wanted].filter((recordId) => lastState.get(recordId) === "tombstoned");
  if (tombstoned.length === 0) return { ok: true, value: batch };
  const tombstonedSet = new Set(tombstoned);
  const knownRemovals = new Set(batch.removals.map((removal) => removal.record_id));
  const records = batch.records.filter((record) => !tombstonedSet.has(record.record_id));
  const removals = [
    ...batch.removals,
    ...[...tombstonedSet].filter((recordId) => !knownRemovals.has(recordId)).map((record_id) => ({ record_id, reason_ref: "memory:tombstoned" })),
  ].sort((left, right) => left.record_id.localeCompare(right.record_id));
  const body = { from_cursor_exclusive: batch.from_cursor_exclusive, through_cursor_inclusive: batch.through_cursor_inclusive, records, removals };
  return { ok: true, value: { ...body, batch_digest: receiptDigest("projection-batch", body) } };
}
