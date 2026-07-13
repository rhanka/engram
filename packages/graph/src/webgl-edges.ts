/**
 * WebGL2 INSTANCED EDGE renderer (B1 migration plan §2.4, Phase 2).
 *
 * Phase 2 scope: graph EDGES (E1 thick, E2/E12 colour+alpha, E3 dash families,
 * E4 curve, E5 clip, E6 arrowheads, E13 overlap fallback, E14 round caps/joins).
 * It REPLACES the legacy 1px `LINES` edge path when the instanced-shape canary
 * is on; the box glyph (shape 5), labels, and picking remain LATER phases. The
 * path is gated behind the SAME `instancedShapes` canary the P1 shapes use and
 * is INTERNAL-CANARY-ONLY: the studio default stays `canvas2d`, so there is no
 * user-facing change. Canvas2D edges remain the golden source of truth.
 *
 * Architecture (mirrors webgl-shapes.ts):
 *
 *  - **Capsule SDF for thick round-capped edges (E1/E14).** Each drawn edge is
 *    tessellated (render-geometry.tessellateEdge) into device-pixel segments —
 *    one for a straight edge, N for a quadratic curve (E4). Each SEGMENT is an
 *    instanced quad expanded by ±half-width plus a half-width pad at the caps;
 *    the fragment shader keeps only fragments whose distance to the segment is
 *    ≤ half-width, giving ROUND caps and (on curves) round joins for free — the
 *    same `lineCap/lineJoin="round"` Canvas2D sets once per frame.
 *
 *  - **Arc-length dashing (E3).** Each segment instance carries the arc-length
 *    at its start; the fragment shader gates the on/off pattern by
 *    `fract(arcLen / period)`, with the pattern scaled by pixelRatio exactly as
 *    `applyDash` does. Round pips fall out of the capsule cap.
 *
 *  - **Border clip (E5) + overlap fallback (E13).** Endpoints clip to the node
 *    border via render-geometry.borderOffset (circular non-box / rect box,
 *    single-sourced with Canvas2D + the hit-test). An edge whose combined
 *    border offsets exceed the centre distance draws the RAW segment and NO
 *    arrow — verbatim Canvas2D behaviour.
 *
 *  - **Arrowheads (E6/E7).** A filled triangle, tip on the target border,
 *    oriented by the incoming tangent (the curve end tangent for arcs), length
 *    `ARROW_LENGTH·width·pixelRatio·zoom` (world-space). One instanced triangle
 *    per CLIPPED edge; skipped when `!clipped` (E13).
 *
 * The vertex transform mirrors webgl-shapes.ts / the edge shader: positions are
 * computed in DEVICE pixels on the CPU (the same `screenPoint` Canvas2D uses),
 * then mapped to clip space with the viewport. Edges sit at the FAR depth
 * (z = +1, behind every node) because Canvas2D draws all edges before all nodes.
 */

import {
  ARROW_LENGTH,
  ARROW_WIDTH_RATIO,
  FLOW_PORT_MIN_STUB,
  borderOffset,
  dashPattern,
  edgeGeometry,
  edgeStrokeWidth,
  flowPortEdgeGeometry,
  nodeGeometry,
  routeIsArrowless,
  routeIsReversed,
  tessellateEdge,
  type NodeGeometry,
} from "./render-geometry";
import type { GraphStyleBuffers } from "./types";

type GL2 = WebGL2RenderingContext;

const DEFAULT_EDGE_COLOR = [121, 133, 153, 180] as const;

/** Curve tessellation step count — matches the 16-sample hit-test (X8). */
const CURVE_SEGMENTS = 16;

/**
 * UAT polish (fix/webgl-aa-and-stroke-weight): draw the WebGL2 beta edge a touch
 * HEAVIER than the exact Canvas2D ink-mass. The merged width-parity fix (2266cfa)
 * matched Canvas2D to ratio ~1.0, but real-browser UAT read the edges slightly
 * THIN. We scale the DRAWN half-width — the coverage isoline the capsule fragment
 * shader integrates — by this factor (NOT just the AA pad), so the stroke renders
 * ~12% thicker. The per-instance `a_halfWidth` attribute stays the EXACT Canvas2D
 * half-width (max(1,width·PR)/2), so the geometry-parity gate is unchanged; only
 * the rasterized width grows. Canvas2D itself is untouched. ~12% lands the golden
 * edge ink-mass ratio around ~1.1 (within the 0.85–1.3 tolerance).
 */
