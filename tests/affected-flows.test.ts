import { describe, expect, it } from "vitest";
import Graph from "graphology";

import { createReviewGraphStore } from "../src/review-store.js";
import { buildFlowArtifact, getAffectedFlows } from "../src/flows.js";

function qn(filePath: string, name: string): string {
  return `${filePath}::${name}`;
}

function addFunction(G: Graph, name: string, filePath: string): string {
  const id = qn(filePath, name);
  G.addNode(id, {
    label: name,
    kind: "Function",
    qualified_name: id,
    source_file: filePath,
    line_start: 1,
    line_end: 10,
  });
  return id;
}

function addCall(G: Graph, source: string, target: string, filePath: string): void {
  G.addDirectedEdge(source, target, {
    relation: "calls",
    confidence: "EXTRACTED",
    source_file: filePath,
  });
}

function makeFlowStore() {
  const G = new Graph({ type: "directed" });
  const route = addFunction(G, "handler", "routes.py");
  const service = addFunction(G, "service", "services.py");
  const repo = addFunction(G, "repo", "repo.py");
  const cli = addFunction(G, "main", "cli.py");
  const helper = addFunction(G, "helper", "utils.py");
  addCall(G, route, service, "routes.py");
  addCall(G, service, repo, "services.py");
  addCall(G, cli, helper, "cli.py");
  const store = createReviewGraphStore(G);
  return {
    store,
    artifact: buildFlowArtifact(store, { generatedAt: "2026-04-22T00:00:00.000Z" }),
    ids: { route, service, repo, cli, helper },
  };
}

describe("affected flows", () => {
  it("maps changed files to flow memberships and returns detailed steps sorted by criticality", () => {
    const { artifact, store, ids } = makeFlowStore();

    const result = getAffectedFlows(artifact, ["services.py"], store);

    expect(result.total).toBe(1);
    expect(result.changedFiles).toEqual(["services.py"]);
    expect(result.matchedNodeIds).toEqual([ids.service]);
    expect(result.unmatchedFiles).toEqual([]);
    expect(result.affectedFlows[0]?.entryPoint).toBe(ids.route);
    expect(result.affectedFlows[0]?.steps.map((step) => step.qualifiedName)).toEqual([
      ids.route,
      ids.service,
      ids.repo,
    ]);
  });

  it("returns stable empty results for no files or unmatched files", () => {
    const { artifact, store } = makeFlowStore();

    expect(getAffectedFlows(artifact, [], store)).toMatchObject({
      changedFiles: [],
      matchedNodeIds: [],
      unmatchedFiles: [],
      affectedFlows: [],
      total: 0,
    });
    expect(getAffectedFlows(artifact, ["missing.py"], store)).toMatchObject({
      changedFiles: ["missing.py"],
      matchedNodeIds: [],
      unmatchedFiles: ["missing.py"],
      affectedFlows: [],
      total: 0,
    });
  });
});
