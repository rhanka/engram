# SPEC EVOL — Curated Responses (repowise-inspired)

**Status: DRAFT — decision-ready, analysis-only (no port in this lot).**
Upstream-intake wave WP6, 2026-07-06. Companion intake: `UPSTREAM_GAP.md > Repowise reference intake (2026-07-06)`.

Reference upstream: `repowise-dev/repowise` at `6680c2822a64ee2c0bc53c196fe7a321df9aaf8a` (v0.27.0-1, 2026-07-05), cloned at `.graphify/scratch/clones/repowise`.

> **License wall (hard constraint).** repowise is **AGPL-3.0**; this repo is **MIT**. Adoption is **design-level only**: schemas, lifecycles and invariants may be re-designed from this functional analysis, but **no repowise code may be copied or translated**.

---

## 1. The mechanism found upstream (what "curated responses" actually are)

repowise's pitch line: *"repowise hands the agent a curated answer instead of a pile of files to read"* (`README.md:231`). "Curated response" is not one feature; it is a **stack of five cooperating mechanisms**, all persisted, all provenance-stamped:

### 1.1 Generated, versioned wiki pages — the curated corpus

- Offline pipeline generates LLM pages per target: 9 page types (`file_page`, `symbol_spotlight`, `module_page`, `scc_page`, `repo_overview`, `architecture_diagram`, `api_contract`, `infra_page`, `diff_summary`) — `docs/internals/llm-generation.md §2-3`, token-budgeted with significance filtering (§4-5).
- **Storage & keying**: SQL table `wiki_pages` (`packages/core/src/repowise/core/persistence/models.py:87-126`). Primary key is the **natural key `"{page_type}:{target_path}"`** so callers upsert without knowing row ids. Each row carries `source_hash` (content hash of the source it documents), `model_name`/`provider_name`, token counts, `generation_level`, `version`, `confidence` (float, decaying), `freshness_status`.
- **History**: every regeneration archives the previous row into `wiki_page_versions` (`models.py:128-151`).
- **Human curation slots**: `wiki_pages.human_notes` — *"Developer-authored notes that survive LLM re-generation"* (`models.py:123`, alembic `0014_page_human_notes.py`). Edited via the web dashboard (`packages/server/src/repowise/server/routers/pages.py:81-96`), surfaced by `get_context` (`mcp_server/tool_context/targets.py:365-366`). A companion `repowise corrections` CLI manages human corrections to generated content that likewise survive regeneration (`packages/cli/src/repowise/cli/commands/corrections_cmd.py:29`). These are the *human*-curated slots in the pipeline; everything else is machine-curated.

### 1.2 Curation passes — machine-curated presentation metadata

A distinct "curation pass" produces presentation-layer metadata **without touching the AST graph**:

- `kg_project_meta` — ranked entry points per repo, "so the server never has to read workspace files at request time" (`models.py:1141-1162`).
- `kg_node_meta` — curated `type`/`summary`/`tags` per file node, *"presentation view only … the AST graph's `graph_nodes` rows are untouched"* (`models.py:1164-1194`).
- `knowledge_graph_layers` with curated `sub_groups_json`, and `knowledge_graph_tour_steps` (curated, layer-aware guided tours) (`models.py:1088-1139`).
- C4 architecture views get their own curation service (`packages/server/src/repowise/server/services/c4_builder/`, tests `tests/unit/server/services/test_c4_curation.py`).

**Design principle worth stealing: curation is a sidecar overlay over an untouched base graph** — exactly our hierarchy-sidecar two-lane posture.

### 1.3 `get_answer` — the curated Q&A surface

One-call RAG (`docs/MCP_TOOLS.md > get_answer`): retrieval over the wiki (embedding + BM25 fallback) → synthesis → **confidence gating** → cited 2-5-sentence answer. Implementation `packages/server/src/repowise/server/mcp_server/tool_answer/` (`retrieval.py`, `synthesis.py`, `confidence.py`).

