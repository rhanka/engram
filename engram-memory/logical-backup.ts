import { canonicalizeJcs, normalizeCanonicalJson } from "./canonical-json.js";
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
  CanonicalMemoryStorePort,
  ClockPort,
  Cursor,
  Digest,
  LifecycleEventV2,
  LogicalBackupManifestV1,
  MemoryBackupPort,
  MemoryOperation,
  MemoryRecordV2,
  MemoryState,
  Result,
} from "./contracts/index.js";
import { authorizationResourceDigest } from "./digests.js";

const TERMINAL_STATES: ReadonlyArray<MemoryState> = ["tombstoned", "expired", "trust_invalid"];

const INCLUDED_CLASSES = ["accepted_current", "accepted_disputed", "historical", "terminal_ledger"] as const;

/**
 * Historical export seam: the shipped backup used to require these
 * persistence internals, which only the in-memory store exposes. D-11 B keeps
 * the shape for compatibility but the durable export below uses only the
 * public `CanonicalMemoryStorePort` (journal pages via `readJournal` plus
 * record reads) — exposing `#core` would leak sealed pending envelopes
 * against EVOL §5.9 (option C, discarded).
 *
 * @deprecated Kept only so callers compiled against the pre-X4
 * `LogicalMemoryBackupDependenciesV1.store: LogicalBackupStoreV1` shape keep
 * type-checking. New code depends on `CanonicalMemoryStorePort`; this
 * interface is unused by the X4 export/restore path and will not evolve.
 * Rupture documentée : X4 remplace le membre `store` par
 * `CanonicalMemoryStorePort` (sur-ensemble fonctionnel, pas sur-ensemble de
 * type — un appelant qui ne fournissait que ces deux méthodes doit migrer).
 */
export interface LogicalBackupStoreV1 {
  exportStateForPersistence(): Result<InMemoryStoreStateV1>;
  canonicalStateDigest(): Result<Digest>;
}

export interface LogicalMemoryBackupDependenciesV1 {
  store: CanonicalMemoryStorePort;
  authorization: AuthorizationPort;
  backup_key: import("./contracts/index.js").BackupKeyPort;
  backup_object: import("./contracts/index.js").BackupObjectPort;
  clock: ClockPort;
}

/** Pre-X4 payload (origin/main): journal + blobs only, no exclusion counts. */
interface BackupPayloadV1 {
  schema_version: 1;
  generation: Cursor;
  high_water_cursor: Cursor;
  journal: ReadonlyArray<MemoryJournalEventV1>;
  records: ReadonlyArray<MemoryRecordV2>;
  excluded_counts?: { pending: number; rejected: number; withdrawn: number; derived_projections: number };
}

/** X4 payload: adds the mandatory exclusion counts. */
interface BackupPayloadV2 {
  schema_version: 2;
  generation: Cursor;
  high_water_cursor: Cursor;
  journal: ReadonlyArray<MemoryJournalEventV1>;
  records: ReadonlyArray<MemoryRecordV2>;
  excluded_counts: { pending: number; rejected: number; withdrawn: number; derived_projections: number };
}

type BackupPayload = BackupPayloadV1 | BackupPayloadV2;

/**
 * Deterministic accepted-only lexical derivation — a mirror of the in-memory
 * core (`memory-store.ts`) and the engine (`engine.ts`) derivations, not
 * their unique source. Only `accepted_current` records produce a document;
 * tombstoned, expired, trust_invalid, historical and disputed records never
 * do (no resurrection through the derived surface).
 */
export function deriveAcceptedLexicalDocumentsV1(
  folded: FoldedMemoryStateV1,
  records: ReadonlyArray<MemoryRecordV2>,
): ReadonlyArray<{ record_id: string; document: import("./contracts/index.js").AcceptedLexicalDocumentV1 }> {
  const byId = new Map(records.map((record) => [record.record_id, record]));
  const out: Array<{ record_id: string; document: import("./contracts/index.js").AcceptedLexicalDocumentV1 }> = [];
  const current = folded.records
    .filter((entry) => entry.state === "accepted_current")
    .map((entry) => entry.record_id)
    .sort();
  for (const recordId of current) {
    const record = byId.get(recordId);
    if (record === undefined) continue;
    const text = (kind: "context" | "decision" | "evidence") => record.components.filter((component) => component.kind === kind).map((component) => component.text).join("\n");
    out.push({
      record_id: record.record_id,
      document: {
        record_id: record.record_id,
        fields: {
          primary: record.components.find((component) => component.component_id === record.primary_component_id)?.text ?? "",
          context: text("context"),
          decision: text("decision"),
          evidence: text("evidence"),
          citations: record.citations.map((citation) => citation.source_ref).join("\n"),
        },
        valid_time: clone(record.valid_time),
        trust_class: record.trust.class,
        record_digest: record.record_digest,
      },
    });
  }
  return out;
}

