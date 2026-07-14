/**
 * WebGL2 INSTANCED node-SHAPE renderer (B1 migration plan §1.1, Phase 1).
 *
 * Phase 1 scope: node glyph SHAPES only (N1–N6, N10/N11). Edges, the box glyph
 * (shape 5), labels, and picking are LATER phases — this module renders shapes
 * and the caller falls back to Canvas2D for the rest. The path is gated behind
 * `GRAPHIFY_RENDER_BACKEND` and is INTERNAL-CANARY-ONLY: the studio default
 * stays `canvas2d`, so there is no user-facing change.
 *
 * Architecture decisions implemented here:
 *
 *  - **Instanced disc, radius-AS-radius (N1).** Circles are a triangulated unit
 *    disc instanced with `a_radius = max(1, size·PR·zoom)` — the SAME value the
 *    Canvas2D path uses as a RADIUS (render-geometry.drawnRadius). There is NO
 *    `gl_PointSize`, so the historical diameter trap (gl_PointSize = the radius
 *    value, i.e. HALF the Canvas2D circle) is gone, and the edge clip's `/2`
 *    half-sprite compensation is no longer needed.
 *
 *  - **One instanced draw per shape family.** Each shape code (0 circle, 1
 *    diamond, 2 star, 3 hexagon, 4 square, 6 triangle) has a unit triangle-fan
 *    VBO built from `render-geometry.unitShapeGeometry` (which calls the SAME
 *    `shapePolygonPoints` Canvas2D traces), and its instances are drawn with
 *    `drawArraysInstanced(TRIANGLE_FAN, …)`. So a polygon outline can never
 *    drift from Canvas2D.
 *
 *  - **Per-instance attributes.** `a_center` (world xy), `a_radius` (device px),
 *    `a_fillColor` (rgba8), `a_borderColor` (rgba8), `a_fillMode` (0 solid, 1
 *    hollow), `a_borderWeight` (0 normal, 1 bold), `a_depth` (drawList index for
 *    the byte-parity interleave plumbing, fix #1). Hollow interior uses a FIXED
 *    translucent-white fill independent of node alpha (N10); the border carries
 *    the node alpha.
 *
 * The vertex transform mirrors the edge/node shader (renderer.ts:65-67): world →
 * camera-relative → zoom → clip, y flipped to clip space.
 */

import { cameraToViewProjection } from "./mat4";
import {
  borderStrokeWidthPx,
  BOX_FILL,
  BOX_SHAPE_CODE,
  coerceFiniteCoord,
  drawnRadius,
  unitShapeGeometry,
} from "./render-geometry";
import { SQUARE_INSET_RATIO } from "./shape-geometry";
import type { GraphStyleBuffers } from "./types";

type GL2 = WebGL2RenderingContext;

const DEFAULT_NODE_COLOR = [77, 118, 255, 255] as const;
const HALO_COLOR_FALLBACK = [0, 0, 0, 0] as const;
const HALO_ALPHA = 0.28;
export const HALO_RADIUS_SCALE = 2.0;

/**
 * Radial falloff used by the WebGL halo fragment path. The input is the
 * distance from the centre expressed as a fraction of the OUTER shape
 * boundary (so 1 is the outer edge and 1/HALO_RADIUS_SCALE is the node edge).
 * This mirrors the GLSL smoothstep below and is exported for the deterministic
 * unit test; the instance alpha remains the peak alpha and the shader applies
 * this spatial multiplier per fragment.
 */
export function haloFalloffAt(shapeRadius: number): number {
  const inner = 1 / HALO_RADIUS_SCALE;
  const t = Math.min(1, Math.max(0, (shapeRadius - inner) / (1 - inner)));
  return 1 - t * t * (3 - 2 * t);
}

/** Shape codes Phase 1 renders as instanced polygons/discs (NOT the box). */
const SHAPE_FAMILIES = [0, 1, 2, 3, 4, 6] as const;

const SHAPE_VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec2 a_unit;       // unit-shape vertex (radius 1)
layout(location = 1) in vec2 a_center;     // instance: world centre
layout(location = 2) in float a_radius;    // instance: drawn radius (device px)
layout(location = 3) in vec4 a_color;      // instance: drawn rgba (0..1)
layout(location = 4) in float a_depth;     // instance: drawList index (interleave)
layout(location = 5) in float a_halo;      // instance: 1 for the feathered halo pass

uniform mat4 u_viewProj;   // UNIFIED CAMERA: world -> clip (ortho for 2D, mat4.ts)
uniform vec2 u_viewport;   // device size, for the screen-space radius billboard
uniform float u_maxDepth;

