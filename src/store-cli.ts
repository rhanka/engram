/**
 * `graphify store push` / `graphify store status` — CLI glue that productionizes
 * the DB instant-grouping path (storage LOTs 1/2/3, PRs #235/#239/#247).
 *
 * `store push` loads a `.graphify` graph and pushes it to the configured
 * GraphStore mirror in REPLACE mode so the backend rebuilds its precomputed
 * `graph_group_counts` aggregate (O(#groups) group-by, #235) and `graph_positions`
 * windowed loader (#247). The studio then serves `GET /api/ontology/groups`
 * straight from the aggregate (#239) instead of an O(#nodes) client recompute.
 *
 * This module owns NO push logic: it resolves the store via the existing
 * `resolveStoreConfig` + `resolveGraphStore` wiring and calls the adapter's
 * `pushGraph` — the same code path the bespoke UAT script exercised, now a
 * first-class command. The store/graph resolution and summary are extracted here
 * (not inlined in cli.ts) so they are unit-testable against the storage
 * fake-driver harness with no live DB.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { loadGraphFromData } from "./graph.js";
import { communitiesFromGraph } from "./graph-communities.js";
import { resolveGraphInputPath } from "./paths.js";
import { loadProjectConfig } from "./project-config.js";
import { resolveStoreConfig } from "./storage/config.js";
import { resolveGraphStore } from "./storage/registry.js";
import type {
  GraphStore,
  GraphStoreConfig,
  StoreTestDeps,
} from "./storage/types.js";
import type { NormalizedProjectConfig } from "./types.js";

/** Options accepted by `graphify store push`. */
export interface StorePushCliOptions {
  /** Explicit graph.json path; overrides the config-derived path. */
  graph?: string;
  /** Graphify project config path; resolves the graph dir + storage.mirrors. */
  config?: string;
  /** Store backend id; overrides GRAPHIFY_STORE / storage.mirrors[0]. */
  store?: string;
  /** Push mode; defaults to `replace` so the aggregate + positions are rebuilt. */
  mode?: string;
  /** Plan and report without writing to the backend. */
  dryRun?: boolean;
}

/** Options accepted by `graphify store status`. */
export interface StoreStatusCliOptions {
  /** Graphify project config path; resolves storage.mirrors. */
  config?: string;
  /** Store backend id; overrides GRAPHIFY_STORE / storage.mirrors[0]. */
  store?: string;
}

/** Structured result of a push (also printed as a human summary). */
export interface StorePushSummary {
  storeId: string;
  mode: "merge" | "replace";
  nodes: number;
  edges: number;
  communities: number;
  /** Group-by axes the backend rebuilt (replace + aggregate-capable only). */
  axes: string[];
  /** Windowed-loader layouts the backend rebuilt (replace + window-capable). */
  layouts: string[];
  durationMs: number;
  dryRun: boolean;
  warnings: string[];
}

/** Structured result of a status probe. */
export interface StoreStatusSummary {
  storeId: string;
  reachable: boolean;
  capabilities: GraphStore["capabilities"];
  snapshot?: {
    topologySignature: string;
    pushedAt: string;
    toolVersion: string;
  };
  /** Cheap O(#groups) node total per axis (only when an aggregate exists). */
  axisTotals: Record<string, number>;
}

/** Injection points: hermetic env + store resolution for tests. */
export interface StoreCliDeps {
  /** Env map (defaults to process.env) so resolution is hermetic under test. */
  env?: NodeJS.ProcessEnv;
  /**
   * Store resolver override. Default resolves via resolveStoreConfig +
   * resolveGraphStore, forwarding {@link storeTestDeps}. Tests inject a
   * fake-driver store here (or rely on storeTestDeps).
   */
  resolveStore?: (id: string, config: GraphStoreConfig) => Promise<GraphStore>;
  /** Driver injection forwarded to resolveGraphStore (storage fake-driver harness). */
  storeTestDeps?: StoreTestDeps;
  /** Output sink (defaults to console.log). */
  log?: (line: string) => void;
}

function normalizeMode(raw: string | undefined): "merge" | "replace" {
  const mode = String(raw ?? "replace").trim().toLowerCase();
  if (mode === "merge" || mode === "replace") return mode;
  throw new Error(`--mode must be 'replace' or 'merge' (got '${raw}')`);
}

