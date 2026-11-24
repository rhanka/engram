---
name: engram
description: "any input (code, docs, papers, images) -> knowledge graph -> clustered communities -> static Ontology Studio + JSON + audit report. Use when user asks any question about a codebase, project content, architecture, or file relationships, especially if .engram/ exists. Provides persistent graph with god nodes, community detection, and BFS/DFS query tools."
trigger: $engram
---

# $engram

> Alias: `$graphify` still triggers this skill (deprecated alias for `$engram`).

Turn any folder of files into a navigable knowledge graph with community detection, a verifiable audit trail, and three outputs: a static Ontology Studio, GraphRAG-ready JSON, and a plain-language `GRAPH_REPORT.md`.

This Codex skill is **TypeScript-backed**. Before calling the run successful, confirm [.engram/.graphify_runtime.json](.engram/.graphify_runtime.json) exists and contains `"runtime": "typescript"`.

## Usage

```bash
$engram                                             # full pipeline on current directory
$engram <path>                                      # full pipeline on specific path
$engram https://github.com/<owner>/<repo>           # clone repo locally, then run the full pipeline
$engram https://github.com/<owner>/<repo> --branch <branch>  # clone a specific branch before graphing
$engram <path> --scope auto                         # safe default for code/review repos
$engram <path> --scope tracked                      # include newly staged files too
$engram <path> --all                                # full recursive folder walk for knowledge bases
$engram <path> --directed                           # build directed graph (preserves source->target)
$engram <path> --mode deep                          # richer INFERRED edges during semantic extraction
$engram <path> --pdf-ocr auto                       # preflight PDFs; OCR scanned/low-text PDFs with mistral-ocr when needed
$engram <path> --whisper-model medium               # use a larger Whisper model for local transcription
$engram <path> --update                             # incremental - re-extract only new/changed files
$engram <path> --cluster-only                       # re-run clustering/report on existing graph
engram studio export .engram/studio               # build the self-contained static Ontology Studio (serve with any static file server)
$engram <path> --svg                                # also export graph.svg
$engram <path> --graphml                            # also export graph.graphml
$engram <path> --neo4j                              # export .engram/cypher.txt
$engram <path> --neo4j-push bolt://localhost:7687   # push directly to Neo4j
$engram <path> --mcp                                # start MCP stdio server for agent access
$engram <path> --watch                              # watch folder, auto-rebuild on code changes
engram wiki describe --graph .engram/graph.json --mode assistant --targets all  # opt-in description sidecars
engram export wiki --graph .engram/graph.json --descriptions .engram/wiki/descriptions.json
engram export obsidian --graph .engram/graph.json --descriptions .engram/wiki/descriptions.json
$engram add <url>                                   # fetch URL, save to ./raw, update graph
$engram add <url> --author "Name"                   # tag who wrote it
$engram add <url> --contributor "Name"              # tag who added it
$engram migrate-state --dry-run                    # plan graphify-out -> .engram migration
$engram query "<question>"                          # BFS traversal - broad context
$engram query "<question>" --dfs                    # DFS - trace one chain
$engram query "<question>" --budget 1500            # cap answer at N tokens
$engram summary --graph .engram/graph.json        # compact first-hop orientation before deep traversal
$engram minimal-context --task "review PR" --graph .engram/graph.json  # first review call
$engram review-delta --files src/auth.ts --graph .engram/graph.json  # review impact for changed files
$engram review-analysis --files src/auth.ts --graph .engram/graph.json  # blast radius + review views
$engram recommend-commits --files src/auth.ts,src/session.ts --graph .engram/graph.json  # advisory commit grouping
$engram scope inspect <path> --scope auto           # inspect the resolved file inventory first
$engram path "AuthModule" "Database"                # shortest path between concepts
$engram explain "SwinTransformer"                   # explain one node and its neighbors
```

## Input scope policy

- Default to `--scope auto` for codebase and review work. In Git repos this resolves to committed files plus `.engram/memory/*`.
- Use `--scope tracked` when newly staged files must be included before commit.
- Use `--all` only when the user clearly wants a knowledge-base crawl across docs, notes, papers, screenshots, audio, or video.
- If the repo is dirty or the right scope is unclear, run `engram scope inspect <path> --scope auto` first and summarize the included and excluded counts.

In Codex, prefer `$engram ...` as the explicit invocation. Do not rely on `/engram ...`, which is Claude syntax. `$engram` is a Codex skill trigger, not a Bash command like `engram .`.

Install flow for Codex:

```bash
npm install -g @sentropic/engram
engram install --platform codex
engram codex install
```

## What You Must Do When Invoked

If no path was given, use `.`. Do not ask the user for a path.

If the path argument starts with `https://github.com/` or `http://github.com/`, treat it as a GitHub URL and run Step 0 before anything else. Use the resolved local clone path for all later steps.

Follow these steps in order. Do not skip the runtime proof step.

### Step 0 - Clone GitHub repos when the input is a GitHub URL

```bash
GRAPHIFY_BRANCH_FLAG=""
if the original invocation included --branch <name>, set GRAPHIFY_BRANCH_FLAG="--branch <name>"

LOCAL_PATH=$(engram clone "INPUT_GITHUB_URL" $GRAPHIFY_BRANCH_FLAG)
```

