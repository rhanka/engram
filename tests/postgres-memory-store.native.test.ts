import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  createLogicalMemoryBackupV1,
  openFencedSqliteCanonicalMemoryStoreV1,
  openPostgresCanonicalMemoryStoreV1,
  receiptDigest,
  type CanonicalMemoryStorePort,
  type Digest,
  type LogicalBackupManifestV1,
} from "../engram-memory/index.js";
import { captureRequest, createL3Memory, lifecycleCommand, DEADLINE, NOW } from "./memory-l3-fixture.js";
import { postgresLaneDecision, startEphemeralPostgres } from "./postgres-ephemeral.js";
import { ACTIVITY_NOW, ACTIVITY_STAGES, assertActivityReplayAfterLogicalRestore, assertActivityReplayAtStage } from "./memory-activity-fixture.js";

const X4_DIGEST = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Digest;
const X4_ZERO = "sha256:0000000000000000000000000000000000000000000000000000000000000000" as Digest;

function x4AuthorizationPort() {
  return {
    version: 1 as const,
    async authorize(request: { operation: string; resource_digest: Digest }) {
      const body = {
        allowed: true as const,
        decision_id: "decision:x4-backup",
        policy_version: "1",
        operation: request.operation,
        resource_digest: request.resource_digest,
        scope_ref: "scope:l3",
        not_before: NOW,
        expires_at: DEADLINE,
        revocation_epoch: "0",
        redaction: { mode: "field-allowlist" as const, allowed_fields: [], allow_derivation_lineage: false, max_packet_bytes: 4_096 },
        authentication_receipt_digest: X4_DIGEST,
      };
      return { ok: true as const, value: { ...body, receipt_digest: receiptDigest("authorization-allowed", body) } };
    },
    async revalidate() { throw new Error("unused"); },
    async redact() { throw new Error("unused"); },
  };
}

function x4BackupPorts() {
  const vault = new Map<string, { plaintext: string; context_digest: Digest }>();
  const objects = new Map<string, { ciphertext: string; ciphertext_digest: Digest }>();
  const sealedPlaintexts: string[] = [];
  const key = {
    version: 1 as const,
    async seal(input: { key_ref: string; plaintext: string; context_digest: Digest }) {
      const ciphertext_digest = receiptDigest("test-backup-ciphertext", { plaintext: input.plaintext, context_digest: input.context_digest });
      const ciphertext = ciphertext_digest;
      vault.set(ciphertext, { plaintext: input.plaintext, context_digest: input.context_digest });
      sealedPlaintexts.push(input.plaintext);
      return { ok: true as const, value: { ciphertext, ciphertext_digest, key_receipt_digest: receiptDigest("test-backup-key", { key_ref: input.key_ref, context_digest: input.context_digest }) } };
    },
    async open(input: { key_ref: string; ciphertext: string; context_digest: Digest }) {
      const entry = vault.get(input.ciphertext);
      if (entry === undefined || entry.context_digest !== input.context_digest) {
        return { ok: false as const, error: { code: "BACKUP_INVALID" as const, operation: "restore" as const, message: "context digest mismatch", retryable: false } };
      }
      return { ok: true as const, value: { plaintext: entry.plaintext, key_receipt_digest: receiptDigest("test-backup-key", { key_ref: input.key_ref, context_digest: input.context_digest }) } };
    },
  };
  const object = {
    version: 1 as const,
    async put(input: { object_id: string; ciphertext: string; ciphertext_digest: Digest }) {
      objects.set(input.object_id, { ciphertext: input.ciphertext, ciphertext_digest: input.ciphertext_digest });
      return { ok: true as const, value: { object_ref: input.object_id, object_receipt_digest: receiptDigest("test-backup-object", { object_id: input.object_id, ciphertext_digest: input.ciphertext_digest }) } };
    },
    async get(input: { object_ref: string; expected_ciphertext_digest: Digest }) {
      const stored = objects.get(input.object_ref);
      if (stored === undefined || stored.ciphertext_digest !== input.expected_ciphertext_digest) {
        return { ok: false as const, error: { code: "BACKUP_INVALID" as const, operation: "restore" as const, message: "object missing or digest mismatch", retryable: false } };
      }
      return { ok: true as const, value: { ciphertext: stored.ciphertext, object_receipt_digest: receiptDigest("test-backup-object", { object_id: input.object_ref, ciphertext_digest: stored.ciphertext_digest }) } };
    },
  };
  return { key, object, sealedPlaintexts };
}

