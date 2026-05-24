import { describe, expect, it } from "vitest";
import Graph from "graphology";

import { buildReviewDelta } from "../src/review.js";

// Build a 4-hop directed import chain:
//   a.ts --imports--> b.ts --imports--> c.ts --imports--> d.ts --imports--> e.ts
// Reviewing a change in a.ts at depth N should reach exactly N+1 files
// (a + first N hops). Default depth (1) preserves prior behavior.
function makeChainGraph(): Graph {
  const G = new Graph({ type: "directed" });
  const files = ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts"];
  for (const f of files) {
    G.addNode(f, { label: f, source_file: f, kind: "File" });
  }
  for (let i = 0; i < files.length - 1; i += 1) {
    G.addDirectedEdge(files[i]!, files[i + 1]!, {
      relation: "imports",
      confidence: "EXTRACTED",
    });
  }
  return G;
}

describe("review-delta --depth", () => {
  it("default depth 1 reaches first-hop neighbors only", () => {
    const delta = buildReviewDelta(makeChainGraph(), ["a.ts"], { maxNodes: 50 });
    expect(delta.impacted_files).toEqual(["a.ts", "b.ts"]);
  });

  it("depth 3 reaches three import hops", () => {
    const delta = buildReviewDelta(makeChainGraph(), ["a.ts"], {
      maxNodes: 50,
      depth: 3,
    });
    expect(delta.impacted_files).toEqual(["a.ts", "b.ts", "c.ts", "d.ts"]);
  });

  it("depth 5 reaches the whole chain (cap at end)", () => {
    const delta = buildReviewDelta(makeChainGraph(), ["a.ts"], {
      maxNodes: 50,
      depth: 5,
    });
    expect(delta.impacted_files).toEqual(["a.ts", "b.ts", "c.ts", "d.ts", "e.ts"]);
  });

  it("clamps depth above 5 to 5", () => {
    const delta = buildReviewDelta(makeChainGraph(), ["a.ts"], {
      maxNodes: 50,
      depth: 99,
    });
    expect(delta.impacted_files).toEqual(["a.ts", "b.ts", "c.ts", "d.ts", "e.ts"]);
  });
});
