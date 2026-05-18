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

  it.each([
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
    "bundledDependencies",
    "bundleDependencies",
  ])("excludes npm dep-block key %s from god nodes", (depKey) => {
    const G = new Graph({ type: "undirected" });
    G.mergeNode("real_node", {
      label: "AuthService",
      source_file: "src/auth.ts",
      file_type: "code",
    });
    G.mergeNode("dep_node", {
      label: depKey,
      source_file: "frontend/package.json",
      file_type: "code",
    });

    for (let i = 0; i < 20; i++) {
      const peer = `pkg_${i}`;
      G.mergeNode(peer, {
        label: `package-${i}`,
        source_file: "frontend/package.json",
        file_type: "code",
      });
      G.mergeEdge("dep_node", peer, {
        relation: "contains",
        confidence: "EXTRACTED",
      });
    }

    G.mergeNode("auth_helper", {
      label: "AuthHelper",
      source_file: "src/auth-helper.ts",
      file_type: "code",
    });
    G.mergeEdge("real_node", "auth_helper", {
      relation: "uses",
      confidence: "EXTRACTED",
    });
    G.mergeEdge("real_node", "dep_node", {
      relation: "imports",
      confidence: "EXTRACTED",
    });

    const gods = godNodes(G, 10);
    const godIds = gods.map((god) => god.id);

    expect(godIds).not.toContain("dep_node");
    expect(godIds).toContain("real_node");
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

  it("demotes inferred calls and uses between different code languages", () => {
    for (const relation of ["calls", "uses"] as const) {
      const G = new Graph({ type: "undirected" });
      G.mergeNode("ts_service", {
        label: "TypeScriptService",
        source_file: "frontend/service.ts",
        file_type: "code",
      });
      G.mergeNode("py_worker", {
        label: "PythonWorker",
        source_file: "backend/job.py",
        file_type: "code",
      });
      G.mergeNode("py_service", {
        label: "PythonService",
        source_file: "backend/service.py",
        file_type: "code",
      });
      G.mergeNode("py_helper", {
        label: "PythonHelper",
        source_file: "backend/helper.py",
        file_type: "code",
      });
      G.mergeEdge("ts_service", "py_worker", {
        relation,
        confidence: "INFERRED",
      });
      G.mergeEdge("py_service", "py_helper", {
        relation: "calls",
        confidence: "EXTRACTED",
      });

      const surprises = surprisingConnections(G, new Map([
        [0, ["ts_service", "py_service", "py_helper"]],
        [1, ["py_worker"]],
      ]), 2);

      expect(surprises).toHaveLength(2);
      expect(surprises[0]?.source_files).toEqual(["backend/service.py", "backend/helper.py"]);
      expect(surprises[1]?.source_files).toEqual(["frontend/service.ts", "backend/job.py"]);
      expect(surprises[1]?.why).not.toContain("connects across different repos/directories");
      expect(surprises[1]?.why).not.toContain("bridges separate communities");
    }
  });

  it("is deterministic for large single-source graphs", () => {
    const G = new Graph({ type: "undirected" });
    for (let i = 0; i < 1100; i++) {
      G.mergeNode(`node_${i}`, {
        label: `Node${i}`,
        source_file: "single.py",
        file_type: "code",
      });
      if (i > 0) {
        G.mergeEdge(`node_${i - 1}`, `node_${i}`, {
          relation: "uses",
          confidence: "EXTRACTED",
        });
      }
    }

    const first = surprisingConnections(G, new Map(), 5);
    const second = surprisingConnections(G, new Map(), 5);

    expect(second).toEqual(first);
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

  it("keeps bridge questions deterministic on large graphs", () => {
    const G = new Graph({ type: "undirected" });
    for (let i = 0; i < 1100; i++) {
      G.mergeNode(`node_${i}`, {
        label: `Node${i}`,
        source_file: "single.py",
        file_type: "code",
      });
      if (i > 0) {
        G.mergeEdge(`node_${i - 1}`, `node_${i}`, {
          relation: "uses",
          confidence: "EXTRACTED",
        });
      }
    }

    const first = suggestQuestions(G, new Map(), new Map(), 7);
    const second = suggestQuestions(G, new Map(), new Map(), 7);

    expect(second).toEqual(first);
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
