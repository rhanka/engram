// Hover-intent DWELL gate for the connected-dim styling.
//
// PROBLEM (strobe): before the first selection/focus, hovering any node
// IMMEDIATELY dimmed the rest of the graph (buildConnectedDimStyle), and leaving
// un-dimmed it — so sweeping the pointer across the graph strobed the whole graph
// dim/undim.
//
// FIX: while NO selection AND NO focus exists, require the pointer to DWELL on an
// object ~200ms before applying the rest-of-graph dim. If the pointer leaves the
// object (or moves to empty space) before the dwell elapses, the dim is never
// applied. Once a selection/focus exists, the dim stays IMMEDIATE — the
// established behavior is unchanged; only the pre-first-selection path is gated.
//
// The hovered object's OWN feedback (tooltip + label + edge emphasis) is left
// immediate by the caller; only the REST-OF-GRAPH dim flows through this gate.

export const HOVER_INTENT_DWELL_MS = 200;

/**
 * True when the connected-dim should be DEFERRED behind the dwell delay: only
 * before the first selection/focus. With a selection OR a focus present the dim
 * is applied immediately (the established behavior).
 *
 * @param {{ selectedIds?: unknown, focusId?: unknown }} state
 */
export function shouldDelayConnectedDim({ selectedIds, focusId } = {}) {
  const hasSelection = Array.isArray(selectedIds)
    ? selectedIds.length > 0
    : Boolean(selectedIds);
  const hasFocus = focusId !== null && focusId !== undefined;
  return !hasSelection && !hasFocus;
}

/**
 * Small dwell-timer controller. `apply` performs the actual rest-of-graph dim
 * (reads the live hover/selection/focus when invoked). Timers are injectable so
 * the gate is unit-testable with fake timers and SSR-safe.
 *
 * @param {() => void} apply
 * @param {{ delayMs?: number, setTimer?: (fn: () => void, ms: number) => unknown, clearTimer?: (id: unknown) => void }} [opts]
 */
export function createHoverIntent(apply, {
  delayMs = HOVER_INTENT_DWELL_MS,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
} = {}) {
  let timer = null;

  function cancel() {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
  }

  /**
   * Request the dim for the CURRENT hover. `immediate` (a selection/focus is
   * present, or the hover is clearing and must restore the base style now)
   * applies it synchronously; otherwise the dim is deferred until the pointer
   * dwells `delayMs`. Any prior pending dwell is cancelled first, so a hover
   * target change restarts the dwell rather than firing early.
   *
   * @param {{ immediate?: boolean }} [options]
   */
  function request({ immediate = false } = {}) {
    cancel();
    if (immediate) {
      apply();
      return;
    }
    timer = setTimer(() => {
      timer = null;
      apply();
    }, delayMs);
  }

  return {
    request,
    cancel,
    isPending: () => timer !== null,
  };
}
