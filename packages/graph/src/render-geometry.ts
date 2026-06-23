/**
 * SHARED, backend-agnostic render geometry (B1 migration plan §1.0).
 *
 * The Canvas2D fallback (`drawFallback2D`) historically computed, per frame, the
 * exact node geometry the WebGL backend must reproduce: per-node drawn radius
 * (`nodeSize·pixelRatio·zoom`, with `max(1,…)` clamp) and the legacy `shape:box`
 * dimensions (degree-independent base height, label-hugging width, clamped
 * corner). This module lifts that math VERBATIM into pure functions with no GL
 * and no 2D dependency, so Canvas2D, WebGL, and the hit-test all consume ONE
 * computation. That is the plan's anti-divergence decision: it makes the
 * radius-vs-diameter mismatch (N1), the box-metric duplication (R2/L11), and
 * hit↔render drift (R6) impossible, because there is a single source.
 *
 * Phase 1 scope: node SHAPE geometry only (radii, box extents, shape selection,
 * unit polygon geometry). Edge geometry / the box-text draw list land in later
 * phases.
 */

import { BOX_SHAPE_CODE, shapePolygonPoints, SQUARE_INSET_RATIO } from "./shape-geometry";

// Re-export the single-sourced box shape code for callers that import box
// metrics from this module.
export { BOX_SHAPE_CODE };

// ---------------------------------------------------------------------------
// Box-metric constants (lifted from renderer.ts:472-494). EXPORTED so other
// modules — notably the studio recon twin-spacing — import them instead of
// re-hardcoding the literals (kills R2/L11 duplication).
// ---------------------------------------------------------------------------

/** Box height in CSS px (× pixelRatio × zoom), legacy 22 − ~20%. */
export const BOX_BASE_HEIGHT_PX = 18;
/** Legacy margin per side (5 of a 22-unit box). */
export const BOX_MARGIN_RATIO = 5 / 22;
/** Legacy font size (12 of a 22-unit box) — text much smaller than the box. */
export const BOX_FONT_RATIO = 12 / 22;
/** Corner radius as a fraction of box height. */
export const BOX_CORNER_RATIO = 1 / 4;
/** Non-labelled (low-degree) box collapse, as a fraction of the box height. */
export const BOX_EMPTY_RATIO = 10 / 22;

/** Legacy box / hollow-glyph fill: translucent white (rgba 255,255,255,0.5). */
export const BOX_FILL: readonly [number, number, number, number] = [255, 255, 255, 0.5 * 255];
/** Theme-dark label text (slate-900). */
export const BOX_TEXT_COLOR = "#0f172a";

/** Shape-variant outline widths in CSS px (× pixelRatio). */
export const BORDER_WIDTH_NORMAL = 1.5;
export const BORDER_WIDTH_BOLD = 3;

/** Hollow glyph interior CSS string (alpha-independent translucent white). */
export const HOLLOW_FILL_STYLE = `rgba(${BOX_FILL[0]}, ${BOX_FILL[1]}, ${BOX_FILL[2]}, ${BOX_FILL[3] / 255})`;

// ---------------------------------------------------------------------------
// Node SHAPE geometry.
// ---------------------------------------------------------------------------

/**
 * Drawn glyph RADIUS in device pixels (renderer.ts:723):
 *   radius = max(1, nodeSize · pixelRatio · zoom)
 *
 * This is the single source for the drawn radius. The WebGL instanced-disc path
 * scales its unit geometry by THIS value (radius-as-radius), so the GL circle
 * matches the Canvas2D circle exactly — NOT the historical half-sprite (the
 * `gl_PointSize` diameter trap).
 */
export function drawnRadius(nodeSize: number, pixelRatio: number, zoom: number): number {
  return Math.max(1, nodeSize * pixelRatio * zoom);
}

/**
 * Legacy `shape:box` glyph dimensions (lifted verbatim from renderer.ts:586-602).
 * Box height is a fixed legacy base scaled by pixelRatio × zoom — degree
 * INDEPENDENT; the small font fits that height minus a per-side margin; the box
 * grows only in WIDTH to hug the measured label plus margins. A non-labelled
 * (low-degree) box collapses to a small square of BOX_EMPTY_RATIO × height.
 *
 * `measureLabelWidth` is the SAME measureText service Canvas2D uses, so GL box
 * width and Canvas2D box width are identical to the pixel.
 */
