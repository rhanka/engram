import { describe, expect, it } from "vitest";

import {
  buildRenderGraphBuffers,
  computeRadialPositions,
  getLayout,
  RADIAL_LAYOUT_ID,
  type LayoutFn,
} from "../src/index";

/** Read back the (x, y) of node index `i` from a node-order-keyed positions array. */
function xy(positions: Float32Array, i: number): { x: number; y: number } {
  return { x: positions[i * 2]!, y: positions[i * 2 + 1]! };
}

/** Radial distance from the origin of node index `i`. */
function radius(positions: Float32Array, i: number): number {
  const { x, y } = xy(positions, i);
  return Math.hypot(x, y);
}

/**
 * R connected to A, B, C (level 1); A connected to D (level 2); X isolated.
 * Degrees: R=3, A=2, B=1, C=1, D=1, X=0 → root is R (highest degree).
 */
function sampleGraph() {
  return buildRenderGraphBuffers({
    nodes: [
      { id: "R" },
      { id: "A" },
      { id: "B" },
      { id: "C" },
      { id: "D" },
      { id: "X" },
    ],
    edges: [
      { source: "R", target: "A" },
      { source: "R", target: "B" },
      { source: "R", target: "C" },
      { source: "A", target: "D" },
    ],
  });
}

describe("Radial layout — concentric rings around the highest-degree hub", () => {
  it("returns a valid node-order-keyed Float32Array of length 2*N with no NaN/Inf", () => {
    const graph = sampleGraph();
    const positions = computeRadialPositions(graph);
    expect(positions).toBeInstanceOf(Float32Array);
    expect(positions.length).toBe(graph.nodeIds.length * 2);
    for (const v of positions) expect(Number.isFinite(v)).toBe(true);
  });

  it("places the highest-degree root at the origin", () => {
    const graph = sampleGraph();
    const positions = computeRadialPositions(graph);
    const rootIdx = graph.idToIndex.get("R")!;
    expect(xy(positions, rootIdx)).toEqual({ x: 0, y: 0 });
    // No other node sits at the origin.
    for (let i = 0; i < graph.nodeIds.length; i++) {
      if (i === rootIdx) continue;
      expect(radius(positions, i)).toBeGreaterThan(0);
    }
  });

  it("places BFS level L on a ring of radius L*ringGap (shared per level)", () => {
    const graph = sampleGraph();
    const ringGap = 100;
    const positions = computeRadialPositions(graph, { ringGap });
    const r = (id: string) => radius(positions, graph.idToIndex.get(id)!);
    // Level 1 (A, B, C) all on the first ring.
    expect(r("A")).toBeCloseTo(ringGap, 4);
    expect(r("B")).toBeCloseTo(ringGap, 4);
    expect(r("C")).toBeCloseTo(ringGap, 4);
    // Level 2 (D) on the second ring.
    expect(r("D")).toBeCloseTo(2 * ringGap, 4);
  });

  it("spreads a level by even angle (distinct positions per node)", () => {
    const graph = sampleGraph();
    const positions = computeRadialPositions(graph);
    const idx = ["A", "B", "C"].map((id) => graph.idToIndex.get(id)!);
    const keys = idx.map((i) => `${xy(positions, i).x.toFixed(4)},${xy(positions, i).y.toFixed(4)}`);
    // Three siblings on the same ring → three distinct angular positions.
    expect(new Set(keys).size).toBe(3);
  });

  it("parks disconnected nodes on ONE outer ring beyond the deepest level", () => {
    const graph = sampleGraph();
    const ringGap = 100;
    const positions = computeRadialPositions(graph, { ringGap });
    // maxLevel = 2 (D); outer ring = 2*ringGap + ringGap = 3*ringGap.
    expect(radius(positions, graph.idToIndex.get("X")!)).toBeCloseTo(3 * ringGap, 4);
  });

  it("is deterministic — identical input yields byte-identical output", () => {
    const a = computeRadialPositions(sampleGraph());
    const b = computeRadialPositions(sampleGraph());
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("breaks a degree tie by node-id order (earliest node is the root)", () => {
    // Two nodes, one edge → both degree 1. The earlier node (p) wins the root.
    const graph = buildRenderGraphBuffers({
      nodes: [{ id: "p" }, { id: "q" }],
      edges: [{ source: "p", target: "q" }],
    });
    const positions = computeRadialPositions(graph);
    expect(xy(positions, graph.idToIndex.get("p")!)).toEqual({ x: 0, y: 0 });
    expect(radius(positions, graph.idToIndex.get("q")!)).toBeGreaterThan(0);
  });

  it("handles an edgeless graph — root at origin, the rest on the outer ring", () => {
    const graph = buildRenderGraphBuffers({
      nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
      edges: [],
    });
    const positions = computeRadialPositions(graph, { ringGap: 50 });
    // All degree 0 → root = a (index 0) at origin; b, c disconnected on the ring.
    expect(xy(positions, 0)).toEqual({ x: 0, y: 0 });
    expect(radius(positions, 1)).toBeCloseTo(50, 4);
    expect(radius(positions, 2)).toBeCloseTo(50, 4);
    for (const v of positions) expect(Number.isFinite(v)).toBe(true);
  });

  it("handles the empty graph (length 0)", () => {
    const graph = buildRenderGraphBuffers({ nodes: [], edges: [] });
    expect(computeRadialPositions(graph).length).toBe(0);
  });

  it("stays O(n+e): a large graph places every node finitely and fast", () => {
    const n = 5000;
    const nodes = Array.from({ length: n }, (_, i) => ({ id: `n${i}` }));
    // A path graph (n-1 edges): each node reachable, deep BFS chain.
    const edges = Array.from({ length: n - 1 }, (_, i) => ({ source: `n${i}`, target: `n${i + 1}` }));
    const graph = buildRenderGraphBuffers({ nodes, edges });
    const start = Date.now();
    const positions = computeRadialPositions(graph);
    expect(Date.now() - start).toBeLessThan(500); // O(n^2) would blow past this
    expect(positions.length).toBe(n * 2);
    for (const v of positions) expect(Number.isFinite(v)).toBe(true);
  });

  it("is invoked through the registry via resolveLayout('radial')", () => {
    const graph = sampleGraph();
    const fn = getLayout(RADIAL_LAYOUT_ID) as LayoutFn;
    const out = fn(graph);
    expect(out.length).toBe(graph.nodeIds.length * 2);
    expect(xy(out, graph.idToIndex.get("R")!)).toEqual({ x: 0, y: 0 });
  });
});
