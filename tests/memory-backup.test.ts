import { describe, expect, it } from "vitest";

import {
  createInMemoryCanonicalMemoryStoreV1,
  createLogicalMemoryBackupV1,
  foldMemoryJournalV1,
  receiptDigest,
  type BackupKeyPort,
  type BackupObjectPort,
  type Digest,
} from "../graphify-memory/index.js";
import { captureRequest, createL3Memory, lifecycleCommand, NOW } from "./memory-l3-fixture.js";

const DEADLINE = "2026-08-16T12:40:00.000Z";
const DIGEST = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Digest;

function authorizationPort() {
  return {
    version: 1 as const,
    async authorize(request: { operation: string; resource_digest: Digest }) {
      const body = {
        allowed: true as const,
        decision_id: "decision:backup",
        policy_version: "1",
        operation: request.operation,
        resource_digest: request.resource_digest,
        scope_ref: "scope:l3",
        not_before: NOW,
        expires_at: DEADLINE,
        revocation_epoch: "0",
        redaction: { mode: "field-allowlist" as const, allowed_fields: [], allow_derivation_lineage: false, max_packet_bytes: 4_096 },
        authentication_receipt_digest: DIGEST,
      };
      return { ok: true as const, value: { ...body, receipt_digest: receiptDigest("authorization-allowed", body) } };
    },
    async revalidate() { throw new Error("unused"); },
    async redact() { throw new Error("unused"); },
  };
}

function backupPorts() {
  const vault = new Map<string, { plaintext: string; context_digest: Digest }>();
  const objects = new Map<string, { ciphertext: string; ciphertext_digest: Digest }>();
  const sealedPlaintexts: string[] = [];
  const key: BackupKeyPort = {
    version: 1,
    async seal(input) {
      const ciphertext_digest = receiptDigest("test-backup-ciphertext", { plaintext: input.plaintext, context_digest: input.context_digest });
      const ciphertext = ciphertext_digest; // opaque handle; plaintext never travels in the clear
      vault.set(ciphertext, { plaintext: input.plaintext, context_digest: input.context_digest });
      sealedPlaintexts.push(input.plaintext);
      return { ok: true, value: { ciphertext, ciphertext_digest, key_receipt_digest: receiptDigest("test-backup-key", { key_ref: input.key_ref, context_digest: input.context_digest }) } };
    },
    async open(input) {
      const entry = vault.get(input.ciphertext);
      if (entry === undefined || entry.context_digest !== input.context_digest) {
        return { ok: false, error: { code: "BACKUP_INVALID", operation: "restore", message: "context digest mismatch", retryable: false } };
      }
      return { ok: true, value: { plaintext: entry.plaintext, key_receipt_digest: receiptDigest("test-backup-key", { key_ref: input.key_ref, context_digest: input.context_digest }) } };
    },
  };
  const object: BackupObjectPort = {
    version: 1,
    async put(input) {
      objects.set(input.object_id, { ciphertext: input.ciphertext, ciphertext_digest: input.ciphertext_digest });
      return { ok: true, value: { object_ref: input.object_id, object_receipt_digest: receiptDigest("test-backup-object", { object_id: input.object_id, ciphertext_digest: input.ciphertext_digest }) } };
    },
    async get(input) {
      const stored = objects.get(input.object_ref);
      if (stored === undefined || stored.ciphertext_digest !== input.expected_ciphertext_digest) {
        return { ok: false, error: { code: "BACKUP_INVALID", operation: "restore", message: "object missing or digest mismatch", retryable: false } };
      }
      return { ok: true, value: { ciphertext: stored.ciphertext, object_receipt_digest: receiptDigest("test-backup-object", { object_id: input.object_ref, ciphertext_digest: stored.ciphertext_digest }) } };
    },
  };
  return { key, object, objects, sealedPlaintexts };
}

