import { describe, expect, it } from "vitest";

import {
  runProjectionInvalidationCascadeV1,
  type ProjectionBatchV1,
  type ProjectionInvalidationSurfaceV1,
} from "../graphify-memory/index.js";
import { captureRequest, createL3Memory, lifecycleCommand } from "./memory-l3-fixture.js";

const DEADLINE = "2026-08-16T12:40:00.000Z";

/** A derived projection surface that records the removals it was asked to invalidate. */
function recordingSurface(projection_id: string): ProjectionInvalidationSurfaceV1 & { removed: string[] } {
  const removed: string[] = [];
  return {
    projection_id,
    removed,
    async invalidate(batch: ProjectionBatchV1) {
      for (const removal of batch.removals) removed.push(removal.record_id);
      return { ok: true as const, value: { projection_id, cursor: batch.through_cursor_inclusive, digest: `sha256:${"0".repeat(64)}` as const } };
    },
  };
}

describe("projection invalidation cascade", () => {
  it("tombstone invalidates FTS nodes edges vectors caches aggregates and exports through one cursor receipt", async () => {
    const { memory, store } = createL3Memory();
    const captured = await memory.capture(captureRequest("idempotency-key-cascade-0001", "1"));
    expect(captured).toMatchObject({ ok: true, value: { status: "committed_pending" } });
    if (!captured.ok || captured.value.candidate_id === undefined) return;
    const admitted = await memory.requestAdmission({ candidate_id: captured.value.candidate_id, authorization: { credential: "credential:l3" }, deadline_at: DEADLINE });
    expect(admitted).toMatchObject({ ok: true, value: { status: "accepted" } });
    if (!admitted.ok || admitted.value.record_id === undefined) return;
    const recordId = admitted.value.record_id;

    const tombstoned = await memory.transition(lifecycleCommand("tombstone", recordId));
    expect(tombstoned).toMatchObject({ ok: true, value: { to_state: "tombstoned", operation: "tombstone" } });
    if (!tombstoned.ok) return;
    const tombstoneCursor = tombstoned.value.cursor;

    const surfaces = ["fts", "nodes", "edges", "vectors", "caches", "aggregates", "exports"].map(recordingSurface);

    // Acknowledge everything after the acceptance cursor so the removal batch is the tombstone.
    const cascade = await runProjectionInvalidationCascadeV1({
      store,
      surfaces,
      after_cursor: "2",
      deadline_at: DEADLINE,
    });
    expect(cascade.ok).toBe(true);
    if (!cascade.ok) return;

    // The removal reached every derived surface exactly once, for the tombstoned record.
    for (const surface of surfaces) {
      expect(surface.removed).toEqual([recordId]);
    }

    // ONE cursor-acknowledged receipt covers all seven surfaces at the tombstone cursor.
    expect(cascade.value.receipt.through_cursor).toBe(tombstoneCursor);
    expect(cascade.value.receipt.complete).toBe(true);
    expect(cascade.value.receipt.projection_receipts.map((entry) => entry.projection_id).sort()).toEqual(
      ["aggregates", "caches", "edges", "exports", "fts", "nodes", "vectors"],
    );
    expect(new Set(cascade.value.receipt.projection_receipts.map((entry) => entry.cursor))).toEqual(new Set([tombstoneCursor]));
    expect(cascade.value.acknowledgement.operation).toBe("projection_invalidate");
    expect(cascade.value.acknowledgement.cursor).toBe(tombstoneCursor);
    expect(cascade.value.acknowledgement.state_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});
