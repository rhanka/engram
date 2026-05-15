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

  it("filters nodes by kind for function/class/test entry-point queries", () => {
    const store = createReviewGraphStore(makeReviewGraph());

    expect(store.getNodesByKind(["Function"]).map((n) => n.name).sort()).toEqual([
      "helper",
      "processPayment",
      "savePayment",
    ]);
    expect(store.getNodesByKind(["Class"]).map((n) => n.name)).toEqual(["PaymentService"]);
    expect(store.getNodesByKind(["Test"]).map((n) => n.name).sort()).toEqual([
      "testProcessPayment",
      "testSavePayment",
    ]);
    expect(store.getNodesByKind(["Class", "Test"]).length).toBe(3);
  });

  it("collects all CALLS edge targets as canonical call sinks", () => {
    const store = createReviewGraphStore(makeReviewGraph());
    const targets = store.getAllCallTargets();

    // Only CALLS edges count; TESTED_BY is excluded.
    // The canonical CALLS in the fixture is processPayment -> savePayment
    // (preserved direction via _src/_tgt).
    expect(targets.has("src/repo.ts::savePayment")).toBe(true);
    // processPayment is the source of CALLS but not a target -> excluded.
    expect(targets.has("src/service.ts::processPayment")).toBe(false);
    // Test nodes are connected via TESTED_BY (not CALLS) -> excluded.
    expect(targets.has("tests/service.test.ts::testProcessPayment")).toBe(false);
  });

  it("respects directed Graphology source/target without _src/_tgt", () => {
    const G = new Graph({ type: "directed" });
    G.addNode("src/a.ts::main", { label: "main", kind: "Function", source_file: "src/a.ts" });
    G.addNode("src/a.ts::worker", { label: "worker", kind: "Function", source_file: "src/a.ts" });
    G.addDirectedEdge("src/a.ts::main", "src/a.ts::worker", {
      relation: "calls",
      confidence: "EXTRACTED",
    });
    const store = createReviewGraphStore(G);

    const out = store.getEdgesBySource("src/a.ts::main");
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe("CALLS");
    expect(out[0]?.targetId).toBe("src/a.ts::worker");

    // Reverse query must NOT return the edge as outgoing-from-worker.
    expect(store.getEdgesBySource("src/a.ts::worker")).toHaveLength(0);
    expect(store.getEdgesByTarget("src/a.ts::worker")).toHaveLength(1);

    expect(store.getAllCallTargets().has("src/a.ts::worker")).toBe(true);
    expect(store.getAllCallTargets().has("src/a.ts::main")).toBe(false);
  });

  it("parses community attrs as both numeric and string and looks up in batch", () => {
    const store = createReviewGraphStore(makeReviewGraph());

    // PaymentService has community: "1" (string), processPayment has community: 1 (number).
    expect(store.getNodeCommunityId("src/service.ts::PaymentService")).toBe(1);
    expect(store.getNodeCommunityId("src/service.ts::processPayment")).toBe(1);
    // helper has no community attr.
    expect(store.getNodeCommunityId("src/service.ts::helper")).toBeNull();

    const batch = store.getCommunityIdsByQualifiedNames([
      "src/service.ts::PaymentService",
      "src/service.ts::helper",
      "src/repo.ts::savePayment",
      "tests/service.test.ts::testProcessPayment",
      "src/missing.ts::ghost",
    ]);
    expect(batch.get("src/service.ts::PaymentService")).toBe(1);
    expect(batch.get("src/service.ts::helper")).toBeNull();
    expect(batch.get("src/repo.ts::savePayment")).toBe(2);
    expect(batch.get("tests/service.test.ts::testProcessPayment")).toBe(1);
    expect(batch.get("src/missing.ts::ghost")).toBeNull();
  });

  it("normalizes Windows backslashes and leading ./ in path lookups", () => {
    const G = new Graph({ type: "undirected" });
    G.addNode("src/auth.ts::login", {
      label: "login",
      kind: "Function",
      source_file: "src/auth.ts",
    });
    G.addNode("src/auth.ts::logout", {
      label: "logout",
      kind: "Function",
      source_file: "src/auth.ts",
    });
    const store = createReviewGraphStore(G);

    // Windows-style backslashes in the query.
    expect(store.getNodesByFile("src\\auth.ts").map((n) => n.name).sort()).toEqual(["login", "logout"]);
    // Leading ./ in the query.
    expect(store.getNodesByFile("./src/auth.ts").map((n) => n.name).sort()).toEqual(["login", "logout"]);
    // Suffix matching (the file is stored relative; query with absolute prefix).
    expect(store.getNodesByFile("/repo/work/src/auth.ts").map((n) => n.name).sort()).toEqual(["login", "logout"]);

    // getFilesMatching also handles backslash + leading ./.
    expect(store.getFilesMatching("src\\auth.ts")).toEqual(["src/auth.ts"]);
    expect(store.getFilesMatching("./src/auth.ts")).toEqual(["src/auth.ts"]);
  });
});
