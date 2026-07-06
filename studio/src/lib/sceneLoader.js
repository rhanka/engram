/**
 * ÉTAPE 1b: workspace mount orchestration.
 *
 * The mount payload is the LIGHT scene.json (a few hundred KB), not the multi-MB
 * raw graph.json. This function captures the load policy so it stays pure and
 * unit-testable (App.svelte just wires its result into reactive state):
 *
 *   1. Try `fetchScene()`. If it resolves, that scene drives first paint AS-IS
 *      (no buildScene re-run). The raw graph is then loaded LAZILY in the
 *      background — the side panels (left rail, selection, entity relations/
 *      citations, reconciliation) still read it — but it is OFF the render-
 *      critical path, so a slow/failed graph load never blocks the graph view.
 *   2. If `fetchScene()` rejects (no scene.json — e.g. an older server or a
 *      static export without the file), fall back to the legacy path:
 *      `fetchGraph()` + `buildScene(graph)`. Fully backwards-compatible.
 *   3. If BOTH fail, report an error.
 *
 * @param {object} deps
 * @param {() => Promise<object>} deps.fetchScene  resolves the light scene
 * @param {() => Promise<object>} deps.fetchGraph  resolves the raw graph
 * @param {(graph: object) => object} deps.buildScene  legacy scene builder
 * @returns {Promise<{ mode: "scene"|"graph"|"error", scene: object|null,
 *   graph: object|null, error: string|null }>}
 */
export async function loadWorkspace({ fetchScene, fetchGraph, buildScene }) {
  // --- Primary path: light scene.json as the mount payload. ---
  let scene = null;
  try {
    scene = await fetchScene();
  } catch {
    scene = null;
  }

  if (scene) {
    // First paint is already covered by the scene. Hydrate the raw graph for
    // the side panels in the background; a failure here is non-fatal.
    let graph = null;
    try {
      graph = await fetchGraph();
    } catch {
      graph = null;
    }
    return { mode: "scene", scene, graph, error: null };
  }

  // --- Fallback: legacy fetchGraph() + buildScene() (backwards-compatible). ---
  try {
    const graph = await fetchGraph();
    return { mode: "graph", scene: buildScene(graph), graph, error: null };
  } catch (err) {
    return {
      mode: "error",
      scene: null,
      graph: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Race sentinel: the full workspace settled before the window probe did. */
const WORKSPACE_SETTLED = Symbol("workspace-settled");

/**
 * Storage LOT 3 / WP1: workspace mount that PREFERS a bounded store window for
 * FIRST PAINT, then hydrates the full workspace lazily. Wraps (and returns the
 * exact result of) {@link loadWorkspace}, which stays byte-identical.
 *
 * Policy — a pure PREFERENCE with a clean fallback:
 *   1. The full `loadWorkspace()` load and the `fetchWindow()` probe start
 *      CONCURRENTLY, so the default path is never delayed by the probe.
 *   2. If the window resolves FIRST with a non-empty node set, the bounded
 *      scene (`buildWindowScene(window)` — N highest-degree nodes + induced
 *      edges + precomputed layout positions) is handed to `onFirstPaint`; the
 *      caller paints it immediately instead of waiting on the multi-MB scene.
 *   3. When the full workspace resolves, its result is returned UNCHANGED —
 *      the caller swaps in the full scene (lazy hydration of the remainder).
 *   4. Whenever the window is unavailable — no store configured (the default
 *      flat-JSON studio), an offline bundle, a 404, a fetch error, an empty
 *      window, or simply losing the race to the full workspace — `onFirstPaint`
 *      is NOT called and the behaviour is EXACTLY `loadWorkspace(deps)`. A
 *      stale window can never downgrade an already-loaded full scene.
 *
 * @param {object} deps  {@link loadWorkspace} deps plus:
 * @param {() => Promise<object|null>} [deps.fetchWindow]  resolves the store
 *        window document, or null when no window-capable store is reachable
 *        (never rejects in the api.js accessor; rejections are treated as null)
 * @param {(windowDoc: object) => object} [deps.buildWindowScene]  adapts the
 *        window document into a renderable scene (graphAdapter.buildWindowScene)
 * @param {(scene: object, windowDoc: object) => void} [deps.onFirstPaint]
 *        called AT MOST ONCE, before the returned promise resolves, with the
 *        bounded scene; a throw here never breaks the full-scene load
 * @returns {Promise<{ mode: "scene"|"graph"|"error", scene: object|null,
 *   graph: object|null, error: string|null }>} the {@link loadWorkspace} result
 */
export async function loadWorkspaceWindowed({
  fetchWindow,
  buildWindowScene,
  onFirstPaint,
  fetchScene,
  fetchGraph,
  buildScene,
}) {
  const workspace = loadWorkspace({ fetchScene, fetchGraph, buildScene });
  if (
    typeof fetchWindow === "function" &&
    typeof buildWindowScene === "function" &&
    typeof onFirstPaint === "function"
  ) {
    // Never rejects: any probe failure means "no window" (the clean fallback).
    const windowProbe = Promise.resolve()
      .then(() => fetchWindow())
      .catch(() => null);
    const first = await Promise.race([
      workspace.then(() => WORKSPACE_SETTLED),
      windowProbe,
    ]);
    if (
      first !== WORKSPACE_SETTLED &&
      first &&
      Array.isArray(first.nodes) &&
      first.nodes.length > 0
    ) {
      try {
        onFirstPaint(buildWindowScene(first), first);
      } catch {
        // A paint failure must never break the full-scene load.
      }
    }
  }
  return workspace;
}
