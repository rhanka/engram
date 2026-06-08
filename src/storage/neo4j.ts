/**
 * Neo4j GraphStore adapter (SPEC_STORAGE_BACKENDS.md, "Neo4j Adapter (v1)").
 *
 * Creates a live-push mirror of a Graphify graph into Neo4j using batched
 * UNWIND statements. The driver is NEVER imported statically; it is always
 * supplied through `deps.driverModule` (tests) or the registry's dynamic
 * import mechanism (production).
 *
 * Helpers extracted from src/export.ts (neo4jLabel, neo4jRelation,
 * scalarProps) are re-exported from this module so the compat wrapper in
 * export.ts can continue to use them without duplicating them.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import type Graph from "graphology";
import type {
  GraphPushOptions,
  GraphPushResult,
  GraphStore,
  GraphStoreConfig,
  GraphStoreSnapshotMeta,
  StoreTestDeps,
} from "./types.js";

// ---------------------------------------------------------------------------
// Exported helpers (also used by the compat wrapper in export.ts)
// ---------------------------------------------------------------------------

/** Sanitize a Neo4j node label (interpolated into Cypher). */
export function neo4jLabel(label: string): string {
  const sanitized = label.replace(/[^A-Za-z0-9_]/g, "");
  return sanitized || "Entity";
}

/** Sanitize a Neo4j relationship type (interpolated into Cypher). */
export function neo4jRelation(relation: string): string {
  const sanitized = relation
    .toUpperCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^A-Z0-9_]/g, "_");
  return sanitized && /^[A-Z]/.test(sanitized) ? sanitized : "RELATED_TO";
}

