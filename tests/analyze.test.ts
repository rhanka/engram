import { describe, it, expect } from "vitest";
import Graph from "graphology";
import { godNodes, surprisingConnections, suggestQuestions, graphDiff } from "../src/analyze.js";

function buildTestGraph(): InstanceType<typeof Graph> {
  const G = new Graph({ type: "undirected" });
  // Add nodes
  G.mergeNode("classA", { label: "ClassA", source_file: "a.py", file_type: "code" });
  G.mergeNode("classB", { label: "ClassB", source_file: "b.py", file_type: "code" });
  G.mergeNode("funcC", { label: "funcC()", source_file: "a.py", file_type: "code" });
  G.mergeNode("funcD", { label: "funcD()", source_file: "b.py", file_type: "code" });
  G.mergeNode("classE", { label: "ClassE", source_file: "c.py", file_type: "code" });
  // Add edges
  G.mergeEdge("classA", "funcC", { relation: "contains", confidence: "EXTRACTED" });
  G.mergeEdge("classB", "funcD", { relation: "contains", confidence: "EXTRACTED" });
  G.mergeEdge("classA", "classB", { relation: "calls", confidence: "INFERRED" });
  G.mergeEdge("classA", "classE", { relation: "uses", confidence: "AMBIGUOUS" });
  G.mergeEdge("classB", "classE", { relation: "uses", confidence: "INFERRED" });
  return G;
}

describe("godNodes", () => {
  it("returns most connected nodes", () => {
    const G = buildTestGraph();
    const gods = godNodes(G, 3);
    expect(gods.length).toBeGreaterThan(0);
    expect(gods[0]!.edges).toBeGreaterThanOrEqual(gods[gods.length - 1]!.edges);
    expect(gods[0]!.degree).toBe(gods[0]!.edges);
  });

  it("excludes file nodes", () => {
    const G = new Graph({ type: "undirected" });
    G.mergeNode("a_py", { label: "a.py", source_file: "a.py", file_type: "code" });
    G.mergeNode("classA", { label: "ClassA", source_file: "a.py", file_type: "code" });
    G.mergeEdge("a_py", "classA", { relation: "contains", confidence: "EXTRACTED" });
    const gods = godNodes(G);
    const labels = gods.map((g) => g.label);
    expect(labels).not.toContain("a.py");
  });

  it("respects topN parameter", () => {
    const G = buildTestGraph();
    const gods = godNodes(G, 2);
    expect(gods.length).toBeLessThanOrEqual(2);
  });
});

describe("surprisingConnections", () => {
  it("finds cross-file connections", () => {
    const G = buildTestGraph();
    const communities = new Map<number, string[]>([
      [0, ["classA", "funcC"]],
      [1, ["classB", "funcD"]],
      [2, ["classE"]],
    ]);
    const surprises = surprisingConnections(G, communities);
    // Should find cross-file edges (uses, calls)
    expect(surprises.length).toBeGreaterThan(0);
  });

  it("returns empty for single-node graph", () => {
    const G = new Graph({ type: "undirected" });
    G.mergeNode("a", { label: "A", source_file: "a.py" });
    expect(surprisingConnections(G)).toEqual([]);
  });

  it("treats newer code extensions as code instead of docs", () => {
    const G = new Graph({ type: "undirected" });
    G.mergeNode("swift_node", {
      label: "SwiftService",
      source_file: "Sources/App/main.swift",
      file_type: "code",
    });
    G.mergeNode("zig_node", {
      label: "ZigWorker",
      source_file: "src/worker.zig",
      file_type: "code",
    });
    G.mergeEdge("swift_node", "zig_node", {
      relation: "uses",
      confidence: "INFERRED",
    });

    const surprises = surprisingConnections(G, new Map([[0, ["swift_node"]], [1, ["zig_node"]]]));
    expect(surprises).toHaveLength(1);
    expect(surprises[0]?.why).not.toContain("crosses file types");
  });
});

describe("suggestQuestions", () => {
  it("generates questions for a graph with AMBIGUOUS edges", () => {
    const G = buildTestGraph();
    const communities = new Map<number, string[]>([
      [0, ["classA", "funcC"]],
      [1, ["classB", "funcD", "classE"]],
    ]);
    const labels = new Map([[0, "Module A"], [1, "Module B"]]);
    const questions = suggestQuestions(G, communities, labels);
    expect(questions.length).toBeGreaterThan(0);
    expect(questions.some((q) => q.type === "ambiguous_edge")).toBe(true);
  });

  it("returns no_signal for an empty graph", () => {
    const G = new Graph({ type: "undirected" });
    const questions = suggestQuestions(G, new Map(), new Map());
    expect(questions[0]!.type).toBe("no_signal");
  });
});

describe("graphDiff", () => {
  it("detects added nodes", () => {
    const G1 = new Graph({ type: "undirected" });
    G1.mergeNode("a", { label: "A" });
    const G2 = new Graph({ type: "undirected" });
    G2.mergeNode("a", { label: "A" });
    G2.mergeNode("b", { label: "B" });
    const diff = graphDiff(G1, G2);
    expect(diff.new_nodes).toHaveLength(1);
    expect(diff.new_nodes[0]!.id).toBe("b");
  });

  it("detects removed nodes", () => {
    const G1 = new Graph({ type: "undirected" });
    G1.mergeNode("a", { label: "A" });
    G1.mergeNode("b", { label: "B" });
    const G2 = new Graph({ type: "undirected" });
    G2.mergeNode("a", { label: "A" });
    const diff = graphDiff(G1, G2);
    expect(diff.removed_nodes).toHaveLength(1);
  });

  it("reports no changes for identical graphs", () => {
    const G = new Graph({ type: "undirected" });
    G.mergeNode("a", { label: "A" });
    const diff = graphDiff(G, G);
    expect(diff.summary).toBe("no changes");
  });
});
