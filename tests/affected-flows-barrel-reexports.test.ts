import { describe, expect, it } from "vitest";
import Graph from "graphology";

import { buildReviewDelta } from "../src/review.js";

// Layout:
//   src/utils/index.ts  imports  src/utils/foo.ts
//   src/utils/index.ts  imports  src/utils/bar.ts
//   src/consumer.ts     imports  src/utils/index.ts
//
// A change to src/utils/foo.ts must surface src/consumer.ts as affected
// (through the index.ts barrel re-export) even at depth 1.
function makeBarrelGraph(): Graph {
  const G = new Graph({ type: "directed" });
  const files = [
    "src/utils/foo.ts",
    "src/utils/bar.ts",
    "src/utils/index.ts",
    "src/consumer.ts",
    "src/unrelated.ts",
  ];
  for (const f of files) {
    G.addNode(f, { label: f, source_file: f, kind: "File" });
  }
  // barrel index re-exports foo and bar
  G.addDirectedEdge("src/utils/index.ts", "src/utils/foo.ts", {
    relation: "imports_from",
    confidence: "EXTRACTED",
  });
  G.addDirectedEdge("src/utils/index.ts", "src/utils/bar.ts", {
    relation: "imports_from",
    confidence: "EXTRACTED",
  });
  // consumer imports the barrel
  G.addDirectedEdge("src/consumer.ts", "src/utils/index.ts", {
    relation: "imports",
    confidence: "EXTRACTED",
  });
  // unrelated file imports nothing relevant
  G.addDirectedEdge("src/unrelated.ts", "src/utils/bar.ts", {
    relation: "imports",
    confidence: "EXTRACTED",
  });
  return G;
}

describe("affected-flows barrel re-exports", () => {
  it("barrel index re-export pulls consumers into the affected set at depth 1", () => {
    const delta = buildReviewDelta(makeBarrelGraph(), ["src/utils/foo.ts"], {
      maxNodes: 50,
      depth: 1,
    });
    expect(delta.impacted_files).toContain("src/utils/foo.ts");
    expect(delta.impacted_files).toContain("src/utils/index.ts");
    expect(delta.impacted_files).toContain("src/consumer.ts");
  });

  it("does not pull unrelated consumers via the barrel", () => {
    const delta = buildReviewDelta(makeBarrelGraph(), ["src/utils/foo.ts"], {
      maxNodes: 50,
      depth: 1,
    });
    expect(delta.impacted_files).not.toContain("src/unrelated.ts");
  });

  it("__init__.py barrel pulls Python consumers", () => {
    const G = new Graph({ type: "directed" });
    G.addNode("pkg/foo.py", { label: "foo.py", source_file: "pkg/foo.py", kind: "File" });
    G.addNode("pkg/__init__.py", {
      label: "__init__.py",
      source_file: "pkg/__init__.py",
      kind: "File",
    });
    G.addNode("app.py", { label: "app.py", source_file: "app.py", kind: "File" });
    G.addDirectedEdge("pkg/__init__.py", "pkg/foo.py", {
      relation: "imports_from",
      confidence: "EXTRACTED",
    });
    G.addDirectedEdge("app.py", "pkg/__init__.py", {
      relation: "imports_from",
      confidence: "EXTRACTED",
    });
    const delta = buildReviewDelta(G, ["pkg/foo.py"], { maxNodes: 50, depth: 1 });
    expect(delta.impacted_files).toContain("pkg/foo.py");
    expect(delta.impacted_files).toContain("pkg/__init__.py");
    expect(delta.impacted_files).toContain("app.py");
  });
});
