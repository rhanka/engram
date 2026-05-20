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

  it("accepts directed graphs and clusters them via an undirected pass", () => {
    const G = new Graph({ type: "directed" });
    G.mergeNode("a");
    G.mergeNode("b");
    G.mergeNode("c");
    G.mergeNode("d");
    G.mergeEdge("a", "b");
    G.mergeEdge("b", "c");
    G.mergeEdge("c", "a");
    G.mergeEdge("c", "d");

    const result = cluster(G);
    const allNodes = [...result.values()].flat().sort();

    expect(allNodes).toEqual(["a", "b", "c", "d"]);
  });

  it("assigns deterministic community IDs across equivalent insertion orders", async () => {
    const { vi } = await import("vitest");
    vi.resetModules();

    const louvainMock = vi.fn();
    vi.doMock("graphology-communities-louvain", () => ({ default: louvainMock }));
    const { cluster: isolatedCluster } = await import("../src/cluster.js");

    louvainMock.mockImplementation((graph: Graph) => {
      const partition: Record<string, number> = {};
      const nodes = graph.nodes();
      nodes.forEach((node, index) => {
        partition[node] = index < 2 ? 1 : 0;
      });
      return partition;
    });

    const first = new Graph({ type: "undirected" });
    for (const node of ["a", "c", "b", "d"]) {
      first.mergeNode(node);
    }
    first.mergeEdge("a", "b");
    first.mergeEdge("c", "d");

    const second = new Graph({ type: "undirected" });
    for (const node of ["d", "b", "c", "a"]) {
      second.mergeNode(node);
    }
    second.mergeEdge("a", "b");
    second.mergeEdge("c", "d");

    expect([...isolatedCluster(first).entries()]).toEqual([
      [0, ["a", "b"]],
      [1, ["c", "d"]],
    ]);
    expect([...isolatedCluster(second).entries()]).toEqual([
      [0, ["a", "b"]],
      [1, ["c", "d"]],
    ]);

    vi.doUnmock("graphology-communities-louvain");
    vi.resetModules();
  });

  it("re-splits low-cohesion large communities on a second pass", async () => {
    const { vi } = await import("vitest");
    vi.resetModules();

    const louvainMock = vi.fn();
    vi.doMock("graphology-communities-louvain", () => ({ default: louvainMock }));
    const { cluster: isolatedCluster } = await import("../src/cluster.js");

    const G = new Graph({ type: "undirected" });
    for (let index = 1; index <= 25; index += 1) {
      G.mergeNode(`alpha-${index}`);
      G.mergeNode(`beta-${index}`);
      if (index > 1) {
        G.mergeEdge(`alpha-${index - 1}`, `alpha-${index}`);
        G.mergeEdge(`beta-${index - 1}`, `beta-${index}`);
      }
    }
    G.mergeEdge("alpha-25", "beta-1");
    for (let index = 1; index <= 150; index += 1) {
      G.mergeNode(`iso-${index}`);
    }

    louvainMock.mockImplementationOnce((graph: Graph) => {
      const partition: Record<string, number> = {};
      graph.forEachNode((node) => {
        partition[node] = 0;
      });
      return partition;
    });
    louvainMock.mockImplementationOnce((graph: Graph) => {
      const partition: Record<string, number> = {};
      graph.forEachNode((node) => {
        partition[node] = node.startsWith("alpha-") ? 0 : 1;
      });
      return partition;
    });

    const result = isolatedCluster(G);
    const multiNodeCommunities = [...result.values()].filter((nodes) => nodes.length > 1);

    expect(louvainMock).toHaveBeenCalledTimes(2);
    expect(multiNodeCommunities).toHaveLength(2);
    expect(multiNodeCommunities.map((nodes) => nodes.length).sort((a, b) => a - b)).toEqual([25, 25]);
    expect(multiNodeCommunities.some((nodes) => nodes.every((node) => node.startsWith("alpha-")))).toBe(true);
    expect(multiNodeCommunities.some((nodes) => nodes.every((node) => node.startsWith("beta-")))).toBe(true);

    vi.doUnmock("graphology-communities-louvain");
    vi.resetModules();
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

  it("returns un-rounded ratio so split-threshold 0.05 fires correctly (upstream 2d783e5)", () => {
    // 6 nodes, 1 edge -> actual=1, possible=15 -> ratio≈0.0666...
    // Rounding to 2 decimals (legacy) gave 0.07 — strictly above the 0.05 split threshold.
    // With rounding dropped we still get >0.05, but more importantly the raw 0.0666 is preserved.
    // Build a graph whose ratio rounds to >=0.05 but whose raw value is strictly less when no
    // rounding happens — easiest: 10 nodes, 2 edges -> 2/45 = 0.0444... which used to round to
    // 0.04 (still <0.05) but at the boundary we want to confirm the un-rounded value matches.
    const G = new Graph({ type: "undirected" });
    for (let i = 0; i < 10; i++) G.addNode(`n${i}`);
    G.mergeEdge("n0", "n1");
    G.mergeEdge("n2", "n3");
    const score = cohesionScore(G, [...G.nodes()]);
    // 2 edges / 45 possible = 0.04444...
    expect(score).toBeCloseTo(2 / 45, 10);
    expect(score).not.toBe(0.04); // un-rounded
  });
});

describe("cluster options (upstream 2d783e5 #919)", () => {
  it("accepts resolution param", () => {
    const G = makeGraph([
      ["a1", "a2"], ["a2", "a3"], ["a1", "a3"],
      ["b1", "b2"], ["b2", "b3"], ["b1", "b3"],
      ["a3", "b1"],
    ]);
    // Just verify the call signature compiles & returns a Map without throwing.
    const r = cluster(G, { resolution: 0.5 });
    expect(r.size).toBeGreaterThan(0);
  });

  it("excludes top-percentile hubs and reattaches them by majority vote", () => {
    // Star with one hub connecting two distinct cliques. With the hub excluded
    // the two cliques get separate communities; the hub then gets reattached
    // to whichever community holds more of its neighbours.
    const G = makeGraph([
      ["a1", "a2"], ["a2", "a3"], ["a1", "a3"],
      ["b1", "b2"], ["b2", "b3"], ["b1", "b3"],
      ["hub", "a1"], ["hub", "a2"], ["hub", "a3"],
      ["hub", "b1"], ["hub", "b2"], ["hub", "b3"],
      ["hub", "c1"], ["hub", "c2"], // extra spokes to bump degree
    ]);
    const r = cluster(G, { excludeHubsPercentile: 90 });
    // Every node must end up in some community
    const allAssigned = new Set<string>();
    for (const nodes of r.values()) {
      for (const n of nodes) allAssigned.add(n);
    }
    expect(allAssigned.has("hub")).toBe(true);
    expect(allAssigned.size).toBe(G.order);
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
