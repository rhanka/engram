/**
 * WebGL2 INSTANCED BOX-GLYPH + LABEL-TEXT renderer (B1 migration plan §2.2/§2.3,
 * Phase 3 — the HARDEST phase: in-canvas text parity is the #1 B1 risk).
 *
 * Phase 3 scope: the legacy `shape:box` glyph (N7 labelled / N9 empty, N7c
 * corner clamp, #199 pixel-fit + ellipsis, L1 in-box label text). It draws the
 * box nodes the P1 shape renderer SKIPS (shape code 5). The path is gated behind
 * the SAME `instancedShapes` canary the P1 shapes + P2 edges use, and is
 * INTERNAL-CANARY-ONLY: the studio default stays `canvas2d`, so there is no
 * user-facing change. Canvas2D boxes + text remain the golden source of truth.
 *
 * Architecture:
 *
 *  - **Instanced rounded-rect via SDF (N7/N7c/N9).** ONE unit quad is instanced
 *    per box; the fragment shader evaluates a rounded-box signed-distance field
 *    with the `min(corner, halfW, halfH)` clamp so empty boxes (corner ==
 *    half-side) and narrow labels (corner == w/2) round identically to Canvas2D.
 *    The translucent-white fill (BOX_FILL, alpha-INDEPENDENT) sits under the
 *    node-coloured border (which carries the node alpha). Border weight is the
 *    same normal/bold split (BORDER_WIDTH_NORMAL/BOLD · pixelRatio). The box
 *    half-extents + corner come from `render-geometry.boxDimensions` — the SAME
 *    function Canvas2D uses — so the box can never drift from the 2D box.
 *
 *  - **Per-label CANVAS-RASTER text atlas (L1, #1 risk — the plan's decision).**
 *    For each DISTINCT `(font, fittedLabel)` this frame, the label is rasterized
 *    ONCE on an OFFSCREEN 2D canvas using the IDENTICAL calls `drawBoxNode` makes
 *    (`font="${fontPx}px sans-serif"`, `textAlign="center"`, `textBaseline=
 *    "middle"`, `fillStyle=#0f172a`) and uploaded as a texture; a quad centred on
 *    the box samples it. Because the text is rasterized by the SAME Chrome 2D
 *    engine that produced the box width (#199 measureText), text metrics AND AA
 *    are parity-BY-CONSTRUCTION — NOT a shader glyph (SDF/MSDF is deferred until
 *    a proven shaping contract + Unicode goldens). Rasterized at DEVICE
 *    resolution (fontPx includes PR·zoom) so it stays crisp at DPR 2/3 (X6).
 *    The box renders the #199-FITTED string (boxDimensions returns it), so the
 *    drawn text matches the box extents exactly — never an overflowing label.
 *
 *  - **Byte-parity interleave (R7).** The box rect, its border, AND its text all
 *    share the box node's `a_depth` (the node index), so a later box occludes an
 *    earlier box's rect AND text — the same interleaved occlusion Canvas2D gets
 *    by drawing rect→fill→stroke→fillText in one call per node.
 *
 * The vertex transform mirrors webgl-shapes / webgl-edges: box geometry is
 * computed in DEVICE px on the CPU (the same `screenPoint` Canvas2D uses), then
 * mapped to clip space with the viewport.
 */

import {
  BORDER_WIDTH_BOLD,
  BORDER_WIDTH_NORMAL,
  BOX_BASE_HEIGHT_PX,
  BOX_FILL,
  BOX_SHAPE_CODE,
  BOX_TEXT_RGB,
  boxDimensions,
  clampCorner,
} from "./render-geometry";
import type { GraphStyleBuffers } from "./types";

type GL2 = WebGL2RenderingContext;

const DEFAULT_NODE_COLOR = [77, 118, 255, 255] as const;

/**
 * Pluggable 2D-context factory for the text atlas's OFFSCREEN raster canvas.
 * Defaults to OffscreenCanvas / a detached `<canvas>`; the golden harness swaps
 * in a factory that PINS the deterministic font on the raster context (the same
 * pin it applies to the render canvas), so the atlas rasterizes with the SAME
 * family Canvas2D measured + drew with — otherwise the WebGL text would use a
 * different system font than the Canvas2D reference and the pixel diff would
 * fail purely on font choice, not on the renderer.
 */
export type AtlasCanvasFactory = (
  width: number,
  height: number,
) => { canvas: unknown; ctx: CanvasRenderingContext2D } | null;

