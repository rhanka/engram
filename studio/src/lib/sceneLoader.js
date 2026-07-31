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

/**
 * Storage LOT 3: workspace mount that PAINTS A BOUNDED STORE WINDOW FIRST, then
 * hydrates the full workspace. Wraps {@link loadWorkspace}, whose behaviour and
 * result are returned UNCHANGED.
 *
 * WHY SEQUENTIAL (probe -> paint -> hydrate), not a race. The point of the
 * windowed loader is to cut the BYTES ON THE FIRST-PAINT CRITICAL PATH, not just
 * to paint sooner. `loadWorkspace` fetches the multi-MB scene.json AND awaits
 * graph.json before it resolves; if the window merely raced them, the browser
 * would still be pulling 100+ MB while the window painted, and first paint would
 * remain bandwidth-bound. So the window probe runs FIRST and alone: on a windowed
 * mount the only bytes needed before the graph is on screen are the window
 * document itself (a bounded top-N slice). The full load starts afterwards and
 * swaps in when it settles.
 *
 * COST OF THE PROBE, honestly. When no window-capable store is configured, this
 * adds exactly ONE small request (which 404s) ahead of the unchanged full load.
 * Offline/static bundles pay nothing at all: `api.fetchWindow` short-circuits to
 * null with zero fetches when a bundle is present, so `file://` exports keep
 * their byte-for-byte current behaviour.
 *
 * Policy — a pure PREFERENCE with a clean fallback:
 *   1. Probe `fetchWindow()`. A non-empty window is adapted by
 *      `buildWindowScene` and handed to `onFirstPaint`, which paints it NOW.
 *   2. Then run the full `loadWorkspace()` and return its result verbatim, so
 *      the caller swaps the bounded scene for the complete one (hydration).
 *   3. Whenever the window is unavailable — no store (the default flat-JSON
 *      studio), an offline bundle, a 404, a fetch rejection, or an empty window
 *      — `onFirstPaint` is NOT called and the behaviour is EXACTLY
 *      `loadWorkspace(deps)`. Omitting any of the three window deps disables the
 *      whole path, so existing callers are unaffected.
 *   4. A `onFirstPaint` throw is swallowed: a paint failure must never take down
 *      the hydration that would have corrected it.
 *
 * @param {object} deps  {@link loadWorkspace} deps plus:
 * @param {() => Promise<object|null>} [deps.fetchWindow]  resolves the window
 *        document, or null when no window-capable store is reachable
 * @param {(windowDoc: object) => object} [deps.buildWindowScene]  window ->
 *        renderable scene (graphAdapter.buildWindowScene)
 * @param {(scene: object, windowDoc: object) => void} [deps.onFirstPaint]
 *        called AT MOST ONCE, before hydration starts, with the bounded scene
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
  if (
    typeof fetchWindow === "function" &&
    typeof buildWindowScene === "function" &&
    typeof onFirstPaint === "function"
  ) {
    // Never rejects: any probe failure means "no window" (the clean fallback).
    let windowDoc = null;
    try {
      windowDoc = await fetchWindow();
    } catch {
      windowDoc = null;
    }
    if (windowDoc && Array.isArray(windowDoc.nodes) && windowDoc.nodes.length > 0) {
      try {
        onFirstPaint(buildWindowScene(windowDoc), windowDoc);
      } catch {
        // A paint failure must never break the full-scene load below.
      }
    }
  }
  return loadWorkspace({ fetchScene, fetchGraph, buildScene });
}
