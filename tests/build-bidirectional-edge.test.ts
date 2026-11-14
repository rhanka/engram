import { getPairEdges } from "../src/graph.js";
import { describe, expect, it } from "vitest";
import { buildFromJson } from "../src/build.js";

/** Parallel and reciprocal assertions retain their independent identity. */
describe("buildFromJson — bidirectional calls pair (F-0819-P1 / #1061)", () => {
  function extraction(edges: Array<{ source: string; target: string; relation: string }>) {
    return {
      nodes: [
        { id: "a", label: "a", type: "function", source_file: "src/a.ts" },
        { id: "b", label: "b", type: "function", source_file: "src/b.ts" },
      ],
      edges: edges.map((e) => ({ ...e, confidence: "EXTRACTED", source_file: "src/a.ts" })),
      input_tokens: 0,
      output_tokens: 0,
    };
  }

  it("preserves both assertion directions when the reciprocal arrives", () => {
    const G = buildFromJson(
      extraction([
        { source: "a", target: "b", relation: "calls" },
        { source: "b", target: "a", relation: "calls" },
      ]),
    );
    expect(G.size).toBe(2);
    expect(getPairEdges(G, "a", "b").map(e => [e.src, e.tgt])).toEqual([["a", "b"], ["b", "a"]]);
    const attrs = getPairEdges(G, "a", "b")[0]!.attrs;
    // The deterministic first tuple is a -> b; its reciprocal also survives.
    expect(attrs._src).toBe("a");
    expect(attrs._tgt).toBe("b");
  });

  it("replays an identical emission without adding an edge or observation", () => {
    const G = buildFromJson(
      extraction([
        { source: "a", target: "b", relation: "calls" },
        { source: "a", target: "b", relation: "calls" }, // exact duplicate, same direction
      ]),
    );
    expect(G.size).toBe(1);
    const attrs = getPairEdges(G, "a", "b")[0]!.attrs;
    expect(attrs._src).toBe("a");
    expect(attrs._tgt).toBe("b");
    expect(attrs.evidence_observations).toHaveLength(1);
  });
});
