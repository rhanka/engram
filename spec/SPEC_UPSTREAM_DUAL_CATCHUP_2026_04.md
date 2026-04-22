# Upstream Dual Catch-up Spec - 2026-04

## Objectives

- Compare three real codebases from primary sources: this TypeScript Graphify fork, Safi Shamsi's Python Graphify, and `tirth8205/code-review-graph`.
- Identify conceptual and feature gaps that are worth recovering without losing TypeScript-specific Graphify deltas.
- Keep Graphify generic: folder/corpus to knowledge graph, not client-specific review tooling.
- Separate observed source behavior, inferred intent, and optional opportunity.
- Produce implementation lots that can be executed later without changing product code in this study branch.

## Non-objectives

- Do not port Python code mechanically into TypeScript.
- Do not replace `.graphify/` with `graphify-out/` or `.code-review-graph/`.
- Do not add SQLite, embeddings, cloud providers, VS Code extension code, or other heavy dependencies by default.
- Do not delete npm/TypeScript deltas: Graphology runtime, `.graphify/`, lifecycle metadata, PDF/OCR preflight, local TS transcription, review commands, and profile/dataprep work.
- Do not add real customer, partner, project, dataset, registry, or proprietary ontology examples.
- Do not mark a feature as implemented unless it is observed in this repository's code or tests.

## Primary-source baseline

| Source | Version or ref inspected | Commit | URL | Notes |
| --- | --- | --- | --- | --- |
| Local TypeScript Graphify study branch | `spec/upstream-dual-catchup-2026-04` from `main` | `40ef55b98c799bccdcee72cddb2930c2b1d795c5` | local worktree `/home/antoinefa/src/graphify/.worktrees/spec-upstream-dual-catchup-2026-04` | `package.json` reports `graphifyy@0.4.24`; docs say parity through Python `v0.4.23`. |
| Local TypeScript Graphify conductor branch | `feat/ontology-dataprep-profiles` | `4790d162e4e942ea812e97d358b43d6da782bbb5` | local worktree `/home/antoinefa/src/graphify` | In-flight profile/dataprep deltas observed and treated as preserve-before-catch-up work. |
| Safi Python Graphify release line | `v4` branch | `6c8f21272c2343c4c044e3ea8a53459599f2c838` | https://github.com/safishamsi/graphify/tree/6c8f21272c2343c4c044e3ea8a53459599f2c838 | Primary active branch for Python `0.4.x`; post-`v0.4.23` changes observed are README/badge/logo-only. |
| Safi Python Graphify release tag | `v0.4.23` | `8d908c5d43d079579604a82873fd7cff33a1b343` | https://github.com/safishamsi/graphify/tree/8d908c5d43d079579604a82873fd7cff33a1b343 | Relevant Python parity target in existing local docs. |
| Safi Python Graphify `main` | `main` | `494f519bf43ea8243fba8c40a4e72a1071a74395` | https://github.com/safishamsi/graphify/tree/494f519bf43ea8243fba8c40a4e72a1071a74395 | Older line than `v4` by package metadata; not the catch-up target. |
| code-review-graph stable release | `v2.3.2` | `db2d2df789c25a101e33477b898c1840fb4c7bc7` | https://github.com/tirth8205/code-review-graph/tree/db2d2df789c25a101e33477b898c1840fb4c7bc7 | Stable feature baseline for review graph concepts. |
| code-review-graph current `main` | `main` | `b0f8527087b5b3287f648da039a94c3badc7a143` | https://github.com/tirth8205/code-review-graph/tree/b0f8527087b5b3287f648da039a94c3badc7a143 | Contains unreleased additions, including GDScript, Qwen/Qoder, OpenAI-compatible embeddings, and tool filtering; also contains generated/duplicate artifacts, so use cautiously. |

Fetch notes:

- `git fetch upstream --tags` updated `upstream/v4` but rejected local tags `v0.3.28` and `v0.4.23` because local tags would be clobbered. Remote refs were verified with `git ls-remote --heads --tags https://github.com/safishamsi/graphify`.
- `tirth8205/code-review-graph` was cloned to `/tmp/code-review-graph-20260421`, then tag `v2.3.2` was fetched into that clone.

## Current TypeScript deltas to preserve

