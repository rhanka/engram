# SPEC — Offline-First Search + GraphRAG (work-stream C, Phase A)

## Status

**Target contract — NOT yet implemented.** This spec defines work-stream **C, Phase A**: an
offline-first, no-key, in-browser retrieval + answer layer for graphify. It concretely implements two
techniques the independent benchmark literature says actually pay off — **HippoRAG-style Personalized
PageRank (PPR)** and **LazyGraphRAG** (no index-time LLM; defer relevance/synthesis to the host
assistant at query time) — and the lexical floor they sit on (a real **BM25** index + **RRF** fusion).

Phase A **composes with the offline `file://` studio** (work-stream A, `SPEC_STUDIO_OFFLINE_EXPORT.md`):
the search index ships as one more inlinable sibling artifact **and self-carries the graph adjacency +
community-membership it needs** (C3a), so the in-browser query path runs from a double-clicked `studio.html`
with zero network requests and zero API key — **without** depending on `graph.json` being inlined (work-stream
A's default bundle is scene-only; `graph.json` ships only under `--full-offline`,
`SPEC_STUDIO_OFFLINE_EXPORT.md:154-155`).

The research and double-consensus are settled:
- `.graphify/scratch/RESEARCH_graphrag_techniques.md` — deep-research technique survey, the GraphRAG-Bench
  (arXiv 2506.05690, ICLR'26) + judge-bias (arXiv 2506.06331) verdict, the ranked Phase-A shortlist, and
  the verified substrate facts (§5).
- `.graphify/scratch/CODEX_GRAPHRAG_CONSENSUS.md` — the codex peer review: **AMEND, narrowly**. Two binding
  amendments are folded into this spec: (1) PPR is **graphify-owned** (graphology ships ordinary PageRank,
  not personalized — verified below), not a `graphology-metrics` drop-in; (2) the benchmark must add
  NDCG@k/MRR, bootstrap CIs, a fixed/cached judge, an explicit gold-set protocol, a PPR latency budget, and
  FastGraphRAG as a reference comparator — **all required before Phase B is blessed**.

Framed current-vs-target the way `SPEC_STUDIO_OFFLINE_EXPORT.md` is: **every clause states what exists
today (with `file:line` evidence, re-verified against the code) versus what must be built.** This spec goes
through a **double-consensus review before any implementation.**

---

## Product Identity

graphify already does a *proto-GraphRAG* retrieval: a keyword scorer seeds a few nodes, a BFS/DFS expands
them, and a degree-sorted text pack is returned (`src/serve.ts:335` `toolQueryGraph`; CLI `query`
`src/cli.ts:5081`). Three things are missing for this to be real GraphRAG:

1. The seed scorer is **not BM25** — it is naive term-overlap over `label` + `source_file` only, with no
   IDF, no TF saturation, no length normalization, and **it never reads the entity body** (description /
   quote). Verified `src/search.ts:55-72` (the scorer) and `src/serve.ts:226-234` (`scoreNodes` calls it
   over `data.label` + `data.source_file`). The workspace search index is independently confirmed to be a
   prefix token-gram matcher, "no Lucene/MiniSearch — no BM25" by its own header
   (`src/workspace/search-index.ts:4`).
2. Expansion ranks by **node degree**, not by query relevance — `subgraphToText` degree-sorts the pack
   (`src/serve.ts:284,293`); the CLI pack degree-sorts too (`src/cli.ts:5164`). There is **no PageRank,
   no Personalized PageRank, no rank fusion, no rerank** anywhere in `src/` (grep for
   `pagerank|personalized|rrf|reciprocal|rerank|fusion|bm25` returns zero hits in `serve.ts` and
   `cli.ts`).
3. There is **no synthesis** — `query` emits a text blob, no answer. There is **no `answer`/`ask`
   command** (verified absent in `cli.ts`) and **no `answer_graph` MCP tool** (the MCP tool list is
   `first_hop_summary, review_delta, review_analysis, recommend_commits, query_graph, get_node,
   get_neighbors, get_community, god_nodes, graph_stats, shortest_path` + write tools —
   `src/serve.ts:788-1134`).

Phase A replaces (1)–(3) with a single **shared retrieval core** — **seed → expand → ground → assemble** —
and one frozen output contract, `graphify_answer_pack_v1`. The same core serves three modes (OFFLINE /
ONLINE / AGENT) differing **only** in the seed source and the answerer; the offline mode is the default and
the hard constraint.

**Non-goals:** no index-time LLM (the LazyGraphRAG principle); no community-report summarization (graphify
has only flat Louvain, no hierarchical Leiden, no report artifact — Microsoft GraphRAG-global is skipped per
the research §3 over-hyped call-out); no new runtime dependency in Phase A (PPR reuses `graphology`); no
embeddings, no reranker, no pgvector in Phase A (all deferred to Phase B).

---

## The No-Key Principle (the spine)

Phase A's hard constraint, stronger than "cheap": **graphify's retrieval and answer-pack assembly run with
no API key, no server, and no model download — from a bare `file://` page.** The graph-aware retrieval
(BM25 + RRF + PPR + path/community expansion) is **pure compute**; the only LLM in the loop is the **host
assistant** (the Claude/Codex/Gemini CLI driving graphify, or the studio's host), which performs the
LazyGraphRAG query-time **relevance tests** and **synthesis** for free.

The consensus's wording fix is binding (`CODEX_GRAPHRAG_CONSENSUS.md` §3): **"offline" here means
graphify's retrieval and pack assembly are offline/no-key.** When relevance-testing or synthesis is
delegated to a host assistant that reaches a network LLM, that is **no-key for graphify** but not
necessarily air-gapped. The OFFLINE mode therefore guarantees: *zero keyed calls graphify itself makes,
zero network on the retrieval path*; the answerer is whatever host drives it (in the pure `file://` studio
case, a human reading the pack; in the CLI case, the assistant). A configuration that requires graphify to
hold a key scores **0** on the offline-capability metric regardless of quality (research §2.2).

---

## The Three Modes (one core, two pluggable seams)

All three modes share the **same retrieval core and the same `graphify_answer_pack_v1` output**. They
differ on exactly two seams: the **seed source** and the **answerer**.

| Mode | Seed source | Expansion | Answerer | Key? | Network? |
| --- | --- | --- | --- | --- | --- |
| **OFFLINE** (default; `file://`, in-browser) | BM25 over `search-index.json` (in-browser) | PPR + path/community (pure compute) | **Host assistant** relevance-test + synthesis (no key) | No | No (retrieval); answerer = host |
| **ONLINE** (server + pgvector) | BM25 ⊕ pgvector vector recall, fused by RRF | PPR + path/community (server-side) | Host assistant, or a configured LLM | Only if a keyed embedder/LLM is configured | Yes (server tier) |
| **WITH-RAG-AGENT** (MCP `answer_graph`) | BM25 (+ vector if online) | PPR + path/community | The **calling agent** runs relevance-tests + synthesis over the returned pack | No (graphify) | No (graphify) |

The core is **mode-agnostic**: it consumes a ranked seed list and a graph, and emits a pack. OFFLINE
supplies BM25 seeds and inlines the index; ONLINE adds a vector channel and RRF-fuses; AGENT hands the pack
to whatever agent called the MCP tool. **No mode changes the PPR/expansion/grounding code** — only the seed
list and who reads the pack change. This is the contract that lets Phase B add a vector channel without
touching the graph-aware core.

---

## The Four Pieces (Phase A)

### Piece 1 — A real BM25 index, built at graph-build time, shipped for offline query

#### C1 — `scoreSearchText` is not BM25 (the gap)

| Aspect | Today (`src/search.ts:55-72`) | Target |
| --- | --- | --- |
| IDF | none | per-term IDF over the entity-document corpus |
| TF saturation | none (binary `includes` per term, `search.ts:69`) | Okapi `k1` saturation (default `k1=1.2`) |
| Length normalization | none | Okapi `b` length-norm (default `b=0.75`) against avg doc length |
| Fields indexed | `label` + `source_file` only (`search.ts:56-57`) | `label` + `description` + `quote` (BM25F field weights) |
| Where it runs | at query time, over the live graph | **built at graph-build time**, queried in-browser from a static JSON |

The exact/prefix/suffix bonuses in `scoreSearchText` (`search.ts:62-66`) are a useful **tie-break boost**,
not a ranker; they may be retained as a small additive prior on top of BM25, but the core score MUST be
Okapi BM25 (IDF · saturated-TF · length-norm). The shared tokenizer is reused for determinism:
`normalizeSearchText` (`search.ts:1`) + `queryTerms` (`search.ts:25`, the upstream-compatible
`\w+`/short-English-stopword rule). **Index and query MUST tokenize identically** — the index emitter and
the in-browser query call the same `queryTerms`.

#### C2 — The entity-document model

Each indexed document = one **entity node**. Fields (BM25F, weighted):

- `label` (highest weight) — `node.label`.
- `description` (mid) — `node.description` where present (WP11 contextual description; the Anthropic
  contextual-retrieval lever the research §1 B3 notes graphify gets "for free"). **Optional**: absent on
  some corpora (the scratch mystery export carries 0 per-node descriptions — measured — yet 2287 citation
  quotes; the code graph carries descriptions but 0 quotes). The index degrades field-by-field.
- `quote` (mid) — the **verbatim citation spans** carried on the node's inline `citations[]` (see Piece 4 /
  C13). **Corpus-dependent enrichment, never a dependency**: measured **2287 quotes on the scratch mystery
  export (avg 117 chars), 0 on the code graph** (research §5, re-measured for this spec). The quote field is
  the grounding payload; where absent, BM25 indexes label+description only.

Stored alongside each posting: the **doc length** (token count, for length-norm) and a small **stored
snippet pointer** (so the pack can attach the grounding span without re-fetching `graph.json`).

#### C3 — The `search-index.json` emitter, format, and size budget

| Aspect | Today | Target |
| --- | --- | --- |
| Build-time emitter | none for search | `src/search-index-emitter.ts` (sibling of the existing class-hierarchies emitter), run in the same build pass that writes `graph.json` |
| Static artifact | not emitted | `search-index.json` added to `GENERATED_DATA_FILES` (`src/studio-export.ts:89-102`), shipped next to `scene.json`/`graph.json` |
| `file://` inlining | n/a | inlinable into `window.__GRAPHIFY_BUNDLE__` under key `search-index.json` by work-stream A's single-file path (composes with `SPEC_STUDIO_OFFLINE_EXPORT.md` C3) |
| Determinism | n/a | **byte-identical rebuild** — sorted node order (mirror `writeCitationsSidecar`'s `Object.keys(map).sort()`, `citations.ts:377-381`), stable tokenizer, carries the **index/graph content `graph_signature`** of C10a (the signature *discipline* of `citations.ts:339-358`, but covering labels+descriptions+edges+communities+index params — NOT `computeCitationSignature`) |

**Format** (`schema: "graphify_search_index_v1"`): a serialized Okapi-BM25/BM25F index — a postings map
(term → [{docId, tf}]), per-doc lengths, field-length averages, the `N`/`avgdl` corpus stats, field
weights, and a `k1`/`b` parameter block, plus a minimal `docs` table (`docId → {nodeId, label,
description?, groundingText?}`) so a hit can be turned into a grounded pack entry **without `graph.json`**.

**Self-contained grounding (BLOCKING — no `graph.json` offsets in the default bundle).** The pack grounds
quote-less corpora on `label`+`description` (C8/C10, ~L342/L549), so the `docs` payload MUST carry both the
node `label` and the optional `description?` inline. The grounding span itself MUST be **self-contained in
`search-index.json`** — the `docs` entry stores the **grounding quote TEXT inline** (`groundingText?`, the
verbatim citation span where present), or — equivalently — self-contained quote offsets **into a string
table that the index itself carries** (e.g. a `quoteText[]` block in `search-index.json` with `{start,len}`
into that block). It MUST NOT store offsets into `graph.json`: offline answer mode is scene-only and
`graph.json` is absent (`SPEC_STUDIO_OFFLINE_EXPORT.md:154-155`), so any `graph.json` offset is unresolvable
on the default path. The index therefore carries every byte of grounding text the answer-pack needs to
assemble OFFLINE. **`graph.json` span offsets are permitted ONLY under explicit `--full-offline`** (where
`graph.json` is inlined and resolvable), as a size-tuning opt-in — never on the default scene-only path.

**It also carries the graph adjacency + community membership PPR/assembly need (C3a)** so the whole offline
answer path runs without `graph.json`. Either a hand-rolled serializer over the shared tokenizer (preferred
for determinism + zero new runtime dep) or a deterministic-serialize BM25 lib (MiniSearch / wink-bm25 — both
genuine Okapi BM25, per research §1.1; **not** FlexSearch/Lunr which are not BM25). The decision is recorded
in §Open Decisions.

**Size budget.** Measured basis (scratch mystery export, `src/.graphify/scratch/mystery-studio/`): ~1193
nodes, **~300 KB of raw indexable text** (38.5 KB labels + ~262 KB quote text across 2287 quotes; 0
descriptions in this export). The validated mystery graph (1983 nodes, ~100% quote coverage, research §2.1)
scales this up. The index (postings + lengths + stored snippet pointers + the C3a adjacency/community
arrays) gzips to the research's **~270–350 KB gz** band for the mystery corpus. **Budget clause** (two
distinct thresholds — do not conflate the units):

- **Absolute:** `search-index.json` **gzipped** MUST be **≤ ~350 KB for mystery**.
- **Relative:** `search-index.json` **raw (uncompressed) bytes** MUST be **≤ ~15 % of the already-shipped
  `graph.json`+`scene.json` raw (uncompressed) payload** for any corpus (research §2.4 success criterion;
  for the scratch export that is ~15 % of ~3.6 MB **raw**). **This ratio is over RAW shipped bytes, NOT
  gzipped** — measured against gzipped graph+scene the ratio is far higher (~64 %, because graph+scene
  compress hard), so the ≤15 % clause is meaningless on gzipped units and MUST be evaluated on raw payload.

The dominant cost is the stored quote spans. If the budget is exceeded, the **default self-contained**
tuning is to de-duplicate the grounding text into the index's own carried string table (a single
`quoteText[]` block in `search-index.json` referenced by self-contained `{start,len}` offsets) rather than
repeating spans per posting — this stays scene-only and resolvable offline. Storing **span offsets into
`graph.json`** is permitted **ONLY under explicit `--full-offline`** (where `graph.json` is inlined), never
on the default scene-only path, because offline answer mode has no `graph.json` to resolve offsets against
(`SPEC_STUDIO_OFFLINE_EXPORT.md:154-155`). Both are defer-able tuning, not Phase-A-blocking; neither may
break the self-contained-grounding contract on the default bundle.

