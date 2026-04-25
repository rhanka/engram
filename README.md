# graphify

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja-JP.md)

[![TypeScript CI](https://github.com/rhanka/graphify/actions/workflows/typescript-ci.yml/badge.svg?branch=main)](https://github.com/rhanka/graphify/actions/workflows/typescript-ci.yml)

**An AI coding assistant skill.** Type `/graphify` in Claude Code, Gemini CLI, VS Code Copilot Chat, GitHub Copilot CLI, Aider, OpenCode, OpenClaw, Factory Droid, Trae, Kiro, or Google Antigravity, or `$graphify` in Codex - it reads your files, builds a knowledge graph, and gives you back structure you didn't know was there. Understand a codebase faster. Find the "why" behind architectural decisions.

This repository is the maintained TypeScript port of the original Graphify project. Thanks to the original work by [Safi Shamsi](https://github.com/safishamsi/graphify) for the product direction, workflow, and initial implementation.

Multimodal, with the TypeScript port now closed through the upstream Python Graphify `v4` line and prepared as `graphifyy@0.4.33`, while smaller `v5` repo-oriented workflows are tracked explicitly in this fork instead of being hidden. Code, Markdown, MDX, HTML, PDFs, Office docs, screenshots, diagrams, and other images flow through the current TS runtime. PDFs go through a local preflight: text-layer PDFs are converted with `pdf-parse` and a `pdftotext` fallback when available, while scanned/low-text PDFs can be converted to Markdown + images through `mistral-ocr`. Local audio/video detection uses `yt-dlp` + `ffmpeg` + `faster-whisper-ts`, and generated transcripts/PDF sidecars feed the same assistant-driven semantic pass as docs and papers. 20 languages are supported via tree-sitter AST (Python, JS, TS, Go, Rust, Java, C, C++, Ruby, C#, Kotlin, Scala, PHP, Swift, Lua, Zig, PowerShell, Elixir, Objective-C, Julia), with upstream-aligned fallback support for Vue, Svelte, Blade, Dart, Verilog/SystemVerilog, MJS, and EJS.

## Branch Model

- `main` is the maintained TypeScript product branch and the default branch for this repository.
- `v3` is kept as an upstream mirror / alignment branch for the original Python Graphify lineage.
- The `v4` parity line is closed in the TypeScript product through `graphifyy@0.4.33`; ongoing upstream work, including the smaller `v5` repo-oriented additions, stays explicit in `UPSTREAM_GAP.md`.
- npm publication is guarded by GitHub Actions trusted publishing. Release tags are only valid when the tagged commit is already contained in the default branch and the tag version matches `package.json`.

## Lineage And Alignment

| Source | What this repo keeps or adapts | Alignment contract |
|---|---|---|
| Original Graphify by [Safi Shamsi](https://github.com/safishamsi/graphify) | Core product idea: folder -> knowledge graph, assistant skill workflow, graph/report/html outputs, provenance labels, community detection, and multimodal corpus workflow. | `v3` mirrors upstream Python Graphify history; `UPSTREAM_GAP.md` tracks the closed `v4` line and the active `v5` catch-up work. |
| This TypeScript port | npm package, TypeScript runtime at repo root, `.graphify/` state, multi-assistant installers, MCP surfaces, git/worktree lifecycle, and local audio/video transcription through the TS toolchain. | `main` is the maintained default branch; TS-specific behavior is documented as deliberate divergence, not upstream parity. |
| `code-review-graph` reference | Review-oriented graph projections: first-hop summary, review delta, review analysis, review evaluation, install previews, and advisory commit grouping vocabulary. | Adopted as additive review surfaces over Graphify's graph; Graphify does not become review-only, does not adopt SQLite/embeddings as default, and keeps multimodal support. |

> Andrej Karpathy keeps a `/raw` folder where he drops papers, tweets, screenshots, and notes. graphify is the answer to that problem - 71.5x fewer tokens per query vs reading the raw files, persistent across sessions, honest about what it found vs guessed.

```bash
$graphify .                        # Codex
/graphify .                        # Claude Code / Gemini CLI / Copilot / Aider / OpenCode / OpenClaw / Droid / Trae / Kiro / Antigravity
graphify clone https://github.com/<owner>/<repo>
graphify merge-graphs repo-a/.graphify/graph.json repo-b/.graphify/graph.json --out .graphify/cross-repo-graph.json
```

In Codex, `$graphify` is a skill trigger, not a Bash subcommand like `graphify .`. A successful TypeScript-backed Codex run should leave `.graphify/.graphify_runtime.json` with `runtime: "typescript"`.

```
.graphify/
├── graph.html       interactive graph - click nodes, search, filter by community
├── GRAPH_REPORT.md  god nodes, surprising connections, suggested questions
├── graph.json       persistent graph - query weeks later without re-reading
├── wiki/            optional LLM-readable wiki pages
├── flows.json       optional execution-flow artifact
├── branch.json      local branch lifecycle state - ignored
├── worktree.json    local worktree lifecycle state - ignored
└── cache/           local SHA256 cache - ignored
```

`.graphify/` is split between commit-safe graph artifacts and local lifecycle state. `graph.json`, `GRAPH_REPORT.md`, `graph.html`, `flows.json`, and `wiki/` are written with repo-relative paths so they can be committed when a project wants graph context to follow branches and worktrees. Before proposing or committing those artifacts, run:

```bash
graphify portable-check .graphify
```

Never commit `.graphify/branch.json`, `.graphify/worktree.json`, `.graphify/needs_update`, caches, transcripts, converted PDF/OCR sidecars, or profile runtime scratch. Those files are local to the current worktree and may contain absolute paths by design.

If an older repo still has `graphify-out/`, run `graphify migrate-state --dry-run` first. The migration copies local state into `.graphify/` without deleting the legacy folder; when `graphify-out` is tracked, the command prints the `git mv -f graphify-out .graphify` + commit message to review before you mutate Git history.

`graphify recommend-commits` is advisory-only: it suggests groups and messages from Git changes plus graph impact, but it never stages files, creates commits, or mutates branches.

`graphify review-analysis` adds review-specific views for blast radius, bridge nodes, test-gap hints, impacted communities, and multimodal/doc regression safety. `graphify review-eval` measures token savings versus naive file reads, impacted-file recall, review summary precision, and multimodal regression safety from JSON cases.

Review benchmarks are deterministic local fixtures, not a universal quality guarantee. Review impact rules intentionally favor recall over precision, and false positives are reported instead of hidden. Flow quality depends on parser and call-direction metadata; it is weaker when language support is fallback-only or when directed calls cannot be recovered. Token metrics are estimates unless backed by actual model calls.

Add a `.graphifyignore` file to exclude folders you don't want in the graph:

```
# .graphifyignore
vendor/
node_modules/
dist/
*.generated.py
```

Same syntax as `.gitignore`. Patterns are discovered from the folder you run graphify on and its ancestors up to the git root, then matched against paths relative to the folder being scanned.

## Choosing input scope

Graphify now distinguishes safe code/review scans from full knowledge-base crawls.

- Scope-aware commands default to `--scope auto`.
- In a Git repo with `HEAD`, `auto` resolves to committed files plus `.graphify/memory/*`.
- `--scope tracked` also includes newly staged files that are not committed yet.
- `--all` is an alias for `--scope all` and restores the recursive folder walk. Use it for papers, notes, screenshots, media corpora, or non-Git folders.
- `graphify scope inspect . --scope auto` shows the resolved inventory before you rebuild anything.
- Configured projects can pin the default inventory with `graphify.yaml`:

```yaml
inputs:
  scope: all
```

The scope inventory currently applies to `detect`, `detect-incremental`, `update`, `watch`, `hook-rebuild`, and configured profile dataprep. Detection metadata is written to `.graphify/scope.json` and summarized in `GRAPH_REPORT.md`.

## How it works

graphify combines a deterministic structural pass with a model-backed semantic pass, with local preprocessing in between when needed. Code goes through a no-LLM AST pass that extracts classes, functions, imports, call graphs, docstrings, and rationale comments. Docs, papers, Office files, and images are normalized into text or multimodal inputs, then platform-backed subagents extract concepts, relationships, and design rationale. PDFs first pass a local preflight: if a usable text layer exists, `pdf-parse` or the local `pdftotext` CLI creates a Markdown sidecar; if the text layer is missing or too sparse, `mistral-ocr` can be called in `auto` or `always` mode to produce Markdown plus extracted images. PDF-extracted images are still semantic inputs when they carry meaning: the assistant vision model can decode them directly, or a configured delegated OCR/vision model can be used while preserving PDF provenance. Audio/video files are also detected locally, normalized through `ffmpeg`, transcribed through the TypeScript runtime with `faster-whisper-ts`, and fed into the same semantic extraction path as any other document. The results are merged into a Graphology graph, clustered with Louvain community detection, and exported as interactive HTML, queryable JSON, and a plain-language audit report.

**Clustering is graph-topology-based — no embeddings.** Louvain finds communities by edge density. The semantic similarity edges that the model extracts (`semantically_similar_to`, marked INFERRED) are already in the graph, so they influence community detection directly. The graph structure is the similarity signal — no separate embedding step or vector database needed.

Every relationship is tagged `EXTRACTED` (found directly in source), `INFERRED` (reasonable inference, with a confidence score), or `AMBIGUOUS` (flagged for review). You always know what was found vs guessed.

## Install

**Requires:** Node.js 20+ and one of: [Claude Code](https://claude.ai/code), [Codex](https://openai.com/codex), [Gemini CLI](https://github.com/google-gemini/gemini-cli), VS Code Copilot Chat, [GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli), [Aider](https://aider.chat), [OpenCode](https://opencode.ai), [OpenClaw](https://openclaw.ai), [Factory Droid](https://factory.ai), [Trae](https://trae.com), [Cursor](https://cursor.com), Hermes, Kiro, or Google Antigravity.

```bash
npm install -g graphifyy
graphify install
```

> The npm package is temporarily named `graphifyy` while the `graphify` name is being reclaimed. The CLI and skill command are still `graphify`.

Install commands print a mutation preview before writing files, including the exact assistant instruction files and hook/MCP/plugin config they will touch.

### Platform support

| Platform | Install command |
|----------|----------------|
| Claude Code (Linux/Mac) | `graphify install` |
| Claude Code (Windows) | `graphify install` (auto-detected) or `graphify install --platform windows` |
| Codex | `graphify install --platform codex` |
| Gemini CLI | `graphify install --platform gemini` |
| GitHub Copilot CLI | `graphify install --platform copilot` |
| VS Code Copilot Chat | `graphify install --platform vscode` |
| Aider | `graphify install --platform aider` |
| OpenCode | `graphify install --platform opencode` |
| OpenClaw | `graphify install --platform claw` |
| Factory Droid | `graphify install --platform droid` |
| Trae | `graphify install --platform trae` |
| Trae CN | `graphify install --platform trae-cn` |
| Cursor | `graphify install --platform cursor` |
| Hermes | `graphify install --platform hermes` |
| Kiro | `graphify install --platform kiro` |
| Google Antigravity | `graphify install --platform antigravity` |

Codex users also need `multi_agent = true` under `[features]` in `~/.codex/config.toml` for parallel extraction. Gemini CLI exposes `/graphify` through a custom command installed into `~/.gemini/commands/graphify.toml`, and the project install writes `.gemini/settings.json` so Gemini can use `graphify serve` as an MCP server. GitHub Copilot CLI installs a global `~/.copilot/skills/graphify/SKILL.md`; VS Code Copilot Chat installs the same global skill plus project `.github/copilot-instructions.md`. Aider uses a global `~/.aider/graphify/SKILL.md`, but semantic extraction stays sequential there because multi-agent dispatch is still early on that platform. OpenCode installs a project-local `tool.execute.before` plugin in `.opencode/plugins/graphify.js` and registers it in `.opencode/opencode.json`, so OpenCode gets the same graph reminder before bash tool calls. Factory Droid uses the `Task` tool for parallel subagent dispatch. OpenClaw and Hermes use sequential extraction. Kiro writes a project `.kiro/skills/graphify/SKILL.md` plus always-on `.kiro/steering/graphify.md`. Google Antigravity writes `.agent/rules/graphify.md`, `.agent/workflows/graphify.md`, and a global `~/.agent/skills/graphify/SKILL.md`. Trae uses the Agent tool for parallel subagent dispatch and does **not** support PreToolUse hooks — AGENTS.md is the always-on mechanism.

Then open your AI coding assistant and invoke the skill:

```bash
$graphify .                        # Codex
/graphify .                        # Claude Code / Gemini CLI / Copilot / Aider / OpenCode / OpenClaw / Droid / Trae / Kiro / Antigravity
```

### Make your assistant always use the graph (recommended)

After building a graph, run this once in your project:

| Platform | Command |
|----------|---------|
| Claude Code | `graphify claude install` |
| Codex | `graphify codex install` |
| Gemini CLI | `graphify gemini install` |
| GitHub Copilot CLI | `graphify copilot install` |
| VS Code Copilot Chat | `graphify vscode install` |
| Aider | `graphify aider install` |
| OpenCode | `graphify opencode install` |
| OpenClaw | `graphify claw install` |
| Factory Droid | `graphify droid install` |
| Trae | `graphify trae install` |
| Trae CN | `graphify trae-cn install` |
| Cursor | `graphify cursor install` |
| Hermes | `graphify hermes install` |
| Kiro | `graphify kiro install` |
| Google Antigravity | `graphify antigravity install` |

**Claude Code** does two things: writes a `CLAUDE.md` section telling Claude to read `.graphify/GRAPH_REPORT.md` before answering architecture questions, and installs a **PreToolUse hook** (`settings.json`) that fires before every Glob and Grep call. If a knowledge graph exists, Claude sees: _"graphify: Knowledge graph exists. Read GRAPH_REPORT.md for god nodes and community structure before searching raw files."_ — so Claude navigates via the graph instead of grepping through every file.

**Codex** writes to `AGENTS.md`, teaches Codex to use the installed `graphify` skill for graph build/update/query tasks, and also installs a **PreToolUse hook** in `.codex/hooks.json` that fires before every Bash tool call.

**Gemini CLI** writes `GEMINI.md` in your project root and registers a project-scoped `graphify` MCP server in `.gemini/settings.json`. Gemini CLI does not have a Claude/Codex-style PreToolUse hook, so `GEMINI.md` is the always-on mechanism and `/graphify` is the explicit custom command.

**GitHub Copilot CLI** installs the global `graphify` skill in `~/.copilot/skills/graphify/SKILL.md`. There is no separate project-scoped hook in this port, so `/graphify` is the explicit entrypoint.

**VS Code Copilot Chat** installs the global `graphify` skill and writes `.github/copilot-instructions.md`, so Copilot Chat sees the graph rules automatically in the repository and `/graphify` remains the explicit entrypoint.

**Aider** writes `AGENTS.md` in your project root and relies on the installed global skill in `~/.aider/graphify/SKILL.md`. Semantic extraction is sequential there, so expect it to be slower than Codex/OpenCode on large doc-heavy corpora.

**OpenCode** writes to `AGENTS.md` and installs a project-local `tool.execute.before` plugin in `.opencode/plugins/graphify.js`, registered via `.opencode/opencode.json`, so bash tool calls get the same graph reminder before raw-file traversal.

**Cursor** writes `.cursor/rules/graphify.mdc` with `alwaysApply: true`, so Cursor always sees the graph context before it starts crawling raw files.

**Kiro** writes `.kiro/skills/graphify/SKILL.md`, a `.graphify_version` marker, and `.kiro/steering/graphify.md` with `inclusion: always`, so graph context is present before conversations.

**Google Antigravity** writes `.agent/rules/graphify.md`, `.agent/workflows/graphify.md`, and a global `~/.agent/skills/graphify/SKILL.md`; the rules/workflow files are the always-on mechanism.

**Hermes** installs a global `~/.hermes/skills/graphify/SKILL.md` and uses the same explicit `/graphify` skill contract.

**OpenClaw, Factory Droid, Trae** write the same rules to `AGENTS.md` in your project root. These platforms don't support PreToolUse hooks, so AGENTS.md is the always-on mechanism.

Uninstall with the matching uninstall command (e.g. `graphify claude uninstall`).

**Always-on vs explicit trigger — what's the difference?**

The always-on hook surfaces `GRAPH_REPORT.md` — a one-page summary of god nodes, communities, and surprising connections. Your assistant reads this before searching files, so it navigates by structure instead of keyword matching. That covers most everyday questions.

The explicit skill commands (`$graphify ...` in Codex, `/graphify ...` in Claude-style clients) go deeper: they traverse the raw `graph.json` hop by hop, trace exact paths between nodes, and surface edge-level detail (relation type, confidence score, source location). Use them when you want a specific question answered from the graph rather than a general orientation.

Think of it this way: the always-on hook gives your assistant a map. The explicit graphify skill commands let it navigate the map precisely.

## Using `graph.json` with an LLM

`graph.json` is not meant to be pasted into a prompt all at once. The useful
workflow is:

1. Start with `.graphify/GRAPH_REPORT.md` for the high-level overview.
2. Use `graphify query` to pull a smaller subgraph for the specific question
   you want to answer.
3. Give that focused output to your assistant instead of dumping the full raw
   corpus.

For example, after running graphify on a project:

```bash
graphify query "show the auth flow" --graph .graphify/graph.json
graphify query "what connects DigestAuth to Response?" --graph .graphify/graph.json
```

The output includes node labels, edge types, confidence tags, source files, and
source locations. That makes it a good intermediate context block for an LLM:

```text
Use this graph query output to answer the question. Prefer the graph structure
over guessing, and cite the source files when possible.
```

If your assistant supports tool calling or MCP, use the graph directly instead
of pasting text. graphify can expose `graph.json` as an MCP server:

```bash
graphify serve .graphify/graph.json
```

In Codex, register that server with:

```bash
codex mcp add graphify -- graphify serve /absolute/path/to/.graphify/graph.json
```

That gives the assistant structured graph access for repeated queries such as
`query_graph`, `get_node`, `get_neighbors`, and `shortest_path`.

<details>
<summary>Manual install (curl)</summary>

```bash
mkdir -p ~/.claude/skills/graphify
curl -fsSL https://raw.githubusercontent.com/rhanka/graphify/main/src/skills/skill.md \
  > ~/.claude/skills/graphify/SKILL.md
```

If `CLAUDE_CONFIG_DIR` is set in your environment, substitute that directory for `~/.claude` when placing the global Claude skill.

Add to `~/.claude/CLAUDE.md`:

```
- **graphify** (`~/.claude/skills/graphify/SKILL.md`) - any input to knowledge graph. Trigger: `/graphify`
When the user types `/graphify`, invoke the Skill tool with `skill: "graphify"` before doing anything else.
```

</details>

## Usage

In Codex, replace the leading `/` in the examples below with `$`. Gemini CLI, GitHub Copilot CLI, and Aider use the `/graphify` form directly.

```
/graphify                          # run on current directory
/graphify ./raw                    # run on a specific folder
/graphify https://github.com/<owner>/<repo>   # clone a repo locally, then graph it
/graphify ./raw --directed         # build directed graph (preserves source->target)
/graphify ./raw --mode deep        # more aggressive INFERRED edge extraction
/graphify ./raw --pdf-ocr auto     # preflight PDFs; OCR scanned/low-text PDFs with mistral-ocr when needed
/graphify ./raw --update           # re-extract only changed files, merge into existing graph
/graphify ./raw --cluster-only     # rerun clustering on existing graph, no re-extraction
/graphify ./raw --no-viz           # skip HTML, just produce report + JSON
/graphify ./raw --obsidian                          # also generate Obsidian vault (opt-in)
/graphify ./raw --obsidian --obsidian-dir ~/vaults/myproject  # write vault to a specific directory

/graphify add https://arxiv.org/abs/1706.03762        # fetch a paper, save, update graph
/graphify add https://www.youtube.com/watch?v=...     # download video audio, then transcribe it on the next build/update
/graphify add https://x.com/karpathy/status/...       # fetch a tweet
/graphify add https://... --author "Name"             # tag the original author
/graphify add https://... --contributor "Name"        # tag who added it to the corpus

/graphify query "what connects attention to the optimizer?"
/graphify query "what connects attention to the optimizer?" --dfs   # trace a specific path
/graphify query "what connects attention to the optimizer?" --budget 1500  # cap at N tokens
/graphify summary --graph .graphify/graph.json        # compact first-hop orientation before deep traversal
/graphify review-delta --files src/auth.ts --graph .graphify/graph.json  # review impact for changed files
/graphify review-analysis --files src/auth.ts --graph .graphify/graph.json  # blast radius + review views
/graphify recommend-commits --files src/auth.ts,src/session.ts --graph .graphify/graph.json  # advisory commit grouping
/graphify path "DigestAuth" "Response"
/graphify explain "SwinTransformer"

/graphify ./raw --watch            # auto-sync graph as files change (code: instant, docs: notifies you)
/graphify ./raw --wiki             # build agent-crawlable wiki (index.md + article per community)
/graphify ./raw --svg              # export graph.svg
/graphify ./raw --graphml          # export graph.graphml (Gephi, yEd)
/graphify ./raw --neo4j            # generate cypher.txt for Neo4j
/graphify ./raw --neo4j-push bolt://localhost:7687    # push directly to a running Neo4j instance
/graphify ./raw --mcp              # start MCP stdio server

# git hooks - platform-agnostic, mark stale and rebuild code graph on git lifecycle events
graphify clone https://github.com/<owner>/<repo>
graphify clone https://github.com/<owner>/<repo> --branch main
graphify merge-graphs repo-a/.graphify/graph.json repo-b/.graphify/graph.json --out .graphify/cross-repo-graph.json
graphify hook install
graphify hook uninstall
graphify hook status
graphify check-update .          # report pending .graphify semantic/lifecycle refresh signals
graphify state status            # inspect .graphify/worktree.json + branch.json
graphify state prune             # print a non-destructive stale-state cleanup plan
graphify migrate-state --dry-run # plan graphify-out -> .graphify migration and git mv advice
graphify recommend-commits          # advisory-only commit grouping from current Git changes

# always-on assistant instructions - platform-specific
graphify claude install            # CLAUDE.md + PreToolUse hook (Claude Code)
graphify claude uninstall
graphify codex install             # AGENTS.md (Codex)
graphify gemini install            # GEMINI.md + .gemini/settings.json (Gemini CLI)
graphify gemini uninstall
graphify copilot install           # ~/.copilot/skills/graphify/SKILL.md (GitHub Copilot CLI)
graphify copilot uninstall
graphify vscode install            # ~/.copilot/skills/graphify/SKILL.md + .github/copilot-instructions.md (VS Code Copilot Chat)
graphify vscode uninstall
graphify aider install             # AGENTS.md (Aider)
graphify aider uninstall
graphify cursor install            # .cursor/rules/graphify.mdc (Cursor)
graphify cursor uninstall
graphify opencode install          # AGENTS.md + .opencode/opencode.json plugin (OpenCode)
graphify opencode uninstall
graphify claw install              # AGENTS.md (OpenClaw)
graphify claw uninstall
graphify droid install             # AGENTS.md (Factory Droid)
graphify droid uninstall
graphify trae install              # AGENTS.md (Trae)
graphify trae uninstall
graphify trae-cn install           # AGENTS.md (Trae CN)
graphify trae-cn uninstall
graphify hermes install            # ~/.hermes/skills/graphify/SKILL.md (Hermes)
graphify hermes uninstall
graphify kiro install              # .kiro/skills/graphify/SKILL.md + .kiro/steering/graphify.md (Kiro)
graphify kiro uninstall
graphify antigravity install       # .agent/rules + .agent/workflows + ~/.agent/skills (Google Antigravity)
graphify antigravity uninstall

# query the graph directly from the terminal (no AI assistant needed)
graphify query "what connects attention to the optimizer?"
graphify query "show the auth flow" --dfs
graphify query "what is CfgNode?" --budget 500
graphify summary --graph .graphify/graph.json
graphify review-delta --files src/auth.ts,src/session.ts --graph .graphify/graph.json
graphify review-analysis --files src/auth.ts --graph .graphify/graph.json
graphify review-eval --cases .graphify/review-cases.json --graph .graphify/graph.json
graphify recommend-commits --files src/auth.ts,src/session.ts --graph .graphify/graph.json
graphify query "..." --graph path/to/graph.json

# configured ontology dataprep profiles - explicit opt-in through config/profile
graphify profile validate --config graphify.yaml \
  --out .graphify/profile/project-config.normalized.json \
  --profile-out .graphify/profile/ontology-profile.normalized.json
graphify profile dataprep . --config graphify.yaml
graphify profile validate-extraction \
  --profile-state .graphify/profile/profile-state.json \
  --input extraction.json
graphify profile report \
  --profile-state .graphify/profile/profile-state.json \
  --graph .graphify/graph.json \
  --out .graphify/profile/profile-report.md
graphify profile ontology-output \
  --profile-state .graphify/profile/profile-state.json \
  --input extraction.json \
  --out-dir .graphify/ontology
```

Works with any mix of file types:

| Type | Extensions | Extraction |
|------|-----------|------------|
| Code | `.py .ts .js .jsx .tsx .mjs .vue .svelte .ejs .go .rs .java .c .cpp .rb .cs .kt .scala .php .blade.php .swift .lua .zig .ps1 .ex .exs .m .mm .jl .dart .v .sv` | AST via tree-sitter when available, plus fallback extraction for upstream Python surface languages, call-graph, and docstring/comment rationale |
| Docs | `.md .mdx .txt .rst .html` | Concepts + relationships + design rationale via the platform model |
| Office | `.docx .xlsx` | Converted to markdown then extracted via the platform model |
| Papers | `.pdf` | Local PDF preflight; text-layer PDFs become Markdown via `pdf-parse`/`pdftotext`; scanned/low-text PDFs can use `mistral-ocr` for Markdown + images before semantic extraction |
| Images | `.png .jpg .webp .gif` | Multimodal vision - screenshots, diagrams, any language |
| Audio / Video | `.mp4 .mov .webm .mkv .avi .m4v .mp3 .wav .m4a .ogg` | Detected locally; downloaded with `yt-dlp` when needed, normalized with `ffmpeg`, transcribed via `faster-whisper-ts`, then fed through the same semantic extraction path as docs |

### Local audio/video transcription

The TypeScript port uses the published `faster-whisper-ts` runtime, not Python. Its default transcription settings intentionally match upstream Python Graphify: Whisper model `base`, CPU device, and `int8` compute type. Override them with `GRAPHIFY_WHISPER_MODEL`, `GRAPHIFY_WHISPER_MODEL_DIR`, `GRAPHIFY_WHISPER_MODEL_ID`, `GRAPHIFY_WHISPER_MODEL_REVISION`, `GRAPHIFY_WHISPER_DEVICE`, and `GRAPHIFY_WHISPER_COMPUTE_TYPE` when you need a different local CTranslate2 model or runtime target.

URL ingestion still goes through `yt-dlp`; local audio/video decoding is handled by `faster-whisper-ts` and system `ffmpeg`. Generated transcripts are written under `.graphify/transcripts/` by default and are then treated like regular document inputs for semantic extraction.

### PDF preflight and Mistral OCR

PDFs are never sent to OCR blindly. `GRAPHIFY_PDF_OCR` controls the behavior: `auto` (default) runs a local `pdf-parse` preflight with `pdftotext` fallback when available, and calls `mistral-ocr` only when the PDF has too little extractable text; `off` keeps the original PDF as-is; `always` forces Mistral OCR; `dry-run` records the preflight decision without calling the API. Use `GRAPHIFY_PDF_OCR_MODEL` to override the Mistral model. Mistral OCR requires `MISTRAL_API_KEY`; if the key is missing in `auto` mode, graphify warns and leaves the source PDF in the semantic input instead of failing the run.

Generated PDF sidecars are written under `.graphify/converted/pdf/` with provenance frontmatter pointing back to the original PDF. The sidecars then flow through the normal document semantic extraction path. If OCR produces image artifacts for figures, tables, diagrams, or embedded text, graphify adds those artifacts to semantic image inputs; the skills instruct the assistant to decode them with platform vision by default, or with a configured delegated OCR/vision provider, keeping the link back to the source PDF.

### Configured ontology dataprep profiles

Profile mode is strictly additive. It activates only when graphify discovers `graphify.yaml`, `graphify.yml`, `.graphify/config.yaml`, or `.graphify/config.yml`, or when you pass an explicit `--config`/`--profile` option. Without that activation, normal graphify behavior is unchanged.

A project config describes physical inputs: corpus folders, generated-but-semantic sidecars, registry files, exclusions, PDF/OCR policy, and output state under `.graphify/`. An ontology profile describes semantic constraints: allowed node types, relation types, citation requirements, review statuses, and named registry bindings. Registries can be CSV, JSON, or YAML; they are normalized into ordinary Graphify extraction fragments with stable IDs and profile attributes.

The local CLI/runtime covers deterministic steps only:

```bash
graphify profile validate --config graphify.yaml
graphify profile dataprep . --config graphify.yaml
graphify profile validate-extraction --profile-state .graphify/profile/profile-state.json --input extraction.json
graphify profile report --profile-state .graphify/profile/profile-state.json --graph .graphify/graph.json --out .graphify/profile/profile-report.md
graphify profile ontology-output --profile-state .graphify/profile/profile-state.json --input extraction.json --out-dir .graphify/ontology
```

Assistant skills use the same runtime via `project-config`, `configured-dataprep`, `profile-prompt`, `profile-validate-extraction`, `profile-report`, and `ontology-output`. Full semantic extraction remains skill-orchestrated: the assistant reads the profile prompt, extracts profile-shaped Graphify JSON, validates it with the base schema plus profile rules, then merges it through the existing graph build/report/export/wiki flow.

Advanced image dataprep is also opt-in through `dataprep.image_analysis.enabled`. In assistant mode, Graphify writes manifests and instructions only; Codex, Claude, Gemini, or another assistant can caption crops and propose calibration labels, but TypeScript replay owns deterministic acceptance. In batch mode, the runtime can export provider-neutral primary JSONL requests, import normalized caption/routing sidecars, and export a deep-pass JSONL only when project-owned routing rules declare `decision: accept_matrix`. Existing valid sidecars are not overwritten unless `--force` is explicitly used.

Profile artifacts live under `.graphify/profile/`, image dataprep artifacts under `.graphify/image-dataprep/`, calibration proposals under `.graphify/calibration/`, and optional profile-declared ontology artifacts under `.graphify/ontology/`. Semantic cache entries are isolated by profile hash, and the normal LLM Wiki remains `.graphify/wiki/index.md`. Graphify ships only synthetic profile examples and fixtures; real project configs, registries, labels, routing rules, and proprietary ontologies belong in consuming repositories. MCP-specific profile tools, embeddings, databases, remote registries, and a resident LLM backend are deferred.

## What you get

**God nodes** - highest-degree concepts (what everything connects through)

**Surprising connections** - ranked by composite score. Code-paper edges rank higher than code-code. Each result includes a plain-English why.

**Suggested questions** - 4-5 questions the graph is uniquely positioned to answer

**The "why"** - docstrings, inline comments (`# NOTE:`, `# IMPORTANT:`, `# HACK:`, `# WHY:`), and design rationale from docs are extracted as `rationale_for` nodes. Not just what the code does - why it was written that way.

**Confidence scores** - every INFERRED edge has a `confidence_score` (0.0-1.0). You know not just what was guessed but how confident the model was. EXTRACTED edges are always 1.0.

**Semantic similarity edges** - cross-file conceptual links with no structural connection. Two functions solving the same problem without calling each other, a class in code and a concept in a paper describing the same algorithm.

**Hyperedges** - group relationships connecting 3+ nodes that pairwise edges can't express. All classes implementing a shared protocol, all functions in an auth flow, all concepts from a paper section forming one idea.

**Token benchmark** - printed automatically after every run. On a mixed corpus (Karpathy repos + papers + images): **71.5x** fewer tokens per query vs reading raw files. The first run extracts and builds the graph (this costs tokens). Every subsequent query reads the compact graph instead of raw files — that's where the savings compound. The SHA256 cache means re-runs only re-process changed files.

**Auto-sync** (`--watch`) - run in a background terminal and the graph updates itself as your codebase changes. Code file saves trigger an instant rebuild (AST only, no LLM). Doc/image changes notify you to run `--update` for the LLM re-pass.

**Git hooks** (`graphify hook install`) - installs worktree-compatible `post-commit`, `post-checkout`, `post-merge`, and `post-rewrite` hooks. Hooks mark `.graphify/` stale first, update branch/worktree metadata, then try a non-blocking code-only rebuild when it is safe and cheap. No background process needed, and hook failures do not block Git operations. Use `graphify state status` to inspect lifecycle metadata and `graphify state prune` to preview stale cleanup without deleting files.

**Wiki** (`--wiki`) - Wikipedia-style markdown articles per community and god node, with an `index.md` entry point. Point any agent at `index.md` and it can navigate the knowledge base by reading files instead of parsing JSON.

## Worked examples

| Corpus | Files | Reduction | Output |
|--------|-------|-----------|--------|
| Karpathy repos + 5 papers + 4 images | 52 | **71.5x** | [`worked/karpathy-repos/`](worked/karpathy-repos/) |
| graphify source + Transformer paper | 4 | **5.4x** | [`worked/mixed-corpus/`](worked/mixed-corpus/) |
| httpx (synthetic Python library) | 6 | ~1x | [`worked/httpx/`](worked/httpx/) |

Token reduction scales with corpus size. 6 files fits in a context window anyway, so graph value there is structural clarity, not compression. At 52 files (code + papers + images) you get 71x+. Each `worked/` folder has the raw input files and the actual output (`GRAPH_REPORT.md`, `graph.json`) so you can run it yourself and verify the numbers.

## Privacy

graphify sends file contents to your AI coding assistant's underlying model API for semantic extraction of docs, papers, and images — Anthropic (Claude Code), OpenAI (Codex), Google (Gemini CLI), or whichever provider your platform uses. Code files are processed locally via tree-sitter AST or fallback extractors — no file contents leave your machine for code. Audio/video transcription runs through your local `yt-dlp` + `ffmpeg` + `faster-whisper-ts` toolchain. PDF text preflight is local (`pdf-parse`, with optional `pdftotext` fallback); Mistral OCR is the only additional PDF-specific network call, and it runs only when `GRAPHIFY_PDF_OCR=auto` detects a scanned/low-text PDF or when you explicitly force OCR. No telemetry, usage tracking, or analytics of any kind. The only network calls are to your platform's model API during extraction, optional Mistral OCR when PDF OCR mode requires it, and any URL fetches you explicitly ask graphify to ingest; all use your own API keys or local credentials.

## Tech stack

Graphology + Louvain (`graphology-communities-louvain`) + tree-sitter + vis-network, with regex-backed language fallbacks, `pdf-parse`, optional system `pdftotext`, optional `mistral-ocr`, `mammoth`, `exceljs`, `turndown`, and the upstream-aligned `yt-dlp` + `ffmpeg` + `faster-whisper-ts` transcription path. Semantic extraction runs through your platform's model (Claude Code, Codex, Gemini CLI, or another supported client). No Neo4j required, and the default HTML output is fully static.

## Acknowledgements

This repository is a TypeScript port of the original Graphify project by [Safi Shamsi](https://github.com/safishamsi/graphify). Selected review-workflow ideas were also adapted from the `code-review-graph` comparison work, as documented in [spec/SPEC_CODE_REVIEW_GRAPH_OPPORUNITY.md](spec/SPEC_CODE_REVIEW_GRAPH_OPPORUNITY.md). The maintained product remains Graphify TypeScript: multimodal, file-based by default, and aligned against upstream Graphify where parity matters.

## License

MIT. See [LICENSE](LICENSE).

<details>
<summary>Contributing</summary>

**Worked examples** are the most trust-building contribution. Run the graphify skill on a real corpus (`$graphify` in Codex, `/graphify` elsewhere), save output to `worked/{slug}/`, write an honest `review.md` evaluating what the graph got right and wrong, submit a PR.

**Extraction bugs** - open an issue with the input file, the cache entry (`.graphify/cache/`), and what was missed or invented.

See [ARCHITECTURE.md](ARCHITECTURE.md) for module responsibilities and how to add a language.

</details>
