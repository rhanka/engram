/**
 * GRID layout (display Lot 2 — codeflow-parity "Grid").
 *
 * Regular square-ish grid placement — the legible, hairball-free arrangement:
 *
 *   • ORDER — nodes are placed in NODE-ID order (their index in `graph.nodeIds`),
 *     a deterministic, O(n) ordering with no sort.
 *   • SHAPE — `cols = ceil(√n)` columns, `rows = ceil(n / cols)` rows, so the grid
 *     stays as square as possible; the final row may be partially filled.
 *   • SPACING — adjacent cells are `gridGap` apart on both axes.
 *   • CENTRE — the whole grid's bounding box is centred on the origin (x and y
 *     each offset by the half-extent), matching Variant A's centred convention.
 *
 * Pure, deterministic (no randomness), O(n). Returns a fresh node-order-keyed
 * `Float32Array` of `2 · nodeCount` floats, index-parallel to `graph.nodeIds` —
 * exactly the shape {@link GraphRenderer.setPositions} consumes, so it morphs for
 * free against any other registered layout (index-parallel buffers, §2.6).
 */

import type { LayoutFn } from "./layout-registry";
import type { RenderGraphBuffers } from "./types";

/** Tuning for {@link computeGridPositions}. */
export interface GridLayoutOptions {
  /** Distance between adjacent grid cells on both axes (default 60). */
  gridGap?: number;
}

const DEFAULT_GRID_GAP = 60;

/**
 * GRID core — place nodes on a `ceil(√n)`-column grid, centred on the origin, in
 * node-id order.
 *
 * @param graph   render-graph buffers; only `graph.nodeIds.length` (the node
 *                COUNT) and the implicit node order are consulted — no edges.
 * @param options cell spacing tuning (see {@link GridLayoutOptions}).
 * @returns a fresh `Float32Array` of length `2 * graph.nodeIds.length`.
 */
export function computeGridPositions(
  graph: RenderGraphBuffers,
  options: GridLayoutOptions = {},
): Float32Array {
  const n = graph.nodeIds.length;
  const out = new Float32Array(n * 2);
  if (n === 0) return out;

  const gridGap = options.gridGap ?? DEFAULT_GRID_GAP;
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);

  // Centre the FULL grid bounding box on the origin (like Variant A centres its
  // lanes / rows). The last row may be partially filled — the box is still keyed
  // off the full cols × rows extent so the layout is stable as n grows.
  const xOffset = ((cols - 1) / 2) * gridGap;
  const yOffset = ((rows - 1) / 2) * gridGap;

  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    out[i * 2] = col * gridGap - xOffset;
    out[i * 2 + 1] = row * gridGap - yOffset;
  }

  return out;
}

/**
 * GRID as a {@link LayoutFn}. Uses default cell spacing; the node COUNT + order
 * fully determine the placement (no {@link LayoutOptions} consumed). Length
 * always matches `graph.nodeIds.length`.
 */
export const gridLayout: LayoutFn = (graph) => computeGridPositions(graph);
