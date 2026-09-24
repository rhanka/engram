import { canonicalizeJcs } from "./canonical-json.js";
import { receiptDigest } from "./digests.js";
import {
  createInMemoryCanonicalMemoryStoreV1,
  foldMemoryJournalV1,
  type FoldedMemoryStateV1,
  type InMemoryStoreStateV1,
  type MemoryJournalEventV1,
} from "./memory-store.js";
import { isCanonicalCursor } from "./validation.js";
import type {
  AuthorizationContextV1,
  AuthorizationPort,
  ClockPort,
  Cursor,
  Digest,
  LogicalBackupManifestV1,
  MemoryBackupPort,
  MemoryOperation,
  MemoryRecordV2,
  MemoryState,
  Result,
} from "./contracts/index.js";
import { authorizationResourceDigest } from "./digests.js";

const TERMINAL_STATES: ReadonlyArray<MemoryState> = ["tombstoned", "expired", "trust_invalid"];

/** The subset of the canonical store a portable logical backup depends on. */
export interface LogicalBackupStoreV1 {
  exportStateForPersistence(): Result<InMemoryStoreStateV1>;
  canonicalStateDigest(): Result<Digest>;
}

export interface LogicalMemoryBackupDependenciesV1 {
  store: LogicalBackupStoreV1;
  authorization: AuthorizationPort;
  backup_key: import("./contracts/index.js").BackupKeyPort;
  backup_object: import("./contracts/index.js").BackupObjectPort;
  clock: ClockPort;
}

interface BackupPayloadV1 {
  schema_version: 1;
  generation: Cursor;
  high_water_cursor: Cursor;
  journal: ReadonlyArray<MemoryJournalEventV1>;
  records: ReadonlyArray<MemoryRecordV2>;
}

function refusal<T>(operation: MemoryOperation, code: import("./contracts/index.js").MemoryErrorCode, message: string): Result<T> {
  return { ok: false, error: { code, operation, message, retryable: false } };
}

function cursorLe(cursor: Cursor, bound: Cursor): boolean {
  return BigInt(cursor) <= BigInt(bound);
}

function recordsRootDigest(records: ReadonlyArray<MemoryRecordV2>): Digest {
  const rows = records.map((record) => ({ record_id: record.record_id, record_digest: record.record_digest }))
    .sort((left, right) => left.record_id.localeCompare(right.record_id));
  return receiptDigest("logical-backup-records-root", { records: rows });
}

function terminalLedgerDigest(state: FoldedMemoryStateV1): Digest {
  const ledger = state.records
    .filter((record) => TERMINAL_STATES.includes(record.state))
    .map((record) => ({ record_id: record.record_id, state: record.state, terminal: record.terminal }))
    .sort((left, right) => left.record_id.localeCompare(right.record_id));
  return receiptDigest("logical-backup-terminal-ledger", { ledger });
}

function objectRef(highWater: Cursor): string {
  return `memory:logical-backup:${highWater}`;
}

async function authorize(port: AuthorizationPort, operation: "backup" | "restore", context: AuthorizationContextV1, at: string, deadline: string): Promise<Result<{ receipt_digest: Digest }>> {
  const resource = {};
  const authorized = await port.authorize({
    operation,
    resource,
    resource_digest: authorizationResourceDigest(operation, resource),
    context,
    issued_at: at,
    deadline_at: deadline,
  });
  if (!authorized.ok) return authorized;
  if (!authorized.value.allowed) return refusal(operation, "UNAUTHORIZED", "logical backup was not authorized");
  return { ok: true, value: { receipt_digest: authorized.value.receipt_digest } };
}

/**
 * A detached, portable logical backup. The export carries only the dense
 * journal and the immutable record blobs it references — never pending sealed
 * envelopes, the accepted lexical (FTS) index, or any derived projection —
 * yet a restore folds them back to the identical canonical state digest and
 * preserves terminal tombstone dominance.
 */
