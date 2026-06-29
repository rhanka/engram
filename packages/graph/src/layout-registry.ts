/**
 * Pluggable LAYOUT REGISTRY (display Lot-1).
 *
 * A layout maps a graph → node-order-keyed 2D positions: a `Float32Array` of
 * `2 * nodeCount` floats `[x0, y0, x1, y1, …]`, the EXACT shape
 * `GraphRenderer.setPositions` / `RenderGraphBuffers.positions` expects. Layout
 * stays PRECOMPUTED off the render path and baked as positions — this registry
 * only chooses WHICH positions are produced; it never touches the renderer,
 * camera, or shaders (raw-WebGL2 instanced draw path is unchanged).
 *
 * Two layouts ship registered:
 *   • `"force"`       — the DEFAULT. Passthrough of the already-baked positions
 *                       (the deterministic Barnes-Hut FA2 force layout runs OFF
 *                       this path — `src/graph-layout.ts` — and is pinned into
 *                       `graph.positions`; this engine returns them verbatim).
 *   • `"typed-layer"` — Variant A swimlane: deterministic O(n) banding by node
 *                       type. OPT-IN; never the default.
 *
 * The registry honors the existing {@link LayoutEngine} / {@link LayoutOptions}
 * contract: {@link createLayoutEngine} wraps any registered layout as the
 * streaming `LayoutEngine` (a single static frame), so a registered layout plugs
 * straight into the existing engine consumer path.
 */

import { copyPositions, createPositionFrame } from "./positions";
import type { LayoutEngine, LayoutOptions, PositionFrame, RenderGraphBuffers } from "./types";

/**
 * A layout function: graph (+ options) → node-order-keyed 2D positions
 * (`2 * nodeCount` floats). The returned array is exactly what
 * {@link GraphRenderer.setPositions} consumes — no renderer change required.
 */
export type LayoutFn = (graph: RenderGraphBuffers, options?: LayoutOptions) => Float32Array;

/** Registered id of the DEFAULT layout (the baked FA2 force positions). */
export const DEFAULT_LAYOUT_ID = "force";

/** Registered id of Variant A — the typed-layer / swimlane layout. */
export const TYPED_LAYER_LAYOUT_ID = "typed-layer";

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const registry = new Map<string, LayoutFn>();

/** Register (or replace) a layout under `id`. */
export function registerLayout(id: string, fn: LayoutFn): void {
  if (typeof id !== "string" || id.trim() === "") {
    throw new TypeError("layout id must be a non-empty string");
  }
  if (typeof fn !== "function") {
    throw new TypeError(`layout "${id}" must be a function`);
  }
  registry.set(id, fn);
}

/** Look up a registered layout, or `undefined` when unknown. */
export function getLayout(id: string): LayoutFn | undefined {
  return registry.get(id);
}

/** True iff a layout is registered under `id`. */
export function hasLayout(id: string): boolean {
  return registry.has(id);
}

/** Ids of every registered layout (insertion order). */
export function listLayouts(): string[] {
  return [...registry.keys()];
}

/**
 * Resolve a layout, falling back to the DEFAULT when `id` is omitted or unknown.
 * Never throws — an unknown id degrades to the default force passthrough so a
 * stale `layout_id` can never break rendering.
 */
export function resolveLayout(id?: string): LayoutFn {
  if (id !== undefined) {
    const found = registry.get(id);
    if (found) return found;
  }
  // The default is always registered at module load (see bottom of file).
  return registry.get(DEFAULT_LAYOUT_ID) as LayoutFn;
}

/**
 * Wrap a registered layout as the existing streaming {@link LayoutEngine}: it
 * yields ONE static {@link PositionFrame} (`alpha: 0, tick: 0`) carrying the
 * computed positions, so a registry layout drops into any `LayoutEngine`
 * consumer unchanged.
 */
export function createLayoutEngine(id: string = DEFAULT_LAYOUT_ID): LayoutEngine {
  const fn = resolveLayout(id);
  return {
    *run(graph: RenderGraphBuffers, options?: LayoutOptions): Iterable<PositionFrame> {
      yield createPositionFrame(fn(graph, options), { alpha: 0, tick: 0 });
    },
  };
}

// ---------------------------------------------------------------------------
// Built-in: the DEFAULT force layout (passthrough of baked positions).
// ---------------------------------------------------------------------------

/**
 * DEFAULT layout. The FA2 force layout is precomputed off the render path and
 * pinned into `graph.positions`; this passthrough returns a copy of them in the
 * shape `setPositions` expects. Reuses {@link copyPositions} (validates the
 * even length and node-count).
 */
export const forceLayout: LayoutFn = (graph) =>
  copyPositions(graph.positions, graph.nodeIds.length);

