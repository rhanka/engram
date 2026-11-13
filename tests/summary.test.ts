import { describe, expect, it } from "vitest";
import Graph from "graphology";

import { buildFirstHopSummary, firstHopSummaryToText } from "../src/summary.js";

function makeGraph(): Graph {
  const G = new Graph({ type: "undirected" });
  G.setAttribute("community_labels", {
    "0": "Core Services",
    "1": "Docs + Analysis",
  });
  G.addNode("alpha", {
    label: "AlphaService",
    source_file: "src/alpha.ts",
    community: 0,
  });
  G.addNode("beta", {
    label: "BetaRepository",
    source_file: "src/beta.ts",
    community: 0,
  });
  G.addNode("gamma", {
    label: "GammaDocs",
    source_file: "docs/gamma.md",
    community: 1,
  });
  G.addNode("delta", {
    label: "DeltaAnalyzer",
    source_file: "src/delta.ts",
    community: 1,
  });

  G.addUndirectedEdge("alpha", "beta", { relation: "uses", confidence: "EXTRACTED" });
  G.addUndirectedEdge("beta", "gamma", { relation: "documents", confidence: "INFERRED" });
  G.addUndirectedEdge("beta", "delta", { relation: "calls", confidence: "EXTRACTED" });
  return G;
}

describe("first-hop summary", () => {
  it("returns a compact deterministic graph orientation", () => {
    const summary = buildFirstHopSummary(makeGraph(), {
      topHubs: 3,
      topCommunities: 2,
      nodesPerCommunity: 2,
    });

    expect(summary.graph).toEqual({
      nodes: 4,
      edges: 3,
      directed: false,
      density: 0.5,
      average_degree: 1.5,
      communities: 2,
    });
    expect(summary.top_hubs.map((node) => node.label)).toEqual([
      "BetaRepository",
      "AlphaService",
      "DeltaAnalyzer",
    ]);
    expect(summary.key_communities.map((community) => community.label)).toEqual([
      "Core Services",
      "Docs + Analysis",
    ]);
    expect(summary.key_communities[0]).toMatchObject({
      id: 0,
      size: 2,
      internal_edges: 1,
      density: 1,
    });
    expect(summary.next_best_action).toContain('get_neighbors on "BetaRepository"');
  });

  it("formats stable text for assistant first-hop use", () => {
    const graph = makeGraph();
    const textA = firstHopSummaryToText(buildFirstHopSummary(graph));
    const textB = firstHopSummaryToText(buildFirstHopSummary(graph));

    expect(textA).toBe(textB);
    expect(textA).toContain("Graphify First-Hop Summary");
    expect(textA).toContain("Graph: 4 nodes, 3 edges, 2 communities, density 0.5, average degree 1.5, undirected");
    expect(textA).toContain("1. BetaRepository (degree 3, community 0 Core Services, src/beta.ts)");
    expect(textA).toContain("Community 0 - Core Services: 2 nodes, 1 internal edges, density 1; top nodes: BetaRepository, AlphaService");
    expect(textA).toContain("Next best action:");
  });
});


import { edge as mlEdge, node as mlNode, multiGraph as mlGraph } from "./helpers/multi-links.js";
describe("L0-T density",()=>{
 for(const shape of ["directed","undirected-parallel","loop-only","loop-plus-pair"]) describe(shape,()=>{
  (shape === "directed" ? it : it.fails)("density-directed1-undirected1-loop-excluded",()=>{
   const links=shape==="directed"?[mlEdge(),mlEdge({source:"b",target:"a"})]:shape==="undirected-parallel"?[mlEdge({relation:"reads"}),mlEdge({relation:"writes"})]:shape==="loop-only"?[mlEdge({source:"a",target:"a"})]:[mlEdge(),mlEdge({source:"a",target:"a"})];
   const G=mlGraph(links,[mlNode("a"),mlNode("b")],shape==="directed");
   expect(buildFirstHopSummary(G).graph.density).toBe(shape==="loop-only"?0:1);
  });
 });
});
