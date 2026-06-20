# SPEC_GRAPHIFY

## Status

- Product: Graphify TypeScript port
- Target npm package: graphifyy@0.4.23
- Maintained product branch: main
- Upstream alignment branches: v3 mirrors the closed Python v3 baseline; v4 is the active Python parity target through v0.4.23
- Runtime state root: .graphify/
- Legacy read fallback: graphify-out/graph.json is still accepted for compatibility, but new writes target .graphify/
- Legacy migration: graphify migrate-state plans/copies graphify-out/ into .graphify/ and advises git mv for tracked artifacts

This document describes the implemented TypeScript product state after the evolution lots. It is not a proposal document and does not describe the upstream Python runtime except where branch alignment matters.

## Product Identity

Graphify turns a workspace or corpus folder into a durable knowledge graph for assistants and humans. It remains a general multimodal knowledge-graph product, not a code-review-only product.

The TypeScript port keeps the original Graphify idea: a folder becomes a graph with explicit provenance, communities, reports, exports, and assistant-facing traversal. The TypeScript branch adds npm distribution, TypeScript-native runtime commands, local .graphify state, branch/worktree lifecycle metadata, MCP tools, review projections, and broader assistant installers.

## Non-Negotiable Contracts

- New runtime artifacts are written under .graphify/.
- .graphify/ is local state and is gitignored by default.
- Assistants must prefer .graphify/GRAPH_REPORT.md and .graphify/wiki/index.md before broad raw-file traversal.
- Codex explicit invocation is $graphify, not /graphify.
- The TypeScript skill runtime must prove runtime: typescript in .graphify/.graphify_runtime.json.
- Review and commit recommendation features are advisory. They do not stage files, create commits, or mutate branches.
- The graph remains file-based by default. Optional external graph mirrors are opt-in pushed projections specified in SPEC_STORAGE_BACKENDS.md; they are never the source of truth and never the default. SQLite-as-primary-store and embeddings are deferred, not default architecture.

## Supported Inputs

Graphify supports one graph across code and non-code inputs:

- code: Tree-sitter AST extraction for supported languages
- code fallback surface: Vue, Svelte, Blade, Dart, Verilog/SystemVerilog, MJS, and EJS are classified and extracted through upstream-aligned fallback extractors when full grammar support is unavailable
- markdown/MDX/HTML/text/reStructuredText: semantic extraction through assistant skill flow
- PDF: local preflight, text-layer Markdown sidecars through pdf-parse or pdftotext fallback, and optional Mistral OCR sidecars for scanned/low-text PDFs before assistant semantic extraction
- Office docs: .docx and .xlsx conversion to markdown sidecars before semantic extraction
- images: multimodal assistant extraction
- URLs: arXiv, PDF, image, general web pages, X/Twitter, YouTube audio ingestion
- audio/video: local transcription through yt-dlp when needed, ffmpeg normalization, and faster-whisper-ts Whisper-compatible transcription

Generated transcripts and PDF Markdown sidecars are treated as document inputs for semantic extraction.

## Runtime Artifacts

Canonical state under .graphify/:

- graph.json: serialized graph
- GRAPH_REPORT.md: human audit report and assistant first stop
- graph.html: interactive visualization unless disabled
- manifest.json and cost.json
- cache/: semantic cache
- transcripts/: downloaded/converted/transcribed media artifacts
- converted/: converted Office/docs sidecars, including converted/pdf/ PDF text/OCR sidecars
- memory/: saved graph-backed Q&A
- wiki/: optional agent-crawlable community wiki
- worktree.json and branch.json: lifecycle metadata
- needs_update: stale marker
- .graphify_*.json scratch files under .graphify/, not repo root

Legacy compatibility:

- graphify-out/graph.json remains a read fallback for implicit graph consumers during the compatibility window.
- graphify-out/ is not the current write target.
- graphify migrate-state --dry-run prints a non-destructive migration plan and git advice.
- graphify migrate-state copies legacy local state into .graphify/ without deleting graphify-out/.
- If graphify-out/ is tracked in a committed repo, the migration advice recommends reviewing git mv -f graphify-out .graphify and a commit message before mutating Git history.

## Core Build Pipeline

