/**
 * GraphStore port — narrow interface for opt-in graph mirrors
 * (SPEC_STORAGE_BACKENDS.md, "GraphStore Port"). `.graphify/graph.json`
 * stays the source of truth; every backend is a pushed projection, never a
 * source. Signatures here are normative for the storage layer.
 */
import type Graph from "graphology";

/**
 * NORMATIVE — what a capability means, and what it deliberately does NOT mean.
 *
 * A capability declares an IMPLEMENTED METHOD. It does NOT declare the PRESENCE
 * OF DATA. `capabilities.window` means "this adapter implements graphWindow()",
 * never "graph_positions holds rows"; `capabilities.aggregate` means "this
 * adapter implements groupCounts()", never "graph_group_counts holds rows".
 *
 * The declaration is therefore STATIC and I/O-FREE. It must not be derived from
 * table state, because a consumer reads `capabilities` exactly ONCE: a
 * state-derived flag would hand that consumer a value that was only true at
 * construction time, and would go stale the moment a push (or a clear) changed
 * the table. A flag that is true-then-false without the holder ever being told
 * is a WORSE contract than an optimistic declaration — so the declaration stays
 * optimistic on purpose.
 *
 * "Declared but never built" is answered by the METHOD instead, which returns a
 * readable-empty discriminant alongside its payload:
 *   - `graphWindow()`  → `populated` + `positions_built_at`
 *   - `groupCounts()`  → `populated` + `counts_built_at`
 * This lets a consumer ACT on the difference between "nothing was ever baked"
 * (fall back, or warn) and "baked, and genuinely empty" — a distinction a
 * boolean capability cannot express, at the only moment it actually matters:
 * the call. Both replace-scoped derived tables carry the SAME shape by design;
 * they are one family, not two independent flags.
 *
 * @see GraphWindow, GraphGroupCounts
 */
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
  /**
   * Optional, VERSIONED windowed-loader capability (storage LOT 3). Absent on
   * backends that do not precompute per-layout positions (neo4j/spanner/file
   * simply omit it). When present, the adapter maintains a
   * `graph_positions(layout_id, node_id, x, y, degree)` table and exposes
   * `layoutPositions(layout)` (all positions for a layout) plus `graphWindow(opts)`
   * (a BOUNDED slice — top-N by degree — of nodes + the edges induced among
   * them). The studio loads the window for first paint instead of the full
   * multi-MB scene; backends omitting the capability omit both methods and the
   * studio keeps shipping the full scene unchanged.
   *
   * Like the aggregate, positions are tied to REPLACE / full-snapshot semantics:
   * rebuilt ONLY inside a `mode: "replace"` push, never on a `merge`. A merge is
   * an upsert that may leave stale rows behind, so rebuilding positions after a
   * merge could surface deleted nodes; gating on replace keeps the window
   * coherent with a committed full snapshot.
   */
  window?: GraphStoreWindowCapability;
  /**
   * Optional temporal overlap reader. Backends that persist the shared `t` /
   * `t_end` contract as indexed fields expose `queryWindow`; all other
   * backends omit both this flag and the method.
   */
  queryWindow?: true;
}

/** Versioned descriptor for the optional group-by aggregate capability (LOT 1). */
export interface GraphStoreAggregateCapability {
  /** Schema/behaviour version of the aggregate contract; consumers gate on it. */
  version: 1;
  /** Axes the backend can serve from its precomputed table (e.g. `node_type`). */
  axes: readonly string[];
}

/** Versioned descriptor for the optional windowed-loader capability (LOT 3). */
export interface GraphStoreWindowCapability {
  /** Schema/behaviour version of the window contract; consumers gate on it. */
  version: 1;
  /** Layout ids the backend has precomputed positions for (e.g. `force`). */
  layouts: readonly string[];
  /**
   * Window strategies the backend can serve. LOT 3 ships `degree-top-n` only —
   * the coarse first-paint slice (the N highest-degree nodes + induced edges).
   */
  strategies: readonly string[];
}

/** One precomputed node position for a given layout. */
export interface GraphLayoutPosition {
  node_id: string;
  x: number;
  y: number;
}

/** Parameters for {@link GraphStore.graphWindow}. */
export interface GraphWindowOptions {
  /** Window strategy; LOT 3 supports `degree-top-n` (the default). */
  strategy?: string;
  /** Layout id whose positions annotate the window nodes (e.g. `force`). */
  layout?: string;
  /** Upper bound on the number of nodes returned. */
  limit?: number;
}

/** One node in a windowed slice: id + degree + (optional) layout position. */
export interface GraphWindowNode {
  id: string;
  label: string;
  node_type?: string;
  /** Layout x, present when the requested layout has a position for this node. */
  x?: number;
  /** Layout y, present when the requested layout has a position for this node. */
  y?: number;
  /** Precomputed degree, drives node weight/size without a join. */
  degree: number;
}

/** One edge in a windowed slice (induced among the window's nodes). */
export interface GraphWindowEdge {
  source: string;
  target: string;
  relation: string;
}

