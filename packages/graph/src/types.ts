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
  /**
   * Optional per-edge ROUTE style (additive; absent ⇒ the historical
   * centre-to-centre routing, golden-stable):
   *   • `"flow-port"`         — the edge EXITS the source node at its RIGHT port
   *     (x + radius) and ENTERS the target node at its LEFT port (x − radius),
   *     routed as a horizontal-dominant smooth S (GitKraken / gitgraph.js
   *     style); the arrowhead sits on the target's left port pointing RIGHT.
   *     Git-flow MERGE connectors (branch tip → merge commit) use this.
   *   • `"flow-port-reverse"` — same routing with the ENDPOINTS SWAPPED before
   *     drawing. Used for edges whose data direction is new→old (e.g. git
   *     `commit-parent` child→parent) so the DRAWN edge still flows old→new
   *     (left→right) with the arrow on the newer node.
   *   • `"flow-port-no-arrow"` / `"flow-port-reverse-no-arrow"` — identical
   *     routing WITHOUT the arrowhead: the git-flow FORK descent (branch-off)
   *     is a bare S; only merges and lane segments carry an arrow (GitHub
   *     network-graph grammar).
   */
  edge_style?: EdgeRouteStyle | string;
  [key: string]: unknown;
}

/**
 * Per-edge ROUTE style (git-flow display lot). `"default"` is the historical
 * centre-to-centre routing; see {@link HighLevelGraphEdge.edge_style} for the
 * flow-port semantics. Encoded per edge in
 * {@link GraphStyleBuffers.edgeRouteStyles} as 0 default / 1 flow-port /
 * 2 flow-port-reverse / 3 flow-port-no-arrow / 4 flow-port-reverse-no-arrow.
 */
export type EdgeRouteStyle =
  | "default"
  | "flow-port"
  | "flow-port-reverse"
  | "flow-port-no-arrow"
  | "flow-port-reverse-no-arrow";

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
  /**
   * Optional per-edge ROUTE-style codes (parallel to edges): 0 default
   * (centre-to-centre, historical), 1 flow-port (right-port → left-port smooth
   * S with a rightward arrow), 2 flow-port with the endpoints SWAPPED before
   * drawing (for new→old data edges like git `commit-parent`). Additive:
   * absent ⇒ every edge draws the historical routing (golden-stable). Drawn by
   * the Canvas2D fallback AND the WebGL2 instanced-edge path (single-sourced
   * via render-geometry.flowPortEdgeGeometry).
   */
  edgeRouteStyles?: Uint8Array;
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
  /**
   * Per-node type label, node-order keyed (parallel to
   * {@link RenderGraphBuffers.nodeIds}). Consumed by typed-layer / swimlane
   * layouts to band nodes into lanes by type; ignored by the force / static
   * engines. Optional & additive — absent ⇒ a single (untyped) lane.
   */
  nodeTypes?: readonly (string | null | undefined)[];
  /**
   * Per-node interval START, epoch-ms, node-order keyed (parallel to
   * {@link RenderGraphBuffers.nodeIds}) — the shared scene-contract `t` (#234).
   * Consumed by the time-oriented (Variant E) layout to place nodes on the X
   * (time) axis; ignored by the force / typed-layer / static engines. Optional &
   * additive — a nullish / non-finite entry is treated as "untimed".
   */
  nodeTimes?: readonly (number | null | undefined)[];
  /**
   * Per-node REPO/BAND key (the owning repo name), node-order keyed. Consumed
   * by the git-flow layout to stack one horizontal band per repo; ignored by
   * every other layout. Optional & additive.
   */
  nodeLanes?: readonly (string | null | undefined)[];
  /**
   * Per-node NAME (the branch name for Branch nodes), node-order keyed.
   * Consumed by the git-flow layout to pick the trunk (main/master/develop)
   * and order branch lanes deterministically. Optional & additive.
   */
  nodeNames?: readonly (string | null | undefined)[];
  /**
   * Per-edge RELATION label (`commit-parent`, `branch-head`, `produced`,
   * `touched-branch`, `derived-from`, …), edge-order keyed (parallel to
   * `graph.edges` pairs). Consumed by the git-flow layout to walk the git DAG;
   * ignored by every other layout. Optional & additive.
   */
  edgeRelations?: readonly (string | null | undefined)[];
  /**
   * Git-flow X-axis mode: `"rank"` (default — topological sequence) or
   * `"time"` (x ∝ commit committer-date `t`, one global axis across repo
   * bands). Consumed by the git-flow layout only; ignored by every other
   * layout. Optional & additive — absent ⇒ `"rank"`, the historical output.
   */
  xMode?: "rank" | "time";
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
   * Base HEIGHT of the `shape:box` glyph in CSS px (× pixelRatio × zoom).
   * Default 18 (the legacy metric) — existing consumers render byte-identical.
   * The GIT-FLOW view passes the label policy's resolved pill height
   * (`gitFlowLabelBoxHeightPx()`, −20% by default) so the DRAWN pills always
   * match the policy's measured collision AABBs (SPEC_GITFLOW_LABELS I1/I4).
   */
  boxBaseHeightPx?: number;
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
  /**
   * INTERNAL CANARY (B1 migration Phase 3). Offscreen-2D-canvas factory the
   * WebGL box-label TEXT atlas rasterizes onto. The golden harness passes a
   * factory that PINS the deterministic font on the raster context (the same
   * pin it applies to the render canvas) so the atlas rasterizes with the SAME
   * family Canvas2D measured + drew with. Defaults to a plain OffscreenCanvas /
   * detached `<canvas>`. Only consulted on the WebGL2 instanced-box canary path.
   */
  atlasCanvasFactory?: (
    width: number,
    height: number,
  ) => { canvas: unknown; ctx: CanvasRenderingContext2D } | null;
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
  /**
   * The 2D camera as the PUBLIC `{x, y, zoom}` pan/zoom API (unchanged). The
   * renderer derives the mat4 view-projection from it (see {@link viewProjection}).
   */
  camera: CameraState;
  /**
   * UNIFIED CAMERA: the column-major (16-element) mat4 VIEW-PROJECTION the GPU
   * vertex shaders are driven by, DERIVED from {@link camera} + the device
   * viewport. For 2D it is the ORTHOGRAPHIC matrix equivalent to the legacy
   * pan/zoom affine; it is the seam a future perspective(3D) camera replaces.
   * Additive & optional — callers that only need pan/zoom keep using {@link camera}.
   */
  viewProjection?: number[];
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

