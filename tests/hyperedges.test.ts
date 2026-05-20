/**
 * Tests for the hyperedges data layer (Lot F-Hyper-1).
 *
 * Mirrors upstream Python `graphify/tests/test_hypergraph.py` for the
 * dedup / roundtrip semantics, plus our additional contract: union of
 * `nodes` arrays when two hyperedges share the same id.
 */
import { describe, expect, it } from "vitest";

import { createGraph, loadGraphFromData, serializeGraph } from "../src/graph.js";
import {
  HYPEREDGES_ATTRIBUTE,
  loadHyperedges,
  mergeHyperedges,
  setHyperedges,
  validateHyperedge,
  type Hyperedge,
} from "../src/hyperedges.js";

function authFlow(overrides: Partial<Hyperedge> = {}): Hyperedge {
  return {
    id: "auth_flow",
    label: "Auth Flow",
    nodes: ["BasicAuth", "DigestAuth", "Request", "Response", "BaseClient"],
    relation: "participate_in",
    confidence: "INFERRED",
    confidence_score: 0.75,
    source_file: "auth.py",
    ...overrides,
  };
}

describe("hyperedges data layer", () => {
  describe("validateHyperedge", () => {
    it("accepts a well-formed hyperedge", () => {
      expect(validateHyperedge(authFlow())).toBe(true);
    });

    it("accepts a hyperedge without confidence_score (field is optional)", () => {
      const { confidence_score: _ignored, ...rest } = authFlow();
      expect(validateHyperedge(rest)).toBe(true);
    });

    it("rejects null, primitives, and arrays", () => {
      expect(validateHyperedge(null)).toBe(false);
      expect(validateHyperedge(undefined)).toBe(false);
      expect(validateHyperedge("auth_flow")).toBe(false);
      expect(validateHyperedge(42)).toBe(false);
      expect(validateHyperedge([])).toBe(false);
    });

    it("rejects missing or empty id", () => {
      expect(validateHyperedge(authFlow({ id: "" }))).toBe(false);
      const { id: _ignored, ...rest } = authFlow();
      expect(validateHyperedge(rest)).toBe(false);
    });

    it("rejects nodes array containing non-strings", () => {
      expect(validateHyperedge(authFlow({ nodes: ["a", 7 as unknown as string] }))).toBe(false);
    });

    it("rejects unknown confidence values", () => {
      expect(validateHyperedge(authFlow({ confidence: "MAYBE" as Hyperedge["confidence"] }))).toBe(false);
    });

    it("rejects non-finite confidence_score", () => {
      expect(validateHyperedge(authFlow({ confidence_score: Number.NaN }))).toBe(false);
      expect(validateHyperedge(authFlow({ confidence_score: Number.POSITIVE_INFINITY }))).toBe(false);
      expect(validateHyperedge(authFlow({ confidence_score: "high" as unknown as number }))).toBe(false);
    });

    it("tolerates unknown extra keys (forward-compat)", () => {
      expect(validateHyperedge({ ...authFlow(), provenance: "llm:claude-opus-4.7" })).toBe(true);
    });
  });

  describe("loadHyperedges / setHyperedges", () => {
    it("defaults to an empty array when the attribute is unset (backwards compat)", () => {
      const graph = createGraph(false);
      expect(loadHyperedges(graph)).toEqual([]);
    });

    it("uses the canonical 'hyperedges' graphology attribute key", () => {
      expect(HYPEREDGES_ATTRIBUTE).toBe("hyperedges");
      const graph = createGraph(false);
      const h = authFlow();
      setHyperedges(graph, [h]);
      expect(graph.getAttribute("hyperedges")).toEqual([h]);
    });

    it("roundtrips through setHyperedges -> loadHyperedges", () => {
      const graph = createGraph(false);
      const items = [authFlow(), authFlow({ id: "billing_flow", label: "Billing", nodes: ["X", "Y"] })];
      setHyperedges(graph, items);
      expect(loadHyperedges(graph)).toEqual(items);
    });

    it("clears when called with an empty array", () => {
      const graph = createGraph(false);
      setHyperedges(graph, [authFlow()]);
      setHyperedges(graph, []);
      expect(loadHyperedges(graph)).toEqual([]);
    });

    it("survives a serializeGraph -> loadGraphFromData roundtrip", () => {
      const graph = createGraph(false);
      graph.addNode("BasicAuth");
      graph.addNode("DigestAuth");
      graph.addNode("Request");
      graph.addNode("Response");
      graph.addNode("BaseClient");
      setHyperedges(graph, [authFlow()]);

      const serialized = serializeGraph(graph);
      expect(serialized.hyperedges).toEqual([authFlow()]);

      const reloaded = loadGraphFromData(serialized);
      expect(loadHyperedges(reloaded)).toEqual([authFlow()]);
    });

    it("serializes an empty graph without a hyperedges field (graph.js default)", () => {
      const graph = createGraph(false);
      const serialized = serializeGraph(graph);
      expect(serialized.hyperedges).toBeUndefined();
      const reloaded = loadGraphFromData(serialized);
      expect(loadHyperedges(reloaded)).toEqual([]);
    });
  });

  describe("mergeHyperedges", () => {
    it("returns an empty array when both inputs are empty", () => {
      expect(mergeHyperedges([], [])).toEqual([]);
    });

    it("preserves arity (size of nodes array) for a single hyperedge", () => {
      const result = mergeHyperedges([authFlow()], []);
      expect(result).toHaveLength(1);
      expect(result[0]!.nodes).toHaveLength(5);
    });

    it("dedupes by id: identical hyperedges seen twice collapse to one", () => {
      const result = mergeHyperedges([authFlow()], [authFlow()]);
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe("auth_flow");
    });

    it("preserves order: a comes first, then b appends new ids", () => {
      const aFlow = authFlow({ id: "a_flow", label: "A", nodes: ["A1", "A2"] });
      const bFlow = authFlow({ id: "b_flow", label: "B", nodes: ["B1", "B2"] });
      const cFlow = authFlow({ id: "c_flow", label: "C", nodes: ["C1", "C2"] });
      const result = mergeHyperedges([aFlow, bFlow], [cFlow]);
      expect(result.map((h) => h.id)).toEqual(["a_flow", "b_flow", "c_flow"]);
    });

    it("unions member node sets when two hyperedges share the same id", () => {
      const first = authFlow({ nodes: ["BasicAuth", "DigestAuth", "Request"] });
      const second = authFlow({ nodes: ["DigestAuth", "Response", "BaseClient"] });
      const [merged] = mergeHyperedges([first], [second]);
      expect(merged!.id).toBe("auth_flow");
      expect(merged!.nodes).toEqual(["BasicAuth", "DigestAuth", "Request", "Response", "BaseClient"]);
    });

    it("first-wins for non-node fields when ids collide", () => {
      const first = authFlow({ label: "First", confidence: "EXTRACTED", confidence_score: 1.0 });
      const second = authFlow({ label: "Second", confidence: "AMBIGUOUS", confidence_score: 0.3 });
      const [merged] = mergeHyperedges([first], [second]);
      expect(merged!.label).toBe("First");
      expect(merged!.confidence).toBe("EXTRACTED");
      expect(merged!.confidence_score).toBe(1.0);
    });

    it("drops entries without an id (matches upstream attach_hyperedges)", () => {
      const noId = { label: "No ID", nodes: ["X"], relation: "rel", confidence: "INFERRED", source_file: "x.py" } as Hyperedge;
      const result = mergeHyperedges([noId], [authFlow()]);
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe("auth_flow");
    });

    it("does not mutate input arrays or their hyperedges", () => {
      const a = [authFlow({ nodes: ["A", "B"] })];
      const b = [authFlow({ nodes: ["C"] })];
      const aSnapshot = JSON.parse(JSON.stringify(a));
      const bSnapshot = JSON.parse(JSON.stringify(b));
      mergeHyperedges(a, b);
      expect(a).toEqual(aSnapshot);
      expect(b).toEqual(bSnapshot);
    });

    it("is idempotent: merge(merge(a,b), b) === merge(a,b)", () => {
      const a = [authFlow({ nodes: ["BasicAuth", "DigestAuth"] })];
      const b = [authFlow({ nodes: ["DigestAuth", "Response"] })];
      const once = mergeHyperedges(a, b);
      const twice = mergeHyperedges(once, b);
      expect(twice).toEqual(once);
    });
  });
});
