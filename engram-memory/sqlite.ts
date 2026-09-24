import {
  closeSync,
  fstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  statfsSync,
} from "node:fs";
import { dirname } from "node:path";

import { receiptDigest } from "./digests.js";
import { classifyFenceFilesystemV1, SQLITE_LOCAL_FILESYSTEM_TYPES, SQLITE_REJECTED_FILESYSTEM_TYPES } from "./filesystem-fence.js";
import { procLocksHoldsExclusiveFlockV1 } from "./proc-locks.js";
import { markFencedStoreV1 } from "./store-factory.js";
import {
  createInMemoryCanonicalMemoryStoreV1,
  foldMemoryJournalV1,
  type InMemoryCanonicalMemoryStoreV1,
  type InMemoryStoreStateV1,
} from "./memory-store.js";
import type {
  AcceptedLexicalDocumentV1,
  AcceptedCandidateSnapshotV1,
  AdmissionStoreInputV1,
  CanonicalMemoryStorePort,
  CanonicalStoreCapabilitiesV1,
  CanonicalTransactionReceiptV1,
  ClockPort,
  Cursor,
  Digest,
  LifecycleEventV2,
  MemoryOperation,
  MemoryRecordV2,
  OperationalCapabilityReceiptV1,
  PendingCandidateSnapshotV1,
  ProjectionBatchV1,
  ProjectionInvalidationReceiptV1,
  RecoveryCheckpointManifestV1,
  Result,
} from "./contracts/index.js";

type NativeDatabase = import("better-sqlite3").Database;

const MAX_READER_LEASE_MS = 300_000;

type Failpoint = "after_blob" | "after_journal" | "after_state" | "after_fts" | "after_outbox";

export interface FencedLockV1 {
  /** In-process fast flag: false once release()/forceFenceLoss ran. Cheap, but NOT a kernel proof on its own. */
  assertHeld(): boolean;
  /**
   * Linux kernel liveness proof: /proc/self/fdinfo/<our fd> still shows OUR open-file-description's exclusive
   * flock on the locked inode. fs-ext (native flock) cannot be faked into forging this kernel line, and fdinfo is
   * per-fd, so an unrelated fd of the same process holding a flock on the inode does not spoof it (unlike
   * /proc/locks). Absent or non-matching => the fence is not live.
   */
  assertKernelHeld(): boolean;
  /**
   * Anti-rename: the DB path still resolves to the very inode we flocked. A `mv other db` after the fence was
   * taken leaves the OLD (still-flocked) inode owning the writer lock while the path now names a different file;
   * fdinfo alone cannot see that (it reports our fd's original inode), so this is a SEPARATE check.
   */
  assertPathUnmoved(): boolean;
  release(): void;
}

export interface LocalFilesystemProbeResultV1 {
  local: boolean;
  kind: string;
}

export interface FencedSqliteMemoryStoreOptionsV1 {
  filename: string;
  clock: ClockPort;
  store_id?: string;
  // §5.9: production refuses an EPHEMERAL local filesystem (tmpfs, overlayfs) — a DB there is lost on restart,
  // contradicting the block-PVC constraint. A NON-production embedded harness opts in here. STRICT boolean: a
  // string is rejected (same discipline as allow_unfenced_memory_store). Distinct from that flag on purpose — a
  // "memory" flag must not widen a filesystem decision (the F1 lesson).
  allow_ephemeral_filesystem_store?: boolean;
  /** Injected only by native atomicity tests.  Throwing rolls back the whole transaction. */
  failpoint?: (stage: Failpoint) => void;
  /** Test seam for proving the mandatory second epoch/fence check before COMMIT. */
  before_commit?: () => void;
  /** Observability for the native stale-epoch assertion; business SQL is never reported before fencing. */
  on_mutation_statement?: (statement: "blob" | "journal" | "state" | "fts" | "outbox") => void;
}

export interface RevocableMemorySnapshotV1 {
  readonly generation: Cursor;
  readonly expires_at: string;
  readonly purpose: "ranking" | "backup";
  readAcceptedLexicalDocuments(): Promise<Result<ReadonlyArray<AcceptedLexicalDocumentV1>>>;
  close(): Promise<Result<{ closed: true }>>;
}

export interface FencedSqliteCanonicalMemoryStoreV1 extends CanonicalMemoryStorePort {
  acquireRevocableSnapshot(input: {
    lease_ms: number;
    purpose: "ranking" | "backup";
  }): Promise<Result<RevocableMemorySnapshotV1>>;
  /** Native-test seam: models a process fence being revoked between BEGIN and COMMIT. */
  forceFenceLossForTesting(): void;
}

