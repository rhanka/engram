# Upstream Dual Catch-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover high-value concepts from Safi Python Graphify and `tirth8205/code-review-graph` while preserving TypeScript Graphify's `.graphify/`, multimodal, lifecycle, review, and profile/dataprep deltas.

**Architecture:** Treat Safi Python Graphify `v4` as the lineage/parity source and `code-review-graph` as a review-oriented reference. Implement future work as additive TypeScript features over existing `graph.json` and Graphology surfaces; do not switch to Python, SQLite, embeddings, or review-only behavior by default.

**Tech Stack:** TypeScript, Node.js 20+, Graphology, existing Graphify skill runtime, existing `.graphify/` state, Vitest. Heavy optional dependencies require a separate spec and explicit opt-in.

---

## Study Branch Context

- [x] Worktree: `.worktrees/spec-upstream-dual-catchup-2026-04`
- [x] Branch: `spec/upstream-dual-catchup-2026-04`
- [x] Base: local `main@40ef55b98c799bccdcee72cddb2930c2b1d795c5`
- [x] Spec: `spec/SPEC_UPSTREAM_DUAL_CATCHUP_2026_04.md`
- [x] Safi Python Graphify refs inspected: `v4@6c8f21272c2343c4c044e3ea8a53459599f2c838`, `v0.4.23@8d908c5d43d079579604a82873fd7cff33a1b343`, `main@494f519bf43ea8243fba8c40a4e72a1071a74395`
- [x] code-review-graph refs inspected: `v2.3.2@db2d2df789c25a101e33477b898c1840fb4c7bc7`, `main@b0f8527087b5b3287f648da039a94c3badc7a143`
- [x] Local conductor branch delta noted: `feat/ontology-dataprep-profiles@4790d162e4e942ea812e97d358b43d6da782bbb5`

## Guardrails

- [ ] Keep Graphify generic: code, docs, papers, images, audio/video, and profile/dataprep corpora remain first-class.
- [ ] Preserve `.graphify/` as the canonical state root and keep `graphify-out/` only as legacy migration support.
- [ ] Preserve current TypeScript additions: review commands, lifecycle metadata, PDF/OCR preflight, `faster-whisper-ts`, npm distribution, and multi-platform skill installers.
- [ ] Preserve `feat/ontology-dataprep-profiles` before implementation starts; do not overwrite that work with a `main`-only catch-up branch.
- [ ] Do not add real customer, partner, proprietary ontology, production asset, or private dataset examples.
- [ ] Do not add SQLite, embeddings, cloud providers, a VS Code extension, or other heavy dependencies without a separate opt-in spec.
- [ ] Mark every recovered feature as observed, inferred, or opportunity in traceability docs.

## Lot 0 - Source Lock And Traceability Refresh

**Files:**
- Modify: `UPSTREAM_GAP.md`
- Modify: `spec/SPEC_UPSTREAM_DUAL_CATCHUP_2026_04.md`
- Modify: `PLAN.md`

- [ ] Add a source-lock section with the exact upstream URLs and SHAs from the spec.
- [ ] Record that `safishamsi/graphify` `v4` is the active Python parity line and `main` is older by package metadata.
- [ ] Record the `git fetch upstream --tags` tag-clobber warning for `v0.3.28` and `v0.4.23`.
- [ ] Record that `code-review-graph@v2.3.2` is the stable review baseline and `main@b0f8527` contains unreleased/noisy additions.
- [ ] Add a "do not implement from stale local tags" checklist to the parity docs.
- [ ] Run `git diff --check`.
- [ ] Commit as `docs: lock dual upstream source refs`.

## Lot 1 - Safi Python v4 Drift Audit

**Files:**
- Modify: `UPSTREAM_GAP.md`
- Modify: `README.md`
- Modify: localized README files only if English README changes require sync