/**
 * The renderer is a pure DRAW surface — it owns no PICKING / hit-testing API
 * (no `pick` / `hitTest` / `nodeAt` / `readPixels`), and this is intentional
 * across every backend (B1-P4).
 *
 * Node picking is CPU / STUDIO-owned and BACKEND-AGNOSTIC: the studio converts
 * the pointer to world coords through the camera and finds the nearest node
 * from the SHARED render-geometry — `positions` (node centres) + the style
 * `nodeSizes` (drawn radii) — the same buffers handed to {@link setGraph} /
 * {@link setStyle}. The WebGL2 canary (P1 shapes, P2 edges, P3 box/text) only
 * changes WHICH pixels are drawn from those buffers, so swapping canvas2d ↔
 * webgl cannot move the node under the cursor. GPU color-picking (render ids to
 * an offscreen attachment + readPixels) is therefore UNNECESSARY here; adding a
 * picking method to this interface would create a per-backend hook that could
 * silently diverge from the CPU hit-test. (Verified by
 * studio/src/tests/pickingBackendAgnostic.test.js.)
 */
export interface GraphRenderer {
  setGraph(graph: RenderGraphInput | RenderGraphBuffers): void;
  setStyle(style: GraphStyleBuffers): void;
  setPositions(positions: Float32Array): void;
  updatePositions(frame: PositionFrame): void;
  fitView(options: FitViewOptions): void;
  setCamera(camera: CameraState): void;
  render(options?: { skipEdges?: boolean }): void;
  /**
   * HYBRID box-text overlay draws (B1-P3) from the LAST WebGL box render: one
   * entry per labelled box (device-px centre + #199-fitted label + device font
   * + node alpha). The caller draws these onto a Canvas2D OVERLAY (the identical
   * text engine the golden reference uses) composited on top of the WebGL boxes,
   * so the in-box text matches the Canvas2D reference by construction. Returns an
   * empty array on the Canvas2D / non-box paths (which draw their own text).
   */
  boxTextDraws(): import("./webgl-boxes").BoxTextDraw[];
  snapshot(): GraphRendererSnapshot;
  destroy(): void;
}
