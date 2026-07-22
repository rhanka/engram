# main

## Objective

- [x] Advance Track leaf `01KW89F63YJXN551TEXZCE2ZHB` with the highest coherent T5 slice: a provider-neutral temporal `queryWindow` port plus a Postgres implementation.
- [x] Preserve the shipped temporal representation: `t` is epoch-ms start, missing `t_end` is open-ended, and `t_end === t` is a point.
- [x] Deliver T6 as a read-only **temporal graph recall** surface: `recall --as-of` delegates to `queryWindow(t,t)` for a configured capable store, otherwise filters `graph.json` deterministically.
- [x] Preserve configured-store failure/capability visibility, configured namespace isolation, unverified provenance attributes, and distinct file/store snapshot disclosure.
- [x] Keep MemoryNote/authored-memory, persona policy, h2a knowledge envelopes, pagination, namespace selection, and non-Postgres store adapters explicitly pending.

## Scope / Guardrails

- [x] Keep `.graphify/graph.json` as source of truth and GraphStore backends as opt-in mirrors.
- [x] Keep temporal membership provider-neutral: inclusive overlap, untimed/malformed records excluded, namespace parameterized, and node/edge membership evaluated independently.
- [x] Preserve unrelated dirty Studio, graph, Track, remote-job, and golden-output work; never reset, clean, publish, or stage it.

## Branch Scope Boundaries

**Allowed Paths (implementation scope)**

  - `BRANCH.md`
  - `spec/SPEC_AGENTSTATS_TIMEORIENTED.md`
  - `src/storage/types.ts`
  - `src/storage/postgres.ts`
  - `src/temporal-recall.ts`
  - `src/cli.ts`
  - `src/index.ts`
  - `tests/storage-postgres-time-window.test.ts`
  - `tests/temporal-recall.test.ts`
  - `tests/cli-temporal-recall.test.ts`

**Forbidden Paths**

  - `src/storage/vector/**`
  - `src/llm-mesh-bridge.ts`
  - `package.json`
  - `**/package-lock.json`
  - `UPSTREAM_GAP.md`
  - `spec/SPEC_EVOL_WP6_PLATFORM_PARITY.md`
  - `studio/**`
  - other GraphStore adapters, authored-memory/persona write commands, h2a product envelopes, and npm publication

**Conditional Paths**

  - `.track/**` — BR05-EX1: Track CLI writes/imports only from this designated main checkout; preserve the pre-existing log tail.
  - `.graphify/graph.json` — BR05-EX2: required `npx graphify hook-rebuild` only; preserve pre-existing changes.
  - `.graphify/GRAPH_REPORT.md` — BR05-EX2: required `npx graphify hook-rebuild` only; preserve pre-existing changes.

## Plan / TODO

- [x] **Lot 0 - Contract, Plan, And Track**
  - [x] Reconcile the draft spec with shipped T0/T2 semantics: open-ended missing `t_end`, explicit point `t_end === t`, inclusive overlap, malformed-span exclusion, independent edge membership.
  - [x] Record two independent adversarial reviews and the WP5/WP6 h2a scope boundary.
  - [x] Import this plan and mark the existing Knowledge-time leaf in progress without claiming T6 or h2a knowledge completion.
  - [x] Gate: `track validate`, current-main branch/scope checks, and no changes outside Allowed/Conditional paths attributable to this slice.

- [x] **Lot 1 - Temporal Store Port And Postgres**
  - [x] Add optional `capabilities.queryWindow` plus typed, flattened provider-neutral time-window node/edge results and namespace-only options.
  - [x] Implement Postgres `queryWindow(fromMs, toMs, options)` with finite ordered bounds, parameterized namespace, safe JSONB numeric expressions, and inclusive open-span overlap.
  - [x] Add safe numeric expression indexes for `t` and `t_end` on both node and edge mirrors without migrating or reinterpreting stored props.
  - [x] Add a fake-driver round-trip suite for boundaries, open spans, points, malformed/untimed exclusion, namespace isolation, canonical records, capability pairing, schema qualification, parameterization, and `graphWindow` coexistence.
  - [x] Run focused storage tests, `npm run lint`, `npm run build`, harness verification, two-peer consensus review, and `npx graphify hook-rebuild`.
  - [x] Record exact test/build evidence in Track while leaving the parent leaf in progress for T6, h2a knowledge, non-Postgres adapters, and pagination.

- [x] **Lot 2 - T6 Read-Only Temporal Graph Recall**
  - [x] Specify `graphify.temporal-recall/v1`, strict epoch-ms / timezone-explicit ISO parsing, source selection, deterministic ordering, and unpaged/snapshot disclosures.
  - [x] Add a provider-neutral `recallAsOf` API and `graphify recall --as-of <timestamp>` CLI; configured stores must expose the T5 capability/method pair and receive no caller-controlled namespace override.
  - [x] Add the pure `graph.json` overlap fallback only for the no-store-configured path, preserving pass-through attributes/provenance without asserting trust or induced-subgraph closure.
  - [x] Test inclusive boundaries, points, open spans, malformed/inverted exclusion, independent edges, deterministic sorting, timestamp parsing, file/store selection, configured namespace use, capability/error/no-fallback behavior, JSON purity, and human rendering.
  - [x] Run focused T5/T6 tests, lint, build, harness verification, two-peer consensus review, and `npx graphify hook-rebuild`.
  - [x] Record exact evidence in Track; leave the parent leaf in progress for authored-memory/persona policy, a versioned h2a knowledge contract, pagination, namespace authorization, and other backends.

## Feedback Loop

- [ ] BLOCKER: any requested change to WP6-owned vector/LLM/package/spec paths requires coordination with `codex:graphify:46788d039b48` before editing.
- [ ] BLOCKER: a real Postgres live round-trip remains gated on `GRAPHIFY_TEST_POSTGRES_URL`; the driver-injected suite is the local authority when that environment is absent.
- [ ] HUMAN GATE: authored/personal memory requires owner/data-controller approval for privacy, access, retention, deletion, authorship, and persona semantics plus a ratified versioned h2a body contract.
- [ ] HUMAN GATE: exposing caller-selected namespaces or cross-workspace results requires consumer-owner authorization design; T6 reads only the selected store's configured namespace.
- [ ] BLOCKER: any npm publish, merge, or remote push requires separate owner authorization and is outside this task.
