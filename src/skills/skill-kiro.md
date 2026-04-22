---
name: graphify
description: "Turn any folder of files into a TypeScript-backed knowledge graph with HTML, JSON, wiki, and audit report outputs."
trigger: /graphify
---

# /graphify

Use graphify to build, update, and query the project knowledge graph stored in `.graphify/`.

## Usage

```bash
/graphify .
/graphify . --update
/graphify . --cluster-only
/graphify . --pdf-ocr auto
/graphify . --wiki
/graphify query "architecture question"
/graphify summary --graph .graphify/graph.json
/graphify minimal-context --task "review PR" --graph .graphify/graph.json
/graphify review-delta --graph .graphify/graph.json
```

## Rules

- If no path is provided, use `.`.
- Run the installed TypeScript CLI with `graphify`, not Python.
- Before answering architecture questions, read `.graphify/GRAPH_REPORT.md` when it exists.
- If `.graphify/wiki/index.md` exists, navigate the wiki for deep questions.
- If `.graphify/graph.json` is missing but `graphify-out/graph.json` exists, run `graphify migrate-state --dry-run` before relying on legacy state.
- If `.graphify/needs_update` exists or `.graphify/branch.json` has `stale=true`, warn before relying on semantic results and run `/graphify . --update` when appropriate.
- After modifying code files, run `npx graphify hook-rebuild` to keep the graph current.

## CRG Review Workflow

`graphify minimal-context` is the first review call. Keep graph review context within `<=5 graph tool calls` and `<=800` graph-context tokens. Then follow only the compact route: `graphify detect-changes` for risk, `graphify affected-flows` for flow impact, and `graphify review-context` for snippets or radius detail. If `.graphify/flows.json` is missing and flows are needed, run `graphify flows build` first. If `.graphify/needs_update` exists or `.graphify/branch.json` has `stale=true`, warn and update before trusting semantic review output. Explicit `--files`, `--base`, `--head`, or `--staged` inputs override unrelated dirty worktree noise; mention dirty worktrees as a warning and never mutate git state.

## Configured Project Profiles

The profile activation rule is explicit: use this branch only when `graphify.yaml`, `graphify.yml`, `.graphify/config.yaml`, or `.graphify/config.yml` exists, or the invocation includes `--config` or `--profile`. If none is active, fallback to the existing non-profile workflow.

Configured profile workflow:
1. Keep the TypeScript runtime proof in `.graphify/.graphify_runtime.json`; it must contain `"runtime": "typescript"`.
2. Run `project-config` to normalize config/profile artifacts.
3. Run the `configured-dataprep` runtime command to produce `.graphify/profile/profile-state.json`, semantic detection, and registry extraction.
4. Run the `profile-prompt` runtime command and use that prompt for assistant semantic extraction.
5. Run base extraction validation, then the `profile-validate-extraction` runtime command.
6. Merge `.graphify/profile/registry-extraction.json` with AST and semantic extraction, then finalize through the existing build/report/export runtime commands.
7. Run the `profile-report` runtime command to write `.graphify/profile/profile-report.md`.
8. If `dataprep.image_analysis.enabled` is true, use `image-calibration-samples` and `image-calibration-replay` for calibration. The assistant may propose labels or rule changes, but TypeScript replay owns acceptance.
9. For batch image analysis, use `image-batch-export` and `image-batch-import`. A deep-pass export is allowed only when project-owned routing rules declare `decision: accept_matrix`; do not make production route decisions in the assistant.
10. If the profile declares `outputs.ontology.enabled: true`, run `ontology-output` to compile `.graphify/ontology/` after validated extraction exists.

Do not add MCP, embeddings, databases, direct provider SDKs, a resident LLM backend, or a forked OCR/PDF pipeline for this branch.

## Minimal Execution

```bash
command -v graphify >/dev/null 2>&1 || npm install -g graphifyy
graphify . --wiki
```

Kiro also receives `.kiro/steering/graphify.md` with `inclusion: always`, so graph context is available before each conversation.
