import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import type Graph from "graphology";
import { createGraph, isDirectedGraph, loadGraphFromData, serializeGraph } from "./graph.js";

export interface MergeGraphsOptions {
  inputs: string[];
  out: string;
}

export interface MergeGraphsResult {
  graph: Graph;
  out: string;
  graphCount: number;
  nodeCount: number;
  edgeCount: number;
}

function repoTagFromGraphPath(graphPath: string): string {
  const parentName = basename(dirname(graphPath));
  if (parentName === ".graphify" || parentName === "graphify-out") {
    return basename(dirname(dirname(graphPath))) || "unknown";
  }
  return parentName || "unknown";
}

function mergedGraphType(graphs: Graph[]): boolean {
  return graphs.some((graph) => isDirectedGraph(graph));
}

function mergeHyperedges(graphs: Graph[]): Array<Record<string, unknown>> {
  const merged: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  for (const graph of graphs) {
    const hyperedges = (graph.getAttribute("hyperedges") as Array<Record<string, unknown>> | undefined) ?? [];
    for (const hyperedge of hyperedges) {
      const id = typeof hyperedge.id === "string" ? hyperedge.id : JSON.stringify(hyperedge);
      if (seen.has(id)) continue;
      seen.add(id);
      merged.push(hyperedge);
    }
  }
  return merged;
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
    const raw = JSON.parse(readFileSync(resolved, "utf-8")) as Record<string, unknown>;
    const graph = loadGraphFromData(raw);
    const repo = repoTagFromGraphPath(resolved);
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

  const hyperedges = mergeHyperedges(graphs);
  if (hyperedges.length > 0) {
    merged.setAttribute("hyperedges", hyperedges);
  }

  const outPath = resolve(options.out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(serializeGraph(merged), null, 2), "utf-8");

  return {
    graph: merged,
    out: outPath,
    graphCount: graphs.length,
    nodeCount: merged.order,
    edgeCount: merged.size,
  };
}
