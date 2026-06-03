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
  } = $props();

  // Measure the container so the sim fills the available center column.
  let host = $state(null);
  let width = $state(720);
  let height = $state(560);

  $effect(() => {
    if (!host) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const box = entry.contentRect;
        width = Math.max(320, Math.floor(box.width));
        height = Math.max(320, Math.floor(box.height));
      }
    });
    ro.observe(host);
    return () => ro.disconnect();
  });
</script>

<div class="canvas" bind:this={host}>
  {#if scene.nodes.length === 0}
    <p class="canvas-empty">No nodes to render. Adjust the filters or load a graph.</p>
  {:else}
    <ForceGraph
      nodes={scene.nodes}
      edges={scene.edges}
      label="Ontology knowledge graph"
      {width}
      {height}
      {selectedIds}
      {focusId}
      {legend}
      showLabels={scene.nodes.length <= 80}
      {onSelect}
      {onOpenEntity}
      {onEdgeHover}
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
