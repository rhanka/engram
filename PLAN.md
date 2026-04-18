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

- [x] Replace filesystem-based git root/hook discovery with Git-native resolution:
  - [x] `git rev-parse --show-toplevel`
  - [x] `git rev-parse --absolute-git-dir`
  - [x] `git rev-parse --git-common-dir`
  - [x] `git rev-parse --git-path hooks`
- [x] Make hook install/uninstall/status work in linked worktrees
- [x] Extend lifecycle coverage beyond current hooks:
  - [x] `post-commit`
  - [x] `post-checkout`
  - [x] `post-merge`
  - [x] `post-rewrite`
- [x] Keep hooks lightweight:
  - [x] freshness markers first
  - [x] rebuild only when safe and cheap
  - [x] no heavy semantic work in hooks
- [x] Add explicit tests for worktree-compatible hook behavior

## Lot 4 - Branch And Worktree Lifecycle Metadata

- [x] Add `.graphify/worktree.json`
- [x] Add `.graphify/branch.json`
- [x] Define and persist:
  - [x] branch name
  - [x] worktree path
  - [x] git dir / common dir
  - [x] first-seen HEAD
  - [x] last analyzed HEAD
  - [x] merge-base or tracked upstream
  - [x] freshness / stale-state markers
- [x] Initialize lifecycle metadata lazily on first Graphify run in a branch/worktree
- [x] Mark state stale on branch switches, merges, and rewrites
- [x] Add cleanup/prune semantics for abandoned branch state without destructive automation

## Lot 5 - Skill Path Contract Migration

- [x] Add a runtime-exposed path contract for skills instead of hardcoding `.graphify/...` or `graphify-out/...` strings everywhere
- [x] Migrate Codex skill to the new path contract
- [x] Migrate Claude skill to the new path contract
- [x] Migrate Gemini custom command to the new path contract
- [x] Migrate remaining assistant skills/platform docs to the new path contract
- [x] Remove repo-root scratch path assumptions from skills
- [x] Add lifecycle awareness to skills:
  - [x] initialize metadata when missing
  - [x] warn or rebuild on stale branch/worktree state
  - [x] invalidate advisory recommendation state after merge/rewrite events
- [x] Extend skill integration tests to assert the new state-root behavior

## Lot 6 - README, Install Surface, And Repo Narrative Refresh

- [x] Update [README.md](README.md) for the new `.graphify/` state root
- [x] Update [README.zh-CN.md](README.zh-CN.md) for the new `.graphify/` state root
- [x] Update [README.ja-JP.md](README.ja-JP.md) for the new `.graphify/` state root
- [x] Add a compact branch-model section:
  - [x] `v3-typescript` as maintained TS product branch
  - [x] `v3` as upstream mirror
- [x] Add a concise alignment/divergence section:
  - [x] aligned to upstream Graphify for product lineage and parity tracking
  - [x] augmented by TS-native runtime/platform work
  - [x] selectively informed by `code-review-graph` review-mode ideas
- [x] Update `AGENTS.md`, `CLAUDE.md`, and install-generated instruction sections to reference `.graphify/`
- [x] Ensure docs do not imply `.graphify/` should be committed

## Lot 7 - Minimal Review-Mode Foundation

- [x] Implement a compact first-hop summary surface for assistants
- [x] Make the first-hop summary intentionally small and deterministic
- [x] Include:
  - [x] graph size / density snapshot
  - [x] top hubs / god nodes
  - [x] key communities
  - [x] next-best graph action
- [x] Wire assistant skills to prefer this compact first hop before deep traversal where appropriate
- [x] Add tests for response shape and determinism

## Lot 8 - Review-Delta / Review-PR Workflow

- [x] Define the review-mode contract on top of the existing multimodal graph
- [x] Implement a changed-files or diff-driven review entrypoint
- [x] Compute an impacted subgraph instead of generic traversal only
- [x] Surface:
  - [x] impacted files
  - [x] hub / bridge nodes
  - [x] likely test gaps
  - [x] high-risk dependency chains