function defaultAtlasCanvasFactory(width: number, height: number):
  | { canvas: unknown; ctx: CanvasRenderingContext2D }
  | null {
  const g = globalThis as {
    OffscreenCanvas?: new (w: number, h: number) => {
      width: number;
      height: number;
      getContext(t: "2d"): CanvasRenderingContext2D | null;
    };
    document?: { createElement(tag: "canvas"): HTMLCanvasElement };
  };
  try {
    if (typeof g.OffscreenCanvas === "function") {
      const canvas = new g.OffscreenCanvas(Math.max(1, width), Math.max(1, height));
      const ctx = canvas.getContext("2d");
      return ctx ? { canvas, ctx } : null;
    }
    if (g.document?.createElement) {
      const canvas = g.document.createElement("canvas");
      canvas.width = Math.max(1, width);
      canvas.height = Math.max(1, height);
      const ctx = canvas.getContext("2d");
      return ctx ? { canvas, ctx } : null;
    }
  } catch {
    return null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Rounded-box program. ONE unit quad per box instance, expanded to the box
// half-extents; the fragment shader is a rounded-box SDF (fill under border).
// ---------------------------------------------------------------------------

const BOX_VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec2 a_corner;      // unit quad corner in {-1,1}^2
layout(location = 1) in vec2 a_center;      // instance: box centre (device px)
layout(location = 2) in vec2 a_half;        // instance: (halfW, halfH) device px
layout(location = 3) in float a_corner_r;   // instance: clamped corner radius (device px)
layout(location = 4) in float a_border;     // instance: border half-width (device px)
layout(location = 5) in vec4 a_fill;        // instance: fill rgba (0..1)
layout(location = 6) in vec4 a_borderCol;   // instance: border rgba (0..1)
layout(location = 7) in float a_depth;      // instance: drawList index (interleave)

uniform vec2 u_viewport;
uniform float u_maxDepth;

out vec2 v_local;       // position within the box, device px, centre origin
out vec2 v_half;
out float v_corner_r;
out float v_border;
out vec4 v_fill;
out vec4 v_borderCol;

void main() {
  // Pad by the border half-width so a bold border is not clipped by the quad.
  vec2 ext = a_half + vec2(a_border);
  v_local = a_corner * ext;
  vec2 screen = a_center + v_local;
  v_half = a_half;
  v_corner_r = a_corner_r;
  v_border = a_border;
  v_fill = a_fill;
  v_borderCol = a_borderCol;
  vec2 clip = vec2(screen.x * 2.0 / u_viewport.x - 1.0, 1.0 - screen.y * 2.0 / u_viewport.y);
  float z = u_maxDepth > 0.0 ? (a_depth / u_maxDepth) : 0.0;
  gl_Position = vec4(clip, -z, 1.0);
}
`;

const BOX_FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 v_local;
in vec2 v_half;
in float v_corner_r;
in float v_border;
in vec4 v_fill;
in vec4 v_borderCol;
out vec4 outColor;

// Signed distance to a rounded box of half-extents b and corner radius r,
// evaluated at point p (box centred at origin). Negative inside.
float roundedBoxSDF(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + vec2(r);
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

void main() {
  float d = roundedBoxSDF(v_local, v_half, v_corner_r);
  float aa = max(fwidth(d), 1e-4);

  // Interior coverage: inside the rounded-box outline (d <= 0).
  float fillCov = 1.0 - smoothstep(-aa, aa, d);
  // Border ring: a band of half-width v_border centred on the outline (|d| ~ 0).
  // Canvas2D strokes a line of width 2·v_border centred on the path, so the
  // ring spans d in [-v_border, +v_border].
  float borderCov =
      (1.0 - smoothstep(v_border - aa, v_border + aa, abs(d)));

  // Composite: translucent fill first, border ON TOP (Canvas2D fills then
  // strokes). Premultiply-free over: out = border over fill.
  vec4 fill = vec4(v_fill.rgb, v_fill.a * fillCov);
  vec4 border = vec4(v_borderCol.rgb, v_borderCol.a * borderCov);
  // border over fill
  float oa = border.a + fill.a * (1.0 - border.a);
  vec3 orgb = oa > 0.0 ? (border.rgb * border.a + fill.rgb * fill.a * (1.0 - border.a)) / oa : vec3(0.0);
  if (oa <= 0.0) discard;
  // PREMULTIPLIED output (paired with blendFunc(ONE, ONE_MINUS_SRC_ALPHA)): orgb
  // is the straight composited colour, so emit orgb·oa. Keeps alpha<1 boxes from
  // compositing too transparent under premultipliedAlpha:true. (This GL box path
  // is off by default — the studio + golden use the Canvas2D hybrid overlay — but
  // it is kept premultiplied-consistent with the shape/edge passes.)
  outColor = vec4(orgb * oa, oa);
}
`;

// ---------------------------------------------------------------------------
// Text program. ONE quad per labelled box samples its sub-rect of the atlas
// texture. The atlas alpha modulates the (dark) text colour, scaled by the
// node alpha.
// ---------------------------------------------------------------------------

const TEXT_VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec2 a_corner;     // unit quad corner in {0,1}^2
layout(location = 1) in vec2 a_center;     // instance: box centre (device px)
layout(location = 2) in vec2 a_size;       // instance: quad (w,h) device px
layout(location = 3) in vec4 a_uv;         // instance: (u0,v0,u1,v1) atlas sub-rect
layout(location = 4) in vec4 a_color;      // instance: text rgba (0..1), a = node alpha
layout(location = 5) in float a_depth;     // instance: drawList index (interleave)

uniform vec2 u_viewport;
uniform float u_maxDepth;

out vec2 v_uv;
out vec4 v_color;

void main() {
  // a_corner in {0,1}; map to [-0.5,0.5]·size centred on the box.
  vec2 offset = (a_corner - vec2(0.5)) * a_size;
  vec2 screen = a_center + offset;
  v_uv = mix(a_uv.xy, a_uv.zw, a_corner);
  v_color = a_color;
  vec2 clip = vec2(screen.x * 2.0 / u_viewport.x - 1.0, 1.0 - screen.y * 2.0 / u_viewport.y);
  float z = u_maxDepth > 0.0 ? (a_depth / u_maxDepth) : 0.0;
  gl_Position = vec4(clip, -z, 1.0);
}
`;

const TEXT_FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
in vec4 v_color;
uniform sampler2D u_atlas;
out vec4 outColor;

void main() {
  // The atlas stores the rasterized text as straight RGBA (dark text over
  // transparent). Its ALPHA is the glyph coverage. We re-tint with the text
  // colour (#0f172a) so a single atlas can serve any colour, and scale by the
  // node alpha (v_color.a). Sampling the atlas reproduces the Chrome 2D text AA
  // by construction (the atlas WAS rasterized by Chrome's 2D engine).
  float cov = texture(u_atlas, v_uv).a;
  if (cov <= 0.0) discard;
  // PREMULTIPLIED output (paired with blendFunc(ONE, ONE_MINUS_SRC_ALPHA)): the
  // effective alpha is the glyph coverage times the node alpha; emit rgb·a.
  float a = cov * v_color.a;
  outColor = vec4(v_color.rgb * a, a);
}
`;

/** Floats per box instance. center(2)+half(2)+corner(1)+border(1)+fill(4)+borderCol(4)+depth(1) = 15 */
export const BOX_FLOATS_PER_INSTANCE = 15;
/** Floats per text instance. center(2)+size(2)+uv(4)+color(4)+depth(1) = 13 */
export const TEXT_FLOATS_PER_INSTANCE = 13;

export interface WebGLBoxFrame {
  positions: Float32Array;
  nodeCount: number;
  style?: GraphStyleBuffers;
  camera: { x: number; y: number; zoom: number };
  pixelRatio: number;
  /** Box base height in CSS px (git-flow label-scale knob); default legacy 18. */
  boxBaseHeightPx?: number;
  /** Device backing-store size. */
  viewportWidth: number;
  viewportHeight: number;
  /**
   * Box-label width measure service (the SAME `measureText` cache Canvas2D uses)
   * so the box WIDTH + the #199 pixel-fit + the atlas all agree to the pixel.
   * Absent in non-DOM envs ⇒ boxes collapse to the empty-rect (a no-op width);
   * the atlas (which also needs a 2D canvas) is then unavailable too.
   */
  measureLabelWidth?: (text: string, font: string) => number;
  /**
   * HYBRID text path (the SHIPPING B1-P3 decision). When set, the WebGL box pass
   * draws ONLY the fill + border; the in-box LABEL TEXT is NOT rasterized into a
   * GPU atlas here. Instead, the renderer hands the per-label overlay draws
   * (`buildBoxTextDraws`) to this sink so a Canvas2D OVERLAY can draw them with
   * the identical canvas2d engine the golden reference uses — text parity by
   * construction (a GPU text atlas under SwiftShader could not match the 2D text
   * AA, the #1 B1 risk). When absent, the legacy in-GL canvas-raster atlas path
   * runs (kept behind this off-by-default sub-flag for reference / unit tests).
   */
  onTextDraws?: (draws: BoxTextDraw[]) => void;
}

export interface WebGLBoxRenderer {
  /** Draw the box glyphs + their label text for this frame. */
  renderBoxes(frame: WebGLBoxFrame): void;
  destroy(): void;
}

// ---------------------------------------------------------------------------
// Instance build (EXPORTED, pure — the geometry-parity test layer asserts the
// box rects match the Canvas2D box math without a GPU).
// ---------------------------------------------------------------------------

/** A node's centre in DEVICE px (the same transform as renderer.ts screenPoint). */
function screenPoint(positions: Float32Array, nodeIndex: number, frame: WebGLBoxFrame): { x: number; y: number } {
  const offset = nodeIndex * 2;
  const px = positions[offset] ?? 0;
  const py = positions[offset + 1] ?? 0;
  return {
    x: (px - frame.camera.x) * frame.camera.zoom + frame.viewportWidth / 2,
    y: (py - frame.camera.y) * frame.camera.zoom + frame.viewportHeight / 2,
  };
}

function colorAt(
  source: Uint8Array | undefined,
  offset: number,
  fallback: readonly [number, number, number, number],
): [number, number, number, number] {
  return [
    source?.[offset] ?? fallback[0],
    source?.[offset + 1] ?? fallback[1],
    source?.[offset + 2] ?? fallback[2],
    source?.[offset + 3] ?? fallback[3],
  ];
}

/** A single box's resolved draw data (device px) — what the GL instances encode. */
export interface BoxDraw {
  nodeIndex: number;
  centerX: number;
  centerY: number;
  halfW: number;
  halfH: number;
  corner: number;
  border: number;
  /** Node-colour border rgba8 (carries node alpha). */
  borderColor: [number, number, number, number];
  /** Node alpha 0..1 (the box text + border follow it; the fill is fixed). */
  alpha: number;
  /** The #199-FITTED label the box was sized to (empty for collapsed boxes). */
  label: string;
  /** Font px (device) the label was measured + must be rasterized at. */
  fontPx: number;
}

/**
 * Resolve every box node (shape code 5) in the frame to its drawn geometry,
 * using the SHARED `boxDimensions` (so the box matches Canvas2D + the hit-test).
 * Non-box nodes are skipped (the P1 shape renderer draws them).
 */
export function buildBoxDraws(frame: WebGLBoxFrame): BoxDraw[] {
  const draws: BoxDraw[] = [];
  const style = frame.style;
  const measure = frame.measureLabelWidth ?? (() => 0);
  const boxHeight = (frame.boxBaseHeightPx ?? BOX_BASE_HEIGHT_PX) * frame.pixelRatio * frame.camera.zoom;

  for (let i = 0; i < frame.nodeCount; i += 1) {
    if ((style?.nodeShapes?.[i] ?? 0) !== BOX_SHAPE_CODE) continue;
    const label = style?.nodeLabels?.[i] ?? "";
    const dims = boxDimensions(boxHeight, label, measure);
    const halfW = dims.w / 2;
    const halfH = dims.h / 2;
    const corner = clampCorner(dims.corner, halfW, halfH);

    const center = screenPoint(frame.positions, i, frame);
    const nodeColor = colorAt(style?.nodeColors, i * 4, DEFAULT_NODE_COLOR);
    const alpha = nodeColor[3] / 255;
    const bold = (style?.nodeBorders?.[i] ?? 0) === 1;
    // Canvas2D strokes lineWidth = (bold?BOLD:NORMAL)·PR; the SDF border is a
    // band of HALF that width on each side of the outline.
    const border = ((bold ? BORDER_WIDTH_BOLD : BORDER_WIDTH_NORMAL) * frame.pixelRatio) / 2;

    draws.push({
      nodeIndex: i,
      centerX: center.x,
      centerY: center.y,
      halfW,
      halfH,
      corner,
      border,
      borderColor: nodeColor,
      alpha,
      label: dims.label,
      fontPx: dims.fontPx,
    });
  }

  return draws;
}

/**
 * A single box GLYPH's overlay draw (HYBRID box path, B1-P3 shipping decision).
 * Carries the box CENTRE (device px), the box HEIGHT (device px), the RAW label,
 * the border STROKE width + colour, and the node alpha. The overlay
 * (`drawBoxLabels2D`) re-derives the box dimensions + the #199 pixel-fit with ITS
 * OWN 2D context's `measureText`, so the box width + fitted text are computed by
 * the SAME (pinned) font that draws them. This is the crux of the parity: the
 * renderer's internal measure service uses a DIFFERENT (un-pinned) offscreen
 * canvas, so handing over a pre-fitted label would overflow when the overlay
 * draws it with the pinned font. Re-fitting on the overlay context makes the box
 * rect EXTENT (incl. the #199 width cap), the border, AND the text match the
 * canvas2d golden BY CONSTRUCTION — no GPU box-rect SDF or text atlas (neither
 * could match the #199 cap nor the 2D AA under SwiftShader, the #1 B1 risk).
 * Boxes are FEW (god-class + recon focal hubs) so this costs nothing; the many
 * simple nodes (P1) + edges (P2) stay WebGL.
 *
 * (Name kept as `BoxTextDraw` for back-compat; it now carries the full glyph.)
 */
export interface BoxTextDraw {
  nodeIndex: number;
  /** Box centre in DEVICE px (rect is centred here; text is centre/middle). */
  centerX: number;
  centerY: number;
  /** Box HEIGHT in DEVICE px (BOX_BASE_HEIGHT_PX · PR · zoom; degree-independent). */
  height: number;
  /** The RAW node label — the overlay re-fits it (#199) with its own measure. */
  label: string;
  /** Border STROKE width in DEVICE px (Canvas2D lineWidth = 2·BoxDraw.border). */
  borderWidth: number;
  /** Node-colour border as a CSS rgba() string (carries the node alpha). */
  borderColor: string;
  /** Node alpha 0..1 (the whole box glyph — fill/border/text — follows it). */
  alpha: number;
}

/**
 * Extract the box GLYPH overlay draws for the HYBRID box path: ONE entry per box
 * node (labelled OR collapsed — the rect + border always draw; N9/N13b collapsed
 * boxes still draw a rect, just no text). Carries the box CENTRE + HEIGHT + RAW
 * label so the Canvas2D OVERLAY can re-derive the box dimensions (incl. the #199
 * fit) with the SAME context that draws them — extent + border + text match the
 * canvas2d golden BY CONSTRUCTION, no GPU box rect or text atlas.
 */
export function buildBoxTextDraws(frame: WebGLBoxFrame): BoxTextDraw[] {
  const out: BoxTextDraw[] = [];
  const style = frame.style;
  const height = (frame.boxBaseHeightPx ?? BOX_BASE_HEIGHT_PX) * frame.pixelRatio * frame.camera.zoom;
  for (let i = 0; i < frame.nodeCount; i += 1) {
    if ((style?.nodeShapes?.[i] ?? 0) !== BOX_SHAPE_CODE) continue;
    const center = screenPoint(frame.positions, i, frame);
    const [r, g, b, a] = colorAt(style?.nodeColors, i * 4, DEFAULT_NODE_COLOR);
    const bold = (style?.nodeBorders?.[i] ?? 0) === 1;
    out.push({
      nodeIndex: i,
      centerX: center.x,
      centerY: center.y,
      height,
      label: style?.nodeLabels?.[i] ?? "",
      // Canvas2D strokes lineWidth = (bold?BOLD:NORMAL)·PR (device px).
      borderWidth: (bold ? BORDER_WIDTH_BOLD : BORDER_WIDTH_NORMAL) * frame.pixelRatio,
      // Mirror renderer.ts `cssColor`: rgba(r,g,b, a/255). The canvas2d golden
      // also sets globalAlpha=alpha, so the alpha is applied the SAME two ways.
      borderColor: `rgba(${r}, ${g}, ${b}, ${a / 255})`,
      alpha: a / 255,
    });
  }
  return out;
}

/** Encode the rounded-box instances for the GL box pipeline. */
export function buildBoxInstances(draws: BoxDraw[]): number[] {
  const out: number[] = [];
  for (const d of draws) {
    out.push(
      d.centerX, d.centerY,
      d.halfW, d.halfH,
      d.corner,
      d.border,
      // Fill: fixed translucent white (BOX_FILL), alpha-INDEPENDENT (N10/N7).
      BOX_FILL[0] / 255, BOX_FILL[1] / 255, BOX_FILL[2] / 255, BOX_FILL[3] / 255,
      // Border: node colour at node alpha.
      d.borderColor[0] / 255, d.borderColor[1] / 255, d.borderColor[2] / 255, d.alpha,
      d.nodeIndex,
    );
  }
  return out;
}

export interface BoxInstanceView {
  center: [number, number];
  half: [number, number];
  corner: number;
  border: number;
  fill: [number, number, number, number];
  borderColor: [number, number, number, number];
  depth: number;
}

export function decodeBox(list: number[], n: number): BoxInstanceView {
  const o = n * BOX_FLOATS_PER_INSTANCE;
  return {
    center: [list[o] ?? 0, list[o + 1] ?? 0],
    half: [list[o + 2] ?? 0, list[o + 3] ?? 0],
    corner: list[o + 4] ?? 0,
    border: list[o + 5] ?? 0,
    fill: [list[o + 6] ?? 0, list[o + 7] ?? 0, list[o + 8] ?? 0, list[o + 9] ?? 0],
    borderColor: [list[o + 10] ?? 0, list[o + 11] ?? 0, list[o + 12] ?? 0, list[o + 13] ?? 0],
    depth: list[o + 14] ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Per-label canvas-raster text atlas.
// ---------------------------------------------------------------------------

interface AtlasEntry {
  /** Sub-rect in atlas texel coords [u0,v0,u1,v1] (0..1). */
  uv: [number, number, number, number];
  /** Drawn label quad size in device px. */
  width: number;
  height: number;
}

interface BuiltAtlas {
  /** RGBA texels (atlasW × atlasH). */
  pixels: Uint8Array;
  atlasW: number;
  atlasH: number;
  entries: Map<string, AtlasEntry>;
}

/**
 * Atlas cache key for a (label, fontPx) cell. fontPx is QUANTIZED to ¼px so
 * trivially-different device sizes share one atlas cell. EXPORTED so the golden
 * tests build matching atlas entries against `buildTextInstances`.
 */
export function atlasKey(label: string, fontPx: number): string {
  return `${Math.round(fontPx * 4) / 4}px|${label}`;
}

/**
 * Rasterize every DISTINCT (font, fittedLabel) in `draws` onto an offscreen 2D
 * canvas using the IDENTICAL calls `drawBoxNode` makes, and pack them into a
 * single atlas. Returns null in non-DOM envs (no 2D canvas) — the caller then
 * skips the text pass (the box rects still draw; text parity needs the 2D
 * raster, which is the whole point of the canvas-raster approach).
 */
export function buildTextAtlas(draws: BoxDraw[], factory: AtlasCanvasFactory): BuiltAtlas | null {
  const labelled = draws.filter((d) => d.label.length > 0);
  if (labelled.length === 0) return null;

  // Collect distinct (font, label) cells, measuring each at its rendered font.
  const distinct = new Map<string, { label: string; fontPx: number }>();
  for (const d of labelled) {
    const key = atlasKey(d.label, d.fontPx);
    if (!distinct.has(key)) distinct.set(key, { label: d.label, fontPx: d.fontPx });
  }

  // A scratch canvas to measure each cell (so the atlas rows are sized to fit).
  const probe = factory(8, 8);
  if (!probe) return null;
  const pctx = probe.ctx;
  const PAD = 2; // px gutter so neighbouring cells never bleed under AA

  interface Cell {
    key: string;
    label: string;
    fontPx: number;
    w: number;
    h: number;
  }
  const cells: Cell[] = [];
  let maxW = 1;
  for (const [key, { label, fontPx }] of distinct) {
    pctx.font = `${fontPx}px sans-serif`;
    const m = pctx.measureText(label);
    // Cell height = the box font height plus a little vertical room for ascenders
    // / descenders (the text is centred at the box centre, so the cell must hold
    // the full glyph box; fontPx + 0.6·fontPx is generous and font-stack-safe).
    const w = Math.max(1, Math.ceil(m.width) + PAD * 2);
    const h = Math.max(1, Math.ceil(fontPx * 1.6) + PAD * 2);
    cells.push({ key, label, fontPx, w, h });
    maxW = Math.max(maxW, w);
  }

  // Simple shelf packing: stack cells in rows, wrapping at a max atlas width.
  const ATLAS_MAX_W = Math.max(256, Math.min(4096, maxW));
  let x = 0;
  let y = 0;
  let rowH = 0;
  let atlasW = 1;
  const placed: Array<Cell & { x: number; y: number }> = [];
  for (const c of cells) {
    if (x + c.w > ATLAS_MAX_W && x > 0) {
      x = 0;
      y += rowH;
      rowH = 0;
    }
    placed.push({ ...c, x, y });
    x += c.w;
    rowH = Math.max(rowH, c.h);
    atlasW = Math.max(atlasW, x);
  }
  const atlasH = Math.max(1, y + rowH);

  // Rasterize all cells onto a real atlas canvas.
  const surface = factory(atlasW, atlasH);
  if (!surface) return null;
  const ctx = surface.ctx;
  const r = BOX_TEXT_RGB[0];
  const g = BOX_TEXT_RGB[1];
  const b = BOX_TEXT_RGB[2];
  ctx.clearRect(0, 0, atlasW, atlasH);
  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const entries = new Map<string, AtlasEntry>();
  for (const c of placed) {
    ctx.font = `${c.fontPx}px sans-serif`;
    // Draw centred in the cell (matching drawBoxNode's centre/middle alignment).
    ctx.fillText(c.label, c.x + c.w / 2, c.y + c.h / 2);
    entries.set(c.key, {
      uv: [c.x / atlasW, c.y / atlasH, (c.x + c.w) / atlasW, (c.y + c.h) / atlasH],
      width: c.w,
      height: c.h,
    });
  }

  // Read the atlas pixels back so they can be uploaded as a GL texture.
  const img = ctx.getImageData(0, 0, atlasW, atlasH);
  return { pixels: new Uint8Array(img.data.buffer.slice(0)), atlasW, atlasH, entries };
}

/** Encode the text-quad instances against a built atlas. */
export function buildTextInstances(draws: BoxDraw[], atlas: BuiltAtlas): number[] {
  const out: number[] = [];
  const r = BOX_TEXT_RGB[0] / 255;
  const g = BOX_TEXT_RGB[1] / 255;
  const b = BOX_TEXT_RGB[2] / 255;
  for (const d of draws) {
    if (!d.label) continue;
    const entry = atlas.entries.get(atlasKey(d.label, d.fontPx));
    if (!entry) continue;
    out.push(
      d.centerX, d.centerY,
      entry.width, entry.height,
      entry.uv[0], entry.uv[1], entry.uv[2], entry.uv[3],
      r, g, b, d.alpha,
      d.nodeIndex,
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// GL plumbing.
// ---------------------------------------------------------------------------

function compile(gl: GL2, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("failed to create WebGL shader");
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || "shader compile error";
    gl.deleteShader(shader);
    throw new Error(log);
  }
  return shader;
}

function link(gl: GL2, vsSrc: string, fsSrc: string): WebGLProgram {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
  const program = gl.createProgram();
  if (!program) throw new Error("failed to create WebGL program");
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) || "program link error";
    throw new Error(log);
  }
  return program;
}

interface BoxPipeline {
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  cornerBuffer: WebGLBuffer;
  instanceBuffer: WebGLBuffer;
  viewport: WebGLUniformLocation | null;
  maxDepth: WebGLUniformLocation | null;
}

interface TextPipeline {
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  cornerBuffer: WebGLBuffer;
  instanceBuffer: WebGLBuffer;
  /** Atlas texture, allocated LAZILY on first text upload (so a context with no
   *  text — or a stub context in unit tests — never needs createTexture). */
  texture: WebGLTexture | null;
  viewport: WebGLUniformLocation | null;
  maxDepth: WebGLUniformLocation | null;
  atlas: WebGLUniformLocation | null;
}

/** Unit quad as two triangles, corners in {-1,1}^2 (box) — symmetric centre. */
const BOX_QUAD = new Float32Array([
  -1, -1, 1, -1, 1, 1,
  -1, -1, 1, 1, -1, 1,
]);
/** Unit quad as two triangles, corners in {0,1}^2 (text) — for UV mapping. */
const TEXT_QUAD = new Float32Array([
  0, 0, 1, 0, 1, 1,
  0, 0, 1, 1, 0, 1,
]);

function createBoxPipeline(gl: GL2): BoxPipeline {
  const program = link(gl, BOX_VERTEX_SHADER, BOX_FRAGMENT_SHADER);
  const vao = gl.createVertexArray();
  const cornerBuffer = gl.createBuffer();
  const instanceBuffer = gl.createBuffer();
  if (!vao || !cornerBuffer || !instanceBuffer) throw new Error("failed to create box buffers");
  const stride = BOX_FLOATS_PER_INSTANCE * 4;

  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, BOX_QUAD, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
  // 1 a_center, 2 a_half, 3 a_corner_r, 4 a_border, 5 a_fill, 6 a_borderCol, 7 a_depth
  const layout: Array<[number, number, number]> = [
    [1, 2, 0],
    [2, 2, 2 * 4],
    [3, 1, 4 * 4],
    [4, 1, 5 * 4],
    [5, 4, 6 * 4],
    [6, 4, 10 * 4],
    [7, 1, 14 * 4],
  ];
  for (const [loc, size, offset] of layout) {
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
    gl.vertexAttribDivisor(loc, 1);
  }
  gl.bindVertexArray(null);

  return {
    program,
    vao,
    cornerBuffer,
    instanceBuffer,
    viewport: gl.getUniformLocation(program, "u_viewport"),
    maxDepth: gl.getUniformLocation(program, "u_maxDepth"),
  };
}

function createTextPipeline(gl: GL2): TextPipeline {
  const program = link(gl, TEXT_VERTEX_SHADER, TEXT_FRAGMENT_SHADER);
  const vao = gl.createVertexArray();
  const cornerBuffer = gl.createBuffer();
  const instanceBuffer = gl.createBuffer();
  if (!vao || !cornerBuffer || !instanceBuffer) throw new Error("failed to create text buffers");
  const stride = TEXT_FLOATS_PER_INSTANCE * 4;

  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, TEXT_QUAD, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
  // 1 a_center, 2 a_size, 3 a_uv, 4 a_color, 5 a_depth
  const layout: Array<[number, number, number]> = [
    [1, 2, 0],
    [2, 2, 2 * 4],
    [3, 4, 4 * 4],
    [4, 4, 8 * 4],
    [5, 1, 12 * 4],
  ];
  for (const [loc, size, offset] of layout) {
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
    gl.vertexAttribDivisor(loc, 1);
  }
  gl.bindVertexArray(null);

  return {
    program,
    vao,
    cornerBuffer,
    instanceBuffer,
    texture: null,
    viewport: gl.getUniformLocation(program, "u_viewport"),
    maxDepth: gl.getUniformLocation(program, "u_maxDepth"),
    atlas: gl.getUniformLocation(program, "u_atlas"),
  };
}

/**
 * Create a WebGL2 instanced box-glyph + label-text renderer. The `context` MUST
 * be WebGL2 (instancing + VAOs are WebGL2 core). Returns null if the context is
 * not WebGL2-capable so the caller can fall back to Canvas2D for boxes.
 *
 * `atlasFactory` builds the offscreen 2D context the text atlas rasterizes onto;
 * the golden harness passes a font-pinned factory (so the atlas uses the SAME
 * deterministic family Canvas2D measured + drew with). Defaults to a plain
 * OffscreenCanvas / detached `<canvas>`.
 */
export function createWebGLBoxRenderer(
  context: GL2 | null,
  atlasFactory: AtlasCanvasFactory = defaultAtlasCanvasFactory,
): WebGLBoxRenderer | null {
  if (
    !context ||
    typeof context.drawArraysInstanced !== "function" ||
    typeof context.createVertexArray !== "function"
  ) {
    return null;
  }
  const gl: GL2 = context;
  const box = createBoxPipeline(gl);
  const text = createTextPipeline(gl);

  function renderBoxes(frame: WebGLBoxFrame): void {
    const draws = buildBoxDraws(frame);
    if (draws.length === 0) return;

    const hybridText = typeof frame.onTextDraws === "function";

    if (hybridText) {
      // HYBRID box path (the B1-P3 SHIPPING decision). The box glyph — rounded
      // rect + fill + node-colour border + centred label — is the WHOLE glyph
      // for a HANDFUL of box nodes (god-class + recon focal hubs). It is drawn
      // by a Canvas2D OVERLAY (the IDENTICAL `drawBoxNode` engine the golden
      // reference uses), composited on top of the WebGL node/edge passes. So the
      // box-rect EXTENT (incl. the #199 width cap), the border, AND the text all
      // match the canvas2d golden BY CONSTRUCTION. We DELIBERATELY do NOT draw
      // the box rect in WebGL: a GL SDF rect could not reproduce the #199-capped
      // extent + the thin border ring under SwiftShader's AA. Boxes being few,
      // overlay-drawing them costs nothing; the many simple nodes (P1) + edges
      // (P2) stay WebGL. The GL box-rect + text pipelines are intentionally NOT
      // exercised here (kept for the off-by-default reference unit tests below).
      frame.onTextDraws?.(buildBoxTextDraws(frame));
      return;
    }

    // Legacy in-GL reference path (off-by-default; exercised only by unit tests
    // that omit `onTextDraws`). Box rect (fill + border via SDF) + canvas-raster
    // text atlas, interleaved by a per-node depth buffer for R7 occlusion.
    const maxDepth = Math.max(1, frame.nodeCount);
    gl.enable(gl.BLEND);
    // PREMULTIPLIED-alpha "over": the box + text fragments emit premultiplied rgb.
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.clear(gl.DEPTH_BUFFER_BIT);

    const boxInstances = buildBoxInstances(draws);
    gl.useProgram(box.program);
    if (box.viewport) gl.uniform2f(box.viewport, frame.viewportWidth, frame.viewportHeight);
    if (box.maxDepth) gl.uniform1f(box.maxDepth, maxDepth);
    gl.bindVertexArray(box.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, box.instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(boxInstances), gl.DYNAMIC_DRAW);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, draws.length);
    gl.bindVertexArray(null);

    const atlas = buildTextAtlas(draws, atlasFactory);
    const textInstances = atlas ? buildTextInstances(draws, atlas) : [];
    if (atlas && textInstances.length > 0) {
      gl.useProgram(text.program);
      if (text.viewport) gl.uniform2f(text.viewport, frame.viewportWidth, frame.viewportHeight);
      if (text.maxDepth) gl.uniform1f(text.maxDepth, maxDepth);

      if (!text.texture) text.texture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, text.texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.RGBA, atlas.atlasW, atlas.atlasH, 0, gl.RGBA, gl.UNSIGNED_BYTE, atlas.pixels,
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (text.atlas) gl.uniform1i(text.atlas, 0);

      gl.bindVertexArray(text.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, text.instanceBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textInstances), gl.DYNAMIC_DRAW);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, textInstances.length / TEXT_FLOATS_PER_INSTANCE);
      gl.bindVertexArray(null);
    }

    // Restore the default no-depth state so subsequent renders (and any other
    // pass that assumes depth-test off) are unaffected.
    gl.disable(gl.DEPTH_TEST);
  }

  function destroy(): void {
    gl.deleteVertexArray(box.vao);
    gl.deleteBuffer(box.cornerBuffer);
    gl.deleteBuffer(box.instanceBuffer);
    gl.deleteProgram(box.program);
    gl.deleteVertexArray(text.vao);
    gl.deleteBuffer(text.cornerBuffer);
    gl.deleteBuffer(text.instanceBuffer);
    gl.deleteTexture(text.texture);
    gl.deleteProgram(text.program);
  }

  return { renderBoxes, destroy };
}
