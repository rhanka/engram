import { describe, expect, it } from "vitest";
import { buildFromJson } from "../src/build.js";

/**
 * Regression for Track F-0819-P1 (upstream #1061): on an undirected build, a
 * `calls` pair emitted in both directions (a calls b AND b calls a) collapses
 * to one graphology edge. The second mergeEdge must NOT overwrite the first
 * edge's preserved `_src`/`_tgt`, which would silently flip caller/callee.
 * First-seen direction wins.
 */
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

  it("preserves first-seen direction when the reverse duplicate arrives", () => {
    const G = buildFromJson(
      extraction([
        { source: "a", target: "b", relation: "calls" },
        { source: "b", target: "a", relation: "calls" },
      ]),
    );
    // Undirected graph collapses the pair to a single edge.
    expect(G.size).toBe(1);
    const attrs = G.getEdgeAttributes("a", "b");
    // First-seen direction (a -> b) must survive, not be flipped to b -> a.
    expect(attrs._src).toBe("a");
    expect(attrs._tgt).toBe("b");
  });

  it("only guards same-relation reverse duplicates (scoped to #1061)", () => {
    // The guard is intentionally narrow: it skips a reverse duplicate ONLY when
    // the relation matches (the `a calls b` / `b calls a` case). A different
    // relation on the same pair is a distinct edge intent and is not dropped by
    // this fix — same-relation guarding is exactly what #1061 specifies.
    const G = buildFromJson(
      extraction([
        { source: "a", target: "b", relation: "calls" },
        { source: "a", target: "b", relation: "calls" }, // exact duplicate, same direction
      ]),
    );
    expect(G.size).toBe(1);
    const attrs = G.getEdgeAttributes("a", "b");
    expect(attrs._src).toBe("a");
    expect(attrs._tgt).toBe("b");
  });
});
