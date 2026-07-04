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
/**
 * Maximum box WIDTH as a multiple of the box height (#199 pixel-fit). A label
 * too long to hug within this ceiling is PIXEL-FITTED to the available text
 * width with an ellipsis, so the box never balloons into an over-wide text card.
 * Scales with pixelRatio × zoom exactly like the height, so the cap reads the
 * same at any zoom.
 */
export const BOX_MAX_WIDTH_RATIO = 10;
/** Single-character ellipsis appended when a box label is pixel-clipped to fit. */
export const BOX_ELLIPSIS = "…";

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
 * PIXEL-FIT a label so its DRAWN width never exceeds `maxTextWidth`, appending a
 * single ellipsis when it has to clip (#199, lifted VERBATIM from renderer.ts so
 * Canvas2D, WebGL, and the box-text atlas all clip identically). Unlike a fixed
 * character-count cap, this is glyph-width aware (a run of wide letters clips
 * sooner than a run of "i"s), so the box that hugs the returned text is
 * guaranteed to stay within the max.
 *
 * Binary search over the keep-length keeps it O(log n) measureText calls per
 * over-long label. When even the ellipsis alone does not fit (an absurdly tiny
 * box) we still return the ellipsis so the caller draws SOMETHING rather than
 * overflowing. The full text is unchanged on the node payload, so hover tooltips
 * / detail panels keep the verbatim name.
 */
