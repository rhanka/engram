# SPEC_GRAPHIFY

## Status

- Product: `graphify`
- Package: `graphifyy@0.3.28`
- Current repo branch: `v3-typescript`
- Source of truth for this document: the TypeScript repo state in `/home/antoinefa/src/graphify`
- Scope: describe the current maintained TypeScript port, not the upstream Python implementation except where the TS port intentionally mirrors it

## Product Summary

Graphify turns a folder into a durable knowledge graph and an assistant-friendly workflow surface. It is both a CLI and a set of assistant integrations. The current TypeScript repo is the maintained port: it keeps the assistant skill experience, the graph pipeline, the local multimodal transcription path, and the export formats in a single npm package.

The core value proposition is:

- preserve structural relationships across sessions
- keep provenance explicit with confidence labels
- support code and non-code inputs in the same graph
- let assistants answer from graph state instead of re-reading raw files
- keep the whole system local and workspace-scoped

## Goals

- Build a queryable knowledge graph from code, documents, papers, images, and supported audio/video inputs.
- Keep the graph honest: explicit edges stay distinct from inferred edges and ambiguous edges.
- Make the graph durable across sessions through `graphify-out/graph.json` and related artifacts.
- Support multiple assistant surfaces with platform-specific install flows.
- Keep code and non-code workflows compatible with the current TypeScript runtime.
- Preserve the ability to query, traverse, explain, and export the graph later without rebuilding the corpus.
- Support incremental rebuilds and watch mode for code changes.

## Personas

- Assistant user: wants fast context, path queries, and a compact graph-backed answer instead of broad file traversal.
- Codebase explorer: wants a structural map, god nodes, clusters, and surprising links.
- Research corpus user: wants papers, notes, screenshots, and URLs folded into one graph.
- Maintainer: wants reproducible outputs, deterministic cache behavior, and clear release/versioning contracts.
- Platform integrator: wants a consistent install story across Codex, Claude Code, Gemini CLI, Copilot CLI, Aider, OpenCode, OpenClaw, Droid, Trae, Cursor, and related clients.

## Supported Platforms

Graphify supports a broad set of assistant entry points, but the install and invocation contract is platform-specific.

| Platform | Trigger | Install surface |
|---|---|---|
| Codex | `$graphify ...` | `graphify install --platform codex`, `graphify codex install` |
| Claude Code | `/graphify ...` | `graphify install`, `graphify claude install` |
| Gemini CLI | `/graphify ...` | `graphify install --platform gemini`, `graphify gemini install` |
| GitHub Copilot CLI | `/graphify ...` | `graphify install --platform copilot`, `graphify copilot install` |
| Aider | `/graphify ...` | `graphify install --platform aider`, `graphify aider install` |
| OpenCode | `/graphify ...` | `graphify install --platform opencode`, `graphify opencode install` |
| OpenClaw | `/graphify ...` | `graphify install --platform claw`, `graphify claw install` |
| Factory Droid | `/graphify ...` | `graphify install --platform droid`, `graphify droid install` |
| Trae / Trae CN | `/graphify ...` | `graphify install --platform trae`, `graphify install --platform trae-cn` |
| Cursor | no slash trigger; rule-based | `graphify cursor install` |

Current platform contracts:

- Codex uses `AGENTS.md` plus a Bash PreToolUse hook and the explicit `$graphify` skill trigger.
- Claude Code uses `CLAUDE.md` plus a PreToolUse hook.
- Gemini CLI uses `GEMINI.md`, `.gemini/settings.json`, and the `/graphify` custom command.
- OpenCode uses `AGENTS.md` plus a local plugin hook.
- Aider, OpenClaw, Droid, Trae, and Trae CN rely on `AGENTS.md` as the always-on mechanism.
- Cursor writes `.cursor/rules/graphify.mdc`.

## Main Workflows

### Build a graph

The primary workflow is to run graphify on a path, usually the current directory.

