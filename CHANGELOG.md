# Changelog

Full release notes with details on each version: [GitHub Releases](https://github.com/safishamsi/graphify/releases)

This fork (`graphifyy@*`) is the TypeScript line. Pre-`0.7.x` entries below refer to the upstream Python Graphify line.

## Unreleased

- **Agent-stats project/conversation graph (`graphify agent-stats project-graph`).** Builds a rename-aware graphify `graph.json` from agent-stats session facts — nodes = project / repo / agent / session / branch / commit; edges = `belongs-to`, `rename-lineage`, `worked-in`, `conducted-by`, `touched-branch`, `produced`, `derived-from` (codex sub-agent lineage). The headline feature is **rename reconciliation**: a project that was renamed/moved on disk (e.g. `~/src/sentropic` → `~/src/graphify`) fragments into several cwd-path identities (agent-stats keys repo membership off the path, not the git remote); a `ProjectIdentity` (canonical id + ordered path/remote aliases) collapses those incarnations into ONE project node, chains them with `rename-lineage` edges, and rolls every session up to the single project. `--studio` exports a renderable static studio next to the graph (pinned force-layout positions). Stable schema `graphify.agent-stats.project-graph/v1`. Defaults to the sentropic→graphify lineage; `--config <identity.json>` for any project.

### Agent stats — `graphify agent-stats` (shipped 0.10.1 + 0.13.1)

Retroactive note: the agent-stats subsystem shipped incrementally without its own changelog line. It indexes agentic-CLI conversation transcripts already on disk (Claude, Codex, agy/Antigravity) and attributes branches/commits/work-packages to agent *sessions* by ranked evidence (commit-sha printed in tool output > Codex thread-ids > h2a registry > worktree×branch×time-window > PR-merge), because git authorship is uniform and uninformative here. Re-derivable store at `.graphify/agents/facts.jsonl`; anonymized citation excerpts as evidence. Surface: `graphify agent-stats` (per-agent table), `agent-stats report`, `agent-stats sync`, `agent-stats sessions`, `agent-stats wp <trackItemId>`; stable `graphify.agent-stats/v1` + `graphify.agent-stats.sessions/v1` schemas. MVP through Phase 1.5 (transcript parsing, evidence attribution, Track-WP join, privacy/correctness fixes — PRs #129/#130/#133/#134/#135) landed in **0.10.1**; Phase 2 (versioned JSON, agy/Gemini parser parity, `report` command, committer-precedence, attribution-quality tests — PR #142) landed in **0.13.1**.

## 0.15.0 (2026-06-19)

**BREAKING** — Removed the legacy vis-network `graph.html` output and all of its code (the `export html` command, the `--html` / `--no-viz` flags, `toHtml` / `buildGraphHtml`, the `outputs.write_html` config knob). The visual output is now a **static Ontology Studio export**: the default pipeline writes `.graphify/studio/`, and the new `graphify studio export <out>` command produces a self-contained static studio (SPA + data JSONs with force-layout positions) that opens with any static file server. Existing projects migrate automatically — a stale legacy graph viz is deleted on the next run. All skill variants were rewritten to point to the studio export.

## 0.14.0 (2026-06-13)

Exhaustive per-entity citations with tiered lazy storage and a corpus-type-aware citation policy — on by default, no API key required.

- **Exhaustive citation capture — true `citation_count`.** Every entity now accumulates *all* of its supporting source spans across extraction, reconciliation, and merge. Duplicate-entity citations are unioned at every assembly/merge boundary (standalone `merge-semantic`/`merge-extraction`, `finalize-update`, and the git merge-driver — which now unions node citations instead of last-write-wins), so re-runs and concurrent branches no longer drop the exhaustive tail. `node.citation_count` reflects the real number of distinct supporting spans, not just the inlined sample.
- **Tiered lazy storage.** `graph.json` stays small: each entity carries a K-bounded, deterministic top-K `citations` sample plus the true `citation_count`. The full citation list is co-derived into `.graphify/ontology/citations.json` (written atomically alongside `graph.json` via `persistGraphWithCitations`) and served on demand through the entity sidecar (`buildEntitySidecar` Level-2 store) — so the graph loads fast and the complete evidence is one lazy fetch away.
- **Corpus-type-aware describe cap.** The per-node citation cap auto-resolves by corpus type (3 for code / 10 default / all for long-docs & entity corpora), with precedence CLI > config > corpus > global. New `--citation-cap` (`describe`/`label`/`update`) and `--citations-top-k` (`extract`/`update`/`watch`) flags override it, and `graphify backfill-citations` retro-projects exhaustive counts onto a legacy graph (lossy lower-bound, idempotent).
- **Studio shows the truth immediately.** The entity panel renders the real `citation_count` from `graph.json` on open and lazy-loads the full grouped-by-file list from the sidecar only when expanded — no blank/under-count while the full list streams in.
- **No-key by default; safe migration.** The whole pipeline runs without an API key via the assistant/skill path. A legacy graph (inline-only citations) is handled with a warn + legacy-inline fallback; the LLM-free `hook-rebuild` re-projects citations deterministically with a no-shrink guard, so a fast git-hook rebuild never silently shrinks a previously exhaustive count.

Minor bump (new default-on exhaustive-citations feature + tiered storage; `@sentropic/graph` unchanged at 0.1.3).

## 0.13.2 (2026-06-13)

New non-destructive `graphify describe [path]` top-level command: stamps `node.description` onto an existing `graph.json` without re-extracting from source. Mirrors `graphify label [path]`. Use when `graphify update` would re-extract and destroy a curated graph (e.g. the mystery corpus: 1 193 curated nodes).

- **`graphify describe [path]`** loads the existing graph.json, runs the same `generateNodeDescriptions` pipeline as `graphify update --description`, and writes back — preserving node IDs, edges, communities, and all other node attributes unchanged. Only `description` is added/updated.
- **Flags**: `--description-backend <provider>`, `--description-model <id>`, `--description-mode assistant|direct` (same resolution as `graphify update`), `--fill-missing` (idempotent gap-fill).
- **Assistant mode** (default no-key): emits `.graphify/description-instructions/` batches for the host assistant; ingests on re-run; lifecycle cleanup from 0.13.1 applies.
- **Skill.md updated** to document `graphify describe` as the non-destructive counterpart to `graphify label`.

Patch bump (new command, no schema change). `@sentropic/graph` unchanged at 0.1.3.

## 0.13.1 (2026-06-13)

Description-contract correction: `graph.json` `node.description` is the canonical description; the wiki sidecar only enriches/fills gaps and never masks or blanks a valid canonical description.

- **Exports honor `node.description`.** `export wiki`, `export html`, and `export obsidian` now render a node's `description` from `graph.json` when no fresh `generated` wiki sidecar exists (previously they showed a Description only when a sidecar was passed, so a correctly-described graph rendered blank). Precedence is `node.description` > fresh `generated` sidecar > none, consistent with the Studio entity panel. `insufficient_evidence`/stale sidecars never blank a node that has a canonical description.
- **Per-node sidecar freshness.** A wiki sidecar is staled by a change to *its own* node's describe-relevant attributes, not by any unrelated byte change to `graph.json`.
- **Bigger default describe coverage.** `graphify wiki describe` defaults to the top **100** node + **100** community targets (was 10/12); `--max-nodes 0` / `--max-communities 0` = unlimited. The canonical `graphify update` describe path already covers all describable nodes by default.
- **Honest assistant-mode pending state.** When `graphify update` runs in no-key assistant mode and emits instruction files that are never answered, `check-update` now reports the pending work (instead of falsely "current"); instruction files are cleaned up on a completing run, so a stale orphan no longer causes a permanent false-pending. The `--no-description` opt-out still never marks the graph stale.
- **Ungrounded-node visibility.** The describe coverage report now counts entity nodes that have no citations/evidence (left undescribed by the anti-hallucination policy) instead of silently excluding them.

Patch bump (export/render + describe-flow correctness; no graph-schema or CLI-contract change). `@sentropic/graph` unchanged at 0.1.3.

## 0.13.0 (2026-06-12)

Node descriptions and community labels now work **by default without any API key** — via the assistant/skill (CLI) path — for both code and non-code nodes.

- **No-key default — emit/ingest two-step for descriptions.** When no API key or LLM backend is configured, `graphify update` emits per-batch instruction `.md` files under `.graphify/description-instructions/` (one per ~40-node batch). The host assistant fills each `batch-NNN.json` answer file; the next `graphify update` ingests them and stamps `source: "assistant"`. With a key the direct path is used as before.
- **No-key default — emit/ingest for community labels.** Same pattern for community naming: `.graphify/label-instructions/communities.md` lists all communities; the assistant fills `communities.json` with 2-5 word names; the next run ingests and applies them (`source: "assistant"`). The `applySalientCommunityLabels` merge now accepts `source === "assistant"` in addition to `"llm"`.
- **Auto-mode selection.** `DescriptionMode` and `LabelMode` are auto-resolved: "direct" when an API key or injected `callLlm` is present, "assistant" otherwise. Override with `--description-mode direct` / `--label-mode direct` CLI flags.
- **skill.md updated.** Step 5 in the graphify skill now documents the full emit → fill answer files → ingest cycle, with example JSON formats, so the host assistant knows exactly what to write.

Minor bump (new no-key assistant/skill default; `@sentropic/graph` unchanged at 0.1.3).

## 0.12.0 (2026-06-12)

Two reliability guarantees for the semantic layer, both on by default.

- **Descriptions on by default, everywhere — reliable and grounded.** Every `graphify update` now generates node descriptions by default (opt out with `--no-description`). Descriptions are entity-aware and citation/evidence-grounded against the source, transient backend errors are retried, and a coverage report tells you exactly how many describable nodes were described. `graphify update --fill-missing` is an idempotent gap-fill that only (re)describes nodes whose `description` is still empty — so a run interrupted by a missing key or a flaky backend can be completed later without re-spending tokens on already-described nodes. The fast git-hook rebuild stays LLM-free and drops a `.graphify_describe_pending` marker that the next default-on `update` consumes (surfaced by `check-update`), so no graph ever ships silently bare.
- **Salient community labels systematic by default — opt out with `--no-label`.** After Louvain clustering, communities are named with concise salient LLM labels by default instead of generic `Community N` placeholders, persisted to `graph.json` and `GRAPH_REPORT.md`. Degrades gracefully (keeps the generic names plus a one-line stderr note) when no LLM backend is configured, and never re-spends tokens when every community already has a non-generic name.

Minor bump (new default-on describe + label behaviour; `@sentropic/graph` unchanged at 0.1.3).

## 0.11.1 (2026-06-12)

Studio reconciliation-view rendering fixes (`@sentropic/graph` 0.1.3).

- The two entities of a reconciliation candidate now always render as identical labelled boxes — previously the high-degree canonical became a box while the lower-degree candidate twin stayed a diamond (the god-class label gate is degree-based), so same-type twins looked different.
- The two focal boxes no longer overlap: the side-by-side pin offset is computed from the actual box label widths (zoom-independent) instead of a fixed constant.

Patch bump (studio view-layer fixes; no CLI, schema, or storage change).

## 0.11.0 (2026-06-12)

Native database storage backends + studio rendering refinements.

- **Storage:** native `Spanner`, `Postgres`, and `pgvector`/GraphRAG backends on the `GraphStore` port (neo4j/file unchanged). Postgres ships `graph_nodes`/`graph_edges` with a composite + GIN(`french` full-text) + GIN(jsonb) index set, a single-JOIN neighbour query, and writes the S3-replayable `graph/{city}/latest.json` from `pushGraph`. A sibling `VectorStore` port + `pgvector` (HNSW cosine) backs GraphRAG. Drivers are `optionalDependencies`, lazily imported (import-guard enforced).
- **Studio (`@sentropic/graph` 0.1.2):** box glyph reduced to a fixed, degree-independent legacy size; the labelled rounded-box is now reserved to the data-driven "god-class" (the highest-degree node type) instead of `Work`; the largest non-box glyphs grown ~20%; expanding a left-rail menu no longer re-renders/shifts the graph or resets the camera; the on-canvas legend was replaced by reliable per-type shape glyphs in the rail; hollow/solid + bold/normal shape variants; DS-compliant header.

Minor bump (new storage backends). No breaking change to the CLI contract or graph schema.

## 0.10.1 (2026-06-11)

Studio renderer parity with the legacy vis-network view (no change to the CLI contract or graph schema).

- `@sentropic/graph` renderer: node-type boxes (`shape: box`/`roundedbox`) are drawn on the canvas sized to the node, with the label scaled to fit and a single centred text; edges are clipped to each node's border for every shape; force-layout spacing tuned toward the legacy look.
- Studio: box label rendering deduplicated (no overlay duplicate/oversize); the reconciliation view uses the same box rendering.
- Patch-bump `@sentropic/graph` → 0.1.1 (source renderer changes; the studio builds from source).

Patch bump (rendering-parity fixes, no API or schema change).

## 0.10.0 (2026-05-26)

Package rename: the npm package is now **`@sentropic/graphify`** (previously `graphifyy`). The CLI and skill command are unchanged — still `graphify`.

- `package.json` name → `@sentropic/graphify` with `publishConfig.access: public` (scoped public package).
- Install/uninstall guidance, embedded `require(...)` snippets, README (en/zh/ja), and the CI smoke/post-publish checks now reference `@sentropic/graphify`. Historical `graphifyy@x.y.z` version labels in CHANGELOG/PLAN/UPSTREAM_GAP are left as-is (those releases were published under the old name).
- A forwarding shim is published as `graphifyy` (`forward/graphifyy/`): it depends on `@sentropic/graphify` and re-exports it, so `npm i -g graphifyy` and `require('graphifyy')` keep working. `graphifyy` is then `npm deprecate`d with a "moved to @sentropic/graphify" notice.

Minor bump (rename is a packaging change, not a behavior change). No CLI contract change, no graph schema change.

## 0.9.8 (2026-05-26)

Track F 0.8.18 drift closure. Advances the closest audited upstream parity point to `graphify@0.8.18`. Bilan #3 + cadrage recorded the 12-commit `v0.8.16..v0.8.18` drift; this release ports the lots accepted for the TypeScript line:

- **F-0818-P1** — case-sensitive call resolution (upstream `4dce16f`, `#993`/`#991`): `_extractGeneric` now resolves callee names case-sensitively, keeping case-insensitive resolution only for PHP. A lowercase `render()` call no longer phantom-links to a `Render` class/function that merely differs by case.
- **F-0818-M1** — hook/skill hygiene (upstream `71b4e57`): `graphify hook install` targets the user-editable `.husky/` instead of Husky 9's auto-generated `.husky/_` wrapper dir (`#987`); the bundled skills no longer pass the unsubstituted `INPUT_PATH` literal to `generateReport` (`#986`), which previously titled `GRAPH_REPORT.md` literally "INPUT_PATH".
- **F-0818-M2** — `backupIfProtected` is rate-limited to one dated folder per day (upstream `3efae38`): identical `graph.json` skips the re-copy; changed content overwrites the dated folder in place instead of accumulating `_N` suffixes.
- **F-0818-M3** — constrained query expansion skill guidance (upstream `238702b` + Unicode vocab regex from `a4a615d`, `#998`): the `/graphify query` workflow now expands the question against the actual node-label vocabulary (`.graphify/.vocab.txt`, captured with the Unicode regex so Cyrillic/CJK labels survive) and forbids inventing tokens.

Already-covered upstream fixes (no port needed, verified against `main`): per-worker semantic-extraction exception isolation (`#943`), community reconstruction from per-node attributes when the analysis sidecar is missing (`#1001`), and Java `extends`→`inherits` canonicalization.

Non-target: upstream tag `v1.0.0` is a lightweight tag on a divergent "git commit hook" commit (not a `v8`-line release); its auto-rebuild-after-commit feature is already covered by `graphify hook-rebuild`. Parked: F-0818 bash extractor hardening (no bash extractor yet) and the `#996` cross-language semantic-contexts feature (deferred pending a sizing mini-spec). See `spec/SPEC_TRACK_F_0818_BILAN.md` and `UPSTREAM_GAP.md > Active 0.8.18 Drift Intake`.

Patch bump only; no breaking CLI contract, no graph schema change.

## 0.9.7 (2026-05-24)

Track F 0.8.16 drift closure.

Ports / closes the 0.8.16 intake lots that were accepted for the TypeScript line:

- Project-scoped skill installs (`graphify install --project` and per-platform `--project`) so assistants can be installed into the current repo instead of only user-global locations.
- Unicode / CJK correctness and query hygiene: non-ASCII labels survive dedup, non-English search terms remain searchable, all-chunk semantic extraction failure exits non-zero, `GRAPHIFY_MAX_OUTPUT_TOKENS` is honored, and `cluster-only` creates its missing output dir gracefully.
- Security hardening: 512 MiB `graph.json` loader/writer guard, bounded `sanitizeMetadata`, vis-network CDN SRI pin, wiki export sanitization, `--exclude` detect/extract flag, `.gitignore` fallback, and NAT64 / IPv4-mapped SSRF handling.
- Parser / graph-quality fixes: `.ets` extension support, env(1) shebang option parsing, Swift extension dedup, JS/TS barrel `re_exports` graph edges, and stale-code-node pruning during rebuild/finalize.
- Review impact: `review-delta --depth` and `review-delta --affected` now cover deeper import-resolution flows without adding a parallel top-level `affected` verb.
- Skill merge hardening: untrusted semantic fragments are validated and sanitized before merge/cache/finalize paths; malformed fragments are skipped with warnings instead of crashing.

Traceability notes:

- The upstream `semantic_cleanup.py` name maps to semantic-fragment validation, not stale-node pruning. The TypeScript port intentionally names that module `semantic-fragment-validation.ts` because `semantic-cleanup.ts` is reserved here for the graph stale-node pruning shipped as the local graph-level pair to the stale-wiki-node fix.
- F-0816-M3 (bash extractor hardening) remains parked until the bash extractor itself lands. SCIP ingestion and Python/bash symbol-resolution helpers remain deferred until requested.
- Patch bump only; no breaking CLI contract. Additive graph schema delta: `re_exports` edges.

## 0.9.6 (2026-05-20)

Track F-M2 upstream parity follow-up — port the 6 commits between upstream `v0.8.11` and `v0.8.13` worth porting to the TypeScript line. Also rolls in the Track C-3.5 visual encoding feature that landed mid-cycle.

Ports from `upstream/v8`:

- `2d783e5` — cohesion unrounding so `GRAPH_REPORT.md` no longer rounds away near-perfect community cohesion, `save_manifest` no longer seeds with the wrong cache state, and the cluster CLI exposes `--resolution` / `--exclude-hubs`.
- `d84f07c` — node-ID dedup so two distinct nodes can no longer collide on the same canonical id, `extract` cache fastpath when the semantic cache is byte-identical to the previous run, and absolute `source_file` paths get relativized to the scan root before persistence.
- `f5fea13` — LLM provider responses with empty / filtered `choices` or `null` `message` no longer crash the extract; a clear warning is logged and the chunk is recorded in the failed-chunk manifest.
- `6939494` — `backupIfProtected` writes a snapshot of `.graphify/graph.json` before overwriting it whenever the previous graph carried semantic/curated content.
- `2209a9c` — bare `graphify <path>` is now treated as `graphify extract <path>` instead of failing with "unknown command".
- `850c545` — large-corpus gate `FILE_COUNT_UPPER` raised from 200 to 500 files so typical 200-500 file codebases no longer hit the warning on a fresh extraction.

Also released in this version (was the `Unreleased` block before):

- **Track C-3.5** — profile-aware visual encoding per ontology node type. `ontology-profile.yaml` may now declare a vis.js `shape` and a `color_hex` per `node_types.*.visual_encoding` (validated against `dot / square / triangle / box / diamond / star / hexagon` and `^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$`). `graphify export html` and the implicit HTML re-export consume the profile in priority over `inferNodeShape(file_type, source_file)`. `--profile <path>` lets a profile be applied ad-hoc. No graph schema change.

Intentional deltas vs upstream (recorded in `UPSTREAM_GAP.md`):

- The skill-level `scan_root` subdirectory breakdown from upstream `a234c52` is not ported: the TypeScript skill runtime does not consume the same dictionary shape as the Python skill, and the fast-path "run `graphify query` when `graph.json` exists" guidance is already shipped here via PR #891 (port to 0.9.2).
- Numerical: the patch bump advances closest audited parity to upstream `v0.8.13`. The remaining `0.8.x` rows recorded in `UPSTREAM_GAP.md` are intentional-delta (skill subfolder docs) and `F-Opt` deferrals (hypergraph data layer is queued as Lot F-H1+F-H2, separate PR).

## 0.9.5 (2026-05-19)

Track F upstream parity follow-up — Rust cross-crate `INFERRED` suppression.

- Port upstream `f7160c8` / `v0.8.10`: Rust `scoped_identifier` calls now resolve against an in-file local `Type::method` index, instead of being collapsed onto any same-named symbol in the corpus. Eliminates spurious cross-crate `INFERRED` call edges between sibling impls that share method names.
- Plain identifier and field-expression call sites keep the label-based fallback; only the over-broad `scoped_identifier` path is narrowed.
- Advances the closest audited upstream parity point to `graphify@0.8.10`. Only `2d783e5` (cohesion unrounding + hook/detect follow-ups) remains as the next recommended `upstream/v8` parity row before any stronger `v0.8.x` parity claim.
- Patch bump only; no graph schema change.

## 0.9.4 (2026-05-17)

Track F upstream parity follow-up.

- Port Windows/hook stability fixes for Antigravity `.agents`, Windows PowerShell skill output, and hook rebuild logging.
- Port graph correctness fixes for short-label dedup guards, symlink realpath discovery, cross-language inferred structural scoring, MCP graph hot-reload, deletion pruning, and community label normalization.
- Add SQL trigger/procedure extraction and a dependency-free Groovy/Gradle regex extractor for imports, inheritance/interfaces, methods, Spock features, and local call edges.
- Patch bump only; no graph schema change.

## 0.9.3 (2026-05-17)

Track E major-upgrade follow-up.

- Bump `neo4j-driver` to 6.0.1, `typescript` to 6.0.3, and `vitest` to 4.1.6.
- Keeps optional install-footprint dependencies opt-in; `npm outdated --depth 0` only reports intentionally missing optional peers after this pass.
- Patch bump only; no graph schema change.

## 0.9.2 (2026-05-16)

Track F / E patch release.

- Port upstream PR #891's query-first assistant guidance to the TypeScript installer surfaces. Installed project files, hooks, OpenCode plugin text, bundled skills, README, `CLAUDE.md`, and `AGENTS.md` now prefer `graphify query` / `graphify path` / `graphify explain` and keep `GRAPH_REPORT.md` as broad-context fallback.
- Existing installs are refreshed in place instead of keeping stale report-first sections for Claude, Gemini, AGENTS-based platforms, VS Code Copilot instructions, Cursor, Kiro, and Antigravity.
- Add Node 24 to the main TypeScript CI matrix and move direct-LLM/smoke release validation to Node 24.
- Patch bump only; no graph schema change.

## 0.9.1 (2026-05-16)

Track A finalisation — additive proof.

- Adds an end-to-end test wiring `@sentropic/llm-mesh` into `generateWikiDescriptionSidecars` mode `mesh` via `meshTextJsonClient(createGraphifyMesh(...))`. The A3 scaffold shipped in `0.8.x` was plug-compatible; this release makes the bridge provably exercised in CI (PR #33).
- No source change, no public surface change. Pure confidence release.

## 0.9.0 (2026-05-16)

Track E Lot 1 — install footprint cut.

**Default `npm install graphifyy` footprint: 1.7 GB → 512 MB (−1.2 GB / −71%).** Users who actually need rare languages or audio transcription opt in with one explicit `npm install`. The user-facing surface changes (some grammars now require explicit install) is the reason for the minor bump.

### Moved from `optionalDependencies` → `peerDependencies` + `peerDependenciesMeta { optional: true }`

| Package | Size (with transitives) |
|---|---:|
| `faster-whisper-ts` + `onnxruntime-node` transitive | 668 MB |
| `tree-sitter-julia` | 95 MB |
| `tree-sitter-swift` | 73 MB |
| `tree-sitter-objc` | 73 MB |
| `tree-sitter-c-sharp` | 66 MB |
| `tree-sitter-scala` | 53 MB |
| `tree-sitter-zig` | 34 MB |
| `tree-sitter-kotlin` | 32 MB |
| `tree-sitter-elixir` | 8 MB |
| `tree-sitter-powershell` | small |

### Kept in `optionalDependencies` (still installed by default)

`tree-sitter-typescript`, `tree-sitter-javascript`, `tree-sitter-python`, `tree-sitter-go`, `tree-sitter-rust`, `tree-sitter-java`, `tree-sitter-c`, `tree-sitter-cpp`, `tree-sitter-php`, `tree-sitter-ruby`, `tree-sitter-lua`. These cover the bulk of real-world corpora.

### User opt-in pattern

```bash
npm install graphifyy                                          # core, ~512 MB
npm install graphifyy tree-sitter-julia                        # + Julia
npm install graphifyy tree-sitter-julia faster-whisper-ts      # + audio/video
```

Existing `src/extract.ts` `await import(...)` + try/catch path already degrades gracefully when a grammar package is missing, so no source change is needed for the runtime fallback.

`npm test`: 600 passed, 7 skipped, 0 failed (no behaviour change vs 0.8.2).

## 0.8.2 (2026-05-16)

Track E hygiene — install ergonomy and dep-bump pass.

- **Lot 5 — tree-sitter peer override**: single root `overrides: { "tree-sitter": "^0.26.8" }` collapses the ~15 ERESOLVE peer-conflict warnings emitted by `npm install` (without `--legacy-peer-deps`) down to 1 `peer overridden` warning. The 18 optional `tree-sitter-*` grammars span peer ranges `^0.21.x` / `^0.22.x` / `^0.25.x`; the root pins `^0.26.8`. No source change.
- **Lot 4-safe — three current-stable major bumps**: `graphology 0.25 → 0.26`, `@types/node 22 → 25`, `commander 12 → 14`. Each is low-blast-radius (Set/Map iteration tightening, dev-dep type ergonomics, stable parser builder pattern). The four risky bumps (chokidar, neo4j-driver, typescript, vitest) stay as a separate Lot 4-risky.

`npm test`: 600 passed, 7 skipped, 0 failed (no behaviour change vs 0.8.1).

## 0.8.1 (2026-05-15)

Track C3 — non-color-only visual encoding for `graphify export html`.

- `inferNodeShape(fileType, sourceFile)` maps file_type and path to vis.js shape: tests → `square`, `.d.ts` → `diamond`, `.yaml/.toml/...` → `triangle`, document/paper → `box`, image → `star`, video → `hexagon`, default code → `dot`. Hardcoded code-corpus defaults; profile-aware override is the C3.5 follow-up.
- `inferEdgeDashes(relation, confidenceTier)` maps relation to dash pattern: `imports_from` → `[6, 4]`, `tested_by`/`validated_by` → `[2, 4]`, `inherits`/`extends`/`implements` → `[10, 4]`. Falls back to confidence (solid for EXTRACTED, dashed otherwise) for unknown relations.
- VisNode now carries per-node `shape`; vis.js global `nodes: { shape: 'dot' }` removed. VisEdge carries per-edge `dashes` + `relation`.
- Sidebar adds two static legends: **Shapes** (file_type → glyph + word) and **Edges** (relation → dash + word), both `aria-labelledby`.
- Node info panel surfaces the resolved shape next to the file_type so users can map shape → meaning.

`npm test`: 600 passed, 7 skipped, 0 failed (vs 597 in 0.8.0).

## 0.8.0 (2026-05-15)

Post-`0.7.19` minor: review-precision CLI, mesh bridge scaffold, office libs swap with `npm overrides`, and HTML accessibility pass.

### Track C1 — review-precision CLI

- New module `src/review-store.ts` exposes `ReviewGraphStoreLike` (read-only Graphology adapter modelled after the CRG `GraphStore`): node/edge lookup, kind filtering, impact radius, transitive tests, community lookup, graph stats, path normalisation (Windows backslashes + leading `./`), dedupe on multi-range hits.
- New CLI commands: `graphify review-context`, `graphify detect-changes`, `graphify minimal-context`, `graphify affected-flows`, `graphify flows build`, `graphify review-eval`.
- New review pipeline modules: `review-context`, `detect-changes`, `minimal-context`, `flows`, `review-benchmark`. 34 vitest cases cover F3..F12 of the CRG alignment matrix.
- Edge-relation canonicalisation: `extends` → `INHERITS`, `implements_interface` → `IMPLEMENTS`, etc.

### Track A3 — `@sentropic/llm-mesh` bridge (scaffold)

- New dep `@sentropic/llm-mesh@0.1.0`.
- New module `src/llm-mesh-bridge.ts`: `createGraphifyMesh()` builds a mesh from default provider adapters, `meshTextJsonClient(mesh)` wraps it as a graphify `TextJsonGenerationClient` for the wiki-description-generation `mesh` mode. Wiring of wiki-description-generation against the bridge follows in a future commit.

### Track E Lot 2 — office libs swap

- Removed: `exceljs@4.4.0` (27 MB, 6 transitive deprecations), `mammoth@1.8.0` (3.4 MB), `pdf-parse@1.1.1` (36 MB, unmaintained since 2018).
- Added: `officeparser@7.0.2` (3.4 MB), `unpdf@1.6.2` (3.1 MB).
- npm `overrides` stub officeparser's `pdfjs-dist` (45 MB) and `tesseract.js` (~70 MB) hard deps to `empty-npm-package@1.0.0`, shrinking officeparser's footprint to ~6.5 MB while keeping ODT/PPTX/RTF/DOCX/XLSX support. PDF parsing always routes through unpdf so the pdfjs stub is never reached.
- Net default install: **−59 MB** on office libs, +scope (PPTX, ODT, ODS, ODP, RTF, CSV, MD, HTML extraction).
- `src/types/optional-deps.d.ts` declares minimal types for `officeparser` and `unpdf` so the DTS build still passes when CI installs without optional deps.

### Track C2 — HTML accessibility

- `graphify export html` (`toHtml` in `src/export.ts`) ships WCAG-AA-friendly accessibility patterns: skip link to controls, ARIA live region announcing graph state and selection, graph container with `role=application` and descriptive `aria-label`, search as ARIA combobox with labelled input and `role=listbox` results, vis.js keyboard navigation (arrows pan, +/- zoom, Enter selects, Esc deselects), F1/`?` help dialog (`role=dialog`, `aria-modal=true`), high-contrast toggle (`aria-pressed`) + `body.high-contrast` overrides + `@media (prefers-contrast: more)` pickup, `:focus-visible` outline rings, WCAG-AA contrast bumps.

### Tests

`npm test`: **597 passed**, 7 skipped, 0 failed (vs 579 in 0.7.19).

## 0.7.19 (2026-05-14)

Promote `0.7.19-rc.1` to stable after the real-corpus smoke run:

- `graphify update` regenerated the local repo graph (2570 nodes, 4987 edges, 110 communities) and the public mystery pack graph (60 nodes, 81 edges, 7 communities) without regressions.
- `portable-check` stays green on the graphify repo. Two pre-existing false positives on `graph.html` comment lines in the public pack are recorded as an intentional-delta in the scanner and tracked separately.
- `npm test` 574 passed / 7 skipped / 0 failed; build OK.

No code changes versus `0.7.19-rc.1`; see that section for the feature list.

## 0.7.19-rc.1 (2026-05-14)

Post-`0.7.10` product acceleration. Ships parity ports for upstream Python Graphify `v0.7.11..v0.7.19` and product accelerators on Descriptions and Reconciliation.

### Drift parity (`0.7.11..0.7.19`)

- Port `.astro` extraction with regex-rescue for frontmatter + `<script>` block static and dynamic imports, tsconfig path aliases resolved (upstream `#850`, `#852`).
- Port watch `.rebuild.lock` lifecycle: single PID line on acquire, unlink on release, live-PID `kill -0` check, stale-PID overwrite (upstream `#858`, `#859`).
- Port `--no-cluster` flag for `graphify update` plus topology short-circuit that reuses existing community ids when the merged AST topology is unchanged (upstream `#824`).
- Port `graphify extract --backend claude-cli` (writes assistant instructions, no provider API key read or persisted; upstream `#855`).
- `graph.json` now embeds `topology_signature` so writers and the watcher agree on the same recipe.

### Reconciliation (Track B infra)

- `graphify ontology studio --write` exposes `POST /api/ontology/patch/{validate,dry-run,apply}` behind a loopback bind and a random hex24 bearer token (or `--token <value>`). All routes reuse the patch core; 401 without token, 405 without `--write`, 413 above 256 KB.
- Public-pack ontology UAT config (`graphify.yaml`, ontology profile, decision log path) committed to the external `public-domaine-mystery-sagas-pack` repository.

### Descriptions (Track A infra + UI)

- Cache invalidation: `checkWikiDescriptionFreshness` / `selectFreshWikiDescriptions` detect `graph_hash`, `prompt_version`, `mode`, `provider` and `model` divergence; the export pipeline filters stale sidecars at load time with a `console.warn` listing how many were dropped.
- Ontology entity wiki pages now render validated description sidecars when `compileOntologyOutputs({ descriptions })` (or `graphify profile ontology-output --descriptions`) is invoked. `insufficient_evidence` sidecars are silently omitted.

### CRG (Track C spec only, no implementation in this release)

- Row-level audit of CRG `v2.3.3` features committed to `UPSTREAM_GAP.md`: 15 review-precision features classified (9 `adopt-review`, 2 defer, 0 reject) plus a separate audit pass that catalogs HTML a11y / node-shape / help-overlay opportunities for future C1/C2/C3 lots.

### Internals

- `PLAN.md` now scores each lane on six dimensions (spec / plan / infra / UI / UAT / release) instead of a single percentage.

## 0.3.17 (2026-04-08)

- Add: Julia (.jl) support — modules, structs, abstract types, functions, short functions, using/import, call edges, inherits edges via tree-sitter-julia (#98)
- Fix: Semantic extraction chunks now group files by directory so related artifacts land in the same chunk, reducing missed cross-chunk relationships (#65)
- Fix: `tree-sitter>=0.21` now pinned in dependencies — prevents silent empty AST output when older tree-sitter is installed with newer language bindings (#52)
- Add: Progress output every 100 files during AST extraction so large projects don't appear to hang (#52)

## 0.3.16 (2026-04-08)

- Fix: `graphify query`, `serve`, and `benchmark` now work on NetworkX < 3.4 — version-safe shim for `node_link_graph()` at all call sites (#95)
- Fix: `.jsx` files now detected and extracted via the JS extractor — added to `CODE_EXTENSIONS` and `_DISPATCH` (#94)
- Fix: `.graphify_python` no longer deleted in Step 9 cleanup across all 6 skill files — pipx users no longer hit `ModuleNotFoundError` on follow-up commands (#92)

## 0.3.15 (2026-04-08)

- Feat: Trae and Trae CN platform support (`graphify install --platform trae` / `trae-cn`)
- Fix: `skill-droid.md` was missing from PyPI package data — Factory Droid users couldn't install the skill
- Fix: XSS in HTML legend — community labels now HTML-escaped before `innerHTML` injection
- Fix: Shebang allowlist validation in `hooks.py` and all 6 skill files — prevents metacharacter injection from malicious binaries
- Fix: `louvain_communities()` kwargs now inspected at runtime for cross-version NetworkX compatibility
- Fix: pipx installs now detected correctly in git hooks (reads shebang from graphify binary)
- Fix: graspologic ANSI escape codes no longer corrupt PowerShell 5.1 scroll buffer
- Docs: Japanese README added
- Docs: `graph.json` + LLM workflow example added to README
- Docs: Codex PreToolUse hook now documented in platform table

## 0.3.14 (2026-04-08)

- Fix: `graphify codex install` now also writes a PreToolUse hook to `.codex/hooks.json` so the graph reminder fires before every Bash tool call (#86)
- Fix: `--update` now prunes ghost nodes from deleted files before merging new extraction (#51)

## 0.3.13 (2026-04-08)

- Fix: PreToolUse hook now outputs `additionalContext` JSON so Claude actually sees the graph reminder before Glob/Grep calls (#83)
- Fix: Go AST method receivers and type declarations now use package directory scope, eliminating disconnected duplicate type nodes across files in the same package (#85)
- Fix: PDFs inside Xcode asset catalogs (`.imageset`, `.xcassets`) are no longer misclassified as academic papers (#52)
- Fix: `_resolve_cross_file_imports` is now guarded with `if py_paths` and wrapped in try/except so a Python parser crash can't abort extraction for non-Python files (#52)
- Fix: Skill intermediate files (`.graphify_*.json`) now live in `graphify-out/` instead of project root, preventing git pollution (#81)

## 0.3.12 (2026-04-07)

- Fix: `sanitize_label` was double-encoding HTML entities in the interactive graph (`&amp;lt;` instead of `&lt;`) — removed `html.escape()` from `sanitize_label`; callers that inject directly into HTML now call `html.escape()` themselves (#66)
- Fix: `--wiki` flag missing from `skill.md` usage table (#55)

## 0.3.11 (2026-04-07)

- Fix: Louvain fallback hangs indefinitely on large sparse graphs — added `max_level=10, threshold=1e-4` to prevent infinite loops while preserving community quality (#48)

## 0.3.10 (2026-04-07)

- Fix: Windows UnicodeEncodeError during `graphify install` — replaced arrow character with `->` in all print statements (#47)
- Add: skill version staleness check — warns when installed skill is older than the current package, across all platforms (#46)

## 0.3.9 (2026-04-07)

- Add: `follow_symlinks` parameter to `detect()` and `collect_files()` — opt-in symlink following with circular symlink cycle detection (#33)
- Fix: `watch.py` now uses `collect_files()` instead of manual rglob loop for consistency
- Docs: Codex uses `$graphify .` not `/graphify .` (#36)
- Test: 5 new symlink tests (367 total)

## 0.3.8 (2026-04-07)

- Add: C# inheritance and interface implementation extraction — `base_list` now emits `inherits` edges for both simple (`identifier`) and generic (`generic_name`) base types (#45)
- Add: `graphify query "<question>"` CLI command — BFS/DFS traversal of `graph.json` without needing Claude Code skill (`--dfs`, `--budget N`, `--graph <path>` flags)
- Test: 2 new C# inheritance tests (362 total)

## 0.3.7 (2026-04-07)

- Add: Objective-C support (`.m`, `.mm`) — `@interface`, `@implementation`, `@protocol`, method declarations, `#import` directives, message-expression call edges
- Add: `--obsidian-dir <path>` flag — write Obsidian vault to a custom directory instead of `graphify-out/obsidian`
- Fix: semantic cache was only saving 4/17 files — relative paths from subagents now resolved against corpus root before existence check
- Fix: 75 validation warnings per run for `file_type: "rationale"` — added `"rationale"` to `VALID_FILE_TYPES`
- Test: 6 Objective-C tests; `.m`/`.mm` added to `test_collect_files_from_dir` supported set (360 total)

## 0.3.0 (2026-04-06)

- Add: multi-platform support — Codex (`skill-codex.md`), OpenCode (`skill-opencode.md`), OpenClaw (`skill-claw.md`)
- Add: `graphify install --platform <codex|opencode|claw>` routes skill to correct config directory
- Add: `graphify codex install` / `opencode install` / `claw install` — writes AGENTS.md for always-on graph-first behaviour
- Add: `graphify claude uninstall` / `codex uninstall` / `opencode uninstall` / `claw uninstall`
- Add: MIT license
- Fix: `build()` was silently dropping hyperedges when merging multiple extractions
- Refactor: `extract.py` 2527 → 1588 lines — replaced 12 copy-pasted language extractors with `LanguageConfig` dataclass + `_extract_generic()`
- Docs: clustering is graph-topology-based (no embeddings) — explained in README
- Docs: all missing flags documented (`--cluster-only`, `--no-viz`, `--neo4j-push`, `query --dfs`, `query --budget`, `add --author`, `add --contributor`)

## 0.2.2 (2026-04-06)

- Add: `graphify claude install` — writes graphify section to local CLAUDE.md + PreToolUse hook in `.claude/settings.json`
- Add: `graphify claude uninstall` — removes section and hook
- Add: `graphify hook install` — installs post-commit and post-checkout git hooks (platform-agnostic)
- Add: `graphify hook uninstall` / `hook status`
- Add: `graphify benchmark` CLI command
- Fix: node deduplication documented at all three layers

## 0.1.8 (2026-04-05)

- Fix: follow-up questions now check for wiki first (graphify-out/wiki/index.md) before falling back to graph.json
- Fix: --update now auto-regenerates wiki if graphify-out/wiki/ exists
- Fix: community articles show truncation notice ("... and N more nodes") when > 25 nodes
- UX: pipeline completion message now lists all available flags and commands so users know what graphify can do

## 0.1.7 (2026-04-05)

- Add: `--wiki` flag — generates Wikipedia-style agent-crawlable wiki from the graph (index.md + community articles + god node articles)
- Add: `graphify/wiki.py` module with `to_wiki()` — cross-community wikilinks, cohesion scores, audit trail, navigation footer
- Add: 14 wiki tests (245 total)
- Fix: follow-up question example code now correctly splits node labels by `_` to extract verb prefixes (previous version used `def`/`fn` prefix matching which always returned zero results)

## 0.1.6 (2026-04-05)

- Fix: follow-up questions after pipeline now answered from graph.json, not by re-exploring the directory (was 25 tool calls / 1m30s; now instant)
- Skill: added "Answering Follow-up Questions" section with graph query patterns

## 0.1.5 (2026-04-05)

- Perf: semantic extraction chunks 12-15 → 20-25 files (fewer subagent round trips)
- Perf: code-only corpora skip semantic dispatch entirely (AST handles it)
- Perf: print timing estimate before extraction so the wait feels intentional
- Fix: 5 skill gaps - --graphml in Usage table, --update manifest timing, query/path/explain graph existence check, --no-viz clarity
- Refactor: dead imports removed (shutil, sys, inline os); _node_community_map() helper replaces 8 copy-pasted dict comprehensions; to_html() split into _html_styles() + _html_script(); serve.py call_tool() if/elif chain replaced with dispatch table
- Test: end-to-end pipeline integration test (detect → extract → build → cluster → analyze → report → export)

## 0.1.4 (2026-04-05)

- Replace pyvis with custom vis.js HTML renderer - node size by degree, click-to-inspect panel with clickable neighbors, search box, community filter, physics clustering
- HTML graph generated by default on every run (no flag needed)
- Token reduction benchmark auto-runs after every pipeline on corpora over 5,000 words
- Fix: 292 edge warnings per run eliminated - stdlib/external edges now silently skipped
- Fix: `build()` cross-extraction edges were silently dropped - now merged before assembly
- Fix: `pip install graphify` → `pip install graphifyy` in skill Step 1 (critical install bug)
- Add: `--graphml` flag implemented in skill pipeline (was documented but not wired up)
- Remove: pyvis dependency, dead lib/ folder, misplaced eval reports from tests/
- Add: 5 HTML renderer tests (223 total)

## 0.1.3 (2026-04-04)

- Fix: `pyproject.toml` structure - `requires-python` and `dependencies` were incorrectly placed under `[project.urls]`
- Add: GitHub repository and issues URLs to PyPI page
- Add: `keywords` for PyPI search discoverability
- Docs: README clarifies Claude Code requirement, temporary PyPI name, worked examples footnote

## 0.1.1 (2026-04-04)

- Add: CI badge to README (GitHub Actions, Python 3.10 + 3.12)
- Add: ARCHITECTURE.md - pipeline overview, module table, extraction schema, how to add a language
- Add: SECURITY.md - threat model, mitigations, vulnerability reporting
- Add: `worked/` directory with eval reports (karpathy-repos 71.5x benchmark, httpx, mixed-corpus)
- Fix: pytest not found in CI - added explicit `pip install pytest` step
- Fix: README test count (163 → 212), language table, worked examples links
- Docs: README reframed as Claude Code skill; Karpathy problem → graphify answer framing

## 0.1.0 (2026-04-03)

Initial release.

- 13-language AST extraction via tree-sitter (Python, JS, TS, Go, Rust, Java, C, C++, Ruby, C#, Kotlin, Scala, PHP)
- Leiden community detection via graspologic with oversized community splitting
- SHA256 semantic cache - warm re-runs skip unchanged files
- MCP stdio server - `query_graph`, `get_node`, `get_neighbors`, `shortest_path`, `god_nodes`
- Memory feedback loop - Q&A results saved to `graphify-out/memory/`, extracted on `--update`
- Obsidian vault export with wikilinks, community tags, Canvas layout
- Security module - URL validation, safe fetch with size cap, path guards, label sanitisation
- `graphify install` CLI - copies skill to `~/.claude/skills/` and registers in `CLAUDE.md`
- Parallel subagent extraction for docs, papers, and images
