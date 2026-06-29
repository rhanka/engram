import { describe, expect, it } from "vitest";

import {
  buildRenderGraphBuffers,
  computeTypedLayerPositions,
  getLayout,
  TYPED_LAYER_LAYOUT_ID,
  type LayoutFn,
} from "../src/index";

/** Read back the (x, y) of node index `i` from a node-order-keyed positions array. */
function xy(positions: Float32Array, i: number): { x: number; y: number } {
  return { x: positions[i * 2]!, y: positions[i * 2 + 1]! };
}

describe("Variant A — typed-layer / swimlane layout", () => {
  // 6 nodes across 3 types, interleaved so banding can't be an accident of order.
  const nodeTypes = ["Character", "Location", "Character", "Evidence", "Location", "Character"];

  it("returns a valid node-order-keyed Float32Array of length 2*N", () => {
    const positions = computeTypedLayerPositions(nodeTypes);
    expect(positions).toBeInstanceOf(Float32Array);
    expect(positions.length).toBe(nodeTypes.length * 2);
    for (const v of positions) expect(Number.isFinite(v)).toBe(true);
  });

  it("bands every node of a type into ONE shared y-lane", () => {
    const positions = computeTypedLayerPositions(nodeTypes);
    const yByType = new Map<string, number[]>();
    nodeTypes.forEach((type, i) => {
      const arr = yByType.get(type) ?? [];
      arr.push(xy(positions, i).y);
      yByType.set(type, arr);
    });
    // Within each type, every node shares the exact same y (one band).
    for (const [, ys] of yByType) {
      const first = ys[0]!;
      for (const y of ys) expect(y).toBe(first);
    }
  });

  it("separates distinct type bands vertically (lanes do not overlap)", () => {
    const positions = computeTypedLayerPositions(nodeTypes, { laneGap: 100 });
    const laneY = (type: string) => xy(positions, nodeTypes.indexOf(type)).y;
    const yChar = laneY("Character");
    const yLoc = laneY("Location");
    const yEvid = laneY("Evidence");
    // Three distinct bands.
    expect(new Set([yChar, yLoc, yEvid]).size).toBe(3);
    // Adjacent lanes are separated by at least one laneGap.
    const sorted = [yChar, yLoc, yEvid].sort((a, b) => a - b);
    expect(sorted[1]! - sorted[0]!).toBeGreaterThanOrEqual(100);
    expect(sorted[2]! - sorted[1]!).toBeGreaterThanOrEqual(100);
  });

  it("spreads nodes horizontally WITHIN a lane (distinct x per node)", () => {
    const positions = computeTypedLayerPositions(nodeTypes, { nodeGap: 50 });
    // The three Character nodes (indices 0, 2, 5) share a y but have distinct x.
    const cIdx = [0, 2, 5];
    const xs = cIdx.map((i) => xy(positions, i).x);
    expect(new Set(xs).size).toBe(3);
    const ys = cIdx.map((i) => xy(positions, i).y);
    expect(new Set(ys).size).toBe(1);
  });

  it("orders lanes deterministically (alpha by type) and is reproducible", () => {
    const a = computeTypedLayerPositions(nodeTypes);
    const b = computeTypedLayerPositions(nodeTypes);
    expect(Array.from(a)).toEqual(Array.from(b));
    // Character < Evidence < Location alphabetically ⇒ ascending y bands.
    const yOf = (type: string) => xy(a, nodeTypes.indexOf(type)).y;
    expect(yOf("Character")).toBeLessThan(yOf("Evidence"));
    expect(yOf("Evidence")).toBeLessThan(yOf("Location"));
  });

  it("routes nullish / blank types into a single untyped lane placed last", () => {
    const mixed = ["Character", null, "  ", undefined, "Character"];
    const positions = computeTypedLayerPositions(mixed);
    const yUntyped = [1, 2, 3].map((i) => xy(positions, i).y);
    // Untyped nodes share one lane...
    expect(new Set(yUntyped).size).toBe(1);
    // ...separated from the Character lane.
    expect(yUntyped[0]).not.toBe(xy(positions, 0).y);
  });

  it("handles the empty graph (length 0)", () => {
    expect(computeTypedLayerPositions([]).length).toBe(0);
  });

  it("is invoked through the registry via LayoutOptions.nodeTypes", () => {
    const graph = buildRenderGraphBuffers({
      nodes: [
        { id: "a" },
        { id: "b" },
        { id: "c" },
      ],
      edges: [],
    });
    const fn = getLayout(TYPED_LAYER_LAYOUT_ID) as LayoutFn;
    const out = fn(graph, { nodeTypes: ["X", "Y", "X"] });
    expect(out.length).toBe(graph.nodeIds.length * 2);
    // Same type (a, c) ⇒ same y band; different type (b) ⇒ different band.
    expect(xy(out, 0).y).toBe(xy(out, 2).y);
    expect(xy(out, 1).y).not.toBe(xy(out, 0).y);
  });
});
