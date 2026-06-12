/**
 * VectorStore port — narrow interface for opt-in embedding mirrors
 * (companion to the GraphStore port in ../types.ts).
 *
 * A VectorStore is a pushed projection of graph-derived embeddings into a
 * vector-capable backend (e.g. pgvector). It mirrors the GraphStore design:
 * a narrow port, capability gating, env-only secrets, and a test-injection
 * point so the backend driver is never imported statically. `.graphify/` stays
 * the source of truth; vectors are derived projections, never a source.
 *
 * These shapes are normative for the pgvector adapter (a separate PR that
 * branches off this foundation). Importing this module evaluates no driver.
 */

/**
 * A single embedding row keyed by the graph node/entity id it describes. The
 * `vector` length must match the store's configured `dimension`. `namespace`
 * scopes the row exactly like the GraphStore namespace model so multiple
 * projects/branches can share one backend.
 */
export interface EmbeddingVector {
  /** Graph node/entity id this embedding describes. */
  id: string;
  /** The embedding values; length must equal the store dimension. */
  vector: number[];
  /** Namespace scope; defaults to the store-derived namespace when omitted. */
  namespace?: string;
  /** Optional scalar metadata stored alongside the vector (non-secret). */
  metadata?: Record<string, string | number | boolean>;
}

export interface VectorUpsertOptions {
  /** merge = idempotent upsert keyed on (namespace, id); replace = clear namespace then load. */
  mode?: "merge" | "replace";
  /** Rows batched per request; default 500. */
  batchSize?: number;
  /** Plan and report without writing to the backend. */
  dryRun?: boolean;
  /** Target namespace; default derived from the store config. */
  namespace?: string;
}

export interface VectorQuery {
  /** The query embedding; length must equal the store dimension. */
  vector: number[];
  /** Maximum number of matches to return; default 10. */
  topK?: number;
  /** Restrict the search to a single namespace. */
  namespace?: string;
  /**
   * Distance/similarity metric. Adapters that support only one metric ignore
   * this and document their default in `capabilities`.
   */
  metric?: "cosine" | "l2" | "inner_product";
  /** Optional scalar metadata equality filter. */
  filter?: Record<string, string | number | boolean>;
}

export interface VectorMatch {
  /** Graph node/entity id of the matched row. */
  id: string;
  /** Backend-reported score; semantics depend on the query metric. */
  score: number;
  /** Namespace the matched row belongs to. */
  namespace?: string;
  /** Metadata stored with the row, when the backend returns it. */
  metadata?: Record<string, string | number | boolean>;
}

export interface VectorStoreCapabilities {
  upsert: true;
  query: boolean;
  clear: boolean;
  /** Metric(s) the backend can search with. */
  metrics: Array<"cosine" | "l2" | "inner_product">;
}

/**
 * Produces embeddings for text. The concrete provider (and its env-only API
 * key) is resolved by the adapter; this port keeps the embedding source
 * pluggable and test-injectable, exactly like the GraphStore driver module.
 */
export interface EmbeddingProvider {
  /** Provider id, e.g. "openai", "voyage", "local". */
  readonly id: string;
  /** Embedding dimension this provider emits. */
  readonly dimension: number;
  /** Embed a batch of texts; returns one vector per input, in order. */
  embed(texts: string[]): Promise<number[][]>;
}

/**
 * The vector mirror port. `upsert` is the only mandatory capability; `query`
 * and `clear` are capability-gated. Adapters own backend mechanics (batching,
 * type mapping, index management); core owns embedding orchestration and
 * namespace derivation.
 */
export interface VectorStore {
  readonly id: string;
  readonly capabilities: VectorStoreCapabilities;
  /** Dimension every vector pushed to this store must have. */
  readonly dimension: number;
  verifyConnection(): Promise<void>;
  upsertVectors(
    vectors: EmbeddingVector[],
    options?: VectorUpsertOptions,
  ): Promise<{ count: number; warnings: string[]; durationMs: number }>;
  query?(query: VectorQuery): Promise<VectorMatch[]>;
  clear?(namespace?: string): Promise<void>;
  close(): Promise<void>;
}
