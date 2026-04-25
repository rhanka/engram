---
name: graphify
description: any input (code, docs, papers, images) -> knowledge graph -> clustered communities -> HTML + JSON + audit report
trigger: $graphify
---

# $graphify

Turn any folder of files into a navigable knowledge graph with community detection, an honest audit trail, and three outputs: interactive HTML, GraphRAG-ready JSON, and a plain-language `GRAPH_REPORT.md`.

This Codex skill is **TypeScript-backed**. Before calling the run successful, confirm [.graphify/.graphify_runtime.json](.graphify/.graphify_runtime.json) exists and contains `"runtime": "typescript"`.

## Usage

```bash
$graphify                                             # full pipeline on current directory
$graphify <path>                                      # full pipeline on specific path
$graphify https://github.com/<owner>/<repo>           # clone repo locally, then run the full pipeline
$graphify https://github.com/<owner>/<repo> --branch <branch>  # clone a specific branch before graphing
$graphify <path> --scope auto                         # safe default for code/review repos
$graphify <path> --scope tracked                      # include newly staged files too
$graphify <path> --all                                # full recursive folder walk for knowledge bases
$graphify <path> --directed                           # build directed graph (preserves source->target)
$graphify <path> --mode deep                          # richer INFERRED edges during semantic extraction
$graphify <path> --pdf-ocr auto                       # preflight PDFs; OCR scanned/low-text PDFs with mistral-ocr when needed
$graphify <path> --whisper-model medium               # use a larger Whisper model for local transcription
$graphify <path> --update                             # incremental - re-extract only new/changed files
$graphify <path> --cluster-only                       # re-run clustering/report on existing graph
$graphify <path> --no-viz                             # skip HTML generation
$graphify <path> --svg                                # also export graph.svg
$graphify <path> --graphml                            # also export graph.graphml
$graphify <path> --neo4j                              # export .graphify/cypher.txt
$graphify <path> --neo4j-push bolt://localhost:7687   # push directly to Neo4j
$graphify <path> --mcp                                # start MCP stdio server for agent access
$graphify <path> --watch                              # watch folder, auto-rebuild on code changes
$graphify add <url>                                   # fetch URL, save to ./raw, update graph
$graphify add <url> --author "Name"                   # tag who wrote it
$graphify add <url> --contributor "Name"              # tag who added it
$graphify migrate-state --dry-run                    # plan graphify-out -> .graphify migration
$graphify query "<question>"                          # BFS traversal - broad context
$graphify query "<question>" --dfs                    # DFS - trace one chain
$graphify query "<question>" --budget 1500            # cap answer at N tokens
$graphify summary --graph .graphify/graph.json        # compact first-hop orientation before deep traversal
$graphify minimal-context --task "review PR" --graph .graphify/graph.json  # first review call
$graphify review-delta --files src/auth.ts --graph .graphify/graph.json  # review impact for changed files
$graphify review-analysis --files src/auth.ts --graph .graphify/graph.json  # blast radius + review views
$graphify recommend-commits --files src/auth.ts,src/session.ts --graph .graphify/graph.json  # advisory commit grouping
$graphify scope inspect <path> --scope auto           # inspect the resolved file inventory first
$graphify path "AuthModule" "Database"                # shortest path between concepts
$graphify explain "SwinTransformer"                   # explain one node and its neighbors
```

## Input scope policy

- Default to `--scope auto` for codebase and review work. In Git repos this resolves to committed files plus `.graphify/memory/*`.
- Use `--scope tracked` when newly staged files must be included before commit.
- Use `--all` only when the user clearly wants a knowledge-base crawl across docs, notes, papers, screenshots, audio, or video.
- If the repo is dirty or the right scope is unclear, run `graphify scope inspect <path> --scope auto` first and summarize the included and excluded counts.

In Codex, prefer `$graphify ...` as the explicit invocation. Do not rely on `/graphify ...`, which is Claude syntax. `$graphify` is a Codex skill trigger, not a Bash command like `graphify .`.

Install flow for Codex:

```bash
npm install -g graphifyy
graphify install --platform codex
graphify codex install
```

