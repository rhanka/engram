import { describe, expect, it } from "vitest";
import { buildRenderGraphBuffers, buildStyleBuffers } from "../src/index";

describe("buildStyleBuffers", () => {
  it("compiles rich high-level styling into filtered typed arrays", () => {
    const scene = {
      nodes: [
        { id: "a", x: 0, y: 0, size: 4, color: "#ff0000", shape: "diamond" },
        { id: "b", x: 10, y: 0 },
      ],
      edges: [
        { source: "a", target: "b", width: 2, color: "#00ff00", dash: "long-dash", curvature: 0.25 },
        { source: "missing", target: "b", width: 9, color: "#000000", dash: "dotted" },
      ],
    };

    const graph = buildRenderGraphBuffers(scene);
    const style = buildStyleBuffers(scene, graph, {
      node: { size: 1, color: "#0000ff" },
      edge: { width: 1, color: "#111111", dash: "solid", curvature: 0 },
    });

    expect([...style.nodeSizes]).toEqual([4, 1]);
    expect([...(style.nodeShapes ?? [])]).toEqual([1, 0]);
    expect([...style.nodeColors]).toEqual([255, 0, 0, 255, 0, 0, 255, 255]);
    expect([...style.edgeWidths]).toEqual([2]);
    expect([...style.edgeColors]).toEqual([0, 255, 0, 255]);
    expect([...style.edgeDash]).toEqual([3]);
    expect([...style.edgeCurvatures]).toEqual([0.25]);
  });
});