out vec4 v_color;
out vec2 v_unit;
out float v_halo;

void main() {
  // UNIFIED CAMERA: the node CENTRE (world) goes through the SAME mat4 the legacy
  // node/edge shaders use. The glyph RADIUS is a DEVICE-px billboard offset
  // (screen-space, constant-pixel) added in clip space via the viewport -- exactly
  // how a screen-aligned billboard works, which is also 3D-ready. This is
  // mathematically equivalent to the old
  //   screen = (a_center - u_camera)*u_zoom + a_unit*a_radius; clip = screen*(2/vw,-2/vh)
  // (the *2/vw distributes over the centre + radius sum), so the pixels are unchanged.
  vec4 centerClip = u_viewProj * vec4(a_center, 0.0, 1.0);
  vec2 radiusClip = vec2(a_unit.x * a_radius * 2.0 / u_viewport.x,
                        -a_unit.y * a_radius * 2.0 / u_viewport.y);
  // Map the drawList index to a depth in (-1,1): later ops sit nearer the camera
  // so a later node occludes an earlier one (byte-parity interleave plumbing).
  float z = u_maxDepth > 0.0 ? (a_depth / u_maxDepth) : 0.0;
  gl_Position = vec4(centerClip.xy + radiusClip, -z, 1.0);
  v_color = a_color;
  v_unit = a_unit;
  v_halo = a_halo;
}
`;

const SHAPE_FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec4 v_color;
in vec2 v_unit;
in float v_halo;
uniform float u_shapeFamily;
out vec4 outColor;

float cross2(vec2 a, vec2 b) {
  return a.x * b.y - a.y * b.x;
}

vec2 starVertex(int index) {
  float angle = float(index) * 0.6283185307 - 1.5707963268;
  float radius = mod(float(index), 2.0) < 0.5 ? 1.0 : 0.42;
  return vec2(cos(angle), sin(angle)) * radius;
}

// Return the distance from the centre to this shape's boundary along dir,
// in the same unit coordinates used by the triangle-fan geometry. This makes
// the feather follow flat/concave shape edges instead of leaving a circular
// hard rim at polygon corners.
float shapeBoundaryRadius(vec2 dir, float family) {
  if (family < 0.5) return 1.0; // circle
  if (family < 1.5) return 1.0 / (abs(dir.x) + abs(dir.y)); // diamond
  if (family < 2.5) { // five-point star: intersect the centre ray with an edge
    float boundary = 1e6;
    for (int index = 0; index < 10; index += 1) {
      vec2 p0 = starVertex(index);
      vec2 p1 = starVertex((index + 1) % 10);
      vec2 edge = p1 - p0;
      float denominator = cross2(dir, edge);
      if (denominator > 1e-5) {
        boundary = min(boundary, cross2(p0, edge) / denominator);
      }
    }
    return boundary < 1e5 ? boundary : 1.0;
  }
  if (family < 3.5) { // regular hexagon, circumradius 1 / apothem cos(30°)
    float face = max(
      max(abs(dir.x), abs(0.5 * dir.x + 0.8660254038 * dir.y)),
      abs(-0.5 * dir.x + 0.8660254038 * dir.y)
    );
    return 0.8660254038 / max(face, 1e-5);
  }
  if (family < 4.5) { // inset square
    return 0.88 / max(abs(dir.x), abs(dir.y));
  }
  // Triangle face normals are -30°, 90°, and 210°; its apothem is 0.5.
  float face = max(
    max(dot(dir, vec2(0.8660254038, -0.5)), dir.y),
    dot(dir, vec2(-0.8660254038, -0.5))
  );
  return 0.5 / max(face, 1e-5);
}

void main() {
  float alpha = v_color.a;
  if (v_halo > 0.5) {
    float distanceFromCentre = length(v_unit);
    vec2 direction = distanceFromCentre > 1e-5 ? v_unit / distanceFromCentre : vec2(1.0, 0.0);
    float boundary = shapeBoundaryRadius(direction, u_shapeFamily);
    float shapeRadius = distanceFromCentre / max(boundary, 1e-5);
    float inner = ${String(1 / HALO_RADIUS_SCALE)};
    // The halo is strongest at the node edge and fades smoothly to zero at
    // the outer shape boundary. Its alpha is never a uniform ring/contour.
    alpha *= 1.0 - smoothstep(inner, 1.0, shapeRadius);
  }
  // PREMULTIPLIED alpha output (paired with blendFunc(ONE, ONE_MINUS_SRC_ALPHA)).
  // The context is premultipliedAlpha:true (the default), so the framebuffer must
  // hold premultiplied RGBA. With the old straight output + blendFunc(SRC_ALPHA,
  // ONE_MINUS_SRC_ALPHA) the framebuffer ALPHA was under-accumulated (a·a instead
  // of a), so dimmed (alpha<1) glyphs composited TOO TRANSPARENT and AA rims read
  // as dark fringes. Emitting premultiplied rgb·a keeps rgb and alpha consistent.
  outColor = vec4(v_color.rgb * alpha, alpha);
}
`;

