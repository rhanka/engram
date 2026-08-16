import { describe, expect, it } from "vitest";

import { receiptDigest } from "../graphify-memory/index.js";
import { DIGEST, NOW, captureRequest, createL3Memory, lifecycleCommand } from "./memory-l3-fixture.js";

describe("memory lifecycle", () => {
  it("every unlisted transition fails before cursor allocation and pending/disputed/historical visibility follows authorization", async () => {
    const { memory, store } = createL3Memory();
    const captured = await memory.capture(captureRequest("idempotency-key-lifecycle-0001", "1"));
    expect(captured).toMatchObject({ ok: true, value: { status: "committed_pending" } });
    if (!captured.ok || captured.value.candidate_id === undefined) return;
    const admitted = await memory.requestAdmission({ candidate_id: captured.value.candidate_id, authorization: { credential: "credential:l3" }, deadline_at: "2026-08-16T12:40:00.000Z" });
    expect(admitted).toMatchObject({ ok: true, value: { status: "accepted" } });
    if (!admitted.ok || admitted.value.record_id === undefined) return;

    const beforeIllegal = await store.readJournal({ after: "0", limit: 10 });
    expect(beforeIllegal).toMatchObject({ ok: true, value: { length: 2 } });
    await expect(memory.transition(lifecycleCommand("resolve_dispute", admitted.value.record_id))).resolves.toMatchObject({ ok: false, error: { code: "ILLEGAL_TRANSITION" } });
    await expect(store.readJournal({ after: "0", limit: 10 })).resolves.toMatchObject({ ok: true, value: { length: 2 } });

    await expect(memory.transition(lifecycleCommand("dispute", admitted.value.record_id))).resolves.toMatchObject({ ok: true, value: { from_state: "accepted_current", to_state: "accepted_disputed", cursor: "3" } });
    const current = await store.revalidate({ record_ids: [admitted.value.record_id], valid_as_of: 1, system_as_of: "3", authorization_receipt_digest: DIGEST, operation: "recall_current" });
    expect(current).toMatchObject({ ok: true, value: { eligible_record_ids: [], removed: [{ record_id: admitted.value.record_id, reason: "state" }] } });
    const disputed = await store.revalidate({ record_ids: [admitted.value.record_id], valid_as_of: 1, system_as_of: "3", authorization_receipt_digest: DIGEST, operation: "recall_disputed" });
    expect(disputed).toMatchObject({ ok: true, value: { eligible_record_ids: [admitted.value.record_id] } });

    await expect(memory.transition(lifecycleCommand("resolve_dispute", admitted.value.record_id, "event:resolve-dispute"))).resolves.toMatchObject({ ok: true, value: { cursor: "4", to_state: "accepted_current" } });
    await expect(memory.transition(lifecycleCommand("mark_non_current", admitted.value.record_id))).resolves.toMatchObject({ ok: true, value: { cursor: "5", to_state: "historical" } });
    const historical = await store.revalidate({ record_ids: [admitted.value.record_id], valid_as_of: 1, system_as_of: "5", authorization_receipt_digest: DIGEST, operation: "recall_history" });
    expect(historical).toMatchObject({ ok: true, value: { eligible_record_ids: [admitted.value.record_id] } });
    await expect(store.revalidate({ record_ids: [admitted.value.record_id], valid_as_of: 1, system_as_of: "5", authorization_receipt_digest: DIGEST, operation: "recall_current" })).resolves.toMatchObject({
      ok: true,
      value: { eligible_record_ids: [], removed: [{ record_id: admitted.value.record_id, reason: "state" }] },
    });

    const pending = await memory.capture(captureRequest("idempotency-key-lifecycle-0002", "2", "pending-only"));
    expect(pending).toMatchObject({ ok: true, value: { status: "committed_pending", cursor: "6" } });
    const snapshot = await store.acceptedSnapshot({ valid_as_of: 1, system_as_of: "6", authorization_receipt_digest: receiptDigest("fixture-auth", { now: NOW }), max_candidates: 10 });
    expect(snapshot).toMatchObject({ ok: true, value: { documents: [] } });
  });
});
