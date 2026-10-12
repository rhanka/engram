# Live Git Indexing (`engram` / cluster-mesh / h2a)

Spec: `spec/SPEC_LIVE_GIT_INDEXING.md` (cited **LIVE §x**). Base: `c9ed019331d1ea0fbf96890cca602fd5f6817088`; S0 branch: `feat/live-git-indexing-s0`. Owner decisions, dated 2026-10-11: **Q1 A · Q2 B · Q3 A · Q4 A · Q5 A · Q6 A · Q7 A**, plus D under L3a qualification and its accepted D → B / Q7 A → B alternatives (LIVE §1). Cluster-mesh owns the port/adapter and SQLite implementation; the app owns its Postgres implementation/migrations. Live produces no versioned file and writes nothing into observed worktrees.

Paths prefixed **E:** belong to engram, **S:** to sentropic (including `packages/cluster-mesh`), **H:** to h2a. Unprefixed test cases use the named repository. New paths are proposed, not existing APIs. **Each external lot has its own owning-repository branch; cross-repository lots have one scoped branch per repository.** Allowed lists below are exact source files, not directory wildcards; generated install/build/test outputs are ephemeral. Migration numbers are reserved against the audited base and must be replaced by an exact scope amendment if occupied when the receiving branch starts. L3b means L3b-S/L3b-P, L7b means L7b-C/L7b-R/L7b-D, and L9 means L9-E/L9-S/L9-H. No external implementation is hidden in S0.

## Objective

- [ ] Deliver automatic, hosted, deterministic code/Git indexing after one explicit workspace activation, with uncapped committed history, automatic GitHub PR synchronization, filesystem watch, separate index/working-tree captures and explicit coverage (LIVE §§1–12).
- [ ] Keep engram a neutral fact producer in the separate `@sentropic/engram-live` package; cluster-mesh owns adapter/port/generation semantics and SQLite, while the app implements Postgres behind that port.
- [ ] Execute one logical change per lot with at most 12 listed files per repository branch; split further before exceeding scope without dropping a gate. Lot size does not authorize an oversized commit in later implementation.
- [ ] In this S0 authoring turn, produce only the four requested English documents; no commit, runtime change, test implementation, migration, Track write or external-repository edit.
- [ ] Treat every future RED/GUARD and performance/backend/deployment result as `unverified` until executed. Q1–Q7 are accepted decisions; do not reopen them as missing approval.

## Scope

- [ ] Allowed: **S0 only:** E:`spec/SPEC_LIVE_GIT_INDEXING.md`, E:`spec/SPEC_GRAPH_STORAGE_BACKENDS.md`, E:`spec/SPEC_STORAGE_BACKENDS.md`, this plan. Later branches may touch only their lot's exact Allowed files, including the explicitly listed contracts/package/CI and app migration paths.
- [ ] Forbidden: Python files/interpreters/build fallbacks; LLM/embedding calls or assistant artifacts on live paths; implicit npm/npx/downloads; source worktree/cache/config/index/ref writes; repository-triggered programs; SQL-to-Git bridges; canonical-memory changes; engram-owned host registries; global corpus/annotation migration; general remote refresh; raw private publication; implementing additional graph backends in this delivery; `.track/**`, `BRANCH.md`, `.graphify/scratch/**` or dossier edits in S0; commits, merge, push, tag, publish or deployment in S0. Future graph backends remain supported by the backend-neutral port design.
- [ ] Conditional: exact package/build/CI files only in their owning lots; no unrelated refresh. Measured L3a failure triggers the applicable accepted alternative, conductor review, and requalification against the same thresholds. No automatic runtime fallback; return to the owner only if the alternative violates an accepted constraint. Record an exact scope amendment before adding any receiving-repository path.

## Recommended Order

| Order | Lot | Item | Change class | Needs |
|---|---|---|---|---|
| 1 | S0 | engram specification and narrow storage amendments | docs | accepted owner decisions; this change |
| 2 | L0 | native Git oracle corpus | test harness | S0 |
| 3 | L1a | code-only paths without inference | bug fix + tests | S0 |
| 4 | L1b | separate neutral package and deliverable closure | boundary + distribution | S0; guards start now; full gate uses L1a |
| 5 | H0 | safe optional hooks | bug fix + tests | S0; existing hook fixtures suffice |
| 6 | L2a | bounded streaming Git reader | extraction | L0/L1b |
| 7 | L2b | roots, retained DAG and OID checkpoints | engine | L2a |
| 8 | L3a | D/Q7 contract and fixed-threshold qualification | prototype + evidence | L1b packed prerelease/L2b |
| 9 | L3b-S | cluster-mesh durable SQLite | storage + local migrations | successful L3a or qualified accepted alternative |
| 10 | L3b-P | app durable Postgres | storage + app migrations | successful L3a or qualified accepted alternative |
| 11 | R1 | private retention of every Git root | producer + host | L2b; host gate uses L3b-S receipts |
| 12 | P1 | GitHub metadata and PR object synchronization | engine + host adapter | L2b/R1/L3b-S; Q3 A |
| 13 | L4a | safe index/filesystem observations | collector safety | L0/L1b for full gate; safety cases start now |
| 14 | L4b | snapshots and encrypted latest local content | producer + host protection | L4a/L3b-S; Q2 B |
| 15 | L5 | context-bound code and comparisons | extraction | L2b/L4b/R1; Q1 A |
| 16 | L6a | explicit host declarations and identity | neutral + host contract | S0 for contract; L1b for integration; no projection dependency |
| 17 | L6b | scheduler, watch and reconciliation | engine | L5/L6a/P1 |
| 18 | L7b-C | closed namespace contract and release | public contract | L3a/L6a; can prepare before scheduler |
| 19 | L7b-R | cluster-mesh typed readers | readers | L3b-S/L3b-P/L5/L6a/L7b-C |
| 20 | L7b-D | catalogued peer and cluster-mesh distribution | packaging | L1b–L6b neutral release; L7b-C contracts release; L7b-R |
| 21 | L7a | h2a verified authority, composition and supervision | host + exact pins | L3b-S/L6a/L6b; released L7b-D |
| 22 | L8 | app publication, cutover and recovery | app operations | L3b-P/R1/P1/L7b-D/L7a; Q6 A |
| 23 | L9-E | producer compatibility and artifact boundary | producer guards | E implementation gates |
| 24 | L9-S | typed functional parity | cluster-mesh integration | L7b-D/L7a/L8 |
| 25 | L9-H | installed SLO and acceptance exit | host qualification | L9-E/L9-S and all preceding gates |

Start without waiting: **L0, L1a, H0, L1b boundary guards, L4a safety cases, L6a declaration contract**. The table is a coordination order, not an unnecessary serial dependency chain. Pure cases use injected ports; their final gates retain actual dependencies. Release checkpoints, operated later by the conductor: **R-E** publishes the complete neutral factory after L6b; **R-C** publishes contracts after L7b-C; **R-S** publishes cluster-mesh after L7b-D; **R-H** updates h2a's exact package/lock pins in L7a. Each records version, tarball integrity and contract/fixture evidence. Qualification uses pinned packed prereleases; no runtime import of another checkout. No publication occurs in S0.

## S0 — Specification And Storage Authority (LIVE §§1–2, §17) — engram

- [x] GUARD (manual documentary check): `spec/SPEC_LIVE_GIT_INDEXING.md > dated owner choices and cluster-mesh adapter ownership supersede the older dossier diagram`.
- [x] GUARD (manual documentary check): `spec/SPEC_GRAPH_STORAGE_BACKENDS.md > the Q5 A exception is confined to live code/Git and introduces no live-generated versioned file`.
- [x] GUARD (manual documentary check): `spec/SPEC_STORAGE_BACKENDS.md > the dated exception preserves no reverse synchronization and legacy corpus authority outside live`.
- [x] Implement: LIVE; dated storage amendments; this plan in plan/08 format, expanded to 25 bounded lots after the 21-finding S0 review. LIVE's final disposition table records each finding. Documentary checks are not runtime GREEN claims.
- Allowed (4): E:`spec/SPEC_LIVE_GIT_INDEXING.md`, E:`spec/SPEC_GRAPH_STORAGE_BACKENDS.md`, E:`spec/SPEC_STORAGE_BACKENDS.md`, this plan.
- Forbidden: all code, tests, migrations, generated artifacts, tracking writes, other-repository writes and commits.
- Gate: source/decision traceability, storage-amendment coherence, lot/dependency/format check and clean diff formatting; conductor acceptance remains separate. Existing review findings are reconciled through LIVE; a new independent consensus is not claimed.

## L0 — Git Corpus And Oracles (LIVE §§4, 6–8, A02/A05) — engram

