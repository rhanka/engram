// Render-backend selection + box-text overlay helpers for the studio's
// dual-render BETA switch (Ctrl+Shift+X).
//
//   Mode A = canvas2d  → the DEFAULT, current behavior. The canvas2d backend
//                        draws node shapes, edges, AND in-box label text itself.
//   Mode B = WebGL2    → the beta backend: { backend: "webgl",
//                        instancedShapes: true }. On a real WebGL2 context it
//                        draws node shapes (P1), edges (P2) and box fill/border
//                        (P3) on the GPU, but the in-box LABEL TEXT is collected
//                        as `renderer.boxTextDraws()` and painted by a stacked
//                        Canvas2D overlay (hybrid B1-P3) — the same text engine
//                        the canvas2d golden uses, parity by construction.
//
// This logic lives in a plain module (not the Svelte component) so the backend
// choice, the graceful WebGL2-unavailable fallback, the overlay paint, and the
// toggle are unit-testable with a mocked renderer factory.

export const CANVAS2D_BACKEND = "canvas2d";
export const WEBGL2_BACKEND = "webgl";

/**
 * `createGraphRenderer` options for a studio render mode.
 *  - Mode A (canvas2d): the DEFAULT.
 *  - Mode B (webgl): the WebGL2 beta — instanced shapes/edges/boxes.
 */
export function rendererOptionsFor(backend, pixelRatio) {
  if (backend === WEBGL2_BACKEND) {
    // Mode B (WebGL2 beta) requests a MULTISAMPLED context (antialias:true) so the
    // GPU edges + node-shape borders get MSAA smoothing — without it the beta read
    // more JAGGED than Canvas2D in real-browser UAT (the renderer's acquireContext
    // honours options.antialias, which defaults to false). The Canvas2D branch and
    // the golden harness are intentionally left untouched (the golden capture keeps
    // its own deterministic context options).
    return { backend: WEBGL2_BACKEND, instancedShapes: true, antialias: true, pixelRatio };
  }
  return { backend: CANVAS2D_BACKEND, pixelRatio };
}

/** Toggle between the two render modes (A ↔ B). */
export function toggleBackend(backend) {
  return backend === WEBGL2_BACKEND ? CANVAS2D_BACKEND : WEBGL2_BACKEND;
}

/** Transient indicator-badge text for the active backend. */
export function backendIndicatorLabel(backend) {
  return backend === WEBGL2_BACKEND ? "Render: WebGL2 (beta)" : "Render: Canvas2D";
}

/** True when the renderer actually drew on a WebGL2 backend. */
export function isWebglActive(renderer) {
  return renderer?.snapshot?.().backend === WEBGL2_BACKEND;
}

/**
 * True when a keyboard event is the dual-render toggle shortcut: Ctrl+Shift+X.
 * Matches on `code` ("KeyX") or `key` ("x"/"X") so it survives layouts where
 * the Shift+x key value differs.
 */
export function isToggleShortcut(event) {
  if (!event || !event.ctrlKey || !event.shiftKey) return false;
  if (event.code === "KeyX") return true;
  return typeof event.key === "string" && event.key.toLowerCase() === "x";
}

/**
 * Create the renderer for `requestedBackend` with a GRACEFUL WebGL2 fallback:
 * when mode B is requested but the renderer comes back on canvas2d/none (no
 * WebGL2 in this environment), the webgl renderer is destroyed and a canvas2d
 * renderer is created instead, so the studio always renders something.
 *
 * @param create  the `createGraphRenderer` factory (injected so it is mockable).
 * @returns { renderer, backend, fellBack } — `backend` is the ACTIVE backend
 *          and `fellBack` is true when mode B degraded to canvas2d.
 */
export function createBackendRenderer(create, canvas, requestedBackend, pixelRatio) {
  const renderer = create(canvas, rendererOptionsFor(requestedBackend, pixelRatio));
  if (requestedBackend === WEBGL2_BACKEND && !isWebglActive(renderer)) {
    renderer?.destroy?.();
    const canvas2d = create(canvas, rendererOptionsFor(CANVAS2D_BACKEND, pixelRatio));
    return { renderer: canvas2d, backend: CANVAS2D_BACKEND, fellBack: true };
  }
  return {
    renderer,
    backend: requestedBackend === WEBGL2_BACKEND ? WEBGL2_BACKEND : CANVAS2D_BACKEND,
    fellBack: false,
  };
}

/**
 * Paint (or clear) the stacked Canvas2D overlay that carries the in-box label
 * text for the WebGL2 box glyphs.
 *
 *   Mode A → the overlay stays CLEARED (canvas2d already drew its own in-box
 *            text inside the glyph).
 *   Mode B → clear, then paint `renderer.boxTextDraws()` (device-px coords with
 *            each draw's font/label/alpha) via `drawBoxLabels` — the same
 *            canvas2d text engine, composited on top of the WebGL canvas.
 *
 * The overlay backing store is expected to match the WebGL canvas (device px),
 * so the box draws land exactly on the GPU boxes with no extra transform.
 */
export function paintBoxTextOverlay({ overlayCtx, overlayCanvas, renderer, backend, drawBoxLabels }) {
  if (!overlayCtx || !overlayCanvas) return [];
  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  if (backend !== WEBGL2_BACKEND || !renderer) return [];
  const draws = renderer.boxTextDraws?.() ?? [];
  drawBoxLabels(overlayCtx, draws);
  return draws;
}
