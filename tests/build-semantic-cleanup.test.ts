/**
 * Regression tests for F-0816-M5.
 *
 * Stale-node pruning at the build/finalize step — the graph-level equivalent
 * of P4's wiki-level stale-page cleanup. When a source file has been deleted
 * between two builds (or its identity changes), the nodes/edges it produced
 * must be pruned from the rebuilt graph.json before serialization.
 *
 * Upstream reference: safishamsi/graphify commit `b6127aa` introduces
 * `semantic_cleanup.py`. Note: the *upstream* module is actually an
 * agent-JSON sanitiser (rationale-text filtering for skill-merge LLM
 * responses) and does not implement file-deletion stale-node pruning. The
 * TS port adopts the *name* `semantic-cleanup` and the *spirit* of the row
 * 11h bilan entry (`delete-stale nodes after rebuild`), but the actual
 * semantics implemented here are deliberately scoped to file-deletion
 * stale-node pruning — the graph-level pair of P4's wiki cleanup.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Graph from "graphology";
import { buildMerge } from "../src/build.js";
import { cleanupStaleNodes } from "../src/semantic-cleanup.js";

const cleanupDirs: string[] = [];

function tempDir(prefix: string = "graphify-semantic-cleanup-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cleanupDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (cleanupDirs.length > 0) {
    rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

describe("cleanupStaleNodes (F-0816-M5, build-time pair of wiki P4 stale-node filter)", () => {
  it("drops nodes whose source_file no longer exists on disk", () => {
    const root = tempDir("graphify-cleanup-root-");
    // a.ts still exists; b.ts has been deleted.
    writeFileSync(join(root, "a.ts"), "export const a = 1;\n", "utf-8");

    const G = new Graph({ type: "undirected" });
    G.mergeNode("a_sym", { label: "a", source_file: "a.ts", file_type: "code" });
    G.mergeNode("b_sym", { label: "b", source_file: "b.ts", file_type: "code" });

    const result = cleanupStaleNodes(G, { root });

    expect(G.hasNode("a_sym")).toBe(true);
    expect(G.hasNode("b_sym")).toBe(false);
    expect(result.droppedNodes).toContain("b_sym");
    expect(result.droppedNodes).not.toContain("a_sym");
  });

  it("also drops edges adjacent to a pruned node", () => {
    const root = tempDir("graphify-cleanup-root-");
    writeFileSync(join(root, "a.ts"), "export const a = 1;\n", "utf-8");

    const G = new Graph({ type: "undirected" });
    G.mergeNode("a_sym", { label: "a", source_file: "a.ts", file_type: "code" });
    G.mergeNode("b_sym", { label: "b", source_file: "b.ts", file_type: "code" });
    G.mergeNode("c_sym", { label: "c", source_file: "c.ts", file_type: "code" });
    // edges
    G.mergeEdge("a_sym", "b_sym", { relation: "uses", confidence: "EXTRACTED" });
    G.mergeEdge("a_sym", "c_sym", { relation: "uses", confidence: "EXTRACTED" });
    G.mergeEdge("b_sym", "c_sym", { relation: "uses", confidence: "EXTRACTED" });

    const result = cleanupStaleNodes(G, { root });

    expect(G.hasNode("a_sym")).toBe(true);
    expect(G.hasNode("b_sym")).toBe(false);
    expect(G.hasNode("c_sym")).toBe(false);
    // Only a_sym remains; no surviving edges (its peers are all gone).
    expect(G.size).toBe(0);
    expect(result.droppedNodes.sort()).toEqual(["b_sym", "c_sym"]);
    // 3 edges adjacent to dropped nodes — graphology drops them when the
    // node is dropped, but we still report the count.
    expect(result.droppedEdges).toBeGreaterThanOrEqual(2);
  });

  it("accepts a caller-supplied aliveSourceFiles set and skips fs probing", () => {
    const root = tempDir("graphify-cleanup-root-");
    // No files written. Liveness is decided entirely by the alive set.
    const G = new Graph({ type: "undirected" });
    G.mergeNode("keep", { label: "keep", source_file: "src/keep.ts", file_type: "code" });
    G.mergeNode("drop", { label: "drop", source_file: "src/gone.ts", file_type: "code" });

    const result = cleanupStaleNodes(G, {
      root,
      aliveSourceFiles: new Set(["src/keep.ts"]),
    });

    expect(G.hasNode("keep")).toBe(true);
    expect(G.hasNode("drop")).toBe(false);
    expect(result.droppedNodes).toEqual(["drop"]);
  });

  it("normalises Windows-style source paths before checking liveness", () => {
    const root = tempDir("graphify-cleanup-root-");
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "keep.ts"), "export {};\n", "utf-8");

    const G = new Graph({ type: "undirected" });
    // Windows-style backslashes in stored source_file.
    G.mergeNode("keep", { label: "keep", source_file: "src\\keep.ts", file_type: "code" });
    G.mergeNode("drop", { label: "drop", source_file: "src\\gone.ts", file_type: "code" });

    cleanupStaleNodes(G, { root });

    expect(G.hasNode("keep")).toBe(true);
    expect(G.hasNode("drop")).toBe(false);
  });

  it("leaves nodes with empty/missing source_file alone (untracked entities)", () => {
    const root = tempDir("graphify-cleanup-root-");
    const G = new Graph({ type: "undirected" });
    G.mergeNode("untracked", { label: "Untracked", file_type: "concept" });
    G.mergeNode("empty", { label: "empty", source_file: "", file_type: "concept" });

    const result = cleanupStaleNodes(G, { root });

    expect(G.hasNode("untracked")).toBe(true);
    expect(G.hasNode("empty")).toBe(true);
    expect(result.droppedNodes).toEqual([]);
  });

  it("emits a single log line with the dropped-node count when nodes were pruned", () => {
    const root = tempDir("graphify-cleanup-root-");
    const G = new Graph({ type: "undirected" });
    G.mergeNode("a", { label: "a", source_file: "a.ts", file_type: "code" });
    G.mergeNode("b", { label: "b", source_file: "b.ts", file_type: "code" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    cleanupStaleNodes(G, { root });

    expect(warn).toHaveBeenCalled();
    const formatted = warn.mock.calls.map((args) => args.join(" ")).join("\n");
    // F-0816-M5 marker so it shows up in CI logs.
    expect(formatted).toMatch(/stale/i);
    expect(formatted).toContain("2");
  });

  it("is silent when no nodes are stale", () => {
    const root = tempDir("graphify-cleanup-root-");
    writeFileSync(join(root, "a.ts"), "// alive\n", "utf-8");
    writeFileSync(join(root, "b.ts"), "// alive\n", "utf-8");

    const G = new Graph({ type: "undirected" });
    G.mergeNode("a", { label: "a", source_file: "a.ts", file_type: "code" });
    G.mergeNode("b", { label: "b", source_file: "b.ts", file_type: "code" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = cleanupStaleNodes(G, { root });

    expect(result.droppedNodes).toEqual([]);
    const stale = warn.mock.calls.filter((args) => /stale/i.test(args.join(" ")));
    expect(stale).toHaveLength(0);
  });
});

describe("buildMerge auto-prunes missing-source nodes (F-0816-M5)", () => {
  it("prunes nodes whose source_file no longer exists when pruneMissingSources: { root }", () => {
    const dir = tempDir();
    const graphPath = join(dir, "graph.json");
    // a.ts stays alive on disk; old.ts is the deleted file.
    writeFileSync(join(dir, "a.ts"), "// alive\n", "utf-8");
    writeFileSync(
      graphPath,
      JSON.stringify({
        directed: false,
        graph: {},
        nodes: [
          { id: "alive", label: "Alive", source_file: "a.ts", file_type: "code" },
          { id: "ghost", label: "Ghost", source_file: "old.ts", file_type: "code" },
        ],
        links: [
          { source: "alive", target: "ghost", relation: "uses", confidence: "EXTRACTED", source_file: "old.ts" },
        ],
      }, null, 2),
      "utf-8",
    );

    const graph = buildMerge([], { graphPath, pruneMissingSources: { root: dir } });

    expect(graph.hasNode("alive")).toBe(true);
    expect(graph.hasNode("ghost")).toBe(false);
    // Edge adjacent to ghost is gone with the node.
    expect(graph.size).toBe(0);
  });

  it("auto-prune satisfies the shrink-guard (no need for explicit pruneSources)", () => {
    const dir = tempDir();
    const graphPath = join(dir, "graph.json");
    // Only b.ts exists; a.ts was deleted.
    writeFileSync(join(dir, "b.ts"), "// alive\n", "utf-8");
    writeFileSync(
      graphPath,
      JSON.stringify({
        directed: false,
        graph: {},
        nodes: [
          { id: "n_a", label: "A", source_file: "a.ts", file_type: "code" },
          { id: "n_b", label: "B", source_file: "b.ts", file_type: "code" },
        ],
        links: [],
      }, null, 2),
      "utf-8",
    );

    expect(() =>
      buildMerge([], { graphPath, pruneMissingSources: { root: dir } }),
    ).not.toThrow();
  });

  it("respects an explicit aliveSourceFiles set passed to buildMerge", () => {
    const dir = tempDir();
    const graphPath = join(dir, "graph.json");
    // No files on disk — liveness is decided exclusively by the explicit set.
    writeFileSync(
      graphPath,
      JSON.stringify({
        directed: false,
        graph: {},
        nodes: [
          { id: "k", label: "K", source_file: "src/k.ts", file_type: "code" },
          { id: "g", label: "G", source_file: "src/gone.ts", file_type: "code" },
        ],
        links: [],
      }, null, 2),
      "utf-8",
    );

    const graph = buildMerge([], {
      graphPath,
      pruneMissingSources: { root: dir, aliveSourceFiles: new Set(["src/k.ts"]) },
    });

    expect(graph.hasNode("k")).toBe(true);
    expect(graph.hasNode("g")).toBe(false);
  });
});