- [x] RED: `tests/live-fixtures.test.ts > native Git oracle distinguishes refs, ordered merge parents, index stages and linked worktrees`.
- [x] RED: `tests/live-fixtures.test.ts > generated history exceeds 100000 commits and includes a 1501-commit PR without a network dependency`.
- [x] GUARD: `tests/live-fixtures.test.ts > the corpus exposes empty, shallow, sparse, binary, renamed, filtered and non-UTF-8 paths without running repository programs`.
- [x] Implement: deterministic Node/Git fixture builders, pinned expected plumbing output and process tracing. Include SHA-1/SHA-256 support detection, root/octopus merges, conflicts stages 1/2/3, linked `.git` files, detached `.h2a/jobs/*/wt`, gitlinks, symlinks, protected paths, packed refs and a reftable capability lane. The large corpus can be a qualification tier; routine tests use small equivalent fixtures.
- Allowed (5): E:`tests/live-fixtures.test.ts`, E:`tests/helpers/live-git-fixtures.ts`, E:`tests/helpers/live-process-trace.ts`, E:`tests/fixtures/live-git-corpus.json` (small recipe only), E:`plan/09-BRANCH_LIVE_GIT_INDEXING.md`.
- Forbidden: downloaded fixtures, public-service dependencies, checked-in giant repositories, runtime modules and any executable Python fixture.
- Gate: oracle cases execute on the qualified Git; unsupported object/ref formats are explicitly reported and never advertised as tested. Fixtures distinguish implementation mistakes from old-extractor limitations; GUARD mutation evidence recorded.
- L0 evidence (2026-10-11, `feat/live-git-l0`, base `0e43781b`): both named REDs, the GUARD and the small-history case first failed with `L0 deterministic Git fixture builder is not implemented` (4 failed, qualification enabled). Native expectations are 17 pinned plumbing outputs per format combination; root OIDs were independently checked using Node crypto and Git object serialization. No legacy extractor is used as the oracle or claimed fixed by L0.
- Routine gate (after Sol review fixes): `npx vitest run tests/live-fixtures.test.ts` — 15 passed, 1 explicitly skipped qualification case, 2.39 seconds overall. Small history: 257 main commits + 17 PR-only commits, 274 total, using the same streamed fast-import builder as qualification. Fixtures use ignored checkout-local `.h2a/live-git-fixtures/l0-*` and are removed after each case; no sandbox-blocked test or network service.
- Qualification gate (after Sol review fixes): `LIVE_GIT_QUALIFICATION=1 npx vitest run tests/live-fixtures.test.ts --silent=false --reporter=verbose` — 16 passed; 100001 main commits + 1501 PR-only commits, 101502 total. Each generated commit changes a file. The final verbose qualification run took 5.16 seconds overall; this is L0 corpus evidence, not an L2a/L3a performance qualification.
- Qualified Git: `git version 2.53.0`; SHA-1 and SHA-256 × files and reftable all execute (4 combinations). Capability probes report unsupported formats and their Git diagnostic explicitly; none was unsupported here. Packed refs, annotated/lightweight tags, symbolic remote HEAD, ordered two-parent/octopus/unrelated-root merges and independent worktree indices are exercised.
- Process counters (`--silent=false --reporter=verbose`): native matrix 437 Git launches (341 setup / 96 oracle); GUARD 112 (83 / 29); each history tier 7 (2 / 5). Native Git Trace2 evidence records zero child launches; the trace-rejection regression injects a synthetic child event without executing it. Hooks, clean/process/smudge, textconv, fsmonitor and external-diff tripwires never run. Setup writes only disposable fixtures; oracle reads preserve the complete byte-path/file-mode/content inventory, including a pre-existing `index.lock`. These setup counts exclude the added review regressions and are not collector process-bound claims.
- GUARD mutation: temporarily changing the oracle byte mapping from `latin1` to `utf8` produced 1 failure / 3 skipped: `rootNames` lost byte `ff` in path hex `7261772dff2e747874` (replacement character instead of the one-byte mapping). Mutation reverted; the routine and qualification gates returned green. Focused strict TypeScript checking of the three TS files also passed. No runtime module, download, Python execution, commit or push.
- Sol review corrections (2026-10-11): the added `L0 review regressions` cases first produced 11 failures / 1 pass / 4 skipped against the original helpers, reproducing both MAJOR and both MINOR findings. The focused suite then passed all 12 cases after correction.
- MAJOR 1: the right parent now has two conflict lines, so the pinned merge numstats are `1\t1` from left and `1\t2` from right. `merge parent numstats discriminate a repeated first parent` fails if the first parent is reused: a temporary `corpus.commits[parent]` → `corpus.commits.left` mutation produced exactly 1 failure / 15 skipped (actual `1\t1`, expected `1\t2`), then was restored byte-for-byte.
- MAJOR 2: each recorded launch requires a distinct Trace2 `sid`, exactly one ordered `start` / `exit` / `atexit`, terminal `atexit`, matching argv and both exit codes matching the recorded subprocess status. Regressions reject start-only/truncated evidence, either missing terminal, foreign/reused sessions, wrong status and reversed terminals; complete nonzero exits pass. Temporarily removing per-session completion/status validation made `process trace rejects start only evidence` fail (1 failure / 15 skipped), then was restored byte-for-byte.
- MINOR corrections: `unknown hash algorithm` is classified as unsupported with the SHA-256 diagnostic preserved; constructor failures dispose the new root before rethrowing. Both repros now pass, including an empty-PATH failure; the regression also cleans up its failed fixture on the RED/mutation path. Final fixture-directory check found no `l0-*` leftovers.
- Verification used installed tools with `npm_config_offline=true npm_config_yes=false`. Focused strict checking passed with `npx tsc --ignoreConfig --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --skipLibCheck --types node tests/live-fixtures.test.ts tests/helpers/live-git-fixtures.ts tests/helpers/live-process-trace.ts` (`--ignoreConfig` is required by the installed compiler for explicit file arguments). Only the five allowed L0 files are changed; conductor acceptance and a new independent review remain separate.

## L1a — Code-Only Execution Without LLM (LIVE §11, A07) — engram

- [x] RED: `tests/live-no-llm.test.ts > watch refreshes code in a mixed code and document batch without model calls or assistant artifacts`.
- [x] RED: `tests/live-no-llm.test.ts > code-only update and buildProject behave identically with and without provider keys`.
- [x] RED: `tests/live-no-llm.test.ts > force, configured enrichers and existing vectors cannot activate inference or deferred enrichment in live`.
- [x] RED: `tests/live-no-llm.test.ts > the live opt-in keeps an injected description caller inert`.
- [x] RED: `tests/live-no-llm.test.ts > assistant gap-fill preserves label instructions and the pending marker until label answers are verified`.
- [x] GUARD: `tests/live-no-llm.test.ts > explicit non-live enrichment remains separately callable`.
- [x] GUARD (existing non-live case): `tests/pipeline.test.ts > Step 2 - build graph from extraction.json`.
- [x] GUARD (existing non-live case): `tests/watch-rebuild-lock.test.ts > refuses a second acquire while a live PID still holds the lock`.
- [x] Implement: isolate deterministic code refresh from semantic finalizers in watch/update/pipeline; suppress model descriptions/labels, embeddings and assistant markers. Affected-call/inheritance repair from CodeGraphContext remains to be implemented and verified in L5; this lot makes no preservation claim about absent behavior.
- L1a evidence (2026-10-11, `feat/live-git-l1a`, base `9a8313ea`): the three REDs first failed for the missing mixed-batch dispatch (`rebuildWatchBatch` undefined) and for the default-on describe/label stages tripping the injected failing providers (rebuild returned false); the explicit-enrichment GUARD passed before and after. Sol 6.1 xhigh tour-2 corrections: (B1) `buildProject` keeps its pre-existing contract — the semantic finalizer always runs, so existing `describe:true` + callback calls describe as on HEAD; the code-only/live path is the explicit `live: true` opt-in (an injected `describeCallLlm` stays inert under it); a new RED covers the opt-in. The two compatibility tests (`build-project-descriptions`, `build-project-report-finalized-labels`) are reverted byte-for-byte to HEAD and pass unmodified. (B2) the explicit non-live `engram update` dispatch passes an `enrichment` option group (describe/label stages, `--fill-missing`->onlyMissing, modes, backends, models, languages, citation cap) plus the describe-pending marker finalization, while the live watch/hook paths never set the group and stay deterministic; the `check-update` `--fill-missing` recommendation is effective again, and a RED drives the REAL `update --fill-missing` CLI command end-to-end with counting providers. Gap-fill fix: each instruction dir is purged only when its own stage verified completion — a descriptions-complete run no longer purges unverified label instructions nor clears the pending marker while labels are generic; a new RED covers the described-graph + assistant gap-fill cycle (emit -> survive -> answer -> ingest -> clear). (M3) annotations (`description`, inline `citations`) of re-extracted symbols are preserved deterministically across no-change refreshes; a RED covers the describe -> update/watch no-change cycle on an AST-extracted id. Traps (A07): the stage entrypoints throw with call counters, the AI SDK `embed`/`embedMany` count + fail if called, EVERY network attempt (global `fetch`, `node:http(s)` transports) is COUNTED with zero required — a swallowed network exception still fails the test; a project config plus a stored node vector are present in the fixture. Gate: `npx vitest run tests/live-no-llm.test.ts tests/pipeline.test.ts tests/watch-rebuild-lock.test.ts` plus collateral suites (cli-runtime, check-update*, watch-hook*, build-project*, finalize-enriched-graph, cli-describe-command); `npx tsc --noEmit -p .` green; `git diff --check` clean. Mutations, one per boundary and each reverted byte-for-byte: (A) reintroducing an `applySalientCommunityLabels` call inside `rebuildCode` fails the live REDs through the provider-violation seam; (B) a swallowed `fetch` on the code-only path fails the network zero-assertion; (C) dropping the CLI `enrichment` transmission fails the update-dispatch RED.
- Allowed (≤8): E:`src/watch.ts`, E:`src/pipeline.ts`, E:`src/cli.ts` (code-only dispatch only), E:`src/extract.ts` (deterministic boundary only), E:`tests/live-no-llm.test.ts`, E:`tests/pipeline.test.ts`, E:`tests/watch-rebuild-lock.test.ts`, this plan.
- Forbidden: changing explicitly requested non-live enrichment, introducing a provider fallback, treating absent keys as the guard or treating a mixed batch as notification-only.
- Gate: fake-key/no-key executions match; injected providers fail if called; network/artifact traces show zero inference or assistant work. Relevant existing pipeline/watch tests remain green; mutation of a provider call makes the guard fail.

