# SPEC_CODE_REVIEW_GRAPH_OPPORUNITY

## Status

This document records what was adopted, adapted, rejected, and deferred from the cloned code-review-graph project after Graphify TypeScript evolution. It is no longer an opportunity brainstorm.

- Baseline product: Graphify TypeScript on v3-typescript
- Comparison target: code-review-graph clone
- Outcome: selected review ideas were incorporated without turning Graphify into a code-review-only product

## Product Boundary

Graphify remains a multimodal knowledge-graph product. code-review-graph is code-review-first. The adopted work is therefore a review projection over Graphify's existing graph, not a replacement product identity.

Graphify keeps:

- file-based graph artifacts
- multimodal inputs
- multi-assistant installers
- provenance/confidence labels
- assistant skill workflows
- npm TypeScript runtime

Graphify does not adopt:

- Python runtime
- SQLite as default storage
- embeddings as a baseline dependency
- review-only product positioning

## Adopted Opportunities

### Compact First-Hop Summary

Adopted as:

- buildFirstHopSummary / firstHopSummaryToText
- CLI: graphify summary --graph .graphify/graph.json
- MCP: first_hop_summary
- skill guidance to use summary before deep traversal

Reason:

- high value, low risk
- reduces assistant context cost
- applies to all graph workflows, not only review

### Review Delta

Adopted as:

- buildReviewDelta / reviewDeltaToText
- CLI: graphify review-delta
- skill runtime: review-delta
- MCP: review_delta

Implemented output:

- changed files
- impacted files
- changed nodes
- impacted nodes
- hub nodes
- bridge nodes
- likely test gaps
- high-risk dependency chains
- next best action

Reason:

- code-review-graph showed that changed-file-first graph traversal is more actionable than generic traversal for review
- Graphify already had graph data and git helpers

### Review Analysis Views

Adopted as a separate surface:

- buildReviewAnalysis / reviewAnalysisToText
- CLI: graphify review-analysis
- MCP: review_analysis
- skill runtime: review-analysis

Implemented views:

- blast radius
- impacted communities
- bridge nodes
- test-gap hints
- multimodal/doc safety

Reason:

- keeps review-delta stable while adding higher-level review UX
- makes review output actionable without changing core graph semantics

### Review Evaluation Harness

Adopted as:

- evaluateReviewAnalysis / reviewEvaluationToText
- CLI: graphify review-eval --cases <json>
- skill runtime: review-eval

Implemented metrics:

- token savings versus naive file reads
- impacted-file recall
- review summary precision
- multimodal regression safety

Reason:

- review features need measurement, not only snapshots
- JSON cases keep the harness portable and repo-local

### Install-Time Preview

Adopted as:

- platformInstallPreview
- globalSkillInstallPreview
- printed mutation previews before install writes

Implemented previews include:

- instruction files
- hook config files
- MCP config files
- plugin config files
- global skill file and .graphify_version marker

Reason:

- code-review-graph's tighter install story was worth borrowing
- Graphify has more platform targets, so previews reduce surprise

## Adapted Opportunities

### Review Mode Instead Of Review Product

Adaptation:

- code-review-graph review language is used as a projection over Graphify's graph
- Graphify still supports docs, papers, images, URL ingestion, transcripts, exports, and wiki

Why adapted:

- wholesale review-only repositioning would conflict with Graphify's broader product

### File-Based Derived Views Instead Of SQLite

Adaptation:

- review-delta, review-analysis, and review-eval compute from graph.json
- no SQLite backend is required

Why adapted:

- file-based state is inspectable, portable, npm-friendly, and assistant-friendly
- SQLite may become useful later for large review databases but is not the default architecture

### MCP Review Tools Across Assistants

Adaptation:

- MCP tools exist for compatible clients
- skills and CLI remain first-class for non-MCP assistants

Why adapted:

- Graphify supports Codex, Claude, Gemini, Copilot CLI, Aider, OpenCode, Cursor, and others
- not every platform has the same MCP UX

### Commit Recommendation As Advisory-Only

Adaptation:

- recommendation groups changed files by graph community or path
- output includes confidence and stale-state reasons
- no staging, committing, or branch mutation is performed

Why adapted:

- Graphify can suggest commit boundaries, but Git actions must remain user-controlled

### Multimodal Safety In Review

Adaptation:

- review-analysis explicitly reports multimodal/doc safety
- metrics include multimodal regression safety

Why adapted:

- Graphify's advantage over code-review-graph is that docs, images, and transcripts live in the same graph

## Rejected Or Deferred Opportunities

### SQLite Backend

Status: deferred.

Reason:

- useful for large review stores and precomputed views
- not needed for the current npm-first, file-artifact architecture
- would add migration and locking complexity

### Embeddings

Status: deferred.

Reason:

- Louvain clustering already uses graph topology
- semantic similarity can be represented as explicit graph edges
- embeddings require model/runtime choices and evaluation first

### review-pr

Status: deferred.

Reason:

- local review-delta and review-analysis contracts are now stable enough to build on
- PR-specific provider behavior should be a separate lot

### Flow Tables

Status: deferred/adapt later.

Reason:

- high-value for code-review workflows
- needs a stable flow schema and probably stronger code-level extraction before persistence

### Editor Extension Parity

Status: deferred.

Reason:

- install and CLI surfaces are now clearer
- editor-specific extension parity is a separate distribution problem

### Python Runtime Adoption

Status: rejected.

Reason:

- this repo is the maintained TypeScript port
- audio transcription is implemented through TypeScript-local sherpa-onnx-node, not Python faster-whisper

## Current Implemented Review Surface

User-facing commands:

- graphify summary
- graphify review-delta
- graphify review-analysis
- graphify review-eval
- graphify recommend-commits

MCP tools:

- first_hop_summary
- review_delta
- review_analysis
- recommend_commits

Public API:

- buildFirstHopSummary
- buildReviewDelta
- buildReviewAnalysis
- evaluateReviewAnalysis
- buildCommitRecommendation

## Residual Risks

- Review quality depends on graph freshness.
- Test-gap hints are graph-visible hints, not proof of missing tests.
- Impacted-file recall requires curated eval cases to be meaningful.
- Review-analysis can overstate risk when generated graphs contain high-degree utility nodes.
- Multimodal regression safety detects surfaced artifacts; it does not validate content correctness.

## Next Candidate Lots

- review-pr provider integration
- flow extraction and flow-aware review summaries
- persisted review summary cache
- optional SQLite prototype for large repos
- embeddings benchmark before any embedding runtime is added
