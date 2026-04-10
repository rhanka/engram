import { describe, it, expect } from "vitest";
import Graph from "graphology";
import { cluster, cohesionScore, scoreAll } from "../src/cluster.js";

function makeGraph(edges: [string, string][]): InstanceType<typeof Graph> {
  const G = new Graph({ type: "undirected" });
  for (const [u, v] of edges) {
    G.mergeNode(u);
    G.mergeNode(v);
    G.mergeEdge(u, v);
  }
  return G;
}

describe("cluster", () => {
  it("returns empty map for empty graph", () => {
    const G = new Graph({ type: "undirected" });
    const result = cluster(G);
    expect(result.size).toBe(0);
  });

  it("assigns each isolate its own community for edgeless graph", () => {
    const G = new Graph({ type: "undirected" });
    G.addNode("a");
    G.addNode("b");
    G.addNode("c");
    const result = cluster(G);
    expect(result.size).toBe(3);
    // Each community should have exactly 1 node
    for (const nodes of result.values()) {
      expect(nodes).toHaveLength(1);
    }
  });

  it("detects communities in a graph with clear structure", () => {
    // Two cliques connected by a single bridge
    const G = makeGraph([
      ["a1", "a2"], ["a2", "a3"], ["a1", "a3"],
      ["b1", "b2"], ["b2", "b3"], ["b1", "b3"],
      ["a3", "b1"], // bridge
    ]);
    const result = cluster(G);
    expect(result.size).toBeGreaterThanOrEqual(1);
    // All nodes should be assigned
    const allNodes = [...result.values()].flat();
    expect(allNodes.sort()).toEqual(G.nodes().sort());
  });

  it("sorts communities by size descending", () => {
    const G = makeGraph([
      ["a", "b"], ["b", "c"], ["a", "c"],
      ["d", "e"],
    ]);
    const result = cluster(G);
    const sizes = [...result.values()].map((v) => v.length);
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]!).toBeLessThanOrEqual(sizes[i - 1]!);
    }
  });
});

describe("cohesionScore", () => {
  it("returns 1.0 for single node", () => {
    const G = new Graph({ type: "undirected" });
    G.addNode("a");
    expect(cohesionScore(G, ["a"])).toBe(1.0);
  });

  it("returns 1.0 for complete subgraph", () => {
    const G = makeGraph([["a", "b"], ["b", "c"], ["a", "c"]]);
    expect(cohesionScore(G, ["a", "b", "c"])).toBe(1.0);
  });

  it("returns less than 1.0 for incomplete subgraph", () => {
    const G = makeGraph([["a", "b"], ["b", "c"]]);
    const score = cohesionScore(G, ["a", "b", "c"]);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1.0);
  });
});

describe("scoreAll", () => {
  it("scores all communities", () => {
    const G = makeGraph([["a", "b"], ["c", "d"]]);
    const communities = new Map<number, string[]>([
      [0, ["a", "b"]],
      [1, ["c", "d"]],
    ]);
    const scores = scoreAll(G, communities);
    expect(scores.size).toBe(2);
    expect(scores.get(0)).toBe(1.0);
    expect(scores.get(1)).toBe(1.0);
  });
});
