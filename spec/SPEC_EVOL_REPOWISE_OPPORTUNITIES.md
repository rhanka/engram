# SPEC EVOL — Repowise Opportunities (full opportunity study)

**Status: DRAFT — decision-ready, analysis-only (no port in this lot).**
Upstream-intake wave, 2026-07-06 follow-up. Companions: `UPSTREAM_GAP.md > Repowise Reference Intake (2026-07-06)` (the 31-row adoption table) and `spec/SPEC_EVOL_CURATED_RESPONSES.md` (the curated-responses deep-dive, which this study references and does **not** duplicate).

Reference upstream: `repowise-dev/repowise` at `6680c2822a64ee2c0bc53c196fe7a321df9aaf8a` (v0.27.0+1), cloned at `.graphify/scratch/clones/repowise`. All repowise paths below are relative to the clone; all graphify paths are relative to this repo root. Every claim below was re-verified against the actual files on 2026-07-06 (this pass), not carried over from the intake table.

> **License wall (hard constraint, restated per item below).** repowise is **AGPL-3.0**; this repo is **MIT**. Adoption is **design-level only**: mechanisms, schemas and invariants may be re-designed from this functional analysis, but **no repowise code, templates, or calibrated constants may be copied or translated**. Each section below states its own AGPL boundary.

---

## 0. Scope, method, vocabulary

The 2026-07-06 intake produced a 31-row bucketed table (4 adopt / 8 must-audit / 14 defer / 4 n-a) plus one deep-dive (curated responses). The principal's feedback: the deliverable over-focused on that one feature. This study deep-dives **every opportunity the table only rowed**, so each can be decided on its own merits.

