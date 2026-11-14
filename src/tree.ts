import Graph from "graphology";

import { forEachTraversalNeighbor, readerPairEdges, type PairEdge } from "./graph.js";
import { sanitizeLabel } from "./security.js";

export interface RenderTreeOptions {
  depth?: number;
  maxChildren?: number;
}

interface TreeNeighbor {
  id: string;
  label: string;
  entries: Array<{ relation: string; confidence: string | null; orientation: PairEdge["orientation"] }>;
}

function nodeLabel(G: Graph, nodeId: string): string {
  const attrs = G.getNodeAttributes(nodeId);
  const label = sanitizeLabel((attrs.label as string | undefined) ?? nodeId);
  const sourceFile = typeof attrs.source_file === "string" && attrs.source_file.length > 0
    ? attrs.source_file
    : null;
  return sourceFile ? `${label} [${sourceFile}]` : label;
}

function sortedNeighbors(G: Graph, nodeId: string): TreeNeighbor[] {
  const neighbors = new Map<string, TreeNeighbor>();
  forEachTraversalNeighbor(G, nodeId, (neighborId) => {
    const label = nodeLabel(G, neighborId);
    neighbors.set(neighborId, {
      id: neighborId,
      label,
      entries: readerPairEdges(G, nodeId, neighborId).map(({ attrs, orientation }) => ({
        relation: typeof attrs.relation === "string" && attrs.relation ? attrs.relation : "related_to",
        confidence: typeof attrs.confidence === "string" && attrs.confidence ? attrs.confidence : null,
        orientation,
      })),
    });
  });
  const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
  return [...neighbors.values()].sort((a, b) => G.multi
    ? compare(a.label, b.label) || compare(a.id, b.id)
    : a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
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
      const first = neighbor.entries[0];
      const label = neighbor.entries.length === 1 && first?.orientation !== "reverse"
        ? `${first?.relation ?? "related_to"} -> ${neighbor.label}`
        : `${neighbor.entries.map(entry => `${entry.orientation === "reverse" ? "<-- " : ""}${entry.relation}${entry.confidence ? ` [${entry.confidence}]` : ""}${entry.orientation === "reverse" ? "" : " -->"}`).join("; ")} ${neighbor.label}`;
      lines.push(
        `${prefix}${branch}${label}${seen ? " (seen)" : ""}`,
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
