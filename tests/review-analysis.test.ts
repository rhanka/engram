import { describe, expect, it } from "vitest";
import Graph from "graphology";

import {
  buildReviewAnalysis,
  evaluateReviewAnalysis,
  reviewAnalysisToText,
  reviewEvaluationToText,
} from "../src/review-analysis.js";

function makeGraph(): Graph {
  const G = new Graph({ type: "undirected" });
  G.setAttribute("community_labels", {
    "0": "Core Runtime",
    "1": "Docs + Rationale",
  });
  G.addNode("alpha", {
    label: "AlphaService",
    source_file: "src/alpha.ts",
    community: 0,
  });
  G.addNode("beta", {
    label: "BetaGateway",
    source_file: "src/beta.ts",
    community: 0,
  });
  G.addNode("docs", {
    label: "Decision Notes",
    source_file: "docs/decision.md",
    community: 1,
  });
  G.addNode("image", {
    label: "Architecture Diagram",
    source_file: "docs/diagram.png",
    community: 1,
  });
  G.addUndirectedEdge("alpha", "beta", { relation: "calls", confidence: "EXTRACTED" });
  G.addUndirectedEdge("beta", "docs", { relation: "rationale_for", confidence: "INFERRED" });
  G.addUndirectedEdge("docs", "image", { relation: "illustrates", confidence: "EXTRACTED" });
  return G;
}

describe("review analysis", () => {
  it("builds action-oriented review views", () => {
    const analysis = buildReviewAnalysis(makeGraph(), ["src/beta.ts"], {
      maxNodes: 20,
      maxChains: 5,
      maxCommunities: 4,
    });
    const text = reviewAnalysisToText(analysis);

    expect(analysis.changed_files).toEqual(["src/beta.ts"]);
    expect(analysis.blast_radius.level).not.toBe("low");
    expect(analysis.blast_radius.impacted_communities).toBe(2);
    expect(analysis.bridge_nodes.map((node) => node.label)).toContain("BetaGateway");
    expect(analysis.test_gap_hints).toEqual([
      "src/beta.ts: no related test file surfaced in the impacted graph",
    ]);
    expect(analysis.impacted_communities.map((community) => community.label)).toContain("Core Runtime");
    expect(analysis.multimodal_safety.touched_files).toContain("docs/decision.md");
    expect(text).toContain("Graphify Review Analysis");
    expect(text).toContain("Blast radius:");
    expect(text).toContain("Multimodal/doc safety:");
  });

  it("evaluates review surfaces with token and recall metrics", () => {
    const evaluation = evaluateReviewAnalysis(makeGraph(), [
      {
        name: "beta change",
        changed_files: ["src/beta.ts"],
        expected_impacted_files: ["src/alpha.ts", "docs/decision.md"],
        expected_summary_terms: ["Blast radius", "BetaGateway", "test-gap"],
        expected_multimodal_files: ["docs/decision.md"],
        naive_tokens: 2000,
      },
    ]);
    const text = reviewEvaluationToText(evaluation);

    expect(evaluation.cases).toHaveLength(1);
    expect(evaluation.aggregate.token_savings_ratio).toBeGreaterThan(0);
    expect(evaluation.aggregate.impacted_file_recall).toBe(1);
    expect(evaluation.aggregate.review_summary_precision).toBe(1);
    expect(evaluation.aggregate.multimodal_regression_safety).toBe(1);
    expect(text).toContain("Graphify Review Evaluation");
    expect(text).toContain("Token savings vs naive reads:");
  });
});
