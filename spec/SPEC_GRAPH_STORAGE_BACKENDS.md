# SPEC_GRAPH_STORAGE_BACKENDS

## Status

- Product: Graphify graph storage target clarification
- Scope: `.graphify` portable graph storage, live/query mirrors, backend roadmap
- Source of truth decision: `.graphify/graph.json` remains canonical
- Mirror decision: Neo4j, Spanner Graph, SQLite, Memgraph and future stores are opt-in mirrors
- Implementation reference: `spec/SPEC_STORAGE_BACKENDS.md`, `src/storage/*`, `tests/storage-*.test.ts`
- Non-scope: renderer, header, existing tests, and any default behavior change

This document clarifies the target architecture for graph storage backends. It is not a second implementation spec that replaces `SPEC_STORAGE_BACKENDS.md`; it is the decision matrix and UAT risk register for choosing what "storage backend" means in Graphify.

The core decision is conservative: Graphify is file-first. The portable `.graphify/` directory is the source of truth, the interchange format, and the default query substrate. External databases are mirrors and query accelerators. They receive pushed projections of `.graphify/graph.json`; they do not own the graph, and they are not pulled back into Graphify in v1.

## Current Observed Baseline

- `.graphify/graph.json` is written by the build/export path and embeds `topology_signature`.
- `src/storage/types.ts` defines a narrow `GraphStore` port.
- `src/storage/file.ts` implements a reference `file` store that writes canonical graph JSON.
- `src/storage/neo4j.ts` implements a Neo4j mirror with dynamic driver loading, batching, namespace properties, `GraphifyMeta`, and capability-gated query/clear.
- `src/storage/config.ts` resolves non-secret config from CLI/env/YAML and reads secrets from env only.
- `tests/helpers/graph-store-contract.ts` defines shared backend contract behavior.
- `tests/storage-import-guard.test.ts` guards against static/eager driver imports.
- `graphify export neo4j` exists as a file artifact command; an official `graphify store ...` CLI group is still a productization step.

## Architecture Matrix

| Backend | Role | Source of truth | Minimal API | Transaction target | Schema/versioning | Activation | Main UAT risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `.graphify/graph.json` | Canonical portable graph artifact | Yes | Read/write canonical JSON; existing `query`, `path`, `explain`, exports | Local write after successful build; backend failures must never mutate it | Current implicit graph schema; absent version means v0; add explicit graph schema version only compatibly | Always default | Accidental behavior change, non-portable paths, corrupt/partial write |
| `.graphify/` artifact tree | Portable workspace state and reports | Yes for artifacts, local for lifecycle files | Direct file layout via `resolveGraphifyPaths()`; no VFS | File-level writes only | Artifact schemas remain per-file; local lifecycle files excluded from portability checks | Always default | Treating local state such as `store-state.json` as portable truth |
| `file` GraphStore | Reference mirror and contract-test backend | No | `pushGraph`, `readSnapshotMeta`, force-gated `clear` | Rewrite target file; target should move toward temp+rename for atomic visibility | Same as canonical JSON; mirror metadata comes from `topology_signature` | Explicit store id or test fixture | Confusing file mirror with the canonical `.graphify/graph.json` |
| Neo4j | Live Cypher query mirror | No | `verifyConnection`, `pushGraph`, `readSnapshotMeta`, `query`, force-gated `clear`, `close` | Batched upserts; `GraphifyMeta` stamped last; P1 should use managed transactions or generation swap for replace | Sanitized labels/relation types, `namespace` property, `GraphifyMeta`; projection version absent means v0 | Explicit config/CLI/env; optional driver | Partial push, namespace collision, Cypher injection, credential leak |
| Spanner Graph | Schema-first enterprise GQL mirror | No | P1/P2: export DDL/DML first, then live `GraphStore` with ADC | Mutations must respect Spanner transaction and mutation limits; large pushes need chunked generations and active-snapshot pointer | Tables for nodes, edges, metadata plus `CREATE PROPERTY GRAPH`; explicit schema and projection versions required before live adapter | Explicit config/env; optional driver later | Overcommitting live adapter before emulator-backed schema proves out |
| SQLite | Local SQL/analytics mirror | No | Future `GraphStore`; likely no live network; optional query | Single local DB transaction per push where feasible; WAL recommended | `graphify_nodes`, `graphify_edges`, `graphify_meta` tables with projection version | Future explicit store id | Reopening the deferred "SQLite as primary store" decision |
| Memgraph | Bolt/Cypher mirror similar to Neo4j | No | Future `GraphStore`; likely reuse Neo4j projection with separate factory | Same as Neo4j unless driver/server semantics differ | Same projection intent as Neo4j, separate adapter schema version | Future explicit store id | Assuming Neo4j compatibility without contract/live tests |
| Other backends | Adapter slot | No | Must implement `GraphStore` and pass contract tests | Backend-specific, but `GraphifyMeta`-last and idempotent push are mandatory | Must declare graph schema, projection version, and adapter schema version | Explicit only | Backend-specific semantics leaking into core |

