import { requireHostDriver } from "../host-driver.js";
/**
 * PostgresExactVectorStore — real vector projection over stock Postgres (owner decision 2026-10-14).
 * INVARIANTS (breaking case class each): 1 idempotent removal by record_id deletes owned vectors
 * and derived contributions, never sibling namespaces (breaks on a namespace-blind delete); 2 exact
 * cosine over surviving rows only — deleted ids never score (breaks if scoring precedes filtering);
 * 3 terminal tombstones persist in the manifest and fold out of every replay/reopen cut (breaks if a
 * manifest write is lost or skipped); 4 uncommitted row writes stay invisible until the manifest
 * commits (breaks if readers serve rows outside the manifest live set); 5 no new dependency, image or
 * extension: only the existing `pg` driver over `double precision[]` (breaks on any other import).
 */
import { randomUUID } from "node:crypto";
import {
  compareCursor,
  freshX2bState,
  planX2bApply,
  planX2bPrepare,
  x2bContentDigest,
  x2bStateDigest,
  x2bSurfaceRefusal,
  type X2bCoverage,
  type X2bPendingEntry,
  type X2bPersistedState,
  type X2bPrepareInput,
  type X2bProjectionBatch,
  type X2bRecordRef,
  type X2bResult,
} from "../memory-projection.js";
import type {
  EmbeddingVector,
  VectorMatch,
  VectorQuery,
  VectorStore,
  VectorUpsertOptions,
} from "./types.js";

export const X2B_VECTOR_TABLE = "x2b_exact_vectors";
export const X2B_MANIFEST_TABLE = "x2b_exact_manifest";

export function postgresExactDdl(): string[] {
  return [
    `CREATE TABLE IF NOT EXISTS ${X2B_VECTOR_TABLE} (namespace TEXT NOT NULL, vector_id TEXT NOT NULL, embedding DOUBLE PRECISION[] NOT NULL, metadata TEXT, PRIMARY KEY (namespace, vector_id))`,
    `CREATE TABLE IF NOT EXISTS ${X2B_MANIFEST_TABLE} (namespace TEXT PRIMARY KEY, manifest TEXT NOT NULL)`,
  ];
}

export const X2B_UPSERT_VECTOR =
  `INSERT INTO ${X2B_VECTOR_TABLE} (namespace, vector_id, embedding, metadata) VALUES ($1, $2, $3, $4) ` +
  `ON CONFLICT (namespace, vector_id) DO UPDATE SET embedding = EXCLUDED.embedding, metadata = EXCLUDED.metadata`;
export const X2B_DELETE_VECTORS = `DELETE FROM ${X2B_VECTOR_TABLE} WHERE namespace = $1 AND vector_id = ANY ($2)`;
export const X2B_DELETE_NAMESPACE = `DELETE FROM ${X2B_VECTOR_TABLE} WHERE namespace = $1`;
export const X2B_SELECT_VECTORS = `SELECT vector_id, embedding FROM ${X2B_VECTOR_TABLE} WHERE namespace = $1`;
export const X2B_SELECT_MANIFEST = `SELECT manifest FROM ${X2B_MANIFEST_TABLE} WHERE namespace = $1`;
export const X2B_SELECT_MANIFEST_FOR_UPDATE = `SELECT manifest FROM ${X2B_MANIFEST_TABLE} WHERE namespace = $1 FOR UPDATE`;
export const X2B_ADVISORY_LOCK = `SELECT pg_advisory_xact_lock(2147483647, hashtext($1))`;
export const X2B_UPSERT_MANIFEST =
  `INSERT INTO ${X2B_MANIFEST_TABLE} (namespace, manifest) VALUES ($1, $2) ` +
  `ON CONFLICT (namespace) DO UPDATE SET manifest = EXCLUDED.manifest`;

async function ensurePostgresExactSchema(runner: X2bSqlRunner): Promise<void> {
  await runner.withTransaction(async (tx) => {
    await tx.query(X2B_ADVISORY_LOCK, ["postgres-exact:schema/v1"]);
    for (const ddl of postgresExactDdl()) await tx.query(ddl);
  });
}

