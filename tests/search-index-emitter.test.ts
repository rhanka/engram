import { describe, expect, it } from "vitest";
import Graph from "graphology";

import { computeCitationSignature } from "../src/citations.js";
import { edgeWeight } from "../src/retrieval/edge-weight.js";
import {
  buildSearchIndex,
  serializeSearchIndex,
} from "../src/search-index-emitter.js";
import { SEARCH_INDEX_SCHEMA } from "../src/search-index.js";

/**
 * A small mixed graph: quote-bearing + description-only nodes, a community with
 * a real (salient) label and one with a generic placeholder, varied edge
 * weights (numeric weight, confidence_score, enum-only, unknown enum).
 */
function makeGraph(): Graph {
  const G = new Graph({ type: "undirected" });
  G.setAttribute("community_labels", { "0": "Suspects", "1": "Community 1" });
  G.mergeNode("a", {
    label: "Sherlock Holmes",
    description: "the detective",
    community: 0,
    citations: [{ source_file: "book.txt", quote: "Holmes lit his pipe." }],
  });
  G.mergeNode("b", { label: "Watson", community: 0 });
  G.mergeNode("c", { label: "London", description: "a foggy city", community: 1 });
  G.mergeNode("d", { label: "Moriarty", community: 1 });

  // numeric weight wins.
  G.mergeEdge("a", "b", { relation: "knows", confidence: "EXTRACTED", weight: 2 });
  // confidence_score path.
  G.mergeEdge("a", "c", { relation: "visits", confidence: "INFERRED", confidence_score: 0.5 });
  // enum-only → mappedConfidence.
  G.mergeEdge("c", "d", { relation: "fears", confidence: "AMBIGUOUS" });
  // unknown enum → floor 1.
  G.mergeEdge("b", "d", { relation: "opposes", confidence: "MYSTERY" });
  return G;
}

