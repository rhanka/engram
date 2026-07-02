import { describe, expect, it } from "vitest";
import Graph from "graphology";

import { personalizedPageRank } from "../src/retrieval/ppr.js";
import { buildSeeds, fusedSeedVector } from "../src/retrieval/query.js";
import { buildSearchIndex } from "../src/search-index-emitter.js";
import type { CsrAdjacency } from "../src/search-index.js";

/** A path graph 0-1-2-3-4 (CSR), uniform weights. */
function pathCsr(n: number): { adjacency: CsrAdjacency; N: number } {
  const node_ptr: number[] = [];
  const neighbors: number[] = [];
  const edge_weights: number[] = [];
  for (let i = 0; i < n; i++) {
    node_ptr.push(neighbors.length);
    if (i > 0) {
      neighbors.push(i - 1);
      edge_weights.push(1);
    }
    if (i < n - 1) {
      neighbors.push(i + 1);
      edge_weights.push(1);
    }
  }
  node_ptr.push(neighbors.length);
  return { adjacency: { node_ptr, neighbors, edge_weights }, N: n };
}

describe("Personalized PageRank (T6 / C6-C7)", () => {
  it("converges within the iteration cap", () => {
    const { adjacency, N } = pathCsr(5);
    const result = personalizedPageRank(adjacency, N, new Map([[0, 1]]));
    expect(result.converged).toBe(true);
    expect(result.iterations).toBeGreaterThan(0);
    expect(result.iterations).toBeLessThanOrEqual(50);
  });

  it("scores form a distribution (sum ~1, non-negative)", () => {
    const { adjacency, N } = pathCsr(5);
    const result = personalizedPageRank(adjacency, N, new Map([[2, 1]]));
    const total = result.scores.reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 6);
    expect(result.scores.every((s) => s >= 0)).toBe(true);
  });

  it("with all seed mass on ONE node, mass concentrates there and decays with distance", () => {
    const { adjacency, N } = pathCsr(5);
    // seed node 0.
    const result = personalizedPageRank(adjacency, N, new Map([[0, 1]]));
    // node 0 gets the most mass; mass decays monotonically along the path.
    expect(result.scores[0]!).toBeGreaterThan(result.scores[1]!);
    expect(result.scores[1]!).toBeGreaterThan(result.scores[2]!);
    expect(result.scores[2]!).toBeGreaterThan(result.scores[3]!);
    expect(result.scores[3]!).toBeGreaterThan(result.scores[4]!);
  });

  it("is PERSONALIZED, not uniform PageRank (the consensus amendment)", () => {
    const { adjacency, N } = pathCsr(5);
    const seededAt0 = personalizedPageRank(adjacency, N, new Map([[0, 1]]));
    const seededAt4 = personalizedPageRank(adjacency, N, new Map([[4, 1]]));
    // The two personalizations yield DIFFERENT stationary distributions — proof
    // the teleport is biased to the seed, not uniform.
    expect(seededAt0.scores).not.toEqual(seededAt4.scores);
    // node 0 dominates when seeded at 0; node 4 dominates when seeded at 4.
    expect(seededAt0.scores[0]!).toBeGreaterThan(seededAt0.scores[4]!);
    expect(seededAt4.scores[4]!).toBeGreaterThan(seededAt4.scores[0]!);
  });

  it("empty teleport falls back to uniform PageRank", () => {
    const { adjacency, N } = pathCsr(5);
    const uniform = personalizedPageRank(adjacency, N, new Map());
    // symmetric path → endpoints equal, center highest.
    expect(uniform.scores[0]!).toBeCloseTo(uniform.scores[4]!, 9);
    expect(uniform.scores[2]!).toBeGreaterThan(uniform.scores[0]!);
  });

  it("is deterministic (fixed CSR order + tolerance)", () => {
    const { adjacency, N } = pathCsr(5);
    const a = personalizedPageRank(adjacency, N, new Map([[1, 1]]));
    const b = personalizedPageRank(adjacency, N, new Map([[1, 1]]));
    expect(a.scores).toEqual(b.scores);
    expect(a.iterations).toBe(b.iterations);
  });

  it("respects alpha (lower alpha → more mass stays on the seed)", () => {
    const { adjacency, N } = pathCsr(5);
    const lowAlpha = personalizedPageRank(adjacency, N, new Map([[0, 1]]), { alpha: 0.5 });
    const highAlpha = personalizedPageRank(adjacency, N, new Map([[0, 1]]), { alpha: 0.95 });
    // lower damping → less spreading → more mass on the seed.
    expect(lowAlpha.scores[0]!).toBeGreaterThan(highAlpha.scores[0]!);
  });

  it("the personalization vector is the NORMALIZED FUSED-SEED scores (C5a step 3)", () => {
    const G = new Graph({ type: "undirected" });
    G.mergeNode("a", { label: "alpha keyword", community: 0 });
    G.mergeNode("b", { label: "beta", community: 0 });
    G.mergeNode("c", { label: "gamma", community: 0 });
    G.mergeEdge("a", "b", { confidence: "EXTRACTED" });
    G.mergeEdge("b", "c", { confidence: "EXTRACTED" });
    const index = buildSearchIndex(G);
    const { seeds } = buildSeeds(index, "alpha keyword");
    const vector = fusedSeedVector(seeds);
    // map nodeId-keyed vector to docId-keyed teleport.
    const docIndex = new Map(index.docs.map((d, i) => [d.nodeId, i]));
    const teleport = new Map<number, number>();
    for (const [nid, w] of vector) teleport.set(docIndex.get(nid)!, w);
    const result = personalizedPageRank(index.adjacency, index.docs.length, teleport);
    // seed "a" should carry the most PPR mass.
    const ai = docIndex.get("a")!;
    expect(result.scores[ai]!).toBe(Math.max(...result.scores));
  });
});

