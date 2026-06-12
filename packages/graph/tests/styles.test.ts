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

  it("maps box and roundedbox to shape code 5 (square stays 4)", () => {
    const scene = {
      nodes: [
        { id: "box", x: 0, y: 0, shape: "box" },
        { id: "rounded", x: 1, y: 0, shape: "roundedbox" },
        { id: "square", x: 2, y: 0, shape: "square" },
        { id: "dot", x: 3, y: 0 },
      ],
      edges: [],
    };
    const graph = buildRenderGraphBuffers(scene);
    const style = buildStyleBuffers(scene, graph);
    expect([...(style.nodeShapes ?? [])]).toEqual([5, 5, 4, 0]);
  });

  it("populates nodeLabels for central box nodes only (empty for low-degree/non-box)", () => {
    // hub: box with high degree (3) -> labelled. leaf: isolated box, degree 0
    // (< 15% of max=3) -> empty. star: non-box high degree -> empty.
    const scene = {
      nodes: [
        { id: "hub", x: 0, y: 0, shape: "box", label: "Central Work" },
        { id: "leaf", x: 10, y: 0, shape: "box", label: "Lonely Chapter" },
        { id: "a", x: 0, y: 10, shape: "dot" },
        { id: "b", x: 0, y: 20, shape: "dot" },
        { id: "star", x: 0, y: 30, shape: "star", label: "Famous Author" },
      ],
      edges: [
        { source: "hub", target: "a" },
        { source: "hub", target: "b" },
        { source: "hub", target: "star" },
        { source: "star", target: "a" },
        { source: "star", target: "b" },
      ],
    };
    const graph = buildRenderGraphBuffers(scene);
    const style = buildStyleBuffers(scene, graph);
    const labels = style.nodeLabels ?? [];
    const indexOf = (id: string) => graph.nodeIds.indexOf(id);
    expect(labels[indexOf("hub")]).toBe("Central Work");
    expect(labels[indexOf("leaf")]).toBe(""); // box but low degree
    expect(labels[indexOf("star")]).toBe(""); // central but not a box
    expect(labels[indexOf("a")]).toBe(""); // non-box
  });
});
