import { describe, expect, it } from "vitest";

import {
  buildRenderGraphBuffers,
  computeTimeOrientedPositions,
  getLayout,
  hasLayout,
  listLayouts,
  TIME_ORIENTED_LAYOUT_ID,
  type LayoutFn,
} from "../src/index";

/** Read back the (x, y) of node index `i` from a node-order-keyed positions array. */
function xy(positions: Float32Array, i: number): { x: number; y: number } {
  return { x: positions[i * 2]!, y: positions[i * 2 + 1]! };
}

// Epoch-ms instants, intentionally out of chronological node order so X ordering
// can't be an accident of input order.
const T0 = Date.UTC(1887, 2, 1);
const T1 = Date.UTC(1891, 4, 4);
const T2 = Date.UTC(1893, 11, 1);
const T3 = Date.UTC(1894, 3, 5);

describe("Variant E — time-oriented layout", () => {
  it("returns a valid node-order-keyed Float32Array of length 2*N", () => {
    const positions = computeTimeOrientedPositions([T0, T1, T2]);
    expect(positions).toBeInstanceOf(Float32Array);
    expect(positions.length).toBe(3 * 2);
    for (const v of positions) expect(Number.isFinite(v)).toBe(true);
  });

  it("orders nodes by `t` on the X axis (older = smaller x, newer = larger x)", () => {
    // Node order is [T2, T0, T3, T1] — deliberately NOT chronological.
    const times = [T2, T0, T3, T1];
    const positions = computeTimeOrientedPositions(times);
    const x = times.map((_, i) => xy(positions, i).x);
    // Larger t ⇒ larger x: x of (T0) < x of (T1) < x of (T2) < x of (T3).
    const xByT = new Map(times.map((t, i) => [t, x[i]!]));
    expect(xByT.get(T0)!).toBeLessThan(xByT.get(T1)!);
    expect(xByT.get(T1)!).toBeLessThan(xByT.get(T2)!);
    expect(xByT.get(T2)!).toBeLessThan(xByT.get(T3)!);
  });

  it("normalizes the timed range into [-width/2, +width/2] (oldest left, newest right)", () => {
    const width = 1000;
    const positions = computeTimeOrientedPositions([T0, T3, T1], undefined, { width });
    // T0 is the oldest ⇒ left edge; T3 the newest ⇒ right edge.
    expect(xy(positions, 0).x).toBeCloseTo(-width / 2, 3); // T0
    expect(xy(positions, 1).x).toBeCloseTo(width / 2, 3); // T3
    // T1 sits strictly between the edges.
    expect(xy(positions, 2).x).toBeGreaterThan(-width / 2);
    expect(xy(positions, 2).x).toBeLessThan(width / 2);
  });

  it("places a single shared instant (span 0) at x = 0", () => {
    const positions = computeTimeOrientedPositions([T1, T1, T1]);
    for (let i = 0; i < 3; i++) expect(xy(positions, i).x).toBe(0);
  });

  it("parks UNTIMED nodes deterministically left of the timeline, keeping them finite", () => {
    const width = 1000;
    const untimedGap = 80;
    // index 1 + 3 are untimed (null / undefined / NaN).
    const positions = computeTimeOrientedPositions(
      [T0, null, T3, undefined, Number.NaN],
      undefined,
      { width, untimedGap },
    );
    const parkX = -width / 2 - untimedGap;
    expect(xy(positions, 1).x).toBe(parkX);
    expect(xy(positions, 3).x).toBe(parkX);
    expect(xy(positions, 4).x).toBe(parkX);
    // The parked rail is strictly left of the oldest timed node (T0 at -width/2).
    expect(parkX).toBeLessThan(xy(positions, 0).x);
    for (const v of positions) expect(Number.isFinite(v)).toBe(true);
  });

  it("bands nodes into type LANES on Y (like Variant A) when nodeTypes is given", () => {
    const times = [T0, T1, T2, T3];
    const types = ["Character", "Location", "Character", "Evidence"];
    const positions = computeTimeOrientedPositions(times, types);
    // Same type ⇒ same y band; different type ⇒ different band.
    expect(xy(positions, 0).y).toBe(xy(positions, 2).y); // both Character
    expect(xy(positions, 0).y).not.toBe(xy(positions, 1).y); // Character vs Location
    expect(xy(positions, 3).y).not.toBe(xy(positions, 0).y); // Evidence vs Character
  });

  it("collapses to a single lane (y = 0) when no types are given", () => {
    const positions = computeTimeOrientedPositions([T0, T1, T2]);
    for (let i = 0; i < 3; i++) expect(xy(positions, i).y).toBe(0);
  });

  it("is deterministic / reproducible", () => {
    const a = computeTimeOrientedPositions([T2, T0, T3], ["A", "B", "A"]);
    const b = computeTimeOrientedPositions([T2, T0, T3], ["A", "B", "A"]);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("handles the empty graph (length 0)", () => {
    expect(computeTimeOrientedPositions([]).length).toBe(0);
  });

  it("is registered and selectable via the registry", () => {
    expect(hasLayout(TIME_ORIENTED_LAYOUT_ID)).toBe(true);
    expect(TIME_ORIENTED_LAYOUT_ID).toBe("time-oriented");
    expect(listLayouts()).toContain("time-oriented");
  });

  it("is invoked through the registry via LayoutOptions.nodeTimes (+ nodeTypes)", () => {
    const graph = buildRenderGraphBuffers({
      nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
      edges: [],
    });
    const fn = getLayout(TIME_ORIENTED_LAYOUT_ID) as LayoutFn;
    const out = fn(graph, { nodeTimes: [T2, T0, T1], nodeTypes: ["X", "X", "X"] });
    expect(out.length).toBe(graph.nodeIds.length * 2);
    // Ordered by t on X: b (T0) < c (T1) < a (T2).
    expect(xy(out, 1).x).toBeLessThan(xy(out, 2).x);
    expect(xy(out, 2).x).toBeLessThan(xy(out, 0).x);
    // One type ⇒ one lane.
    expect(xy(out, 0).y).toBe(xy(out, 1).y);
  });
});