- [ ] Compare TypeScript `main` plus `feat/ontology-dataprep-profiles` against `safishamsi/graphify@v4`.
- [ ] Verify post-`v0.4.23` commits `04790e2`, `dc1158b`, `7a0a5ac`, and `6c8f212` are docs/logo-only.
- [ ] Decide whether to adopt `docs/logo-icon.svg` or ignore it as non-product drift.
- [ ] Confirm CLI parity for `query`, `path`, `explain`, `add`, `watch`, `update`, `cluster-only`, `wiki`, `svg`, `graphml`, `neo4j`, and `mcp`.
- [ ] Confirm TypeScript deltas remain intentional for `.graphify/`, Graphology/Louvain, PDF/OCR, `faster-whisper-ts`, lifecycle metadata, and review commands.
- [ ] Run `npm run lint`, `npm run build`, `npm test`, `git diff --check`.
- [ ] If code changed, run `npx graphify hook-rebuild`.
- [ ] Commit as `docs: refresh python v4 drift audit` or an implementation-specific commit if code changes are required.

## Lot 2 - Minimal Review Context

**Files:**
- Modify: `src/review.ts` or create a focused review summary module
- Modify: `src/cli.ts`
- Modify: `src/skill-runtime.ts`
- Modify: `src/serve.ts` only if MCP exposure is required
- Modify: `tests/review*.test.ts`
- Modify: README and skill files after behavior is implemented

- [ ] Write failing tests for a compact review summary over a small fixture graph.
- [ ] Include changed files, impacted files, impacted communities, hub nodes, bridge nodes, likely test gaps, and next tool suggestion.
- [ ] Enforce bounded output with a default max-node/max-chain budget.
- [ ] Implement using current Graphology graph data only; do not add SQLite or embeddings.
- [ ] Expose through either `review-analysis --minimal` or a new clearly named command.
- [ ] Run targeted tests for review modules.
- [ ] Run `npm run lint`, `npm run build`, `npm test`, `npx graphify hook-rebuild`, `git diff --check`.
- [ ] Commit as `feat(review): add minimal graph review context`.

## Lot 3 - Changed-range Mapping And Risk Scoring

**Files:**
- Modify: `src/review-analysis.ts`
- Modify or create: `src/git-diff.ts`
- Modify: `src/cli.ts`
- Modify: `tests/review-analysis.test.ts`

- [ ] Add tests for parsing `git diff --unified=0` with additions, deletions, renames, and binary-file fallbacks.
- [ ] Map changed line ranges to nodes by `source_file` and `source_location` when available.
- [ ] Fall back to file-level changed nodes when source locations are absent or non-standard.
- [ ] Score review risk with graph spread, community spread, hub/bridge count, inferred/ambiguous edges, and test-gap hints.
- [ ] Reject unsafe git refs using the existing git/security helpers.
- [ ] Run targeted review and git tests.
- [ ] Run `npm run lint`, `npm run build`, `npm test`, `npx graphify hook-rebuild`, `git diff --check`.
- [ ] Commit as `feat(review): map changed ranges to graph risk`.

## Lot 4 - Flow Snapshots

**Files:**
- Create: `src/flows.ts`
- Create: `tests/flows.test.ts`
- Modify: `src/review-analysis.ts`
- Modify: `src/report.ts`
- Modify: `src/wiki.ts` only if report sections are ready

- [ ] Define TypeScript flow snapshot types derived from existing Graphify nodes and edges.
- [ ] Add tests for entrypoint heuristics: `main`, handlers, tests, CLI-like functions, and route-like names.
- [ ] Traverse existing `calls` edges with a safe depth/node cap.
- [ ] Compute flow criticality without a database or external dependency.
- [ ] Surface affected flows in review analysis output.
- [ ] Keep flow snapshots optional and recomputable from `graph.json`.
- [ ] Run targeted flow/review/report tests.
- [ ] Run `npm run lint`, `npm run build`, `npm test`, `npx graphify hook-rebuild`, `git diff --check`.
- [ ] Commit as `feat(review): derive flow snapshots from graph edges`.

## Lot 5 - Report, Wiki, And Visualization Enrichment

**Files:**
- Modify: `src/report.ts`
- Modify: `src/wiki.ts`
- Modify: `src/html-export.ts` and/or `src/export.ts`
- Modify: `tests/report.test.ts`
- Modify: `tests/wiki.test.ts`
- Modify or create: HTML export tests

