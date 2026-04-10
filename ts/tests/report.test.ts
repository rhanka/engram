import { describe, it, expect } from "vitest";
import Graph from "graphology";
import { generate } from "../src/report.js";

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
});
