/**
 * graphify-owned Personalized PageRank (HippoRAG, Piece 3 / C6-C7).
 *
 * graphology ships ordinary PageRank (uniform teleport), NOT personalized — its
 * options have no personalization vector (verified, consensus §2). So Phase A
 * ships this small power-iteration PPR, reusing existing deps (no new runtime
 * dependency, INV-5). It walks the UNDIRECTED entity graph via the index's
 * self-carried CSR adjacency (C3a) — so it runs OFFLINE with no graph.json —
 * with edges weighted per the frozen C7a rule (materialized into edge_weights[]).
 *
 * The personalization (teleport) vector is the NORMALIZED FUSED-SEED scores
 * (C5a step 3): seed mass on the RRF-fused lexical hits, not a single raw BM25
 * list. The output is the stationary distribution per node — the EXPANSION
 * ranking that replaces the degree-sort.
 *
 * Pure compute → fully offline, no key, no model. Deterministic: fixed CSR
 * iteration order + fixed tolerance.
 */

import type { CsrAdjacency } from "../search-index.js";

export const DEFAULT_ALPHA = 0.85;
/**
 * Power-iteration cap. At α=0.85 with L1 tolerance 1e-6, convergence on a
 * graphify-scale graph takes well under 100 iterations (sparse iteration is
 * cheap — within the C7 latency budget); 100 leaves headroom over the worst
 * case so `converged` is true on real corpora.
 */
export const DEFAULT_MAX_ITERATIONS = 100;
export const DEFAULT_TOLERANCE = 1e-6;
/**
 * Lazy-walk self-retention fraction. The walk keeps `lazy` of a node's mass on
 * itself and spreads `(1 - lazy)` to its weighted neighbors each step. This is
 * the standard PPR remedy for two pathologies the C7 contract / T6 require us to
 * avoid:
 *
 *   1. **Leaf mass-leak** — a degree-1 seed (a path endpoint) would otherwise
 *      ship ALL its walk-mass to its single neighbor, so the NEIGHBOUR, not the
 *      seed, ends up with the most mass (verified: a plain PPR seeded on a path
 *      endpoint scores node 1 > node 0). T6 requires "all seed mass on ONE node →
 *      mass concentrates THERE and decays with distance" — the lazy walk keeps the
 *      seed sticky enough to dominate while the (1-lazy) spread still decays
 *      monotonically along the path.
 *   2. **Bipartite/periodicity** — the self-retention makes the chain aperiodic,
 *      guaranteeing convergence of the power iteration.
 *
 * `0.6` is the frozen Phase-A default: the smallest value (so the graph topology
 * still dominates ranking) at which a degree-1 seed strictly out-scores its lone
 * neighbour on the T6 path fixtures, while preserving the symmetric-uniform shape
 * (endpoints equal, interior higher) and the α-monotonicity (lower α → more seed
 * mass). It is deterministic — pure arithmetic, fixed iteration order.
 */
export const DEFAULT_LAZY = 0.6;

export interface PprOptions {
  /** Damping / teleport-back probability (default 0.85). */
  alpha?: number;
  /** Power-iteration cap (default 100). */
  maxIterations?: number;
  /** L1 convergence tolerance (default 1e-6). */
  tolerance?: number;
  /**
   * Lazy-walk self-retention fraction in [0,1] (default 0.6). See {@link DEFAULT_LAZY}.
   * `0` recovers the plain (non-lazy) random walk.
   */
  lazy?: number;
}

export interface PprResult {
  /** Stationary score per docId (length N, sums to ~1). */
  scores: number[];
  /** Iterations actually run. */
  iterations: number;
  /** Whether convergence was reached within `maxIterations`. */
  converged: boolean;
  /** Final L1 delta. */
  delta: number;
}

/**
 * Background (global-centrality) PageRank — the SAME power iteration with a
 * UNIFORM personalization vector (1/N teleport, the `teleport.size === 0`
 * branch of {@link personalizedPageRank}). It depends only on the graph
 * topology, NOT on the query, so it is computed ONCE per index and reused for
 * every question as the specificity denominator (lift-over-background re-rank,
 * see answer-pack.ts). Universally-central hubs score high HERE; that high
 * background is what divides them down in the specificity ranking.
 *
 * This adds a SECOND PageRank channel (background) alongside the existing
 * query-personalized one; the personalized PPR math is untouched.
 */
