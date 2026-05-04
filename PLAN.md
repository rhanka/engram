# Upstream `0.7.4` Catch-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the TypeScript fork from published `graphifyy@0.5.6` to a verified parity target of upstream Python Graphify `v0.7.4`, while preserving intentional TypeScript deltas and treating `code-review-graph` as an additive review-feature source instead of a version driver.

**Architecture:** Catch-up is traceability-first. Lock live upstream refs, audit each upstream release line conservatively, implement in cohesive functional lots, and publish the TypeScript package under the upstream Graphify version only after every active row is either `covered`, `intentional-delta`, `deferred`, `rejected`, or `n/a`. `code-review-graph` stable remains a separate source lock for review features and must not force the npm version.

**Tech Stack:** TypeScript, Node.js 20+, Vitest, Graphify CLI/runtime, GitHub Actions, remote GitHub release metadata, `UPSTREAM_GAP.md`, `spec/SPEC_UPSTREAM_TRACEABILITY.md`.

---

## Current Source Locks

- [x] Current TypeScript baseline: `main` at `1f30efa` (`graphifyy@0.5.6`).
- [x] Closed Python `v5` parity line: `upstream/v5` at `f755aca58f36771923cebcc8f85f2eef6178a105`.
- [x] Active Python source lock: `upstream/v6` observed at `f81e3bc2154d21062f56f9e4ec9f923dfe7d128e`.
- [x] Active Python parity target: remote tag `v0.7.4` at `f81e3bc2154d21062f56f9e4ec9f923dfe7d128e`, published `2026-05-04T11:40:44Z`.
- [x] Stable CRG reference: remote tag `v2.3.2` at `db2d2df789c25a101e33477b898c1840fb4c7bc7`, published `2026-04-14T13:28:19Z`.
- [x] Exploratory CRG head: remote `main` at `0919071a9ba353e604981059e99ee2ed98768092`, currently `96` commits ahead of `v2.3.2`.
- [x] Versioning rule: Python Graphify drives parity version targets; CRG never drives npm package version.

## Release Policy

- [ ] Do not publish `0.6.x` or `0.7.x` from this branch until the corresponding rows in `UPSTREAM_GAP.md` are closed with evidence.
- [ ] If interim validation is needed, publish prereleases only (`0.7.4-rc.N` preferred) rather than new stable numbers that imply parity we do not yet have.
- [ ] Promote to stable `0.7.4` only after the final release gate in this file is complete.
- [ ] Treat upstream Python `v1.0.0` as `deferred` until a separate traceability pass proves that the active upstream release train has actually moved beyond `v6` / `0.7.x`.
- [ ] Keep this catch-up TypeScript-only: do not add new Python runtime dependencies, Python toolchains, or Python-based feature implementations while closing `0.6.x` / `0.7.x` parity.

## Task 0: Reset Traceability Baseline

**Files:**
- Modify: `PLAN.md`
- Modify: `UPSTREAM_GAP.md`
- Modify: `spec/SPEC_UPSTREAM_TRACEABILITY.md`

- [x] Replace the obsolete implementation plan with this `0.7.4` catch-up plan.
- [x] Update both traceability docs to record `graphifyy@0.5.6` as the current TypeScript baseline.
- [x] Update both traceability docs to lock `upstream/v6` and remote tag `v0.7.4`.
- [x] Update both traceability docs to keep CRG stable on `v2.3.2` and mark CRG `main` as exploratory/deferred.
- [x] State explicitly that CRG is additive and does not drive npm version numbering.
- [x] Commit this baseline reset as a standalone docs/plan change before implementation lots begin.

## Task 1: Structured Inputs, Query Precision, And Inventory Semantics (`0.6.0` to `0.6.2`)

**Files:**
- Modify: `UPSTREAM_GAP.md`
- Modify: `spec/SPEC_UPSTREAM_TRACEABILITY.md`
- Modify as needed: parser, detect, query, update, language-surface files/tests