## Target Storage Model

### Canonical graph

The canonical graph remains the portable JSON artifact:

- `directed`
- `multigraph`
- `graph` metadata block
- `topology_signature`
- `nodes`
- `links`
- `hyperedges`

Existing files without an explicit schema version are valid and are treated as graph schema v0. A future explicit version must be additive and backward-compatible for readers. Recommended target:

```json
{
  "schema_version": 1,
  "directed": true,
  "multigraph": false,
  "graph": {
    "community_labels": {},
    "built_from_commit": "optional"
  },
  "topology_signature": "n=...;e=...;...",
  "nodes": [],
  "links": [],
  "hyperedges": []
}
```

Adding `schema_version` is not required for P0 if it risks breaking downstream consumers. The required rule is that readers accept both absent/v0 and explicit/v1.

### Mirrors

A mirror is a pushed projection of the canonical graph into another storage engine.

- File-to-backend only in v1.
- No pull, no bidirectional sync, no backend-owned mutation.
- Every pushed record is scoped by `namespace`.
- `mode: "merge"` is idempotent upsert.
- `mode: "replace"` clears or swaps one namespace, never the canonical file graph.
- Snapshot metadata is written after graph data so status can detect incomplete or stale mirrors.

### Store status

Mirror freshness is determined by comparing canonical `topology_signature` with backend metadata:

- `never-pushed`: backend metadata is missing.
- `in-sync`: backend metadata signature equals file signature.
- `stale`: backend metadata signature differs from file signature.
- `unknown`: backend cannot read metadata or lacks capability.

Freshness is advisory. It must not block local query/build/export workflows.

## Minimal API

The API should stay narrow enough that each backend is an adapter, not a second storage engine inside core Graphify.

```ts
export interface GraphStoreCapabilities {
  push: true;
  query: boolean;
  clear: boolean;
  snapshotMeta: boolean;
}

export interface GraphPushOptions {
  mode?: "merge" | "replace";
  batchSize?: number;
  dryRun?: boolean;
  namespace?: string;
}

export interface GraphPushResult {
  nodes: number;
  edges: number;
  warnings: string[];
  durationMs: number;
}

export interface GraphStoreSnapshotMeta {
  topologySignature: string;
  pushedAt: string;
  toolVersion: string;
  graphSchemaVersion?: number;
  projectionVersion?: number;
  adapterSchemaVersion?: number;
}

export interface GraphStore {
  readonly id: string;
  readonly capabilities: GraphStoreCapabilities;
  verifyConnection(): Promise<void>;
  pushGraph(
    G: Graph,
    communities: Map<number, string[]>,
    options?: GraphPushOptions,
  ): Promise<GraphPushResult>;
  readSnapshotMeta(): Promise<GraphStoreSnapshotMeta | undefined>;
  clear?(namespace?: string): Promise<void>;
  query?(statement: string): Promise<unknown>;
  close(): Promise<void>;
}
```

API rules:

- `pushGraph` is the only mandatory write method.
- `query` and `clear` are capability-gated. Callers check `capabilities` before connecting.
- `dryRun` returns the same counts and warnings as a real push without writing.
- `close` is idempotent.
- Destructive `clear` is force-gated at the concrete adapter boundary even if the base port only exposes `namespace`.
- Driver packages are optional and dynamically imported only when resolving or directly creating a live store.
- Core owns graph loading, namespace defaults, status comparison, and output redaction.
- Adapters own sessions, batching, type mapping, retryable errors, and backend schema details.

## Transactional Constraints

### Global constraints

- The canonical `.graphify/graph.json` is never modified by mirror push, query, clear, or backend failure.
- Multi-backend pushes are independent units. There is no distributed transaction across mirrors.
- A successful push means graph rows and metadata for the target namespace were written according to that backend's durability model.
- `GraphifyMeta` or equivalent metadata is stamped last. If graph rows exist without matching metadata, `store status` must report stale or unknown, not in-sync.
- Push failures preserve previous local bookkeeping. A failed push must not update `.graphify/store-state.json`.
- Secrets are env/ADC-only and must not appear in YAML, `.graphify/`, metadata rows, warnings, or command output.

