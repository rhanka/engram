# SPEC_UPSTREAM_TRACEABILITY

## Status

This document is the durable upstream traceability contract for the TypeScript Graphify fork.

- Created: 2026-04-22
- TypeScript baseline: `main` at `660e3836a165f815e3f31c925784ff4db97e7762`
- TypeScript package: `graphifyy@0.4.25`
- Source orientation: `spec/SPEC_UPSTREAM_DUAL_CATCHUP_2026_04.md`
- Review inspiration orientation: `spec/SPEC_CODE_REVIEW_GRAPH_OPPORUNITY.md`

## Purpose

Graphify TypeScript has two upstream references:

- Safi Python Graphify is the product lineage.
- `tirth8205/code-review-graph` is an additive review-workflow reference.

The TypeScript fork must stay generic, npm-first, `.graphify/`-based, and TypeScript-backed. Upstream catch-up must preserve local additions unless a later spec explicitly rejects them.

## Source Locks

| Source | Ref | Remote observed commit | Local tracking commit | Package/version | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| TypeScript Graphify | `main` | `660e3836a165f815e3f31c925784ff4db97e7762` | `660e3836a165f815e3f31c925784ff4db97e7762` | `graphifyy@0.4.25` | `covered` | Current implementation baseline for this traceability pass. |
| Safi Python Graphify | remote `v4` branch | `5843ffc277c54766854f9201286c9647da095390` | `5843ffc277c54766854f9201286c9647da095390` | `0.4.31` line | `needs-review` | Fetched from `https://github.com/safishamsi/graphify` on 2026-04-25. |
| Safi Python Graphify | remote tag `v0.4.23` | `8d908c5d43d079579604a82873fd7cff33a1b343` | local tag is not trusted | `0.4.23` | `covered` | Verified by `git ls-remote`; local `refs/tags/v0.4.23` is clobber-risk and must not be used as proof. |
| Safi Python Graphify | remote tag `v0.4.24` | `2b8c08fcb66c288b22a2dfbadfe457fb8fea7c85` | reachable from `upstream/v4` | `0.4.24` | `needs-review` | Version bump plus later commits in the same release line. |
| Safi Python Graphify | remote tag `v0.4.25` | `cc917a7bc7c9afd67c59823abcfb49cd943844c0` | reachable from `upstream/v4` | `0.4.25` | `needs-review` | Empty-community report fixes and graph-query install rules. |
| Safi Python Graphify | remote tag `v0.4.26` | `7891fa8854367782425f75b12fee7980580473db` | reachable from `upstream/v4` | `0.4.26` | `needs-review` | Wiki encoding/collisions, hook rebase guard, detect path resolve, gitignore docs. |
| Safi Python Graphify | post-`v0.4.27` `upstream/v4` | `5843ffc277c54766854f9201286c9647da095390` | `upstream/v4` | `0.4.28`..`0.4.31` line | `needs-review` | OpenCode config relocation, `check-update`, Java inheritance, aggregated HTML viz, docs/gitignore drift. |
| Safi Python Graphify | remote `v5` branch | `770d7f54c40d7301a0166a6b7782cb03827897e5` | `770d7f54c40d7301a0166a6b7782cb03827897e5` | `0.5.0` | `deferred` | Major-version line; track separately from the current v4 parity branch. |
| code-review-graph | remote tag `v2.3.2` | `db2d2df789c25a101e33477b898c1840fb4c7bc7` | `/tmp/code-review-graph-v2.3.2` at same commit | `2.3.2` | `covered` | Stable CRG implementation reference for review features. |
| code-review-graph | remote `main` | `0919071a9ba353e604981059e99ee2ed98768092` | not fetched into reference clone | unknown | `deferred` | Main is intentionally not the implementation target for the current CRG roadmap. |

## Row States

- `covered`: local TypeScript behavior is implemented and backed by tests or explicit verification.
- `intentional-delta`: local behavior intentionally differs while preserving or improving the user contract.
- `deferred`: valid upstream concept, but not in the active implementation scope.
- `rejected`: intentionally not adopted.
- `needs-review`: upstream moved or behavior is not yet mapped to local implementation/tests.

## Tag Safety Rule

Never trust local tags when `git fetch --tags` or prior fetch notes report clobber risk.

Use primary remote checks instead:

