/**
 * `graphify answer` / the answer-pack assembler (Piece 4, LazyGraphRAG — C8-C10).
 *
 * This is the LazyGraphRAG embodiment: NO LLM at index time (index cost = the
 * BM25 index), and at query time the one shared retrieval core runs
 * `seed → expand → ground → assemble`, then hands the frozen
 * `graphify_answer_pack_v1` to the HOST assistant for the relevance-test +
 * synthesis it does for free (no key for graphify).
 *
 * It runs the C5a pipeline EXACTLY:
 *   1. Seed signals   → BM25 over the index for the question + each host
 *                       multi-query sub-query (Piece 1).
 *   2. RRF-fuse seeds → one fused-seed ranking (Piece 2 / C5a step 2; identity
 *                       over a single list).
 *   3. PPR personalize→ teleport = the NORMALIZED FUSED-SEED scores (C5a step 3,
 *                       HippoRAG), power-iterated over the self-carried CSR
 *                       adjacency (Piece 3 / C3a — offline, no graph.json).
 *   4. Final rank     → the PPR stationary distribution is the expansion ranking
 *                       (C5a step 4), + community-guided traversal + PathRAG-style
 *                       pruned connecting paths.
 *
 * Adjacency + community membership come SELF-CARRIED from `search-index.json`
 * (C3a), so the whole offline answer path runs with zero network and no
 * graph.json (INV-1). The three modes (OFFLINE / ONLINE / AGENT) share THIS code
 * and THIS contract; they differ only in the seed source and the answerer
 * (INV-2). `answer` is null in OFFLINE/AGENT for the host to fill.
 */

import { buildSeeds, fusedSeedVector, type FusedSeed, type SeedOptions } from "./query.js";
import { personalizedPageRank, type PprOptions } from "./ppr.js";
import type { CsrAdjacency, SearchIndex } from "../search-index.js";

export const ANSWER_PACK_SCHEMA = "graphify_answer_pack_v1";

export type AnswerMode = "offline" | "online" | "agent";

/** A seed entry as surfaced in the pack (C10 `retrieval.seeds`). */
export interface PackSeed {
  node_id: string;
  label: string;
  bm25?: number;
  fused_rank: number;
}

/** A grounding span (C10 `neighborhood[].grounding[]`). Quote is optional (INV-6). */
export interface PackGrounding {
  quote: string;
  source_file?: string;
  page?: number | string;
  section?: string;
}

/** A neighborhood entry (C10 `neighborhood[]`). */
export interface PackNeighbor {
  node_id: string;
  label: string;
  ppr: number;
  community: number;
  description?: string;
  grounding?: PackGrounding[];
}

/** A PathRAG-pruned connecting path (C10 `paths[]`). */
export interface PackPath {
  nodes: string[];
  reliability: number;
}

/** A community context entry (C10 `communities[]`). */
export interface PackCommunity {
  id: number;
  label: string;
  salient: boolean;
}

/** The frozen cross-mode contract `graphify_answer_pack_v1` (C10). */
export interface AnswerPack {
  schema: typeof ANSWER_PACK_SCHEMA;
  graph_signature: string;
  grounding_signature?: string;
  question: string;
  mode: AnswerMode;
  retrieval: {
    seeds: PackSeed[];
    fusion: { method: "rrf"; k: number; lists: string[] };
    ppr: {
      alpha: number;
      iterations: number;
      tolerance: number;
      seeded_by: "fused-seed";
      refused: boolean;
    };
  };
  neighborhood: PackNeighbor[];
  paths: PackPath[];
  communities: PackCommunity[];
  budget: { token_budget: number; relevance_tests_proposed: number };
  answer: string | null;
}

export interface AnswerPackOptions extends SeedOptions {
  /** Pack mode (default "offline"). ONLINE may fill `answer`; OFFLINE/AGENT leave null. */
  mode?: AnswerMode;
  /** PPR knobs (alpha/tolerance/maxIterations/lazy) — forwarded to the expander. */
  ppr?: PprOptions;
  /** Max neighborhood entries returned (default 20). */
  neighborhoodSize?: number;
  /** Max connecting paths returned (default 8). */
  maxPaths?: number;
  /** Token budget surfaced in the pack (default 2000). */
  tokenBudget?: number;
  /**
   * Pre-filled answer (ONLINE mode only, when a host LLM is configured). OFFLINE
   * and AGENT always emit `answer: null` for the host to fill (C10).
   */
  answer?: string | null;
}