const X4_EXPECTED_CODES: Record<string, string> = {
  manifest_digest: "BACKUP_INVALID",
  state_digest: "RESTORE_REFUSED",
  journal_root_digest: "BACKUP_INVALID",
  records_root_digest: "BACKUP_INVALID",
  terminal_ledger_digest: "RESTORE_REFUSED",
  ciphertext_digest: "BACKUP_INVALID",
  object_ref: "BACKUP_INVALID",
  high_water_cursor: "BACKUP_INVALID",
  generation: "BACKUP_INVALID",
  included_classes: "BACKUP_INVALID",
  excluded_counts: "BACKUP_INVALID",
  key_receipt_digest: "BACKUP_INVALID",
  object_receipt_digest: "BACKUP_INVALID",
};

function x4MutatedBody(manifest: LogicalBackupManifestV1, part: string): Omit<LogicalBackupManifestV1, "manifest_digest"> {
  const { manifest_digest: _dropped, ...body } = manifest;
  switch (part) {
    case "state_digest": return { ...body, state_digest: X4_ZERO };
    case "journal_root_digest": return { ...body, journal_root_digest: X4_ZERO };
    case "records_root_digest": return { ...body, records_root_digest: X4_ZERO };
    case "terminal_ledger_digest": return { ...body, terminal_ledger_digest: X4_ZERO };
    case "ciphertext_digest": return { ...body, ciphertext_digest: X4_ZERO };
    case "object_ref": return { ...body, object_ref: `${body.object_ref}-tampered` };
    case "high_water_cursor": return { ...body, high_water_cursor: "1" };
    case "generation": return { ...body, generation: "1" };
    case "included_classes": return { ...body, included_classes: [] as unknown as LogicalBackupManifestV1["included_classes"] };
    case "excluded_counts": return { ...body, excluded_counts: { ...body.excluded_counts, pending: body.excluded_counts.pending + 100 } };
    case "key_receipt_digest": return { ...body, key_receipt_digest: X4_ZERO };
    case "object_receipt_digest": return { ...body, object_receipt_digest: X4_ZERO };
    default: throw new Error(`unknown manifest part ${part}`);
  }
}

function x4Tampered(manifest: LogicalBackupManifestV1, part: string): LogicalBackupManifestV1 {
  if (part === "manifest_digest") return { ...manifest, manifest_digest: X4_ZERO };
  const body = x4MutatedBody(manifest, part);
  return { ...body, manifest_digest: receiptDigest("logical-backup-manifest", body) };
}