describe("logical backup and restore", () => {
  it("detached logical backup excludes pending rejected FTS and projections yet restore preserves terminal dominance and state digest", async () => {
    const { memory, store } = createL3Memory();

    // Accepted-then-tombstoned record establishes terminal dominance.
    const accepted = await memory.capture(captureRequest("idempotency-key-backup-accept", "1"));
    if (!accepted.ok || accepted.value.candidate_id === undefined) throw new Error("accept capture failed");
    const admission = await memory.requestAdmission({ candidate_id: accepted.value.candidate_id, authorization: { credential: "credential:l3" }, deadline_at: DEADLINE });
    if (!admission.ok || admission.value.record_id === undefined) throw new Error("admission failed");
    const tombstoneRecord = admission.value.record_id;
    await expect(memory.transition(lifecycleCommand("tombstone", tombstoneRecord))).resolves.toMatchObject({ ok: true, value: { to_state: "tombstoned" } });

    // A second acceptance that survives, so the backup carries live accepted history.
    const survivor = await memory.capture(captureRequest("idempotency-key-backup-survivor", "2"));
    if (!survivor.ok || survivor.value.candidate_id === undefined) throw new Error("survivor capture failed");
    const survivorAdmission = await memory.requestAdmission({ candidate_id: survivor.value.candidate_id, authorization: { credential: "credential:l3" }, deadline_at: DEADLINE });
    if (!survivorAdmission.ok) throw new Error("survivor admission failed");

    // A pending candidate (never admitted) and a rejected candidate — both excluded from backup content.
    const pending = await memory.capture(captureRequest("idempotency-key-backup-pending", "3"));
    if (!pending.ok || pending.value.candidate_id === undefined) throw new Error("pending capture failed");
    const rejectMemory = createL3Memory("reject", store);
    const rejected = await rejectMemory.memory.capture(captureRequest("idempotency-key-backup-rejected", "4"));
    if (!rejected.ok || rejected.value.candidate_id === undefined) throw new Error("rejected capture failed");
    await expect(rejectMemory.memory.requestAdmission({ candidate_id: rejected.value.candidate_id, authorization: { credential: "credential:l3" }, deadline_at: DEADLINE })).resolves.toMatchObject({ ok: true, value: { status: "rejected" } });

    const readiness = await store.readiness();
    if (!readiness.ok) throw new Error("readiness failed");
    const through = readiness.value.high_water_cursor;

    const genesis = store.canonicalStateDigest();
    if (!genesis.ok) throw new Error("genesis digest failed");

    // checkpoint-tail equals genesis (existing recovery invariant, re-anchored here).
    const half = "2";
    const checkpoint = store.exportCheckpointForRecovery(half);
    const tail = store.exportTailForRecovery(half);
    if (!checkpoint.ok || !tail.ok) throw new Error("checkpoint/tail export failed");
    const checkpointTail = foldMemoryJournalV1({ checkpoint: checkpoint.value, tail: tail.value });
    if (!checkpointTail.ok) throw new Error("checkpoint-tail fold failed");
    expect(checkpointTail.value.canonical_state_digest).toBe(genesis.value);

    const { key, object, sealedPlaintexts } = backupPorts();
    const backup = createLogicalMemoryBackupV1({ store, authorization: authorizationPort(), backup_key: key, backup_object: object, clock: { now: () => NOW } });

    const exported = await backup.exportLogical({ through_cursor: through, authorization: { credential: "credential:l3" }, object_target_ref: "target:backup", encryption_key_ref: "key:backup", deadline_at: DEADLINE });
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;

    // Excludes pending, rejected, and derived projections.
    expect(exported.value.excluded_counts.pending).toBe(1);
    expect(exported.value.excluded_counts.rejected).toBe(1);
    expect(exported.value.excluded_counts.derived_projections).toBeGreaterThan(0);
    expect([...exported.value.included_classes].sort()).toEqual(["accepted_current", "accepted_disputed", "historical", "terminal_ledger"]);
    expect(exported.value.state_digest).toBe(genesis.value);

    // The sealed payload carries no pending sealed envelope, no FTS index, no outbox batch.
    expect(sealedPlaintexts).toHaveLength(1);
    const plaintext = sealedPlaintexts[0]!;
    expect(plaintext.includes("ciphertext:")).toBe(false); // no sealed pending envelope material
    expect(plaintext.includes("\"lexical\"")).toBe(false); // no FTS/accepted-lexical index
    expect(plaintext.includes("\"fields\"")).toBe(false); // no lexical document fields
    expect(plaintext.includes("\"outbox\"")).toBe(false); // no derived projection batches
    expect(plaintext.includes("\"batch_digest\"")).toBe(false);

    // Restore into a fresh, independent store.
    const restored = await backup.restoreLogical({ manifest: exported.value, authorization: { credential: "credential:l3" }, source_ref: "target:backup", decryption_key_ref: "key:backup", deadline_at: DEADLINE });
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;

    // genesis == checkpoint-tail == restore digest.
    expect(restored.value.canonical_state_digest).toBe(genesis.value);
    expect(restored.value.restored_cursor).toBe(through);

    // Terminal tombstone dominance survives restore: the record is still tombstoned and unrecoverable.
    const restoredStore = createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => NOW }, persistence: rebuildPersistenceFromBackup(plaintext) });
    const foldRestored = foldMemoryJournalV1({ journal: exportPersistedJournal(restoredStore), records: exportPersistedRecords(restoredStore) });
    expect(foldRestored.ok).toBe(true);
    if (!foldRestored.ok) return;
    expect(foldRestored.value.records.find((record) => record.record_id === tombstoneRecord)).toMatchObject({ state: "tombstoned", terminal: true });
    await expect(restoredStore.revalidate({ record_ids: [tombstoneRecord], valid_as_of: 1, system_as_of: through, authorization_receipt_digest: DIGEST, operation: "recall_history" })).resolves.toMatchObject({
      ok: true,
      value: { eligible_record_ids: [], removed: [{ record_id: tombstoneRecord, reason: "tombstone" }] },
    });
  });
});

// Helpers that reconstruct persistence from the sealed backup payload to prove independence.
function rebuildPersistenceFromBackup(plaintext: string) {
  const payload = JSON.parse(plaintext) as { journal: unknown[]; records: unknown[] };
  return { journal: payload.journal as never, controls: [], envelopes: [], records: payload.records as never, lexical: [], outbox: [] };
}
function exportPersistedJournal(store: ReturnType<typeof createInMemoryCanonicalMemoryStoreV1>) {
  const state = store.exportStateForPersistence();
  if (!state.ok) throw new Error("persistence export failed");
  return state.value.journal;
}
function exportPersistedRecords(store: ReturnType<typeof createInMemoryCanonicalMemoryStoreV1>) {
  const state = store.exportStateForPersistence();
  if (!state.ok) throw new Error("persistence export failed");
  return state.value.records;
}
