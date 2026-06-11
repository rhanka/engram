import { describe, expect, it } from "vitest";

import {
  buildConnectedDimStyle,
  buildGraphRendererPayload,
  densityScale,
  findNearestEdge,
  findNearestNode,
  findNearestNodeId,
  interpolateMergeStyle,
  interpolateMergePositions,
} from "../lib/graphRendererPayload.js";

// --- Item 1: density-aware base node size ---
describe("densityScale", () => {
  it("is 1 at or below the reference node count (1000 confirmed good)", () => {
    expect(densityScale(1)).toBe(1);
    expect(densityScale(500)).toBe(1);
    expect(densityScale(1000)).toBe(1);
  });

  it("shrinks the base radius as node count grows beyond the reference", () => {
    expect(densityScale(2000)).toBeLessThan(1);
    // sqrt(1000/4000) ~= 0.5
    expect(densityScale(4000)).toBeCloseTo(0.5, 5);
    // monotonically decreasing
    expect(densityScale(5000)).toBeLessThan(densityScale(2000));
  });

  it("never drops below the MIN floor (0.45)", () => {
    expect(densityScale(100000)).toBe(0.45);
    expect(densityScale(1e9)).toBe(0.45);
  });

  it("scales the effective node sizes in the payload while preserving the degree spread", () => {
    const dense = Array.from({ length: 4000 }, (_, i) => ({
      id: `n${i}`,
      label: `N${i}`,
      x: i,
      y: 0,
      weight: 1,
    }));
    const sparse = dense.slice(0, 500);
    const densePayload = buildGraphRendererPayload({ nodes: dense, edges: [] }, { nodeRadius: 3 });
    const sparsePayload = buildGraphRendererPayload({ nodes: sparse, edges: [] }, { nodeRadius: 3 });

    // Same weight, but the dense graph renders smaller base nodes.
    expect(densePayload.style.nodeSizes[0]).toBeLessThan(sparsePayload.style.nodeSizes[0]);
    // The ratio matches the density curve (sparse=1, dense=0.5).
    expect(densePayload.style.nodeSizes[0] / sparsePayload.style.nodeSizes[0]).toBeCloseTo(0.5, 5);
  });
});

// --- Item 2: boxed-label degree threshold ---
// Mirrors the degree-count + threshold logic GraphCanvas uses to pick which
// god-nodes get a permanent boxed label (degree >= ratio * maxDegree).
function labelSetFromPayload(payload, ratio = 0.15) {
  const graph = payload.renderGraph;
  const nodeCount = graph.nodeIds.length;
  const degrees = new Array(nodeCount).fill(0);
  const edgeCount = graph.edges.length / 2;
  for (let e = 0; e < edgeCount; e += 1) {
    degrees[graph.edges[e * 2]] += 1;
    degrees[graph.edges[e * 2 + 1]] += 1;
  }
  const max = Math.max(1, ...degrees);
  const threshold = ratio * max;
  const ids = [];
  for (let i = 0; i < nodeCount; i += 1) {
    if (degrees[i] >= threshold && degrees[i] > 0) ids.push(graph.nodeIds[i]);
  }
  return ids;
}

describe("boxed-label degree threshold (item 2)", () => {
  it("selects only nodes whose degree >= 0.15 * maxDegree", () => {
    // Hub "h" has degree 10; leaves l0..l9 each degree 1; "m" degree 2.
    const nodes = [
      { id: "h", label: "Hub", x: 0, y: 0, weight: 1 },
      { id: "m", label: "Mid", x: 50, y: 0, weight: 1 },
    ];
    const edges = [{ source: "h", target: "m" }];
    for (let i = 0; i < 9; i += 1) {
      nodes.push({ id: `l${i}`, label: `Leaf${i}`, x: i, y: 50, weight: 1 });
      edges.push({ source: "h", target: `l${i}` });
    }
    // give "m" a second edge so its degree is 2
    nodes.push({ id: "x", label: "X", x: 80, y: 50, weight: 1 });
    edges.push({ source: "m", target: "x" });

    const payload = buildGraphRendererPayload({ nodes, edges }, { nodeRadius: 3 });
    const labelled = labelSetFromPayload(payload, 0.15);

    // maxDegree = 10 (hub). threshold = 1.5 → only degree >= 2 qualifies: h (10), m (2).
    expect(labelled).toContain("h");
    expect(labelled).toContain("m");
    // leaves (degree 1) and x (degree 1) are below threshold → no label
    expect(labelled).not.toContain("l0");
    expect(labelled).not.toContain("x");
  });
});