export function fitLabelToWidth(
  label: string,
  maxTextWidth: number,
  font: string,
  measureLabelWidth: (text: string, font: string) => number,
): string {
  if (!label) return label;
  if (maxTextWidth <= 0) return label;
  if (measureLabelWidth(label, font) <= maxTextWidth) return label;

  // Search the largest prefix length whose `prefix + …` still fits.
  let low = 0;
  let high = label.length;
  let best = "";
  while (low <= high) {
    const mid = (low + high) >> 1;
    const candidate = label.slice(0, mid).replace(/\s+$/u, "") + BOX_ELLIPSIS;
    if (measureLabelWidth(candidate, font) <= maxTextWidth) {
      best = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  // Even a lone ellipsis overflowed the (degenerate) box — draw it anyway.
  return best || BOX_ELLIPSIS;
}

/**
 * Legacy `shape:box` glyph dimensions (lifted verbatim from renderer.ts).
 * Box height is a fixed legacy base scaled by pixelRatio × zoom — degree
 * INDEPENDENT; the small font fits that height minus a per-side margin; the box
 * grows only in WIDTH to hug the measured label plus margins. A non-labelled
 * (low-degree) box collapses to a small square of BOX_EMPTY_RATIO × height.
 *
 * WIDTH IS CAPPED at BOX_MAX_WIDTH_RATIO × height (#199): a label too long to hug
 * within that ceiling is PIXEL-FITTED (see {@link fitLabelToWidth}) to the
 * available text width with an ellipsis. The returned `label` is the exact
 * (possibly clipped) text the box was sized to — the draw path (Canvas2D
 * `fillText` / the WebGL text atlas) renders THAT string, so the box always hugs
 * precisely what it shows.
 *
 * `measureLabelWidth` is the SAME measureText service Canvas2D uses, so GL box
 * width, the GL text atlas, and Canvas2D box width are identical to the pixel.
 */
export function boxDimensions(
  height: number,
  label: string,
  measureLabelWidth: (text: string, font: string) => number,
): { w: number; h: number; fontPx: number; corner: number; label: string } {
  const margin = height * BOX_MARGIN_RATIO;
  const corner = height * BOX_CORNER_RATIO;
  const fontPx = height * BOX_FONT_RATIO;

  if (!label) {
    const side = height * BOX_EMPTY_RATIO;
    return { w: side, h: side, fontPx, corner, label };
  }

  const font = `${fontPx}px sans-serif`;
  // Text must fit inside the max box width minus a margin per side.
  const maxTextWidth = Math.max(0, height * BOX_MAX_WIDTH_RATIO - 2 * margin);
  const fitted = fitLabelToWidth(label, maxTextWidth, font, measureLabelWidth);
  const textW = measureLabelWidth(fitted, font);
  return { w: textW + 2 * margin, h: height, fontPx, corner, label: fitted };
}

/** Theme-dark box label text as an rgb tuple (slate-900, #0f172a). */
export const BOX_TEXT_RGB: readonly [number, number, number] = [15, 23, 42];

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

// ---------------------------------------------------------------------------
// EDGE geometry (B1 Phase 2). Lifted VERBATIM from the `drawFallback2D` edge
// pass (renderer.ts:844-921) into pure functions so the Canvas2D fallback, the
// WebGL2 instanced-edge path, and the hit-test all consume ONE computation —
// the same anti-divergence decision the node geometry made. The WebGL path
// tessellates the curve here so the render-curve == hit-curve (R10): this is
// the ONLY parity helper; `edge-geometry.ts` is NOT on this path (it uses a
// different control-point sign/factor and a different default curvature).
// ---------------------------------------------------------------------------

/** Edge curvature lateral factor (renderer.ts:492). Control offset = curvature·this. */
export const EDGE_CURVE_FACTOR = 0.5;

/**
 * Arrowhead length in world units per unit of edge width (renderer.ts:543).
 * Device-space length = ARROW_LENGTH · width · pixelRatio · zoom (world-space,
 * scales with zoom like every glyph).
 */
export const ARROW_LENGTH = 2.5;
/** Arrow triangle base width as a fraction of its length (renderer.ts:545). */
export const ARROW_WIDTH_RATIO = 0.9;

/** Dash pattern (on/off CSS px, scaled by pixelRatio) per dash code (renderer.ts:480-489). */
export function dashPattern(dash: number, pixelRatio: number): [number, number] | null {
  if (dash === 1) return [6 * pixelRatio, 4 * pixelRatio];
  if (dash === 2) return [1.5 * pixelRatio, 4 * pixelRatio];
  if (dash === 3) return [10 * pixelRatio, 6 * pixelRatio];
  return null; // solid
}

/** Drawn stroke width in device px (E1, renderer.ts:903): max(1, width·pixelRatio). */
export function edgeStrokeWidth(width: number, pixelRatio: number): number {
  return Math.max(1, width * pixelRatio);
}

/**
 * Resolved per-edge geometry in DEVICE pixels, computed once with the EXACT
 * `drawFallback2D` math: the (curved) control point, the OUTGOING/INCOMING unit
 * tangents (the chord for straight edges, the control→endpoint directions for
 * arcs — E7), whether the edge clips to the node borders (E5/E13), and the
 * clipped start/end points the stroke and arrowhead use.
 */
export interface EdgeGeometry {
  /** Edge is degenerate (endpoints coincide) — caller skips it (renderer.ts:857). */
  degenerate: boolean;
  /** Endpoints clip to the node borders; false ⇒ raw segment + NO arrow (E13). */
  clipped: boolean;
  /** Whether the edge is curved (curvature !== 0, or a curved flow-port route). */
  curved: boolean;
  /**
   * Whether the curve is a CUBIC Bézier (two control points — the flow-port
   * S route) rather than the historical convex quadratic. When false,
   * `control2X/Y` are 0 and the single-control quadratic applies. Additive:
   * `edgeGeometry` always returns false (byte-identical historical output);
   * only `flowPortEdgeGeometry` produces cubic geometry.
   */
  cubic: boolean;
  /** First control point (device px): quadratic control / cubic c1. */
  controlX: number;
  controlY: number;
  /** Second cubic control point (device px); only meaningful when `cubic`. */
  control2X: number;
  control2Y: number;
  /** Outgoing unit tangent at the source (curve start tangent / chord). */
  outSx: number;
  outSy: number;
  /** Incoming unit tangent at the target (curve end tangent / chord). */
  inTx: number;
  inTy: number;
  /** Clipped stroke start (source border) — raw source when not clipped. */
  startX: number;
  startY: number;
  /** Clipped stroke end (target border) — raw target when not clipped. */
  endX: number;
  endY: number;
}

/**
 * Compute one edge's drawn geometry from its endpoint SCREEN points + curvature.
 * `offsetForDir(end, dirX, dirY)` returns the border offset of the given
 * endpoint (`"source"`/`"target"`) along a unit direction — wire it to
 * `borderOffset` so the box-rect / circular-clip choice is single-sourced.
 *
 * This is the verbatim renderer.ts:854-898 math: control point, tangents,
 * clip test (`dist > offsetSource + offsetTarget + 1e-3`), clipped endpoints.
 */
export function edgeGeometry(
  source: { x: number; y: number },
  target: { x: number; y: number },
  curvature: number,
  offsetForDir: (end: "source" | "target", dirX: number, dirY: number) => number,
): EdgeGeometry {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const distance = Math.hypot(dx, dy);
  const degenerate = distance < 1e-6;
  const curved = curvature !== 0;

  let controlX = 0;
  let controlY = 0;
  if (curved && !degenerate) {
    const midX = (source.x + target.x) / 2;
    const midY = (source.y + target.y) / 2;
    // control = mid + (-dy/d, dx/d)·d·curvature·EDGE_CURVE_FACTOR (renderer.ts:865)
    controlX = midX + (-dy / distance) * distance * curvature * EDGE_CURVE_FACTOR;
    controlY = midY + (dx / distance) * distance * curvature * EDGE_CURVE_FACTOR;
  }

  let outSx = degenerate ? 0 : dx / distance;
  let outSy = degenerate ? 0 : dy / distance;
  let inTx = outSx;
  let inTy = outSy;
  if (curved && !degenerate) {
    const sLen = Math.hypot(controlX - source.x, controlY - source.y);
    const tLen = Math.hypot(target.x - controlX, target.y - controlY);
    if (sLen > 1e-6) {
      outSx = (controlX - source.x) / sLen;
      outSy = (controlY - source.y) / sLen;
    }
    if (tLen > 1e-6) {
      inTx = (target.x - controlX) / tLen;
      inTy = (target.y - controlY) / tLen;
    }
  }

  const offsetSource = offsetForDir("source", outSx, outSy);
  const offsetTarget = offsetForDir("target", -inTx, -inTy);
  const clipped = !degenerate && distance > offsetSource + offsetTarget + 1e-3;

  const startX = clipped ? source.x + outSx * offsetSource : source.x;
  const startY = clipped ? source.y + outSy * offsetSource : source.y;
  const endX = clipped ? target.x - inTx * offsetTarget : target.x;
  const endY = clipped ? target.y - inTy * offsetTarget : target.y;

  return {
    degenerate,
    clipped,
    curved,
    cubic: false,
    controlX,
    controlY,
    control2X: 0,
    control2Y: 0,
    outSx,
    outSy,
    inTx,
    inTy,
    startX,
    startY,
    endX,
    endY,
  };
}

// ---------------------------------------------------------------------------
// FLOW-PORT edge routing (git-flow display lot). Directional PORTS: the edge
// EXITS the source node at its RIGHT border (x + radius / box half-width) and
// ENTERS the target node at its LEFT border, routed as a horizontal-dominant
// smooth S (GitKraken / gitgraph.js style): leave rightward, bend vertically,
// arrive HORIZONTALLY into the left port — never node-centre to node-centre.
// Pure device-px math, single-sourced for the Canvas2D fallback, the WebGL2
// instanced-edge path, and any hit-test (same anti-divergence rule as above).
// ---------------------------------------------------------------------------

/** Per-edge route-style codes carried by GraphStyleBuffers.edgeRouteStyles. */
export const ROUTE_STYLE_DEFAULT = 0;
export const ROUTE_STYLE_FLOW_PORT = 1;
/** Flow-port with the ENDPOINTS SWAPPED before drawing (new→old data edges). */
export const ROUTE_STYLE_FLOW_PORT_REVERSE = 2;
/**
 * ArrowLESS flow-port variants (git-flow grammar): a FORK descent (branch-off)
 * is a BARE S — only MERGE connectors and lane segments carry an arrowhead
 * (GitHub network-graph / nvie git-flow reference imagery). Same routing as
 * codes 1/2; the ONLY difference is no arrowhead is emitted at the target port.
 */
export const ROUTE_STYLE_FLOW_PORT_NO_ARROW = 3;
export const ROUTE_STYLE_FLOW_PORT_REVERSE_NO_ARROW = 4;

/** True when a route code draws flow-port geometry with the endpoints swapped. */
export function routeIsReversed(route: number): boolean {
  return route === ROUTE_STYLE_FLOW_PORT_REVERSE || route === ROUTE_STYLE_FLOW_PORT_REVERSE_NO_ARROW;
}

/** True when a route code suppresses the arrowhead (bare fork descent). */
export function routeIsArrowless(route: number): boolean {
  return route === ROUTE_STYLE_FLOW_PORT_NO_ARROW || route === ROUTE_STYLE_FLOW_PORT_REVERSE_NO_ARROW;
}

/**
 * Minimum horizontal STUB (world/CSS px, × pixelRatio × zoom at the call site)
 * an S route keeps out of each port, so even a near-vertical or backward edge
 * visibly LEAVES rightward and ARRIVES horizontally into the left port.
 */
export const FLOW_PORT_MIN_STUB = 12;

/**
 * Compute a FLOW-PORT edge's drawn geometry from the endpoint node CENTRES
 * (device px) and their horizontal border offsets:
 *
 *   • source port P0 = (source.x + sourcePortOffset, source.y) — RIGHT border;
 *   • target port P1 = (target.x − targetPortOffset, target.y) — LEFT border;
 *   • same row (|Δy| < 0.5 px) and forward (Δx > 0) ⇒ a STRAIGHT horizontal
 *     lane segment;
 *   • otherwise a CUBIC Bézier S with HORIZONTAL end tangents: c1 = P0 + (k, 0),
 *     c2 = P1 − (k, 0), k = max(minStub, Δx/2 when forward, minStub backward) —
 *     the classic flowchart/gitgraph S (a backward edge loops out and back but
 *     still exits the right port and enters the left port horizontally).
 *
 * The end tangents are exactly (1, 0) at both ports, so an arrowhead (drawn by
 * the caller with the incoming tangent, ONLY for arrow-carrying route codes —
 * see {@link routeIsArrowless}) sits ON the target's left border pointing RIGHT
 * — time flows left→right. `clipped` is true whenever the edge is
 * non-degenerate: ports are on the borders by construction (there is no
 * centre-overlap fallback on this style).
 *
 * Pass `sourcePortOffset` = borderOffset(source, +1, 0) and `targetPortOffset`
 * = borderOffset(target, −1, 0) so circle radii and box half-widths stay
 * single-sourced with the node pass.
 */
export function flowPortEdgeGeometry(
  source: { x: number; y: number },
  target: { x: number; y: number },
  sourcePortOffset: number,
  targetPortOffset: number,
  minStub: number = FLOW_PORT_MIN_STUB,
): EdgeGeometry {
  const startX = source.x + Math.max(0, sourcePortOffset);
  const startY = source.y;
  const endX = target.x - Math.max(0, targetPortOffset);
  const endY = target.y;

  const dx = endX - startX;
  const dy = endY - startY;
  const degenerate = Math.hypot(dx, dy) < 1e-6;

  // Same row + forward: a straight horizontal lane segment (port to port).
  const straight = !degenerate && Math.abs(dy) < 0.5 && dx > 0;

  let cubic = false;
  let controlX = 0;
  let controlY = 0;
  let control2X = 0;
  let control2Y = 0;
  if (!degenerate && !straight) {
    const stub = Math.max(0, minStub);
    const k = dx > 0 ? Math.max(stub, dx / 2) : stub;
    controlX = startX + k;
    controlY = startY;
    control2X = endX - k;
    control2Y = endY;
    cubic = true;
  }

  return {
    degenerate,
    clipped: !degenerate,
    curved: cubic,
    cubic,
    controlX,
    controlY,
    control2X,
    control2Y,
    // Horizontal end tangents BY CONSTRUCTION: out of the right port…
    outSx: 1,
    outSy: 0,
    // …and horizontally INTO the left port (the arrow points right).
    inTx: 1,
    inTy: 0,
    startX,
    startY,
    endX,
    endY,
  };
}

/**
 * Tessellate the drawn edge into a polyline of device-pixel points. A straight
 * edge is the single [start, end] segment; a curved edge samples the quadratic
 * Bézier (start, control, end) at `segments+1` points. The polyline is what the
 * WebGL capsule pipeline expands, and (sampled at the same steps) what the
 * hit-test walks — so render-curve == hit-curve. The endpoints are the CLIPPED
 * endpoints from `edgeGeometry`, so the curve starts/ends on the node borders.
 */
export function tessellateEdge(geom: EdgeGeometry, segments = 16): Array<[number, number]> {
  if (!geom.curved) {
    return [
      [geom.startX, geom.startY],
      [geom.endX, geom.endY],
    ];
  }
  const steps = Math.max(2, segments);
  const points: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const mt = 1 - t;
    if (geom.cubic) {
      // CUBIC Bézier (flow-port S route) with both control points.
      // B(t) = mt³·P0 + 3·mt²·t·C1 + 3·mt·t²·C2 + t³·P1.
      const a = mt * mt * mt;
      const b = 3 * mt * mt * t;
      const c = 3 * mt * t * t;
      const d = t * t * t;
      points.push([
        a * geom.startX + b * geom.controlX + c * geom.control2X + d * geom.endX,
        a * geom.startY + b * geom.controlY + c * geom.control2Y + d * geom.endY,
      ]);
    } else {
      // Quadratic Bézier with the CLIPPED endpoints and the shared control point.
      const x = mt * mt * geom.startX + 2 * mt * t * geom.controlX + t * t * geom.endX;
      const y = mt * mt * geom.startY + 2 * mt * t * geom.controlY + t * t * geom.endY;
      points.push([x, y]);
    }
  }
  return points;
}