interface ShapeProgram {
  program: WebGLProgram;
  uniforms: {
    viewProj: WebGLUniformLocation | null;
    viewport: WebGLUniformLocation | null;
    maxDepth: WebGLUniformLocation | null;
    shapeFamily: WebGLUniformLocation | null;
  };
}

/** Per-shape-family GPU geometry + a reusable per-instance VBO. */
interface ShapeFamilyBuffers {
  vao: WebGLVertexArrayObject;
  unitBuffer: WebGLBuffer;
  instanceBuffer: WebGLBuffer;
  fanVertexCount: number;
}

/** Floats per instance in the interleaved instance buffer. */
// a_center(2) + a_radius(1) + a_color(4) + a_depth(1) + a_halo(1) = 9
const FLOATS_PER_INSTANCE = 9;

export interface WebGLShapeFrame {
  positions: Float32Array;
  nodeCount: number;
  style?: GraphStyleBuffers;
  camera: { x: number; y: number; zoom: number };
  pixelRatio: number;
  /** Device backing-store size. */
  viewportWidth: number;
  viewportHeight: number;
  /** Coercion centre for non-finite world coords (N1b). */
  centerX?: number;
  centerY?: number;
  /**
   * Scale the border stroke with the camera zoom (default false = legacy
   * screen-space width). On for interactive studio views so outlines stay
   * proportional to the zoom-scaled node instead of dominating when zoomed out.
   */
  scaleBordersWithZoom?: boolean;
}

export interface WebGLShapeRenderer {
  /** Draw node shapes (N1–N6) for this frame. Box/edges/labels are not drawn. */
  renderShapes(frame: WebGLShapeFrame): { nonFiniteCount: number };
  destroy(): void;
}

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

/**
 * Build the per-shape-family VAOs: a unit triangle-fan VBO (location 0) +
 * an empty per-instance interleaved VBO (locations 1–5, divisor 1).
 */
function createShapeFamilyBuffers(gl: GL2): Map<number, ShapeFamilyBuffers> {
  const families = new Map<number, ShapeFamilyBuffers>();
  const stride = FLOATS_PER_INSTANCE * 4;

  for (const shape of SHAPE_FAMILIES) {
    const geom = unitShapeGeometry(shape);
    const vao = gl.createVertexArray();
    const unitBuffer = gl.createBuffer();
    const instanceBuffer = gl.createBuffer();
    if (!vao || !unitBuffer || !instanceBuffer) {
      throw new Error("failed to create WebGL shape buffers");
    }
    gl.bindVertexArray(vao);

    // location 0: a_unit (per-vertex, the unit fan).
    gl.bindBuffer(gl.ARRAY_BUFFER, unitBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, geom.fan, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // locations 1–5: per-instance attributes (divisor 1) from the interleaved
    // instance buffer. a_center(2) | a_radius(1) | a_color(4) | a_depth(1) |
    // a_halo(1).
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
    // a_center
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(1, 1);
    // a_radius
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 2 * 4);
    gl.vertexAttribDivisor(2, 1);
    // a_color
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 4, gl.FLOAT, false, stride, 3 * 4);
    gl.vertexAttribDivisor(3, 1);
    // a_depth
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 1, gl.FLOAT, false, stride, 7 * 4);
    gl.vertexAttribDivisor(4, 1);
    // a_halo
    gl.enableVertexAttribArray(5);
    gl.vertexAttribPointer(5, 1, gl.FLOAT, false, stride, 8 * 4);
    gl.vertexAttribDivisor(5, 1);

    gl.bindVertexArray(null);
    families.set(shape, { vao, unitBuffer, instanceBuffer, fanVertexCount: geom.fanVertexCount });
  }

  return families;
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

/** Darken a node colour (same alpha) for a solid+bold border (factor 0.62). */
function darken(rgb: [number, number, number, number], factor = 0.62): [number, number, number, number] {
  return [
    Math.round(rgb[0] * factor),
    Math.round(rgb[1] * factor),
    Math.round(rgb[2] * factor),
    rgb[3],
  ];
}

