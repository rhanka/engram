# Upstream `0.7.10` Realignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the TypeScript fork from the historical `graphifyy@0.5.6` baseline through a verified parity target of upstream Python Graphify `v0.7.10`, while preserving intentional TypeScript deltas and treating `code-review-graph` as an additive review-feature source instead of a version driver.

**Architecture:** Catch-up is traceability-first. Lock live upstream refs, audit each upstream release line conservatively, implement in cohesive functional lots, and publish the TypeScript package under the upstream Graphify version only after every active row is either `covered`, `intentional-delta`, `deferred`, `rejected`, or `n/a`. `code-review-graph` stable remains a separate source lock for review features and must not force the npm version.

**Tech Stack:** TypeScript, Node.js 20+, Vitest, Graphify CLI/runtime, GitHub Actions, remote GitHub release metadata, `UPSTREAM_GAP.md`, `spec/SPEC_UPSTREAM_TRACEABILITY.md`.

---

## Current Source Locks

- [x] Current TypeScript baseline: `main` at `1f30efa` (`graphifyy@0.5.6`).
- [x] Current TypeScript package target: `graphifyy@0.7.10`.
- [x] Closed Python `v5` parity line: `upstream/v5` at `f755aca58f36771923cebcc8f85f2eef6178a105`.
- [x] Closed Python `v6` parity line: `upstream/v6` at `f81e3bc2154d21062f56f9e4ec9f923dfe7d128e` (`v0.6.9`).
- [x] Closed Python `v7` continuation lock through `0.7.4`: `upstream/v7` observed at `ee85bbf80cc6fedff0a17d5ea1da77f20da0729b`.
- [x] Effective Python `v0.7.4` code target: `26a5a35200dda6207bf6fc16afed83c71238bb65` on `upstream/v7`, with feature commit `741ac3655bd33314e1aaca51e6fd30271c74c61b`.
- [x] Effective Python `v0.7.10` realignment target: `upstream/v7` at `0c29b2cb88c6274d889ca7c33a684ce103808715`, with remote tag `v0.7.10` at `ef1050b0e4134df0bd59956b0f900dc3c83e8184`.
- [x] Release-tag anomaly recorded: fetched local tags `v0.7.0` through `v0.7.4` resolve to `f81e3bc`, so `0.7.x` traceability after `0.6.9` follows the `upstream/v7` commit history rather than those tag pointers.
- [x] Stable CRG reference: remote tag `v2.3.2` at `db2d2df789c25a101e33477b898c1840fb4c7bc7`, published `2026-04-14T13:28:19Z`.
- [x] Exploratory CRG head: remote `main` at `0919071a9ba353e604981059e99ee2ed98768092`, currently `96` commits ahead of `v2.3.2`.
- [x] Versioning rule: Python Graphify drives parity version targets; CRG never drives npm package version.

## Release Policy

- [ ] Do not publish `0.7.10` from this branch until the corresponding rows in `UPSTREAM_GAP.md` are closed with evidence.
- [ ] If interim validation is needed, publish prereleases only (`0.7.10-rc.N` preferred) rather than new stable numbers that imply parity we do not yet have.
- [x] Promote the branch package target to `0.7.10` only after the active parity rows are closed and the final release gate in this file passes.
- [ ] Treat upstream Python `v1.0.0` as `deferred` until a separate traceability pass proves that the active upstream release train has actually moved beyond `v6` / `0.7.x`.
- [ ] Keep this catch-up TypeScript-only: do not add new Python runtime dependencies, Python toolchains, or Python-based feature implementations while closing `0.6.x` / `0.7.x` parity.

## Task 0: Reset Traceability Baseline

**Files:**
- Modify: `PLAN.md`
- Modify: `UPSTREAM_GAP.md`
- Modify: `spec/SPEC_UPSTREAM_TRACEABILITY.md`

- [x] Replace the obsolete implementation plan with the initial `0.7.4` catch-up plan, then extend it with the `0.7.10` realignment in Task L.
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
- covered in this lot so far: two-phase low-cohesion community re-splitting
- covered/intentional-delta in this lot so far: token-aware semantic chunking guidance, MCP graph query surface, slash-normalized `source_file`, VS Code Copilot instructions, Antigravity reinstall idempotency, and the `GRAPHIFY_OUT` decision to keep `.graphify/` canonical by default
- Task 3 is now functionally closed; only `GRAPHIFY_OUT` remains an intentional product delta rather than a parity gap.

- [x] Audit `v0.6.7` tree view, token-aware chunking, MCP context filters, dynamic `import()` extraction, and directory-safe semantic cache writes.
- [x] Audit `v0.6.8` `.graphifyignore` negation handling, Antigravity workflow frontmatter, Gemini/Codex hook fixes, and thin-community omission in reports.
- [x] Audit `v0.6.9` slash-normalized `source_file`, two-phase community re-splitting, VS Code Copilot instruction changes, `GRAPHIFY_OUT`, and Antigravity reinstall behavior.
- [x] Decide whether `GRAPHIFY_OUT` is compatible with the TypeScript `.graphify/` contract or should remain an `intentional-delta` / `rejected` feature.
- [x] Commit this lot with only `0.6.7` to `0.6.9` closures and associated tests.

## Task 4: Multi-Developer Graph Lifecycle (`0.7.0`)

**Files:**
- Modify: `UPSTREAM_GAP.md`
- Modify: `spec/SPEC_UPSTREAM_TRACEABILITY.md`
- Modify as needed: hook installer, merge-driver handling, cache hashing, freshness metadata, watch/update/runtime/tests

Progress note:
- covered in this lot: `graphify hook install` now configures `.gitattributes` plus a `graphify-json` merge-driver, and the merge-driver union-merges `graph.json` nodes/edges/hyperedges/labels
- covered in this lot: deterministic community IDs via canonicalized Louvain input plus lexical tie-breaks for equal-size communities
- covered in this lot: `graph.json` now records `built_from_commit`, `GRAPH_REPORT.md` surfaces the short hash, and `graphify check-update` detects HEAD drift from the last built graph
- covered in this lot: mixed code/doc hook batches keep semantic staleness while still rebuilding code-only structure
- intentional delta in this lot: content-only cache reuse on rename is not adopted in the TS line because AST and semantic node IDs remain path/stem-derived; blind cache reuse across renames would replay stale IDs and `source_file` provenance

- [x] Audit merge-driver support for `graph.json` and decide how it maps to the TypeScript `.graphify/graph.json` lifecycle.
- [x] Audit deterministic community IDs against the current TypeScript clustering implementation and output stability.
- [x] Audit content-only cache hashing for rename resilience.
- [x] Audit graph freshness signaling against the current `.graphify` metadata and report contract.
- [x] Audit mixed code/doc change handling in watch/update flows.
- [x] Commit this lot with only `0.7.0` closures and associated tests.

