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
 * Three layouts ship registered:
 *   • `"force"`         — the DEFAULT. Passthrough of the already-baked positions
 *                         (the deterministic Barnes-Hut FA2 force layout runs OFF
 *                         this path — `src/graph-layout.ts` — and is pinned into
 *                         `graph.positions`; this engine returns them verbatim).
 *   • `"typed-layer"`   — Variant A swimlane: deterministic O(n) banding by node
 *                         type. OPT-IN; never the default.
 *   • `"time-oriented"` — Variant E: deterministic O(n) placement of nodes by
 *                         their interval-start `t` on the X (time) axis (oldest
 *                         left → newest right), banded into type lanes on Y.
 *                         OPT-IN; never the default.
 *
 * The registry honors the existing {@link LayoutEngine} / {@link LayoutOptions}
 * contract: {@link createLayoutEngine} wraps any registered layout as the
 * streaming `LayoutEngine` (a single static frame), so a registered layout plugs
 * straight into the existing engine consumer path.
 */

import { gitFlowLayout } from "./layout-gitflow";
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

/** Registered id of Variant E — the time-oriented (temporal X-axis) layout. */
export const TIME_ORIENTED_LAYOUT_ID = "time-oriented";

/**
 * Registered id of the GIT-FLOW layout (left→right git graph: trunk lane 0,
 * lane-reused branch lanes, window-left attaches, session sub-positions —
 * see `layout-gitflow.ts`). OPT-IN; never the default.
 */
export const GIT_FLOW_LAYOUT_ID = "git-flow";

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
// Variant E — time-oriented layout (deterministic, O(n)). X = normalized time.
// ---------------------------------------------------------------------------

/** Tuning for {@link computeTimeOrientedPositions}. */
export interface TimeOrientedLayoutOptions {
  /**
   * Total WIDTH of the time axis. Timed nodes spread across `[-width/2, +width/2]`
   * (centred on x = 0, like Variant A), oldest `t` at the left edge, newest at the
   * right. Default 1000.
   */
  width?: number;
  /** Vertical distance between adjacent type-lane CENTRES (default 120). */
  laneGap?: number;
  /**
   * Explicit lane ordering (top→bottom) by type name — identical semantics to
   * Variant A. Types present but absent here are appended ascending (alpha); the
   * untyped lane is always last. Default: all lanes alpha-sorted.
   */
  laneOrder?: readonly string[];
  /**
   * Horizontal gap LEFT of the timeline where UNTIMED nodes are parked. An
   * untimed node (nullish / non-finite `t`) gets a deterministic x =
   * `-width/2 - untimedGap`, sitting on a "park rail" just left of the oldest
   * timed node, while keeping its type lane on Y. Default 80.
   */
  untimedGap?: number;
}

const DEFAULT_TIME_WIDTH = 1000;
const DEFAULT_UNTIMED_GAP = 80;

function finiteTime(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Variant E core — place nodes on a horizontal TIME axis.
 *
 *   • x = the node's interval-start `t`, NORMALIZED across the timed range
 *     `[tMin, tMax]` into `[-width/2, +width/2]` (oldest left → newest right).
 *     When every timed node shares one instant (tMax === tMin) they sit at x = 0.
 *     UNTIMED nodes (nullish / non-finite `t`) are parked deterministically at
 *     x = `-width/2 - untimedGap`, just left of the timeline.
 *   • y = a type LANE centre (one band per distinct type), ordered exactly like
 *     Variant A (`laneOrder` first, then ascending alpha; untyped lane last), so
 *     the time-oriented view is a temporal swimlane. With no `nodeTypes` every
 *     node shares one lane (y = 0).
 *
 * Pure, deterministic, O(n) (+ O(L log L) to sort the L ≤ n lanes). Returns a
 * fresh node-order-keyed `Float32Array` of length `2 * nodeTimes.length`.
 *
 * @param nodeTimes per-node interval start (epoch-ms), node-order keyed. A
 *                  nullish / non-finite entry is "untimed".
 * @param nodeTypes optional per-node type, node-order keyed (parallel). Absent ⇒
 *                  one lane (y = 0).
 */
export function computeTimeOrientedPositions(
  nodeTimes: readonly (number | null | undefined)[],
  nodeTypes?: readonly (string | null | undefined)[],
  options: TimeOrientedLayoutOptions = {},
): Float32Array {
  const n = nodeTimes.length;
  const out = new Float32Array(n * 2);
  if (n === 0) return out;

  const width = options.width ?? DEFAULT_TIME_WIDTH;
  const laneGap = options.laneGap ?? DEFAULT_LANE_GAP;
  const untimedGap = options.untimedGap ?? DEFAULT_UNTIMED_GAP;
  const halfWidth = width / 2;

  // --- X: normalize timed nodes; park untimed ones on a deterministic rail. ---
  let tMin = Number.POSITIVE_INFINITY;
  let tMax = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < n; i++) {
    const t = nodeTimes[i];
    if (!finiteTime(t)) continue;
    if (t < tMin) tMin = t;
    if (t > tMax) tMax = t;
  }
  const span = tMax - tMin;
  const untimedX = -halfWidth - untimedGap;
  for (let i = 0; i < n; i++) {
    const t = nodeTimes[i];
    if (!finiteTime(t)) {
      out[i * 2] = untimedX;
      continue;
    }
    // span === 0 ⇒ every timed node shares one instant ⇒ centre them at x = 0.
    const frac = span > 0 ? (t - tMin) / span : 0.5;
    out[i * 2] = (frac - 0.5) * width;
  }

  // --- Y: type lanes, ordered exactly like Variant A. ---
  const buckets = new Map<string, number[]>();
  const untyped: number[] = [];
  for (let i = 0; i < n; i++) {
    const type = normalizeType(nodeTypes?.[i]);
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
    // Centre the stack of lanes vertically around y = 0 (single lane ⇒ y = 0).
    const y = (lane - (laneCount - 1) / 2) * laneGap;
    for (const idx of lanes[lane] as number[]) {
      out[idx * 2 + 1] = y;
    }
  }

  return out;
}

/**
 * Variant E as a {@link LayoutFn}. Reads per-node start times from
 * {@link LayoutOptions.nodeTimes} and optional types from
 * {@link LayoutOptions.nodeTypes} (both node-order keyed). Absent times ⇒ every
 * node untimed (all parked on the left rail); absent types ⇒ one lane. Length
 * always matches `graph.nodeIds.length`.
 */
export const timeOrientedLayout: LayoutFn = (graph, options) => {
  const n = graph.nodeIds.length;
  const times = options?.nodeTimes;
  const nodeTimes: (number | null)[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = times?.[i];
    nodeTimes[i] = finiteTime(t) ? t : null;
  }
  return computeTimeOrientedPositions(nodeTimes, options?.nodeTypes);
};

// ---------------------------------------------------------------------------
// Register built-ins at module load. The DEFAULT (`"force"`) MUST stay the
// passthrough — typed-layer / time-oriented are strictly opt-in and never
// replace it.
// ---------------------------------------------------------------------------

registerLayout(DEFAULT_LAYOUT_ID, forceLayout);
registerLayout(TYPED_LAYER_LAYOUT_ID, typedLayerLayout);
registerLayout(TIME_ORIENTED_LAYOUT_ID, timeOrientedLayout);
registerLayout(GIT_FLOW_LAYOUT_ID, gitFlowLayout);
