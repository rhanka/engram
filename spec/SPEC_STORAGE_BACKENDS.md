# SPEC_STORAGE_BACKENDS

## Status

- Product: Graphify TypeScript port
- Scope: opt-in multi-backend graph mirrors over `.graphify/graph.json`
- Activation: explicit config, CLI flags, or environment variables only
- Default behavior: file-only; no driver loaded, no secret read, no network call
- Product decision (user, 2026-06-08): "offer ALL storage options" — additive only
- Delivery: PR1 is this spec; implementation follows the roadmap below
- CLI and config surfaces in this document are PROPOSED; they freeze at PR5

This spec defines an opt-in storage mirror layer for the Graphify knowledge graph. `.graphify/graph.json` remains the single source of truth and the absolute default. External graph backends — Neo4j first, Spanner Graph second, with the door open for SQLite and Memgraph — are mirrors: pushed projections of the file graph, never a source. The design mirrors the LLM execution ports (`SPEC_LLM_EXECUTION_PORTS.md`): a narrow port, optional adapters, explicit activation, and a strict no-op default.

## Problem

Graphify already serializes a complete graph to `.graphify/graph.json` and can emit a Cypher file through `graphify export neo4j` (`src/cli.ts:3663`). It also carries a legacy live push, `pushToNeo4j` (`src/export.ts:603`), exposed through the skill runtime `push-neo4j` command (`src/skill-runtime.ts:1446`). This surface has four problems:

- The live push issues one Cypher statement per node and per edge. It is unusable beyond a few thousand elements.
- There is no staleness model: nothing records what was pushed, when, or whether the backend still matches the current `graph.json`.
- `SPEC_GRAPHIFY.md` documented `--neo4j` / `--neo4j-push` build flags that were never implemented; the doc/code gap must be resolved.
- Users who want to query the graph at scale (Cypher, GQL, BI tooling) have no supported, contract-tested path, and each new backend would currently grow ad-hoc code in `src/export.ts`.

Without an explicit port, backend logic will leak into export, watch, skill-runtime and CLI code, and every backend will reimplement batching, sanitization, staleness and error handling differently.

## Goals

- Offer all storage options additively, behind one narrow `GraphStore` port.
- Keep `.graphify/graph.json` as the source of truth and the absolute default.
- Make every backend an opt-in mirror: pushed projection, never a source.
- Load drivers only on demand: every driver is an `optionalDependency` resolved through dynamic `import()`.
- Detect staleness by comparing the file graph `topology_signature` with backend snapshot metadata.
- Fail with actionable errors when a driver is missing.
- Ship shared contract tests so every backend behaves identically at the port boundary.
- Keep secrets out of YAML config, `.graphify/` artifacts, and command output.

## Non-Goals

This section is the architecture boundary. These exclusions are deliberate.

- **No artifact-store abstraction.** The `.graphify/` artifact store is NOT abstracted. There is no VFS or `ArtifactStore` interface; `resolveGraphifyPaths()` (`src/paths.ts`) stays intact. Reasons: the portable-artifacts contract assumes a real directory tree, roughly 150 call sites perform direct file I/O against `.graphify/`, and abstracting them would create a large, permanent divergence from upstream Python Graphify for no user-facing gain. Mirrors sit beside the file store; they do not replace it.
- **No pull or bidirectional sync in v1.** `graphify store pull` is reserved as a possible v2 surface and is NOT promised. Mutations follow the existing product rule (`SPEC_GRAPHIFY.md:111`): review decisions are expressed as validated patches against project-owned sources, Graphify rebuilds `graph.json`, and the mirror is re-pushed. A backend is never read back into the graph.
- **No resident backend.** Graphify does not gain a daemon, a server dependency, or a managed database.
- **No automatic push without explicit config.** `autoPush` defaults to `false` and only an explicit config block can enable it.
- **No secrets in YAML or in `.graphify/`.** Credentials are environment-only.
- **No default-path behavior change.** `$graphify`, builds, updates, hooks, watch, exports and queries are byte-identical when no store is configured.

## Compatibility Contract

Without explicit storage config:

