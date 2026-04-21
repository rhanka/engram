# LLM Wiki Benchmark Follow-up Plan

> For agentic workers: this branch is docs/spec only. Do not implement product
> changes from this plan. Convert selected lots into separate specs or a new
> implementation branch before touching runtime code.

Goal: use `spec/SPEC_LLM_WIKI_BENCHMARK_2026_04.md` to decide which LLM
wiki/repo-wiki/codebase-map ideas are worth specifying for Graphify.

Architecture: docs-only planning around Graphify's existing `.graphify/` graph,
wiki output, summary, review-delta, review-analysis, and MCP-facing workflows.

Tech stack: Markdown specs, Graphify CLI concepts, public primary-source
benchmark evidence.

## Status

- [x] Create a primary-source April 2026 benchmark for LLM wiki, repo-to-wiki,
  codebase wiki, knowledge-graph docs, and semantic codebase-map projects.
- [x] Retain only candidates with verified April 2026 commit, release, tag, or
  package publish evidence.
- [x] Record exclusions for notable projects that did not meet the April 2026
  activity rule.
- [x] Identify Graphify-relevant feature lots without implementing product code.
- [ ] Review the benchmark manually before turning any recommendation into a
  product roadmap item.

## Guardrails

- [ ] Keep this branch docs-only unless a new instruction explicitly authorizes
  implementation.
- [ ] Re-check all stars, forks, releases, package versions, and downloads before
  publishing or citing the benchmark outside this branch.
- [ ] Preserve Graphify's deterministic graph provenance; do not replace it with
  weaker generated-wiki or embedding-only semantics.
- [ ] Distinguish observed code evidence, documented features, and inferred
  relevance in all follow-up specs.
- [ ] Use `non publié` when a primary source does not publish a metric.
- [ ] Avoid proprietary/customer examples in follow-up specs.

## Follow-up Lots

### Lot 1 - Benchmark Acceptance

- [ ] Re-read `spec/SPEC_LLM_WIKI_BENCHMARK_2026_04.md` for factual consistency.
- [ ] Spot-check at least the retained top five projects against current primary
  sources if the benchmark is used after 2026-04-21.
- [ ] Decide whether the retained set is sufficient or whether another dated
  refresh is needed.
- [ ] Mark any disputed feature as `documented` or `inferred` instead of
  `observed in code`.

### Lot 2 - Graphify Wiki v2 Contract Spec

- [ ] Draft a spec for stable wiki article IDs, article manifests, source
  citations, stale metadata, related-reading paths, and graph-derived article
  taxonomy.
- [ ] Compare the draft against Codesight, RepoWiki, Litho, and
  karpathy-llm-wiki patterns from the benchmark.
- [ ] Define acceptance criteria for terminal-readable Markdown and
  machine-readable JSON sidecars.

### Lot 3 - Agent and MCP Wiki Tools Spec

- [ ] Draft contracts for wiki index, wiki read, wiki search, graph path explain,
  and wiki lint tools.
- [ ] Include token-bounded response behavior inspired by Repomix and SwarmVault.
- [ ] Specify how tools report graph staleness and source provenance.

### Lot 4 - Token-aware Context Packs Spec

- [ ] Specify token counting for wiki articles, communities, graph paths, and
  changed-file impact reports.
- [ ] Define `--max-tokens` packing behavior for summary, review-delta, and wiki
  retrieval.
- [ ] Specify security and ignore filtering before context pack creation.

### Lot 5 - Reviewable Wiki Rebuild Spec

- [ ] Specify approval bundles for regenerated wiki pages.
- [ ] Specify manual-edit protection and generated-section boundaries.
- [ ] Specify accept/reject/retry flows for individual article changes.
- [ ] Specify how rejection notes influence subsequent regeneration.

### Lot 6 - Provenance and Lifecycle Spec

- [ ] Define metadata labels for observed, documented, and inferred statements.
- [ ] Define lifecycle states for generated, reviewed, edited, stale, and retired
  wiki pages.
- [ ] Define stale propagation from graph build metadata to wiki articles.
- [ ] Define confidence or review status fields without overclaiming automated
  truth verification.

### Lot 7 - Diagram Validation Spec

- [ ] Specify Mermaid generation constrained by deterministic graph facts.
- [ ] Specify Mermaid syntax validation, repair attempts, and failure reporting.
- [ ] Specify click-to-source metadata for diagram nodes.
- [ ] Decide whether diagram output belongs in wiki v2 or an optional export lot.

### Lot 8 - Optional Semantic Search Adapter Spec

- [ ] Keep this lot deferred until wiki/MCP/token contracts are clearer.
- [ ] Specify an optional adapter that maps semantic search hits back to Graphify
  node IDs, source paths, and wiki article IDs.
- [ ] Preserve deterministic graph generation as the default behavior.

### Lot 9 - Benchmark Refresh Procedure

- [ ] Create a repeatable checklist for date-bound competitive research.
- [ ] Capture required primary-source fields: URL, April proof, date, popularity,
  license, runtime, inputs, outputs, search/index, graph/wiki, agent UX,
  CI/release, limits, and Graphify relevance.
- [ ] Document clone hygiene: clone only into `/tmp` or ignored worktree paths.
- [ ] Document the exclusion rule for stale projects with only `updated_at` or
  `pushed_at` activity.

## Completion Criteria

- [ ] A maintainer has reviewed the benchmark and selected which follow-up specs
  to draft.
- [ ] Any selected lot has a standalone spec before implementation starts.
- [ ] No runtime code changes are introduced on this benchmark branch.
- [ ] The branch remains suitable for a docs-only PR.