/** Projection-envelope derivation mirroring the in-memory core. */
function projectionRecordV1(record: MemoryRecordV2): import("./contracts/index.js").ProjectionRecordV1 {
  return {
    record_id: record.record_id,
    record_digest: record.record_digest,
    scope_ref: record.scope_ref,
    valid_time: clone(record.valid_time),
    trust_class: record.trust.class,
    component_kinds: record.components.map((component) => component.kind),
    citation_refs: record.citations.map((citation) => citation.source_ref),
  };
}

/**
 * One coalesced projection-rebuild batch covering the restored
 * `accepted_current` set plus every non-current record as a removal. The
 * sealed payload never carries outbox batches (quarantine), so a restored
 * store would otherwise answer `NOT_FOUND` to `nextProjectionBatch` forever
 * and downstream graph/vector projections would never receive the restored
 * memories. Downstream projections rebuild from zero on a restored target:
 * records carry the restored `accepted_current` set, removals carry every
 * other folded record (disputed, historical, terminal) so a projection kept
 * from before the restore drops stale entries. Empty (no outbox write) only
 * on an empty journal.
 */
export function deriveRebuildOutboxBatchV1(
  folded: FoldedMemoryStateV1,
  records: ReadonlyArray<MemoryRecordV2>,
): ReadonlyArray<import("./contracts/index.js").ProjectionBatchV1> {
  if (folded.high_water_cursor === "0") return [];
  const byId = new Map(records.map((record) => [record.record_id, record]));
  const current = folded.records
    .filter((entry) => entry.state === "accepted_current")
    .map((entry) => entry.record_id)
    .sort();
  const currentSet = new Set(current);
  const removals = folded.records
    .filter((entry) => entry.state !== "accepted_current")
    .map((entry) => entry.record_id)
    .filter((id) => !currentSet.has(id))
    .sort()
    .map((record_id) => ({ record_id, reason_ref: "memory:logical-restore-rebuild" }));
  if (current.length === 0 && removals.length === 0) return [];
  const body = {
    from_cursor_exclusive: "0" as Cursor,
    through_cursor_inclusive: folded.high_water_cursor,
    records: current.flatMap((id) => {
      const record = byId.get(id);
      return record === undefined ? [] : [projectionRecordV1(record)];
    }),
    removals,
  };
  return [{ ...body, batch_digest: receiptDigest("projection-batch", body) }];
}

/** Journal-only derived-projection count — O(journal), no per-row store fold. */
function countDerivedProjections(journal: ReadonlyArray<{ operation: string }>): number {
  let count = 0;
  for (const event of journal) {
    if (event.operation === "accept" || event.operation === "dispute" || event.operation === "resolve_dispute"
      || event.operation === "supersede" || event.operation === "mark_non_current" || event.operation === "rewind"
      || event.operation === "expire" || event.operation === "trust_invalidate" || event.operation === "tombstone") {
      count += 1;
    }
  }
  return count;
}

function refusal<T>(operation: MemoryOperation, code: import("./contracts/index.js").MemoryErrorCode, message: string): Result<T> {
  return { ok: false, error: { code, operation, message, retryable: false } };
}

function isDigest(value: unknown): value is Digest {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
}

function defined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T;
}

function clone<T>(value: T): T {
  return normalizeCanonicalJson(value) as T;
}

function cursorLe(cursor: Cursor, bound: Cursor): boolean {
  return BigInt(cursor) <= BigInt(bound);
}

/**
 * Public journal page (`LifecycleEventV2`, schema 2 with digest aliases) back
 * to the stored journal form (`MemoryJournalEventV1`, schema 1). Drops the
 * aliases; the hash-relevant body is preserved exactly so folds agree.
 */
