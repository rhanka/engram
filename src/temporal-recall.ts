/**
 * Read-only temporal graph recall (SPEC_AGENTSTATS_TIMEORIENTED, T6).
 *
 * This module projects the shared `t` / `t_end` graph contract at one instant.
 * It deliberately models neither authored memory nor semantic relevance:
 * configured stores delegate to the optional queryWindow port, while the
 * no-store path applies the same predicate directly to graph.json.
 */
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";

import type { SerializedGraphData } from "./graph.js";
import { resolveGraphInputPath } from "./paths.js";
import { loadProjectConfig } from "./project-config.js";
import { resolveStoreConfig } from "./storage/config.js";
import { resolveGraphStore } from "./storage/registry.js";
import type {
  GraphStore,
  GraphStoreConfig,
  GraphStoreSnapshotMeta,
  GraphTimeWindow,
  GraphTimeWindowEdge,
  GraphTimeWindowNode,
  StoreTestDeps,
} from "./storage/types.js";
import type { NormalizedProjectConfig } from "./types.js";

export const TEMPORAL_RECALL_SCHEMA = "graphify.temporal-recall/v1" as const;

interface TemporalSerializedGraph extends SerializedGraphData {
  topology_signature?: unknown;
}

export interface TemporalRecallOptions {
  /** Safe integer epoch-ms, or ISO-8601 carrying an explicit Z/UTC offset. */
  asOf: string | number;
  /** Explicit graph.json source. Selecting it forces the file path. */
  graph?: string;
  /** Graphify project config (state dir plus optional storage mirror). */
  config?: string;
  /** Explicit GraphStore id. Otherwise env/config may select a store. */
  store?: string;
}

export interface TemporalRecallSnapshot {
  topologySignatureSha256: string;
  pushedAt: string;
  toolVersion: string;
}

export type TemporalRecallSource =
  | {
      kind: "file";
      path: string;
      topologySignatureSha256?: string;
      provenance?: unknown;
      freshness: "unverified";
    }
  | {
      kind: "store";
      storeId: string;
      namespace?: string;
      snapshot: TemporalRecallSnapshot | null;
      freshness: "unverified";
    };

export interface TemporalRecallResult extends GraphTimeWindow {
  schema: typeof TEMPORAL_RECALL_SCHEMA;
  asOfMs: number;
  asOfIso: string;
  source: TemporalRecallSource;
  /** T6 returns the complete matching snapshot and never silently truncates. */
  unpaged: true;
}

export interface TemporalRecallDeps {
  /** Hermetic environment map for store selection/config tests. */
  env?: NodeJS.ProcessEnv;
  /** Optional GraphStore resolver injection for tests/embedders. */
  resolveStore?: (id: string, config: GraphStoreConfig) => Promise<GraphStore>;
  /** Optional backend driver injection forwarded to the production registry. */
  storeTestDeps?: StoreTestDeps;
  /** Optional graph loader injection. Production reads/parses the named JSON file. */
  readGraph?: (path: string) => TemporalSerializedGraph;
}

export interface TemporalRecallCliOptions extends TemporalRecallOptions {
  /** Emit the machine result only. */
  json?: boolean;
}

export interface TemporalRecallCliDeps extends TemporalRecallDeps {
  /** Output sink; defaults to stdout through console.log. */
  log?: (line: string) => void;
}

const INTEGER_EPOCH = /^-?(?:0|[1-9]\d*)$/;
const EXPLICIT_ZONE_ISO = /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/i;

function assertEpochRange(value: number): number {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError("--as-of epoch-ms must be a safe integer");
  }
  if (Number.isNaN(new Date(value).getTime())) {
    throw new RangeError("--as-of epoch-ms is outside the ISO date range");
  }
  return value;
}

/** Parse the deterministic T6 timestamp input contract. */
export function parseRecallTimestamp(value: string | number): number {
  if (typeof value === "number") return assertEpochRange(value);

  const raw = value.trim();
  if (INTEGER_EPOCH.test(raw)) return assertEpochRange(Number(raw));
  if (!EXPLICIT_ZONE_ISO.test(raw)) {
    throw new Error(
      "--as-of must be safe integer epoch-ms or ISO-8601 with an explicit Z/UTC offset",
    );
  }
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error("--as-of contains an invalid ISO-8601 timestamp");
  }
  return assertEpochRange(parsed);
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function temporalBounds(
  record: Record<string, unknown>,
  fromMs: number,
  toMs: number,
): { t: number; tEnd?: number } | undefined {
  const t = record.t;
  if (typeof t !== "number" || !Number.isFinite(t) || t > toMs) return undefined;
  if (!hasOwn(record, "t_end")) return { t };

  const tEnd = record.t_end;
  if (
    typeof tEnd !== "number" ||
    !Number.isFinite(tEnd) ||
    tEnd < t ||
    tEnd < fromMs
  ) {
    return undefined;
  }
  return { t, tEnd };
}