/** Floats per instance, exported so callers can decode the instance buffer. */
export { FLOATS_PER_INSTANCE };

/** The shape codes Phase 1 draws as instanced shapes (NOT the box glyph). */
export function instancedShapeFamilies(): readonly number[] {
  return SHAPE_FAMILIES;
}

/** Decode one instance from a flat instance list at instance index `n`. */
export interface ShapeInstanceView {
  center: [number, number];
  radius: number;
  /** rgba in 0..1 (a is alpha 0..1, rgb are channel/255). */
  color: [number, number, number, number];
  depth: number;
  /** Whether this instance uses the fragment shader's soft halo falloff. */
  halo: boolean;
}

export function decodeInstance(list: number[], n: number): ShapeInstanceView {
  const o = n * FLOATS_PER_INSTANCE;
  return {
    center: [list[o] ?? 0, list[o + 1] ?? 0],
    radius: list[o + 2] ?? 0,
    color: [list[o + 3] ?? 0, list[o + 4] ?? 0, list[o + 5] ?? 0, list[o + 6] ?? 0],
    depth: list[o + 7] ?? 0,
    halo: (list[o + 8] ?? 0) > 0.5,
  };
}

export interface ShapeInstanceSet {
  /** Expanded node geometry whose fragment alpha is feathered, drawn before border/fill. */
  halo: Map<number, number[]>;
  fill: Map<number, number[]>;
  border: Map<number, number[]>;
  nonFiniteCount: number;
}

/**
 * Build the per-shape-family instance arrays for a frame. Each node maps to ONE
 * feathered halo instance when selected, ONE fill instance (interior) and — for
 * hollow or bold variants — an extra border pass instance. Box (shape 5) nodes
 * are SKIPPED (Phase 1 leaves them to Canvas2D). Non-finite world coords are
 * coerced (N1b) and counted.
 *
 * EXPORTED so the golden tests can assert the GL instances carry the SAME drawn
 * radius (radius-as-radius, N1) the Canvas2D path computes — a parity check that
 * runs deterministically even where a real WebGL context is unavailable.
 */