describe("PPR latency budget (T7 / INV-7)", () => {
  it("runs well within the ~150ms budget on a mystery-scale graph (~2k nodes / ~3.7k edges)", () => {
    // Build a synthetic ~2000-node graph with ~3700 edges (a ring + chords),
    // exercising the same CSR power iteration the mystery graph would.
    const N = 2000;
    const node_ptr: number[] = [];
    const neighbors: number[] = [];
    const edge_weights: number[] = [];
    // Adjacency as a map first (so we can build a symmetric CSR deterministically).
    const adj: Array<Array<[number, number]>> = Array.from({ length: N }, () => []);
    const addEdge = (u: number, v: number, w: number) => {
      adj[u]!.push([v, w]);
      adj[v]!.push([u, w]);
    };
    for (let i = 0; i < N; i++) addEdge(i, (i + 1) % N, 1); // ring (N edges)
    for (let i = 0; i < N; i += 1) {
      if (i % 2 === 0) addEdge(i, (i + 7) % N, 0.6); // ~1000 chords
    }
    for (let i = 0; i < N; i += 3) addEdge(i, (i + 53) % N, 0.3); // ~700 chords
    for (let i = 0; i < N; i++) {
      node_ptr.push(neighbors.length);
      const sorted = adj[i]!.slice().sort((a, b) => a[0] - b[0]);
      for (const [v, w] of sorted) {
        neighbors.push(v);
        edge_weights.push(w);
      }
    }
    node_ptr.push(neighbors.length);
    const adjacency: CsrAdjacency = { node_ptr, neighbors, edge_weights };
    const edgeCount = neighbors.length / 2;
    expect(edgeCount).toBeGreaterThan(3000);

    const teleport = new Map<number, number>([
      [10, 0.5],
      [500, 0.3],
      [1500, 0.2],
    ]);

    // Warm + measure p-ish: run a few times, take the median.
    const samples: number[] = [];
    for (let run = 0; run < 7; run++) {
      const start = performance.now();
      const result = personalizedPageRank(adjacency, N, teleport);
      const elapsed = performance.now() - start;
      expect(result.scores.length).toBe(N);
      samples.push(elapsed);
    }
    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)]!;
    // The C7 budget is ~150ms p95 in-browser. Node is faster; assert a generous
    // ceiling so the test is a real gate without being flaky on CI hardware.
    expect(median).toBeLessThan(150);
  });
});
