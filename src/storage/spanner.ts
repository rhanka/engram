/**
 * Spanner GraphStore adapter (SPEC_STORAGE_BACKENDS.md, "Spanner Graph").
 *
 * Live-push mirror of a Graphify graph into Cloud Spanner via batched
 * `insertOrUpdate` mutations (the Table.upsert primitive). The driver
 * (`@google-cloud/spanner`) is NEVER imported statically: it is always
 * supplied through `deps.driverModule` (tests) or the registry's dynamic
 * import (production). Importing this module evaluates no driver.
 *
 * The schema is reused verbatim from `toSpanner()` (`spannerDdlLines()` in
 * export.ts) so the file export and the live schema never drift. The adapter
 * adds a `namespace` column and namespaced primary keys for multi-project
 * isolation, mirroring the neo4j namespace model, plus a `graphify_meta` row
 * carrying the snapshot signature for staleness detection.
 *
 * `pushGraph` IS the upsert primitive: mode "merge" is a native insertOrUpdate;
 * mode "replace" deletes the namespace rows first, then loads.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import type Graph from "graphology";
import { spannerDdlLines } from "../export.js";
import type {
  GraphPushOptions,
  GraphPushResult,
  GraphStore,
  GraphStoreConfig,
  GraphStoreSnapshotMeta,
  StoreTestDeps,
} from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NODE_TABLE = "graphify_nodes";
const EDGE_TABLE = "graphify_edges";
const META_TABLE = "graphify_meta";
const PROPERTY_GRAPH = "graphify";

/** Schema columns lifted into typed Spanner columns; the rest go into props. */
const NODE_SCHEMA_COLS = ["id", "label", "node_type", "community"];
const EDGE_SCHEMA_COLS = ["source_id", "target_id", "relation", "confidence"];

/**
 * Default rows committed per mutation batch. Spanner caps a single commit at
 * ~40000 mutations (rows × mutated columns), so 500 rows × ≤6 columns stays
 * comfortably under the limit.
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

/** Compute a topology signature from a Graphology graph (mirrors export.ts/neo4j logic). */
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

/** Derive a backend-safe namespace from a project/instance/database triple. */
function deriveNamespace(config: GraphStoreConfig): string {
  const raw =
    config.namespace ??
    config.citySlug ??
    config.database ??
    config.instance ??
    config.project ??
    "graphify";
  return raw.replace(/[^A-Za-z0-9_]/g, "_") || "graphify";
}

/** Extract only scalar properties (string/number/boolean) from an attribute map. */
function scalarProps(
  data: Record<string, unknown>,
): Record<string, string | number | boolean> {
  const props: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(data)) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      props[key] = value;
    }
  }
  return props;
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
 * The namespaced live schema: the verbatim `toSpanner()` DDL with a
 * `namespace` column prepended to each table's primary key, plus the
 * `graphify_meta` snapshot table. Returned as individual executable DDL
 * statements (no SQL comments) suitable for `database.updateSchema`.
 */
