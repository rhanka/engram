import { BOX_SHAPE_CODE, shapeCode } from "./shape-geometry";
import type {
  ColorInput,
  EdgeDashMode,
  GraphStyleBuffers,
  GraphStyleDefaults,
  HighLevelGraphEdge,
  HighLevelGraphInput,
  HighLevelGraphNode,
  RenderGraphBuffers,
} from "./types";

type RGBA = [number, number, number, number];

const DEFAULT_NODE_COLOR: RGBA = [77, 118, 255, 255];
const DEFAULT_EDGE_COLOR: RGBA = [121, 133, 153, 255];

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function parseHexColor(value: string): RGBA | null {
  const hex = value.trim().replace(/^#/, "");

  if (hex.length === 3) {
    const r = Number.parseInt(hex.charAt(0) + hex.charAt(0), 16);
    const g = Number.parseInt(hex.charAt(1) + hex.charAt(1), 16);
    const b = Number.parseInt(hex.charAt(2) + hex.charAt(2), 16);
    return [r, g, b, 255];
  }

  if (hex.length === 6 || hex.length === 8) {
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    const a = hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) : 255;
    return [r, g, b, a];
  }

  return null;
}

function parseColor(input: ColorInput | undefined, fallback: RGBA): RGBA {
  if (Array.isArray(input)) {
    return [
      clampByte(input[0] ?? fallback[0]),
      clampByte(input[1] ?? fallback[1]),
      clampByte(input[2] ?? fallback[2]),
      clampByte(input[3] ?? fallback[3]),
    ];
  }

  if (typeof input === "number" && Number.isFinite(input)) {
    const color = Math.trunc(input);
    return [(color >> 16) & 255, (color >> 8) & 255, color & 255, 255];
  }

  if (typeof input === "string") {
    if (input.trim().toLowerCase() === "transparent") {
      return [0, 0, 0, 0];
    }

    const parsed = parseHexColor(input);
    if (parsed) {
      return parsed;
    }
  }

  return fallback;
}

function writeColor(target: Uint8Array, offset: number, color: RGBA): void {
  target[offset] = color[0];
  target[offset + 1] = color[1];
  target[offset + 2] = color[2];
  target[offset + 3] = color[3];
}

