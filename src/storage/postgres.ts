/**
 * Postgres GraphStore adapter (SPEC_STORAGE_BACKENDS.md, "Future Backends").
 *
 * Live-push mirror of a Graphify graph into native PostgreSQL via batched
 * `INSERT ... ON CONFLICT DO UPDATE` upserts (the merge primitive). The driver
 * (`pg`) is NEVER imported statically: it is always supplied through
 * `deps.driverModule` (tests) or the registry's dynamic import (production), so
 * importing this module evaluates no driver and `tsc`/the import-guard never try
 * to resolve the (uninstalled-by-default) package.
 *
 * Multi-project isolation uses a `city_slug` column (the namespace/citySlug),
 * mirroring the Spanner `namespace` model + `graph_meta` snapshot row. The DDL
 * is exported from a single source-of-truth function (`postgresDdlStatements()`)
 * so the schema never drifts.
 *
 * `pushGraph` IS the upsert: mode "merge" is a native `ON CONFLICT DO UPDATE`;
 * mode "replace" runs `DELETE WHERE city_slug=$1` then inserts, inside one
 * transaction. Every push also re-emits the canonical `graph/{citySlug}/
 * latest.json` artifact through the shared `toJson()` writer (the same writer
 * the FileGraphStore uses) so the Postgres write is S3-replayable.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, readFileSync } from "node:fs";
import type Graph from "graphology";
import { toJson } from "../export.js";
import type {
  GraphGroupCounts,
  GraphLayoutPosition,
  GraphPushOptions,
  GraphPushResult,
  GraphStore,
  GraphStoreConfig,
  GraphStoreSnapshotMeta,
  GraphWindow,
  GraphWindowEdge,
  GraphWindowNode,
  GraphWindowOptions,
  StoreTestDeps,
} from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NODE_TABLE = "graph_nodes";
const EDGE_TABLE = "graph_edges";
const META_TABLE = "graph_meta";
/** Precomputed group-by aggregate (storage LOT 1); rebuilt on replace pushes. */
const COUNT_TABLE = "graph_group_counts";
/** Precomputed per-layout positions (storage LOT 3); rebuilt on replace pushes. */
const POSITION_TABLE = "graph_positions";

/**
 * Axes the precomputed aggregate serves in LOT 1. `node_type` + `community` are
 * lifted to typed columns / derivable on push, so the GROUP BY is cheap.
 * `class_id`, `registry`, `status` and `ts` are DEFERRED to LOT 2 until those
 * fields are lifted out of the props jsonb into queryable columns.
 */
const AGGREGATE_AXES = ["node_type", "community"] as const;

/**
 * The single pinned layout LOT 3 persists. The graph carries exactly one baked
 * layout today (`x`/`y` node attributes from `attachLayoutPositions`), so the
 * adapter mirrors those into `graph_positions` under this layout id. Additional
 * layouts (typed-layer / dag / 3d / time) are DEFERRED to LOT 6.
 */
const DEFAULT_LAYOUT = "force";

/**
 * Window strategies LOT 3 serves. `degree-top-n` returns the N highest-degree
 * nodes (the coarse first-paint slice) + the edges induced among them.
 */
const WINDOW_STRATEGIES = ["degree-top-n"] as const;

/** Default node cap for a windowed slice when the caller pins none. */
const DEFAULT_WINDOW_LIMIT = 2000;
/** Hard ceiling on a windowed slice, so no request can ship the full scene. */
const MAX_WINDOW_LIMIT = 20000;

/** Schema columns lifted into typed node columns; the rest go into props jsonb. */
const NODE_SCHEMA_COLS = ["id", "label", "type", "node_type", "community"];
/** Schema columns lifted into typed edge columns; the rest go into props jsonb. */
const EDGE_SCHEMA_COLS = ["source_id", "target_id", "relation", "confidence"];

/**
 * Default rows committed per INSERT batch. Postgres caps a parameterized
 * statement at 65535 bind parameters, so 500 rows × ≤6 columns (≤3000 params)
 * stays comfortably under the limit.
 */
const DEFAULT_BATCH_SIZE = 500;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function moduleDir(): string {
  if (typeof __dirname === "string") return __dirname;
  return dirname(fileURLToPath(import.meta.url));
}

function resolveToolVersion(): string {
  const baseDir = moduleDir();
  for (const rel of [join("..", ".."), ".."]) {
    try {
      const pkg = JSON.parse(
        readFileSync(join(baseDir, rel, "package.json"), "utf-8"),
      ) as { name?: string; version?: string };
      if (pkg.name === "@sentropic/graphify" && pkg.version) return pkg.version;
    } catch {
      /* try the next layout */
    }
  }
  return "unknown";
}

/** Build a node community map: nodeId → community index. */
function buildNodeCommunityMap(communities: Map<number, string[]>): Map<string, number> {
  const result = new Map<string, number>();
  for (const [cid, nodes] of communities) {
    for (const n of nodes) result.set(n, cid);
  }
  return result;
}

