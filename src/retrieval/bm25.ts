/**
 * Okapi BM25 / BM25F core — the lexical floor for work-stream C (Phase A).
 *
 * This is a REAL ranker, unlike `scoreSearchText` (`src/search.ts:55`), which is
 * naive term-overlap (no IDF, no TF saturation, no length normalization, and it
 * never reads the entity body). The BM25F variant scores three weighted fields
 * per entity document — `label` (high), `description` (mid), `quote` (mid) — with:
 *
 *   - IDF       per-term, over the entity-document corpus
 *   - TF-sat    Okapi `k1` saturation (default 1.2)
 *   - len-norm  Okapi `b` length-norm (default 0.75) against the avg field length
 *
 * Index and query MUST tokenize identically — the emitter and the in-browser
 * query both call the shared `queryTerms` (`src/search.ts:25`). This module is
 * dependency-free pure TS (INV-5) so the same code runs in Node (build/emit) and
 * the browser (query) byte-for-byte.
 */

import { queryTerms } from "../search.js";

/** The three BM25F fields, in deterministic (sorted) order. */
export const BM25_FIELDS = ["label", "description", "quote"] as const;
export type Bm25Field = (typeof BM25_FIELDS)[number];

/** Default BM25F field weights (label highest, body fields mid). */
export const DEFAULT_FIELD_WEIGHTS: Record<Bm25Field, number> = {
  label: 3,
  description: 1.5,
  quote: 1.5,
};

/** Okapi defaults. */
export const DEFAULT_K1 = 1.2;
export const DEFAULT_B = 0.75;

export interface Bm25Params {
  k1: number;
  b: number;
  /** Per-field weights (BM25F). */
  fieldWeights: Record<Bm25Field, number>;
}

export function defaultBm25Params(): Bm25Params {
  return {
    k1: DEFAULT_K1,
    b: DEFAULT_B,
    fieldWeights: { ...DEFAULT_FIELD_WEIGHTS },
  };
}

/** A single posting: term frequency of a term within one field of one doc. */
export interface FieldPosting {
  /** Doc index (into the `docs` table). */
  d: number;
  /** Per-field term frequencies, parallel to {@link BM25_FIELDS}. */
  tf: Record<Bm25Field, number>;
}

/**
 * The serializable BM25F index. Hand-rolled over the shared tokenizer (Open
 * Decision 1 → hand-rolled: zero new runtime dep, owns determinism). Postings,
 * per-doc/per-field lengths, corpus stats, and the param block — everything the
 * in-browser query needs, with no external library.
 */
export interface Bm25Index {
  /** Number of documents. */
  N: number;
  /** term → postings (one entry per doc the term appears in, any field). */
  postings: Record<string, FieldPosting[]>;
  /** Per-doc, per-field token counts (lengths), parallel to {@link BM25_FIELDS}. */
  fieldLengths: Array<Record<Bm25Field, number>>;
  /** Average field length across the corpus, per field. */
  avgFieldLength: Record<Bm25Field, number>;
  /** BM25 params. */
  params: Bm25Params;
}

/** Tokenize a field value via the shared tokenizer (index = query). */
export function tokenizeField(value: string | undefined | null): string[] {
  if (!value) return [];
  return queryTerms(value);
}

/** Input doc for index construction. */
export interface Bm25Doc {
  label: string;
  description?: string;
  quote?: string;
}

/**
 * Build a BM25F index from an ORDERED list of docs (caller fixes the order — in
 * the emitter that is the sorted-nodeId order, for byte-identical rebuilds).
 */