Replace `INPUT_PATH` with `LOCAL_PATH` for all subsequent commands.

### Step 1 - Resolve the installed TypeScript runtime

```bash
GRAPHIFY_BIN=$(command -v engram 2>/dev/null || command -v graphify 2>/dev/null || true)
NODE_BIN=$(command -v node 2>/dev/null || true)

if [ -z "$GRAPHIFY_BIN" ]; then
  echo "ERROR: engram is not installed. Install the TypeScript package first."
  echo "Run: npm install -g @sentropic/engram"
  exit 1
fi

if [ -z "$NODE_BIN" ]; then
  echo "ERROR: node is not available in PATH."
  exit 1
fi

GRAPHIFY_CLI=$("$NODE_BIN" -e "const fs=require('fs'); console.log(fs.realpathSync(process.argv[1]));" "$GRAPHIFY_BIN")
GRAPHIFY_DIST_DIR=$("$NODE_BIN" -e "const path=require('path'); console.log(path.dirname(process.argv[1]));" "$GRAPHIFY_CLI")
GRAPHIFY_RUNTIME="$GRAPHIFY_DIST_DIR/skill-runtime.js"

mkdir -p .engram
printf '%s' "$NODE_BIN" > .engram/.graphify_node
printf '%s' "$GRAPHIFY_RUNTIME" > .engram/.graphify_runtime_script
"$NODE_BIN" "$GRAPHIFY_RUNTIME" runtime-info > .engram/.graphify_runtime.json

"$NODE_BIN" -e "
  const fs = require('fs');
  const runtime = JSON.parse(fs.readFileSync('.engram/.graphify_runtime.json', 'utf8'));
  if (runtime.runtime !== 'typescript') {
    console.error('ERROR: expected TypeScript runtime, got', runtime.runtime);
    process.exit(1);
  }
"
```

If this step fails, stop and tell the user exactly why. Do not continue with a Python fallback.

**In every subsequent bash block, use:**

```bash
$(cat .engram/.graphify_node) "$(cat .engram/.graphify_runtime_script)" ...
```

That keeps the run pinned to the resolved TypeScript runtime.

### Step 2 - Detect files

```bash
GRAPHIFY_SCOPE_FLAG="--scope auto"
if the original invocation included --all, set GRAPHIFY_SCOPE_FLAG="--all"
if the original invocation included --scope <mode>, set GRAPHIFY_SCOPE_FLAG="--scope <mode>"

$(cat .engram/.graphify_node) "$(cat .engram/.graphify_runtime_script)" detect "INPUT_PATH" $GRAPHIFY_SCOPE_FLAG --out .engram/.graphify_detect.json
```

Replace `INPUT_PATH` with the actual path the user provided. Do not print the raw JSON. Read it silently and present a clean summary:

```text
Corpus: X files · ~Y words
  code:     N files
  docs:     N files
  papers:   N files
  images:   N files
  video:    N files
```

The detection JSON shape is:
- `files.code`
- `files.document`
- `files.paper`
- `files.image`
- `files.video`

Then act on it:
- If `total_files` is `0`: stop with `No supported files found in [path].`
- If `skipped_sensitive` is non-empty: mention the number skipped, not the names.
- If the user clearly asked for a knowledge-base crawl and the current run used `--scope auto`, switch to `--all`.
- If newly staged files should count, switch to `--scope tracked`.
- If `total_words > 2_000_000` or `total_files > 200`: show the warning and the top 5 subdirectories by file count, then ask which subfolder to run on.
- Otherwise: proceed to Step 2.5. It is a safe no-op if no video or PDF files need preprocessing.

### Step 2.5 - Prepare semantic detection, including audio/video transcripts and PDF preflight/OCR when needed

Always run this step. It transcribes audio/video when present, runs local PDF preflight for papers, and converts text-layer PDFs locally. For scanned/low-text PDFs, keep two OCR paths explicit: the assistant vision model may interpret the original PDF or extracted image chunks during semantic extraction, and `mistral-ocr` may be used when OCR is explicitly requested or when a configured `MISTRAL_API_KEY` is available and preflight detects a scanned/low-text PDF. Do not call Mistral blindly. In `auto` mode, if no key/provider is available, leave the source PDF in semantic inputs so the assistant path can still handle it. Generated transcripts, PDF Markdown sidecars, and relevant PDF-extracted images are treated as semantic inputs during semantic extraction.

```bash
GRAPHIFY_WHISPER_FLAG=""
if the original invocation included --whisper-model <name>, set GRAPHIFY_WHISPER_FLAG="--whisper-model <name>"
GRAPHIFY_PDF_OCR_FLAG=""
if the original invocation included --pdf-ocr <mode>, set GRAPHIFY_PDF_OCR_FLAG="--pdf-ocr <mode>"

$(cat .engram/.graphify_node) "$(cat .engram/.graphify_runtime_script)" prepare-semantic-detect \
  $GRAPHIFY_WHISPER_FLAG \
  $GRAPHIFY_PDF_OCR_FLAG \
  --detect .engram/.graphify_detect.json \
  --out .engram/.graphify_detect_semantic.json \
  --transcripts-out .engram/.graphify_transcripts.json \
  --pdf-out .engram/.graphify_pdf_ocr.json \
  --analysis .engram/.graphify_analysis.json
```

