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

import {
  BORDER_WIDTH_BOLD,
  BORDER_WIDTH_NORMAL,
  BOX_FILL,
  BOX_SHAPE_CODE,
  coerceFiniteCoord,
  drawnRadius,
  unitShapeGeometry,
} from "./render-geometry";
import type { GraphStyleBuffers } from "./types";

type GL2 = WebGL2RenderingContext;

const DEFAULT_NODE_COLOR = [77, 118, 255, 255] as const;

/** Shape codes Phase 1 renders as instanced polygons/discs (NOT the box). */
const SHAPE_FAMILIES = [0, 1, 2, 3, 4, 6] as const;

const SHAPE_VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec2 a_unit;       // unit-shape vertex (radius 1)
layout(location = 1) in vec2 a_center;     // instance: world centre
layout(location = 2) in float a_radius;    // instance: drawn radius (device px)
layout(location = 3) in vec4 a_color;      // instance: drawn rgba (0..1)
layout(location = 4) in float a_depth;     // instance: drawList index (interleave)

uniform vec2 u_camera;
uniform vec2 u_viewport;
uniform float u_zoom;
uniform float u_maxDepth;

out vec4 v_color;

void main() {
  // World centre -> camera-relative -> zoom (positions are world coords; the
  // radius is already in device px). Mirrors renderer.ts screenPoint/edge shader.
  vec2 worldScreen = (a_center - u_camera) * u_zoom;
  // The unit shape is scaled by the drawn radius (device px), so the disc radius
  // IS the radius -- no gl_PointSize diameter trap.
  vec2 screen = worldScreen + a_unit * a_radius;
  vec2 clip = vec2(screen.x * 2.0 / u_viewport.x, -screen.y * 2.0 / u_viewport.y);
  // Map the drawList index to a depth in (-1,1): later ops sit nearer the camera
  // so a later node occludes an earlier one (byte-parity interleave plumbing).
  float z = u_maxDepth > 0.0 ? (a_depth / u_maxDepth) : 0.0;
  gl_Position = vec4(clip, -z, 1.0);
  v_color = a_color;
}
`;

const SHAPE_FRAGMENT_SHADER = `#version 300 es
precision mediump float;
in vec4 v_color;
out vec4 outColor;
void main() {
  outColor = v_color;
}
`;

interface ShapeProgram {
  program: WebGLProgram;
  uniforms: {
    camera: WebGLUniformLocation | null;
    viewport: WebGLUniformLocation | null;
    zoom: WebGLUniformLocation | null;
    maxDepth: WebGLUniformLocation | null;
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
// a_center(2) + a_radius(1) + a_color(4) + a_depth(1) = 8
const FLOATS_PER_INSTANCE = 8;

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
 * an empty per-instance interleaved VBO (locations 1–4, divisor 1).
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

    // locations 1–4: per-instance attributes (divisor 1) from the interleaved
    // instance buffer. a_center(2) | a_radius(1) | a_color(4) | a_depth(1).
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
}

export function decodeInstance(list: number[], n: number): ShapeInstanceView {
  const o = n * FLOATS_PER_INSTANCE;
  return {
    center: [list[o] ?? 0, list[o + 1] ?? 0],
    radius: list[o + 2] ?? 0,
    color: [list[o + 3] ?? 0, list[o + 4] ?? 0, list[o + 5] ?? 0, list[o + 6] ?? 0],
    depth: list[o + 7] ?? 0,
  };
}

export interface ShapeInstanceSet {
  fill: Map<number, number[]>;
  border: Map<number, number[]>;
  nonFiniteCount: number;
}

/**
 * Build the per-shape-family instance arrays for a frame. Each node maps to ONE
 * fill instance (interior) and — for hollow or bold variants — an extra border
 * pass instance. Box (shape 5) nodes are SKIPPED (Phase 1 leaves them to
 * Canvas2D). Non-finite world coords are coerced (N1b) and counted.
 *
 * EXPORTED so the golden tests can assert the GL instances carry the SAME drawn
 * radius (radius-as-radius, N1) the Canvas2D path computes — a parity check that
 * runs deterministically even where a real WebGL context is unavailable.
 */
export function buildShapeInstances(frame: WebGLShapeFrame): ShapeInstanceSet {
  const fill = new Map<number, number[]>();
  const border = new Map<number, number[]>();
  for (const shape of SHAPE_FAMILIES) {
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
    const strokeHalf = strokeHalfWidth(bold, frame.pixelRatio);

    if (hollow) {
      // Hollow glyph: a node-colour border RING centred on the drawn radius over
      // a FIXED translucent-white interior (alpha-INDEPENDENT, N10). The ring is
      // a node-colour disc out to radius + strokeHalf (drawn UNDER) carved by the
      // translucent-white interior disc at radius - strokeHalf (drawn ON TOP), so
      // the visible ring spans [radius - strokeHalf, radius + strokeHalf] — the
      // SAME width AND position Canvas2D strokes. Only the border carries the
      // node alpha; the interior keeps the fixed white.
      pushInstance(borderList, cx, cy, radius + strokeHalf, nodeColor[0], nodeColor[1], nodeColor[2], alpha, depth);
      pushInstance(fillList, cx, cy, Math.max(0, radius - strokeHalf), BOX_FILL[0], BOX_FILL[1], BOX_FILL[2], BOX_FILL[3] / 255, depth);
    } else if (bold) {
      // Solid + bold: a darkened-colour border RING (factor 0.62) centred on the
      // radius, exactly like the Canvas2D solid+bold stroke. The outer darkened
      // disc (radius + strokeHalf, drawn UNDER) is carved by the node-colour
      // interior disc at radius - strokeHalf (drawn ON TOP), leaving a centred
      // [radius - strokeHalf, radius + strokeHalf] ring. (The old code drew the
      // darkened disc at `radius` UNDER a full-radius node-colour fill, which hid
      // the border entirely — the worst case of the under-weight bug.)
      const d = darken(nodeColor);
      pushInstance(borderList, cx, cy, radius + strokeHalf, d[0], d[1], d[2], alpha, depth);
      pushInstance(fillList, cx, cy, Math.max(0, radius - strokeHalf), nodeColor[0], nodeColor[1], nodeColor[2], alpha, depth);
    } else {
      // Solid fill at node colour + alpha (no border).
      pushInstance(fillList, cx, cy, radius, nodeColor[0], nodeColor[1], nodeColor[2], alpha, depth);
    }
  }

  return { fill, border, nonFiniteCount };
}

/** Stroke HALF-width in device px: (bold?BOLD:NORMAL)·PR / 2 (Canvas2D centres
 *  a stroke of (bold?BOLD:NORMAL)·PR on the outline, so each side is HALF). */
function strokeHalfWidth(bold: boolean, pixelRatio: number): number {
  return ((bold ? BORDER_WIDTH_BOLD : BORDER_WIDTH_NORMAL) * pixelRatio) / 2;
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
): void {
  list.push(cx, cy, radius, r / 255, g / 255, b / 255, a, depth);
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
      camera: gl.getUniformLocation(program, "u_camera"),
      viewport: gl.getUniformLocation(program, "u_viewport"),
      zoom: gl.getUniformLocation(program, "u_zoom"),
      maxDepth: gl.getUniformLocation(program, "u_maxDepth"),
    },
  };
  const families = createShapeFamilyBuffers(gl);

  function renderShapes(frame: WebGLShapeFrame): { nonFiniteCount: number } {
    const { fill, border, nonFiniteCount } = buildShapeInstances(frame);

    gl.useProgram(shapeProgram.program);
    if (shapeProgram.uniforms.camera) gl.uniform2f(shapeProgram.uniforms.camera, frame.camera.x, frame.camera.y);
    if (shapeProgram.uniforms.viewport) {
      gl.uniform2f(shapeProgram.uniforms.viewport, frame.viewportWidth, frame.viewportHeight);
    }
    if (shapeProgram.uniforms.zoom) gl.uniform1f(shapeProgram.uniforms.zoom, frame.camera.zoom);
    if (shapeProgram.uniforms.maxDepth) gl.uniform1f(shapeProgram.uniforms.maxDepth, Math.max(1, frame.nodeCount));

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Border ring pass first (under the fill), then the interior fill pass, so a
    // hollow ring / bold outline sits beneath the (translucent or solid) centre.
    drawPass(gl, families, border);
    drawPass(gl, families, fill);

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

function drawPass(gl: GL2, families: Map<number, ShapeFamilyBuffers>, instances: Map<number, number[]>): void {
  for (const [shape, list] of instances) {
    if (list.length === 0) continue;
    const buffers = families.get(shape);
    if (!buffers) continue;
    const instanceCount = list.length / FLOATS_PER_INSTANCE;
    gl.bindVertexArray(buffers.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(list), gl.DYNAMIC_DRAW);
    gl.drawArraysInstanced(gl.TRIANGLE_FAN, 0, buffers.fanVertexCount, instanceCount);
  }
}