// --- helpers for connected-dim tests ---
function makeTriangleScene() {
  return {
    nodes: [
      { id: "a", label: "Alpha", x: 0, y: 0, weight: 1, group: "G1" },
      { id: "b", label: "Beta", x: 100, y: 0, weight: 1, group: "G1" },
      { id: "c", label: "Gamma", x: 50, y: 80, weight: 1, group: "G2" },
      { id: "d", label: "Delta", x: -50, y: 80, weight: 1, group: "G2" },
    ],
    edges: [
      { source: "a", target: "b", relation: "links" },
      { source: "a", target: "c", relation: "links" },
      { source: "b", target: "d", relation: "links" },
    ],
    stats: { nodeCount: 4, edgeCount: 3, communityCount: 2 },
  };
}

describe("graphRendererPayload", () => {
  it("maps a studio scene into @sentropic/graph buffers with selection styling", () => {
    const payload = buildGraphRendererPayload(
      {
        nodes: [
          { id: "a", label: "Alpha", x: 0, y: 0, weight: 4, group: "Case", shape: "diamond" },
          { id: "b", label: "Beta", fx: 10, fy: 0, weight: 1, group: "Evidence", shape: "triangle" },
          { id: "c", label: "Gamma", weight: 1, group: "Evidence" },
        ],
        edges: [
          { source: "a", target: "b", relation: "appears_in", dash: "solid" },
          { source: "missing", target: "b", relation: "dangling", dash: "dashed" },
        ],
        stats: { nodeCount: 3, edgeCount: 2, weakEdgeCount: 0, communityCount: 2 },
      },
      { selectedIds: ["b"], focusId: "a", nodeRadius: 3 },
    );

    expect(payload.renderGraph.nodeIds).toEqual(["a", "b", "c"]);
    expect([...payload.renderGraph.edges]).toEqual([0, 1]);
    expect(payload.renderGraph.droppedEdges).toBe(1);
    expect([...payload.renderGraph.positions.slice(0, 4)]).toEqual([0, 0, 10, 0]);
    expect(payload.style.nodeSizes[0]).toBeGreaterThan(payload.style.nodeSizes[1]);
    expect([...payload.style.nodeShapes]).toEqual([1, 6, 0]);
    expect([...payload.style.nodeColors.slice(0, 4)]).toEqual([239, 68, 68, 255]);
    expect([...payload.style.nodeColors.slice(4, 8)]).toEqual([37, 99, 235, 255]);
  });

  it("finds the closest node in world coordinates", () => {
    const payload = buildGraphRendererPayload({
      nodes: [
        { id: "a", label: "Alpha", x: 0, y: 0, weight: 1 },
        { id: "b", label: "Beta", x: 100, y: 0, weight: 1 },
      ],
      edges: [],
      stats: { nodeCount: 2, edgeCount: 0, weakEdgeCount: 0, communityCount: 1 },
    });

    expect(findNearestNodeId(payload, 102, 1, 12)).toBe("b");
    expect(findNearestNodeId(payload, 50, 0, 12)).toBeNull();
  });

  it("findNearestNode reports the hit id, distance, and drawn radius (item 1.3)", () => {
    const payload = buildGraphRendererPayload({
      nodes: [
        { id: "a", label: "Alpha", x: 0, y: 0, weight: 1 },
        { id: "b", label: "Beta", x: 100, y: 0, weight: 1 },
      ],
      edges: [],
      stats: { nodeCount: 2, edgeCount: 0, weakEdgeCount: 0, communityCount: 1 },
    });

    const hit = findNearestNode(payload, 103, 4, 12);
    expect(hit.id).toBe("b");
    expect(hit.distance).toBeCloseTo(5, 6); // hypot(3, 4)
    expect(hit.radius).toBeGreaterThan(0);
    // Out of every node's pick zone → null (parity with findNearestNodeId).
    expect(findNearestNode(payload, 50, 0, 12)).toBeNull();
  });

  it("finds the closest styled edge in world coordinates for hover", () => {
    const payload = buildGraphRendererPayload({
      nodes: [
        { id: "a", label: "Alpha", x: 0, y: 0, weight: 1 },
        { id: "b", label: "Beta", x: 100, y: 0, weight: 1 },
      ],
      edges: [{ source: "a", target: "b", relation: "assists", dash: "dashed", weak: true }],
      stats: { nodeCount: 2, edgeCount: 1, weakEdgeCount: 1, communityCount: 1 },
    });

    const hit = findNearestEdge(payload, 50, 4, 12);

    expect(hit.edge.relation).toBe("assists");
    expect(hit.sourceLabel).toBe("Alpha");
    expect(hit.targetLabel).toBe("Beta");
    expect(findNearestEdge(payload, 50, 50, 12)).toBeNull();
  });

  it("interpolates merge positions by pulling the source node into the target", () => {
    const payload = buildGraphRendererPayload({
      nodes: [
        { id: "candidate", label: "Candidate", x: 0, y: 0, weight: 1 },
        { id: "canonical", label: "Canonical", x: 100, y: 40, weight: 1 },
        { id: "neighbor", label: "Neighbor", x: -20, y: 10, weight: 1 },
      ],
      edges: [
        { source: "candidate", target: "neighbor", relation: "mentions" },
        { source: "neighbor", target: "candidate", relation: "seen_by" },
      ],
      stats: { nodeCount: 3, edgeCount: 2, weakEdgeCount: 0, communityCount: 1 },
    });

    const positions = interpolateMergePositions(payload, { from: "candidate", into: "canonical" }, 0.5);

    expect([...positions]).toEqual([50, 20, 100, 40, -20, 10]);
    expect([...payload.renderGraph.positions]).toEqual([0, 0, 100, 40, -20, 10]);
  });

  // --- connected-dim: hoveredNodeId ---
  it("dims non-neighbour nodes and their edges when hoveredNodeId is set", () => {
    const scene = makeTriangleScene();
    // Hover on "a": neighbours are b and c. d is NOT a neighbour.
    const payload = buildGraphRendererPayload(scene, { hoveredNodeId: "a", nodeRadius: 3 });

    const nodeIndexById = payload.nodeIndexById;
    const iA = nodeIndexById.get("a");
    const iB = nodeIndexById.get("b");
    const iC = nodeIndexById.get("c");
    const iD = nodeIndexById.get("d");

    // focused node (a) and its direct neighbours (b, c) stay fully opaque
    expect(payload.style.nodeColors[iA * 4 + 3]).toBe(255);
    expect(payload.style.nodeColors[iB * 4 + 3]).toBe(255);
    expect(payload.style.nodeColors[iC * 4 + 3]).toBe(255);

    // d is NOT a neighbour → dimmed to ≤ 90 (255 * 0.35 ≈ 89)
    expect(payload.style.nodeColors[iD * 4 + 3]).toBeLessThanOrEqual(90);
  });

  it("recomputes connected-dim style from base buffers without rebuilding graph buffers", () => {
    const scene = makeTriangleScene();
    const payload = buildGraphRendererPayload(scene, { nodeRadius: 3 });

    const hoverStyle = buildConnectedDimStyle(payload, { hoveredNodeId: "a" });

    expect(hoverStyle).not.toBe(payload.style);
    expect(payload.renderGraph.nodeIds).toEqual(["a", "b", "c", "d"]);
    expect(payload.baseStyle.nodeColors[payload.nodeIndexById.get("d") * 4 + 3]).toBe(255);
    expect(hoverStyle.nodeColors[payload.nodeIndexById.get("d") * 4 + 3]).toBeLessThanOrEqual(90);
  });

  it("dims non-incident edges when hoveredNodeId is set", () => {
    const scene = makeTriangleScene();
    // a → b (index 0), a → c (index 1), b → d (index 2)
    // Hover "a": edges 0 and 1 are incident → full alpha; edge 2 is not → dimmed
    const payload = buildGraphRendererPayload(scene, { hoveredNodeId: "a", nodeRadius: 3 });
    const graph = payload.renderGraph;
    const iA = payload.nodeIndexById.get("a");
    const edgeCount = graph.edges.length / 2;

    for (let e = 0; e < edgeCount; e++) {
      const src = graph.edges[e * 2];
      const tgt = graph.edges[e * 2 + 1];
      const isIncident = src === iA || tgt === iA;
      const alpha = payload.style.edgeColors[e * 4 + 3];
      if (isIncident) {
        expect(alpha).toBe(255);
      } else {
        expect(alpha).toBeLessThanOrEqual(90);
      }
    }
  });

  it("dims non-neighbour nodes when a node is selected (selectedIds)", () => {
    const scene = makeTriangleScene();
    // Select "b": neighbours are a and d. c is NOT a direct neighbour of b.
    const payload = buildGraphRendererPayload(scene, { selectedIds: ["b"], nodeRadius: 3 });
    const iA = payload.nodeIndexById.get("a");
    const iB = payload.nodeIndexById.get("b");
    const iC = payload.nodeIndexById.get("c");
    const iD = payload.nodeIndexById.get("d");

    expect(payload.style.nodeColors[iA * 4 + 3]).toBe(255); // neighbour of b
    expect(payload.style.nodeColors[iB * 4 + 3]).toBe(255); // selected itself
    expect(payload.style.nodeColors[iD * 4 + 3]).toBe(255); // neighbour of b
    expect(payload.style.nodeColors[iC * 4 + 3]).toBeLessThanOrEqual(90); // not a neighbour
  });

  it("does NOT dim anything when neither selectedIds nor hoveredNodeId are provided", () => {
    const scene = makeTriangleScene();
    const payload = buildGraphRendererPayload(scene, { nodeRadius: 3 });
    const nodeCount = payload.renderGraph.nodeIds.length;
    for (let i = 0; i < nodeCount; i++) {
      expect(payload.style.nodeColors[i * 4 + 3]).toBe(255);
    }
  });

  it("fades the merging source node and its incident edges during merge", () => {
    const payload = buildGraphRendererPayload({
      nodes: [
        { id: "candidate", label: "Candidate", x: 0, y: 0, weight: 1 },
        { id: "canonical", label: "Canonical", x: 100, y: 40, weight: 1 },
        { id: "neighbor", label: "Neighbor", x: -20, y: 10, weight: 1 },
      ],
      edges: [
        { source: "candidate", target: "neighbor", relation: "mentions" },
        { source: "canonical", target: "neighbor", relation: "seen_by" },
      ],
      stats: { nodeCount: 3, edgeCount: 2, weakEdgeCount: 0, communityCount: 1 },
    });

    const style = interpolateMergeStyle(payload, { from: "candidate", into: "canonical" }, 0.5);

    expect(style.nodeColors[3]).toBe(128);
    expect(style.edgeColors[3]).toBe(128);
    expect(style.edgeColors[7]).toBe(255);
    expect(payload.style.nodeColors[3]).toBe(255);
  });
});