After this step:
- use [.engram/.graphify_detect_semantic.json](.engram/.graphify_detect_semantic.json) for semantic cache and semantic extraction
- keep using [.engram/.graphify_detect.json](.engram/.graphify_detect.json) for manifest, cost, and final reporting
- the runtime prints `Prepared semantic inputs: N transcript(s), M PDF sidecar(s)`

### Step 3 - Extract entities and relationships

Track whether `--mode deep` and `--directed` were given. Pass deep mode to every semantic subagent prompt.

Before running the build/finalization commands below, set this once:

```bash
GRAPHIFY_DIRECTED_FLAG=""
if the original invocation included --directed, set GRAPHIFY_DIRECTED_FLAG="--directed"
```

This step has two parts:
- structural extraction for code files, using the TypeScript runtime
- semantic extraction for docs, papers, images, generated transcripts, and PDF sidecars, using Codex subagents

Run Part A and Part B in parallel.

#### Part A - Structural extraction for code files

```bash
$(cat .engram/.graphify_node) "$(cat .engram/.graphify_runtime_script)" extract-ast \
  --detect .engram/.graphify_detect.json \
  --out .engram/.graphify_ast.json
```

#### Part B - Semantic extraction with Codex

If there are zero docs, papers, images, generated transcripts, and PDF sidecars, skip Part B entirely and go straight to Part C.

Use this rule:
- If the uncached non-code set fits in a single chunk of 20 files or fewer, stay in the main Codex thread and extract it directly.
- If it needs multiple chunks, use Codex subagents for parallel extraction.

##### Step B0 - Check semantic extraction cache first

```bash
$(cat .engram/.graphify_node) "$(cat .engram/.graphify_runtime_script)" check-semantic-cache \
  --detect .engram/.graphify_detect_semantic.json \
  --root . \
  --cached-out .engram/.graphify_cached.json \
  --uncached-out .engram/.graphify_uncached.txt
```

Only extract files listed in [.engram/.graphify_uncached.txt](.engram/.graphify_uncached.txt). If that file is empty, skip straight to Part C.

##### Step B1 - Split uncached files into chunks

Load the file list from [.engram/.graphify_uncached.txt](.engram/.graphify_uncached.txt). Split into chunks of 20-25 files each. Put each image in its own chunk. PDF sidecar Markdown can reference extracted image artifacts under `.engram/converted/pdf/*_images/`; when those images contain diagrams, tables, captions, or embedded text that carry meaning, include them as image chunks or describe the delegated OCR/vision output with provenance back to the source PDF. Keep files from the same directory together when possible.

##### Step B2 - Choose local extraction vs subagents

If there is exactly one chunk and it contains 20 files or fewer:
- stay in the main Codex thread
- read those files directly
- produce [.engram/.graphify_semantic_new.json](.engram/.graphify_semantic_new.json) yourself, using the exact schema below

If there are multiple chunks:
- use `spawn_agent` once per chunk
- dispatch them all in the same response so they run in parallel
- collect each result, validate JSON, and write the merged result to [.engram/.graphify_semantic_new.json](.engram/.graphify_semantic_new.json)

Use this extraction prompt, whether you apply it locally or inside subagents:

```text
You are an engram extraction subagent. Read the files listed and extract a knowledge graph fragment.
Output ONLY valid JSON matching the schema below - no explanation, no markdown fences, no preamble.

Files (chunk CHUNK_NUM of TOTAL_CHUNKS):
FILE_LIST

Rules:
- EXTRACTED: relationship explicit in source
- INFERRED: reasonable inference
- AMBIGUOUS: uncertain - flag it, do not omit it
- Node IDs must stay stable across chunks and reruns. Base them on the entity label or file-relative identity only. Never append chunk counters like `_c1`, `_c2`, `_chunk3`, or similar suffixes.

Code files: focus on semantic edges AST cannot find. Do not re-extract imports.
Doc/paper files: extract named concepts, entities, citations. For rationale (WHY decisions were made, trade-offs, design intent): store it as a `rationale` attribute on the relevant concept node. Do not create a separate rationale node or fragment node unless it is itself a named concept.
Code files: when adding `calls` edges, source MUST be the caller and target MUST be the callee. Never reverse the direction.
Image files: use vision to understand what the image is, not just OCR. For images extracted from PDFs, decode figures, tables, diagrams, captions, and embedded text when they carry meaning; use Codex vision by default, or a delegated OCR/vision model when configured, and keep provenance to the source PDF and sidecar.

DEEP_MODE=true means: be aggressive with INFERRED edges, but mark uncertain ones AMBIGUOUS.

Semantic similarity: add semantically_similar_to only when the connection is genuinely non-obvious.
Hyperedges: add sparingly, only when a group relationship carries meaning beyond pairwise edges.

If a file has YAML frontmatter, copy source_url, captured_at, author, contributor onto every node from that file.

Output exactly:
{"nodes":[{"id":"filestem_entityname","label":"Human Readable Name","file_type":"code|document|paper|image|concept|rationale","source_file":"relative/path","source_location":null,"source_url":null,"captured_at":null,"author":null,"contributor":null,"rationale":null}],"edges":[{"source":"node_id","target":"node_id","relation":"calls|implements|references|cites|conceptually_related_to|shares_data_with|semantically_similar_to|rationale_for","confidence":"EXTRACTED|INFERRED|AMBIGUOUS","confidence_score":1.0,"source_file":"relative/path","source_location":null,"weight":1.0}],"hyperedges":[{"id":"snake_case_id","label":"Human Readable Label","nodes":["node_id1","node_id2","node_id3"],"relation":"participate_in|implement|form","confidence":"EXTRACTED|INFERRED","confidence_score":0.75,"source_file":"relative/path"}],"input_tokens":0,"output_tokens":0}
```

