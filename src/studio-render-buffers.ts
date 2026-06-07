import type { StudioScene } from "./studio-scene.js";

export type StudioRenderEdgeDash = "solid" | "dashed" | "dotted" | "long-dash";

export interface StudioRenderSceneNode {
  id: string;
  label: string;
  weight: number;
  shape: string;
  group?: string;
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
  fixed?: boolean;
  [key: string]: unknown;
}

export interface StudioRenderSceneEdge {
  source: string;
  target: string;
  relation?: string;
  dash?: StudioRenderEdgeDash;
  weak?: true;
  emphasis?: boolean;
  width?: number;
  curvature?: number;
  [key: string]: unknown;
}

export interface StudioRenderScene extends Omit<StudioScene, "nodes" | "edges"> {
  nodes: StudioRenderSceneNode[];
  edges: StudioRenderSceneEdge[];
}

export interface StudioRenderGraphBuffers {
  nodeIds: string[];
  idToIndex: Map<string, number>;
  positions: Float32Array;
  edges: Uint32Array;
  edgeInputIndices?: Uint32Array;
  droppedEdges: number;
  nodeFlags?: { fixed: Uint8Array };
  attrs?: Float32Array;
}

export interface StudioRenderStyleBuffers {
  nodeSizes: Float32Array;
  nodeColors: Uint8Array;
  edgeWidths: Float32Array;
  edgeColors: Uint8Array;
  edgeDash: Uint8Array;
  edgeCurvatures: Float32Array;
}

export interface StudioRenderBufferStats {
  nodeCount: number;
  edgeCount: number;
  droppedEdgeCount: number;
  weakEdgeCount: number;
}

export interface StudioRenderBufferPayload {
  renderer: "sentropic-graph";
  renderGraph: StudioRenderGraphBuffers;
  style: StudioRenderStyleBuffers;
  stats: StudioRenderBufferStats;
}

export interface BuildStudioRenderBuffersOptions {
  nodeRadius?: number;
  edgeWidth?: number;
  weakEdgeWidth?: number;
  emphasisEdgeWidth?: number;
  edgeCurvature?: number;
}

type RGBA = [number, number, number, number];

const DEFAULT_NODE_COLOR: RGBA = [77, 118, 255, 255];
const DEFAULT_EDGE_COLOR: RGBA = [121, 133, 153, 255];

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function assertKnownPosition(node: StudioRenderSceneNode): void {
  if (!finiteNumber(node.x) || !finiteNumber(node.y)) {
    throw new Error(`node ${node.id} is missing finite x/y positions`);
  }
}

function nodeSize(node: StudioRenderSceneNode, radius: number): number {
  const weight = finiteNumber(node.weight) && node.weight > 0 ? node.weight : 1;
  return radius * Math.sqrt(weight);
}

function edgeDash(edge: StudioRenderSceneEdge): StudioRenderEdgeDash {
  if (
    edge.dash === "solid" ||
    edge.dash === "dashed" ||
    edge.dash === "dotted" ||
    edge.dash === "long-dash"
  ) {
    return edge.dash;
  }
  return edge.weak ? "dotted" : "solid";
}

function edgeWidth(edge: StudioRenderSceneEdge, options: Required<BuildStudioRenderBuffersOptions>): number {
  if (finiteNumber(edge.width) && edge.width > 0) return edge.width;
  if (edge.emphasis) return options.emphasisEdgeWidth;
  if (edge.weak) return options.weakEdgeWidth;
  return options.edgeWidth;
}

function dashCode(value: StudioRenderEdgeDash): number {
  if (value === "dashed") return 1;
  if (value === "dotted") return 2;
  if (value === "long-dash") return 3;
  return 0;
}

function writeColor(target: Uint8Array, offset: number, color: RGBA): void {
  target[offset] = color[0];
  target[offset + 1] = color[1];
  target[offset + 2] = color[2];
  target[offset + 3] = color[3];
}

