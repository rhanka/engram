/**
 * In-browser GraphRAG retrieval view-model (work-stream C, Phase A).
 *
 * This is the thin studio-side adapter over the SAME offline answer-pack the
 * `graphify answer` CLI / `answer_graph` MCP tool produce. It runs
 * `assembleAnswerPack` (BM25 seeds → RRF fuse → personalized PPR → specificity
 * lift-over-background re-rank → structural-type demotion) entirely IN THE
 * BROWSER over the bundled `search-index.json`. NO LLM, NO key, NO network, NO
 * graph.json — the index is self-contained (postings + CSR adjacency + community
 * membership), so the whole pipeline is pure compute.
 *
 * HONESTY (the user's explicit intent): without an LLM there is NO synthesized
 * prose answer. What C delivers is GROUNDED RETRIEVAL — a ranked set of relevant
 * entities, each with its retrieval SCORE, type and grounding quote, that an LLM
 * would answer FROM. So `answer` from an offline pack is always null and this
 * view-model NEVER fabricates an answer string; it surfaces the ranked evidence
 * and labels it as retrieval, not as an answer.
 *
 * ONLINE SEAM (architect cadrage D2/D3 — deferred, NOT implemented here): the
 * view-model carries an explicit `answer: string | null` field as the typed
 * contract for the future online prose. OFFLINE it is ALWAYS `null` (the
 * assembler emits `answer: null` outside ONLINE mode), so nothing fabricates
 * prose. When the chat-lane lands the llm-gateway (WP16) + the `@sentropic/chat-ui`
 * markdown primitive, the ONLINE channel fills this same field and the panel
 * mounts the prose renderer into its empty answer slot — no shape change here.
 *
 * The assembler is imported through the `@graphify/retrieval` vite alias (→
 * `src/retrieval/answer-pack.ts`). The whole chain is dependency-free pure TS, so
 * it bundles into the SPA byte-for-byte with the Node build.
 */

import { assembleAnswerPack } from "@graphify/retrieval";

/**
 * Build the Answer-view model for a question over a parsed search index.
 *
 * Returns a plain, render-ready shape (no methods, no class instances) so it is
 * trivially testable and so Svelte's reactivity sees a fresh object:
 *
 *   {
 *     question,
 *     refused,            // true when no lexical seed matched (nothing to rank)
 *     mode: "offline",    // always offline in-browser (no LLM)
 *     answer: null,       // ONLINE SEAM (D2/D3): prose; ALWAYS null offline, never fabricated
 *     top: <RankedEntity>|null,   // the single most-relevant entity ("most relevant")
 *     entities: RankedEntity[],   // the ranked relevant entities (top excluded? no — included at 0)
 *     seeds: { nodeId, label, bm25, fusedRank }[],   // the lexical BM25/RRF seeds
 *     communities: { id, label, salient }[],
 *     graphSignature, groundingSignature,
 *   }
 *
 * RankedEntity = {
 *   nodeId, label, type|null, rank (1-based),
 *   score,            // the final rank score: specificity × structural-demotion
 *   specificity,      // lift over query-agnostic background centrality
 *   ppr,              // the raw personalized PPR mass (HippoRAG expansion score)
 *   community,
 *   description|null,
 *   quote|null,       // the verbatim grounding span, where the index carries one
 *   structural,       // true when the type is a structural/document container
 * }
 *
 * @param {object} index   a parsed `search-index.json` (graphify_search_index_v1)
 * @param {string} question
 * @param {object} [options]  forwarded to assembleAnswerPack (neighborhoodSize,
 *                            subQueries, structuralDemotion, specificityPrior…)
 */
export function buildAnswerView(index, question, options = {}) {
  const q = typeof question === "string" ? question.trim() : "";
  if (!index || !q) {
    return emptyView(q);
  }

  const pack = assembleAnswerPack(index, q, { mode: "offline", ...options });
  const refused = Boolean(pack.retrieval?.ppr?.refused);

  // Re-derive the structural flag + 1-based rank for display. The pack's
  // neighborhood is ALREADY sorted by the final rank score (specificity ×
  // structural-demotion), so the rank is just the array index. We recompute the
  // displayed `score` from specificity to avoid re-deriving the demotion factor
  // here — the demotion is encoded in the ORDER, and we surface specificity (the
  // lift) as the human-readable relevance number plus the raw ppr.
  const entities = (pack.neighborhood ?? []).map((n, i) => ({
    nodeId: n.node_id,
    label: n.label,
    type: n.type ?? null,
    rank: i + 1,
    // `specificity` is the lift-over-background the neighborhood is ranked by;
    // it is the most meaningful single relevance number to show. `ppr` is the
    // raw personalized mass (kept for the curious / debugging).
    score: typeof n.specificity === "number" ? n.specificity : 0,
    specificity: typeof n.specificity === "number" ? n.specificity : 0,
    ppr: typeof n.ppr === "number" ? n.ppr : 0,
    community: typeof n.community === "number" ? n.community : -1,
    description: n.description ?? null,
    quote: firstQuote(n.grounding),
  }));

  const seeds = (pack.retrieval?.seeds ?? []).map((s) => ({
    nodeId: s.node_id,
    label: s.label,
    bm25: typeof s.bm25 === "number" ? s.bm25 : null,
    fusedRank: s.fused_rank,
  }));

  const communities = (pack.communities ?? []).map((c) => ({
    id: c.id,
    label: c.label,
    salient: Boolean(c.salient),
  }));

  return {
    question: q,
    refused,
    mode: pack.mode ?? "offline",
    // ONLINE SEAM (D2/D3): the prose answer. OFFLINE packs always carry null
    // (the assembler only fills it in ONLINE mode); we pass it through verbatim
    // and NEVER synthesize one here. The online channel later sets this field.
    answer: typeof pack.answer === "string" ? pack.answer : null,
    top: entities.length > 0 ? entities[0] : null,
    entities,
    seeds,
    communities,
    graphSignature: pack.graph_signature ?? null,
    groundingSignature: pack.grounding_signature ?? null,
  };
}

/** The empty (no-question / no-index) view-model — same shape, all empty. */
function emptyView(question) {
  return {
    question: question ?? "",
    refused: false,
    mode: "offline",
    answer: null, // ONLINE SEAM (D2/D3): null until the online channel fills it.
    top: null,
    entities: [],
    seeds: [],
    communities: [],
    graphSignature: null,
    groundingSignature: null,
  };
}

/** The first verbatim grounding quote, where the pack carries one (else null). */
function firstQuote(grounding) {
  if (!Array.isArray(grounding) || grounding.length === 0) return null;
  const q = grounding[0]?.quote;
  return typeof q === "string" && q.length > 0 ? q : null;
}

/**
 * Format a relevance score for compact display. The specificity numbers are
 * small ratios on a wide dynamic range, so a fixed-precision render is more
 * legible than the raw float. Returns a short string like "12.4" or "0.83".
 */
export function formatScore(score) {
  if (typeof score !== "number" || !Number.isFinite(score)) return "—";
  if (score === 0) return "0";
  if (score >= 100) return score.toFixed(0);
  if (score >= 10) return score.toFixed(1);
  return score.toFixed(2);
}
