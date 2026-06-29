/**
 * Vendored typed-layer (swimlane) layout core.
 *
 * This is a VERBATIM copy of the pure, deterministic `computeTypedLayerPositions`
 * helper (+ its `TypedLayerLayoutOptions` type) from
 * `packages/graph/src/layout-registry.ts`, which remains the CANONICAL home for
 * the renderer package's own use.
 *
 * WHY VENDORED: graphify's RUNTIME dependency is the PUBLISHED
 * `@sentropic/graph@^0.1.0`, which does NOT export `computeTypedLayerPositions`
 * (that symbol was added to the local, still-unpublished package source). tsup
 * keeps `@sentropic/graph` external, so an installed graphify would resolve the
 * published tarball at runtime and crash at import with:
 *   SyntaxError: ... does not provide an export named 'computeTypedLayerPositions'
 * (regression from #238 — the installed-package smoke-test). Importing this
 * symbol LOCALLY removes the runtime dependency on the unpublished export while
 * keeping behaviour byte-identical. The renderer package's other (published)
 * exports stay external, untouched.
 *
 * KEEP IN SYNC with `packages/graph/src/layout-registry.ts`. Once
 * `@sentropic/graph` publishes `computeTypedLayerPositions` and graphify's
 * dependency floor is bumped, this module can be deleted and `scene-layout.ts`
 * can import from `@sentropic/graph` again.
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