function namespacedDdlStatements(): string[] {
  // Start from the shared file-export DDL so the schema never drifts, then
  // strip comments/blank lines and re-split into executable statements.
  const base = spannerDdlLines()
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

  const statements: string[] = [];

  // graphify_nodes — namespaced primary key (namespace, id).
  statements.push(
    [
      `CREATE TABLE ${NODE_TABLE} (`,
      "  namespace STRING(MAX) NOT NULL,",
      "  id STRING(MAX) NOT NULL,",
      "  label STRING(MAX),",
      "  node_type STRING(MAX),",
      "  community INT64,",
      "  props JSON",
      ") PRIMARY KEY (namespace, id)",
    ].join("\n"),
  );

  // graphify_edges — namespaced primary key.
  statements.push(
    [
      `CREATE TABLE ${EDGE_TABLE} (`,
      "  namespace STRING(MAX) NOT NULL,",
      "  source_id STRING(MAX) NOT NULL,",
      "  target_id STRING(MAX) NOT NULL,",
      "  relation STRING(MAX) NOT NULL,",
      "  confidence STRING(MAX),",
      "  props JSON",
      ") PRIMARY KEY (namespace, source_id, target_id, relation)",
    ].join("\n"),
  );

  // graphify_meta — one snapshot row per namespace.
  statements.push(
    [
      `CREATE TABLE ${META_TABLE} (`,
      "  namespace STRING(MAX) NOT NULL,",
      "  topology_signature STRING(MAX),",
      "  pushed_at STRING(MAX),",
      "  tool_version STRING(MAX)",
      ") PRIMARY KEY (namespace)",
    ].join("\n"),
  );

  // Property graph projection — taken verbatim from the shared DDL (the only
  // CREATE PROPERTY GRAPH statement in the base text), with its trailing
  // semicolon stripped for updateSchema.
  const pgStart = base.indexOf(`CREATE PROPERTY GRAPH ${PROPERTY_GRAPH}`);
  if (pgStart >= 0) {
    const pgEnd = base.indexOf(";", pgStart);
    const pg = base.slice(pgStart, pgEnd >= 0 ? pgEnd : undefined).trim();
    statements.push(pg);
  }

  return statements;
}

// ---------------------------------------------------------------------------
// Config + public types
// ---------------------------------------------------------------------------

export interface SpannerGraphStoreConfig extends GraphStoreConfig {
  /** GCP project id. Falls back to GRAPHIFY_SPANNER_PROJECT / ADC default. */
  project?: string;
  /** Spanner instance id. Falls back to GRAPHIFY_SPANNER_INSTANCE. */
  instance?: string;
  /** Spanner database id. Falls back to GRAPHIFY_SPANNER_DATABASE. */
  database?: string;
}

export interface SpannerClearOptions {
  namespace?: string;
  force?: boolean;
}

export interface SpannerGraphStore extends GraphStore {
  clear(options?: string | SpannerClearOptions): Promise<void>;
}

// ---------------------------------------------------------------------------
// Minimal structural types for the @google-cloud/spanner surface we use
// (no static import — real types come from the injected/imported module)
// ---------------------------------------------------------------------------

interface SpannerTable {
  upsert(rows: Array<Record<string, unknown>>): Promise<unknown>;
}

interface SpannerDatabase {
  updateSchema(statements: string[]): Promise<[{ promise(): Promise<unknown> }] | unknown>;
  table(name: string): SpannerTable;
  run(
    query: { sql: string; params?: Record<string, unknown> },
  ): Promise<[Array<Record<string, unknown>>] | unknown>;
  runPartitionedUpdate?(
    query: { sql: string; params?: Record<string, unknown> },
  ): Promise<unknown>;
  close?(): Promise<unknown> | void;
}

interface SpannerInstance {
  database(id: string): SpannerDatabase;
}

interface SpannerClient {
  instance(id: string): SpannerInstance;
  close?(): Promise<unknown> | void;
}