Inputs:

- a folder path
- optional flags such as `--directed`, `--mode deep`, `--update`, `--cluster-only`, `--no-viz`, `--wiki`, `--svg`, `--graphml`, `--neo4j`, `--neo4j-push`, `--mcp`, `--watch`

Outputs:

- `graphify-out/graph.json`
- `graphify-out/GRAPH_REPORT.md`
- `graphify-out/graph.html` unless disabled
- optional export files such as `graph.svg`, `graph.graphml`, `cypher.txt`, and wiki pages

### Query a built graph

Graphify exposes graph traversal and explanation commands over the built graph:

- `query` for BFS or DFS context retrieval
- `path` for shortest path between nodes
- `explain` for a node and its neighborhood

### Add external content

Graphify can ingest URLs into a local corpus folder and then fold them into the graph.

Supported URL classes in the current repo:

- arXiv papers
- tweets / X posts
- general webpages
- PDFs
- images
- YouTube URLs

### Maintain the graph as you work

- `watch` rebuilds code-only changes automatically.
- `hook install` adds Git hooks so the graph stays fresh across commits and branch changes.
- `hook-rebuild` is the internal rebuild path used by hooks.

## Architecture

Graphify is a TypeScript package and CLI with a graph-oriented runtime plus assistant-specific skill installation.

High-level flow:

1. detect the corpus and classify files by type
2. normalize non-code inputs when needed
3. extract AST structure from code via Tree-sitter
4. extract semantic entities and relations from docs, papers, images, and transcripts through the assistant skill path
5. merge structural and semantic extraction
6. build a Graphology graph
7. cluster it with Louvain
8. analyze hubs, surprises, and suggested questions
9. export HTML, JSON, and audit report artifacts

Main runtime surfaces:

- `src/cli.ts` for install, graph, query, path, explain, watch, serve, hook, and skill management commands
- `src/skill-runtime.ts` for the Codex/Cross-platform explicit runtime commands used by the skill prompts
- `src/pipeline.ts` for standalone AST-first build orchestration
- `src/transcribe.ts` for local audio/video transcription
- `src/ingest.ts` for URL ingestion
- `src/detect.ts` for file discovery and type classification
- `src/extract.ts` for code AST extraction
- `src/build.ts` for building a Graphology graph from extraction JSON
- `src/cluster.ts` for Louvain communities and cohesion
- `src/analyze.ts` for god nodes, surprises, and suggested questions
- `src/report.ts` for `GRAPH_REPORT.md`
- `src/export.ts` for HTML, JSON, SVG, GraphML, Obsidian Canvas, Cypher, and Neo4j exports
- `src/wiki.ts` for community wiki generation
- `src/serve.ts` for the MCP stdio server
- `src/watch.ts` for incremental code rebuilds and file watching

## Core Modules

### `src/detect.ts`

- Classifies files into `code`, `document`, `paper`, `image`, and `video`.
- Detects supported code languages via extension lists and optional Tree-sitter grammar packages.
- Treats `.docx` and `.xlsx` as document inputs and converts them into markdown sidecars for semantic extraction.
- Flags sensitive files and honors `.graphifyignore` plus ancestor patterns up to the git root.
- Saves manifest and detection artifacts for downstream steps.

### `src/extract.ts`

- Performs AST extraction for code files.
- Uses Tree-sitter grammars and returns a structural extraction with nodes, edges, and token counts.
- Keeps code extraction deterministic and separate from semantic extraction.

### `src/transcribe.ts`

- Resolves local audio/video inputs.
- Downloads audio for URLs through `yt-dlp`.
- Normalizes audio through `ffmpeg`.
- Runs local Whisper-compatible transcription through `sherpa-onnx-node`.
- Writes transcript `.txt` files into `graphify-out/transcripts/`.
- Feeds generated transcripts back into the semantic detection pass.

### `src/skill-runtime.ts`

