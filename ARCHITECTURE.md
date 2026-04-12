# Architecture

graphify is now an assistant skill backed by a TypeScript runtime rooted in `src/`. The skill orchestrates the runtime; the runtime can also be used standalone through the packaged CLI and public helper exports.

## Pipeline

```text
detect()  ->  extract()  ->  build()  ->  cluster()  ->  analyze()  ->  report()  ->  export()
```

Each stage is a single module with a narrow contract. They communicate through plain TypeScript objects and Graphology graphs - no shared mutable state, no side effects outside `graphify-out/`.

## Module responsibilities

| Module | Function | Input -> Output |
|--------|----------|-----------------|
| `src/detect.ts` | `detect(root)` / `detectIncremental(root, manifest)` | directory -> filtered corpus summary |
| `src/extract.ts` | `extract(...)` / `extractWithDiagnostics(...)` | code files -> extraction `{nodes, edges, hyperedges}` |
| `src/build.ts` | `buildFromJson(extraction)` | extraction dict -> `Graph` |
| `src/cluster.ts` | `cluster(G)` / `scoreAll(G, communities)` | graph -> communities + cohesion |
| `src/analyze.ts` | `godNodes(G)` / `surprisingConnections(G, communities)` / `suggestQuestions(...)` | graph -> analysis slices |
| `src/report.ts` | `generate(...)` | graph + analysis -> `GRAPH_REPORT.md` string |
| `src/export.ts` | `toJson`, `toHtml`, `toSvg`, `toGraphml`, `toCypher`, `pushToNeo4j` | graph -> exported artifacts |
| `src/ingest.ts` | `ingest(url, ...)` / `saveQueryResult(...)` | URL or Q&A -> saved corpus/memory file |
| `src/cache.ts` | `checkSemanticCache` / `saveSemanticCache` | files -> cached/uncached split |
| `src/security.ts` | validation helpers | URL / path / label -> validated or raises |
| `src/validate.ts` | `validateExtraction(data)` | extraction dict -> validation errors |
| `src/serve.ts` | `serve(graphPath)` | graph file path -> MCP stdio server |
| `src/watch.ts` | `watch(root, debounce)` / `rebuildCode(root)` | directory -> rebuild / update flag |
| `src/benchmark.ts` | `runBenchmark(graphPath)` | graph file -> corpus vs subgraph token comparison |
| `src/skill-runtime.ts` | `detect`, `extract-ast`, `finalize-build`, `finalize-update`, etc. | deterministic helper entrypoint for the Codex skill |
| `src/cli.ts` | packaged `graphify` CLI | user-facing commands |

## Extraction output schema

Every extractor returns:

```json
{
  "nodes": [
    {
      "id": "unique_string",
      "label": "human name",
      "file_type": "code|document|paper|image|rationale",
      "source_file": "path",
      "source_location": "L42"
    }
  ],
  "edges": [
    {
      "source": "id_a",
      "target": "id_b",
      "relation": "calls|imports|uses|references|...",
      "confidence": "EXTRACTED|INFERRED|AMBIGUOUS",
      "source_file": "path"
    }
  ],
  "hyperedges": []
}
```

`src/validate.ts` enforces this schema before `buildFromJson()` consumes it.

## Confidence labels

| Label | Meaning |
|-------|---------|
| `EXTRACTED` | Relationship is explicitly stated in the source |
| `INFERRED` | Relationship is a reasonable deduction from the source |
| `AMBIGUOUS` | Relationship is uncertain and should be surfaced for review |

## Skills vs runtime

The runtime itself does not dispatch Claude/Codex subagents. The skill markdown files under `src/skills/` instruct the assistant platform how to orchestrate:
- deterministic local runtime steps
- semantic extraction over docs, papers, and images
- optional parallel subagent fan-out on platforms that support it

So the package provides the graph pipeline, while the assistant client remains the orchestrator.

## Adding a new language extractor

1. Add the language support to `src/extract.ts` following the existing pattern:
   tree-sitter parse -> walk nodes -> collect `nodes` and `edges` -> add any second-pass inferred edges.
2. Register the suffix in `src/detect.ts` and any watcher handling in `src/watch.ts`.
3. Add the tree-sitter dependency to `package.json`.
4. Add a fixture file to `tests/fixtures/`.
5. Add or extend tests under `tests/` to cover the new extraction path.

## Security

All external input passes through `src/security.ts` before use:

- URLs -> `validateUrl()` and safe-fetch guards
- graph file paths -> `validateGraphPath()` so `serve` stays inside allowed graph outputs
- labels -> `sanitizeLabel()` before UI / text output

See `SECURITY.md` for the threat model.

## Testing

One test file per module or integration slice under `tests/`. Run with:

```bash
npm test
```

Notable integration coverage:
- `tests/pipeline.test.ts` for the end-to-end build pipeline
- `tests/serve.test.ts` for the MCP stdio server handshake and representative tool calls
- `scripts/smoke-test.sh` for package/tarball installation checks

## License

This repository is MIT licensed. The canonical license file is `LICENSE` at the repository root.
