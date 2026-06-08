### Track F drift bilan — 2026-06-08 (0.8.19..0.8.31 catchup, cadrage only)

**Status: Draft (cadrage).** Drumbeat: weekly Track F scan (cf. `spec/SPEC_TRACK_F_UPSTREAM_BILAN.md`). Source: `github.com/safishamsi/graphify`. **Cadrage only — no code in this lot.** Companion artefacts: `PLAN.md > Lot F-0831 drift (2026-06-08)`. `UPSTREAM_GAP.md` intake/gap-table updates are **deliberately deferred to lot execution** (a docs PR editing `UPSTREAM_GAP.md` is in flight at cadrage time; do not collide).

#### Source lock

- **Upstream remote**: `https://github.com/safishamsi/graphify`.
- **Window**: `3efae38` (excluded — last commit classified by the 0818 bilan, `spec/SPEC_TRACK_F_0818_BILAN.md`) → `fff1c98` (included — `upstream/v8` HEAD **as last fetched locally**). `git log 3efae38..upstream/v8 --oneline | wc -l` = **104 commits**.
- **Fetch caveat**: this cadrage classifies the window **as of the last local fetch** (head commit `fff1c98` dated 2026-06-05 upstream). **No re-fetch was performed for this bilan.** Each execution lot must re-run the `git ls-remote` source-lock command from `SPEC_TRACK_F_UPSTREAM_BILAN.md > Source Locks` and extend/correct this table if upstream has moved.
- **New tags in window**: `v0.8.19` (`d9debdf`) through `v0.8.31` (`7a588fb`). The window head `fff1c98` is **4 commits past `v0.8.31`** (`863f0c1`, `830f039`, `75c4de7`, `fff1c98`).
- **Local tag anomaly**: local tags `v0.8.23`/`v0.8.24`/`v0.8.25` all resolve to `a7a7322` locally, while the release commits in the log are distinct (`ffbe425` "release 0.8.23", `fd1aca4` "release 0.8.24", `a7a7322` "release 0.8.25"). Per the tag-clobber rule (`SPEC_UPSTREAM_TRACEABILITY.md`), local tags are not trusted: **SHAs, not tags, bound this classification.** Re-verify tags via `ls-remote` at lot execution.
- **Local TS baseline**: `main` at `23ad57f` (merge PR #99 ledger refresh), package `@sentropic/graphify@0.10.0` (released 2026-05-26; rename of the `graphifyy@0.9.8` line). Closest audited parity point: upstream `v0.8.18`.
- **Early ports already merged on `main` (unreleased on npm)** — this bilan reconciles them, they are **not** re-classified as must-port:
  - **PR #87** (`a25afae`, F-0819-P1): `dc2283d` tsconfig `extends` array (#1017), `1cb4a9c` bidirectional calls-pair direction (#1061), `43adac4` arrow-fn/markdown phantom god-nodes (#1077, incl. `tests/extract-godnode-orphans.test.ts`), `605de40` Lua `require()` resolution (#1075).
  - **PR #88** (`7b4572f`, F-0819-P2): `c029742` manifest prune path matching (#1007, `src/build.ts` + `tests/build-merge.test.ts`), `a405750` deterministic `(source,target,relation)` edge sort (#1010).
  - **PR #93** (`1a55a0b`, F-0831-P1-security): `b635d60` office/PDF zip-bomb cap (`src/office-guard.ts` + `tests/office-guard.test.ts`), `b2e71c8` `OLLAMA_BASE_URL` SSRF hardening (`tests/ollama-base-url.test.ts`), `f61e313` Fortran cpp-path non-regression guard (`tests/fortran-cpp-path.test.ts`).
  - **Portable-manifest commits** `6e3b173` (commit-safe manifests: relativized `saveManifest` keys, `src/detect.ts` + `tests/portable-artifacts.test.ts`) and `8008dc6` (portable artifacts: `source_file` normalization, `src/portable-artifacts.ts:126-190` + tests) — these cover most of upstream `25df580` (#777).

Reproducer:

```bash
git fetch upstream --tags --force   # NOT run for this cadrage; run at lot execution
git log --reverse --oneline 3efae38..upstream/v8
git rev-parse upstream/v8           # fff1c98 at cadrage time
git log main --grep="F-0819\|F-0831" --oneline   # early-port reconciliation
```

#### Method

1. `git log --reverse --oneline 3efae38..upstream/v8` — full 104-commit listing, walked commit by commit.
2. `git show --stat` on every ambiguous commit (multi-fix clusters, security commits, "fix" commits with unclear surface).
3. Grounding greps against `main` at `23ad57f` for every claimed TS surface (evidence cited per row — repo rule: **no `already-covered`/`already-ported` without a TS commit, file:line, or test name as proof; otherwise the row is `to-verify`**).
4. Reconciliation against merged PRs #87/#88/#93 and the portable-manifest commits (see source lock).

Buckets: `must-port (P)` — priority correctness/security • `must-port (M)` — medium parity (parser/CLI/LLM/hook) • `already-ported` — TS port already merged on `main` (cite TS commit/PR) • `already-covered` — equivalent TS behaviour pre-existed (cite file/test) • `to-verify` — plausible coverage, proof incomplete; verify-first at lot execution • `defer` — valid concept, out of current scope (cite reopen condition) • `n-a` — Python-runtime/CI specific, no TS analogue • `release-only` — version bumps, badges, changelogs, translations (do not mirror).

#### Drift table (104 commits)

Every `must-port`, `already-ported`, `already-covered` and `to-verify` row is per-commit. `n-a` and `release-only` are grouped thematically at the end. `80301a0` (the `v0.8.21` multi-fix) is split into sub-rows.

##### must-port (P) — 4 commits

| # | Upstream SHA | Issue | Subject | Proposed TS target | Lot | Rationale / Evidence |
|---|---|---|---|---|---|---|
| P1 | `80301a0` (part) | #1040 | OpenCode project path fix | `src/cli.ts:388-567` (opencode install map + plugin/config entries) | F-0831-P2 | **PORTED F-0831-P2c.** Added `project_skill_dst?: string` to `PlatformConfig`; set `project_skill_dst: join(".opencode","skills","graphify","SKILL.md")` for opencode; `resolveProjectSkillDestination` uses it over `skill_dst`. Global path (`.config/opencode/...`) unchanged. Test: `install-scope-project.test.ts` "writes OpenCode skill to .opencode/skills/ (not .config/opencode/) in project scope". |
| P2 | `80301a0` (part) | #1042 | `.svh` Verilog extension | `src/detect.ts:24`, `src/extract.ts:4545` | F-0831-P2 | **PORTED F-0831-P2c.** Added `.svh` to `CODE_EXTENSIONS` (`src/detect.ts:24`), dispatch table (`src/extract.ts:4547`), and `_EXTENSIONS` set (`src/extract.ts:4787`). Test: `detect.test.ts` "classifies .svh (SystemVerilog header) as CODE". |
| P3 | `ad3f3b2` | — | Harden XML parsing against billion-laughs DoS (`extract_csproj`/`extract_lpk`) | new XML guard, paired with the `.NET` extractor port | F-0831-P2 (paired F-0819-M) | **No TS XML-parsing surface exists today** (grep `DOMParser|xml2js|fast-xml` empty). The guard MUST land in the same PR as the `8bcfffd` .NET project-file extractor (row M1) — never ship the extractor without the DoS cap. |
| P4 | `e3993e4` | F1 | Validate custom-provider `base_url`, gate project-local providers | `src/security.ts`, paired with `providers.json` registry (row M14) | F-0831-P2 (paired) | No `providers.json` registry exists in TS yet (grep empty). Same pairing rule as P3: registry (`a9d6be6`) and validation land together. SSRF validation primitives already exist in `src/security.ts:288` (dns.lookup private-IP checks from PR #93) — reuse them. |
| P5 | `0fdfded` | — | Harden hook interpreter detection against injection and unquoted exec | `src/hooks.ts` (hook script generation), `tests/hooks.test.ts` | F-0831-P2 | TS hook scripts build shell commands (`GRAPHIFY_CMD`, `nohup sh -c "$GRAPHIFY_CMD hook-rebuild"`, `src/hooks.ts:55-85`) — audit quoting/injection on the TS equivalent surface (no `.graphify_python` interpreter probing in TS, but the exec-quoting concern transfers). |

(P count is 4 commits / 5 sub-rows; `80301a0` counted once.)

##### must-port (M) — 25 commits (2 conditional on the #996 decision)

| # | Upstream SHA | Issue | Subject | Proposed TS target | Lot | Rationale / Evidence |
|---|---|---|---|---|---|---|
| M1 | `8bcfffd` | — | .NET project file support (`.sln`, `.csproj`, `.fsproj`, `.vbproj`, `.razor`, `.cshtml`) | `src/detect.ts`, `src/extract.ts`, tests | F-0819-M | New extractor family, no TS counterpart (grep `csproj` empty). Must ship with the P3 XML-DoS guard in the same PR. |
| M2 | `9abaa77` | #1028 | Apply `remap_communities_to_previous` in cluster-only path | `src/cluster.ts`, `src/cli.ts:3326` (cluster-only), `src/community-labels.ts` | F-0820-0827 | No community-remap-to-previous exists in TS (grep `remapCommunit` empty). Pairs with M19 (`f5f3a1c`). |
| M3 | `2c01a89` | — | MCP config extractor (`.mcp.json`, `claude_desktop_config.json`, `mcp.json`) | `src/detect.ts`, `src/extract.ts`, tests | F-0820-0827 | New extractor, no TS counterpart (only skill docs mention these files). |
| M4 | `baaab5f` | #999 | Dart child node IDs via `_file_stem` (no machine-specific absolute paths in `graph.json`) | `src/extract.ts` (Dart), tests | F-0820-0827 | TS has Dart extraction (`src/detect.ts:24`, `src/extract.ts`). Verify-first: confirm TS Dart child IDs are already stem-based; if yes, reclassify already-covered with a test citation. |
| M5 | `80301a0` (part) | #916 | Builtin god-node filter | `src/analyze.ts`, tests | F-0820-0827 | No builtin/built-in filter exists in `src/analyze.ts` (grep empty). Keeps language builtins out of god-node rankings. |
| M6 | `9f73400` | #1047, #1046, #1050 | Memory-dir gitignore leak; Pass-2 dedup cross-file identical merge; decorated method node ID mismatch | `src/detect.ts:685-689` (memory dir), dedup pass, Python decorator IDs | F-0820-0827 | All three touch live TS surfaces (memory dir input exists at `src/detect.ts:685`; dedup passes and Python extraction exist). One row, three fixes, one PR. |
| M7 | `32aa053` | #1015 | Semantic type-reference edges for Swift, Kotlin, PHP, Rust, Go | extension of the #996 semantic-contexts module | F-0820-0827 — **conditional #996** | Extends `ab4e542` (#996), which is **itself still a scope decision** (F-0818-Opt, defer by default). Do not port unless/until #996 is accepted; then port together. |
| M8 | `0080fbd` | — | Semantic contexts: ObjC, Julia, C, C++, Scala, Fortran, PowerShell | extension of the #996 semantic-contexts module | F-0820-0827 — **conditional #996** | Same conditionality as M7. Merged upstream via `aae027f` (#1071). |
| M9 | `379d35e` | #1063 | claude-cli: eliminate hollow-response loop from system-prompt conflict | TS claude CLI execution port (`spec/SPEC_LLM_EXECUTION_PORTS.md` surface) | F-0820-0827 | Verify-first: TS drives Claude CLI differently; check whether the system-prompt conflict mode exists before porting. Merged upstream via `8a30851`. |
| M10 | `f0badd9` (part) | — | Post-commit hook silent drop on rapid commits | `src/hooks.ts`, `tests/hooks.test.ts` | F-0820-0827 | TS post-commit hook backgrounds `hook-rebuild` (`src/hooks.ts:79-85`); audit the rapid-commit race. The WinError-2 half of the commit is `n-a` (Python `subprocess` specific). |
| M11 | `9985940` | #1079 | Antigravity global install path `~/.gemini/config/skills/` + uninstall symmetry | `src/cli.ts` (antigravity platform map) | F-0820-0827 | TS ships an antigravity platform (grep `antigravity` hits `src/cli.ts`). Wrong global path = broken install. |
| M12 | `9a298c5` | — | Write antigravity rules and workflows on project-scoped install | `src/cli.ts` (project-scope path, F-0816-P1 lineage) | F-0820-0827 | TS has project-scoped installs since F-0816-P1 (PR #59); align the antigravity platform with it. Pairs with M11. |
| M13 | `006e159` | #1086 | `extract_files_direct` backend default: auto-detect instead of kimi | `src/llm-execution.ts` (provider default) | F-0820-0827 | Verify-first: TS `DIRECT_LLM_PROVIDERS` exists (`src/llm-execution.ts:9-11`); confirm the default-selection path before porting. |
| M14 | `a9d6be6` | #1084 | Custom LLM provider registry via `providers.json` | `src/llm-execution.ts`, new registry module, tests | F-0820-0827 (paired P4) | No registry exists (grep `providers.json` empty). Must land in the same PR as the P4 `base_url` validation (`e3993e4`) — never ship the registry unvalidated. |
| M15 | `cca13aa` | #1087 | Anchored gitignore pattern leaking basename match into subtree | `src/detect.ts:524-546` (`matchesIgnorePattern`) | F-0820-0827 | TS has its own anchored-pattern matcher; verify-first whether the same leak exists, then fix or reclassify already-covered with a test. |
| M16 | `c066511` | #961 | Detect circular import dependencies at file level | `src/analyze.ts` or new module, `src/report.ts`, tests | F-0820-0827 | New capability, no TS counterpart (grep `circular` empty). |
| M17 | `8db19d6` | — | Sort file list lexicographically in `detect()` for deterministic graph output | `src/detect.ts`, `tests/detect.test.ts` | F-0820-0827 | PR #88 sorted edges (`a405750`); the detect-stage file-list sort is still missing in TS (grep `sort` in `src/detect.ts` empty). Completes the determinism family. |
| M18 | `c898dc6` | #1033 | Match AST file-level node IDs to the skill.md spec | `src/extract.ts` node-ID scheme | F-0820-0827 | Verify-first: this fixed *Python* drifting from the spec; the TS scheme may already comply. If compliant, reclassify already-covered citing the ID test. |
| M19 | `f5f3a1c` | #1090 | Stabilize community IDs so identical groupings get identical labels | `src/cluster.ts`, `src/community-labels.ts` | F-0820-0827 | TS persists labels per community ID (`src/community-labels.ts:107`) but has no ID-stabilization across reruns. Pairs with M2. |
| M20 | `ad0c8c0` | #1096 | Relativize symbol node IDs for root-level files to match spec | `src/extract.ts` node-ID scheme | F-0820-0827 | Same verify-first posture as M18; pairs with M4. Deterministic/portable symbol IDs family. |
| M21 | `88a8e3b` | #1095 | Capture TS interface-extends and same-file class heritage | `src/extract.ts` (TS/JS heritage edges), tests | F-0820-0827 | Verify-first: TS extracts Java `extends_interfaces` (`src/extract.ts:1754`) but confirm TypeScript `interface A extends B` and same-file class heritage emit edges. High self-relevance (we are the TS fork). |
| M22 | `c8b329d` | #1097 | Auto-name communities with the configured backend in standalone CLI | `src/cluster.ts` / `src/community-labels.ts` + LLM naming path | F-0820-0827 | Verify-first: TS labels communities; confirm whether the standalone `cluster` CLI invokes LLM naming or only writes `Community <id>` defaults (`src/community-labels.ts:97`). |
| M23 | `e35b0ac` | — | Remove the claude skill tree on uninstall, not just the CLAUDE.md section | `src/cli.ts` (uninstall), tests | F-0820-0827 | Verify-first: TS uninstall lives in `src/cli.ts`/`src/hooks.ts`; confirm whether the skill directory tree is left behind. |
| M24 | `5cc7ec8` | — | Close the Read-tool graph bypass with a Read/Glob PreToolUse hook | `src/cli.ts:509-680` (PreToolUse registration) | F-0820-0827 | TS registers a **Bash-matcher** PreToolUse reminder only; extend to Read/Glob so agents reading raw files still get the query-first nudge. |
| M25 | `ec3cb5e` | #1098 | Dart: modernize AST parser, nested generics, part-of redirection | `src/extract.ts` (Dart), tests | F-0820-0827 | TS Dart extraction is regex/AST-lite; port the generics + `part of` handling. Pairs with M4. |
| M26 | `75c4de7` | #1112 | Honour `GRAPHIFY_API_TIMEOUT` in claude-cli and Anthropic SDK backends | `src/llm-execution.ts` (+ CLI runner) | F-0820-0827 | No `GRAPHIFY_API_TIMEOUT` in TS (grep empty). Post-`v0.8.31` commit — included because the window runs to the fetched head. |

(M count is 25 commits / 26 rows; `80301a0`/`f0badd9` parts not double-counted.)

##### already-ported — 10 commits (TS proof cited)

| # | Upstream SHA | Issue | Subject | TS proof |
|---|---|---|---|---|
| AP1 | `3366527` | #1017 | tsconfig `extends` array form (TS 5.0) | PR #87 `dc2283d` + `tests/language-surface.test.ts` |
| AP2 | `a26f24e` | #1007 | Stale nodes persisting after deletion with absolute manifest paths | PR #88 `c029742` (`src/build.ts` + `tests/build-merge.test.ts`) + manifest key relativization `6e3b173` |
| AP3 | `a54a542` | #1010 | Deterministic graph output (stop graphify-out churn) | PR #88 `a405750` (`(source,target,relation)` edge sort). Detect-stage file sort remains open as M17. |
| AP4 | `66acfd8` | #1061 | Calls edge direction flipping on bidirectional pairs | PR #87 `1cb4a9c` |
| AP5 | `5642c1b` | #1075 | Lua `require()` import edges lost (wrong target ID) | PR #87 `605de40` |
| AP6 | `925eb81` | #1077 | JS/TS phantom god-nodes from arrow-fn locals + markdown orphans | PR #87 `43adac4` |
| AP7 | `282afaa` | #1077 | Extra test coverage for the #1077 scope guard | PR #87 `43adac4` ships `tests/extract-godnode-orphans.test.ts` (66 lines) |
| AP8 | `c50ffc2` | F2 | Cap untrusted office/PDF parsing (zip-bomb DoS) | PR #93 `b635d60` (`src/office-guard.ts`, `tests/office-guard.test.ts`) |
| AP9 | `46a1d4c` | F3, F5 | Ollama metadata-egress hardening + cpp path handling | PR #93 `b2e71c8` (`tests/ollama-base-url.test.ts`) + `f61e313` (`tests/fortran-cpp-path.test.ts`) |
| AP10 | `763b673` | F2, F3 | Review tightening: bounded decompression, ollama DNS + clean error | PR #93: bounded decompression `src/office-guard.ts:127-158`; DNS checks `src/security.ts:109,288` |

##### already-covered — 6 commits (TS evidence cited)

| # | Upstream SHA | Issue | Subject | TS evidence |
|---|---|---|---|---|
| AC1 | `4e80d86` | #1016, #1023 | Wiki TypeError on null `source_file`; skip nested `worktrees/` dirs | Worktrees skip: `src/detect.ts:438-440` (port of upstream PR #947). Wiki null guards: `src/wiki.ts:149,163,220` (`?? ""` coalescing on `source_file`). |
| AC2 | `eef623a` | #1007 | `_norm_source_file` with `resolve()` for symlink safety | `src/semantic-cleanup.ts:39,91` (`normaliseStoredSourcePath` applies the same normalisation to stored `source_file` values). Symlink spot-check listed in F-0819-M. |
| AC3 | `3f8efae` | — | `graphify update` ghost nodes: `as_posix()` + relativize existing graph before eviction | `6e3b173` (relativized manifest keys, portable `as_posix`-style paths) + `8008dc6` (`src/portable-artifacts.ts:126-190` `source_file` normalization). Spot-check listed in F-0819-M. |
| AC4 | `d1d5751` | #1007 | watch: evict stale nodes in full re-extraction path when `changed_paths` is None | `src/watch.ts:206-214` wires `cleanupStaleNodes` (F-0816-M5 stale-node prune) after the existing-graph merge, independent of changed-path hints. |
| AC5 | `690b4e5` | #1094 | Cap obsidian/canvas filenames (ENAMETOOLONG on long labels) | `src/wiki.ts:36` — slug builder caps at `.slice(0, 200)`. |
| AC6 | `25df580` | #777 | Relativize manifest, `.graphify_root`, and cache `source_file` fields | Manifest keys: `6e3b173` (`saveManifest` writes project-relative keys, `tests/portable-artifacts.test.ts`). Graph `source_file`: `8008dc6` (`src/portable-artifacts.ts`). `.graphify_root`: no TS counterpart (grep empty) → n-a. **Residual to-verify**: semantic-cache payload `source_file` fields (`src/cache.ts`) — closed in F-0831-P2. |

##### to-verify — 1 commit + 2 sub-parts

| # | Upstream SHA | Issue | Subject | What to verify | Lot |
|---|---|---|---|---|---|
| V1 | `c09fbef` | #1006 | Remap hyperedges in community-aggregated meta-graph view | TS has hyperedges end-to-end (`tests/hyperedges.test.ts`) but no community-aggregated meta-graph view was found (grep `meta-graph|aggregat` empty in `src/export.ts`/`src/analyze.ts`). If the view doesn't exist, reclassify `n-a`; if a partial exists, port the remap. | F-0820-0827 |
| V2 | `80301a0` (part) | #994 | Punctuation search | Compare against the F-0816-P2 Unicode tokenizer lineage (`src/search.ts:32` routes non-`a-z` codepoints — digits, punctuation, CJK — to a separate path). Likely covered; needs a test to prove it. | F-0820-0827 |
| V3 | `25df580` (part) | #777 | Cache `source_file` relativization | Whether `src/cache.ts` semantic-cache payloads persist absolute `source_file` values (portability leak) — close with a test either way. | F-0831-P2 |

##### defer — 10 commits / 7 clusters (reopen condition cited)

| # | Upstream SHAs | Subject | Reopen condition |
|---|---|---|---|
| D1 | `065a621`, `68863a7` | Devin CLI platform support (#1020) | A Devin user asks; platform matrix decision. |
| D2 | `a8005c2` | Kilo Code platform support (#512) | Same as D1. |
| D3 | `dacbdb5` | BYOND DreamMaker support + `--mode deep` flag (#884, #1030) | Niche grammar with a tree-sitter-dm dependency; no TS requester. `--mode deep` is evaluated with it. (`cfc945a` dmi/dmm guards travel with this cluster — see n-a.) |
| D4 | `80301a0` (part) | Amp platform (#948) | Same as D1. |
| D5 | `c7a05d6`, `903fa9c` | Chinese query segmentation scope + `chinese` extra (#1026) | Needs a TS segmenter decision (no jieba equivalent); current CJK handling via the F-0816-P2 Unicode tokenizer. Reopen on CJK-user demand. |
| D6 | `fbe1e99`, `6137cdb`, `4a20015` | Progressive-disclosure skill split: generator + drift fence + references sidecar (#1121) | Python skillgen codegen tooling; TS skills are hand-maintained. Reopen if TS skill count makes hand-maintenance untenable. |
| D7 | `3a90ac2` | Query logging to `~/.cache/graphify-queries.log` (#1128) | Privacy posture decision required before logging user queries to a global file (opt-in design). |

##### n-a — 25 commits (Python-runtime / CI / packaging, grouped)

| Group | Upstream SHAs | Rationale |
|---|---|---|
| Python packaging/CI | `244a266`, `cddf47d`, `7c12499`, `adfe8f0`, `097b50a`, `4806c1e`, `250834a`, `1d4e112`, `830f039`, `1b21368`, `0cf596a`, `cb5e701`, `d5d49f3` | uv/pipx/tomllib/CI/test/gitignore plumbing of the Python repo; no TS analogue. |
| Python install/interpreter modes | `8e17973`, `c2de9fa`, `9db8694`, `88bb186`, `2d5a10c` | `.graphify_python` venv pointers, uv-aware detection, pip warnings, uv/pipx hook no-op — Python interpreter mechanics. (The *injection* angle of this family is P5.) |
| Python console/runtime | `31a608f` | Windows non-UTF-8 console crash; Node stdout is UTF-8. |
| Python internal refactors | `1dc5048`, `4b17f19` | Fold community labeling into `llm.py`; drop redundant labels-file write — internal structure, TS has a single write path (`persistCommunityLabels`). |
| Deferred-feature guards | `cfc945a` | zlib cap in `extract_dmi`/`extract_dmm` — travels with the deferred DreamMaker cluster (D3). |
| No-TS-surface fix | `d4e1d4b` | `pnpm-workspace.yaml packages:'.'` crash on Python 3.10 — TS has no pnpm-workspace parsing (grep empty) and no Python 3.10 YAML edge. |
| Merge plumbing | `aae027f`, `8a30851` | Merge commits of #1071/#1063; content classified at `0080fbd` (M8) and `379d35e` (M9). |

##### release-only — 23 commits (do not mirror)

| Group | Upstream SHAs |
|---|---|
| Version bumps / releases | `d9debdf` (0.8.19), `b07f0eb` (0.8.20), `43bf3c2` (0.8.22), `ffbe425` (0.8.23), `fd1aca4` (0.8.24), `a7a7322` (0.8.25), `55d7dad` (0.8.26), `3922235` (0.8.27), `345e112` (0.8.29), `724f1e3` (0.8.30), `7a588fb` (0.8.31) |
| Changelogs / README / badges | `e5313e7`, `740382a`, `a1706ff`, `efda79a`, `6a3b9e1`, `47042be`, `90286ab`, `631a6d4`, `b7a9b81`, `863f0c1`, `fff1c98` |
| Translations | `5056c72` (Filipino README) |

#### Bucket counts (104 commits)

`must-port (P)` = **4** • `must-port (M)` = **25** (of which **2 conditional on #996**: `32aa053`, `0080fbd`) • `to-verify` = **1** (+2 sub-parts) • `already-ported` = **10** • `already-covered` = **6** • `defer` = **10** (7 clusters) • `n-a` = **25** • `release-only` = **23**. Total = 104.

Deltas vs the pre-scan draft: P shrank 8→4 (`c50ffc2`/`46a1d4c` already-ported by PR #93; `25df580` largely already-covered by `6e3b173`/`8008dc6` with one cache residual; `80301a0` kept). M netted 26→25 after reconciliation (`66acfd8` already-ported by PR #87). The draft's ~13 already-covered + parts of its P bucket consolidate into 10 already-ported + 6 already-covered, all with proof. Defer grew 4→7 clusters (+DreamMaker, +Amp, +Chinese segmentation).

#### Proposed lots

Each lot is one (or a few) cohesive PR(s). The #996-conditional rows are excluded from all effort figures.

- **Lot F-0819-M — .NET project files + early-port closure** (~2–2.5 days).
  - `8bcfffd` .NET project file support (M1) **with** the `ad3f3b2` XML-DoS guard (P3) in the same PR.
  - Closure spot-checks of the early-port families: `eef623a` symlink normalisation (AC2), `3f8efae`/`d1d5751` ghost-node eviction paths (AC3/AC4) — one regression test each or explicit re-classification.
  **Proposed PR title:** `Track F-0819-M: .NET project extractors (XML-DoS capped) + #1007-lineage regression closure`.
- **Lot F-0820-0827-P+M — core window parity** (~6–9 days; split into 3–4 PRs at execution; spans `v0.8.20..head` for late M rows).
  - *Determinism & IDs*: M17 detect() sort, M18/M20 node-ID spec compliance (verify-first), M4 Dart stem IDs (~1.5 d).
  - *Communities*: M2 cluster-only remap, M19 ID stability, M22 auto-naming (verify-first) (~1.5 d).
  - *Extractors & graph correctness*: M3 MCP config, M16 circular imports, M21 interface-extends (verify-first), M25 Dart modernization, M5 builtin god-node filter, M6 memory/dedup/decorated trio, V1/V2 verifications (~2.5 d).
  - *Platforms / hooks / LLM*: M11+M12 antigravity, M23 uninstall tree (verify-first), M24 Read/Glob PreToolUse, M10 rapid-commit hook race, M9 claude-cli hollow-response (verify-first), M13 backend auto-detect (verify-first), M14 providers.json registry (paired with P4), M26 `GRAPHIFY_API_TIMEOUT` (~2.5 d).
  - *Conditional #996*: M7+M8 semantic contexts for 12 languages — **blocked on the F-0818-Opt scope decision**; if accepted, +3–5 d and the lot becomes the `0.11.0` driver together with the base #996 port.
- **Lot F-0831-P2 — security residuals not covered by PR #93** (~1.5–2 days).
  - P4 `e3993e4` provider `base_url` validation (lands with M14 registry), P5 `0fdfded` hook exec-quoting audit, P1 `80301a0` OpenCode path, P2 `.svh`, V3 cache `source_file` relativization residual of `25df580`. (P3 XML-DoS rides with F-0819-M.)
  **Proposed PR title:** `Track F-0831-P2: provider base_url validation + hook quoting + OpenCode/.svh + cache path residual`.

#### Version recommendation — **DECISION user**

Two release vehicles for the merged-unreleased train (PRs #87/#88/#93 + studio work) and this bilan's lots (`MEMORY.md > Cautious semver bumps` applies — do not burn numbers):

1. **Patch `0.10.1` (security-first)**: publish now with the already-merged F-0819-P1/P2 + F-0831-P1-security lots, optionally + F-0831-P2. Pure fixes, no schema/CLI change. Leaves the parity point at `v0.8.18` with documented early ports.
2. **Minor `0.11.0` (full window)**: after F-0819-M + F-0820-0827-P+M + F-0831-P2 land. New extractors (.NET, MCP config), `providers.json` registry and circular-import detection are additive features → minor semantics. Advances the closest audited parity point toward `v0.8.31` (modulo defers documented in the gap table). If #996 + M7/M8 are accepted, they fold into this same `0.11.0`.

Default recommendation: **ship `0.10.1` early** (security on npm now), then `0.11.0` at window closure. Owner decides.

#### Exit criteria (cadrage → execution)

- [ ] Owner ack on this classification (104 commits, buckets above) — corrections folded in before any lot starts.
- [ ] `git ls-remote` re-fetch + source-lock refresh at first lot execution (window may have moved past `fff1c98`; local tag anomaly `v0.8.23/24/25` re-verified).
- [ ] Lot F-0819-M merged (with XML-DoS guard) + #1007-lineage spot-checks closed.
- [ ] Lot F-0820-0827-P+M merged (3–4 PRs), verify-first rows resolved to port or already-covered-with-test.
- [ ] Lot F-0831-P2 merged (P4/P5/P1/P2/V3 closed).
- [ ] **DECISION user** recorded: #996 semantic-contexts scope (gates M7/M8).
- [ ] **DECISION user** recorded: release vehicle `0.10.1` vs `0.11.0`.
- [ ] `UPSTREAM_GAP.md` intake table + Version Alignment updated **at lot execution** (not in this cadrage PR — a concurrent docs PR owns the file right now).
- [ ] Release gate: smoke `graphify update` on this repo + `../public-domaine-mystery-sagas-pack` + `portable-check`; CHANGELOG entry citing this bilan.

#### Next bilan scheduled

Weekly cadence (next pass ≈ 2026-06-15) or triggered by: upstream movement past `fff1c98`, a `v0.8.32`+/`v0.9.x` tag, any security-tagged commit, or the #996 decision landing (reshapes M7/M8 and the `0.11.0` scope).
