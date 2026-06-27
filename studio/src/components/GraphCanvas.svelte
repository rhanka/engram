<script>
  import { onDestroy, onMount, tick } from "svelte";
  import { createGraphRenderer, drawBoxLabels2D } from "@sentropic/graph";

  import {
    buildConnectedDimStyle,
    buildGraphRendererPayload,
    findNearestEdge,
    findNearestNode,
    findNearestNodeId,
    interpolateMergeStyle,
    interpolateMergePositions,
    isBoxShape,
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
  // Hide edges during pan/zoom when nodes+edges exceed this, for interaction fluidity on large graphs.
  const EDGE_SKIP_THRESHOLD = 1000;
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

  // Dual-render BETA switch (Ctrl+Shift+X). Mode A = canvas2d (DEFAULT). Mode B
  // = WebGL2 beta. Default unchanged: the studio always boots on canvas2d.
  let activeBackend = $state(CANVAS2D_BACKEND);
  // True when a switch to mode B found no WebGL2 context and reverted to A.
  let backendUnavailable = $state(false);
  // Transient indicator-badge text (auto-hides ~2s after a toggle).
  let renderIndicator = $state(null);
  let indicatorTimer = null;
  let resizeObserver = null;
  let resizeFrame = null;
  let mergeFrame = null;
  let completedMergeKey = null;
  let hoveredEdge = $state(null);
  let hoveredNode = $state(null);
  let hoveredNodeId = $state(null);

  // Scene identity tracking so we only auto-fit on a genuine new graph (not selection/focus).
  let lastScene = null;
  // Stable content signature of the last scene we built from. A `$derived.by`
  // scene (e.g. the reconciliation view) returns a NEW object on every recompute,
  // so comparing by object reference alone would refit/reset on any hover after a
  // drag (#2.4). We additionally compare a content signature (node ids + positions
  // + edge endpoints): a recompute that yields the SAME content does NOT refit,
  // which also preserves a dragged node's position across an incidental rebuild.
  let lastSceneKey = null;
  // True when the current update path is a real scene/graph-data change (mount/new graph/resize).
  let skipEdgesOnInteract = false;
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
  //   Mode B = { backend: "webgl", instancedShapes: true, pixelRatio }.
  // `createBackendRenderer` degrades gracefully: when mode B is requested but no
  // WebGL2 context is available, it reverts to canvas2d and we flag the
  // unavailable indicator.
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
    showRenderIndicator();
  }

  function showRenderIndicator() {
    renderIndicator =
      backendUnavailable && activeBackend === CANVAS2D_BACKEND
        ? "WebGL2 unavailable — using Canvas2D"
        : backendIndicatorLabel(activeBackend);
    if (typeof window === "undefined") return;
    if (indicatorTimer !== null) window.clearTimeout(indicatorTimer);
    indicatorTimer = window.setTimeout(() => {
      indicatorTimer = null;
      renderIndicator = null;
    }, 2000);
  }

  function fitAndRender() {
    if (!renderer || !canvas) return;

    const viewportWidth = Math.max(1, canvas.width);
    const viewportHeight = Math.max(1, canvas.height);
    const padding = Math.min(FIT_PADDING * pixelRatio, Math.floor(Math.min(viewportWidth, viewportHeight) / 3));

    renderer.fitView({ padding, viewportWidth, viewportHeight });
    camera = renderer.snapshot().camera;
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
      if (n > 0) {
        camera = { ...camera, x: sx / n, y: sy / n };
        renderer.setCamera(camera);
      }
    }
    renderNow();
    setLabelsHidden(false);
  }

  function applyCamera(skipEdges = false) {
    if (!renderer) return;
    renderer.setCamera(camera);
    renderNow(skipEdges ? { skipEdges: true } : undefined);
    updateLabels();
  }

  // --- Zoom centred on cursor ---
  function handleWheel(event) {
    if (!renderer || !canvas) return;
    event.preventDefault();

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
        if (renderer && skipEdgesOnInteract) renderNow();
        setLabelsHidden(false);
      }, ZOOM_SETTLE_MS);
    }
  }

  // --- Pointer down: node drag (over a node) or pan (over the background) ---
  function handlePointerDown(event) {
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
      ...(Number.isFinite(labelMaxChars) ? { labelMaxChars } : {}),
    });
    clearHoveredEdge({ notify: false, render: false });
    computeNodeDegrees();
    reapplyDraggedPositions();

    // Skip edges during pan/zoom only when the object count is large enough.
    const objectCount = (scene?.nodes?.length ?? 0) + (scene?.edges?.length ?? 0);
    skipEdgesOnInteract = objectCount > edgeSkipThreshold;
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
    ensureRenderer();
    resizeCanvas();
    applyPayload();
  }

  // Selection/focus update — preserves the user's current zoom and pan.
  function updateSelection() {
    if (!mounted) return;

    rebuildPayload();
    ensureRenderer();
    resizeCanvas();
    applyPayloadNoFit();
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
    // A click that concludes a node drag must not also select.
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    const id = pickNode(event);
    if (id) onSelect?.(id);
  }

  function handleDoubleClick(event) {
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
    // Item 1.3: the node hit-test no longer wins unconditionally. We compute BOTH
    // the nearest node and the nearest edge, then:
    //   - if the cursor is within the node's TIGHT (drawn-radius + slop) zone, the
    //     node clearly wins (you're on the glyph);
    //   - otherwise pick whichever the cursor is proportionally closer to, comparing
    //     each hit's distance NORMALIZED by its own pick threshold. This stops a
    //     node from "magnetizing" the hover when the cursor is really over an edge.
    const nodeMaxDistance = PICK_RADIUS * world.scale;
    const edgeMaxDistance = EDGE_PICK_RADIUS * world.scale;
    const nodeHit = findNearestNode(payload, world.x, world.y, nodeMaxDistance);
    const edgeHit = findNearestEdge(payload, world.x, world.y, edgeMaxDistance);

    // Tight node zone: on the glyph (radius) plus a few CSS px of slop.
    const tightNodeRadius = (nodeHit?.radius ?? 0) + NODE_TIGHT_SLOP * world.scale;
    const onNodeGlyph = nodeHit !== null && nodeHit.distance <= tightNodeRadius;

    // Normalized distances (0 = dead centre of the pick zone, 1 = its edge).
    const nodeNorm = nodeHit ? nodeHit.distance / Math.max(nodeMaxDistance, nodeHit.radius) : Infinity;
    const edgeNorm = edgeHit ? edgeHit.distance / edgeMaxDistance : Infinity;
    const preferNode = nodeHit !== null && (onNodeGlyph || edgeHit === null || nodeNorm <= edgeNorm);

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

    if (mounted && payload) {
      const style = buildConnectedDimStyle(payload, {
        selectedIds: selectedIds ?? [],
        focusId,
        hoveredNodeId,
      });
      if (renderer && style) {
        payload = { ...payload, style };
        renderer.setStyle(style);
        renderNow();
      }
    }

    // Always-on label for the hovered node (plus the god-node set).
    updateLabels();
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
    // Genuine new graph/candidate: drop stale dragged positions before refit.
    draggedPositions.clear();
    updateGraph();
  });

  $effect(() => {
    // Selection / focus change → rebuild styling but PRESERVE the current
    // camera (no refit), so clicking or opening a node keeps the user's
    // zoom and pan instead of resetting the view.
    selectedIds;
    focusId;
    updateSelection();
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

    return () => {
      mounted = false;
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleResize);
      window.removeEventListener("keydown", handleKeydown);
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
      if (indicatorTimer !== null) window.clearTimeout(indicatorTimer);
      cancelMergeFrame();
      renderer?.destroy();
      renderer = null;
    };
  });

  onDestroy(() => {
    if (renderer) {
      renderer.destroy();
      renderer = null;
    }
  });