// ---------------------------------------------------------------------------
// Variant A — typed-layer / swimlane layout (deterministic, O(n)).
// ---------------------------------------------------------------------------

/** Tuning for {@link computeTypedLayerPositions}. */
export interface TypedLayerLayoutOptions {
  /** Vertical distance between adjacent lane CENTRES (default 120). */
  laneGap?: number;
  /** Horizontal distance between adjacent nodes WITHIN a lane (default 40). */
  nodeGap?: number;
  /**
   * Explicit lane ordering (top→bottom) by type name. Types present in the
   * graph but absent here are appended in ascending (alpha) order; the untyped
   * lane is always placed last. Default: all lanes alpha-sorted.
   */
  laneOrder?: readonly string[];
}

const DEFAULT_LANE_GAP = 120;
const DEFAULT_NODE_GAP = 40;

function normalizeType(raw: string | null | undefined): string | null {
  return typeof raw === "string" && raw.trim() !== "" ? raw.trim() : null;
}

/**
 * Variant A core — place nodes in horizontal bands ("swimlanes") by type.
 *
 *   • one lane per distinct `node_type`; lanes ordered deterministically
 *     (`laneOrder` first, then ascending alpha; the untyped lane last);
 *   • y = the lane CENTRE → every node of a type shares one y-band, and adjacent
 *     bands are separated by `laneGap`;
 *   • x = a stable even spread within the lane, centred on 0, in node order.
 *
 * Pure, deterministic, O(n) (+ O(L log L) to sort the L ≤ n lanes). Returns a
 * fresh node-order-keyed `Float32Array` of length `2 * nodeTypes.length`.
 *
 * @param nodeTypes per-node type label, node-order keyed (parallel to node ids).
 *                  A nullish / blank entry lands in the untyped lane.
 */
export function computeTypedLayerPositions(
  nodeTypes: readonly (string | null | undefined)[],
  options: TypedLayerLayoutOptions = {},
): Float32Array {
  const n = nodeTypes.length;
  const out = new Float32Array(n * 2);
  if (n === 0) return out;

  const laneGap = options.laneGap ?? DEFAULT_LANE_GAP;
  const nodeGap = options.nodeGap ?? DEFAULT_NODE_GAP;

  // Bucket node indices by type, preserving node order within each lane.
  const buckets = new Map<string, number[]>();
  const untyped: number[] = [];
  for (let i = 0; i < n; i++) {
    const type = normalizeType(nodeTypes[i]);
    if (type === null) {
      untyped.push(i);
      continue;
    }
    let arr = buckets.get(type);
    if (!arr) {
      arr = [];
      buckets.set(type, arr);
    }
    arr.push(i);
  }

  // Deterministic lane order: explicit laneOrder (present ones) → remaining
  // defined types ascending → untyped lane last.
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const type of options.laneOrder ?? []) {
    if (buckets.has(type) && !seen.has(type)) {
      ordered.push(type);
      seen.add(type);
    }
  }
  for (const type of [...buckets.keys()].filter((t) => !seen.has(t)).sort()) {
    ordered.push(type);
  }

  const lanes: number[][] = ordered.map((type) => buckets.get(type) as number[]);
  if (untyped.length > 0) lanes.push(untyped);

  const laneCount = lanes.length;
  for (let lane = 0; lane < laneCount; lane++) {
    // Centre the stack of lanes vertically around y = 0.
    const y = (lane - (laneCount - 1) / 2) * laneGap;
    const indices = lanes[lane] as number[];
    const k = indices.length;
    for (let j = 0; j < k; j++) {
      // Centre the row of nodes horizontally around x = 0.
      const x = (j - (k - 1) / 2) * nodeGap;
      const idx = indices[j] as number;
      out[idx * 2] = x;
      out[idx * 2 + 1] = y;
    }
  }

  return out;
}

/**
 * Variant A as a {@link LayoutFn}. Reads per-node types from
 * {@link LayoutOptions.nodeTypes} (node-order keyed); when absent every node is
 * untyped → a single lane. Length always matches `graph.nodeIds.length`.
 */
export const typedLayerLayout: LayoutFn = (graph, options) => {
  const n = graph.nodeIds.length;
  const types = options?.nodeTypes;
  const nodeTypes: (string | null)[] = new Array(n);
  for (let i = 0; i < n; i++) {
    nodeTypes[i] = normalizeType(types?.[i]);
  }
  return computeTypedLayerPositions(nodeTypes);
};

// ---------------------------------------------------------------------------
// Register built-ins at module load. The DEFAULT (`"force"`) MUST stay the
// passthrough — typed-layer is strictly opt-in and never replaces it.
// ---------------------------------------------------------------------------

registerLayout(DEFAULT_LAYOUT_ID, forceLayout);
registerLayout(TYPED_LAYER_LAYOUT_ID, typedLayerLayout);
