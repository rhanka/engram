# Graphify 0.4.23 Upstream Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the TypeScript port to conceptual parity with upstream Python Graphify `v0.4.23` while preserving all TypeScript-only additions shipped through `0.3.29`.

**Architecture:** Treat upstream `safishamsi/graphify@v4` as the behavioral source and port user-facing behavior into the existing TypeScript runtime. Preserve `.graphify/`, lifecycle metadata, review workflows, `faster-whisper-ts`, PDF/Mistral OCR, trusted npm publishing, and the fork narrative as intentional product deltas.

**Tech Stack:** TypeScript, Node.js 20+, graphology, web-tree-sitter/WASM where available, regex fallback extractors, Vitest, GitHub Actions, npm trusted publishing.

---

## Current Snapshot

- [x] PR `#4` (`Release 0.3.29 with TypeScript faster-whisper runtime`) is merged into `v3-typescript` by merge commit `83ffcb2`.
- [x] PR `#5` (`Guard npm publish behind merged release tags`) is merged into `v3-typescript` by merge commit `359d652`.
- [x] Current branch is `chore/upstream-v4-0.4.23-parity`, created from `origin/v3-typescript@359d652`.
- [x] Current npm publication is `graphifyy@0.3.29`.
- [x] Upstream parity target is Python `upstream/v4` tag `v0.4.23` at `8d908c5`.
- [x] `UPSTREAM_GAP.md` is the source of truth for version-by-version traceability.

## Non-Negotiable Guardrails

- [ ] Do not delete or regress `.graphify/` canonical state root and `graphify-out/` migration support.
- [ ] Do not delete or regress branch/worktree lifecycle metadata.
- [ ] Do not delete or regress `summary`, `review-delta`, `review-analysis`, `review-eval`, or `recommend-commits`.
- [ ] Do not replace TypeScript `faster-whisper-ts` with Python faster-whisper.
- [ ] Do not delete or regress PDF preflight and optional `mistral-ocr`.
- [ ] Keep npm trusted publishing guarded by merged release tags.
- [ ] Keep fork narrative and code-review-graph-inspired additions in README/specs.
- [ ] After every code-changing lot run targeted tests, `npm run lint`, `npm run build`, `npm test`, `npx graphify hook-rebuild`, and `git diff --check`.
- [ ] Mark `UPSTREAM_GAP.md` rows `covered` only after tests or explicit verification prove the row.
- [ ] Do not bump to `0.4.23` until all active v4 rows are `covered`, `n/a`, or `intentional-delta`.

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

- [ ] **Step 2.1: Add failing Go collision test**

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

- [ ] **Step 2.2: Prefix Go package import IDs**

Update Go import extraction so package imports use a stable namespace such as:

```text
go_pkg_context
go_pkg_github_com_owner_pkg
```

- [ ] **Step 2.3: Verify and commit**

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

- [ ] **Step 3.1: Add failing large-graph HTML test**

Create a regression where HTML export throws but `graph.json` and `GRAPH_REPORT.md` still write successfully.

Run:

```bash
npx vitest run tests/pipeline.test.ts tests/serve.test.ts tests/public-api.test.ts
```

- [ ] **Step 3.2: Wrap direct runtime `toHtml()` call sites**

Ensure `build`, `update`, `cluster-only`, and skill-runtime paths treat HTML export as best-effort:

```text
graph.json survives
GRAPH_REPORT.md survives
stale graph.html is removed or clearly not refreshed
warning is emitted
process exits successfully
```

- [ ] **Step 3.3: Verify and commit**

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

- [ ] **Step 4.1: Add diacritic search regression**

Assert search/lookup behavior treats `Résumé` and `Resume` as matchable where upstream added normalized labels.

- [ ] **Step 4.2: Add null-label and hyperedge export regressions**

Assert reports and HTML/canvas export do not crash on missing labels and do not double-apply device-pixel-ratio transforms.

- [ ] **Step 4.3: Decide `edges` vs `degree` compatibility**

If changing `godNodes()` from `edges` to `degree` would break the TS public API, keep `edges` and add `degree` as compatibility alias.