- [ ] Add report sections for review risk and affected flows only when the analysis data exists.
- [ ] Add wiki sections for flow/risk context without replacing existing community and god-node articles.
- [ ] Prototype large-graph aggregate HTML mode using current HTML exporter.
- [ ] Preserve safe large-graph behavior: `graph.json` and `GRAPH_REPORT.md` must still write if HTML is skipped.
- [ ] Avoid a full D3/extension rewrite unless a separate visual spec approves it.
- [ ] Run report/wiki/export tests.
- [ ] Run `npm run lint`, `npm run build`, `npm test`, `npx graphify hook-rebuild`, `git diff --check`.
- [ ] Commit as `feat(output): add optional review flow summaries`.

## Lot 6 - Language And Input Triage

**Files:**
- Modify: `src/detect.ts`
- Modify: `src/extract.ts`
- Modify: `tests/language-surface.test.ts`
- Add fixture tests only for selected languages

- [ ] Create a decision table for CRG-only inputs: notebooks, Bash/Shell, R, Solidity, Perl/XS, ReScript, GDScript, Luau.
- [ ] Prioritize `.ipynb` notebook parsing if it can be implemented with JSON parsing and no runtime notebook dependency.
- [ ] Add one language/input per commit with detection and extraction tests.
- [ ] Reject blanket language imports that require broad new parser dependency bundles.
- [ ] Keep every fixture synthetic and generic.
- [ ] Run language tests after each selected input.
- [ ] Run `npm run lint`, `npm run build`, `npm test`, `npx graphify hook-rebuild`, `git diff --check`.
- [ ] Commit each selected surface as `feat(extract): add <input> graph extraction`.

## Lot 7 - Platform Installer Triage

**Files:**
- Modify: `src/cli.ts`
- Modify or create: `src/skills/*`
- Modify: `tests/skills.test.ts`
- Modify: README platform tables

- [ ] Review CRG platform install contracts for Qwen, Qoder, Windsurf, Zed, and Continue from primary sources.
- [ ] Add only stable, lightweight instruction/MCP config targets.
- [ ] Keep Codex `$graphify` and `.graphify/` instructions canonical.
- [ ] Add dry-run/mutation preview tests for every new platform.
- [ ] Do not add platform support that requires a proprietary binary or undocumented config path.
- [ ] Run skill/CLI tests.
- [ ] Run `npm run lint`, `npm run build`, `npm test`, `npx graphify hook-rebuild`, `git diff --check`.
- [ ] Commit as `feat(install): add selected assistant platform targets`.

## Lot 8 - Profile/Dataprep Preservation Merge

**Files:**
- Merge/rebase from `feat/ontology-dataprep-profiles` before implementation lots that touch CLI, runtime, paths, cache, skills, or README.
- Modify conflict files only as needed.

- [ ] Create a product implementation branch from the correct base after this study branch is reviewed.
- [ ] Bring in `feat/ontology-dataprep-profiles@4790d16` or its successor before review/flow changes.
- [ ] Resolve overlaps in `src/cli.ts`, `src/skill-runtime.ts`, `src/paths.ts`, `src/cache.ts`, `src/types.ts`, README, and skill files.
- [ ] Verify profile activation remains explicit: discovered config, `--config`, or `--profile`.
- [ ] Verify no profile artifacts are written when no profile/config is active.
- [ ] Run profile tests, cache tests, CLI runtime tests, skills tests, lint, build, full test suite, `npx graphify hook-rebuild`, and `git diff --check`.
- [ ] Commit as `chore: preserve profile dataprep before upstream catch-up`.

## Lot 9 - Deferred Heavy Features

**Files:**
- Create separate specs under `spec/` before implementation.

- [ ] Write a separate embeddings spec before adding local or cloud embedding providers.
- [ ] Write a separate storage/index spec before adding SQLite or any persistent sidecar database.
- [ ] Write a separate multi-repo registry spec before adding cross-repo search.
- [ ] Write a separate VS Code extension spec before adding an editor extension package.
- [ ] Require privacy, dependency, install, CI, and opt-in UAT criteria in each heavy-feature spec.
- [ ] Do not implement these features in the dual catch-up branch.

## Release Gate For Any Future Product Catch-up

