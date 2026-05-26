### Track F drift bilan — 2026-05-25 (0.8.18 catchup, cadrage only)

Drumbeat: weekly Track F scan (cf. `spec/SPEC_TRACK_F_UPSTREAM_BILAN.md`). Source: `github.com/safishamsi/graphify`. **Cadrage only — no code in this lot.** Companion artefacts: `UPSTREAM_GAP.md > Active 0.8.18 Drift Intake`, `PLAN.md > Lot F-0818 drift (2026-05-25)`.

#### Source lock

- **Upstream remote**: `https://github.com/safishamsi/graphify`.
- **Upstream `v8` HEAD observed**: `3efae38` (`Rate-limit backup_if_protected to one folder per day via content hash`, 2026-05-25 fetch) — one commit past tag `v0.8.18`.
- **Previous bilan drift bucket** closed at remote tag `v0.8.16` (commit `990ac706d823bf92275333433fde4ef4782a9139`), released in the TS line as `graphifyy@0.9.7`.
- **New remote tags since previous bilan**: `v0.8.17` (`73c3c33ac7a5ab597ba763b88ab8ec8c511796cb`), `v0.8.18` (`98100f3b35c9569aace7233737d4b7f2c9233fbd`).
- **`v1.0.0` non-target**: tag `v1.0.0` (`0a31c0862b600d0755b0b8da41d6cdf99df135df`, `add git commit hook - auto-rebuilds graph after every commit`) is **NOT an ancestor of `upstream/v8`** — it is a lightweight tag on a divergent commit, not a v8-line release. It stays a non-target (confirms bilan #1/#2). The auto-rebuild-after-commit feature it carries is already-covered by our `graphify hook-rebuild` / git-hook install.
- **Local TS baseline**: `main` at `7d5b333` (`Merge pull request #72`, package `graphifyy@0.9.7` per CHANGELOG/`package.json`).
- **Drift commit range**: `990ac70..upstream/v8` = **12 commits** (filtered list reproduced below).

Reproducer:

```bash
git fetch upstream --tags --force
git log v0.8.16..upstream/v8 --oneline
git rev-parse upstream/v8 v0.8.17 v0.8.18 v1.0.0
git merge-base --is-ancestor v1.0.0^{commit} upstream/v8 || echo "v1.0.0 divergent -> non-target"
```

Grounding checks run against `main` at intake: `backupIfProtected` already exists (`src/export.ts`, wired `src/watch.ts:299`); Java `extends`→`inherits` already canonicalized (`src/extract.ts:1541+`); partial cross-language structural suppression exists (`src/analyze.ts:116 shouldSuppressCrossLanguageStructuralBonuses`); **no** query-expansion, semantic-contexts, or watch shrink-guard exist yet.

#### Drift table (12 rows)

Buckets: `must-port (P)` — Pn priority for next patch/minor bump • `must-port (M)` — medium parser/CLI/perf • `opt-in / feature` — scope-limited, decision-gated • `defer (F-Opt)` — out of cycle • `already-covered` — equivalent TS shipped • `intentional delta` — TS deliberately differs • `n-a` — Python-runtime specific, no TS analogue • `release-only` — version bumps, badges, translations.

| # | Upstream SHA | Issue | Subject | Proposed TS target | Bucket | Lot | G overlap | Rationale |
|---|---|---|---|---|---|---|---|---|
| 1 | `461e346` | — | Windows cp1252 crash, `str.parent` crash, MCP error message, god_nodes relative import | `src/serve.ts` (MCP error wording) only | `n-a` / `already-covered` | — | no | cp1252 + `str.parent` are Python-runtime specific (TS reads UTF-8, no `str.parent`). Only the MCP error-message wording + god-node import angle merit a glance; no parity gap. |
| 2 | `71b4e57` | — | Husky 9 hook path, `skill.md` `INPUT_PATH` literal, per-worker exception isolation | `src/hooks.ts`, `src/skills/*`, `src/llm-execution.ts`, `tests/hooks.test.ts` | `must-port (M)` | F-0818-M1 | no | Husky-9 hook-path fix (our hook install), `INPUT_PATH` literal in skill templates, and per-worker exception isolation in semantic-extraction concurrency are all live TS surfaces. |
| 3 | `4dce16f` | #993, #991 | Fix case-sensitive call resolution and cross-language phantom calls | `src/extract.ts`, `src/analyze.ts`, `tests/extract-call-confidence.test.ts` | `must-port (P)` | F-0818-P1 | no | We suppress some cross-lang structural bonuses (`analyze.ts:116`) but have no case-sensitive call resolution guard. Graph-correctness P-row: eliminates phantom call edges from case-insensitive name collisions. |
| 4 | `73c3c33` | — | Bump version to 0.8.17 | n/a | `release-only` | — | no | Python release metadata; do not mirror per `MEMORY.md > Cautious semver bumps`. |
| 5 | `6fba4e4` | #1000 | fix(watch): bypass shrink-guard when caller declared explicit deletions | `src/watch.ts` (verify only) | `needs-audit` → likely `n-a` / `intentional-delta` | — | no | We have no shrink-guard in `src/watch.ts`. Verify our `.rebuild.lock` + deletion-aware update path is equivalent before deciding port vs `n-a`. Do not port a guard we never shipped. |
| 6 | `d778e2c` | #1001 | fix(cli): reconstruct communities from per-node attribute when sidecar missing | `src/community-labels.ts`, cluster load, `tests/community-labels.test.ts` | `must-port (M)` | F-0818-M2 | no | Robustness: when the community-label sidecar is absent, reconstruct communities from per-node attributes instead of dropping them. Pairs with our label-persistence lineage. |
| 7 | `32effb1` | #995 | docs: update Ukrainian README translation to v8 | n/a | `intentional-delta` / `release-only` | — | no | The TS fork does not carry a Ukrainian README; translation strategy is a separate decision. |
| 8 | `ab4e542` | #996 | feat: add cross-language semantic contexts for Python, JS/TS, C#, and Java | new module + `src/extract.ts` (large) | `feature — scope decision` | F-0818-Opt | no | New capability with no TS counterpart. Size unknown until a mini-spec is written. **Default `defer`**; reopen as `must-port` only after owner ack on scope. A `0.10.0` minor would be the release vehicle if accepted. |
| 9 | `238702b` | #998 | Constrained query expansion | `src/serve.ts`, `src/search.ts`, `tests/serve.test.ts` | `must-port (M)` | F-0818-M3 | no | No query expansion exists today. Port the constrained-expansion ranking (bounded synonym/morphological expansion) for query precision. |
| 10 | `a4a615d` | — | Ukrainian README typo + Unicode vocab regex + Java `extends`→`inherits` migration note | `src/search.ts` (Unicode vocab regex) | split | F-0818-M3 (regex) | no | Unicode vocab regex → `must-port (M)` (pairs with #9, extends the 0.8.16 Unicode lineage). Java `inherits` → `already-covered` (`extract.ts:1541+` already emits `inherits`). README typo → `release-only`. |
| 11 | `98100f3` | — | Bump version to 0.8.18 | n/a | `release-only` | — | no | Python release metadata; do not mirror. |
| 12 | `3efae38` | — | Rate-limit `backup_if_protected` to one folder per day via content hash | `src/export.ts > backupIfProtected`, `tests` | `must-port (M)` | F-0818-M2 | no | Enhancement to an existing TS surface (`backupIfProtected`, wired `watch.ts:299`). Add the daily content-hash rate-limit so repeated rebuilds don't spam backup folders. |

#### Bucket counts

`must-port (P)` = 1 (#3) • `must-port (M)` = 4 (#2, #6, #9 + #10-regex, #12) • `feature / scope-decision` = 1 (#8) • `needs-audit` = 1 (#5) • `already-covered` = 2 (#1, #10-Java) • `intentional-delta` = 1 (#7) • `release-only` = 3 (#4, #11, README bits).

#### Top must-port rows (one line each)

| # | Row | Title | Band | Lot |
|---|---|---|---|---|
| 1 | 3 | case-sensitive call resolution + cross-language phantom calls (#993/#991) | P | F-0818-P1 |
| 2 | 2 | Husky 9 hook path + skill `INPUT_PATH` literal + per-worker isolation | M | F-0818-M1 |
| 3 | 6 + 12 | community reconstruction fallback (#1001) + backup daily rate-limit | M | F-0818-M2 |
| 4 | 9 + 10-regex | constrained query expansion (#998) + Unicode vocab regex | M | F-0818-M3 |

#### Open F decisions surfaced by this bilan

1. **F-0818-Opt (`#996` cross-language semantic contexts) — port or defer?** Recommendation: **`defer`** pending a sizing mini-spec; the feature has no TS counterpart and unknown LOC. Reopen as `must-port` only after owner ack on scope. Release vehicle if accepted: minor `0.10.0`.
2. **Watch shrink-guard (`6fba4e4`/#1000) — `n-a` or port?** We never shipped a shrink-guard. Recommendation: audit the `.rebuild.lock` + deletion-aware update path; if equivalent, classify `n-a`; do not introduce a guard just to port its bypass. Owner ack on the `n-a` classification after the audit.
3. **Version target after P1 + M1/M2/M3.** Recommendation: patch `graphifyy@0.9.8` advancing the closest audited parity point to `v0.8.18`. **Do not** jump to `1.0.0` (upstream `v1.0.0` is a divergent lightweight git-hook tag, not a v8-line major). Forbidden by `SPEC_TRACK_F_UPSTREAM_BILAN.md > Version Alignment Policy` to mirror the bump mechanically.

#### Next bilan scheduled

**2026-06-01** (weekly cadence). Pre-release bilan also required before any minor/major bump per `SPEC_TRACK_F_UPSTREAM_BILAN.md > Cadence`. Watch list for next pass: any new `v0.8.19`+ or first `v0.9.x` upstream tag; whether `v1.0.0` gains a real v9-line successor (currently divergent); movement on `#996` semantic-contexts (would reshape the F-0818-Opt decision).
