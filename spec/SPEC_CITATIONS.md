# SPEC_CITATIONS

## Status

- Product: Graphify TypeScript port
- Scope: exhaustive citation capture per entity + tiered (inline / lazy) citation storage + corpus-type-aware citation policy
- Activation: detection is always exhaustive; tiering and the lazy store are the default emit path; corpus-type tuning is automatic with an explicit override
- Default behavior: `.graphify/graph.json` carries a citation COUNT + a small inline top-K per node; the FULL citation list moves to a lazily-loaded per-entity store served through the existing `/api/ontology/entity/<id>` sidecar route
- Product decision (user, 2026-06-13): "extract ALL citations; don't bloat graph.json or the studio; describe prompt cap stays tunable, default 3 → 10, long-docs/entity-corpus → all"
- Decisions resolved (user, 2026-06-13): inline K=8 with most-distinct-source selection; citation identity excludes `bbox` for prose (includes it only for figure/image corpora); stale pre-feature graphs WARN + render legacy inline (no auto-backfill); the full list + count live in a single keyed `citations.json` (not folded into `occurrences.json`, not a per-id directory); edge citations stay out of v1. See `## Decisions` below — these are binding, not proposals.
- Constraint: `.graphify/graph.json` remains the single source of truth (description-contract work). The lazy store is a DERIVED projection of graph.json, never a competing truth.
- Delivery: PR1 is this spec; implementation follows the roadmap below.
- CLI, config and field-name surfaces in this document are PROPOSED; they freeze at the implementation PR.

This spec makes citation capture exhaustive and citation storage tiered. Today only a bounded SAMPLE of citations survives on hub entities (the mystery graph caps out around ~15 citations on Sherlock and ~12 on Watson, though those entities are cited hundreds of times across 25 works), and `occurrences.json` — the artifact that should track true citation frequency — is written as an empty array (`src/ontology-output.ts:286`). The design captures every citation, records a real frequency count, keeps `graph.json` lean by storing only a count plus a deterministic inline top-K on each node, and serves the full citation list on demand through the per-entity sidecar pattern that already exists for descriptions and occurrences (`src/studio-assets.ts:235` `buildEntitySidecar`, `/api/ontology/entity/<id>` in `src/ontology-studio.ts:490`).

## Problem

Citations on graph nodes are typed as `OntologyCitation[]` (`src/types.ts:53` on `GraphNode`, `:75` on `GraphEdge`; the `OntologyCitation` shape is `src/types.ts:473-481` — `source_file`, optional `source_url`, `page`, `section`, `paragraph_id`, `figure_id`, `bbox`). Four concrete problems block exhaustive, scalable citation handling:

1. **Capture is a sample, not a census.** There is NO `.slice()`, cap, or sampling limit on citation STORAGE anywhere in `src/` (verified: the only citation-length references are `src/node-descriptions.ts:358/527`, `src/profile-validate.ts:288`, none of which bound storage). The bound is emergent: citations land on nodes only through the profile/ontology extraction path (`src/profile-prompts.ts:150-152,178` instruct the assistant to "include … citations" and "preserve page-level citations when available"), each assistant chunk naturally emits a handful, and nothing aggregates the union across all chunks/works into one exhaustive per-entity list. A hub entity cited in 25 works keeps only the citations that happened to ride along in the chunks where it was the focus. Exhaustiveness therefore requires a change to the AGGREGATION CONTRACT, not the removal of a cap.

2. **Frequency is tracked nowhere.** `occurrences.json` is written unconditionally as `[]` (`src/ontology-output.ts:286`). The reader side already exists and is keyed by node id: `buildEntitySidecar` loads `occurrences.json`, reads `occRaw.nodes[id]`, and returns it in the sidecar (`src/studio-assets.ts:254-261`). The producer was never wired. So "cited N times" — a degree-independent salience signal — is unavailable for display, for describe grounding, and for ranking the inline top-K.