export function backupPublicJournalToStorageV1(events: ReadonlyArray<LifecycleEventV2>): Result<MemoryJournalEventV1[]> {
  const out: MemoryJournalEventV1[] = [];
  for (const event of events) {
    const previous_event_hash = (event as { previous_event_hash?: Digest }).previous_event_hash ?? event.previous_event_digest;
    const event_hash = (event as { event_hash?: Digest }).event_hash ?? event.event_digest;
    if (event.schema_version !== 2 || typeof event.event_id !== "string" || typeof event.cursor !== "string"
      || typeof event.recorded_at !== "string" || typeof event.operation !== "string" || typeof event.to_state !== "string"
      || !isDigest(event.authorization_receipt_digest) || !isDigest(previous_event_hash) || !isDigest(event_hash)) {
      return refusal("backup", "BACKUP_INVALID", "exported journal page carries a malformed event");
    }
    out.push(defined({
      schema_version: 1 as const,
      event_id: event.event_id,
      cursor: event.cursor,
      recorded_at: event.recorded_at,
      operation: event.operation,
      candidate_id: event.candidate_id,
      record_id: event.record_id,
      related_record_id: event.related_record_id,
      from_state: event.from_state,
      to_state: event.to_state,
      valid_effective_at: event.valid_effective_at,
      record_digest: event.record_digest,
      authorization_receipt_digest: event.authorization_receipt_digest,
      admission_decision: event.admission_decision === undefined ? undefined : clone(event.admission_decision),
      reason_ref: event.reason_ref,
      event_anchor: event.event_anchor === undefined ? undefined : clone(event.event_anchor),
      reconciliation: event.reconciliation === undefined ? undefined : clone(event.reconciliation),
      previous_event_hash,
      event_hash,
    }) as MemoryJournalEventV1);
  }
  return { ok: true, value: out };
}

/** Stored journal form back to the public page form (lossless: aliases re-added). */
export function backupStorageJournalToPublicV1(events: ReadonlyArray<MemoryJournalEventV1>): LifecycleEventV2[] {
  return events.map((event) => ({
    ...clone(event),
    schema_version: 2 as const,
    previous_event_digest: event.previous_event_hash,
    event_digest: event.event_hash,
  }) as LifecycleEventV2);
}

