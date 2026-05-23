### Track F drift bilan — 2026-05-23 (0.8.16 catchup, cadrage only)

Drumbeat: weekly Track F scan (cf. `spec/SPEC_TRACK_F_UPSTREAM_BILAN.md`). Source: `github.com/safishamsi/graphify`. **Cadrage only — no code in this lot.** Companion artefacts: `UPSTREAM_GAP.md > Active 0.8.16 Drift Intake`, `PLAN.md > Lot F-0816 drift (2026-05-23)`.

#### Source lock

- **Upstream remote**: `https://github.com/safishamsi/graphify`.
- **Upstream `v8` HEAD observed**: `990ac706d823bf92275333433fde4ef4782a9139` (`bump version to 0.8.16`, 2026-05-23 fetch).
- **Previous bilan drift bucket** closed at remote tag `v0.8.13` (commit `4c95d02cbb3901956491e81695f32ae56bd851d6`).
- **New remote tags since previous bilan**: `v0.8.14` (`f4da176851220d0a41105253a9a6688a03dfa873`), `v0.8.16` (`990ac706d823bf92275333433fde4ef4782a9139`). `v0.8.15` was skipped upstream.
- **Local TS baseline**: `main` at `751ddce935ba8baec26fe5225da12a7525da428b` (`Merge pull request #56 from rhanka/feat/track-g-g6-2-rail`, package `graphifyy@0.9.1` per CHANGELOG/`package.json`). G6-3 routing refactor is in-flight on `feat/track-g-g6-3-routing` and not yet merged at this lock.
- **Drift commit range**: `v0.8.13..upstream/v8` = **18 commits** (filtered list reproduced below).
- **Bilan SHA-anchored commits**: 8 PR-bearing landings + 5 fix landings + 3 docs/release-only + 2 omnibus features (`#956`, `e44e6e98`). Same range, two reading angles.

Reproducer:

```bash
git fetch upstream --tags --force
git log v0.8.13..upstream/v8 --oneline
git rev-parse upstream/v8 v0.8.14 v0.8.16
```

#### Drift table (18 rows)

Buckets: `must-port (P)` — Pn priority for next minor/major bump • `must-port (M)` — medium parser/CLI/perf • `opt-in port` — Lot-X scope-limited features • `defer (F-Opt)` — out of cycle • `already-covered` — equivalent TS shipped • `intentional delta` — TS deliberately differs • `release-only` — version bumps, badges, translations.