3. **The studio loads the full graph eagerly, and renders citations from it.** The SPA fetches `graph.json` verbatim (`/api/ontology/graph.json`, `src/ontology-studio.ts:246-263`, "Returned verbatim (no re-parse)"). The EntityPanel renders citations from the eagerly-loaded node: `citationsByFile(node)` reads `node.citations[]` (`studio/src/components/EntityPanel.svelte:25`, `studio/src/lib/graphAdapter.js:702-716`), grouping by `source_file` into a file→passages double accordion. Note that `scene.json` already EXCLUDES `citations` (only `evidence_refs` is in `NODE_PROFILE_FIELDS`, `src/studio-scene.ts`), but the SPA still pulls the full `graph.json`, so exhaustive per-hub citations would bloat the eager fetch and the in-memory graph regardless of `scene.json`.

4. **The describe prompt cap is a single hardcoded constant.** `MAX_CITATIONS = 3` (`src/node-descriptions.ts:376`) caps how many citation snippets are injected into the description prompt per node, deduped/truncated by `collectCitationContext` (`src/node-descriptions.ts:402-450`, `CITATION_MAXLEN = 120` at `:373`). Three is right for code symbols and wrong for long documents and entity corpora, where a description should be grounded in many distinct sources. The cap is not tunable per corpus and is not exposed to the skill or CLI.

Without an explicit tiered model, making capture exhaustive would push hundreds of citation objects per hub entity straight into `graph.json` and into every eager studio fetch.

## Goals

- Capture EVERY distinct citation per entity, plus a true frequency count.
- Keep `graph.json` lean: a count + a small deterministic inline top-K per node, never the full list for hub entities.
- Move the FULL per-entity citation list into a lazily-loaded store, reusing the existing per-entity sidecar route — do not invent a parallel fetch path.
- Keep the lazy store a DERIVED projection of `graph.json` so there is exactly one source of truth.
- Make the describe-prompt citation cap tunable: default 3 for code, 10 default, all for long-docs/entity corpora; settable by the skill per corpus type and by a CLI flag.
- Determine corpus type automatically from existing detection signals, with an explicit override.
- Keep the studio fast: never ship hundreds of citations eagerly; fetch the full list only on entity selection.
- Backward-compatible: existing bounded graphs keep working and gain exhaustive citations via re-extract or backfill, not a breaking migration.

## Non-Goals

This section is the architecture boundary. These exclusions are deliberate.

- **No second source of truth.** The lazy citation store is a DERIVED, regenerable projection of `graph.json`. It is rebuilt from `graph.json`, never edited independently, and never read back into the graph. If it disappears, a rebuild recreates it byte-for-byte from the canonical graph.
- **No new fetch mechanism in the studio.** Full citations are served through the existing `/api/ontology/entity/<id>` route and the existing client `fetchEntity(id)` + `entityCache` (`studio/src/lib/api.js:81-87`). No new endpoint, no new client cache.
- **No change to the `OntologyCitation` shape.** `src/types.ts:473-481` stays. Tiering is about WHERE citations live and HOW MANY are inline, not about a new citation type.
- **No eager bloat.** `scene.json` and the eager `graph.json` fetch carry only the count + inline top-K, never the full per-entity list.
- **No provider calls added by storage.** Tiering, counting and emitting are deterministic; they make no LLM call. Exhaustive capture reuses the existing assistant/profile extraction path; corpus-type tuning only changes the prompt cap.
- **No automatic destructive re-extraction.** Backfill of existing graphs is opt-in (`--backfill-citations`); the default for a stale graph is a warning, matching the existing staleness posture.

## Compatibility Contract

For an existing graph built before this feature:

- it loads and renders unchanged; nodes with bounded `citations[]` keep their citations inline and continue to display.
- no lazy store is required for the studio to work; absence of the store degrades to "render the inline citations only" (the current behavior).
- `graph.json` schema is additive: new optional fields (`citation_count`, `citations_top` — names PROPOSED) coexist with the existing optional `citations[]`.
- nothing reads a credential, opens a network connection, or calls a provider as a side effect of this feature.

