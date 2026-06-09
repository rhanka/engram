import { describe, expect, it } from "vitest";

import {
  buildGraphRendererPayload,
  findNearestEdge,
  findNearestNodeId,
  interpolateMergeStyle,
  interpolateMergePositions,
} from "../lib/graphRendererPayload.js";

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