- [x] Decide the initial CLI and MCP surface:
  - [x] `review-delta`
  - [x] `review-pr` deferred until the local delta contract is stable
  - [x] or a narrower first iteration
- [x] Keep this additive; do not narrow Graphify into a code-review-only product

## Lot 9 - Advisory Commit Recommendation Prototype

- [x] Implement advisory-only commit grouping on top of branch/worktree metadata
- [x] Base recommendations on Git-tracked changes plus graph impact, not on hidden state alone
- [x] Include explicit confidence/staleness signals in recommendation output
- [x] Keep the user as the actor:
  - [x] no auto-stage
  - [x] no auto-commit
  - [x] no silent branch mutation
- [x] Add risk-focused tests for stale state, rebases, and partial graphs

## Lot 10 - Review-Oriented Analysis And Evaluation

- [x] Add review-facing analysis views where they materially improve actionability:
  - [x] blast radius
  - [x] bridge nodes
  - [x] test-gap hints
  - [x] impacted-community summaries
- [x] Add an evaluation harness for the new review-mode surfaces
- [x] Measure:
  - [x] token savings versus naive file reads
  - [x] impacted-file recall
  - [x] review summary precision
  - [x] multimodal regression safety
- [x] Keep optional/stretch items explicitly deferred:
  - [x] embeddings
  - [x] SQLite backend
  - [x] editor extension parity

## Lot 11 - Install And Platform Preview Improvements

- [x] Add clearer install previews for platform-specific mutations
- [x] Surface exactly which files and hooks will be written before install actions
- [x] Verify all platform install/uninstall flows still behave correctly after the `.graphify/` migration
- [x] Re-run integration coverage for Codex, Claude, Gemini, Copilot, Aider, OpenCode, Cursor, and other maintained surfaces

## Lot 12 - SPEC Refactor And Convergence

- [x] Refactor [spec/SPEC_GRAPHIFY.md](spec/SPEC_GRAPHIFY.md) from aspirational design notes into the post-implementation product spec
- [x] Refactor [spec/SPEC_CODE_REVIEW_GRAPH_OPPORUNITY.md](spec/SPEC_CODE_REVIEW_GRAPH_OPPORUNITY.md) to separate:
  - [x] adopted opportunities
  - [x] adapted opportunities
  - [x] rejected/deferred opportunities
- [x] Refactor [spec/SPEC_GAPHIFY_SLDC_STUDY.md](spec/SPEC_GAPHIFY_SLDC_STUDY.md) into:
  - [x] what was implemented
  - [x] what remained deferred
  - [x] lessons learned / residual risks
- [x] Remove or rewrite statements in the SPEC files that are no longer hypothetical
- [x] Ensure the final README and the final SPEC set do not contradict each other on:
  - [x] state root
  - [x] branch model
  - [x] lifecycle behavior
  - [x] review-mode scope

## Lot 13 - TypeScript faster-whisper Runtime

- [x] Replace the previous transcription workaround with the published `faster-whisper-ts` runtime
- [x] Resolve/download CTranslate2 faster-whisper model directories without invoking Python
- [x] Align default model/runtime settings with upstream Graphify Python (`base`, CPU, `int8`)
- [x] Preserve URL ingestion through `yt-dlp` and the existing prompt/model env behavior
- [x] Update tests, README files, SPEC files, and generated skills to describe the TypeScript faster-whisper path
- [x] Validate targeted transcription tests, lint/build, full tests, and `npx graphify hook-rebuild`

## Exit Criteria

- [x] `.graphify/` is the canonical runtime state root
- [x] worktrees and branch lifecycle are handled correctly in hooks and runtime metadata
- [x] assistant skills use a shared path contract instead of hardcoded legacy paths
- [x] README and install surfaces explain the branch model and divergence/alignment cleanly
- [x] at least one concrete review-mode workflow exists on top of the Graphify graph
- [x] commit recommendation, if present, remains advisory and branch-aware
- [x] SPEC documents have been refactored to describe the implemented system, not the pre-implementation intent
- [x] full `npm test` passes on the final branch state
