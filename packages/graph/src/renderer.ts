import { computePositionBounds, copyPositions } from "./positions";
import { BOX_GLYPH_CORNER_RATIO, SQUARE_INSET_RATIO, shapePolygonPoints } from "./shape-geometry";
import { createWebGLShapeRenderer, type WebGLShapeRenderer } from "./webgl-shapes";
import { createWebGLEdgeRenderer, type WebGLEdgeRenderer } from "./webgl-edges";
import type {
  CameraState,
  FitViewOptions,
  GraphRenderer,
  GraphRendererOptions,
  GraphRendererSnapshot,
  GraphStyleBuffers,
  NodeFlags,
  NodeId,
  RenderGraphBuffers,
  RenderGraphInput,
} from "./types";

type GraphCanvasLike = Pick<HTMLCanvasElement, "getContext" | "height" | "width">;
type GraphContext = WebGL2RenderingContext | WebGLRenderingContext;
type Graph2DContext = CanvasRenderingContext2D;

interface RendererState {
  nodeIds: NodeId[];
  positions: Float32Array;
  edges: Uint32Array;
  nodeFlags?: NodeFlags;
  attrs?: Float32Array;
  style?: GraphStyleBuffers;
}

interface AttributeLocations {
  position: number;
  color: number;
  size?: number;
}

interface UniformLocations {
  camera: WebGLUniformLocation | null;
  viewport: WebGLUniformLocation | null;
  zoom: WebGLUniformLocation | null;
  pixelRatio?: WebGLUniformLocation | null;
}

interface DrawProgram {
  program: WebGLProgram;
  attributes: AttributeLocations;
  uniforms: UniformLocations;
}

interface RenderResources {
  edgeProgram: DrawProgram;
  nodeProgram: DrawProgram;
  positionBuffer: WebGLBuffer;
  colorBuffer: WebGLBuffer;
  sizeBuffer: WebGLBuffer;
}

const EDGE_VERTEX_SHADER = `
attribute vec2 a_position;
attribute vec4 a_color;
uniform vec2 u_camera;
uniform vec2 u_viewport;
uniform float u_zoom;
varying vec4 v_color;

void main() {
  vec2 screen = (a_position - u_camera) * u_zoom;
  vec2 clip = vec2(screen.x * 2.0 / u_viewport.x, -screen.y * 2.0 / u_viewport.y);
  gl_Position = vec4(clip, 0.0, 1.0);
  v_color = a_color;
}
`;

const NODE_VERTEX_SHADER = `
attribute vec2 a_position;
attribute vec4 a_color;
attribute float a_size;
uniform vec2 u_camera;
uniform vec2 u_viewport;
uniform float u_zoom;
uniform float u_pixelRatio;
varying vec4 v_color;

void main() {
  vec2 screen = (a_position - u_camera) * u_zoom;
  vec2 clip = vec2(screen.x * 2.0 / u_viewport.x, -screen.y * 2.0 / u_viewport.y);
  gl_Position = vec4(clip, 0.0, 1.0);
  // World-space sizing for legacy ForceGraph parity: glyphs scale with camera zoom.
  gl_PointSize = max(1.0, a_size * u_pixelRatio * u_zoom);
  v_color = a_color;
}
`;

const COLOR_FRAGMENT_SHADER = `
precision mediump float;
varying vec4 v_color;

void main() {
  gl_FragColor = v_color;
}
`;

const NODE_FRAGMENT_SHADER = `
precision mediump float;
varying vec4 v_color;

void main() {
  vec2 point = gl_PointCoord - vec2(0.5, 0.5);
  if (dot(point, point) > 0.25) {
    discard;
  }
  gl_FragColor = v_color;
}
`;

const DEFAULT_NODE_COLOR = [77, 118, 255, 255] as const;
const DEFAULT_EDGE_COLOR = [121, 133, 153, 180] as const;

/**
 * Resolve the B1 `GRAPHIFY_RENDER_BACKEND` flag for the INSTANCED-SHAPE canary.
 *
 * Precedence: explicit `options.instancedShapes` > the env flag > default
 * `false` (legacy point sprites). The flag values `webgl`/`instanced`/`shapes`
 * opt INTO the new instanced node-shape path; anything else (incl. the default
 * `canvas2d`) keeps the legacy path. This is INTERNAL-CANARY-ONLY — the studio
 * never sets it, so there is no user-facing change in Phase 1.
 */
function resolveInstancedShapes(options: GraphRendererOptions): boolean {
  if (typeof options.instancedShapes === "boolean") return options.instancedShapes;
  // Read the env flag without depending on @types/node (the package has none):
  // reach `process.env` through `globalThis` and string-index it.
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  const env = proc?.env?.GRAPHIFY_RENDER_BACKEND;
  if (!env) return false;
  const flag = env.trim().toLowerCase();
  return flag === "webgl" || flag === "instanced" || flag === "shapes";
}

/** True for a WebGL2 context (instancing + VAOs are WebGL2 core). */
function isWebGL2(context: GraphContext): context is WebGL2RenderingContext {
  return typeof (context as WebGL2RenderingContext).drawArraysInstanced === "function";
}

function acquireContext(canvas: GraphCanvasLike | null, options: GraphRendererOptions): GraphContext | null {
  if (!canvas) {
    return null;
  }

  try {
    const contextOptions = {
      antialias: options.antialias ?? false,
      // The instanced-shape canary (B1 Phase 1) reads the backing store via the
      // golden harness's synchronous gl.readPixels right after render(); keep
      // the buffer alive for that path so the read is reliable across runners
      // (plan §4.2 / R18). The default (legacy/users) keeps the lean `false`.
      preserveDrawingBuffer: resolveInstancedShapes(options),
    };
    return (
      (canvas.getContext("webgl2", contextOptions) as GraphContext | null) ??
      (canvas.getContext("webgl", contextOptions) as GraphContext | null)
    );
  } catch {
    return null;
  }
}

function acquire2DContext(canvas: GraphCanvasLike | null): Graph2DContext | null {
  if (!canvas) {
    return null;
  }

  try {
    return canvas.getContext("2d") as Graph2DContext | null;
  } catch {
    return null;
  }
}