## L1b — Neutral Entry And No-Python Deliverable (LIVE §§2–3, 11, A06/A15) — engram

- [ ] RED: `tests/live-neutrality.test.ts > built live entry has no consumer or model dependency in its transitive static and dynamic import closure`.
- [ ] RED: `tests/live-package.test.ts > installing and importing the delivered live surface without Python evaluates no database driver or root CLI`.
- [ ] RED: `tests/live-package.test.ts > every advertised language loads its packaged WASM and an absent grammar reports unavailable coverage`.
- [ ] GUARD: `tests/live-neutrality.test.ts > source, built output and package closure scans reject an injected forbidden edge`.
- [ ] Implement: separate publishable `engram-live/` package named `@sentropic/engram-live`; `/contracts` exports built data-pure DTOs/constants/validators and `/integration` the executable factory. Inject Git/filesystem/clock/content/fact-sink/cache/grammar ports. Package verified WASM assets from a pinned manifest and exclude root dependency/install scripts. This lot supplies package/factory seams and grammar loading; extraction reuse is added in L5 with its cache/grammar injection and closure recheck. Until a capability is implemented it is explicitly unavailable. Emit contract/fixture evidence; full runtime release follows L6b.
- Allowed (12): E:`engram-live/integration.ts`, E:`engram-live/contracts.ts`, E:`engram-live/index.ts`, E:`engram-live/package.json`, E:`engram-live/package-lock.json`, E:`engram-live/tsconfig.json`, E:`engram-live/grammar-manifest.json`, E:`tests/live-neutrality.test.ts`, E:`tests/live-package.test.ts`, E:`scripts/build-live.mjs`, E:`scripts/check-live-package.mjs`, E:`.github/workflows/typescript-ci.yml`.
- Forbidden: importing the monolithic CLI, external `@sentropic/*` consumer packages, h2a, model modules or storage-driver handles into the neutral closure; Python install fallback; arbitrary runtime dependency additions.
- Gate: packed-install and built-import checks run in an environment without Python on each advertised platform/runtime; closure mutation fails; grammar matrix is explicit. This does not qualify cluster-mesh's SQLite driver (L3a/L3b).

## H0 — Installed, Signal-Only Hooks (LIVE §7, A05/A06/A17) — engram

- [ ] RED: `tests/hooks.test.ts > a missing installed executable never invokes npm or npx`.
- [ ] RED: `tests/hooks.test.ts > engram-only state is recognized and configured hook paths preserve third-party hooks`.
- [ ] RED: `tests/hooks.test.ts > live hooks emit a bounded signal without rebuild, export or network work`.
- [ ] GUARD: `tests/hooks.test.ts > activation and live signals leave tracked untracked ignored files gitattributes and Git config unchanged`.
- [ ] GUARD: `tests/hooks.test.ts > reference-transaction signals only committed transactions and explicit non-live installation remains separate`.
- [ ] Implement: pin/verify the installed executable, remove implicit package resolution and discover the real hook path. Activation never calls an installer; independently requested live-hook setup installs only short signals, without graph attributes or merge-driver config. Live markers use injected host storage/IPC, never `.graphify/needs_update`; `.engram/` recognition grants no write permission. Preserve third-party hooks and keep explicit legacy non-live operations separate.
- Allowed (≤5): E:`src/hooks.ts`, E:`src/paths.ts`, E:`src/cli.ts` (hook signal dispatch only), E:`tests/hooks.test.ts`, this plan.
- Forbidden: implicit hook installation; worktree cache/marker writes; attribute/config mutation during live; overwriting third-party hooks; package resolution, export or heavy rebuild inside a hook; hooks as sole truth.
- Gate: sandbox covers PATH miss, linked worktree, configured hook directory and `.engram/` only; approved signal process only. LIVE §2 inventory/digest/status guard covers activation and signaling, including initially absent `.gitattributes` and ignored/untracked paths; explicit setup is outside that baseline.

## L2a — Streaming Native Git Reads (LIVE §6, A02/A03) — engram

- [ ] RED: `tests/live-git-stream.test.ts > reads more than 1000 commits with subprocess count bounded by batches rather than commits`.
- [ ] RED: `tests/live-git-stream.test.ts > streamed metadata and changed files match the legacy extractor on its supported domain`.
- [ ] RED: `tests/live-git-stream.test.ts > native Git oracle preserves root and merge diffs, binaries, modes, renames and path bytes`.
- [ ] RED: `tests/extract-git.test.ts > default legacy extraction and detection metadata no longer truncate a branch at 200 commits`.
- [ ] GUARD: `tests/live-git-stream.test.ts > backpressure bounds memory while truncated object records fail without advancing progress`.
- [ ] Implement: streaming rev-list/cat-file and grouped diff/numstat protocol with byte counts and NUL framing; complete metadata and historical paths independent of today's AST. Remove the legacy implicit 200-commit default and its detection-window claim. Explicit bounded non-live requests may remain labelled partial; live never sends a cap.
- Allowed (9): E:`engram-live/git-stream.ts`, E:`engram-live/git-protocol.ts`, E:`engram-live/contracts.ts`, E:`tests/live-git-stream.test.ts`, E:`tests/helpers/live-git-fixtures.ts`, E:`src/extract-git.ts`, E:`src/types.ts`, E:`tests/extract-git.test.ts`, E:`plan/09-BRANCH_LIVE_GIT_INDEXING.md`.
- Forbidden: another commit limit, per-commit `git show` loops, a whole-history Graphology object, copying legacy binary/path defects as required behavior or modifying user Git state.
- Gate: equivalence/oracle/default-legacy cases pass; LIVE §13 process bound is ≤8 + 3 × ceil(C/1000), hence ≤308 launches for 100000 commits and ≤8 for a no-change pass, with ≤4 concurrent Git children. Record malformed-stream recovery/RSS; a metadata-only benchmark without changed files is insufficient.

## L2b — Roots, Retained DAG And OID Completion (LIVE §§3–4, 6, A02–A04) — engram

