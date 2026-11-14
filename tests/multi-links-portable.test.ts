import { readFileSync } from "node:fs";
import Graph from "graphology";
import { describe, expect, it } from "vitest";
import * as core from "../src/graph.js";
import { executeSnippet } from "./helpers/multi-links-skills.js";
import { edge, extraction, permutations, type Row } from "./helpers/multi-links.js";

describe("P1 authored portable source, documents not switched", () => {
  it("executes the shared capture, merge and query contract on explicit multigraphs", () => {
    const source = readFileSync(new URL("../src/skills/multi-links-portable.cjs", import.meta.url), "utf8");
    const portable = executeSnippet(source, {}, {});
    const emissions = [
      edge({ source_location: "L1", confidence: "AMBIGUOUS", citations: [{ page: 1, quote: "first" }] }),
      edge({ source_location: "L2", citations: [{ page: 1, quote: "second" }] }),
      edge({ source_file: "bad\ud800.ts", citations: [{ region: [0, 0, 1, 1] }] }),
    ];
    for (const seq of permutations(emissions)) {
      const G = new Graph({ multi: true, type: "undirected" });
      G.addNode("a"); G.addNode("b");
      for (const e of seq) portable.upsertRelationEdge(G, e.source, e.target, e);
      const attrs = G.getEdgeAttributes(core.edgeKey("a", "b", "calls"));
      expect(attrs).toEqual({ ...core.mergeEdgeEvidence(null, ...seq), _src: "a", _tgt: "b", relation: "calls" });
      expect(attrs.evidence_observations).toHaveLength(3);
      expect(attrs.citations).toHaveLength(3);
      expect(attrs.confidence_score).toBe(1);
      expect(portable.getPairEdges(G, "b", "a")[0].orientation).toBe("reverse");
      for (const rec of attrs.evidence_observations) expect(portable.observationKey(rec)).toBe(core.observationKey(rec));
      expect(portable.mergeEdgeEvidence(JSON.parse(JSON.stringify(attrs)), ...seq)).toEqual(core.mergeEdgeEvidence(null, ...seq));
    }
    const captured = { source_file: "/repo/f.ts", custom: { stored: true } };
    expect(portable.prepareFreshExtraction(extraction([edge({ evidence_observations: [captured], source_file: "/repo/f.ts" })]), { root: "/repo" }).edges[0].source_file).toBe("/repo/f.ts");
    expect(portable.legacyObservationFromRawLink({ source_file: "f.ts" })).toEqual([{ source_file: "f.ts" }]);
    for (const name of ["assertionIdentityOf", "edgeKey", "observationFromEmission", "neighborDegree", "edgeCount", "assertSupportedGraphFormat"])
      expect((portable as Row)[name]).toBeTypeOf("function");
  });
});
