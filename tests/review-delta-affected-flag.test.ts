import { describe, expect, it } from "vitest";
import Graph from "graphology";

import { computeAffectedFiles, affectedFilesToText } from "../src/review.js";

function makeGraph(): Graph {
  const G = new Graph({ type: "directed" });
  G.addNode("src/a.ts", { label: "a.ts", source_file: "src/a.ts", kind: "File" });
  G.addNode("src/b.ts", { label: "b.ts", source_file: "src/b.ts", kind: "File" });
  G.addNode("src/c.ts", { label: "src/c.ts", source_file: "src/c.ts", kind: "File" });
  G.addDirectedEdge("src/a.ts", "src/b.ts", {
    relation: "imports",
    confidence: "EXTRACTED",
  });
  G.addDirectedEdge("src/b.ts", "src/c.ts", {
    relation: "imports",
    confidence: "EXTRACTED",
  });
  return G;
}

describe("review-delta --affected flag", () => {
  it("computeAffectedFiles returns sorted unique file list at depth 1", () => {
    const result = computeAffectedFiles(makeGraph(), ["src/a.ts"]);
    expect(result).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("computeAffectedFiles respects depth=2", () => {
    const result = computeAffectedFiles(makeGraph(), ["src/a.ts"], { depth: 2 });
    expect(result).toEqual(["src/a.ts", "src/b.ts", "src/c.ts"]);
  });

  it("computeAffectedFiles returns empty array when no nodes match", () => {
    const result = computeAffectedFiles(makeGraph(), ["missing.ts"]);
    expect(result).toEqual([]);
  });

  it("affectedFilesToText emits newline-separated paths", () => {
    const text = affectedFilesToText(["src/a.ts", "src/b.ts"]);
    expect(text).toBe("src/a.ts\nsrc/b.ts");
  });

  it("affectedFilesToText returns empty string on empty array", () => {
    expect(affectedFilesToText([])).toBe("");
  });
});