- **Adoption targets** are drawn from: `graphify core` (this repo), `sentropic mesh/gateway` (`@sentropic/llm-mesh`, consumed via `src/llm-mesh-bridge.ts`), `process-std-am` (ontology/hierarchy peer, WP4 G2 signed contract), `nc-fullstack` (offline retrieval client of published packs), `radar` (radar-immo, the consumer that drove the native DB backends #139).
- **Cost scale**: S (≤ a few days, one seam), M (a lot, several seams or one new artifact class), L (its own program/spec).
- **Phases**: Phase 1 = next implementation lot, S-sized, no product-surface controversy. Phase 2 = after the open decisions in §15. Phase 3 = gated on a foundation (git-intelligence axis, WP4 G2 stabilization, python-upstream audit). Phase 4 = product-decision defers (each needs its own spec before any work).
- **Honesty rule**: where our side is thinner than the intake table implied, this study says so (see §10 skeletons, §12 unwired provider registry).

## 1. Curated responses — pointer (not duplicated)

The full mechanism analysis (wiki-page corpus, `answer_cache`, confidence gating, `human_notes`, lifecycle) and the three-target adoption design (graphify code corpora / process-std-am / nc-fullstack) live in **`spec/SPEC_EVOL_CURATED_RESPONSES.md`** (DRAFT, 5 open decisions). Join point on our side: the `answer: null` offline seam of `graphify_answer_pack_v1` (`src/retrieval/answer-pack.ts:33`, slot at `:150`, assembler at `:235`; CLI `answer` `src/cli.ts:5601`; MCP `answer_graph` `src/serve.ts:905`). Its open decisions are **not** repeated in §15; the two lists are disjoint by construction (§15.D2 touches the savings-accounting decision that spec already flagged as separable — it is folded here, superseding that spec's open decision 5).

## 2. Counterfactual savings accounting

**What repowise does.** Every MCP tool answer logs the raw exploration it replaced, as a *conservative undersell* computed only from fields already on the result dict (`packages/server/src/repowise/server/mcp_server/_savings/counterfactual.py`): `get_context` sums the exact `skeleton.full_tokens` of each file the agent would have Read (`:31-52`); `search_codebase` prices each distinct cited path at a deliberately-low flat floor of 400 tokens (`:28`, `:55-66`); `get_answer` counts a search + per-cited-file floor **only when the answer was actually served** — gated/low-confidence responses claim nothing because the agent still goes reading (`:85-101`); orientation/analysis tools get small fixed floors (`:79-82`). Tools that hold an exact artifact *declare* their counterfactual instead (`_savings/wrapper.py: declare_replaced`, per `counterfactual.py:8-11`). Crucially, **dead-ends are debited**: an error response records `raw=0 / distilled=delivered`, a negative row, because a credit-only ledger overstates net savings — repowise names a real incident ("the E11 sign-flip: +138.7k claimed while the session net-spent", `_savings/recorder.py:54-69`). Rows land as `mcp:<tool>` / `mcp:<tool>:dead_end` in a repo-local SQLite sidecar (`recorder.py:79`), read by `repowise saved` which prices saved tokens at the **agent's** input rate (`packages/cli/src/repowise/cli/commands/saved_cmd.py:1-29`).

**Value for us.** This is the honest ROI story for the whole product: "graphify replaced N tokens of raw exploration this week" is the number that justifies the graph to a principal. Two upstreams now ship savings accounting (CRG's Token Savings panel, see the CRG recheck in `UPSTREAM_GAP.md`) — it is becoming table stakes. The undersell + dead-end-debit discipline is exactly our "no fabricated verification" posture applied to accounting.

**Adoption target(s).** `graphify core` (MCP serve path + agent-stats surfaces). `radar` and every skill-consuming repo benefit as consumers; nothing mesh-side (savings are *agent-side input* tokens, provider-neutral by nature).

**Data joins & gaps.** We account **spend**, never **savings**: `src/agent-stats/stats.ts:38` `costWeightedTokens` weights a session's token totals (cache-aware heuristic, `:30-37`), and the graph-build LLM spend is a single aggregate `{input, output}` threaded into GRAPH_REPORT (`src/report.ts:147`, plumbed via `src/skill-runtime.ts:400,431,1345`). No per-tool-call records exist on the serve path (`src/serve.ts:1146-1160` dispatches tools statelessly), and no counterfactual estimator exists anywhere. Joins required: (a) per-call hook in the MCP dispatch map (`src/serve.ts:1146`); (b) our own per-tool estimators over *our* response shapes (`query_graph` traversal text, `answer_graph` pack citations, `first_hop_summary`, `review_delta`); (c) an append-only sidecar ledger (files-first, e.g. `.graphify/stats/savings.jsonl` — NOT SQLite; our no-key/files posture) that `agent-stats report` can fold in.

**Cost: S.** Estimators + ledger + a `saved`-style report section.

**AGPL boundary.** Adopt the *ideas*: conservative undersell, declared-over-computed precedence, dead-end debits, agent-side pricing. Re-derive our own floors from our own response shapes; do not copy their floor values or estimator code. (A "400 tokens per hit" constant re-derived from our own typical file sizes is fine; copying their table is not.)

**Phased reco.** Phase 1. Independent mini-lot, no product-surface controversy, high demo value. Decision §15.D2 fixes the ledger location and the token-only scope.

## 3. Deterministic CLAUDE.md context block

**What repowise does.** `repowise generate-claude-md` (`packages/cli/src/repowise/cli/commands/claude_md_cmd.py:20`) renders a marker-managed section into `.claude/CLAUDE.md` — user content above the markers is never touched (`core/generation/editor_files/claude_md.py:14-38`). The block is **pure template over already-indexed data, zero LLM** (`templates/claude_md.j2`): last-indexed stamp + confidence, architecture summary, key-modules table (with owner), entry points, tech stack, architectural layers, a 6-step guided-tour digest, churn hotspots with owners, code-health digest. A workspace variant aggregates cross-repo co-changes and contracts (`claude_md_cmd.py:161-286`). Regenerated by `init`/`update`, so it rides the auto-sync loop.

**Value for us.** Every agent session starts by paying the orientation tax. We already *install* a static rules section — but it contains zero facts about the repo. A deterministic, graph-derived block (top communities with their salient labels, hub/god nodes, entry points, node/edge counts, build stamp) makes the graph's first hop free, before any tool call. No-key by construction — it strengthens the skill-default posture rather than fighting it.

**Adoption target(s).** `graphify core`. Consumers: every repo with the skill installed (including `process-std-am`, `radar`, `nc-fullstack` hosts).

**Data joins & gaps.** The mechanics half already exists: `CLAUDE_MD_SECTION` (`src/cli.ts:697`) is written marker-managed via `replaceOrAppendSection(content, MD_MARKER, …)` (`src/cli.ts:896`, `:1955`), with per-platform variants (`:1192-1207` for the skill, GEMINI/codex variants nearby). The data half also exists: community labels (`src/community-labels.ts`), god nodes/surprises (`src/analyze.ts:1-4`), first-hop summary (`src/serve.ts:812`, CLI `summary` `src/cli.ts:5041`), GRAPH_REPORT generation (`src/report.ts:139+`). The gap is purely the join: nothing renders graph data *into* the managed section, and `hook-rebuild` (`src/cli.ts:5691`) does not refresh it. Design: a second managed sub-block (its own marker pair, so the static rules and the generated facts diff independently) emitted from the same data `summary` reads.

**Cost: S.**

**AGPL boundary.** The marker-managed-section pattern is already ours (independently implemented, predates this intake). Adopt the *content list* idea (which facts earn a place) by re-selecting from our own analytics; write our own template. Do not copy `claude_md.j2`.

**Phased reco.** Phase 1. One design decision to take first (§15.D4): whether `hook-rebuild` regenerates the block (freshest, but commits churn) or only explicit install/update does — and the stamp must be the graph build hash, not a timestamp, to keep PR diffs quiet.

## 4. SCC / import-cycle pass

**What repowise does.** Computes strongly-connected components over the file import graph with networkx (`packages/core/src/repowise/core/ingestion/graph/_metrics.py:139`, `:377-410`), keeps only real cycles (`scc_size >= 2`, `:404`), persists `scc_id`/`scc_size` per node (`_serialize.py:36-77`; SQL model `graph_node_membership`, `persistence/models.py:282-312` — explicitly "additive … non-load-bearing"). Cycles then feed dashboards, conformance, and the break-cycle refactoring detector.

**Value for us.** Cycle detection is the cheapest high-signal structural analytic we lack: it flags architecture erosion, powers review warnings ("this change grows a 7-file import cycle"), and is a prerequisite for any future refactoring/health axis (§13). The python upstream census also has an import-cycle row we deferred *because* we had no cycle report (`94392de`, `UPSTREAM_GAP.md` drift re-scan) — this closes that gap class.

**Adoption target(s).** `graphify core`.

**Data joins & gaps.** `src/analyze.ts` computes god nodes, surprises, suggested questions, graph diff (`:1-4`) — BFS/betweenness only; grep confirms zero SCC/Tarjan anywhere in `src/`. Joins: Tarjan (iterative, no recursion — graphs are large) over the Graphology instance in `analyze.ts`, restricted to code-file nodes and directed structural edges; surface in MCP `graph_stats` (`src/serve.ts:990`, dispatch `:1159`), in GRAPH_REPORT (`src/report.ts`), and as a `review-analysis` warning when changed files sit on a cycle (`src/review-analysis.ts:159` `buildBlastRadius` is the natural place to count impacted cycles). Persist as node attributes in `graph.json` (additive, like repowise's posture).

**Cost: S.** Tarjan is textbook; the work is the surfacing.

**AGPL boundary.** Nothing to adopt but the decision *to* surface SCCs and where (SCC itself is 1972 public knowledge). Zero copying risk.

**Phased reco.** Phase 1. No decision needed; pure additive analytics.

## 5. Search auto-routing by query shape

**What repowise does.** One search tool, four lanes: `mode="auto"` classifies the query — path-shaped → file resolution, single identifier-shaped token → symbol index, natural language *carrying* an identifier → hybrid (symbol hits first, concept pages reserved half the window so neither floods the other, `tool_search.py:519-529`), pure prose → semantic wiki search (`_resolve_mode`, `tool_search.py:435-455`; tool at `:543-571`). Two honesty features ride along: a **grep hint** on identifier-shaped queries ("Grep will find literal usages faster … verify before relying", `:414-429`) and a per-result `search_method` tag (embedding vs bm25 fallback) so a silent quality cliff is visible to the agent (`:596-612`). Results get a git-freshness boost and derived confidence (`:629-641`).

**Value for us.** Our retrieval stack is strong but mode-blind: an agent asking `query_graph("assembleAnswerPack")` gets the same BM25F+PPR treatment as a prose question, with global top-3 seeds. Routing by shape fixes the worst failure (identifier queries drowning in thematic drift) at the *front* of the pipeline, without touching the lanes themselves. The grep-hint idea is free honesty: our skill posture already prefers pointing the host at a better tool.

**Adoption target(s).** `graphify core` (CLI `query` `src/cli.ts:5484`, MCP `query_graph` `src/serve.ts:874`, and the offline retrieval core). `nc-fullstack` inherits it for free if the classifier lives in the shared retrieval core (`src/retrieval/query.ts` is pure TS, browser-loadable by design, `:1-12`).

**Data joins & gaps.** `src/retrieval/query.ts` (BM25 seeds + RRF + PPR) and `src/search-index.ts` have no query classifier; MCP `toolQueryGraph` takes global top-3 seeds (`src/serve.ts:347-348`) with no per-term diversity — the python upstream fixed the same defect (`d56ee83`, drift re-scan) and `queryTerms` still keeps "what"/"how" filler (`src/search.ts:26-49`, drift row `6e97088`). Joins: (a) a shape classifier (identifier regex / path heuristic / embedded-identifier extraction) in front of seed selection; (b) an exact-label lane (we already have label lookup in `get_node`, `src/serve.ts:935`) for identifier-shaped queries; (c) a `hint` field in MCP responses for grep-shaped queries. Note the overlap: two of the needed pieces are *already* queued as python-upstream parity rows (per-term BFS seeds, stopwords) — route them into one lot so the classifier lands on fixed foundations.

**Cost: S/M.** S for classifier + hint; M if the exact-label lane needs index changes.

**AGPL boundary.** Adopt the routing taxonomy (identifier/path/prose/mixed) and the two honesty features as *behaviors*; implement classifiers from scratch against our own tokenizer. No repowise regex or heuristics copied.

**Phased reco.** Phase 2, merged with the serve/query python-parity lot (drift re-scan "New-lot: serve/query parity").

## 6. Kamei / JIT change-risk features

**What repowise does.** Extracts Kamei-style change features per commit or `base..head` range — lines added/deleted, files/dirs/subsystems touched, Shannon entropy of the churn distribution, author prior-commit count, is_fix — by pure git subprocess, no blame at runtime (`packages/core/src/repowise/core/analysis/change_risk/features.py:1-45`). Scores them with a deliberately *linear, per-feature-attributable* L2-logistic (`model.py:105-161`): every driver's push on the risk is exact and explainable, rendered as neutral relative-to-baseline labels (`model.py:44-61`). The constants are calibrated offline against AG-SZZ bug-inducing commits on a 7-repo corpus, with the honesty published inline: **AUC 0.772 vs 0.766 for a churn-only baseline** — barely better corpus-wide, stronger on some repos (`model.py:23-34`). Persisted per commit in `git_commits` (`persistence/models.py:461-528`), documented in `docs/CHANGE_RISK.md`.

**Value for us.** Our review risk is purely structural: `computeRiskScore` (`src/detect-changes.ts:185`) weighs flow criticality, caller count, community spread — it knows nothing about *history* (a hot, fix-prone, scattered change scores the same as a cold one). Git-mined features are the orthogonal half of the risk picture, and they feed `review-delta`/`review-analysis` and the PR lane (`src/pr.ts`) directly. The deeper value is repowise's *published honesty*: the calibrated model is nearly indistinguishable from churn-only — which tells us the features matter more than the model.

**Adoption target(s).** `graphify core` (review lane). Not mesh, not process-std-am.

**Data joins & gaps.** We already extract git *topology*: `src/extract-git.ts` builds Commit/Branch/File nodes with PARENT_OF / ON_BRANCH / MODIFIES edges (adapter `graphify-git/1`, `:6`), default window 200 commits (`:8`), powering the git-flow view (#265). What's missing is the *derived features layer*: no per-commit diffstat (lines±), no entropy, no subsystem count, no author-experience accumulation, no is_fix classifier, and no join from those to `review-analysis` (`buildBlastRadius`, `src/review-analysis.ts:159`, counts only structural facts). Joins: (a) extend the extract-git walk with `--numstat`-derived features (one pass, same subprocess posture); (b) store as a derived sidecar or Commit-node attributes (decision §15.D1 — this is the git-intelligence axis, shared with co-change/ownership §13); (c) surface raw features + per-feature explanation in `review-delta` output.

**Cost: M.** The feature extraction is S; the axis decision, storage, and review-lane surfacing make it M.

**AGPL boundary — strictest of this study.** The calibrated `_CONSTANTS` (means/stds/coefficients, `model.py:35-42`) are expression from the AGPL repo **and** scientifically invalid for our corpus anyway — never copy them. The Kamei feature set itself is 2013 academic literature (Kamei et al., "A Large-Scale Empirical Study of Just-in-Time Quality Assurance") — cite the paper, not the repo. If we ever want a fitted score, we calibrate ourselves; until then we surface **raw features only, no 0-10 score claim** (§15.D5).

**Phased reco.** Phase 3, gated on §15.D1 (git-intelligence axis) — but the feature extraction subset can start in Phase 2 if D1 resolves early, since extract-git.ts is already the seam.

## 7. Agent-provenance heuristics (fallback lane)

**What repowise does.** Classifies every commit `{agent, autonomy_tier, channel, confidence}` from **local git metadata only** (`packages/core/src/repowise/core/ingestion/git_indexer/agent_provenance.py`): tier 1 = agent service account *authored* (bot logins/service emails, `:70-87`), tier 2 = exact service footer phrases or agent-as-committer-over-human-author (`:89-95`, `:199-203`), tier 3 = `Co-authored-by:` trailer naming a service identity (`:97-112`). Precision-first by doctrine: every pattern anchors to a *service identity*, never a bare name ("a false 'agent-authored' label on a human commit is worse than a miss", `:20-25`); squash-merge trailer stripping is an accepted recall loss (`:27-30`); the registry is data, extensible per-repo from config without forking (`:33-46`, `:211-255`).

**Value for us.** We are **ahead on mechanism**: `src/agent-stats/correlate.ts` attributes commits from *session evidence* — a 5-rank ladder from commit-sha-printed-in-tool-output down to worktree-branch-window (`:1-24`), joined to the Track ledger's WP mandates via `src/agent-stats/track-join.ts` (thread-ids/h2a-ids parsed from dossiers, `:1-26`). Transcripts beat trailers. But transcripts are not always there: repos without `.claude`/codex session stores (colleagues' machines, CI-authored commits, historical windows) currently attribute to nobody. A commit-metadata classifier is the natural **rank-6 fallback** below our existing ladder.

**Adoption target(s).** `graphify core` (agent-stats).

**Data joins & gaps.** `correlate.ts` ranks stop at 5 (worktree-branch-window); `git-evidence.ts` parses checkout commands, not commit trailers; nothing reads author/committer identities as agent signals. Join: a rank-6 rule emitting `CorrelationLink`s with `confidence: low` from commit metadata, using the same identity registry idea (extensible via config). **Honesty note:** our own house rule forbids Co-Authored-By trailers (standing feedback), so the tier-3 channel has literally zero recall on our repos — the value lives in tiers 1-2 (bot identities, service footers) and on *other* orgs' repos where graphify runs as a product.

**Cost: S.**

**AGPL boundary.** Adopt the doctrine (service-identity anchoring, precision-over-recall, tier semantics, config-extensible registry). Write our own patterns; bot-account names and footer phrases are public facts, not repowise expression, but assemble our own list from the services' own docs.

**Phased reco.** Phase 2, as an agent-stats mini-lot. No axis dependency (it reads commits we already walk).

## 8. Per-call LLM cost ledger — **mesh-owned**

**What repowise does.** Every pipeline LLM call writes one row `{ts, model, operation, input_tokens, output_tokens, cost_usd, file_path}` (`llm_costs`, `persistence/models.py:832-847`), tracked centrally (`core/generation/cost_tracker.py`) and read by `repowise costs` with since/by-operation grouping (`packages/cli/src/repowise/cli/commands/costs_cmd.py`). Simple, boring, always-on.

**Value for us.** Per-call cost rows turn "the build cost something" into "descriptions cost $X on model Y, labels $Z" — the input for provider choice, budget alarms, and the E5 embeddings-provider decision. But **pricing and provider accounting are exactly what the sentropic mesh/gateway exists to own**: graphify's standing posture is provider-neutral, no-key by default, and the mesh bridge is already the seam through which provider-agnostic execution flows.

**Adoption target(s).** **`sentropic mesh/gateway` owns the ledger** (rows, pricing tables, `costs`-style reporting). `graphify core` only *emits usage events* — `{operation, schema, model, tokens}` — through the existing hooks seam; it never stores dollar amounts or pricing tables. Note the prior art on our side of the fence is thin and split: the aggregate `tokenCost {input, output}` reaches GRAPH_REPORT (`src/report.ts:147`) via `src/skill-runtime.ts:400,431,1345`; agent-stats accounts *transcript* spend (`src/agent-stats/stats.ts:38`); and `src/provider-registry.ts` carries an optional per-provider `pricing` field (`:37-40`) that nothing consumes (see §12). Consolidating all of that in graphify would grow a second accounting system inside a repo whose contract is to stay provider-neutral — hence mesh.

**Data joins & gaps.** The seam exists and is idle: `src/llm-execution.ts:8` already declares mode `"mesh"`, and `src/llm-mesh-bridge.ts` imports `LlmMeshHooks` from `@sentropic/llm-mesh` (`:31`) — but the bridge is an explicit scaffold ("Provider live SDK calls are NOT performed here", `:16-21`), so *nothing flows through it yet*. Joins: (a) mesh-side — a cost-ledger sink behind `LlmMeshHooks` with pricing resolution per provider/model; (b) graphify-side — emit usage events from the direct-execution dispatch too (`DirectLlmProvider` union, `src/llm-execution.ts:9-11`), forwarded to the mesh sink when configured, dropped otherwise; (c) reporting stays mesh-side (or in the host assistant), not a graphify CLI surface.

**Cost: S (mesh) + S (graphify event emission).** Gated on the bridge's live wiring (Track A follow-up), which is prerequisite work with its own schedule.

**AGPL boundary.** A cost row schema is unoriginal; nothing to copy. Adopt only the discipline (every call, one row, operation-tagged).

**Phased reco.** Phase 2 mesh-side once the bridge is live; §15.D3 ratifies the ownership split so no one builds it in graphify in the meantime.

## 9. Knowledge map: curated layers, guided tours, entry-point ranking

**What repowise does.** A machine "curation pass" turns the raw graph into a navigable presentation **without touching the base graph** — the hard invariant is documented and regression-tested ("it only ever writes the returned result … node/edge counts identical before and after", `packages/core/src/repowise/core/analysis/kg_curation.py:1-23`, feature-flagged default-on). Products: bounded dependency-ordered layers with curated sub-groups (`knowledge_graph_layers`, `persistence/models.py:1087-1105`), a deterministic guided tour — entry-point scoring (filename stems + ingestion flags + path depth + PageRank), BFS depth from entry points, depth-bucketed step order, infra woven at the end, at most one extra LLM page total (`core/generation/tour.py:1-30`; steps persisted `models.py:1108-1130`), ranked entry points per repo (`kg_project_meta`, `models.py:1133-1153`), and per-node curated type/summary/tags overlay (`kg_node_meta`, `models.py:1156-1178` — "the AST graph's `graph_nodes` rows are untouched").

**Value for us.** This is onboarding-as-data: "read the repo in 8 stops, in this order, for these reasons" — deterministic, budget-honest, and exactly the artifact the Studio and the wiki lack. The invariant matches ours verbatim: our hierarchy sidecar is precisely a curation overlay over an untouched base (`src/scene-hierarchies.ts:1-33`).

**Adoption target(s).** `graphify core` (Studio + wiki) **and** `process-std-am` (tours over validated hierarchies: "walk the AM lot structure in ratification order" is the same mechanism on a different corpus). `nc-fullstack` consumes tours shipped in packs.

**Data joins & gaps.** We have the sidecar substrate (two-lane `graphify_scene_hierarchies_v1`, `src/scene-hierarchies.ts:39`, WP4 G2 signed 2/2 — contract **frozen**, so tours must NOT be jammed into it), Studio group-by/collapse, community labels, and wiki pages (`src/wiki.ts`). We have **no** entry-point ranking (no `is_entry_point` flag in `GraphNode`, `src/types.ts:46-75`), no tour artifact, no per-node curated overlay class. Joins: (a) entry-point scoring from our own signals (package.json `bin`/`main`, filename stems, in/out-degree, PageRank); (b) a standalone `graphify_tour_v1` sidecar (schema mirroring the hierarchy sidecar's id discipline); (c) Studio tour player (walks the scene, highlights per step); (d) optionally a wiki "onboarding" page narrating the ordered stops (one LLM call, respecting no-key: skip narration offline, serve the deterministic order).

**Cost: M.** Ranking S, sidecar S, Studio player is the M.

**AGPL boundary.** Adopt the *architecture* (curation-as-sidecar — already ours), the tour derivation *recipe* (entry-scoring → BFS depth → bucketed order) as a functional description, and the budget-honesty rule (tours reference only existing pages). Re-implement scoring with our own signals and stems; no template/code copying.

**Phased reco.** Phase 3, gated on WP4 G2 stabilization (peer is stabilizing; don't add sidecar classes while the first one settles) and on Studio perf chantiers (a tour player over a slow canvas is a bad demo). §15.D6 fixes the sidecar-vs-contract-addendum question.

## 10. `get_context`-style facets and skeletons

**What repowise does.** One batched context call per set of targets, with a small default payload (docs summary + freshness) and opt-in `include=` facets: `full_doc`, `callers`, `callees`, `ownership` (owner, bus factor), `last_change`, `metrics` (PageRank/betweenness percentiles), `community`, `decisions`, `skeleton` (`packages/server/src/repowise/server/mcp_server/tool_context/context.py:10-18`; defaults `{docs, freshness}` at `:76-83`). The `skeleton` facet renders a **body-elided file** — signatures kept, top-PageRank bodies kept, the rest elided — with `skeleton.full_tokens` recording exactly what a full Read would have cost (which then powers the §2 counterfactual, `_savings/counterfactual.py:31-52`).

**Value for us.** Facets are the token-budget contract our MCP surface lacks: `get_node` returns one fixed shape (`src/serve.ts:935-947`), `get_neighbors` another (`:949+`), and an agent wanting "node + citations + community + neighbors" makes three calls or over-fetches. An `include=` parameter is cheap, additive, and backward-compatible.

**Adoption target(s).** `graphify core` (MCP). `nc-fullstack` benefits if the facet assembly lives in shared retrieval code.

**Data joins & gaps — honesty first.** The facet half is genuinely cheap: descriptions, citations (`citations`/`citation_count` on `GraphNode`, `src/types.ts:62-71`), community + labels, degree metrics, and (post-§4) SCC membership are all already on or near the node; `review-context` (`src/cli.ts:5191`) already assembles multi-source context CLI-side. The **skeleton half is NOT cheap for us**: the intake table said "extract already has spans" — verified, that is only true of the *review lane* (`src/review-store.ts:41`, `:284` keep line bounds); the semantic graph's nodes carry just an optional `source_location?: string` (`src/types.ts:51`), no structured start/end spans. Body-elided rendering needs spans persisted at extraction for every code node — an extractor + schema change (additive column, but touching `src/extract.ts`'s many collectors). Ownership/last-change facets additionally depend on the §6/§13 git axis.

**Cost: S for facets (docs/citations/community/metrics), M for skeletons (span persistence), facets-of-git gated on D1.**

**AGPL boundary.** `include=` parameter lists are unoriginal API design; the skeleton *policy* (signatures + top-PageRank bodies within budget) is adopted as a functional idea, implemented against our own extractor. Nothing copied.

**Phased reco.** Phase 2 for the facet parameter on `get_node`/`answer_graph`; skeletons Phase 3 (own mini-spec once span persistence is costed).

## 11. External systems from manifests, with `io_kind`

**What repowise does.** Parses package manifests per ecosystem (npm, pypi, cargo, go, maven, nuget, cmake, bazel — `packages/core/src/repowise/core/ingestion/external_systems/*.py`) into first-class `ExternalSystem` rows `{name, ecosystem, category, io_kind, version, declared_in, is_dev_dep}` (`persistence/models.py:192-224`), links resolved `external:*` import nodes to them (`models.py:180-184`), and classifies each dependency's **boundary kind** — `db | network | filesystem | subprocess | lock` — from a conservative cross-ecosystem seed table (`external_systems/io_kind.py:33`, classifier `:147-156`; unknown → `None`, never a guess). This powers C4 L1 rendering and is deliberately shared with future security/perf consumers.

**Value for us.** Third-party boundaries are where reviews get risky ("this change adds a new network dependency") and where architecture diagrams earn trust. Dependency nodes with `io_kind` would enrich `review-delta` (flag new/changed external boundaries), the Studio (group externals by kind), and any future C4-like rendering — and it is zero-LLM.

**Adoption target(s).** `graphify core` (extractor + review lane). `radar` benefits as a consumer (its stack review), not as an owner.

**Data joins & gaps.** Verified: `src/extract.ts` has **no manifest parsing at all** (no package.json/pyproject/Cargo.toml handling), and unresolved bare npm imports currently *collide into phantom module nodes* (`_makeId(moduleName)` fallback, `src/extract.ts:459-461` — confirmed TS-exposed in the drift re-scan, row `e2ef4ef`). Meanwhile the python upstream has its own package-manifest rows sitting **unported** in the 0.8.49 window (`dbce453`, `UPSTREAM_GAP.md`). So there are two upstream designs for the same gap; the audit must pick one shape before any code. Joins: (a) manifest collectors per ecosystem; (b) an `ExternalDependency` node type in the ontology-profile sense (these ARE semantic entities, unlike §9's presentation overlays — they belong in the graph, not a sidecar); (c) an io-kind seed table of our own; (d) rewire the phantom-import fallback to resolve into these nodes (fixing the `e2ef4ef` collision at the root).

**Cost: M.**

**AGPL boundary.** The entity shape and the io-kind taxonomy (`db/network/filesystem/subprocess/lock`) are adopted as design; the seed table must be **rebuilt by us** from ecosystem knowledge — do not copy their curated name lists (they are expression; also our language mix differs).

**Phased reco.** Phase 3, audit-first (§15.D8): reconcile with the python-upstream manifest rows in one design, and fold the phantom-import fix in.

## 12. Provider union — mesh-side

**What repowise does.** Ships nine LLM backends behind one lazy registry — anthropic, openai, openrouter, gemini, ollama, litellm, deepseek, codex_cli, opencode (`packages/core/src/repowise/core/providers/llm/registry.py:41-52`) — plus runtime `register_provider()` for community providers without forking (`:58-81`).

**Value for us.** Broader BYOK matrix on user demand — standing decision from the 0.8.49 intake is already "extend the union only on demand" (kimi/deepseek noted n/a there). Nothing has changed on demand-side since.

**Adoption target(s).** **`sentropic mesh/gateway`** — provider adapters are exactly what `@sentropic/llm-mesh` is for; graphify's `DirectLlmProvider` union stays frozen at anthropic/openai/gemini/mistral/cohere/ollama (`src/llm-execution.ts:9-11`).

**Data joins & gaps — honesty finding.** We *already ported* a runtime-extensible provider registry (`src/provider-registry.ts`, F-0831-P2a: `providers.json` with base_url validation, env keys, optional pricing) — and it is **wired to nothing**: `loadCustomProviders` (`:82`) has zero call sites outside its own module and `security.ts` docs (grep-verified this pass). It is a ported-but-dormant surface. Any provider-union decision must first decide this artifact's fate: wire it into the direct dispatch, or deprecate it in favor of mesh adapters — carrying both would be two extension mechanisms for the same need.

**Cost: S per adapter (mesh-side); S to wire-or-retire provider-registry.ts (graphify-side).**

**AGPL boundary.** A provider registry is unoriginal; nothing to copy. OpenRouter/LiteLLM-style gateways are third-party APIs with their own docs.

**Phased reco.** Phase 3 / backlog, demand-driven. §15.D7 settles the provider-registry.ts dormancy either way — that part should not wait for demand.

## 13. The remaining defers — compact sweep (no deep-dive, decision-routing only)

These stay `defer` from the intake table; this study only assigns owner/phase and names the gating decision. None should start without its own spec.

| Opportunity (intake row) | Owner | Cost | Gate / note |
| --- | --- | --- | --- |
| Code Health 25-marker model (#13, `docs/CODE_HEALTH.md`) | graphify core | L | Own spec + own calibration; the §6 honesty lesson (churn baseline is nearly as good) applies doubly here. Phase 4. |
| Dead-code detection (#14, `analysis/dead_code`) | graphify core | M/L | Needs §4 SCC + §11 entry points first (reachability roots). Phase 4. |
| Co-change mining + owners/bus-factor (#15/#16, `analysis/coupling`, `git_metadata`) | graphify core | M | The other half of §15.D1's git-intelligence axis; co-change also feeds §6 and reviewer suggestions. Phase 3 if D1 = yes. |
| ADR/decision mining (#17, `analysis/decisions`) | graphify core (+ process-std-am patterns) | L | Verification-ladder + evidence-accretion patterns already adopted into the curated-responses spec; full mining is Phase 4. |
| Distill / omission store (#18, `docs/DISTILL.md`) | host-side (skill), not graphify core | L | Agent-IO middleware conflicts with our no-key skill posture (output shaping belongs to the HOST assistant). Revisit only if the skill contract changes. |
| Multi-repo workspaces + contracts (#19, `docs/WORKSPACES.md`) | sentropic (org-level), graphify participates | L | Contract extraction is the interesting kernel; webhook intake folds here. Phase 4. |
| C4 views (#20) | graphify core (Studio) | M/L | Re-evaluate after hierarchy-collapse UX + §11 externals exist (C4 L1 is mostly a rendering of §11). Phase 4. |
| Proactive hooks / augment (#21) | graphify core (skill) | M | Interacts with the no-key skill contract; product decision. Phase 4. |
| Refactoring plans (#22) | graphify core | L | Needs §4 + health. Phase 4. |
| Coverage ingestion (#23) | graphify core | S | Cheap once any risk axis exists; parked behind D1. |
| Reviewer suggestions (#24) | graphify core | S/M | Needs owners (#16). |
| Wiki restyle + glossary (#25) | graphify core (wiki lane) | S/M each | Independent nice-to-haves on `src/wiki.ts`; schedulable any time the wiki lane is touched. |
| Security pattern scan (#26) | graphify core | M | Overlaps the standing TS dependency/security audit note (0.8.49 intake); do inside that audit, not as a port. |
| VS Code extension (#30) | — | L | Standing decision (same as CRG row): no VS Code extension without a dedicated spec. |

## 14. Prioritized table

Value = leverage for our actual product lines (skill-first code intelligence, process-std-am ontology program, published packs), not upstream shininess.

| # | Opportunity | Value | Cost | Owner repo | Phase |
| --- | --- | --- | --- | --- | --- |
| 1 | Counterfactual savings accounting (§2) | **High** | S | graphify core (agent-stats + serve) | **1** |
| 2 | Deterministic CLAUDE.md context block (§3) | **High** | S | graphify core | **1** |
| 3 | SCC / import-cycle pass (§4) | **High** | S | graphify core | **1** |
| 4 | Curated responses (§1 → own spec) | **High** | M + S | graphify core → nc-fullstack → process-std-am | 2 (sequencing in its spec) |
| 5 | MCP facets `include=` (§10, facet half) | Med/High | S | graphify core | 2 |
| 6 | Search auto-routing + grep-hint (§5) | Med/High | S/M | graphify core | 2 (merge with serve/query parity lot) |
| 7 | Agent-provenance fallback lane (§7) | Med | S | graphify core (agent-stats) | 2 |
| 8 | Per-call LLM cost ledger (§8) | Med | S + S | **sentropic mesh/gateway** (graphify emits events only) | 2 (gated on live mesh bridge) |
| 9 | Kamei change-risk features, raw-features-first (§6) | Med/High | M | graphify core (review lane) | 3 (gated D1) |
| 10 | Knowledge-map tours + entry-point ranking (§9) | Med | M | graphify core (Studio) + process-std-am | 3 (gated WP4 G2 stab + Studio perf) |
| 11 | External-systems manifests + io_kind (§11) | Med | M | graphify core | 3 (audit-first, D8) |
| 12 | Skeleton rendering (§10, span half) | Med | M | graphify core | 3 (own mini-spec) |
| 13 | Provider union (§12) | Low/Med | S each | sentropic mesh | 3 / backlog (D7 settles the dormant registry now) |
| 14 | Defer sweep (§13) | varies | M-L | per row | 4 (spec-first each) |

Phase-1 shape: three S-sized, decision-light lots (#1-#3) that are each independently shippable and demo-friendly.

## 15. Open decisions for the principal

**D1 — Open the git-intelligence axis?**
*Subject:* §6 (Kamei features), §13 co-change/owners, coverage and reviewer rows all need derived git-history analytics (churn, entropy, co-change pairs, ownership) that `src/extract-git.ts` (topology only, 200-commit default window) does not produce. One axis decision, not four feature decisions.
*Options:* (a) yes — derived-metrics sidecar (`.graphify/git-intel.json` or Commit-node attributes), extract-git walk extended; (b) yes, but attributes-on-nodes only (no new artifact class); (c) no — stay structural-only.
*Reversibility:* high (additive artifacts, deletable).
*Reco:* (a) — sidecar keeps the semantic graph clean and the window-size question local; it unblocks four table rows at once.

**D2 — Savings ledger: location and scope.**
*Subject:* §2 needs a store for `mcp:<tool>` counterfactual rows.
*Options:* (a) append-only JSONL under `.graphify/stats/` folded into `agent-stats report`; (b) inside the agent-stats session store; (c) token-only vs also $-priced in graphify.
*Reversibility:* high.
*Reco:* (a) + token-only — dollars require pricing tables, which D3 assigns to the mesh; graphify reports tokens, the host or mesh prices them. (Supersedes open decision 5 of the curated-responses spec.)

**D3 — Ratify: cost/pricing accounting is mesh-owned.**
*Subject:* §8 — who owns the per-call LLM cost ledger.
*Options:* (a) mesh owns rows+pricing, graphify emits usage events through `LlmMeshHooks` (and from direct dispatch); (b) graphify grows its own `llm_costs` analog.
*Reversibility:* medium (an event schema is cheap to move; a second accounting system is not).
*Reco:* (a) — keeps graphify provider-neutral; matches the standing mesh direction. Needs a small event-schema note deposited with the mesh peer.

**D4 — CLAUDE.md generated block: refresh trigger.**
*Subject:* §3 — when does the graph-derived block regenerate.
*Options:* (a) on `hook-rebuild` (freshest; churns committed CLAUDE.md in PRs); (b) only on explicit `install`/`update`; (c) hook-rebuild but content-hash-stamped (no timestamps) so no-op rebuilds produce no diff.
*Reversibility:* high.
*Reco:* (c).

**D5 — Change-risk: features-only or scored?**
*Subject:* §6 — repowise's own calibration shows the fitted model barely beats churn-only (AUC 0.772 vs 0.766), and their constants are both AGPL and corpus-specific.
*Options:* (a) surface raw Kamei features + per-feature explanations, no aggregate score; (b) uncalibrated heuristic 0-10 score (dishonest precision); (c) invest in our own SZZ-style calibration (L, own program).
*Reversibility:* high for (a); (b) is hard to walk back once users see a number.
*Reco:* (a) now; (c) only if a defect-corpus opportunity appears (e.g. via the public-pack or radar histories).

**D6 — Tours: standalone sidecar or WP4 contract addendum?**
*Subject:* §9 — where the guided-tour artifact lives relative to the frozen, signed `graphify_scene_hierarchies_v1` contract.
*Options:* (a) new standalone `graphify_tour_v1` sidecar (same id discipline, separate file, no peer renegotiation); (b) addendum to the WP4 G2 bundle contract (peer negotiation, one bundle).
*Reversibility:* (a) high; (b) medium (contract changes are signed).
*Reco:* (a) — the signed contract stays frozen; process-std-am adopts the tour sidecar later by reference if it proves out on code corpora.

**D7 — Fate of the dormant `src/provider-registry.ts`.**
*Subject:* §12 — `loadCustomProviders` is fully implemented (validation, env keys, pricing field) and called by nothing; leaving it dormant is silent dead surface, and it duplicates the mesh's future adapter-registration role.
*Options:* (a) wire it into the direct-LLM dispatch (honors the original F-0831-P2a port intent; gives BYO-base-URL providers today, no mesh dependency); (b) deprecate/remove in favor of mesh adapters when the bridge goes live; (c) leave as-is.
*Reversibility:* (a) and (b) both high; (c) accrues confusion.
*Reco:* (a) short-term — it is the no-key-friendly, already-reviewed path and instantly covers the deepseek/openrouter-style "just a base_url + key" demand without touching the frozen union; revisit toward (b) once the mesh bridge carries live traffic.

**D8 — External-systems: single design across two upstream references.**
*Subject:* §11 — the python upstream's unported package-manifest rows (0.8.49 window) and repowise's `ExternalSystem`+`io_kind` describe the same missing subsystem; building either verbatim forecloses the other.
*Options:* (a) audit both, write one graphify-native design (dependency nodes + io-kind attr + phantom-import fix folded in); (b) port the python-upstream rows first, retrofit io_kind later; (c) defer entirely.
*Reversibility:* medium (node-type additions live in published graphs).
*Reco:* (a) — one audit lot, one design; the phantom-import collision (`src/extract.ts:459-461`) gives it a bug-fix anchor that justifies the lot even if the full entity model waits.
