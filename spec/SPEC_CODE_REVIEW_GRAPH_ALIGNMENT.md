# SPEC_CODE_REVIEW_GRAPH_ALIGNMENT

## Status

This spec defines the TypeScript Graphify alignment plan for selected `code-review-graph` review features.

- Created: 2026-04-22
- CRG reference: `tirth8205/code-review-graph` tag `v2.3.2`
- CRG commit: `db2d2df789c25a101e33477b898c1840fb4c7bc7`
- Local CRG inspection clone: `/tmp/code-review-graph-v2.3.2`
- Graphify baseline: `graphifyy@0.4.25`
- Source-lock spec: `spec/SPEC_UPSTREAM_TRACEABILITY.md`

## Product Boundary

Graphify stays a generic multimodal knowledge graph product. CRG is a review-first code graph. This roadmap ports CRG review algorithms conceptually while keeping Graphify's current source of truth as `.graphify/graph.json`.

Graphify must not adopt these CRG defaults in this lot:

- SQLite as required graph storage.
- Embeddings as a baseline dependency.
- A review-only product identity.
- Python runtime dependencies.
- Network-clone benchmark runners.

## Execution Order

Implementation order is:

1. F3 `ReviewGraphStoreLike` adapter.
2. F7 execution flows.
3. F8 affected flows.
4. F5 review context and blast radius.
5. F6 risk-scored detect changes.
6. F4 minimal context first-call tool.
7. F10 skills and LLM review workflow.
8. F11 report/wiki/HTML enrichment.
9. F12 benchmarks and honesty metrics.

F9 is a gate across all algorithmic features: port the relevant CRG test behavior before runtime code is accepted.

## CRG Sources

Primary CRG implementation files:

- `code_review_graph/graph.py`
- `code_review_graph/changes.py`
- `code_review_graph/flows.py`
- `code_review_graph/tools/review.py`
- `code_review_graph/tools/context.py`
- `code_review_graph/tools/query.py`
- `code_review_graph/tools/build.py`
- `code_review_graph/wiki.py`
- `code_review_graph/prompts.py`
- `code_review_graph/skills.py`
- `code_review_graph/eval/scorer.py`

Primary CRG tests to port conceptually:

- `tests/test_changes.py`
- `tests/test_flows.py`
- `tests/test_tools.py`
- `tests/test_prompts.py`
- `tests/test_skills.py`
- `tests/test_wiki.py`
- `tests/test_eval.py`
- `tests/test_integration_v2.py`

## F3 ReviewGraphStoreLike Adapter

### Existing Graphify Graph Shape

Graphify serialized graphs currently support:

- top-level `directed`, `multigraph`, `graph`, `nodes`, `links` or `edges`, and `hyperedges`.
- node attrs `id`, `label`, `file_type`, `source_file`, optional `source_location`, `confidence`, `community`, and arbitrary extra fields.
- edge attrs `source`, `target`, `relation`, `confidence`, `source_file`, optional `source_location`, `confidence_score`, `weight`, `_src`, `_tgt`, and arbitrary extra fields.
- `links` are preferred over `edges` when both exist because the current loader uses `raw.links ?? raw.edges`.

### CRG Behavior To Preserve

CRG review features query a SQLite `GraphStore` that provides:

- node lookup by qualified name, file path, kind, ID, community, and search.
- edge lookup by source, target, relation kind, and edge set among nodes.
- impact-radius traversal from changed files.
- line-range mapping from git diffs to nodes.
- test coverage lookup through direct and transitive `TESTED_BY` edges.
- flow membership and flow criticality lookup.
- community lookup for nodes and qualified names.
- graph stats and all-file enumeration.

The TypeScript adapter is the seam that lets Graphify reuse these review algorithms without adopting SQLite.

### Graphify Target

Create `src/review-store.ts` with a read-only adapter over Graphology graphs loaded from `.graphify/graph.json`.

The initial adapter must not mutate graph artifacts and must not introduce a database. If later performance requires an index, it must be an optional sidecar described by a separate storage spec.

### Normalized Node Contract

```ts
export type ReviewGraphNodeKind =
  | "File"
  | "Class"
  | "Function"
  | "Method"
  | "Type"
  | "Test"
  | "Concept"
  | "Document"
  | "Image"
  | "Video"
  | "Unknown";

export interface ReviewGraphNode {
  id: string;
  name: string;
  qualifiedName: string;
  kind: ReviewGraphNodeKind;
  filePath: string | null;
  lineStart: number | null;
  lineEnd: number | null;
  language: string | null;
  parentName: string | null;
  isTest: boolean;
  communityId: number | null;
  confidence: string | null;
  extra: Record<string, unknown>;
}
```

Mapping rules:

- `id` is the Graphify node ID.
- `name` is `attrs.label` when present, otherwise the node ID.
- `qualifiedName` is `attrs.qualified_name`, `attrs.qualifiedName`, or the node ID.
- `kind` is read from `attrs.kind`, `attrs.node_type`, or `attrs.type`; otherwise infer from `file_type`, path, and label.
- `filePath` is normalized from `attrs.source_file`.
- `lineStart` and `lineEnd` are parsed from structured attrs when present, otherwise from `source_location`.
- `isTest` is true when kind is `Test` or the file path matches test/spec conventions.
- `communityId` is parsed from `attrs.community`.
- `extra` preserves original attrs for later feature-specific reads.