function compileShader(context: GraphContext, type: number, source: string): WebGLShader {
  const shader = context.createShader(type);
  if (!shader) {
    throw new Error("failed to create WebGL shader");
  }

  context.shaderSource(shader, source);
  context.compileShader(shader);

  if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) {
    const log = context.getShaderInfoLog(shader) || "unknown shader compile error";
    throw new Error(log);
  }

  return shader;
}

function createProgram(context: GraphContext, vertexSource: string, fragmentSource: string): WebGLProgram {
  const vertexShader = compileShader(context, context.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(context, context.FRAGMENT_SHADER, fragmentSource);
  const program = context.createProgram();
  if (!program) {
    throw new Error("failed to create WebGL program");
  }

  context.attachShader(program, vertexShader);
  context.attachShader(program, fragmentShader);
  context.linkProgram(program);
  context.deleteShader(vertexShader);
  context.deleteShader(fragmentShader);

  if (!context.getProgramParameter(program, context.LINK_STATUS)) {
    const log = context.getProgramInfoLog(program) || "unknown WebGL program link error";
    throw new Error(log);
  }

  return program;
}

function createDrawProgram(
  context: GraphContext,
  vertexSource: string,
  fragmentSource: string,
  includeSize = false,
): DrawProgram {
  const program = createProgram(context, vertexSource, fragmentSource);
  const attributes: AttributeLocations = {
    position: context.getAttribLocation(program, "a_position"),
    color: context.getAttribLocation(program, "a_color"),
  };
  if (includeSize) attributes.size = context.getAttribLocation(program, "a_size");

  return {
    program,
    attributes,
    uniforms: {
      camera: context.getUniformLocation(program, "u_camera"),
      viewport: context.getUniformLocation(program, "u_viewport"),
      zoom: context.getUniformLocation(program, "u_zoom"),
      pixelRatio: includeSize ? context.getUniformLocation(program, "u_pixelRatio") : null,
    },
  };
}

function createBuffer(context: GraphContext): WebGLBuffer {
  const buffer = context.createBuffer();
  if (!buffer) {
    throw new Error("failed to create WebGL buffer");
  }
  return buffer;
}

function createRenderResources(context: GraphContext): RenderResources {
  return {
    edgeProgram: createDrawProgram(context, EDGE_VERTEX_SHADER, COLOR_FRAGMENT_SHADER),
    nodeProgram: createDrawProgram(context, NODE_VERTEX_SHADER, NODE_FRAGMENT_SHADER, true),
    positionBuffer: createBuffer(context),
    colorBuffer: createBuffer(context),
    sizeBuffer: createBuffer(context),
  };
}

function copyNodeFlags(flags: NodeFlags | undefined): NodeFlags | undefined {
  if (!flags) {
    return undefined;
  }

  return {
    fixed: new Uint8Array(flags.fixed),
  };
}

function validateEdges(edges: Uint32Array, nodeCount: number): void {
  if (edges.length % 2 !== 0) {
    throw new RangeError("edges length must be even");
  }

  for (const index of edges) {
    if (index >= nodeCount) {
      throw new RangeError(`edge endpoint index ${index} is outside node count ${nodeCount}`);
    }
  }
}

function copyStyle(style: GraphStyleBuffers, nodeCount: number, edgeCount: number): GraphStyleBuffers {
  if (style.nodeSizes.length !== nodeCount) {
    throw new RangeError(`nodeSizes length ${style.nodeSizes.length} does not match node count ${nodeCount}`);
  }

  if (style.nodeColors.length !== nodeCount * 4) {
    throw new RangeError(`nodeColors length ${style.nodeColors.length} does not match node count ${nodeCount}`);
  }

  if (style.nodeShapes && style.nodeShapes.length !== nodeCount) {
    throw new RangeError(`nodeShapes length ${style.nodeShapes.length} does not match node count ${nodeCount}`);
  }

  if (style.edgeWidths.length !== edgeCount) {
    throw new RangeError(`edgeWidths length ${style.edgeWidths.length} does not match edge count ${edgeCount}`);
  }

  if (style.edgeColors.length !== edgeCount * 4) {
    throw new RangeError(`edgeColors length ${style.edgeColors.length} does not match edge count ${edgeCount}`);
  }

  if (style.edgeDash.length !== edgeCount || style.edgeCurvatures.length !== edgeCount) {
    throw new RangeError("edge style buffers must match edge count");
  }

  return {
    nodeSizes: new Float32Array(style.nodeSizes),
    nodeColors: new Uint8Array(style.nodeColors),
    nodeShapes: style.nodeShapes ? new Uint8Array(style.nodeShapes) : new Uint8Array(nodeCount),
    nodeLabels: style.nodeLabels ? [...style.nodeLabels] : undefined,
    nodeFills: style.nodeFills ? new Uint8Array(style.nodeFills) : undefined,
    nodeBorders: style.nodeBorders ? new Uint8Array(style.nodeBorders) : undefined,
    edgeWidths: new Float32Array(style.edgeWidths),
    edgeColors: new Uint8Array(style.edgeColors),
    edgeDash: new Uint8Array(style.edgeDash),
    edgeCurvatures: new Float32Array(style.edgeCurvatures),
  };
}

function writeColor(
  target: Uint8Array,
  targetOffset: number,
  source: Uint8Array | undefined,
  sourceOffset: number,
  fallback: readonly [number, number, number, number],
): void {
  target[targetOffset] = source?.[sourceOffset] ?? fallback[0];
  target[targetOffset + 1] = source?.[sourceOffset + 1] ?? fallback[1];
  target[targetOffset + 2] = source?.[sourceOffset + 2] ?? fallback[2];
  target[targetOffset + 3] = source?.[sourceOffset + 3] ?? fallback[3];
}

function buildEdgePositions(state: RendererState, pixelRatio: number): Float32Array {
  const positions = new Float32Array(state.edges.length * 2);
  let cursor = 0;

  for (let edgeIndex = 0; edgeIndex < state.edges.length; edgeIndex += 2) {
    const sourceIndex = state.edges[edgeIndex] ?? 0;
    const targetIndex = state.edges[edgeIndex + 1] ?? 0;
    const sourceOffset = sourceIndex * 2;
    const targetOffset = targetIndex * 2;

    let sourceX = state.positions[sourceOffset] ?? 0;
    let sourceY = state.positions[sourceOffset + 1] ?? 0;
    let targetX = state.positions[targetOffset] ?? 0;
    let targetY = state.positions[targetOffset + 1] ?? 0;

    // Legacy parity: edges stop at the node border instead of piercing the
    // glyph. WebGL point sprites are gl_PointSize = size * pixelRatio * zoom
    // px in DIAMETER, so the world-space radius to clip is size * pixelRatio / 2
    // (zoom cancels because these positions are world coordinates).
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const length = Math.hypot(dx, dy);
    const sourceRadius = ((state.style?.nodeSizes[sourceIndex] ?? 4) * pixelRatio) / 2;
    const targetRadius = ((state.style?.nodeSizes[targetIndex] ?? 4) * pixelRatio) / 2;
    if (length > sourceRadius + targetRadius && length > 1e-6) {
      const unitX = dx / length;
      const unitY = dy / length;
      sourceX += unitX * sourceRadius;
      sourceY += unitY * sourceRadius;
      targetX -= unitX * targetRadius;
      targetY -= unitY * targetRadius;
    }

    positions[cursor++] = sourceX;
    positions[cursor++] = sourceY;
    positions[cursor++] = targetX;
    positions[cursor++] = targetY;
  }

  return positions;
}

function buildEdgeColors(state: RendererState): Uint8Array {
  const edgeCount = state.edges.length / 2;
  const colors = new Uint8Array(edgeCount * 2 * 4);
  let cursor = 0;

  for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex += 1) {
    const sourceOffset = edgeIndex * 4;
    writeColor(colors, cursor, state.style?.edgeColors, sourceOffset, DEFAULT_EDGE_COLOR);
    cursor += 4;
    writeColor(colors, cursor, state.style?.edgeColors, sourceOffset, DEFAULT_EDGE_COLOR);
    cursor += 4;
  }

  return colors;
}

