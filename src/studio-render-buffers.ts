import {
  buildRenderGraphBuffers,
  buildStyleBuffers,
} from "@sentropic/graph";

import type {
  EdgeDashMode,
  GraphStyleBuffers,
  HighLevelGraphInput,
  RenderGraphBuffers,
} from "@sentropic/graph";

import type { StudioScene } from "./studio-scene.js";

export type StudioRenderEdgeDash = EdgeDashMode;

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

export type StudioRenderGraphBuffers = RenderGraphBuffers;
export type StudioRenderStyleBuffers = GraphStyleBuffers;

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

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function resolvePosition(node: StudioRenderSceneNode): { x: number; y: number } {
  const x = finiteNumber(node.x) ? node.x : finiteNumber(node.fx) ? node.fx : undefined;
  const y = finiteNumber(node.y) ? node.y : finiteNumber(node.fy) ? node.fy : undefined;
  if (!finiteNumber(x) || !finiteNumber(y)) {
    throw new Error(`node ${node.id} is missing finite x/y positions or fx/fy pins`);
  }
  return { x, y };
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

  const nodes: HighLevelGraphInput["nodes"] = scene.nodes.map((node) => {
    const position = resolvePosition(node);

    return {
      id: node.id,
      label: node.label,
      x: position.x,
      y: position.y,
      fx: finiteNumber(node.fx) ? node.fx : undefined,
      fy: finiteNumber(node.fy) ? node.fy : undefined,
      fixed: node.fixed === true || (finiteNumber(node.fx) && finiteNumber(node.fy)),
      shape: node.shape,
      size: nodeSize(node, resolved.nodeRadius),
    };
  });

  const edges: HighLevelGraphInput["edges"] = scene.edges.map((edge) => ({
    source: edge.source,
    target: edge.target,
    label: edge.relation,
    dash: edgeDash(edge),
    width: edgeWidth(edge, resolved),
    curvature: finiteNumber(edge.curvature) ? edge.curvature : resolved.edgeCurvature,
  }));

  const highLevelGraph: HighLevelGraphInput = {
    nodes,
    edges,
  };
  const renderGraph = buildRenderGraphBuffers(highLevelGraph);
  const style = buildStyleBuffers(highLevelGraph, renderGraph, {
    node: { size: resolved.nodeRadius },
    edge: {
      width: resolved.edgeWidth,
      dash: "solid",
      curvature: resolved.edgeCurvature,
    },
  });

  let weakEdgeCount = 0;
  for (const inputIndex of renderGraph.edgeInputIndices ?? []) {
    if (scene.edges[inputIndex]?.weak) weakEdgeCount += 1;
  }

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
