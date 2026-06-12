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

  it("reserves the box label to the god-class (the type owning the highest-degree node)", () => {
    // sherlock: Character hub (degree 3, global max) -> god-class box, labelled.
    // work: Work box, central too (degree 2 >= 15% of max=3) but NOT god-class
    // -> no label (renders as the small empty box).
    const scene = {
      nodes: [
        { id: "sherlock", x: 0, y: 0, shape: "roundedbox", node_type: "Character", label: "Sherlock Holmes" },
        { id: "work", x: 10, y: 0, shape: "roundedbox", node_type: "Work", label: "The Memoirs" },
        { id: "a", x: 0, y: 10, shape: "dot", node_type: "Location" },
        { id: "b", x: 0, y: 20, shape: "dot", node_type: "Location" },
      ],
      edges: [
        { source: "sherlock", target: "a" },
        { source: "sherlock", target: "b" },
        { source: "sherlock", target: "work" },
        { source: "work", target: "a" },
      ],
    };
    const graph = buildRenderGraphBuffers(scene);
    const style = buildStyleBuffers(scene, graph);
    const labels = style.nodeLabels ?? [];
    const indexOf = (id: string) => graph.nodeIds.indexOf(id);
    expect(labels[indexOf("sherlock")]).toBe("Sherlock Holmes"); // god-class hub
    expect(labels[indexOf("work")]).toBe(""); // central box, wrong class
  });

  it("maps fill / border shape variants into nodeFills / nodeBorders (default 0)", () => {
    const scene = {
      nodes: [
        { id: "solid", x: 0, y: 0, shape: "diamond" }, // defaults
        { id: "hollow", x: 1, y: 0, shape: "diamond", fill: "hollow" },
        { id: "bold", x: 2, y: 0, shape: "hexagon", border: "bold" },
        { id: "both", x: 3, y: 0, shape: "square", fill: "hollow", border: "bold" },
        { id: "explicit", x: 4, y: 0, shape: "star", fill: "solid", border: "normal" },
      ],
      edges: [],
    };
    const graph = buildRenderGraphBuffers(scene);
    const style = buildStyleBuffers(scene, graph);
    const indexOf = (id: string) => graph.nodeIds.indexOf(id);
    const fills = style.nodeFills ?? new Uint8Array();
    const borders = style.nodeBorders ?? new Uint8Array();
    expect(fills[indexOf("solid")]).toBe(0);
    expect(fills[indexOf("hollow")]).toBe(1);
    expect(fills[indexOf("explicit")]).toBe(0);
    expect(borders[indexOf("solid")]).toBe(0);
    expect(borders[indexOf("bold")]).toBe(1);
    expect(borders[indexOf("both")]).toBe(1);
    expect(fills[indexOf("both")]).toBe(1);
    expect(borders[indexOf("explicit")]).toBe(0);
  });
});
