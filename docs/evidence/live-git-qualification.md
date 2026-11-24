# Engram read-side timing harness — unverified, not measurable

**not measurable: native readers absent (cluster-mesh L9-S, G3/G4/G5)**.
This is an offline Git-component diagnostic, not an installed native-service
measurement or an operator-workflow benchmark. Both arms run the same native
Git controls. Every native/planned-reader measurement flag is `false`; no
continuation decision can be inferred from the diagnostic median.

## Ownership and provenance

The owner decision of 2026-10-18, relayed by h-cond — “engram gardien de
toutes les ontologies de dev” — transfers the twenty-investigation timing
harness from H to E. See plan/09, amendment Δ-L9-S/L9-H. The fixed protocol,
30% continuation threshold and conditional 20% execution-pilot threshold
are unchanged. No execution pilot is authorized or run.

Ported from h2a PR #372, branch `feat/live-read-side-timing`, source commit
`6ddc5631a3f51fb81883294210a4c9b90fda4b2f`. The source script, gateway-host
test, `live-supervisor-fixture.ts` and qualification document were inspected,
along with Sol's `rev372-last.md` and the corrective-round `l9h2.log`.
The five source-review protections are retained: absent native readers,
non-success exclusion, hidden expectations, hashed reasons and explicitly
scoped resources. Historical h2a timings are not carried over as engram results.

## Reproducible corpus and protocol

- Manifest: `tests/fixtures/live-read-side-cases.json`, SHA-256
  `fe2ef5dfdfc8a64e574a2a807b468cda1e3244f27cf827b598c19a3bf82fb945`,
  oracle version `native-git-read-side/1`, `protocol.baselineCapMs: 30000`;
  20 numbered investigations, 53 independently frozen Git controls and full
  algorithm-qualified pins (Case 7 re-pinned to declared fixture `F_WT`).
- `tests/live-read-side-timing.test.ts` restores engram's checksummed history
  pack and constructs the existing `F_*` controls with the already merged
  fixture helpers. Setup writes are confined to OS temporary directories.
  Observed repository inventories are identical before and after timing.
  H/S fixtures represent scenario types, not the original H/S repositories
  or their installed qualification.
- The script identifies `@sentropic/engram-live` by package name, version
  and package-manifest SHA-256, without loading a producer or host runtime.
  Its executable imports are Node builtins only. Git has network protocols,
  global/system configuration and optional locks disabled.
- Expectations are frozen and hashed before bootstrap/timing. The timed
  runner receives case/oracle IDs, repository mappings and Git arguments;
  it receives no expected answer, reason, stdout, excerpt or status.
  Verification occurs after timing; the recorded freeze timestamp is real.
- Odd/even investigations counterbalance first T0/T1 runs. First timings
  remain separate from warm repetitions. `--warm N` retains N timings per
  arm and reports their means; warm timings never enter the primary score.
- All 20 cases remain visible and every case receives a finite numeric
  gain (`Δ-L9-E1`, protocol items 5–6). When `T0` succeeds and `T1` ends in
  a non-success state (`capability-absent`, `capture-absent`,
  `policy-unavailable`, `reader-absent`, `failed`, `denied`, `refused`),
  baseline recovery is scored (`t1EffectiveMs = t1TotalMs + t0FirstMs`,
  `gain = -t1TotalMs / t0FirstMs <= 0`), with `matchedExpectation: false`
  and `countsAsSaving: false`. When `T0` fails or exceeds the manifest's
  uniform `baselineCapMs` (`30000` ms, validated before measurement;
  manifests without a positive finite cap are refused with exit code 2),
  `T0` is scored at `baselineCapMs`: if `T1` succeeds,
  `gain = 1 - t1TotalMs / baselineCapMs` (`answeredBy: "native-only"`); if
  neither arm succeeds, `gain = 0` (`answeredBy: "neither"`). All 20 numeric
  gains enter the population median (`0.30` continuation threshold unchanged);
  continuation requires exactly 20 finite numeric gains (otherwise
  `verdict: "not-computable"`), constant quality across all 20 cases, and an
  installed native reader (`verdict: "not-measurable"` while `reader-absent`).
  Missing or duplicate case IDs are refused.
- Reason text is replaced by SHA-256 plus category/citation IDs. Evidence
  contains no oracle stdout, answer text or documented-reason text. G4
  stays `policy-unavailable`, with zero emitted bytes and no time-saving
  claim. Undocumented reasons remain `inconnu`.
- CPU/RSS fields are `cpuMsParentProcessOnly` and
  `rssBytesParentProcessOnly`: Git-child CPU/RSS is uncollected. Git launch
  count, repository-storage bytes, wall time and bootstrap time are separate.
  `classificationMs` and the legacy `recoveryMs` alias measure result
  classification only; no recovery workflow is measured.

Run the isolated, reproducible corpus with:

```sh
npx --no-install vitest run --configLoader runner tests/live-read-side-timing.test.ts tests/live-read-side-oracles.test.ts tests/live-neutrality.test.ts
```

For independently prepared authorized copies, the dependency-free CLI is:

```sh
node scripts/bench-live.mjs \
  --manifest tests/fixtures/live-read-side-cases.json \
  --repo engram=/tmp/engram-history \
  --repo h2a=/tmp/h2a-control --repo sentropic=/tmp/sentropic-control \
  --repo F_WT=/tmp/f-wt-control \
  --out /tmp/engram-live-timing.json --warm 1
```