- Implements the explicit runtime commands that the assistant skills rely on.
- Resolves runtime proof for TypeScript-backed Codex execution.
- Handles detection, semantic cache checks, AST extraction, merge/finalize, analysis, labels, path, explain, and ingest operations.
- Is the contract the skill prompts use when they need deterministic, file-based runtime steps instead of improvising shell snippets.

### `src/build.ts`

- Merges extraction JSON into a Graphology graph.
- Supports directed or undirected builds.
- Treats graph construction as the structural merge layer, not as the semantic extraction layer.

### `src/cluster.ts`

- Runs Louvain community detection via `graphology-communities-louvain`.
- Splits oversized communities.
- Computes cohesion scores.

### `src/analyze.ts`

- Identifies god nodes.
- Finds surprising connections.
- Generates suggested questions from the graph.
- Computes graph diff output.

### `src/report.ts`

- Generates `GRAPH_REPORT.md`.
- Summarizes corpus size, edge confidence mix, god nodes, surprises, communities, knowledge gaps, and suggested questions.
- Serves as the human-readable audit trail and the first stop for assistant orientation.

### `src/export.ts`

- Exports graph data to JSON, HTML, SVG, GraphML, Obsidian Canvas, Cypher, and Neo4j.
- Adds community labels and `community_name` fields to JSON output.
- Generates the browser-facing `graph.html` visualization.

### `src/wiki.ts`

- Generates an agent-crawlable markdown wiki per community.
- Adds `index.md` plus community pages when requested.

### `src/serve.ts`

- Exposes the graph as an MCP stdio server.
- Tools currently include `query_graph`, `get_node`, `get_neighbors`, `get_community`, `god_nodes`, `graph_stats`, and `shortest_path`.

### `src/watch.ts`

- Rebuilds code-only graphs on filesystem change.
- Uses `chokidar`.
- Signals non-code changes as requiring a semantic update through the skill path.

## Data Model

### Graph nodes

Graphify nodes currently carry:

- `id`
- `label`
- `file_type`
- `source_file`
- optional `source_location`
- optional `confidence`
- optional `community`

Node `file_type` values in the current TS model are:

- `code`
- `document`
- `paper`
- `image`
- `rationale`

### Graph edges

Edges currently carry:

- `source`
- `target`
- `relation`
- `confidence`
- `confidence_score`
- `source_file`
- optional `source_location`
- optional `weight`
- optional preserved direction fields for display

Edge confidence values:

- `EXTRACTED`
- `INFERRED`
- `AMBIGUOUS`

### Hyperedges

Hyperedges group three or more nodes that participate in one shared concept or flow. They are first-class in the extraction pipeline and persist through export.

### Detection model

Detection results classify the corpus by file kind:

- `files.code`
- `files.document`
- `files.paper`
- `files.image`
- `files.video`

Detection also tracks:

- totals for files and words
- sensitive-file skips
- `.graphifyignore` pattern count
- incremental change metadata when update mode is used

### Output JSON

`graphify-out/graph.json` is the canonical graph artifact. It contains:

- `directed`
- `graph.community_labels`
- `nodes`
- `links`
- `hyperedges`

## Graph Pipeline

### Full build

1. Detect files and classify corpus contents.
2. Emit `graphify-out/.graphify_detect.json`.
3. Prepare semantic detection.
4. Extract AST structure from code.
5. Check the semantic cache for documents, papers, images, and generated transcripts.
6. Extract uncached semantic inputs.
7. Merge cached and fresh semantic fragments.
8. Merge AST and semantic extraction into one final extraction.
9. Build a Graphology graph.
10. Cluster communities with Louvain.
11. Compute god nodes, surprises, and suggested questions.
12. Write `GRAPH_REPORT.md`, `graph.json`, `manifest.json`, `cost.json`, and optionally `graph.html`.

### Incremental update

