# SPEC_UPSTREAM_TRACEABILITY

## Status

This document is the durable upstream traceability contract for the TypeScript Graphify fork.

- Created: 2026-04-22
- TypeScript baseline: `main` at `1f30efa7afaf5c98f06fcaebbb727fd4f2fb3f8a`
- TypeScript package: `graphifyy@0.5.6`
- Source orientation: `spec/SPEC_UPSTREAM_DUAL_CATCHUP_2026_04.md`
- Review inspiration orientation: `spec/SPEC_CODE_REVIEW_GRAPH_OPPORUNITY.md`

## Purpose

Graphify TypeScript has two upstream references:

- Safi Python Graphify is the product lineage.
- `tirth8205/code-review-graph` is an additive review-workflow reference.

The TypeScript fork must stay generic, npm-first, `.graphify/`-based, and TypeScript-backed. Upstream catch-up must preserve local additions unless a later spec explicitly rejects them.

## Versioning Rule

- Python Graphify is the only upstream that may drive npm parity version numbers.
- `code-review-graph` is an additive feature source and must never determine the published npm version.
- Local patch releases between parity milestones are allowed, but the next parity target must be named after the upstream Python Graphify line it actually covers.
- Upstream Python `v1.0.0` must remain `deferred` until a dedicated traceability pass confirms that the active release train has moved beyond `v6` / `0.7.x`.
- The `0.7.4` catch-up must stay TypeScript-only; do not introduce new Python runtime dependencies to claim parity.

## Source Locks

| Source | Ref | Remote observed commit | Local tracking commit | Package/version | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| TypeScript Graphify | `main` | `1f30efa7afaf5c98f06fcaebbb727fd4f2fb3f8a` | `1f30efa7afaf5c98f06fcaebbb727fd4f2fb3f8a` | `graphifyy@0.5.6` | `covered` | Current implementation baseline for this traceability pass. |
| Safi Python Graphify | remote `v4` branch | `5843ffc277c54766854f9201286c9647da095390` | `5843ffc277c54766854f9201286c9647da095390` | `0.4.31` line | `covered` / `deferred` / `n/a` | Current runtime drift is covered in this branch; translation relocation is deferred and Python packaging/interpreter notes are `n/a` for the TypeScript runtime. |
| Safi Python Graphify | remote tag `v0.4.23` | `8d908c5d43d079579604a82873fd7cff33a1b343` | local tag is not trusted | `0.4.23` | `covered` | Verified by `git ls-remote`; local `refs/tags/v0.4.23` is clobber-risk and must not be used as proof. |
| Safi Python Graphify | remote tag `v0.4.24` | `2b8c08fcb66c288b22a2dfbadfe457fb8fea7c85` | reachable from `upstream/v4` | `0.4.24` | `covered` / `n/a` | Release-line runtime fixes are covered locally; Python packaging/interpreter notes are `n/a` for the TypeScript runtime. |
| Safi Python Graphify | remote tag `v0.4.25` | `cc917a7bc7c9afd67c59823abcfb49cd943844c0` | reachable from `upstream/v4` | `0.4.25` | `covered` | Empty-community report fixes and graph-query install guidance are covered. |
| Safi Python Graphify | remote tag `v0.4.26` | `7891fa8854367782425f75b12fee7980580473db` | reachable from `upstream/v4` | `0.4.26` | `covered` | Wiki encoding/collisions, hook rebase guard, detect path resolve, and gitignore docs are covered. |
| Safi Python Graphify | post-`v0.4.27` `upstream/v4` | `5843ffc277c54766854f9201286c9647da095390` | `upstream/v4` | `0.4.28`..`0.4.31` line | `covered` / `n/a` | Runtime drift for this line is covered in this branch; only Python-specific packaging/docs polish remains `n/a` for the TypeScript runtime. |
| Safi Python Graphify | remote `v5` branch | `f755aca58f36771923cebcc8f85f2eef6178a105` | `f755aca58f36771923cebcc8f85f2eef6178a105` | `0.5.5` line | `covered` / `intentional-delta` / `n/a` | Closed parity line. Runtime-relevant v5.1-v5.5 changes that map to the TS fork are implemented; Python backend/site/version deltas remain `n/a`, and `graphify update .` remains an intentional TS contract. |
| Safi Python Graphify | remote `v6` branch | `f81e3bc2154d21062f56f9e4ec9f923dfe7d128e` | not yet fetched into a local parity branch | `0.6.0`..`0.7.4` line | `needs-review` | Active source lock for the next parity cycle. |
| Safi Python Graphify | remote tag `v0.7.4` | `f81e3bc2154d21062f56f9e4ec9f923dfe7d128e` | local tag not yet trusted as proof | `0.7.4` | `needs-review` | Active parity target for the next TypeScript catch-up. |
| Safi Python Graphify | remote tag `v1.0.0` | `0a31c0862b600d0755b0b8da41d6cdf99df135df` | not tracked locally | `1.0.0` | `deferred` | Exists upstream, but not the active parity target while releases are still landing on `v6` / `0.7.x`. |
| code-review-graph | remote tag `v2.3.2` | `db2d2df789c25a101e33477b898c1840fb4c7bc7` | `/tmp/code-review-graph-v2.3.2` at same commit | `2.3.2` | `covered` | Stable CRG implementation reference for review features. |
| code-review-graph | remote `main` | `0919071a9ba353e604981059e99ee2ed98768092` | not fetched into reference clone | unknown | `deferred` | `main` is 96 commits ahead of `v2.3.2` and remains exploratory only for the `0.7.4` parity cycle. |

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
  v4 v5 v6 refs/tags/v0.4.23 refs/tags/v0.4.24 refs/tags/v0.4.25 refs/tags/v0.4.26 refs/tags/v0.4.27 refs/tags/v0.5.5 refs/tags/v0.7.4 refs/tags/v1.0.0

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