##### Step B3 - Finalize the build

If you used subagents, wait for all of them, parse each result as JSON, skip failed chunks with a warning, and merge the successful chunks into [.engram/.graphify_semantic_new.json](.engram/.graphify_semantic_new.json). If more than half the chunks fail, stop.

If you extracted locally, write your final JSON directly to [.engram/.graphify_semantic_new.json](.engram/.graphify_semantic_new.json).

Then run one finalization command. It will:
- save fresh semantic results into the cache
- merge cached + fresh semantic extraction
- merge AST + semantic extraction
- build the graph
- generate `graph.json`, `GRAPH_REPORT.md`, `manifest.json`, `cost.json`

```bash
$(cat .engram/.graphify_node) "$(cat .engram/.graphify_runtime_script)" finalize-build \
  $GRAPHIFY_DIRECTED_FLAG \
  --detect .engram/.graphify_detect.json \
  --ast .engram/.graphify_ast.json \
  --cached .engram/.graphify_cached.json \
  --semantic-new .engram/.graphify_semantic_new.json \
  --root "INPUT_PATH" \
  --graph-out .engram/graph.json \
  --report-out .engram/GRAPH_REPORT.md \
  --analysis-out .engram/.graphify_analysis.json \
  --cost-out .engram/cost.json
```

If this step fails because the graph is empty, stop and tell the user exactly that.

### Step 5 - Label communities and enrich

**Enrichment commands (no API key needed; opt-in, non-destructive).** On a built or curated `graph.json` you can stamp enrichment in place without re-extracting: `engram describe .` (node descriptions), `engram label .` (community labels), and `engram cite .` (grounded citations). `engram cite` (alias `ground-citations`) scans the corpus and grounds per-entity `node.citations[]` entries `{quote, source_file, source_location}` — populating **new** verbatim citations, not just projecting existing ones. **Heuristic mode is the no-key DEFAULT** (`--mode heuristic|assistant|api`); it is **anti-hallucination** — every emitted `quote` is a verified verbatim substring of the source, and any quote that cannot be relocated is dropped, never invented. It UNIONS with existing citations (never clobbers). Symmetric to `describe`/`label` and, like them, **opt-in** (NOT auto-run). **Run `engram cite .` BEFORE the studio/wiki export** so entity panels ship non-null citations.

```bash
engram cite .                 # no-key heuristic grounding (default)
engram cite . --only-missing  # additive pass: only nodes with no citations yet
engram cite . --dry-run       # report coverage without writing
```

Read [.engram/.graphify_analysis.json](.engram/.graphify_analysis.json). For each community key, choose a 2-5 word plain-language name.

Write those labels to [.engram/.graphify_labels.json](.engram/.graphify_labels.json), then regenerate the labeled artifacts:

```bash
$(cat .engram/.graphify_node) "$(cat .engram/.graphify_runtime_script)" write-labeled-report \
  $GRAPHIFY_DIRECTED_FLAG \
  --extract .engram/.graphify_extract.json \
  --detect .engram/.graphify_detect.json \
  --analysis .engram/.graphify_analysis.json \
  --labels .engram/.graphify_labels.json \
  --root "INPUT_PATH" \
  --report-out .engram/GRAPH_REPORT.md \
  --graph-out .engram/graph.json
```

### Step 6 - Export extras

**Static Ontology Studio (the visual output).** Build the self-contained static studio after the graph exists. It bundles the prebuilt studio SPA (`index.html` + `assets/`) with the data artifacts it reads next to it — `graph.json`, `scene.json` (with pre-computed force-layout positions), `entities.json`, `reconciliation-candidates.json`, and `class-hierarchies.json` (emitted only when a profile carries a `class_hierarchies` block). The studio scales to large graphs (WebGL + pre-computed positions), so there is no node-count cap:

```bash
# Default state dir is .engram; pass --profile <path> to emit class-hierarchies.json for ontology profiles
engram studio export .engram/studio
```

To open it, serve the export dir (`.engram/studio`) with any static file server and load `index.html` in a browser.

Wiki descriptions are opt-in and two-step. First generate sidecars, then pass their index into wiki or Obsidian rendering:

```bash
engram wiki describe --graph .engram/graph.json --mode assistant --targets all
# or, for direct mode:
engram wiki describe --graph .engram/graph.json --mode direct --backend openai --targets all

engram export wiki --graph .engram/graph.json --descriptions .engram/wiki/descriptions.json
engram export obsidian --graph .engram/graph.json --descriptions .engram/wiki/descriptions.json
```

