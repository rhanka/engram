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
});