- [ ] Source-lock table references exact upstream commits and tags.
- [ ] Every feature copied from an upstream has a traceability row and test evidence.
- [ ] `npm run lint` passes.
- [ ] `npm run build` passes.
- [ ] `npm test` passes.
- [ ] `npm run test:smoke` passes when packaging behavior changes.
- [ ] `npx graphify hook-rebuild` runs after code changes.
- [ ] `git diff --check` has no output.
- [ ] README and skill docs mention only implemented behavior.
- [ ] No real/proprietary examples appear in docs, tests, fixtures, or package assets.

---

# Graphify 0.4.23 Upstream Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the TypeScript port to conceptual parity with upstream Python Graphify `v0.4.23` while preserving all TypeScript-only additions shipped through `0.3.29`.

**Architecture:** Treat upstream `safishamsi/graphify@v4` as the behavioral source and port user-facing behavior into the existing TypeScript runtime. Preserve `.graphify/`, lifecycle metadata, review workflows, `faster-whisper-ts`, PDF/Mistral OCR, trusted npm publishing, and the fork narrative as intentional product deltas.

**Tech Stack:** TypeScript, Node.js 20+, graphology, web-tree-sitter/WASM where available, regex fallback extractors, Vitest, GitHub Actions, npm trusted publishing.

---

## Current Snapshot

- [x] PR `#4` (`Release 0.3.29 with TypeScript faster-whisper runtime`) is merged into `v3-typescript` by merge commit `83ffcb2`.
- [x] PR `#5` (`Guard npm publish behind merged release tags`) is merged into `v3-typescript` by merge commit `359d652`.
- [x] Parity branch `chore/upstream-v4-0.4.23-parity` was created from `origin/v3-typescript@359d652` and merged by PR `#6`.
- [x] Current npm publication is `graphifyy@0.4.23`.
- [x] Upstream parity target is Python `upstream/v4` tag `v0.4.23` at `8d908c5`.
- [x] `UPSTREAM_GAP.md` is the source of truth for version-by-version traceability.

## Non-Negotiable Guardrails

- [x] Do not delete or regress `.graphify/` canonical state root and `graphify-out/` migration support.
- [x] Do not delete or regress branch/worktree lifecycle metadata.
- [x] Do not delete or regress `summary`, `review-delta`, `review-analysis`, `review-eval`, or `recommend-commits`.
- [x] Do not replace TypeScript `faster-whisper-ts` with Python faster-whisper.
- [x] Do not delete or regress PDF preflight and optional `mistral-ocr`.
- [x] Keep npm trusted publishing guarded by merged release tags.
- [x] Keep fork narrative and code-review-graph-inspired additions in README/specs.
- [x] After every code-changing lot run targeted tests, `npm run lint`, `npm run build`, `npm test`, `npx graphify hook-rebuild`, and `git diff --check`.
- [x] Mark `UPSTREAM_GAP.md` rows `covered` only after tests or explicit verification prove the row.
- [x] Do not bump to `0.4.23` until all active v4 rows are `covered`, `n/a`, or `intentional-delta`.

## Lot 0 - Traceability Bootstrap

**Files:**
- Modify: `PLAN.md`
- Modify: `UPSTREAM_GAP.md`

- [x] **Step 0.1: Merge `0.3.29` PR before parity work**

Verified:

```text
PR #4 state=MERGED
mergeCommit=83ffcb2
```

- [x] **Step 0.2: Merge release-guard PR before parity work**

Verified:

```text
PR #5 state=MERGED
mergeCommit=359d652
```

- [x] **Step 0.3: Create parity branch from corrected product branch**

Run:

```bash
git switch -c chore/upstream-v4-0.4.23-parity origin/v3-typescript
```

- [x] **Step 0.4: Add v4 parity rows**

`UPSTREAM_GAP.md` now tracks `v0.4.0` through `v0.4.23` with status, plan lot, and catch-up action.

- [x] **Step 0.5: Verify docs-only diff**

Run:

```bash
git diff --check
```

Expected: no output.

- [x] **Step 0.6: Commit traceability bootstrap**

Run:

```bash
git add PLAN.md UPSTREAM_GAP.md
git commit -m "plan(v4-parity): target upstream v0.4.23"
```

## Lot 1 - Input And Language Surface Parity

**Upstream refs:** `v0.4.3`, `v0.4.7`, `v0.4.9`, `v0.4.13`, `v0.4.15`, `v0.4.16`, `v0.4.22`, `v0.4.23`

