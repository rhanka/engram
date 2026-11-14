import { assertionIdentityOf, edgeKey } from "./graph.js";
import { compareCodeUnits } from "./graph-json-serialization.js";
/**
 * `search-index.json` emitter (C3) — sibling of the class-hierarchies emitter,
 * run in the same build pass that writes `graph.json`.
 *
 * Builds a self-contained, byte-identically-rebuildable `SearchIndex`:
 *   - BM25F postings over label + description + quote (Piece 1)
 *   - per-doc grounding payload (label, description?, groundingText?) — inline,
 *     scene-only, never a graph.json offset (C3 self-contained grounding)
 *   - CSR adjacency over the undirected entity graph + resolved C7a edge weights
 *     (C3a) — so offline PPR reads adjacency from the index, never graph.json
 *   - per-doc community membership + community_meta {label, salient} (C3a)
 *   - the frozen indexParams block (k1/b/fieldWeights/mappedConfidence/rrfK)
 *   - the C10a `graph_signature` (NOT the citation signature) + an optional
 *     `grounding_signature` (the citation signature of the inline quotes)
 *
 * Determinism (INV-3): docs are sorted by nodeId; CSR neighbors are sorted; the
 * tokenizer is the shared `queryTerms`; the signature is content-only.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type Graph from "graphology";

import { computeCitationSignature } from "./citations.js";
import {
  buildBm25Index,
  type Bm25Doc,
  type Bm25Params,
  defaultBm25Params,
} from "./retrieval/bm25.js";
import { edgeWeight, MAPPED_CONFIDENCE } from "./retrieval/edge-weight.js";
import {
  computeSearchIndexSignature,
  type CommunityMetaEntry,
  type CsrAdjacency,
  type SearchIndex,
  type SearchIndexDoc,
  type SearchIndexParams,
  SEARCH_INDEX_SCHEMA,
} from "./search-index.js";
import { toUndirectedGraph } from "./graph.js";
import type { OntologyCitation } from "./types.js";

export const SEARCH_INDEX_FILENAME = "search-index.json";

/** Default RRF k (C5). Serialized into indexParams so a retune flips the sig. */
export const DEFAULT_RRF_K = 60;

function communityOf(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim().length > 0) {
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return -1;
}

/** The first verbatim citation `quote` on a node, where present (C2/C13). */
function firstQuote(attrs: Record<string, unknown>): string | undefined {
  const citations = attrs.citations;
  if (!Array.isArray(citations)) return undefined;
  for (const c of citations as OntologyCitation[]) {
    if (c && typeof c.quote === "string" && c.quote.trim().length > 0) {
      return c.quote;
    }
  }
  return undefined;
}

/** Resolve a community label per the shared precedence (community-labeling.ts). */
function resolveCommunityLabels(G: Graph): Map<number, string> {
  const labels = new Map<number, string>();
  const graphLabels = G.getAttribute("community_labels") as Record<string, unknown> | undefined;
  if (graphLabels && typeof graphLabels === "object") {
    for (const [key, value] of Object.entries(graphLabels)) {
      const cid = Number.parseInt(key, 10);
      if (Number.isNaN(cid)) continue;
      if (typeof value === "string" && value.trim().length > 0) labels.set(cid, value.trim());
    }
  }
  G.forEachNode((_id, attrs) => {
    const cid = communityOf((attrs as Record<string, unknown>).community);
    if (cid < 0 || labels.has(cid)) return;
    const name = (attrs as Record<string, unknown>).community_name;
    if (typeof name === "string" && name.trim().length > 0) labels.set(cid, name.trim());
  });
  return labels;
}

/** A community is salient when it has a real (non-`Community <id>`) label. */
function isSalientLabel(cid: number, label: string): boolean {
  return label.trim().length > 0 && label.trim() !== `Community ${cid}`;
}

export interface BuildSearchIndexOptions {
  /** BM25 params (defaults to the Phase A defaults). */
  bm25Params?: Bm25Params;
  /** RRF k (default 60). */
  rrfK?: number;
}

/**
 * Build the in-memory {@link SearchIndex} from a loaded graphology graph. Pure
 * (no I/O), so it is reusable from tests + the studio/server paths.
 */