### File constraints

- Canonical file writes keep the existing shrink guard behavior unless an explicit force path is used.
- P1 should make file mirror writes atomic by writing a temp file in the same directory, fsyncing where practical, and renaming into place.
- File mirror `clear` deletes only the mirror target and requires force. It never deletes canonical `.graphify/graph.json`.

### Neo4j constraints

- Node identity is `(namespace, id)`.
- Edge identity is `(namespace, source, target, relation)` unless a future graph schema introduces stable edge IDs.
- Labels and relationship types are sanitized before Cypher interpolation.
- Properties are passed through driver parameters.
- `merge` uses batched `UNWIND` upserts.
- `replace` must avoid exposing an empty or half-loaded namespace where possible. P0 can clear then reload with metadata-last status detection; P1 should prefer a generation/snapshot swap or a managed transaction for smaller graphs.
- Large pushes must tolerate partial failure by leaving metadata stale and providing enough warning context to retry.

### Spanner Graph constraints

- Spanner is schema-first. The first deliverable should be DDL/DML export artifacts before a live adapter.
- Tables must include namespace and snapshot/generation fields from day one.
- Large graph pushes cannot assume one transaction fits Spanner mutation limits.
- Live replace should load a new generation, write metadata for that generation, then switch an active generation pointer.
- Authentication uses Application Default Credentials. Password-like config keys are invalid.

### SQLite and Memgraph constraints

- SQLite remains a mirror. It must not become the default primary graph store under this architecture.
- SQLite pushes should use one transaction when graph size permits; otherwise use chunked writes with metadata-last status detection.
- Memgraph must have a separate adapter id and contract/live tests even if it shares most Cypher generation with Neo4j.

## Schema And Versioning

Versioning is required at three layers:

| Layer | Field | Owner | Compatibility rule |
| --- | --- | --- | --- |
| Canonical graph JSON | `schema_version` | Core exporter/reader | Absent means v0; readers accept v0 and v1 |
| Mirror projection | `projection_version` | Core storage layer | Absent means v0; status can still compare signatures |
| Backend schema | `adapter_schema_version` | Adapter | Adapter refuses unsafe writes when schema is newer than supported |

Recommended metadata record:

```json
{
  "namespace": "my-project",
  "topology_signature": "n=...;e=...;...",
  "graph_schema_version": 1,
  "projection_version": 1,
  "adapter_schema_version": 1,
  "pushed_at": "2026-06-08T00:00:00.000Z",
  "tool_version": "0.10.0",
  "build_commit": "optional"
}
```

Neo4j representation:

- `(:GraphifyMeta {namespace})`
- Node labels derived from node type/file type after sanitization.
- All graph nodes include `id` and `namespace`.
- All graph edges include `namespace`.
- Optional future edge IDs should be added before supporting multigraph mirrors.

Spanner representation:

- `graphify_nodes(namespace, snapshot_id, id, label, node_type, source_file, props_json, community, ...)`
- `graphify_edges(namespace, snapshot_id, source_id, target_id, relation, props_json, confidence, ...)`
- `graphify_meta(namespace, active_snapshot_id, topology_signature, graph_schema_version, projection_version, adapter_schema_version, pushed_at, tool_version, build_commit)`
- `CREATE PROPERTY GRAPH graphify_graph ...` projects the node and edge tables.

SQLite representation:

- Same logical tables as Spanner, adapted to SQLite types and JSON columns.
- Optional indexes on `(namespace, id)`, `(namespace, source_id)`, `(namespace, target_id)`, and `(namespace, relation)`.

## P0/P1/P2 Plan

### P0 - Lock the storage target

Expected outcome: safe, documented, file-first architecture with no default behavior change.

- Keep `.graphify/graph.json` as the canonical graph.
- Treat every non-file engine as an opt-in mirror.
- Keep dynamic optional driver loading and import guards.
- Keep `GraphStore` small and contract-tested.
- Keep `file` as the reference backend and `neo4j` as the first live mirror.
- Do not ship Spanner live push in P0.
- Do not introduce pull or bidirectional sync.
- Do not alter renderer/header/test surfaces for this decision.

Acceptance:

- Existing no-storage Graphify workflows do not load backend drivers or read credentials.
- Contract tests pass for `file` and fake-driver Neo4j.
- Missing-driver errors are actionable.
- Secret-looking YAML keys fail validation.
- This target document and `SPEC_STORAGE_BACKENDS.md` agree on source-of-truth semantics.

### P1 - Productize mirrors

