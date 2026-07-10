/**
 * RADIAL layout (display Lot 2 — codeflow-parity "Radial").
 *
 * Root/hub-centred concentric rings, the classic radial tree:
 *
 *   • ROOT — the HIGHEST-DEGREE node (deterministic tie-break: the earliest such
 *     node in `graph.nodeIds` order). It sits at the origin (0, 0).
 *   • LEVELS — a breadth-first walk from the root assigns every reachable node a
 *     level `L` = its BFS hop-distance. Level `L` is placed on a concentric ring
 *     of radius `L · ringGap`.
 *   • ANGLE — within a level the `m` nodes are spread by EVEN angle
 *     `2π · j / m` in deterministic BFS-discovery order (`j` = 0 … m−1), so the
 *     ring is evenly fanned and reproducible.
 *   • DISCONNECTED — nodes unreachable from the root (a separate component, or
 *     the whole graph when there are no edges) are parked on ONE outer ring, just
 *     beyond the deepest BFS level, evenly spread in node-id order.
 *
 * Pure, deterministic (no randomness), O(n + e). Returns a fresh node-order-keyed
 * `Float32Array` of `2 · nodeCount` floats, index-parallel to `graph.nodeIds` —
 * exactly the shape {@link GraphRenderer.setPositions} consumes, so it morphs for
 * free against any other registered layout (index-parallel buffers, §2.6).
 */

import type { LayoutFn } from "./layout-registry";
import type { RenderGraphBuffers } from "./types";

/** Tuning for {@link computeRadialPositions}. */
export interface RadialLayoutOptions {
  /** Radial distance between adjacent concentric level-rings (default 120). */
  ringGap?: number;
  /**
   * Extra radius ADDED beyond the deepest BFS level for the outer ring that
   * holds DISCONNECTED nodes (unreachable from the root). Default: `ringGap`.
   */
  outerRingGap?: number;
}

const DEFAULT_RING_GAP = 120;

/**
 * RADIAL core — place nodes on concentric rings around the highest-degree hub.
 *
 * @param graph   render-graph buffers; `graph.edges` (flat `[src, tgt, …]` node
 *                INDEX pairs) drives the degree count + BFS, `graph.nodeIds`
 *                fixes the deterministic node order.
 * @param options ring spacing tuning (see {@link RadialLayoutOptions}).
 * @returns a fresh `Float32Array` of length `2 * graph.nodeIds.length`.
 */
export function computeRadialPositions(
  graph: RenderGraphBuffers,
  options: RadialLayoutOptions = {},
): Float32Array {
  const n = graph.nodeIds.length;
  const out = new Float32Array(n * 2);
  if (n === 0) return out;

  const ringGap = options.ringGap ?? DEFAULT_RING_GAP;
  const outerRingGap = options.outerRingGap ?? ringGap;

  // --- Degree (undirected) + adjacency, single O(e) pass over the edge pairs. ---
  const degree = new Uint32Array(n);
  const adjHead = new Int32Array(n).fill(-1); // intrusive singly-linked adjacency
  const edges = graph.edges;
  const e = edges.length; // 2 * edgeCount
  // Linked-list adjacency: adjNext[k] chains the k-th appended neighbour slot,
  // adjTo[k] is its target node index. Keeps the whole layout O(n + e) — no
  // per-node array growth, no sort.
  const adjTo: number[] = [];
  const adjNext: number[] = [];
  const pushAdj = (u: number, v: number): void => {
    adjTo.push(v);
    adjNext.push(adjHead[u]!);
    adjHead[u] = adjTo.length - 1;
  };
  for (let i = 0; i + 1 < e; i += 2) {
    const s = edges[i]!;
    const t = edges[i + 1]!;
    if (s >= n || t >= n) continue; // defensive: never trust a stray index
    degree[s]!++;
    degree[t]!++;
    // Push in a stable, edge-order-derived sequence (deterministic).
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
  const levels: number[][] = [];
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
    (levels[lu] ??= []).push(u);
    for (let k = adjHead[u]!; k !== -1; k = adjNext[k]!) {
      const v = adjTo[k]!;
      if (level[v] === -1) {
        level[v] = lu + 1;
        queue[tail++] = v;
      }
    }
  }

  // --- Place each ring: level 0 = root at origin; level L on radius L·ringGap. ---
  for (let l = 0; l < levels.length; l++) {
    const ring = levels[l];
    if (!ring) continue;
    const radius = l * ringGap;
    const m = ring.length;
    for (let j = 0; j < m; j++) {
      const idx = ring[j]!;
      if (l === 0) {
        // Root (and only the root) sits at the centre.
        out[idx * 2] = 0;
        out[idx * 2 + 1] = 0;
      } else {
        const angle = (2 * Math.PI * j) / m;
        out[idx * 2] = radius * Math.cos(angle);
        out[idx * 2 + 1] = radius * Math.sin(angle);
      }
    }
  }

  // --- Disconnected nodes: one outer ring, node-id order, evenly spread. ---
  const disconnected: number[] = [];
  for (let i = 0; i < n; i++) {
    if (level[i] === -1) disconnected.push(i);
  }
  if (disconnected.length > 0) {
    const outerRadius = maxLevel * ringGap + outerRingGap;
    const m = disconnected.length;
    for (let j = 0; j < m; j++) {
      const idx = disconnected[j]!;
      const angle = (2 * Math.PI * j) / m;
      out[idx * 2] = outerRadius * Math.cos(angle);
      out[idx * 2 + 1] = outerRadius * Math.sin(angle);
    }
  }

  return out;
}

/**
 * RADIAL as a {@link LayoutFn}. Uses default ring spacing; the graph's edges +
 * node order fully determine the placement (no {@link LayoutOptions} consumed).
 * Length always matches `graph.nodeIds.length`.
 */
export const radialLayout: LayoutFn = (graph) => computeRadialPositions(graph);
