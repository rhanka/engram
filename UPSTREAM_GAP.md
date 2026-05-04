# Upstream Gap Table

This document tracks the delta between this TypeScript port and upstream Python Graphify.

## Scope

- Current TypeScript product branch: `main`
- Current TypeScript baseline: `1f30efa7afaf5c98f06fcaebbb727fd4f2fb3f8a`
- Current TypeScript npm release: `graphifyy@0.5.6`
- Durable traceability spec: `spec/SPEC_UPSTREAM_TRACEABILITY.md`
- Closed upstream `v3` baseline: `upstream/v3` at `699e996`
- Closed Python parity target: remote tag `v0.4.23` at `8d908c5d43d079579604a82873fd7cff33a1b343`
- Closed Python drift target: `upstream/v4` at `5843ffc277c54766854f9201286c9647da095390`
- Closed Python `v5` parity line: remote `upstream/v5` at `f755aca58f36771923cebcc8f85f2eef6178a105`
- Active major-version source lock: remote `upstream/v6` at `f81e3bc2154d21062f56f9e4ec9f923dfe7d128e`
- Active parity target: remote tag `v0.7.4` at `f81e3bc2154d21062f56f9e4ec9f923dfe7d128e`
- Active CRG stable review reference: `tirth8205/code-review-graph` tag `v2.3.2` at `db2d2df789c25a101e33477b898c1840fb4c7bc7`
- Exploratory CRG head: remote `main` at `0919071a9ba353e604981059e99ee2ed98768092`
- Current implementation branch for traceability work: `upstream-0.7.4-traceability`

## Source Lock Notes

- `git ls-remote` is the authority for Safi Python tags while local tag clobber risk exists.
- Local `refs/tags/v0.4.23` is not trusted for parity claims because it differs from the remote tag observed by `git ls-remote`.
- Python `upstream/v4` was fetched on 2026-04-25 and remains locked as a closed parity line at `5843ffc277c54766854f9201286c9647da095390`.
- Python `upstream/v5` was fetched on 2026-04-29 and is now a closed parity line at `f755aca58f36771923cebcc8f85f2eef6178a105`.
- Python `upstream/v6` and remote tag `v0.7.4` were observed on 2026-05-04 and are the active source locks for the next parity cycle.
- Remote tag `v1.0.0` exists upstream, but the active upstream release train is still `v6` / `0.7.x`; do not target `1.0.0` until a separate traceability pass proves that line is the real parity target.
- Local `v0.4.28`..`v0.4.32` tags are not trusted for parity claims while tag clobber risk exists; use branch commits and `git ls-remote` instead.
- CRG `v2.3.2` remains the stable review-feature source. CRG `main` is 96 commits ahead and stays exploratory/deferred for the `0.7.4` parity cycle.
- Package version alignment is driven by Python Graphify parity targets, not by `code-review-graph` tags or `main`.
- The active `0.7.4` catch-up must stay TypeScript-only; no new Python dependency may be introduced to claim parity.

## Fork Guardrail

Parity means conceptual product parity, not deleting TypeScript-specific improvements.

These local additions are intentional deltas and must be preserved:

- `.graphify/` canonical state root plus `graphify-out/` migration support
- branch/worktree lifecycle metadata
- advisory commit recommendation
- `summary`, `review-delta`, `review-analysis`, `review-eval`, `recommend-commits`
- TypeScript `faster-whisper-ts` runtime instead of Python faster-whisper
- PDF preflight and optional `mistral-ocr`
- GitHub Actions npm trusted publishing
- README/spec fork narrative and code-review-graph-inspired review additions

## Status Legend

- `covered`: already present in the TypeScript port and covered by tests or equivalent verification
- `partial`: equivalent behavior exists, but parity is incomplete or not fully tested
- `missing`: not present in the TypeScript port
- `needs-audit`: likely covered or intentionally different, but not yet verified carefully
- `needs-review`: upstream moved or behavior is not yet mapped to local implementation/tests
- `deferred`: valid upstream concept, but not in the active implementation scope
- `rejected`: intentionally not adopted
- `n/a`: upstream fix targeted Python-only behavior that does not map to the TypeScript runtime
- `intentional-delta`: TypeScript port deliberately differs while preserving the same user-level contract

## Closed v3 Release Gap Table

This table is retained for history. It should stay closed unless upstream rewrites the `v3` line.

