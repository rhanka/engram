# Upstream Catch-up Plan

## Snapshot

- [x] Create a dedicated catch-up branch: `chore/upstream-v3-rattrapage`
- [x] Fetch the upstream repository and refresh all refs/tags
- [x] Confirm local baseline branch: `v3` at `fbc6929`
- [x] Confirm upstream target branch for this catch-up: `upstream/v3` at `699e996`
- [x] Confirm last upstream `v3` tag: `v0.3.28`
- [x] Record the initial gap table in [UPSTREAM_GAP.md](UPSTREAM_GAP.md)
- [x] Keep this file as the execution source of truth for the catch-up branch
- [ ] Update [UPSTREAM_GAP.md](UPSTREAM_GAP.md) after every completed lot

## Guardrails

- [ ] Do not mix `upstream/v4` or `upstream/main` work into this branch until the `upstream/v3` delta is triaged
- [ ] Keep the npm/package release version unchanged while doing parity catch-up unless a release lot explicitly requires a bump
- [ ] Keep one commit group per upstream release bucket where practical
- [ ] For every implementation lot:
  - [x] run targeted tests first
  - [x] run full `npm test` before closing the lot
  - [x] run `npx graphify hook-rebuild` after code changes
  - [x] update this plan and [UPSTREAM_GAP.md](UPSTREAM_GAP.md)
- [ ] Mark Python-only upstream fixes as explicit `n/a` instead of silently ignoring them

## Lot 0 - Planning Baseline

- [x] Build an initial release-by-release delta map from `v0.3.18` through current `upstream/v3`
- [x] Add upstream commit links beside each release lot in this plan
- [ ] Decide the exact close-out rule for each lot:
  - [ ] `covered`
  - [ ] `partial but acceptable`
  - [ ] `n/a`
  - [ ] `implemented`

## Lot 1 - Upstream `v0.3.18`

Upstream commits: `11dff7e`, `29c639d`, `4d8cffe`

Upstream scope:
- skill coverage fixes
- Windows skill fixes
- click detection fix
- `.graphify_python` persistence

Plan:
- [x] Audit upstream commits `11dff7e`, `29c639d`, `4d8cffe`
- [x] Diff current TS skill files against the upstream `v0.3.18` behavior changes
- [x] Verify whether the Windows skill still misses any commands or examples
- [x] Verify whether the click-detection issue has a TS/UI equivalent
- [x] Mark `.graphify_python` persistence as `n/a` for the TS-only runtime unless a real TS runtime-proof persistence gap exists
- [x] Add targeted regressions for any retained fixes
- [x] Update [UPSTREAM_GAP.md](UPSTREAM_GAP.md) for `v0.3.18`
- [ ] Commit the `v0.3.18` catch-up lot

## Lot 2 - Upstream `v0.3.19`

Upstream commits: `3501605`, `e1864d7`, `096a76f`

Upstream scope:
- OpenCode `tool.execute.before` plugin integration

Plan:
- [x] Audit upstream commits `3501605`, `e1864d7`, `096a76f`
- [x] Decide whether TS should support true OpenCode plugin-style install parity or intentionally keep the current install model
- [x] If parity is required, add the OpenCode plugin install path
- [x] If parity is not required, document the intentional divergence in [UPSTREAM_GAP.md](UPSTREAM_GAP.md)
- [x] Add regression coverage for OpenCode install idempotency and resulting config shape
- [x] Update [UPSTREAM_GAP.md](UPSTREAM_GAP.md) for `v0.3.19`
- [x] Commit the `v0.3.19` catch-up lot

## Lot 3 - Upstream `v0.3.20`

Upstream commits: `b7fd5ac`, `b101a99`

Upstream scope:
- AST call-edge confidence forced to `EXTRACTED`
- tree-sitter version/runtime guard

Plan:
- [x] Audit upstream commits `b7fd5ac`, `b101a99`
- [x] Confirm TS extractors already emit AST call edges as `EXTRACTED`
- [x] Audit whether TS needs an explicit runtime/version guard for tree-sitter packages or WASM grammars
- [x] Decide whether missing grammar/runtime failures should be hardened further in TS
- [x] Add regression coverage if any runtime/version guard is introduced
- [x] Update [UPSTREAM_GAP.md](UPSTREAM_GAP.md) for `v0.3.20`
- [x] Commit the `v0.3.20` catch-up lot

## Lot 4 - Upstream `v0.3.21`

Upstream commit: `6f9fc65`

Upstream scope:
- Codex hook JSON schema fix
- `#!/bin/sh` portability for Windows hooks

Plan:
- [x] Audit upstream commit `6f9fc65`
- [x] Confirm current TS Codex hook JSON shape still matches the fixed upstream schema
- [x] Audit hook shell portability in the TS runtime
- [x] Decide whether any hook script shebang or shell portability fix is still missing
- [x] Add/extend hook tests if needed
- [x] Update [UPSTREAM_GAP.md](UPSTREAM_GAP.md) for `v0.3.21`
- [x] Commit the `v0.3.21` catch-up lot

## Lot 5 - Upstream `v0.3.22`

Upstream commit: `f770712`

Upstream scope:
- Cursor support
- watcher/export crash fixes in Python

Plan:
- [x] Audit upstream commit `f770712`
- [x] Add Cursor as a first-class platform target if still missing
- [x] Verify whether any Python watcher/export crash fix has a TS analogue
- [x] Mark Python-only crash fixes as `n/a` if there is no TS analogue
- [x] Add install + docs + regression coverage for Cursor if implemented
- [x] Update [UPSTREAM_GAP.md](UPSTREAM_GAP.md) for `v0.3.22`
- [x] Commit the `v0.3.22` catch-up lot

## Lot 6 - Upstream `v0.3.23`

