import Graph from "graphology";

import { forEachTraversalNeighbor, isDirectedGraph } from "./graph.js";
import { sanitizeLabel } from "./security.js";

export interface RenderTreeOptions {
  depth?: number;
  maxChildren?: number;
}

interface TreeNeighbor {
  id: string;
  label: string;
  relation: string;
  confidence: string | null;
}

function nodeLabel(G: Graph, nodeId: string): string {
  const attrs = G.getNodeAttributes(nodeId);
  const label = sanitizeLabel((attrs.label as string | undefined) ?? nodeId);
  const sourceFile = typeof attrs.source_file === "string" && attrs.source_file.length > 0
    ? attrs.source_file
    : null;
  return sourceFile ? `${label} [${sourceFile}]` : label;
}

function neighborRelation(G: Graph, sourceId: string, targetId: string): { relation: string; confidence: string | null } {
  let relation = "related_to";
  let confidence: string | null = null;

  G.forEachEdge(sourceId, (_edge, attrs, edgeSource, edgeTarget) => {
    const forward = edgeSource === sourceId && edgeTarget === targetId;
    const reverse = !isDirectedGraph(G) && edgeSource === targetId && edgeTarget === sourceId;
    if (!forward && !reverse) return;
    relation = typeof attrs.relation === "string" && attrs.relation.length > 0 ? attrs.relation : relation;
    confidence = typeof attrs.confidence === "string" && attrs.confidence.length > 0 ? attrs.confidence : confidence;
  });

  return { relation, confidence };
}

function sortedNeighbors(G: Graph, nodeId: string): TreeNeighbor[] {
  const neighbors = new Map<string, TreeNeighbor>();
  forEachTraversalNeighbor(G, nodeId, (neighborId) => {
    const label = nodeLabel(G, neighborId);
    const meta = neighborRelation(G, nodeId, neighborId);
    neighbors.set(neighborId, {
      id: neighborId,
      label,
      relation: meta.relation,
      confidence: meta.confidence,
    });
  });
  return [...neighbors.values()].sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
}

export function renderTree(G: Graph, rootId: string, options: RenderTreeOptions = {}): string {
  const depth = Math.max(0, options.depth ?? 2);
  const maxChildren = Math.max(1, options.maxChildren ?? 12);
  const lines = [nodeLabel(G, rootId)];
  const visited = new Set<string>([rootId]);

  function walk(nodeId: string, prefix: string, remainingDepth: number, parentId: string | null): void {
    if (remainingDepth <= 0) return;
    const neighbors = sortedNeighbors(G, nodeId).filter((neighbor) => neighbor.id !== parentId);
    const visible = neighbors.slice(0, maxChildren);
    for (let index = 0; index < visible.length; index += 1) {
      const neighbor = visible[index]!;
      const last = index === visible.length - 1;
      const branch = last ? "└─ " : "├─ ";
      const seen = visited.has(neighbor.id);
      lines.push(
        `${prefix}${branch}${neighbor.relation} -> ${neighbor.label}${seen ? " (seen)" : ""}`,
      );
      if (!seen) {
        visited.add(neighbor.id);
        walk(neighbor.id, prefix + (last ? "   " : "│  "), remainingDepth - 1, nodeId);
      }
    }
    if (neighbors.length > visible.length) {
      lines.push(`${prefix}${visible.length === 0 ? "└─ " : "└─ "}... and ${neighbors.length - visible.length} more`);
    }
  }

  walk(rootId, "", depth, null);
  return lines.join("\n");
}