/** Extract only scalar properties from a node/edge attribute map. */
export function scalarProps(
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

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveToolVersion(): string {
  for (const rel of [join("..", ".."), ".."]) {
    try {
      const pkg = JSON.parse(
        readFileSync(join(__dirname, rel, "package.json"), "utf-8"),
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

/** Compute a topology signature from a Graphology graph (mirrors export.ts logic). */
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

/** Derive a namespace from a target URI when the caller provides none. */
function deriveNamespace(target: string): string {
  try {
    const url = new URL(target);
    return url.hostname.replace(/[^A-Za-z0-9_]/g, "_") || "graphify";
  } catch {
    return "graphify";
  }
}

/** Chunk an array into subarrays of at most `size` elements. */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Extended config for the Neo4j adapter
// ---------------------------------------------------------------------------

export interface Neo4jGraphStoreConfig extends GraphStoreConfig {
  /** URI to the Neo4j instance, e.g. bolt://localhost:7687. Required. */
  target: string;
  /** Neo4j username; defaults to "neo4j". */
  user?: string;
  /** Neo4j password; defaults to GRAPHIFY_NEO4J_PASSWORD env var or "". */
  password?: string;
  /** Neo4j database name; defaults to the server default. */
  database?: string;
}

// ---------------------------------------------------------------------------
// Extended clear options (force-gated, matching file.ts pattern)
// ---------------------------------------------------------------------------

export interface Neo4jClearOptions {
  namespace?: string;
  force?: boolean;
}

export interface Neo4jGraphStore extends GraphStore {
  clear(options?: string | Neo4jClearOptions): Promise<void>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a Neo4j GraphStore instance. The driver module is supplied by the
 * registry's lazy import mechanism (production) or test injection via
 * `deps.driverModule`.
 */
export async function createNeo4jGraphStore(
  config: Neo4jGraphStoreConfig,
  deps?: StoreTestDeps,
): Promise<Neo4jGraphStore> {
  if (!config.target) {
    throw new Error("neo4j store requires config.target (bolt URI)");
  }

  // Resolve driver from injected deps or from dynamic import (handled by
  // the registry before this factory is called in production).
  let neo4jMod: Record<string, unknown>;
  if (deps?.driverModule !== undefined) {
    neo4jMod = deps.driverModule as Record<string, unknown>;
  } else {
    // Fallback: attempt dynamic import (used when calling the factory
    // directly in live tests without going through the registry).
    try {
      neo4jMod = await import("neo4j-driver") as Record<string, unknown>;
    } catch {
      throw new Error(
        "store 'neo4j' requires neo4j-driver. Run: npm install neo4j-driver",
      );
    }
  }

  const neo4j = (neo4jMod.default ?? neo4jMod) as {
    driver(
      uri: string,
      auth: unknown,
      options?: Record<string, unknown>,
    ): Neo4jDriver;
    auth: {
      basic(user: string, password: string): unknown;
    };
  };

  const password =
    config.password ??
    process.env.GRAPHIFY_NEO4J_PASSWORD ??
    "";
  const user = config.user ?? "neo4j";
  const namespace =
    config.namespace ?? deriveNamespace(config.target);

  const driver: Neo4jDriver = neo4j.driver(
    config.target,
    neo4j.auth.basic(user, password),
  );

  let closed = false;

  // In-memory meta store: keyed by namespace.
  // For the fake driver used in unit tests this is the source of truth.
  // For a real driver, the meta is written/read from the backend.
  const localMeta = new Map<string, GraphStoreSnapshotMeta>();

  // ---------------------------------------------------------------------------
  // Internal Cypher helpers
  // ---------------------------------------------------------------------------

  async function runStatement(
    session: Neo4jSession,
    text: string,
    params?: Record<string, unknown>,
  ): Promise<unknown> {
    return session.run(text, params ?? {});
  }

  async function pushNodes(
    session: Neo4jSession,
    G: Graph,
    communityMap: Map<string, number>,
    mode: "merge" | "replace",
    batchSize: number,
  ): Promise<number> {
    // Group nodes by label so each UNWIND batch is homogeneous.
    const byLabel = new Map<string, Array<Record<string, unknown>>>();

    G.forEachNode((nodeId, attrs) => {
      const raw = (attrs as Record<string, unknown>).file_type as string | undefined;
      const rawLabel = raw ?? "Entity";
      const capitalized =
        rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);
      const label = neo4jLabel(capitalized);

      const props = scalarProps(attrs as Record<string, unknown>);
      props.id = nodeId;
      props.namespace = namespace;

      const communityId = communityMap.get(nodeId);
      if (communityId !== undefined) {
        props.community = communityId;
      }

      if (!byLabel.has(label)) byLabel.set(label, []);
      byLabel.get(label)!.push(props);
    });

    let nodeCount = 0;
    for (const [label, rows] of byLabel) {
      for (const batch of chunk(rows, batchSize)) {
        if (mode === "merge") {
          await runStatement(
            session,
            `UNWIND $rows AS row MERGE (n:${label} {id: row.id, namespace: row.namespace}) SET n += row`,
            { rows: batch },
          );
        } else {
          await runStatement(
            session,
            `UNWIND $rows AS row MERGE (n:${label} {id: row.id, namespace: row.namespace}) SET n += row`,
            { rows: batch },
          );
        }
        nodeCount += batch.length;
      }
    }
    return nodeCount;
  }

  async function pushEdges(
    session: Neo4jSession,
    G: Graph,
    mode: "merge" | "replace",
    batchSize: number,
  ): Promise<number> {
    // Group edges by relation type for homogeneous UNWIND batches.
    const byRelation = new Map<string, Array<Record<string, unknown>>>();

    G.forEachEdge((_edgeKey, attrs, source, target) => {
      const relation = neo4jRelation(
        ((attrs as Record<string, unknown>).relation as string) ?? "RELATED_TO",
      );
      const props = scalarProps(attrs as Record<string, unknown>);
      props.namespace = namespace;

      const row = { source, target, props };
      if (!byRelation.has(relation)) byRelation.set(relation, []);
      byRelation.get(relation)!.push(row);
    });

    let edgeCount = 0;
    for (const [relation, rows] of byRelation) {
      for (const batch of chunk(rows, batchSize)) {
        await runStatement(
          session,
          `UNWIND $rows AS row MATCH (a {id: row.source, namespace: $ns}), (b {id: row.target, namespace: $ns}) MERGE (a)-[r:${relation}]->(b) SET r += row.props`,
          { rows: batch, ns: namespace },
        );
        edgeCount += batch.length;
      }
    }
    return edgeCount;
  }

  async function writeGraphifyMeta(
    session: Neo4jSession,
    topologySignature: string,
    toolVersion: string,
  ): Promise<void> {
    const pushedAt = new Date().toISOString();
    await runStatement(
      session,
      `MERGE (m:GraphifyMeta {namespace: $namespace}) SET m.topology_signature = $topology_signature, m.pushed_at = $pushed_at, m.tool_version = $tool_version`,
      {
        namespace,
        topology_signature: topologySignature,
        pushed_at: pushedAt,
        tool_version: toolVersion,
      },
    );
    // Keep local cache for the fake driver used in unit tests.
    localMeta.set(namespace, {
      topologySignature: topologySignature,
      pushedAt,
      toolVersion,
    });
  }

  async function readGraphifyMetaFromBackend(
    session: Neo4jSession,
  ): Promise<GraphStoreSnapshotMeta | undefined> {
    const result = await session.run(
      `MATCH (m:GraphifyMeta {namespace: $namespace}) RETURN m.topology_signature AS topology_signature, m.pushed_at AS pushed_at, m.tool_version AS tool_version LIMIT 1`,
      { namespace },
    ) as { records?: Array<{ get(key: string): unknown }> };

    if (!result?.records?.length) return undefined;

    const record = result.records[0];
    if (!record) return undefined;

    const sig = record.get("topology_signature");
    const pushedAt = record.get("pushed_at");
    const toolVersion = record.get("tool_version");

    if (typeof sig !== "string" || !sig) return undefined;

    return {
      topologySignature: sig,
      pushedAt: typeof pushedAt === "string" ? pushedAt : new Date().toISOString(),
      toolVersion: typeof toolVersion === "string" ? toolVersion : "unknown",
    };
  }

  // ---------------------------------------------------------------------------
  // The GraphStore implementation
  // ---------------------------------------------------------------------------

  return {
    id: "neo4j",
    capabilities: {
      push: true,
      query: true,
      clear: true,
      snapshotMeta: true,
    },

    async verifyConnection(): Promise<void> {
      await driver.verifyConnectivity();
    },

    async pushGraph(
      G: Graph,
      communities: Map<number, string[]>,
      options: GraphPushOptions = {},
    ): Promise<GraphPushResult> {
      const start = Date.now();
      const batchSize = options.batchSize ?? 500;
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

      const communityMap = buildNodeCommunityMap(communities);
      const session = driver.session(
        config.database ? { database: config.database } : undefined,
      );

      try {
        // Replace mode: wipe the namespace first.
        if (mode === "replace") {
          await runStatement(
            session,
            `MATCH (n {namespace: $namespace}) DETACH DELETE n`,
            { namespace },
          );
        }

        await pushNodes(session, G, communityMap, mode, batchSize);
        await pushEdges(session, G, mode, batchSize);

        const topologySignature = computeTopologySignature(G);
        const toolVersion = resolveToolVersion();
        await writeGraphifyMeta(session, topologySignature, toolVersion);
      } finally {
        await session.close();
      }

      return {
        nodes: nodeCount,
        edges: edgeCount,
        warnings: [],
        durationMs: Date.now() - start,
      };
    },

    async readSnapshotMeta(): Promise<GraphStoreSnapshotMeta | undefined> {
      // Check local cache first (unit tests use this path since the fake
      // session.run returns empty records).
      if (localMeta.has(namespace)) {
        return localMeta.get(namespace);
      }

      const session = driver.session(
        config.database ? { database: config.database } : undefined,
      );
      try {
        return await readGraphifyMetaFromBackend(session);
      } finally {
        await session.close();
      }
    },

    async clear(options?: string | Neo4jClearOptions): Promise<void> {
      const opts =
        typeof options === "string"
          ? { namespace: options }
          : options ?? {};

      if (!opts.force) {
        throw new Error(
          `refusing to clear neo4j namespace '${namespace}'; pass { force: true } to delete`,
        );
      }

      const targetNamespace = opts.namespace ?? namespace;
      const session = driver.session(
        config.database ? { database: config.database } : undefined,
      );
      try {
        await runStatement(
          session,
          `MATCH (n {namespace: $namespace}) DETACH DELETE n`,
          { namespace: targetNamespace },
        );
        localMeta.delete(targetNamespace);
      } finally {
        await session.close();
      }
    },

    async query(statement: string, params?: Record<string, unknown>): Promise<unknown> {
      const session = driver.session(
        config.database ? { database: config.database } : undefined,
      );
      try {
        return await session.run(statement, params ?? {});
      } finally {
        await session.close();
      }
    },

    async close(): Promise<void> {
      if (!closed) {
        closed = true;
        await driver.close();
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Minimal type definitions for the neo4j-driver API we use
// (avoids a static import; real types come from the injected module)
// ---------------------------------------------------------------------------

interface Neo4jSession {
  run(text: string, params?: Record<string, unknown>): Promise<unknown>;
  close(): Promise<void>;
}

interface Neo4jDriver {
  session(options?: { database?: string }): Neo4jSession;
  close(): Promise<void>;
  verifyConnectivity(): Promise<unknown>;
}
