import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { SerializedGraphData } from "./graph.js";
import { createGraph, serializeGraph } from "./graph.js";

export interface MergeGraphJsonResult {
  out: string;
  nodeCount: number;
  edgeCount: number;
}

function readGraph(path: string): SerializedGraphData | null {
  const resolved = resolve(path);
  if (!existsSync(resolved)) return null;
  return JSON.parse(readFileSync(resolved, "utf-8")) as SerializedGraphData;
}

function edgeSortKey(edge: Record<string, unknown> & { source: string; target: string }): string {
  return [
    edge.source,
    edge.target,
    String(edge.relation ?? ""),
    String(edge.source_file ?? ""),
    String(edge.confidence ?? ""),
    JSON.stringify(edge),
  ].join("\0");
}

function hyperedgeSortKey(hyperedge: Record<string, unknown>): string {
  const id = typeof hyperedge.id === "string" ? hyperedge.id : "";
  return id || JSON.stringify(hyperedge);
}

function mergeGraphAttributes(
  current: SerializedGraphData | null,
  other: SerializedGraphData | null,
): Record<string, unknown> {
  const currentGraph = (current?.graph ?? {}) as Record<string, unknown>;
  const otherGraph = (other?.graph ?? {}) as Record<string, unknown>;
  const merged: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(currentGraph)) {
    if (key === "community_labels" || key === "built_from_commit") continue;
    merged[key] = value;
  }
  for (const [key, value] of Object.entries(otherGraph)) {
    if (key === "community_labels" || key === "built_from_commit") continue;
    if (merged[key] === undefined) {
      merged[key] = value;
    }
  }

  const communityLabels = {
    ...((currentGraph.community_labels as Record<string, string> | undefined) ?? {}),
    ...((otherGraph.community_labels as Record<string, string> | undefined) ?? {}),
  };
  const sortedCommunityEntries = Object.entries(communityLabels).sort((a, b) => {
    const left = Number.parseInt(a[0], 10);
    const right = Number.parseInt(b[0], 10);
    if (!Number.isNaN(left) && !Number.isNaN(right) && left !== right) {
      return left - right;
    }
    return a[0].localeCompare(b[0]);
  });
  if (sortedCommunityEntries.length > 0) {
    merged.community_labels = Object.fromEntries(sortedCommunityEntries);
  }

  const commitValues = new Set(
    [currentGraph.built_from_commit, otherGraph.built_from_commit]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0),
  );
  merged.built_from_commit = commitValues.size <= 1 ? [...commitValues][0] ?? null : null;
  return merged;
}

export function mergeGraphJsonFiles(
  ancestorPath: string,
  currentPath: string,
  otherPath: string,
): MergeGraphJsonResult {
  const currentRaw = readGraph(currentPath);
  const otherRaw = readGraph(otherPath);
  const ancestorRaw = readGraph(ancestorPath);

  if (!currentRaw && !otherRaw && !ancestorRaw) {
    throw new Error("merge-driver could not read any graph.json input");
  }

  if (!currentRaw && otherRaw) {
    writeFileSync(resolve(currentPath), JSON.stringify(otherRaw, null, 2), "utf-8");
    return {
      out: resolve(currentPath),
      nodeCount: otherRaw.nodes?.length ?? 0,
      edgeCount: (otherRaw.links ?? otherRaw.edges ?? []).length,
    };
  }

  if (!currentRaw) {
    throw new Error(`merge-driver could not read current graph: ${resolve(currentPath)}`);
  }

  const graphs = [currentRaw, otherRaw].filter((value): value is SerializedGraphData => value !== null);
  const merged = createGraph(graphs.some((graph) => graph.directed === true));

  for (const raw of graphs) {
    for (const node of raw.nodes ?? []) {
      const { id, ...attrs } = node;
      merged.mergeNode(id, attrs);
    }
  }

  for (const raw of graphs) {
    for (const link of raw.links ?? raw.edges ?? []) {
      const { source, target, ...attrs } = link;
      if (!merged.hasNode(source) || !merged.hasNode(target)) continue;
      try {
        merged.mergeEdge(source, target, attrs as Record<string, unknown>);
      } catch {
        // Keep the first compatible edge if a duplicate merge collides.
      }
    }
  }

  const hyperedges: Array<Record<string, unknown>> = [];
  const seenHyperedges = new Set<string>();
  for (const raw of graphs) {
    for (const hyperedge of raw.hyperedges ?? []) {
      const key = hyperedgeSortKey(hyperedge);
      if (seenHyperedges.has(key)) continue;
      seenHyperedges.add(key);
      hyperedges.push(hyperedge);
    }
  }
  if (hyperedges.length > 0) {
    merged.setAttribute("hyperedges", hyperedges);
  }

  const serialized = serializeGraph(merged);
  serialized.graph = mergeGraphAttributes(currentRaw, otherRaw);
  serialized.nodes = [...(serialized.nodes ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  serialized.links = [...(serialized.links ?? [])].sort((a, b) => edgeSortKey(a).localeCompare(edgeSortKey(b)));
  if (serialized.hyperedges) {
    serialized.hyperedges = [...serialized.hyperedges].sort((a, b) => hyperedgeSortKey(a).localeCompare(hyperedgeSortKey(b)));
  }

  const outPath = resolve(currentPath);
  writeFileSync(outPath, JSON.stringify(serialized, null, 2), "utf-8");
  return {
    out: outPath,
    nodeCount: serialized.nodes?.length ?? 0,
    edgeCount: serialized.links?.length ?? 0,
  };
}
