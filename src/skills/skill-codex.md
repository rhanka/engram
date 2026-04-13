---
name: graphify
description: any input (code, docs, papers, images) -> knowledge graph -> clustered communities -> HTML + JSON + audit report
trigger: $graphify
---

# $graphify

Turn any folder of files into a navigable knowledge graph with community detection, an honest audit trail, and three outputs: interactive HTML, GraphRAG-ready JSON, and a plain-language `GRAPH_REPORT.md`.

This Codex skill is **TypeScript-backed**. Before calling the run successful, confirm [graphify-out/.graphify_runtime.json](graphify-out/.graphify_runtime.json) exists and contains `"runtime": "typescript"`.

## Usage

```bash
$graphify                                             # full pipeline on current directory
$graphify <path>                                      # full pipeline on specific path
$graphify <path> --directed                           # build directed graph (preserves source->target)
$graphify <path> --mode deep                          # richer INFERRED edges during semantic extraction
$graphify <path> --whisper-model medium               # use a larger Whisper model for local transcription
$graphify <path> --update                             # incremental - re-extract only new/changed files
$graphify <path> --cluster-only                       # re-run clustering/report on existing graph
$graphify <path> --no-viz                             # skip HTML generation
$graphify <path> --svg                                # also export graph.svg
$graphify <path> --graphml                            # also export graph.graphml
$graphify <path> --neo4j                              # export graphify-out/cypher.txt
$graphify <path> --neo4j-push bolt://localhost:7687   # push directly to Neo4j
$graphify <path> --mcp                                # start MCP stdio server for agent access
$graphify <path> --watch                              # watch folder, auto-rebuild on code changes
$graphify add <url>                                   # fetch URL, save to ./raw, update graph
$graphify add <url> --author "Name"                   # tag who wrote it
$graphify add <url> --contributor "Name"              # tag who added it
$graphify query "<question>"                          # BFS traversal - broad context
$graphify query "<question>" --dfs                    # DFS - trace one chain
$graphify query "<question>" --budget 1500            # cap answer at N tokens
$graphify path "AuthModule" "Database"                # shortest path between concepts
$graphify explain "SwinTransformer"                   # explain one node and its neighbors
```

In Codex, prefer `$graphify ...` as the explicit invocation. Do not rely on `/graphify ...`, which is Claude syntax. `$graphify` is a Codex skill trigger, not a Bash command like `graphify .`.

Install flow for Codex:

```bash
npm install -g graphifyy
graphify install --platform codex
graphify codex install
```

## What You Must Do When Invoked

If no path was given, use `.`. Do not ask the user for a path.

Follow these steps in order. Do not skip the runtime proof step.

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

mkdir -p graphify-out
printf '%s' "$NODE_BIN" > graphify-out/.graphify_node
printf '%s' "$GRAPHIFY_RUNTIME" > graphify-out/.graphify_runtime_script
"$NODE_BIN" "$GRAPHIFY_RUNTIME" runtime-info > graphify-out/.graphify_runtime.json

"$NODE_BIN" -e "
  const fs = require('fs');
  const runtime = JSON.parse(fs.readFileSync('graphify-out/.graphify_runtime.json', 'utf8'));
  if (runtime.runtime !== 'typescript') {
    console.error('ERROR: expected TypeScript runtime, got', runtime.runtime);
    process.exit(1);
  }
"
```

If this step fails, stop and tell the user exactly why. Do not continue with a Python fallback.

**In every subsequent bash block, use:**

```bash
$(cat graphify-out/.graphify_node) "$(cat graphify-out/.graphify_runtime_script)" ...
```

That keeps the run pinned to the resolved TypeScript runtime.

### Step 2 - Detect files

```bash
$(cat graphify-out/.graphify_node) "$(cat graphify-out/.graphify_runtime_script)" detect "INPUT_PATH" --out graphify-out/.graphify_detect.json
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
- If `total_words > 2_000_000` or `total_files > 200`: show the warning and the top 5 subdirectories by file count, then ask which subfolder to run on.
- Otherwise: proceed to Step 2.5. It is a safe no-op if no video files were detected.

### Step 2.5 - Prepare semantic detection, including video / audio transcripts when needed