#### C3a — Self-carried adjacency + community membership (BLOCKING for offline answer mode)

The offline answer path (PPR expand → community-guided traversal → pack assembly) needs the **graph
edges** and **community membership**, not just the postings. But work-stream A's **default** offline bundle
is **scene-only** — it inlines `scene.json` only; `graph.json` and `entities.json` ship **only under
`--full-offline`** (`SPEC_STUDIO_OFFLINE_EXPORT.md:154-155`). Worse, with `graph.json` absent the
background `fetchGraph()` attempts a `file://` fetch that **fails** (best-effort, null-tolerant, but a doomed
fetch — `SPEC_STUDIO_OFFLINE_EXPORT.md:199-206`). PPR cannot rely on that.

**Decision (default = option (a)):** the `search-index.json` artifact **self-carries** the adjacency +
community data PPR/assembly need, so the offline answer mode runs **without `graph.json`** and the default
scene-only bundle stays small. The alternative — option (b), making `enable offline search` imply
`--full-offline` (inline `graph.json`) — is **rejected as the default** (it bloats every default bundle with
the full edge/attribute payload); it remains available as an explicit opt-out for callers who already ship
`--full-offline`.

The index format therefore adds three deterministic, compact arrays (built in the same emitter pass, sorted
to keep the byte-identical-rebuild invariant INV-3):