Upstream commit: `dcc402e`

Upstream scope:
- Gemini CLI support

Plan:
- [x] Confirm Gemini CLI support already exists in TS
- [x] Audit the upstream Gemini install/details against the current TS implementation
- [x] Close any doc/install drift that remains
- [x] Update [UPSTREAM_GAP.md](UPSTREAM_GAP.md) for `v0.3.23`
- [x] No code commit needed beyond a plan checkpoint because the audit found no remaining TS delta

## Lot 7 - Upstream `v0.3.24`

Upstream commit: `ee43236`

Upstream scope:
- Codex/OpenCode install idempotency

Plan:
- [x] Audit upstream commit `ee43236`
- [x] Confirm Codex idempotency parity is already covered in TS
- [x] Audit OpenCode install/uninstall idempotency in TS
- [x] Add regression coverage if OpenCode still lags
- [x] Update [UPSTREAM_GAP.md](UPSTREAM_GAP.md) for `v0.3.24`
- [ ] Commit the `v0.3.24` catch-up lot

## Lot 8 - Upstream `v0.3.25`

Upstream commit: `1cbcee5`

Upstream scope:
- Aider support
- Copilot CLI support
- directed graphs
- frontmatter cache
- `.graphifyignore` parent-directory discovery
- MCP fixes

Plan:
- [ ] Audit upstream commit `1cbcee5`
- [ ] Split this release into sub-lots before coding:
  - [ ] platform additions: Aider + Copilot CLI
  - [ ] detection behavior: `.graphifyignore` parent discovery
  - [ ] graph model decision: directed graphs
  - [ ] metadata/caching: frontmatter cache
  - [ ] MCP delta audit
- [ ] Implement Aider as a first-class platform target if accepted
- [ ] Implement Copilot CLI as a first-class platform target if accepted
- [ ] Add `.graphifyignore` parent-directory discovery if still missing
- [ ] Decide explicitly whether TS should remain undirected or adopt directed-graph support
- [ ] Audit whether frontmatter metadata persistence is already enough or whether a dedicated cache layer is still missing
- [ ] Add regressions for every accepted sub-lot
- [ ] Update [UPSTREAM_GAP.md](UPSTREAM_GAP.md) for `v0.3.25`
- [ ] Commit the `v0.3.25` catch-up lot

## Lot 9 - Upstream `v0.3.26`

Upstream commit: `863100c`

Upstream scope:
- MCP path validation security fix

Plan:
- [x] Confirm the TS port already has MCP graph-path validation
- [ ] Audit upstream commit `863100c` against the current TS implementation
- [ ] Tighten tests only if there is still a mismatch
- [ ] Update [UPSTREAM_GAP.md](UPSTREAM_GAP.md) for `v0.3.26`
- [ ] Commit only if the audit finds a real delta

## Lot 10 - Upstream `v0.3.27`

Upstream commits: `55964bc`, `af3a3d2`

Upstream scope:
- Gemini install missing skill file copy

Plan:
- [x] Confirm TS already copies the Gemini skill/custom command file
- [ ] Audit upstream commit `55964bc` against the current TS implementation
- [ ] Tighten tests only if there is still a mismatch
- [ ] Update [UPSTREAM_GAP.md](UPSTREAM_GAP.md) for `v0.3.27`
- [ ] Commit only if the audit finds a real delta

## Lot 11 - Upstream `v0.3.28`

Upstream commits: `210243f`, `f7ee752`

Upstream scope:
- hook reinstall
- CRLF labels
- Windows skill command coverage

Plan:
- [ ] Audit upstream commit `210243f`
- [ ] Confirm hook reinstall parity in TS with explicit regression evidence
- [ ] Audit whether CRLF normalization still breaks labels anywhere in the TS pipeline
- [ ] Re-audit `skill-windows` against upstream command coverage
- [ ] Add tests for any remaining CRLF or Windows-skill gaps
- [ ] Update [UPSTREAM_GAP.md](UPSTREAM_GAP.md) for `v0.3.28`
- [ ] Commit the `v0.3.28` catch-up lot

## Lot 12 - Post-`v0.3.28` Upstream `v3` Commits

Upstream commits: `79acb7e`, `f758911`, `a2872ca`, `2c21bc0`, `699e996`

Upstream scope:
- audio/video corpus support
- `yt-dlp` download path
- local transcription / Whisper path
- docs and CI follow-ups
- removal of Anthropic API dependency from transcription flow

Plan:
- [ ] Audit upstream commits `79acb7e`, `f758911`, `a2872ca`, `2c21bc0`, `699e996`
- [ ] Decide whether this branch should absorb multimodal/audio-video support now or defer it to a dedicated feature branch
- [ ] If deferred, mark the whole block as intentionally postponed in [UPSTREAM_GAP.md](UPSTREAM_GAP.md)
- [ ] If accepted, split implementation into sub-lots:
  - [ ] corpus detection for audio/video
  - [ ] YouTube/download ingestion path
  - [ ] local transcription runtime
  - [ ] docs and CI support
- [ ] Keep this block separate from the pure parity lots above
- [ ] Commit only after that decision is explicit

## Exit Criteria For This Branch

- [ ] Every upstream `v3` release bucket from `v0.3.18` through `v0.3.28` is marked `covered`, `n/a`, or explicitly deferred with justification
- [ ] Every intentional divergence is documented in [UPSTREAM_GAP.md](UPSTREAM_GAP.md)
- [ ] The remaining delta to `upstream/v3` is only the explicitly deferred post-`v0.3.28` multimodal block, or it is also closed
- [ ] `npm test` passes after the final catch-up lot
- [ ] `npx graphify hook-rebuild` passes after the final catch-up lot
- [ ] The branch is clean and ready either for merge or for the next dedicated feature branch
