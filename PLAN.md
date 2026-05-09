# Upstream `0.7.4` Catch-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the TypeScript fork from published `graphifyy@0.5.6` to a verified parity target of upstream Python Graphify `v0.7.4`, while preserving intentional TypeScript deltas and treating `code-review-graph` as an additive review-feature source instead of a version driver.

**Architecture:** Catch-up is traceability-first. Lock live upstream refs, audit each upstream release line conservatively, implement in cohesive functional lots, and publish the TypeScript package under the upstream Graphify version only after every active row is either `covered`, `intentional-delta`, `deferred`, `rejected`, or `n/a`. `code-review-graph` stable remains a separate source lock for review features and must not force the npm version.

**Tech Stack:** TypeScript, Node.js 20+, Vitest, Graphify CLI/runtime, GitHub Actions, remote GitHub release metadata, `UPSTREAM_GAP.md`, `spec/SPEC_UPSTREAM_TRACEABILITY.md`.

---

## Current Source Locks

- [x] Current TypeScript baseline: `main` at `1f30efa` (`graphifyy@0.5.6`).
- [x] Closed Python `v5` parity line: `upstream/v5` at `f755aca58f36771923cebcc8f85f2eef6178a105`.
- [x] Closed Python `v6` parity line: `upstream/v6` at `f81e3bc2154d21062f56f9e4ec9f923dfe7d128e` (`v0.6.9`).
- [x] Active Python continuation lock: `upstream/v7` observed at `ee85bbf80cc6fedff0a17d5ea1da77f20da0729b`.
- [x] Effective Python `v0.7.4` code target: `26a5a35200dda6207bf6fc16afed83c71238bb65` on `upstream/v7`, with feature commit `741ac3655bd33314e1aaca51e6fd30271c74c61b`.
- [x] Release-tag anomaly recorded: fetched local tags `v0.7.0` through `v0.7.4` resolve to `f81e3bc`, so `0.7.x` traceability after `0.6.9` follows the `upstream/v7` commit history rather than those tag pointers.
- [x] Stable CRG reference: remote tag `v2.3.2` at `db2d2df789c25a101e33477b898c1840fb4c7bc7`, published `2026-04-14T13:28:19Z`.
- [x] Exploratory CRG head: remote `main` at `0919071a9ba353e604981059e99ee2ed98768092`, currently `96` commits ahead of `v2.3.2`.
- [x] Versioning rule: Python Graphify drives parity version targets; CRG never drives npm package version.

## Release Policy

- [ ] Do not publish `0.6.x` or `0.7.x` from this branch until the corresponding rows in `UPSTREAM_GAP.md` are closed with evidence.
- [ ] If interim validation is needed, publish prereleases only (`0.7.4-rc.N` preferred) rather than new stable numbers that imply parity we do not yet have.
- [x] Promote to stable `0.7.4` only after the final release gate in this file is complete.
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
- Task 5 is now functionally closed; the remaining active work is CRG guardrail bookkeeping plus the final `0.7.4` release gate.

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
- [ ] Expose read-only candidate APIs before any browser write UI.
- [ ] Implement read-only studio served by `graphify ontology studio --config graphify.yaml`.
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
- [ ] Add a committed `graphify.yaml` and ontology profile to the public pack for the three-work UAT.
- [ ] Add project-owned reconciliation decision/audit log paths to the pack without committing generated cache/runtime-local files.
- [ ] Add `configure-reconciliation-policy` skill guidance: sample candidates, explain rule impact, propose deterministic profile patch, wait for user approval.
- [ ] Add CLI or skill-runtime support for policy-calibration dry-runs if the existing discovery commands are insufficient.
- [ ] Generate candidate reconciliation queue from the public pack and validate it against the profile policy.
- [ ] Demonstrate at least one accepted relation, one rejected candidate, one alias merge proposal and one weak-evidence review item.
- [ ] Ensure every accepted UAT decision cites source evidence and does not require exact offsets yet.
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
- [ ] Add wiki description generation command or runtime path for assistant/direct/batch/mesh.
- [ ] Add `--wiki-descriptions` and `--wiki-community-descriptions` or equivalent config options.
- [ ] Render validated descriptions in community wiki pages and ontology entity pages.
- [ ] Add assistant-skill guidance for generating sidecars before wiki rendering.
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
- [ ] Audit Python `0.7.5` to `0.7.10` row-by-row and classify each item as `covered`, `partial`, `missing`, `intentional-delta`, `deferred`, `rejected`, or `n/a`.
- [ ] Audit CRG `v2.3.3` feature buckets and classify additive opportunities separately from Python parity.
- [ ] Lot 1: low-risk parity fixes: query/edges-loader mismatch, uninstall-all, skill/install YAML descriptions, missing skill install regressions, security hardening, positional install arguments.
  - [x] Port top-level `graphify uninstall` with optional purge of `.graphify/` and legacy `graphify-out/`.
  - [x] Warn and repair when `.graphify_version` exists but the global `SKILL.md` is missing.
  - [x] Write global skill files atomically to avoid half-written `SKILL.md` installs.
  - [ ] Finish query/edges-loader mismatch audit, skill YAML description parity, positional install arguments, and subprocess/security hardening.
- [ ] Lot 2: parser/language surface: Markdown structural extraction, TS/TSX advanced constructs, CommonJS require, SQL ALTER/schema-qualified names, Quarto `.qmd`, and selected no-Python language fallbacks.
- [ ] Lot 3: incremental/dedup/update reliability: semantic cache/build-merge/manifest changes, community label persistence, reversed call-edge update fix, conservative entity dedup.
  - [x] Preserve `_src`/`_tgt` from existing `graph.json` links during `buildMerge` so non-directed graph snapshots do not reverse call semantics after update.
  - [ ] Finish remaining semantic cache/build-merge/manifest and community-label audit items.
- [ ] Lot 4: optional provider/source integrations: decide on Ollama, AWS Bedrock and Google Workspace as explicit opt-in features before implementation.
- [ ] Lot 5: MCP resources and review UX: MCP report/stats/god-nodes resources plus CRG-inspired HTML accessibility patterns.
- [ ] Keep embeddings, SQLite/FTS and daemon features deferred unless a separate spec is approved.
- [ ] Update README and skills only for user-facing behavior actually adopted.
- [ ] Run full release gate before any parity publish and align npm version to the chosen Python parity target.
