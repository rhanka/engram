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

function shapeCode(value: unknown): number {
  const shape = String(value ?? "dot").trim().toLowerCase();
  if (shape === "diamond") return 1;
  if (shape === "star") return 2;
  if (shape === "hexagon") return 3;
  if (shape === "box" || shape === "square") return 4;
  if (shape === "roundedbox") return 5;
  if (shape === "triangle") return 6;
  return 0;
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

  graph.nodeIds.forEach((nodeId, index) => {
    const node = nodesById.get(nodeId);
    nodeSizes[index] = finiteOrDefault(node?.size, nodeDefaults.size);
    writeColor(nodeColors, index * 4, parseColor(node?.color, nodeDefaults.color));
    nodeShapes[index] = shapeCode(node?.shape);
  });

  const edgeCount = graph.edges.length / 2;
  const edgeWidths = new Float32Array(edgeCount);
  const edgeColors = new Uint8Array(edgeCount * 4);
  const edgeDash = new Uint8Array(edgeCount);
  const edgeCurvatures = new Float32Array(edgeCount);

  for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex += 1) {
    const sourceIndex = graph.edgeInputIndices?.[edgeIndex] ?? edgeIndex;
    const edge: HighLevelGraphEdge | undefined = input.edges[sourceIndex];

    edgeWidths[edgeIndex] = finiteOrDefault(edge?.width, edgeDefaults.width);
    writeColor(edgeColors, edgeIndex * 4, parseColor(edge?.color, edgeDefaults.color));
    edgeDash[edgeIndex] = dashCode(edge?.dash ?? edgeDefaults.dash);
    edgeCurvatures[edgeIndex] = finiteOrDefault(edge?.curvature, edgeDefaults.curvature);
  }

  return {
    nodeSizes,
    nodeColors,
    nodeShapes,
    edgeWidths,
    edgeColors,
    edgeDash,
    edgeCurvatures,
  };
}
