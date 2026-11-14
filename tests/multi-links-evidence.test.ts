import { readFileSync } from "node:fs";
import { join } from "node:path";
import Graph from "graphology";
import { describe, expect, it } from "vitest";
import { buildFromJson, buildMerge } from "../src/build.js";
import * as core from "../src/graph.js";
import * as publicApi from "../src/index.js";
import { toJson } from "../src/export.js";
import { mergeExtractionsWithCitations } from "../src/extract-git.js";
import { edge, extraction, node, rows, writers, fromRows, permutations, observation, expectObservations, expectFixedPoint, tempDir, type Row } from "./helpers/multi-links.js";

describe("L0-E evidence", () => {
  it("tuple-key-NUL-collision-two-edges", () => {
    const ids = ["A\0B", "C", "A", "B\0C", "a|b", "a,b", "é", "e\u0301", "\ud800"];
    const emissions = [
      edge({ source: ids[0], target: ids[1], source_location: "N1" }),
      edge({ source: ids[2], target: ids[3], source_location: "N2" }),
      ...ids.slice(4).map(id => edge({ source: id, target: "C" })),
      edge({ source: "A", target: "A" }),
      edge({ source: "A", target: "C", relation: "" }),
      Object.fromEntries(Object.entries(edge({ source: "A", target: "C", source_location: "omitted" })).filter(([k]) => k !== "relation")),
    ];
    const G = fromRows(emissions, {}, ids.map(id => node(id)));
    const keys = [JSON.stringify(["A\0B", "C", "calls"]), JSON.stringify(["A", "B\0C", "calls"])];
    for (const key of keys) expect(G.hasEdge(key), key).toBe(true);
    expect(keys[0]).not.toBe(keys[1]);
    expect(G.size).toBe(9);
    expect(G.getEdgeAttribute(JSON.stringify(["A", "C", "related_to"]), "evidence_observations")).toHaveLength(2);
    G.forEachEdge((_key, attrs) => { expect(Object.hasOwn(attrs, "source")).toBe(false); expect(Object.hasOwn(attrs, "target")).toBe(false); });
    const effectiveOnly = fromRows([edge({ source: "absent", target: "absent", _src: "A", _tgt: "C" })], {}, ids.map(id => node(id)));
    expect(rows(effectiveOnly).map(r => [r.source, r.target])).toEqual([["A", "C"]]);
    expect(fromRows([edge({ _src: "a", _tgt: "missing" })]).size).toBe(0);
    expectFixedPoint(G);
  });

  // Explicit new-API contract, kept separate from behavioral build acceptance.
  it("upsert-requires-multigraph-ordered-invariant", () => {
    const upsert = (core as Row).upsertRelationEdge;
    expect(upsert, "src/graph.ts must export upsertRelationEdge").toBeTypeOf("function");
    const simple = new Graph({ multi: false, type: "undirected" });
    for (const id of ["a", "b", "c"]) simple.addNode(id);
    expect(() => upsert(simple, "a", "b", edge())).toThrow();
    expect(simple.size).toBe(0);
    const key = JSON.stringify(["a", "b", "calls"]);
    const reversed = new Graph({ multi: true, type: "undirected" });
    for (const id of ["a", "b", "c"]) reversed.addNode(id);
    reversed.addEdgeWithKey(key, "a", "b", { _src: "a", _tgt: "b", relation: "calls" });
    expect(() => reversed.mergeEdgeWithKey(key, "b", "a", { _src: "b", _tgt: "a" })).not.toThrow();
    expect(reversed.extremities(key)).toEqual(["a", "b"]);
    expect(() => upsert(reversed, "a", "b", edge())).toThrow();
    const differentSet = new Graph({ multi: true, type: "undirected" });
    for (const id of ["a", "b", "c"]) differentSet.addNode(id);
    differentSet.addEdgeWithKey(key, "a", "c", { _src: "a", _tgt: "c", relation: "calls" });
    expect(() => upsert(differentSet, "a", "b", edge())).toThrow();
    const valid = new Graph({ multi: true, type: "undirected" });
    for (const id of ["a", "b", "c"]) valid.addNode(id);
    upsert(valid, "a", "b", edge());
    upsert(valid, "a", "c", edge({ target: "c" }));
    expect(valid.size).toBe(2);
    for (const key of valid.edges()) { expect(Object.hasOwn(valid.getEdgeAttributes(key), "source")).toBe(false); expect(Object.hasOwn(valid.getEdgeAttributes(key), "target")).toBe(false); }
  });

  it("raw Graphology ordered and endpoint-set controls", () => {
    const G = new Graph({ multi: true, type: "undirected" });
    for (const id of ["a", "b", "c"]) G.addNode(id);
    G.addEdgeWithKey("K", "a", "b", { _src: "a", _tgt: "b" });
    expect(() => G.mergeEdgeWithKey("K", "b", "a", { _src: "b", _tgt: "a" })).not.toThrow();
    expect(G.extremities("K")).toEqual(["a", "b"]);
    expect(() => G.mergeEdgeWithKey("K", "a", "c")).toThrow();
  });

  it("observation builder closed schema, cloning and public exports", () => {
    const build = (core as Row).observationFromEmission;
    expect(build, "src/graph.ts observationFromEmission export").toBeTypeOf("function");
    const input = edge({ custom: "residual", quote: "not an observation field", citations: [{ quote: "verbatim", nested: { value: 1 } }], evidence_refs: ["r1"], t: 0 });
    const rec = build(input);
    expect(rec).toEqual(observation(input));
    expect(Object.hasOwn(rec, "custom")).toBe(false); expect(Object.hasOwn(rec, "quote")).toBe(false);
    input.citations[0].nested.value = 2; input.evidence_refs.push("r2");
    expect(rec.citations[0].nested.value).toBe(1); expect(rec.evidence_refs).toEqual(["r1"]);
    for (const name of ["observationFromEmission", "observationKey", "mergeEdgeEvidence", "upsertRelationEdge", "prepareFreshExtraction", "legacyObservationFromRawLink"]) {
      expect((publicApi as Row)[name], "src/index.ts export " + name).toBeTypeOf("function");
      expect((publicApi as Row)[name]).toBe((core as Row)[name]);
    }
  });

  it("merge-associativity-threeway-all-permutations", () => {
    const emissions = [edge({ confidence: "AMBIGUOUS", custom: "A" }), edge({ confidence: "EXTRACTED", custom: "B" }), edge({ confidence: "AMBIGUOUS", custom: "C" })];
    const expected = [observation(emissions[0]), observation(emissions[1])];
    let canonical: string | undefined;
    for (const seq of permutations(emissions)) {
      const histories = [seq, [...rows(fromRows(seq.slice(0, 2))), seq[2]], [seq[0], ...rows(fromRows(seq.slice(1)))]];
      for (const history of histories) {
        const G = fromRows(history);
        const row = rows(G)[0];
        expectObservations(row, expected);
        expect(row.custom).toBe("A");
        for (const writer of writers) {
          const bytes = JSON.stringify(rows(G, writer));
          canonical ??= bytes;
          expect(bytes).toBe(canonical);
        }
        expectFixedPoint(G, seq);
      }
    }
  });

  const persistenceCases: Array<[string, Row[]]> = [
    ["page-only-two-quotes-kept", ["First supporting passage", "Second supporting passage"].map(quote => edge({ relation: "cites", source_file: "paper.pdf", citations: [{ source_file: "paper.pdf", docSha: "aaa", page: 1, quote }] }))],
    ["docSha-revisions-and-locator-shapes-kept", [
      { docSha: "aaa", page: 1, quoteSpan: [0, 10] }, { docSha: "bbb", page: 1, quoteSpan: [0, 10] },
      { page: 1, section: "S1" }, { excerpt: "", quote: "nonblank quote" },
      { excerpt: "locator-free one" }, { excerpt: "locator-free two" },
    ].map(c => edge({ relation: "cites", source_file: "paper.pdf", citations: [{ source_file: "paper.pdf", ...c }] })).concat([
      edge({ relation: "cites", source_file: "paper.pdf", source_location: "L9", citations: [{ source_file: "other.pdf", quote: "different place" }] }),
    ])],
    ["scalar-L10-L44-per-emission-confidence-kept", [edge({ source_location: "L10", confidence: "AMBIGUOUS", evidence_refs: ["r10"] }), edge({ source_location: "L44", evidence_refs: ["r44"] })]],
    ["bbox-region-distinct-stable-keys", [{ bbox: [0, 0, 1, 1] }, { region: [0, 0, 1, 1] }, { bbox: [0, 0, 1, 1], region: [0, 0, 1, 1] }].map(c => edge({ citations: [{ source_file: "f.ts", ...c }] }))],
  ];
  for (const [name, emissions] of persistenceCases) {
    it(name, () => {
      for (const scope of ["cross-document", "per-source-file"] as const) {
        const sequences = name === "bbox-region-distinct-stable-keys" ? permutations(emissions) : [emissions, [...emissions].reverse()];
        for (const seq of sequences) {
          const batch = mergeExtractionsWithCitations([...seq, seq[0]].map(e => extraction([e as never])), { edgeKeyScope: scope });
          const G = buildFromJson(batch.extraction);
          expectObservations(rows(G)[0], emissions.map(observation));
          if (name.includes("scalar")) expect(rows(G)[0].evidence_refs).toEqual(["r10", "r44"]);
          if (!name.includes("scalar")) expect(rows(G)[0].citations).toEqual(expect.arrayContaining(emissions.flatMap(e => e.citations)));
          expectFixedPoint(G, emissions);
        }
      }
    });
  }

  it("observation-key-schema-and-bbox-region-contract", () => {
    const key = (core as Row).observationKey;
    expect(key, "src/graph.ts must export observationKey").toBeTypeOf("function");
    const recs = [{ bbox: [0, 0, 1, 1] }, { region: [0, 0, 1, 1] }, { bbox: [0, 0, 1, 1], region: [0, 0, 1, 1] }];
    expect(new Set(recs.map(key)).size).toBe(3);
    expect(JSON.parse(JSON.stringify(recs)).map(key)).toEqual(recs.map(key));
    expect(key({ v: -0 })).toBe(key({ v: 0 }));
    expect(key({ s: "\ud800" })).toMatch(/^esc:/);
    expect(key({ ["\ud800"]: "kept key" })).toMatch(/^esc:/);
    expect(key({ s: "é" })).not.toBe(key({ s: "e\u0301" }));
    expect(key({ b: 2, a: 1 })).toBe(key({ a: 1, b: 2 }));
  });

  it("first-insert-fixed-point-and-serializer-parity", () => {
    const emissions = [edge({ citations: [{ quote: "é", source_file: "f.ts" }] }), edge({ citations: [{ source_file: "f.ts", quote: "e\u0301" }] })];
    for (const e of emissions) {
      const once = fromRows([e]);
      expectObservations(rows(once)[0], [observation(e)]);
      expect(JSON.stringify(rows(fromRows([e, e])))).toBe(JSON.stringify(rows(once)));
      const reordered = Object.fromEntries(Object.entries(e).reverse());
      expect(JSON.stringify(rows(fromRows([reordered])))).toBe(JSON.stringify(rows(once)));
      const reorderedNested = { ...reordered, citations: e.citations.map(c => Object.fromEntries(Object.entries(c).reverse())) };
      expectObservations(rows(fromRows([e, reorderedNested]))[0], [observation(e)]);
      expect(JSON.stringify(rows(fromRows([reorderedNested])))).toBe(JSON.stringify(rows(once)));
      expectFixedPoint(once, [e]);
    }
    expectObservations(rows(fromRows(emissions))[0], emissions.map(observation));
    expect(rows(fromRows([]))).toEqual([]);
    const zeros = [edge({ confidence_score: -0 }), edge({ confidence_score: 0 })];
    expectObservations(rows(fromRows(zeros))[0], [observation(zeros[0])]);
    expectFixedPoint(fromRows(zeros), zeros);
    const surrogate = edge({ source_file: "bad\ud800.ts", citations: [{ source_file: "bad\ud800.ts", quote: "\udfff" }] });
    expectObservations(rows(fromRows([surrogate]))[0], [observation(surrogate)]);
    expectFixedPoint(fromRows([surrogate]), [surrogate]);
  });

  for (const [name, invalid] of [
    ["M1-infinity-vs-null-rejected-not-collapsed", [{ confidence_score: Infinity }]],
    ["M1-nan-neg-infinity-nested-citation-rejected", [{ confidence_score: NaN }, { confidence_score: -Infinity }, { citations: [{ source_file: "f.ts", confidence_score: Infinity }] }, { citations: [{ source_file: "f.ts", region: [0, NaN, 1, 1] }] }]],
  ] as Array<[string, Row[]]>) {
    invalid.forEach((attrs, index) => describe("wire-domain variant " + name + "/" + index, () => {
      it(name, () => {
        const destination = join(tempDir(), "graph.json");
        toJson(fromRows([edge({ source_location: "accepted", confidence_score: null })]), new Map(), destination);
        const before = readFileSync(destination, "utf8");
        const operation = () => {
          const G = buildMerge([extraction([edge(attrs)])], { graphPath: destination });
          toJson(G, new Map(), destination);
        };
        expect(operation, "non-finite input must be refused before replacing an existing destination").toThrow(/non.finite/i);
        expect(readFileSync(destination, "utf8")).toBe(before);
      });
    }));
  }

  it("M1-finite-null-legacy-and-lone-surrogate-retained", () => {
    for (const attrs of [{ confidence_score: 0.5 }, { confidence_score: null }, { source_file: "bad\ud800.ts", citations: [{ quote: "\udfff" }] }]) {
      const e = edge(attrs);
      for (const G of [fromRows([e]), core.loadGraphFromData({ nodes: [node("a"), node("b")], links: [e] })]) {
        expectObservations(rows(G)[0], [observation(e)]);
        expect(rows(G)[0].confidence_score).toBe(typeof attrs.confidence_score === "number" ? attrs.confidence_score : 1);
        expectFixedPoint(G, [e]);
      }
    }
  });
});