Observed in the TypeScript fork:

- `.graphify/` canonical local state, `graphify-out/` migration support, and state path helpers.
- TypeScript CLI and skill runtime split, with `runtime-info`, deterministic detection/extraction/finalization commands, and graphify skill proof for Codex.
- Graphology graph runtime, Louvain clustering, JSON/HTML/SVG/GraphML/Cypher/Neo4j export helpers.
- `summary`, `review-delta`, `review-analysis`, `review-eval`, and `recommend-commits` commands over generic Graphify graphs.
- Branch/worktree lifecycle metadata under `.graphify/branch.json` and `.graphify/worktree.json`.
- Local PDF preflight plus optional `mistral-ocr`, extracted PDF images, and semantic sidecar routing.
- Local audio/video support through `yt-dlp`, `ffmpeg`, and `faster-whisper-ts`.
- Multi-assistant installer surface for Claude, Codex, Gemini, Copilot, VS Code Copilot Chat, Aider, OpenCode, OpenClaw, Droid, Trae, Cursor, Hermes, Kiro, and Antigravity.
- In-flight conductor branch profile/dataprep work: configured project config, ontology profile constraints, registry normalization, profile-aware cache namespaces, validation wrapper, profile prompts, and profile QA reports.

## Traceability table

| Upstream | Feature or concept | Version/ref | Commit | Evidence type | Local TypeScript status | Catch-up decision |
| --- | --- | --- | --- | --- | --- | --- |
| Safi Python Graphify | Folder/corpus to graph pipeline: detect -> extract -> build -> cluster -> analyze -> report -> export | `v4` | `6c8f212` | Observed in `graphify/*.py`, README | Covered conceptually in TypeScript modules | Preserve TS runtime; no mechanical port. |
| Safi Python Graphify | `graphify-out/` committed/shared graph workflow | `v4` | `6c8f212` | Observed in README and Python paths | Intentional delta: TS uses `.graphify/` and migration support | Do not revert; docs may explain branch divergence. |
| Safi Python Graphify | Python `faster-whisper` video/audio transcription | `v4` | `6c8f212` | Observed in `graphify/transcribe.py` | Intentional delta: TS uses `faster-whisper-ts` | Preserve TS path; do not add Python runtime dependency. |
| Safi Python Graphify | PDF/Office conversion via Python extras | `v4` | `6c8f212` | Observed in `pyproject.toml`, `detect.py` | TS is ahead for PDF preflight and optional Mistral OCR | Preserve TS OCR/audio pipeline. |
| Safi Python Graphify | CLI `query`, `path`, `explain`, `add`, `watch`, `update`, `cluster-only`, `wiki`, `svg`, `graphml`, `neo4j`, `mcp`, hooks/installers | `v4` | `6c8f212` | Observed in README and `__main__.py` | Mostly covered; TS adds review-specific commands | Audit CLI parity only for regressions. |
| Safi Python Graphify | Multi-platform assistant skill installers | `v4` | `6c8f212` | Observed in `__main__.py`, skill files | Mostly covered; TS has some extra/renamed platforms | Keep TS platform names and `.graphify/` instructions. |
| Safi Python Graphify | NetworkX/Leiden topology clustering | `v4` | `6c8f212` | Observed in pyproject/README | Intentional delta: Graphology/Louvain | Do not add `graspologic`/Python Leiden to TS by default. |
| Safi Python Graphify | Languages: 25 listed including Verilog/SystemVerilog, Vue/Svelte/Dart | `v0.4.23` | `8d908c5` | Observed in README/detect/extract | Mostly covered by TS parity docs; exact support varies | Re-audit tests before new release. |
| Safi Python Graphify | Post-`v0.4.23` docs/badge/logo changes | `v4` | `04790e2`..`6c8f212` | Observed in log/stat | Missing logo icon only; non-runtime | Optional README/logo adoption, no product lot. |
| code-review-graph | SQLite graph store in `.code-review-graph/graph.db` with migrations and FTS | `v2.3.2` | `db2d2df` | Observed in `graph.py`, `migrations.py`, `search.py` | Missing by design; TS uses graph JSON | Opportunity only for optional index; no default DB. |
| code-review-graph | MCP-first review tools, 28 tools, 5 prompts | `v2.3.2` | `db2d2df` | Observed in README, `main.py`, `tools/*` | Partially covered by TS `serve` and review commands | Recover selected generic review concepts, not tool count. |
| code-review-graph | `get_minimal_context` as first, token-budgeted entrypoint | `v2.2.1+` / `v2.3.2` | `db2d2df` | Observed in README, `main.py` | Missing exact command | Good candidate: add Graphify `review-summary` or extend `summary`. |
| code-review-graph | Risk-scored `detect_changes`: changed ranges -> nodes -> flows/communities/test gaps | `v2.1.0+` / `v2.3.2` | `db2d2df` | Observed in `changes.py`, `tools/review.py` | Partially covered by TS `review-analysis`; no changed-line mapping | Good candidate if implemented on graph JSON without SQLite. |
| code-review-graph | Execution flow tracing and criticality | `v2.1.0+` / `v2.3.2` | `db2d2df` | Observed in `flows.py` | Missing as named artifact | Opportunity: derived flow analysis from existing CALLS edges. |
| code-review-graph | Hub, bridge, gap, surprise, suggested-question analysis | `v2.3.2` | `db2d2df` | Observed in changelog and tools | Partially covered by TS god nodes/surprises/review analysis | Reconcile scoring vocabulary and keep generic graph language. |
| code-review-graph | Optional embeddings via local, Google, MiniMax, OpenAI-compatible endpoints | `v2.3.2` and `main` | `db2d2df`, `b0f8527` | Observed in `embeddings.py`, README diff | Missing by design | Defer; heavy/privacy-sensitive unless explicit opt-in spec exists. |
| code-review-graph | Jupyter/Databricks notebook parsing | `v2.1.0+` / `v2.3.2` | `db2d2df` | Observed in parser/tests/readme | Missing in TS | Candidate language/data-surface lot if implemented without heavy deps. |
| code-review-graph | Extra languages: Solidity, R, Perl/XS, Bash/Shell, Luau, GDScript, ReScript | `v1.8+`..`main` | `db2d2df`, `b0f8527` | Observed in parser/tests and changelog | Partially missing in TS | Triage by generic value and parser availability; no blanket port. |
| code-review-graph | Visualization aggregation for large graphs | `v2.2.1+` / `v2.3.2` | `db2d2df` | Observed in `visualization.py` | TS has safe large-graph HTML handling, not CRG-style drill-down | Candidate output lot. |
| code-review-graph | VS Code extension reading graph DB | `v2.x` | `db2d2df` | Observed in `code-review-graph-vscode/` | Missing by design | Do not port in Graphify core; maybe future separate package only. |
| code-review-graph | Multi-repo registry and cross-repo search | `v2.1.0+` / `v2.3.2` | `db2d2df` | Observed in docs/tools/registry | Missing | Defer; conflicts with generic single-corpus Graphify unless separate spec. |
| code-review-graph | Platform install targets: Qwen, Qoder, Windsurf, Zed, Continue | `v2.3.x` / `main` | `db2d2df`, `b0f8527` | Observed in skills/install code | Missing or partial in TS | Candidate lightweight installer lot if names map cleanly. |
| code-review-graph | Source hygiene on `main`: duplicate `* 2.py`, coverage DBs, generated duplicate READMEs | `main` | `b0f8527` | Observed in file list/diff | Not applicable | Do not mirror unreleased tree wholesale. |
| Local conductor branch | Configured ontology dataprep profiles | `feat/ontology-dataprep-profiles` | `4790d16` | Observed in local diff/files/specs | Not present on this study branch from `main` | Must be preserved and rebased before any catch-up implementation. |

