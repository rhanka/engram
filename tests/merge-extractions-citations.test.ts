import { describe, expect, it } from "vitest";
import * as rootApi from "../src/index.js";
import { canonicalBytes } from "../src/ontology-guardian/canonical.js";
import { toJsonValue } from "../src/json-value.js";
import {
  extractionCitationKey,
  unionExtractionCitations,
} from "../src/citations.js";
import {
  type ExtractionMergeConflict,
  mergeExtractions,
  mergeExtractionsWithCitations,
} from "../src/extract-git.js";
import type {
  Extraction,
  GraphEdge,
  GraphNode,
  OntologyCitation,
} from "../src/types.js";

function canonicalOf(value: unknown): string {
  const projected = toJsonValue(value);
  expect(projected.ok).toBe(true);
  if (!projected.ok) {
    throw new Error(`Unprojectable value at ${projected.path}: ${projected.reason}`);
  }
  return canonicalBytes(projected.value);
}

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [items.slice()];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i++) {
    const head = items[i]!;
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const tail of permutations(rest)) {
      out.push([head, ...tail]);
    }
  }
  return out;
}

describe("F-EN4 citation-preserving mergeExtractions", () => {
  it("F-EN4-T1: both citations survive on same node id with citation_count = 2 and conflicts = []", () => {
    const cite1: OntologyCitation = {
      source_file: "doc-a.pdf",
      docSha: "aa11bb22",
      page: 2,
      quoteSpan: [10, 42],
      excerpt: "first clause text",
    };
    const cite2: OntologyCitation = {
      source_file: "doc-b.pdf",
      docSha: "cc33dd44",
      page: 5,
      quoteSpan: [100, 140],
      excerpt: "second clause text",
    };
    const e1: Extraction = {
      nodes: [
        {
          id: "node-a",
          label: "Node A",
          file_type: "document",
          source_file: "doc-a.pdf",
          node_type: "Alpha",
          citations: [cite1],
        },
      ],
      edges: [],
      input_tokens: 10,
      output_tokens: 5,
    };
    const e2: Extraction = {
      nodes: [
        {
          id: "node-a",
          label: "Node A",
          file_type: "document",
          source_file: "doc-a.pdf",
          node_type: "Alpha",
          citations: [cite2],
        },
      ],
      edges: [],
      input_tokens: 20,
      output_tokens: 8,
    };

    const e1Snap = canonicalOf(e1);
    const e2Snap = canonicalOf(e2);

    const res = mergeExtractionsWithCitations([e1, e2]);
    expect(res.conflicts).toEqual([]);
    expect(res.extraction.nodes).toHaveLength(1);
    const mergedNode = res.extraction.nodes[0]!;
    expect(mergedNode.citations).toHaveLength(2);
    expect(mergedNode.citation_count).toBe(2);
    expect(mergedNode.citations).toEqual([cite1, cite2]);
    expect(res.extraction.input_tokens).toBe(30);
    expect(res.extraction.output_tokens).toBe(13);

    // Inputs are not mutated.
    expect(canonicalOf(e1)).toBe(e1Snap);
    expect(canonicalOf(e2)).toBe(e2Snap);
  });

  it("F-EN4-T2: same page with different spans or excerpts survive; same span with excerpt merges into 1", () => {
    // (a) Same (docSha, page), two quoteSpans -> 2 citations
    const spanA: OntologyCitation = {
      source_file: "doc.pdf",
      docSha: "deadbeef",
      page: 3,
      quoteSpan: [0, 25],
    };
    const spanB: OntologyCitation = {
      source_file: "doc.pdf",
      docSha: "deadbeef",
      page: 3,
      quoteSpan: [50, 90],
    };
    const spanMerge = mergeExtractionsWithCitations([
      {
        nodes: [{ id: "node-a", label: "A", file_type: "document", source_file: "doc.pdf", citations: [spanA] }],
        edges: [],
        input_tokens: 0,
        output_tokens: 0,
      },
      {
        nodes: [{ id: "node-a", label: "A", file_type: "document", source_file: "doc.pdf", citations: [spanB] }],
        edges: [],
        input_tokens: 0,
        output_tokens: 0,
      },
    ]);
    expect(spanMerge.extraction.nodes[0]!.citations).toHaveLength(2);
    expect(spanMerge.extraction.nodes[0]!.citation_count).toBe(2);

    // (b) Span-less pair differing only by excerpt -> 2 citations
    const excA: OntologyCitation = {
      source_file: "doc.pdf",
      docSha: "deadbeef",
      page: 3,
      excerpt: "alpha passage",
    };
    const excB: OntologyCitation = {
      source_file: "doc.pdf",
      docSha: "deadbeef",
      page: 3,
      excerpt: "beta passage",
    };
    const excMerge = mergeExtractionsWithCitations([
      {
        nodes: [{ id: "node-a", label: "A", file_type: "document", source_file: "doc.pdf", citations: [excA] }],
        edges: [],
        input_tokens: 0,
        output_tokens: 0,
      },
      {
        nodes: [{ id: "node-a", label: "A", file_type: "document", source_file: "doc.pdf", citations: [excB] }],
        edges: [],
        input_tokens: 0,
        output_tokens: 0,
      },
    ]);
    expect(excMerge.extraction.nodes[0]!.citations).toHaveLength(2);
    expect(excMerge.extraction.nodes[0]!.citation_count).toBe(2);

    // (c) Same span, one copy also carrying excerpt -> 1 citation with excerpt filled in
    const spanWithExcerpt: OntologyCitation = {
      source_file: "doc.pdf",
      docSha: "deadbeef",
      page: 3,
      quoteSpan: [0, 25],
      excerpt: "hydrated excerpt text",
    };
    const hydratedMerge = mergeExtractionsWithCitations([
      {
        nodes: [{ id: "node-a", label: "A", file_type: "document", source_file: "doc.pdf", citations: [spanA] }],
        edges: [],
        input_tokens: 0,
        output_tokens: 0,
      },
      {
        nodes: [
          {
            id: "node-a",
            label: "A",
            file_type: "document",
            source_file: "doc.pdf",
            citations: [spanWithExcerpt],
          },
        ],
        edges: [],
        input_tokens: 0,
        output_tokens: 0,
      },
    ]);
    expect(hydratedMerge.extraction.nodes[0]!.citations).toHaveLength(1);
    expect(hydratedMerge.extraction.nodes[0]!.citation_count).toBe(1);
    expect(hydratedMerge.extraction.nodes[0]!.citations![0]!.excerpt).toBe("hydrated excerpt text");
  });

  it("F-EN4-T3: exact duplicates dedupe; single-copy normalization matches merge([E, E])", () => {
    const dupSec1: OntologyCitation = {
      source_file: "path/b.pdf",
      docSha: "abcd1234",
      page: 4,
      quoteSpan: [5, 15],
      section: "sec-2",
    };
    const dupSec2: OntologyCitation = {
      source_file: "path/a.pdf",
      docSha: "abcd1234",
      page: 4,
      quoteSpan: [5, 15],
      section: "sec-1",
    };
    const citeOther: OntologyCitation = {
      source_file: "path/a.pdf",
      docSha: "00001111",
      page: 1,
      quoteSpan: [1, 9],
    };

    const singleInput: Extraction = {
      nodes: [
        {
          id: "node-a",
          label: "Alpha",
          file_type: "document",
          source_file: "doc.pdf",
          aliases: ["Beta", "Alpha", "Beta", "  "],
          evidence_refs: ["ev-2", "ev-1", "ev-2"],
          citations: [dupSec1, citeOther, dupSec2],
        },
      ],
      edges: [
        {
          source: "node-a",
          target: "node-b",
          relation: "links_to",
          confidence: "EXTRACTED",
          source_file: "doc.pdf",
          assertion_basis: ["b", "a", "a"],
        },
      ],
      input_tokens: 12,
      output_tokens: 6,
    };

    const singleMerged = mergeExtractionsWithCitations([singleInput]);
    const doubleMerged = mergeExtractionsWithCitations([singleInput, singleInput]);

    expect(singleMerged.conflicts).toEqual([]);
    expect(doubleMerged.conflicts).toEqual([]);

    const node = singleMerged.extraction.nodes[0]!;
    expect(node.citations).toHaveLength(2);
    expect(node.citation_count).toBe(2);
    expect(node.citations![0]!.docSha).toBe("00001111");
    expect(node.citations![1]!.docSha).toBe("abcd1234");
    expect(node.citations![1]!.source_file).toBe("path/a.pdf");
    expect(node.citations![1]!.section).toBe("sec-1");
    expect(node.aliases).toEqual(["Beta"]);
    expect(node.evidence_refs).toEqual(["ev-1", "ev-2"]);
    expect(singleMerged.extraction.edges[0]!.assertion_basis).toEqual(["a", "b"]);

    // Token sums differ between 1 copy and 2 copies, but normalized graph content is identical;
    // with 0 tokens, merge([E]) and merge([E, E]) are byte-for-byte identical.
    const zeroTokenInput: Extraction = { ...singleInput, input_tokens: 0, output_tokens: 0 };
    expect(canonicalOf(mergeExtractionsWithCitations([zeroTokenInput]))).toBe(
      canonicalOf(mergeExtractionsWithCitations([zeroTokenInput, zeroTokenInput])),
    );

    // m1: A losing label that is non-empty before trim but empty after normalization ("\t")
    // is added to aliases as "" per the §4(d).2 formula; an absent-like "" label is excluded.
    const tabLabelExt: Extraction = {
      nodes: [{ id: "node-ws", label: "\t", file_type: "document", source_file: "doc.pdf" }],
      edges: [],
      input_tokens: 0,
      output_tokens: 0,
    };
    const betaLabelExt: Extraction = {
      nodes: [{ id: "node-ws", label: "Beta", file_type: "document", source_file: "doc.pdf" }],
      edges: [],
      input_tokens: 0,
      output_tokens: 0,
    };
    const wsMerged12 = mergeExtractionsWithCitations([tabLabelExt, betaLabelExt]);
    const wsMerged21 = mergeExtractionsWithCitations([betaLabelExt, tabLabelExt]);
    expect(canonicalOf(wsMerged12)).toBe(canonicalOf(wsMerged21));
    expect(wsMerged12.extraction.nodes[0]!.label).toBe("Beta");
    expect(wsMerged12.extraction.nodes[0]!.aliases).toEqual([""]);

    const emptyLabelExt: Extraction = {
      nodes: [{ id: "node-ws", label: "", file_type: "document", source_file: "doc.pdf" }],
      edges: [],
      input_tokens: 0,
      output_tokens: 0,
    };
    const emptyVsBeta = mergeExtractionsWithCitations([emptyLabelExt, betaLabelExt]);
    expect(emptyVsBeta.extraction.nodes[0]!.label).toBe("Beta");
    expect("aliases" in emptyVsBeta.extraction.nodes[0]!).toBe(false);
  });

  it("F-EN4-T4: order independence across all 6 permutations of 3 colliding extractions and citation unions", () => {
    const extA: Extraction = {
      nodes: [
        {
          id: "node-a",
          label: "Label A",
          file_type: "document",
          source_file: "doc-1.pdf",
          node_type: "Alpha",
          code_ref: "REF-2",
          aliases: ["Alias-1"],
          evidence_refs: ["ev-2"],
          registry_refs: ["reg-b"],
          properties: { montant: 200, superficie: 100 },
          citations: [
            {
              source_file: "doc-1.pdf",
              docSha: "sha-1",
              page: 1,
              quoteSpan: [10, 20],
              bbox: [0.2, 0.2, 0.8, 0.8],
            },
          ],
        },
      ],
      edges: [
        {
          source: "node-a",
          target: "node-b",
          relation: "links_to",
          confidence: "AMBIGUOUS",
          source_file: "doc-1.pdf",
          weight: 0.7,
          assertion_basis: "basis-b",
        },
      ],
      input_tokens: 10,
      output_tokens: 4,
    };

    const extB: Extraction = {
      nodes: [
        {
          id: "node-a",
          label: "Label B",
          file_type: "document",
          source_file: "doc-2.pdf",
          node_type: "Beta",
          code_ref: "REF-1",
          aliases: ["Alias-2"],
          evidence_refs: ["ev-1"],
          registry_refs: ["reg-a"],
          properties: { montant: 150 },
          citations: [
            {
              source_file: "doc-2.pdf",
              docSha: "sha-1",
              page: 1,
              quoteSpan: [10, 20],
              bbox: [0.1, 0.1, 0.5, 0.5],
            },
            {
              source_file: "doc-2.pdf",
              docSha: "sha-2",
              page: 4,
              excerpt: "second doc citation",
            },
          ],
        },
      ],
      edges: [
        {
          source: "node-a",
          target: "node-b",
          relation: "links_to",
          confidence: "EXTRACTED",
          source_file: "doc-1.pdf",
          weight: 0.3,
          assertion_basis: ["basis-a"],
        },
      ],
      input_tokens: 20,
      output_tokens: 6,
    };

    const extC: Extraction = {
      nodes: [
        {
          id: "node-a",
          label: "Label C",
          file_type: "document",
          source_file: "doc-3.pdf",
          node_type: "Alpha",
          code_ref: "REF-3",
          aliases: ["Alias-1", "Alias-3"],
          evidence_refs: ["ev-3"],
          registry_refs: ["reg-c"],
          properties: { montant: 180, extra_prop: "val" },
          citations: [
            {
              source_file: "doc-3.pdf",
              docSha: "sha-1",
              page: 1,
              quoteSpan: [10, 20],
              bbox: [0.3, 0.3, 0.9, 0.9],
            },
          ],
        },
      ],
      edges: [
        {
          source: "node-a",
          target: "node-b",
          relation: "links_to",
          confidence: "INFERRED",
          source_file: "doc-1.pdf",
          weight: 0.5,
          assertion_basis: "basis-c",
        },
      ],
      input_tokens: 30,
      output_tokens: 10,
    };

    const allPerms = permutations([extA, extB, extC]);
    expect(allPerms).toHaveLength(6);
    const baseline = canonicalOf(mergeExtractionsWithCitations(allPerms[0]!));
    for (const perm of allPerms.slice(1)) {
      expect(canonicalOf(mergeExtractionsWithCitations(perm))).toBe(baseline);
    }

    // Citation-union permutations separately with conflicting bbox values
    const c1: OntologyCitation = {
      source_file: "f1.pdf",
      docSha: "sha-dup",
      page: 2,
      quoteSpan: [1, 5],
      bbox: [0.4, 0.4, 0.8, 0.8],
    };
    const c2: OntologyCitation = {
      source_file: "f2.pdf",
      docSha: "sha-dup",
      page: 2,
      quoteSpan: [1, 5],
      bbox: [0.1, 0.2, 0.3, 0.4],
    };
    const c3: OntologyCitation = {
      source_file: "f3.pdf",
      docSha: "sha-other",
      page: 1,
      excerpt: "other",
    };
    const citePerms = permutations([c1, c2, c3]);
    const citeBaseline = canonicalOf(unionExtractionCitations([citePerms[0]!]));
    for (const perm of citePerms) {
      const unioned = unionExtractionCitations([perm]);
      expect(canonicalOf(unioned)).toBe(citeBaseline);
      const dupRep = unioned.find((c) => c.docSha === "sha-dup")!;
      expect(dupRep.bbox).toEqual([0.1, 0.2, 0.3, 0.4]);
      expect(dupRep.source_file).toBe("f1.pdf");
    }

    // m4 (P9): Collision-free internal edge key when endpoints contain U+0000
    const nulEdgeA: Extraction = {
      nodes: [],
      edges: [
        {
          source: "a\u0000b",
          target: "c",
          relation: "links_to",
          confidence: "EXTRACTED",
          source_file: "doc.pdf",
        },
      ],
      input_tokens: 0,
      output_tokens: 0,
    };
    const nulEdgeB: Extraction = {
      nodes: [],
      edges: [
        {
          source: "a",
          target: "b\u0000c",
          relation: "links_to",
          confidence: "EXTRACTED",
          source_file: "doc.pdf",
        },
      ],
      input_tokens: 0,
      output_tokens: 0,
    };
    for (const scope of ["per-source-file", "cross-document"] as const) {
      const ab = mergeExtractionsWithCitations([nulEdgeA, nulEdgeB], { edgeKeyScope: scope });
      const ba = mergeExtractionsWithCitations([nulEdgeB, nulEdgeA], { edgeKeyScope: scope });
      expect(ab.extraction.edges).toHaveLength(2);
      expect(ba.extraction.edges).toHaveLength(2);
      expect(canonicalOf(ab)).toBe(canonicalOf(ba));
      expect(
        ab.extraction.edges.map((e) => [e.source, e.target]),
      ).toEqual([
        ["a", "b\u0000c"],
        ["a\u0000b", "c"],
      ]);
      // Idempotency and associativity on U+0000-bearing edges
      const idemp = mergeExtractionsWithCitations([ab.extraction], { edgeKeyScope: scope });
      expect(canonicalOf(idemp)).toBe(canonicalOf(ab));
      const leftAssoc = mergeExtractionsWithCitations([ab.extraction, nulEdgeA], { edgeKeyScope: scope });
      const rightAssoc = mergeExtractionsWithCitations(
        [nulEdgeA, mergeExtractionsWithCitations([nulEdgeB, nulEdgeA], { edgeKeyScope: scope }).extraction],
        { edgeKeyScope: scope },
      );
      expect(canonicalOf(leftAssoc)).toBe(canonicalOf(ab));
      expect(canonicalOf(rightAssoc)).toBe(canonicalOf(ab));
    }
  });

  it("F-EN4-T5: conflict rules over flat attributes, node_type, nested properties, absent-like values, confidence, and edge fields", () => {
    // (i) Flat attribute collision alone -> one conflict, winner = smallest rendering
    const flatOnly = mergeExtractionsWithCitations([
      {
        nodes: [{ id: "node-a", label: "Node A", file_type: "document", source_file: "doc.pdf", code_ref: "CR-20" }],
        edges: [],
        input_tokens: 0,
        output_tokens: 0,
      },
      {
        nodes: [{ id: "node-a", label: "Node A", file_type: "document", source_file: "doc.pdf", code_ref: "CR-10" }],
        edges: [],
        input_tokens: 0,
        output_tokens: 0,
      },
    ]);
    expect(flatOnly.extraction.nodes[0]!.code_ref).toBe("CR-10");
    expect(flatOnly.conflicts).toEqual([
      {
        kind: "node",
        id: "node-a",
        field: "code_ref",
        values: ['"CR-10"', '"CR-20"'],
        resolved: '"CR-10"',
        sourceFiles: ["doc.pdf"],
      },
    ]);

    const n1: GraphNode = {
      id: "node-a",
      label: "Node A",
      file_type: "document",
      source_file: "doc-1.pdf",
      node_type: "Beta",
      code_ref: "CR-20",
      confidence: "AMBIGUOUS",
      null_vs_val: null,
      empty_vs_val: "",
      both_absent: null,
      properties: {
        montant: 180,
        superficie: 450,
      },
    };
    const n2: GraphNode = {
      id: "node-a",
      label: "Node A",
      file_type: "document",
      source_file: "doc-2.pdf",
      node_type: "Alpha",
      code_ref: "CR-10",
      confidence: "EXTRACTED",
      null_vs_val: "hydrated-from-null",
      empty_vs_val: "hydrated-from-empty",
      both_absent: "",
      properties: {
        montant: 150,
      },
    };

    const e1: GraphEdge = {
      source: "node-a",
      target: "node-b",
      relation: "links_to",
      confidence: "INFERRED",
      source_file: "doc-1.pdf",
      weight: 0.8,
      assertion_basis: "explicit",
    };
    const e2: GraphEdge = {
      source: "node-a",
      target: "node-b",
      relation: "links_to",
      confidence: "EXTRACTED",
      source_file: "doc-1.pdf",
      weight: 0.4,
      assertion_basis: ["inferred", "explicit"],
    };

    const res12 = mergeExtractionsWithCitations([
      { nodes: [n1], edges: [e1], input_tokens: 0, output_tokens: 0 },
      { nodes: [n2], edges: [e2], input_tokens: 0, output_tokens: 0 },
    ]);
    const res21 = mergeExtractionsWithCitations([
      { nodes: [n2], edges: [e2], input_tokens: 0, output_tokens: 0 },
      { nodes: [n1], edges: [e1], input_tokens: 0, output_tokens: 0 },
    ]);
    expect(canonicalOf(res12)).toBe(canonicalOf(res21));

    const mergedNode = res12.extraction.nodes[0]!;
    // (i) Flat attribute collision
    expect(mergedNode.code_ref).toBe("CR-10");
    // (ii) node_type collision
    expect(mergedNode.node_type).toBe("Alpha");
    // (iii) properties.montant collision + properties.superficie silent hydration
    expect(mergedNode.properties).toEqual({ montant: 150, superficie: 450 });
    // (iv) null/empty vs value hydrates silently; null vs "" resolves to "" in both orders
    expect(mergedNode.null_vs_val).toBe("hydrated-from-null");
    expect(mergedNode.empty_vs_val).toBe("hydrated-from-empty");
    expect(mergedNode.both_absent).toBe("");
    expect(res21.extraction.nodes[0]!.both_absent).toBe("");
    // (v) confidence AMBIGUOUS vs EXTRACTED -> EXTRACTED, no conflict entry
    expect(mergedNode.confidence).toBe("EXTRACTED");

    // (vi) Edge weight collision + assertion_basis mixed string/array union
    const mergedEdge = res12.extraction.edges[0]!;
    expect(mergedEdge.weight).toBe(0.4);
    expect(mergedEdge.assertion_basis).toEqual(["explicit", "inferred"]);

    expect(res12.conflicts).toEqual([
      {
        kind: "edge",
        id: "node-a\0node-b\0links_to\0doc-1.pdf",
        field: "weight",
        values: ["0.4", "0.8"],
        resolved: "0.4",
        sourceFiles: ["doc-1.pdf"],
      },
      {
        kind: "node",
        id: "node-a",
        field: "code_ref",
        values: ['"CR-10"', '"CR-20"'],
        resolved: '"CR-10"',
        sourceFiles: ["doc-1.pdf", "doc-2.pdf"],
      },
      {
        kind: "node",
        id: "node-a",
        field: "node_type",
        values: ['"Alpha"', '"Beta"'],
        resolved: '"Alpha"',
        sourceFiles: ["doc-1.pdf", "doc-2.pdf"],
      },
      {
        kind: "node",
        id: "node-a",
        field: "properties.montant",
        values: ["150", "180"],
        resolved: "150",
        sourceFiles: ["doc-1.pdf", "doc-2.pdf"],
      },
      {
        kind: "node",
        id: "node-a",
        field: "source_file",
        values: ['"doc-1.pdf"', '"doc-2.pdf"'],
        resolved: '"doc-1.pdf"',
        sourceFiles: ["doc-1.pdf", "doc-2.pdf"],
      },
    ]);

    // (vi) assertion_basis all-string distinct ("x" vs "y") -> ["x", "y"], no conflict;
    // same string on every copy -> bare string output.
    const abDistinct = mergeExtractionsWithCitations([
      {
        nodes: [],
        edges: [
          {
            source: "a",
            target: "b",
            relation: "links_to",
            confidence: "EXTRACTED",
            source_file: "d.pdf",
            assertion_basis: "y",
          },
        ],
        input_tokens: 0,
        output_tokens: 0,
      },
      {
        nodes: [],
        edges: [
          {
            source: "a",
            target: "b",
            relation: "links_to",
            confidence: "EXTRACTED",
            source_file: "d.pdf",
            assertion_basis: "x",
          },
        ],
        input_tokens: 0,
        output_tokens: 0,
      },
    ]);
    expect(abDistinct.conflicts).toEqual([]);
    expect(abDistinct.extraction.edges[0]!.assertion_basis).toEqual(["x", "y"]);

    const abSame = mergeExtractionsWithCitations([
      {
        nodes: [],
        edges: [
          {
            source: "a",
            target: "b",
            relation: "links_to",
            confidence: "EXTRACTED",
            source_file: "d.pdf",
            assertion_basis: "x",
          },
        ],
        input_tokens: 0,
        output_tokens: 0,
      },
      {
        nodes: [],
        edges: [
          {
            source: "a",
            target: "b",
            relation: "links_to",
            confidence: "EXTRACTED",
            source_file: "d.pdf",
            assertion_basis: "x",
          },
        ],
        input_tokens: 0,
        output_tokens: 0,
      },
    ]);
    expect(abSame.conflicts).toEqual([]);
    expect(abSame.extraction.edges[0]!.assertion_basis).toBe("x");

    // (vii) Mixed confidence set on one node (cast): "AMBIGUOUS" vs 0.5 -> winner "AMBIGUOUS" with conflict
    const mixedConf = mergeExtractionsWithCitations([
      {
        nodes: [
          {
            id: "node-a",
            label: "A",
            file_type: "document",
            source_file: "doc-1.pdf",
            confidence: "AMBIGUOUS",
          },
        ],
        edges: [],
        input_tokens: 0,
        output_tokens: 0,
      },
      {
        nodes: [
          {
            id: "node-a",
            label: "A",
            file_type: "document",
            source_file: "doc-2.pdf",
            confidence: 0.5 as unknown as GraphNode["confidence"],
          },
        ],
        edges: [],
        input_tokens: 0,
        output_tokens: 0,
      },
    ]);
    expect(mixedConf.extraction.nodes[0]!.confidence).toBe("AMBIGUOUS");
    expect(mixedConf.conflicts).toEqual([
      {
        kind: "node",
        id: "node-a",
        field: "confidence",
        values: ['"AMBIGUOUS"', "0.5"],
        resolved: '"AMBIGUOUS"',
        sourceFiles: ["doc-1.pdf", "doc-2.pdf"],
      },
      {
        kind: "node",
        id: "node-a",
        field: "source_file",
        values: ['"doc-1.pdf"', '"doc-2.pdf"'],
        resolved: '"doc-1.pdf"',
        sourceFiles: ["doc-1.pdf", "doc-2.pdf"],
      },
    ]);
  });

  it("F-EN4-T6: edge scope per-source-file (default) vs cross-document", () => {
    const edgeFileB: GraphEdge = {
      source: "node-a",
      target: "node-b",
      relation: "links_to",
      confidence: "EXTRACTED",
      source_file: "doc-b.pdf",
      citations: [{ source_file: "doc-b.pdf", docSha: "sha-b", page: 1, excerpt: "from b" }],
    };
    const edgeFileA1: GraphEdge = {
      source: "node-a",
      target: "node-b",
      relation: "links_to",
      confidence: "EXTRACTED",
      source_file: "doc-a.pdf",
      citations: [{ source_file: "doc-a.pdf", docSha: "sha-a", page: 1, excerpt: "from a1" }],
    };
    const edgeFileA2: GraphEdge = {
      source: "node-a",
      target: "node-b",
      relation: "links_to",
      confidence: "EXTRACTED",
      source_file: "doc-a.pdf",
      citations: [{ source_file: "doc-a.pdf", docSha: "sha-a", page: 2, excerpt: "from a2" }],
    };

    const inputs: Extraction[] = [
      { nodes: [], edges: [edgeFileB], input_tokens: 0, output_tokens: 0 },
      { nodes: [], edges: [edgeFileA1], input_tokens: 0, output_tokens: 0 },
      { nodes: [], edges: [edgeFileA2], input_tokens: 0, output_tokens: 0 },
    ];

    // Default per-source-file scope -> 2 edges, citations unioned on doc-a.pdf
    const perFile = mergeExtractionsWithCitations(inputs);
    expect(perFile.conflicts).toEqual([]);
    expect(perFile.extraction.edges).toHaveLength(2);
    expect(perFile.extraction.edges[0]!.source_file).toBe("doc-a.pdf");
    expect(perFile.extraction.edges[0]!.citations).toHaveLength(2);
    expect(perFile.extraction.edges[1]!.source_file).toBe("doc-b.pdf");
    expect(perFile.extraction.edges[1]!.citations).toHaveLength(1);

    // Cross-document scope -> 1 edge, citations unioned, no source_file conflict, smallest non-absent source_file wins
    const edgeEmptySource: GraphEdge = {
      source: "node-a",
      target: "node-b",
      relation: "links_to",
      confidence: "EXTRACTED",
      source_file: "",
    };
    const crossDoc = mergeExtractionsWithCitations(
      [...inputs, { nodes: [], edges: [edgeEmptySource], input_tokens: 0, output_tokens: 0 }],
      { edgeKeyScope: "cross-document" },
    );
    expect(crossDoc.conflicts).toEqual([]);
    expect(crossDoc.extraction.edges).toHaveLength(1);
    expect(crossDoc.extraction.edges[0]!.source_file).toBe("doc-a.pdf");
    expect(crossDoc.extraction.edges[0]!.citations).toHaveLength(3);

    // m2 (P5): All-null cross-document source_file stays null (not coerced to ""), and non-string winner stays unchanged
    const nullSfExt1: Extraction = {
      nodes: [],
      edges: [
        {
          source: "node-a",
          target: "node-b",
          relation: "links_to",
          confidence: "EXTRACTED",
          source_file: null as unknown as string,
        },
      ],
      input_tokens: 0,
      output_tokens: 0,
    };
    const nullSfExt2: Extraction = {
      nodes: [],
      edges: [
        {
          source: "node-a",
          target: "node-b",
          relation: "links_to",
          confidence: "INFERRED",
          source_file: null as unknown as string,
        },
      ],
      input_tokens: 0,
      output_tokens: 0,
    };
    const crossNull = mergeExtractionsWithCitations([nullSfExt1, nullSfExt2], {
      edgeKeyScope: "cross-document",
    });
    expect(crossNull.conflicts).toEqual([]);
    expect(crossNull.extraction.edges).toHaveLength(1);
    expect(crossNull.extraction.edges[0]!.source_file).toBeNull();
    // Idempotency and associativity on all-null cross-document edge
    expect(
      canonicalOf(
        mergeExtractionsWithCitations([crossNull.extraction], { edgeKeyScope: "cross-document" }),
      ),
    ).toBe(canonicalOf(crossNull));
    expect(
      canonicalOf(
        mergeExtractionsWithCitations([crossNull.extraction, nullSfExt1], {
          edgeKeyScope: "cross-document",
        }),
      ),
    ).toBe(canonicalOf(crossNull));

    const numSfExt: Extraction = {
      nodes: [],
      edges: [
        {
          source: "node-a",
          target: "node-b",
          relation: "links_to",
          confidence: "EXTRACTED",
          source_file: 5 as unknown as string,
        },
      ],
      input_tokens: 0,
      output_tokens: 0,
    };
    const crossNum = mergeExtractionsWithCitations([numSfExt, nullSfExt1], {
      edgeKeyScope: "cross-document",
    });
    expect(crossNum.extraction.edges[0]!.source_file).toBe(5);
  });

  it("F-EN4-T7: associativity across round-1, round-2, round-3, and round-4 counterexamples", () => {
    const assertAssociative = (a: Extraction, b: Extraction, c: Extraction) => {
      const flat = mergeExtractionsWithCitations([a, b, c]);
      const ab = mergeExtractionsWithCitations([a, b]);
      const leftNested = mergeExtractionsWithCitations([ab.extraction, c]);
      const bc = mergeExtractionsWithCitations([b, c]);
      const rightNested = mergeExtractionsWithCitations([a, bc.extraction]);

      expect(canonicalOf(leftNested.extraction)).toBe(canonicalOf(flat.extraction));
      expect(canonicalOf(rightNested.extraction)).toBe(canonicalOf(flat.extraction));

      // Idempotency on merged result and order independence across all 6 flat permutations
      expect(canonicalOf(mergeExtractionsWithCitations([flat.extraction]).extraction)).toBe(
        canonicalOf(flat.extraction),
      );
      for (const perm of permutations([a, b, c])) {
        expect(canonicalOf(mergeExtractionsWithCitations(perm))).toBe(canonicalOf(flat));
      }

      // m3: Every merge result emits unique citation keys per node and per edge
      for (const res of [flat, ab, bc, leftNested, rightNested]) {
        for (const node of res.extraction.nodes) {
          if (node.citations) {
            const citeKeys = node.citations.map((ct) => extractionCitationKey(ct));
            expect(new Set(citeKeys).size).toBe(citeKeys.length);
          }
        }
        for (const edge of res.extraction.edges) {
          if (edge.citations) {
            const citeKeys = edge.citations.map((ct) => extractionCitationKey(ct));
            expect(new Set(citeKeys).size).toBe(citeKeys.length);
          }
        }
      }

      // Forwarded conflicts from inner + outer cover the flat conflict triples (kind, id, field) for both nestings.
      const flatTriples = new Set(flat.conflicts.map((x) => `${x.kind}\0${x.id}\0${x.field}`));
      const leftTriples = new Set(
        [...ab.conflicts, ...leftNested.conflicts].map((x) => `${x.kind}\0${x.id}\0${x.field}`),
      );
      const rightTriples = new Set(
        [...bc.conflicts, ...rightNested.conflicts].map((x) => `${x.kind}\0${x.id}\0${x.field}`),
      );
      for (const t of flatTriples) {
        expect(leftTriples.has(t)).toBe(true);
        expect(rightTriples.has(t)).toBe(true);
      }
      return { flat, ab, leftNested, bc, rightNested };
    };

    // 1. Round-1 support-count false-inheritance counterexample: A(p="x", 1 cite), B(p="y", 1 cite), C(p="y", 1 cite)
    const r1A: Extraction = {
      nodes: [
        {
          id: "node-a",
          label: "A",
          file_type: "document",
          source_file: "f1.pdf",
          p: "x",
          citations: [{ source_file: "f1.pdf", docSha: "s1", page: 1, excerpt: "c1" }],
        },
      ],
      edges: [],
      input_tokens: 0,
      output_tokens: 0,
    };
    const r1B: Extraction = {
      nodes: [
        {
          id: "node-a",
          label: "A",
          file_type: "document",
          source_file: "f2.pdf",
          p: "y",
          citations: [{ source_file: "f2.pdf", docSha: "s2", page: 1, excerpt: "c2" }],
        },
      ],
      edges: [],
      input_tokens: 0,
      output_tokens: 0,
    };
    const r1C: Extraction = {
      nodes: [
        {
          id: "node-a",
          label: "A",
          file_type: "document",
          source_file: "f3.pdf",
          p: "y",
          citations: [{ source_file: "f3.pdf", docSha: "s3", page: 1, excerpt: "c3" }],
        },
      ],
      edges: [],
      input_tokens: 0,
      output_tokens: 0,
    };
    const r1 = assertAssociative(r1A, r1B, r1C);
    expect(r1.flat.extraction.nodes[0]!.p).toBe("x");

    // 2. Round-1 absent-field / high-confidence trap: A(EXTRACTED, no p), B(AMBIGUOUS, p="b"), C(INFERRED, p="c")
    const trapA: Extraction = {
      nodes: [{ id: "node-a", label: "A", file_type: "document", source_file: "f1.pdf", confidence: "EXTRACTED" }],
      edges: [],
      input_tokens: 0,
      output_tokens: 0,
    };
    const trapB: Extraction = {
      nodes: [
        { id: "node-a", label: "A", file_type: "document", source_file: "f2.pdf", confidence: "AMBIGUOUS", p: "b" },
      ],
      edges: [],
      input_tokens: 0,
      output_tokens: 0,
    };
    const trapC: Extraction = {
      nodes: [
        { id: "node-a", label: "A", file_type: "document", source_file: "f3.pdf", confidence: "INFERRED", p: "c" },
      ],
      edges: [],
      input_tokens: 0,
      output_tokens: 0,
    };
    const trap = assertAssociative(trapA, trapB, trapC);
    expect(trap.flat.extraction.nodes[0]!.p).toBe("b");
    expect(trap.flat.extraction.nodes[0]!.confidence).toBe("EXTRACTED");

    // 3. Round-2 label/aliases counterexample: A {label: "Beta", aliases: ["Alpha"]}, B {label: "Alpha"}, C {label: "Aardvark"}
    const lblA: Extraction = {
      nodes: [{ id: "node-a", label: "Beta", aliases: ["Alpha"], file_type: "document", source_file: "f.pdf" }],
      edges: [],
      input_tokens: 0,
      output_tokens: 0,
    };
    const lblB: Extraction = {
      nodes: [{ id: "node-a", label: "Alpha", file_type: "document", source_file: "f.pdf" }],
      edges: [],
      input_tokens: 0,
      output_tokens: 0,
    };
    const lblC: Extraction = {
      nodes: [{ id: "node-a", label: "Aardvark", file_type: "document", source_file: "f.pdf" }],
      edges: [],
      input_tokens: 0,
      output_tokens: 0,
    };
    const lbl = assertAssociative(lblA, lblB, lblC);
    expect(lbl.ab.extraction.nodes[0]!.label).toBe("Alpha");
    expect(lbl.ab.extraction.nodes[0]!.aliases).toEqual(["Beta"]);
    expect(lbl.flat.extraction.nodes[0]!.label).toBe("Aardvark");
    expect(lbl.flat.extraction.nodes[0]!.aliases).toEqual(["Alpha", "Beta"]);

    // 4. Round-3 (a) assertion_basis: A "x", B "y", C ["z"] on one edge key -> ["x", "y", "z"] in every grouping
    const abA: Extraction = {
      nodes: [],
      edges: [
        {
          source: "node-a",
          target: "node-b",
          relation: "links_to",
          confidence: "EXTRACTED",
          source_file: "f.pdf",
          assertion_basis: "x",
        },
      ],
      input_tokens: 0,
      output_tokens: 0,
    };
    const abB: Extraction = {
      nodes: [],
      edges: [
        {
          source: "node-a",
          target: "node-b",
          relation: "links_to",
          confidence: "EXTRACTED",
          source_file: "f.pdf",
          assertion_basis: "y",
        },
      ],
      input_tokens: 0,
      output_tokens: 0,
    };
    const abC: Extraction = {
      nodes: [],
      edges: [
        {
          source: "node-a",
          target: "node-b",
          relation: "links_to",
          confidence: "EXTRACTED",
          source_file: "f.pdf",
          assertion_basis: ["z"],
        },
      ],
      input_tokens: 0,
      output_tokens: 0,
    };
    const abRes = assertAssociative(abA, abB, abC);
    expect(abRes.flat.extraction.edges[0]!.assertion_basis).toEqual(["x", "y", "z"]);

    // 5. Round-3 (b) citation representative: three duplicates of one key (docSha casings "abc"/"ABC"/"Abc", page 2/"2", differing bbox/confidence)
    const rep1: Extraction = {
      nodes: [
        {
          id: "node-a",
          label: "A",
          file_type: "document",
          source_file: "f.pdf",
          citations: [
            {
              source_file: "f.pdf",
              docSha: "abc",
              page: 2,
              quoteSpan: [10, 20],
              bbox: [0.1, 0.1, 0.2, 0.2],
              confidence: "INFERRED",
            },
          ],
        },
      ],
      edges: [],
      input_tokens: 0,
      output_tokens: 0,
    };
    const rep2: Extraction = {
      nodes: [
        {
          id: "node-a",
          label: "A",
          file_type: "document",
          source_file: "f.pdf",
          citations: [
            {
              source_file: "f.pdf",
              docSha: "ABC",
              page: "2",
              quoteSpan: [10, 20],
              bbox: [0.5, 0.5, 0.9, 0.9],
              confidence: "INFERRED",
            },
          ],
        },
      ],
      edges: [],
      input_tokens: 0,
      output_tokens: 0,
    };
    const rep3: Extraction = {
      nodes: [
        {
          id: "node-a",
          label: "A",
          file_type: "document",
          source_file: "f.pdf",
          citations: [
            {
              source_file: "f.pdf",
              docSha: "Abc",
              page: 2,
              quoteSpan: [10, 20],
              bbox: [0.3, 0.3, 0.4, 0.4],
              confidence: "EXTRACTED",
            },
          ],
        },
      ],
      edges: [],
      input_tokens: 0,
      output_tokens: 0,
    };
    const repRes = assertAssociative(rep1, rep2, rep3);
    expect(repRes.flat.extraction.nodes[0]!.citations).toEqual([
      {
        source_file: "f.pdf",
        docSha: "ABC",
        page: "2",
        quoteSpan: [10, 20],
        bbox: [0.1, 0.1, 0.2, 0.2],
        confidence: "EXTRACTED",
      },
    ]);

    // 6. Round-3 (c) mixed confidence: A "AMBIGUOUS", B "INFERRED", C 0.5 (cast) -> "INFERRED" in flat and both nestings
    const mcA: Extraction = {
      nodes: [{ id: "node-a", label: "A", file_type: "document", source_file: "f.pdf", confidence: "AMBIGUOUS" }],
      edges: [],
      input_tokens: 0,
      output_tokens: 0,
    };
    const mcB: Extraction = {
      nodes: [{ id: "node-a", label: "A", file_type: "document", source_file: "f.pdf", confidence: "INFERRED" }],
      edges: [],
      input_tokens: 0,
      output_tokens: 0,
    };
    const mcC: Extraction = {
      nodes: [
        {
          id: "node-a",
          label: "A",
          file_type: "document",
          source_file: "f.pdf",
          confidence: 0.5 as unknown as GraphNode["confidence"],
        },
      ],
      edges: [],
      input_tokens: 0,
      output_tokens: 0,
    };
    const mcRes = assertAssociative(mcA, mcB, mcC);
    expect(mcRes.flat.extraction.nodes[0]!.confidence).toBe("INFERRED");
    // Also check nesting (A+C)+B where "AMBIGUOUS" and 0.5 meet first
    const ac = mergeExtractionsWithCitations([mcA, mcC]);
    const acThenB = mergeExtractionsWithCitations([ac.extraction, mcB]);
    expect(canonicalOf(acThenB.extraction)).toBe(canonicalOf(mcRes.flat.extraction));

    // 7. Round-4 (d) citation text fallback (R4-M1): X, Y, Z
    const tfX: Extraction = {
      nodes: [
        {
          id: "node-a",
          label: "A",
          file_type: "document",
          source_file: "f.pdf",
          citations: [{ source_file: "f.pdf", docSha: "d", page: 1, excerpt: "foo", quote: "bar" }],
        },
      ],
      edges: [],
      input_tokens: 0,
      output_tokens: 0,
    };
    const tfY: Extraction = {
      nodes: [
        {
          id: "node-a",
          label: "A",
          file_type: "document",
          source_file: "f.pdf",
          citations: [{ source_file: "f.pdf", docSha: "d", page: 1, excerpt: "", quote: "foo" }],
        },
      ],
      edges: [],
      input_tokens: 0,
      output_tokens: 0,
    };
    const tfZ: Extraction = {
      nodes: [
        {
          id: "node-a",
          label: "A",
          file_type: "document",
          source_file: "f.pdf",
          citations: [{ source_file: "f.pdf", docSha: "d", page: 1, excerpt: "bar" }],
        },
      ],
      edges: [],
      input_tokens: 0,
      output_tokens: 0,
    };
    const tfRes = assertAssociative(tfX, tfY, tfZ);
    const mergedCites = tfRes.flat.extraction.nodes[0]!.citations!;
    expect(mergedCites).toHaveLength(2);
    const keys = mergedCites.map((c) => extractionCitationKey(c));
    expect(keys).toEqual(["d\u00001\u0000t:bar", "d\u00001\u0000t:foo"]);
    const fooRep = mergedCites.find((c) => extractionCitationKey(c) === "d\u00001\u0000t:foo")!;
    expect(fooRep.excerpt).toBe("foo");
    expect(canonicalOf(unionExtractionCitations([mergedCites]))).toBe(canonicalOf(mergedCites));

    // 8. M2 (P1, P8): Default per-file scope with non-string edge source_file preserves associativity, idempotency, and order independence
    const nonStrSfEdgeExt: Extraction = {
      nodes: [],
      edges: [
        {
          source: "a",
          target: "b",
          relation: "r",
          confidence: "EXTRACTED",
          source_file: 5 as unknown as string,
        },
      ],
      input_tokens: 0,
      output_tokens: 0,
    };
    const m2Res = assertAssociative(nonStrSfEdgeExt, nonStrSfEdgeExt, nonStrSfEdgeExt);
    expect(m2Res.flat.extraction.edges).toHaveLength(1);
    expect(m2Res.flat.extraction.edges[0]!.source_file).toBe(5);
    expect(
      canonicalOf(
        mergeExtractionsWithCitations([
          mergeExtractionsWithCitations([nonStrSfEdgeExt, nonStrSfEdgeExt]).extraction,
          nonStrSfEdgeExt,
        ]),
      ),
    ).toBe(canonicalOf(mergeExtractionsWithCitations([nonStrSfEdgeExt, nonStrSfEdgeExt, nonStrSfEdgeExt])));
    expect(
      canonicalOf(
        mergeExtractionsWithCitations([
          mergeExtractionsWithCitations([nonStrSfEdgeExt]).extraction,
          nonStrSfEdgeExt,
        ]),
      ),
    ).toBe(canonicalOf(mergeExtractionsWithCitations([nonStrSfEdgeExt, nonStrSfEdgeExt])));

    const strSfEdgeExt: Extraction = {
      nodes: [],
      edges: [{ source: "a", target: "b", relation: "r", confidence: "EXTRACTED", source_file: "5" }],
      input_tokens: 0,
      output_tokens: 0,
    };
    const emptySfEdgeExt: Extraction = {
      nodes: [],
      edges: [{ source: "a", target: "b", relation: "r", confidence: "EXTRACTED", source_file: "" }],
      input_tokens: 0,
      output_tokens: 0,
    };
    const p8Res = assertAssociative(nonStrSfEdgeExt, strSfEdgeExt, emptySfEdgeExt);
    expect(p8Res.flat.extraction.edges).toHaveLength(2);
    expect(p8Res.flat.extraction.edges.map((e) => e.source_file)).toEqual([5, "5"]);

    // 9. M3 (P2): assertion_basis string with a lone surrogate is treated as absent on that copy, keeping associativity & idempotency
    const surrAbA: Extraction = {
      nodes: [],
      edges: [
        {
          source: "a",
          target: "b",
          relation: "r",
          confidence: "EXTRACTED",
          source_file: "f.pdf",
          assertion_basis: "\ud800",
        },
      ],
      input_tokens: 0,
      output_tokens: 0,
    };
    const surrAbB: Extraction = {
      nodes: [],
      edges: [
        {
          source: "a",
          target: "b",
          relation: "r",
          confidence: "EXTRACTED",
          source_file: "f.pdf",
          assertion_basis: "x",
        },
      ],
      input_tokens: 0,
      output_tokens: 0,
    };
    const surrAbC: Extraction = {
      nodes: [],
      edges: [
        {
          source: "a",
          target: "b",
          relation: "r",
          confidence: "EXTRACTED",
          source_file: "f.pdf",
        },
      ],
      input_tokens: 0,
      output_tokens: 0,
    };
    const singleSurr = mergeExtractionsWithCitations([surrAbA]);
    expect("assertion_basis" in singleSurr.extraction.edges[0]!).toBe(false);
    expect(canonicalOf(mergeExtractionsWithCitations([singleSurr.extraction]))).toBe(canonicalOf(singleSurr));
    expect(canonicalOf(mergeExtractionsWithCitations([surrAbA, surrAbA]))).toBe(canonicalOf(singleSurr));
    const m3Res = assertAssociative(surrAbA, surrAbC, surrAbB);
    expect(m3Res.flat.extraction.edges[0]!.assertion_basis).toBe("x");
  });

  it("F-EN4-T8: legacy mergeExtractions(base, extra) characterization golden", () => {
    expect(mergeExtractions.length).toBe(2);

    const base: Extraction = {
      provenance: {
        source_owner: "git",
        source_id: "repo-base",
        observed_at: "2026-01-01T00:00:00.000Z",
        source_hash: "1111111",
        adapter_version: "v1",
      },
      nodes: [
        {
          id: "node-z",
          label: "Zeta Base",
          file_type: "document",
          source_file: "a.pdf",
          citations: [{ source_file: "a.pdf", docSha: "sha-1", page: 1, excerpt: "lost citation" }],
        },
        {
          id: "node-a",
          label: "Alpha Only Base",
          file_type: "document",
          source_file: "a.pdf",
        },
      ],
      edges: [
        {
          source: "node-z",
          target: "node-a",
          relation: "links_to",
          confidence: "EXTRACTED",
          source_file: "a.pdf",
          weight: 1,
          citations: [{ source_file: "a.pdf", page: 1 }],
        },
        {
          source: "node-z",
          target: "node-a",
          relation: "links_to",
          confidence: "EXTRACTED",
          source_file: "b.pdf",
          weight: 2,
        },
      ],
      hyperedges: [
        {
          id: "he-1",
          label: "Group 1",
          nodes: ["node-z", "node-a"],
          relation: "grouped",
          confidence: "EXTRACTED",
          source_file: "a.pdf",
        },
      ],
      canonical_entities: [{ id: "ce-1", label: "Entity 1" }],
      mentions: [{ id: "m-1", label: "Mention 1" }],
      occurrences: [{ id: "occ-1" }],
      evidence: [{ id: "ev-1", quote: "Evidence 1" }],
      mappings: [{ id: "map-1", source_id: "node-z", target_id: "node-a" }],
      input_tokens: 100,
      output_tokens: 40,
    };

    const extra: Extraction = {
      provenance: {
        source_owner: "git",
        source_id: "repo-extra",
        observed_at: "2026-02-01T00:00:00.000Z",
        source_hash: "2222222",
        adapter_version: "v1",
      },
      nodes: [
        {
          id: "node-z",
          label: "Zeta Extra Wins Wholesale",
          file_type: "document",
          source_file: "b.pdf",
        },
        {
          id: "node-m",
          label: "Middle Extra",
          file_type: "document",
          source_file: "b.pdf",
        },
      ],
      edges: [
        {
          source: "node-z",
          target: "node-a",
          relation: "links_to",
          confidence: "INFERRED",
          source_file: "a.pdf",
          weight: 9,
        },
      ],
      hyperedges: [
        {
          id: "he-1",
          label: "Group 1 Duplicate Kept",
          nodes: ["node-m", "node-a"],
          relation: "grouped",
          confidence: "INFERRED",
          source_file: "b.pdf",
        },
      ],
      canonical_entities: [{ id: "ce-2", label: "Entity 2" }],
      mentions: [{ id: "m-2", label: "Mention 2" }],
      occurrences: [{ id: "occ-2" }],
      evidence: [{ id: "ev-2", quote: "Evidence 2" }],
      mappings: [{ id: "map-2", source_id: "node-m", target_id: "node-a" }],
      input_tokens: 55,
      output_tokens: 25,
    };

    const legacy = mergeExtractions(base, extra);

    // m3: Pin the complete legacy output object
    expect(legacy).toEqual({
      provenance: {
        source_owner: "git",
        source_id: "repo-extra",
        observed_at: "2026-02-01T00:00:00.000Z",
        source_hash: "2222222",
        adapter_version: "v1",
      },
      nodes: [
        {
          id: "node-z",
          label: "Zeta Extra Wins Wholesale",
          file_type: "document",
          source_file: "b.pdf",
        },
        {
          id: "node-a",
          label: "Alpha Only Base",
          file_type: "document",
          source_file: "a.pdf",
        },
        {
          id: "node-m",
          label: "Middle Extra",
          file_type: "document",
          source_file: "b.pdf",
        },
      ],
      edges: [
        {
          source: "node-z",
          target: "node-a",
          relation: "links_to",
          confidence: "INFERRED",
          source_file: "a.pdf",
          weight: 9,
        },
        {
          source: "node-z",
          target: "node-a",
          relation: "links_to",
          confidence: "EXTRACTED",
          source_file: "b.pdf",
          weight: 2,
        },
      ],
      hyperedges: [
        {
          id: "he-1",
          label: "Group 1",
          nodes: ["node-z", "node-a"],
          relation: "grouped",
          confidence: "EXTRACTED",
          source_file: "a.pdf",
        },
        {
          id: "he-1",
          label: "Group 1 Duplicate Kept",
          nodes: ["node-m", "node-a"],
          relation: "grouped",
          confidence: "INFERRED",
          source_file: "b.pdf",
        },
      ],
      input_tokens: 155,
      output_tokens: 65,
    });
    expect("canonical_entities" in legacy).toBe(false);
    expect("mentions" in legacy).toBe(false);
    expect("occurrences" in legacy).toBe(false);
    expect("evidence" in legacy).toBe(false);
    expect("mappings" in legacy).toBe(false);
  });

  it("F-EN4-T9: all Extraction members, totality, own __proto__ keys, and non-string citation key fields", () => {
    // 1. Empty input [] and root barrel re-exports
    expect(typeof rootApi.mergeExtractionsWithCitations).toBe("function");
    expect(typeof rootApi.extractionCitationKey).toBe("function");
    expect(typeof rootApi.unionExtractionCitations).toBe("function");
    expect(mergeExtractionsWithCitations([])).toEqual({
      extraction: {
        nodes: [],
        edges: [],
        hyperedges: [],
        input_tokens: 0,
        output_tokens: 0,
      },
      conflicts: [],
    });

    // 2. All Extraction members exercised with id collisions and conflicts
    const full1: Extraction = {
      provenance: {
        source_owner: "dag",
        source_id: "src-b",
        observed_at: "2026-03-02T00:00:00.000Z",
        source_hash: "hash-b",
        adapter_version: "1.0",
      },
      nodes: [
        {
          id: "node-a",
          label: "Node A",
          file_type: "document",
          source_file: "doc-1.pdf",
          evidence_refs: ["ev-1", "ev-2"],
        },
      ],
      edges: [],
      hyperedges: [
        {
          id: "he-1",
          label: "Hyperedge B",
          nodes: ["node-b", "node-a"],
          relation: "rel",
          confidence: "INFERRED",
          source_file: "doc-1.pdf",
        },
      ],
      canonical_entities: [
        {
          id: "ce-1",
          label: "Canonical B",
          type: "TypeB",
          evidence_refs: ["ev-1"],
        },
      ],
      mentions: [
        {
          id: "m-1",
          label: "Mention",
          canonical_id: "ce-2",
          evidence_refs: ["ev-1"],
        },
      ],
      occurrences: [
        {
          id: "occ-1",
          summary: "Summary B",
          linked_entity_ids: ["ce-2", "ce-1"],
          source_refs: ["sr-2"],
          evidence_refs: ["ev-1"],
        },
      ],
      evidence: [
        {
          id: "ev-1",
          source_file: "doc-1.pdf",
          quote: "Quote B",
          confidence: 0.9,
        },
        {
          id: "ev-2",
          source_file: "doc-1.pdf",
          quote: "Quote 2",
          confidence: 0.8,
        },
      ],
      mappings: [
        {
          id: "map-1",
          source_id: "node-a",
          target_id: "ce-1",
          mapping_type: "exact",
          assertion_basis: "basis-2",
          evidence_refs: ["ev-1"],
        },
      ],
      input_tokens: 40,
      output_tokens: 15,
    };

    const full2: Extraction = {
      provenance: {
        source_owner: "dag",
        source_id: "src-a",
        observed_at: "2026-03-01T00:00:00.000Z",
        source_hash: "hash-a",
        adapter_version: "1.0",
      },
      nodes: [
        {
          id: "node-a",
          label: "Node A",
          file_type: "document",
          source_file: "doc-2.pdf",
          evidence_refs: ["ev-1"],
        },
      ],
      edges: [],
      hyperedges: [
        {
          id: "he-1",
          label: "Hyperedge A",
          nodes: ["node-c", "node-a"],
          relation: "rel",
          confidence: "EXTRACTED",
          source_file: "doc-2.pdf",
        },
      ],
      canonical_entities: [
        {
          id: "ce-1",
          label: "Canonical A",
          type: "TypeA",
          evidence_refs: ["ev-2"],
        },
      ],
      mentions: [
        {
          id: "m-1",
          label: "Mention",
          canonical_id: "ce-1",
          evidence_refs: ["ev-2"],
        },
      ],
      occurrences: [
        {
          id: "occ-1",
          summary: "Summary A",
          linked_entity_ids: ["ce-3"],
          source_refs: ["sr-1"],
          evidence_refs: ["ev-2"],
        },
      ],
      evidence: [
        {
          id: "ev-1",
          source_file: "doc-2.pdf",
          quote: "Quote A",
          confidence: 0.4,
        },
      ],
      mappings: [
        {
          id: "map-1",
          source_id: "node-a",
          target_id: "ce-1",
          mapping_type: "broad",
          assertion_basis: "basis-1",
          evidence_refs: ["ev-2"],
        },
      ],
      input_tokens: 60,
      output_tokens: 25,
    };

    const fullRes = mergeExtractionsWithCitations([full1, full2]);
    expect(fullRes.extraction.input_tokens).toBe(100);
    expect(fullRes.extraction.output_tokens).toBe(40);
    expect(fullRes.extraction.provenance?.source_id).toBe("src-a");
    expect(fullRes.extraction.hyperedges![0]!.nodes).toEqual(["node-a", "node-b", "node-c"]);
    expect(fullRes.extraction.hyperedges![0]!.confidence).toBe("EXTRACTED");
    expect(fullRes.extraction.occurrences![0]!.linked_entity_ids).toEqual(["ce-1", "ce-2", "ce-3"]);
    expect(fullRes.extraction.occurrences![0]!.source_refs).toEqual(["sr-1", "sr-2"]);
    expect(fullRes.extraction.mappings![0]!.assertion_basis).toEqual(["basis-1", "basis-2"]);

    // Evidence ev-1 merged, numeric confidence 0.4 wins by smallest rendering with conflict; all evidence_refs resolve across all records
    const evIds = new Set(fullRes.extraction.evidence!.map((e) => e.id));
    expect(evIds).toEqual(new Set(["ev-1", "ev-2"]));
    const ev1 = fullRes.extraction.evidence!.find((e) => e.id === "ev-1")!;
    expect(ev1.confidence).toBe(0.4);
    expect(ev1.quote).toBe("Quote A");
    for (const record of [
      ...fullRes.extraction.nodes,
      ...(fullRes.extraction.canonical_entities ?? []),
      ...(fullRes.extraction.mentions ?? []),
      ...(fullRes.extraction.occurrences ?? []),
      ...(fullRes.extraction.mappings ?? []),
    ]) {
      for (const ref of record.evidence_refs ?? []) {
        expect(evIds.has(ref)).toBe(true);
      }
    }

    const conflictKinds = new Set<ExtractionMergeConflict["kind"]>(fullRes.conflicts.map((c) => c.kind));
    expect(conflictKinds).toEqual(
      new Set(["provenance", "node", "hyperedge", "canonical_entity", "mention", "occurrence", "evidence", "mapping"]),
    );
    const provConflicts = fullRes.conflicts.filter((c) => c.kind === "provenance");
    expect(provConflicts).toHaveLength(1);
    expect(provConflicts[0]).toEqual({
      kind: "provenance",
      id: "provenance",
      field: "provenance",
      values: [canonicalOf(full2.provenance), canonicalOf(full1.provenance)],
      resolved: canonicalOf(full2.provenance),
      sourceFiles: [""],
    });
    const evConfConflict = fullRes.conflicts.find(
      (c) => c.kind === "evidence" && c.id === "ev-1" && c.field === "confidence",
    );
    expect(evConfConflict).toEqual({
      kind: "evidence",
      id: "ev-1",
      field: "confidence",
      values: ["0.4", "0.9"],
      resolved: "0.4",
      sourceFiles: ["doc-1.pdf", "doc-2.pdf"],
    });

    // 3. Totality (§4(c)): NaN confidence_score, {community: undefined}, lone surrogate in citation excerpt,
    // non-object node, node without id, edges without valid string source/target/relation,
    // missing/non-array nodes/edges -> [], and non-array optional members -> absent
    const malformed: Extraction = {
      nodes: [
        null as unknown as GraphNode,
        "not-an-object" as unknown as GraphNode,
        { label: "Missing ID", file_type: "document", source_file: "doc.pdf" } as unknown as GraphNode,
        {
          id: "valid-node",
          label: "Valid",
          file_type: "document",
          source_file: "doc.pdf",
          community: undefined,
          confidence_score: Number.NaN,
          citations: [
            { source_file: "doc.pdf", docSha: "sha", page: 1, excerpt: "bad \ud800 surrogate" },
            { source_file: "doc.pdf", docSha: "sha", page: 2, excerpt: "good excerpt" },
          ],
        },
      ],
      edges: [
        null as unknown as GraphEdge,
        { target: "valid-node", relation: "links_to", confidence: "EXTRACTED", source_file: "doc.pdf" } as unknown as GraphEdge,
        { source: 123, target: "valid-node", relation: "links_to", confidence: "EXTRACTED", source_file: "doc.pdf" } as unknown as GraphEdge,
        { source: "valid-node", target: "", relation: "links_to", confidence: "EXTRACTED", source_file: "doc.pdf" } as unknown as GraphEdge,
        { source: "valid-node", target: "valid-node", relation: "bad\ud800rel", confidence: "EXTRACTED", source_file: "doc.pdf" } as unknown as GraphEdge,
        {
          source: "valid-node",
          target: "valid-node",
          relation: "links_to",
          confidence: "EXTRACTED",
          source_file: "doc.pdf",
          confidence_score: Number.NaN,
        },
      ],
      hyperedges: "not-an-array" as unknown as Extraction["hyperedges"],
      canonical_entities: 42 as unknown as Extraction["canonical_entities"],
      input_tokens: 5,
      output_tokens: 2,
    };
    const missingArraysExt = {
      nodes: undefined,
      edges: "not-an-array",
      hyperedges: { bad: true },
      mentions: "not-an-array",
      input_tokens: Number.NaN,
      output_tokens: -0,
    } as unknown as Extraction;

    const totRes = mergeExtractionsWithCitations([malformed, missingArraysExt]);
    expect(totRes.extraction.nodes).toHaveLength(1);
    const validNode = totRes.extraction.nodes[0]!;
    expect(validNode.id).toBe("valid-node");
    expect("community" in validNode).toBe(false);
    expect("confidence_score" in validNode).toBe(false);
    expect(validNode.citations).toHaveLength(1);
    expect(validNode.citations![0]!.excerpt).toBe("good excerpt");
    expect(totRes.extraction.edges).toHaveLength(1);
    expect("confidence_score" in totRes.extraction.edges[0]!).toBe(false);
    expect("hyperedges" in totRes.extraction).toBe(false);
    expect("canonical_entities" in totRes.extraction).toBe(false);
    expect("mentions" in totRes.extraction).toBe(false);
    expect(() => canonicalBytes(totRes.extraction)).not.toThrow();

    const onlyMissingArrays = mergeExtractionsWithCitations([missingArraysExt]);
    expect(onlyMissingArrays.extraction).toEqual({
      nodes: [],
      edges: [],
      input_tokens: 0,
      output_tokens: 0,
    });
    expect("hyperedges" in onlyMissingArrays.extraction).toBe(false);

    // 4. Own "__proto__" keys via JSON.parse at top level and inside properties{}
    const protoNode1 = JSON.parse(
      '{"id":"proto-node","label":"Proto","file_type":"document","source_file":"doc-1.pdf","__proto__":{"polluted":"zeta"},"properties":{"__proto__":{"nested":20},"normal":1}}',
    ) as GraphNode;
    const protoNode2 = JSON.parse(
      '{"id":"proto-node","label":"Proto","file_type":"document","source_file":"doc-2.pdf","__proto__":{"polluted":"alpha"},"properties":{"__proto__":{"nested":10},"normal":1}}',
    ) as GraphNode;

    const protoRes = mergeExtractionsWithCitations([
      { nodes: [protoNode1], edges: [], input_tokens: 0, output_tokens: 0 },
      { nodes: [protoNode2], edges: [], input_tokens: 0, output_tokens: 0 },
    ]);
    const mergedProtoNode = protoRes.extraction.nodes[0]!;
    expect(Object.getPrototypeOf(mergedProtoNode)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(mergedProtoNode, "__proto__")).toBe(true);
    expect(Object.getOwnPropertyDescriptor(mergedProtoNode, "__proto__")?.value).toEqual({ polluted: "alpha" });
    const mergedProps = mergedProtoNode.properties as Record<string, unknown>;
    expect(Object.getPrototypeOf(mergedProps)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(mergedProps, "__proto__")).toBe(true);
    expect(Object.getOwnPropertyDescriptor(mergedProps, "__proto__")?.value).toEqual({ nested: 10 });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(() => canonicalBytes(protoRes.extraction)).not.toThrow();

    // 5. Non-string key fields on citation (numeric docSha and numeric quote casts)
    const numericKeyCite = {
      source_file: "doc.pdf",
      docSha: 12345 as unknown as string,
      page: 1,
      quote: 67890 as unknown as string,
    } as OntologyCitation;
    expect(extractionCitationKey(numericKeyCite)).toBe("\u00001\u0000t:");
    const numCiteRes = mergeExtractionsWithCitations([
      {
        nodes: [
          {
            id: "node-num",
            label: "Num",
            file_type: "document",
            source_file: "doc.pdf",
            citations: [numericKeyCite],
          },
        ],
        edges: [],
        input_tokens: 0,
        output_tokens: 0,
      },
    ]);
    expect(numCiteRes.extraction.nodes[0]!.citations).toHaveLength(1);
    expect(() => canonicalBytes(numCiteRes.extraction)).not.toThrow();

    // 6. M1 (P3a-P3f): JSON objects with own non-callable toString in edge source_file and citation page never throw
    const badToStringObj = JSON.parse('{"toString":1}') as unknown;
    const badToStringArr = JSON.parse('[{"toString":2}]') as unknown;
    const nullProtoPage = Object.create(null) as unknown;

    const citeBadPageObj: OntologyCitation = {
      source_file: "doc.pdf",
      docSha: "SHA-M1",
      page: badToStringObj as number,
      excerpt: "clause one",
    };
    const citeBadPageArr: OntologyCitation = {
      source_file: "doc.pdf",
      docSha: "SHA-M1",
      page: badToStringArr as number,
      excerpt: "clause two",
    };
    const citeNullProto: OntologyCitation = {
      source_file: "doc.pdf",
      docSha: "SHA-M1",
      page: nullProtoPage as number,
      excerpt: "clause three",
    };
    expect(extractionCitationKey(citeBadPageObj)).toBe("sha-m1\0\0t:clause one");
    expect(extractionCitationKey(citeBadPageArr)).toBe("sha-m1\0\0t:clause two");
    expect(extractionCitationKey(citeNullProto)).toBe("sha-m1\0\0t:clause three");

    const unionBadPages = unionExtractionCitations([[citeBadPageObj], [citeBadPageArr]]);
    expect(unionBadPages).toHaveLength(2);
    expect(canonicalOf(unionExtractionCitations([[citeBadPageArr], [citeBadPageObj]]))).toBe(
      canonicalOf(unionBadPages),
    );
    expect(canonicalOf(unionExtractionCitations([unionBadPages]))).toBe(canonicalOf(unionBadPages));

    const m1ExtA: Extraction = {
      nodes: [
        {
          id: "node-m1",
          label: "M1",
          file_type: "document",
          source_file: "doc.pdf",
          citations: [citeBadPageObj],
        },
      ],
      edges: [
        {
          source: "node-m1",
          target: "node-m1",
          relation: "links_to",
          confidence: "EXTRACTED",
          source_file: badToStringObj as string,
          citations: [citeBadPageObj],
        },
      ],
      input_tokens: 0,
      output_tokens: 0,
    };
    const m1ExtB: Extraction = {
      nodes: [
        {
          id: "node-m1",
          label: "M1",
          file_type: "document",
          source_file: "doc.pdf",
          citations: [citeBadPageArr],
        },
      ],
      edges: [
        {
          source: "node-m1",
          target: "node-m1",
          relation: "links_to",
          confidence: "EXTRACTED",
          source_file: badToStringObj as string,
          citations: [citeBadPageArr],
        },
      ],
      input_tokens: 0,
      output_tokens: 0,
    };

    for (const scope of ["per-source-file", "cross-document"] as const) {
      const m1MergedAB = mergeExtractionsWithCitations([m1ExtA, m1ExtB], { edgeKeyScope: scope });
      const m1MergedBA = mergeExtractionsWithCitations([m1ExtB, m1ExtA], { edgeKeyScope: scope });
      expect(m1MergedAB.extraction.edges).toHaveLength(1);
      expect(m1MergedAB.extraction.nodes[0]!.citations).toHaveLength(2);
      expect(m1MergedAB.extraction.nodes[0]!.citation_count).toBe(2);
      expect(m1MergedAB.extraction.edges[0]!.citations).toHaveLength(2);
      expect(m1MergedAB.extraction.edges[0]!.citation_count).toBe(2);
      expect(canonicalOf(m1MergedAB)).toBe(canonicalOf(m1MergedBA));
      // Idempotency and associativity
      expect(
        canonicalOf(mergeExtractionsWithCitations([m1MergedAB.extraction], { edgeKeyScope: scope })),
      ).toBe(canonicalOf(m1MergedAB));
      expect(
        canonicalOf(
          mergeExtractionsWithCitations([m1MergedAB.extraction, m1ExtA], { edgeKeyScope: scope }),
        ),
      ).toBe(
        canonicalOf(mergeExtractionsWithCitations([m1ExtA, m1ExtB, m1ExtA], { edgeKeyScope: scope })),
      );
    }
  });
});


