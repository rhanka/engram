# Upstream Gap Table

This document tracks the delta between this TypeScript port and upstream Python Graphify.

## Scope

- Current TypeScript product branch: `main`
- Current TypeScript WP6 code baseline: `705ada4` (`@sentropic/graphify@0.17.2`; bounded MCP parity at `e34cdfe`, embedding-neutrality guard at `705ada4`)
- Current TypeScript package target: the pending, untagged `@sentropic/graphify@0.17.2` source version (npm `latest` remains `0.17.1` as observed 2026-07-22); publication is allowed only after the WP6 gates in `spec/SPEC_EVOL_WP6_PLATFORM_PARITY.md`
- Durable traceability spec: `spec/SPEC_UPSTREAM_TRACEABILITY.md`
- Closed upstream `v3` baseline: `upstream/v3` at `699e996`
- Closed Python parity target: remote tag `v0.4.23` at `8d908c5d43d079579604a82873fd7cff33a1b343`
- Closed Python drift target: `upstream/v4` at `5843ffc277c54766854f9201286c9647da095390`
- Closed Python `v5` parity line: remote `upstream/v5` at `f755aca58f36771923cebcc8f85f2eef6178a105`
- Closed Python `v6` parity line: remote `upstream/v6` at `f81e3bc2154d21062f56f9e4ec9f923dfe7d128e`
- Closed parity source lock for the `0.7.4` cycle: effective `upstream/v7` target `26a5a35200dda6207bf6fc16afed83c71238bb65`
- Closed parity target commit for `0.7.4`: `26a5a35200dda6207bf6fc16afed83c71238bb65` on `upstream/v7`, with feature commit `741ac3655bd33314e1aaca51e6fd30271c74c61b`
- Closed Python `0.7.10` drift lock: remote `upstream/v7` observed on 2026-05-08 at `0c29b2cb88c6274d889ca7c33a684ce103808715`, with remote tag `v0.7.10` at `ef1050b0e4134df0bd59956b0f900dc3c83e8184`
- Observed Python drift lock for the next pass: remote `upstream/v7` observed on 2026-05-12 at `ab32098063adb1ab4d9247747742958ad185db41`, with remote tag `v0.7.16` at the same commit
- Active CRG stable review reference: `tirth8205/code-review-graph` tag `v2.3.7` at `6a1ee1c` with `main` at `6ce25b4e53f9df397f5136e86a59e17c02a610fe` (observed 2026-07-22; additive reference, not a parity driver)
- Active Codeflow graph-UX reference: `braedonsaunders/codeflow` tag `v1` / `main` at `af3b0073f2b41c9f54938c6520509fd97d133803` (added 2026-07-09 for prettier/faster parametric graph rendering and stronger filtering UX; additive only, no npm parity impact — see `Codeflow intake (2026-07-09)` and `spec/SPEC_STUDIO_GRAPH_UX_CODEFLOW_PARITY.md`)
- Reference upstream (functional, no code ports — AGPL): `repowise-dev/repowise` tag `v0.34.0` at `741e129` with `main` at `210b8fa350359d867e0e1da24d6e79dd0b1f51d9`; see `Repowise Reference Intake (2026-07-06)` and the superseding WP6 disposition below
- Current source line: the pending, untagged `@sentropic/graphify@0.17.2`; npm `latest` is `0.17.1`. Historical version-alignment rows remain evidence for their own observed dates, while the 2026-07-22 WP6 section below is authoritative for current intake and release posture

## WP6 Coordinated Intake (2026-07-22)

This section supersedes older "current" locks and open-bucket summaries without
rewriting their historical evidence. Full decisions and acceptance live in
`spec/SPEC_EVOL_WP6_PLATFORM_PARITY.md`.

| Source | Current lock | Window reviewed | Adopt | Defer | Reject |
| --- | --- | --- | --- | --- | --- |
| Python Graphify (MIT) | `v8` `82c46e5358d5b3185b7d66573b52f01e59bd2d06`; stable `v0.9.23` `c83085cf` | `31211a0..82c46e5` = 230 commits | Bounded MCP line-list/traversal responses (`fef9dbb`, `deb2620`) and verified relation-site provenance slice (`1fbc623`), ported in `e34cdfe` | Atomic writer consolidation, cache/watch/partial-build integrity, update/ignore semantics, language/resolution clusters; each requires a bounded reproducer lot | Python packaging/release mechanics, Python-only runtime refactors, provider-specific embedding wiring |
| CodeReviewGraph (MIT) | `main` `6ce25b4`; stable `v2.3.7` `6a1ee1c` | `935695f..6ce25b4` = 226 commits | No direct port; summary, review-delta/analysis/eval, install preview, provenance, and query tools are already represented | Weighted impact radius, transitive-test lookup, churn risk, review-pr, additional languages, persisted flow tables | SQLite/daemon defaults, direct embedding baseline, editor parity, Python plumbing, reverted IBM Bob support |
| Repowise (AGPL-3.0) | `main` `210b8fa`; stable `v0.34.0` `741e129` | `6680c282..210b8fa` = 241 commits | Design-only refusal-over-fabrication and bounded-response principles; no copied/translated code | SCC/cycles, per-test maps, curated responses, no-LLM wiki, code health/dead code, git risk/provenance, tours, savings/context blocks | AGPL code/templates/constants, resident server/database/provider-key stack, provider routing, uncalibrated scores, core dollar ledger |

The four-commit Repowise tail `c47b8d4..210b8fa` adds honest deferred-workspace
reporting and no-provider `init`/template-wiki fallbacks (`#1000`–`#1003`). It
does not change the AGPL design-only disposition: the UX principles remain
deferred references, and no code, template, or provider stack is adopted.

### Source re-lock (2026-08-02) — the window is open, nothing is classified yet

All three sources have drifted since the 2026-07-22 lock. Observed by
`git ls-remote`, which is the standing authority; local tag pointers are never
used for a parity claim.

| Source | 2026-07-22 lock | Observed 2026-08-02 | Drift |
| --- | --- | --- | --- |
| Python `v8` (parity authority) | `82c46e5` | **`00efd6e7`** | **112 commits** |
| Python stable tag | `v0.9.23` `c83085cf` | **`v0.9.32`** `00efd6e7` | 9 releases |
| CRG `main` (additive ref) | `6ce25b4` | **`1a010dee`** | head moved |
| Repowise `main` (design-only) | `210b8fa` | **`008799a0`** | head moved |

**Every documented stable tag is confirmed unmoved**, which is worth stating
because this document has been bitten by a retag before. Verified by
dereferencing rather than by eye: for an annotated tag `git ls-remote --tags`
returns the *tag object* sha on `refs/tags/X` and the *commit* on
`refs/tags/X^{}`, so comparing the undereferenced line against a recorded commit
manufactures a phantom retag. Dereferenced: `v0.9.23` → `c83085cf` ✓,
`v2.3.7` → `6a1ee1c` ✓, `v0.34.0` → `741e129` ✓ (the latter is a lightweight tag,
and `vscode-v0.5.0` sits on that same commit — two tags on one commit, not a
rename).

First-pass shape of the 112-commit Python window, by conventional-commit prefix
(no merges):

| Prefix | Count |
| --- | --- |
| `fix` | 73 |
| `chore` | 18 |
| `test` | 11 |
| `docs` | 6 |
| `feat` | 2 |
| `refactor` | 1 |
| `perf` | 1 |

The 18 `chore` entries are release/bump-shaped and are the release-only
candidates. The actionable surface is therefore ~77 rows before any Python-only
exclusion.

### Per-commit census of `82c46e5..00efd6e7` (2026-08-02)

112 commits, no merges. 24 are `chore`/`docs` (release bumps, changelog, README)
and carry no TS obligation. The 88 remaining were read and bucketed below.

**What this census is, exactly.** Each row is classified from the upstream commit
subject and its issue refs, cross-read against the TS surface as this document
already records it. **No TS reproducer has been run for any row, and nothing here
is a decision to port.** A row in `port?` means "the subsystem exists in TS and
the described defect plausibly reproduces" — it is a candidate for a bounded lot,
not a verdict. Promoting any row requires the Track F cycle: a failing TS test
first, then the fix. The buckets are therefore `port?` / `must-audit` / `n-a`.

| Cluster | Count | Bucket | Commits |
| --- | --- | --- | --- |
| Node-id / path canonicalization | 8 | **`port?`** | `f6711336` absolute-path id-leak class, `4d9d64b2` out-of-root import targets, `d16510ed` regex-rescue targets, `8adb261d` legacy alias fold + absolute-derived semantic ids, `334cff61` portable stat-index keys, `c5d43271` cached-id re-anchor, `d91a987a` stamp `target_file`, `3c332ba7` `.tsx` parsed with TSX grammar (absolute-slug leak) |
| Module resolution | 1 | **`port?`** | `9be34595` honor `jsconfig.json` + `compilerOptions.baseUrl` |
| Query / CLI / explain | 4 | **`port?`** | `875c7df8` render every edge between visited nodes, `50be9dcd` recover direction from `_src`/`_tgt`, `2ca565ac` ambiguous name no longer resolves arbitrarily, `6d6b674b` preserve edge direction in merge-graphs |
| JS/TS extractor | 3 | **`port?`** | `d7cb5b1b` exported scalar bindings, `51b7b9f3` shadow closure params from `indirect_call`, `f6742bb6` exclude class refs from `indirect_call` |
| Perf / dedup | 2 | **`port?`** | `0c01da19` remove O(nodes × components) scan from remap construction, `e395ff9b` merge cross-file concept nodes on normalized label |
| Build / watch incremental | 9 | `must-audit` | `97656fae` tier-aware merge, `c2624787` + `e8436b41` inherit `directed`, `144a3ff8` manifest target dir, `2099873a` refuse overwriting unreadable graph, `6d42c48f` stale community labels, `137dcf23` `--no-cluster` merges, `498b76ba` viz cap, `2f78439f` raw edges-keyed graphs + alive-file pruning |
| Detect / ignore / manifest | 8 | `must-audit` | `1b93c086` + `1cdbf48c` prune scoping, `8046334f` `.env.example` templates, `7e955d22` UTF-8 BOM ignore files, `072698a1` + `06e59783` NFC manifest keys (macOS), `36b5e770` sensitive-file filter, `0d1f25c2` dead `.graphifyinclude` |
| Export / Obsidian | 2 | `must-audit` | `829224ac` all-dots label fallback, `f74c6326` leading-dot labels hidden |
| Serve / MCP bounds | 1 | `must-audit` | `b4865ffc` bound multi-project graph contexts (follow-up to the ported `9e7fbcb`) |
| Build robustness / labels | 2 | `must-audit` | `a2dc3d9c` coerce non-string node ids, `b1eadad0` normalize whitespace before truncating rationale labels (TS has `_extractJsRationale` from `6d3a6f1`) |
| Language extractors, grammar-gated | 18 | `must-audit` | ruby `00efd6e7`; C#/Kotlin `4a9613f7` (both in one commit) `f99f8d70` `0858954d`; Go `38684349` `773250ad`; Scala `6deb27f2`; Swift `d1f303e2` `33aa89c7`; SQL `c8163d83` `ffa2a247`; bash `44241dd1` `4710b864` `0019fc4d` `bdcae25a`; XAML `2da192db`; Python decorators `794cf9eb` `fbc24c7d` |
| Python runtime / packaging / hooks | 19 | **`n-a`** | MCP SDK 1.x/2.x + pip caps `576d5cbb` `50008cdf` `6d81a829`; bedrock/botocore `ffc6dc02` `a428378a` `d47f3ea1`; process pool `556e615c`; Windows/interpreter hooks `3bac3df6` `ca3113ac` `e1e041b0` `0da6929e` `cfe15f91`; install/skill paths `bdf62ce2` `bdb67885` `05ee5689`; skillgen `8658cc31` `65b81bfa`; misc `9eb76ace` `911d5817` |
| Test-only companions | 11 | *(follows its parent row)* | `1a7be303` `788c6488` `952b477a` `753a6ac2` `52e1ed40` `c18ec817` `6107f145` `8d8005b8` `eebf030f` `ce9ea7d7` `26cac419` — each is the upstream test for a `fix` already bucketed above (same issue refs); they carry no independent decision, but a lot that ports its parent should port its test too |

Roll-up: **18 `port?`** · **40 `must-audit`** · **19 `n-a`** · **11 test-only** ·
**24 release-only** = **112**.

**The counts are derived, not asserted.** They come from explicit per-sha lists
run through a partition check that fails loudly if any commit is missed or
double-counted; the check reports `112/112, total and disjoint`. This matters
because the first hand-written version of this roll-up was wrong on three of five
figures — it claimed 49 `must-audit` and 21 `n-a`, and omitted the test-only
category entirely. Counting 112 rows by eye across a dozen clusters is exactly
the kind of arithmetic that should never be trusted to a reading pass.

Two observations worth carrying into whichever lot comes first. The node-id /
path-canonicalization cluster is the largest coherent one and lands squarely on
code this document has just re-verified, so it is the natural first lot. And
`0c01da19` is the only row with a stated complexity claim (an O(nodes ×
components) scan removed from remap construction) — if it reproduces in the TS
remap path it is a performance defect rather than a correctness one, which
changes how it should be tested.

### Node-id lot resolved (2026-08-08): 7 of its 8 rows do not reproduce in TS

The node-id / path-canonicalization cluster was promoted above as the natural
first lot. It was then **instrumented before being ported**, on the Track F rule
that a fix for a defect which does not reproduce cannot be written as a failing
test. **Seven of the eight rows do not reproduce.** No port was made, and
therefore no node id moved.

Method: a baseline extraction over a stable pure-code corpus (372 nodes, 729
edges), then an adversarial corpus built to trigger each defect on purpose — an
out-of-root import `../../outside/shared`, a `.tsx` file, and an absolute scan
root. Observed with the shipped binary, not read from source.

| Row | Status in TS | Evidence |
| --- | --- | --- |
| `3c332ba7` `.tsx` absolute-slug leak | **does not reproduce** | ids emitted are `widget`, `widget_widget`, `widget_usewidget` — the TSX grammar is already selected, no slug leak |
| `f6711336` absolute-path id-leak class | **does not reproduce** | every id is a relative stem (`plain_plainfn`, `usesoutside_a`) even though the scan root is an absolute path |
| `d16510ed` regex-rescue target ids | **does not reproduce** | there is **no regex import-rescue path in TS at all**; on hard parse failure `extract` returns `{nodes: [], edges: []}`, and tree-sitter's error tolerance recovers the rest inside the AST — a deliberately malformed file still yielded `broken`, `broken_ok` and a correct `broken -> real` import edge |
| `d91a987a` stamp `target_file` | **not an id concern** | it sets an attribute, not an identifier |
| `8adb261d` re-key absolute-derived semantic ids | **no surface** | requires semantic nodes carrying absolute-derived ids; the published graphs contain zero, and a code-only extraction produces none |
| `334cff61` portable stat-index keys | **no-op cold** | cache-key change; identical output on a cold extraction |
| `c5d43271` cached-id re-anchor | **no-op cold** | same |

The eighth row is different in kind and is **not** reclassified:

`4d9d64b2` (out-of-root import/include targets) describes a **behavioural
divergence, not a shared bug**. Upstream canonicalizes the out-of-root target and
keeps it; TS **drops the edge entirely** — measured: the adversarial import
produced no import edge at all. Porting it would *add* nodes and edges rather
than repair malformed ones, which enlarges the graph surface. That is a **product
decision** (do we want out-of-root targets represented?) and it is flagged to the
owner as a future option, with the current TS behaviour as the default. It stays
`must-audit` and must not be ported by parity reflex.

The lot therefore closes as documentation plus one open product question, rather
than as the multi-day port it was projected to be. Nothing here says the upstream
fixes are wrong — they repair real defects in Python. It says the TypeScript
extractor built its ids differently and did not inherit that defect class.

The grammar-gated cluster stays `must-audit` for a reason recorded earlier in
this document: several optional tree-sitter WASM grammars are absent from this
sandbox, so those rows cannot be verified by live extraction here and must not be
classified by reading alone.

Embedding neutrality is specified but externally blocked. The published
`@sentropic/llm-mesh@0.10.0` and `@sentropic/llm-gateway@0.9.0` tarballs expose
generation/streaming and gateway routing only: no embedding request/response,
adapter operation, mesh operation, capability, hook, or gateway route exists.
Graphify therefore retains the injected `EmbeddingProvider` boundary and the
test guard at `705ada4`; it does not add direct Cohere/Ollama/provider SDKs or a
speculative gateway protocol. The exact published-contract gate is in the WP6
spec and Track blocker `01KY5D7FYNAHJ0GYDGMP8RF018`.

### Embedding-gate re-verification (2026-07-30): mesh has drifted, the gate has not

The 2026-07-22 evidence above was two minor versions stale. Re-measured against
the **published** registry, not a source branch:

| Package | 2026-07-22 lock | Observed 2026-07-30 | Embedding contract |
| --- | --- | --- | --- |
| `@sentropic/llm-mesh` | `0.10.0` | **`0.12.0`** (drifted) | still **absent** |
| `@sentropic/llm-gateway` | `0.9.0` | `0.9.0` (unchanged) | still absent |

Method: `npm pack @sentropic/llm-mesh@0.12.0`, unpack, and read every shipped
`dist/*.d.ts` plus `package.json` case-insensitively for `embed`. The tarball
ships `account-transports`, `adapter-auth`, `adapter-core`, `adapters`, `auth`,
`capabilities`, `catalog`, `errors`, `generation`, `index`, `mesh`, `messages`,
`providers`, `registry`, `streaming`, and `tools` declarations — there is no
`embedding.d.ts`. The only `embed` matches in the whole tarball are
`ToolResultEmbeddedResourceContent` / `type: 'embedded-resource'` in
`tools.d.ts`, which is an MCP tool-result content type and not an embedding API.

Measured against the six symbols the WP6 spec requires (§D3): no
`EmbeddingRequest`, no `EmbeddingResponse`, no `ProviderAdapter.embed`, no
`LlmMesh.embed`, no embedding capability metadata, no `operation: "embed"` hook.
Zero of six.

Disposition unchanged and deliberately so: the blocker
`01KY5D7FYNAHJ0GYDGMP8RF018` is **upheld**, the injected `EmbeddingProvider`
boundary stays, and no provider SDK is added. This row re-dates the evidence; it
does not close the gate. The `705ada4` guard was re-run at this observation on
`origin/main` `54d771ae`: `tests/storage-import-guard.test.ts`, 3/3 green,
including its positive control (the probe trips when the driver really loads, so
the assertions measure evaluation rather than passing vacuously).

The h2a evidence for this pass used the shared active root
`/home/antoinefa/h2a-workspace/.h2a`, conductor
`codex:graphify:46788d039b48`, and a live response from
`claude:llm-mesh:e5f8b95941e9` confirming the same external contract gap.
Concurrent temporal-storage and Studio changes were explicitly excluded and
preserved.

## Track F Residual Reconciliation (2026-07-25): Unicode Node Identity

This pass re-verified the open "Track F upstream parity residuals" leaf against
the **current** code rather than against the ledger's own claims, and closed the
one residual that was both genuinely unimplemented and squarely on graphify's
identity as a *generic multimodal* knowledge-graph product (French / Japanese /
Russian / Greek corpora, not ASCII source code only).