### Normalized Edge Contract

```ts
export interface ReviewGraphEdge {
  id: string;
  kind: string;
  sourceQualified: string;
  targetQualified: string;
  sourceId: string;
  targetId: string;
  filePath: string | null;
  line: number | null;
  confidence: number;
  confidenceTier: string;
  extra: Record<string, unknown>;
}
```

Mapping rules:

- `kind` canonicalizes Graphify `relation` to CRG-style upper snake case, for example `calls` to `CALLS`, `imports_from` to `IMPORTS_FROM`, and `validated_by` to `TESTED_BY`.
- On directed Graphology graphs, `source` and `target` define direction.
- On undirected Graphology graphs, `_src` and `_tgt` define preserved original direction when present.
- If an undirected edge lacks `_src`/`_tgt`, review traversal may use it for impact radius but not for forward execution-flow tracing.
- `confidence` uses `confidence_score`, `weight`, or a default of `1.0` for `EXTRACTED`, `0.5` for `INFERRED`, and `0.25` for `AMBIGUOUS`.
- `confidenceTier` uses Graphify `confidence` or defaults to `EXTRACTED`.

### Adapter Interface

```ts
export interface ReviewGraphStoreLike {
  getNode(qualifiedNameOrId: string): ReviewGraphNode | null;
  getNodeById(id: string): ReviewGraphNode | null;
  getAllNodes(options?: { excludeFiles?: boolean }): ReviewGraphNode[];
  getNodesByFile(filePath: string): ReviewGraphNode[];
  getFilesMatching(pattern: string): string[];
  getNodesByKind(kinds: ReviewGraphNodeKind[]): ReviewGraphNode[];
  getAllFiles(): string[];

  getEdgesBySource(qualifiedNameOrId: string, kind?: string): ReviewGraphEdge[];
  getEdgesByTarget(qualifiedNameOrId: string, kind?: string): ReviewGraphEdge[];
  getAllEdges(): ReviewGraphEdge[];
  getEdgesAmong(qualifiedNamesOrIds: Set<string>): ReviewGraphEdge[];
  getAllCallTargets(): Set<string>;

  getImpactRadius(changedFiles: string[], options?: {
    maxDepth?: number;
    maxNodes?: number;
    direction?: "directed" | "undirected";
  }): ReviewImpactRadius;

  getTransitiveTests(qualifiedNameOrId: string, maxDepth?: number): ReviewGraphNode[];
  getNodeCommunityId(qualifiedNameOrId: string): number | null;
  getCommunityIdsByQualifiedNames(qualifiedNamesOrIds: string[]): Map<string, number | null>;
  getGraphStats(): ReviewGraphStats;
}
```

Supporting result types:

```ts
export interface ReviewImpactRadius {
  changedNodes: ReviewGraphNode[];
  impactedNodes: ReviewGraphNode[];
  impactedFiles: string[];
  edges: ReviewGraphEdge[];
  truncated: boolean;
  totalImpacted: number;
}

export interface ReviewGraphStats {
  totalNodes: number;
  totalEdges: number;
  nodesByKind: Record<string, number>;
  edgesByKind: Record<string, number>;
  languages: string[];
  filesCount: number;
  lastUpdated: string | null;
}
```

Flow-aware methods are not required until F7/F8. Their signatures should be reserved in the spec but implemented with empty results only when the flow artifact exists:

```ts
export interface ReviewFlowLookup {
  countFlowMemberships(nodeId: string): number;
  getFlowCriticalitiesForNode(nodeId: string): number[];
  getNodeIdsByFiles(files: string[]): string[];
  getFlowIdsByNodeIds(nodeIds: string[]): string[];
  getFlowQualifiedNames(flowId: string): Set<string>;
}
```

### Path Matching

The adapter must preserve existing Graphify path matching:

- normalize backslashes to `/`.
- remove leading `./`.
- match exact paths.
- allow suffix matches in both directions so `src/a.ts` matches `/repo/src/a.ts`.
- expose `getFilesMatching(pattern)` for CRG-style exact-first then suffix fallback in changed-range mapping.
- return stable sorted results.

### Line Range Parsing

The adapter must parse these forms when present:

- structured `line_start`, `lineStart`, `line_end`, `lineEnd`.
- `source_location` values containing `:12`, `:12-20`, `L12`, `L12-L20`, `#L12`, or `lines 12-20`.

If no line range is available, F6 must fall back to file-level mapping rather than dropping the file from review.

### Directed Traversal Policy

Review impact may use undirected traversal to favor recall, matching CRG's conservative blast-radius posture.

Execution flows must use only directed `CALLS` edges. If the graph is undirected and an edge lacks preserved `_src`/`_tgt`, F7 must skip that edge for flow tracing and report a degraded-precision warning.

### F3 Target Files

- Create `src/review-store.ts`.
- Create `tests/review-store.test.ts`.
- Export stable public types from `src/index.ts` only after the test contract is stable.
- Keep existing `src/review.ts` and `src/review-analysis.ts` backward compatible.
- Later implementation lots may adapt `src/review.ts`, `src/review-analysis.ts`, `src/summary.ts`, `src/cli.ts`, `src/serve.ts`, and `src/skill-runtime.ts` only after the adapter tests pass.

### F3 Test Matrix

Port or synthesize these CRG behaviors:

| Behavior | CRG source | Graphify target test |
| --- | --- | --- |
| file path lookup | `GraphStore.get_nodes_by_file`, `changes.map_changes_to_nodes` | exact path and suffix path matching |
| kind lookup | `GraphStore.get_nodes_by_kind` | function/class/test filtering |
| source/target edge lookup | `get_edges_by_source`, `get_edges_by_target` | directed Graphology and `_src`/`_tgt` preserved direction |
| undirected fallback | `get_impact_radius` conservative traversal | impact radius includes neighbors without claiming flow direction |
| all call targets | `get_all_call_targets` | entry roots exclude functions/tests targeted by canonical `CALLS` edges |
| line overlap | `changes.map_changes_to_nodes` | changed range maps to overlapping node ranges |
| missing line fallback | `changes.analyze_changes` fallback | file-level node mapping when line ranges are absent |
| test lookup | `get_transitive_tests` | direct `TESTED_BY`/`validated_by` and one-hop transitive coverage |
| community lookup | `get_node_community_id`, `get_community_ids_by_qualified_names` | numeric and string community attrs |
| stats | `GraphStore.get_stats` | node/edge counts, files count, node kinds |

Additional current Graphify test gaps to close in F3:

- serialized `links` vs `edges` loading in review-store fixtures.
- directed graph review expectations.
- Windows paths, absolute paths, and leading `./` paths.
- missing `source_file` handling.
- structured line range attrs plus `source_location` parsing.
- CRG-style `qualified_name`, `kind`, `is_test`, `TESTED_BY`, transitive tests, and future flow fields.

## F7 Execution Flows

### CRG Source Contract

F7 ports `code_review_graph/flows.py` conceptually:

- `detect_entry_points(store, include_tests=False)`
- `_trace_single_flow(store, ep, max_depth=15)`
- `trace_flows(store, max_depth=15, include_tests=False)`
- `compute_criticality(flow, store)`
- `store_flows(store, flows)`
- `get_flows(store, sort_by="criticality", limit=50)`
- `get_flow_by_id(store, flow_id)`
- `incremental_trace_flows(store, changed_files, max_depth=15)`

The initial Graphify implementation must cover full build/list/get behavior. Incremental retracing may be deferred until F8 if the artifact schema preserves stable flow IDs and node memberships.

### Entrypoint Detection

Graphify must preserve CRG's entrypoint rules with TypeScript constants:

- true root: `Function` or `Test` node whose `qualifiedName` is not in `store.getAllCallTargets()`.
- framework entrypoint: node `extra.decorators` contains one of CRG's decorator patterns.
- conventional name: node name matches one of CRG's entry-name patterns.
- tests excluded by default unless `includeTests` is true.
- file-level test exclusion applies to `__tests__`, `.spec.ts`, `.spec.tsx`, `.test.ts`, `.test.tsx`, and Python `test_*.py` paths.

Decorator patterns copied conceptually from CRG:

```text
app.(get|post|put|delete|patch|route|websocket|on_event)
router.(get|post|put|delete|patch|route)
blueprint.(route|before_request|after_request)
(before|after)_(request|response)
click.(command|group)
\w+.(command|group)
(field|model)_(serializer|validator)
(celery.)?(task|shared_task|periodic_task)
receiver
api_view
\baction\b
pytest.(fixture|mark)
(override_settings|modify_settings)
(event.)?listens_for
(Get|Post|Put|Delete|Patch|RequestMapping)Mapping
(Scheduled|EventListener|Bean|Configuration)
(Component|Injectable|Controller|Module|Guard|Pipe)
(Subscribe|Mutation|Query|Resolver)
(app|router).(get|post|put|delete|patch|use|all)
@(Override|OnLifecycleEvent|Composable)
(HiltViewModel|AndroidEntryPoint|Inject)
\w+.(tool|tool_plain|system_prompt|result_validator)
^tool\b
\w+.(middleware|exception_handler|on_exception)
\w+.route\b
```

Name patterns copied conceptually from CRG:

```text
^main$
^__main__$
^test_
^Test[A-Z]
^on_
^handle_
^handler$
^handle$
^lambda_handler$
^upgrade$
^downgrade$
^lifespan$
^get_db$
^on(Create|Start|Resume|Pause|Stop|Destroy|Bind|Receive)
^do(Get|Post|Put|Delete)$
^do_(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)$
^log_message$
^(middleware|errorHandler)$
^ng(OnInit|OnChanges|OnDestroy|DoCheck|AfterContentInit|AfterContentChecked|AfterViewInit|AfterViewChecked)$
^(transform|writeValue|registerOnChange|registerOnTouched|setDisabledState)$
^(canActivate|canDeactivate|canActivateChild|canLoad|canMatch|resolve)$
^(componentDidMount|componentDidUpdate|componentWillUnmount|shouldComponentUpdate|render)$
```

### Flow Tracing

Graphify must trace flows with forward BFS over directed `CALLS` edges exposed by `ReviewGraphStoreLike`:

- seed queue with the entrypoint node.
- follow only `CALLS` edges from `getEdgesBySource()`.
- never traverse `TESTED_BY`, semantic, conceptual, import-only, or multimodal edges.
- use a visited qualified-name set for cycle safety.
- default `maxDepth` is `15`.
- `depth` is the maximum BFS depth reached.
- skip trivial single-node flows.
- sort final flows by descending `criticality`.

