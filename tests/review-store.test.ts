import { describe, expect, it } from "vitest";
import Graph from "graphology";

import { createReviewGraphStore } from "../src/review-store.js";

function makeReviewGraph(): Graph {
  const G = new Graph({ type: "undirected" });
  G.setAttribute("community_labels", {
    "1": "Payments",
    "2": "Persistence",
  });
  G.addNode("src/service.ts::PaymentService", {
    label: "PaymentService",
    kind: "Class",
    source_file: "/repo/src/service.ts",
    source_location: "L10-L30",
    language: "ts",
    community: "1",
  });
  G.addNode("src/service.ts::processPayment", {
    label: "processPayment",
    kind: "Function",
    source_file: "/repo/src/service.ts",
    source_location: "/repo/src/service.ts:12-20",
    language: "ts",
    community: 1,
  });
  G.addNode("src/service.ts::helper", {
    label: "helper",
    file_type: "code",
    source_file: "src/service.ts",
    source_location: "#L24",
  });
  G.addNode("src/repo.ts::savePayment", {
    label: "savePayment",
    kind: "Function",
    source_file: "/repo/src/repo.ts",
    line_start: 5,
    line_end: 8,
    community: 2,
  });
  G.addNode("tests/service.test.ts::testProcessPayment", {
    label: "testProcessPayment",
    kind: "Test",
    source_file: "/repo/tests/service.test.ts",
    source_location: "lines 4-9",
    community: 1,
  });
  G.addNode("tests/repo.test.ts::testSavePayment", {
    label: "testSavePayment",
    kind: "Test",
    source_file: "/repo/tests/repo.test.ts",
    source_location: "L4",
    community: 2,
  });

  G.addUndirectedEdge("src/service.ts::processPayment", "src/repo.ts::savePayment", {
    relation: "calls",
    confidence: "EXTRACTED",
    source_file: "/repo/src/service.ts",
    source_location: "L14",
    _src: "src/service.ts::processPayment",
    _tgt: "src/repo.ts::savePayment",
  });
  G.addUndirectedEdge("tests/service.test.ts::testProcessPayment", "src/service.ts::processPayment", {
    relation: "validated_by",
    confidence: "EXTRACTED",
    source_file: "/repo/tests/service.test.ts",
    _src: "tests/service.test.ts::testProcessPayment",
    _tgt: "src/service.ts::processPayment",
  });
  G.addUndirectedEdge("tests/repo.test.ts::testSavePayment", "src/repo.ts::savePayment", {
    relation: "validated_by",
    confidence: "EXTRACTED",
    source_file: "/repo/tests/repo.test.ts",
    _src: "tests/repo.test.ts::testSavePayment",
    _tgt: "src/repo.ts::savePayment",
  });
  return G;
}

describe("review graph store adapter", () => {
  it("normalizes Graphify node fields into the CRG review contract", () => {
    const store = createReviewGraphStore(makeReviewGraph());

    const node = store.getNode("src/service.ts::processPayment");

    expect(node).toMatchObject({
      id: "src/service.ts::processPayment",
      name: "processPayment",
      qualifiedName: "src/service.ts::processPayment",
      kind: "Function",
      filePath: "/repo/src/service.ts",
      lineStart: 12,
      lineEnd: 20,
      language: "ts",
      isTest: false,
      communityId: 1,
    });
    expect(store.getNode("missing")).toBeNull();
    expect(store.getNodesByKind(["Test"]).map((item) => item.name)).toEqual([
      "testProcessPayment",
      "testSavePayment",
    ]);
  });

  it("matches changed files by exact and suffix-normalized paths", () => {
    const store = createReviewGraphStore(makeReviewGraph());

    expect(store.getNodesByFile("src/service.ts").map((item) => item.name)).toEqual([
      "PaymentService",
      "helper",
      "processPayment",
    ]);
    expect(store.getNodesByFile("./repo/src/repo.ts").map((item) => item.name)).toEqual([
      "savePayment",
    ]);
    expect(store.getFilesMatching("src/service.ts")).toEqual([
      "/repo/src/service.ts",
      "src/service.ts",
    ]);
  });

  it("normalizes relation kinds and preserved direction on undirected Graphify edges", () => {
    const store = createReviewGraphStore(makeReviewGraph());

    expect(store.getAllCallTargets()).toEqual(new Set(["src/repo.ts::savePayment"]));
    expect(store.getEdgesBySource("src/service.ts::processPayment", "CALLS")).toMatchObject([
      {
        kind: "CALLS",
        sourceQualified: "src/service.ts::processPayment",
        targetQualified: "src/repo.ts::savePayment",
        line: 14,
        confidence: 1,
        confidenceTier: "EXTRACTED",
      },
    ]);
    expect(store.getEdgesByTarget("src/service.ts::processPayment", "TESTED_BY").map((edge) => edge.sourceQualified)).toEqual([
      "tests/service.test.ts::testProcessPayment",
    ]);
  });

  it("computes CRG-style impact radius with changed seeds, impacted nodes, files, and edges", () => {
    const store = createReviewGraphStore(makeReviewGraph());

    const impact = store.getImpactRadius(["src/service.ts"], { maxDepth: 1, maxNodes: 10 });

    expect(impact.changedNodes.map((node) => node.qualifiedName)).toEqual([
      "src/service.ts::PaymentService",
      "src/service.ts::helper",
      "src/service.ts::processPayment",
    ]);
    expect(impact.impactedNodes.map((node) => node.qualifiedName)).toEqual([
      "src/repo.ts::savePayment",
      "tests/service.test.ts::testProcessPayment",
    ]);
    expect(impact.impactedFiles).toEqual([
      "/repo/src/repo.ts",
      "/repo/src/service.ts",
      "/repo/tests/service.test.ts",
      "src/service.ts",
    ]);
    expect(impact.edges).toHaveLength(2);
    expect(impact.truncated).toBe(false);
    expect(impact.totalImpacted).toBe(5);
  });

  it("finds direct and one-hop transitive test coverage", () => {
    const store = createReviewGraphStore(makeReviewGraph());

    expect(store.getTransitiveTests("src/service.ts::processPayment").map((node) => node.qualifiedName)).toEqual([
      "tests/service.test.ts::testProcessPayment",
      "tests/repo.test.ts::testSavePayment",
    ]);
  });

  it("reports graph stats from normalized nodes and edges", () => {
    const store = createReviewGraphStore(makeReviewGraph());

    expect(store.getGraphStats()).toMatchObject({
      totalNodes: 6,
      totalEdges: 3,
      nodesByKind: {
        Class: 1,
        Function: 3,
        Test: 2,
      },
      edgesByKind: {
        CALLS: 1,
        TESTED_BY: 2,
      },
      filesCount: 5,
    });
  });
});
