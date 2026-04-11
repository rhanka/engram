# TypeScript Port Execution Plan

## Status Snapshot

- [x] Create the TypeScript workspace in `ts/`
- [x] Port the core library modules to TypeScript
- [x] Port the extraction engine for 20 languages
- [x] Port graph build, clustering, analysis, report, export, wiki, serve, watch, ingest, benchmark
- [x] Add the TypeScript package/tooling scaffold (`package.json`, `tsconfig`, `tsup`, `vitest`)
- [x] Add the initial TypeScript CLI entry point
- [x] Port test fixtures
- [x] Port the automated test suite
- [x] Add Node.js CI/CD and npm publish workflow
- [x] Split active GitHub CI into root-level Python and TypeScript workflows
- [x] Convert all 7 skill markdown files from Python to Node.js
- [x] Keep the work split into 13 atomic commits on top of `origin/v3`
- [x] Verify local build passes with `npm run build`
- [x] Verify local test suite passes with `npm test`
- [x] Verify packaging smoke test passes with a writable npm cache (`NPM_CONFIG_CACHE=/tmp/... npm run test:smoke`)
- [x] Keep the TypeScript command surface aligned with the Python CLI
- [ ] Push to origin
- [ ] Publish npm package

## Reality Check Before Continuing

- [x] Confirm the TypeScript CLI works via `node dist/cli.js --help`
- [x] Confirm the TypeScript CLI reports version `0.4.0`
- [x] Confirm the default shell originally resolved `graphify` to the legacy Python binary in `/home/antoinefa/.local/bin/graphify`
- [x] Confirm `npm link` created the TypeScript binary in `/home/antoinefa/.npm-global/bin/graphify`
- [x] Confirm `/graphify <path>` is still a skill workflow entrypoint, not a packaged `graphify` binary command
- [x] Confirm the real package contract is: npm CLI commands + `require('graphifyy')` helpers used in the converted skills
- [x] Close the contract mismatch between `ts/src/skills/*.md`, the package public API, and `ts/src/cli.ts`

## Track 1 - Make The Product Usable

- [x] Make the default `graphify` command resolve to the TypeScript binary for local UAT
  - [x] Build the CLI bundle in `ts/dist/`
  - [x] Create the linked npm binary with `npm link`
  - [x] Back up the legacy Python shim to `~/.local/bin/graphify.python-backup-20260410`
  - [x] Repoint `~/.local/bin/graphify` to the npm-linked TypeScript binary
  - [x] Verify `graphify --version` returns `0.4.0` from the user-facing shell path

- [x] Implement the real missing package contract used by the TypeScript skills
  - [x] Add `graphify serve [graph]`
  - [x] Add `graphify watch [path] --debounce <seconds>`
  - [x] Export the documented runtime helpers from `graphifyy`
  - [x] Make `require('graphifyy')` work from the built CJS bundle
  - [x] Accept the object/option-style helper signatures used in converted Node snippets where safe
  - [x] Update converted skill snippets for the remaining non-maskable issues (`Map` handling and `await` on async helpers)
- [x] Revert the temporary public `build|index` TS-only command to preserve strict Python CLI parity

- [x] Verify the existing implemented commands still work after contract changes
  - [x] `graphify install`
  - [x] `graphify claude install|uninstall`
  - [x] `graphify codex|opencode|claw|droid|trae|trae-cn install|uninstall`
  - [x] `graphify hook install|uninstall|status`
  - [x] `graphify query <question>`
  - [x] `graphify benchmark [graph]`
  - [x] internal `graphify hook-rebuild`
  - [x] `graphify serve [graph]`
  - [x] `graphify watch [path]`

## Track 2 - Keep Docs And Plan Aligned With Reality

- [x] Use this file as the execution source of truth until push
- [x] Update the root README to match the Python/TypeScript CLI surface exactly
- [x] Reconcile the skill files with the final released CLI/package contract
- [ ] Remove or absorb `ts/VALIDATION.md` once the remaining useful checks are covered here
- [ ] Decide whether packaging/test scripts should set a local npm cache by default for sandbox-safe runs

## Track 3 - Usage-Driven UAT Before Push