- [ ] RED: `tests/live-history.test.ts > default branch, active local and remote refs, all-state PR roots and detached worktree heads retain uncapped ancestry`.
- [ ] RED: `tests/live-history.test.ts > expiry, deletion, recreation and force-push preserve previously ingested commits and ordered parents`.
- [ ] RED: `tests/live-history.test.ts > a known partial OID resumes while a complete unchanged ancestry produces no extraction work`.
- [ ] GUARD: `tests/live-history.test.ts > repeated observation is not activity and clones with the same h2a fingerprint remain distinct while linked worktrees share common-dir identity`.
- [ ] Implement: neutral discovery/retention/reachability model, complete-ancestry checkpoints through injected persistence, algorithm-qualified OIDs, explicit shallow/missing coverage and separate clone/common-dir/worktree identity. Carry GitNexus/CodeGraph immutable sharing and checkout isolation; derive branch membership rather than multiplying permanent edges.
- Allowed (≤7): E:`engram-live/history.ts`, E:`engram-live/refs.ts`, E:`engram-live/repository.ts`, E:`engram-live/contracts.ts`, E:`tests/live-history.test.ts`, E:`tests/helpers/live-git-fixtures.ts`, this plan.
- Forbidden: commit-age/count limits, first-parent truncation, persistent commit × branch `ON_BRANCH`, equating known OID with complete ancestry, URL-only clone identity or implicit remote hydration.
- Gate: all roots and ref lifecycles pass with source/activity provenance; no-change and interrupted-resume counts recorded; retained PR ancestry exceeds 1000 commits; old roots remain queryable independently of current reachability.

## L3a — Option D And Driver Qualification (LIVE §§3, 9, 11, 13, A10/A12/A15) — cluster-mesh/sentropic

- [ ] RED: `packages/cluster-mesh/tests/live-store-contract.spec.ts > pagination pins one generation across interrupted staging and duplicate or conflicting batches`.
- [ ] RED: `packages/cluster-mesh/tests/live-store-contract.spec.ts > ref recreation and repeated diff relations preserve distinct fact identities`.
- [ ] RED: `packages/cluster-mesh/tests/live-store-qualification.spec.ts > real SQLite meets the fixed corpus warm publication page and recovery thresholds`.
- [ ] RED: `api/tests/api/live-store-qualification.test.ts > the app Postgres adapter meets the same fixed qualification thresholds`.
- [ ] GUARD: `packages/cluster-mesh/tests/live-store-contract.spec.ts > LOCAL_ONLY DURABLE and shadow active rolled_back bindings preserve existing consumers and separate content generations`.
- [ ] GUARD: `packages/cluster-mesh/tests/live-store-contract.spec.ts > code Git never writes memory snapshots or exposes raw memory SQL`.
- [ ] Implement: cluster-mesh port/engram adapter and SQLite prototype; Postgres prototype in the app. Extend `ClusterMeshPersistenceBinding` additively and qualify cutover/rollback mapping using a pinned neutral packed prerelease. Inline common fixtures; verify stable identities, hidden batches, durable receipts, fencing, reader pins and content generations. Keep contracts free of SQL-specific semantics for future graph backends.
- Allowed (12, S): S:`packages/cluster-mesh/src/persistence/ports.ts`, S:`packages/cluster-mesh/src/live-storage/port.ts`, S:`packages/cluster-mesh/src/engram-adapter.ts`, S:`packages/cluster-mesh/src/live-storage/qualification.ts`, S:`packages/cluster-mesh/tests/live-store-contract.spec.ts`, S:`packages/cluster-mesh/tests/live-store-qualification.spec.ts`, S:`api/src/services/cluster-mesh/live-store-qualification.ts`, S:`api/tests/api/live-store-qualification.test.ts`, S:`packages/cluster-mesh/package.json`, S:`package-lock.json`, S:`.github/workflows/ci.yml`, S:`spec/QUALIFICATION_LIVE_GIT_INDEXING.md`.
- Forbidden: rollout before evidence; Postgres driver/dependency in the cluster-mesh package; DB ownership in engram; memory changes; automatic runtime fallback; SQL coupling in the contract; metadata-last treated as atomic visibility; changing thresholds after measurement.
- Gate: each real backend completes ≥100000 commits plus the 1501-commit PR within ≤2 cores/≤1 GiB aggregate RSS, p95 warm publication ≤5 s, bounded 200-fact/1-MiB page p95 ≤200 ms, and crash recovery ≤30 s (LIVE §13). Record bootstrap duration without a time target, versions, samples and all failure windows; zero skips. A missed threshold or functional gate records failure, triggers the applicable accepted D/Q7 alternative with conductor review, and requires requalification. Freeze only a passing contract/driver.

## L3b-S — Durable SQLite And Local Migrations (LIVE §§9–10, A09/A10/A12/A15) — cluster-mesh/sentropic

- [ ] RED: `packages/cluster-mesh/tests/live-store-recovery.spec.ts > stale writers and crashes around publication preserve one complete generation and idempotent restart`.
- [ ] RED: `packages/cluster-mesh/tests/live-sqlite-runtime.spec.ts > SQLite versions below 3.51.3 fail before WAL except qualified backports 3.44.6 and 3.50.7`.
- [ ] RED: `packages/cluster-mesh/tests/live-store-parity.spec.ts > SQLite migrations preserve scoped facts coverage and pinned readers under the shared contract corpus`.
- [ ] GUARD: `packages/cluster-mesh/tests/live-store-recovery.spec.ts > projection replacement preserves declarations and bootstrap never relaxes WAL or synchronous FULL`.
- [ ] Implement: qualified SQLite schema/migrations, local-filesystem guard, single writer, fencing, durable jobs/receipts, recovery and protection seams. Use the D-9 A predicate fixtures, without importing or editing the memory runtime. Q7 B, only if triggered in L3a, substitutes a verified prebuilt driver at release time and includes install-without-Python proof.
- Allowed (11, S): S:`packages/cluster-mesh/src/live-storage/sqlite.ts`, S:`packages/cluster-mesh/src/live-storage/sqlite-runtime.ts`, S:`packages/cluster-mesh/src/live-storage/sqlite-migrations.ts`, S:`packages/cluster-mesh/src/live-storage/sqlite-prebuilt.ts` (conditional Q7 B only), S:`packages/cluster-mesh/src/engram-adapter.ts`, S:`packages/cluster-mesh/tests/live-store-recovery.spec.ts`, S:`packages/cluster-mesh/tests/live-sqlite-runtime.spec.ts`, S:`packages/cluster-mesh/tests/live-store-parity.spec.ts`, S:`packages/cluster-mesh/package.json`, S:`package-lock.json`, S:`docs/operations/live-git-sqlite.md`.
- Forbidden: memory changes; database-only declarations; partial publication; unsupported WAL; `journal_mode=MEMORY` or `synchronous=OFF` even at bootstrap; compiling an addon when a prebuilt is absent; silent lane skips.
- Gate: real SQLite crash/fence/migration corpus passes; actual engine checked before WAL, including admitted/refused version fixtures; local install lane without Python passes. L3a has qualified the selected driver; L3b-P reuses the contract corpus for parity.

## L3b-P — Durable Postgres In The App (LIVE §9, A10/A12) — sentropic

- [ ] RED: `api/tests/api/live-store-parity.test.ts > the real app Postgres backend matches SQLite contract fixtures including scoped generations and migration compatibility`.
- [ ] RED: `api/tests/api/live-store-recovery.test.ts > app restart rollback and stale writers cannot expose partial generations or lose durable receipts`.
- [ ] GUARD: `api/tests/api/live-store-parity.test.ts > the cluster-mesh package acquires no Postgres runtime dependency`.
- [ ] Implement: app Postgres adapter behind the qualified cluster-mesh port, typed app schema/migration, durable jobs/fencing and restore seams; reuse the app's database driver/composition pattern. Compare the same contract evidence used by L3b-S.
- Allowed (8, S): S:`api/src/services/cluster-mesh/postgres-live-store.ts`, S:`api/src/services/cluster-mesh-adapter.ts`, S:`api/src/db/live-git-schema.ts`, S:`api/drizzle/0042_live_git.sql`, S:`api/drizzle/meta/_journal.json`, S:`api/tests/api/live-store-parity.test.ts`, S:`api/tests/api/live-store-recovery.test.ts`, S:`docs/operations/live-git-postgres.md`.
- Forbidden: Postgres implementation inside the cluster-mesh package; private local content in product tables; partial current generations; memory-schema changes; missing infrastructure treated as skipped success.
- Gate: real app Postgres migrations/recovery/shared parity execute without skips; old readers remain compatible or explicitly refused. Operational activation waits for L8.

## R1 — Private Retention Of All Ingested Roots (LIVE §4, A02/A04) — engram and h2a

