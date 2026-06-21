/**
 * `search-index.json` — the offline-first retrieval substrate (work-stream C,
 * Phase A). Self-contained: it carries the BM25F index, the per-doc grounding
 * payload, AND the graph adjacency (CSR) + community membership PPR/assembly
 * need (C3a), so the offline answer path runs WITHOUT `graph.json`.
 *
 * This module owns the format types + the content signature
 * (`computeSearchIndexSignature`, C10a). The emitter (`search-index-emitter.ts`)
 * builds it from a graphology graph; the in-browser query/PPR/assembler consume
 * it. Pure data + pure functions (no Node I/O here) so the format is usable in
 * the browser too.
 */

import { createHash } from "node:crypto";
import type { Bm25Index } from "./retrieval/bm25.js";

export const SEARCH_INDEX_SCHEMA = "graphify_search_index_v1";

/** Per-doc payload — turns a BM25 hit into a grounded pack entry WITHOUT graph.json. */
export interface SearchIndexDoc {
  nodeId: string;
  label: string;
  description?: string;
  /**
   * The verbatim grounding span, stored INLINE (Open Decision 2 default = inline;
   * self-contained, scene-only, never a graph.json offset). Optional — absent on
   * quote-less corpora (the code-graph case, INV-6).
   */
  groundingText?: string;
  /** Community id (Louvain) for this doc; -1 when unassigned. */
  community: number;
}

/**
 * CSR adjacency over the UNDIRECTED entity graph (mirror cluster.ts:32). For N
 * docs in the same sorted docId order as `docs`:
 *   - node_ptr[i]..node_ptr[i+1] index into neighbors[]/edge_weights[]
 *   - neighbors[k] is a docId, edge_weights[k] the resolved C7a weight
 */
export interface CsrAdjacency {
  node_ptr: number[];
  neighbors: number[];
  edge_weights: number[];
}

/** community id → its label + salience (the existing Louvain labels). */
export interface CommunityMetaEntry {
  label: string;
  salient: boolean;
}

/** The serialized BM25F + adjacency + community index params block. */
export interface SearchIndexParams {
  k1: number;
  b: number;
  fieldWeights: Record<string, number>;
  /** FROZEN — Phase A default {EXTRACTED:1.0, INFERRED:0.6, AMBIGUOUS:0.3} (C7a). */
  mappedConfidence: Record<string, number>;
  /** RRF fusion k (default 60). */
  rrfK: number;
}

export interface SearchIndex {
  schema: typeof SEARCH_INDEX_SCHEMA;
  /** Index/graph CONTENT hash of C10a (NOT the citation signature). */
  graph_signature: string;
  /** Optional: citation signature of the inline quotes (C10a) — grounding-only. */
  grounding_signature?: string;
  /** Doc table, in sorted-nodeId order (== CSR/community array order). */
  docs: SearchIndexDoc[];
  /** The BM25F postings index. */
  bm25: Bm25Index;
  /** Self-carried CSR adjacency (C3a). */
  adjacency: CsrAdjacency;
  /** Self-carried per-doc community membership (length N). */
  community: number[];
  /** Self-carried community labels + salience. */
  community_meta: Record<string, CommunityMetaEntry>;
  /** The serialized param block (covered by the signature). */
  indexParams: SearchIndexParams;
}

/**
 * Inputs for `computeSearchIndexSignature` — the canonical projection of
 * EVERYTHING PPR/retrieval depend on. Pre-projected by the emitter (it already
 * walks the graph) so this stays a pure hash over plain data.
 */
export interface SearchIndexSignatureInput {
  /** nodeId → {label, description?, community} (sorted by the function). */
  nodes: Record<string, { label: string; description?: string; community: number }>;
  /**
   * Sorted edge projection: each entry [srcId, dstId, resolvedWeight], srcId <=
   * dstId (undirected, canonical orientation). The function re-sorts for safety.
   */
  edges: Array<[string, string, number]>;
  /** communityId → {label, salient} (sorted by the function). */
  communityMeta: Record<string, CommunityMetaEntry>;
  /** The serialized index params. */
  indexParams: SearchIndexParams;
}

/**
 * `computeSearchIndexSignature(G, indexParams)` (C10a) — sha256 over the sorted,
 * canonical projection of labels + descriptions + community membership + the
 * sorted edge projection with resolved weights (C7a) + the sorted `community_meta`
 * projection (labels + salience) + the serialized indexParams.
 *
 * Follows the SAME discipline as `computeCitationSignature` (sorted keys,
 * content-only, not mtime/size) but covers the FULL retrieval substrate — so a
 * graph whose edges OR community labels changed (even with no citation change)
 * flips this signature. It is explicitly NOT `computeCitationSignature`.
 */
export function computeSearchIndexSignature(input: SearchIndexSignatureInput): string {
  const nodeIds = Object.keys(input.nodes).sort();
  const nodeProjection = nodeIds.map((id) => {
    const n = input.nodes[id]!;
    // Omit `description` when absent so quote-less / description-less corpora
    // hash stably (an explicit `undefined` would still serialize distinctly).
    return n.description === undefined
      ? ([id, { label: n.label, community: n.community }] as const)
      : ([id, { label: n.label, description: n.description, community: n.community }] as const);
  });

  const edgeProjection = [...input.edges]
    .map(([a, b, w]) => (a <= b ? [a, b, w] : [b, a, w]) as [string, string, number])
    .sort((x, y) => (x[0] === y[0] ? x[1].localeCompare(y[1]) : x[0].localeCompare(y[0])));

  const communityIds = Object.keys(input.communityMeta).sort();
  const communityProjection = communityIds.map((id) => {
    const m = input.communityMeta[id]!;
    return [id, { label: m.label, salient: m.salient }] as const;
  });

  const canonical = {
    nodes: nodeProjection,
    edges: edgeProjection,
    community_meta: communityProjection,
    indexParams: input.indexParams,
  };

  const hash = createHash("sha256");
  hash.update(JSON.stringify(canonical));
  return hash.digest("hex");
}