export function buildShapeInstances(frame: WebGLShapeFrame): ShapeInstanceSet {
  const halo = new Map<number, number[]>();
  const fill = new Map<number, number[]>();
  const border = new Map<number, number[]>();
  for (const shape of SHAPE_FAMILIES) {
    halo.set(shape, []);
    fill.set(shape, []);
    border.set(shape, []);
  }

  const style = frame.style;
  const centerX = frame.centerX ?? 0;
  const centerY = frame.centerY ?? 0;
  let nonFiniteCount = 0;

  for (let i = 0; i < frame.nodeCount; i += 1) {
    const shape = style?.nodeShapes?.[i] ?? 0;
    if (shape === BOX_SHAPE_CODE) continue; // box handled by Canvas2D in Phase 1
    const family = SHAPE_FAMILIES.includes(shape as (typeof SHAPE_FAMILIES)[number]) ? shape : 0;

    let cx = frame.positions[i * 2] ?? 0;
    let cy = frame.positions[i * 2 + 1] ?? 0;
    if (!Number.isFinite(cx)) {
      cx = coerceFiniteCoord(centerX, 0);
      nonFiniteCount += 1;
    }
    if (!Number.isFinite(cy)) {
      cy = coerceFiniteCoord(centerY, 0);
      nonFiniteCount += 1;
    }

    const size = style?.nodeSizes?.[i] ?? 4;
    const radius = drawnRadius(size, frame.pixelRatio, frame.camera.zoom);
    const depth = i; // drawList index (node order) for the interleave plumbing

    const nodeColor = colorAt(style?.nodeColors, i * 4, DEFAULT_NODE_COLOR);
    const alpha = nodeColor[3] / 255;
    const haloColor = colorAt(style?.haloColor, 0, HALO_COLOR_FALLBACK);
    if (style?.haloMask?.[i] === 1 && haloColor[3] > 0) {
      // The halo uses the SAME unit geometry at a wider radius. The fragment
      // shader identifies this instance and applies a shape-aware smoothstep
      // feather from the node edge to the outer boundary; this alpha is only
      // the peak colour, not a visible uniform contour.
      pushInstance(
        halo.get(family)!,
        cx,
        cy,
        radius * HALO_RADIUS_SCALE,
        haloColor[0],
        haloColor[1],
        haloColor[2],
        (haloColor[3] / 255) * HALO_ALPHA * alpha,
        depth,
        true,
      );
    }
    const hollow = (style?.nodeFills?.[i] ?? 0) === 1;
    const bold = (style?.nodeBorders?.[i] ?? 0) === 1;

    const fillList = fill.get(family)!;
    const borderList = border.get(family)!;

    // Stroke HALF-width in device px. Canvas2D strokes a line of width
    // (bold?BOLD:NORMAL)·PR CENTRED on the glyph outline, so the visible border
    // ring must span [radius - strokeHalf, radius + strokeHalf]. The two-disc
    // ring is therefore built CENTRED on the radius (outer disc at radius +
    // strokeHalf, carved by an inner disc at radius - strokeHalf) — NOT the old
    // inside-only `radius - width` ring, which under-weighted the outline and
    // (for solid+bold) was fully hidden by the full-radius fill disc.
    //
    // RADIAL offset != PERPENDICULAR width for a flat-faced polygon. A ring
    // built this way (outer/inner instance at radius±strokeHalf) reads as a
    // constant-perpendicular-width band ONLY for a disc (apothem == radius);
    // for a diamond/square/hexagon/triangle the FACE sits inside the
    // circumradius (or, for square, inside a fixed SQUARE_INSET_RATIO — see
    // apothemRatio() below), so the same radial offset is foreshortened along
    // the face normal — the border visibly THINS as the shape gets more
    // polygonal (bug, × the intended width: circle 1.00, hexagon 0.87,
    // triangle/star 0.5, diamond 0.71, square 0.88). `effectiveStrokeHalf`
    // below compensates per family so every shape's PERPENDICULAR border
    // width lands on a COMMON baseline, fixed at 0.7× the (uncompensated)
    // square's perpendicular width — i.e. 30% thinner than the old square
    // border — and THEN applies an additional per-shape thinning
    // (`SHAPE_BORDER_THIN`) on top of that baseline: circle/hexagon are cut
    // to 0.5× the baseline (0.308×strokeHalf), diamond/square/star/triangle
    // to 0.8× (0.493×strokeHalf). So the perpendicular width is no longer
    // uniform across every family — it is a deliberate TWO-TIER geometry
    // (smooth-boundary shapes thinner than angular ones), each tier still
    // uniform within itself.
    const effectiveStrokeHalf = effectiveStrokeHalfWidth(
      family,
      bold,
      frame.pixelRatio,
      frame.camera.zoom,
      frame.scaleBordersWithZoom ?? false,
    );

    if (hollow) {
      // Hollow glyph: a node-colour border RING centred on the drawn radius over
      // a FIXED translucent-white interior (alpha-INDEPENDENT, N10). The ring is
      // a node-colour disc out to radius + effectiveStrokeHalf (drawn UNDER)
      // carved by the translucent-white interior disc at radius -
      // effectiveStrokeHalf (drawn ON TOP), so the visible ring spans
      // [radius - effectiveStrokeHalf, radius + effectiveStrokeHalf] — a
      // per-shape TWO-TIER perpendicular width across shape families (see
      // above). Only the border carries the node alpha; the interior keeps
      // the fixed white.
      pushInstance(borderList, cx, cy, radius + effectiveStrokeHalf, nodeColor[0], nodeColor[1], nodeColor[2], alpha, depth);
      pushInstance(fillList, cx, cy, Math.max(0, radius - effectiveStrokeHalf), BOX_FILL[0], BOX_FILL[1], BOX_FILL[2], BOX_FILL[3] / 255, depth);
    } else if (bold) {
      // Solid + bold: a darkened-colour border RING (factor 0.62) centred on the
      // radius, at the SAME per-shape (two-tier) perpendicular width as the
      // hollow ring above.
      // The outer darkened disc (radius + effectiveStrokeHalf, drawn UNDER) is
      // carved by the node-colour interior disc at radius - effectiveStrokeHalf
      // (drawn ON TOP), leaving a centred
      // [radius - effectiveStrokeHalf, radius + effectiveStrokeHalf] ring. (The
      // old code drew the darkened disc at `radius` UNDER a full-radius
      // node-colour fill, which hid the border entirely — the worst case of the
      // under-weight bug.)
      const d = darken(nodeColor);
      pushInstance(borderList, cx, cy, radius + effectiveStrokeHalf, d[0], d[1], d[2], alpha, depth);
      pushInstance(fillList, cx, cy, Math.max(0, radius - effectiveStrokeHalf), nodeColor[0], nodeColor[1], nodeColor[2], alpha, depth);
    } else {
      // Solid fill at node colour + alpha (no border).
      pushInstance(fillList, cx, cy, radius, nodeColor[0], nodeColor[1], nodeColor[2], alpha, depth);
    }
  }

  return { halo, fill, border, nonFiniteCount };
}

