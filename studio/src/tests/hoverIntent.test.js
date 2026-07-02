import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  HOVER_INTENT_DWELL_MS,
  createHoverIntent,
  shouldDelayConnectedDim,
} from "../lib/hoverIntent.js";

const graphCanvasSource = () =>
  readFileSync(resolve("src/components/GraphCanvas.svelte"), "utf8");

describe("hover-intent dwell gate", () => {
  it("defers the dim ONLY before the first selection/focus", () => {
    // No selection AND no focus → defer (dwell).
    expect(shouldDelayConnectedDim({ selectedIds: [], focusId: null })).toBe(true);
    expect(shouldDelayConnectedDim({ selectedIds: [], focusId: undefined })).toBe(true);
    expect(shouldDelayConnectedDim({})).toBe(true);
    // A selection OR a focus → immediate (established behavior).
    expect(shouldDelayConnectedDim({ selectedIds: ["a"], focusId: null })).toBe(false);
    expect(shouldDelayConnectedDim({ selectedIds: [], focusId: "f" })).toBe(false);
    expect(shouldDelayConnectedDim({ selectedIds: ["a", "b"], focusId: "f" })).toBe(false);
  });

  describe("createHoverIntent timer", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("no-selection hover: NO dim before 200ms, dim AFTER", () => {
      const apply = vi.fn();
      const hi = createHoverIntent(apply);

      hi.request({ immediate: false });
      vi.advanceTimersByTime(HOVER_INTENT_DWELL_MS - 1);
      expect(apply).not.toHaveBeenCalled(); // still within the dwell
      expect(hi.isPending()).toBe(true);

      vi.advanceTimersByTime(1);
      expect(apply).toHaveBeenCalledTimes(1); // dwell elapsed → dim
      expect(hi.isPending()).toBe(false);
    });

    it("pointer leaves (cancel) before the dwell → NEVER dims", () => {
      const apply = vi.fn();
      const hi = createHoverIntent(apply);

      hi.request({ immediate: false });
      vi.advanceTimersByTime(100); // leave mid-dwell
      hi.cancel();
      vi.advanceTimersByTime(1000);
      expect(apply).not.toHaveBeenCalled();
    });

    it("selection/focus present → IMMEDIATE dim (no dwell)", () => {
      const apply = vi.fn();
      const hi = createHoverIntent(apply);

      hi.request({ immediate: true });
      expect(apply).toHaveBeenCalledTimes(1); // synchronous, before any timer
      expect(hi.isPending()).toBe(false);
    });

    it("hover target change restarts the dwell (no early dim)", () => {
      const apply = vi.fn();
      const hi = createHoverIntent(apply);

      hi.request({ immediate: false }); // hover node A
      vi.advanceTimersByTime(150);
      hi.request({ immediate: false }); // moved to node B before A's dwell elapsed
      vi.advanceTimersByTime(150); // 150ms into B's dwell (A's timer was cancelled)
      expect(apply).not.toHaveBeenCalled();
      vi.advanceTimersByTime(50); // B's full 200ms now elapsed
      expect(apply).toHaveBeenCalledTimes(1);
    });

    it("an immediate request cancels a pending dwell (selection appears mid-dwell)", () => {
      const apply = vi.fn();
      const hi = createHoverIntent(apply);

      hi.request({ immediate: false });
      vi.advanceTimersByTime(120);
      hi.request({ immediate: true }); // selection appeared → dim now
      expect(apply).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1000);
      expect(apply).toHaveBeenCalledTimes(1); // the stale dwell did NOT also fire
    });
  });
});

// Source-text guard: the component must wire the dwell gate into the hover path
// (only the rest-of-graph dim is deferred; tooltip/label stay immediate).
describe("GraphCanvas hover-intent wiring", () => {
  it("gates the connected-dim through the hover-intent dwell", () => {
    const source = graphCanvasSource();
    expect(source).toContain('from "../lib/hoverIntent.js"');
    expect(source).toContain("createHoverIntent");
    expect(source).toContain("shouldDelayConnectedDim");
    // setHoveredNode no longer applies the dim inline; it requests it via the gate.
    expect(source).toContain("requestConnectedDim");
    expect(source).toContain("applyConnectedDim");
    // the dwell is cancelled on pan/drag start, on selection change, and on destroy.
    expect(source).toContain("hoverIntent.cancel()");
  });
});