function loadConfig(configPath: string | undefined): NormalizedProjectConfig | undefined {
  if (!configPath) return undefined;
  return loadProjectConfig(resolve(configPath));
}

/**
 * Effective backend id: explicit `--store` > GRAPHIFY_STORE env >
 * storage.mirrors[0].backend. Returns undefined when nothing is configured so
 * the caller can emit a single actionable error.
 */
export function resolveStoreBackendId(
  opts: { store?: string },
  projectConfig: NormalizedProjectConfig | undefined,
  env: NodeJS.ProcessEnv,
): string | undefined {
  return (
    opts.store ??
    env["GRAPHIFY_STORE"] ??
    projectConfig?.storage?.mirrors?.[0]?.backend
  );
}

/**
 * Effective graph path: explicit `--graph` > `<config state_dir>/graph.json` >
 * the default `.graphify/graph.json` (with legacy fallback).
 */
function resolveStoreGraphPath(
  opts: StorePushCliOptions,
  projectConfig: NormalizedProjectConfig | undefined,
): string {
  if (opts.graph) return resolve(opts.graph);
  if (projectConfig) return join(projectConfig.outputs.state_dir, "graph.json");
  return resolveGraphInputPath();
}

async function openStore(
  storeId: string,
  storeConfig: GraphStoreConfig,
  deps: StoreCliDeps,
): Promise<GraphStore> {
  if (deps.resolveStore) return deps.resolveStore(storeId, storeConfig);
  return resolveGraphStore(storeId, storeConfig, deps.storeTestDeps);
}

const NO_STORE_ERROR =
  "no GraphStore configured. Set GRAPHIFY_STORE (and GRAPHIFY_POSTGRES_URL for " +
  "the postgres backend), add a storage.mirrors[] entry to your graphify config, " +
  "or pass --store <id>.";

/**
 * Push a `.graphify` graph to the configured GraphStore. REPLACE mode (the
 * default) is what makes the aggregate + windowed positions valid — they are
 * rebuilt only inside a full-snapshot replace. Reuses the adapter's pushGraph;
 * never reimplements the push.
 */
export async function runStorePush(
  opts: StorePushCliOptions,
  deps: StoreCliDeps = {},
): Promise<StorePushSummary> {
  const env = deps.env ?? process.env;
  const log = deps.log ?? ((line: string) => console.log(line));
  const mode = normalizeMode(opts.mode);

  const projectConfig = loadConfig(opts.config);
  const storeId = resolveStoreBackendId(opts, projectConfig, env);
  if (!storeId) {
    throw new Error(NO_STORE_ERROR);
  }

  const graphPath = resolveStoreGraphPath(opts, projectConfig);
  if (!existsSync(graphPath)) {
    throw new Error(
      `graph file not found: ${graphPath}. Build it first (graphify extract) ` +
        "or pass --graph <path>.",
    );
  }
  const G = loadGraphFromData(JSON.parse(readFileSync(graphPath, "utf-8")));
  const communities = communitiesFromGraph(G);

  const storeConfig = resolveStoreConfig(storeId, { projectConfig, env });
  const store = await openStore(storeId, storeConfig, deps);
  try {
    const result = await store.pushGraph(G, communities, {
      mode,
      ...(opts.dryRun ? { dryRun: true } : {}),
    });
    // Aggregate + positions are REPLACE-snapshot scoped: only a replace push
    // rebuilds them (a merge leaves the previous counts/positions in place).
    const rebuilt = mode === "replace" && !opts.dryRun;
    const axes = rebuilt ? [...(store.capabilities.aggregate?.axes ?? [])] : [];
    const layouts = rebuilt ? [...(store.capabilities.window?.layouts ?? [])] : [];

    const summary: StorePushSummary = {
      storeId,
      mode,
      nodes: result.nodes,
      edges: result.edges,
      communities: communities.size,
      axes,
      layouts,
      durationMs: result.durationMs,
      dryRun: opts.dryRun === true,
      warnings: result.warnings,
    };
    printPushSummary(log, summary);
    return summary;
  } finally {
    await store.close();
  }
}