## Task 5: Parser Robustness, Export Surface, And Headless Extraction (`0.7.1` to `0.7.4`)

**Files:**
- Modify: `UPSTREAM_GAP.md`
- Modify: `spec/SPEC_UPSTREAM_TRACEABILITY.md`
- Modify as needed: wiki/export sanitization, TS/Svelte import resolution, recursion safety, export subcommands, language parsers, assistant/runtime extraction commands, skills/tests

Progress note:
- covered in this lot so far: JSONC `tsconfig` parsing and aliased Svelte dynamic-import resolution
- covered/n-a in this lot so far: `tsconfig extends` alias resolution, Svelte template-layer dynamic imports, and per-file recursion-overflow diagnostics
- covered/deferred/intentional-delta in this lot so far: public `graphify export {html,wiki,obsidian,svg,graphml,neo4j}` parity, explicit `--no-viz`, Fortran parser deferral, and large-graph HTML aggregation as a TypeScript product delta
- covered/intentional-delta in this lot so far: public `graphify extract`, `--out`, `--no-cluster`, and docs-only headless rebuilds when a compatible semantic JSON is provided
- Task 5 is functionally closed as historical `0.7.4` parity work; the active parity closure is tracked in Task L for `0.7.10`.

- [x] Audit `v0.7.1` Obsidian tag sanitization, extended `tsconfig` alias resolution, Svelte template-layer dynamic imports, and recursion safety on deep ASTs.
- [x] Audit `v0.7.2` Fortran support, export CLI subcommands, skill size reduction, and large-graph aggregation.
- [x] Audit `v0.7.3` `graphify extract` and decide whether it maps to the TypeScript assistant/runtime model as `covered`, `intentional-delta`, or `deferred`, without introducing any Python dependency.
- [x] Audit `v0.7.4` JSONC `tsconfig` parsing and aliased Svelte dynamic-import resolution.
- [x] Commit this lot with only `0.7.1` to `0.7.4` closures and associated tests.

## Task 6: CRG Guardrail During The `0.7.4` Catch-up

**Files:**
- Modify: `UPSTREAM_GAP.md`
- Modify: `spec/SPEC_UPSTREAM_TRACEABILITY.md`

- [x] Keep CRG stable source lock at `v2.3.2` throughout the `0.7.4` catch-up.
- [x] Record CRG `main` drift only as exploratory backlog input, not as a blocker to releasing `0.7.4`.
- [x] If a CRG-main feature is adopted during this catch-up, cite it as an additive TypeScript delta rather than as a parity requirement for the Python line.

## Task 7: Release Preparation For `0.7.4`

**Files:**
- Modify: `UPSTREAM_GAP.md`
- Modify: `spec/SPEC_UPSTREAM_TRACEABILITY.md`
- Modify as needed: `package.json`, `package-lock.json`, release docs, generated `.graphify` artifacts

- [x] Verify every active `0.6.x` and `0.7.x` row in `UPSTREAM_GAP.md` is closed with `covered`, `intentional-delta`, `deferred`, `rejected`, or `n/a`.
- [x] Confirm `spec/SPEC_UPSTREAM_TRACEABILITY.md` matches the final state exactly.
- [x] Run the release verification commands listed below on the implementation branch.
- [x] Bump the package version to `0.7.4` only after the release gate passes.
- [x] Regenerate `.graphify` and commit only the portable, tracked artifacts.
- [x] Publish `graphifyy@0.7.4`, update local installs, and record the release in both traceability documents.

## Release Gate

- [x] `git diff --check`
- [x] `npm run lint`
- [x] `npm run build`
- [x] `npm test`
- [x] `npm run test:smoke` whenever runtime/package behavior changes
- [x] `npx graphify hook-rebuild`
- [x] `node dist/cli.js portable-check .graphify`
- [x] package-level UAT from a tarball install
- [x] GitHub Actions release and post-publish install checks pass

## Branching And Commit Rules

- [ ] Use one cohesive commit per implemented parity lot, plus one graph-artifact refresh commit only when needed.
- [ ] Update `UPSTREAM_GAP.md` and `spec/SPEC_UPSTREAM_TRACEABILITY.md` first or in the same commit as the implementation they justify.
- [ ] Never mark a row `covered` without a test name, verification command, or an explicit intentional-delta rationale in the docs.
- [ ] Never use CRG version numbers to rename the npm package release line.

---

# Post-`0.7.10` Product Acceleration Board

**Status on 2026-05-14:** PR #22 merged the Python `0.7.10` checkpoint into `main`. Upstream rescan on this date observed `v0.7.19` at `a9b0ddb` (head of `upstream/v7`), 28 commits ahead of `v0.7.16`. Drift band is now `0.7.11..0.7.19` (extended by 3 versions). Product work runs in parallel with upstream drift via independent lanes.

## Operating Rules

- [x] Treat `0.7.10` as the merged checkpoint and use new branches for post-merge work.
- [x] Rescan Python upstream weekly with `git ls-remote upstream 'refs/tags/v0.7.*' refs/heads/v7` before any parity/release claim.
- [ ] Keep each lot small enough to review in one sitting: spec change, then plan checkboxes, then infra commits, then UI commits, then UAT commits.
- [ ] Lanes run in parallel; one lane only blocks another when a shared file contract forces it (record the contract path explicitly).
- [ ] Use `Fait / À faire / Attendu` reporting after every lot, with explicit UAT or decision requests.
- [ ] Score each lane on six independent dimensions: **Spec / Plan / Infra / UI / UAT / Release**. A lane is shippable when all six are green; partial dimensions never block parallel work on others.

## Lane Scoring Grid

Each lane carries six independent dimensions. "Infra" = library / CLI / MCP / API surface. "UI" = the final user surface (rendered Markdown for Descriptions, Svelte studio for Reconciliation, HTML export for CRG, n/a for upstream drift). "UAT" = end-to-end user-facing validation on a real or representative corpus. "Release" = README / CHANGELOG / npm version bump / smoke gate.