## Tiered Storage Model

Two levels. Level-1 is inline on the node in `graph.json`; Level-2 is the full list in a lazy store.

### Level-1 — inline on the node (in `graph.json`, the source of truth)

Two new optional fields on `GraphNode` (PROPOSED names; `GraphEdge` gets the same treatment if edge citations ever go exhaustive — out of scope for v1, edges keep `citations[]` as-is):

- `citation_count: number` — the TRUE number of distinct citations for this entity across the whole corpus. This is the degree-independent "cited N times" signal. It is computed at build/aggregation time and is authoritative even when the inline list is truncated.
- `citations_top: OntologyCitation[]` — a SMALL, deterministic top-K subset (default K = 8, PROPOSED) for quick display, describe grounding, and offline/store-absent fallback. Same `OntologyCitation` shape, no new type.

The legacy `citations: OntologyCitation[]` field is retained for backward-compat reads but is deprecated as the full carrier: new builds populate `citations_top` (the bounded inline set) and `citation_count`. A migration shim treats a legacy `citations[]` with no `citations_top` as `citations_top = citations`, `citation_count = citations.length` (a conservative count — see Migration).

Rationale for keeping a count + top-K inline rather than count-only: it preserves a working studio and a working `describe` even when the lazy store is absent (fresh clone, partial artifact set, offline), and it keeps `scene.json`/eager-graph payload bounded by K regardless of how cited an entity is.

### Level-2 — the full per-entity citation list (lazy, derived)

The full, exhaustive citation list per node id lives OUTSIDE `graph.json`, in a single keyed file:

- Path: `.graphify/ontology/citations.json` (PROPOSED), schema `graphify_ontology_citations_v1`.
- Shape (keyed by node id, mirroring the `occurrences.json` `{ nodes: { <id>: … } }` convention that `buildEntitySidecar` already reads at `src/studio-assets.ts:257-261`):

```json
{
  "schema": "graphify_ontology_citations_v1",
  "graph_signature": "<topology/identity signature of graph.json at emit time>",
  "nodes": {
    "doyle_sherlock_holmes": {
      "count": 214,
      "citations": [ { "source_file": "…", "section": "…", "page": 12 }, … ]
    }
  }
}
```

Why one keyed file and NOT a directory of `.graphify/citations/<id>.json`: the studio already serves per-entity slices from single keyed JSON files loaded once and indexed in memory (`occurrences.json` via `buildEntitySidecar`; `descriptions.json` via `loadDescriptionIndex`, cached by graph.json mtime at `src/studio-assets.ts:186-212`). A keyed file reuses that exact caching path with no new disk-walk, no per-id file churn, and a single signature to validate freshness. A per-id directory is reconsidered only if the keyed file grows past the budget (see Open decisions).

### How the two levels are emitted, cached, kept consistent

- **Single producer.** Both levels are written from the SAME aggregation pass over the assembled graph at build time (the ontology-output stage that today writes the empty `occurrences.json` at `src/ontology-output.ts:286`). The pass walks every node's exhaustive citation set, computes `count`, selects the deterministic top-K (see below), writes `citation_count` + `citations_top` onto the node in `graph.json`, and writes the full list into `citations.json`. One pass, one truth, two projections.
- **Consistency by construction.** Because both come from the same pass and `citations.json` carries the `graph_signature` of the `graph.json` it was emitted against, the studio (and `hook-rebuild`) can detect a stale store the same way `scene.json` detects staleness (`src/ontology-studio.ts:277` caches scene keyed on graph.json identity = path + mtime + size). If the signature does not match the current `graph.json`, the store is treated as absent and the inline top-K is used — never silently mixed.
- **Sidecar extension, not a new route.** `buildEntitySidecar` gains a `citations` field on its response (`EntitySidecarResponse`, `src/studio-assets.ts:219-223`): it loads `citations.json` exactly like it loads `occurrences.json` today, reads `nodes[id]`, and returns `{ count, citations }`. The `/api/ontology/entity/<id>` route (`src/ontology-studio.ts:490-494`) is unchanged — it already returns whatever `buildEntitySidecar` produces.

