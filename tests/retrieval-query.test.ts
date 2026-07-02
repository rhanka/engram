import { describe, expect, it } from "vitest";
import Graph from "graphology";

import { bm25Query, buildSeeds, fusedSeedVector } from "../src/retrieval/query.js";
import { buildSearchIndex } from "../src/search-index-emitter.js";

function makeIndex() {
  const G = new Graph({ type: "undirected" });
  G.mergeNode("holmes", {
    label: "Sherlock Holmes",
    description: "the detective who lives at Baker Street",
    community: 0,
  });
  G.mergeNode("watson", { label: "Doctor Watson", description: "the loyal companion", community: 0 });
  G.mergeNode("moriarty", { label: "Professor Moriarty", description: "the criminal mastermind", community: 1 });
  G.mergeNode("london", { label: "London", description: "a foggy city", community: 1 });
  G.mergeEdge("holmes", "watson", { confidence: "EXTRACTED", weight: 1 });
  G.mergeEdge("holmes", "moriarty", { confidence: "INFERRED" });
  G.mergeEdge("moriarty", "london", { confidence: "EXTRACTED" });
  return buildSearchIndex(G);
}

describe("in-browser BM25 query + seeds (C4 / C5a steps 1–2)", () => {
  it("bm25Query returns a ranked seed list keyed by nodeId", () => {
    const index = makeIndex();
    const hits = bm25Query(index, "detective Baker Street");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.nodeId).toBe("holmes");
    expect(hits[0]!.rank).toBe(1);
    expect(hits[0]!.bm25Score).toBeGreaterThan(0);
  });

  it("uses the index's serialized rrfK by default", () => {
    const index = makeIndex();
    const { fusion } = buildSeeds(index, "criminal mastermind");
    expect(fusion.method).toBe("rrf");
    expect(fusion.k).toBe(60);
    expect(fusion.lists).toEqual(["bm25"]);
  });

  it("with a SINGLE seed list the fused order equals the BM25 order (identity)", () => {
    const index = makeIndex();
    const bm = bm25Query(index, "Moriarty London");
    const { seeds } = buildSeeds(index, "Moriarty London");
    expect(seeds.map((s) => s.nodeId)).toEqual(bm.map((h) => h.nodeId));
  });

  it("fuses host multi-query sub-queries (RRF over multiple lists)", () => {
    const index = makeIndex();
    const { seeds, fusion } = buildSeeds(index, "detective", {
      subQueries: ["companion", "criminal"],
    });
    expect(fusion.lists.length).toBe(3); // bm25 + 2 multiquery lists
    expect(fusion.lists[1]).toContain("multiquery:");
    // every seed carries a fused rank/score.
    expect(seeds.every((s) => s.fusedRank >= 1 && s.fusedScore > 0)).toBe(true);
  });

  it("limit caps the seed count", () => {
    const index = makeIndex();
    const { seeds } = buildSeeds(index, "the", { limit: 1 });
    expect(seeds.length).toBeLessThanOrEqual(1);
  });

  it("fusedSeedVector is normalized to sum 1 (C5a step 3 personalization vector)", () => {
    const index = makeIndex();
    const { seeds } = buildSeeds(index, "detective criminal");
    const vector = fusedSeedVector(seeds);
    const total = [...vector.values()].reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 9);
    expect(vector.size).toBe(seeds.length);
  });

  it("empty query yields no seeds and a normalized-empty vector", () => {
    const index = makeIndex();
    const { seeds } = buildSeeds(index, "");
    expect(seeds).toEqual([]);
    expect(fusedSeedVector(seeds).size).toBe(0);
  });
});