Expected outcome: users can operate mirrors through official commands and status.

- Add/freeze `graphify store push|status|clear|query`.
- Write `.graphify/store-state.json` as local lifecycle state with no secrets.
- Compare file `topology_signature` against backend metadata.
- Add explicit schema/projection/adapter version fields where compatible.
- Add safe namespace derivation and require explicit namespace for shared backends in docs/UAT.
- Harden Neo4j replace semantics with managed transactions or generation swap.
- Add gated live Neo4j UAT flow and document expected counts/status checks.
- Wire post-build push only as explicit `--push-store` or explicit `autoPush: true`.

Acceptance:

- `store status` reports `never-pushed`, `stale`, and `in-sync` correctly.
- Failed pushes leave previous status intact.
- `autoPush` warning never fails a successful local build unless user requested a hard explicit push.
- `clear` requires force and never touches canonical `.graphify/graph.json`.

### P2 - Expand backend coverage

Expected outcome: backend ecosystem expands without changing core architecture.

- Ship `graphify export spanner` DDL/DML artifacts first.
- Validate Spanner schema in emulator before live adapter.
- Add live Spanner adapter only after schema, generation swap, and mutation-limit behavior are proven.
- Evaluate SQLite as local analytics mirror, not primary storage.
- Evaluate Memgraph as separate Bolt/Cypher adapter with shared contract tests.
- Consider backend-specific query helpers only after the common `GraphStore` port stabilizes.

Acceptance:

- Spanner artifact export requires no network, no driver, no credentials.
- Spanner live tests are gated by emulator/live env and never required for default CI.
- New backends pass shared contract tests and import guards before being documented as supported.

## UAT Risks And Mitigations

| Risk | Failure mode | Mitigation | UAT check |
| --- | --- | --- | --- |
| Default behavior regression | Users without storage config see network/driver/credential side effects | Import guard, explicit activation only | Run baseline build/query with no storage config; assert no driver evaluation and no credential read |
| Canonical source confusion | Users expect Neo4j/Spanner to become primary graph store | CLI wording: "mirror", docs, no pull command | Push, mutate backend manually, rebuild/query from file; Graphify ignores backend mutation |
| Partial live push | Backend has some rows but stale/incomplete metadata | Metadata stamped last; status compares signatures; generation swap in P1 | Kill/fail push mid-run; `store status` is not `in-sync` |
| Namespace collision | Two repos/branches overwrite each other's mirror | Deterministic namespace plus explicit override; warn for shared backend docs | Push two namespaces to same backend; clear one; other remains |
| Credential leak | Password appears in YAML, `.graphify/`, metadata, or logs | Env/ADC only, validation errors, redaction | Add `password:` under `storage`; validation fails before connection |
| Cypher injection | Extracted labels/relations alter statements | Identifier sanitization and parameterized properties | Node type/relation contains quotes/backticks; statement text remains safe |
| Spanner transaction limits | Large graph cannot fit one mutation batch | Chunked generation load and active pointer | Emulator test with graph larger than one batch |
| Schema drift | Old CLI writes new backend schema or vice versa | Version fields and adapter compatibility checks | Backend metadata with newer adapter schema causes safe refusal |
| File corruption | Interrupted local mirror write leaves invalid JSON | P1 temp+rename for file mirrors; canonical graph shrink guard remains | Interrupt mirror write; canonical graph remains readable |
| Over-broad clear | Clear deletes wrong namespace or canonical file | Force-gated clear and namespace scoping | Clear namespace A; namespace B and `.graphify/graph.json` remain |
| CI flakiness | Live database required for unit pipeline | Fake-driver contract tests by default; live suites gated | Run unit suite with no Neo4j/Spanner services |

## Open Decisions

- Whether `schema_version` should be top-level or inside the `graph` metadata block when first emitted.
- Whether Neo4j `replace` should use one managed transaction, temp namespace/generation swap, or current clear-then-load for P1.
- Whether `store query` should accept raw backend language only, or later expose a small Graphify query abstraction.
- Whether Spanner v1 stops at export artifacts or includes an emulator-only experimental live adapter.
- Whether SQLite earns a scheduled milestone or remains an unscheduled local analytics mirror.

## Non-Negotiables

- `.graphify/graph.json` stays the canonical storage target.
- Backends are opt-in and additive.
- No backend driver is statically imported.
- No secrets in config files, graph artifacts, metadata rows, warnings, or logs.
- No backend failure can corrupt or block the portable graph unless the user explicitly requested that backend command.
- Future backends must pass the shared contract suite before being treated as supported.