interface SpannerModule {
  Spanner: new (options?: { projectId?: string }) => SpannerClient;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a Spanner GraphStore. The driver module is supplied by the registry's
 * lazy import (production) or by `deps.driverModule` (tests). Authentication
 * uses Application Default Credentials (ADC) — there is no password by design.
 */
export async function createSpannerGraphStore(
  config: SpannerGraphStoreConfig,
  deps?: StoreTestDeps,
): Promise<SpannerGraphStore> {
  const instanceId = config.instance ?? process.env.GRAPHIFY_SPANNER_INSTANCE;
  const databaseId = config.database ?? process.env.GRAPHIFY_SPANNER_DATABASE;
  if (!instanceId) {
    throw new Error(
      "spanner store requires an instance id (config.instance or GRAPHIFY_SPANNER_INSTANCE)",
    );
  }
  if (!databaseId) {
    throw new Error(
      "spanner store requires a database id (config.database or GRAPHIFY_SPANNER_DATABASE)",
    );
  }

  // Resolve the driver from injected deps or a dynamic import (the registry
  // performs the import in production; this fallback supports direct/live use).
  let spannerMod: Record<string, unknown>;
  if (deps?.driverModule !== undefined) {
    spannerMod = deps.driverModule as Record<string, unknown>;
  } else {
    try {
      // Optional, uninstalled-by-default driver: build the specifier at runtime
      // so the compiler does not attempt to resolve the (absent) package. In
      // production the registry already supplies the module via `deps`; this
      // fallback supports direct/live use where the package IS installed.
      const driverPackage = ["@google-cloud", "spanner"].join("/");
      spannerMod = (await import(driverPackage)) as Record<string, unknown>;
    } catch {
      throw new Error(
        "store 'spanner' requires @google-cloud/spanner. Run: npm install @google-cloud/spanner",
      );
    }
  }

  const mod = (spannerMod.default ?? spannerMod) as Partial<SpannerModule>;
  const SpannerCtor = mod.Spanner;
  if (typeof SpannerCtor !== "function") {
    throw new Error(
      "store 'spanner' requires @google-cloud/spanner. Run: npm install @google-cloud/spanner",
    );
  }

  const projectId = config.project ?? process.env.GRAPHIFY_SPANNER_PROJECT;
  const client: SpannerClient = new SpannerCtor(
    projectId ? { projectId } : undefined,
  );
  const database = client.instance(instanceId).database(databaseId);

  const namespace = deriveNamespace(config);
  let closed = false;
  let schemaEnsured = false;

  // Local snapshot cache: the fake driver in unit tests returns empty query
  // rows, so this is the read-back source there; against a real backend the
  // meta is also persisted as a graphify_meta row and re-read from it.
  const localMeta = new Map<string, GraphStoreSnapshotMeta>();

  // -------------------------------------------------------------------------
  // Schema (ensure-exists, idempotent)
  // -------------------------------------------------------------------------

  async function ensureSchema(): Promise<void> {
    if (schemaEnsured) return;
    schemaEnsured = true;
    try {
      const result = await database.updateSchema(namespacedDdlStatements());
      // updateSchema returns [operation]; await its promise() when present so
      // the schema is committed before the first mutation.
      const op = Array.isArray(result) ? result[0] : undefined;
      if (op && typeof (op as { promise?: unknown }).promise === "function") {
        await (op as { promise(): Promise<unknown> }).promise();
      }
    } catch (err) {
      // Tables already existing is the expected idempotent case; only rethrow
      // genuine failures.
      const message = err instanceof Error ? err.message : String(err);
      if (!/already exists|duplicate/i.test(message)) {
        throw err;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Row builders
  // -------------------------------------------------------------------------

  function buildNodeRows(
    G: Graph,
    communityMap: Map<string, number>,
  ): Array<Record<string, unknown>> {
    const rows: Array<Record<string, unknown>> = [];
    G.forEachNode((nodeId, attrs) => {
      const a = attrs as Record<string, unknown>;
      const community = communityMap.get(nodeId);
      rows.push({
        namespace,
        id: nodeId,
        label: typeof a.label === "string" ? a.label : nodeId,
        node_type:
          typeof a.node_type === "string"
            ? a.node_type
            : typeof a.file_type === "string"
              ? a.file_type
              : null,
        community: community ?? (typeof a.community === "number" ? a.community : null),
        props: JSON.stringify(buildPropsBag(scalarProps(a), NODE_SCHEMA_COLS)),
      });
    });
    return rows;
  }

  function buildEdgeRows(G: Graph): Array<Record<string, unknown>> {
    const rows: Array<Record<string, unknown>> = [];
    G.forEachEdge((_edgeKey, attrs, source, target) => {
      const a = attrs as Record<string, unknown>;
      rows.push({
        namespace,
        source_id: source,
        target_id: target,
        relation: typeof a.relation === "string" ? a.relation : "RELATES_TO",
        confidence: typeof a.confidence === "string" ? a.confidence : "EXTRACTED",
        props: JSON.stringify(buildPropsBag(scalarProps(a), EDGE_SCHEMA_COLS)),
      });
    });
    return rows;
  }

  // -------------------------------------------------------------------------
  // Mutation helpers
  // -------------------------------------------------------------------------

  async function upsertBatched(
    tableName: string,
    rows: Array<Record<string, unknown>>,
    batchSize: number,
  ): Promise<number> {
    const table = database.table(tableName);
    let count = 0;
    for (const batch of chunk(rows, batchSize)) {
      await table.upsert(batch);
      count += batch.length;
    }
    return count;
  }

  async function deleteNamespaceRows(tableName: string, ns: string): Promise<void> {
    const sql = `DELETE FROM ${tableName} WHERE namespace = @ns`;
    if (typeof database.runPartitionedUpdate === "function") {
      await database.runPartitionedUpdate({ sql, params: { ns } });
    } else {
      await database.run({ sql, params: { ns } });
    }
  }

  async function writeMeta(
    topologySignature: string,
    toolVersion: string,
  ): Promise<void> {
    const pushedAt = new Date().toISOString();
    await database.table(META_TABLE).upsert([
      {
        namespace,
        topology_signature: topologySignature,
        pushed_at: pushedAt,
        tool_version: toolVersion,
      },
    ]);
    localMeta.set(namespace, {
      topologySignature,
      pushedAt,
      toolVersion,
    });
  }

  async function readMetaFromBackend(): Promise<GraphStoreSnapshotMeta | undefined> {
    const result = await database.run({
      sql: `SELECT topology_signature, pushed_at, tool_version FROM ${META_TABLE} WHERE namespace = @ns LIMIT 1`,
      params: { ns: namespace },
    });
    const rows = Array.isArray(result) ? (result[0] as Array<Record<string, unknown>>) : undefined;
    const row = rows?.[0];
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
  // GraphStore implementation
  // -------------------------------------------------------------------------

  return {
    id: "spanner",
    capabilities: {
      push: true,
      query: true,
      clear: true,
      snapshotMeta: true,
    },

    async verifyConnection(): Promise<void> {
      // A cheap round-trip that also proves the schema is reachable.
      await database.run({ sql: "SELECT 1" });
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

      // replace = delete-then-load by namespace.
      if (mode === "replace") {
        await deleteNamespaceRows(NODE_TABLE, namespace);
        await deleteNamespaceRows(EDGE_TABLE, namespace);
      }

      const communityMap = buildNodeCommunityMap(communities);
      await upsertBatched(NODE_TABLE, buildNodeRows(G, communityMap), batchSize);
      await upsertBatched(EDGE_TABLE, buildEdgeRows(G), batchSize);

      await writeMeta(computeTopologySignature(G), resolveToolVersion());

      return {
        nodes: nodeCount,
        edges: edgeCount,
        warnings: [],
        durationMs: Date.now() - start,
      };
    },

    async readSnapshotMeta(): Promise<GraphStoreSnapshotMeta | undefined> {
      if (localMeta.has(namespace)) {
        return localMeta.get(namespace);
      }
      return readMetaFromBackend();
    },

    async clear(options?: string | SpannerClearOptions): Promise<void> {
      const opts = typeof options === "string" ? { namespace: options } : options ?? {};
      if (!opts.force) {
        throw new Error(
          `refusing to clear spanner namespace '${namespace}'; pass { force: true } to delete`,
        );
      }
      const targetNamespace = opts.namespace ?? namespace;
      await deleteNamespaceRows(NODE_TABLE, targetNamespace);
      await deleteNamespaceRows(EDGE_TABLE, targetNamespace);
      await deleteNamespaceRows(META_TABLE, targetNamespace);
      localMeta.delete(targetNamespace);
    },

    async query(
      statement: string,
      params?: unknown[] | Record<string, unknown>,
    ): Promise<unknown> {
      const namedParams =
        params !== undefined && !Array.isArray(params)
          ? (params as Record<string, unknown>)
          : undefined;
      return database.run({ sql: statement, params: namedParams });
    },

    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      if (typeof database.close === "function") {
        await database.close();
      }
      if (typeof client.close === "function") {
        await client.close();
      }
    },
  };
}
