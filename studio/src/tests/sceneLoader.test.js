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

// ---------------------------------------------------------------------------
// Storage LOT 3 / WP1: windowed first paint (preference + clean fallback).
// ---------------------------------------------------------------------------

/** The GET /api/ontology/window payload the api.js accessor resolves. */
const WINDOW_DOC = {
  strategy: "degree-top-n",
  layout: "force",
  limit: 2,
  nodes: [
    { id: "hub", label: "Hub", node_type: "Character", x: 1, y: 2, degree: 3 },
    { id: "a", label: "A", node_type: "Work", x: 3, y: 4, degree: 2 },
  ],
  edges: [{ source: "hub", target: "a", relation: "links" }],
};

// A buildWindowScene stand-in: marks its output so the tests can tell the
// bounded first-paint scene from the full one without the real adapter.
const buildWindowSceneStub = (win) => ({
  __from: "buildWindowScene",
  nodes: win.nodes,
  edges: win.edges,
  window: { strategy: win.strategy, layout: win.layout, limit: win.limit },
});

/** A manually-resolvable promise so tests control the race deterministically. */
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("loadWorkspaceWindowed (storage LOT 3 / WP1 — windowed first paint)", () => {
  it("PREFERS the window for first paint, then hydrates the full scene lazily", async () => {
    // The full scene is SLOW (a multi-MB payload); the window resolves first.
    const scene = deferred();
    const fetchScene = vi.fn(() => scene.promise);
    const fetchGraph = vi.fn(async () => RAW_GRAPH);
    const fetchWindow = vi.fn(async () => WINDOW_DOC);
    const onFirstPaint = vi.fn();

    const resultPromise = loadWorkspaceWindowed({
      fetchWindow,
      buildWindowScene: buildWindowSceneStub,
      onFirstPaint,
      fetchScene,
      fetchGraph,
      buildScene: vi.fn(buildScene),
    });

    // The bounded window paints BEFORE the full workspace resolves.
    await vi.waitFor(() => expect(onFirstPaint).toHaveBeenCalledTimes(1));
    const [paintedScene, paintedDoc] = onFirstPaint.mock.calls[0];
    expect(paintedScene.__from).toBe("buildWindowScene");
    expect(paintedScene.nodes.map((n) => n.id)).toEqual(["hub", "a"]);
    expect(paintedScene.window).toEqual({ strategy: "degree-top-n", layout: "force", limit: 2 });
    expect(paintedDoc).toBe(WINDOW_DOC);

    // The remainder hydrates lazily: the full scene load settles afterwards and
    // the returned result is the FULL workspace, unchanged.
    scene.resolve(LIGHT_SCENE);
    const result = await resultPromise;
    expect(result.mode).toBe("scene");
    expect(result.scene).toEqual(LIGHT_SCENE);
    expect(result.graph).toEqual(RAW_GRAPH);
    expect(onFirstPaint).toHaveBeenCalledTimes(1);
  });

  it("REGRESSION PIN: no store (window null) — result identical to loadWorkspace, no paint", async () => {
    const fetchScene = vi.fn(async () => LIGHT_SCENE);
    const fetchGraph = vi.fn(async () => RAW_GRAPH);
    const onFirstPaint = vi.fn();

    const windowed = await loadWorkspaceWindowed({
      fetchWindow: vi.fn(async () => null), // api.js resolves null: no store / 404
      buildWindowScene: buildWindowSceneStub,
      onFirstPaint,
      fetchScene,
      fetchGraph,
      buildScene: vi.fn(buildScene),
    });
    const plain = await loadWorkspace({
      fetchScene: vi.fn(async () => LIGHT_SCENE),
      fetchGraph: vi.fn(async () => RAW_GRAPH),
      buildScene: vi.fn(buildScene),
    });

    expect(onFirstPaint).not.toHaveBeenCalled();
    expect(windowed).toEqual(plain);
  });

  it("REGRESSION PIN: legacy graph fallback still works under the windowed loader", async () => {
    // No scene.json AND no window: the legacy fetchGraph + buildScene path.
    const build = vi.fn(buildScene);
    const result = await loadWorkspaceWindowed({
      fetchWindow: vi.fn(async () => null),
      buildWindowScene: buildWindowSceneStub,
      onFirstPaint: vi.fn(),
      fetchScene: vi.fn(async () => {
        throw new Error("404 scene.json");
      }),
      fetchGraph: vi.fn(async () => RAW_GRAPH),
      buildScene: build,
    });
    expect(result.mode).toBe("graph");
    expect(build).toHaveBeenCalledWith(RAW_GRAPH);
  });

  it("treats a REJECTED window probe as no window (clean fallback)", async () => {
    const onFirstPaint = vi.fn();
    const result = await loadWorkspaceWindowed({
      fetchWindow: vi.fn(async () => {
        throw new Error("network down");
      }),
      buildWindowScene: buildWindowSceneStub,
      onFirstPaint,
      fetchScene: vi.fn(async () => LIGHT_SCENE),
      fetchGraph: vi.fn(async () => RAW_GRAPH),
      buildScene: vi.fn(buildScene),
    });
    expect(onFirstPaint).not.toHaveBeenCalled();
    expect(result.mode).toBe("scene");
  });

  it("skips an EMPTY window (zero nodes would paint a blank canvas)", async () => {
    const onFirstPaint = vi.fn();
    const result = await loadWorkspaceWindowed({
      fetchWindow: vi.fn(async () => ({ ...WINDOW_DOC, nodes: [], edges: [] })),
      buildWindowScene: buildWindowSceneStub,
      onFirstPaint,
      fetchScene: vi.fn(async () => LIGHT_SCENE),
      fetchGraph: vi.fn(async () => RAW_GRAPH),
      buildScene: vi.fn(buildScene),
    });
    expect(onFirstPaint).not.toHaveBeenCalled();
    expect(result.mode).toBe("scene");
  });

  it("never DOWNGRADES: a window that loses the race to the full scene is not painted", async () => {
    // The full workspace resolves immediately; the window arrives later.
    const win = deferred();
    const onFirstPaint = vi.fn();
    const result = await loadWorkspaceWindowed({
      fetchWindow: vi.fn(() => win.promise),
      buildWindowScene: buildWindowSceneStub,
      onFirstPaint,
      fetchScene: vi.fn(async () => LIGHT_SCENE),
      fetchGraph: vi.fn(async () => RAW_GRAPH),
      buildScene: vi.fn(buildScene),
    });
    expect(result.mode).toBe("scene");
    // The late window must NOT clobber the already-loaded full scene.
    win.resolve(WINDOW_DOC);
    await win.promise;
    await Promise.resolve();
    expect(onFirstPaint).not.toHaveBeenCalled();
  });

  it("a throwing onFirstPaint never breaks the full-scene load", async () => {
    const result = await loadWorkspaceWindowed({
      fetchWindow: vi.fn(async () => WINDOW_DOC),
      buildWindowScene: buildWindowSceneStub,
      onFirstPaint: vi.fn(() => {
        throw new Error("paint failed");
      }),
      fetchScene: vi.fn(async () => LIGHT_SCENE),
      fetchGraph: vi.fn(async () => RAW_GRAPH),
      buildScene: vi.fn(buildScene),
    });
    expect(result.mode).toBe("scene");
    expect(result.scene).toEqual(LIGHT_SCENE);
  });

  it("without the window deps it IS loadWorkspace (backwards-compatible)", async () => {
    const result = await loadWorkspaceWindowed({
      fetchScene: vi.fn(async () => LIGHT_SCENE),
      fetchGraph: vi.fn(async () => RAW_GRAPH),
      buildScene: vi.fn(buildScene),
    });
    expect(result.mode).toBe("scene");
    expect(result.scene).toEqual(LIGHT_SCENE);
    expect(result.graph).toEqual(RAW_GRAPH);
  });
});