| Upstream ref | Upstream scope | TS status | Catch-up action |
| --- | --- | --- | --- |
| `v0.3.18` | skill coverage, Windows skill fixes, click detection, `.graphify_python` persistence | `covered` | Covered in TS via installable skill coverage, Windows skill audit, HTML hover/click fallback, and synchronized extension sets in `detect`/`analyze`/`watch`; `.graphify_python` is `n/a` |
| `v0.3.19` | OpenCode `tool.execute.before` plugin install | `covered` | Covered in TS via `.opencode/plugins/graphify.js`, `.opencode/opencode.json` registration with legacy-root migration, install/uninstall idempotency, and README parity |
| `v0.3.20` | AST call edges forced to `EXTRACTED`, tree-sitter version guard | `covered` | Covered in TS by fixing remaining AST `calls` edges to `EXTRACTED`/`1.0`; the upstream version guard is Python-binding-specific and maps to pinned `web-tree-sitter` deps plus existing missing-grammar diagnostics in TS |
| `v0.3.21` | Codex hook JSON schema fix, `#!/bin/sh` for Windows git hooks | `covered` | Covered in TS via the corrected Codex hook JSON payload and `/bin/sh` git hook installation/removal parity |
| `v0.3.22` | Cursor support, Python watcher/export crash fixes | `covered` | Covered in TS by adding project-scoped Cursor rules; the upstream watcher/export crashes are Python-specific and `n/a` for the current TS runtime |
| `v0.3.23` | Gemini CLI support | `covered` | Base support is present; keep synced as upstream evolves |
| `v0.3.24` | Codex/OpenCode install idempotency | `covered` | Covered in TS via Codex hook repair and OpenCode plugin reinstallation when `AGENTS.md` already exists |
| `v0.3.25` | Aider + Copilot CLI support, directed graphs, frontmatter cache, `.graphifyignore` parent discovery, MCP fixes | `covered` | Covered in TS via Aider + Copilot CLI support, `.graphifyignore` parent discovery, markdown-frontmatter cache hashing, MCP path/error fixes, and optional directed graphs threaded through build, serialization, loaders, runtime commands, README, and the base/Codex skills |
| `v0.3.26` | MCP path validation security fix | `covered` | Existing TS validation tests cover the contract |
| `v0.3.27` | Gemini install missing skill file copy | `covered` | No action beyond regression retention |
| `v0.3.28` | hook reinstall, CRLF labels, `skill-windows` missing commands | `covered` | Covered in TS by replacing existing graphify Claude/Codex hooks on reinstall, normalizing CRLF before wiki/canvas filename generation, and restoring missing Windows skill command lines |
| `699e996` post-`v0.3.28` | audio/video corpus support, `yt-dlp`, Whisper transcription, YouTube docs, CI fix, remove Anthropic API dependency | `covered` / `intentional-delta` | Covered in TS via audio/video detection, `ingest()` YouTube download wiring, local `yt-dlp` + `ffmpeg` + `faster-whisper-ts`, transcript-aware semantic extraction, and CI-safe regression coverage. Python faster-whisper is intentionally replaced by TS `faster-whisper-ts`. |

## Active v4 Release Gap Table

The TypeScript port has already shipped the original direct `0.4.23` parity target. Rows below are retained as the closed v4 parity table. New Python drift after `v0.4.23` is tracked in the next section and must not be treated as covered until reviewed.