1. Detect corpus files and classify them by type.
2. Convert supported Office files, prepare transcript-backed document inputs, and run PDF preflight/OCR sidecar generation when configured.
3. Extract deterministic code structure through Tree-sitter.
4. Run semantic extraction for docs, papers, images, transcripts, PDF sidecars, and non-code materials through the assistant skill contract.
5. Validate extraction JSON.
6. Merge AST and semantic extraction.
7. Build a Graphology graph.
8. Cluster with Louvain and compute cohesion.
9. Label communities and compute analysis.
10. Describe entities — per-node descriptions (default-on enrichment, no-key assistant-emit; `--no-description` to skip).
11. Project citations — deterministic union / true-count / tiering of the per-node citation locators emitted by step 4 (default-on, no LLM; `--no-citations` to skip).
12. Export graph.json, GRAPH_REPORT.md, the static Ontology Studio, optional wiki and export formats.

Steps 9–11 are **enrichment stages** governed by the shared policy in *Enrichment Stages* below; they run in EVERY graph-finalization path, not only `graphify update`.

Every edge keeps provenance confidence: EXTRACTED, INFERRED, or AMBIGUOUS, with scores where available.

### Assembly Hygiene (CORE, config-gated, default OFF)

Between step 6 (merge AST + semantic) and step 7 (build the graph), an optional, deterministic, idempotent, NO-KEY pre-pass canonicalizes the assembled extraction. It is gated through `BuildOptions.assemblyHygiene` (and exposed standalone as `applyAssemblyHygiene`), default OFF so the base non-profile contract is unchanged. The three sub-steps run in fixed order and benefit any corpus (`src/assembly-hygiene.ts`):