## What You Must Do When Invoked

If no path was given, use `.`. Do not ask the user for a path.

If the path argument starts with `https://github.com/` or `http://github.com/`, treat it as a GitHub URL and run Step 0 before anything else. Use the resolved local clone path for all later steps.

Follow these steps in order. Do not skip the runtime proof step.

### Step 0 - Clone GitHub repos when the input is a GitHub URL

```bash
GRAPHIFY_BRANCH_FLAG=""
if the original invocation included --branch <name>, set GRAPHIFY_BRANCH_FLAG="--branch <name>"

LOCAL_PATH=$(graphify clone "INPUT_GITHUB_URL" $GRAPHIFY_BRANCH_FLAG)
```

Replace `INPUT_PATH` with `LOCAL_PATH` for all subsequent commands.

### Step 1 - Resolve the installed TypeScript runtime

```bash
GRAPHIFY_BIN=$(command -v graphify 2>/dev/null || true)
NODE_BIN=$(command -v node 2>/dev/null || true)

if [ -z "$GRAPHIFY_BIN" ]; then
  echo "ERROR: graphify is not installed. Install the TypeScript package first."
  echo "Run: npm install -g graphifyy"
  exit 1
fi

if [ -z "$NODE_BIN" ]; then
  echo "ERROR: node is not available in PATH."
  exit 1
fi

GRAPHIFY_CLI=$("$NODE_BIN" -e "const fs=require('fs'); console.log(fs.realpathSync(process.argv[1]));" "$GRAPHIFY_BIN")
GRAPHIFY_DIST_DIR=$("$NODE_BIN" -e "const path=require('path'); console.log(path.dirname(process.argv[1]));" "$GRAPHIFY_CLI")
GRAPHIFY_RUNTIME="$GRAPHIFY_DIST_DIR/skill-runtime.js"

mkdir -p .graphify
printf '%s' "$NODE_BIN" > .graphify/.graphify_node
printf '%s' "$GRAPHIFY_RUNTIME" > .graphify/.graphify_runtime_script
"$NODE_BIN" "$GRAPHIFY_RUNTIME" runtime-info > .graphify/.graphify_runtime.json

"$NODE_BIN" -e "
  const fs = require('fs');
  const runtime = JSON.parse(fs.readFileSync('.graphify/.graphify_runtime.json', 'utf8'));
  if (runtime.runtime !== 'typescript') {
    console.error('ERROR: expected TypeScript runtime, got', runtime.runtime);
    process.exit(1);
  }
"
```

If this step fails, stop and tell the user exactly why. Do not continue with a Python fallback.

**In every subsequent bash block, use:**

```bash
$(cat .graphify/.graphify_node) "$(cat .graphify/.graphify_runtime_script)" ...
```

That keeps the run pinned to the resolved TypeScript runtime.

### Step 2 - Detect files

```bash
GRAPHIFY_SCOPE_FLAG="--scope auto"
if the original invocation included --all, set GRAPHIFY_SCOPE_FLAG="--all"
if the original invocation included --scope <mode>, set GRAPHIFY_SCOPE_FLAG="--scope <mode>"

$(cat .graphify/.graphify_node) "$(cat .graphify/.graphify_runtime_script)" detect "INPUT_PATH" $GRAPHIFY_SCOPE_FLAG --out .graphify/.graphify_detect.json
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

$(cat .graphify/.graphify_node) "$(cat .graphify/.graphify_runtime_script)" prepare-semantic-detect \
  $GRAPHIFY_WHISPER_FLAG \
  $GRAPHIFY_PDF_OCR_FLAG \
  --detect .graphify/.graphify_detect.json \
  --out .graphify/.graphify_detect_semantic.json \
  --transcripts-out .graphify/.graphify_transcripts.json \
  --pdf-out .graphify/.graphify_pdf_ocr.json \
  --analysis .graphify/.graphify_analysis.json
```