function finiteOrDefault(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function dashCode(value: EdgeDashMode | undefined): number {
  if (value === "dashed") return 1;
  if (value === "dotted") return 2;
  if (value === "long-dash") return 3;
  return 0;
}

/**
 * Route-style code: 1 flow-port, 2 flow-port-reverse, 3/4 the arrowLESS
 * variants (git-flow fork descents draw a bare S), 0 default (back-compatible).
 */
function routeStyleCode(value: unknown): number {
  const style = String(value ?? "default").trim().toLowerCase();
  if (style === "flow-port") return 1;
  if (style === "flow-port-reverse") return 2;
  if (style === "flow-port-no-arrow") return 3;
  if (style === "flow-port-reverse-no-arrow") return 4;
  return 0;
}

/** Fill variant code: 1 hollow, 0 solid (default — back-compatible). */
function fillCode(value: unknown): number {
  return String(value ?? "solid").trim().toLowerCase() === "hollow" ? 1 : 0;
}

/** Border weight code: 1 bold, 0 normal (default — back-compatible). */
function borderCode(value: unknown): number {
  return String(value ?? "normal").trim().toLowerCase() === "bold" ? 1 : 0;
}

/**
 * Fraction of the maximum node degree a box node must reach for its label to be
 * drawn. Mirrors the legacy vis-network behaviour where only the central hubs
 * show text; low-degree boxes stay empty.
 */
const LABEL_DEGREE_FRACTION = 0.15;

/** Node type for the god-class ranking: `node_type` wins, then `type`. */
function nodeTypeOf(node: HighLevelGraphNode | undefined): string | null {
  const raw = node?.node_type ?? node?.type;
  return typeof raw === "string" && raw ? raw : null;
}

/**
 * Data-driven "god-class" (UAT box-label): the node type whose nodes carry the
 * highest degrees. Types are ranked by their MAXIMUM node degree (the class
 * owning the global highest-degree node — Character/Sherlock in the mystery
 * corpus), tie-broken by the count of nodes above the label gate
 * (degree >= LABEL_DEGREE_FRACTION × maxDegree), then by type name for
 * determinism. Only god-class boxes get the in-box label; box glyphs of other
 * types (Work / ChapterOrStory) render as small empty boxes. Returns null when
 * the graph has no edges or no typed nodes — then the legacy degree-only gate
 * applies (back-compatible for untyped inputs).
 */
function computeGodClassType(
  nodesById: Map<string, HighLevelGraphNode>,
  graph: RenderGraphBuffers,
  degrees: Uint32Array,
  maxDegree: number,
): string | null {
  if (!(maxDegree > 0)) return null;
  const threshold = LABEL_DEGREE_FRACTION * maxDegree;
  const byType = new Map<string, { maxDeg: number; gateCount: number }>();
  graph.nodeIds.forEach((nodeId, index) => {
    const type = nodeTypeOf(nodesById.get(nodeId));
    if (!type) return;
    const deg = degrees[index] ?? 0;
    let rec = byType.get(type);
    if (!rec) byType.set(type, (rec = { maxDeg: 0, gateCount: 0 }));
    if (deg > rec.maxDeg) rec.maxDeg = deg;
    if (deg >= threshold) rec.gateCount += 1;
  });
  let best: string | null = null;
  let bestRec: { maxDeg: number; gateCount: number } | null = null;
  for (const [type, rec] of byType) {
    if (
      bestRec === null ||
      rec.maxDeg > bestRec.maxDeg ||
      (rec.maxDeg === bestRec.maxDeg &&
        (rec.gateCount > bestRec.gateCount ||
          (rec.gateCount === bestRec.gateCount && best !== null && type < best)))
    ) {
      best = type;
      bestRec = rec;
    }
  }
  return best;
}

/** Undirected degree per node index, computed from the render-graph edges. */
function computeNodeDegrees(graph: RenderGraphBuffers): { degrees: Uint32Array; maxDegree: number } {
  const degrees = new Uint32Array(graph.nodeIds.length);
  for (let i = 0; i < graph.edges.length; i += 1) {
    const endpoint = graph.edges[i];
    if (endpoint !== undefined && endpoint < degrees.length) {
      degrees[endpoint] = (degrees[endpoint] ?? 0) + 1;
    }
  }
  let maxDegree = 0;
  for (let i = 0; i < degrees.length; i += 1) {
    if (degrees[i]! > maxDegree) maxDegree = degrees[i]!;
  }
  return { degrees, maxDegree };
}

export function buildStyleBuffers(
  input: HighLevelGraphInput,
  graph: RenderGraphBuffers,
  defaults: GraphStyleDefaults = {},
): GraphStyleBuffers {
  const nodeDefaults = {
    size: defaults.node?.size ?? 4,
    color: parseColor(defaults.node?.color, DEFAULT_NODE_COLOR),
  };
  const edgeDefaults = {
    width: defaults.edge?.width ?? 1,
    color: parseColor(defaults.edge?.color, DEFAULT_EDGE_COLOR),
    dash: defaults.edge?.dash ?? "solid",
    curvature: defaults.edge?.curvature ?? 0,
  };

  const nodesById = new Map<string, HighLevelGraphNode>();
  input.nodes.forEach((node) => nodesById.set(node.id, node));

  const nodeSizes = new Float32Array(graph.nodeIds.length);
  const nodeColors = new Uint8Array(graph.nodeIds.length * 4);
  const nodeShapes = new Uint8Array(graph.nodeIds.length);
  // Shape variants (additive): hollow-vs-solid fill and bold-vs-normal border.
  const nodeFills = new Uint8Array(graph.nodeIds.length);
  const nodeBorders = new Uint8Array(graph.nodeIds.length);
  // Per-node label text, only ever populated for box-category nodes that pass
  // the degree gate (legacy `shape:box` parity); "" for everything else.
  const nodeLabels = new Array<string>(graph.nodeIds.length).fill("");

  const { degrees, maxDegree } = computeNodeDegrees(graph);
  const labelDegreeThreshold = LABEL_DEGREE_FRACTION * maxDegree;
  const godClass = computeGodClassType(nodesById, graph, degrees, maxDegree);

  graph.nodeIds.forEach((nodeId, index) => {
    const node = nodesById.get(nodeId);
    nodeSizes[index] = finiteOrDefault(node?.size, nodeDefaults.size);
    writeColor(nodeColors, index * 4, parseColor(node?.color, nodeDefaults.color));
    const shape = shapeCode(node?.shape);
    nodeShapes[index] = shape;
    nodeFills[index] = fillCode(node?.fill);
    nodeBorders[index] = borderCode(node?.border);

    // Label gate: box glyph + central (degree >= 15% of max) + god-class.
    // The in-box label is reserved to the hub class (the type owning the
    // highest-degree node); when no god-class is determinable (untyped input)
    // the legacy degree-only gate applies.
    if (
      shape === BOX_SHAPE_CODE &&
      (degrees[index] ?? 0) >= labelDegreeThreshold &&
      (godClass === null || nodeTypeOf(node) === godClass)
    ) {
      const label = typeof node?.label === "string" ? node.label : "";
      if (label) nodeLabels[index] = label;
    }
  });

  const edgeCount = graph.edges.length / 2;
  const edgeWidths = new Float32Array(edgeCount);
  const edgeColors = new Uint8Array(edgeCount * 4);
  const edgeDash = new Uint8Array(edgeCount);
  const edgeCurvatures = new Float32Array(edgeCount);
  const edgeRouteStyles = new Uint8Array(edgeCount);
  let hasRouteStyles = false;

  for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex += 1) {
    const sourceIndex = graph.edgeInputIndices?.[edgeIndex] ?? edgeIndex;
    const edge: HighLevelGraphEdge | undefined = input.edges[sourceIndex];

    edgeWidths[edgeIndex] = finiteOrDefault(edge?.width, edgeDefaults.width);
    writeColor(edgeColors, edgeIndex * 4, parseColor(edge?.color, edgeDefaults.color));
    edgeDash[edgeIndex] = dashCode(edge?.dash ?? edgeDefaults.dash);
    edgeCurvatures[edgeIndex] = finiteOrDefault(edge?.curvature, edgeDefaults.curvature);
    const routeCode = routeStyleCode(edge?.edge_style);
    edgeRouteStyles[edgeIndex] = routeCode;
    if (routeCode !== 0) hasRouteStyles = true;
  }

  return {
    nodeSizes,
    nodeColors,
    nodeShapes,
    nodeLabels,
    nodeFills,
    nodeBorders,
    edgeWidths,
    edgeColors,
    edgeDash,
    edgeCurvatures,
    // Only attached when some edge actually opts into a flow-port route, so an
    // input without edge_style produces the EXACT historical buffer shape.
    ...(hasRouteStyles ? { edgeRouteStyles } : {}),
  };
}