Anti-hallucination gates (all in `tool_answer/confidence.py`):
- **Hedge detector** — if the synthesized answer "confesses it can't answer", confidence is forced low *regardless of retrieval dominance*.
- **Value-grounding check** — for value-shaped questions (default/threshold/limit/count…), any standalone number in the answer that does not appear in the retrieved context downgrades confidence (a confidently-asserted ungrounded number "is a factual error, not a nuance").
- **Low-confidence fallback** — low confidence returns **ranked wiki excerpts instead of prose**. The system prefers refusing to fabricate.

### 1.4 `answer_cache` — the literal curated-response store

Table `answer_cache` (`models.py:1063-1087`):
- **Keyed by `SHA-256(normalized question)` per repository** (unique constraint `(repository_id, question_hash)`); the original question is kept for human inspection.
- **Payload** = full `get_answer` JSON (`answer`, `citations`, `confidence`, `fallback_targets`, `retrieval`) in one JSON column — schema-stable across response-shape changes.
- **Stamped** with `provider_name`/`model_name` "so we can invalidate selectively if a better model is configured later".
- **Invalidation** = wholesale row delete for a repository when its index advances ("cheap to rebuild"). No staleness heuristics on the cache itself; freshness lives on the pages underneath.

### 1.5 Lifecycle, accounting, reversibility

- **Freshness**: `source_hash` mismatch detection + time-based confidence decay (`decay_confidence`) + **change-driven decay** (`compute_confidence_decay_with_git`) + freshness-status thresholds (`docs/internals/llm-generation.md §7`). Auto-sync keeps pages current via post-commit hook / file watcher / GitHub-GitLab webhooks / polling (`docs/AUTO_SYNC.md`).
- **Savings accounting**: every MCP response records a **counterfactual** — the raw exploration the curated answer replaced (`mcp_server/_savings/counterfactual.py: replaced_tokens_for`, per-tool estimators), written as `mcp:<tool>` cost rows priced at the *agent's* model; dead-ends are recorded too (`recorder.py: record_mcp_dead_end`) — honest accounting is a feature.
- **Reversible truncation**: token-budgeted responses store omitted content in an **omission store** (`.repowise/omissions/omissions.db`, SQLite WAL sidecar, 12-hex SHA-256 refs, TTL 7d / 50 MB cap) with inline `[repowise#<ref>]` markers; restore via `repowise expand <ref>` or `get_symbol("repowise#<ref>")` (`docs/DISTILL.md > The omission store`, `docs/MCP_TOOLS.md > _meta.omitted`).
- **Decision records as curated "why"**: `decision_records` (`models.py:592-655`) carry provenance `source ∈ {git_archaeology, inline_marker, readme_mining, cli}`, per-decision **`verification ∈ {exact, fuzzy, unverified}`** ("anti-hallucination gate": `exact` = a headline field is a verbatim quote of its source span), evidence rows that **accrete rather than overwrite** (`decision_evidence`, `models.py:657+`), staleness scoring and `superseded_by`.

### Ten-line summary

1. An offline pipeline writes LLM-generated pages into a DB, keyed `"{page_type}:{target_path}"`, stamped with `source_hash`, model/provider, version, confidence.
2. Every regeneration archives the old version; a `human_notes` column carries developer annotations that survive regeneration.
3. A separate machine "curation pass" writes presentation overlays (entry points, node type/summary/tags, layers, tours) **without touching the base graph**.
4. `get_answer` retrieves over those pages, synthesizes a 2-5-sentence cited answer, and gates it: hedged or numerically-ungrounded answers are demoted.
5. Low-confidence answers degrade to ranked excerpts — prose is never served unbacked.
6. High-confidence answers are cached in `answer_cache`, keyed by hash of the normalized question, payload = answer+citations+confidence, stamped provider/model.
7. Cache invalidation is brutal and cheap: delete all rows when the index advances.
8. Page freshness decays with time and with git changes; auto-sync regenerates.
9. Every curated answer logs the counterfactual tokens it replaced (costs dashboard); truncations are reversible via an omission store.
10. "Who curates": ~95% the machine (pipeline + curation passes + gates); humans curate via `human_notes`, decision records, and dashboard edits — always in dedicated, provenance-stamped slots.

