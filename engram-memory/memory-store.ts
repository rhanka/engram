import { canonicalizeJcs, normalizeCanonicalJson } from "./canonical-json.js";
import { memoryRecordDigest, receiptDigest } from "./digests.js";
import { isVisibleAtDualAsOf } from "./dual-as-of.js";
import { markInMemoryStoreV1 } from "./store-factory.js";
import { isCanonicalCursor, validateMemoryRecord } from "./validation.js";
import { backupPublicJournalToStorageV1, deriveAcceptedLexicalDocumentsV1, deriveRebuildOutboxBatchV1 } from "./logical-backup.js";
import type {
  AcceptedCandidateSnapshotV1,
  AdmissionStoreInputV1,
  CanonicalMemoryStorePort,
  CanonicalStoreCapabilitiesV1,
  CanonicalTransactionReceiptV1,
  CaptureIdempotencyRecordV1,
  ClockPort,
  Cursor,
  Digest,
  LifecycleCommandV1,
  LifecycleEventV2,
  LogicalBackupImportInputV1,
  LogicalBackupImportReceiptV1,
  MemoryErrorCode,
  MemoryOperation,
  MemoryRecordV2,
  MemoryState,
  OpaqueRef,
  OperationalCapabilityReceiptV1,
  PendingControlV1,
  PersistedAdmissionOutcomeV1,
  PersistedCaptureIdempotencyV1,
  ProjectionBatchV1,
  ProjectionRecordV1,
  ProjectionInvalidationReceiptV1,
  RecoveryCheckpointManifestV1,
  ReconciliationEventBindingV1,
  Result,
  SealedCandidateEnvelopeV1,
} from "./contracts/index.js";

const ZERO_HASH = `sha256:${"0".repeat(64)}` as Digest;
const MAX_CURSOR = 18_446_744_073_709_551_615n;

type JournalOperation = LifecycleEventV2["operation"];

/** The hash-only journal representation. Body material is always a separate immutable blob. */
export interface MemoryJournalEventV1 {
  schema_version: 1;
  event_id: string;
  cursor: Cursor;
  recorded_at: string;
  operation: JournalOperation;
  candidate_id?: string;
  record_id?: string;
  related_record_id?: string;
  from_state?: MemoryState;
  to_state: MemoryState;
  valid_effective_at?: number;
  record_digest?: Digest;
  authorization_receipt_digest: Digest;
  admission_decision?: LifecycleEventV2["admission_decision"];
  reason_ref?: string;
  event_anchor?: LifecycleEventV2["event_anchor"];
  reconciliation?: ReconciliationEventBindingV1;
  previous_event_hash: Digest;
  event_hash: Digest;
}

export interface CurrentnessIntervalV1 {
  accepted_cursor: Cursor;
  last_current_cursor?: Cursor;
}

export interface FoldedMemoryStateV1 {
  high_water_cursor: Cursor;
  journal_root_hash: Digest;
  canonical_state_digest: Digest;
  candidates: ReadonlyArray<{ candidate_id: string; state: "pending" | "rejected" | "withdrawn" }>;
  records: ReadonlyArray<{
    record_id: string;
    state: MemoryState;
    record_digest?: Digest;
    effective_expires_at?: string;
    currentness: ReadonlyArray<CurrentnessIntervalV1>;
    terminal: boolean;
  }>;
}

export interface MemoryJournalCheckpointV1 {
  schema_version: 1;
  high_water_cursor: Cursor;
  journal: ReadonlyArray<MemoryJournalEventV1>;
  records: ReadonlyArray<MemoryRecordV2>;
  canonical_state_digest: Digest;
}

export interface MemoryJournalTailV1 {
  journal: ReadonlyArray<MemoryJournalEventV1>;
  records: ReadonlyArray<MemoryRecordV2>;
  capture_idempotency?: ReadonlyArray<PersistedCaptureIdempotencyV1>;
  admission_outcomes?: ReadonlyArray<PersistedAdmissionOutcomeV1>;
}

export interface InMemoryRecoveryCheckpointV1 extends MemoryJournalCheckpointV1 {
  manifest: RecoveryCheckpointManifestV1;
  controls: ReadonlyArray<PendingControlV1>;
  envelopes: ReadonlyArray<SealedCandidateEnvelopeV1>;
  lexical: ReadonlyArray<{ record_id: string; document: import("./contracts/index.js").AcceptedLexicalDocumentV1 }>;
  outbox: ReadonlyArray<ProjectionBatchV1>;
  capture_idempotency?: ReadonlyArray<PersistedCaptureIdempotencyV1>;
  admission_outcomes?: ReadonlyArray<PersistedAdmissionOutcomeV1>;
}

/** Durable X1 capture-idempotence entry: the recorded acknowledgement per candidate identity. */
export type { PersistedCaptureIdempotencyV1 } from "./contracts/index.js";

/** Durable MCP-L2 admission replay proof per candidate identity. */
export type { PersistedAdmissionOutcomeV1 } from "./contracts/index.js";

/** The canonical restore identity is (journal state digest, registry root). Order is immaterial. */
export function captureIdempotencyDigestV1(entries: ReadonlyArray<PersistedCaptureIdempotencyV1>): Digest {
  return receiptDigest("capture-idempotency", { entries: [...entries].sort((a, b) => a.candidate_id.localeCompare(b.candidate_id)) });
}

/** Complete serializable state used by durable canonical-store adapters. */
export interface InMemoryStoreStateV1 {
  journal: ReadonlyArray<MemoryJournalEventV1>;
  controls: ReadonlyArray<PendingControlV1>;
  envelopes: ReadonlyArray<SealedCandidateEnvelopeV1>;
  records: ReadonlyArray<MemoryRecordV2>;
  lexical: ReadonlyArray<{ record_id: string; document: import("./contracts/index.js").AcceptedLexicalDocumentV1 }>;
  outbox: ReadonlyArray<ProjectionBatchV1>;
  capture_idempotency?: ReadonlyArray<PersistedCaptureIdempotencyV1>;
  admission_outcomes?: ReadonlyArray<PersistedAdmissionOutcomeV1>;
}

export interface InMemoryCanonicalMemoryStoreOptionsV1 {
  clock: ClockPort;
  store_id?: string;
  /** Durable adapters bind the receipt AND its registry entry before persistence. */
  storage_epoch?: Cursor;
  recovery?: { checkpoint: InMemoryRecoveryCheckpointV1; tail?: MemoryJournalTailV1 };
  persistence?: InMemoryStoreStateV1;
}

export interface InMemoryCanonicalMemoryStoreV1 extends CanonicalMemoryStorePort {
  // Always present on the in-memory core (and its fenced SQLite/Postgres
  // wrappers); only third-party CanonicalMemoryStorePort implementations may
  // omit these optional port members; ordinary capture remains compatible.
  readCaptureIdempotency(input: { candidate_id: string }): Promise<Result<CaptureIdempotencyRecordV1>>;
  readCaptureIdempotencyEntries(input: { through_cursor: Cursor }): Promise<Result<ReadonlyArray<PersistedCaptureIdempotencyV1>>>;
  recordCaptureIdempotency(input: { candidate_id: string; record_digest: Digest }): Promise<Result<CaptureIdempotencyRecordV1>>;
  readAdmissionOutcome(input: { candidate_id: string }): Promise<Result<PersistedAdmissionOutcomeV1>>;
  exportCheckpointForRecovery(through_cursor: Cursor, journal?: ReadonlyArray<MemoryJournalEventV1>): Result<InMemoryRecoveryCheckpointV1>;
  exportTailForRecovery(after_cursor: Cursor): Result<MemoryJournalTailV1>;
  exportStateForPersistence(): Result<InMemoryStoreStateV1>;
  canonicalStateDigest(): Result<Digest>;
}

interface FoldRecord {
  state: MemoryState;
  record_digest?: Digest;
  currentness: CurrentnessIntervalV1[];
  terminal: boolean;
}

interface FoldCandidate {
  state: "pending" | "rejected" | "withdrawn";
}

interface FoldInput {
  journal?: ReadonlyArray<MemoryJournalEventV1>;
  checkpoint?: MemoryJournalCheckpointV1;
  tail?: ReadonlyArray<MemoryJournalEventV1> | MemoryJournalTailV1;
  records?: ReadonlyArray<MemoryRecordV2>;
}

function refusal<T>(operation: MemoryOperation, code: MemoryErrorCode, message: string): Result<T> {
  return { ok: false, error: { code, operation, message, retryable: false } };
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function defined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T;
}

function clone<T>(value: T): T {
  return normalizeCanonicalJson(value) as T;
}

function cursorCompare(left: Cursor, right: Cursor): number {
  const a = BigInt(left);
  const b = BigInt(right);
  return a === b ? 0 : a < b ? -1 : 1;
}

function previousCursor(cursor: Cursor): Cursor {
  const value = BigInt(cursor);
  return value === 0n ? "0" : (value - 1n).toString();
}

function nextCursor(cursor: Cursor): Cursor | undefined {
  const value = BigInt(cursor);
  return value >= MAX_CURSOR ? undefined : (value + 1n).toString();
}

function isInstant(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    && new Date(value).toISOString() === value;
}

function isDigest(value: unknown): value is Digest {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
}

function isOpaqueRef(value: unknown): value is OpaqueRef {
  if (typeof value !== "string" || value.length === 0) return false;
  try {
    if (value.normalize("NFC") !== value) return false;
  } catch {
    return false;
  }
  const bytes = new TextEncoder().encode(value).byteLength;
  return bytes >= 1 && bytes <= 512;
}

function journalHashInput(event: MemoryJournalEventV1): Record<string, unknown> {
  const { event_hash: _eventHash, ...rest } = event;
  return rest;
}

