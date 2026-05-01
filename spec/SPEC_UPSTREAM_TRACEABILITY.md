# SPEC_UPSTREAM_TRACEABILITY

## Status

This document is the durable upstream traceability contract for the TypeScript Graphify fork.

- Created: 2026-04-22
- TypeScript baseline: `main` at `107854a5ad3538462d7985b5bb00bc472bafe34a`
- TypeScript package: `graphifyy@0.4.33`
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
| TypeScript Graphify | `main` | `107854a5ad3538462d7985b5bb00bc472bafe34a` | `107854a5ad3538462d7985b5bb00bc472bafe34a` | `graphifyy@0.4.33` | `covered` | Current implementation baseline for this traceability pass. |
| Safi Python Graphify | remote `v4` branch | `5843ffc277c54766854f9201286c9647da095390` | `5843ffc277c54766854f9201286c9647da095390` | `0.4.31` line | `covered` / `deferred` / `n/a` | Current runtime drift is covered in this branch; translation relocation is deferred and Python packaging/interpreter notes are `n/a` for the TypeScript runtime. |
| Safi Python Graphify | remote tag `v0.4.23` | `8d908c5d43d079579604a82873fd7cff33a1b343` | local tag is not trusted | `0.4.23` | `covered` | Verified by `git ls-remote`; local `refs/tags/v0.4.23` is clobber-risk and must not be used as proof. |
| Safi Python Graphify | remote tag `v0.4.24` | `2b8c08fcb66c288b22a2dfbadfe457fb8fea7c85` | reachable from `upstream/v4` | `0.4.24` | `covered` / `n/a` | Release-line runtime fixes are covered locally; Python packaging/interpreter notes are `n/a` for the TypeScript runtime. |
| Safi Python Graphify | remote tag `v0.4.25` | `cc917a7bc7c9afd67c59823abcfb49cd943844c0` | reachable from `upstream/v4` | `0.4.25` | `covered` | Empty-community report fixes and graph-query install guidance are covered. |
| Safi Python Graphify | remote tag `v0.4.26` | `7891fa8854367782425f75b12fee7980580473db` | reachable from `upstream/v4` | `0.4.26` | `covered` | Wiki encoding/collisions, hook rebase guard, detect path resolve, and gitignore docs are covered. |
| Safi Python Graphify | post-`v0.4.27` `upstream/v4` | `5843ffc277c54766854f9201286c9647da095390` | `upstream/v4` | `0.4.28`..`0.4.31` line | `covered` / `n/a` | Runtime drift for this line is covered in this branch; only Python-specific packaging/docs polish remains `n/a` for the TypeScript runtime. |
| Safi Python Graphify | remote `v5` branch | `f755aca58f36771923cebcc8f85f2eef6178a105` | `f755aca58f36771923cebcc8f85f2eef6178a105` | `0.5.5` line | `covered` / `intentional-delta` / `n/a` | Runtime-relevant v5.1-v5.5 changes that map to the TS fork are implemented here; Python backend/site/version deltas remain `n/a`, and `graphify update .` remains an intentional TS contract. |
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
| `v0.4.24` | `2b8c08fcb66c288b22a2dfbadfe457fb8fea7c85` | Version bump to `0.4.24` after earlier fixes. | `covered` / `n/a` | Runtime line is now covered; do not version-bump TS solely for the Python release number. |
| post-`v0.4.24` | `6b3f8a4`, `fbac7e2`, `bba301b`, `bf58d85`, `d34b329` | Cache hashing, hook handling, watch output, sensitive directory false positives, semantic cache directory handling, label crash guards, packaging/interpreter docs. | `covered` / `n/a` | Hook handling, relative watch artifacts, sensitive-path filtering, directory-safe cache writes, and null-safe label sanitization are covered by local runtime/tests. Python interpreter and packaging guidance remains `n/a`. |
| docs/translations | `53d516f`..`5a0c167` | Multilingual README expansion and move to `docs/translations/`. | `deferred` | Separate docs lot only; do not mix into runtime parity. |
| `v0.4.25` | `cc917a7bc7c9afd67c59823abcfb49cd943844c0` | Empty-community report fixes; graph-query CLI rules in install sections. | `covered` | Covered by `tests/report.test.ts`; graph query/path/explain guidance already ships in installed docs. |
| `v0.4.26` | `f8fd8f8479240337a449030a632cc76c20203844` | Wiki encoding/collisions, hook rebase guard, detect path resolve, README gitignore docs. | `covered` | Hook guard has explicit regression coverage; wiki collision coverage already exists; detect resolves root up front; README/gitignore updated here. |
| post-`v0.4.27` | `86d6d93`, `52ad45b`, `4bc2052`, `e4bdcc2`, `64f38ac`, `e915a87`, `b326aa8`, `5843ffc` | OpenCode config relocation, `check-update`, Java inheritance, docs/gitignore drift, aggregated HTML viz, Windows Python docs. | `covered` / `n/a` | `.opencode/opencode.json`, `check-update`, Java inheritance, aggregated HTML member counts, canvas-relative exports, and benchmark-script ignores are covered here. Remaining Windows Python packaging/docs polish is `n/a` for the TypeScript runtime. |
| `v0.4.27` core structural diff | `d9b2928da151e690ac299bdfef1c78d3d9e32815` | Deterministic large-graph `GRAPH_REPORT`, stable edge node IDs, corrected common-root inference. | `covered` | Project-relative file-node remap plus stable relative-import targets are now covered by `tests/language-surface.test.ts`, and deterministic large-graph analysis behavior is covered by `tests/analyze.test.ts`. |