const DEFAULT_NEIGHBORHOOD_SIZE = 20;
const DEFAULT_MAX_PATHS = 8;
const DEFAULT_TOKEN_BUDGET = 2000;
/** PathRAG distance-decay: reliability = DECAY ** (hops). */
const PATH_DECAY = 0.8;

/**
 * BFS shortest path between two docIds over the CSR adjacency (undirected). The
 * path is the node sequence (docIds); empty when disconnected. Deterministic:
 * neighbors are already in sorted docId order in the CSR.
 */
function shortestPathCsr(adjacency: CsrAdjacency, N: number, from: number, to: number): number[] {
  if (from === to) return [from];
  const { node_ptr, neighbors } = adjacency;
  const prev = new Int32Array(N).fill(-1);
  const seen = new Uint8Array(N);
  seen[from] = 1;
  let frontier: number[] = [from];
  while (frontier.length > 0) {
    const nextFrontier: number[] = [];
    for (const u of frontier) {
      for (let k = node_ptr[u]!; k < node_ptr[u + 1]!; k++) {
        const v = neighbors[k]!;
        if (seen[v]) continue;
        seen[v] = 1;
        prev[v] = u;
        if (v === to) {
          // Reconstruct.
          const path: number[] = [];
          let cur = to;
          while (cur !== -1) {
            path.push(cur);
            cur = prev[cur]!;
          }
          path.reverse();
          return path;
        }
        nextFrontier.push(v);
      }
    }
    frontier = nextFrontier;
  }
  return [];
}

/**
 * Assemble a `graphify_answer_pack_v1` for a question over a parsed
 * {@link SearchIndex}. Pure compute — no key, no network, no graph.json. This is
 * the single code path the three modes share (INV-2); the caller chooses the
 * seed source (here BM25 + optional host sub-queries) and the answerer.
 */