function printPushSummary(log: (line: string) => void, s: StorePushSummary): void {
  const dry = s.dryRun ? " [DRY-RUN — nothing written]" : "";
  log(
    `Pushed ${s.nodes} nodes, ${s.edges} edges (${s.communities} communities) ` +
      `to the '${s.storeId}' store in ${s.mode} mode${dry}.`,
  );
  if (s.mode === "replace" && !s.dryRun) {
    log(
      s.axes.length > 0
        ? `  Group-by aggregate rebuilt for axes: ${s.axes.join(", ")} (O(#groups) counts).`
        : "  Store declares no group-by aggregate capability (counts stay client-side).",
    );
    if (s.layouts.length > 0) {
      log(`  Windowed-loader positions rebuilt for layouts: ${s.layouts.join(", ")}.`);
    }
  } else if (s.mode === "merge") {
    log(
      "  Merge mode: the group-by aggregate + windowed positions are NOT rebuilt. " +
        "Use --mode replace to refresh them.",
    );
  }
  for (const warning of s.warnings) log(`  warning: ${warning}`);
  log(`  Took ${s.durationMs} ms.`);
}

/**
 * Probe a configured GraphStore: report its capabilities and latest snapshot
 * meta (both cheap — capabilities are static, snapshot meta is a single row).
 * When an aggregate exists, also report the O(#groups) node total per axis.
 */
export async function runStoreStatus(
  opts: StoreStatusCliOptions,
  deps: StoreCliDeps = {},
): Promise<StoreStatusSummary> {
  const env = deps.env ?? process.env;
  const log = deps.log ?? ((line: string) => console.log(line));

  const projectConfig = loadConfig(opts.config);
  const storeId = resolveStoreBackendId(opts, projectConfig, env);
  if (!storeId) {
    throw new Error(NO_STORE_ERROR);
  }

  const storeConfig = resolveStoreConfig(storeId, { projectConfig, env });
  const store = await openStore(storeId, storeConfig, deps);
  try {
    let reachable = true;
    try {
      await store.verifyConnection();
    } catch (error) {
      reachable = false;
      const message = error instanceof Error ? error.message : String(error);
      log(`Store '${storeId}' unreachable: ${message}`);
    }

    const caps = store.capabilities;
    const axisTotals: Record<string, number> = {};
    let snapshot: StoreStatusSummary["snapshot"];
    if (reachable) {
      const meta = await store.readSnapshotMeta().catch(() => undefined);
      if (meta) {
        snapshot = {
          topologySignature: meta.topologySignature,
          pushedAt: meta.pushedAt,
          toolVersion: meta.toolVersion,
        };
      }
      // Cheap O(#groups) totals: read the precomputed aggregate, never the nodes.
      if (caps.aggregate && typeof store.groupCounts === "function") {
        for (const axis of caps.aggregate.axes) {
          try {
            const counts = await store.groupCounts(axis);
            axisTotals[axis] = counts.groups.reduce((sum, g) => sum + g.count, 0);
          } catch {
            /* an axis the snapshot lacks → skip; status stays best-effort */
          }
        }
      }
    }

    const summary: StoreStatusSummary = {
      storeId,
      reachable,
      capabilities: caps,
      ...(snapshot ? { snapshot } : {}),
      axisTotals,
    };
    printStatusSummary(log, summary);
    return summary;
  } finally {
    await store.close();
  }
}

function printStatusSummary(log: (line: string) => void, s: StoreStatusSummary): void {
  const c = s.capabilities;
  log(`Store '${s.storeId}' — reachable=${s.reachable}`);
  log(
    `  capabilities: push=${c.push} query=${c.query} clear=${c.clear} ` +
      `snapshotMeta=${c.snapshotMeta}`,
  );
  log(
    c.aggregate
      ? `  group-by aggregate: v${c.aggregate.version} axes [${c.aggregate.axes.join(", ")}]`
      : "  group-by aggregate: none (counts computed client-side)",
  );
  log(
    c.window
      ? `  windowed loader: v${c.window.version} layouts [${c.window.layouts.join(", ")}] ` +
          `strategies [${c.window.strategies.join(", ")}]`
      : "  windowed loader: none (full scene shipped)",
  );
  if (s.snapshot) {
    log(
      `  latest snapshot: pushedAt=${s.snapshot.pushedAt} ` +
        `toolVersion=${s.snapshot.toolVersion} topology=${s.snapshot.topologySignature}`,
    );
  } else if (s.reachable) {
    log("  latest snapshot: none pushed yet");
  }
  for (const [axis, total] of Object.entries(s.axisTotals)) {
    log(`  aggregate total nodes (${axis}): ${total}`);
  }
}
