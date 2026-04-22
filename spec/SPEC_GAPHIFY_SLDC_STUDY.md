# SPEC_GRAPHIFY_SLDC_STUDY

## Status

This document is the completed SLDC study after implementation. It records what changed, what remained deferred, and what risks remain after moving Graphify TypeScript to the .graphify lifecycle model.

- Product branch: main
- Upstream mirror branch: v3 for the closed Python v3 baseline
- Active upstream parity target: Python v4 through v0.4.23, tracked in UPSTREAM_GAP.md
- Runtime state root: .graphify/
- Legacy fallback: graphify-out/graph.json remains readable for compatibility only
- Commit recommendations: advisory-only

## Implemented Outcomes

### 1. State Root Migration

Implemented:

- .graphify/ is the default runtime state root for producers.
- graphify-out/graph.json remains a read fallback for implicit graph consumers.
- runtime scratch files moved under the state root.
- .graphify/ is documented as local ignored state in README.md, README.zh-CN.md, and README.ja-JP.md.
- bundled skills and generated assistant instructions refer to .graphify/ artifacts.

Current canonical artifacts:

- .graphify/graph.json
- .graphify/GRAPH_REPORT.md
- .graphify/graph.html
- .graphify/cache/
- .graphify/transcripts/
- .graphify/converted/
- .graphify/wiki/
- .graphify/memory/
- .graphify/worktree.json
- .graphify/branch.json
- .graphify/needs_update

### 2. Central Path Contract

Implemented:

- src/paths.ts owns state-root resolution.
- defaultGraphPath and resolveGraphInputPath centralize default and fallback behavior.
- runtime scratch paths are modeled under .graphify/.
- default transcript and manifest paths use the central path contract.

Residual compatibility:

- legacy graphify-out read fallback exists for one compatibility window.
- graphify migrate-state provides a non-destructive graphify-out -> .graphify migration with git mv advice for tracked artifacts.
- explicit user paths are respected.

### 3. Git Hooks And Worktree Lifecycle

Implemented:

- hooks resolve git paths through git rev-parse, not .git directory assumptions.
- worktrees are supported through git-native hook path resolution.
- hook coverage includes post-commit, post-checkout, post-merge, and post-rewrite.
- hooks mark .graphify/needs_update first.
- hooks attempt non-blocking code-only rebuilds when safe.
- hook failure does not block Git operations.

Not implemented:

- semantic extraction from hooks.
- destructive stale cleanup.

### 4. Branch And Worktree Metadata

Implemented:

- .graphify/worktree.json records worktree path, git dir, common git dir, first/last seen HEAD, and last analyzed HEAD.
- .graphify/branch.json records branch name, upstream, merge-base, first/last seen HEAD, last analyzed HEAD, stale flags, stale reason, stale timestamp, and lifecycle event.
- graphify state status prints lifecycle metadata.
- graphify state prune prints a non-destructive cleanup plan.

### 5. Assistant Skill Migration

Implemented:

- Codex, Claude, Gemini, VS Code Copilot Chat, Cursor, OpenCode, Aider, Copilot CLI, OpenClaw, Factory Droid, Trae, Trae CN, Hermes, Kiro, and Google Antigravity skill docs use .graphify/.
- Codex instructions explicitly use $graphify and TypeScript runtime proof.
- Gemini instructions include custom command and MCP expectations.
- skills warn on stale .graphify/needs_update or branch metadata.
- skills prefer graphify summary before deep traversal.
- skills include review-delta, review-analysis, review-eval, and recommend-commits guidance.

### 6. README And Branch Model

Implemented:

- README.md, README.zh-CN.md, and README.ja-JP.md describe .graphify/ as local ignored state.
- README documents main as the maintained TypeScript branch, v3 as the closed upstream Python mirror, and v4/v0.4.23 as the active parity target.
- README preserves upstream attribution and TypeScript port positioning.
- README documents review surfaces, install mutation previews, new assistant platforms, and release-tag publishing safety.

### 7. Review-Oriented Graph Enhancements

Implemented:

- graphify summary / first_hop_summary
- graphify review-delta / review_delta
- graphify review-analysis / review_analysis
- graphify review-eval
- graphify recommend-commits / recommend_commits

Review additions remain projections over the graph. They do not replace Graphify's multimodal knowledge-graph identity.

### 8. Install Mutation Previews

Implemented:

- project installers print exact files and hook/MCP/plugin config before writing.
- global skill installers print exact skill file and .graphify_version marker before writing.
- preview helpers are tested through install-preview coverage.

## Deferred Items

### review-pr

Deferred until local review-delta and review-analysis contracts are stable enough for provider-specific PR integrations.

### SQLite Backend

Deferred. File-based graph state remains the default. SQLite may be evaluated later for large repositories or persisted review projections.

### Embeddings

Deferred. Graph topology and explicit semantic edges remain the current similarity mechanism.

### Editor Extension Parity

Deferred. CLI, skills, MCP, and installer surfaces are the maintained distribution path for now.

### Destructive State Cleanup

Deferred. graphify state prune is non-destructive and advisory.

### Automatic Commit Actions

Rejected for this phase. recommend-commits is advisory-only and never stages, commits, or mutates branches.

## Lessons Learned

- State migration needed to be a path-contract change first, not a scattered rename.
- Worktree support must use git rev-parse rather than filesystem assumptions.
- Assistant skills are part of the runtime contract; path migrations are incomplete until skills and generated install instructions are updated.
- Review features are safer as additive graph projections than as a product pivot.
- Commit recommendations require explicit stale/confidence reporting to avoid false authority.
- Installers need mutation previews because Graphify touches many assistant-specific files.

## Residual Risks

- Existing users with only graphify-out/ artifacts can run graphify migrate-state --dry-run, then graphify migrate-state, or follow the printed git mv plan if those artifacts are intentionally tracked.
- Optional Tree-sitter grammars may be unavailable for some fixture languages; current rebuilds tolerate known warnings for kotlin, swift, and zig fixtures.
- Semantic graph quality still depends on assistant extraction quality and cache correctness.
- Review recall metrics are only meaningful when users maintain representative review-eval cases.
- Multimodal safety surfaces whether artifacts are touched, not whether their content was perfectly interpreted.
- Local ignored AGENTS.md or CLAUDE.md can drift from generated installers if manually edited.

## Current Validation Contract

Before merging this evolution branch, run:

- npm run build
- npm test
- npx graphify hook-rebuild
- representative CLI smoke commands for review-analysis, review-eval, recommend-commits, and install preview behavior

Known acceptable hook-rebuild warnings:

- tests/fixtures/sample.kt grammar not found for kotlin
- tests/fixtures/sample.swift grammar not found for swift
- tests/fixtures/sample.zig tree-sitter-zig not available

## Final Consistency Matrix

| Topic | Current contract |
|---|---|
| State root | .graphify/ |
| Legacy path | graphify-out/ read fallback plus graphify migrate-state migration |
| Product branch | main |
| Upstream branches | v3 mirrors the closed Python baseline; v4/v0.4.23 is the active parity target |
| Distribution | npm package graphifyy |
| Transcription | TypeScript-local faster-whisper-ts + ffmpeg |
| Review mode | additive graph projection |
| Commit recommendation | advisory-only |
| Installers | mutation preview before writes |
| Release publishing | trusted npm publishing guarded by merged release tags |
| Storage | file-based Graphology artifacts |
| Deferred storage | SQLite |
| Deferred similarity | embeddings |
