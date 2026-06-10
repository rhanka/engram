import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type Graph from "graphology";
import { createGraph, isDirectedGraph, loadGraphFromData, serializeGraph } from "./graph.js";
import { assertGraphJsonFileSize, assertGraphJsonSize } from "./graph-size-guard.js";
import { loadHyperedges, mergeHyperedges, setHyperedges } from "./hyperedges.js";
import type { Hyperedge } from "./hyperedges.js";
import type { RepoKeyRunner } from "./repo-key.js";
import { repoKey } from "./repo-key.js";

export interface MergeGraphsOptions {
  inputs: string[];
  out: string;
  /** Optional runner for git commands, injectable for testing. */
  runner?: RepoKeyRunner;
}

export interface MergeGraphsResult {
  graph: Graph;
  out: string;
  graphCount: number;
  nodeCount: number;
  edgeCount: number;
}

/**
 * Derive a stable repo tag from a graph file path.
 *
 * The tag is computed via `repoKey()` which uses the remote origin URL (preferred)
 * or falls back to a deterministic local key — never just the basename, so two
 * repos with the same directory name cannot collide.
 *
 * If an explicit `tag` override is provided (rétrocompat for callers that build
 * the tag themselves) it is returned as-is.
 */
function repoTagFromGraphPath(
  graphPath: string,
  tag?: string,
  runner?: RepoKeyRunner,
): string {
  if (tag !== undefined) return tag;

  // Walk up from the graph file to the repo root:
  // .graphify/graph.json      → repoRoot = dirname(dirname(graphPath))
  // graphify-out/graph.json   → repoRoot = dirname(dirname(graphPath))
  // any-other-dir/graph.json  → repoRoot = dirname(graphPath)  (best-effort)
  const parent = dirname(graphPath);
  const grandparent = dirname(parent);
  const parentName = parent.split("/").at(-1) ?? "";
  const repoRoot =
    parentName === ".graphify" || parentName === "graphify-out"
      ? grandparent
      : parent;

  try {
    return repoKey(repoRoot, runner);
  } catch {
    return "unknown";
  }
}

function mergedGraphType(graphs: Graph[]): boolean {
  return graphs.some((graph) => isDirectedGraph(graph));
}

function mergeHyperedgesFromGraphs(graphs: Graph[]): Hyperedge[] {
  return graphs.reduce<Hyperedge[]>(
    (acc, graph) => mergeHyperedges(acc, loadHyperedges(graph)),
    [],
  );
}

export function mergeGraphsFromFiles(options: MergeGraphsOptions): MergeGraphsResult {
  if (options.inputs.length < 2) {
    throw new Error("merge-graphs requires at least two graph.json inputs");
  }

  const graphs = options.inputs.map((inputPath) => {
    const resolved = resolve(inputPath);
    if (!existsSync(resolved)) {
      throw new Error(`graph file not found: ${resolved}`);
    }
    assertGraphJsonFileSize(resolved, "read");
    const raw = JSON.parse(readFileSync(resolved, "utf-8")) as Record<string, unknown>;
    const graph = loadGraphFromData(raw);
    const repo = repoTagFromGraphPath(resolved, undefined, options.runner);
    graph.forEachNode((nodeId, attrs) => {
      if (attrs.repo === undefined) {
        graph.setNodeAttribute(nodeId, "repo", repo);
      }
    });
    return graph;
  });

  const merged = createGraph(mergedGraphType(graphs));
  for (const graph of graphs) {
    for (const [key, value] of Object.entries(graph.getAttributes())) {
      if (!merged.hasAttribute(key)) {
        merged.setAttribute(key, value);
      }
    }
    graph.forEachNode((nodeId, attrs) => {
      merged.mergeNode(nodeId, attrs);
    });
    graph.forEachEdge((_edge, attrs, source, target) => {
      if (!merged.hasNode(source) || !merged.hasNode(target)) return;
      try {
        merged.mergeEdge(source, target, attrs);
      } catch {
        // Keep the first compatible edge if a duplicate merge collides.
      }
    });
  }

  const hyperedges = mergeHyperedgesFromGraphs(graphs);
  if (hyperedges.length > 0) {
    setHyperedges(merged, hyperedges);
  }

  const outPath = resolve(options.out);
  mkdirSync(dirname(outPath), { recursive: true });
  const serialized = JSON.stringify(serializeGraph(merged), null, 2);
  assertGraphJsonSize(Buffer.byteLength(serialized, "utf-8"), "write", outPath);
  writeFileSync(outPath, serialized, "utf-8");

  return {
    graph: merged,
    out: outPath,
    graphCount: graphs.length,
    nodeCount: merged.order,
    edgeCount: merged.size,
  };
}
