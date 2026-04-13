import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Graph from "graphology";
import { toWiki } from "../src/wiki.js";

describe("toWiki", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `graphify-test-wiki-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("generates index.md", () => {
    const G = new Graph({ type: "undirected" });
    G.mergeNode("a", { label: "ClassA", source_file: "a.py", community: 0 });
    const communities = new Map([[0, ["a"]]]);
    toWiki(G, communities, tmpDir);
    expect(existsSync(join(tmpDir, "index.md"))).toBe(true);
  });

  it("generates community articles", () => {
    const G = new Graph({ type: "undirected" });
    G.mergeNode("a", { label: "ClassA", source_file: "a.py", community: 0 });
    G.mergeNode("b", { label: "ClassB", source_file: "b.py", community: 0 });
    G.mergeEdge("a", "b", { relation: "calls", confidence: "EXTRACTED" });
    const communities = new Map([[0, ["a", "b"]]]);
    const labels = new Map([[0, "Core Module"]]);

    const count = toWiki(G, communities, tmpDir, { communityLabels: labels });
    expect(count).toBe(1); // 1 community article
    expect(existsSync(join(tmpDir, "Core_Module.md"))).toBe(true);
  });

  it("generates god node articles", () => {
    const G = new Graph({ type: "undirected" });
    G.mergeNode("a", { label: "ClassA", source_file: "a.py", community: 0 });
    G.mergeNode("b", { label: "ClassB", source_file: "b.py", community: 0 });
    G.mergeEdge("a", "b", { relation: "calls", confidence: "EXTRACTED" });
    const communities = new Map([[0, ["a", "b"]]]);

    toWiki(G, communities, tmpDir, {
      godNodesData: [{ id: "a", label: "ClassA", edges: 1 }],
    });
    expect(existsSync(join(tmpDir, "ClassA.md"))).toBe(true);
  });

  it("index contains community links", () => {
    const G = new Graph({ type: "undirected" });
    G.mergeNode("a", { label: "A", source_file: "a.py" });
    const communities = new Map([[0, ["a"]]]);
    const labels = new Map([[0, "AuthModule"]]);
    toWiki(G, communities, tmpDir, { communityLabels: labels });
    const index = readFileSync(join(tmpDir, "index.md"), "utf-8");
    expect(index).toContain("[[AuthModule]]");
  });

  it("normalizes CRLF labels when writing filenames", () => {
    const G = new Graph({ type: "undirected" });
    G.mergeNode("a", { label: "ClassA", source_file: "a.py", community: 0 });
    const communities = new Map([[0, ["a"]]]);
    const labels = new Map([[0, "Core\r\nModule"]]);

    toWiki(G, communities, tmpDir, { communityLabels: labels });

    expect(existsSync(join(tmpDir, "Core_Module.md"))).toBe(true);
  });
});