Sidecars live under `.engram/wiki/descriptions/` with an index at `.engram/wiki/descriptions.json`. They record graph hash, prompt/generator provenance, evidence refs, and cache keys; existing generated sidecars may be reused when a fresh generation does not complete. `insufficient_evidence` sidecars render no Description section. This never mutates `.engram/graph.json`.

If `--svg` was requested:

```bash
$(cat .engram/.graphify_node) "$(cat .engram/.graphify_runtime_script)" export-svg \
  $GRAPHIFY_DIRECTED_FLAG \
  --extract .engram/.graphify_extract.json \
  --analysis .engram/.graphify_analysis.json \
  --labels .engram/.graphify_labels.json \
  --out .engram/graph.svg
```

If `--graphml` was requested:

```bash
$(cat .engram/.graphify_node) "$(cat .engram/.graphify_runtime_script)" export-graphml \
  $GRAPHIFY_DIRECTED_FLAG \
  --extract .engram/.graphify_extract.json \
  --analysis .engram/.graphify_analysis.json \
  --out .engram/graph.graphml
```

If `--neo4j` was requested:

```bash
$(cat .engram/.graphify_node) "$(cat .engram/.graphify_runtime_script)" export-cypher \
  $GRAPHIFY_DIRECTED_FLAG \
  --extract .engram/.graphify_extract.json \
  --out .engram/cypher.txt
```

If `--neo4j-push <uri>` was requested, ask for credentials if needed, then run:

```bash
$(cat .engram/.graphify_node) "$(cat .engram/.graphify_runtime_script)" push-neo4j \
  $GRAPHIFY_DIRECTED_FLAG \
  --extract .engram/.graphify_extract.json \
  --analysis .engram/.graphify_analysis.json \
  --uri "NEO4J_URI" \
  --user "NEO4J_USER" \
  --password "NEO4J_PASSWORD"
```

If `--mcp` was requested, use the public TypeScript CLI:

```bash
engram serve .engram/graph.json
```

To register it in Codex:

```bash
codex mcp add engram -- engram serve /absolute/path/to/.engram/graph.json
```

If `--watch` was requested, use the public TypeScript watcher:

```bash
engram watch "INPUT_PATH" --debounce 3
```

### Step 7 - Benchmark, cost, cleanup, report

If `total_words > 5000`, run:

```bash
$(cat .engram/.graphify_node) "$(cat .engram/.graphify_runtime_script)" benchmark \
  --graph .engram/graph.json \
  --corpus-words TOTAL_WORDS
```

Clean up temp files:

```bash
rm -f .engram/.graphify_detect.json .engram/.graphify_detect_semantic.json .engram/.graphify_transcripts.json .engram/.graphify_pdf_ocr.json .engram/.graphify_ast.json .engram/.graphify_cached.json .engram/.graphify_uncached.txt .engram/.graphify_semantic_new.json .engram/.graphify_analysis.json
rm -f .engram/needs_update 2>/dev/null || true
```

Tell the user:

```text
Graph complete. Outputs in PATH_TO_DIR/.engram/

  studio/                    - static Ontology Studio (serve with any static file server, open index.html)
  GRAPH_REPORT.md            - audit report
  graph.json                 - raw graph data
  .engram/.graphify_runtime.json     - runtime proof for this Codex run
```

Then paste only these sections from `GRAPH_REPORT.md`:
- God Nodes
- Surprising Connections
- Suggested Questions

End with:

> "The runtime proof is in `.engram/.graphify_runtime.json` and should say `typescript`. Want me to trace one of the suggested questions?"

## For --update

Use this when files changed since the last run.

First detect only the changed files:

```bash
$(cat .engram/.graphify_node) "$(cat .engram/.graphify_runtime_script)" detect-incremental \
  "INPUT_PATH" \
  --manifest .engram/manifest.json \
  --out .engram/.graphify_incremental.json
```

If `new_total == 0`, stop with `No files changed since last run. Nothing to update.`

Then determine whether all changed files are code files:

```bash
node -e "
  const fs = require('fs');
  const data = JSON.parse(fs.readFileSync('.engram/.graphify_incremental.json', 'utf8'));
  const codeExts = new Set(['.py','.ts','.tsx','.js','.jsx','.go','.rs','.java','.cpp','.cc','.cxx','.c','.h','.hpp','.rb','.swift','.kt','.kts','.cs','.scala','.php','.lua','.zig','.ps1','.ex','.exs','.m','.mm','.jl']);
  const changed = Object.values(data.new_files || {}).flat();
  const codeOnly = changed.length > 0 && changed.every((file) => codeExts.has(require('path').extname(file).toLowerCase()));
  console.log(codeOnly ? 'true' : 'false');
"
```

If code-only:
- print `[engram update] Code-only changes detected - skipping semantic extraction`
- run `extract-ast` with `--incremental`
- write an empty semantic extraction JSON:

```bash
cat > .engram/.graphify_semantic.json <<'EOF'
{"nodes":[],"edges":[],"hyperedges":[],"input_tokens":0,"output_tokens":0}
EOF
```

