import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import Graph from "graphology";
import { toCypher, toJson } from "../src/export.js";

const cleanupDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-export-json-"));
  cleanupDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (cleanupDirs.length > 0) {
    rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
  }
});

describe("toJson shrink guard", () => {
  it("refuses to overwrite an existing larger graph unless forced", () => {
    const dir = tempDir();
    const graphPath = join(dir, "graph.json");
    writeFileSync(
      graphPath,
      JSON.stringify({
        directed: false,
        graph: {},
        nodes: [
          { id: "alpha", label: "Alpha", source_file: "src/a.ts", file_type: "code" },
          { id: "beta", label: "Beta", source_file: "src/b.ts", file_type: "code" },
        ],
        links: [],
      }, null, 2),
      "utf-8",
    );

    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => { warnings.push(args.join(" ")); };
    try {
      const graph = new Graph();
      graph.addNode("alpha", { label: "Alpha", source_file: "src/a.ts", file_type: "code" });
      const written = toJson(graph, new Map([[0, ["alpha"]]]), graphPath);
      expect(written).toBe(false);
    } finally {
      console.warn = originalWarn;
    }

    const persisted = JSON.parse(readFileSync(graphPath, "utf-8")) as { nodes: Array<{ id: string }> };
    expect(persisted.nodes).toHaveLength(2);
    expect(warnings.join("\n")).toContain("Refusing to overwrite");
  });

  it("overwrites when force=true is supplied", () => {
    const dir = tempDir();
    const graphPath = join(dir, "graph.json");
    writeFileSync(
      graphPath,
      JSON.stringify({
        directed: false,
        graph: {},
        nodes: [
          { id: "alpha", label: "Alpha", source_file: "src/a.ts", file_type: "code" },
          { id: "beta", label: "Beta", source_file: "src/b.ts", file_type: "code" },
        ],
        links: [],
      }, null, 2),
      "utf-8",
    );

    const graph = new Graph();
    graph.addNode("alpha", { label: "Alpha", source_file: "src/a.ts", file_type: "code" });
    const written = toJson(graph, new Map([[0, ["alpha"]]]), graphPath, { force: true });

    expect(written).toBe(true);
    const persisted = JSON.parse(readFileSync(graphPath, "utf-8")) as { nodes: Array<{ id: string }> };
    expect(persisted.nodes).toHaveLength(1);
    expect(persisted.nodes[0]?.id).toBe("alpha");
  });
});

describe("toCypher", () => {
  it("escapes control characters in string literals and allowlists identifiers", () => {
    const dir = tempDir();
    const outputPath = join(dir, "cypher.txt");
    const graph = new Graph();
    graph.addNode("alpha'\nMATCH", {
      label: "Alpha'\nMATCH (n) DETACH DELETE n",
      file_type: "123 invalid",
    });
    graph.addNode("beta", { label: "Beta", file_type: "code" });
    graph.addEdge("alpha'\nMATCH", "beta", {
      relation: "123\nDELETE",
      confidence: "EXTRACTED\nCREATE",
    });

    toCypher(graph, outputPath);

    const cypher = readFileSync(outputPath, "utf-8");
    expect(cypher).toContain(":Entity");
    expect(cypher).toContain("[:RELATES_TO ");
    expect(cypher).toContain("Alpha\\'\\nMATCH");
    expect(cypher).toContain("EXTRACTED\\nCREATE");
    expect(cypher).not.toContain("Alpha'\nMATCH");
    expect(cypher).not.toContain("[:123");
  });
});