export function buildBm25Index(docs: Bm25Doc[], params: Bm25Params = defaultBm25Params()): Bm25Index {
  const N = docs.length;
  const postings: Record<string, FieldPosting[]> = {};
  const fieldLengths: Array<Record<Bm25Field, number>> = [];
  const totals: Record<Bm25Field, number> = { label: 0, description: 0, quote: 0 };

  for (let d = 0; d < N; d++) {
    const doc = docs[d]!;
    const tokensByField: Record<Bm25Field, string[]> = {
      label: tokenizeField(doc.label),
      description: tokenizeField(doc.description),
      quote: tokenizeField(doc.quote),
    };
    const lengths: Record<Bm25Field, number> = {
      label: tokensByField.label.length,
      description: tokensByField.description.length,
      quote: tokensByField.quote.length,
    };
    fieldLengths.push(lengths);
    totals.label += lengths.label;
    totals.description += lengths.description;
    totals.quote += lengths.quote;

    // Accumulate per-field tf for this doc.
    const docTf = new Map<string, Record<Bm25Field, number>>();
    for (const field of BM25_FIELDS) {
      for (const term of tokensByField[field]) {
        let entry = docTf.get(term);
        if (!entry) {
          entry = { label: 0, description: 0, quote: 0 };
          docTf.set(term, entry);
        }
        entry[field] += 1;
      }
    }
    for (const [term, tf] of docTf) {
      let list = postings[term];
      if (!list) {
        list = [];
        postings[term] = list;
      }
      list.push({ d, tf });
    }
  }

  const avgFieldLength: Record<Bm25Field, number> = {
    label: N > 0 ? totals.label / N : 0,
    description: N > 0 ? totals.description / N : 0,
    quote: N > 0 ? totals.quote / N : 0,
  };

  return { N, postings, fieldLengths, avgFieldLength, params };
}

/**
 * Robertson/Spärck-Jones IDF with the `+0.5` smoothing, floored at 0 so a term
 * appearing in > N/2 docs never contributes a negative score (the standard
 * BM25 non-negativity guard).
 */
export function idf(N: number, df: number): number {
  return Math.max(0, Math.log(1 + (N - df + 0.5) / (df + 0.5)));
}

/** A scored BM25 hit. */
export interface Bm25Hit {
  /** Doc index (into the `docs` table). */
  doc: number;
  /** BM25F score. */
  score: number;
}

/**
 * Score the corpus for a tokenized query, returning hits with score > 0 sorted
 * by score desc then doc index asc (deterministic). The caller tokenizes via
 * `queryTerms` (so the same rule the index used applies to the query).
 */
export function scoreBm25(index: Bm25Index, queryTokens: string[]): Bm25Hit[] {
  const { N, postings, fieldLengths, avgFieldLength, params } = index;
  const { k1, b, fieldWeights } = params;
  if (N === 0 || queryTokens.length === 0) return [];

  const scores = new Map<number, number>();
  // De-dup the query terms but keep IDF per distinct term (repeated query terms
  // do not multiply BM25; the saturated-TF model already handles repetition).
  const seen = new Set<string>();
  for (const term of queryTokens) {
    if (seen.has(term)) continue;
    seen.add(term);
    const list = postings[term];
    if (!list || list.length === 0) continue;
    const termIdf = idf(N, list.length);
    if (termIdf <= 0) continue;
    for (const posting of list) {
      const lengths = fieldLengths[posting.d]!;
      // BM25F: combine fields by weighting the *saturated* per-field tf. We sum
      // the weighted saturated tf across fields, then apply IDF once (BM25F).
      let fieldScore = 0;
      for (const field of BM25_FIELDS) {
        const tf = posting.tf[field];
        if (tf === 0) continue;
        const avgdl = avgFieldLength[field] || 1;
        const norm = 1 - b + b * (lengths[field] / avgdl);
        const sat = (tf * (k1 + 1)) / (tf + k1 * norm);
        fieldScore += fieldWeights[field] * sat;
      }
      if (fieldScore <= 0) continue;
      scores.set(posting.d, (scores.get(posting.d) ?? 0) + termIdf * fieldScore);
    }
  }

  const hits: Bm25Hit[] = [];
  for (const [doc, score] of scores) {
    if (score > 0) hits.push({ doc, score });
  }
  hits.sort((a, b2) => b2.score - a.score || a.doc - b2.doc);
  return hits;
}