- [x] Audit `v0.6.0` SQL AST extraction and YAML indexing against the current TypeScript parser surface.
- [x] Decide whether SQL extraction is in-scope for this parity target or an explicit `deferred` delta.
- [x] Audit `v0.6.1` `.graphifyignore` semantics, anchored pattern handling, and hermetic non-VCS scan behavior against the current TypeScript ignore engine.
- [x] Audit `v0.6.2` exact-match query ranking, content-hash-aware `update`, R support, and shebang-based shell detection.
- [x] Mark each audited row in `UPSTREAM_GAP.md` with evidence: test name, verification command, or explicit intentional delta note.
- [x] Commit this lot with only `0.6.0` to `0.6.2` traceability closures.

## Task 2: Incremental Rebuild Reliability, Hooks, And Platform Surface (`0.6.3` to `0.6.6`)

**Files:**
- Modify: `UPSTREAM_GAP.md`
- Modify: `spec/SPEC_UPSTREAM_TRACEABILITY.md`
- Modify as needed: update/watch/hook runtime, installers, wiki/export, platform skills/tests

Progress note:
- covered in this lot so far: semantic-node preservation during `update`, detached git-hook rebuilds, oversized `cluster-only` HTML guard, Codex `hook-check`, `graphify update --force`
- covered/deferred in this lot so far: wiki stale clearing, Windows-safe wiki filenames, Pi-agent install decision (`deferred`)
- covered in this lot so far: community checkbox multi-select HTML controls
- covered in this lot so far: ambiguous short-name call suppression
- covered/deferred in this lot so far: Kotlin call-edge parity decision (`deferred` until a wasm-compatible Kotlin grammar strategy exists in the TS runtime)

- [x] Audit `v0.6.3` semantic-node preservation during `update`, async detached hooks, common-name suppression in god nodes, and `cluster-only` large-graph guard.
- [x] Audit `v0.6.4` and `v0.6.5` Codex/Windows hook portability and `graphify update --force`.
- [x] Audit `v0.6.6` Pi-agent installer support and decide whether it is `covered`, `deferred`, or `rejected` for the TypeScript product line.
- [x] Record every installer/platform decision as either parity, intentional delta, or explicit deferment.
- [x] Commit this lot with only `0.6.3` to `0.6.6` closures and associated tests.

## Task 3: Visualization, Ignore Semantics, And Portable Output Routing (`0.6.7` to `0.6.9`)

**Files:**
- Modify: `UPSTREAM_GAP.md`
- Modify: `spec/SPEC_UPSTREAM_TRACEABILITY.md`
- Modify as needed: HTML/tree/export surfaces, chunking/runtime, ignore handling, installers, report logic, portable artifact paths/tests

Progress note:
- covered in this lot so far: `graphify tree` CLI, local JS/TS `import()` extraction, directory-safe semantic-cache file guards
- covered in this lot so far: `.graphifyignore` negation semantics, Antigravity workflow frontmatter, and default omission of thin communities from `GRAPH_REPORT.md`
- still open in this lot: token-aware semantic chunking policy, MCP context-filter parity, and the final `GRAPHIFY_OUT` decision against the `.graphify/` contract

- [ ] Audit `v0.6.7` tree view, token-aware chunking, MCP context filters, dynamic `import()` extraction, and directory-safe semantic cache writes.
- [ ] Audit `v0.6.8` `.graphifyignore` negation handling, Antigravity workflow frontmatter, Gemini/Codex hook fixes, and thin-community omission in reports.
- [ ] Audit `v0.6.9` slash-normalized `source_file`, two-phase community re-splitting, VS Code Copilot instruction changes, `GRAPHIFY_OUT`, and Antigravity reinstall behavior.
- [ ] Decide whether `GRAPHIFY_OUT` is compatible with the TypeScript `.graphify/` contract or should remain an `intentional-delta` / `rejected` feature.
- [ ] Commit this lot with only `0.6.7` to `0.6.9` closures and associated tests.

## Task 4: Multi-Developer Graph Lifecycle (`0.7.0`)

**Files:**
- Modify: `UPSTREAM_GAP.md`
- Modify: `spec/SPEC_UPSTREAM_TRACEABILITY.md`
- Modify as needed: hook installer, merge-driver handling, cache hashing, freshness metadata, watch/update/runtime/tests

