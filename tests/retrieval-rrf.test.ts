import { describe, expect, it } from "vitest";

import { DEFAULT_RRF_K, reciprocalRankFusion } from "../src/retrieval/rrf.js";

describe("RRF fusion (T5 / C5)", () => {
  it("default k is 60", () => {
    expect(DEFAULT_RRF_K).toBe(60);
  });

  it("a node ranked high in TWO lists outranks one ranked high in only ONE", () => {
    const listA = ["x", "y", "z"]; // x rank1, y rank2, z rank3
    const listB = ["x", "w", "v"]; // x rank1 again
    const fused = reciprocalRankFusion([listA, listB]);
    // x appears rank1 in both → highest fused score.
    expect(fused[0]!.id).toBe("x");
    // y is only in listA at rank2; x dominates.
    const xScore = fused.find((f) => f.id === "x")!.score;
    const yScore = fused.find((f) => f.id === "y")!.score;
    expect(xScore).toBeGreaterThan(yScore);
  });

  it("computes score(d) = Σ 1/(k + rank) with k=60", () => {
    const fused = reciprocalRankFusion([["a"], ["a"]], { k: 60 });
    // a is rank1 in both lists: 1/61 + 1/61.
    expect(fused[0]!.score).toBeCloseTo(2 / 61, 12);
  });

  it("with a SINGLE list, RRF is the identity over that list (C5a step 2)", () => {
    const single = ["p", "q", "r", "s"];
    const fused = reciprocalRankFusion([single]);
    expect(fused.map((f) => f.id)).toEqual(single);
  });

  it("is deterministic; ties break by id ascending", () => {
    // two disjoint lists, both rank1 → equal scores → id order.
    const fused = reciprocalRankFusion([["b"], ["a"]]);
    expect(fused.map((f) => f.id)).toEqual(["a", "b"]);
    const again = reciprocalRankFusion([["b"], ["a"]]);
    expect(again).toEqual(fused);
  });

  it("assigns 1-based fused ranks in order", () => {
    const fused = reciprocalRankFusion([["a", "b", "c"]]);
    expect(fused.map((f) => f.rank)).toEqual([1, 2, 3]);
  });

  it("handles empty input", () => {
    expect(reciprocalRankFusion([])).toEqual([]);
    expect(reciprocalRankFusion([[]])).toEqual([]);
  });
});
