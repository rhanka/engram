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

interface RendererState {
  nodeIds: NodeId[];
  positions: Float32Array;
  edges: Uint32Array;
  nodeFlags?: NodeFlags;
  attrs?: Float32Array;
  style?: GraphStyleBuffers;
}

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
    edgeWidths: new Float32Array(style.edgeWidths),
    edgeColors: new Uint8Array(style.edgeColors),
    edgeDash: new Uint8Array(style.edgeDash),
    edgeCurvatures: new Float32Array(style.edgeCurvatures),
  };
}

export function createGraphRenderer(
  canvas: GraphCanvasLike | null,
  options: GraphRendererOptions = {},
): GraphRenderer {
  const context = acquireContext(canvas, options);
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

  function render(): void {
    ensureAlive();

    if (!context) {
      return;
    }

    context.viewport(0, 0, canvas?.width ?? 0, canvas?.height ?? 0);
    context.clearColor(0, 0, 0, 0);
    context.clear(context.COLOR_BUFFER_BIT);
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
        hasStyle: state.style !== undefined,
      };
    },
    destroy() {
      destroyed = true;
    },
  };
}
