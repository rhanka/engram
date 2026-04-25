import Graph from "graphology";

export interface SerializedGraphData {
  directed?: boolean;
  multigraph?: boolean;
  graph?: Record<string, unknown>;
  nodes?: Array<Record<string, unknown> & { id: string }>;
  links?: Array<Record<string, unknown> & { source: string; target: string }>;
  edges?: Array<Record<string, unknown> & { source: string; target: string }>;
  hyperedges?: Array<Record<string, unknown>>;
}

export function createGraph(directed: boolean = false): Graph {
  return new Graph({ type: directed ? "directed" : "undirected", multi: false });
}

export function isDirectedGraph(G: Graph): boolean {
  return G.type === "directed";
}

export function loadGraphFromData(raw: SerializedGraphData): Graph {
  const G = createGraph(raw.directed === true);

  for (const [key, value] of Object.entries(raw.graph ?? {})) {
    G.setAttribute(key, value);
  }

  for (const node of raw.nodes ?? []) {
    const { id, ...attrs } = node;
    G.mergeNode(id, attrs);
  }

  for (const link of raw.links ?? raw.edges ?? []) {
    const { source, target, ...attrs } = link;
    if (!G.hasNode(source) || !G.hasNode(target)) continue;
    try {
      G.mergeEdge(source, target, attrs);
    } catch {
      /* ignore duplicate merge failures */
    }
  }

  if (raw.hyperedges && raw.hyperedges.length > 0) {
    G.setAttribute("hyperedges", raw.hyperedges);
  }

  return G;
}

export function serializeGraph(G: Graph): SerializedGraphData {
  const nodes: Array<Record<string, unknown> & { id: string }> = [];
  G.forEachNode((nodeId, attrs) => {
    nodes.push({ id: nodeId, ...attrs });
  });

  const links: Array<Record<string, unknown> & { source: string; target: string }> = [];
  G.forEachEdge((_edge, attrs, source, target) => {
    links.push({ source, target, ...attrs });
  });

  const graph = G.getAttributes();
  const hyperedges = G.getAttribute("hyperedges") as Array<Record<string, unknown>> | undefined;

  return {
    directed: isDirectedGraph(G),
    multigraph: false,
    graph,
    nodes,
    links,
    ...(hyperedges && hyperedges.length > 0 ? { hyperedges } : {}),
  };
}

export function toUndirectedGraph(G: Graph): Graph {
  if (!isDirectedGraph(G)) return G.copy();

  const copy = createGraph(false);

  for (const [key, value] of Object.entries(G.getAttributes())) {
    copy.setAttribute(key, value);
  }

  G.forEachNode((nodeId, attrs) => {
    copy.mergeNode(nodeId, attrs);
  });

  G.forEachEdge((_edge, attrs, source, target) => {
    if (!copy.hasNode(source) || !copy.hasNode(target)) return;
    try {
      copy.mergeEdge(source, target, attrs);
    } catch {
      /* ignore duplicate merge failures */
    }
  });

  return copy;
}

export function forEachTraversalNeighbor(
  G: Graph,
  node: string,
  callback: (neighbor: string) => void,
): void {
  if (isDirectedGraph(G)) {
    G.forEachOutboundNeighbor(node, callback);
    return;
  }
  G.forEachNeighbor(node, callback);
}

export function traversalNeighbors(G: Graph, node: string): string[] {
  const neighbors: string[] = [];
  forEachTraversalNeighbor(G, node, (neighbor) => {
    neighbors.push(neighbor);
  });
  return neighbors;
}
