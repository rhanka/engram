import { describe, expect, it } from "vitest";
import * as build from "../src/build.js";
import * as hygiene from "../src/assembly-hygiene.js";
import * as swift from "../src/extract.js";
import * as git from "../src/extract-git.js";
import { edge, extraction, node, type Row } from "./helpers/multi-links.js";

const nodes = () => [node("a_dup", { label: "Duplicate" }), node("b_dup", { label: "Duplicate" }), node("c"), node("d")];
const remappers: Array<[string, (input: ReturnType<typeof extraction>) => ReturnType<typeof extraction>]> = [
  ["label", input => (build as Row).deduplicateByLabelPrepared(input)],
  ["hygiene", input => (hygiene as Row).normalizeSchemaHygienePrepared(input, { idPrefixSynonyms: { b: "a" } })],
  ["Swift", input => ({ ...input, ...(swift as Row)._mergeSwiftExtensionsPrepared([{ swift_extensions: [{ nid: "b_dup", label: "Duplicate" }] }], input.nodes, input.edges) })],
];

describe("P2 reducer bodies, unwired", () => {
  it("mergeExtractions-keeps-L10-L44-pipeline-watch-shapes", () => {
    const inputs = ["L10", "L44"].map(source_location => extraction([edge({ source_location })]));
    for (const [base, extra] of [inputs, [...inputs].reverse()]) {
      const out = (git as Row).mergeExtractionsPrepared(base, extra);
      expect(out.edges).toEqual([...base.edges, ...extra.edges]);
      expect(git.mergeExtractions(base, extra).edges).toEqual([...base.edges, ...extra.edges]);
    }
  });
  it("resolves effective endpoint remaps transitively", () => {
    const input = extraction([edge({ source: "b_dup", target: "d" })], [node("b_dup"), node("a_dup"), node("d")]);
    const out = (hygiene as Row).normalizeSchemaHygienePrepared(input, { idPrefixSynonyms: { b: "a", a: "c" } });
    expect(out.edges[0]).toMatchObject({ source: "c_dup", _src: "c_dup", target: "d", _tgt: "d" });
  });

  for (const [name, remap] of remappers) describe(name, () => {
    it("normalizes effective identity when the node map is empty", () => {
      const input = extraction([edge({ source: "raw-a", target: "raw-b", _src: "c", _tgt: "d" })], [node("c"), node("d")]);
      expect(remap(input).edges[0]).toMatchObject({ source: "c", target: "d", _src: "c", _tgt: "d" });
    });
    function run(edges: ReturnType<typeof edge>[]) {
      const input = extraction(edges, nodes());
      const before = JSON.stringify(input);
      const out = remap(input);
      expect(JSON.stringify(input)).toBe(before);
      expect(out.nodes.map(n => n.id).sort()).toEqual(["a_dup", "c", "d"]);
      return out;
    }
    it("R4-effective-endpoints-govern-remap-loop", () => {
      const edges = [edge({ source: "a_dup", target: "b_dup", _src: "c", _tgt: "d" }), edge({ source: "a_dup", target: "b_dup", _src: "d", _tgt: "c" })];
      expect(run(edges).edges.map(e => [e.source, e.target, e._src, e._tgt])).toEqual([["c", "d", "c", "d"], ["d", "c", "d", "c"]]);
    });
    it("R4-effective-self-loop-preserved-through-remap", () => {
      const edges = [edge({ source: "a_dup", target: "b_dup", _src: "b_dup", _tgt: "b_dup" }), edge({ source: "a_dup", target: "a_dup", _src: "c", _tgt: "d" }), edge({ source: "c", target: "c" })];
      expect(run(edges).edges.map(e => [e.source, e.target, e._src, e._tgt])).toEqual([["a_dup", "a_dup", "a_dup", "a_dup"], ["c", "d", "c", "d"], ["c", "c", "c", "c"]]);
    });
    it("remap-created-effective-loop-still-dropped", () => {
      expect(run([edge({ source: "c", target: "d", _src: "a_dup", _tgt: "b_dup" })]).edges).toEqual([]);
    });
    it("keeps distinct payloads at the same locator and captured evidence unchanged", () => {
      const edges = ["r1", "r2"].map(ref => edge({ source: "b_dup", target: "c", source_location: "L1", evidence_refs: [ref], evidence_observations: [{ source_file: "/repo/f.ts", evidence_refs: [ref] }] }));
      const out = run(edges);
      expect(out.edges).toHaveLength(2);
      expect(out.edges.map(e => e.evidence_observations)).toEqual(edges.map(e => e.evidence_observations));
      expect(out.edges.every(e => e.source === "a_dup" && e._src === "a_dup")).toBe(true);
    });
  });
});