**Files:**
- Modify: `src/detect.ts`
- Modify: `src/extract.ts`
- Modify: `tests/detect.test.ts`
- Modify or create: extractor fixture tests under `tests/`
- Modify: `UPSTREAM_GAP.md`

- [x] **Step 1.1: Add failing detection tests for missing extensions**

Add tests proving these files are collected/classified:

```text
component.vue
component.svelte
template.blade.php
main.dart
module.v
module.sv
script.mjs
template.ejs
notes.mdx
page.html
```

Run:

```bash
npx vitest run tests/detect.test.ts
```

Expected before implementation: at least one new assertion fails for each missing extension group.

- [x] **Step 1.2: Implement detection mapping**

Update extension tables and language routing so:

```text
.vue, .svelte, .mjs, .ejs => code/web inputs
.blade.php => PHP/Blade code input
.dart => Dart code input
.v, .sv => Verilog/SystemVerilog code input
.mdx, .html => document inputs
```

- [x] **Step 1.3: Add extraction fixtures**

Create or extend tests proving extractor output has stable nodes for Vue/Svelte, Blade, Dart, Verilog/SystemVerilog, MJS/EJS, MDX, and HTML.

Run:

```bash
npx vitest run tests/detect.test.ts tests/extract-call-confidence.test.ts tests/pipeline.test.ts
```

- [x] **Step 1.4: Update traceability**

Mark these rows covered or intentional-delta as appropriate:

```text
v0.4.3, v0.4.7, v0.4.9, v0.4.13, v0.4.15, v0.4.16, v0.4.22, v0.4.23
```

- [x] **Step 1.5: Full verification and commit**

Run:

```bash
npm run lint
npm run build
npm test
npx graphify hook-rebuild
git diff --check
```

Commit:

```bash
git add src/detect.ts src/extract.ts tests UPSTREAM_GAP.md .graphify
git commit -m "feat(v4-parity): add upstream language surface coverage"
```

## Lot 2 - Go Import Node Collision

**Upstream refs:** `v0.4.23`, issue `#431`

**Files:**
- Modify: `src/extract.ts`
- Modify or create: Go extractor regression test under `tests/`
- Modify: `UPSTREAM_GAP.md`

- [x] **Step 2.1: Add failing Go collision test**

Create a fixture with:

```text
context.go
main.go importing "context"
```

Assert the import node ID cannot collide with the local `context.go` node.

Run:

```bash
npx vitest run tests/extract-call-confidence.test.ts
```

Expected before implementation: import edge targets the wrong or ambiguous node.

- [x] **Step 2.2: Prefix Go package import IDs**

Update Go import extraction so package imports use a stable namespace such as:

```text
go_pkg_context
go_pkg_github_com_owner_pkg
```

- [x] **Step 2.3: Verify and commit**

Run:

```bash
npx vitest run tests/extract-call-confidence.test.ts
npm run lint
npm run build
npm test
npx graphify hook-rebuild
git diff --check
```

Commit:

```bash
git add src/extract.ts tests UPSTREAM_GAP.md .graphify
git commit -m "fix(v4-parity): avoid Go import node collisions"
```

## Lot 3 - Safe HTML Export In Runtime Commands

**Upstream refs:** `v0.4.20`, `v0.4.23`, issue `#432`

**Files:**
- Modify: `src/pipeline.ts`
- Modify: `src/skill-runtime.ts`
- Modify or create: runtime/export regression tests under `tests/`
- Modify: `UPSTREAM_GAP.md`

- [x] **Step 3.1: Add failing large-graph HTML test**

Create a regression where HTML export throws but `graph.json` and `GRAPH_REPORT.md` still write successfully.

Run:

```bash
npx vitest run tests/pipeline.test.ts tests/serve.test.ts tests/public-api.test.ts
```

- [x] **Step 3.2: Wrap direct runtime `toHtml()` call sites**

Ensure `build`, `update`, `cluster-only`, and skill-runtime paths treat HTML export as best-effort:

```text
graph.json survives
GRAPH_REPORT.md survives
stale graph.html is removed or clearly not refreshed
warning is emitted
process exits successfully
```

- [x] **Step 3.3: Verify and commit**

Run:

```bash
npx vitest run tests/pipeline.test.ts tests/serve.test.ts tests/public-api.test.ts
npm run lint
npm run build
npm test
npx graphify hook-rebuild
git diff --check
```

Commit:

```bash
git add src/pipeline.ts src/skill-runtime.ts tests UPSTREAM_GAP.md .graphify
git commit -m "fix(v4-parity): keep graph artifacts when html export fails"
```

## Lot 4 - Search, Report, And Compatibility Guards

**Upstream refs:** `v0.4.9`, `v0.4.13`, `v0.4.15`

**Files:**
- Modify: `src/analyze.ts`
- Modify: `src/report.ts`
- Modify: `src/export.ts`
- Modify tests under `tests/`
- Modify: `UPSTREAM_GAP.md`

- [x] **Step 4.1: Add diacritic search regression**

Assert search/lookup behavior treats `Résumé` and `Resume` as matchable where upstream added normalized labels.

- [x] **Step 4.2: Add null-label and hyperedge export regressions**

Assert reports and HTML/canvas export do not crash on missing labels and do not double-apply device-pixel-ratio transforms.

- [x] **Step 4.3: Decide `edges` vs `degree` compatibility**

If changing `godNodes()` from `edges` to `degree` would break the TS public API, keep `edges` and add `degree` as compatibility alias.

- [x] **Step 4.4: Verify and commit**

Run:

```bash
npx vitest run tests/analyze.test.ts tests/report.test.ts tests/export.test.ts
npm run lint
npm run build
npm test
npx graphify hook-rebuild
git diff --check
```

Commit:

```bash
git add src/analyze.ts src/report.ts src/export.ts tests UPSTREAM_GAP.md .graphify
git commit -m "fix(v4-parity): add normalized report compatibility guards"
```

## Lot 5 - Platform Installer Parity

**Upstream refs:** `v0.4.6`, `v0.4.9`, `v0.4.12`, `v0.4.15`, `v0.4.19`, `v0.4.23`

**Files:**
- Modify: `src/cli.ts`
- Modify: `src/skills/*`
- Modify: `tests/install-preview.test.ts`
- Modify: `tests/cli.test.ts`
- Modify: `README.md`
- Modify translated READMEs if present
- Modify: `UPSTREAM_GAP.md`

- [x] **Step 5.1: Add install-preview tests for missing platforms**

Add preview assertions for:

```text
antigravity
hermes
kiro
vscode-copilot-chat
```

- [x] **Step 5.2: Implement platform templates**

Add install/uninstall/preview support while keeping generated instructions free of platform-inappropriate Claude-only wording.

- [x] **Step 5.3: Refresh version stamp behavior**

Ensure install refreshes stale `.graphify_version` files across known platform skill directories.

- [x] **Step 5.4: Verify and commit**

Run:

```bash
npx vitest run tests/install-preview.test.ts tests/cli.test.ts tests/codex-integration.test.ts tests/copilot-integration.test.ts
npm run lint
npm run build
npm test
npx graphify hook-rebuild
git diff --check
```

Commit:

```bash
git add src/cli.ts src/skills tests README.md UPSTREAM_GAP.md .graphify
git commit -m "feat(v4-parity): add missing upstream assistant platforms"
```

## Lot 6 - Runtime Command Audit

**Upstream refs:** `v0.4.5`, `v0.4.10`, `v0.4.11`, `v0.4.14`, `v0.4.20`, `v0.4.21`

**Files:**
- Modify: `src/cli.ts`
- Modify: `src/mcp.ts`
- Modify: `src/skill-runtime.ts`
- Modify command/runtime tests under `tests/`
- Modify: `UPSTREAM_GAP.md`

- [x] **Step 6.1: Verify MCP blank-line handling**

Add or confirm a test where stdio receives an empty line and does not crash.

- [x] **Step 6.2: Verify bare command parity**

Confirm these commands work without Python-specific wrappers:

```text
path
explain
add
watch
update
cluster-only
```

- [x] **Step 6.3: Verify update/cluster-only artifact behavior**

Assert `graph.html` is emitted when export succeeds and does not block JSON/report artifacts when export fails.

- [x] **Step 6.4: Verify and commit**

Run:

```bash
npx vitest run tests/cli.test.ts tests/mcp.test.ts tests/skills.test.ts tests/pipeline.test.ts
npm run lint
npm run build
npm test
npx graphify hook-rebuild
git diff --check
```

