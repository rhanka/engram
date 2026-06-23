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
  /** Glyph fill variant: "solid" (default) or "hollow" (outline only). */
  fill?: "solid" | "hollow" | string;
  /** Glyph border weight: "normal" (default) or "bold". */
  border?: "normal" | "bold" | string;
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
  /**
   * Optional per-node label text drawn INSIDE the glyph by the Canvas2D
   * fallback (legacy `shape:box` parity). Populated ONLY for box-category
   * nodes that pass the degree gate; "" for every other node. When omitted,
   * box nodes render as empty rounded rectangles.
   */
  nodeLabels?: string[];
  /**
   * Optional per-node fill variant: 0 solid (default), 1 hollow (outline-only
   * glyph: translucent fill + node-coloured border). Drawn by the Canvas2D
   * backend; the WebGL point-sprite path ignores it.
   */
  nodeFills?: Uint8Array;
  /**
   * Optional per-node border weight: 0 normal (default), 1 bold (heavier
   * outline). Drawn by the Canvas2D backend; WebGL ignores it.
   */
  nodeBorders?: Uint8Array;
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
  /**
   * INTERNAL CANARY (B1 migration Phase 1). When true AND the active backend is
   * WebGL2, node glyphs are drawn with the new INSTANCED-SHAPE path
   * (`webgl-shapes.ts`: instanced discs/polygons, radius-as-radius) instead of
   * the legacy point-sprite path. Defaults to the resolved `GRAPHIFY_RENDER_BACKEND`
   * flag, which is `false` (legacy) for users — so there is no user-facing
   * change. Edges, the box glyph, labels, and picking stay on the legacy /
   * Canvas2D path in Phase 1.
   */
  instancedShapes?: boolean;
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
  /**
   * Whether the new INSTANCED-SHAPE WebGL path drew this renderer's nodes
   * (B1 Phase 1 internal canary). False on the Canvas2D / legacy point-sprite
   * paths.
   */
  instancedShapes?: boolean;
  /**
   * Count of non-finite world coordinates coerced at the geometry boundary in
   * the LAST render (N1b / R13). Surfaced so a NaN/±Inf position is never
   * silently swallowed by the WebGL backend.
   */
  nonFiniteCount?: number;
  layoutOptions?: undefined;
}

export interface GraphRenderer {
  setGraph(graph: RenderGraphInput | RenderGraphBuffers): void;
  setStyle(style: GraphStyleBuffers): void;
  setPositions(positions: Float32Array): void;
  updatePositions(frame: PositionFrame): void;
  fitView(options: FitViewOptions): void;
  setCamera(camera: CameraState): void;
  render(options?: { skipEdges?: boolean }): void;
  snapshot(): GraphRendererSnapshot;
  destroy(): void;
}
