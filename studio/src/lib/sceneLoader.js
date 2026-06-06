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