- `--update` reuses detection manifests and only re-extracts changed inputs.
- Code changes can be rebuilt quickly through the AST path.
- Non-code semantic inputs can be refreshed through the transcript and semantic extraction path.

### Cluster-only

- `--cluster-only` reruns community detection and report generation on an existing graph.
- Useful when graph structure is unchanged but community labels or clustering need refresh.

### Watch mode

- Code changes trigger immediate rebuilds.
- Non-code changes are reported as requiring a semantic update through the assistant skill path.

## Skills and Orchestration

Graphify is skill-driven as well as CLI-driven.

### Explicit skill invocation

- Codex uses `$graphify ...` as the reliable explicit trigger.
- Claude Code, Gemini CLI, Copilot CLI, Aider, OpenCode, OpenClaw, Droid, and Trae use `/graphify ...`.

### Install contract

`graphify install` installs the appropriate assistant integration and stores the current package version in a `.graphify_version` marker beside the installed skill.

Platform-specific installers add the right instruction surface:

- `CLAUDE.md` plus hook config for Claude Code
- `AGENTS.md` plus hook config for Codex and other agents that use AGENTS rules
- `GEMINI.md` plus `.gemini/settings.json` for Gemini CLI
- `.cursor/rules/graphify.mdc` for Cursor
- global skill directories for Copilot and Aider

### Runtime proof

Codex runs are considered successful only when `graphify-out/.graphify_runtime.json` reports `runtime: "typescript"`.

## Multimodal and Transcription

Graphify currently supports semantic extraction for:

- code
- markdown and text
- papers and PDFs
- Office documents (`.docx`, `.xlsx`) via text conversion
- images and screenshots
- web pages, tweets, and arXiv pages through ingestion
- audio/video via local transcription

The current multimodal path is:

1. classify video/audio inputs
2. download audio with `yt-dlp` when the source is a URL
3. normalize through `ffmpeg`
4. transcribe locally with `sherpa-onnx-node`
5. write transcript `.txt` files
6. treat transcripts as document inputs during semantic extraction

Important current constraints:

- this repo does not use a Python transcription bridge anymore
- `GRAPHIFY_WHISPER_MODEL` defaults to `base`
- `large` is accepted as an alias for `large-v3`
- `GRAPHIFY_WHISPER_PROMPT` can override the prompt used for transcription

## Outputs and Artifacts

Canonical outputs:

- `graphify-out/graph.json`
- `graphify-out/GRAPH_REPORT.md`
- `graphify-out/graph.html`
- `graphify-out/manifest.json`
- `graphify-out/cost.json`

Supporting artifacts:

- `graphify-out/.graphify_runtime.json`
- `graphify-out/.graphify_detect.json`
- `graphify-out/.graphify_detect_semantic.json`
- `graphify-out/.graphify_ast.json`
- `graphify-out/.graphify_cached.json`
- `graphify-out/.graphify_uncached.txt`
- `graphify-out/.graphify_semantic_new.json`
- `graphify-out/.graphify_semantic.json`
- `graphify-out/.graphify_analysis.json`
- `graphify-out/.graphify_transcripts.json`
- `graphify-out/wiki/` when wiki generation is enabled

Optional exports:

- `graph.svg`
- `graph.graphml`
- `cypher.txt`
- Obsidian vault output

## CLI Contract

Package and binary:

- npm package name: `graphifyy`
- CLI binary: `graphify`
- minimum Node version: `>=20`

Core commands:

- `graphify install`
- `graphify claude install|uninstall`
- `graphify codex install|uninstall`
- `graphify gemini install|uninstall`
- `graphify copilot install|uninstall`
- `graphify aider install|uninstall`
- `graphify opencode install|uninstall`
- `graphify claw install|uninstall`
- `graphify droid install|uninstall`
- `graphify trae install|uninstall`
- `graphify trae-cn install|uninstall`
- `graphify cursor install|uninstall`
- `graphify hook install|uninstall|status`
- `graphify serve [graph.json]`
- `graphify watch [path]`
- `graphify query <question>`
- `graphify path "A" "B"`
- `graphify explain <node>`
- `graphify add <url>`

