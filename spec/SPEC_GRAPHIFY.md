# SPEC_GRAPHIFY

## Status

- Product: Graphify TypeScript port
- npm package: graphifyy@0.3.28
- Maintained product branch: v3-typescript
- Upstream alignment branch: v3, mirroring upstream Python Graphify v3
- Runtime state root: .graphify/
- Legacy read fallback: graphify-out/graph.json is still accepted for compatibility, but new writes target .graphify/

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
- markdown/text/reStructuredText: semantic extraction through assistant skill flow
- PDF: paper/document extraction through assistant skill flow
- Office docs: .docx and .xlsx conversion to markdown sidecars before semantic extraction
- images: multimodal assistant extraction
- URLs: arXiv, PDF, image, general web pages, X/Twitter, YouTube audio ingestion
- audio/video: local transcription through yt-dlp when needed, ffmpeg normalization, and sherpa-onnx-node Whisper-compatible transcription

Generated transcripts are treated as document inputs for semantic extraction.

## Runtime Artifacts

Canonical state under .graphify/:

- graph.json: serialized graph
- GRAPH_REPORT.md: human audit report and assistant first stop
- graph.html: interactive visualization unless disabled
- manifest.json and cost.json
- cache/: semantic cache
- transcripts/: downloaded/converted/transcribed media artifacts
- converted/: converted Office/docs sidecars
- memory/: saved graph-backed Q&A
- wiki/: optional agent-crawlable community wiki
- worktree.json and branch.json: lifecycle metadata
- needs_update: stale marker
- .graphify_*.json scratch files under .graphify/, not repo root

Legacy compatibility:

- graphify-out/graph.json remains a read fallback for implicit graph consumers during the compatibility window.
- graphify-out/ is not the current write target.

## Core Build Pipeline

1. Detect corpus files and classify them by type.
2. Convert supported Office files and prepare transcript-backed document inputs.
3. Extract deterministic code structure through Tree-sitter.
4. Run semantic extraction for docs, papers, images, transcripts, and non-code materials through the assistant skill contract.
5. Validate extraction JSON.
6. Merge AST and semantic extraction.
7. Build a Graphology graph.
8. Cluster with Louvain and compute cohesion.
9. Label communities and compute analysis.
10. Export graph.json, GRAPH_REPORT.md, graph.html, optional wiki and export formats.

Every edge keeps provenance confidence: EXTRACTED, INFERRED, or AMBIGUOUS, with scores where available.

## Public CLI Surfaces

Build and maintain:

- graphify <path>
- graphify <path> --directed
- graphify <path> --mode deep
- graphify <path> --update
- graphify <path> --cluster-only
- graphify <path> --watch
- graphify hook install/status/uninstall
- graphify state status/prune

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
- Aider, OpenClaw, Droid, Trae, and Trae CN write AGENTS.md instructions.

Global skill installers:

- graphify install --platform <platform> writes the platform skill file and .graphify_version marker.

All install commands now print mutation previews before writing, including exact files and hook/MCP/plugin configuration that will be touched.

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

- v3 tracks upstream Python Graphify v3 for parity analysis.
- v3-typescript is the maintained TypeScript product branch.
- The TypeScript port keeps the original assistant-skill graph workflow and MIT license attribution.

Intentional TypeScript divergence:

- npm distribution and TypeScript runtime
- .graphify local state contract
- local sherpa-onnx-node transcription instead of Python faster-whisper
- broader assistant installer matrix
- MCP tools for summary/review/recommendation
- review-mode projections inspired by code-review-graph
- install mutation previews

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
- README and multilingual READMEs describe .graphify, v3-typescript, v3 upstream mirror, review features, and install previews consistently
- assistant skills reference .graphify and TypeScript runtime proof
- review and commit recommendation outputs remain advisory
