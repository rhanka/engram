# Upstream Gap Table

This document tracks the delta between this TypeScript port and upstream Python Graphify.

## Scope

- Current TypeScript product branch: `v3-typescript`
- Current working branch: `chore/upstream-v4-0.4.23-parity`
- Current release PR: `#4` (`Release 0.3.29 with TypeScript faster-whisper runtime`) was merged on 2026-04-19 by merge commit `83ffcb2`.
- Current release safety PR: `#5` (`Guard npm publish behind merged release tags`) was merged on 2026-04-19 by merge commit `359d652`.
- Current TypeScript npm release: `graphifyy@0.3.29`
- Closed upstream `v3` baseline: `upstream/v3` at `699e996`
- Active upstream parity target: `upstream/v4` tag `v0.4.23` at `8d908c5`
- Upstream `upstream/v4` head after tag: `7a0a5ac`, containing README badge-only commits after `v0.4.23`
- Target TypeScript release: direct bump to `0.4.23` after parity is complete

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
- `n/a`: upstream fix targeted Python-only behavior that does not map to the TypeScript runtime
- `intentional-delta`: TypeScript port deliberately differs while preserving the same user-level contract

## Closed v3 Release Gap Table

This table is retained for history. It should stay closed unless upstream rewrites the `v3` line.

| Upstream ref | Upstream scope | TS status | Catch-up action |
| --- | --- | --- | --- |
| `v0.3.18` | skill coverage, Windows skill fixes, click detection, `.graphify_python` persistence | `covered` | Covered in TS via installable skill coverage, Windows skill audit, HTML hover/click fallback, and synchronized extension sets in `detect`/`analyze`/`watch`; `.graphify_python` is `n/a` |
| `v0.3.19` | OpenCode `tool.execute.before` plugin install | `covered` | Covered in TS via `.opencode/plugins/graphify.js`, `opencode.json` registration, install/uninstall idempotency, and README parity |
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

The target is direct TypeScript release `0.4.23`. Rows must not remain `missing`, `partial`, or `needs-audit` before release.