export function boxDimensions(
  height: number,
  label: string,
  measureLabelWidth: (text: string, font: string) => number,
): { w: number; h: number; fontPx: number; corner: number } {
  const margin = height * BOX_MARGIN_RATIO;
  const corner = height * BOX_CORNER_RATIO;
  const fontPx = height * BOX_FONT_RATIO;

  if (!label) {
    const side = height * BOX_EMPTY_RATIO;
    return { w: side, h: side, fontPx, corner };
  }

  const textW = measureLabelWidth(label, `${fontPx}px sans-serif`);
  return { w: textW + 2 * margin, h: height, fontPx, corner };
}

/**
 * The rounded-box corner CLAMP (N7c, renderer.ts:530-532). Both backends MUST
 * apply this so empty boxes (corner == half-side) and narrow labels
 * (corner == w/2) round identically.
 */
export function clampCorner(corner: number, halfW: number, halfH: number): number {
  return Math.max(0, Math.min(corner, halfW, halfH));
}

/**
 * Per-node drawn geometry in DEVICE pixels, computed once per frame. Lifted
 * VERBATIM from the `drawFallback2D` pre-pass (renderer.ts:716-733) so the
 * edge pass (clipping), the node pass (drawing), and the WebGL instance build
 * all read the SAME extents.
 *
 * - `radii[i]`         drawn radius of every non-box glyph (circle-ish).
 * - `boxHalfWidths[i]` / `boxHalfHeights[i]`  half-extents of the box
 *   rectangle (only meaningful when `nodeShapes[i]` is the box shape).
 */
export interface NodeGeometry {
  radii: Float32Array;
  boxHalfWidths: Float32Array;
  boxHalfHeights: Float32Array;
}

export interface NodeGeometryInput {
  nodeCount: number;
  nodeSizes?: ArrayLike<number>;
  nodeShapes?: ArrayLike<number>;
  nodeLabels?: ReadonlyArray<string | undefined>;
}

/**
 * Compute the shared node geometry for a frame. `measureLabelWidth` measures box
 * labels at the rendered font (the same per-frame measureText cache the Canvas2D
 * path uses); pass a no-op returning 0 if no boxes are present.
 */
export function nodeGeometry(
  input: NodeGeometryInput,
  pixelRatio: number,
  zoom: number,
  measureLabelWidth: (text: string, font: string) => number,
): NodeGeometry {
  const { nodeCount } = input;
  const geometry: NodeGeometry = {
    radii: new Float32Array(nodeCount),
    boxHalfWidths: new Float32Array(nodeCount),
    boxHalfHeights: new Float32Array(nodeCount),
  };

  for (let nodeIndex = 0; nodeIndex < nodeCount; nodeIndex += 1) {
    const size = input.nodeSizes?.[nodeIndex] ?? 4;
    geometry.radii[nodeIndex] = drawnRadius(size, pixelRatio, zoom);
    if ((input.nodeShapes?.[nodeIndex] ?? 0) !== BOX_SHAPE_CODE) continue;
    const label = input.nodeLabels?.[nodeIndex] ?? "";
    const boxHeight = BOX_BASE_HEIGHT_PX * pixelRatio * zoom;
    const dims = boxDimensions(boxHeight, label, measureLabelWidth);
    geometry.boxHalfWidths[nodeIndex] = dims.w / 2;
    geometry.boxHalfHeights[nodeIndex] = dims.h / 2;
  }

  return geometry;
}

/**
 * Distance from a node centre to its drawn border along the outgoing unit
 * direction (dirX, dirY) — the drawn radius for circle-ish glyphs, the exact
 * rectangle-border distance for box glyphs (renderer.ts:738-749). Used by edge
 * clipping (later phases) and exported now so the single source is in place.
 */
export function borderOffset(
  geometry: NodeGeometry,
  nodeShapes: ArrayLike<number> | undefined,
  nodeIndex: number,
  dirX: number,
  dirY: number,
): number {
  if ((nodeShapes?.[nodeIndex] ?? 0) === BOX_SHAPE_CODE) {
    const halfW = geometry.boxHalfWidths[nodeIndex] ?? 0;
    const halfH = geometry.boxHalfHeights[nodeIndex] ?? 0;
    const absX = Math.abs(dirX);
    const absY = Math.abs(dirY);
    const alongX = absX > 1e-6 ? halfW / absX : Number.POSITIVE_INFINITY;
    const alongY = absY > 1e-6 ? halfH / absY : Number.POSITIVE_INFINITY;
    return Math.min(alongX, alongY);
  }
  return geometry.radii[nodeIndex] ?? 0;
}

// ---------------------------------------------------------------------------
// Unit shape geometry (triangle-fan vertices) — the GPU's per-instance unit
// outline, scaled by `a_radius` in the vertex shader. Built from the SAME
// `shapePolygonPoints` the Canvas2D path traces, so the GL polygon outline can
// never drift from Canvas2D.
// ---------------------------------------------------------------------------