export function buildSearchIndex(G: Graph, options: BuildSearchIndexOptions = {}): SearchIndex {
  const bm25Params = options.bm25Params ?? defaultBm25Params();
  const rrfK = options.rrfK ?? DEFAULT_RRF_K;

  // 1. Sorted-nodeId order fixes the docId order for EVERYTHING (docs, CSR,
  //    community array) — the byte-identical-rebuild invariant (INV-3).
  const nodeIds = [...G.nodes()].sort();
  const docIndex = new Map<string, number>();
  nodeIds.forEach((id, i) => docIndex.set(id, i));

  const docs: SearchIndexDoc[] = [];
  const bm25Docs: Bm25Doc[] = [];
  const communityArr: number[] = [];
  // For the signature: nodeId -> {label, description?, community}.
  const sigNodes: Record<string, { label: string; description?: string; community: number }> = {};

  for (const id of nodeIds) {
    const attrs = G.getNodeAttributes(id) as Record<string, unknown>;
    const label = typeof attrs.label === "string" ? attrs.label : id;
    const description = typeof attrs.description === "string" && attrs.description.length > 0
      ? attrs.description
      : undefined;
    const groundingText = firstQuote(attrs);
    const community = communityOf(attrs.community);
    const nodeType = typeof attrs.type === "string" && attrs.type.length > 0 ? attrs.type : undefined;

    const doc: SearchIndexDoc = { nodeId: id, label, community };
    if (nodeType !== undefined) doc.type = nodeType;
    if (description !== undefined) doc.description = description;
    if (groundingText !== undefined) doc.groundingText = groundingText;
    docs.push(doc);

    const bdoc: Bm25Doc = { label };
    if (description !== undefined) bdoc.description = description;
    if (groundingText !== undefined) bdoc.quote = groundingText;
    bm25Docs.push(bdoc);

    communityArr.push(community);
    sigNodes[id] = description === undefined
      ? { label, community }
      : { label, description, community };
  }

  const bm25 = buildBm25Index(bm25Docs, bm25Params);

  // 2. CSR adjacency over the UNDIRECTED entity graph (mirror cluster.ts:32).
  //    Parallel-edge weights are summed (Open Decision 9 = sum), deterministic.
  const U = toUndirectedGraph(G);
  const N = nodeIds.length;
  // Build a sorted neighbor->summedWeight map per docId.
  const neighborWeights: Array<Map<number, number>> = nodeIds.map(() => new Map<number, number>());
  // For the signature edge projection (undirected, canonical srcId<=dstId).
  const edgeWeightMap = new Map<string, [string, string, number]>();

  const pairMembers = new Map<string, { a: string; b: string; members: Array<{ key: string; weight: number }> }>();
  U.forEachEdge((_edge, attrs, source, target) => {
    if (source === target || !docIndex.has(source) || !docIndex.has(target)) return;
    const [a, b] = (source <= target ? [source, target] : [target, source]) as [string, string];
    const key = JSON.stringify([a, b]);
    const group = pairMembers.get(key) ?? { a, b, members: [] as Array<{ key: string; weight: number }> };
    const identity = assertionIdentityOf(source, target, attrs);
    group.members.push({ key: edgeKey(identity.src, identity.tgt, identity.relation), weight: edgeWeight(attrs) });
    pairMembers.set(key, group);
  });
  for (const [key, group] of pairMembers) {
    group.members.sort((a, b) => compareCodeUnits(a.key, b.key));
    const weight = group.members.reduce((sum, member) => sum + member.weight, 0);
    const s = docIndex.get(group.a)!, t = docIndex.get(group.b)!;
    neighborWeights[s]!.set(t, weight);
    neighborWeights[t]!.set(s, weight);
    edgeWeightMap.set(key, [group.a, group.b, weight]);
  }

  const node_ptr: number[] = new Array(N + 1).fill(0);
  const neighbors: number[] = [];
  const edge_weights: number[] = [];
  for (let i = 0; i < N; i++) {
    node_ptr[i] = neighbors.length;
    const entries = [...neighborWeights[i]!.entries()].sort((a, b) => a[0] - b[0]);
    for (const [nb, w] of entries) {
      neighbors.push(nb);
      edge_weights.push(w);
    }
  }
  node_ptr[N] = neighbors.length;
  const adjacency: CsrAdjacency = { node_ptr, neighbors, edge_weights };

  // 3. community_meta {label, salient}.
  const labels = resolveCommunityLabels(G);
  const presentCommunities = new Set<number>();
  for (const c of communityArr) if (c >= 0) presentCommunities.add(c);
  const community_meta: Record<string, CommunityMetaEntry> = {};
  for (const cid of [...presentCommunities].sort((a, b) => a - b)) {
    const label = labels.get(cid) ?? `Community ${cid}`;
    community_meta[String(cid)] = { label, salient: isSalientLabel(cid, label) };
  }

  // 4. indexParams (the frozen block).
  const indexParams: SearchIndexParams = {
    k1: bm25Params.k1,
    b: bm25Params.b,
    fieldWeights: { ...bm25Params.fieldWeights },
    mappedConfidence: { ...MAPPED_CONFIDENCE },
    rrfK,
  };

  // 5. The signatures.
  const graph_signature = computeSearchIndexSignature({
    nodes: sigNodes,
    edges: [...edgeWeightMap.values()],
    communityMeta: community_meta,
    indexParams,
  });
  const grounding_signature = computeCitationSignature(G);

  const index: SearchIndex = {
    schema: SEARCH_INDEX_SCHEMA,
    graph_signature,
    grounding_signature,
    docs,
    bm25,
    adjacency,
    community: communityArr,
    community_meta,
    indexParams,
  };
  return index;
}

export interface EmitSearchIndexOptions extends BuildSearchIndexOptions {
  /** Output dir — `search-index.json` is written there. */
  outDir: string;
}

export interface EmitSearchIndexResult {
  path: string;
  index: SearchIndex;
}

/**
 * Serialize a {@link SearchIndex} to canonical JSON. Pretty-printed for stable
 * diffs (byte-identical given identical inputs).
 */
export function serializeSearchIndex(index: SearchIndex): string {
  return JSON.stringify(index);
}

/** Build + write `search-index.json` deterministically. */
export function emitSearchIndex(G: Graph, options: EmitSearchIndexOptions): EmitSearchIndexResult {
  const index = buildSearchIndex(G, options);
  const target = join(options.outDir, SEARCH_INDEX_FILENAME);
  const dir = dirname(target);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(target, serializeSearchIndex(index), "utf-8");
  return { path: target, index };
}
