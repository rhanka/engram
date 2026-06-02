import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { buildMerge } from "../src/build.js";

const cleanupDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-build-merge-"));
  cleanupDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (cleanupDirs.length > 0) {
    rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
  }
});

describe("buildMerge", () => {
  it("merges new chunks with an existing graph snapshot", () => {
    const dir = tempDir();
    const graphPath = join(dir, "graph.json");
    writeFileSync(
      graphPath,
      JSON.stringify({
        directed: false,
        graph: {},
        nodes: [{ id: "alpha", label: "Alpha", source_file: "src/a.ts", file_type: "code" }],
        links: [],
      }, null, 2),
      "utf-8",
    );

    const graph = buildMerge([
      {
        nodes: [{ id: "beta", label: "Beta", source_file: "src/b.ts", file_type: "code" }],
        edges: [{ source: "alpha", target: "beta", relation: "uses", confidence: "EXTRACTED", source_file: "src/b.ts" }],
        input_tokens: 0,
        output_tokens: 0,
      },
    ], { graphPath });

    expect(graph.order).toBe(2);
    expect(graph.size).toBe(1);
    expect(graph.hasNode("alpha")).toBe(true);
    expect(graph.hasNode("beta")).toBe(true);
  });

  it("preserves existing edge direction from graph.json links during merge", () => {
    const dir = tempDir();
    const graphPath = join(dir, "graph.json");
    writeFileSync(
      graphPath,
      JSON.stringify({
        directed: false,
        graph: {},
        nodes: [
          { id: "callee", label: "Callee", source_file: "src/callee.ts", file_type: "code" },
          { id: "caller", label: "Caller", source_file: "src/caller.ts", file_type: "code" },
        ],
        links: [
          {
            source: "caller",
            target: "callee",
            relation: "calls",
            confidence: "EXTRACTED",
            source_file: "src/caller.ts",
          },
        ],
      }, null, 2),
      "utf-8",
    );

    const graph = buildMerge([], { graphPath });
    const edge = graph.edge("callee", "caller");
    expect(edge).toBeDefined();
    const attrs = graph.getEdgeAttributes(edge!);
    expect(attrs._src).toBe("caller");
    expect(attrs._tgt).toBe("callee");
  });

  it("prefers preserved _src/_tgt direction when existing graph links are undirected", () => {
    const dir = tempDir();
    const graphPath = join(dir, "graph.json");
    writeFileSync(
      graphPath,
      JSON.stringify({
        directed: false,
        graph: {},
        nodes: [
          { id: "callee", label: "Callee", source_file: "src/callee.ts", file_type: "code" },
          { id: "caller", label: "Caller", source_file: "src/caller.ts", file_type: "code" },
        ],
        links: [
          {
            source: "callee",
            target: "caller",
            _src: "caller",
            _tgt: "callee",
            relation: "calls",
            confidence: "EXTRACTED",
            source_file: "src/caller.ts",
          },
        ],
      }, null, 2),
      "utf-8",
    );

    const graph = buildMerge([], { graphPath });
    const edge = graph.edge("callee", "caller");
    expect(edge).toBeDefined();
    const attrs = graph.getEdgeAttributes(edge!);
    expect(attrs._src).toBe("caller");
    expect(attrs._tgt).toBe("callee");
  });

  it("refuses to silently shrink an existing graph without pruneSources", () => {
    const dir = tempDir();
    const graphPath = join(dir, "graph.json");
    writeFileSync(
      graphPath,
      JSON.stringify({
        directed: false,
        graph: {},
        nodes: [
          { id: "auth_session_c1", label: "Auth Session", source_file: "docs/chunk-a.md", file_type: "document" },
          { id: "auth_session", label: "Auth Session", source_file: "docs/chunk-b.md", file_type: "document" },
        ],
        links: [],
      }, null, 2),
      "utf-8",
    );

    expect(() => buildMerge([], { graphPath })).toThrow("buildMerge would shrink graph");
  });

  it("prunes deleted sources with normalized Windows-style source paths", () => {
    const dir = tempDir();
    const graphPath = join(dir, "graph.json");
    writeFileSync(
      graphPath,
      JSON.stringify({
        directed: false,
        graph: {},
        nodes: [
          { id: "old", label: "OldFile", source_file: "src/old.ts", file_type: "code" },
          { id: "keep", label: "KeepFile", source_file: "src/keep.ts", file_type: "code" },
        ],
        links: [
          { source: "old", target: "keep", relation: "uses", confidence: "EXTRACTED", source_file: "src/old.ts" },
        ],
      }, null, 2),
      "utf-8",
    );

    const graph = buildMerge([], { graphPath, pruneSources: ["src\\old.ts"] });

    expect(graph.hasNode("old")).toBe(false);
    expect(graph.hasNode("keep")).toBe(true);
    expect(graph.order).toBe(1);
    expect(graph.size).toBe(0);
  });

  it("prunes deleted sources when pruneSources holds absolute manifest paths (F-0819-P2 / #1007)", () => {
    // The manifest stores absolute paths (e.g. /home/user/corpus/module_b/utils.ts)
    // while graph nodes store repo-relative paths (module_b/utils.ts). With a
    // `root` in scope, an absolute prune entry must still match the relative
    // node source_file, otherwise stale nodes persist after file deletion.
    const dir = tempDir();
    const root = join(dir, "corpus");
    const graphPath = join(dir, "graph.json");
    writeFileSync(
      graphPath,
      JSON.stringify({
        directed: false,
        graph: {},
        nodes: [
          { id: "login", label: "login", source_file: "module_a/auth.ts", file_type: "code" },
          { id: "fmt", label: "format_date", source_file: "module_b/utils.ts", file_type: "code" },
        ],
        links: [],
      }, null, 2),
      "utf-8",
    );

    const deletedAbs = [join(root, "module_b", "utils.ts")];
    const graph = buildMerge([], { graphPath, pruneSources: deletedAbs, root });

    expect(graph.hasNode("fmt")).toBe(false);
    expect(graph.hasNode("login")).toBe(true);
    expect(graph.order).toBe(1);
  });

  it("deduplicates chunk-suffixed labels during explicit merge flows", () => {
    const dir = tempDir();
    const graphPath = join(dir, "graph.json");
    const graph = buildMerge([
      {
        nodes: [
          { id: "auth_session_c1", label: "Auth Session", source_file: "docs/chunk-a.md", file_type: "document" },
          { id: "auth_session", label: "Auth Session", source_file: "docs/chunk-b.md", file_type: "document" },
        ],
        edges: [
          { source: "auth_session_c1", target: "auth_session", relation: "relates_to", confidence: "INFERRED", source_file: "docs/chunk-a.md" },
        ],
        input_tokens: 0,
        output_tokens: 0,
      },
    ], { graphPath });

    expect(graph.hasNode("auth_session")).toBe(true);
    expect(graph.hasNode("auth_session_c1")).toBe(false);
    expect(graph.size).toBe(0);
  });

  it("does not merge short SKU-like labels within one source", () => {
    const dir = tempDir();
    const graphPath = join(dir, "graph.json");
    const graph = buildMerge([
      {
        nodes: [
          { id: "sku_ab_small", label: "AB", source_file: "inventory/products.csv", file_type: "document" },
          { id: "sku_ab_large", label: "AB", source_file: "inventory/products.csv", file_type: "document" },
        ],
        edges: [
          { source: "sku_ab_small", target: "sku_ab_large", relation: "variant_of", confidence: "EXTRACTED", source_file: "inventory/products.csv" },
        ],
        input_tokens: 0,
        output_tokens: 0,
      },
    ], { graphPath });

    expect(graph.hasNode("sku_ab_small")).toBe(true);
    expect(graph.hasNode("sku_ab_large")).toBe(true);
    expect(graph.size).toBe(1);
  });

  it("deduplicates first pass labels within each source before global label collisions", () => {
    const dir = tempDir();
    const graphPath = join(dir, "graph.json");
    const graph = buildMerge([
      {
        nodes: [
          { id: "auth_from_docs", label: "Auth Session", source_file: "docs/auth.md", file_type: "document" },
          { id: "auth_session_c1", label: "Auth Session", source_file: "src/auth.ts", file_type: "code" },
          { id: "auth_session", label: "Auth Session", source_file: "src/auth.ts", file_type: "code" },
        ],
        edges: [
          { source: "auth_session_c1", target: "auth_from_docs", relation: "relates_to", confidence: "INFERRED", source_file: "src/auth.ts" },
        ],
        input_tokens: 0,
        output_tokens: 0,
      },
    ], { graphPath });

    expect(graph.hasNode("auth_from_docs")).toBe(true);
    expect(graph.hasNode("auth_session")).toBe(true);
    expect(graph.hasNode("auth_session_c1")).toBe(false);
    expect(graph.size).toBe(1);
    const edge = graph.edge("auth_session", "auth_from_docs");
    expect(edge).toBeDefined();
  });
});
