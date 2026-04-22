import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import Graph from "graphology";

import { createReviewGraphStore } from "../src/review-store.js";
import { buildFlowArtifact } from "../src/flows.js";
import {
  evaluateReviewBenchmarks,
  reviewBenchmarkToMarkdown,
} from "../src/review-benchmark.js";

function qn(filePath: string, name: string): string {
  return `${filePath}::${name}`;
}

function addFunction(
  G: Graph,
  name: string,
  filePath: string,
  options: { start?: number; end?: number; community?: number } = {},
): string {
  const id = qn(filePath, name);
  G.addNode(id, {
    label: name,
    kind: "Function",
    qualified_name: id,
    source_file: filePath,
    line_start: options.start ?? 1,
    line_end: options.end ?? 10,
    community: options.community ?? 1,
  });
  return id;
}

function addCall(G: Graph, source: string, target: string): void {
  G.addDirectedEdge(source, target, {
    relation: "calls",
    confidence: "EXTRACTED",
  });
}

function makeBenchmarkStore() {
  const G = new Graph({ type: "directed" });
  const handler = addFunction(G, "handler", "routes.ts", { community: 1 });
  const service = addFunction(G, "verifyAuthToken", "services.ts", { start: 10, end: 20, community: 1 });
  const repo = addFunction(G, "readUser", "repo.ts", { community: 2 });
  const audit = addFunction(G, "auditLogin", "metrics.ts", { community: 3 });
  addCall(G, handler, service);
  addCall(G, service, repo);
  addCall(G, service, audit);
  const store = createReviewGraphStore(G);
  return {
    store,
    flows: buildFlowArtifact(store, { generatedAt: "2026-04-22T00:00:00.000Z" }),
  };
}

describe("review benchmarks", () => {
  it("reports conservative recall, precision, flow, test-gap, and false-positive metrics", () => {
    const { store, flows } = makeBenchmarkStore();

    const result = evaluateReviewBenchmarks(store, [
      {
        name: "auth service review",
        changedFiles: ["services.ts"],
        changedRanges: { "services.ts": [[12, 15]] },
        expectedChangedNodes: ["services.ts::verifyAuthToken"],
        expectedImpactedFiles: ["routes.ts", "services.ts", "repo.ts"],
        expectedAffectedFlows: ["handler"],
        expectedTestGaps: ["services.ts::verifyAuthToken"],
        expectedSummaryFacts: ["verifyAuthToken", "handler"],
        tokenBudget: 400,
      },
    ], { flows });

    const metrics = result.cases[0]!.metrics;
    expect(metrics.changedNodeRecall).toBe(1);
    expect(metrics.impactedFileRecall).toBe(1);
    expect(metrics.impactedFilePrecision).toBeLessThan(1);
    expect(metrics.falsePositiveCount).toBe(1);
    expect(metrics.flowCompleteness).toBe(1);
    expect(metrics.testGapRecall).toBe(1);
    expect(metrics.summaryFactRecall).toBe(1);
    expect(metrics.tokenBudgetStatus).toBe("pass");
    expect(result.aggregate.impactedFileF1).toBeGreaterThan(0.8);

    const markdown = reviewBenchmarkToMarkdown(result);
    expect(markdown).toContain("Graphify Review Benchmarks");
    expect(markdown).toContain("false positives");
    expect(markdown).toContain("estimated");
  });

  it("ignores null metrics in aggregate averages and documents README limitations", () => {
    const { store } = makeBenchmarkStore();

    const result = evaluateReviewBenchmarks(store, [
      { name: "no expectations", changedFiles: ["services.ts"] },
      {
        name: "changed node only",
        changedFiles: ["services.ts"],
        expectedChangedNodes: ["services.ts::verifyAuthToken"],
      },
    ]);

    expect(result.cases[0]!.metrics.changedNodeRecall).toBeNull();
    expect(result.aggregate.changedNodeRecall).toBe(1);

    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf-8");
    expect(readme).toContain("Review benchmarks");
    expect(readme).toContain("favor recall over precision");
    expect(readme).toContain("false positives");
    expect(readme).toContain("Token metrics are estimates");
  });
});
