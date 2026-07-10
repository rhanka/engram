import { describe, expect, it } from "vitest";

import {
  buildRenderGraphBuffers,
  computeMetroPositions,
  getLayout,
  METRO_LAYOUT_ID,
  type LayoutFn,
} from "../src/index";

/** Read back the (x, y) of node index `i` from a node-order-keyed positions array. */
function xy(positions: Float32Array, i: number): { x: number; y: number } {
  return { x: positions[i * 2]!, y: positions[i * 2 + 1]! };
}

/** A star: n0 is the hub, n1..n(count-1) are leaves — one BFS lane of leaves. */
function starGraph(count: number) {
  return buildRenderGraphBuffers({
    nodes: Array.from({ length: count }, (_, i) => ({ id: `n${i}` })),
    edges: Array.from({ length: count - 1 }, (_, i) => ({ source: "n0", target: `n${i + 1}` })),
  });
}

describe("Metro layout — BFS lanes, grid-snapped nodes", () => {
  it("returns a valid node-order-keyed Float32Array of length 2*N with no NaN/Inf", () => {
    const graph = starGraph(6);
    const positions = computeMetroPositions(graph);
    expect(positions).toBeInstanceOf(Float32Array);
    expect(positions.length).toBe(graph.nodeIds.length * 2);
    for (const v of positions) expect(Number.isFinite(v)).toBe(true);
  });

  it("puts the highest-degree hub on lane 0 and its neighbours on lane 1", () => {
    const graph = starGraph(4); // n0 hub (deg 3), n1..n3 leaves (deg 1)
    const positions = computeMetroPositions(graph, { laneGap: 100 });
    // Hub is the sole node on lane 0 (y = 0), centred (x = 0).
    expect(xy(positions, 0)).toEqual({ x: 0, y: 0 });
    // The three leaves share lane 1 (y = laneGap), spread across grid columns.
    for (let i = 1; i <= 3; i++) expect(xy(positions, i).y).toBeCloseTo(100, 4);
    const leafXs = [xy(positions, 1).x, xy(positions, 2).x, xy(positions, 3).x];
    expect(new Set(leafXs).size).toBe(3); // distinct columns, no collisions
  });

  it("snaps within a lane to even grid columns centred on the origin", () => {
    const graph = starGraph(4);
    const positions = computeMetroPositions(graph, { colGap: 50 });
    const leafXs = [xy(positions, 1).x, xy(positions, 2).x, xy(positions, 3).x].sort((a, b) => a - b);
    // 3 leaves → columns (-50, 0, 50): centred, gridGap-spaced.
    expect(leafXs).toEqual([-50, 0, 50]);
  });

  it("parks disconnected nodes on an extra lane below the deepest level", () => {
    const graph = buildRenderGraphBuffers({
      nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
      edges: [{ source: "a", target: "b" }], // c is disconnected
    });
    const positions = computeMetroPositions(graph, { laneGap: 100 });
    // a (hub) lane 0, b lane 1, c parked on lane 2 (maxLevel 1 + 1).
    expect(xy(positions, 2).y).toBeCloseTo(200, 4);
    for (const v of positions) expect(Number.isFinite(v)).toBe(true);
  });

  it("is deterministic — identical input yields byte-identical output", () => {
    const a = computeMetroPositions(starGraph(12));
    const b = computeMetroPositions(starGraph(12));
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("handles the empty graph (length 0) and a single node at the origin", () => {
    expect(computeMetroPositions(starGraph(0)).length).toBe(0);
    const single = buildRenderGraphBuffers({ nodes: [{ id: "a" }], edges: [] });
    expect(Array.from(computeMetroPositions(single))).toEqual([0, 0]);
  });

  it("stays O(n+e): a large graph places every node finitely and fast", () => {
    const n = 8000;
    const graph = buildRenderGraphBuffers({
      nodes: Array.from({ length: n }, (_, i) => ({ id: `n${i}` })),
      edges: Array.from({ length: n - 1 }, (_, i) => ({ source: `n${i}`, target: `n${i + 1}` })),
    });
    const start = Date.now();
    const positions = computeMetroPositions(graph);
    expect(Date.now() - start).toBeLessThan(300);
    expect(positions.length).toBe(n * 2);
    for (const v of positions) expect(Number.isFinite(v)).toBe(true);
  });

  it("is invoked through the registry via resolveLayout('metro')", () => {
    const graph = starGraph(4);
    const fn = getLayout(METRO_LAYOUT_ID) as LayoutFn;
    const out = fn(graph);
    expect(out.length).toBe(graph.nodeIds.length * 2);
    for (const v of out) expect(Number.isFinite(v)).toBe(true);
  });
});