## Gap matrix by area

### CLI

Observed:

- TypeScript Graphify has a broad CLI with `install`, platform subcommands, `migrate-state`, `hook`, `state`, `serve`, `watch`, `update`, `cluster-only`, `path`, `explain`, `add`, `summary`, `review-delta`, `review-analysis`, `review-eval`, `recommend-commits`, `query`, `benchmark`, and hidden hook helpers.
- Python Graphify `v4` has comparable graph/query/export/update commands but uses Python packaging and `graphify-out/`.
- code-review-graph has review-centric commands: `build`, `update`, `status`, `watch`, `visualize`, `wiki`, `detect-changes`, `register`, `repos`, `eval`, `serve`, and `postprocess`.

Opportunities:

- Add a compact TypeScript review entrypoint equivalent to CRG `get_minimal_context`, but expressed as generic Graphify output, not code-review-graph branding.
- Consider a `detect-changes` alias only if it maps cleanly to current `review-analysis` semantics.
- Do not copy CRG `build/update/status` naming unless it improves Graphify clarity; current Graphify command vocabulary already matches Safi upstream.

### Pipeline

Observed:

- Python Graphify and TypeScript Graphify share the same conceptual pipeline.
- TypeScript adds deterministic skill-runtime commands that pin the runtime for Codex and other orchestrated flows.
- CRG has a code-only pipeline: parse -> SQLite store -> postprocess signatures/FTS/flows/communities -> review tools.