On undirected Graphify graphs, only edges with preserved `_src` and `_tgt` from the F3 adapter may participate in forward flows. If skipped edges exist because direction is unavailable, the flow result must include a warning so downstream review features do not overclaim precision.

### Criticality

Graphify must port CRG weights with no product-specific taxonomy:

- file spread: weight `0.30`; one file is `0.0`, five or more files is `1.0`.
- external calls: weight `0.20`; unresolved `CALLS` targets are external, five or more is `1.0`.
- security sensitivity: weight `0.25`; count nodes whose name or qualified name contains a CRG security keyword.
- test coverage gap: weight `0.15`; node is covered if it has an incoming `TESTED_BY` edge.
- depth: weight `0.10`; depth ten or more is `1.0`.

Security keywords copied from CRG:

```text
auth, login, password, token, session, crypt, secret, credential,
permission, sql, query, execute, connect, socket, request, http,
sanitize, validate, encrypt, decrypt, hash, sign, verify, admin,
privilege
```

The final score is rounded to four decimals and clamped to `[0, 1]`.

### Graphify Flow Artifact

Graphify persists derived flows to `.graphify/flows.json` by default. This artifact is generated state, not a new source of truth and not required for ordinary graph build/update commands.

Schema:

```ts
export interface ReviewFlowArtifact {
  version: 1;
  generatedAt: string;
  graphPath: string | null;
  maxDepth: number;
  includeTests: boolean;
  warnings: string[];
  flows: ReviewFlow[];
}

export interface ReviewFlow {
  id: string;
  name: string;
  entryPoint: string;
  entryPointId: string;
  path: string[];
  qualifiedPath: string[];
  depth: number;
  nodeCount: number;
  fileCount: number;
  files: string[];
  criticality: number;
  warnings: string[];
}

export interface ReviewFlowStep {
  nodeId: string;
  name: string;
  kind: ReviewGraphNodeKind;
  file: string | null;
  lineStart: number | null;
  lineEnd: number | null;
  qualifiedName: string;
}
```

Flow IDs must be deterministic for a graph: `flow:<entryPointId>` sanitized for filesystem and JSON stability. If duplicate entrypoint IDs ever collide after sanitization, suffix with a deterministic counter.

### API Surface

Create `src/flows.ts` with:

- `detectEntryPoints(store, options?)`
- `traceFlows(store, options?)`
- `computeFlowCriticality(flow, store)`
- `flowToSteps(flow, store)`
- `buildFlowArtifact(store, options?)`
- `writeFlowArtifact(artifact, path)`
- `readFlowArtifact(path)`
- `listFlows(artifact, options?)`
- `getFlowById(artifact, flowId, store?)`

The functions consume `ReviewGraphStoreLike`; they must not import Graphology directly except optional convenience helpers that wrap `createReviewGraphStore()`.

### CLI And Runtime

Add public CLI commands:

```text
graphify flows build --graph .graphify/graph.json --out .graphify/flows.json [--max-depth 15] [--include-tests]
graphify flows list --flows .graphify/flows.json [--sort criticality|depth|node-count|file-count|name] [--limit 50] [--json]
graphify flows get <flow-id> --flows .graphify/flows.json --graph .graphify/graph.json [--json]
```

Add skill-runtime equivalents:

```text
graphify-skill-runtime flows-build --graph <path> --out <path>
graphify-skill-runtime flows-list --flows <path>
graphify-skill-runtime flows-get --flows <path> --graph <path> --id <flow-id>
```

F7 does not change existing `summary`, `review-delta`, `review-analysis`, or `recommend-commits` behavior. Later lots may consume `.graphify/flows.json` only when it exists.

### F7 Test Matrix

Port CRG `tests/test_flows.py` behaviors into Vitest:

- no-incoming `CALLS` functions become entrypoints.
- framework decorators mark entrypoints even when called.
- conventional names `main`, `test_*`, `on_*`, `handle_*`, `upgrade`, `downgrade`, `lifespan` become entrypoints.
- test nodes and test files are excluded by default and included with `includeTests`.
- linear flow `A -> B -> C` traces all nodes.
- cycles do not loop forever.
- `maxDepth` limits traversal.
- trivial single-node flows are skipped.
- multi-file flows report all files and `fileCount`.
- criticality is bounded `[0, 1]`.
- security-sensitive flow scores at least as high as a comparable non-security flow.
- file-spread boosts multi-file flows.
- store/list/get roundtrip works through `.graphify/flows.json`.
- sort modes match CRG intent.
- directed-edge degradation warning is emitted for undirected edges that lack preserved direction.

## F8 Affected Flows

### CRG Source Contract

F8 ports `code_review_graph/flows.py:get_affected_flows()` and the corresponding review tool wrappers.

CRG behavior:

- accepts `changed_files`.
- returns empty result when `changed_files` is empty.
- maps changed files to node IDs.
- finds flow IDs whose memberships include any of those nodes.
- returns full flow details with steps.
- sorts affected flows by descending `criticality`.

### Graphify Target

Graphify must consume the F7 `.graphify/flows.json` artifact and F3 `ReviewGraphStoreLike`:

- `flows.json` supplies derived flow memberships.
- `graph.json` supplies node metadata and step details.
- no SQLite table or separate membership store is introduced.
- if the flow artifact is missing, CLI commands fail clearly and tell the user to run `graphify flows build`.

### API Surface

Add to `src/flows.ts`:

```ts
export interface AffectedFlowsResult {
  changedFiles: string[];
  matchedNodeIds: string[];
  unmatchedFiles: string[];
  affectedFlows: ReviewFlowDetail[];
  total: number;
}

export function getAffectedFlows(
  artifact: ReviewFlowArtifact,
  changedFiles: string[],
  store: ReviewGraphStoreLike,
): AffectedFlowsResult;
```

Mapping rules:

- For each changed file, call `store.getNodesByFile(file)`.
- A flow is affected when any changed node ID appears in `flow.path`.
- `matchedNodeIds` is stable sorted unique.
- `unmatchedFiles` includes changed files with no matched graph nodes.
- `affectedFlows` includes `steps` from `getFlowById(..., store)`.
- Sort by descending `criticality`, then name for deterministic ties.

### Changed File Discovery

Public CLI supports the same file discovery convention as existing review commands:

```text
graphify affected-flows [files...] --flows .graphify/flows.json --graph .graphify/graph.json
graphify affected-flows --files src/a.ts,src/b.ts
graphify affected-flows --base main --head HEAD
graphify affected-flows --staged
```

Resolution order:

1. positional files and `--files` if present.
2. `--base/--head` or `--staged`.
3. working tree diff against `HEAD` plus untracked files, matching existing `review-delta`.

Skill-runtime stays deterministic and requires explicit files:

```text
graphify-skill-runtime affected-flows --flows <path> --graph <path> --files <csv>
```

### Output Contract

Text output starts with:

```text
Affected flows: <total>
Changed files: <n>
Matched nodes: <n>
```

JSON output is exactly `AffectedFlowsResult`.

F8 must not trigger a graph rebuild or flow rebuild implicitly. Agents may suggest `graphify flows build` when artifacts are missing or stale, but the command itself stays a read-only query.

## F5 Review Context And Blast Radius

### CRG Source Contract

F5 ports `code_review_graph/tools/review.py:get_review_context()` conceptually:

- auto-detect changed files when omitted.
- compute impact radius at `max_depth=2`.
- support `detail_level="minimal" | "standard"`.
- support `include_source=true` with capped source snippets.
- return changed files, impacted files, changed nodes, impacted nodes, edges, source snippets, and review guidance.

CRG helper behavior to preserve:

- `_extract_relevant_lines()` includes changed node line ranges with small context and merges overlapping ranges.
- when no node range matches a long file, fallback returns the first 50 numbered lines.
- `_generate_review_guidance()` flags test gaps, wide blast radius, inheritance/implementation edges, and cross-file impact.
- minimal mode returns counts, risk, key entities, test gap count, and next tool suggestions.

### Graphify Target

Create `src/review-context.ts` on top of F3 `ReviewGraphStoreLike`. Do not change existing `review-delta` or `review-analysis` output in this lot.

The new command is additive:

```text
graphify review-context [files...] --graph .graphify/graph.json
```

Later lots may let existing `review-delta`/`review-analysis` delegate internally, but their public output must remain backward compatible until a separate compatibility spec changes it.

### API Surface

```ts
export type ReviewContextDetailLevel = "minimal" | "standard";

export interface BuildReviewContextOptions {
  maxDepth?: number;
  detailLevel?: ReviewContextDetailLevel;
  includeSource?: boolean;
  maxLinesPerFile?: number;
  repoRoot?: string;
}

export interface ReviewContextResult {
  status: "ok";
  summary: string;
  risk?: "low" | "medium" | "high";
  changedFileCount?: number;
  impactedFileCount?: number;
  keyEntities?: string[];
  testGaps?: number;
  nextToolSuggestions?: string[];
  context?: ReviewContextPayload;
}

export interface ReviewContextPayload {
  changedFiles: string[];
  impactedFiles: string[];
  graph: {
    changedNodes: ReviewGraphNode[];
    impactedNodes: ReviewGraphNode[];
    edges: ReviewGraphEdge[];
  };
  sourceSnippets?: Record<string, string>;
  reviewGuidance: string;
}
```

When no changed files are provided or detected, return:

```json
{
  "status": "ok",
  "summary": "No changes detected. Nothing to review.",
  "context": {}
}
```

### Detail Levels

`minimal`:

- risk is `high` when impacted nodes > 20, `medium` when > 5, otherwise `low`.
- `keyEntities` is the first five changed node names.
- `testGaps` counts changed non-test functions with no incoming `TESTED_BY` edge.
- `nextToolSuggestions` is `["detect-changes", "affected-flows", "review-context"]`.
- no source snippets are emitted.

`standard`:

- includes full impact result from `store.getImpactRadius(changedFiles, { maxDepth })`.
- includes source snippets only when `includeSource` is true.
- includes generated guidance.

### Source Snippet Safety

Source snippets are opt-in for runtime callers and default-on for public CLI parity with CRG only when `--include-source` is passed or when the default command chooses it explicitly.

Rules:

- read only files under `repoRoot` after resolving real paths.
- never read files larger than `maxLinesPerFile` into output wholesale.
- default `maxLinesPerFile` is `200`.
- for long files, include changed node ranges with two lines before and one line after, matching CRG intent.
- fallback for long files with no matching line metadata is first 50 numbered lines.
- skip binary-looking files and return `(could not read file)` on read errors.
- exclude obvious secret files by default: `.env`, `.npmrc`, private keys, certificate/key files, and paths containing `secret`, `credential`, or `token`.

### CLI And Runtime