| # | Upstream SHA | PR | Subject | Files (Python) | Proposed TS target | Bucket | Lot | G overlap | Rationale |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `990ac70` | — | bump version to 0.8.16 | `pyproject.toml`, `CHANGELOG.md` | n/a | release-only | n/a | no | Python release metadata; do not mirror per `MEMORY.md > Cautious semver bumps`. |
| 2 | `b347492` | #931 | feat(install): project-scoped skill installs | `__main__.py` (+411 LOC), `tests/test_install.py` | `src/skill-install.ts`, `src/cli.ts`, `tests/install-preview.test.ts` | must-port (P) | F-0816-P1 | **partial G overlap** — Track G profile-adapter layer reads skill install state via workspace bootstrapper; cross-check `src/workspace/profile-adapters/`. Recommend port in installer, expose discovery hook for workspace later. | Adds `graphify install <platform> --scope project` (writes `.claude/skills/`, `.codex/skills/`, etc.). TS already supports global install per-platform. User-visible install surface change; should ship before next minor. |
| 3 | `3238b32` | #889 | Exit non-zero when all semantic-extraction chunks fail | `__main__.py`, `tests/test_extract_cli.py` | `src/cli.ts` (extract subcommand), `src/direct-llm-extract.ts`, `tests/cli-runtime.test.ts` | must-port (P) | F-0816-P2 | no | CI signal hygiene — silent partial failures are exactly what `0.7.11` retry lot was hardening against. Pairs naturally with the existing `Lot M1` direct-mode retry follow-up still open in `Task M`. |
| 4 | `52d75bd` | #926 | fix: add `.ets` (ArkTS) extension to `CODE_EXTENSIONS` | `detect.py` | `src/detect.ts` (CODE_EXTENSIONS array) | must-port (M) | F-0816-M1 | no | One-line ext add. Trivial, batch with other small parser/detect ports. |
| 5 | `38cebd3` | #982 | docs: Uzbek (uz-UZ) README translation | translations only | n/a | release-only | n/a | no | Translation-only; not parity. Decide separately whether TS README translation strategy mirrors upstream. |
| 6 | `86109e9` | #937 | fix: CJK/Unicode labels silently skipped in `_norm`/`_norm_label` dedup | `build.py`, `dedup.py` | `src/build.ts`, `src/extract.ts > _makeId` (currently strips `[^a-zA-Z0-9]` to `_`) | must-port (P) | F-0816-P2 | no | Same failure mode is present in TS: `_makeId` collapses CJK/Cyrillic identifiers to empty strings. Follow-up to `0.7.14` Unicode-IDs row already in `UPSTREAM_GAP.md > Active 0.7.16` (`must-port`, still not implemented). Bundle with that. |
| 7 | `6efd06c` | — | add YC S26 badge to README | `README.md` | n/a | release-only | n/a | no | Marketing badge. |
| 8 | `ff14ad5` | — | bump version to 0.8.15 | release metadata only | n/a | release-only | n/a | no | Tag never pushed upstream (`v0.8.15` not in `git ls-remote --tags`); commit landed but tag skipped. |
| 9 | `1494874` | — | feat: track JS/TS barrel re-exports as explicit graph edges | `extract.py` (+94 LOC), JS/TS fixtures, `tests/test_extract.py` | `src/extract.ts > _importJs` (and JS/TSX configs), new test in `tests/language-surface.test.ts` | must-port (M) | F-0816-M2 | no | Concrete graph-quality win for JS/TS-heavy repos (Next.js barrel patterns). Adds new `re_exports` edge type — small graph schema delta, additive. |
| 10 | `e44e6e9` | — | feat: add v8 affected and import-resolution support | `__main__.py` (+64), `affected.py` (new +151), `extract.py` (+1279), tests (+688) | new `src/affected.ts`, `src/extract.ts` (large), `src/cli.ts` (new `affected` subcommand), `tests/affected.test.ts` | opt-in port | F-0816-Opt-Affected | no | New `graphify affected` subcommand + cross-language import-resolution depth. Partial overlap with our existing `review-delta` / `affected-flows.ts`. Decision needed: do we adopt the upstream surface name + add deeper import resolution, or extend our review-* surface? Likely the latter — see decision row below. |
| 11 | `b6127aa` | #956 | feat(multigraph): add runtime compatibility probe (**omnibus**) | `extract.py`, `detect.py`, new `affected.py`/`diagnostics.py`/`multigraph_compat.py`/`scip_ingest.py`/`security.py`/`semantic_cleanup.py` (+ 6700 insertions across 37 files) | see below (12a..12g) | mixed — split | see split | partial | This PR is an omnibus. Split into sub-rows. |
| 11a | `b6127aa` sub | #956 | bash extractor hardening (literal filtering, entrypoint nodes, AST-ancestry-aware command detection) | `extract.py` (bash branch) | `src/extract.ts` (bash language config — we don't ship bash extractor yet; this would land with the bash extractor port still open from bilan #1) | must-port (M) | F-0816-M3 | no | Reinforces the still-open F-P3 lot from bilan #1 (Bash + JSON extractors v0.8.1). If we port the bash extractor (currently unported), port this hardening at the same time. |
| 11b | `b6127aa` sub | #956 | env(1) shebang option-form parsing | `detect.py > _shebang_file_type` | `src/detect.ts > shebang handler` (search for `#!/usr/bin/env`) | must-port (M) | F-0816-M1 | no | Audit our shebang code path; trivial extension if not yet covered. |
| 11c | `b6127aa` sub | #956 | OpenCode + Codex semantic-fragment validation (#825) in skill merges | `__main__.py`, skill merge logic | `src/skills/`, `src/skill-install.ts`, install preview tests | must-port (M) | F-0816-M4 | no | Skill install hygiene — fragment-merge correctness. Audit existing TS skill merge surface. |
| 11d | `b6127aa` sub | #956 | SCIP JSON ingester with document-aware relationship resolution | new `scip_ingest.py` (+363) | n/a | defer (F-Opt) | n/a | no | New ingester surface. Pure feature add. No current TS requester. Defer with explicit reopen condition: a user asks for SCIP ingestion. |
| 11e | `b6127aa` sub | #956 | deterministic Python + bash symbol resolution helpers | new `symbol_resolution.py` (+1019 LOC test) | n/a | defer (F-Opt) | n/a | no | Internal Python-line refactor for symbol resolution; TS uses tree-sitter + per-language extractors already. Reopen if symbol-resolution false positives reported. |
| 11f | `b6127aa` sub | #956 | cap graph.json loaders at 512 MiB, sanitize_metadata at export boundaries, pin vis-network CDN with SRI | `security.py`, `export.py`, vis-network HTML | `src/security.ts`, `src/export.ts`, `src/html-export.ts` (HTML viewer) | must-port (P) | F-0816-P3 | **G overlap** — Track G `src/workspace/` shell renders graph and may reuse the same vis-network CDN pin and the same sanitize boundary. G3/G6-1 use vis-network via `graph-panel.ts`. Port the SRI pin + sanitize_metadata at the export boundary; check that the `src/workspace/graph-panel.ts` CDN reference (if any) gets the same pin. | Three security hardening items in one cluster: graph load cap, export sanitize, CDN SRI. All map cleanly. |
| 11g | `b6127aa` sub | #956 | multigraph runtime compatibility probe + diagnostics | new `multigraph_compat.py`, `diagnostics.py` | n/a | intentional delta | n/a | no | TS uses Graphology which is single-graph by contract; the Python-only NetworkX MultiGraph compat surface does not map. Already recorded as `intentional delta` in `0.7.12` row of `UPSTREAM_GAP.md`. |
| 11h | `b6127aa` sub | #956 | semantic_cleanup module (delete-stale nodes after rebuild) | new `semantic_cleanup.py` (+319) | `src/build.ts`, `src/skill-runtime.ts` (finalize/update path) | must-port (M) | F-0816-M5 | no | Pairs with #936 stale-wiki-nodes fix (#15 below). Audit TS update/finalize stale-node pruning; add regression in `tests/cli-runtime.test.ts`. |
| 12 | `020cca2` | #964 | Keep non-English query terms searchable | `serve.py`, `benchmark.py`, tests | `src/serve.ts` (query/search tokenizer), `src/search.ts`, `tests/serve.test.ts` | must-port (P) | F-0816-P2 | no | Same Unicode angle as row 6; bundle. |
| 13 | `406bea4` | #969 | fix swift extension nodes duplicating across files | `extract.py` (Swift branch) | `src/extract.ts > _importSwift` / `_swiftExtraWalk` (line 817+) | must-port (M) | F-0816-M1 | no | Same code path exists in TS (`_SWIFT_CONFIG`). Audit + port. |
| 14 | `06a9b72` | #973 | fix(llm): honor `GRAPHIFY_MAX_OUTPUT_TOKENS` for OpenAI-compatible backends | `llm.py` (one line) | `src/llm-execution.ts > maxOutputTokens` (line 137) | must-port (P) | F-0816-P2 | no | One-line env honoring. TS already plumbs `maxOutputTokens` through `direct-llm-extract.ts` but does not read `GRAPHIFY_MAX_OUTPUT_TOKENS` env. Trivial. |
| 15 | `076e6b7` | #934 | fix cluster-only crash when graphify-out/ absent, add regression test | `__main__.py`, `tests/test_cli_export.py` | `src/cli.ts > cluster-only`, `src/skill-runtime.ts`, tests | must-port (P) | F-0816-P2 | no | TS has `graphify-out/` migration support — same crash surface possible. Audit + regression. |
| 16 | `f4da176` | — | bump version to 0.8.14 | release metadata | n/a | release-only | n/a | no | — |
| 17 | `9e6192a` | #936/#945/#947 | fix stale wiki nodes (#936), gitignore fallback + `--exclude` flag (#945/#947), NAT64 SSRF false-positive | `wiki.py`, `detect.py`, `security.py`, tests | `src/wiki.ts`, `src/detect.ts`, `src/security.ts`, `src/cli.ts` | must-port (P) | F-0816-P4 | **G overlap (wiki only)** — `src/wiki.ts` is shared with Track G workspace (`workspace/display-model.ts > resolveDisplayModel` falls back to wiki sidecars for entity descriptions per `SPEC_TRACK_G_WORKSPACE.md > Description model resolver`). Port the stale-node filter at the wiki/render boundary; this is *strengthening*, not changing, the contract Track G consumes. No conflict expected; verify on G6 workspace tab rebuild. Gitignore + `--exclude` + SSRF parts are pure detect/security and have no G overlap. | Three independent fixes in one upstream commit:<br>• stale-wiki-nodes filter (`#936`) — same NetworkX `DegreeView({})` failure mode does not apply to Graphology, but TS `to_wiki` still iterates `communities[cid]` without verifying nodes still exist post-dedup; audit needed.<br>• gitignore-fallback + `--exclude` flag (`#945`/`#947`) — additive CLI flag, audit `src/detect.ts > loadGraphifyignore` for behavior parity.<br>• NAT64 SSRF false-positive (security.py) — port to `src/security.ts > checkIpForSSRF`. |
| 18 | `6939494` | #834 | add `backup_if_protected` to snapshot graph before overwrite when semantic/curated | `__main__.py`, `export.py`, `watch.py`, `tests/test_export.py` | n/a | already-covered | n/a | no | `backupIfProtected` already shipped in `src/export.ts` (line 54), exported from `src/index.ts:258`, wired into `src/pipeline.ts:215` and `src/watch.ts:282`. Verify the upstream version did not extend the contract beyond what TS already does. |

