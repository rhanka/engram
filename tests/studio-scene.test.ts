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

  it("preserves profile metadata and fx/fy pins in the build-time scene", () => {
    // OBJ-2: `ontology_status` is NOT in NODE_PROFILE_FIELDS (removed: never
    // produced by any pipeline, duplicated `status` semantics). Input nodes
    // may still carry it as a raw field but it will NOT be copied to the scene.
    const scene = buildStudioScene({
      nodes: [
        {
          id: "AM0104.01",
          label: "Manage identity",
          node_type: "ProcessStdProcess",
          status: "validated",
          parent_id: "AM0104",
          level: 2,
          fx: 120,
          fy: -40,
        },
        { id: "DE.AI.01", type: "ABPProcess", x: 10, y: 20, fixed: true },
      ],
      links: [
        {
          source: "AM0104.01",
          target: "DE.AI.01",
          relation_type: "candidate_maps_to",
          assertion_basis: "heuristic_guess",
          review_status: "candidate",
          evidence_refs: ["registry#process_std"],
        },
      ],
    });

    expect(scene.nodes[0]).toMatchObject({
      type: "ProcessStdProcess",
      status: "validated",
      parent_id: "AM0104",
      level: 2,
      x: 120,
      y: -40,
      fx: 120,
      fy: -40,
    });
    // ontology_status is not copied to the scene node (not in NODE_PROFILE_FIELDS)
    expect((scene.nodes[0] as Record<string, unknown>)["ontology_status"]).toBeUndefined();
    expect(scene.nodes[1]).toMatchObject({ type: "ABPProcess", fixed: true });
    expect(scene.edges[0]).toMatchObject({
      relation: "candidate_maps_to",
      relation_type: "candidate_maps_to",
      assertion_basis: "heuristic_guess",
      review_status: "candidate",
      evidence_refs: ["registry#process_std"],
      weak: true,
    });
  });

  it("exposes registry_record_id / registry_id verbatim (lossless, D2) and stays byte-identical otherwise", () => {
    // workspace-bundle-contract-v1 (D2): scene nodes carry the raw id_column
    // value VERBATIM — no `.`/`-`→`_` slugging — alongside the native scene id.
    const rawIds = ["AM0104.01", "DE.AI.01", "org:CODE", "550e8400-e29b-41d4-a716-446655440000"];
    const withRegistry = {
      nodes: rawIds.map((raw, i) => ({
        id: `registry_process_std_${raw.replace(/[^A-Za-z0-9]+/g, "_")}`,
        label: `Record ${i}`,
        node_type: "ProcessStdProcess",
        registry_id: "process_std",
        registry_record_id: raw,
      })),
      links: [],
    };
    const scene = buildStudioScene(withRegistry);
    scene.nodes.forEach((node, i) => {
      expect(node.registry_record_id).toBe(rawIds[i]); // verbatim, lossless
      expect(node.registry_id).toBe("process_std");
    });
    // SPA adapter stays in lockstep (parity incl. serialized field order).
    expectParity(withRegistry);
    expectGranularParity(withRegistry);

    // Back-compat: a graph WITHOUT registry fields produces a byte-identical
    // scene before/after the allowlist addition (additive change only).
    const withoutRegistry = {
      nodes: withRegistry.nodes.map(({ registry_id, registry_record_id, ...rest }) => rest),
      links: [],
    };
    const plainScene = buildStudioScene(withoutRegistry);
    for (const node of plainScene.nodes) {
      expect("registry_id" in node).toBe(false);
      expect("registry_record_id" in node).toBe(false);
    }
    const stripped = scene.nodes.map(({ registry_id, registry_record_id, ...rest }) => rest);
    expect(JSON.stringify(stripped)).toBe(JSON.stringify(plainScene.nodes));
    expect(scene.edges).toEqual(plainScene.edges);
    expect(scene.stats).toEqual(plainScene.stats);
  });

  it("applies built-in shape variants (fill/border) and profile visual_encoding overrides", () => {
    const graph = {
      nodes: [
        { id: "c", type: "Character" }, // defaults: solid + normal (omitted)
        { id: "al", type: "Alias" }, // built-in variant: hollow
        { id: "w", type: "Work" }, // built-in variant: bold border
      ],
      links: [],
    };

    // No profile: built-in TYPE_VARIANT defaults.
    const scene = buildStudioScene(graph);
    const byId = new Map(scene.nodes.map((n) => [n.id, n]));
    expect(byId.get("c")!.fill).toBeUndefined();
    expect(byId.get("c")!.border).toBeUndefined();
    expect(byId.get("al")!.fill).toBe("hollow");
    expect(byId.get("w")!.fill).toBe("hollow");
    expect(byId.get("w")!.border).toBe("bold");

    // Profile visual_encoding overrides shape AND the variant dimensions.
    const withProfile = buildStudioScene(graph, {
      profile: {
        node_types: {
          Character: { visual_encoding: { shape: "hexagon", fill: "hollow", border: "bold" } },
          Alias: { visual_encoding: { fill: "solid" } }, // back to default -> omitted
        },
      },
    });
    const byId2 = new Map(withProfile.nodes.map((n) => [n.id, n]));
    expect(byId2.get("c")!.shape).toBe("hexagon");
    expect(byId2.get("c")!.fill).toBe("hollow");
    expect(byId2.get("c")!.border).toBe("bold");
    expect(byId2.get("al")!.fill).toBeUndefined();
    expect(byId2.get("w")!.border).toBe("bold"); // untouched by the profile
  });

  describe("real repo graph (.graphify/graph.json)", () => {
    const graphPath = join(REPO_ROOT, ".graphify", "graph.json");
    const hasRealGraph = existsSync(graphPath);

    // Heavy: granular + full parity over the WHOLE real graph (can be thousands
    // of nodes/edges), so per-element JSON.stringify dominates — give it a
    // generous timeout so a large local graph / loaded CI box never flakes.
    const HEAVY_PARITY_TIMEOUT_MS = 120_000;

    it.runIf(hasRealGraph)(
      "matches node-by-node and edge-by-edge",
      () => {
        const realGraph = JSON.parse(readFileSync(graphPath, "utf-8"));
        // Sanity: this is the heavy real graph, not a stub.
        expect((realGraph.nodes ?? []).length).toBeGreaterThan(100);
        expectGranularParity(realGraph);
        expectParity(realGraph);
      },
      HEAVY_PARITY_TIMEOUT_MS,
    );

    it.runIf(hasRealGraph)(
      "matches with weak links filtered out",
      () => {
        const realGraph = JSON.parse(readFileSync(graphPath, "utf-8"));
        expectGranularParity(realGraph, { showWeakLinks: false });
        expectParity(realGraph, { showWeakLinks: false });
      },
      HEAVY_PARITY_TIMEOUT_MS,
    );

    it.skipIf(hasRealGraph)("real graph absent — synthetic parity still proven", () => {
      expect(hasRealGraph).toBe(false);
    });
  });

  describe("TYPE_SHAPE — corpus structure stays non-box", () => {
    // Labelled boxes are reserved for Character hubs. Work/ChapterOrStory keep
    // explicit non-box glyphs so corpus structure cannot masquerade as a hub.
    const expected: Record<string, string> = {
      Work: "hexagon",
      ChapterOrStory: "dot",
      Saga: "hexagon",
      Author: "star",
      Translator: "triangle",
    };

    it("buildStudioScene (TS) maps structural corpus types without box glyphs", () => {
      const graph = {
        nodes: Object.keys(expected).map((type, i) => ({ id: `n${i}`, type })),
        edges: [],
      };
      const scene = buildStudioScene(graph);
      for (const node of scene.nodes) {
        expect(node.shape).toBe(expected[node.type as string]);
      }
      expect(scene.nodes.filter((node) => node.shape === "roundedbox")).toHaveLength(0);
    });

    it("buildScene (SPA) stays in lockstep with the TS port", () => {
      const graph = {
        nodes: Object.keys(expected).map((type, i) => ({ id: `n${i}`, type })),
        edges: [],
      };
      const scene = buildScene(graph) as { nodes: Array<{ type?: string; shape: string }> };
      for (const node of scene.nodes) {
        expect(node.shape).toBe(expected[node.type as string]);
      }
      expect(scene.nodes.filter((node) => node.shape === "roundedbox")).toHaveLength(0);
    });

    it("keeps shared hexagon types visually distinct by fill/border variant", () => {
      const graph = {
        nodes: ["Organization", "ForensicMethod", "Saga", "Work"].map((type, i) => ({
          id: `n${i}`,
          type,
        })),
        edges: [],
      };
      const scene = buildStudioScene(graph);
      const signatures = scene.nodes.map((node) =>
        [node.type, node.shape, node.fill ?? "solid", node.border ?? "normal"].join(":"),
      );
      expect(signatures).toEqual([
        "Organization:hexagon:solid:normal",
        "ForensicMethod:hexagon:hollow:normal",
        "Saga:hexagon:solid:bold",
        "Work:hexagon:hollow:bold",
      ]);
    });
  });
});