function buildNodeColors(state: RendererState): Uint8Array {
  const colors = new Uint8Array(state.nodeIds.length * 4);
  for (let nodeIndex = 0; nodeIndex < state.nodeIds.length; nodeIndex += 1) {
    const offset = nodeIndex * 4;
    writeColor(colors, offset, state.style?.nodeColors, offset, DEFAULT_NODE_COLOR);
  }
  return colors;
}

function buildNodeSizes(state: RendererState): Float32Array {
  const sizes = new Float32Array(state.nodeIds.length);
  for (let nodeIndex = 0; nodeIndex < state.nodeIds.length; nodeIndex += 1) {
    sizes[nodeIndex] = Math.max(1, state.style?.nodeSizes[nodeIndex] ?? 4);
  }
  return sizes;
}

function uploadAttribute(
  context: GraphContext,
  buffer: WebGLBuffer,
  location: number | undefined,
  data: ArrayBufferView,
  size: number,
  type: number,
  normalized: boolean,
): void {
  if (location === undefined || location < 0) return;
  context.bindBuffer(context.ARRAY_BUFFER, buffer);
  context.bufferData(context.ARRAY_BUFFER, data, context.STATIC_DRAW);
  context.enableVertexAttribArray(location);
  context.vertexAttribPointer(location, size, type, normalized, 0, 0);
}

function bindCameraUniforms(
  context: GraphContext,
  uniforms: UniformLocations,
  camera: CameraState,
  canvas: GraphCanvasLike | null,
  pixelRatio: number,
): void {
  if (uniforms.camera) context.uniform2f(uniforms.camera, camera.x, camera.y);
  if (uniforms.viewport) context.uniform2f(uniforms.viewport, canvas?.width ?? 1, canvas?.height ?? 1);
  if (uniforms.zoom) context.uniform1f(uniforms.zoom, camera.zoom);
  if (uniforms.pixelRatio) context.uniform1f(uniforms.pixelRatio, pixelRatio);
}

