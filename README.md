# engram

[![TypeScript CI](https://github.com/rhanka/engram/actions/workflows/typescript-ci.yml/badge.svg?branch=main)](https://github.com/rhanka/engram/actions/workflows/typescript-ci.yml)

> Engram is a new product: an **agent memory substrate**, rebuilt and repositioned from a knowledge-graph tool. It inherits concepts from the earlier `graphify` project (`@sentropic/graphify`) but is not a continuation of it — names, CLI, env vars, state dirs, schemas, and positioning have changed (see Migration below). Heritage: Engram descends from `graphify`; for the prior line, see the archived `@sentropic/graphify` README and its CHANGELOG. New work targets `engram` only.

**Engram turns a corpus into a reconciled, ontology-typed knowledge graph.** Most knowledge isn't documentary — it doesn't live as one fact in one file. It's *entities and relations scattered across sources*: the same person under three names in twenty-five books, a component named one way in a CSV registry and another way in a manual, a case that only makes sense once its evidence, motive, and method are linked. Prose and docs flatten that structure; a knowledge graph keeps it. Engram extracts canonical entities and typed relations, deduplicates and reconciles them across sources under a configurable ontology, and gives you back a queryable graph your assistant — or you, from the terminal — can reason over.

![Engram Ontology Studio — Sherlock Holmes selected: ontology-typed knowledge graph of 25 public-domain mystery works, with the entity panel showing description, communities, and relations](docs/assets/studio.png)

*The flagship corpus: **1,193 canonical entities across 19 ontology types** (Work, Saga, Case, Character, Evidence, Motive, ForensicMethod, DisguisePersona, Alias…) reconciled from **25 public-domain mystery works**, clustered into 99 communities — here with the entity panel open on Sherlock Holmes.* **Explore the live studio → https://mystery-saga.sent-tech.ca/studio/**

## Why a knowledge graph, not more prose

Four things a graph gives you that documents can't:

- **Queryable structure** — ask `engram query "what connects Irene Adler to the Bohemia case?"` and get a path through typed nodes and edges, not a wall of search hits to re-read.
- **Entity reconciliation** — "Holmes", "Mr. Sherlock Holmes", and a disguised persona collapse into one canonical entity with aliases and evidence refs, instead of staying three scattered mentions.
- **Cross-source linking** — a character appearing in several works, an author and their translator, a registry row and the extracted mention that matches it: edges across sources are first-class, with provenance.
- **Ontology-typed nodes** — every node carries a type from a profile you control (`Character`, `Case`, `Evidence`, …), each type can pin a `visual_encoding` (shape + color), and relations are validated against allowed endpoints — so the graph stays a model, not a hairball.

### From code graphs to ontology graphs

Engram started life as a **code knowledge graph**: parse a repo, extract classes/functions/calls, cluster, report. No ontology, no entity management. The current product line keeps that (see [Code knowledge graphs](#code-knowledge-graphs)) but generalizes it:

| | Initial approach (code graph) | Now (ontology-driven entity graph) |
|---|---|---|
| Node types | Fixed (class, function, concept) | **Configurable ontology profile** per project |
| Same thing, many names | Stays duplicated | **Canonical entities + reconciliation** with a reviewable patch lifecycle |
| Sources | A codebase | Any corpus: books, manuals, registries (CSV/JSON/YAML), papers, images, transcripts |
| Rendering | One default style | Per-type **`visual_encoding`** (shape, color) carried by the profile |
| Review | Read the report | **Reconciliation studio** + audit trail of every accept/reject decision |

### Proof: the graph pays for itself

A token benchmark prints after every run. Once built, each query reads the compact graph instead of re-reading raw files:

| Corpus | Files | Tokens per query vs raw | Worked example |
|--------|------:|------------------------:|----------------|
| Karpathy repos + 5 papers + 4 images | 52 | **~71.5× fewer** | [`worked/karpathy-repos/`](worked/karpathy-repos/) |
| Engram source + Transformer paper | 4 | **~5.4× fewer** | [`worked/mixed-corpus/`](worked/mixed-corpus/) |
| httpx (synthetic Python library) | 6 | **~1×** | [`worked/httpx/`](worked/httpx/) |

A tiny corpus already fits in context, so there's little to compress — the value there is structural clarity, not token savings. Each `worked/` folder ships the raw inputs and the actual output so you can reproduce the numbers. Token figures are **estimates unless backed by real model calls.**

## Quickstart

**Requires:** Node.js 20+ and one supported AI coding assistant (Claude Code, Codex, Gemini CLI, and others — see [Reference](#reference)).

```bash
npm i -g @sentropic/engram
engram install
```

Build your first graph from your assistant:

```bash
/engram .                        # Claude Code / Gemini CLI / Copilot / Aider / OpenCode / others
$engram .                        # Codex
```

This writes `.engram/`:

```
.engram/
├── graph.json       persistent graph — query weeks later without re-reading
├── GRAPH_REPORT.md  god nodes, surprising connections, suggested questions
├── studio/          self-contained static Ontology Studio (open index.html via any static file server)
├── wiki/            optional LLM-readable wiki pages
└── cache/           local SHA256 cache (ignored)
```

The visual output is the **static Ontology Studio** in `.engram/studio/` — a
self-contained bundle (the prebuilt SPA + data artifacts). Open it by serving
that directory with any static file server (`index.html`), or re-export it
elsewhere with `engram studio export .engram/studio`.

Query it directly from the terminal — no assistant needed:

```bash
engram query "what connects attention to the optimizer?" --graph .engram/graph.json
engram path "DigestAuth" "Response" --graph .engram/graph.json
engram explain "SwinTransformer" --graph .engram/graph.json
engram summary --graph .engram/graph.json        # compact first-hop orientation
```

(`--graph` is optional once `.engram/graph.json` is the resolved default.)

### Build options

The build is driven from the skill; common flags:

```bash
/engram ./raw --directed         # preserve source→target direction
/engram ./raw --mode deep        # more aggressive INFERRED edge extraction
/engram ./raw --update           # re-extract only changed files, merge into existing graph
/engram ./raw --cluster-only     # rerun clustering only, no re-extraction
/engram ./raw --svg              # also export graph.svg
/engram ./raw --graphml          # also export graph.graphml (Gephi, yEd)
/engram ./raw --neo4j-push bolt://localhost:7687   # push directly to a running Neo4j
```

`engram watch [path]` keeps the graph live in a background terminal: code saves trigger an **instant AST rebuild (no LLM)**, while doc/image changes set a flag and **notify** you to run `--update` for the LLM re-pass. For cross-repo work, `engram clone <url>` builds a graph for a remote repo and `engram merge-graphs <graphs...>` stitches several graphs together.


## Migrating from graphify

Engram is the renamed product line. The old names keep working as deprecated
aliases for at least two minor versions or 12 months — new writes always go
to the new names, and nothing is renamed in place automatically.

| What | New (use this) | Deprecated alias (still works) |
|---|---|---|
| CLI / bin | `engram` | `graphify` (prints a deprecation notice; silence with `ENGRAM_QUIET_DEPRECATION=1`) |
| Env vars | `ENGRAM_*` | `GRAPHIFY_*` (read as fallback) |
| State dir | `.engram/` | `.graphify/`, `graphify-out/` (read fallback) |
| Config files | `engram.yaml`, `engram.yml`, `.engram/config.yaml|yml` | `graphify.yaml`, `graphify.yml`, `.graphify/config.yaml|yml` |
| Schema ids | `engram_*_v1` (written) | `graphify_*_v1` (accepted on read) |
| DB tables (Spanner) | `engram_*` | `graphify_*` (read fallback) |
| Skill trigger | `/engram` (`$engram` in Codex) | `/graphify` (`$graphify` in Codex) |

Moving legacy state: `engram migrate-state --dry-run` plans the
`graphify-out` → `.engram` move.

State working files keep their `.graphify_*.json` names inside `.engram/` and are never rewritten.

## The ontology layer

### Configurable ontology (profiles)

A project can pin an **ontology profile** that constrains the graph: allowed node types, relation types, citation requirements, review statuses, per-type `visual_encoding` (shape + color), and named registry bindings (CSV, JSON, or YAML). Profile mode is strictly additive — it activates only when Engram finds `engram.yaml`, `engram.yml`, `.engram/config.yaml`, or `.engram/config.yml`, or when you pass `--config`/`--profile`. Without it, normal Engram behavior is unchanged.

A minimal `engram.yaml`:

```yaml
version: 1
profile:
  path: engram/ontology-profile.yaml   # node/relation types, citation rules, statuses
inputs:
  corpus:
    - raw/manuals
  registries:
    - references/components.csv
dataprep:
  pdf_ocr: auto
  citation_minimum: page
```

```bash
engram profile validate --config engram.yaml
engram profile dataprep . --config engram.yaml
engram profile report --profile-state .engram/profile/profile-state.json \
  --graph .engram/graph.json --out .engram/profile/profile-report.md
```

Registries are normalized into ordinary extraction fragments with stable IDs and profile attributes, so external authoritative data and extracted mentions live in the same graph.

### Canonical entities and cross-source reconciliation

The same real-world thing is often mentioned differently across sources: a person named one way in a paper and another way in a dataset, a class in code and the concept describing it in a doc. Engram models a **canonical entity** (with a label, aliases, type, status, evidence refs) and links the variant **mentions** to it, so they collapse to a single node instead of staying scattered.

Reconciliation candidates are generated **deterministically** — `entity_match` candidates ranked by shared normalized terms and exact-label match, each carrying a score and a proposed patch operation:

```bash
engram ontology candidates \
  --profile-state .engram/profile/profile-state.json \
  --out .engram/ontology/candidates.json
```

### A reviewable patch lifecycle (propose → validate → dry-run → apply)

Reconciliation never edits derived files directly. `.engram/graph.json` and `.engram/ontology/*.json` are generated artifacts; every decision is a reviewable `engram_ontology_patch_v1` instead. A patch is validated against the active profile hash, graph hash, evidence refs, relation endpoint rules, status-transition policy, and a configured repository path jail.

Supported patch operations: `accept_match`, `reject_match`, `create_canonical`, `merge_alias`, `set_status`, `add_relation`, `reject_relation`, `deprecate_entity`, `supersede_entity`.

The safe workflow is **validate first, dry-run before write**, then write only after explicit approval:

```bash
engram ontology patch validate \
  --profile-state .engram/profile/profile-state.json --patch patch.json
engram ontology patch apply \
  --profile-state .engram/profile/profile-state.json --patch patch.json --dry-run
engram ontology patch apply \
  --profile-state .engram/profile/profile-state.json --patch patch.json --write
```

Every applied or rejected patch is recorded; preview the trail without mutating files:

```bash
engram ontology decision-log --profile-state .engram/profile/profile-state.json
```

### Reconciliation studio

`engram ontology studio` starts a local studio over the same patch core. By default it serves a **read-only** API; `--write` enables the patch mutation routes (`validate`/`dry-run`/`apply`), bound to loopback and guarded by a bearer token. It also serves a Svelte studio SPA for working candidate queues, candidate/canonical comparison, evidence, audit trail, and patch preview — the screenshot at the top of this README is this studio over the mystery-saga corpus.

```bash
engram ontology studio --config engram.yaml                 # read-only API + SPA
engram ontology studio --config engram.yaml --write         # token-gated apply, loopback only
```

The same write-guarded core is also exposed over MCP — the default `engram serve` graph server is read-only, and mutation tools require the explicit `engram ontology serve --config engram.yaml --write`.

### Store mirrors (instant server-side group counts)

`graph.json` stays the source of truth, but you can mirror it into a database backend (Postgres/neo4j/…) so the studio reads precomputed, O(#groups) group-by counts and a windowed first-paint slice from the backend instead of recomputing them over every node in the browser. On a real 47k-node graph the server group-counts are ~600x faster than a client recompute.

```bash
# Push the graph to the configured backend in REPLACE mode (rebuilds the
# group-by aggregate + windowed positions — the source of the instant counts).
ENGRAM_STORE=postgres ENGRAM_POSTGRES_URL=postgres://user:pass@host/db \
  engram store push --config engram.yaml          # or: --graph .engram/graph.json
engram store status --store postgres                # capabilities + latest snapshot

# Serve the studio with the store wired in: GET /api/ontology/groups is then
# answered from the backend aggregate. The store is picked up from --store, then
# ENGRAM_STORE, then storage.mirrors[0] in the config.
ENGRAM_STORE=postgres ENGRAM_POSTGRES_URL=postgres://user:pass@host/db \
  engram ontology studio --config engram.yaml
engram ontology studio --config engram.yaml --store postgres
```

The store comes from `--store`, the `ENGRAM_STORE` / `ENGRAM_POSTGRES_URL` environment variables, or a `storage.mirrors[]` entry in the project config. `store push` defaults to `--mode replace` because the group-by aggregate and windowed positions are only valid against a committed full snapshot (a `--mode merge` upsert leaves them untouched). With no store configured the studio is unchanged: the route 404s and the SPA falls back to its in-memory group-by.

## Multimodal ingestion

The same semantic pass handles non-code inputs:

| Type | Extensions | Extraction |
|------|-----------|------------|
| Docs | `.md .mdx .txt .rst .html` | Concepts + relationships + design rationale via the platform model |
| Office | `.docx .xlsx` | Converted to markdown, then extracted |
| Papers | `.pdf` | Local preflight: text-layer PDFs become Markdown via `unpdf`/`pdftotext`; scanned/low-text PDFs can use `mistral-ocr` for Markdown + images |
| Images | `.png .jpg .webp .gif` | Multimodal vision — screenshots, diagrams, any language |
| Audio / Video | `.mp4 .mov .webm .mkv .avi .m4v .mp3 .wav .m4a .ogg` | Detected locally; downloaded with `yt-dlp` when needed, normalized with `ffmpeg`, transcribed via `faster-whisper-ts`, then fed through the same semantic path |

PDF OCR, audio/video transcription, and provider variables are detailed under [Reference](#reference).

## What you get

- **God nodes** — the highest-degree concepts everything connects through.
- **Confidence scores** — every `INFERRED` edge carries a `confidence_score` from 0 to 1; `EXTRACTED` edges are always 1.0.
- **Hyperedges** — group relationships connecting 3+ nodes that pairwise edges can't express (all classes implementing a protocol, all functions in an auth flow).
- **Rationale comments** — docstrings and inline `# WHY:` / `# HACK:` / `# NOTE:` markers extracted as `rationale_for` nodes: not just what the code does, but why.
- **Surprising / INFERRED connections** — ranked cross-source links (code↔paper rank above code↔code), each with a plain-English why.
- **Community labels** — Louvain clusters named so you can navigate the graph by topic.

## Code knowledge graphs

Code was Engram's **original use case** and remains a first-class one: a codebase is itself a non-documentary corpus, and the graph answers "what calls this?", "what breaks if I change this?" better than grep. Code files go through a deterministic **no-LLM AST pass** (tree-sitter) that extracts classes, functions, imports, call graphs, docstrings, and rationale comments — no file contents leave your machine for code.

- **~20 languages** via tree-sitter AST: Python, JS, TS, Go, Rust, Java, C, C++, Ruby, PHP, Lua — plus C#, Kotlin, Scala, Swift, Zig, PowerShell, Elixir, Objective-C, and Julia whose grammars are optional dependencies that degrade gracefully when absent. Vue, Svelte, Blade, Dart, Verilog/SystemVerilog, and EJS use regex fallback extraction.
- **Call graphs and flows**: build a directed graph and derive execution flows from `CALLS` edges (`engram flows build`).
- **Review surfaces**: `engram review-delta`, `engram review-analysis`, and `engram recommend-commits` (advisory-only) give blast radius, bridge nodes, test-gap hints, and impacted communities for changed files. Review impact rules intentionally **favor recall over precision** — false positives are reported, not hidden. Review benchmarks (`engram review-eval`) are deterministic local fixtures, not a universal quality guarantee. Token metrics are estimates unless backed by actual model calls.
- **Git lifecycle**: `engram hook install` wires post-commit/checkout/merge/rewrite hooks plus a `graphify-json` merge driver that **union-merges graph nodes** when branches build the graph concurrently, so `.engram/graph.json` survives merges instead of conflicting.

## Realization tracking: agent-stats

When several AI agents (Claude Code, Codex, Antigravity/Gemini) work the same repository, git authorship stops telling you who actually built what. `engram agent-stats` indexes the **agentic CLI conversation transcripts** already on your machine — Claude Code project transcripts, Codex rollouts, Antigravity/Gemini chats — and attributes branches, commits, and work packages to the agent sessions that produced them.

Attribution is **evidence-based, never git authorship**: commit SHAs the session actually printed, h2a registry identity, and worktree×branch×time correlation. Facts are stored locally in `.engram/agents/facts.jsonl`.

```bash
engram agent-stats                  # per-agent table: sessions, tokens, commits, branches, WPs
engram agent-stats sync             # parse/refresh transcripts (incremental; --full to re-parse)
engram agent-stats sessions         # parsed sessions with their evidence-based agent identity
engram agent-stats wp <WP-id>       # conductor view: agents/sessions joined to a Track work package
```

The `wp` view can additionally attribute merged PRs via the `gh` CLI (skip with `--no-pr` when offline).

### Git-flow view

The agent-stats project graph can be rendered as a deterministic, GitHub-network-style **git graph**: one horizontal band per repository, the trunk (`main`/`master`/`develop`) on lane 0, commits ordered left→right by topological rank or by real commit time (one global time axis shared across repos), and gitk-style lane reuse so hundreds of branches stay compact — all branches are placed, no top-K. Fork and merge connectors are drawn **port-to-port** as smooth S curves (only merges carry an arrowhead), and agent sessions appear as agent-coloured triangles under the commits they produced. Branch-name pills are governed by a zero-overlap label policy (compaction, priority culling, zoom LOD).

```bash
engram agent-stats project-graph --git-since all   # per-repo Commit/Branch/Session DAG
engram merge-graphs repoA.json repoB.json --out multi.json
```

The layout ships in `@sentropic/graph` as the `git-flow` layout (`computeGitFlowPositions`). Reference: [spec/SPEC_GITFLOW_VIEW.md](spec/SPEC_GITFLOW_VIEW.md) (visual grammar, edge styles, API, pipeline) and [spec/SPEC_GITFLOW_LABELS.md](spec/SPEC_GITFLOW_LABELS.md) (label policy). Studio integration is a follow-up lot.

## How it works

Engram combines a deterministic structural pass with a model-backed semantic pass:

1. **Structural pass (no LLM).** Code is parsed with tree-sitter into classes, functions, imports, call graphs, and rationale comments. Docs, papers, Office files, and images are normalized into text or multimodal inputs (with local PDF preflight in between).
2. **Semantic pass.** Platform-backed subagents extract concepts, relationships, and design rationale. Every relationship is tagged `EXTRACTED` (found in source), `INFERRED` (inference, with a `confidence_score`), or `AMBIGUOUS` (flagged for review) — so you always know what was found vs guessed.
3. **Clustering.** Results merge into a Graphology graph, clustered with **Louvain** community detection. Clustering is topology-based — no embeddings, no vector database. The model-extracted `semantically_similar_to` edges are already in the graph, so they influence communities directly.
4. **Exports.** Interactive HTML, queryable JSON, a plain-language audit report, and optional SVG, GraphML (Gephi/yEd), Neo4j cypher, an agent-crawlable wiki (`--wiki`), and an Obsidian vault (`--obsidian`).

## Lineage & attribution

Engram builds on the foundational work of Safi Shamsi's [graphify](https://github.com/safishamsi/graphify), extending it from code-structure graphs to a full knowledge & entity-reconciliation lifecycle. Selected review-workflow ideas were adapted from the `code-review-graph` comparison work (see [spec/SPEC_CODE_REVIEW_GRAPH_OPPORUNITY.md](spec/SPEC_CODE_REVIEW_GRAPH_OPPORUNITY.md)). This repository is the maintained TypeScript product line, aligned against upstream Graphify where parity matters; see [UPSTREAM_GAP.md](UPSTREAM_GAP.md) for the tracked parity contract.

## Reference

### Supported assistants

`engram install` writes assistant integrations. Pass `--platform <name>` for non-Claude clients: `codex`, `gemini`, `copilot`, `vscode`, `aider`, `opencode`, `claw`, `droid`, `trae`, `trae-cn`, `cursor`, `hermes`, `kimi`, `kiro`, `antigravity`, `windows`.

To make an assistant always prefer the graph, run the matching `engram <platform> install` (e.g. `engram claude install` writes a `CLAUDE.md` section plus a PreToolUse hook; `engram gemini install` (or `engram install --platform gemini`) writes `GEMINI.md` and registers the MCP server; `engram copilot install` (or `engram install --platform copilot`) installs the global skill for **GitHub Copilot CLI**). Platforms without PreToolUse hooks (Gemini, Aider, OpenCode, Trae, Droid, and others) use **`AGENTS.md`** as the always-on mechanism instead. Uninstall with the matching `uninstall`, or `engram uninstall` to remove all detected integrations.

Invocation differs per client: `/engram .` in Claude Code, Gemini CLI, Copilot, and most others, but `$engram` in Codex. Codex can also register the read-only graph as an MCP server with `codex mcp add engram -- engram serve /absolute/path/to/.engram/graph.json`.

### Input scope

Scope-aware commands default to `--scope auto` (committed files plus `.engram/memory/*` in a Git repo). `--scope tracked` adds staged files; `--all` (alias for `--scope all`) restores the full recursive folder walk for papers, notes, and media. Inspect before rebuilding:

```bash
engram scope inspect . --scope auto
```

Add a `.graphifyignore` file (same syntax as `.gitignore`) to exclude folders.

### MCP server

Expose `graph.json` as a read-only MCP server for structured graph access (`query_graph`, `get_node`, `get_neighbors`, `shortest_path`, plus resources like `graphify://report`, `graphify://god-nodes`, `graphify://audit`):

```bash
engram serve .engram/graph.json
```

### PDF preflight and Mistral OCR

`ENGRAM_PDF_OCR` controls PDF handling: `auto` (default) runs a local `unpdf` preflight with `pdftotext` fallback and calls `mistral-ocr` only when a PDF has too little extractable text; `off` keeps the PDF as-is; `always` forces OCR; `dry-run` records the decision without calling the API. Mistral OCR requires `MISTRAL_API_KEY` (override the model with `ENGRAM_PDF_OCR_MODEL`); if missing in `auto` mode, Engram warns and leaves the source PDF in the semantic input. Sidecars are written under `.engram/converted/pdf/` with provenance back to the original.

### Local audio/video transcription

Transcription uses the published `faster-whisper-ts` runtime (no Python). Defaults match upstream: Whisper model `base`, CPU device, `int8` compute. Override with `ENGRAM_WHISPER_MODEL`, `ENGRAM_WHISPER_MODEL_DIR`, `ENGRAM_WHISPER_MODEL_ID`, `ENGRAM_WHISPER_MODEL_REVISION`, `ENGRAM_WHISPER_DEVICE`, and `ENGRAM_WHISPER_COMPUTE_TYPE`. URL ingestion goes through `yt-dlp`; transcripts land under `.engram/transcripts/` and are treated like regular documents.

### Optional provider variables

For CI/headless text corpora, semantic extraction can be delegated to a direct provider with `engram extract --backend anthropic|openai|gemini|mistral|cohere|ollama` (via the Vercel AI SDK). Provider base URLs can be overridden with `ANTHROPIC_BASE_URL`, `OPENAI_BASE_URL`, `GEMINI_BASE_URL` / `GOOGLE_GENERATIVE_AI_BASE_URL`, `MISTRAL_BASE_URL`, `COHERE_BASE_URL`, and `OLLAMA_BASE_URL` (local Ollama URL). Google Workspace export (`.gdoc`, `.gsheet`, `.gslides`) is enabled with `ENGRAM_GOOGLE_WORKSPACE=1` and the relevant `GOOGLE_OAUTH_*` credentials. API keys are read only from environment variables and are never written to config, `.engram/`, reports, or logs.

### Privacy

Engram sends file contents to your assistant's underlying model API for semantic extraction of docs, papers, and images. **Code files are processed locally** via tree-sitter AST — no code contents leave your machine. Audio/video transcription and PDF text preflight run locally; Mistral OCR is the only PDF-specific network call, and only when OCR mode requires it. Agent-stats transcript parsing is **entirely local** — transcripts never leave your machine. No telemetry, usage tracking, or analytics. The only network calls are to your platform's model API during extraction, explicit direct-backend extraction, optional Mistral OCR, the optional `gh` PR lookup in `agent-stats wp`, and any URLs you explicitly ask Engram to ingest.

### Tech stack

Graphology + Louvain (`graphology-communities-louvain`) + tree-sitter + vis-network, with regex-backed language fallbacks, `unpdf`, optional `pdftotext`, optional `mistral-ocr`, `officeparser`, `turndown`, the `yt-dlp` + `ffmpeg` + `faster-whisper-ts` transcription path, and optional Vercel AI SDK direct text backends. No Neo4j required; the default HTML output is fully static.

The studio's dense-graph renderer and layout registry come from `@sentropic/graph`, which now lives in and is published from the [Sent Tech design system](https://github.com/rhanka/sent-tech-design-system). The `packages/graph` copy in this repository is private and unpublishable — it is only the local build/test source for the studio (see [packages/graph/PUBLISHING.md](packages/graph/PUBLISHING.md)); the installed CLI resolves the published package from npm.

## License

MIT. See [LICENSE](LICENSE).

<details>
<summary>Contributing</summary>

**Worked examples** are the most trust-building contribution. Run the Engram skill on a real corpus, save output to `worked/{slug}/`, write a `review.md` evaluating what the graph got right and wrong, and submit a PR.

**Extraction bugs** — open an issue with the input file, the cache entry (`.engram/cache/`), and what was missed or invented.

See [ARCHITECTURE.md](ARCHITECTURE.md) for module responsibilities and how to add a language.

</details>
