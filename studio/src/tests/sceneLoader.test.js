import { describe, expect, it, vi } from "vitest";

import { loadWorkspace } from "../lib/sceneLoader.js";

const LIGHT_SCENE = {
  nodes: [{ id: "a", label: "A", weight: 1, shape: "dot" }],
  edges: [],
  stats: { nodeCount: 1, edgeCount: 0, weakEdgeCount: 0, communityCount: 0 },
};

const RAW_GRAPH = { nodes: [{ id: "a", type: "Character" }], links: [] };

// A buildScene stand-in: marks its output so we can assert which path produced
// the scene without depending on the real adapter's exact values.
const buildScene = (graph) => ({ ...LIGHT_SCENE, __from: "buildScene", __graphNodes: graph.nodes.length });

describe("loadWorkspace (ÉTAPE 1b mount orchestration)", () => {
  it("mounts from the light scene.json and does NOT call buildScene", async () => {
    const fetchScene = vi.fn(async () => LIGHT_SCENE);
    const fetchGraph = vi.fn(async () => RAW_GRAPH);
    const build = vi.fn(buildScene);

    const result = await loadWorkspace({ fetchScene, fetchGraph, buildScene: build });

    expect(result.mode).toBe("scene");
    expect(result.scene).toEqual(LIGHT_SCENE);
    expect(result.error).toBeNull();
    expect(build).not.toHaveBeenCalled();
    // The raw graph still loads (lazily) so the side panels keep working.
    expect(result.graph).toEqual(RAW_GRAPH);
  });

  it("falls back to fetchGraph + buildScene when scene.json is absent", async () => {
    const fetchScene = vi.fn(async () => {
      throw new Error("404 scene.json");
    });
    const fetchGraph = vi.fn(async () => RAW_GRAPH);
    const build = vi.fn(buildScene);

    const result = await loadWorkspace({ fetchScene, fetchGraph, buildScene: build });

    expect(result.mode).toBe("graph");
    expect(result.error).toBeNull();
    expect(result.graph).toEqual(RAW_GRAPH);
    expect(build).toHaveBeenCalledWith(RAW_GRAPH);
    expect(result.scene.__from).toBe("buildScene");
  });

  it("reports an error when BOTH scene.json and graph.json are unavailable", async () => {
    const fetchScene = vi.fn(async () => {
      throw new Error("no scene");
    });
    const fetchGraph = vi.fn(async () => {
      throw new Error("no graph");
    });
    const build = vi.fn(buildScene);

    const result = await loadWorkspace({ fetchScene, fetchGraph, buildScene: build });

    expect(result.mode).toBe("error");
    expect(result.error).toMatch(/no graph/);
    expect(result.scene).toBeNull();
  });

  it("still succeeds in scene mode if the lazy raw-graph load fails", async () => {
    // The scene already drove first paint; a failed graph load must not break it.
    const fetchScene = vi.fn(async () => LIGHT_SCENE);
    const fetchGraph = vi.fn(async () => {
      throw new Error("graph fetch failed");
    });
    const build = vi.fn(buildScene);

    const result = await loadWorkspace({ fetchScene, fetchGraph, buildScene: build });

    expect(result.mode).toBe("scene");
    expect(result.scene).toEqual(LIGHT_SCENE);
    expect(result.graph).toBeNull();
    expect(result.error).toBeNull();
  });
});
