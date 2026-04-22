import { describe, expect, it } from "vitest";
import Graph from "graphology";

import { createReviewGraphStore } from "../src/review-store.js";
import { buildFlowArtifact } from "../src/flows.js";
import {
  analyzeChanges,
  computeRiskScore,
  isSafeGitRef,
  mapChangesToNodes,
  parseUnifiedDiff,
} from "../src/detect-changes.js";

function qn(filePath: string, name: string): string {
  return `${filePath}::${name}`;
}

function addNode(
  G: Graph,
  name: string,
  filePath: string,
  options: { start?: number; end?: number; kind?: "Function" | "Class" | "Test"; community?: number } = {},
): string {
  const id = qn(filePath, name);
  G.addNode(id, {
    label: name,
    kind: options.kind ?? "Function",
    qualified_name: id,
    source_file: filePath,
    line_start: options.start ?? 1,
    line_end: options.end ?? 10,
    community: options.community,
  });
  return id;
}

function addEdge(G: Graph, source: string, target: string, relation: string = "calls"): void {
  G.addDirectedEdge(source, target, {
    relation,
    confidence: "EXTRACTED",
  });
}

describe("risk-scored detect changes", () => {
  it("parses unified diff ranges for basic, single-line, deletion, and multiple-file hunks", () => {
    const parsed = parseUnifiedDiff([
      "diff --git a/foo.py b/foo.py",
      "--- a/foo.py",
      "+++ b/foo.py",
      "@@ -10,3 +10,5 @@ def foo():",
      "+    new line",
      "@@ -40 +42 @@",
      "+single",
      "diff --git a/bar.py b/bar.py",
      "--- a/bar.py",
      "+++ b/bar.py",
      "@@ -8,2 +8,0 @@",
    ].join("\n"));

    expect(parsed).toEqual({
      "foo.py": [[10, 14], [42, 42]],
      "bar.py": [[8, 8]],
    });
    expect(isSafeGitRef("main~1")).toBe(true);
    expect(isSafeGitRef("main;rm -rf .")).toBe(false);
    expect(isSafeGitRef("--cached")).toBe(false);
    expect(isSafeGitRef("main..HEAD")).toBe(false);
  });

  it("maps changed line ranges to overlapping graph nodes with suffix path fallback and dedupe", () => {
    const G = new Graph({ type: "directed" });
    const funcA = addNode(G, "funcA", "/repo/src/app.ts", { start: 5, end: 15 });
    const funcB = addNode(G, "funcB", "/repo/src/app.ts", { start: 20, end: 30 });
    addNode(G, "funcC", "/repo/src/app.ts", { start: 40, end: 50 });
    const store = createReviewGraphStore(G);

    const nodes = mapChangesToNodes(store, {
      "src/app.ts": [[10, 12], [25, 26], [11, 13]],
    });

    expect(nodes.map((node) => node.qualifiedName)).toEqual([funcA, funcB]);
  });

  it("scores untested, security-sensitive, called, and flow-participating nodes as higher risk", () => {
    const G = new Graph({ type: "directed" });
    const untested = addNode(G, "verify_auth_token", "auth.ts", { community: 1 });
    const tested = addNode(G, "processData", "data.ts", { community: 1 });
    const test = addNode(G, "testProcessData", "data.test.ts", { kind: "Test", community: 1 });
    const caller = addNode(G, "apiHandler", "api.ts", { community: 2 });
    addEdge(G, test, tested, "tested_by");
    addEdge(G, caller, untested, "calls");
    addEdge(G, caller, tested, "calls");
    const store = createReviewGraphStore(G);
    const flows = buildFlowArtifact(store, { generatedAt: "2026-04-22T00:00:00.000Z" });

    const untestedScore = computeRiskScore(store, store.getNode(untested)!, { flows });
    const testedScore = computeRiskScore(store, store.getNode(tested)!, { flows });

    expect(untestedScore).toBeGreaterThan(testedScore);
    expect(untestedScore).toBeGreaterThanOrEqual(0);
    expect(untestedScore).toBeLessThanOrEqual(1);
  });

  it("analyzes changed files with line ranges, affected flows, test gaps, priorities, and fallback mapping", () => {
    const G = new Graph({ type: "directed" });
    const handler = addNode(G, "handler", "routes.ts", { start: 1, end: 5 });
    const service = addNode(G, "service", "services.ts", { start: 10, end: 20 });
    addNode(G, "other", "services.ts", { start: 40, end: 50 });
    addEdge(G, handler, service, "calls");
    const store = createReviewGraphStore(G);
    const flows = buildFlowArtifact(store, { generatedAt: "2026-04-22T00:00:00.000Z" });

    const ranged = analyzeChanges(store, ["services.ts"], {
      changedRanges: { "services.ts": [[12, 15]] },
      flows,
    });
    const fallback = analyzeChanges(store, ["services.ts"], { flows });

    expect(ranged.changedFunctions.map((node) => node.qualifiedName)).toEqual([service]);
    expect(ranged.affectedFlows).toHaveLength(1);
    expect(ranged.testGaps.map((gap) => gap.qualifiedName)).toEqual([service]);
    expect(ranged.reviewPriorities[0]?.qualifiedName).toBe(service);
    expect(ranged.summary).toContain("Analyzed 1 changed file(s)");
    expect(fallback.changedFunctions.map((node) => node.qualifiedName)).toEqual([
      service,
      "services.ts::other",
    ]);
  });
});