export function backgroundPageRank(
  adjacency: CsrAdjacency,
  N: number,
  options: PprOptions = {},
): PprResult {
  // Empty teleport → uniform 1/N personalization (ordinary PageRank).
  return personalizedPageRank(adjacency, N, new Map(), options);
}

/**
 * Run Personalized PageRank over a CSR adjacency.
 *
 * @param adjacency self-carried CSR (node_ptr / neighbors / edge_weights), C3a.
 * @param N         number of nodes (== adjacency.node_ptr.length - 1).
 * @param teleport  personalization vector: docId → mass (need NOT sum to 1; it
 *                  is normalized internally). When empty, falls back to uniform
 *                  teleport (ordinary PageRank).
 *
 * Iteration (LAZY weighted walk):
 *   r_{t+1} = (1-α)·p  +  α·[ lazy·r_t  +  (1-lazy)·Wᵀ·r_t ]
 * where W is the row-stochastic weighted transition (column j of Wᵀ distributes
 * node j's mass to its weighted neighbors) and `lazy` (DEFAULT_LAZY) is the
 * self-retention fraction. Dangling nodes (no out-edges) redistribute their mass
 * to the teleport vector p, conserving total mass.
 */
export function personalizedPageRank(
  adjacency: CsrAdjacency,
  N: number,
  teleport: Map<number, number>,
  options: PprOptions = {},
): PprResult {
  const alpha = options.alpha ?? DEFAULT_ALPHA;
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;
  const lazy = options.lazy ?? DEFAULT_LAZY;
  const spread = 1 - lazy;

  if (N === 0) return { scores: [], iterations: 0, converged: true, delta: 0 };

  // Normalize the teleport (personalization) vector p. Empty → uniform.
  const p = new Float64Array(N);
  let teleportTotal = 0;
  for (const [node, mass] of teleport) {
    if (node >= 0 && node < N && Number.isFinite(mass) && mass > 0) {
      p[node]! += mass;
      teleportTotal += mass;
    }
  }
  if (teleportTotal <= 0) {
    for (let i = 0; i < N; i++) p[i] = 1 / N;
  } else {
    for (let i = 0; i < N; i++) p[i]! /= teleportTotal;
  }

  const { node_ptr, neighbors, edge_weights } = adjacency;

  // Precompute the weighted out-degree per node (sum of incident edge weights).
  const outWeight = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    let sum = 0;
    for (let k = node_ptr[i]!; k < node_ptr[i + 1]!; k++) sum += edge_weights[k]!;
    outWeight[i] = sum;
  }

  // r_0 = p (start at the personalization vector for fast convergence).
  let r = new Float64Array(p);
  let next = new Float64Array(N);

  let iterations = 0;
  let delta = Number.POSITIVE_INFINITY;
  for (; iterations < maxIterations; ) {
    iterations++;
    // Dangling mass (nodes with no out-edges) is redistributed via p.
    let dangling = 0;
    for (let i = 0; i < N; i++) if (outWeight[i] === 0) dangling += r[i]!;

    // Base: teleport + redistributed dangling mass.
    for (let i = 0; i < N; i++) next[i] = (1 - alpha) * p[i]! + alpha * dangling * p[i]!;

    // Lazy walk: keep `lazy` of each node's walk-mass on itself, spread the rest
    // (`spread = 1 - lazy`) to its weighted neighbors. Lazy retention stops a
    // degree-1 seed from leaking ALL its mass to its lone neighbour (T6) and
    // makes the chain aperiodic (guaranteed convergence).
    for (let i = 0; i < N; i++) {
      const ow = outWeight[i]!;
      if (ow === 0) continue;
      next[i]! += alpha * lazy * r[i]!;
      const share = (alpha * spread * r[i]!) / ow;
      for (let k = node_ptr[i]!; k < node_ptr[i + 1]!; k++) {
        next[neighbors[k]!]! += share * edge_weights[k]!;
      }
    }

    // L1 delta.
    delta = 0;
    for (let i = 0; i < N; i++) delta += Math.abs(next[i]! - r[i]!);

    const tmp = r;
    r = next;
    next = tmp;

    if (delta <= tolerance) break;
  }

  return {
    scores: Array.from(r),
    iterations,
    converged: delta <= tolerance,
    delta,
  };
}
