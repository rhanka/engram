/**
 * Vendored build-time layout cores (swimlane + time-oriented).
 *
 * These are VERBATIM copies of the pure, deterministic `computeTypedLayerPositions`
 * and `computeTimeOrientedPositions` helpers (+ their `TypedLayerLayoutOptions` /
 * `TimeOrientedLayoutOptions` types) from
 * `packages/graph/src/layout-registry.ts`, which remains the CANONICAL home for
 * the renderer package's own use.
 *
 * WHY VENDORED: graphify's RUNTIME dependency is the PUBLISHED
 * `@sentropic/graph@^0.1.0`, which does NOT export `computeTypedLayerPositions`
 * or `computeTimeOrientedPositions` (those symbols were added to the local,
 * still-unpublished package source). tsup keeps `@sentropic/graph` external, so
 * an installed graphify would resolve the published tarball at runtime and crash
 * at import with:
 *   SyntaxError: ... does not provide an export named 'computeTypedLayerPositions'
 * (regression from #238 — the installed-package smoke-test). Importing these
 * symbols LOCALLY removes the runtime dependency on the unpublished exports while
 * keeping behaviour byte-identical. The renderer package's other (published)
 * exports stay external, untouched.
 *
 * KEEP IN SYNC with `packages/graph/src/layout-registry.ts`. Once
 * `@sentropic/graph` publishes these helpers and graphify's dependency floor is
 * bumped, this module can be deleted and `scene-layout.ts` can import from
 * `@sentropic/graph` again.
 *
 * Pure, deterministic, O(n) — no renderer/WebGL/DOM dependency.
 */

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
