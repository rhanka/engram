# graphify

[![TypeScript CI](https://github.com/rhanka/graphify/actions/workflows/typescript-ci.yml/badge.svg?branch=main)](https://github.com/rhanka/graphify/actions/workflows/typescript-ci.yml)

**Turn any source into a reconciled knowledge graph.** Code, docs, papers, datasets — graphify extracts canonical entities and typed relations, deduplicates and reconciles them across sources, and gives you back a queryable knowledge graph your assistant can reason over. Reconciliation is human-in-the-loop: candidate matches are proposed, validated against an ontology, dry-run, and only then applied.

## What makes graphify different

graphify is not just a multimodal code graph. Its differentiating value is the **knowledge layer**: a configurable ontology, canonical entities, cross-source entity reconciliation, and a reviewable patch lifecycle for every decision.

### Configurable ontology (profiles)

A project can pin an **ontology profile** that constrains the graph: allowed node types, relation types, citation requirements, review statuses, and named registry bindings (CSV, JSON, or YAML). Profile mode is strictly additive — it activates only when graphify finds `graphify.yaml`, `graphify.yml`, `.graphify/config.yaml`, or `.graphify/config.yml`, or when you pass `--config`/`--profile`. Without it, normal graphify behavior is unchanged.

```bash
graphify profile validate --config graphify.yaml
graphify profile dataprep . --config graphify.yaml
graphify profile report --profile-state .graphify/profile/profile-state.json \
  --graph .graphify/graph.json --out .graphify/profile/profile-report.md
```

Registries are normalized into ordinary extraction fragments with stable IDs and profile attributes, so external authoritative data and extracted mentions live in the same graph.

### Canonical entities and cross-source reconciliation

The same real-world thing is often mentioned differently across sources: a person named one way in a paper and another way in a dataset, a class in code and the concept describing it in a doc. graphify models a **canonical entity** (with a label, aliases, type, status, evidence refs) and links the variant **mentions** to it, so they collapse to a single node instead of staying scattered.

Reconciliation candidates are generated **deterministically** — `entity_match` candidates ranked by shared normalized terms and exact-label match, each carrying a score and a proposed patch operation:

```bash
graphify ontology candidates \
  --profile-state .graphify/profile/profile-state.json \
  --out .graphify/ontology/candidates.json
```

### A reviewable patch lifecycle (propose → validate → dry-run → apply)

Reconciliation never edits derived files directly. `.graphify/graph.json` and `.graphify/ontology/*.json` are generated artifacts; every decision is a reviewable `graphify_ontology_patch_v1` instead. A patch is validated against the active profile hash, graph hash, evidence refs, relation endpoint rules, status-transition policy, and a configured repository path jail.

Supported patch operations: `accept_match`, `reject_match`, `create_canonical`, `merge_alias`, `set_status`, `add_relation`, `reject_relation`, `deprecate_entity`, `supersede_entity`.

The safe workflow is **validate first, dry-run before write**, then write only after explicit approval:

```bash
graphify ontology patch validate \
  --profile-state .graphify/profile/profile-state.json --patch patch.json
graphify ontology patch apply \
  --profile-state .graphify/profile/profile-state.json --patch patch.json --dry-run
graphify ontology patch apply \
  --profile-state .graphify/profile/profile-state.json --patch patch.json --write
```

Every applied or rejected patch is recorded; preview the trail without mutating files:

```bash
graphify ontology decision-log --profile-state .graphify/profile/profile-state.json
```

### Reconciliation studio

`graphify ontology studio` starts a local studio over the same patch core. By default it serves a **read-only** API; `--write` enables the patch mutation routes (`validate`/`dry-run`/`apply`), bound to loopback and guarded by a bearer token. It also serves a Svelte studio SPA for working candidate queues, candidate/canonical comparison, evidence, audit trail, and patch preview.

```bash
graphify ontology studio --config graphify.yaml                 # read-only API + SPA
graphify ontology studio --config graphify.yaml --write         # token-gated apply, loopback only
```

The same write-guarded core is also exposed over MCP — the default `graphify serve` graph server is read-only, and mutation tools require the explicit `graphify ontology serve --config graphify.yaml --write`.

## Works on code too

Code is a first-class case of the same pipeline. Code files go through a deterministic **no-LLM AST pass** (tree-sitter) that extracts classes, functions, imports, call graphs, docstrings, and rationale comments — no file contents leave your machine for code.

- **20 languages** via tree-sitter AST: Python, JS, TS, Go, Rust, Java, C, C++, Ruby, C#, Kotlin, Scala, PHP, Swift, Lua, Zig, PowerShell, Elixir, Objective-C, Julia — plus fallback extraction for Vue, Svelte, Blade, Dart, Verilog/SystemVerilog, MJS, and EJS.
- **Call graphs and flows**: build a directed graph and derive execution flows from `CALLS` edges (`graphify flows build`).
- **Review surfaces**: `graphify review-delta`, `graphify review-analysis`, and `graphify recommend-commits` (advisory-only) give blast radius, bridge nodes, test-gap hints, and impacted communities for changed files.

## Multimodal ingestion

The same semantic pass handles non-code inputs:

| Type | Extensions | Extraction |
|------|-----------|------------|
| Docs | `.md .mdx .txt .rst .html` | Concepts + relationships + design rationale via the platform model |
| Office | `.docx .xlsx` | Converted to markdown, then extracted |
| Papers | `.pdf` | Local preflight: text-layer PDFs become Markdown via `pdf-parse`/`pdftotext`; scanned/low-text PDFs can use `mistral-ocr` for Markdown + images |
| Images | `.png .jpg .webp .gif` | Multimodal vision — screenshots, diagrams, any language |
| Audio / Video | `.mp4 .mov .webm .mkv .avi .m4v .mp3 .wav .m4a .ogg` | Detected locally; downloaded with `yt-dlp` when needed, normalized with `ffmpeg`, transcribed via `faster-whisper-ts`, then fed through the same semantic path |

PDF OCR, audio/video transcription, and provider variables are detailed under [Reference](#reference).

## Quickstart

**Requires:** Node.js 20+ and one supported AI coding assistant (Claude Code, Codex, Gemini CLI, and others — see [Reference](#reference)).

```bash
npm install -g @sentropic/graphify
graphify install
```

Build your first graph from your assistant:

```bash
/graphify .                        # Claude Code / Gemini CLI / Copilot / Aider / OpenCode / others
$graphify .                        # Codex
```

This writes `.graphify/`:

```
.graphify/
├── graph.json       persistent graph — query weeks later without re-reading
├── GRAPH_REPORT.md  god nodes, surprising connections, suggested questions
├── graph.html       interactive graph — click nodes, search, filter by community
├── wiki/            optional LLM-readable wiki pages
└── cache/           local SHA256 cache (ignored)
```

Query it directly from the terminal — no assistant needed:

```bash
graphify query "what connects attention to the optimizer?" --graph .graphify/graph.json
graphify path "DigestAuth" "Response"
graphify explain "SwinTransformer"
graphify summary --graph .graphify/graph.json        # compact first-hop orientation
```

For an ontology project, add a `graphify.yaml`, run `graphify profile dataprep`, then open the reconciliation studio:

```bash
graphify ontology studio --config graphify.yaml --write
```

## How it works

graphify combines a deterministic structural pass with a model-backed semantic pass:

1. **Structural pass (no LLM).** Code is parsed with tree-sitter into classes, functions, imports, call graphs, and rationale comments. Docs, papers, Office files, and images are normalized into text or multimodal inputs (with local PDF preflight in between).
2. **Semantic pass.** Platform-backed subagents extract concepts, relationships, and design rationale. Every relationship is tagged `EXTRACTED` (found in source), `INFERRED` (inference, with a `confidence_score`), or `AMBIGUOUS` (flagged for review) — so you always know what was found vs guessed.
3. **Clustering.** Results merge into a Graphology graph, clustered with **Louvain** community detection. Clustering is topology-based — no embeddings, no vector database. The model-extracted `semantically_similar_to` edges are already in the graph, so they influence communities directly.
4. **Exports.** Interactive HTML, queryable JSON, a plain-language audit report, and optional SVG, GraphML (Gephi/yEd), Neo4j cypher, an agent-crawlable wiki (`--wiki`), and an Obsidian vault (`--obsidian`).

## Lineage & attribution

graphify builds on the foundational work of Safi Shamsi's [graphify](https://github.com/safishamsi/graphify), extending it from code-structure graphs to a full knowledge & entity-reconciliation lifecycle. Selected review-workflow ideas were adapted from the `code-review-graph` comparison work (see [spec/SPEC_CODE_REVIEW_GRAPH_OPPORUNITY.md](spec/SPEC_CODE_REVIEW_GRAPH_OPPORUNITY.md)). This repository is the maintained TypeScript product line, aligned against upstream Graphify where parity matters; see [UPSTREAM_GAP.md](UPSTREAM_GAP.md) for the tracked parity contract.

## Reference

### Supported assistants

`graphify install` writes assistant integrations. Pass `--platform <name>` for non-Claude clients: `codex`, `gemini`, `copilot`, `vscode`, `aider`, `opencode`, `claw`, `droid`, `trae`, `trae-cn`, `cursor`, `hermes`, `kimi`, `kiro`, `antigravity`, `windows`.

To make an assistant always prefer the graph, run the matching `graphify <platform> install` (e.g. `graphify claude install` writes a `CLAUDE.md` section plus a PreToolUse hook; `graphify gemini install` writes `GEMINI.md` and registers the MCP server). Uninstall with the matching `uninstall`, or `graphify uninstall` to remove all detected integrations.

### Input scope

Scope-aware commands default to `--scope auto` (committed files plus `.graphify/memory/*` in a Git repo). `--scope tracked` adds staged files; `--all` (alias for `--scope all`) restores the full recursive folder walk for papers, notes, and media. Inspect before rebuilding:

```bash
graphify scope inspect . --scope auto
```

Add a `.graphifyignore` file (same syntax as `.gitignore`) to exclude folders.

### MCP server

Expose `graph.json` as a read-only MCP server for structured graph access (`query_graph`, `get_node`, `get_neighbors`, `shortest_path`, plus resources like `graphify://report`, `graphify://god-nodes`, `graphify://audit`):

```bash
graphify serve .graphify/graph.json
```

### PDF preflight and Mistral OCR

`GRAPHIFY_PDF_OCR` controls PDF handling: `auto` (default) runs a local `pdf-parse` preflight with `pdftotext` fallback and calls `mistral-ocr` only when a PDF has too little extractable text; `off` keeps the PDF as-is; `always` forces OCR; `dry-run` records the decision without calling the API. Mistral OCR requires `MISTRAL_API_KEY` (override the model with `GRAPHIFY_PDF_OCR_MODEL`); if missing in `auto` mode, graphify warns and leaves the source PDF in the semantic input. Sidecars are written under `.graphify/converted/pdf/` with provenance back to the original.

### Local audio/video transcription

Transcription uses the published `faster-whisper-ts` runtime (no Python). Defaults match upstream: Whisper model `base`, CPU device, `int8` compute. Override with `GRAPHIFY_WHISPER_MODEL`, `GRAPHIFY_WHISPER_MODEL_DIR`, `GRAPHIFY_WHISPER_MODEL_ID`, `GRAPHIFY_WHISPER_MODEL_REVISION`, `GRAPHIFY_WHISPER_DEVICE`, and `GRAPHIFY_WHISPER_COMPUTE_TYPE`. URL ingestion goes through `yt-dlp`; transcripts land under `.graphify/transcripts/` and are treated like regular documents.

### Optional provider variables

For CI/headless text corpora, semantic extraction can be delegated to a direct provider with `graphify extract --backend anthropic|openai|gemini|mistral|cohere|ollama` (via the Vercel AI SDK). `OLLAMA_BASE_URL` overrides the local Ollama URL. Google Workspace export (`.gdoc`, `.gsheet`, `.gslides`) is enabled with `GRAPHIFY_GOOGLE_WORKSPACE=1` and the relevant `GOOGLE_OAUTH_*` credentials. API keys are read only from environment variables and are never written to config, `.graphify/`, reports, or logs.

### Privacy

graphify sends file contents to your assistant's underlying model API for semantic extraction of docs, papers, and images. **Code files are processed locally** via tree-sitter AST — no code contents leave your machine. Audio/video transcription and PDF text preflight run locally; Mistral OCR is the only PDF-specific network call, and only when OCR mode requires it. No telemetry, usage tracking, or analytics. The only network calls are to your platform's model API during extraction, explicit direct-backend extraction, optional Mistral OCR, and any URLs you explicitly ask graphify to ingest.

### Tech stack

Graphology + Louvain (`graphology-communities-louvain`) + tree-sitter + vis-network, with regex-backed language fallbacks, `pdf-parse`, optional `pdftotext`, optional `mistral-ocr`, `mammoth`, `exceljs`, `turndown`, the `yt-dlp` + `ffmpeg` + `faster-whisper-ts` transcription path, and optional Vercel AI SDK direct text backends. No Neo4j required; the default HTML output is fully static.

## License

MIT. See [LICENSE](LICENSE).

<details>
<summary>Contributing</summary>

**Worked examples** are the most trust-building contribution. Run the graphify skill on a real corpus, save output to `worked/{slug}/`, write an honest `review.md` evaluating what the graph got right and wrong, and submit a PR.

**Extraction bugs** — open an issue with the input file, the cache entry (`.graphify/cache/`), and what was missed or invented.

See [ARCHITECTURE.md](ARCHITECTURE.md) for module responsibilities and how to add a language.

</details>
