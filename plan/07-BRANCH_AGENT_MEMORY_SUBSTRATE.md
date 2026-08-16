# Agent-Memory & Knowledge Substrate (graphify-neutral)

## Objective

- [ ] Realize graphify's standalone, consumer-neutral memory/knowledge engine from `spec/SPEC_EVOL_AGENT_MEMORY_SUBSTRATE.md`, test-first, one lot per commit, lots L0–L7 serial.
- [ ] Neutrality is an exit gate, independently verified: no consumer name/vocabulary/shape in normative code, emitted `.d.ts`, or JSON schema; anti-cycle over the packed dependency closure, not only imports.
- [ ] Extract the legacy activity subsystem (agent-stats) OUT of graphify; ingest only via the injected `ActivityEvidenceSource`.
- [ ] No merge/push/tag/publish/go-live without the owner; publication is a separate release decision after every conformance row is green.

## Scope

- [ ] Allowed: new `graphify-memory/contracts` + memory engine modules, `src/memory-*.ts`, `src/retrieval/**`, `src/temporal-recall.ts`, `src/graph-time-slice.ts`, `src/storage/**`, `src/studio-scene.ts`, `studio/src/lib/graphAdapter.js` (temporal renderer defect), `spec/SPEC_EVOL_AGENT_MEMORY_SUBSTRATE.md`, this plan, `tests/**`.
- [ ] Forbidden: any import/type/field/name of a consumer (h2a/Sentropic), any `.h2a` path, `H2aInstance`, coordination types; keeping the legacy activity subsystem inside graphify; merge/push; `.graphify/scratch/**`.
- [ ] Conditional: removal/relocation of `@sentropic/*` dependencies and importing bridges (required before the neutrality gate can pass); `package.json`/`package-lock.json` for that removal and a coherent post-gate release.

## Lot 0 — Baseline, Package Boundary, Extraction

- [ ] Pin the target commit + required intake commits; create the `graphify-memory/contracts` package with a one-way export/dependency graph.
- [ ] Physically extract the legacy activity subsystem (`src/agent-stats/**`, its CLI/exports, registry parsing, identity syntax, role fields, coordination projection) and the legacy memory compatibility surfaces out of graphify.
- [ ] Remove or relocate every organization-scoped (`@sentropic/*`) dependency and importing bridge from the repository.
- [ ] RED: `tests/memory-neutrality.test.ts > packed dependency/import closure is one-way and emitted d.ts/schema uses only the normative vocabulary`.
- [ ] RED: `tests/memory-neutrality.test.ts > evaluator and topology-shaped public objects are rejected even without forbidden imports`.
- [ ] RED: `tests/memory-activity-boundary.test.ts > activity reaches capture only through ActivityEvidenceSource`.
- [ ] RED: `tests/memory-v1-removal.test.ts > no legacy memory export, schema, source-authority header, CLI, or packed file remains`.

## Lot 1 — Closed Temporal Contract

- [x] Implement the inclusive `[t,t_end]` contract once across recall predicates, store queries, time slice, scene, and the browser renderer; define untimed active-filter behavior and `sceneTimeRange`.
- [x] RED: `tests/temporal-boundary-contract.test.ts > keeps t_end===cursor and drops t_end<cursor on recall/store/slice/renderer`.
- [x] RED: `tests/temporal-boundary-contract.test.ts > active filter drops untimed elements and scene range includes finite t_end` (renderer at baseline is the behavioral RED).

## Lot 2 — Exact Records, Ports, Digests, Bi-Temporal Query

- [x] Publish all §4–§5 DTOs/signatures/typed errors/schemas; implement exact validation, JCS/domain-separated digests, authorization binding, verifier binding, capture seam, dual-as-of carrier, local-administrator interfaces, and data-pure projection carriers.
- [x] RED: `tests/memory-contract-schema.test.ts > exact schema rejects every additional property and binds primary component event citation payload and record digests`.
- [x] RED: `tests/memory-authz.test.ts > deny expired revoked mismatched or caller-supplied authorization and apply port-owned field omission`.
- [x] RED: `tests/memory-trust.test.ts > caller cannot self-label earned or signed and revoked receipt is ineligible`.
- [x] RED: `tests/memory-admission-envelope.test.ts > engine validates only the six bound policy fields and no evaluation shape is exported`.
- [x] RED: `tests/memory-capture.test.ts > exact duplicate acknowledges and digest conflict writes nothing`.
- [x] RED: `tests/memory-dual-as-of.test.ts > valid and system axes vary independently at inclusive boundaries`.
- [x] RED: `tests/local-administrator.test.ts > fresh standalone service denies until explicit credential bootstrap and old receipts fail after rotation`.

## Lot 3 — In-Memory Journal, Quarantine, And Fold

- [x] Implement in-memory canonical store, dense hash-chained journal, encrypted pending control, lifecycle table, fold, idempotency, expiry, dispute, supersession, rewind, terminal tombstone, complete checkpoint, and projection outbox.
- [x] RED: `tests/memory-journal-replay.test.ts > checkpoint-tail and genesis yield the same canonical state digest`.
- [x] RED: `tests/memory-journal-replay.test.ts > tombstoned record cannot be resurrected by rewind or later accept`.
- [x] RED: `tests/memory-journal-replay.test.ts > gap hash break missing blob or digest drift stops readiness`.
- [x] RED: `tests/memory-lifecycle.test.ts > every unlisted transition fails before cursor allocation and pending/disputed/historical visibility follows authorization`.
- [x] RED: `tests/memory-quarantine.test.ts > pending plaintext is absent from every non-envelope surface and rejected key destruction is idempotent`.