Always run this step. If `files.video` is empty, it simply writes an unchanged semantic-detection file. If video/audio files are present, it transcribes them to text first and treats those transcripts as docs during semantic extraction.

```bash
GRAPHIFY_WHISPER_FLAG=""
if the original invocation included --whisper-model <name>, set GRAPHIFY_WHISPER_FLAG="--whisper-model <name>"

$(cat graphify-out/.graphify_node) "$(cat graphify-out/.graphify_runtime_script)" prepare-semantic-detect \
  $GRAPHIFY_WHISPER_FLAG \
  --detect graphify-out/.graphify_detect.json \
  --out graphify-out/.graphify_detect_semantic.json \
  --transcripts-out graphify-out/.graphify_transcripts.json \
  --analysis graphify-out/.graphify_analysis.json
```

After this step:
- use [graphify-out/.graphify_detect_semantic.json](graphify-out/.graphify_detect_semantic.json) for semantic cache and semantic extraction
- keep using [graphify-out/.graphify_detect.json](graphify-out/.graphify_detect.json) for manifest, cost, and final reporting
- the runtime prints `Transcribed N video file(s) -> treating as docs`

### Step 3 - Extract entities and relationships

Track whether `--mode deep` and `--directed` were given. Pass deep mode to every semantic subagent prompt.

Before running the build/finalization commands below, set this once:

```bash
GRAPHIFY_DIRECTED_FLAG=""
if the original invocation included --directed, set GRAPHIFY_DIRECTED_FLAG="--directed"
```

This step has two parts:
- structural extraction for code files, using the TypeScript runtime
- semantic extraction for docs, papers, images, and generated transcripts, using Codex subagents

Run Part A and Part B in parallel.

#### Part A - Structural extraction for code files

```bash
$(cat graphify-out/.graphify_node) "$(cat graphify-out/.graphify_runtime_script)" extract-ast \
  --detect graphify-out/.graphify_detect.json \
  --out graphify-out/.graphify_ast.json
```

#### Part B - Semantic extraction with Codex

If there are zero docs, papers, images, and generated transcripts, skip Part B entirely and go straight to Part C.

Use this rule:
- If the uncached non-code set fits in a single chunk of 20 files or fewer, stay in the main Codex thread and extract it directly.
- If it needs multiple chunks, use Codex subagents for parallel extraction.

##### Step B0 - Check semantic extraction cache first

```bash
$(cat graphify-out/.graphify_node) "$(cat graphify-out/.graphify_runtime_script)" check-semantic-cache \
  --detect graphify-out/.graphify_detect_semantic.json \
  --root . \
  --cached-out graphify-out/.graphify_cached.json \
  --uncached-out graphify-out/.graphify_uncached.txt
```

Only extract files listed in [graphify-out/.graphify_uncached.txt](graphify-out/.graphify_uncached.txt). If that file is empty, skip straight to Part C.

##### Step B1 - Split uncached files into chunks

Load the file list from [graphify-out/.graphify_uncached.txt](graphify-out/.graphify_uncached.txt). Split into chunks of 20-25 files each. Put each image in its own chunk. Keep files from the same directory together when possible.

##### Step B2 - Choose local extraction vs subagents

If there is exactly one chunk and it contains 20 files or fewer:
- stay in the main Codex thread
- read those files directly
- produce [graphify-out/.graphify_semantic_new.json](graphify-out/.graphify_semantic_new.json) yourself, using the exact schema below

If there are multiple chunks:
- use `spawn_agent` once per chunk
- dispatch them all in the same response so they run in parallel
- collect each result, validate JSON, and write the merged result to [graphify-out/.graphify_semantic_new.json](graphify-out/.graphify_semantic_new.json)

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

Code files: focus on semantic edges AST cannot find. Do not re-extract imports.
Doc/paper files: extract named concepts, entities, citations, and rationale.
Image files: use vision to understand what the image is, not just OCR.

DEEP_MODE=true means: be aggressive with INFERRED edges, but mark uncertain ones AMBIGUOUS.

Semantic similarity: add semantically_similar_to only when the connection is genuinely non-obvious.
Hyperedges: add sparingly, only when a group relationship carries meaning beyond pairwise edges.

If a file has YAML frontmatter, copy source_url, captured_at, author, contributor onto every node from that file.