- [ ] RED: `tests/live-retention.test.ts > every local remote-known PR and detached root requires a scoped durable retention receipt`.
- [ ] RED: `packages/h2a-runtime/src/gateway-host/live-object-store.test.ts > a deleted branch remains reconstructible after source garbage collection`.
- [ ] RED: `packages/h2a-runtime/src/gateway-host/live-object-store.test.ts > a removed job worktree remains reconstructible after acknowledged retention`.
- [ ] GUARD: `packages/h2a-runtime/src/gateway-host/live-object-store.test.ts > quota exhaustion or deletion before acquisition reports a gap without clone writes or eviction of protected roots`.
- [ ] Implement: E retention requests/receipts with fake ports; H local object acquisition to a protected private Git store, pinned refs/OIDs, no source alternates dependency, access controls, quotas and lifecycle handoff before host-controlled job cleanup. Separate committed objects from all uncommitted plaintext. Expose coordinated-backup references for L8; P1 reuses this facility.
- Allowed (4, E): E:`engram-live/retention.ts`, E:`engram-live/contracts.ts`, E:`tests/live-retention.test.ts`, E:`tests/helpers/live-git-fixtures.ts`.
- Allowed (3, H): H:`packages/h2a-runtime/src/gateway-host/live-object-store.ts`, H:`packages/h2a-runtime/src/gateway-host/live-object-store.test.ts`, H:`packages/h2a-runtime/src/delegate.ts` (retention handoff only).
- Forbidden: object/ref writes in user clones; relying on source GC or GitHub retention; persisting uncommitted plaintext as Git objects; silent committed-history eviction; claiming protection before acknowledgement.
- Gate: actual private-store acquisition and reconstruction pass after branch deletion/GC and job removal, with clone/config/status digests unchanged by collection. Acquisition/removal races yield explicit gaps. L5 cannot pass without these receipts/reconstruction cases.

## P1 — All-State GitHub PR Synchronization (LIVE §§4–5, A02/A04/A11/A17) — engram, with h2a/cluster-mesh branches

- [ ] RED: `tests/live-pr-sync.test.ts > all pages beyond 30 PRs include open closed and merged records and deduplicate moving pages`.
- [ ] RED: `tests/live-pr-sync.test.ts > a 1501-commit PR remains investigable through merge squash rebase and force update`.
- [ ] RED: `tests/live-pr-sync.test.ts > metadata cursor success cannot discard a failed object job or fabricate historical attribution`.
- [ ] RED: `tests/live-pr-sync.test.ts > offline auth failure and rate limits preserve last success and automatically resume with stale coverage`.
- [ ] GUARD: `packages/h2a-runtime/src/gateway-host/live-github.test.ts > approved PR acquisition writes only private service refs and never invokes repository credential programs`.
- [ ] GUARD: `packages/cluster-mesh/tests/live-pr-mapping.spec.ts > PR metadata receipts never acknowledge a failed private object acquisition`.
- [ ] Implement: E: pagination/overlap/full-sweep reconciliation and neutral PR/object jobs; H: approved installed `gh`/Git executor, controlled credentials, private object acquisition and retention; S: adapter mappings/receipts if the L3 contract needs PR-specific typed fields. Pin observed OIDs, keep acquisition distinct from metadata progress and preserve historical bounds. Collect available CI/review/worktree evidence needed for functional PR readers without inference.
- Allowed (5, E): E:`engram-live/pr-sync.ts`, E:`engram-live/pr-attribution.ts`, E:`engram-live/contracts.ts`, E:`tests/live-pr-sync.test.ts`, E:`tests/fixtures/live-github-pages.json`.
- Allowed (2, H): H:`packages/h2a-runtime/src/gateway-host/live-github.ts`, H:`packages/h2a-runtime/src/gateway-host/live-github.test.ts`.
- Allowed (2, S): S:`packages/cluster-mesh/src/engram-adapter.ts`, S:`packages/cluster-mesh/tests/live-pr-mapping.spec.ts`.
- Forbidden: API commit-array exhaustiveness claims, generic remote fetch, checkout mutation, token persistence, attribution from today's base alone, treating all ancestors as PR-specific or adding a default PR count limit.
- Gate: exhaustive fixture pagination, moving heads, retained private objects, recovery/quotas/auth scenarios and merge-strategy cases pass; host process/config trace recorded. Production GitHub/credential deployment remains `unverified` until separately exercised; required PR access is already authorized by Q3 A.

## L4a — Side-Effect-Free Index And Worktree Capture (LIVE §7, A05/A06) — engram

- [ ] RED: `tests/live-worktree-safety.test.ts > collection never launches clean process textconv external diff fsmonitor or a repository program`.
- [ ] RED: `tests/live-worktree-safety.test.ts > concurrent add and commit see no collector index lock or collector index mutation`.
- [ ] RED: `tests/live-worktree-safety.test.ts > attributes and symlink changes during capture cause retry before forbidden content is read`.
- [ ] GUARD: `tests/live-worktree-safety.test.ts > linked worktrees keep independent index stages and authorized hidden files including github remain visible`.
- [ ] Implement: inventory-before-content, attribute checks, direct safe file/raw blob reads, no-filter fingerprints without object writes, before/after stability checks and no-optional-lock/no-fsmonitor/no-lazy-fetch invocation policy. Carry common-dir/checkout isolation and staged/unstaged distinction from GitNexus/CodeGraph; include sparse/skip-worktree, symlink/gitlink, binary, oversized and protected paths.
- Allowed (≤8): E:`engram-live/git-executor.ts`, E:`engram-live/worktree.ts`, E:`engram-live/attributes.ts`, E:`engram-live/filesystem.ts`, E:`tests/live-worktree-safety.test.ts`, E:`tests/helpers/live-process-trace.ts`, E:`tests/helpers/live-git-fixtures.ts`, this plan.
- Forbidden: converting `status`/working-tree diff before exclusions, `update-index`, `write-tree`, optional index locks, deleting `index.lock`, `hash-object -w`, implicit fetch or following a symlink outside the authorized root.
- Gate: tracer programs, including a fail-on-call executable named `python3` implemented without Python, receive zero collector invocations; concurrent scenario has zero collector-caused lock failures. Isolated index/ref/checkout digests remain unchanged by collector operations; unsafe capture never becomes stable.

## L4b — Diffs And Encrypted Latest Local Content (LIVE §§8, 10, A08/A09) — engram, protection/storage in separate host branches

- [ ] RED: `tests/live-diffs.test.ts > staged unstaged and conflict-stage changes remain distinct with immutable endpoints`.
- [ ] RED: `tests/live-content-policy.test.ts > emitted batches fake sink calls and producer diagnostics contain no forbidden plaintext or derivatives`.
- [ ] RED: `tests/live-content-policy.test.ts > absent fake protection keys emit allowed metadata only and unregister requests private payload purge`.
- [ ] RED: `packages/cluster-mesh/tests/live-content-protection.spec.ts > real SQLite DB WAL search temp logs and backups contain no fixture plaintext and purge revokes decryptability`.
- [ ] RED: `packages/h2a-runtime/src/gateway-host/live-key-provider.test.ts > keys remain outside the database and missing or revoked keys deny decryption`.
- [ ] GUARD: `tests/live-diffs.test.ts > binaries large files filtered paths symlinks and unstable captures report explicit exclusions or coverage`.
- [ ] Implement: neutral snapshots/diff/hunk/range facts, versioned normalization, deterministic pre-persistence secret/path policy and injected host content protection. Retain the latest authorized encrypted state only, no local history. Apply policy to symbols/citations/search/context as well as patch text. Carry explicit retention/exclusions from GitNexus, strengthened to every surface; implement storage purge/key lifecycle through the host contract.
- Allowed (7, E): E:`engram-live/snapshots.ts`, E:`engram-live/diffs.ts`, E:`engram-live/content-policy.ts`, E:`engram-live/contracts.ts`, E:`tests/live-diffs.test.ts`, E:`tests/live-content-policy.test.ts`, E:`tests/fixtures/live-private-content.json` (synthetic secrets only).
- Allowed (3, S): S:`packages/cluster-mesh/src/live-storage/protected-payload.ts`, S:`packages/cluster-mesh/src/live-storage/sqlite.ts`, S:`packages/cluster-mesh/tests/live-content-protection.spec.ts`.
- Allowed (2, H): H:`packages/h2a-runtime/src/gateway-host/live-key-provider.ts`, H:`packages/h2a-runtime/src/gateway-host/live-key-provider.test.ts`.
- Forbidden: persist-then-mask, `.gitignore` as secret assurance, raw local plaintext FTS/logs/WAL, local-state history, inferring physical purge from tombstones or publishing private facts under a derived-content label.
- Gate: E tests only producer batches/sink calls with fake protection ports; no DB or host imports. The S branch executes real SQLite DB/WAL/temp/log/search/backup scans and purge/replacement scenarios; H proves key custody/revocation. All three evidence sets are required, capture instability is visible, committed history survives purge, and L8 adds Postgres/restore evidence.

## L5 — Versioned Code And Branch Comparisons (LIVE §§3, 6, 8, A04/A08) — engram

