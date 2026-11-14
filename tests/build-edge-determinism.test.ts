import { serializeGraph } from "../src/graph.js";
import { describe, expect, it } from "vitest";
import Graph from "graphology";
import { buildFromJson } from "../src/build.js";

/** A no-op rebuild preserves every assertion and reproduces identical bytes. */
describe("buildFromJson — edge order determinism (F-0819-P2 / #1010)", () => {
  function extraction(edges: Array<{ source: string; target: string; relation: string }>) {
    return {
      nodes: [
        { id: "a", label: "a", file_type: "code" as const, type: "function", source_file: "src/a.ts" },
        { id: "b", label: "b", file_type: "code" as const, type: "function", source_file: "src/b.ts" },
        { id: "c", label: "c", file_type: "code" as const, type: "function", source_file: "src/c.ts" },
      ],
      edges: edges.map((e) => ({ ...e, confidence: "EXTRACTED" as const, source_file: "src/a.ts" })),
      input_tokens: 0,
      output_tokens: 0,
    };
  }

  function dump(G: Graph): string {
    return JSON.stringify(serializeGraph(G));
  }

  it("produces the same _src/_tgt regardless of input edge order", () => {
    const edges = [
      { source: "a", target: "b", relation: "calls" },
      { source: "b", target: "c", relation: "calls" },
      { source: "a", target: "c", relation: "references" },
    ];
    const forward = dump(buildFromJson(extraction(edges)));
    const reversed = dump(buildFromJson(extraction([...edges].reverse())));
    expect(reversed).toBe(forward);
  });

  it("keeps both oriented relations with identical bytes under input permutation", () => {
    // Both tuples survive and their serialization has a deterministic order.
    const order1 = dump(
      buildFromJson(
        extraction([
          { source: "a", target: "b", relation: "calls" },
          { source: "b", target: "a", relation: "references" },
        ]),
      ),
    );
    const order2 = dump(
      buildFromJson(
        extraction([
          { source: "b", target: "a", relation: "references" },
          { source: "a", target: "b", relation: "calls" },
        ]),
      ),
    );
    expect(JSON.parse(order1).links).toHaveLength(2);
    expect(order2).toBe(order1);
  });
});
