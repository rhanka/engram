import { describe, expect, it } from "vitest";

import {
  buildRenderGraphBuffers,
  createLayoutEngine,
  DEFAULT_LAYOUT_ID,
  getLayout,
  GRID_LAYOUT_ID,
  hasLayout,
  listLayouts,
  RADIAL_LAYOUT_ID,
  registerLayout,
  resolveLayout,
  TYPED_LAYER_LAYOUT_ID,
  type LayoutFn,
  type PositionFrame,
} from "../src/index";

function sampleGraph() {
  return buildRenderGraphBuffers({
    nodes: [
      { id: "a", x: 1, y: 2 },
      { id: "b", x: 3, y: 4 },
      { id: "c", x: 5, y: 6 },
    ],
    edges: [{ source: "a", target: "b" }],
  });
}

describe("layout registry — register / lookup / default", () => {
  it("ships the force (default) and typed-layer layouts registered", () => {
    expect(hasLayout(DEFAULT_LAYOUT_ID)).toBe(true);
    expect(hasLayout(TYPED_LAYER_LAYOUT_ID)).toBe(true);
    expect(DEFAULT_LAYOUT_ID).toBe("force");
    const ids = listLayouts();
    expect(ids).toContain("force");
    expect(ids).toContain("typed-layer");
  });

  it("ships the Lot-2 radial + grid layouts registered and resolvable", () => {
    expect(RADIAL_LAYOUT_ID).toBe("radial");
    expect(GRID_LAYOUT_ID).toBe("grid");
    expect(hasLayout(RADIAL_LAYOUT_ID)).toBe(true);
    expect(hasLayout(GRID_LAYOUT_ID)).toBe(true);
    expect(listLayouts()).toEqual(expect.arrayContaining(["radial", "grid"]));
    // resolveLayout returns the registered engines (not the default fallback).
    expect(resolveLayout(RADIAL_LAYOUT_ID)).toBe(getLayout(RADIAL_LAYOUT_ID));
    expect(resolveLayout(GRID_LAYOUT_ID)).toBe(getLayout(GRID_LAYOUT_ID));
    // Both yield a valid 2*N buffer for a sample graph.
    const graph = sampleGraph();
    for (const id of [RADIAL_LAYOUT_ID, GRID_LAYOUT_ID]) {
      const out = resolveLayout(id)(graph);
      expect(out).toBeInstanceOf(Float32Array);
      expect(out.length).toBe(graph.nodeIds.length * 2);
      for (const v of out) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("default ('force') is a passthrough of the baked positions", () => {
    const graph = sampleGraph();
    const fn = getLayout(DEFAULT_LAYOUT_ID) as LayoutFn;
    const out = fn(graph);
    // Same values as the baked positions...
    expect(Array.from(out)).toEqual(Array.from(graph.positions));
    // ...but a fresh copy (never the same buffer the renderer holds).
    expect(out).not.toBe(graph.positions);
    expect(out).toBeInstanceOf(Float32Array);
    expect(out.length).toBe(graph.nodeIds.length * 2);
  });

  it("registers and looks up a custom layout", () => {
    const custom: LayoutFn = (graph) => new Float32Array(graph.nodeIds.length * 2).fill(7);
    registerLayout("test-fill-7", custom);
    expect(hasLayout("test-fill-7")).toBe(true);
    expect(getLayout("test-fill-7")).toBe(custom);
    const out = getLayout("test-fill-7")!(sampleGraph());
    expect(Array.from(out)).toEqual([7, 7, 7, 7, 7, 7]);
  });

  it("resolveLayout falls back to the default for an unknown / omitted id", () => {
    expect(resolveLayout("does-not-exist")).toBe(getLayout(DEFAULT_LAYOUT_ID));
    expect(resolveLayout()).toBe(getLayout(DEFAULT_LAYOUT_ID));
    expect(resolveLayout(TYPED_LAYER_LAYOUT_ID)).toBe(getLayout(TYPED_LAYER_LAYOUT_ID));
  });

  it("createLayoutEngine wraps a registered layout as a single-frame LayoutEngine", () => {
    const graph = sampleGraph();
    const engine = createLayoutEngine(DEFAULT_LAYOUT_ID);
    const frames = [...(engine.run(graph) as Iterable<PositionFrame>)];
    expect(frames).toHaveLength(1);
    expect(frames[0]!.positions).toBeInstanceOf(Float32Array);
    expect(Array.from(frames[0]!.positions)).toEqual(Array.from(graph.positions));
    expect(frames[0]!.tick).toBe(0);
  });

  it("registerLayout rejects an empty id or a non-function", () => {
    expect(() => registerLayout("", (() => new Float32Array()) as LayoutFn)).toThrow();
    // @ts-expect-error — deliberately wrong type for the runtime guard.
    expect(() => registerLayout("bad", 123)).toThrow();
  });
});