| Upstream ref | Upstream scope | TS status | Plan lot | Catch-up action |
| --- | --- | --- | --- | --- |
| `v0.4.0` / `68bb2bd` | v4 branch setup, audio/video corpus support, local Whisper, URL/video ingest | `covered` / `intentional-delta` | Lot 8 final verification | TS already covers the user contract with `faster-whisper-ts`, `yt-dlp`, transcripts, and URL ingest. Keep TS runtime as intentional delta. |
| `v0.4.1` / `271ee0a` | `.graphifyignore` respected by collection; skill requires writable general-purpose subagent; missing chunk warning | `covered` | Lot 7 | Parent `.graphifyignore` discovery, agent instructions, and missing chunk safeguards are documented in the TS skill/runtime contract and retained for final verification. |
| `v0.4.2` / `3c50340`, `62aac4f` | full-path node IDs, edge aliases `from`/`to`, empty graph HTML, version warning dedupe, UTF-8 IO, Obsidian filename/report links | `covered` | Lot 7 verification | TS already accepts `source`/`target` and normalized graph contracts; empty graph/HTML and UTF-8 paths are covered by existing export/runtime behavior. |
| `v0.4.3` / `4205ae8` | JS/TS/Python relative import path fixes, watch merges AST with semantic nodes, Windows hook fallback, stale edge analysis guards, `.vue`/`.svelte` | `covered` | Lot 1 | `.vue` / `.svelte` input classification and regex-backed extraction are covered by `tests/detect.test.ts` and `tests/language-surface.test.ts`; watch/import safeguards are covered or intentionally handled by the TS runtime. |
| `v0.4.4` / `0a4e691` | watch preserves inferred/ambiguous semantic edges; Codex hook schema; lockfile skips | `covered` | Lot 7 verification | Current TS watch/runtime and Codex hook schema cover this user contract; retain regression coverage in final verification. |
| `v0.4.5` / `2499a1c` | MCP server ignores blank stdin JSON lines | `covered` | Lot 6 | Covered by `tests/serve.test.ts`, which writes blank stdio lines to `graphify serve` and verifies the MCP process remains alive. |
| `v0.4.6` / `6b2d383` | Google Antigravity platform support | `covered` | Lot 5 | Covered by Antigravity preview and install tests for `.agent/rules/graphify.md`, `.agent/workflows/graphify.md`, and the global `~/.agent/skills/graphify` skill with `.graphify_version`. |
| `v0.4.7` / `c713cf8` | watch edge-key fix, OpenClaw path correction, Blade support, WSL MCP docs | `covered` | Lot 1, Lot 5, Lot 7 | Blade classification/extraction is covered by Lot 1. Platform preview/install coverage covers the v4 platform surface; README and specs now document MCP and install behavior for the TypeScript distribution. |
| `v0.4.8` / `04e2960` | remove Claude-specific language from non-Claude skills | `covered` | Lot 7 verification | Current TS templates avoid hard Claude-only language where platform-specific docs are not Claude-only; keep install-preview tests. |
| `v0.4.9` / `7c81c1b` | PHP extractor improvements, Dart, diacritic search, Hermes, fixes | `covered` | Lot 1, Lot 4, Lot 5 | Dart and Blade/PHP surface coverage are covered by Lot 1. Diacritic search/normalization is covered by Lot 4. Hermes platform preview/version coverage is covered by Lot 5. |
| `v0.4.10` / `e441454` | Cursor install crash, OpenCode uninstall scoping, Codex `wait_agent`, Dart/Hermes, PHP features, `path`/`explain`/`add`/`watch`/`update`/`cluster-only` bare commands | `covered` | Lot 1, Lot 5, Lot 6 | CLI surface now covers `path`, `explain`, `add`, `watch`, `update`, and `cluster-only`; Dart/Hermes/Blade platform and language coverage are verified. |
| `v0.4.11` / `e441454` | query MultiGraph crash, null source_file, MCP CWD path, `.graphifyignore` subfolder patterns | `covered` | Lot 6 | Graphology avoids the Python MultiGraph failure mode; MCP path handling, command graph loading, and ignore behavior are covered by TS runtime/tests. |
| `v0.4.12` / `c657eb2` | Kiro support, portable cache hash | `covered` | Lot 5 | Covered by Kiro preview/install tests for `.kiro/skills/graphify/SKILL.md`, `.graphify_version`, quoted YAML frontmatter, and `.kiro/steering/graphify.md`. Cache portability is already covered by the TS workspace-local cache contract. |
| `v0.4.13` / `79a9200` | Verilog/SystemVerilog, HiDPI hyperedge fix, null label guards, generated instructions use `graphify update .` | `covered` | Lot 1, Lot 4, Lot 7 | Verilog/SystemVerilog detection/extraction is covered by Lot 1. Hyperedge HiDPI and null-label guards are covered by Lot 4. Generated instructions are covered by runtime/skill audits. |
| `v0.4.14` / `5c77d9c`, `2736e05`, `9866cbc` | all-language cross-file calls, PHP missing edges, wiki step, OpenCode plugin parity, cache root, Windows stability, approximate betweenness, cross-file call docs | `covered` / `n/a` | Lot 7 verification | TS lifecycle/review/export stack and cache-root behavior cover the user contract. Approximate betweenness is Python performance tuning and remains `n/a` unless TS profiling shows the same issue. |
| `v0.4.15` / `7ab62fd` | VS Code Copilot Chat, OpenCode/Gemini Windows fixes, `.mjs`/`.ejs`, macOS watch behavior, `god_nodes` degree rename | `covered` | Lot 1, Lot 4, Lot 5 | MJS/EJS input support is covered by Lot 1. `edges`/`degree` compatibility is covered by Lot 4. VS Code Copilot Chat preview/install/version coverage is covered by Lot 5. |
| `v0.4.16` / `2246e46` | watch import fix, `.mjs` dispatch, exclude local-only Python module from package | `covered` / `n/a` | Lot 1 | `.mjs` dispatch is covered by Lot 1; Python wheel packaging is `n/a`. |
| `v0.4.17` / `2246e46` | tag shares v0.4.16 commit | `n/a` | Lot 1 | Covered by `v0.4.16` row. |
| `v0.4.18` / `2246e46` | tag shares v0.4.16 commit | `n/a` | Lot 1 | Covered by `v0.4.16` row. |
| `v0.4.19` / `2c5d3a5`, `76d1203` | normalized IDs in build, cross-file calls Go/Rust/Zig/PowerShell/Elixir, resolved cache path, `core.hooksPath`, Kiro YAML, team workflow docs | `covered` | Lot 5, Lot 7 | `core.hooksPath`, cache path, cross-file call behavior, Kiro quoted YAML, and team workflow documentation are covered by the TS lifecycle docs/specs and platform installer tests. |
| `v0.4.20` / `69a0cfc`, `36fa62a` | JS/MJS import path normalization; CLI update/cluster-only emits `graph.html` | `covered` | Lot 1, Lot 3, Lot 6 | JS import normalization and `.mjs` dispatch are covered by Lot 1. CLI and skill-runtime `cluster-only` now refresh `graph.html`; update/finalize paths use best-effort HTML output. |
| `v0.4.21` / `35fa45d`, `7662f04` | cluster-only stats guard; update writes merged extraction before final analysis | `covered` | Lot 6 | Public CLI and skill-runtime `cluster-only` use placeholder detection stats and write report/graph/analysis safely; update command has code-only rebuild coverage. |
| `v0.4.22` / `5011857`, `2e82e49` | explicit AST cache root; `.mdx` documents | `covered` | Lot 1 | Cache-root contract is covered; `.mdx` document detection is covered by Lot 1. |
| `v0.4.23` / `42599a7`, `8d908c5`, `baa4474` | refresh all version stamps, `.html` documents, safe large-graph HTML export, Go import node ID collision, pipx docs | `covered` | Lot 1, Lot 2, Lot 3, Lot 8 | `.html` document detection is covered by Lot 1. Go import prefixing is covered by Lot 2. Safe HTML export is covered by Lot 3. npm/global install docs are covered by Lot 7. Package and MCP server version stamps now read `0.4.23` from `package.json`. |
| post-`v0.4.23` / `04790e2`, `dc1158b`, `7a0a5ac` | README download badge changes only | `n/a` | Lot 8 | Not part of TypeScript runtime parity; optionally ignore or adapt docs without copying Python download badges. |

