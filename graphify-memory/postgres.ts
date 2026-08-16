import { createHash } from "node:crypto";

import { receiptDigest } from "./digests.js";
import {
  createInMemoryCanonicalMemoryStoreV1,
  foldMemoryJournalV1,
  type InMemoryCanonicalMemoryStoreV1,
  type InMemoryStoreStateV1,
} from "./memory-store.js";
import type {
  AcceptedCandidateSnapshotV1,
  AdmissionStoreInputV1,
  CanonicalMemoryStorePort,
  CanonicalStoreCapabilitiesV1,
  CanonicalTransactionReceiptV1,
  ClockPort,
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

type PgClient = import("pg").Client;
type PgClientConfig = import("pg").ClientConfig;

/**
 * The Postgres canonical adapter mirrors the SQLite adapter's DELETE + full
 * re-INSERT persistence model.  That is an O(total-state) write amplification
 * per mutation, recorded in spec §8/§9 as the managed/cloud write-amplification
 * ceiling.  It is deliberately not re-architected here: parity with SQLite is
 * the L6b gate, incremental persistence is a later managed-service concern.
 */
type PgFailpoint = "after_blob" | "after_journal" | "after_state" | "after_lexical" | "after_outbox";
type PgStatement = "blob" | "journal" | "state" | "lexical" | "outbox";

export interface PostgresMemoryStoreOptionsV1 {
  /** A `pg` connection string or client configuration.  The adapter owns exactly one writer client. */
  connection: string | PgClientConfig;
  clock: ClockPort;
  store_id?: string;
  /**
   * Transaction-scoped advisory-lock key that fences one logical store on a
   * shared database.  Two writers must share it to contend.  Defaults to a
   * stable derivation of `store_id`.
   */
  advisory_key?: bigint;
  /** Injected only by native atomicity tests.  Throwing rolls back the whole transaction. */
  failpoint?: (stage: PgFailpoint) => void;
  /** Test seam for proving the mandatory second generation check before COMMIT. */
  before_commit?: () => void | Promise<void>;
  /** Observability for the native stale-generation assertion; business SQL is never reported before fencing. */
  on_mutation_statement?: (statement: PgStatement) => void;
}

interface StoredRow {
  [column: string]: unknown;
  cursor?: string;
  record_id?: string;
  body?: string;
  value?: string;
  generation?: string;
}

function refusal<T>(operation: MemoryOperation, code: "CAPABILITY_UNAVAILABLE" | "FENCE_LOST" | "STORE_UNAVAILABLE" | "JOURNAL_CORRUPT", message: string): Result<T> {
  return { ok: false, error: { code, operation, message, retryable: false } };
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

function parse<T>(value: string): T {
  return JSON.parse(value) as T;
}

function defaultAdvisoryKey(storeId: string): bigint {
  // 60 bits keeps the key comfortably inside the signed int8 advisory-lock space.
  const hex = createHash("sha256").update(`graphify-memory/advisory/${storeId}`, "utf8").digest("hex").slice(0, 15);
  return BigInt(`0x${hex}`);
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS memory_meta (key text PRIMARY KEY, value text NOT NULL);
  CREATE TABLE IF NOT EXISTS memory_generation (id integer PRIMARY KEY, generation numeric(20,0) NOT NULL);
  CREATE TABLE IF NOT EXISTS memory_highwater (id integer PRIMARY KEY, cursor numeric(20,0) NOT NULL);
  CREATE TABLE IF NOT EXISTS memory_blob (record_id text PRIMARY KEY, record_digest text NOT NULL, body text NOT NULL);
  CREATE TABLE IF NOT EXISTS memory_journal (cursor numeric(20,0) PRIMARY KEY, event_id text UNIQUE NOT NULL, body text NOT NULL);
  CREATE TABLE IF NOT EXISTS memory_state (entity_kind text NOT NULL, entity_id text NOT NULL, state text NOT NULL, body text NOT NULL, PRIMARY KEY(entity_kind, entity_id));
  CREATE TABLE IF NOT EXISTS memory_control (candidate_id text PRIMARY KEY, body text NOT NULL);
  CREATE TABLE IF NOT EXISTS memory_envelope (candidate_id text PRIMARY KEY, body text NOT NULL);
  CREATE TABLE IF NOT EXISTS accepted_lexical (record_id text PRIMARY KEY, record_digest text NOT NULL, body text NOT NULL);
  CREATE TABLE IF NOT EXISTS accepted_lexical_fts (
    record_id text PRIMARY KEY,
    primary_text text NOT NULL,
    context_text text NOT NULL,
    decision_text text NOT NULL,
    evidence_text text NOT NULL,
    citations_text text NOT NULL,
    tsv tsvector GENERATED ALWAYS AS (
      to_tsvector('simple', primary_text || ' ' || context_text || ' ' || decision_text || ' ' || evidence_text || ' ' || citations_text)
    ) STORED
  );
  CREATE TABLE IF NOT EXISTS memory_outbox (sequence bigint PRIMARY KEY, body text NOT NULL);
`;

function stateFromRows(rows: {
  journal: StoredRow[];
  controls: StoredRow[];
  envelopes: StoredRow[];
  records: StoredRow[];
  lexical: StoredRow[];
  outbox: StoredRow[];
}): InMemoryStoreStateV1 {
  return {
    journal: rows.journal.map((row) => parse(row.body!)),
    controls: rows.controls.map((row) => parse(row.body!)),
    envelopes: rows.envelopes.map((row) => parse(row.body!)),
    records: rows.records.map((row) => parse(row.body!)),
    lexical: rows.lexical.map((row) => ({ record_id: row.record_id!, document: parse(row.body!) })),
    outbox: rows.outbox.map((row) => parse(row.body!)),
  };
}

function checkedStoreState(state: InMemoryStoreStateV1): Result<InMemoryStoreStateV1> {
  const folded = foldMemoryJournalV1({ journal: state.journal, records: state.records });
  return folded.ok ? { ok: true, value: state } : { ok: false, error: { ...folded.error, operation: "admin" } };
}

class PostgresCanonicalStore implements CanonicalMemoryStorePort {
  readonly version = 1 as const;
  readonly capabilities: CanonicalStoreCapabilitiesV1 = {
    atomic_promotion: true,
    dense_cursor: true,
    accepted_only_lexical: true,
    fenced_single_writer: true,
    revocable_active_store: false,
    detached_snapshot: false,
    bounded_cancellation: true,
    backend: "postgres",
  };
  #closed = false;
  #fenceLost = false;
  #mutationTail: Promise<void> = Promise.resolve();
  #core: InMemoryCanonicalMemoryStoreV1;

  constructor(
    private readonly options: PostgresMemoryStoreOptionsV1,
    private readonly client: PgClient,
    private readonly advisoryKey: bigint,
    private readonly generation: string,
    core: InMemoryCanonicalMemoryStoreV1,
  ) {
    this.#core = core;
  }

  async #currentGeneration(): Promise<string | undefined> {
    const result = await this.client.query<StoredRow>("SELECT generation::text AS generation FROM memory_generation WHERE id = 1");
    return result.rows[0]?.generation;
  }

  /** Non-transactional ownership check used by the read surfaces and as a pre-mutation guard. */
  async #fence(operation: MemoryOperation): Promise<Result<{ fenced: true }>> {
    if (this.#closed) return refusal(operation, "STORE_UNAVAILABLE", "Postgres canonical store is closed");
    if (this.#fenceLost) return refusal(operation, "FENCE_LOST", "the Postgres store generation was superseded");
    try {
      const generation = await this.#currentGeneration();
      if (generation !== this.generation) {
        this.#fenceLost = true;
        return refusal(operation, "FENCE_LOST", "the durable Postgres store generation changed");
      }
    } catch {
      return refusal(operation, "STORE_UNAVAILABLE", "Postgres store generation could not be read");
    }
    return { ok: true, value: { fenced: true } };
  }

  /** Ownership check evaluated inside the open mutation transaction on the same client. */
  async #fenceInTransaction(operation: MemoryOperation): Promise<Result<{ fenced: true }>> {
    if (this.#fenceLost) return refusal(operation, "FENCE_LOST", "the Postgres store generation was superseded");
    const generation = await this.#currentGeneration();
    if (generation !== this.generation) {
      this.#fenceLost = true;
      return refusal(operation, "FENCE_LOST", "the durable Postgres store generation changed before commit");
    }
    return { ok: true, value: { fenced: true } };
  }

  #receiptAtGeneration(value: CanonicalTransactionReceiptV1): CanonicalTransactionReceiptV1 {
    const { receipt_digest: _receiptDigest, storage_epoch: _epoch, ...body } = value;
    const fencedBody = { ...body, storage_epoch: this.generation };
    return { ...fencedBody, receipt_digest: receiptDigest("canonical-transaction", fencedBody) } as CanonicalTransactionReceiptV1;
  }

  async #exclusive<T>(operation: MemoryOperation, task: () => Promise<Result<T>>): Promise<Result<T>> {
    let release: (() => void) | undefined;
    const prior = this.#mutationTail;
    this.#mutationTail = new Promise<void>((resolve) => { release = resolve; });
    await prior;
    try {
      return await task();
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

  async #writeState(snapshot: InMemoryStoreStateV1): Promise<void> {
    const folded = foldMemoryJournalV1({ journal: snapshot.journal, records: snapshot.records });
    if (!folded.ok) throw new Error("refusing to persist a corrupt canonical state");
    for (const table of ["memory_blob", "memory_journal", "memory_state", "memory_control", "memory_envelope", "accepted_lexical", "accepted_lexical_fts", "memory_outbox"]) {
      await this.client.query(`DELETE FROM ${table}`);
    }

    for (const record of snapshot.records) {
      await this.client.query("INSERT INTO memory_blob(record_id, record_digest, body) VALUES ($1, $2, $3)", [record.record_id, record.record_digest, json(record)]);
    }
    this.options.on_mutation_statement?.("blob");
    this.options.failpoint?.("after_blob");

    for (const event of snapshot.journal) {
      await this.client.query("INSERT INTO memory_journal(cursor, event_id, body) VALUES ($1, $2, $3)", [event.cursor, event.event_id, json(event)]);
    }
    this.options.on_mutation_statement?.("journal");
    this.options.failpoint?.("after_journal");

    for (const candidate of folded.value.candidates) {
      await this.client.query("INSERT INTO memory_state(entity_kind, entity_id, state, body) VALUES ('candidate', $1, $2, $3)", [candidate.candidate_id, candidate.state, json(candidate)]);
    }
    for (const record of folded.value.records) {
      await this.client.query("INSERT INTO memory_state(entity_kind, entity_id, state, body) VALUES ('record', $1, $2, $3)", [record.record_id, record.state, json(record)]);
    }
    for (const control of snapshot.controls) {
      await this.client.query("INSERT INTO memory_control(candidate_id, body) VALUES ($1, $2)", [control.candidate_id, json(control)]);
    }
    for (const envelope of snapshot.envelopes) {
      await this.client.query("INSERT INTO memory_envelope(candidate_id, body) VALUES ($1, $2)", [envelope.candidate_id, json(envelope)]);
    }
    this.options.on_mutation_statement?.("state");
    this.options.failpoint?.("after_state");

    for (const { record_id, document } of snapshot.lexical) {
      await this.client.query("INSERT INTO accepted_lexical(record_id, record_digest, body) VALUES ($1, $2, $3)", [record_id, document.record_digest, json(document)]);
      await this.client.query(
        "INSERT INTO accepted_lexical_fts(record_id, primary_text, context_text, decision_text, evidence_text, citations_text) VALUES ($1, $2, $3, $4, $5, $6)",
        [record_id, document.fields.primary, document.fields.context, document.fields.decision, document.fields.evidence, document.fields.citations],
      );
    }
    this.options.on_mutation_statement?.("lexical");
    this.options.failpoint?.("after_lexical");

    for (const [index, batch] of snapshot.outbox.entries()) {
      await this.client.query("INSERT INTO memory_outbox(sequence, body) VALUES ($1, $2)", [index + 1, json(batch)]);
    }
    this.options.on_mutation_statement?.("outbox");
    this.options.failpoint?.("after_outbox");
  }

  async #transaction<T>(operation: MemoryOperation, stage: (working: InMemoryCanonicalMemoryStoreV1) => Promise<Result<T>>): Promise<Result<T>> {
    return this.#exclusive(operation, async () => {
      const pre = await this.#fence(operation);
      if (!pre.ok) return pre;
      const working = this.#newWorkingStore();
      if (!working.ok) return working;
      const result = await stage(working.value);
      if (!result.ok) return result;
      const snapshot = working.value.exportStateForPersistence();
      if (!snapshot.ok) return snapshot;
      let began = false;
      try {
        await this.client.query("BEGIN");
        began = true;
        // Transaction-scoped advisory lock serializes writers on this logical store.
        await this.client.query("SELECT pg_advisory_xact_lock($1)", [this.advisoryKey.toString()]);
        // Required before the first persistent state change; a superseded writer
        // cannot execute a blob/journal/state/lexical/outbox statement.
        const before = await this.#fenceInTransaction(operation);
        if (!before.ok) {
          await this.client.query("ROLLBACK");
          began = false;
          return before;
        }
        // Lock the singleton high-water row.  `next` is derived from the folded
        // journal, so a rollback advances neither the row nor the cursor.
        const locked = await this.client.query<StoredRow>("SELECT cursor::text AS cursor FROM memory_highwater WHERE id = 1 FOR UPDATE");
        const current = BigInt(locked.rows[0]?.cursor ?? "0");
        await this.#writeState(snapshot.value);
        const nextHighWater = snapshot.value.journal.length === 0 ? 0n : BigInt(snapshot.value.journal[snapshot.value.journal.length - 1]!.cursor);
        if (nextHighWater < current) {
          await this.client.query("ROLLBACK");
          began = false;
          return refusal(operation, "STORE_UNAVAILABLE", "canonical high-water regressed against the singleton row");
        }
        await this.client.query("UPDATE memory_highwater SET cursor = $1 WHERE id = 1", [nextHighWater.toString()]);
        await this.options.before_commit?.();
        // Required after the last mutation and before commit.  This detects a
        // generation supersession even inside the open transaction.
        const beforeCommit = await this.#fenceInTransaction(operation);
        if (!beforeCommit.ok) {
          await this.client.query("ROLLBACK");
          began = false;
          return beforeCommit;
        }
        await this.client.query("COMMIT");
        began = false;
        this.#core = working.value;
        if (result.value !== null && typeof result.value === "object" && "storage_epoch" in result.value) {
          return { ok: true, value: this.#receiptAtGeneration(result.value as unknown as CanonicalTransactionReceiptV1) as T };
        }
        return result;
      } catch {
        if (began) {
          try { await this.client.query("ROLLBACK"); } catch { /* the connection is already unwound */ }
        }
        return refusal(operation, this.#fenceLost ? "FENCE_LOST" : "STORE_UNAVAILABLE", this.#fenceLost
          ? "the Postgres writer generation was superseded before commit"
          : "Postgres promotion transaction rolled back");
      }
    });
  }

  async #read<T>(operation: MemoryOperation, task: () => Promise<Result<T>>): Promise<Result<T>> {
    return this.#exclusive(operation, async () => {
      const fence = await this.#fence(operation);
      return fence.ok ? await task() : fence;
    });
  }

  async commitPending(input: Parameters<CanonicalMemoryStorePort["commitPending"]>[0]): Promise<Result<CanonicalTransactionReceiptV1>> {
    return this.#transaction("capture", (working) => working.commitPending(input));
  }

  async readPending(input: Parameters<CanonicalMemoryStorePort["readPending"]>[0]): Promise<Result<PendingCandidateSnapshotV1>> {
    return this.#read("request_admission", () => this.#core.readPending(input));
  }

  async applyAdmission(input: AdmissionStoreInputV1): Promise<Result<CanonicalTransactionReceiptV1>> {
    return this.#transaction("request_admission", (working) => working.applyAdmission(input));
  }

  async applyLifecycle(input: Parameters<CanonicalMemoryStorePort["applyLifecycle"]>[0]): Promise<Result<CanonicalTransactionReceiptV1>> {
    return this.#transaction(input.command.operation, (working) => working.applyLifecycle(input));
  }

  async readRecord(input: Parameters<CanonicalMemoryStorePort["readRecord"]>[0]): Promise<Result<MemoryRecordV2>> {
    return this.#read("recall_current", () => this.#core.readRecord(input));
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
    return this.#read("admin", () => this.#core.readJournal(input));
  }

  async checkpoint(input: Parameters<CanonicalMemoryStorePort["checkpoint"]>[0]): Promise<Result<RecoveryCheckpointManifestV1>> {
    return this.#read("admin", async () => {
      const checkpoint = await this.#core.checkpoint(input);
      if (!checkpoint.ok) return checkpoint;
      const { manifest_digest: _manifestDigest, storage_epoch: _epoch, ...body } = checkpoint.value;
      const fencedBody = { ...body, storage_epoch: this.generation };
      return { ok: true, value: { ...fencedBody, manifest_digest: receiptDigest("recovery-checkpoint", fencedBody) } };
    });
  }

  async nextProjectionBatch(input: Parameters<CanonicalMemoryStorePort["nextProjectionBatch"]>[0]): Promise<Result<ProjectionBatchV1>> {
    return this.#read("projection_invalidate", () => this.#core.nextProjectionBatch(input));
  }

  async acknowledgeProjection(input: ProjectionInvalidationReceiptV1): Promise<Result<CanonicalTransactionReceiptV1>> {
    return this.#transaction("projection_invalidate", (working) => working.acknowledgeProjection(input));
  }

  async readiness(): Promise<Result<OperationalCapabilityReceiptV1>> {
    return this.#read("admin", async () => {
      const readiness = await this.#core.readiness();
      if (!readiness.ok) return readiness;
      const { receipt_digest: _receiptDigest, storage_epoch: _epoch, capabilities: _capabilities, backend: _backend, store_id: _storeId, ...body } = readiness.value;
      const fencedBody = {
        ...body,
        store_id: this.options.store_id ?? "postgres:canonical",
        backend: "postgres" as const,
        storage_epoch: this.generation,
        capabilities: this.capabilities,
      };
      return { ok: true, value: { ...fencedBody, receipt_digest: receiptDigest("operational-capability", fencedBody) } };
    });
  }

  async close(): Promise<Result<{ closed: true }>> {
    if (this.#closed) return { ok: true, value: { closed: true } };
    this.#closed = true;
    try {
      await this.client.end();
    } catch { /* best effort connection teardown */ }
    return { ok: true, value: { closed: true } };
  }
}

/**
 * Opens the writer client for a Postgres canonical store.  Opening advances a
 * durable store-generation under a transaction-scoped advisory lock; a later
 * owner's generation supersedes this one, and every mutation checks the
 * generation before its first statement and again before commit.
 */
export async function openPostgresCanonicalMemoryStoreV1(options: PostgresMemoryStoreOptionsV1): Promise<Result<CanonicalMemoryStorePort>> {
  const advisoryKey = options.advisory_key ?? defaultAdvisoryKey(options.store_id ?? "postgres:canonical");
  let client: PgClient | undefined;
  try {
    const pg = (await import("pg")).default;
    client = new pg.Client(options.connection);
    // A dropped connection (e.g. the database going away underneath the writer)
    // must surface as a typed refusal on the next query, never an unhandled event.
    client.on("error", () => { /* observed at the next query boundary */ });
    await client.connect();
  } catch {
    if (client !== undefined) { try { await client.end(); } catch { /* ignore */ } }
    return refusal("admin", "CAPABILITY_UNAVAILABLE", "the declared pg driver or Postgres connection is unavailable");
  }
  try {
    await client.query(SCHEMA);
    await client.query("BEGIN");
    // Serialize concurrent openers so generations strictly increase.
    await client.query("SELECT pg_advisory_xact_lock($1)", [advisoryKey.toString()]);
    await client.query("INSERT INTO memory_generation(id, generation) VALUES (1, 0) ON CONFLICT (id) DO NOTHING");
    await client.query("INSERT INTO memory_highwater(id, cursor) VALUES (1, 0) ON CONFLICT (id) DO NOTHING");
    const locked = await client.query<StoredRow>("SELECT generation::text AS generation FROM memory_generation WHERE id = 1 FOR UPDATE");
    const generation = (BigInt(locked.rows[0]?.generation ?? "0") + 1n).toString();
    await client.query("UPDATE memory_generation SET generation = $1 WHERE id = 1", [generation]);
    await client.query("COMMIT");

    // One writer client serves every statement, so the load reads run in
    // sequence; concurrent queries on a single pg client are unsupported.
    const journal = await client.query<StoredRow>("SELECT body FROM memory_journal ORDER BY cursor");
    const controls = await client.query<StoredRow>("SELECT body FROM memory_control ORDER BY candidate_id");
    const envelopes = await client.query<StoredRow>("SELECT body FROM memory_envelope ORDER BY candidate_id");
    const records = await client.query<StoredRow>("SELECT body FROM memory_blob ORDER BY record_id");
    const lexical = await client.query<StoredRow>("SELECT record_id, body FROM accepted_lexical ORDER BY record_id");
    const outbox = await client.query<StoredRow>("SELECT body FROM memory_outbox ORDER BY sequence");
    const highwater = await client.query<StoredRow>("SELECT cursor::text AS cursor FROM memory_highwater WHERE id = 1");
    const persisted = checkedStoreState(stateFromRows({
      journal: journal.rows, controls: controls.rows, envelopes: envelopes.rows, records: records.rows, lexical: lexical.rows, outbox: outbox.rows,
    }));
    if (!persisted.ok) {
      await client.end();
      return persisted;
    }
    const journalHighWater = persisted.value.journal.length === 0 ? "0" : persisted.value.journal[persisted.value.journal.length - 1]!.cursor;
    if ((highwater.rows[0]?.cursor ?? "0") !== journalHighWater) {
      await client.end();
      return refusal("admin", "JOURNAL_CORRUPT", "the singleton high-water row disagrees with the durable journal");
    }
    const core = createInMemoryCanonicalMemoryStoreV1({ clock: options.clock, store_id: options.store_id, persistence: persisted.value });
    const ready = await core.readiness();
    if (!ready.ok) {
      await client.end();
      return { ok: false, error: { ...ready.error, operation: "admin" } };
    }
    return { ok: true, value: new PostgresCanonicalStore(options, client, advisoryKey, generation, core) };
  } catch {
    try { await client.query("ROLLBACK"); } catch { /* no open transaction */ }
    try { await client.end(); } catch { /* best effort */ }
    return refusal("admin", "STORE_UNAVAILABLE", "the Postgres canonical schema or generation fence could not be initialized");
  }
}