### Methodological caveat — this file has been audited with a broken tool

`grep` classifies `src/extract.ts` as **binary** and silently returns nothing
(`grep -c id src/extract.ts` → exit 1). Any audit of that file with plain
`grep` produces false negatives; `grep -a` is required. At least one prior
ledger claim below is consistent with having been written from such a false
negative. Treat "not found in `src/extract.ts`" in any earlier row as unproven
unless it was re-checked with `grep -a`.

### Row corrections

| Ledger row | Old claim | Verified reality (2026-07-25) |
| --- | --- | --- |
| `0.7.14` Unicode IDs `95e2c5e` (row in *Active `0.7.16` Drift Intake*) | `must-port` | **Claim was ACCURATE and still open.** `src/extract.ts` `_makeId` was byte-equivalent to upstream's pre-`95e2c5e` fold. **Now ported** — see below. |
| `0.8.14..0.8.16` Unicode/query row (`86109e9` #937, `020cca2` #964) | `must-port` | **STALE — both were already ported** in PR #62 (`c230eca`, `3254b2b`), shipped in `graphifyy@0.9.7`. Evidence: `src/build.ts` `UNICODE_NON_WORD` / `normalizedLabel` / ASCII-gated noise filter; `src/search.ts` `queryTerms`; tests `tests/build-cjk-label-dedup.test.ts`, `tests/serve-query-terms.test.ts`. Now `already-covered`. |
| Same row, `020cca2` (#964) sub-claim | implied fully covered by `0.9.7` | **Partially false.** The port landed in `src/search.ts` and on the MCP path, but the `graphify query` CLI command kept its own `split(/\s+/).filter(len > 2)`, re-applying the short-token gate to every script. Two-character CJK terms were still dropped on that path. **Fixed this pass.** |
| F-0818-M3 "constrained query expansion" (release table, `graphifyy@0.9.8`) | listed as shipped | **Misleading as written.** What shipped is *skill guidance* (prompt text instructing the host assistant to build `.graphify/.vocab.txt`). There is **zero engine-side query expansion** in `src/search.ts` / `src/retrieval/` / `src/serve.ts`; `src/skills/skill-claw.md` says so outright ("no stemming, no synonyms, no cross-language match"). Engine-side expansion remains genuinely absent. |
| Repowise #4 SCC / import-cycle detection | `Absent` | **Confirmed genuinely absent** (re-verified). No SCC pass over the graph and no SCC-capable graphology package installed. Near-miss for future readers: `src/ontology-hierarchies.ts` *does* run a Tarjan-style cycle detector, but only over ontology class parent/child arcs — never over `calls`/`imports` edges. Do not mistake it for coverage. |

### Closed this pass — Unicode node identity (`95e2c5e` / #811)

Measured on the pre-fix implementation:

```text
_makeId("doc", "日本語")     -> "doc"         // collides with the file node
_makeId("doc", "中文")       -> "doc"         // ...and with every other symbol
_makeId("notes", "café")     -> "notes_caf"   // composed U+00E9 dropped
_makeId("notes", "café")     -> "notes_cafe"  // decomposed e+U+0301 kept
_makeId("notes", "Évariste") -> "notes_variste"
```

| Upstream | TS change | Test | Status |
| --- | --- | --- | --- |
| `95e2c5e` (#811) Unicode IDs | new `src/node-id.ts` (`makeNodeId` / `normalizeIdPart`), consumed by `src/extract.ts` `_makeId` and its `src/extract-git.ts` twin | `tests/node-id-unicode.test.ts` | **ported + verified-local** (bug was live, incl. the prose `.md` path) |
| `95e2c5e` follow-through | `src/profile-registry.ts` `safeIdPart` + `src/entity-linking.ts` `registrySeedNodeId` | same | **ported + verified-local** (silent record loss: non-Latin registry ids collapsed and were dropped by the `seen` guard) |
| `020cca2` (#964) CLI leak | `src/cli.ts` `query` now uses the shared `queryTerms` | same | **ported + verified-local** (closes the gap left by the `0.9.7` port) |

Deliberate deltas, recorded rather than hidden:

- **`toLowerCase()` instead of `casefold()`** — JavaScript has no `str.casefold()`. This matches the convention already shipped by the `86109e9` port in `src/build.ts`. Residual: characters whose full case folding differs from simple lowercasing (German `ß`/`SS`, Greek final sigma `ς`/`σ`) do not fold together.
- **Combining marks are still dropped.** `[^\p{L}\p{N}_]` mirrors Python's unicode `\w`, and neither treats Unicode `M*` as a word character, so scripts carrying meaning in spacing marks (Devanagari matras, Thai vowel signs) remain degraded. Matching the parity source was preferred over a silent unilateral divergence. **Open residual.**
- **ASCII ids are byte-for-byte unchanged**, asserted in the test against the pre-fix implementation kept inline as an oracle. Only previously-broken non-ASCII ids move.

### Newly identified residuals — genuinely missing, deliberately deferred

Found while auditing this cluster; none is required by the increment above and
each needs its own bounded lot. Listed so the ledger stops under-reporting.

| # | Residual | Evidence | Why deferred |
| --- | --- | --- | --- |
| U1 | No NFC normalization before wiki/export filename slugging | `src/wiki.ts` `safeFilename`, `src/export.ts` `safeName` | An NFD-spelled and an NFC-spelled label are distinct JS strings, so `uniquePageRefs` applies no `_2` suffix, yet macOS APFS/HFS+ normalizes and the two files collide — silent overwrite. Filesystem-behaviour lot, needs a macOS reproducer. |
| U2 | Filename truncation counts UTF-16 code units, not bytes | `src/wiki.ts` `safeFilename` `.slice(0, 200)` | 200 CJK characters is ~600 UTF-8 bytes, past the 255-byte ext4/APFS limit; can also split a surrogate pair. Same lot as U1. |
| U3 | `cypherIdentifier` is ASCII-only | `src/export.ts` | A non-Latin ontology type (`人物`) or relation silently degrades to the `"Entity"` / `"RELATES_TO"` fallback, flattening the type system in the Cypher/Neo4j export. Needs a backtick-quoting decision, not a regex swap. |
| U4 | Citation grounding tokenizer is ASCII-only | `src/cite-grounding.ts` `tokenize` uses `/[a-z0-9]+/g` | Latin corpora are fine (`deaccent` runs first), but CJK citations cannot ground at all. Separate lot: the grounding substrate is Latin-first by construction. |
| U5 | Engine-side query expansion absent | `src/search.ts`, `src/retrieval/` | See the F-0818-M3 correction above. Product decision (delegated-to-assistant vs in-engine), not a port. |
| U6 | Residual ASCII-only folds outside identity | `src/ingest.ts`, `src/recommend.ts`, `src/agent-stats/discover.ts` | These build slugs/prefixes, not node identity, so no data is lost. Cosmetic; fold in opportunistically. |

## Drift Re-Scan (2026-07-06): Python `v0.9.7+1` And CRG `v2.3.6`

Observed on 2026-07-06 (upstream-intake wave, same pass as the Repowise intake below). Both reference upstreams **have drifted** since the 2026-07-01 census lock.

### Safi Python Graphify

- Previous lock: `upstream/v8` at `5190a4e` (= `v0.9.4-20`, 2026-07-01 census above).
- Re-fetched: `upstream/v8` advanced `5190a4e..31211a0` = **55 new commits**.
- New remote tags (authority `git ls-remote`, per standing source-lock rule): `v0.9.5` at `d89ec68af95e0cad801b56d88df383991e659823`, `v0.9.6` (annotated `254191a2`) at `29b3f9126d9347dcf40993f2f3c4101b1f3d4ab4`, and **upstream's own `v0.9.7`** (annotated `fdca07c5`) at `b699182a4fed5207c4e6a4aa4d3cd2f5f983590e`.
- **Tag-collision warning:** the 2026-07-01 census correctly recorded that `v0.9.7`/`v0.9.8` were *rhanka fork* release tags at that date. Upstream has now published its **own, different** `v0.9.7` (`b699182`), which the local fetch rejects (`would clobber existing tag`). The local `v0.9.7` ref remains the fork tag; never use local tag pointers for `0.9.7` parity claims — `git ls-remote upstream` only. `v1.0.0` (`0a31c08`) remains a non-target (unchanged).
- New upstream frontier: `v0.9.7 + 1` (`31211a0`, docs-only README overhaul).

**Grounding update superseding a 2026-07-01 census fact:** Lot 2 (language type/field/generic-arg `references` subsystem) is **already merged on `main`** (PR #258, collectors at `src/extract.ts:542-1071`). Type-ref follow-ups in this window are therefore small ports into an existing subsystem, no longer subsystem work. `indirect_call` (Lot 3) remains unstarted.

Per-bucket census (sums to 55):

| Bucket | Count | SHAs |
| --- | --- | --- |
| `port` | 21 | `92edf78` java-stdlib-suppression, `6d3a6f1` js/ts-rationale+ADR-refs, `2ab0867` shebang-routing, `6631af7` ruby mixes_in, `aa1bbda` case-insensitive suffix filter, `1288a55` no-cache-zero-node, `54825b6` skill/opencode fixes, `62b8eb1` import-evidence gating, `13e2bdd` ruby containers, `9b04022` kotlin `by` delegation, `2ba07e8` to_canvas guard, `4744dfe` ts/js receiver typing, `d56ee83` per-term BFS seeds, `eebc406` c# receiver calls, `3540416` decorator refs, `869aaf7` ts namespace nodes, `09aeb97` generator nodes, `1226c34` .mts/.cts, `9e7fbcb` multi-project MCP, `6e97088` query stopwords, `44c0a5e` swift singleton receiver |
| `must-audit` | 9 | `f917494` office/detect cache, `e2ef4ef` semantic hardening + phantom imports, `8d8d2b8` update rename reconcile, `cf4b4ef` scan-root source_file, `62f49ba` cluster-only sidecar, `009a98b` symlink containment, `9811def` import-equals (likely covered), `1256d65` hook stall (likely covered), `b70a6d7` merge-graphs mixed types |
| `n-a` | 3 | `7d463c9` pascal pip-extra packaging, `21294f0` upstream skill-snippet utf-8, `32ff6d6` claude-cli subprocess backend (TS no-key path is skill/assistant by design) |
| `defer` | 3 | `94392de` import-cycle report fix (TS has no cycle report), `5ffa921` pg-introspect Windows URIs (no TS pg_introspect subsystem), `53c769d` Apex extractor (language not in TS surface) |
| `release-only` | 19 | `31211a0`, `b699182` (0.9.7), `29b3f91` (0.9.6), `d89ec68` (0.9.5), `dd8c24c`, `f2b81a9`, `a4d4533`, `5cfd7d9`, `d7aafb0`, `b06c55e`, `21b52e1`, `d9f97b9`, `3140b2e`, `9fea1a4`, `983da3c`, `5737388`, `53638d4`, `412a29d`, `41ce87e` |

Highlights with verified TS evidence (from this pass's audit):

- `aa1bbda` **reproduces in TS today**: `collectFiles` filters with raw `extname(entry)` against `_EXTENSIONS` (`src/extract.ts:6339`) while dispatch lowercases (`:6168`) — capitalized/mixed-case extensions are silently skipped.
- `54825b6` — 2 of 3 bugs reproduce verbatim: `src/skills/skill-windows.md:2` ships `name: graphify-windows` yet installs into `.claude/skills/graphify/` (`src/cli.ts:594-597`); the opencode plugin prepends its reminder with `&& ` (`src/cli.ts:754-756`).
- `e2ef4ef` (#1638 slice) — confirmed TS-exposed phantom-import collision: unresolved bare npm imports fall back to `_makeId(moduleName)` (`src/extract.ts:459-461`).
- `2ba07e8` — TS `toCanvas` reads `G.getNodeAttribute(member)` with no `hasNode` guard (`src/export.ts:982-996`).
- `d56ee83` — TS `toolQueryGraph` takes global top-3 seeds (`src/serve.ts:348`), no per-term seed diversity; `6e97088` — `queryTerms` keeps "what"/"how" filler terms (`src/search.ts:26-49`).

Lot roll-up of the 30 actionable rows:

| Lot | Rows |
| --- | --- |
| Lot 2 follow-ups (subsystem now merged, #258) | `92edf78`, `3540416` |
| Lot 4 build/update/cache/detect hardening | `1288a55`, `f917494`, `8d8d2b8`, `cf4b4ef`, `009a98b` |
| Lot 5 LLM/export robustness | `2ba07e8`, `e2ef4ef` |
| Lot 6 cross-file/member resolution + cluster | `6631af7`, `62b8eb1`, `13e2bdd`, `4744dfe`, `eebc406`, `44c0a5e`, `62f49ba` |
| New-lot: dispatch/collect parity | `2ab0867`, `aa1bbda`, `1226c34` |
| New-lot: JS/TS extractor parity | `6d3a6f1`, `869aaf7`, `09aeb97`, `9811def` |
| New-lot: serve/query parity | `d56ee83`, `6e97088`, `9e7fbcb` |
| New-lot: skill/install parity (2 bugs live in TS today) | `54825b6` |
| New-lot: inheritance follow-up (Lot-1 style) | `9b04022` |
| Unassigned must-audit (likely covered, test-confirm) | `1256d65`, `b70a6d7` |

Honesty caveats (unchanged from prior passes): optional tree-sitter WASM grammars (kotlin, swift, c#, ruby, objc) are absent in this sandbox — language-gap rows were verified by reading `src/extract.ts`, not by running extraction; `9811def`/`1256d65`/`b70a6d7` look already-covered but are kept `must-audit` pending test confirmation. (2026-07-06 port pass correction: `tree-sitter-ruby` WASM **is** present in this sandbox — the ruby ports below were verified by live extraction; kotlin/swift/c# remain absent.)

### Method re-audit (2026-07-30): the "verified by reading `src/extract.ts`" rows were unproven

The caveat immediately above states that language-gap rows were *verified by
reading* `src/extract.ts`. That verification method was **invalid**, so every
row established that way was neither true nor false but **unproven**. This
section re-verifies them. It supersedes nothing factual above; it supplies the
proof that was missing.

**Root cause, measured — and narrower than "ugrep is not GNU grep".** The
`grep` an agent runs in this harness is a shell function wrapping ugrep 7.5.0
with a fixed flag set that includes **`-I`** (skip binary files). `src/extract.ts`
carries 2 NUL bytes at offsets 241837 and 241847 — inside a template literal on
line 6555, where they read as ordinary spaces. Consequence on `origin/main`
`54d771ae`:

| Probe on `src/extract.ts` | stdout | exit |
| --- | --- | --- |
| `grep -n _makeId` (wrapper) | *nothing* | 1 |
| `grep -c _makeId` (wrapper) | *nothing* | 1 |
| `grep -l _makeId` (wrapper) | *nothing* | 1 |
| `grep -rn _makeId src/` (wrapper) | file silently missing from results | 1 |
| `grep -an _makeId` (wrapper, `-a`) | 151 matches | 0 |
| `command grep -c _makeId` (bare ugrep) | 151 | 0 |
| `command grep -Ic _makeId` (bare ugrep, `-I`) | 0 | 1 |

Bare ugrep reads the file correctly; `-I` alone destroys the result. The failure
is total across every mode, emits nothing on stderr — not even GNU's "binary
file matches" — and the recursive form is the worst case, since it succeeds on
every other file while dropping this one. Any "not found in `src/extract.ts`"
conclusion reached without `-a` is therefore unproven.

Two corrections to how this trap has been described. First, `git ls-files --eol`
**does** flag this file (`i/-text w/-text`), so git was not fooled here even
though the NULs sit far past its 8000-byte sniff window; the claim that git saw
plain text while grep stayed mute does not hold for `src/extract.ts` as measured.
Second, the operative rule is unaffected and is stated on effect, not cause:
**always `-a`, and never conclude an absence without it.**

**Scope.** Five files still carry NUL on `origin/main` — `src/extract.ts` (2),
`src/ontology-class-hierarchies-emitter.ts` (4), `src/ontology-studio.ts` (2),
`src/search-index-emitter.ts` (1), `tests/sanitize-metadata.test.ts` (2). Only
`src/extract.ts` is cited by this document (25 citations), so rows grounded in
the other four are **not concerned**. Rows grounded in NUL-free files are also
not concerned: their greps did not lie.

**Result — 16 assertions re-probed with `grep -a`, 16 confirmed.** (This line
read "15 confirmed, 1 refuted" until 2026-08-01; the refutation was mine and it
was wrong — see the correction after the table.)

| Row | Assertion re-probed | Verdict |
| --- | --- | --- |
| 284 | project-relative ids via `qualifiedFileStem` | confirmée (25 hits) |
| 289 | `resolveJsImportTarget*` present | confirmée (7 hits) |
| 289 | tsconfig alias loader present | confirmée (15 hits) |
| 283 | post-extract cross-file resolution pass exists | confirmée (2 hits) |
| 269/307 | `extractGroovy` exists and emits `inherits` + `implements` | confirmée |
| 105 | ruby `mixes_in` (`6631af7`) | confirmée (2 hits) |
| 105 | kotlin `by` delegation (`9b04022`) | confirmée (7 hits) |
| 105 | `extractPowershell` (`a129ff2`) | confirmée (2 hits) |
| 105 | `extractObjc` (`cd3a376`) | confirmée (3 hits) |
| 105 | import-equals already covered (`9811def`) | confirmée (corrigé le 2026-08-01 — voir ci-dessous) |
| 117 | `_SHEBANG_DISPATCH` + `_getExtractor` (`2ab0867`) | confirmée |
| 84 | `collectFiles` (`aa1bbda`) | confirmée (3 hits) |
| 86 | `_makeId` (`e2ef4ef`) | confirmée (151 hits) |

**CORRECTION (2026-08-01) — the refutation was wrong, and it is worth reading
why.** This section previously claimed `9811def` (import-equals) was *not*
covered, on the strength of seven spellings returning zero matches under `-a`:
`import_equals`, `ImportEquals`, `importEquals`, `import_alias`,
`import_alias_declaration`, `import_require`, `TSImportEquals`. The zero matches
were real. The conclusion drawn from them was not.

Measured against the parser instead of against a guess:

```text
import fs = require("node:fs");   ->  import_statement > import_require_clause
import Alias = Foo.Bar.Baz;       ->  import_alias
import { x } from "./m";          ->  import_statement > import_clause
```

`import_alias_declaration` **is not a node in tree-sitter-typescript at all**, so
searching for it could only ever return nothing. The real node for the module
form is a plain `import_statement`, which `_TS_CONFIG.importTypes` already
contains, so the construct reaches `_importJs`, whose `readStringSpecifier`
recurses into `import_require_clause` and finds the specifier. Verified at the
render, not in the source — a four-file fixture extracted through
`extractWithDiagnostics` emits:

```text
import helper = require("./helper")   ->  viarequire --imports_from--> helper  @L1
import { helped } from "./helper"     ->  viaplain  --imports_from--> helper  @L1   (control)
```

The file-level import edge is identical for both forms. The plain form
additionally emits a symbol-level `imports` edge because it names a specifier;
the `require` form binds the whole module and has no specifier to name, so no
symbol edge is expected. `import Alias = NS` (node `import_alias`) emits no
import edge, which is correct here — it aliases a namespace, not a module, so
there is no module target to point at. Whether upstream emits anything for that
third form is **not verified** and is not claimed either way.

The row was in fact closed on 2026-07-06 by the port wave `5cb21e75` (#270) and
pinned by `tests/extract-ts-import-equals.test.ts`, which is green at
`4178a51a`; the port-wave table later in this document already recorded it as
"already-covered, test-pinned" with the same `readStringSpecifier` mechanism.

**Two compounding mistakes, both mine, both instructive.** First, I concluded an
absence from a vocabulary I never validated — the `-a` rule fixes grep's
blindness to NUL bytes, but nothing protects against searching diligently for a
symbol that does not exist. An absence is only evidence once the search term is
known to be the right one; against a grammar, that means asking the parser.
Second, I anchored on the 2026-07-06 honesty caveat and never grepped this
document for `9811def` itself, which would have surfaced the closing row
immediately. A re-audit that does not read the whole ledger repeats its gaps.

**Disposition: `9811def` is already covered and test-pinned. No port is
required. The `must-audit` reopening is withdrawn, and the 2026-07-06
classification stands as originally written.**

**Line references that have drifted** (a provenance defect, not a wrong claim —
the assertions above all still hold, only the coordinates are stale): row 261
describes the extractor as "5.4k lines" where `src/extract.ts` is now 7063; row
307 cites `extractGroovy` at `:2827-2837` where it is defined at `:4091`; row 84
cites `collectFiles` at `:6339` where it is at `:6622`. Line-anchored citations
in this document should be read as of their own pass date.

The probe is replayable and was kept out of the repo: it lives in the WP6
scratch worktree as `reaudit-extract-claims.sh`, takes the worktree root as its
only argument, and is read-only.

**Re-validated at `4178a51a` (2026-08-01). The trap is closed; the finding is
not.** The section above was measured against `origin/main` `54d771ae`. Two
trains have since landed, one of them the NUL hygiene work, so the probe was
replayed against the new baseline. Three things are now true at once and should
not be confused:

1. **The tooling trap is gone for this file.** `src/extract.ts` carries **zero**
   NUL bytes at `4178a51a`, and so does every other file under `src/` and
   `tests/`. The wrapper `grep` now reads `src/extract.ts` correctly without
   `-a`, and `tests/source-nul-hygiene.test.ts` is merged and green, so a
   regression would be caught. The probe table above documents a condition that
   was real on `54d771ae` and is no longer reproducible on `4178a51a`.
2. **The audit result is unchanged.** All 16 assertions were re-probed on the
   new baseline. `src/extract.ts` moved by 11 insertions / 10 deletions in
   between, which shifted the reported lines by one and changed nothing else.
3. **The one row this pass had reported as refuted is not refuted** — it is
   already covered, and the refutation was mine. The seven import-equals
   spellings do return zero matches at `4178a51a`, but the node they search for
   does not exist in tree-sitter-typescript, so those zeros never meant what
   they were read to mean. `9811def` was closed on 2026-07-06 by `5cb21e75`
   (#270) and is pinned by `tests/extract-ts-import-equals.test.ts`. The full
   parser and render evidence, and the two mistakes behind the false positive,
   are recorded in the correction that follows the re-audit table above. The
   pass therefore stands at **16 confirmed of 16**, with no open port.

The method rule survives the fix and is not weakened by it: `-a` always. The
NULs were removed from this repo, not from the world, and the wrapper still
passes `-I`.

### Closed this pass — 2026-07-06 port wave (WP6 upstream-ports branch)

Verified-local = regression test ran green in this sandbox; CI-only = integration test soft-skips locally (optional grammar absent) and asserts where the grammar installs.

| Upstream | TS change | Test | Status |
| --- | --- | --- | --- |
| `aa1bbda` case-insensitive suffix filter | `collectFiles` + dispatch lowercase fallback, `src/extract.ts` | `tests/language-surface.test.ts` | **ported + verified-local** (bug was live) |
| `54825b6` skill/opencode fixes (2 of 3 slices) | `src/skills/skill-windows.md` name, opencode `;` separator `src/cli.ts` | `tests/skills.test.ts`, `tests/opencode-integration.test.ts` | **ported + verified-local** (bugs were live; #1657 report slice n/a — no Import Cycles section in TS) |
| `e2ef4ef` (#1638 slice) phantom bare-import ids | ref-namespaced external-import fallback, `src/extract.ts` | `tests/extract-phantom-external-import.test.ts` | **ported + verified-local** (bug was live) |
| `2ba07e8` to_canvas guard | member `hasNode`+filename filter in `toCanvas`, `src/export.ts` | `tests/public-api.test.ts` | **ported + verified-local** (bug was live; toObsidian half n/a) |
| `2ab0867` shebang routing | `_SHEBANG_DISPATCH` + `_getExtractor`, `src/extract.ts` | `tests/extract-dispatch-parity.test.ts` | **ported + verified-local** |
| `1226c34` `.mts`/`.cts` | detect + dispatch + TS grammar + import candidates | `tests/extract-dispatch-parity.test.ts` | **ported + verified-local** |
| `6e97088` query stopwords | `QUERY_STOPWORDS`/`dropQueryStopwords` (`src/search.ts`), query paths only | `tests/serve-query-terms.test.ts` | **ported + verified-local** (index side intentionally unfiltered) |
| `d56ee83` per-term BFS seeds | exported `pickSeeds` (`src/serve.ts`), MCP top-3 + CLI top-5 | `tests/serve-seed-diversity.test.ts` | **ported + verified-local** (unit + MCP e2e) |
| `9e7fbcb` multi-project MCP | optional `project_path` on every tool, per-graph store cache | `tests/serve-multi-project.test.ts` | **ported + verified-local**; deliberate delta: strict default-graph startup kept |
| `92edf78` java stdlib suppression | `_JAVA_BUILTIN_TYPES` in `_javaCollectTypeRefs` | `tests/extract-type-references.test.ts` | **ported + verified-local** |
| `3540416` TS/JS decorator refs | `_tsEmitDecoratorEdges` in the class branch | `tests/extract-ts-decorators.test.ts` | **ported + verified-local** (abstract classes follow the pre-existing classTypes gap) |
| `869aaf7` TS namespace/module nodes | `_tsExtraWalk` (internal_module/module) | `tests/extract-ts-namespace.test.ts` | **ported + verified-local** |
| `09aeb97` generator nodes | `generator_function_declaration` + `_JS_FUNCTION_VALUE_TYPES` | `tests/extract-ts-generators.test.ts` | **ported + verified-local** (also closes `const x = function(){}`) |
| `6d3a6f1` JS/TS rationale + ADR/RFC refs | `_extractJsRationale` post-pass; `doc_ref` file_type | `tests/extract-js-rationale.test.ts` | **ported + verified-local** |
| `1288a55` zero-node cache guard | `_shouldCacheExtraction` gate + warning | `tests/extract-cache-zero-node.test.ts` | **ported + verified-local** |
| `9b04022` kotlin `by` delegation | full kotlin delegation_specifier branch (TS had none) + `_kotlinUserTypeName` | `tests/extract-kotlin-delegation.test.ts` | **ported**; helper unit verified-local, integration **CI-only** (kotlin WASM absent) |
| `13e2bdd` (#1640 slice) ruby containers | `module` classType; Struct.new/Class.new/Data.define synthesis + inherits | `tests/extract-ruby-containers.test.ts` | **ported + verified-local** (ruby WASM present) |
| `6631af7` (#1668 slice) ruby mixes_in | include/extend/prepend scan in class/module body, stub targets | `tests/extract-ruby-containers.test.ts` | **ported + verified-local** |
| `9811def` import-equals | none needed — `readStringSpecifier` recurses | `tests/extract-ts-import-equals.test.ts` | **already-covered, test-pinned** |

Deferred from the 21-port bucket — all blocked on the same absent subsystem (cross-file member-call resolution / receiver typing; TS has no `resolve_*_member_calls` analog at all): `4744dfe` (extends the #1316 JS receiver-type table), `eebc406` (C# receiver calls), `44c0a5e` (Swift singleton receiver), `62b8eb1` (import-evidence gate on the #1553 single-candidate resolver — the phantom-edge failure mode does not exist in TS because that resolver is absent; the gate becomes relevant when the resolver lands), plus the `13e2bdd` #1634 constant-receiver slice and the `6631af7` #1669 affected-seeding slice (TS has no `affected` command). These form one coherent next structural lot alongside Lot 3 `indirect_call` (still unstarted).

### Codeflow intake (2026-07-09) (`braedonsaunders/codeflow`)

Remote check on 2026-07-09:

```bash
git ls-remote --heads --tags https://github.com/braedonsaunders/codeflow main refs/tags/v1
# af3b0073f2b41c9f54938c6520509fd97d133803 refs/heads/main
# af3b0073f2b41c9f54938c6520509fd97d133803 refs/tags/v1
```

Status: `needs-review` / opportunity, principal-set as a **hard graph-UX parity target** (2026-07-09). Additive graph-UX reference — NOT a Python Graphify parity source and NOT a release-version driver; no code copied (confirm licence before any reuse). The full requirement lives in `spec/SPEC_STUDIO_GRAPH_UX_CODEFLOW_PARITY.md` and is seated in track under the `Renderer & Views` WP (`01KW89F1EGCH2MZXDAY9T8D6D4`, item `01KX4HFAWA726WEDD1HFRTXQRZ`).

| Area | Why it matters locally | Follow-up |
| --- | --- | --- |
| Parametric layouts | Codeflow ships Force/Radial/Layers/Grid/Metro with live Spread+Links sliders, very fast. | Add `radial`/`grid`/`metro` engines to the `@sentropic/graph` layout registry (force + Variant A already exist). |
| Animated dynamics | Codeflow animates node positions on layout/slider change; graphify paints one static frame. | Interpolate the existing `PositionFrame` stream on the shipped WebGL2 renderer — the headline gap. |
| Color-by | Folder / Layer / **Churn** (continuous scalar heat). | Add a continuous scalar colour axis (sequential ramp) beyond categorical buckets. |
| Filtering UX | User feedback: filtering may be more functional. | Audit filter primitives against Studio facets / group filters. |
| Integration boundary | Keep Graphify generic and TypeScript-first. | Design/reference input only unless a later spec adopts concrete behavior. |

### CRG recheck (`tirth8205/code-review-graph`)

- Previous lock: `v2.3.3` at `52cf3bc63ee77c8b204fb809791a5f212e83a2de` (Scope + Source Lock Notes).
- `git ls-remote --tags` now shows `v2.3.4` (`26cd1ab2`), `v2.3.5` (`f81c67ff`), `v2.3.6` (`935695f8`), plus a first VS Code extension tag `vscode-v0.2.1` (`36777165`). Delta `v2.3.3...v2.3.6` = **46 commits** (GitHub compare API).
- Skim of the meaningful review-features in the window:
  - `feat: GitHub Action for risk-scored PR review comments` — the one genuinely interesting review-surface feature; classify `defer / opportunity` for the `review-delta`/`pr` lane (a CI-bot packaging of what `graphify review-analysis` already computes locally).
  - `feat: config-driven custom language support (bring your own language)` — `defer / opportunity`; our extractor is code-driven (`src/extract.ts`), a config-driven extension lane would be a separate spec.
  - `feat: deterministic eval pipeline, multi-hop benchmark, search lift` + `feat(eval): honest benchmark story` — CRG-internal eval infra; `n-a` (graphify has `review-eval` and `benchmark` CLI surfaces already; nothing to port, methodology worth reading).
  - `feat: real-time Token Savings panel` + `feat: add estimated context savings` — CRG dashboard UX; `n-a` as UI, but note the convergence with the repowise counterfactual-savings row (#2 of the Repowise adoption table below): two upstreams now ship savings accounting.
  - Remaining ~40 commits: CRG-internal fixes (daemon PID checks, SQLite/FTS transactions, embeddings provider validation, stdin draining, release/infra) — `n-a` under the standing `deferred / intentional-delta` posture on CRG daemon/SQLite infrastructure.
- New stable CRG reference going forward: `v2.3.6` at `935695f800f2b02e71aae6d463f3df65f0c6493e`. No CRG feature adoption in this pass.

## Repowise Reference Intake (2026-07-06)

New reference upstream added by the principal alongside Safi Python Graphify and CRG: `repowise-dev/repowise`, observed at `6680c2822a64ee2c0bc53c196fe7a321df9aaf8a` (one commit past tag `v0.27.0`, 2026-07-05), cloned for audit at `.graphify/scratch/clones/repowise`. ANALYSIS-ONLY intake — no port in this lot; the deliverable is this table plus `spec/SPEC_EVOL_CURATED_RESPONSES.md`.

> **License wall (hard rule for every row below):** repowise is **AGPL-3.0** (dual-licensed with a hosted commercial layer, `docs/COMMERCIAL.md`); this repo is MIT. Every `adopt`/`must-audit` bucket below means **design-level adoption only** — re-design from the functional description, never copy or translate repowise code.

### What repowise is (functional summary)

A local-first "codebase intelligence" engine (Python core + FastAPI server + Next.js dashboard + VSCode extension + Claude Code/Codex plugins) that indexes a repo once into **five intelligence layers** — Graph (tree-sitter, 15 languages, two-tier file+symbol graph, Leiden/PageRank/betweenness/SCC, framework route→handler edges), Git (hotspots, ownership/bus-factor, co-change pairs, Kamei change-risk, agent provenance), Docs (LLM wiki with confidence/freshness decay), Decisions (ADR mining from 8 sources with an exact/fuzzy/unverified verification gate), Code Health (25 deterministic markers calibrated against a real defect corpus) — persisted in SQLite/Postgres via SQLAlchemy+alembic (`packages/core/src/repowise/core/persistence/models.py`), and served to agents through ~10 task-shaped MCP tools whose responses are **curated answers** with counterfactual token-savings accounting. Pipeline: `packages/core/src/repowise/core/pipeline/orchestrator.py:155`. The enterprise security/compliance layer (CVE, SBOM, SSO/RBAC, PR bots) is hosted-only and absent from the OSS repo — the OSS core itself is complete and runs fully offline (Ollama path).

Architectural affinities with this repo worth naming: files-first local mode, offline/no-LLM default for all deterministic layers, curation as **sidecar overlays over an untouched base graph** (`kg_node_meta`: "the AST graph's `graph_nodes` rows are untouched"), and refusal-over-fabrication answer gating — all four match standing graphify invariants.

### Feature-by-feature adoption table

Buckets: `adopt` (design-level, sketch + cost given) / `must-audit` (compare against existing TS surface first) / `n-a` (covered, intentional delta, or commercial) / `defer` (real feature, product decision needed). Repowise paths relative to the clone; graphify paths relative to repo root.

| # | Repowise feature | What it does | Graphify equivalent today | Bucket | Adoption sketch / cost |
| --- | --- | --- | --- | --- | --- |
| 1 | **Curated responses stack**: `get_answer` one-call RAG (`mcp_server/tool_answer/`), confidence gating (hedge detector + value-grounding, `tool_answer/confidence.py`), `answer_cache` keyed by question-hash (`models.py:1063`), `human_notes` surviving regeneration (`models.py:123`), `corrections` CLI (`commands/corrections_cmd.py:29`) | Persisted, provenance-stamped Q&A over the generated corpus; low confidence degrades to excerpts instead of prose | `answer` CLI `src/cli.ts:5601` + MCP `answer_graph` `src/serve.ts:905` + `src/retrieval/answer-pack.ts` (`answer:null` offline seam, #192); citations `src/citations.ts`; no cache/ledger, no human-curation slot | `adopt` | Full design sketch in `spec/SPEC_EVOL_CURATED_RESPONSES.md` (3 targets: code corpora / aclp-am / nc-fullstack). Cost **M** + **S** authoring CLI |
| 2 | Counterfactual savings accounting: every MCP answer logs the raw exploration it replaced (`mcp_server/_savings/counterfactual.py`, `recorder.py` incl. dead-ends), `saved`/`costs` dashboards | Honest per-tool token/$ savings ledger priced at the agent's model | `src/agent-stats/stats.ts:38` `costWeightedTokens` (spend, not savings); `src/report.ts:147` | `adopt` | Log per-call `replaced_tokens` estimates on the MCP serve path into agent-stats. Independent mini-lot, cost **S** |
| 3 | Deterministic CLAUDE.md/AGENTS.md generation (`commands/claude_md_cmd.py:20`, no LLM) | Managed repo-context block (entry points, hotspots, modules) regenerated on sync | Skill installs write trigger docs (`src/skill-install.ts`, `src/cli.ts:2279+`) but no graph-derived context block | `adopt` | Emit a managed block from `summary`/`GRAPH_REPORT` data into CLAUDE.md on `hook-rebuild`; no-key by construction. Cost **S** |
| 4 | SCC / import-cycle detection (`graph_node_membership`, `models.py:295`; surfaced in conformance + dashboards) | Tags strongly-connected components; powers cycle warnings | Absent — no SCC/cycle pass in `src/analyze.ts` (BFS/shortest-path only) | `adopt` | Tarjan over the Graphology graph in `src/analyze.ts`, surface in `graph_stats`/`review-analysis` cycle warnings. Cost **S** |
| 5 | Hybrid search auto-routing by query shape: identifier→symbols, path→file pages, prose→semantic, mixed→hybrid (`mcp_server/tool_search.py:543`) | One search tool that classifies the query instead of forcing mode flags | `src/retrieval/query.ts` (BM25F+RRF+PPR), `src/search-index.ts`; no query-shape routing | `must-audit` | Add shape classifier in front of existing retrieval lanes. Cost **S/M** |
| 6 | Kamei/JIT change-risk model on git features: lines±, entropy, subsystems, author experience, is_fix (`analysis/change_risk`, `git_commits` `models.py:473`, `docs/CHANGE_RISK.md`) | 0-10 defect-risk score per commit/range, PR directives (`will_break`, `missing_tests`) | `src/detect-changes.ts:185` `computeRiskScore` (structural, graph-based; no git-history features) | `must-audit` | Compare feature sets; git-mined features (churn/entropy/experience) would enrich `review-delta`/`review-analysis`. Cost **M** |
| 7 | Agent provenance from git (`git_commits.agent_name`/`autonomy_tier`, `git_metadata` rollup) | Attributes commits to AI agents from commit trailers/heuristics | `src/agent-stats/correlate.ts` correlates real transcripts↔git/PRs — richer signal than commit heuristics | `must-audit` | We are ahead on mechanism; audit their commit-classification heuristics as a fallback lane when transcripts are absent. Cost **S** |
| 8 | Per-call LLM cost ledger (`llm_costs`, `models.py:835`; `costs` cmd) | Every pipeline LLM call records model/operation/tokens/$ | Agent-transcript accounting only (`src/agent-stats/`); pipeline calls not individually ledgered | `must-audit` | Emit cost rows from `src/llm-execution.ts` dispatch into state; join with provider pricing (`src/provider-registry.ts`). Cost **S** |
| 9 | Knowledge Map: curated layers + sub-groups + guided tour steps (`models.py:1088-1139`), entry-point ranking (`kg_project_meta`), per-node curated type/summary/tags overlay (`kg_node_meta`) | Machine-curated presentation overlay; base graph untouched | Scene hierarchies sidecar 2 lanes validé/proposé (`src/scene-hierarchies.ts`, WP4 G2), Studio group-by; no tour, no entry-point ranking | `must-audit` | Tour-steps + ranked entry points map naturally onto the hierarchy sidecar + Studio; feed the curated-responses lifecycle (§3 of the spec). Cost **M** |
| 10 | `get_context` batch context: docs summary + ownership + freshness + co-change + decisions per target, `include=` facets, skeleton rendering (`mcp_server/tool_context/`, `docs/MCP_TOOLS.md`) | One call replacing several file reads; token-budgeted skeletons from persisted symbol bounds | `query_graph`/`get_node`/`get_neighbors` (`src/serve.ts:874-965`), `review-context` (`src/cli.ts:5191`); no ownership/freshness facets, no skeleton | `must-audit` | Facet-style `include=` on `get_node`/`answer_graph` is cheap; skeletons need persisted symbol bounds (extract already has spans). Cost **M** |
| 11 | External systems from manifests with `io_kind` (db/network/…), powering C4 L1 (`ExternalSystem`, `models.py:201`; `ingestion/resolvers`) | Third-party deps become first-class graph entities | Package-manifest extraction exists in the extractor surface (upstream-parity rows); no external-system entity/io classification | `must-audit` | Check overlap with the python-upstream package-manifest rows already in the census before designing anything. Cost **M** |
| 12 | Providers: DeepSeek, OpenRouter, LiteLLM, OpenCode backends (`core/providers/llm/`) | Broader BYOK provider matrix | `DirectLlmProvider` = anthropic/openai/gemini/mistral/cohere/ollama (`src/llm-execution.ts:8-11`); kimi/deepseek already noted `n/a` in the 0.8.49 intake | `must-audit` | Same decision as the standing python-upstream row — extend the union only on user demand. Cost **S** each |
| 13 | Code Health: 25 deterministic markers, offline-calibrated defect model, 3 orthogonal dimensions (`analysis/health`, `docs/CODE_HEALTH.md`) | 1-10 file scores that provably predict defects (AUC 0.74 cross-project) | Absent — no health/maintainability metrics | `defer` | New product axis (zero-LLM analytics). Real value, big surface, needs its own spec + calibration honesty. Cost **L** |
| 14 | Dead-code detection (`analysis/dead_code`, `dead_code_findings` `models.py:872`) | Unreachable files/exports/packages, confidence-tiered, safe-to-delete | Absent | `defer` | Graph reachability from entry points + export analysis; feasible on our graph, product decision first. Cost **M/L** |
| 15 | Co-change / coupling mining (`analysis/coupling`, `git_metadata.co_change_partners`) | Hidden coupling AST can't see; feeds risk + context | Absent (no git-history mining at all) | `defer` | Would enrich `review-delta` and curated context; opens the whole "git intelligence" axis — decide the axis, not the feature. Cost **M** |
| 16 | Owners / bus factor / contributor profiles (`git_metadata`, `services/owner_profile.py`) | Human ownership analytics, knowledge silos | Absent (agent-stats covers agents, not humans) | `defer` | Same git-mining axis as #15; adjacent to agent-stats plumbing. Cost **M** |
| 17 | Decisions/ADR intelligence: mining from 8 sources, evidence accretion, verification `exact/fuzzy/unverified`, typed decision graph, staleness (`analysis/decisions`, `models.py:592-798`) | "Why is it shaped this way" answers with anti-hallucination gates | Absent (only the ontology reconciliation decision log, `src/ontology-patch.ts`) | `defer` | The **verification ladder + evidence accretion are adopted as design patterns** in the curated-responses spec; full ADR mining is its own later spec. Cost **L** |
| 18 | Distill: index-aware command-output compression + omission store + `expand` reversibility (`core/distill/`, `docs/DISTILL.md`) | Compresses agent-bound output, errors-first, 100% reversible via `[repowise#ref]` markers | Absent | `defer` | Separate product surface (agent-IO middleware). The reversible-omission pattern is noted in the curated spec. Cost **L** |
| 19 | Multi-repo workspaces: cross-repo co-change, HTTP/gRPC/topic/DB contract provider↔consumer matching, conformance, architecture score, federated MCP (`core/workspace/`, `docs/WORKSPACES.md`) | Cross-repo intelligence | Absent (our "workspace" = single-repo Studio/aclp-am bundle, `src/workspace-manifest.ts`) | `defer` | Big axis; contract extraction is the interesting kernel. Cost **L** |
| 20 | C4 architecture views with curation service (`services/c4_builder/`, web `/c4`) | L1-L3 diagrams from graph + external systems | Absent (ontology hierarchies + Studio collapse are our analog) | `defer` | Re-evaluate after hierarchy collapse UX stabilizes; C4 is a rendering of data we partially have. Cost **M/L** |
| 21 | Proactive agent hooks / `augment`: PostToolUse zero-result rescue, flood triage by PageRank, stale-wiki nudge (`commands/augment_cmd.py:87`, plugin hooks) | Injects graph context into the agent loop only when asymmetric value | Absent (our skill is pull-based; hooks only rebuild) | `defer` | Agent-UX product decision; interacts with the no-key skill contract. Cost **M** |
| 22 | Refactoring plans + opt-in LLM codegen (`refactoring_suggestions` `models.py:947`, `tool_refactoring.py:61`, `docs/REFACTORING.md`) | Extract/Move/Break-cycle/Split plans ranked by impact×centrality×blast | `recommend-commits` (`src/recommend.ts`) is commit-grouping, not refactoring | `defer` | Depends on health (#13) + SCC (#4) foundations. Cost **L** |
| 23 | Coverage ingestion (LCOV/Cobertura/Clover → `coverage_files`) lighting up untested hotspots | Test-coverage joins the risk picture | Absent | `defer` | Cheap once a health/risk axis exists. Cost **S** |
| 24 | Reviewer suggestions (`services/reviewer_suggestions.py`) | Ranked reviewers for a changeset from ownership | Absent | `defer` | Needs #16 first. Cost **S/M** |
| 25 | Wiki restyle / prose styles, computed glossary, onboarding pages (`commands/restyle_cmd.py:142`, `docs/COMPUTED_GLOSSARY.md`) | Re-render generated corpus in different registers; derived term glossary | Wiki exists (`src/wiki.ts`); no styles/glossary | `defer` | Nice-to-have on the existing wiki lane. Cost **S/M** each |
| 26 | Local security pattern scan (`security_findings`, `routers/security.py`) | Dangerous-API/secret heuristics | Absent | `defer` | Overlaps the standing TS dependency/security audit note in the 0.8.49 intake. Cost **M** |
| 27 | Web KPI dashboard (~35 Next.js pages) + codebase chat (SSE loop over MCP tools) (`packages/web/`, `routers/chat.py`) | Full product UI + in-product chat | Studio is a DS-native graph explorer by posture; chat lives in the HOST assistant (no-key skill default; WP16 chat-ui seam) | `n-a` | Intentional architecture delta — do not adopt an in-product chat/KPI web app |
| 28 | `get_overview` / `list_repos` / single-repo `get_blast_radius` equivalents | Orientation + impact tools | Covered: `first_hop_summary` + `summary` CLI + GRAPH_REPORT resources (`src/serve.ts:85-115,812`); `review_analysis` blast radius (`src/review-analysis.ts:159`) | `n-a` | Covered (cross-repo blast radius is #19) |
| 29 | Auto-sync core: post-commit hook, watcher, polling (`docs/AUTO_SYNC.md`) | Keep index fresh | Covered: `src/watch.ts`, `src/hooks.ts`, `hook-rebuild` (`src/cli.ts:5691`) | `n-a` | Covered; GitHub/GitLab **webhook intake** is the only missing lane → fold into #19 if ever |
| 30 | VSCode native extension (risk panel, gutter heat, CodeLens, dashboards) (`packages/vscode/`, `docs/VSCODE.md`) | IDE surface over the local server | Skill/MCP-config install only (`src/cli.ts:2385`) | `defer` | Same standing decision as CRG row #19 (no VS Code extension without a dedicated spec). Cost **L** |
| 31 | Hosted/commercial layer: CVE/OSV reachability, SBOM/VEX, SSO/RBAC/SCIM, PR bots, compliance (`docs/COMMERCIAL.md`) | Enterprise governance | n/a | `n-a` | Not in the OSS repo; nothing to audit |

**Bucket counts:** adopt 4 (#1 #2 #3 #4) · must-audit 8 (#5-#12) · defer 14 (#13-#26, #30) · n-a 4 (#27 #28 #29 #31). The adopt bucket is deliberately small and S/M-sized except the curated-responses program itself, which is the principal's named interest and carries its own decision spec.

### Curated responses — pointer

The deep-dive (exact upstream mechanism: schema, keying, retrieval, gating, lifecycle, who curates) and the three-target adoption design (code corpora / **aclp-am** / **nc-fullstack**) live in **`spec/SPEC_EVOL_CURATED_RESPONSES.md`** (DRAFT, decision-ready, 5 open decisions for the principal). Ten-line mechanism summary is §1 of that spec.

The **full opportunity study** deep-diving every other table row (savings accounting, CLAUDE.md context block, SCC, search routing, Kamei features, agent provenance, cost ledger, knowledge-map/tours, `get_context` facets, external systems, provider union + the defer sweep), with a prioritized owner/phase table and 8 open decisions, lives in **`spec/SPEC_EVOL_REPOWISE_OPPORTUNITIES.md`** (DRAFT, 2026-07-06 follow-up).

### Repowise source-lock notes

- Reference lock: `repowise-dev/repowise` `main` at `6680c282` (= `v0.27.0` + 1 commit). Re-scan cadence: opportunistic, alongside python/CRG drift passes.
- Verified honest gaps: OSS core is complete (no license-gated stubs found in the open packages; hosted features are absent, not stubbed); the one in-tree stub is `PipelineJob` checkpoint/resume orchestrator integration (`models.py:1196+` docstring).
- AGPL-3.0: never vendor, copy, or translate repowise code into this MIT repo. Design-level adoption only, each time re-specified in our own terms.

## Active `0.8.49` Drift Intake

Observed on 2026-06-25 after merging `@sentropic/graphify@0.17.2`:

- Safi Python Graphify: `upstream/v8` at `9b583a01c3f1f9d3e6cb8f6c6b23d76e4b98afc9` (`fix(hooks): match the real file extension in the Read|Glob hook (#1463)`).
- New remote tags seen in this fetch include `v0.8.46`, `v0.8.47`, and `v0.8.49`; local `upstream/v8` now spans the previously-audited `v0.8.31` checkpoint through `v0.8.49`.
- Local TS baseline: `origin/main` at `53a2024` (`@sentropic/graphify@0.17.2`).
- Early port in this pass: upstream `68dba89` (`feat(llm): honor *_BASE_URL for kimi/gemini/deepseek backends (#1458)`) maps to the TS direct-provider set by honoring `ANTHROPIC_BASE_URL`, `OPENAI_BASE_URL`, `GEMINI_BASE_URL` / `GOOGLE_GENERATIVE_AI_BASE_URL`, `MISTRAL_BASE_URL`, and `COHERE_BASE_URL` in addition to the pre-existing `OLLAMA_BASE_URL`. Upstream-only Kimi/DeepSeek providers remain `n/a` until the TS `DirectLlmProvider` union adds them.

| Source window | Representative commits | Initial TS bucket | Notes / next action |
| --- | --- | --- | --- |
| LLM/provider endpoints | `68dba89` | `ported (early)` | Direct provider base-URL env support added in TS; README and `tests/llm-execution.test.ts` cover Gemini alias precedence. |
| Export/wiki filename safety | `5d63aad`, `7278e24`, `30cc4c0`, `739230e` | `must-audit` | Compare against Studio/wiki filename slugging and canvas/card layout. Likely small robustness ports. |
| Extractor/language surface | `7dc5d96`, `dbce453`, `8e6ba9d`, `d12eb28`, `895a60f`, `f117aac`, `dbce453`, `b3ab221` | `feature / must-audit` | WPF/XAML, CUDA, package manifests, Java records, PowerShell manifests, oversized-doc slicing, extractor split. Port incrementally only where TS extractor lacks parity and tests are cheap. |
| Hooks/skills/install/work-memory | `9b583a0`, `1e3270a`, `6d9617a`, `89dd00f`, `c06db05`, `ad6cb75`, `e7ba16b`, `1f42a2d`, `382b669`, `30fe8ba` | `mixed` | Separate skill text/doc fixes from Python work-memory features. Do not adopt Python-only hook machinery without TS install contract review. |
| Query/MCP/serve | `53edd27`, `f9ded63` | `must-audit` | Trigram prefilter and community-name MCP output may map to `src/serve.ts`/query surfaces. |
| Update/build correctness | `533859d`, `897483f`, `fd463de`, `8437ef4`, `b2e01f37`, `9a7dbfb`, `d885833`, `2100b3d` | `must-audit` | Reconcile against TS build-merge/update tests; many prior rows may already be covered. |
| Security/deps | `ec6b397`, `9e8fa2a`, `d8fa70e` | `partial / n-a` | Starlette is Python-only; web/export XSS and vulnerable npm deps require separate TS dependency/security audit. |
| Reflection/work-memory | `1a14e94`, `d193b62`, `6d9617a`, `89dd00f` | `defer / product decision` | Python `graphify reflect` and LESSONS.md workflow are not in the current TS product contract. |
| Release/changelog-only | `29fd98f`, `f87011b`, `6d3c959`, `bc362cb`, `e4ff54f` | `release-only` | Do not mirror Python package version bumps into the TS line. |

## Active Drift Intake (v0.8.49 → v1.0.0 / upstream-v8)

Observed on 2026-07-01 (this pass) against `origin/main` at `@sentropic/graphify@0.17.2`.

- Safi Python Graphify: `upstream/v8` HEAD at `5190a4e` (`docs: point LinkedIn badge to Graphify Labs company page`), which `git describe` resolves as **`v0.9.4-20-g5190a4e`** (20 untagged commits past the highest reachable release tag `v0.9.4` at `b7f88af`).
- **Window = `v0.8.49..upstream/v8` = 120 commits.** The first 7 (`e4ff54f`, `5d63aad`, `7278e24`, `68dba89`, `7dc5d96`, `1e3270a`, `9b583a0`) were already recorded in the prior `0.8.49` intake above (that intake was observed at `9b583a0`, which is 7 commits *ahead* of tag `v0.8.49 = 6d3c959`); they are re-classified here for completeness and carry their prior status. The genuinely-new slice is `9b583a0..upstream/v8` = 113 commits.
- Reachable release tags in-window: `v0.8.50` (`b17e88c`), `v0.8.51` (`8e98b91`), `v0.9.0` (`92e682f`), `v0.9.1` (`b7e256f`), `v0.9.2` (`544f95e`), `v0.9.3` (`0c551ac`), `v0.9.4` (`b7f88af`).
- **Title caveat (verified):** the task-supplied premise of `v0.9.5…v0.9.8` and `v1.0.0` upstream tags does **not** hold. `v0.9.5`/`v0.9.6` do not resolve; `v0.9.7` (`5d38117`) and `v0.9.8` (`efc46f8`) are **our own `rhanka` fork release-merge tags, NOT upstream** (both are `NOT-in-v8`). `v1.0.0` (`0a31c08`, "add git commit hook") remains a **non-target** — it is not an ancestor of `upstream/v8` (a divergent lightweight tag), confirming the standing note in this file. The real upstream frontier is `v0.9.4 + 20 untagged commits`.

**Key grounding finding (drives lot sizing):** the TS extractor is a single `src/extract.ts` (5.4k lines). Most languages route through `_extractGeneric(config)`; Groovy/PowerShell/Objc/Julia/Elixir have bespoke walkers; `.sv`/`.svh`/`.v`/`.f*`/`.vue`/`.dart`/`.r` route to `extractRegexBackedCode` (regex, no tree-sitter). Crucially, **`_extractGeneric` has NO type-reference subsystem at all** — there is no `references`-edge emission for class fields/properties/generic args (the only `relation: "references"` edges in the file are SQL foreign keys, `src/extract.ts:2982-3045`, and MCP/sdk concept refs). Upstream's `_swift_collect_type_refs` / `_csharp_collect_type_refs` / `_cpp_collect_type_refs` / `field_declaration`/`property_declaration`/`val|var_definition` handlers are entirely absent. Therefore every upstream "emit type/field/generic_arg references" fix is a **subsystem port**, not a one-line branch add, and is deliberately *not* in the cheap lot.

Per-bucket census (sums to 120):

| Bucket | Count | Representative SHAs |
| --- | --- | --- |
| `ported (this pass)` | 3 | `a19b9e9` ruby-inherits, `a129ff2` powershell-inherits/implements, `cd3a376` objc-protocol-implements |
| `ported (early / prior intake)` | 1 | `68dba89` `*_BASE_URL` (already merged) |
| `must-audit → already-covered` | 1 | `64a6093` groovy inherits/implements (TS `extractGroovy` is regex-backed and already emits both, `src/extract.ts:2827-2837`) |
| `port` (TS genuinely lacks, portable) | 18 | type-ref subsystem: `31b3752`,`9b49bfd`,`8b9a998`,`981e2b9`,`674184d`,`7eb847b`,`67b4525`,`51f805e`,`bb5e519`,`21bcb43`,`ad70152`; `indirect_call`: `19e7a31`,`cf747ab`,`8288829`,`6dc1cb0`,`311e63a`,`e34e27c`; `652ba42` Metal shaders |
| `must-audit` (needs check vs existing TS) | 54 | cross-file/type resolution `76b6eab`,`b9d8067`,`49252d3`,`3bc3fee`,`36b76ce`,`6509d0c`,`784e9c8`; ids `b46634e`,`3999dbc`,`35fb437`,`73710d3`,`5320aa8`; origin_file `afa4ade`,`d177f04`; build/update `0080d8a`,`4f40967`,`4a8d6ba`,`de7d362`,`6eb7c01`; hyperedge `bd885cc`; llm `ff47316`,`64c1f21`,`4e4935a`; export/wiki `5d63aad`,`7278e24`,`8b177cb`,`407a7f1`,`7a94f72`; cluster `1aab291`,`8127ff9`; js-imports `2133539`,`e8dabad`,`5746964`,`c8c604d`,`1801da0`; objc/swift `8994b55`,`1652dad`,`0792b41`,`51fc00a`; java `940cb53`,`1f3f1c1`; ruby `86ecb76`; regex-lang `b8f41c7`,`297075c`; julia `984a6a8`; elixir `f2ea6a6`; cli/skill `f7f89d7`,`47033c8`,`a16b5bd`,`1b99496`; cache `7a9cda2`; hooks `9b583a0`,`879c058`; `.vue` grammar `349465b` |
| `n-a` (Python-only: uv.lock, deps, packaging, str-decode, test-infra, skill/doc) | 13 | `6a45263`,`21a9f1f`,`faa9218` (uv.lock); `738c9ce`,`36b5e5c` (py deps); `11dc819`,`1225677`,`7592244` (uv/install docs); `0e8d92c` (GBK decode; TS reads UTF-8); `12193a8` (.DS_Store); `bee3849` (py test mock); `1e3270a`,`e3e4198` (skill text) |
| `defer` (product decision) | 8 | `7dc5d96`,`905e0a7` (WPF/XAML — not in TS surface); `75a5e6d`,`5779767`,`00e00a0`,`2cdc212`,`c865a3c` (`reflect`/work-memory overlay — Python-only product); `8fdbf50` (`getattr()` indirect_call — Python idiom) |
| `release-only` (changelog/version/badges) | 22 | `e4ff54f`,`b17e88c`,`8e98b91`,`92e682f`,`544f95e`,`0c551ac`,`b7f88af` (releases); `388d1b6`,`94e5baf`,`67d8c53`,`22a5afb`,`0ca73bd`,`1d8d278`,`69b3997`,`20547c4`,`93e8e44`,`7e24c3b`,`532a20e`,`f4a7994` (changelog); `1990612`,`5190a4e` (badges) |

Thematic mapping of the actionable (`port`/`must-audit`) buckets to TS files:

| Theme | Bucket | TS file(s) | Notes / next action |
| --- | --- | --- | --- |
| Class inheritance edges (Ruby/PowerShell/ObjC) | `ported (this pass)` | `src/extract.ts` `_extractGeneric` (ruby), `extractPowershell`, `extractObjc` | **Closed this pass** — see below. Groovy was `already-covered`. |
| Language type/field/generic-arg references | `port` | `src/extract.ts` `_extractGeneric` + new per-lang `collectTypeRefs` helpers | Requires porting the absent `references`-edge subsystem (`field_declaration`/`property_declaration`/`val|var_definition`/enum-assoc/base-template-args). Big, coherent, high-value. Blocked for swift/csharp/scala verification by absent optional grammars locally. |
| Indirect dispatch → `indirect_call` edges | `port` | `src/extract.ts` (all walkers) + `src/types.ts` (edge relation), consumers in `src/analyze.ts`/`src/build.ts` | New edge relation `indirect_call` not present in TS. Medium/large; touches many extractors + downstream. |
| Cross-file member/type resolution (C++/ObjC/C#/Go) | `must-audit` | `src/extract.ts` post-extract resolution pass | Partial cross-file resolution exists; audit header/impl routing (`3bc3fee`), sourceless stubs (`36b76ce`,`6509d0c`), case-sensitivity (`784e9c8`). |
| Node-ID / origin_file / dedup hardening | `must-audit` | `src/extract.ts` id logic, `src/build.ts` | TS already uses project-relative ids (`qualifiedFileStem`); check legacy-id warnings (`3999dbc`), separator-collision salting (`35fb437`), `origin_file` leak/stub (`afa4ade`/`d177f04`). |
| build_merge / graph-JSON corruption hardening | `must-audit` | `src/build.ts`, `src/hyperedges.ts`, `src/graph.ts` | Preserve hyperedges + prune-root hardening (`4f40967`), corruption-tolerant load (`4a8d6ba`,`6eb7c01`), symlink-root relativize (`de7d362`). |
| LLM dispatch robustness | `must-audit` | `src/llm-execution.ts` | Non-streaming OpenAI-compat (`ff47316`), 429 retry (`64c1f21`), secondary-path timeout (`4e4935a`). Several may already be covered — audit before porting. |
| Export / wiki / GraphML | `must-audit` | `src/export.ts`, `src/wiki.ts`, `src/studio-*.ts`, `src/cli.ts` | Filename case-fold dedup (`5d63aad`), canvas grid (`7278e24`), vault-safety (`8b177cb`), GraphML null-attr + `--answer-file` (`407a7f1`), portable md links (`7a94f72`). |
| Community-label determinism | `must-audit` | `src/community-labels.ts`, `src/cluster.ts` | Deterministic hub labels (`1aab291`), stale-label detection on re-cluster (`8127ff9`), `--missing-only` (`a16b5bd`). |
| JS/TS import resolution | `must-audit`/`port` | `src/extract.ts` (`resolveJsImportTarget*`, tsconfig alias loader) | Wildcard aliases (`5746964`), namespace re-exports (`c8c604d`), `this.field.method()` ctor-injection (`1801da0`), package.json `exports` subpaths (`e8dabad`), workspace alias edges (`2133539`). |

### Proposed port-lot list

1. **Lot 1 — Class-inheritance edges (cheap, high-value).** Ruby / PowerShell / ObjC `inherits`/`implements`. Size **S** (3 small branches, existing patterns). Risk **low**. **CLOSED THIS PASS** (Groovy already-covered). Verified: Ruby asserts green locally; PowerShell/ObjC ports written against real TS source with soft-skip integration tests (optional grammar WASM absent in sandbox — assert in CI).
2. **Lot 2 — Language type/field/generic-arg references subsystem.** Port the absent `references`-edge machinery + per-language collectors (java field/annotation/record, csharp property, scala var, php promoted ctor, swift enum-assoc, cpp base-template-args, rust tuple/enum field) = `port` bucket ×11. Size **L**. Risk **medium** (new subsystem + downstream analyze/dedup interplay; some langs unverifiable locally without optional grammars). Highest structural value.
3. **Lot 3 — `indirect_call` dispatch edges.** New edge relation + capture across Python/JS-TS/cross-file, plus `getattr` slice as Python-only `defer`. Size **M/L**. Risk **medium** (touches every walker + `src/types.ts` + downstream consumers). Do after Lot 2 so the edge-type plumbing is settled.
4. **Lot 4 — build_merge / graph-JSON corruption + ids/origin_file hardening.** `4f40967`,`4a8d6ba`,`6eb7c01`,`de7d362`,`3999dbc`,`35fb437`,`afa4ade`,`d177f04`,`5320aa8`. Size **M**. Risk **low/medium**, mostly additive robustness + regression tests. Good "correctness" lot independent of extractor work.
5. **Lot 5 — LLM dispatch + export/wiki robustness.** `ff47316`,`64c1f21`,`4e4935a` (llm) and `5d63aad`,`7278e24`,`8b177cb`,`407a7f1`,`7a94f72` (export/wiki/GraphML). Size **M**. Risk **low**. Several likely `already-covered` — audit-first lot.
6. **Lot 6 — Cross-file resolution + community-label determinism.** `3bc3fee`,`36b76ce`,`6509d0c`,`784e9c8` (resolution) + `1aab291`,`8127ff9`,`a16b5bd` (labels). Size **M**. Risk **medium**. Depends partly on Lot 2 groundwork.

### Closed this pass — Lot 1a (class-inheritance edges)

| Upstream | TS target | Status |
| --- | --- | --- |
| `a19b9e9` fix(ruby) superclass inherits | `_extractGeneric` ruby branch, `src/extract.ts` | **ported + verified** (grammar present; 2 regression tests assert green) |
| `a129ff2` fix(powershell) inherits/implements | `extractPowershell`, `src/extract.ts` | **ported** (mirrors upstream; integration test soft-skips locally — `tree-sitter-powershell` WASM absent in sandbox, asserts in CI) |
| `cd3a376` fix(objc) protocol-to-protocol implements | `extractObjc`, `src/extract.ts` | **ported** (mirrors upstream; integration test soft-skips locally — `tree-sitter-objc` WASM absent in sandbox, asserts in CI) |
| `64a6093` fix(groovy) inherits/implements | `extractGroovy`, `src/extract.ts:2827-2837` | **already-covered** (regex extractor already emits both) |

## Source Lock Notes

- `git ls-remote` is the authority for Safi Python tags while local tag clobber risk exists.
- Local `refs/tags/v0.4.23` is not trusted for parity claims because it differs from the remote tag observed by `git ls-remote`.
- Python `upstream/v4` was fetched on 2026-04-25 and remains locked as a closed parity line at `5843ffc277c54766854f9201286c9647da095390`.
- Python `upstream/v5` was fetched on 2026-04-29 and is now a closed parity line at `f755aca58f36771923cebcc8f85f2eef6178a105`.
- Python `upstream/v6` was observed on 2026-05-04 and is now a closed parity line at `f81e3bc2154d21062f56f9e4ec9f923dfe7d128e`.
- Python `upstream/v7` was observed on 2026-05-04 for the closed `0.7.0` to `0.7.4` parity cycle.
- Python `upstream/v7` was re-fetched on 2026-05-08 and advanced to `0c29b2cb88c6274d889ca7c33a684ce103808715`; this opened the `0.7.5` to `0.7.10` plus post-tag realignment cycle now closed below.
- Python `upstream/v7` was re-scanned on 2026-05-12 after the `0.7.10` checkpoint merge and advanced to `ab32098063adb1ab4d9247747742958ad185db41`; remote tags now extend through `v0.7.16`.
- Fetched local tags `v0.7.0` through `v0.7.4` all resolve to `f81e3bc2154d21062f56f9e4ec9f923dfe7d128e`; do not use those local tag pointers as proof for `0.7.x` parity. Follow the `upstream/v7` commit history instead.
- Remote tag `v1.0.0` exists upstream, but the active upstream release train is still `v6` / `0.7.x`; do not target `1.0.0` until a separate traceability pass proves that line is the real parity target.
- Local `v0.4.28`..`v0.4.32` tags are not trusted for parity claims while tag clobber risk exists; use branch commits and `git ls-remote` instead.
- CRG `v2.3.3` is now the stable review-feature source and points at `main` (`52cf3bc63ee77c8b204fb809791a5f212e83a2de`).
- No CRG `main` / `v2.3.3` feature has been adopted in this `0.7.10` realignment without being recorded as an additive TypeScript delta.
- Package version alignment is driven by Python Graphify parity targets, not by `code-review-graph` tags or `main`.
- The active `0.7.10` realignment must stay TypeScript-only; no new Python dependency may be introduced to claim parity.
- The `0.7.10` parity cycle is closed in the TypeScript release line; any newer upstream drift must start a new traceability pass.
- Python `upstream/v8` was re-fetched on 2026-05-23 (Track F bilan #2) and advanced from the previous cadrage lock `4c95d02` (`v0.8.13`, bilan #1 baseline) to `990ac70` (`v0.8.16`); intermediate tag `v0.8.14` at `f4da176` was published, intermediate tag `v0.8.15` was **skipped upstream** (commit `ff14ad5` landed in-tree but no remote tag was pushed — do not record `v0.8.15` as a published Python release).
- Local TS baseline for the `0.8.16` drift bilan is `main` at `751ddce935ba8baec26fe5225da12a7525da428b`, package `graphifyy@0.9.1`.
- Python `upstream/v8` was re-fetched on 2026-05-25 (Track F bilan #3) and advanced from `990ac70` (`v0.8.16`) to `3efae38`; new remote tags `v0.8.17` at `73c3c33` and `v0.8.18` at `98100f3` were published. Tag `v1.0.0` at `0a31c08` ("add git commit hook") is **NOT an ancestor of `upstream/v8`** (it is a lightweight tag on a divergent commit, not a v8-line release) — it stays a **non-target**, confirming the bilan #1/#2 finding; the auto-rebuild-after-commit feature it carries is already-covered by our `graphify hook-rebuild` / git-hook install.

## Active `0.8.18` Drift Intake

Observed on 2026-05-25 (Track F bilan #3) after publishing `graphifyy@0.9.7` (closing the `0.8.16` intake):

- Safi Python Graphify: `upstream/v8` at `3efae38` (`Rate-limit backup_if_protected ...`), one commit past tag `v0.8.18` (`98100f3`).
- New remote tags since `v0.8.16`: `v0.8.17` at `73c3c33`, `v0.8.18` at `98100f3`. Tag `v1.0.0` at `0a31c08` is a non-target (see Source Lock Notes).
- Drift commit range `990ac70..upstream/v8` is **12 commits**. Companion bilan: `spec/SPEC_TRACK_F_0818_BILAN.md`. Companion lot plan: `PLAN.md > Lot F-0818 drift (2026-05-25)`.
- Local TS baseline: `main` at `2583f33` (`graphifyy@0.9.7`, post-PR #71 ledger).

Grounding checks run against `main` at intake time: `backupIfProtected` already exists (`src/watch.ts:299`, `src/export.ts`); Java `extends`→`inherits` is already canonicalized (`src/extract.ts:1541+`); partial cross-language structural suppression exists (`src/analyze.ts:116`); **no** query-expansion, semantic-contexts, or watch shrink-guard exist yet.

| # | Commit | Subject (issue) | Bucket | Initial TS status / action |
| --- | --- | --- | --- | --- |
| 1 | `461e346` | Windows cp1252 crash, `str.parent` crash, MCP error message, god_nodes relative import | `already-covered` / `n-a` | cp1252 + `str.parent` are Python-runtime specific (TS reads UTF-8, no `str.parent`). Audit only the MCP error-message wording + god-node import angle. |
| 2 | `71b4e57` | Husky 9 hook path, `skill.md` `INPUT_PATH` literal, per-worker exception isolation | `must-port (M)` | F-0818-M1. Audit `src/hooks.ts` (Husky-9 path), `src/skills/*` (`INPUT_PATH` literal), `src/llm-execution.ts` (per-worker isolation). |
| 3 | `4dce16f` | Case-sensitive call resolution + cross-language phantom calls (#993, #991) | `must-port (P)` | F-0818-P1. We have partial cross-lang suppression (`analyze.ts:116`) but no case-sensitive call resolution. Extend `src/extract.ts` / `src/analyze.ts` + regression. |
| 4 | `73c3c33` | Bump 0.8.17 | `release-only` | Do not mirror (`MEMORY.md > Cautious semver bumps`). |
| 5 | `6fba4e4` | watch: bypass shrink-guard on explicit deletions (#1000) | `needs-audit` → likely `n-a` / `intentional-delta` | No shrink-guard in `src/watch.ts`; verify our `.rebuild.lock` + deletion-aware update path is equivalent before porting. |
| 6 | `d778e2c` | cli: reconstruct communities from per-node attribute when sidecar missing (#1001) | `must-port (M)` | F-0818-M2. Robustness for `src/community-labels.ts` / cluster when the label sidecar is absent. |
| 7 | `32effb1` | docs: Ukrainian README to v8 (#995) | `intentional-delta` / `release-only` | The TS fork does not carry a Ukrainian README. |
| 8 | `ab4e542` | feat: cross-language semantic contexts for Python, JS/TS, C#, Java (#996) | `feature — scope decision` | New capability we lack. Needs a mini-spec before a lot is opened; default `defer` pending scope (size unknown). |
| 9 | `238702b` | Constrained query expansion (#998) | `must-port (M)` | F-0818-M3. No query expansion in `src/serve.ts` / `src/search.ts`; port the constrained-expansion ranking. |
| 10 | `a4a615d` | Ukrainian typo + Unicode vocab regex + Java `extends`→`inherits` migration note | split | Unicode vocab regex → `must-port (M)` (F-0818-M3, pairs with #9 query hygiene); Java `inherits` → `already-covered` (`extract.ts:1541+`); README typo → `release-only`. |
| 11 | `98100f3` | Bump 0.8.18 | `release-only` | Do not mirror. |
| 12 | `3efae38` | Rate-limit `backup_if_protected` to one folder/day via content hash | `must-port (M)` | F-0818-M2. Enhancement to existing `backupIfProtected` (`watch.ts:299`); add the daily content-hash rate-limit. |

**Bucket counts:** must-port-P = 1 (#3), must-port-M = 4 (#2, #6, #9+#10-regex, #12), feature/scope-decision = 1 (#8), needs-audit = 1 (#5), already-covered = 2 (#1, #10-Java), intentional-delta = 1 (#7), release-only = 3 (#4, #11, README bits).

**Rolled-up effort:** ~3-4 days serialized for P1 + M1/M2/M3, excluding the `#8` semantic-contexts feature (scope TBD).

**Version recommendation:** after porting P1 + M1/M2/M3, the next TS release is a **patch bump `graphifyy@0.9.8`** advancing the closest audited parity point to `v0.8.18`. Do **not** jump to `1.0.0`: upstream `v1.0.0` is a lightweight tag on a divergent git-hook commit, not a v8-line major. `#8` semantic-contexts, if accepted, would justify a **minor `0.10.0`** in a later cycle once scoped.

## Active `0.8.16` Drift Intake

Observed on 2026-05-23 after merging PRs #33 (A-final), #34 (F cadrage bilan #1), #35 (E Lot 4-risky), #48 (F-H1 hyperedges), #53 (F-Opt-PR), and Track G G6-1/G6-2 workspace lots:

- Safi Python Graphify: `upstream/v8` at `990ac706d823bf92275333433fde4ef4782a9139` (`bump version to 0.8.16`).
- New remote tags since the previous bilan (`v0.8.13` at `4c95d02cbb3901956491e81695f32ae56bd851d6`): `v0.8.14` at `f4da176851220d0a41105253a9a6688a03dfa873`, `v0.8.16` at `990ac706d823bf92275333433fde4ef4782a9139`. **`v0.8.15` was skipped upstream** (commit `ff14ad5245ae47b5a4c2ec8c217373440a6a8e38` landed but no tag was pushed; only the in-tree version bump exists).
- Drift commit range `v0.8.13..upstream/v8` is **18 commits**. Companion bilan: `spec/SPEC_TRACK_F_0816_BILAN.md`. Companion lot plan: `PLAN.md > Lot F-0816 drift (2026-05-23)`.
- Local TS baseline: `main` at `751ddce935ba8baec26fe5225da12a7525da428b`, package `graphifyy@0.9.1`. Track G G6-3 routing refactor in-flight on `feat/track-g-g6-3-routing` (not merged at this lock).

| Source | Bucket | Examples | Initial TS status | Initial action |
| --- | --- | --- | --- | --- |
| Python `v0.8.14`..`v0.8.16` | Security hardening | graph.json 512 MiB load cap, sanitize_metadata at export boundaries, vis-network CDN SRI pin (`#956` cluster `b6127aa`), NAT64 SSRF false-positive fix (`9e6192a`) | `must-port` | F-0816-P3 / part of F-0816-P4. Verify partial G overlap on vis-network pin (Track G `workspace/graph-panel.ts`). |
| Python `v0.8.14`..`v0.8.16` | Wiki / detect correctness | stale wiki node filter (`#936` in `9e6192a`), gitignore fallback + `--exclude` flag (`#945`/`#947`), cluster-only crash when `graphify-out/` absent (`#934` in `076e6b7c`) | `must-port` | F-0816-P4. Wiki portion is G-adjacent (Track G `workspace/display-model.ts` reads wiki sidecars) — port strengthens contract, no conflict expected. |
| Python `v0.8.14`..`v0.8.16` | Unicode / query | CJK/Unicode dedup in `_norm`/`_norm_label` (`#937` in `86109e9`), non-English query terms searchable (`#964` in `020cca2`) | ~~`must-port`~~ → **`already-covered`** (corrected 2026-07-25) | Both ported in PR #62 (`c230eca`, `3254b2b`), shipped `graphifyy@0.9.7`; see `src/build.ts` `normalizedLabel` and `src/search.ts` `queryTerms`. One leak found and fixed 2026-07-25: the `graphify query` CLI bypassed `queryTerms`. The `0.7.14` Unicode-IDs lineage was real and is now closed — see *Track F Residual Reconciliation (2026-07-25)*. |
| Python `v0.8.14`..`v0.8.16` | LLM / CLI hygiene | exit non-zero on all-chunk extract failure (`#889` in `3238b32`), honor `GRAPHIFY_MAX_OUTPUT_TOKENS` for OpenAI-compatible backends (`#973` in `06a9b72`) | `must-port` | F-0816-P2. Trivial line-level ports. |
| Python `v0.8.14`..`v0.8.16` | Install surface | project-scoped skill installs (`#931` in `b347492`) | `must-port` | F-0816-P1. Audit `src/skill-install.ts` for `--scope project` + per-platform target dirs. Soft G overlap on workspace bootstrap. |
| Python `v0.8.14`..`v0.8.16` | Language / parser | `.ets` (ArkTS) extension (`#926` in `52d75bd`), Swift cross-file extension dedup (`#969` in `406bea4`), JS/TS barrel re-exports as explicit graph edges (`1494874`), bash extractor hardening (part of `#956`) | `must-port (M)` | F-0816-M1 (extensions + Swift), F-0816-M2 (barrel re-exports), F-0816-M3 (bash hardening — pairs with still-open F-P3 bash extractor port from bilan #1). |
| Python `v0.8.14`..`v0.8.16` | Opt-in / skill-merge feature surface | `graphify affected` + import-resolution depth (`e44e6e9`), semantic-fragment validation via upstream `semantic_cleanup.py` (part of `#956`) | `ported / partially deferred` | F-0816-Opt-Affected routed into `review-delta` extension, not a new verb. The real upstream `semantic_cleanup.py` semantics are ported as F-0816-M4 (`src/semantic-fragment-validation.ts`). The local F-0816-M5 `src/semantic-cleanup.ts` stale-node pruner is retained as a TS graph-level complement to the stale-wiki-node fix, not as a literal upstream module port. |
| Python `v0.8.14`..`v0.8.16` | Defer | SCIP JSON ingester (part of `#956`), Python+bash symbol-resolution helpers (part of `#956`), LLM-triage backend (out of scope per F-Opt-PR deepdive § 6) | `defer (F-Opt)` | Reopen only on user request: SCIP ingestion, symbol-resolution false positives, `graphify pr --triage` request. |
| Python `v0.8.14`..`v0.8.16` | Already covered | `backup_if_protected` graph snapshot before overwrite (`#834` in `6939494`) | `already-covered` | `src/export.ts > backupIfProtected` (line 54), wired into `src/pipeline.ts:215` and `src/watch.ts:282`. |
| Python `v0.8.14`..`v0.8.16` | Intentional delta | multigraph runtime compat probe (part of `#956`) | `intentional-delta` | TS uses Graphology single-graph by contract; NetworkX MultiGraph compat surface does not map. Already recorded in `0.7.12` row. |
| Python `v0.8.14`..`v0.8.16` | Release-only | `0.8.14`/`0.8.15`/`0.8.16` version bumps, YC S26 badge, Uzbek README translation | `release-only` | Do not mirror per `MEMORY.md > Cautious semver bumps`. |

Row-level table is in `spec/SPEC_TRACK_F_0816_BILAN.md > Drift table`. The 18-row matrix splits omnibus PR `#956` (`b6127aa`) into 8 sub-rows (11a..11h) to keep one-row-per-feature traceability.

**F-Opt-LLM-Triage closure (2026-05-23; corrected 2026-07-22):** the earlier text named nonexistent `src/llm-mesh.ts` and overstated full-CLI routing. The actual integration is the generation-only scaffold `src/llm-mesh-bridge.ts` plus the direct-provider execution path in `src/llm-execution.ts`. The no-separate-triage decision remains, but it is an intentional product delta rather than proof that mesh already routes the whole CLI. A future triage feature requires a current execution-port spec and tests; it must not infer embedding support from the generation bridge.

## Active `0.7.16` Drift Intake

Observed on 2026-05-12 after merging the `0.7.10` checkpoint:

- Safi Python Graphify: `upstream/v7` at `ab32098063adb1ab4d9247747742958ad185db41`, remote tag `v0.7.16` at the same commit.
- New remote tags since the previous pass: `v0.7.11`, `v0.7.12`, `v0.7.13`, `v0.7.14`, `v0.7.15`, `v0.7.16`.
- The TypeScript product must triage this drift in small lots while keeping descriptions and reconciliation moving.

| Source | Bucket | Examples | Initial TS status | Initial action |
| --- | --- | --- | --- | --- |
| Python `v0.7.11`..`v0.7.16` | Runtime and platform hotfixes | context-window retry, Windows console unblock, `__main__` guards, MultiGraph crash, hollow LLM response retry, universal help guard, `--version`, Unicode IDs, edge-key dedup, direction flip, chunk paths, encoding, uv fallback, path scoring, cache, OpenCode trigger | `needs-triage` | Classify each fix as `must-port`, `already-covered`, `intentional-delta`, or `defer`; port urgent runtime fixes before feature work. |
| Python `v0.7.11`..`v0.7.16` | Ollama runtime tuning | dynamic `num_ctx`, `keep_alive`, serial defaults, `GRAPHIFY_OLLAMA_NUM_CTX`, `GRAPHIFY_OLLAMA_KEEP_ALIVE` docs | `needs-triage` | Compare against TS Ollama provider surface and port only env/runtime controls that matter for local direct extraction. |
| Python `v0.7.11`..`v0.7.16` | Parser/language surface | Pascal, Delphi, Lazarus IDE files, regex fallback without tree-sitter-pascal | `needs-triage` | Decide whether Pascal/Delphi/Lazarus is a quick regex-backed TS extractor lot or deferred until requested. |
| Python `v0.7.11`..`v0.7.16` | Visualization/export | callflow HTML export with Mermaid architecture diagrams and watch/hook auto-regeneration | `needs-triage` / `opportunity` | Decide whether this belongs to core export parity, CRG/review UX, or a deferred visualization lot. |
| Python `v0.7.11`..`v0.7.16` | Skills/watch/hooks | hook OOM worker cap, Antigravity `.agents` path/frontmatter, skill `--help` behavior | `needs-triage` | Audit against existing TS installer/watch contracts and add targeted tests for gaps. |

Row-level audit for the post-`0.7.10` drift observed at `ab32098063adb1ab4d9247747742958ad185db41`:

| Ref | Commit | Upstream change | TypeScript status | Required follow-up |
| --- | --- | --- | --- | --- |
| `0.7.11` runtime retry | `f88567b` | Recover from context-window-exceeded API errors in adaptive LLM retry. | `must-port` | Add direct-mode retry behavior around context-window/length-like failures and hollow JSON responses, with mocked `generateText` tests. |
| `0.7.11` Windows/Python entry guards | `e5f263b` | Unblock Python pipeline on Windows consoles and add missing Python `__main__` guards. | `intentional-delta` | Node/Commander entrypoints do not use Python module guards; keep Windows CI coverage and UTF-8 file writes, but no Python entrypoint port is needed. |
| `0.7.11` Pascal/Lazarus parser | `32bf8b4` | Add Pascal, Delphi and Lazarus IDE extraction support. | `defer` | Treat as Lot M3. Port as a regex-backed TS extractor only if language expansion is approved for this acceleration branch. |
| `0.7.11` Pascal regex fallback | `8e64835` | Keep Pascal extraction working without `tree-sitter-pascal`. | `defer` | Same Lot M3 decision; if accepted, use regex fallback first and avoid adding a Python runtime dependency. |
| `0.7.12` hook/watch resilience | `dc50979` | Prevent concurrent hook rebuild OOM, add timeout/resource controls, lift worker cap, and fix Antigravity `.agents` path/frontmatter. | `must-port` | Audit TS `hook-rebuild` concurrency and Antigravity install paths; add targeted tests before changing installer paths. |
| `0.7.12` MultiGraph compatibility | `23f598f` | Avoid crashes when graph edge data is nested by multigraph semantics. | `already-covered` | Graphology edge access and prior links/edges loader coverage avoid the Python NetworkX failure mode; keep `tests/serve.test.ts` and `tests/review-store.test.ts` coverage. |
| `0.7.12` hollow LLM response retry | `23f598f` | Retry or surface empty/hollow LLM responses instead of silently parsing `{}`. | `must-port` | Fold into the direct-mode retry lot with invalid/empty response regression tests. |
| `0.7.12` skill help behavior | `23f598f` | Make skill `--help` useful instead of triggering stale-version noise. | `already-covered` | Commander help/version behavior is covered by existing CLI tests; keep hook-check silent behavior under installer tests. |
| `0.7.13` Ollama context saturation | `8c00287` | Set large `num_ctx`, `keep_alive`, and serial local extraction defaults for Ollama. | `dropped (owner decision 2026-10-25, zod advisory)` | Moot: the Ollama backend is dropped in 0.21.2 with `ollama-ai-provider` (zod GHSA-mrhx-c7xc-m3w5). No Ollama runtime tuning is ported. |
| `0.7.13` callflow HTML export | `db66b87` | Add Mermaid-based callflow HTML architecture export. | `defer` | Classify under CRG/visualization after the first product tracks; TS already has `.graphify/flows.json`, wiki flow pages, and review-flow CLI surfaces. |
| `0.7.13` callflow hook/watch regeneration | `5ead190` | Regenerate callflow HTML automatically when the artifact already exists. | `defer` | Depends on the callflow HTML decision; do not add watch churn until the export surface is accepted. |
| `0.7.13` dynamic Ollama `num_ctx` | `8c4c67f` | Derive Ollama context size from actual chunk size instead of hardcoding. | `dropped (owner decision 2026-10-25, zod advisory)` | Moot: the Ollama backend is dropped in 0.21.2 with `ollama-ai-provider` (zod GHSA-mrhx-c7xc-m3w5). No Ollama context sizing is ported. |
| `0.7.13` Ollama env docs | `4cec58e` | Document `GRAPHIFY_OLLAMA_NUM_CTX` and `GRAPHIFY_OLLAMA_KEEP_ALIVE`. | `dropped (owner decision 2026-10-25, zod advisory)` | Moot: the Ollama backend is dropped in 0.21.2 with `ollama-ai-provider` (zod GHSA-mrhx-c7xc-m3w5). No Ollama env docs are ported. |
| `0.7.14` Unicode IDs | `95e2c5e` | Normalize IDs with Unicode-aware NFKC/casefold semantics. | ~~`must-port`~~ → **`ported`** (2026-07-25) | Closed: `src/node-id.ts` (`makeNodeId`/`normalizeIdPart`) now backs `_makeId`, its `extract-git` twin, and the registry seed ids; `tests/node-id-unicode.test.ts`. Deltas (`toLowerCase` vs `casefold`, combining marks) recorded in *Track F Residual Reconciliation (2026-07-25)*. |
| `0.7.14` legacy edge-key cleanup | `95e2c5e` | Handle LLM `from`/`to` edge keys during dedup and avoid leaking stale keys. | `must-port` | Add validation/build normalization for legacy edge aliases before graph construction, with tests. |
| `0.7.14` direction flip and chunk paths | `95e2c5e` | Avoid update direction flip and make skill chunks addressable by absolute paths. | `already-covered` | Direction preservation is already covered by `tests/build-merge.test.ts`; TS skill-runtime writes explicit scratch paths rather than Python subagent chunk files. |
| `0.7.15` help/version/Ollama fallback | `094d8ba` | Universal help guard, `--version`, and Ollama `num_ctx` fallback. | `must-port` | `--version` is already handled by Commander; carry the Ollama fallback into Lot M2 and add one CLI/help regression if stale-version noise reappears. |
| `0.7.16` encoding and install fallback | `994b17b` | Force UTF-8 file I/O in skills and prefer `uv tool install` fallback over `pip`. | `intentional-delta` | TS uses Node UTF-8 writes and npm/npx install paths; no Python/uv fallback applies to the npm-first runtime. |
| `0.7.16` path scoring | `994b17b` | Prefer exact, then prefix, then substring node matches; reject shortest path when source and target resolve to the same node. | `already-covered` | Ported in this branch for CLI `path`/`explain` and MCP `shortest_path`; tests: `tests/cli-runtime.test.ts`, `tests/serve.test.ts`. |
| `0.7.16` semantic-cache path normalization | `994b17b` | Normalize path keys and check/save cache relative path handling. | `must-port` | Audit `src/cache.ts` for Windows case/junction equivalence and relative `source_file` parity; add cache tests before modifying. |
| `0.7.16` OpenCode trigger line | `994b17b` | Add explicit `/graphify` trigger guidance to installed agent docs. | `must-port` | Audit installed AGENTS/OpenCode/Codex docs against current `$graphify`/`/graphify` trigger rules and update tests if needed. |
| `0.7.11`..`0.7.16` release bumps | `adf96da`, `e926079`, `9caaa17`, `dd465af`, `ab32098` | Python package version and changelog updates. | `intentional-delta` | Do not bump `graphifyy` solely for Python release tags; versioning remains tied to the next TS release gate. |

## Active `0.7.10` And CRG `v2.3.3` Realignment Intake

Observed on 2026-05-08:

- Safi Python Graphify: `upstream/v7` at `0c29b2cb88c6274d889ca7c33a684ce103808715`, remote tag `v0.7.10` at `ef1050b0e4134df0bd59956b0f900dc3c83e8184`.
- code-review-graph: `v2.3.3` / `main` at `52cf3bc63ee77c8b204fb809791a5f212e83a2de`.
- Local tag conflicts still exist for multiple Python tags; use `git ls-remote` and branch commits as authority.

Functional intake buckets for the next realignment:

| Source | Bucket | Examples | Initial TS status | Initial action |
| --- | --- | --- | --- | --- |
| Python `v0.7.5`..`v0.7.10` | Incremental update and dedup | semantic cache/build-merge/manifest, entity dedup design, MinHash/Jaro-Winkler strategy, reversed call-edge update fix, community label persistence | `covered` / `intentional-delta` | Reversed call-edge preservation is ported for `buildMerge` and covered by `tests/build-merge.test.ts`. Community label persistence is ported through `src/community-labels.ts` and exercised by `tests/cli-runtime.test.ts` (`preserves renamed community labels across cluster-only rebuilds`, `preserves renamed community labels across hook-rebuild update`). Semantic cache + manifest reuse is already covered by the TypeScript assistant/runtime `update` flow (`tests/cache.test.ts`, `tests/cli-runtime.test.ts > preserves existing semantic nodes during code-only update rebuilds`); the upstream monolithic incremental `extract` command is recorded as an intentional delta in the row-level table below. The MinHash/LSH/Jaro-Winkler `--dedup-llm` path is `intentional-delta` because it depends on Python-only libraries (`datasketch`, `rapidfuzz`) and an aggressive cross-file merge contract the TypeScript line deliberately avoids. |
| Python `v0.7.5`..`v0.7.10` | Parser and language surface | Markdown structural extraction, `.md/.mdx` update path, TS interface/enum/type-alias/const/new_expression, TSX JSX parser, CommonJS require, Groovy/Spock, Luau, Quarto `.qmd`, SQL ALTER FK and schema-qualified names | `covered` | SQL ALTER FK, schema-qualified table names, CommonJS `require()` module/symbol edges, TS/TSX interface/type/enum/const/new-expression/JSX call extraction, Markdown/MDX/Quarto structural extraction, and selected no-Python fallback coverage for Groovy/Gradle, Luau, R and Fortran are ported through the TypeScript extractor. |
| Python `v0.7.5`..`v0.7.10` | Direct LLM/backends | Gemini/OpenAI/Ollama/AWS Bedrock, accessible backend priority, configurable Gemini model, output token cap | `covered (opt-in)` / `deferred` | Ollama is ported as a credential-free opt-in direct provider (`tests/llm-execution.test.ts > accepts ollama as a credential-free local direct provider`); AWS Bedrock stays `deferred` until an enterprise user requests it (`Lot 4` row in the detailed table below). |
| Python `v0.7.5`..`v0.7.10` | External document sources | Google Workspace shortcuts and hardened export sidecars | `covered (opt-in)` | Strict opt-in via `GRAPHIFY_GOOGLE_WORKSPACE=1`; `.gdoc/.gsheet/.gslides` stubs are converted to Markdown sidecars via the Drive v3 REST API (intentional-delta: upstream uses the external `gws` CLI). Auth via `GOOGLE_OAUTH_ACCESS_TOKEN` or on-demand refresh-token exchange, never persisted. Covered by `tests/google-workspace.test.ts` (11 cases) and `tests/detect.test.ts > ignores Google Workspace shortcuts unless GRAPHIFY_GOOGLE_WORKSPACE is set`. |
| Python `v0.7.5`..`v0.7.10` | MCP/query/install/security | MCP resources, edges/links loader fix, Kimi platform, positional install platforms, uninstall-all command, skill YAML descriptions, subprocess/security hardening | `covered` / `intentional-delta` | MCP resources are ported in `src/serve.ts` with read-only `graphify://...` resources; the TS graph loader already accepts both `links` and `edges`; positional `graphify install <platform>`, Kimi Code global install, trigger-oriented skill descriptions, top-level uninstall, missing-skill repair, atomic skill writes, and mapped security hardening are covered by targeted regression tests. Python-only subprocess shell-injection fixes are `n/a` where the TS runtime already uses `execFileSync` argv arrays. |
| CRG `v2.3.3` | Review UI/accessibility | keyboard navigation, ARIA, node shapes, edge differentiation, help overlay, VS Code webview patterns | `partial` / `opportunity` | Reuse patterns for Graphify HTML/studio without adopting CRG's VS Code stack. |
| CRG `v2.3.3` | Review precision and parsers | changed range mapping, Java/PHP/C++ fixes, Spring/Temporal/Kafka semantics, test runner detection, GDScript/ReScript/Nix/SystemVerilog | `partial` / `needs-triage` | Triage by generic value; implement over `.graphify/graph.json`, not SQLite. |
| CRG `v2.3.3` | Daemon, embeddings, FTS, SQLite | multi-repo daemon, OpenAI-compatible embeddings, FTS sync, SQLite transactions | `deferred` / `intentional-delta` | Do not adopt by default; separate spec required before any optional index/daemon work. |

## CRG `v2.3.3` Row-Level Audit (Track C audit, 2026-05-14)

Audit produced by drumbeat agent against `spec/SPEC_CODE_REVIEW_GRAPH_ALIGNMENT.md` and `spec/SPEC_CODE_REVIEW_GRAPH_OPPORUNITY.md`. 15 meaningful CRG features, no rejection. Nine map to `adopt-review`, two are deferred pending earlier closure.

| # | Feature | CRG source | Category | Bucket | TS landing | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | GraphStore adapter and node lookup | `code_review_graph/graph.py` | review-precision | `adopt-review` | `src/review-*.ts` | F3: `ReviewGraphStoreLike` reads `.graphify/graph.json`; enables all downstream review features. |
| 2 | Execution flow tracing (BFS/CALLS) | `code_review_graph/flows.py:trace_flows` | review-precision | `adopt-review` | `src/flows.ts` | F7: forward traversal over `CALLS` edges, cycle safety, criticality weights. |
| 3 | Affected flows mapping | `code_review_graph/flows.py:get_affected_flows` | review-precision | `adopt-review` | `src/affected-flows.ts` | F8: maps changed files to nodes, finds impacted flows. Already partly covered by `review-delta`. |
| 4 | Review context and snippets | `code_review_graph/tools/review.py:get_review_context` | review-precision | `adopt-review` | `src/review-context.ts` | F5: minimal/standard detail levels, blast radius, source snippet caps. |
| 5 | Unified diff parsing and risk scoring | `code_review_graph/changes.py` | changed-range | `adopt-review` | `src/changes.ts` | F6: git diff parsing, line-range node mapping, multi-factor risk (flow/test/security). |
| 6 | Minimal first-hop context | `code_review_graph/tools/context.py:get_minimal_context` | review-precision | `adopt-review` | `src/minimal-context.ts` | F4: ~100 token budget. Already mostly covered by `graphify minimal-context`. |
| 7 | Entrypoint/decorator detection | `code_review_graph/flows.py:detect_entry_points` | parser | `adopt-review` | `src/extract.ts` | Decorator patterns, conventional names (main, test_*, on_*, handle_*); embedded in F7. |
| 8 | Skill/LLM review state machine | `code_review_graph/CLAUDE.md` | review-precision | `adopt-review` | `src/skills/*.md` | F10: minimal-context-first five-state flow. |
| 9 | Flow artifact persistence | `code_review_graph/flows.py:store_flows` | review-precision | `adopt-review` | `.graphify/flows.json` | F7: schema with stable deterministic IDs. |
| 10 | Report/wiki flow enrichment | `code_review_graph/wiki.py` | node-shape | `defer` | `src/wiki.ts` | F11: flow pages, community-flow links; defer until F7 stable in TS. |
| 11 | Flow visualization HTML highlight | `code_review_graph/visualization.py` | node-shape | `defer` | `src/export.ts` | F11: interactive flow graphs; blocked on HTML renderer refactor. |
| 12 | Benchmark / eval scoring | `code_review_graph/eval/scorer.py` | review-precision | `adopt-review` | `src/review-eval.ts` | F12: deterministic local fixtures, token-efficiency metrics, no network cloner. |
| 13 | Security keyword classification | CRG security keyword set | changed-range | `adopt-review` | `src/changes.ts` | Boost risk for `auth`, `crypt`, `sql`, `encrypt`. Embedded in F6/F7. |
| 14 | Test coverage gap detection | `code_review_graph/flows.py:compute_criticality` | review-precision | `adopt-review` | `src/criticality.ts` | Flag nodes without `TESTED_BY` edges. |
| 15 | Flow criticality weights | `code_review_graph/flows.py:compute_criticality` | review-precision | `adopt-review` | `src/criticality.ts` | File spread 0.30, external calls 0.20, security 0.25, test gaps 0.15, depth 0.10. |

Coverage notes:
- `adopt-html` and `adopt-studio` HTML accessibility patterns (keyboard, focus, ARIA, contrast, help overlay, non-color-only file_type encoding) live in the second matrix below; the alignment specs do not break them down row-by-row, so they were audited separately and grouped into `C2` / `C3` lots in `PLAN.md`.
- `defer` rows (10, 11) reopen automatically once F7 flow artifacts are stable in the TS line.
- No `reject`: every classified row could be reopened without product-line risk.

### CRG `v2.3.3` Row-Level Audit — HTML UX, a11y and visual encoding

| # | Feature | Surface | Bucket | Notes |
| --- | --- | --- | --- | --- |
| 1 | Tab order + keyboard focus ring | `graphify export html` (`src/export.ts`, vis.js config ~L545) | `adopt-html` | vis.js currently `keyboard: false`; need tab cycle, visible focus ring, Escape to deselect. |
| 2 | ARIA labels on nodes / edges / legend | `graphify export html` | `adopt-html` | Zero `aria-label`/`role`/`aria-describedby` today. |
| 3 | Focus management + screen-reader announce | `graphify export html` | `adopt-html` | `network.focus()` is silent; needs `aria-live="polite"` announcements. |
| 4 | Colour contrast (WCAG AA) | export.ts styles ~L419 | `adopt-html` | CI check via axe-core or Pa11y on an HTML fixture. |
| 5 | High-contrast mode toggle | export.ts | `adopt-html` | Optional CSS class + export flag. |
| 6 | Colour-blind safe encoding | export.ts | `adopt-html` | Community currently encoded by colour only; add shape + pattern + label. |
| 7 | Hover tooltip (descriptions) | export.ts vis.js config (~L542) | `adopt-html` | Add `data-help` on nodes/edges that have a description. |
| 8 | Help overlay modal (F1 / ?) | export.ts | `adopt-html` | Keyboard-shortcut glossary + introspection of controls. |
| 9 | Labeled search input + ARIA results list | export.ts | `adopt-html` | `<label for=...>` + `aria-live` for filter result counts. |
| 10 | `aria-live` status region | export.ts | `adopt-html` | "Loaded N nodes" / "Filtered to M results". |
| 11 | Node shape by `file_type` (non-colour-only) | export.ts vis.js shape config (~L547) | `adopt-html` | All nodes are `dot` today; map test→square, config→triangle, doc→house, type→diamond. |
| 12 | Edge arrow direction cue clarified | export.ts vis.js arrows (~L522) | `adopt-html` | Solid = directed `calls`, dashed = inferred / undirected. |
| 13 | Edge colour/width by relation | export.ts | `adopt-html` | `calls` solid blue, `imports_from` dashed grey, `tested_by` dotted green, etc. |
| 14 | Legend panel (a11y-friendly) | export.ts | `adopt-html` | Scrollable list: shapes = file_types, colours = communities, line styles = relations. |
| 15 | Inline SVG file-type icons | export.ts | `adopt-html` | Small icon per file_type in node decoration or legend. |
| 16 | Mobile / touch responsiveness | export.ts | `adopt-review` | Audit button hit-targets ≥ 44px, touch pinch-zoom, no hover-only affordances. |
| 17 | Risk badge / highlight on changed nodes | `graphify export html` + `src/changes.ts` (future) | `adopt-review` | Couples to Lot C1 review-precision. |
| 18 | Community link-density visual cue | export.ts | `adopt-html` | Optional: size nodes by degree, communities by edge count. |
| 19 | VS Code webview command-palette pattern | n/a (CRG only) | `defer` | TS fork has no VS Code extension yet; reopen with a dedicated spec. |

Coverage notes:
- 18 of 19 rows could land in `graphify export html` first, independent of the future Svelte studio.
- Lot scope proposed (see Track C in `PLAN.md`): **C1** review-precision (matrix 1, F3..F12 rows above), **C2** HTML a11y (rows 1–10 here), **C3** node-shape + edge encoding + legend (rows 11–15, 18).
- Row 19 (VS Code) stays `defer` until a TypeScript VS Code extension is in scope.

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
- opt-in multi-backend graph mirrors (`spec/SPEC_STORAGE_BACKENDS.md`): TypeScript-only, no upstream Python counterpart; strictly opt-in pushed projections (Neo4j first, Spanner Graph staged) while `.graphify/graph.json` remains the source of truth and the default stays file-only

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
| `v0.7.0` / release-tag anomaly | merge driver for `graph.json`, deterministic community IDs, content-only cache on renames, freshness signal, mixed code/doc handling | `covered` / `intentional-delta` | Multi-developer graph lifecycle | The fetched local tags `v0.7.0` through `v0.7.4` all resolve to `f81e3bc`, so this row is traced against the effective `upstream/v7` continuation instead. `graphify hook install` now configures `.gitattributes` plus a `graphify-json` merge-driver, covered by `tests/hooks.test.ts` (`installs all lifecycle hooks`, `reports status correctly`) and `tests/merge-driver.test.ts` (`union-merges graph.json nodes, links, hyperedges, and labels`). Deterministic community IDs are covered by `tests/cluster.test.ts` (`assigns deterministic community IDs across equivalent insertion orders`). Graph freshness signaling is covered by `tests/cli-runtime.test.ts` (`writes graph freshness metadata and detects stale HEAD drift`): `graph.json` records `built_from_commit`, `GRAPH_REPORT.md` surfaces the short hash, and `graphify check-update` detects HEAD drift. Mixed code/doc hook batches are covered by `tests/cli-runtime.test.ts` (`rebuilds code but keeps stale semantic state for mixed code and docs hook batches`). Content-only cache reuse on rename remains an intentional TypeScript delta: this fork keeps path/stem-derived node IDs, so blind cache reuse across renames would replay stale IDs and `source_file` provenance. |
| `v0.7.1` / release-tag anomaly | Obsidian tag sanitization, extended `tsconfig` alias resolution, Svelte template dynamic imports, recursion safety | `covered` / `n/a` | Parser robustness, export surface, and headless extraction | The fetched `0.7.x` tags are not reliable source pointers after `0.6.9`, so this row is traced against the effective `upstream/v7` continuation instead. Extended alias resolution is covered by `tests/language-surface.test.ts` (`parses JSONC tsconfig aliases with comments and trailing commas`) and `tests/language-surface.test.ts` (`resolves tsconfig path aliases through an extends chain`). Svelte dynamic-import coverage is covered by `tests/language-surface.test.ts` (`resolves aliased Svelte dynamic imports via tsconfig paths`) and `tests/language-surface.test.ts` (`resolves template-layer Svelte dynamic imports via tsconfig paths`). Deep-AST recursion safety is covered by `tests/language-surface.test.ts` (`continues extraction when a file overflows recursive AST traversal`): a single overflowing file now becomes a diagnostic instead of aborting the whole extraction batch. Obsidian tag sanitization is `n/a` for this TypeScript line because `src/wiki.ts` emits plain wiki markdown + canvas JSON and does not generate Obsidian tag metadata that needs sanitization. |
| `v0.7.2` / `b6ffdbb` | Fortran support, export CLI subcommands, skill-size reduction, large-graph aggregation | `covered` / `deferred` / `intentional-delta` | Parser robustness, export surface, and headless extraction | Public export CLI parity is now covered by `tests/cli-runtime.test.ts` (`supports export html and --no-viz cleanup`), `tests/cli-runtime.test.ts` (`supports export wiki and obsidian vault generation`), and `tests/cli-runtime.test.ts` (`supports export svg, graphml, and neo4j cypher`). `query`, `path`, and `explain` were already covered by `tests/cli-runtime.test.ts` (`supports upstream path and explain commands`) plus existing query-focused CLI/runtime tests. Fortran stays deferred: closing that gap would require a dedicated Node/TypeScript parser strategy, and this parity cycle must not introduce any Python runtime dependency. Large-graph HTML auto-aggregation remains an intentional TypeScript delta: this fork keeps explicit `safeToHtml` / `--no-viz` behavior and `cluster-only` fallback, evidenced by `tests/cli-runtime.test.ts` (`supports export html and --no-viz cleanup`) and `tests/cli-runtime.test.ts` (`supports cluster-only on oversized graphs by skipping HTML export`). Skill-size reduction is `n/a` for parity because the upstream change was packaging/prompt-size hygiene rather than a user-facing runtime contract. |
| `v0.7.3` / `d40e274` | `graphify extract` headless semantic extraction for CI, backend selection, `--no-cluster`, `--out` | `covered` / `intentional-delta` | Parser robustness, export surface, and headless extraction | Public headless extract coverage is now provided by `tests/cli-runtime.test.ts` (`supports code-only headless extract via the public CLI`), `tests/cli-runtime.test.ts` (`supports extract --no-cluster for raw merged extraction output`), `tests/cli-runtime.test.ts` (`requires provided semantic extraction for non-code headless corpora`), and `tests/cli-runtime.test.ts` (`supports docs-only headless extract when semantic JSON is provided`). The intentional delta is backend ownership: unlike upstream Python, `graphifyy` does not run Anthropic/Kimi-style semantic backends directly. The TypeScript CLI accepts precomputed semantic extraction JSON and keeps direct LLM execution in the assistant/runtime pipeline, which preserves the no-Python constraint and avoids baking provider secrets into the standalone CLI. |
| `v0.7.4` / `741ac36` + `26a5a35` | JSONC `tsconfig` parsing and aliased Svelte dynamic-import fixes | `covered` | Parser robustness, export surface, and headless extraction | Covered by `tests/language-surface.test.ts` (`parses JSONC tsconfig aliases with comments and trailing commas`) and `tests/language-surface.test.ts` (`resolves aliased Svelte dynamic imports via tsconfig paths`). The TypeScript parser now strips JSONC comments/trailing commas in `loadTsconfigAliases()` and resolves Svelte `import()` specifiers through the same alias logic used for JS/TS. |

## Active Python `0.7.5`..`0.7.10` Drift After `upstream/v7` Re-fetch

Row-level audit for the new drift observed at `0c29b2cb88c6274d889ca7c33a684ce103808715`. Each row cites a TS test name, an explicit intentional-delta rationale, or an explicit deferment.

| Ref | Commit | Upstream change | TypeScript status | Required follow-up |
| --- | --- | --- | --- | --- |
| `0.7.5` incremental extract | `239000d` | Add semantic cache + `build_merge` + manifest to the headless `graphify extract` command, plus a new `--dedup-llm` flag. | `intentional-delta` | The TypeScript line keeps `graphify extract` as a deterministic, full-rebuild CI helper. Incremental rebuilds use `graphify update`, `npx graphify hook-rebuild`, and the skill-runtime `assemble-update-graph` / `finalize-update` flow, which already implement semantic cache (`saveSemanticCache` / `checkSemanticCache` in `src/cache.ts`), manifest reuse (`saveManifest` / `detectIncremental` in `src/detect.ts`), and graph growth via `buildMerge`. Existing tests: `tests/cache.test.ts`, `tests/cli-runtime.test.ts > preserves existing semantic nodes during code-only update rebuilds`, `tests/cli-runtime.test.ts > rebuilds code but keeps stale semantic state for mixed code and docs hook batches`. The `--dedup-llm` MinHash/LSH/Jaro-Winkler entity-merge path is `intentional-delta` (see entity-dedup row below). |
| `0.7.5` entity dedup | `3438043` + `ec413d5` + `579e1cc` | Add `graphify/dedup.py` (entropy gate + MinHash/LSH + Jaro-Winkler) and wire `deduplicate_entities` plus `--dedup-llm` through `build()` and `build_merge()`. | `intentional-delta` | The TypeScript port keeps a conservative `deduplicateByLabel` pass inside `buildMerge` (covered by `tests/build-merge.test.ts > deduplicates chunk-suffixed labels during explicit merge flows`). Aggressive cross-file entity merging via MinHash/LSH/Jaro-Winkler is not adopted because (a) it depends on Python-only libraries (`datasketch`, `rapidfuzz`); (b) the active TypeScript contract preserves distinct same-label entities across files to keep `source_file` provenance reliable; (c) reintroducing LLM-driven dedup at build time would conflict with the assistant-orchestrated semantic extraction surface. |
| `0.7.5` hook rebuild label persistence | `b3c99ec` | Persist community labels through `_rebuild_code` watch rebuilds via `.graphify_labels.json`. | `covered` | Covered by `src/community-labels.ts`, `src/watch.ts` (`rebuildCode`), and `tests/cli-runtime.test.ts > preserves renamed community labels across hook-rebuild update`. |
| `0.7.5`/`0.7.9` cluster-only + wiki label persistence and data-loss guard | `e22a189` | Reuse `.graphify_labels.json` in `cluster-only`; refuse to export wiki when `.graphify_analysis.json` is empty. | `covered` / `intentional-delta` | Label persistence covered by `tests/cli-runtime.test.ts > preserves renamed community labels across cluster-only rebuilds`. The wiki data-loss guard is an intentional delta: the TypeScript wiki/obsidian exports already require a non-empty graph and a valid clustering before rendering, and the existing CLI/runtime export commands fail loudly when the graph is empty, so an explicit additional check on `.graphify_analysis.json` is not needed. |
| `0.7.5` manifest on full rebuild | `005a366` | Ensure manifest is written even during full rebuilds and tighten `cluster-only --graph` plus `_is_sensitive` boundaries. | `covered` | Manifest writes are covered by `saveManifest` in `src/detect.ts` and exercised by `tests/cli-runtime.test.ts > preserves existing semantic nodes during code-only update rebuilds`. Sensitive-path boundaries are covered by `tests/security.test.ts`. |
| `0.7.10` reversed call-edge update fix | `0c29b2c` | Stop reversing `calls` edges when the existing `graph.json` is undirected, by reading nodes/links directly instead of round-tripping through NetworkX. | `covered` | Covered by `tests/build-merge.test.ts > preserves existing edge direction from graph.json links during merge` and `tests/build-merge.test.ts > prefers preserved _src/_tgt direction when existing graph links are undirected`. TypeScript reads `_src`/`_tgt` explicitly from existing graph links and preserves them across `buildMerge`. |
| `0.7.10` missing SKILL.md repair warning | `0c29b2c` | Warn when `.graphify_version` exists but `SKILL.md` is missing. | `covered` | Already ported in an earlier Lot 1 commit; covered by the platform installer tests under `tests/install-preview.test.ts` and the global skill repair contract documented in `spec/SPEC_UPSTREAM_TRACEABILITY.md`. |
| `0.7.10` atomic skill install | `0c29b2c` | Write the skill file via `<dst>.tmp` + `os.replace` to avoid half-written installs. | `covered` | Already ported in an earlier Lot 1 commit. |
| `0.7.6` Ollama backend | `48888a7` | Add Ollama as a direct LLM backend. | `dropped (owner decision 2026-10-25, zod advisory)` | The `ollama` direct backend is dropped in 0.21.2 with `ollama-ai-provider` (zod GHSA-mrhx-c7xc-m3w5 via `@ai-sdk/provider-utils` 2.x): selecting `--backend ollama` now fails with the standard `--backend` error. `@sentropic/llm-mesh` has no Ollama provider. |
| `0.7.7` AWS Bedrock backend | `61e27fb` | Add AWS Bedrock as a managed backend via `boto3` Converse. | `deferred` | The TypeScript line does not adopt Bedrock by default: the IAM/STS signing surface and Bedrock model-catalog churn add maintenance cost without a current TS-side requester. Reopen when an enterprise user requests it; a Vercel AI SDK provider (`@ai-sdk/amazon-bedrock`) exists if/when we port. |
| `0.7.7`-`0.7.10` Google Workspace shortcut export | `f704972` + `669bc32` + `6f15e5b` | Convert `.gdoc/.gsheet/.gslides` stubs to Markdown sidecars via the external `gws` CLI; opt-in via `GRAPHIFY_GOOGLE_WORKSPACE`; hardened sidecar frontmatter with SHA256 of the Google account email. | `covered (opt-in)` / `intentional-delta` | Strict opt-in via `GRAPHIFY_GOOGLE_WORKSPACE=1`. Implemented in `src/google-workspace.ts` via the Drive v3 REST API directly (inspired by `entropiq/api/src/services/google-drive-client.ts`), so there is no external runtime dependency on `gws`. Auth read from `GOOGLE_OAUTH_ACCESS_TOKEN` or refreshed on demand from `GOOGLE_OAUTH_REFRESH_TOKEN` + `GOOGLE_OAUTH_CLIENT_ID/_SECRET`; never persisted in `.graphify/`. Sidecars carry frontmatter parity (`source_type`, `google_file_id`, `google_export_mime_type`, optional `google_account_hash`). Detection gates the extensions behind the same env flag. Covered by `tests/google-workspace.test.ts` (11 cases) and `tests/detect.test.ts > ignores Google Workspace shortcuts unless GRAPHIFY_GOOGLE_WORKSPACE is set`. |
| `0.7.10` positional install platforms | `68804f7` | Accept `graphify install opencode` and reject conflicting positional/`--platform` selectors. | `covered` | Covered by `tests/cli.test.ts > supports upstream positional install platform syntax` and `tests/cli.test.ts > rejects conflicting install platform selectors`. |
| `0.7.10` Kimi Code platform | `c8da4a7` | Add `graphify install --platform kimi` for Kimi Code. | `covered` | The TypeScript installer writes the global Kimi skill to `~/.kimi/skills/graphify/SKILL.md`. Covered by `tests/cli.test.ts > supports Kimi Code as an install platform` and `tests/install-preview.test.ts > lists Kimi Code global skill files`. |
| `0.7.10` trigger-oriented skill descriptions | `a15cb36` | Rewrite skill YAML descriptions so agents load graphify for codebase, architecture, and file-relationship questions. | `covered` | Covered by `tests/skills.test.ts > uses trigger-oriented skill descriptions` across distributed skills and the Gemini command description. |
| `0.7.10` security hardening | `0656ec6` | Harden MCP text output, Cypher export, URL-ingest YAML frontmatter, direct LLM JSON parsing, merge-driver caps, hook path handling, and Python subprocess surfaces. | `covered` / `n/a` | Mapped TS hardening is covered by `tests/serve.test.ts > scrubs control characters from MCP graph text fields`, `tests/export-json.test.ts > escapes control characters in string literals and allowlists identifiers`, `tests/ingest.test.ts > escapes URL ingest frontmatter scalars against YAML injection`, `tests/llm-execution.test.ts > rejects oversized direct JSON responses before parsing`, `tests/merge-driver.test.ts > rejects graph inputs above the merge-driver node cap`, `tests/hooks.test.ts > refuses to install hooks outside the repository git directories`, and `tests/security.test.ts > strips control characters`. Python subprocess-shell fixes are `n/a` where the TypeScript code already uses `execFileSync` with argv arrays. |
| `0.7.10` MCP resources | `13947c3` | Add MCP resources for report, stats, god nodes, surprises, confidence audit, and suggested questions. | `covered` | Ported as read-only MCP resources in `src/serve.ts`: `graphify://report`, `graphify://stats`, `graphify://god-nodes`, `graphify://surprises`, `graphify://audit`, and `graphify://questions`. Covered by `tests/serve.test.ts > lists upstream-compatible graph resources` and `tests/serve.test.ts > reads upstream-compatible graph resources`. |
| `0.7.10` edges/links loader mismatch | `aa2bd13` | Accept graph JSON that uses `edges` instead of `links` in query/path/explain and MCP loading. | `covered` | `src/graph.ts` already normalizes `raw.links ?? raw.edges ?? []`, and all public CLI/MCP graph loaders route through `loadGraphFromData`. Covered by `tests/serve.test.ts > loads graph JSON resources and tools when edges is used instead of links`. |

## Version Alignment

Owned by Track F (`spec/SPEC_TRACK_F_UPSTREAM_BILAN.md`). This section maps `graphifyy X.Y.Z` to the closest upstream Python Graphify parity reference plus the explicit TS-only delta. It is the single source of truth for the question "what does the TypeScript version number mean versus upstream Python?".

The mapping is intentionally allowed to drift in **both** directions:

- TypeScript may be numerically *ahead* of upstream when TS-only deltas justify a bump (Track A descriptions, Track B reconciliation, Track C HTML a11y / visual encoding, Track E dependency hygiene + bloat opt-in, ontology lifecycle).
- TypeScript may *lag* upstream on numerically-newer features when those features are deferred by Track F (e.g. upstream v1.x hypergraph, v2.x wiki rewrite).

Mechanically mirroring upstream Python version bumps is forbidden; see `spec/SPEC_TRACK_F_UPSTREAM_BILAN.md > Version Alignment Policy`.

### Current mapping

| TypeScript ref | Closest upstream Python parity | TS-only delta vs upstream | Outstanding upstream gap | Source |
| --- | --- | --- | --- | --- |
| `@sentropic/graphify@0.10.0` (`main`, 2026-05-26, tag `v0.10.0`; rename PR #79) | `graphify@0.8.18` (unchanged from `0.9.8`; rename is a packaging change only) | Everything listed for `0.9.8`. The npm package is renamed `graphifyy` → `@sentropic/graphify` with a deprecated `graphifyy` forwarding shim; no CLI contract change, no graph schema change. Post-tag `main` additionally carries (merged, **unreleased**): F-0819-P1 Lua `require()` node-id resolution + arrow-fn/markdown phantom god-node drop (PR #87, upstream `#1075`/`#1077`), F-0819-P2 manifest prune path matching + deterministic `(source,target,relation)` edge sort (PR #88, upstream `#1007`/`#1010`), F-0831-P1-security office/PDF zip-bomb cap + `OLLAMA_BASE_URL` SSRF hardening + Fortran cpp-path non-regression guard (PR #93), plus Track G studio / `@sentropic/graph` renderer work. | Same residuals as `0.9.8`, minus the items closed by the early F-0819/F-0831-P1 ports above. The `v0.8.18..v0.8.31` upstream window (104 commits, fetched locally through `7a588fb` `v0.8.31`) is not yet formally triaged; the next bilan owns that classification and must reconcile it against the already-merged PRs #87/#88/#93. | Rename release PR #79; parity lots PRs #87/#88/#93 (merged post-tag, unreleased). |
| `graphifyy@0.9.8` (`release/0.9.8`, 2026-05-26, tag `v0.9.8`) | `graphify@0.8.18` (closest audited point; `0.8.18` drift intake closed) | Everything listed for `0.9.7`, plus the merged `0.8.18` drift lots: F-0818-P1 case-sensitive call resolution (PR #74), F-0818-M1 Husky 9 hook path + skill `INPUT_PATH` literal (PR #75), F-0818-M2 `backupIfProtected` daily rate-limit (PR #76), F-0818-M3 constrained query expansion skill guidance + Unicode vocab regex (PR #77). No graph schema change. | Not a blanket parity claim against upstream stable `v0.8.18`. Already-covered (verified vs `main`): per-worker isolation (`#943`), community reconstruction from per-node attrs (`#1001`), Java `extends`→`inherits`. Parked: F-0818 bash extractor hardening (no bash extractor yet); deferred: `#996` cross-language semantic-contexts (needs sizing mini-spec). `v1.0.0` remains a non-target (lightweight tag on a divergent git-hook commit). | Release PR closing the F-0818 drift cycle (lots #74/#75/#76/#77). |
| `graphifyy@0.9.7` (`release/0.9.7`, 2026-05-24, tag `v0.9.7` at `5d38117`) | `graphify@0.8.16` (closest audited point; `0.8.16` drift intake closed) | Everything listed for `0.9.6`, plus the merged `0.8.16` drift lots: F-0816-P1 project-scoped skill installs (PR #59), F-0816-P2 Unicode/CJK + LLM/CLI hygiene (PR #62), F-0816-P3 security hardening — 512 MiB loader cap, `sanitizeMetadata`, vis-network SRI pin (PR #63), F-0816-P4 wiki stale-node filter + `--exclude` + NAT64 SSRF (PR #64), F-0816-M1 `.ets`/Swift dedup/env shebang (PR #65), F-0816-M2 JS/TS barrel `re_exports` edges (PR #68), F-0816-M4 OpenCode/Codex semantic-fragment validation (PR #69), F-0816-M5 local graph stale-node prune (PR #67), and F-0816-Opt-Affected delivered as `review-delta --depth/--affected` deeper import-resolution rather than a parallel `affected` verb (PR #66). Additive graph schema delta: `re_exports` edge type. | Not a blanket parity claim against upstream stable `v0.8.16`. Residuals: F-0816-M3 bash extractor hardening parked until the bash extractor itself lands; SCIP ingestion + Python/bash symbol-resolution helpers deferred; `graphify pr --triage` LLM-triage closed as already-covered by `src/llm-mesh.ts` (no separate triage path ported). Next traceability pass starts from a fresh upstream scan past `990ac70` (`v0.8.16`). | Release PR #70 closing the F-0816 drift cycle (lots #59/#62/#63/#64/#65/#66/#67/#68/#69). |
| `graphifyy@0.9.6` (`main`, 2026-05-20) | `graphify@0.8.13` (advanced by upstream `2d783e5`) | Everything listed for `0.9.5`, plus the 6 worth-porting commits between upstream `v0.8.11` and `v0.8.13`: `2d783e5` (cohesion unrounding in `GRAPH_REPORT.md`, `save_manifest` cache-state fix, `cluster --resolution`/`--exclude-hubs`), `d84f07c` (node-ID dedup collision guard, byte-identical semantic-cache fastpath, absolute→scan-root `source_file` relativization), `f5fea13` (empty/filtered LLM `choices` no longer crash extract), `6939494` (`backupIfProtected` snapshot before overwrite of curated `graph.json`), `2209a9c` (bare `graphify <path>` treated as `extract`), `850c545` (`FILE_COUNT_UPPER` 200→500). Also rolls in Track C-3.5 profile-aware visual encoding (per-`node_type` vis.js `shape`/`color_hex`), which is TS-only with no upstream Python counterpart. | Not a blanket parity claim against stable `v0.8.13`. The remaining `v0.8.x` gap is one explicit intentional-delta: the skill `scan_root` subfolder breakdown (upstream `a234c52`), not ported because the TS skill runtime does not consume the same dictionary shape and the fast-path query guidance already shipped via PR #891 (0.9.2). | Patch bump rolling the `v0.8.11..v0.8.13` carry-forward plus the in-flight Track C-3.5 visual encoding. |
| `graphifyy@0.9.5` (`feat/release-0.9.5`, 2026-05-19) | `graphify@0.8.10` (advanced by upstream `f7160c8`) | Everything listed for the prior `0.9.4` row, plus the merged `f7160c8` port (PR #42, merge commit `c20140b`) so Rust `scoped_identifier` calls resolve against an in-file `Type::method` index instead of being collapsed onto any same-named symbol in the corpus. Cross-crate sibling impls no longer emit spurious `INFERRED` call edges. This row records the patch-bump release; functional content is identical to the previous row, only the npm version moves from `0.9.4` to `0.9.5` and `.graphify/` is refreshed on `main`. | Still not a blanket parity claim against upstream stable `v0.8.13`. Only `2d783e5` (cohesion unrounding + hook/detect follow-ups, upstream `v0.8.11`) remains as the next recommended `upstream/v8` parity row before any stronger `v0.8.x` parity claim. F-Opt buckets (hypergraph data layer in branch `feat/track-f-h1-hypergraph` WIP; v2 wiki rewrite; `graphify prs` surface) are tracked separately and a re-evaluation decision is in flight (see `PLAN.md > Open F decisions`). | Release commit for the merged `f7160c8` port. |
| `graphifyy@0.9.4` (`feat/track-f-rust-cross-crate-inferred`, 2026-05-19) | `graphify@0.8.10` (advanced by upstream `f7160c8`) | Everything listed for the prior `0.9.4` row, plus this branch's TypeScript port of upstream `f7160c8` / `v0.8.10`. Rust `scoped_identifier` calls are now resolved against an in-file `Type::method` index instead of being collapsed onto any same-named symbol in the corpus, so cross-crate sibling impls no longer emit spurious `INFERRED` call edges. | Still not a blanket parity claim against upstream stable `v0.8.11`. Only `2d783e5` (cohesion unrounding audit plus hook/detect follow-ups) remains as the next recommended `upstream/v8` parity row before any `v0.8.11` parity claim. Deferred `F-Opt` surfaces (`graphify prs`, hypergraph data layer in `.worktrees/track-f-h1-hypergraph` WIP, wiki rewrite) still wait on a stable upstream `v2.0.0` tag. | Track F follow-up to bilan 2026-05-18 closing the `f7160c8` row from the prior 0.9.4 mapping. |
| `graphifyy@0.9.4` (`feat/track-f-v0811-bilan2-godnodes`, 2026-05-18) | `graphify@0.8.9` (advanced by upstream `2aaa216`) | Everything listed for `0.9.2`, plus the `0.9.3` dependency follow-up, the `0.9.4` Track F parity follow-up, and this branch's TypeScript port of upstream `2aaa216` / `v0.8.9` so npm `dependencies` / `devDependencies` / `peerDependencies` / `optionalDependencies` / `bundledDependencies` / `bundleDependencies` JSON keys are filtered out of god-node selection. | Still not a parity claim against upstream stable `v0.8.11`. The next recommended `upstream/v8` follow-ups remain `f7160c8` (Rust cross-crate false `INFERRED` edges) and `2d783e5` (cohesion unrounding audit plus hook/detect follow-ups). Deferred `F-Opt` surfaces (`graphify prs`, hypergraph, wiki rewrite) still wait on a stable upstream `v2.0.0` tag. | Track F bilan 2026-05-18 after upstream scan `v0.8.11`. |
| `graphifyy@0.9.2` (`feat/track-f-graph-report-demote`, 2026-05-16) | `graphify@0.7.19` (closed by Track D at `a9b0ddb`) | Everything listed for `0.9.0`, plus Track A final mesh proof (`0.9.1`), the already-merged Track E Lot 4-risky dependency majors (TypeScript 5.9, Vitest 3.2, Chokidar 5), Node 24 CI coverage, and Track F's port of upstream PR #891 / v0.8.6 query-first install guidance. Installed assistant surfaces now prefer `graphify query` / `graphify path` / `graphify explain` and keep `GRAPH_REPORT.md` as broad-context fallback. | Not a parity claim against upstream `v0.8.x`. The #891 install-contract gap is closed, but the current weekly bilan still leaves F-P2 graph-correctness rows (`.graphifyignore` parent exclusion, short-label dedup guard, cross-language INFERRED suppression, auto symlink detection, query IDF weighting, dedup partition-by-source), F-P3 Bash/JSON extractor parity, optional F-M1 SQL/Firebird/C++ depth, and deferred `graphify prs` / hypergraph / wiki-rewrite surfaces. Upstream stable tag at this bilan is `graphify@0.8.8`. | Track F bilan 2026-05-16 + user decision to port all merged non-N/A rows. |
| `graphifyy@0.9.0` (`main` at `a8eb232`, 2026-05-15) | `graphify@0.7.19` (closed by Track D at `a9b0ddb`) | Track A descriptions infra + render; Track B reconciliation patch core + read-only API + write-enabled studio; Track C2 HTML a11y; Track C3 visual encoding (per-file_type shapes, per-relation edge dashes, legend); Track E setup + Lot 1 (officeparser + unpdf swap-in, 9 rare grammars + `faster-whisper-ts` moved to `peerDependenciesMeta`); Track E Lot 4-safe (graphology + commander + @types/node major bumps); Track E Lot 5 (tree-sitter override). Plus the durable intentional deltas listed under `Fork Guardrail`. | bilan #1 must-port rows from `v7` post-`a9b0ddb` line (`F-P1` Windows/hook stability, `F-P2` graph correctness + MCP watch, `F-M1` SQL/Groovy parser depth — see Track F in `PLAN.md`). Upstream stable tag at bilan #1 is `graphify@0.8.5`. v1.x hypergraph + v2.x wiki rewrite explicitly deferred under `F-Opt`. | Track F bilan #1 (2026-05-15). |

### Numerical interpretation note

`@sentropic/graphify@0.10.0` (released 2026-05-26) is the package rename of the `graphifyy@0.9.8` line: the closest audited upstream parity point stays at `v0.8.18` (closing both the `0.8.16` and `0.8.18` drift intakes), and the minor bump carries the packaging change, not a parity advance. Post-tag `main` already carries early ports from the next window (F-0819-P1/P2 via PRs #87/#88, F-0831-P1-security via PR #93), all unreleased on npm. The remaining `v0.8.x` residuals are the skill `scan_root` subfolder breakdown (intentional-delta), the parked F-0816/F-0818 bash extractor hardening, the deferred SCIP / symbol-resolution helpers, and the deferred `#996` cross-language semantic-contexts feature (detailed sizing presentation delivered 2026-06-08, scope decision pending). `v1.0.0` remains a non-target (lightweight tag on a divergent git-hook commit). The next parity number can only advance after the formal bilan of the `v0.8.18..v0.8.31` window (104 upstream commits fetched locally through `7a588fb`), which must also pick the release vehicle for the merged-unreleased lots (patch `0.10.1` vs minor `0.11.0`).

**v2 hypergraph status (revised 2026-05-20):** the planned Lot **F-H1+F-H2** (hypergraph data layer + HTML shading + report section) is **already-covered**. The TypeScript port has carried the v2 hypergraph schema since the initial bootstrap of this repo: `src/build.ts:218` propagates `hyperedges` from the extraction JSON into the graph attributes; `src/export.ts:414` writes the top-level `hyperedges` field of `graph.json` from those attributes; `src/export.ts:672 hyperedgeScript()` renders the convex-hull shaded regions on the vis.js canvas (matches upstream `d23ae17`); `src/build.ts:317` merges hyperedges from multiple extractions (matches upstream `6570488`); `src/report.ts:248` adds the `## Hyperedges (group relationships)` section. End-to-end tests live in `tests/hyperedges.test.ts` (23 cases on the typed data layer), `tests/merge-driver.test.ts` (`union-merges graph.json nodes, links, hyperedges, and labels`), `tests/portable-artifacts.test.ts` (`hyperedges` portable check), and inline in `tests/cache.test.ts` / `tests/cli-runtime.test.ts` / `tests/profile-pipeline.test.ts` / `tests/direct-llm-extract.test.ts` / `tests/llm-execution.test.ts`.

What branch `feat/track-f-h1-hypergraph` ships is therefore a **typed data-layer cleanup**, not an adoption: a centralized `src/hyperedges.ts` module with runtime `validateHyperedge` plus `mergeHyperedges`, `setHyperedges`, `loadHyperedges` helpers, replacing direct `G.graph["hyperedges"]` access in `merge-graphs.ts` and `merge-driver.ts`. No schema change. No graph-output difference. The earlier prediction that the next bump (`0.10.0`) would carry the hypergraph schema delta is **withdrawn**: there is no v2-hypergraph schema delta to ship.

The remaining `F-Opt` buckets are now `graphify prs` and the `v2` wiki rewrite — both still deferred until a dedicated impact pass is accepted by the user.

### Update rule

This section must be updated:

- on every weekly Track F bilan that changes the bilan-#N row,
- on every TypeScript minor (`0.X.0`) or major (`X.0.0`) bump as part of the release gate,
- when an `Open F decision` resolves and changes the mapping (e.g. `F-Opt` moves from `defer` to `must-port`, or `F-M1` is parity-claimed against `v0.8.5`).

Bilan snapshots may not be deleted; older mapping rows are appended above with their bilan date so the historical drift trace stays auditable.

## Release Gate

Before claiming catch-up through the effective Python `0.7.10` release train (`upstream/v7` through `0c29b2c`, plus audited post-tag fixes) or publishing the next TypeScript release from this branch:

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