```bash
git ls-remote --heads --tags https://github.com/safishamsi/graphify \
  v4 v5 refs/tags/v0.4.23 refs/tags/v0.4.24 refs/tags/v0.4.25 refs/tags/v0.4.26 refs/tags/v0.4.27 refs/tags/v0.5.0

git ls-remote --heads --tags https://github.com/tirth8205/code-review-graph \
  main refs/tags/v2.3.2
```

If a local tag differs from the remote tag, record the remote commit in this document and avoid using the local tag in parity claims.

## Python v4 Drift Audit

Compared against the previous local Python `v4` baseline `6c8f21272c2343c4c044e3ea8a53459599f2c838`, current `upstream/v4` now includes runtime-relevant changes through `5843ffc` and the `0.4.31` release line.

| Ref | Commit | Upstream change | TypeScript status | Required follow-up |
| --- | --- | --- | --- | --- |
| `v0.4.24` | `2b8c08fcb66c288b22a2dfbadfe457fb8fea7c85` | Version bump to `0.4.24` after earlier fixes. | `needs-review` | Do not version-bump TS solely for this; map behavior rows below first. |
| post-`v0.4.24` | `6b3f8a4`, `fbac7e2`, `bba301b`, `bf58d85`, `d34b329` | Cache hashing, hook handling, watch output, sensitive directory false positives, semantic cache directory handling, label crash guards, packaging/interpreter docs. | `needs-review` | Audit against TS cache, hook, watch, security, and packaging tests. |
| docs/translations | `53d516f`..`5a0c167` | Multilingual README expansion and move to `docs/translations/`. | `deferred` | Separate docs lot only; do not mix into runtime parity. |
| `v0.4.25` | `cc917a7bc7c9afd67c59823abcfb49cd943844c0` | Empty-community report fixes; graph-query CLI rules in install sections. | `covered` | Covered by `tests/report.test.ts`; graph query/path/explain guidance already ships in installed docs. |
| `v0.4.26` | `f8fd8f8479240337a449030a632cc76c20203844` | Wiki encoding/collisions, hook rebase guard, detect path resolve, README gitignore docs. | `covered` | Hook guard has explicit regression coverage; wiki collision coverage already exists; detect resolves root up front; README/gitignore updated here. |
| post-`v0.4.27` | `86d6d93`, `52ad45b`, `4bc2052`, `e4bdcc2`, `64f38ac`, `e915a87`, `b326aa8`, `5843ffc` | OpenCode config relocation, `check-update`, Java inheritance, docs/gitignore drift, aggregated HTML viz, Windows Python docs. | `partial` | `.opencode/opencode.json`, `check-update`, Java inheritance, and benchmark-script ignores are now covered; aggregated HTML viz and Python-specific Windows/doc polish remain open or `n/a`. |
| `v0.4.27` core structural diff | `d9b2928da151e690ac299bdfef1c78d3d9e32815` | Deterministic large-graph `GRAPH_REPORT`, stable edge node IDs, corrected common-root inference. | `needs-review` | Requires a dedicated structural lot; not closed in this branch. |

## Intentional TypeScript Deltas To Preserve

- `.graphify/` canonical state root and `graphify-out/` migration support.
- npm package and TypeScript CLI/skill runtime.
- Graphology/Louvain runtime instead of Python NetworkX/Leiden defaults.
- TypeScript `faster-whisper-ts` audio/video transcription instead of Python faster-whisper.
- PDF preflight and optional `mistral-ocr`.
- Branch/worktree lifecycle metadata.
- Multi-assistant installer surface and Codex `$graphify` guidance.
- `summary`, `review-delta`, `review-analysis`, `review-eval`, `recommend-commits`.
- Ontology/dataprep profile work as a generic opt-in TypeScript product delta.
- CRG-inspired review roadmap without adopting SQLite as default storage.

## Implementation Rules

- Every upstream catch-up commit must cite the source ref in `UPSTREAM_GAP.md` or the feature spec.
- Rows may move from `needs-review` to `covered` only after a test, explicit verification command, or documented intentional delta.
- README changes are required only when upstream changed user-facing behavior that Graphify exposes.
- Generated docs/translations/logos may be handled separately from runtime parity.
- CRG `main` must not replace CRG `v2.3.2` as the review implementation baseline without a new spec update.