Opportunities:

- Recover CRG post-processing as optional derived views over `graph.json`: flow snapshots, risk summaries, and minimal review context.
- Keep assistant-driven semantic extraction and multimodal preparation as first-class Graphify behavior.

### Output

Observed:

- Python Graphify outputs `graphify-out/GRAPH_REPORT.md`, `graph.json`, `graph.html`, wiki, SVG, GraphML, Cypher, Neo4j push.
- TypeScript outputs equivalent artifacts under `.graphify/` and supports legacy migration.
- CRG outputs SQLite, visualization HTML, GraphML/SVG/Cypher/Obsidian, wiki, graph diff, memory markdown.

Opportunities:

- Add optional aggregate visualization modes for large graphs, inspired by CRG, if it can be done inside existing HTML export.
- Add graph diff as a generic Graphify feature only if it uses existing serialized graph snapshots and avoids SQLite.
- Keep `.graphify/wiki/index.md` as the wiki entrypoint; do not fork into CRG naming.

### Skills and agents

Observed:

- Python Graphify and TypeScript Graphify install skill/instruction files across many AI coding tools.
- CRG is MCP-first and injects MCP config for multiple platforms, plus review/debug/refactor/explore skills.

Opportunities:

- Add missing lightweight platform installers only when the config contract is stable: Qwen, Qoder, Windsurf, Zed, Continue.
- Borrow CRG's "minimal first" guidance for review/debug skills, but preserve `$graphify` in Codex and `.graphify/` state rules.

### Review and code graph

Observed:

- TypeScript Graphify has additive review views over the generic graph.
- CRG is review-first: changed-line mapping, blast radius, risk scoring, flows, tests, communities, and tool routing.

Opportunities:

- Strengthen TypeScript `review-analysis` with CRG-like changed-range mapping and explicit risk scoring.
- Add optional flow tracing from existing `calls`/`imports` edges.
- Add a compact "read this first" review summary that returns changed files, impacted communities, hubs/bridges, test gaps, and next tool suggestions.

Non-opportunities:

- Do not make Graphify review-only.
- Do not require a persistent code-only DB to run review commands.

### Lifecycle

Observed:

- TypeScript Graphify has branch/worktree lifecycle metadata and stale markers.
- Python Graphify has hook/update behavior but not the same lifecycle metadata.
- CRG has git hooks, watch mode, git/SVN diff support, and automatic graph build for new worktrees.

Opportunities:

- Improve lifecycle docs and UAT around worktree branch switches and stale semantic data.
- Consider CRG's new-worktree build idea as an opt-in hook behavior, not default destructive cleanup.

### OCR and audio

Observed:

- Python Graphify supports video/audio via Python `faster-whisper` extras.
- TypeScript Graphify supports local `faster-whisper-ts`, `yt-dlp`, `ffmpeg`, PDF preflight, and optional Mistral OCR.
- CRG is code-structure focused and does not target OCR/audio.

Decision:

- Preserve TypeScript OCR/audio as a competitive delta.
- Do not import CRG embeddings or review tooling into the OCR/audio path.

### Profile and dataprep

Observed:

- The conductor branch introduces configured ontology dataprep profiles with synthetic fixtures and explicit opt-in.
- Neither Safi Python Graphify nor CRG has an equivalent generic profile/dataprep layer.

Decision:

