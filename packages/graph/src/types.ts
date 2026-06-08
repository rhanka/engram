export type NodeId = string;
export type ColorInput = string | number | readonly [number, number, number] | readonly [number, number, number, number];
export type EdgeDashMode = "solid" | "dashed" | "dotted" | "long-dash";
export type GraphNodeShape =
  | "dot"
  | "circle"
  | "diamond"
  | "star"
  | "hexagon"
  | "box"
  | "square"
  | "roundedbox"
  | "triangle";
export type GraphRendererBackend = "auto" | "webgl" | "canvas2d";
export type GraphRendererActiveBackend = "webgl" | "canvas2d" | "none";

export interface HighLevelGraphNode {
  id: NodeId;
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
  fixed?: boolean;
  size?: number;
  color?: string | number;
  shape?: GraphNodeShape | string;
  label?: string;
  [key: string]: unknown;
}

export interface HighLevelGraphEdge {
  source: NodeId;
  target: NodeId;
  weight?: number;
  label?: string;
  width?: number;
  color?: ColorInput;
  dash?: EdgeDashMode;
  curvature?: number;
  [key: string]: unknown;
}

export interface HighLevelGraphInput {
  nodes: readonly HighLevelGraphNode[];
  edges: readonly HighLevelGraphEdge[];
}

export interface NodeFlags {
  fixed: Uint8Array;
}

export interface RenderGraphBuffers {
  nodeIds: NodeId[];
  idToIndex: Map<NodeId, number>;
  positions: Float32Array;
  edges: Uint32Array;
  edgeInputIndices?: Uint32Array;
  droppedEdges: number;
  nodeFlags?: NodeFlags;
  attrs?: Float32Array;
}

export interface RenderGraphInput {
  nodeIds: readonly NodeId[];
  positions: Float32Array;
  edges: Uint32Array;
  nodeFlags?: NodeFlags;
  attrs?: Float32Array;
}

export interface GraphStyleBuffers {
  nodeSizes: Float32Array;
  nodeColors: Uint8Array;
  nodeShapes: Uint8Array;
  edgeWidths: Float32Array;
  edgeColors: Uint8Array;
  edgeDash: Uint8Array;
  edgeCurvatures: Float32Array;
}

export interface GraphStyleDefaults {
  node?: {
    size?: number;
    color?: ColorInput;
  };
  edge?: {
    width?: number;
    color?: ColorInput;
    dash?: EdgeDashMode;
    curvature?: number;
  };
}

export interface PositionBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export interface PositionFrameMeta {
  alpha?: number;
  tick?: number;
  changed?: Uint32Array;
}

export interface PositionFrame extends PositionFrameMeta {
  positions: Float32Array;
}

export interface LayoutOptions {
  repulsion?: number;
  theta?: number;
  iterations?: number;
  seed?: string | number;
  pinnedIds?: readonly NodeId[];
  pinMask?: Uint8Array;
  pinPositions?: Float32Array;
}

export interface LayoutEngine {
  run(graph: RenderGraphBuffers, options?: LayoutOptions): Iterable<PositionFrame> | AsyncIterable<PositionFrame>;
}

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

export interface FitViewOptions {
  padding?: number;
  viewportWidth: number;
  viewportHeight: number;
}

export interface GraphRendererOptions {
  backend?: GraphRendererBackend;
  antialias?: boolean;
  pixelRatio?: number;
  interaction?: {
    hover?: boolean;
    pan?: boolean;
    zoom?: boolean;
  };
  style?: {
    nodeSize?: number;
    edgeWidth?: number;
  };
}

export interface GraphRendererSnapshot {
  nodeCount: number;
  edgeCount: number;
  positions: number[];
  camera: CameraState;
  destroyed: boolean;
  hasWebGL: boolean;
  backend: GraphRendererActiveBackend;
  hasStyle: boolean;
  layoutOptions?: undefined;
}

export interface GraphRenderer {
  setGraph(graph: RenderGraphInput | RenderGraphBuffers): void;
  setStyle(style: GraphStyleBuffers): void;
  setPositions(positions: Float32Array): void;
  updatePositions(frame: PositionFrame): void;
  fitView(options: FitViewOptions): void;
  setCamera(camera: CameraState): void;
  render(): void;
  snapshot(): GraphRendererSnapshot;
  destroy(): void;
}
