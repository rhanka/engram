import { describe, it, expect } from "vitest";
import { buildFromJson, build } from "../src/build.js";
import type { Extraction } from "../src/types.js";

const SAMPLE_EXTRACTION: Extraction = {
  nodes: [
    { id: "a", label: "ClassA", file_type: "code", source_file: "sample.py" },
    { id: "b", label: "ClassB", file_type: "code", source_file: "sample.py" },
    { id: "c", label: "func_c", file_type: "code", source_file: "sample.py" },
  ],
  edges: [
    { source: "a", target: "b", relation: "calls", confidence: "EXTRACTED", source_file: "sample.py" },
    { source: "a", target: "c", relation: "contains", confidence: "EXTRACTED", source_file: "sample.py" },
  ],
  input_tokens: 0,
  output_tokens: 0,
};

describe("buildFromJson", () => {
  it("creates a graph with correct node count", () => {
    const G = buildFromJson(SAMPLE_EXTRACTION);
    expect(G.order).toBe(3);
  });

  it("creates a graph with correct edge count", () => {
    const G = buildFromJson(SAMPLE_EXTRACTION);
    expect(G.size).toBe(2);
  });

  it("preserves node attributes", () => {
    const G = buildFromJson(SAMPLE_EXTRACTION);
    expect(G.getNodeAttribute("a", "label")).toBe("ClassA");
    expect(G.getNodeAttribute("a", "file_type")).toBe("code");
  });

  it("preserves edge direction via _src/_tgt", () => {
    const G = buildFromJson(SAMPLE_EXTRACTION);
    const edge = G.edge("a", "b");
    expect(edge).toBeDefined();
    const attrs = G.getEdgeAttributes(edge!);
    expect(attrs._src).toBe("a");
    expect(attrs._tgt).toBe("b");
  });

  it("skips edges with unknown nodes", () => {
    const ext: Extraction = {
      nodes: [{ id: "x", label: "X", file_type: "code", source_file: "f.py" }],
      edges: [{ source: "x", target: "missing", relation: "imports", confidence: "EXTRACTED", source_file: "f.py" }],
      input_tokens: 0,
      output_tokens: 0,
    };
    const G = buildFromJson(ext);
    expect(G.order).toBe(1);
    expect(G.size).toBe(0);
  });

  it("stores hyperedges as graph attribute", () => {
    const ext: Extraction = {
      ...SAMPLE_EXTRACTION,
      hyperedges: [{ id: "h1", label: "Group", nodes: ["a", "b"], relation: "group", confidence: "INFERRED", source_file: "f.py" }],
    };
    const G = buildFromJson(ext);
    const hyper = G.getAttribute("hyperedges") as unknown[];
    expect(hyper).toHaveLength(1);
  });

  it("creates a directed graph when requested", () => {
    const G = buildFromJson(SAMPLE_EXTRACTION, { directed: true });
    expect(G.type).toBe("directed");
    expect(G.outboundNeighbors("a").sort()).toEqual(["b", "c"]);
    expect(G.outboundNeighbors("b")).toEqual([]);
  });

  it("normalizes Windows-style source_file separators during graph ingestion", () => {
    const ext: Extraction = {
      nodes: [
        { id: "a", label: "AuthFile", file_type: "code", source_file: "src\\middleware\\auth.ts" },
        { id: "b", label: "SessionFile", file_type: "code", source_file: "src\\middleware\\session.ts" },
      ],
      edges: [
        {
          source: "a",
          target: "b",
          relation: "references",
          confidence: "EXTRACTED",
          source_file: "src\\middleware\\auth.ts",
        },
      ],
      hyperedges: [
        {
          id: "auth_group",
          label: "Auth Group",
          nodes: ["a", "b"],
          relation: "form",
          confidence: "INFERRED",
          source_file: "src\\middleware\\auth.ts",
        },
      ],
      input_tokens: 0,
      output_tokens: 0,
    };

    const G = buildFromJson(ext);
    const edge = G.edge("a", "b");
    const hyperedges = G.getAttribute("hyperedges") as Extraction["hyperedges"];

    expect(G.getNodeAttribute("a", "source_file")).toBe("src/middleware/auth.ts");
    expect(G.getNodeAttribute("b", "source_file")).toBe("src/middleware/session.ts");
    expect(edge).toBeDefined();
    expect(G.getEdgeAttribute(edge!, "source_file")).toBe("src/middleware/auth.ts");
    expect(hyperedges?.[0]?.source_file).toBe("src/middleware/auth.ts");
  });
});

describe("build (merge)", () => {
  it("merges multiple extractions", () => {
    const ext1: Extraction = {
      nodes: [{ id: "a", label: "A", file_type: "code", source_file: "a.py" }],
      edges: [],
      input_tokens: 10,
      output_tokens: 5,
    };
    const ext2: Extraction = {
      nodes: [{ id: "b", label: "B", file_type: "code", source_file: "b.py" }],
      edges: [{ source: "a", target: "b", relation: "calls", confidence: "EXTRACTED", source_file: "b.py" }],
      input_tokens: 20,
      output_tokens: 10,
    };
    const G = build([ext1, ext2]);
    expect(G.order).toBe(2);
    expect(G.size).toBe(1);
  });

  it("can merge multiple extractions into a directed graph", () => {
    const ext1: Extraction = {
      nodes: [{ id: "a", label: "A", file_type: "code", source_file: "a.py" }],
      edges: [],
      input_tokens: 0,
      output_tokens: 0,
    };
    const ext2: Extraction = {
      nodes: [{ id: "b", label: "B", file_type: "code", source_file: "b.py" }],
      edges: [{ source: "a", target: "b", relation: "calls", confidence: "EXTRACTED", source_file: "b.py" }],
      input_tokens: 0,
      output_tokens: 0,
    };
    const G = build([ext1, ext2], { directed: true });
    expect(G.type).toBe("directed");
    expect(G.outboundNeighbors("a")).toEqual(["b"]);
    expect(G.outboundNeighbors("b")).toEqual([]);
  });
});