#### Bucket counts

- **must-port (P/M)**: 11 rows (after #11 split: 11a, 11b, 11c, 11f, 11h count under M3/M1/M4/P3/M5 + roots 2, 3, 6, 9, 12, 13, 14, 15, 17).
  - **P** (priority for next minor): 7 — rows 2, 3, 6, 11f, 12, 14, 15, 17.
  - **M** (medium / scope-limited): 7 — rows 4, 9, 11a, 11b, 11c, 11h, 13.
- **opt-in port**: 1 row — row 10 (affected + import-resolution depth).
- **defer (F-Opt)**: 2 rows — 11d (SCIP), 11e (symbol-resolution helpers).
- **already-covered**: 1 row — row 18 (`backup_if_protected`).
- **intentional delta**: 1 row — 11g (multigraph compat probe).
- **release-only**: 4 rows — 1, 5, 7, 8, 16 (5 actually, including v0.8.15 ghost tag).

#### G overlap analysis (mandated cross-check)

Upstream commits in this drift band that touch wiki/HTML/workspace/studio:

- **Row 17 (wiki.py stale-node filter)** — direct overlap with `src/wiki.ts`. Track G `workspace/display-model.ts` falls back to wiki description sidecars for entity rendering. The fix is *defensive*: filter stale nodes before sorted() iteration. Port should *strengthen* the contract G6 consumes, not weaken it. **Decision**: port into `src/wiki.ts > toWiki`, verify on G6-2 workspace tab via a regenerated `.graphify/wiki/`.
- **Row 11f (vis-network SRI pin + sanitize_metadata at export)** — `src/html-export.ts` and `src/workspace/graph-panel.ts` (G3/G6-1/G6-2) both render via vis-network. The CDN pin lives in HTML export today. **Decision**: port the SRI pin at the export boundary; if G6-3 routing refactor changes the workspace-graph render path, the pin must follow into the new path. **Open item for G6-3 author**: confirm workspace graph still uses the same CDN reference after the refactor or migrates to bundled vis-network.
- **Row 2 (`#931` project-scoped skill installs)** — installer surface only; no direct G overlap. But the workspace bootstrap (`src/workspace/` indirectly relies on the skill install state via `.graphify_version`). Soft overlap.
- **Row 17 gitignore/SSRF parts** — `src/detect.ts` + `src/security.ts`; no G overlap.
- **All other rows** — no G overlap.

**Skip-until-G-stabilises rows**: none. The two real overlaps (rows 11f and 17) are either *strengthening* (17) or *additive on the export boundary* (11f), and neither conflicts with the G6-3 in-flight routing refactor. Both can be ported in parallel with G6-3.

#### F-Opt scope re-evaluation (user directive 2026-05-23: include in this cycle)

History of `F-Opt`:

- Bilan #1 (2026-05-15) defined `F-Opt` as **"v1.x hypergraph + v2.x wiki rewrite, deferred until upstream stabilises"**.
- Deepdive 2026-05-16 (`.graphify/scratch/F-deepdive-hypergraph-status.md`) **invalidated the v1.x premise**: the `v1.0.0` upstream tag is a lightweight tag on a "git commit hook" commit, never about hypergraphs. The hypergraph feature was renamed to **hyperedges** and is alive in `v8` (default branch), bug-fixed monthly. Wiki export (`wiki.py`) is also actively maintained on `v8`, not on a separate "v2 rewrite" branch.
- PR #48 (`Track F-H1: typed hyperedges data layer (cleanup) + UPSTREAM_GAP v2 already-covered`, commit `1135638`) **closed the hyperedges schema portion of F-Opt**: `src/hyperedges.ts` ships the typed data layer, `UPSTREAM_GAP.md` records v2 hypergraph as `already-covered`, and the 0.10.0 schema-delta prediction was explicitly withdrawn (commit `4ba8600`).
- PR #53 (`Track F-Opt: add local PR inspection commands`, merged via `7394930`) **shipped the `graphify pr` surface** (`src/pr.ts` 288 LOC, `tests/pr.test.ts` 162 LOC) covering the high-value pieces of the F-Opt-PR deepdive (`.graphify/scratch/F-deepdive-graphify-prs.md > Path B`). The LLM-triage piece was explicitly out of scope (recorded in the deepdive § 6 "Out of scope") and remains so.

**What remains of the original F-Opt scope after PR #48 and PR #53?**

Two genuine residuals:

1. **Wiki export rewrite** — upstream `wiki.py` evolved in `v0.8.14` (`9e6192a`, row 17) and earlier. The TS `src/wiki.ts` surface is *not* identical to upstream; it has the descriptions sidecar (Track A), ontology entity pages (Task J), and source-grounded entity descriptions (Task K). The "rewrite" framing of the original F-Opt is no longer accurate; what remains is **per-commit drift triage on `src/wiki.ts`**, which fits naturally into the regular F-Pn lots. **Recommendation**: close the "wiki rewrite" F-Opt line as superseded by row 17 (`F-0816-P4`) and the existing Track A / Task K wiki work.
2. **LLM-triage in `graphify pr`** — explicitly deferred by PR #53 / F-Opt-PR deepdive § 6. Multi-backend LLM resolution (anthropic + openai + gemini + ollama + claude-cli + ollama-fallback) is *the* maintenance cost upstream pays. No TS requester. **Recommendation**: stay deferred under a new explicit line `F-Opt-LLM-Triage` with reopen condition "an actual TS user asks for `graphify pr --triage`".

**Concrete `F-Opt-2026Q2` sub-spec line** (one paragraph):

> `F-Opt-2026Q2` covers exactly two residuals after F-H1 (PR #48) and F-Opt-PR (PR #53) closed the bulk: (a) `F-Opt-LLM-Triage` — defer `graphify pr --triage` and the multi-backend resolution surface until a TS user requests it; reopen with a dedicated spec covering the LLM-dep posture (`MEMORY.md > Cautious semver bumps` constraint applies). (b) `F-Opt-Affected` — evaluate row 10 (`e44e6e9` `graphify affected` + import-resolution depth) against our existing `review-delta` / `affected-flows.ts` surface; recommendation is to extend the review-* surface with the deeper import-resolution patches, **not** to ship a new `affected` CLI verb (preserves user muscle memory on the review-* surface and avoids two parallel "which files are impacted" verbs). All other upstream `v8` features in this drift band are classified P/M, already-covered, or intentional-delta — there is no other open F-Opt residual at 0.8.16.

#### Top 5 must-port rows (one line each, P-band)

| # | Row | Title | G overlap | Lot |
|---|---|---|---|---|
| 1 | 17 | stale wiki nodes (#936) + gitignore fallback + `--exclude` flag (#945/#947) + NAT64 SSRF false-positive | wiki only (strengthening) | F-0816-P4 |
| 2 | 11f | security: graph.json 512 MiB cap + sanitize_metadata at export + vis-network SRI pin | partial (vis-network CDN shared) | F-0816-P3 |
| 3 | 6 | CJK/Unicode label dedup (`_norm`/`_norm_label`) + 12 (non-English query terms searchable) | no | F-0816-P2 |
| 4 | 2 | project-scoped skill installs (`graphify install <platform> --scope project`) | partial soft (workspace bootstrap reads install state) | F-0816-P1 |
| 5 | 3 | exit non-zero when all semantic-extraction chunks fail + 14 (`GRAPHIFY_MAX_OUTPUT_TOKENS` env honoring) + 15 (cluster-only crash when `graphify-out/` absent) | no | F-0816-P2 |

#### Open F decisions surfaced by this bilan

1. **F-Opt scope re-evaluation (resolved this bilan, awaits user ack)** — close "wiki rewrite" residual as superseded; keep `F-Opt-LLM-Triage` deferred; route row 10 into `F-Opt-Affected` as a review-* surface extension rather than a new `affected` verb. Owner ack needed before `PLAN.md > Open F decisions` is updated.
2. **F-0816-Opt-Affected — adopt upstream `graphify affected` verb or extend `review-delta`?** — see row 10. Recommendation: extend `review-delta` + `affected-flows.ts` with the deeper import-resolution. Reject the new verb. Owner decision needed.
3. **F-0816 lot ordering — P4 (wiki/security) before P3 (security hardening)?** — both touch security boundaries. Recommendation: ship P3 first (smaller, three-line CDN pin + cap + sanitize), then P4 (which depends on P3's sanitize_metadata helper). Owner ack on ordering.
4. **`v0.8.15` ghost tag — record explicitly or ignore?** — upstream skipped `v0.8.15` (no remote tag, only commit `ff14ad5`). Recommend: record in `UPSTREAM_GAP.md > Source Lock Notes` as "skipped upstream" to avoid future bilan confusion. Owner ack.

#### Next bilan scheduled

**2026-05-30** (weekly cadence). Pre-release bilan also required before any minor/major bump per `SPEC_TRACK_F_UPSTREAM_BILAN.md > Cadence`. Watch list for next pass: any new `v0.8.17`+ or `v0.9.x` tag; first sign of `v9` branch; G6-3 routing landing (may unlock a cleaner port path for row 11f vis-network CDN pin); upstream `wiki.py` further drift (row 17 ripples).