The mappings above must contain the pinned objects, using the existing fixture
recipe and history snapshot (`F_WT` is constructed and disposed inside
`LiveGitSandbox` by `buildReadSideFixtures(box)`). They are isolated
authorized copies, never owner worktrees (`graphify-wt-livegit` was removed
under Δ-L9-E1). The test constructs and removes them automatically. Its
real-corpus run retains 11 verified Git controls at case level, 7
`capability-absent` cases, case 7 `capture-absent` (re-pinned to declared
fixture `F_WT` with `localStateRead: "not-authorized"`) and case 20
`policy-unavailable`; zero oracle verification errors, all 20 cases carry
deterministic numeric gains (`<= 0` for the 9 non-success cases),
`baselineCapMs = 30000`, and continuation remains `not-measurable`
(`reader-absent`). Synthetic mutations additionally exercise `failed`,
`denied`, `refused`, and `reader-absent` states, no-success populations,
baseline cap enforcement (`baselineCapMs`), `< 20` numeric gain
`not-computable` guards, G4 closed safety, and warm repetitions. All
service/installed results remain `unverified`.

## Outside this port: host runtime and missing readers

- h2a's supervisor lifecycle, gateway-host composition, installed artifacts,
  crash/restart, backend publication and freshness/SLO qualification remain
  H responsibilities, including `live-slo.test.ts` and
  `live-installed-boundary.test.ts` under
  `packages/h2a-runtime/src/gateway-host/` and host operations/CI wiring.
- The original gateway-host `live-read-side.test.ts` remains in h2a; only
  its portable protocol assertions are adapted here. The source
  `live-supervisor-fixture.ts` contains pure arithmetic, despite its name;
  it is not imported or copied into a new engram module. Engram tests the
  CLI directly and needs no h2a runtime/helper dependency.
- Cluster-mesh L9-S typed readers, G3 reasons, G4 host disclosure authority,
  optional G5, cross-repository generations, installed SQLite/Postgres
  resources and the complete human T0 workflow remain unmeasured. Engram's
  producer package identity does not establish any installed reader.
- T0 Git-component timing excludes accessible-tool/document/memory/operator
  overhead. T1 is explicitly `reader-absent`. No native-service median,
  continuation YES/NO, installed acceptance or execution-pilot result is claimed.

## Port validation, 2026-10-18

Node `v22.22.1`, Git `2.53.0`, local dependencies only:

- `npm run build` passed with `npm_config_offline=true`, including both
  studio builds. Build warnings concerned existing CJS `import.meta` and
  Svelte reactivity; no build step failed.
- `npx --no-install vitest run tests/live-read-side-timing.test.ts tests/live-read-side-oracles.test.ts`:
  **22 passed**, 2 files, zero skips. These are all live test files touched
  by this port; the pre-existing oracle file is unchanged.
- `npx --no-install tsc --noEmit -p .`, `node --check scripts/bench-live.mjs`
  and `git diff --check` passed.
- The build-generated `src/workspace/tokens-st-css.generated.ts` was
  restored with `git checkout -- src/workspace/tokens-st-css.generated.ts`.

Only the four owner-authorized files are versioned by this port. No Python,
network, new dependency, push or host-runtime change. No new peer consensus
or installed acceptance is claimed by these local author checks.

## Δ-L9-E1 update, 2026-11-24

Applied on `feat/live-git-dl9e1` (base `60a84696abc96b3e48eb7de139e809e73530be4e`, builder Hydrogen, 7 Allowed files):

- Fixed `protocol.baselineCapMs = 30000` in `tests/fixtures/live-read-side-cases.json` (manifest SHA-256 `fe2ef5dfdfc8a64e574a2a807b468cda1e3244f27cf827b598c19a3bf82fb945`) and validated before measurement in `scripts/bench-live.mjs` (refusing missing/non-positive caps with exit code `2`). Continuation threshold remains `0.30`.
- Implemented uniform non-success recovery scoring (`t1EffectiveMs = t1TotalMs + t0FirstMs`, `gain = -t1TotalMs / t0FirstMs <= 0`), failing/capped baseline scoring (`t0ScoredMs = baselineCapMs`; `gain = 1 - t1TotalMs / baselineCapMs` when `T1` succeeds, `0` when neither arm succeeds), and the 20-numeric-gain continuation check (`verdict: "not-computable"` when `< 20` numeric gains; `verdict: "not-measurable"` while `reader-absent`).
- Re-pinned Case 7 from vanished owner worktree `graphify-wt-livegit` to declared ephemeral fixture worktree `F_WT` built in `/tmp` by `buildReadSideFixtures(box)` and cleaned up on `box.dispose()`.
- Post-edit gates (Node `v22.22.1`, Git `2.53.0`, zero Python, no installed service claimed):
  - `npx --no-install vitest run --configLoader runner tests/live-read-side-timing.test.ts tests/live-read-side-oracles.test.ts tests/live-neutrality.test.ts` — 3 files, 31 tests passed (`21` timing, `4` oracles, `6` neutrality).
  - `npx --no-install tsc --noEmit -p .`, `node --check scripts/bench-live.mjs`, `git diff --check`, and `node scripts/check-no-python.mjs` passed.
  - All installed reader/host/service qualification remains `unverified`.
