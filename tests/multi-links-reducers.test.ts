import { describe, expect, it } from "vitest";
import { buildFromJson, deduplicateByLabel } from "../src/build.js";
import { normalizeSchemaHygiene } from "../src/assembly-hygiene.js";
import { _mergeSwiftExtensions } from "../src/extract.js";
import { mergeExtractions } from "../src/extract-git.js";
import { edge, extraction, node, rows, expectObservations, expectFixedPoint, observation, type Row } from "./helpers/multi-links.js";
import type { Extraction } from "../src/types.js";

const a = "a_dup", b = "b_dup";
const nodes = () => [node(a, { label: "Duplicate" }), node(b, { label: "Duplicate" }), node("c", { label: "Caller" }), node("d", { label: "Callee" })];
const remappers: Array<[string, (input: Extraction) => Extraction]> = [
  ["label", deduplicateByLabel],
  ["hygiene", input => normalizeSchemaHygiene(input, { idPrefixSynonyms: { b: "a" } })],
  ["Swift", input => ({ ...input, ..._mergeSwiftExtensions([{ nodes: [], edges: [], swift_extensions: [{ nid: b, label: "Duplicate" }] }] as never, input.nodes, input.edges) })],
];
function assertRemapActive(out: Extraction) {
  expect(out.nodes.map(n => n.id).sort()).toEqual([a, "c", "d"].sort());
}
function verifyEmissions(out: Extraction, expected: Row[]) {
  expect(out.edges).toHaveLength(expected.length);
  for (const e of expected) {
    const actual = out.edges.find(row => row.source_location === e.source_location)!;
    expect(actual).toBeDefined();
    expect([actual.source, actual.target, actual._src, actual._tgt]).toEqual([e._src, e._tgt, e._src, e._tgt]);
    expect(actual.evidence_refs).toEqual(e.evidence_refs);
  }
  const G = buildFromJson(out);
  expect(G.size).toBe(expected.length);
  for (const e of expected) {
    const row = rows(G).find(r => r.source === e._src && r.target === e._tgt)!;
    expectObservations(row, [observation(e)]);
  }
  expectFixedPoint(G, out.edges);
}

describe("L0-R reducers", () => {
  for (const form of ["pipeline", "watch"]) describe(form, () => {
    it("mergeExtractions-keeps-L10-L44-pipeline-watch-shapes", () => {
      const contributions = ["L10", "L44"].map(loc => extraction([edge({ source_file: "a.ts", source_location: `a.ts:${loc}`, evidence_refs: [`ref-${loc}`] })]));
      const out = form === "pipeline" ? mergeExtractions(contributions[0], contributions[1]) : mergeExtractions(contributions[1], contributions[0]);
      expect(out.edges).toHaveLength(2);
      const G = buildFromJson(out);
      expect(G.size).toBe(1);
      expectObservations(rows(G)[0], contributions.flatMap(ex => ex.edges.map(observation)));
      expect(rows(G)[0].evidence_refs).toEqual(["ref-L10", "ref-L44"]);
      expectFixedPoint(G, contributions.flatMap(ex => ex.edges));
    });
  });
  for (const [name, remap] of remappers) describe(name, () => {
    it("preexisting-raw-loop-survives-unrelated-remap", () => {
      const e = edge({ source: "c", target: "c", _src: "c", _tgt: "c", source_location: "L1", evidence_refs: ["loop"] });
      const out = remap(extraction([e], nodes()));
      assertRemapActive(out);
      verifyEmissions(out, [e]);
    });
    it("remap-created-effective-loop-still-dropped", () => {
      const out = remap(extraction([edge({ source: a, target: b, _src: a, _tgt: b, source_location: "drop" })], nodes()));
      assertRemapActive(out);
      expect(out.edges).toEqual([]);
      // Passing policy control: no unrelated new helper or evidence requirement.
      expect(buildFromJson(out).size).toBe(0);
    });
    it("R4-effective-endpoints-govern-remap-loop", () => {
      const emissions = [edge({ source: a, target: b, _src: "c", _tgt: "d", source_location: "L1", evidence_refs: ["forward"] }), edge({ source: a, target: b, _src: "d", _tgt: "c", source_location: "L2", evidence_refs: ["reverse"] })];
      const out = remap(extraction(emissions, nodes()));
      assertRemapActive(out);
      verifyEmissions(out, emissions);
    });
    for (const control of ["effective-loop", "raw-loop-effective-non-loop"]) describe(control, () => {
      it("R4-effective-self-loop-preserved-through-remap", () => {
        const e = control === "effective-loop"
          ? edge({ source: a, target: b, _src: "c", _tgt: "c", source_location: "L1", evidence_refs: ["effective-loop"] })
          : edge({ source: a, target: a, _src: "c", _tgt: "d", source_location: "L2", evidence_refs: ["raw-loop"] });
        const out = remap(extraction([e], nodes()));
        assertRemapActive(out);
        verifyEmissions(out, [e]);
      });
    });
  });
});
