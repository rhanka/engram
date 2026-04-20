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

Do not add MCP, embeddings, databases, or a forked OCR/PDF pipeline for this branch.

## Minimal Execution

```bash
command -v graphify >/dev/null 2>&1 || npm install -g graphifyy
graphify . --wiki
```

Kiro also receives `.kiro/steering/graphify.md` with `inclusion: always`, so graph context is available before each conversation.
