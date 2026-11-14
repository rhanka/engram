import Graph from "graphology";
import { describe, expect, it } from "vitest";
import * as build from "../src/build.js";
import * as batch from "../src/extract-git.js";
import * as intake from "../src/extraction-batch.js";
import * as portability from "../src/portable-artifacts.js";
import { mergeEdgeEvidence, upsertRelationEdge } from "../src/graph.js";
import { canonicalBytes } from "../src/ontology-guardian/canonical.js";
import { edge, extraction, node, type Row } from "./helpers/multi-links.js";

function graph() {
  const G = new Graph({ multi: true, type: "undirected" });
  for (const id of ["a", "b", "c", "d"]) G.addNode(id);
  return G;
}
const merge = batch.mergeExtractionsWithCitationsPrepared;
describe("P2 batch edge delegation", () => {
  it("reports stored edge winners for numeric order, maximum weight and whole objects", () => {
    const inputs = [
      edge({ source_file: "a.ts", weight: 2, number: 2, properties: { a: 1, z: 100 } }),
      edge({ source_file: "b.ts", weight: 3, number: 10, properties: { a: 2, z: 0 } }),
    ];
    for (const copies of [inputs, [...inputs].reverse()]) {
      const out = merge(copies.map(e => extraction([e])), { edgeKeyScope: "cross-document" });
      const stored = out.extraction.edges[0];
      expect(stored).toMatchObject({ weight: 3, number: 2, properties: { a: 1, z: 100 } });
      expect(out.conflicts.map(c => [c.field, c.resolved])).toEqual([
        ["number", "2"], ["properties", '{"a":1,"z":100}'], ["weight", "3"],
      ]);
      for (const conflict of out.conflicts) {
        expect(conflict.kind).toBe("edge");
        expect(conflict.resolved).toBe(canonicalBytes(stored[conflict.field]));
        expect(conflict.sourceFiles).toEqual(["a.ts", "b.ts"]);
        expect(conflict.values).toEqual(copies.map(copy => canonicalBytes(copy[conflict.field])).sort());
      }
    }
  });
  it("B1-reciprocal-effective-batch-separation", () => {
    const inputs = [edge({ _src: "c", _tgt: "d" }), edge({ _src: "d", _tgt: "c" })];
    const out = merge([extraction(inputs)]).extraction.edges;
    expect(out.map(e => [e.source, e.target, e._src, e._tgt])).toEqual([["c", "d", "c", "d"], ["d", "c", "d", "c"]]);
    expect(out.every(e => e.evidence_observations?.length === 1)).toBe(true);
  });
  it("B1-same-effective-different-raw-order-coalesces", () => {
    const inputs = [edge({ source_location: "L10" }), edge({ source: "b", target: "a", _src: "a", _tgt: "b", source_location: "L44" })];
    for (const edgeKeyScope of ["per-source-file", "cross-document"] as const) {
      const out = merge([extraction(inputs)], { edgeKeyScope }).extraction.edges;
      expect(out).toHaveLength(1);
      expect(out[0].evidence_observations).toHaveLength(2);
      expect(out[0]).toMatchObject(mergeEdgeEvidence(null, ...inputs));
    }
  });
  it("batch-distinct-scalar-locators-kept", () => {
    const inputs = ["L10", "L44"].map(source_location => edge({ source_location, confidence: "AMBIGUOUS" }));
    const out = merge(inputs.map(e => extraction([e]))).extraction.edges[0];
    expect(out.evidence_observations?.map(e => e.source_location)).toEqual(["L10", "L44"]);
    expect(merge([extraction([inputs[0]])]).extraction.edges[0].evidence_observations).toHaveLength(1);
    expect(batch.mergeExtractionsWithCitations([extraction(inputs)]).extraction.edges[0].evidence_observations).toBeUndefined();
  });
  it("retains per-file scope and residual conflict diagnostics without resolving evidence twice", () => {
    const inputs = [edge({ source_file: "a.ts", status: "z", source_location: "L1" }), edge({ source_file: "b.ts", status: "a", source_location: "L2" })];
    expect(merge([extraction(inputs)]).extraction.edges).toHaveLength(2);
    const out = merge([extraction(inputs)], { edgeKeyScope: "cross-document" });
    expect(out.extraction.edges[0].status).toBe("a");
    expect(out.conflicts.some(c => c.field === "status")).toBe(true);
    expect(out.conflicts.some(c => c.field === "source_location")).toBe(false);
  });
  it("rejects non-finite evidence without modifying input", () => {
    const input = extraction([edge({ citations: [{ nested: Infinity }] })]);
    expect(() => merge([input])).toThrow(/non.finite/i);
    expect((input.edges[0].citations as Row[])[0].nested).toBe(Infinity);
  });
});

