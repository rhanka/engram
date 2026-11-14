import { describe, expect, it } from "vitest";
import Graph from "graphology";
import { graphDiff } from "../src/analyze.js";
import { cohesionScore } from "../src/cluster.js";
import { loadGraphFromData } from "../src/graph.js";
import { createReviewGraphStore } from "../src/review-store.js";
import { buildStudioScene } from "../src/studio-scene.js";
import { buildFirstHopSummary } from "../src/summary.js";
import { renderTree } from "../src/tree.js";
import { computeFocusSubgraph } from "../src/workspace/graph-selection.js";
import { createDefaultViewerState } from "../src/workspace/index.js";
import { buildGraphRendererPayload } from "../studio/src/lib/graphRendererPayload.js";
import { buildScene, computeDegrees } from "../studio/src/lib/graphAdapter.js";
import { edge, multiGraph, node } from "./helpers/multi-links.js";
import { withMcp } from "./helpers/multi-links-mcp.js";

describe("P1 dual-compatible readers on explicit multigraphs", () => {
  it("uses effective ordered tuple identities in graph differences", () => {
    const ns = [node("a"), node("b"), node("a,b"), node("b,c"), node("c")];
    const before = multiGraph([edge()], ns);
    const after = multiGraph([edge(), edge({ source: "b", target: "a" })], ns);
    expect(graphDiff(before, after).new_edges).toEqual([expect.objectContaining({ source: "b", target: "a", relation: "calls" })]);
    expect(graphDiff(multiGraph([edge({ source: "a,b", target: "c" })], ns), multiGraph([edge({ source: "a", target: "b,c" })], ns)).new_edges).toHaveLength(1);
  });

  it("keeps one child slot per neighbour with every oriented relation", () => {
    const G = multiGraph([
      edge({ confidence: "INFERRED" }),
      edge({ source: "b", target: "a", confidence: "EXTRACTED" }),
      edge({ relation: "reads" }),
      edge({ target: "c" }),
    ], [node("a"), node("b"), node("c")]);
    const tree = renderTree(G, "a", { maxChildren: 1 });
    expect(tree.split("\n").filter(line => /[├└]─/.test(line))).toHaveLength(2);
    expect(tree).toContain("calls");
    expect(tree).toContain("reads");
    expect(tree).toContain("INFERRED");
    expect(tree).toContain("EXTRACTED");
    expect(tree).toContain("<--");
    expect(tree).toContain("and 1 more");
  });

  it("counts unique ordered non-self pairs for directed density", () => {
    const G = multiGraph([edge(), edge({ source: "b", target: "a" }), edge({ relation: "reads" }), edge({ source: "a", target: "a" })], [node("a"), node("b")], true);
    const summary = buildFirstHopSummary(G);
    expect(summary.graph.density).toBe(1);
    expect(summary.graph.average_degree).toBe(1.5);
    expect(summary.graph.edges).toBe(4);
  });

  it("uses ordered pairs for directed workspace density without changing neighbour degree", () => {
    const nodes = [node("a"), node("b")];
    const edges = [edge(), edge({ relation: "reads" }), edge({ source: "a", target: "a" })];
    const state = createDefaultViewerState();
    const before = computeFocusSubgraph({ multigraph: true, directed: true, nodes, edges }, state).metrics;
    expect(before.density).toBe(0.5);
    expect(before.averageDegree).toBe(1.5);
    expect(computeFocusSubgraph({ multigraph: true, directed: true, nodes, edges: [...edges, edge({ source: "b", target: "a" })] }, state).metrics.density).toBe(1);
  });

  it("keeps drawn-link density for opacity while topology degree drives node styling", () => {
    const nodes = ["a", "b"].map((id, index) => ({ id, label: id, weight: 1, x: index, y: 0 }));
    const edges = Array.from({ length: 20 }, (_, index) => ({ source: "a", target: "b", relation: "r" + index }));
    const payload = buildGraphRendererPayload({ multigraph: true, nodes, edges });
    expect(payload.renderGraph.edges).toHaveLength(40);
    expect(payload.baseStyle.edgeAlphaShape[0]).toBeLessThan(255);
  });
});

describe("P1 preserves legacy simple reader defaults until activation", () => {
  it("keeps reverse traversal rendering unchanged on a loaded simple graph", () => {
    const G = loadGraphFromData({ nodes: [node("a", { label: "Alpha", source_file: "" }), node("b", { label: "Beta", source_file: "" })], links: [edge({ _src: "a", _tgt: "b" })] });
    expect(G.multi).toBe(false);
    const tree = renderTree(G, "b", { depth: 1 });
    expect(tree).toContain("calls -> Alpha");
    expect(tree).not.toContain("<--");
    expect(tree).not.toContain("[EXTRACTED]");
  });

  it("keeps the live simple MCP arrows and reported loop degree unchanged", async () => {
    await withMcp({ nodes: [node("a", { label: "Alpha" }), node("b", { label: "Beta" })], links: [edge({ _src: "a", _tgt: "b" }), edge({ target: "a" })] }, async call => {
      expect(await call("get_neighbors", { label: "Beta" })).toContain("--> Alpha [calls] [EXTRACTED]");
      expect(await call("shortest_path", { source: "Beta", target: "Alpha" })).toContain("--calls [EXTRACTED]--> Alpha");
      expect(await call("get_node", { label: "Alpha" })).toContain("Degree: 3");
    });
  });

  it("keeps summary loop incidence and graph/community density on simple graphs", () => {
    const G = new Graph({ type: "undirected", multi: false });
    G.addNode("a", { community: 0 }); G.addNode("b", { community: 0 });
    G.addEdgeWithKey("legacy-row", "a", "a", { relation: "calls" });
    const summary = buildFirstHopSummary(G);
    expect(summary.graph).toMatchObject({ density: 1, average_degree: 1, edges: 1 });
    expect(summary.key_communities[0].density).toBe(1);
    expect(cohesionScore(G, ["a", "b"])).toBe(1);
    expect(createReviewGraphStore(G).getAllEdges()[0].id).toBe("legacy-row");
  });

  it("keeps the default workspace denominator and endpoint incidence", () => {
    const nodes = [node("a"), node("b")], state = createDefaultViewerState();
    expect(computeFocusSubgraph({ directed: true, nodes, links: [edge()] }, state).metrics.density).toBe(1);
    expect(computeFocusSubgraph({ nodes, links: [edge({ target: "a" })] }, state).metrics).toMatchObject({ density: 1, averageDegree: 1 });
  });

  it("keeps undirected simple graph differences insensitive to row orientation", () => {
    const before = loadGraphFromData({ nodes: [node("a"), node("b")], links: [edge()] });
    const after = loadGraphFromData({ nodes: [node("a"), node("b")], links: [edge({ source: "b", target: "a" })] });
    expect(graphDiff(before, after).new_edges).toEqual([]);
    expect(graphDiff(before, after).removed_edges).toEqual([]);
  });

  it("keeps legacy Studio incidence unless the document explicitly opts in", () => {
    const nodes = [node("a"), node("b"), node("c")];
    const edges = [edge({ target: "a" }), edge({ source: "b", target: "c" })];
    expect(computeDegrees(nodes, edges).get("a")).toBe(2);
    for (const build of [buildScene, buildStudioScene]) {
      const legacy = build({ nodes, edges });
      expect(legacy.nodes[0].weight).toBeGreaterThan(legacy.nodes[1].weight);
      const prepared = build({ multigraph: true, nodes, edges });
      expect(prepared.nodes[0].weight).toBe(prepared.nodes[1].weight);
      expect(prepared.multigraph).toBe(true);
    }
  });
});
