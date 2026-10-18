# Agent-Memory & Knowledge Substrate (graphify-neutral)

## Objective

- [ ] Realize graphify's standalone, consumer-neutral memory/knowledge engine from `spec/SPEC_EVOL_AGENT_MEMORY_SUBSTRATE.md`, test-first, one lot per commit, lots L0–L7 serial.
- [ ] Neutrality is an exit gate, independently verified: no consumer name/vocabulary/shape in normative code, emitted `.d.ts`, or JSON schema; anti-cycle over the packed dependency closure, not only imports.
- [ ] Extract the legacy activity subsystem (agent-stats) OUT of graphify; ingest only via the injected `ActivityEvidenceSource`.
- [ ] No merge/push/tag/publish/go-live without the owner; publication is a separate release decision after every conformance row is green.

## Scope

- [ ] Allowed: new `engram-memory/contracts` + memory engine modules, `src/memory-*.ts`, `src/retrieval/**`, `src/temporal-recall.ts`, `src/graph-time-slice.ts`, `src/storage/**`, `src/studio-scene.ts`, `studio/src/lib/graphAdapter.js` (temporal renderer defect), `spec/SPEC_EVOL_AGENT_MEMORY_SUBSTRATE.md`, this plan, `tests/**`.
- [ ] Forbidden: any import/type/field/name of a consumer (h2a/Sentropic), any `.h2a` path, `H2aInstance`, coordination types; keeping the legacy activity subsystem inside graphify; merge/push; `.graphify/scratch/**`.
- [ ] Conditional: removal/relocation of `@sentropic/*` dependencies and importing bridges (required before the neutrality gate can pass); `package.json`/`package-lock.json` for that removal and a coherent post-gate release.

## Lot 0 — Baseline, Package Boundary, Extraction (boxes aligned 2026-10-06 to `c96fc01e` + CI run `37177756444`: `spec/SPEC_MEMORY_FINALIZATION.md` §3.1; remainder in `plan/08-BRANCH_MEMORY_FINALIZATION.md`)

