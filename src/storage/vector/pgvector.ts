/**
 * pgvector VectorStore adapter (GraphRAG VECTOR backend).
 *
 * A pushed, derived projection of graph embeddings into Postgres + pgvector.
 * `.graphify/` stays the source of truth; vectors are never a source. The
 * driver (`pg`) is NEVER imported statically — it is supplied through
 * `deps.driverModule` (tests) or the vector registry's dynamic import
 * (production). Importing this module evaluates no driver.
 *
 * Embedding GENERATION is delegated to an injected `EmbeddingProvider`: no
 * model is hardcoded here, so the provider (and its env-only API key) stays
 * config-driven and test-injectable, exactly like the GraphStore driver model.
 *
 * Schema (single source of truth in `pgVectorDdl()`):
 *   CREATE EXTENSION IF NOT EXISTS vector;
 *   CREATE TABLE graph_embeddings(
 *     node_id text, city_slug text, embedding vector(N),
 *     metadata jsonb, PRIMARY KEY (city_slug, node_id));
 *   CREATE INDEX ... USING hnsw (embedding vector_cosine_ops);
 *
 * The `VectorStore` port speaks `namespace`/`id`; the SQL layer maps those onto
 * the `city_slug`/`node_id` columns. Cosine distance (`<=>`) is the only metric;
 * score is reported as `1 - distance`.
 */
import type {
  EmbeddingProvider,
  EmbeddingVector,
  VectorMatch,
  VectorQuery,
  VectorStore,
  VectorUpsertOptions,
} from "./types.js";
import type { GraphStoreConfig, StoreTestDeps } from "../types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TABLE = "graph_embeddings";
const INDEX = "graph_embeddings_embedding_hnsw_idx";

/** Default rows per INSERT batch. Postgres tolerates large multi-row inserts;
 * 500 keeps statement size and bind-parameter counts comfortably bounded. */
const DEFAULT_BATCH_SIZE = 500;

/** Default top-K returned by a query when the caller omits it. */
const DEFAULT_TOP_K = 10;

// ---------------------------------------------------------------------------
// Config + public types
// ---------------------------------------------------------------------------

export interface PgVectorStoreConfig extends GraphStoreConfig {
  /** Full DSN; env-only (GRAPHIFY_POSTGRES_URL). May embed credentials. */
  connectionString?: string;
  /** Embedding config (provider/model/dimension); dimension drives the schema. */
  embedding?: { provider?: string; model?: string; dimension?: number };
}

/**
 * pgvector-specific test/injection dependencies. Extends the shared
 * `StoreTestDeps` (the `pg` driver module) with an injectable embedding
 * provider so unit tests stay hermetic (no network model call).
 */
export interface PgVectorStoreDeps extends StoreTestDeps {
  /** Pre-built embedding provider; bypasses provider resolution entirely. */
  embeddingProvider?: EmbeddingProvider;
}

// ---------------------------------------------------------------------------
// Minimal structural types for the `pg` surface we use (no static import —
// real types come from the injected/imported module).
// ---------------------------------------------------------------------------

interface PgQueryResult {
  rows: Array<Record<string, unknown>>;
}

interface PgClientLike {
  query(text: string, values?: unknown[]): Promise<PgQueryResult>;
  end?(): Promise<unknown> | void;
}

interface PgPoolLike {
  query(text: string, values?: unknown[]): Promise<PgQueryResult>;
  end?(): Promise<unknown> | void;
}

interface PgModule {
  Pool?: new (config: { connectionString?: string; ssl?: unknown }) => PgPoolLike;
  Client?: new (config: { connectionString?: string; ssl?: unknown }) => PgClientLike;
}

// ---------------------------------------------------------------------------
// DDL — single exported source of truth
// ---------------------------------------------------------------------------

/**
 * The pgvector schema, as executable DDL statements (no trailing semicolons,
 * suitable for individual `client.query` calls). `dimension` is the embedding
 * width baked into the `vector(N)` column; it must match every pushed vector.
 *
 * Exported so tests and tooling assert against the same text the adapter runs.
 */
export function pgVectorDdl(dimension: number): string[] {
  const n = Math.trunc(dimension);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(
      `pgvector store requires a positive embedding dimension; got ${dimension}`,
    );
  }
  return [
    "CREATE EXTENSION IF NOT EXISTS vector",
    [
      `CREATE TABLE IF NOT EXISTS ${TABLE} (`,
      "  node_id text NOT NULL,",
      "  city_slug text NOT NULL,",
      `  embedding vector(${n}) NOT NULL,`,
      "  metadata jsonb,",
      "  PRIMARY KEY (city_slug, node_id)",
      ")",
    ].join("\n"),
    `CREATE INDEX IF NOT EXISTS ${INDEX} ON ${TABLE} ` +
      "USING hnsw (embedding vector_cosine_ops)",
  ];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Derive a backend-safe city_slug (the SQL namespace) from a config triple. */