## Lot 4 — Fenced SQLite Canonical Store

- [x] Add the declared native driver/lock helper, local-filesystem probe, kernel lock, durable epoch, revocable leases, detached copies, atomic promotion transaction, accepted lexical table, outbox, and capability receipts.
- [x] RED: `tests/canonical-memory-store.test.ts > rolls back blob+journal+state+fts+outbox at every injected failpoint`.
- [x] RED: `tests/canonical-memory-store.test.ts > same id with different full digest is refused without writes`.
- [x] RED: `tests/sqlite-memory-broker.native.test.ts > second process is refused and stale epoch fails before its first SQL statement`.
- [x] RED: `tests/sqlite-memory-broker.native.test.ts > lock loss before commit rolls back and revokes active readers`.
- [x] RED: `tests/sqlite-memory-broker.native.test.ts > detached ranking and backup copies never retain the active WAL` (native lane mandatory Linux/macOS/Windows).

## Lot 5 — Assertion Reconciliation

- [ ] Implement descriptors, occurrence keys, pure comparators, eligibility preconditions, stable proposal identity/order, version-drift behavior, and authorized application of proposals.
- [ ] RED: `tests/assertion-family-registry.test.ts > same-family same-scope same-trust opt-in is required before proposing`.
- [ ] RED: `tests/assertion-family-registry.test.ts > identity similarity alone proposes nothing and ambiguous ties require adjudication`.
- [ ] RED: `tests/assertion-family-registry.test.ts > replay uses stored registry version while a new version creates a new proposal id`.

## Lot 6 — Bounded Projection, Recovery, Backup, Postgres Parity

- [ ] Implement bounded current projection, deterministic size fixture, complete local checkpoints, portable logical backup/restore, projection invalidation cascade, the Postgres canonical adapter, and cross-backend state/receipt parity. (L6a — bounded projection, size fixture, logical backup/restore, cascade — landed backend-agnostic; L6b — Postgres adapter + parity — pending.)
- [x] RED→green (L6a): `tests/memory-projection-bound.test.ts > raw projection at cap passes and cap plus one byte fails without silent omission`.
- [x] RED→green (L6a): `tests/memory-projection-cascade.test.ts > tombstone invalidates FTS nodes edges vectors caches aggregates and exports through one cursor receipt`.
- [x] RED→green (L6a): `tests/memory-backup.test.ts > detached logical backup excludes pending rejected FTS and projections yet restore preserves terminal dominance and state digest`.
- [ ] RED (L6b): `tests/canonical-memory-store.parity.test.ts > SQLite and Postgres produce identical canonical state digests for the lifecycle corpus`.
- [ ] RED (L6b): `tests/postgres-memory-store.native.test.ts > promotion is atomic and generation mismatch fails before mutation` (Postgres 16 + 17 matrix).

## Lot 7 — Accepted-Only Ranking, Revalidation, Migration Closure

- [ ] Implement the accepted lexical DTO adapter, offline + semantic profiles, recency/profile receipts, induced eligibility graph, vector allowlist, final revalidation/redaction, bounded pagination, activity-source ingestion, migration of retained neutral records, and proof no compatibility surface remains.
- [ ] RED: `tests/memory-ranking-offline.test.ts > offline profile reads only accepted FTS and revalidation removes a stale hit`.
- [ ] RED: `tests/memory-ranking-offline.test.ts > formula profile version bounds receipt and tie order are deterministic`.
- [ ] RED: `tests/memory-ranking-semantic.test.ts > removed neighbour has zero contribution after induced-subgraph PPR`.
- [ ] RED: `tests/memory-ranking-semantic.test.ts > semantic requirement returns typed unavailable and never raw lexical fallback`.
- [ ] RED: `tests/memory-ranking-pagination.test.ts > all pages pin one profile and dual-as-of pair`.
- [ ] RED: `tests/memory-capitalisation.test.ts > sanitized derivative has a new scope re-enters pending and exposes no cross-scope edge or lineage without permission`.
- [ ] RED: `tests/memory-migration.test.ts > retained neutral records preserve digests/time/citations or emit an explicit exclusion ledger`.
- [ ] RED: `tests/memory-v1-removal.test.ts > packed artifact and repository contain no compatibility API after migration`.

## Feedback Loop

- [ ] Lots L0–L7 are serial (L2 contracts precede L3 state, L3 precedes L4 persistence, L4 precedes L5/L6/L7). No first-slice or go-live claim before L7.
- [ ] Implementation runs on a dedicated branch the owner creates/approves; each lot commits its own BRANCH.md/plan checkbox updates; owner owns every merge and the release decision.
- [ ] Neutrality, soundness, and h2a-consumer acceptance verified (2026-08-16, independent 5.6-sol + fable-5): NEUTRAL-OK, SOUNDNESS PASS, C1–C11 closed.
