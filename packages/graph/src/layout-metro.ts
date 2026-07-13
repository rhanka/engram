/**
 * METRO layout (display Lot 6 — codeflow-parity "Metro", MVP).
 *
 * A grid-snapped, lane-based arrangement that reads like a transit map:
 *
 *   • ROOT — the HIGHEST-DEGREE node (deterministic tie-break: earliest such
 *     node in `graph.nodeIds` order).
 *   • LANES — a breadth-first walk from the root assigns every reachable node a
 *     BFS level `L`. Each level is a horizontal LANE at `y = L · laneGap`; within
 *     a lane the `m` nodes are snapped to even grid columns `x = (j − (m−1)/2)·
 *     colGap` in deterministic BFS-discovery order, so lanes are evenly spaced
 *     and reproducible.
 *   • DISCONNECTED — nodes unreachable from the root (a separate component, or a
 *     graph with no edges) are parked on ONE extra lane below the deepest level,
 *     node-id order, evenly gridded.
 *
 * MVP scope (D1): grid-snapped nodes only. TRUE octilinear/orthogonal EDGE
 * routing (straight + 45° segments) is deliberately deferred — it touches the
 * golden-tested draw path (`render-geometry.ts`) and belongs to its own
 * golden-gated lot. Edges render with the existing straight/curved renderer, so
 * this engine is purely additive and morphs for free (§2.6, index-parallel).
 *
 * Pure, deterministic (no randomness), O(n + e). Returns a fresh node-order-keyed
 * `Float32Array` of `2 · nodeCount` floats, index-parallel to `graph.nodeIds`.
 */

import type { LayoutFn } from "./layout-registry";
import type { RenderGraphBuffers } from "./types";

/** Tuning for {@link computeMetroPositions}. */
export interface MetroLayoutOptions {
  /** Vertical distance between adjacent BFS lanes (default 120). */
  laneGap?: number;
  /** Horizontal grid step between adjacent nodes within a lane (default 90). */
  colGap?: number;
}

const DEFAULT_LANE_GAP = 120;
const DEFAULT_COL_GAP = 90;

/**
 * METRO core — place nodes on BFS lanes, grid-snapped within each lane.
 *
 * @param graph   render-graph buffers; `graph.edges` (flat `[src, tgt, …]` node
 *                INDEX pairs) drives the degree count + BFS, `graph.nodeIds`
 *                fixes the deterministic node order.
 * @param options lane/column spacing tuning (see {@link MetroLayoutOptions}).
 * @returns a fresh `Float32Array` of length `2 * graph.nodeIds.length`.
 */
export function computeMetroPositions(
  graph: RenderGraphBuffers,
  options: MetroLayoutOptions = {},
): Float32Array {
  const n = graph.nodeIds.length;
  const out = new Float32Array(n * 2);
  if (n === 0) return out;

  const laneGap = options.laneGap ?? DEFAULT_LANE_GAP;
  const colGap = options.colGap ?? DEFAULT_COL_GAP;

  // --- Degree (undirected) + linked-list adjacency, single O(e) pass. ---
  const degree = new Uint32Array(n);
  const adjHead = new Int32Array(n).fill(-1);
  const adjTo: number[] = [];
  const adjNext: number[] = [];
  const pushAdj = (u: number, v: number): void => {
    adjTo.push(v);
    adjNext.push(adjHead[u]!);
    adjHead[u] = adjTo.length - 1;
  };
  const edges = graph.edges;
  const e = edges.length; // 2 * edgeCount
  for (let i = 0; i + 1 < e; i += 2) {
    const s = edges[i]!;
    const t = edges[i + 1]!;
    if (s >= n || t >= n) continue; // defensive: never trust a stray index
    degree[s]!++;
    degree[t]!++;
    pushAdj(s, t);
    pushAdj(t, s);
  }

  // --- Root = highest degree; tie → earliest node in nodeIds (index) order. ---
  let root = 0;
  let bestDegree = degree[0]!;
  for (let i = 1; i < n; i++) {
    if (degree[i]! > bestDegree) {
      bestDegree = degree[i]!;
      root = i;
    }
  }

  // --- BFS from the root: level = hop distance, grouped in discovery order. ---
  const level = new Int32Array(n).fill(-1);
  const lanes: number[][] = [];
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  level[root] = 0;
  queue[tail++] = root;
  let maxLevel = 0;
  while (head < tail) {
    const u = queue[head++]!;
    const lu = level[u]!;
    if (lu > maxLevel) maxLevel = lu;
    (lanes[lu] ??= []).push(u);
    for (let k = adjHead[u]!; k !== -1; k = adjNext[k]!) {
      const v = adjTo[k]!;
      if (level[v] === -1) {
        level[v] = lu + 1;
        queue[tail++] = v;
      }
    }
  }

  // --- Place each lane: y = level·laneGap; x = centred grid columns. ---
  const placeLane = (row: number[], y: number): void => {
    const m = row.length;
    for (let j = 0; j < m; j++) {
      const idx = row[j]!;
      out[idx * 2] = (j - (m - 1) / 2) * colGap;
      out[idx * 2 + 1] = y;
    }
  };
  for (let l = 0; l < lanes.length; l++) {
    const lane = lanes[l];
    if (lane) placeLane(lane, l * laneGap);
  }

  // --- Disconnected nodes: one extra lane below the deepest BFS level. ---
  const disconnected: number[] = [];
  for (let i = 0; i < n; i++) {
    if (level[i] === -1) disconnected.push(i);
  }
  if (disconnected.length > 0) {
    placeLane(disconnected, (maxLevel + 1) * laneGap);
  }

  return out;
}

/**
 * METRO as a {@link LayoutFn}. Uses default lane/column spacing; the graph's
 * edges + node order fully determine the placement (no {@link LayoutOptions}
 * consumed). Length always matches `graph.nodeIds.length`.
 */
export const metroLayout: LayoutFn = (graph) => computeMetroPositions(graph);