function cssColor(
  source: Uint8Array | undefined,
  offset: number,
  fallback: readonly [number, number, number, number],
): string {
  const r = source?.[offset] ?? fallback[0];
  const g = source?.[offset + 1] ?? fallback[1];
  const b = source?.[offset + 2] ?? fallback[2];
  const a = (source?.[offset + 3] ?? fallback[3]) / 255;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * Darkened variant of a node colour (same alpha) so a BOLD border stays
 * visible against the solid fill it outlines.
 */
function cssDarkenedColor(
  source: Uint8Array | undefined,
  offset: number,
  fallback: readonly [number, number, number, number],
  factor = 0.62,
): string {
  const r = Math.round((source?.[offset] ?? fallback[0]) * factor);
  const g = Math.round((source?.[offset + 1] ?? fallback[1]) * factor);
  const b = Math.round((source?.[offset + 2] ?? fallback[2]) * factor);
  const a = (source?.[offset + 3] ?? fallback[3]) / 255;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * Build a box-label `measureText` service for the WebGL edge path so an edge
 * clipping to a BOX endpoint stops at the SAME rect border Canvas2D draws (E5).
 * Uses a throwaway offscreen 2D canvas (OffscreenCanvas or a detached <canvas>)
 * with a per-call font + text cache. Returns `null` in non-DOM environments —
 * the edge path then falls back to the empty-collapse box rect (box-label clip
 * parity finalises with the box glyph in Phase 4). NEVER touches the render
 * canvas (a canvas holds one context type — a 2D ctx there would break WebGL).
 */
function createMeasureService(): ((text: string, font: string) => number) | null {
  const g = globalThis as {
    OffscreenCanvas?: new (w: number, h: number) => { getContext(t: "2d"): CanvasRenderingContext2D | null };
    document?: { createElement(tag: "canvas"): HTMLCanvasElement };
  };
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    if (typeof g.OffscreenCanvas === "function") {
      ctx = new g.OffscreenCanvas(1, 1).getContext("2d");
    } else if (g.document?.createElement) {
      ctx = g.document.createElement("canvas").getContext("2d");
    }
  } catch {
    return null;
  }
  if (!ctx) return null;
  const measureCtx = ctx;
  const cache = new Map<string, number>();
  return (text: string, font: string): number => {
    const key = `${font}|${text}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    measureCtx.font = font;
    const width = measureCtx.measureText(text).width;
    cache.set(key, width);
    return width;
  };
}

function screenPoint(
  positions: Float32Array,
  nodeIndex: number,
  camera: CameraState,
  canvas: GraphCanvasLike | null,
): { x: number; y: number } {
  const offset = nodeIndex * 2;
  return {
    x: ((positions[offset] ?? 0) - camera.x) * camera.zoom + (canvas?.width ?? 1) / 2,
    y: ((positions[offset + 1] ?? 0) - camera.y) * camera.zoom + (canvas?.height ?? 1) / 2,
  };
}

function applyDash(context: Graph2DContext, dash: number, pixelRatio: number): void {
  if (dash === 1) {
    context.setLineDash([6 * pixelRatio, 4 * pixelRatio]);
  } else if (dash === 2) {
    context.setLineDash([1.5 * pixelRatio, 4 * pixelRatio]);
  } else if (dash === 3) {
    context.setLineDash([10 * pixelRatio, 6 * pixelRatio]);
  } else {
    context.setLineDash([]);
  }
}

const EDGE_CURVE_FACTOR = 0.5;

// Legacy vis-network `shape:box` parity. The box IS the node glyph drawn by the
// Canvas2D fallback: a rounded rectangle, white-translucent fill, node-coloured
// border, dark centred text. SCALE rule: the box HEIGHT equals the node's drawn
// DIAMETER (2 × nodeSizes[i] × pixelRatio × zoom — the exact on-screen height a
// neighbouring diamond/circle of the same nodeSize occupies), the label font is
// sized to FIT that height minus a SMALL margin per side, and only the WIDTH
// grows to hug the text. So a box always reads as ONE node glyph beside its
// neighbours, never as an oversized text card.
const BOX_SHAPE = 5;
// Legacy vis-network `shape:box` is sized to its LABEL at a small, degree-INDEPENDENT
// font — the legacy 22-unit box proportions (12-unit font, 5-unit margins) at a
// base height shrunk ~20% (22 → 18, UAT: the box must read clearly SMALLER than
// the largest diamond). It does NOT inflate with a god-node's degree (only zoom
// scales it), so a labelled box never dwarfs its neighbours.
const BOX_BASE_HEIGHT_PX = 18; // box height in CSS px (× pixelRatio × zoom), legacy 22 − ~20%
const BOX_MARGIN_RATIO = 5 / 22; // legacy margin per side (5 of a 22 box)
const BOX_FONT_RATIO = 12 / 22; // legacy font size (12 of a 22 box) — text much smaller than the box
const BOX_CORNER_RATIO = 1 / 4; // corner radius as a fraction of box height
// Maximum box WIDTH, expressed as a multiple of the box height (so it scales
// with pixelRatio × zoom exactly like the height — the cap reads the same at
// any zoom). The box still grows in width to hug short labels, but a long
// chapter / entity name is PIXEL-FITTED to this ceiling with an ellipsis so the
// glyph can never balloon into an over-wide text card that overflows the layout.
// ~10× a small box height keeps a comfortable line (≈ 30-ish narrow glyphs at
// the legacy 12/22 font) while bounding the worst case. This is the SHARED,
// backend-agnostic render-geometry fix: it covers EVERY box node (main-graph
// chapter/work/god-class hubs AND the recon focal pair), not just one view.
const BOX_MAX_WIDTH_RATIO = 10;
// Single-character ellipsis appended when a box label is pixel-clipped to fit.
const BOX_ELLIPSIS = "…";
// Non-labelled (low-degree) box collapse, as a fraction of the box height:
// legacy hidden-font boxes shrink to their two 5-unit margins of a 22-unit box.
const BOX_EMPTY_RATIO = 10 / 22;
const BOX_FILL: readonly [number, number, number, number] = [255, 255, 255, 0.5 * 255];
const BOX_TEXT_COLOR = "#0f172a"; // theme-dark label text (slate-900)

// Shape-variant outline widths in CSS px (× pixelRatio, screen-space like the
// box border): "normal" hollow outlines and the heavier "bold" border variant.
const BORDER_WIDTH_NORMAL = 1.5;
const BORDER_WIDTH_BOLD = 3;
// Hollow glyph interior: same translucent white as the legacy box fill, so a
// hollow shape reads as an outline without disappearing over edges.
const HOLLOW_FILL_STYLE = `rgba(${BOX_FILL[0]}, ${BOX_FILL[1]}, ${BOX_FILL[2]}, ${BOX_FILL[3] / 255})`;

// Arrowhead length in world units per unit of edge width. Legacy parity: the
// legacy export enables `arrows: { to: { scaleFactor: 0.5 } }` → ~7.5-unit
// arrows beside ~10-unit base node radii; our scenes use ~3-unit base radii,
// so 2.5 keeps the same arrow-to-node proportion. Scales with camera zoom
// (world-space) like every glyph.
const ARROW_LENGTH = 2.5;
// Triangle base width as a fraction of its length.
const ARROW_WIDTH_RATIO = 0.9;

function pathPolygon(context: Graph2DContext, x: number, y: number, points: Array<[number, number]>): void {
  if (points.length === 0) return;

  const first = points[0]!;
  context.moveTo(x + first[0], y + first[1]);
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index]!;
    context.lineTo(x + point[0], y + point[1]);
  }
  context.closePath();
}

/**
 * Trace a rounded rectangle of width `w` / height `h` centred on (x, y) with
 * the given `corner` radius (clamped so it never exceeds half of either side).
 * Used both for the legacy `shape:box` label glyph and the small empty box.
 */
function drawRoundedBox(
  context: Graph2DContext,
  x: number,
  y: number,
  w: number,
  h: number,
  corner: number,
): void {
  const halfW = w / 2;
  const halfH = h / 2;
  const r = Math.max(0, Math.min(corner, halfW, halfH));
  context.moveTo(x - halfW + r, y - halfH);
  context.lineTo(x + halfW - r, y - halfH);
  context.quadraticCurveTo(x + halfW, y - halfH, x + halfW, y - halfH + r);
  context.lineTo(x + halfW, y + halfH - r);
  context.quadraticCurveTo(x + halfW, y + halfH, x + halfW - r, y + halfH);
  context.lineTo(x - halfW + r, y + halfH);
  context.quadraticCurveTo(x - halfW, y + halfH, x - halfW, y + halfH - r);
  context.lineTo(x - halfW, y - halfH + r);
  context.quadraticCurveTo(x - halfW, y - halfH, x - halfW + r, y - halfH);
  context.closePath();
}

function drawNodeShapePath(context: Graph2DContext, x: number, y: number, radius: number, shape: number): void {
  // Shared geometry (shape-geometry.ts) so DOM/SVG glyphs match the canvas.
  const points = shapePolygonPoints(shape, radius);
  if (points) {
    pathPolygon(context, x, y, points);
    return;
  }

  if (shape === 5) {
    const half = radius * SQUARE_INSET_RATIO;
    drawRoundedBox(context, x, y, half * 2, half * 2, half * BOX_GLYPH_CORNER_RATIO);
    return;
  }

  context.arc(x, y, radius, 0, Math.PI * 2);
}

/**
 * Per-node drawn geometry in SCREEN pixels, computed once per frame BEFORE the
 * edge pass so edges can be clipped to the node border (legacy parity: lines
 * stop AT the glyph border, arrowheads sit ON it) and the node pass can reuse
 * the exact same dimensions.
 *
 * - `radii[i]`     drawn radius of a circle-ish glyph (every non-box shape).
 * - `boxHalfWidths[i]` / `boxHalfHeights[i]` half-extents of the drawn box
 *   rectangle (only meaningful when nodeShapes[i] is the box shape).
 */
interface NodeGeometry {
  radii: Float32Array;
  boxHalfWidths: Float32Array;
  boxHalfHeights: Float32Array;
}

/**
 * PIXEL-FIT a label so its DRAWN width never exceeds `maxTextWidth`, appending a
 * single ellipsis when it has to clip. Unlike a fixed character-count cap, this
 * is glyph-width aware (a run of wide letters clips sooner than a run of "i"s),
 * so the box that hugs the returned text is guaranteed to stay within the max.
 *
 * Binary search over the keep-length keeps it O(log n) measureText calls per
 * over-long label (cheap, and only long labels pay it). When even the ellipsis
 * alone does not fit (an absurdly tiny box) we still return the ellipsis so the
 * caller draws SOMETHING rather than overflowing. The full text is unchanged on
 * the node payload, so hover tooltips / detail panels keep the verbatim name.
 */
function fitLabelToWidth(
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
 * Legacy `shape:box` glyph dimensions. The box height is a fixed legacy base
 * (BOX_BASE_HEIGHT_PX, scaled by pixelRatio × zoom) — degree-INDEPENDENT, so a
 * high-degree Work box never inflates past its neighbours; the small font fits
 * that height minus a margin per side, and the box only grows in WIDTH to hug
 * the text plus margins. A non-labelled (low-degree) box collapses like the
 * legacy hidden-font (fontSize 0) box: a small square of BOX_EMPTY_RATIO × height.
 *
 * WIDTH IS CAPPED at BOX_MAX_WIDTH_RATIO × height: a label too long to hug
 * within that ceiling is PIXEL-FITTED (see {@link fitLabelToWidth}) to the
 * available text width with an ellipsis, so the box never balloons into an
 * over-wide text card that overflows the layout. The returned `label` is the
 * exact (possibly clipped) text the box was sized to — the draw path renders
 * THAT string, so the box always hugs precisely what it shows.
 */
function boxDimensions(
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

/**
 * Draw a single legacy `shape:box` glyph (vis-network parity).
 *
 * - Eligible (central) box: a rounded rectangle with a white-translucent
 *   fill, the node colour as border, and the dark label text centred inside.
 *   Height = the node's drawn diameter (same scale as every other glyph);
 *   font fits that height minus a small margin; width hugs the measured text.
 * - Non-eligible (low-degree / non-labelled) box: a small EMPTY rounded rect
 *   (BOX_EMPTY_RATIO of the height — the legacy hidden-font collapse), no text.
 *
 * Exactly ONE fillText per labelled box per frame — the box text IS the node
 * label; no other layer may draw it again. Fill / stroke / text alpha follow
 * the node's payload alpha (`nodeColors[i*4+3] / 255`) so dim / merge styling
 * still applies, and the border colour is the payload node colour (which
 * already encodes selection / hover / focus).
 */
function drawBoxNode(
  context: Graph2DContext,
  x: number,
  y: number,
  w: number,
  h: number,
  corner: number,
  fontPx: number,
  pixelRatio: number,
  label: string,
  borderColor: string,
  alpha: number,
  boldBorder = false,
): void {
  context.save();
  context.globalAlpha = alpha;

  context.beginPath();
  drawRoundedBox(context, x, y, w, h, corner);
  context.fillStyle = HOLLOW_FILL_STYLE;
  context.fill();
  context.strokeStyle = borderColor;
  context.lineWidth = (boldBorder ? BORDER_WIDTH_BOLD : BORDER_WIDTH_NORMAL) * pixelRatio;
  context.stroke();

  if (label) {
    context.fillStyle = BOX_TEXT_COLOR;
    context.font = `${fontPx}px sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(label, x, y);
  }

  context.restore();
}

/**
 * Filled triangular arrowhead whose TIP sits at (x, y) — the clipped edge
 * endpoint on the target node's border — pointing along the unit direction
 * (ux, uy) of the incoming edge.
 */
function drawArrowHead(
  context: Graph2DContext,
  x: number,
  y: number,
  ux: number,
  uy: number,
  length: number,
): void {
  const baseX = x - ux * length;
  const baseY = y - uy * length;
  const half = length * ARROW_WIDTH_RATIO * 0.5;
  const px = -uy;
  const py = ux;

  context.beginPath();
  context.moveTo(x, y);
  context.lineTo(baseX + px * half, baseY + py * half);
  context.lineTo(baseX - px * half, baseY - py * half);
  context.closePath();
  context.fill();
}

function drawFallback2D(
  context: Graph2DContext | null,
  state: RendererState,
  camera: CameraState,
  canvas: GraphCanvasLike | null,
  pixelRatio: number,
  skipEdges = false,
): void {
  if (!context || !canvas) return;

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";

  // Legacy `shape:box` parity: measure each distinct label AT THE RENDERED
  // (zoom-scaled, node-sized) font so the box hugs the exact text it draws.
  // The cache is per-frame and keyed by font + text (box fonts vary with the
  // node size, so the font participates in the key).
  const labelWidthCache = new Map<string, number>();
  const measureLabelWidth = (text: string, font: string): number => {
    const key = `${font}|${text}`;
    const cached = labelWidthCache.get(key);
    if (cached !== undefined) return cached;
    context.font = font;
    const width = context.measureText(text).width;
    labelWidthCache.set(key, width);
    return width;
  };

  // Pre-pass: every node's drawn geometry in screen px. The edge pass clips
  // each endpoint to this geometry; the node pass reuses the same dimensions.
  const nodeCount = state.nodeIds.length;
  const geometry: NodeGeometry = {
    radii: new Float32Array(nodeCount),
    boxHalfWidths: new Float32Array(nodeCount),
    boxHalfHeights: new Float32Array(nodeCount),
  };
  for (let nodeIndex = 0; nodeIndex < nodeCount; nodeIndex += 1) {
    // World-space sizing for legacy ForceGraph parity: glyphs scale with camera zoom.
    const radius = Math.max(1, (state.style?.nodeSizes[nodeIndex] ?? 4) * pixelRatio * camera.zoom);
    geometry.radii[nodeIndex] = radius;
    if ((state.style?.nodeShapes[nodeIndex] ?? 0) !== BOX_SHAPE) continue;
    const label = state.style?.nodeLabels?.[nodeIndex] ?? "";
    // Box size is degree-INDEPENDENT (legacy): a fixed base height scaled only by
    // pixelRatio × zoom, so a high-degree Work box never balloons past its neighbours.
    const boxHeight = BOX_BASE_HEIGHT_PX * pixelRatio * camera.zoom;
    const dims = boxDimensions(boxHeight, label, measureLabelWidth);
    geometry.boxHalfWidths[nodeIndex] = dims.w / 2;
    geometry.boxHalfHeights[nodeIndex] = dims.h / 2;
  }

  // Distance from a node's centre to its drawn border along the outgoing unit
  // direction (dirX, dirY): the drawn radius for circle-ish glyphs, the exact
  // rectangle-border distance for box glyphs.
  const borderOffset = (nodeIndex: number, dirX: number, dirY: number): number => {
    if ((state.style?.nodeShapes[nodeIndex] ?? 0) === BOX_SHAPE) {
      const halfW = geometry.boxHalfWidths[nodeIndex] ?? 0;
      const halfH = geometry.boxHalfHeights[nodeIndex] ?? 0;
      const absX = Math.abs(dirX);
      const absY = Math.abs(dirY);
      const alongX = absX > 1e-6 ? halfW / absX : Number.POSITIVE_INFINITY;
      const alongY = absY > 1e-6 ? halfH / absY : Number.POSITIVE_INFINITY;
      return Math.min(alongX, alongY);
    }
    return geometry.radii[nodeIndex] ?? 0;
  };

  const edgeCount = skipEdges ? 0 : state.edges.length / 2;
  for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex += 1) {
    const sourceIndex = state.edges[edgeIndex * 2] ?? 0;
    const targetIndex = state.edges[edgeIndex * 2 + 1] ?? 0;
    const source = screenPoint(state.positions, sourceIndex, camera, canvas);
    const target = screenPoint(state.positions, targetIndex, camera, canvas);
    const curvature = state.style?.edgeCurvatures[edgeIndex] ?? 0;
    const width = state.style?.edgeWidths[edgeIndex] ?? 1;
    const colorOffset = edgeIndex * 4;

    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 1e-6) continue;

    // Control point of the curved edge (also defines the endpoint tangents).
    let controlX = 0;
    let controlY = 0;
    if (curvature !== 0) {
      const midX = (source.x + target.x) / 2;
      const midY = (source.y + target.y) / 2;
      controlX = midX + (-dy / distance) * distance * curvature * EDGE_CURVE_FACTOR;
      controlY = midY + (dx / distance) * distance * curvature * EDGE_CURVE_FACTOR;
    }

    // Unit directions pointing OUT of each node along the edge: the curve's
    // endpoint tangents for arcs, the straight direction otherwise.
    let outSx = dx / distance;
    let outSy = dy / distance;
    let inTx = dx / distance;
    let inTy = dy / distance;
    if (curvature !== 0) {
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

    // Legacy parity: the line STOPS at each node's drawn border and the
    // arrowhead tip sits ON the target border. Overlapping nodes (combined
    // border offsets exceed the centre distance) draw the raw segment — the
    // glyphs cover it anyway — and skip the arrow.
    const offsetSource = borderOffset(sourceIndex, outSx, outSy);
    const offsetTarget = borderOffset(targetIndex, -inTx, -inTy);
    const clipped = distance > offsetSource + offsetTarget + 1e-3;
    const startX = clipped ? source.x + outSx * offsetSource : source.x;
    const startY = clipped ? source.y + outSy * offsetSource : source.y;
    const endX = clipped ? target.x - inTx * offsetTarget : target.x;
    const endY = clipped ? target.y - inTy * offsetTarget : target.y;

    const edgeColor = cssColor(state.style?.edgeColors, colorOffset, DEFAULT_EDGE_COLOR);
    context.beginPath();
    context.strokeStyle = edgeColor;
    context.lineWidth = Math.max(1, width * pixelRatio);
    applyDash(context, state.style?.edgeDash[edgeIndex] ?? 0, pixelRatio);
    context.moveTo(startX, startY);
    if (curvature !== 0) {
      context.quadraticCurveTo(controlX, controlY, endX, endY);
    } else {
      context.lineTo(endX, endY);
    }
    context.stroke();

    if (clipped) {
      // World-space arrow length (scales with zoom like every glyph), edge
      // width modulated like the legacy `arrows.to` rendering.
      const arrowLength = ARROW_LENGTH * width * pixelRatio * camera.zoom;
      context.setLineDash([]);
      context.fillStyle = edgeColor;
      drawArrowHead(context, endX, endY, inTx, inTy, arrowLength);
    }
  }
  context.setLineDash([]);

  for (let nodeIndex = 0; nodeIndex < state.nodeIds.length; nodeIndex += 1) {
    const point = screenPoint(state.positions, nodeIndex, camera, canvas);
    const colorOffset = nodeIndex * 4;
    const shape = state.style?.nodeShapes[nodeIndex] ?? 0;
    const nodeColor = cssColor(state.style?.nodeColors, colorOffset, DEFAULT_NODE_COLOR);
    const radius = geometry.radii[nodeIndex] ?? 1;

    // Shape variants (additive encodings): hollow-vs-solid fill and
    // bold-vs-normal border, multiplying the base shapes per node type.
    const hollow = (state.style?.nodeFills?.[nodeIndex] ?? 0) === 1;
    const boldBorder = (state.style?.nodeBorders?.[nodeIndex] ?? 0) === 1;

    if (shape === BOX_SHAPE) {
      // The box IS the glyph. Its height is a fixed legacy base (degree-INDEPENDENT,
      // scaled only by pixelRatio × zoom — MUST match the geometry pre-pass above so
      // edge-clipping and drawing agree), the small text is fitted inside, and the
      // width hugs the text. Border = node colour (encodes selection/hover); alpha
      // follows the node's payload alpha so dim / merge styling applies. Boxes are
      // inherently hollow; only the border-weight variant applies.
      const label = state.style?.nodeLabels?.[nodeIndex] ?? "";
      const alpha = (state.style?.nodeColors[colorOffset + 3] ?? 255) / 255;
      const boxHeight = BOX_BASE_HEIGHT_PX * pixelRatio * camera.zoom;
      const dims = boxDimensions(boxHeight, label, measureLabelWidth);
      drawBoxNode(
        context,
        point.x,
        point.y,
        dims.w,
        dims.h,
        dims.corner,
        dims.fontPx,
        pixelRatio,
        // The PIXEL-FITTED label (clipped + ellipsised to the capped box width),
        // so the drawn text matches the box `dims` was sized to — never the raw,
        // possibly-overflowing source label.
        dims.label,
        nodeColor,
        alpha,
        boldBorder,
      );
      continue;
    }

    context.beginPath();
    drawNodeShapePath(context, point.x, point.y, radius, shape);
    if (hollow) {
      // Outline-only glyph: translucent interior + node-coloured border (the
      // border carries the colour signal, like the legacy box glyph).
      context.fillStyle = HOLLOW_FILL_STYLE;
      context.fill();
      context.strokeStyle = nodeColor;
      context.lineWidth = (boldBorder ? BORDER_WIDTH_BOLD : BORDER_WIDTH_NORMAL) * pixelRatio;
      context.stroke();
    } else {
      context.fillStyle = nodeColor;
      context.fill();
      if (boldBorder) {
        // Bold border on a solid fill: darkened outline so it stays visible.
        context.strokeStyle = cssDarkenedColor(state.style?.nodeColors, colorOffset, DEFAULT_NODE_COLOR);
        context.lineWidth = BORDER_WIDTH_BOLD * pixelRatio;
        context.stroke();
      }
    }
  }

  context.restore();
}

