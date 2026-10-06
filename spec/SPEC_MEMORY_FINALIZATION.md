# SPEC — Memory engine finalization (`engram-memory`)

**Date:** 2026-10-06
**Status:** proposed, amended after review round 1 (§7) — for conductor review. This document authorizes no merge, push, tag, publication, migration, or go-live.
**Base:** `origin/main` `c96fc01e` (package `@sentropic/engram` 0.19.1), branch `feat/memory-finalization`.
**Parent (normative):** `spec/SPEC_EVOL_AGENT_MEMORY_SUBSTRATE.md`, cited below as **EVOL** with its line numbers. This document is a delta: every contract change it proposes lands in EVOL through the lot that implements it.
**Plan:** `plan/08-BRANCH_MEMORY_FINALIZATION.md` (lots `F0`–`F14`, triage lots `X*`).
**Registries corrected by this change:** `BRANCH.md` (R2-f, R2-b, R2-c) and `plan/07-BRANCH_AGENT_MEMORY_SUBSTRATE.md` (Lot 0) — see §3.8.
**Excluded:** Postgres go-live and `external-host` activation (owner decision); publication of `engram-memory` (release decision).

## 0. Evidence and vocabulary

Evidence used, and only this evidence:

| Id | Source | Notes |
|---|---|---|
| E1 | code at `c96fc01e`, cited `path:line` | read directly in this worktree |
| E2 | GitHub Actions run `37177756444` (TypeScript CI, `main`, merge of #342, 2026-10-04) | jobs `test (20)` `111363850978`, `test (22)` `111363851095`, `test (24)` `111363851159`: all `success`; per-file outcomes below are quoted from the Node 24 job log, re-fetched on 2026-10-06 with `gh api repos/rhanka/engram/actions/jobs/111363851159/logs` and re-checked against it |
| E3 | npm registry metadata, queried 2026-10-06 | `npm view fs-ext@2.1.1`, `npm view better-sqlite3@12.11.1` |
| E4 | `tsc -p engram-memory/tsconfig.json --listFilesOnly` (tsc 5.4.5, nothing emitted) | the repository pins TypeScript ^6.0.3; `include` semantics are assumed unchanged (unverified for 6.x) |
| E5 | agent/conductor session logs on this workstation, outside the repository | used only to locate the definition of "image ABI" (§3.6) |

Not run: the local test suite (the worktree has no `node_modules`; no install was performed). Every "green" below comes from E2.

Status terms: `done` (code and green test evidence), `partial`, `missing`, `defect` (code contradicts EVOL), `unverified` (claim without evidence reachable from here), `source-gap` (information owned outside this repository), `N-A`, `declared gap` (EVOL records it as intentionally unsupported), `out-of-scope`.
**PROPOSED** marks a contract element, name, or file that does not exist in the code today.
In the RED lists, a case marked "RED at baseline" fails on `c96fc01e` for the stated reason; an unmarked case is a guard that characterizes existing or newly built behaviour, and its non-vacuity is shown by a mutation run recorded in the lot's PR (a fixture case or an in-test control adds evidence but does not replace the mutation run).

## 1. Summary

| # | Item | Observed state | Finalization target | Lots | Owner decision |
|---|---|---|---|---|---|
| 1 | L0 neutrality / boundary / extraction | `partial`: memory-closure vocabulary scan green; legacy memory surfaces gone; `src/agent-stats/**` gone but the subsystem is staged in-repo; repo-wide `@sentropic/*` removal not done and contradicted by product direction; one-way import closure holds but is unenforced; the `./integration` export is not built; README/ARCHITECTURE drift | enforce the closure over sources, generated code, memory tests and documentation examples; scan the packed file list; build every export; fix docs; resolve scope and staging | F5, F6, F11, F12 | D-1, D-2 |
| 2 | L5 assertion reconciliation | `partial`: registry module and the 3 named REDs green; engine never uses `assertion_registry`; `proposal_id` domain ≠ D5; `supersedes` loses its direction; errors labelled `admin`; checkpoint `registry_versions: []`; no application binding | L5a fixes without contract change, then L5b engine reconciliation (contract amendment) | F4, F8, F9, F10 | D-3 |
| 3 | R2-g Postgres CI lane | `missing`: both canonical Postgres files are skipped in CI | dedicated CI job, digest-pinned official images, required mode (a skip becomes a failure); registry and EVOL claims limited to what the lane executes | F1 (+F1b, F1c) | D-4, D-7(ii) |
| 4 | R2-h `multiply_linked` in `readiness()` | `missing`; related `defect`: the factory-wrapped receipt carries fields its `receipt_digest` does not bind | F2 digest fix (no contract change), then F7 additive receipt field | F2, F7 | D-5 |
| 5 | R2-a macOS/Windows fenced SQLite | `declared gap`, fail-closed at open; the Linux proof does not port as-is (unknowns U1–U5) | recommended: remains a declared gap; if included, evidence spikes first | F14 (conditional) | D-6 |
| 6 | "image ABI" | term absent from the repository; definition located in a session log (E5), not ratified | definition to validate; Node-only native smoke, CI step, image-builder note, EVOL D8 wording fix | F3 | D-7 |
| 7 | R2-b shared FS, R2-c cross-process provenance | open in `BRANCH.md` | decided: out of finalization scope, traced | — | override only |
| 8 | Registry | R2-f unchecked; Lot 0 boxes unaligned | corrected in this change | F0 | — |
| X | Found outside the brief | activity ingestion absent; `invalidateProjections` stub with no wiring contract; SQLite version gate absent; logical backup reachable only for the in-memory store; naming drift | triage | X1–X6 | D-8 (X1), D-9 (X3), D-10 (X2), D-11 (X4) |

## 2. CI evidence baseline (E2, Node 24 job)

| File | Outcome on `c96fc01e` |
|---|---|
| `tests/memory-neutrality.test.ts` | pass — `2 tests \| 1 todo` (one real test + one `it.todo`) |
| `tests/memory-activity-boundary.test.ts` | pass — 1 test |
| `tests/memory-v1-removal.test.ts` | pass — 3 tests |
| `tests/assertion-family-registry.test.ts` | pass — 3 tests |
| `tests/integration-surface-neutrality.test.ts` | pass — 4 tests |
| `tests/sqlite-memory-broker.native.test.ts`, `tests/sqlite-fence-nlink.native.test.ts`, `tests/sqlite-fence-shim.native.test.ts`, `tests/canonical-memory-store.test.ts` | pass — 4, 3, 1, 2 tests (Linux native lane executed, not skipped) |
| `tests/store-provenance.test.ts`, `tests/canonical-store-factory.test.ts`, `tests/capability-attestation-gate.test.ts`, `tests/memory-fence-posture.test.ts`, `tests/memory-fence-default-refusal.test.ts` | pass — 8, 6, 3, 4, 3 tests |
| `tests/memory-backup.test.ts`, `tests/memory-projection-cascade.test.ts` | pass — 1, 1 tests (both on the in-memory store or recording fakes) |
| `tests/canonical-memory-store.parity.test.ts` | **skipped** — `1 test \| 1 skipped` |
| `tests/postgres-memory-store.native.test.ts` | **skipped** — `1 test \| 1 skipped` |
| `tests/storage-postgres.test.ts`, `storage-pgvector`, `storage-neo4j`, `storage-spanner`, `storage-postgres-time-window`, `tests/memory-trusttier-roundtrip.test.ts` | pass with exactly 1 skipped live block each |
| `tests/agent-stats*.test.ts` (7 files) | pass — 125 tests: phase15 27, project-graph 33, phase2 26, phase1 16, `agent-stats` 16, h2a-evidence 6, extraction 1 |

## 3. Items

### 3.1 L0 — neutrality, package boundary, extraction

Requirements: EVOL D1 (l.11–32), §2 (l.79–91), §9 L0 row (l.1301); `plan/07` Lot 0 (l.16–24).

#### 3.1.1 Observed state

| Id | Requirement | Observed (evidence) | Status |
|---|---|---|---|
| R0.1 | `engram-memory/contracts` is data-only | `engram-memory/contracts/index.ts` has no import statement; private package `@engram/memory-contracts` (`engram-memory/contracts/package.json`) | `done` |
| R0.2 | dependency/import closure is one-way; runtime, type-only, dynamic, test, fixture, documentation-example and generated-code edges are checked (D1 criteria 1–2, l.24–27) | `engram-memory/*.ts` imports only its own modules, `node:crypto`, `node:fs`, `node:path` and the three declared drivers `better-sqlite3`, `fs-ext` (only from `sqlite.ts`) and `pg` (only from `postgres.ts`) (E1, grep of every `from`/`import()`); no `src/**` file imports `engram-memory`; the tests that import `engram-memory` import only it, `vitest`, `node:` builtins, `pg` and their local fixtures (E1). No test asserts any of this: `tests/memory-neutrality.test.ts:47–71` scans strings, and `tests/integration-surface-neutrality.test.ts` allowlists the imports of `integration.ts` only | `partial` (holds, unenforced) |
| R0.3 | packed closure, emitted `.d.ts` and schemas use only neutral vocabulary (criteria 3–5) | `tests/memory-neutrality.test.ts:47–71` green; its file walk (l.33–44) reads every non-empty file under `engram-memory/` — sources, `dist/`, `package-lock.json` and, in CI, `engram-memory/node_modules/**` — plus a `contracts` declaration emitted on the fly; the forbidden-token list is name-based (l.53–62). The walk is not the `npm pack` file list, and including `node_modules` couples the gate to third-party content (a 3-character forbidden token can appear in any dependency) | `partial` |
| R0.4 | legacy memory compatibility surfaces removed | no `src/memory-*.ts` (`git ls-files`); `tests/memory-v1-removal.test.ts:20,43,80` and `tests/index-memory-surface.test.ts` green | `done` |
| R0.5 | legacy activity subsystem physically extracted into a separately owned module | `src/agent-stats/**` absent; `src/cli.ts` registers no `agent-stats` (`tests/agent-stats-extraction.test.ts:17` green). The subsystem is staged in this repository: `_extracted/agent-stats-h2a-module/` (20 tracked files, private package `agent-stats-h2a-module-staging`), 7 `tests/agent-stats*.test.ts` (125 tests, E2) and 4 `tests/fixtures/agent-stats/*` still run in CI; all 7 test files import the staging module, including `agent-stats-extraction` (l.7). `README.md:257–281` still documents `engram agent-stats …` commands (examples l.264–267, l.277); `ARCHITECTURE.md:32` still lists `src/agent-stats/` | `partial` |
| R0.6 | activity reaches capture only through `ActivityEvidenceSource` | `tests/memory-activity-boundary.test.ts:20` green — a static negative check (no `src/agent-stats`, no `memory-*` import in the staging module). The positive path does not exist: the engine never reads `activity_sources` (finding X1) | `partial` (negative half) |
| R0.7 | no organization-scoped runtime/peer/dev dependency or importing bridge in the repository | `engram-memory` closure: clean (R0.3). Repository: the product is named `@sentropic/engram` (`package.json:2`); `@sentropic/graph` ^0.3.0 and `@sentropic/llm-mesh` ^0.19.0 (dependencies, l.95–96), `@sentropic/agent-stats-core` (optional peer, l.133), `@sentropic/design-system-themes`/`-tokens` (dev, l.188–189); bridges `src/scene-layout.ts:46,50`, `src/llm-mesh-bridge.ts:30`, `src/conversations.ts:183`, `scripts/gen-st-tokens.mjs:23`. `tests/memory-neutrality.test.ts:73` carries `it.todo("repo-wide @sentropic/* dependency removal is deferred to the parallel @sentropic decouple track")` (commit `d37330d4`). 0.19.0 moved the product into the scope and #341 adopted the published `@sentropic/graph` | `missing` repo-wide; in conflict with accepted product decisions → D-1 |
| R0.8 | package layout and exports (D1: rooted at `packages/memory/`, published as an independent package exposing `contracts`, root, `integration`, `sqlite`, `postgres`) | layout is `engram-memory/`; `"private": true`; absent from the root tarball (`package.json` `files: ["dist","src/skills"]`, and the root `src/` never imports it). `engram-memory/package.json` exports `./integration` → `dist/integration.js`, but `integration.ts` is not part of the package program (E4): `engram-memory/tsconfig.json` `include` lists the deleted `service.ts` and omits `integration.ts`, and no included module imports it, so the build does not emit the host-facing surface | `partial`; `defect` on `./integration` |
| R0.9 | L0 records the exact rebased target/intake identities (EVOL l.91) | no such record in `plan/07` or `BRANCH.md` | `unverified` |
| R0.10 | the 2026-08-16 independent verdict "NEUTRAL-OK" (`plan/07` l.93) | written in `7bc9baec` (2026-08-16 13:20 −0400) together with EVOL and `plan/07`, before the first L0 code `b41e40dc` (13:26) and the staging extraction `8d38c60e` (13:59); the review report is not in the repository | design-level verdict; `N-A` as evidence on the implementation |

#### 3.1.2 What is missing (only)

- **M0.1** a test enforcing the one-way import closure over every edge class of D1 criterion 2 (R0.2).
- **M0.2** the vocabulary scan over the real packed file list and the lockfile package names instead of the raw directory tree (R0.3).
- **M0.3** the package build emits every exported subpath; `engram-memory/tsconfig.json` fixed (R0.8).
- **M0.4** documentation drift on agent-stats (R0.5).
- **M0.5** relocation of the staging module to a separately owned home — cross-owner (R0.5, D-2).
- **M0.6** a decision on the organization-scope requirement, and the `it.todo` replaced by an executable assertion or removed (R0.7, D-1).
- **M0.7** EVOL D1 aligned to the real layout (`engram-memory/`, private, publication by a separate release decision) — wording only (R0.8).

#### 3.1.3 Target behaviour

- **T0.1 Import closure.** A pure scanner — a function over `(path, content)` pairs, so inline fixtures can prove it rejects each forbidden edge — extracts every static `import`, `export … from`, `import type`, dynamic `import()`, type-level `import("…")` and ambient `declare module "…"` specifier, and checks four edge sets (EVOL D1 criterion 2):
  - (a) **source**: `engram-memory/**/*.ts` (excluding `node_modules/`, `dist/`) resolves to a relative module inside `engram-memory/`, a `node:` builtin, or a declared driver — `better-sqlite3` and `fs-ext` only from `sqlite.ts` and its ambient shim `sqlite-native.d.ts`, `pg` only from `postgres.ts` and `pg.d.ts`; `contracts/index.ts` has zero imports;
  - (b) **generated code**: after the package build, `engram-memory/dist/**/*.{js,d.ts}` and `engram-memory/contracts/dist/**/*.d.ts` under the same rule (relative specifiers resolve inside the emitted tree);
  - (c) **tests and fixtures**: every `tests/**/*.ts` file that imports `engram-memory`, plus the local modules it reaches through relative imports (fixtures and helpers such as `tests/memory-l3-fixture.ts`, `tests/postgres-ephemeral.ts`), imports only `engram-memory` modules, `node:` builtins, `vitest`, the declared drivers (by name or through `engram-memory/node_modules/<driver>/`) and files of that closure — never `src/**`, `_extracted/**`, or an organization-scoped package;
  - (d) **documentation examples**: a fenced code block of a tracked Markdown file that imports `engram-memory` uses only an exported subpath (`engram-memory`, `/contracts`, `/integration`, `/sqlite`, `/postgres`). No such block exists at baseline: the set is recorded as empty, and detection is proven by the scanner's inline fixture. This check reads the text of the blocks; it does not compile the examples.
  A missing build fails (b) with an explicit message; it never skips.
- **T0.2 Packed closure.** After the package build, the scan runs over exactly the files listed by `npm pack --dry-run --json` in `engram-memory/` (its `files` cover `dist` and `contracts/dist`, declaration maps included, which are the source maps D1 names) plus the package names of `engram-memory/package-lock.json`. Positive control: the list is non-empty and contains `dist/index.js`, `dist/integration.js`, and `contracts/dist/index.d.ts`. `node_modules` contents are no longer scanned as text. A missing build fails with an explicit message; it never skips.
- **T0.3 Built exports.** Every `exports` entry of `engram-memory/package.json` maps to a module of the package program; `integration.ts` is added to the program and `service.ts` removed from `include`.
- **T0.4 Documentation.** No repository document other than `CHANGELOG.md` history advertises an `engram agent-stats`/`graphify agent-stats` command while `src/cli.ts` registers none; `README.md` "Realization tracking: agent-stats" and `ARCHITECTURE.md:32` become a short pointer stating the subsystem left the `engram` CLI.
- **T0.5 Relocation (after D-2).** `_extracted/agent-stats-h2a-module/**`, its six test files (`tests/agent-stats.test.ts`, `-phase1`, `-phase15`, `-phase2`, `-project-graph`, `-h2a-evidence`: 124 tests) and `tests/fixtures/agent-stats/**` leave the repository once the receiving owner has imported them. `tests/agent-stats-extraction.test.ts` holds both sides: its module half (the staging module registers `agent-stats`, l.7, l.16) moves with the module, and its root half (`src/cli.ts` registers no `agent-stats`, l.17) moves into `tests/memory-activity-boundary.test.ts` before the file is deleted. `tests/memory-activity-boundary.test.ts` then also asserts that the staging directory is absent (its legacy-import half would otherwise pass vacuously on an absent directory).
- **T0.6 Organization scope (after D-1).** Recommended option A: the exclusion binds the `engram-memory` build, test, generated-contract and publication closure (enforced by T0.1–T0.2); the root product's `@sentropic/*` dependencies are product dependencies outside the memory boundary; the `it.todo` is removed.
- **T0.7 EVOL D1 text.** "rooted at `packages/memory/`, published as …" becomes "rooted at `engram-memory/`, private until a release decision publishes it".

#### 3.1.4 RED tests

- `tests/memory-neutrality.test.ts > the import-closure scanner rejects a forbidden edge in each scanned set: source, generated code, test closure, documentation example` (inline fixtures; RED until the scanner exists).
- `tests/memory-neutrality.test.ts > engram-memory import closure is one-way across sources, generated code, memory tests and fixtures, and documentation examples` (holds at baseline). Non-vacuity: an in-test control asserts that the scanned sets contain `engram-memory/engine.ts`, `engram-memory/contracts/index.ts`, `engram-memory/dist/index.js` and `tests/memory-l3-fixture.ts`, and a mutation run (a forbidden import added to an `engram-memory` module, never merged) is shown red in the PR; the previous case proves only that the scanner rejects a forbidden edge, not that this case scans the real tree.
- `tests/memory-neutrality.test.ts > packed engram-memory file list and lockfile closure use only neutral vocabulary` (RED at baseline: its positive control requires `dist/integration.js`).
- `tests/memory-package-exports.test.ts > every engram-memory export subpath is built from a module of the package program` (PROPOSED file; RED at baseline: `integration.ts` is outside the program).
- `tests/memory-activity-boundary.test.ts > repository docs advertise no agent-stats command the CLI does not register` (RED at baseline: `README.md:264`).
- After D-2: `tests/memory-activity-boundary.test.ts > the root CLI registers no agent-stats command` (moved from `agent-stats-extraction`; holds at baseline) and `tests/memory-activity-boundary.test.ts > the activity staging module is absent from the repository` (RED until the relocation).
- After D-1 (option A): the `it.todo` at `tests/memory-neutrality.test.ts:73` is deleted; T0.1–T0.2 carry the assertion.

#### 3.1.5 Acceptance

All cases above green in CI on Node 20/22/24; no `todo` left in `memory-neutrality`; `dist/integration.js` present after `npm --prefix engram-memory run build`; EVOL D1 matches the layout; `plan/07` Lot 0 boxes can all be checked (except R0.9 if it stays `unverified`, recorded as such).

#### 3.1.6 Risks

- `npm pack --dry-run` and the generated-code scan inside a test depend on a prior build (CI builds before testing through the root `prebuild` script; a local run without a build must fail loudly, not skip).
- Relocation removes 125 tests from this CI (124 in the six module test files, plus the module half of `agent-stats-extraction`); the receiving repository must run them first. The staging README states the module reuses Engram's git/PR/studio helpers; whether the published `@sentropic/engram` exports them is `unverified`.
- D-1 option B (repo-wide decoupling) would reverse #341 and the 0.18.0 mesh integration — large blast radius.

### 3.2 L5 — assertion reconciliation

Requirements: EVOL §6 (l.1113–1163), D5 (l.132), §9 L5 row (l.1306); `plan/07` Lot 5 (l.61–66).

#### 3.2.1 Observed state, by sub-item

| Sub-item | Observed (evidence) | Status |
|---|---|---|
| descriptors | one closed family `assertion-family:binary-status`, descriptor with digest (`engram-memory/assertion-family-registry.ts:33–42,271–281`) | `done` |
| occurrence keys | `occurrenceKey` (l.293–305) over family, version, key version, scope, subject, predicate (l.128–147) | `done` |
| pure comparators | finite table `relateBinaryStatus` (l.163–176) | `done`, with defect L5-D2 |
| eligibility preconditions | `compare` checks opt-in on both sides, equal scope, equal trust class, `recorded_cursor <= comparison_system_as_of` (l.195–207, 319); no test covers the visibility condition. Lifecycle state at the cursor (accepted current, not expired, not tombstoned, not trust-invalid) exists only in `evaluateReconciliationEligibilityV1` with caller-supplied statuses (l.224–240): exported, untested, unused by the engine; `compare` receives no status by contract (`AssertionComparisonInputV1`). "Citations sufficient for the descriptor" (EVOL l.1159) is not defined for the family | `partial` |
| stable identity | digest of the seven EVOL fields (l.65–80), computed with `receiptDigest("reconciliation-proposal-id", …)` = domain `graphify-memory/reconciliation-proposal-id/v1\0` (`engram-memory/digests.ts:21–25`) instead of EVOL D5 `graphify-memory/proposal/v1\0` (EVOL l.132) | `defect` L5-D1 |
| stable order and duplicate collapse | `sortReconciliationProposals` (l.86–96); no test calls it | `partial` (untested) |
| version drift | unknown family or version → `REGISTRY_VERSION_UNAVAILABLE` (l.283–291), untested; a new registry version stamps a new family version (l.268–269), so new identities (third named test, green). The coupling `family_version := registry_version` is not stated in EVOL | `partial` |
| authorized application | none: `assertion_registry?` is declared (`engram-memory/contracts/index.ts:1055`, EVOL l.1031) but `engine.ts` never reads it; no binding links a proposal to the `dispute`/`supersede`/`resolve_dispute` event that applies it; checkpoint `registry_versions: []` is hard-coded (`engram-memory/memory-store.ts:799`); no reconciliation readiness surface | `missing` |
| error labelling | registry errors carry `operation: "admin"` (l.44–46); `MemoryOperation` (EVOL §5.1) has no reconciliation member | `defect` L5-D3 |
| named REDs | `tests/assertion-family-registry.test.ts:84,127,173` green (E2); `plan/07` l.64–66 unchecked | `done` (registry box lag, §3.8) |

Defects:

- **L5-D1** — proposal identity domain differs from D5. No proposal is persisted anywhere today (no engine or store path stores one; `registry_versions` is always empty), so aligning to D5 needs no migration as long as it lands before any persistence (F10).
- **L5-D2** — `supersedes` is directional, but the proposal orders `left`/`right` by `record_id` (l.313–315) and carries no orientation. An `unknown` (left) refined by a later concrete value (right) and the mirrored case both yield `relation: "supersedes"`; a host cannot tell which record is the successor, while `supersede` needs `record_id` (superseded) and `related_record_id` (successor) (EVOL §5.5, §5.6).
- **L5-D3** — reconciliation errors are labelled as the `admin` operation (the `AdminProviderPort` dispatch, EVOL §5.1).

#### 3.2.2 Target — L5a (no contract change)

- **T5.1** `proposal_id = SHA-256("graphify-memory/proposal/v1\0" || JCS(identity_7))` exactly (EVOL D5); `proposal_digest` keeps the receipt-digest convention.
- **T5.2** Tests cover ordering and collapse, the uninstalled-version refusal, the exported eligibility gate, the intrinsic visibility gate of `compare`, and the evidence citation union.
- **T5.3** EVOL §6 states the coupling: "A registry stamps each family descriptor's `version` with its own `registry_version`; installing a new registry version therefore always yields new proposal identities."
- **T5.4** EVOL §6 states per-family citation sufficiency; for `binary-status`: the primary component's citations (at least one, guaranteed by record validation), and `evidence_citation_ids` is the sorted unique union of both primary components' citation ids (already the behaviour of l.242–249).

#### 3.2.3 Target — L5b (contract amendment, D-3; all elements PROPOSED)

- **T5.5 Directional supersession (decided technically).** `ReconciliationRelation` becomes `"contradicts" | "left_supersedes_right" | "right_supersedes_left" | "needs_adjudication"`; `left`/`right` keep the UTF-8 ascending `record_id` order of EVOL l.1161, and identity and sort keep their definitions over the new values, so mirrored refinements get distinct relations and identities. Rejected alternatives: a `successor_record_id` field outside the identity would give two mirrored proposals the same `proposal_id`; ordering `left`/`right` by role would contradict the record-id ordering of EVOL l.1161.
- **T5.6 Operation member.** `MemoryOperation` gains `"propose_reconciliation"`; registry and engine reconciliation errors use it; `AuthorizationPort` receives it for the per-record authorization of T5.7 step 5 and of the T5.8 recomputation (a port that does not know it denies, which is the fail-closed default).
- **T5.7 Entry point.** `MemoryPortV2.proposeReconciliation(request: ReconciliationRequestV1): Promise<Result<ReconciliationOutcomeV1>>`, read-only, for one pair:
  1. `admitFenced("propose_reconciliation")` (fresh readiness and provenance, like every fencing-dependent operation);
  2. exact-key validation of the request, distinct record ids, else `INVALID_SCHEMA`;
  3. no registry → `CAPABILITY_UNAVAILABLE`; family or version not installed → `REGISTRY_VERSION_UNAVAILABLE`;
  4. pin `comparison_system_as_of` (default: the admitted readiness `high_water_cursor`); a pin above the high-water cursor is refused `STALE_PAGE`, the stores' code for an unavailable system cursor;
  5. for each record, in UTF-8 ascending id order: authorize `propose_reconciliation` with resource `{ record_id }` (same resource-digest binding as other operations); `readRecord` at the pin with that receipt (a record not yet recorded at the pin is `NOT_FOUND`); the record's `scope_ref` must equal the authorized scope, else `UNAUTHORIZED` (as `transition` does, `engine.ts:955`); `canonical_store.revalidate({ record_ids: [record_id], valid_as_of: record.valid_time.t, system_as_of: pin, authorization_receipt_digest, operation: "recall_current" })` — the store stays the final eligibility authority (EVOL l.847). Reconciliation eligibility is defined on the system axis only (EVOL l.1159), while the store's revalidation also filters valid time (`memory-store.ts:768–769`); revalidating each record at its own valid start makes valid-time membership hold by construction (D4: `t <= t`, `t <= t_end`), so the store decides state, tombstone, expiry and trust only. The request therefore has no `valid_as_of`;
  6. eligibility: if either id is absent from its packet's `eligible_record_ids`, the outcome is `eligible: false` with no proposal (not an error); otherwise `evaluateReconciliationEligibilityV1` runs with both statuses `{ state: "accepted_current", unexpired: true, dependency_eligible: true }` (one gate function shared with the library path of D-3 B);
  7. `registry.compare`;
  8. return the outcome; no journal write, no cursor allocation.
  DTOs:
  ```ts
  interface ReconciliationRequestV1 {
    family_id: OpaqueRef;
    family_version: string;
    left_record_id: string;                  // caller order is free; the outcome normalizes it
    right_record_id: string;
    comparison_system_as_of?: Cursor;        // default: readiness high_water_cursor
    authorization: AuthorizationContextV1;
    deadline_at: Instant;
  }

  interface ReconciliationOutcomeV1 {
    registry_id: OpaqueRef;
    registry_version: string;
    family_id: OpaqueRef;
    family_version: string;
    left_record_id: string;                  // UTF-8 ascending
    right_record_id: string;
    comparison_system_as_of: Cursor;
    eligible: boolean;
    proposal?: ReconciliationProposalV1;     // present only when eligible and the comparator relates the pair
    eligibility_digest: Digest;
    receipt_digest: Digest;
  }
  ```
  Digests (EVOL D5 gains both formulas):
  ```text
  eligibility_digest = SHA-256("graphify-memory/reconciliation-eligibility/v1\0" || JCS({
                         comparison_system_as_of,
                         records: [{ record_id, record_digest, authorization_receipt_digest,
                                     revalidation_receipt_digest }]  // both records, UTF-8 ascending record_id
                       }))
  receipt_digest     = SHA-256("graphify-memory/reconciliation-outcome/v1\0" || JCS(outcome_without_receipt_digest))
  ```
  `revalidation_receipt_digest` is the `receipt_digest` of the record's `RevalidationPacketV1`, which binds the store's verdict. Both digests use the existing `receiptDigest` helper (`engram-memory/digests.ts:21–25`).
- **T5.8 Authorized application.** `LifecycleCommandV1` for `dispute`, `supersede`, `resolve_dispute` gains an optional `reconciliation?: { proposal: ReconciliationProposalV1; registry_id: OpaqueRef; registry_version: string }`. On `transition`, before any cursor allocation:
  - the registry with that id and version must be installed, else `REGISTRY_VERSION_UNAVAILABLE` (only this transition is refused; recall and unbound transitions are unaffected);
  - the engine recomputes the outcome for the proposal's family, version, pair and `comparison_system_as_of` through T5.7 steps 5–7, authorizing `propose_reconciliation` on both records with the command's authorization context, and requires an eligible outcome whose `proposal_digest` equals the bound one, else `INVALID_DIGEST` (an authorization denial surfaces as `UNAUTHORIZED`);
  - the command must match the proposal: record ids within `{left, right}`; `supersede` only for a directional relation, with `record_id` = the superseded record and `related_record_id` = the successor (for `left_supersedes_right`: `record_id` = right, `related_record_id` = left); otherwise `ILLEGAL_TRANSITION`;
  - the lifecycle authorization itself is unchanged (the action of EVOL §5.6).
  The persisted `LifecycleEventV2` gains an optional `reconciliation?: { proposal_id; proposal_digest; family_id; family_version; registry_id; registry_version }`, bound into `event_digest`. Fold and replay read these stored fields and never call the registry.
- **T5.9 Checkpoint.** `RecoveryCheckpointManifestV1.registry_versions` = sorted unique `(registry_id, registry_version)` over reconciliation-bound events with `cursor <= through_cursor`, on every backend (replaces `[]`).
- **T5.10 Reconciliation readiness.** Realized by T5.7/T5.8 refusing `REGISTRY_VERSION_UNAVAILABLE`; no new readiness method; ordinary recall stays available (EVOL l.1163).

#### 3.2.4 RED tests

L5a (`tests/assertion-family-registry.test.ts`):
- `> proposal_id is SHA-256 over the D5 proposal domain and exactly the seven identity fields` (RED at baseline, L5-D1; the expected digest is recomputed in the test with `node:crypto` and the exported `canonicalizeJcs`).
- `> proposals sort by occurrence key, left id, right id, relation and exact duplicates collapse by id`.
- `> an uninstalled family id or version is REGISTRY_VERSION_UNAVAILABLE and proposes nothing`.
- `> evaluateReconciliationEligibilityV1 refuses non-current, expired, or dependency-ineligible statuses and status/record id mismatches` (direct call of the exported gate).
- `> compare proposes nothing when either record was recorded after comparison_system_as_of` (the intrinsic visibility gate of `compare`, l.182–186, 205–206).
- `> evidence_citation_ids are the sorted unique union of both primary components' citations`.
- `compare` receives no lifecycle status by contract, so no L5a case asserts a lifecycle refusal through it; that half is the engine's (F9, second case below).

L5b (every case RED at baseline: the relation values, operation member, method, fields and test file do not exist):
- `tests/assertion-family-registry.test.ts > supersession carries its direction: mirrored refinements yield distinct relations and identities` (RED at baseline, L5-D2).
- `tests/assertion-family-registry.test.ts > registry errors are labelled propose_reconciliation, never admin` (RED at baseline, L5-D3).
- `tests/memory-reconciliation.test.ts > proposeReconciliation reads only, allocates no cursor, and refuses CAPABILITY_UNAVAILABLE without a registry` (PROPOSED file).
- `tests/memory-reconciliation.test.ts > records ineligible at the pinned cursor (tombstoned, expired, trust-invalid, historical) yield an ineligible outcome with no proposal`.
- `tests/memory-reconciliation.test.ts > eligibility is decided on the system axis: a refinement whose valid intervals do not overlap is still proposed`.
- `tests/memory-reconciliation.test.ts > the outcome binds registry, family, pair, pin, per-record eligibility and proposal under the reconciliation-outcome and reconciliation-eligibility domains`.
- `tests/memory-reconciliation.test.ts > an uninstalled registry version refuses reconciliation while recall stays available`.
- `tests/memory-reconciliation.test.ts > a dispute or supersede bound to a proposal persists family and registry versions in the event digest, and replay never calls the registry`.
- `tests/memory-reconciliation.test.ts > a forged or mismatched proposal binding is refused before any cursor allocation`.
- `tests/memory-journal-replay.test.ts > checkpoint registry_versions lists every registry version bound by journal events through the cursor`.
- `tests/canonical-memory-store.parity.test.ts` corpus extended with one reconciliation-bound transition (needs F1).

#### 3.2.5 Acceptance

All cases green (Linux native lane and Postgres lane included); `plan/07` Lot 5 boxes checked; EVOL D5, §5.1, §5.5, §5.6, §5.9 (checkpoint sentence) and §6 amended; no declared engine dependency left unused.

#### 3.2.6 Risks

- A new `MemoryOperation` member breaks exhaustive `switch` checks in host code at compile time (external consumers: `source-gap`).
- Recomputing a proposal at application time needs both records readable at the stored cursor; retention may make that impossible → refusal (fail-closed, documented). The store's revalidation judges expiry against its clock, not the pin (`memory-store.ts:771`), so a record that expired after the proposal also makes the binding refuse.
- Directional relations change identities and sort keys; acceptable only because nothing is persisted yet (F4 and F8 must land before F10).

### 3.3 R2-g — execute the canonical Postgres lane in CI

#### 3.3.1 Observed state

- Gates: `tests/canonical-memory-store.parity.test.ts:128–129` and `tests/postgres-memory-store.native.test.ts:33–34` run only if `dockerAvailable() && MATRIX.every(postgresImageAvailable)`; `tests/postgres-ephemeral.ts:18–26` probes `docker version` and `docker image inspect postgres:<major>`; `GRAPHIFY_MEMORY_SKIP_DOCKER=1` forces the skip.
- Provisioning: the harness starts its own server per version with `docker run -d … -p 127.0.0.1:0:5432 postgres:<major>` (`tests/postgres-ephemeral.ts:57–64`) and waits through `docker exec … pg_isready` plus a client probe (l.28–48).
- CI: one `test` job, `ubuntu-latest`, Node 20/22/24, no image pre-pull, no `services:` (`.github/workflows/typescript-ci.yml:11–53`) → both files `1 skipped` (E2). The log does not say which half of the gate closed. That GitHub-hosted Ubuntu runners ship a Docker engine, which would leave the image probe as the closed half, is `unverified` as a whole; T-g1's required mode reports the cause on the first run.
- The parity test opens SQLite without `allow_ephemeral_filesystem_store` (`tests/canonical-memory-store.parity.test.ts:108,113`), unlike the other native fixtures; on a runner whose temporary directory is tmpfs or overlayfs the SQLite half would be refused (runner filesystem type `unverified`).
- What the two files compare once they run: the parity test collects, from a reopened store, the high-water cursor, checkpoint state/journal-root/blob-root digests, every event digest, the accepted snapshot and eligibility digests, the accepted ids and the outbox batch (`tests/canonical-memory-store.parity.test.ts:73–99`); the native test covers atomic promotion under a failpoint and generation fencing (`tests/postgres-memory-store.native.test.ts:36–94`). Neither compares transaction-receipt digests, drives an illegal transition, or runs a logical backup (which no durable store can run, X4).
- `plan/07` l.74–75 record a local green and non-vacuous run on Postgres 16 and 17; no artifact of that run exists in the repository (`unverified`). EVOL marks both lanes "not covered — no CI lane" (l.1307, l.1318, l.1320) and D2 keeps the `external-host` Postgres backend unsupported until the L6 parity gate passes (l.41).

#### 3.3.2 Target

- **T-g1 Required mode.** With `ENGRAM_MEMORY_REQUIRE_POSTGRES=1` (PROPOSED test environment name; new names use the `ENGRAM_*` prefix per the 0.19.0 changelog) a closed gate fails the file with its cause (Docker absent, image absent) instead of `it.skip`. Without it, behaviour is unchanged (local skip).
- **T-g2 Pinned images.** The harness uses `ENGRAM_MEMORY_POSTGRES_IMAGE_16` / `_17` (PROPOSED) when set, else `postgres:<major>`; CI sets digest-pinned references to the official `postgres` images (digests captured when the lot is implemented and recorded in its PR for owner approval, D-4) and pre-pulls exactly those references.
- **T-g3 CI job** `memory-postgres` (PROPOSED), in `.github/workflows/typescript-ci.yml`: `ubuntu-latest`, Node 24, `npm ci --legacy-peer-deps` (the postinstall provides `pg`, `better-sqlite3`, `fs-ext` under `engram-memory/node_modules`; this install runs node-gyp like every `test` job, §3.6.2, D-7(ii)), `docker pull` of both references, then `ENGRAM_MEMORY_REQUIRE_POSTGRES=1 npx vitest run tests/canonical-memory-store.parity.test.ts tests/postgres-memory-store.native.test.ts`. The parity test's SQLite opens set `allow_ephemeral_filesystem_store: true` like the other native fixtures (the parity predicate concerns canonical digests, not durability).
- **T-g4 Registry and spec, limited to what the lane executes.** Once green on the PR (the first `main` run after the merge confirms it):
  - EVOL L6 note (l.1307): the two named L6 Postgres tests run in CI job `memory-postgres` (Postgres 16, 17);
  - §10 `canonical state` (l.1318): Postgres added for the state, event and snapshot digests of the lifecycle corpus; transaction-receipt digest parity and illegal-transition no-write stay `not covered` on Postgres;
  - §10 `Postgres parity` (l.1320): executed — canonical digest parity (state, journal root, blob root, events, snapshot, eligibility, accepted ids, outbox), the dense journal, accepted-only lexical, reopen replay, atomic promotion under a failpoint, generation fencing; `not covered` — receipt parity and logical backup;
  - §10 `recovery/backup` (l.1324): annotated "logical backup/restore runs over the in-memory canonical model only (X4, D-11)"; no Postgres claim;
  - the D2 sentence (l.41) is unchanged: its gate is not met while D9's logical-backup and receipt parity (l.1283) are not executed;
  - `plan/07` l.74–75 annotated with the CI job; `plan/07` l.70 stays open (cross-backend receipt parity and durable-backend logical backup); `BRANCH.md` R2-g checked with the note that the lane uses digest-pinned images through the harness (D-4 A), not service containers.
  Postgres go-live stays an owner decision.
- **Why not service containers for these two files.** The harness provisions a fresh server per version and test through the Docker CLI and relies on that for clean state and reopen semantics. Service containers would require a second provisioning path (connection strings from the environment plus per-test `CREATE/DROP DATABASE` isolation), making CI differ from local runs. Pre-pull plus required mode exercises the exact local path. Service containers stay the right tool for the URL-gated storage lanes below (option B of D-4 if the owner prefers them anyway).

**Do the `storage-{postgres,pgvector,neo4j,spanner}` lanes follow?** Not as part of the R2-g gate: they are projection backends (EVOL D3), outside the L6 canonical-parity predicate. They can follow in the optional lot F1c, with service containers because they are gated on connection URLs:
- `GRAPHIFY_TEST_POSTGRES_URL` gates `tests/storage-postgres.test.ts:682`, `tests/storage-postgres-time-window.test.ts:389`, `tests/storage-pgvector.test.ts:564`, `tests/memory-trusttier-roundtrip.test.ts:144`; pgvector runs `CREATE EXTENSION IF NOT EXISTS vector` (`src/storage/vector/pgvector.ts:113`), so the service image must ship the extension (a pgvector-enabled Postgres image; exact tag `unverified`).
- `GRAPHIFY_TEST_NEO4J_URI` (+ `GRAPHIFY_NEO4J_USER`/`PASSWORD`) gates `tests/storage-neo4j.test.ts:641`.
- `SPANNER_EMULATOR_HOST` gates `tests/storage-spanner.test.ts:652`; the adapter opens an existing instance and database (`src/storage/spanner.ts:409`), so the emulator needs a provisioning step whose procedure is `unverified`.

#### 3.3.3 RED tests

- `tests/postgres-ephemeral.test.ts > a required Postgres lane fails instead of skipping when Docker or an image is unavailable` (PROPOSED file; pure decision function; RED at baseline).
- `tests/postgres-ephemeral.test.ts > image references honour the pinned override and default to postgres:<major>`.
- Lane-level: the CI job itself on the PR.

#### 3.3.4 Acceptance

`memory-postgres` green on the PR with both files reporting `1 test` passed and `0 skipped`, and the log showing both images started; a one-off mutation run (an expected digest deliberately corrupted, never merged) shown red in the PR; the three `test` jobs unchanged; the T-g4 updates landed in the same lot, with no coverage claim beyond T-g4.

#### 3.3.5 Risks

- First execution in CI may expose a real parity defect (the lane has not run since L6b while the fence, provenance and rename work landed) → F1b fixes it in `engram-memory/postgres.ts` within the same gate.
- Registry pulls can fail or be rate-limited → the required job fails loudly (intended); mitigation: retry step, or an owner-approved mirror.
- Making `memory-postgres` a required status check is a branch-protection change (owner/admin action).
- Runtime: two sequential servers per test, 180 s test timeout (`tests/canonical-memory-store.parity.test.ts`).

### 3.4 R2-h — expose `multiply_linked` in the `readiness()` receipt

#### 3.4.1 Observed state

- `st_nlink > 1` is refused once at open (`engram-memory/sqlite.ts:176–189`); a link created after open leaves operations admitted, frozen by `tests/sqlite-fence-nlink.native.test.ts:61` ("holds operations open when a hard link appears AFTER open, and refuses only at the next reopen"). EVOL residual (i) (l.1264) and the R2-h follow-up (l.1266) describe the gap.
- `OperationalCapabilityReceiptV1` (`engram-memory/contracts/index.ts:819–834`, EVOL l.996–1012) has no link-count field; builders: SQLite `engram-memory/sqlite.ts:573–588`, Postgres `engram-memory/postgres.ts:392–406`, memory `engram-memory/memory-store.ts:851–859`.
- No JSON Schema exists for this receipt (`engram-memory/schemas.ts` exports only `CANDIDATE_PAYLOAD_V2_SCHEMA` and `MEMORY_RECORD_V2_SCHEMA`). `additionalProperties: false` applies normatively through EVOL §4 (l.141); in code the receipt has only its static TypeScript type: no runtime exact-key validator exists for it — the engine's private `exactObject` checks (`engram-memory/engine.ts:72`) cover request DTOs and port results such as `RedactionResultV1`, not this receipt, and `verifyStoreProvenance` does not inspect its shape (`engram-memory/store-factory.ts:82–99`). External hosts' validators: `source-gap`.
- Receipts are ephemeral (`issued_at`/`expires_at`) and never persisted: `operational-capability` digests appear only in the three builders. Adding a field invalidates no stored digest.
- **Defect R2-h-D1.** The factory wrapper (`engram-memory/store-factory.ts:154–162`) adds `adapter_id`, `adapter_version`, `adapter_build_digest` after the store computed `receipt_digest` (`sqlite.ts:587`, `postgres.ts:404`). The returned digest therefore does not bind those fields, contrary to EVOL l.1011 ("over the receipt WITHOUT receipt_digest"); the code comment `store-factory.ts:22–24` states the identity is "never in a digest". No test recomputes a receipt digest.

#### 3.4.2 Target

- **F2 (no contract change).** The factory wrapper recomputes `receipt_digest` with the `operational-capability` domain over the final receipt, adapter identity included; the comment at `store-factory.ts:22–24` is corrected. A relay can then no longer alter a declared identity without detection.
- **F7 (contract revision R2-h, D-5; PROPOSED).**
  - `OperationalCapabilityReceiptV1.multiply_linked?: boolean` — present if and only if `backend === "sqlite"`; `true` iff `fstat` of the fence descriptor reports `nlink > 1n` at that `readiness()` call; absent on memory and Postgres receipts. The name follows EVOL l.1266.
  - Computed from the fence descriptor through an internal lock method (PROPOSED name `linkCount(): bigint` on the internal `FencedLockV1`), after `#fence` succeeds; an `fstat` failure on that descriptor fails `readiness()` with `STORE_UNAVAILABLE`.
  - An alarm, never a refusal: the provenance gate and every operation ignore the field (no `FENCE_LOST`, no `CAPABILITY_UNAVAILABLE` on `true`); the open-time refusal is unchanged; no flag permits a multiply-linked store (EVOL l.1266).
  - Bound by `receipt_digest` (computed after the field is set).
  - Not mirrored in `CapabilityDescriptorV1` (one fresh source, `readiness()`).
  - **Evolution rule** (proposed addition to EVOL §4, first applied here): "Within a `…V<n>` DTO, an OPTIONAL field may be added only by a dated EVOL amendment stating its presence condition, together with an entry under `## Unreleased` in the repository `CHANGELOG.md` naming the DTO, the field and that condition. The version consequence is set by the release decision: `engram-memory` is private at `0.0.0` and unpublished (`engram-memory/package.json:2–4`). A required field, a removed field, or a changed meaning requires a new `…V<n+1>` DTO." `CHANGELOG.md` has no `## Unreleased` heading today; the first lot that needs one creates it.
  - The R2-f residual comment (`close()` releases the fence after `database.close()`, `sqlite.ts:632–642`) lands in the same lot, since it touches the same file.

#### 3.4.3 RED tests

- F2: `tests/canonical-store-factory.test.ts > a factory-wrapped readiness receipt_digest binds every field, including the declared adapter identity` (RED at baseline).
- F7: `tests/sqlite-fence-nlink.native.test.ts > readiness reports multiply_linked false for a single-named database and true after a post-open hard link, with operations still admitted` (RED at baseline: field absent).
- F7: `tests/sqlite-fence-nlink.native.test.ts > multiply_linked is bound by receipt_digest` (RED at baseline).
- F7: `tests/memory-fence-posture.test.ts > memory receipts omit multiply_linked`; the Postgres omission is asserted in `tests/postgres-memory-store.native.test.ts` (runs in the F1 lane).
- F7: `tests/capability-attestation-gate.test.ts > a multiply_linked receipt is an alarm: fencing-dependent operations are still admitted`.

#### 3.4.4 Acceptance

All cases green, Linux native lane and Postgres lane included; EVOL §5.9 receipt, l.1264 residual (i), l.1266 follow-up and §4 evolution rule amended; the `CHANGELOG.md` `## Unreleased` entry drafted (release is the owner's).

#### 3.4.5 Risks

Strict external validators would reject the new optional field (`source-gap`); one extra `fstat` per `readiness()` (already one per operation through `admitFenced`) is negligible; `st_nlink` on overlayfs may not reflect the underlying inode (`N-A` in production, which refuses overlayfs; harness only).

### 3.5 R2-a — macOS and Windows for the fenced SQLite store

#### 3.5.1 Observed state

- Non-Linux platforms are refused at open with `CAPABILITY_UNAVAILABLE` (`engram-memory/sqlite.ts:655–657`). The proof reads `/proc/self/fdinfo/<fd>` (l.200), classifies the filesystem through `statfs("/proc/self/fd/<fd>")` (l.173), checks `(dev, ino)` against the path (l.207–208) and `nlink` (l.176–189). EVOL §5.9 (l.1053) and D8 (l.1258–1260) declare macOS/Windows a gap; §10 "SQLite ownership" says they fail closed.
- §10 "contract/schema/neutrality" requires "Node 20 and 22; Linux, macOS, Windows" (l.1316), while CI runs only `ubuntu-latest` (`typescript-ci.yml:12`): the cross-OS half of that row is not executed, independently of native support.
- `plan/07` l.59 still reads "native lane mandatory Linux/macOS/Windows", stale against the EVOL L4 row (l.1305).

#### 3.5.2 Proof obligations any port must re-establish

P1 an exclusive non-blocking writer lock that does not block SQLite's own locking or I/O on its separate handle; P2 a per-operation liveness proof that this store's handle holds the lock, detecting a non-functional binding before any write; P3 anti-rename (path ↔ locked file identity); P4 refusal of network, removable and unknown filesystems on the actual open handle; P5 single-name check; P6 durable epoch (portable SQL, unchanged); P7 fence released only after the database connection closes.

#### 3.5.3 Unknowns (each `unverified`; each needs a spike before design)

- **U1 (macOS)** whether a BSD `flock` on the database file conflicts with the POSIX `fcntl` byte-range locks SQLite takes on a separate descriptor. On Linux they are independent, which is the premise of the no-sidecar design; if they conflict, the inode-flock design does not port and a dedicated lock file (the sidecar EVOL retired) or another mechanism is needed.
- **U2 (macOS)** no per-descriptor kernel lock record reachable from Node; candidate: a contention probe from a second descriptor (expect `EWOULDBLOCK`), which proves an exclusive lock exists on the inode, not that this descriptor holds it — acceptability against the threat model needs review.
- **U3 (Windows)** byte-range locks are mandatory; whether `fs-ext` provides `flock` on Windows and which range it locks is `unverified` (its README shows a Windows CI badge only); a whole-file lock from a second handle would block SQLite's own I/O, so an out-of-band range or another mechanism is required.
- **U4 (both)** filesystem classification by handle: Node's `fs.statfs` takes a path and returns only a numeric `type`; macOS type numbers are not documented as stable identifiers and the name field is not exposed by Node; the Windows value is `unverified`. Likely a native helper, i.e. a new native dependency (supply-chain decision).
- **U5 (both)** whether `fs-ext` builds on macOS/Windows runners: `npm ci` must succeed there even for a pure (non-native) lane, because the root postinstall installs the `engram-memory` dependencies.

#### 3.5.4 Target if included (D-6 B or C)

Per platform, an opener satisfying P1–P7 with platform-native evidence, stamping the fence mark only after them, and keeping fail-closed for any unproven platform; a native suite per platform on macOS and Windows runners with zero skips; EVOL §5.9, D8 and §10 amended. The public opener signature stays unchanged; everything else is internal.

#### 3.5.5 Recommendation

Keep R2-a a declared gap outside finalization (D-6 A): the production target is Linux (Kubernetes block PVC, EVOL l.1262); fail-closed elsewhere is safe; the work needs new native code or a new dependency and two new runner families; U1 may force re-introducing a sidecar EVOL retired on security grounds. Amend §10 "contract/schema/neutrality" to the executed matrix (Linux; Node 20/22/24), or add a pure cross-OS lane if U5 proves cheap.

RED (only if included): spike evidence first (F14a, nothing merged), then per-platform cases such as `tests/sqlite-fence-platform.native.test.ts > macOS: a non-functional lock binding is refused before any write` (PROPOSED) and the existing `tests/sqlite-memory-broker.native.test.ts` titles run on each platform.

### 3.6 "Image ABI"

#### 3.6.1 Source

No occurrence in the repository (grep, including `.track/`). E5 contains two mentions:
- a memory-seat message to the conductor, 2026-09-24 (session `ae1077ea`): « fs-ext / ABI Node : figer/vérifier l'ABI better-sqlite3+fs-ext dans l'image CI (un mismatch = natifs muets) » — "pin/verify the better-sqlite3 + fs-ext ABI in the CI image (a mismatch silences the natives)"; the same session lists a "fs-ext/Node-ABI image constraint";
- the conductor's backlog line: "R2 backlog: R2-g (PG CI lane), image ABI, R2-a/b/c, R2-h".
Status: definition located outside the repository, not ratified → proposed below for validation (D-7).

#### 3.6.2 Facts

- `fs-ext@2.1.1` depends on `nan` with install script `node-gyp configure build` (E3; `engram-memory/package-lock.json:163–174`, `hasInstallScript`): a NAN addon compiled at install for one Node ABI (`process.versions.modules`), platform, architecture and libc — not N-API, so it must be rebuilt for each Node major. Compiling needs a C++ toolchain and node-gyp's Python.
- `better-sqlite3@12.11.1` installs with `prebuild-install || node-gyp rebuild --release` (E3): it downloads a prebuilt binary for the ABI/platform/libc at install time, or compiles.
- node-gyp — hence Python — already runs in CI today: every `test` job's `npm ci` triggers the root postinstall (`package.json:45`), which installs `engram-memory` and compiles `fs-ext`; the root install also runs `tree-sitter-lua@2.1.3`'s `node-gyp rebuild`. On the Node 24 job npm lists these install scripts as "not yet covered by allowScripts" (E2, step `Install dependencies`); the Linux native lane passed in that job, so the scripts ran. Whether a later npm default stops running unapproved install scripts is `unverified`; if it does, `fs-ext` is not built and the smoke below reports `MODULE_MISSING`. Approving the scripts is a root `package.json` change, outside this plan (owner).
- EVOL D8 calls `fs-ext` "the declared `fs-ext` N-API binding" (l.1260) — inconsistent with E3.
- The repository has no Dockerfile/Containerfile (`git ls-files`); any production image is built elsewhere (`source-gap`).
- CI installs fresh per Node matrix job, without cache (`typescript-ci.yml:20–28`), so the ABI matches by construction today.
- A load failure fails closed: `import("fs-ext")` failing → `CAPABILITY_UNAVAILABLE` "the SQLite writer fence was refused: <cause>" (`sqlite.ts:168,665–676`); `better-sqlite3` failing → `CAPABILITY_UNAVAILABLE` "the declared better-sqlite3 driver or SQLite initialization is unavailable" (l.714–717). In CI the native tests import the drivers by path and are not skip-gated (e.g. `tests/sqlite-memory-broker.native.test.ts:37`), so a mismatch turns them red; refusal-asserting native tests check the cause (`tests/sqlite-fence-nlink.native.test.ts:58,76`) or carry a positive control (`tests/sqlite-fence-shim.native.test.ts:11–15,42–43`), so they cannot pass vacuously. The silent case is an image where no native lane runs: it boots and fails only at the first fenced open.
- `BRANCH.md` G2 (fdinfo `lock:` records present on the target kernel, "a MERGE BLOCKER") has no evidence in the repository (`unverified`); a smoke on the target image can produce it.

#### 3.6.3 Proposed definition (to validate, D-7)

"Image ABI: every runtime image (CI runner or container) that executes the fenced SQLite store carries `better-sqlite3` and `fs-ext` binaries built for that image's Node ABI (`process.versions.modules`), platform, architecture and libc, and proves it at image build time with a load-and-lock smoke, instead of discovering a mismatch at the first fenced open."

#### 3.6.4 Target

- **T-abi1** `scripts/check-native-abi.mjs` (PROPOSED; Node only, no Python): prints `process.versions.node`, `process.versions.modules`, `process.platform`, `process.arch` and the libc (`process.report.getReport().header.glibcVersionRuntime`, else "non-glibc"); resolves and loads both addons with `createRequire(<repository>/engram-memory/package.json)` — the resolution the package itself uses, whatever the hoisting — so an absent `engram-memory/node_modules` (postinstall not run) is reported, never worked around; opens `:memory:` with `better-sqlite3` and prints `sqlite_version()`; on Linux takes `flockSync(fd, "exnb")` on a temporary file — or on a file under an optional directory argument, so an image build or a pod can run it on the target volume — and requires `/proc/self/fdinfo/<fd>` to show the lock (the G2 evidence); on any other platform exits with `PLATFORM_UNSUPPORTED` before the lock step (the fenced store is Linux-only, EVOL §5.9). Exit causes: `ABI_MISMATCH` (load error naming `NODE_MODULE_VERSION` or `ERR_DLOPEN_FAILED`), `MODULE_MISSING`, `LOCK_UNPROVEN`, `PLATFORM_UNSUPPORTED`. The classifier is exported for unit tests.
- **T-abi2** CI: run the smoke in each `test` matrix job right after `npm ci`.
- **T-abi3** `docs/NATIVE_ABI.md` (PROPOSED) for image builders: build the addons with the runtime's exact Node major and libc; never copy `node_modules` across Node majors or between glibc and musl; run the smoke as an image build step; `fs-ext` always compiles from source (D-7(iii)).
- **T-abi4** EVOL D8 l.1260: "N-API binding" → "a NAN-based native addon compiled at install (bound to the Node ABI)".

#### 3.6.5 RED tests

- `tests/native-abi-smoke.test.ts > a load error naming another NODE_MODULE_VERSION is classified ABI_MISMATCH and a missing module MODULE_MISSING` (PROPOSED file; pure; RED at baseline: script absent).
- `tests/native-abi-smoke.test.ts > the smoke verdict matches the platform: exit 0 with both addons loaded and the flock in fdinfo on Linux, PLATFORM_UNSUPPORTED elsewhere` (one case, never skipped; CI exercises the Linux branch; RED at baseline: script absent).

#### 3.6.6 Acceptance and risks

Acceptance: smoke step green on Node 20/22/24; document present; EVOL wording fixed; D-7(i) recorded.
Risks: node-gyp needs Python at install time — already the case in every CI `test` job (§3.6.2) and in any image that compiles `fs-ext`; the owner rule "no Python in repositories or jobs" must explicitly accept or forbid it (D-7(ii) for CI, gating only F1's merge; D-7(iii) for images, gating no lot of this plan); `better-sqlite3` prebuilds are downloaded at install (network and supply chain at image build); musl images need musl prebuilds or compilation; a later npm default that skips unapproved install scripts would leave the addons unbuilt (`unverified`, detected by the smoke).

### 3.7 R2-b and R2-c — decision: out of finalization scope

Decided here (decide-and-trace; the owner may override):

- **R2-b, shared-filesystem canonical store (NFS/CephFS).** EVOL D-A (l.57–59) makes the SQLite store single-node and routes multi-node to Postgres; network filesystems are refused in-process on the open descriptor and by the Kubernetes constraint (l.1262). A network-filesystem fence needs a lease or lock-manager design with its own proof — a new capability, not a finalization residue. The multi-node need is served by the Postgres backend, whose parity R2-g executes.
- **R2-c, `external-host` cross-process provenance.** EVOL §5.9 (l.1053) keeps `external-host` design-reserved ("an in-process mark does not cross a process boundary"); the governance fallback (l.1354) keeps `embedded-local` the sole operational mode until the operating agreement is signed and W-C/ARCH-06 is lifted. Nothing can be finalized ahead of that gate.

Trace: this section; the "Out of scope" section of `plan/08`; `BRANCH.md` R2-b and R2-c annotated with a pointer (this change; both stay unchecked).
Reopen conditions: R2-b — an owner requirement for SQLite on shared storage naming the lock manager; R2-c — the operating agreement signed and W-C/ARCH-06 lifted.

### 3.8 Registry correction

Done in this change:
- `BRANCH.md` R2-f checked, with evidence: #338 (`e431773c` refusal at open, `2a8d0773` rationale, `97e52645` open-time freeze test, `d2751f4a` deterministic teardown), released in 0.19.1 (`CHANGELOG.md` 0.19.1). Residual recorded on the line: the `close()` ordering comment asked by R2-f is absent (`engram-memory/sqlite.ts:632–642`) → plan/08 F7.
- `BRANCH.md` R2-b and R2-c annotated "out of finalization scope" with a pointer to §3.7.
- `plan/07` Lot 0 boxes aligned to §3.1: the first three implementation boxes stay unchecked with their observed state; the first RED stays unchecked (vocabulary half green under its real title, one-way half missing); the second RED is checked as subsumed into the single scan (EVOL §9 L0 row); the activity-boundary and v1-removal REDs are checked.

Residual registry inaccuracies, deliberately not changed (outside the brief; for the conductor):
- `plan/07` l.64–66: the three L5 REDs exist and are green, boxes unchecked (l.63 rightly open).
- `plan/07` l.59: "native lane mandatory Linux/macOS/Windows" is stale.
- `plan/07` l.74–75: the Postgres REDs are checked although CI skips them (local evidence only); l.70 stays open, also after F1 (receipt parity and durable-backend logical backup, §3.3.2 T-g4, X4).
- `plan/07` l.79: "activity-source ingestion" is checked although the engine has no ingestion path (X1).
- `plan/07` l.93: design-level verdict (R0.10).
- `BRANCH.md` G1–G4 unchecked although the v5 unit merged: G3 is evidenced by E2 (Linux native lane executed); G1, G2, G4 evidence is not in the repository (`unverified`).

## 4. Findings outside the brief (triage)

| Id | Finding (evidence) | Disposition |
|---|---|---|
| X1 | Activity evidence ingestion absent. EVOL §5.4 (l.479): "The engine converts each evidence DTO to an ordinary `CaptureRequestV2`". `activity_sources` is declared in the dependencies but never read under `engram-memory/` (grep; only `contracts/index.ts` names it); fixtures pass `activity_sources: []` (`tests/memory-l7-fixture.ts:140`); `plan/07` l.79 checks "activity-source ingestion". `ActivityEvidenceV1` (EVOL l.443–453) carries no `scope_ref`, `purpose_ref`, `retention` or consent, so a conversion needs host-supplied values, and trigger selection stays outside the engine (EVOL l.605) | D-8: A, a host-invoked pull method with the complete shape of §4.1; or B, an EVOL amendment moving conversion to the host and dropping the dependency. Blocks an L0–L7 closure claim either way |
| X2 | `MemoryPortV2.invalidateProjections` always returns `CAPABILITY_UNAVAILABLE` (`engram-memory/engine.ts:1098`). Wiring it needs contract elements that do not exist: the cascade `runProjectionInvalidationCascadeV1` takes a list of `ProjectionInvalidationSurfaceV1` with distinct `projection_id`s and an `after_cursor` (`engram-memory/projection-cascade.ts:13–19`, contracts l.612–615), while `MemoryEngineDependenciesV2` (contracts l.1037–1059, EVOL l.1018–1035) supplies only `graph_projection?`/`vector_projection?`, whose `apply()` carries no projection id (contracts l.687–710), and the accepted-lexical (FTS) surface lives inside the canonical store; `ProjectionInvalidationRequestV1` (`through_cursor`, `projection_ids`, `deadline_at`, contracts l.390–394) has no `authorization`, so the engine cannot authorize `projection_invalidate`. The L6 RED drives the library function with recording fakes (`tests/memory-projection-cascade.test.ts:13–20`); the "one live graph and vector adapter" of the §10 lifecycle/cascade row runs nowhere (`not covered`) | D-10: A (recommended), a declared V2 gap; B, a contract amendment, then wiring (lot X2) |
| X3 | No SQLite runtime version check: EVOL D8 acquisition step 2 (l.1271) requires `>= 3.51.3` or a documented backport (3.44.6, 3.50.7); no `sqlite_version` reference in `engram-memory/` or `tests/`; the version bundled by `better-sqlite3@12.11.1` is `unverified` (F3 prints it) | D-9: A (recommended), the open-time check after F3 shows the bundled version is admitted, with a strict-only test seam; B, amend D8 |
| X4 | EVOL declares `createMemoryBackupPort(dependencies: MemoryEngineDependenciesV2)` (l.1038); the code exports `createLogicalMemoryBackupV1(LogicalMemoryBackupDependenciesV1)` (`engram-memory/logical-backup.ts:98`), whose `store` must offer `exportStateForPersistence()` and `canonicalStateDigest()` (l.29–40). Only the in-memory store has them: the SQLite and Postgres stores keep their in-memory core private (`sqlite.ts:342`, `postgres.ts:150`), so no durable store can be backed up through the package. `restoreLogical` rebuilds a local in-memory store, checks its digests and discards it (l.187–198): a restore writes nothing. `tests/memory-backup.test.ts` runs on the in-memory store only. EVOL's `restoreLogical` returns only a receipt and `CanonicalMemoryStorePort` has no import method, so EVOL does not say where a restore writes either. The code manifest also carries `state_digest`, `object_ref`, `ciphertext_digest` (contracts l.784–799), absent from EVOL (l.964–976) | D-11: A (recommended), a declared gap with EVOL aligned to the shipped name, dependency type and manifest; B, durable export/restore implemented (lot X4) |
| X5 | `PROJECTION_OVERSIZED` is in the code's `MemoryErrorCode` (`engram-memory/contracts/index.ts:108`), emitted for the D10 raw-byte ceiling refusal (`engram-memory/bounded-projection.ts:47,115`), absent from EVOL §5.1 (l.256–264) | decided here (decide-and-trace; the owner may override): EVOL §5.1 gains the member (F13). Additive, and the package is unpublished, so no external consumer exists |
| X6 | `adapter_build_digest` is the placeholder `sha256:0…01` (`engram-memory/store-factory.ts:27`), not a digest of the build (EVOL l.1008) | decided here (decide-and-trace; the owner may override): EVOL l.1008 states that the value is a fixed placeholder until a build pipeline computes it; the field stays informational and outside admission (F13) |

### 4.1 X1 — proposed ingestion shape (for D-8 A; all elements PROPOSED)

```ts
interface ActivityIngestionRequestV1 {
  source_id: OpaqueRef;                    // names one injected activity_sources entry, else CAPABILITY_UNAVAILABLE
  after?: Cursor;                          // forwarded to ActivityEvidenceRequestV1.after
  limit: number;                           // 1..500, forwarded (EVOL l.457)
  valid_window?: ValidIntervalV1;          // forwarded (EVOL l.458)
  scope_ref: OpaqueRef;                    // host-supplied: ActivityEvidenceV1 carries no scope
  purpose_ref: OpaqueRef;                  // host-supplied
  retention: RetentionV1;                  // host-supplied
  reconciliation: ReconciliationConsentV1; // explicit consent; family_refs [] is the opt-out (EVOL l.196)
  authorization: AuthorizationContextV1;   // used for each item's capture authorization
  deadline_at: Instant;
  cancellation_ref: OpaqueRef;             // forwarded to the source read and to each capture
}

interface ActivityIngestionReceiptV1 {
  source_id: OpaqueRef;
  source_version: string;
  page_digest: Digest;                     // as received; its construction is source-owned (EVOL defines none)
  next_after?: Cursor;
  items: ReadonlyArray<{
    evidence_id: OpaqueRef;
    sequence: Cursor;
    status: "committed_pending" | "duplicate_exact";
    candidate_id: string;
    cursor: Cursor;
  }>;
  receipt_digest: Digest;                  // receipt kind "activity-ingestion" (EVOL D5 convention)
}
```

`MemoryPortV2.ingestActivity(request: ActivityIngestionRequestV1): Promise<Result<ActivityIngestionReceiptV1>>` reads one page and converts each item, in page order, to a `CaptureRequestV2` handed to `capture` (fencing, authorization, trust classification and idempotency unchanged):
- `idempotency_key` = `"activity:"` + lowercase hex of `SHA-256("graphify-memory/activity-idempotency/v1\0" || JCS({ source_id, sequence, evidence_id }))` — 73 bytes, inside the 16..256-byte `IdempotencyKey` bound (EVOL l.148); `source_order` = `{ source_ref: source_id, sequence }`. The key leaves out `evidence_digest` on purpose: changed content under the same `(source_id, sequence, evidence_id)` is then a `DIGEST_CONFLICT` with no write (EVOL l.605), not a second capture.
- `payload` = `{ schema_version: 2, scope_ref, purpose_ref, valid_time, components, primary_component_id, primary_event, citations, retention, reconciliation }`; `subject_ref` has no payload field and stays bound only through `evidence_digest`.
- `evidence` = `{ evidence_ref: evidence_id, evidence_digest, citation_ids: sorted citation ids }`.
- The first failing capture stops the page and its error is returned; earlier items are durable and idempotent, so the host retries from the same `after`. The source cannot admit: items stay `pending` until `requestAdmission`.
- Errors carry the existing `capture` operation; no `MemoryOperation` member is added.

## 5. Out of scope (finalization)

Postgres go-live and `external-host` activation (owner; governance gate); publication of `engram-memory` and `@engram/memory-contracts` (release decision); R2-b and R2-c (§3.7); R2-a unless D-6 includes it; durable-backend logical backup/restore unless D-11 B; `invalidateProjections` wiring unless D-10 B; the persistence write-amplification ceiling (EVOL D9 l.1287).

## 6. Owner decisions (options and recommendation)

Each decision below can be read on its own. Decided without the owner (decide-and-trace; the owner may override any of them): R2-b and R2-c leave the finalization scope (§3.7); the L5 supersession direction uses split relation values (T5.5: the two alternatives break proposal identity or EVOL's record-id ordering); EVOL is aligned to the code for `PROJECTION_OVERSIZED` (X5) and the placeholder `adapter_build_digest` (X6).

**D-1 — Organization-scoped dependencies.**
- Context: EVOL D1 requires removing every `@sentropic/*` dependency from the whole repository, but the product itself is `@sentropic/engram` since 0.19.0 and #341 adopted the published `@sentropic/graph`, while the memory package `engram-memory` is already free of them.
- A (recommended): bind the exclusion to the `engram-memory` build, test, generated-contract and publication closure; amend the EVOL D1 sentence; delete the `it.todo` (the import-closure and packed-list tests enforce it). The neutrality goal — the memory engine knows no consumer — is preserved at the package boundary.
- B: keep repo-wide removal: move `src/scene-layout.ts`, `src/llm-mesh-bridge.ts`, `src/conversations.ts` and the design-token generation behind separately owned adapter packages; reverses #341 and the 0.18.0 mesh integration; the product name stays in the scope regardless.
- C: status quo (`it.todo`): L0 cannot close.

**D-2 — Home of the agent-stats staging module.**
- Context: the legacy activity subsystem left the `engram` CLI, but its code (`_extracted/agent-stats-h2a-module/`) and its 125 tests still live and run in this repository, which EVOL D1 forbids.
- A (recommended): move the staging module, its six test files and its fixtures to a separately owned repository (candidates: the h2a host named by the staging README, or the `@sentropic/agent-stats-core` publisher — `source-gap`), then delete them here; this repository keeps only the guard that its CLI registers no `agent-stats`. If no receiving import exists 30 days after the decision, the conductor brings D-2 back with option B.
- B: keep the staging module in-repo and amend EVOL D1 to accept an unpublished, non-imported staging directory.
- C: delete without relocation (the code is lost).

**D-3 — L5 reconciliation contract amendment.**
- Context: the assertion registry exists as a library, but the engine never uses it, and EVOL requires authorized application of proposals with recorded registry versions, which needs new contract elements.
- A (recommended): the full bundle T5.5–T5.10: directional relation values, a `propose_reconciliation` operation member, a read-only `proposeReconciliation` method returning a digest-bound outcome, a proposal binding on `dispute`/`supersede`/`resolve_dispute`, the matching event field, and registry versions in checkpoints.
- B: library-only reconciliation: pure functions driven by the host, `assertion_registry` removed from the engine dependencies, the binding carried in the existing `event_anchor` (`kind_ref`, `provenance_ref`, `provenance_digest`), `registry_versions` left empty and the EVOL §5.9 checkpoint sentence amended — smaller, but registry versions are no longer machine-readable from events.
- C: the conformance fixes only (L5a); L5 stays `partial` and finalization cannot claim L0–L7.

**D-4 — Container images in CI for the Postgres lane.**
- Context: the two canonical Postgres test files are skipped in CI because no `postgres:16`/`postgres:17` image is present; executing them requires CI to pull container images, which is a supply-chain choice.
- A (recommended): official `postgres:16` and `postgres:17` images, digest-pinned, CI-only, pulled by the existing test harness; the digests are recorded in the lot's PR for approval; the owner/admin makes the new `memory-postgres` job a required check.
- B: GitHub service containers with the same images; the harness gains a second provisioning path (connection URL from the environment, one database per test).
- Separately: approve or defer the images of the optional storage lanes (a pgvector-enabled Postgres, Neo4j, the Spanner emulator).

**D-5 — R2-h receipt field.**
- Context: a hard link added to the SQLite database file after open is not detected until the next restart, and R2-h proposes an alarm field in the `readiness()` receipt, which is a contract change.
- A (recommended): approve a top-level optional `multiply_linked?: boolean` on `OperationalCapabilityReceiptV1` — present only on SQLite receipts, bound by `receipt_digest`, an alarm and never a refusal — together with the rule for adding optional fields (dated EVOL amendment plus a `CHANGELOG.md` `## Unreleased` entry; the version consequence is left to the release decision). Not approving leaves R2-h open.

**D-6 — R2-a, macOS and Windows.**
- Context: the fenced SQLite store refuses to open outside Linux because its lock proof reads Linux `/proc`; supporting macOS or Windows needs new native code and has five open unknowns.
- A (recommended): R2-a remains a declared gap; the §10 "contract/schema/neutrality" row is amended to the matrix CI runs (Linux; Node 20/22/24).
- B: spikes only (evidence on the five unknowns, nothing merged) to size the work.
- C: full macOS and Windows support.

**D-7 — Native addons and the "image ABI".**
- Context: the fenced SQLite store loads two native addons, `better-sqlite3` and `fs-ext`; `fs-ext` is compiled from source at install time by node-gyp, which runs Python, and the term "image ABI" comes from a session log and is not defined in the repository.
- (i) Definition — validate (recommended) or amend: "every runtime image (CI runner or container) that executes the fenced SQLite store carries `better-sqlite3` and `fs-ext` binaries built for that image's Node ABI, platform, architecture and libc, and proves it at image build time with a load-and-lock smoke". Gates the documentation text of the native-ABI lot.
- (ii) CI toolchain — every CI `test` job already runs node-gyp, hence the runner's preinstalled Python, inside `npm ci` (the memory `fs-ext` and the root `tree-sitter-lua` compile from source), and the new Postgres job does the same. Gates the merge of the Postgres-lane lot only.
  - A (recommended): record this as an explicit toolchain exception to the zero-Python rule: no Python file, script, CI step, or container image enters the repository; only node-gyp's use of the runner's interpreter during `npm ci` is accepted.
  - B: forbid it: the Postgres lane waits, and a separate remediation plan replaces the source-compiled addons (memory `fs-ext` per (iii) B or C; the root tree-sitter grammars).
- (iii) Container images that compile `fs-ext` — none is built by this plan, so this gates no lot here, only a future image build.
  - A (recommended): the toolchain stays in a builder stage of the same Node base image family and the runtime image has no Python; this needs the exception of (ii) A extended to that builder stage.
  - B: replace `fs-ext` with a lock binding that ships prebuilt (ideally N-API) binaries — a new dependency to evaluate.
  - C: an in-repository N-API lock addon built without gyp — more native code to own.

**D-8 — Activity ingestion.**
- Context: EVOL says the engine converts activity evidence into captures and `plan/07` marks activity-source ingestion done, but the engine never reads its `activity_sources` dependency.
- A (recommended): implement `MemoryPortV2.ingestActivity` (shape in §4.1): the host supplies scope, purpose, retention and reconciliation consent; each item becomes a pending capture, idempotent per source, sequence and evidence id; the source cannot admit. This keeps EVOL §5.4's guarantee that conversion and idempotency are engine-owned.
- B: amend EVOL so that the host converts evidence and calls `capture`; drop `activity_sources`.
- C: defer; `plan/07` l.79 must then be unchecked and L7 reopened.

**D-9 — SQLite runtime version check.**
- Context: EVOL D8 requires refusing, at open, a SQLite runtime older than 3.51.3 (or the fixed backports 3.44.6 and 3.50.7), and the code does not check the version at all.
- A (recommended): add the open-time check, refusing with `CAPABILITY_UNAVAILABLE`, once the native-ABI smoke has shown that the SQLite bundled with `better-sqlite3@12.11.1` is admitted (otherwise every open would refuse, and a driver upgrade — a lockfile change outside this plan — must come first); its refusal path is tested through an internal seam that can only raise the minimum, never lower it.
- B: amend D8 to drop the runtime check and rely on the pinned driver version (a driver built against an older system SQLite would then go unchecked).
- C: defer; D8 step 2 stays a recorded `defect`.

**D-10 — `MemoryPortV2.invalidateProjections`.**
- Context: the method always refuses with `CAPABILITY_UNAVAILABLE`, and the contract gives the engine neither a list of projection surfaces nor an authorization context for it, so it cannot be wired without a contract change.
- A (recommended): declare it: EVOL §5.5 states that in V2 the method refuses `CAPABILITY_UNAVAILABLE` and that hosts run the exported `runProjectionInvalidationCascadeV1` over their own surfaces; the §10 lifecycle/cascade row is read against that library function.
- B: amend the contract — an optional engine dependency listing `ProjectionInvalidationSurfaceV1`s, an `authorization` field on `ProjectionInvalidationRequestV1`, and the mapping of `projection_ids` and `through_cursor` onto the cascade — then wire the method.
- C: remove the method from `MemoryPortV2` (breaking).

**D-11 — Logical backup and restore for durable stores.**
- Context: the shipped logical backup reads only the in-memory store and its restore writes nothing, so a SQLite or Postgres store cannot be backed up or restored through the package, although EVOL's `recovery/backup` gate names both backends and EVOL D8 points SQLite operators to "a logical backup".
- A (recommended): declare the gap: EVOL states the shipped factory (`createLogicalMemoryBackupV1` and its dependency type) and manifest fields, scopes logical backup and restore to the in-memory canonical model, drops "or a logical backup" from the D8 advice (block or copy-on-write snapshots and detached copies remain), and a follow-up item R2-i is added to `BRANCH.md`.
- B: implement it in this plan: an export over the public `CanonicalMemoryStorePort` (journal pages and record reads, no pending material) plus a restore target, which needs a store import method (contract change), then run both in the native and Postgres lanes.
- C: expose the persistence state of the SQLite and Postgres stores so that the shipped function applies (not recommended: sealed pending envelopes and controls would leave through a second public method, against EVOL §5.9's pending quarantine).

## 7. Review round 1 (Muse 1.3 max) — disposition

Source: adversarial review "GO with amendments" (`.graphify/scratch/design/memory-finalization/REVIEW-spec-muse-1.md`, outside the repository). Every finding was checked against the code at `c96fc01e` and the re-fetched E2 log before being applied or contested.

| Id | Disposition | Section modified |
|---|---|---|
| B1 | applied. `valid_as_of` removed: EVOL l.1159 defines reconciliation eligibility on the system axis, and the store's revalidation would filter valid time (`memory-store.ts:768–769`), so each record is revalidated at its own valid start. `eligibility_digest` and the outcome `receipt_digest` have explicit domains and fields. Verification also showed that a pair yields at most one proposal, so the set DTO became `ReconciliationOutcomeV1` with an explicit `eligible` flag; T5.8's recomputation authorizes both records | §3.2.3 T5.6–T5.8, §3.2.4, §3.2.6; plan F8, F9 |
| B2 | applied. T-g4 now claims only what the lane executes. Verification found two more limits: the parity test compares no transaction-receipt digest and drives no illegal transition, and no durable store can run a logical backup (X4). EVOL l.41 and `plan/07` l.70 stay unchanged | §3.3.1, §3.3.2 T-g4, §3.3.4, §3.8; plan F1 |
| B3 | applied. The case is split into a guard calling `evaluateReconciliationEligibilityV1` directly and a guard on `compare`'s intrinsic visibility gate (untested today); `compare` has no lifecycle input by contract, so the lifecycle half is the engine case of F9 | §3.2.1, §3.2.2 T5.2, §3.2.4; plan F4 |
| M1 | applied. Confirmed: no surface list, no projection ids on the injected ports, no `authorization` on the request → owner decision D-10 (recommended: declared gap) | §4 X2, §6 D-10; plan X2, F13 |
| M2 | applied and extended. Beyond name and signature, the shipped backup reaches only the in-memory store and its restore writes nothing, and the code manifest has three fields EVOL lacks; aligning the signature alone would ratify a backup that cannot run on SQLite or Postgres → owner decision D-11, whose option A includes the requested EVOL alignment | §4 X4, §5, §6 D-11; plan X4, F13 |
| M3 | applied. T0.1 covers sources, generated code, the memory test and fixture closure, and documentation examples; the documentation check is textual, stated as such | §3.1.1 R0.2, §3.1.3 T0.1, §3.1.4; plan F5 |
| M4 | applied. The closure guard gets an in-test wiring control and a mutation run in the PR; the vocabulary rule states that a fixture case does not replace the mutation run | §0, §3.1.4; plan F5, feedback loop |
| M5 | applied. Complete shape: valid window, typed reconciliation consent, idempotency key format inside 16..256 bytes, mapping, failure handling | §4 X1, §4.1, §6 D-8; plan X1 |
| M6 | applied. Addons resolved with `createRequire(engram-memory/package.json)`; non-Linux exits `PLATFORM_UNSUPPORTED`; the native case asserts the platform verdict and is never skipped | §3.6.4, §3.6.5; plan F3 |
| M7 | applied. Verified that node-gyp already runs in every CI `test` job (`fs-ext`, root `tree-sitter-lua`). D-7 split into (i) definition, (ii) CI toolchain exception gating only the Postgres-lane merge, (iii) image builders gating no lot | §3.3.2 T-g3, §3.6.2, §3.6.6, §6 D-7; plan order, F1 |
| M8 | applied. The rule points to a `## Unreleased` entry of `CHANGELOG.md` (absent today, created by the first lot that needs it); the version consequence is left to the release decision | §3.4.2, §3.4.4, §6 D-5; plan F7 |
| m1 | applied (file walk l.33–44, token list l.53–62) | §3.1.1 R0.3 |
| m2 | applied (l.47–71) | §3.1.1 R0.2, R0.3 |
| m3 | applied. The whole runner-Docker sentence is `unverified`; T-g1's failure cause on the first run settles it | §3.3.1 |
| m4 | contested. The re-fetched Node 24 log shows phase15 27, project-graph 33, phase2 26, and 125 tests over the 7 files, matching the spec; an unanchored `it(` grep also counts calls such as `split(`. The figures are now exact per file | §0 E2, §2, §3.1.6 |
| m5 | contested, then moot. The list allowed 7 named files plus 1–2 fixtures, i.e. 8–9 ≤ 9. The M3 redesign uses inline fixtures for the pure scanner, so F5 now allows 7 files | plan F5 |
| m6 | applied. A1 decided technically, with the rationale in T5.5; D-3 no longer carries a sub-choice | §3.2.3 T5.5, §6 preamble, §6 D-3 |
| m7 | applied. Strict-only seam: it can raise the minimum, never lower it | §6 D-9; plan X3 |
| m8 | applied. Static type only; no runtime exact-key validator exists for this receipt | §3.4.1 |
| missing decision X2 | applied → D-10 | §6 |
| missing decision X3 | applied → D-9 | §6 |
| missing decision X5 | applied as decide-and-trace (conductor, F13), listed in the §6 preamble | §4 X5, §6; plan F13 |
| D-3 sub-choice | applied (m6) | §6 D-3 |
| D-5 options | applied: reduced to A (approve, or R2-h stays open) | §6 D-5 |
| D-2 advice | applied: 30-day fallback to option B | §6 D-2 |
| D-4 advice | applied: option C (runner's preinstalled PostgreSQL; no digest pin, version 17 availability `unverified`) withdrawn; digests approved in the lot's PR | §3.3.2 T-g2, §6 D-4; plan F1 |
| S1 (found during verification) | `tests/agent-stats-extraction.test.ts` also holds this repository's guard that `src/cli.ts` registers no `agent-stats`; deleting the 7 files as planned would have removed it. T0.5 now moves that assertion into `tests/memory-activity-boundary.test.ts` first | §3.1.1 R0.5, §3.1.3 T0.5, §3.1.4, §6 D-2; plan F12 |
| S2 (found during verification) | npm on the Node 24 job reports the `better-sqlite3` and `fs-ext` install scripts as "not yet covered by allowScripts"; recorded as a fact and a risk of the image-ABI item | §3.6.2, §3.6.6 |
