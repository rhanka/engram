import { computePositionBounds, copyPositions } from "./positions";
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

function acquireContext(canvas: GraphCanvasLike | null, options: GraphRendererOptions): GraphContext | null {
  if (!canvas) {
    return null;
  }

  try {
    const contextOptions = {
      antialias: options.antialias ?? false,
      preserveDrawingBuffer: false,
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

function buildEdgePositions(state: RendererState): Float32Array {
  const positions = new Float32Array(state.edges.length * 2);
  let cursor = 0;

  for (let edgeIndex = 0; edgeIndex < state.edges.length; edgeIndex += 2) {
    const sourceIndex = state.edges[edgeIndex] ?? 0;
    const targetIndex = state.edges[edgeIndex + 1] ?? 0;
    const sourceOffset = sourceIndex * 2;
    const targetOffset = targetIndex * 2;

    positions[cursor++] = state.positions[sourceOffset] ?? 0;
    positions[cursor++] = state.positions[sourceOffset + 1] ?? 0;
    positions[cursor++] = state.positions[targetOffset] ?? 0;
    positions[cursor++] = state.positions[targetOffset + 1] ?? 0;
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

const STAR_INNER_RATIO = 0.42;
const EDGE_CURVE_FACTOR = 0.5;

// Legacy vis-network `shape:box` parity. The box IS the node glyph drawn by the
// Canvas2D fallback: a label-sized rounded rectangle, white-translucent fill,
// node-coloured border, dark centred text. Dimensions derive from the label
// measured AT THE RENDERED (zoom-scaled) font — never from nodeSizes — so box
// glyphs ignore the selection size multiplier and the box always hugs its text.
const BOX_SHAPE = 5;
const BOX_FONT_PX = 12; // base font size, scaled by pixelRatio * camera.zoom
const BOX_MARGIN = 5; // padding around the text, in base (pre-scale) px
const BOX_CORNER = 6; // corner radius, in base (pre-scale) px
const BOX_FILL: readonly [number, number, number, number] = [255, 255, 255, 0.5 * 255];
const BOX_TEXT_COLOR = "#0f172a"; // theme-dark label text (slate-900)
// Side of an empty (low-degree, label hidden) box in base px: legacy boxes
// collapse to their margins when the font is hidden (fontSize 0), i.e. 2*margin.
const BOX_EMPTY_SIZE = 2 * BOX_MARGIN;

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
  if (shape === 1) {
    const diagonal = radius;
    pathPolygon(context, x, y, [
      [0, -diagonal],
      [diagonal, 0],
      [0, diagonal],
      [-diagonal, 0],
    ]);
    return;
  }

  if (shape === 2) {
    const outer = radius;
    const inner = outer * STAR_INNER_RATIO;
    const points: Array<[number, number]> = [];
    for (let index = 0; index < 10; index += 1) {
      const angle = (index * Math.PI) / 5 - Math.PI / 2;
      const r = index % 2 === 0 ? outer : inner;
      points.push([Math.cos(angle) * r, Math.sin(angle) * r]);
    }
    pathPolygon(context, x, y, points);
    return;
  }

  if (shape === 3) {
    const circumradius = radius;
    const points: Array<[number, number]> = [];
    for (let index = 0; index < 6; index += 1) {
      const angle = (index * Math.PI) / 3 - Math.PI / 6;
      points.push([Math.cos(angle) * circumradius, Math.sin(angle) * circumradius]);
    }
    pathPolygon(context, x, y, points);
    return;
  }

  if (shape === 4) {
    const half = radius * 0.88;
    pathPolygon(context, x, y, [
      [-half, -half],
      [half, -half],
      [half, half],
      [-half, half],
    ]);
    return;
  }

  if (shape === 5) {
    const side = radius * 0.88 * 2;
    drawRoundedBox(context, x, y, side, side, radius * 0.88 * 0.6);
    return;
  }

  if (shape === 6) {
    const circumradius = radius;
    const points: Array<[number, number]> = [];
    for (let index = 0; index < 3; index += 1) {
      const angle = (index * 2 * Math.PI) / 3 - Math.PI / 2;
      points.push([Math.cos(angle) * circumradius, Math.sin(angle) * circumradius]);
    }
    pathPolygon(context, x, y, points);
    return;
  }

  context.arc(x, y, radius, 0, Math.PI * 2);
}

/**
 * Draw a single legacy `shape:box` glyph (vis-network parity).
 *
 * - Eligible (central) box: a label-sized rounded rectangle with a
 *   white-translucent fill, the node colour as border, and the dark label
 *   text centred inside. Width comes from `measureText(label)` AT THE RENDERED
 *   font (12 * pixelRatio * camera.zoom) plus a 5px (scaled) margin per side;
 *   height is fontPx + 2 margins. It NEVER reads nodeSizes, so the selection
 *   size multiplier does not inflate the box and the text always fits snugly.
 * - Non-eligible (low-degree / non-labelled) box: a small EMPTY rounded rect
 *   (2 * margin per side — the legacy hidden-font collapse), no text.
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
  scale: number,
  pixelRatio: number,
  label: string,
  borderColor: string,
  alpha: number,
  measureLabelWidth: (text: string, font: string) => number,
): void {
  const fillStyle = `rgba(${BOX_FILL[0]}, ${BOX_FILL[1]}, ${BOX_FILL[2]}, ${BOX_FILL[3] / 255})`;
  const lineWidth = 1.5 * pixelRatio;
  const margin = BOX_MARGIN * scale;
  const corner = BOX_CORNER * scale;

  context.save();
  context.globalAlpha = alpha;

  if (label) {
    const fontPx = BOX_FONT_PX * scale;
    const font = `${fontPx}px sans-serif`;
    // Measure at the RENDERED font: the box is sized to the exact text it draws.
    const textW = measureLabelWidth(label, font);
    const w = textW + 2 * margin;
    const h = fontPx + 2 * margin;

    context.beginPath();
    drawRoundedBox(context, x, y, w, h, corner);
    context.fillStyle = fillStyle;
    context.fill();
    context.strokeStyle = borderColor;
    context.lineWidth = lineWidth;
    context.stroke();

    context.fillStyle = BOX_TEXT_COLOR;
    context.font = font;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(label, x, y);
  } else {
    const side = BOX_EMPTY_SIZE * scale;
    context.beginPath();
    drawRoundedBox(context, x, y, side, side, corner);
    context.fillStyle = fillStyle;
    context.fill();
    context.strokeStyle = borderColor;
    context.lineWidth = lineWidth;
    context.stroke();
  }

  context.restore();
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

  const edgeCount = skipEdges ? 0 : state.edges.length / 2;
  for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex += 1) {
    const sourceIndex = state.edges[edgeIndex * 2] ?? 0;
    const targetIndex = state.edges[edgeIndex * 2 + 1] ?? 0;
    const source = screenPoint(state.positions, sourceIndex, camera, canvas);
    const target = screenPoint(state.positions, targetIndex, camera, canvas);
    const curvature = state.style?.edgeCurvatures[edgeIndex] ?? 0;
    const width = state.style?.edgeWidths[edgeIndex] ?? 1;
    const colorOffset = edgeIndex * 4;

    context.beginPath();
    context.strokeStyle = cssColor(state.style?.edgeColors, colorOffset, DEFAULT_EDGE_COLOR);
    context.lineWidth = Math.max(1, width * pixelRatio);
    applyDash(context, state.style?.edgeDash[edgeIndex] ?? 0, pixelRatio);
    context.moveTo(source.x, source.y);
    if (curvature !== 0) {
      const midX = (source.x + target.x) / 2;
      const midY = (source.y + target.y) / 2;
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const controlX = midX + (-dy / distance) * distance * curvature * EDGE_CURVE_FACTOR;
      const controlY = midY + (dx / distance) * distance * curvature * EDGE_CURVE_FACTOR;
      context.quadraticCurveTo(controlX, controlY, target.x, target.y);
    } else {
      context.lineTo(target.x, target.y);
    }
    context.stroke();
  }
  context.setLineDash([]);

  // Legacy `shape:box` parity: measure each distinct label AT THE RENDERED
  // (zoom-scaled) font so the box hugs the exact text it draws. The cache is
  // per-frame and keyed by font + text (the scale is uniform across nodes, but
  // keying defensively keeps the cache correct if that ever changes).
  const labelWidthCache = new Map<string, number>();
  const boxScale = pixelRatio * camera.zoom;
  const measureLabelWidth = (text: string, font: string): number => {
    const key = `${font}|${text}`;
    const cached = labelWidthCache.get(key);
    if (cached !== undefined) return cached;
    context.font = font;
    const width = context.measureText(text).width;
    labelWidthCache.set(key, width);
    return width;
  };

  for (let nodeIndex = 0; nodeIndex < state.nodeIds.length; nodeIndex += 1) {
    const point = screenPoint(state.positions, nodeIndex, camera, canvas);
    const colorOffset = nodeIndex * 4;
    const shape = state.style?.nodeShapes[nodeIndex] ?? 0;
    const nodeColor = cssColor(state.style?.nodeColors, colorOffset, DEFAULT_NODE_COLOR);

    if (shape === BOX_SHAPE) {
      // The box IS the glyph. Size from the label (or a small empty rect for
      // low-degree boxes), never from nodeSizes — so the selection size
      // multiplier is ignored. Border = node colour (encodes selection/hover);
      // alpha follows the node's payload alpha so dim / merge styling applies.
      const label = state.style?.nodeLabels?.[nodeIndex] ?? "";
      const alpha = (state.style?.nodeColors[colorOffset + 3] ?? 255) / 255;
      drawBoxNode(context, point.x, point.y, boxScale, pixelRatio, label, nodeColor, alpha, measureLabelWidth);
      continue;
    }

    // World-space sizing for legacy ForceGraph parity: glyphs scale with camera zoom.
    const radius = Math.max(1, (state.style?.nodeSizes[nodeIndex] ?? 4) * pixelRatio * camera.zoom);

    context.beginPath();
    context.fillStyle = nodeColor;
    drawNodeShapePath(context, point.x, point.y, radius, shape);
    context.fill();
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
      context.useProgram(resources.edgeProgram.program);
      bindCameraUniforms(context, resources.edgeProgram.uniforms, camera, canvas, pixelRatio);
      uploadAttribute(
        context,
        resources.positionBuffer,
        resources.edgeProgram.attributes.position,
        buildEdgePositions(state),
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

    if (state.nodeIds.length > 0) {
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
      };
    },
    destroy() {
      destroyed = true;
    },
  };
}