| Lane | Spec | Plan | Infra | UI utilisateur | UAT réel | Release | Overall |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | ---: |
| **A** Descriptions | ✅ 1/1 | ✅ 1/1 | 🟡 7/9 (batch scaffold landed `80e0951`; provider wiring + A3 mesh pending) | ✅ 1/1 | ✅ 2/2 (mocked vitest `b78c3b9`; public-pack pre-UAT script `bb43bd9`) | ✅ 2/2 (README + CHANGELOG `b14e2fd`) | **14/16 = 88%** |
| **B** Reconciliation | ✅ 1/1 | ✅ 1/1 | ✅ 6/6 | ❌ 0/1 (Svelte studio blocked on design system + C ordering) | ✅ 2/2 (vitest decision-log replay covers apply→GET cycle; public-pack pre-UAT script complements it as a manual reproducer) | ✅ 2/2 (README + CHANGELOG) | **12/13 = 92%** |
| **C** CRG `v2.3.3` | ✅ 2/2 (alignment spec + row-level audit committed `26b809f` + UX/a11y matrix below) | 🟡 1/3 (C1/C2/C3 scoped; lots not started) | ❌ 0/3 | ❌ 0/2 (HTML a11y, review surface) | ❌ 0/1 | ❌ 0/1 | **3/12 = 25%** |
| **D** Drift `0.7.11..0.7.19` | ✅ 1/1 | ✅ 5/5 (M0..M5 all landed; M1 manifest-shrink residue intentional-delta) | ✅ 5/5 (`.astro` `6a7de56`, watch lock `a641d97`, `--no-cluster`+topology `d05bb09`, `--backend claude-cli` `61957e6`, MCP arrows/community IDs pre-covered) | n/a | ✅ 2/2 (regression vitest covers M2..M5; smoke on real corpora green on graphify repo + public-pack) | ✅ 1/1 (npm `0.7.19` stable) | **14/14 = 100%** |

## Active Lanes — next concrete action

| Lane | Next concrete action | UAT / Decision needed |
| --- | --- | --- |
| **A** Descriptions | Decide whether batch/mesh becomes Lot A2 or a documented follow-up; live LLM UAT on the public-pack can run once a backend is selected. | Lot-or-follow-up decision on batch/mesh. |
| **B** Reconciliation | Decision-log replay flow (re-run studio against the audit log produced by `preuat-reconciliation.sh` and verify the preview endpoint). Svelte studio stays blocked on the external design system. | Confirm whether the decision-log replay endpoint deserves its own automated test in the public pack, or stays a manual check. |
| **C** CRG `v2.3.3` | Pick the first of `C1` (review-precision, ~5d) / `C2` (HTML a11y, ~3–4d) / `C3` (node-shape encoding, ~2–3d). Lot scoping already landed; implementation is the bottleneck. | **DECISION** — see "Open C decision" below. |
| **D** Drift `0.7.11..0.7.19` | Run smoke on the public-pack + this repo against `0.7.19-rc.1` and, if green, promote to a stable `0.7.19` bump. | Decide whether the smoke + UAT bar lets us tag `0.7.19` stable now, or wait for a CI matrix run. |

### Open C decision

Three CRG lots scoped (`C1` review-precision, `C2` HTML a11y, `C3` node-shape + edge encoding + legend), independent of one another, no shared file contract:

1. **C2 → C3 → C1** (visual a11y first, then review precision). Ships visible HTML accessibility upgrades in the next release and defers review-precision until after. Total ~10–12 days; first user-visible result in ~3 days.
2. **C1 → C2 → C3** (review-precision first). Closes the deepest CRG functional gap first (flows, risk, criticality) before touching the HTML export. Total ~10 days; first user-visible result in ~5 days (CLI only).
3. **Three lots in parallel** (worktrees). Highest throughput; highest merge risk on `src/export.ts` between C2 and C3.

Each lot ships independently (no cross-lot file conflict in option 1 or 2). Tell me which order so I can start the smallest lot.

## Detailed Track Plans

### Track A: Descriptions (Overall **14/16 = 88%**)

**Spec (1/1)**
- [x] `spec/SPEC_WIKI_ENTITY_DESCRIPTIONS.md` covers sidecar schema, cache key, evidence policy, two-step CLI workflow.

**Plan (1/1)**
- [x] Lots split: schema/validation → render → assistant gen → direct gen → cache invalidation → ontology entity pages → UAT (this section).