Commit:

```bash
git add src/cli.ts src/mcp.ts src/skill-runtime.ts tests UPSTREAM_GAP.md .graphify
git commit -m "test(v4-parity): lock runtime command parity"
```

## Lot 7 - Documentation And Fork Narrative

**Upstream refs:** README/docs through `v0.4.23`

**Files:**
- Modify: `README.md`
- Modify translated README files if present
- Modify: `spec/*.md`
- Modify: `UPSTREAM_GAP.md`
- Modify: `PLAN.md`

- [x] **Step 7.1: Refresh README without disrupting fork narrative**

Document imported upstream parity features, retained TS deltas, npm install flow, and release-tag safety.

- [x] **Step 7.2: Refresh translations**

Apply equivalent high-level changes to translated READMEs while preserving localized structure.

- [x] **Step 7.3: Refresh specs**

Update specs to separate:

```text
upstream Python parity
TypeScript product deltas
code-review-graph-inspired additions
release/publishing contract
```

- [x] **Step 7.4: Verify and commit**

Run:

```bash
git diff --check
```

Commit:

```bash
git add README.md spec PLAN.md UPSTREAM_GAP.md
git commit -m "docs(v4-parity): document upstream parity and fork deltas"
```

## Lot 8 - Version Bump, Release PR, And Publication

**Files:**
- Modify: `src/serve.ts`
- Modify: `tests/serve.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify generated skill/version files if present
- Modify: `PLAN.md`
- Modify: `UPSTREAM_GAP.md`

- [x] **Step 8.1: Close all active gap rows**

Before version bump, ensure no active v4 row remains:

```text
missing
partial
needs-audit
```

- [x] **Step 8.2: Bump package version to `0.4.23`**

Run:

```bash
npm version 0.4.23 --no-git-tag-version
```

- [x] **Step 8.3: Final local verification**

Run:

```bash
npm run lint
npm run build
npm test
npm run test:smoke
npx graphify hook-rebuild
git diff --check
```

- [x] **Step 8.4: Commit release prep**

Run:

```bash
git add src/serve.ts tests/serve.test.ts package.json package-lock.json PLAN.md UPSTREAM_GAP.md .graphify
git commit -m "release(v4-parity): prepare 0.4.23"
```

- [x] **Step 8.5: Push branch and open PR**

Run:

```bash
git push -u origin chore/upstream-v4-0.4.23-parity
gh pr create --repo rhanka/graphify --base v3-typescript --head chore/upstream-v4-0.4.23-parity --title "Release 0.4.23 upstream parity" --body-file /tmp/graphify-0.4.23-pr.md
```

Opened PR `#6`: `https://github.com/rhanka/graphify/pull/6`.

- [x] **Step 8.6: Merge PR before tagging**

Use a merge commit, not squash, if a tag will be pushed from a branch commit.

Merged PR `#6` into `v3-typescript` by merge commit `404fc23`.

- [x] **Step 8.7: Tag only after merge**

After the release PR is merged and local `v3-typescript` is updated:

```bash
git switch v3-typescript
git pull --ff-only origin v3-typescript
git tag v0.4.23
git push origin v0.4.23
```

The CI `release-guard` must prove the tag commit is already contained in the default branch before npm publish.

Pushed tag `v0.4.23` on `v3-typescript@5a306e1`.
GitHub Actions run `24640530280` passed `release-guard`, `publish`, and `post-publish-check`.
`npm view graphifyy version` returned `0.4.23`.

## Exit Criteria

- [x] PR `#4` and PR `#5` are merged.
- [x] `UPSTREAM_GAP.md` has closed traceability from upstream Python `v0.3.18` through `v0.4.23`.
- [x] All active v4 rows are `covered`, `n/a`, or `intentional-delta`.
- [x] All non-negotiable TypeScript deltas still have tests or explicit final verification.
- [x] `npm run lint` passes.
- [x] `npm run build` passes.
- [x] `npm test` passes.
- [x] `npm run test:smoke` passes.
- [x] `npx graphify hook-rebuild` passes.
- [x] Release PR is merged before tag.
- [x] `v0.4.23` tag publish passes npm trusted publishing.
