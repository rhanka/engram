<script>
  import { onDestroy, onMount, tick, untrack } from "svelte";
  import { Button, ButtonGroup, IconButton, Popover, Switch } from "@sentropic/design-system-svelte";
  import Settings from "@lucide/svelte/icons/settings";
  import { createGraphRenderer, drawBoxLabels2D } from "@sentropic/graph";
  import { solveForce, terminateForceWorker } from "../lib/forceLayoutClient.js";

  import {
    buildConnectedDimStyle,
    buildGraphRendererPayload,
    COLOR_BY_CHURN,
    COLOR_BY_FOLDER,
    COLOR_BY_LAYER,
    DEFAULT_EDGE_OPACITY,
    EDGE_ALPHA_DENSE,
    EDGE_ALPHA_FLAT,
    EDGE_ALPHA_INVERSE,
    EDGE_ALPHA_MID,
    carryScenePositions,
    computeLayoutBuffer,
    findNearestEdge,
    findNearestNode,
    findNearestNodeId,
    goldenAngleFan,
    interpolateGroupFadeStyle,
    interpolateMergeStyle,
    interpolateMergePositions,
    isBoxShape,
    LABEL_ZOOM_THRESHOLD,
    LAYOUT_MODE_FORCE,
    LAYOUT_MODES,
    morphPositions,
    resolveGroupFolds,
    truncateLabel,
  } from "../lib/graphRendererPayload.js";
  import {
    CANVAS2D_BACKEND,
    WEBGL2_BACKEND,
    backendIndicatorLabel,
    createBackendRenderer,
    isToggleShortcut,
    paintBoxTextOverlay as paintBoxOverlay,
    toggleBackend,
  } from "../lib/renderBackend.js";
  import {
    createHoverIntent,
    shouldDelayConnectedDim,
  } from "../lib/hoverIntent.js";

  const EMPTY_SCENE = {
    nodes: [],
    edges: [],
    stats: { nodeCount: 0, edgeCount: 0, communityCount: 0 },
  };
  const NODE_RADIUS = 3;
  const FIT_PADDING = 48;
  const PICK_RADIUS = 16;
  const EDGE_PICK_RADIUS = 12;
  // Extra CSS px around a node's drawn radius that still counts as an
  // unambiguous node-hover (so the cursor doesn't have to be pixel-perfect on
  // the glyph). Beyond this, node vs edge is decided by normalized distance.
  const NODE_TIGHT_SLOP = 4;
  const HOVER_EDGE_COLOR = [37, 99, 235, 255];
  const MERGE_ANIMATION_DURATION_MS = 520;
  // codeflow-parity Lot 1: duration of the all-node layout MORPH tween
  // (Force ↔ Layers). Kept in the ~300–500 ms band the spec calls for, so
  // labels + interaction are only locked briefly (§2.6).
  const LAYOUT_MORPH_DURATION_MS = 480;
  const FORCE_SPREAD_DEFAULT = 1;
  const FORCE_LINKS_DEFAULT = 0.6;
  const FORCE_SLIDER_ITERATIONS = 180;
  // CANVAS2D ONLY: hide edges during active pan/zoom/drag when nodes+edges exceed
  // this, for interaction fluidity (a legacy SVG-era guard). WebGL2 NEVER skips
  // (GPU-instanced edges are cheap) — see `skipEdgesOnInteract`.
  //
  // Threshold raised 1000 → 6000 from a Skia/Canvas2D bench (Skia is the SAME
  // rasterizer Chrome's 2D canvas uses), median per-frame full render() at
  // 1440×900 DPR1 (.graphify/scratch/edge-skip-bench.mjs):
  //   ·   1000 obj (old threshold): ~2.9 ms  (~343 fps) — skipping was absurdly
  //       over-conservative for graphs this cheap.
  //   ·   mystery 5676 obj (1983n/3693e): ~17 ms (~58 fps), ~13 ms of it edges.
  //   ·   5k edges  / 7500 obj:  ~22.5 ms (~44 fps)
  //   ·  10k edges  / 15000 obj: ~45 ms   (~22 fps)
  //   ·  20k edges  / 28000 obj: ~87 ms   (~11 fps)
  // 6000 sits just ABOVE mystery scale so typical graphs (incl. mystery) keep
  // edges live during interaction (~58 fps, smooth), and just BELOW the 5k-edge
  // step so denser graphs — and especially 10k+ edges (the non-regression guard)
  // — still skip edges during pan/zoom to stay fluid. (See PR description.)
  const EDGE_SKIP_THRESHOLD = 6000;
  // Delay before restoring edges after the last wheel/zoom event settles.
  const ZOOM_SETTLE_MS = 150;
  // Boxed labels: show a label for nodes whose degree >= this fraction of the max
  // degree (matches the legacy export.ts font rule: deg >= maxDeg * 0.15 → visible),
  // plus always for the active (hovered/selected/focused/dragged) node.
  const LABEL_DEGREE_RATIO = 0.15;
  // Above this label count we skip rendering labels during an active pan/zoom/drag
  // and restore them once the interaction settles (perf on very dense graphs).
  const LABEL_SKIP_THRESHOLD = 80;
  // Past this many CSS px of pointer movement, a node press becomes a drag (vs a click).
  const DRAG_MOVE_THRESHOLD = 3;

  let {
    scene = EMPTY_SCENE,
    // Optional UNIFIED scene-transition descriptor (4-state visibility), produced
    // by App when the grouped set OR the display-hidden mask changes:
    //   { folded: Map<childId, groupId>, unfolded: Map<childId, groupId>,
    //     hiddenIds: Set<nodeId>, revealedIds: Set<nodeId>, kind: "out"|"in"|"mixed" }.
    // Routed through the SAME carry-over tween as group/ungroup — folded → anchor,
    // hidden → fade-in-place (bufB==bufA), revealed → fade-in-at-cached-target.
    // Absent/null ⇒ the hard-cut refit (safety fallback). See the scene $effect below.
    groupTransition = null,
    selectedIds = [],
    centerOnIds = [],
    focusId = null,
    onSelect,
    onOpenEntity,
    onEdgeHover,
    mergePair = null,
    onMergeComplete,
    edgeSkipThreshold = EDGE_SKIP_THRESHOLD,
    labelDegreeRatio = LABEL_DEGREE_RATIO,
    // 'none'  → no generic labels (workspace / main graph).
    // 'plain' → plain-text labels (no box) for high-degree + active nodes (recon).
    labelMode = "none",
    // BUG-1: max DRAWN chars for in-box labels + DOM overlay labels. The full
    // label is always available on hover (tooltip + overlay `title`). Undefined
    // falls back to the renderer default (DEFAULT_LABEL_MAX_CHARS).
    labelMaxChars = undefined,
    // codeflow-parity Lot 1: show the layout switcher (Force · Layers) in the
    // toolbar and enable the all-node layout MORPH. Opt-in — only the workspace
    // main graph passes it; the reconciliation view (pinned twins, its own local
    // layout) and git-flow leave it off so the animated switcher is scoped there.
    showLayoutSwitcher = false,
  } = $props();

  let container;
  let canvas;
  // Stacked Canvas2D overlay that paints the in-box label text for the WebGL2
  // box glyphs (mode B); stays cleared in mode A (canvas2d draws its own text).
  let overlayCanvas;
  let overlayCtx = null;
  let renderer = null;
  let payload = null;
  let camera = { x: 0, y: 0, zoom: 1 };
  let pixelRatio = 1;
  let mounted = false;

  // Dual-render switch (Ctrl+Shift+X). Mode A = canvas2d, Mode B = WebGL2.
  // P6 FLIP: the studio now BOOTS on WebGL2 (instancedShapes). `ensureRenderer`
  // uses the EXISTING graceful fallback — when no WebGL2 context is available it
  // reverts to canvas2d (mode A) and sets `backendUnavailable`. Ctrl+Shift+X
  // still toggles both ways.
  let activeBackend = $state(WEBGL2_BACKEND);
  // True when WebGL2 was requested but no context was available, so we reverted
  // to canvas2d — set at boot (fallback) or on a failed manual switch.
  let backendUnavailable = $state(false);
  // Render-mode badge. On a successful WebGL2 boot it stays HIDDEN (clean UI);
  // the FIRST Ctrl+Shift+X / badge-click reveals it. When the WebGL2 boot FALLS
  // BACK to canvas2d (`backendUnavailable`) the badge is REVEALED immediately so
  // the user sees the unavailable state. Once visible it reflects the live
  // backend on every subsequent switch; `justToggled` briefly pulses it.
  let switchActivated = $state(false);
  let justToggled = $state(false);
  let indicatorTimer = null;
  const backendBadge = $derived(
    backendUnavailable && activeBackend === CANVAS2D_BACKEND
      ? "WebGL2 unavailable — Canvas2D"
      : backendIndicatorLabel(activeBackend),
  );
  let resizeObserver = null;
  let resizeFrame = null;
  let mergeFrame = null;
  let completedMergeKey = null;

  // --- codeflow-parity Lot 1: layout switcher + all-node morph tween ---------
  // The currently-selected layout mode (drives the segmented control + morph).
  let layoutMode = $state(LAYOUT_MODE_FORCE);
  // rAF handle for the in-flight layout morph (distinct from the merge loop).
  let layoutMorphFrame = null;
  // rAF handle for the in-flight collapse/expand GROUP transition (distinct from
  // both the merge loop and the layout morph — a group action can arrive while a
  // layout morph settles, so it owns its own handle to cancel independently).
  let groupTweenFrame = null;
  // The LIVE interpolated buffer of the in-flight morph — re-seeds `bufA` on an
  // interrupt (switching mid-morph) and is re-applied after a selection/hover
  // rebuild so the effect can't clobber the tween (cf. reapplyDraggedPositions).
  let liveMorphBuffer = null;
  // The SETTLED target buffer of the last committed layout (null before any
  // switch/re-solve, when the native scene positions apply). Re-applied after
  // every payload rebuild so a Layers layout — OR a Lot-3 Force re-solve
  // (Spread/Links/Reset) — survives a selection/hover-driven rebuild.
  let activeLayoutBuffer = null;
  // The CACHED pristine force positions captured at scene-build time — the
  // morph TARGET for switch-to-Force (Lot 1 never cold re-solves force).
  let forceBaseBuffer = null;
  // True while a layout morph is in flight: hides labels + locks canvas
  // interaction for the (~480 ms) tween, exactly as pan/zoom already do.
  let morphActive = $state(false);

  // --- Collapse/expand GROUP-transition state (redesign spec §3) -------------
  // Consumed-once guard (RC-D): groupTransition is a memoized $derived, so a
  // redundant scene tick re-reads the SAME non-null descriptor. We keep the last
  // consumed reference so only a GENUINELY new descriptor (new object) starts a
  // tween — a redundant re-read is treated as absent and never restarts it.
  let lastConsumedGroupTransition = null;
  // Rebuild-quiescence flag (RC-B): true from a COLLAPSE tween's start until its
  // carried swap has run. While set, updateSelection/updateDisplayStyle DEFER
  // (payload is intentionally one scene behind the `scene` prop); the deferred
  // restyle is applied ONCE after the swap. Expand never sets it (its payload is
  // already current). $state per spec §3.3 (harmless — read only imperatively).
  let groupSwapPending = $state(false);
  // Set when a selection/display rebuild was deferred during groupSwapPending, so
  // exactly one post-swap updateSelection() runs (the change is queued, not lost).
  let pendingPostSwapRestyle = false;
  // The "jump straight to the end state" closure of the IN-FLIGHT group tween
  // (collapse → finishCollapseSwap; expand → settleGroupTween(bufB)). Used by the
  // abnormal-frame abort (§3.7) AND by the scene-effect interrupt rule so a
  // genuine new transition first COMPLETES the pending swap synchronously (payload
  // never lags two scenes behind). Cleared by the settle it invokes.
  let pendingGroupSettle = null;
  // Position cache for expand target restoration (§3.6): folded child id →
  // {x, y, epoch}. A collapse→expand round trip (same epoch) restores the exact
  // prior constellation; a genuine coordinate-space change bumps `coordinateEpoch`
  // so stale entries are ignored (expand then falls back to the golden-angle fan).
  const lastKnownPosById = new Map();
  let coordinateEpoch = 0;
  // Content signature of the last selection we rebuilt from (§3.3 hardening):
  // resolveSelectedIds returns a FRESH array on every group toggle even when its
  // content is identical, so comparing content (not identity) stops those no-op
  // rebuilds from firing under a collapse tween.
  let lastSelectionKey = null;

  // --- codeflow-parity Lot 3: Spread / Links force re-solve controls ---------
  // Spread maps to computeLayout(repulsion), Links maps to computeLayout's new
  // linkDistance rest-length factor. Slider changes are committed on drag-end
  // (change event), not per input frame, because a Barnes-Hut solve is too heavy
  // for 60Hz. Interactive solves warm-start from the current buffer; Reset is the
  // deterministic cold solve for the selected parameter values.
  let forceSpread = $state(FORCE_SPREAD_DEFAULT);
  let forceLinks = $state(FORCE_LINKS_DEFAULT);
  // Lot 7: monotonic token so a worker solve that resolves AFTER a scene-content
  // change (or a newer slider commit) is discarded instead of morphing a stale
  // buffer sized for the previous node set.
  let forceSolveToken = 0;

  // --- codeflow-parity Lot 4: Curved-links toggle + Color-by (Folder/Layer) ---
  // Both are per-render style attributes (edge curvature / node colour keying),
  // so a change re-styles LIVE — rebuild payload + re-render, NO layout recompute
  // and NO morph (applyPayloadNoFit preserves camera + the active layout buffer).
  // Defaults MATCH the current studio behaviour (curved ON, colour by Folder), so
  // an untouched control is byte-identical to before this lot.
  let curvedLinks = $state(true);
  let colorMode = $state(COLOR_BY_FOLDER);
  // The Color-by options exposed by the segmented control.
  const COLOR_MODES = [
    // graphify terms (not codeflow's code-graph vocabulary): community/container,
    // typed layer / node_type = ontology, degree heat. English UI — i18n later.
    { id: COLOR_BY_FOLDER, label: "Community" },
    { id: COLOR_BY_LAYER, label: "Ontology" },
    { id: COLOR_BY_CHURN, label: "Degree" },
  ];

  // Configurable edge-transparency: the along-edge fade MODE + the flat base
  // OPACITY. Both re-style LIVE like Color-by (per-render edge attributes: the
  // alpha SHAPE + the base alpha), so a change rebuilds the payload + re-renders
  // with NO layout recompute + NO morph. Defaults (dense fade, 0.5 opacity) match
  // the studio's prior ~0.5 base + hub density-falloff, so an untouched control
  // is byte-identical to before.
  let edgeAlphaMode = $state(EDGE_ALPHA_DENSE);
  let edgeOpacity = $state(DEFAULT_EDGE_OPACITY);
  // The Edge-fade options exposed by the segmented control (default first).
  const EDGE_FADE_MODES = [
    { id: EDGE_ALPHA_DENSE, label: "Dense" },
    { id: EDGE_ALPHA_INVERSE, label: "Inverse" },
    { id: EDGE_ALPHA_MID, label: "Mid" },
    { id: EDGE_ALPHA_FLAT, label: "Flat" },
  ];

  // Representation-polish remark 4: the whole layout/spacing/display toolbar
  // collapses behind a gear icon into a settings popover (codeflow parity),
  // instead of a permanently-open row of controls crowding the canvas.
  let settingsOpen = $state(false);
  let settingsHost;

  function toggleSettings() {
    settingsOpen = !settingsOpen;
  }

  function closeSettings() {
    settingsOpen = false;
  }

  // Click-outside / Escape to close, same lightweight pattern a DS Popover
  // leaves to its host (Popover itself is host-controlled, no built-in
  // dismiss-on-outside-click).
  function handleSettingsWindowPointerDown(event) {
    if (!settingsOpen || !settingsHost) return;
    if (!settingsHost.contains(event.target)) closeSettings();
  }

  function handleSettingsWindowKeydown(event) {
    if (settingsOpen && event.key === "Escape") {
      event.preventDefault();
      closeSettings();
    }
  }

  let hoveredEdge = $state(null);
  let hoveredNode = $state(null);
  let hoveredNodeId = $state(null);
  // Hover-intent dwell timer controller (Task B): defers the rest-of-graph
  // connected-dim until the pointer DWELLS, but ONLY before the first
  // selection/focus, so a pre-selection sweep across the graph no longer strobes.
  const hoverIntent = createHoverIntent(() => applyConnectedDim());

  // Scene identity tracking so we only auto-fit on a genuine new graph (not selection/focus).
  let lastScene = null;
  // Stable content signature of the last scene we built from. A `$derived.by`
  // scene (e.g. the reconciliation view) returns a NEW object on every recompute,
  // so comparing by object reference alone would refit/reset on any hover after a
  // drag (#2.4). We additionally compare a content signature (node ids + positions
  // + edge endpoints): a recompute that yields the SAME content does NOT refit,
  // which also preserves a dragged node's position across an incidental rebuild.
  let lastSceneKey = null;
  // BACKEND-AWARE edge-skip during active pan/zoom/drag. WebGL2 NEVER skips
  // (GPU-instanced edges are cheap), so this is false whenever the active backend
  // is WebGL2 — edges always render during interaction. On Canvas2D it skips only
  // past EDGE_SKIP_THRESHOLD objects. `$derived` so a Ctrl+Shift+X backend flip
  // (or a boot fallback to canvas2d) re-evaluates it immediately.
  const skipEdgesOnInteract = $derived(
    activeBackend !== WEBGL2_BACKEND &&
      (scene?.nodes?.length ?? 0) + (scene?.edges?.length ?? 0) > edgeSkipThreshold,
  );
  // Zoom-settle debounce timer: full-edge render after the last wheel event settles.
  let zoomSettleTimer = null;

  // Pan state — not reactive, managed imperatively
  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;
  let panStartCameraX = 0;
  let panStartCameraY = 0;

  // Node-degree cache: degree[nodeIndex] + maxDegree, recomputed on payload rebuild.
  // Drives both the boxed-label set (item 2) and avoids re-counting per hover.
  let nodeDegrees = [];
  let maxNodeDegree = 1;
  // High-degree node ids (degree >= ratio*max) eligible for a permanent boxed label.
  let labelEligibleIds = [];
  // Reactive list of { id, label, x, y } in CSS-pixel screen coords for the overlay.
  let labels = $state([]);
  // Suppress label rendering during an active interaction on dense graphs.
  let labelsHidden = $state(false);
  // Principal-character label LOD bucket of the last payload build: "out" =
  // top-K hub names only (zoomed out), "in" = all gated hub names (zoomed in).
  // A wheel that moves zoom across LABEL_ZOOM_THRESHOLD flips the bucket and
  // triggers a payload rebuild so the in-box name set follows the zoom.
  let lastLabelZoomBucket = null;
  const labelZoomBucket = (zoom) => (zoom > LABEL_ZOOM_THRESHOLD ? "in" : "out");

  // Node-drag state — not reactive, managed imperatively.
  let draggingNodeId = null;
  let dragNodeIndex = -1;
  let dragMoved = false;
  let dragStartX = 0;
  let dragStartY = 0;
  // Positions the user has dragged nodes to (id -> {x, y}), in world coords.
  // Re-applied after every payload rebuild so a selection/hover-driven rebuild
  // (which rebuilds payload from `scene`) preserves the dragged positions (#2.4).
  let draggedPositions = new Map();
  // Set true when a drag finishes so the trailing click doesn't also select.
  let suppressNextClick = false;

  const hasNodes = $derived((scene?.nodes?.length ?? 0) > 0);

  function readPixelRatio() {
    if (typeof window === "undefined") return 1;
    return Math.max(Number.EPSILON, window.devicePixelRatio || 1);
  }

  function resizeCanvas() {
    if (!canvas || !container) return false;

    const rect = container.getBoundingClientRect();
    const nextWidth = Math.max(1, Math.round(rect.width * pixelRatio));
    const nextHeight = Math.max(1, Math.round(rect.height * pixelRatio));
    const changed = canvas.width !== nextWidth || canvas.height !== nextHeight;

    if (changed) {
      canvas.width = nextWidth;
      canvas.height = nextHeight;
    }

    // Keep the box-text overlay's backing store identical to the WebGL canvas so
    // the device-px box draws (boxTextDraws) land exactly on the GPU boxes.
    if (overlayCanvas && (overlayCanvas.width !== nextWidth || overlayCanvas.height !== nextHeight)) {
      overlayCanvas.width = nextWidth;
      overlayCanvas.height = nextHeight;
    }

    return changed;
  }

  // Returns true when a NEW renderer instance was created (first run, a
  // devicePixelRatio change, or a forced backend rebuild) — that renderer has
  // no graph/style yet.
  //
  // The renderer is built from `activeBackend` (the dual-render switch):
  //   Mode A = createGraphRenderer(canvas, { backend: "canvas2d", pixelRatio }).
  //   Mode B = { backend: "webgl", instancedShapes: true, pixelRatio }  ← the
  //            BOOT DEFAULT after the P6 flip.
  // `createBackendRenderer` degrades gracefully: when mode B (the default) is
  // requested but no WebGL2 context is available, it reverts to canvas2d and we
  // flag `backendUnavailable` (which reveals the badge in its unavailable state).
  function ensureRenderer(force = false) {
    if (!canvas) return false;

    const nextPixelRatio = readPixelRatio();
    if (renderer && !force && nextPixelRatio === pixelRatio) return false;

    renderer?.destroy();
    pixelRatio = nextPixelRatio;
    const result = createBackendRenderer(createGraphRenderer, canvas, activeBackend, pixelRatio);
    renderer = result.renderer;
    if (result.fellBack) {
      // mode B requested but no WebGL2 here → reverted to canvas2d (mode A).
      activeBackend = CANVAS2D_BACKEND;
      backendUnavailable = true;
    } else {
      backendUnavailable = false;
    }
    ensureOverlayCtx();
    return true;
  }

  function ensureOverlayCtx() {
    if (!overlayCtx && overlayCanvas) {
      overlayCtx = overlayCanvas.getContext("2d");
    }
    return overlayCtx;
  }

  // Single overlay-paint helper called after EVERY render. Mode B clears the
  // overlay and paints renderer.boxTextDraws() (device-px in-box label text);
  // mode A keeps the overlay cleared (canvas2d draws its own in-box text).
  function paintBoxTextOverlay() {
    paintBoxOverlay({
      overlayCtx: ensureOverlayCtx(),
      overlayCanvas,
      renderer,
      backend: activeBackend,
      drawBoxLabels: drawBoxLabels2D,
    });
  }

  // Render + paint the box-text overlay. Used wherever the canvas is redrawn so
  // the WebGL2 in-box text stays in sync with the GPU boxes.
  function renderNow(options) {
    if (!renderer) return;
    renderer.render(options);
    paintBoxTextOverlay();
  }

  // --- Dual-render BETA switch (Ctrl+Shift+X) ---
  // Window keydown handler: toggle the render backend, force a full renderer
  // rebuild on the new backend, re-apply graph/style/positions/camera (preserving
  // the user's view), and flash a transient indicator badge.
  function handleKeydown(event) {
    if (!isToggleShortcut(event)) return;
    event.preventDefault();
    toggleRenderBackend();
  }

  async function toggleRenderBackend() {
    activeBackend = toggleBackend(activeBackend);
    // A <canvas> is permanently bound to the FIRST context type it hands out:
    // once mode A called getContext("2d"), the same element can never return a
    // WebGL2 context (and vice-versa), so rebuilding the renderer on the same
    // node would always fall back to canvas2d ("WebGL2 unavailable"). The main
    // canvas is wrapped in `{#key activeBackend}`, so flipping the backend
    // remounts a FRESH canvas element; await the DOM flush before rebuilding so
    // `bind:this={canvas}` points at the new (context-free) node.
    await tick();
    // Force a destroy + recreate on the new backend (ensureRenderer reverts to
    // canvas2d + flags `backendUnavailable` when mode B finds no WebGL2 context).
    ensureRenderer(true);
    resizeCanvas();
    // Re-apply graph + style + dragged positions and PRESERVE the current camera
    // (no refit) so toggling the backend doesn't jump the view.
    applyPayloadNoFit();
    switchActivated = true;
    pulseIndicator();
  }

  // Briefly pulse the (always-visible) backend badge right after a switch so the
  // change is noticeable; the badge text itself stays permanently visible.
  function pulseIndicator() {
    justToggled = true;
    if (typeof window === "undefined") return;
    if (indicatorTimer !== null) window.clearTimeout(indicatorTimer);
    indicatorTimer = window.setTimeout(() => {
      indicatorTimer = null;
      justToggled = false;
    }, 1200);
  }

  // Compute the fitted target camera WITHOUT animating — shared by the
  // instant fitAndRender() and the animated animateFitAndRender() (remark 7)
  // so both land on the EXACT same target. `renderer.fitView(...)` computes
  // AND applies the bbox fit; centerOnIds (recon) then overrides x/y only,
  // keeping the fit zoom.
  function computeFitTargetCamera() {
    if (!renderer || !canvas) return null;

    const viewportWidth = Math.max(1, canvas.width);
    const viewportHeight = Math.max(1, canvas.height);
    const padding = Math.min(FIT_PADDING * pixelRatio, Math.floor(Math.min(viewportWidth, viewportHeight) / 3));

    renderer.fitView({ padding, viewportWidth, viewportHeight });
    let target = renderer.snapshot().camera;
    // Recon: centre the view on specific nodes (the twins) rather than the
    // bbox centre, so the entities-to-reconcile sit at the exact viewport
    // centre (horizontal + vertical). Keeps the fit zoom.
    if (centerOnIds?.length && payload) {
      const positions = payload.renderGraph.positions;
      let sx = 0, sy = 0, n = 0;
      for (const id of centerOnIds) {
        const i = payload.nodeIndexById?.get(id);
        if (i != null && i >= 0) {
          sx += positions[i * 2];
          sy += positions[i * 2 + 1];
          n += 1;
        }
      }
      if (n > 0) target = { ...target, x: sx / n, y: sy / n };
    }
    return target;
  }

  function fitAndRender() {
    if (!renderer || !canvas) return;
    // An explicit instant fit (mount / new scene / resize / "Reset view")
    // wins over any in-flight camera tween.
    cancelCameraTween();
    const target = computeFitTargetCamera();
    if (!target) return;
    camera = target;
    renderer.setCamera(camera);
    renderNow();
    setLabelsHidden(false);
  }

  // --- Representation-polish remark 7: smooth recenter ------------------
  // fitAndRender() above SNAPS the camera to the fitted target in one step —
  // fine for mount/resize/an explicit "Reset view" click, but jarring right
  // after a layout/param morph, where the NODE positions just tweened
  // smoothly and the camera then popped. animateFitAndRender tweens the
  // CAMERA (x/y/zoom) from wherever it currently sits to the same fit
  // target, over the SAME duration/easing as the node morph
  // (LAYOUT_MORPH_DURATION_MS / easeMergeProgress), so the recenter reads as
  // one continuous motion. Used ONLY by settleLayout (end of a layout/param
  // change) — mount/resize/"Reset view" keep the instant fit above.
  let cameraTweenFrame = null;

  function cancelCameraTween() {
    if (typeof window !== "undefined" && cameraTweenFrame !== null) {
      window.cancelAnimationFrame(cameraTweenFrame);
    }
    cameraTweenFrame = null;
  }

  function lerpCamera(a, b, t) {
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      zoom: a.zoom + (b.zoom - a.zoom) * t,
    };
  }

  function animateFitAndRender() {
    if (!renderer || !canvas) return;
    const startCamera = camera;
    // computeFitTargetCamera() calls renderer.fitView(...), which APPLIES the
    // target to the renderer immediately as a side effect of computing it;
    // we read it back via snapshot() then restore startCamera below (prime
    // frame 0) so nothing flashes to the target before the tween runs.
    const target = computeFitTargetCamera();
    if (!target) return;

    const canAnimate =
      typeof window !== "undefined" && typeof window.requestAnimationFrame === "function";
    // §F3 parity (a11y): honour prefers-reduced-motion — snap instead of tween.
    if (!canAnimate || prefersReducedMotion()) {
      camera = target;
      renderer.setCamera(camera);
      renderNow();
      setLabelsHidden(false);
      return;
    }

    cancelCameraTween();
    setLabelsHidden(true);
    const startTime = window.performance?.now?.() ?? Date.now();
    // Never let a throwing frame leave the camera short of the target or
    // labels stuck hidden (mirrors the node morph's §F2 abort guard).
    const abortTween = () => {
      cancelCameraTween();
      camera = target;
      renderer.setCamera(camera);
      renderNow();
      setLabelsHidden(false);
    };
    const step = (now) => {
      try {
        const elapsed = Math.max(0, now - startTime);
        const progress = Math.min(1, elapsed / LAYOUT_MORPH_DURATION_MS);
        camera = lerpCamera(startCamera, target, easeMergeProgress(progress));
        renderer.setCamera(camera);
        renderNow();
        if (progress < 1) {
          cameraTweenFrame = window.requestAnimationFrame(step);
        } else {
          cameraTweenFrame = null;
          setLabelsHidden(false);
        }
      } catch {
        abortTween();
      }
    };
    // Prime frame 0 (restore the pre-fit camera fitView() just jumped to) so
    // there is no flash, then drive the tween.
    try {
      camera = startCamera;
      renderer.setCamera(camera);
      renderNow();
      cameraTweenFrame = window.requestAnimationFrame(step);
    } catch {
      abortTween();
    }
  }

  function applyCamera(skipEdges = false) {
    if (!renderer) return;
    renderer.setCamera(camera);
    renderNow(skipEdges ? { skipEdges: true } : undefined);
    updateLabels();
  }

  // --- Zoom centred on cursor ---
  function handleWheel(event) {
    // Lock zoom during a layout morph (§2.6) — the tween owns the buffer.
    if (morphActive) {
      event.preventDefault();
      return;
    }
    if (!renderer || !canvas) return;
    event.preventDefault();
    // Remark 7: the user zooming takes over from any in-flight camera-recenter
    // tween immediately, rather than fighting it for the rest of the tween.
    cancelCameraTween();

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / Math.max(1, rect.width);
    const scaleY = canvas.height / Math.max(1, rect.height);

    // Cursor position in screen coords (canvas pixels, centred on canvas)
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const screenX = (localX - rect.width / 2) * scaleX;
    const screenY = (localY - rect.height / 2) * scaleY;

    // World point under cursor BEFORE zoom
    const worldX = camera.x + screenX / camera.zoom;
    const worldY = camera.y + screenY / camera.zoom;

    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    const nextZoom = Math.max(0.05, Math.min(50, camera.zoom * factor));

    // Shift camera so the world point stays under the cursor AFTER zoom
    camera = {
      zoom: nextZoom,
      x: worldX - screenX / nextZoom,
      y: worldY - screenY / nextZoom,
    };
    // Hide many labels mid-zoom on dense graphs (no-op for small label sets).
    setLabelsHidden(true);
    applyCamera(skipEdgesOnInteract);

    // While zooming on large graphs we skip edges for fluidity; once the wheel
    // settles (~ZOOM_SETTLE_MS without another event) do a full render with edges.
    if (typeof window !== "undefined") {
      if (zoomSettleTimer !== null) window.clearTimeout(zoomSettleTimer);
      zoomSettleTimer = window.setTimeout(() => {
        zoomSettleTimer = null;
        // Crossed the principal-character LOD threshold (zoomed in/out past it)?
        // Rebuild the payload so the in-box hub-name set follows the zoom, then
        // re-style without re-fitting. Otherwise just restore skipped edges.
        if (renderer && labelZoomBucket(camera.zoom) !== lastLabelZoomBucket) {
          rebuildPayload();
          applyPayloadNoFit();
        } else if (renderer && skipEdgesOnInteract) {
          renderNow();
        }
        setLabelsHidden(false);
      }, ZOOM_SETTLE_MS);
    }
  }

  // --- Pointer down: node drag (over a node) or pan (over the background) ---
  function handlePointerDown(event) {
    // Lock pan/drag while a layout morph is in flight (§2.6).
    if (morphActive) return;
    // Keep the hover dwell alive across pointer-down. Canceling it here can
    // strand an applied node dim when the pending target is empty space.
    // Remark 7: the user panning/dragging takes over from any in-flight
    // camera-recenter tween immediately, rather than fighting it.
    cancelCameraTween();
    const id = pickNode(event);

    if (id) {
      // Begin a potential node drag. Movement past DRAG_MOVE_THRESHOLD turns this
      // into a reposition; a release without movement falls through to click/select.
      draggingNodeId = id;
      dragNodeIndex = payload?.nodeIndexById?.get(id) ?? -1;
      dragMoved = false;
      dragStartX = event.clientX;
      dragStartY = event.clientY;
      if (canvas) canvas.setPointerCapture(event.pointerId);
      return;
    }

    isPanning = true;
    panStartX = event.clientX;
    panStartY = event.clientY;
    panStartCameraX = camera.x;
    panStartCameraY = camera.y;

    if (canvas) {
      canvas.setPointerCapture(event.pointerId);
      canvas.style.cursor = "grabbing";
    }
  }

  function handlePointerUp(event) {
    if (draggingNodeId) {
      const wasDrag = dragMoved;
      draggingNodeId = null;
      dragNodeIndex = -1;
      dragMoved = false;
      if (canvas) canvas.style.cursor = "default";
      if (wasDrag) {
        // Finalize the moved node: refresh hover hit-testing + labels.
        if (skipEdgesOnInteract && renderer) renderNow();
        setLabelsHidden(false);
        // Swallow the trailing click so a drag doesn't also select.
        suppressNextClick = true;
      }
      return;
    }

    if (!isPanning) return;
    isPanning = false;
    if (canvas) canvas.style.cursor = "default";
    // Pan ended: restore edges with a full render.
    if (skipEdgesOnInteract && renderer) renderNow();
    setLabelsHidden(false);
  }

  // "Fit" path: rebuild graph + style and auto-fit the view (mount / new scene / resize).
  function applyPayload() {
    if (!renderer || !payload) return;

    renderer.setGraph(payload.renderGraph);
    renderer.setStyle(payload.style);
    fitAndRender();
  }

  // "No-fit" path: rebuild graph + style (so selection highlight + focus styling update)
  // but PRESERVE the current camera (zoom + pan) instead of re-fitting.
  function applyPayloadNoFit() {
    if (!renderer || !payload) return;

    renderer.setGraph(payload.renderGraph);
    renderer.setStyle(payload.style);
    applyCamera();
  }

  function rebuildPayload() {
    payload = buildGraphRendererPayload(scene ?? EMPTY_SCENE, {
      selectedIds: selectedIds ?? [],
      focusId,
      hoveredNodeId,
      nodeRadius: NODE_RADIUS,
      // Current zoom drives the principal-character label LOD (top-K names at
      // zoom-out). Sync the bucket so a wheel that crosses the threshold knows
      // to rebuild (see handleWheel's settle callback).
      zoom: camera.zoom,
      // codeflow-parity Lot 4: Color-by keying + Curved-links scalar. Defaults
      // (Folder / curved) keep the output byte-identical to before this lot.
      colorBy: colorMode,
      curvedLinks,
      // Configurable edge-transparency: the along-edge fade mode + flat base
      // opacity. Defaults (dense / 0.5) keep the historical edge look.
      edgeAlphaMode,
      edgeOpacity,
      ...(Number.isFinite(labelMaxChars) ? { labelMaxChars } : {}),
    });
    lastLabelZoomBucket = labelZoomBucket(camera.zoom);
    clearHoveredEdge({ notify: false, render: false });
    computeNodeDegrees();
    // Re-apply the active layout FIRST (so a Layers layout / an in-flight morph
    // survives a selection/hover rebuild), THEN dragged positions on top (a
    // user drag wins over the layout).
    reapplyLayoutPositions();
    reapplyDraggedPositions();
    // NB: `skipEdgesOnInteract` is a backend-aware `$derived` (declared above) —
    // no imperative recompute here, so a backend flip updates it reactively.
  }

  // codeflow-parity Lot 1: re-write the active layout's positions onto a freshly
  // built payload so the selection `$effect` (rebuildPayload → applyPayloadNoFit
  // → setPositions) cannot clobber the layout / the interpolated morph buffer
  // (§2.6). Mid-morph the LIVE buffer wins; otherwise the settled layout buffer.
  // Before any layout switch/re-solve activeLayoutBuffer is null (not morphing),
  // so the fresh-scene default path is a no-op and stays byte-identical.
  function reapplyLayoutPositions() {
    const source = morphActive ? liveMorphBuffer : activeLayoutBuffer;
    if (!source || !payload?.renderGraph) return;
    const positions = payload.renderGraph.positions;
    if (source.length === positions.length) positions.set(source);
  }

  // Re-write any user-dragged node positions onto the freshly-built payload so a
  // selection/hover-driven rebuild doesn't snap dragged nodes back (#2.4).
  function reapplyDraggedPositions() {
    if (draggedPositions.size === 0 || !payload?.renderGraph) return;
    const positions = payload.renderGraph.positions;
    for (const [id, pos] of draggedPositions) {
      const idx = payload.nodeIndexById?.get(id);
      if (!Number.isInteger(idx)) continue;
      positions[idx * 2] = pos.x;
      positions[idx * 2 + 1] = pos.y;
    }
  }

  // Full update with auto-fit — used on mount, a genuine new graph, and resize.
  function updateGraph() {
    if (!mounted) return;

    rebuildPayload();
    // Cache the pristine force positions of the fresh scene as the switch-to-
    // Force morph target (Lot 1 never cold re-solves force). Captured AFTER the
    // rebuild, when positions still hold the baked/attached force layout (the
    // genuine-new-scene path resets layout state first, so no override applies).
    captureForceBaseBuffer();
    ensureRenderer();
    resizeCanvas();
    applyPayload();
  }

  // codeflow-parity Lot 1: snapshot the current (pristine force) positions as the
  // cached switch-to-Force morph target.
  function captureForceBaseBuffer() {
    const positions = payload?.renderGraph?.positions;
    forceBaseBuffer = positions ? new Float32Array(positions) : null;
  }

  // Selection/focus update — preserves the user's current zoom and pan.
  function updateSelection() {
    if (!mounted) return;
    // RC-B: while a collapse tween runs, `payload` is intentionally one scene
    // behind the `scene` prop. A rebuild now would swap the renderer to the NEW
    // (collapsed) node set mid-tween → the next tween frame's setPositions throws
    // on the length mismatch → hard cut. DEFER: apply exactly once post-swap.
    if (groupSwapPending) {
      pendingPostSwapRestyle = true;
      return;
    }

    rebuildPayload();
    ensureRenderer();
    resizeCanvas();
    applyPayloadNoFit();
  }

  // codeflow-parity Lot 4: Curved-links / Color-by change → LIVE re-style. Both
  // are per-render style attributes (edge curvature / node colour keying), so we
  // rebuild the payload with the new options and re-render WITHOUT re-fitting the
  // camera or recomputing a layout — no morph, the active layout buffer survives
  // (rebuildPayload → reapplyLayoutPositions). Same shape as updateSelection.
  function updateDisplayStyle() {
    if (!mounted) return;
    // Same RC-B deferral as updateSelection: never rebuild the payload out from
    // under a running collapse tween (apply once post-swap).
    if (groupSwapPending) {
      pendingPostSwapRestyle = true;
      return;
    }

    rebuildPayload();
    ensureRenderer();
    resizeCanvas();
    applyPayloadNoFit();
  }

  // Toolbar handlers: flip the display state; the reactive $effect re-styles.
  function toggleCurvedLinks() {
    curvedLinks = !curvedLinks;
  }

  function selectColorMode(mode) {
    if (mode === colorMode) return;
    colorMode = mode;
  }

  // Configurable edge-transparency handlers: flip the $state; the reactive
  // $effect above re-styles LIVE (same path as Color-by / Curved-links).
  function selectEdgeAlphaMode(mode) {
    if (mode === edgeAlphaMode) return;
    edgeAlphaMode = mode;
  }

  // ResizeObserver / window-resize path. Two guarantees (UAT):
  //  1. Only act on a REAL canvas-size delta (or a recreated renderer): the
  //     observer also fires on layout no-ops — those must not touch the view.
  //  2. PRESERVE the camera (zoom + pan). A container resize (window resize,
  //     left-rail content change) must NOT re-fit, re-center, or reset the
  //     user's view — only the auto-fit paths (mount / new graph) fit.
  function handleResize() {
    if (!mounted) return;

    const recreated = ensureRenderer();
    const resized = resizeCanvas();
    if (!recreated && !resized) return;
    if (!renderer || !payload) return;

    if (recreated) {
      renderer.setGraph(payload.renderGraph);
      renderer.setStyle(payload.style);
    }
    applyCamera();
  }

  function scheduleResize() {
    if (typeof window === "undefined") return;
    if (resizeFrame !== null) return;

    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = null;
      handleResize();
    });
  }

  // Count edges per node from the render-graph buffers and find the max degree.
  // Cached so hover + the label set don't re-scan all edges repeatedly.
  function computeNodeDegrees() {
    nodeDegrees = [];
    maxNodeDegree = 1;
    labelEligibleIds = [];
    const graph = payload?.renderGraph;
    if (!graph) return;

    const nodeCount = graph.nodeIds.length;
    const degrees = new Array(nodeCount).fill(0);
    const edgeCount = graph.edges.length / 2;
    for (let e = 0; e < edgeCount; e += 1) {
      degrees[graph.edges[e * 2]] += 1;
      degrees[graph.edges[e * 2 + 1]] += 1;
    }
    let max = 1;
    for (let i = 0; i < nodeCount; i += 1) {
      if (degrees[i] > max) max = degrees[i];
    }
    nodeDegrees = degrees;
    maxNodeDegree = max;

    // Item 2: god-node label set — degree >= ratio * maxDegree (legacy export.ts rule).
    const threshold = labelDegreeRatio * max;
    const eligible = [];
    for (let i = 0; i < nodeCount; i += 1) {
      if (degrees[i] >= threshold && degrees[i] > 0) eligible.push(graph.nodeIds[i]);
    }
    labelEligibleIds = eligible;
  }

  function degreeForNodeId(nodeId) {
    const idx = payload?.nodeIndexById?.get(nodeId);
    return Number.isInteger(idx) ? (nodeDegrees[idx] ?? 0) : 0;
  }

  // World → screen (CSS px from the canvas top-left), inverse of eventToWorld.
  function worldToScreen(worldX, worldY) {
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / Math.max(1, rect.width);
    const scaleY = canvas.height / Math.max(1, rect.height);
    return {
      x: ((worldX - camera.x) * camera.zoom) / scaleX + rect.width / 2,
      y: ((worldY - camera.y) * camera.zoom) / scaleY + rect.height / 2,
    };
  }

  // Recompute the boxed-label overlay: god-nodes + the active node, positioned
  // via the current camera. Called on every camera change (pan/zoom/fit/drag).
  function updateLabels() {
    const graph = payload?.renderGraph;
    if (labelMode === "none" || !graph || !canvas) {
      labels = [];
      return;
    }
    if (labelsHidden) return;

    const activeIds = new Set(
      [hoveredNodeId, focusId, ...(selectedIds ?? []), draggingNodeId].filter(Boolean),
    );
    const ids = new Set(labelEligibleIds);
    for (const id of activeIds) ids.add(id);

    const next = [];
    for (const id of ids) {
      const idx = payload.nodeIndexById?.get(id);
      if (!Number.isInteger(idx)) continue;
      const node = payload.nodeById?.get(id);
      // Legacy box parity: box-category nodes (Work / ChapterOrStory) draw
      // their label INSIDE the canvas glyph — never duplicate it in the DOM
      // overlay, not even for the active (hovered/selected/focused) node.
      if (isBoxShape(node?.shape)) continue;
      const worldX = graph.positions[idx * 2] ?? 0;
      const worldY = graph.positions[idx * 2 + 1] ?? 0;
      const screen = worldToScreen(worldX, worldY);
      if (!screen) continue;
      const radius = (payload.style?.nodeSizes?.[idx] ?? NODE_RADIUS) * camera.zoom;
      // BUG-1: cap the DRAWN overlay text; keep the full name for the `title`
      // hover so long entity names no longer overflow the canvas.
      const fullLabel = node?.label ?? id;
      next.push({
        id,
        label: truncateLabel(fullLabel, labelMaxChars),
        fullLabel,
        x: screen.x,
        y: screen.y - radius - 4,
        active: activeIds.has(id),
      });
    }
    labels = next;
  }

  // On large label sets, drop labels during active pan/zoom/drag for fluidity,
  // then restore them when the interaction settles.
  function setLabelsHidden(hidden) {
    if (labelEligibleIds.length <= LABEL_SKIP_THRESHOLD) {
      // Small graphs: always keep labels live (cheap), just refresh positions.
      labelsHidden = false;
      updateLabels();
      return;
    }
    if (labelsHidden === hidden) {
      if (!hidden) updateLabels();
      return;
    }
    labelsHidden = hidden;
    if (hidden) {
      labels = [];
    } else {
      updateLabels();
    }
  }

  function eventToWorld(event) {
    if (!canvas || !camera.zoom) return null;

    const rect = canvas.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const scaleX = canvas.width / Math.max(1, rect.width);
    const scaleY = canvas.height / Math.max(1, rect.height);
    const screenX = (localX - rect.width / 2) * scaleX;
    const screenY = (localY - rect.height / 2) * scaleY;

    return {
      x: camera.x + screenX / camera.zoom,
      y: camera.y + screenY / camera.zoom,
      scale: Math.max(scaleX, scaleY),
      localX,
      localY,
    };
  }

  // Move only the dragged node to the given world coords, then re-render.
  // Mutates the canonical payload positions so hover hit-testing + labels follow.
  function dragNodeTo(worldX, worldY) {
    if (!renderer || !payload?.renderGraph || dragNodeIndex < 0) return;
    const positions = payload.renderGraph.positions;
    positions[dragNodeIndex * 2] = worldX;
    positions[dragNodeIndex * 2 + 1] = worldY;
    // Persist so a later payload rebuild (selection/hover) keeps the new position.
    if (draggingNodeId) draggedPositions.set(draggingNodeId, { x: worldX, y: worldY });
    renderer.setPositions(positions);
    // Skip edges mid-drag on dense graphs for fluidity (restored on pointerup).
    renderNow(skipEdgesOnInteract ? { skipEdges: true } : undefined);
    updateLabels();
  }

  function pickNode(event) {
    if (!payload) return null;

    const world = eventToWorld(event);
    if (!world) return null;

    // World-space pick radius: stays constant in world units so the on-screen hit zone
    // scales with camera zoom, matching the now zoom-scaled (world-space sized) node glyphs.
    const maxDistance = PICK_RADIUS * world.scale;
    return findNearestNodeId(payload, world.x, world.y, maxDistance);
  }

  function handleClick(event) {
    // Ignore canvas clicks while a layout morph is animating.
    if (morphActive) return;
    // A click that concludes a node drag must not also select.
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    const id = pickNode(event);
    if (id) onSelect?.(id);
  }

  function handleDoubleClick(event) {
    if (morphActive) return;
    const id = pickNode(event);
    if (id) onOpenEntity?.(id);
  }

  function edgeKey(hit) {
    if (!hit?.edge) return null;
    return `${hit.index}:${hit.edge.source}:${hit.edge.target}:${hit.edge.relation ?? ""}`;
  }

  function styleForHoveredEdge(hit) {
    if (!payload?.style || !hit) return payload?.style ?? null;

    const style = {
      ...payload.style,
      edgeWidths: new Float32Array(payload.style.edgeWidths),
      edgeColors: new Uint8Array(payload.style.edgeColors),
    };
    const width = style.edgeWidths[hit.index] ?? 1;
    style.edgeWidths[hit.index] = Math.max(width * 1.6, width + 1.5, 3);
    const colorOffset = hit.index * 4;
    style.edgeColors[colorOffset] = HOVER_EDGE_COLOR[0];
    style.edgeColors[colorOffset + 1] = HOVER_EDGE_COLOR[1];
    style.edgeColors[colorOffset + 2] = HOVER_EDGE_COLOR[2];
    style.edgeColors[colorOffset + 3] = HOVER_EDGE_COLOR[3];
    return style;
  }

  function renderHoverStyle(hit) {
    if (!renderer || !payload) return;
    const style = styleForHoveredEdge(hit);
    if (style) renderer.setStyle(style);
    renderNow();
  }

  function setHoveredEdge(hit, localX, localY) {
    const previousKey = edgeKey(hoveredEdge);
    const nextKey = edgeKey(hit);
    hoveredEdge = hit ? { ...hit, localX, localY } : null;

    if (previousKey === nextKey) return;
    onEdgeHover?.(hit?.edge ?? null);
    renderHoverStyle(hit);
  }

  function clearHoveredEdge({ notify = true, render = true } = {}) {
    const hadHover = hoveredEdge !== null;
    hoveredEdge = null;
    if (canvas) canvas.style.cursor = "default";
    if (hadHover && notify) onEdgeHover?.(null);
    if (render) renderHoverStyle(null);
  }

  function handlePointerMove(event) {
    // Suppress hover / pan / drag while a layout morph owns the position buffer.
    if (morphActive) return;
    // Node drag takes priority over everything else.
    if (draggingNodeId) {
      if (!dragMoved) {
        const dx = event.clientX - dragStartX;
        const dy = event.clientY - dragStartY;
        if (Math.hypot(dx, dy) < DRAG_MOVE_THRESHOLD) return; // below threshold → still a click
        dragMoved = true;
        if (canvas) canvas.style.cursor = "grabbing";
        setLabelsHidden(true);
      }
      const world = eventToWorld(event);
      if (world) dragNodeTo(world.x, world.y);
      return;
    }

    // Pan takes priority when dragging
    if (isPanning) {
      const rect = canvas?.getBoundingClientRect();
      if (!rect) return;
      const scaleX = canvas.width / Math.max(1, rect.width);
      const scaleY = canvas.height / Math.max(1, rect.height);
      const dx = (event.clientX - panStartX) * scaleX;
      const dy = (event.clientY - panStartY) * scaleY;
      camera = {
        zoom: camera.zoom,
        x: panStartCameraX - dx / camera.zoom,
        y: panStartCameraY - dy / camera.zoom,
      };
      // Hide many labels mid-pan on dense graphs (no-op for small label sets).
      setLabelsHidden(true);
      applyCamera(skipEdgesOnInteract);
      return;
    }

    if (!payload) return;

    const world = eventToWorld(event);
    if (!world) {
      clearHoveredEdge();
      setHoveredNode(null);
      return;
    }

    // World-space pick radii (constant in world units) so the on-screen hit zones scale
    // with camera zoom, matching the now zoom-scaled (world-space sized) node glyphs.
    // Item 1.3: compute BOTH hits. A node wins only inside its tight drawn-glyph
    // zone; anywhere else, a valid near-line edge hit wins. Dense knowledge
    // graphs nearly always have a node inside the broader node pick radius, so a
    // proportional node-vs-edge comparison made edge hover effectively dead.
    const nodeMaxDistance = PICK_RADIUS * world.scale;
    const edgeMaxDistance = EDGE_PICK_RADIUS * world.scale;
    const nodeHit = findNearestNode(payload, world.x, world.y, nodeMaxDistance);
    // Remark 3 (edge hover dead outside Force): pass the CURRENT settled
    // positions EXPLICITLY rather than relying on findNearestEdge's implicit
    // `payload.renderGraph.positions` default — settleLayout mutates that
    // array in place on every layout switch (Force/Radial/Grid/Metro/Layers),
    // so this is the same array either way, but naming it here removes any
    // ambiguity that the hit-test could ever read a pre-morph/stale buffer.
    const edgeHit = findNearestEdge(
      payload,
      world.x,
      world.y,
      edgeMaxDistance,
      payload.renderGraph.positions,
    );

    // Tight node zone: on the glyph (radius) plus a few CSS px of slop.
    const tightNodeRadius = (nodeHit?.radius ?? 0) + NODE_TIGHT_SLOP * world.scale;
    const onNodeGlyph = nodeHit !== null && nodeHit.distance <= tightNodeRadius;

    const preferEdge = edgeHit !== null && !onNodeGlyph;
    const preferNode = nodeHit !== null && !preferEdge;

    if (preferNode) {
      clearHoveredEdge({ render: false });
      if (canvas) canvas.style.cursor = "pointer";
      setHoveredNode(nodeHit.id, world.localX, world.localY);
      return;
    }

    setHoveredNode(null);
    if (canvas) canvas.style.cursor = edgeHit ? "crosshair" : "default";
    setHoveredEdge(edgeHit, world.localX, world.localY);
  }

  function setHoveredNode(nodeId, localX = 0, localY = 0) {
    const prevId = hoveredNodeId;
    if (nodeId === prevId) {
      if (hoveredNode && nodeId) {
        hoveredNode = { ...hoveredNode, localX, localY };
      }
      return;
    }

    hoveredNodeId = nodeId;
    if (nodeId && payload) {
      const node = payload.nodeById?.get(nodeId);
      // Degree from the cached per-node counts (computed on payload rebuild).
      const degree = degreeForNodeId(nodeId);
      hoveredNode = node ? { ...node, degree, localX, localY } : null;
    } else {
      hoveredNode = null;
    }

    // Rest-of-graph connected-dim. Before selection/focus, EVERY target change
    // (node, another node, or empty space) dwells for ~200ms. Keeping the current
    // style across momentary gaps prevents dim → undim → dim flashes.
    requestConnectedDim();

    // The hovered node's OWN feedback (tooltip + label) stays immediate — only
    // the rest-of-graph dim is delayed.
    updateLabels();
  }

  // Apply the connected-dim style for the CURRENT hover/selection/focus through
  // the style buffers (no full payload rebuild). Pulled out of setHoveredNode so
  // the hover-intent dwell timer can invoke it once the pointer settles.
  function applyConnectedDim() {
    if (!(mounted && payload)) return;
    const style = buildConnectedDimStyle(payload, {
      selectedIds: selectedIds ?? [],
      focusId,
      hoveredNodeId,
    });
    if (renderer && style) {
      payload = { ...payload, style };
      renderer.setStyle(style);
      // A node→edge transition schedules this style change. Preserve the edge's
      // immediate highlight when the delayed base/connected style settles.
      if (hoveredEdge) renderHoverStyle(hoveredEdge);
      else renderNow();
    }
  }

  // Gate every pre-selection transparency change through the hover-intent dwell.
  // Selection/focus retains the established immediate path.
  function requestConnectedDim() {
    const immediate = !shouldDelayConnectedDim({ selectedIds, focusId });
    hoverIntent.request({ immediate });
  }

  function handlePointerLeave() {
    clearHoveredEdge();
    setHoveredNode(null);
    isPanning = false;
    if (draggingNodeId) {
      if (dragMoved && skipEdgesOnInteract && renderer) renderNow();
      draggingNodeId = null;
      dragNodeIndex = -1;
      dragMoved = false;
      setLabelsHidden(false);
    }
  }

  function mergeKey(pair) {
    if (!pair) return null;
    return `${pair.id ?? ""}:${pair.from ?? ""}:${pair.into ?? ""}`;
  }

  function easeMergeProgress(progress) {
    const t = Math.min(1, Math.max(0, progress));
    return 1 - (1 - t) ** 3;
  }

  function cancelMergeFrame() {
    if (typeof window !== "undefined" && mergeFrame !== null) {
      window.cancelAnimationFrame(mergeFrame);
    }
    mergeFrame = null;
  }

  function restoreBasePositions() {
    if (!renderer || !payload) return;
    renderer.setPositions(payload.renderGraph.positions);
    renderer.setStyle(payload.style);
    renderNow();
  }

  function finishMergeAnimation() {
    mergeFrame = null;
    onMergeComplete?.();
  }

  function startMergeAnimation(pair) {
    if (typeof window === "undefined") {
      onMergeComplete?.();
      return;
    }

    if (!renderer || !payload) {
      updateGraph();
    }

    const firstFrame = interpolateMergePositions(payload, pair, 0);
    if (!renderer || !firstFrame) {
      onMergeComplete?.();
      return;
    }

    cancelMergeFrame();

    const startTime = window.performance?.now?.() ?? Date.now();
    const tick = (now) => {
      const elapsed = Math.max(0, now - startTime);
      const progress = Math.min(1, elapsed / MERGE_ANIMATION_DURATION_MS);
      const positions = interpolateMergePositions(payload, pair, easeMergeProgress(progress));

      if (!positions) {
        finishMergeAnimation();
        return;
      }

      renderer.setPositions(positions);
      renderer.setStyle(interpolateMergeStyle(payload, pair, easeMergeProgress(progress)));
      renderNow();

      if (progress < 1) {
        mergeFrame = window.requestAnimationFrame(tick);
      } else {
        finishMergeAnimation();
      }
    };

    renderer.setPositions(firstFrame);
    renderer.setStyle(interpolateMergeStyle(payload, pair, 0));
    renderNow();
    mergeFrame = window.requestAnimationFrame(tick);
  }

  // --- codeflow-parity Lot 1: all-node layout MORPH driver -------------------
  // Generalizes the one-node merge tween into a cross-buffer morph between two
  // index-parallel position buffers (§2.5/§2.6): capture the current on-screen
  // buffer as `bufA`, compute the target `bufB` for the chosen mode (Layers =
  // resolveLayout('typed-layer'); Force = the CACHED initial force positions —
  // no cold re-solve in Lot 1), rAF-lerp bufA→bufB via renderer.setPositions,
  // then exactly ONE fitAndRender() at t=1.

  function cancelLayoutMorphFrame() {
    if (typeof window !== "undefined" && layoutMorphFrame !== null) {
      window.cancelAnimationFrame(layoutMorphFrame);
    }
    layoutMorphFrame = null;
  }

  // §F3 (a11y): honor prefers-reduced-motion — skip the tween and place the new
  // layout instantly, consistent with the pan/zoom reduced-motion handling.
  function prefersReducedMotion() {
    return (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  // Reset all layout state to the Force default. Called on a genuine scene-
  // content change so we NEVER tween across a scene rebuild (new node indices),
  // and on an abnormal morph exit (§F2) so the canvas can never stay locked.
  function resetLayoutState() {
    cancelLayoutMorphFrame();
    // A scene reset / abnormal exit also cancels any in-flight collapse/expand
    // group tween — its bufA/bufB are indexed for the pre-swap node set.
    cancelGroupTweenFrame();
    // Remark 7: a scene reset / abnormal morph exit also cancels any in-flight
    // camera-recenter tween — its target bbox is for the OLD scene/layout.
    cancelCameraTween();
    // Remark 2 (hover-dwell flicker regression): a pending dwell timer keeps
    // ticking via its own setTimeout regardless of morph/scene state. If it
    // fires AFTER a layout reset (new scene, or an abnormal morph exit) it
    // would apply a connected-dim for a hover target whose position (or very
    // existence) no longer matches what's on screen — a visible "pop" that
    // reads as flicker. Cancel it here so it can never fire stale.
    hoverIntent.cancel();
    morphActive = false;
    liveMorphBuffer = null;
    activeLayoutBuffer = null;
    layoutMode = LAYOUT_MODE_FORCE;
    // A genuine reset / abnormal-exit hard cut also clears the group-transition
    // bookkeeping so no deferred restyle or pending settle leaks into the new scene.
    groupSwapPending = false;
    pendingPostSwapRestyle = false;
    pendingGroupSettle = null;
    // Lot 7: invalidate any in-flight worker force solve — its buffer is sized
    // for the OLD node set and must not be morphed after the scene changed.
    forceSolveToken++;
    // §F1: a layout reset re-places all nodes, so stale Force-space drags must
    // not survive it (they would re-snap into the new coordinate space).
    draggedPositions.clear();
  }

  // Redesign spec §3.2: the LIGHTER cancellation set used by the carried
  // collapse/expand swap. It cancels the transient timers/tweens that would
  // clobber a position-preserving swap, but — unlike resetLayoutState — it does
  // NOT cancel the group tween frame, does NOT null activeLayoutBuffer (the carry
  // re-establishes it), does NOT force layoutMode, and is NEVER followed by a fit.
  function resetTransientLayoutState() {
    cancelLayoutMorphFrame();
    cancelCameraTween();
    // A pending hover-dwell timer would apply a stale connected-dim after the
    // swap re-places nodes — cancel it (same class as the resetLayoutState guard).
    hoverIntent.cancel();
    // The zoom-settle callback calls rebuildPayload → it would clobber the carried
    // positions one tick later (same class of bug as RC-B). Clear it.
    if (typeof window !== "undefined" && zoomSettleTimer !== null) {
      window.clearTimeout(zoomSettleTimer);
      zoomSettleTimer = null;
    }
    // Invalidate any in-flight worker force solve (buffer sized for the OLD set).
    forceSolveToken++;
    // Drag coords are already baked into the pre-swap snapshot (currentPositionMap
    // reads them via currentLayoutBuffer), so drop the stale Force-space drag map.
    draggedPositions.clear();
  }

  function currentLayoutBuffer() {
    if (!payload?.renderGraph?.positions) return null;
    return layoutMorphFrame !== null && liveMorphBuffer
      ? new Float32Array(liveMorphBuffer)
      : new Float32Array(payload.renderGraph.positions);
  }

  function currentPositionMap() {
    const graph = payload?.renderGraph;
    const positions = currentLayoutBuffer();
    if (!graph || !positions) return null;
    const map = new Map();
    for (let i = 0; i < graph.nodeIds.length; i++) {
      map.set(graph.nodeIds[i], { x: positions[i * 2] ?? 0, y: positions[i * 2 + 1] ?? 0 });
    }
    return map;
  }

  async function computeForceRelayoutBuffer({ warmStart = true } = {}) {
    const graph = payload?.renderGraph;
    if (!graph || !scene?.nodes) return null;
    const initialPositions = warmStart ? currentPositionMap() : undefined;
    // Lot 7: off-main-thread solve when a Worker is available (falls back to a
    // synchronous solve in SSR / tests). Debounced to drag-end by the caller.
    // A worker error (postMessage/onerror rejection) must NOT surface as an
    // unhandled rejection in the fire-and-forget caller — swallow it and return
    // null so resolveForceLayout returns without morphing. The NEXT commit falls
    // back to the synchronous solve once the worker is flagged broken.
    let solved;
    try {
      solved = await solveForce(
        scene.nodes.map((node) => ({ id: node.id })),
        scene.edges ?? [],
        {
          repulsion: forceSpread,
          linkDistance: forceLinks,
          iterations: FORCE_SLIDER_ITERATIONS,
          initialPositions,
        },
      );
    } catch {
      return null;
    }
    if (!Array.isArray(solved) || solved.length !== graph.nodeIds.length) return null;
    const byId = new Map(solved.map((node) => [node.id, node]));
    const buffer = new Float32Array(graph.nodeIds.length * 2);
    for (let i = 0; i < graph.nodeIds.length; i++) {
      const p = byId.get(graph.nodeIds[i]);
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
      buffer[i * 2] = p.x;
      buffer[i * 2 + 1] = p.y;
    }
    return buffer;
  }

  async function resolveForceLayout({ warmStart = true } = {}) {
    if (layoutMode !== LAYOUT_MODE_FORCE) layoutMode = LAYOUT_MODE_FORCE;
    // Generation token: an async solve that resolves AFTER a scene-content change
    // (which bumps forceSolveToken via resetLayoutState) is stale — discard it so
    // we never morph a buffer sized for the previous node set (§2.6 index-safety).
    const token = ++forceSolveToken;
    const target = await computeForceRelayoutBuffer({ warmStart });
    // Discard the solve when: it was superseded (token bump), the component
    // unmounted, the solve failed, OR the user switched AWAY from Force while it
    // was in flight. resolveForceLayout sets layoutMode = Force synchronously at
    // entry, so a mid-solve selectLayoutMode → startLayoutMorph (Layers/Grid/
    // Radial/Metro) flips layoutMode and this late Force solve must not hijack
    // the user's chosen layout back to Force (§2.6).
    if (!target || token !== forceSolveToken || !mounted || layoutMode !== LAYOUT_MODE_FORCE)
      return;
    forceBaseBuffer = new Float32Array(target);
    // §3.6: a Force re-solve genuinely moves every node, so any cached prior
    // constellation is stale — invalidate the expand-restore cache.
    coordinateEpoch += 1;
    startLayoutMorphToBuffer(LAYOUT_MODE_FORCE, target);
  }

  function resetForceLayout() {
    resolveForceLayout({ warmStart: false });
  }

  function commitForceSpread(event) {
    forceSpread = Number(event?.currentTarget?.value ?? forceSpread);
    resolveForceLayout({ warmStart: true });
  }

  function commitForceLinks(event) {
    forceLinks = Number(event?.currentTarget?.value ?? forceLinks);
    resolveForceLayout({ warmStart: true });
  }

  // Toolbar click: morph to `mode`. Ignores a click on the already-active mode
  // (during a morph `layoutMode` is already the target, so re-clicking it is a
  // no-op while clicking the OTHER mode interrupts and re-targets).
  function selectLayoutMode(mode) {
    // §3.3: a layout morph must not be computed against a mid-transition payload
    // (a group tween owns the buffer). Pointer/wheel are already locked by
    // morphActive; this covers the toolbar click path.
    if (groupTweenFrame !== null) return;
    if (mode === layoutMode) return;
    startLayoutMorph(mode);
  }

  // Bake a settled layout into the payload (so hit-testing / labels / edges read
  // the new positions), remember it for re-application across rebuilds, and do
  // the single deliberate end-fit.
  function settleLayout(mode, buffer) {
    // Persist the settled buffer for EVERY mode, Force included. A Lot-3 force
    // re-solve (Spread/Links slider or Reset) settles under LAYOUT_MODE_FORCE;
    // nulling activeLayoutBuffer here would drop that re-solved layout so the
    // next selection/hover/display rebuild (reapplyLayoutPositions) would snap
    // the graph back to the scene's baked force positions (§2.6). A plain
    // switch-to-Force settles the pristine forceBaseBuffer (== scene positions),
    // so re-applying it across a rebuild is a harmless no-op.
    activeLayoutBuffer = buffer ? new Float32Array(buffer) : null;
    // §3.6: switching to a NON-Force layout (Layers/Grid/Radial/Metro) relocates
    // every node into a new coordinate space, so the expand-restore cache is
    // stale — invalidate it. (A Force re-solve bumps the epoch in resolveForceLayout.)
    if (mode !== LAYOUT_MODE_FORCE) coordinateEpoch += 1;
    const positions = payload?.renderGraph?.positions;
    if (positions && buffer && buffer.length === positions.length) {
      positions.set(buffer);
    }
    liveMorphBuffer = null;
    morphActive = false;
    // ONE end-fit: the new layout has a different bbox (§2.6). Remark 7:
    // animateFitAndRender() TWEENS the camera to the new fit (instead of
    // snapping) over the same duration/easing as the node morph just
    // finished, so the recenter reads as one continuous motion; it also
    // restores labels (setLabelsHidden(false)) once the tween settles.
    animateFitAndRender();
  }

  function startLayoutMorph(mode) {
    const bufB = computeLayoutBuffer(payload, mode, { forceBuffer: forceBaseBuffer });
    startLayoutMorphToBuffer(mode, bufB);
  }

  function startLayoutMorphToBuffer(mode, bufB) {
    if (!renderer || !payload?.renderGraph) {
      layoutMode = mode;
      return;
    }
    const current = payload.renderGraph.positions;
    // Interrupt: re-seed bufA from the LIVE interpolated buffer, never snap back
    // to base (§2.6). Otherwise capture the current on-screen buffer.
    const bufA = currentLayoutBuffer() ?? new Float32Array(current);

    cancelLayoutMorphFrame();
    // Remark 7: a NEW node morph starting supersedes any camera-recenter tween
    // still animating from the PREVIOUS layout settle (e.g. a rapid re-click)
    // — its target bbox is now stale.
    cancelCameraTween();
    // A layout moves hovered geometry away from the pointer. Clear that stale
    // target through the SAME dwell gate: the delayed base-style restore can
    // neither flash immediately nor strand the old node's dim.
    clearHoveredEdge();
    setHoveredNode(null);
    layoutMode = mode;
    // §F1: bufA already snapshotted the on-screen (incl. dragged) positions, so
    // the drag is preserved as the morph START; drop the stale drag map now — a
    // layout switch explicitly re-places every node, so a later selection
    // rebuild must NOT re-apply old Force-space drag coords into the new space.
    draggedPositions.clear();

    const canAnimate =
      typeof window !== "undefined" &&
      typeof window.requestAnimationFrame === "function";
    // Bad / mismatched target, no rAF (SSR/tests), or reduced-motion (§F3):
    // settle instantly (place the layout, no tween).
    if (!bufB || bufB.length !== bufA.length || !canAnimate || prefersReducedMotion()) {
      settleLayout(mode, bufB && bufB.length === current.length ? bufB : null);
      return;
    }

    morphActive = true;
    setLabelsHidden(true);
    liveMorphBuffer = new Float32Array(bufA.length);
    const startTime = window.performance?.now?.() ?? Date.now();
    // §F2: never let a throwing frame leave the canvas locked (morphActive stuck
    // true freezes every pointer/wheel handler). Any abnormal exit unwinds to a
    // clean Force state and restores interaction + labels.
    const abortMorph = () => {
      cancelLayoutMorphFrame();
      resetLayoutState();
      // The abnormal path has no payload rebuild after resetLayoutState cancels
      // timers, so reconcile its already-cleared hover state explicitly.
      applyConnectedDim();
      fitAndRender();
    };
    const step = (now) => {
      try {
        const elapsed = Math.max(0, now - startTime);
        const progress = Math.min(1, elapsed / LAYOUT_MORPH_DURATION_MS);
        morphPositions(bufA, bufB, easeMergeProgress(progress), liveMorphBuffer);
        renderer.setPositions(liveMorphBuffer);
        renderNow();
        if (progress < 1) {
          layoutMorphFrame = window.requestAnimationFrame(step);
        } else {
          layoutMorphFrame = null;
          settleLayout(mode, bufB);
        }
      } catch {
        abortMorph();
      }
    };
    // Prime frame 0 so there is no flash, then drive the tween.
    try {
      morphPositions(bufA, bufB, 0, liveMorphBuffer);
      renderer.setPositions(liveMorphBuffer);
      renderNow();
      layoutMorphFrame = window.requestAnimationFrame(step);
    } catch {
      abortMorph();
    }
  }

  // --- Collapse/expand GROUP transition driver (redesign spec §3) ------------
  // Animate a grouping (collapse) / ungrouping (expand) as a COHERENT start→final
  // fold, NOT a re-solve/refit morph. The invariant: any node present before AND
  // after keeps its exact on-screen position and the camera never moves (spec §2).
  // REUSES the layout-morph machinery — a per-index lerp (morphPositions) into a
  // reused liveMorphBuffer + the merge-fade style (interpolateGroupFadeStyle) on
  // the SAME rAF loop, locking interaction via morphActive. The swap itself goes
  // through applyCarriedScene (position-preserving, NO fit):
  //   · COLLAPSE — keep the OLD scene, tween each folding child → its group anchor
  //     (fade+shrink), then carried-swap so the group node lands at that anchor.
  //   · EXPAND   — carried-swap FIRST (children stacked on the group's LAST
  //     on-screen position), then tween them OUT to the cached prior constellation
  //     (or a deterministic golden-angle fan) while fading + growing in.

  function cancelGroupTweenFrame() {
    if (typeof window !== "undefined" && groupTweenFrame !== null) {
      window.cancelAnimationFrame(groupTweenFrame);
    }
    groupTweenFrame = null;
  }

  // Redesign spec §3.2 — the collapse/expand SWAP primitive. Swaps the renderer
  // to the NEW scene WITHOUT losing the on-screen coordinate space and WITHOUT a
  // camera refit: rebuild the payload, then OVERWRITE the fresh scene-baked
  // positions BY ID from the pre-swap snapshot (shared nodes carried; group node
  // at the fold centroid on collapse; children stacked on the anchor on expand;
  // brand-new handles at their neighbour-centroid). Persists the carried buffer to
  // activeLayoutBuffer + forceBaseBuffer so later rebuilds don't re-derive scene-
  // baked coords (RC-E), and ends with applyPayloadNoFit() — no refit.
  function applyCarriedScene({ carriedPosById, placedPosById } = {}) {
    // Null the OLD layout buffer so the rebuild yields PRISTINE scene-baked coords
    // (the carry's last-resort fallback); we re-establish the carried buffer below.
    activeLayoutBuffer = null;
    liveMorphBuffer = null;
    rebuildPayload(); // payload = NEW scene (scene-baked coords, overwritten next).
    const graph = payload?.renderGraph;
    if (graph?.positions) {
      const carried = carryScenePositions({
        nodeIds: graph.nodeIds,
        positions: graph.positions,
        edges: graph.edges,
        carriedPosById: carriedPosById ?? new Map(),
        placedPosById: placedPosById ?? new Map(),
      });
      if (carried && carried.length === graph.positions.length) graph.positions.set(carried);
      // Survive later selection/hover/display rebuilds (RC-E). Layers→Force returns
      // to THIS carried buffer, not the unused fresh solve; layoutMode returns to
      // Force so a subsequent switch reads the carried buffer as its base.
      activeLayoutBuffer = new Float32Array(graph.positions);
      forceBaseBuffer = new Float32Array(graph.positions);
      layoutMode = LAYOUT_MODE_FORCE;
    }
    ensureRenderer();
    resizeCanvas();
    applyPayloadNoFit(); // setGraph + setStyle + applyCamera — preserves the camera.
  }

  // Resolve the folding/revealing children against the CURRENT payload (§3.4
  // step 2) — reading positions via currentLayoutBuffer() so a group action that
  // lands mid layout-morph anchors against the LIVE interpolated coords, not the
  // stale scene-baked ones. Delegates the anchor rule (group node's own position
  // when on screen, else member centroid) to the pure resolveGroupFolds core.
  // Returns null when NONE of the anchor children are on screen (the caller then
  // does a position-preserving carried swap, never a refit).
  function collectGroupFolds(anchors) {
    const graph = payload?.renderGraph;
    const idx = payload?.nodeIndexById;
    const positions = currentLayoutBuffer();
    if (!graph || !idx || !positions) return null;
    const info = resolveGroupFolds({
      nodeIds: graph.nodeIds,
      nodeIndexById: idx,
      positions,
      anchors,
    });
    if (!info) return null;
    return { ...info, positions };
  }

  // Resolve the on-screen INDICES of a display-hidden/revealed id set against the
  // CURRENT payload (§SPINE): these fade IN PLACE (bufB==bufA), never toward an
  // anchor. Ids absent from the payload are skipped. Returns an empty set when
  // there is nothing on screen (the caller then does a position-preserving swap).
  function collectInPlaceIndices(ids) {
    const set = new Set();
    const idx = payload?.nodeIndexById;
    if (!(ids instanceof Set) || !idx) return set;
    for (const id of ids) {
      const i = idx.get(id);
      if (Number.isInteger(i)) set.add(i);
    }
    return set;
  }

  // Try to play the animated transition for `transition` (the UNIFIED 4-state
  // descriptor). Returns true when the driver TOOK OVER the scene swap (the caller
  // must NOT also hard-cut), false to fall back to the refit path (safety: missing
  // descriptor, no renderer/payload, unknown kind). NOTE: an on-screen-empty
  // fold/hide set is NOT a false here — the driver still owns the swap and does a
  // position-preserving carried swap.
  //   · kind "out"   — group/hide: tween on the OLD payload (folded → anchor,
  //     hidden → fade-in-place), then carried-swap. (startCollapseTween, extended.)
  //   · kind "in"    — ungroup/show/reset: carried-swap FIRST, then tween on the NEW
  //     payload (unfolded → fan/cache, revealed → fade-in-at-target). (startExpandTween.)
  //   · kind "mixed" — two-sided: carried NON-animated swap (never a refit — strictly
  //     better than today's mixed⇒refit). (applyMixedCarriedSwap.)
  function tryStartGroupTransition(transition) {
    if (!transition || !mounted || !renderer || !payload) return false;
    const folded = transition.folded instanceof Map ? transition.folded : new Map();
    const unfolded = transition.unfolded instanceof Map ? transition.unfolded : new Map();
    const hiddenIds = transition.hiddenIds instanceof Set ? transition.hiddenIds : new Set();
    const revealedIds = transition.revealedIds instanceof Set ? transition.revealedIds : new Set();
    if (transition.kind === "out") return startCollapseTween(folded, hiddenIds);
    if (transition.kind === "in") return startExpandTween(unfolded, revealedIds);
    if (transition.kind === "mixed")
      return applyMixedCarriedSwap({ folded, unfolded, hiddenIds, revealedIds });
    return false;
  }

  // OUT (§3.4 / SPINE): snapshot the OLD on-screen positions, tween each folding
  // child → its group anchor (fade+shrink) AND each newly display-HIDDEN node
  // fade+shrink IN PLACE (bufB==bufA) on the OLD payload, then at t=1 carried-swap
  // so the group node lands EXACTLY where its children converged and every shared
  // node keeps its position. groupSwapPending defers any concurrent selection/
  // display rebuild until after the swap (RC-B). `hiddenIds` = the pure-Hide / Solo
  // complement (empty for a pure group op — byte-identical to a2cf207).
  function startCollapseTween(anchors, hiddenIds = new Set()) {
    const oldPos = currentPositionMap() ?? new Map(); // carriedPosById (with drags)
    const info = collectGroupFolds(anchors);
    const inPlaceIdx = collectInPlaceIndices(hiddenIds);
    if (!info) {
      // No folding child on screen. With nothing hidden either, carried-swap now.
      if (inPlaceIdx.size === 0) {
        groupSwapPending = true;
        finishCollapseSwap(oldPos, new Map(), anchors);
        return true;
      }
      // Pure Hide: no fold anchors, but hidden nodes fade in place. Fall through to
      // the tween on the CURRENT payload with the in-place fade set.
    }
    const positions = info?.positions ?? currentLayoutBuffer() ?? new Float32Array(0);
    const foldingSet = new Set(info?.foldingSet ?? []);
    for (const i of inPlaceIdx) foldingSet.add(i);
    const bufA = new Float32Array(positions);
    const bufB = new Float32Array(positions);
    const placedPosById = new Map(); // groupNodeId -> the fold-centroid anchor
    if (info) {
      for (const [groupId, members] of info.groupMembers) {
        const a = info.anchorPosByGroup.get(groupId);
        placedPosById.set(groupId, { x: a.x, y: a.y });
        for (const i of members) {
          bufB[i * 2] = a.x;
          bufB[i * 2 + 1] = a.y;
        }
      }
    }
    // Hidden nodes: bufB stays == bufA (fade + shrink IN PLACE — spec §4 "→ Hidden").
    groupSwapPending = true;
    // The "jump to end" closure used by the abort path AND the interrupt rule.
    pendingGroupSettle = () => finishCollapseSwap(oldPos, placedPosById, anchors, hiddenIds);
    runGroupTween({
      bufA,
      bufB,
      foldingSet,
      fadeOut: true,
      onDone: () => pendingGroupSettle?.(),
    });
    return true;
  }

  // Collapse settle (§3.4 step 5): carried-swap to the collapsed scene with the
  // group node placed at the fold centroid and shared nodes carried; apply any
  // deferred restyle exactly once; record the folded children's pre-fold positions
  // for a later expand restore (§3.6).
  function finishCollapseSwap(oldPos, placedPosById, anchors, hiddenIds = new Set()) {
    pendingGroupSettle = null;
    resetTransientLayoutState();
    applyCarriedScene({ carriedPosById: oldPos ?? new Map(), placedPosById: placedPosById ?? new Map() });
    // §3.6 WRITE: remember each folded child's PRE-fold position so a same-epoch
    // expand restores the exact prior constellation.
    if (anchors instanceof Map && oldPos instanceof Map) {
      for (const childId of anchors.keys()) {
        const p = oldPos.get(childId);
        if (p) lastKnownPosById.set(childId, { x: p.x, y: p.y, epoch: coordinateEpoch });
      }
    }
    // SPINE: also cache each newly-HIDDEN node's pre-hide position so a later
    // Show / Solo-exit fades it back in at the exact prior spot (same epoch).
    if (hiddenIds instanceof Set && oldPos instanceof Map) {
      for (const id of hiddenIds) {
        const p = oldPos.get(id);
        if (p) lastKnownPosById.set(id, { x: p.x, y: p.y, epoch: coordinateEpoch });
      }
    }
    morphActive = false;
    liveMorphBuffer = null;
    groupSwapPending = false;
    if (pendingPostSwapRestyle) {
      pendingPostSwapRestyle = false;
      updateSelection();
    }
    setLabelsHidden(false);
    renderNow();
  }

  // EXPAND (§3.5): capture the group anchor BEFORE the swap (RC-C), carried-swap
  // FIRST so the revealed children start stacked on the group's last on-screen
  // position, then tween them OUT to their targets (cached prior constellation
  // when same-epoch, else a deterministic golden-angle fan) while fading+growing.
  function startExpandTween(anchors, revealedIds = new Set()) {
    // 1. PRE-swap snapshot — the group node IS in the current payload here.
    const oldPos = currentPositionMap() ?? new Map();
    const anchorPosByGroup = new Map(); // groupNodeId -> its last on-screen position
    for (const groupId of new Set(anchors.values())) {
      const p = oldPos.get(groupId);
      if (p) anchorPosByGroup.set(groupId, { x: p.x, y: p.y });
    }
    // Unfolded children start stacked at their group's former spot; a newly-REVEALED
    // node starts at its cached prior position (same epoch), else it is OMITTED here
    // so the carry places it at its neighbour-centroid (spec §4 "→ Normal-from-Hidden").
    const placedPosById = new Map(); // revealedChildId -> anchorPos(itsGroup)
    for (const [childId, groupId] of anchors) {
      const a = anchorPosByGroup.get(groupId);
      if (a) placedPosById.set(childId, { x: a.x, y: a.y });
    }
    for (const id of revealedIds) {
      const cached = lastKnownPosById.get(id);
      if (cached && cached.epoch === coordinateEpoch) placedPosById.set(id, { x: cached.x, y: cached.y });
    }
    // 2. Carried swap FIRST (camera untouched, shared nodes carried, children on
    // the anchor). Expand's payload is now current — no groupSwapPending needed.
    resetTransientLayoutState();
    applyCarriedScene({ carriedPosById: oldPos, placedPosById });
    // 3. Resolve the revealed children against the NEW payload.
    const info = collectGroupFolds(anchors);
    const revealedIdx = collectInPlaceIndices(revealedIds);
    if (!info && revealedIdx.size === 0) {
      // No unfolded/revealed child on screen → the carried swap already stands.
      // Persist the buffers (RC-E) so later rebuilds don't re-derive scene-baked coords.
      settleGroupTween(payload?.renderGraph?.positions);
      return true;
    }
    const positions = info?.positions ?? currentLayoutBuffer() ?? new Float32Array(0);
    const groupMembers = info?.groupMembers ?? new Map();
    const postAnchor = info?.anchorPosByGroup ?? new Map();
    const foldingSet = new Set(info?.foldingSet ?? []);
    for (const i of revealedIdx) foldingSet.add(i);
    const bufA = new Float32Array(positions); // children currently AT the anchor
    const bufB = new Float32Array(positions);
    // 4. Targets: cached prior constellation (same epoch) else golden-angle fan.
    const targets = computeExpandTargets(groupMembers, postAnchor, positions);
    for (const [i, p] of targets) {
      bufB[i * 2] = p.x;
      bufB[i * 2 + 1] = p.y;
    }
    // Revealed slots stay == bufA (pure fade-in at their cached/neighbour target).
    // 5. Tween on the NEW payload; settle persists activeLayoutBuffer (RC-E).
    pendingGroupSettle = () => settleGroupTween(bufB);
    runGroupTween({
      bufA,
      bufB,
      foldingSet,
      fadeOut: false,
      onDone: () => pendingGroupSettle?.(),
    });
    return true;
  }

  // MIXED (D4): a genuinely two-sided commit (Solo on a stored-Hidden entity; a
  // bulk level re-target Domain→Sub-domain) — some nodes fold/hide AND others
  // reveal in ONE change. A true cross-fade needs both node sets alive in one
  // payload; V1 does a position-preserving CARRIED, NON-animated swap (shared nodes
  // frozen, camera untouched) — strictly better than today's mixed⇒refit hard cut.
  // (Sequential OUT-then-IN is a flagged V2.)
  function applyMixedCarriedSwap({ folded, unfolded, hiddenIds, revealedIds } = {}) {
    const oldPos = currentPositionMap() ?? new Map();
    const placedPosById = new Map();
    // Newly-folded children → their group's on-screen anchor (or member centroid).
    const info = folded instanceof Map && folded.size > 0 ? collectGroupFolds(folded) : null;
    if (info) {
      for (const [groupId, a] of info.anchorPosByGroup) placedPosById.set(groupId, { x: a.x, y: a.y });
    }
    // Unfolded children start stacked on their group's last on-screen position.
    if (unfolded instanceof Map) {
      const anchorByGroup = new Map();
      for (const groupId of new Set(unfolded.values())) {
        const p = oldPos.get(groupId);
        if (p) anchorByGroup.set(groupId, { x: p.x, y: p.y });
      }
      for (const [childId, groupId] of unfolded) {
        const a = anchorByGroup.get(groupId);
        if (a) placedPosById.set(childId, { x: a.x, y: a.y });
      }
    }
    // Revealed nodes at their cached prior position (same epoch), else neighbour.
    if (revealedIds instanceof Set) {
      for (const id of revealedIds) {
        const cached = lastKnownPosById.get(id);
        if (cached && cached.epoch === coordinateEpoch) placedPosById.set(id, { x: cached.x, y: cached.y });
      }
    }
    resetTransientLayoutState();
    applyCarriedScene({ carriedPosById: oldPos, placedPosById });
    // Cache the OUT-ids' pre-swap positions (folded children + hidden nodes) so a
    // later reveal restores them at the exact prior spot.
    if (folded instanceof Map) {
      for (const childId of folded.keys()) {
        const p = oldPos.get(childId);
        if (p) lastKnownPosById.set(childId, { x: p.x, y: p.y, epoch: coordinateEpoch });
      }
    }
    if (hiddenIds instanceof Set) {
      for (const id of hiddenIds) {
        const p = oldPos.get(id);
        if (p) lastKnownPosById.set(id, { x: p.x, y: p.y, epoch: coordinateEpoch });
      }
    }
    // Persist the carried buffer (RC-E) + restore the style — NO tween, NO refit.
    settleGroupTween(payload?.renderGraph?.positions);
    return true;
  }

  // Expand targets (§3.5.2), per revealed-child index: the cached prior position
  // when the cache holds a SAME-epoch entry (collapse→expand round trip restores
  // the exact prior shape), else a deterministic golden-angle (sunflower) fan
  // around the group anchor — sorted by id so the same id set → the same slots.
  function computeExpandTargets(groupMembers, anchorPosByGroup, positions) {
    const nodeIds = payload?.renderGraph?.nodeIds ?? [];
    const targetByIndex = new Map(); // nodeIndex -> {x, y}
    const diag = bboxDiagonal(positions);
    const spacing = Math.max(4 * NODE_RADIUS, 0.02 * diag);
    const cap = 0.15 * diag;
    for (const [groupId, members] of groupMembers) {
      const anchor = anchorPosByGroup.get(groupId) ?? { x: 0, y: 0 };
      const fanIndices = [];
      for (const i of members) {
        const cached = lastKnownPosById.get(nodeIds[i]);
        if (cached && cached.epoch === coordinateEpoch) {
          targetByIndex.set(i, { x: cached.x, y: cached.y });
        } else {
          fanIndices.push(i);
        }
      }
      if (fanIndices.length > 0) {
        const fan = goldenAngleFan({
          anchor,
          childIds: fanIndices.map((i) => nodeIds[i]),
          spacing,
          cap,
        });
        for (const i of fanIndices) {
          const p = fan.get(nodeIds[i]);
          if (p) targetByIndex.set(i, p);
        }
      }
    }
    return targetByIndex;
  }

  // Diagonal of the bounding box of a position buffer (world units) — the scale
  // reference for the expand fan spacing + radius cap. 0 for an empty/degenerate
  // buffer (the fan then collapses to the anchor — harmless, nothing to reveal).
  function bboxDiagonal(positions) {
    if (!positions || positions.length < 2) return 0;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < positions.length; i += 2) {
      const x = positions[i];
      const y = positions[i + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY)) return 0;
    return Math.hypot(maxX - minX, maxY - minY);
  }

  // Settle the end of an EXPAND tween (§3.5 step 5 + RC-E): bake the settled
  // positions, PERSIST them to activeLayoutBuffer + forceBaseBuffer (so a later
  // selection/hover/display rebuild re-applies them instead of re-deriving scene-
  // baked coords and jumping), refresh the position cache, and restore the style.
  function settleGroupTween(buffer) {
    pendingGroupSettle = null;
    morphActive = false;
    liveMorphBuffer = null;
    groupSwapPending = false; // defensive — expand never sets it, but never leak it.
    const positions = payload?.renderGraph?.positions;
    if (positions && buffer && buffer.length === positions.length) positions.set(buffer);
    if (positions) {
      activeLayoutBuffer = new Float32Array(positions);
      forceBaseBuffer = new Float32Array(positions);
      // §3.6: refresh the cache for the settled ids (same epoch).
      const nodeIds = payload?.renderGraph?.nodeIds ?? [];
      for (let i = 0; i < nodeIds.length; i += 1) {
        lastKnownPosById.set(nodeIds[i], {
          x: positions[i * 2] ?? 0,
          y: positions[i * 2 + 1] ?? 0,
          epoch: coordinateEpoch,
        });
      }
    }
    if (renderer && payload) {
      renderer.setPositions(payload.renderGraph.positions);
      renderer.setStyle(payload.style);
    }
    if (pendingPostSwapRestyle) {
      pendingPostSwapRestyle = false;
      updateSelection();
    }
    setLabelsHidden(false);
    renderNow();
  }

  // The shared collapse/expand rAF loop (mirrors startLayoutMorphToBuffer): lerp
  // bufA→bufB per index while fading (fadeOut) / revealing (!fadeOut) the folding
  // node set + its edges, then hand off to `onDone` at t=1.
  function runGroupTween({ bufA, bufB, foldingSet, fadeOut, onDone }) {
    cancelGroupTweenFrame();
    cancelLayoutMorphFrame();
    cancelCameraTween();
    clearHoveredEdge({ notify: false, render: false });
    setHoveredNode(null);

    const canAnimate =
      typeof window !== "undefined" && typeof window.requestAnimationFrame === "function";
    // No rAF (SSR/tests) or reduced-motion (§3.7): skip the tween, settle STRAIGHT
    // to the end state — a position-preserving instant swap, NOT a refit.
    if (
      !renderer ||
      !bufA ||
      !bufB ||
      bufA.length !== bufB.length ||
      !canAnimate ||
      prefersReducedMotion()
    ) {
      onDone?.();
      return;
    }

    morphActive = true;
    setLabelsHidden(true);
    liveMorphBuffer = new Float32Array(bufA.length);
    const startTime = window.performance?.now?.() ?? Date.now();
    // §3.7: an abnormal frame must never leave the canvas locked — JUMP to the end
    // state (finishCollapseSwap / settleGroupTween via onDone), position-
    // preserving; only if THAT also throws do we fall back to the fitAndRender
    // hard cut as the absolute last resort.
    const abort = () => {
      cancelGroupTweenFrame();
      try {
        onDone?.();
      } catch {
        resetLayoutState();
        applyConnectedDim();
        fitAndRender();
      }
    };
    const renderFrame = (eased) => {
      morphPositions(bufA, bufB, eased, liveMorphBuffer);
      renderer.setPositions(liveMorphBuffer);
      // Collapse fades OUT + shrinks toward the anchor; expand fades IN + grows
      // from it. Size never fully vanishes so a node stays pickable-adjacent.
      const alphaScale = fadeOut ? 1 - eased : eased;
      const sizeScale = fadeOut ? 1 - 0.8 * eased : 0.2 + 0.8 * eased;
      renderer.setStyle(interpolateGroupFadeStyle(payload, foldingSet, alphaScale, sizeScale));
      renderNow();
    };
    const step = (now) => {
      try {
        const elapsed = Math.max(0, now - startTime);
        const progress = Math.min(1, elapsed / LAYOUT_MORPH_DURATION_MS);
        renderFrame(easeMergeProgress(progress));
        if (progress < 1) {
          groupTweenFrame = window.requestAnimationFrame(step);
        } else {
          groupTweenFrame = null;
          onDone?.();
        }
      } catch {
        abort();
      }
    };
    // Prime frame 0 synchronously (no flash of the un-animated end state), then
    // drive the tween on the same loop as the layout morph.
    try {
      renderFrame(0);
      groupTweenFrame = window.requestAnimationFrame(step);
    } catch {
      abort();
    }
  }

  // Stable content signature of a scene: node ids + positions + edge endpoints +
  // counts. Two structurally-equivalent scenes share a signature even when they
  // are different object instances (a `$derived.by` recompute), so we don't refit
  // on a no-op rebuild — and a dragged node's position survives such a rebuild.
  function sceneSignature(s) {
    const nodes = s?.nodes ?? [];
    const edges = s?.edges ?? [];
    let key = `${nodes.length}|${edges.length}`;
    for (const n of nodes) {
      key += `;${n.id}`;
      if (typeof n.fx === "number" && typeof n.fy === "number") key += `@${n.fx},${n.fy}`;
      else if (typeof n.x === "number" && typeof n.y === "number") key += `@${n.x},${n.y}`;
    }
    key += "|";
    for (const e of edges) key += `;${e.source}>${e.target}`;
    return key;
  }

  // Content signature of the selection (§3.3): sorted selected ids + focus. Two
  // fresh arrays with the same members share a signature, so the every-toggle
  // fresh-array identity from resolveSelectedIds does not trigger a no-op rebuild.
  function selectionSignature(ids, focus) {
    const list = Array.isArray(ids) ? [...ids].sort() : [];
    return `${focus ?? ""}|${list.join(",")}`;
  }

  $effect(() => {
    // Graph data (scene) change -> rebuild payload and auto-fit the view, but
    // ONLY when the scene's CONTENT actually changed (not merely its object
    // identity). This keeps a hover-triggered recompute from refitting the camera
    // or snapping a dragged node back (#2.4).
    if (scene === lastScene) return;
    const key = sceneSignature(scene);
    lastScene = scene;
    if (key === lastSceneKey) return;
    lastSceneKey = key;
    // Animated collapse/expand: when App signalled a group transition for THIS
    // scene change, its driver OWNS the swap. untrack so this effect depends ONLY
    // on `scene` — a later groupTransition prop update must not re-fire a rebuild
    // and must not become a hidden dependency.
    const raw = untrack(() => groupTransition);
    // Consumed-once (RC-D): groupTransition is a memoized $derived, so a redundant
    // scene tick (the same group action re-laying out positions, or the ontology
    // artifact settling one tick later) re-reads the SAME non-null descriptor.
    // Only a GENUINELY new descriptor (a new object from a new groupedGraph) is
    // FRESH; a re-read is treated as absent so it can neither restart nor kill the
    // in-flight tween.
    const fresh = raw && raw !== lastConsumedGroupTransition ? raw : null;
    if (fresh) lastConsumedGroupTransition = raw;
    // A group tween owns the canvas: a redundant tick (no fresh descriptor) mid-
    // tween must NOT rebuild — let the tween settle (its onDone swaps from the
    // latest scene).
    if (groupTweenFrame !== null && !fresh) return;
    // §3.7 interrupt rule: a GENUINE new transition arriving mid-tween must first
    // COMPLETE the pending swap synchronously (finishCollapseSwap / settleGroupTween
    // via pendingGroupSettle) so `payload` never lags two scenes behind, then start
    // the new transition from the settled state.
    if (groupTweenFrame !== null && fresh && pendingGroupSettle) {
      cancelGroupTweenFrame();
      pendingGroupSettle();
    }
    // Genuine new graph/candidate: drop stale dragged positions before refit.
    draggedPositions.clear();
    // Hand off to the animated driver (collapse/expand). It OWNS the swap (position-
    // preserving carried swap, no refit) and returns true; only an absent/ambiguous
    // transition or a genuine non-group scene change falls through.
    if (untrack(() => tryStartGroupTransition(fresh))) return;
    // Genuine NON-group scene change (model switch, weak-link, time scrub) or mixed/
    // no descriptor: the coordinate space genuinely changes → invalidate the
    // expand-restore cache (§3.6), then the historical reset + refit path. Never
    // tween across a scene-content change (new node indices).
    coordinateEpoch += 1;
    resetLayoutState();
    updateGraph();
  });

  $effect(() => {
    // Selection / focus change → rebuild styling but PRESERVE the current
    // camera (no refit), so clicking or opening a node keeps the user's
    // zoom and pan instead of resetting the view. Reading selectedIds + focusId
    // registers both as dependencies.
    const key = selectionSignature(selectedIds, focusId);
    // §3.3 hardening: resolveSelectedIds returns a FRESH array on EVERY group
    // toggle even when its content is identical (App: `return [...ids]`), so the
    // prop identity changes on every toggle. Compare CONTENT, not identity, so
    // those no-op rebuilds no longer fire at all — which (together with the
    // groupSwapPending deferral) stops the same-flush rebuild that killed collapse
    // (RC-B). A genuine selection/focus change still passes this guard.
    if (key === lastSelectionKey) return;
    lastSelectionKey = key;
    // A selection/focus appearing supersedes any pending pre-selection hover
    // dwell — updateSelection() rebuilds the (selection-dimmed) style itself.
    hoverIntent.cancel();
    // untrack: updateSelection → rebuildPayload READS hoveredNodeId (to style the
    // hovered node). Without untrack, Svelte registers hoveredNodeId as a hidden
    // dependency of THIS effect, so once a selection exists every hover re-fires
    // it → rebuildPayload → clearHoveredEdge, killing edge hover one tick after
    // it is set. Depend ONLY on the explicit selectedIds/focusId reads above.
    untrack(() => updateSelection());
  });

  $effect(() => {
    // codeflow-parity Lot 4: Curved-links / Color-by change → live re-style,
    // preserving the current camera + layout (no re-fit, no morph). Reading both
    // deps registers the effect; the guard in updateDisplayStyle no-ops at mount
    // (updateGraph already did the first render with the defaults).
    curvedLinks;
    colorMode;
    // Configurable edge-transparency deps: a fade-mode / opacity change re-styles
    // LIVE through the same path (per-render edge attributes, no layout recompute).
    edgeAlphaMode;
    edgeOpacity;
    // Same hidden-dependency guard as the selection effect: updateDisplayStyle →
    // rebuildPayload reads hoveredNodeId, so untrack it to depend ONLY on the
    // curvedLinks/colorMode/edge-fade reads above (else a hover re-fires this
    // re-style). Keeping the untrack is CRITICAL — it prevents a hidden
    // hoveredNodeId dependency from killing edge hover.
    untrack(() => updateDisplayStyle());
  });

  $effect(() => {
    const key = mergeKey(mergePair);
    if (!key) {
      completedMergeKey = null;
      if (mergeFrame !== null) {
        cancelMergeFrame();
        restoreBasePositions();
      }
      return;
    }
    if (completedMergeKey === key) return;

    completedMergeKey = key;
    startMergeAnimation(mergePair);
  });

  onMount(() => {
    mounted = true;
    updateGraph();

    if (typeof ResizeObserver !== "undefined" && container) {
      resizeObserver = new ResizeObserver(scheduleResize);
      resizeObserver.observe(container);
    }

    window.addEventListener("resize", scheduleResize);
    // Dual-render BETA toggle (Ctrl+Shift+X) — window-level so the shortcut
    // works regardless of canvas focus.
    window.addEventListener("keydown", handleKeydown);
    // Remark 4: gear settings popover — dismiss on outside click / Escape.
    window.addEventListener("pointerdown", handleSettingsWindowPointerDown);
    window.addEventListener("keydown", handleSettingsWindowKeydown);

    return () => {
      mounted = false;
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleResize);
      window.removeEventListener("keydown", handleKeydown);
      window.removeEventListener("pointerdown", handleSettingsWindowPointerDown);
      window.removeEventListener("keydown", handleSettingsWindowKeydown);
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
      if (indicatorTimer !== null) window.clearTimeout(indicatorTimer);
      hoverIntent.cancel();
      cancelMergeFrame();
      cancelGroupTweenFrame();
      cancelLayoutMorphFrame();
      cancelCameraTween();
      renderer?.destroy();
      renderer = null;
    };
  });

  onDestroy(() => {
    if (renderer) {
      renderer.destroy();
      renderer = null;
    }
    // Lot 7: release the off-main-thread layout worker.
    terminateForceWorker();
  });
