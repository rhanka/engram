import { describe, expect, it } from "vitest";

import { applyWeakFilter, buildScene, buildWindowScene } from "../lib/graphAdapter.js";

/**
 * Storage LOT 3 — `buildWindowScene` adapts a `GET /api/ontology/window`
 * document (a BOUNDED top-N-by-degree slice + induced edges + precomputed
 * layout positions) into a renderable Studio scene, tagged so the counters can
 * stay honest about visible-vs-corpus.
 */

/** A window doc shaped exactly like the route's `GraphWindow` payload. */
const WINDOW = {
  strategy: "degree-top-n",
  layout: "force",
  limit: 3,
  nodes: [
    { id: "a", label: "Alice", node_type: "Character", degree: 9, x: 10, y: 20 },
    { id: "b", label: "Bob", node_type: "Character", degree: 4, x: 30, y: 40 },
    { id: "c", label: "Baker St", node_type: "Place", degree: 2, x: 50, y: 60 },
  ],
  edges: [
    { source: "a", target: "b", relation: "KNOWS" },
    { source: "a", target: "c", relation: "LOCATED_IN" },
  ],
};

describe("buildWindowScene (storage LOT 3 windowed first paint)", () => {
  it("renders every window node and its induced edges", () => {
    const scene = buildWindowScene(WINDOW);

    expect(scene.nodes.map((n) => n.id)).toEqual(["a", "b", "c"]);
    expect(scene.edges).toHaveLength(2);
    expect(scene.stats.nodeCount).toBe(3);
    expect(scene.stats.edgeCount).toBe(2);
  });

  it("carries the store's precomputed positions through verbatim", () => {
    const scene = buildWindowScene(WINDOW);

    // The whole point of `graph_positions`: no client-side re-simulation.
    expect(scene.nodes.map((n) => [n.x, n.y])).toEqual([
      [10, 20],
      [30, 40],
      [50, 60],
    ]);
  });

  it("force-lays-out the window when the store has no position for a node", () => {
    const partial = {
      ...WINDOW,
      nodes: [WINDOW.nodes[0], { id: "b", label: "Bob", node_type: "Character", degree: 4 }],
      edges: [{ source: "a", target: "b", relation: "KNOWS" }],
    };

    const scene = buildWindowScene(partial);

    // Every node ends up positioned — never the renderer's degenerate ring.
    for (const node of scene.nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
    }
  });

  it("tags the scene as a bounded slice so counters can stay honest", () => {
    const scene = buildWindowScene(WINDOW);

    // `paint_window`, not `window`: a scene's OTHER window is the temporal one
    // [t, t_end], which is schema-carried. This one is a PAINT slice (top-N by
    // degree) and carries no schema, so the two must not share a bare name.
    expect(scene.paint_window).toEqual({
      strategy: "degree-top-n",
      layout: "force",
      limit: 3,
    });
    expect(scene.window).toBeUndefined();
    expect(scene.stats.windowed).toBe(true);
    expect(scene.stats.windowLimit).toBe(3);
  });

  it("leaves a FULL scene untagged, so the default studio counters are unchanged", () => {
    const full = buildScene({ nodes: WINDOW.nodes, links: WINDOW.edges });

    expect(full.stats.windowed).toBeUndefined();
    expect(full.paint_window).toBeUndefined();
  });

  it("keeps the windowed tag across the derived weak-link filter", () => {
    // applyWeakFilter spreads `...scene` / `...scene.stats`; the tag must ride
    // along or the rail would silently claim the window is the whole corpus.
    const filtered = applyWeakFilter(buildWindowScene(WINDOW), false);

    expect(filtered.stats.windowed).toBe(true);
    expect(filtered.paint_window).toEqual({
      strategy: "degree-top-n",
      layout: "force",
      limit: 3,
    });
  });

  it("survives an empty or malformed window document without throwing", () => {
    expect(buildWindowScene(null).nodes).toEqual([]);
    expect(buildWindowScene({}).nodes).toEqual([]);
    expect(buildWindowScene({ nodes: [] }).stats.nodeCount).toBe(0);
  });
});