/** True candidate disposition counted from journal operations alone — no pending-control table, no envelopes. */
function countDisposition(journal: ReadonlyArray<{ operation: string; candidate_id?: string }>): { pending: number; rejected: number; withdrawn: number } {
  const captured = new Set<string>();
  const accepted = new Set<string>();
  const rejected = new Set<string>();
  const withdrawn = new Set<string>();
  for (const event of journal) {
    const id = event.candidate_id;
    if (id === undefined) continue;
    if (event.operation === "capture") captured.add(id);
    else if (event.operation === "accept") accepted.add(id);
    else if (event.operation === "reject") rejected.add(id);
    else if (event.operation === "withdraw") withdrawn.add(id);
  }
  return {
    pending: [...captured].filter((id) => !accepted.has(id) && !rejected.has(id) && !withdrawn.has(id)).length,
    rejected: rejected.size,
    withdrawn: new Set([...accepted, ...withdrawn]).size,
  };
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
 * envelopes or controls — yet a restore folds them back to the identical
 * canonical state digest, preserves terminal tombstone dominance, and
 * rebuilds every store-owned derived surface (accepted lexical + FTS, one
 * coalesced projection-rebuild batch) deterministically in the same import
 * transaction.
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

      // D-11 B: page the dense journal over the PUBLIC port only. Pending
      // sealed envelopes and controls never leave through this path (option C,
      // discarded); exclusion counts below are recomputed from journal
      // operations and public projection batches instead.
      const pages: LifecycleEventV2[] = [];
      {
        let after: Cursor = "0";
        for (;;) {
          const page = await dependencies.store.readJournal({ after, limit: 500 });
          if (!page.ok) return { ok: false, error: { ...page.error, operation: "backup" as MemoryOperation } };
          if (page.value.length === 0) break;
          for (const event of page.value) {
            if (cursorLe(event.cursor, input.through_cursor)) pages.push(event);
          }
          const last = page.value[page.value.length - 1]!.cursor;
          if (!cursorLe(last, input.through_cursor) || page.value.length < 500) break;
          if (BigInt(last) <= BigInt(after)) break;
          after = last;
        }
      }
      const highWater = pages.length === 0 ? "0" : pages[pages.length - 1]!.cursor;
      if (highWater !== input.through_cursor) {
        return refusal("backup", "NOT_FOUND", "backup cursor is not the journal tail at or below the requested cursor");
      }
      const stored = backupPublicJournalToStorageV1(pages);
      if (!stored.ok) return stored;
      const journal = stored.value;

      // Immutable blobs referenced by the exported prefix, read over the public port.
      const referenced = [...new Set(journal
        .filter((event) => event.record_id !== undefined && event.record_digest !== undefined)
        .map((event) => event.record_id!))].sort();
      const records: MemoryRecordV2[] = [];
      for (const recordId of referenced) {
        const read = await dependencies.store.readRecord({ record_id: recordId, system_as_of: input.through_cursor, authorization_receipt_digest: authorized.value.receipt_digest });
        if (!read.ok) {
          if (read.error.code === "NOT_FOUND" || read.error.code === "BLOB_MISSING") {
            return refusal("backup", "BACKUP_INVALID", `exported journal references an unreadable record blob ${recordId}`);
          }
          return { ok: false, error: { ...read.error, operation: "backup" as MemoryOperation } };
        }
        records.push(read.value);
      }
      const folded = foldMemoryJournalV1({ journal, records });
      if (!folded.ok) return { ok: false, error: { ...folded.error, operation: "backup" as MemoryOperation } };

      // Exclusion counts without pending material: candidate disposition from
      // journal operations only (O(journal); the previous per-batch
      // `nextProjectionBatch({limit:1})` loop re-folded the full journal on
      // every row). `withdrawn` counts every accepted candidate (accept moves
      // control to "withdrawn" in memory-store) plus explicit withdraws, hence
      // the name reads oddly but matches the historical control semantics.
      // Record blobs are read one by one over the public port (bounded by the
      // referenced set; no bulk read port exists).
      const disposition = countDisposition(journal);
      const derived = countDerivedProjections(journal);
      const excluded = { pending: disposition.pending, rejected: disposition.rejected, withdrawn: disposition.withdrawn, derived_projections: derived };

      const payload: BackupPayloadV2 = { schema_version: 2, generation: highWater, high_water_cursor: highWater, journal, records, excluded_counts: excluded };
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
      // Every manifest part is verified: a tampered field refuses even when
      // the digest-relevant roots still match.
      if (manifest.schema_version !== 1) return refusal("restore", "BACKUP_INVALID", "logical backup manifest schema is unsupported");
      if (!isCanonicalCursor(manifest.high_water_cursor) || !isCanonicalCursor(manifest.generation) || manifest.generation !== manifest.high_water_cursor) {
        return refusal("restore", "BACKUP_INVALID", "logical backup manifest cursors are not canonical");
      }
      if (JSON.stringify([...manifest.included_classes].sort()) !== JSON.stringify([...INCLUDED_CLASSES].sort())) {
        return refusal("restore", "BACKUP_INVALID", "logical backup manifest classes are not the export allowlist");
      }
      for (const digest of [manifest.records_root_digest, manifest.journal_root_digest, manifest.state_digest, manifest.terminal_ledger_digest, manifest.ciphertext_digest]) {
        if (!isDigest(digest)) return refusal("restore", "BACKUP_INVALID", "logical backup manifest carries a malformed digest");
      }
      // Key/object receipts bind the manifest to the key/object ports that
      // produced them: well-formedness first, exact binding after fetch below.
      if (!isDigest(manifest.key_receipt_digest) || !isDigest(manifest.object_receipt_digest)) {
        return refusal("restore", "BACKUP_INVALID", "logical backup manifest carries a malformed receipt");
      }
      if (typeof manifest.object_ref !== "string" || manifest.object_ref.length === 0) {
        return refusal("restore", "BACKUP_INVALID", "logical backup manifest carries a malformed object reference");
      }
      const excluded = manifest.excluded_counts;
      if (excluded === undefined || !Number.isSafeInteger(excluded.pending) || excluded.pending < 0
        || !Number.isSafeInteger(excluded.rejected) || excluded.rejected < 0
        || !Number.isSafeInteger(excluded.withdrawn) || excluded.withdrawn < 0
        || !Number.isSafeInteger(excluded.derived_projections) || excluded.derived_projections < 0) {
        return refusal("restore", "BACKUP_INVALID", "logical backup manifest carries malformed exclusion counts");
      }
      const object = await dependencies.backup_object.get({ source_ref: input.source_ref, object_ref: manifest.object_ref, expected_ciphertext_digest: manifest.ciphertext_digest });
      if (!object.ok) return object;
      if (object.value.object_receipt_digest !== manifest.object_receipt_digest) {
        return refusal("restore", "BACKUP_INVALID", "logical backup object receipt does not match the manifest");
      }
      const opened = await dependencies.backup_key.open({ key_ref: input.decryption_key_ref, ciphertext: object.value.ciphertext, context_digest: contextDigest(manifest.high_water_cursor) });
      if (!opened.ok) return opened;
      if (opened.value.key_receipt_digest !== manifest.key_receipt_digest) {
        return refusal("restore", "BACKUP_INVALID", "logical backup key receipt does not match the manifest");
      }
      let payload: BackupPayload;
      try {
        payload = JSON.parse(opened.value.plaintext) as BackupPayload;
      } catch {
        return refusal("restore", "BACKUP_INVALID", "logical backup payload is not decodable");
      }
      if ((payload.schema_version !== 1 && payload.schema_version !== 2) || !Array.isArray(payload.journal) || !Array.isArray(payload.records)
        || typeof payload.generation !== "string" || typeof payload.high_water_cursor !== "string") {
        return refusal("restore", "BACKUP_INVALID", "logical backup payload is malformed");
      }
      // Rétrocompatibilité payload v1 (origin/main, sans excluded_counts) :
      // les comptes sont recalculés depuis le journal ; le dérivé, absent du
      // payload v1, reprend la valeur du manifeste.
      let payloadCounts = payload.excluded_counts;
      if (payload.schema_version === 1 && payloadCounts === undefined) {
        const recomputed = countDisposition(payload.journal as ReadonlyArray<{ operation: string; candidate_id?: string }>);
        payloadCounts = { ...recomputed, derived_projections: excluded.derived_projections };
      }
      if (payloadCounts === undefined) {
        return refusal("restore", "BACKUP_INVALID", "logical backup payload is malformed");
      }
      if (payload.generation !== manifest.generation || payload.high_water_cursor !== manifest.high_water_cursor) {
        return refusal("restore", "BACKUP_INVALID", "logical backup payload cursors do not match the manifest");
      }
      if (payloadCounts.pending !== excluded.pending || payloadCounts.rejected !== excluded.rejected
        || payloadCounts.withdrawn !== excluded.withdrawn || payloadCounts.derived_projections !== excluded.derived_projections) {
        return refusal("restore", "BACKUP_INVALID", "logical backup exclusion counts do not match the manifest");
      }
      const payloadDisposition = countDisposition(payload.journal as ReadonlyArray<{ operation: string; candidate_id?: string }>);
      if (payloadDisposition.pending !== payloadCounts.pending || payloadDisposition.rejected !== payloadCounts.rejected
        || payloadDisposition.withdrawn !== payloadCounts.withdrawn) {
        return refusal("restore", "BACKUP_INVALID", "logical backup exclusion counts do not match its journal");
      }
      if (countDerivedProjections(payload.journal as ReadonlyArray<{ operation: string }>) !== payloadCounts.derived_projections) {
        return refusal("restore", "BACKUP_INVALID", "logical backup derived projection count does not match its journal");
      }

      const folded = foldMemoryJournalV1({ journal: payload.journal, records: payload.records });
      if (!folded.ok) return { ok: false, error: { ...folded.error, operation: "restore" } };
      if (folded.value.journal_root_hash !== manifest.journal_root_digest) return refusal("restore", "BACKUP_INVALID", "restored journal root does not match the manifest");
      if (recordsRootDigest(payload.records) !== manifest.records_root_digest) return refusal("restore", "BACKUP_INVALID", "restored record blobs do not match the manifest");
      if (terminalLedgerDigest(folded.value) !== manifest.terminal_ledger_digest) return refusal("restore", "RESTORE_REFUSED", "restored terminal ledger does not preserve tombstone dominance");
      if (folded.value.canonical_state_digest !== manifest.state_digest) return refusal("restore", "RESTORE_REFUSED", "restored canonical state digest differs from the backup");

      // D-11 B durable path: a verified restore WRITES into the target store.
      // The expected canonical pair travels into the import so the store can
      // compare BEFORE commit — a mismatch rolls back instead of leaving a
      // written target behind with RESTORE_REFUSED.
      if (input.target_store !== undefined) {
        const target = input.target_store;
        if (typeof target.importLogicalBackup !== "function") {
          return refusal("restore", "CAPABILITY_UNAVAILABLE", "restore target cannot import a logical backup");
        }
        const imported = await target.importLogicalBackup({
          journal: backupStorageJournalToPublicV1(payload.journal),
          records: payload.records,
          expected_restored_cursor: manifest.high_water_cursor,
          expected_canonical_state_digest: manifest.state_digest,
        });
        if (!imported.ok) return imported;
        const receiptBody = { restored_cursor: imported.value.restored_cursor, canonical_state_digest: imported.value.canonical_state_digest };
        return { ok: true, value: { ...receiptBody, receipt_digest: receiptDigest("logical-restore", receiptBody) } };
      }

      const derivedLexical = deriveAcceptedLexicalDocumentsV1(folded.value, payload.records);
      const derivedOutbox = deriveRebuildOutboxBatchV1(folded.value, payload.records);
      const store = createInMemoryCanonicalMemoryStoreV1({
        clock: dependencies.clock,
        persistence: { journal: payload.journal, controls: [], envelopes: [], records: payload.records, lexical: [...derivedLexical], outbox: [...derivedOutbox] },
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