</script>

<div class="canvas" bind:this={container}>
  <div class="canvas-toolbar" aria-label="Graph controls">
    <button
      class="toolbar-btn"
      type="button"
      aria-label="Reset view"
      onclick={fitAndRender}
    >Reset</button>
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

  {#if renderIndicator}
    <div class="render-indicator" role="status" aria-live="polite">{renderIndicator}</div>
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
    gap: 0.35rem;
    pointer-events: auto;
  }

  .toolbar-btn {
    padding: 0.3rem 0.6rem;
    border: 1px solid var(--st-semantic-border-muted, #e2e8f0);
    border-radius: 4px;
    background: color-mix(in srgb, var(--st-semantic-surface-default, #fff) 90%, transparent);
    color: var(--st-semantic-text-default, #1e293b);
    font-size: 0.75rem;
    line-height: 1;
    cursor: pointer;
    box-shadow: 0 1px 4px rgb(15 23 42 / 0.08);
  }

  .toolbar-btn:hover {
    background: var(--st-semantic-surface-hover, #f1f5f9);
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
    padding: 0.3rem 0.6rem;
    border: 1px solid var(--st-semantic-border-muted, #e2e8f0);
    border-radius: 4px;
    background: color-mix(in srgb, var(--st-semantic-surface-inverse, #0f172a) 88%, transparent);
    color: var(--st-semantic-text-inverse, #fff);
    font-size: 0.72rem;
    line-height: 1;
    pointer-events: none;
    box-shadow: 0 2px 8px rgb(15 23 42 / 0.18);
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
