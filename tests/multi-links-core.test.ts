import Graph from "graphology";
import { describe, expect, it } from "vitest";
import * as core from "../src/graph.js";
import * as port from "../src/storage/types.js";
import { canonicalBytes } from "../src/ontology-guardian/canonical.js";
import { edge, extraction, permutations, type Row } from "./helpers/multi-links.js";

const api = core as Row;
const multi = (directed = false) => {
  const G = new Graph({ multi: true, type: directed ? "directed" : "undirected" });
  for (const id of ["a", "b", "c"]) G.addNode(id);
  return G;
};

describe("P1 observation core, before activation", () => {
  it("keeps the factory simple and separates graph and storage identities", () => {
    expect(core.createGraph().multi).toBe(false);
    expect(api.assertionIdentityOf("a", "b", { _src: "b", _tgt: "a", relation: "" })).toEqual({ src: "b", tgt: "a", relation: "related_to" });
    const normalize = (port as Row).normalizeStoreEdgeIdentity;
    expect(normalize("a", "b", undefined)).toEqual({ source: "a", target: "b", relation: "RELATES_TO" });
    for (const relation of ["", "related_to", "RELATES_TO", "Calls"]) {
      expect(normalize("a", "b", relation).relation).toBe(relation);
    }
    expect(api.edgeKey("A\0B", "C", "calls")).not.toBe(api.edgeKey("A", "B\0C", "calls"));
    expect(api.edgeKey("\ud800", "b", "calls")).toBe(JSON.stringify(["\ud800", "b", "calls"]));
  });

  it("prepares only fresh edge locators with the supplied context", () => {
    const input = extraction([edge({ source_file: "/repo/f.ts" }), edge({ source_file: "src\\f.ts" })]);
    expect(api.prepareFreshExtraction(input, { root: "/repo" }).edges.map((e: Row) => e.source_file)).toEqual(["f.ts", "src/f.ts"]);
    expect(api.prepareFreshExtraction(input).edges[0].source_file).toBe("/repo/f.ts");
    expect(api.prepareFreshExtraction(extraction([edge({ source_file: "/other/f.ts" })]), { root: "/repo" }).edges[0].source_file).toBe("/other/f.ts");
    expect(input.edges[0].source_file).toBe("/repo/f.ts");
    const captured = edge({ source_file: "/repo/f.ts", evidence_observations: [{ source_file: "/repo/f.ts", extra: { preserved: true } }] });
    const before = JSON.stringify(captured);
    expect(JSON.stringify(api.prepareFreshExtraction(extraction([captured]), { root: "/repo" }).edges[0])).toBe(before);
  });

  it("captures raw legacy absence and recovers plural methods before shell defaults", () => {
    const raw = { source_file: "/repo/f.ts", derivation_methods: ["z", "a", "a", 4] };
    expect(api.legacyObservationFromRawLink(raw)).toEqual([
      { source_file: "/repo/f.ts", derivation_method: "a" },
      { source_file: "/repo/f.ts", derivation_method: "z" },
    ]);
    const rec = api.observationFromEmission({ citations: [{ nested: [undefined, null] }] });
    expect(rec).toEqual({ source_file: "", citations: [{ nested: [null, null] }] });
    expect(Object.hasOwn(rec, "confidence")).toBe(false);
  });

  it("uses canonical whole records, preserves captured additions and ignores top-level votes", () => {
    const rec = { source_file: "f.ts", confidence: "AMBIGUOUS", custom: { keep: true } };
    expect(api.observationKey(rec)).toBe("jcs:" + canonicalBytes(rec));
    const result = api.mergeEdgeEvidence(null, { evidence_observations: [null, 1, rec], confidence: "EXTRACTED", source_file: "ignored" });
    expect(result.evidence_observations).toEqual([rec]);
    expect(result.confidence).toBe("AMBIGUOUS");
    expect(result.confidence_score).toBe(0.2);
    rec.custom.keep = false;
    expect(result.evidence_observations[0].custom.keep).toBe(true);
    expect(api.observationKey({ s: "\ud800" })).toMatch(/^esc:/);
    expect(api.observationKey({ s: "é" })).not.toBe(api.observationKey({ s: "e\u0301" }));
  });

  it("unions associatively across every permutation and JSON replay", () => {
    const emissions = [
      edge({ confidence: "AMBIGUOUS", source_location: "L1", citations: [{ page: 1, quote: "one" }], evidence_refs: ["z"], weight: 2, custom: null, assertion_basis: "ast", derivation_method: "z", t: 4, t_end: 8 }),
      edge({ confidence: "EXTRACTED", source_location: "L2", citations: [{ page: 1, quote: "two" }], evidence_refs: ["a"], weight: 3, custom: "value", assertion_basis: ["semantic"], derivation_method: "a", t: 2 }),
      edge({ confidence: "INFERRED", confidence_score: 0.8, source_location: "L3", custom: "other", t: "malformed" }),
    ];
    const expected = api.mergeEdgeEvidence(null, ...emissions);
    for (const seq of permutations(emissions)) {
      const pair = api.mergeEdgeEvidence(null, seq[0], seq[1]);
      expect(api.mergeEdgeEvidence(JSON.parse(JSON.stringify(pair)), seq[2])).toEqual(expected);
      expect(api.mergeEdgeEvidence(null, seq[0], api.mergeEdgeEvidence(null, seq[1], seq[2]))).toEqual(expected);
    }
    expect(expected).toMatchObject({ confidence: "EXTRACTED", confidence_score: 1, weight: 3, custom: null, evidence_refs: ["a", "z"], derivation_methods: ["a", "z"], derivation_method: "a", assertion_basis: ["ast", "semantic"], t: 2 });
    expect(Object.hasOwn(expected, "t_end")).toBe(false);
    expect(expected.citations).toHaveLength(2);
    expect(api.mergeEdgeEvidence(expected, ...emissions)).toEqual(expected);
  });

  it("refuses all-malformed captured sets before insertion, replacement or replay", () => {
    const malformed = { relation: "calls", evidence_observations: [null, 1] };
    const valid = { relation: "calls", source_file: "f.ts", confidence: "AMBIGUOUS" };
    for (const replayed of [malformed, JSON.parse(JSON.stringify(malformed))]) {
      expect(() => api.legacyObservationFromRawLink(replayed)).toThrow(/captured.*no valid observations/i);
      expect(() => api.mergeEdgeEvidence(null, replayed)).toThrow(/captured.*no valid observations/i);
      for (const first of [false, true]) {
        const G = multi();
        if (!first) api.upsertRelationEdge(G, "a", "b", valid);
        const before = JSON.stringify(G.export());
        expect(() => api.upsertRelationEdge(G, "a", "b", replayed)).toThrow(/captured.*no valid observations/i);
        expect(JSON.stringify(G.export())).toBe(before);
        const key = api.upsertRelationEdge(G, "a", "b", valid);
        const attrs = G.getEdgeAttributes(key);
        expect(attrs.evidence_observations).toEqual([{ source_file: "f.ts", confidence: "AMBIGUOUS" }]);
        expect(attrs.confidence_score).toBe(0.2);
        expect(api.mergeEdgeEvidence(JSON.parse(JSON.stringify(attrs)), valid)).toEqual(api.mergeEdgeEvidence(null, valid));
      }
    }
    expect(() => api.mergeEdgeEvidence(null)).toThrow(/nonempty observation set/i);
  });

  it("retains valid captured records without inventing scores and keeps originally empty arrays fresh", () => {
    const rec = { source_file: "f.ts", confidence: "AMBIGUOUS" };
    const mixed = { evidence_observations: [null, 1, rec], confidence: "EXTRACTED" };
    expect(api.legacyObservationFromRawLink(mixed)).toEqual([rec]);
    const G = multi();
    const key = api.upsertRelationEdge(G, "a", "b", mixed);
    api.upsertRelationEdge(G, "a", "b", JSON.parse(JSON.stringify(mixed)));
    expect(G.getEdgeAttributes(key)).toMatchObject({ evidence_observations: [rec], confidence_score: 0.2 });
    const fresh = { source_file: "fresh.ts", confidence: "INFERRED", evidence_observations: [] };
    expect(api.legacyObservationFromRawLink(fresh)).toEqual([{ source_file: "fresh.ts", confidence: "INFERRED" }]);
    expect(api.mergeEdgeEvidence(null, fresh)).toMatchObject({ evidence_observations: [{ source_file: "fresh.ts", confidence: "INFERRED" }], confidence_score: 0.5 });
  });

  it("derives missing and unknown confidence, malformed fields, and deterministic residual minima", () => {
    expect(api.mergeEdgeEvidence(null, { source_file: "f.ts" })).toMatchObject({ confidence_score: 1 });
    expect(Object.hasOwn(api.mergeEdgeEvidence(null, {}), "confidence")).toBe(false);
    expect(api.mergeEdgeEvidence(null, { confidence: "z" }, { confidence: "a" }).confidence).toBe("a");
    const merged = api.mergeEdgeEvidence(null, { citations: "malformed", t: 3, t_end: 1, value: [2], assertion_basis: "x" }, { value: [1, 9], assertion_basis: "x" });
    expect(merged.value).toEqual([1, 9]);
    expect(merged.assertion_basis).toBe("x");
    expect(merged).not.toHaveProperty("t");
    expect(merged).not.toHaveProperty("citations");
  });

  it("derives and replays uncapped captured sets with finite and open temporal bounds", () => {
    const count = 150_000;
    const records = Array.from({ length: count }, (_, i) => ({
      source_file: "f.ts", confidence: "INFERRED", source_location: "L" + i,
      confidence_score: i === count - 1 ? 0.9 : 0.5, t: i, t_end: i + 2,
    }));
    const finite = api.mergeEdgeEvidence(null, { evidence_observations: records, weight: 2 }, { evidence_observations: [records[0]], weight: 5 });
    expect(finite.evidence_observations).toHaveLength(count);
    expect(finite).toMatchObject({ confidence: "INFERRED", confidence_score: 0.9, weight: 5, t: 0, t_end: count + 1 });
    const replay = api.mergeEdgeEvidence(null, JSON.parse(JSON.stringify(finite)));
    expect(JSON.stringify(replay)).toBe(JSON.stringify(finite));
    const open = api.mergeEdgeEvidence(finite, { evidence_observations: [{ source_file: "open.ts", confidence: "AMBIGUOUS", t: -1 }] });
    expect(open.evidence_observations).toHaveLength(count + 1);
    expect(open).toMatchObject({ confidence_score: 0.9, t: -1 });
    expect(open).not.toHaveProperty("t_end");
    expect(JSON.stringify(api.mergeEdgeEvidence(null, JSON.parse(JSON.stringify(open))))).toBe(JSON.stringify(open));
  });

  it("treats prototype-named confidence strings as unknown votes", () => {
    for (const confidence of ["constructor", "toString", "__proto__"]) {
      expect(api.mergeEdgeEvidence(null, { confidence })).toMatchObject({ confidence, confidence_score: 1 });
      expect(api.mergeEdgeEvidence(null, { confidence }, { confidence: "INFERRED" })).toMatchObject({ confidence: "INFERRED", confidence_score: 1 });
    }
  });

  it("keeps legacy and fresh derivation recovery separate and ignores inherited evidence fields", () => {
    const inherited = Object.assign(Object.create({ confidence: "EXTRACTED", source_location: "invented" }), { source_file: "f.ts" });
    expect(api.observationFromEmission(inherited)).toEqual({ source_file: "f.ts" });
    expect(api.mergeEdgeEvidence(null, { source_file: "f.ts", derivation_methods: ["legacy-only"] })).not.toHaveProperty("derivation_methods");
    const stored = { source_file: "f.ts", extra: { nested: true } };
    const legacy = api.legacyObservationFromRawLink({ evidence_observations: [stored], confidence: "EXTRACTED" });
    expect(legacy).toEqual([stored]);
    stored.extra.nested = false;
    expect(legacy[0].extra.nested).toBe(true);
  });

  it("preserves JSON property names in residuals without changing object prototypes", () => {
    const input = JSON.parse('{"__proto__":{"kept":true},"constructor":"user value","status":null}');
    const merged = api.mergeEdgeEvidence(null, input);
    expect(Object.hasOwn(merged, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(merged)).toBe(Object.prototype);
    expect(merged.__proto__).toEqual({ kept: true });
    expect(merged.constructor).toBe("user value");
    expect(api.mergeEdgeEvidence(JSON.parse(JSON.stringify(merged)), input)).toEqual(merged);
  });

  it("preserves an empty assertion-basis array as an array-form vote across replay", () => {
    const a = { assertion_basis: [] }, b = { assertion_basis: "ast" };
    const stored = api.mergeEdgeEvidence(null, a);
    expect(stored.assertion_basis).toEqual([]);
    const expected = api.mergeEdgeEvidence(null, a, b);
    expect(expected.assertion_basis).toEqual(["ast"]);
    expect(api.mergeEdgeEvidence(JSON.parse(JSON.stringify(stored)), b)).toEqual(expected);
    expect(api.mergeEdgeEvidence(null, a, api.mergeEdgeEvidence(null, b))).toEqual(expected);
  });

  it("rejects non-wire observations before any insertion or replacement", () => {
    const cyclic: Row = {}; cyclic.self = cyclic;
    for (const invalid of [Infinity, NaN, -Infinity, 1n, Symbol("x"), () => {}, cyclic]) {
      const G = multi();
      api.upsertRelationEdge(G, "a", "b", edge({ t: 1, t_end: 2 }));
      const before = JSON.stringify(G.export());
      expect(() => api.upsertRelationEdge(G, "a", "b", edge({ citations: [{ nested: invalid }] }))).toThrow();
      expect(JSON.stringify(G.export())).toBe(before);
      expect(() => api.mergeEdgeEvidence(null, { evidence_observations: [{ extra: invalid }] })).toThrow();
    }
    expect(() => api.observationKey({ v: Infinity })).toThrow(/non.finite/i);
  });

  it("keeps parallel and reciprocal assertions and replaces stale temporal attributes", () => {
    const G = multi();
    const key = api.upsertRelationEdge(G, "a", "b", edge({ t: 1, t_end: 2 }));
    api.upsertRelationEdge(G, "a", "b", edge({ t: 3 }));
    api.upsertRelationEdge(G, "a", "b", edge({ relation: "reads" }));
    api.upsertRelationEdge(G, "b", "a", edge({ source: "b", target: "a" }));
    expect(G.size).toBe(3);
    expect(G.getEdgeAttributes(key)).not.toHaveProperty("t_end");
    expect(api.getPairEdges(G, "a", "b").map((e: Row) => e.orientation)).toEqual(["forward", "forward", "reverse"]);
    expect(() => api.upsertRelationEdge(G, "a", "missing", edge())).toThrow(/endpoint/i);
    const D = multi(true);
    api.upsertRelationEdge(D, "b", "a", edge({ source: "b", target: "a" }));
    expect(api.getPairEdges(D, "a", "b")).toEqual([]);
    const simple = core.createGraph(); simple.addNode("a"); simple.addNode("b");
    simple.addEdge("a", "b", { relation: "calls" });
    expect(api.getPairEdges(simple, "b", "a")[0].orientation).toBe("as-stored");
  });

  it("traverses legacy directed edges only outbound and can inspect the complete pair", () => {
    const G = multi(true);
    G.addEdgeWithKey("legacy", "b", "a", { relation: "calls" });
    expect(api.getPairEdges(G, "a", "b")).toEqual([]);
    expect(api.getPairEdges(G, "b", "a")).toEqual([expect.objectContaining({ src: "b", tgt: "a", orientation: "as-stored" })]);
    expect(api.getPairEdges(G, "a", "b", { traversable: false })).toHaveLength(1);
    api.upsertRelationEdge(G, "a", "a", edge({ source: "a", target: "a" }));
    expect(api.getPairEdges(G, "a", "a")[0].orientation).toBe("self");
  });

  it("accepts known formats and refuses unsupported or read-only graphs with a stable diagnostic", () => {
    for (const raw of [{}, { graph_format: "engram-graph/2", additive: true }]) expect(() => api.assertSupportedGraphFormat(raw, "fixture")).not.toThrow();
    for (const raw of [{ graph_format: "engram-graph/3" }, { graph_format: null }, { read_only: true }]) {
      expect(() => api.assertSupportedGraphFormat(raw, "fixture")).toThrowError(expect.objectContaining({ name: "UnsupportedGraphFormatError", code: "unsupported-graph-format" }));
    }
  });

  it("refuses writes through the core helper on unsupported or read-only multigraphs", () => {
    for (const attrs of [{ graph_format: "engram-graph/3" }, { read_only: true }]) {
      const G = multi(); G.replaceAttributes(attrs);
      const before = JSON.stringify(G.export());
      expect(() => api.upsertRelationEdge(G, "a", "b", edge())).toThrowError(expect.objectContaining({ code: "unsupported-graph-format" }));
      expect(JSON.stringify(G.export())).toBe(before);
    }
  });
});