interface FencedSqliteStoreInternal extends FencedSqliteCanonicalMemoryStoreV1 {
  readonly filename: string;
}

interface StoredRow {
  id?: string;
  record_id?: string;
  cursor?: string;
  body?: string;
  value?: string;
}

interface ActiveReader {
  revoke(): void;
  expires_at_ms: number;
}

function refusal<T>(operation: MemoryOperation, code: "CAPABILITY_UNAVAILABLE" | "FENCE_LOST" | "STORE_UNAVAILABLE" | "JOURNAL_CORRUPT", message: string): Result<T> {
  return { ok: false, error: { code, operation, message, retryable: false } };
}

function isCanonicalInstant(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && new Date(value).toISOString() === value;
}

function nextEpoch(epoch: Cursor): Cursor | undefined {
  const value = BigInt(epoch);
  return value >= 18_446_744_073_709_551_615n ? undefined : (value + 1n).toString();
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

function parse<T>(value: string): T {
  return JSON.parse(value) as T;
}

function defaultFilesystemProbe(filename: string): LocalFilesystemProbeResultV1 {
  try {
    const type = Number(statfsSync(dirname(filename)).type);
    if (SQLITE_REJECTED_FILESYSTEM_TYPES.has(type)) return { local: false, kind: `rejected:${type.toString(16)}` };
    if (SQLITE_LOCAL_FILESYSTEM_TYPES.has(type)) return { local: true, kind: `local:${type.toString(16)}` };
    return { local: false, kind: `unknown:${type.toString(16)}` };
  } catch {
    return { local: false, kind: "unprobed" };
  }
}

/**
 * Take the writer fence on the canonical database's OWN inode (not a `.lock` sidecar): open a private fd on the
 * file and hold a non-blocking exclusive flock on it for the store's lifetime. flock is attached to this open-file
 * description, so a second live holder — in any process — is refused (EAGAIN); SQLite's own fd is separate and
 * unaffected. Process death releases the flock, so a crash never strands a lock. The returned lock re-proves
 * liveness against /proc/self/fdinfo/<fd> and rename-safety against the path, per operation.
 */
async function acquireDatabaseFlock(filename: string, allowEphemeral: boolean): Promise<FencedLockV1> {
  mkdirSync(dirname(filename), { recursive: true });
  const fd = openSync(filename, "a", 0o600); // our own fd on the DB inode; SQLite opens the file on a separate fd
  try {
    const flock = await import("fs-ext");
    flock.flockSync(fd, "exnb"); // exclusive, non-blocking: a second live holder throws EAGAIN
    // Classify the ACTUAL open file's filesystem (a lenient dir probe cannot mask it): refuse a network/removable/
    // FUSE fs (flock there is not a cross-host fence), an unknown fs, or an ephemeral fs (tmpfs/overlayfs — lost on
    // restart) unless the host opted in. The verdict names the type in hex; the open() catch surfaces it.
    const verdict = classifyFenceFilesystemV1(Number(statfsSync(`/proc/self/fd/${fd}`).type), allowEphemeral);
    if (!verdict.admit) throw new Error(verdict.reason);
    // Capture the flocked inode from the fd (bigint: a large XFS/btrfs inode exceeds 2^53 and a number would round).
    const identity = fstatSync(fd, { bigint: true });
    // §5.9 R2-f: the fenced inode MUST be reachable by exactly one name. A second hard link (st_nlink > 1) means the
    // same database bytes answer to another path outside the fence's view, which defeats two guarantees at once:
    // assertPathUnmoved treats "the canonical path is gone" as a lost fence, but an alias keeps the inode alive after
    // an unlink, so an adversary can unlink+relink the canonical name onto the SAME still-flocked (dev, ino) with the
    // rename check none the wiser; and release-after-close assumes closing the last fd (or process death) retires the
    // database, whereas an aliased inode survives to be relinked into place afterwards. nlink is read from the SAME
    // fstat as the flocked identity, so it races nothing. Refuse here, before any write; the opener maps this throw to
    // CAPABILITY_UNAVAILABLE (it is not flock contention, so never FENCE_LOST).
    if (identity.nlink > 1n) {
      throw new Error(`the canonical database inode has ${identity.nlink} hard links; a fenced store requires exactly one name for the inode (a second link defeats the single-writer rename and release-after-close guarantee)`);
    }
    // Match the flock by INODE only, never by device: fstat's st_dev (the mount/subvolume dev) differs from the
    // superblock s_dev the kernel prints in /proc on btrfs, so a device match would brick there; the inode is
    // identical in both views. fdinfo is per-fd anyway, so this is a sanity check, not the sole discriminator.
    const inode = identity.ino.toString();
    let held = true;
    const lock: FencedLockV1 = {
      assertHeld: () => held,
      assertKernelHeld: () => {
        if (!held) return false;
        try {
          return procLocksHoldsExclusiveFlockV1(readFileSync(`/proc/self/fdinfo/${fd}`, "utf8"), { ino: inode });
        } catch {
          return false; // fdinfo unreadable => cannot prove the fence is live => treat as lost
        }
      },
      assertPathUnmoved: () => {
        try {
          const now = statSync(filename, { bigint: true });
          return now.dev === identity.dev && now.ino === identity.ino;
        } catch {
          return false; // the path is gone (renamed/deleted) => the fence no longer guards this name
        }
      },
      release: () => {
        if (!held) return;
        held = false;
        try {
          flock.flockSync(fd, "un");
        } finally {
          closeSync(fd);
        }
      },
    };
    // Prove the flock is REALLY recorded by the kernel BEFORE returning — the caller next advances the durable
    // epoch and writes, so this must fail closed on a non-functional native flock binding (a shim, or a broken
    // module) whose flockSync returned success without taking a kernel lock. Otherwise such a store would advance
    // the epoch while a legitimate broker holds the real flock elsewhere, driving THAT broker's next #fence to a
    // spurious FENCE_LOST — killing the live writer. Throwing here (before any write) refuses it up front.
    if (!lock.assertKernelHeld() || !lock.assertPathUnmoved()) {
      throw new Error("the SQLite writer flock is not recorded by /proc/self/fdinfo after flock (a non-functional native flock binding?)");
    }
    return lock;
  } catch (error) {
    closeSync(fd); // closing the fd also releases any flock taken above
    throw error;
  }
}

function schema(database: NativeDatabase): void {
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS memory_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS memory_blob (record_id TEXT PRIMARY KEY, record_digest TEXT NOT NULL, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS memory_journal (cursor TEXT PRIMARY KEY, event_id TEXT UNIQUE NOT NULL, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS memory_state (entity_kind TEXT NOT NULL, entity_id TEXT NOT NULL, state TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(entity_kind, entity_id));
    CREATE TABLE IF NOT EXISTS memory_control (candidate_id TEXT PRIMARY KEY, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS memory_envelope (candidate_id TEXT PRIMARY KEY, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS accepted_lexical (record_id TEXT PRIMARY KEY, record_digest TEXT NOT NULL, body TEXT NOT NULL);
    CREATE VIRTUAL TABLE IF NOT EXISTS accepted_lexical_fts USING fts5(record_id UNINDEXED, primary_text, context_text, decision_text, evidence_text, citations_text);
    CREATE TABLE IF NOT EXISTS memory_outbox (sequence INTEGER PRIMARY KEY, body TEXT NOT NULL);
  `);
}

function stateFromDatabase(database: NativeDatabase): InMemoryStoreStateV1 {
  return {
    journal: (database.prepare("SELECT body FROM memory_journal ORDER BY rowid").all() as StoredRow[]).map((row) => parse(row.body!)),
    controls: (database.prepare("SELECT body FROM memory_control ORDER BY candidate_id").all() as StoredRow[]).map((row) => parse(row.body!)),
    envelopes: (database.prepare("SELECT body FROM memory_envelope ORDER BY candidate_id").all() as StoredRow[]).map((row) => parse(row.body!)),
    records: (database.prepare("SELECT body FROM memory_blob ORDER BY record_id").all() as StoredRow[]).map((row) => parse(row.body!)),
    lexical: (database.prepare("SELECT record_id, body FROM accepted_lexical ORDER BY record_id").all() as StoredRow[]).map((row) => ({ record_id: row.id ?? row.record_id!, document: parse(row.body!) })),
    outbox: (database.prepare("SELECT body FROM memory_outbox ORDER BY sequence").all() as StoredRow[]).map((row) => parse(row.body!)),
  };
}

function checkedStoreState(state: InMemoryStoreStateV1): Result<InMemoryStoreStateV1> {
  const folded = foldMemoryJournalV1({ journal: state.journal, records: state.records });
  return folded.ok ? { ok: true, value: state } : { ok: false, error: { ...folded.error, operation: "admin" } };
}

class DetachedReader implements RevocableMemorySnapshotV1, ActiveReader {
  #closed = false;

  constructor(
    readonly generation: Cursor,
    readonly expires_at: string,
    readonly purpose: "ranking" | "backup",
    readonly expires_at_ms: number,
    private readonly filename: string,
    private readonly database: NativeDatabase,
    private readonly remove: () => void,
  ) {}

  #available(): Result<{ available: true }> {
    if (this.#closed || Date.now() >= this.expires_at_ms) {
      this.revoke();
      return refusal("admin", "FENCE_LOST", "revocable detached reader is no longer active");
    }
    return { ok: true, value: { available: true } };
  }

  async readAcceptedLexicalDocuments(): Promise<Result<ReadonlyArray<AcceptedLexicalDocumentV1>>> {
    const available = this.#available();
    if (!available.ok) return available;
    try {
      const rows = this.database.prepare("SELECT body FROM accepted_lexical ORDER BY record_id").all() as StoredRow[];
      return { ok: true, value: rows.map((row) => parse<AcceptedLexicalDocumentV1>(row.body!)) };
    } catch {
      return refusal("admin", "STORE_UNAVAILABLE", "detached reader could not read its snapshot");
    }
  }

  #dispose(): void {
    if (this.#closed) return;
    this.#closed = true;
    try {
      this.database.close();
    } finally {
      rmSync(this.filename, { force: true });
      rmSync(`${this.filename}-wal`, { force: true });
      rmSync(`${this.filename}-shm`, { force: true });
      this.remove();
    }
  }

  revoke(): void {
    this.#dispose();
  }

  async close(): Promise<Result<{ closed: true }>> {
    this.#dispose();
    return { ok: true, value: { closed: true } };
  }
}

class FencedSqliteStore implements FencedSqliteStoreInternal {
  readonly version = 1 as const;
  readonly capabilities: CanonicalStoreCapabilitiesV1 = {
    atomic_promotion: true,
    dense_cursor: true,
    accepted_only_lexical: true,
    fenced_single_writer: true,
    revocable_active_store: true,
    detached_snapshot: true,
    bounded_cancellation: true,
    backend: "sqlite",
  };
  #closed = false;
  #fenceLost = false;
  #readerGeneration = 0n;
  #readers = new Set<ActiveReader>();
  #mutationTail: Promise<void> = Promise.resolve();
  #core: InMemoryCanonicalMemoryStoreV1;

  constructor(
    readonly filename: string,
    private readonly options: FencedSqliteMemoryStoreOptionsV1,
    private readonly database: NativeDatabase,
    private readonly lock: FencedLockV1,
    private readonly storageEpoch: Cursor,
    core: InMemoryCanonicalMemoryStoreV1,
  ) {
    this.#core = core;
  }

  #revokeReaders(): void {
    for (const reader of [...this.#readers]) reader.revoke();
    this.#readers.clear();
  }

  #reapReaders(): void {
    const now = Date.now();
    for (const reader of [...this.#readers]) if (now >= reader.expires_at_ms) reader.revoke();
  }

  #fence(operation: MemoryOperation): Result<{ fenced: true }> {
    if (this.#closed) return refusal(operation, "STORE_UNAVAILABLE", "SQLite canonical store is closed");
    this.#reapReaders();
    if (this.#fenceLost || !this.lock.assertHeld()) {
      this.#fenceLost = true;
      this.#revokeReaders();
      return refusal(operation, "FENCE_LOST", "the SQLite writer fence is no longer held");
    }
    // (liveness) the kernel still records THIS fd's exclusive flock — an fs-ext shim cannot forge /proc/self/fdinfo.
    if (!this.lock.assertKernelHeld()) {
      this.#fenceLost = true;
      this.#revokeReaders();
      return refusal(operation, "FENCE_LOST", "the kernel no longer records this process's writer flock on the canonical database");
    }
    // (anti-rename) the canonical path still resolves to the flocked inode — a swap leaves the old inode locked.
    if (!this.lock.assertPathUnmoved()) {
      this.#fenceLost = true;
      this.#revokeReaders();
      return refusal(operation, "FENCE_LOST", "the canonical database path was replaced (rename/swap) since the fence was taken");
    }
    try {
      const row = this.database.prepare("SELECT value FROM memory_meta WHERE key = 'storage_epoch'").get() as StoredRow | undefined;
      if (row?.value !== this.storageEpoch) {
        this.#fenceLost = true;
        this.#revokeReaders();
        return refusal(operation, "FENCE_LOST", "the durable SQLite storage epoch changed before mutation");
      }
    } catch {
      return refusal(operation, "STORE_UNAVAILABLE", "SQLite epoch could not be read");
    }
    return { ok: true, value: { fenced: true } };
  }

  #receiptAtEpoch(value: CanonicalTransactionReceiptV1): CanonicalTransactionReceiptV1 {
    const { receipt_digest: _receiptDigest, storage_epoch: _epoch, ...body } = value;
    const fencedBody = { ...body, storage_epoch: this.storageEpoch };
    return { ...fencedBody, receipt_digest: receiptDigest("canonical-transaction", fencedBody) } as CanonicalTransactionReceiptV1;
  }

  async #exclusive<T>(operation: MemoryOperation, task: () => Promise<Result<T>>): Promise<Result<T>> {
    let release: (() => void) | undefined;
    const prior = this.#mutationTail;
    this.#mutationTail = new Promise<void>((resolve) => { release = resolve; });
    await prior;
    try {
      const fence = this.#fence(operation);
      return fence.ok ? await task() : fence;
    } finally {
      release?.();
    }
  }

  #newWorkingStore(): Result<InMemoryCanonicalMemoryStoreV1> {
    const persisted = this.#core.exportStateForPersistence();
    return persisted.ok
      ? { ok: true, value: createInMemoryCanonicalMemoryStoreV1({ clock: this.options.clock, store_id: this.options.store_id, persistence: persisted.value }) }
      : persisted;
  }

  #writeState(snapshot: InMemoryStoreStateV1): void {
    const folded = foldMemoryJournalV1({ journal: snapshot.journal, records: snapshot.records });
    if (!folded.ok) throw new Error("refusing to persist a corrupt canonical state");
    const clear = (table: string) => this.database.prepare(`DELETE FROM ${table}`).run();
    clear("memory_blob");
    clear("memory_journal");
    clear("memory_state");
    clear("memory_control");
    clear("memory_envelope");
    clear("accepted_lexical");
    clear("accepted_lexical_fts");
    clear("memory_outbox");

    const insertBlob = this.database.prepare("INSERT INTO memory_blob(record_id, record_digest, body) VALUES (?, ?, ?)");
    for (const record of snapshot.records) insertBlob.run(record.record_id, record.record_digest, json(record));
    this.options.on_mutation_statement?.("blob");
    this.options.failpoint?.("after_blob");

    const insertJournal = this.database.prepare("INSERT INTO memory_journal(cursor, event_id, body) VALUES (?, ?, ?)");
    for (const event of snapshot.journal) insertJournal.run(event.cursor, event.event_id, json(event));
    this.options.on_mutation_statement?.("journal");
    this.options.failpoint?.("after_journal");

    const insertState = this.database.prepare("INSERT INTO memory_state(entity_kind, entity_id, state, body) VALUES (?, ?, ?, ?)");
    for (const candidate of folded.value.candidates) insertState.run("candidate", candidate.candidate_id, candidate.state, json(candidate));
    for (const record of folded.value.records) insertState.run("record", record.record_id, record.state, json(record));
    const insertControl = this.database.prepare("INSERT INTO memory_control(candidate_id, body) VALUES (?, ?)");
    for (const control of snapshot.controls) insertControl.run(control.candidate_id, json(control));
    const insertEnvelope = this.database.prepare("INSERT INTO memory_envelope(candidate_id, body) VALUES (?, ?)");
    for (const envelope of snapshot.envelopes) insertEnvelope.run(envelope.candidate_id, json(envelope));
    this.options.on_mutation_statement?.("state");
    this.options.failpoint?.("after_state");

    const insertLexical = this.database.prepare("INSERT INTO accepted_lexical(record_id, record_digest, body) VALUES (?, ?, ?)");
    const insertFts = this.database.prepare("INSERT INTO accepted_lexical_fts(record_id, primary_text, context_text, decision_text, evidence_text, citations_text) VALUES (?, ?, ?, ?, ?, ?)");
    for (const { record_id, document } of snapshot.lexical) {
      insertLexical.run(record_id, document.record_digest, json(document));
      insertFts.run(record_id, document.fields.primary, document.fields.context, document.fields.decision, document.fields.evidence, document.fields.citations);
    }
    this.options.on_mutation_statement?.("fts");
    this.options.failpoint?.("after_fts");

    const insertOutbox = this.database.prepare("INSERT INTO memory_outbox(sequence, body) VALUES (?, ?)");
    snapshot.outbox.forEach((batch, index) => insertOutbox.run(index + 1, json(batch)));
    this.options.on_mutation_statement?.("outbox");
    this.options.failpoint?.("after_outbox");
  }

  async #transaction<T>(operation: MemoryOperation, stage: (working: InMemoryCanonicalMemoryStoreV1) => Promise<Result<T>>): Promise<Result<T>> {
    return this.#exclusive(operation, async () => {
      const working = this.#newWorkingStore();
      if (!working.ok) return working;
      const result = await stage(working.value);
      if (!result.ok) return result;
      const snapshot = working.value.exportStateForPersistence();
      if (!snapshot.ok) return snapshot;
      let began = false;
      try {
        this.database.exec("BEGIN IMMEDIATE");
        began = true;
        // Required before the first persistent state change; a stale writer
        // cannot execute a blob/journal/state/FTS/outbox statement.
        const before = this.#fence(operation);
        if (!before.ok) {
          this.database.exec("ROLLBACK");
          return before;
        }
        this.#writeState(snapshot.value);
        this.options.before_commit?.();
        // Required after the last mutation and before commit.  This detects
        // lock loss or a changed durable epoch even inside BEGIN IMMEDIATE.
        const beforeCommit = this.#fence(operation);
        if (!beforeCommit.ok) {
          this.database.exec("ROLLBACK");
          return beforeCommit;
        }
        this.database.exec("COMMIT");
        began = false;
        this.#core = working.value;
        if (result.value !== null && typeof result.value === "object" && "storage_epoch" in result.value) {
          return { ok: true, value: this.#receiptAtEpoch(result.value as unknown as CanonicalTransactionReceiptV1) as T };
        }
        return result;
      } catch {
        if (began) {
          try { this.database.exec("ROLLBACK"); } catch { /* the connection is already unwound */ }
        }
        return refusal(operation, this.#fenceLost ? "FENCE_LOST" : "STORE_UNAVAILABLE", this.#fenceLost
          ? "the SQLite writer fence was lost before commit"
          : "SQLite promotion transaction rolled back");
      }
    });
  }

  async commitPending(input: Parameters<CanonicalMemoryStorePort["commitPending"]>[0]): Promise<Result<CanonicalTransactionReceiptV1>> {
    return this.#transaction("capture", (working) => working.commitPending(input));
  }

  async readPending(input: Parameters<CanonicalMemoryStorePort["readPending"]>[0]): Promise<Result<PendingCandidateSnapshotV1>> {
    const fence = this.#fence("request_admission");
    return fence.ok ? this.#core.readPending(input) : fence;
  }

  async applyAdmission(input: AdmissionStoreInputV1): Promise<Result<CanonicalTransactionReceiptV1>> {
    return this.#transaction("request_admission", (working) => working.applyAdmission(input));
  }

  async applyLifecycle(input: Parameters<CanonicalMemoryStorePort["applyLifecycle"]>[0]): Promise<Result<CanonicalTransactionReceiptV1>> {
    return this.#transaction(input.command.operation, (working) => working.applyLifecycle(input));
  }

  async readRecord(input: Parameters<CanonicalMemoryStorePort["readRecord"]>[0]): Promise<Result<MemoryRecordV2>> {
    const fence = this.#fence("recall_current");
    return fence.ok ? this.#core.readRecord(input) : fence;
  }

  async acceptedSnapshot(input: Parameters<CanonicalMemoryStorePort["acceptedSnapshot"]>[0]): Promise<Result<AcceptedCandidateSnapshotV1>> {
    // The in-memory fold may append a deterministic expiry event.  Persist it
    // atomically instead of allowing a read path to mutate only process state.
    return this.#transaction("recall_current", (working) => working.acceptedSnapshot(input));
  }

  async revalidate(input: Parameters<CanonicalMemoryStorePort["revalidate"]>[0]): Promise<Result<import("./contracts/index.js").RevalidationPacketV1>> {
    return this.#transaction(input.operation, (working) => working.revalidate(input));
  }

  async readJournal(input: Parameters<CanonicalMemoryStorePort["readJournal"]>[0]): Promise<Result<ReadonlyArray<LifecycleEventV2>>> {
    const fence = this.#fence("admin");
    return fence.ok ? this.#core.readJournal(input) : fence;
  }

  async checkpoint(input: Parameters<CanonicalMemoryStorePort["checkpoint"]>[0]): Promise<Result<RecoveryCheckpointManifestV1>> {
    const fence = this.#fence("admin");
    if (!fence.ok) return fence;
    const checkpoint = await this.#core.checkpoint(input);
    if (!checkpoint.ok) return checkpoint;
    const { manifest_digest: _manifestDigest, storage_epoch: _epoch, ...body } = checkpoint.value;
    return { ok: true, value: { ...body, storage_epoch: this.storageEpoch, manifest_digest: receiptDigest("recovery-checkpoint", { ...body, storage_epoch: this.storageEpoch }) } };
  }

  async nextProjectionBatch(input: Parameters<CanonicalMemoryStorePort["nextProjectionBatch"]>[0]): Promise<Result<ProjectionBatchV1>> {
    const fence = this.#fence("projection_invalidate");
    return fence.ok ? this.#core.nextProjectionBatch(input) : fence;
  }

  async acknowledgeProjection(input: ProjectionInvalidationReceiptV1): Promise<Result<CanonicalTransactionReceiptV1>> {
    return this.#transaction("projection_invalidate", (working) => working.acknowledgeProjection(input));
  }

  async readiness(): Promise<Result<OperationalCapabilityReceiptV1>> {
    const fence = this.#fence("admin");
    if (!fence.ok) return fence;
    const readiness = await this.#core.readiness();
    if (!readiness.ok) return readiness;
    const { receipt_digest: _receiptDigest, storage_epoch: _epoch, capabilities: _capabilities, backend: _backend, store_id: _storeId, ...body } = readiness.value;
    const fencedBody = {
      ...body,
      store_id: this.options.store_id ?? `sqlite:${this.filename}`,
      backend: "sqlite" as const,
      storage_epoch: this.storageEpoch,
      // §5.9: surface the ephemeral-fs posture in the receipt (readiness()); false on a correct prod deployment.
      capabilities: { ...this.capabilities, ephemeral_filesystem_store_permitted: this.options.allow_ephemeral_filesystem_store === true },
    };
    return { ok: true, value: { ...fencedBody, receipt_digest: receiptDigest("operational-capability", fencedBody) } };
  }

  async acquireRevocableSnapshot(input: { lease_ms: number; purpose: "ranking" | "backup" }): Promise<Result<RevocableMemorySnapshotV1>> {
    const fence = this.#fence("admin");
    if (!fence.ok) return fence;
    if (!Number.isSafeInteger(input.lease_ms) || input.lease_ms < 1 || input.lease_ms > MAX_READER_LEASE_MS) {
      return refusal("admin", "CAPABILITY_UNAVAILABLE", "detached reader lease must be a finite bounded duration");
    }
    const generation = (++this.#readerGeneration).toString();
    const copyFilename = `${this.filename}.detached-${this.storageEpoch}-${generation}`;
    try {
      rmSync(copyFilename, { force: true });
      this.database.prepare("VACUUM INTO ?").run(copyFilename);
      const sourceIdentity = statSync(this.filename);
      const copyIdentity = statSync(copyFilename);
      if (sourceIdentity.dev === copyIdentity.dev && sourceIdentity.ino === copyIdentity.ino) {
        rmSync(copyFilename, { force: true });
        return refusal("admin", "STORE_UNAVAILABLE", "detached SQLite copy shares the active database inode");
      }
      const native = await import("better-sqlite3");
      const detached = new native.default(copyFilename, { readonly: true, fileMustExist: true });
      const expiresAtMs = Date.now() + input.lease_ms;
      const reader = new DetachedReader(generation, new Date(expiresAtMs).toISOString(), input.purpose, expiresAtMs, copyFilename, detached, () => this.#readers.delete(reader));
      this.#readers.add(reader);
      return { ok: true, value: {
        generation: reader.generation,
        expires_at: reader.expires_at,
        purpose: reader.purpose,
        readAcceptedLexicalDocuments: () => reader.readAcceptedLexicalDocuments(),
        close: () => reader.close(),
      } };
    } catch {
      rmSync(copyFilename, { force: true });
      return refusal("admin", "STORE_UNAVAILABLE", "could not create a detached SQLite snapshot");
    }
  }

  forceFenceLossForTesting(): void {
    if (this.#fenceLost) return;
    this.#fenceLost = true;
    this.lock.release();
    this.#revokeReaders();
  }

  async close(): Promise<Result<{ closed: true }>> {
    if (this.#closed) return { ok: true, value: { closed: true } };
    this.#closed = true;
    this.#revokeReaders();
    try {
      this.database.close();
    } finally {
      this.lock.release();
    }
    return { ok: true, value: { closed: true } };
  }
}

/**
 * Opens the only write-capable SQLite connection for a local canonical store.
 * A non-blocking kernel flock is acquired before the durable epoch is advanced;
 * process death releases the flock, so a crash never strands a PID sentinel.
 */
export async function openFencedSqliteCanonicalMemoryStoreV1(options: FencedSqliteMemoryStoreOptionsV1): Promise<Result<FencedSqliteCanonicalMemoryStoreV1>> {
  // The fence proves liveness against Linux /proc (fdinfo) and refuses a network fs against the open fd; neither
  // exists on macOS/Windows, so those cannot be supported as a fenced production target — fail closed up front.
  // Read the platform off globalThis to avoid a global `process` declaration (which would clash with @types/node
  // in the repo-wide typecheck; the neutral package itself ships no node types, only the node-fs.d.ts shim).
  if ((globalThis as { process?: { platform?: string } }).process?.platform !== "linux") {
    return refusal("admin", "CAPABILITY_UNAVAILABLE", "the fenced SQLite canonical store requires Linux kernel lock verification (/proc/self/fdinfo); macOS and Windows are not supported production targets");
  }
  const probe = defaultFilesystemProbe(options.filename);
  if (!probe.local) return refusal("admin", "CAPABILITY_UNAVAILABLE", `SQLite canonical storage requires a known local filesystem (${probe.kind})`);
  let lock: FencedLockV1 | undefined;
  let database: NativeDatabase | undefined;
  try {
    // STRICT boolean: a string such as "true" does not widen the exemption (same discipline as §5.9's memory flag).
    lock = await acquireDatabaseFlock(options.filename, options.allow_ephemeral_filesystem_store === true);
  } catch (error) {
    // ONLY genuine flock contention (another live holder) is FENCE_LOST. Everything else — the native flock module
    // absent or non-functional, a network/removable filesystem, an unreadable /proc, the kernel-proof refusal —
    // is CAPABILITY_UNAVAILABLE with its cause. A catch-all FENCE_LOST would misreport an unfenceable environment
    // (e.g. fs-ext not built) as a lost fence.
    const code = (error as { code?: string } | undefined)?.code;
    if (code === "EAGAIN" || code === "EWOULDBLOCK") {
      return refusal("admin", "FENCE_LOST", "another live process holds the SQLite writer fence");
    }
    const cause = error instanceof Error ? error.message : String(error);
    return refusal("admin", "CAPABILITY_UNAVAILABLE", `the SQLite writer fence could not be acquired: ${cause}`);
  }
  try {
    const native = await import("better-sqlite3");
    mkdirSync(dirname(options.filename), { recursive: true });
    database = new native.default(options.filename);
    schema(database);
    database.exec("BEGIN IMMEDIATE");
    const stored = database.prepare("SELECT value FROM memory_meta WHERE key = 'storage_epoch'").get() as StoredRow | undefined;
    const epoch = nextEpoch(stored?.value ?? "0");
    if (epoch === undefined) {
      database.exec("ROLLBACK");
      database.close();
      lock.release();
      return refusal("admin", "STORE_UNAVAILABLE", "SQLite storage epoch is exhausted");
    }
    database.prepare("INSERT INTO memory_meta(key, value) VALUES ('storage_epoch', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(epoch);
    database.exec("COMMIT");
    // Checkpoint only after the durable epoch change.  It is recovery hygiene,
    // not the process fence: flock is the writer-unique mechanism.
    database.pragma("wal_checkpoint(TRUNCATE)");
    const persisted = checkedStoreState(stateFromDatabase(database));
    if (!persisted.ok) {
      database.close();
      lock.release();
      return persisted;
    }
    const core = createInMemoryCanonicalMemoryStoreV1({ clock: options.clock, store_id: options.store_id, persistence: persisted.value });
    const ready = await core.readiness();
    if (!ready.ok) {
      database.close();
      lock.release();
      return { ok: false, error: { ...ready.error, operation: "admin" } };
    }
    const store = new FencedSqliteStore(options.filename, options, database, lock, epoch, core);
    // §5.9 v5-b: stamp the store as fence-holding ONLY here — after a real kernel flock on the DB inode, a
    // /proc-verifiable lock, and the durable epoch advance. The engine's provenance gate admits on this mark.
    markFencedStoreV1(store);
    return { ok: true, value: store };
  } catch {
    try { database?.close(); } catch { /* best effort after a failed native open */ }
    lock.release();
    return refusal("admin", "CAPABILITY_UNAVAILABLE", "the declared better-sqlite3 driver or SQLite initialization is unavailable");
  }
}