- [ ] RED: `tests/live-code-version.test.ts > identical blobs resolve separately by tree path configuration and project dependencies`.
- [ ] RED: `tests/live-code-version.test.ts > body-only edits invalidate derived facts and preserve valid external callers`.
- [ ] RED: `tests/live-branch-comparison.test.ts > PR base default base multiple merge-bases and every merge parent retain pinned endpoints`.
- [ ] GUARD: `tests/live-code-version.test.ts > unavailable grammar and unknown historical bounds never appear as complete analysis`.
- [ ] GUARD: `tests/live-code-version.test.ts > injected host cache and grammar paths leave all tracked untracked ignored files gitattributes and Git config unchanged`.
- [ ] GUARD: `tests/live-package.test.ts > packaged reused extraction resolves only bundled code and verified grammar assets without the root install closure`.
- [ ] Implement: context-bound parse/resolution caches using injected host storage, never a source-root default; thread the seam through reused extraction/cache code and the isolated package build. Implement and verify affected-call/inheritance repair; emit scoped unresolved-call/type facts for L7b-R. Lazy patch/AST operations use R1 retained objects. Expose pinned contribution/current-tip/parent comparisons and uncertainty.
- Allowed (11, E): E:`engram-live/code-analysis.ts`, E:`engram-live/comparisons.ts`, E:`engram-live/analysis-cache.ts`, E:`src/extract.ts`, E:`src/cache.ts`, E:`tests/live-code-version.test.ts`, E:`tests/live-branch-comparison.test.ts`, E:`tests/fixtures/live-code-context.json`, E:`scripts/build-live.mjs`, E:`engram-live/grammar-manifest.json`, E:`tests/live-package.test.ts`.
- Forbidden: topology-only or size/mtime-only freshness proof, cross-context symbol reuse, eager AST of every historical commit, deleted callers during partial repairs or LLM resolution.
- Gate: producer tests use fake retained-object/cache ports and no DB/host import; R1 supplies real deletion/GC reconstruction evidence. Context/body-only/dependency/parent cases and LIVE §2 whole-worktree guard pass; package closure/grammar tests are rerun after reuse changes. Grammar and attribution gaps remain explicit; cluster-mesh owns database readers.

## L6a — Explicit Host Declarations And Clone Identity (LIVE §§2–3, 10, 12, A01/A09/A17) — engram, h2a and sentropic

- [ ] RED: `tests/live-registration-contract.test.ts > declaration revisions and revocation are data-pure and independent of projection availability`.
- [ ] RED: `packages/cluster-mesh/tests/live-registration.spec.ts > declarations bind workspace fingerprint and revision and replay after projection loss`.
- [ ] RED: `packages/cluster-mesh/tests/live-registration.spec.ts > removal cancels delayed work and requests private purge without deleting committed history`.
- [ ] RED: `api/tests/api/live-registration.test.ts > product declarations use authorized code-workspace bindings without changing membership or enrollment semantics`.
- [ ] RED: `packages/h2a-runtime/src/gateway-host/live-registration.test.ts > equal fingerprints in two clones remain distinct and linked worktrees share one common-dir clone`.
- [ ] GUARD: `packages/h2a-runtime/src/gateway-host/live-registration.test.ts > bind upload code-workspace creation and session opening or ending never activate or remove live declarations`.
- [ ] GUARD: `api/tests/api/live-registration.test.ts > admin-gated bind and default transcript persistence do not imply live authorization`.
- [ ] Implement: a new explicit live capability, with durable local h2a state and app product persistence independent of the live projection; do not treat `workspaces-router.ts` as an existing repository registry. Preserve enrollment v3 admin bind and separate upload; bind product live intent to server/issuer, workspace/fingerprint pair and binding revision. Preserve public h2a fingerprints; normalize the common-dir project component for clone identity plus host/realpath, with isolated worktree identities. Add list/status/remove/path/replay and cancellation seams. Contract work starts without a live DB.
- Allowed (3, E): E:`engram-live/contracts.ts`, E:`engram-live/registration.ts`, E:`tests/live-registration-contract.test.ts`.
- Allowed (4, H): H:`packages/h2a-runtime/src/gateway-host/live-registration.ts`, H:`packages/h2a-runtime/src/gateway-host/live-registration.test.ts`, H:`packages/h2a-runtime/src/gateway-host/live-declarations.ts`, H:`packages/h2a/src/runtime/live/contracts.ts` (data-pure DTOs).
- Allowed (8, S): S:`packages/cluster-mesh/src/live-storage/registration.ts`, S:`packages/cluster-mesh/tests/live-registration.spec.ts`, S:`api/src/services/cluster-mesh/live-declarations.ts`, S:`api/src/db/control-schema.ts`, S:`api/drizzle/control/0009_live_git_declarations.sql`, S:`api/drizzle/control/meta/_journal.json`, S:`api/tests/api/live-registration.test.ts`, S:`api/src/routes/namespaces/code-git-ports.ts`.
- Forbidden: using the product workspace router as the local registry; engram-owned host state; implicit opt-in from bind/upload/session; changing public `ws:` identity; URL/fingerprint-only clone keys; projection-only authority; delayed-job reactivation after removal.
- Gate: declaration contract tests run with no projection provider; real host declaration persistence/replay, auth-denial/rebind/revision races, equal-fingerprint clones and lifecycle guards pass. Existing enrollment/membership behavior is preserved. Local identity verification itself is completed by L7a before exposing any declaration API.

## L6b — Scheduler, Watch And Reconciliation (LIVE §§7, 12–13, A01/A03/A04/A14) — engram

- [ ] RED: `tests/live-reconcile.test.ts > watcher readiness precedes initial scan and edits during the scan are reconciled before current coverage`.
- [ ] RED: `tests/live-reconcile.test.ts > lost events overflow downtime packed refs and projection replacement converge after stabilization`.
- [ ] RED: `tests/live-reconcile.test.ts > interactive changes and history backfill both progress under bounded queues retries and resource budgets`.
- [ ] RED: `tests/live-reconcile.test.ts > event storms and writer conflict produce bounded reconciliation and an explicit degraded state`.
- [ ] GUARD: `tests/live-reconcile.test.ts > hook absence client disconnect and repeated ref polling cannot suppress collection or invent activity`.
- [ ] GUARD: `tests/live-reconcile.test.ts > bootstrap reconciliation restart and shutdown leave all worktree files status gitattributes and Git config unchanged`.
- [ ] RED: `tests/live-scheduler-budget.test.ts > fake sink backpressure bounds queue bytes concurrency and retries while both priorities advance`.
- [ ] Implement: injected native-watch/polling orchestration, serialized scope work, durable pending/phase markers, startup/full reconciliation, bounded coalescence/backoff and separate coverage axes. Carry GitNexus watch-before-scan/freshness, CodeGraph adaptive watch/writer/degraded/replacement recovery and CodeGraphContext mandatory restart file/relation repair. Set and record pending-path/byte/concurrency/retry/time budgets while preserving LIVE §13 targets.
- Allowed (9, E): E:`engram-live/scheduler.ts`, E:`engram-live/watch.ts`, E:`engram-live/reconcile.ts`, E:`engram-live/coverage.ts`, E:`engram-live/integration.ts`, E:`tests/live-reconcile.test.ts`, E:`tests/live-scheduler-budget.test.ts`, E:`tests/helpers/live-clock-watch.ts`, E:`plan/09-BRANCH_LIVE_GIT_INDEXING.md`.
- Forbidden: unbounded RAM queues, hooks as sole truth, mtime-only correctness, client-lifetime scheduling, silent degraded watch or backfill pruning to meet latency.
- Gate: fake-port lost-event/restart/fairness and LIVE §2 whole-worktree guards pass; native Linux watch smoke executes; unknown/partial never becomes current. Resource counters enforce bounded producer work; no DB/host imports in E tests. Installed freshness measurements belong to L9-H. R-E can publish the complete neutral runtime only after the E gates through L6b pass.

## L7b-C — Namespace Contract And Contracts Release (LIVE §§3, 11–12, A12/A17) — sentropic

- [ ] RED: `packages/cluster-mesh/tests/namespace-module-contract.spec.ts > code Git is in the closed namespace contract and N-1 clients explicitly reject unsupported capabilities`.
- [ ] GUARD: `packages/cluster-mesh/tests/namespace-module-contract.spec.ts > existing namespaces and memory restrictions remain unchanged`.
- [ ] Implement: add `/code-git` to `CLUSTER_MESH_NAMESPACES`, additive contract exports and N/N-1 negotiation fixtures; record public contract version/fixture evidence. This lot owns the required `packages/contracts` scope. Prepare R-C after the neutral release checkpoint R-E; tests can use pinned packed prereleases beforehand.
- Allowed (5, S): S:`packages/contracts/src/cluster-mesh-namespace.ts`, S:`packages/contracts/src/index.ts`, S:`packages/contracts/package.json`, S:`package-lock.json`, S:`packages/cluster-mesh/tests/namespace-module-contract.spec.ts`.
- Forbidden: memory namespace reuse; implicit unknown-namespace acceptance; breaking N-1 without an explicit incompatibility result; publication in S0.
- Gate: built contract and public N/N-1 fixtures pass; R-C records version, tarball integrity and fixture digest. Cluster-mesh release waits for this version; no neighboring-checkout dependency is shipped.

