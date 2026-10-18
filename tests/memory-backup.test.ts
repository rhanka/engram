import { describe, expect, it } from "vitest";

import {
  createInMemoryCanonicalMemoryStoreV1,
  createLogicalMemoryBackupV1,
  deriveAcceptedLexicalDocumentsV1,
  deriveRebuildOutboxBatchV1,
  foldMemoryJournalV1,
  receiptDigest,
  type BackupKeyPort,
  type BackupObjectPort,
  type Digest,
} from "../engram-memory/index.js";
import { activityHarness, activityEvidence, ACTIVITY_NOW } from "./memory-activity-fixture.js";
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
  it.each([1, 2])("legacy payload v%s restores, then refuses exact and changed activity before any write", async version => {
    const h = activityHarness();
    const store = createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => ACTIVITY_NOW } });
    const source = h.build(store);
    const first = await source.ingestActivity(h.request);
    if (!first.ok) throw new Error(JSON.stringify(first));
    const item = first.value.items[0]!;
    const ports = backupPorts();
    const backup = createLogicalMemoryBackupV1({ store, authorization: h.authorization,
      backup_key: ports.key, backup_object: ports.object, clock: { now: () => ACTIVITY_NOW } });
    const exported = await backup.exportLogical({ through_cursor: item.cursor!, authorization: h.request.authorization,
      object_target_ref: "object:legacy", encryption_key_ref: "key:legacy", deadline_at: DEADLINE });
    if (!exported.ok) throw new Error(JSON.stringify(exported));
    const payload = JSON.parse(ports.sealedPlaintexts[0]!);
    delete payload.capture_idempotency;
    payload.schema_version = version;
    if (version === 1) delete payload.excluded_counts;
    const sealed = await ports.key.seal({ key_ref: "key:legacy", plaintext: JSON.stringify(payload),
      context_digest: receiptDigest("logical-backup-context", { high_water_cursor: item.cursor }) });
    if (!sealed.ok) throw new Error(JSON.stringify(sealed));
    const put = await ports.object.put({ target_ref: "object:legacy", object_id: exported.value.object_ref,
      ciphertext: sealed.value.ciphertext, ciphertext_digest: sealed.value.ciphertext_digest });
    if (!put.ok) throw new Error(JSON.stringify(put));
    const { manifest_digest: _old, capture_idempotency_digest: _registry, ...body } = { ...exported.value,
      ciphertext_digest: sealed.value.ciphertext_digest, key_receipt_digest: sealed.value.key_receipt_digest,
      object_receipt_digest: put.value.object_receipt_digest };
    const manifest = { ...body, manifest_digest: receiptDigest("logical-backup-manifest", body) };
    const target = createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => ACTIVITY_NOW } });
    expect(await backup.restoreLogical({ manifest, authorization: h.request.authorization, source_ref: "object:legacy",
      decryption_key_ref: "key:legacy", deadline_at: DEADLINE, target_store: target })).toMatchObject({ ok: true });
    const memory = h.build(target);
    const before = target.exportStateForPersistence();
    const writes = { ...h.writes };
    for (const changed of [false, true]) {
      const evidence = activityEvidence();
      if (changed) evidence.components[0]!.text = "changed in legacy replay";
      h.setEvidence(evidence);
      expect(await memory.ingestActivity(h.request)).toMatchObject({ ok: false, error: { code: "DIGEST_CONFLICT" } });
      expect(h.writes).toEqual(writes);
      expect(target.exportStateForPersistence()).toEqual(before);
    }
    // The direct store seam cannot fall back to the clock-dependent event hash either.
    expect(await target.commitPending(h.commits[0]!)).toMatchObject({ ok: false, error: { code: "DIGEST_CONFLICT" } });
    expect(target.exportStateForPersistence()).toEqual(before);
  });

  it("registry root is part of canonical restore equality and is checked before promotion", async () => {
    const h = activityHarness();
    const store = createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => ACTIVITY_NOW } });
    const captured = await h.build(store).ingestActivity(h.request);
    if (!captured.ok) throw new Error(JSON.stringify(captured));
    const ports = backupPorts();
    const backup = createLogicalMemoryBackupV1({ store, authorization: h.authorization,
      backup_key: ports.key, backup_object: ports.object, clock: { now: () => ACTIVITY_NOW } });
    const exported = await backup.exportLogical({ through_cursor: "1", authorization: h.request.authorization,
      object_target_ref: "object:root", encryption_key_ref: "key:root", deadline_at: DEADLINE });
    if (!exported.ok) throw new Error(JSON.stringify(exported));
    const payload = JSON.parse(ports.sealedPlaintexts[0]!);
    const journal = await store.readJournal({ after: "0", limit: 100 });
    if (!journal.ok) throw new Error(JSON.stringify(journal));
    // A target receiving the correct journal/blob pair but missing the registry refuses atomically.
    const target = createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => ACTIVITY_NOW } });
    const before = target.exportStateForPersistence();
    const input = { journal: journal.value, records: payload.records, expected_restored_cursor: "1",
      expected_canonical_state_digest: exported.value.state_digest,
      expected_capture_idempotency_digest: exported.value.capture_idempotency_digest };
    expect(await target.importLogicalBackup!({ ...input, capture_idempotency: [] }))
      .toMatchObject({ ok: false, error: { code: "RESTORE_REFUSED" } });
    expect(target.exportStateForPersistence()).toEqual(before);
    expect(await target.importLogicalBackup!({ ...input, capture_idempotency: payload.capture_idempotency }))
      .toMatchObject({ ok: true, value: { capture_idempotency_digest: exported.value.capture_idempotency_digest } });
    // Mutating only the manifest registry root also fails before writing the target.
    const { manifest_digest: _old, ...body } = { ...exported.value, capture_idempotency_digest: DIGEST };
    const manifest = { ...body, manifest_digest: receiptDigest("logical-backup-manifest", body) };
    const empty = createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => ACTIVITY_NOW } });
    expect(await backup.restoreLogical({ manifest, authorization: h.request.authorization, source_ref: "object:root",
      decryption_key_ref: "key:root", deadline_at: DEADLINE, target_store: empty }))
      .toMatchObject({ ok: false, error: { code: "RESTORE_REFUSED" } });
    expect(empty.exportStateForPersistence()).toEqual(before);
  });

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
    // Distinct payload: M5/A10-R4 sends same-payload recapture to pending_adjudication.
    const survivor = await memory.capture(captureRequest("idempotency-key-backup-survivor", "2", "memory body survivor"));
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

  it("restored memory recall renders exactly the source recall, in order (classe X4)", async () => {
    const { memory, store } = createL3Memory();
    const acceptOne = async (key: string, seq: string, text = "x4c order shared memory body") => {
      const captured = await memory.capture(captureRequest(key, seq, text));
      if (!captured.ok || captured.value.candidate_id === undefined) throw new Error(`${key} capture failed`);
      const admission = await memory.requestAdmission({ candidate_id: captured.value.candidate_id, authorization: { credential: "credential:l3" }, deadline_at: DEADLINE });
      if (!admission.ok || admission.value.record_id === undefined) throw new Error(`${key} admission failed`);
      return admission.value.record_id as string;
    };
    // Ordre prouvé par au moins 3 courants + les deux recalculs lexicaux
    // (resolve_dispute, rewind) : 5 courants au total.
    const survivorA = await acceptOne("idempotency-key-x4c-survivor-a", "11", "x4c order shared alpha meridian");
    const survivorB = await acceptOne("idempotency-key-x4c-survivor-b", "12", "x4c order shared beta meridian");
    const survivorC = await acceptOne("idempotency-key-x4c-survivor-c", "13", "x4c order shared gamma meridian");
    const resolved = await acceptOne("idempotency-key-x4c-resolved", "14", "x4c order shared resolved meridian");
    await expect(memory.transition(lifecycleCommand("dispute", resolved, "event:x4c-dispute-resolved"))).resolves.toMatchObject({ ok: true });
    await expect(memory.transition(lifecycleCommand("resolve_dispute", resolved, "event:x4c-resolve"))).resolves.toMatchObject({ ok: true });
    const successor = await acceptOne("idempotency-key-x4c-successor", "15", "x4c order shared successor meridian");
    const rewound = await acceptOne("idempotency-key-x4c-rewound", "16", "x4c order shared rewound meridian");
    await expect(memory.transition(lifecycleCommand("mark_non_current", rewound, "event:x4c-historical-rewound"))).resolves.toMatchObject({ ok: true });
    await expect(memory.transition({
      operation: "rewind",
      event_id: "event:x4c-rewind",
      record_id: rewound,
      related_record_id: successor,
      reason_ref: "reason:rewind",
      event_anchor: { occurred_at: NOW, kind_ref: "kind:rewind", provenance_ref: "citation:l3", provenance_digest: DIGEST },
      authorization: { credential: "credential:l3" },
      deadline_at: DEADLINE,
    })).resolves.toMatchObject({ ok: true });
    const survivor = survivorA;
    const expectedCurrent = [survivorA, survivorB, survivorC, resolved, rewound].sort((a, b) => a.localeCompare(b));
    // Distinct payloads: M5/A10-R4 sends same-payload recapture to pending_adjudication.
    const tombstoned = await acceptOne("idempotency-key-x4c-tomb", "17", "x4c order tombstoned meridian");
    await expect(memory.transition(lifecycleCommand("tombstone", tombstoned))).resolves.toMatchObject({ ok: true });
    const disputed = await acceptOne("idempotency-key-x4c-disputed", "18", "x4c order disputed meridian");
    await expect(memory.transition(lifecycleCommand("dispute", disputed))).resolves.toMatchObject({ ok: true });
    const historical = await acceptOne("idempotency-key-x4c-historical", "19", "x4c order historical meridian");
    await expect(memory.transition(lifecycleCommand("mark_non_current", historical))).resolves.toMatchObject({ ok: true });
    const expired = await acceptOne("idempotency-key-x4c-expired", "20", "x4c order expired meridian");
    await expect(memory.transition(lifecycleCommand("expire", expired))).resolves.toMatchObject({ ok: true });
    const distrusted = await acceptOne("idempotency-key-x4c-distrust", "21", "x4c order distrusted meridian");
    await expect(memory.transition(lifecycleCommand("trust_invalidate", distrusted))).resolves.toMatchObject({ ok: true });
    const expectedRemoved = [successor, tombstoned, disputed, historical, expired, distrusted].sort((a, b) => a.localeCompare(b));
    const pending = await memory.capture(captureRequest("idempotency-key-x4c-pending", "22"));
    if (!pending.ok) throw new Error("pending capture failed");

    const readiness = await store.readiness();
    if (!readiness.ok) throw new Error("readiness failed");
    const through = readiness.value.high_water_cursor;
    const sourceCheckpoint = await store.checkpoint({ through_cursor: through });
    if (!sourceCheckpoint.ok) throw new Error("source checkpoint failed");
    const { key, object, sealedPlaintexts } = backupPorts();
    const backup = createLogicalMemoryBackupV1({ store, authorization: authorizationPort(), backup_key: key, backup_object: object, clock: { now: () => NOW } });
    const exported = await backup.exportLogical({ through_cursor: through, authorization: { credential: "credential:l3" }, object_target_ref: "target:x4c", encryption_key_ref: "key:x4c", deadline_at: DEADLINE });
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const restored = await backup.restoreLogical({ manifest: exported.value, authorization: { credential: "credential:l3" }, source_ref: "target:x4c", decryption_key_ref: "key:x4c", deadline_at: DEADLINE });
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(sealedPlaintexts).toHaveLength(1);

    const target = createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => NOW }, persistence: rebuildPersistenceFromBackup(sealedPlaintexts[0]!) });
    // MINEUR 1 : le manifeste de checkpoint() est identique après restauration.
    const targetCheckpoint = await target.checkpoint({ through_cursor: through });
    expect(targetCheckpoint.ok).toBe(true);
    if (!targetCheckpoint.ok) return;
    expect(targetCheckpoint.value.policy_versions).toEqual(sourceCheckpoint.value.policy_versions);
    expect(targetCheckpoint.value.policy_versions).toEqual([{ id: "policy:l3", version: "1" }]);
    {
      const { manifest_digest: _td, storage_epoch: _te, ...targetBody } = targetCheckpoint.value;
      const { manifest_digest: _sd, storage_epoch: _se, ...sourceBody } = sourceCheckpoint.value;
      expect(targetBody).toEqual(sourceBody);
    }
    const snapshotInput = { valid_as_of: 1, system_as_of: through, authorization_receipt_digest: DIGEST, max_candidates: 50 } as const;
    const sourceSnapshot = await store.acceptedSnapshot(snapshotInput);
    const targetSnapshot = await target.acceptedSnapshot(snapshotInput);
    expect(sourceSnapshot.ok).toBe(true);
    expect(targetSnapshot.ok).toBe(true);
    if (!sourceSnapshot.ok || !targetSnapshot.ok) return;
    // 5 courants : l'ordre exact est prouvé, pas vrai par construction ; les
    // autres classes n'y figurent pas (pas de résurrection).
    expect(sourceSnapshot.value.documents.map((document) => document.record_id)).toEqual(expectedCurrent);
    expect(sourceSnapshot.value.documents).toHaveLength(5);
    expect(targetSnapshot.value.documents).toEqual(sourceSnapshot.value.documents);
    expect(targetSnapshot.value.eligibility_digest).toBe(sourceSnapshot.value.eligibility_digest);
    expect(targetSnapshot.value.snapshot_digest).toBe(sourceSnapshot.value.snapshot_digest);
    for (const removed of expectedRemoved) {
      expect(sourceSnapshot.value.documents.map((document) => document.record_id)).not.toContain(removed);
    }
    const sourceJournal = await store.readJournal({ after: "0", limit: 500 });
    const targetJournal = await target.readJournal({ after: "0", limit: 500 });
    if (!sourceJournal.ok || !targetJournal.ok) throw new Error("journal read failed");
    expect(targetJournal.value.map((event) => event.event_digest)).toEqual(sourceJournal.value.map((event) => event.event_digest));
    const sourceRecord = await store.readRecord({ record_id: survivor, system_as_of: through, authorization_receipt_digest: DIGEST });
    const targetRecord = await target.readRecord({ record_id: survivor, system_as_of: through, authorization_receipt_digest: DIGEST });
    expect(targetRecord).toEqual(sourceRecord);
    const sourceBatch = await store.nextProjectionBatch({ after: "0", limit: 100 });
    const targetBatch = await target.nextProjectionBatch({ after: "0", limit: 100 });
    expect(sourceBatch.ok).toBe(true);
    expect(targetBatch.ok).toBe(true);
    if (!sourceBatch.ok || !targetBatch.ok) return;
    expect(targetBatch.value.records.map((record) => record.record_id).sort()).toEqual(expectedCurrent);
    // MINEUR 6 : le batch de reconstruction porte les retraits (rebuild depuis zéro).
    expect(targetBatch.value.removals.map((removal) => removal.record_id).sort()).toEqual(expectedRemoved);
  });

  it("a v1 payload without excluded_counts restores (MINEUR 3)", async () => {
    const { memory, store } = createL3Memory();
    const captured = await memory.capture(captureRequest("idempotency-key-x4v-survivor", "31"));
    if (!captured.ok || captured.value.candidate_id === undefined) throw new Error("v1 capture failed");
    const admission = await memory.requestAdmission({ candidate_id: captured.value.candidate_id, authorization: { credential: "credential:l3" }, deadline_at: DEADLINE });
    if (!admission.ok || admission.value.record_id === undefined) throw new Error("v1 admission failed");
    const readiness = await store.readiness();
    if (!readiness.ok) throw new Error("v1 readiness failed");
    const through = readiness.value.high_water_cursor;

    const { key, object, sealedPlaintexts } = backupPorts();
    const backup = createLogicalMemoryBackupV1({ store, authorization: authorizationPort(), backup_key: key, backup_object: object, clock: { now: () => NOW } });
    const exported = await backup.exportLogical({ through_cursor: through, authorization: { credential: "credential:l3" }, object_target_ref: "target:x4v", encryption_key_ref: "key:x4v", deadline_at: DEADLINE });
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    expect(sealedPlaintexts).toHaveLength(1);

    // Fabrique un payload v1 : même journal/blobs, sans excluded_counts.
    const v2 = JSON.parse(sealedPlaintexts[0]!) as { journal: unknown[]; records: unknown[]; generation: string; high_water_cursor: string };
    const v1plaintext = JSON.stringify({ schema_version: 1, generation: v2.generation, high_water_cursor: v2.high_water_cursor, journal: v2.journal, records: v2.records });
    expect(v1plaintext.includes("excluded_counts")).toBe(false);
    const sealed = await key.seal({ key_ref: "key:x4v-v1", plaintext: v1plaintext, context_digest: receiptDigest("logical-backup-context", { high_water_cursor: through }) });
    if (!sealed.ok) throw new Error("v1 seal failed");
    const put = await object.put({ target_ref: "target:x4v-v1", object_id: `memory:logical-backup:${through}`, ciphertext: sealed.value.ciphertext, ciphertext_digest: sealed.value.ciphertext_digest });
    if (!put.ok) throw new Error("v1 put failed");
    const { manifest_digest: _dropped, capture_idempotency_digest: _registryDigest, ...v1body } = {
      ...exported.value,
      ciphertext_digest: sealed.value.ciphertext_digest,
      key_receipt_digest: sealed.value.key_receipt_digest,
      object_receipt_digest: put.value.object_receipt_digest,
    };
    const v1signed = { ...v1body, manifest_digest: receiptDigest("logical-backup-manifest", v1body) };

    const restored = await backup.restoreLogical({ manifest: v1signed, authorization: { credential: "credential:l3" }, source_ref: "target:x4v-v1", decryption_key_ref: "key:x4v-v1", deadline_at: DEADLINE });
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.value.restored_cursor).toBe(through);
    expect(restored.value.canonical_state_digest).toBe(exported.value.state_digest);
  });
});

// Helpers that reconstruct persistence from the sealed backup payload to prove independence.
function rebuildPersistenceFromBackup(plaintext: string) {
  const payload = JSON.parse(plaintext) as { journal: never[]; records: never[] };
  const folded = foldMemoryJournalV1({ journal: payload.journal as never, records: payload.records as never });
  if (!folded.ok) throw new Error("backup fold failed");
  return {
    journal: payload.journal as never,
    controls: [],
    envelopes: [],
    records: payload.records as never,
    lexical: [...deriveAcceptedLexicalDocumentsV1(folded.value, payload.records as never)],
    outbox: [...deriveRebuildOutboxBatchV1(folded.value, payload.records as never)],
  };
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