Output exactly:
{"nodes":[{"id":"filestem_entityname","label":"Human Readable Name","file_type":"code|document|paper|image","source_file":"relative/path","source_location":null,"source_url":null,"captured_at":null,"author":null,"contributor":null}],"edges":[{"source":"node_id","target":"node_id","relation":"calls|implements|references|cites|conceptually_related_to|shares_data_with|semantically_similar_to|rationale_for","confidence":"EXTRACTED|INFERRED|AMBIGUOUS","confidence_score":1.0,"source_file":"relative/path","source_location":null,"weight":1.0}],"hyperedges":[{"id":"snake_case_id","label":"Human Readable Label","nodes":["node_id1","node_id2","node_id3"],"relation":"participate_in|implement|form","confidence":"EXTRACTED|INFERRED","confidence_score":0.75,"source_file":"relative/path"}],"input_tokens":0,"output_tokens":0}
```

##### Step B3 - Finalize the build

If you used subagents, wait for all of them, parse each result as JSON, skip failed chunks with a warning, and merge the successful chunks into [graphify-out/.graphify_semantic_new.json](graphify-out/.graphify_semantic_new.json). If more than half the chunks fail, stop.

If you extracted locally, write your final JSON directly to [graphify-out/.graphify_semantic_new.json](graphify-out/.graphify_semantic_new.json).

Then run one finalization command. It will:
- save fresh semantic results into the cache
- merge cached + fresh semantic extraction
- merge AST + semantic extraction
- build the graph
- generate `graph.json`, `GRAPH_REPORT.md`, `manifest.json`, `cost.json`
- optionally write `graph.html` if you pass `--html-out`

```bash
$(cat graphify-out/.graphify_node) "$(cat graphify-out/.graphify_runtime_script)" finalize-build \
  $GRAPHIFY_DIRECTED_FLAG \
  --detect graphify-out/.graphify_detect.json \
  --ast graphify-out/.graphify_ast.json \
  --cached graphify-out/.graphify_cached.json \
  --semantic-new graphify-out/.graphify_semantic_new.json \
  --root "INPUT_PATH" \
  --graph-out graphify-out/graph.json \
  --report-out graphify-out/GRAPH_REPORT.md \
  --analysis-out graphify-out/.graphify_analysis.json \
  --cost-out graphify-out/cost.json \
  --html-out graphify-out/graph.html
```

If this step fails because the graph is empty, stop and tell the user exactly that.

### Step 5 - Label communities

Read [graphify-out/.graphify_analysis.json](graphify-out/.graphify_analysis.json). For each community key, choose a 2-5 word plain-language name.

Write those labels to [graphify-out/.graphify_labels.json](graphify-out/.graphify_labels.json), then regenerate the labeled artifacts:

```bash
$(cat graphify-out/.graphify_node) "$(cat graphify-out/.graphify_runtime_script)" write-labeled-report \
  $GRAPHIFY_DIRECTED_FLAG \
  --extract graphify-out/.graphify_extract.json \
  --detect graphify-out/.graphify_detect.json \
  --analysis graphify-out/.graphify_analysis.json \
  --labels graphify-out/.graphify_labels.json \
  --root "INPUT_PATH" \
  --report-out graphify-out/GRAPH_REPORT.md \
  --graph-out graphify-out/graph.json \
  --html-out graphify-out/graph.html
```

### Step 6 - Export extras

If `--no-viz` was given, skip HTML generation during finalization and omit `--html-out` from Step 5.

If you intentionally skipped `--html-out` in finalization and still want HTML afterwards, run:

```bash
$(cat graphify-out/.graphify_node) "$(cat graphify-out/.graphify_runtime_script)" export-html \
  $GRAPHIFY_DIRECTED_FLAG \
  --extract graphify-out/.graphify_extract.json \
  --analysis graphify-out/.graphify_analysis.json \
  --labels graphify-out/.graphify_labels.json \
  --out graphify-out/graph.html
```

If `--svg` was requested:

```bash
$(cat graphify-out/.graphify_node) "$(cat graphify-out/.graphify_runtime_script)" export-svg \
  $GRAPHIFY_DIRECTED_FLAG \
  --extract graphify-out/.graphify_extract.json \
  --analysis graphify-out/.graphify_analysis.json \
  --labels graphify-out/.graphify_labels.json \
  --out graphify-out/graph.svg
