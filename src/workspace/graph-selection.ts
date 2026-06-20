/**
 * Track G Lot 1 / G4 — focus subgraph selection.
 *
 * Pure-data slicing of a Graphify graph.json payload driven by the
 * workspace viewer state. No rendering library, no DOM; this module is
 * the server-side bridge that decides what the graph panel renders.
 *
 * Three modes from `viewState.graph.mode`:
 *
 *   - "overview"  — return the full graph, optionally filtered for weak links.
 *   - "focus"     — BFS `focusHops` around `focusEntityId`, optionally weak-filtered.
 *   - "selection" — limit to nodes whose type or id belongs to the workbench memory
 *                   (`selectedTypes` ∪ `selectedEntities` ∪ `selectionState.entityIds`).
 *
 * The function never mutates its inputs and never reads anything
 * outside the provided graph + state.
 */

import type { WorkspaceViewerState } from "./viewer-state.js";

export interface GraphNodeLike {
  id: string;
  label?: string;
  type?: string;
  node_type?: string;
  community?: number;
  community_name?: string;
  source_file?: string;
  [key: string]: unknown;
}

export interface GraphEdgeLike {
  source: string;
  target: string;
  relation?: string;
  confidence?: string;
  [key: string]: unknown;
}

export interface GraphLike {
  nodes: GraphNodeLike[];
  /** Graphify's persisted graph.json uses `links`; tests/adapters may pass `edges`. */
  links?: GraphEdgeLike[];
  edges?: GraphEdgeLike[];
}

export interface FocusSubgraphMetrics {
  nodes: number;
  edges: number;
  communities: number;
  density: number;
  averageDegree: number;
  /** Highest-degree node id in the slice, or null when empty. */
  topHubId: string | null;
}

export interface FocusSubgraph {
  nodes: GraphNodeLike[];
  edges: GraphEdgeLike[];
  metrics: FocusSubgraphMetrics;
  /** Echoes the slicing mode actually applied (may differ from state when state is invalid). */
  appliedMode: "overview" | "focus" | "selection";
}

function nodeType(node: GraphNodeLike): string | undefined {
  return node.node_type ?? node.type;
}

function isStrongEdge(edge: GraphEdgeLike): boolean {
  const conf = (edge.confidence ?? "EXTRACTED").toUpperCase();
  return conf === "EXTRACTED";
}

function computeMetrics(nodes: GraphNodeLike[], edges: GraphEdgeLike[]): FocusSubgraphMetrics {
  const n = nodes.length;
  const m = edges.length;
  const communities = new Set<number>();
  const degree = new Map<string, number>();
  for (const node of nodes) {
    if (typeof node.community === "number") communities.add(node.community);
    degree.set(node.id, 0);
  }
  for (const edge of edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }
  let topHubId: string | null = null;
  let topDeg = -1;
  for (const [id, deg] of degree) {
    if (deg > topDeg) {
      topDeg = deg;
      topHubId = id;
    }
  }
  const maxPairs = n > 1 ? (n * (n - 1)) / 2 : 0;
  const density = maxPairs > 0 ? m / maxPairs : 0;
  const averageDegree = n > 0 ? (2 * m) / n : 0;
  return {
    nodes: n,
    edges: m,
    communities: communities.size,
    density: Math.round(density * 10000) / 10000,
    averageDegree: Math.round(averageDegree * 10000) / 10000,
    topHubId: n === 0 ? null : topHubId,
  };
}

function bfsNeighbours(
  startId: string,
  hops: number,
  adjacency: Map<string, Set<string>>,
): Set<string> {
  const visited = new Set<string>([startId]);
  if (hops <= 0) return visited;
  let frontier: string[] = [startId];
  for (let h = 0; h < hops; h++) {
    const next: string[] = [];
    for (const cur of frontier) {
      const ns = adjacency.get(cur);
      if (!ns) continue;
      for (const nb of ns) {
        if (visited.has(nb)) continue;
        visited.add(nb);
        next.push(nb);
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }
  return visited;
}

function buildAdjacency(edges: GraphEdgeLike[]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!adj.has(edge.source)) adj.set(edge.source, new Set());
    if (!adj.has(edge.target)) adj.set(edge.target, new Set());
    adj.get(edge.source)!.add(edge.target);
    adj.get(edge.target)!.add(edge.source);
  }
  return adj;
}

/**
 * Returns the subgraph that the workspace graph panel should render,
 * based on the active viewer state. Pure function: never mutates its
 * inputs.
 */
export function computeFocusSubgraph(
  graph: GraphLike,
  state: WorkspaceViewerState,
): FocusSubgraph {
  const allNodes = graph.nodes ?? [];
  const allEdges = graph.edges ?? graph.links ?? [];
  const showWeak = state.viewState.graph.showWeakLinks;
  const candidateEdges = showWeak ? allEdges : allEdges.filter(isStrongEdge);

  let mode: FocusSubgraph["appliedMode"] = state.viewState.graph.mode;

  // Mode "focus" requires a focus entity to be meaningful.
  if (mode === "focus" && !state.focusEntityId) {
    mode = "overview";
  }

  // Mode "selection" requires at least one memory entry to be meaningful.
  const selectionSet = new Set<string>([
    ...state.selectedEntities,
    ...state.selectionState.entityIds,
  ]);
  const selectionTypes = new Set<string>(state.selectedTypes);
  if (mode === "selection" && selectionSet.size === 0 && selectionTypes.size === 0) {
    mode = "overview";
  }

  let nodes: GraphNodeLike[] = [];
  if (mode === "overview") {
    nodes = allNodes.slice();
  } else if (mode === "focus") {
    const adj = buildAdjacency(candidateEdges);
    const hops = state.viewState.graph.focusHops;
    const reachable = bfsNeighbours(state.focusEntityId as string, hops, adj);
    nodes = allNodes.filter((n) => reachable.has(n.id));
  } else {
    // selection
    nodes = allNodes.filter((n) => {
      if (selectionSet.has(n.id)) return true;
      const t = nodeType(n);
      return t !== undefined && selectionTypes.has(t);
    });
  }

  const nodeIds = new Set<string>(nodes.map((n) => n.id));
  const edges = candidateEdges.filter(
    (e) => nodeIds.has(e.source) && nodeIds.has(e.target),
  );

  return {
    nodes,
    edges,
    metrics: computeMetrics(nodes, edges),
    appliedMode: mode,
  };
}