export function assembleAnswerPack(
  index: SearchIndex,
  question: string,
  options: AnswerPackOptions = {},
): AnswerPack {
  const mode: AnswerMode = options.mode ?? "offline";
  const neighborhoodSize = options.neighborhoodSize ?? DEFAULT_NEIGHBORHOOD_SIZE;
  const maxPaths = options.maxPaths ?? DEFAULT_MAX_PATHS;
  const tokenBudget = options.tokenBudget ?? DEFAULT_TOKEN_BUDGET;

  const N = index.docs.length;
  const docIndex = new Map<string, number>();
  index.docs.forEach((d, i) => docIndex.set(d.nodeId, i));

  // ---- C5a steps 1-2: seed → RRF-fuse ----
  const seedOptions: SeedOptions = {};
  if (options.subQueries !== undefined) seedOptions.subQueries = options.subQueries;
  if (options.rrfK !== undefined) seedOptions.rrfK = options.rrfK;
  if (options.limit !== undefined) seedOptions.limit = options.limit;
  const { seeds, fusion } = buildSeeds(index, question, seedOptions);

  // ---- C5a step 3: PPR personalized by the NORMALIZED FUSED-SEED scores ----
  const vector = fusedSeedVector(seeds);
  const teleport = new Map<number, number>();
  for (const [nodeId, mass] of vector) {
    const d = docIndex.get(nodeId);
    if (d !== undefined) teleport.set(d, mass);
  }
  const refused = teleport.size === 0; // no lexical seed matched the query
  const pprOptions: PprOptions = options.ppr ?? {};
  const ppr = personalizedPageRank(index.adjacency, N, teleport, pprOptions);

  // ---- C5a step 4: final expansion rank = PPR + community-guided traversal ----
  // Rank all nodes by PPR desc, docId asc (deterministic). Drop zero-mass nodes
  // (unreachable from the seeds) so the neighborhood is the seeded sub-graph.
  // When refused (no lexical seed), there is nothing to expand: PPR would fall
  // back to UNIFORM mass over every node, which is NOT a seeded neighborhood — so
  // the refused pack carries an empty neighborhood/paths and leaves synthesis to
  // the host (it still reports the PPR run that proved no seed mass).
  const ranked: number[] = [];
  if (!refused) {
    for (let i = 0; i < N; i++) if (ppr.scores[i]! > 0) ranked.push(i);
    ranked.sort((a, b) => ppr.scores[b]! - ppr.scores[a]! || a - b);
  }
  const top = ranked.slice(0, neighborhoodSize);

  const neighborhood: PackNeighbor[] = top.map((d) => {
    const doc = index.docs[d]!;
    const entry: PackNeighbor = {
      node_id: doc.nodeId,
      label: doc.label,
      ppr: ppr.scores[d]!,
      community: doc.community,
    };
    if (doc.description !== undefined) entry.description = doc.description;
    // Ground: attach the verbatim quote where present; label+description only
    // otherwise (graceful degradation, the code-graph case — INV-6). The
    // grounding text is self-carried inline in the index (C3 — never a
    // graph.json offset); the source locator (source_file/page/section) is an
    // optional add-on the contract permits where the index carries it.
    if (doc.groundingText !== undefined) {
      entry.grounding = [{ quote: doc.groundingText }];
    }
    return entry;
  });

  // ---- PathRAG-style pruned connecting paths between the top neighborhood ----
  // Connect the top-PPR node to each subsequent top node by shortest path, with a
  // distance-decay reliability so the pack fights GraphRAG-Bench "info overload".
  const paths: PackPath[] = [];
  if (top.length >= 2) {
    const anchor = top[0]!;
    for (let i = 1; i < top.length && paths.length < maxPaths; i++) {
      const target = top[i]!;
      const docPath = shortestPathCsr(index.adjacency, N, anchor, target);
      if (docPath.length < 2) continue; // disconnected or trivial
      const hops = docPath.length - 1;
      paths.push({
        nodes: docPath.map((d) => index.docs[d]!.nodeId),
        reliability: Number(Math.pow(PATH_DECAY, hops).toFixed(6)),
      });
    }
  }

  // ---- Community context: the communities present in the neighborhood ----
  const communityIds = new Set<number>();
  for (const n of neighborhood) if (n.community >= 0) communityIds.add(n.community);
  const communities: PackCommunity[] = [...communityIds]
    .sort((a, b) => a - b)
    .map((id) => {
      const meta = index.community_meta[String(id)];
      return {
        id,
        label: meta?.label ?? `Community ${id}`,
        salient: meta?.salient ?? false,
      };
    });

  // ---- Budget: one relevance-test proposed per grounded neighborhood entry ----
  const relevanceTestsProposed = neighborhood.length;

  // ---- Seeds projected for the pack (C10 retrieval.seeds) ----
  const packSeeds: PackSeed[] = seeds.map((s: FusedSeed) => {
    const doc = docIndex.get(s.nodeId);
    const label = doc !== undefined ? index.docs[doc]!.label : s.nodeId;
    const seed: PackSeed = { node_id: s.nodeId, label, fused_rank: s.fusedRank };
    if (s.bm25Score !== undefined) seed.bm25 = s.bm25Score;
    return seed;
  });

  const pack: AnswerPack = {
    schema: ANSWER_PACK_SCHEMA,
    graph_signature: index.graph_signature,
    question,
    mode,
    retrieval: {
      seeds: packSeeds,
      fusion,
      ppr: {
        alpha: pprOptions.alpha ?? 0.85,
        iterations: ppr.iterations,
        tolerance: pprOptions.tolerance ?? 1e-6,
        seeded_by: "fused-seed",
        refused,
      },
    },
    neighborhood,
    paths,
    communities,
    budget: {
      token_budget: tokenBudget,
      relevance_tests_proposed: relevanceTestsProposed,
    },
    // OFFLINE/AGENT leave null for the host assistant to fill; ONLINE may fill.
    answer: mode === "online" ? options.answer ?? null : null,
  };
  if (index.grounding_signature !== undefined) {
    pack.grounding_signature = index.grounding_signature;
  }

  return pack;
}