- no backend driver is loaded or evaluated
- no secret or credential environment variable is read
- no network call is made
- `.graphify/graph.json` and every other artifact are unchanged

Every driver lives in `optionalDependencies` and is resolved through dynamic `import()` at the moment a store command runs. This is the existing pattern for `neo4j-driver` (`src/export.ts:603`) and `chokidar` (`src/watch.ts:450`); the storage layer generalizes it instead of inventing a new loading mechanism.

A hard guard backs the contract: importing `src/index.ts` must never evaluate `neo4j-driver` (or any other store driver). See Tests.

## Mirror Model

A mirror is a pushed projection of the file graph into one backend, identified by a backend id and a namespace.

- **Push-only (v1).** Data flows file → backend, never backend → file.
- **Namespace.** Each push targets a namespace (default: project-derived). Multiple projects or branches can share one backend instance without collisions.
- **Modes.**
  - `merge` (default): idempotent upsert of nodes and edges into the namespace.
  - `replace`: clear the namespace, then load the full projection.
- **Snapshot metadata.** Every push stamps the backend with a `GraphifyMeta` record so staleness is detectable later (see Staleness).

### Pushed Projection Contents

A push projects the loaded `graph.json` as-is:

- nodes with their scalar attributes (id, label, file_type, source_file, description when present)
- edges with relation type and provenance attributes (confidence: EXTRACTED / INFERRED / AMBIGUOUS, scores when available)
- community membership as a node attribute, derived from the same communities map the exporters already consume
- the `GraphifyMeta` snapshot record

Non-scalar attributes are dropped with a warning in `GraphPushResult.warnings`, matching the existing `pushToNeo4j` scalar filtering. The projection never enriches, dedupes or reinterprets the graph: a mirror is byte-faithful to what `graph.json` says, within the backend's type system.

### Namespace Derivation

When `--namespace` and config are silent, the namespace derives from the project directory name, normalized to a backend-safe identifier. The derivation is deterministic so repeated pushes from the same checkout target the same namespace. Branch- or worktree-scoped namespaces are an explicit user choice (`--namespace`), not an automatic behavior, to avoid silently multiplying mirror subgraphs.

## GraphStore Port

The TypeScript implementation exposes one narrow port. These signatures are normative for PR2:

```ts
export interface GraphStoreCapabilities {
  push: true;
  query: boolean;
  clear: boolean;
  snapshotMeta: boolean;
}

export interface GraphPushOptions {
  /** merge = idempotent upsert (default); replace = clear namespace then load */
  mode?: "merge" | "replace";
  /** statements batched per request; default 500 */
  batchSize?: number;
  /** plan and report without writing to the backend */
  dryRun?: boolean;
  /** target namespace; default derived from the project */
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

Port rules:

- `push` is the only mandatory capability. `query` and `clear` are capability-gated; CLI surfaces that need them check `capabilities` first and fail with a clear message instead of probing the backend.
- `pushGraph` with `mode: "merge"` must be idempotent: pushing the same graph twice produces the same backend state.
- `dryRun` must produce the same counts and warnings as a real push, without writes.
- Adapters own backend mechanics (sessions, batching, retries, type mapping). Core owns graph loading, namespace derivation, snapshot bookkeeping and reporting.

## Store Registry And Driver Loading

Stores register through a factory so that driver loading stays lazy and testable:

```ts
export interface GraphStoreFactory {
  readonly id: string;
  /** npm package resolved via dynamic import, e.g. "neo4j-driver" */
  readonly requiredPackage: string;
  create(config: GraphStoreConfig, deps?: StoreTestDeps): Promise<GraphStore>;
}
```

- The registry maps store ids (`file`, `neo4j`, later `spanner`, `sqlite`, `memgraph`) to factories.
- When the dynamic import of `requiredPackage` fails, the error is actionable and names the fix, matching the existing optional-dependency messages:
  `store 'neo4j' requires neo4j-driver. Run: npm install neo4j-driver`
- `StoreTestDeps` allows tests to inject a fake driver module instead of the real package, the same injection pattern the LLM execution ports use to keep provider SDKs out of unit tests. Production code never passes `deps`.
- `FileGraphStore` (id `file`) is the reference implementation: it "pushes" to a JSON file and implements every capability. It exists so the contract tests have a canonical, dependency-free implementation and so `dryRun`/staleness logic can be tested without any backend.

## Staleness And Snapshot Metadata

Mirrors drift. The product must detect drift cheaply, from both sides:

- **Backend side.** Every push writes a `GraphifyMeta` record into the backend (a node in Neo4j, a row in tabular backends) carrying `{namespace, topology_signature, pushed_at, tool_version}`. `readSnapshotMeta()` returns it.
- **File side.** `graph.json` already embeds `topology_signature` (computed in `src/export.ts:411` and written at serialization, `src/export.ts:490`). `graphify store status` compares the file signature with the backend `GraphifyMeta` and reports `in-sync`, `stale`, or `never-pushed`.
- **Local state.** Push bookkeeping is cached in `.graphify/store-state.json` — store id, namespace, last pushed signature and timestamp. It never contains a URI, user, password or any secret. The file is added to the `LOCAL_LIFECYCLE_FILES` contract in `src/portable-artifacts.ts` (line 25) so it is treated as local lifecycle state, exactly like `branch.json` and `worktree.json`, and never flagged as a portability issue nor committed.

Staleness is advisory: a stale mirror never blocks builds, queries or exports.

## CLI And Config Surface (PROPOSED)

This entire section is PROPOSED. The surface freezes at PR5, not before, and the Open Decisions section lists what can still change.

Commands:

```
graphify store push   [--store neo4j] [--uri bolt://...] [--mode merge|replace]
                      [--namespace my-project] [--batch-size 500] [--dry-run]
graphify store status [--store neo4j] [--namespace my-project]
graphify store clear  [--store neo4j] [--namespace my-project]
graphify store query  "<statement>"   # optional, capability-gated
```

- `store query` exists only for backends whose `capabilities.query` is `true`; otherwise the command fails with a capability message, no connection attempted.
- Build integration: `graphify <path> --push-store [neo4j]` pushes after a successful build. It is a per-invocation explicit opt-in, never a remembered default.

Environment variables:

- `GRAPHIFY_STORE` — default store id when `--store` is omitted
- `GRAPHIFY_NEO4J_URI`, `GRAPHIFY_NEO4J_USER`, `GRAPHIFY_NEO4J_PASSWORD`, `GRAPHIFY_NEO4J_DATABASE`
- `GRAPHIFY_SPANNER_PROJECT`, `GRAPHIFY_SPANNER_INSTANCE`, `GRAPHIFY_SPANNER_DATABASE` — Spanner authenticates through Application Default Credentials (ADC); there is no password variable by design

YAML config block (in `graphify.yaml` / `.graphify/config.yaml`):

```yaml
storage:
  mirrors:
    - backend: neo4j
      uri: bolt://localhost:7687
      user: neo4j
      database: graphs
      mode: merge
      autoPush: false
```

Config rules:

- Secrets in YAML are a validation error. A `password`, `token` or credential-looking key inside `storage:` fails `graphify profile validate` and any store command. Credentials are environment-only.
- `autoPush` defaults to `false`. Automatic push after builds happens only when a mirror explicitly sets `autoPush: true`; no flag, env var or installer may enable it implicitly.
- CLI flags override env vars, which override YAML values.
- A configured mirror with an unreachable backend degrades to a warning on `autoPush` and a hard error on explicit `store push`.

## Neo4j Adapter (v1)

The first real backend, built by extracting and fixing the legacy push:

- `pushToNeo4j` (`src/export.ts:603`) moves to `src/storage/neo4j.ts` as the `neo4j` `GraphStore`.
- **Batch UNWIND.** The current implementation issues one query per node and per edge, which is unusable beyond a few thousand elements. The adapter batches `UNWIND $rows ...` statements (default `batchSize` 500) for nodes and per-relation edge groups.
- **Sanitization.** Labels and relationship types are interpolated into Cypher and must pass through the existing `neo4jLabel` sanitizer (`src/export.ts:576`) to prevent Cypher injection from extracted file types or relation names. Property values go through driver parameters, never string interpolation.
- **Merge semantics.** `mode: "merge"` uses `MERGE` keyed on the node id within the namespace; `mode: "replace"` deletes the namespace subgraph first.
- **Compatibility wrapper.** The public `pushToNeo4j` export is preserved as a thin wrapper over the new adapter — soft-deprecated, documented as legacy, and locked by `tests/public-api.test.ts:67`. Removing it is out of scope.
- **Skill runtime.** The `push-neo4j` runtime command (`src/skill-runtime.ts:1446`) currently requires `--password` on the command line; it migrates to reading `GRAPHIFY_NEO4J_PASSWORD` from the environment, with the flag kept temporarily as a deprecated fallback.

## Spanner Graph (Study)

Spanner Graph is schema-first; the adapter design is staged accordingly.

- **Schema.** Two tables, `graphify_nodes` and `graphify_edges` (interleaved or foreign-keyed on node ids, namespaced), plus a `CREATE PROPERTY GRAPH` statement projecting them as a queryable graph.
- **Writes.** Batched `insertOrUpdate` mutations map directly onto the `merge` mode; `replace` deletes the namespace rows first.
- **Reads.** GQL statements run through `database.run()`; `capabilities.query` is `true` once the live adapter lands.
- **v1 scope: export artifacts only.** `graphify export spanner` writes pure-file DDL/DML artifacts (schema statements plus batched mutation files) under `.graphify/`. Zero driver, zero network, zero credentials — same product shape as `graphify export neo4j` producing `cypher.txt`.
- **v2 scope: live adapter.** A `spanner` `GraphStore` using `@google-cloud/spanner` as an optionalDependency, ADC auth, validated against the Spanner emulator first. Building it is a separate decision taken after PR7 (see Roadmap).

## Future Backends (Door Open)

The port is designed so additional mirrors are adapters, not architecture changes:

- **SQLite.** A local, dependency-light mirror for SQL tooling over the graph. It remains a *mirror* under this spec; the long-deferred "SQLite backend" idea from `SPEC_GRAPHIFY.md` (SQLite as a primary store) stays deferred and is not revived here.
- **Memgraph.** Speaks Bolt and Cypher; expected to reuse most of the Neo4j adapter with a distinct store id and its own contract-test run.

Neither backend is scheduled. Each requires only: a `GraphStoreFactory`, an optionalDependency, passing `describeGraphStoreContract()`, and a gated live suite.

## Secret Handling

Credentials can be supplied by:

- environment variables (`GRAPHIFY_NEO4J_*`; ADC for Spanner)
- shell session exports
- an uncommitted local `.env` loaded by the user's shell, not by Graphify

Secrets must not be:

- written in the `storage:` YAML block (validation error)
- written to `.graphify/`, including `store-state.json`
- embedded in `GraphifyMeta` records pushed to backends
- included in reports or `GraphPushResult`
- printed in command output, including error messages

`store status` and push reports may record: store id, namespace, counts, durations, topology signatures, timestamps and tool versions. They may not record URIs with embedded credentials; URIs are redacted to scheme and host when echoed.

## Error Behavior

- No storage config: store commands explain that no store is configured; nothing else changes.
- Missing driver: actionable install message (see Store Registry), no partial loading.
- Missing credentials for an explicitly requested store: hard preflight error before any connection.
- Backend errors during push: the push aborts with the backend error, `store-state.json` keeps the previous snapshot, and the file graph is untouched.
- `clear` on a store without the capability, or `query` without the capability: capability error, no connection attempted.

## Tests

- **Unit (driver-injected).** Adapters are tested with fake drivers through `StoreTestDeps`, capturing emitted statements: batch UNWIND shapes, sanitized labels, merge vs replace statements, GraphifyMeta stamping, dry-run short-circuit.
- **Shared contract tests.** A `describeGraphStoreContract()` suite runs against `FileGraphStore` and an `InMemoryGraphStore`: idempotent merge, replace clears the namespace, dryRun makes no writes, snapshot meta round-trip, capability gating. Every future backend must pass the same suite.
- **Gated live suites.** Real-backend tests are skip-by-default and activate only with `GRAPHIFY_TEST_NEO4J_URI` (Neo4j) or `SPANNER_EMULATOR_HOST` (Spanner emulator). CI does not require them.
- **Import guard.** A test asserts that importing `src/index.ts` never evaluates `neo4j-driver` (or any store driver). This makes the Compatibility Contract enforceable instead of aspirational.
- **Config validation.** Secrets in the `storage:` YAML block are rejected; `autoPush` requires an explicit mirror entry.

## UAT

- Run baseline `$graphify .` with no storage config and verify no driver loading, no credential reads, and an unchanged `.graphify/` tree (modulo normal build outputs).
- Run `graphify store push --store neo4j --dry-run` without `neo4j-driver` installed and verify the actionable install message.
- Push a real graph to a local Neo4j, re-push in `merge` mode, and verify node/edge counts are stable (idempotency).
- Mutate the corpus, rebuild, run `graphify store status`, and verify the mirror is reported `stale`; re-push and verify `in-sync`.
- Verify `.graphify/store-state.json` contains no URI, user or password, and that `graphify portable-check .graphify` treats it as local lifecycle state.
- Put a `password:` key in the `storage:` YAML block and verify validation fails before any connection.

## Delivery Roadmap

Small PRs, one concern each:

1. **PR1 — this spec.** Docs only: `SPEC_STORAGE_BACKENDS.md`, `SPEC_GRAPHIFY.md` amendments, `UPSTREAM_GAP.md` divergence entry.
2. **PR2 — core port and contract.** `GraphStore` types, registry, `FileGraphStore`, `InMemoryGraphStore`, `describeGraphStoreContract()`, import guard.
3. **PR3 — Neo4j adapter.** `src/storage/neo4j.ts` extraction, batch UNWIND, sanitization, compat wrapper, driver-injected tests.
4. **PR4 — config.** `storage:` YAML block, env resolution, secret-in-YAML validation error, `store-state.json` plus `LOCAL_LIFECYCLE_FILES` entry.
5. **PR5 — CLI.** `graphify store push|status|clear` (+ capability-gated `query`), `--push-store`. **The CLI and config surface freezes here.**
6. **PR6 — build integration.** Post-build push wiring, `autoPush` honoring, staleness reporting in build output.
7. **PR7 — Spanner export.** `graphify export spanner` DDL/DML artifacts, file-only. **[DELIVERED]** — `toSpanner()` in `src/export.ts`, CLI `export spanner` in `src/cli.ts`, public export from `src/index.ts`, tests in `tests/export-spanner.test.ts`.
8. **PR8 — Spanner live adapter.** Decision taken post-PR7 after emulator validation; not committed in advance.

## Open Decisions (Pending User Ack)

Five points are PROPOSED, not frozen. The freeze happens at PR5 only; until then each default below can be reversed without breaking shipped surface.

1. **CLI group naming.** PROPOSED: a new `graphify store` command group. Alternative: extend the existing `graphify export` group (e.g. `export neo4j --push`). Default rationale: export produces artifacts, store talks to live backends; conflating them blurs the no-network contract of `export`.
2. **Mirror positioning.** PROPOSED: push-only mirrors in v1, `store pull` reserved and unpromised for v2. Alternative: commit to a pull surface now. Default rationale: pull contradicts the patch-and-rebuild mutation rule (`SPEC_GRAPHIFY.md:111`) and would need its own reconciliation spec.
3. **Config schema and secret policy.** PROPOSED: `storage.mirrors[]` YAML block with env-only secrets and a validation error on YAML credentials. Alternative: allow `env:NAME` indirection inside the block, as `llm_execution` does. Default rationale: start stricter; relaxing later is compatible, tightening later is not.
4. **CI for live Neo4j.** PROPOSED: live Neo4j suites are manual-only (developer-run with `GRAPHIFY_TEST_NEO4J_URI`). Alternative: a GitHub Actions service container running Neo4j on a nightly or labeled workflow. Default rationale: keep CI hermetic until the adapter stabilizes.
5. **Spanner v1 scope.** DECIDED (PR7): v1 ships `graphify export spanner` artifacts only (DDL + DML files, no driver). Live adapter remains a post-PR7 decision (PR8).