function deriveNamespace(config: PgVectorStoreConfig): string {
  const raw =
    config.namespace ??
    config.citySlug ??
    config.database ??
    "graphify";
  return raw.replace(/[^A-Za-z0-9_-]/g, "_") || "graphify";
}

/** Chunk an array into subarrays of at most `size` elements. */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  const safeSize = size > 0 ? size : DEFAULT_BATCH_SIZE;
  for (let i = 0; i < arr.length; i += safeSize) {
    out.push(arr.slice(i, i + safeSize));
  }
  return out;
}

/** pgvector accepts a vector literal as the bracketed JSON-ish array text. */
function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a pgvector VectorStore. The `pg` driver is supplied by the vector
 * registry's lazy import (production) or by `deps.driverModule` (tests). The
 * DSN is env-only (resolved upstream into `config.connectionString`). The
 * embedding provider is injected (`deps.embeddingProvider`) or resolved from
 * config; no model is hardcoded here.
 */
export async function createPgVectorStore(
  config: PgVectorStoreConfig,
  deps?: PgVectorStoreDeps,
): Promise<VectorStore> {
  const connectionString = config.connectionString;
  if (!connectionString) {
    throw new Error(
      "pgvector store requires a connection string (env GRAPHIFY_POSTGRES_URL)",
    );
  }

  const rawDimension = config.embedding?.dimension;
  if (
    typeof rawDimension !== "number" ||
    !Number.isFinite(rawDimension) ||
    rawDimension <= 0
  ) {
    throw new Error(
      "pgvector store requires a positive embedding.dimension (config.embedding.dimension)",
    );
  }
  const dimension: number = rawDimension;

  // Resolve the driver from injected deps or a dynamic import (the registry
  // performs the import in production; this fallback supports direct/live use).
  let pgMod: Record<string, unknown>;
  if (deps?.driverModule !== undefined) {
    pgMod = deps.driverModule as Record<string, unknown>;
  } else {
    try {
      // Optional, uninstalled-by-default driver: build the specifier at runtime
      // so the compiler does not attempt to resolve the (absent) package. In
      // production the vector registry already supplies the module via `deps`;
      // this fallback supports direct/live use where `pg` IS installed.
      const driverPackage = "pg";
      pgMod = (await import(driverPackage)) as Record<string, unknown>;
    } catch {
      throw new Error("store 'pgvector' requires pg. Run: npm install pg pgvector");
    }
  }

  const mod = (pgMod.default ?? pgMod) as Partial<PgModule>;
  const PoolCtor = mod.Pool;
  const ClientCtor = mod.Client;
  if (typeof PoolCtor !== "function" && typeof ClientCtor !== "function") {
    throw new Error("store 'pgvector' requires pg. Run: npm install pg pgvector");
  }

  const sslOption = config.ssl ? { rejectUnauthorized: false } : undefined;
  const client: PgClientLike | PgPoolLike =
    typeof PoolCtor === "function"
      ? new PoolCtor({ connectionString, ssl: sslOption })
      : new (ClientCtor as NonNullable<PgModule["Client"]>)({
          connectionString,
          ssl: sslOption,
        });

  // The embedding provider is injected (tests) or resolved from config. E5 (the
  // concrete provider choice) is still open and default-unset; when no provider
  // is configured the store still upserts pre-computed vectors and queries — a
  // provider is only needed for text → vector generation. No model is hardcoded
  // here. When a provider IS supplied, its emitted dimension must agree with the
  // store's vector(N) column, or generated vectors could never be upserted.
  const embeddingProvider = deps?.embeddingProvider;
  if (
    embeddingProvider !== undefined &&
    embeddingProvider.dimension !== dimension
  ) {
    throw new Error(
      `pgvector store dimension mismatch: provider '${embeddingProvider.id}' ` +
        `emits ${embeddingProvider.dimension}-d vectors but the store ` +
        `dimension is ${dimension}`,
    );
  }

  const namespace = deriveNamespace(config);
  let closed = false;
  let schemaEnsured = false;

  async function run(text: string, values?: unknown[]): Promise<PgQueryResult> {
    return client.query(text, values);
  }

  // -------------------------------------------------------------------------
  // Schema (ensure-exists, idempotent)
  // -------------------------------------------------------------------------

  async function ensureSchema(): Promise<void> {
    if (schemaEnsured) return;
    schemaEnsured = true;
    for (const stmt of pgVectorDdl(dimension)) {
      await run(stmt);
    }
  }

  /** Reject any vector whose length differs from the configured dimension. */
  function assertDimension(vector: number[], label: string): void {
    if (vector.length !== dimension) {
      throw new Error(
        `pgvector store dimension mismatch: ${label} has ${vector.length} ` +
          `values but the store dimension is ${dimension}`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // VectorStore implementation
  // -------------------------------------------------------------------------

  return {
    id: "pgvector",
    dimension,
    capabilities: {
      upsert: true,
      query: true,
      clear: true,
      metrics: ["cosine"],
    },

    async verifyConnection(): Promise<void> {
      await run("SELECT 1");
    },

    async upsertVectors(
      vectors: EmbeddingVector[],
      options: VectorUpsertOptions = {},
    ): Promise<{ count: number; warnings: string[]; durationMs: number }> {
      const start = Date.now();
      const warnings: string[] = [];
      const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
      const mode = options.mode ?? "merge";
      const targetNamespace = options.namespace ?? namespace;

      // Dimension guard before any write so a bad batch never partially loads.
      for (const v of vectors) {
        assertDimension(v.vector, `vector '${v.id}'`);
      }

      if (options.dryRun) {
        return { count: vectors.length, warnings, durationMs: Date.now() - start };
      }

      await ensureSchema();

      // replace = clear the target namespace first, then load.
      if (mode === "replace") {
        await run(`DELETE FROM ${TABLE} WHERE city_slug = $1`, [targetNamespace]);
      }

      let count = 0;
      for (const batch of chunk(vectors, batchSize)) {
        // Build a multi-row INSERT ... ON CONFLICT DO UPDATE. Columns:
        // (node_id, city_slug, embedding, metadata). Embedding is bound as the
        // pgvector text literal and cast in-SQL.
        const valuesSql: string[] = [];
        const params: unknown[] = [];
        let p = 0;
        for (const v of batch) {
          const ns = v.namespace ?? targetNamespace;
          const metadata = v.metadata ? JSON.stringify(v.metadata) : null;
          valuesSql.push(
            `($${++p}, $${++p}, $${++p}::vector, $${++p}::jsonb)`,
          );
          params.push(v.id, ns, toVectorLiteral(v.vector), metadata);
        }
        const sql =
          `INSERT INTO ${TABLE} (node_id, city_slug, embedding, metadata) ` +
          `VALUES ${valuesSql.join(", ")} ` +
          "ON CONFLICT (city_slug, node_id) DO UPDATE SET " +
          "embedding = EXCLUDED.embedding, metadata = EXCLUDED.metadata";
        await run(sql, params);
        count += batch.length;
      }

      return { count, warnings, durationMs: Date.now() - start };
    },

    async query(q: VectorQuery): Promise<VectorMatch[]> {
      assertDimension(q.vector, "query vector");
      const topK = q.topK ?? DEFAULT_TOP_K;
      const literal = toVectorLiteral(q.vector);

      const params: unknown[] = [literal];
      let where = "";
      // Restrict to a single namespace when requested (param order kept stable:
      // $1 = query vector, $2 = city_slug, last param = LIMIT).
      const ns = q.namespace ?? q.filter?.city_slug;
      if (ns !== undefined) {
        params.push(ns);
        where = ` WHERE city_slug = $${params.length}`;
      }
      params.push(topK);
      const limitParam = params.length;

      // Cosine similarity = 1 - cosine distance (`<=>`). ORDER BY the distance
      // ascending so the closest (highest similarity) rows come first.
      const sql =
        `SELECT node_id, city_slug, metadata, ` +
        `1 - (embedding <=> $1::vector) AS score ` +
        `FROM ${TABLE}${where} ` +
        `ORDER BY embedding <=> $1::vector ` +
        `LIMIT $${limitParam}`;

      const result = await run(sql, params);
      return result.rows.map((row) => {
        const match: VectorMatch = {
          id: String(row.node_id),
          score: typeof row.score === "number" ? row.score : Number(row.score),
        };
        if (typeof row.city_slug === "string") match.namespace = row.city_slug;
        if (row.metadata && typeof row.metadata === "object") {
          match.metadata = row.metadata as Record<string, string | number | boolean>;
        }
        return match;
      });
    },

    async clear(targetNamespace?: string): Promise<void> {
      await ensureSchema();
      const ns = targetNamespace ?? namespace;
      await run(`DELETE FROM ${TABLE} WHERE city_slug = $1`, [ns]);
    },

    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      if (typeof client.end === "function") {
        await client.end();
      }
    },
  };
}