## Exhaustive Extraction

### Capture every citation + a frequency count

The fix is an AGGREGATION CONTRACT, not a cap removal (there is no cap to remove). Concretely:

- The profile/ontology extraction path already instructs the assistant to attach citations per chunk (`src/profile-prompts.ts:150-152,178`). The new requirement: when assembling the final graph, UNION every citation seen for a given entity across all chunks and all source files, deduped by a citation identity key (PROPOSED: `source_file` + `page` + `section` + `paragraph_id`; passages differing only in `bbox` are treated as the same citation unless `paragraph_id` differs — see Open decisions on dedupe granularity).
- `count` = size of the deduped union. This is what populates `citation_count` (Level-1) and `nodes[id].count` (Level-2), and finally makes `occurrences.json`'s intended frequency signal real (the empty `[]` at `src/ontology-output.ts:286` is replaced by a populated structure, or `occurrences.json` is kept as occurrences and citation frequency lives in `citations.json` — see Open decisions on whether to fold counts into `occurrences.json` vs a dedicated `citations.json`).
- The skill emits ALL citations into the extraction output for documents/papers/entity corpora (detection always-all; see policy below). The deterministic aggregation/dedupe/top-K selection happens in TypeScript at build time, not in the prompt, so it is replayable and provider-neutral.

### Deterministic inline top-K selection

The inline `citations_top` must be deterministic and meaningful — the same graph must always yield the same K. Selection order (PROPOSED default), with deterministic tie-breaks so two builds of the same graph are byte-identical:

1. **Most-distinct-source first.** Prefer citations that cover the widest set of distinct `source_file`s — a hub entity's top-K should span many works, not 8 passages from one chapter. This maximizes the grounding value of the inline set for `describe`.
2. **Then highest confidence/specificity.** Citations with a finer locator (has `page`/`section`/`paragraph_id`) rank above bare `source_file`-only refs.
3. **Then earliest by stable sort key.** Final tie-break on `(source_file, page, section, paragraph_id)` lexicographic order — deterministic, matches the existing `uniqueSorted` posture in reconciliation (`src/ontology-reconciliation.ts:234-237`).

"Earliest in document order" was rejected as the primary key: it would fill a hub entity's top-K with passages from whichever work sorts first, defeating the point of a salience preview. Most-distinct-source gives the strongest at-a-glance grounding. K is configurable; default 8.

### Backward-compat with existing bounded graphs

Two paths, both opt-in:

- **Re-extract (preferred for correctness).** Re-running extraction on the corpus produces exhaustive citations natively. This is the honest path: only a re-extract can recover citations the original bounded build never captured.
- **Backfill (cheap, lossy on count).** `graphify backfill-citations` (PROPOSED) walks the existing `graph.json`, and for each node with legacy `citations[]` but no `citations_top`/`citation_count`, sets `citations_top = dedupe(citations)`, `citation_count = |dedupe(citations)|`, and writes a `citations.json` from the same legacy data. This cannot invent citations that were never captured, so `count` reflects only what the bounded graph holds — the command prints a clear caveat that counts are lower bounds until a re-extract. Backfill is for keeping old graphs renderable under the new schema, not for achieving exhaustiveness.

`hook-rebuild` (the LLM-free incremental path) recomputes Level-1 fields and `citations.json` from whatever citations are already on the graph — it never adds new citations (no LLM), it only re-projects, keeping the two levels consistent after edits.

## Corpus-Type-Aware Citation Policy

Three knobs, one corpus-type signal.