export const WEBGL_STROKE_WEIGHT_BOOST = 1.12;

// ---------------------------------------------------------------------------
// Capsule (thick segment) program. A unit quad [0..1]² is expanded along the
// segment by the instance's endpoints + half-width. The fragment shader does
// the round-capped capsule coverage + arc-length dashing.
// ---------------------------------------------------------------------------

const CAPSULE_VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec2 a_corner;     // unit quad corner: x in {0,1} along, y in {-1,1} across
layout(location = 1) in vec2 a_p0;         // instance: segment start (device px)
layout(location = 2) in vec2 a_p1;         // instance: segment end (device px)
layout(location = 3) in float a_halfWidth; // instance: stroke half-width (device px)
layout(location = 4) in vec4 a_color;      // instance: rgba (0..1)
layout(location = 5) in float a_arcStart;  // instance: arc-length at p0 (device px)
layout(location = 6) in float a_dashPeriod;// instance: dash on+off period (0 = solid)
layout(location = 7) in float a_dashOn;    // instance: dash on length (device px)
layout(location = 8) in vec3 a_shape;      // instance: alpha multipliers at t=0 / 0.5 / 1 (0..1)

uniform vec2 u_viewport;

out vec2 v_local;      // (alongPx, acrossPx) relative to the segment for SDF
out float v_halfLen;   // half segment length (device px)
out float v_halfWidth; // stroke half-width (device px)
out vec4 v_color;
out float v_arc;       // arc-length at this fragment (device px) for dashing
out float v_dashPeriod;
out float v_dashOn;
out vec3 v_shape;      // along-edge alpha multipliers (m0, mMid, m1)

