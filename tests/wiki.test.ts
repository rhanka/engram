import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, readFileSync, readdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Graph from "graphology";
import { toWiki } from "../src/wiki.js";
import type { ReviewFlowArtifact } from "../src/flows.js";

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

  it("adds community flow sections and generated flow pages when flows are provided", () => {
    const G = new Graph({ type: "directed" });
    G.mergeNode("route", { label: "handler", source_file: "routes.ts", community: 0 });
    G.mergeNode("auth", { label: "verifyAuthToken", source_file: "auth.ts", community: 1 });
    G.mergeDirectedEdge("route", "auth", { relation: "calls", confidence: "EXTRACTED" });
    const communities = new Map([
      [0, ["route"]],
      [1, ["auth"]],
    ]);
    const labels = new Map([
      [0, "API"],
      [1, "Auth"],
    ]);
    const flows: ReviewFlowArtifact = {
      version: 1,
      generatedAt: "2026-04-22T00:00:00.000Z",
      graphPath: ".graphify/graph.json",
      maxDepth: 15,
      includeTests: false,
      warnings: [],
      flows: [
        {
          id: "flow:handler",
          name: "handler",
          entryPoint: "routes.ts::handler",
          entryPointId: "route",
          path: ["route", "auth"],
          qualifiedPath: ["routes.ts::handler", "auth.ts::verifyAuthToken"],
          depth: 1,
          nodeCount: 2,
          fileCount: 2,
          files: ["auth.ts", "routes.ts"],
          criticality: 0.82,
          warnings: [],
        },
      ],
    };

    const count = toWiki(G, communities, tmpDir, { communityLabels: labels, flows });

    expect(count).toBe(3);
    expect(readFileSync(join(tmpDir, "API.md"), "utf-8")).toContain("## Execution Flows");
    expect(readFileSync(join(tmpDir, "API.md"), "utf-8")).toContain("[[Flow handler]]");
    expect(readFileSync(join(tmpDir, "Flow_handler.md"), "utf-8")).toContain("routes.ts::handler");
    expect(readFileSync(join(tmpDir, "index.md"), "utf-8")).toContain("## Execution Flows");
  });

  it("uses suffixed filenames and alias links for duplicate normalized wiki titles", () => {
    const G = new Graph({ type: "undirected" });
    G.mergeNode("a", { label: "ClassA", source_file: "a.py", community: 0 });
    G.mergeNode("b", { label: "ClassB", source_file: "b.py", community: 1 });
    const communities = new Map([
      [0, ["a"]],
      [1, ["b"]],
    ]);
    const labels = new Map([
      [0, "Core"],
      [1, "Core"],
    ]);

    toWiki(G, communities, tmpDir, { communityLabels: labels });

    expect(existsSync(join(tmpDir, "Core.md"))).toBe(true);
    expect(existsSync(join(tmpDir, "Core_2.md"))).toBe(true);
    const index = readFileSync(join(tmpDir, "index.md"), "utf-8");
    expect(index).toContain("[[Core]]");
    expect(index).toContain("[[Core_2|Core]]");
  });

  it("clears stale wiki articles before regenerating", () => {
    const G = new Graph({ type: "undirected" });
    G.mergeNode("a", { label: "ClassA", source_file: "a.py", community: 0 });
    let communities = new Map([[0, ["a"]]]);
    let labels = new Map([[0, "Legacy Community"]]);

    toWiki(G, communities, tmpDir, { communityLabels: labels });
    expect(existsSync(join(tmpDir, "Legacy_Community.md"))).toBe(true);

    communities = new Map([[1, ["a"]]]);
    labels = new Map([[1, "Fresh Community"]]);
    toWiki(G, communities, tmpDir, { communityLabels: labels });

    expect(existsSync(join(tmpDir, "Fresh_Community.md"))).toBe(true);
    expect(existsSync(join(tmpDir, "Legacy_Community.md"))).toBe(false);
  });

  it("strips Windows-reserved characters and caps wiki filenames", () => {
    const G = new Graph({ type: "undirected" });
    G.mergeNode("a", { label: "ClassA", source_file: "a.py", community: 0 });
    const communities = new Map([[0, ["a"]]]);
    const labels = new Map([
      [0, `Core<>:\"/\\\\|?* ${"VeryLongName".repeat(30)}`],
    ]);

    toWiki(G, communities, tmpDir, { communityLabels: labels });

    const files = readdirSync(tmpDir).filter((entry) => entry.endsWith(".md") && entry !== "index.md");
    expect(files).toHaveLength(1);
    const [filename] = files;
    expect(filename).not.toMatch(/[<>:"/\\|?*]/);
    expect(filename!.length).toBeLessThanOrEqual(203);
  });
});