Public CLI:

```text
graphify review-context [files...] --graph .graphify/graph.json
graphify review-context --files src/a.ts,src/b.ts
graphify review-context --base main --head HEAD
graphify review-context --staged
graphify review-context --detail-level minimal|standard
graphify review-context --include-source --max-lines-per-file 200
graphify review-context --json
```

File discovery follows F8: explicit files first, then git ref/staged/worktree discovery.

Skill runtime:

```text
graphify-skill-runtime review-context --graph <path> --files <csv>
```

Runtime requires explicit files for deterministic assistant orchestration.

### F5 Test Matrix

Port or synthesize CRG behaviors:

- minimal mode returns low/medium/high risk based on impacted node count.
- standard mode returns changed files, impacted files, changed nodes, impacted nodes and edges.
- source snippets include numbered relevant lines for changed node ranges.
- long files use relevant ranges and fallback first 50 lines.
- sensitive files are not read into snippets.
- guidance flags untested changed functions.
- guidance flags wide blast radius.
- guidance flags inheritance or implementation edges.
- guidance flags cross-file impact when impacted file count is greater than three.
- CLI and skill-runtime commands emit text and JSON from the same implementation.

## F6 Risk-Scored Detect Changes

### CRG Source Contract

F6 ports `code_review_graph/changes.py` conceptually:

- `parse_git_diff_ranges(repo_root, base="HEAD~1")`
- `_parse_unified_diff(diff_text)`
- `map_changes_to_nodes(store, changed_ranges)`
- `compute_risk_score(store, node)`
- `analyze_changes(store, changed_files, changed_ranges?, repo_root?, base?)`
- `tools/review.py:detect_changes_func()`

### Git Diff Parsing

Graphify must parse unified diffs without shell interpretation:

- run `git diff --unified=0 <base> --` through existing safe git helpers or `spawn`/`execFile` style APIs.
- reject unsafe refs using CRG `_SAFE_GIT_REF`: `^[A-Za-z0-9_.~^/@{}\-]+$`.
- hunk headers map `@@ ... +start,count @@` to inclusive `[start, end]` ranges.
- omitted count means one changed line.
- `count=0` deletion hunks map to `[start, start]`.
- files are read from `+++ b/<path>` lines.
- command failure or unsafe ref returns empty ranges and a warning, not a thrown exception from public CLI.

### Changed Range Mapping

`mapChangesToNodes(store, changedRanges)` must:

- use `store.getNodesByFile(file)` first.
- fall back to `store.getFilesMatching(file)` for suffix/absolute path differences.
- require node line metadata for line-overlap mapping.
- dedupe by qualified name.
- overlap when `node.lineStart <= rangeEnd && node.lineEnd >= rangeStart`.
- if no ranges are available, `analyzeChanges()` falls back to all nodes in changed files.

### Risk Score

Port CRG weights:

- flow participation: sum flow criticalities for flows containing the node, capped `0.25`; if no criticality data, `0.05` per flow membership capped `0.25`.
- community crossing: `0.05` per caller from a different community, capped `0.15`.
- test coverage: `0.30 - min(testCount / 5, 1) * 0.25`; this means untested = `0.30`, 5+ tests = `0.05`.
- security sensitivity: `0.20` if node name or qualified name contains a CRG security keyword.
- caller count: caller count / 20 capped `0.10`.
- clamp and round to four decimals.

Security keywords are the same set as F7.

### Output Contract

```ts
export interface DetectChangesResult {
  status: "ok";
  summary: string;
  riskScore: number;
  changedFiles: string[];
  changedFunctions: DetectChangesNodeRisk[];
  affectedFlows: ReviewFlowDetail[];
  testGaps: DetectChangesTestGap[];
  reviewPriorities: DetectChangesNodeRisk[];
  warnings: string[];
}
```

Minimal output returns:

- `status`
- `summary`
- `riskScore`
- `changedFileCount`
- `testGapCount`
- top three `reviewPriorities` names.

### Flow Integration

F6 may accept an optional F7 `ReviewFlowArtifact`:

- CLI option `--flows .graphify/flows.json`.
- if missing, risk score still works with flow factor `0`.
- if provided, affected flows are computed with F8 `getAffectedFlows()`.
- no implicit `flows build`.

### CLI And Runtime

Public CLI:

```text
graphify detect-changes [files...] --graph .graphify/graph.json
graphify detect-changes --files src/a.ts,src/b.ts
graphify detect-changes --base main --head HEAD
graphify detect-changes --staged
graphify detect-changes --flows .graphify/flows.json
graphify detect-changes --detail-level minimal|standard
graphify detect-changes --json
```

Skill-runtime requires explicit files and optional precomputed ranges/flows:

```text
graphify-skill-runtime detect-changes --graph <path> --files <csv> [--flows <path>]
```

### Dirty Worktree Behavior

Graphify must not mutate git state. If worktree diff is used implicitly, the text output must be framed as current working tree analysis. If explicit files or refs are provided, analyze those and do not warn about unrelated dirty state unless a later skill layer decides to.

### F6 Test Matrix

Port CRG tests:

- parse basic unified diff.
- parse multiple hunks.
- parse single-line hunk.
- parse deletion-only hunk.
- parse multiple files.
- reject unsafe git refs.
- map changed ranges to overlapping nodes.
- no overlap returns empty.
- dedupe nodes across ranges.
- changed ranges across files.
- risk score is `[0, 1]`.
- untested function scores higher than tested function.
- security keyword boosts risk.
- caller count boosts risk.
- flow membership/criticality boosts risk when artifact is provided.
- `analyzeChanges()` returns summary, risk score, changed functions, affected flows, test gaps, priorities.
- fallback with no ranges maps all nodes in changed files.
- CLI/runtime minimal and standard outputs use the same implementation.

## F4 Minimal Context First-Call Tool

### CRG Source Contract

F4 ports `code_review_graph/tools/context.py:get_minimal_context()` conceptually:

- return the smallest useful orientation for an agent first call.
- include graph stats, risk if changed files exist, key entities, top communities, top flows, and next tool suggestions.
- route suggestions by task keywords.
- target roughly 100 tokens and stay under the LLM reference budget of 800 context tokens.

### Graphify Target

Create `src/minimal-context.ts` after F7/F8/F5/F6 are available.

Graphify input sources:

- F3 `ReviewGraphStoreLike.getGraphStats()`.
- Graph attributes `community_labels` and node community counts for top communities.
- F7 `.graphify/flows.json` when provided.
- F6 `analyzeChanges()` when changed files are explicit or discovered by CLI.

No source snippets, raw file reads, graph rebuilds, or flow rebuilds are allowed in F4.

### Output Contract

```ts
export interface MinimalContextResult {
  summary: string;
  keyEntities?: string[];
  risk: "unknown" | "low" | "medium" | "high";
  riskScore: number;
  communities?: string[];
  flowsAffected?: string[];
  flowsAvailable: boolean;
  nextToolSuggestions: string[];
}
```

`summary` format:

```text
<nodes> nodes, <edges> edges across <files> files. Risk: <risk> (<score>). <n> test gaps.
```

Risk is:

- `unknown` when no changed files are provided or detected.
- `high` when F6 risk score > `0.7`.
- `medium` when > `0.4`.
- `low` otherwise.

### Suggestion Routing

Port CRG keyword routing but use Graphify command names:

- review/pr/merge/diff -> `detect-changes`, `affected-flows`, `review-context`
- debug/bug/error/fix -> `summary`, `query`, `flows get`
- refactor/rename/dead/clean -> `review-context`, `detect-changes`, `recommend-commits`
- onboard/understand/explore/arch -> `summary`, `flows list`, `path`
- default -> `detect-changes`, `summary`, `review-context`

### Flows Behavior

When no flow artifact is provided:

- `flowsAvailable` is false.
- omit `flowsAffected` from text output or return `[]` in JSON.
- next suggestions may still include `flows list` only for onboarding/architecture tasks, because the assistant can then choose to run `flows build` first if needed.

When flow artifact is provided:

- top flows are the three highest-criticality flow names.
- if changed files are provided, prefer F8 affected flow names for `flowsAffected`.

### CLI And Runtime

Public CLI:

```text
graphify minimal-context --task "review PR" --graph .graphify/graph.json
graphify minimal-context --files src/a.ts --flows .graphify/flows.json
graphify minimal-context --base main --head HEAD
graphify minimal-context --json
```

Skill runtime:

```text
graphify-skill-runtime minimal-context --graph <path> [--task <text>] [--files <csv>] [--flows <path>]
```

Runtime does not auto-detect git changes; public CLI may use the same changed-file discovery as F6 when no files are passed.

### F4 Test Matrix

Port/synthesize:

- returns graph stats summary and `risk=unknown` with no changed files.
- review task suggests `detect-changes`, `affected-flows`, `review-context`.
- debug task suggests `summary`, `query`, `flows get`.
- refactor task suggests `review-context`, `detect-changes`, `recommend-commits`.
- onboard/architecture task suggests `summary`, `flows list`, `path`.
- changed files invoke F6 risk and key entities.
- no `flows.json` sets `flowsAvailable=false`.
- flow artifact exposes top three critical flows.
- serialized JSON length stays below 800 words in fixture tests.
- CLI/runtime emit the same implementation.

## F10 Skills And LLM Review Workflow

### CRG Source Contract

F10 ports the agent workflow guidance from CRG rather than a storage primitive:

- `code-review-graph CLAUDE.md` requires the first tool call to be `get_minimal_context`.
- `docs/LLM-OPTIMIZED-REFERENCE.md` targets `<=5` graph tool calls and `<=800` graph-context tokens.
- `skills/review-delta/SKILL.md` and `skills/review-pr/SKILL.md` expand only after the minimal context indicates risk or impact.
- `code_review_graph/prompts.py` and `code_review_graph/skills.py` separate orientation, detection, expansion, and final review steps.

### Graphify Target

Distributed Graphify skills must keep existing build/update/query behavior intact, but review-oriented workflows start with:

```text
graphify minimal-context --task "review PR" --graph .graphify/graph.json
```

Codex-specific skills must spell the user-facing trigger as `$graphify`, not `/graphify`, while shell examples can still use `graphify`.

### Workflow States

The review workflow has five states:

- orient: run `minimal-context` first, confirm graph freshness, and read the compact route.
- detect: run `detect-changes` when files, refs, or a diff need risk scoring.
- expand flows: run `flows build` if `.graphify/flows.json` is missing and flow expansion is needed, then `affected-flows`.
- expand snippets: run `review-context` only for risky or impacted files that need source snippets or radius detail.
- final review: produce findings from graph evidence plus source diff, explicitly noting gaps when graph data is stale or incomplete.

