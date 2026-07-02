/**
 * In-browser BM25 query (C4) + the seed layer (C5a steps 1–2).
 *
 * Pure compute — no model, no key, no fetch. Consumes a PARSED SearchIndex
 * (from a `file://` fetch, or the inlined `window.__GRAPHIFY_BUNDLE__
 * ["search-index.json"]` once work-stream A lands), runs BM25 over it via the
 * SAME `queryTerms` tokenizer the index was built with (index == query), and
 * returns the ranked seed list the shared retrieval core consumes.
 *
 * This module imports ONLY pure TS (bm25, rrf, search tokenizer) — no Node I/O —
 * so it is loadable inside a double-clicked studio.html with zero network.
 */

import { scoreBm25, type Bm25Hit } from "./bm25.js";
import {
  DEFAULT_RRF_K,
  reciprocalRankFusion,
  type RankedList,
} from "./rrf.js";
import { queryTerms } from "../search.js";
import type { SearchIndex } from "../search-index.js";

/** A BM25 seed hit, surfaced to the core as [{nodeId, bm25Score, rank}]. */
export interface SeedHit {
  nodeId: string;
  bm25Score: number;
  rank: number;
}

/** Run BM25 over the index for a single query string → the ranked seed list. */
export function bm25Query(index: SearchIndex, question: string): SeedHit[] {
  const tokens = queryTerms(question);
  const hits: Bm25Hit[] = scoreBm25(index.bm25, tokens);
  return hits.map((h, i) => ({
    nodeId: index.docs[h.doc]!.nodeId,
    bm25Score: h.score,
    rank: i + 1,
  }));
}

export interface FusedSeed {
  nodeId: string;
  /** RRF-fused score across the seed lists. */
  fusedScore: number;
  /** 1-based fused rank. */
  fusedRank: number;
  /** BM25 score from the primary BM25 list, when the node appears there. */
  bm25Score?: number;
}

export interface SeedOptions {
  /**
   * Optional host multi-query sub-queries (C11/A6). The host assistant emits
   * these for free; graphify runs BM25 over each and RRF-fuses the lists.
   */
  subQueries?: string[];
  /** RRF k (defaults to the index's serialized rrfK, else 60). */
  rrfK?: number;
  /** Cap the number of seeds returned (after fusion). Default: all. */
  limit?: number;
}

export interface SeedResult {
  seeds: FusedSeed[];
  fusion: { method: "rrf"; k: number; lists: string[] };
}

/**
 * The seed seam (C5a steps 1–2): run BM25 for the main question + each host
 * sub-query, then RRF-fuse the ranked lists into one fused-seed ranking. With a
 * single list (no sub-queries) RRF is the identity, so the pipeline shape is
 * unchanged.
 */
export function buildSeeds(index: SearchIndex, question: string, options: SeedOptions = {}): SeedResult {
  const k = options.rrfK ?? index.indexParams?.rrfK ?? DEFAULT_RRF_K;

  const primary = bm25Query(index, question);
  const bm25ScoreById = new Map<string, number>();
  for (const h of primary) bm25ScoreById.set(h.nodeId, h.bm25Score);

  const lists: RankedList[] = [primary.map((h) => h.nodeId)];
  const listNames: string[] = ["bm25"];
  for (const sub of options.subQueries ?? []) {
    const subHits = bm25Query(index, sub);
    if (subHits.length === 0) continue;
    lists.push(subHits.map((h) => h.nodeId));
    listNames.push(`multiquery:${sub}`);
  }

  const fused = reciprocalRankFusion(lists, { k });
  let seeds: FusedSeed[] = fused.map((f) => {
    const seed: FusedSeed = { nodeId: f.id, fusedScore: f.score, fusedRank: f.rank };
    const bm25 = bm25ScoreById.get(f.id);
    if (bm25 !== undefined) seed.bm25Score = bm25;
    return seed;
  });
  if (typeof options.limit === "number" && options.limit >= 0) {
    seeds = seeds.slice(0, options.limit);
  }

  return { seeds, fusion: { method: "rrf", k, lists: listNames } };
}

/**
 * The normalized fused-seed personalization vector (C5a step 3): nodeId →
 * normalized weight, summing to 1 over the seed set. This is what PPR teleports
 * to (HippoRAG seed mass on the FUSED lexical hits, not a raw single BM25 list).
 */
export function fusedSeedVector(seeds: FusedSeed[]): Map<string, number> {
  const vector = new Map<string, number>();
  let total = 0;
  for (const s of seeds) total += s.fusedScore;
  if (total <= 0) {
    // Degenerate (no positive mass) → uniform over the seed set.
    const n = seeds.length;
    if (n === 0) return vector;
    for (const s of seeds) vector.set(s.nodeId, 1 / n);
    return vector;
  }
  for (const s of seeds) vector.set(s.nodeId, s.fusedScore / total);
  return vector;
}