function canonicalTemporalNode(
  raw: Record<string, unknown>,
  fromMs: number,
  toMs: number,
): GraphTimeWindowNode | undefined {
  if (typeof raw.id !== "string") return undefined;
  const bounds = temporalBounds(raw, fromMs, toMs);
  if (!bounds) return undefined;

  const { id: _rawId, ...attributes } = raw;
  const node: GraphTimeWindowNode = {
    ...attributes,
    id: raw.id,
    label: typeof raw.label === "string" && raw.label.length > 0 ? raw.label : raw.id,
    t: bounds.t,
  };

  // These are canonical GraphStore fields, so malformed file values cannot
  // spoof a different provider-neutral shape.
  delete node.node_type;
  delete node.community;
  delete node.t_end;
  if (typeof raw.node_type === "string" && raw.node_type.length > 0) {
    node.node_type = raw.node_type;
  }
  if (typeof raw.community === "number" && Number.isFinite(raw.community)) {
    node.community = raw.community;
  }
  if (bounds.tEnd !== undefined) node.t_end = bounds.tEnd;
  return node;
}

function canonicalTemporalEdge(
  raw: Record<string, unknown>,
  fromMs: number,
  toMs: number,
): GraphTimeWindowEdge | undefined {
  if (typeof raw.source !== "string" || typeof raw.target !== "string") return undefined;
  const bounds = temporalBounds(raw, fromMs, toMs);
  if (!bounds) return undefined;

  const { source: _rawSource, target: _rawTarget, ...attributes } = raw;
  const edge: GraphTimeWindowEdge = {
    ...attributes,
    source: raw.source,
    target: raw.target,
    relation: typeof raw.relation === "string" ? raw.relation : "RELATES_TO",
    t: bounds.t,
  };

  delete edge.confidence;
  delete edge.t_end;
  if (typeof raw.confidence === "string" && raw.confidence.length > 0) {
    edge.confidence = raw.confidence;
  }
  if (bounds.tEnd !== undefined) edge.t_end = bounds.tEnd;
  return edge;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function topologySignatureSha256(signature: string): string {
  return `sha256:${createHash("sha256").update(signature, "utf-8").digest("hex")}`;
}

function discloseSnapshot(meta: GraphStoreSnapshotMeta): TemporalRecallSnapshot {
  return {
    topologySignatureSha256: topologySignatureSha256(meta.topologySignature),
    pushedAt: meta.pushedAt,
    toolVersion: meta.toolVersion,
  };
}

function sortWindow(window: GraphTimeWindow): GraphTimeWindow {
  const nodes = [...window.nodes].sort(
    (a, b) => a.t - b.t || compareText(a.id, b.id),
  );
  const edges = [...window.edges].sort(
    (a, b) =>
      a.t - b.t ||
      compareText(a.source, b.source) ||
      compareText(a.target, b.target) ||
      compareText(a.relation, b.relation),
  );
  return { nodes, edges };
}

/**
 * Pure graph.json fallback. Node and edge membership is deliberately
 * independent, so this is not an induced-subgraph operation.
 */
export function filterTemporalWindow(
  raw: TemporalSerializedGraph,
  fromMs: number,
  toMs: number,
): GraphTimeWindow {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
    throw new RangeError("temporal window bounds must be finite numbers");
  }
  if (fromMs > toMs) {
    throw new RangeError("temporal window requires fromMs <= toMs");
  }

  const rawNodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  const rawEdges = Array.isArray(raw.links)
    ? raw.links
    : Array.isArray(raw.edges)
      ? raw.edges
      : [];
  const nodes = rawNodes
    .map((node) => canonicalTemporalNode(node, fromMs, toMs))
    .filter((node): node is GraphTimeWindowNode => node !== undefined);
  const edges = rawEdges
    .map((edge) => canonicalTemporalEdge(edge, fromMs, toMs))
    .filter((edge): edge is GraphTimeWindowEdge => edge !== undefined);
  return sortWindow({ nodes, edges });
}

function loadConfig(configPath: string | undefined): NormalizedProjectConfig | undefined {
  return configPath ? loadProjectConfig(resolve(configPath)) : undefined;
}

function selectedStoreId(
  options: TemporalRecallOptions,
  projectConfig: NormalizedProjectConfig | undefined,
  env: NodeJS.ProcessEnv,
): string | undefined {
  return options.store ?? env.GRAPHIFY_STORE ?? projectConfig?.storage?.mirrors?.[0]?.backend;
}

function readTemporalGraph(path: string, deps: TemporalRecallDeps): TemporalSerializedGraph {
  if (deps.readGraph) return deps.readGraph(path);
  const parsed: unknown = JSON.parse(readFileSync(path, "utf-8"));
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`graph file must contain a JSON object: ${path}`);
  }
  return parsed as TemporalSerializedGraph;
}

async function openStore(
  id: string,
  config: GraphStoreConfig,
  deps: TemporalRecallDeps,
): Promise<GraphStore> {
  if (deps.resolveStore) return deps.resolveStore(id, config);
  return resolveGraphStore(id, config, deps.storeTestDeps);
}