</script>

<div class="canvas" bind:this={container}>
  <div class="canvas-toolbar" aria-label="Graph controls">
    <Button
      class="reset-view-button"
      size="sm"
      variant="secondary"
      aria-label="Reset view"
      onclick={fitAndRender}
    >Reset</Button>
    {#if showLayoutSwitcher}
      <!-- Representation-polish remark 4: the whole layout/spacing/display
           toolbar collapses behind a gear icon into a settings popover
           (codeflow parity) instead of a permanently-open control row. -->
      <div class="graph-settings-host" bind:this={settingsHost}>
        <Popover label="Graph display settings" open={settingsOpen} placement="bottom">
          {#snippet trigger()}
            <IconButton
              size="sm"
              variant="secondary"
              aria-label="Graph display settings"
              aria-expanded={settingsOpen}
              onclick={toggleSettings}
            >
              <Settings size={16} strokeWidth={2} aria-hidden="true" />
            </IconButton>
          {/snippet}
          {#snippet children()}
            <div class="graph-settings-panel">
              <!-- LAYOUT: codeflow-parity Lot 1/2/6 layout switcher (Force ·
                   Radial · Layers · Grid · Metro). Choosing a mode drives the
                   all-node morph tween. -->
              <section class="graph-settings-section" aria-label="Layout">
                <p class="graph-settings-heading">Layout</p>
                <ButtonGroup attached size="sm" label="Graph layout" class="layout-switcher">
                  {#each LAYOUT_MODES as mode (mode.id)}
                    <Button
                      size="sm"
                      variant={layoutMode === mode.id ? "primary" : "secondary"}
                      aria-pressed={layoutMode === mode.id}
                      aria-label={`${mode.label} layout`}
                      onclick={() => selectLayoutMode(mode.id)}
                    >{mode.label}</Button>
                  {/each}
                </ButtonGroup>
              </section>
              <!-- SPACING: codeflow-parity Lot 3 force spacing controls. `input`
                   only updates the label; the expensive Barnes-Hut solve runs on
                   `change` (drag-end). Interactive solves warm-start; Reset is the
                   deterministic cold solve. Remark 6: Spread/Links sit on their
                   own row and are DISABLED off-Force — they only drive the force
                   re-solve, so they (and Reset, same re-solve) are inert on any
                   other layout. -->
              <section class="graph-settings-section" aria-label="Spacing">
                <p class="graph-settings-heading">Spacing</p>
                <div class="force-sliders-row" aria-label="Force spacing controls">
                  <label class:is-disabled={layoutMode !== LAYOUT_MODE_FORCE}>
                    <span>Spread {forceSpread.toFixed(1)}</span>
                    <input
                      type="range"
                      min="0.2"
                      max="3"
                      step="0.1"
                      value={forceSpread}
                      aria-label="Spread"
                      disabled={layoutMode !== LAYOUT_MODE_FORCE}
                      oninput={(event) => (forceSpread = Number(event.currentTarget.value))}
                      onchange={commitForceSpread}
                    />
                  </label>
                  <label class:is-disabled={layoutMode !== LAYOUT_MODE_FORCE}>
                    <span>Links {forceLinks.toFixed(1)}</span>
                    <input
                      type="range"
                      min="0.2"
                      max="2"
                      step="0.1"
                      value={forceLinks}
                      aria-label="Links"
                      disabled={layoutMode !== LAYOUT_MODE_FORCE}
                      oninput={(event) => (forceLinks = Number(event.currentTarget.value))}
                      onchange={commitForceLinks}
                    />
                  </label>
                </div>
                <div class="force-reset-row">
                  <Button
                    size="sm"
                    variant="secondary"
                    aria-label="Reset layout"
                    disabled={layoutMode !== LAYOUT_MODE_FORCE}
                    onclick={resetForceLayout}
                  >Reset</Button>
                </div>
              </section>
              <!-- DISPLAY: codeflow-parity Lot 4 Color-by (Folder · Layer ·
                   Churn) + Curved-links. Both re-style LIVE (no layout
                   recompute, no morph). -->
              <section class="graph-settings-section" aria-label="Display">
                <p class="graph-settings-heading">Display</p>
                <ButtonGroup attached size="sm" label="Colour by" class="color-switcher">
                  {#each COLOR_MODES as mode (mode.id)}
                    <Button
                      size="sm"
                      variant={colorMode === mode.id ? "primary" : "secondary"}
                      aria-pressed={colorMode === mode.id}
                      aria-label={`Colour by ${mode.label}`}
                      onclick={() => selectColorMode(mode.id)}
                    >{mode.label}</Button>
                  {/each}
                </ButtonGroup>
                {#if colorMode === COLOR_BY_CHURN}
                  <div class="churn-legend" aria-label="Degree colour legend">
                    <span>Low</span><span class="churn-ramp"></span><span>High</span>
                  </div>
                {/if}
                <Switch
                  class="curved-links-toggle"
                  label="Curved links"
                  checked={curvedLinks}
                  onchange={toggleCurvedLinks}
                />
                <!-- Configurable edge-transparency: a segmented Edge-fade mode +
                     an Edge-opacity slider. Both re-style LIVE like Color-by. -->
                <ButtonGroup attached size="sm" label="Edge fade" class="edge-fade-switcher">
                  {#each EDGE_FADE_MODES as mode (mode.id)}
                    <Button
                      size="sm"
                      variant={edgeAlphaMode === mode.id ? "primary" : "secondary"}
                      aria-pressed={edgeAlphaMode === mode.id}
                      aria-label={`Edge fade ${mode.label}`}
                      onclick={() => selectEdgeAlphaMode(mode.id)}
                    >{mode.label}</Button>
                  {/each}
                </ButtonGroup>
                <label class="edge-opacity-row">
                  <span>Edge opacity {edgeOpacity.toFixed(2)}</span>
                  <input
                    type="range"
                    min="0.1"
                    max="0.8"
                    step="0.05"
                    value={edgeOpacity}
                    aria-label="Edge opacity"
                    oninput={(event) => (edgeOpacity = Number(event.currentTarget.value))}
                  />
                </label>
              </section>
            </div>
          {/snippet}
        </Popover>
      </div>
    {/if}
  </div>

  <!-- Keyed on the active backend: a <canvas> is permanently bound to its first
       context type, so toggling canvas2d <-> WebGL2 must remount a FRESH canvas
       (otherwise getContext("webgl2") on a 2D-poisoned canvas returns null and
       mode B reports "WebGL2 unavailable"). Svelte re-attaches the handlers. -->
  {#key activeBackend}
    <canvas
      class="canvas-element"
      bind:this={canvas}
      aria-label="Ontology knowledge graph"
      onclick={handleClick}
      ondblclick={handleDoubleClick}
      onpointermove={handlePointerMove}
      onpointerdown={handlePointerDown}
      onpointerup={handlePointerUp}
      onmouseleave={handlePointerLeave}
      onwheel={handleWheel}
    ></canvas>
  {/key}

  <!-- Stacked Canvas2D overlay for the WebGL2 in-box label text (mode B). It
       shares the main canvas's CSS box, never receives pointer events, and stays
       cleared in mode A. -->
  <canvas
    class="canvas-overlay"
    bind:this={overlayCanvas}
    aria-hidden="true"
  ></canvas>

  <!-- Render-backend badge. On a successful WebGL2 boot it stays HIDDEN until the
       first Ctrl+Shift+X (clean default UI); a boot fallback to canvas2d
       (`backendUnavailable`) REVEALS it immediately so the unavailable state is
       visible. Once revealed it reflects the live mode and doubles as a click
       target to switch (same as the shortcut). -->
  {#if switchActivated || backendUnavailable}
    <button
      type="button"
      class="render-indicator"
      class:is-toggled={justToggled}
      class:is-unavailable={backendUnavailable && activeBackend === CANVAS2D_BACKEND}
      class:is-webgl={activeBackend === WEBGL2_BACKEND}
      title="Render backend — click or press Ctrl+Shift+X to switch"
      aria-live="polite"
      onclick={toggleRenderBackend}
    >{backendBadge}</button>
  {/if}

  {#if labels.length}
    <div class={`node-labels node-labels-${labelMode}`} aria-hidden="true">
      {#each labels as item (item.id)}
        <span
          class={item.active ? "node-label node-label-active" : "node-label"}
          style={`left: ${item.x}px; top: ${item.y}px;`}
          title={item.fullLabel}
        >{item.label}</span>
      {/each}
    </div>
  {/if}

  {#if hoveredNode}
    <div
      class="node-tooltip"
      style={`left: ${hoveredNode.localX + 14}px; top: ${hoveredNode.localY + 14}px;`}
      role="status"
    >
      <strong>{hoveredNode.label}</strong>
      {#if hoveredNode.node_type}
        <span class="node-tooltip-type">{hoveredNode.node_type}</span>
      {/if}
      <span class="node-tooltip-degree">Degree: {hoveredNode.degree}</span>
    </div>
  {/if}

  {#if hoveredEdge?.edge}
    <div
      class="edge-tooltip"
      style={`left: ${hoveredEdge.localX + 12}px; top: ${hoveredEdge.localY + 12}px;`}
      role="status"
    >
      <strong>{hoveredEdge.sourceLabel}</strong>
      <span>{hoveredEdge.edge.relation ?? hoveredEdge.edge.label ?? "edge"}</span>
      <strong>{hoveredEdge.targetLabel}</strong>
    </div>
  {/if}

  {#if !hasNodes}
    <p class="canvas-empty">No nodes to render. Adjust the filters or load a graph.</p>
  {/if}
</div>

<style>
  .canvas {
    position: relative;
    background: var(--st-semantic-surface-default, #fff);
    min-height: 0;
    height: 100%;
    width: 100%;
    overflow: hidden;
  }

  .canvas-toolbar {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    z-index: 3;
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    align-items: center;
    gap: 0.35rem 0.5rem;
    max-width: calc(100% - 1rem);
    pointer-events: auto;
    /* Button sm uses controlHeight; IconButton sm uses smSize. Pin both DS
       anatomy tokens to one value so Reset and the square gear are exact peers. */
    --graph-toolbar-control-height: 2rem;
    --st-component-button-anatomy-density-sm-controlHeight: var(--graph-toolbar-control-height);
    --st-component-iconButton-smSize: var(--graph-toolbar-control-height);
    --st-component-button-anatomy-density-sm-fontSize: 0.75rem;
  }

  .canvas-toolbar :global(.reset-view-button),
  .canvas-toolbar :global(.st-iconButton--sm) {
    box-sizing: border-box;
    height: var(--graph-toolbar-control-height);
    min-height: var(--graph-toolbar-control-height);
  }

  /* Representation-polish remark 4: gear-icon trigger + settings popover
     host. The popover itself (DS Popover) anchors LEFT of its trigger by
     default (.st-popover--bottom { left: 0 }), which would overflow past the
     canvas's right edge since the gear sits at the toolbar's far-right end —
     flip it to anchor from the RIGHT so the panel grows leftward, staying
     inside the canvas. */
  .graph-settings-host {
    position: relative;
  }

  .graph-settings-host :global(.st-popover--bottom) {
    left: auto;
    right: 0;
  }

  /* Representation-polish remark 5: every control in the settings panel
     (layout buttons, Color-by, slider labels) uses the SAME compact font as
     the small "Reset" button (0.75rem) instead of the DS
     sm-density default (0.875rem for Button), which reads noticeably bigger
     side-by-side with Reset. Overriding the anatomy tokens here (rather than
     fighting specificity) keeps every DS Button/ButtonGroup inside the panel
     on the SAME compact scale, DS-consistent.
  */
  .graph-settings-panel {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    font-size: 0.75rem;
    --st-component-button-anatomy-density-sm-fontSize: 0.75rem;
    --st-component-button-anatomy-density-sm-controlHeight: 1.75rem;
    --st-component-button-anatomy-density-sm-paddingInline: 0.6rem;
    --st-component-button-anatomy-density-sm-paddingInlineEnd: 0.6rem;
  }

  /* Switch hardcodes its label font-size (no anatomy token to override), so
     match Reset's compact scale directly. */
  .graph-settings-panel :global(.st-switch__label) {
    font-size: 0.75rem;
  }

  .graph-settings-section {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .graph-settings-heading {
    margin: 0;
    color: var(--st-semantic-text-muted, #64748b);
    font-size: 0.68rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  /* codeflow-parity Lot 3 / remark 6: Spread + Links each get their own line
     (stacked), separate from the Layout switcher above and the Reset button
     below. `input` only updates the label; the expensive Barnes-Hut solve
     runs on `change` (drag-end). */
  .force-sliders-row {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .force-sliders-row label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.75rem;
    white-space: nowrap;
  }

  /* Remark 6: greyed + non-interactive whenever the active layout isn't
     Force — Spread/Links (and Reset, same re-solve) only drive the force
     re-solve, so they're inert on any other layout. */
  .force-sliders-row label.is-disabled {
    color: var(--st-semantic-text-muted, #94a3b8);
    opacity: 0.55;
  }

  .force-sliders-row input[type="range"] {
    flex: 1;
    min-width: 0;
  }

  .force-sliders-row input[type="range"]:disabled {
    cursor: not-allowed;
  }

  .force-reset-row {
    display: flex;
    justify-content: flex-end;
  }

  .churn-legend {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--st-semantic-border-muted, #e2e8f0);
    border-radius: 4px;
    background: color-mix(in srgb, var(--st-semantic-surface-default, #fff) 90%, transparent);
    box-shadow: 0 1px 4px rgb(15 23 42 / 0.08);
    font-size: 0.75rem;
    white-space: nowrap;
  }

  .churn-ramp {
    width: 3.5rem;
    height: 0.6rem;
    border-radius: 999px;
    background: linear-gradient(90deg, #e2e8f0, #ef4444);
  }

  /* codeflow-parity Lot 4: keep the Curved-links DS Switch compact + legible
     inside the DISPLAY section of the settings panel (matches the segmented
     controls' scale). */
  .canvas-toolbar :global(.curved-links-toggle) {
    gap: 0.4rem;
    padding: 0.2rem 0.5rem;
    border: 1px solid var(--st-semantic-border-muted, #e2e8f0);
    border-radius: 4px;
    background: color-mix(in srgb, var(--st-semantic-surface-default, #fff) 90%, transparent);
    box-shadow: 0 1px 4px rgb(15 23 42 / 0.08);
    font-size: 0.75rem;
    white-space: nowrap;
  }

  /* Configurable edge-transparency: the Edge-opacity slider row matches the
     Spread/Links force sliders' compact scale + layout. */
  .edge-opacity-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.75rem;
    white-space: nowrap;
  }

  .edge-opacity-row input[type="range"] {
    flex: 1;
    min-width: 0;
  }

  .canvas-element {
    display: block;
    width: 100%;
    height: 100%;
    cursor: default;
  }

  .canvas-element:focus-visible {
    outline: 2px solid var(--st-semantic-action-primary, #2563eb);
    outline-offset: -2px;
  }

  /* Box-text overlay: same CSS box as the main canvas, painted on top, never
     intercepts pointer events (all hit-testing stays on the main canvas). */
  .canvas-overlay {
    position: absolute;
    inset: 0;
    z-index: 1;
    display: block;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  /* Transient render-mode indicator badge (auto-hides ~2s after a toggle). */
  .render-indicator {
    position: absolute;
    top: 0.5rem;
    left: 0.5rem;
    z-index: 4;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    margin: 0;
    padding: 0.3rem 0.6rem;
    border: 1px solid var(--st-semantic-border-muted, #e2e8f0);
    border-radius: 4px;
    background: color-mix(in srgb, var(--st-semantic-surface-inverse, #0f172a) 88%, transparent);
    color: var(--st-semantic-text-inverse, #fff);
    font: inherit;
    font-size: 0.72rem;
    line-height: 1;
    cursor: pointer;
    pointer-events: auto;
    box-shadow: 0 2px 8px rgb(15 23 42 / 0.18);
    transition: transform 0.12s ease, box-shadow 0.12s ease, background 0.12s ease;
  }
  .render-indicator::before {
    content: "";
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 50%;
    background: var(--st-semantic-text-muted, #94a3b8);
  }
  .render-indicator.is-webgl::before {
    background: var(--st-semantic-status-success, #22c55e);
  }
  .render-indicator.is-unavailable::before {
    background: var(--st-semantic-status-warning, #f59e0b);
  }
  .render-indicator:hover {
    box-shadow: 0 3px 12px rgb(15 23 42 / 0.28);
  }
  .render-indicator.is-toggled {
    transform: scale(1.06);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--st-semantic-status-success, #22c55e) 45%, transparent);
  }

  .canvas-empty {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    margin: 0;
    padding: 1rem;
    color: var(--st-semantic-text-muted, #64748b);
    font-style: italic;
    pointer-events: none;
    text-align: center;
  }

  /* Label overlay container (positioning machinery shared by all label modes). */
  .node-labels {
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;
    overflow: hidden;
  }

  /* Plain-text labels (recon view): no border/box — just legible text with a
     subtle halo/text-shadow so it reads over edges. */
  .node-label {
    position: absolute;
    transform: translate(-50%, -100%);
    max-width: 12rem;
    padding: 0;
    color: var(--st-semantic-text-default, #1e293b);
    text-shadow:
      0 0 2px var(--st-semantic-surface-default, #fff),
      0 0 2px var(--st-semantic-surface-default, #fff),
      0 0 3px var(--st-semantic-surface-default, #fff);
    font-size: 0.68rem;
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .node-label-active {
    color: var(--st-semantic-action-primary, #2563eb);
    font-weight: 600;
    z-index: 2;
  }

  .node-tooltip {
    position: absolute;
    z-index: 2;
    max-width: min(20rem, calc(100% - 1.5rem));
    padding: 0.45rem 0.55rem;
    border-radius: 4px;
    background: var(--st-semantic-surface-inverse, #0f172a);
    color: var(--st-semantic-text-inverse, #fff);
    box-shadow: 0 8px 20px rgb(15 23 42 / 0.18);
    font-size: 0.75rem;
    line-height: 1.3;
    pointer-events: none;
  }

  .node-tooltip strong,
  .node-tooltip-type,
  .node-tooltip-degree {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .node-tooltip-type {
    opacity: 0.7;
    font-size: 0.7rem;
  }

  .node-tooltip-degree {
    opacity: 0.6;
    font-size: 0.7rem;
    margin-top: 0.15rem;
  }

  .edge-tooltip {
    position: absolute;
    z-index: 2;
    max-width: min(18rem, calc(100% - 1.5rem));
    padding: 0.45rem 0.55rem;
    border-radius: 4px;
    background: var(--st-semantic-surface-inverse, #0f172a);
    color: var(--st-semantic-text-inverse, #fff);
    box-shadow: 0 8px 20px rgb(15 23 42 / 0.18);
    font-size: 0.75rem;
    line-height: 1.25;
    pointer-events: none;
  }

  .edge-tooltip strong,
  .edge-tooltip span {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .edge-tooltip span {
    opacity: 0.78;
  }
</style>