If not code-only:
- run the full Step 3 flow again, but use [.engram/.graphify_incremental.json](.engram/.graphify_incremental.json) as the detection file
- always prepare the semantic detection file first. It is a safe no-op if `new_files.video` and `new_files.paper` are empty:

```bash
GRAPHIFY_WHISPER_FLAG=""
if the original invocation included --whisper-model <name>, set GRAPHIFY_WHISPER_FLAG="--whisper-model <name>"
GRAPHIFY_PDF_OCR_FLAG=""
if the original invocation included --pdf-ocr <mode>, set GRAPHIFY_PDF_OCR_FLAG="--pdf-ocr <mode>"

$(cat .engram/.graphify_node) "$(cat .engram/.graphify_runtime_script)" prepare-semantic-detect \
  $GRAPHIFY_WHISPER_FLAG \
  $GRAPHIFY_PDF_OCR_FLAG \
  --detect .engram/.graphify_incremental.json \
  --out .engram/.graphify_incremental_semantic.json \
  --transcripts-out .engram/.graphify_transcripts.json \
  --pdf-out .engram/.graphify_pdf_ocr.json \
  --analysis .engram/.graphify_analysis.json \
  --incremental
```

- in update mode, wherever Step 3 normally references [.engram/.graphify_detect_semantic.json](.engram/.graphify_detect_semantic.json), use [.engram/.graphify_incremental_semantic.json](.engram/.graphify_incremental_semantic.json) instead
- for AST, call `extract-ast --incremental`
- for semantic cache, call `check-semantic-cache --incremental` against [.engram/.graphify_incremental_semantic.json](.engram/.graphify_incremental_semantic.json)

Before merging, keep a copy of the old graph:

```bash
cp .engram/graph.json .engram/.graphify_old.json
```

Then finalize the update in one command:

```bash
$(cat .engram/.graphify_node) "$(cat .engram/.graphify_runtime_script)" finalize-update \
  $GRAPHIFY_DIRECTED_FLAG \
  --detect .engram/.graphify_incremental.json \
  --ast .engram/.graphify_ast.json \
  --cached .engram/.graphify_cached.json \
  --semantic-new .engram/.graphify_semantic_new.json \
  --existing-graph .engram/.graphify_old.json \
  --root "INPUT_PATH" \
  --graph-out .engram/graph.json \
  --report-out .engram/GRAPH_REPORT.md \
  --analysis-out .engram/.graphify_analysis.json \
  --cost-out .engram/cost.json
```

Then run Steps 5-7 again. Clean up:

```bash
rm -f .engram/.graphify_old.json .engram/.graphify_incremental.json .engram/.graphify_incremental_semantic.json .engram/.graphify_transcripts.json .engram/.graphify_pdf_ocr.json
```

## For --cluster-only

Skip detection and extraction. Re-run clustering/reporting from the existing graph:

```bash
$(cat .engram/.graphify_node) "$(cat .engram/.graphify_runtime_script)" cluster-only \
  --graph .engram/graph.json \
  --root "INPUT_PATH" \
  --graph-out .engram/graph.json \
  --report-out .engram/GRAPH_REPORT.md \
  --analysis-out .engram/.graphify_analysis.json
```

Then run Steps 5-7 again.

## For $engram query

First check that [.engram/graph.json](.engram/graph.json) exists. If not, stop and tell the user to run `$engram <path>` first.

Use the public TypeScript CLI:

```bash
engram summary --graph .engram/graph.json
engram recommend-commits --files src/auth.ts,src/session.ts --graph .engram/graph.json
engram review-analysis --files src/auth.ts --graph .engram/graph.json
engram review-eval --cases .engram/review-cases.json --graph .engram/graph.json
engram query "QUESTION" --graph .engram/graph.json
engram query "QUESTION" --dfs --graph .engram/graph.json
engram query "QUESTION" --budget 1500 --graph .engram/graph.json
```

Use the summary as the first-hop orientation. It is intentionally compact and deterministic: graph size, density, top hubs, key communities, and the next graph action. Then run the specific query/path/explain command needed for the user's question.

Answer using only what the graph traversal shows. If the graph lacks the answer, say so.

After answering, save the Q&A back into the graph memory:

```bash
$(cat .engram/.graphify_node) "$(cat .engram/.graphify_runtime_script)" save-query-result \
  --question "QUESTION" \
  --answer "ANSWER" \
  --memory-dir .engram/memory \
  --query-type query \
  --source-nodes-json '["NODE_A","NODE_B"]'
```

## For $engram path

```bash
$(cat .engram/.graphify_node) "$(cat .engram/.graphify_runtime_script)" path \
  --graph .engram/graph.json \
  "NODE_A" \
  "NODE_B"
```

Explain the path in plain language, then save it with `save-query-result`.

## For $engram explain

```bash
$(cat .engram/.graphify_node) "$(cat .engram/.graphify_runtime_script)" explain \
  --graph .engram/graph.json \
  "NODE_NAME"
```

Write a 3-5 sentence explanation, then save it with `save-query-result`.

## For $engram add

```bash
$(cat .engram/.graphify_node) "$(cat .engram/.graphify_runtime_script)" ingest \
  "URL" \
  --target-dir ./raw \
  --author "AUTHOR" \
  --contributor "CONTRIBUTOR"
```