### CRG Tool Mapping

```text
get_minimal_context -> graphify minimal-context
detect_changes      -> graphify detect-changes
get_affected_flows  -> graphify affected-flows
get_review_context  -> graphify review-context
```

### Stale And Dirty State

Skills must warn before relying on review output when `.graphify/needs_update` exists or `.graphify/branch.json` has `stale=true`.

Dirty worktree handling stays advisory: the skill may warn when the worktree is dirty, but Graphify commands must not mutate git state. Explicit `--files`, `--base`, `--head`, or `--staged` inputs take precedence over unrelated dirty files.

### MCP/Serve Boundary

Do not add MCP prompt/tool parity for F10 until CLI and skill-runtime behavior is stable. If MCP parity is added later, it must call the same implementation and preserve the same workflow states.

### F10 Test Matrix

Port/synthesize:

- every distributed skill mentions `minimal-context`.
- every distributed skill states it is the first review call.
- every distributed skill maps the follow-up chain to `detect-changes`, `affected-flows`, and `review-context`.
- skills preserve existing review-analysis, review-eval, review-delta, recommend-commits, build, update, query, summary, path, and explain workflows.
- skills keep stale graph warnings and dirty worktree behavior explicit.
- skills mention the CRG budgets: `<=5 graph tool calls` and `<=800` graph-context tokens.

## F4-F12 Spec Skeleton

F4 minimal context must be implemented after F7, F8, F5, and F6. It will combine graph stats, changed-risk summary, top communities, affected flows, and next tool suggestions.

F5 review context must consume `ReviewGraphStoreLike` and preserve existing `review-analysis` outputs while adding CRG-compatible `detail_level=minimal|standard` and source snippet caps.

F6 detect changes must port CRG `_SAFE_GIT_REF`, unified-diff parsing, line-range node mapping, and risk scoring factors: flow participation, cross-community callers, test coverage, security sensitivity, and caller count.

F7 flows must port CRG entry-point detection, forward BFS over `CALLS`, test exclusion, max depth, trivial-flow skip, and criticality weights.

F8 affected flows must map changed files to node IDs, find flows containing those nodes, and sort affected flows by criticality.

F9 test-porting applies before runtime code for every feature.

F10 skills must make minimal context the first review call after the CLI/runtime contract is stable.

F11 report/wiki/HTML enrichment must render only grounded flow/review data and must keep existing Graphify report/wiki sections intact.

F12 benchmarks must use deterministic local fixtures and must label token metrics as estimates unless backed by actual model usage.

## F11 Report, Wiki, And HTML Enrichment After Flows

### CRG Source Contract

F11 ports CRG output enrichment patterns:

- `code_review_graph/wiki.py` adds execution-flow context to generated wiki pages.
- `code_review_graph/visualization.py` supports flow highlighting in graph views.
- `code_review_graph/tools/build.py` precomputes summaries so agents do not repeatedly traverse the same graph.
- `tests/test_wiki.py` protects expected sections, links, idempotence, empty graph behavior, and slug collision behavior.

### Graphify Target

Graphify report/wiki output remains unchanged unless flow or review artifacts are explicitly passed to the renderer. No placeholder flow/review section is rendered without grounded data.

Report enrichment may include:

- top critical execution flows from a `ReviewFlowArtifact`.
- affected flows for a current diff from an `AffectedFlowsResult`.
- high-risk nodes from the F6 risk analysis result or a normalized caller-provided list.
- test gaps from the F6 risk analysis result or a normalized caller-provided list.

Wiki enrichment may include:

- execution flows passing through each community.
- generated flow pages with flow steps, criticality, files, and linked communities.
- community-to-flow links using wiki links.

### Slug And Link Compatibility

Keep current wiki links unchanged when page titles are unique. If two generated pages normalize to the same filename, keep the first filename and suffix later files with `_2`, `_3`, etc. Links to suffixed pages must use wiki alias syntax:

```text
[[Core]]
[[Core_2|Core]]
```

This matches CRG-style unique slug suffixing while preserving existing Graphify links in the common no-collision case.

### HTML Boundary

Flow highlighting is deferred unless the current HTML exporter can support it without a renderer rewrite. F11 must not block report/wiki flow context on HTML work. If implemented later, HTML flow highlighting must be optional, non-blocking, and disabled for oversized graphs using the existing large-graph safety posture.

### F11 Test Matrix

Port/synthesize:

- report omits flow sections when no flow/review data exists.
- report includes top critical flows when a flow artifact is passed.
- report includes affected flows, high-risk nodes, and test gaps only when those grounded lists exist.
- wiki omits flow sections when no flow artifact exists.
- wiki community pages list flows through the community when a flow artifact is passed.
- wiki generates flow pages with steps/files/criticality.
- wiki index keeps existing community links and adds flow links only when flow pages exist.
- duplicate normalized titles generate suffixed filenames and alias links.
- empty graph/wiki behavior stays valid.

## Compatibility Rules

- No behavior changes without a new command or explicit option unless current behavior is backward-compatible.
- No real client, partner, project, proprietary ontology, or private dataset examples.
- No MCP prompt/tool parity before CLI/runtime behavior is tested.
- No generated report/wiki claims about flows unless F7/F8 artifacts exist.
- Stale `.graphify` state must produce a warning before review conclusions are trusted.