- [ ] **Step 4.4: Verify and commit**

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

- [ ] **Step 5.1: Add install-preview tests for missing platforms**

Add preview assertions for:

```text
antigravity
hermes
kiro
vscode-copilot-chat
```

- [ ] **Step 5.2: Implement platform templates**

Add install/uninstall/preview support while keeping generated instructions free of platform-inappropriate Claude-only wording.

- [ ] **Step 5.3: Refresh version stamp behavior**

Ensure install refreshes stale `.graphify_version` files across known platform skill directories.

- [ ] **Step 5.4: Verify and commit**

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

- [ ] **Step 6.1: Verify MCP blank-line handling**

Add or confirm a test where stdio receives an empty line and does not crash.

- [ ] **Step 6.2: Verify bare command parity**

Confirm these commands work without Python-specific wrappers:

```text
path
explain
add
watch
update
cluster-only
```

- [ ] **Step 6.3: Verify update/cluster-only artifact behavior**

Assert `graph.html` is emitted when export succeeds and does not block JSON/report artifacts when export fails.

- [ ] **Step 6.4: Verify and commit**

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

- [ ] **Step 7.1: Refresh README without disrupting fork narrative**

Document imported upstream parity features, retained TS deltas, npm install flow, and release-tag safety.

- [ ] **Step 7.2: Refresh translations**

Apply equivalent high-level changes to translated READMEs while preserving localized structure.

- [ ] **Step 7.3: Refresh specs**

Update specs to separate:

```text
upstream Python parity
TypeScript product deltas
code-review-graph-inspired additions
release/publishing contract
```

- [ ] **Step 7.4: Verify and commit**

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
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify generated skill/version files if present
- Modify: `PLAN.md`
- Modify: `UPSTREAM_GAP.md`

- [ ] **Step 8.1: Close all active gap rows**

Before version bump, ensure no active v4 row remains:

```text
missing
partial
needs-audit
```

- [ ] **Step 8.2: Bump package version to `0.4.23`**

Run:

```bash
npm version 0.4.23 --no-git-tag-version
```

- [ ] **Step 8.3: Final local verification**

Run:

```bash
npm run lint
npm run build
npm test
npm run test:smoke
npx graphify hook-rebuild
git diff --check
```

- [ ] **Step 8.4: Commit release prep**

Run:

```bash
git add package.json package-lock.json PLAN.md UPSTREAM_GAP.md .graphify
git commit -m "release(v4-parity): prepare 0.4.23"
```

- [ ] **Step 8.5: Push branch and open PR**

Run:

```bash
git push -u origin chore/upstream-v4-0.4.23-parity
gh pr create --repo rhanka/graphify --base v3-typescript --head chore/upstream-v4-0.4.23-parity --title "Release 0.4.23 upstream parity" --body-file /tmp/graphify-0.4.23-pr.md
```

- [ ] **Step 8.6: Merge PR before tagging**

Use a merge commit, not squash, if a tag will be pushed from a branch commit.

- [ ] **Step 8.7: Tag only after merge**

After the release PR is merged and local `v3-typescript` is updated:

```bash
git switch v3-typescript
git pull --ff-only origin v3-typescript
git tag v0.4.23
git push origin v0.4.23
```

The CI `release-guard` must prove the tag commit is already contained in the default branch before npm publish.

## Exit Criteria

- [ ] PR `#4` and PR `#5` are merged.
- [ ] `UPSTREAM_GAP.md` has closed traceability from upstream Python `v0.3.18` through `v0.4.23`.
- [ ] All active v4 rows are `covered`, `n/a`, or `intentional-delta`.
- [ ] All non-negotiable TypeScript deltas still have tests or explicit final verification.
- [ ] `npm run lint` passes.
- [ ] `npm run build` passes.
- [ ] `npm test` passes.
- [ ] `npm run test:smoke` passes.
- [ ] `npx graphify hook-rebuild` passes.
- [ ] Release PR is merged before tag.
- [ ] `v0.4.23` tag publish passes npm trusted publishing.
