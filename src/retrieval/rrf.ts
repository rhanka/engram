/**
 * Reciprocal Rank Fusion (C5) — the seed-fusion layer.
 *
 * RRF lives at the SEED seam (C5a step 2): it fuses N ranked seed lists (BM25,
 * each host multi-query sub-query's BM25 run, and the Phase-B vector channel)
 * into ONE fused-seed ranking. It is rank-based, no-tuning, deterministic, pure
 * math — and with a SINGLE input list it is the identity over that list (so the
 * pipeline shape is unchanged whether or not fusion has >1 input, C5a step 2).
 *
 *   score(d) = Σ_lists 1/(k + rank_list(d))     (k = 60 default)
 *
 * An optional convex/α combination (Bruch et al. TOIS 2023) is a knob, not the
 * default.
 */

export const DEFAULT_RRF_K = 60;

/** One ranked seed list: ordered ids (rank 1 = index 0). */
export type RankedList = string[];

export interface RrfResult {
  /** node id. */
  id: string;
  /** the fused RRF score. */
  score: number;
  /** 1-based fused rank. */
  rank: number;
}

export interface RrfOptions {
  /** RRF k (default 60). */
  k?: number;
}

/**
 * Fuse N ranked lists by Reciprocal Rank Fusion. Each list is an ORDERED array
 * of node ids (rank 1 = element 0). Returns the fused ranking sorted by score
 * desc; ties break deterministically by id ascending.
 *
 * With one input list, the output order equals the input order (RRF identity).
 */
export function reciprocalRankFusion(lists: RankedList[], options: RrfOptions = {}): RrfResult[] {
  const k = options.k ?? DEFAULT_RRF_K;
  const scores = new Map<string, number>();
  for (const list of lists) {
    for (let i = 0; i < list.length; i++) {
      const id = list[i]!;
      const rank = i + 1; // 1-based
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank));
    }
  }
  const fused: Array<{ id: string; score: number }> = [];
  for (const [id, score] of scores) fused.push({ id, score });
  fused.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return fused.map((entry, i) => ({ id: entry.id, score: entry.score, rank: i + 1 }));
}
