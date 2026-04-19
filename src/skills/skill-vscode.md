---
name: graphify
description: "Use the TypeScript graphify CLI from VS Code Copilot Chat to build and query a project knowledge graph."
trigger: /graphify
---

# /graphify

Use graphify from VS Code Copilot Chat to build, update, and query the project knowledge graph stored in `.graphify/`.

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

## Minimal Execution

```bash
command -v graphify >/dev/null 2>&1 || npm install -g graphifyy
graphify . --wiki
```

VS Code Copilot Chat also reads `.github/copilot-instructions.md`, so graph context is always available without a hook.
