# Memory Engine Finalization (`engram-memory`)

Spec: `spec/SPEC_MEMORY_FINALIZATION.md` (cited **FIN §x**); normative parent `spec/SPEC_EVOL_AGENT_MEMORY_SUBSTRATE.md` (cited **EVOL l.N**). Base: `origin/main` `c96fc01e` (0.19.1), branch `feat/memory-finalization`. Owner decisions D-1…D-11 are listed in FIN §6 (D-9, D-10, D-11 decided 2026-10-07); review rounds 1–2 are dispositioned in FIN §7–§8.

## Objective

- [ ] Close the L0–L7 remainder of the memory engine (FIN §1) test-first, one logical change per lot (≤ ~15 files; F12 is a single mechanical deletion and is the only exception).
- [ ] Execute — not declare — the L6 Postgres parity gate (R2-g) before any contract change lands, and claim only what the lane executes (FIN §3.3.2 T-g4).
- [ ] Land contract changes (L5b, R2-h, X1, X2, X4) only after their owner decisions (D-3, D-5, D-8, D-10, D-11); D-10 B and D-11 B were decided on 2026-10-07, so X2 and X4 are in scope.
- [ ] No merge, push, tag, publication, or go-live without the owner. Postgres go-live and publication are excluded from this plan.

## Scope

- [ ] Allowed: `engram-memory/**` (never `node_modules/` or `dist/`), `tests/**`, `.github/workflows/typescript-ci.yml` (new job or steps only), `scripts/check-native-abi.mjs`, `docs/NATIVE_ABI.md`, `spec/SPEC_EVOL_AGENT_MEMORY_SUBSTRATE.md`, `spec/SPEC_MEMORY_FINALIZATION.md`, this plan, `plan/07-BRANCH_AGENT_MEMORY_SUBSTRATE.md` and `BRANCH.md` (checkboxes and annotations; no R2-i line — that follow-up existed only under D-11 A), `README.md` and `ARCHITECTURE.md` (F6, F12 only), `CHANGELOG.md` (draft entries under `## Unreleased` only).
- [ ] Forbidden: consumer names, types or paths inside `engram-memory/`; any Python file, script, CI step or image; a new runtime dependency or container image without its owner decision; `src/**` product code; `package.json` and lockfiles; a Dockerfile; `.track/**` writes (single writer: the conductor); merge, push, tag, publish; `.graphify/scratch/**`.
- [ ] Conditional: deleting `_extracted/**`, `tests/agent-stats*.test.ts`, `tests/fixtures/agent-stats/**` only after the receiving owner confirms the import (D-2); `src/**` and `package.json` only under D-1 option B, which needs its own plan.

## Recommended Order

