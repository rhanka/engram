/**
 * SQLite GraphStore adapter (SPEC_STORAGE_BACKENDS.md, "Future Backends";
 * design dossier .graphify/scratch/SQLITE_STORE_RESEARCH.md, ratified 2026-08-09).
 *
 * A LOCAL, single-file GraphStore for the Mode-2 memory substrate. The driver
 * (`better-sqlite3`) is NEVER imported statically: it is always supplied through
 * `deps.driverModule` (tests) or the registry's dynamic import (production), so
 * importing this module evaluates no driver and `tsc`/the import-guard never try
 * to resolve the (uninstalled-by-default) package. The dynamic specifier is built
 * at runtime (mirror of postgres.ts) so the compiler does not attempt to resolve
 * the absent package either.
 *
 * NARROW capability matrix by design (dossier §1.4). This first adapter announces
 * ONLY what it proves:
 *   push:true, clear:true, snapshotMeta:true,
 *   query:false           — NO raw SQL on the memory path (arbitrary SQL could
 *                           bypass the tombstone fold-out; dossier §1.1),
 *   queryWindow:true,
 *   append v1             — appendNode/appendEdge/appendTombstone,
 *   readback v1           — loadNode/listMemoryNotes/loadTombstones.
 * `aggregate` and `window` are ABSENT until a tested parity exists — never a
 * present-but-no-op method (M4; dossier §1.4).
 *
 * Tables are homologous to the postgres adapter (nodes/edges/meta/tombstones).
 * Unlike postgres — which keeps `t`/`t_end`/`scope`/`principal_owner` inside the
 * props jsonb behind expression indexes — this adapter LIFTS the canonical,
 * filtered fields (namespace, id, node_type, principal_owner, scope, t, t_end)
 * into typed, indexed columns and keeps only the extensible pass-through in a JSON
 * document (dossier §1.2). At read-back the CANONICAL COLUMNS PRIME over any JSON
 * copy — the exact inverse of the write path.
 *
 * The tombstone fold-out is the strong contract (dossier §1.3): a tombstoned node
 * disappears from loadNode / the memory list / the temporal window, and its
 * incident edges disappear too. It is enforced by `NOT EXISTS` anti-joins mirrored
 * on postgres.ts, applied at read time so erasure is immediate on every surface.
 *
 * Durability (dossier §4.4): the connection is opened WAL + `synchronous = FULL`
 * + `foreign_keys = ON`, with a `busy_timeout` fuse. The WAL-reset bug requires a
 * runtime SQLite `>= 3.51.3` (or a documented backport 3.44.6 / 3.50.7); that
 * runtime-version guard is a DEFERRED verification item, not asserted here.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import type Graph from "graphology";
import type {
  GraphAppendOptions,
  GraphAppendOutcome,
  GraphEdgeInput,
  GraphNodeInput,
  GraphNodeRecord,
  GraphPushOptions,
  GraphPushResult,
  GraphStore,
  GraphStoreConfig,
  GraphStoreSnapshotMeta,
  GraphTimeWindow,
  GraphTimeWindowEdge,
  GraphTimeWindowNode,
  GraphTimeWindowOptions,
  GraphTombstoneInput,
  GraphTombstoneOutcome,
  GraphTombstoneRecord,
  MemoryNoteListQuery,
  StoreTestDeps,
} from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NODE_TABLE = "graph_nodes";
const EDGE_TABLE = "graph_edges";
const META_TABLE = "graph_meta";
/** Append-only erasure log (dossier §1.3, §3.5); folded out of every read. */
const TOMBSTONE_TABLE = "graph_tombstones";

/**
 * Node fields lifted into typed columns; the rest go into the props JSON. Both
 * the input form (`node_type`) and the column form (`type`) are omitted so no
 * canonical field is duplicated into the pass-through bag.
 */
const NODE_SCHEMA_COLS = [
  "id",
  "label",
  "type",
  "node_type",
  "community",
  "principal_owner",
  "scope",
  "t",
  "t_end",
];
/** Edge fields lifted into typed columns; the rest go into the props JSON. Both
 *  the input form (`source`/`target`) and the column form (`source_id`/`target_id`)
 *  are omitted so no canonical field is duplicated into the pass-through bag. */
const EDGE_SCHEMA_COLS = [
  "source",
  "target",
  "source_id",
  "target_id",
  "relation",
  "confidence",
  "t",
  "t_end",
];

/** Columns written for graph_nodes, in order (matches nodeValues()). */
const NODE_COLUMNS = [
  "city_slug",
  "id",
  "label",
  "type",
  "community",
  "principal_owner",
  "scope",
  "t",
  "t_end",
  "props",
];
/** Columns written for graph_edges, in order (matches edgeValues()). */
const EDGE_COLUMNS = [
  "city_slug",
  "source_id",
  "target_id",
  "relation",
  "confidence",
  "t",
  "t_end",
  "props",
];

// ---------------------------------------------------------------------------
// Internal helpers (ported from postgres.ts so the two adapters never diverge)
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

