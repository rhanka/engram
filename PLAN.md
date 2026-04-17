# Spec Evolution Implementation Plan

## Snapshot

- [x] Commit the initial spec bundle on `feat/spec-graphify-vs-code-review-graph`
- [x] Create a dedicated execution branch: `feat/spec-evolution-implementation-plan`
- [x] Keep the current reference specs as the design baseline:
  - [x] [spec/SPEC_GRAPHIFY.md](spec/SPEC_GRAPHIFY.md)
  - [x] [spec/SPEC_CODE_REVIEW_GRAPH_OPPORUNITY.md](spec/SPEC_CODE_REVIEW_GRAPH_OPPORUNITY.md)
  - [x] [spec/SPEC_GAPHIFY_SLDC_STUDY.md](spec/SPEC_GAPHIFY_SLDC_STUDY.md)
- [x] Use this file as the execution source of truth for the implementation branch

## Guardrails

- [ ] Keep `v3-typescript` as the product line and `v3` as the upstream mirror; do not blur their roles in code, docs, or release behavior
- [ ] Keep one coherent commit per lot or tightly coupled file set; do not batch unrelated changes
- [ ] After each code-changing lot:
  - [x] run targeted tests first
  - [x] run full `npm test`
  - [x] run `npx graphify hook-rebuild`
  - [x] update this plan and any touched SPEC files
- [x] Do not introduce a remote service or shared backend for Graphify state
- [x] Keep `.graphify/` ignored by default; do not make runtime state part of the normal committed source of truth
- [x] Treat commit recommendations as advisory only; no automatic staging or committing
- [x] Keep deferred items explicit instead of half-implementing them

## Lot 0 - Path And Lifecycle Audit Baseline

- [x] Create a central inventory of all `graphify-out/` and repo-root `.graphify_*` usages in runtime, skills, docs, and tests
- [x] Create a central inventory of all Git lifecycle assumptions in hooks, CLI, and skills
- [x] Confirm which state files are durable artifacts versus scratch/runtime metadata
- [x] Decide the canonical `.graphify/` internal layout:
  - [x] durable artifacts
  - [x] cache/transcripts/converted/memory
  - [x] scratch/runtime metadata
- [x] Record any path-contract decisions back into the relevant SPEC files before coding

## Lot 1 - State Path Abstraction

- [x] Add a single runtime path resolver for Graphify state instead of duplicating `graphify-out/...` joins
- [x] Define canonical getters for:
  - [x] state root
  - [x] graph path
  - [x] report path
  - [x] html path
  - [x] manifest path
  - [x] cost path
  - [x] cache path
  - [x] transcripts path
  - [x] scratch/tmp paths
- [x] Refactor CLI/runtime modules to use the shared path resolver
- [x] Refactor security/path validation to use the shared path resolver
- [x] Add tests for the new path contract before switching defaults

## Lot 2 - `.graphify/` Runtime Migration

- [x] Switch the default state root from `graphify-out/` to `.graphify/`
- [x] Move repo-root `.graphify_*.json` scratch files under `.graphify/`
- [x] Migrate:
  - [x] pipeline outputs
  - [x] cache storage
  - [x] transcript outputs
  - [x] converted Office-file sidecars
  - [x] watch/update markers
  - [x] MCP/default graph paths
- [x] Add a compatibility read window for legacy `graphify-out/` where it materially reduces breakage
- [x] Decide whether to provide an explicit migration command or do lazy migration on first run
- [x] Update tests that currently assert `graphify-out/...`

## Lot 3 - Git Hook And Worktree Correctness

- [ ] Replace filesystem-based git root/hook discovery with Git-native resolution:
  - [ ] `git rev-parse --show-toplevel`
  - [ ] `git rev-parse --absolute-git-dir`
  - [ ] `git rev-parse --git-common-dir`
  - [ ] `git rev-parse --git-path hooks`
- [ ] Make hook install/uninstall/status work in linked worktrees
- [ ] Extend lifecycle coverage beyond current hooks:
  - [ ] `post-commit`
  - [ ] `post-checkout`
  - [ ] `post-merge`
  - [ ] `post-rewrite`
- [ ] Keep hooks lightweight:
  - [ ] freshness markers first
  - [ ] rebuild only when safe and cheap
  - [ ] no heavy semantic work in hooks
- [ ] Add explicit tests for worktree-compatible hook behavior

## Lot 4 - Branch And Worktree Lifecycle Metadata

- [ ] Add `.graphify/worktree.json`
- [ ] Add `.graphify/branch.json`
- [ ] Define and persist:
  - [ ] branch name
  - [ ] worktree path
  - [ ] git dir / common dir
  - [ ] first-seen HEAD
  - [ ] last analyzed HEAD
  - [ ] merge-base or tracked upstream
  - [ ] freshness / stale-state markers
- [ ] Initialize lifecycle metadata lazily on first Graphify run in a branch/worktree
- [ ] Mark state stale on branch switches, merges, and rewrites
- [ ] Add cleanup/prune semantics for abandoned branch state without destructive automation

## Lot 5 - Skill Path Contract Migration

- [ ] Add a runtime-exposed path contract for skills instead of hardcoding `.graphify/...` or `graphify-out/...` strings everywhere
- [ ] Migrate Codex skill to the new path contract
- [ ] Migrate Claude skill to the new path contract
- [ ] Migrate Gemini custom command to the new path contract
- [ ] Migrate remaining assistant skills/platform docs to the new path contract
- [ ] Remove repo-root scratch path assumptions from skills
- [ ] Add lifecycle awareness to skills:
  - [ ] initialize metadata when missing
  - [ ] warn or rebuild on stale branch/worktree state
  - [ ] invalidate advisory recommendation state after merge/rewrite events