- [x] Run smoke-level UAT through the user-facing `graphify` command path (`--version`, `--help`, `hook status`)
- [x] Run the TypeScript CLI through the user-facing `graphify` command on a real local corpus
- [x] Verify `graphify query "<question>"` works against the generated graph
- [x] Verify one platform install flow end-to-end from the TypeScript CLI
- [x] Verify hook install/status from the final CLI shape
- [ ] Record and fix any remaining Python vs TypeScript behavior gaps discovered during UAT
  - Remaining practical product gap: `/graphify <path>` is still a skill workflow, not a packaged CLI command, in both Python and TypeScript

## Track 4 - Make Codex The Primary Skill Target

- [x] Verify the explicit Codex skill invocation that actually works in `codex exec`
  - [x] Confirm `$graphify .` triggers the installed `graphify` skill in Codex
- [x] Align Codex-specific install hints and always-on instructions with the verified invocation path
  - [x] Update the Codex install output to recommend `$graphify .`
  - [x] Update `AGENTS.md` rules for Codex to point Codex at the installed `graphify` skill
- [x] Remove Claude-centric wording from the Codex-specific skill and docs
  - [x] Update `py/graphify/skill-codex.md`
  - [x] Update `ts/src/skills/skill-codex.md`
  - [x] Update the root `README.md`
- [x] Run a real Codex end-to-end build on this repository
  - [x] Refresh the globally installed Codex skill from the repo before UAT
  - [x] Confirm `$graphify .` generates `graphify-out/graph.json`, `GRAPH_REPORT.md`, and `graph.html`
  - [x] Confirm `graphify query --graph graphify-out/graph.json "codex install"` works on the generated graph
- [x] Close the concrete Codex install/UAT gaps discovered during real-repo testing
  - [x] Fix `graphify codex install` when `.codex` is a file instead of a directory
  - [x] Make `graphify codex install` re-register the Codex hook even when `AGENTS.md` already exists
  - [x] Restore the full Codex skill pipeline in the packaged `skill-codex.md`
- [x] Confirm the current successful Codex skill pipeline still runs the Python graph build path
- [ ] Decide whether Codex natural-language invocation should be documented as first-class or left undocumented until separately validated
- [ ] Port the Codex skill build/update pipeline so Codex can drive the TypeScript runtime end to end instead of Python

## Commit Rollout

- [x] Commit 1 - close the TypeScript runtime/package contract, CLI surface, and verification helpers
- [x] Commit 2 - align the non-Codex skill markdown files with the shipped runtime contract
- [x] Commit 3 - make Codex use `$graphify` end to end in Python/Codex skills, docs, and UAT evidence
- [x] Commit 4 - harden Codex install/UAT on a real repo and record that the successful skill pipeline is still Python-backed
- [x] Commit 5 - move the Python runtime and Python tests under `py/` and repair top-level paths
- [x] Commit 6 - move Python packaging into `py/` and split root GitHub Actions into Python and TypeScript CI workflows

## Track 5 - Symmetrize The Repo Before Python Removal

- [x] Move the Python runtime into a first-class `py/` workspace
- [x] Keep `ts/` as the parallel TypeScript workspace with matching top-level layout
  - [x] Keep Python packaging metadata under `py/`
  - [x] Keep TypeScript packaging metadata under `ts/`
  - [x] Run root GitHub Actions workflows against both workspaces explicitly
- [ ] Define which files stay shared at repo root vs runtime-specific under `py/` and `ts/`
  - Shared candidates: fixtures, `worked/`, parity specs, release docs
  - Runtime-specific candidates: package metadata, runtime tests, skill templates, build tooling
- [ ] Add a runtime parity spec that maps every Python module to its TypeScript counterpart
  - `detect`, `extract`, `build`, `cluster`, `analyze`, `report`, `export`, `serve`, `watch`, `security`, `ingest`, `cache`, `hooks`, `cli`, `skills`
- [ ] Add a cross-runtime parity harness on shared fixtures/corpora
  - Compare graph shape and key report sections for Python vs TypeScript outputs
  - Record intentional divergences explicitly
- [ ] Make Codex runtime selection explicit in docs and tests so UAT cannot silently fall back to Python
- [ ] Require green Codex end-to-end UAT on the TypeScript runtime before deleting Python

## Release Gate

- [x] No documented package command in `ts/src/skills/*.md` is missing from the released CLI/public API
- [x] The default `graphify` command path is the TypeScript one for local usage
- [x] Smoke-level product UAT is green from the user-facing command path
- [x] Working tree is clean except for intentional tracked changes
- [ ] The runtime used by Codex UAT is explicit and matches the target runtime under test
- [ ] Push branch to origin
- [ ] Tag the release
- [ ] Publish the npm package
