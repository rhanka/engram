/**
 * Shared community extraction helpers for a loaded graphology graph.
 *
 * Previously private to `cli.ts`; lifted here so the ontology studio can
 * regenerate a profile-aware graph HTML sub-view (Track G D1/D2/D5/D8) using
 * the same community + label derivation as `graphify export html`.
 */
import type Graph from "graphology";

function communityOf(rawCommunity: unknown): number | null {
  if (typeof rawCommunity === "number") return rawCommunity;
  if (typeof rawCommunity === "string" && rawCommunity.trim().length > 0) {
    const parsed = Number.parseInt(rawCommunity, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/** Group node ids by their `community` attribute. */
export function communitiesFromGraph(G: Graph): Map<number, string[]> {
  const communities = new Map<number, string[]>();
  G.forEachNode((nodeId, data) => {
    const community = communityOf(data.community);
    if (community === null) return;
    const members = communities.get(community) ?? [];
    members.push(nodeId);
    communities.set(community, members);
  });
  return communities;
}

/**
 * Resolve a human label per community id. Precedence: graph-level
 * `community_labels` attribute, then any node's `community_name`, then a
 * `Community <id>` fallback so every community is labelled.
 */
export function communityLabelsFromGraph(
  G: Graph,
  communities: Map<number, string[]>,
): Map<number, string> {
  const labels = new Map<number, string>();
  const graphLabels = G.getAttribute("community_labels") as Record<string, unknown> | undefined;
  if (graphLabels && typeof graphLabels === "object") {
    for (const [key, value] of Object.entries(graphLabels)) {
      const community = Number.parseInt(key, 10);
      if (Number.isNaN(community)) continue;
      if (typeof value === "string" && value.trim().length > 0) {
        labels.set(community, value.trim());
      }
    }
  }
  G.forEachNode((_nodeId, data) => {
    const community = communityOf(data.community);
    if (community === null || labels.has(community)) return;
    if (typeof data.community_name === "string" && data.community_name.trim().length > 0) {
      labels.set(community, data.community_name.trim());
    }
  });
  for (const community of communities.keys()) {
    if (!labels.has(community)) labels.set(community, `Community ${community}`);
  }
  return labels;
}