```

If `--graphml` was requested:

```bash
$(cat graphify-out/.graphify_node) "$(cat graphify-out/.graphify_runtime_script)" export-graphml \
  $GRAPHIFY_DIRECTED_FLAG \
  --extract graphify-out/.graphify_extract.json \
  --analysis graphify-out/.graphify_analysis.json \
  --out graphify-out/graph.graphml
```

If `--neo4j` was requested:

```bash
$(cat graphify-out/.graphify_node) "$(cat graphify-out/.graphify_runtime_script)" export-cypher \
  $GRAPHIFY_DIRECTED_FLAG \
  --extract graphify-out/.graphify_extract.json \
  --out graphify-out/cypher.txt
```

If `--neo4j-push <uri>` was requested, ask for credentials if needed, then run:

```bash
$(cat graphify-out/.graphify_node) "$(cat graphify-out/.graphify_runtime_script)" push-neo4j \
  $GRAPHIFY_DIRECTED_FLAG \
  --extract graphify-out/.graphify_extract.json \
  --analysis graphify-out/.graphify_analysis.json \
  --uri "NEO4J_URI" \
  --user "NEO4J_USER" \
  --password "NEO4J_PASSWORD"
```

If `--mcp` was requested, use the public TypeScript CLI:

```bash
graphify serve graphify-out/graph.json
```

To register it in Codex:

```bash
codex mcp add graphify -- graphify serve /absolute/path/to/graphify-out/graph.json
```

If `--watch` was requested, use the public TypeScript watcher:

```bash
graphify watch "INPUT_PATH" --debounce 3
```

### Step 7 - Benchmark, cost, cleanup, report

If `total_words > 5000`, run:

```bash
$(cat graphify-out/.graphify_node) "$(cat graphify-out/.graphify_runtime_script)" benchmark \
  --graph graphify-out/graph.json \
  --corpus-words TOTAL_WORDS
```

Clean up temp files:

```bash
rm -f graphify-out/.graphify_detect.json graphify-out/.graphify_detect_semantic.json graphify-out/.graphify_transcripts.json graphify-out/.graphify_ast.json graphify-out/.graphify_cached.json graphify-out/.graphify_uncached.txt graphify-out/.graphify_semantic_new.json graphify-out/.graphify_analysis.json graphify-out/.graphify_labels.json
rm -f graphify-out/.needs_update 2>/dev/null || true
```

Tell the user:

```text
Graph complete. Outputs in PATH_TO_DIR/graphify-out/

  graph.html                 - interactive graph
  GRAPH_REPORT.md            - audit report
  graph.json                 - raw graph data
  .graphify_runtime.json     - runtime proof for this Codex run
```

Then paste only these sections from `GRAPH_REPORT.md`:
- God Nodes
- Surprising Connections
- Suggested Questions

End with:

> "The runtime proof is in `graphify-out/.graphify_runtime.json` and should say `typescript`. Want me to trace one of the suggested questions?"

## For --update

Use this when files changed since the last run.

First detect only the changed files:

```bash
$(cat graphify-out/.graphify_node) "$(cat graphify-out/.graphify_runtime_script)" detect-incremental \
  "INPUT_PATH" \
  --manifest graphify-out/manifest.json \
  --out graphify-out/.graphify_incremental.json
```

If `new_total == 0`, stop with `No files changed since last run. Nothing to update.`

Then determine whether all changed files are code files:

```bash
node -e "
  const fs = require('fs');
  const data = JSON.parse(fs.readFileSync('graphify-out/.graphify_incremental.json', 'utf8'));
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
cat > graphify-out/.graphify_semantic.json <<'EOF'
{"nodes":[],"edges":[],"hyperedges":[],"input_tokens":0,"output_tokens":0}
EOF
```

If not code-only:
- run the full Step 3 flow again, but use [graphify-out/.graphify_incremental.json](graphify-out/.graphify_incremental.json) as the detection file
- always prepare the semantic detection file first. It is a safe no-op if `new_files.video` is empty:

```bash
GRAPHIFY_WHISPER_FLAG=""
if the original invocation included --whisper-model <name>, set GRAPHIFY_WHISPER_FLAG="--whisper-model <name>"

