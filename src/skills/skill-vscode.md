---
name: engram
description: "any input (code, docs, papers, images) -> knowledge graph -> clustered communities -> HTML + JSON + audit report. Use when user asks any question about a codebase, project content, architecture, or file relationships, especially if .engram/ exists. Provides persistent graph with god nodes, community detection, and BFS/DFS query tools."
trigger: /engram
---

# /engram

> Alias: `/graphify` still triggers this skill (deprecated alias for `/engram`).

Use Engram from VS Code Copilot Chat to build, update, and query the project knowledge graph stored in `.engram/`.

## Usage

```bash
/engram .
/engram . --update
/engram . --cluster-only
/engram . --pdf-ocr auto
/engram . --wiki
engram wiki describe --graph .engram/graph.json --mode assistant --targets all
engram export wiki --graph .engram/graph.json --descriptions .engram/wiki/descriptions.json
engram export obsidian --graph .engram/graph.json --descriptions .engram/wiki/descriptions.json
/engram query "architecture question"
/engram summary --graph .engram/graph.json
/engram minimal-context --task "review PR" --graph .engram/graph.json
/engram review-delta --graph .engram/graph.json
```

## Rules

- If no path is provided, use `.`.
- Run the installed TypeScript CLI with `engram`, not Python.
- For architecture or codebase questions, when `.engram/graph.json` exists, first run `engram query "<question>"` (or `engram path "<A>" "<B>"` / `engram explain "<concept>"`); read `.engram/GRAPH_REPORT.md` only for broad architecture review or when those commands don't surface enough context.
- If `.engram/wiki/index.md` exists, navigate the wiki for deep questions.
- If `.engram/graph.json` is missing but `graphify-out/graph.json` exists, run `engram migrate-state --dry-run` before relying on legacy state.
- If `.engram/needs_update` exists or `.engram/branch.json` has `stale=true`, warn before relying on semantic results and run `/engram . --update` when appropriate.
- Wiki descriptions are explicit opt-in: first run `engram wiki describe --graph .engram/graph.json --mode assistant --targets all` or `--mode direct --backend <provider>`, then render wiki or Obsidian with `--descriptions .engram/wiki/descriptions.json`. Sidecars live under `.engram/wiki/descriptions/`, record graph hash, prompt/generator provenance, evidence refs, and cache keys, may reuse existing generated sidecars, omit `insufficient_evidence` descriptions from rendered pages, and never mutate `.engram/graph.json`.
- `engram cite .` (alias `ground-citations`) grounds per-entity `node.citations[]` (`{quote, source_file, source_location}`) by scanning the corpus — heuristic + no-key by default (`--mode heuristic|assistant|api`), anti-hallucination (every quote a verified verbatim substring of the source), opt-in and symmetric to `describe`/`label`. Run it BEFORE the studio/wiki export for non-null citations.
- Before proposing or committing `.engram` artifacts, run `engram portable-check .engram`; commit-safe graph artifacts must use repo-relative paths, and never commit `.engram/branch.json`, `.engram/worktree.json`, `.engram/needs_update`, or `.engram/cache/`. If a repo already tracks any of them, first add them to `.gitignore`, then propose `git rm --cached .engram/branch.json .engram/worktree.json .engram/needs_update` and `git rm -r --cached .engram/cache`; never mutate git state without asking.
- An existing `.graphify/` state dir is still read as a legacy fallback; new writes go to `.engram/`.
- After modifying code files, run `npx engram hook-rebuild` to keep the graph current.

## CRG Review Workflow

`engram minimal-context` is the first review call. Keep graph review context within `<=5 graph tool calls` and `<=800` graph-context tokens. Then follow only the compact route: `engram detect-changes` for risk, `engram affected-flows` for flow impact, and `engram review-context` for snippets or radius detail. If `.engram/flows.json` is missing and flows are needed, run `engram flows build` first. If `.engram/needs_update` exists or `.engram/branch.json` has `stale=true`, warn and update before trusting semantic review output. Explicit `--files`, `--base`, `--head`, or `--staged` inputs override unrelated dirty worktree noise; mention dirty worktrees as a warning and never mutate git state.

## Configured Project Profiles

The profile activation rule is explicit: use this branch only when `graphify.yaml`, `graphify.yml`, `.engram/config.yaml`, or `.engram/config.yml` exists, or the invocation includes `--config` or `--profile`. If none is active, fallback to the existing non-profile workflow.

Configured profile workflow:
1. Keep the TypeScript runtime proof in `.engram/.graphify_runtime.json`; it must contain `"runtime": "typescript"`.
2. Run `project-config` to normalize config/profile artifacts.
3. Run the `configured-dataprep` runtime command to produce `.engram/profile/profile-state.json`, semantic detection, and registry extraction.
4. Run the `profile-prompt` runtime command and use that prompt for assistant semantic extraction.
5. Run base extraction validation, then the `profile-validate-extraction` runtime command.
6. Merge `.engram/profile/registry-extraction.json` with AST and semantic extraction, then finalize through the existing build/report/export runtime commands.
7. Run the `profile-report` runtime command to write `.engram/profile/profile-report.md`.
8. If ontology discovery is requested, run `profile-discovery-sample`, use its prompt to produce `.engram/ontology/discovery/proposals.json`, then run `profile-discovery-diff`; present the diff/report to the user and wait for approval before any apply step.
9. If `dataprep.image_analysis.enabled` is true, use `image-calibration-samples` and `image-calibration-replay` for calibration. The assistant may propose labels or rule changes, but TypeScript replay owns acceptance.
10. For batch image analysis, use `image-batch-export` and `image-batch-import`. A deep-pass export is allowed only when project-owned routing rules declare `decision: accept_matrix`; do not make production route decisions in the assistant.
11. If the profile declares `outputs.ontology.enabled: true`, run `ontology-output` to compile `.engram/ontology/` after validated extraction exists.

## Ontology Lifecycle Patches

Use ontology lifecycle commands only when profile artifacts and `.engram/ontology/` outputs already exist. Review decisions are patches against project-owned sources, not direct graph mutations. Assistants may propose patches, but must validate before dry-run and dry-run before write.

- Validate with `ontology-patch-validate --profile-state .engram/profile/profile-state.json --patch patch.json`.
- Preview with `ontology-patch-apply --profile-state .engram/profile/profile-state.json --patch patch.json --dry-run`.
- Write with `ontology-patch-apply --profile-state .engram/profile/profile-state.json --patch patch.json --write` only after explicit user approval.
- Always warn if the Git worktree is dirty before proposing a write apply.
- Agents must not edit `.engram/graph.json` or derived `.engram/ontology/*.json` directly.
- The default MCP server stays read-only; mutation tools require explicit `engram ontology serve --config graphify.yaml --write`.
- Use the Public Domain Mystery Sagas repo as an external UAT and UI-mock corpus only; do not add its real corpus as Engram package fixtures.

Do not add embeddings, databases, a resident LLM backend, or a forked OCR/PDF pipeline for this branch.

## Minimal Execution

```bash
command -v engram >/dev/null 2>&1 || command -v graphify >/dev/null 2>&1 || npm install -g @sentropic/engram
engram . --wiki
```

VS Code Copilot Chat also reads `.github/copilot-instructions.md`, so graph context is always available without a hook.
