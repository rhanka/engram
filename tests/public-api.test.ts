import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Graph from "graphology";

import * as api from "../src/index.js";

const cleanupDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-public-api-"));
  cleanupDirs.push(dir);
  return dir;
}

function makeGraph(): Graph {
  const G = new Graph({ type: "undirected" });
  G.addNode("alpha", {
    label: "AlphaService",
    source_file: "src/alpha.ts",
    file_type: "code",
  });
  G.addNode("beta", {
    label: "BetaRepository",
    source_file: "src/beta.ts",
    file_type: "code",
  });
  G.addUndirectedEdge("alpha", "beta", {
    relation: "uses",
    confidence: "EXTRACTED",
  });
  return G;
}

const detection = {
  files: { code: ["src/alpha.ts", "src/beta.ts"], document: [], paper: [], image: [], video: [] },
  total_files: 2,
  total_words: 1200,
  needs_graph: true,
  warning: null,
  skipped_sensitive: [],
  graphifyignore_patterns: 0,
};

afterEach(() => {
  while (cleanupDirs.length > 0) {
    rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
  }
});

describe("public API compatibility", () => {
  it("exports the documented runtime helpers", () => {
    expect(typeof api.discoverProjectConfig).toBe("function");
    expect(typeof api.loadProjectConfig).toBe("function");
    expect(typeof api.parseProjectConfig).toBe("function");
    expect(typeof api.normalizeProjectConfig).toBe("function");
    expect(typeof api.validateProjectConfig).toBe("function");
    expect(typeof api.runBenchmark).toBe("function");
    expect(typeof api.printBenchmark).toBe("function");
    expect(typeof api.ingest).toBe("function");
    expect(typeof api.saveQueryResult).toBe("function");
    expect(typeof api.saveManifest).toBe("function");
    expect(typeof api.serve).toBe("function");
    expect(typeof api.watch).toBe("function");
    expect(typeof api.rebuildCode).toBe("function");
    expect(typeof api.pushToNeo4j).toBe("function");
    expect(typeof api.augmentDetectionWithTranscripts).toBe("function");
    expect(typeof api.buildFirstHopSummary).toBe("function");
    expect(typeof api.firstHopSummaryToText).toBe("function");
    expect(typeof api.buildReviewDelta).toBe("function");
    expect(typeof api.reviewDeltaToText).toBe("function");
    expect(typeof api.buildReviewAnalysis).toBe("function");
    expect(typeof api.reviewAnalysisToText).toBe("function");
    expect(typeof api.evaluateReviewAnalysis).toBe("function");
    expect(typeof api.reviewEvaluationToText).toBe("function");
    expect(typeof api.evaluateReviewBenchmarks).toBe("function");
    expect(typeof api.reviewBenchmarkToMarkdown).toBe("function");
    expect(typeof api.buildCommitRecommendation).toBe("function");
    expect(typeof api.commitRecommendationToText).toBe("function");
    expect(typeof api.planGraphifyOutMigration).toBe("function");
    expect(typeof api.migrateGraphifyOut).toBe("function");
    expect(typeof api.migrationResultToText).toBe("function");
    expect(typeof api.validateProfileExtraction).toBe("function");
    expect(typeof api.profileValidationResultToMarkdown).toBe("function");
    expect(typeof api.profileValidationResultToJson).toBe("function");
    expect(typeof api.buildProfileExtractionPrompt).toBe("function");
    expect(typeof api.buildProfileChunkPrompt).toBe("function");
    expect(typeof api.buildProfileValidationPrompt).toBe("function");
    expect(typeof api.buildProfileReport).toBe("function");
    expect(typeof api.assertAcceptedImageRoutingRules).toBe("function");
    expect(typeof api.writeImageRoutingCalibrationSamples).toBe("function");
    expect(typeof api.imageRoutingSampleFromCaption).toBe("function");
    expect(typeof api.compileOntologyOutputs).toBe("function");
    expect(typeof api.generateOntologyReconciliationCandidates).toBe("function");
    expect(typeof api.queryOntologyReconciliationCandidates).toBe("function");
    expect(typeof api.loadOntologyReconciliationDecisionLog).toBe("function");
    expect(typeof api.collectWikiDescriptionTargets).toBe("function");
    expect(typeof api.generateWikiDescriptionSidecars).toBe("function");
    expect(typeof api.cloneRepo).toBe("function");
    expect(typeof api.defaultCloneDestination).toBe("function");
    expect(typeof api.mergeGraphsFromFiles).toBe("function");
    expect(typeof api.serializeGraph).toBe("function");
  });

  it("accepts object-style map inputs and option objects", () => {
    const dir = makeTempDir();
    const G = makeGraph();
    const communities = { 0: ["alpha", "beta"] };
    const cohesion = { 0: 1 };
    const labels = { 0: "Core Services" };

    const gods = api.godNodes(G);
    const surprises = api.surprisingConnections(G, communities);
    const questions = api.suggestQuestions(G, communities, labels);
    const report = api.generateReport(
      G,
      communities,
      cohesion,
      labels,
      gods,
      surprises,
      detection,
      { input: 0, output: 0 },
      ".",
      { suggestedQuestions: questions },
    );

    api.toJson(G, communities, join(dir, "graph.json"), { communityLabels: labels });
    api.toHtml(G, communities, join(dir, "graph.html"), { communityLabels: labels });
    api.toSvg(G, communities, join(dir, "graph.svg"), { communityLabels: labels });
    api.toCanvas(G, communities, join(dir, "graph.canvas"), { communityLabels: labels });
    const wikiCount = api.toWiki(G, communities, join(dir, "wiki"), {
      communityLabels: labels,
      cohesion,
      godNodesData: gods,
    });

    expect(report).toContain("## Summary");
    expect(existsSync(join(dir, "graph.json"))).toBe(true);
    expect(existsSync(join(dir, "graph.html"))).toBe(true);
    expect(existsSync(join(dir, "graph.svg"))).toBe(true);
    expect(existsSync(join(dir, "graph.canvas"))).toBe(true);
    expect(existsSync(join(dir, "wiki", "index.md"))).toBe(true);
    expect(wikiCount).toBeGreaterThan(0);

    const graphJson = JSON.parse(readFileSync(join(dir, "graph.json"), "utf-8")) as {
      graph?: { community_labels?: Record<string, string> };
      nodes: Array<{ id: string; community_name?: string }>;
    };
    expect(graphJson.graph?.community_labels).toMatchObject({ 0: "Core Services" });
    expect(graphJson.nodes.find((node) => node.id === "alpha")?.community_name).toBe("Core Services");

    const graphHtml = readFileSync(join(dir, "graph.html"), "utf-8");
    expect(graphHtml).toContain("normalizeSearch");
    expect(graphHtml).toContain("canvas.clientWidth");
  });

  it("supports the object form for saveQueryResult and runBenchmark", () => {
    const dir = makeTempDir();
    const G = makeGraph();
    const graphPath = join(dir, "graph.json");
    api.toJson(G, { 0: ["alpha", "beta"] }, graphPath);

    const saved = api.saveQueryResult({
      question: "How does AlphaService talk to BetaRepository?",
      answer: "AlphaService uses BetaRepository directly.",
      memoryDir: dir,
      sourceNodes: ["alpha", "beta"],
    });
    const benchmark = api.runBenchmark(graphPath, { corpusWords: 1200 });

    expect(readFileSync(saved, "utf-8")).toContain("How does AlphaService talk to BetaRepository?");
    expect(benchmark.error).toBeUndefined();
    expect(benchmark.corpus_words).toBe(1200);
  });

  it("serializes directed graphs with the directed flag and community labels", () => {
    const dir = makeTempDir();
    const G = new Graph({ type: "directed" });
    G.addNode("alpha", {
      label: "AlphaService",
      source_file: "src/alpha.ts",
      file_type: "code",
    });
    G.addNode("beta", {
      label: "BetaRepository",
      source_file: "src/beta.ts",
      file_type: "code",
    });
    G.addDirectedEdge("alpha", "beta", {
      relation: "uses",
      confidence: "EXTRACTED",
    });

    api.toJson(G, { 0: ["alpha", "beta"] }, join(dir, "graph.json"), {
      communityLabels: { 0: "Core Services" },
    });

    const graphJson = JSON.parse(readFileSync(join(dir, "graph.json"), "utf-8")) as {
      directed?: boolean;
      graph?: { community_labels?: Record<string, string> };
      nodes: Array<{ id: string; community_name?: string }>;
      links: Array<{ source: string; target: string }>;
    };

    expect(graphJson.directed).toBe(true);
    expect(graphJson.graph?.community_labels).toMatchObject({ 0: "Core Services" });
    expect(graphJson.links).toContainEqual(expect.objectContaining({ source: "alpha", target: "beta" }));
  });

  it("normalizes CRLF labels when generating canvas filenames", () => {
    const dir = makeTempDir();
    const G = new Graph({ type: "undirected" });
    G.addNode("alpha", {
      label: "Alpha\r\nService",
      source_file: "src/alpha.ts",
      file_type: "code",
    });

    api.toCanvas(G, { 0: ["alpha"] }, join(dir, "graph.canvas"));

    const canvas = JSON.parse(readFileSync(join(dir, "graph.canvas"), "utf-8")) as {
      nodes: Array<{ file?: string }>;
    };
    expect(canvas.nodes.some((node) => node.file === "graphify/obsidian/Alpha Service.md")).toBe(true);
  });
});