## Closed Python v4 Drift Before The `0.5.x` Line

This table is retained as closed history. The TypeScript product line has already absorbed the runtime-relevant `upstream/v4` drift through commit `5843ffc`.

| Upstream ref | Upstream scope | TS status | Plan lot | Catch-up action |
| --- | --- | --- | --- | --- |
| `v0.4.24` / `2b8c08f` plus follow-ups `4738e88`, `81b6e7d`, `f0ebd07` | hook/output/security/docs release-line fixes, including sensitive-directory false positives and absolute-path artifact regressions | `covered` / `n/a` | F2 drift audit | Sensitive-directory false positives, relative artifact rebuilds, directory-safe semantic cache writes, and null-safe label sanitization are covered by `tests/detect.test.ts`, `tests/cache.test.ts`, `tests/security.test.ts`, `tests/html-export.test.ts`, and existing portable/runtime coverage. Python interpreter and packaging notes are `n/a` for the TypeScript runtime. |
| docs/translations commits / `53d516f`..`5a0c167` | multilingual README expansion and move to `docs/translations/` | `deferred` | separate docs lot | Do not mix translation relocation into runtime parity. Decide separately whether the TS README translation strategy should follow upstream. |
| `v0.4.25` / `cc917a7` | empty-community report fixes; graph-query CLI rules in installed instructions | `covered` | F2 drift audit | Covered by `tests/report.test.ts`; installed guidance already points users to graph query/path/explain flows. |
| `v0.4.26` / `f8fd8f8` | wiki encoding and slug collision fixes; hook rebase guard; detect path resolution; README `.gitignore` docs | `covered` | F2 drift audit | Hook guard now has regression coverage in `tests/hooks.test.ts`; wiki collision coverage already exists in `tests/wiki.test.ts`; detect resolves root up front; README and `.gitignore` are updated in this branch. |
| post-`v0.4.27` / `86d6d93`, `52ad45b`, `4bc2052`, `e4bdcc2`, `64f38ac`, `e915a87`, `b326aa8`, `5843ffc` | OpenCode config relocation, `check-update`, Java inheritance, Windows Python docs, canvas/docs polish, aggregated HTML viz, local benchmark-script ignores | `covered` / `n/a` | F2 drift audit | `.opencode/opencode.json`, `check-update`, Java inheritance, aggregated HTML member counts, canvas-relative exports, and benchmark-script ignores are covered by runtime/tests. Remaining Windows Python packaging/docs polish is `n/a` for the TypeScript runtime. |
| `v0.4.27` / `d9b2928` | deterministic large-graph `GRAPH_REPORT`, stable edge node IDs, corrected common-root inference | `covered` | F2 drift audit | Covered by project-relative file-node remap plus stable relative-import targets in `tests/language-surface.test.ts`, and deterministic large-graph analysis coverage in `tests/analyze.test.ts`. |
## Closed Python v5 Catch-up