- [x] Pin the target commit + required intake commits; create the `engram-memory/contracts` package with a one-way export/dependency graph. — done: `engram-memory/contracts` exists and is data-only; the one-way import edge is enforced by `tests/memory-neutrality.test.ts` (plan/08 F5 green); rebased target commit `00016efc9a8017fa0be9a1805bb2b3cdeb5d1ab0` (pre-rebase `343690503748f325cc7673b577321271cb0cbb9f`, same subject `fix(studio): open the cited ORIGINAL, and never render the shell as a source`, identical patch-id `479550fe`) and rebased intake commits `d9bd74d9b050fa6380667e623ca898954a9c54d4` (from `45b88bddf8a3caa5cfef4a6d572f317c381a8b9d`, closed scene-contract evidence), `b883ff76537a28e7b657238bf36ae2403e81efbf` (from `a9d5ba1c628f518929e47ce2025933bbb4f636ed`, temporal slice and citation-sidecar seam), `9f0076d8478b93e833bad87d06746341c8f88af8` (from `686d24c3d8c81d5884667e803f09f5fe7d14901d`, legacy memory seam bundle), `be27b75bf700c7e055f749441c59cbe89e93af7e` (from `1bb7f03d917c3833865d0d66241b67850925a536`, append/tombstone projection behavior), and `2526a557615b620540d8abe156c836e49830d8a2` (pre-rebase `1393bdaa604ccbb381966265173b4c9e371420b4`, same subject `feat(storage): SQLite GraphStore backend (narrow memory v1) (#308)`, identical patch-id `b7d5f8b5`; `70dcfb9663e081651b8309f5338f6274e5bc5f03` is only the earlier `adapter`-titled iteration with a different patch).
- [x] Physically extract the legacy activity subsystem (`src/agent-stats/**`, its CLI/exports, registry parsing, identity syntax, role fields, coordination projection) and the legacy memory compatibility surfaces out of graphify. — done 2026-10-12 (plan/08 F12, D-2): `src/agent-stats/**` and `src/memory-*.ts` are gone, the CLI registers no `agent-stats`, and the staging copy is deleted (`_extracted/agent-stats-h2a-module/` + 7 `tests/agent-stats*.test.ts` + `tests/fixtures/agent-stats/`, one `git rm` unit); the module lives in h2a `@sentropic/agent-stats` (import commit `b503d9a7`, 124/124 tests); `README.md`/`ARCHITECTURE.md` point at that package.
- [x] Remove or relocate every organization-scoped (`@sentropic/*`) dependency and importing bridge from the repository. — decided D-1=A (2026-10-06, plan/08 F11): the exclusion binds the `engram-memory` build, test, generated-contract, and publication closure, which is clean; the root manifest and bridges keep `@sentropic/graph`, `@sentropic/llm-mesh`, `@sentropic/agent-stats-core`, `@sentropic/design-system-*`, and the product itself is `@sentropic/engram` since 0.19.0 as product dependencies outside the memory boundary; the `it.todo` is removed.
- [x] RED: `tests/memory-neutrality.test.ts > packed dependency/import closure is one-way and emitted d.ts/schema uses only the normative vocabulary`. — green since plan/08 F5: vocabulary scan over the `npm pack` file list plus lockfile names (real title `packed engram-memory file list and lockfile closure use only neutral vocabulary`), one-way import closure over sources, generated code, memory tests and fixtures, and documentation examples, and built-exports coverage in `tests/memory-package-exports.test.ts`; the `it.todo` scope decision stays with F11 (D-1).
- [x] RED: `tests/memory-neutrality.test.ts > evaluator and topology-shaped public objects are rejected even without forbidden imports`. — no test has this title; subsumed into the single scan above per the spec §9 L0 row (forbidden evaluator/authorship field names; name-based, not structural).
- [x] RED: `tests/memory-activity-boundary.test.ts > activity reaches capture only through ActivityEvidenceSource`. — green on `c96fc01e`; a static negative check (the engine-side ingestion path is finding X1 of the finalization spec).
- [x] RED: `tests/memory-v1-removal.test.ts > no legacy memory export, schema, source-authority header, CLI, or packed file remains`. — green on `c96fc01e`.

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
- [x] RED: `tests/admin-provider.test.ts > fresh store denies until explicit AdminProviderPort bootstrap and old receipts fail after rotation` (2 tests), plus the `§10` conformance harness `tests/admin-provider-contract.test.ts` (5 tests), the entry-point dispatch `tests/memory-admin-entry.test.ts` (10 tests) and the shape gate `tests/memory-admin-contract.test.ts` (4 tests). — replaces the retired `tests/local-administrator.test.ts` (absent: its subject, the shipped provider family, was removed in R1b-retire=B, `BRANCH.md`; the retired family is guarded by `tests/memory-v1-removal.test.ts`).

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
- [x] RED: `tests/sqlite-memory-broker.native.test.ts > detached ranking and backup copies never retain the active WAL` (native lane mandatory on Linux; macOS/Windows fail closed at open — declared gap D-6 A).

## Lot 5 — Assertion Reconciliation

- [x] Implement descriptors, occurrence keys, pure comparators, eligibility preconditions, stable proposal identity/order, version-drift behavior, and authorized application of proposals.
- [x] RED: `tests/assertion-family-registry.test.ts > same-family same-scope same-trust opt-in is required before proposing`.
- [x] RED: `tests/assertion-family-registry.test.ts > identity similarity alone proposes nothing and ambiguous ties require adjudication`.
- [x] RED: `tests/assertion-family-registry.test.ts > replay uses stored registry version while a new version creates a new proposal id`.

## Lot 6 — Bounded Projection, Recovery, Backup, Postgres Parity

