# SPEC_GAPHIFY_SLDC_STUDY

## Purpose

This document studies a concrete product and runtime evolution:

- move workspace state from `graphify-out/` to `.graphify/`
- make that state compatible with branch and worktree lifecycle handling
- prepare the ground for future commit recommendations without turning runtime state into committed source of truth
- identify the required skill, hook, CLI, README, and compatibility changes before implementation

This is a study document, not yet a commitment to cut code.

## Status

- Repo under study: `/home/antoinefa/src/graphify`
- Current maintained branch model:
  - `v3-typescript` is the product branch
  - `v3` mirrors upstream Python `v3`
- Current artifact convention:
  - visible output root: `graphify-out/`
  - auxiliary temp files split between repo root (`.graphify_*.json`) and `graphify-out/`

## Problem Statement

The current state layout has three structural issues.

### 1. State is split and noisy

Today Graphify writes durable outputs into `graphify-out/` while also leaving many runtime intermediates at repo root:

- `.graphify_detect.json`
- `.graphify_extract.json`
- `.graphify_analysis.json`
- `.graphify_labels.json`
- `.graphify_incremental.json`
- other `.graphify_*` files created by skills

That split is awkward:

- user-facing outputs are visible
- runtime scratch state leaks into the project root
- skills need to know both locations
- docs and tests hardcode those paths in many places

### 2. Branch/worktree lifecycle is under-modeled

Current hook logic and skill behavior assume a simpler repo model than real Git workflows:

- `src/hooks.ts` looks for a literal `.git` directory and will mis-handle worktrees, where `.git` is a file
- hooks only cover `post-commit` and `post-checkout`
- there is no explicit branch-begin, branch-end, merge, or rewrite lifecycle state
- runtime state does not record which branch or worktree produced it

### 3. Commit recommendations would be risky on top of the current layout

If Graphify eventually recommends commit boundaries or commit grouping, it needs workspace-local state that is:

- branch-aware
- worktree-aware
- clearly ignorable
- clearly not part of the codebase truth

The current `graphify-out/` plus root scratch model does not give a clean boundary for that.

## Current-State Inventory

The current repo hardcodes `graphify-out` widely:

- README and multilingual README examples
- `AGENTS.md` and `CLAUDE.md`
- `src/pipeline.ts`
- `src/transcribe.ts`
- `src/security.ts`
- `src/cache.ts`
- `src/detect.ts`
- `src/watch.ts`
- `src/serve.ts`
- `src/benchmark.ts`
- many platform skills under `src/skills/`
- many tests

The current hook implementation also assumes a non-worktree git layout:

- `src/hooks.ts` walks upward until it sees `.git`
- then writes hooks under `join(root, ".git", "hooks")`

That is not robust for linked worktrees, where hook resolution should go through Git itself, not filesystem assumptions.

## Study Goals

- Define a coherent hidden state root for Graphify runtime artifacts.
- Preserve the current user value of durable outputs, reports, and queryable graph state.
- Support worktree-local state isolation.
- Support branch lifecycle reconciliation and stale-state detection.
- Keep the path migration realistic for the current TS codebase and skill surface.
- Make future commit recommendations possible without making them auto-commit or silently authoritative.

## Non-Goals

- Introduce a remote service or shared backend.
- Share one mutable graph state across all worktrees of a repo.
- Commit runtime state by default.
- Replace the file-based architecture with SQLite or another database.
- Change the graph semantics or extraction model as part of this path migration alone.

## Recommended Target State

### Initial Implementation Decisions

Before switching defaults, the implementation should introduce a central path contract while keeping `graphify-out/` as the public default. The first implementation checkpoint deliberately separates path abstraction from path migration.

Decisions for the first checkpoint:

- `graphify-out/` remains the default state root until the migration lot explicitly changes it.
- `src/paths.ts` is the runtime owner for state-root resolution and canonical artifact paths.
- skill/runtime scratch files are modeled as state-root files even before every skill is migrated.
- current standalone build behavior may keep repo-root `.graphify_detect.json` temporarily as a named legacy scratch path.
- `.graphify/` is exposed as the next target state root, not enabled by default yet.

This keeps the first code lot behavior-preserving. It creates a seam for the later `.graphify/` switch without forcing the skill migration, README migration, and lifecycle metadata changes into the same patch.