void main() {
  vec2 d = a_p1 - a_p0;
  float len = length(d);
  vec2 dir = len > 1e-6 ? d / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);

  // Pad each end by the half-width (so the round cap fits) PLUS a ~1.5px AA
  // margin. WITHOUT the AA margin the quad ended at exactly a_halfWidth across,
  // which clipped the fragment SDF's OUTER coverage feather (smoothstep up to
  // a_halfWidth + fwidth): the outer ~1px of the stroke was never rasterized, so
  // a WebGL edge rendered ~1px THINNER than the Canvas2D line of the SAME
  // max(1,width·PR) width (the B1 beta fidelity bug). The SDF still puts the
  // 50%-coverage isoline at exactly a_halfWidth, so padding the quad widens the
  // rasterized region to fit the feather WITHOUT changing the drawn width --
  // matching Canvas2D. Mirrors webgl-boxes a_half + a_border quad pad.
  //
  // UAT polish: the DRAWN half-width is the instance half-width scaled by
  // WEBGL_STROKE_WEIGHT_BOOST (the edge read slightly THIN at exact parity). This
  // is the VISIBLE half-width the fragment coverage integrates (v_halfWidth) and
  // the cap radius — NOT merely the AA pad — so the stroke renders a touch
  // thicker. a_halfWidth (the instance attribute) stays the exact Canvas2D value,
  // so geometry-parity is untouched. The quad pad uses drawHalf so the wider
  // coverage + round caps never get clipped at thick widths.
  float drawHalf = a_halfWidth * ${WEBGL_STROKE_WEIGHT_BOOST.toFixed(4)};
  float aaPad = 1.5;
  float pad = drawHalf + aaPad;
  float along = a_corner.x * (len + 2.0 * pad) - pad;        // [-pad .. len+pad]
  float across = a_corner.y * (drawHalf + aaPad);            // [-hw-aa .. hw+aa]
  vec2 screen = a_p0 + dir * along + nrm * across;

  // Local frame centred on the segment midpoint: x along, y across.
  v_local = vec2(along - len * 0.5, across);
  v_halfLen = len * 0.5;
  v_halfWidth = drawHalf;
  v_color = a_color;
  v_arc = a_arcStart + along; // arc-length accumulates along the polyline
  v_dashPeriod = a_dashPeriod;
  v_dashOn = a_dashOn;
  v_shape = a_shape;

  vec2 clip = vec2(screen.x * 2.0 / u_viewport.x - 1.0, 1.0 - screen.y * 2.0 / u_viewport.y);
  // Edges sit BEHIND every node (Canvas2D draws all edges before all nodes).
  gl_Position = vec4(clip, 1.0, 1.0);
}
`;

const CAPSULE_FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 v_local;
in float v_halfLen;
in float v_halfWidth;
in vec4 v_color;
in float v_arc;
in float v_dashPeriod;
in float v_dashOn;
in vec3 v_shape;
out vec4 outColor;

void main() {
  // Distance to the capsule core segment (a horizontal segment of half-length
  // v_halfLen centred at the origin in local space). Round caps fall out of the
  // clamp + euclidean distance.
  float ax = clamp(v_local.x, -v_halfLen, v_halfLen);
  vec2 closest = vec2(ax, 0.0);
  float dist = distance(v_local, closest);

  // ANALYTIC linear coverage at the capsule boundary so the stroke rim
  // approximates Canvas2D's analytic-coverage AA (the MSAA-on-the-quad-triangles
  // the golden capture requests does NOT smooth this in-quad boundary, so we
  // feather it here). A LINEAR ramp of width aa centred on halfWidth -- NOT a
  // smoothstep -- because smoothstep's inner skirt extends BELOW halfWidth - aa
  // and, for a THIN stroke (halfWidth comparable to the ~1px aa), that skirt is
  // truncated at the centerline so the cross-section integral falls below the
  // true width: the stroke renders TOO THIN (the B1 beta fidelity bug). The
  // linear ramp clamp((halfWidth - dist)/aa + 0.5, 0, 1) keeps the centerline
  // fully opaque whenever halfWidth >= aa/2 and integrates to EXACTLY 2·halfWidth
  // (= the Canvas2D max(1,width·PR) width), so thin and thick strokes both match.
  float aa = max(fwidth(dist), 1e-4);
  float cov = clamp((v_halfWidth - dist) / aa + 0.5, 0.0, 1.0);
  if (cov <= 0.0) discard;

  // Arc-length dashing with ROUND PIPS (E3 + E14). Canvas2D sets lineCap="round"
  // for the whole frame, so each dash "on" run is a round-capped capsule: it
  // bulges out by the stroke radius (= v_halfWidth) at BOTH ends, AND the pip is
  // rounded across its width. We model the pip as a capsule whose CORE runs the
  // on-length and whose caps add v_halfWidth each side — matching Canvas2D's
  // visibly-longer round dashes (a hard cut would under-cover the pip, e.g. a
  // 3px "on" reading as ~3px instead of Canvas2D's ~9px with 3px round caps).
  float coverage = cov;
  if (v_dashPeriod > 0.0) {
    float phase = mod(v_arc, v_dashPeriod);
    // Distance ALONG the arc to the nearest point of the on-run [0 .. v_dashOn].
    float dAlong = phase < 0.0 ? -phase
                 : phase > v_dashOn ? phase - v_dashOn
                 : 0.0;
    // Also fold the previous period's pip so a pip that wraps the period seam
    // still caps correctly (phase near v_dashPeriod is close to the NEXT pip's
    // start at 0). Take the min distance to either pip.
    float dNext = v_dashPeriod - phase; // distance to the next pip start (at 0)
    dAlong = min(dAlong, dNext);
    // Capsule SDF of the pip: combine the across-distance (v_local.y) with the
    // along-overrun so the cap is round in BOTH axes, ≤ v_halfWidth keeps it.
    float pipDist = length(vec2(dAlong, v_local.y));
    float aaPip = max(fwidth(pipDist), 1e-4);
    // Analytic linear coverage (same width-conserving rule as the core stroke).
    float pipCov = clamp((v_halfWidth - pipDist) / aaPip + 0.5, 0.0, 1.0);
    // The straight-segment coverage already handled the across axis for the
    // on-core; gate by the pip capsule so caps/gaps read round.
    coverage = min(coverage, pipCov);
    if (coverage <= 0.0) discard;
  }

  // ALONG-EDGE ALPHA SHAPE (configurable edge-transparency gradient). tt is the
  // 0..1 parameter from the source cap (v_local.x = -v_halfLen) to the target
  // cap (+v_halfLen). The shape is PIECEWISE-LINEAR: mix(m0,mMid) over the first
  // half, mix(mMid,m1) over the second. Default shape (1,1,1) ⇒ sh == 1 (uniform,
  // byte-identical to before this feature); the studio drives it per mode
  // (dense/inverse/mid/flat) to fade an edge toward its dense endpoint / the
  // middle. It MULTIPLIES the base alpha, so dim/hover/merge (which only scale
  // v_color.a) compose automatically.
  float tt = clamp((v_local.x + v_halfLen) / (2.0 * v_halfLen), 0.0, 1.0);
  float sh = tt < 0.5
    ? mix(v_shape.x, v_shape.y, tt * 2.0)
    : mix(v_shape.y, v_shape.z, (tt - 0.5) * 2.0);

  // PREMULTIPLIED alpha output (paired with blendFunc(ONE, ONE_MINUS_SRC_ALPHA)).
  // The effective alpha is the edge alpha times the analytic coverage times the
  // along-edge shape; emit rgb·a so the framebuffer stays premultiplied
  // (premultipliedAlpha:true). The old straight output + SRC_ALPHA factor
  // under-accumulated the framebuffer alpha (squared coverage), washing alpha<1
  // edges out + dark-fringing AA rims.
  float a = v_color.a * coverage * sh;
  outColor = vec4(v_color.rgb * a, a);
}
`;

