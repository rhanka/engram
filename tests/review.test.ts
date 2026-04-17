import { describe, expect, it } from "vitest";
import Graph from "graphology";

import { buildReviewDelta, reviewDeltaToText } from "../src/review.js";

function makeGraph(): Graph {
  const G = new Graph({ type: "undirected" });
  G.addNode("auth", {
    label: "AuthController",
    source_file: "src/auth.ts",
    community: 0,
  });
  G.addNode("payment", {
    label: "PaymentGateway",
    source_file: "src/payment.ts",
    community: 1,
  });
  G.addNode("docs", {
    label: "Payment Security Notes",
    source_file: "docs/payment.md",
    community: 2,
  });
  G.addNode("authTest", {
    label: "AuthController test",
    source_file: "tests/auth.test.ts",
    community: 0,
  });

  G.addUndirectedEdge("auth", "payment", { relation: "calls", confidence: "EXTRACTED" });
  G.addUndirectedEdge("payment", "docs", { relation: "documents", confidence: "INFERRED" });
  G.addUndirectedEdge("auth", "authTest", { relation: "validated_by", confidence: "EXTRACTED" });
  return G;
}

describe("review delta", () => {
  it("builds review impact from changed files", () => {
    const delta = buildReviewDelta(makeGraph(), ["src/payment.ts"], {
      maxNodes: 10,
      maxHubs: 5,
      maxChains: 5,
    });

    expect(delta.changed_files).toEqual(["src/payment.ts"]);
    expect(delta.changed_nodes.map((node) => node.label)).toEqual(["PaymentGateway"]);
    expect(delta.impacted_files).toEqual([
      "docs/payment.md",
      "src/auth.ts",
      "src/payment.ts",
    ]);
    expect(delta.bridge_nodes.map((node) => node.label)).toContain("PaymentGateway");
    expect(delta.likely_test_gaps).toEqual([
      "src/payment.ts: no related test file surfaced in the impacted graph",
    ]);
    expect(delta.high_risk_chains.some((chain) => chain.risk.includes("inferred"))).toBe(true);
  });

  it("formats stable text for assistants", () => {
    const text = reviewDeltaToText(buildReviewDelta(makeGraph(), ["src/payment.ts"]));

    expect(text).toContain("Graphify Review Delta");
    expect(text).toContain("Changed files: 1");
    expect(text).toContain("docs/payment.md");
    expect(text).toContain("PaymentGateway");
    expect(text).toContain("Likely test gaps:");
    expect(text).toContain("High-risk dependency chains:");
    expect(text).toContain("Next best action:");
  });
});