- Treat profile/dataprep as a TypeScript-only product delta.
- Any upstream catch-up branch must rebase or merge this branch first before product implementation begins.
- Profile artifacts must remain under `.graphify/profile/` and must not replace base `GRAPH_REPORT.md`, `graph.json`, `graph.html`, or wiki.

### Graph storage

Observed:

- TypeScript/Python Graphify use portable JSON graph artifacts.
- CRG uses SQLite for incremental code review, FTS, migrations, and a VS Code extension.

Opportunity:

- If performance requires it, design an optional local index/cache sidecar. Do not change Graphify's source of truth from `graph.json`.

### Report and wiki

Observed:

- TypeScript/Python Graphify reports god nodes, communities, surprises, questions, and wiki pages.
- CRG wiki includes community members, flows, dependencies, and generated pages from SQLite.

Opportunities:

- Enrich Graphify wiki/report with optional flow/risk sections once those views exist.
- Preserve audit-trail wording around EXTRACTED/INFERRED/AMBIGUOUS and multimodal provenance.

### CI and release

Observed:

- TypeScript Graphify uses npm package versioning and TypeScript CI.
- Python Graphify uses PyPI packaging and branch/tag release lines.
- CRG uses Python lint/type/security/test matrix and PyPI publish, with a separate VS Code extension schema sync check.

Opportunities:

- Add a docs-only source hygiene checklist for upstream syncs: ref fetch, tag clobber detection, package version verification, and "release tag vs main" distinction.
- Do not add CRG's Python release tooling to the TypeScript repo.

## Opportunities ranked

| Rank | Opportunity | Why | Dependency impact | Notes |
| --- | --- | --- | --- | --- |
| 1 | Minimal review context over `graph.json` | High user value; aligns with existing review commands | None | Inspired by CRG, generic Graphify wording. |
| 2 | Changed-range to graph-node mapping | Improves review precision | None if based on Git diff + current graph | Avoid CRG SQLite dependency. |
| 3 | Flow snapshots from existing CALLS edges | Adds architecture/review signal | None | Use Graphology traversal. |
| 4 | Report/wiki risk and flow sections | Makes output more actionable | None after flow/risk views | Keep sections optional and clearly sourced. |
| 5 | Large-graph aggregate HTML mode | Improves usability on big graphs | None if implemented in current HTML | Avoid D3 rewrite unless justified. |
| 6 | Platform installer gap triage | Lightweight docs/config recovery | None | Qwen/Qoder/Windsurf/Zed/Continue only after contract review. |
| 7 | Notebook parsing | Useful for research/data corpora | Low/medium if JSON-only parser | Avoid heavy notebook runtime dependencies. |
| 8 | Additional languages from CRG | Useful but broad | Varies by grammar | Triage per language; do not blanket-port. |
| 9 | Optional graph diff | Useful for branch review | None if snapshot-based | Keep separate from lifecycle stale metadata. |
| 10 | Embeddings | Potential search lift | Heavy/privacy-sensitive | Defer until explicit opt-in spec. |

## Risks

- Release-line confusion: Safi `main` is older than `v4`; `v4` should remain the Python parity source unless upstream changes branch policy.
- Tag clobber risk: local tags for Safi `v0.3.28` and `v0.4.23` differ from fetched tags; future scripts must not silently trust local tags.
- Scope creep: CRG is review-first and code-only, while Graphify is generic and multimodal.
- Dependency creep: CRG's SQLite, embeddings, igraph, FastMCP, and VS Code extension stack should not become Graphify defaults.
- Source hygiene: CRG `main` currently includes duplicate/generated files and coverage DB artifacts; use stable tags for implementation planning.
- Active branch loss: local profile/dataprep work on `feat/ontology-dataprep-profiles` is not in this study branch from `main`; product catch-up must integrate it deliberately.
- Semantic overclaiming: classify features as observed, inferred, or opportunity in every downstream issue/PR.

## Catch-up lots

### Lot 0 - Source lock and branch hygiene

- Capture upstream SHAs/tags in `UPSTREAM_GAP.md` or a new source-lock table.
- Add a repeatable command checklist for `git ls-remote`, tag clobber detection, and release-line selection.
- Rebase or merge current TypeScript product deltas before implementation begins.

### Lot 1 - Safi Python v4 drift audit