function normalizeOptions(
  options: BuildStudioRenderBuffersOptions,
): Required<BuildStudioRenderBuffersOptions> {
  return {
    nodeRadius: options.nodeRadius ?? 3,
    edgeWidth: options.edgeWidth ?? 1,
    weakEdgeWidth: options.weakEdgeWidth ?? 0.75,
    emphasisEdgeWidth: options.emphasisEdgeWidth ?? 2.5,
    edgeCurvature: options.edgeCurvature ?? 0.15,
  };
}

export function buildStudioRenderBuffers(
  scene: StudioRenderScene,
  options: BuildStudioRenderBuffersOptions = {},
): StudioRenderBufferPayload {
  const resolved = normalizeOptions(options);

  const nodeIds: string[] = [];
  const idToIndex = new Map<string, number>();
  const positions = new Float32Array(scene.nodes.length * 2);
  const fixed = new Uint8Array(scene.nodes.length);
  let hasFixed = false;
  const nodeSizes = new Float32Array(scene.nodes.length);
  const nodeColors = new Uint8Array(scene.nodes.length * 4);

  scene.nodes.forEach((node, index) => {
    assertKnownPosition(node);

    if (idToIndex.has(node.id)) {
      throw new Error(`duplicate node id: ${node.id}`);
    }

    nodeIds.push(node.id);
    idToIndex.set(node.id, index);
    positions[index * 2] = node.x as number;
    positions[index * 2 + 1] = node.y as number;

    if (
      node.fixed === true ||
      (finiteNumber(node.fx) && finiteNumber(node.fy))
    ) {
      fixed[index] = 1;
      hasFixed = true;
    }

    nodeSizes[index] = nodeSize(node, resolved.nodeRadius);
    writeColor(nodeColors, index * 4, DEFAULT_NODE_COLOR);
  });

  const edgeIndices: number[] = [];
  const edgeInputIndices: number[] = [];
  let droppedEdges = 0;

  for (let inputIndex = 0; inputIndex < scene.edges.length; inputIndex += 1) {
    const edge = scene.edges[inputIndex];
    if (!edge) continue;
    const source = idToIndex.get(edge.source);
    const target = idToIndex.get(edge.target);

    if (source === undefined || target === undefined) {
      droppedEdges += 1;
      continue;
    }

    edgeIndices.push(source, target);
    edgeInputIndices.push(inputIndex);
  }

  const edgeCount = edgeInputIndices.length;
  const edgeWidths = new Float32Array(edgeCount);
  const edgeColors = new Uint8Array(edgeCount * 4);
  const edgeDashBuffer = new Uint8Array(edgeCount);
  const edgeCurvatures = new Float32Array(edgeCount);
  let weakEdgeCount = 0;

  edgeInputIndices.forEach((inputIndex, edgeIndex) => {
    const edge = scene.edges[inputIndex] as StudioRenderSceneEdge;
    edgeWidths[edgeIndex] = edgeWidth(edge, resolved);
    writeColor(edgeColors, edgeIndex * 4, DEFAULT_EDGE_COLOR);
    edgeDashBuffer[edgeIndex] = dashCode(edgeDash(edge));
    edgeCurvatures[edgeIndex] = finiteNumber(edge.curvature)
      ? edge.curvature
      : resolved.edgeCurvature;
    if (edge.weak) weakEdgeCount += 1;
  });

  const renderGraph: StudioRenderGraphBuffers = {
    nodeIds,
    idToIndex,
    positions,
    edges: new Uint32Array(edgeIndices),
    edgeInputIndices: new Uint32Array(edgeInputIndices),
    droppedEdges,
  };
  if (hasFixed) renderGraph.nodeFlags = { fixed };

  const style: StudioRenderStyleBuffers = {
    nodeSizes,
    nodeColors,
    edgeWidths,
    edgeColors,
    edgeDash: edgeDashBuffer,
    edgeCurvatures,
  };

  return {
    renderer: "sentropic-graph",
    renderGraph,
    style,
    stats: {
      nodeCount: renderGraph.nodeIds.length,
      edgeCount: renderGraph.edges.length / 2,
      droppedEdgeCount: renderGraph.droppedEdges,
      weakEdgeCount,
    },
  };
}