export interface X2bSqlRunner {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
  /**
   * Runs work atomically: stock Postgres uses one dedicated client with BEGIN/COMMIT/ROLLBACK
   * (row writes and the manifest commit share the transaction, so an interruption before
   * commit leaves no physical row behind); the hermetic memory runner serializes and
   * snapshots/restores with the same all-or-nothing semantics.
   */
  withTransaction<T>(work: (tx: X2bSqlRunner) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Hermetic in-memory interpreter of exactly the statements above (test-only; production uses `pg`). */
export function createX2bMemorySqlRunner(): X2bSqlRunner {
  const vectors = new Map<string, { embedding: number[]; metadata: string | null }>();
  const manifests = new Map<string, string>();
  let tail: Promise<void> = Promise.resolve();
  async function query(text: string, values: unknown[] = []): Promise<{ rows: Array<Record<string, unknown>> }> {
    if (text.startsWith("CREATE TABLE")) return { rows: [] };
    if (text.startsWith("SELECT pg_advisory_xact_lock")) return { rows: [] };
    if (text === "SELECT 1") return { rows: [{ ok: 1 }] };
    if (text === X2B_UPSERT_VECTOR) {
      const [namespace, vectorId, embedding, metadata] = values as [string, string, number[], string | null];
      vectors.set(`${namespace}::${vectorId}`, { embedding: [...embedding], metadata });
      return { rows: [] };
    }
    if (text === X2B_DELETE_VECTORS) {
      const [namespace, ids] = values as [string, string[]];
      for (const id of ids) vectors.delete(`${namespace}::${id}`);
      return { rows: [] };
    }
    if (text === X2B_DELETE_NAMESPACE) {
      const [namespace] = values as [string];
      for (const key of [...vectors.keys()]) {
        if (key.startsWith(`${namespace}::`)) vectors.delete(key);
      }
      return { rows: [] };
    }
    if (text === X2B_SELECT_VECTORS) {
      const [namespace] = values as [string];
      return {
        rows: [...vectors.entries()]
          .filter(([key]) => key.startsWith(`${namespace}::`))
          .map(([key, value]) => ({ vector_id: key.slice(namespace.length + 2), embedding: [...value.embedding] })),
      };
    }
    if (text === X2B_SELECT_MANIFEST || text === X2B_SELECT_MANIFEST_FOR_UPDATE) {
      const [namespace] = values as [string];
      const manifest = manifests.get(namespace);
      return manifest === undefined ? { rows: [] } : { rows: [{ manifest }] };
    }
    if (text === X2B_UPSERT_MANIFEST) {
      const [namespace, manifest] = values as [string, string];
      manifests.set(namespace, manifest);
      return { rows: [] };
    }
    throw new Error(`x2b memory sql runner: unsupported statement ${text.slice(0, 64)}`);
  }
  return {
    query,
    async withTransaction<T>(work: (tx: X2bSqlRunner) => Promise<T>): Promise<T> {
      const run = tail.then(async () => {
        const snapVectors = new Map<string, { embedding: number[]; metadata: string | null }>(
          [...vectors].map(([key, value]) => [key, { embedding: [...value.embedding], metadata: value.metadata }]),
        );
        const snapManifests = new Map(manifests);
        const tx: X2bSqlRunner = { query, withTransaction: (inner) => inner(tx), close: async () => {} };
        try {
          return await work(tx);
        } catch (error) {
          vectors.clear();
          for (const [key, value] of snapVectors) vectors.set(key, value);
          manifests.clear();
          for (const [key, value] of snapManifests) manifests.set(key, value);
          throw error;
        }
      });
      tail = run.then(
        () => {},
        () => {},
      );
      return run;
    },
    async close() {},
  };
}

function refusal(code: string, message: string, retryable: boolean): { ok: false; error: { code: string; operation: string; message: string; retryable: boolean } } {
  return { ok: false, error: { code, operation: "projection_invalidate", message, retryable } };
}

function deriveNamespace(config: { namespace?: string }): string {
  return `vector-store:${JSON.stringify(config.namespace ?? "default")}`;
}

function cosineSimilarity(left: number[], right: number[]): number {
  let dot = 0;
  let a = 0;
  let b = 0;
  for (let i = 0; i < left.length; i++) {
    dot += left[i]! * right[i]!;
    a += left[i]! * left[i]!;
    b += right[i]! * right[i]!;
  }
  if (a === 0 || b === 0) return 0;
  return dot / Math.sqrt(a * b);
}

interface PgModule {
  Pool?: new (config: { connectionString?: string; ssl?: unknown }) => {
    query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
    connect(): Promise<{
      query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
      release(): void;
    }>;
    end(): Promise<unknown> | unknown;
    on?(event: string, listener: (...args: Array<unknown>) => void): void;
  };
}

async function resolvePgRunner(
  connectionString: string | undefined,
  driverModule: unknown,
): Promise<{ runner: X2bSqlRunner; owned: boolean }> {
  if (driverModule !== undefined && typeof (driverModule as { query?: unknown }).query === "function") {
    return { runner: driverModule as X2bSqlRunner, owned: false };
  }
  const pgMod = requireHostDriver("postgres-exact", "pg", driverModule);
  const mod = (pgMod.default ?? pgMod) as Partial<PgModule>;
  if (typeof mod.Pool !== "function") throw new Error("store 'postgres-exact' requires pg (already a dependency)");
  if (connectionString === undefined) throw new Error("postgres-exact store requires a connection string");
  const pool = new mod.Pool({ connectionString });
  // An idle client lost to a database restart must never become an unhandled host
  // exception: health stays observable per operation, which already maps faults to refusals.
  pool.on?.("error", () => {});
  return {
    runner: {
      async query(text: string, values: unknown[] = []) {
        const result = await pool.query(text, values);
        return { rows: result.rows };
      },
      // One dedicated client per transaction: row writes and the manifest commit share
      // BEGIN/COMMIT, so an interruption before commit rolls every physical row back.
      async withTransaction<T>(work: (tx: X2bSqlRunner) => Promise<T>): Promise<T> {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const tx: X2bSqlRunner = {
            query: async (text: string, values: unknown[] = []) => {
              const result = await client.query(text, values);
              return { rows: result.rows };
            },
            withTransaction: (inner) => inner(tx),
            close: async () => {},
          };
          try {
            const out = await work(tx);
            await client.query("COMMIT");
            return out;
          } catch (error) {
            try {
              await client.query("ROLLBACK");
            } catch {
              // The rollback itself failed: the original error already describes the outcome.
            }
            throw error;
          }
        } finally {
          client.release();
        }
      },
      async close() {
        await pool.end();
      },
    },
    owned: true,
  };
}

export interface PostgresExactStoreConfig {
  connectionString?: string;
  namespace?: string;
  dimension?: number;
}

export interface PostgresExactStoreDeps {
  driverModule?: unknown;
}

/**
 * Real vector store over stock Postgres: namespaced `double precision[]` rows, exact cosine
 * search computed over surviving rows only. No extension, no new image, no new dependency.
 */
export async function createPostgresExactVectorStore(
  config: PostgresExactStoreConfig,
  deps?: PostgresExactStoreDeps,
): Promise<VectorStore> {
  const dimension = config.dimension ?? 8;
  if (!Number.isInteger(dimension) || dimension <= 0) {
    throw new Error(`postgres-exact store requires a positive integer dimension; got ${config.dimension}`);
  }
  const namespace = deriveNamespace(config);
  const { runner, owned } = await resolvePgRunner(config.connectionString, deps?.driverModule);
  await ensurePostgresExactSchema(runner);
  function assertDimension(vector: number[], label: string): void {
    if (vector.length !== dimension) {
      throw new Error(`postgres-exact dimension mismatch: ${label} has ${vector.length} values but the store dimension is ${dimension}`);
    }
  }
  return {
    id: "postgres-exact",
    dimension,
    capabilities: { upsert: true, query: true, clear: true, metrics: ["cosine"] },
    async verifyConnection(): Promise<void> {
      await runner.query("SELECT 1");
    },
    async upsertVectors(vectors: EmbeddingVector[], options: VectorUpsertOptions = {}) {
      const start = Date.now();
      const targetNamespace = options.namespace === undefined ? namespace : deriveNamespace(options);
      for (const vector of vectors) assertDimension(vector.vector, `vector '${vector.id}'`);
      if (options.dryRun === true) return { count: vectors.length, warnings: [], durationMs: Date.now() - start };
      const count = await runner.withTransaction(async (tx) => {
        const namespaces = new Set([targetNamespace, ...vectors.map((v) => v.namespace === undefined ? targetNamespace : deriveNamespace(v))]);
        for (const ns of [...namespaces].sort()) await tx.query(X2B_ADVISORY_LOCK, [ns]);
        if ((options.mode ?? "merge") === "replace") await tx.query(X2B_DELETE_NAMESPACE, [targetNamespace]);
        for (const vector of vectors) {
          await tx.query(X2B_UPSERT_VECTOR, [
            vector.namespace === undefined ? targetNamespace : deriveNamespace(vector),
            vector.id, vector.vector, vector.metadata !== undefined ? JSON.stringify(vector.metadata) : null,
          ]);
        }
        return vectors.length;
      });
      return { count, warnings: [], durationMs: Date.now() - start };
    },
    async query(query: VectorQuery): Promise<VectorMatch[]> {
      assertDimension(query.vector, "query vector");
      const requestedNamespace = query.namespace ?? query.filter?.city_slug;
      const targetNamespace = typeof requestedNamespace === "string" ? deriveNamespace({ namespace: requestedNamespace }) : namespace;
      const result = await runner.query(X2B_SELECT_VECTORS, [targetNamespace]);
      const scored = result.rows.map((row) => ({
        id: String(row.vector_id),
        score: cosineSimilarity(query.vector, (row.embedding as number[]).map(Number)),
        namespace: typeof requestedNamespace === "string" ? requestedNamespace : config.namespace ?? "default",
      }));
      scored.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
      return scored.slice(0, query.topK ?? 10);
    },
    async clear(targetNamespace?: string): Promise<void> {
      const ns = targetNamespace === undefined ? namespace : deriveNamespace({ namespace: targetNamespace });
      await runner.withTransaction(async (tx) => {
        await tx.query(X2B_ADVISORY_LOCK, [ns]);
        await tx.query(X2B_DELETE_NAMESPACE, [ns]);
      });
    },
    async close(): Promise<void> {
      if (owned) await runner.close();
    },
  };
}

export interface PostgresExactProjectionOptions {
  namespace?: string;
  dimension?: number;
  connectionString?: string;
  sqlRunner?: X2bSqlRunner;
  driverModule?: unknown;
  embed?: (record: X2bRecordRef) => number[];
  contribute?: (record: X2bRecordRef) => number;
  /** Text-to-vector for port-level `query`; defaults to the deterministic CI embedder below. */
  embedText?: (queryText: string) => number[];
  clock?: () => string;
  applyOrder?: "adds-first" | "removals-first";
  hooks?: { beforePublish?: (priorPublications: number) => void; beforeManifestCommit?: (priorPublications: number) => void };
  /** X2 apply-time terminal resolution over the canonical journal total order (see memory-projection). */
  resolveTerminal: (recordIds: readonly string[]) => Promise<ReadonlySet<string>> | ReadonlySet<string>;
}

/** Deterministic query-text embedder (CI default; production injects `embedText`). */
export function defaultX2bEmbedText(dimension: number): (queryText: string) => number[] {
  return (queryText: string) => {
    let seed = 0;
    for (let i = 0; i < queryText.length; i++) seed = (Math.imul(seed, 31) + queryText.charCodeAt(i)) >>> 0;
    const out: number[] = [];
    for (let i = 0; i < dimension; i++) {
      seed = ((Math.imul(seed, 1103515245) + 12345) & 0x7fffffff) >>> 0;
      out.push(seed / 0x7fffffff - 0.5);
    }
    return out;
  };
}

function defaultEmbed(dimension: number): (record: X2bRecordRef) => number[] {
  return (record: X2bRecordRef) => {
    let seed = 0;
    for (let i = 0; i < record.record_id.length; i++) seed = (Math.imul(seed, 31) + record.record_id.charCodeAt(i)) >>> 0;
    const out: number[] = [];
    for (let i = 0; i < dimension; i++) {
      seed = ((Math.imul(seed, 1103515245) + 12345) & 0x7fffffff) >>> 0;
      out.push(seed / 0x7fffffff - 0.5);
    }
    return out;
  };
}

/**
 * Real vector projection adapter: the same generation/manifest/tombstone contract as the file
 * graph adapter, persisted in `x2b_exact_manifest` with vectors in `x2b_exact_vectors`. Row
 * writes and the manifest commit share one transaction (plus a per-namespace advisory lock),
 * so an interruption before commit rolls every physical row back and a resume replays the
 * deletion before any read. Readers resolve the manifest live set first.
 */
export async function createPostgresExactProjectionAdapter(options: PostgresExactProjectionOptions) {
  if (typeof options.resolveTerminal !== "function") throw new Error("canonical resolveTerminal is required");
  const namespace = `memory-projection:${JSON.stringify(options.namespace ?? "x2b")}`;
  const dimension = options.dimension ?? 8;
  const clock = options.clock ?? (() => new Date().toISOString());
  const order = options.applyOrder ?? "adds-first";
  const hooks = options.hooks ?? {};
  const embed = options.embed ?? defaultEmbed(dimension);
  const contribute = options.contribute ?? (() => 1);
  const resolveTerminal = options.resolveTerminal;

  // Transaction control-flow markers: thrown inside `withTransaction` (which rolls back),
  // mapped to typed refusals outside it. Anything else becomes STORE_UNAVAILABLE.
  const TX_CONFLICT = "conflict";
  const TX_STALE = "stale";
  const TX_INTERRUPTED = "interrupted";
  const TX_MATERIAL = "material";
  const TX_REFUSAL = "refusal";

  let runner: X2bSqlRunner;
  let ownedRunner: boolean;
  if (options.sqlRunner !== undefined) {
    runner = options.sqlRunner;
    ownedRunner = false;
  } else {
    const resolved = await resolvePgRunner(options.connectionString, options.driverModule);
    runner = resolved.runner;
    ownedRunner = resolved.owned;
  }
  // Schema work belongs to construction, never to a read path.
  await ensurePostgresExactSchema(runner);

  async function readManifestFrom(executor: X2bSqlRunner, forUpdate: boolean): Promise<X2bPersistedState> {
    const found = await executor.query(forUpdate ? X2B_SELECT_MANIFEST_FOR_UPDATE : X2B_SELECT_MANIFEST, [namespace]);
    const raw = found.rows[0]?.manifest as string | Record<string, unknown> | undefined;
    if (raw === undefined) return freshX2bState(namespace);
    const state = (typeof raw === "string" ? JSON.parse(raw) : raw) as X2bPersistedState;
    state.lastTouch = Object.assign(Object.create(null), state.lastTouch);
    state.influence = Object.assign(Object.create(null), state.influence);
    state.operations = Object.assign(Object.create(null), state.operations);
    state.pending = {};
    if (state.mirrorIntent === undefined) state.mirrorIntent = null;
    return state;
  }

  async function load(): Promise<X2bPersistedState> {
    return readManifestFrom(runner, false);
  }

  const pending = new Map<string, X2bPendingEntry>();

  function lookup(state: X2bPersistedState, token: string): X2bResult<X2bPendingEntry> {
    const entry = pending.get(token);
    if (entry === undefined || entry.incarnation !== state.incarnation) {
      return refusal("UNKNOWN_PUBLICATION", "unknown publication token or previous incarnation", false);
    }
    return { ok: true, value: entry };
  }

  function txMarker(error: unknown): string | undefined {
    return (error as { marker?: string } | null)?.marker;
  }

  /**
   * Preparation inside the advisory-locked transaction: the operations map (which binds
   * operation identity to content for DIGEST_CONFLICT) persists atomically with the
   * decision, so a concurrent preparer can never clobber it with a blind manifest write.
   */
  async function prepareLocked(
    input: X2bPrepareInput,
  ): Promise<X2bResult<{ token: string; duplicate: boolean }>> {
    let outcome: { token: string; entry: X2bPendingEntry; duplicate: boolean };
    try {
      outcome = await runner.withTransaction(async (tx) => {
        await tx.query(X2B_ADVISORY_LOCK, [namespace]);
        const fresh = await readManifestFrom(tx, true);
        const prepared = planX2bPrepare(fresh, input, clock());
        if (!prepared.ok) throw { marker: TX_REFUSAL, refusal: prepared };
        await tx.query(X2B_UPSERT_MANIFEST, [namespace, JSON.stringify({ ...fresh, pending: {} })]);
        return {
          token: prepared.value.token,
          entry: fresh.pending[prepared.value.token] as X2bPendingEntry,
          duplicate: prepared.value.duplicate,
        };
      });
    } catch (error) {
      if (txMarker(error) === TX_REFUSAL) {
        return (error as { refusal: X2bResult<{ token: string; duplicate: boolean }> }).refusal;
      }
      return refusal("STORE_UNAVAILABLE", "preparation transaction failed; nothing prepared", true);
    }
    pending.set(outcome.token, outcome.entry);
    return { ok: true, value: { token: outcome.token, duplicate: outcome.duplicate } };
  }

  async function resolveIds(recordIds: readonly string[]): Promise<X2bResult<ReadonlySet<string>>> {
    try {
      return { ok: true, value: await resolveTerminal(recordIds) };
    } catch {
      return refusal("STORE_UNAVAILABLE", "canonical terminal resolution failed; retry", true);
    }
  }

  async function publishEntry(
    state: X2bPersistedState,
    entry: X2bPendingEntry,
  ): Promise<X2bResult<{ generation: string; headCursor: string; manifestDigest: string; manifestSeq: number }>> {
    const proof = (committed: X2bPersistedState): { generation: string; headCursor: string; manifestDigest: string; manifestSeq: number } => ({
      generation: committed.generation,
      headCursor: committed.headCursor,
      manifestDigest: x2bStateDigest(committed, namespace),
      manifestSeq: committed.manifestSeq,
    });
    if (entry.stage === "published" || entry.stage === "acknowledged") {
      return { ok: true, value: proof(state) };
    }
    if (!state.fenceHeld) return refusal("FENCE_LOST", "canonical fence is lost; reacquire before publishing", true);
    if (clock() >= entry.deadlineAt) return refusal("DEADLINE_EXCEEDED", "publication deadline elapsed", false);
    try {
      hooks.beforePublish?.(state.publications);
    } catch {
      return refusal("PUBLICATION_INTERRUPTED", "publication interrupted before commit; prior publication preserved", true);
    }
    if (entry.manifestSeq !== state.manifestSeq) {
      return refusal("MANIFEST_CONFLICT", "manifest advanced under a competing writer; retry", true);
    }
    if (compareCursor(entry.headCursor, state.headCursor) < 0) {
      return refusal("PROJECTION_STALE", "stale head cannot publish past the pinned canonical head", false);
    }
    // X2 apply-time filter: terminality is resolved now, over the canonical journal order —
    // the batch's opaque reason_ref never decides it.
    const recordIds = [...new Set(entry.batches.flatMap((batch) => [
      ...batch.records.map((record) => record.record_id),
      ...batch.removals.map((removal) => removal.record_id),
    ]))];
    const resolved = await resolveIds(recordIds);
    if (!resolved.ok) return resolved;
    const priorPublications = state.publications;
    let committed: X2bPersistedState;
    try {
      committed = await runner.withTransaction(async (tx) => {
        await tx.query(X2B_ADVISORY_LOCK, [namespace]);
        const fresh = await readManifestFrom(tx, true);
        if (entry.manifestSeq !== fresh.manifestSeq) throw { marker: TX_CONFLICT };
        if (!fresh.fenceHeld) throw { marker: TX_REFUSAL, refusal: refusal("FENCE_LOST", "fence lost before publication", true) };
        if (clock() >= entry.deadlineAt) throw { marker: TX_REFUSAL, refusal: refusal("DEADLINE_EXCEEDED", "publication deadline elapsed", false) };
        if (compareCursor(entry.headCursor, fresh.headCursor) < 0) throw { marker: TX_STALE };
        const plan = planX2bApply(fresh, entry.batches, order, resolved.value);
        const vectors = new Map<string, number[]>();
        try {
          for (const record of plan.added) {
            const vector = embed(record);
            if (vector.length !== dimension) throw { marker: TX_MATERIAL };
            vectors.set(record.record_id, vector);
          }
        } catch (error) {
          if (txMarker(error) === TX_MATERIAL) throw error;
          throw { marker: TX_MATERIAL };
        }
        for (const [recordId, vector] of vectors) {
          await tx.query(X2B_UPSERT_VECTOR, [namespace, recordId, vector, null]);
        }
        // Physical purges require this record's canonical terminal tombstone. Reversible
        // exclusions remain hidden by the manifest and cannot delete a living vector.
        if (plan.purged.length > 0) {
          await tx.query(X2B_DELETE_VECTORS, [namespace, plan.purged]);
        }
        fresh.live = [...plan.live].sort();
        fresh.lastTouch = plan.lastTouch;
        fresh.tombstoned = [...plan.tombstoned].sort();
        fresh.influence = plan.influence;
        for (const record of plan.added) {
          try {
            fresh.influence[record.record_id] = contribute(record);
          } catch {
            fresh.influence[record.record_id] = 1;
          }
        }
        for (const removed of plan.removed) delete fresh.influence[removed];
        fresh.headCursor = compareCursor(entry.headCursor, fresh.headCursor) > 0 ? entry.headCursor : fresh.headCursor;
        fresh.generation = entry.generation;
        fresh.publications += 1;
        fresh.manifestSeq += 1;
        try {
          hooks.beforeManifestCommit?.(priorPublications);
        } catch {
          throw { marker: TX_INTERRUPTED };
        }
        await tx.query(X2B_UPSERT_MANIFEST, [namespace, JSON.stringify({ ...fresh, pending: {} })]);
        return fresh;
      });
    } catch (error) {
      const marker = txMarker(error);
      if (marker === TX_REFUSAL) return (error as { refusal: Extract<X2bResult<never>, { ok: false }> }).refusal;
      if (marker === TX_CONFLICT) return refusal("MANIFEST_CONFLICT", "manifest advanced under a competing writer; retry", true);
      if (marker === TX_STALE) return refusal("PROJECTION_STALE", "stale head cannot publish past the pinned canonical head", false);
      if (marker === TX_INTERRUPTED) {
        return refusal("PUBLICATION_INTERRUPTED", "publication interrupted before commit; prior publication preserved", true);
      }
      if (marker === TX_MATERIAL) return refusal("MATERIALIZATION_FAILED", "embedding generation failed; nothing published", true);
      return refusal("STORE_UNAVAILABLE", "publication transaction failed; prior publication preserved", true);
    }
    entry.stage = "published";
    (entry as { publishSeq?: number }).publishSeq = committed.manifestSeq;
    (entry as { resultHead?: string }).resultHead = committed.headCursor;
    return { ok: true, value: proof(committed) };
  }

  const adapter = {
    projection_id: "vector",

    async ingest(recordId: string): Promise<X2bResult<{ record_id: string }>> {
      let state: X2bPersistedState;
      try {
        state = await load();
      } catch {
        return refusal("STORE_UNAVAILABLE", "vector manifest read failed; retry", true);
      }
      if (state.tombstoned.includes(recordId)) return { ok: true, value: { record_id: recordId } };
      const resolved = await resolveIds([recordId]);
      if (!resolved.ok) return resolved;
      if (resolved.value.has(recordId)) return { ok: true, value: { record_id: recordId } };
      let vector: number[];
      try {
        vector = embed({ record_id: recordId, record_digest: "" });
      } catch {
        return refusal("MATERIALIZATION_FAILED", "embedding generation failed", true);
      }
      if (vector.length !== dimension) return refusal("MATERIALIZATION_FAILED", "embedded vector has wrong dimension", true);
      const priorPublications = state.publications;
      // The row write and the manifest advance share one transaction: an interruption
      // before commit leaves no physical row behind.
      try {
        await runner.withTransaction(async (tx) => {
          await tx.query(X2B_ADVISORY_LOCK, [namespace]);
          const fresh = await readManifestFrom(tx, true);
          if (fresh.tombstoned.includes(recordId)) return;
          // Batch traffic owns touched records: a stale serving-path ingest absorbs instead
          // of resurrecting. Terminality comes from canonical state, never from any label.
          if (fresh.lastTouch[recordId] !== undefined) return;
          const terminal = await resolveTerminal([recordId]);
          if (terminal.has(recordId)) return;
          await tx.query(X2B_UPSERT_VECTOR, [namespace, recordId, vector, null]);
          fresh.live = [...new Set([...fresh.live, recordId])].sort();
          fresh.lastTouch[recordId] = fresh.headCursor;
          try {
            fresh.influence[recordId] = contribute({ record_id: recordId, record_digest: "" });
          } catch {
            fresh.influence[recordId] = 1;
          }
          fresh.manifestSeq += 1;
          try {
            hooks.beforeManifestCommit?.(priorPublications);
          } catch {
            throw { marker: TX_INTERRUPTED };
          }
          await tx.query(X2B_UPSERT_MANIFEST, [namespace, JSON.stringify({ ...fresh, pending: {} })]);
        });
      } catch (error) {
        const marker = txMarker(error);
        if (marker === TX_CONFLICT) return refusal("MANIFEST_CONFLICT", "manifest advanced under a competing writer; retry", true);
        if (marker === TX_INTERRUPTED) {
          return refusal("PUBLICATION_INTERRUPTED", "ingestion interrupted before commit; nothing stored", true);
        }
        return refusal("STORE_UNAVAILABLE", "ingestion transaction failed; nothing stored", true);
      }
      return { ok: true, value: { record_id: recordId } };
    },

    async invalidate(batch: X2bProjectionBatch): Promise<X2bResult<{ projection_id: string; cursor: string; digest: string }>> {
      const seeded = await load();
      const head = compareCursor(batch.through_cursor_inclusive, seeded.headCursor) > 0
        ? batch.through_cursor_inclusive
        : seeded.headCursor;
      const prepared = await prepareLocked({
        generation: seeded.generation === "" ? "gen:auto" : seeded.generation,
        headCursor: head,
        batches: [batch],
        deadlineAt: "9999-01-01T00:00:00.000Z",
        operationId: `auto:${batch.from_cursor_exclusive}:${batch.through_cursor_inclusive}:${x2bContentDigest([batch])}`,
      });
      if (!prepared.ok) return x2bSurfaceRefusal(prepared);
      const published = await publishEntry(await load(), pending.get(prepared.value.token)!);
      if (!published.ok) return x2bSurfaceRefusal(published);
      const acknowledged = await adapter.acknowledgePublication(prepared.value.token);
      if (!acknowledged.ok) return x2bSurfaceRefusal(acknowledged);
      const current = await load();
      // The batch applied and coverage reaches at least its through cursor: certify exactly
      // the applied batch, so a lagging surface is always caught up by the next replay.
      const cursor = compareCursor(current.ackCursor, batch.through_cursor_inclusive) >= 0
        ? batch.through_cursor_inclusive
        : current.ackCursor;
      return {
        ok: true,
        value: { projection_id: "vector", cursor, digest: x2bStateDigest(current, namespace) },
      };
    },

    async prepareGeneration(input: X2bPrepareInput): Promise<X2bResult<{ token: string; duplicate: boolean }>> {
      return prepareLocked(input);
    },

    async publishPublication(token: string) {
      const state = await load();
      const found = lookup(state, token);
      if (!found.ok) return found;
      return publishEntry(state, found.value);
    },

    async acknowledgePublication(token: string) {
      const state = await load();
      const found = lookup(state, token);
      if (!found.ok) return found;
      const entry = found.value;
      if (entry.stage === "acknowledged") {
        return {
          ok: true as const,
          value: { cursor: state.ackCursor, digest: x2bStateDigest(state, namespace), generation: state.generation, incarnation: state.incarnation },
        };
      }
      if (entry.stage !== "published") return refusal("NOT_PUBLISHED", "preparation alone cannot acknowledge", false);
      if (!state.fenceHeld) return refusal("FENCE_LOST", "canonical fence is lost; reacquire before acknowledging", true);
      if (clock() >= entry.deadlineAt) return refusal("DEADLINE_EXCEEDED", "acknowledgement deadline elapsed", false);
      const publishSeq = (entry as { publishSeq?: number }).publishSeq;
      const resultHead = (entry as { resultHead?: string }).resultHead;
      if (publishSeq === undefined || state.manifestSeq !== publishSeq) {
        return refusal("MANIFEST_CONFLICT", "previous manifest advanced; acknowledgement refuses", true);
      }
      if (resultHead === undefined || state.headCursor !== resultHead) {
        return refusal("PROJECTION_STALE", "expected head moved; acknowledgement refuses", false);
      }
      // The acknowledgement commits atomically with the manifest: a concurrent publication
      // refuses instead of being clobbered.
      let committed: X2bPersistedState;
      try {
        committed = await runner.withTransaction(async (tx) => {
          await tx.query(X2B_ADVISORY_LOCK, [namespace]);
          const fresh = await readManifestFrom(tx, true);
          if (fresh.manifestSeq !== publishSeq) throw { marker: TX_CONFLICT };
          if (!fresh.fenceHeld) throw { marker: TX_REFUSAL, refusal: refusal("FENCE_LOST", "fence lost before acknowledgement", true) };
          if (clock() >= entry.deadlineAt) throw { marker: TX_REFUSAL, refusal: refusal("DEADLINE_EXCEEDED", "acknowledgement deadline elapsed", false) };
          if (fresh.headCursor !== resultHead) throw { marker: TX_STALE };
          fresh.ackCursor = compareCursor(fresh.headCursor, fresh.ackCursor) > 0 ? fresh.headCursor : fresh.ackCursor;
          await tx.query(X2B_UPSERT_MANIFEST, [namespace, JSON.stringify({ ...fresh, pending: {} })]);
          return fresh;
        });
      } catch (error) {
        const marker = txMarker(error);
        if (marker === TX_REFUSAL) return (error as { refusal: Extract<X2bResult<never>, { ok: false }> }).refusal;
        if (marker === TX_CONFLICT) return refusal("MANIFEST_CONFLICT", "previous manifest advanced; acknowledgement refuses", true);
        if (marker === TX_STALE) return refusal("PROJECTION_STALE", "expected head moved; acknowledgement refuses", false);
        return refusal("STORE_UNAVAILABLE", "acknowledgement transaction failed; coverage unchanged", true);
      }
      entry.stage = "acknowledged";
      return {
        ok: true as const,
        value: { cursor: committed.ackCursor, digest: x2bStateDigest(committed, namespace), generation: committed.generation, incarnation: committed.incarnation },
      };
    },

    async readCurrent() {
      const state = await load();
      if (state.generation === "") return refusal("PROJECTION_STALE", "no committed generation is available", false);
      const terminal = await resolveIds(state.live);
      if (!terminal.ok) return terminal;
      if (state.live.some((id) => terminal.value.has(id))) return refusal("PROJECTION_STALE", "canonical tombstone awaits projection", true);
      return {
        ok: true as const,
        value: {
          digest: x2bStateDigest(state, namespace),
          cursor: state.ackCursor,
          generation: state.generation,
          live: [...state.live].sort(),
          tombstoned: [...state.tombstoned].sort(),
          influence: new Map(Object.entries(state.influence)),
        },
      };
    },

    async coverage(): Promise<X2bCoverage> {
      const state = await load();
      if (state.generation === "") return { cursor: state.ackCursor, complete: false };
      return { cursor: state.ackCursor, complete: state.ackCursor === state.headCursor };
    },

    async querySimilar(input: { vector: number[]; topK: number; eligible?: readonly string[] }) {
      if (input.vector.length !== dimension) return refusal("INVALID_SCHEMA", "query vector has wrong dimension", false);
      const state = await load();
      if (state.generation === "") return refusal("PROJECTION_STALE", "no committed generation is available", false);
      const terminal = await resolveIds(state.live);
      if (!terminal.ok) return terminal;
      if (state.live.some((id) => terminal.value.has(id))) return refusal("PROJECTION_STALE", "canonical tombstone awaits projection", true);
      const eligible = input.eligible !== undefined ? new Set(input.eligible) : undefined;
      const live = new Set(state.live);
      const tombstoned = new Set(state.tombstoned);
      const result = await runner.query(X2B_SELECT_VECTORS, [namespace]);
      // Deleted and tombstoned ids never reach scoring: only manifest-live rows participate.
      const scored = result.rows
        .filter((row) => live.has(String(row.vector_id)) && !tombstoned.has(String(row.vector_id)))
        .filter((row) => eligible === undefined || eligible.has(String(row.vector_id)))
        .map((row) => {
          const embedding = (row.embedding as number[]).map(Number);
          let dot = 0;
          let a = 0;
          let b = 0;
          for (let i = 0; i < embedding.length; i++) {
            dot += input.vector[i]! * embedding[i]!;
            a += input.vector[i]! * input.vector[i]!;
            b += embedding[i]! * embedding[i]!;
          }
          return { record_id: String(row.vector_id), score: a === 0 || b === 0 ? 0 : dot / Math.sqrt(a * b) };
        })
        .sort((left, right) => right.score - left.score || (left.record_id < right.record_id ? -1 : 1));
      return { ok: true as const, value: { matches: scored.slice(0, input.topK) } };
    },

    async loseFenceForTests(): Promise<void> {
      await mutateForTests((state) => { state.fenceHeld = false; });
    },

    async reacquireFenceForTests(): Promise<void> {
      await mutateForTests((state) => { state.fenceHeld = true; state.fenceEpoch += 1; });
    },

    async recreateForTests(): Promise<void> {
      await mutateForTests((state) => { state.incarnation = randomUUID(); state.manifestSeq += 1; });
      pending.clear();
    },

    /** Test-only: every stored vector id in this namespace, unfiltered (proves physical deletion). */
    async storedVectorIdsForTests(): Promise<string[]> {
      const result = await runner.query(X2B_SELECT_VECTORS, [namespace]);
      return result.rows.map((row) => String(row.vector_id)).sort();
    },

    async clearNamespaceForTests(): Promise<void> {
      await runner.withTransaction(async (tx) => {
        await tx.query(X2B_ADVISORY_LOCK, [namespace]);
        const fresh = await readManifestFrom(tx, true);
        fresh.live = [];
        fresh.lastTouch = Object.create(null);
        fresh.influence = Object.create(null);
        fresh.operations = Object.create(null);
        fresh.manifestSeq += 1;
        await tx.query(X2B_DELETE_NAMESPACE, [namespace]);
        await tx.query(X2B_UPSERT_MANIFEST, [namespace, JSON.stringify({ ...fresh, pending: {} })]);
      });
    },

    async close(): Promise<void> {
      if (ownedRunner) await runner.close();
    },
  };

  async function mutateForTests(change: (state: X2bPersistedState) => void): Promise<void> {
    await runner.withTransaction(async (tx) => {
      await tx.query(X2B_ADVISORY_LOCK, [namespace]);
      const state = await readManifestFrom(tx, true);
      change(state);
      await tx.query(X2B_UPSERT_MANIFEST, [namespace, JSON.stringify({ ...state, pending: {} })]);
    });
  }

  return adapter;
}

export type PostgresExactProjectionAdapter = Awaited<ReturnType<typeof createPostgresExactProjectionAdapter>>;