## L7b-R — Typed Readers And Cross-Repository Resolution (LIVE §§3, 12, 14, A12/A17) — cluster-mesh/sentropic

- [ ] RED: `packages/cluster-mesh/tests/live-namespace.spec.ts > authorized history PR diff code and registry reads bind source generation and coverage with bounded pages`.
- [ ] RED: `packages/cluster-mesh/tests/live-readers.spec.ts > cross-repository member calls resolve only unique authorized same-language declarations and invalidate on removal or reindex`.
- [ ] RED: `packages/cluster-mesh/tests/live-namespace.spec.ts > N and N-1 fixtures distinguish missing incompatible and denied capabilities from empty data`.
- [ ] GUARD: `packages/cluster-mesh/tests/live-readers.spec.ts > multi-repository traversal preserves provenance and never leaks unauthorized OID existence`.
- [ ] Implement: typed database readers and `/code-git` router over the storage port, deterministic PR list/detail/impact/overlap and bounded cross-repository candidate resolution. Use L5 unresolved/type facts; ambiguous or missing declarations stay unresolved. Pin all repository generations and expose coverage. Registry operations delegate to the host declaration capability. Engram gains no database reader.
- Allowed (7, S): S:`packages/cluster-mesh/src/live-storage/readers.ts`, S:`packages/cluster-mesh/src/live-storage/cross-repository.ts`, S:`packages/cluster-mesh/src/hono/code-git-router.ts`, S:`packages/cluster-mesh/src/index.ts`, S:`packages/cluster-mesh/tests/live-namespace.spec.ts`, S:`packages/cluster-mesh/tests/live-readers.spec.ts`, S:`packages/cluster-mesh/tests/fixtures/code-git-n-n1.json`.
- Forbidden: engram-owned DB readers; full-history merged in-memory graphs; ambiguous name matching; LLM triage; cross-tenant probing; silently reporting a missing provider as current empty data.
- Gate: shared real-backend reader fixtures and bounded pagination pass, including N/N-1, denied roots, unregister and cross-repo invalidation. L9-S adds the installed functional matrix after L7a.

## L7b-D — Catalogued Neutral Peer And Cluster-Mesh Release (LIVE §§3, 11, A12/A15) — sentropic

- [ ] RED: `packages/cluster-mesh/tests/modules/live-provider.spec.ts > catalogued engram live peer loads the executable factory only after version export and evidence checks`.
- [ ] RED: `packages/cluster-mesh/tests/live-package.spec.ts > packed cluster-mesh installs the neutral peer without root engram model SDKs or grammar build scripts`.
- [ ] GUARD: `packages/cluster-mesh/tests/modules/live-provider.spec.ts > missing or mismatched peer is explicit and root imports do not evaluate the provider`.
- [ ] Implement: optional peer range, catalog/module IDs, typed lazy loader and composition leaf for `@sentropic/engram-live/integration`, preserving contracts-only adapter imports. Pin contract/fixture/release evidence and the contracts package range. Prepare R-S only after R-E and R-C released artifacts and L7b-R are qualified; include N/N-1 and driver/install evidence.
- Allowed (11, S): S:`packages/cluster-mesh/src/modules/contracts.ts`, S:`packages/cluster-mesh/src/modules/catalog.ts`, S:`packages/cluster-mesh/src/loaders/engram-live.ts`, S:`packages/cluster-mesh/src/integrations/engram-live.ts`, S:`packages/cluster-mesh/src/compose/engram-live.ts`, S:`packages/cluster-mesh/package.json`, S:`package-lock.json`, S:`packages/cluster-mesh/tests/modules/live-provider.spec.ts`, S:`packages/cluster-mesh/tests/live-package.spec.ts`, S:`.github/workflows/ci.yml`, S:`docs/operations/live-git-compatibility.md`.
- Forbidden: root `@sentropic/engram` dependency; vendored runtime; implicit provider evaluation; `file:` dependency on another checkout; unqualified runtime driver fallback; claiming a type export is an executable factory.
- Gate: packed install and factory composition execute without Python, with matching evidence and explicit absence/mismatch refusal. Record R-S version/integrity and compatible neutral/contracts versions. H2a's existing exact cluster-mesh 0.13.3 pin cannot pass as the new capability.

## L7a — Verified Local Authority, h2a Composition And Supervision (LIVE §§2, 11–12, A01/A04/A15) — h2a

- [ ] RED: `packages/h2a-runtime/src/gateway-host/live-auth.test.ts > an unverified local principal cannot register or read live and receives explicit refusal rather than empty data`.
- [ ] RED: `packages/h2a-runtime/src/gateway-host/live-auth.test.ts > session bearers wrong audience expired capabilities and revoked declaration revisions cannot authorize live`.
- [ ] RED: `packages/h2a-runtime/src/gateway-host/live-host.test.ts > installed exact versions compose the factory and resume declarations under supervision without a client`.
- [ ] RED: `packages/h2a-runtime/src/gateway-host/live-host.test.ts > job worktrees share only immutable facts and archives without complete Git expose partial coverage`.
- [ ] GUARD: `packages/h2a-runtime/src/gateway-host/live-host.test.ts > absent incompatible or denied providers fail explicitly and live activation installs no hooks`.
- [ ] Implement: LIVE §12 verified h2a principal, host-local tenant, live-specific audience/expiry/root/revision capabilities, verification/authorization/receipt ports and revocation. Keep the existing disabled session-control ports separate. Compose the catalogued factory with storage, keys, retention and declaration lifecycle; qualify unattended supervision/job cleanup. R-H pins the released neutral package and cluster-mesh exactly, replacing 0.13.3, and records compatible contract evidence. Verify the whole installed host closure without Python, including existing native dependencies; do not infer this from producer-only tests.
- Allowed (12, H): H:`packages/h2a-runtime/src/gateway-host/host.ts`, H:`packages/h2a-runtime/src/gateway-host/live-host.ts`, H:`packages/h2a-runtime/src/gateway-host/live-auth.ts`, H:`packages/h2a-runtime/src/gateway-host/live-auth.test.ts`, H:`packages/h2a-runtime/src/gateway-host/live-host.test.ts`, H:`packages/h2a-runtime/src/gateway-host/daemon.ts`, H:`packages/h2a-runtime/src/delegate.ts`, H:`packages/h2a-runtime/src/gateway-host/live-supervisor-fixture.ts`, H:`docs/operations/live-git-supervision.md`, H:`packages/h2a-runtime/package.json`, H:`package-lock.json`, H:`.github/workflows/ci.yml`.
- Forbidden: trusting unauthenticated loopback/session minting as live authority; inferring product tenant from workspace ID; host/runtime imports into copyable DTOs; agent-owned DB administration; activation of unregistered paths; unqualified install or supervision claims.
- Gate: auth denial/mismatch/revocation cases and installed host restart without an agent client pass; declaration scope and retention survive job cleanup. Installed closure works without Python on each advertised platform/runtime. Record actual environment and package versions; other environments remain `unverified`.

## L8 — App Publication, Cutover And Recovery (LIVE §§9–10, A09–A12/A16) — sentropic

