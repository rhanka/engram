/**
 * GraphStore port — narrow interface for opt-in graph mirrors
 * (SPEC_STORAGE_BACKENDS.md, "GraphStore Port"). `.graphify/graph.json`
 * stays the source of truth; every backend is a pushed projection, never a
 * source. Signatures here are normative for the storage layer.
 */
import type Graph from "graphology";

export interface GraphStoreCapabilities {
  push: true;
  query: boolean;
  clear: boolean;
  snapshotMeta: boolean;
  /**
   * Optional, VERSIONED group-by aggregate (storage LOT 1). Absent on backends
   * that do not precompute it (neo4j/spanner simply omit it). When present, the
   * adapter exposes `groupCounts(axis)` reading a backend-maintained counts
   * table in O(#groups) — not O(#nodes).
   *
   * The aggregate is tied to REPLACE / full-snapshot semantics: it is rebuilt
   * ONLY inside a `mode: "replace"` push, never on a `merge` push. A merge is an
   * upsert that may leave stale rows behind, so rebuilding the aggregate after a
   * merge could surface deleted / half-merged groups; gating the rebuild on
   * replace keeps the counts coherent with a committed full snapshot. This
   * capability does NOT imply any cross-backend transaction semantics — each
   * adapter owns when and how it maintains its table.
   */
  aggregate?: GraphStoreAggregateCapability;
}

/** Versioned descriptor for the optional group-by aggregate capability (LOT 1). */
export interface GraphStoreAggregateCapability {
  /** Schema/behaviour version of the aggregate contract; consumers gate on it. */
  version: 1;
  /** Axes the backend can serve from its precomputed table (e.g. `node_type`). */
  axes: readonly string[];
}

/** One group bucket: a distinct value of an axis and its node count. */
export interface GraphGroupCount {
  /** The axis value (e.g. a node_type string, or a community id as text). */
  key: string;
  /** Human-readable label for the bucket; defaults to `key` when none. */
  label: string;
  /** Number of nodes in the bucket for the current snapshot. */
  count: number;
  /** Parent bucket key for hierarchical axes; omitted for flat axes. */
  parent_key?: string;
}

/** Result of `groupCounts(axis)`: the axis plus its precomputed buckets. */
export interface GraphGroupCounts {
  axis: string;
  groups: GraphGroupCount[];
}

export interface GraphPushOptions {
  /** merge = idempotent upsert (default); replace = clear namespace then load */
  mode?: "merge" | "replace";
  /** statements batched per request; default 500 */
  batchSize?: number;
  /** plan and report without writing to the backend */
  dryRun?: boolean;
  /** target namespace; default derived from the project */
  namespace?: string;
}

export interface GraphPushResult {
  nodes: number;
  edges: number;
  warnings: string[];
  durationMs: number;
}

export interface GraphStoreSnapshotMeta {
  topologySignature: string;
  pushedAt: string;
  toolVersion: string;
}

export interface GraphStore {
  readonly id: string;
  readonly capabilities: GraphStoreCapabilities;
  verifyConnection(): Promise<void>;
  pushGraph(
    G: Graph,
    communities: Map<number, string[]>,
    options?: GraphPushOptions,
  ): Promise<GraphPushResult>;
  readSnapshotMeta(): Promise<GraphStoreSnapshotMeta | undefined>;
  clear?(namespace?: string): Promise<void>;
  /**
   * Capability-gated read. SQL/GQL backends accept positional (`unknown[]`) or
   * named (`Record<string, unknown>`) parameter bags; the neo4j adapter already
   * takes a named bag. Adapters that need no parameters may ignore the argument.
   */
  query?(
    statement: string,
    params?: unknown[] | Record<string, unknown>,
  ): Promise<unknown>;
  /**
   * Capability-gated O(#groups) group-by counts (storage LOT 1). Present ONLY
   * when `capabilities.aggregate` is set; backends that omit the capability omit
   * this method (a no-op/absent on the contract). Reads a backend-maintained
   * counts table (not the node rows), so it is O(#groups), not O(#nodes). The
   * result is scoped to the latest REPLACE snapshot — see
   * `GraphStoreCapabilities.aggregate`.
   */
  groupCounts?(axis: string): Promise<GraphGroupCounts>;
  close(): Promise<void>;
}

/**
 * Resolved store configuration (PR4). Produced by resolveStoreConfig() from
 * the precedence chain: CLI flags > env vars > YAML config.
 * Credentials are environment-only and never read from YAML
 * (SPEC_STORAGE_BACKENDS.md, "Secret Handling").
 */
export interface GraphStoreConfig {
  /** Backend-specific target: a file path for `file`, a Bolt URI for neo4j. */
  target?: string;
  /** Default namespace for pushes; derived from the project when omitted. */
  namespace?: string;
  /** Authentication credentials — populated from env only, never from YAML. */
  auth?: {
    user?: string;
    password?: string;
  };
  /** Target database name (neo4j/spanner). */
  database?: string;
  /** Spanner project id (ADC-authenticated; no password). */
  project?: string;
  /** Spanner instance id. */
  instance?: string;
  /** Whether to push automatically after a successful build. Default false. */
  autoPush?: boolean;
  /** Resolved push mode for the mirror. */
  mode?: "merge" | "replace";
  /**
   * Full connection string / DSN for SQL backends (e.g. Postgres). Populated
   * from env only — never from YAML, since a DSN can embed credentials.
   */
  connectionString?: string;
  /** SQL schema/keyspace the mirror writes into (non-secret). */
  schema?: string;
  /** Whether to require TLS on the SQL connection (non-secret). */
  ssl?: boolean;
  /** Project/tenant slug for multi-tenant deployments (non-secret). */
  citySlug?: string;
  /**
   * Embedding configuration for vector-capable backends. All fields are
   * non-secret and may be supplied from YAML; the API key for the provider
   * stays env-only (never modeled here).
   */
  embedding?: {
    provider?: string;
    model?: string;
    dimension?: number;
  };
}

/**
 * Test-only injection point: a fake driver module used instead of the
 * dynamic import of `GraphStoreFactory.requiredPackage`, mirroring the LLM
 * execution ports injection pattern. Production code never passes this.
 */
export interface StoreTestDeps {
  driverModule?: unknown;
}
