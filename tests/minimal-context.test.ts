import { describe, expect, it } from "vitest";
import Graph from "graphology";

import { createReviewGraphStore } from "../src/review-store.js";
import { buildFlowArtifact } from "../src/flows.js";
import { buildMinimalContext } from "../src/minimal-context.js";

function qn(filePath: string, name: string): string {
  return `${filePath}::${name}`;
}

function addFunction(G: Graph, name: string, filePath: string, community: number = 1): string {
  const id = qn(filePath, name);
  G.addNode(id, {
    label: name,
    kind: "Function",
    qualified_name: id,
    source_file: filePath,
    line_start: 1,
    line_end: 10,
    community,
  });
  return id;
}

function addCall(G: Graph, source: string, target: string): void {
  G.addDirectedEdge(source, target, {
    relation: "calls",
    confidence: "EXTRACTED",
  });
}

function makeStore() {
  const G = new Graph({ type: "directed" });
  G.setAttribute("community_labels", {
    "1": "API",
    "2": "Services",
  });
  const api = addFunction(G, "handler", "routes.ts", 1);
  const service = addFunction(G, "verifyAuthToken", "services.ts", 2);
  const repo = addFunction(G, "repo", "repo.ts", 2);
  addCall(G, api, service);
  addCall(G, service, repo);
  const store = createReviewGraphStore(G);
  return {
    store,
    flows: buildFlowArtifact(store, { generatedAt: "2026-04-22T00:00:00.000Z" }),
  };
}

describe("minimal context", () => {
  it("returns compact graph stats with unknown risk when no changed files are supplied", () => {
    const { store } = makeStore();

    const result = buildMinimalContext(store, { task: "understand architecture" });

    expect(result.summary).toContain("3 nodes, 2 edges across 3 files");
    expect(result.risk).toBe("unknown");
    expect(result.flowsAvailable).toBe(false);
    expect(result.nextToolSuggestions).toEqual(["summary", "flows list", "path"]);
  });

  it("routes review/debug/refactor tasks to CRG-style next Graphify commands", () => {
    const { store } = makeStore();

    expect(buildMinimalContext(store, { task: "review PR #42" }).nextToolSuggestions).toEqual([
      "detect-changes",
      "affected-flows",
      "review-context",
    ]);
    expect(buildMinimalContext(store, { task: "debug login error" }).nextToolSuggestions).toEqual([
      "summary",
      "query",
      "flows get",
    ]);
    expect(buildMinimalContext(store, { task: "refactor dead code" }).nextToolSuggestions).toEqual([
      "review-context",
      "detect-changes",
      "recommend-commits",
    ]);
  });

  it("includes risk, key entities, top communities, and affected flows when inputs are available", () => {
    const { store, flows } = makeStore();

    const result = buildMinimalContext(store, {
      task: "review diff",
      changedFiles: ["services.ts"],
      flows,
    });

    expect(result.risk).toBe("high");
    expect(result.riskScore).toBeGreaterThan(0.4);
    expect(result.keyEntities).toEqual(["verifyAuthToken"]);
    expect(result.communities).toEqual(["Services", "API"]);
    expect(result.flowsAvailable).toBe(true);
    expect(result.flowsAffected).toEqual(["handler"]);
    expect(JSON.stringify(result).split(/\s+/u).length).toBeLessThan(800);
  });
});