/**
 * UAT polish (fix/webgl-aa-and-stroke-weight): draw the WebGL2 beta node-shape
 * outline a touch HEAVIER than the exact Canvas2D ink-mass. The merged parity fix
 * (2266cfa) centred the ring at the exact Canvas2D width, but real-browser UAT
 * read the borders slightly THIN. We scale the centred-ring half-width by this
 * factor (~12% thicker, symmetric about the drawn radius). Mirrors the edge boost
 * (WEBGL_STROKE_WEIGHT_BOOST in webgl-edges.ts). Canvas2D (BORDER_WIDTH_* in
 * render-geometry.ts) is untouched — only this WebGL ring widens. This boost is
 * applied BEFORE the per-shape `apothemRatio` compensation below (see
 * `effectiveStrokeHalfWidth`), which then intentionally brings the net result
 * back down to a UNIFORM, ~30%-thinner-than-square perpendicular width.
 */
const WEBGL_OUTLINE_WEIGHT_BOOST = 1.12;

/** Stroke HALF-width in device px: (bold?BOLD:NORMAL)·PR / 2 (Canvas2D centres
 *  a stroke of (bold?BOLD:NORMAL)·PR on the outline, so each side is HALF),
 *  scaled by WEBGL_OUTLINE_WEIGHT_BOOST so the WebGL beta ring reads a touch
 *  HEAVIER than Canvas2D (UAT polish) — Canvas2D's own stroke is unchanged. */
function strokeHalfWidth(
  bold: boolean,
  pixelRatio: number,
  zoom = 1,
  scaleWithZoom = false,
): number {
  return (borderStrokeWidthPx(bold, pixelRatio, zoom, scaleWithZoom) / 2) * WEBGL_OUTLINE_WEIGHT_BOOST;
}

/**
 * Apothem-per-`a_radius` ratio per shape family (fix: circle/hexagon border
 * thicker than square/diamond/triangle). The two-disc ring technique scales
 * each shape's UNIT outline (fixed vertices, computed once at `a_radius = 1`)
 * radially by `a_radius = radius ± strokeHalf`; since that scale is linear,
 * a shape's apothem (perpendicular centre-to-face distance) at any `a_radius`
 * equals `a_radius · apothemUnit`, where `apothemUnit` is the shape's OWN
 * apothem at `a_radius = 1`. A disc's apothem == its radius (ratio 1); a flat
 * polygon face sits INSIDE the circumradius, so its ratio is < 1 and the
 * border reads THINNER there for the SAME radial offset.
 *
 * IMPORTANT: this is the apothem-per-`a_radius` ratio, NOT the shape-intrinsic
 * apothem/circumradius ratio — those coincide for diamond/hexagon/triangle
 * (`shapePolygonPoints` uses the radius argument directly as each vertex's
 * distance from centre, so `a_radius` IS the circumradius: cos(45°)/cos(30°)/
 * cos(60°)), but NOT for square: `shapePolygonPoints(4, r)` insets the square
 * BEFORE the radius scale (`half = r · SQUARE_INSET_RATIO`, shape-geometry.ts
 * — a deliberate visual-weight calibration, unrelated to border math), so its
 * apothem-per-`a_radius` is `SQUARE_INSET_RATIO` (0.88) directly, NOT cos(45°)
 * (0.707, which is diamond's ratio — a different, non-inset quadrilateral).
 * Verified numerically against the actual `shapePolygonPoints` output before
 * coding this. The star's alternating inner/outer vertices have no single
 * apothem (its concave notches sit much closer to centre than its points), so
 * it is approximated at the triangle's 0.5 and — like every family here —
 * clamped to [0.5, 1.0] as a defensive floor/ceiling (a ratio outside that
 * band would over- or under-compensate wildly for an unexpected shape code).
 */
const SHAPE_APOTHEM_RATIO: Readonly<Record<number, number>> = {
  0: 1.0, // circle: apothem == circumradius (a disc)
  1: Math.cos(Math.PI / 4), // diamond: regular 4-gon, no inset — cos(45°)
  2: 0.5, // star: irregular, approximated/clamped
  3: Math.cos(Math.PI / 6), // hexagon: regular 6-gon, no inset — cos(30°)
  4: SQUARE_INSET_RATIO, // square: apothem-per-a_radius IS the inset (0.88), NOT cos(45°)
  6: Math.cos(Math.PI / 3), // triangle: regular 3-gon, no inset — cos(60°)
};

