/**
 * Community detection on graphology graphs.
 * Uses Louvain (graphology-communities-louvain).
 * Splits oversized communities. Returns cohesion scores.
 */
import Graph from "graphology";
import louvain from "graphology-communities-louvain";
import { type NumericMapLike, toNumericMap } from "./collections.js";
import { toUndirectedGraph } from "./graph.js";

const MAX_COMMUNITY_FRACTION = 0.25;
const MIN_SPLIT_SIZE = 10;
const COHESION_SPLIT_THRESHOLD = 0.05;
const COHESION_SPLIT_MIN_SIZE = 50;

function edgeSortKey(
  source: string,
  target: string,
  attrs: Record<string, unknown>,
): string {
  return [
    source,
    target,
    String(attrs.relation ?? ""),
    String(attrs.source_file ?? ""),
    String(attrs.confidence ?? ""),
    JSON.stringify(attrs),
  ].join("\0");
}

function canonicalizeForPartition(G: Graph): Graph {
  const base = G.type === "directed" ? toUndirectedGraph(G) : G.copy();
  const copy = new Graph({ type: base.type, multi: false });

  for (const [key, value] of Object.entries(base.getAttributes())) {
    copy.setAttribute(key, value);
  }
  for (const nodeId of [...base.nodes()].sort()) {
    copy.mergeNode(nodeId, base.getNodeAttributes(nodeId));
  }
  const edges: Array<{ source: string; target: string; attrs: Record<string, unknown> }> = [];
  base.forEachEdge((_edge, attrs, source, target) => {
    const [left, right] = source <= target ? [source, target] : [target, source];
    edges.push({ source: left, target: right, attrs: attrs as Record<string, unknown> });
  });
  edges.sort((a, b) => edgeSortKey(a.source, a.target, a.attrs).localeCompare(edgeSortKey(b.source, b.target, b.attrs)));
  for (const edge of edges) {
    try {
      copy.mergeEdge(edge.source, edge.target, edge.attrs);
    } catch {
      /* ignore duplicate merge failures */
    }
  }
  return copy;
}

function partition(G: Graph, resolution: number = 1.0): Map<string, number> {
  // louvain assigns community attribute to each node, returns mapping.
  // Upstream 2d783e5 exposes resolution: >1 → more, smaller communities; <1 → fewer, larger.
  const result = louvain(canonicalizeForPartition(G), {
    randomWalk: false,
    rng: () => 0.5,
    resolution,
  });
  const map = new Map<string, number>();
  for (const [node, cid] of Object.entries(result)) {
    map.set(node, cid as number);
  }
  return map;
}

function splitCommunity(G: Graph, nodes: string[]): string[][] {
  const subgraph = G.copy();
  // Remove nodes not in this community
  const nodeSet = new Set(nodes);
  subgraph.forEachNode((n) => {
    if (!nodeSet.has(n)) subgraph.dropNode(n);
  });

  if (subgraph.size === 0) {
    return nodes.map((n) => [n]);
  }

  try {
    const subPartition = partition(subgraph);
    const subCommunities = new Map<number, string[]>();
    for (const [node, cid] of subPartition) {
      if (!subCommunities.has(cid)) subCommunities.set(cid, []);
      subCommunities.get(cid)!.push(node);
    }
    if (subCommunities.size <= 1) {
      return [[...nodes].sort()];
    }
    return [...subCommunities.values()].map((v) => [...v].sort());
  } catch {
    return [[...nodes].sort()];
  }
}

export interface ClusterOptions {
  /** Louvain resolution. >1 → more, smaller communities. <1 → fewer, larger. Default 1.0. */
  resolution?: number;
  /**
   * If set (0–100), nodes whose degree exceeds this percentile are excluded
   * from partitioning and reattached to their majority-vote neighbour community
   * afterwards. Useful for staging/utility super-hubs that otherwise pull
   * unrelated subsystems into the same community (upstream #919).
   */
  excludeHubsPercentile?: number | null;
}