/** Execute one read-only point-in-time graph projection. */
export async function recallAsOf(
  options: TemporalRecallOptions,
  deps: TemporalRecallDeps = {},
): Promise<TemporalRecallResult> {
  if (options.graph && options.store) {
    throw new Error("--graph and --store are mutually exclusive recall sources");
  }
  const asOfMs = parseRecallTimestamp(options.asOf);
  const asOfIso = new Date(asOfMs).toISOString();
  const env = deps.env ?? process.env;
  const projectConfig = loadConfig(options.config);

  // An explicit graph path is an explicit source choice, even if the ambient
  // environment also names a store. Otherwise, once a store is selected, no
  // store error/capability miss/empty result may silently switch sources.
  const storeId = options.graph
    ? undefined
    : selectedStoreId(options, projectConfig, env);
  if (storeId) {
    const storeConfig = resolveStoreConfig(storeId, { projectConfig, env });
    const store = await openStore(storeId, storeConfig, deps);
    try {
      if (
        store.capabilities.queryWindow !== true ||
        typeof store.queryWindow !== "function"
      ) {
        throw new Error(
          `store '${storeId}' does not support temporal recall ` +
            "(requires capabilities.queryWindow and queryWindow())",
        );
      }
      const window = sortWindow(await store.queryWindow(asOfMs, asOfMs));
      const snapshot = await store.readSnapshotMeta().catch(() => undefined);
      return {
        schema: TEMPORAL_RECALL_SCHEMA,
        asOfMs,
        asOfIso,
        source: {
          kind: "store",
          storeId,
          ...(storeConfig.namespace ? { namespace: storeConfig.namespace } : {}),
          snapshot: snapshot ? discloseSnapshot(snapshot) : null,
          freshness: "unverified",
        },
        unpaged: true,
        ...window,
      };
    } finally {
      await store.close();
    }
  }

  const graphPath = options.graph
    ? resolve(options.graph)
    : projectConfig
      ? join(projectConfig.outputs.state_dir, "graph.json")
      : resolveGraphInputPath();
  if (!existsSync(graphPath) && !deps.readGraph) {
    throw new Error(`graph file not found: ${graphPath}`);
  }
  const raw = readTemporalGraph(graphPath, deps);
  const window = filterTemporalWindow(raw, asOfMs, asOfMs);
  const provenance = raw.graph?.provenance;
  return {
    schema: TEMPORAL_RECALL_SCHEMA,
    asOfMs,
    asOfIso,
    source: {
      kind: "file",
      path: graphPath,
      ...(typeof raw.topology_signature === "string"
        ? { topologySignatureSha256: topologySignatureSha256(raw.topology_signature) }
        : {}),
      ...(provenance !== undefined ? { provenance } : {}),
      freshness: "unverified",
    },
    unpaged: true,
    ...window,
  };
}

/** Compact non-claiming human rendering for the CLI. */
export function formatTemporalRecall(result: TemporalRecallResult): string {
  const snapshot = result.source.kind === "file"
    ? result.source.topologySignatureSha256 ?? "unknown"
    : result.source.snapshot?.topologySignatureSha256 ?? "unknown";
  const lines = [
    `Temporal graph recall at ${result.asOfIso} (${result.asOfMs})`,
    result.source.kind === "file"
      ? `Source: graph file ${result.source.path}`
      : `Source: store '${result.source.storeId}'` +
        (result.source.namespace ? ` (configured namespace: ${result.source.namespace})` : ""),
    `Snapshot identity: ${snapshot}`,
    "Freshness/provenance: unverified; result is unpaged and edges may lack returned endpoints.",
    `Nodes (${result.nodes.length}):`,
  ];
  for (const node of result.nodes) {
    const type = node.node_type ? ` [${node.node_type}]` : "";
    const end = node.t_end === undefined ? "open" : String(node.t_end);
    lines.push(`  ${JSON.stringify(node.id)}${type} ${JSON.stringify(node.label)} t=${node.t} t_end=${end}`);
  }
  lines.push(`Edges (${result.edges.length}):`);
  for (const edge of result.edges) {
    const end = edge.t_end === undefined ? "open" : String(edge.t_end);
    lines.push(
      `  ${JSON.stringify(edge.source)} --${JSON.stringify(edge.relation)}--> ` +
        `${JSON.stringify(edge.target)} t=${edge.t} t_end=${end}`,
    );
  }
  return lines.join("\n");
}

/** CLI runner kept separate from Commander registration for focused tests. */
export async function runTemporalRecall(
  options: TemporalRecallCliOptions,
  deps: TemporalRecallCliDeps = {},
): Promise<TemporalRecallResult> {
  const result = await recallAsOf(options, deps);
  const log = deps.log ?? ((line: string) => console.log(line));
  log(options.json ? JSON.stringify(result, null, 2) : formatTemporalRecall(result));
  return result;
}