After a successful save, immediately run `$engram ./raw --update`.

## For --watch

Use the public TypeScript watcher:

```bash
engram watch "INPUT_PATH" --debounce 3
```

Behavior:
- code-only changes: rebuild immediately, no LLM needed
- docs, papers, images: the watcher marks that a semantic refresh is needed, then you should run `$engram --update`

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

## Lifecycle State

- Runtime state lives under `.engram/`; do not create legacy visible state directories.
- If `.engram/graph.json` is missing but legacy `graphify-out/graph.json` exists, run `engram migrate-state --dry-run` first. If it reports tracked legacy artifacts, ask before using the recommended `git mv -f graphify-out .engram` and commit message; do not auto-stage or auto-commit.
- For architecture or codebase questions, when `.engram/graph.json` exists, first run `engram query "<question>"` (or `engram path "<A>" "<B>"` / `engram explain "<concept>"`); these return a scoped subgraph, usually much smaller than `GRAPH_REPORT.md` or raw grep output.
- Use `.engram/wiki/index.md` first when present; read `.engram/GRAPH_REPORT.md` only for broad architecture review or when `query` / `path` / `explain` do not surface enough context.
- If `.engram/needs_update` exists or `.engram/branch.json` has `"stale": true`, tell the user the graph is stale and run the platform Engram command with `--update` before relying on semantic results.
- Before proposing or committing `.engram` artifacts, run `engram portable-check .engram`; commit-safe graph artifacts must use repo-relative paths, and never commit `.engram/branch.json`, `.engram/worktree.json`, `.engram/needs_update`, or `.engram/cache/`. If a repo already tracks any of them, first add them to `.gitignore`, then propose `git rm --cached .engram/branch.json .engram/worktree.json .engram/needs_update` and `git rm -r --cached .engram/cache`; never mutate git state without asking.
- An existing `.graphify/` state dir is still read as a legacy fallback; new writes go to `.engram/`.
- Git hooks may mark stale state after branch switches, merges, and rewrites. Never delete `.engram/` automatically; use `engram state prune` only as a non-destructive cleanup preview.

Commit recommendation workflow: `engram recommend-commits` is advisory-only. It may suggest groups and commit messages, but the user remains the actor; do not auto-stage, auto-commit, or mutate branches.

CRG review workflow: `$engram minimal-context` is the first review call. Keep graph review context within `<=5 graph tool calls` and `<=800` graph-context tokens. If `.engram/needs_update` exists or `.engram/branch.json` has `stale=true`, warn and update before trusting semantic review output. Then follow only the compact route: `engram detect-changes` for risk, `engram affected-flows` for flow impact, and `engram review-context` for snippets or radius detail. If `.engram/flows.json` is missing and flows are needed, run `engram flows build` first. Explicit `--files`, `--base`, `--head`, or `--staged` inputs override unrelated dirty worktree noise; mention dirty worktrees as a warning and never mutate git state.

Review analysis workflow: `engram review-analysis` adds blast radius, bridge nodes, test-gap hints, impacted communities, and multimodal/doc safety. `engram review-eval` is the deterministic evaluation harness for token savings, impacted-file recall, review summary precision, and multimodal regression safety.

## Scrap annotation in assistant mode

Assistant transport records harness annotations without a browser seat.
Two roles. The orchestrator is the long-lived session: it runs engram
commands, stamps times, writes `answers.jsonl` and runs `scrap import`;
it never annotates. The annotator is one fresh context per packet attempt:
it receives only a message text and returns only the JSON answer text.

Surfaces in this version form a closed list: `claude-code`, `codex`, `agy`.
Mapping: `claude-code` installs from `skill.md` (`skill-windows.md` on
Windows); `codex` installs from `skill-codex.md` to
`.agents/skills/engram/SKILL.md`; `agy` installs from `skill.md`
(`skill-windows.md` on Windows). `muse` is absent: no platform, skill file
or install destination exists, so a `muse` line is an unknown surface and
refuses. A harness outside the list stops and reports instead of declaring
another surface; import refuses an unknown surface and a false declaration
would be recorded as declared.

`fresh_context` must be `true`. It declares that the annotator context
received no packet-relevant information except this attempt's `scrap prompt`
message: no other packet's prompt or answer, no other annotator's run,
answer file or converge output, no gold or golden file, and not its own
attempt-1 context when answering an attempt-2 repair message. Between
receiving the message and emitting the answer it made no tool call and read
nothing: no file (including capture snapshots, `state.jsonl`, the mission
file, any `results.ndjson` or `answers.jsonl`, graph files under
`.engram/` or `.graphify/`, or git history), no web or memory lookup, no
MCP call. Harness boilerplate every context carries (system prompt, tool
definitions, the engram skill text itself, project instruction files) does
not breach the declaration; acting on any of it to fetch packet-relevant
content does. Same role as `temporary_chat` for browser: declared, not
verifiable, and recorded as declared.

Loop. For each packet id, in order:

- a. Orchestrator: run `engram scrap prompt --capture <capture-dir>`
  `--mission <m> --id <id> --json`. Take `message`, `prompt_sha256` and
  `snapshot_sha256` from that one JSON line. Never derive either hash from
  `state.jsonl`, from snapshot files, or by hashing anything yourself.