// ---------------------------------------------------------------------------
// Arrowhead program: an instanced filled triangle. The unit triangle (3 verts
// per instance) is placed by the tip + the incoming tangent + the length.
// ---------------------------------------------------------------------------

const ARROW_VERTEX_SHADER = `#version 300 es
layout(location = 0) in float a_vertex;  // 0 = tip, 1 = base+, 2 = base-
layout(location = 1) in vec2 a_tip;      // instance: arrow tip (device px)
layout(location = 2) in vec2 a_dir;      // instance: incoming unit tangent (points INTO target)
layout(location = 3) in float a_length;  // instance: arrow length (device px)
layout(location = 4) in vec4 a_color;    // instance: rgba (0..1)

uniform vec2 u_viewport;

out vec4 v_color;

void main() {
  vec2 dir = a_dir;
  vec2 perp = vec2(-dir.y, dir.x);
  float halfBase = a_length * ${ARROW_WIDTH_RATIO.toFixed(4)} * 0.5;
  vec2 base = a_tip - dir * a_length;

  vec2 screen;
  if (a_vertex < 0.5) {
    screen = a_tip;
  } else if (a_vertex < 1.5) {
    screen = base + perp * halfBase;
  } else {
    screen = base - perp * halfBase;
  }

  v_color = a_color;
  vec2 clip = vec2(screen.x * 2.0 / u_viewport.x - 1.0, 1.0 - screen.y * 2.0 / u_viewport.y);
  gl_Position = vec4(clip, 1.0, 1.0);
}
`;