- **`adjacency`** — a **CSR/edge-list** projection of the *undirected* entity graph (mirror `cluster.ts:32`
  `toUndirectedGraph`): for `N` nodes in the same sorted `docId` order as the `docs` table, a `node_ptr[]`
  (length `N+1`) into a flat `neighbors[]` (`docId`) array, plus a parallel `edge_weights[]` carrying the
  resolved numeric edge weight per the C7 weighting rule (so PPR does not re-read edge attributes from
  `graph.json`). Edge-list form (`[srcDoc, dstDoc, w]`) is acceptable for small graphs; CSR is preferred at
  mystery scale for compactness + cache-friendly power iteration.
- **`community`** — a length-`N` `Int`/`Uint` array of the flat-Louvain community id per `docId`
  (`cluster.ts` partition), so community-guided traversal and the pack's `community:` field resolve offline.
- **`community_meta`** — a small map `communityId → {label, salient}` (the existing Louvain labels) for the
  pack's `communities[]` block.

**Reconciliation with `SPEC_STUDIO_OFFLINE_EXPORT.md`:** offline answer mode inlines **only**
`search-index.json` (under `window.__GRAPHIFY_BUNDLE__["search-index.json"]`) — it does **not** require
`graph.json` in the bundle. The scene-only default (A's C3) is **unchanged**; A keeps inlining `scene.json`
for first paint, the search index is one added sibling key, and the answer path reads adjacency/community
from the index, never from a `file://` `graph.json` fetch. `--full-offline` (which also inlines `graph.json`)
remains a valid superset and may let a caller drop the self-carried arrays in a future tuning pass — but
Phase A's contract is **self-carried by default**.

#### C4 — In-browser BM25 query (offline, `file://`-compatible)

| Aspect | Today | Target |
| --- | --- | --- |
| Query runtime | Node/server only (`serve.ts`/`cli.ts`) | a small in-browser BM25 query module the studio loads, reading `search-index.json` (or the inlined `window.__GRAPHIFY_BUNDLE__["search-index.json"]`) |
| Network | fetches data | **zero network** — index is inlined or fetched once and queried in-memory |
| Tokenizer | server `queryTerms` | the **same** `queryTerms` shipped to the browser (one tokenizer, index = query) |

The query module returns a ranked `[{nodeId, bm25Score, rank}]` list — the **seed list** the shared core
consumes. It is pure compute (no model, no key, no fetch) and must run inside the double-clicked
`studio.html` (composes with work-stream A's no-fetch-on-first-paint invariant).

### Piece 2 — RRF fusion (the seed+fusion layer)

#### C5 — Reciprocal Rank Fusion (port — absent)

| Aspect | Today | Target |
| --- | --- | --- |
| Any rank fusion | none (verified absent in `src/`) | `src/retrieval/rrf.ts` — Reciprocal Rank Fusion, ~30 LOC pure TS |
| Inputs | n/a | N ranked lists (`[nodeId, rank][]`); Phase A fuses BM25 + (host) multi-query sub-queries; Phase B adds the vector channel |
| Formula | n/a | `score(d) = Σ_lists 1/(k + rank_list(d))`, `k=60` default; optional convex/α-combination knob (Bruch et al. TOIS 2023, research §1.1 — can beat RRF when scores normalize) |

RRF is the layer that lets BM25 coexist with the other **seed** signals (host-assistant **multi-query**
sub-queries — research §1 A6: the assistant emits sub-queries for free, graphify retrieves each and
RRF-fuses; and later the Phase-B vector channel) — **without** re-tuning. It is rank-based, no-tuning,
deterministic, and pure math.

#### C5a — RRF/PPR pipeline order (BLOCKING — RRF fuses *seeds*, PPR is the expansion ranker)

RRF and PPR are **not** two rankings of the same list; they sit at **different stages** of the one shared
retrieval core. The exact order — frozen so tests assert ONE shared core:

1. **Seed signals** → each independent retriever emits a ranked list of `[nodeId, rank]`: BM25 (Phase A),
   each host multi-query sub-query's BM25 run, and (Phase B) the vector channel.
2. **RRF fuse the SEED lists** → `score(d) = Σ 1/(k + rank_list(d))`, `k=60` → a single **fused seed
   ranking**. With only one seed list (no sub-queries, no vector), RRF is the identity over that list, so
   the pipeline shape is unchanged whether or not fusion has >1 input.
3. **PPR personalizes from the fused seed set** → the personalization vector = the **normalized fused-seed
   scores** (HippoRAG: seed mass on the fused lexical hits, not on a single raw BM25 list). PPR power-iterates
   over the entity graph and yields a stationary score per node.
4. **Final expansion rank = the PPR scores.** PPR is **not** re-fed into RRF by default (it is a different
   kind of signal — a graph stationary distribution, not a retriever rank). An **optional** final
   convex/RRF re-fusion of `{fused-seed rank, PPR rank}` is a knob (Open Decision), **off by default**; when
   off, the neighborhood is ranked purely by PPR.

So: **RRF lives at the seed seam (step 2); PPR is the expansion ranker (steps 3–4).** This is the "one
shared retrieval core" tests assert — every mode runs steps 1→4 with the same code, differing only in which
seed retrievers feed step 1 (Modes table) and who reads the final pack.

### Piece 3 — graphify-owned Personalized PageRank (HippoRAG)

#### C6 — graphology ships PageRank but NOT personalized (the consensus amendment)

**Binding amendment** (`CODEX_GRAPHRAG_CONSENSUS.md` §2): the research's "no new dependency — just wire
graphology PageRank" is half-right and must not be presented as a drop-in. Verified: `graphology-metrics`
exports `pagerank` (`node_modules/graphology-metrics/centrality/pagerank.d.ts:1-37`), but its options are
**only** `{ nodePagerankAttribute, getEdgeWeight, alpha, maxIterations, tolerance }` — **there is no
personalization vector**. Ordinary PageRank has a *uniform* teleport; HippoRAG needs teleport *biased to
the BM25 seeds*. Therefore Phase A ships a **small graphify-owned PPR power-iteration**, reusing the
`graphology` graph object and existing deps (no new runtime dependency), **not** the metrics `pagerank`.

#### C7 — The PPR contract

| Aspect | Today | Target (`src/retrieval/ppr.ts`) |
| --- | --- | --- |
| Centrality in retrieval | none in the retrieval path (`betweenness` exists analysis-side only, `analyze.ts`) | power-iteration PPR over the entity graph, seeded by BM25 hits |
| The graph it walks | the BFS/DFS over the live `graphology` graph (`serve.ts:238/262`) | the **entity graph** as an **undirected** graph (mirror `cluster.ts:32` `toUndirectedGraph`) — from the live `graphology` graph in Node/ONLINE, **or from the index's self-carried `adjacency` CSR offline (C3a)** — edges weighted per the numeric rule in C7a |
| Seeds | top-3/top-5 text-score nodes (`serve.ts:346`, `cli.ts:5121`) | the **personalization vector** = normalized **fused-seed** scores (the RRF-fused BM25 + multi-query lists, C5a step 3; HippoRAG: seed mass on the fused lexical hits) |
| Node prior | none | optional node-specificity / passage-count IDF weight (HippoRAG node-specificity, research §1.1) |
| Params | n/a | `damping/alpha = 0.85`; `maxIterations` cap (e.g. 50); convergence `tolerance` (e.g. 1e-6, L1); deterministic iteration order |
| Output | n/a | a stationary-distribution score per node → the **expansion ranking** that replaces the degree-sort |
| Path expansion | unweighted shortest path only (`shortest_path`/`path`, `serve.ts:689`, `cli.ts:4501`) | PathRAG-style: connect top-PPR nodes via shortest paths; optionally prune redundant paths with a distance-decay so the pack fights the "information overload" GraphRAG-Bench flags (research §1.1 PathRAG) |
| **Latency budget** | n/a | **named, measured budget** (consensus §5): PPR p95 must stay interactive on full graph size — target **≤ ~150 ms p95 in-browser (WASM/JS) on the mystery graph** (~2 k nodes / ~3.7 k edges), measured by the bench harness; sparse power iteration over a graph this size is well within budget. The budget is a **gate** for the offline interactive claim. |

PPR is the **graph payoff** and is **pure compute → fully offline, no key, no model**. It is personalized by
the **RRF-fused seed scores** (Piece 1 BM25 + any multi-query lists, fused per C5a steps 1–2) and its output
is the expansion ranking consumed by the assembler (Piece 4). It replaces `subgraphToText`'s degree-sort
(`serve.ts:293`) and the CLI degree-sort (`cli.ts:5164`) as the expansion ranker, while BFS/DFS remain as
fallbacks.

#### C7a — Edge-weight numeric rule (BLOCKING — `confidence` is a string, not a number)

The C7 "weighted by `confidence`" wording is **unsound as stated**: `confidence` is a **string enum**
`"EXTRACTED" | "INFERRED" | "AMBIGUOUS"` on graph edges (`src/types.ts:11,82`) — it cannot be a multiplier.
The **numeric** edge fields are `weight?: number` and `confidence_score?: number` (`src/types.ts:85-86`).
Extracted edges commonly set `confidence: "EXTRACTED"` plus an optional numeric `weight` (default `1.0`,
`src/extract.ts:2413-2415`).

**Mandated rule** — the resolved PPR edge weight is, in priority order:

```
edgeWeight(e) = e.weight ?? e.confidence_score ?? mappedConfidence(e.confidence) ?? 1
```

with **`mappedConfidence`** the enum→numeric mapping (a monotone prior reflecting assertion strength). The
mapping is **FROZEN as the Phase A default** — these are the constants the index is built with and the
constants in-browser PPR resolves against; they are not an Open Decision:

```
mappedConfidence: { "EXTRACTED": 1.0, "INFERRED": 0.6, "AMBIGUOUS": 0.3 }   // FROZEN — Phase A default
```

These constants are **serialized into the index `indexParams` block** (so they are part of
`computeSearchIndexSignature`, C10a, and a future Phase-B retune would flip `graph_signature` rather than
silently diverge offline vs Node). Phase A ships them as the frozen default and **a test asserts the
serialized default equals `{EXTRACTED:1.0, INFERRED:0.6, AMBIGUOUS:0.3}`** (T11). The ordering
EXTRACTED ≥ INFERRED ≥ AMBIGUOUS is part of the freeze.

`mappedConfidence` returns `undefined` for any value outside the enum (so the final `?? 1` floors unknown
edges to a uniform weight rather than dropping them). The **same resolved weight** is what the offline index
materializes into `edge_weights[]` (C3a), so in-browser PPR is byte-for-byte the same ranker as Node-side
PPR. The undirected projection (`cluster.ts:32`) sums/maxes parallel-edge weights deterministically
(decision recorded in §Open Decisions).

**Scoping note** (consensus §1 caveat): the benchmark shows *HippoRAG/HippoRAG2-style retrieval* wins
complex reasoning, **with PPR as the central mechanism** — the benchmark does not isolate PPR from graph
construction/linking/filters. The spec adopts PPR as the default expander on that basis, with BFS/DFS
fallback, and lets the bench (below) confirm the lift on graphify's own data before it is the only path.

### Piece 4 — `graphify answer` / the answer-pack assembler (LazyGraphRAG)

#### C8 — No index-time LLM; defer to query time

The assembler is the LazyGraphRAG embodiment (research §0/§1.1): **no LLM summaries at index time** (index
cost = the BM25 index above), and at query time **seed → expand → ground → assemble**, then hand the pack to
the **host assistant** for the relevance-test + synthesis it does for free.

| Stage | What it does | Where the signal comes from |
| --- | --- | --- |
| **Seed** | rank entity docs by BM25 (Piece 1), **RRF-fuse** the BM25 list with any host multi-query sub-query lists into one fused-seed ranking (Piece 2 / C5a steps 1–2) | offline, pure compute |
| **Expand** | PPR over the entity graph personalized by the **normalized fused-seed scores** (Piece 3 / C5a step 3; adjacency from the self-carried CSR offline, C3a) + **community-guided traversal** over the existing flat Louvain communities (`cluster.ts`) — best-first(PPR score) + breadth-first(community) deepening, LazyGraphRAG-style | offline, pure compute; communities self-carried in the index (C3a) |
| **Ground** | attach the **verbatim citation `quote` spans** (Piece 4 / C13) to each pack entry; where a node has no quote, attach `label`+`description` only (graceful degradation, the code-graph case) | corpus-dependent quotes (research risk R3) |
| **Assemble** | emit a `graphify_answer_pack_v1` JSON: the question, seeds, the PPR-scored neighborhood, pruned connecting paths, grounding spans, the community context, a token budget, and a count of relevance-tests proposed | offline, pure compute |

The host assistant then runs the **relevance test** (LazyGraphRAG's cheap per-candidate keep/drop) and the
**synthesis** over the pack — no key for graphify.

#### C9 — The CLI command and MCP tool

| Surface | Today | Target |
| --- | --- | --- |
| CLI | `query` emits a degree-sorted text blob, no synthesis (`cli.ts:5081`); **no `answer`/`ask`** (verified absent) | new `graphify answer "<question>"` → emits a `graphify_answer_pack_v1` (and a human-readable rendering). Distinct from the existing token-reduction `benchmark` command, registered in both `cli.ts:5195` and `skill-runtime.ts:1637` |
| MCP | tools list has `query_graph` but **no `answer_graph`** (`serve.ts:788-1134`) | new `answer_graph` MCP tool returning the same `graphify_answer_pack_v1` for the WITH-RAG-AGENT mode |
| `query`/`query_graph` | unchanged text-pack behavior remains | retained; `answer`/`answer_graph` are the new graph-aware surfaces |

#### C10 — `graphify_answer_pack_v1` (the frozen cross-mode contract)

A single JSON schema, **frozen at Phase A**, is the contract that unifies OFFLINE / ONLINE / AGENT. Shape:

```jsonc
{
  "schema": "graphify_answer_pack_v1",
  "graph_signature": "<index/graph CONTENT hash of the graph+index this pack was built from (C10a)>",
  "grounding_signature": "<optional: citation signature of the inline quotes (C10a)>",
  "question": "<the user question>",
  "mode": "offline" | "online" | "agent",
  "retrieval": {
    // step 1+2 (C5a): per-retriever seed lists fused by RRF into one fused-seed ranking
    "seeds": [ { "node_id": "...", "label": "...", "bm25": 12.3, "fused_rank": 1 } ],
    "fusion": { "method": "rrf", "k": 60, "lists": ["bm25", "multiquery:..."] },  // vector list added in Phase B
    // step 3 (C5a): PPR personalized by the NORMALIZED FUSED-SEED scores (not a raw single BM25 list)
    "ppr": { "alpha": 0.85, "iterations": 23, "tolerance": 1e-6, "seeded_by": "fused-seed", "refused": false }
  },
  "neighborhood": [
    { "node_id": "...", "label": "...", "ppr": 0.041, "community": 7,
      "description": "...?",                          // optional (corpus-dependent)
      "grounding": [ { "quote": "...", "source_file": "...", "page": "12?", "section": "...?" } ] // optional
    }
  ],
  "paths": [ { "nodes": ["a","b","c"], "reliability": 0.8 } ],     // PathRAG-pruned connecting paths
  "communities": [ { "id": 7, "label": "...", "salient": true } ], // existing Louvain labels
  "budget": { "token_budget": 2000, "relevance_tests_proposed": 18 },
  "answer": null   // OFFLINE/AGENT leave null for the host assistant to fill; ONLINE may fill if an LLM is configured
}
```

Rules: every grounding span carries the **verbatim `quote`** plus its source locator; `description` and
`grounding` are **optional** (absent on quote-less corpora — never a hard field); `answer` is `null` in
OFFLINE/AGENT (the host fills it). The schema is **versioned** (`_v1`) and **additive-only** thereafter (a
Phase-B vector channel adds a `lists` entry and a `vector` block, not a breaking change). The pack carries a
`graph_signature` so a stale pack against a rebuilt graph is detectable (defined in C10a).

#### C10a — `graph_signature` soundness (BLOCKING — NOT the citation signature)

The pack's staleness signature MUST be a **graph/index CONTENT hash** that changes whenever **anything PPR
or retrieval depends on** changes — labels, descriptions, **edges**, **community membership**, the
**community labels + salience** (`community_meta`, C3a), and the **index parameters** (`k1`, `b`, BM25F field
weights, the **frozen** `mappedConfidence` constants, RRF `k`). It MUST NOT
be `computeCitationSignature` (`src/citations.ts:345-358`): that function hashes **only the inline
`citations` projection** (`{node_id → citations[]}`) — it is **blind to labels, descriptions, edges,
communities, and the index params**, so a graph whose edges/communities changed but whose citations did not
would falsely pass as fresh, and PPR would run on a stale topology.

**Define `computeSearchIndexSignature(G, indexParams)`** — sha256 over the sorted, canonical projection of
everything the index/PPR consume: `{ node_id → {label, description?, community} }` + the sorted edge
projection `{ [srcId, dstId] → resolvedWeight }` (C7a) + the **sorted canonical `community_meta` projection**
`{ communityId → {label, salient} }` (C3a, the labels/salience the index carries at ~L207) + the serialized
`indexParams` block. **The `community_meta` projection is mandatory in the signature**: the index ships the
Louvain community **labels** and **salience** (~L207), the pack surfaces them in `communities[]` (~L381),
and a label/salience change is a content change the staleness signature MUST detect — hashing only node
community *membership* + edges + params (which leaves a community **rename** invisible) is unsound. With
`community_meta` in the projection, mutating a community **label** flips `graph_signature` (T12). It follows
the **same discipline** as `computeCitationSignature` (sorted keys, content-only, not mtime/size —
`citations.ts:339-358`) but covers the full retrieval substrate. `search-index.json` carries this signature
(C3/INV-3), and the pack copies it into `graph_signature`.

The **citation signature is kept as a SEPARATE, optional `grounding_signature`** field: it remains the right
hash for "have the verbatim grounding quotes changed", which is orthogonal to "has the retrieval topology
changed". Emitting both lets a consumer distinguish a grounding-only refresh from a topology-changing rebuild.

#### C11 — Host-assistant query transforms (free lever)

Documented in the contract / skill, not a graphify code path: the host assistant may **rewrite /
multi-query / step-back / decompose** before calling `answer`/`answer_graph` (research §1 A6: step-back
+7–27 % on reasoning sets, all free because the host is the LLM). graphify retrieves each sub-query and
RRF-fuses (Piece 2). The no-LLM floor is stemming/synonym expansion over the shared tokenizer.

### Citation `quote` typing (grounding correctness)

#### C13 — Type and propagate `quote`

| Aspect | Today | Target |
| --- | --- | --- |
| `quote` on the citation type | **absent** from `OntologyCitation` (`types.ts:500-508`) | add `quote?: string` to `OntologyCitation` |
| Where `quote` lives today | only on `OntologyEvidenceRecord` (`types.ts:515`) | unchanged there; `OntologyCitation` gains the optional field so inline `graph.json` citations type-check |
| How it's read today | defensively, untyped, off citation-like records (`node-descriptions.ts:459`: `rec.quote ?? rec.text ?? rec.snippet`) | the same defensive read, now type-backed |
| Sidecar passthrough | `writeCitationsSidecar` is field-transparent — no `quote` reference, JSON passthrough (`citations.ts:367-389`) | unchanged (it already passes `quote` through); the index emitter (C3) reads `quote` from inline citations |

**`quote` is corpus-dependent enrichment, NEVER a dependency** (research risk R3, re-measured: 2287 quotes
on the scratch mystery export, 0 on the code graph). Typing it makes it travel losslessly into the index
(C2/C3) and the pack (C10) **where present**, and the whole stack treats it as optional everywhere. The
spec note "quotes are corpus-dependent, never required" is part of this clause.

---

## Invariants (MUST hold)

- **INV-1 — No key, no network on the retrieval path (offline).** OFFLINE mode runs BM25 + RRF + PPR +
  assembly with **zero keyed calls and zero network requests**, from a `file://` `studio.html`. The PPR +
  assembly substrate (adjacency + community membership) is **self-carried in `search-index.json`** (C3a),
  so the offline answer path **never** depends on `graph.json` being inlined and **never** issues a doomed
  `file://` `graph.json` fetch (`SPEC_STUDIO_OFFLINE_EXPORT.md:199-206`). The only LLM is the host assistant
  (no key for graphify). A config that requires graphify to hold a key scores 0 on offline-capability
  (research §2.2).
- **INV-2 — One core, three modes.** OFFLINE / ONLINE / AGENT share the **same** retrieval core and the
  **same** `graphify_answer_pack_v1`; they differ only in seed source and answerer (Modes table). No mode
  forks the PPR/expansion/grounding code.
- **INV-3 — Determinism / byte-identical rebuild.** `search-index.json` rebuilds byte-identically (sorted
  nodes, stable tokenizer, sorted CSR adjacency + community arrays, carried **index/graph content
  `graph_signature`** of C10a), matching the signature *discipline* of `citations.ts:339-389` while covering
  the full retrieval substrate (NOT `computeCitationSignature`). PPR uses a fixed iteration order and
  tolerance.
- **INV-4 — Additive, no regression.** `query`/`query_graph` keep their current text-pack behavior;
  `answer`/`answer_graph` are new surfaces. `search-index.json` is additive to `GENERATED_DATA_FILES`; the
  multi-file/`file://` bundles (work-stream A) stay byte-unchanged except for the added sibling.
- **INV-5 — No new runtime dependency in Phase A.** PPR/RRF are graphify-owned pure TS; BM25 is either
  hand-rolled or a deterministic-serialize lib whose inclusion is the only allowed Phase-A dependency
  decision (Open Decisions). No `onnxruntime`/`transformers.js`/pgvector in Phase A.
- **INV-6 — `quote` is optional everywhere.** Nothing in the index, the PPR, or the pack may *require* a
  quote; quote-less corpora (the code graph) produce a valid pack grounded on label+description.
- **INV-7 — PPR latency budget honored.** PPR p95 stays within the C7 budget (~150 ms on mystery,
  in-browser), proven by the bench harness, before the offline interactive claim is made.

---

## In Scope (Phase A)

- A real Okapi BM25/BM25F index over `label`+`description`+`quote`, built at graph-build time
  (`src/search-index-emitter.ts`), emitted as `search-index.json`, added to `GENERATED_DATA_FILES`
  (`studio-export.ts:89-102`), inlinable by work-stream A. The artifact **self-carries** the graph
  adjacency (CSR + resolved edge weights) + community membership (C3a) so the offline answer path needs no
  `graph.json`, and a `graph_signature` = the **index/graph content hash** of C10a (not the citation
  signature).
- An in-browser BM25 query module sharing the `queryTerms` tokenizer (`search.ts:25`), `file://`-compatible.
- `src/retrieval/rrf.ts` — RRF fusion (k=60 + optional α knob).
- `src/retrieval/ppr.ts` — graphify-owned power-iteration Personalized PageRank over the undirected entity
  graph, seeded by BM25, with a measured latency budget; PathRAG-style path pruning for the pack.
- The answer-pack assembler (seed→expand→ground→assemble), `graphify answer` CLI + `answer_graph` MCP tool,
  emitting the frozen `graphify_answer_pack_v1`.
- `quote?: string` on `OntologyCitation` (`types.ts:500-508`) + its propagation into the index and pack,
  treated as optional enrichment.
- The bench harness + gold sets + methodology amendments below (required **before Phase B is blessed**).

## Deferred / Out of Scope (Phase B, behind explicit flags)

Phase B is **gated on the bench (below) blessing it**, in this order (research §3):

1. **Cross-encoder reranker first** (highest-ROI offline quality lever): `Xenova/ms-marco-MiniLM-L-6-v2`
   via transformers.js, ~23 MB int8, opt-in lazy download, reranks the top-k fused candidates (lifts
   NDCG@10 ~45–50 → ~74 on TREC DL19, research §1.1). No key, `file://`-capable.
2. **ONNX-web embeddings** (semantic recall + HyDE): int8 MiniLM/e5/bge-small (~20–25 MB, opt-in), adds the
   vector channel RRF-fused with BM25. Model family must match the pgvector dimension (the open E5 decision,
   `pgvector.ts:225-231`).
3. **pgvector online tier**: the existing pgvector adapter (HNSW cosine, `pgvector.ts`) + an
   `EmbeddingProvider` impl (`storage/vector/types.ts:83-90`, currently no provider implemented), RRF-fused
   with the lexical channel for ONLINE mode.

Also deferred / explicitly skipped (research §3 over-hyped): **Microsoft GraphRAG-global** community-report
summarization (no substrate: flat Louvain only, no hierarchical Leiden, no report artifact — verified
`cluster.ts`), **DRIFT**, **GraphReader**, **ColBERT/late-interaction** (`file://` payload-prohibitive),
**hosted rerankers** (need a key). Hierarchical communities for LazyGraphRAG's full best-first/breadth-first
descent are deferred — flat Louvain + PPR is the Phase-A expander; revisit only if the bench shows a
summarization gap (research §4 decision 3).

---

## Test Obligations

These are the acceptance gates; double-consensus review checks them against the implementation.

- **T1 — BM25 is real.** Unit-test the scorer exhibits IDF (a rare term outranks a common term at equal
  TF), TF saturation (`k1`), and length-norm (`b`) — i.e. it is **not** the `search.ts:55` term-overlap.
  Regression: known queries on the mystery gold set rank the gold node higher than `scoreSearchText` does.
- **T2 — Index determinism (INV-3).** Rebuild `search-index.json` twice from the same `graph.json`; assert
  **byte-identical**, sorted node order, stable `graph_signature`.
- **T3 — Size budget (C3).** Assert mystery `search-index.json` **gzipped** ≤ ~350 KB **and** its **raw
  (uncompressed)** bytes ≤ ~15 % of the **raw (uncompressed)** `graph.json`+`scene.json` payload (the
  ratio is over raw bytes, NOT gzipped — C3); assert the index degrades (smaller) when descriptions/quotes
  are absent (the code-graph case).
- **T4 — In-browser offline query (INV-1).** Load `studio.html` from a real `file://` URL (CDP — graphify
  already has CDP scripts under `.graphify/scratch/cdp-*.mjs`), run a BM25 query **and a full `answer`**,
  assert results returned with **zero network requests** and no key — specifically with a **scene-only
  bundle (no `graph.json` inlined)**, proving PPR + assembly read adjacency/community from the self-carried
  index (C3a) and that **no `file://` `graph.json` fetch** is attempted.
- **T5 — RRF (C5).** Unit-test RRF on hand-built ranked lists (k=60); assert a node ranked high in two
  lists outranks one ranked high in only one; assert determinism.
- **T6 — PPR correctness + seeding (C7/C5a).** Assert the power iteration converges; with all seed mass on
  one node, PPR mass concentrates near it and decays with graph distance; the personalization vector actually
  biases the stationary distribution (i.e. it is **personalized**, not uniform PageRank — the consensus
  amendment). Assert the personalization vector is the **normalized fused-seed** scores (C5a step 3), and
  that with a single seed list RRF is the identity so the pipeline shape is unchanged.
- **T11 — Edge-weight rule + frozen mapping (C7a).** Assert `edgeWeight` resolves `weight ?? confidence_score ??
  mappedConfidence(confidence) ?? 1`: an edge with only `confidence: "EXTRACTED"` (no numeric field) gets
  `mappedConfidence("EXTRACTED")`, an edge with a numeric `weight` uses it, an unknown enum value floors to
  `1`; assert the index's `edge_weights[]` (C3a) equals the Node-side resolved weights so offline and
  Node PPR are byte-identical rankers. **Assert the frozen mapping**: the serialized `indexParams`
  `mappedConfidence` equals the Phase A default `{EXTRACTED:1.0, INFERRED:0.6, AMBIGUOUS:0.3}` (C7a freeze).
- **T12 — `graph_signature` soundness (C10a).** Assert mutating an **edge** or a **community label**
  (the latter via the `community_meta` projection in `computeSearchIndexSignature`, C10a — a rename with **no
  membership change and no citation change**) **changes** `graph_signature` but **not** `grounding_signature`;
  assert mutating a community **salience** flag likewise flips `graph_signature`; mutating an inline **quote**
  changes `grounding_signature`; assert `graph_signature` is **not** equal to `computeCitationSignature(G)`
  when the two diverge.
- **T7 — PPR latency budget (INV-7).** Measure PPR p95 on the mystery graph in-browser; assert ≤ the C7
  budget (~150 ms).
- **T8 — Answer-pack schema (C10).** Assert `graphify answer` / `answer_graph` emit a valid
  `graphify_answer_pack_v1`: seeds present, PPR-scored neighborhood, pruned paths, grounding spans where
  quotes exist, `answer:null` in OFFLINE/AGENT, carried `graph_signature`.
- **T9 — Quote optionality (INV-6).** Run the full pipeline on the **code graph** (0 quotes): assert a
  valid pack with label+description grounding and **no crash / no required quote**. Run on **mystery**:
  assert quotes attached.
- **T10 — One core, three modes (INV-2).** Assert OFFLINE (BM25 seeds), ONLINE (RRF BM25+vector — Phase B
  stub), and AGENT (MCP) all produce the **same schema** from the **same** PPR/assembler code path.

---

## Benchmark Methodology (required BEFORE Phase B is blessed)

The bench is the gate that decides Phase B on **graphify's own data**, not vendor leaderboards. It folds in
the research §2 design **plus the consensus's binding amendments** (`CODEX_GRAPHRAG_CONSENSUS.md` §5).

- **Harness.** A new retrieval-quality bench (distinct from the existing token-reduction `benchmark`
  command — registered **twice**: in the CLI at `src/cli.ts:5195` and again in the skill runtime at
  `src/skill-runtime.ts:1637`, both invoking the same token-reduction `runBenchmark`/`benchmark.ts`) — name
  it to avoid colliding with **both** registrations (e.g. `graphify bench` or a `benchmark --retrieval`
  mode). It loads a gold set, runs each config's retrieval + pack assembler,
  computes the metrics, and writes a deterministic `bench-report.json` + a Markdown table under
  `.graphify/scratch/bench/` (no `/tmp`, per project rule). Byte-identical index-rebuild assertion (reuse
  the signature discipline).
- **Two gold sets** (research §2.1): **mystery** (~120 Qs stratified into the GraphRAG-Bench task types:
  fact / multi-hop / summarization / creative; gold answers + gold supporting **quote spans** →
  faithfulness is auto-checkable) and the **code graph** (~60 Qs, 0 quotes — the honesty/degradation
  case). **Explicit gold-set construction protocol** (consensus §5): who authors, how stratified, how the
  gold spans are selected and frozen, ship as deterministic JSON.
- **Ablation ladder** (research §2.3): B0 current → B1 BM25 → B3 BM25⊕vector(RRF) → B4 +PPR → B5
  +community-traversal → B6 +reranker (Phase B) → B7 +contextual. Reference ceilings (online, keyed, NOT
  shippable — calibration only): MS GraphRAG-local/global, LightRAG, HippoRAG2, **and FastGraphRAG/FGRAG**
  (consensus §4 + §5: the debiasing study found FGRAG strongest after debiasing, attributed to concise
  graph context + PageRank ranking — it strengthens the PPR direction and MUST appear in the comparator
  table).
- **Metrics** (research §2.2 **+ consensus §5 amendments**): Recall@k / Precision@k (k∈{5,10,20}),
  **NDCG@k and MRR** (added), citation-grounded **faithfulness** (auto-checkable on mystery via verbatim
  quotes), correctness (EM/F1/ROUGE-L vs gold), latency p50/p95 in-browser **and** Node (incl. the **PPR
  latency budget** on full graph size), gzipped index size, and offline-capability (#keyed calls — a keyed
  config scores 0).
- **Statistics** (consensus §5): report **bootstrap confidence intervals** on every headline metric — no
  point estimates without CIs.
- **Judge** (research §2.4 **+ consensus §5**): for non-extractable answers, a **fixed judge
  model+version with fixed prompts and cached transcripts**, applying the arXiv 2506.06331 mitigations
  (position-swap, length-control, report ties). Do **not** trust raw pairwise win-rate (LightRAG's 66.7 %
  → 39.06 % under debiasing).
- **Shipping criterion for any config** (research §2.4): ≥ B1 on every task type, strictly better on
  multi-hop/summarization, no regression on fact-retrieval, index **raw bytes** ≤ ~15 % of **raw shipped
  payload** (BM25) or opt-in (Phase B), 100 % offline (0 keyed calls), within the PPR latency budget.

**Phase B is not blessed until this bench, with all the amendments above, runs and meets the criterion.**

---

## Open Decisions (for the double-consensus)

1. **BM25 implementation** — hand-rolled scorer over the shared `queryTerms` tokenizer (zero new runtime
   dep, owns determinism — preferred) vs MiniSearch/wink-bm25 (genuine BM25F, deterministic serialize). The
   only Phase-A dependency decision (INV-5).
2. **Quote storage in the index** — inline quote text (simpler, ~262 KB on mystery) vs a self-contained
   `quoteText[]` string table inside `search-index.json` referenced by `{start,len}` (smaller, still
   scene-only / no `graph.json`). Default inline; switch to the self-contained string-table form only if the
   C3 budget is exceeded. **Span offsets into `graph.json` are NOT a default option** — they are gated to
   `--full-offline` only (C3), because the default scene-only bundle ships no `graph.json` to resolve them.
3. **PPR vs BFS as default expander** — adopt PPR default with BFS/DFS fallback (recommended; bench
   confirms the lift on graphify's data before PPR is the only path).
4. **PathRAG path-pruning in Phase A or deferred** — include distance-decay path pruning now (cheap, fights
   information-overload) or ship plain PPR neighborhoods first.
5. **`answer` vs `ask` command name**, and whether `query_graph` gains an `answer_pack` output mode vs a
   separate `answer_graph` tool.
6. **Gold-set ownership** — who authors the mystery (~120) and code-graph (~60) gold sets and freezes the
   gold spans (bench prerequisite).
7. **Embedding family (E5)** — deferred to Phase B but flagged: one model family must serve both ONNX-web
   (offline int8) and pgvector (online, `pgvector.ts:225-231`), FR-quality-aware.
8. **`mappedConfidence` constants (C7a)** — **CLOSED / FROZEN.** The enum→numeric mapping is frozen as the
   Phase A default `{EXTRACTED:1.0, INFERRED:0.6, AMBIGUOUS:0.3}`, serialized into the index `indexParams`
   block (covered by `computeSearchIndexSignature`, C10a) with a test asserting the frozen default (T11).
   The ordering EXTRACTED ≥ INFERRED ≥ AMBIGUOUS and the exact values are no longer an Open Decision; any
   future retune is a Phase-B param change that flips `graph_signature`, not an open Phase-A choice.
9. **Parallel-edge reduction in the undirected projection (C7a)** — sum vs max of parallel-edge weights
   when undirecting the graph (`cluster.ts:32`); must be deterministic.
10. **Self-carried adjacency encoding (C3a)** — CSR vs edge-list, and whether to drop the self-carried
    arrays when the caller already ships `--full-offline` (option (b) opt-out).
11. **Optional final PPR re-fusion (C5a step 4)** — off by default; whether to expose a convex/RRF
    re-fusion of `{fused-seed rank, PPR rank}` as a knob.

---

## Evidence Index (current code the spec is anchored to)

- `src/search.ts:1` `normalizeSearchText`, `:25` `queryTerms`, `:55-72` `scoreSearchText` — **not BM25**
  (no IDF/TF-sat/length-norm; label+source only). The shared tokenizer Phase A reuses.
- `src/serve.ts:226-234` `scoreNodes` (calls `scoreSearchText` over `label`+`source_file`), `:238` `bfs`,
  `:262` `dfs`, `:284-313` `subgraphToText` (degree-sort + char-budget truncation), `:335-356`
  `toolQueryGraph` (top-3 seeds, depth≤6 BFS, text pack), `:689` `toolShortestPath` (unweighted,
  `bidirectional` from `graphology-shortest-path`),
  `:788-1134` the MCP tool list + dispatch (`query_graph` present, **no `answer_graph`**). No
  PageRank/PPR/RRF/rerank/fusion (grep-confirmed).
- `src/cli.ts:5081` `query` (top-5 seeds, depth-2 BFS, degree-sorted pack — **no synthesis**), **no
  `answer`/`ask` command** (verified absent), `:5195` existing `benchmark` (token-reduction, not retrieval
  quality), `:4501` `path`, `:4550` `explain`, `:4588` `tree`, `:4638` `summary`, `:4912` `review-delta`,
  `:4458` `studio export`, `:257-288` `emitDefaultStaticStudio`.
- `src/skill-runtime.ts:1637` — a **second** registration of the token-reduction `benchmark` command
  (same `runBenchmark`/`benchmark.ts`); the new retrieval bench must avoid colliding with **both** this and
  `cli.ts:5195`.
- `src/types.ts:11` `Confidence = "EXTRACTED" | "INFERRED" | "AMBIGUOUS"` (a **string enum**, not numeric),
  `:82` `GraphEdge.confidence: Confidence`, `:85-86` the numeric `confidence_score?`/`weight?` fields;
  `src/extract.ts:2413-2415` `addEdge` (sets `confidence: "EXTRACTED"` + numeric `weight` default `1.0`) —
  the basis for the C7a edge-weight rule (`weight ?? confidence_score ?? mappedConfidence(confidence) ?? 1`).
- `SPEC_STUDIO_OFFLINE_EXPORT.md:154-155` (default bundle is **scene-only**; `graph.json`/`entities.json`
  inlined **only** under `--full-offline`), `:199-206` (with `graph.json` absent the background
  `fetchGraph()` attempts a **failing** `file://` fetch) — the reason `search-index.json` must self-carry
  adjacency + community membership (C3a) for the offline answer path.
- `src/workspace/search-index.ts:4` — self-declared "no Lucene/MiniSearch — no BM25", `:140` one-point
  token matching (independent confirmation the existing index is not BM25).
- `src/cluster.ts:7,57-70,112` — flat Louvain (`graphology-communities-louvain`), deterministic rng,
  single partition; `:32` `toUndirectedGraph` (the undirection the PPR mirrors). No hierarchical
  communities / no report artifact → GraphRAG-global skipped.
- `node_modules/graphology-metrics/centrality/pagerank.d.ts:4-13` — PageRank options are
  `{nodePagerankAttribute, getEdgeWeight, alpha, maxIterations, tolerance}` — **no personalization
  vector** (proves the consensus amendment: PPR must be graphify-owned).
- `package.json:93-97` — `graphology@^0.26`, `graphology-communities-louvain`, `graphology-metrics`,
  `graphology-shortest-path` present; **no BM25 lib, no onnxruntime/transformers.js** (Phase A reuses
  graphology; Phase B adds ONNX opt-in).
- `src/types.ts:500-508` `OntologyCitation` (omits `quote`), `:515` `OntologyEvidenceRecord` (has
  `quote?`); `src/node-descriptions.ts:459` reads `quote ?? text ?? snippet` defensively.
- `src/citations.ts:367-389` `writeCitationsSidecar` — field-transparent (passes `quote` through),
  sorted-node determinism; `:345-358` `computeCitationSignature` hashes **only the inline `citations`
  projection** (`{node_id → citations[]}`) — **blind to labels, descriptions, edges, communities, index
  params**, hence NOT sound as the pack's `graph_signature` (C10a); the index/pack mirror its *discipline*
  (sorted, content-only) in `computeSearchIndexSignature` while covering the full retrieval substrate —
  labels, descriptions, edges, community membership **and `community_meta` (community labels + salience)**,
  plus the index params — and keep the citation signature as the separate `grounding_signature`.
- `src/studio-export.ts:89-102` `GENERATED_DATA_FILES` (where `search-index.json` is added); composes with
  `SPEC_STUDIO_OFFLINE_EXPORT.md` C3 (`window.__GRAPHIFY_BUNDLE__` inlining).
- `src/studio-assets.ts:355-389` `buildEntitySidecar` (the per-entity sidecar that already carries
  description+citations — the contextual-retrieval substrate).
- `src/storage/vector/types.ts:83-90` `EmbeddingProvider` (no impl), `src/storage/vector/pgvector.ts:225-231`
  (E5/provider choice open) — the ONLINE/Phase-B substrate.
- **Measured (this spec):** scratch mystery export (`.graphify/scratch/mystery-studio/`) — 1193 nodes,
  38.5 KB labels + 268 KB quote text across 2287 quotes, 0 per-node descriptions → ~300 KB raw indexable
  text (the size-budget basis); code graph — 0 quotes (the optionality/degradation basis).

## Research Sources (the spec's evidence base)

- Independent benchmark verdict: **GraphRAG-Bench** "When to use Graphs in RAG" (ICLR'26)
  https://arxiv.org/abs/2506.05690 ; judge-bias critique https://arxiv.org/html/2506.06331v1 .
- **LazyGraphRAG** (no index-time LLM, defer to query)
  https://www.microsoft.com/en-us/research/blog/lazygraphrag-setting-a-new-standard-for-quality-and-cost/ .
- **HippoRAG** (PPR-seeded retrieval) https://arxiv.org/abs/2405.14831 ; **HippoRAG 2**
  https://arxiv.org/abs/2502.14802 ; **PathRAG** (path pruning) https://arxiv.org/abs/2502.14902 .
- **FastGraphRAG/FGRAG** (the comparator the consensus requires) — strongest after debiasing per
  https://arxiv.org/html/2506.06331v1 .
- BM25 https://en.wikipedia.org/wiki/Okapi_BM25 ; RRF https://www.researchgate.net/publication/221301121 ;
  convex>RRF (Bruch et al. TOIS 2023) https://arxiv.org/pdf/2210.11934 ; cross-encoder
  https://huggingface.co/cross-encoder/ms-marco-MiniLM-L6-v2 ; Anthropic Contextual Retrieval
  https://www.anthropic.com/news/contextual-retrieval ; step-back https://arxiv.org/pdf/2310.06117 .
- Full source list: `.graphify/scratch/RESEARCH_graphrag_techniques.md` §6.