export function createLogicalMemoryBackupV1(dependencies: LogicalMemoryBackupDependenciesV1): MemoryBackupPort {
  const contextDigest = (highWater: Cursor): Digest => receiptDigest("logical-backup-context", { high_water_cursor: highWater });

  return {
    version: 1,
    async exportLogical(input) {
      if (!isCanonicalCursor(input.through_cursor)) return refusal("backup", "INVALID_SCHEMA", "backup cursor is not canonical");
      const now = dependencies.clock.now();
      const authorized = await authorize(dependencies.authorization, "backup", input.authorization, now, input.deadline_at);
      if (!authorized.ok) return authorized;

      const state = dependencies.store.exportStateForPersistence();
      if (!state.ok) return state;
      const journal = state.value.journal.filter((event) => cursorLe(event.cursor, input.through_cursor));
      const highWater = journal.length === 0 ? "0" : journal[journal.length - 1]!.cursor;
      if (journal.length > 0 && highWater !== input.through_cursor) {
        return refusal("backup", "NOT_FOUND", "backup cursor is not the journal tail at or below the requested cursor");
      }
      const referenced = new Set(journal.filter((event) => event.record_id !== undefined && event.record_digest !== undefined).map((event) => event.record_id!));
      const records = state.value.records.filter((record) => referenced.has(record.record_id));
      const folded = foldMemoryJournalV1({ journal, records });
      if (!folded.ok) return folded;

      // Exclusion counts come from the store's pending-control table, which
      // records true candidate disposition. The journal keeps only the hash-only
      // capture events; the sealed envelope plaintext never enters the backup.
      const excluded = { pending: 0, rejected: 0, withdrawn: 0, derived_projections: state.value.outbox.filter((batch) => cursorLe(batch.through_cursor_inclusive, input.through_cursor)).length };
      for (const control of state.value.controls) {
        if (!cursorLe(control.created_cursor, input.through_cursor)) continue;
        if (control.state === "pending") excluded.pending += 1;
        else if (control.state === "rejected") excluded.rejected += 1;
        else if (control.state === "withdrawn") excluded.withdrawn += 1;
      }

      const payload: BackupPayloadV1 = { schema_version: 1, generation: highWater, high_water_cursor: highWater, journal, records };
      const plaintext = canonicalizeJcs(payload);
      const sealed = await dependencies.backup_key.seal({ key_ref: input.encryption_key_ref, plaintext, context_digest: contextDigest(highWater) });
      if (!sealed.ok) return sealed;
      const object = await dependencies.backup_object.put({ target_ref: input.object_target_ref, object_id: objectRef(highWater), ciphertext: sealed.value.ciphertext, ciphertext_digest: sealed.value.ciphertext_digest });
      if (!object.ok) return object;

      const body = {
        schema_version: 1 as const,
        generation: highWater,
        high_water_cursor: highWater,
        included_classes: ["accepted_current", "accepted_disputed", "historical", "terminal_ledger"] as const,
        excluded_counts: excluded,
        records_root_digest: recordsRootDigest(records),
        journal_root_digest: folded.value.journal_root_hash,
        state_digest: folded.value.canonical_state_digest,
        terminal_ledger_digest: terminalLedgerDigest(folded.value),
        object_ref: object.value.object_ref,
        ciphertext_digest: sealed.value.ciphertext_digest,
        key_receipt_digest: sealed.value.key_receipt_digest,
        object_receipt_digest: object.value.object_receipt_digest,
      };
      return { ok: true, value: { ...body, manifest_digest: receiptDigest("logical-backup-manifest", body) } as LogicalBackupManifestV1 };
    },

    async restoreLogical(input) {
      const now = dependencies.clock.now();
      const authorized = await authorize(dependencies.authorization, "restore", input.authorization, now, input.deadline_at);
      if (!authorized.ok) return authorized;
      const manifest = input.manifest;
      const { manifest_digest: _manifestDigest, ...manifestBody } = manifest;
      if (manifest.manifest_digest !== receiptDigest("logical-backup-manifest", manifestBody)) {
        return refusal("restore", "BACKUP_INVALID", "logical backup manifest digest does not bind its body");
      }
      const object = await dependencies.backup_object.get({ source_ref: input.source_ref, object_ref: manifest.object_ref, expected_ciphertext_digest: manifest.ciphertext_digest });
      if (!object.ok) return object;
      const opened = await dependencies.backup_key.open({ key_ref: input.decryption_key_ref, ciphertext: object.value.ciphertext, context_digest: contextDigest(manifest.high_water_cursor) });
      if (!opened.ok) return opened;
      let payload: BackupPayloadV1;
      try {
        payload = JSON.parse(opened.value.plaintext) as BackupPayloadV1;
      } catch {
        return refusal("restore", "BACKUP_INVALID", "logical backup payload is not decodable");
      }
      if (payload.schema_version !== 1 || !Array.isArray(payload.journal) || !Array.isArray(payload.records)) {
        return refusal("restore", "BACKUP_INVALID", "logical backup payload is malformed");
      }

      const folded = foldMemoryJournalV1({ journal: payload.journal, records: payload.records });
      if (!folded.ok) return { ok: false, error: { ...folded.error, operation: "restore" } };
      if (folded.value.journal_root_hash !== manifest.journal_root_digest) return refusal("restore", "BACKUP_INVALID", "restored journal root does not match the manifest");
      if (recordsRootDigest(payload.records) !== manifest.records_root_digest) return refusal("restore", "BACKUP_INVALID", "restored record blobs do not match the manifest");
      if (terminalLedgerDigest(folded.value) !== manifest.terminal_ledger_digest) return refusal("restore", "RESTORE_REFUSED", "restored terminal ledger does not preserve tombstone dominance");
      if (folded.value.canonical_state_digest !== manifest.state_digest) return refusal("restore", "RESTORE_REFUSED", "restored canonical state digest differs from the backup");

      const store = createInMemoryCanonicalMemoryStoreV1({
        clock: dependencies.clock,
        persistence: { journal: payload.journal, controls: [], envelopes: [], records: payload.records, lexical: [], outbox: [] },
      });
      const readiness = await store.readiness();
      if (!readiness.ok) return { ok: false, error: { ...readiness.error, operation: "restore" } };
      const digest = store.canonicalStateDigest();
      if (!digest.ok) return digest;
      if (digest.value !== manifest.state_digest) return refusal("restore", "RESTORE_REFUSED", "rebuilt store digest differs from the backup");

      const body = { restored_cursor: payload.high_water_cursor, canonical_state_digest: digest.value };
      return { ok: true, value: { ...body, receipt_digest: receiptDigest("logical-restore", body) } };
    },
  };
}
