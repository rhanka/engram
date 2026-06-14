import { afterEach, describe, expect, it } from "vitest";

import {
  attachLayoutPositions,
  computeLayout,
  defaultLayoutIterations,
  fastLayoutEnabled,
  type LayoutGraphEdge,
  type LayoutGraphNode,
} from "../src/graph-layout.js";

/** A small ring + a hub, enough to exercise repulsion, springs and the tree. */
function sampleGraph(count = 30): {
  nodes: LayoutGraphNode[];
  edges: LayoutGraphEdge[];
} {
  const nodes: LayoutGraphNode[] = Array.from({ length: count }, (_, i) => ({
    id: `n${i}`,
  }));
  const edges: LayoutGraphEdge[] = [];
  for (let i = 1; i < count; i++) {
    edges.push({ source: `n${i}`, target: "n0" }); // star around n0
    if (i > 1) edges.push({ source: `n${i}`, target: `n${i - 1}` }); // + a chain
  }
  return { nodes, edges };
}

describe("computeLayout (Barnes-Hut force layout)", () => {
  it("returns one finite position per node, in input order", () => {
    const { nodes, edges } = sampleGraph(40);
    const out = computeLayout(nodes, edges, { iterations: 120 });
    expect(out).toHaveLength(40);
    out.forEach((p, i) => {
      expect(p.id).toBe(`n${i}`);
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    });
  });

  it("is deterministic: identical input → identical output", () => {
    const { nodes, edges } = sampleGraph(50);
    const a = computeLayout(nodes, edges, { iterations: 150 });
    const b = computeLayout(nodes, edges, { iterations: 150 });
    expect(b).toEqual(a);
  });

  it("spreads nodes out (not all collapsed onto one point)", () => {
    const { nodes, edges } = sampleGraph(40);
    const out = computeLayout(nodes, edges, { iterations: 200 });
    const xs = out.map((p) => p.x);
    const ys = out.map((p) => p.y);
    const spanX = Math.max(...xs) - Math.min(...xs);
    const spanY = Math.max(...ys) - Math.min(...ys);
    expect(spanX).toBeGreaterThan(10);
    expect(spanY).toBeGreaterThan(10);
  });

  it("holds nodes with finite fx/fy fixed at those coordinates", () => {
    const nodes: LayoutGraphNode[] = [
      { id: "a", fx: 123, fy: -45 },
      { id: "b" },
      { id: "c", fx: 0, fy: 0 },
    ];
    const edges: LayoutGraphEdge[] = [
      { source: "a", target: "b" },
      { source: "b", target: "c" },
    ];
    const out = computeLayout(nodes, edges, { iterations: 100 });
    const a = out.find((p) => p.id === "a")!;
    const c = out.find((p) => p.id === "c")!;
    expect(a.x).toBe(123);
    expect(a.y).toBe(-45);
    expect(c.x).toBe(0);
    expect(c.y).toBe(0);
  });

  it("tolerates coincident nodes without producing NaN / infinite loops", () => {
    // Two bodies seeded at the exact same point stress the quadtree split guard.
    const nodes: LayoutGraphNode[] = [
      { id: "a", fx: 5, fy: 5 },
      { id: "b", fx: 5, fy: 5 },
      { id: "c" },
    ];
    const out = computeLayout(nodes, [{ source: "a", target: "c" }], { iterations: 60 });
    out.forEach((p) => {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    });
  });

  it("returns [] for an empty graph", () => {
    expect(computeLayout([], [], {})).toEqual([]);
  });

  it("scales to a few thousand nodes in well under the test timeout", () => {
    const count = 3000;
    const nodes: LayoutGraphNode[] = Array.from({ length: count }, (_, i) => ({ id: `n${i}` }));
    const edges: LayoutGraphEdge[] = [];
    for (let i = 1; i < count; i++) edges.push({ source: `n${i}`, target: `n${i % 50}` });
    const out = computeLayout(nodes, edges, { iterations: 50 });
    expect(out).toHaveLength(count);
    expect(out.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });
});

describe("attachLayoutPositions", () => {
  it("writes x/y AND pins fx/fy (fx===x, fy===y) on every node", () => {
    const scene = {
      nodes: [{ id: "a" }, { id: "b" }, { id: "c" }] as LayoutGraphNode[],
      edges: [
        { source: "a", target: "b" },
        { source: "b", target: "c" },
      ] as LayoutGraphEdge[],
    };
    const out = attachLayoutPositions(scene, { iterations: 80 });
    expect(out).toBe(scene); // mutates in place
    for (const node of out.nodes) {
      expect(Number.isFinite(node.x as number)).toBe(true);
      expect(Number.isFinite(node.y as number)).toBe(true);
      expect(node.fx).toBe(node.x);
      expect(node.fy).toBe(node.y);
    }
  });

  it("no-ops on an empty / missing node list", () => {
    const empty = { nodes: [] as LayoutGraphNode[], edges: [] as LayoutGraphEdge[] };
    expect(attachLayoutPositions(empty)).toBe(empty);
  });
});

// ---------------------------------------------------------------------------
// WP1: adaptive iterations + env opt-in (measured highest-leverage layout win).
// ---------------------------------------------------------------------------
function ringGraph(count = 40): { nodes: LayoutGraphNode[]; edges: LayoutGraphEdge[] } {
  const nodes: LayoutGraphNode[] = Array.from({ length: count }, (_, i) => ({ id: `n${i}` }));
  const edges: LayoutGraphEdge[] = [];
  for (let i = 1; i < count; i++) {
    edges.push({ source: `n${i}`, target: "n0" });
    if (i > 1) edges.push({ source: `n${i}`, target: `n${i - 1}` });
  }
  return { nodes, edges };
}

describe("defaultLayoutIterations", () => {
  it("keeps the full 300 ticks for small graphs and tapers for large ones", () => {
    expect(defaultLayoutIterations(50)).toBe(300);
    expect(defaultLayoutIterations(400)).toBe(300);
    expect(defaultLayoutIterations(100000)).toBe(90);
    // Monotone non-increasing across the curve.
    let prev = Infinity;
    for (const n of [400, 1000, 2092, 5000, 10000, 20000, 50000]) {
      const it = defaultLayoutIterations(n);
      expect(it).toBeLessThanOrEqual(prev);
      expect(it).toBeGreaterThanOrEqual(90);
      prev = it;
    }
  });
});

describe("fastLayoutEnabled / env opt-in", () => {
  const prev = process.env.GRAPHIFY_FAST_LAYOUT;
  afterEach(() => {
    if (prev === undefined) delete process.env.GRAPHIFY_FAST_LAYOUT;
    else process.env.GRAPHIFY_FAST_LAYOUT = prev;
  });

  it("is OFF by default and ON for truthy env values", () => {
    delete process.env.GRAPHIFY_FAST_LAYOUT;
    expect(fastLayoutEnabled()).toBe(false);
    for (const v of ["1", "true", "on", "YES"]) {
      process.env.GRAPHIFY_FAST_LAYOUT = v;
      expect(fastLayoutEnabled()).toBe(true);
    }
    process.env.GRAPHIFY_FAST_LAYOUT = "0";
    expect(fastLayoutEnabled()).toBe(false);
  });

  it("attachLayoutPositions still pins fx/fy under the env opt-in", () => {
    process.env.GRAPHIFY_FAST_LAYOUT = "1";
    const scene = {
      nodes: [{ id: "a" }, { id: "b" }, { id: "c" }] as LayoutGraphNode[],
      edges: [{ source: "a", target: "b" }] as LayoutGraphEdge[],
    };
    const out = attachLayoutPositions(scene);
    for (const node of out.nodes) {
      expect(Number.isFinite(node.x as number)).toBe(true);
      expect(node.fx).toBe(node.x);
      expect(node.fy).toBe(node.y);
    }
  });

  it("an explicit iterations is never overridden by the env opt-in", () => {
    const { nodes, edges } = ringGraph(20);
    // Baseline: explicit 50-iter layout with the env OFF.
    delete process.env.GRAPHIFY_FAST_LAYOUT;
    const baseline = computeLayout(nodes, edges, { iterations: 50 });
    // With the env ON but iterations pinned explicitly, the pinned value wins, so
    // the result matches the baseline exactly (no adaptive substitution).
    process.env.GRAPHIFY_FAST_LAYOUT = "1";
    const scene = { nodes: nodes.map((n) => ({ ...n })), edges };
    attachLayoutPositions(scene, { iterations: 50 });
    scene.nodes.forEach((node, i) => {
      expect(node.x).toBeCloseTo(baseline[i]!.x, 6);
      expect(node.y).toBeCloseTo(baseline[i]!.y, 6);
    });
  });

  it("applies the adaptive (reduced) iteration budget under the env opt-in", () => {
    // For a graph large enough that defaultLayoutIterations() < 300, the env-on
    // layout differs from the flat-300 layout (fewer ticks => earlier-stop
    // positions), proving the adaptive budget is actually applied.
    const count = 600; // defaultLayoutIterations(600) < 300
    expect(defaultLayoutIterations(count)).toBeLessThan(300);
    const nodes: LayoutGraphNode[] = Array.from({ length: count }, (_, i) => ({ id: `n${i}` }));
    const edges: LayoutGraphEdge[] = [];
    for (let i = 1; i < count; i++) edges.push({ source: `n${i}`, target: `n${i % 30}` });

    delete process.env.GRAPHIFY_FAST_LAYOUT;
    const sceneDefault = { nodes: nodes.map((n) => ({ ...n })), edges };
    attachLayoutPositions(sceneDefault); // 300 ticks

    process.env.GRAPHIFY_FAST_LAYOUT = "1";
    const sceneFast = { nodes: nodes.map((n) => ({ ...n })), edges };
    attachLayoutPositions(sceneFast); // adaptive ticks

    // Both finite + pinned; the adaptive layout is NOT identical to the 300-tick one.
    let differs = false;
    sceneFast.nodes.forEach((node, i) => {
      expect(Number.isFinite(node.x as number)).toBe(true);
      expect(node.fx).toBe(node.x);
      if (Math.abs((node.x as number) - (sceneDefault.nodes[i]!.x as number)) > 1e-6) differs = true;
    });
    expect(differs).toBe(true);
  });
});