/** Domain-separated, canonical hash for the immutable writer-assigned journal event. */
export function memoryJournalEventHashV1(event: Omit<MemoryJournalEventV1, "event_hash"> | MemoryJournalEventV1): Digest {
  const { event_hash: _eventHash, ...body } = event as MemoryJournalEventV1;
  return receiptDigest("memory-journal-event", body);
}

function journalIntentHash(event: Omit<MemoryJournalEventV1, "cursor" | "previous_event_hash" | "event_hash">): Digest {
  return receiptDigest("memory-journal-intent", event);
}

function journalRoot(events: ReadonlyArray<MemoryJournalEventV1>): Digest {
  return events.length === 0 ? ZERO_HASH : events[events.length - 1]!.event_hash;
}

function recordsFor(input: FoldInput): Map<string, MemoryRecordV2> {
  const records = new Map<string, MemoryRecordV2>();
  const add = (record: MemoryRecordV2) => records.set(record.record_id, clone(record));
  input.checkpoint?.records.forEach(add);
  input.records?.forEach(add);
  if (input.tail !== undefined && isJournalTail(input.tail)) input.tail.records.forEach(add);
  return records;
}

function journalFor(input: FoldInput): ReadonlyArray<MemoryJournalEventV1> {
  if (input.journal !== undefined) return input.journal;
  const prefix = input.checkpoint?.journal ?? [];
  if (input.tail === undefined) return prefix;
  return [...prefix, ...(isJournalTail(input.tail) ? input.tail.journal : input.tail)];
}

function isJournalTail(value: ReadonlyArray<MemoryJournalEventV1> | MemoryJournalTailV1): value is MemoryJournalTailV1 {
  return !Array.isArray(value) && "journal" in value && "records" in value;
}

function validateRecordBlob(record: MemoryRecordV2): boolean {
  const valid = validateMemoryRecord(record);
  return valid.ok && memoryRecordDigest(record) === record.record_digest;
}

function closeCurrent(record: FoldRecord, cursor: Cursor): void {
  const interval = record.currentness[record.currentness.length - 1];
  if (interval !== undefined && interval.last_current_cursor === undefined) interval.last_current_cursor = previousCursor(cursor);
}

function openCurrent(record: FoldRecord, cursor: Cursor): void {
  const interval = record.currentness[record.currentness.length - 1];
  if (interval === undefined || interval.last_current_cursor !== undefined) record.currentness.push({ accepted_cursor: cursor });
}

function stateDigest(records: Map<string, FoldRecord>, candidates: Map<string, FoldCandidate>, highWater: Cursor, root: Digest, blobs: Map<string, MemoryRecordV2>): Digest {
  const value = {
    high_water_cursor: highWater,
    journal_root_hash: root,
    candidates: [...candidates.entries()].map(([candidate_id, candidate]) => ({ candidate_id, state: candidate.state })).sort((a, b) => a.candidate_id.localeCompare(b.candidate_id)),
    records: [...records.entries()].map(([record_id, record]) => defined({
      record_id,
      state: record.state,
      record_digest: record.record_digest,
      effective_expires_at: blobs.get(record_id)?.retention.expires_at,
      currentness: record.currentness,
      terminal: record.terminal,
    })).sort((a, b) => String(a.record_id).localeCompare(String(b.record_id))),
    blobs: [...blobs.values()].map((record) => ({ record_id: record.record_id, record_digest: record.record_digest })).sort((a, b) => a.record_id.localeCompare(b.record_id)),
  };
  return receiptDigest("memory-fold-state", value);
}

/** Verifies a dense journal and folds the closed lifecycle table without interpreting body text. */
export function foldMemoryJournalV1(input: FoldInput): Result<FoldedMemoryStateV1> {
  const journal = journalFor(input).map(clone);
  const blobs = recordsFor(input);
  let expectedCursor = "1";
  let previousHash = ZERO_HASH;
  const eventIds = new Map<string, Digest>();
  const candidates = new Map<string, FoldCandidate>();
  const records = new Map<string, FoldRecord>();

  for (const event of journal) {
    if (event.schema_version !== 1 || !isCanonicalCursor(event.cursor) || !isInstant(event.recorded_at)
      || !isDigest(event.previous_event_hash) || !isDigest(event.event_hash) || !isDigest(event.authorization_receipt_digest)) {
      return refusal("admin", "JOURNAL_CORRUPT", "journal event is malformed");
    }
    const duplicateHash = eventIds.get(event.event_id);
    if (duplicateHash !== undefined) {
      if (duplicateHash === event.event_hash) continue;
      return refusal("admin", "DIGEST_CONFLICT", "journal event id is bound to a different hash");
    }
    if (event.cursor !== expectedCursor) return refusal("admin", "CURSOR_GAP", "journal cursor is not dense");
    if (event.previous_event_hash !== previousHash || memoryJournalEventHashV1(event) !== event.event_hash) {
      return refusal("admin", "JOURNAL_CORRUPT", "journal hash chain is broken");
    }
    if (event.record_id !== undefined && event.record_digest !== undefined) {
      const blob = blobs.get(event.record_id);
      if (blob === undefined) return refusal("admin", "BLOB_MISSING", "journal event references a missing immutable record blob");
      if (!validateRecordBlob(blob) || blob.record_digest !== event.record_digest) {
        return refusal("admin", "JOURNAL_CORRUPT", "journal record digest does not match its immutable blob");
      }
    }
    eventIds.set(event.event_id, event.event_hash);
    previousHash = event.event_hash;
    expectedCursor = nextCursor(event.cursor) ?? event.cursor;

    if (event.operation === "capture") {
      if (event.candidate_id === undefined) return refusal("admin", "JOURNAL_CORRUPT", "capture lacks candidate identity");
      candidates.set(event.candidate_id, { state: "pending" });
      continue;
    }
    if (event.operation === "reject" || event.operation === "withdraw") {
      if (event.candidate_id === undefined) return refusal("admin", "JOURNAL_CORRUPT", "candidate transition lacks candidate identity");
      candidates.set(event.candidate_id, { state: event.operation === "reject" ? "rejected" : "withdrawn" });
      continue;
    }
    if (event.record_id === undefined) return refusal("admin", "JOURNAL_CORRUPT", "record transition lacks record identity");
    const prior = records.get(event.record_id);
    const record: FoldRecord = prior ?? { state: event.to_state, record_digest: event.record_digest, currentness: [], terminal: false };
    if (prior?.state === "accepted_current" && event.to_state !== "accepted_current") closeCurrent(record, event.cursor);
    if (event.to_state === "accepted_current" && prior?.state !== "accepted_current") openCurrent(record, event.cursor);
    if (event.operation === "accept") openCurrent(record, event.cursor);
    record.state = record.terminal ? "tombstoned" : event.to_state;
    record.record_digest ??= event.record_digest;
    record.terminal ||= event.to_state === "tombstoned";
    if (record.terminal) record.state = "tombstoned";
    records.set(event.record_id, record);

    if (event.operation === "rewind" && event.related_record_id !== undefined) {
      const related = records.get(event.related_record_id);
      if (related !== undefined && !related.terminal) {
        if (related.state === "accepted_current") closeCurrent(related, event.cursor);
        related.state = "historical";
      }
    }
  }

  const highWater = journal.length === 0 ? "0" : journal[journal.length - 1]!.cursor;
  const root = journalRoot(journal);
  const canonicalStateDigest = stateDigest(records, candidates, highWater, root, blobs);
  return {
    ok: true,
    value: {
      high_water_cursor: highWater,
      journal_root_hash: root,
      canonical_state_digest: canonicalStateDigest,
      candidates: [...candidates.entries()].map(([candidate_id, candidate]) => ({ candidate_id, state: candidate.state })).sort((a, b) => a.candidate_id.localeCompare(b.candidate_id)),
      records: [...records.entries()].map(([record_id, record]) => defined({
        record_id,
        state: record.state,
        record_digest: record.record_digest,
        effective_expires_at: blobs.get(record_id)?.retention.expires_at,
        currentness: record.currentness,
        terminal: record.terminal,
      })).sort((a, b) => String(a.record_id).localeCompare(String(b.record_id))) as FoldedMemoryStateV1["records"],
    },
  };
}

function lifecycleFromJournal(event: MemoryJournalEventV1): LifecycleEventV2 {
  return {
    ...clone(event),
    schema_version: 2,
    previous_event_digest: event.previous_event_hash,
    event_digest: event.event_hash,
  } as LifecycleEventV2;
}

function operationForEvent(event: MemoryJournalEventV1): MemoryOperation {
  return event.operation === "accept" ? "request_admission" : event.operation;
}

function batchDigest(batch: Omit<ProjectionBatchV1, "batch_digest">): Digest {
  return receiptDigest("projection-batch", batch);
}

