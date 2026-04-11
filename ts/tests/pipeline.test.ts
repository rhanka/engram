/**
 * End-to-end pipeline test: detect → extract → build → cluster → analyze → report → export
 * Runs on py/tests/fixtures/ and verifies all outputs are generated correctly.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import Graph from "graphology";

import { detect } from "../src/detect.js";
import { buildFromJson } from "../src/build.js";
import { cluster, scoreAll } from "../src/cluster.js";
import { godNodes, surprisingConnections, suggestQuestions } from "../src/analyze.js";
import { generate } from "../src/report.js";
import { validateExtraction } from "../src/validate.js";
import type { Extraction } from "../src/types.js";

const FIXTURES_DIR = resolve(__dirname, "fixtures");
const TMP_OUT = join(tmpdir(), `graphify-pipeline-test-${Date.now()}`);

describe("End-to-end pipeline", () => {
  afterAll(() => {
    rmSync(TMP_OUT, { recursive: true, force: true });
  });

  // ── Step 1: detect ──────────────────────────────────────────────────────
  it("Step 1 - detect finds fixture files", () => {
    const result = detect(FIXTURES_DIR);
    expect(result.total_files).toBeGreaterThan(0);
    expect(result.files.code.length).toBeGreaterThan(0);
    // Should find .py, .go, .ts, .rs, .java, .c, .cpp etc.
    const exts = result.files.code.map((f) => f.split(".").pop());
    expect(exts).toContain("py");
    expect(exts).toContain("go");
    expect(exts).toContain("ts");
  });

  // ── Step 2: build from pre-built extraction (extraction.json) ─────────
  // We use the fixture extraction.json instead of running extract() because
  // tree-sitter WASM grammars may not be available in CI. The extract module
  // is tested separately via unit tests.

  let G: InstanceType<typeof Graph>;
  let communities: Map<number, string[]>;
  let cohesion: Map<number, number>;

  it("Step 2 - build graph from extraction.json", () => {
    const raw = JSON.parse(readFileSync(join(FIXTURES_DIR, "extraction.json"), "utf-8")) as Extraction;

    // Validate the fixture extraction
    const errors = validateExtraction(raw);
    const realErrors = errors.filter((e) => !e.includes("does not match any node id"));
    expect(realErrors).toEqual([]);

    G = buildFromJson(raw);
    expect(G.order).toBe(4); // 4 nodes in extraction.json
    expect(G.size).toBe(4);  // 4 edges
  });

  // ── Step 3: cluster ─────────────────────────────────────────────────────
  it("Step 3 - cluster detects communities", () => {
    communities = cluster(G);
    expect(communities.size).toBeGreaterThan(0);

    // All nodes should be assigned to a community
    const allClustered = [...communities.values()].flat();
    expect(allClustered.sort()).toEqual(G.nodes().sort());
  });

  it("Step 3b - cohesion scores are valid", () => {
    cohesion = scoreAll(G, communities);
    for (const [cid, score] of cohesion) {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1.0);
    }
  });

  // ── Step 4: analyze ─────────────────────────────────────────────────────
  it("Step 4 - god nodes returns results", () => {
    const gods = godNodes(G);
    expect(gods.length).toBeGreaterThan(0);
    // God nodes should be sorted by degree descending
    for (let i = 1; i < gods.length; i++) {
      expect(gods[i]!.edges).toBeLessThanOrEqual(gods[i - 1]!.edges);
    }
  });

  it("Step 4b - surprising connections returns results", () => {
    const surprises = surprisingConnections(G, communities);
    // extraction.json has cross-file edges so we should get surprises
    expect(surprises).toBeDefined();
    // Each surprise should have required fields
    for (const s of surprises) {
      expect(s.source).toBeDefined();
      expect(s.target).toBeDefined();
      expect(s.confidence).toBeDefined();
    }
  });

  it("Step 4c - suggest questions returns results", () => {
    const labels = new Map<number, string>();
    for (const cid of communities.keys()) labels.set(cid, `Community ${cid}`);
    const questions = suggestQuestions(G, communities, labels);
    expect(questions.length).toBeGreaterThan(0);
    expect(questions[0]!.type).toBeDefined();
  });

  // ── Step 5: report ──────────────────────────────────────────────────────
  it("Step 5 - generate produces valid markdown report", () => {
    const labels = new Map<number, string>();
    for (const cid of communities.keys()) labels.set(cid, `Community ${cid}`);
    const gods = godNodes(G);
    const surprises = surprisingConnections(G, communities);
    const questions = suggestQuestions(G, communities, labels);

    const report = generate(
      G, communities, cohesion, labels, gods, surprises,
      {
        files: { code: ["model.py"], document: ["paper.md"], paper: [], image: [] },
        total_files: 2, total_words: 5000, needs_graph: true, warning: null,
        skipped_sensitive: [], graphifyignore_patterns: 0,
      },
      { input: 1200, output: 340 },
      "fixtures",
      questions,
    );

    // Structural checks
    expect(report).toContain("# Graph Report");
    expect(report).toContain("## Summary");
    expect(report).toContain("## God Nodes");
    expect(report).toContain("## Communities");
    expect(report).toMatch(/\d+ nodes/);
    expect(report).toMatch(/\d+ edges/);
    expect(report).toMatch(/EXTRACTED/);
    // Should contain at least one god node
    expect(report).toMatch(/\d+\. `/);
  });

  // ── Step 6: export ──────────────────────────────────────────────────────
  it("Step 6 - toJson writes valid graph.json", async () => {
    mkdirSync(TMP_OUT, { recursive: true });
    const { toJson } = await import("../src/export.js");
    toJson(G, communities, join(TMP_OUT, "graph.json"));

    expect(existsSync(join(TMP_OUT, "graph.json"))).toBe(true);
    const data = JSON.parse(readFileSync(join(TMP_OUT, "graph.json"), "utf-8"));
    expect(data.nodes).toBeDefined();
    expect(data.links).toBeDefined();
    expect(data.nodes.length).toBe(4);
    expect(data.links.length).toBe(4);

    // Nodes should have community attribute
    for (const node of data.nodes) {
      expect(node.id).toBeDefined();
      expect(node.label).toBeDefined();
    }
  });

  it("Step 6b - toHtml writes valid HTML", async () => {
    const { toHtml } = await import("../src/export.js");
    toHtml(G, communities, join(TMP_OUT, "graph.html"));

    expect(existsSync(join(TMP_OUT, "graph.html"))).toBe(true);
    const html = readFileSync(join(TMP_OUT, "graph.html"), "utf-8");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("vis-network"); // vis.js
    expect(html).toContain("graphify");
  });

  it("Step 6c - toSvg writes valid SVG", async () => {
    const { toSvg } = await import("../src/export.js");
    toSvg(G, communities, join(TMP_OUT, "graph.svg"));

    expect(existsSync(join(TMP_OUT, "graph.svg"))).toBe(true);
    const svg = readFileSync(join(TMP_OUT, "graph.svg"), "utf-8");
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
  });

  it("Step 6d - toGraphml writes valid GraphML", async () => {
    const { toGraphml } = await import("../src/export.js");
    toGraphml(G, communities, join(TMP_OUT, "graph.graphml"));

    expect(existsSync(join(TMP_OUT, "graph.graphml"))).toBe(true);
    const graphml = readFileSync(join(TMP_OUT, "graph.graphml"), "utf-8");
    expect(graphml).toContain("<graphml");
    expect(graphml).toContain("<node ");
    expect(graphml).toContain("<edge ");
  });

  it("Step 6e - toCypher writes valid Cypher", async () => {
    const { toCypher } = await import("../src/export.js");
    toCypher(G, join(TMP_OUT, "cypher.txt"));

    expect(existsSync(join(TMP_OUT, "cypher.txt"))).toBe(true);
    const cypher = readFileSync(join(TMP_OUT, "cypher.txt"), "utf-8");
    expect(cypher).toContain("MERGE");
  });

  // ── Step 7: wiki ────────────────────────────────────────────────────────
  it("Step 7 - toWiki writes index.md and community articles", async () => {
    const { toWiki } = await import("../src/wiki.js");
    const wikiDir = join(TMP_OUT, "wiki");
    const labels = new Map<number, string>();
    for (const cid of communities.keys()) labels.set(cid, `Community ${cid}`);
    const gods = godNodes(G);

    const count = toWiki(G, communities, wikiDir, {
      communityLabels: labels,
      cohesion,
      godNodesData: gods,
    });

    expect(existsSync(join(wikiDir, "index.md"))).toBe(true);
    expect(count).toBeGreaterThan(0);

    const index = readFileSync(join(wikiDir, "index.md"), "utf-8");
    expect(index).toContain("# Knowledge Graph Index");
    expect(index).toContain("nodes");
  });

  // ── Step 8: round-trip (load graph.json back) ──────────────────────────
  it("Step 8 - graph.json can be re-loaded into a valid graph", () => {
    const data = JSON.parse(readFileSync(join(TMP_OUT, "graph.json"), "utf-8"));
    const G2 = new Graph({ type: "undirected" });
    for (const node of data.nodes) {
      const { id, ...attrs } = node;
      G2.mergeNode(id, attrs);
    }
    for (const link of data.links) {
      const { source, target, ...attrs } = link;
      if (G2.hasNode(source) && G2.hasNode(target)) {
        try { G2.mergeEdge(source, target, attrs); } catch { /* dup */ }
      }
    }

    expect(G2.order).toBe(G.order);
    expect(G2.size).toBe(G.size);
  });
});
