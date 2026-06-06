import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// The reference implementation lives in the SPA. `buildStudioScene` (TS) must
// reproduce its `{ nodes, edges, stats }` output byte-for-byte so the build-time
// `scene.json` is a drop-in replacement for the client-side `buildScene`.
// @ts-expect-error — plain ESM JS module, no type declarations.
import { buildScene } from "../studio/src/lib/graphAdapter.js";
import { buildStudioScene } from "../src/studio-scene.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

/**
 * Strict parity assertion: both the deep structure AND the serialized form
 * (key order + presence/absence of optional fields) must match, because the
 * scene is ultimately persisted as JSON.
 */
function expectParity(graph: unknown, options?: { showWeakLinks?: boolean }): void {
  const reference = buildScene(graph, options);
  const candidate = buildStudioScene(graph as never, options);

  // Structural equality (values).
  expect(candidate).toEqual(reference);
  // Serialized equality (field order + optional-field presence).
  expect(JSON.stringify(candidate)).toBe(JSON.stringify(reference));
}

/**
 * Node-by-node / edge-by-edge parity so a single divergence is pinpointed
 * rather than hidden inside a giant object diff.
 */
function expectGranularParity(graph: unknown, options?: { showWeakLinks?: boolean }): void {
  const reference = buildScene(graph, options) as {
    nodes: Record<string, unknown>[];
    edges: Record<string, unknown>[];
    stats: Record<string, unknown>;
  };
  const candidate = buildStudioScene(graph as never, options) as unknown as {
    nodes: Record<string, unknown>[];
    edges: Record<string, unknown>[];
    stats: Record<string, unknown>;
  };

  expect(candidate.nodes.length).toBe(reference.nodes.length);
  expect(candidate.edges.length).toBe(reference.edges.length);

  for (let i = 0; i < reference.nodes.length; i++) {
    expect(candidate.nodes[i], `node #${i} (${String(reference.nodes[i].id)})`).toEqual(
      reference.nodes[i],
    );
    expect(
      JSON.stringify(candidate.nodes[i]),
      `node #${i} field order (${String(reference.nodes[i].id)})`,
    ).toBe(JSON.stringify(reference.nodes[i]));
  }
  for (let i = 0; i < reference.edges.length; i++) {
    expect(candidate.edges[i], `edge #${i}`).toEqual(reference.edges[i]);
    expect(JSON.stringify(candidate.edges[i]), `edge #${i} field order`).toBe(
      JSON.stringify(reference.edges[i]),
    );
  }
  expect(candidate.stats).toEqual(reference.stats);
}

// ---------------------------------------------------------------------------
// Synthetic fixtures — exercise every branch of the adapter.
// ---------------------------------------------------------------------------

/** A small graph touching: shapes, dashes, communities, weak edges, degrees. */
const SMALL_GRAPH = {
  nodes: [
    { id: "n1", label: "Sherlock", type: "Character", community: 1, community_name: "Detectives" },
    { id: "n2", label: "Watson", type: "Character", community: 1, community_name: "Detectives" },
    { id: "n3", label: "Moriarty", type: "Character", community: 2, community_name: "Villains" },
    { id: "n4", title: "The Final Problem", type: "Work", community: 3 },
    { id: "n5", name: "221B Baker Street", type: "Location", community: 2 },
    { id: "n6", type: "Evidence" }, // no label/title/name -> falls back to id
    { id: "n7", node_type: "Organization", community_name: "Yard" }, // node_type wins
    { id: "iso", type: "Object" }, // isolated singleton -> not in community count
  ],
  links: [
    { source: "n1", target: "n2", relation: "assists" }, // dashed, strong
    { source: "n1", target: "n3", relation: "opposes" }, // dashed
    { source: "n1", target: "n4", relation: "appears_in" }, // solid
    { source: "n3", target: "n5", relation: "located_in" }, // dotted
    { source: "n1", target: "n5", relation: "occurs_at", confidence: "INFERRED" }, // weak + dotted
    { source: "n4", target: "n6", relation: "contains_evidence" }, // solid
    { source: "n1", target: "n7", relation: "unknown_rel" }, // fallback solid
    { source: "n2", target: "n3", relation: "  " }, // blank relation -> no relation/dash
    { source: "n1", target: "missing" }, // dangling -> dropped
  ],
};

/** Edge-case graph: empty, missing fields, edges-as-`edges`. */
const EDGE_CASES = [
  { name: "empty graph", graph: { nodes: [], links: [] } },
  { name: "null graph", graph: null },
  { name: "undefined graph", graph: undefined },
  { name: "nodes only, no edges", graph: { nodes: [{ id: "solo", type: "Saga" }] } },
  {
    name: "edges field (not links)",
    graph: {
      nodes: [{ id: "a" }, { id: "b" }],
      edges: [{ source: "a", target: "b", relation: "same_as" }],
    },
  },
  {
    name: "numeric community only (no name)",
    graph: {
      nodes: [{ id: "x", community: 7 }, { id: "y", community: 7 }],
      links: [{ source: "x", target: "y" }],
    },
  },
];

describe("buildStudioScene — parity with studio buildScene", () => {
  describe("small synthetic graph", () => {
    it("matches with showWeakLinks=true (default)", () => {
      expectParity(SMALL_GRAPH);
      expectGranularParity(SMALL_GRAPH);
    });

    it("matches with showWeakLinks=false", () => {
      expectParity(SMALL_GRAPH, { showWeakLinks: false });
      expectGranularParity(SMALL_GRAPH, { showWeakLinks: false });
    });
  });

  describe("edge cases", () => {
    for (const { name, graph } of EDGE_CASES) {
      it(`matches: ${name}`, () => {
        expectParity(graph);
        expectParity(graph, { showWeakLinks: false });
      });
    }
  });

  describe("real repo graph (.graphify/graph.json)", () => {
    const graphPath = join(REPO_ROOT, ".graphify", "graph.json");
    const hasRealGraph = existsSync(graphPath);

    it.runIf(hasRealGraph)("matches node-by-node and edge-by-edge", () => {
      const realGraph = JSON.parse(readFileSync(graphPath, "utf-8"));
      // Sanity: this is the heavy real graph, not a stub.
      expect((realGraph.nodes ?? []).length).toBeGreaterThan(100);
      expectGranularParity(realGraph);
      expectParity(realGraph);
    });

    it.runIf(hasRealGraph)("matches with weak links filtered out", () => {
      const realGraph = JSON.parse(readFileSync(graphPath, "utf-8"));
      expectGranularParity(realGraph, { showWeakLinks: false });
      expectParity(realGraph, { showWeakLinks: false });
    });

    it.skipIf(hasRealGraph)("real graph absent — synthetic parity still proven", () => {
      expect(hasRealGraph).toBe(false);
    });
  });
});