/** Apothem-per-`a_radius` ratio for a shape family, clamped to [0.5, 1.0]. */
function apothemRatio(family: number): number {
  const ratio = SHAPE_APOTHEM_RATIO[family] ?? 1.0;
  return Math.min(1.0, Math.max(0.5, ratio));
}

/**
 * Target UNIFORM perpendicular half-width, as a fraction of the RADIAL
 * `strokeHalf` a disc would draw at: 0.7 × today's square apothem ratio —
 * i.e. 0.7 × the perpendicular half-width today's SQUARE already draws (its
 * apothem-per-`a_radius` ratio is `SQUARE_INSET_RATIO`, 0.88 — see above), so
 * the new uniform border is 30% THINNER than the current square, and (via
 * `apothemRatio` above) identical on every other shape family instead of
 * varying 0.50×–1.00× by shape.
 * `effectiveStrokeHalf = strokeHalf · BORDER_PERP_SCALE / apothemRatio(family)`
 * — dividing by the family's ratio undoes exactly the foreshortening that
 * ratio causes, so every family lands on the same BORDER_PERP_SCALE·strokeHalf
 * perpendicular width. NOTE: this uniform baseline is this constant's OWN
 * effect only — `effectiveStrokeHalfWidth` below then applies a further
 * per-shape `SHAPE_BORDER_THIN` multiplier on top, so the FINAL perpendicular
 * width is a two-tier (not fully uniform) geometry; see that lookup's doc.
 */
const BORDER_PERP_SCALE = 0.7 * SQUARE_INSET_RATIO; // 0.7 · 0.88 = 0.616

/**
 * Per-shape THINNING multiplier applied ON TOP of the uniform
 * `BORDER_PERP_SCALE / apothemRatio` compensation above (user request,
 * 2026-07-13: the uniform 0.616×strokeHalf ring still read too heavy —
 * particularly on the smooth-boundary families — and the user asked for it
 * thinner on a per-shape basis, NOT uniformly). This does NOT undo the
 * apothem compensation (that stays, so every family is still foreshortened
 * back to a common baseline before this extra per-shape cut is applied); it
 * only scales that already-uniform baseline down, differently per shape:
 *  - circle (0) / hexagon (3): × 0.5  → 0.616 × 0.5 = 0.308 × strokeHalf
 *  - diamond (1) / square (4): × 0.8  → 0.616 × 0.8 = 0.493 × strokeHalf
 *  - star (2) / triangle (6):  × 0.8  (NOT specified by the user request —
 *    defaulted to the same 0.8 as the other angular shapes, i.e. grouped with
 *    diamond/square rather than left uniform or given a bespoke value)
 * Any family code missing from the table (defensive) falls back to × 1 (no
 * extra thinning beyond the existing apothem compensation).
 */
const SHAPE_BORDER_THIN: Readonly<Record<number, number>> = {
  0: 0.5, // circle
  3: 0.5, // hexagon
  1: 0.8, // diamond
  4: 0.8, // square
  2: 0.8, // star — user-unspecified, defaulted to the angular-shape value
  6: 0.8, // triangle — user-unspecified, defaulted to the angular-shape value
};

/** Per-shape border-thinning multiplier, defaulting to 1 (no thinning) for
 *  any family code not present in `SHAPE_BORDER_THIN`. */
function borderThinFactor(family: number): number {
  return SHAPE_BORDER_THIN[family] ?? 1;
}

/**
 * The FINAL per-shape perpendicular stroke half-width used to build the
 * border ring (exported so tests can assert the fix directly instead of
 * duplicating the family/BORDER_PERP_SCALE/SHAPE_BORDER_THIN arithmetic).
 */
export function effectiveStrokeHalfWidth(
  family: number,
  bold: boolean,
  pixelRatio: number,
  zoom = 1,
  scaleWithZoom = false,
): number {
  return (
    ((strokeHalfWidth(bold, pixelRatio, zoom, scaleWithZoom) * BORDER_PERP_SCALE) / apothemRatio(family)) *
    borderThinFactor(family)
  );
}

function pushInstance(
  list: number[],
  cx: number,
  cy: number,
  radius: number,
  r: number,
  g: number,
  b: number,
  a: number,
  depth: number,
  halo = false,
): void {
  list.push(cx, cy, radius, r / 255, g / 255, b / 255, a, depth, halo ? 1 : 0);
}

