<script>
  /**
   * Shape swatch for a node TYPE, shown left of each type row (like the
   * community colour dot). RELIABILITY: the glyph is derived from the exact
   * same pipeline the canvas render uses —
   *   type -> shapeForType + variantForType (graphAdapter TYPE_SHAPE /
   *   TYPE_VARIANT, what buildScene puts on every scene node) ->
   *   shapeSvgPath (@sentropic/graph shape-geometry, the same vertex math
   *   drawNodeShapePath strokes on the canvas)
   * — never a hand-drawn approximation (the old on-canvas legend's triangle
   * drifted from the renderer; this cannot).
   *
   * Variant parity with the canvas:
   *   - fill "hollow"  -> outline-only swatch (translucent interior + border),
   *   - border "bold"  -> heavier outline,
   *   - box-category   -> always hollow (the canvas box glyph is a bordered
   *     rounded rect), plus its border-weight variant.
   */
  import { isBoxShape } from "../lib/graphRendererPayload.js";
  import { shapeSvgPath } from "@sentropic/graph";
  import { shapeForType, variantForType } from "../lib/graphAdapter.js";

  let { type, size = 12 } = $props();

  const RADIUS_RATIO = 0.46; // glyph radius inside the square viewBox

  const shape = $derived(shapeForType({ type }));
  const variant = $derived(variantForType({ type }));
  const path = $derived(shapeSvgPath(shape, size * RADIUS_RATIO));
  const hollow = $derived(isBoxShape(shape) || variant.fill === "hollow");
  const bold = $derived(variant.border === "bold");
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
    class:bold
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
  /* Bold border: heavier outline; on a solid fill the outline darkens (the
     canvas strokes a darkened node colour there). */
  .type-shape path.bold {
    stroke: var(--st-semantic-text-primary, #0f172a);
    stroke-width: 2.2;
  }
  .type-shape path.hollow.bold {
    stroke: var(--st-semantic-text-secondary, #475569);
  }
</style>
