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

## Compatibility Rules

- No behavior changes without a new command or explicit option unless current behavior is backward-compatible.
- No real client, partner, project, proprietary ontology, or private dataset examples.
- No MCP prompt/tool parity before CLI/runtime behavior is tested.
- No generated report/wiki claims about flows unless F7/F8 artifacts exist.
- Stale `.graphify` state must produce a warning before review conclusions are trusted.