/**
 * Create a WebGL2 instanced shape renderer for the given GL2 context.
 *
 * Phase 1: instanced node shapes only. The `context` MUST be a WebGL2 context
 * (instancing + VAOs are WebGL2 core). Returns null if the context is not
 * WebGL2-capable so the caller can fall back to the legacy point-sprite path.
 */
export function createWebGLShapeRenderer(context: GL2 | null): WebGLShapeRenderer | null {
  if (
    !context ||
    typeof context.drawArraysInstanced !== "function" ||
    typeof context.createVertexArray !== "function"
  ) {
    return null;
  }
  // Bind a non-null local so the nested closures keep the narrowed type.
  const gl: GL2 = context;

  const program = link(gl, SHAPE_VERTEX_SHADER, SHAPE_FRAGMENT_SHADER);
  const shapeProgram: ShapeProgram = {
    program,
    uniforms: {
      viewProj: gl.getUniformLocation(program, "u_viewProj"),
      viewport: gl.getUniformLocation(program, "u_viewport"),
      maxDepth: gl.getUniformLocation(program, "u_maxDepth"),
      shapeFamily: gl.getUniformLocation(program, "u_shapeFamily"),
    },
  };
  const families = createShapeFamilyBuffers(gl);

  function renderShapes(frame: WebGLShapeFrame): { nonFiniteCount: number } {
    const { halo, fill, border, nonFiniteCount } = buildShapeInstances(frame);

    gl.useProgram(shapeProgram.program);
    // UNIFIED CAMERA: the same mat4 view-projection the legacy node/edge shaders
    // use, built from {x,y,zoom} + the device viewport (mat4.cameraToViewProjection).
    if (shapeProgram.uniforms.viewProj) {
      gl.uniformMatrix4fv(
        shapeProgram.uniforms.viewProj,
        false,
        cameraToViewProjection(frame.camera, frame.viewportWidth, frame.viewportHeight),
      );
    }
    // Viewport stays for the screen-space radius billboard (device-px glyph extent).
    if (shapeProgram.uniforms.viewport) {
      gl.uniform2f(shapeProgram.uniforms.viewport, frame.viewportWidth, frame.viewportHeight);
    }
    if (shapeProgram.uniforms.maxDepth) gl.uniform1f(shapeProgram.uniforms.maxDepth, Math.max(1, frame.nodeCount));

    gl.enable(gl.BLEND);
    // PREMULTIPLIED-alpha "over": the fragment emits rgb·a, so the source factor
    // is ONE (not SRC_ALPHA). This composites alpha<1 glyphs correctly (the old
    // SRC_ALPHA factor squared the source alpha into the framebuffer, dimming
    // glyphs too far + dark-fringing AA rims under premultipliedAlpha:true).
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    // HALO PASS first: expanded, feathered copies sit behind the real node
    // geometry. Then the border ring and interior fill preserve all existing
    // node type/community colours and shape variants.
    drawPass(gl, families, halo, shapeProgram.uniforms.shapeFamily);
    // Border ring pass first (under the fill), then the interior fill pass, so a
    // hollow ring / bold outline sits beneath the (translucent or solid) centre.
    drawPass(gl, families, border, shapeProgram.uniforms.shapeFamily);
    drawPass(gl, families, fill, shapeProgram.uniforms.shapeFamily);

    gl.bindVertexArray(null);
    return { nonFiniteCount };
  }

  function destroy(): void {
    for (const f of families.values()) {
      gl.deleteVertexArray(f.vao);
      gl.deleteBuffer(f.unitBuffer);
      gl.deleteBuffer(f.instanceBuffer);
    }
    gl.deleteProgram(shapeProgram.program);
  }

  return { renderShapes, destroy };
}

function drawPass(
  gl: GL2,
  families: Map<number, ShapeFamilyBuffers>,
  instances: Map<number, number[]>,
  shapeFamilyUniform: WebGLUniformLocation | null,
): void {
  for (const [shape, list] of instances) {
    if (list.length === 0) continue;
    const buffers = families.get(shape);
    if (!buffers) continue;
    const instanceCount = list.length / FLOATS_PER_INSTANCE;
    if (shapeFamilyUniform) gl.uniform1f(shapeFamilyUniform, shape);
    gl.bindVertexArray(buffers.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(list), gl.DYNAMIC_DRAW);
    gl.drawArraysInstanced(gl.TRIANGLE_FAN, 0, buffers.fanVertexCount, instanceCount);
  }
}