| Upstream ref | Upstream scope | TS status | Plan lot | Catch-up action |
| --- | --- | --- | --- | --- |
| `v0.4.0` / `68bb2bd` | v4 branch setup, audio/video corpus support, local Whisper, URL/video ingest | `covered` / `intentional-delta` | Lot 9 final verification | TS already covers the user contract with `faster-whisper-ts`, `yt-dlp`, transcripts, and URL ingest. Keep TS runtime as intentional delta. |
| `v0.4.1` / `271ee0a` | `.graphifyignore` respected by collection; skill requires writable general-purpose subagent; missing chunk warning | `covered` | Lot 7 verification | Parent `.graphifyignore` discovery, agent instructions, and missing chunk safeguards are covered by the current TS skill/runtime contract; keep a regression note in final verification. |
| `v0.4.2` / `3c50340`, `62aac4f` | full-path node IDs, edge aliases `from`/`to`, empty graph HTML, version warning dedupe, UTF-8 IO, Obsidian filename/report links | `covered` | Lot 7 verification | TS already accepts `source`/`target` and normalized graph contracts; empty graph/HTML and UTF-8 paths are covered by existing export/runtime behavior. |
| `v0.4.3` / `4205ae8` | JS/TS/Python relative import path fixes, watch merges AST with semantic nodes, Windows hook fallback, stale edge analysis guards, `.vue`/`.svelte` | `partial` | Lot 1 | Main remaining gap is `.vue` / `.svelte` input classification and extraction coverage. Watch/import safeguards are covered or intentionally handled by the TS runtime. |
| `v0.4.4` / `0a4e691` | watch preserves inferred/ambiguous semantic edges; Codex hook schema; lockfile skips | `covered` | Lot 7 verification | Current TS watch/runtime and Codex hook schema cover this user contract; retain regression coverage in final verification. |
| `v0.4.5` / `2499a1c` | MCP server ignores blank stdin JSON lines | `covered` | Lot 7 verification | MCP stdio behavior is covered by current TS tests/runtime; keep in final command audit. |
| `v0.4.6` / `6b2d383` | Google Antigravity platform support | `missing` | Lot 5 | Add install/preview/uninstall support if still a relevant platform; otherwise mark `intentional-delta` with explicit rationale. |
| `v0.4.7` / `c713cf8` | watch edge-key fix, OpenClaw path correction, Blade support, WSL MCP docs | `partial` | Lot 1, Lot 5, Lot 8 | Add explicit Blade fixture/coverage; verify OpenClaw path support and WSL MCP docs. |
| `v0.4.8` / `04e2960` | remove Claude-specific language from non-Claude skills | `covered` | Lot 7 verification | Current TS templates avoid hard Claude-only language where platform-specific docs are not Claude-only; keep install-preview tests. |
| `v0.4.9` / `7c81c1b` | PHP extractor improvements, Dart, diacritic search, Hermes, fixes | `partial` | Lot 1, Lot 4, Lot 5 | Add Dart, Hermes platform support, and diacritic search/normalization regression. PHP is mostly covered but needs Blade-specific coverage. |
| `v0.4.10` / `e441454` | Cursor install crash, OpenCode uninstall scoping, Codex `wait_agent`, Dart/Hermes, PHP features, `path`/`explain`/`add`/`watch`/`update`/`cluster-only` bare commands | `partial` | Lot 1, Lot 5, Lot 7 | CLI surface is ahead of upstream; remaining gap is Dart/Hermes/Blade plus platform verification. |
| `v0.4.11` / `e441454` | query MultiGraph crash, null source_file, MCP CWD path, `.graphifyignore` subfolder patterns | `covered` | Lot 7 verification | Graphology avoids the Python MultiGraph failure mode; MCP path handling and ignore behavior are covered by TS runtime/tests. |
| `v0.4.12` / `c657eb2` | Kiro support, portable cache hash | `partial` | Lot 5 | Add Kiro install-preview/docs support. Cache portability is already covered by the TS workspace-local cache contract. |
| `v0.4.13` / `79a9200` | Verilog/SystemVerilog, HiDPI hyperedge fix, null label guards, generated instructions use `graphify update .` | `partial` | Lot 1, Lot 4, Lot 7 | Add Verilog/SystemVerilog detection/extraction coverage; verify hyperedge/null-label behavior in final export tests. |
| `v0.4.14` / `5c77d9c`, `2736e05`, `9866cbc` | all-language cross-file calls, PHP missing edges, wiki step, OpenCode plugin parity, cache root, Windows stability, approximate betweenness, cross-file call docs | `covered` / `n/a` | Lot 7 verification | TS lifecycle/review/export stack and cache-root behavior cover the user contract. Approximate betweenness is Python performance tuning and remains `n/a` unless TS profiling shows the same issue. |
| `v0.4.15` / `7ab62fd` | VS Code Copilot Chat, OpenCode/Gemini Windows fixes, `.mjs`/`.ejs`, macOS watch behavior, `god_nodes` degree rename | `partial` | Lot 1, Lot 5, Lot 8 | Add VS Code Copilot Chat platform and MJS/EJS input support; decide `edges` vs `degree` as intentional API delta or compatibility alias. |
| `v0.4.16` / `2246e46` | watch import fix, `.mjs` dispatch, exclude local-only Python module from package | `partial` / `n/a` | Lot 1 | Add `.mjs` dispatch; Python wheel packaging is `n/a`. |
| `v0.4.17` / `2246e46` | tag shares v0.4.16 commit | `n/a` | Lot 1 | Covered by `v0.4.16` row. |
| `v0.4.18` / `2246e46` | tag shares v0.4.16 commit | `n/a` | Lot 1 | Covered by `v0.4.16` row. |
| `v0.4.19` / `2c5d3a5`, `76d1203` | normalized IDs in build, cross-file calls Go/Rust/Zig/PowerShell/Elixir, resolved cache path, `core.hooksPath`, Kiro YAML, team workflow docs | `covered` / `partial` | Lot 5, Lot 7 | `core.hooksPath`, cache path, and cross-file call behavior are covered; Kiro YAML/docs still depend on Kiro platform support. |
| `v0.4.20` / `69a0cfc`, `36fa62a` | JS/MJS import path normalization; CLI update/cluster-only emits `graph.html` | `covered` / `partial` | Lot 1, Lot 7 | JS import normalization and HTML output are largely covered; `.mjs` dispatch remains in Lot 1. |
| `v0.4.21` / `35fa45d`, `7662f04` | cluster-only stats guard; update writes merged extraction before final analysis | `covered` | Lot 7 verification | TS runtime has equivalent merge/placeholder protections; keep final command audit. |
| `v0.4.22` / `5011857`, `2e82e49` | explicit AST cache root; `.mdx` documents | `partial` | Lot 1 | Cache-root contract is covered; `.mdx` detection/pipeline support remains. |
| `v0.4.23` / `42599a7`, `8d908c5`, `baa4474` | refresh all version stamps, `.html` documents, safe large-graph HTML export, Go import node ID collision, pipx docs | `partial` | Lot 1, Lot 2, Lot 3, Lot 8 | Add `.html` detection/docs, Go import prefixing, safe HTML export in runtime call sites, and version stamp refresh. pipx docs are Python-specific and should map to npm/global install docs only where useful. |
| post-`v0.4.23` / `04790e2`, `dc1158b`, `7a0a5ac` | README download badge changes only | `n/a` | Lot 8 | Not part of TypeScript runtime parity; optionally ignore or adapt docs without copying Python download badges. |

## Release Gate

Before publishing TypeScript `0.4.23`:

- all active v4 rows must be `covered`, `n/a`, or `intentional-delta`
- `PLAN.md` exit criteria must be checked
- `npm run lint` must pass
- `npm run build` must pass
- `npm test` must pass
- `npm run test:smoke` must pass
- `npx graphify hook-rebuild` must pass
- GitHub Actions tag publish and post-publish npm install check must pass

## Branching Rule

For each catch-up lot:

- use one commit per lot unless the lot is deliberately split
- update this table first or in the same commit as the implementation
- cite upstream tag/issue in commit message or commit body
- never mark `covered` without a regression test or explicit verification note
