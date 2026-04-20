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
- The graph remains file-based by default. SQLite and embeddings are deferred, not default architecture.

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
10. Export graph.json, GRAPH_REPORT.md, graph.html, optional wiki and export formats.

Every edge keeps provenance confidence: EXTRACTED, INFERRED, or AMBIGUOUS, with scores where available.

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

The LLM Wiki remains `.graphify/wiki/index.md`. This feature does not add MCP-specific profile tools, embeddings, databases, remote registry fetching, or a resident LLM backend.

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
- graphify <path> --neo4j
- graphify <path> --neo4j-push bolt://localhost:7687
- graphify serve .graphify/graph.json

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
- remote service or shared backend
- auto-commit or auto-stage behavior

## Acceptance Criteria

The implemented product is considered aligned with this spec when:

- npm build succeeds
- full test suite succeeds
- .graphify hook rebuild succeeds, allowing known optional fixture grammar warnings
- README and multilingual READMEs describe .graphify, main, v3/v4 upstream alignment, review features, assistant platform installers, release guards, install previews, and configured ontology dataprep profiles consistently
- assistant skills reference .graphify and TypeScript runtime proof
- review and commit recommendation outputs remain advisory