/** Compute a topology signature from a Graphology graph (mirrors postgres/spanner). */
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

/** Derive a backend-safe city_slug from the config (mirrors postgres/spanner namespace). */
function deriveCitySlug(config: GraphStoreConfig): string {
  const raw =
    config.citySlug ??
    config.namespace ??
    config.database ??
    config.schema ??
    "graphify";
  return raw.replace(/[^A-Za-z0-9_-]/g, "_") || "graphify";
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
 * Resolve a node's `node_type` the same way the typed `type` column is filled:
 * node_type > type > file_type, else null (untyped). Mirrors postgres so the two
 * adapters agree on what a MemoryNote's canonical type is.
 */
function resolveNodeType(a: Record<string, unknown>): string | null {
  if (typeof a.node_type === "string") return a.node_type;
  if (typeof a.type === "string") return a.type;
  if (typeof a.file_type === "string") return a.file_type;
  return null;
}

/** A finite-number view of a temporal attribute (else null — excluded from the column). */
function temporalValue(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Parse the props column defensively (stored as JSON text; a fake may hand back an object). */
function parseProps(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/**
 * Reconstruct a {@link GraphNodeRecord} from a graph_nodes row for the memory
 * read-back. The persisted props bag is the base; the CANONICAL fields (label,
 * node_type, community, principal_owner, scope, t, t_end) are lifted from the typed
 * columns — the columns PRIME over any JSON copy (defensive delete-then-set, so a
 * spoofed prop can never win). This is the exact inverse of the append path.
 */
function nodeRecordFromRow(row: Record<string, unknown>): GraphNodeRecord {
  const props = parseProps(row.props);
  const id = String(row.id);
  const record: GraphNodeRecord = { ...props, id };
  // Canonical columns prime over any JSON copy.
  delete record.node_type;
  delete record.community;
  delete record.principal_owner;
  delete record.scope;
  delete record.t;
  delete record.t_end;
  if (typeof row.label === "string" && row.label.length > 0) record.label = row.label;
  if (typeof row.type === "string" && row.type.length > 0) record.node_type = row.type;
  if (row.community != null) {
    const community = Number(row.community);
    if (Number.isFinite(community)) record.community = community;
  }
  if (typeof row.principal_owner === "string" && row.principal_owner.length > 0) {
    record.principal_owner = row.principal_owner;
  }
  if (typeof row.scope === "string" && row.scope.length > 0) record.scope = row.scope;
  if (row.t != null) {
    const t = Number(row.t);
    if (Number.isFinite(t)) record.t = t;
  }
  if (row.t_end != null) {
    const tEnd = Number(row.t_end);
    if (Number.isFinite(tEnd)) record.t_end = tEnd;
  }
  return record;
}

/** Reconstruct a temporal node (queryWindow) — canonical columns prime; `t` is required. */
function temporalNodeFromRow(row: Record<string, unknown>): GraphTimeWindowNode {
  const props = parseProps(row.props);
  const id = String(row.id);
  const node: GraphTimeWindowNode = {
    ...props,
    id,
    label: typeof row.label === "string" && row.label.length > 0 ? row.label : id,
    t: Number(row.t),
  };
  delete node.node_type;
  delete node.community;
  delete node.principal_owner;
  delete node.scope;
  if (typeof row.type === "string" && row.type.length > 0) node.node_type = row.type;
  if (row.community != null) {
    const community = Number(row.community);
    if (Number.isFinite(community)) node.community = community;
  }
  if (typeof row.principal_owner === "string" && row.principal_owner.length > 0) {
    node.principal_owner = row.principal_owner;
  }
  if (typeof row.scope === "string" && row.scope.length > 0) node.scope = row.scope;
  if (row.t_end != null) {
    node.t_end = Number(row.t_end);
  } else {
    delete node.t_end;
  }
  return node;
}

/** Reconstruct a temporal edge (queryWindow) — canonical columns prime; `t` is required. */
function temporalEdgeFromRow(row: Record<string, unknown>): GraphTimeWindowEdge {
  const props = parseProps(row.props);
  const edge: GraphTimeWindowEdge = {
    ...props,
    source: String(row.source_id),
    target: String(row.target_id),
    relation: typeof row.relation === "string" ? row.relation : "RELATES_TO",
    t: Number(row.t),
  };
  delete edge.confidence;
  if (typeof row.confidence === "string" && row.confidence.length > 0) {
    edge.confidence = row.confidence;
  }
  if (row.t_end != null) {
    edge.t_end = Number(row.t_end);
  } else {
    delete edge.t_end;
  }
  return edge;
}

/** Reconstruct a {@link GraphTombstoneRecord} from a graph_tombstones journal row. */
function tombstoneRecordFromRow(row: Record<string, unknown>): GraphTombstoneRecord {
  const reason = typeof row.reason === "string" ? row.reason : undefined;
  const rawT = row.t;
  const t =
    typeof rawT === "number" && Number.isFinite(rawT)
      ? rawT
      : rawT != null && Number.isFinite(Number(rawT))
        ? Number(rawT)
        : undefined;
  const base = {
    ...(t !== undefined ? { t } : {}),
    ...(reason !== undefined ? { reason } : {}),
  };
  if (String(row.target_kind) === "edge") {
    const relation = typeof row.edge_relation === "string" ? row.edge_relation : "";
    return {
      target: {
        kind: "edge",
        source: String(row.edge_source),
        target: String(row.edge_target),
        ...(relation.length > 0 ? { relation } : {}),
      },
      ...base,
    };
  }
  return { target: { kind: "node", id: String(row.node_id) }, ...base };
}

// ---------------------------------------------------------------------------
// Schema — the single source of truth for the SQLite adapter DDL.
// ---------------------------------------------------------------------------

/**
 * The SQLite schema as individual executable DDL statements. `city_slug` carries
 * the namespace so multiple projects/branches share one file without collisions.
 * All statements use IF NOT EXISTS so ensure-exists is idempotent. Canonical,
 * filtered fields are typed columns (indexed); the extensible pass-through rides
 * in the `props` JSON text column.
 */
export function sqliteDdlStatements(): string[] {
  return [
    // graph_nodes — city_slug-scoped primary key (city_slug, id). t / t_end /
    // principal_owner / scope are LIFTED to typed columns (dossier §1.2).
    [
      `CREATE TABLE IF NOT EXISTS ${NODE_TABLE} (`,
      "  city_slug TEXT NOT NULL,",
      "  id TEXT NOT NULL,",
      "  label TEXT,",
      "  type TEXT,",
      "  community INTEGER,",
      "  principal_owner TEXT,",
      "  scope TEXT,",
      "  t REAL,",
      "  t_end REAL,",
      "  props TEXT NOT NULL DEFAULT '{}',",
      "  PRIMARY KEY (city_slug, id)",
      ")",
    ].join("\n"),
    // graph_edges — city_slug-scoped primary key.
    [
      `CREATE TABLE IF NOT EXISTS ${EDGE_TABLE} (`,
      "  city_slug TEXT NOT NULL,",
      "  source_id TEXT NOT NULL,",
      "  target_id TEXT NOT NULL,",
      "  relation TEXT NOT NULL,",
      "  confidence TEXT,",
      "  t REAL,",
      "  t_end REAL,",
      "  props TEXT NOT NULL DEFAULT '{}',",
      "  PRIMARY KEY (city_slug, source_id, target_id, relation)",
      ")",
    ].join("\n"),
    // graph_meta — one snapshot row per city_slug.
    [
      `CREATE TABLE IF NOT EXISTS ${META_TABLE} (`,
      "  city_slug TEXT NOT NULL,",
      "  topology_signature TEXT,",
      "  pushed_at TEXT,",
      "  tool_version TEXT,",
      "  PRIMARY KEY (city_slug)",
      ")",
    ].join("\n"),
    // graph_tombstones — append-only erasure log (dossier §1.3, §3.5). Mirrors
    // postgres: the key columns default to '' (not NULL) so the composite PRIMARY
    // KEY makes a re-tombstone idempotent (ON CONFLICT DO NOTHING).
    [
      `CREATE TABLE IF NOT EXISTS ${TOMBSTONE_TABLE} (`,
      "  city_slug TEXT NOT NULL,",
      "  target_kind TEXT NOT NULL,",
      "  node_id TEXT NOT NULL DEFAULT '',",
      "  edge_source TEXT NOT NULL DEFAULT '',",
      "  edge_target TEXT NOT NULL DEFAULT '',",
      "  edge_relation TEXT NOT NULL DEFAULT '',",
      "  t INTEGER,",
      "  reason TEXT,",
      "  PRIMARY KEY (city_slug, target_kind, node_id, edge_source, edge_target, edge_relation)",
      ")",
    ].join("\n"),
    // Canonical-column indexes: type-scoped scans, tenancy filter, temporal overlap.
    `CREATE INDEX IF NOT EXISTS graph_nodes_city_type_idx ON ${NODE_TABLE} (city_slug, type)`,
    `CREATE INDEX IF NOT EXISTS graph_nodes_city_owner_idx ON ${NODE_TABLE} (city_slug, principal_owner)`,
    `CREATE INDEX IF NOT EXISTS graph_nodes_city_scope_idx ON ${NODE_TABLE} (city_slug, scope)`,
    `CREATE INDEX IF NOT EXISTS graph_nodes_city_t_idx ON ${NODE_TABLE} (city_slug, t)`,
    `CREATE INDEX IF NOT EXISTS graph_nodes_city_tend_idx ON ${NODE_TABLE} (city_slug, t_end)`,
    // Neighbour-JOIN + temporal indexes for edges.
    `CREATE INDEX IF NOT EXISTS graph_edges_city_source_idx ON ${EDGE_TABLE} (city_slug, source_id)`,
    `CREATE INDEX IF NOT EXISTS graph_edges_city_target_idx ON ${EDGE_TABLE} (city_slug, target_id)`,
    `CREATE INDEX IF NOT EXISTS graph_edges_city_t_idx ON ${EDGE_TABLE} (city_slug, t)`,
    // Fold-out lookup indexes: node exclusion + edge-triple exclusion, per city.
    `CREATE INDEX IF NOT EXISTS graph_tombstones_node_idx ON ${TOMBSTONE_TABLE} (city_slug, target_kind, node_id)`,
    `CREATE INDEX IF NOT EXISTS graph_tombstones_edge_idx ON ${TOMBSTONE_TABLE} (city_slug, target_kind, edge_source, edge_target, edge_relation)`,
  ];
}

// ---------------------------------------------------------------------------
// Config + public types
// ---------------------------------------------------------------------------

export interface SqliteGraphStoreConfig extends GraphStoreConfig {
  /** Path to the SQLite database file (or `:memory:`). Required. */
  target?: string;
}

export interface SqliteClearOptions {
  namespace?: string;
  force?: boolean;
}

export interface SqliteGraphStore extends GraphStore {
  clear(options?: string | SqliteClearOptions): Promise<void>;
  /** Inclusive temporal-overlap read over the indexed `t` / `t_end` columns. */
  queryWindow(
    fromMs: number,
    toMs: number,
    options?: GraphTimeWindowOptions,
  ): Promise<GraphTimeWindow>;
}

// ---------------------------------------------------------------------------
// Minimal structural types for the `better-sqlite3` surface we use (no static
// import — real types come from the injected/imported module; calques the neo4j
// adapter's lazy-driver typing).
// ---------------------------------------------------------------------------

interface SqliteRunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

interface SqliteStatement {
  run(...params: unknown[]): SqliteRunResult;
  get(...params: unknown[]): Record<string, unknown> | undefined;
  all(...params: unknown[]): Array<Record<string, unknown>>;
}

interface SqliteDatabase {
  prepare(source: string): SqliteStatement;
  exec(source: string): SqliteDatabase;
  pragma(source: string, options?: { simple?: boolean }): unknown;
  transaction<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R;
  close(): void;
}

interface SqliteDatabaseConstructor {
  new (filename: string, options?: Record<string, unknown>): SqliteDatabase;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a SQLite GraphStore. The driver module is supplied by the registry's
 * lazy import (production) or by `deps.driverModule` (tests). The file path is
 * read from `config.target`.
 */
export async function createSqliteGraphStore(
  config: SqliteGraphStoreConfig,
  deps?: StoreTestDeps,
): Promise<SqliteGraphStore> {
  const target = config.target;
  if (!target) {
    throw new Error("sqlite store requires config.target (path of the SQLite database file)");
  }

  // Resolve the driver from injected deps or a dynamic import (the registry does
  // the import in production; this fallback supports direct/live use). The
  // specifier is built at runtime so the compiler never resolves the (absent)
  // package — mirror of postgres.ts.
  let sqliteMod: Record<string, unknown>;
  if (deps?.driverModule !== undefined) {
    sqliteMod = deps.driverModule as Record<string, unknown>;
  } else {
    try {
      const driverPackage = ["better", "sqlite3"].join("-");
      sqliteMod = (await import(driverPackage)) as Record<string, unknown>;
    } catch {
      throw new Error("store 'sqlite' requires better-sqlite3. Run: npm install better-sqlite3");
    }
  }

  const DatabaseCtor = (sqliteMod.default ?? sqliteMod) as SqliteDatabaseConstructor;
  if (typeof DatabaseCtor !== "function") {
    throw new Error("store 'sqlite' requires better-sqlite3. Run: npm install better-sqlite3");
  }

  const db = new DatabaseCtor(target);
  // Durability + concurrency posture (dossier §4.4): WAL + FULL synchronise every
  // commit, foreign_keys ON, and a busy_timeout as a fuse (never the nominal
  // mechanism — the local server serialises the memory commands). NOTE: the
  // WAL-reset bug requires a runtime SQLite >= 3.51.3 (or backport 3.44.6 /
  // 3.50.7); enforcing that version at runtime is a DEFERRED verification item.
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = FULL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  const citySlug = deriveCitySlug(config);
  let closed = false;
  let schemaEnsured = false;

  // Local snapshot cache: the fake driver in unit tests returns empty rows, so
  // this is the read-back source there; against a real file the meta is also
  // persisted as a graph_meta row and re-read from it.
  const localMeta = new Map<string, GraphStoreSnapshotMeta>();

  // -------------------------------------------------------------------------
  // Schema (ensure-exists, idempotent)
  // -------------------------------------------------------------------------

  function ensureSchema(): void {
    if (schemaEnsured) return;
    schemaEnsured = true;
    for (const stmt of sqliteDdlStatements()) db.exec(stmt);
  }

  // -------------------------------------------------------------------------
  // Row builders — one flat value array per row, in column order.
  // -------------------------------------------------------------------------

  function nodeValues(
    slug: string,
    id: string,
    a: Record<string, unknown>,
    community: number | null,
  ): unknown[] {
    return [
      slug,
      id,
      typeof a.label === "string" ? a.label : id,
      resolveNodeType(a),
      community,
      typeof a.principal_owner === "string" ? a.principal_owner : null,
      typeof a.scope === "string" ? a.scope : null,
      temporalValue(a.t),
      temporalValue(a.t_end),
      JSON.stringify(buildPropsBag(a, NODE_SCHEMA_COLS)),
    ];
  }

  function edgeValues(
    slug: string,
    source: string,
    target: string,
    a: Record<string, unknown>,
  ): unknown[] {
    return [
      slug,
      source,
      target,
      typeof a.relation === "string" ? a.relation : "RELATES_TO",
      typeof a.confidence === "string" ? a.confidence : "EXTRACTED",
      temporalValue(a.t),
      temporalValue(a.t_end),
      JSON.stringify(buildPropsBag(a, EDGE_SCHEMA_COLS)),
    ];
  }

  // -------------------------------------------------------------------------
  // SQL builders — single-row upsert (the idiomatic better-sqlite3 pattern:
  // prepare once, run per row inside a transaction, which sidesteps the bind-
  // variable ceiling entirely).
  // -------------------------------------------------------------------------

  function buildUpsertSql(table: string, columns: string[], conflictCols: string[]): string {
    const placeholders = columns.map(() => "?").join(", ");
    const setClause = columns
      .filter((c) => !conflictCols.includes(c))
      .map((c) => `${c} = excluded.${c}`)
      .join(", ");
    return (
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders}) ` +
      `ON CONFLICT (${conflictCols.join(", ")}) DO UPDATE SET ${setClause}`
    );
  }

  const NODE_UPSERT_SQL = buildUpsertSql(NODE_TABLE, NODE_COLUMNS, ["city_slug", "id"]);
  const EDGE_UPSERT_SQL = buildUpsertSql(EDGE_TABLE, EDGE_COLUMNS, [
    "city_slug",
    "source_id",
    "target_id",
    "relation",
  ]);
  const NODE_EXISTS_SQL = `SELECT 1 AS x FROM ${NODE_TABLE} WHERE city_slug = ? AND id = ? LIMIT 1`;

  // -------------------------------------------------------------------------
  // Tombstone fold-out (dossier §1.3, §3.5) — NOT EXISTS predicates, appended to
  // every structured read (mirror of postgres.ts). They reference the NAMED
  // `@city` bind so the same value is reused verbatim across sub-queries without
  // any positional bookkeeping.
  // -------------------------------------------------------------------------

  /** SQL: the node at `nodeIdExpr` is NOT tombstoned. */
  function nodeLiveClause(nodeIdExpr: string): string {
    return (
      `NOT EXISTS (SELECT 1 FROM ${TOMBSTONE_TABLE} ts ` +
      `WHERE ts.city_slug = @city AND ts.target_kind = 'node' ` +
      `AND ts.node_id = ${nodeIdExpr})`
    );
  }

  /** SQL: the edge at alias `e` is NOT tombstoned — neither its own triple nor
   *  either endpoint (an erased endpoint folds its incident edges out too). */
  function edgeLiveClause(e: string): string {
    return (
      `NOT EXISTS (SELECT 1 FROM ${TOMBSTONE_TABLE} ts WHERE ts.city_slug = @city ` +
      `AND ts.target_kind = 'edge' AND ts.edge_source = ${e}.source_id ` +
      `AND ts.edge_target = ${e}.target_id AND ts.edge_relation = ${e}.relation) ` +
      `AND ${nodeLiveClause(`${e}.source_id`)} ` +
      `AND ${nodeLiveClause(`${e}.target_id`)}`
    );
  }

  function deleteCityRows(table: string, slug: string): void {
    db.prepare(`DELETE FROM ${table} WHERE city_slug = ?`).run(slug);
  }

  function writeMeta(topologySignature: string, toolVersion: string, pushedAt: string): void {
    db.prepare(
      `INSERT INTO ${META_TABLE} (city_slug, topology_signature, pushed_at, tool_version) ` +
        `VALUES (?, ?, ?, ?) ` +
        `ON CONFLICT (city_slug) DO UPDATE SET ` +
        `topology_signature = excluded.topology_signature, ` +
        `pushed_at = excluded.pushed_at, ` +
        `tool_version = excluded.tool_version`,
    ).run(citySlug, topologySignature, pushedAt, toolVersion);
    localMeta.set(citySlug, { topologySignature, pushedAt, toolVersion });
  }

  function readMetaFromBackend(): GraphStoreSnapshotMeta | undefined {
    const row = db
      .prepare(
        `SELECT topology_signature, pushed_at, tool_version FROM ${META_TABLE} ` +
          `WHERE city_slug = ? LIMIT 1`,
      )
      .get(citySlug);
    if (!row) return undefined;
    const sig = row.topology_signature;
    if (typeof sig !== "string" || !sig) return undefined;
    return {
      topologySignature: sig,
      pushedAt: typeof row.pushed_at === "string" ? row.pushed_at : new Date().toISOString(),
      toolVersion: typeof row.tool_version === "string" ? row.tool_version : "unknown",
    };
  }

  // -------------------------------------------------------------------------
  // GraphStore implementation (narrow v1 surface)
  // -------------------------------------------------------------------------

  return {
    id: "sqlite",
    capabilities: {
      push: true,
      // NO raw SQL on the memory path — arbitrary SQL could bypass the tombstone
      // fold-out (dossier §1.1, §1.4). `query` is deliberately absent.
      query: false,
      clear: true,
      snapshotMeta: true,
      // Indexed temporal-overlap reader over the typed t / t_end columns.
      queryWindow: true,
      // Incremental append + append-only tombstone erasure (D5 §5/§3.5). Declared
      // with the three methods (M4): sqlite upserts element-by-element and folds
      // tombstones out of every read, so it never no-ops silently.
      append: {
        version: 1,
        upsert: true,
        requiresExistingEndpoints: true,
        tombstone: true,
      },
      // Read-back for the agent-memory operational slice. Declared with the three
      // methods (M4): sqlite reads what the append path wrote and folds tombstones
      // out of every read-back, so it never no-ops.
      readback: { version: 1, tombstoneFolded: true },
      // aggregate / window are ABSENT until a tested parity exists (dossier §1.4) —
      // never a present-but-no-op method.
    },

    async verifyConnection(): Promise<void> {
      db.prepare("SELECT 1 AS ok").get();
    },

    async pushGraph(
      G: Graph,
      communities: Map<number, string[]>,
      options: GraphPushOptions = {},
    ): Promise<GraphPushResult> {
      const start = Date.now();
      const mode = options.mode ?? "merge";
      const nodeCount = G.order;
      const edgeCount = G.size;

      if (options.dryRun) {
        return { nodes: nodeCount, edges: edgeCount, warnings: [], durationMs: Date.now() - start };
      }

      ensureSchema();

      const communityMap = buildNodeCommunityMap(communities);
      const nodeRows: unknown[][] = [];
      G.forEachNode((nodeId, attrs) => {
        const a = attrs as Record<string, unknown>;
        const community =
          communityMap.get(nodeId) ?? (typeof a.community === "number" ? a.community : null);
        nodeRows.push(nodeValues(citySlug, nodeId, a, community));
      });
      const edgeRows: unknown[][] = [];
      G.forEachEdge((_edgeKey, attrs, source, target) => {
        edgeRows.push(edgeValues(citySlug, source, target, attrs as Record<string, unknown>));
      });

      const nodeUpsert = db.prepare(NODE_UPSERT_SQL);
      const edgeUpsert = db.prepare(EDGE_UPSERT_SQL);

      // One transaction per push so a backend error leaves the previous snapshot
      // intact (SPEC: "the push aborts"). Tombstones survive a replace (they are
      // never deleted here) — the erasure journal is append-only.
      const runPush = db.transaction(() => {
        if (mode === "replace") {
          deleteCityRows(NODE_TABLE, citySlug);
          deleteCityRows(EDGE_TABLE, citySlug);
        }
        for (const row of nodeRows) nodeUpsert.run(...row);
        for (const row of edgeRows) edgeUpsert.run(...row);
        writeMeta(computeTopologySignature(G), resolveToolVersion(), new Date().toISOString());
      });
      runPush();

      return { nodes: nodeCount, edges: edgeCount, warnings: [], durationMs: Date.now() - start };
    },

    async readSnapshotMeta(): Promise<GraphStoreSnapshotMeta | undefined> {
      if (localMeta.has(citySlug)) return localMeta.get(citySlug);
      ensureSchema();
      return readMetaFromBackend();
    },

    async queryWindow(
      fromMs: number,
      toMs: number,
      options: GraphTimeWindowOptions = {},
    ): Promise<GraphTimeWindow> {
      // Validate before ensureSchema() so invalid caller input performs no I/O.
      if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
        throw new RangeError("queryWindow bounds must be finite numbers");
      }
      if (fromMs > toMs) {
        throw new RangeError("queryWindow requires fromMs <= toMs");
      }

      ensureSchema();
      const slug = options.namespace ?? citySlug;
      const bind = { city: slug, from: fromMs, to: toMs };

      // Overlap over the typed t / t_end columns: `t` finite and <= to; a present
      // t_end must be >= t and >= from (missing t_end is open-ended). Tombstoned
      // nodes/edges fold out (nodeLiveClause / edgeLiveClause).
      const nodeRows = db
        .prepare(
          `SELECT n.id, n.label, n.type, n.community, n.principal_owner, n.scope, n.t, n.t_end, n.props ` +
            `FROM ${NODE_TABLE} n ` +
            `WHERE n.city_slug = @city ` +
            `AND ${nodeLiveClause("n.id")} ` +
            `AND n.t IS NOT NULL AND n.t <= @to ` +
            `AND (n.t_end IS NULL OR (n.t_end >= n.t AND n.t_end >= @from)) ` +
            `ORDER BY n.t ASC, n.id ASC`,
        )
        .all(bind);

      const edgeRows = db
        .prepare(
          `SELECT e.source_id, e.target_id, e.relation, e.confidence, e.t, e.t_end, e.props ` +
            `FROM ${EDGE_TABLE} e ` +
            `WHERE e.city_slug = @city ` +
            `AND ${edgeLiveClause("e")} ` +
            `AND e.t IS NOT NULL AND e.t <= @to ` +
            `AND (e.t_end IS NULL OR (e.t_end >= e.t AND e.t_end >= @from)) ` +
            `ORDER BY e.t ASC, e.source_id ASC, e.target_id ASC, e.relation ASC`,
        )
        .all(bind);

      return {
        nodes: nodeRows.map(temporalNodeFromRow),
        edges: edgeRows.map(temporalEdgeFromRow),
      };
    },

    async appendNode(
      node: GraphNodeInput,
      options: GraphAppendOptions = {},
    ): Promise<GraphAppendOutcome> {
      ensureSchema();
      const slug = options.namespace ?? citySlug;
      const a = node as Record<string, unknown>;
      const community = typeof node.community === "number" ? node.community : null;
      const row = nodeValues(slug, node.id, a, community);
      const exists = db.prepare(NODE_EXISTS_SQL);
      const upsert = db.prepare(NODE_UPSERT_SQL);
      // created = the primary key did not exist. The check + upsert run in one
      // transaction so `created` is race-free within the (serialised) writer.
      const created = db.transaction((): boolean => {
        const before = exists.get(slug, node.id) !== undefined;
        upsert.run(...row);
        return !before;
      })();
      return { created };
    },

    async appendEdge(
      edge: GraphEdgeInput,
      options: GraphAppendOptions = {},
    ): Promise<GraphAppendOutcome> {
      ensureSchema();
      const slug = options.namespace ?? citySlug;
      // Strict referential integrity (requiresExistingEndpoints): both endpoints
      // must already exist. A dangling edge fails loud rather than being written.
      const exists = db.prepare(NODE_EXISTS_SQL);
      const missing = [edge.source, edge.target].filter(
        (id) => exists.get(slug, id) === undefined,
      );
      if (missing.length > 0) {
        throw new Error(
          `appendEdge: endpoint node(s) ${missing.join(", ")} do not exist — a dangling ` +
            "edge is refused (requiresExistingEndpoints). Append the node(s) first.",
        );
      }
      const a = edge as Record<string, unknown>;
      const relation = typeof edge.relation === "string" ? edge.relation : "RELATES_TO";
      const row = edgeValues(slug, edge.source, edge.target, a);
      const edgeExists = db.prepare(
        `SELECT 1 AS x FROM ${EDGE_TABLE} WHERE city_slug = ? AND source_id = ? ` +
          `AND target_id = ? AND relation = ? LIMIT 1`,
      );
      const upsert = db.prepare(EDGE_UPSERT_SQL);
      const created = db.transaction((): boolean => {
        const before =
          edgeExists.get(slug, edge.source, edge.target, relation) !== undefined;
        upsert.run(...row);
        return !before;
      })();
      return { created };
    },

    async appendTombstone(
      tombstone: GraphTombstoneInput,
      options: GraphAppendOptions = {},
    ): Promise<GraphTombstoneOutcome> {
      ensureSchema();
      const slug = options.namespace ?? citySlug;
      const targetT = tombstone.target;
      const nodeId = targetT.kind === "node" ? targetT.id : "";
      const edgeSource = targetT.kind === "edge" ? targetT.source : "";
      const edgeTarget = targetT.kind === "edge" ? targetT.target : "";
      const edgeRelation =
        targetT.kind === "edge"
          ? typeof targetT.relation === "string"
            ? targetT.relation
            : "RELATES_TO"
          : "";
      const t =
        typeof tombstone.t === "number" && Number.isFinite(tombstone.t) ? tombstone.t : null;
      const reason = typeof tombstone.reason === "string" ? tombstone.reason : null;
      // Append-only erasure: ON CONFLICT DO NOTHING makes a re-tombstone idempotent.
      // `changes` is 1 only when a NEW tombstone row was inserted (key was absent) —
      // applied=true if a fresh tombstone was journaled, false if the same key was
      // already present (dossier §1.3; the target is excluded from reads either way).
      const info = db
        .prepare(
          `INSERT INTO ${TOMBSTONE_TABLE} ` +
            `(city_slug, target_kind, node_id, edge_source, edge_target, edge_relation, t, reason) ` +
            `VALUES (?, ?, ?, ?, ?, ?, ?, ?) ` +
            `ON CONFLICT (city_slug, target_kind, node_id, edge_source, edge_target, edge_relation) ` +
            `DO NOTHING`,
        )
        .run(slug, targetT.kind, nodeId, edgeSource, edgeTarget, edgeRelation, t, reason);
      return { applied: info.changes > 0 };
    },

    // -----------------------------------------------------------------------
    // Read-back — the read mirror of the append path. Every node read-back folds
    // tombstones out (nodeLiveClause), so an erased memory note never surfaces,
    // consistent with the append erasure path (dossier §1.3, §3.5).
    // -----------------------------------------------------------------------

    async loadNode(
      id: string,
      options: GraphAppendOptions = {},
    ): Promise<GraphNodeRecord | null> {
      ensureSchema();
      const slug = options.namespace ?? citySlug;
      const row = db
        .prepare(
          `SELECT n.id, n.label, n.type, n.community, n.principal_owner, n.scope, n.t, n.t_end, n.props ` +
            `FROM ${NODE_TABLE} n ` +
            `WHERE n.city_slug = @city AND n.id = @id AND ${nodeLiveClause("n.id")} ` +
            `LIMIT 1`,
        )
        .get({ city: slug, id });
      return row ? nodeRecordFromRow(row) : null;
    },

    async listMemoryNotes(
      query: MemoryNoteListQuery = {},
      options: GraphAppendOptions = {},
    ): Promise<GraphNodeRecord[]> {
      ensureSchema();
      const slug = options.namespace ?? citySlug;
      const bind: Record<string, unknown> = { city: slug };
      // node_type is stored in the typed `type` column, so a MemoryNote is
      // `type = 'MemoryNote'`. nodeLiveClause reuses @city (fold-out).
      const clauses: string[] = [
        `n.city_slug = @city`,
        `n.type = 'MemoryNote'`,
        nodeLiveClause("n.id"),
      ];
      // Tenancy VISIBILITY superset: shared (capitalised) OR owned by the requester —
      // read from the TYPED columns (scope / principal_owner). recall re-applies the
      // authoritative filter, so this only narrows the scan.
      if (typeof query.principalOwner === "string" && query.principalOwner.length > 0) {
        bind.principal = query.principalOwner;
        clauses.push(`(n.scope = 'capitalised' OR n.principal_owner = @principal)`);
      }
      if (query.scopes && query.scopes.length > 0) {
        const keys = query.scopes.map((s, i) => {
          const key = `scope${i}`;
          bind[key] = s;
          return `@${key}`;
        });
        clauses.push(`n.scope IN (${keys.join(", ")})`);
      }
      // Time-window overlap over the typed t / t_end columns (mirrors queryWindow),
      // applied only when a bound is supplied.
      const hasSince = typeof query.sinceMs === "number" && Number.isFinite(query.sinceMs);
      const hasUntil = typeof query.untilMs === "number" && Number.isFinite(query.untilMs);
      if (hasSince || hasUntil) {
        clauses.push(`n.t IS NOT NULL`);
        if (hasUntil) {
          bind.until = query.untilMs;
          clauses.push(`n.t <= @until`);
        }
        let sinceClause = "";
        if (hasSince) {
          bind.since = query.sinceMs;
          sinceClause = ` AND n.t_end >= @since`;
        }
        clauses.push(`(n.t_end IS NULL OR (n.t_end >= n.t${sinceClause}))`);
      }
      const rows = db
        .prepare(
          `SELECT n.id, n.label, n.type, n.community, n.principal_owner, n.scope, n.t, n.t_end, n.props ` +
            `FROM ${NODE_TABLE} n WHERE ${clauses.join(" AND ")} ORDER BY n.id ASC`,
        )
        .all(bind);
      return rows.map(nodeRecordFromRow);
    },

    async loadTombstones(
      options: GraphAppendOptions = {},
    ): Promise<GraphTombstoneRecord[]> {
      ensureSchema();
      const slug = options.namespace ?? citySlug;
      const rows = db
        .prepare(
          `SELECT target_kind, node_id, edge_source, edge_target, edge_relation, t, reason ` +
            `FROM ${TOMBSTONE_TABLE} WHERE city_slug = @city ` +
            `ORDER BY target_kind ASC, node_id ASC, edge_source ASC, edge_target ASC, edge_relation ASC`,
        )
        .all({ city: slug });
      return rows.map(tombstoneRecordFromRow);
    },

    async clear(options?: string | SqliteClearOptions): Promise<void> {
      const opts = typeof options === "string" ? { namespace: options } : options ?? {};
      if (!opts.force) {
        throw new Error(
          `refusing to clear sqlite city_slug '${citySlug}'; pass { force: true } to delete`,
        );
      }
      ensureSchema();
      const targetSlug = opts.namespace ?? citySlug;
      const runClear = db.transaction(() => {
        deleteCityRows(NODE_TABLE, targetSlug);
        deleteCityRows(EDGE_TABLE, targetSlug);
        deleteCityRows(META_TABLE, targetSlug);
        deleteCityRows(TOMBSTONE_TABLE, targetSlug);
      });
      runClear();
      localMeta.delete(targetSlug);
    },

    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      db.close();
    },
  };
}
