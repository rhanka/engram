import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  CANVAS2D_BACKEND,
  WEBGL2_BACKEND,
  backendIndicatorLabel,
  createBackendRenderer,
  isToggleShortcut,
  isWebglActive,
  paintBoxTextOverlay,
  rendererOptionsFor,
  toggleBackend,
} from "../lib/renderBackend.js";

// A no-op recorder renderer. `snapshotBackend` controls what snapshot().backend
// reports — that is how createBackendRenderer decides WebGL2 was (un)available.
function makeRenderer(snapshotBackend, boxDraws = []) {
  return {
    boxTextDraws: vi.fn(() => boxDraws),
    snapshot: vi.fn(() => ({ backend: snapshotBackend })),
    destroy: vi.fn(),
    render: vi.fn(),
  };
}

function makeOverlay() {
  const ctx = { clearRect: vi.fn() };
  return { canvas: { width: 800, height: 600 }, ctx };
}

const graphCanvasSource = () =>
  readFileSync(resolve("src/components/GraphCanvas.svelte"), "utf8");

describe("dual-render backend lib", () => {
  it("builds canvas2d options for mode A and webgl+instancedShapes for mode B", () => {
    expect(rendererOptionsFor(CANVAS2D_BACKEND, 2)).toEqual({
      backend: "canvas2d",
      pixelRatio: 2,
    });
    expect(rendererOptionsFor(WEBGL2_BACKEND, 2)).toEqual({
      backend: "webgl",
      instancedShapes: true,
      // Mode B requests a MULTISAMPLED context (#229) so GPU edges/borders get
      // MSAA smoothing — the lib returns antialias:true for WebGL2.
      antialias: true,
      pixelRatio: 2,
    });
  });

  it("toggles A <-> B and labels each backend", () => {
    expect(toggleBackend(CANVAS2D_BACKEND)).toBe(WEBGL2_BACKEND);
    expect(toggleBackend(WEBGL2_BACKEND)).toBe(CANVAS2D_BACKEND);
    expect(backendIndicatorLabel(WEBGL2_BACKEND)).toBe("Render: WebGL2 (beta)");
    expect(backendIndicatorLabel(CANVAS2D_BACKEND)).toBe("Render: Canvas2D");
  });

  it("recognizes Ctrl+Shift+X (by code or key) and rejects everything else", () => {
    expect(isToggleShortcut({ ctrlKey: true, shiftKey: true, code: "KeyX" })).toBe(true);
    expect(isToggleShortcut({ ctrlKey: true, shiftKey: true, key: "X" })).toBe(true);
    expect(isToggleShortcut({ ctrlKey: true, shiftKey: true, key: "x" })).toBe(true);
    expect(isToggleShortcut({ ctrlKey: true, shiftKey: false, code: "KeyX" })).toBe(false);
    expect(isToggleShortcut({ ctrlKey: false, shiftKey: true, code: "KeyX" })).toBe(false);
    expect(isToggleShortcut({ ctrlKey: true, shiftKey: true, code: "KeyZ" })).toBe(false);
    expect(isToggleShortcut(null)).toBe(false);
  });

  it("mode A creates a canvas2d renderer with no fallback", () => {
    const create = vi.fn((_c, opts) => makeRenderer(opts.backend));
    const out = createBackendRenderer(create, {}, CANVAS2D_BACKEND, 1);
    expect(out.backend).toBe(CANVAS2D_BACKEND);
    expect(out.fellBack).toBe(false);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][1]).toEqual({ backend: "canvas2d", pixelRatio: 1 });
  });

  it("mode B keeps webgl when a WebGL2 context is available", () => {
    const create = vi.fn(() => makeRenderer(WEBGL2_BACKEND));
    const out = createBackendRenderer(create, {}, WEBGL2_BACKEND, 1);
    expect(out.backend).toBe(WEBGL2_BACKEND);
    expect(out.fellBack).toBe(false);
    expect(create).toHaveBeenCalledTimes(1);
    expect(isWebglActive(out.renderer)).toBe(true);
  });

  it("mode B falls back to canvas2d (destroy + recreate) when WebGL2 is unavailable", () => {
    // First creation reports canvas2d/none (no WebGL2): the helper must destroy
    // it and recreate on canvas2d.
    const webglAttempt = makeRenderer(CANVAS2D_BACKEND);
    const canvas2dRenderer = makeRenderer(CANVAS2D_BACKEND);
    const create = vi
      .fn()
      .mockReturnValueOnce(webglAttempt)
      .mockReturnValueOnce(canvas2dRenderer);

    const out = createBackendRenderer(create, {}, WEBGL2_BACKEND, 1);

    expect(out.backend).toBe(CANVAS2D_BACKEND);
    expect(out.fellBack).toBe(true);
    expect(out.renderer).toBe(canvas2dRenderer);
    expect(webglAttempt.destroy).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0][1]).toMatchObject({ backend: "webgl", instancedShapes: true });
    expect(create.mock.calls[1][1]).toEqual({ backend: "canvas2d", pixelRatio: 1 });
  });

  it("mode B overlay paint clears then draws boxTextDraws()", () => {
    const draws = [{ nodeIndex: 0, centerX: 10, centerY: 20, height: 8, label: "Work", borderWidth: 2, borderColor: "rgba(0,0,0,1)", alpha: 1 }];
    const renderer = makeRenderer(WEBGL2_BACKEND, draws);
    const { canvas, ctx } = makeOverlay();
    const drawBoxLabels = vi.fn();

    const painted = paintBoxTextOverlay({
      overlayCtx: ctx,
      overlayCanvas: canvas,
      renderer,
      backend: WEBGL2_BACKEND,
      drawBoxLabels,
    });

    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 800, 600);
    expect(renderer.boxTextDraws).toHaveBeenCalledTimes(1);
    expect(drawBoxLabels).toHaveBeenCalledWith(ctx, draws);
    expect(painted).toBe(draws);
  });

  it("mode A overlay paint stays cleared and never touches boxTextDraws()", () => {
    const renderer = makeRenderer(CANVAS2D_BACKEND, [{ nodeIndex: 0 }]);
    const { canvas, ctx } = makeOverlay();
    const drawBoxLabels = vi.fn();

    paintBoxTextOverlay({
      overlayCtx: ctx,
      overlayCanvas: canvas,
      renderer,
      backend: CANVAS2D_BACKEND,
      drawBoxLabels,
    });

    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 800, 600);
    expect(renderer.boxTextDraws).not.toHaveBeenCalled();
    expect(drawBoxLabels).not.toHaveBeenCalled();
  });

  it("simulating Ctrl+Shift+X toggles the backend, recreates the renderer, and paints the overlay via boxTextDraws()", () => {
    // Start this toggle simulation from mode A (canvas2d); the toggle mechanics are
    // backend-agnostic. (The studio BOOT default is WebGL2 — covered separately.)
    let activeBackend = CANVAS2D_BACKEND;
    const draws = [{ nodeIndex: 0, centerX: 1, centerY: 2, height: 8, label: "Hub", borderWidth: 2, borderColor: "rgba(1,2,3,1)", alpha: 1 }];
    // The factory hands out a webgl renderer when webgl is requested (WebGL2
    // available in this simulated env), else a canvas2d one.
    const create = vi.fn((_canvas, opts) =>
      makeRenderer(opts.backend === "webgl" ? WEBGL2_BACKEND : CANVAS2D_BACKEND, draws),
    );
    const drawBoxLabels = vi.fn();
    const { canvas: overlayCanvas, ctx: overlayCtx } = makeOverlay();

    // Mount: build the default (mode A) renderer.
    let { renderer, backend } = createBackendRenderer(create, {}, activeBackend, 1);
    activeBackend = backend;
    expect(activeBackend).toBe(CANVAS2D_BACKEND);

    // Press Ctrl+Shift+X.
    const event = { ctrlKey: true, shiftKey: true, code: "KeyX", preventDefault: vi.fn() };
    expect(isToggleShortcut(event)).toBe(true);
    activeBackend = toggleBackend(activeBackend);
    expect(activeBackend).toBe(WEBGL2_BACKEND);

    // Force a rebuild on the new backend (destroy the old one first, as the
    // component does).
    renderer.destroy();
    ({ renderer, backend } = createBackendRenderer(create, {}, activeBackend, 1));
    activeBackend = backend;
    expect(activeBackend).toBe(WEBGL2_BACKEND);
    // createBackendRenderer was called twice (mount + toggle rebuild).
    expect(create).toHaveBeenCalledTimes(2);

    // Render → paint overlay: in mode B the overlay paint reads boxTextDraws().
    renderer.render();
    paintBoxTextOverlay({ overlayCtx, overlayCanvas, renderer, backend: activeBackend, drawBoxLabels });
    expect(renderer.boxTextDraws).toHaveBeenCalled();
    expect(drawBoxLabels).toHaveBeenCalledWith(overlayCtx, draws);
  });
});