| Order | Lot | Item | Change class | Needs |
|---|---|---|---|---|
| 1 | F0 | registry baseline | docs | — (this change) |
| 2 | F1 (+F1b) | R2-g Postgres lane | CI + test harness | D-4 and D-7(ii) (light, ask first; both gate F1's merge) |
| 3 | F2 | receipt digest integrity | bug fix, no contract change | — |
| 4 | F3 | image ABI smoke | script + CI step + docs | D-7(i) for the definition text |
| 5 | F4 | L5a registry conformance | no contract change | — |
| 6 | F5 | L0 closure, packed list, built exports | tests + tsconfig | — |
| 7 | F6 | L0 docs drift | docs + test | — |
| — | — | owner decisions | — | D-1, D-2, D-3, D-5, D-6, D-7(iii), D-8, D-9, D-10, D-11 |
| 8 | F7 | R2-h `multiply_linked` | contract (additive) | D-5, after F2 |
| 9 | F8 | L5b-1 contracts | contract | D-3, after F4 |
| 10 | F9 | L5b-2 engine proposal | engine | D-3 |
| 11 | F10 | L5b-3 application + checkpoint | engine + store | D-3, after F1 |
| 12 | F11 | L0 organization scope | test + spec | D-1 |
| 13 | F12 | L0 staging relocation | deletion | D-2, cross-owner |
| 14 | F13 | exit gate | review + registry | all above |
| opt. | F1c, F14, X1–X4 | storage lanes, R2-a, triage | various | D-4, D-6, D-8, D-9, D-10 B, D-11 B |

Rationale: F1 first because it executes L6 and is the only lot able to reveal a latent defect in code already merged; then the lots without contract change, by increasing scope; contract changes only after decisions; F10 after F1 so the Postgres lane covers the new event field; the cross-owner relocation last.

## F0 — Registry Baseline (FIN §3.8) — this change

- [x] `BRANCH.md`: R2-f checked with evidence and its residual; R2-b and R2-c annotated out of finalization scope (FIN §3.7).
- [x] `plan/07` Lot 0 boxes aligned to code evidence (FIN §3.1).
- [x] `spec/SPEC_MEMORY_FINALIZATION.md` and this plan written; amended after review rounds 1–2 (FIN §7–§8).
- Allowed: `BRANCH.md`, `plan/07`, FIN, this plan. Forbidden: code, tests, workflows.
- Gate: conductor review; the conductor commits and imports this plan into Track.

## F1 — R2-g: Execute The Canonical Postgres Lane (FIN §3.3) — D-4, D-7(ii)

- [x] RED: `tests/postgres-ephemeral.test.ts > a required Postgres lane fails instead of skipping when Docker or an image is unavailable`.
- [x] GUARD: `tests/postgres-ephemeral.test.ts > image references honour the pinned override and default to postgres:<major>`.
- [x] Implement: a pure lane decision (`run | skip | fail`) in `tests/postgres-ephemeral.ts`, driven by `ENGRAM_MEMORY_REQUIRE_POSTGRES` and `ENGRAM_MEMORY_POSTGRES_IMAGE_<major>`, used by both gates; `allow_ephemeral_filesystem_store: true` on the parity test's SQLite opens (l.108, l.113).
- [x] Implement: job `memory-postgres` in `.github/workflows/typescript-ci.yml` — `ubuntu-latest`, Node 24, `npm ci --legacy-peer-deps`, `docker pull` of the two digest-pinned references, then the two files in required mode; the PR records both image digests for owner approval (D-4).
- [x] After green on the PR, exactly the T-g4 updates (FIN §3.3.2): EVOL l.1307 (L6 note), l.1318 (`canonical state`) and l.1320 (`Postgres parity`) with the executed / `not covered` split; l.1324 (`recovery/backup`) annotated "logical backup/restore runs over the in-memory model only (X4)"; EVOL l.41 unchanged; `plan/07` l.74–75 annotated with the CI job, l.70 stays open; `BRANCH.md` R2-g checked with the harness-image note; FIN §3.3 status updated. DONE on PR #344 (run 38033477180, job `memory-postgres` `1m29s`, both files `1 test` passed, `0 skipped`).
- Allowed (10): `tests/postgres-ephemeral.ts`, `tests/postgres-ephemeral.test.ts`, `tests/canonical-memory-store.parity.test.ts`, `tests/postgres-memory-store.native.test.ts`, `.github/workflows/typescript-ci.yml`, EVOL, FIN, `plan/07`, `BRANCH.md`, this plan.
- Forbidden: `engram-memory/**` (a parity failure opens F1b); service containers for these two files unless D-4 B; storage lanes (F1c); the steps of the existing `test` job; any coverage claim beyond T-g4 (receipt parity, illegal-transition no-write and logical backup on Postgres stay `not covered`).
- Gate: D-4 and D-7(ii) recorded in FIN §6 before merge; `memory-postgres` green on the PR with both files at `1 test` passed and `0 skipped`, both images started in the log; a one-off mutation run (corrupted expected digest, never merged) shown red; `test (20|22|24)` unchanged; non-author review.

## F1b — Conditional: Postgres Parity Defect Fix (only if F1's first run is red)

- [ ] RED: the failing F1 case, recorded in the PR.
- [ ] Implement: the minimal fix in `engram-memory/postgres.ts`, or in the shared fold if the divergence is there.
- Allowed (5): `engram-memory/postgres.ts`, `engram-memory/memory-store.ts` (shared-fold divergence only), the two Postgres test files, this plan.
- Forbidden: weakening the parity predicate; dropping a matrix version.
- Gate: F1 gate plus the Linux native lane green.

## F1c — Optional: Storage Projection Lanes (FIN §3.3.2) — D-4 storage images

- [ ] Implement: service containers — a pgvector-enabled Postgres for `GRAPHIFY_TEST_POSTGRES_URL`, Neo4j for `GRAPHIFY_TEST_NEO4J_URI`; Spanner (`SPANNER_EMULATOR_HOST`) only with a verified instance/database provisioning step.
- Allowed (2): `.github/workflows/typescript-ci.yml`, this plan.
- Gate: the live blocks of `storage-postgres`, `storage-postgres-time-window`, `storage-pgvector`, `memory-trusttier-roundtrip`, `storage-neo4j` (and `storage-spanner` if provisioned) run with `0 skipped`. Not a memory finalization gate.

## F2 — Readiness Receipt Digest Binds Every Field (FIN §3.4, R2-h-D1)

- [x] RED: `tests/canonical-store-factory.test.ts > a factory-wrapped readiness receipt_digest binds every field, including the declared adapter identity` (observed red 2026-10-10: stale `receipt_digest` `sha256:b9aabd…` vs recomputed `sha256:580453…`).
- [x] Implement: the wrapper in `engram-memory/store-factory.ts` recomputes `receipt_digest` (`operational-capability` domain) over the final receipt; correct the comment at l.22–24.
- Allowed (4): `engram-memory/store-factory.ts`, `tests/canonical-store-factory.test.ts`, FIN, this plan.
- Forbidden: `engram-memory/contracts/index.ts`; the admission logic (`verifyStoreProvenance`).
- Gate: `npx vitest run tests/canonical-store-factory.test.ts tests/store-provenance.test.ts tests/capability-attestation-gate.test.ts` green; `npm --prefix engram-memory run typecheck` green; CI green including the Linux native lane.

## F3 — Image ABI: Native Smoke, CI Step, Image-Builder Note (FIN §3.6) — D-7(i)

- [ ] RED: `tests/native-abi-smoke.test.ts > a load error naming another NODE_MODULE_VERSION is classified ABI_MISMATCH and a missing module MODULE_MISSING`.
- [ ] RED: `tests/native-abi-smoke.test.ts > the smoke verdict matches the platform: exit 0 with both addons loaded and the flock in fdinfo on Linux, PLATFORM_UNSUPPORTED elsewhere` (one case, never skipped).
- [ ] Implement: `scripts/check-native-abi.mjs` (Node only, exported classifier; addons resolved with `createRequire(engram-memory/package.json)`; `PLATFORM_UNSUPPORTED` before the lock step outside Linux); a step running it in each `test` matrix job right after `npm ci`; `docs/NATIVE_ABI.md`; EVOL l.1260 wording ("N-API binding" → NAN addon compiled at install).
- Allowed (7): `scripts/check-native-abi.mjs`, `tests/native-abi-smoke.test.ts`, `.github/workflows/typescript-ci.yml`, `docs/NATIVE_ABI.md`, EVOL, FIN, this plan.
- Forbidden: Python; a Dockerfile; replacing `fs-ext` or `better-sqlite3` (D-7(iii)); refusing on the SQLite version (X3).
- Gate: smoke step green on Node 20/22/24; both cases green; the printed SQLite version recorded in the PR (input to D-9 and X3). D-7(ii) does not gate F3: the smoke is Node-only and runs inside the existing jobs.

## F4 — L5a: Registry Conformance Without Contract Change (FIN §3.2.2)

- [ ] RED: `tests/assertion-family-registry.test.ts > proposal_id is SHA-256 over the D5 proposal domain and exactly the seven identity fields`.
- [ ] GUARD: `tests/assertion-family-registry.test.ts > proposals sort by occurrence key, left id, right id, relation and exact duplicates collapse by id`.
- [ ] GUARD: `tests/assertion-family-registry.test.ts > an uninstalled family id or version is REGISTRY_VERSION_UNAVAILABLE and proposes nothing`.
- [ ] GUARD: `tests/assertion-family-registry.test.ts > evaluateReconciliationEligibilityV1 refuses non-current, expired, or dependency-ineligible statuses and status/record id mismatches` (direct call of the exported gate).
- [ ] GUARD: `tests/assertion-family-registry.test.ts > compare proposes nothing when either record was recorded after comparison_system_as_of` (intrinsic visibility gate of `compare`; `compare` has no lifecycle input, so the lifecycle half is F9's).
- [ ] GUARD: `tests/assertion-family-registry.test.ts > evidence_citation_ids are the sorted unique union of both primary components' citations`.
- [ ] Implement: D5 domain in `reconciliationProposalIdV1`; EVOL §6 sentences T5.3 (version coupling) and T5.4 (citation sufficiency); `plan/07` l.64–66 checked (named REDs green since 2026-08-16).
- Allowed (5): `engram-memory/assertion-family-registry.ts`, `tests/assertion-family-registry.test.ts`, EVOL, `plan/07`, this plan.
- Forbidden: `engram-memory/contracts/index.ts`, `engram-memory/engine.ts`; relation values and the error label (F8).
- Gate: `tests/assertion-family-registry.test.ts` green (9 cases); each GUARD's mutation run recorded in the PR; package typecheck; CI.

## F5 — L0: Enforced Import Closure, Packed File List, Built Exports (FIN §3.1.3 T0.1–T0.3, T0.7)

- [ ] RED: `tests/memory-neutrality.test.ts > the import-closure scanner rejects a forbidden edge in each scanned set: source, generated code, test closure, documentation example` (inline fixtures).
- [ ] GUARD: `tests/memory-neutrality.test.ts > engram-memory import closure is one-way across sources, generated code, memory tests and fixtures, and documentation examples` — with its in-test wiring control (scanned sets contain `engram-memory/engine.ts`, `engram-memory/contracts/index.ts`, `engram-memory/dist/index.js`, `tests/memory-l3-fixture.ts`) and a mutation run in the PR (a forbidden import added to an `engram-memory` module, never merged). The mutation run exercises the source set only; the generated-code and test-closure sets rely on the wiring control.
- [ ] RED: `tests/memory-neutrality.test.ts > packed engram-memory file list and lockfile closure use only neutral vocabulary`.
- [ ] RED: `tests/memory-package-exports.test.ts > every engram-memory export subpath is built from a module of the package program`.
- [ ] Implement: the pure scanner over `(path, content)` pairs, test-local in `tests/memory-neutrality.test.ts` (no new source module), and its four edge sets (FIN §3.1.3 T0.1 a–d); the directory-wide text scan replaced by the `npm pack --dry-run --json` list plus lockfile package names (the emitted `contracts` declaration check stays); `engram-memory/tsconfig.json` `include` fixed (`integration.ts` added, `service.ts` removed); EVOL D1 layout wording; `plan/07` l.18 and l.21 updated.
- Allowed (7): `tests/memory-neutrality.test.ts`, `tests/memory-package-exports.test.ts`, `engram-memory/tsconfig.json`, EVOL, FIN, `plan/07`, this plan.
- Forbidden: removing the `it.todo` (F11); `engram-memory` runtime modules; `engram-memory/package.json` exports; fixture files on disk (fixtures are inline strings).
- Gate: the four cases green; the GUARD's mutation run recorded in the PR; `npm --prefix engram-memory run build` emits `dist/integration.js` and `dist/integration.d.ts`; CI green on Node 20/22/24.

## F6 — L0: Agent-Stats Documentation Drift (FIN §3.1.3 T0.4)

- [ ] RED: `tests/memory-activity-boundary.test.ts > repository docs advertise no agent-stats command the CLI does not register`.
- [ ] Implement: the agent-stats command examples of `README.md` l.257–281 replaced by a short pointer (the git-flow layout text stays if it holds without them); `ARCHITECTURE.md:32` row replaced; `CHANGELOG.md` history untouched.
- Allowed (4): `README.md`, `ARCHITECTURE.md`, `tests/memory-activity-boundary.test.ts`, this plan.
- Forbidden: `_extracted/**`, `CHANGELOG.md`, `src/**`.
- Gate: the case green; README change accepted by the product-doc owner.

## F7 — R2-h: `multiply_linked` In `readiness()` (FIN §3.4) — D-5, after F2

- [ ] RED: `tests/sqlite-fence-nlink.native.test.ts > readiness reports multiply_linked false for a single-named database and true after a post-open hard link, with operations still admitted`.
- [ ] RED: `tests/sqlite-fence-nlink.native.test.ts > multiply_linked is bound by receipt_digest`.
- [ ] GUARD: `tests/memory-fence-posture.test.ts > memory receipts omit multiply_linked`; the Postgres omission asserted in `tests/postgres-memory-store.native.test.ts`.
- [ ] GUARD: `tests/capability-attestation-gate.test.ts > a multiply_linked receipt is an alarm: fencing-dependent operations are still admitted`.
- [ ] Implement: optional receipt field; internal `linkCount()` on the fence lock; SQLite `readiness()` sets the field after `#fence`; the R2-f residual comment in `close()` (`release()` after `database.close()`); EVOL §4 evolution rule, §5.9 receipt, l.1264, l.1266; a `CHANGELOG.md` entry under `## Unreleased` (heading created if absent; no version bump); `BRANCH.md` R2-h checked.
- Allowed (11): `engram-memory/contracts/index.ts`, `engram-memory/sqlite.ts`, `tests/sqlite-fence-nlink.native.test.ts`, `tests/memory-fence-posture.test.ts`, `tests/postgres-memory-store.native.test.ts`, `tests/capability-attestation-gate.test.ts`, EVOL, FIN, `CHANGELOG.md`, `BRANCH.md`, this plan.
- Forbidden: any refusal or `FENCE_LOST` driven by the field; a flag permitting multiply-linked stores; `CapabilityDescriptorV1`; memory or Postgres builders emitting the field; a version change in any `package.json`.
- Gate: Linux native lane green with zero skips; `memory-postgres` green; package typecheck; CI.

## F8 — L5b-1: Reconciliation Contracts And Directional Relation (FIN §3.2.3 T5.5–T5.6) — D-3, after F4

- [ ] RED: `tests/assertion-family-registry.test.ts > supersession carries its direction: mirrored refinements yield distinct relations and identities`.
- [ ] RED: `tests/assertion-family-registry.test.ts > registry errors are labelled propose_reconciliation, never admin`.
- [ ] Implement: `ReconciliationRelation` split per T5.5 (`left_supersedes_right | right_supersedes_left`, decided technically); the `MemoryOperation` member; `ReconciliationRequestV1`, `ReconciliationOutcomeV1` and the binding DTOs; optional `reconciliation` on `LifecycleCommandV1` and `LifecycleEventV2`; `MemoryPortV2.proposeReconciliation` declared (the engine refuses `CAPABILITY_UNAVAILABLE` until F9); exact-key validation of the new optional fields; EVOL D5 (the `reconciliation-eligibility` and `reconciliation-outcome` formulas), §5.1, §5.5, §5.6, §6 amended.
- Allowed (≤9): `engram-memory/contracts/index.ts`, `engram-memory/assertion-family-registry.ts`, `engram-memory/validation.ts`, `engram-memory/engine.ts` (declaration only), `tests/assertion-family-registry.test.ts`, `tests/memory-contract-schema.test.ts` (if the event shape check needs it), EVOL, FIN, this plan.
- Forbidden: persisting proposals or bindings (F10); any change to the fold.
- Gate: registry tests green; package typecheck; full memory suite green with unchanged digests for events without a binding.

## F9 — L5b-2: Engine `proposeReconciliation` (FIN §3.2.3 T5.7, T5.10) — D-3

- [ ] RED: `tests/memory-reconciliation.test.ts > proposeReconciliation reads only, allocates no cursor, and refuses CAPABILITY_UNAVAILABLE without a registry`.
- [ ] RED: `tests/memory-reconciliation.test.ts > records ineligible at the pinned cursor (tombstoned, expired, trust-invalid, historical) yield an ineligible outcome with no proposal`.
- [ ] RED: `tests/memory-reconciliation.test.ts > a pair the eligibility gate refuses (missing opt-in, distinct trust classes) yields an ineligible outcome with no proposal, not an error`.
- [ ] RED: `tests/memory-reconciliation.test.ts > eligibility is decided on the system axis: a refinement whose valid intervals do not overlap is still proposed`.
- [ ] RED: `tests/memory-reconciliation.test.ts > the outcome binds registry, family, pair, pin, per-record eligibility and proposal under the reconciliation-outcome and reconciliation-eligibility domains`.
- [ ] RED: `tests/memory-reconciliation.test.ts > an uninstalled registry version refuses reconciliation while recall stays available`.
- [ ] Implement: the eight steps of T5.7 in `engram-memory/engine.ts` (per-record authorization, read, and revalidation at the record's own valid start; outcome and eligibility digests).
- Allowed (5): `engram-memory/engine.ts`, `tests/memory-reconciliation.test.ts`, `tests/memory-l7-fixture.ts` (records opted into the family), FIN, this plan.
- Forbidden: journal writes; cursor allocation; bypassing `admitFenced` or the authorization calls; a `valid_as_of` request field.
- Gate: new cases green; full memory suite green; package typecheck.

## F10 — L5b-3: Authorized Application, Event Field, Checkpoint Registry Versions (FIN §3.2.3 T5.8–T5.9) — D-3, after F1

- [ ] RED: `tests/memory-reconciliation.test.ts > a dispute or supersede bound to a proposal persists family and registry versions in the event digest and in the journal event (visible via readJournal), and replay never calls the registry`.
- [ ] RED: `tests/memory-reconciliation.test.ts > a forged or mismatched proposal binding is refused before any cursor allocation`.
- [ ] RED: `tests/memory-journal-replay.test.ts > checkpoint registry_versions lists every registry version bound by journal events through the cursor`.
- [ ] Implement: binding validation in `transition` (recomputation through T5.7 steps 5–7 with `propose_reconciliation` authorized on both records); the event field bound into `event_digest`; the same optional field on the journal event, carried by `#intentFromLifecycle` into the journal `event_hash` (no migration: opaque JSON body); the fold reads stored fields only; `registry_versions` derived from the journal field in the checkpoint; the parity corpus gains one bound transition; EVOL §5.9 checkpoint sentence; `plan/07` l.63 checked.
- Allowed (≤11): `engram-memory/engine.ts`, `engram-memory/memory-store.ts`, `engram-memory/validation.ts`, `engram-memory/sqlite.ts` and `engram-memory/postgres.ts` (only if their checkpoint override drops the field), `tests/memory-reconciliation.test.ts`, `tests/memory-journal-replay.test.ts`, `tests/canonical-memory-store.parity.test.ts`, EVOL, `plan/07`, this plan.
- Forbidden: running a comparator during fold or replay; changing the digest of an event without a binding.
- Gate: memory suite green; Linux native lane green; `memory-postgres` green with the extended corpus; existing replay digests unchanged.

## F11 — L0: Organization-Scope Resolution (FIN §3.1.3 T0.6) — D-1

- [ ] Implement (option A): delete the `it.todo` at `tests/memory-neutrality.test.ts:73`; amend the EVOL D1 sentence; `plan/07` l.20 checked with the decision reference.
- Allowed (4): `tests/memory-neutrality.test.ts`, EVOL, `plan/07`, this plan.
- Forbidden: `package.json`, `src/**` (option B needs its own plan).
- Gate: `memory-neutrality` green with no `todo`; D-1 recorded in FIN §6.

## F12 — L0: Staging Module Relocation (FIN §3.1.3 T0.5) — D-2, cross-owner

- [ ] Precondition: the receiving owner has imported `_extracted/agent-stats-h2a-module/`, its six test files, the module half of `tests/agent-stats-extraction.test.ts`, and the fixtures; their commit is the evidence. Without it 30 days after D-2, the conductor brings D-2 back (FIN §6).
- [ ] GUARD: `tests/memory-activity-boundary.test.ts > the root CLI registers no agent-stats command` (the root half of `tests/agent-stats-extraction.test.ts:17`, moved before the deletion).
- [ ] RED: `tests/memory-activity-boundary.test.ts > the activity staging module is absent from the repository`.
- [ ] Implement: move the root-CLI assertion; delete the staging directory, the 7 `tests/agent-stats*.test.ts` files and `tests/fixtures/agent-stats/**`; update the pointer in `README.md` and `ARCHITECTURE.md`; `plan/07` l.19 checked.
- Allowed: the deletions (one mechanical unit, above 15 files), `tests/memory-activity-boundary.test.ts`, `README.md`, `ARCHITECTURE.md`, `plan/07`, this plan.
- Forbidden: editing the code being removed; deleting before the receiving import exists; deleting `agent-stats-extraction` before its root assertion lives in `memory-activity-boundary`.
- Gate: CI green here; the moved tests green in the receiving repository (link in the PR).

## F13 — Exit Gate And Registry Closure

- [ ] Every EVOL §10 row green in mandatory CI, or an explicitly declared gap per the decisions (R2-a); D-10 B and D-11 B are implemented in X2 and X4, not declared; zero skips in the Linux native and `memory-postgres` lanes; no `todo` in the memory suites.
- [ ] EVOL aligned for X5 and X6 (decided in FIN §4); no R2-i line (`BRANCH.md` follow-up existed only under D-11 A); stale `plan/07` lines fixed (l.59; l.79 per D-8); `BRANCH.md` R2 lines and G1–G4 annotated with their evidence state.
- [ ] Two independent non-author reviews (conductor-assigned); findings reconciled.
- [ ] Owner gate for the merge; release and publication stay separate owner decisions.
- Allowed: EVOL, FIN, `plan/07`, `BRANCH.md`, this plan.
- Gate: reviews closed and the owner decision recorded.

## F14 — Conditional: R2-a macOS/Windows (FIN §3.5) — only if D-6 is B or C

- [ ] F14a spikes, evidence only, nothing merged: U1 (macOS `flock` vs SQLite `fcntl`), U2 (macOS liveness probe), U3 (Windows lock range and `fs-ext` behaviour), U4 (filesystem classification by handle), U5 (`npm ci` on macOS/Windows runners).
- [ ] F14b EVOL amendment from the spike evidence (D-6 C only).
- [ ] F14c/F14d per-platform opener, native suite and runner job (D-6 C only).
- Gate (F14a): one evidence note per unknown, reviewed; no code merged.

## Triage Lots (FIN §4)

- [ ] X1 — activity ingestion (D-8 A, shape FIN §4.1): RED `tests/memory-activity-ingestion.test.ts > activity evidence becomes a pending capture through the injected source, idempotent per source, sequence and evidence id, and the source cannot admit`; RED `tests/memory-activity-ingestion.test.ts > changed evidence under the same source, sequence and evidence id is DIGEST_CONFLICT with no write`. Allowed: `engram-memory/contracts/index.ts`, `engram-memory/engine.ts`, `engram-memory/validation.ts`, the new test, EVOL §5.4–§5.5, `plan/07` l.79, this plan. Gate: memory suite green; `memory-activity-boundary` green.
- [ ] X2 — `invalidateProjections` wiring (D-10 B, decided 2026-10-07; shape FIN §4.2): RED `tests/memory-projection-cascade.test.ts > MemoryPortV2.invalidateProjections authorizes projection_invalidate, runs the cascade over the configured surfaces and returns one cursor receipt`; RED `tests/memory-projection-cascade.test.ts > an unknown projection id is INVALID_SCHEMA and absent surfaces is CAPABILITY_UNAVAILABLE`. Allowed: `engram-memory/contracts/index.ts`, `engram-memory/engine.ts`, `engram-memory/validation.ts`, the test, EVOL §5.5 and §5.9 dependencies, `CHANGELOG.md` (`## Unreleased` entry for the required `authorization` field), this plan. Gate: memory suite green.
- [ ] X3 — SQLite runtime version gate (D-9 A, decided 2026-10-07, after F3 reports the bundled version): RED `tests/sqlite-runtime-version.test.ts > the supported-runtime predicate admits 3.51.3 and later plus the 3.44.6+ and 3.50.7+ backport lines, and refuses the rest` (pure); RED `tests/sqlite-memory-broker.native.test.ts > an open refuses CAPABILITY_UNAVAILABLE when the runtime is below the required minimum` (through an internal seam that can only raise the minimum, never lower it). Allowed: `engram-memory/sqlite.ts`, `tests/sqlite-runtime-version.test.ts`, `tests/sqlite-memory-broker.native.test.ts`, EVOL D8, this plan. Gate: Linux native lane green with zero skips.
- [ ] X4 — durable-backend logical backup/restore (D-11 B, decided 2026-10-07; C discarded): export over the public `CanonicalMemoryStorePort` (journal pages via `readJournal` and record reads, no pending material) plus a store import method (contract change), on the SQLite and Postgres stores. RED `tests/sqlite-memory-broker.native.test.ts > a logical backup of a SQLite store restores the same canonical digests`; RED `tests/postgres-memory-store.native.test.ts > a logical backup of a Postgres store restores the same canonical digests` (runs in the F1 lane). Allowed: `engram-memory/contracts/index.ts`, `engram-memory/logical-backup.ts`, `engram-memory/sqlite.ts`, `engram-memory/postgres.ts`, the lane tests, EVOL §5.9 and `recovery/backup`, this plan. Gate: round-trip green in both lanes with digests verified; the pending quarantine holds (no sealed envelope or control leaves through the export).

## Out Of Scope

- [ ] Postgres go-live and `external-host` activation (owner decision; EVOL governance fallback l.1354).
- [ ] Publication of `engram-memory` and `@engram/memory-contracts` (release decision).
- [ ] R2-b and R2-c (FIN §3.7, with reopen conditions); R2-a unless D-6 includes it.
- [ ] Durable-backend logical backup/restore and `invalidateProjections` wiring are in scope under the decided D-11 B and D-10 B (lots X4, X2).
- [ ] The persistence write-amplification ceiling (EVOL D9 l.1287).

## Feedback Loop

- [ ] Each lot commits its own checkbox updates (this plan, `plan/07`, `BRANCH.md`) in its own commit; the conductor owns commits and Track imports.
- [ ] Each owner decision is recorded in FIN §6 (date and choice) before its lot starts; D-4 and D-7(ii) before F1 merges.
- [ ] A case that cannot fail at baseline is labelled GUARD and carries a mutation run recorded in the PR; a fixture case or an in-test control adds evidence but does not replace it.
