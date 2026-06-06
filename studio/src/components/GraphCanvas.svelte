<script>
  /**
   * Center canvas. Wraps the PUBLISHED DS ForceGraph (autonomous force sim, no
   * d3). We pass the scene + selectedIds + focusId so the DS handles highlight
   * and the accent ring WITHOUT re-running the layout. onSelect / onOpenEntity
   * bubble the DS click / dblclick (+ keyboard) intents up to the App.
   *
   * Documented import path (package.json only exports "."): named export.
   */
  import { ForceGraph } from "@sentropic/design-system-svelte";

  // SVELTE-4/5/6: legend (shape->type, dash->relation), edge hover tooltip, and
  // zoom/pan all come from ForceGraph 0.10.4. node.shape is set in buildScene.
  let {
    scene,
    selectedIds = [],
    focusId = null,
    legend = [],
    onSelect,
    onOpenEntity,
    onEdgeHover,
    mergePair = null,
    onMergeComplete,
  } = $props();

  // PERF (quick-win A): the DS ForceGraph computes its layout in a `$derived`
  // that DEPENDS on `width`/`height`, so EVERY change to those props re-runs the
  // O(n^2) × ~300-tick `runSimulation` (≈213 M ops on the public pack → a 1-3 s
  // freeze). Previously a ResizeObserver pushed the live container size into
  // those props, so each pixel of a window/panel resize relaunched the whole
  // simulation.
  //
  // The simulation does NOT need the live size: the DS renders the SVG at
  // `width="100%" height="100%"` with a fit-to-content `viewBox` recomputed from
  // the settled node positions. width/height only seed the centre and the ideal
  // node distance `k = sqrt(width*height / n)`, i.e. the layout's absolute SCALE
  // — and the fit-to-content viewBox normalises that scale away on render. So
  // only the ASPECT RATIO matters, not the live pixel size.
  //
  // We therefore pass STABLE constants (a reasonable landscape ratio). The graph
  // is laid out once; resizing the window/panels just re-scales the SVG via
  // CSS/GPU (the browser refits the 100%×100% viewBox) WITHOUT touching the
  // simulation. No ResizeObserver, no per-pixel relayout.
  const SIM_WIDTH = 960;
  const SIM_HEIGHT = 600;
</script>

<div class="canvas">
  {#if scene.nodes.length === 0}
    <p class="canvas-empty">No nodes to render. Adjust the filters or load a graph.</p>
  {:else}
    <ForceGraph
      nodes={scene.nodes}
      edges={scene.edges}
      label="Ontology knowledge graph"
      width={SIM_WIDTH}
      height={SIM_HEIGHT}
      {selectedIds}
      {focusId}
      {legend}
      nodeRadius={3}
      repulsion={1.6}
      showLabels={scene.nodes.length <= 80}
      {onSelect}
      {onOpenEntity}
      {onEdgeHover}
      {mergePair}
      {onMergeComplete}
    />
  {/if}
</div>

<style>
  .canvas {
    position: relative;
    background: var(--st-semantic-surface-default, #fff);
    min-height: 0;
    height: 100%;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .canvas-empty {
    color: var(--st-semantic-text-muted, #64748b);
    font-style: italic;
  }
</style>