- b. Orchestrator: record `started_at` (ISO 8601 UTC), hand `message` and
  nothing else packet-related to a fresh annotator context, collect its
  reply verbatim as `raw_response`, record `finished_at`. Do not trim,
  fence, or repair the reply. The message is handed over unchanged, byte
  for byte: never summarised, shortened, reflowed or re-encoded. In the
  process path the reply is captured to a file, and the answer line is
  built from that file and the `--json` line by a JSON encoder (for example
  `node -e`), which also stamps both timestamps; the reply is never
  re-typed.
- c. Orchestrator: append one `answers.jsonl` line with exactly the eleven
  assistant keys `id`, `attempt`, `snapshot_sha256`, `prompt_sha256`,
  `model_declared`, `effort_declared`, `transport`, `assistant`,
  `started_at`, `finished_at`, `raw_response` plus an optional `receipt` (`attempt: 1`; the hashes from
  step a; `transport: "assistant"`;
  `assistant: { surface, fresh_context: true }`; the declared model and
  effort; the two timestamps from step b).
- d. After the packet batch (or per packet), orchestrator: run
  `engram scrap import --out <run-dir> --capture <capture-dir> --mission <m>`
  `--from <answers.jsonl> --model <surface>:<model_declared>-<effort_declared>`.
  Import exits 0 even when it records a failed row; read the row's `error`
  from `<run-dir>/results.ndjson` (orchestrator only, never show it to a
  later annotator).
- e. Repair, only when the attempt-1 row's `error` is `parse_error`:
  orchestrator runs `engram scrap prompt --capture <capture-dir>`
  `--mission <m> --id <id> --repair --from <answers.jsonl> --json`, repeats
  steps b to c in a new fresh annotator context with `attempt: 2` and the
  repair hashes, then re-runs step d. No other failure is repaired this way;
  a failed row is retried only as a new `attempt: 1` under `--retry-failed`,
  exactly as for browser.

Receipt (optional, orchestrator only). Where the annotator was a process of a CLI that writes per-invocation JSON (for example `claude -p --output-format json`), the encoder that builds the answer line may distil a `receipt` from that same invocation's output: `served_models` (the reported model ids), `usage` (only `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`), `cost_usd`, and `source` (the short command form). Distil, never paste the CLI object — any other key refuses the import. Never attach the orchestrator session's own usage, never estimate or re-type figures, and omit `receipt` entirely where the annotator (sub-agent, new session) produced no such output. A receipt is declared, not verified; annotators never write their own.

The fresh annotator context may be a sub-agent, a new session, or a new
process of the same CLI. A process annotator starts from an empty working
directory, with tool use disabled where the CLI offers it. Where the CLI
reads a prompt from a stream, the orchestrator writes the annotator rules
into the stream first and the unchanged `scrap prompt` stdout after them
(for example `{ cat <rules-file>; engram scrap prompt …; } | <cli>`), or
passes the rules through the CLI's system-prompt option; the message bytes
are never edited, and hashes still come only from the `--json` line
(step a). Re-typing the message and the reply is permitted where a process
cannot be fed. `prompt_sha256` covers the message
that `scrap prompt` printed and import recomputes it from the capture;
neither shows what the annotator context received, nor that `raw_response`
is the reply as given. Both hand-over copies are unverified under re-typing.

Annotator rules: answer with only the JSON the message asks for (no prose,
no tools, no file, web or memory access, no questions back); never read any
run dir or answer file (the current run's included), converge output, gold
file, the capture dir or the mission file; never annotate a second packet
or a repair in a context
that already answered; never self-repair output the orchestrator reports as
unparseable: repair happens only through a fresh context answering
`scrap prompt --repair` as `attempt: 2`. If the harness cannot start a
context meeting the `fresh_context` definition, the orchestrator stops and
reports it instead of annotating in a contaminated context.

The orchestrator gives the annotator rules to each annotator context as
framing around the message. They are skill text, not packet-relevant, and
the only thing the orchestrator adds. While a run is in progress, the
orchestrator reads no gold file, no converge output, and no other
annotator's run or answer file. `model_declared` and `effort_declared`
are those of the annotator context, which the orchestrator sets or reads when
it starts that context. `started_at` and `finished_at` are stamped by the
orchestrator around the annotator call, never self-reported by the annotator.
`effort_declared` takes `low`, `medium`, `high`, `xhigh` or `max`.

Answer lines: one transport per file and per run dir; a mixed file refuses
the whole import before anything is written. `--model` must match
`^(claude-code|codex|agy):[a-z0-9][a-z0-9.-]*-(low|medium|high|xhigh|max)$`,
its prefix must equal `assistant.surface` and its tail must equal
`<model_declared>-<effort_declared>` on every line. A new run dir takes the
transport of its first import. Converge needs `--allow-transport assistant`
to read an assistant run. Engram itself spawns nothing, opens no network and
uses no credential in this flow.

Before starting a run, confirm the installed skill contains
`Scrap annotation in assistant mode` (re-run `engram install <platform>`
(`claude`, `windows`, `codex`, `antigravity` or `antigravity-windows`; add
`--project` for a project-scoped install) after upgrading).