**Infra (7/9)** — batch + mesh added as follow-on lots per the "Les deux en lots consécutifs" decision:
- [x] Sidecar schema, cache key and validation in `src/wiki-descriptions.ts`.
- [x] Render path (community + node + god-node) without provider calls (`src/wiki.ts:332`).
- [x] CLI render opt-in: `graphify export wiki|obsidian --descriptions <path>`.
- [x] Assistant-mode sidecar generation (`src/wiki-description-generation.ts`).
- [x] Direct-backend sidecar generation through LLM execution ports.
- [x] Stale-sidecar invalidation at load time (`checkWikiDescriptionFreshness` + `selectFreshWikiDescriptions`; warns on dropped sidecars at `graphify export wiki|obsidian`).
- [x] **Lot A2 batch — scaffold** (commit `80e0951`): provider-agnostic `BatchTextJsonClient` + `buildWikiDescriptionBatchExport` + `parseWikiDescriptionBatchResults` with 4 vitest cases. Output index shape-identical to assistant/direct so `toWiki` / `ontology-output` need no change.
- [ ] **Lot A2 batch — provider wiring** (~2-3 days). OpenAI Batch then Anthropic Batch (`BatchTextJsonClient` implementations). Uses the existing direct provider credential plumbing (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`). Two CLI commands: `graphify wiki describe --backend openai --batch-export <out>` and `--batch-import <in>` so users can drive submit/poll/import themselves while a future commit adds a single-shot poll loop.
- [ ] **Lot A3 mesh** (~5-6 days). Dispatcher with multi-provider fallback + retry + circuit breaker; consumes the same `TextJsonGenerationClient` shape so no change to the generation entry point.

**UI utilisateur (1/1)**
- [x] Ontology entity pages render descriptions (`CompileOntologyOutputsOptions.descriptions`, `writeWiki()` looks up on canonical `node.id`; commit `b674057`).

**UAT réel (2/2)**
- [x] Mocked vitest UAT: a single mock client emits 1 `generated` + 1 `insufficient_evidence` for the two top god-nodes; the index then drives `toWiki()` which renders the paragraph on the generated page and omits the second (commit `b78c3b9`).
- [x] Live pre-UAT against `../public-domaine-mystery-sagas-pack` (commit `bb43bd9` in the pack): `scripts/preuat-descriptions.sh` seeds Holmes/Watson/Study-in-Scarlet, generates the ontology, and renders the entity pages with 1 `generated` (Holmes) + 1 `insufficient_evidence` (Watson) sidecar. No provider call. Live LLM walk against the pack remains a separate follow-up if/when batch/mesh lands.

**Release / Docs (2/2)**
- [x] README and assistant skills document the two-step workflow.
- [x] CHANGELOG entry shipped with `0.7.19-rc.1` (commit `b14e2fd`).

### Track B: Reconciliation (Overall **12/13 = 92%**)

**Spec (1/1)**
- [x] `spec/SPEC_ONTOLOGY_LIFECYCLE_RECONCILIATION.md` covers patch lifecycle, candidate queue, read-only API, write-enabled studio contract, Svelte studio direction.

**Plan (1/1)**
- [x] Lots split: patch core → candidate queue → read-only API (CLI/MCP/HTTP) → write-mode studio → public-pack config → public-pack live UAT → Svelte studio (blocked on design system).

**Infra (6/6)**
- [x] Patch validation, dry-run/apply, write-mode MCP foundations.
- [x] Deterministic candidate queue schema and generation.
- [x] Read-only MCP + HTTP/studio API (candidates, decision-log preview, rebuild status).
- [x] Decision-log preview through CLI and skill runtime.
- [x] Read-only studio shell (`graphify ontology studio --config graphify.yaml`).
- [x] Write-enabled studio (`--write`: loopback bind, hex24 bearer token, `POST /api/ontology/patch/{validate,dry-run,apply}` reusing patch core, 401/405/413 guards). Commit `ab44847`.

**UI utilisateur (0/1)**
- [ ] Svelte reconciliation studio. **Blocked**: spec line 376 requires `../sent-tech-design-system` tokens; meanwhile static export fallback works (existing HTML viewer).

**UAT réel (2/2)**
- [x] Vitest `tests/ontology-studio-write.test.ts > decision-log replay`: runs the apply → GET decision-log cycle in-process and asserts both authoritative + audit records surface with the right id/operation, plus `rebuild-status` flips `needs_update` to `true`. Closes the previous UAT gap in CI (no public-pack shell dependency).
- [x] Public-pack live walk via `scripts/preuat-reconciliation.sh` (commit `fdde846` in the pack): kept as a manual reproducer to exercise the same flow against a "real" pack-shaped `graphify.yaml` + ontology profile. Re-runs are git-clean.

**Release / Docs (2/2)**
- [x] README and assistant skills document patch lifecycle + read-only and write-enabled modes.
- [x] CHANGELOG entry shipped with `0.7.19-rc.1` (commit `b14e2fd`).

**Pre-existing closed items** (kept for traceability):
- [x] Isolated `/tmp`-based UAT covered accept/reject/alias/weak-evidence on 2026-05-12.
- [x] Public-pack `graphify.yaml` + ontology profile + decision-log path committed `1694788`.

### Track C: CRG Additive UX And Review Precision (Overall **3/12 = 25%**)

**Spec (2/2)**
- [x] CRG source locks (`v2.3.3` at `db2d2df`, head `52cf3bc`) and `SPEC_CODE_REVIEW_GRAPH_ALIGNMENT.md` / `SPEC_CODE_REVIEW_GRAPH_OPPORUNITY.md` exist.
- [x] Row-by-row `v2.3.3` audit committed into `UPSTREAM_GAP.md` (15 features classified, 9 `adopt-review` F3-F8/F10/F12, 2 deferred F11, 0 reject). HTML a11y / node-shape / help-overlay still need a separate VS Code/CRG webview audit before adoption (tracked in `C2` and `C3` lots below).

**Ordering constraint**: Track C MUST land before Track B's Svelte reconciliation studio. The studio inherits the HTML accessibility + visual encoding patterns shipped by C2/C3, otherwise it ships with the same gaps and we re-do them in the studio layer.

**Plan (1/3)** — lots scoped, sizing per drumbeat audit:
- [x] **Lot C1 — Review-precision** (S/M, ~5 days). Sources: rows 1–9, 12–15 in the F3..F15 matrix (`UPSTREAM_GAP.md` > "CRG v2.3.3 Row-Level Audit"). Ports GraphStore adapter, flow tracing, affected-flows, review context, unified-diff/risk scoring, criticality weights, security keywords, test-gap detection. Builds on existing `graphify review-*` and `src/flows.ts`. Lot scope is captured; implementation not started.
- [ ] **Lot C2 — HTML a11y** (S/M, ~3–4 days). Sources: rows 1–10 in the HTML a11y / visual matrix below in `UPSTREAM_GAP.md`. Tab order, ARIA labels, focus management, live regions, help overlay, labelled search, status announcements, contrast / colour-blind palette. Lands in `graphify export html` first; CI gate via `axe-core` or `pa11y` on an HTML fixture.
- [ ] **Lot C3 — Node-shape + edge encoding + legend** (S, ~2–3 days). Sources: rows 11–15, 18 in the HTML a11y / visual matrix. Non-colour-only file_type cue, edge direction clarification, edge style by relation, legend panel, inline SVG icons. Depends on C2 styling layer.

**Mapping policy (C3 prerequisite)** — Domain mappings MUST be configurable, NOT hard-coded:

- File-type → shape mapping (e.g. `code → dot`, `test → square`, `config → triangle`, `doc → house`) defaults to a code-corpus profile, but the configured-profile mode (`graphify.yaml`) can override it per ontology node type so non-code corpora (papers, mystery characters, ontology entities) get domain-appropriate shapes.
- Relation → edge style mapping (e.g. `calls → solid`, `imports_from → dashed`, `tested_by → dotted`) defaults to common code relations, but profiles can declare their own relation styles. The mystery profile, for example, could map `alias_of → dashed`, `appears_in → solid`, `same_as → double-line`.
- Skills must propose mappings from sampled candidates (e.g. for a fresh corpus, run a calibration that suggests reasonable defaults) and emit them as profile patches — never silently inject mystery- or code-specific defaults into Graphify built-ins.
- Open question to resolve before C3 starts: where the mapping lives in the profile schema (`outputs.html.shape_map` and `outputs.html.edge_style_map`? `ontology.node_types.<Type>.html_shape`? a new `visualization` block?). Decide and lock in the spec before any vis.js rewrite.

**Infra (0/3)**
- [ ] C1 infra impl.
- [ ] C2 infra impl.
- [ ] C3 infra impl.

**UI utilisateur (0/2)**
- [ ] HTML export a11y verified with axe-core or equivalent CI check.
- [ ] Node-shape diff visible in `graph.html` regenerated on a small fixture.

**UAT réel (0/1)**
- [ ] Run review precision UAT against `../code-review-graph` fixtures (or a synthetic Vitest fixture if CRG repo not accessible).

**Release / Docs (0/1)**
- [ ] README + CHANGELOG entry; no npm version bump tied to CRG (additive only).

### Track D: Upstream Python `0.7.11`..`0.7.19` Drift (Overall **14/14 = 100%**)

**Spec (1/1)**
- [x] Source locks: `upstream/v7` head at `a9b0ddb` (`2026-05-14`), `v0.7.16` at `ab32098`, `v0.7.17` at `258d260`, `v0.7.18` at `b7e7ae5`, `v0.7.19` at `3baedc5`. Initial drift matrix `f88567b..ab32098` and extended matrix `ab32098..a9b0ddb` (27 commits) recorded.

**Plan (5/5)**
- [x] M0 — matrix `ab32098..a9b0ddb`: produced (drumbeat agent). Top must-port: `.astro` extraction, watch `.rebuild.lock` lifecycle, deterministic clustering + topology short-circuit + `--no-cluster` for update, `--backend claude-cli`, manifest shrink guard. 6 already-covered, 14 docs/release only.
- [x] M1 — runtime hotfixes pre-covered (path scoring, MCP arrow, hub-transit, Bedrock guard, community ID stability) per the drift matrix; the manifest-shrink residue is recorded as an intentional-delta since the TS update path already protects against shrink via the `force` guard.
- [x] M2 — watch lifecycle (`.rebuild.lock`: single PID line on acquire, unlink on release; live-PID `kill -0` check + stale-PID overwrite; commit `a641d97`).
- [x] M3 — extract parsers (`.astro` frontmatter + `<script>` static/dynamic imports + tsconfig alias; commit `6a7de56`).
- [x] M4 — clustering + update (deterministic community IDs already covered; topology short-circuit reuses existing community ids when topology unchanged; `--no-cluster` flag added to `graphify update`; commit `d05bb09`).
- [x] M5 — providers (`graphify extract --backend claude-cli` writes assistant instructions, no provider API key; commit `61957e6`).

**Infra (5/5)** _(one box per M-lot above)_
- [x] M1 pre-covered (path scoring + same-node guards + MCP arrow direction + Bedrock guard + community ID stability + serialization fallbacks shipped under earlier lots, per drift matrix `aeb6960`).
- [x] M2 watch `.rebuild.lock` port (commit `a641d97`).
- [x] M3 `.astro` extractor (commit `6a7de56`).
- [x] M4 `--no-cluster` for `update` + topology short-circuit wiring (commit `d05bb09`).
- [x] M5 `--backend claude-cli` (commit `61957e6`).

**UI utilisateur** — n/a (parity track).

**UAT réel (2/2)**
- [x] Regression vitest covers M2 watch lock (5 cases), M3 `.astro` extraction (1 case), M4 `--no-cluster` and topology short-circuit (2 cases), M5 `--backend claude-cli` (1 case). Smoke + portable-check stayed green across these commits.
- [x] Smoke on a small real corpus: `graphify update` regenerates this repo (2570 nodes / 4987 edges / 110 communities) and `../public-domaine-mystery-sagas-pack` (60 nodes / 81 edges / 7 communities) without regressions. Two pre-existing `portable-check` false positives on `graph.html` comment lines in the public pack are recorded as an intentional-delta in the scanner and tracked separately.

**Release / Docs (1/1)**
- [x] `UPSTREAM_GAP.md` row-level matrices committed. npm promoted to `0.7.19` stable after the smoke walked green.

---

# Next Product Evolution: Ontology Lifecycle And Reconciliation

> This section is a forward implementation plan. It is independent from the closed upstream `0.7.4` catch-up and must preserve the normal non-profile Graphify behavior.

**Goal:** Move ontology profiles from extraction constraints to a reviewable ontology lifecycle: profile v2, discovery workflow, validated patches, optional write-enabled MCP, and a professional local reconciliation studio.

**Architecture:** `graph.json` and compiled ontology outputs remain derived artifacts. All ontology writes are represented as validated patches against project-owned sources such as profile files, registries and reconciliation decision logs, followed by rebuild. Mutation surfaces are opt-in, local, dry-run first and audit-backed.

## Task A: Freeze Specs And Product Boundary

**Files:**
- Add: `spec/SPEC_ONTOLOGY_LIFECYCLE_RECONCILIATION.md`
- Modify: `spec/SPEC_ONTOLOGY_DATAPREP_PROFILES.md`
- Modify: `spec/SPEC_ONTOLOGY_OUTPUT_ARTIFACTS.md`
- Modify: `spec/SPEC_GRAPHIFY.md`
- Modify: `PLAN.md`

- [x] Specify that derived `graph.json` and `.graphify/ontology/*.json` must not be edited directly.
- [x] Specify the patch lifecycle: propose, validate, dry-run, apply to authoritative state, rebuild.
- [x] Specify explicit write surfaces: CLI patch commands, write-enabled ontology MCP, local studio.
- [x] Specify UI direction: future Svelte studio, not an extension of the current hand-written HTML graph viewer.
- [x] Specify design-system dependency boundary for future `../sent-tech-design-system` integration.
- [x] Specify the design research phase over open-source ontology mapping/reconciliation tools before UI implementation.

## Task B: Ontology Profile v2

**Files:**
- Modify: `src/types.ts`
- Modify: `src/ontology-profile.ts`
- Modify: `src/profile-prompts.ts`
- Modify: `src/profile-validate.ts` or equivalent validation module
- Modify/Add: synthetic fixtures under `tests/fixtures/`
- Modify/Add: Vitest coverage

- [x] Add first-class canonical entity, mention, occurrence, evidence and mapping concepts without domain-specific built-ins.
- [x] Add richer relation metadata: `review_status`, `assertion_basis`, `derivation_method`, `evidence_refs`, confidence and provenance handles.
- [x] Add profile constraints for allowed status transitions, inferred relation policy and evidence requirements.
- [x] Add optional hierarchy declarations for registry-backed parent/child materialization.
- [x] Add deterministic validation for relation endpoints, status transitions, evidence refs and registry refs.
- [x] Keep profile mode strictly opt-in and unchanged without `graphify.yaml`, `--config` or `--profile`.

## Task C: Ontology Discovery Workflow

**Files:**
- Modify/Add: CLI/runtime profile commands
- Modify/Add: skill runtime commands
- Modify: platform skills
- Modify/Add: tests for synthetic discovery proposals

- [x] Add a discovery command that samples configured corpus and registries without mutating profile files.
- [x] Generate candidate node types, relation types, registry bindings and hardening rules as reviewable proposals.
- [x] Emit profile diffs rather than overwriting ontology profiles.
- [x] Teach skills to run discovery, present proposals and wait for user approval before applying changes.
- [x] Ensure assistants never invent project-specific ontology content in Graphify package docs, fixtures or tests.

## Task D: Patch Core And Deterministic Apply

**Files:**
- Add: `src/ontology-patch.ts`
- Add: `src/ontology-reconciliation.ts`
- Modify: `src/cli.ts`
- Modify: `src/skill-runtime.ts`
- Modify/Add: tests

- [x] Define `graphify_ontology_patch_v1`.
- [x] Implement patch validation with profile hash, graph hash, operation, evidence and path-jail checks.
- [x] Implement dry-run previews with changed-file summaries.
- [x] Implement write apply to configured authoritative files only.
- [x] Implement append-only audit logs for applied and rejected patches.
- [x] Mark derived ontology artifacts stale or trigger explicit rebuild after apply.
- [x] Warn before apply when the Git worktree is dirty; never stage, commit or push.

## Task E: MCP Write Tools

**Files:**
- Modify/Add: MCP server modules
- Modify: `src/cli.ts`
- Modify: README and skills
- Modify/Add: tests

- [x] Keep `graphify serve` read-only by default.
- [x] Add explicit `graphify ontology serve --write --config graphify.yaml`.
- [x] Expose mutation tools only in write mode.
- [x] Require dry-run or explicit confirmation for non-dry-run apply.
- [x] Reuse the same patch core as CLI and future studio.
- [x] Test that read-only MCP exposes no mutation tools.

## Task F: Local Reconciliation Studio Design

**Files:**
- Add: design spec after research
- Modify: `spec/SPEC_ONTOLOGY_LIFECYCLE_RECONCILIATION.md` if research changes requirements
- No implementation until design is approved

- [x] Research open-source ontology/mapping/reconciliation tools: WebProtege, VocBench, OpenRefine reconciliation, WebVOWL and semantic mapping tools such as Karma.
- [x] Produce screen pattern inventory, user journeys, component inventory, token requirements, accessibility risks and scalability risks.
- [x] Decide MVP UI scope: candidate queue, evidence panel, canonical entity panel, graph context, patch preview and audit trail.
- [x] Define exact `../sent-tech-design-system` token dependencies before implementation.
- [x] Define Svelte package boundaries and fallback token adapter for open-source development before the design system exists.
- [x] Confirm static export fallback: read-only viewer can export patch JSON without running a write server.

## Task G: Reconciliation Candidate Queue And Local Studio Implementation

**Files:**
- Add: `src/ontology-reconciliation.ts`
- Add: reconciliation candidate tests
- Add later: Svelte studio package or module after candidate queue/API approval
- Modify/Add: CLI server command
- Modify/Add: tests and UAT docs

**Status:** Candidate queue first. The studio must consume a deterministic reconciliation queue and emit patch JSON or patch API calls; it must not infer write behavior directly from graph visualization state.

- [x] Define stable `graphify_ontology_reconciliation_candidates_v1` queue schema.
- [x] Generate deterministic entity-match candidates from ontology output nodes and evidence refs.
- [x] Expose candidate generation through CLI and skill runtime.
- [x] Expose read-only candidate APIs before any browser write UI.
- [x] Implement read-only studio served by `graphify ontology studio --config graphify.yaml`.
- [ ] Implement write-enabled studio only with `--write`, localhost binding and local token.
- [ ] Route every write through patch validate/dry-run/apply APIs.
- [ ] Add UI for accept/reject/create/merge/status/relation patch operations.
- [ ] Add audit log, changed-file preview and rebuild guidance.
- [ ] Add UAT on synthetic profile only.

## Task H: Documentation, Skills And Release Gate

**Files:**
- Modify: `README.md`
- Modify: translated READMEs when present
- Modify: `src/skills/*`
- Modify: `spec/SPEC_GRAPHIFY.md`
- Modify: `PLAN.md`

- [x] Update README with generic ontology lifecycle explanation and clear opt-in behavior.
- [x] Update skills to propose patches, validate first, ask before write apply, warn on dirty worktrees and never edit `graph.json`.
- [x] Add UAT instructions for CLI patch workflow, MCP read-only/write modes and public-domain mystery studio mock scenarios.
- [x] Run `npm run lint`, `npm run build`, `npm test`, `npm run test:smoke` when runtime behavior changes.
- [x] Run `npx graphify hook-rebuild` after code changes and `graphify portable-check .graphify` before committing graph artifacts.

## Task I: Direct LLM Backends Through Vercel AI SDK

**Files:**
- Modify: `src/types.ts`
- Modify: `src/project-config.ts`
- Modify: `src/llm-execution.ts`
- Add: `src/direct-llm-extract.ts`
- Modify: `src/cli.ts`
- Modify: `src/index.ts`
- Modify: `README.md`, `README.zh-CN.md`, `README.ja-JP.md`
- Modify: `package.json`, `package-lock.json`
- Modify/Add: Vitest coverage
- Modify: `.github/workflows/typescript-ci.yml`
- Modify: `spec/SPEC_LLM_EXECUTION_PORTS.md`
- Modify: `PLAN.md`

**Boundary:** This is a temporary provider abstraction. Keep the Graphify contract narrow so it can be replaced by the future Entropic SDK without rewriting extraction, validation or reporting.

- [x] Extend `llm_execution.mode` with explicit opt-in `direct`; default behavior remains assistant mode.
- [x] Use Vercel AI SDK packages for direct providers: OpenAI, Anthropic, Google Gemini, Mistral and Cohere.
- [x] Keep upstream-aligned defaults: `claude-sonnet-4-6`, `gpt-5.5`, `gemini-3.1-pro-preview-customtools`, `mistral-small-2603`, and a configurable Cohere default.
- [x] Implement credential preflight through environment variables only; never persist API keys in config, `.graphify`, logs or reports.
- [x] Implement upstream-style token-aware chunking, bounded parallelism and merge for direct semantic extraction.
- [x] Wire `graphify extract --backend <provider>` to direct semantic extraction when no `--semantic` file is provided.
- [x] Keep CI on mocked provider calls by default, with real-provider UAT gated by explicit environment flags.
- [x] Add CI real-provider direct LLM UAT on `main` pushes and same-repository PRs only; no `workflow_dispatch`, no fork PR secret exposure.
- [x] Provision GitHub secrets: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `MISTRAL_API_KEY`, `COHERE_API_KEY`.
- [x] Add optional local UAT instructions for `../matchID/deces-ui/` and a small synthetic text corpus using keys from local `.env`.
- [x] Update README translations for the new direct-backend contract; skills remain assistant-orchestration-first and do not need a command-flow change in this lot.
- [x] Run `npm run build`, targeted Vitest tests, full `npm test`, `npx graphify hook-rebuild`, and `portable-check` before final commit.
- [x] Publish direct-backend release as `graphifyy@0.7.5` after merge to `main` and tag CI pass.

**Optional local UAT after build:**

```bash
set -a
. ../entropic/.env
set +a
graphify extract ../matchID/deces-ui --backend anthropic --model claude-sonnet-4-6 --no-cluster --out /tmp/graphify-direct-anthropic
graphify extract ./tmp/direct-uat-corpus --backend openai --model gpt-5.5 --no-cluster --out /tmp/graphify-direct-openai
```

**Executed UAT:**
- [x] Real Anthropic direct backend on synthetic `/tmp` Markdown corpus: `5` nodes, `4` edges, `198` input tokens, `312` output tokens; no API key printed or persisted.
- [x] Real direct provider integration test on all providers from local `../entropic/.env`: Anthropic, OpenAI, Gemini, Mistral and Cohere all returned valid Graphify JSON.

**Current temporary backend table:**

```text
+-----------+-----------------------------------+-------------------------------+
| Provider  | Default model                     | Credential env                |
+-----------+-----------------------------------+-------------------------------+
| anthropic | claude-sonnet-4-6                 | ANTHROPIC_API_KEY             |
| openai    | gpt-5.5                           | OPENAI_API_KEY                |
| gemini    | gemini-3.1-pro-preview-customtools| GEMINI_API_KEY or GOOGLE_*    |
| mistral   | mistral-small-2603                | MISTRAL_API_KEY               |
| cohere    | command-a-03-2025                 | COHERE_API_KEY                |
+-----------+-----------------------------------+-------------------------------+
```

## Task J: Public Mystery Ontology UAT And Policy Calibration

**Files:**
- Modify: `spec/SPEC_PUBLIC_DOMAIN_MYSTERY_UAT.md`
- Modify: `spec/SPEC_ONTOLOGY_LIFECYCLE_RECONCILIATION.md`
- Modify: `PLAN.md`
- Later modify: platform skills and skill runtime profile commands
- Later modify/add: UAT profile files in `../public-domaine-mystery-sagas-pack`

**Boundary:** The public mystery corpus is an external UAT and UI mockup dataset. Graphify must not vendor the corpus and must not hard-code mystery-specific ontology concepts. The product feature is generic configurable evidence/reconciliation policy plus assistant-guided calibration.

- [x] Move the public UAT illustration to the standard pack state at `../public-domaine-mystery-sagas-pack/.graphify/`.
- [x] Keep source selection and regeneration notes in `../public-domaine-mystery-sagas-pack/examples/graphify-three-works/`.
- [x] Define the UAT ontology as project profile content, not Graphify built-ins.
- [x] Expand the public UAT to the richer MVP scope: `Character`, `Alias`, `Work`, `ChapterOrStory`, `Case`, `Event`, `Location`, `Object`, `Evidence`, `Organization`, `NarrativeRole`.
- [x] Specify source-grounded evidence policy with required source ref, required snippet, required confidence, recommended section ref and optional offsets.
- [x] Specify that evidence/reconciliation policy must be profile-configurable and deterministically validated.
- [x] Specify that skills may propose policy changes from sampled candidates but must emit dry-run profile patches/diffs and wait for approval.
- [x] Add a committed `graphify.yaml` and ontology profile to the public pack for the three-work UAT (commit `1694788`).
- [x] Add project-owned reconciliation decision/audit log paths to the pack without committing generated cache/runtime-local files (commit `1694788` extends `.gitignore` to exclude `profile-state.json`, `*.normalized.json`, `semantic-detection.json`, `registries/`, `applied-patches.jsonl`, plus `needs_update`, `branch.json`, `worktree.json`, `cache/`, `transcripts/`).
- [ ] Add `configure-reconciliation-policy` skill guidance: sample candidates, explain rule impact, propose deterministic profile patch, wait for user approval.
- [ ] Add CLI or skill-runtime support for policy-calibration dry-runs if the existing discovery commands are insufficient.
- [x] Generate candidate reconciliation queue from a public-pack-derived isolated UAT and validate it against the profile policy.
- [x] Demonstrate at least one accepted relation, one rejected candidate, one alias merge proposal and one weak-evidence review item in isolated UAT.
- [x] Ensure every accepted UAT decision cites source evidence and does not require exact offsets yet.
- [ ] Update README and skills to point to the public pack as the ontology studio/mockup UAT.
- [ ] Run `npm run lint`, `npm run build`, `npm test`, `npm run test:smoke` after runtime/skill changes.
- [ ] Regenerate Graphify state and run `node dist/cli.js portable-check .graphify` before committing any Graphify repo `.graphify` artifacts.

## Task K: Source-Grounded Wiki Entity Descriptions

**Files:**
- Add: `spec/SPEC_WIKI_ENTITY_DESCRIPTIONS.md`
- Modify later: `src/wiki.ts`
- Modify later: `src/ontology-output.ts`
- Modify later: LLM execution orchestration for wiki description generation
- Modify later: `src/cli.ts`, `src/skill-runtime.ts`, `src/skills/*`
- Modify later: README and translated READMEs
- Add/modify later: Vitest coverage

**Boundary:** Wiki descriptions are optional derived artifacts. They render as Markdown paragraphs in generated wiki pages, but their machine-readable source is a sidecar with provenance/cache metadata. They must not become authoritative ontology state and must not be written into `graph.json`.

- [x] Decide the first description style: short factual 3-6 sentence descriptions, not long article generation.
- [x] Decide activation policy: explicit opt-in only through CLI/config/skill.
- [x] Decide target scope: node/entity descriptions by default, community descriptions as a separate sub-option.
- [x] Decide execution model: reuse existing `assistant`, `direct`, `batch` and `mesh` LLM ports.
- [x] Decide storage model: render the paragraph in Markdown and keep sidecar JSON for provenance/cache.
- [x] Decide cache key: `target_id + graph_hash + prompt_version + mode/model`.
- [x] Decide evidence policy: no rendered description without source evidence refs.
- [x] Decide insufficient-evidence behavior: record `insufficient_evidence` in sidecar, omit Markdown paragraph.
- [x] Create the initial feature spec.
- [x] Add description sidecar schema and validation.
- [x] Render existing validated sidecars in wiki pages without calling any provider.
- [x] Add deterministic no-provider-call tests for node and community description rendering.
- [x] Add CLI render opt-in through `graphify export wiki|obsidian --descriptions` for existing sidecar indexes.
- [x] Add wiki description generation command/runtime path for assistant/direct, with batch/mesh kept as an explicit follow-up.
- [ ] Add generation-time `--wiki-descriptions` and `--wiki-community-descriptions` or equivalent config options.
- [x] Render validated descriptions in community wiki pages and god-node wiki pages.
- [ ] Extend validated description rendering to ontology entity pages once the entity-page export is wired to sidecars.
- [x] Add assistant-skill guidance for generating sidecars before wiki rendering.
- [ ] Add cache/invalidation tests.
- [ ] Add no-provider-call CI tests plus mocked direct backend tests.
- [ ] Run UAT on a small code fixture and on `../public-domaine-mystery-sagas-pack`.

## Task L: Upstream Python `0.7.10` And CRG `v2.3.3` Realignment

**Files:**
- Modify: `UPSTREAM_GAP.md`
- Modify: `spec/SPEC_UPSTREAM_TRACEABILITY.md`
- Modify: `PLAN.md`
- Later modify as needed: parser, detect/update, LLM providers, MCP server, installers, skills, tests

**Boundary:** Python Graphify remains the only source that can drive the next parity version number. `code-review-graph` remains an additive review/UX feature source. This realignment must stay TypeScript-only and must not add Python runtime dependencies.

- [x] Fetch/check live Python Graphify refs and record `upstream/v7` at `0c29b2cb88c6274d889ca7c33a684ce103808715`.
- [x] Record remote Python `v0.7.10` at `ef1050b0e4134df0bd59956b0f900dc3c83e8184`.
- [x] Fetch/check live CRG refs and record `v2.3.3` / `main` at `52cf3bc63ee77c8b204fb809791a5f212e83a2de`.
- [x] Record local tag clobber risk and use `git ls-remote` / branch commits as authority.
- [x] Create the initial functional intake buckets in traceability docs.
- [x] Audit Python `0.7.5` to `0.7.10` row-by-row and classify each item as `covered`, `partial`, `missing`, `intentional-delta`, `deferred`, `rejected`, or `n/a`.
- [ ] Audit CRG `v2.3.3` feature buckets and classify additive opportunities separately from Python parity.
- [x] Lot 1: low-risk parity fixes: query/edges-loader mismatch, uninstall-all, skill/install YAML descriptions, missing skill install regressions, security hardening, positional install arguments.
  - [x] Port top-level `graphify uninstall` with optional purge of `.graphify/` and legacy `graphify-out/`.
  - [x] Warn and repair when `.graphify_version` exists but the global `SKILL.md` is missing.
  - [x] Write global skill files atomically to avoid half-written `SKILL.md` installs.
  - [x] Finish query/edges-loader mismatch audit, skill YAML description parity, positional install arguments, Kimi Code install platform, and mapped subprocess/security hardening.
- [x] Lot 2: parser/language surface: Markdown structural extraction, TS/TSX advanced constructs, CommonJS require, SQL ALTER/schema-qualified names, Quarto `.qmd`, and selected no-Python language fallbacks.
  - [x] Add TypeScript SQL extraction for schema-qualified table names and `ALTER TABLE ... FOREIGN KEY ... REFERENCES` edges.
  - [x] Add TypeScript CommonJS `require()` extraction for local module edges and required symbols.
  - [x] Add TypeScript/TSX extraction for interface/type/enum nodes, module constants, constructor calls and JSX call expressions.
  - [x] Add Markdown/MDX/Quarto structural extraction for headings, hierarchy and fenced code blocks.
  - [x] Finish selected no-Python language fallback audit with Groovy/Gradle, Luau, R and Fortran extension coverage.
- [x] Lot 3: incremental/dedup/update reliability: semantic cache/build-merge/manifest changes, community label persistence, reversed call-edge update fix, conservative entity dedup.
  - [x] Preserve `_src`/`_tgt` from existing `graph.json` links during `buildMerge` so non-directed graph snapshots do not reverse call semantics after update.
  - [x] Persist community labels across `cluster-only`, `update`/`hook-rebuild`, `extract`, and the skill-runtime assemble/finalize/merge/cluster-only flows so user-renamed labels survive every rebuild (parity with upstream `b3c99ec` and `e22a189`).
  - [x] Confirm semantic cache + manifest reuse is already implemented in the TypeScript assistant/runtime `update` path; document the headless `graphify extract` choice as an intentional delta rather than back-porting upstream's monolithic incremental `extract` command.
  - [x] Confirm entity dedup remains conservative (`deduplicateByLabel` in `buildMerge`) in the TypeScript line; the upstream MinHash/LSH/Jaro-Winkler `--dedup-llm` path is recorded as `intentional-delta` because it requires Python-only dependencies and an aggressive cross-file merge contract the TS port deliberately avoids.
- [x] Lot 4: optional provider/source integrations: decide on Ollama, AWS Bedrock and Google Workspace as explicit opt-in features before implementation.
  - [x] Ollama: `covered (opt-in port)`. `ollama` registered in `DIRECT_LLM_PROVIDERS`, default model `llama3.1`, `OLLAMA_BASE_URL` env override, credential-free (no API key). Tests: `tests/llm-execution.test.ts > accepts ollama as a credential-free local direct provider`.
  - [x] AWS Bedrock: `deferred`. Surface IAM/STS auth complexity and Bedrock model catalog churn are not worth porting before an actual enterprise user requests it. Reopen with a dedicated mini-spec when needed.
  - [x] Google Workspace: `covered (opt-in port, intentional-delta on implementation)`. Strict opt-in via `GRAPHIFY_GOOGLE_WORKSPACE=1`. `.gdoc`/`.gsheet`/`.gslides` stubs are surfaced by `classifyFile`, converted to Markdown sidecars under `.graphify/converted/` via direct Drive v3 REST (inspired by `entropiq/api/src/services/google-drive-client.ts`) instead of upstream's external `gws` CLI dependency. Auth via `GOOGLE_OAUTH_ACCESS_TOKEN` or refresh-token exchange; never persisted in `.graphify/`. Tests: `tests/google-workspace.test.ts` (11 cases) and `tests/detect.test.ts > ignores Google Workspace shortcuts unless GRAPHIFY_GOOGLE_WORKSPACE is set`.
- [x] Lot 5a: Python parity MCP resources: `graphify://report`, `graphify://stats`, `graphify://god-nodes`, `graphify://surprises`, `graphify://audit`, and `graphify://questions`.
- [ ] Lot 5b: CRG-inspired HTML accessibility patterns remain additive review UX work, not a Python `0.7.10` parity blocker.
- [x] Keep embeddings, SQLite/FTS and daemon features deferred unless a separate spec is approved.
- [x] Update README and skills only for user-facing behavior actually adopted.
- [x] Run full release gate before any parity publish and align npm version to the chosen Python parity target.

## Task M: Upstream Python `0.7.11`..`0.7.16` Drift Scan

**Files:**
- Modify: `UPSTREAM_GAP.md`
- Modify: `spec/SPEC_UPSTREAM_TRACEABILITY.md`
- Modify later as needed: parser, extract/update, LLM/Ollama, HTML export, watch/hooks, installers, skills, tests

**Boundary:** This task is a drift-control task after the merged `0.7.10` checkpoint. It must not pause descriptions or reconciliation unless a post-`0.7.10` upstream commit fixes a bug that affects those tracks directly.

- [x] Rescan upstream Python Graphify after PR #22 merge.
- [x] Record `upstream/v7` at `ab32098063adb1ab4d9247747742958ad185db41` and remote tag `v0.7.16` at the same commit.
- [x] Build a row-level `0.7.11`..`0.7.16` matrix with four statuses: `must-port`, `already-covered`, `intentional-delta`, `defer`.
- [ ] Lot M1: urgent runtime hotfix audit: context-window retry, Windows/help/version guards, Unicode IDs, edge-key dedup, direction flip, cache/path scoring, OpenCode trigger. Started: exact/prefix/substring path scoring and same-node shortest-path guards are ported for CLI and MCP.
- [ ] Lot M2: Ollama runtime audit: dynamic `num_ctx`, `keep_alive`, serial defaults, and env docs (`GRAPHIFY_OLLAMA_NUM_CTX`, `GRAPHIFY_OLLAMA_KEEP_ALIVE`).
- [ ] Lot M3: language support audit: Pascal/Delphi/Lazarus and regex fallback.
- [ ] Lot M4: callflow HTML audit: decide whether Mermaid callflow export belongs in core Graphify, CRG track, or a deferred visualization lot.
- [ ] Lot M5: skill/watch/hook audit: Antigravity `.agents` path/frontmatter, hook worker cap/OOM behavior, skill help behavior.