async function x4DriveCorpus(store: CanonicalMemoryStorePort): Promise<{ through: string; survivorId: string }> {
  const { memory } = createL3Memory("accept", store);
  const acceptOne = async (key: string, seq: string, text = "x4 order shared memory body") => {
    const captured = await memory.capture(captureRequest(key, seq, text));
    if (!captured.ok || captured.value.candidate_id === undefined) throw new Error(`x4 ${key} capture failed`);
    const admission = await memory.requestAdmission({ candidate_id: captured.value.candidate_id, authorization: AUTHORIZATION, deadline_at: DEADLINE });
    if (!admission.ok || admission.value.record_id === undefined) throw new Error(`x4 ${key} admission failed`);
    return admission.value.record_id as string;
  };
  // Ordre prouvé par au moins 3 courants + les deux recalculs lexicaux
  // (resolve_dispute, rewind) : 5 courants au total.
  const survivorA = await acceptOne("idempotency-key-x4-survivor-a", "1", "x4 order shared alpha meridian");
  const survivorB = await acceptOne("idempotency-key-x4-survivor-b", "2", "x4 order shared beta meridian");
  const survivorC = await acceptOne("idempotency-key-x4-survivor-c", "3", "x4 order shared gamma meridian");
  const resolvedId = await acceptOne("idempotency-key-x4-resolved", "4", "x4 order shared resolved meridian");
  await expect(memory.transition(lifecycleCommand("dispute", resolvedId, "event:x4-dispute-resolved"))).resolves.toMatchObject({ ok: true });
  await expect(memory.transition(lifecycleCommand("resolve_dispute", resolvedId, "event:x4-resolve"))).resolves.toMatchObject({ ok: true });
  const successorId = await acceptOne("idempotency-key-x4-successor", "5", "x4 order shared successor meridian");
  const rewoundId = await acceptOne("idempotency-key-x4-rewound", "6", "x4 order shared rewound meridian");
  await expect(memory.transition(lifecycleCommand("mark_non_current", rewoundId, "event:x4-historical-rewound"))).resolves.toMatchObject({ ok: true });
  await expect(memory.transition({
    operation: "rewind",
    event_id: "event:x4-rewind",
    record_id: rewoundId,
    related_record_id: successorId,
    reason_ref: "reason:rewind",
    event_anchor: { occurred_at: NOW, kind_ref: "kind:rewind", provenance_ref: "citation:l3", provenance_digest: X4_DIGEST },
    authorization: AUTHORIZATION,
    deadline_at: DEADLINE,
  })).resolves.toMatchObject({ ok: true });
  const tombstonedId = await acceptOne("idempotency-key-x4-tomb", "7");
  await expect(memory.transition(lifecycleCommand("tombstone", tombstonedId, "event:x4-tombstone"))).resolves.toMatchObject({ ok: true });
  // Each lifecycle record carries a distinct payload: reusing the tombstoned
  // default body here would trip the same-scope recapture guard
  // (pending_adjudication instead of the accepted record this corpus needs).
  const disputedId = await acceptOne("idempotency-key-x4-disputed", "8", "x4 order shared disputed meridian");
  await expect(memory.transition(lifecycleCommand("dispute", disputedId, "event:x4-dispute"))).resolves.toMatchObject({ ok: true });
  const historicalId = await acceptOne("idempotency-key-x4-historical", "9", "x4 order shared historical meridian");
  await expect(memory.transition(lifecycleCommand("mark_non_current", historicalId, "event:x4-historical"))).resolves.toMatchObject({ ok: true });
  const expiredId = await acceptOne("idempotency-key-x4-expired", "10", "x4 order shared expired meridian");
  await expect(memory.transition(lifecycleCommand("expire", expiredId, "event:x4-expire"))).resolves.toMatchObject({ ok: true });
  const distrustedId = await acceptOne("idempotency-key-x4-distrust", "11", "x4 order shared distrust meridian");
  await expect(memory.transition(lifecycleCommand("trust_invalidate", distrustedId, "event:x4-distrust"))).resolves.toMatchObject({ ok: true });
  const byId = (a: string, b: string) => a.localeCompare(b);
  const expectedCurrent = [survivorA, survivorB, survivorC, resolvedId, rewoundId].sort(byId);
  const expectedRemoved = [successorId, tombstonedId, disputedId, historicalId, expiredId, distrustedId].sort(byId);
  const pending = await memory.capture(captureRequest("idempotency-key-x4-pending", "12"));
  if (!pending.ok || pending.value.candidate_id === undefined) throw new Error("x4 pending capture failed");
  const rejectMemory = createL3Memory("reject", store);
  const rejected = await rejectMemory.memory.capture(captureRequest("idempotency-key-x4-rejected", "13"));
  if (!rejected.ok || rejected.value.candidate_id === undefined) throw new Error("x4 rejected capture failed");
  await expect(rejectMemory.memory.requestAdmission({ candidate_id: rejected.value.candidate_id, authorization: AUTHORIZATION, deadline_at: DEADLINE }))
    .resolves.toMatchObject({ ok: true, value: { status: "rejected" } });
  const readiness = await store.readiness();
  if (!readiness.ok) throw new Error("x4 readiness failed");
  return { through: readiness.value.high_water_cursor, survivorId: survivorA, expectedCurrent, expectedRemoved };
}

