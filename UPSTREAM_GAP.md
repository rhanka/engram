# Upstream Gap Table

This branch tracks the delta between this TypeScript port and the upstream Python repo.

## Scope

- Local baseline: `v3` branch at `fbc6929`
- Upstream compared here: `upstream/v3` at `699e996`
- Last upstream `v3` tag: `v0.3.28`
- Upstream `v3` also has 5 newer untagged commits after `v0.3.28`
- `upstream/v4` and `upstream/main` are intentionally tracked separately; do not mix them into this table until `v3` catch-up is explicit

## Status Legend

- `covered`: already present in the TypeScript port
- `partial`: some equivalent behavior exists, but parity is not yet proven
- `missing`: not present in the TypeScript port
- `n/a`: upstream fix targeted Python-only behavior that does not map directly to the TypeScript runtime
- `needs-audit`: likely covered or intentionally different, but not yet verified carefully

## Release Gap Table

| Upstream ref | Upstream scope | TS status | Catch-up action |
| --- | --- | --- | --- |
| `v0.3.18` | skill coverage, Windows skill fixes, click detection, `.graphify_python` persistence | `covered` | Covered in TS via installable skill coverage, Windows skill audit, HTML hover/click fallback, and synchronized extension sets in `detect`/`analyze`/`watch`; `.graphify_python` is `n/a` |
| `v0.3.19` | OpenCode `tool.execute.before` plugin install | `covered` | Covered in TS via `.opencode/plugins/graphify.js`, `opencode.json` registration, install/uninstall idempotency, and README parity |
| `v0.3.20` | AST call edges forced to `EXTRACTED`, tree-sitter version guard | `covered` | Covered in TS by fixing remaining AST `calls` edges to `EXTRACTED`/`1.0`; the upstream version guard is Python-binding-specific and maps to pinned `web-tree-sitter` deps plus existing missing-grammar diagnostics in TS |
| `v0.3.21` | Codex hook JSON schema fix, `#!/bin/sh` for Windows git hooks | `covered` | Covered in TS via the corrected Codex hook JSON payload and `/bin/sh` git hook installation/removal parity |
| `v0.3.22` | Cursor support, Python watcher/export crash fixes | `covered` | Covered in TS by adding project-scoped Cursor rules; the upstream watcher/export crashes are Python-specific and `n/a` for the current TS runtime |
| `v0.3.23` | Gemini CLI support | `covered` | Keep synced as upstream evolves, but base support is already present |
| `v0.3.24` | Codex/OpenCode install idempotency | `partial` | Codex is covered; audit OpenCode install path and add regression if needed |
| `v0.3.25` | Aider + Copilot CLI support, directed graphs, frontmatter cache, `.graphifyignore` parent discovery, MCP fixes | `missing` | Split into separate catch-up tasks; Aider/Copilot and `.graphifyignore` parent discovery are the clearest missing pieces |
| `v0.3.26` | MCP path validation security fix | `covered` | Keep existing TS validation tests aligned |
| `v0.3.27` | Gemini install missing skill file copy | `covered` | No immediate action beyond regression retention |
| `v0.3.28` | hook reinstall, CRLF labels, `skill-windows` missing commands | `partial` | Hook reinstall is covered; audit CRLF handling and Windows skill parity |
| `699e996` (post-`v0.3.28`) | audio/video corpus support, `yt-dlp`, Whisper transcription, YouTube docs, CI fix, remove Anthropic API dependency | `missing` | Treat as separate workstream after `v0.3.28` parity; this is a product expansion, not a small patch |

## Current Delta Assessment

### Already strong in the TS port

- Gemini CLI support exists
- Codex hook schema and runtime proofing exist
- MCP graph path validation exists
- AST edges already default to `EXTRACTED`
- Hyperedges, semantic similarity, confidence scores, code-only rebuilds, and hook rebuilds already exist, including some capabilities that only show up later on `upstream/main`

### Clear missing targets vs upstream `v3`

- Aider platform support
- Copilot CLI platform support
- `.graphifyignore` parent-directory discovery
- OpenCode plugin-style install parity
- Audio/video ingestion + local transcription (`yt-dlp` + Whisper path)

### Items to audit before coding

- OpenCode install idempotency
- Windows skill parity vs latest upstream `skill-windows.md`
- CRLF label handling
- Whether TS should support directed graphs, or intentionally keep the current undirected graphology contract
- Whether "frontmatter cache" in upstream maps to a real missing persistence layer in TS or is already subsumed by current metadata flow

## Recommended Catch-up Order

1. Close `v0.3.28` parity on platform/install/runtime behavior only.
2. Add missing platform targets: Cursor, Aider, Copilot CLI.
3. Fix `.graphifyignore` parent discovery and any remaining install idempotency gaps.
4. Decide explicitly on directed-graph support instead of drifting into it accidentally.
5. Treat audio/video + Whisper as a dedicated feature branch after the `v3` parity table is mostly green.

## Branching Rule

For each catch-up item:

- create one branch or one commit group per upstream release bucket
- update this table first
- mark each row as it moves from `missing` -> `partial` -> `covered`
- keep links to the upstream commit/tag that introduced the change