/** Result of {@link GraphStore.graphWindow}: a BOUNDED nodes+edges slice. */
export interface GraphWindow {
  /** Strategy that produced this slice (e.g. `degree-top-n`). */
  strategy: string;
  /** Layout the positions came from, when one was requested + available. */
  layout?: string;
  /** The effective node cap applied. */
  limit: number;
  nodes: GraphWindowNode[];
  edges: GraphWindowEdge[];
  /**
   * Readable-empty discriminant (see {@link GraphStoreCapabilities}). `false`
   * means the backing positions table holds NO row for the requested layout:
   * the method is implemented, but nothing was ever baked for it. `true` with an
   * empty `nodes` is a real, baked, empty slice. Only the first warrants a
   * fallback — telling them apart is the entire point.
   */
  populated: boolean;
  /**
   * The `snapshot_id` of the push that baked these positions (equal to
   * `graph_meta.pushed_at`), or `null` when `populated` is false. A stamp the
   * push itself wrote — never a value synthesised at read time.
   */
  positions_built_at: string | null;
}

/** A canonical, flattened node returned by a temporal overlap query. */
export interface GraphTimeWindowNode {
  id: string;
  label: string;
  node_type?: string;
  community?: number;
  t: number;
  t_end?: number;
  /** Provider-neutral pass-through graph attributes. */
  [key: string]: unknown;
}

/** A canonical, flattened edge returned by a temporal overlap query. */
export interface GraphTimeWindowEdge {
  source: string;
  target: string;
  relation: string;
  confidence?: string;
  t: number;
  t_end?: number;
  /** Provider-neutral pass-through graph attributes. */
  [key: string]: unknown;
}

/** Result of a temporal overlap query. Untimed/invalid elements are excluded. */
export interface GraphTimeWindow {
  nodes: GraphTimeWindowNode[];
  edges: GraphTimeWindowEdge[];
}

/** Options which scope a temporal overlap query without changing its interval. */
export interface GraphTimeWindowOptions {
  /** Optional backend namespace override. Providers must parameterize it. */
  namespace?: string;
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
  /**
   * Readable-empty discriminant (see {@link GraphStoreCapabilities}). Same shape
   * and same meaning as {@link GraphWindow.populated}, deliberately: `false`
   * means the backing counts table holds NO row for the requested axis, `true`
   * with empty `groups` is a real, baked, empty aggregate.
   */
  populated: boolean;
  /**
   * The `snapshot_id` of the push that baked these counts (equal to
   * `graph_meta.pushed_at`), or `null` when `populated` is false. A stamp the
   * push itself wrote — never a value synthesised at read time.
   */
  counts_built_at: string | null;
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

/** What a push rebuilt: aggregate axes and windowed-loader layouts. */
export interface GraphPushRebuilt {
  /** Group-by axes whose counts this push rebuilt; empty when it rebuilt none. */
  axes: readonly string[];
  /** Layouts whose positions this push rebuilt; empty when it rebuilt none. */
  layouts: readonly string[];
}

export interface GraphPushResult {
  nodes: number;
  edges: number;
  warnings: string[];
  durationMs: number;
  /**
   * The derived tables this push ACTUALLY rebuilt, reported by the adapter that
   * owns the policy. Optional: adapters with no derived tables omit it, and a
   * caller reads the absence as "nothing was rebuilt".
   *
   * A caller must NOT re-derive this from `mode`. Whether a replace push
   * rebuilds the aggregate or the positions is the ADAPTER's decision, so a
   * caller that reimplements the rule is printing a guess — one that silently
   * becomes a lie the moment any adapter decides differently. Same principle as
   * the readable-empty discriminant: ask the component that knows.
   */
  rebuilt?: GraphPushRebuilt;
  /**
   * Windowed-loader position rows this push actually wrote (storage LOT 3).
   * Reported by window-capable adapters (which maintain `graph_positions`) so a
   * caller can tell a real rebuild from an empty one; omitted by adapters that
   * do not touch positions. This is the honest COUNT, distinct from
   * `rebuilt.layouts` (which layouts a push touched): an adapter may legitimately
   * report rebuilding nothing (`rebuilt.layouts: []`, believed as policy), but an
   * adapter that DECLARES the window capability and reports writing 0 positions
   * for a non-empty replace produced no windowed first paint — the CLI rejects
   * that rather than reporting a success without an effect. Source-agnostic:
   * whatever feeds the layout, the count is of rows actually persisted.
   */
  positions?: number;
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
  /**
   * Capability-gated read of every precomputed position for one layout (storage
   * LOT 3). Present ONLY when `capabilities.window` is set. Reads the
   * backend-maintained `graph_positions` table scoped to the latest REPLACE
   * snapshot — see `GraphStoreCapabilities.window`.
   */
  layoutPositions?(layout: string): Promise<GraphLayoutPosition[]>;
  /**
   * Capability-gated windowed read (storage LOT 3). Present ONLY when
   * `capabilities.window` is set. Returns a BOUNDED slice — the top-N nodes by
   * precomputed degree plus the edges induced among them — so first paint never
   * ships the full multi-MB scene. Scoped to the latest REPLACE snapshot.
   */
  graphWindow?(options?: GraphWindowOptions): Promise<GraphWindow>;
  /**
   * Capability-gated temporal overlap read. Returns elements whose interval
   * starts at `t` and either ends at `t_end` or remains open when `t_end` is
   * absent, overlapping the inclusive `[fromMs, toMs]` range. Untimed and
   * malformed elements are excluded. Node and edge membership is independent,
   * so returned edges are not guaranteed to have both endpoints in `nodes`.
   * Present ONLY with `capabilities.queryWindow`.
   */
  queryWindow?(
    fromMs: number,
    toMs: number,
    options?: GraphTimeWindowOptions,
  ): Promise<GraphTimeWindow>;
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