- [x] Implement bounded current projection, deterministic size fixture, complete local checkpoints, portable logical backup/restore, projection invalidation cascade, the Postgres canonical adapter, and cross-backend state/receipt parity. (L6a — bounded projection, size fixture, logical backup/restore, cascade — landed backend-agnostic; L6b — Postgres adapter + parity — landed; durable logical backup/restore landed in X4, D-11 B, PR #372 + X1 PR #377; engine `invalidateProjections` and live `FileGraphStore` + `PostgresExactVectorStore` cascade landed in X2 PR #373 and X2b PR #378; cross-backend transaction-receipt digest parity and illegal-transition zero-write on SQLite and Postgres 16/17 landed in PR #380 (`26ad4797`), green in mandatory `test (20/22/24)` and `memory-postgres` on `main` run `38886820976`. DELETE+full re-INSERT write-amplification ceiling recorded in spec §8/§9 D9 per storage-lane review O3; not re-architected here.)
- [x] RED→green (L6a): `tests/memory-projection-bound.test.ts > raw projection at cap passes and cap plus one byte fails without silent omission`.
- [x] RED→green (L6a): `tests/memory-projection-cascade.test.ts > tombstone invalidates FTS nodes edges vectors caches aggregates and exports through one cursor receipt`.
- [x] RED→green (L6a): `tests/memory-backup.test.ts > detached logical backup excludes pending rejected FTS and projections yet restore preserves terminal dominance and state digest`.
- [x] RED→green (L6b): `tests/canonical-memory-store.parity.test.ts > SQLite and Postgres produce identical canonical state digests, transaction-receipt digests, and illegal-transition zero-write behavior for the lifecycle corpus` (real Docker Postgres 16 + 17; digests folded from a reopened store so persistence divergence is caught — verified non-vacuous against injected outbox/journal corruption; gated to `it.skip` when Docker/images are absent). CI job `memory-postgres` green on `main` `26ad4797` (PR #380, run 38886820976, mandatory check: `2 tests` passed, `0 skipped`; harness images `postgres:16@sha256:ca0bd484…becb641d` and `postgres:17@sha256:2d2b8998…56ddbdf9e3`) and on `main` `fd649ee7` (PR #383, run 38907345703, mandatory check: `4 tests` passed, `0 skipped`) and latest `main` `545a57b8` (PR #385, run `38949383331`, required job `117136625052`: 4/4 passed, zero skips). These runs exercise the current title (post-#380 receipt parity + illegal-transition zero-write, extended in #383 with canonical temporal intervals); older 1-test runs do not prove the extended corpus. The lifecycle loop uses 16/17; the temporal loop uses 16 only.
- [x] RED→green (L6b): `tests/postgres-memory-store.native.test.ts > promotion is atomic and generation mismatch fails before mutation` (real Docker Postgres 16 + 17; failpoint rollback leaves blob/journal/state/lexical/outbox unchanged, and a superseded generation refuses `FENCE_LOST` before any mutating statement). Same `memory-postgres` run on `main` `26ad4797` (PR #380, run 38886820976) and `main` `fd649ee7` (PR #383, run 38907345703, job `116994152851`): `4 tests` passed incl. X4 #372 and X1 #377, `0 skipped` and latest `main` `545a57b8` (run `38949383331`, required job `117136625052`: 4/4 passed, zero skips). These runs exercise the current 4-test file; the PR #344 run exercised the superseded 1-test version.

## Lot 7 — Accepted-Only Ranking, Revalidation, Migration Closure

F13 evidence refresh: substrate baseline `main` `545a57b8`, run `38949383331`, all seven required checks successful; closure baseline `main` `a88375f0` (PR #398). `memory-recall-golden` has 5 cases (4 passed / 1 Postgres skip in `test (20/22/24)`, 5 passed / 0 skips in `memory-postgres`); both profiles have independently hashed configuration references, and closed-interval decay is exercised at the in-memory scoring seam only. `memory-migration` has 13 passing cases covering six versioned pin fixtures: 98 occurrences, all explicitly excluded for missing V2 digests, host-Ed25519 signed and verified after JSON reload (#385); its synthetic case separately proves successful preservation. `memory-signed-exclusion-ledger` has 55 passed. Optional Git-history provenance is 1 passed / 5 skipped in CI, separate from the always-on frozen-fixture matrix. Exact tests, artifact digests and remaining proof limits are in `plan/08` F13; implementation checkboxes below do not constitute F13 exit/review/owner acceptance. Engram 0.20.0 (option B, owner decision 2026-10-17) is published from `af60f9d7` (tag `v0.20.0`) with the substrate and six in-process tools and without the MCP adapter; MCP-L4 (engram gateway, depends on MCP-L1/MCP-L2/MCP-L5), MCP-L5–MCP-L7 (Sentropic chain), and MCP-L8 (h2a voluntary consumption, depends on MCP-L7) remain `missing` with their dependencies recorded in `plan/08` F13 and `spec/SPEC_MEMORY_MCP_V2.md`. The filtered shared graph in 0.20.0 is the restored initial D3/D10 design (`7bc9baec`; PR #393, PR #395).

- [x] Implement the accepted lexical DTO adapter, offline + semantic profiles, recency/profile receipts, induced eligibility graph, vector allowlist, final revalidation/redaction, bounded pagination, activity-source ingestion, migration of retained neutral records, and proof no compatibility surface remains. Activity-source ingestion is implemented through `MemoryPortV2.ingestActivity` (X1, D-8 A, PR #377 `c8e1773b`, `main` CI run `38886820976`: `tests/memory-activity-ingestion.test.ts` 40/40 in `test (20/22/24)` and `tests/postgres-memory-store.native.test.ts` 4/4, `0 skipped` in mandatory `memory-postgres`); full `MemoryPortV2.recall` (`offline_lexical_v1`, `semantic_v1`, pagination) on durable SQLite and Postgres 16/17 stores verified in `tests/memory-recall-durable-parity.test.ts` (PR #380 `26ad4797`, `main` CI run `38886820976`: `2 tests` passed, `0 skipped` in mandatory `memory-postgres`).
- [x] RED: `tests/memory-ranking-offline.test.ts > offline profile reads only accepted FTS and revalidation removes a stale hit`.
- [x] RED: `tests/memory-ranking-offline.test.ts > formula profile version bounds receipt and tie order are deterministic`.
- [x] RED: `tests/memory-ranking-semantic.test.ts > removed neighbour has zero contribution after induced-subgraph PPR`.
- [x] RED: `tests/memory-ranking-semantic.test.ts > semantic requirement returns typed unavailable and never raw lexical fallback`.
- [x] RED: `tests/memory-ranking-pagination.test.ts > all pages pin one profile and dual-as-of pair`.
- [x] RED: `tests/memory-capitalisation.test.ts > sanitized derivative has a new scope re-enters pending and exposes no cross-scope edge or lineage without permission`.
- [x] RED: `tests/memory-migration.test.ts > retained neutral records preserve digests/time/citations or emit an explicit exclusion ledger`.
- [x] RED: `tests/memory-v1-removal.test.ts > packed artifact and repository contain no compatibility API after migration`.

## Feedback Loop

- [ ] Lots L0–L7 are serial (L2 contracts precede L3 state, L3 precedes L4 persistence, L4 precedes L5/L6/L7). No first-slice or go-live claim before L7.
- [ ] Implementation runs on a dedicated branch the owner creates/approves; each lot commits its own BRANCH.md/plan checkbox updates; owner owns every merge and the release decision.
- [ ] Neutrality, soundness, and h2a-consumer acceptance verified (2026-08-16, independent 5.6-sol + fable-5): NEUTRAL-OK, SOUNDNESS PASS, C1–C11 closed.