- [ ] Extend skill integration tests to assert the new state-root behavior

## Lot 6 - README, Install Surface, And Repo Narrative Refresh

- [ ] Update [README.md](README.md) for the new `.graphify/` state root
- [ ] Update [README.zh-CN.md](README.zh-CN.md) for the new `.graphify/` state root
- [ ] Update [README.ja-JP.md](README.ja-JP.md) for the new `.graphify/` state root
- [ ] Add a compact branch-model section:
  - [ ] `v3-typescript` as maintained TS product branch
  - [ ] `v3` as upstream mirror
- [ ] Add a concise alignment/divergence section:
  - [ ] aligned to upstream Graphify for product lineage and parity tracking
  - [ ] augmented by TS-native runtime/platform work
  - [ ] selectively informed by `code-review-graph` review-mode ideas
- [ ] Update `AGENTS.md`, `CLAUDE.md`, and install-generated instruction sections to reference `.graphify/`
- [ ] Ensure docs do not imply `.graphify/` should be committed

## Lot 7 - Minimal Review-Mode Foundation

- [ ] Implement a compact first-hop summary surface for assistants
- [ ] Make the first-hop summary intentionally small and deterministic
- [ ] Include:
  - [ ] graph size / density snapshot
  - [ ] top hubs / god nodes
  - [ ] key communities
  - [ ] next-best graph action
- [ ] Wire assistant skills to prefer this compact first hop before deep traversal where appropriate
- [ ] Add tests for response shape and determinism

## Lot 8 - Review-Delta / Review-PR Workflow

- [ ] Define the review-mode contract on top of the existing multimodal graph
- [ ] Implement a changed-files or diff-driven review entrypoint
- [ ] Compute an impacted subgraph instead of generic traversal only
- [ ] Surface:
  - [ ] impacted files
  - [ ] hub / bridge nodes
  - [ ] likely test gaps
  - [ ] high-risk dependency chains
- [ ] Decide the initial CLI and MCP surface:
  - [ ] `review-delta`
  - [ ] `review-pr`
  - [ ] or a narrower first iteration
- [ ] Keep this additive; do not narrow Graphify into a code-review-only product

## Lot 9 - Advisory Commit Recommendation Prototype

- [ ] Implement advisory-only commit grouping on top of branch/worktree metadata
- [ ] Base recommendations on Git-tracked changes plus graph impact, not on hidden state alone
- [ ] Include explicit confidence/staleness signals in recommendation output
- [ ] Keep the user as the actor:
  - [ ] no auto-stage
  - [ ] no auto-commit
  - [ ] no silent branch mutation
- [ ] Add risk-focused tests for stale state, rebases, and partial graphs

## Lot 10 - Review-Oriented Analysis And Evaluation

- [ ] Add review-facing analysis views where they materially improve actionability:
  - [ ] blast radius
  - [ ] bridge nodes
  - [ ] test-gap hints
  - [ ] impacted-community summaries
- [ ] Add an evaluation harness for the new review-mode surfaces
- [ ] Measure:
  - [ ] token savings versus naive file reads
  - [ ] impacted-file recall
  - [ ] review summary precision
  - [ ] multimodal regression safety
- [ ] Keep optional/stretch items explicitly deferred:
  - [ ] embeddings
  - [ ] SQLite backend
  - [ ] editor extension parity

## Lot 11 - Install And Platform Preview Improvements

- [ ] Add clearer install previews for platform-specific mutations
- [ ] Surface exactly which files and hooks will be written before install actions
- [ ] Verify all platform install/uninstall flows still behave correctly after the `.graphify/` migration
- [ ] Re-run integration coverage for Codex, Claude, Gemini, Copilot, Aider, OpenCode, Cursor, and other maintained surfaces

## Lot 12 - SPEC Refactor And Convergence

- [ ] Refactor [spec/SPEC_GRAPHIFY.md](spec/SPEC_GRAPHIFY.md) from aspirational design notes into the post-implementation product spec
- [ ] Refactor [spec/SPEC_CODE_REVIEW_GRAPH_OPPORUNITY.md](spec/SPEC_CODE_REVIEW_GRAPH_OPPORUNITY.md) to separate:
  - [ ] adopted opportunities
  - [ ] adapted opportunities
  - [ ] rejected/deferred opportunities
- [ ] Refactor [spec/SPEC_GAPHIFY_SLDC_STUDY.md](spec/SPEC_GAPHIFY_SLDC_STUDY.md) into:
  - [ ] what was implemented
  - [ ] what remained deferred
  - [ ] lessons learned / residual risks
- [ ] Remove or rewrite statements in the SPEC files that are no longer hypothetical
- [ ] Ensure the final README and the final SPEC set do not contradict each other on:
  - [ ] state root
  - [ ] branch model
  - [ ] lifecycle behavior
  - [ ] review-mode scope

## Exit Criteria

- [ ] `.graphify/` is the canonical runtime state root
- [ ] worktrees and branch lifecycle are handled correctly in hooks and runtime metadata
- [ ] assistant skills use a shared path contract instead of hardcoded legacy paths
- [ ] README and install surfaces explain the branch model and divergence/alignment cleanly
- [ ] at least one concrete review-mode workflow exists on top of the Graphify graph
- [ ] commit recommendation, if present, remains advisory and branch-aware
- [ ] SPEC documents have been refactored to describe the implemented system, not the pre-implementation intent
- [ ] full `npm test` passes on the final branch state