$(cat graphify-out/.graphify_node) "$(cat graphify-out/.graphify_runtime_script)" prepare-semantic-detect \
  $GRAPHIFY_WHISPER_FLAG \
  --detect graphify-out/.graphify_incremental.json \
  --out graphify-out/.graphify_incremental_semantic.json \
  --transcripts-out graphify-out/.graphify_transcripts.json \
  --analysis graphify-out/.graphify_analysis.json \
  --incremental
```

- in update mode, wherever Step 3 normally references [graphify-out/.graphify_detect_semantic.json](graphify-out/.graphify_detect_semantic.json), use [graphify-out/.graphify_incremental_semantic.json](graphify-out/.graphify_incremental_semantic.json) instead
- for AST, call `extract-ast --incremental`
- for semantic cache, call `check-semantic-cache --incremental` against [graphify-out/.graphify_incremental_semantic.json](graphify-out/.graphify_incremental_semantic.json)

Before merging, keep a copy of the old graph:

```bash
cp graphify-out/graph.json graphify-out/.graphify_old.json
```

Then finalize the update in one command:

```bash
$(cat graphify-out/.graphify_node) "$(cat graphify-out/.graphify_runtime_script)" finalize-update \
  $GRAPHIFY_DIRECTED_FLAG \
  --detect graphify-out/.graphify_incremental.json \
  --ast graphify-out/.graphify_ast.json \
  --cached graphify-out/.graphify_cached.json \
  --semantic-new graphify-out/.graphify_semantic_new.json \
  --existing-graph graphify-out/.graphify_old.json \
  --root "INPUT_PATH" \
  --graph-out graphify-out/graph.json \
  --report-out graphify-out/GRAPH_REPORT.md \
  --analysis-out graphify-out/.graphify_analysis.json \
  --cost-out graphify-out/cost.json \
  --html-out graphify-out/graph.html
```

Then run Steps 5-7 again. Clean up:

```bash
rm -f graphify-out/.graphify_old.json graphify-out/.graphify_incremental.json graphify-out/.graphify_incremental_semantic.json graphify-out/.graphify_transcripts.json
```

## For --cluster-only

Skip detection and extraction. Re-run clustering/reporting from the existing graph:

```bash
$(cat graphify-out/.graphify_node) "$(cat graphify-out/.graphify_runtime_script)" cluster-only \
  --graph graphify-out/graph.json \
  --root "INPUT_PATH" \
  --graph-out graphify-out/graph.json \
  --report-out graphify-out/GRAPH_REPORT.md \
  --analysis-out graphify-out/.graphify_analysis.json
```

Then run Steps 5-7 again.

## For $graphify query

First check that [graphify-out/graph.json](graphify-out/graph.json) exists. If not, stop and tell the user to run `$graphify <path>` first.

Use the public TypeScript CLI:

```bash
graphify query "QUESTION" --graph graphify-out/graph.json
graphify query "QUESTION" --dfs --graph graphify-out/graph.json
graphify query "QUESTION" --budget 1500 --graph graphify-out/graph.json
```

Answer using only what the graph traversal shows. If the graph lacks the answer, say so.

After answering, save the Q&A back into the graph memory:

```bash
$(cat graphify-out/.graphify_node) "$(cat graphify-out/.graphify_runtime_script)" save-query-result \
  --question "QUESTION" \
  --answer "ANSWER" \
  --memory-dir graphify-out/memory \
  --query-type query \
  --source-nodes-json '["NODE_A","NODE_B"]'
```

## For $graphify path

```bash
$(cat graphify-out/.graphify_node) "$(cat graphify-out/.graphify_runtime_script)" path \
  --graph graphify-out/graph.json \
  "NODE_A" \
  "NODE_B"
```

Explain the path in plain language, then save it with `save-query-result`.

## For $graphify explain

```bash
$(cat graphify-out/.graphify_node) "$(cat graphify-out/.graphify_runtime_script)" explain \
  --graph graphify-out/graph.json \
  "NODE_NAME"
```

Write a 3-5 sentence explanation, then save it with `save-query-result`.

## For $graphify add

```bash
$(cat graphify-out/.graphify_node) "$(cat graphify-out/.graphify_runtime_script)" ingest \
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