Implementation checkpoint after the second lot:

- `.graphify/` becomes the default runtime state root for producers.
- legacy `graphify-out/graph.json` remains a read fallback for implicit graph consumers such as serve, query, and benchmark.
- no explicit migration command is introduced yet; fresh writes create `.graphify/`, while old users can still read existing `graphify-out/` graphs until the skill/docs migration catches up.
- root-level `.graphify_detect.json` is no longer the standalone build default; runtime scratch paths move under the state root.
- platform skill prose still needs its separate migration lot, because those files contain a much larger assistant-facing path contract.

Implementation checkpoint after the third lot:

- Git hook installation now resolves repositories through `git rev-parse`, not `.git` directory walking.
- hook paths use `git rev-parse --git-path hooks`, so install/status/uninstall work from linked worktrees.
- lifecycle coverage now includes `post-commit`, `post-checkout`, `post-merge`, and `post-rewrite`.
- hooks mark `.graphify/needs_update` first, then attempt a non-blocking code-only rebuild.
- semantic extraction remains outside hooks; branch metadata and recommendation invalidation stay in the next lifecycle lots.

Implementation checkpoint after the fourth lot:

- `.graphify/worktree.json` records worktree path, git dir, common git dir, first-seen HEAD, last-seen HEAD, and last analyzed HEAD.
- `.graphify/branch.json` records branch name, upstream, merge-base, first-seen HEAD, last-seen HEAD, last analyzed HEAD, and stale reason/timestamp.
- build and code-only rebuild paths lazily refresh lifecycle metadata; hook stale events call an internal `hook-mark-stale` command.
- `graphify state status` exposes current lifecycle metadata, and `graphify state prune` prints a non-destructive cleanup plan.
- stale branch/worktree state is tracked, but no hook deletes state automatically.

Implementation checkpoint after the fifth lot:

- the TypeScript skill runtime exposes the path contract through `runtime-info.paths` and a `paths` command.
- Codex, Gemini, Claude/Cursor/OpenCode generated instructions now point to `.graphify/` artifacts.
- bundled skills no longer instruct agents to create new `graphify-out/` paths or repo-root `.graphify_*.json` scratch files.
- bundled skills include lifecycle guidance for `.graphify/needs_update` and `.graphify/branch.json` stale state.
- skill integration tests assert `.graphify/` paths and lifecycle guidance.

### State root

Move Graphify runtime state under a single hidden workspace directory:

- `.graphify/graph.json`
- `.graphify/GRAPH_REPORT.md`
- `.graphify/graph.html`
- `.graphify/cache/`
- `.graphify/wiki/`
- `.graphify/memory/`
- `.graphify/transcripts/`
- `.graphify/converted/`
- `.graphify/manifest.json`
- `.graphify/cost.json`
- `.graphify/runtime.json`
- `.graphify/tmp/*.json` for build scratch and intermediate extraction files

Recommended principle:

- everything Graphify owns at runtime should live under `.graphify/`
- repo-root `.graphify_*.json` scratch files should disappear
- the state root should be ignorable and self-contained

### Path classes

The state root should distinguish three classes of files:

1. durable runtime artifacts
   - `graph.json`
   - `GRAPH_REPORT.md`
   - `graph.html`
   - `manifest.json`
   - `cost.json`

2. reusable derived caches
   - `cache/`
   - `transcripts/`
   - `converted/`
   - `memory/`

3. ephemeral execution scratch
   - detection snapshots
   - merge intermediates
   - temporary analysis files
   - incremental branch/worktree metadata

The study recommendation is to keep all three under `.graphify/`, but with a clear internal sublayout such as:

- `.graphify/artifacts/`
- `.graphify/cache/`
- `.graphify/runtime/`

For the first migration step, a flat `.graphify/` with `tmp/` is acceptable if it reduces blast radius.

## Why `.graphify/` Is Better Than `graphify-out/`

### Advantages

- hidden by default, so it stops dominating the project root
- single namespace for all Graphify-owned state
- easier to `.gitignore` correctly
- better fit for branch/worktree-local metadata
- easier to explain that this is runtime state, not project source

### Costs

- lower discoverability for humans browsing the repo root
- many docs/tests/skills will need updates
- hidden directories are skipped by some tools unless referenced directly
- existing user muscle memory and examples all point to `graphify-out/`