/** A unit shape's outline vertices (radius 1, centred on origin). */
export interface UnitShape {
  /** Outline vertices in CCW order, [x0,y0,x1,y1,…]. */
  outline: Float32Array;
  /** Triangle-fan vertices (origin + outline + first), [x,y,…] for TRIANGLE_FAN. */
  fan: Float32Array;
  /** Number of vertices in `fan` (vertex count, not float count). */
  fanVertexCount: number;
}

/** How many segments approximate the circle disc (a 64-gon reads as smooth). */
export const CIRCLE_SEGMENTS = 64;

/**
 * Unit OUTLINE points for a shape code, at radius 1. Polygon codes reuse
 * `shapePolygonPoints(code, 1)`; the circle (code 0) is a CIRCLE_SEGMENTS-gon;
 * the box (code 5) has no unit outline here (it is a label-sized rounded rect
 * handled separately in a later phase — see N7b).
 */
export function unitOutlinePoints(shape: number): Array<[number, number]> {
  const polygon = shapePolygonPoints(shape, 1);
  if (polygon) return polygon;

  if (shape === BOX_SHAPE_CODE) {
    // Box is NOT a unit-scaled outline; later phases draw the rounded rect.
    // Return the inset-square swatch outline (matches shapeSvgPath(5) — N7b)
    // so a swatch reuse stays consistent, never the runtime label box.
    const half = SQUARE_INSET_RATIO;
    return [
      [-half, -half],
      [half, -half],
      [half, half],
      [-half, half],
    ];
  }

  // Circle / dot (code 0) and any unknown shape: a regular polygon disc.
  const points: Array<[number, number]> = [];
  for (let i = 0; i < CIRCLE_SEGMENTS; i += 1) {
    const angle = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
    points.push([Math.cos(angle), Math.sin(angle)]);
  }
  return points;
}

/**
 * Build the unit triangle-fan geometry for a shape code. The fan is
 * `[0,0, p0, p1, …, pN, p0]` so a `TRIANGLE_FAN` draw fills the outline.
 */
export function unitShapeGeometry(shape: number): UnitShape {
  const points = unitOutlinePoints(shape);
  const outline = new Float32Array(points.length * 2);
  points.forEach(([x, y], i) => {
    outline[i * 2] = x;
    outline[i * 2 + 1] = y;
  });

  // Fan: centre, every outline point, then back to the first point to close.
  const fanVertexCount = points.length + 2;
  const fan = new Float32Array(fanVertexCount * 2);
  fan[0] = 0;
  fan[1] = 0;
  points.forEach(([x, y], i) => {
    fan[(i + 1) * 2] = x;
    fan[(i + 1) * 2 + 1] = y;
  });
  fan[(points.length + 1) * 2] = points[0]?.[0] ?? 0;
  fan[(points.length + 1) * 2 + 1] = points[0]?.[1] ?? 0;

  return { outline, fan, fanVertexCount };
}

// ---------------------------------------------------------------------------
// N1b — non-finite world-coordinate coercion at the geometry boundary.
// ---------------------------------------------------------------------------

/**
 * Coerce a non-finite world coordinate to a safe finite value at the geometry
 * boundary (B1 plan §1.2 / N1b / R13). A NaN/±Inf that reaches `gl_Position`
 * silently drops the vertex with no error — WORSE than Canvas2D, which draws
 * visibly-nothing. We replace non-finite coords with `fallback` (the
 * position-bounds centre, or 0) so the GL backend never silently NaN-out a
 * draw, and the caller surfaces a `nonFiniteCount` so it is never swallowed.
 */
export function coerceFiniteCoord(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Coerce a positions array's non-finite entries to `centerX`/`centerY`,
 * returning the coerced copy and the count of replaced coordinates. The count
 * is recorded on the renderer snapshot so non-finite input is surfaced, never
 * swallowed (N1b / R13). Returns the SAME array reference when nothing changed.
 */
export function coerceFinitePositions(
  positions: Float32Array,
  centerX: number,
  centerY: number,
): { positions: Float32Array; nonFiniteCount: number } {
  let nonFiniteCount = 0;
  let out: Float32Array | null = null;
  for (let i = 0; i < positions.length; i += 1) {
    if (!Number.isFinite(positions[i] ?? Number.NaN)) {
      if (!out) out = new Float32Array(positions);
      out[i] = i % 2 === 0 ? coerceFiniteCoord(centerX, 0) : coerceFiniteCoord(centerY, 0);
      nonFiniteCount += 1;
    }
  }
  return { positions: out ?? positions, nonFiniteCount };
}