import { edge as mlEdge, extraction as mlExtraction, rows as mlRows, observation as mlObservation, expectObservations as mlObs, expectFixedPoint as mlFixed } from "./helpers/multi-links.js";
import { batchFixture as mlBatchFixture, batchIntake as mlBatchIntake, batchSha as mlBatchSha } from "./helpers/multi-links-batch.js";
describe("L0-R/C batch",()=>{
 for(const scope of ["cross-document","per-source-file"] as const) describe(scope,()=>{
  it.fails("batch-distinct-scalar-locators-kept",async()=>{
   const {buildFromJson}=await import("../src/build.js");
   const emissions=["L10","L44"].map(loc=>mlEdge({source_location:loc,citations:[{source_file:"f.ts",excerpt:loc}]}));
   const result=mergeExtractionsWithCitations(emissions.map(e=>mlExtraction([e])),{edgeKeyScope:scope});
   expect(result.extraction.edges).toHaveLength(1);
   const G=buildFromJson(result.extraction);mlObs(mlRows(G)[0],emissions.map(mlObservation));mlFixed(G,emissions);
  });
  it.fails("B1-reciprocal-effective-batch-separation",async()=>{
   const {buildFromJson}=await import("../src/build.js");
   const emissions=[mlEdge({_src:"a",_tgt:"b",source_location:"L1"}),mlEdge({_src:"b",_tgt:"a",source_location:"L2"})];
   const result=mergeExtractionsWithCitations(emissions.map(e=>mlExtraction([e])),{edgeKeyScope:scope});
   expect(result.extraction.edges).toHaveLength(2);
   const G=buildFromJson(result.extraction);expect(G.size).toBe(2);
   for(const e of emissions){const row=mlRows(G).find(r=>r.source===e._src&&r.target===e._tgt)!;mlObs(row,[mlObservation(e)]);expect([row.source,row.target,row._src,row._tgt]).toEqual([e._src,e._tgt,e._src,e._tgt]);}
   mlFixed(G,emissions);
  });
  it.fails("B1-same-effective-different-raw-order-coalesces",async()=>{
   const {buildFromJson}=await import("../src/build.js");
   const emissions=[mlEdge({_src:"a",_tgt:"b",source_location:"L1"}),mlEdge({source:"b",target:"a",_src:"a",_tgt:"b",source_location:"L2"})];
   const G=buildFromJson(mergeExtractionsWithCitations(emissions.map(e=>mlExtraction([e])),{edgeKeyScope:scope}).extraction);
   expect(G.size).toBe(1);mlObs(mlRows(G)[0],emissions.map(mlObservation));mlFixed(G,emissions);
  });
 });
 it.fails("batch-citation-normalisation-never-reapplied-to-stored",async()=>{
  const {buildFromJson}=await import("../src/build.js");
  const storedRecord={citations:[{docSha:"b".repeat(64),page:1,quote:"legacy",quoteSpan:[0,5],source_file:"legacy.pdf"}],confidence:"EXTRACTED",source_file:"/legacy/paper.pdf",source_location:"STORED"};
  const input=mlBatchFixture({source_location:"STORED",evidence_observations:[storedRecord],citations:storedRecord.citations});
  const fresh=mlBatchFixture({source_location:"FRESH",citations:[{source_file:"wrong.pdf",docSha:"c".repeat(64),page:1,quoteSpan:[0,5],quote:"Alpha"}]}).edges[0];
  input.edges.push(fresh);
  const before=JSON.stringify(storedRecord);
  const accepted=await mlBatchIntake(input,"/repo");
  const G=buildFromJson(accepted,{root:"/repo"}),obs=mlRows(G)[0].evidence_observations;
  expect(obs).toHaveLength(2);
  expect(JSON.stringify(obs.find((r:any)=>r.source_location==="STORED"))).toBe(before);
  const normalized=obs.find((r:any)=>r.source_location==="FRESH");
  expect(normalized.citations).toEqual([{source_file:"/repo/f.ts",docSha:mlBatchSha,page:1,quoteSpan:[0,5],quote:"Alpha"}]);
  expect(normalized.source_file).toBe("f.ts");
  expect(JSON.stringify(storedRecord)).toBe(before);
  mlFixed(G,accepted.edges);
 });
 it.fails("R4-batch-no-root-preserves-absolute-locator",async()=>{
  const {buildFromJson}=await import("../src/build.js");
  const e=mlEdge({source_file:"/repo/f.ts",source_location:"L1"});
  const result=mergeExtractionsWithCitations([mlExtraction([e])]);
  expect(result.extraction.edges[0].evidence_observations).toEqual([mlObservation(e)]);
  const G=buildFromJson(result.extraction,{root:"/repo"});
  expect(mlRows(G)[0].source_file).toBe("/repo/f.ts");mlObs(mlRows(G)[0],[mlObservation(e)]);mlFixed(G,result.extraction.edges);
 });
});