const MATRIX = ["16", "17"] as const;
const CLOCK = { now: () => NOW } as const;
const AUTHORIZATION = { credential: "credential:l3" } as const;

async function tableCount(connection: string, table: string): Promise<number> {
  const pg = await import("pg");
  const client = new pg.default.Client(connection);
  await client.connect();
  try {
    const result = await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM ${table}`);
    return result.rows[0]?.count ?? -1;
  } finally {
    await client.end();
  }
}

const stops: Array<() => void> = [];
const sqliteWorkspaces: string[] = [];

afterEach(() => {
  while (stops.length > 0) stops.pop()!();
  while (sqliteWorkspaces.length > 0) rmSync(sqliteWorkspaces.pop()!, { recursive: true, force: true });
});

describe("native Postgres memory store", () => {
  const decision = postgresLaneDecision(MATRIX);
  if (decision.lane === "fail") {
    const cause = decision.cause;
    it("postgres lane prerequisites hold in required mode", () => {
      throw new Error(cause);
    });
    return;
  }
  const maybe = decision.lane === "run" ? it : it.skip;

  maybe("X1 logical restore / Postgres: exact replay and changed proof write nothing", async () => {
    for (const version of MATRIX) {
      const sourcePg = await startEphemeralPostgres(version);
      let targetPg: Awaited<ReturnType<typeof startEphemeralPostgres>> | undefined;
      const stores: CanonicalMemoryStorePort[] = [];
      try {
        targetPg = await startEphemeralPostgres(version);
        let mutations = 0;
        for (const pg of [sourcePg, targetPg]) {
          const opened = await openPostgresCanonicalMemoryStoreV1({ connection: pg.connection,
            clock: { now: () => ACTIVITY_NOW }, store_id: "x1-restore", on_mutation_statement: () => { mutations++; } });
          if (!opened.ok) throw new Error(JSON.stringify(opened));
          stores.push(opened.value);
        }
        await assertActivityReplayAfterLogicalRestore(stores[0]!, stores[1]!, () => mutations);
      } finally {
        for (const store of stores) await store.close();
        targetPg?.stop(); sourcePg.stop();
      }
    }
  }, 180_000);

  maybe("X1 lifecycle backend matrix / Postgres: durable reopen, exact replay and isolated conflicts write nothing", async () => {
    for (const version of MATRIX) {
      const postgres = await startEphemeralPostgres(version);
      try {
        let mutations = 0;
        for (const stage of ACTIVITY_STAGES) {
          await assertActivityReplayAtStage(async () => {
            const opened = await openPostgresCanonicalMemoryStoreV1({ connection: postgres.connection, clock: { now: () => ACTIVITY_NOW },
              store_id: "x1-matrix", on_mutation_statement: () => { mutations++; } });
            if (!opened.ok) throw new Error(JSON.stringify(opened));
            return opened.value;
          }, stage, () => mutations);
        }
      } finally { postgres.stop(); }
    }
  }, 180_000);

  maybe("promotion is atomic and generation mismatch fails before mutation", async () => {
    for (const version of MATRIX) {
      const postgres = await startEphemeralPostgres(version);
      stops.push(postgres.stop);
      try {
        const connection = postgres.connection;

        // --- promotion is atomic: an injected mid-write failpoint rolls back the whole transaction ---
        let armed = false;
        const failStore = await openPostgresCanonicalMemoryStoreV1({
          connection,
          clock: CLOCK,
          store_id: "native",
          failpoint: (stage) => { if (armed && stage === "after_state") throw new Error(`inject:${stage}`); },
        });
        expect(failStore).toMatchObject({ ok: true, value: { capabilities: { backend: "postgres", fenced_single_writer: true } } });
        if (!failStore.ok) throw new Error(`open ${version} failed: ${failStore.error.message}`);
        const readiness = await failStore.value.readiness();
        expect(readiness).toMatchObject({ ok: true });
        if (!readiness.ok) throw new Error("postgres readiness failed");
        expect("multiply_linked" in readiness.value).toBe(false);
        expect((readiness.value as { multiply_linked?: boolean }).multiply_linked).toBeUndefined();
        const failMemory = createL3Memory("accept", failStore.value).memory;
        const pending = await failMemory.capture(captureRequest("native-atomic-promotion", "1"));
        expect(pending).toMatchObject({ ok: true, value: { status: "committed_pending" } });
        if (!pending.ok || pending.value.candidate_id === undefined) throw new Error("pending fixture failed");
        const before = {
          blob: await tableCount(connection, "memory_blob"),
          journal: await tableCount(connection, "memory_journal"),
          state: await tableCount(connection, "memory_state"),
          lexical: await tableCount(connection, "accepted_lexical"),
          outbox: await tableCount(connection, "memory_outbox"),
        };
        armed = true;
        await expect(failMemory.requestAdmission({ candidate_id: pending.value.candidate_id, authorization: AUTHORIZATION, deadline_at: DEADLINE }))
          .resolves.toMatchObject({ ok: false, error: { code: "STORE_UNAVAILABLE" } });
        expect({
          blob: await tableCount(connection, "memory_blob"),
          journal: await tableCount(connection, "memory_journal"),
          state: await tableCount(connection, "memory_state"),
          lexical: await tableCount(connection, "accepted_lexical"),
          outbox: await tableCount(connection, "memory_outbox"),
        }).toEqual(before);
        await failStore.value.close();

        // --- generation mismatch fails before the first mutating statement ---
        const statements: string[] = [];
        const stale = await openPostgresCanonicalMemoryStoreV1({ connection, clock: CLOCK, store_id: "native", on_mutation_statement: (statement) => statements.push(statement) });
        if (!stale.ok) throw new Error(`stale open ${version} failed: ${stale.error.message}`);
        // A later owner opening the same logical store advances the durable generation.
        const owner: CanonicalMemoryStorePort | undefined = await (async () => {
          const opened = await openPostgresCanonicalMemoryStoreV1({ connection, clock: CLOCK, store_id: "native" });
          return opened.ok ? opened.value : undefined;
        })();
        if (owner === undefined) throw new Error("owner open failed");
        const journalBefore = await tableCount(connection, "memory_journal");
        const staleMemory = createL3Memory("accept", stale.value).memory;
        await expect(staleMemory.capture(captureRequest("native-stale-generation", "1")))
          .resolves.toMatchObject({ ok: false, error: { code: "FENCE_LOST" } });
        expect(statements).toEqual([]);
        expect(await tableCount(connection, "memory_journal")).toBe(journalBefore);
        await stale.value.close();
        await owner.close();
      } finally {
        postgres.stop();
        const idx = stops.indexOf(postgres.stop);
        if (idx >= 0) stops.splice(idx, 1);
      }
    }
  }, 180_000);

  maybe("a logical backup of a Postgres store restores the same canonical digests", async () => {
    let crossChecked = false;
    for (const version of MATRIX) {
      const sourcePg = await startEphemeralPostgres(version);
      stops.push(sourcePg.stop);
      const targetPg = await startEphemeralPostgres(version);
      stops.push(targetPg.stop);
      let source: CanonicalMemoryStorePort | undefined;
      let target: CanonicalMemoryStorePort | undefined;
      try {
        const sourceOpened = await openPostgresCanonicalMemoryStoreV1({ connection: sourcePg.connection, clock: CLOCK, store_id: "x4-source" });
        if (!sourceOpened.ok) throw new Error(`x4 source open ${version} failed: ${sourceOpened.error.message}`);
        source = sourceOpened.value;
        const corpus = await x4DriveCorpus(source);
        const through = corpus.through;
        const survivorId = corpus.survivorId;
        const expectedCurrent = corpus.expectedCurrent;
        const expectedRemoved = corpus.expectedRemoved;

        const checkpoint = await source.checkpoint({ through_cursor: through });
        if (!checkpoint.ok) throw new Error("x4 checkpoint failed");
        const sourceJournal = await source.readJournal({ after: "0", limit: 2_000 });
        if (!sourceJournal.ok) throw new Error("x4 readJournal failed");

        const { key, object, sealedPlaintexts } = x4BackupPorts();
        const backup = createLogicalMemoryBackupV1({ store: source, authorization: x4AuthorizationPort(), backup_key: key, backup_object: object, clock: CLOCK });
        const exported = await backup.exportLogical({ through_cursor: through, authorization: AUTHORIZATION, object_target_ref: "target:x4", encryption_key_ref: "key:x4", deadline_at: DEADLINE });
        expect(exported.ok).toBe(true);
        if (!exported.ok) return;
        expect(exported.value.state_digest).toBe(checkpoint.value.state_digest);
        expect(exported.value.journal_root_digest).toBe(checkpoint.value.journal_root_digest);
        expect(exported.value.high_water_cursor).toBe(through);
        expect(exported.value.excluded_counts.pending).toBe(1);
        expect(exported.value.excluded_counts.rejected).toBe(1);
        expect(exported.value.excluded_counts.derived_projections).toBeGreaterThan(0);

        // Pending quarantine: no sealed envelope, FTS or projection material in the sealed payload.
        expect(sealedPlaintexts).toHaveLength(1);
        const plaintext = sealedPlaintexts[0]!;
        expect(plaintext.includes("ciphertext:")).toBe(false);
        expect(plaintext.includes("\"lexical\"")).toBe(false);
        expect(plaintext.includes("\"fields\"")).toBe(false);
        expect(plaintext.includes("\"outbox\"")).toBe(false);
        expect(plaintext.includes("\"batch_digest\"")).toBe(false);

        // Restore WRITES into a fresh empty Postgres target and reproduces the canonical digests.
        const targetOpened = await openPostgresCanonicalMemoryStoreV1({ connection: targetPg.connection, clock: CLOCK, store_id: "x4-target" });
        if (!targetOpened.ok) throw new Error(`x4 target open ${version} failed: ${targetOpened.error.message}`);
        target = targetOpened.value;
        const restored = await backup.restoreLogical({ manifest: exported.value, authorization: AUTHORIZATION, source_ref: "target:x4", decryption_key_ref: "key:x4", deadline_at: DEADLINE, target_store: target });
        expect(restored.ok).toBe(true);
        if (!restored.ok) return;
        expect(restored.value.restored_cursor).toBe(through);
        expect(restored.value.canonical_state_digest).toBe(exported.value.state_digest);

        const targetJournal = await target.readJournal({ after: "0", limit: 2_000 });
        if (!targetJournal.ok) throw new Error("x4 target readJournal failed");
        expect(targetJournal.value.map((event) => event.event_digest)).toEqual(sourceJournal.value.map((event) => event.event_digest));
        const targetCheckpoint = await target.checkpoint({ through_cursor: through });
        if (!targetCheckpoint.ok) throw new Error("x4 target checkpoint failed");
        expect(targetCheckpoint.value.state_digest).toBe(checkpoint.value.state_digest);
        expect(targetCheckpoint.value.journal_root_digest).toBe(checkpoint.value.journal_root_digest);
        expect(targetCheckpoint.value.blob_root_digest).toBe(checkpoint.value.blob_root_digest);
        // MINEUR 1 : le manifeste de checkpoint() est identique après restauration.
        expect(targetCheckpoint.value.policy_versions).toEqual(checkpoint.value.policy_versions);
        expect(targetCheckpoint.value.policy_versions).toEqual([{ id: "policy:l3", version: "1" }]);
        expect(targetCheckpoint.value.registry_versions).toEqual(checkpoint.value.registry_versions);
        {
          const { manifest_digest: _td, storage_epoch: _te, ...targetBody } = targetCheckpoint.value;
          const { manifest_digest: _sd, storage_epoch: _se, ...sourceBody } = checkpoint.value;
          expect(targetBody).toEqual(sourceBody);
        }

        // Classe X4 : rappel lexical et chemins publics identiques à la source
        // (5 courants : l'ordre exact est prouvé, pas vrai par construction).
        const snapshotInput = { valid_as_of: 1, system_as_of: through, authorization_receipt_digest: X4_DIGEST, max_candidates: 50 } as const;
        const sourceSnapshot = await source.acceptedSnapshot(snapshotInput);
        const targetSnapshot = await target.acceptedSnapshot(snapshotInput);
        expect(sourceSnapshot.ok).toBe(true);
        expect(targetSnapshot.ok).toBe(true);
        if (!sourceSnapshot.ok || !targetSnapshot.ok) throw new Error("x4 snapshot failed");
        expect(sourceSnapshot.value.documents.map((document) => document.record_id)).toEqual(expectedCurrent);
        expect(sourceSnapshot.value.documents).toHaveLength(5);
        expect(targetSnapshot.value.documents).toEqual(sourceSnapshot.value.documents);
        expect(targetSnapshot.value.eligibility_digest).toBe(sourceSnapshot.value.eligibility_digest);
        expect(targetSnapshot.value.snapshot_digest).toBe(sourceSnapshot.value.snapshot_digest);
        for (const removed of expectedRemoved) {
          expect(sourceSnapshot.value.documents.map((document) => document.record_id)).not.toContain(removed);
        }
        const sourceRecord = await source.readRecord({ record_id: survivorId, system_as_of: through, authorization_receipt_digest: X4_DIGEST });
        const targetRecord = await target.readRecord({ record_id: survivorId, system_as_of: through, authorization_receipt_digest: X4_DIGEST });
        expect(targetRecord).toEqual(sourceRecord);
        expect(await tableCount(targetPg.connection, "accepted_lexical")).toBe(5);
        expect(await tableCount(targetPg.connection, "accepted_lexical_fts")).toBe(5);
        const sourceBatch = await source.nextProjectionBatch({ after: "0", limit: 100 });
        const targetBatch = await target.nextProjectionBatch({ after: "0", limit: 100 });
        expect(sourceBatch.ok).toBe(true);
        expect(targetBatch.ok).toBe(true);
        if (!sourceBatch.ok || !targetBatch.ok) throw new Error("x4 projection batch failed");
        expect(targetBatch.value.records.map((record) => record.record_id).sort()).toEqual(expectedCurrent);
        // MINEUR 6 : le batch de reconstruction porte les retraits (rebuild depuis zéro).
        expect(targetBatch.value.removals.map((removal) => removal.record_id).sort()).toEqual(expectedRemoved);

        // Import into a non-empty store refuses.
        await expect(backup.restoreLogical({ manifest: exported.value, authorization: AUTHORIZATION, source_ref: "target:x4", decryption_key_ref: "key:x4", deadline_at: DEADLINE, target_store: target }))
          .resolves.toMatchObject({ ok: false, error: { code: "RESTORE_REFUSED" } });

        // Chaque partie falsifiée refuse avec son propre code, après re-signature.
        for (const part of Object.keys(X4_EXPECTED_CODES)) {
          const bad = await backup.restoreLogical({ manifest: x4Tampered(exported.value, part), authorization: AUTHORIZATION, source_ref: "target:x4", decryption_key_ref: "key:x4", deadline_at: DEADLINE });
          expect(bad.ok, `tampered manifest part ${part} must refuse`).toBe(false);
          if (!bad.ok) expect(bad.error.code, `tampered part ${part}`).toBe(X4_EXPECTED_CODES[part]);
        }

        // Atomicité : failpoint after_journal puis réouverture, nouvel essai vert.
        {
          const atomicSourcePg = await startEphemeralPostgres(version);
          stops.push(atomicSourcePg.stop);
          const atomicTargetPg = await startEphemeralPostgres(version);
          stops.push(atomicTargetPg.stop);
          try {
            const atomicSource = await openPostgresCanonicalMemoryStoreV1({ connection: atomicSourcePg.connection, clock: CLOCK, store_id: "x4-atomic-source" });
            if (!atomicSource.ok) throw new Error("x4 atomic source open failed");
            try {
              const atomicCorpus = await x4DriveCorpus(atomicSource.value);
              const { key: atomicKey, object: atomicObject } = x4BackupPorts();
              const atomicBackup = createLogicalMemoryBackupV1({ store: atomicSource.value, authorization: x4AuthorizationPort(), backup_key: atomicKey, backup_object: atomicObject, clock: CLOCK });
              const atomicExported = await atomicBackup.exportLogical({ through_cursor: atomicCorpus.through, authorization: AUTHORIZATION, object_target_ref: "target:x4-atomic", encryption_key_ref: "key:x4-atomic", deadline_at: DEADLINE });
              expect(atomicExported.ok).toBe(true);
              if (!atomicExported.ok) return;
              const armed = true;
              const failing = await openPostgresCanonicalMemoryStoreV1({ connection: atomicTargetPg.connection, clock: CLOCK, store_id: "x4-atomic-target", failpoint: (stage) => { if (armed && stage === "after_journal") throw new Error("inject:after_journal"); } });
              if (!failing.ok) throw new Error("x4 atomic target open failed");
              await expect(atomicBackup.restoreLogical({ manifest: atomicExported.value, authorization: AUTHORIZATION, source_ref: "target:x4-atomic", decryption_key_ref: "key:x4-atomic", deadline_at: DEADLINE, target_store: failing.value }))
                .resolves.toMatchObject({ ok: false });
              await failing.value.close();
              const reopened = await openPostgresCanonicalMemoryStoreV1({ connection: atomicTargetPg.connection, clock: CLOCK, store_id: "x4-atomic-target" });
              if (!reopened.ok) throw new Error("x4 atomic reopen failed");
              try {
                const reopenedReadiness = await reopened.value.readiness();
                if (!reopenedReadiness.ok) throw new Error("x4 atomic reopen readiness failed");
                expect(reopenedReadiness.value.high_water_cursor).toBe("0");
                const retried = await atomicBackup.restoreLogical({ manifest: atomicExported.value, authorization: AUTHORIZATION, source_ref: "target:x4-atomic", decryption_key_ref: "key:x4-atomic", deadline_at: DEADLINE, target_store: reopened.value });
                expect(retried.ok).toBe(true);
              } finally {
                await reopened.value.close();
              }
            } finally {
              await atomicSource.value.close();
            }
          } finally {
            atomicSourcePg.stop();
            atomicTargetPg.stop();
            for (const stop of [atomicSourcePg.stop, atomicTargetPg.stop]) {
              const idx = stops.indexOf(stop);
              if (idx >= 0) stops.splice(idx, 1);
            }
          }
        }

        // Portable restore across backends: the same Postgres manifest restores into an empty SQLite store.
        if (!crossChecked) {
          crossChecked = true;
          const workspace = mkdtempSync(join(tmpdir(), "engram-memory-x4-cross-"));
          sqliteWorkspaces.push(workspace);
          const crossFilename = join(workspace, "canonical.sqlite");
          const crossOpened = await openFencedSqliteCanonicalMemoryStoreV1({ filename: crossFilename, clock: CLOCK, store_id: "x4-cross", allow_ephemeral_filesystem_store: true });
          if (!crossOpened.ok) throw new Error(`x4 cross open failed: ${crossOpened.error.message}`);
          try {
            const cross = await backup.restoreLogical({ manifest: exported.value, authorization: AUTHORIZATION, source_ref: "target:x4", decryption_key_ref: "key:x4", deadline_at: DEADLINE, target_store: crossOpened.value });
            expect(cross.ok).toBe(true);
            if (!cross.ok) return;
            expect(cross.value.canonical_state_digest).toBe(exported.value.state_digest);
            const crossCheckpoint = await crossOpened.value.checkpoint({ through_cursor: through });
            if (!crossCheckpoint.ok) throw new Error("x4 cross checkpoint failed");
            expect(crossCheckpoint.value.state_digest).toBe(checkpoint.value.state_digest);
          } finally {
            await crossOpened.value.close();
          }
        }
      } finally {
        await source?.close();
        await target?.close();
        sourcePg.stop();
        targetPg.stop();
        for (const stop of [sourcePg.stop, targetPg.stop]) {
          const idx = stops.indexOf(stop);
          if (idx >= 0) stops.splice(idx, 1);
        }
      }
    }
  }, 300_000);
});
