import { describe, expect, it } from "vitest";
import Graph from "graphology";
import { buildFromJson } from "../src/build.js";

/**
 * Regression for Track F-0819-P2 (upstream #1010): make graph output
 * deterministic so a no-op rebuild reproduces graph.json byte-for-byte.
 *
 * The undirected build stores edge direction in `_src`/`_tgt`. When edges
 * collapse onto the same node pair, the surviving edge (and its preserved
 * direction) depends on iteration order. If `extraction.edges` arrives in a
 * different order run-to-run — e.g. when AST + semantic subagent chunks are
 * merged in a nondeterministic order — `_src`/`_tgt` flip and the serialized
 * graph churns. Upstream pins this by sorting edges by
 * `(source, target, relation)` before the add loop; the TS port must match.
 */
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
    const rows: string[] = [];
    G.forEachEdge((_key, data: Record<string, unknown>) => {
      rows.push(`${data._src}->${data._tgt}:${data.relation}`);
    });
    return rows.sort().join(" | ");
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

  it("keeps a deterministic survivor when two relations collapse onto one undirected pair", () => {
    // `a calls b` and `b references a` collapse onto the same undirected pair.
    // The survivor must not depend on which one is seen first.
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
    expect(order2).toBe(order1);
  });
});