const ARROW_FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec4 v_color;
out vec4 outColor;
void main() {
  // PREMULTIPLIED alpha (paired with blendFunc(ONE, ONE_MINUS_SRC_ALPHA)), so an
  // alpha<1 arrowhead composites the same way as its (now premultiplied) edge.
  outColor = vec4(v_color.rgb * v_color.a, v_color.a);
}
`;

/** Floats per capsule instance. p0(2)+p1(2)+halfWidth(1)+color(4)+arcStart(1)+period(1)+on(1)+shape(3) = 15 */
export const CAPSULE_FLOATS_PER_INSTANCE = 15;
/** Floats per arrow instance. tip(2)+dir(2)+length(1)+color(4) = 9 */
export const ARROW_FLOATS_PER_INSTANCE = 9;

export interface WebGLEdgeFrame {
  positions: Float32Array;
  nodeCount: number;
  edges: Uint32Array;
  style?: GraphStyleBuffers;
  camera: { x: number; y: number; zoom: number };
  pixelRatio: number;
  /** Box base height in CSS px (git-flow label-scale knob); default legacy 18.
   * Threaded into the shared nodeGeometry so an edge clipping to a SHRUNKEN
   * pill stops at the shrunken rect border, not the legacy one. */
  boxBaseHeightPx?: number;
  /** Device backing-store size. */
  viewportWidth: number;
  viewportHeight: number;
  /**
   * Box-label width measure service (the SAME `measureText` cache Canvas2D uses)
   * so an edge clipping to a BOX endpoint stops at the SAME rect border (E5).
   * Optional: when absent, box endpoints fall back to the empty-collapse rect
   * (an unlabelled box's extents) — box-label clipping parity is finalised with
   * the box glyph in Phase 4. Circle/polygon endpoints never need it.
   */
  measureLabelWidth?: (text: string, font: string) => number;
}

export interface WebGLEdgeRenderer {
  /** Draw the graph edges (E1–E14) for this frame. */
  renderEdges(frame: WebGLEdgeFrame): void;
  destroy(): void;
}

// ---------------------------------------------------------------------------
// Instance build (EXPORTED, pure — the geometry-parity test layer asserts the
// capsule segments + arrows match the Canvas2D edge math without a GPU).
// ---------------------------------------------------------------------------

export interface EdgeInstanceSet {
  /** Flat capsule-segment instances (CAPSULE_FLOATS_PER_INSTANCE each). */
  capsules: number[];
  /** Flat arrow-triangle instances (ARROW_FLOATS_PER_INSTANCE each). */
  arrows: number[];
}

/** A node's centre in DEVICE px (the same transform as renderer.ts screenPoint). */
function screenPoint(
  positions: Float32Array,
  nodeIndex: number,
  frame: WebGLEdgeFrame,
): { x: number; y: number } {
  const offset = nodeIndex * 2;
  const px = positions[offset] ?? 0;
  const py = positions[offset + 1] ?? 0;
  return {
    x: (px - frame.camera.x) * frame.camera.zoom + frame.viewportWidth / 2,
    y: (py - frame.camera.y) * frame.camera.zoom + frame.viewportHeight / 2,
  };
}

function edgeColorAt(
  source: Uint8Array | undefined,
  offset: number,
): [number, number, number, number] {
  return [
    source?.[offset] ?? DEFAULT_EDGE_COLOR[0],
    source?.[offset + 1] ?? DEFAULT_EDGE_COLOR[1],
    source?.[offset + 2] ?? DEFAULT_EDGE_COLOR[2],
    source?.[offset + 3] ?? DEFAULT_EDGE_COLOR[3],
  ];
}

/**
 * Build the per-frame edge instance arrays from the SAME inputs Canvas2D's
 * `drawFallback2D` edge pass consumes, using the shared render-geometry. Each
 * edge yields: capsule segments (1 straight / CURVE_SEGMENTS curved) carrying
 * colour + arc-length dash params, and — when clipped — one arrow triangle.
 */
export function buildEdgeInstances(frame: WebGLEdgeFrame): EdgeInstanceSet {
  const capsules: number[] = [];
  const arrows: number[] = [];
  const style = frame.style;

  const edgeCount = frame.edges.length / 2;
  if (edgeCount === 0) return { capsules, arrows };

  // Shared node geometry (radii + box extents) in device px, so the edge clip
  // reads the SAME border offsets the node pass draws. Boxes need a measureText
  // service; edges to boxes use their rect extents (box label measuring is a
  // later phase, so a no-op width keeps a box as an empty-collapse rect here —
  // the same value Canvas2D would compute for an unlabelled box).
  const geometry: NodeGeometry = nodeGeometry(
    {
      nodeCount: frame.nodeCount,
      nodeSizes: style?.nodeSizes,
      nodeShapes: style?.nodeShapes,
      nodeLabels: style?.nodeLabels,
    },
    frame.pixelRatio,
    frame.camera.zoom,
    frame.measureLabelWidth ?? (() => 0),
    frame.boxBaseHeightPx,
  );

  for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex += 1) {
    let sourceIndex = frame.edges[edgeIndex * 2] ?? 0;
    let targetIndex = frame.edges[edgeIndex * 2 + 1] ?? 0;
    const route = style?.edgeRouteStyles?.[edgeIndex] ?? 0;
    // flow-port-reverse (2/4): swap the endpoints BEFORE routing so a new→old
    // data edge (git commit-parent child→parent) is DRAWN old→new: it exits
    // the older node's right port and enters the newer node's left port.
    if (routeIsReversed(route)) {
      const swap = sourceIndex;
      sourceIndex = targetIndex;
      targetIndex = swap;
    }
    const source = screenPoint(frame.positions, sourceIndex, frame);
    const target = screenPoint(frame.positions, targetIndex, frame);
    const curvature = style?.edgeCurvatures?.[edgeIndex] ?? 0;
    const width = style?.edgeWidths?.[edgeIndex] ?? 1;

    // FLOW-PORT routing (route codes 1-4): right-port → left-port smooth S,
    // single-sourced with the Canvas2D fallback via flowPortEdgeGeometry.
    // Default (0): the historical centre-to-centre geometry, byte-identical.
    const geom =
      route !== 0
        ? flowPortEdgeGeometry(
            source,
            target,
            borderOffset(geometry, style?.nodeShapes, sourceIndex, 1, 0),
            borderOffset(geometry, style?.nodeShapes, targetIndex, -1, 0),
            FLOW_PORT_MIN_STUB * frame.pixelRatio * frame.camera.zoom,
          )
        : edgeGeometry(source, target, curvature, (end, dx, dy) =>
            borderOffset(geometry, style?.nodeShapes, end === "source" ? sourceIndex : targetIndex, dx, dy),
          );
    if (geom.degenerate) continue;

    const color = edgeColorAt(style?.edgeColors, edgeIndex * 4);
    const r = color[0] / 255;
    const g = color[1] / 255;
    const b = color[2] / 255;
    const a = color[3] / 255;
    const halfWidth = edgeStrokeWidth(width, frame.pixelRatio) / 2;

    const dash = dashPattern(style?.edgeDash?.[edgeIndex] ?? 0, frame.pixelRatio);
    const dashPeriod = dash ? dash[0] + dash[1] : 0;
    const dashOn = dash ? dash[0] : 0;

    // Per-edge ALPHA SHAPE (3 multipliers at t=0 / 0.5 / 1, 0..255 → 0..1). Absent
    // ⇒ the uniform (1,1,1) shape, so the emitted instances are byte-identical to
    // before this feature. Keyed by the DATA edge index (source→target); the
    // studio never sets a reversed flow-port route + a shape together, so the
    // shape orientation always matches the drawn direction.
    const shapeBuf = style?.edgeAlphaShape;
    const s0 = shapeBuf ? (shapeBuf[edgeIndex * 3] ?? 255) / 255 : 1;
    const sMid = shapeBuf ? (shapeBuf[edgeIndex * 3 + 1] ?? 255) / 255 : 1;
    const s1 = shapeBuf ? (shapeBuf[edgeIndex * 3 + 2] ?? 255) / 255 : 1;

    // Tessellate the (clipped) drawn polyline and emit one capsule per segment,
    // accumulating arc-length so dashes are continuous across curve segments.
    const polyline = tessellateEdge(geom, CURVE_SEGMENTS);
    let arc = 0;
    for (let i = 0; i < polyline.length - 1; i += 1) {
      const p0 = polyline[i]!;
      const p1 = polyline[i + 1]!;
      capsules.push(
        p0[0], p0[1],
        p1[0], p1[1],
        halfWidth,
        r, g, b, a,
        arc,
        dashPeriod,
        dashOn,
        s0, sMid, s1,
      );
      arc += Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    }

    // Arrowhead on every CLIPPED edge (E6), tip on the target border, oriented
    // by the incoming tangent (E7); skipped when !clipped (E13) and on the
    // arrowLESS flow-port variants (3/4 — a git-flow FORK descent is a bare S;
    // only merge connectors and lane segments carry the arrow).
    if (geom.clipped && !routeIsArrowless(route)) {
      const arrowLength = ARROW_LENGTH * width * frame.pixelRatio * frame.camera.zoom;
      arrows.push(geom.endX, geom.endY, geom.inTx, geom.inTy, arrowLength, r, g, b, a);
    }
  }

  return { capsules, arrows };
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

interface CapsulePipeline {
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  cornerBuffer: WebGLBuffer;
  instanceBuffer: WebGLBuffer;
  viewport: WebGLUniformLocation | null;
}

interface ArrowPipeline {
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  vertexBuffer: WebGLBuffer;
  instanceBuffer: WebGLBuffer;
  viewport: WebGLUniformLocation | null;
}

/** Unit quad as two triangles, corners (along∈{0,1}, across∈{-1,1}). */
const QUAD_CORNERS = new Float32Array([
  0, -1, 1, -1, 1, 1,
  0, -1, 1, 1, 0, 1,
]);
/** Arrow triangle vertex selectors: 0 tip, 1 base+, 2 base−. */
const ARROW_VERTICES = new Float32Array([0, 1, 2]);

function createCapsulePipeline(gl: GL2): CapsulePipeline {
  const program = link(gl, CAPSULE_VERTEX_SHADER, CAPSULE_FRAGMENT_SHADER);
  const vao = gl.createVertexArray();
  const cornerBuffer = gl.createBuffer();
  const instanceBuffer = gl.createBuffer();
  if (!vao || !cornerBuffer || !instanceBuffer) throw new Error("failed to create capsule buffers");
  const stride = CAPSULE_FLOATS_PER_INSTANCE * 4;

  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, QUAD_CORNERS, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
  // location 1 a_p0, 2 a_p1, 3 a_halfWidth, 4 a_color, 5 a_arcStart, 6 a_dashPeriod,
  // 7 a_dashOn, 8 a_shape (vec3 along-edge alpha multipliers)
  const layout: Array<[number, number, number]> = [
    [1, 2, 0],
    [2, 2, 2 * 4],
    [3, 1, 4 * 4],
    [4, 4, 5 * 4],
    [5, 1, 9 * 4],
    [6, 1, 10 * 4],
    [7, 1, 11 * 4],
    [8, 3, 12 * 4],
  ];
  for (const [loc, size, offset] of layout) {
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
    gl.vertexAttribDivisor(loc, 1);
  }
  gl.bindVertexArray(null);

  return { program, vao, cornerBuffer, instanceBuffer, viewport: gl.getUniformLocation(program, "u_viewport") };
}

function createArrowPipeline(gl: GL2): ArrowPipeline {
  const program = link(gl, ARROW_VERTEX_SHADER, ARROW_FRAGMENT_SHADER);
  const vao = gl.createVertexArray();
  const vertexBuffer = gl.createBuffer();
  const instanceBuffer = gl.createBuffer();
  if (!vao || !vertexBuffer || !instanceBuffer) throw new Error("failed to create arrow buffers");
  const stride = ARROW_FLOATS_PER_INSTANCE * 4;

  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, ARROW_VERTICES, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 1, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
  // location 1 a_tip, 2 a_dir, 3 a_length, 4 a_color
  const layout: Array<[number, number, number]> = [
    [1, 2, 0],
    [2, 2, 2 * 4],
    [3, 1, 4 * 4],
    [4, 4, 5 * 4],
  ];
  for (const [loc, size, offset] of layout) {
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
    gl.vertexAttribDivisor(loc, 1);
  }
  gl.bindVertexArray(null);

  return { program, vao, vertexBuffer, instanceBuffer, viewport: gl.getUniformLocation(program, "u_viewport") };
}

/**
 * Create a WebGL2 instanced edge renderer. The `context` MUST be WebGL2
 * (instancing + VAOs are WebGL2 core). Returns null if the context is not
 * WebGL2-capable so the caller can fall back to the legacy `LINES` path.
 */
export function createWebGLEdgeRenderer(context: GL2 | null): WebGLEdgeRenderer | null {
  if (
    !context ||
    typeof context.drawArraysInstanced !== "function" ||
    typeof context.createVertexArray !== "function"
  ) {
    return null;
  }
  const gl: GL2 = context;
  const capsule = createCapsulePipeline(gl);
  const arrow = createArrowPipeline(gl);

  function renderEdges(frame: WebGLEdgeFrame): void {
    const { capsules, arrows } = buildEdgeInstances(frame);

    gl.enable(gl.BLEND);
    // PREMULTIPLIED-alpha "over": the capsule/arrow fragments emit rgb·a, so the
    // source factor is ONE. Fixes alpha<1 edges compositing too transparent + the
    // dark AA fringe the old SRC_ALPHA factor produced under premultipliedAlpha.
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    if (capsules.length > 0) {
      gl.useProgram(capsule.program);
      if (capsule.viewport) gl.uniform2f(capsule.viewport, frame.viewportWidth, frame.viewportHeight);
      gl.bindVertexArray(capsule.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, capsule.instanceBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(capsules), gl.DYNAMIC_DRAW);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, capsules.length / CAPSULE_FLOATS_PER_INSTANCE);
      gl.bindVertexArray(null);
    }

    if (arrows.length > 0) {
      gl.useProgram(arrow.program);
      if (arrow.viewport) gl.uniform2f(arrow.viewport, frame.viewportWidth, frame.viewportHeight);
      gl.bindVertexArray(arrow.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, arrow.instanceBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arrows), gl.DYNAMIC_DRAW);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 3, arrows.length / ARROW_FLOATS_PER_INSTANCE);
      gl.bindVertexArray(null);
    }
  }

  function destroy(): void {
    gl.deleteVertexArray(capsule.vao);
    gl.deleteBuffer(capsule.cornerBuffer);
    gl.deleteBuffer(capsule.instanceBuffer);
    gl.deleteProgram(capsule.program);
    gl.deleteVertexArray(arrow.vao);
    gl.deleteBuffer(arrow.vertexBuffer);
    gl.deleteBuffer(arrow.instanceBuffer);
    gl.deleteProgram(arrow.program);
  }

  return { renderEdges, destroy };
}

// ---------------------------------------------------------------------------
// Instance decoders (for the geometry-parity test layer).
// ---------------------------------------------------------------------------

export interface CapsuleInstanceView {
  p0: [number, number];
  p1: [number, number];
  halfWidth: number;
  color: [number, number, number, number];
  arcStart: number;
  dashPeriod: number;
  dashOn: number;
  /** Along-edge alpha multipliers at t=0 / 0.5 / 1 (0..1); (1,1,1) = uniform. */
  shape: [number, number, number];
}

/**
 * The along-edge alpha multiplier the capsule fragment shader samples at `tt`
 * (0 = source, 1 = target). PIECEWISE-LINEAR across the mid control point,
 * IDENTICAL to the `sh` computed in CAPSULE_FRAGMENT_SHADER — exported so the
 * geometry-parity tests can assert the emitted shape without a GPU. `shape`
 * values are fractions in [0,1]; the default (1,1,1) returns 1 for every `tt`.
 */
export function alphaShapeAt(shape: readonly [number, number, number], tt: number): number {
  const t = Math.min(1, Math.max(0, tt));
  const [m0, mMid, m1] = shape;
  return t < 0.5 ? m0 + (mMid - m0) * (t * 2) : mMid + (m1 - mMid) * ((t - 0.5) * 2);
}

export function decodeCapsule(list: number[], n: number): CapsuleInstanceView {
  const o = n * CAPSULE_FLOATS_PER_INSTANCE;
  return {
    p0: [list[o] ?? 0, list[o + 1] ?? 0],
    p1: [list[o + 2] ?? 0, list[o + 3] ?? 0],
    halfWidth: list[o + 4] ?? 0,
    color: [list[o + 5] ?? 0, list[o + 6] ?? 0, list[o + 7] ?? 0, list[o + 8] ?? 0],
    arcStart: list[o + 9] ?? 0,
    dashPeriod: list[o + 10] ?? 0,
    dashOn: list[o + 11] ?? 0,
    shape: [list[o + 12] ?? 1, list[o + 13] ?? 1, list[o + 14] ?? 1],
  };
}

export interface ArrowInstanceView {
  tip: [number, number];
  dir: [number, number];
  length: number;
  color: [number, number, number, number];
}

export function decodeArrow(list: number[], n: number): ArrowInstanceView {
  const o = n * ARROW_FLOATS_PER_INSTANCE;
  return {
    tip: [list[o] ?? 0, list[o + 1] ?? 0],
    dir: [list[o + 2] ?? 0, list[o + 3] ?? 0],
    length: list[o + 4] ?? 0,
    color: [list[o + 5] ?? 0, list[o + 6] ?? 0, list[o + 7] ?? 0, list[o + 8] ?? 0],
  };
}