describe("search-index emitter (T2 / T11 / T12)", () => {
  it("emits the v1 schema with self-carried docs, CSR adjacency, community, meta", () => {
    const G = makeGraph();
    const idx = buildSearchIndex(G);
    expect(idx.schema).toBe(SEARCH_INDEX_SCHEMA);
    // docs in sorted-nodeId order.
    expect(idx.docs.map((d) => d.nodeId)).toEqual(["a", "b", "c", "d"]);
    // CSR: node_ptr length N+1, monotone non-decreasing.
    expect(idx.adjacency.node_ptr.length).toBe(5);
    for (let i = 1; i < idx.adjacency.node_ptr.length; i++) {
      expect(idx.adjacency.node_ptr[i]!).toBeGreaterThanOrEqual(idx.adjacency.node_ptr[i - 1]!);
    }
    // community array parallel to docs.
    expect(idx.community).toEqual([0, 0, 1, 1]);
  });

  it("T2 — rebuild is byte-identical (sorted, deterministic)", () => {
    const a = serializeSearchIndex(buildSearchIndex(makeGraph()));
    const b = serializeSearchIndex(buildSearchIndex(makeGraph()));
    expect(a).toBe(b);
  });

  it("grounding payload is self-contained inline (groundingText, no graph.json offset)", () => {
    const idx = buildSearchIndex(makeGraph());
    const a = idx.docs.find((d) => d.nodeId === "a")!;
    expect(a.groundingText).toBe("Holmes lit his pipe.");
    expect(a.description).toBe("the detective");
    // quote-less node carries no groundingText (INV-6).
    const b = idx.docs.find((d) => d.nodeId === "b")!;
    expect(b.groundingText).toBeUndefined();
  });

  it("T11 — index edge_weights equal the Node-side resolved weights (byte-for-byte ranker)", () => {
    const G = makeGraph();
    const idx = buildSearchIndex(G);
    const docIndex = new Map(idx.docs.map((d, i) => [d.nodeId, i]));
    // Reconstruct the expected undirected weight per (src,dst) from the graph.
    function expectedWeight(u: string, v: string): number {
      const e = G.edge(u, v);
      return edgeWeight(G.getEdgeAttributes(e!) as Record<string, unknown>);
    }
    // a-b weight=2.
    const ai = docIndex.get("a")!;
    const bi = docIndex.get("b")!;
    const start = idx.adjacency.node_ptr[ai]!;
    const end = idx.adjacency.node_ptr[ai + 1]!;
    let abWeight: number | undefined;
    for (let k = start; k < end; k++) {
      if (idx.adjacency.neighbors[k] === bi) abWeight = idx.adjacency.edge_weights[k];
    }
    expect(abWeight).toBe(expectedWeight("a", "b"));
    expect(abWeight).toBe(2);
    // c-d enum AMBIGUOUS → 0.3.
    expect(expectedWeight("c", "d")).toBe(0.3);
    // b-d unknown enum → floor 1.
    expect(expectedWeight("b", "d")).toBe(1);
  });

  it("T11 — serialized indexParams.mappedConfidence is the FROZEN default", () => {
    const idx = buildSearchIndex(makeGraph());
    expect(idx.indexParams.mappedConfidence).toEqual({
      EXTRACTED: 1.0,
      INFERRED: 0.6,
      AMBIGUOUS: 0.3,
    });
    expect(idx.indexParams.rrfK).toBe(60);
  });

  it("community_meta carries label + salient (real label = salient, placeholder = not)", () => {
    const idx = buildSearchIndex(makeGraph());
    expect(idx.community_meta["0"]).toEqual({ label: "Suspects", salient: true });
    expect(idx.community_meta["1"]).toEqual({ label: "Community 1", salient: false });
  });

  it("T12 — mutating an EDGE flips graph_signature but NOT grounding_signature", () => {
    const base = buildSearchIndex(makeGraph());
    const G2 = makeGraph();
    G2.setEdgeAttribute(G2.edge("a", "b")!, "weight", 9); // edge weight change
    const mutated = buildSearchIndex(G2);
    expect(mutated.graph_signature).not.toBe(base.graph_signature);
    expect(mutated.grounding_signature).toBe(base.grounding_signature);
  });

  it("T12 — mutating a community LABEL flips graph_signature (no membership/citation change)", () => {
    const base = buildSearchIndex(makeGraph());
    const G2 = makeGraph();
    G2.setAttribute("community_labels", { "0": "Renamed Suspects", "1": "Community 1" });
    const mutated = buildSearchIndex(G2);
    expect(mutated.graph_signature).not.toBe(base.graph_signature);
    expect(mutated.grounding_signature).toBe(base.grounding_signature);
  });

  it("T12 — mutating community SALIENCE (placeholder → real) flips graph_signature", () => {
    const base = buildSearchIndex(makeGraph());
    const G2 = makeGraph();
    // Give community 1 a real label → salient flips false→true.
    G2.setAttribute("community_labels", { "0": "Suspects", "1": "Villains" });
    const mutated = buildSearchIndex(G2);
    expect(mutated.community_meta["1"]!.salient).toBe(true);
    expect(mutated.graph_signature).not.toBe(base.graph_signature);
  });

  it("T12 — mutating an inline QUOTE flips grounding_signature", () => {
    const base = buildSearchIndex(makeGraph());
    const G2 = makeGraph();
    G2.setNodeAttribute("a", "citations", [{ source_file: "book.txt", quote: "A different span." }]);
    const mutated = buildSearchIndex(G2);
    expect(mutated.grounding_signature).not.toBe(base.grounding_signature);
    // and graph_signature also changes (the quote feeds the BM25 quote field /
    // groundingText, which is part of the retrieval substrate) — fine; the
    // contract is only that an EDGE/LABEL change must NOT touch grounding_sig.
  });

  it("T12 — graph_signature is NOT equal to computeCitationSignature when they diverge", () => {
    const G = makeGraph();
    const idx = buildSearchIndex(G);
    expect(idx.graph_signature).not.toBe(computeCitationSignature(G));
  });

  it("T9/INV-6 — a quote-less graph still produces a valid index (label+description grounding)", () => {
    const G = new Graph({ type: "undirected" });
    G.mergeNode("x", { label: "Module A", description: "exports the parser", community: 0 });
    G.mergeNode("y", { label: "Module B", community: 0 });
    G.mergeEdge("x", "y", { relation: "imports", confidence: "EXTRACTED" });
    const idx = buildSearchIndex(G);
    expect(idx.docs.every((d) => d.groundingText === undefined)).toBe(true);
    expect(idx.docs.find((d) => d.nodeId === "x")!.description).toBe("exports the parser");
    expect(idx.schema).toBe(SEARCH_INDEX_SCHEMA);
  });
});
