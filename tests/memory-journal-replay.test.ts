import { describe, expect, it } from "vitest";

import {
  createInMemoryCanonicalMemoryStoreV1,
  foldMemoryJournalV1,
  memoryJournalEventHashV1,
  type MemoryJournalEventV1,
} from "../graphify-memory/index.js";
import { captureRequest, createL3Memory, lifecycleCommand } from "./memory-l3-fixture.js";

const DIGEST = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const NOW = "2026-08-16T12:34:56.789Z";

function event(eventId: string, cursor: string, previousEventHash: string): MemoryJournalEventV1 {
  const body = {
    schema_version: 1,
    event_id: eventId,
    cursor,
    recorded_at: NOW,
    operation: "capture",
    candidate_id: `candidate:${eventId}`,
    to_state: "pending",
    authorization_receipt_digest: DIGEST,
    previous_event_hash: previousEventHash as typeof DIGEST,
  };
  return { ...body, event_hash: memoryJournalEventHashV1(body) };
}

describe("memory journal replay", () => {
  it("checkpoint-tail and genesis yield the same canonical state digest", () => {
    const first = event("event:one", "1", `sha256:${"0".repeat(64)}`);
    const second = event("event:two", "2", first.event_hash);
    const genesis = foldMemoryJournalV1({ journal: [first, second] });
    expect(genesis).toMatchObject({ ok: true });
    if (!genesis.ok) return;

    const store = createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => NOW } });
    const checkpoint = store.exportCheckpointForRecovery("1", [first]);
    expect(checkpoint).toMatchObject({ ok: true });
    if (!checkpoint.ok) return;

    const recovered = foldMemoryJournalV1({ checkpoint: checkpoint.value, tail: [second] });
    expect(recovered).toMatchObject({ ok: true });
    if (!recovered.ok) return;
    expect(recovered.value.canonical_state_digest).toBe(genesis.value.canonical_state_digest);
  });

  it("tombstoned record cannot be resurrected by rewind or later accept", async () => {
    const { memory, store } = createL3Memory();
    const captured = await memory.capture(captureRequest("idempotency-key-l3-0001", "1"));
    expect(captured).toMatchObject({ ok: true, value: { status: "committed_pending" } });
    if (!captured.ok || captured.value.candidate_id === undefined) return;
    const admitted = await memory.requestAdmission({ candidate_id: captured.value.candidate_id, authorization: { credential: "credential:l3" }, deadline_at: "2026-08-16T12:40:00.000Z" });
    expect(admitted).toMatchObject({ ok: true, value: { status: "accepted" } });
    if (!admitted.ok || admitted.value.record_id === undefined) return;

    await expect(memory.transition(lifecycleCommand("tombstone", admitted.value.record_id))).resolves.toMatchObject({ ok: true, value: { to_state: "tombstoned" } });
    await expect(memory.transition({
      operation: "rewind",
      event_id: "event:rewind",
      record_id: admitted.value.record_id,
      related_record_id: admitted.value.record_id,
      reason_ref: "reason:rewind",
      event_anchor: { occurred_at: NOW, kind_ref: "kind:rewind", provenance_ref: "citation:l3", provenance_digest: DIGEST },
      authorization: { credential: "credential:l3" },
      deadline_at: NOW.replace("12:34:56", "12:40:00"),
    })).resolves.toMatchObject({ ok: false, error: { code: "ILLEGAL_TRANSITION" } });
    await expect(store.revalidate({ record_ids: [admitted.value.record_id], valid_as_of: 1, system_as_of: "3", authorization_receipt_digest: DIGEST, operation: "recall_history" })).resolves.toMatchObject({
      ok: true,
      value: { eligible_record_ids: [], removed: [{ record_id: admitted.value.record_id, reason: "tombstone" }] },
    });
    const tombstoned = store.exportCheckpointForRecovery("3");
    expect(tombstoned).toMatchObject({ ok: true });
    if (!tombstoned.ok) return;
    const acceptance = tombstoned.value.journal[1]!;
    const tombstone = tombstoned.value.journal[2]!;
    const lateAcceptanceBody = {
      ...acceptance,
      event_id: "event:late-accept",
      cursor: "4",
      previous_event_hash: tombstone.event_hash,
    };
    const lateAcceptance = { ...lateAcceptanceBody, event_hash: memoryJournalEventHashV1(lateAcceptanceBody) };
    expect(foldMemoryJournalV1({ journal: [...tombstoned.value.journal, lateAcceptance], records: tombstoned.value.records })).toMatchObject({
      ok: true,
      value: { records: expect.arrayContaining([expect.objectContaining({ record_id: admitted.value.record_id, state: "tombstoned", terminal: true })]) },
    });
  });

  it("gap hash break missing blob or digest drift stops readiness", async () => {
    const { memory, store } = createL3Memory();
    const captured = await memory.capture(captureRequest("idempotency-key-replay-0001", "1"));
    if (!captured.ok || captured.value.candidate_id === undefined) throw new Error("capture fixture failed");
    const admitted = await memory.requestAdmission({ candidate_id: captured.value.candidate_id, authorization: { credential: "credential:l3" }, deadline_at: "2026-08-16T12:40:00.000Z" });
    if (!admitted.ok) throw new Error("admission fixture failed");
    const checkpoint = store.exportCheckpointForRecovery("2");
    if (!checkpoint.ok) throw new Error("checkpoint fixture failed");

    const gap = structuredClone(checkpoint.value);
    gap.journal[1] = { ...gap.journal[1]!, cursor: "3" };
    await expect(createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => NOW }, recovery: { checkpoint: gap } }).readiness()).resolves.toMatchObject({
      ok: false,
      error: { code: "CURSOR_GAP" },
    });

    const brokenHash = structuredClone(checkpoint.value);
    brokenHash.journal[1] = { ...brokenHash.journal[1]!, event_hash: DIGEST };
    await expect(createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => NOW }, recovery: { checkpoint: brokenHash } }).readiness()).resolves.toMatchObject({
      ok: false,
      error: { code: "JOURNAL_CORRUPT" },
    });

    const missingBlob = { ...structuredClone(checkpoint.value), records: [] };
    await expect(createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => NOW }, recovery: { checkpoint: missingBlob } }).readiness()).resolves.toMatchObject({
      ok: false,
      error: { code: "BLOB_MISSING" },
    });

    const digestDrift = structuredClone(checkpoint.value);
    digestDrift.records[0] = { ...digestDrift.records[0]!, record_digest: DIGEST };
    await expect(createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => NOW }, recovery: { checkpoint: digestDrift } }).readiness()).resolves.toMatchObject({
      ok: false,
      error: { code: "JOURNAL_CORRUPT" },
    });
  });
});
