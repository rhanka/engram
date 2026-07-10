import { describe, expect, it } from "vitest";

import {
  buildRenderGraphBuffers,
  computeGridPositions,
  getLayout,
  GRID_LAYOUT_ID,
  type LayoutFn,
} from "../src/index";

/** Read back the (x, y) of node index `i` from a node-order-keyed positions array. */
function xy(positions: Float32Array, i: number): { x: number; y: number } {
  return { x: positions[i * 2]!, y: positions[i * 2 + 1]! };
}

/** A graph of `count` bare nodes (grid ignores edges — only the count matters). */
function nodesGraph(count: number) {
  return buildRenderGraphBuffers({
    nodes: Array.from({ length: count }, (_, i) => ({ id: `n${i}` })),
    edges: [],
  });
}

describe("Grid layout — regular ceil(√n) grid centred on the origin", () => {
  it("returns a valid node-order-keyed Float32Array of length 2*N with no NaN/Inf", () => {
    const graph = nodesGraph(9);
    const positions = computeGridPositions(graph);
    expect(positions).toBeInstanceOf(Float32Array);
    expect(positions.length).toBe(graph.nodeIds.length * 2);
    for (const v of positions) expect(Number.isFinite(v)).toBe(true);
  });

  it("places nodes on a ceil(√n)-column grid in node-id order", () => {
    // n = 9 → 3 cols × 3 rows, gridGap 60, centred → offsets (60, 60).
    const positions = computeGridPositions(nodesGraph(9), { gridGap: 60 });
    expect(xy(positions, 0)).toEqual({ x: -60, y: -60 }); // col 0, row 0
    expect(xy(positions, 1)).toEqual({ x: 0, y: -60 }); // col 1, row 0
    expect(xy(positions, 2)).toEqual({ x: 60, y: -60 }); // col 2, row 0
    expect(xy(positions, 4)).toEqual({ x: 0, y: 0 }); // col 1, row 1 — the centre
    expect(xy(positions, 8)).toEqual({ x: 60, y: 60 }); // col 2, row 2
  });

  it("spaces adjacent cells by exactly gridGap on both axes", () => {
    const positions = computeGridPositions(nodesGraph(9), { gridGap: 42 });
    // Horizontal neighbours (0 → 1) differ by gridGap in x, share y.
    expect(xy(positions, 1).x - xy(positions, 0).x).toBeCloseTo(42, 4);
    expect(xy(positions, 1).y).toBeCloseTo(xy(positions, 0).y, 4);
    // Vertical neighbours (0 → 3, one full row down) differ by gridGap in y.
    expect(xy(positions, 3).y - xy(positions, 0).y).toBeCloseTo(42, 4);
    expect(xy(positions, 3).x).toBeCloseTo(xy(positions, 0).x, 4);
  });

  it("centres the full grid bounding box on the origin", () => {
    const positions = computeGridPositions(nodesGraph(9), { gridGap: 60 });
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < positions.length; i += 2) {
      minX = Math.min(minX, positions[i]!);
      maxX = Math.max(maxX, positions[i]!);
      minY = Math.min(minY, positions[i + 1]!);
      maxY = Math.max(maxY, positions[i + 1]!);
    }
    expect(minX + maxX).toBeCloseTo(0, 4);
    expect(minY + maxY).toBeCloseTo(0, 4);
  });

  it("handles a non-square count (partial last row)", () => {
    // n = 5 → cols = ceil(√5) = 3, rows = ceil(5/3) = 2 → offsets (60, 30).
    const positions = computeGridPositions(nodesGraph(5), { gridGap: 60 });
    expect(xy(positions, 0)).toEqual({ x: -60, y: -30 }); // col 0, row 0
    expect(xy(positions, 3)).toEqual({ x: -60, y: 30 }); // col 0, row 1
    expect(xy(positions, 4)).toEqual({ x: 0, y: 30 }); // col 1, row 1
    for (const v of positions) expect(Number.isFinite(v)).toBe(true);
  });

  it("is deterministic — identical input yields byte-identical output", () => {
    const a = computeGridPositions(nodesGraph(17));
    const b = computeGridPositions(nodesGraph(17));
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("handles the empty graph (length 0)", () => {
    expect(computeGridPositions(nodesGraph(0)).length).toBe(0);
  });

  it("handles a single node at the origin", () => {
    expect(Array.from(computeGridPositions(nodesGraph(1)))).toEqual([0, 0]);
  });

  it("stays O(n): a large graph places every node finitely and fast", () => {
    const n = 10000;
    const graph = nodesGraph(n);
    const start = Date.now();
    const positions = computeGridPositions(graph);
    expect(Date.now() - start).toBeLessThan(200); // O(n^2) would blow past this
    expect(positions.length).toBe(n * 2);
    for (const v of positions) expect(Number.isFinite(v)).toBe(true);
  });

  it("is invoked through the registry via resolveLayout('grid')", () => {
    const graph = nodesGraph(4);
    const fn = getLayout(GRID_LAYOUT_ID) as LayoutFn;
    const out = fn(graph);
    expect(out.length).toBe(graph.nodeIds.length * 2);
    for (const v of out) expect(Number.isFinite(v)).toBe(true);
  });
});