export function cluster(G: Graph, options: ClusterOptions = {}): Map<number, string[]> {
  if (G.order === 0) return new Map();

  if (G.size === 0) {
    const result = new Map<number, string[]>();
    const sorted = [...G.nodes()].sort();
    sorted.forEach((n, i) => result.set(i, [n]));
    return result;
  }

  const resolution = options.resolution ?? 1.0;
  const excludeHubsPercentile = options.excludeHubsPercentile ?? null;

  // Compute hub exclusion set BEFORE removing anything, using degree on the full graph.
  const hubNodes = new Set<string>();
  if (excludeHubsPercentile !== null && excludeHubsPercentile !== undefined) {
    const degrees: number[] = [];
    G.forEachNode((n) => { degrees.push(G.degree(n)); });
    degrees.sort((a, b) => a - b);
    if (degrees.length > 0) {
      const idx = Math.max(0, Math.floor((degrees.length * excludeHubsPercentile) / 100) - 1);
      const threshold = degrees[idx]!;
      G.forEachNode((n) => {
        if (G.degree(n) > threshold) hubNodes.add(n);
      });
    }
  }

  // Handle isolates separately, also excluding hub nodes from partitioning so
  // they don't pull unrelated subsystems into the same community (#919).
  const isolates: string[] = [];
  const connectedNodes: string[] = [];
  G.forEachNode((n) => {
    if (hubNodes.has(n)) return;
    if (G.degree(n) === 0) {
      isolates.push(n);
    } else {
      connectedNodes.push(n);
    }
  });

  const raw = new Map<number, string[]>();

  if (connectedNodes.length > 0) {
    // Build subgraph of connected nodes (dropping isolates and hubs)
    const connected = G.copy();
    for (const iso of isolates) {
      connected.dropNode(iso);
    }
    for (const hub of hubNodes) {
      if (connected.hasNode(hub)) connected.dropNode(hub);
    }
    const partitionMap = partition(connected, resolution);
    for (const [node, cid] of partitionMap) {
      if (!raw.has(cid)) raw.set(cid, []);
      raw.get(cid)!.push(node);
    }
  }

  // Each isolate becomes its own single-node community
  let nextCid = Math.max(-1, ...raw.keys()) + 1;
  for (const node of isolates) {
    raw.set(nextCid, [node]);
    nextCid++;
  }

  // Reattach excluded hubs by majority-vote neighbour community
  if (hubNodes.size > 0) {
    const nodeCommunity = new Map<string, number>();
    for (const [cid, nodes] of raw) {
      for (const n of nodes) nodeCommunity.set(n, cid);
    }
    const sortedHubs = [...hubNodes].sort();
    for (const hub of sortedHubs) {
      const votes = new Map<number, number>();
      for (const nb of G.neighbors(hub)) {
        const cid = nodeCommunity.get(nb);
        if (cid !== undefined) {
          votes.set(cid, (votes.get(cid) ?? 0) + 1);
        }
      }
      if (votes.size > 0) {
        // pick highest vote count, break ties on smallest cid (matches upstream key=(-votes,c))
        let bestCid = -1;
        let bestVotes = -1;
        for (const [cid, v] of [...votes.entries()].sort((a, b) => a[0] - b[0])) {
          if (v > bestVotes) {
            bestVotes = v;
            bestCid = cid;
          }
        }
        if (!raw.has(bestCid)) raw.set(bestCid, []);
        raw.get(bestCid)!.push(hub);
        nodeCommunity.set(hub, bestCid);
      } else {
        raw.set(nextCid, [hub]);
        nodeCommunity.set(hub, nextCid);
        nextCid++;
      }
    }
  }

  // Split oversized communities
  const maxSize = Math.max(MIN_SPLIT_SIZE, Math.floor(G.order * MAX_COMMUNITY_FRACTION));
  const finalCommunities: string[][] = [];
  for (const nodes of raw.values()) {
    if (nodes.length > maxSize) {
      finalCommunities.push(...splitCommunity(G, nodes));
    } else {
      finalCommunities.push(nodes);
    }
  }

  const secondPass: string[][] = [];
  for (const nodes of finalCommunities) {
    if (nodes.length >= COHESION_SPLIT_MIN_SIZE && cohesionScore(G, nodes) < COHESION_SPLIT_THRESHOLD) {
      const splits = splitCommunity(G, nodes);
      secondPass.push(...(splits.length > 1 ? splits : [nodes]));
    } else {
      secondPass.push(nodes);
    }
  }

  // Re-index by size descending. The sorted-nodes tiebreak makes this a TOTAL
  // order so an identical grouping always gets identical community IDs across
  // runs, regardless of the partitioner's enumeration order (#1090, f5f3a1c).
  // Without sorting the node list before joining, equal-sized communities would
  // be ordered by the (non-seed-stable) order nodes appear in the partition map,
  // producing massive "community churn" in per-node cid diffs even when the
  // actual grouping is reproducible.
  secondPass.sort((a, b) => {
    const bySize = b.length - a.length;
    if (bySize !== 0) return bySize;
    const aKey = [...a].sort().join("\0");
    const bKey = [...b].sort().join("\0");
    return aKey.localeCompare(bKey);
  });
  const result = new Map<number, string[]>();
  secondPass.forEach((nodes, i) => {
    result.set(i, [...nodes].sort());
  });
  return result;
}

/** Ratio of actual intra-community edges to maximum possible. */
export function cohesionScore(G: Graph, communityNodes: string[]): number {
  const n = communityNodes.length;
  if (n <= 1) return 1.0;
  const nodeSet = new Set(communityNodes);
  let actual = 0;
  G.forEachEdge((edge, attrs, source, target) => {
    if (nodeSet.has(source) && nodeSet.has(target)) {
      actual++;
    }
  });
  const possible = (n * (n - 1)) / 2;
  // Upstream 2d783e5: do not round here — the 0.05 split threshold needs the
  // raw ratio so a 0.0666 cohesion does not get clamped to 0.07 and miss the
  // split, while a 0.0444 stays strictly below 0.05.
  return possible > 0 ? actual / possible : 0.0;
}

export function scoreAll(
  G: Graph,
  communities: NumericMapLike<string[]>,
): Map<number, number> {
  const communityMap = toNumericMap(communities);
  const result = new Map<number, number>();
  for (const [cid, nodes] of communityMap) {
    result.set(cid, cohesionScore(G, nodes));
  }
  return result;
}