describe("P2 build edge intake", () => {
  for (const replacement of [false, true]) for (const invalidExisting of [false, true]) it(`refuses invalid ${invalidExisting ? "existing" : "incoming"} build evidence atomically on ${replacement ? "replacement" : "insertion"}`, () => {
    const G = graph();
    G.setAttribute("memory_projection_cursor", "before");
    if (replacement) upsertRelationEdge(G, "a", "b", edge({ relation: "a-valid", source_location: "existing" }));
    if (invalidExisting) G.addEdgeWithKey(JSON.stringify(["a", "b", "z-invalid"]), "a", "b", edge({ relation: "z-invalid", confidence_score: Infinity }));
    const before = JSON.stringify(G.export());
    expect(() => build.insertBuildEdgesPrepared(G, extraction([edge({ relation: "a-valid" }), edge({ relation: "z-invalid", ...(invalidExisting ? {} : { confidence_score: Infinity }) })]))).toThrow(/non.finite/i);
    expect(JSON.stringify(G.export())).toBe(before);
  });
  it("B1-build-stamp-preserves-effective-endpoints", () => {
    const G = graph();
    (build as Row).insertBuildEdgesPrepared(G, extraction([edge({ source: "absent", target: "absent", _src: "c", _tgt: "d" }), edge({ _src: "absent", _tgt: "d" })]));
    expect(G.size).toBe(1);
    expect(G.extremities(G.edges()[0])).toEqual(["c", "d"]);
    expect(G.getEdgeAttributes(G.edges()[0])).toMatchObject({ _src: "c", _tgt: "d", evidence_observations: [{ source_file: "f.ts", confidence: "EXTRACTED" }] });
  });
  it("prepares and sorts effective identities, unions and replays without rewriting captured locators", () => {
    const G = graph();
    const input = extraction([edge({ source_file: "/repo/f.ts" }), edge({ source: "b", target: "a", source_file: "/repo/f.ts" }), edge({ relation: "reads" })]);
    const before = JSON.stringify(input);
    (build as Row).insertBuildEdgesPrepared(G, input, { root: "/repo" });
    const stored = JSON.stringify(G.export());
    (build as Row).insertBuildEdgesPrepared(G, input, { root: "/repo" });
    expect(JSON.stringify(G.export())).toBe(stored);
    expect(G.size).toBe(3);
    expect(JSON.stringify(input)).toBe(before);
    const captured = edge({ source_file: "/repo/f.ts", evidence_observations: [{ source_file: "/repo/f.ts" }] });
    const H = graph();
    (build as Row).insertBuildEdgesPrepared(H, extraction([captured]), { root: "/other" });
    expect(H.getEdgeAttribute(H.edges()[0], "source_file")).toBe("/repo/f.ts");
  });
});

describe("P2 batch context and extraction portability", () => {
  it("M2-direct-vs-singleton-batch-with-root-equal", () => {
    const input = extraction([edge({ source_file: "/repo/f.ts", confidence: "AMBIGUOUS" })]);
    const direct = graph(), grouped = graph();
    (build as Row).insertBuildEdgesPrepared(direct, input, { root: "/repo" });
    const batch = (intake as Row).mergeAcceptedChunksPrepared([input], { root: "/repo" }).extraction;
    (build as Row).insertBuildEdgesPrepared(grouped, batch, { root: "/repo" });
    expect(grouped.getEdgeAttributes(grouped.edges()[0])).toEqual(direct.getEdgeAttributes(direct.edges()[0]));
    for (const e of batch.edges) upsertRelationEdge(direct, e.source, e.target, e);
    expect(direct.getEdgeAttribute(direct.edges()[0], "evidence_observations")).toHaveLength(1);
  });
  it("R4-batch-no-root-preserves-absolute-locator", () => {
    const out = (intake as Row).mergeAcceptedChunksPrepared([extraction([edge({ source_file: "/repo/f.ts" })])], {}).extraction.edges[0];
    expect(out.evidence_observations).toEqual([{ source_file: "/repo/f.ts", confidence: "EXTRACTED" }]);
  });
  it("R4-makeExtractionPortable-between-batch-and-build-noop-on-captured", () => {
    const captured = merge([extraction([edge({ source_file: "/repo/f.ts" })])]).extraction;
    const before = JSON.stringify(captured.edges);
    const projected = (portability as Row).makeExtractionPortablePrepared(captured, "/repo");
    expect(JSON.stringify(projected.edges)).toBe(before);
    expect((portability as Row).makeExtractionPortablePrepared(extraction([edge({ source_file: "src\\f.ts" })]), "/repo").edges[0].source_file).toBe("src/f.ts");
    expect(portability.makeExtractionPortable(captured, "/repo").edges[0].source_file).toBe("f.ts");
  });
});