### The corpus-type signal

Corpus type is derived from the EXISTING detection output `.graphify/.graphify_detect.json`, which already carries `files: Record<FileType, string[]>` (buckets: `code`, `document`, `paper`, `image`, …) plus `total_words` and `total_files` (`src/detect.ts:801-804,722,776`). The skill classifies (PROPOSED thresholds):

- `code` — `files.code` dominates and `files.document`/`files.paper` are empty/negligible.
- `long-document` — `files.document`/`files.paper` present AND `total_words` above the corpus-warn threshold (long-form prose / papers; the mystery corpus lands here).
- `entity-corpus` — ontology/profile mode is active (the graph is entities-over-documents, e.g. the mystery sagas).
- `mixed` — anything else; treated as the middle default.

No new detection pass is added; this reads `.graphify_detect.json` which the skill already produces and persists (`src/skills/skill.md:165`).

### The three knobs and their defaults

| Knob | What it controls | code | mixed (default) | long-document / entity-corpus |
|---|---|---|---|---|
| Detection | how many citations the assistant captures | all | all | all |
| Inline top-K (`citations_top` size) | quick-display + describe-fallback + eager payload bound | 3 | 8 | 8 (capped for payload; count is unbounded) |
| Describe prompt cap (`MAX_CITATIONS`) | citation snippets injected per node into the description prompt | 3 | 10 | all (or a high cap, e.g. 50) |

Key points:

- **Detection is ALWAYS all.** Exhaustiveness is not corpus-dependent; only display/prompt density is. The full list always lands in `citations.json`.
- **The describe cap default rises 3 → 10.** `MAX_CITATIONS` (`src/node-descriptions.ts:376`) becomes a resolved value, not a hardcoded constant: 3 for code, 10 default, all/high for long-docs/entity corpora. `collectCitationContext` (`src/node-descriptions.ts:402-450`) reads the resolved cap instead of the constant.
- **Inline top-K stays bounded** even for long-docs/entity corpora, because it rides in the eager payload; the unbounded truth is `citation_count` + the lazy `citations.json`.

### The skill knob + CLI flag

- **Skill (default path, no key).** The skill, after detection, sets the policy per corpus type when invoking describe/label/build. This is the primary path (graphify runs assistant-first, no API key by default). The skill writes the resolved cap/top-K into the describe invocation; nothing in core implies a value.
- **CLI flag (override).** `graphify describe|label|build --citation-cap <n|all> --citations-top-k <n>` (PROPOSED). Flag overrides skill, skill overrides corpus-type default, corpus-type default overrides the global fallback (10). `--citation-cap all` is the long-doc value. A config block (`citations.describe_cap`, `citations.inline_top_k`) mirrors the flags for non-interactive runs, matching the `SPEC_STORAGE_BACKENDS`/`SPEC_LLM_EXECUTION_PORTS` precedence convention (flag > env/config > corpus default > global default).

## Studio UX

- **Count always visible.** The EntityPanel "Citations" accordion header already shows a `count` (`studio/src/components/EntityPanel.svelte:108`, `citationTotal`). It switches from "sum of inline citations" to `node.citation_count` (the true count), so a hub entity reads "Citations (214)" even before its full list loads.
- **Inline top-K renders immediately.** On selection, `citationsByFile(node)` (`graphAdapter.js:702-716`) renders the inline `citations_top` from the already-loaded graph — instant, no fetch, no spinner.
- **Full list lazy-loaded on selection.** When the panel opens for an entity, `App.svelte`'s `ensureEntity(id)` → `fetchEntity(id)` → `/api/ontology/entity/<id>` (`studio/src/lib/api.js:81-87`) already runs on focus. The sidecar response gains `citations: { count, citations }`. When it arrives, the panel replaces the inline top-K with the full file→passages double accordion. The render component (`citationsByFile`) is unchanged; only its DATA source upgrades from inline to sidecar.
- **Performance budget.** The eager payload (`graph.json` fetch + `scene.json`) carries at most `citations_top` (K, default 8) per node — bounded regardless of corpus. `scene.json` already excludes `citations` entirely. The only place hundreds of citations exist is `citations.json`, loaded once by the server and indexed in memory (same path as `occurrences.json`/`descriptions.json`, cached by graph.json mtime, `src/studio-assets.ts:186-212`), and sliced per id on each `/api/ontology/entity` request. Target: eager bundle growth from this feature ≤ K citations/node; a single entity fetch returns one node's slice (hundreds of objects worst case, kilobytes), not the corpus-wide list.

