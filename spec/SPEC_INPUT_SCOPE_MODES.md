# SPEC_INPUT_SCOPE_MODES

## Status

Proposal branch: `spec/input-scope-modes`

This document frames a future additive change for Graphify input selection. It is not implemented in this branch.

## Problem

Graphify currently treats a requested folder as the corpus and then applies built-in pruning, `.graphifyignore`, sensitivity filters, and file-type classification. That is a good default for a knowledge-base folder, but too broad for a normal source repository:

- code repos often contain scratch files, generated artifacts, local notes, downloaded assets, or assistant outputs that are not part of the committed project;
- assistant skills currently cannot clearly distinguish "analyze this codebase" from "analyze this folder as a knowledge base";
- scanning everything by default increases cost and can make graph content less trustworthy.

The requested product behavior is to support two explicit use cases:

- code/review usage: default to the committed project surface;
- knowledge-base usage: allow the skill to suggest or use another directory/corpus scope.

## Design Decision

Recommended approach: add an input scope layer before `detect()`.

The layer chooses the file inventory but does not change classification, extraction, semantic validation, report generation, OCR/PDF handling, or profile behavior.

Rejected alternatives:

- Warn-only: keeps today's unsafe over-scan behavior and relies on every assistant to remember the caveat.
- Always tracked: breaks non-Git knowledge-base folders and hides explicit corpus workflows.
- New knowledge-base pipeline: unnecessary and likely to diverge from the existing multimodal pipeline.

## Scope Modes

### `auto`

Default public behavior.

- If an explicit `graphify.yaml`/`--config` profile is active, use configured `inputs.corpus`; project config is already an explicit opt-in.
- If the target is inside a Git repository with a valid `HEAD`, use `committed`.
- If the target is not inside a Git repository, use `all`.
- If Git exists but `HEAD` is missing, use `all` and emit a warning.

### `committed`

Code/review default for Git repositories.

- File inventory comes from `git ls-tree -r --name-only HEAD -- <target>`.
- Graphify reads current worktree file contents for those committed paths when files still exist.
- New untracked files are excluded until committed.
- Deleted committed files are skipped with a count in scope diagnostics.
- Existing `.graphifyignore`, sensitivity filtering, noise-dir pruning, and file classification still apply.

This matches "only committed files" while still allowing modified content in committed files to be analyzed during active development.

### `tracked`

Optional developer mode.

- File inventory comes from Git tracked/index paths.
- Staged new files can be included.
- Untracked scratch files remain excluded.

This is useful when the user intentionally wants staged additions before commit, but it should not be the default.

### `all`

Knowledge-base and legacy-compatible mode.

- File inventory is the current recursive folder walk.
- Existing pruning and `.graphifyignore` rules still apply.
- Skills should recommend this only when the user asks for a corpus folder, paper folder, notes folder, screenshots, media, or a non-code knowledge base.

## Config And CLI Surface

Minimal future surface:

- `graphify <path> --scope auto|committed|tracked|all`
- `graphify update <path> --scope auto|committed|tracked|all`
- `graphify scope inspect <path> --scope auto|committed|tracked|all`
- `graphify.yaml` optional key: `inputs.scope: auto|committed|tracked|all`

Precedence:

1. CLI `--scope`
2. `graphify.yaml` `inputs.scope`
3. `auto`

Profile/configured projects keep existing explicit corpus behavior. `inputs.scope` only affects how file inventories are built for configured corpus roots; it must not override `inputs.exclude`.

## Diagnostics

Each run should write `.graphify/scope.json`:

```json
{
  "version": 1,
  "mode": "committed",
  "resolved_mode": "committed",
  "root": ".",
  "git_root": ".",
  "head": "abc123",
  "included_files": 42,
  "excluded_untracked_files": 7,
  "missing_committed_files": 1,
  "recommendation": "Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder."
}
```

`GRAPH_REPORT.md` should include a short corpus scope line so assistants and humans know whether the graph represents committed code or a broader corpus.

## Assistant Skill Behavior

Skills should make the distinction explicit:

- For architecture, code review, branch impact, or commit planning, run or update Graphify in `auto` mode, which becomes committed scope in Git repos.
- If the user asks to analyze a folder of papers, notes, screenshots, audio/video, exported docs, or a product knowledge base, suggest an explicit corpus folder and `--scope all`, or a `graphify.yaml` with `inputs.corpus`.
- If a Git repo contains many untracked documents/media, do not silently include them in code mode. Report that they are outside the committed code scope and suggest a corpus run.
- Do not stage, commit, move, or delete files as part of scope selection.

## Compatibility

- Existing extraction, validation, semantic cache, PDF/OCR, transcription, profile dataprep, graph build, report, export, and wiki code paths remain reused.
- Default behavior changes only for Git repositories without explicit config. This is intentional and should be documented as a safety correction.
- `--scope all` preserves the current folder-walk behavior.
- `.graphifyignore` remains authoritative after scope inventory selection.
- Sensitive-file filtering remains mandatory in every scope.

## Implementation Notes

Add a small input-inventory module instead of embedding Git logic in `detect.ts`.

Expected units:

- `src/input-scope.ts`: resolve mode, inspect Git context, enumerate candidate files.
- `src/detect.ts`: accept an optional candidate file list and keep classification unchanged.
- `src/project-config.ts`: normalize optional `inputs.scope`.
- `src/skill-runtime.ts` and `src/cli.ts`: expose runtime/CLI options and `scope inspect`.
- `src/skills/*`: document the code vs knowledge-base decision.
- `tests/input-scope.test.ts`: Git and non-Git inventory behavior.
- `tests/detect.test.ts` or `tests/pipeline.test.ts`: prove classification/extraction consumes scoped candidates.
- `tests/skills.test.ts`: prove skill instructions mention committed-code default and corpus override.

## Test Strategy

Required tests:

- Git repo with committed `src/a.ts` and untracked `scratch.ts`: `auto` includes `src/a.ts` and excludes `scratch.ts`.
- Same repo with `--scope all`: includes both files if not ignored/sensitive.
- Same repo with staged new file and `tracked`: includes staged path.
- Non-Git temp folder with docs/images: `auto` resolves to `all`.
- `graphify.yaml inputs.scope: all` includes explicit corpus files.
- `.graphifyignore` excludes a file even if Git inventory selected it.
- Sensitive files are excluded in every scope.
- `scope inspect` emits deterministic counts without building a graph.

## Open Risks

- Users may expect untracked newly-created source files to appear in code graphs before commit. The skill should surface this as a scope diagnostic, not hide it.
- Git submodules and nested repos need a conservative first implementation. Treat nested Git roots as ordinary folders unless explicitly targeted.
- Worktrees must resolve paths through Git commands, not `.git` filesystem assumptions.
