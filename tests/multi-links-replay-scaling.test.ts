import { performance } from "node:perf_hooks";
import { describe, expect, it, vi } from "vitest";
import { buildFromJson, insertBuildEdgesPrepared } from "../src/build.js";
import { createGraph, edgeKey, mergeEdgeEvidence, serializeGraph, upsertRelationEdge } from "../src/graph.js";
import * as replay from "../src/relation-replay.js";
import { edge, extraction } from "./helpers/multi-links.js";

const emissions = (n: number) => Array.from({ length: n }, (_, i) => edge({ source_location: "L" + i }));
const graph = () => { const G = createGraph(); G.addNode("a"); G.addNode("b"); return G; };
const recordCount = (rows: replay.RelationContribution[]) => rows.reduce((total, row) => total + (row.attrs.evidence_observations as unknown[]).length, 0);

describe("bucketed relation evidence preparation", () => {
  it("retains n records for n emissions, with one final row per directed tuple", () => {
    const G = graph(), inputs = emissions(800);
    const prepared = replay.prepareRelationContributions(G, inputs.map(attrs => ({ source: "a", target: "b", attrs })));
    expect(recordCount(prepared)).toBe(800);
    expect(prepared).toHaveLength(1);
    expect(G.size).toBe(0);
    expect(prepared[0].attrs).toEqual({ ...mergeEdgeEvidence(null, ...inputs), _src: "a", _tgt: "b", relation: "calls" });
  });

  it("buckets normalized effective tuples and collects stored evidence once", () => {
    const G = graph();
    upsertRelationEdge(G, "a", "b", edge({ source_location: "stored" }));
    const inputs = [edge({ source_location: "fresh" }), edge({ source: "b", target: "a", _src: "a", _tgt: "b", source_location: "fresh" }), edge({ source: "b", target: "a", source_location: "reverse" }), edge({ relation: "reads", source_location: "parallel" })];
    const prepared = replay.prepareRelationContributions(G, inputs.map(attrs => ({ source: attrs.source, target: attrs.target, attrs })));
    expect(prepared).toHaveLength(3);
    expect(recordCount(prepared)).toBe(4);
    replay.replayPreparedRelationEdges(G, prepared);
    expect(G.size).toBe(3);
    expect(G.getEdgeAttribute(edgeKey("a", "b", "calls"), "evidence_observations")).toHaveLength(2);
    const before = JSON.stringify(serializeGraph(G));
    replay.replayPreparedRelationEdges(G, prepared);
    expect(JSON.stringify(serializeGraph(G))).toBe(before);
  });

  it("preflights later buckets and dangling contributions before mutating any edge", () => {
    for (const target of ["b", "missing"]) {
      const G = graph();
      upsertRelationEdge(G, "a", "b", edge({ source_location: "stored" }));
      const before = JSON.stringify(G.export());
      expect(() => insertBuildEdgesPrepared(G, extraction([...emissions(20), edge({ target, relation: "z-invalid", confidence_score: Infinity })])))
        .toThrow(/non.finite/);
      expect(JSON.stringify(G.export())).toBe(before);
    }
    const G = graph();
    insertBuildEdgesPrepared(G, extraction([...emissions(20), edge({ target: "missing" })]));
    expect(G.size).toBe(1);
    expect(G.getEdgeAttribute(edgeKey("a", "b", "calls"), "evidence_observations")).toHaveLength(20);
  });

  it("public buildFromJson retains only final records as repeated evidence scales", () => {
    const prepare = vi.spyOn(replay, "prepareRelationContributions");
    try {
      for (const n of [200, 800]) {
        prepare.mockClear();
        const G = buildFromJson(extraction(emissions(n)));
        expect(prepare).toHaveBeenCalledTimes(1);
        expect(recordCount(prepare.mock.results[0].value)).toBe(n);
        expect(G.size).toBe(1);
        expect(G.getEdgeAttribute(edgeKey("a", "b", "calls"), "evidence_observations")).toHaveLength(n);
      }
    } finally { prepare.mockRestore(); }
  });

  it("public buildFromJson stays linear-ish from 200 to 800 distinct emissions", () => {
    const small = extraction(emissions(200)), large = extraction(emissions(800));
    const timed = (input: typeof small) => {
      const start = performance.now();
      const G = buildFromJson(input);
      const elapsed = performance.now() - start;
      expect(G.getEdgeAttribute(edgeKey("a", "b", "calls"), "evidence_observations")).toHaveLength(input.edges.length);
      return elapsed;
    };
    timed(small); timed(large); // Warm both sizes before alternating measurements.
    const smallTimes: number[] = [], largeTimes: number[] = [];
    for (let i = 0; i < 3; i++) {
      if (i % 2 === 0) { smallTimes.push(timed(small)); largeTimes.push(timed(large)); }
      else { largeTimes.push(timed(large)); smallTimes.push(timed(small)); }
    }
    const median = (values: number[]) => [...values].sort((a, b) => a - b)[1];
    const ratio = median(largeTimes) / median(smallTimes);
    console.log("REPEATED_EVIDENCE_SCALING", JSON.stringify({ smallTimes, largeTimes, ratio }));
    expect(ratio).toBeLessThan(10);
  });
});