1. **Schema hygiene (`normalizeSchemaHygiene`).** Canonicalizes synonymous id-prefixes through an explicit, extensible synonym map (defaults `location_`→`place_`, `org_`→`organization_`) and normalizes the node `type` to its canonical Capitalized form (default overrides `place`→`Location`, `chapter`/`story`→`ChapterOrStory`; bare lowercase types fold to Capitalize, e.g. `character`→`Character`). When two nodes collapse onto the same canonical id their edges, string-array fields, and citations are **UNIONed** (the 0.14.0 citation-union-at-merge posture — never last-write-wins-dropped); scalar attrs are filled first-seen by sorted id order. Self-loops created by a collapse are dropped. Re-running on its own output is a no-op.
2. **Alias / normalized_terms derivation (`deriveAliasesAndNormalizedTerms`).** Derives `aliases` + `normalized_terms` from the label CONSERVATIVELY: strips leading honorifics/titles (Dr., Sir, Colonel, Inspector, Mr., Mrs., Lord, Lady, Captain, Professor, …) and parentheticals (`Hugo Oberstein (spy)`→alias `Hugo Oberstein`), lowercases the normalized terms. No fuzzy stemming (no invented collisions). Merges with — never clobbers — any pre-existing aliases/terms; idempotent.
3. **De-orphan (`deOrphanByContainer`).** Links each degree-0 entity node to a container through a derived `appears_in` edge (`derived:true`, `confidence:"INFERRED"`), **steering the orphan into the giant connected component so it never forms a 2-node island**. Per orphan (giant mode, `preferGiantComponent` default ON): pick the FINEST container (ChapterOrStory/Scene/Section, then Work) sharing provenance (`source_file` or path slug) that is **itself in the giant component** (`derivation_method:"deorphan:giant-component"`); else fall back to the Work (the densely-connected anchor — "of two items one is necessarily the Work, and the Work is linked to many", `derivation_method:"deorphan:work-fallback"`) so the orphan joins the Work's subgraph rather than a degree-1↔degree-1 island; else the strict finest container as best-effort. Exactly ONE container is chosen per orphan, so no redundant entity→Work edge is added when a finer container already carries it toward the Work. Finest-in-giant is still chosen over straight-to-Work so Work hubs don't outrank protagonists. Set `preferGiantComponent:false` for the legacy strict-finest behavior (`derivation_method:"deorphan:finest-container"`). Idempotent: respects pre-existing `appears_in`, never double-adds, never links a container node into itself. **Honest residual:** de-orphan is a topology guardrail, not a density fix — on the public mystery-sagas corpus ~64.8% of entities carry ONLY an `appears_in` edge, which produces implausibly thin hub-spoke stars (e.g. a Father Brown chapter with ~184 degree-1 satellites) and a multi-work Thorndyke island that no container-linking strategy can merge into the giant without cross-work edges. That deeper low-density cause is the separate re-index work (TRACKED #5), not de-orphan.

## Enrichment Stages — Labels, Descriptions, Citations

Three pipeline stages enrich the clustered graph before export (steps 9–11). They share one policy resolver but split into two mechanics.

**Target contract — NOT yet fully implemented.** These stages MUST run by default in every graph-finalization path — `graphify <path>` (first run), `graphify extract` (after semantic input is available), `graphify update` (code), and profile post-semantic finalization — through ONE shared finalization step. Today only `graphify update` (code) describes; `graphify extract` and `profile build` run labels/citations but never call `generateNodeDescriptions` (`src/cli.ts:3481-3528`, `src/cli.ts:2934`), and `buildProject` describes but only resolves existing community labels (`src/pipeline.ts:215-254`). Bringing `extract` / profile / `buildProject` / runtime onto the shared finalization step is the core change this spec mandates.

### LLM/assistant stages — community labels + node descriptions

Both require an LLM. The NO-KEY default is the assistant-emit contract: the stage emits instruction files for the host assistant (the running skill) to fill, then ingests the answers on the next run — never requiring an API key.

- Labels emit `.graphify/label-instructions/`; the assistant writes the answers; the next run ingests and persists them (regardless of `assistant` vs `llm` source — neither path may drop assistant-ingested labels).
- Descriptions emit `.graphify/description-instructions/batch-NNN.md`; the assistant writes `batch-NNN.json`; the next run ingests it before emitting new work and sets `node.description`.
- Direct (keyed) execution is OPT-IN and EXPLICIT via `--label-mode direct` / `--description-mode direct`. The mere presence of an API key in the environment (e.g. a discovered `.env`) does NOT silently switch a stage to direct mode. *Required change:* today auto-mode resolves to **direct** whenever a backend/API key is detected (`src/node-descriptions.ts:1025-1033`, `src/community-labeling.ts:527-534`; the CLI also imports a local `.env`, `src/cli.ts:2201`) — auto must resolve to assistant/emit unless `direct` is explicitly requested.
- Opt-out: `--no-label` / `--no-description`. `--no-cluster` also implies no labels.

### Deterministic stage — citations

Citation projection is deterministic and provider-neutral: NO LLM, network, or secrets. The citation LOCATORS (`{source_file, source_url?, page?, section?, paragraph_id?, figure_id?, bbox?}`, `src/types.ts:500`) are emitted PER NODE by the upstream semantic extraction (step 4) — when profile extraction is active, at the profile's `citation_policy.minimum_granularity` (`file | page | section | paragraph`; validation today enforces `source_file` always and `page` only when the minimum is `page`, `src/profile-validate.ts:66-77`); non-profile extraction preserves whatever locators the upstream extraction emitted. The citation stage only UNIONs/dedups the locators already on the nodes, sets the true degree-independent `citation_count`, and tiers them: an inline top-K in `graph.json` plus the full union lazily in `.graphify/ontology/citations.json`. It scans NO source text (no grep/regex). **Required invariant:** graph-finalization writers MUST route through `persistGraphWithCitations` (`src/export.ts:394`, `src/citations.ts:220`); today raw `toJson` writers still exist in non-finalization commands (fragment `build`, `label`, `describe`, `backfill-citations`, runtime reload — `src/cli.ts:3233,3937,4063,4118`) and each must be classified as a non-finalization rewrite that preserves/reprojects the existing sidecar, or migrated so no graph output can skip citation projection. Opt-out: `--no-citations`.

### Cost-awareness policy (uniform across the three stages) — REQUIRED, not yet implemented

None of the following exist in the CLI today (no `--batch`, no `CI=1` resolver, no impact-threshold warning, no `--description-top`/`--description-max-nodes`; describe default is full coverage, `DEFAULT_MAX_NODES = 0`, `src/node-descriptions.ts:261`). They are the target:

- **Impact warning — *le cas échéant*.** Before a stage runs, if its workload exceeds a configurable threshold, warn with the concrete impact and the skip flag — describe: describable-node count → assistant-batch count; citations: estimated `citations.json` size (cost is bytes/time, not tokens — citation projection makes no provider calls). Below threshold: silent (no nag).
- **Batch opt-out.** `--batch=skip|emit` is an umbrella across the stages; `CI=1` forces a deterministic posture (emit-only or skip, never direct). A non-TTY environment alone is NOT treated as batch (a scripted assistant run may legitimately want instruction files).
- **Large-corpus threshold.** Configurable per stage. Above it the default is WARN + FULL coverage — NEVER a silent cap: an undescribed node has no sidecar fallback (unlike a citation, whose tail is preserved in `citations.json`, where an inline top-K is correct). A reduced pass is opt-in only (`--description-top <k>` / `--description-max-nodes <n>`, direct mode).

### Migration

On finalization paths that run the description stage, a graph with zero descriptions auto-emits description instructions on the next run; `--fill-missing` is the idempotent gap-fill for partially-described graphs. Citation-poor graphs are NOT auto re-extracted — exhaustive counts come from re-extraction or the opt-in `backfill-citations` path.

`SPEC_WIKI_ENTITY_DESCRIPTIONS.md` (the older `--wiki-descriptions` opt-in framing) is SUPERSEDED by this default-on model for *generation*; its wiki-rendering consumption contract still applies.

## Configured Ontology Dataprep Profiles

Configured ontology dataprep profiles are an additive layer over the existing pipeline. They activate only through a discovered project config (`graphify.yaml`, `graphify.yml`, `.graphify/config.yaml`, `.graphify/config.yml`) or an explicit `--config`/`--profile` option. Without that activation, the normal non-profile graphify behavior and base `validateExtraction()` contract remain unchanged.

Project config owns physical inputs: corpus paths, generated semantic sidecars, registry files, exclusions, PDF/OCR policy, and `.graphify/` output state. Ontology profiles own semantic constraints: allowed node types, relation types, citation policy, hardening statuses, and named registry bindings. CSV, JSON, and YAML registries are normalized into ordinary Graphify extraction fragments.

Profile artifacts live under `.graphify/profile/`:

- project-config.normalized.json
- ontology-profile.normalized.json
- profile-state.json
- registries/*.json
- registry-extraction.json
- semantic-detection.json
- dataprep-report.md
- profile-report.md when requested

Semantic cache entries can be namespace-isolated by profile hash, so a generic cache hit cannot satisfy profile-aware extraction. Full semantic extraction remains assistant/skill orchestrated: runtime and CLI commands expose deterministic project config loading, configured dataprep, profile prompt generation, profile validation, and profile QA reporting.

Optional profile-declared ontology outputs compile under `.graphify/ontology/` through `graphify profile ontology-output` or the runtime `ontology-output` command. They are inert unless `outputs.ontology.enabled: true` is present in the ontology profile.

Optional image dataprep artifacts live under `.graphify/image-dataprep/` and calibration proposals under `.graphify/calibration/`. Runtime commands cover deterministic sample writing, calibration replay, provider-neutral batch export/import, and accepted-matrix deep-pass export. Production cascade routing is blocked unless project-owned rules declare `decision: accept_matrix`.

The LLM Wiki remains `.graphify/wiki/index.md`. Profile mode does not add embeddings, databases, remote registry fetching, or a resident LLM backend. The opt-in graph mirrors in SPEC_STORAGE_BACKENDS.md do not change this principle: profile and ontology artifacts remain file-based, and a configured mirror only receives pushed projections of `graph.json`.

Ontology lifecycle and reconciliation are specified separately in `SPEC_ONTOLOGY_LIFECYCLE_RECONCILIATION.md`. The product rule is that `graph.json` and compiled ontology JSON remain derived artifacts. Review decisions must be expressed as validated patches against project-owned sources such as profiles, registries or reconciliation decision logs, then Graphify rebuilds the graph and ontology outputs. The existing MCP server stays read-only by default; any mutation surface must be explicit, local, dry-run first and audit-backed.

The current HTML graph viewer is not the target for professional ontology reconciliation. A future UI should be a separate Svelte-based local studio that consumes Graphify ontology artifacts and patch APIs. It should consume `../sent-tech-design-system` once available through a token adapter, with explicit token requirements before implementation. The external `public-domaine-mystery-sagas-pack` corpus is the preferred real UAT for studio mockups because it exercises canonical characters, aliases, narrator/person splits, relations, evidence and audit flows without adding proprietary examples to Graphify.

## PDF Preflight And OCR

PDF handling is normalized before semantic extraction. The preparation step reads every paper/PDF in the semantic detection copy and applies the contract in [SPEC_PDF_OCR_PREPROCESSING.md](SPEC_PDF_OCR_PREPROCESSING.md).

Behavior:

- `GRAPHIFY_PDF_OCR=auto` is the default. It runs local `pdf-parse` preflight with optional `pdftotext` fallback and calls `mistral-ocr` only for scanned/low-text PDFs.
- `GRAPHIFY_PDF_OCR=off` leaves PDFs in `files.paper`.
- `GRAPHIFY_PDF_OCR=always` forces Mistral OCR and fails clearly without `MISTRAL_API_KEY`.
- `GRAPHIFY_PDF_OCR=dry-run` records the decision without a provider call.
- text-layer PDFs become Markdown through `pdf-parse` or `pdftotext`, without a paid OCR call.
- generated sidecars live under `.graphify/converted/pdf/` and are added to `files.document` in the semantic detection copy.
- image artifacts extracted from PDFs are added to semantic `files.image` when present, so they can be decoded when they carry diagrams, tables, captions, or embedded text; skills prefer the assistant vision model and may delegate to a configured OCR/vision provider while preserving source PDF provenance.

The original detection remains the manifest/report source of truth. The augmented semantic detection is only for cache lookup and assistant semantic extraction.

## Public CLI Surfaces

Build and maintain:

- graphify <path>
- graphify <path> --directed
- graphify <path> --mode deep
- graphify <path> --pdf-ocr off|auto|always|dry-run
- graphify <path> --update
- graphify <path> --cluster-only
- graphify update <path>
- graphify cluster-only <path>
- graphify add <url>
- graphify <path> --watch
- graphify hook install/status/uninstall
- graphify state status/prune
- graphify migrate-state --dry-run/--force

Query and inspect:

- graphify summary --graph .graphify/graph.json
- graphify query "question" --graph .graphify/graph.json
- graphify path "A" "B" --graph .graphify/graph.json
- graphify explain "Node" --graph .graphify/graph.json

Review projections:

- graphify review-delta --files src/a.ts --graph .graphify/graph.json
- graphify review-analysis --files src/a.ts --graph .graphify/graph.json
- graphify review-eval --cases .graphify/review-cases.json --graph .graphify/graph.json
- graphify recommend-commits --graph .graphify/graph.json

Configured profiles:

- graphify profile validate --config graphify.yaml
- graphify profile dataprep . --config graphify.yaml
- graphify profile validate-extraction --profile-state .graphify/profile/profile-state.json --input extraction.json
- graphify profile report --profile-state .graphify/profile/profile-state.json --graph .graphify/graph.json --out .graphify/profile/profile-report.md
- graphify profile ontology-output --profile-state .graphify/profile/profile-state.json --input extraction.json --out-dir .graphify/ontology

Exports and services:

- graphify <path> --wiki
- graphify <path> --svg
- graphify <path> --graphml
- graphify export neo4j (Cypher file artifact, src/cli.ts:3663)
- graphify store push (PROPOSED, SPEC_STORAGE_BACKENDS.md)
- graphify serve .graphify/graph.json

Doc/code gap resolution: earlier revisions of this spec documented `graphify <path> --neo4j` and `graphify <path> --neo4j-push <uri>` build flags. Those flags were never implemented; only `graphify export neo4j` (src/cli.ts:3663) exists. They are removed in favor of the opt-in `graphify store push` surface specified in SPEC_STORAGE_BACKENDS.md.

## Assistant And Platform Contracts

Project-scoped installers:

- graphify claude install writes CLAUDE.md and .claude/settings.json PreToolUse hook.
- graphify codex install writes AGENTS.md and .codex/hooks.json PreToolUse hook.
- graphify gemini install writes GEMINI.md and .gemini/settings.json MCP config.
- graphify opencode install writes AGENTS.md, .opencode/plugins/graphify.js, and opencode.json.
- graphify cursor install writes .cursor/rules/graphify.mdc.
- graphify vscode install writes .github/copilot-instructions.md and the global Copilot skill.
- graphify kiro install writes .kiro/skills/graphify/SKILL.md, .graphify_version, and .kiro/steering/graphify.md.
- graphify antigravity install writes .agent/rules/graphify.md, .agent/workflows/graphify.md, and the global Antigravity skill.
- Aider, OpenClaw, Droid, Trae, Trae CN, and related AGENTS.md platforms write AGENTS.md instructions.

Global skill installers:

- graphify install --platform <platform> writes the platform skill file and .graphify_version marker.
- Supported global skill targets include Claude, Windows Claude, Codex, Gemini, Copilot CLI, VS Code Copilot Chat, Aider, OpenCode, OpenClaw, Factory Droid, Trae, Trae CN, Cursor, Hermes, Kiro, and Google Antigravity.

All install commands now print mutation previews before writing, including exact files and hook/MCP/plugin configuration that will be touched.

Profile-aware skills use the TypeScript runtime commands `project-config`, `configured-dataprep`, `profile-prompt`, `profile-validate-extraction`, `profile-report`, `ontology-output`, `image-calibration-samples`, `image-calibration-replay`, `image-batch-export`, and `image-batch-import` when a project config or explicit profile is active. Skills must fall back to the normal non-profile flow when no config/profile activation is present.

## MCP Tools

The MCP server exposes graph traversal and review-oriented tools:

- first_hop_summary
- review_delta
- review_analysis
- recommend_commits
- query_graph
- get_node
- get_neighbors
- get_community
- god_nodes
- graph_stats
- shortest_path

The MCP review tools are projections over the same graph, not a separate backend.

MCP mutation tools are not part of the default server contract. Future ontology write tools must live behind an explicit write-enabled ontology command, use the same deterministic patch core as the CLI and local studio, and never edit `graph.json` directly.

## Review And Commit Recommendation Features

First-hop summary:

- gives graph size, density, average degree, top hubs, key communities, and next graph action
- should be used before deeper traversal

Review delta:

- starts from changed files
- surfaces changed nodes, impacted nodes/files, hubs, bridges, likely test gaps, and high-risk chains
- can infer files from local git diff when not explicitly passed

Review analysis:

- adds blast radius
- summarizes impacted communities
- highlights bridge nodes and test-gap hints
- surfaces multimodal/doc regression safety

Review evaluation:

- reads JSON cases
- measures token savings versus naive file reads
- measures impacted-file recall
- measures review summary precision
- measures multimodal regression safety

Commit recommendation:

- groups changed files by graph community when possible
- falls back to path grouping for partial graphs
- reports confidence and stale-state reasons
- remains advisory-only: no auto-stage, no auto-commit, no branch mutation

## Lifecycle Model

Graphify tracks local git lifecycle state under .graphify/:

- worktree.json records worktree path, git dir, common git dir, first/last seen HEAD, and last analyzed HEAD
- branch.json records branch name, upstream, merge-base, first/last seen HEAD, last analyzed HEAD, stale flag, stale reason, stale timestamp, and lifecycle event
- needs_update marks stale state

Hooks are git-native and worktree-aware. They resolve hook paths through git rev-parse instead of assuming .git is a directory. Covered events include post-commit, post-checkout, post-merge, and post-rewrite.

Hooks mark state stale first, then attempt a non-blocking code-only rebuild when safe. Semantic extraction is not run from hooks.

## Upstream Alignment And Divergence

Alignment:

- v3 tracks the closed upstream Python Graphify v3 baseline for parity analysis.
- v4 is the active upstream Python parity target through v0.4.23.
- UPSTREAM_GAP.md is the source of truth for version-by-version coverage and intentional deltas.
- main is the maintained TypeScript product branch.
- The TypeScript port keeps the original assistant-skill graph workflow and MIT license attribution.

Intentional TypeScript divergence:

- npm distribution and TypeScript runtime
- .graphify local state contract
- local faster-whisper-ts transcription instead of Python faster-whisper
- PDF preflight plus optional Mistral OCR sidecars through the TypeScript runtime
- broader assistant installer matrix
- MCP tools for summary/review/recommendation
- review-mode projections inspired by code-review-graph
- install mutation previews
- GitHub Actions trusted npm publishing with a release guard that only publishes tags whose commit is already contained in the default branch and whose tag version matches package.json

Code-review-graph-inspired additions:

- summary, review-delta, review-analysis, review-eval, and recommend-commits are additive projections over graph.json
- these features do not change the product into a review-only tool
- SQLite, embeddings, persisted review databases, and provider-specific review-pr workflows remain deferred

## Deferred Items

- review-pr workflow
- embeddings
- SQLite backend
- editor extension parity
- richer flow model
- persisted review summary cache
- auto-commit or auto-stage behavior

Remote service or shared backend is no longer deferred: opt-in external graph mirrors are now specified in SPEC_STORAGE_BACKENDS.md as pushed projections of graph.json. SQLite backend (as a primary store) and embeddings remain deferred.

## Acceptance Criteria

The implemented product is considered aligned with this spec when:

- npm build succeeds
- full test suite succeeds
- .graphify hook rebuild succeeds, allowing known optional fixture grammar warnings
- README and multilingual READMEs describe .graphify, main, v3/v4 upstream alignment, review features, assistant platform installers, release guards, install previews, and configured ontology dataprep profiles consistently
- assistant skills reference .graphify and TypeScript runtime proof
- review and commit recommendation outputs remain advisory