## Reconciliation Interaction

Today reconciliation unions `source_refs` into `evidence_refs` via `uniqueSorted` (a deduped union, no cap, `src/ontology-reconciliation.ts:234-237`) but does NOT touch the `citations[]` arrays of merged entities. Under this design:

- When two entities are reconciled into one canonical, their exhaustive citation sets UNION (same dedupe identity key as capture). `citation_count` of the merged entity = size of the unioned deduped set — so merging Sherlock-from-work-A with Sherlock-from-work-B correctly raises the count rather than picking one side's sample.
- The inline `citations_top` is RE-SELECTED from the union by the same deterministic most-distinct-source rule, so the merged entity's preview spans both works.
- This happens in the same single aggregation pass, AFTER reconciliation has decided merges, so the lazy `citations.json` and the inline fields are always computed on the post-merge graph. There is no separate citation-merge code path to drift.

## Migration

- **Schema additive.** `citation_count` + `citations_top` are new optional `GraphNode` fields; legacy `citations[]` stays readable. No existing graph breaks.
- **Producer flip.** The empty-array write at `src/ontology-output.ts:286` is replaced by the real aggregation pass emitting `citations.json` (and, if counts fold into occurrences, a populated `occurrences.json`).
- **Existing graphs.** Default: a graph built before this feature renders via its legacy inline `citations[]` (no behavior change). Run `graphify backfill-citations` to project legacy citations into the new fields + store (counts are lower bounds), or re-extract for true exhaustiveness. A `branch.json` stale flag / `needs_update` marker, if present, already warns per project convention before relying on results.
- **Studio fallback.** If `citations.json` is absent or its `graph_signature` is stale, the panel shows count (`citation_count`) + the inline top-K and skips the lazy upgrade — degraded but correct.

## CLI and config surface

PROPOSED; freezes at the implementation PR.

```
graphify describe [path] --citation-cap <n|all>      # describe-prompt cap (default: corpus-type resolved; 3 code / 10 default / all long-doc)
graphify label    [path] --citation-cap <n|all>
graphify build    [path] --citations-top-k <n>       # inline Level-1 K (default 8)
graphify backfill-citations [path]                   # project legacy citations[] -> citation_count/citations_top + citations.json (lossy on count)
```

```yaml
citations:
  describe_cap: 10        # n | "all" ; corpus-type default unless set
  inline_top_k: 8         # Level-1 inline set size
  store: ontology/citations.json   # Level-2 keyed store path (relative to .graphify/)
  dedupe_key: [source_file, page, section, paragraph_id]
```

Precedence: CLI flag > config > corpus-type default (from `.graphify_detect.json`) > global default (cap 10, K 8). `assistant`-mode skill runs set the corpus-type default before invoking; no key required.

## Test plan

Automated tests should cover:

- a node with N>K exhaustive citations gets `citation_count = N` and `citations_top.length = K`; the eager payload never exceeds K per node.
- `citations.json` is keyed by node id, carries the current `graph_signature`, and `buildEntitySidecar` returns `{ count, citations }` for a present id and a null/empty for an absent id.
- `citations.json` whose `graph_signature` mismatches the current `graph.json` is treated as absent: sidecar returns no full list, panel falls back to inline.
- inline top-K is deterministic: two builds of the same graph produce byte-identical `citations_top` (most-distinct-source ordering + stable tie-break).
- describe prompt cap resolves per corpus type: code → 3, default → 10, long-doc/entity → all/high; `--citation-cap` overrides; `collectCitationContext` honors the resolved cap (regression on `src/node-descriptions.ts:376/408`).
- corpus-type classification from a synthetic `.graphify_detect.json` (code-only, paper-heavy long-doc, ontology entity-corpus, mixed).
- reconciliation union: merging two entities sums distinct citations (not max of the two), and re-selects top-K from the union.
- `backfill-citations` on a legacy graph populates the new fields and store from `citations[]` and prints the lower-bound caveat; idempotent on a second run.
- `hook-rebuild` re-projects Level-1 + `citations.json` from existing citations without an LLM call and without inventing citations.
- no provider/network/secret access is triggered by any citation emit or backfill path (matches `SPEC_LLM_EXECUTION_PORTS` default-no-op posture).
- the eager `graph.json` fetch and `scene.json` for a graph with a 200-citation hub entity stay within the K-per-node payload budget.

## UAT

- Build the public-domain mystery graph (25 works); confirm Sherlock/Watson now carry `citation_count` in the hundreds (not ~15) and a K-sized `citations_top`.
- Open the studio, select Sherlock: count reads the true number immediately; inline top-K renders instantly; the full file→passages list populates on the lazy fetch without a visible graph reload.
- Confirm `graph.json` size growth is bounded (K citations/node) and the eager fetch stays fast at hub entities.
- Run `graphify describe` on the mystery corpus: descriptions ground on many distinct sources (cap = all), while a code project's descriptions still cap at 3.
- Run `backfill-citations` on a pre-feature graph: it renders under the new schema with a lower-bound count caveat; re-extract then shows the true exhaustive count.

## Decisions

Resolved by the conductor on 2026-06-13. These are BINDING for the implementation PR — the `PROPOSED` markers elsewhere in this spec resolve to the values below.

1. **Frequency count + full list live in a single dedicated `citations.json`** (schema `graphify_ontology_citations_v1`), NOT folded into `occurrences.json`. `occurrences.json` is left for non-citation occurrence data; citation count and the exhaustive list are self-contained in one store. Revisit only if occurrences gains independent meaning.

2. **Inline top-K: K = 8, most-distinct-source primary selection key** (then locator specificity, then stable lexicographic tie-break on `(source_file, page, section, paragraph_id)`). This freezes the determinism contract: two builds of the same graph produce byte-identical `citations_top`. Earliest-in-document was rejected (fills a hub's preview with whichever work sorts first).

3. **Citation identity excludes `bbox` for prose corpora** — identity = `source_file + page + section + paragraph_id`; passages differing only in `bbox` collapse to one citation. `bbox` is part of identity ONLY for figure/image-heavy corpora (so distinct figure regions on a page count separately). Keeps prose "cited N times" realistic, not bbox-inflated.

4. **Level-2 is a single keyed `citations.json`** (reuses the `occurrences.json`/`descriptions.json` in-memory-index caching path, cached by graph.json mtime). It is NOT a per-id directory. A switch to `.graphify/citations/<id>.json` is reconsidered only if the keyed file later exceeds a size budget (deferred trigger: > ~10 MB or a corpus where a single load stalls server start) — not a v1 concern.

5. **Stale pre-feature graphs WARN + render legacy inline** on open; no auto-backfill. True exhaustiveness stays an explicit `graphify backfill-citations` (lower-bound counts, clearly captioned) or a re-extract. Auto-backfill was rejected because its lower-bound counts could be mistaken for the true exhaustive count.

6. **Edge citations stay OUT of the tiered model for v1.** `GraphEdge.citations[]` (`src/types.ts:75`) is unchanged — edges are far less cited than hub entities. Folding edges in is a follow-up only if edge citation volume proves unbounded in an entity corpus.