- [ ] RED: `api/tests/api/live-publication.test.ts > duplicate and reordered batches cannot overwrite another tenant clone or published generation`.
- [ ] RED: `api/tests/api/live-publication.test.ts > private index and worktree text symbols fingerprints and snapshots never enter Postgres`.
- [ ] RED: `api/tests/api/live-publication.test.ts > outages preserve stale coverage and resume from durable receipts`.
- [ ] RED: `api/tests/api/live-restore.test.ts > coordinated restore preserves deleted-ref observations object receipts private object availability and separate key custody`.
- [ ] RED: `api/tests/api/live-cutover.test.ts > shadow activation and rollback select compatible content generations without losing declarations or history`.
- [ ] GUARD: `api/tests/api/live-publication.test.ts > unauthorized OID existence and raw emails are absent from DB logs backups and reader artifacts`.
- [ ] Implement: app namespace composition following `code-git.ts`, `code-git-cutover.ts`, `code-git-ports.ts`; authorize Q6 A committed projection with app-resolved tenant/RBAC and enrollment-bound workspace identity. Operate L3b-P migrations, retry/coverage, namespace cutover/rollback and coordinated backup/restore. R1 retains local private objects; no pack or key is automatically uploaded to Postgres. App tests use explicit remote object/key ports; L9-H exercises the installed host coordination.
- Allowed (12, S): S:`api/src/app.ts`, S:`api/src/routes/namespaces/code-git.ts`, S:`api/src/routes/namespaces/code-git-cutover.ts`, S:`api/src/routes/namespaces/code-git-ports.ts`, S:`api/src/services/cluster-mesh/live-publication.ts`, S:`api/src/services/cluster-mesh/live-backup.ts`, S:`api/tests/api/live-publication.test.ts`, S:`api/tests/api/live-restore.test.ts`, S:`api/tests/api/live-cutover.test.ts`, S:`docs/operations/live-git-recovery.md`, S:`.github/workflows/ci.yml`, S:`spec/QUALIFICATION_LIVE_GIT_INDEXING.md`.
- Forbidden: private SQLite replication; derived-private-fact publication; raw email default; agent/Pod DB administration; tenant mixing; treating non-reconstructible evidence as disposable; deployment in S0.
- Gate: real Postgres authorization/publication/leak/restore/cutover lanes execute with zero skips. Include the L4b SQLite DB/WAL evidence and R1 object-retention receipts in recovery reconciliation. App operator verifies recovery before activation; Q6 A is already accepted.

## L9-E — Producer Compatibility And Whole-Worktree Boundary (LIVE §§2, 11, A07/A13) — engram

- [ ] RED: `tests/live-producer-compatibility.test.ts > committed compatibility facts preserve corpus annotations and source provenance through a fake sink`.
- [ ] GUARD: `tests/live-artifact-boundary.test.ts > complete producer cycles preserve tracked untracked ignored files status gitattributes and Git config`.
- [ ] GUARD: `tests/live-producer-compatibility.test.ts > compatibility contains no private snapshot export database reader or host import`.
- [ ] Implement: producer-level compatibility and artifact guards with injected fake sinks/cache/protection ports; run the common LIVE §2 inventory/status/digest check through activation, scan, reconciliation, reads, restart and disable. Preserve independent corpus annotations; no live file export.
- Allowed (5, E): E:`tests/live-producer-compatibility.test.ts`, E:`tests/live-artifact-boundary.test.ts`, E:`tests/helpers/live-process-trace.ts`, E:`engram-live/integration.ts`, E:`tests/fixtures/live-code-context.json`.
- Forbidden: engram database/host imports; DB/WAL or end-to-end SLO claims from fake ports; adding database readers under `engram-live`; a tracked-diff-only artifact guard.
- Gate: producer compatibility and full worktree boundary pass with fake ports and zero model/Python/package-resolution calls. H0/L5/L6b guard evidence is linked; installed behavior remains L9-H.

## L9-S — Typed Functional Parity (LIVE §14, A12/A17) — cluster-mesh/sentropic

- [ ] RED: `packages/cluster-mesh/tests/live-functional-parity.spec.ts > history PR inspection registry paths and compatibility reads satisfy the upstream matrix with provenance`.
- [ ] RED: `packages/cluster-mesh/tests/live-functional-parity.spec.ts > cross-repository calls agree after incremental add remove and reindex and ambiguous targets stay unresolved`.
- [ ] GUARD: `packages/cluster-mesh/tests/live-functional-parity.spec.ts > unauthorized or missing providers cannot appear as an empty graph and annotations remain separate`.
- [ ] Implement: only the bounded typed-reader compatibility glue needed for LIVE §14, with real adapters and public N/N-1 evidence. Reconcile source versions/generations and authorized cross-repository resolution; no global file registry or export. Link H0/P1/L6a/L6b/L7a executions for the watch/hook/lifecycle portions rather than simulating them as DB behavior.
- Allowed (4, S): S:`packages/cluster-mesh/src/live-storage/readers.ts`, S:`packages/cluster-mesh/tests/live-functional-parity.spec.ts`, S:`packages/cluster-mesh/tests/fixtures/code-git-n-n1.json`, S:`spec/QUALIFICATION_LIVE_GIT_INDEXING.md`.
- Forbidden: hidden matrix exclusions; model triage; full-history file/Graphology responses; corpus migration; tests in engram that import cluster-mesh.
- Gate: real-backend typed parity and N/N-1 lanes pass with no missing lifecycle evidence; all deliberate upstream differences in LIVE §14 are explicit. Failures stay open for L9-H acceptance reconciliation.

## L9-H — Installed End-To-End SLO And Acceptance Exit (LIVE §§13–16, A01–A17) — h2a

- [ ] RED: `packages/h2a-runtime/src/gateway-host/live-slo.test.ts > installed warm publication backfill bounded reads and crash recovery meet every fixed LIVE budget`.
- [ ] GUARD: `packages/h2a-runtime/src/gateway-host/live-installed-boundary.test.ts > the full live host cycle preserves every worktree file status gitattributes and Git config`.
- [ ] GUARD: `packages/h2a-runtime/src/gateway-host/live-installed-boundary.test.ts > disable and restore preserve corpus access declarations retained objects and committed history without exposing private content`.
- [ ] Implement: installed host benchmark for the three pinned repos plus synthetic ≥100000 commits/1501-commit PR, including real SQLite and app Postgres. Measure stable source through storage to published readable generation; report bootstrap separately, CPU/RSS/process count/volume and failures. Exercise private-store/key backup coordination and disable/rollback with actual host adapters. Produce evidence and operations notes, never source-content dumps.
- Allowed (7, H): H:`packages/h2a-runtime/src/gateway-host/live-slo.test.ts`, H:`packages/h2a-runtime/src/gateway-host/live-installed-boundary.test.ts`, H:`packages/h2a-runtime/src/gateway-host/live-supervisor-fixture.ts`, H:`scripts/bench-live.mjs`, H:`docs/operations/live-git-supervision.md`, H:`docs/evidence/live-git-qualification.md`, H:`.github/workflows/ci.yml`.
- Forbidden: producer-only timings reported as publication SLO; omitted DB processes in memory/CPU budgets; silently relaxed thresholds; live-generated versioned data exports; completed checkboxes without executions.
- Gate: reconcile A01–A17 against E/S/H evidence, no unacknowledged gap; report p50/p95, RSS/CPU/process/volume, bootstrap duration (measured without target), all fixed thresholds and versions on both backends. Two independent non-author reviews and conductor reconciliation precede acceptance. Merge/release/deployment are separate operations; none of these results is claimed by S0.

## Out Of Scope

- [ ] Direct database-to-Git synchronization or any file generated by live for version control, including the older proposed bounded JSON export.
- [ ] Global migration of documentary corpora, annotations or canonical agent-memory stores; changes to memory tombstones/raw-SQL policy.
- [ ] LLM ranking, embeddings, assistant work emission, upstream runtime adoption, implementation of additional graph engines in this delivery, general remote refresh or implicit telemetry. The port must remain suitable for later graph backends.
- [ ] A standalone engram daemon independent of cluster-mesh; registration triggered by every agent session; unqualified non-Linux/runtime/platform support.
- [ ] Commits, Track imports, pushes, merges, package publication or product deployment in the S0 authoring turn.

## Feedback Loop

- [ ] The conductor owns cross-repository coordination, commits and Track imports; S0 performs none. Each receiving lot records its exact repository/branch, file scope and dependency evidence before implementation.
- [ ] Capture the actual failing baseline before marking a proposed case RED. If it already passes, relabel it GUARD and record a discriminating mutation for a critical guard. Manual S0 document checks do not masquerade as executable tests.
- [ ] Preserve completed evidence separately from planned obligations; future lots remain unchecked until their gates run. Missing required backend/runtime infrastructure is a failed gate, never a silent skip.
- [ ] L3a records D/Q7 outcomes against fixed LIVE §13 thresholds. Measured failure activates the already accepted applicable B alternative after conductor review, with impact/rollback and requalification evidence; no runtime fallback and no owner re-poll unless the alternative violates an accepted constraint.
- [ ] Carry R-E → R-C → R-S → R-H release evidence between repositories; h2a must update its exact cluster-mesh pin. No package publication or plan import occurs in S0.
- [ ] Opus S0 findings are mapped in LIVE's final disposition table; all implementation/runtime/performance gates remain `unverified`. The base is two commits behind the inspected `origin/main`; neither commit touches the four S0 documents. Rebase belongs to later PR preparation, not this uncommitted authoring pass.
- [ ] Each carried behavior in LIVE §15 and each upstream parity row in §14 maps to the named lot/case; reconciliation removes unsupported claims rather than dropping coverage silently. Conductor review and product activation remain distinct from S0 document completion.