After this step:
- use [.graphify/.graphify_detect_semantic.json](.graphify/.graphify_detect_semantic.json) for semantic cache and semantic extraction
- keep using [.graphify/.graphify_detect.json](.graphify/.graphify_detect.json) for manifest, cost, and final reporting
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
$(cat .graphify/.graphify_node) "$(cat .graphify/.graphify_runtime_script)" extract-ast \
  --detect .graphify/.graphify_detect.json \
  --out .graphify/.graphify_ast.json
```

#### Part B - Semantic extraction with Codex

If there are zero docs, papers, images, generated transcripts, and PDF sidecars, skip Part B entirely and go straight to Part C.

Use this rule:
- If the uncached non-code set fits in a single chunk of 20 files or fewer, stay in the main Codex thread and extract it directly.
- If it needs multiple chunks, use Codex subagents for parallel extraction.

##### Step B0 - Check semantic extraction cache first

```bash
$(cat .graphify/.graphify_node) "$(cat .graphify/.graphify_runtime_script)" check-semantic-cache \
  --detect .graphify/.graphify_detect_semantic.json \
  --root . \
  --cached-out .graphify/.graphify_cached.json \
  --uncached-out .graphify/.graphify_uncached.txt
```

Only extract files listed in [.graphify/.graphify_uncached.txt](.graphify/.graphify_uncached.txt). If that file is empty, skip straight to Part C.

##### Step B1 - Split uncached files into chunks

Load the file list from [.graphify/.graphify_uncached.txt](.graphify/.graphify_uncached.txt). Split into chunks of 20-25 files each. Put each image in its own chunk. PDF sidecar Markdown can reference extracted image artifacts under `.graphify/converted/pdf/*_images/`; when those images contain diagrams, tables, captions, or embedded text that carry meaning, include them as image chunks or describe the delegated OCR/vision output with provenance back to the source PDF. Keep files from the same directory together when possible.

##### Step B2 - Choose local extraction vs subagents

If there is exactly one chunk and it contains 20 files or fewer:
- stay in the main Codex thread
- read those files directly
- produce [.graphify/.graphify_semantic_new.json](.graphify/.graphify_semantic_new.json) yourself, using the exact schema below

If there are multiple chunks:
- use `spawn_agent` once per chunk
- dispatch them all in the same response so they run in parallel
- collect each result, validate JSON, and write the merged result to [.graphify/.graphify_semantic_new.json](.graphify/.graphify_semantic_new.json)

Use this extraction prompt, whether you apply it locally or inside subagents:

```text
You are a graphify extraction subagent. Read the files listed and extract a knowledge graph fragment.
Output ONLY valid JSON matching the schema below - no explanation, no markdown fences, no preamble.

Files (chunk CHUNK_NUM of TOTAL_CHUNKS):
FILE_LIST

Rules:
- EXTRACTED: relationship explicit in source
- INFERRED: reasonable inference
- AMBIGUOUS: uncertain - flag it, do not omit it
- Node IDs must stay stable across chunks and reruns. Base them on the entity label or file-relative identity only. Never append chunk counters like `_c1`, `_c2`, `_chunk3`, or similar suffixes.

Code files: focus on semantic edges AST cannot find. Do not re-extract imports.
Doc/paper files: extract named concepts, entities, citations, and rationale.
Image files: use vision to understand what the image is, not just OCR. For images extracted from PDFs, decode figures, tables, diagrams, captions, and embedded text when they carry meaning; use Codex vision by default, or a delegated OCR/vision model when configured, and keep provenance to the source PDF and sidecar.

DEEP_MODE=true means: be aggressive with INFERRED edges, but mark uncertain ones AMBIGUOUS.

Semantic similarity: add semantically_similar_to only when the connection is genuinely non-obvious.
Hyperedges: add sparingly, only when a group relationship carries meaning beyond pairwise edges.

If a file has YAML frontmatter, copy source_url, captured_at, author, contributor onto every node from that file.

Output exactly:
{"nodes":[{"id":"filestem_entityname","label":"Human Readable Name","file_type":"code|document|paper|image","source_file":"relative/path","source_location":null,"source_url":null,"captured_at":null,"author":null,"contributor":null}],"edges":[{"source":"node_id","target":"node_id","relation":"calls|implements|references|cites|conceptually_related_to|shares_data_with|semantically_similar_to|rationale_for","confidence":"EXTRACTED|INFERRED|AMBIGUOUS","confidence_score":1.0,"source_file":"relative/path","source_location":null,"weight":1.0}],"hyperedges":[{"id":"snake_case_id","label":"Human Readable Label","nodes":["node_id1","node_id2","node_id3"],"relation":"participate_in|implement|form","confidence":"EXTRACTED|INFERRED","confidence_score":0.75,"source_file":"relative/path"}],"input_tokens":0,"output_tokens":0}
```

##### Step B3 - Finalize the build

If you used subagents, wait for all of them, parse each result as JSON, skip failed chunks with a warning, and merge the successful chunks into [.graphify/.graphify_semantic_new.json](.graphify/.graphify_semantic_new.json). If more than half the chunks fail, stop.

If you extracted locally, write your final JSON directly to [.graphify/.graphify_semantic_new.json](.graphify/.graphify_semantic_new.json).

Then run one finalization command. It will:
- save fresh semantic results into the cache
- merge cached + fresh semantic extraction
- merge AST + semantic extraction
- build the graph
- generate `graph.json`, `GRAPH_REPORT.md`, `manifest.json`, `cost.json`
- optionally write `graph.html` if you pass `--html-out`

```bash
$(cat .graphify/.graphify_node) "$(cat .graphify/.graphify_runtime_script)" finalize-build \
  $GRAPHIFY_DIRECTED_FLAG \
  --detect .graphify/.graphify_detect.json \
  --ast .graphify/.graphify_ast.json \
  --cached .graphify/.graphify_cached.json \
  --semantic-new .graphify/.graphify_semantic_new.json \
  --root "INPUT_PATH" \
  --graph-out .graphify/graph.json \
  --report-out .graphify/GRAPH_REPORT.md \
  --analysis-out .graphify/.graphify_analysis.json \
  --cost-out .graphify/cost.json \
  --html-out .graphify/graph.html
```

If this step fails because the graph is empty, stop and tell the user exactly that.

### Step 5 - Label communities

Read [.graphify/.graphify_analysis.json](.graphify/.graphify_analysis.json). For each community key, choose a 2-5 word plain-language name.

Write those labels to [.graphify/.graphify_labels.json](.graphify/.graphify_labels.json), then regenerate the labeled artifacts:

```bash
$(cat .graphify/.graphify_node) "$(cat .graphify/.graphify_runtime_script)" write-labeled-report \
  $GRAPHIFY_DIRECTED_FLAG \
  --extract .graphify/.graphify_extract.json \
  --detect .graphify/.graphify_detect.json \
  --analysis .graphify/.graphify_analysis.json \
  --labels .graphify/.graphify_labels.json \
  --root "INPUT_PATH" \
  --report-out .graphify/GRAPH_REPORT.md \
  --graph-out .graphify/graph.json \
  --html-out .graphify/graph.html
```

### Step 6 - Export extras

If `--no-viz` was given, skip HTML generation during finalization and omit `--html-out` from Step 5.

If you intentionally skipped `--html-out` in finalization and still want HTML afterwards, run:

```bash
$(cat .graphify/.graphify_node) "$(cat .graphify/.graphify_runtime_script)" export-html \
  $GRAPHIFY_DIRECTED_FLAG \
  --extract .graphify/.graphify_extract.json \
  --analysis .graphify/.graphify_analysis.json \
  --labels .graphify/.graphify_labels.json \
  --out .graphify/graph.html
```

If `--svg` was requested:

```bash
$(cat .graphify/.graphify_node) "$(cat .graphify/.graphify_runtime_script)" export-svg \
  $GRAPHIFY_DIRECTED_FLAG \
  --extract .graphify/.graphify_extract.json \
  --analysis .graphify/.graphify_analysis.json \
  --labels .graphify/.graphify_labels.json \
  --out .graphify/graph.svg
```

If `--graphml` was requested:

```bash
$(cat .graphify/.graphify_node) "$(cat .graphify/.graphify_runtime_script)" export-graphml \
  $GRAPHIFY_DIRECTED_FLAG \
  --extract .graphify/.graphify_extract.json \
  --analysis .graphify/.graphify_analysis.json \
  --out .graphify/graph.graphml
```

If `--neo4j` was requested:

```bash
$(cat .graphify/.graphify_node) "$(cat .graphify/.graphify_runtime_script)" export-cypher \
  $GRAPHIFY_DIRECTED_FLAG \
  --extract .graphify/.graphify_extract.json \
  --out .graphify/cypher.txt
```

If `--neo4j-push <uri>` was requested, ask for credentials if needed, then run:

```bash
$(cat .graphify/.graphify_node) "$(cat .graphify/.graphify_runtime_script)" push-neo4j \
  $GRAPHIFY_DIRECTED_FLAG \
  --extract .graphify/.graphify_extract.json \
  --analysis .graphify/.graphify_analysis.json \
  --uri "NEO4J_URI" \
  --user "NEO4J_USER" \
  --password "NEO4J_PASSWORD"
```

If `--mcp` was requested, use the public TypeScript CLI:

```bash
graphify serve .graphify/graph.json
```

To register it in Codex:

```bash
codex mcp add graphify -- graphify serve /absolute/path/to/.graphify/graph.json
```

If `--watch` was requested, use the public TypeScript watcher:

```bash
graphify watch "INPUT_PATH" --debounce 3
```

### Step 7 - Benchmark, cost, cleanup, report

If `total_words > 5000`, run:

```bash
$(cat .graphify/.graphify_node) "$(cat .graphify/.graphify_runtime_script)" benchmark \
  --graph .graphify/graph.json \
  --corpus-words TOTAL_WORDS
```

Clean up temp files:

```bash
rm -f .graphify/.graphify_detect.json .graphify/.graphify_detect_semantic.json .graphify/.graphify_transcripts.json .graphify/.graphify_pdf_ocr.json .graphify/.graphify_ast.json .graphify/.graphify_cached.json .graphify/.graphify_uncached.txt .graphify/.graphify_semantic_new.json .graphify/.graphify_analysis.json .graphify/.graphify_labels.json
rm -f .graphify/needs_update 2>/dev/null || true
```

Tell the user:

```text
Graph complete. Outputs in PATH_TO_DIR/.graphify/

  graph.html                 - interactive graph
  GRAPH_REPORT.md            - audit report
  graph.json                 - raw graph data
  .graphify/.graphify_runtime.json     - runtime proof for this Codex run
```

Then paste only these sections from `GRAPH_REPORT.md`:
- God Nodes
- Surprising Connections
- Suggested Questions

End with:

> "The runtime proof is in `.graphify/.graphify_runtime.json` and should say `typescript`. Want me to trace one of the suggested questions?"

## For --update

Use this when files changed since the last run.

First detect only the changed files:

```bash
$(cat .graphify/.graphify_node) "$(cat .graphify/.graphify_runtime_script)" detect-incremental \
  "INPUT_PATH" \
  --manifest .graphify/manifest.json \
  --out .graphify/.graphify_incremental.json
```

If `new_total == 0`, stop with `No files changed since last run. Nothing to update.`

Then determine whether all changed files are code files:

```bash
node -e "
  const fs = require('fs');
  const data = JSON.parse(fs.readFileSync('.graphify/.graphify_incremental.json', 'utf8'));
  const codeExts = new Set(['.py','.ts','.tsx','.js','.jsx','.go','.rs','.java','.cpp','.cc','.cxx','.c','.h','.hpp','.rb','.swift','.kt','.kts','.cs','.scala','.php','.lua','.zig','.ps1','.ex','.exs','.m','.mm','.jl']);
  const changed = Object.values(data.new_files || {}).flat();
  const codeOnly = changed.length > 0 && changed.every((file) => codeExts.has(require('path').extname(file).toLowerCase()));
  console.log(codeOnly ? 'true' : 'false');
"
```

If code-only:
- print `[graphify update] Code-only changes detected - skipping semantic extraction`
- run `extract-ast` with `--incremental`
- write an empty semantic extraction JSON:

```bash
cat > .graphify/.graphify_semantic.json <<'EOF'
{"nodes":[],"edges":[],"hyperedges":[],"input_tokens":0,"output_tokens":0}
EOF
```

If not code-only:
- run the full Step 3 flow again, but use [.graphify/.graphify_incremental.json](.graphify/.graphify_incremental.json) as the detection file
- always prepare the semantic detection file first. It is a safe no-op if `new_files.video` and `new_files.paper` are empty:

```bash
GRAPHIFY_WHISPER_FLAG=""
if the original invocation included --whisper-model <name>, set GRAPHIFY_WHISPER_FLAG="--whisper-model <name>"
GRAPHIFY_PDF_OCR_FLAG=""
if the original invocation included --pdf-ocr <mode>, set GRAPHIFY_PDF_OCR_FLAG="--pdf-ocr <mode>"

$(cat .graphify/.graphify_node) "$(cat .graphify/.graphify_runtime_script)" prepare-semantic-detect \
  $GRAPHIFY_WHISPER_FLAG \
  $GRAPHIFY_PDF_OCR_FLAG \
  --detect .graphify/.graphify_incremental.json \
  --out .graphify/.graphify_incremental_semantic.json \
  --transcripts-out .graphify/.graphify_transcripts.json \
  --pdf-out .graphify/.graphify_pdf_ocr.json \
  --analysis .graphify/.graphify_analysis.json \
  --incremental
```

- in update mode, wherever Step 3 normally references [.graphify/.graphify_detect_semantic.json](.graphify/.graphify_detect_semantic.json), use [.graphify/.graphify_incremental_semantic.json](.graphify/.graphify_incremental_semantic.json) instead
- for AST, call `extract-ast --incremental`
- for semantic cache, call `check-semantic-cache --incremental` against [.graphify/.graphify_incremental_semantic.json](.graphify/.graphify_incremental_semantic.json)

Before merging, keep a copy of the old graph:

```bash
cp .graphify/graph.json .graphify/.graphify_old.json
```

Then finalize the update in one command:

```bash
$(cat .graphify/.graphify_node) "$(cat .graphify/.graphify_runtime_script)" finalize-update \
  $GRAPHIFY_DIRECTED_FLAG \
  --detect .graphify/.graphify_incremental.json \
  --ast .graphify/.graphify_ast.json \
  --cached .graphify/.graphify_cached.json \
  --semantic-new .graphify/.graphify_semantic_new.json \
  --existing-graph .graphify/.graphify_old.json \
  --root "INPUT_PATH" \
  --graph-out .graphify/graph.json \
  --report-out .graphify/GRAPH_REPORT.md \
  --analysis-out .graphify/.graphify_analysis.json \
  --cost-out .graphify/cost.json \
  --html-out .graphify/graph.html
```

Then run Steps 5-7 again. Clean up:

```bash
rm -f .graphify/.graphify_old.json .graphify/.graphify_incremental.json .graphify/.graphify_incremental_semantic.json .graphify/.graphify_transcripts.json .graphify/.graphify_pdf_ocr.json
```

## For --cluster-only

Skip detection and extraction. Re-run clustering/reporting from the existing graph:

```bash
$(cat .graphify/.graphify_node) "$(cat .graphify/.graphify_runtime_script)" cluster-only \
  --graph .graphify/graph.json \
  --root "INPUT_PATH" \
  --graph-out .graphify/graph.json \
  --report-out .graphify/GRAPH_REPORT.md \
  --analysis-out .graphify/.graphify_analysis.json
```

Then run Steps 5-7 again.

## For $graphify query

First check that [.graphify/graph.json](.graphify/graph.json) exists. If not, stop and tell the user to run `$graphify <path>` first.

Use the public TypeScript CLI:

```bash
graphify summary --graph .graphify/graph.json
graphify recommend-commits --files src/auth.ts,src/session.ts --graph .graphify/graph.json
graphify review-analysis --files src/auth.ts --graph .graphify/graph.json
graphify review-eval --cases .graphify/review-cases.json --graph .graphify/graph.json
graphify query "QUESTION" --graph .graphify/graph.json
graphify query "QUESTION" --dfs --graph .graphify/graph.json
graphify query "QUESTION" --budget 1500 --graph .graphify/graph.json
```

Use the summary as the first-hop orientation. It is intentionally compact and deterministic: graph size, density, top hubs, key communities, and the next graph action. Then run the specific query/path/explain command needed for the user's question.

Answer using only what the graph traversal shows. If the graph lacks the answer, say so.

After answering, save the Q&A back into the graph memory:

```bash
$(cat .graphify/.graphify_node) "$(cat .graphify/.graphify_runtime_script)" save-query-result \
  --question "QUESTION" \
  --answer "ANSWER" \
  --memory-dir .graphify/memory \
  --query-type query \
  --source-nodes-json '["NODE_A","NODE_B"]'
```

## For $graphify path

```bash
$(cat .graphify/.graphify_node) "$(cat .graphify/.graphify_runtime_script)" path \
  --graph .graphify/graph.json \
  "NODE_A" \
  "NODE_B"
```

Explain the path in plain language, then save it with `save-query-result`.

## For $graphify explain

```bash
$(cat .graphify/.graphify_node) "$(cat .graphify/.graphify_runtime_script)" explain \
  --graph .graphify/graph.json \
  "NODE_NAME"
```

Write a 3-5 sentence explanation, then save it with `save-query-result`.

## For $graphify add

```bash
$(cat .graphify/.graphify_node) "$(cat .graphify/.graphify_runtime_script)" ingest \
  "URL" \
  --target-dir ./raw \
  --author "AUTHOR" \
  --contributor "CONTRIBUTOR"
```

After a successful save, immediately run `$graphify ./raw --update`.

## For --watch

Use the public TypeScript watcher:

```bash
graphify watch "INPUT_PATH" --debounce 3
```

Behavior:
- code-only changes: rebuild immediately, no LLM needed
- docs, papers, images: the watcher marks that a semantic refresh is needed, then you should run `$graphify --update`

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

## Lifecycle State

- Runtime state lives under `.graphify/`; do not create legacy visible state directories.
- If `.graphify/graph.json` is missing but legacy `graphify-out/graph.json` exists, run `graphify migrate-state --dry-run` first. If it reports tracked legacy artifacts, ask before using the recommended `git mv -f graphify-out .graphify` and commit message; do not auto-stage or auto-commit.
- Use `.graphify/wiki/index.md` first when present, then `.graphify/GRAPH_REPORT.md`, before searching raw files.
- If `.graphify/needs_update` exists or `.graphify/branch.json` has `"stale": true`, tell the user the graph is stale and run the platform graphify command with `--update` before relying on semantic results.
- Before proposing or committing `.graphify` artifacts, run `graphify portable-check .graphify`; commit-safe graph artifacts must use repo-relative paths, and never commit .graphify/branch.json, never commit .graphify/worktree.json, or `.graphify/needs_update`.
- Git hooks may mark stale state after branch switches, merges, and rewrites. Never delete `.graphify/` automatically; use `graphify state prune` only as a non-destructive cleanup preview.

Commit recommendation workflow: `graphify recommend-commits` is advisory-only. It may suggest groups and commit messages, but the user remains the actor; do not auto-stage, auto-commit, or mutate branches.

CRG review workflow: `$graphify minimal-context` is the first review call. Keep graph review context within `<=5 graph tool calls` and `<=800` graph-context tokens. If `.graphify/needs_update` exists or `.graphify/branch.json` has `stale=true`, warn and update before trusting semantic review output. Then follow only the compact route: `graphify detect-changes` for risk, `graphify affected-flows` for flow impact, and `graphify review-context` for snippets or radius detail. If `.graphify/flows.json` is missing and flows are needed, run `graphify flows build` first. Explicit `--files`, `--base`, `--head`, or `--staged` inputs override unrelated dirty worktree noise; mention dirty worktrees as a warning and never mutate git state.

Review analysis workflow: `graphify review-analysis` adds blast radius, bridge nodes, test-gap hints, impacted communities, and multimodal/doc safety. `graphify review-eval` is the deterministic evaluation harness for token savings, impacted-file recall, review summary precision, and multimodal regression safety.