## Closed Python v5 Catch-up Audit

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

## Active Python `v6` / `0.6.x`-`0.7.x` Catch-up Audit

Compared against the active `upstream/v6` source lock at `f81e3bc2154d21062f56f9e4ec9f923dfe7d128e`, the TypeScript fork must now audit the `0.6.x` and `0.7.x` lines conservatively. Do not infer parity from similarity alone; every row needs a test, an explicit verification command, or an intentional-delta rationale.

| Ref | Commit | Upstream change | TypeScript status | Required follow-up |
| --- | --- | --- | --- | --- |
| `v0.6.0` | `17fb524` | SQL AST extraction, YAML indexing, roll-up fixes from the `0.5.6` / `0.5.7` line. | `covered` / `deferred` | Functional lot: structured inputs, query precision, and inventory semantics. YAML indexing is covered by `tests/detect.test.ts`, and `.sql` files now enter the code surface. SQL AST extraction is explicitly deferred because the current TS parser stack has no SQL grammar or SQL extractor (`src/extract.ts`, package audit via `rg "tree-sitter-sql|sql"`), and this parity pass must not add a Python fallback. |
| `v0.6.1` | `2dc759a` | Exact gitignore semantics, anchored parent-relative patterns, hermetic non-VCS scan boundaries. | `covered` | Functional lot: structured inputs, query precision, and inventory semantics. Covered by `tests/detect.test.ts` for full-line comment parsing, ancestor rule discovery inside a repo, anchored `/...` patterns relative to the owning `.graphifyignore`, and hermetic non-VCS scans that do not leak parent rules. |
| `v0.6.2` | `be83a8c` | Exact-match query ordering, content-hash-aware `update`, R support, shebang-based shell detection, Kimi/license cleanup. | `covered` / `n/a` | Functional lot: structured inputs, query precision, and inventory semantics. Covered by `tests/search.test.ts`, `tests/cli.test.ts`, and `tests/detect.test.ts` for exact-match query scoring, `.r` support, extensionless shebang-script detection, manifest `{mtime, hash}` writes, mtime-only incremental touches, and legacy-manifest-safe change detection. |
| `v0.6.3` | `a4149df` | Preserve semantic nodes on incremental rebuild, detached hooks, common-name suppression, `cluster-only` crash guard. | `covered` | Functional lot: incremental rebuild reliability, hooks, and platform surface. Code-only rebuilds now preserve existing semantic nodes and their surviving edges, covered by `tests/cli-runtime.test.ts` (`preserves existing semantic nodes during code-only update rebuilds`). Detached git hooks are covered by `tests/hooks.test.ts` (`installs all lifecycle hooks`) and now launch rebuilds via `nohup`/`disown` with `.cache/graphify-rebuild.log`. Oversized `cluster-only` runs are covered by `tests/cli-runtime.test.ts` (`supports cluster-only on oversized graphs by skipping HTML export`). Ambiguous short-name call targets are now suppressed by resolvable-label indexing, covered by `tests/extract-call-confidence.test.ts` (`skips ambiguous call targets when multiple symbols share the same name`). |
| `v0.6.4` | `a61b25c` | Cross-platform Codex hook check on Windows. | `covered` | Functional lot: incremental rebuild reliability, hooks, and platform surface. Covered by `tests/codex-integration.test.ts` (`writes the corrected Codex hook JSON contract`) and `tests/cli-runtime.test.ts` (`supports a silent hook-check command for Codex PreToolUse hooks`). The hook now delegates to `graphify hook-check`, avoiding bash-only `[ -f ]` logic and inline JSON escaping. |
| `v0.6.5` | `d40e1c0` | Codex Windows hook, Kotlin call edges, `update --force`, community checkbox UI. | `covered` / `deferred` | Functional lot: incremental rebuild reliability, hooks, and platform surface. `update --force` is covered by `tests/export-json.test.ts` and `tests/cli-runtime.test.ts`, the Codex hook portability portion is covered by the same `hook-check` tests used for `v0.6.4`, and the checkbox-based community selector is covered by `tests/html-export.test.ts` (`renders aggregated community member counts when provided`). Kotlin call-edge parity is deferred: the current TS runtime uses `web-tree-sitter` + WASM grammars, and current rebuild verification still reports `sample.kt` as unavailable because no wasm-compatible Kotlin grammar is loading in this environment. Closing that gap requires a dedicated grammar supply strategy rather than a small parity patch. |
| `v0.6.6` | `517f3c8` | Pi-agent installer support, stale wiki clearing, Windows-safe wiki filenames. | `covered` / `deferred` | Functional lot: incremental rebuild reliability, hooks, and platform surface. Wiki regeneration hygiene is covered by `tests/wiki.test.ts` (`clears stale wiki articles before regenerating`) and `tests/wiki.test.ts` (`strips Windows-reserved characters and caps wiki filenames`). Pi-agent install support is deferred: it expands the assistant/platform matrix without changing the graph/runtime contract, and there is no current TS product requirement to add or maintain another installer surface in this parity cycle. |
| `v0.6.7` | `e484282` | `graphify tree`, token-aware chunking, MCP context filters, dynamic `import()`, safe semantic-cache file checks. | `covered` / `intentional-delta` | Functional lot: visualization, ignore semantics, and portable output routing. `graphify tree` is covered by `tests/cli-runtime.test.ts` (`supports tree for compact graph traversal output`), local JS/TS `import()` extraction is covered by `tests/language-surface.test.ts` (`resolves local dynamic imports as imports_from edges`), and directory-safe semantic-cache writes are covered by `tests/cache.test.ts` (`skips directory source_file entries when saving semantic cache`) plus the `fileHash requires a file` guard in `src/cache.ts`. Token-aware chunking is an intentional TypeScript delta documented by `tests/skills.test.ts` (`documents deterministic semantic chunk sizing and directory grouping`): this fork uses deterministic 20-25 file batches/chunks with image isolation and same-directory grouping instead of provider-specific token heuristics. MCP context filters are an intentional delta documented by `tests/skills.test.ts` (`documents the MCP graph tool surface for live graph queries`) and `tests/skills.test.ts` (`documents minimal-context as the first CRG-style review call`): the TypeScript product exposes graph query tools plus compact `summary` / `minimal-context` / `review-context` entrypoints instead of upstream-specific context-filter toggles. |
| `v0.6.8` | `d753413` | `.graphifyignore` negation patterns, Antigravity frontmatter, Gemini/Codex hook fixes, thin-community omission. | `covered` / `intentional-delta` | Functional lot: visualization, ignore semantics, and portable output routing. `.graphifyignore` negation semantics are covered by `tests/detect.test.ts` (`supports .graphifyignore negation patterns`), Antigravity workflow/rule frontmatter is covered by `tests/platform-v4-integration.test.ts` (`installs Google Antigravity rules, workflow, and global skill`), and thin-community omission is already covered by `tests/report.test.ts` (`does not list empty communities in the report`). Codex hook portability was closed earlier via `graphify hook-check`; Gemini remains an intentional delta because this TypeScript product uses the `/graphify` command plus MCP/project config instead of a PreToolUse hook on that platform. |
| `v0.6.9` | `f81e3bc` | Slash-normalized `source_file`, cohesion re-splitting, VS Code Copilot instruction contract, `GRAPHIFY_OUT`, Antigravity reinstall. | `covered` / `intentional-delta` | Functional lot: visualization, ignore semantics, and portable output routing. Slash-normalized `source_file` handling is covered at both ingestion and export time by `tests/build.test.ts` (`normalizes Windows-style source_file separators during graph ingestion`) and `tests/portable-artifacts.test.ts` (`normalizes relative Windows-style source_file separators`). Two-phase low-cohesion community re-splitting is covered by `tests/cluster.test.ts` (`re-splits low-cohesion large communities on a second pass`). The VS Code Copilot instruction contract is covered by `tests/platform-v4-integration.test.ts` (`installs VS Code Copilot Chat instructions and global Copilot skill`) plus `tests/copilot-integration.test.ts`, and Antigravity reinstall idempotency is covered by `tests/platform-v4-integration.test.ts` (`reinstalls Google Antigravity without duplicating frontmatter`). `GRAPHIFY_OUT` remains an intentional delta: this TypeScript fork keeps `.graphify/` as the canonical default state root and exposes state-directory override only through explicit API/path options, not a global environment variable contract. |
| `v0.7.0` | release-tag anomaly | Merge driver for `graph.json`, deterministic community IDs, content-only cache hashing, freshness signal, mixed code/doc change handling. | `needs-review` | Functional lot: multi-developer graph lifecycle. The fetched local tags `v0.7.0` through `v0.7.4` all resolve to `f81e3bc`, but the effective `0.7.x` code train continues on `upstream/v7`. Keep this row open until the `v7` commit history is fully mapped onto the `0.7.0` scope. |
| `v0.7.1` | release-tag anomaly | Obsidian tag sanitization, extended `tsconfig` alias resolution, Svelte template dynamic imports, recursion safety. | `partial` | Functional lot: parser robustness, export surface, and headless extraction. The fetched `0.7.x` tags are not reliable source pointers after `0.6.9`, so this row is traced against the effective `upstream/v7` continuation instead. Extended `tsconfig` alias resolution and Svelte dynamic-import coverage now exist via `tests/language-surface.test.ts` (`parses JSONC tsconfig aliases with comments and trailing commas`) and `tests/language-surface.test.ts` (`resolves aliased Svelte dynamic imports via tsconfig paths`). Obsidian tag sanitization and deep-AST recursion safety remain open. |
| `v0.7.2` | `b6ffdbb` | Fortran support, export CLI subcommands, skill-size reduction, large-graph aggregation. | `covered` / `deferred` / `intentional-delta` | Functional lot: parser robustness, export surface, and headless extraction. Public `graphify export {html,wiki,obsidian,svg,graphml,neo4j}` parity is covered by `tests/cli-runtime.test.ts` (`supports export html and --no-viz cleanup`), `tests/cli-runtime.test.ts` (`supports export wiki and obsidian vault generation`), and `tests/cli-runtime.test.ts` (`supports export svg, graphml, and neo4j cypher`). Query/path/explain parity was already covered by the existing CLI/runtime tests. Fortran support is deferred because this catch-up must stay TypeScript-only and a proper Fortran parser strategy needs separate Node/WASM work. Large-graph HTML auto-aggregation is an intentional delta: the TypeScript line keeps explicit `safeToHtml` / `--no-viz` semantics and `cluster-only` fallback instead of silently producing aggregated HTML. Skill-size reduction is `n/a` for parity because it does not change the runtime contract. |
| `v0.7.3` | `d40e274` | `graphify extract` headless semantic extraction for CI, backend selection, `--no-cluster`, `--out`. | `needs-review` / `intentional-delta` | Functional lot: parser robustness, export surface, and headless extraction. Compare the upstream headless extraction flow with the current TypeScript assistant/runtime contract before deciding parity or a documented delta, without adding Python dependencies. |
| `v0.7.4` | `741ac36` + `26a5a35` | JSONC `tsconfig` parsing and aliased Svelte dynamic-import fixes. | `covered` | Functional lot: parser robustness, export surface, and headless extraction. Covered by `tests/language-surface.test.ts` (`parses JSONC tsconfig aliases with comments and trailing commas`) and `tests/language-surface.test.ts` (`resolves aliased Svelte dynamic imports via tsconfig paths`). The TypeScript parser now strips JSONC comments/trailing commas in `loadTsconfigAliases()` and resolves Svelte `import()` specifiers through the same alias logic used for JS/TS. |

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
- Do not publish `graphifyy@0.7.4` until the active `v6` / `0.7.x` rows are closed in both this spec and `UPSTREAM_GAP.md`.
