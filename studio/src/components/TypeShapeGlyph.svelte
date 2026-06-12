<script>
  /**
   * Shape swatch for a node TYPE, shown left of each type row (like the
   * community colour dot). RELIABILITY: the glyph is derived from the exact
   * same pipeline the canvas render uses —
   *   type -> shapeForType (graphAdapter TYPE_SHAPE, what buildScene puts on
   *   every scene node) -> shapeSvgPath (@sentropic/graph shape-geometry, the
   *   same vertex math drawNodeShapePath strokes on the canvas)
   * — never a hand-drawn approximation (the old on-canvas legend's triangle
   * drifted from the renderer; this cannot).
   *
   * Box-category types (Work / ChapterOrStory) render hollow with a border,
   * matching the canvas box glyph (translucent fill + node-coloured border);
   * every other shape renders solid, matching the canvas fill.
   */
  import { isBoxShape } from "../lib/graphRendererPayload.js";
  import { shapeSvgPath } from "@sentropic/graph";
  import { shapeForType } from "../lib/graphAdapter.js";

  let { type, size = 12 } = $props();

  const RADIUS_RATIO = 0.46; // glyph radius inside the square viewBox

  const shape = $derived(shapeForType({ type }));
  const path = $derived(shapeSvgPath(shape, size * RADIUS_RATIO));
  const hollow = $derived(isBoxShape(shape));
</script>

<svg
  class="type-shape"
  width={size}
  height={size}
  viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}
  aria-hidden="true"
>
  <path
    d={path}
    class:hollow
  />
</svg>

<style>
  .type-shape {
    flex-shrink: 0;
    display: block;
  }
  .type-shape path {
    fill: var(--st-semantic-text-secondary, #475569);
    stroke: none;
  }
  .type-shape path.hollow {
    fill: color-mix(in srgb, var(--st-semantic-text-secondary, #475569) 12%, transparent);
    stroke: var(--st-semantic-text-secondary, #475569);
    stroke-width: 1.4;
  }
</style>