class InMemoryCanonicalStore implements InMemoryCanonicalMemoryStoreV1 {
  readonly version = 1 as const;
  readonly scoped_reads: import("./contracts/index.js").ScopedCanonicalReadPortV1 = {
    version: 1,
    acceptedSnapshot: async input => {
      if (!this.#scopeBound(input)) return refusal("recall_current", "UNAUTHORIZED", "scoped read binding is unavailable");
      return this.#acceptedSnapshotReadOnly(input, input.scope_ref);
    },
    readRecord: async input => {
      if (!this.#scopeBound(input)) return refusal("recall_current", "UNAUTHORIZED", "scoped read binding is unavailable");
      const ready = this.#readiness("recall_current");
      if (!ready.ok) return ready;
      if (!isCanonicalCursor(input.system_as_of) || cursorCompare(input.system_as_of, ready.value.high_water_cursor) > 0) return refusal("recall_current", "STALE_PAGE", "system cursor is unavailable");
      const record = this.#records.get(input.record_id);
      if (record === undefined || record.scope_ref !== input.scope_ref || cursorCompare(record.recorded_cursor, input.system_as_of) > 0) return refusal("recall_current", "NOT_FOUND", "record unavailable");
      return { ok: true, value: clone(record) };
    },
  };

  #scopeBound(input: import("./contracts/index.js").ScopedReadBindingV1 & { authorization_receipt_digest: Digest }): boolean {
    return typeof input.scope_ref === "string" && input.scope_ref.length > 0
      && input.authorization?.allowed === true && input.authorization.operation === "recall_current"
      && input.authorization.scope_ref === input.scope_ref
      && input.authorization.receipt_digest === input.authorization_receipt_digest
      && input.authorization.receipt_digest === receiptDigest("authorization-allowed", { ...input.authorization });
  }
  readonly capabilities: CanonicalStoreCapabilitiesV1 = {
    atomic_promotion: true,
    dense_cursor: true,
    accepted_only_lexical: true,
    fenced_single_writer: false,
    revocable_active_store: false,
    detached_snapshot: false,
    bounded_cancellation: true,
    backend: "memory",
  };
  #journal: MemoryJournalEventV1[] = [];
  // X1 durable idempotence registry: candidate identity → clock-independent
  // content binding + RECORDED acknowledgement (cursor, record digest,
  // transaction receipt digest). Written on every bound first commit and
  // completed by the engine once the acknowledgement is built; never deleted
  // by admission/rejection/envelope destruction (unlike controls and
  // envelopes). Restored from persisted entries on load, backfilled from
  // controls for entries predating the recording.
  #captureIdempotency = new Map<string, { content: Digest; cursor: Cursor; recordDigest?: Digest; receiptDigest?: Digest }>();
  #captureIdempotencyCorrupt = false;
  // MCP-L2 durable admission replay proof: recorded atomically with the
  // admission effect, read after envelope destruction. Append-only.
  #admissionOutcomes = new Map<string, PersistedAdmissionOutcomeV1>();
  #admissionOutcomesCorrupt = false;
  #admissionOutcomesVerifyPending = false;
  #controls = new Map<string, PendingControlV1>();
  #envelopes = new Map<string, SealedCandidateEnvelopeV1>();
  #records = new Map<string, MemoryRecordV2>();
  #lexical = new Map<string, import("./contracts/index.js").AcceptedLexicalDocumentV1>();
  #outbox: ProjectionBatchV1[] = [];
  #intentByEventId = new Map<string, Digest>();
  #closed = false;
  #checkpoint?: InMemoryRecoveryCheckpointV1;

  constructor(private readonly options: InMemoryCanonicalMemoryStoreOptionsV1) {
    const persistence = options.persistence;
    if (persistence !== undefined) {
      this.#journal = persistence.journal.map(clone);
      persistence.records.forEach((record) => this.#records.set(record.record_id, clone(record)));
      persistence.controls.forEach((control) => this.#controls.set(control.candidate_id, clone(control)));
      persistence.envelopes.forEach((sealed) => this.#envelopes.set(sealed.candidate_id, clone(sealed)));
      persistence.lexical.forEach(({ record_id, document }) => this.#lexical.set(record_id, clone(document)));
      this.#outbox = persistence.outbox.map(clone);
      this.#rebuildIntentIndex();
      this.#restoreCaptureIdempotency(persistence.capture_idempotency);
      this.#restoreAdmissionOutcomes(persistence.admission_outcomes);
      return;
    }
    const recovery = options.recovery;
    if (recovery === undefined) return;
    this.#checkpoint = clone(recovery.checkpoint);
    this.#journal = recovery.checkpoint.journal.map(clone);
    recovery.checkpoint.records.forEach((record) => this.#records.set(record.record_id, clone(record)));
    recovery.checkpoint.controls.forEach((control) => this.#controls.set(control.candidate_id, clone(control)));
    recovery.checkpoint.envelopes.forEach((sealed) => this.#envelopes.set(sealed.candidate_id, clone(sealed)));
    recovery.checkpoint.lexical.forEach(({ record_id, document }) => this.#lexical.set(record_id, clone(document)));
    this.#outbox = recovery.checkpoint.outbox.map(clone);
    const tail = recovery.tail;
    if (tail !== undefined) {
      tail.records.forEach((record) => this.#records.set(record.record_id, clone(record)));
      this.#journal.push(...tail.journal.map(clone));
    }
    this.#rebuildIntentIndex();
    this.#restoreCaptureIdempotency([
      ...(recovery.checkpoint.capture_idempotency ?? []),
      ...(tail?.capture_idempotency ?? []),
    ]);
    this.#restoreAdmissionOutcomes([
      ...(recovery.checkpoint.admission_outcomes ?? []),
      ...(tail?.admission_outcomes ?? []),
    ]);
  }

  // Restores the durable registry from persisted entries, then backfills any
  // bound identity missing from it (entries predating the recording) from its
  // control. Persisted entries win: they carry the recorded acknowledgement.
  #restoreCaptureIdempotency(entries: ReadonlyArray<PersistedCaptureIdempotencyV1> | undefined): void {
    this.#captureIdempotency.clear();
    if (entries !== undefined && !Array.isArray(entries)) { this.#captureIdempotencyCorrupt = true; return; }
    for (const entry of entries ?? []) {
      if (entry === null || typeof entry !== "object" || typeof entry.candidate_id !== "string" || entry.candidate_id.length === 0
        || !isDigest(entry.content) || !isCanonicalCursor(entry.cursor)
        || (entry.record_digest !== undefined && !isDigest(entry.record_digest))
        || (entry.receipt_digest !== undefined && !isDigest(entry.receipt_digest))) {
        this.#captureIdempotencyCorrupt = true; return;
      }
      const event = this.#journal.find(event => event.operation === "capture" && event.candidate_id === entry.candidate_id);
      const control = this.#controls.get(entry.candidate_id);
      const prior = this.#captureIdempotency.get(entry.candidate_id);
      if (event?.cursor !== entry.cursor
        || (control?.capture_content_digest !== undefined && control.capture_content_digest !== entry.content)
        || (control?.capture_receipt_digest !== undefined && control.capture_receipt_digest !== entry.receipt_digest)
        || prior !== undefined) {
        this.#captureIdempotencyCorrupt = true; return;
      }
      this.#captureIdempotency.set(entry.candidate_id, defined({
        content: entry.content,
        cursor: entry.cursor,
        recordDigest: entry.record_digest,
        receiptDigest: entry.receipt_digest,
      }));
    }
    this.#backfillCaptureIdempotency();
  }

  #exportCaptureIdempotency(): PersistedCaptureIdempotencyV1[] {
    return [...this.#captureIdempotency.entries()].map(([candidate_id, entry]) => defined({
      candidate_id,
      content: entry.content,
      cursor: entry.cursor,
      record_digest: entry.recordDigest,
      receipt_digest: entry.receiptDigest,
    }));
  }

  // Restores the durable admission replay proof. Restore validates the
  // closed shape immediately; the journal binding is verified once, after a
  // successful fold, so fold errors (gap, hash chain) keep their pinned
  // precedence over registry disagreements. Persisted entries win over
  // journal derivation: the receipt digest is only recorded.
  #restoreAdmissionOutcomes(entries: ReadonlyArray<PersistedAdmissionOutcomeV1> | undefined): void {
    this.#admissionOutcomes.clear();
    this.#admissionOutcomesVerifyPending = false;
    if (entries !== undefined && !Array.isArray(entries)) { this.#admissionOutcomesCorrupt = true; return; }
    for (const entry of entries ?? []) {
      if (entry === null || typeof entry !== "object" || typeof entry.candidate_id !== "string" || entry.candidate_id.length === 0
        || !isOpaqueRef(entry.scope_ref) || (entry.status !== "accepted" && entry.status !== "rejected")
        || !isCanonicalCursor(entry.cursor) || !isDigest(entry.decision_receipt_digest) || !isDigest(entry.transaction_receipt_digest)
        || (entry.status === "accepted"
          ? (typeof entry.record_id !== "string" || entry.record_id.length === 0)
          : (entry.record_id !== undefined))
        || this.#admissionOutcomes.has(entry.candidate_id)) {
        this.#admissionOutcomesCorrupt = true; return;
      }
      this.#admissionOutcomes.set(entry.candidate_id, clone(entry));
    }
    this.#admissionOutcomesVerifyPending = this.#admissionOutcomes.size > 0;
  }

