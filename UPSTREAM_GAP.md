# Upstream Gap Table

This document tracks the delta between this TypeScript port and upstream Python Graphify.

## Scope

- Current TypeScript product branch: `main`
- Current TypeScript baseline: `660e3836a165f815e3f31c925784ff4db97e7762`
- Current TypeScript npm release: `graphifyy@0.4.25`
- Durable traceability spec: `spec/SPEC_UPSTREAM_TRACEABILITY.md`
- Closed upstream `v3` baseline: `upstream/v3` at `699e996`
- Closed Python parity target: remote tag `v0.4.23` at `8d908c5d43d079579604a82873fd7cff33a1b343`
- Active Python drift target: `upstream/v4` at `5843ffc277c54766854f9201286c9647da095390`
- Deferred major-version source lock: `upstream/v5` at `770d7f54c40d7301a0166a6b7782cb03827897e5`
- Active CRG review reference: `tirth8205/code-review-graph` tag `v2.3.2` at `db2d2df789c25a101e33477b898c1840fb4c7bc7`
- Current implementation branch for traceability work: `chore/upstream-v4-0.4.32-catchup`

## Source Lock Notes

- `git ls-remote` is the authority for Safi Python tags while local tag clobber risk exists.
- Local `refs/tags/v0.4.23` is not trusted for parity claims because it differs from the remote tag observed by `git ls-remote`.
- Python `upstream/v4` was fetched on 2026-04-25 and now points to `5843ffc277c54766854f9201286c9647da095390`.
- Python `upstream/v5` now exists and is locked separately as deferred major-version work.
- Local `v0.4.28`..`v0.4.32` tags are not trusted for parity claims while tag clobber risk exists; use branch commits and `git ls-remote` instead.
- CRG `v2.3.2` remains the stable review-feature source. CRG `main` has advanced and is intentionally deferred until a new spec updates the source lock.

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

## Active Python v4 Drift After TypeScript `0.4.25`

This table starts from the remote Python `v0.4.23` source lock and tracks current `upstream/v4` through commit `5843ffc`.

| Upstream ref | Upstream scope | TS status | Plan lot | Catch-up action |
| --- | --- | --- | --- | --- |
| `v0.4.24` / `2b8c08f` plus follow-ups `4738e88`, `81b6e7d`, `f0ebd07` | hook/output/security/docs release-line fixes, including sensitive-directory false positives and absolute-path artifact regressions | `partial` | F2 drift audit | Sensitive-directory false positives are now covered by `tests/detect.test.ts`; portable artifact regressions were already covered locally. Remaining packaging/docs deltas stay under audit. |
| docs/translations commits / `53d516f`..`5a0c167` | multilingual README expansion and move to `docs/translations/` | `deferred` | separate docs lot | Do not mix translation relocation into runtime parity. Decide separately whether the TS README translation strategy should follow upstream. |
| `v0.4.25` / `cc917a7` | empty-community report fixes; graph-query CLI rules in installed instructions | `covered` | F2 drift audit | Covered by `tests/report.test.ts`; installed guidance already points users to graph query/path/explain flows. |
| `v0.4.26` / `f8fd8f8` | wiki encoding and slug collision fixes; hook rebase guard; detect path resolution; README `.gitignore` docs | `covered` | F2 drift audit | Hook guard now has regression coverage in `tests/hooks.test.ts`; wiki collision coverage already exists in `tests/wiki.test.ts`; detect resolves root up front; README and `.gitignore` are updated in this branch. |
| post-`v0.4.27` / `86d6d93`, `52ad45b`, `4bc2052`, `e4bdcc2`, `64f38ac`, `e915a87`, `b326aa8`, `5843ffc` | OpenCode config relocation, `check-update`, Java inheritance, Windows Python docs, canvas/docs polish, aggregated HTML viz, local benchmark-script ignores | `partial` | F2 drift audit | `.opencode/opencode.json`, `check-update`, Java inheritance, and benchmark-script ignores are now covered. Aggregated HTML viz and the remaining Python-specific Windows/doc polish are still open or `n/a`. |
| `v0.4.27` / `d9b2928` | deterministic large-graph `GRAPH_REPORT`, stable edge node IDs, corrected common-root inference | `partial` | F2 drift audit | Large-graph determinism, stable extracted node IDs, and common-root inference still need a dedicated structural lot. |
| `v0.5.0` / `upstream/v5` | major-version line and enterprise-oriented design work | `deferred` | separate major-version spec | Track separately from the current v4 catch-up branch. |

## Release Gate

Before claiming catch-up through Python `upstream/v4` at `5843ffc` or publishing a TypeScript parity release:

- all active Python drift rows must be `covered`, `n/a`, `deferred`, `rejected`, or `intentional-delta`
- no row may remain `missing`, `partial`, `needs-audit`, or `needs-review`
- `PLAN.md` exit criteria must be checked
- `npm run lint` must pass
- `npm run build` must pass
- `npm test` must pass
- `npm run test:smoke` must pass when runtime/package behavior changed
- `npx graphify hook-rebuild` must pass after code changes
- GitHub Actions release and post-publish npm install checks must pass for release commits

## Branching Rule

For each catch-up lot:

- use one commit per lot unless the lot is deliberately split
- update this table first or in the same commit as the implementation
- cite upstream tag/issue in commit message or commit body
- never mark `covered` without a regression test or explicit verification note