This table is retained as closed history. The TypeScript fork has already absorbed the repo-oriented upstream `v5` line at `f755aca` while preserving its own runtime and `.graphify/` state model.

| Upstream ref | Upstream scope | TS status | Plan lot | Catch-up action |
| --- | --- | --- | --- | --- |
| `2c49da2` | repo clone command and GitHub URL workflow | `covered` | V5 lot 1 | Covered by `src/repo-clone.ts`, `src/cli.ts`, `src/index.ts`, and `tests/repo-clone.test.ts`. |
| `2faeed9` | `merge-graphs`, `CLAUDE_CONFIG_DIR` skill install destination, legacy `graphify-out` skip during detection | `covered` | V5 lot 1 | `merge-graphs` is covered by `src/merge-graphs.ts`, CLI wiring, and `tests/cli-runtime.test.ts`; `CLAUDE_CONFIG_DIR` install preview/write path is covered by `tests/install-preview.test.ts`; legacy `graphify-out` skipping was already covered in `src/detect.ts`. |
| `df9b7ec` | `build_merge`, pre-write shrink guard, label dedup, chunk-suffix prompt hardening | `covered` / `intentional-delta` | V5 lot 2 | `buildMerge`, conservative label dedup, and JSON shrink guard are covered by `tests/build-merge.test.ts` and `tests/export-json.test.ts`. Dedup is intentionally conservative in TS to avoid collapsing same-label entities across distinct files. Skill prompts now forbid chunk-suffix node IDs. |
| `8bed332` | upstream version bump to `0.5.0` | `n/a` | release lot | Do not mirror Python version bumps mechanically; TypeScript versioning remains release-driven. |
| `770d7f5` | README badge refresh | `n/a` | docs lot | Python download badges do not map to npm-first TypeScript distribution. |
| `6175e0a` | `hooksPath` expansion, `.graphifyignore` inline comments, Python write-sink annotations | `covered` / `n/a` | V5 lot 3 | `.graphifyignore` inline comments are covered by `tests/detect.test.ts`; `hooksPath`/nosec annotations are Python-specific or already handled by the TS hook installer. |
| `4563b04` | ID collisions, path portability, JS/TS alias resolution, HTML controls, desync guard, rationale prompt | `covered` / `intentional-delta` | V5 lot 3 | Symbol ID collisions and `tsconfig.paths` alias resolution are covered by `tests/language-surface.test.ts`; HTML Show/Hide controls are covered by `tests/html-export.test.ts`; skill prompts now store rationale as node metadata and keep caller/callee direction explicit. The TS export/build pipeline already uses shrink guards with its own implementation shape. |
| `a566bfb` | upstream version bump to `0.5.1` | `n/a` | release lot | Do not mirror Python version bumps mechanically. |
| `ee1df22` | Claude Code PreToolUse matcher changes from `Glob|Grep` to `Bash` | `covered` | V5 lot 1 | Covered by `tests/claude-integration.test.ts`, CLI hook install/uninstall behavior, and README install guidance. |
| `7359cda` | AST/semantic cache namespace split fixes `graphify update` collisions | `covered` | V5 lot 1 | Covered by `tests/cache.test.ts`, which separates AST and semantic caches while preserving legacy AST fallback compatibility. |
| `dd86271` | SSRF DNS rebinding hardening and pre-`yt-dlp` URL validation | `covered` | V5 lot 1 | Covered by `tests/security.test.ts` and `tests/transcribe.test.ts`; redirects are revalidated and private/internal targets are rejected before download. |
| `5904081` | Kimi backend, phantom god-node fix, `concept` file_type | `covered` / `n/a` / `intentional-delta` | V5 lot 2 | `concept` file_type is covered by `tests/validate.test.ts`. Kimi backend and Python-specific phantom-node behavior do not map directly to the TypeScript runtime/assistant contract, so they remain `n/a` or are absorbed by the TS node-ID model. |
| `59cbad3` | Go package-call false-negative and `llm.py` robustness | `covered` / `n/a` | V5 lot 3 | Go package import handling is already covered by `tests/extract-call-confidence.test.ts`; `llm.py` robustness is Python-only and `n/a` for the TypeScript runtime. |
| `f9c344b` | remember scan root so `graphify update` works without a path argument | `intentional-delta` | V5 lot 3 | The TypeScript fork keeps `.graphify/` project-local and documents `graphify update .` in installed guidance rather than storing a Python-style scan-root state. |
| `a4ad901`, `eceaaad` | release notes only | `n/a` | docs lot | Release notes are not runtime parity work. |
| `71d1b39`, `c750582`, `44fc32e`, `326c03e`, `28b17d3` | Kimi follow-up, raw-string warning, product-site churn, Python 3.14+ range | `n/a` | docs lot | These changes are Python packaging/site concerns or backend-specific follow-ups that do not map to the npm-first TypeScript runtime. |
| `f755aca` | Kimi temperature fix and preserve community labels during cleanup | `covered` / `n/a` | V5 lot 2 | Community-label preservation is covered by `tests/skills.test.ts`; Kimi backend tuning remains `n/a` for the current TypeScript product line. |

