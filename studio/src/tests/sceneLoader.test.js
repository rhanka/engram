import { describe, expect, it, vi } from "vitest";

import { loadWorkspace, loadWorkspaceWindowed } from "../lib/sceneLoader.js";

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

/**
 * Storage LOT 3 — the windowed first paint. The contract that matters is not
 * "paints sooner" but "paints WITHOUT the full-scene bytes": the window probe
 * must complete and paint BEFORE scene.json/graph.json are ever requested.
 */
const WINDOW_DOC = {
  strategy: "degree-top-n",
  layout: "force",
  limit: 2,
  nodes: [
    { id: "a", label: "A", node_type: "Character", degree: 3, x: 1, y: 2 },
    { id: "b", label: "B", node_type: "Character", degree: 1, x: 3, y: 4 },
  ],
  edges: [{ source: "a", target: "b", relation: "KNOWS" }],
};

const buildWindowScene = (doc) => ({
  nodes: doc.nodes,
  edges: doc.edges,
  __from: "buildWindowScene",
  stats: { nodeCount: doc.nodes.length, windowed: true },
});

describe("loadWorkspaceWindowed (storage LOT 3 windowed first paint)", () => {
  it("paints the bounded window BEFORE any full-scene byte is requested", async () => {
    const order = [];
    const fetchWindow = vi.fn(async () => {
      order.push("fetchWindow");
      return WINDOW_DOC;
    });
    const fetchScene = vi.fn(async () => {
      order.push("fetchScene");
      return LIGHT_SCENE;
    });
    const fetchGraph = vi.fn(async () => {
      order.push("fetchGraph");
      return RAW_GRAPH;
    });
    const onFirstPaint = vi.fn(() => order.push("firstPaint"));

    const result = await loadWorkspaceWindowed({
      fetchWindow,
      buildWindowScene,
      onFirstPaint,
      fetchScene,
      fetchGraph,
      buildScene,
    });

    // THE payload guarantee: nothing heavy is fetched before the window paints.
    expect(order).toEqual(["fetchWindow", "firstPaint", "fetchScene", "fetchGraph"]);
    expect(onFirstPaint).toHaveBeenCalledTimes(1);
    const [scene, doc] = onFirstPaint.mock.calls[0];
    expect(scene.__from).toBe("buildWindowScene");
    expect(scene.stats.windowed).toBe(true);
    expect(doc).toBe(WINDOW_DOC);
    // Hydration still returns the FULL workspace, unchanged.
    expect(result.mode).toBe("scene");
    expect(result.scene).toEqual(LIGHT_SCENE);
    expect(result.graph).toEqual(RAW_GRAPH);
  });

  it("NO-STORE FALLBACK: a null window degrades to exactly loadWorkspace", async () => {
    const fetchWindow = vi.fn(async () => null);
    const fetchScene = vi.fn(async () => LIGHT_SCENE);
    const fetchGraph = vi.fn(async () => RAW_GRAPH);
    const onFirstPaint = vi.fn();

    const windowed = await loadWorkspaceWindowed({
      fetchWindow,
      buildWindowScene,
      onFirstPaint,
      fetchScene,
      fetchGraph,
      buildScene,
    });
    const plain = await loadWorkspace({
      fetchScene: async () => LIGHT_SCENE,
      fetchGraph: async () => RAW_GRAPH,
      buildScene,
    });

    expect(onFirstPaint).not.toHaveBeenCalled();
    expect(windowed).toEqual(plain);
  });

  it("degrades to the full scene when the window probe rejects", async () => {
    const onFirstPaint = vi.fn();

    const result = await loadWorkspaceWindowed({
      fetchWindow: async () => {
        throw new Error("500 window");
      },
      buildWindowScene,
      onFirstPaint,
      fetchScene: async () => LIGHT_SCENE,
      fetchGraph: async () => RAW_GRAPH,
      buildScene,
    });

    expect(onFirstPaint).not.toHaveBeenCalled();
    expect(result.mode).toBe("scene");
    expect(result.scene).toEqual(LIGHT_SCENE);
  });

  it("ignores an EMPTY window rather than painting a blank canvas", async () => {
    const onFirstPaint = vi.fn();

    const result = await loadWorkspaceWindowed({
      fetchWindow: async () => ({ ...WINDOW_DOC, nodes: [], edges: [] }),
      buildWindowScene,
      onFirstPaint,
      fetchScene: async () => LIGHT_SCENE,
      fetchGraph: async () => RAW_GRAPH,
      buildScene,
    });

    expect(onFirstPaint).not.toHaveBeenCalled();
    expect(result.mode).toBe("scene");
  });

  it("is exactly loadWorkspace when the window deps are omitted", async () => {
    const fetchScene = vi.fn(async () => LIGHT_SCENE);
    const fetchGraph = vi.fn(async () => RAW_GRAPH);

    const result = await loadWorkspaceWindowed({ fetchScene, fetchGraph, buildScene });

    expect(result.mode).toBe("scene");
    expect(result.scene).toEqual(LIGHT_SCENE);
    expect(result.graph).toEqual(RAW_GRAPH);
  });

  it("still hydrates when the first paint throws", async () => {
    const onFirstPaint = vi.fn(() => {
      throw new Error("render blew up");
    });

    const result = await loadWorkspaceWindowed({
      fetchWindow: async () => WINDOW_DOC,
      buildWindowScene,
      onFirstPaint,
      fetchScene: async () => LIGHT_SCENE,
      fetchGraph: async () => RAW_GRAPH,
      buildScene,
    });

    expect(onFirstPaint).toHaveBeenCalledTimes(1);
    expect(result.mode).toBe("scene");
    expect(result.scene).toEqual(LIGHT_SCENE);
  });

  it("falls back to the legacy graph path after a window paint when scene.json is absent", async () => {
    const onFirstPaint = vi.fn();

    const result = await loadWorkspaceWindowed({
      fetchWindow: async () => WINDOW_DOC,
      buildWindowScene,
      onFirstPaint,
      fetchScene: async () => {
        throw new Error("404 scene.json");
      },
      fetchGraph: async () => RAW_GRAPH,
      buildScene,
    });

    expect(onFirstPaint).toHaveBeenCalledTimes(1);
    expect(result.mode).toBe("graph");
    expect(result.scene.__from).toBe("buildScene");
  });
});