  // One-shot journal binding check, after a successful fold: every restored
  // entry must match its journal accept/reject event (same candidate, same
  // cursor, same decision receipt). Journal appends never invalidate an
  // established binding, so verified entries stay verified.
  #verifyAdmissionOutcomes(): Result<{ verified: true }> {
    for (const entry of this.#admissionOutcomes.values()) {
      const event = this.#journal.find((candidate) => candidate.candidate_id === entry.candidate_id
        && (candidate.operation === "accept" || candidate.operation === "reject"));
      if (event === undefined || event.cursor !== entry.cursor) return refusal("admin", "JOURNAL_CORRUPT", "admission outcome disagrees with its canonical decision");
      if (entry.status === "accepted") {
        if (event.operation !== "accept" || event.record_id !== entry.record_id
          || event.admission_decision?.receipt_digest !== entry.decision_receipt_digest) {
          return refusal("admin", "JOURNAL_CORRUPT", "admission outcome disagrees with its canonical decision");
        }
      } else if (event.operation !== "reject" || event.admission_decision?.receipt_digest !== entry.decision_receipt_digest) {
        return refusal("admin", "JOURNAL_CORRUPT", "admission outcome disagrees with its canonical decision");
      }
    }
    this.#admissionOutcomesVerifyPending = false;
    return { ok: true, value: { verified: true } };
  }

  #exportAdmissionOutcomes(): PersistedAdmissionOutcomeV1[] {
    return [...this.#admissionOutcomes.values()].map(clone).sort((left, right) => left.candidate_id.localeCompare(right.candidate_id));
  }

  #backfillCaptureIdempotency(): void {
    for (const control of this.#controls.values()) {
      if (control.capture_content_digest === undefined) continue;
      const known = this.#captureIdempotency.get(control.candidate_id);
      if (known !== undefined) {
        if (known.receiptDigest === undefined && control.capture_receipt_digest !== undefined) known.receiptDigest = control.capture_receipt_digest;
        continue;
      }
      this.#captureIdempotency.set(control.candidate_id, defined({
        content: control.capture_content_digest,
        cursor: control.created_cursor,
        receiptDigest: control.capture_receipt_digest,
      }));
    }
  }

  #rebuildIntentIndex(): void {
    this.#intentByEventId.clear();
    for (const event of this.#journal) this.#intentByEventId.set(event.event_id, journalIntentHash(this.#intentFromJournal(event)));
  }

  #intentFromJournal(event: MemoryJournalEventV1): Omit<MemoryJournalEventV1, "cursor" | "previous_event_hash" | "event_hash"> {
    const { cursor: _cursor, previous_event_hash: _previous, event_hash: _hash, ...intent } = event;
    return intent;
  }

  #readiness(operation: MemoryOperation): Result<FoldedMemoryStateV1> {
    if (this.#closed) return refusal(operation, "STORE_UNAVAILABLE", "canonical memory store is closed");
    if (this.#captureIdempotencyCorrupt) return refusal(operation, "JOURNAL_CORRUPT", "capture idempotency registry is malformed or disagrees with its canonical capture");
    if (this.#admissionOutcomesCorrupt) return refusal(operation, "JOURNAL_CORRUPT", "admission outcome registry is malformed or disagrees with its canonical decision");
    if (this.#checkpoint !== undefined) {
      const checkpointFold = foldMemoryJournalV1({ journal: this.#checkpoint.journal, records: this.#checkpoint.records });
      if (!checkpointFold.ok) return { ok: false, error: { ...checkpointFold.error, operation } };
      if (checkpointFold.value.canonical_state_digest !== this.#checkpoint.canonical_state_digest) {
        return refusal(operation, "JOURNAL_CORRUPT", "recovery checkpoint state digest does not match its complete journal fold");
      }
      const { manifest_digest: _manifestDigest, ...manifestBody } = this.#checkpoint.manifest;
      if (this.#checkpoint.manifest.manifest_digest !== receiptDigest("recovery-checkpoint", manifestBody)
        || this.#checkpoint.manifest.high_water_cursor !== this.#checkpoint.high_water_cursor
        || this.#checkpoint.manifest.state_digest !== this.#checkpoint.canonical_state_digest
        || this.#checkpoint.manifest.journal_root_digest !== checkpointFold.value.journal_root_hash) {
        return refusal(operation, "JOURNAL_CORRUPT", "recovery checkpoint manifest does not bind its complete fold");
      }
    }
    for (const control of this.#controls.values()) {
      if (control.state !== "pending") continue;
      const sealed = this.#envelopes.get(control.candidate_id);
      if (sealed === undefined || sealed.envelope_digest !== control.envelope_digest) {
        return refusal(operation, "JOURNAL_CORRUPT", "pending control does not bind an encrypted envelope");
      }
    }
    const folded = foldMemoryJournalV1({ journal: this.#journal, records: [...this.#records.values()] });
    if (!folded.ok) return { ok: false, error: { ...folded.error, operation } };
    if (this.#admissionOutcomesVerifyPending) {
      const verified = this.#verifyAdmissionOutcomes();
      if (!verified.ok) return { ok: false, error: { ...verified.error, operation } };
    }
    return folded;
  }

  #now(operation: MemoryOperation): Result<string> {
    const now = this.options.clock.now();
    return isInstant(now) ? { ok: true, value: now } : refusal(operation, "STORE_UNAVAILABLE", "clock did not supply a canonical instant");
  }

  #findDuplicate(intent: Omit<MemoryJournalEventV1, "cursor" | "previous_event_hash" | "event_hash">): Result<MemoryJournalEventV1 | undefined> {
    const prior = this.#intentByEventId.get(intent.event_id);
    if (prior === undefined) return { ok: true, value: undefined };
    const hash = journalIntentHash(intent);
    if (prior !== hash) return refusal("admin", "DIGEST_CONFLICT", "event id is already bound to a different hash");
    return { ok: true, value: this.#journal.find((event) => event.event_id === intent.event_id) };
  }

  #append(intent: Omit<MemoryJournalEventV1, "cursor" | "previous_event_hash" | "event_hash">): Result<{ event: MemoryJournalEventV1; duplicate: boolean }> {
    const ready = this.#readiness(operationForEvent(intent as MemoryJournalEventV1));
    if (!ready.ok) return ready;
    const duplicate = this.#findDuplicate(intent);
    if (!duplicate.ok) return duplicate;
    if (duplicate.value !== undefined) return { ok: true, value: { event: duplicate.value, duplicate: true } };
    const cursor = nextCursor(ready.value.high_water_cursor);
    if (cursor === undefined) return refusal(operationForEvent(intent as MemoryJournalEventV1), "STORE_UNAVAILABLE", "journal cursor is exhausted");
    const eventWithoutHash = { ...intent, cursor, previous_event_hash: ready.value.journal_root_hash };
    const event: MemoryJournalEventV1 = { ...eventWithoutHash, event_hash: memoryJournalEventHashV1(eventWithoutHash) };
    this.#journal.push(event);
    this.#intentByEventId.set(event.event_id, journalIntentHash(intent));
    return { ok: true, value: { event, duplicate: false } };
  }

  #receipt(operation: MemoryOperation, event: MemoryJournalEventV1, recordDigest?: Digest): Result<CanonicalTransactionReceiptV1> {
    const folded = this.#readiness(operation);
    if (!folded.ok) return folded;
    const now = this.#now(operation);
    if (!now.ok) return now;
    const lexicalDigest = receiptDigest("accepted-lexical", { documents: [...this.#lexical.entries()].sort(([a], [b]) => a.localeCompare(b)) });
    const outboxDigest = receiptDigest("projection-outbox", { batches: this.#outbox });
    const body = defined({
      operation,
      cursor: event.cursor,
      storage_epoch: this.options.storage_epoch ?? "0",
      record_digest: recordDigest,
      event_digest: event.event_hash,
      state_digest: folded.value.canonical_state_digest,
      lexical_digest: lexicalDigest,
      outbox_digest: outboxDigest,
      committed_at: now.value,
    });
    return { ok: true, value: { ...body, receipt_digest: receiptDigest("canonical-transaction", body) } as CanonicalTransactionReceiptV1 };
  }

  async commitPending(input: Parameters<CanonicalMemoryStorePort["commitPending"]>[0]): Promise<Result<CanonicalTransactionReceiptV1>> {
    const ready = this.#readiness("capture");
    if (!ready.ok) return ready;
    if (input.control.state !== "pending" || input.control.candidate_id !== input.sealed.candidate_id
      || input.control.envelope_digest !== input.sealed.envelope_digest) {
      return refusal("capture", "INVALID_SCHEMA", "pending control and sealed envelope do not exactly bind");
    }
    // X1 durable idempotence: the content check runs atomically with the key
    // reservation, before any journal append, envelope store, or cursor
    // allocation. The compared binding is clock-independent, so an exact replay
    // is recognised whatever the wall clock says; any drift is DIGEST_CONFLICT
    // with no write. Rows without a content binding keep the legacy event-id path.
    const incomingContent = input.control.capture_content_digest;
    const registered = this.#captureIdempotency.get(input.control.candidate_id);
    if (registered !== undefined && incomingContent !== undefined) {
      if (registered.content !== incomingContent) return refusal("capture", "DIGEST_CONFLICT", "candidate identity is already bound to different capture content");
      const original = this.#journal.find(event => event.operation === "capture" && event.candidate_id === input.control.candidate_id);
      return original === undefined
        ? refusal("capture", "JOURNAL_CORRUPT", "capture idempotency record does not bind a capture event")
        : this.#receipt("capture", original);
    }
    const existing = this.#controls.get(input.control.candidate_id);
    // A first commit has reserved its control before awaiting its receipt.
    // Direct V1 callers can overlap in that interval, before the registry is
    // completed; the reserved binding is already authoritative, without writes.
    if (existing?.capture_content_digest !== undefined && incomingContent !== undefined) {
      if (existing.capture_content_digest !== incomingContent) return refusal("capture", "DIGEST_CONFLICT", "candidate identity is already bound to different capture content");
      const original = this.#journal.find(event => event.operation === "capture" && event.candidate_id === input.control.candidate_id);
      return original === undefined
        ? refusal("capture", "JOURNAL_CORRUPT", "pending control does not bind a capture event")
        : this.#receipt("capture", original);
    }
    if (incomingContent !== undefined && this.#journal.some(event => event.operation === "capture" && event.candidate_id === input.control.candidate_id)) {
      return refusal("capture", "DIGEST_CONFLICT", "capture journal identity has no verifiable content registry (legacy restore)");
    }
    const intent = this.#intentFromLifecycle(input.capture_event, { candidate_id: input.control.candidate_id, to_state: "pending", operation: "capture" });
    const duplicate = this.#findDuplicate(intent);
    if (!duplicate.ok) return { ok: false, error: { ...duplicate.error, operation: "capture" } };
    if (duplicate.value !== undefined) return this.#receipt("capture", duplicate.value);
    if (existing !== undefined) return refusal("capture", "DIGEST_CONFLICT", "candidate identity already exists with different capture data");
    const appended = this.#append(intent);
    if (!appended.ok) return { ok: false, error: { ...appended.error, operation: "capture" } };
    const control = { ...clone(input.control), created_cursor: appended.value.event.cursor };
    this.#controls.set(control.candidate_id, control);
    this.#envelopes.set(control.candidate_id, clone(input.sealed));
    const receipt = await this.#receipt("capture", appended.value.event);
    if (!receipt.ok) return receipt;
    const stored = this.#controls.get(control.candidate_id);
    if (stored !== undefined) stored.capture_receipt_digest = receipt.value.receipt_digest;
    // The recorded acknowledgement starts here: content, cursor and the first
    // transaction receipt digest. The engine completes it with the record
    // digest once the acknowledgement is built (recordCaptureIdempotency).
    if (incomingContent !== undefined) {
      this.#captureIdempotency.set(control.candidate_id, defined({
        content: incomingContent,
        cursor: control.created_cursor,
        receiptDigest: receipt.value.receipt_digest,
      }));
    }
    return receipt;
  }

  async readCaptureIdempotency(input: { candidate_id: string }): Promise<Result<CaptureIdempotencyRecordV1>> {
    const ready = this.#readiness("capture");
    if (!ready.ok) return ready;
    const entry = this.#captureIdempotency.get(input.candidate_id);
    if (entry === undefined) return this.#journal.some(event => event.operation === "capture" && event.candidate_id === input.candidate_id)
      ? refusal("capture", "DIGEST_CONFLICT", "capture journal identity has no verifiable content registry (legacy restore)")
      : refusal("capture", "NOT_FOUND", "capture idempotency record is not available");
    return {
      ok: true,
      value: defined({
        candidate_id: input.candidate_id,
        capture_content_digest: entry.content,
        created_cursor: entry.cursor,
        record_digest: entry.recordDigest,
        capture_receipt_digest: entry.receiptDigest,
      }),
    };
  }

  async readCaptureIdempotencyEntries(input: { through_cursor: Cursor }): Promise<Result<ReadonlyArray<PersistedCaptureIdempotencyV1>>> {
    const ready = this.#readiness("backup");
    if (!ready.ok) return ready;
    if (!isCanonicalCursor(input.through_cursor)) return refusal("backup", "INVALID_SCHEMA", "registry backup cursor is invalid");
    return { ok: true, value: this.#exportCaptureIdempotency().filter(entry => cursorCompare(entry.cursor, input.through_cursor) <= 0)
      .sort((a, b) => a.candidate_id.localeCompare(b.candidate_id)) };
  }

  async recordCaptureIdempotency(input: { candidate_id: string; record_digest: Digest }): Promise<Result<CaptureIdempotencyRecordV1>> {
    const ready = this.#readiness("capture");
    if (!ready.ok) return ready;
    if (!isDigest(input.record_digest)) return refusal("capture", "INVALID_SCHEMA", "record digest is not canonical");
    const entry = this.#captureIdempotency.get(input.candidate_id);
    if (entry === undefined) return refusal("capture", "NOT_FOUND", "capture idempotency record is not available");
    if (entry.recordDigest !== undefined && entry.recordDigest !== input.record_digest) {
      return refusal("capture", "DIGEST_CONFLICT", "capture idempotency record is already bound to a different record digest");
    }
    entry.recordDigest = input.record_digest;
    return this.readCaptureIdempotency({ candidate_id: input.candidate_id });
  }

  async readPending(input: Parameters<CanonicalMemoryStorePort["readPending"]>[0]): Promise<Result<{ control: PendingControlV1; sealed: SealedCandidateEnvelopeV1 }>> {
    const ready = this.#readiness("request_admission");
    if (!ready.ok) return ready;
    const control = this.#controls.get(input.candidate_id);
    const sealed = this.#envelopes.get(input.candidate_id);
    if (control === undefined || sealed === undefined || control.state !== "pending") return refusal("request_admission", "NOT_FOUND", "pending candidate is not available");
    return { ok: true, value: { control: clone(control), sealed: clone(sealed) } };
  }

  async applyAdmission(input: AdmissionStoreInputV1): Promise<Result<CanonicalTransactionReceiptV1>> {
    const control = this.#controls.get(input.candidate_id);
    const intent = this.#intentFromLifecycle(input.event, {
      candidate_id: input.candidate_id,
      operation: input.outcome === "accept" ? "accept" : "reject",
      to_state: input.outcome === "accept" ? "accepted_current" : "rejected",
      record_id: input.outcome === "accept" ? input.record.record_id : undefined,
      record_digest: input.outcome === "accept" ? input.record.record_digest : undefined,
    });
    const duplicate = this.#findDuplicate(intent);
    if (!duplicate.ok) return { ok: false, error: { ...duplicate.error, operation: "request_admission" } };
    if (duplicate.value !== undefined) return this.#receipt("request_admission", duplicate.value, input.outcome === "accept" ? input.record.record_digest : undefined);
    if (control === undefined || control.state !== "pending") return refusal("request_admission", "ILLEGAL_TRANSITION", "admission requires a pending candidate");
    if (input.outcome === "accept") {
      const existing = this.#records.get(input.record.record_id);
      if (existing !== undefined && existing.record_digest !== input.record.record_digest) {
        return refusal("request_admission", "DIGEST_CONFLICT", "record id is already bound to another immutable blob");
      }
      const valid = validateMemoryRecord(input.record);
      if (!valid.ok) return { ok: false, error: { ...valid.error, operation: "request_admission" } };
      const current = this.#foldAtCurrent();
      if (!current.ok) return current;
      if (current.value.records.find((record) => record.record_id === input.record.record_id)?.state === "tombstoned") {
        return refusal("request_admission", "ALREADY_TERMINAL", "a tombstoned record cannot be accepted again");
      }
      // M5 l.720-721: the same-payload tombstone guard participates in the
      // canonical serialization. Re-verified atomically with the commit, a
      // tombstone committed after the admission pre-check snapshot still
      // requires adjudication instead of slipping into an automatic accept.
      const tombstoneClash = current.value.records.find((record) => {
        if (record.state !== "tombstoned") return false;
        const blob = this.#records.get(record.record_id);
        return blob !== undefined && blob.scope_ref === input.record.scope_ref && blob.payload_digest === input.record.payload_digest;
      });
      if (tombstoneClash !== undefined) {
        return refusal("request_admission", "ILLEGAL_TRANSITION", "candidate payload matches a tombstoned record in the same scope; admission requires adjudication");
      }
    }
    const appended = this.#append(intent);
    if (!appended.ok) return { ok: false, error: { ...appended.error, operation: "request_admission" } };
    if (input.outcome === "accept") {
      this.#records.set(input.record.record_id, clone(input.record));
      this.#lexical.set(input.record.record_id, clone(input.lexical_document));
      this.#outbox.push(this.#normaliseBatch(input.projection_batch, appended.value.event.cursor));
    }
    this.#controls.set(input.candidate_id, { ...control, state: input.outcome === "accept" ? "withdrawn" : "rejected" });
    this.#envelopes.delete(input.candidate_id);
    const receipt = this.#receipt("request_admission", appended.value.event, input.outcome === "accept" ? input.record.record_digest : undefined);
    if (!receipt.ok) return receipt;
    // MCP-L2: the replay proof commits atomically with the effect, in the
    // same synchronous section — a later acknowledgement loss can never
    // permit a second effect. Registries are append-only; the first
    // recorded outcome wins (a duplicate intent replays above).
    if (!this.#admissionOutcomes.has(input.candidate_id)) {
      this.#admissionOutcomes.set(input.candidate_id, defined({
        candidate_id: input.candidate_id,
        scope_ref: input.outcome === "accept" ? input.record.scope_ref : input.scope_ref,
        status: (input.outcome === "accept" ? "accepted" : "rejected") as "accepted" | "rejected",
        record_id: input.outcome === "accept" ? input.record.record_id : undefined,
        cursor: appended.value.event.cursor,
        decision_receipt_digest: input.decision.receipt_digest,
        transaction_receipt_digest: receipt.value.receipt_digest,
      }));
    }
    return receipt;
  }

  async readAdmissionOutcome(input: { candidate_id: string }): Promise<Result<PersistedAdmissionOutcomeV1>> {
    const ready = this.#readiness("request_admission");
    if (!ready.ok) return ready;
    const outcome = this.#admissionOutcomes.get(input.candidate_id);
    if (outcome === undefined) return refusal("request_admission", "NOT_FOUND", "admission outcome is not recorded");
    return { ok: true, value: clone(outcome) };
  }

  #foldAtCurrent(): Result<FoldedMemoryStateV1> {
    return this.#readiness("admin");
  }

  #normaliseBatch(batch: ProjectionBatchV1, cursor: Cursor): ProjectionBatchV1 {
    const value = {
      from_cursor_exclusive: batch.from_cursor_exclusive,
      through_cursor_inclusive: cursor,
      records: clone(batch.records),
      removals: clone(batch.removals),
    };
    return { ...value, batch_digest: batchDigest(value) };
  }

  #projectionRecord(record: MemoryRecordV2): import("./contracts/index.js").ProjectionRecordV1 {
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

  #lexicalDocument(record: MemoryRecordV2): import("./contracts/index.js").AcceptedLexicalDocumentV1 {
    const text = (kind: "context" | "decision" | "evidence") => record.components.filter((component) => component.kind === kind).map((component) => component.text).join("\n");
    return {
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
    };
  }

  #observeExpiry(): Result<{ observed: true }> {
    const now = this.#now("expire");
    if (!now.ok) return now;
    const current = this.#foldAtCurrent();
    if (!current.ok) return current;
    for (const entry of current.value.records) {
      if ((entry.state !== "accepted_current" && entry.state !== "accepted_disputed" && entry.state !== "historical") || entry.effective_expires_at === undefined
        || Date.parse(now.value) < Date.parse(entry.effective_expires_at)) continue;
      const record = this.#records.get(entry.record_id);
      if (record === undefined) return refusal("expire", "BLOB_MISSING", "expired record has no immutable blob");
      const authorizationReceipt = receiptDigest("retention-expiry", { record_id: record.record_id, expires_at: entry.effective_expires_at });
      const intent = {
        schema_version: 1 as const,
        event_id: `maintenance:expire:${record.record_id}:${entry.effective_expires_at}`,
        recorded_at: now.value,
        operation: "expire" as const,
        record_id: record.record_id,
        from_state: entry.state,
        to_state: "expired" as const,
        record_digest: record.record_digest,
        authorization_receipt_digest: authorizationReceipt,
        reason_ref: "memory:retention-expiry",
        event_anchor: {
          occurred_at: entry.effective_expires_at,
          kind_ref: "memory:retention-expiry",
          provenance_ref: "memory:retention",
          provenance_digest: authorizationReceipt,
        },
      };
      const appended = this.#append(intent);
      if (!appended.ok) return appended;
      if (!appended.value.duplicate) {
        this.#lexical.delete(record.record_id);
        const batch = { from_cursor_exclusive: previousCursor(appended.value.event.cursor), through_cursor_inclusive: appended.value.event.cursor, records: [], removals: [{ record_id: record.record_id, reason_ref: "memory:retention-expiry" }] };
        this.#outbox.push({ ...batch, batch_digest: batchDigest(batch) });
      }
    }
    return { ok: true, value: { observed: true } };
  }

  #transitionTarget(command: LifecycleCommandV1, state: MemoryState | undefined): Result<MemoryState> {
    const illegal = () => refusal<MemoryState>(command.operation, "ILLEGAL_TRANSITION", "operation is not legal from the folded lifecycle state");
    if (command.operation === "reject") return state === "pending" ? { ok: true, value: "rejected" } : illegal();
    if (command.operation === "withdraw") return state === "pending" ? { ok: true, value: "withdrawn" } : illegal();
    if (command.operation === "dispute") return state === "accepted_current" ? { ok: true, value: "accepted_disputed" } : illegal();
    if (command.operation === "resolve_dispute") return state === "accepted_disputed" ? { ok: true, value: "accepted_current" } : illegal();
    if (command.operation === "supersede" || command.operation === "mark_non_current") return state === "accepted_current" || state === "accepted_disputed" ? { ok: true, value: "historical" } : illegal();
    if (command.operation === "rewind") return state === "historical" ? { ok: true, value: "accepted_current" } : illegal();
    if (command.operation === "expire") return state === "accepted_current" || state === "accepted_disputed" || state === "historical" ? { ok: true, value: "expired" } : illegal();
    if (command.operation === "trust_invalidate") return state === "accepted_current" || state === "accepted_disputed" || state === "historical" ? { ok: true, value: "trust_invalid" } : illegal();
    if (command.operation === "tombstone") return state === "accepted_current" || state === "accepted_disputed" || state === "historical" || state === "expired" || state === "trust_invalid" ? { ok: true, value: "tombstoned" } : illegal();
    return illegal();
  }

  async applyLifecycle(input: Parameters<CanonicalMemoryStorePort["applyLifecycle"]>[0]): Promise<Result<CanonicalTransactionReceiptV1>> {
    const id = "record_id" in input.command ? input.command.record_id : input.command.candidate_id;
    const current = this.#foldAtCurrent();
    if (!current.ok) return { ok: false, error: { ...current.error, operation: input.command.operation } };
    const state = "record_id" in input.command
      ? current.value.records.find((record) => record.record_id === id)?.state
      : current.value.candidates.find((candidate) => candidate.candidate_id === id)?.state;
    const target = this.#transitionTarget(input.command, state);
    const intent = this.#intentFromLifecycle(input.event, {
      candidate_id: "candidate_id" in input.command ? input.command.candidate_id : undefined,
      record_id: "record_id" in input.command ? input.command.record_id : undefined,
      related_record_id: "related_record_id" in input.command ? input.command.related_record_id : undefined,
      operation: input.command.operation,
      to_state: target.ok ? target.value : input.event.to_state,
    });
    const duplicate = this.#findDuplicate(intent);
    if (!duplicate.ok) return { ok: false, error: { ...duplicate.error, operation: input.command.operation } };
    if (duplicate.value !== undefined) return this.#receipt(input.command.operation, duplicate.value);
    if (!target.ok) return target;
    if (input.event.to_state !== target.value) return refusal(input.command.operation, "ILLEGAL_TRANSITION", "event target does not match the closed lifecycle table");
    const relatedRecordId = (input.command as { related_record_id?: string }).related_record_id;
    if (input.command.operation === "supersede" && relatedRecordId !== undefined) {
      const successor = current.value.records.find((record) => record.record_id === relatedRecordId);
      if (successor?.state !== "accepted_current") return refusal(input.command.operation, "ILLEGAL_TRANSITION", "supersession requires a distinct accepted-current successor");
    }
    if (input.command.operation === "rewind" && relatedRecordId !== undefined) {
      const related = current.value.records.find((record) => record.record_id === relatedRecordId);
      if (related?.state !== "accepted_current" && related?.state !== "accepted_disputed") {
        return refusal(input.command.operation, "ILLEGAL_TRANSITION", "rewind requires a current accepted successor to make historical");
      }
    }
    const appended = this.#append(intent);
    if (!appended.ok) return { ok: false, error: { ...appended.error, operation: input.command.operation } };
    if (target.value !== "accepted_current") this.#lexical.delete(id);
    if (target.value === "tombstoned" || target.value === "historical" || target.value === "accepted_disputed" || target.value === "expired" || target.value === "trust_invalid") {
      this.#outbox.push(this.#normaliseBatch(input.projection_batch, appended.value.event.cursor));
    }
    if (target.value === "accepted_current") {
      const record = this.#records.get(id);
      if (record === undefined) return refusal(input.command.operation, "BLOB_MISSING", "current lifecycle transition has no immutable record blob");
      this.#lexical.set(id, this.#lexicalDocument(record));
      const related = relatedRecordId === undefined ? undefined : this.#records.get(relatedRecordId);
      if (related !== undefined) this.#lexical.delete(related.record_id);
      const batch = {
        from_cursor_exclusive: previousCursor(appended.value.event.cursor),
        through_cursor_inclusive: appended.value.event.cursor,
        records: [this.#projectionRecord(record)],
        removals: related === undefined ? [] : [{ record_id: related.record_id, reason_ref: input.command.reason_ref }],
      };
      this.#outbox.push({ ...batch, batch_digest: batchDigest(batch) });
    }
    return this.#receipt(input.command.operation, appended.value.event);
  }

  async readRecord(input: Parameters<CanonicalMemoryStorePort["readRecord"]>[0]): Promise<Result<MemoryRecordV2>> {
    const ready = this.#readiness("recall_current");
    if (!ready.ok) return ready;
    if (!isCanonicalCursor(input.system_as_of) || cursorCompare(input.system_as_of, ready.value.high_water_cursor) > 0) return refusal("recall_current", "STALE_PAGE", "system cursor is unavailable");
    const record = this.#records.get(input.record_id);
    if (record === undefined || cursorCompare(record.recorded_cursor, input.system_as_of) > 0) return refusal("recall_current", "NOT_FOUND", "record is not visible at the requested system cursor");
    return { ok: true, value: clone(record) };
  }

  async acceptedSnapshot(input: Parameters<CanonicalMemoryStorePort["acceptedSnapshot"]>[0]): Promise<Result<AcceptedCandidateSnapshotV1>> {
    const observed = this.#observeExpiry();
    if (!observed.ok) return observed;
    return this.#acceptedSnapshotReadOnly(input);
  }

  #acceptedSnapshotReadOnly(input: Parameters<CanonicalMemoryStorePort["acceptedSnapshot"]>[0], scope_ref?: string): Result<AcceptedCandidateSnapshotV1> {
    const ready = this.#readiness("recall_current");
    if (!ready.ok) return ready;
    if (!isCanonicalCursor(input.system_as_of) || cursorCompare(input.system_as_of, ready.value.high_water_cursor) > 0) return refusal("recall_current", "STALE_PAGE", "system cursor is unavailable");
    const at = foldMemoryJournalV1({ journal: this.#journal.filter((event) => cursorCompare(event.cursor, input.system_as_of) <= 0), records: [...this.#records.values()] });
    if (!at.ok) return { ok: false, error: { ...at.error, operation: "recall_current" } };
    const now = this.#now("recall_current");
    if (!now.ok) return now;
    const documents = at.value.records
      .filter((entry) => entry.state === "accepted_current")
      .map((entry) => this.#records.get(entry.record_id))
      .filter((record): record is MemoryRecordV2 => record !== undefined)
      // M3: the corpus is scoped BEFORE candidate limits and all ranking statistics.
      .filter((record) => scope_ref === undefined || record.scope_ref === scope_ref)
      .filter((record) => scope_ref === undefined || isVisibleAtDualAsOf(record.valid_time, record.recorded_cursor, { valid_as_of: Date.parse(now.value), system_as_of: input.system_as_of }))
      .filter((record) => isVisibleAtDualAsOf(record.valid_time, record.recorded_cursor, { valid_as_of: input.valid_as_of, system_as_of: input.system_as_of }))
      .filter((record) => record.retention.expires_at === undefined || Date.parse(now.value) < Date.parse(record.retention.expires_at))
      .map((record) => this.#lexical.get(record.record_id))
      .filter((document): document is import("./contracts/index.js").AcceptedLexicalDocumentV1 => document !== undefined)
      .sort((left, right) => left.record_id.localeCompare(right.record_id))
      .slice(0, input.max_candidates)
      .map(clone);
    const eligibilityDigest = receiptDigest("accepted-eligibility", { documents, valid_as_of: input.valid_as_of, system_as_of: input.system_as_of });
    const body = { snapshot_id: `memory:snapshot-${input.system_as_of}`, cursor: ready.value.high_water_cursor, valid_as_of: input.valid_as_of, system_as_of: input.system_as_of, documents, eligibility_digest: eligibilityDigest };
    return { ok: true, value: { ...body, snapshot_digest: receiptDigest("accepted-snapshot", body) } };
  }

  async revalidate(input: Parameters<CanonicalMemoryStorePort["revalidate"]>[0]): Promise<Result<import("./contracts/index.js").RevalidationPacketV1>> {
    const observed = this.#observeExpiry();
    if (!observed.ok) return { ok: false, error: { ...observed.error, operation: input.operation } };
    return this.#revalidationPacket(input);
  }

  async revalidateReadOnly(input: Parameters<CanonicalMemoryStorePort["revalidateReadOnly"]>[0]): Promise<Result<import("./contracts/index.js").RevalidationPacketV1>> {
    return this.#revalidationPacket(input);
  }

  #revalidationPacket(input: Parameters<CanonicalMemoryStorePort["revalidate"]>[0]): Result<import("./contracts/index.js").RevalidationPacketV1> {
    const ready = this.#readiness(input.operation);
    if (!ready.ok) return ready;
    if (!isCanonicalCursor(input.system_as_of) || cursorCompare(input.system_as_of, ready.value.high_water_cursor) > 0) return refusal(input.operation, "STALE_PAGE", "system cursor is unavailable");
    const folded = foldMemoryJournalV1({ journal: this.#journal.filter((event) => cursorCompare(event.cursor, input.system_as_of) <= 0), records: [...this.#records.values()] });
    if (!folded.ok) return { ok: false, error: { ...folded.error, operation: input.operation } };
    const now = this.#now(input.operation);
    if (!now.ok) return now;
    const states = new Map(folded.value.records.map((record) => [record.record_id, record.state]));
    const eligible: string[] = [];
    const removed: Array<import("./contracts/index.js").RevalidationPacketV1["removed"][number]> = [];
    for (const recordId of input.record_ids) {
      const record = this.#records.get(recordId);
      const state = states.get(recordId);
      const visible = input.operation === "recall_current"
        ? state === "accepted_current"
        : input.operation === "recall_disputed"
          ? state === "accepted_current" || state === "accepted_disputed"
          : state === "accepted_current" || state === "accepted_disputed" || state === "historical";
      if (!visible) { removed.push({ record_id: recordId, reason: state === "tombstoned" ? "tombstone" : "state" }); continue; }
      if (record === undefined || !isVisibleAtDualAsOf(record.valid_time, record.recorded_cursor, { valid_as_of: input.valid_as_of, system_as_of: input.system_as_of })) {
        removed.push({ record_id: recordId, reason: "valid_time" }); continue;
      }
      if (record.retention.expires_at !== undefined && Date.parse(now.value) >= Date.parse(record.retention.expires_at)) {
        removed.push({ record_id: recordId, reason: "expired" }); continue;
      }
      eligible.push(recordId);
    }
    const body = { eligible_record_ids: eligible, removed, cursor: ready.value.high_water_cursor, eligibility_digest: receiptDigest("revalidation-eligibility", { eligible, removed, system_as_of: input.system_as_of }), authorization_receipt_digest: input.authorization_receipt_digest };
    return { ok: true, value: { ...body, receipt_digest: receiptDigest("revalidation-packet", body) } };
  }

  async readJournal(input: Parameters<CanonicalMemoryStorePort["readJournal"]>[0]): Promise<Result<ReadonlyArray<LifecycleEventV2>>> {
    const ready = this.#readiness("admin");
    if (!ready.ok) return ready;
    if (!isCanonicalCursor(input.after) || !Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 2_000) return refusal("admin", "INVALID_SCHEMA", "journal range is invalid");
    return { ok: true, value: this.#journal.filter((event) => cursorCompare(event.cursor, input.after) > 0).slice(0, input.limit).map(lifecycleFromJournal) };
  }

  #manifest(through: Cursor, state: FoldedMemoryStateV1, records: ReadonlyArray<MemoryRecordV2>, journal: ReadonlyArray<MemoryJournalEventV1> = this.#journal): RecoveryCheckpointManifestV1 {
    // X4: policy_versions is journal-derived (sorted unique admission_decision
    // policy ids at or below the cursor), like registry_versions below. A
    // controls-derived list would diverge after a logical restore, which
    // carries no pending controls by quarantine.
    const seenPolicy = new Map<string, { id: string; version: string }>();
    for (const event of journal) {
      if (cursorCompare(event.cursor, through) > 0) continue;
      const decision = event.admission_decision;
      if (decision === undefined) continue;
      const key = JSON.stringify([decision.policy_id, decision.policy_version]);
      if (!seenPolicy.has(key)) seenPolicy.set(key, { id: decision.policy_id, version: decision.policy_version });
    }
    const policy_versions = [...seenPolicy.values()]
      .sort((left, right) => left.id.localeCompare(right.id) || left.version.localeCompare(right.version));
    const seen = new Map<string, { id: string; version: string }>();
    for (const event of journal) {
      if (cursorCompare(event.cursor, through) > 0) continue;
      const binding = event.reconciliation;
      if (binding === undefined) continue;
      const key = JSON.stringify([binding.registry_id, binding.registry_version]);
      if (!seen.has(key)) seen.set(key, { id: binding.registry_id, version: binding.registry_version });
    }
    const registry_versions = [...seen.values()].sort((left, right) => left.id.localeCompare(right.id) || left.version.localeCompare(right.version));
    const blobRoot = receiptDigest("checkpoint-blob-root", { records: records.map((record) => ({ record_id: record.record_id, record_digest: record.record_digest })).sort((a, b) => a.record_id.localeCompare(b.record_id)) });
    const body = {
      schema_version: 1 as const,
      high_water_cursor: through,
      storage_epoch: "0",
      state_digest: state.canonical_state_digest,
      journal_root_digest: state.journal_root_hash,
      blob_root_digest: blobRoot,
      policy_versions,
      registry_versions,
      included_classes: ["pending", "rejected", "withdrawn", "accepted_current", "accepted_disputed", "historical", "expired", "trust_invalid", "tombstoned", "pending_envelope", "journal", "blob_ref"] as const,
      external_blob_refs: [],
    };
    return { ...body, manifest_digest: receiptDigest("recovery-checkpoint", body) };
  }

  exportCheckpointForRecovery(throughCursor: Cursor, externalJournal?: ReadonlyArray<MemoryJournalEventV1>): Result<InMemoryRecoveryCheckpointV1> {
    const journal = (externalJournal ?? this.#journal).filter((event) => cursorCompare(event.cursor, throughCursor) <= 0).map(clone);
    if (!isCanonicalCursor(throughCursor) || (journal.length > 0 && journal[journal.length - 1]!.cursor !== throughCursor)) return refusal("admin", "NOT_FOUND", "checkpoint cursor is not present in the journal");
    const referenced = new Set(journal.filter((event) => event.record_id !== undefined && event.record_digest !== undefined).map((event) => event.record_id!));
    const records = [...this.#records.values()].filter((record) => referenced.has(record.record_id)).map(clone);
    const folded = foldMemoryJournalV1({ journal, records });
    if (!folded.ok) return folded;
    const checkpoint: MemoryJournalCheckpointV1 = { schema_version: 1, high_water_cursor: throughCursor, journal, records, canonical_state_digest: folded.value.canonical_state_digest };
    const controls = [...this.#controls.values()].filter((control) => cursorCompare(control.created_cursor, throughCursor) <= 0).map(clone);
    const envelopes = controls.filter((control) => control.state === "pending").map((control) => this.#envelopes.get(control.candidate_id)).filter((sealed): sealed is SealedCandidateEnvelopeV1 => sealed !== undefined).map(clone);
    return { ok: true, value: { ...checkpoint, manifest: this.#manifest(throughCursor, folded.value, records, journal), controls, envelopes, lexical: [...this.#lexical.entries()].filter(([recordId]) => referenced.has(recordId)).map(([record_id, document]) => ({ record_id, document: clone(document) })), outbox: this.#outbox.filter((batch) => cursorCompare(batch.through_cursor_inclusive, throughCursor) <= 0).map(clone), capture_idempotency: this.#exportCaptureIdempotency().filter(entry => cursorCompare(entry.cursor, throughCursor) <= 0), admission_outcomes: this.#exportAdmissionOutcomes().filter(entry => cursorCompare(entry.cursor, throughCursor) <= 0) } };
  }

  exportTailForRecovery(afterCursor: Cursor): Result<MemoryJournalTailV1> {
    if (!isCanonicalCursor(afterCursor)) return refusal("admin", "INVALID_SCHEMA", "tail cursor is invalid");
    const journal = this.#journal.filter((event) => cursorCompare(event.cursor, afterCursor) > 0).map(clone);
    const referenced = new Set(journal.filter((event) => event.record_id !== undefined && event.record_digest !== undefined).map((event) => event.record_id!));
    return { ok: true, value: { journal, records: [...this.#records.values()].filter((record) => referenced.has(record.record_id)).map(clone), capture_idempotency: this.#exportCaptureIdempotency().filter(entry => cursorCompare(entry.cursor, afterCursor) > 0), admission_outcomes: this.#exportAdmissionOutcomes().filter(entry => cursorCompare(entry.cursor, afterCursor) > 0) } };
  }

  async importLogicalBackup(input: LogicalBackupImportInputV1): Promise<Result<LogicalBackupImportReceiptV1>> {
    const ready = this.#readiness("restore");
    if (!ready.ok) return ready;
    if (this.#journal.length || this.#records.size || this.#controls.size || this.#envelopes.size
      || this.#lexical.size || this.#outbox.length || this.#captureIdempotency.size || this.#admissionOutcomes.size) {
      return refusal("restore", "RESTORE_REFUSED", "logical backup import refuses a non-empty store");
    }
    const converted = backupPublicJournalToStorageV1(input.journal);
    if (!converted.ok) return { ok: false, error: { ...converted.error, operation: "restore" } };
    const folded = foldMemoryJournalV1({ journal: converted.value, records: input.records });
    if (!folded.ok) return { ok: false, error: { ...folded.error, operation: "restore", code: "BACKUP_INVALID" } };
    const staged = new InMemoryCanonicalStore({ clock: this.options.clock, persistence: {
      journal: converted.value, records: input.records, controls: [], envelopes: [],
      lexical: deriveAcceptedLexicalDocumentsV1(folded.value, input.records),
      outbox: deriveRebuildOutboxBatchV1(folded.value, input.records), capture_idempotency: input.capture_idempotency,
    } });
    const stagedReady = staged.#readiness("restore");
    if (!stagedReady.ok) return { ok: false, error: { ...stagedReady.error, code: "BACKUP_INVALID" } };
    const registryDigest = captureIdempotencyDigestV1(staged.#exportCaptureIdempotency());
    if ((input.expected_restored_cursor !== undefined && input.expected_restored_cursor !== folded.value.high_water_cursor)
      || (input.expected_canonical_state_digest !== undefined && input.expected_canonical_state_digest !== folded.value.canonical_state_digest)
      || (input.expected_capture_idempotency_digest !== undefined && input.expected_capture_idempotency_digest !== registryDigest)) {
      return refusal("restore", "RESTORE_REFUSED", "restored canonical state or registry differs from the backup before commit");
    }
    // No await between validation and promotion: the in-memory import is atomic.
    this.#journal = staged.#journal; this.#records = staged.#records; this.#lexical = staged.#lexical;
    this.#outbox = staged.#outbox; this.#intentByEventId = staged.#intentByEventId;
    this.#captureIdempotency = staged.#captureIdempotency;
    const body = { restored_cursor: folded.value.high_water_cursor, canonical_state_digest: folded.value.canonical_state_digest,
      capture_idempotency_digest: registryDigest };
    return { ok: true, value: { ...body, receipt_digest: receiptDigest("logical-restore", body) } };
  }

  async checkpoint(input: Parameters<CanonicalMemoryStorePort["checkpoint"]>[0]): Promise<Result<RecoveryCheckpointManifestV1>> {
    const checkpoint = this.exportCheckpointForRecovery(input.through_cursor);
    return checkpoint.ok ? { ok: true, value: checkpoint.value.manifest } : checkpoint;
  }

  async nextProjectionBatch(input: Parameters<CanonicalMemoryStorePort["nextProjectionBatch"]>[0]): Promise<Result<ProjectionBatchV1>> {
    const ready = this.#readiness("projection_invalidate");
    if (!ready.ok) return ready;
    if (!isCanonicalCursor(input.after) || !Number.isSafeInteger(input.limit) || input.limit < 1) return refusal("projection_invalidate", "INVALID_SCHEMA", "projection range is invalid");
    const batches = this.#outbox.filter((batch) => cursorCompare(batch.through_cursor_inclusive, input.after) > 0).slice(0, input.limit);
    if (batches.length === 0) return refusal("projection_invalidate", "NOT_FOUND", "no projection batch is available");
    // Fold the window in canonical journal order, keeping each record's LAST operation: a record re-added
    // after a removal ends in records only, a record removed after an add ends in removals only. Adds and
    // removals are therefore disjoint, so the merged window settles every surface to the same final state
    // whatever order it applies — and a terminal tombstone is never followed by a re-added copy.
    const lastKind = new Map<string, "record" | "removal">();
    const lastRecord = new Map<string, ProjectionRecordV1>();
    const lastRemoval = new Map<string, { record_id: string; reason_ref: OpaqueRef }>();
    for (const batch of batches) {
      for (const record of batch.records) {
        lastKind.set(record.record_id, "record");
        lastRecord.set(record.record_id, clone(record));
      }
      for (const removal of batch.removals) {
        lastKind.set(removal.record_id, "removal");
        lastRemoval.set(removal.record_id, clone(removal));
      }
    }
    const records = [...lastKind.entries()]
      .filter(([, kind]) => kind === "record")
      .map(([recordId]) => lastRecord.get(recordId)!)
      .sort((left, right) => left.record_id.localeCompare(right.record_id));
    const removals = [...lastKind.entries()]
      .filter(([, kind]) => kind === "removal")
      .map(([recordId]) => lastRemoval.get(recordId)!)
      .sort((left, right) => left.record_id.localeCompare(right.record_id));
    // X2 resume (tour 3, normative §1/§6): the tombstone is terminal and retroactive. A record that is
    // tombstoned in the CURRENT folded state can never reappear through an older resume point, so any
    // window record for such an id is re-emitted as a removal (reason memory:tombstoned) instead. Without
    // this, replaying the resolve_dispute/rewind re-add batch after convergence resurrects the record on
    // every surface up to the tombstone round. Ids outside the window are left alone: the batch only
    // describes its own range.
    // X2 tour 4 (MINEUR-6): reuse the fold above instead of folding the whole journal twice per batch.
    // A window's content still depends on the current tombstoned set, so its digest varies for the same
    // (from, through) before and after a tombstone.
    const tombstoned = new Set(
      ready.value.records.filter((entry) => entry.state === "tombstoned").map((entry) => entry.record_id),
    );
    let settledRecords = records;
    let settledRemovals = removals;
    if (tombstoned.size > 0) {
      settledRecords = records.filter((record) => !tombstoned.has(record.record_id));
      const known = new Set(removals.map((removal) => removal.record_id));
      const retro = [...tombstoned]
        .filter((recordId) => lastKind.has(recordId) && !known.has(recordId))
        .map((record_id) => ({ record_id, reason_ref: "memory:tombstoned" }));
      settledRemovals = [...removals, ...retro].sort((left, right) => left.record_id.localeCompare(right.record_id));
    }
    const body = { from_cursor_exclusive: input.after, through_cursor_inclusive: batches[batches.length - 1]!.through_cursor_inclusive, records: settledRecords, removals: settledRemovals };
    return { ok: true, value: { ...body, batch_digest: batchDigest(body) } };
  }

  async acknowledgeProjection(_input: ProjectionInvalidationReceiptV1): Promise<Result<CanonicalTransactionReceiptV1>> {
    const ready = this.#readiness("projection_invalidate");
    if (!ready.ok) return ready;
    const event = this.#journal[this.#journal.length - 1];
    if (event === undefined) return refusal("projection_invalidate", "NOT_FOUND", "no journal event exists to acknowledge");
    return this.#receipt("projection_invalidate", event);
  }

  async readiness(): Promise<Result<OperationalCapabilityReceiptV1>> {
    const folded = this.#readiness("admin");
    if (!folded.ok) return folded;
    const now = this.#now("admin");
    if (!now.ok) return now;
    const expiresAt = new Date(Date.parse(now.value) + 300_000).toISOString();
    const body = { store_id: this.options.store_id ?? "memory:canonical", backend: "memory" as const, storage_epoch: this.options.storage_epoch ?? "0", high_water_cursor: folded.value.high_water_cursor, capabilities: this.capabilities, issued_at: now.value, expires_at: expiresAt };
    return { ok: true, value: { ...body, receipt_digest: receiptDigest("operational-capability", body) } };
  }

  canonicalStateDigest(): Result<Digest> {
    const folded = this.#readiness("admin");
    return folded.ok ? { ok: true, value: folded.value.canonical_state_digest } : folded;
  }

  exportStateForPersistence(): Result<InMemoryStoreStateV1> {
    const ready = this.#readiness("admin");
    if (!ready.ok) return ready;
    return {
      ok: true,
      value: {
        journal: this.#journal.map(clone),
        controls: [...this.#controls.values()].map(clone),
        envelopes: [...this.#envelopes.values()].map(clone),
        records: [...this.#records.values()].map(clone),
        lexical: [...this.#lexical.entries()].map(([record_id, document]) => ({ record_id, document: clone(document) })),
        outbox: this.#outbox.map(clone),
        capture_idempotency: this.#exportCaptureIdempotency(),
        admission_outcomes: this.#exportAdmissionOutcomes(),
      },
    };
  }

  async close(): Promise<Result<{ closed: true }>> {
    this.#closed = true;
    return { ok: true, value: { closed: true } };
  }

  #intentFromLifecycle(event: LifecycleEventV2, force: Partial<MemoryJournalEventV1>): Omit<MemoryJournalEventV1, "cursor" | "previous_event_hash" | "event_hash"> {
    return defined({
      schema_version: 1 as const,
      event_id: event.event_id,
      recorded_at: event.recorded_at,
      operation: force.operation ?? event.operation,
      candidate_id: force.candidate_id ?? event.candidate_id,
      record_id: force.record_id ?? event.record_id,
      related_record_id: force.related_record_id ?? event.related_record_id,
      from_state: event.from_state,
      to_state: force.to_state ?? event.to_state,
      valid_effective_at: event.valid_effective_at,
      record_digest: force.record_digest ?? event.record_digest,
      authorization_receipt_digest: event.authorization_receipt_digest,
      admission_decision: event.admission_decision,
      reason_ref: event.reason_ref,
      event_anchor: event.event_anchor,
      reconciliation: event.reconciliation,
    }) as Omit<MemoryJournalEventV1, "cursor" | "previous_event_hash" | "event_hash">;
  }
}

/** Backend-agnostic L3 canonical implementation. It deliberately declares no SQLite fencing capabilities. */
export function createInMemoryCanonicalMemoryStoreV1(options: InMemoryCanonicalMemoryStoreOptionsV1): InMemoryCanonicalMemoryStoreV1 {
  const store = new InMemoryCanonicalStore(options);
  // §5.9: stamp the module's in-process in-memory mark so a host that opted into `allow_unfenced_memory_store`
  // can run this neutral store unfenced; without the mark, no self-declared "memory" receipt bypasses the fence.
  markInMemoryStoreV1(store);
  return store;
}