## Active Python `v6` / `0.6.x`-`0.7.x` Catch-up

This is the current parity cycle. Be conservative: unless a behavior is already proven locally by a named test or explicit verification command, mark it `needs-review` rather than inferring parity.

| Upstream ref | Upstream scope | TS status | Plan lot | Catch-up action |
| --- | --- | --- | --- | --- |
| `v0.6.0` / `17fb524` | SQL AST extraction, YAML indexing, roll-up bug fixes from `0.5.6`/`0.5.7` | `covered` / `deferred` | Structured inputs, query precision, and inventory semantics | YAML indexing is covered by `tests/detect.test.ts`, and `.sql` files now enter the code surface. SQL AST extraction is explicitly deferred: the TS parser stack has no SQL grammar or SQL extractor today (`src/extract.ts`, package audit via `rg "tree-sitter-sql|sql"`), and this catch-up must not introduce a Python fallback. |
| `v0.6.1` / `2dc759a` | exact gitignore semantics, anchored patterns, hermetic non-VCS scan | `covered` | Structured inputs, query precision, and inventory semantics | Covered by `tests/detect.test.ts` for full-line comment parsing, ancestor rule discovery inside a repo, anchored `/...` patterns relative to the owning `.graphifyignore`, and hermetic non-VCS scans that do not leak parent rules. |
| `v0.6.2` / `be83a8c` | exact-match query ordering, smarter content-hash `update`, R support, shebang detection, Kimi/license cleanup | `covered` / `n/a` | Structured inputs, query precision, and inventory semantics | Covered by `tests/search.test.ts`, `tests/cli.test.ts`, and `tests/detect.test.ts` for exact-match query ordering, `.r` support, extensionless shebang-script detection, manifest `{mtime, hash}` writes, mtime-only incremental touches, and legacy-manifest-safe change detection. |
| `v0.6.3` / `a4149df` | preserve semantic nodes on incremental rebuild, detached hooks, common-name suppression, `cluster-only` crash guard | `covered` | Incremental rebuild reliability, hooks, and platform surface | Code-only rebuilds now preserve existing semantic nodes and their surviving edges, covered by `tests/cli-runtime.test.ts` (`preserves existing semantic nodes during code-only update rebuilds`). Detached git hooks are covered by `tests/hooks.test.ts` (`installs all lifecycle hooks`) and now launch rebuilds via `nohup`/`disown` with `.cache/graphify-rebuild.log`. Oversized `cluster-only` runs are covered by `tests/cli-runtime.test.ts` (`supports cluster-only on oversized graphs by skipping HTML export`). Ambiguous short-name call targets are now suppressed by resolvable-label indexing, covered by `tests/extract-call-confidence.test.ts` (`skips ambiguous call targets when multiple symbols share the same name`). |
| `v0.6.4` / `a61b25c` | cross-platform Codex hook check on Windows | `covered` | Incremental rebuild reliability, hooks, and platform surface | Covered by `tests/codex-integration.test.ts` (`writes the corrected Codex hook JSON contract`) and `tests/cli-runtime.test.ts` (`supports a silent hook-check command for Codex PreToolUse hooks`). The hook now delegates to `graphify hook-check`, avoiding bash-only `[ -f ]` logic and inline JSON escaping. |
| `v0.6.5` / `d40e1c0` | Codex Windows hook, Kotlin call edges, `update --force`, community checkbox UI | `covered` / `deferred` | Incremental rebuild reliability, hooks, and platform surface | `update --force` is covered by `tests/export-json.test.ts` and `tests/cli-runtime.test.ts`, the Codex hook portability portion is covered by the same `hook-check` tests used for `v0.6.4`, and the checkbox-based community selector is covered by `tests/html-export.test.ts` (`renders aggregated community member counts when provided`). Kotlin call-edge parity is deferred: the current TS runtime uses `web-tree-sitter` + WASM grammars, and current rebuild verification still reports `sample.kt` as unavailable because no wasm-compatible Kotlin grammar is loading in this environment. Closing that gap requires a dedicated grammar supply strategy rather than a small parity patch. |
| `v0.6.6` / `517f3c8` | Pi platform install, wiki stale clearing, Windows-safe wiki filenames | `covered` / `deferred` | Incremental rebuild reliability, hooks, and platform surface | Wiki regeneration hygiene is covered by `tests/wiki.test.ts` (`clears stale wiki articles before regenerating`) and `tests/wiki.test.ts` (`strips Windows-reserved characters and caps wiki filenames`). Pi-agent install support is deferred: it expands the assistant/platform matrix without changing the graph/runtime contract, and there is no current TS product requirement to add or maintain another installer surface in this parity cycle. |
| `v0.6.7` / `e484282` | `graphify tree`, token-aware chunking, MCP context filters, dynamic `import()`, safe semantic-cache file checks | `covered` / `intentional-delta` | Visualization, ignore semantics, and portable output routing | `graphify tree` is covered by `tests/cli-runtime.test.ts` (`supports tree for compact graph traversal output`), local JS/TS `import()` extraction is covered by `tests/language-surface.test.ts` (`resolves local dynamic imports as imports_from edges`), and directory-safe semantic-cache writes are covered by `tests/cache.test.ts` (`skips directory source_file entries when saving semantic cache`) plus the `fileHash requires a file` guard in `src/cache.ts`. Token-aware chunking is an intentional TypeScript delta documented by `tests/skills.test.ts` (`documents deterministic semantic chunk sizing and directory grouping`): this fork uses deterministic 20-25 file batches/chunks with image isolation and same-directory grouping instead of provider-specific token heuristics. MCP context filters are an intentional delta documented by `tests/skills.test.ts` (`documents the MCP graph tool surface for live graph queries`) and `tests/skills.test.ts` (`documents minimal-context as the first CRG-style review call`): the TypeScript product exposes graph query tools plus compact `summary` / `minimal-context` / `review-context` entrypoints instead of upstream-specific context-filter toggles. |
| `v0.6.8` / `d753413` | `.graphifyignore` negation patterns, Antigravity frontmatter, Gemini/Codex hook fixes, thin-community omission | `covered` / `intentional-delta` | Visualization, ignore semantics, and portable output routing | `.graphifyignore` negation semantics are covered by `tests/detect.test.ts` (`supports .graphifyignore negation patterns`), Antigravity workflow/rule frontmatter is covered by `tests/platform-v4-integration.test.ts` (`installs Google Antigravity rules, workflow, and global skill`), and thin-community omission is already covered by `tests/report.test.ts` (`does not list empty communities in the report`). Codex hook portability was closed earlier via `graphify hook-check`; Gemini remains an intentional delta because this TypeScript product uses the `/graphify` command plus MCP/project config instead of a PreToolUse hook on that platform. |
| `v0.6.9` / `f81e3bc` | slash-normalized `source_file`, cohesion re-splitting, VS Code Copilot instruction contract, `GRAPHIFY_OUT`, Antigravity reinstall | `covered` / `intentional-delta` | Visualization, ignore semantics, and portable output routing | Slash-normalized `source_file` handling is covered at both ingestion and export time by `tests/build.test.ts` (`normalizes Windows-style source_file separators during graph ingestion`) and `tests/portable-artifacts.test.ts` (`normalizes relative Windows-style source_file separators`). Two-phase low-cohesion community re-splitting is covered by `tests/cluster.test.ts` (`re-splits low-cohesion large communities on a second pass`). The VS Code Copilot instruction contract is covered by `tests/platform-v4-integration.test.ts` (`installs VS Code Copilot Chat instructions and global Copilot skill`) plus `tests/copilot-integration.test.ts`, and Antigravity reinstall idempotency is covered by `tests/platform-v4-integration.test.ts` (`reinstalls Google Antigravity without duplicating frontmatter`). `GRAPHIFY_OUT` remains an intentional delta: this TypeScript fork keeps `.graphify/` as the canonical default state root and exposes state-directory override only through explicit API/path options, not a global environment variable contract. |
| `v0.7.0` / release-tag anomaly | merge driver for `graph.json`, deterministic community IDs, content-only cache on renames, freshness signal, mixed code/doc handling | `needs-review` | Multi-developer graph lifecycle | The fetched local tags `v0.7.0` through `v0.7.4` all resolve to `f81e3bc`, but the effective `0.7.x` code train continues on `upstream/v7`. Keep this row open until the `v7` commit history is fully mapped onto the `0.7.0` scope. |
| `v0.7.1` / release-tag anomaly | Obsidian tag sanitization, extended `tsconfig` alias resolution, Svelte template dynamic imports, recursion safety | `partial` | Parser robustness, export surface, and headless extraction | The fetched `0.7.x` tags are not reliable source pointers after `0.6.9`, so this row is traced against the effective `upstream/v7` continuation instead. Extended `tsconfig` alias resolution and Svelte dynamic-import coverage now exist via `tests/language-surface.test.ts` (`parses JSONC tsconfig aliases with comments and trailing commas`) and `tests/language-surface.test.ts` (`resolves aliased Svelte dynamic imports via tsconfig paths`). Obsidian tag sanitization and deep-AST recursion safety remain open. |
| `v0.7.2` / `b6ffdbb` | Fortran support, export CLI subcommands, skill-size reduction, large-graph aggregation | `needs-review` / `deferred` | Parser robustness, export surface, and headless extraction | Audit language and export surfaces against the effective `upstream/v7` continuation; treat skill-size reduction as non-blocking unless it changes runtime behavior or install limits. |
| `v0.7.3` / `d40e274` | `graphify extract` headless semantic extraction for CI, backend selection, `--no-cluster`, `--out` | `needs-review` / `intentional-delta` | Parser robustness, export surface, and headless extraction | Compare the upstream headless extraction flow with the current TypeScript assistant/runtime contract before deciding parity or a documented delta, without adding Python dependencies. |
| `v0.7.4` / `741ac36` + `26a5a35` | JSONC `tsconfig` parsing and aliased Svelte dynamic-import fixes | `covered` | Parser robustness, export surface, and headless extraction | Covered by `tests/language-surface.test.ts` (`parses JSONC tsconfig aliases with comments and trailing commas`) and `tests/language-surface.test.ts` (`resolves aliased Svelte dynamic imports via tsconfig paths`). The TypeScript parser now strips JSONC comments/trailing commas in `loadTsconfigAliases()` and resolves Svelte `import()` specifiers through the same alias logic used for JS/TS. |

## Release Gate

Before claiming catch-up through the effective Python `0.7.4` release train (`upstream/v7` through `26a5a35`) or publishing the next TypeScript release from this branch:

- all active Python drift rows must be `covered`, `n/a`, `deferred`, `rejected`, or `intentional-delta`
- no row may remain `missing`, `partial`, `needs-audit`, or `needs-review`
- `PLAN.md` exit criteria must be checked
- `npm run lint` must pass
- `npm run build` must pass
- `npm test` must pass
- `npm run test:smoke` must pass when runtime/package behavior changed
- `npx graphify hook-rebuild` must pass after code changes
- package-level tarball UAT must pass for release candidates
- GitHub Actions release and post-publish npm install checks must pass for release commits

## Branching Rule

For each catch-up lot:

- use one commit per lot unless the lot is deliberately split
- update this table first or in the same commit as the implementation
- cite upstream tag/issue in commit message or commit body
- never mark `covered` without a regression test or explicit verification note