- Re-audit Python `v4@6c8f212` against current TypeScript `main` plus conductor branch.
- Confirm post-`v0.4.23` changes are docs/logo only.
- Update README wording if parity target should mention `v4@6c8f212` rather than only `v0.4.23`.

### Lot 2 - Minimal review context

- Add a compact review entrypoint using existing Graphology graph and changed-file detection.
- Return risk level, changed files, impacted files, impacted communities, hubs/bridges, test gaps, and next action.
- Keep output generic and token-bounded.

### Lot 3 - Changed-range mapping and risk scoring

- Parse `git diff --unified=0` safely.
- Map changed line ranges to Graphify nodes by `source_file` and `source_location` where possible.
- Add explicit risk scoring that uses graph degree, community spread, inferred/ambiguous edges, and test gaps.

### Lot 4 - Flow snapshots

- Derive execution flows from existing `calls` edges and entrypoint heuristics.
- Store flow snapshots as optional analysis metadata, not a new database.
- Surface affected flows in review output.

### Lot 5 - Report/wiki/output enrichment

- Add optional report/wiki sections for risk, flows, and review guidance.
- Add large-graph aggregate visualization mode only if current HTML export remains maintainable.
- Preserve `GRAPH_REPORT.md` audit language and `.graphify/wiki/index.md`.

### Lot 6 - Language and input triage

- Compare TS language support to CRG stable and main-only languages.
- Prioritize notebook parsing and high-signal script languages over niche additions.
- Require tests and no heavy runtime dependency for each language lot.

### Lot 7 - Platform installer triage

- Review CRG platform configs for Qwen, Qoder, Windsurf, Zed, and Continue.
- Add only stable, lightweight instruction/MCP config targets.
- Keep Codex `$graphify` and `.graphify/` instructions canonical.

### Lot 8 - Profile/dataprep preservation

- Integrate `feat/ontology-dataprep-profiles` before any product catch-up branch.
- Ensure profile cache namespaces, profile validation, and profile reports survive review/flow additions.
- Keep fixtures synthetic and generic.

### Lot 9 - Deferred heavy features

- Write separate specs before considering embeddings, SQLite sidecars, multi-repo registry, or VS Code extension.
- Require explicit privacy/dependency justification and opt-in behavior.

## UAT criteria

- `graphify summary --graph .graphify/graph.json` still works before and after review additions.
- Existing commands and artifacts remain valid: `.graphify/graph.json`, `.graphify/GRAPH_REPORT.md`, `.graphify/graph.html`, `.graphify/wiki/index.md`.
- Review context on a small changed file returns a bounded summary and does not require SQLite or embeddings.
- Changed-range mapping gracefully falls back to file-level mapping when line locations are absent.
- Flow snapshots are optional and derived from existing Graphify edges.
- Large-graph HTML still writes `graph.json` and `GRAPH_REPORT.md` even when visualization is skipped or aggregated.
- Profile/dataprep mode remains opt-in through discovered config, `--config`, or `--profile`.
- No docs, fixtures, tests, or examples include real client/proprietary content.
- No new dependency is added without a table entry explaining why it is necessary, optional, and safe.
- Source lock table cites upstream URL and commit for every recovered feature.

## README and skill impacts

- README should gain a "Dual upstream alignment" note only after product decisions are implemented, not from this study alone.
- README should keep the fork narrative: Safi Python Graphify is the product lineage; code-review-graph is an additive review-surface inspiration.
- Skill files should adopt CRG-style "minimal first" review guidance only for review tasks.
- Codex skill instructions must continue to prefer `$graphify ...`, not `/graphify ...`.
- Graph freshness rules must keep `.graphify/needs_update` and lifecycle stale checks.
- Profile/dataprep skill sections must remain explicit opt-in and generic.

## Open questions for future implementation

- Should `review-analysis` be extended in place, or should a new `review-summary` command be added for CRG-like minimal context?
- Should graph diff be implemented as a first-class command or folded into review evaluation?
- Which extra language has enough generic value to justify first: notebooks, Bash, R, Solidity, Perl/XS, ReScript, GDScript, or Luau?
- Should large-graph aggregation be an HTML export mode, a separate artifact, or only a report/wiki summarization feature?