### Conclusion

The move is justified, but only if accompanied by:

- explicit CLI path helpers
- updated skills and docs
- a compatibility migration window

## Commit Recommendation Study

### The intended use

The likely future feature is not "Graphify commits things for the user". The safer interpretation is:

- Graphify analyzes branch-local work
- Graphify suggests coherent commit groupings or commit checkpoints
- the user remains the actor who stages and commits

### Why `.graphify/` helps

A hidden state directory allows Graphify to maintain branch-local recommendation state without polluting the repo root:

- current branch baseline
- merge-base or upstream tracking ref
- last analyzed HEAD
- changed subgraph summary
- suggested commit clusters
- stale-state flags after rebase/merge

### Risks

#### 1. Wrong authority boundary

If commit recommendations look too "official", users may trust stale or partial graph state over the actual git diff.

Mitigation:

- recommendations must always be advisory
- recommendation output must cite the current HEAD, merge-base, and analyzed file set
- stale state must disable or downgrade recommendation confidence

#### 2. Over-committing runtime artifacts

Users may accidentally force-add `.graphify/` and commit:

- caches
- transcripts
- downloaded media derivatives
- query memory
- stale graph outputs

Mitigation:

- keep `.graphify/` ignored by default
- do not recommend committing `.graphify/` state
- introduce an explicit export or snapshot command later if committed artifacts are ever needed

#### 3. Privacy and content leakage

Transcripts, ingested web content, screenshots, and derived summaries may contain sensitive material.

Mitigation:

- runtime state remains local and ignored
- any future commit recommendation logic must reason over git-tracked source changes, not over hidden derived files alone

### Recommendation

Use `.graphify/` as ignored advisory state only. Do not treat it as a committed review artifact by default.

If a committed deliverable is needed later, add a separate explicit export surface instead of repurposing `.graphify/`.

## Branch And Worktree Lifecycle Study

### Current lifecycle gap

Current Graphify does not model:

- first run on a newly created branch
- leaving a branch
- rebasing or rewriting commits
- branch deletion or archival
- multiple worktrees with shared git common dir

### Recommended lifecycle model

Each worktree should own its own `.graphify/` state. That keeps state local to the checkout and avoids crosstalk.

Recommended metadata files:

- `.graphify/worktree.json`
  - worktree path
  - git dir
  - common git dir
  - branch name
  - created/first-seen timestamp
- `.graphify/branch.json`
  - branch name
  - HEAD at first analysis
  - merge-base or tracked upstream ref
  - last analyzed HEAD
  - state freshness markers
- `.graphify/recommendation.json`
  - optional future advisory output for commit grouping

### Branch-begin behavior

On first Graphify run in a branch/worktree:

- detect worktree identity
- detect branch name and upstream
- record merge-base or baseline ref
- mark graph state as branch-initialized

This does not need a dedicated Git event hook. It can be lazy-initialized on first `graphify` invocation if no branch metadata exists.

### Branch-switch behavior

On `post-checkout`:

- detect branch switch
- compare previous/new branch
- mark current `.graphify/` state as stale if the branch changed materially
- optionally trigger a code-only rebuild when a graph already exists

### Merge/rewrite behavior

On `post-merge` and `post-rewrite`:

- invalidate recommendation state
- update branch baseline metadata
- optionally queue or trigger a rebuild depending on changed files

### Branch-end behavior

There is no native "branch ended" hook in Git. Practical handling should be:

- when checking out away from a branch, keep the worktree-local `.graphify/` directory in place
- mark it as belonging to the prior branch
- let a later cleanup command prune old branch state

Recommended cleanup surface:

- `graphify state gc`
- or `graphify state prune`

That is safer than trying to infer destructive lifecycle ends automatically.

## Hook Adaptation Study

### Current problems

- `src/hooks.ts` assumes `.git` is a directory
- hook installation path is computed through filesystem joins instead of Git path resolution
- hook coverage is incomplete for lifecycle use cases

### Required hook changes

Use Git commands as the source of truth:

- `git rev-parse --show-toplevel`
- `git rev-parse --absolute-git-dir`
- `git rev-parse --git-common-dir`
- `git rev-parse --git-path hooks`

Recommended hook coverage:

- `post-commit`
- `post-checkout`
- `post-merge`
- `post-rewrite`

