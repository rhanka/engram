import { describe, expect, it } from "vitest";
import { buildEdgePolylinePositions, buildRenderGraphBuffers } from "../src/index";

describe("buildEdgePolylinePositions", () => {
  const graph = buildRenderGraphBuffers({
    nodes: [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 10, y: 0 },
    ],
    edges: [{ source: "a", target: "b" }],
  });

  it("emits straight edge vertices without changing node positions", () => {
    const line = buildEdgePolylinePositions(graph, { curve: "straight" });

    expect([...line]).toEqual([0, 0, 10, 0]);
    expect([...graph.positions]).toEqual([0, 0, 10, 0]);
  });

  it("emits quadratic arc segments for memoir-style edge geometry", () => {
    const line = buildEdgePolylinePositions(graph, { curve: "arc", curvature: 0.5, segments: 2 });

    expect([...line]).toEqual([0, 0, 5, -2.5, 5, -2.5, 10, 0]);
  });
});