/** Compute a topology signature from a Graphology graph (mirrors export.ts/spanner logic). */
function computeTopologySignature(G: Graph): string {
  const nodeIds: string[] = [];
  G.forEachNode((nodeId) => nodeIds.push(nodeId));
  nodeIds.sort();

  const edges: string[] = [];
  G.forEachEdge((_edgeKey, data, source, target) => {
    const [src, tgt] = [source, target].sort();
    const rel = (data as Record<string, unknown>).relation ?? "";
    edges.push(`${src}\t${tgt}\t${String(rel)}`);
  });
  edges.sort();

  return `n=${nodeIds.length};e=${edges.length};${nodeIds.join(",")}|${edges.join(";")}`;
}

/** Derive a backend-safe city_slug from the config (mirrors the spanner namespace model). */
function deriveCitySlug(config: GraphStoreConfig): string {
  const raw =
    config.citySlug ??
    config.namespace ??
    config.database ??
    config.schema ??
    "graphify";
  return raw.replace(/[^A-Za-z0-9_-]/g, "_") || "graphify";
}

/** Validate a schema identifier so it is safe to interpolate into DDL. */
function safeSchema(schema: string | undefined): string | undefined {
  if (schema === undefined) return undefined;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) {
    throw new Error(
      `postgres store: invalid schema name '${schema}' (must match [A-Za-z_][A-Za-z0-9_]*)`,
    );
  }
  return schema;
}

/** Serialise the non-schema attributes into a JSON-stringifiable props bag. */
function buildPropsBag(
  attrs: Record<string, unknown>,
  omit: string[],
): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (!omit.includes(k)) props[k] = v;
  }
  return props;
}

/**
 * Resolve a node's `node_type` the same way the `type` column is filled, so the
 * graph_nodes rows and the graph_group_counts aggregate never disagree:
 * node_type > type > file_type, else null (untyped — excluded from the axis).
 */
