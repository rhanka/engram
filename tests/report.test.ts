import { describe, it, expect } from "vitest";
import Graph from "graphology";
import { generate } from "../src/report.js";
import type { AffectedFlowsResult, ReviewFlowArtifact } from "../src/flows.js";

describe("generate report", () => {
  it("generates a valid markdown report", () => {
    const G = new Graph({ type: "undirected" });
    G.mergeNode("a", { label: "ClassA", source_file: "a.py", file_type: "code" });
    G.mergeNode("b", { label: "ClassB", source_file: "b.py", file_type: "code" });
    G.mergeEdge("a", "b", { relation: "calls", confidence: "EXTRACTED", source_file: "a.py" });

    const communities = new Map([[0, ["a", "b"]]]);
    const cohesion = new Map([[0, 1.0]]);
    const labels = new Map([[0, "Core"]]);
    const gods = [{ id: "a", label: "ClassA", edges: 1 }];
    const surprises: never[] = [];
    const detection = {
      files: { code: ["a.py", "b.py"], document: [], paper: [], image: [] },
      total_files: 2,
      total_words: 1000,
      needs_graph: true,
      warning: null,
      skipped_sensitive: [],
      graphifyignore_patterns: 0,
    };

    const report = generate(
      G, communities, cohesion, labels, gods, surprises,
      detection, { input: 100, output: 50 }, "test-project",
    );

    expect(report).toContain("# Graph Report");
    expect(report).toContain("## Summary");
    expect(report).toContain("2 nodes");
    expect(report).toContain("1 edges");
    expect(report).toContain("## God Nodes");
    expect(report).toContain("ClassA");
    expect(report).toContain("## Communities");
    expect(report).toContain("Core");
  });

  it("includes warning when present", () => {
    const G = new Graph({ type: "undirected" });
    const report = generate(
      G, new Map(), new Map(), new Map(), [], [],
      {
        files: { code: [], document: [], paper: [], image: [] },
        total_files: 0, total_words: 100, needs_graph: false,
        warning: "Corpus too small",
        skipped_sensitive: [], graphifyignore_patterns: 0,
      },
      { input: 0, output: 0 }, ".",
    );
    expect(report).toContain("Corpus too small");
  });

  it("falls back to node IDs when community node labels are missing", () => {
    const G = new Graph({ type: "undirected" });
    G.mergeNode("missing_label", { source_file: "a.py", file_type: "code" });
    const report = generate(
      G,
      new Map([[0, ["missing_label"]]]),
      new Map([[0, 1.0]]),
      new Map([[0, "Core"]]),
      [],
      [],
      {
        files: { code: ["a.py"], document: [], paper: [], image: [] },
        total_files: 1,
        total_words: 1000,
        needs_graph: true,
        warning: null,
        skipped_sensitive: [],
        graphifyignore_patterns: 0,
      },
      { input: 0, output: 0 },
      ".",
    );

    expect(report).toContain("missing_label");
    expect(report).not.toContain("undefined");
  });

  it("renders flow-aware review sections only when grounded data is provided", () => {
    const G = new Graph({ type: "directed" });
    G.mergeNode("route", { label: "handler", source_file: "routes.ts", file_type: "code" });
    G.mergeNode("auth", { label: "verifyAuthToken", source_file: "auth.ts", file_type: "code" });
    G.mergeEdge("route", "auth", { relation: "calls", confidence: "EXTRACTED", source_file: "routes.ts" });

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
    const affectedFlows: AffectedFlowsResult = {
      changedFiles: ["auth.ts"],
      matchedNodeIds: ["auth"],
      unmatchedFiles: [],
      affectedFlows: [
        {
          ...flows.flows[0]!,
          steps: [
            {
              nodeId: "route",
              name: "handler",
              kind: "Function",
              file: "routes.ts",
              lineStart: 1,
              lineEnd: 4,
              qualifiedName: "routes.ts::handler",
            },
            {
              nodeId: "auth",
              name: "verifyAuthToken",
              kind: "Function",
              file: "auth.ts",
              lineStart: 10,
              lineEnd: 20,
              qualifiedName: "auth.ts::verifyAuthToken",
            },
          ],
        },
      ],
      total: 1,
    };

    const report = generate(
      G,
      new Map([[0, ["route", "auth"]]]),
      new Map([[0, 0.9]]),
      new Map([[0, "Auth"]]),
      [],
      [],
      {
        files: { code: ["routes.ts", "auth.ts"], document: [], paper: [], image: [] },
        total_files: 2,
        total_words: 300,
        needs_graph: true,
        warning: null,
        skipped_sensitive: [],
        graphifyignore_patterns: 0,
      },
      { input: 0, output: 0 },
      ".",
      {
        review: {
          flows,
          affectedFlows,
          highRiskNodes: [{ name: "verifyAuthToken", file: "auth.ts", riskScore: 0.91 }],
          testGaps: [{ name: "verifyAuthToken", file: "auth.ts", reason: "No TESTED_BY edge" }],
        },
      },
    );

    expect(report).toContain("## Execution Flows");
    expect(report).toContain("handler");
    expect(report).toContain("criticality 0.8200");
    expect(report).toContain("## Affected Flows");
    expect(report).toContain("auth.ts");
    expect(report).toContain("## High-Risk Nodes");
    expect(report).toContain("verifyAuthToken");
    expect(report).toContain("## Test Gaps");
    expect(report).toContain("No TESTED_BY edge");
  });
});