export function createGraphRenderer(
  canvas: GraphCanvasLike | null,
  options: GraphRendererOptions = {},
): GraphRenderer {
  const requestedBackend = options.backend ?? "auto";
  const context = requestedBackend === "canvas2d" ? null : acquireContext(canvas, options);
  const fallbackContext = context || requestedBackend === "webgl" ? null : acquire2DContext(canvas);
  const resources = context ? createRenderResources(context) : null;
  const pixelRatio = Math.max(Number.EPSILON, options.pixelRatio ?? 1);
  const activeBackend = context ? "webgl" : fallbackContext ? "canvas2d" : "none";

  // B1 Phase 1 INTERNAL CANARY: when the flag is on AND we have a WebGL2 context,
  // node shapes are drawn by the instanced-shape renderer (radius-as-radius). The
  // legacy point-sprite path stays for the default (flag off), so users on the
  // unchanged canvas2d/point-sprite path see no difference.
  const wantInstancedShapes = resolveInstancedShapes(options);
  const shapeRenderer: WebGLShapeRenderer | null =
    wantInstancedShapes && context && isWebGL2(context) ? createWebGLShapeRenderer(context) : null;
  const usesInstancedShapes = shapeRenderer !== null;
  // B1 Phase 2 INTERNAL CANARY: the SAME `instancedShapes` flag turns on the
  // WebGL2 instanced-EDGE path (thick/clip/dash/curve/arrows via capsule SDF),
  // replacing the legacy 1px `LINES`. Gated identically — the studio default
  // (canvas2d) never enters this branch, so there is no user-facing change.
  const edgeRenderer: WebGLEdgeRenderer | null =
    wantInstancedShapes && context && isWebGL2(context) ? createWebGLEdgeRenderer(context) : null;
  // Box-label measure service for the WebGL edge clip (E5). Built once; null in
  // non-DOM envs (the edge path then uses the empty-collapse box rect).
  const edgeMeasureLabelWidth = edgeRenderer ? createMeasureService() ?? undefined : undefined;
  let lastNonFiniteCount = 0;
  let state: RendererState = {
    nodeIds: [],
    positions: new Float32Array(),
    edges: new Uint32Array(),
  };
  let camera: CameraState = { x: 0, y: 0, zoom: 1 };
  let destroyed = false;

  function ensureAlive(): void {
    if (destroyed) {
      throw new Error("renderer has been destroyed");
    }
  }

  function setGraph(graph: RenderGraphInput | RenderGraphBuffers): void {
    ensureAlive();
    const nodeIds = [...graph.nodeIds];
    const positions = copyPositions(graph.positions, nodeIds.length);
    validateEdges(graph.edges, nodeIds.length);

    state = {
      nodeIds,
      positions,
      edges: new Uint32Array(graph.edges),
      nodeFlags: copyNodeFlags(graph.nodeFlags),
      attrs: graph.attrs ? new Float32Array(graph.attrs) : undefined,
    };
  }

  function setStyle(style: GraphStyleBuffers): void {
    ensureAlive();
    state = {
      ...state,
      style: copyStyle(style, state.nodeIds.length, state.edges.length / 2),
    };
  }

  function setPositions(positions: Float32Array): void {
    ensureAlive();
    state = {
      ...state,
      positions: copyPositions(positions, state.nodeIds.length),
    };
  }

  function fitView(fit: FitViewOptions): void {
    ensureAlive();
    const bounds = computePositionBounds(state.positions);
    const padding = fit.padding ?? 0;
    const innerWidth = Math.max(1, fit.viewportWidth - padding * 2);
    const innerHeight = Math.max(1, fit.viewportHeight - padding * 2);
    const width = Math.max(bounds.width, 1);
    const height = Math.max(bounds.height, 1);
    const zoom = Math.max(Number.EPSILON, Math.min(innerWidth / width, innerHeight / height));

    camera = {
      x: bounds.centerX,
      y: bounds.centerY,
      zoom,
    };
  }

  function render(options?: { skipEdges?: boolean }): void {
    ensureAlive();

    const skipEdges = options?.skipEdges ?? false;

    if (!context) {
      drawFallback2D(fallbackContext, state, camera, canvas, pixelRatio, skipEdges);
      return;
    }

    context.viewport(0, 0, canvas?.width ?? 0, canvas?.height ?? 0);
    context.clearColor(0, 0, 0, 0);
    context.clear(context.COLOR_BUFFER_BIT);
    context.enable(context.BLEND);
    context.blendFunc(context.SRC_ALPHA, context.ONE_MINUS_SRC_ALPHA);

    if (!resources) {
      return;
    }

    if (!skipEdges && state.edges.length > 0) {
      if (edgeRenderer) {
        // B1 Phase 2 INTERNAL CANARY: WebGL2 instanced edges (thick round-capped
        // capsules + clip + dash + curve + arrowheads), driven by the shared
        // render-geometry so the GL edge matches the Canvas2D edge — NOT the
        // legacy 1px `LINES`. Box/labels/picking stay on later phases / Canvas2D.
        edgeRenderer.renderEdges({
          positions: state.positions,
          nodeCount: state.nodeIds.length,
          edges: state.edges,
          style: state.style,
          camera,
          pixelRatio,
          viewportWidth: canvas?.width ?? 0,
          viewportHeight: canvas?.height ?? 0,
          measureLabelWidth: edgeMeasureLabelWidth,
        });
      } else {
        // Legacy 1px point-sprite edge path (default for users).
        context.useProgram(resources.edgeProgram.program);
        bindCameraUniforms(context, resources.edgeProgram.uniforms, camera, canvas, pixelRatio);
        uploadAttribute(
          context,
          resources.positionBuffer,
          resources.edgeProgram.attributes.position,
          buildEdgePositions(state, pixelRatio),
          2,
          context.FLOAT,
          false,
        );
        uploadAttribute(
          context,
          resources.colorBuffer,
          resources.edgeProgram.attributes.color,
          buildEdgeColors(state),
          4,
          context.UNSIGNED_BYTE,
          true,
        );
        context.drawArrays(context.LINES, 0, state.edges.length);
      }
    }

    if (state.nodeIds.length > 0) {
      if (shapeRenderer) {
        // B1 Phase 1 INTERNAL CANARY: instanced node shapes (radius-as-radius).
        // Box glyphs (shape 5), labels, and picking are NOT drawn here (later
        // phases / Canvas2D). The shared render-geometry drives the radii so the
        // GL circle matches the Canvas2D circle exactly, not the half-sprite.
        const bounds = computePositionBounds(state.positions);
        const { nonFiniteCount } = shapeRenderer.renderShapes({
          positions: state.positions,
          nodeCount: state.nodeIds.length,
          style: state.style,
          camera,
          pixelRatio,
          viewportWidth: canvas?.width ?? 0,
          viewportHeight: canvas?.height ?? 0,
          centerX: Number.isFinite(bounds.centerX) ? bounds.centerX : 0,
          centerY: Number.isFinite(bounds.centerY) ? bounds.centerY : 0,
        });
        lastNonFiniteCount = nonFiniteCount;
      } else {
        // Legacy point-sprite path (default for users).
        context.useProgram(resources.nodeProgram.program);
        bindCameraUniforms(context, resources.nodeProgram.uniforms, camera, canvas, pixelRatio);
        uploadAttribute(
          context,
          resources.positionBuffer,
          resources.nodeProgram.attributes.position,
          state.positions,
          2,
          context.FLOAT,
          false,
        );
        uploadAttribute(
          context,
          resources.colorBuffer,
          resources.nodeProgram.attributes.color,
          buildNodeColors(state),
          4,
          context.UNSIGNED_BYTE,
          true,
        );
        uploadAttribute(
          context,
          resources.sizeBuffer,
          resources.nodeProgram.attributes.size,
          buildNodeSizes(state),
          1,
          context.FLOAT,
          false,
        );
        context.drawArrays(context.POINTS, 0, state.nodeIds.length);
      }
    }
  }

  return {
    setGraph,
    setStyle,
    setPositions,
    updatePositions(frame) {
      setPositions(frame.positions);
    },
    fitView,
    setCamera(nextCamera) {
      ensureAlive();
      camera = { ...nextCamera };
    },
    render,
    snapshot(): GraphRendererSnapshot {
      return {
        nodeCount: state.nodeIds.length,
        edgeCount: state.edges.length / 2,
        positions: Array.from(state.positions),
        camera: { ...camera },
        destroyed,
        hasWebGL: context !== null,
        backend: activeBackend,
        hasStyle: state.style !== undefined,
        instancedShapes: usesInstancedShapes,
        nonFiniteCount: lastNonFiniteCount,
      };
    },
    destroy() {
      destroyed = true;
      shapeRenderer?.destroy();
      edgeRenderer?.destroy();
    },
  };
}