function resolveNodeType(a: Record<string, unknown>): string | null {
  if (typeof a.node_type === "string") return a.node_type;
  if (typeof a.type === "string") return a.type;
  if (typeof a.file_type === "string") return a.file_type;
  return null;
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

/**
 * The native Postgres schema as individual executable DDL statements. This is
 * the single source of truth for the live `postgres` GraphStore adapter
 * (ensure-exists). `city_slug` carries the namespace/citySlug so multiple
 * projects/branches share one database without collisions.
 *
 * Tables:
 *   - graph_nodes(city_slug, id) PRIMARY KEY (city_slug, id), props jsonb
 *   - graph_edges(city_slug, source_id, target_id, relation)
 *       PRIMARY KEY (city_slug, source_id, target_id, relation), props jsonb
 *   - graph_meta(city_slug) PRIMARY KEY — one snapshot row per city_slug
 *   - graph_group_counts(city_slug, axis, key) PRIMARY KEY — precomputed
 *       group-by aggregate (LOT 1); rebuilt only inside a replace-mode push
 *   - graph_positions(city_slug, layout_id, node_id) PRIMARY KEY — precomputed
 *       per-layout positions + degree (LOT 3); rebuilt only inside a replace push
 *
 * Indexes:
 *   - (city_slug, type) composite, for type-scoped scans
 *   - GIN to_tsvector('french', label) for full-text label search
 *   - GIN props jsonb_path_ops for containment queries
 *   - (city_slug, source_id) and (city_slug, target_id) for neighbor JOINs
 *
 * All statements use IF NOT EXISTS so ensure-exists is idempotent.
 */
export function postgresDdlStatements(schema?: string): string[] {
  const validated = safeSchema(schema);
  const q = (name: string): string => (validated ? `"${validated}".${name}` : name);
  // Index names are global within a schema; prefix with the schema when present
  // so two schemas can each carry the same logical index without clashing.
  const ix = (name: string): string => (validated ? `${validated}_${name}` : name);

  const statements: string[] = [];

  if (validated) {
    statements.push(`CREATE SCHEMA IF NOT EXISTS "${validated}"`);
  }

  // graph_nodes — city_slug-scoped primary key (city_slug, id).
  statements.push(
    [
      `CREATE TABLE IF NOT EXISTS ${q(NODE_TABLE)} (`,
      "  city_slug text NOT NULL,",
      "  id text NOT NULL,",
      "  label text,",
      "  type text,",
      "  community integer,",
      "  props jsonb NOT NULL DEFAULT '{}'::jsonb,",
      "  PRIMARY KEY (city_slug, id)",
      ")",
    ].join("\n"),
  );

  // graph_edges — city_slug-scoped primary key.
  statements.push(
    [
      `CREATE TABLE IF NOT EXISTS ${q(EDGE_TABLE)} (`,
      "  city_slug text NOT NULL,",
      "  source_id text NOT NULL,",
      "  target_id text NOT NULL,",
      "  relation text NOT NULL,",
      "  confidence text,",
      "  props jsonb NOT NULL DEFAULT '{}'::jsonb,",
      "  PRIMARY KEY (city_slug, source_id, target_id, relation)",
      ")",
    ].join("\n"),
  );

  // graph_meta — one snapshot row per city_slug.
  statements.push(
    [
      `CREATE TABLE IF NOT EXISTS ${q(META_TABLE)} (`,
      "  city_slug text NOT NULL,",
      "  topology_signature text,",
      "  pushed_at text,",
      "  tool_version text,",
      "  PRIMARY KEY (city_slug)",
      ")",
    ].join("\n"),
  );

  // graph_group_counts — precomputed group-by aggregate (storage LOT 1).
  // Rebuilt ONLY inside a replace-mode push (delete-all-then-load per city), so
  // it holds exactly one snapshot's worth of rows per city_slug and a read by
  // (city_slug, axis) is O(#groups). `snapshot_id` stamps the producing push
  // (== graph_meta.pushed_at) for staleness cross-checks. The (city_slug, axis,
  // key) primary key both enforces one row per group and serves the read as a
  // covering prefix index — no extra index needed.
  statements.push(
    [
      `CREATE TABLE IF NOT EXISTS ${q(COUNT_TABLE)} (`,
      "  city_slug text NOT NULL,",
      "  snapshot_id text NOT NULL,",
      "  axis text NOT NULL,",
      "  key text NOT NULL,",
      "  label text,",
      "  count integer NOT NULL,",
      "  parent_key text,",
      "  PRIMARY KEY (city_slug, axis, key)",
      ")",
    ].join("\n"),
  );

  // graph_positions — precomputed per-layout positions (storage LOT 3). Rebuilt
  // ONLY inside a replace-mode push (delete-all-then-load per city), so it holds
  // exactly one snapshot's positions per (city_slug, layout_id). `degree` is
  // precomputed at push (drives node weight/size and the degree-top-n window
  // without a join) and `snapshot_id` stamps the producing push for staleness
  // cross-checks. The (city_slug, layout_id, node_id) primary key enforces one
  // row per node per layout; the (city_slug, layout_id, degree) index serves the
  // top-N-by-degree window read as an indexed scan.
  statements.push(
    [
      `CREATE TABLE IF NOT EXISTS ${q(POSITION_TABLE)} (`,
      "  city_slug text NOT NULL,",
      "  snapshot_id text NOT NULL,",
      "  layout_id text NOT NULL,",
      "  node_id text NOT NULL,",
      "  x double precision NOT NULL,",
      "  y double precision NOT NULL,",
      "  degree integer NOT NULL,",
      "  PRIMARY KEY (city_slug, layout_id, node_id)",
      ")",
    ].join("\n"),
  );

  // Degree-ordered index for the degree-top-n window read (per city + layout).
  statements.push(
    `CREATE INDEX IF NOT EXISTS ${ix("graph_positions_city_layout_degree_idx")} ` +
      `ON ${q(POSITION_TABLE)} (city_slug, layout_id, degree DESC)`,
  );

  // Composite (city_slug, type) — type-scoped scans within a city.
  statements.push(
    `CREATE INDEX IF NOT EXISTS ${ix("graph_nodes_city_type_idx")} ` +
      `ON ${q(NODE_TABLE)} (city_slug, type)`,
  );

  // GIN full-text index on label (french analyzer).
  statements.push(
    `CREATE INDEX IF NOT EXISTS ${ix("graph_nodes_label_fts_idx")} ` +
      `ON ${q(NODE_TABLE)} USING gin (to_tsvector('french', coalesce(label, '')))`,
  );

  // GIN containment index on props (jsonb_path_ops).
  statements.push(
    `CREATE INDEX IF NOT EXISTS ${ix("graph_nodes_props_idx")} ` +
      `ON ${q(NODE_TABLE)} USING gin (props jsonb_path_ops)`,
  );

  // Neighbor-JOIN indexes: outgoing and incoming edges per city.
  statements.push(
    `CREATE INDEX IF NOT EXISTS ${ix("graph_edges_city_source_idx")} ` +
      `ON ${q(EDGE_TABLE)} (city_slug, source_id)`,
  );
  statements.push(
    `CREATE INDEX IF NOT EXISTS ${ix("graph_edges_city_target_idx")} ` +
      `ON ${q(EDGE_TABLE)} (city_slug, target_id)`,
  );

  return statements;
}

// ---------------------------------------------------------------------------
// Config + public types
// ---------------------------------------------------------------------------

export interface PostgresGraphStoreConfig extends GraphStoreConfig {
  /**
   * Full DSN. Populated from env only (GRAPHIFY_POSTGRES_URL) — never YAML,
   * since a DSN can embed credentials.
   */
  connectionString?: string;
  /** SQL schema the mirror writes into (non-secret). Default: search_path. */
  schema?: string;
  /** Require TLS on the connection (non-secret). */
  ssl?: boolean;
  /**
   * Base directory for the S3-replayable artifact. The canonical
   * `graph/{citySlug}/latest.json` is written under this directory on every
   * push. Defaults to `.graphify` relative to the current working directory.
   */
  target?: string;
}

export interface PostgresClearOptions {
  namespace?: string;
  force?: boolean;
}

export interface PostgresGraphStore extends GraphStore {
  clear(options?: string | PostgresClearOptions): Promise<void>;
  /**
   * Fetch a node's neighbors with a SINGLE JOIN (graph_edges ⋈ graph_nodes),
   * not one SELECT per edge (the N+1 fix). Returns the matched neighbor rows.
   */
  queryNeighbors(nodeId: string, citySlug?: string): Promise<Array<Record<string, unknown>>>;
  /**
   * O(#groups) group-by counts read from the precomputed `graph_group_counts`
   * table (storage LOT 1). Scoped to the latest REPLACE snapshot. Supported
   * axes: see `AGGREGATE_AXES`. Unknown axes return an empty group list.
   */
  groupCounts(axis: string): Promise<GraphGroupCounts>;
  /**
   * All precomputed positions for one layout (storage LOT 3), read from the
   * `graph_positions` table. Scoped to the latest REPLACE snapshot. An unknown
   * layout returns an empty array.
   */
  layoutPositions(layout: string): Promise<GraphLayoutPosition[]>;
  /**
   * A BOUNDED windowed slice (storage LOT 3): the top-N nodes by precomputed
   * degree for a layout + the edges induced among them. Scoped to the latest
   * REPLACE snapshot. The node cap is clamped to `MAX_WINDOW_LIMIT`.
   */
  graphWindow(options?: GraphWindowOptions): Promise<GraphWindow>;
}

// ---------------------------------------------------------------------------
// Minimal structural types for the `pg` surface we use (no static import —
// real types come from the injected/imported module).
// ---------------------------------------------------------------------------

interface PgQueryResult {
  rows: Array<Record<string, unknown>>;
  rowCount?: number | null;
}

interface PgClient {
  query(text: string, params?: unknown[]): Promise<PgQueryResult>;
  release(err?: boolean | Error): void;
}

interface PgPool {
  query(text: string, params?: unknown[]): Promise<PgQueryResult>;
  connect(): Promise<PgClient>;
  end(): Promise<void>;
}

interface PgModule {
  Pool: new (config?: Record<string, unknown>) => PgPool;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a Postgres GraphStore. The driver module is supplied by the registry's
 * lazy import (production) or by `deps.driverModule` (tests). The DSN is read
 * from `config.connectionString` (resolved env-only upstream); credentials are
 * never read from YAML.
 */
export async function createPostgresGraphStore(
  config: PostgresGraphStoreConfig,
  deps?: StoreTestDeps,
): Promise<PostgresGraphStore> {
  const connectionString =
    config.connectionString ?? process.env.GRAPHIFY_POSTGRES_URL;
  if (!connectionString) {
    throw new Error(
      "postgres store requires a DSN (config.connectionString or GRAPHIFY_POSTGRES_URL)",
    );
  }

  // Resolve the driver from injected deps or a dynamic import (the registry
  // performs the import in production; this fallback supports direct/live use).
  let pgMod: Record<string, unknown>;
  if (deps?.driverModule !== undefined) {
    pgMod = deps.driverModule as Record<string, unknown>;
  } else {
    try {
      // Optional, uninstalled-by-default driver: build the specifier at runtime
      // so the compiler does not attempt to resolve the (absent) package.
      const driverPackage = ["p", "g"].join("");
      pgMod = (await import(driverPackage)) as Record<string, unknown>;
    } catch {
      throw new Error("store 'postgres' requires pg. Run: npm install pg");
    }
  }

  const mod = (pgMod.default ?? pgMod) as Partial<PgModule>;
  const PoolCtor = mod.Pool;
  if (typeof PoolCtor !== "function") {
    throw new Error("store 'postgres' requires pg. Run: npm install pg");
  }

  const schema = safeSchema(config.schema);
  const pool: PgPool = new PoolCtor({
    connectionString,
    ...(config.ssl ? { ssl: { rejectUnauthorized: false } } : {}),
    ...(schema ? { options: `-c search_path=${schema}` } : {}),
  });

  const citySlug = deriveCitySlug(config);
  // Artifact base for the S3-replayable latest.json mirror.
  const artifactBase = config.target ?? join(process.cwd(), ".graphify");
  let closed = false;
  let schemaEnsured = false;

  // Local snapshot cache: the fake driver in unit tests returns empty query
  // rows, so this is the read-back source there; against a real backend the
  // meta is also persisted as a graph_meta row and re-read from it.
  const localMeta = new Map<string, GraphStoreSnapshotMeta>();

  /** Table reference, schema-qualified when a schema is configured. */
  const q = (name: string): string => (schema ? `"${schema}".${name}` : name);

  // -------------------------------------------------------------------------
  // Schema (ensure-exists, idempotent)
  // -------------------------------------------------------------------------

  async function ensureSchema(): Promise<void> {
    if (schemaEnsured) return;
    schemaEnsured = true;
    for (const stmt of postgresDdlStatements(config.schema)) {
      await pool.query(stmt);
    }
  }

  // -------------------------------------------------------------------------
  // Row builders — one flat value array per row, in column order.
  // -------------------------------------------------------------------------

  /** Columns written for graph_nodes, in order. */
  const NODE_COLUMNS = ["city_slug", "id", "label", "type", "community", "props"];
  /** Columns written for graph_edges, in order. */
  const EDGE_COLUMNS = [
    "city_slug",
    "source_id",
    "target_id",
    "relation",
    "confidence",
    "props",
  ];

  function buildNodeRows(
    G: Graph,
    communityMap: Map<string, number>,
  ): unknown[][] {
    const rows: unknown[][] = [];
    G.forEachNode((nodeId, attrs) => {
      const a = attrs as Record<string, unknown>;
      const community = communityMap.get(nodeId);
      rows.push([
        citySlug,
        nodeId,
        typeof a.label === "string" ? a.label : nodeId,
        resolveNodeType(a),
        community ?? (typeof a.community === "number" ? a.community : null),
        JSON.stringify(buildPropsBag(a, NODE_SCHEMA_COLS)),
      ]);
    });
    return rows;
  }

  /** Columns written for graph_group_counts, in order. */
  const COUNT_COLUMNS = [
    "city_slug",
    "snapshot_id",
    "axis",
    "key",
    "label",
    "count",
    "parent_key",
  ];

  /**
   * Aggregate the full snapshot into group-count rows IN JS (one pass over the
   * graph), mirroring the `node_type`/`community` derivation used for the node
   * rows. Computed from the same in-memory snapshot that is being loaded, so the
   * rows are exactly consistent with the post-replace graph_nodes — never with a
   * stale row that a merge left behind. `node_type` and `community` are flat
   * axes (no parent_key) in LOT 1.
   */
  function buildGroupCountRows(
    G: Graph,
    communityMap: Map<string, number>,
    snapshotId: string,
  ): unknown[][] {
    const byType = new Map<string, number>();
    const byCommunity = new Map<number, number>();
    // Human community label carried on the node (`community_name`). All members
    // of a community share it, so the first non-empty value wins; communities
    // without one fall back to the synthetic `Community <key>` label below.
    const communityLabel = new Map<number, string>();
    G.forEachNode((nodeId, attrs) => {
      const a = attrs as Record<string, unknown>;
      const nodeType = resolveNodeType(a);
      if (nodeType !== null) byType.set(nodeType, (byType.get(nodeType) ?? 0) + 1);
      const community =
        communityMap.get(nodeId) ??
        (typeof a.community === "number" ? a.community : null);
      if (community !== null) {
        byCommunity.set(community, (byCommunity.get(community) ?? 0) + 1);
        if (!communityLabel.has(community) && typeof a.community_name === "string") {
          const name = a.community_name.trim();
          if (name.length > 0) communityLabel.set(community, name);
        }
      }
    });
    const rows: unknown[][] = [];
    for (const [key, count] of byType) {
      rows.push([citySlug, snapshotId, "node_type", key, key, count, null]);
    }
    for (const [cid, count] of byCommunity) {
      const key = String(cid);
      const label = communityLabel.get(cid) ?? `Community ${key}`;
      rows.push([citySlug, snapshotId, "community", key, label, count, null]);
    }
    return rows;
  }

  /** Columns written for graph_positions, in order. */
  const POSITION_COLUMNS = [
    "city_slug",
    "snapshot_id",
    "layout_id",
    "node_id",
    "x",
    "y",
    "degree",
  ];

  /**
   * Mirror the graph's single baked layout into position rows (storage LOT 3).
   * `attachLayoutPositions` writes numeric `x`/`y` node attributes; this persists
   * exactly those under `DEFAULT_LAYOUT`, alongside the node's degree (computed in
   * one pass, drives node weight/size and the degree-top-n window without a join).
   * Nodes WITHOUT finite x/y (no baked layout) are skipped — the window then has
   * no positions for them and the studio keeps the full-scene fallback. Computed
   * from the same in-memory snapshot being loaded, so the rows are exactly
   * consistent with the post-replace graph_nodes.
   */
  function buildPositionRows(G: Graph, snapshotId: string): unknown[][] {
    const rows: unknown[][] = [];
    G.forEachNode((nodeId, attrs) => {
      const a = attrs as Record<string, unknown>;
      const x = a.x;
      const y = a.y;
      if (typeof x !== "number" || !Number.isFinite(x)) return;
      if (typeof y !== "number" || !Number.isFinite(y)) return;
      rows.push([citySlug, snapshotId, DEFAULT_LAYOUT, nodeId, x, y, G.degree(nodeId)]);
    });
    return rows;
  }

  function buildEdgeRows(G: Graph): unknown[][] {
    const rows: unknown[][] = [];
    G.forEachEdge((_edgeKey, attrs, source, target) => {
      const a = attrs as Record<string, unknown>;
      rows.push([
        citySlug,
        source,
        target,
        typeof a.relation === "string" ? a.relation : "RELATES_TO",
        typeof a.confidence === "string" ? a.confidence : "EXTRACTED",
        JSON.stringify(buildPropsBag(a, EDGE_SCHEMA_COLS)),
      ]);
    });
    return rows;
  }

  // -------------------------------------------------------------------------
  // Upsert: INSERT ... ON CONFLICT DO UPDATE, batched.
  // -------------------------------------------------------------------------

  /**
   * Build a multi-row `INSERT ... ON CONFLICT DO UPDATE` for one batch.
   * `conflictCols` form the conflict target; every non-conflict column is
   * refreshed from EXCLUDED so a re-push is an idempotent upsert (merge).
   */
  function buildUpsert(
    table: string,
    columns: string[],
    conflictCols: string[],
    rows: unknown[][],
  ): { text: string; params: unknown[] } {
    const params: unknown[] = [];
    const valueTuples = rows.map((row) => {
      const placeholders = row.map((value) => {
        params.push(value);
        return `$${params.length}`;
      });
      return `(${placeholders.join(", ")})`;
    });
    const updateCols = columns.filter((c) => !conflictCols.includes(c));
    const setClause = updateCols
      .map((c) => `${c} = EXCLUDED.${c}`)
      .join(", ");
    const text =
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${valueTuples.join(", ")} ` +
      `ON CONFLICT (${conflictCols.join(", ")}) DO UPDATE SET ${setClause}`;
    return { text, params };
  }

  async function upsertBatched(
    runner: { query(text: string, params?: unknown[]): Promise<PgQueryResult> },
    table: string,
    columns: string[],
    conflictCols: string[],
    rows: unknown[][],
    batchSize: number,
  ): Promise<number> {
    let count = 0;
    for (const batch of chunk(rows, batchSize)) {
      if (batch.length === 0) continue;
      const { text, params } = buildUpsert(table, columns, conflictCols, batch);
      await runner.query(text, params);
      count += batch.length;
    }
    return count;
  }

  async function deleteCityRows(
    runner: { query(text: string, params?: unknown[]): Promise<PgQueryResult> },
    table: string,
    slug: string,
  ): Promise<void> {
    await runner.query(`DELETE FROM ${table} WHERE city_slug = $1`, [slug]);
  }

  async function writeMeta(
    runner: { query(text: string, params?: unknown[]): Promise<PgQueryResult> },
    topologySignature: string,
    toolVersion: string,
    pushedAt: string,
  ): Promise<void> {
    await runner.query(
      `INSERT INTO ${q(META_TABLE)} (city_slug, topology_signature, pushed_at, tool_version) ` +
        `VALUES ($1, $2, $3, $4) ` +
        `ON CONFLICT (city_slug) DO UPDATE SET ` +
        `topology_signature = EXCLUDED.topology_signature, ` +
        `pushed_at = EXCLUDED.pushed_at, ` +
        `tool_version = EXCLUDED.tool_version`,
      [citySlug, topologySignature, pushedAt, toolVersion],
    );
    localMeta.set(citySlug, { topologySignature, pushedAt, toolVersion });
  }

  async function readMetaFromBackend(): Promise<GraphStoreSnapshotMeta | undefined> {
    const result = await pool.query(
      `SELECT topology_signature, pushed_at, tool_version FROM ${q(META_TABLE)} ` +
        `WHERE city_slug = $1 LIMIT 1`,
      [citySlug],
    );
    const row = result.rows?.[0];
    if (!row) return undefined;
    const sig = row.topology_signature;
    if (typeof sig !== "string" || !sig) return undefined;
    return {
      topologySignature: sig,
      pushedAt: typeof row.pushed_at === "string" ? row.pushed_at : new Date().toISOString(),
      toolVersion: typeof row.tool_version === "string" ? row.tool_version : "unknown",
    };
  }

  /**
   * Re-emit the canonical S3-replayable artifact `graph/{citySlug}/latest.json`
   * via the shared toJson() writer (the same writer FileGraphStore uses), so the
   * Postgres write can be replayed from object storage. force bypasses the
   * shrink guard because a mirror push is an explicit write.
   */
  function writeLatestArtifact(G: Graph, communities: Map<number, string[]>): string {
    const dir = join(artifactBase, "graph", citySlug);
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "latest.json");
    toJson(G, communities, path, { force: true });
    return path;
  }

  // -------------------------------------------------------------------------
  // GraphStore implementation
  // -------------------------------------------------------------------------

  return {
    id: "postgres",
    capabilities: {
      push: true,
      query: true,
      clear: true,
      snapshotMeta: true,
      // Precomputed group-by aggregate (storage LOT 1), replace-snapshot scoped.
      aggregate: { version: 1, axes: [...AGGREGATE_AXES] },
      // Precomputed per-layout positions + degree-top-n window (storage LOT 3),
      // replace-snapshot scoped. Advertises the one baked layout LOT 3 persists.
      window: {
        version: 1,
        layouts: [DEFAULT_LAYOUT],
        strategies: [...WINDOW_STRATEGIES],
      },
    },

    async verifyConnection(): Promise<void> {
      await pool.query("SELECT 1");
    },

    async pushGraph(
      G: Graph,
      communities: Map<number, string[]>,
      options: GraphPushOptions = {},
    ): Promise<GraphPushResult> {
      const start = Date.now();
      const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
      const mode = options.mode ?? "merge";
      const nodeCount = G.order;
      const edgeCount = G.size;

      if (options.dryRun) {
        return {
          nodes: nodeCount,
          edges: edgeCount,
          warnings: [],
          durationMs: Date.now() - start,
        };
      }

      await ensureSchema();

      const communityMap = buildNodeCommunityMap(communities);
      const nodeRows = buildNodeRows(G, communityMap);
      const edgeRows = buildEdgeRows(G);
      const pushedAt = new Date().toISOString();

      // All writes for one push run in a single transaction so a backend error
      // leaves the previous snapshot intact (SPEC: "the push aborts").
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        if (mode === "replace") {
          await deleteCityRows(client, q(NODE_TABLE), citySlug);
          await deleteCityRows(client, q(EDGE_TABLE), citySlug);
        }
        await upsertBatched(
          client,
          q(NODE_TABLE),
          NODE_COLUMNS,
          ["city_slug", "id"],
          nodeRows,
          batchSize,
        );
        await upsertBatched(
          client,
          q(EDGE_TABLE),
          EDGE_COLUMNS,
          ["city_slug", "source_id", "target_id", "relation"],
          edgeRows,
          batchSize,
        );
        // Aggregate is REPLACE-snapshot scoped (storage LOT 1): rebuild
        // graph_group_counts ONLY in replace mode, from the full snapshot just
        // loaded. A merge push is an upsert that may leave deleted nodes behind,
        // so it deliberately leaves the counts table untouched — the staleness
        // guard. Delete-all-then-upsert keeps exactly one snapshot per city.
        if (mode === "replace") {
          await deleteCityRows(client, q(COUNT_TABLE), citySlug);
          await upsertBatched(
            client,
            q(COUNT_TABLE),
            COUNT_COLUMNS,
            ["city_slug", "axis", "key"],
            buildGroupCountRows(G, communityMap, pushedAt),
            batchSize,
          );
          // Per-layout positions are REPLACE-snapshot scoped too (storage LOT 3):
          // same staleness guard as the aggregate — rebuild graph_positions ONLY
          // in replace mode, from the full snapshot just loaded, so a merge never
          // leaves positions for deleted nodes behind. Delete-all-then-upsert
          // keeps exactly one snapshot of positions per (city, layout).
          await deleteCityRows(client, q(POSITION_TABLE), citySlug);
          await upsertBatched(
            client,
            q(POSITION_TABLE),
            POSITION_COLUMNS,
            ["city_slug", "layout_id", "node_id"],
            buildPositionRows(G, pushedAt),
            batchSize,
          );
        }
        await writeMeta(client, computeTopologySignature(G), resolveToolVersion(), pushedAt);
        await client.query("COMMIT");
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore rollback failure; surface the original error */
        }
        throw err;
      } finally {
        client.release();
      }

      // S3-replay gap: re-emit the canonical artifact AFTER the DB commit so a
      // failed push never leaves a latest.json that the backend lacks.
      writeLatestArtifact(G, communities);

      return {
        nodes: nodeCount,
        edges: edgeCount,
        warnings: [],
        durationMs: Date.now() - start,
      };
    },

    async readSnapshotMeta(): Promise<GraphStoreSnapshotMeta | undefined> {
      if (localMeta.has(citySlug)) {
        return localMeta.get(citySlug);
      }
      return readMetaFromBackend();
    },

    async queryNeighbors(
      nodeId: string,
      slug?: string,
    ): Promise<Array<Record<string, unknown>>> {
      const targetSlug = slug ?? citySlug;
      // SINGLE JOIN: the edge row that touches nodeId is joined to the node row
      // on the OTHER endpoint, in one statement (the N+1 fix). Outgoing edges
      // join target_id; incoming edges join source_id. UNION ALL keeps it one
      // round-trip.
      const sql =
        `SELECT n.id, n.label, n.type, n.community, n.props, ` +
        `e.relation, e.confidence, 'out' AS direction ` +
        `FROM ${q(EDGE_TABLE)} e ` +
        `JOIN ${q(NODE_TABLE)} n ` +
        `ON n.city_slug = e.city_slug AND n.id = e.target_id ` +
        `WHERE e.city_slug = $1 AND e.source_id = $2 ` +
        `UNION ALL ` +
        `SELECT n.id, n.label, n.type, n.community, n.props, ` +
        `e.relation, e.confidence, 'in' AS direction ` +
        `FROM ${q(EDGE_TABLE)} e ` +
        `JOIN ${q(NODE_TABLE)} n ` +
        `ON n.city_slug = e.city_slug AND n.id = e.source_id ` +
        `WHERE e.city_slug = $1 AND e.target_id = $2`;
      const result = await pool.query(sql, [targetSlug, nodeId]);
      return result.rows ?? [];
    },

    async groupCounts(axis: string): Promise<GraphGroupCounts> {
      // O(#groups): read the precomputed aggregate, never the 47k node rows.
      // The (city_slug, axis, key) primary key serves this as a prefix scan.
      await ensureSchema();
      const result = await pool.query(
        `SELECT key, label, count, parent_key FROM ${q(COUNT_TABLE)} ` +
          `WHERE city_slug = $1 AND axis = $2 ORDER BY count DESC, key ASC`,
        [citySlug, axis],
      );
      const groups = (result.rows ?? []).map((row) => {
        const group: GraphGroupCounts["groups"][number] = {
          key: String(row.key),
          label:
            typeof row.label === "string" && row.label.length > 0
              ? row.label
              : String(row.key),
          count: typeof row.count === "number" ? row.count : Number(row.count ?? 0),
        };
        if (row.parent_key != null) group.parent_key = String(row.parent_key);
        return group;
      });
      return { axis, groups };
    },

    async layoutPositions(layout: string): Promise<GraphLayoutPosition[]> {
      // Storage LOT 3: every precomputed position for one layout, scoped to the
      // latest REPLACE snapshot. An unknown layout yields an empty array.
      await ensureSchema();
      const result = await pool.query(
        `SELECT node_id, x, y FROM ${q(POSITION_TABLE)} ` +
          `WHERE city_slug = $1 AND layout_id = $2 ORDER BY node_id ASC`,
        [citySlug, layout],
      );
      return (result.rows ?? []).map((row) => ({
        node_id: String(row.node_id),
        x: Number(row.x),
        y: Number(row.y),
      }));
    },

    async graphWindow(options: GraphWindowOptions = {}): Promise<GraphWindow> {
      // Storage LOT 3: a BOUNDED first-paint slice. The top-N nodes by precomputed
      // degree (an indexed scan over graph_positions — never the 47k node rows),
      // annotated with their layout x/y, plus the edges induced among them. The
      // node cap is clamped so no request can ship the full scene.
      await ensureSchema();
      const strategy = options.strategy ?? "degree-top-n";
      const layout = options.layout ?? DEFAULT_LAYOUT;
      const requested = options.limit ?? DEFAULT_WINDOW_LIMIT;
      const limit = Math.max(1, Math.min(MAX_WINDOW_LIMIT, Math.floor(requested)));

      // (1) top-N nodes by degree for the layout (indexed by (city, layout, degree)).
      const posResult = await pool.query(
        `SELECT node_id, x, y, degree FROM ${q(POSITION_TABLE)} ` +
          `WHERE city_slug = $1 AND layout_id = $2 ORDER BY degree DESC, node_id ASC LIMIT $3`,
        [citySlug, layout, limit],
      );
      const posRows = posResult.rows ?? [];
      const ids = posRows.map((r) => String(r.node_id));

      // (2) label/type for the windowed ids (one round-trip, ANY($ids)).
      const attrById = new Map<string, { label: string; node_type?: string }>();
      if (ids.length > 0) {
        const nodeResult = await pool.query(
          `SELECT id, label, type FROM ${q(NODE_TABLE)} WHERE city_slug = $1 AND id = ANY($2)`,
          [citySlug, ids],
        );
        for (const row of nodeResult.rows ?? []) {
          const id = String(row.id);
          const label = typeof row.label === "string" && row.label.length > 0 ? row.label : id;
          const entry: { label: string; node_type?: string } = { label };
          if (typeof row.type === "string" && row.type.length > 0) entry.node_type = row.type;
          attrById.set(id, entry);
        }
      }

      const nodes: GraphWindowNode[] = posRows.map((r) => {
        const id = String(r.node_id);
        const attr = attrById.get(id);
        const node: GraphWindowNode = {
          id,
          label: attr?.label ?? id,
          degree: typeof r.degree === "number" ? r.degree : Number(r.degree ?? 0),
        };
        if (attr?.node_type !== undefined) node.node_type = attr.node_type;
        if (r.x != null) node.x = Number(r.x);
        if (r.y != null) node.y = Number(r.y);
        return node;
      });

      // (3) induced edges: both endpoints inside the window (one round-trip).
      const edges: GraphWindowEdge[] = [];
      if (ids.length > 0) {
        const edgeResult = await pool.query(
          `SELECT source_id, target_id, relation FROM ${q(EDGE_TABLE)} ` +
            `WHERE city_slug = $1 AND source_id = ANY($2) AND target_id = ANY($2)`,
          [citySlug, ids],
        );
        for (const row of edgeResult.rows ?? []) {
          edges.push({
            source: String(row.source_id),
            target: String(row.target_id),
            relation: typeof row.relation === "string" ? row.relation : "RELATES_TO",
          });
        }
      }

      return { strategy, layout, limit, nodes, edges };
    },

    async clear(options?: string | PostgresClearOptions): Promise<void> {
      const opts = typeof options === "string" ? { namespace: options } : options ?? {};
      if (!opts.force) {
        throw new Error(
          `refusing to clear postgres city_slug '${citySlug}'; pass { force: true } to delete`,
        );
      }
      const targetSlug = opts.namespace ?? citySlug;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await deleteCityRows(client, q(NODE_TABLE), targetSlug);
        await deleteCityRows(client, q(EDGE_TABLE), targetSlug);
        await deleteCityRows(client, q(META_TABLE), targetSlug);
        await deleteCityRows(client, q(COUNT_TABLE), targetSlug);
        await deleteCityRows(client, q(POSITION_TABLE), targetSlug);
        await client.query("COMMIT");
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw err;
      } finally {
        client.release();
      }
      localMeta.delete(targetSlug);
    },

    async query(
      statement: string,
      params?: unknown[] | Record<string, unknown>,
    ): Promise<unknown> {
      // pg uses positional ($1, $2) parameters; pass an array through verbatim.
      // A named bag is forwarded as a single jsonb-ish parameter only when the
      // statement opts into it; otherwise positional is the contract.
      const positional = Array.isArray(params) ? params : undefined;
      return pool.query(statement, positional);
    },

    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      await pool.end();
    },
  };
}
