import { describe, expect, it } from "vitest";

import { DIGEST, captureRequest, createL3Memory } from "./memory-l3-fixture.js";

describe("memory quarantine", () => {
  it("pending plaintext is absent from every non-envelope surface and rejected key destruction is idempotent", async () => {
    const { memory, store, destroyed } = createL3Memory("reject");
    const secret = "PENDING-PLAINTEXT-MUST-NOT-ESCAPE";
    const captured = await memory.capture(captureRequest("idempotency-key-quarantine-0001", "1", secret));
    expect(captured).toMatchObject({ ok: true, value: { status: "committed_pending", cursor: "1" } });
    if (!captured.ok || captured.value.candidate_id === undefined) return;

    const journal = await store.readJournal({ after: "0", limit: 10 });
    const snapshot = await store.acceptedSnapshot({ valid_as_of: 1, system_as_of: "1", authorization_receipt_digest: DIGEST, max_candidates: 10 });
    const checkpoint = store.exportCheckpointForRecovery("1");
    expect(journal).toMatchObject({ ok: true, value: { length: 1 } });
    expect(snapshot).toMatchObject({ ok: true, value: { documents: [] } });
    expect(checkpoint).toMatchObject({ ok: true });
    const nonEnvelopeSurfaces = JSON.stringify({ journal, snapshot, manifest: checkpoint.ok ? checkpoint.value.manifest : undefined, controls: checkpoint.ok ? checkpoint.value.controls : undefined, store });
    expect(nonEnvelopeSurfaces).not.toContain(secret);
    expect(nonEnvelopeSurfaces).not.toContain("l3#one");

    const request = { candidate_id: captured.value.candidate_id, authorization: { credential: "credential:l3" }, deadline_at: "2026-08-16T12:40:00.000Z" };
    const rejection = await memory.requestAdmission(request);
    expect(rejection).toEqual({ ok: true, value: expect.objectContaining({ status: "rejected", cursor: "2" }) });
    await expect(memory.requestAdmission(request)).resolves.toMatchObject({ ok: true, value: { status: "rejected", cursor: "2" } });
    expect(destroyed).toHaveLength(1);
    expect(destroyed[0]).toMatch(/^key:/);
    const rejected = store.exportCheckpointForRecovery("2");
    expect(rejected).toMatchObject({ ok: true, value: { envelopes: [] } });
    expect(JSON.stringify(rejected)).not.toContain(secret);
  });
});
