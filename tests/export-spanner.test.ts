import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import Graph from "graphology";
import { toSpanner } from "../src/export.js";

const cleanupDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-export-spanner-"));
  cleanupDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (cleanupDirs.length > 0) {
    rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGraph(): Graph {
  const G = new Graph();
  G.addNode("node-1", { label: "Alpha", node_type: "Module", community: 0 });
  G.addNode("node-2", { label: "Beta",  node_type: "Class",  community: 1 });
  G.addEdge("node-1", "node-2", { relation: "IMPORTS", confidence: "EXTRACTED" });
  return G;
}

// ---------------------------------------------------------------------------
// DDL structure
// ---------------------------------------------------------------------------

describe("toSpanner DDL", () => {
  it("produces a .ddl.sql file", () => {
    const dir = tempDir();
    toSpanner(makeGraph(), dir);
    expect(existsSync(join(dir, "spanner.ddl.sql"))).toBe(true);
  });

  it("DDL contains CREATE TABLE graphify_nodes with expected columns", () => {
    const dir = tempDir();
    toSpanner(makeGraph(), dir);
    const ddl = readFileSync(join(dir, "spanner.ddl.sql"), "utf-8");
    expect(ddl).toContain("CREATE TABLE graphify_nodes");
    expect(ddl).toContain("id STRING(MAX) NOT NULL");
    expect(ddl).toContain("label STRING(MAX)");
    expect(ddl).toContain("node_type STRING(MAX)");
    expect(ddl).toContain("community INT64");
    expect(ddl).toContain("props JSON");
    expect(ddl).toContain("PRIMARY KEY (id)");
  });

  it("DDL contains CREATE TABLE graphify_edges with expected columns", () => {
    const dir = tempDir();
    toSpanner(makeGraph(), dir);
    const ddl = readFileSync(join(dir, "spanner.ddl.sql"), "utf-8");
    expect(ddl).toContain("CREATE TABLE graphify_edges");
    expect(ddl).toContain("source_id STRING(MAX) NOT NULL");
    expect(ddl).toContain("target_id STRING(MAX) NOT NULL");
    expect(ddl).toContain("relation STRING(MAX)");
    expect(ddl).toContain("confidence STRING(MAX)");
    expect(ddl).toContain("PRIMARY KEY (source_id, target_id, relation)");
  });

  it("DDL contains CREATE PROPERTY GRAPH statement", () => {
    const dir = tempDir();
    toSpanner(makeGraph(), dir);
    const ddl = readFileSync(join(dir, "spanner.ddl.sql"), "utf-8");
    expect(ddl).toContain("CREATE PROPERTY GRAPH graphify");
    expect(ddl).toContain("NODE TABLES");
    expect(ddl).toContain("EDGE TABLES");
    expect(ddl).toContain("graphify_nodes");
    expect(ddl).toContain("graphify_edges");
    expect(ddl).toContain("SOURCE KEY");
    expect(ddl).toContain("DESTINATION KEY");
  });
});

// ---------------------------------------------------------------------------
// DML structure
// ---------------------------------------------------------------------------

describe("toSpanner DML", () => {
  it("produces a .dml.sql file", () => {
    const dir = tempDir();
    toSpanner(makeGraph(), dir);
    expect(existsSync(join(dir, "spanner.dml.sql"))).toBe(true);
  });

  it("DML inserts the correct number of node rows", () => {
    const dir = tempDir();
    const G = makeGraph();
    toSpanner(G, dir);
    const dml = readFileSync(join(dir, "spanner.dml.sql"), "utf-8");
    // Each node generates one INSERT OR UPDATE INTO graphify_nodes line
    const nodeInserts = dml
      .split("\n")
      .filter((l) => l.includes("INSERT OR UPDATE INTO graphify_nodes"));
    expect(nodeInserts).toHaveLength(G.order);
  });

  it("DML inserts the correct number of edge rows", () => {
    const dir = tempDir();
    const G = makeGraph();
    toSpanner(G, dir);
    const dml = readFileSync(join(dir, "spanner.dml.sql"), "utf-8");
    const edgeInserts = dml
      .split("\n")
      .filter((l) => l.includes("INSERT OR UPDATE INTO graphify_edges"));
    expect(edgeInserts).toHaveLength(G.size);
  });

  it("DML props column contains valid JSON (round-trip)", () => {
    const dir = tempDir();
    const G = new Graph();
    G.addNode("n1", { label: "Alpha", node_type: "Module", community: 0, extra_prop: "value with 'quotes'" });
    toSpanner(G, dir);
    const dml = readFileSync(join(dir, "spanner.dml.sql"), "utf-8");
    // Find the props value in the INSERT line — it's a JSON string between single-quoted delimiters
    // Extract JSON content using a regex
    const match = dml.match(/JSON '(\{.*?\})'/);
    expect(match).toBeTruthy();
    // Unescape the SQL-escaped single quotes (\' -> ') to get valid JSON
    const jsonStr = match![1]!.replace(/\\'/g, "'");
    expect(() => JSON.parse(jsonStr)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Escaping / injection safety
// ---------------------------------------------------------------------------

describe("toSpanner string escaping", () => {
  it("escapes single quotes in node id and label", () => {
    const dir = tempDir();
    const G = new Graph();
    G.addNode("O'Reilly-node", { label: "O'Reilly" });
    toSpanner(G, dir);
    const dml = readFileSync(join(dir, "spanner.dml.sql"), "utf-8");
    // Raw unescaped ' must not appear inside a string literal context
    expect(dml).not.toContain("'O'Reilly'"); // would be ambiguous SQL
    expect(dml).toContain("\\'");
  });

  it("escapes backslash in node label", () => {
    const dir = tempDir();
    const G = new Graph();
    G.addNode("bs-node", { label: "back\\slash" });
    toSpanner(G, dir);
    const dml = readFileSync(join(dir, "spanner.dml.sql"), "utf-8");
    expect(dml).toContain("back\\\\slash");
  });

  it("escapes newline in node label", () => {
    const dir = tempDir();
    const G = new Graph();
    G.addNode("nl-node", { label: "line1\nline2" });
    toSpanner(G, dir);
    const dml = readFileSync(join(dir, "spanner.dml.sql"), "utf-8");
    expect(dml).not.toContain("line1\nline2");
    expect(dml).toContain("\\n");
  });

  it("produces valid JSON for props with special chars", () => {
    const dir = tempDir();
    const G = new Graph();
    G.addNode("xss-node", {
      label: "<script>alert(1)</script>",
      node_type: "Module",
      community: 0,
      custom: "val\"with\"quotes",
    });
    toSpanner(G, dir);
    const dml = readFileSync(join(dir, "spanner.dml.sql"), "utf-8");
    // Locate the JSON '...' portion for the node insert
    const jsonMatch = dml.match(/JSON '(\{.*?\})'/s);
    expect(jsonMatch).toBeTruthy();
    const jsonStr = jsonMatch![1]!.replace(/\\'/g, "'");
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    expect(parsed).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Default output directory
// ---------------------------------------------------------------------------

describe("toSpanner output path", () => {
  it("writes both files to the given directory", () => {
    const dir = tempDir();
    toSpanner(makeGraph(), dir);
    expect(existsSync(join(dir, "spanner.ddl.sql"))).toBe(true);
    expect(existsSync(join(dir, "spanner.dml.sql"))).toBe(true);
  });

  it("creates the output directory if it does not exist", () => {
    const dir = tempDir();
    const subDir = join(dir, "spanner-sub");
    toSpanner(makeGraph(), subDir);
    expect(existsSync(join(subDir, "spanner.ddl.sql"))).toBe(true);
    expect(existsSync(join(subDir, "spanner.dml.sql"))).toBe(true);
  });
});
