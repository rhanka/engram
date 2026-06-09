<script>
  import { onDestroy, onMount } from "svelte";
  import { createGraphRenderer } from "@sentropic/graph";

  import {
    buildGraphRendererPayload,
    findNearestEdge,
    findNearestNodeId,
    interpolateMergeStyle,
    interpolateMergePositions,
  } from "../lib/graphRendererPayload.js";

  const EMPTY_SCENE = {
    nodes: [],
    edges: [],
    stats: { nodeCount: 0, edgeCount: 0, communityCount: 0 },
  };
  const NODE_RADIUS = 3;
  const FIT_PADDING = 48;
  const PICK_RADIUS = 16;
  const EDGE_PICK_RADIUS = 12;
  const MERGE_ANIMATION_DURATION_MS = 520;

  let {
    scene = EMPTY_SCENE,
    selectedIds = [],
    focusId = null,
    legend = [],
    onSelect,
    onOpenEntity,
    onEdgeHover,
    mergePair = null,
    onMergeComplete,
  } = $props();

  let container;
  let canvas;
  let renderer = null;
  let payload = null;
  let camera = { x: 0, y: 0, zoom: 1 };
  let pixelRatio = 1;
  let mounted = false;
  let resizeObserver = null;
  let resizeFrame = null;
  let mergeFrame = null;
  let completedMergeKey = null;
  let hoveredEdge = $state(null);
  let hoveredNode = $state(null);
  let hoveredNodeId = $state(null);

  // Pan state — not reactive, managed imperatively
  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;
  let panStartCameraX = 0;
  let panStartCameraY = 0;

  const hasNodes = $derived((scene?.nodes?.length ?? 0) > 0);
  const hasLegend = $derived((legend?.length ?? 0) > 0);

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

    return changed;
  }

  function ensureRenderer() {
    if (!canvas) return;

    const nextPixelRatio = readPixelRatio();
    if (renderer && nextPixelRatio === pixelRatio) return;

    renderer?.destroy();
    pixelRatio = nextPixelRatio;
    renderer = createGraphRenderer(canvas, { backend: "canvas2d", pixelRatio });
  }

  function fitAndRender() {
    if (!renderer || !canvas) return;

    const viewportWidth = Math.max(1, canvas.width);
    const viewportHeight = Math.max(1, canvas.height);
    const padding = Math.min(FIT_PADDING * pixelRatio, Math.floor(Math.min(viewportWidth, viewportHeight) / 3));

    renderer.fitView({ padding, viewportWidth, viewportHeight });
    camera = renderer.snapshot().camera;
    renderer.render();
  }

  function applyCamera() {
    if (!renderer) return;
    renderer.setCamera(camera);
    renderer.render();
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
    applyCamera();
  }

  // --- Pan on background drag ---
  function handlePointerDown(event) {
    const id = pickNode(event);
    if (id) return; // clicking a node starts selection, not pan

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
    if (!isPanning) return;
    isPanning = false;
    if (canvas) canvas.style.cursor = "default";
  }

  function applyPayload() {
    if (!renderer || !payload) return;

    renderer.setGraph(payload.renderGraph);
    renderer.setStyle(payload.style);
    fitAndRender();
  }

  function updateGraph() {
    if (!mounted) return;

    payload = buildGraphRendererPayload(scene ?? EMPTY_SCENE, {
      selectedIds: selectedIds ?? [],
      focusId,
      hoveredNodeId,
      nodeRadius: NODE_RADIUS,
    });
    clearHoveredEdge({ notify: false, render: false });

    ensureRenderer();
    resizeCanvas();
    applyPayload();
  }

  function handleResize() {
    if (!mounted) return;

    ensureRenderer();
    resizeCanvas();
    applyPayload();
  }

  function scheduleResize() {
    if (typeof window === "undefined") return;
    if (resizeFrame !== null) return;

    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = null;
      handleResize();
    });
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

  function pickNode(event) {
    if (!payload) return null;

    const world = eventToWorld(event);
    if (!world) return null;

    const maxDistance = (PICK_RADIUS * world.scale) / Math.max(Number.EPSILON, camera.zoom);
    return findNearestNodeId(payload, world.x, world.y, maxDistance);
  }

  function handleClick(event) {
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
    style.edgeWidths[hit.index] = Math.max(width, 2.5);
    style.edgeColors[hit.index * 4 + 3] = 255;
    return style;
  }

  function renderHoverStyle(hit) {
    if (!renderer || !payload) return;
    const style = styleForHoveredEdge(hit);
    if (style) renderer.setStyle(style);
    renderer.render();
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
      applyCamera();
      return;
    }

    if (!payload) return;

    const world = eventToWorld(event);
    if (!world) {
      clearHoveredEdge();
      setHoveredNode(null);
      return;
    }

    const nodeMaxDistance = (PICK_RADIUS * world.scale) / Math.max(Number.EPSILON, camera.zoom);
    const nodeId = findNearestNodeId(payload, world.x, world.y, nodeMaxDistance);
    if (nodeId) {
      clearHoveredEdge();
      if (canvas) canvas.style.cursor = "pointer";
      setHoveredNode(nodeId, world.localX, world.localY);
      return;
    }

    setHoveredNode(null);
    const edgeMaxDistance = (EDGE_PICK_RADIUS * world.scale) / Math.max(Number.EPSILON, camera.zoom);
    const hit = findNearestEdge(payload, world.x, world.y, edgeMaxDistance);
    if (canvas) canvas.style.cursor = hit ? "crosshair" : "default";
    setHoveredEdge(hit, world.localX, world.localY);
  }

  function setHoveredNode(nodeId, localX = 0, localY = 0) {
    const prevId = hoveredNodeId;
    if (nodeId === prevId) return;

    hoveredNodeId = nodeId;
    if (nodeId && payload) {
      const node = payload.nodeById?.get(nodeId);
      const graph = payload.renderGraph;
      const nodeIdx = payload.nodeIndexById?.get(nodeId);
      // Compute degree: count edges where this node is source or target
      const edgeCount = graph ? graph.edges.length / 2 : 0;
      let degree = 0;
      for (let e = 0; e < edgeCount; e++) {
        if (graph.edges[e * 2] === nodeIdx || graph.edges[e * 2 + 1] === nodeIdx) degree++;
      }
      hoveredNode = node ? { ...node, degree, localX, localY } : null;
    } else {
      hoveredNode = null;
    }

    // Rebuild payload with new hoveredNodeId for connected-dim
    if (mounted && payload) {
      payload = buildGraphRendererPayload(scene ?? EMPTY_SCENE, {
        selectedIds: selectedIds ?? [],
        focusId,
        hoveredNodeId,
        nodeRadius: NODE_RADIUS,
      });
      if (renderer) {
        renderer.setStyle(payload.style);
        renderer.render();
      }
    }
  }

  function handlePointerLeave() {
    clearHoveredEdge();
    setHoveredNode(null);
    isPanning = false;
  }

  function legendClass(value) {
    return String(value ?? "dot").replace(/[^a-z0-9-]/gi, "-").toLowerCase();
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
    renderer.render();
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
      renderer.render();

      if (progress < 1) {
        mergeFrame = window.requestAnimationFrame(tick);
      } else {
        finishMergeAnimation();
      }
    };

    renderer.setPositions(firstFrame);
    renderer.setStyle(interpolateMergeStyle(payload, pair, 0));
    renderer.render();
    mergeFrame = window.requestAnimationFrame(tick);
  }

  $effect(() => {
    scene;
    selectedIds;
    focusId;
    updateGraph();
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

    return () => {
      mounted = false;
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleResize);
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
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
      <strong>{hoveredEdge.edge.relation ?? hoveredEdge.edge.label ?? "edge"}</strong>
      <span>{hoveredEdge.sourceLabel} -> {hoveredEdge.targetLabel}</span>
    </div>
  {/if}

  {#if !hasNodes}
    <p class="canvas-empty">No nodes to render. Adjust the filters or load a graph.</p>
  {/if}

  {#if hasLegend}
    <aside class="graph-legend" aria-label="Graph legend">
      {#each legend as item, index (`${item.label ?? "legend"}-${index}`)}
        <span class="legend-item">
          {#if item.shape}
            <span class={`legend-shape shape-${legendClass(item.shape)}`} aria-hidden="true"></span>
          {:else if item.dash}
            <span class={`legend-line dash-${legendClass(item.dash)}`} aria-hidden="true"></span>
          {:else}
            <span class="legend-shape shape-dot" aria-hidden="true"></span>
          {/if}
          <span class="legend-label">{item.label}</span>
        </span>
      {/each}
    </aside>
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

  .graph-legend {
    position: absolute;
    left: 0.75rem;
    bottom: 0.75rem;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.45rem 0.65rem;
    max-width: min(38rem, calc(100% - 1.5rem));
    padding: 0.55rem 0.65rem;
    border: 1px solid var(--st-semantic-border-muted, #e2e8f0);
    border-radius: 6px;
    background: color-mix(in srgb, var(--st-semantic-surface-default, #fff) 92%, transparent);
    box-shadow: 0 8px 18px rgb(15 23 42 / 0.08);
    color: var(--st-semantic-text-muted, #475569);
    font-size: 0.75rem;
    line-height: 1.2;
    pointer-events: none;
  }

  .legend-item {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    min-width: 0;
  }

  .legend-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .legend-shape {
    width: 0.65rem;
    height: 0.65rem;
    flex: 0 0 auto;
    border: 1.5px solid var(--st-semantic-action-primary, #2563eb);
    background: color-mix(in srgb, var(--st-semantic-action-primary, #2563eb) 18%, transparent);
  }

  .shape-dot,
  .shape-circle {
    border-radius: 999px;
  }

  .shape-square,
  .shape-box {
    border-radius: 2px;
  }

  .shape-roundedbox {
    border-radius: 4px;
  }

  .shape-diamond {
    transform: rotate(45deg);
  }

  .shape-hexagon {
    clip-path: polygon(25% 4%, 75% 4%, 100% 50%, 75% 96%, 25% 96%, 0 50%);
  }

  .shape-star {
    clip-path: polygon(
      50% 0,
      61% 35%,
      98% 35%,
      68% 57%,
      79% 91%,
      50% 70%,
      21% 91%,
      32% 57%,
      2% 35%,
      39% 35%
    );
  }

  .shape-triangle {
    width: 0;
    height: 0;
    border-left: 0.38rem solid transparent;
    border-right: 0.38rem solid transparent;
    border-bottom: 0.68rem solid var(--st-semantic-action-primary, #2563eb);
    background: transparent;
  }

  .legend-line {
    width: 1.25rem;
    height: 0;
    flex: 0 0 auto;
    border-top: 2px solid var(--st-semantic-text-muted, #64748b);
  }

  .dash-dashed {
    border-top-style: dashed;
  }

  .dash-dotted {
    border-top-style: dotted;
  }

  .dash-long-dash {
    border-top-style: dashed;
    width: 1.55rem;
  }
</style>