Install behavior:

- `graphify install` auto-detects a default platform, with a Windows-specific Claude fallback.
- Platform-specific install commands write only the platform-relevant instructions and hooks.
- `graphify codex install` must preserve the `$graphify` trigger contract and the runtime proof expectation.

## Release and Versioning Assumptions

- The current repo is a maintained TypeScript port, not a fresh rewrite.
- The default product branch is `v3-typescript`.
- `v3` mirrors the upstream Python `v3` branch and is treated as reference-only.
- The published npm package is `graphifyy` until the `graphify` name is reclaimed.
- The current version line for this branch is `0.3.28`.
- Skill installations record the installed version in `.graphify_version` and warn when the package version and installed skill diverge.

## Repository Positioning And README Strategy

The repository now has two legitimate truths and the documentation must present both cleanly:

- `v3-typescript` is the maintained product branch and the default branch of the repo.
- `v3` is an upstream-aligned mirror branch used as a parity and diff reference against the original Python project.

That split must stay explicit in the README and in install-facing docs. The repo should not present itself as a generic fork anymore, but it should also not pretend the upstream lineage is irrelevant.

### README positioning requirements

- The first screen of the README must say this is the maintained TypeScript port and npm-distributed product.
- The README must thank and link to the original Graphify project as the upstream source of product direction and the `v3` reference line.
- The README must state the branch model plainly:
  - `v3-typescript`: the maintained TypeScript product branch
  - `v3`: upstream Python mirror for parity tracking
- The README must not imply that every upstream change lands automatically; it should describe alignment as release-by-release or lot-by-lot catch-up.
- The README must also not imply that the TS repo is merely a thin wrapper. It already carries TS-specific runtime decisions, assistant integrations, and now local multimodal transcription through the TS runtime.

### README structure expectations

The README should evolve toward an explicit structure:

1. product positioning
2. branch model and upstream relationship
3. current alignment status
4. where the TS repo intentionally diverges
5. installation and usage
6. multimodal and assistant platform support

### Divergence policy

The repo should maintain a narrow, documented divergence surface:

- divergence is acceptable when required for a TypeScript-native runtime, npm distribution, or cross-assistant installation model
- divergence is not acceptable when it is just drift or undocumented product creep
- each meaningful divergence should be documented either in the main README, in `UPSTREAM_GAP.md`, or in a dedicated spec if it changes the product contract

### Multi-language README expectations

The English, Simplified Chinese, and Japanese READMEs should continue to move together on:

- product positioning
- branch model
- alignment language
- supported modalities and platforms
- artifact path conventions

They do not need to be word-for-word identical, but they should not disagree on product identity or install behavior.

## Non-Goals

- Graphify is not a code-review-only product.
- Graphify is not a SQLite-backed repository database in the current TS port.
- Graphify is not embedding-first or vector-DB-first.
- Graphify is not a remote hosted service.
- Graphify is not a general-purpose notebook platform.
- Graphify is not a browser automation tool.
- Graphify is not expected to infer every hidden relationship without explicit evidence or a confidence label.

## Known Constraints

- `graphifyy` is a temporary npm name and must remain documented as such.
- Some code languages depend on optional Tree-sitter grammars being installed.
- Non-code semantic extraction depends on the assistant skill path and the current platform integration.
- Large corpora may need chunking and/or incremental updates.
- `watch` rebuilds code automatically, but semantic refresh for documents and media still depends on the skill/runtime path.
- `graphify serve` is MCP stdio, not a network server.
- `graphify-out` is workspace state and must be kept current; stale outputs can mislead assistant behavior.
- The current system is intentionally local and file-based, so it favors reproducibility over central indexing services.
