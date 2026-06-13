# SPEC_CITATIONS

## Status

- Product: Graphify TypeScript port
- Scope: exhaustive citation capture per entity + tiered (inline / lazy) citation storage + corpus-type-aware citation policy
- Activation: detection is always exhaustive; tiering and the lazy store are the default emit path; corpus-type tuning is automatic with an explicit override
- Default behavior: `.graphify/graph.json` carries, per node, a true `citation_count` + a small deterministic K-bounded inline `citations` set; the FULL citation list moves to a co-derived, lazily-loaded per-entity store served through the existing `/api/ontology/entity/<id>` sidecar route
- Product decision (user, 2026-06-13): "extract ALL citations; don't bloat graph.json or the studio; describe prompt cap stays tunable, default 3 → 10, long-docs/entity-corpus → all"
- Decisions resolved (user, 2026-06-13): inline K=8 with most-distinct-source selection; citation identity excludes `bbox` for prose (includes it only for figure/image corpora); stale pre-feature graphs WARN + render legacy inline (no auto-backfill); the full list lives in a single keyed `citations.json` (not folded into `occurrences.json`, not a per-id directory); edge citations stay out of v1. See `## Decisions` — binding.
- Review-driven corrections (conductor + two adversarial Opus 4.8 reviews, 2026-06-13): the source-of-truth framing is corrected (citations are a co-derived exception, NOT a graph.json projection); the producer is re-anchored from `ontology-output.ts` to the `toJson` path; graph.json leanness now has an explicit trim requirement; the inline field keeps the name `citations` (no client rename); `graph_signature`, the top-K algorithm, the union-at-merge change, and the CLI flag placement are pinned. See `## Review remediation`.
- Delivery: this PR (#150) lands the spec; implementation follows on the same branch.
- CLI and config surfaces are PROPOSED; they freeze at the implementation PR. Field names and the producer anchor below are BINDING (they were the subject of review).

This spec makes citation capture exhaustive and citation storage tiered. Today only a bounded SAMPLE of citations survives on hub entities (the mystery graph caps out around ~15 citations on Sherlock and ~12 on Watson, though those entities are cited hundreds of times across 25 works), and `occurrences.json` — the artifact that should track citation frequency — is written as an empty array (`src/ontology-output.ts:286`). The design captures every EXTRACTED citation, records a real frequency count, keeps `graph.json` lean by storing only a count plus a deterministic K-bounded inline set per node, and serves the full citation list on demand through the per-entity sidecar pattern that already exists for occurrences (`src/studio-assets.ts:235` `buildEntitySidecar`, `/api/ontology/entity/<id>` in `src/ontology-studio.ts:490`).

## Problem

Citations on graph nodes are typed as `OntologyCitation[]` (`src/types.ts:53` on `GraphNode`, `:75` on `GraphEdge`; the `OntologyCitation` shape is `src/types.ts:473-481` — `source_file`, optional `source_url`, `page`, `section`, `paragraph_id`, `figure_id`, `bbox`; note there is NO `quote`/verbatim-text field). Four concrete problems block exhaustive, scalable citation handling:

1. **Capture is a sample, not a census — and the assembly pipeline actively discards duplicates.** There is NO `.slice()`, cap, or sampling limit on citation STORAGE on the ontology path. (Survey carve-out: a `MAX_CITATIONS` constant with a `.slice(0, MAX_CITATIONS)` does exist at `src/agent-stats/report.ts:54,281`, but it caps anonymized per-agent TELEMETRY evidence snippets — an unrelated subsystem, nothing to do with `OntologyCitation` graph storage. The describe-prompt cap `MAX_CITATIONS = 3` at `src/node-descriptions.ts:376` is the only citation cap on the ontology path, and it bounds the PROMPT, not storage.) The ~15-on-Sherlock bound is **emergent from two compounding behaviors**:
   - citations land on nodes only through per-chunk profile/ontology extraction (`src/profile-prompts.ts:150-152,178` instruct the assistant to "include … citations" and "preserve page-level citations"); each chunk emits a handful for the entities it extracts AS NODES, and an entity merely mentioned in a chunk where it is not extracted contributes no citation; and
   - when chunks are assembled, duplicate-entity citations are **thrown away**, not unioned: `src/build.ts:286` uses graphology `mergeNode(id, attrs)` (shallow last-write-wins — a later chunk's `citations` array REPLACES the earlier), and the ast+semantic assembly paths skip duplicates outright (`src/cli.ts:330-333`, `src/skill-runtime.ts:419-428`: `if (seen.has(node.id)) continue;`). So a hub entity keeps only ONE chunk's worth of citations, not the union across all chunks/works.

   Exhaustiveness therefore requires a change to the **assembly/aggregation contract** (union citations across chunks at merge time), not the removal of a cap. It is bounded by what extraction emits per chunk — see Non-Goals for the honest ceiling.

2. **Frequency is tracked nowhere.** `occurrences.json` is written unconditionally as `[]` (`src/ontology-output.ts:286`). The reader side already exists, keyed by node id: `buildEntitySidecar` loads `occurrences.json`, reads `occRaw.nodes[id]`, and returns it in the sidecar (`src/studio-assets.ts:254-261`). The producer was never wired. So "cited N times" — a degree-independent salience signal — is unavailable for display, describe grounding, or ranking the inline set.

3. **The studio loads the full graph eagerly and renders citations from it.** The SPA fetches `graph.json` verbatim (`/api/ontology/graph.json`, `src/ontology-studio.ts:246-263`, "Returned verbatim (no re-parse)"). `graph.json` is produced by `toJson` (`src/export.ts:449`), which spreads `...attrs` (`:469`) — i.e. it serializes EVERY node attribute verbatim, including the full `citations[]`. The EntityPanel renders citations from the eagerly-loaded node: `citationsByFile(node)` reads `node.citations[]` (`studio/src/components/EntityPanel.svelte:25`, `studio/src/lib/graphAdapter.js:702-716`), grouping by `source_file`. `scene.json` already EXCLUDES `citations` (`NODE_PROFILE_FIELDS`, `src/studio-scene.ts:164`), but the SPA still pulls the full `graph.json`, so exhaustive per-hub citations would bloat the eager fetch and the in-memory graph regardless of `scene.json`. **Critically: because `toJson` spreads `...attrs`, simply ADDING an exhaustive `citations[]` makes graph.json bigger; leanness requires actively TRIMMING the inline set (see Tiered model).**

4. **The describe prompt cap is a single hardcoded constant.** `MAX_CITATIONS = 3` (`src/node-descriptions.ts:376`) caps how many citation snippets are injected into the description prompt per node, deduped/truncated by `collectCitationContext` (`src/node-descriptions.ts:402-450`, `CITATION_MAXLEN = 120` at `:373`). This feeds both the API path and the no-key assistant path (`collectCitationContext` → `NodeContext.citations` → `emitDescriptionInstructions`, `node-descriptions.ts:477,997`). Three is right for code symbols and wrong for long documents and entity corpora. The cap is not tunable per corpus and not exposed to the skill or CLI.

## Goals

- Capture EVERY distinct EXTRACTED citation per entity (union across chunks/works), plus a true frequency count.
- Keep `graph.json` lean: a `citation_count` + a small deterministic K-bounded inline `citations` set per node, never the full list for hub entities — enforced by an explicit trim before `toJson`.
- Move the FULL per-entity citation list into a lazily-loaded store, reusing the existing per-entity sidecar route — no new fetch path.
- Make the describe-prompt citation cap tunable: 3 for code, 10 default, all for long-docs/entity corpora; settable by the skill per corpus type and by a CLI flag; on the no-key path.
- Determine corpus type automatically from existing detection signals, with an explicit override.
- Keep the studio fast: never ship hundreds of citations eagerly; fetch the full list only on entity selection.
- Backward-compatible: existing bounded graphs keep working and gain exhaustive citations via re-extract (or a lossy backfill), not a breaking migration.

## Non-Goals

This section is the architecture boundary. These exclusions are deliberate.

- **Exhaustive ≠ every textual mention.** v1 captures every citation that EXTRACTION emits, unioned across all chunks/works. It does NOT add a new extraction-prompt pass to emit a citation for every place an entity is mentioned-but-not-extracted-as-a-node. True mention-level exhaustiveness is an extraction-prompt change, out of scope; v1 already yields a large multiple of today's collapsed single-chunk sample (the duplicate-discard in Problem #1 is what bounds it today).
- **No verbatim-quote capture.** `OntologyCitation` (`src/types.ts:473-481`) carries locators only (`source_file`/`page`/`section`/`paragraph_id`/`figure_id`/`bbox`), no `quote`. The studio's file→passages accordion renders locators, not verbatim passage text (it already passes `quote: null` today). Adding a quote field is out of scope.
- **citations.json is a CO-DERIVED artifact, not edited independently.** It is produced in the same build pass as graph.json from the extraction output; it is never hand-edited and never read back into the graph. It is rebuildable LLM-free from the extraction output (NOT from graph.json's K-bounded projection — see the source-of-truth note in the tiered model). If it disappears and the extraction output is present, a rebuild recreates it deterministically; otherwise a re-extract is required.
- **No new fetch mechanism in the studio.** Full citations are served through the existing `/api/ontology/entity/<id>` route and the existing client `fetchEntity(id)` + `entityCache` (`studio/src/lib/api.js:81-87`). No new endpoint, no new client cache.
- **No change to the `OntologyCitation` shape.** `src/types.ts:473-481` stays. Tiering is about WHERE citations live and HOW MANY are inline.
- **No eager bloat.** `scene.json` and the eager `graph.json` fetch carry only `citation_count` + the K-bounded inline `citations`, never the full per-entity list.
- **No provider calls added by storage.** Tiering, counting and emitting are deterministic; no LLM call. Exhaustive capture reuses the existing assistant/profile extraction path; corpus-type tuning only changes the prompt cap.
- **No automatic destructive re-extraction.** Backfill of existing graphs is opt-in (`graphify backfill-citations`); the default for a stale graph is a warning, matching the existing staleness posture.

## Source of truth (corrected framing)

graphify already treats `graph.json` as canonical for topology + `node.description` (the description-contract work). Citations are a **deliberate, necessary exception**, forced by the user's own two constraints — "extract ALL citations" AND "don't bloat graph.json": the exhaustive set cannot be both lean-on-graph.json and full-on-graph.json. So:

- The **upstream source** of citations is the EXTRACTION output (the per-chunk extraction JSON graphify already persists).
- The build aggregation pass produces, in ONE pass over the assembled graph, **two co-derived projections**: graph.json (`citation_count` + K-bounded inline `citations`) and `citations.json` (the full per-entity set). Neither derives from the other; both derive from extraction.
- `citations.json` is the durable carrier of the exhaustive tail beyond K. It is rebuildable from the extraction output (LLM-free), not from graph.json's K-bounded inline set. graph.json remains canonical for topology + descriptions and delegates the citation tail to this co-derived sidecar.

This corrects the earlier draft's "citations.json is a projection of graph.json" framing, which was false (you cannot reconstruct a 214-citation tail from an 8-element inline set).

## Tiered Storage Model

Two levels. Level-1 is inline on the node in `graph.json`; Level-2 is the full list in a co-derived lazy store.

### Level-1 — inline on the node (in `graph.json`)

- `citation_count: number` (NEW) — the TRUE number of distinct citations for this entity across the whole corpus (size of the deduped union). The degree-independent "cited N times" signal. Authoritative even when the inline set is truncated.
- `citations: OntologyCitation[]` (EXISTING field, semantics tightened) — now the K-bounded deterministic top-K subset (default K = 8), NOT an arbitrary sample and NOT the full list. **The field keeps its name** so the studio's `citationsByFile`/inline render keep working with zero rename; the producer MUST trim it to the top-K before `toJson` writes graph.json.

Keeping the name `citations` (rather than introducing `citations_top`) was a review decision: `studio/src/lib/graphAdapter.js:702-716` and `EntityPanel.svelte` read `node.citations`; a rename would silently zero the inline render until every client read is rewired. With the name retained, the only client change for Level-1 is the count header (below).

Rationale for count + bounded-inline (not count-only): it preserves a working studio and a working `describe` even when the lazy store is absent (fresh clone, partial artifacts, offline), and bounds the eager payload by K regardless of how cited an entity is.

`GraphEdge.citations` (`src/types.ts:75`) is unchanged in v1 (edges are far less cited; out of scope per Decision 6).

### Level-2 — the full per-entity citation list (lazy, co-derived)

- Path: `.graphify/ontology/citations.json`, schema `graphify_ontology_citations_v1`.
- Keyed by node id, mirroring the `occurrences.json` `{ nodes: { <id>: … } }` convention that `buildEntitySidecar` already reads (`src/studio-assets.ts:257-261`):

```json
{
  "schema": "graphify_ontology_citations_v1",
  "graph_signature": "<citation-content hash of graph.json at emit time>",
  "nodes": {
    "doyle_sherlock_holmes": {
      "count": 214,
      "citations": [ { "source_file": "…", "section": "…", "page": 12 }, … ]
    }
  }
}
```

One keyed file, NOT a per-id directory (Decision 4): it reuses a single mtime-keyed in-memory index (the `loadGraphNodeDescriptions` caching pattern, `src/studio-assets.ts:186-212`) — one load, indexed in memory, per-id slice on request. A per-id directory is reconsidered only past a size budget (deferred trigger: > ~10 MB).

### How the two levels are emitted, cached, kept consistent

- **Single producer, correctly anchored.** Both levels are written from ONE aggregation pass over the assembled graphology graph, in the path that already owns per-node `citations[]` and writes graph.json — i.e. just BEFORE `toJson` (`src/export.ts:449`, reached from `cli.ts` extract/update/describe/label, `watch.ts:399`, `pipeline.ts:244`, `skill-runtime.ts:1181`). The pass: walks each node's unioned citation set, computes `count`, selects the deterministic top-K, **replaces `node.citations` with the top-K**, sets `node.citation_count`, and writes the full per-entity set into `citations.json`. (NOTE: this is NOT `compileOntologyOutputs` in `src/ontology-output.ts` — that stage operates on `CompiledNode`, which has no `citations` field and does not write graph.json; the empty `occurrences.json` write at `:286` merely proves the sidecar READER exists. The producer lives on the `toJson` path.)
- **graph_signature = a citation-content hash.** `graph_signature` is a sha256 over the sorted projection `{ node_id → its inline citations }` of graph.json at emit time. It is explicitly NOT `computeTopologySignature` (`src/export.ts:422-447`, which hashes only ids + edges and is blind to node attributes — using it would miss citation changes and repeat the byte-identical-graph drop bug fixed in `d96ec5f`), and NOT graph.json mtime+size (a deterministic content-identical rebuild changes mtime and would falsely invalidate). Contract: byte-identical citation content ⇒ identical signature; any citation change ⇒ different signature.
- **Consistency by construction.** Both projections come from the same pass; `citations.json` carries the `graph_signature` of the graph.json it was emitted against. On read, if the signature does not match the current graph.json's citation-content hash, the store is treated as ABSENT and the inline K-set is used — never silently mixed.
- **Sidecar extension, not a new route.** `buildEntitySidecar` gains a `citations` field on its response (`EntitySidecarResponse`, `src/studio-assets.ts:219-223`): it loads `citations.json` through an mtime-keyed in-memory index (the `loadGraphNodeDescriptions` pattern, NOT the uncached `loadJsonSafe`-per-request that `occurrences.json` uses today at `:254`), reads `nodes[id]`, returns `{ count, citations }`. The `/api/ontology/entity/<id>` route (`src/ontology-studio.ts:490-494`) is unchanged.

## Exhaustive Extraction

### Capture every extracted citation + a frequency count

The fix is in the assembly/aggregation contract (Problem #1), not a cap removal:

- **Union at merge, not discard.** The chunk-assembly merge must UNION each entity's `citations[]` across all chunks instead of last-write-wins / skip-duplicate. Concretely the three sites that collapse duplicates today must union citations keyed by node id: `src/build.ts:286` (`mergeNode` — union the `citations` attr rather than replace), `src/cli.ts:330-333` and `src/skill-runtime.ts:419-428` (`if (seen.has(id)) continue` — before skipping, fold the duplicate's `citations` into the kept node). Dedup the union by the citation identity key (PROPOSED: `source_file` + `page` + `section` + `paragraph_id`; `bbox` excluded for prose, included only for figure/image corpora — Decision 3).
- **`count`** = size of the deduped union → populates `citation_count` (Level-1) and `nodes[id].count` (Level-2). This finally makes the frequency signal real (the empty `[]` at `src/ontology-output.ts:286` stays for non-citation occurrence data; citation counts live in `citations.json` — Decision 1).
- The skill emits ALL citations into the extraction output for documents/papers/entity corpora (detection always-all; see policy). The deterministic union/dedupe/top-K happens in TypeScript at assembly time, provider-neutral and replayable.

### Deterministic inline top-K selection (algorithm pinned)

The inline `citations` (top-K) must be a pure, deterministic function of the citation SET — two builds of the same graph must be byte-identical. Algorithm:

1. **Normalize input order.** Sort the full deduped citation list lexicographically by `(source_file, page, section, paragraph_id)` (stable, total — matches the `uniqueSorted` posture at `src/ontology-reconciliation.ts:234-237`). This removes any dependence on extraction/iteration order.
2. **Greedy most-distinct-source cover.** Walk the sorted list; greedily pick the next citation whose `source_file` is not yet represented in the selection, until K are chosen or every source is covered. Every greedy tie is broken by the lexicographic key from step 1.
3. **Fill remainder by locator specificity, then lexicographic.** If sources are exhausted before K, fill remaining slots from the sorted list preferring finer locators (has `page`/`section`/`paragraph_id` over bare `source_file`), final tie-break lexicographic.

"Earliest in document order" was rejected as the primary key (it fills a hub's preview with whichever work sorts first). Most-distinct-source maximizes grounding value for `describe`. K is configurable; default 8.

### Backward-compat with existing bounded graphs

Two opt-in paths:

- **Re-extract (correct).** Re-running extraction on the corpus produces exhaustive citations natively (union across chunks). Only a re-extract recovers citations the original duplicate-discard dropped. **For curated graphs this must be paired with description preservation — see Migration.**
- **Backfill (cheap, lossy on count).** `graphify backfill-citations` walks the existing `graph.json`, and for each node with a legacy `citations[]` but no `citation_count`, sets `citations` = top-K(dedupe(citations)), `citation_count` = |dedupe(citations)|, and writes `citations.json` from the same legacy data. It cannot invent citations the bounded graph never held, so `count` is a LOWER BOUND — the command prints that caveat. Idempotent on a second run (dedupe key is stable). Backfill keeps old graphs renderable under the new schema; it does NOT achieve exhaustiveness, and **cannot meet the "hundreds on Sherlock" UAT target** (that needs a re-extract).

`hook-rebuild` (LLM-free) re-projects Level-1 (`citation_count` + trimmed inline `citations`) and re-derives `citations.json` from the extraction output if present; it never adds new citations and never calls a provider. If only graph.json's K-set is available (no extraction output), it can only validate/refresh consistency, not regenerate the full tail.

## Corpus-Type-Aware Citation Policy

Three knobs, one corpus-type signal.

### The corpus-type signal

Corpus type is derived from the EXISTING detection output `.graphify/.graphify_detect.json`, which carries `files: Record<FileType, string[]>` (buckets include `code`, `document`, `paper`, `image`, `video` — `src/detect.ts:722-724`), `total_words` (`:804`), `total_files` (`:803`). The skill classifies (PROPOSED thresholds):

- `code` — `files.code` dominates and `files.document`/`files.paper` are empty/negligible.
- `long-document` — `files.document`/`files.paper` present AND `total_words` above the corpus-warn threshold (long-form prose / papers; the mystery corpus lands here).
- `entity-corpus` — ontology/profile mode is active (entities-over-documents).
- `mixed` — anything else; the middle default.

No new detection pass is added; this reads `.graphify_detect.json` which the skill already produces and persists (`src/skills/skill.md`). A `corpus_type` field is additive (none exists today).

### The three knobs and their defaults

| Knob | What it controls | code | mixed (default) | long-document / entity-corpus |
|---|---|---|---|---|
| Detection | how many citations the assistant captures | all | all | all |
| Inline K (`citations` size) | quick-display + describe-fallback + eager payload bound | 3 | 8 | 8 (capped for payload; `citation_count` is unbounded) |
| Describe prompt cap (`MAX_CITATIONS`) | citation snippets injected per node into the description prompt | 3 | 10 | all (or a high cap, e.g. 50) |

Key points:

- **Detection is ALWAYS all.** Exhaustiveness is not corpus-dependent; only display/prompt density is. The full list always lands in `citations.json`.
- **The describe cap default rises 3 → 10.** `MAX_CITATIONS` (`src/node-descriptions.ts:376`) becomes a RESOLVED value threaded as a plain parameter on `GenerateNodeDescriptionsOptions` (`:736`, no `citationCap` field today) → `collectCitationContext` (`:402-450`) reads the resolved cap. Because it is a plain parameter, it flows on the NO-KEY assistant path (`collectCitationContext` → `NodeContext.citations` → `emitDescriptionInstructions`) with no provider — verified the cap governs exactly what the no-key assistant sees.
- **Inline K stays bounded** even for long-docs/entity corpora (it rides the eager payload); the unbounded truth is `citation_count` + the lazy `citations.json`.

### The skill knob + CLI flag

- **Skill (default path, no key).** After detection the skill sets the policy per corpus type when invoking describe/label/extract. Primary path (assistant-first, no API key). The skill writes the resolved cap/K into the invocation; core implies nothing.
- **CLI flag (override).** Placement corrected after review:
  - `--citation-cap <n|all>` on the commands that build the description prompt: `graphify describe|label|update` (these call `toJson`/the describe engine). `describe`/`label` have no such flag today (`cli.ts:3853-3858`), so it is added.
  - `--citations-top-k <n>` on the commands that WRITE graph.json node citations via `toJson`: `graphify extract|update|watch` — NOT the top-level `graphify build` (`cli.ts:2750`), which is a non-LLM profile chain (`validate → dataprep → ontology-output`) that never runs `toJson` and cannot apply the flag.
  - Precedence (v1): CLI flag > corpus-type default (from `.graphify_detect.json`) > global default (cap 10, K 8). `assistant`-mode skill runs set the corpus-type default before invoking; no key required. (The `citations:` YAML config block is NOT loaded by the code-mode CLI in v1 — flag + corpus-type only; config wiring deferred. The resolver keeps an inert `config` slot for a future tier.)

## Studio UX

- **Count always visible (one client edit).** The EntityPanel "Citations" header count is `citationTotal`, today derived by SUMMING the inline citations (`EntityPanel.svelte:25-26,108`). It switches to read `node.citation_count`, so a hub reads "Citations (214)" immediately, before the full list loads. This is the one required Level-1 client change.
- **Inline top-K renders immediately (no change).** On selection, `citationsByFile(node)` (`graphAdapter.js:702-716`) renders `node.citations` (now the K-set) from the already-loaded graph — instant, no fetch. No rename needed (field kept as `citations`).
- **Full list lazy-loaded on selection (additive wiring).** `App.svelte`'s focus path already runs `ensureEntity(id)` → `fetchEntity(id)` → `/api/ontology/entity/<id>` (`api.js:81-87`); the sidecar response gains `citations: { count, citations }`. New, additive client wiring consumes it: when it arrives, the panel replaces the inline K-set with the full file→passages accordion (the render component `citationsByFile` is reused; its DATA upgrades from the inline node to the sidecar payload). Passages render locators (section/page), not verbatim quotes (no `quote` in the schema).
- **Performance budget.** The eager payload (`graph.json` fetch + `scene.json`) carries at most `citation_count` + K inline citations per node — bounded regardless of corpus, BECAUSE the producer trims `node.citations` to K before `toJson` (without that trim, `...attrs` would pass the full set through and bloat graph.json — the load-bearing requirement). `scene.json` already excludes `citations`. The only place hundreds of citations exist is `citations.json`, loaded once via the mtime-keyed index and sliced per id. Target: eager bundle growth ≤ K citations/node; a single entity fetch returns one node's slice (kilobytes), not the corpus-wide list.

## Reconciliation Interaction

Today reconciliation PROPOSES merges; it does not apply them or touch `citations`. `generateOntologyReconciliationCandidates` (`src/ontology-reconciliation.ts:214-265`) emits a candidate queue (`status: "candidate"`, human/workbench-gated); its `uniqueSorted` union (`:234-237`) is over `source_refs` → `evidence_refs` for the candidate record, not node `citations`. Under this design:

- v1's citation union happens at the chunk-assembly merge (Exhaustive Extraction) — i.e. same-id citations across chunks/works are unioned there, which already covers the common hub case (Sherlock across 25 works that resolve to one id).
- When an accepted reconciliation merge is APPLIED (the merge-apply path, e.g. `src/merge-driver.ts:124` `mergeNode`, which is also last-write-wins today), the citation union must follow the SAME union-not-replace change as the assembly merge, so an accepted merge of Sherlock-A + Sherlock-B sums distinct citations and re-selects top-K from the union. There is no separate citation-merge code; it rides the merge-apply path.
- This spec does NOT claim "no path to drift": if merge-apply is human-gated/asynchronous, the union is correct whenever that path runs; citation-union-on-accept is in scope only insofar as the merge-apply path exists. Building a new merge-apply path is out of v1 scope.

## Migration

- **Schema additive.** `citation_count` is a new optional `GraphNode` field; `citations` keeps its name and shape (semantics tighten to top-K on new builds). No existing graph breaks; old `citations[]` (bounded sample) renders unchanged.
- **Producer change.** The chunk-assembly merge unions citations (was discard); a pre-`toJson` aggregation pass trims `node.citations` to K, sets `citation_count`, and emits `citations.json`. The empty-array write at `src/ontology-output.ts:286` stays for non-citation occurrence data.
- **Exports unaffected.** `src/export.ts`/`src/wiki.ts` html/wiki/obsidian exporters do NOT read `citations` (grep-verified: zero citation references) — so trimming the inline set has no human-facing export impact. The only citation-bearing artifact is graph.json itself (governed by the trim) and `citations.json`.
- **Existing graphs.** Default: a pre-feature graph renders via its legacy inline `citations[]` (no behavior change) + a staleness WARNING (Decision 5). `graphify backfill-citations` projects legacy citations into the new fields + store (lower-bound counts), or re-extract for true exhaustiveness.
- **Curated mystery graph (live, operational tension — flagged for a rollout decision).** The curated graph at `~/src/public-domaine-mystery-sagas-pack` was just refilled with descriptions WITHOUT a re-extract. The UAT target ("hundreds of citations on Sherlock") is achievable ONLY by a re-extract — which regenerates node sets and would overwrite the curated descriptions — NOT by backfill (which yields lower-bound counts, ~15). The two rollout options:
  - **(a) backfill** — preserve the curated descriptions, accept lower-bound counts (UAT "hundreds" UNMET on this graph until a future re-extract);
  - **(b) re-extract + re-describe** — true exhaustive counts, paired with a description-preservation step (re-extract, then re-run the no-key `describe --fill-missing` refill, or snapshot descriptions and re-stamp).
  This is a product/ops call for the conductor at rollout time; it does NOT block this feature's implementation. The UAT target is conditional on which path is run.
- **Studio fallback.** If `citations.json` is absent or its `graph_signature` mismatches, the panel shows `citation_count` + the inline K-set and skips the lazy upgrade — degraded but correct.

## CLI and config surface

PROPOSED; freezes at the implementation PR.

```
graphify describe [path] --citation-cap <n|all>   # describe-prompt cap (default: corpus-resolved; 3 code / 10 default / all long-doc)
graphify label    [path] --citation-cap <n|all>
graphify update   [path] --citation-cap <n|all> --citations-top-k <n>
graphify extract  [path] --citations-top-k <n>    # inline Level-1 K (default 8); writes graph.json via toJson
graphify watch           --citations-top-k <n>
graphify backfill-citations [path]                # project legacy citations[] -> citation_count + K-set + citations.json (lossy on count)
```

`--citations-top-k` is NOT added to the top-level `graphify build` (non-LLM profile chain; does not write graph.json node citations).

```yaml
# (v1: NOT loaded by the code-mode CLI — flag + corpus-type only; config wiring
#  deferred. The code-mode loader is ontology-profile-only and
#  `resolveCitationPolicyForRoot` never passes `config`, so these keys are inert
#  today. The `config` slot is retained in `resolveCitationPolicy` for a future
#  PR, but the surface advertised below is the real 3-tier v1 precedence.)
citations:
  describe_cap: 10        # n | "all" ; corpus-type default unless set
  inline_top_k: 8         # Level-1 inline K
  store: ontology/citations.json   # Level-2 keyed store (relative to .graphify/)
  dedupe_key: [source_file, page, section, paragraph_id]   # bbox added only for figure/image corpora
```

Precedence (v1): CLI flag > corpus-type default (from `.graphify_detect.json`) > global default (cap 10, K 8). `assistant`-mode skill runs set the corpus-type default before invoking; no key required. (The `citations:` YAML block above is NOT wired in v1 — config wiring is deferred; the `resolveCitationPolicy` `config` slot stays for future use but does not participate in the advertised v1 precedence.)

## Test plan

Automated tests should cover:

- **Union at merge:** a node appearing in N chunks each with distinct citations ends with the deduped UNION (not one chunk's set); covers `build.ts:286` mergeNode and the `cli.ts:330`/`skill-runtime.ts:419` skip-duplicate paths (regression on the discard).
- **Trim + count:** a node with M>K unioned citations gets `citation_count = M` and inline `citations.length = K`; graph.json (post-`toJson`) carries only K per node — assert byte-size of a 200-citation-hub graph stays within the K·node budget.
- **citations.json:** keyed by node id, carries the current citation-content `graph_signature`; `buildEntitySidecar` returns `{ count, citations }` for a present id, null/empty for absent; signature mismatch ⇒ treated as absent, panel falls back to inline.
- **Deterministic top-K:** two builds of the same graph produce byte-identical inline `citations` (sorted-input + greedy most-distinct-source + stable tie-break); a content-identical rebuild yields an identical `graph_signature` (NO false-stale), and any citation change yields a different signature (NO silent stale-serve) — the `d96ec5f` bug class.
- **Describe cap resolution:** code → 3, default → 10, long-doc/entity → all/high; `--citation-cap` overrides; `collectCitationContext` honors the resolved cap on BOTH the API and the no-key assistant path (regression on `node-descriptions.ts:376/408/477`).
- **Corpus-type classification** from a synthetic `.graphify_detect.json` (code-only, paper-heavy long-doc, ontology entity-corpus, mixed).
- **Reconciliation union:** an applied merge of two entities sums distinct citations (not max/last-write) and re-selects top-K from the union.
- **backfill-citations** populates the new fields + store from legacy `citations[]`, prints the lower-bound caveat, idempotent on re-run.
- **hook-rebuild** re-projects Level-1 + `citations.json` LLM-free (from extraction output) without inventing citations.
- **No provider/network/secret** access on any citation emit/backfill path.
- **citations.json caching:** loaded via an mtime-keyed in-memory index (not re-read per `/api/ontology/entity` request).

## UAT

- Re-extract the public-domain mystery graph (25 works); confirm Sherlock/Watson carry `citation_count` in the hundreds (not ~15) and a K-sized inline `citations`. (Backfill alone CANNOT meet this — see Migration.)
- Open the studio, select Sherlock: count reads the true number immediately; inline top-K renders instantly; the full file→passages list populates on the lazy fetch without a visible graph reload.
- Confirm `graph.json` size growth is bounded (K citations/node) and the eager fetch stays fast at hub entities.
- Run `graphify describe` on the mystery corpus: descriptions ground on many distinct sources (cap = all), while a code project's descriptions still cap at 3.
- Run `backfill-citations` on a pre-feature graph: renders under the new schema with the lower-bound caveat; re-extract then shows true exhaustive counts.

## Decisions

Resolved by the conductor on 2026-06-13. BINDING for the implementation PR.

1. **Frequency count + full list live in a dedicated `citations.json`** (`graphify_ontology_citations_v1`), NOT folded into `occurrences.json` (left for non-citation occurrence data).
2. **Inline top-K: K = 8, most-distinct-source** (pinned greedy algorithm above; stable lexicographic tie-break). Field KEEPS the name `citations` (no `citations_top` rename — review decision, avoids a studio render regression).
3. **Citation identity excludes `bbox` for prose** (`source_file + page + section + paragraph_id`); `bbox` is part of identity ONLY for figure/image-heavy corpora.
4. **Level-2 is a single keyed `citations.json`** (reuses the mtime-keyed in-memory index), NOT a per-id directory; revisit past a ~10 MB budget.
5. **Stale pre-feature graphs WARN + render legacy inline** on open; no auto-backfill. True exhaustiveness stays an explicit `backfill-citations` (lower-bound) or re-extract.
6. **Edge citations stay OUT of v1.** `GraphEdge.citations[]` unchanged.

## Review remediation

Two independent adversarial Opus 4.8 reviews (2026-06-13) returned BLOCK; all findings are folded into this revision:

- **Source-of-truth framing (A#1, BLOCK):** corrected — citations.json is a co-derived, durable carrier of the exhaustive tail, not a projection of graph.json. See `## Source of truth`.
- **Union vs merge-discard (A#2, BLOCK):** disclosed — `mergeNode` last-write-wins (`build.ts:286`) and `if(seen) continue` (`cli.ts:330`, `skill-runtime.ts:419`) discard duplicate citations; the union must change those sites. Exhaustive ceiling (extraction-emit-bounded) stated in Non-Goals.
- **Producer mis-anchor (B#A, BLOCK):** re-anchored from `ontology-output.ts:286` (CompiledNode, no citations, no graph.json write) to the pre-`toJson` aggregation pass.
- **graph.json leanness (B#B, BLOCK):** explicit trim requirement added — `toJson` spreads `...attrs`, so the node's inline `citations` MUST be replaced by the K-set before write; keeping both arrays would bloat worse.
- **Studio render contract (B#C, MUST-FIX):** field kept as `citations` (no rename); only `citationTotal`→`citation_count` and the additive lazy-consume wiring change.
- **graph_signature (A#3, MUST-FIX):** defined as a citation-content hash, not topology-signature, not mtime+size.
- **Top-K determinism (A#5, MUST-FIX):** exact greedy algorithm + input sort pinned.
- **Reconciliation (A#4, MUST-FIX):** stated as candidate-proposal today; union rides the merge-apply path; no "no drift" claim.
- **CLI flag placement (B#D, MUST-FIX):** `--citations-top-k` moved off `build` to extract/update/watch; `--citation-cap` on describe/label/update.
- **citations.json caching (B#F, MUST-FIX):** mtime-keyed index, not uncached per-request.
- **Survey carve-out (A#6), quote/locators (A#7), export non-impact (B#E):** folded into Problem/Non-Goals/Migration.
- **Curated mystery migration (B#G, needs product call):** flagged as a rollout decision in Migration (backfill vs re-extract+re-describe); does not block implementation.