---

## 2. Adoption target (a) — graphify code corpora (query/answer surfaces)

**Join point (exists today):** the offline GraphRAG answer-pack (#192, MERGED): `graphify_answer_pack_v1` (`src/retrieval/answer-pack.ts:33`, `assembleAnswerPack` at `:235`), wired to CLI `answer` (`src/cli.ts:5601`), MCP `answer_graph` (`src/serve.ts:905`) and the Studio `AnswerPanel` (`studio/src/components/AnswerPanel.svelte`, view-model `studio/src/lib/retrieval.js`). The pack carries an explicit **`answer: string | null` slot, always `null` offline** — the online seam was designed for prose to be filled in later *without fabricating anything offline*. A curated response is precisely a **legitimate, provenance-stamped filler for that slot**. Citation plumbing to reuse for the serving gate: `src/citations.ts`, `src/cite-grounding.ts`, `src/citation-policy.ts`.

**What a curated response would be here:** a persisted `{question, answer, citations[], confidence, provenance}` record whose citations resolve against the current graph — served on question-hash hit *before* (or alongside) live retrieval.

**Where it would live — options:**

| Option | Where | Pros | Cons |
| --- | --- | --- | --- |
| A (reco) | Sidecar ledger `.graphify/curated/answers.jsonl` (append-only; one record per question-hash × graph-stamp, latest wins) | Files-first like the rest of the product; no-key path preserved; diffable/reviewable in PRs (curation BECOMES reviewable content); mirrors repowise's schema-stable single-JSON-payload trick | Needs its own invalidation discipline |
| B | Curated-answer **nodes in the graph** linked to cited entities | Queryable via graph traversal | Pollutes the semantic graph with meta-content; breaks "curation overlays an untouched base" (repowise deliberately avoids this; our hierarchy sidecar does too) |
| C | `answer_cache`-style table in the native DB backends (Postgres/pgvector/Spanner on the GraphStore port) | Natural for hosted deployments; enables selective invalidation SQL | Not available in the default no-key/files path; backend-only |

**Reco: A as the canonical store, C as an optional mirror for DB-backed deployments. Reject B.**

**Anti-hallucination / citation invariants (curated ≠ hallucinated):**
- A curated record MUST carry `origin: "curated"` + curator identity (`human:<name>` or `llm:<provider>/<model>`) + `created_at` + the **graph build stamp** it was validated against.
- **Serving gate**: before serving, every citation is re-resolved against the current graph (node ids + `source_hash` of cited files). All-resolve → serve with `curated` badge; partial → downgrade to excerpts (repowise's low-confidence path); none → suppress, keep the record for re-curation. This is the repowise `exact/fuzzy/unverified` ladder applied at read time.
- The offline invariant stays intact: the Studio offline mode may render a curated answer **only** because it is citation-backed content read from disk — never synthesized prose.

**Cost: M** (ledger + read-through in `answer` CLI/MCP + serving gate + Studio badge). The curation *authoring* CLI (`graphify curate "<question>"` promoting a live answer-pack result into the ledger) is another **S** on top.

## 3. Adoption target (b) — process-std-am (ontology/hierarchy domain)

Curated answers over **lots / features / orgs** — questions like "why is lot X split from Y", "which org owns feature Z", "what is the validated hierarchy for domain D".

- **What a curated response is here:** a ratified statement about the ontology, citing (i) source documents/chunks and (ii) **hierarchy-sidecar entries**. process-std-am already has the exact lifecycle primitive: the WP4 G2 hierarchy sidecar (`graphify_scene_hierarchies_v1`) is **two-lane — `validé` / `proposé`**. Curated responses generalize the two-lane model from *hierarchy edges* to *answers*: machine writes into the `proposé` lane; a human (or a mandated review agent) promotes to `validé`; only `validé` records serve with the curated badge.
- **Where it lives:** a sidecar lane file next to the hierarchy sidecar (same bundle, graphify-side, not engine-side — consistent with the signed WP4 contract that the bundle lives in graphify). NOT graph nodes, for the same overlay reason as §2. A track-like append-only ledger fits the ratification trail (who promoted, when, superseding which record) — repowise's `decision_records` accretion model (`evidence rows accrete rather than overwrite`, `superseded_by`) is the schema to emulate.
- **Invariants:** promotion to `validé` requires every citation to resolve at promotion time; any later reconciliation run that invalidates a cited hierarchy edge flips the record to `stale` (change-driven decay, repowise §1.5) and it drops out of the serving set until re-ratified.

**Cost: M** once target (a)'s record schema exists (reuse schema + lanes; the promotion workflow is the new part). Requires a contract addendum with the process-std-am peer — **do not start before target (a) stabilizes the record schema.**

## 4. Adoption target (c) — nc-fullstack (retrieval client)

nc-fullstack-style retrieval is "a particular application of graphify" (#192). Adoption here is **client-side plumbing, not a new store**:

- **What a curated response is here:** a cache-hit path — the client hashes the normalized user question (repowise keying, §1.4), checks the curated ledger shipped inside the answer-pack/search-index bundle, and on hit renders the curated answer + citations + `curated` badge without running retrieval; on miss it runs the normal offline pipeline.
- **Where it lives:** inside the published pack — the ledger (§2 option A) is bundled next to `search-index.json` at publish time, so the client stays offline/no-key. The serving gate (citation re-resolution) runs at **pack build time** (the pack is immutable, so validate once at assembly, stamp the pack id into each served record).
- **Invariants:** the client must render provenance (curator, date, pack stamp) alongside the answer — a curated answer with hidden provenance is indistinguishable from hallucinated prose, which is exactly what the offline `answer: null` invariant exists to prevent.

**Cost: S** once (a) exists (bundle the ledger + hit-path + badge in the client view-model; the seam in `AnswerPanel` was built for this).

---

## 5. Options & recommendation (summary)

- **Store**: sidecar JSONL ledger (A), optional DB mirror (C), reject graph-node storage (B).
- **Schema** (one record): `{question, question_hash, answer, citations[], confidence, origin, curator, model?, created_at, graph_stamp, status: proposé|validé|stale|superseded, superseded_by?}` — single-JSON-payload for shape stability (repowise trick), two-lane status for the process-std-am lifecycle.
- **Serving gate** at read time (files path) / pack-assembly time (published packs): full-resolve → serve; partial → excerpts; none → suppress.
- **Sequencing**: (a) first (schema + ledger + gate on the existing #192 seam), then (c) (cheap client consumption), then (b) (needs peer contract).
- **Adopt separately, any time**: the **counterfactual savings accounting** idea (§1.5) — log what a `graphify query`/`answer` response replaced; independent of curation and cheap to prototype on the MCP serve path.

## 6. Open decisions for the principal

1. **Go/no-go on the sidecar ledger** (`.graphify/curated/answers.jsonl`) as a graphify feature at all — it adds a second knowledge artifact class next to the graph (we said "stockage = TOUTES les options / additif", this fits, but it is a product-surface decision).
2. **Who may curate**: humans only, or also an LLM curation pass whose records stay in `proposé` until human promotion (repowise is machine-first with human notes; our anti-hallucination posture argues human-promotion-only for `validé`).
3. **Invalidation policy**: repowise-style brutal (drop all curated records on every graph rebuild — cheap, safe, but destroys human curation work) vs. our proposed citation re-resolution gate (keeps records alive across rebuilds when citations still resolve). **Reco: re-resolution gate** — human curation is too expensive to drop wholesale; but this is the riskiest invariant and deserves an explicit call.
4. **process-std-am contract**: extend the WP4 G2 sidecar contract with a curated-answers lane, or a separate sidecar? (Peer negotiation either way.)
5. **Savings accounting**: adopt the counterfactual `mcp:<tool>` accounting as a separate mini-lot? (Independent, S-size, high demo value.)
