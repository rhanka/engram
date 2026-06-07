import { describe, expect, it } from "vitest";

import { buildStudioRenderBuffers } from "../src/studio-render-buffers.js";

describe("buildStudioRenderBuffers", () => {
  it("adapts a positioned studio scene into renderer and style typed buffers", () => {
    const payload = buildStudioRenderBuffers({
      nodes: [
        { id: "a", label: "Alpha", x: 10, y: 20, fx: 99, fy: 88, weight: 4, shape: "diamond" },
        { id: "b", label: "Beta", x: -5, y: 0, weight: 1, group: "G" },
        { id: "c", label: "Gamma", x: 30, y: -10, weight: 9 },
      ],
      edges: [
        { source: "a", target: "b", relation: "uses_method", dash: "long-dash" },
        { source: "b", target: "c", relation: "occurs_at", dash: "dotted", weak: true },
        { source: "missing", target: "c", relation: "dangling", dash: "dashed" },
      ],
      stats: { nodeCount: 3, edgeCount: 3, weakEdgeCount: 1, communityCount: 1 },
    });

    expect(payload.renderer).toBe("sentropic-graph");
    expect(payload.renderGraph.nodeIds).toEqual(["a", "b", "c"]);
    expect([...payload.renderGraph.positions]).toEqual([10, 20, -5, 0, 30, -10]);
    expect([...payload.renderGraph.edges]).toEqual([0, 1, 1, 2]);
    expect(payload.renderGraph.droppedEdges).toBe(1);
    expect(payload.renderGraph.nodeFlags?.fixed).toEqual(new Uint8Array([1, 0, 0]));

    expect([...payload.style.nodeSizes]).toEqual([6, 3, 9]);
    expect([...payload.style.edgeDash]).toEqual([3, 2]);
    expect([...payload.style.edgeWidths]).toEqual([1, 0.75]);
    expect(payload.stats).toEqual({
      nodeCount: 3,
      edgeCount: 2,
      droppedEdgeCount: 1,
      weakEdgeCount: 1,
    });
  });

  it("requires explicit x/y positions and does not silently fall back to fx/fy", () => {
    expect(() =>
      buildStudioRenderBuffers({
        nodes: [{ id: "a", label: "Alpha", fx: 10, fy: 20, weight: 1 }],
        edges: [],
        stats: { nodeCount: 1, edgeCount: 0, weakEdgeCount: 0, communityCount: 0 },
      }),
    ).toThrow("node a is missing finite x/y positions");
  });
});