Potentially later:

- `pre-commit` only if Graphify starts providing explicit advisory checks before commit

### Hook behavior recommendation

- hooks should be lightweight and safe to ignore on failure
- hooks should write freshness markers, not perform heavy semantic work blindly
- hooks should remain worktree-compatible and avoid assuming one shared working directory

## Skill Adaptation Study

### Current problem

Skills hardcode many paths like:

- `graphify-out/graph.json`
- `graphify-out/GRAPH_REPORT.md`
- `graphify-out/.graphify_detect.json`
- `graphify-out/.graphify_runtime.json`

This is the largest migration surface.

### Recommended skill strategy

Do not hand-edit every path in prose first. Add a runtime-owned path contract and migrate skills to use it.

Recommended runtime surface:

- a `graphify paths` command or equivalent runtime-info payload that emits:
  - state dir
  - graph path
  - report path
  - html path
  - detect path
  - semantic detect path
  - cache path
  - transcripts path

Then skills can bind once:

- `GRAPHIFY_STATE_DIR`
- `GRAPHIFY_GRAPH`
- `GRAPHIFY_REPORT`
- `GRAPHIFY_RUNTIME_SCRIPT`

and stop hardcoding `graphify-out/...` everywhere.

### Skill lifecycle adaptation

Skills should also become lifecycle-aware:

- if branch metadata says the graph is stale, they should rebuild or warn before query/path/explain
- if worktree metadata is missing, they should initialize it
- if a rebase/merge invalidated recommendation state, they should surface that explicitly rather than returning stale advice

## Security And Compatibility Risks

### Security path guards

`src/security.ts` currently defaults the allowed graph base to `graphify-out/`.

Migration impact:

- every path validator and MCP serve default must switch to `.graphify/`
- compatibility fallback may be needed for one release window

### Hidden directory discoverability

Some tooling ignores dot-directories by default.

Mitigation:

- skills and hooks must reference explicit paths, not rely on discovery
- CLI should expose commands like `graphify status` or `graphify paths`
- README examples should show exact paths

### Test and doc blast radius

The migration touches:

- platform integration tests
- skill tests
- README and multilingual docs
- `AGENTS.md` and `CLAUDE.md`
- path assertions in security, serve, benchmark, and install flows

This is a large but mechanical migration if the runtime path contract lands first.

## Recommended Migration Plan

### Phase 1: path abstraction

- add a central state-dir/path resolver in the runtime
- stop duplicating path logic across pipeline, serve, security, watch, hooks, and skills
- keep `graphify-out/` as a read fallback for one short compatibility window if needed

### Phase 2: `.graphify/` switch

- switch defaults to `.graphify/`
- move scratch files under `.graphify/tmp/`
- update docs, tests, and install surfaces
- allow read-compat from old `graphify-out/` where practical

### Phase 3: lifecycle metadata

- add worktree and branch metadata files
- make hooks use Git-native path resolution
- add `post-merge` and `post-rewrite`
- teach runtime/skills to invalidate stale recommendation state

### Phase 4: commit recommendation prototype

- advisory-only output
- based on git diff plus graph impact
- never auto-stage or auto-commit
- never rely on hidden state alone when computing recommendations

## README Implications

If `.graphify/` becomes the default state root, README evolution should be explicit:

- replace user-facing examples of `graphify-out/` with `.graphify/`
- explain that Graphify state is hidden and ignored by default
- add a short note that this helps branch/worktree-local operation and future review/commit assistance
- avoid suggesting that `.graphify/` should be committed

The README should also explain the branch model in the same revision:

- `v3-typescript` is the shipped TypeScript product line
- `v3` remains the upstream mirror line

That keeps the path migration and the repo narrative aligned instead of drifting separately.

## Recommendation

Proceed, but only with a deliberate phased migration.

The move from `graphify-out/` to `.graphify/` is justified because it:

- cleans up the workspace contract
- creates a proper home for branch/worktree-local state
- reduces root-level runtime noise
- makes future commit recommendations safer to model

The migration should not be a blind path rename. It should be implemented as:

1. path abstraction first
2. hook/worktree correctness second
3. skill/runtime lifecycle awareness third
4. commit recommendation experiments last

That sequencing keeps the risk bounded and prevents a half-migrated skill surface from becoming the new source of drift.