- [ ] Audit merge-driver support for `graph.json` and decide how it maps to the TypeScript `.graphify/graph.json` lifecycle.
- [ ] Audit deterministic community IDs against the current TypeScript clustering implementation and output stability.
- [ ] Audit content-only cache hashing for rename resilience.
- [ ] Audit graph freshness signaling against the current `.graphify` metadata and report contract.
- [ ] Audit mixed code/doc change handling in watch/update flows.
- [ ] Commit this lot with only `0.7.0` closures and associated tests.

## Task 5: Parser Robustness, Export Surface, And Headless Extraction (`0.7.1` to `0.7.4`)

**Files:**
- Modify: `UPSTREAM_GAP.md`
- Modify: `spec/SPEC_UPSTREAM_TRACEABILITY.md`
- Modify as needed: wiki/export sanitization, TS/Svelte import resolution, recursion safety, export subcommands, language parsers, assistant/runtime extraction commands, skills/tests

- [ ] Audit `v0.7.1` Obsidian tag sanitization, extended `tsconfig` alias resolution, Svelte template-layer dynamic imports, and recursion safety on deep ASTs.
- [ ] Audit `v0.7.2` Fortran support, export CLI subcommands, skill size reduction, and large-graph aggregation.
- [ ] Audit `v0.7.3` `graphify extract` and decide whether it maps to the TypeScript assistant/runtime model as `covered`, `intentional-delta`, or `deferred`, without introducing any Python dependency.
- [ ] Audit `v0.7.4` JSONC `tsconfig` parsing and aliased Svelte dynamic-import resolution.
- [ ] Commit this lot with only `0.7.1` to `0.7.4` closures and associated tests.

## Task 6: CRG Guardrail During The `0.7.4` Catch-up

**Files:**
- Modify: `UPSTREAM_GAP.md`
- Modify: `spec/SPEC_UPSTREAM_TRACEABILITY.md`

- [ ] Keep CRG stable source lock at `v2.3.2` throughout the `0.7.4` catch-up.
- [ ] Record CRG `main` drift only as exploratory backlog input, not as a blocker to releasing `0.7.4`.
- [ ] If a CRG-main feature is adopted during this catch-up, cite it as an additive TypeScript delta rather than as a parity requirement for the Python line.

## Task 7: Release Preparation For `0.7.4`

**Files:**
- Modify: `UPSTREAM_GAP.md`
- Modify: `spec/SPEC_UPSTREAM_TRACEABILITY.md`
- Modify as needed: `package.json`, `package-lock.json`, release docs, generated `.graphify` artifacts

- [ ] Verify every active `0.6.x` and `0.7.x` row in `UPSTREAM_GAP.md` is closed with `covered`, `intentional-delta`, `deferred`, `rejected`, or `n/a`.
- [ ] Confirm `spec/SPEC_UPSTREAM_TRACEABILITY.md` matches the final state exactly.
- [ ] Run the release verification commands listed below on the implementation branch.
- [ ] Bump the package version to `0.7.4` only after the release gate passes.
- [ ] Regenerate `.graphify` and commit only the portable, tracked artifacts.
- [ ] Publish `graphifyy@0.7.4`, update local installs, and record the release in both traceability documents.

## Release Gate

- [ ] `git diff --check`
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm test`
- [ ] `npm run test:smoke` whenever runtime/package behavior changes
- [ ] `npx graphify hook-rebuild`
- [ ] `node dist/cli.js portable-check .graphify`
- [ ] package-level UAT from a tarball install
- [ ] GitHub Actions release and post-publish install checks pass

## Branching And Commit Rules

- [ ] Use one cohesive commit per implemented parity lot, plus one graph-artifact refresh commit only when needed.
- [ ] Update `UPSTREAM_GAP.md` and `spec/SPEC_UPSTREAM_TRACEABILITY.md` first or in the same commit as the implementation they justify.
- [ ] Never mark a row `covered` without a test name, verification command, or an explicit intentional-delta rationale in the docs.
- [ ] Never use CRG version numbers to rename the npm package release line.
