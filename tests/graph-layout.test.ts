import { describe, expect, it } from "vitest";

import {
  attachLayoutPositions,
  computeLayout,
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
