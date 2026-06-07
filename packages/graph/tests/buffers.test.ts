import { describe, expect, it } from "vitest";
import { buildRenderGraphBuffers, computePositionBounds } from "../src/index";

describe("buildRenderGraphBuffers", () => {
  it("compiles a high-level scene into stable typed buffers", () => {
    const graph = buildRenderGraphBuffers({
      nodes: [
        { id: "b", x: 10, y: 20, fx: 10, fy: 20, fixed: true },
        { id: "a", x: -5, y: 15 },
        { id: "c", x: 30, y: -10 },
      ],
      edges: [
        { source: "a", target: "b" },
        { source: "b", target: "c" },
        { source: "missing", target: "c" },
      ],
    });

    expect(graph.nodeIds).toEqual(["b", "a", "c"]);
    expect([...graph.positions]).toEqual([10, 20, -5, 15, 30, -10]);
    expect([...graph.edges]).toEqual([1, 0, 0, 2]);
    expect(graph.droppedEdges).toBe(1);
    expect(graph.idToIndex.get("a")).toBe(1);
    expect(graph.nodeFlags?.fixed).toEqual(new Uint8Array([1, 0, 0]));

    const exposed = Object.keys(graph);
    expect(exposed).not.toContain("fx");
    expect(exposed).not.toContain("fy");
  });

  it("uses y-down world bounds without converting to CSS pixels", () => {
    const graph = buildRenderGraphBuffers({
      nodes: [
        { id: "top", x: 0, y: -100 },
        { id: "bottom", x: 20, y: 50 },
      ],
      edges: [],
    });

    expect(computePositionBounds(graph.positions)).toEqual({
      minX: 0,
      minY: -100,
      maxX: 20,
      maxY: 50,
      width: 20,
      height: 150,
      centerX: 10,
      centerY: -25,
    });
  });
});