## Python v5 Catch-up Audit

Compared against the locked `upstream/v5` branch at `f755aca58f36771923cebcc8f85f2eef6178a105`, the TypeScript fork adopts the workflow-level changes that map cleanly while keeping `.graphify/`, the TypeScript runtime, and npm-first distribution intact.

| Ref | Commit | Upstream change | TypeScript status | Required follow-up |
| --- | --- | --- | --- | --- |
| `v5` repo workflow | `2c49da2` | GitHub repo clone command and URL-driven build flow. | `covered` | Covered by `src/repo-clone.ts`, public CLI wiring, and `tests/repo-clone.test.ts`. |
| `v5` merge/install delta | `2faeed9` | `merge-graphs`, `CLAUDE_CONFIG_DIR` install support, explicit legacy output skip. | `covered` | Covered by `src/merge-graphs.ts`, CLI wiring, `tests/cli-runtime.test.ts`, and `tests/install-preview.test.ts`. Legacy `graphify-out` skipping already existed in `src/detect.ts`. |
| `v5` safer merge/export | `df9b7ec` | `build_merge`, shrink guard before overwrite, label dedup, chunk-suffix prompt hardening. | `covered` / `intentional-delta` | `buildMerge`, conservative dedup, and JSON shrink guard are covered by `tests/build-merge.test.ts` and `tests/export-json.test.ts`. Dedup remains conservative to avoid collapsing distinct same-label entities across files. |
| `v5` version bump | `8bed332`, `a566bfb` | Upstream Python version bumps to `0.5.0` and `0.5.1`. | `n/a` | TS release version stays independent and release-driven. |
| `v5` README badge | `770d7f5`, `a4ad901`, `eceaaad` | Python README badges and release notes. | `n/a` | npm-first TypeScript distribution does not reuse Python download badges or release-note-only churn. |
| `v5.2` Claude hook change | `ee1df22` | Claude Code PreToolUse matcher switches from `Glob|Grep` to `Bash`. | `covered` | Covered by CLI hook install/uninstall behavior, `tests/claude-integration.test.ts`, and README updates. |
| `v5.3` cache split | `7359cda` | AST and semantic caches must not collide during update/rebuild. | `covered` | Covered by `tests/cache.test.ts`, with AST/semantic namespace isolation and legacy AST fallback compatibility. |
| `v5.4` URL hardening | `dd86271` | Revalidate redirects and block private/internal URLs before `yt-dlp`. | `covered` | Covered by `tests/security.test.ts` and `tests/transcribe.test.ts`. |
| `v5.4` portability/runtime polish | `6175e0a`, `4563b04` | Inline `.graphifyignore` comments, symbol ID collisions, JS/TS alias resolution, HTML controls, rationale prompt guidance. | `covered` / `intentional-delta` / `n/a` | `.graphifyignore` comments, symbol ID stability, `tsconfig.paths` alias resolution, and HTML community controls are covered by tests. Prompt-level rationale handling is enforced in installed skills. Python write-sink annotations remain `n/a`. |
| `v5.5` concept + labels + Go/Kimi follow-ups | `5904081`, `59cbad3`, `f9c344b`, `71d1b39`, `c750582`, `44fc32e`, `326c03e`, `28b17d3`, `f755aca` | `concept` file_type, preserve community labels, Go package import handling, optional Kimi/product-site/Python follow-ups, and Python-style remembered scan root. | `covered` / `intentional-delta` / `n/a` | `concept` support and label preservation are covered by tests; Go import handling is already covered; Kimi/product-site/Python packaging follow-ups are `n/a`; `graphify update .` remains the documented TS contract instead of remembered scan-root state. |

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