// Source-text guards: the component must wire the lib in (default canvas2d, the
// keyboard toggle, the stacked overlay, the indicator badge).
describe("GraphCanvas dual-render wiring", () => {
  it("imports the render-backend lib and BOOTS on WebGL2 with a canvas2d fallback (P6 flip)", () => {
    const source = graphCanvasSource();
    expect(source).toContain('from "../lib/renderBackend.js"');
    // P6 flip: the studio now boots on WebGL2 (was CANVAS2D_BACKEND), relying on
    // the EXISTING graceful fallback when no WebGL2 context exists.
    expect(source).toMatch(/activeBackend\s*=\s*\$state\(\s*WEBGL2_BACKEND\s*\)/);
    expect(source).not.toMatch(/activeBackend\s*=\s*\$state\(\s*CANVAS2D_BACKEND\s*\)/);
    // Graceful fallback still wired: createBackendRenderer's fellBack path reverts
    // activeBackend to canvas2d and flags backendUnavailable.
    expect(source).toContain("createBackendRenderer");
    expect(source).toMatch(/result\.fellBack/);
    expect(source).toMatch(/backendUnavailable\s*=\s*true/);
    // The badge is revealed on the boot fallback so the unavailable state shows.
    expect(source).toMatch(/switchActivated\s*\|\|\s*backendUnavailable/);
  });

  it("adds a window keydown listener for the Ctrl+Shift+X toggle and removes it on destroy", () => {
    const source = graphCanvasSource();
    expect(source).toContain("isToggleShortcut");
    expect(source).toContain('addEventListener("keydown"');
    expect(source).toContain('removeEventListener("keydown"');
  });

  it("stacks a box-text overlay canvas and paints it after render", () => {
    const source = graphCanvasSource();
    expect(source).toContain("overlayCanvas");
    expect(source).toContain("paintBoxTextOverlay");
    expect(source).toContain("drawBoxLabels2D");
    expect(source).toContain("render-indicator");
  });
});
