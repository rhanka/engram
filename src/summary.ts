import Graph from "graphology";

import { isConceptNode, isFileNode } from "./analyze.js";
import { isDirectedGraph } from "./graph.js";
import { sanitizeLabel } from "./security.js";

export interface FirstHopHub {
  id: string;
  label: string;
  degree: number;
  source_file: string | null;
  community: number | null;
  community_name: string | null;
}

export interface FirstHopCommunity {
  id: number;
  label: string;
  size: number;
  internal_edges: number;
  density: number;
  top_nodes: FirstHopHub[];
}

export interface FirstHopSummary {
  graph: {
    nodes: number;
    edges: number;
    directed: boolean;
    density: number;
    average_degree: number;
    communities: number;
  };
  top_hubs: FirstHopHub[];
  key_communities: FirstHopCommunity[];
  next_best_action: string;
}

export interface FirstHopSummaryOptions {
  topHubs?: number;
  topCommunities?: number;
  nodesPerCommunity?: number;
}

function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

function maybeCommunity(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function communityLabels(G: Graph): Map<number, string> {
  const labels = new Map<number, string>();
  const raw = G.getAttribute("community_labels") as Record<string, unknown> | undefined;
  for (const [key, value] of Object.entries(raw ?? {})) {
    const cid = Number.parseInt(key, 10);
    if (Number.isFinite(cid) && typeof value === "string" && value.trim().length > 0) {
      labels.set(cid, sanitizeLabel(value));
    }
  }

  G.forEachNode((_nodeId, attrs) => {
    const cid = maybeCommunity(attrs.community);
    if (cid === null || labels.has(cid)) return;
    if (typeof attrs.community_name === "string" && attrs.community_name.trim().length > 0) {
      labels.set(cid, sanitizeLabel(attrs.community_name));
    }
  });
  return labels;
}

function graphDensity(nodeCount: number, edgeCount: number, directed: boolean): number {
  if (nodeCount <= 1) return 0;
  const possible = directed
    ? nodeCount * (nodeCount - 1)
    : (nodeCount * (nodeCount - 1)) / 2;
  return possible > 0 ? round(edgeCount / possible) : 0;
}

function nodeSummary(G: Graph, nodeId: string, labels: Map<number, string>): FirstHopHub {
  const attrs = G.getNodeAttributes(nodeId);
  const community = maybeCommunity(attrs.community);
  return {
    id: nodeId,
    label: sanitizeLabel((attrs.label as string | undefined) ?? nodeId),
    degree: G.degree(nodeId),
    source_file: typeof attrs.source_file === "string" && attrs.source_file.length > 0
      ? attrs.source_file
      : null,
    community,
    community_name: community === null ? null : (labels.get(community) ?? `Community ${community}`),
  };
}

function compareHubs(a: FirstHopHub, b: FirstHopHub): number {
  return (
    b.degree - a.degree ||
    compareStrings(a.label, b.label) ||
    compareStrings(a.id, b.id)
  );
}

function communityMembership(G: Graph): Map<number, string[]> {
  const result = new Map<number, string[]>();
  G.forEachNode((nodeId, attrs) => {
    const cid = maybeCommunity(attrs.community);
    if (cid === null) return;
    if (!result.has(cid)) result.set(cid, []);
    result.get(cid)!.push(nodeId);
  });
  for (const nodes of result.values()) {
    nodes.sort((a, b) => compareStrings(a, b));
  }
  return result;
}

function internalEdgeCounts(G: Graph): Map<number, number> {
  const counts = new Map<number, number>();
  G.forEachEdge((_edge, _attrs, source, target) => {
    const sourceCommunity = maybeCommunity(G.getNodeAttribute(source, "community"));
    const targetCommunity = maybeCommunity(G.getNodeAttribute(target, "community"));
    if (sourceCommunity === null || targetCommunity === null || sourceCommunity !== targetCommunity) {
      return;
    }
    counts.set(sourceCommunity, (counts.get(sourceCommunity) ?? 0) + 1);
  });
  return counts;
}

function buildNextBestAction(summary: Pick<FirstHopSummary, "top_hubs" | "key_communities">): string {
  const hub = summary.top_hubs[0];
  if (hub) {
    return `Start with get_neighbors on "${hub.label}", then use query_graph for the user's specific question.`;
  }
  const community = summary.key_communities[0];
  if (community) {
    return `Start with get_community ${community.id} (${community.label}), then use query_graph for the user's specific question.`;
  }
  return "Build or refresh the graph before attempting graph-guided analysis.";
}

export function buildFirstHopSummary(
  G: Graph,
  options: FirstHopSummaryOptions = {},
): FirstHopSummary {
  const topHubsLimit = Math.max(0, options.topHubs ?? 5);
  const topCommunitiesLimit = Math.max(0, options.topCommunities ?? 5);
  const nodesPerCommunity = Math.max(0, options.nodesPerCommunity ?? 3);
  const directed = isDirectedGraph(G);
  const labels = communityLabels(G);
  const memberships = communityMembership(G);
  const internalEdges = internalEdgeCounts(G);

  const allHubCandidates = G.nodes()
    .map((nodeId) => nodeSummary(G, nodeId, labels))
    .filter((node) => node.degree > 0);
  const abstractionHubs = allHubCandidates
    .filter((node) => !isFileNode(G, node.id) && !isConceptNode(G, node.id));
  const hubs = (abstractionHubs.length > 0 ? abstractionHubs : allHubCandidates)
    .sort(compareHubs)
    .slice(0, topHubsLimit);

  const keyCommunities = [...memberships.entries()]
    .map(([cid, nodes]) => {
      const topNodes = nodes
        .map((nodeId) => nodeSummary(G, nodeId, labels))
        .sort(compareHubs)
        .slice(0, nodesPerCommunity);
      const edgeCount = internalEdges.get(cid) ?? 0;
      return {
        id: cid,
        label: labels.get(cid) ?? `Community ${cid}`,
        size: nodes.length,
        internal_edges: edgeCount,
        density: graphDensity(nodes.length, edgeCount, directed),
        top_nodes: topNodes,
      } satisfies FirstHopCommunity;
    })
    .sort((a, b) => (
      b.size - a.size ||
      b.internal_edges - a.internal_edges ||
      compareStrings(a.label, b.label) ||
      a.id - b.id
    ))
    .slice(0, topCommunitiesLimit);

  const averageDegree = G.order > 0
    ? round(G.nodes().reduce((sum, nodeId) => sum + G.degree(nodeId), 0) / G.order)
    : 0;

  const summary: FirstHopSummary = {
    graph: {
      nodes: G.order,
      edges: G.size,
      directed,
      density: graphDensity(G.order, G.size, directed),
      average_degree: averageDegree,
      communities: memberships.size,
    },
    top_hubs: hubs,
    key_communities: keyCommunities,
    next_best_action: "",
  };
  summary.next_best_action = buildNextBestAction(summary);
  return summary;
}

function hubLine(hub: FirstHopHub): string {
  const bits = [`degree ${hub.degree}`];
  if (hub.community !== null) {
    bits.push(`community ${hub.community}${hub.community_name ? ` ${hub.community_name}` : ""}`);
  }
  if (hub.source_file) bits.push(hub.source_file);
  return `${hub.label} (${bits.join(", ")})`;
}

export function firstHopSummaryToText(summary: FirstHopSummary): string {
  const lines = [
    "Graphify First-Hop Summary",
    `Graph: ${summary.graph.nodes} nodes, ${summary.graph.edges} edges, ${summary.graph.communities} communities, density ${summary.graph.density}, average degree ${summary.graph.average_degree}, ${summary.graph.directed ? "directed" : "undirected"}`,
    "",
    "Top hubs:",
  ];

  if (summary.top_hubs.length === 0) {
    lines.push("  none");
  } else {
    summary.top_hubs.forEach((hub, index) => {
      lines.push(`  ${index + 1}. ${hubLine(hub)}`);
    });
  }

  lines.push("", "Key communities:");
  if (summary.key_communities.length === 0) {
    lines.push("  none");
  } else {
    summary.key_communities.forEach((community, index) => {
      const topLabels = community.top_nodes.map((node) => node.label).join(", ") || "none";
      lines.push(
        `  ${index + 1}. Community ${community.id} - ${community.label}: ${community.size} nodes, ${community.internal_edges} internal edges, density ${community.density}; top nodes: ${topLabels}`,
      );
    });
  }

  lines.push("", `Next best action: ${summary.next_best_action}`);
  return lines.join("\n");
}
