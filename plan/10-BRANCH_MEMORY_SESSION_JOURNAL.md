# Memory Session Journal And Session Context Query (`engram` / sentropic / h2a)

Spec: `spec/SPEC_ENGRAM_SESSION_JOURNAL_AND_CONTEXT_QUERY.md` `v0.1.2` (cited **SJ §x** for a section and **SJ:n** for a line). Amendment reference: E `origin/main` `a6fec8acd7642b2c74c71d6e5dade86bcc8d06f3`, containing L3a-E1 and the delivered `SJ-0e`. Authoring branch: `feat/memory-plan`, worktree `graphify-wt-memplan`. Round-2 plan author: GPT-6 Astra (max), replacing Fable under the owner's instruction of 20/11. Round-1 authorship and findings remain in [Validation 20/11 — dispositions](#validation-2011--dispositions); round-2 Astra and Carbon both returned NO-GO, addressed in [Validation round 2 — dispositions](#validation-round-2--dispositions). This amendment is not a validation GO. No builder starts before the required validator GOs and the owner's GO.

**Owner acts applied.** Translated from the briefs: 20/11, GO on the memory specification; 19/11, specification and plan require Fable 5.2 and Carbon validation, then owner GO; 19/11, use Neon for the harder builds, Hydrogen for simpler ones and Ember where possible. The 20/11 amendment instruction appoints GPT-6 Astra max as plan author in Fable's place and asks for both round-2 validations to be applied. The briefs relay these acts; their primary conversation file is a `missing source`.

**Binding inputs.** The 20/11 brief records the builder rule above and the delivery of `SJ-0e` (PR #462, squash `2cb2aa6a`). The plan applies every blocker and major from both validations, resolves differences against the cited evidence, and applies minors that agree with the sources. For X-NER and SJ-9, the architect's frozen `ner-service.r5.snapshot.md` (SOLID, cited **NER r5**) supersedes the 20/11 NER design. Engram's `SPEC_NER_QUALIFICATION_DATASETS_AND_METRICS.md` v0.1.4 supplies the qualification sequence. SJ-9 consumes the llm-mesh-owned NER contract through X-NER (PD-33).

**Cited specifications.** Short names are those of SJ §0: **S0** `spec/SPEC_ENGRAM_METAMODEL_AND_LINEAGE_REGISTRY.md`, **S1** `spec/SPEC_ENGRAM_SESSION_FRONT_AND_EXTRACTION.md`, **S3** `spec/SPEC_ENGRAM_DORMANT_DREAMING_SYNTHESIS.md`, **S4** `spec/SPEC_ENGRAM_H2A_ROLE_ONTOLOGY_AND_HARNESS_OVERLAYS.md`, **S6A** `spec/SPEC_ENGRAM_CLUSTER_MESH_MEMORY_ACCESS_AND_MCP_WIRING.md`. `S1:1663` is line 1663 of S1 at E `7d9e2355`. A delta identifier (`S1-a` … `S6A-l`) is a row of SJ §8.

**What this plan adds to SJ §10.** SJ §10 names ten lots of the sibling specs as direct prerequisites (`1-E1`, `1-E3`, `1-S1a`, `1-S2`, `1-H1`, `6A-S0a`, `6A-S1b`, `6A-H1`, `3-E3`, `4-E2`), and `4-H3` for `SJ-16h`. None is merged (the conductor's `git log origin/main --grep` check, relayed in the brief). Their own prerequisites are not delivered either ([Sources](#sources)): once the 12-file rule is applied, the sibling specs give 53 rows, the five lots of S0 and the delta lot `4-E4b` included. This plan orders all of them with the 33 lots of SJ, applies the Before → After rows of SJ §8 to each, and records every point where it had to decide in [Plan dispositions](#plan-dispositions). One lot is delivered: `SJ-0e` (row 1).

**Reference heads and rebase status (20/11, round 2, round-3 baseline refresh).** All new repository anchors in this amendment were re-read through `git show origin/main:<path>`: E `a6fec8acd7642b2c74c71d6e5dade86bcc8d06f3`, S `13490b16b9ac717d5abf5c5128146a536aa80f66`, H `e9ce1a8dbf1ffe6994f88595da76416a267f2ac3`. These are the local remote-tracking refs: `git fetch origin main` failed because the worktree Git metadata is read-only. The requested `git rebase origin/main` was also attempted first and failed to create `rebase-merge` there. The worktree HEAD is `a6fec8acd7642b2c74c71d6e5dade86bcc8d06f3` (= E `origin/main`); no rebase is claimed. Before committing row 0 or creating row 1b, the conductor must run `git fetch origin main && git rebase origin/main && git merge-base --is-ancestor a6fec8acd7642b2c74c71d6e5dade86bcc8d06f3 HEAD` in this worktree, with this plan preserved, then re-read any moved anchor. Existing round-1 citations retain their historical meaning; no blanket byte-identity claim is made after L3a-E1. A new E or plan/09 anchor refers to `a6fec8ac`; absence means `git cat-file -e origin/main:<path>` failed. Future S/H target paths are confirmed at branch start. The external NER specification is absent from S `origin/main`; **NER:n** remains a line of the local untracked `r3` specification, 707 lines, relayed as a binding input, not an invented main-branch anchor.

Paths prefixed **E:** belong to engram, **S:** to sentropic (`packages/cluster-mesh`, `packages/mcp-platform`, `packages/mcp-broker`, `api`, root), **H:** to h2a. **Each lot has one owning repository and one scoped branch.** Numbered Allowed change sets are exact files, not source-directory wildcards; a path marked `new` is created by the lot. Each lot has at most 12 changed files relative to its recorded parent. Shared read-only inventories and generated verification outputs are declared separately below; a required persistent change joins the numbered set. A reviewed stack records both its per-lot sets and its aggregate PR scope.

## Objective

- [ ] Deliver the functions of SJ §1.1: noting events, returning the diff, searching history, reading and amending the session context query, resuming after compaction, switching CLI on the same agent role, and the dreaming hand-off. The hand-off is built and proven in engram (row 70); its use in an installed stack also needs the dreaming lots of S3 in sentropic, which this plan does not build (PD-27).
- [ ] Reach the first proof as early as possible: `SJ-1b`, the end-to-end proof on Claude Code by replay (`D9 C`, replay first; SJ:649). It needs engram only.
- [ ] Build every prerequisite lot of S0, S1, S3, S4 and S6A that the SJ lots wait for, with the rows of SJ §8 applied, and no other lot of those specs except the delta lot `4-E4b` (PD-15).
- [ ] Keep one definition per symbol and change no frozen signature ([Commissioning Rules](#commissioning-rules)).
- [ ] Execute one logical change per lot, with at most 12 listed files per repository branch; split before exceeding, without dropping a gate.
- [ ] Zero Python in every repository, every gate and every job.
- [ ] Treat every RED, GUARD and gate result as `unverified` until executed.

## Scope

- [ ] Allowed in this authoring turn: E:`plan/10-BRANCH_MEMORY_SESSION_JOURNAL.md` only. No commit, no code or test change, no Track write, no edit of any spec.
- [ ] Later branches may touch only the exact Allowed files of their lot. A builder that needs another file stops and asks its conductor for a recorded scope amendment.
- [ ] Forbidden in every lot: Python files, interpreters or build fallbacks; a seventh memory tool (SJ header); a change to a frozen signature; a second definition of a contract symbol; a `null` in a field this plan adds (SJ §12, rules); `.track/**` and `BRANCH.md` edits outside the receiving repository's own rules; implicit `npm`/`npx` downloads; a `file:` dependency or an import from a neighbouring checkout; publication under the `latest` dist-tag before the final release.
- [ ] Gate of this authoring turn: exactly one changed path, then a GO from both validators, then the owner's GO.

## Commissioning Order

Rows are in build order. A lot starts only when every row of its “Depends on” cell is merged with a green gate, every checkpoint it names is cut, and the free-space floor of its disk class holds. Rows of different repositories run in parallel; inside one repository the [shared-file rule](#commissioning-rules) adds the serial order. “Files” counts the numbered change set relative to the lot's recorded parent; read-only inventories and disposable generated verification outputs are declared separately. The RED cases, the Allowed list and the gate of a lot are defined once, in the section headed by its row number and identifier. Repositories and conductors: **E** engram, built under the engram conductor; **S** sentropic, under the sentropic conductor; **H** h2a, under h-cond. Builders: **Neon** = `agy gemini-4-neon-xhigh`; **Hydrogen** = `agy gemini-4-hydrogen-xhigh`; **Ember** = `muse-ember-1.0` at max effort.

A row of a sibling spec that the 12-file rule splits keeps its identifier with a suffix (`1-E2-1`, `6A-H1-2`, `6A-S2-C`). A dependency written `1-E2`, `6A-H1`, `6A-H2`, `6A-H3`, `6A-S0a` or `6A-S2` means every part. `SJ-3a` means `SJ-3a-1`; its test t5 is `SJ-3a-2`. A row `PIN-En` is a move of the engram pin in sentropic, under the scope exception of the lot named beside it; a row `PIN-Hn` is a move of the exact pins of h2a; `PIN-P1` is the move of the platform pins of engram.

**A row number is an identifier, not a rank.** The amendment of 20/11 kept every number of the first edition, so that a finding of the validations still names its row. A row it added takes the number of a neighbouring row with a letter (`2b`, `40b`). Three rows moved without a new number: row 46 now precedes rows 44 and 45, and rows 48b and 49b sit beside rows 48 and 49. The order of the table is the build order; the “Depends on” cell, not the number, says what a row waits for.

| # | Step | Lot (repository) | Files | Depends on | Builder | Why this builder | Disk |
|---|---|---|---|---|---|---|---|
| 0 | — | **PLAN**: this plan and its validations (E, docs) | 1 | The owner's GO on SJ, 20/11 | Conductor | Plan authoring and validation, not a build | A |
| 0b | 1 | **S8-ptr**: dated pointer to SJ §8 in the four sibling specs (E, docs) | 4 | Row 0 | Ember | Document-only: one paragraph, given verbatim, appended to four files | A |
| 1 | 1 | **SJ-0e**: no-Python guard (E). **Delivered**: PR #462, squash `2cb2aa6a` | 2 | — | Ember (done) | Delivered on `origin/main`; nothing left to build | A |
| 1b | 1 | **SJ-0e-2**: the guard also reads executable contexts (E) | 3 | Row 1 (delivered); no row waits for it | Hydrogen | One package and clear REDs; the rule is the one the h2a guard already applies | A |
| 2 | 1 | **Lot 0.1-D**: the shared declarations of S0 (E) | 2 | Row 0 | Neon | Type contract that three repositories import | A |
| 2b | 1 | **Lot 0.1-H**: canonical digest of the profile format (E), off the first-proof chain | 8 | Row 2 | Neon | Digest and canonical bytes shared by three repositories | A |
| 3 | 1 | **6A-E1**: mandate hook and Track guard in the provider (E) | 12 | Rows 0b, 2 | Neon | Authorization boundary of the six tools | A |
| 4 | 1 | **1-E1**: session-front contracts and ingest engine (E) | 12 | Rows 0b, 2, 3 | Neon | Cross-repository contract, a new public subpath and three packed-surface guards, at the 12-file limit | B |
| 5 | 1 | **SJ-1a**: query, first view, diff (E) | 6 | Row 4 | Neon | The query contract and the diff rule every later lot relies on | A |
| 6 | 1 | **SJ-1b**: end-to-end proof on Claude Code, by replay (E) | 10 | Row 5; fixture F-CC | Neon | Replay over recorded bytes with a boundary case; tricky tests | A |
| 6b | 1 | **P-REPLAY**: the replay record on the recorded session (E, docs) | 1 | Row 6 | Ember records; the conductor runs | Document-only record of a run that the conductor operates | A |
| 7 | 2 | **E-REL-J**: checkpoint release path of `@sentropic/engram` (E) | 3 | None; may run beside rows 2–6 | Neon | Publication path: dist-tag and registry credential | B |
| 8 | 2 | **SJ-1c**: the whole view (E) | 4 | Row 5 | Neon | SJ names Neon (SJ:657): checks 1 and 2 of SJ §9.1 are decided in this view | A |
| 9 | 2 | **SJ-6a**: the gate, a pure function (E) | 3 | Row 5 | Neon | Small, but it is the one rights boundary of an amendment | A |
| 10 | 2 | **SJ-2a**: the request and the delivery on the Spec 1 call (E) | 6 | Row 5 | Neon | Cross-repository members of the journal call, stored with the event | A |
| 11 | 2 | **1-E2-1a**: LLM SDK isolation (E) | 5 | Row 4 | Neon | Dependency boundary and adapter isolation | A |
| 11c | 2 | **1-E2-1b**: optional mesh peer, smoke and offline lock (E) | 12 | Row 11 | Neon | Public packed dependency closure, at the limit | B |
| 11b | 2 | **PIN-P1**: platform pins and locked consumer on R-P1 (E) | 9 | Row 11c; R-P1 | Hydrogen | Exact pins and fixture closure, with a clear guard | B |
| 12 | 2 | **1-E2-2**: privacy modules (E) | 9 | Row 11c | Neon | Deny-list, PII armor, pseudonyms and retention: disclosure boundary | A |
| 13 | 2 | **1-E4**: derived worktree graph (E, package `@sentropic/engram-live`) | 8 | Row 4; plan/09 strict-check baseline green | Neon | New emitted module of the neutral live package, with both of its guards | B |
| — | 2 | Checkpoint **R-E1**: engram release with the session-front contracts | — | Rows 4, 7, 11, 11b, 12 | Conductor | Release operation, not a build | B |
| 14 | 3 | **SJ-0s**: no-Python guard (S, root) | 6 | Row 0; the reclaim record of the Disk rule; may start during step 1 | Hydrogen | One Make target under a named scope exception, one script, CI wiring | C |
| 15 | 3 | **6A-S0a-P1**: call context through the transport (S, `mcp-platform`) | 9 | Rows 0b, 14; may start during step 1 | Neon | Cross-package contract of the platform transport | C |
| 15b | 3 | **6A-S0a-P2**: the `v2` projection of the memory contract (S, `mcp-platform`) | 10 | Row 15 | Neon | Cross-package contract of the platform, frozen with the broker | C |
| 16 | 3 | **6A-S0a-B**: `v2` projection through the broker (S, `mcp-broker`) | 6 | Row 15b | Neon | Dispatch authorization of a published package | C |
| 17 | 3 | **SJ-7a**: the binding in the `v2` projection (S, `mcp-platform`) | 12 | Rows 14, 15b, 16 | Neon | Cross-package contract that engram and cluster-mesh both import; published; at the 12-file limit | C |
| 17b | 3 | **P1-RP**: broker baseline and immutable P1 rotation (S) | 10 | Rows 15, 15b, 16, 17, stacked | Neon | Two-package qualification and immutable archive history | C |
| — | 3 | Checkpoint **R-P1**: `@sentropic/mcp-platform` `0.4.x` with the binding | — | Rows 15, 15b, 16, 17, 17b | Conductor (S) | Release operation, not a build | C |
| 18 | 3 | **6A-S0b**: SQLite kernel pre-lot (S, `cluster-mesh`) | 6 | Row 14; the writer handoff (external) | Neon | Storage kernel: fenced writers and scoped outbox | C |
| 18b | 3 | **PIN-E0**: engram pin on the published `0.28.0`, the pin part of `6A-S1a` (S) | 12 | Row 14 | Neon | One version moved through four areas of the repository, under a named exception | C |
| 19 | 3 | **6A-S1a-1**: binding declarations and C6 inventory (S) | 10 | Rows 15b, 16, 18, 18b | Neon | Public declaration and semantic contract digests | C |
| 19b | 3 | **6A-S1a-2**: backend migration and durable qualification (S) | 8 | Row 19 | Neon | Storage authority and crash recovery on both backends | C |
| 20 | 3 | **6A-S1b**: mandate trust root and verifier (S, `cluster-mesh`) | 8 | Row 19b | Neon | Signature verification and key revocation; writes vector V-mandate | C |
| 21 | 3 | **6A-S1c**: `/memory` namespace and degraded mode (S, `cluster-mesh`) | 11 | Row 20 | Neon | Namespace graduation, outbox and degraded mode on storage | C |
| 22 | 3 | **6A-S1d**: `api` projection of `/memory` (S, `api`) | 3 | Row 21 | Hydrogen | Two-file wiring with one clear RED; no contract change | C |
| 23 | 3 | **6A-S2-C**: MCP composition and memory transport (S, `cluster-mesh`) | 10 | Row 22 | Neon | Cross-package registry and transport composition | C |
| 24 | 3 | **6A-S2-A**: single compiled registry and dispatch (S, `api`) | 7 | Row 23 | Neon | Tenant visibility and refusal mapping of memory tools | C |
| 25 | 3 | **6A-S3**: legacy memory port removed (S, `cluster-mesh`) | 7 | Row 24 | Hydrogen | A removal with one absence guard, but it edits the public barrel of a published package | C |
| — | 3 | Checkpoint **R-S0**: cluster-mesh release with the memory namespace, the MCP composition and the legacy port removed | — | Rows 18, 18b, 19–25 | Conductor (S) | Release operation, not a build | C |
| 26 | 3 | **SJ-7c**: the session binding at the hop (S, `cluster-mesh`) | 6 | R-P1; row 20 | Neon | Who is calling: an authorization boundary on two transports; writes vector V-session | C |
| 27 | 3 | **PIN-E1**: engram pin on R-E1, the pin part of `1-S1a` (S) | 12 | R-E1; row 19b | Neon | As row 18b | C |
| 28 | 3 | **1-S1a**: session-front routes (S, `cluster-mesh`) | 9 | Rows 13, 15b, 16, 18–22, 27; chat-mesh B1, B2 (external) | Neon | Routes with a two-kernel commit and mandate checks | C |
| 29 | 3 | **1-S1b**: `api` exposure of the session-front routes (S, `api`) | 3 | Rows 22, 28 | Hydrogen | Path wiring in one file with one clear RED | C |
| 30 | 4 | **SJ-2c**: the journal wrapper and the one disclosure rule (E) | 6 | Rows 10, 11b, 12 | Neon | Disclosure boundary, and the wrapper of a frozen port | A |
| 31 | 4 | **SJ-2b**: read-only delivery, `D18` (E) | 4 | Row 30 | Neon | Delivery to a session with no memory identity: disclosure boundary | A |
| — | 4 | Checkpoint **R-E2**: engram release with the journal wrapper | — | Rows 30, 31 | Conductor | Release operation, not a build | B |
| 32 | 4 | **SJ-5a**: the `v2` schemas and the wire codec (E) | 7 | Rows 9, 30 | Neon | Closed schemas with a byte-identical `v1`; writes vector V-codec | A |
| 33 | 4 | **SJ-5c**: the `v2` profile in the provider (E) | 9 | Row 32 | Neon | Co-signature preflight of a frozen profile set | A |
| 34 | 4 | **SJ-5b**: search the history (E) | 8 | Rows 6, 33 | Neon | Rights filter and disclosure on a read tool | A |
| 35 | 4 | **SJ-6b**: ask through search, commit on the note (E) | 7 | Rows 9, 34 | Neon | Two transports, one commit, idempotent replay; tricky tests | A |
| 36 | 4 | **Lot 0.2**: metamodel grammar validator (E) | 5 | Rows 2, 2b | Neon | Template grammar that two other repositories author against | A |
| 37 | 4 | **1-E3**: extraction pipeline (E) | 6 | Rows 4, 12, 36 | Neon | Import-graph and packed-chunk guard over seven public subpaths | B |
| 38 | 4 | **SJ-10**: the shadow's output in the journal (E) | 4 | Rows 9, 37 | Hydrogen | One package, five clear REDs; its two contract members are given verbatim in SJ §12 | A |
| — | 4 | Checkpoint **R-E3**: engram release with `v2` search and the extraction pipeline | — | Rows 32–38 | Conductor | Release operation, not a build | B |
| 39 | 5 | **PIN-E2**: engram pin on R-E2, the pin part of `SJ-3a` (S) | 12 | R-E2; row 28 | Neon | As row 18b | C |
| 40 | 5 | **SJ-3a-1**: the route (S, `cluster-mesh`) | 6 | Rows 26, 28, 39 | Neon | Authorization and refusal paths of the journal route | C |
| — | 5 | Checkpoint **R-S1**: cluster-mesh release with the session-front routes and the journal route | — | Rows 26–29, 39, 40 | Conductor (S) | Release operation, not a build | C |
| 40b | 5 | **PIN-H0**: exact pins of h2a on R-S0 and R-P1, the pin part of `6A-H1` (H) | 12 | R-S0; R-P1; may start during step 3 | Neon | Exact pins of two packages, the lock and the tests that assert them | C |
| 41 | 5 | **6A-H1-1**: canonical JSON hardening and manifest guard (H) | 6 | Row 40b; vector V-mandate | Neon | Canonical bytes of a signed envelope, checked against the shared vector | C |
| 42 | 5 | **6A-H1-2**: registry and daemon binding (H) | 10 | Row 41 | Neon | Lock recovery and daemon binding with the PR #455 invariants | C |
| 43 | 5 | **6A-H1-3**: mandate carrier on the central attachment (H) | 7 | Row 42 | Neon | Signed mandate carried on both transports | C |
| 46 | 5 | **6A-H2-3**: `d11` ceremony on the mesh (H), before the removals | 3 | Row 43 | Neon | Admission ceremony and third-party consensus | C |
| 44 | 5 | **6A-H2-1**: legacy memory modules removed, first part (H) | 11 | Row 46 | Ember | Mechanical removal of unreferenced files, with one guard | C |
| 45 | 5 | **6A-H2-2**: legacy memory modules removed, second part, with the absence assertion (H) | 10 | Row 44 | Hydrogen | A removal and one assertion in one package, with a clear RED | C |
| 47 | 5 | **6A-H3-1**: host admission, fail-closed rule and the banner on eight hosts (H) | 7 | Row 45 | Neon | Host surface on eight CLIs, fail-closed on `503` | C |
| 47b | 5 | **PIN-H1**: exact pins of h2a on R-S1 and R-E2 (H) | 12 | R-S1; R-E2; row 47 | Neon | As row 40b | C |
| 48 | 5 | **1-H1**: hook generators and the session-front client (H) | 9 | Rows 43, 45, 46, 47, 47b | Neon | Changes to the hooks of eight hosts | C |
| 49 | 5 | **SJ-4**: live on Claude Code (H) | 7 | Row 48; vector V-codec | Neon | Host hook change with the compaction and restart signals | C |
| 49b | 5 | **P-LIVE**: the live record (H, docs), then release **R-H1** | 1 | Row 49 | Ember records; h-cond runs | Document-only record of a run that h-cond operates | C |
| 48b | 5 | **1-H1-P**: bounded poll of `agy` and `muse` in the runtime seats (H, `h2a-runtime`), off the live-proof path | 6 | Row 48 | Neon | Host recording path in a second package | C |
| 50 | 6 | **SJ-7e**: the launch receipt (H) | 7 | Rows 43, 48 | Neon | Signs with an instance key; writes vector V-launch | C |
| 51 | 6 | **SJ-7f**: who reads (S, `cluster-mesh`) | 8 | Row 40; vector V-launch | Neon | Signature verification and the content authorization act | C |
| 52 | 6 | **PIN-E3**: engram pin on R-E3, the pin part of `SJ-7b` (S) | 12 | R-E3; row 51 | Neon | As row 18b | C |
| 53 | 6 | **SJ-7b**: the v2 switch and receipt (S) | 7 | Rows 51, 52 | Neon | Co-signed profile switch | C |
| 53c | 6 | **P1-V2**: P1 verification or rotation for the switch (S) | 10 max | Row 53, stacked; X-P09 | Neon | Qualification identity and retained history | C |
| — | 6 | Checkpoint **R-S2**: cluster-mesh release with reader facts and the `v2` switch | — | Rows 51, 52, 53 | Conductor (S) | Release operation, not a build | C |
| 53b | 6 | **PIN-H2**: exact pins of h2a on R-S2 and R-E3 (H) | 12 | R-S2; R-E3 | Neon | As row 40b | C |
| 54 | 6 | **SJ-7d**: h2a admits `v2` (H) | 6 | Rows 43, 53b; vector V-session | Neon | Bridge-lock validation and the session carrier | C |
| 55 | 6 | **6A-H3-2**: six tools on eight hosts, `v1` and `v2` (H) | 5 | Rows 47, 54 | Neon | It edits the handover files that carry the PR #455 invariants | C |
| 56 | 6 | **SJ-8**: CLI switch, and hosts without a signal (H) | 5 | Rows 49, 54 | Neon | Inheritance across sessions on eight hosts | C |
| 57 | 7 | **Lot 0.3**: SemVer gate and composition (E) | 4 | Row 36 | Neon | Version and composition rules of templates owned by other repositories | A |
| 58 | 7 | **Lot 0.4**: lineage registry store (E) | 8 | Row 57 | Neon | Signed-mandate gate, and a new public subpath | B |
| 59 | 7 | **SJ-15**: scope, ontologies and mandate in the query (E) | 4 | Rows 8, 30, 58 | Neon | Rights of the query taken from the binding | A |
| 60 | 7 | **Lot 0.5**: template-driven projection (E) | 3 | Row 58 | Neon | Writes `.track/` and `.h2a/` projections under a deny-list | A |
| 61 | 7 | **4-E1**: `h2a` lineage registration gate (E) | 3 | Rows 2, 2b, 36, 57, 58, 60 | Neon | Registration authorization of a lineage | A |
| 62 | 7 | **4-E2**: proactive role analyzer (E) | 3 | Rows 4, 61 | Neon | Role proposal rules with clamps on authority | A |
| 63 | 7 | **SJ-16e**: signal that a role proposal is ready (E) | 3 | Rows 10, 62 | Hydrogen | Small adapter with two clear REDs; the once-only rule is state, not a mechanical edit | A |
| 64 | 7 | **4-E3**: harness decision ledger and overlay serializer (E) | 3 | Rows 60, 61 | Neon | Tighten-only lattice and path-escape refusal | A |
| 65 | 7 | **4-E4a**: `./h2a-lineage` subpath (E) | 8 | Rows 61, 62, 64 | Neon | New public subpath with the tarball gate | B |
| 66 | 7 | **4-E4b**: the `rules` slice (E) | 4 | Rows 8, 61, 62, 64, 65 | Hydrogen | Small provider in one package on the item contract of row 5 | A |
| — | 7 | Checkpoint **R-E4**: engram release with the registry, the `h2a` lineage and the role signal | — | Rows 57–66 | Conductor | Release operation, not a build | B |
| 67 | 7 | **3-E1**: dreaming contracts and triggers (E) | 6 | Row 0b | Neon | Trigger predicates with coalescing and three-layer idempotency | A |
| 68 | 7 | **3-E2**: two-tier shadow engine (E) | 5 | Rows 12, 37, 67 | Neon | Calibration ledger and the anti-collusion gate | A |
| 69 | 7 | **3-E3**: forgotten permanent facts and promotion routers (E) | 11 | Rows 2, 2b, 10, 12, 37, 61, 62, 64, 67 | Neon | Refusal guards and a new public subpath | B |
| 70 | 7 | **SJ-13**: dreaming hand-off (E) | 3 | Rows 10, 68, 69 | Neon | Recall delivery under the threshold and `D18` rules | A |
| — | 7 | Checkpoint **R-E5**: engram release with dreaming | — | Rows 67–70 | Conductor | Release operation, not a build; no row of this plan waits for it | B |
| 71 | 8 | **1-S2**: extraction bridge on llm-mesh (S, `cluster-mesh`) | 5 | Rows 15b, 20, 23, 24, 28, 52; chat-mesh C2a (external) | Neon | Model routing, metering and a bounded queue | C |
| — | 8 | External checkpoint **X-NER** for the llm-mesh NER service type and cluster-mesh service module (sentropic) | — | Packed r5 candidate, V2 evidence and placement witnesses (NER r5 §§6.2–7) | Conductor (S) | Handoff to rows 71b, 71c and 72 and qualification lots `E02`/`E03`. GO-1 and GO-2 gate the applicable production uses. | — |
| 71b | 8 | **SJ-9-L1**: llm-mesh range and all range assertions (S) | 12 | Row 71 and X-NER's packed 0.39.x candidate (`S21a`/`S21b` coordination) | Neon | One writer for the peer range and topology assertions. Existing supported tuples and the 0.39.x candidate pass. | C |
| 71c | 8 | **SJ-9-L2**: NER catalogue leaf and packed consumer (S) | 8; 10 if fixture refresh | Row 71b; X-NER | Neon | New provider leaf and executed packaging guards | C |
| 72 | 8 | **SJ-9**: one annotation service (S, `cluster-mesh`) | 7 | Rows 14, 71, 71b and 71c and the r5 X-NER handoff | Neon | Injected `NerPortV1`, ordered model switch, separate direct/dreaming policies and references-only operation without the content act. `E05a` witnesses production activation. | C |
| — | 8 | Checkpoint **R-S3**: cluster-mesh release with the annotation service | — | Rows 71, 71b, 71c, 72 | Conductor (S) | Release operation, not a build | C |
| 72b | 8 | **PIN-H3**: exact pins of h2a on R-S3 (H) | 12 | R-S3 | Neon | As row 40b | C |
| 73 | 8 | **SJ-11**: replay gate and owner report (H) | 5 | Rows 38, 49, 72b | Hydrogen | One package, three clear REDs, a report in plain French | C |
| 74 | 8 | **SJ-12**: levels A, B, C and the same-session test (H) | 6 | Row 73 | Neon | Host hook changes and the same-session rule | C |
| 75 | 8 | **SJ-14**: Track scope from the objective loop (H) | 4 | Row 49 | Hydrogen | Small mapping with four clear REDs | C |
| 76 | 8 | **PIN-E4**: engram pin on R-E4, the pin part of `4-S1a` (S) | 12 | R-E4; row 53 | Neon | As row 18b | C |
| 77 | 8 | **4-S1a**: `h2a` lineage loader and routes (S, `cluster-mesh`) | 10 | Rows 18, 19b, 21, 76 | Neon | Registration guard and a route for unassigned sessions | C |
| 78 | 8 | **4-S1c**: policy envelope verifier and harness decisions (S, `cluster-mesh`) | 8 | Rows 20, 77 | Neon | Signature verification and signing authority of a policy | C |
| 79 | 8 | **SJ-3a-2**: the read-only delivery at the route (S, `cluster-mesh`) | 5 | Rows 40, 78 | Neon | Delivery to a session with no memory identity, under a verified policy | C |
| — | 8 | Checkpoint **R-S4**: cluster-mesh release with the `h2a` lineage routes | — | Rows 76–79 | Conductor (S) | Release operation, not a build | C |
| 79b | 8 | **PIN-H4**: exact pins of h2a on R-S4 and R-E4 (H) | 12 | R-S4; R-E4 | Neon | As row 40b | C |
| 80 | 8 | **4-H1**: authored `h2a` ontology templates (H) | 6 | None; may start during step 5 | Hydrogen | Two authored templates in one package, with a bijection test | C |
| 81 | 8 | **4-H2**: signed template publisher (H) | 4 | Rows 41–47, 55, 79b, 80 | Neon | Signs a mandate and registers a lineage | C |
| 82 | 8 | **4-H3**: proactive role proposal bridge (H) | 4 | Rows 48, 81 | Neon | Governance flow: who may ratify and sign | C |
| 83 | 8 | **SJ-16h**: fetch a role proposal without polling (H) | 4 | Row 82; row 63 through R-E4 and rows 76 and 79b | Neon | Hook-driven call on the receipt signal | C |
| 84 | 9 | **SJ-18**: the step-context adapter, `proposed` (E) | 3 | Row 8; the agentic-loop dossier | Neon | Contract with the loop library, not settled yet | A |
| 85 | 9 | **SJ-17**: `h2a run stp` and the loop bridge, `proposed` (H) | 4 | Row 75; gate B; the agentic-loop dossier | Neon | Launch path and the default-runner rule | C |

Step names: **1** reach the first proof by replay, in engram alone; **2** complete the journal core and cut the first engram checkpoint; **3** deliver the platform contract, the memory namespace and the session-front routes in sentropic; **4** deliver the journal wrapper, the disclosure rule and the `v2` search in engram; **5** open the journal route and prove the journal live on Claude Code; **6** establish who reads, and switch `v2` on; **7** deliver the registry, the roles and dreaming in engram; **8** deliver the annotation service, gate A, the levels, the role proposals and the `D18` delivery at the route; **9** our own loop, `proposed` until the agentic-loop dossier settles.

Eight placements are deliberate.

1. **The first proof waits for five serial lots, and the first is two files.** Rows 2, 3, 4, 5 and 6 form the only chain before P-REPLAY. Row 2 is the declarations file alone: rows 3 and 4 need the types of S0, not its digest amendment (`S6A:737`, `S1:180-185`), which is row 2b, off the chain. Row 0b, a four-file document lot, is the only other predecessor of row 3 and runs beside row 2; rows 1b and 2b run beside the chain. No row of S or H is on it (SJ:649).
2. **Step 3 does not wait for the engram chain.** Rows 14 to 17b start during step 1, once the reclaim of the Disk rule is recorded: R-P1 is then cut before row 11b needs it. If R-P1 is not cut when rows 11 and 12 are green, R-E1 waits for it, and engram builds rows 8, 9, 10, 2b, 36, 37, 57 and 58 meanwhile; no row is dropped.
3. **Lot 0.2, `1-E3` and `SJ-10` ride in R-E3.** `1-S2` then consumes the pin of `SJ-7b` (row 52), which SJ already covers by its second scope exception (SJ:647); no further pin move and no new scope exception is needed. Row 51 waits for the whole S chain and for row 50, so the three extra rows do not delay R-S2.
4. **The live proof does not wait for `v2`.** `6A-H3` is split: its first part (host admission, the fail-closed rule and the banner) feeds `1-H1` and `SJ-4`; its second part (the six tools in `v1` and `v2` on every host) is the part that waited for `6A-S4` and now waits for `SJ-7b` and `SJ-7d` (`S6A-h`, SJ:581).
5. **The `D18` delivery at the route comes in step 8.** Test t5 of `SJ-3a` calls `verifyH2APolicyEnvelopeV1`, which lot `4-S1c` creates (`S4:937`). It is row 79; rows 40 and 49 do not wait for it.
6. **The h2a rows do not wait for the journal route.** h2a pins cluster-mesh by exact version, so no H row sees an S row before a pin row. A cluster-mesh release is therefore cut as soon as row 25 is green (R-S0), row 40b pins it, and rows 41 to 47 run beside the S rows 26 to 40. Only rows 47b, 48 and 49 wait for R-S1 (PD-24).
7. **The annotation service waits for X-NER.** Rows 71b, 71c and 72 consume the r5 handoff before R-S3 and its downstream rows 72b, 73 and 74. Rows 75 to 83 proceed independently. R-S3 can ship with production NER disabled. `E05a` uses row 72 and passing qualification evidence to witness activation. GO-1 gates production promotion of a local candidate with unresolved training-data terms. GO-2 gates SaaS processing and spend on real data (PD-33).
8. **The dreaming rows leave R-E4.** No row of S or H in this plan imports what rows 67 to 70 create: R-E4 is cut on rows 57 to 66, and rows 76 to 83 no longer wait for dreaming. Rows 67 to 70 ship in R-E5, whose sentropic consumers are the lots of S3 that this plan does not build (`S3:1016`) (PD-27).

## Commissioning Rules

### Design note — Allowed lists and gates

Every file a gate writes or reads as an inventory is in that lot's Allowed declaration. This includes test registration, packed-surface inventories, fixture locks, API reports and regenerated manifests. Allowed distinguishes the numbered change set (at most 12 tracked files), read-only verification inputs, and named generated outputs; those last two categories grant no source-edit permission. A generated tracked file is listed even when restored, and any required persistent change moves into the numbered set before acceptance; split the lot if that would exceed 12. An unlisted write is a scope failure, never repaired by silently restoring it.

Every gate command is literal and runnable from its stated repository root, with its environment and test paths explicit. A reference to another specification's gate, an unresolved command placeholder or a pipe embedded in a Vitest path filter is not a gate. Every guard named for a lot is executed by its gate, including inventory registration and packaging guards; a skipped suite supplies no evidence. The shared verification sets below are part of each lot's Allowed declaration, and each lot names its applicable sets. These rules apply to every lot, including inherited, pin, documentary and conditional companion lots.

**Conductors and hand-offs.** The engram conductor builds the E rows and cuts R-E1 to R-E5. The sentropic conductor builds the S rows and cuts R-P1 and R-S0 to R-S4; it also operates the external checkpoint X-NER, under its own plan. h-cond builds the H rows and cuts R-H1. A conductor never edits another repository. Work crosses a repository boundary in three forms only: a published package (a checkpoint), a golden vector (a fixture file with its digest), or the recorded-session fixture F-CC. A row that names a checkpoint or a vector of another repository starts only when its conductor has recorded the version or the digest.

**Checkpoints.** Each checkpoint is operated by its conductor and records the version, the dist-tag, the tarball integrity (`npm pack --json` `integrity` and the SHA-256 of the tarball) and the rows it contains. **Every checkpoint is a plain `X.Y.Z` version.** cluster-mesh admits no other: its range check parses release versions only (S `packages/cluster-mesh/src/modules/semver.ts:5`, `:50-56`), so an installed engram whose version carries a prerelease identifier is refused as `incompatible_version` for every engram module (S `packages/cluster-mesh/src/modules/registry.ts:55-56`); and the publish recipe of cluster-mesh refuses any version that is not `X.Y.Z` (S `Makefile:1398-1400`, called at `:1425`). plan/09 reached the same fact for the catalogue ranges (`plan/09:126`). What keeps a checkpoint from being a default install is therefore its dist-tag, never its version: an engram checkpoint is published under a dist-tag other than `latest` (proposed: `sj`), and a platform checkpoint too; for cluster-mesh the sentropic conductor says, at each cut, whether its publish recipe takes a dist-tag (the publication tail takes npm flags, S `Makefile:977`) or the checkpoint is an ordinary release of S `main`. In both cases nothing in a checkpoint is active: the journal stays off until a workspace opts in (`OD:83`), `v2` stays off until the co-signature, and the content authorization is a separate act (SJ §11, “Sequenced acts”). The cluster-mesh checkpoints are cut in the order their conditions are met: R-S3 and R-S4 have no order between them.

| Checkpoint | Content | Condition | Unblocks |
|---|---|---|---|
| **R-E1** | `@sentropic/engram` with the session-front contracts, the SDK isolation, the privacy modules and the platform pins on R-P1. It does not carry row 13, which belongs to another package (below) | Rows 4, 7, 11, 11c, 11b, 12 green; the procedure of row 7 followed | Rows 27, 28 |
| **R-P1** | `@sentropic/mcp-platform` `0.4.x` with the call context, the `v2` projection and `session_binding`; `@sentropic/mcp-broker` if row 16 changed its source | Rows 15, 15b, 16, 17, 17b green; the hosted `memory-l5-qualification` job green on the head of row 17b | Rows 11b, 26, 40b |
| **R-S0** | cluster-mesh with the memory namespace, the mandate verifier, the MCP composition, and the legacy memory port removed | Rows 18, 18b, 19, 19b, 20–25 green | Row 40b |
| **R-E2** | engram with `noteSessionEvent`, the disclosure rule and the read-only delivery | Rows 30, 31 green | Rows 39, 40, 47b, 79 |
| **R-E3** | engram with the `v2` search, the commit on the note, the extraction pipeline and the shadow output | Rows 32–38 green | Rows 52, 53, 53b, 71 |
| **R-S1** | cluster-mesh with the session binding, the session-front routes and the journal route | Rows 26–29, 39, 40 green | Row 47b, and through it rows 48 and 49 and the installed run of P-LIVE |
| **R-H1** | h2a release with the journal hooks | Row 49 green and P-LIVE recorded by row 49b | The owner's own sessions being noted (stage 1 of `D3 A`) |
| **R-S2** | cluster-mesh with the reader facts and the `v2` switch | Rows 51, 52, 53, 53c green; X-P09 and all 22 P09 results recorded | Row 53b, and through it rows 54, 55, 56 |
| **R-E4** | engram with the lineage registry, the `h2a` lineage and the role signal | Rows 57–66 green | Rows 76, 79b |
| **R-E5** | engram with the dreaming contracts, the shadow engine, the promotion routers and the dreaming hand-off | Rows 67–70 green | No row of this plan; the sentropic lots of S3 (`S3:1016`) |
| **X-NER** (external) | `@sentropic/llm-mesh` NER service type (target `0.39.0`), installed `./ner` and `./ner/host`, mesh client, and cluster-mesh service module with `disabled`, `in-process` and `delegated` bindings. Initial serving backends are `local-onnx-wasm`, `local-onnx-native` and `fastino-gliner`. | After decoder parity and offline load, record exact packed host-selected and remote-only tuples and integrities (`S21a`/`S21b`), `PinnedOnnxArtifactManifestV2` and vectors, the in-process API witness and delegated image digest with wire/auth evidence (NER r5 §§6.2–7). | Rows 71b, 71c and 72. `E02` and `E03` consume the packed candidate. |
| **R-S3** | cluster-mesh with the NER leaf and the annotation service | Rows 71, 71b, 71c, 72 green | Row 72b, and through it rows 73, 74 |
| **R-S4** | cluster-mesh with the `h2a` lineage routes, the policy verifier and the read-only delivery at the route | Rows 76–79 green | Row 79b, and through it rows 81, 82, 83 |

No other repository waits for an h2a package: after R-H1 the h2a rows ship in h-cond's ordinary releases. The installed runs that need them (rows 73 and 74) record the versions they ran on.

**Row 13 and the neutral package.** Row 13 adds a module to `@sentropic/engram-live` (E `engram-live/package.json:2`), which the root tarball does not pack (E `package.json:68-74`) and which only plan/09 releases (`plan/09:116-117`, `:718-720`). No checkpoint of this plan ships it and none needs to: `1-S1a` lists `1-E4` as a prerequisite (`S1:1682`) and consumes no symbol of the neutral package, since its files and cases name `@sentropic/engram/session-front-contracts` only, and at S `d6093d568` neither S `packages/cluster-mesh/package.json` nor S `packages/cluster-mesh/src/modules/catalog.ts` names `@sentropic/engram-live`. The edge is kept as a merge order: row 28 waits for row 13 merged. The module ships in the next release of the neutral package that the train of plan/09 cuts after that merge; if row 13 merges after the commit of R-E-pre, it is absent from R-E, which is a re-pack of that commit (`plan/09:117`).

**Checkpoint release rule (E).** An engram checkpoint takes the next free minor of the root package: `0.28.0` is the version of `main` (E `package.json:3`), so R-E1 is `0.29.0` (proposed), and each later checkpoint the next minor. It is published under the dist-tag `sj`: the release commit sets `publishConfig.tag` in E:`package.json` (the block at lines 4–6 holds `access` only today), and row 7 makes the publish step pass that value, so that a checkpoint cannot reach `latest` by omission; the publish job runs a bare `npm publish` today (E `.github/workflows/typescript-ci.yml:276-277`). The release commit is a conductor operation, not a lot. Its file set is that of the last release, `809af689` (`0.28.0`), which changed 13 files: `CHANGELOG.md`, `candidate-manifest.json`, `package.json`, `package-lock.json`, `registry/entries.v1.json`, `registry/publisher-assets.v1.json`, `scripts/substrate-tarball-acceptance.mjs`, whose `EXPECTED_VERSION` (line 50) otherwise fails `npm test` and the `prepublishOnly` script (E `package.json:98`), then one source file, four test files and one fixture that hold the version literal (`tests/release-config.test.ts:16` among them). The tag is created on `main`: the release guard refuses a tag that is not merged in the default branch and a tag that does not match the package version (`.github/workflows/typescript-ci.yml:217-245`). A consumer pins a checkpoint by exact version and lockfile `integrity`; a `file:` path or an import from a neighbouring checkout stays forbidden. In S, a pin row sets the exact version literal and a range of one minor (`>=0.29.0 <0.30.0`), the form S holds today (S `packages/cluster-mesh/src/modules/catalog.ts:18`).

**One release train (E).** Between R-E1 and the final release, every release of the root package is cut from `main` by the engram conductor and takes the next number of the same train, whichever lane asks for it. Two effects follow, and both are shown to the owner with this plan as accepted effects. Such a release carries the journal code, which is dormant: the journal is off by default. And `latest` stays on `0.28.0` until the owner decides otherwise, outside this plan: a consumer whose range is `^0.28.0` resolves no checkpoint, because a caret on a `0.x` version stops at the next minor.

**Platform release rule (S, proposed to the sentropic conductor).** R-P1 is a plain `0.4.x` version above `0.4.2`, the version of S `main` (S `packages/mcp-platform/package.json:3`): `@sentropic/mcp-broker` takes the platform through a caret range, `^0.4.2` on S `main` (S `packages/mcp-broker/package.json:47`; SJ:668, t5, read `^0.4.0` in the published `0.1.0`), which no prerelease satisfies. It is published under a dist-tag other than `latest` until row 53 passes. One effect is accepted and shown to the owner: a plain `0.4.x` is resolved by every consumer whose range admits it, whatever its dist-tag; the release changes no `v1` byte (row 17, t1), which is what makes that effect safe. engram pins the platform exactly: E `package.json:186` and `:257` hold `0.4.0` today, and row 11b moves both before R-E1, so that the engram a pin row installs in S names the platform that S builds.

**Pin rows (S).** A move of the engram pin drives one set of files. It was read in the last move S made (`b2921cdd4`, to engram `0.22.0`) and in the three places that hold the range: the root S:`Makefile` (the literal of `CLUSTER_MESH_PEER_TOOLS` at line 1282 and the `PEERS` list of `qualify-published-install` at line 1318), S:`packages/cluster-mesh/package.json` (peer range at line 269, exact development pin at line 294, and the version bump), S:`packages/cluster-mesh/src/modules/catalog.ts` (`ENGRAM_MEMORY_RANGE`, line 18), the root S:`package.json` and S:`package-lock.json`, S:`.github/workflows/ci.yml`, S:`packages/cluster-mesh/tests/storage/cold-workspace.sh` (line 132), S:`scripts/ci/tool-locks.json`, S:`scripts/ci/publishable-ci-wiring.test.mjs`, and S:`BRANCH.md`: ten files. Each move is its own row (18b, 27, 39, 52, 76) under the named exception of the lot it serves (`S1:1672-1676`, `S4:924-927`, SJ:647). The two installed-peer tests of row 18b bring this set to twelve. The sibling exceptions also name S:`scripts/ci/consumer-locks.json`, S:`packages/cluster-mesh/tests/engram-memory/qualification.mk` and the `MCP-L5` pre-candidate manifest (`S3:1039-1043`, `S4:925-929`); these are read-only Allowed inputs where consumed. If receiving-head reconciliation requires changing any of them, stop and split a pin companion before writing: there is no remaining change-set headroom. The pin and companion merge as one reviewed stack, with the full pin gate on its head; a companion inherits the pin row's S owner, Neon builder, class C floor, rollback and exception, names its exact at-most-12-file set, and depends on that pin row. A pin row is skipped when the current pin already contains the rows the next lot waits for; the sentropic conductor may pin a newer engram checkpoint than the one named, never an older one.

**Pin rows (H).** h2a pins its sentropic packages by exact version: `@sentropic/cluster-mesh` `0.26.0`, `@sentropic/engram` `0.28.0`, `@sentropic/llm-mesh` `0.38.4` and `@sentropic/mcp-platform` `0.4.1` in H:`packages/h2a/package.json` (lines 81, 83, 86, 87), and cluster-mesh and llm-mesh again in H:`packages/h2a-runtime/package.json` (lines 27, 29). Three tests assert the cluster-mesh literal (H `packages/h2a/test/remote-session-mesh-consumer.test.js:240`, `packages/h2a/test/registry-artifacts-packed.test.js:35`, `packages/h2a-runtime/src/llm-mesh-resolution.test.ts:20`), and the published payload must hold every dependency at its exact locked version (H `scripts/check-publish-payload.mjs:37-40`). A row of H therefore sees a checkpoint of S or E only after a pin row has moved these literals and the lock together. There are five, one per cluster-mesh checkpoint that h2a consumes: 40b (R-S0), 47b (R-S1), 53b (R-S2), 72b (R-S3) and 79b (R-S4). Each also moves the engram, platform and llm-mesh pins to the versions the pinned cluster-mesh names as its peers. The file set is that of the last pin move of h2a (`51b22f176`, to cluster-mesh `0.26.0`) plus H:`packages/h2a/test/install-skills-hosts.test.js`: 12 files. `S6A:759` places this move inside `6A-H1` (its targets `packages/h2a/package.json:80-88` and `packages/h2a-runtime/package.json:27`); this plan makes it rows of its own. plan/09 moves the same literals at its checkpoints R-H and R-H2 (`plan/09:120-122`): the rule below orders the two plans.

**Two plans, one queue per repository.** plan/09 and this plan build in the same three repositories and on the same host. Four rules hold for both.
1. *One merge queue per repository.* The shared-file rule applies across the two plans: a branch of either plan that lists a file another open branch lists waits for it and rebases on it. In sentropic every cluster-mesh lot of both plans lists the three common files (`plan/09:153`), so the cluster-mesh lots of the two plans form one serial queue, in the order the sentropic conductor records.
2. *One release train per repository.* A release of `@sentropic/engram`, `@sentropic/cluster-mesh`, `@sentropic/mcp-platform` or h2a is cut from `main` and carries every merged row of both plans. A checkpoint of this plan is the first release of that train which holds its rows, and its record names the plan/09 rows it carries. An exact pin never moves backwards: a pin row of either plan pins the newest release that satisfies its own condition.
3. *Slots.* The limit of `plan/09:141` counts the worktrees of both plans: one of class B and two of class C. Row 4, the one class B row before P-REPLAY, takes the class B slot as soon as it is free, ahead of the next row of plan/09; it preempts no open row. The other class B rows of this plan (7, 11c, 11b, 13 and the later ones) take the slot between two rows of plan/09, in the order of their request. Each plan holds one class C slot, and a plan with no row ready lends its slot to the other. The conductors record each grant.
4. *Reclaim.* The record of `plan/09:141` precedes the first class C row of either plan.

**Vectors.** A vector is one fixture file. The producing lot records its SHA-256; the consuming lot copies the bytes unchanged and asserts that digest in a test. A vector never changes in place: a change is a new file name.

| Vector | Written by | Read by | Content |
|---|---|---|---|
| **V-mandate** | Row 20 (`6A-S1b`, S) | Row 41 (`6A-H1-1`, H) | The shared `H2AEnvelope<H2AMandate>` golden vector of `S6A:748` and `S6A:759` |
| **V-codec** | Row 32 (`SJ-5a`, E) | Rows 49 and 56 (`SJ-4` t6, `SJ-8` t5, H) | The wire form of one `keep` and one `drop` amendment, journal form and wire form (SJ:663, t5) |
| **V-launch** | Row 50 (`SJ-7e`, H) | Row 51 (`SJ-7f`, S) | One signed launch receipt (SJ:670, t4) |
| **V-session** | Row 26 (`SJ-7c`, S), the reader, built first | Row 54 (`SJ-7d`, H), the writer | One `params._meta['sentropic.h2a.session']` value with exactly the two fields of `SessionCallerRefV1`, the session and the worktree of the seat (SJ:669, t5; SJ:673, t2) |

**Fixture F-CC (conductor act).** `SJ-1b` replays “the bytes Claude Code wrote for a real session” of the example of SJ §1.2 (SJ:649, SJ:656); no such recording exists (SJ:73). The engram conductor records one Claude Code session of that example, with one compaction and one prompt after it, and copies the transcript bytes unchanged into the fixture of row 6. Committed bytes cannot be withdrawn from history, so the recording follows five rules.
1. *A clean recording context.* A scratch repository whose absolute path carries no personal name; a throwaway Git identity; and a configuration directory created empty for the recording, so that no instruction file, connector list or history of the conductor's own account is injected. How the tool is pointed at that directory is `unverified` by this author.
2. *A short recording.* The compaction is asked by hand, and the manifest says so: left to itself the tool compacts only from 100,000 tokens (SJ:398). The fixture is bounded: at most 2 MiB and 2,000 lines (proposed); a longer recording is made again, shorter.
3. *A scan by code, not by eye.* E:`scripts/session-fixture-scan.mjs`, a file of row 6, fails on a home path (`/home/<name>`, `/Users/<name>`, `C:\Users\<name>`), an e-mail shape, a token shape (a bearer header, a PEM header, the usual vendor prefixes, a run of 32 or more base64 or hexadecimal characters that is not a digest the manifest declares), and any value under a key that names an account, an organisation or a user. The conductor runs it before the fixture is committed; row 6 runs it as a GUARD.
4. *No edit of the bytes.* A hit means a new recording.
5. *A fallback when the tool itself writes an identifier.* If every recording carries an account or organisation identifier that the tool writes on its own, a clean recording cannot exist and rule 4 would loop. The conductor then stops and the owner decides between two acts, neither of which this plan takes in the owner's place: a named exception for that identifier, or a transcript built by a documented Node script from the format of a real one, which changes what `SJ-1b` proves (SJ:649 asks for the bytes of a real session). Row 6 does not start before that decision.

The manifest records the Claude Code version, the SHA-256, the byte and line counts, the ordinals of the compaction boundary and of the cut points, and the fact that the compaction was manual. The location and the format of the transcript file are `unverified` by this author. F-CC has no predecessor and may be recorded during rows 2 to 5.

**Builders (assignment by difficulty).** One rule, the one plan/09 applies: a lot goes to the simplest builder whose class covers it. **Neon** builds the lots with a cross-package contract, concurrency or fencing, storage or migration, an edit of a packed surface, or tricky tests; it also builds any lot, however small, that decides a key, a credential, an authorization or disclosure boundary, a data-loss operation, a host hook or a publication path. **Hydrogen** builds the simpler lots that stay in one package and have clear RED cases: wiring, fixtures, small adapters, a pin move inside one package (row 11b). **Ember** builds the simplest mechanical lots: a document-only change, a removal of unreferenced files, a small guard script. A pin move of sentropic or of h2a is not a single-package lot: it crosses four areas of the repository, a protected file under a named exception and the tests that assert the literal, so the ten rows `PIN-En` and `PIN-Hn` go to Neon. The count is 87 lots for Neon, 13 for Hydrogen (rows 1b, 11b, 14, 22, 25, 29, 38, 45, 63, 66, 73, 75, 80) and 5 for Ember (rows 0b, 1, 6b, 44, 49b): 105 lots, of which row 1 is delivered. The Commissioning Order is the single assignment; it replaces the builder column of SJ §10, which still names Muse 1.3 for five lots. Muse 1.3 builds no lot of this order. A Hydrogen or Ember lot that meets a failing gate it cannot fix inside its Allowed list stops and is reassigned one class up; it does not widen its scope. The builder of a lot is never one of its reviewers.

**Disk.** The classes and floors are those of plan/09 (`plan/09-BRANCH_LIVE_GIT_INDEXING.md`, “Disk”): **A**, E lots that run focused suites, 5 GiB free; **B**, E lots that build, pack and install a tarball or run a package lane, 10 GiB; **C**, S and H lots, real SQLite and Postgres lanes included, 20 GiB. No row of this plan needs class D. Free space is measured live, at the start of a lot and before each run of its gate, on three filesystems: the one of the worktree, the one of `${TMPDIR:-/tmp}`, where the +PACK gates install (E `scripts/check-packed-surface.sh:30`; E `scripts/substrate-tarball-acceptance.mjs:41`), and, for class C, the Docker data root. A lot aborts below its floor on any of them. The limit of plan/09 holds across both plans (`plan/09:141`): at most two class C worktrees and one class B worktree exist at the same time on the commissioning host, the worktrees of plan/09 included; the rule “Two plans, one queue per repository” says who takes a free slot. **Reclaim.** Row 14, the first class C row of this plan, does not start without the reclaim record of `plan/09:141`: the conductor removes merged worktrees and stale test artefacts until at least 50 GiB are free and records the figure before and after; the open worktrees of plan/09 count against the limit before the branch is created. Every lot removes its fixtures, caches and containers at the end, and its builder worktree is removed when the lot is merged. No lot runs the full CI matrix locally. Readings of 2026-11-20 on `/` (935 G), none of which is an input of a lot: 77 G free (92 %) in the Carbon validation, then 83 G free (91 %) during this amendment, with 73 worktrees registered (14 engram, 35 sentropic, 24 h2a).

**Shared files and serial order.** Within one repository, two branches that share a numbered change-set file or a required persistent generated change never run at the same time: the later row rebases on the earlier one. Common read-only inventories and disposable output in isolated worktrees do not serialize otherwise independent lots. The files most often shared: E:`src/session-front-contracts.ts` (rows 4, 5, 6, 9, 10, 30, 31, 32, 35, 38, 63, 84), E:`src/session-front/ingest.ts`, E:`src/session-front/journal.ts`, E:`src/session-context/engine.ts`, E:`package.json` and E:`tsup.config.ts` (rows 4, 11c, 11b, 58, 65, 69 and every release commit), E:`engram-memory/tsconfig.json`, E:`engram-memory/index.ts`, E:`tests/memory-neutrality.test.ts`, the two root guard files, the two derived registry files (rows 3, 11c, 11b, 32, 33, 34, 35 and every release commit); S:`packages/cluster-mesh/src/compose/memory.ts`, S:`packages/cluster-mesh/src/modules/catalog.ts`, S:`packages/cluster-mesh/src/modules/contracts.ts`, the three common cluster-mesh files, S:`.github/workflows/ci.yml` and the pin set; H:`packages/h2a/src/hosts/plugin.ts`, H:`packages/h2a/src/hosts/session-front-client.ts`, H:`packages/h2a/src/runtime/mcp-central-attachment.ts`, H:`scripts/test-inventory.json`, and H:`packages/h2a/package.json` with H:`package-lock.json` (the five pin rows and row 80). The rule holds across plan/09 and this plan (“Two plans, one queue per repository”). Row 13 shares the packed-surface set of the neutral live package with the E rows of plan/09: it runs only while no plan/09 row that lists one of those files is open, and rebases on the last one merged.

**Reviewed stacks and aggregate scope (S).** Rows 15, 15b, 16, 17 and 17b are separately bounded branches/reviews built on the previous green parent, then one PR at row 17b. P1 qualification is judged on that final head. Rows 53 and 53c use the same reviewed-stack rule if P1 needs rotation, as does an activated pin companion. For each component, `BRANCH.md` records its parent SHA, exact changed paths and count (at most 12). Before the final gate the stack head's `BRANCH.md` declares the union of all component paths and exceptions, not only the last component. The aggregate PR may exceed 12 files; each lot may not. Run `make scope-check SCOPE_BASE=origin/main ENV=test-memory-mcp` on that head: this host-harness path actually uses `SCOPE_BASE` (S `Makefile:2459-2466`); the ordinary Docker scope target checks only staged/unstaged paths. No downstream row starts until the stack merges with a green hosted qualification.

**Packed-surface rule for every lot that emits files.** engram publishes three surfaces. A lot that adds an emitted or packed file to one of them, or changes a file of the L0 package, lists that surface's guard files in its Allowed list, and runs them in its gate. In S and H the guards are those of the receiving repository, read at the heads above.
- **cluster-mesh.** The packaging spec counts declaration leaves under `dist/integrations` (S `packages/cluster-mesh/tests/packaging/types-and-bundlers.spec.ts:57-72`, 18 on the inspected head), and the catalogue is typed by `src/modules/contracts.ts`. Rows 21, 28, 71c and 77 list the mutable guards/catalogue declarations they require. Every emitted-source lot runs `make pack-cluster-mesh ENV=test-cluster-mesh`. A pack does not execute the conditional packaging suite: rows 20, 21, 23, 25, 28, 53, 71b, 71c, 77, 78 and the S pin rows also run `make -f packages/cluster-mesh/packaging.mk test-lazy-package ENV=test-cluster-mesh`. Row 19 separately owns C6 declaration/hash/semantic-inventory changes; all CM gates declare that generated declaration and its input inventories through V-S-CM. Required persistent drift anywhere else adds a numbered file or causes a split, never a dropped guard.
- **mcp-platform and mcp-broker.** The public entry `@sentropic/mcp-platform/memory` exports by name (S `packages/mcp-platform/src/memory/index.ts`, 97 lines, no `export *`); `make memory-l5-lint` fails on any export that the frozen inventory does not list (S `tools/memory-mcp-l5/import-graph.mjs:185-205`; S `tools/memory-mcp-l5/exports-v1.json`); and the API report of the entry is verified strictly (S `Makefile:2153`). A row that adds an export lists the barrel, the inventory and the report: row 17 does, and rows 15 and 15b add no export and list the report their signatures change.
- **h2a.** The publish payload check verifies a closed staged tree and holds no file list of its own (H `scripts/check-publish-payload.mjs:6-13`): a new source file under `packages/h2a/src/` reaches the payload through `dist`, which `files` already names (H `packages/h2a/package.json:43-65`). An H row that adds a source file therefore lists no guard file; it registers its test in H:`scripts/test-inventory.json` and runs `npm run pack:h2a` in its gate (below). Row 80, which adds a payload directory, lists H:`packages/h2a/package.json` (`S4:944`).

A lot of S or H whose guard turns out, at branch start, to hold an exact list or a count that this plan did not read lists that guard too; the file counts in the 12.

| Surface | Files that change together | Guard files, in Allowed | Original source facts; re-confirm on the receiving head |
|---|---|---|---|
| Neutral live package, `@sentropic/engram-live` | E:`engram-live/tsconfig.json` (`include`, lines 15–23), E:`scripts/build-live.mjs` | E:`scripts/check-live-package.mjs`, E:`tests/live-neutrality.test.ts` | The rule of plan/09 (“Packed-surface set”), unchanged. `engram-live/contracts.ts` takes no import at all. Row 13 only |
| L0 package, `engram-memory/` | E:`engram-memory/tsconfig.json` (`include`, lines 13–35, an exact list), E:`engram-memory/index.ts` | E:`tests/memory-neutrality.test.ts` | Any source file under `engram-memory/` that contains the string `h2a` fails (`:906-918`). The packed file list, the lockfile closure and the emitted contracts declaration may hold none of `@sentropic/`, `h2a`, `principal_owner`, `leg1_verdict_ref`, `leg2_verdict_ref`, `independence_attestation`, `requestingPrincipal`, `review_status` (`:1055-1086`). `engram-memory/contracts/index.ts` takes no import (`:240-245`), and its project compiles that one file (`engram-memory/contracts/tsconfig.json:13`). An edge that leaves `engram-memory/` fails (`:255-257`) |
| Root package, `@sentropic/engram` | E:`package.json` (`exports`, lines 12–63), E:`tsup.config.ts` (the ESM entry map at line 56 and the CJS entry map at line 88, which must stay identical) | E:`scripts/substrate-tarball-acceptance.mjs`, E:`scripts/fixtures/packed-surface/check-esm.mjs` | The tarball acceptance walks every published entry and fails on a native database driver, a `.node` addon, a lifecycle script, a cluster-mesh reference or an unresolved computed import (`scripts/substrate-tarball-acceptance.mjs:15-19`); it pins the package version (`:50`). The smoke lane installs the tarball in a clean consumer and imports `@sentropic/engram/llm-mesh` from it (`scripts/fixtures/packed-surface/check-esm.mjs:1-11`; `.github/workflows/typescript-ci.yml:202-204`). Product code reads L0 from `engram-memory/dist/` (`src/memory-tools/reads.ts:3-5`), so L0 is built before any test of a lot that changes it |

Two consequences bind every E lot, whatever its Allowed list. No lot writes the string `h2a` or a `@sentropic/` name in a file under `engram-memory/`: a type or a member with such a name lives in the product tree (`src/`), and L0 receives neutral values only (SJ §12, “Where each type lives”). No lot re-exports a new module from `engram-memory/contracts/index.ts`.

**Derived files (E).** Every E build declares the two registry files and E:`src/workspace/tokens-st-css.generated.ts` as generated Allowed outputs, even where they are not in the numbered change set (E `scripts/gen-mcp-memory-assets.mjs:179-240`; `scripts/gen-st-tokens.mjs:70-71`). Rows changing memory MCP assets or the lock list and commit the registry pair: rows 3, 11c, 11b, 32–35. A source-head-only publisher change or byte-identical regeneration may be restored to the pre-gate bytes after recording it; never restore changed asset hashes or token CSS to hide required drift. Such drift moves the file into the numbered set and triggers a split above 12. Rows 4 and 69 state their mandatory split explicitly. Read-only inventory access and regeneration permission never authorize editing a guard to make an invalid package pass.

**Tests that reach L0 (E).** The neutrality suite follows every test file that imports `engram-memory` and refuses each edge from such a file to `src/**` that its allowlist does not name (E `tests/memory-neutrality.test.ts:350-372`, `:490-518`). A test file of a lot whose Allowed list lacks that suite therefore imports nothing from `engram-memory/`: it reaches L0 through the product entry under test. This binds rows 3, 35 and 70 in particular. A test that needs both imports belongs to a lot that lists the suite and adds its edge.

**`MCP-L5` re-pin (S).** P1 qualifies the platform and broker, their committed lock closure, frozen export inventory and API reports. A cluster-mesh bump or engram pin alone does not require rotation; verify the existing identity first. A platform/broker source, dependency baseline, export or API change does. The packer does not retire an incumbent manifest: it refuses different bytes at an existing destination (S `tools/memory-mcp-l5/pack.mjs:175-181`). Row 17b therefore owns the broker baseline `^` plus the final platform version, the committed root lock, both retained history files, a fresh lock snapshot, both archives and the canonical replacement pair. Its single rotation procedure preserves the incumbent, generates and verifies at an absent temporary destination, then promotes the new pair. Both archives are required even when only the broker dependency changes (S `tools/memory-mcp-l5/minimal-pack.mjs:12-17`; `precandidate.mjs:100-101`). Row 53c reuses that procedure only if row 53 changes P1 inputs; it also supplies the P1 evidence for SJ-7b t4. Other pin drift takes a bounded companion before acceptance. `make memory-l5-lint` is an import-graph check, not a substitute for `make memory-l5-gate` or a manifest regeneration.

**Scope exceptions and the branch file (S).** The scope check of sentropic treats a path outside the declared lists as a violation, and a conditional path as a violation unless one declared exception matches its grammar (S `packages/harness/src/checks/scope-check.ts:27`, `:44-52`), which is `BR` followed by digits, an optional lowercase letter, `-EX` and digits (S `packages/harness/src/profile/sentropic.ts:10`; S `rules/MASTER.md:33`). Two consequences. Every S row lists S:`BRANCH.md` in its Allowed list, the `api`, `mcp-platform`, `mcp-broker` and root rows included, and the file counts in the 12. And the names the specifications give to their exceptions (`BRSJ-EX1`, `BRSJ-EX2` at SJ:647; `BRS1-EX1` at `S1:1672`; `BRS4-EX1`, `BRS4-EX2` at `S4:924-931`) do not match that grammar: the receiving branch declares each exception under an identifier that does, and quotes the specification name in its text. The sentropic conductor assigns the identifiers; this plan proposes `BR10-EX1` (the `check-no-python` target, row 14), `BR10-EX2` (the engram pin moved for `SJ-3a` and `SJ-7b`, rows 39 and 52), `BR10-EX3` (the engram pin moved for `6A-S1a` and `1-S1a`, rows 18b and 27), `BR10-EX4` (the engram pin moved for `4-S1a`, row 76) and `BR10-EX5` (the re-pin set, rows 17b and 53c).

**One definition per symbol.** Each contract symbol has one owner file and one lot that creates it; every later lot imports it. This is the design-note rule of SJ `0.1.2` (SJ:5, SJ:32, SJ §12).

| Symbols | Owner file | Created by |
|---|---|---|
| The shared declarations of S0 (`Sha256Digest`, `MetamodelVersion`, `LineageId`, `OntologyTemplateEnvelopeRef`, `CrossLineageCompositionPin`, `H2AMandateEnvelope`; `S0:143-174`) | E:`src/metamodel-contracts.ts`, the file S1 imports (`S1:180-185`) | Row 2, which creates nothing else. Row 2b imports them into the digest modules, row 36 into `src/metamodel/types.ts`; neither declares one again |
| The Spec 1 contract block (`S1:179-463`) with `S1-a`, `S1-e`, `S1-g` applied | E:`src/session-front-contracts.ts` | Row 4 |
| Block A of SJ §12: selector, Track scope reference, query, watermark, request, item reference, delivery, policy | same file | Row 5 |
| `SpeechTurnJournalFieldsV1`, `ToolResultJournalFieldsV1` (`S1-b`, `S1-c`) | same file | Row 6 |
| Amendment author, amendment, gate verdict | same file | Row 9 |
| `contextRequest` and `contextDelivery`, the first members of `SessionJournalEnvelopeFieldsV1` and `SessionJournalReceiptFieldsV1` | same file | Row 10 |
| Block B, the wrapper: `SessionJournalHostFactsV1`, `SessionJournalOutcomeV1`, `EngramSessionJournalPortV1`, and the type `SessionReadOnlyDeliveryV1`, which the first two reference (SJ:840, SJ:844) | same file | Row 30 |
| The read-only delivery behind that type | E:`src/session-front/journal.ts` | Row 31, which declares no type |
| The wire codec, `SessionContextWire`, `SessionHistoryMatchV1` | same file | Row 32 |
| `SearchInputV2`, `SearchPageV2` | E:`src/mcp/memory/contracts.ts` | Row 32 |
| `contextAmendments` and `contextAmendmentVerdicts` on the journal call | E:`src/session-front-contracts.ts` | Row 35 |
| `SessionExtractionBatchFieldsV1`, `SessionExtractionReceiptFieldsV1` | same file | Row 38 |
| `pendingProactiveRoleProposalId` | same file | Row 63 |
| Block C, `SessionContextBindingV1` | S:`packages/mcp-platform/src/memory/` | Row 17. engram and cluster-mesh import it; engram imports it type-only |
| Block D: `AnnotationRoutePolicyV1`; `ModelContentAuthorizationPolicyV1`, which takes the place of the interim `MemoryModelContentAuthGateV1` of S4 (`S4-f`) | S:`packages/cluster-mesh` | Rows 72 and 51 |
| The NER contract: `NerRequest`, `NerResult`, `NerSpan`, `NerDescriptor`, `PinnedOnnxArtifactManifestV2` and the other exports of `@sentropic/llm-mesh/ner` (NER:172) | S:`packages/llm-mesh`, outside this plan | The external checkpoint X-NER. Rows 71c and 72 import them. No lot of this plan declares a NER request, a NER result or a pinned-artifact manifest, in engram, in cluster-mesh or in h2a; `PinnedOnnxArtifactManifestV1` and its single `model_onnx_sha256` are declared nowhere (NER:139-143) |
| Block E: `H2ASeatLaunchBodyV1`; `SessionCallerRefV1` | H:`packages/h2a` | Rows 50 and 54 |

`isValidWorktreeId` has exactly one definition, E:`src/session-front-contracts.ts`, created by row 4. Row 13 does not redeclare that symbol or import product code into the neutral package. Its derived-worktree operation checks the two identifier fields against the prescribed `wt:` plus 64 lowercase hexadecimal digits as part of its own record validation; the shared vector compares that operation's acceptance with the product predicate. The existing object validator `validateWorktreeIdentity` remains a different symbol with its original full-record contract (E `engram-live/contracts.ts:1237-1255`). This replaces the round-1 duplicate-symbol exception while preserving S1's field grammar (E `S1:312-317`) and package neutrality.

**Frozen signatures.** No lot changes: the two methods of `EngramSessionIngestFrontPort` and their results (`S1:459-463`; `S1-n`); `Result<T>` and `MemoryErrorV1` of L0; the existing members of the Spec 1 envelope and receipt, to which this plan adds optional members only; the six tool names (E `src/mcp/memory/contracts.ts:149-156`) and their `requiredClaims` (`src/mcp/memory/gates.ts:188`, `:205`, `:222`, `:239`, `:255`, `:272`, one per tool); the `v1` profile identifiers and digests (E `src/mcp-memory/profiles.ts:7-15`) and every byte of the `v1` manifest; `SearchInputV1`, `SearchPageV1` and the outer result envelope (`src/mcp/memory/contracts.ts:437-456`); the `v1` projection of the platform, key for key (SJ:668, t1); `validateH2AEnvelope` and `verifyEnvelopeSignature` of h2a (SJ:670); `H2ALoopTrackRef` of h2a; `StepReceipt` of the agentic-loop dossier (SJ §5). A lot that cannot be built without changing one of them stops; the change is a spec amendment, not a scope amendment.

**Sibling rows are read with their deltas.** For a lot of S0, S1, S3, S4 or S6A, the section of this plan is the build instruction: it restates the sibling row with the rows of SJ §8 applied. Where the sibling row and this plan differ, this plan and SJ §8 win. Row 0b makes each sibling file say so, so that no builder reads a superseded row unmarked. The full fold of SJ §8 into the sibling texts stays with their authors (SJ:512, SJ:707) and is not a lot of this plan.

**Zero Python.** No repository, gate, script or job runs Python, and no lot adds a `*.py`, a `pyproject.toml` or a `requirements*.txt`. Every gate ends with the guard of its repository; documentation-only gates list their manual comparisons as acceptance steps after that command. engram has it since `2cb2aa6a` (row 1, delivered): E `scripts/check-no-python.mjs` fails on any tracked or untracked non-ignored Python path outside an exact list of 16 data files, the inputs of the code-graph extractor (`:26-43`, `:59`), which are never executed; row 1b extends it to executable contexts. h2a has it on `origin/main`: H `scripts/check-no-python.mjs` exists at `e9ce1a8db` and already reads executable contexts (shebangs, `package.json` scripts, workflow steps, Dockerfiles, process-spawning calls); the first act of the first H row runs it on the receiving head. sentropic has none: at S `d6093d568` there is no S `scripts/check-no-python.mjs` and no `check-no-python` target in the root `Makefile`, so row 14 adds it and merges first among the S rows. The NER contract keeps the rule: no Python in any image, runtime, export job or CI step (NER:7).

**Receiving-branch confirmation (E, S and H).** The three bases move: E `origin/main` now includes L3a-E1, and S also moved after round 1. The first act of every branch, in the three repositories, is therefore to read again, at its receiving `origin/main`, each anchor its section cites, and to record the head and any anchor that moved; a line number of this plan is a pointer, never an input. In S and H the paths themselves are proposals: the same first act records the exact Allowed list, takes the next free migration or asset number, and relabels as GUARD, with a discriminating mutation, any proposed RED that already passes. A list above 12 files is split before any code is written; no gate is dropped by a split. Every branch that changes files under S:`packages/cluster-mesh/` may also change the three common files (S:`BRANCH.md`, S:`packages/cluster-mesh/package.json`, S:`package-lock.json`); they count in the 12 and the order table includes them. A lot that changes a file under the `src/` of a published S package bumps that package's version: the hosted check compares the version with the merge base and skips private packages (S `.github/workflows/ci.yml:141-173`; `S1:1655`).

**Gate conventions and Allowed verification sets.** Run each lot's literal command from its repository root after the applicable setup below. Installed tools only; E uses `npx --no-install`, S build/test/package actions use Make and Docker, and every Make invocation ends with `ENV=test-*`. Missing runtimes/backends, absent fixtures, zero collected cases or a skipped named guard fail acceptance. Record executed case names, command and exit status. Each RED/GUARD belongs to its named test file (an ellipsis continues the previous file); documentary guards require the recorded comparison in their gate.

These sets are **Allowed verification inputs/outputs**, incorporated by name in every lot. Read-only permits inventory consumption, not edits. Generated permits regeneration; required persistent tracked drift joins the numbered change set before acceptance. A set includes the exact paths named by its versioned inventories, recursively, for reading only. Resolve receiving-head inventory entries in the gate record. Scratch roots permit only disposable ignored output, never unlisted tracked changes.

| Set | Read-only inventories and guard inputs | Allowed generated outputs |
|---|---|---|
| **V-DOC** | This plan, cited specifications/briefs/validations, Git parent/tree path inventory the documentary lot's named fixture/evidence manifest and its repository no-Python guard/inline allowlist | The numbered documentary files only; capture command output in the evidence file |
| **V-E** | E:`package.json`, `package-lock.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`, `scripts/check-no-python.mjs` (fixture list), `scripts/gen-mcp-memory-assets.mjs` (asset list), `scripts/gen-st-tokens.mjs`, and build-input package/compiler manifests | E:`registry/entries.v1.json`, `registry/publisher-assets.v1.json`, `src/workspace/tokens-st-css.generated.ts`; ignored `dist/`, `node_modules/.cache/`, `.tmp/`, build-info and private test scratch |
| **V-E-L0** | V-E plus E:`engram-memory/package.json`, `package-lock.json`, `tsconfig.json` (all three under `engram-memory/`), `engram-memory/contracts/tsconfig.json`, `tests/memory-neutrality.test.ts` (import/packed-file inventories) | E:`engram-memory/dist/`, `engram-memory/contracts/dist/`, build-info and scratch packed consumers |
| **V-E-PACK** | V-E plus E:`scripts/substrate-tarball-acceptance.mjs`, `scripts/substrate-installed-acceptance.mjs`, `scripts/check-packed-surface.sh`, `.github/workflows/typescript-ci.yml`; `package.json`, `package-lock.json`, `README.md` under `scripts/fixtures/substrate-consumer/`; `package.json`, `tsconfig.json`, `check-esm.mjs`, `check-cjs.cjs` under `scripts/fixtures/packed-surface/` | Archives, installation manifests/locks and compiled fixture output in private tarball/packed-surface scratch; the committed substrate fixture lock changes only when numbered |
| **V-E-LIVE** | V-E plus E:`engram-live/package.json`, `engram-live/tsconfig.json`, `scripts/build-live.mjs`, `scripts/check-live-package.mjs`, `tests/live-neutrality.test.ts`, `tests/live-package.test.ts` | E:`engram-live/dist/`, build-info and live-guard temporary archives/consumers |
| **V-S** | S:`BRANCH.md`, `Makefile`, `package.json`, `package-lock.json`, `scripts/ci/tool-locks.json`, `scripts/ci/consumer-locks.json`, `scripts/ci/publishable-ci-wiring.test.mjs`, `scripts/check-no-python.mjs`, `scripts/no-python-allowlist.json` (last two created by row 14); receiving package/compiler/test manifests and exact inventories selected by the locked-tool records | Ignored `tmp/`, `.h2a/` dependency/qualification scratch, package `dist/`, `temp/`, `node_modules/`, build-info, container-private `/tmp`, isolated test DBs and Make-owned receipts; no tracked pin/lock refresh unless numbered |
| **V-S-CM** | V-S plus, under S:`packages/cluster-mesh/`: `package.json`, `tsconfig.json`, `tsconfig.test.json`, `vitest.config.ts`, `src/modules/catalog.ts`, `src/modules/contracts.ts`, `tests/storage/cold-workspace.sh`, `tests/storage/postgres.mk`, `tests/storage/storage-deps.package.json`, `tests/storage/storage-deps.package-lock.json`, `tests/storage/comments-deps.package.json`, `tests/storage/comments-deps.package-lock.json`, `tests/engram-memory/package-contract.mjs`, `tests/engram-memory/qualification.mk`; under `assets/storage/engram-memory/`: `neutral-asset-inventory.json`, `contract-manifest.json`, `equivalence.json`, `neutral-equivalence.json`, `C6-FREEZE.md`, and referenced storage inventories | S:`packages/cluster-mesh/contracts/engram-memory-neutral-contract-v1.d.ts`, package staging/tarballs and disposable `L5-MEMORY-V1` / `lot2-manifest.json` receipts in their Make output roots. The neutral and semantic inventories remain read-only outside row 19 or an explicit companion |
| **V-S-PACK** | V-S-CM plus, under S:`packages/cluster-mesh/`: `packaging.mk`, `tests/packaging/prepare.sh`, `tests/packaging/helpers.ts`, `tests/packaging/types-and-bundlers.spec.ts`, `tests/packaging/tuple-skew.spec.ts`, `tests/packaging/optional-install.spec.ts`, `tests/packaging/skew-invariants.spec.ts`, `tests/fixtures/train.ts`, `tests/packaging/fixtures/selected/package.json`, `tests/packaging/fixtures/selected/package-lock.json`, and package/compiler inventories of the six sibling builds in `packaging.mk:59-64` | Sibling ignored `dist/` and build-info; container `/tmp/lazy-package/` including candidate archives, receipts and installed consumer inventories. Both committed selected-fixture files stay read-only unless a bounded refresh lists them |
| **V-S-P1** | V-S plus both platform/broker `package.json` and `tsconfig.json`; S:`packages/mcp-platform/api-extractor.json`, `api-extractor.memory.json`, `etc/mcp-platform.api.md`, `etc/mcp-platform-memory.api.md`; under S:`tools/memory-mcp-l5/`: `precandidate.mjs`, `build-inputs.mjs`, `exports-v1.json`, `proof-catalog-v1.json`, `schemas/checkpoint-v1.schema.json`, `schemas/artifact-manifest-v1.schema.json`, `fixtures/l0/60a8bfa828b5eabd360232ea5865391c23f99f48/index.json` and its two rule files, `fixtures/l0/tool-schemas.json`, `fixtures/l0/schema-assets.sha256`, `artifacts/toolchain/toolchain.package.json`, `artifacts/toolchain/toolchain.package-lock.json`, canonical manifest/sidecar and their exact inventory/artifact entries; S:`spec/evidence/memory-mcp-l5/l0-freeze.json` | Both platform API reports may regenerate explicitly; persistent report edits must be numbered. Scratch S:`tmp/plan10-p1-*` and qualification roots. Persistent history pair, lock snapshot, two archives and canonical pair only in rows 17b, 53c or a bounded re-pin companion |
| **V-S-API** | V-S plus S:`api/package.json`, `api/tsconfig.json`, Vitest/Compose inventories selected by the root Make API target and the tested route-table inventory | API build/test reports and isolated API services/DBs; no route-table or configuration edits |
| **V-H** | H:`package.json`, `package-lock.json`, `packages/h2a/package.json`, `packages/h2a-runtime/package.json`, `packages/track/package.json`, their TypeScript configurations, `packages/h2a-runtime/vitest.config.ts`, `scripts/test-inventory.json`, `scripts/spec-0985-test-inventory.json`, `scripts/bulk-test-inventory.json`, `scripts/test-skip-exceptions.json`, `scripts/test-non-tests-0986.json`, `scripts/test-inventory.mjs`, `scripts/test-execution-evidence.mjs`, `scripts/check-no-python.mjs`, `scripts/check-publish-payload.mjs`, and checked-in build/payload inventories selected by `npm test` and `pack:h2a` | Package `dist/`, build-info, ignored `tmp/` reports and private `$HOME/.cache-tmp/h2a-test/run-*` including staged payload manifests, tarballs and consumers. Never silently refresh a checked-in payload manifest |
| **V-H-FOCUS** | V-H plus H:`scripts/build-focus-dossier.mjs`, `packages/h2a/focus-kit/renderer-manifest.json`, `packages/h2a/focus-kit/test/fixtures/evidence-corpus.v1.json`, `evidence-performance-policy.v1.json` in the same fixture directory, and their exact source/asset inventories | Private check scratch only: `--check` never blesses or rewrites the frozen corpus, renderer or policy |

**S setup and cleanup.** Before a Compose-backed gate, the conductor exports disjoint `API_PORT`, `UI_PORT` and `MAILDEV_UI_PORT`; check with `: "${API_PORT:?assigned API port required}" "${UI_PORT:?assigned UI port required}" "${MAILDEV_UI_PORT:?assigned mail port required}"`. Reserve each literal `ENV` below exclusively for its worktree during the gate. For API gates run `make up-api-test ENV=test-api` and install `trap 'make down ENV=test-api' EXIT` in the same shell first. For PostgreSQL lots install `trap 'make -f Makefile -f packages/cluster-mesh/tests/storage/postgres.mk cluster-mesh-pg-down ENV=test-cluster-mesh' EXIT` first, so cleanup also runs after failure. Other lanes use disposable `docker run --rm` targets. A backend not started is never a successful skip.

**H setup.** Run this once in the same shell as each H build gate. It matches H `scripts/run-test-gates.mjs:78-99`; never reuse `/tmp` or overwrite `HOME`.

```sh
mkdir -p "$HOME/.cache-tmp/h2a-test"
PLAN10_H_TMP="$(mktemp -d "$HOME/.cache-tmp/h2a-test/run-XXXXXXXX")"
export TMPDIR="$PLAN10_H_TMP" TMP="$PLAN10_H_TMP" TEMP="$PLAN10_H_TMP" H2A_TEST_QUALIFICATION_ROOT="$PLAN10_H_TMP"
trap 'rm -rf -- "$PLAN10_H_TMP"' EXIT
```

The explicit H inventory command calls `declarationFailures`; invoking `scripts/test-inventory.mjs` alone runs no check (H `scripts/test-inventory.mjs:71-85`). Focused commands execute the named cases; `npm test`, where listed, also checks full-inventory execution. Register each required new case before either form runs. Every emitted H source change packs the closed payload with `npm run pack:h2a`; runtime changes also use `npm run pack:h2a-runtime`, never raw-workspace prepack.

**Lot size.** An SJ lot holds at most 150 lines of non-test code; one that would exceed it is split before it starts (SJ:640). A lot of a sibling spec follows the size rule of its own spec. In sentropic the 150-line limit holds for each commit (`S1:1655`).

## Plan dispositions

Each row is a point where SJ §10 or a sibling row could not be built as written, or where this plan had to choose. The validators confirm or overrule each one.

| # | Finding | Evidence | Disposition |
|---|---|---|---|
| PD-01 | The closure is larger than the ten lots SJ §10 names. | `1-E1` waits for Lot 0.1 and `6A-E1` (`S1:1663`); `1-S1a` for `6A-S0b`, `6A-S1a`, `6A-S1c`, `6A-S1d`, `1-E2`, `1-E4` (`S1:1682`); `1-S2` for `6A-S2` (`S1:1684`); `1-H1` for `6A-H2`, `6A-H3`, `1-S1b` (`S1:1692`); `6A-H1` for `6A-S3` (`S6A:759`); `3-E3` for `4-E1..4-E3` (`S3:1022`), which wait for S0 lots 0.1–0.5 (`S4:910`); `4-H3` for `4-H2`, `4-S1a`, `4-E4a` (`S4:951`). No S0 lot is built: [Sources](#sources). | All are rows of the order. |
| PD-02 | `1-E1` cannot put the Spec 1 contract in `engram-memory/contracts/session-front.ts` (`S1:1663`, `S1:176`). The contract holds `h2aProactiveRoleAnalysisQueued` and `H2AMandateEnvelope` (`S1:369`, `S1:337`). | The three L0 guards of the packed-surface table. | The contract lives in E:`src/session-front-contracts.ts`, where `S1:179` and SJ §12 place it. Row 4 creates no file under `engram-memory/contracts/`. |
| PD-03 | `SJ-0e` t2, “the repository as it is passes”, fails as written: the repository holds Python files as extractor fixtures. | E:`tests/fixtures/sample.py`. | Delivered by PR #462: the guard holds an exact list of 16 data files, inline (E `scripts/check-no-python.mjs:26-43`), and a new Python file under the same directories fails. The list was merged by the owner. Row 1b adds the executable contexts. |
| PD-04 | The test files S6A names for its E lots end in `.spec.ts` (`S6A:737`); the runner would collect none. | E `vitest.config.ts:11`. | Row 3 names its file `tests/mcp-memory/mandate-and-track-guard.test.ts`. |
| PD-05 | `1-E2` moves `@sentropic/llm-mesh` to an optional peer (`S1:1664`). The clean consumer of the smoke lane imports `@sentropic/engram/llm-mesh` and installs no peer. With its guards the lot holds 14 files. | E `scripts/fixtures/packed-surface/check-esm.mjs:1-11`; E `package.json:152`. | Split: row 11 (SDK isolation, 5 files), row 11c (optional peer, both smoke installers and offline fixture lock/README, 12), then row 12 (privacy, 9). PIN-P1 carries its own consumer closure and guards (9). |
| PD-06 | `SJ-2c` t3 screens text with the deny-list and the PII armor (SJ:659), which `1-E2` creates (`S1:884-894`, `S1:1664`). The row of SJ does not name it. | SJ:494, SJ:659. | Row 30 depends on row 12. |
| PD-07 | `SJ-3a` t5 calls `verifyH2APolicyEnvelopeV1` (SJ:661), which `4-S1c` creates (`S4:937`). The row of SJ does not name it. | SJ:351, SJ:661, `S4:937`. | Split: row 40 (t1–t4, t6) and row 79 (t5), which depends on row 78. |
| PD-08 | `SJ-13` t2 needs the shadow gate state of `3-E2`, and `3-E3` the contracts of `3-E1` (SJ:679, `S3:1020-1022`). `SJ-15` t2 needs the registry store of Lot 0.4, not only the reference type (SJ:681, `S0:899-905`). | The rows cited. | Row 70 depends on rows 68 and 69; row 69 on row 67; row 59 on row 58. |
| PD-09 | `6A-H3` waits for `SJ-7b` (`S6A-h`), and `1-H1` waits for `6A-H3`: the live proof would wait for `v2`. Only test 2 of `6A-H3` needed `6A-S4` (`S6A:761`). | SJ:581, SJ:583. | Split: row 47 (test 1) and row 55 (test 2, after `SJ-7b` and `SJ-7d`). |
| PD-10 | A pin move of engram in sentropic drives twelve files, and S still pins `0.22.0`. | `S1:1672-1676`, `S3:1039`, `S4:924-931`; S `b2921cdd4`; S `packages/cluster-mesh/src/modules/catalog.ts:18`. | Five 12-file pin rows (18b, 27, 39, 52, 76), each under the exception of the lot it serves. Row 18b is the move that `6A-S1a` asks for (“engram `0.28.0+`”, `S6A:747`). |
| PD-11 | engram publishes under `latest` only, and its tarball acceptance pins the version. A checkpoint cannot carry a prerelease identifier: sentropic admits none. | E `.github/workflows/typescript-ci.yml:276-277`; E `scripts/substrate-tarball-acceptance.mjs:50`; S `packages/cluster-mesh/src/modules/semver.ts:5`. | Row 7 (`E-REL-J`): a checkpoint is a plain version under the dist-tag `sj`, read from `publishConfig.tag`; the release commit follows the 13-file set of `809af689`. |
| PD-12 | `isValidWorktreeId` is declared for both `1-E1` and `1-E4` (`S1:312-317`), in two packages that cannot import each other. | The neutral live package rule of plan/09. | One definition of the named predicate in the product entry. Row 13 checks its record fields and the shared vector without redeclaring the symbol or importing product code. |
| PD-13 | SJ §10 names Muse 1.3 for `SJ-0s`, `SJ-6a`, `SJ-10`, `SJ-11`, `SJ-14`, and Ember for `SJ-16e`. | SJ:654, :666, :676, :677, :680, :682; the owner's rule of 19/11. | `SJ-0s`, `SJ-10`, `SJ-11`, `SJ-14`, `SJ-16e`: Hydrogen. `SJ-6a`: Neon, as a rights boundary. `SJ-1c` stays with Neon, as SJ names it: the first edition gave it to Hydrogen and the validation overruled that. |
| PD-14 | `S1-a` checks `hostId` “against h2a's host registry at the cluster-mesh hop”; cluster-mesh takes no h2a dependency (`S4:937`). The carrier of that registry is not named. | SJ:518. | `source-gap`. Row 28 checks `hostId` against the enrolled host attachment (`S6A:224`); the sentropic conductor confirms the carrier at branch start. |
| PD-15 | `4-E4b` is not a prerequisite. `S4-g` unblocks it and makes it depend on `SJ-1c`; without it tier 4 of the view, the rules, is empty (SJ §2.7). | SJ:566. | Row 66, marked as a delta lot. |
| PD-16 | The platform release cannot be a prerelease, and neither can any other checkpoint. | SJ:668, t5; S `packages/cluster-mesh/src/modules/semver.ts:5`, `:50-56`; S `Makefile:1398-1400`. | Every checkpoint is a plain version: the checkpoint rule and the platform release rule above. |
| PD-17 | Builders of sibling lots would read superseded rows. | SJ:512. | Row 0b, as S0-g does in plan/09. |
| PD-18 | `SJ-1b` needs a recording that does not exist, and committed bytes cannot be withdrawn. | SJ:73, SJ:656, SJ:398. | Fixture F-CC, a conductor act under five rules: a clean context, a short recording, a scan by code, no edit, and a fallback that is the owner's decision. |
| PD-19 | Sibling rows above 12 files, or across two packages. | `S6A:745` (two packages), `S6A:751` (cluster-mesh and `api`), `S6A:759` (about 19 files), `S6A:760` (about 21), `S6A:761`. | `6A-S0a` in three rows (15, 15b, 16), `6A-S1a` in three with its pin row (18b, 19, 19b), `6A-S2` in two, `6A-H1` in four with its pin row (40b, 41, 42, 43), `6A-H2` in three, `6A-H3` in two. |
| PD-20 | The nine legacy modules, the ceremony and their ten tests exist on H `origin/main`, and the ceremony imports two of the modules it must outlive. | H `e9ce1a8db`: the ten files under `packages/h2a/src/runtime/memory/`; H `packages/h2a/src/runtime/memory/d11-ceremony.ts:509-517` (`./port-v1.js`, `./promote-client.js`). | Resolved: row 46 migrates the ceremony first, rows 44 and 45 then remove the nine modules, and the absence assertion closes row 45. |
| PD-21 | `SJ-7c` t4 refuses a binding for “a session cluster-mesh saw noted by another caller” (SJ:669), while cluster-mesh “does not read the journal” to build a binding (SJ:246). The record it reads is not named. | SJ:246, SJ:261, SJ:669. | `source-gap`. Expected in the neutral `session-db` of chat-mesh B1 and B2. If absent when row 26 starts, t4 moves to row 40. |
| PD-22 | `6A-H3` test 1 and `1-H1` both claim the recording of turns by the eight hosts, and `1-H1` creates the session-front client (`S6A:761`, `S1:1692`). | The two rows cited. | One definition: row 48 creates the client and proves the recording; row 47 delivers the banner helper, the admission and the fail-closed rule. |
| PD-23 | `SJ-9` must reuse the NER contract of llm-mesh `0.39.0` and declare none; `S1:1664` and `S1:1684` cap the mesh range at `<0.39.0`, and so does cluster-mesh. | The sentropic conductor's binding input; NER:139-143, NER:170-173; S `packages/cluster-mesh/src/modules/catalog.ts:19-20`; S `packages/cluster-mesh/tests/packaging/tuple-skew.spec.ts:13`, `:23`. | New consumers use `>=0.38.0 <0.40.0` (rows 11c, 71); existing cluster-mesh ranges retain their lower bounds and legacy exception while widening the upper bound to `<0.40.0`. Row 71b widens cluster-mesh with all range assertions; row 71c adds the NER leaf; row 72 serves `finetuned` through that contract. All three wait for the external checkpoint X-NER. Where `S1:1664` and `S1:1684` differ, the binding input wins. |
| PD-24 | h2a pins cluster-mesh, engram, llm-mesh and the platform by exact version; no row of the first edition moved a pin, and six h2a rows waited for the journal route without needing it. | H `packages/h2a/package.json:81-87`; H `packages/h2a-runtime/package.json:27`; `S6A:759`. | Five pin rows (40b, 47b, 53b, 72b, 79b) and one more cluster-mesh checkpoint, R-S0, after row 25: rows 41 to 47 run beside the S rows 26 to 40. |
| PD-25 | Rows 3 and 4 need the types of S0, not the digest amendment of Lot 0.1 and its `test:g0` gate. | `S6A:737`; `S1:180-185`; `S0:875-882`. | Lot 0.1 is two rows: row 2 (the declarations, on the first-proof chain) and row 2b (the digest, off it). |
| PD-26 | A change of the platform or of the broker changes the inputs of the `MCP-L5` pre-candidate manifest, whose hosted job then fails until a re-pin. | S `tools/memory-mcp-l5/precandidate.mjs:11-21`; S `.github/workflows/ci.yml:1417-1428`. | Rows 15, 15b, 16 and 17 are reviewed one by one and merged as one stack, closed by the re-pin row 17b. |
| PD-27 | R-E4 waited for four dreaming rows that no S or H row of this plan imports. | SJ:675 (the prerequisites of `SJ-9`); SJ:550 (`3-S1a` and `3-S1b` wait for `SJ-9`); `S3:772`. | R-E4 is cut on rows 57 to 66; rows 67 to 70 ship in R-E5. The installed use of the dreaming hand-off waits for the sentropic lots of S3, which this plan does not build: `not covered`. |
| PD-28 | `1-H1` puts the bounded poll of `agy` and `muse` in the runtime seats, a second package, and lists no file of it. | `S1:1692`. | Row 48 keeps the hooks and the client; row 48b builds the poll, off the path to P-LIVE. |
| PD-29 | Row 13 adds a module to `@sentropic/engram-live`, which R-E1 does not pack. | E `engram-live/package.json:2`; E `package.json:68-74`; `S1:1682`. | Row 13 leaves R-E1; row 28 waits for it merged and for no release of the neutral package (“Row 13 and the neutral package”). |
| PD-30 | The scope check of sentropic admits exception identifiers of one grammar, which the names of SJ, S1 and S4 do not match, and treats an unlisted `BRANCH.md` as a violation. | S `packages/harness/src/profile/sentropic.ts:10`; S `packages/harness/src/checks/scope-check.ts:44-52`. | Identifiers of that grammar, proposed as `BR10-EX1` to `BR10-EX5`, with the specification name quoted; S:`BRANCH.md` in every S row. |
| PD-31 | The journal is off until a workspace opts in; SJ calls `journalEnabled` a workspace setting and names neither its store nor its setter. | SJ:825-826; `OD:83`. | `source-gap`. Row 40 reads the setting through one injected reader and adds no store of its own; the sentropic conductor names the store before row 40 starts, and P-LIVE does not start before one test workspace can be opted in through it. |
| PD-32 | The read-only delivery needs the signed `D18` policy and the bridge-lock slice list at the route; no specification names how they reach it. `4-S2`, the hosted exposure of the `h2a` routes, is outside this plan. | `S4:968`; SJ:661, t3 and t5; `S4:939`. | `source-gap`. Row 79 does not start before the two conductors have recorded the carrier; this plan proposes a signed header of the family already in use (`X-Sentropic-H2A-Mandate`, `S6A:745`; `X-Sentropic-H2A-Launch`, SJ:670), never a member of the body. Rows 81 to 83 are proven against the local cluster-mesh daemon only; their hosted path is `not covered` until `4-S2`. |
| PD-33 | 2026-11-21 · Align X-NER, 71b and SJ-9 on the architect's r5. | NER r5 §§6.2, 7–8 and engram qualification v0.1.4, “Test-first implementation lots” and “Owner GO”. | Use the r5 handoff and two conditional production GOs. For the 71c evidence consumed by SJ-9, r5 §6.2 requires a lazy host entry for host-selected installs and a remote-only packed guard against host imports and ONNX/tokenizer runtime installation. Sentropic X-NER owns those catalog/loader paths and supplies the evidence under the single-writer coordination. |

## Lots

One section per row. The order table gives, for each row, its repository, its dependencies, its builder with the reason, and its disk class; a section gives the source, the deltas applied, the RED and GUARD cases, the exact Allowed list and the gate. “Source” is the row of the spec that defines the lot. A case written `tN` is test `tN` of that row.

### Step 1 — First proof by replay (engram)

#### Row 0 · PLAN — Amendment and validation record — engram, docs

- Allowed verification: `V-DOC`.
- Allowed (1, E): E:`plan/10-BRANCH_MEMORY_SESSION_JOURNAL.md` only.
- GUARD: every round-2 finding has a disposition, every lot has a bounded change set and executable gate, and every new anchor has been re-read at its recorded `origin/main` head.
- Gate: `git diff --check && git status --short --untracked-files=all && node scripts/check-no-python.mjs`; review the path list against the one-file scope, the per-finding ledger and the anchor record below. The current read-only Git metadata prevents the requested rebase; the command in “Reference heads and rebase status” must succeed before this row is committed or row 1b starts. No commit or build is part of this authoring turn.

#### Row 0b · S8-ptr — Pointer to SJ §8 in the sibling specs — engram

- Allowed verification: `V-DOC`.
- [ ] GUARD (manual documentary check): each of the four sibling specs ends with the dated pointer below, and nothing else in them changes.
- Text to append to each file, under a final heading `## Pointer (2026-11-20)` (one paragraph, the same in the four files, so that the lot is mechanical): “**2026-11-20 pointer.** `spec/SPEC_ENGRAM_SESSION_JOURNAL_AND_CONTEXT_QUERY.md` (`v0.1.2`, owner GO of 2026-11-20) supersedes `spec/SPEC_ENGRAM_CONTEXTUAL_GRAPH_AND_PROMPT_LOOP.md`. Its §8 lists, row by row, the lines of this specification that change, each with a Before and an After. Until the author of this specification folds those rows into the text, a line named in §8 is read with its After. `plan/10-BRANCH_MEMORY_SESSION_JOURNAL.md` builds the lots of this specification with those rows applied. Nothing else in this specification changes.”
- Allowed (4, E): E:`spec/SPEC_ENGRAM_SESSION_FRONT_AND_EXTRACTION.md`, E:`spec/SPEC_ENGRAM_DORMANT_DREAMING_SYNTHESIS.md`, E:`spec/SPEC_ENGRAM_H2A_ROLE_ONTOLOGY_AND_HARNESS_OVERLAYS.md`, E:`spec/SPEC_ENGRAM_CLUSTER_MESH_MEMORY_ACCESS_AND_MCP_WIRING.md`.
- Forbidden: any other change to those files; any code, test or plan change. Line anchors of the four files are not renumbered: the text is appended.
- Gate: `git diff --check && git diff --name-only origin/main && git diff origin/main -- spec/SPEC_ENGRAM_SESSION_FRONT_AND_EXTRACTION.md spec/SPEC_ENGRAM_DORMANT_DREAMING_SYNTHESIS.md spec/SPEC_ENGRAM_H2A_ROLE_ONTOLOGY_AND_HARNESS_OVERLAYS.md spec/SPEC_ENGRAM_CLUSTER_MESH_MEMORY_ACCESS_AND_MCP_WIRING.md && node scripts/check-no-python.mjs`; compare the four paths and appended bytes with the exact pointer above, and record the documentary GUARD result.

#### Row 1 · SJ-0e — No-Python guard — engram

- Allowed verification: `V-E`.
- Source: SJ:653. Disposition PD-03. **Delivered**: PR #462, squash `2cb2aa6a1c4a251b55588c9576accfecaa7733c4` on E `origin/main`, two files added (`scripts/check-no-python.mjs`, 89 lines; `tests/check-no-python.test.ts`, 185 lines).
- [x] t1: a tree with one `*.py`, a nested one, a `pyproject.toml` or a `requirements*.txt` fails and names the path (`tests/check-no-python.test.ts:59`, `:73`, `:84`, `:95`).
- [x] t2: the repository as it is passes (`:180`).
- [x] Added by the lot: a new Python file under the directories of the data fixtures fails (`:120`); an untracked file that is not ignored fails without `git add` (`:142`); outside a Git tree the guard fails closed (`:167`).
- Delivered shape, where it differs from the first edition of this plan: the list of data fixtures is inline in the script (16 exact paths, `scripts/check-no-python.mjs:26-43`), and there is no `scripts/no-python-allowlist.json`; the guard also refuses `.pyw`, `.pyi` and `.pyx` (`:46`). The case “an allowlisted path that no longer exists fails” was not built: a listed path that disappears is no risk, since the guard refuses paths and excuses none that is absent. The guard is called by no workflow and by no `package.json` script: it runs as the last command of every E gate, which is what SJ:644 asks.
- Nothing is left to build in this row.
- Allowed (2, E; delivered change set): E:`scripts/check-no-python.mjs`, E:`tests/check-no-python.test.ts`.
- Gate (historical recheck only): `npx --no-install vitest run tests/check-no-python.test.ts && node scripts/check-no-python.mjs`. No implementation is recommissioned.

#### Row 1b · SJ-0e-2 — The guard reads executable contexts — engram

- Allowed verification: `V-E`.
- Source: this plan, from the validation of 20/11: the list of data fixtures is an exception to a rule the owner stated for repositories and jobs alike (SJ:641), so the guard must also show that nothing executes Python. Model: the h2a guard, which reads executable contexts already (H `scripts/check-no-python.mjs`, header).
- [x] RED: `tests/check-no-python.test.ts > a package.json script, a workflow step or a script with a shebang that invokes python, python3, pip, pipx, uv or poetry fails and names the file and the line`.
- [x] RED: `… > a JavaScript file that spawns one of those commands fails`.
- [x] GUARD: `… > the repository as it is passes, and a Markdown file or a skill text that names Python in prose stays silent`.
- [x] Implement the guard in `scripts/check-no-python.mjs`. It scans npm scripts, shebangs, workflow `run` and `shell` settings in `.yml` and `.yaml` (including workflow and job defaults), and statically resolved process calls in tracked `.mjs`, `.cjs`, `.js` and `.ts` outside `tests/fixtures/` and `worked/`.
- Allowed (3, E): E:`scripts/check-no-python.mjs`, E:`tests/check-no-python.test.ts`, E:`plan/10-BRANCH_MEMORY_SESSION_JOURNAL.md` (Row 1b tracking and evidence, as requested in the review-fix brief).
- Gate: `npx --no-install vitest run tests/check-no-python.test.ts && npm run lint && npm run build && node scripts/check-no-python.mjs`. No row waits for this one; if the repository as it is fails the new rule, the lot stops and the conductor decides, case by case, between a fix in another lot and a recorded exception.
- **SJ-0e-2 evidence.** Base `2ed59880e6b106e131bdf80b4d9a9dc3064a70f1`, branch `chore/memory-sj0e2`. Round 1 RED exited 1 with 32 failures and 23 passes, then the literal V-E gate passed all 55 cases. Round 2 RED (`npx --no-install vitest run --configLoader runner tests/check-no-python.test.ts`, exit 1) reproduced eight misses while the other 55 tests passed. The new cases cover both quote forms of an empty `exec -a` name, direct and aliased option-bound execa tags, simple and nested `const` template substitutions, shorthand `shell`, and the `execFile` callback overload. The guard stayed silent on a cyclic template binding in an uncalled function. Standalone `npm run lint` and `node scripts/check-no-python.mjs` passed in the worktree. In a disposable mirror, the package's `npm run build` generated `dist/mcp-memory.d.ts` after lint reported that it was missing. The literal V-E gate then exited 0 with all 63 tests passing, both Studio bundles built, the publisher receipt regenerated, and zero unexcused guard findings. After the npm wrapper exited 1, the built CLI's graph hook exited 0 in a separate disposable mirror and wrote the graph and report with nine fixture extraction failures and eight validation warnings. The gate mirror reached 918 MiB at completion. Both filesystems had at least 76 GiB free (5 GiB required). The guard's exports match the base and its top-level definitions are unique. The scanner uses `ts.createSourceFile` with file-local bindings and adds 420 nonblank, non-comment lines from the base (412 net). R1-3 still requires a conductor disposition of the 150-line limit before acceptance.

#### Row 2 · Lot 0.1-D — The shared declarations of S0 — engram

- Allowed verification: `V-E`.
- Source: `S0:143-174`, the declarations that Lot 0.1 and every later lot share; `S1:180-185`, which imports them. Disposition PD-25. No row of SJ §8 changes this lot.
- [x] RED: `tests/metamodel-contracts.test.ts > the module exports exactly the six shared declarations of S0, under their names` (`Sha256Digest`, `MetamodelVersion`, `LineageId`, `OntologyTemplateEnvelopeRef`, `CrossLineageCompositionPin`, `H2AMandateEnvelope`). The test reads the source: a module of declarations has no runtime value to call.
- [x] GUARD: `… > src/metamodel-contracts.ts takes type-only imports and no import of a runtime module`.
- [x] Implement: E:`src/metamodel-contracts.ts` holds the shared declarations of `S0:143-174` and nothing else. S0 §6 names no file for them (`source-gap`); S1 imports them from that path, and rows 3 and 4 need them. The file is not a public subpath: it adds no entry to `package.json` or to `tsup.config.ts`, so no packed-surface guard is listed.
- Allowed (2, E): E:`src/metamodel-contracts.ts` (new), E:`tests/metamodel-contracts.test.ts` (new).
- Gate: `npx --no-install vitest run tests/metamodel-contracts.test.ts && npm run lint && npm run build && node scripts/check-no-python.mjs`.
- **Lot 0.1-D evidence** — Base `2ed59880e6b106e131bdf80b4d9a9dc3064a70f1`. The conductor authorized this Row 2 tracking edit in `plan/10` (checkboxes and evidence). The numbered change set is `src/metamodel-contracts.ts` and `tests/metamodel-contracts.test.ts`, with `V-E` verification. The original RED run failed both cases before the module existed (`ENOENT`, exit 1). For the review, the original tests accepted all 11 scratch mutants. The hardened import guard rejected type-only external imports, nested `import()` types, import-equals declarations, module re-exports, and dynamic imports. The declaration test rejected the default export, erased bodies, and individual changes to inheritance, a literal union, optionality, and nested `readonly` (each mutant run exited 1). Both tests passed against the six declarations from `S0:143-174`. `npm run lint` needed local `dist` declarations. `npm run prebuild` and `npm run build:server` generated them in a disposable checkout with the existing lockfile-matched dependencies. The literal row gate passed there, including lint, both Studio outputs, and the zero-Python check. The build changed only the publisher receipt's `sourceHead` among tracked generated files. The sampled gate scratch peak was 888 MiB including copied dependencies, with 77.15 GiB free at both measured paths before the gate (class A floor 5 GiB).

#### Row 2b · Lot 0.1-H — Canonical digest of the profile format — engram

- Allowed verification: `V-E` and `V-E-L0` for the local package build needed by lint.
- Source: `S0:875-882`. It is Lot 0.1 without the declarations file, which row 2 delivers; it is off the first-proof chain. Rows 36, 61 and 69 wait for it.
- [x] RED: `tests/ontology-profile-format-amendment.test.ts > a metamodel v1 profile hashes to a Sha256Digest over RFC 8785 bytes with no injected default, and a cardinality change moves the hash` (`S0:877`; invalid bounds fail with `MM_REL_INVALID_CARDINALITY`).
- [x] RED: `… > a visual_encoding change leaves profile_hash byte-identical and moves presentation_hash` (`S0:878`; compatibility reports `changed_node_visual_encoding`).
- [x] RED: `… > a narrowed relation cardinality is breaking and a widened one is not` (`S0:879`).
- [x] GUARD: `… > app-context@1 still verifies its pinned content digest` (`S0:880`).
- [x] Implement: the target modules of `S0:881`. They import `Sha256Digest` from E:`src/metamodel-contracts.ts` (row 2) and declare none of the shared types again.
- Allowed (8, E): E:`src/types.ts`, E:`src/ontology-profile.ts`, E:`src/profile-bundle.ts`, E:`src/profile-validate.ts`, E:`src/ontology-guardian/digests.ts`, E:`tests/ontology-profile-format-amendment.test.ts` (new), E:`tests/g0-mutant-proof.mjs`, E:`plan/10-BRANCH_MEMORY_SESSION_JOURNAL.md`.
- Review scope amendment: the conductor’s Lot 0.1-H review-fix instruction adds the G0 compiler scratch setup (finding 1) and this plan’s Row 2b tracking and evidence (finding 5).
- Gate: `npx --no-install vitest run tests/ontology-profile-format-amendment.test.ts && npm run lint && npm run build && npm run test:g0 && node scripts/check-no-python.mjs` (`S0:882`).
- **Lot 0.1-H evidence** — Base `9cc11162e33d212fad7161da437e8e5fa206b9be`. With `--configLoader runner`, the original RED replay failed 22 of 23 cases on the base and the `app-context@1` pin guard passed. The two added root cardinality cases also failed on the base. Reverting the reviewed behavior in scratch produced 10 failures and 3 passing controls. The old G0 scratch copy reproduced eight `TS2307` diagnostics. Initial lint reported missing `dist/mcp-memory.d.ts`. In a disposable clone with lockfile-matched dependencies, `npm run prebuild` and `npm run build:server` supplied the local declarations. The literal gate exited 0 with 37 focused tests, lint, both Studio outputs, 527 G0 tests, 164 of 164 runtime mutants killed, 15 of 15 type mutants killed, and zero unexcused Python findings. The focused test passed a separate TypeScript check, and the related regression suites passed 624 tests with one skip. Signature and declaration checks confirmed seven unchanged profile function signatures and a single definition for each shared type. The build regenerated only the publisher receipt’s `sourceHead` among tracked outputs in the clone. The graph hook rebuilt in the clone and reported nine fixture extraction failures and eight validation warnings. Class A reported 66 GiB free at resume and 62 GiB before the final gate at both checked paths. Peak sampled scratch use was 1,049 MiB including copied dependencies. **Round 2.** Before the fixes, `npx --no-install vitest run --configLoader runner tests/ontology-profile-format-amendment.test.ts` exited 1 with 4 failures and 37 passes. The failing cases were `rejects runtime authored provenance in raw JSON profile text`, `rejects runtime authored provenance in raw YAML profile text`, `reports unverified authored provenance as a profile validation error`, and `seals the same presentation digest when layout hints use runtime metadata names`. Raw profile text now rejects the reserved provenance field, and object validation accepts verified runtime carriers. V1 metadata filtering is scoped to runtime fields so normalized and bundled hashes cover the same authored presentation. The literal row gate and standalone `npm run lint` exited 0 in a disposable checkout after `npm run prebuild` and `npm run build:server` supplied the missing `dist/mcp-memory.d.ts`. The gate passed 41 focused tests, both Studio builds, 527 G0 tests, and the zero-Python guard. It killed all 164 runtime and 15 type mutants. The focused test also passed a TypeScript check. Across it and seven related suites, 113 tests passed with one skip. The build regenerated only the publisher receipt’s `sourceHead` among tracked outputs. The class A check measured 62 GiB free before the gate. The graph hook exited 0 in the disposable checkout, with nine fixture extraction failures and eight extraction validation issues.

#### Row 3 · 6A-E1 — Mandate hook and Track guard in the provider — engram

- Allowed verification: `V-E`.
- Source: `S6A:737`. Delta `S6A-g` (SJ:580): test 2 names search and get only.
- [x] RED: `tests/mcp-memory/mandate-and-track-guard.test.ts > a mutating tool call without a verified mandate fails at authentication with the sanitized unauthorized error and writes nothing` (capture, request_admission, withdraw, forget).
- [x] RED: `… > a session without a memory identity receives no memory content on search and get, and a same-role workspace caller reads locally and is refused across scopes`.
- [x] RED: `… > a write that collides with a Track-controlled record keeps the incumbent bytes and stages a proposed conflict candidate`.
- [x] GUARD: `… > the six-tool v1 manifest digest is unchanged and the package declares no cluster-mesh dependency`. The h2a half of that guard (`packages/track/package.json`) belongs to row 41.
- Allowed (12, E): E:`src/mcp-memory/provider.ts`, E:`src/mcp/memory/contracts.ts`, E:`src/mcp/memory/errors.ts`, E:`tests/mcp-memory/mandate-and-track-guard.test.ts` (new; `.test.ts`, PD-04), the derived registry files E:`registry/entries.v1.json` and E:`registry/publisher-assets.v1.json`, the four harness files E:`tests/mcp-memory-l4-pipeline.test.ts`, E:`tests/mcp-memory-f3-pw4.test.ts`, E:`scripts/mcp-memory-l4-packed-acceptance.mjs` and E:`scripts/mcp-memory-l4-shared-provenance.mjs`, E:`src/mcp-memory/index.ts` (round-three public type re-exports), and E:`plan/10-BRANCH_MEMORY_SESSION_JOURNAL.md` (row tracking).
- The test file imports nothing from `engram-memory/`: this lot does not list the neutrality suite (“Tests that reach L0”).
- Gate: `npx --no-install vitest run tests/mcp-memory/mandate-and-track-guard.test.ts && npm run lint && npm run build && node scripts/check-no-python.mjs`.
- **6A-E1 evidence** — Base `9cc11162e33d212fad7161da437e8e5fa206b9be`, with rows 0b and 2 merged. The conductor’s 21/11 round-two amendment brought the Allowed list from 6 to 10 files, within the 12-file cap. It adds the L4 pipeline and F3 PW4 tests and both packed L4 harnesses so they can inject an access boundary. The round-one fix extended the missing-boundary refusal to every read and write. The original lot RED had 3 failures and one passing manifest guard. Review RED probes reproduced the missing-boundary read bypass, Track checks after the execution claim and on repeated guard calls, incomplete mandate and binding validation, and incorrect write rights, Track coverage and failure mapping. A missing entry in a nonempty signature array also failed on the resumed worktree before correction. The literal row gate passed in a disposable copy with writable Vitest scratch and the existing dependencies (29 tests, lint, both Studio builds and zero Python with 16 allowlisted fixture paths). The worktree's build supplied the required generated profile assets and declarations. Worktree lint passed and both generated registry files matched the gate copy byte for byte. The pinned six-tool `v1` manifest digest passed. The lot test uses local engine fixtures built with the MCP memory entry and reuses the read page-store helper. The supplemental L4 adapter and L2 write suites passed (38 tests). Before the amendment, the L4 pipeline had 3 passes and 21 failures and F3 PW4 had 9 passes and 1 failure because the harnesses omitted the required access boundary. Track is checked before forwarding the claim. An isolated admission RED showed that the canonical engine can still reach the guard before policy would return pending adjudication. A consumer compile failed with TS2459 for all three boundary type imports. The four harnesses now inject fixture access boundaries. Round-two verification passed the L4 pipeline (24/24) and F3 PW4 (10/10) with an isolated npm cache. The row gate passed with Vitest’s runner config loader because the shared dependency directory has read-only Vite scratch. All 29 lot tests, lint, both Studio builds and the zero-Python guard passed. In a disposable checkout with refreshed candidate metadata, packed acceptance passed through the SDK floor of 1.31.0, the cross-entry provenance test passed, and the fenced-store probe captured against the current tarball. The historical r5/r9 comparison lacked its frozen archives. The 80-file memory run via `npm test` passed with 1,239 tests and 19 skips in a memory-backed disposable checkout using prebuilt SQLite dependencies and a separate consumer temp directory. The graph hook rebuilt the changed code in disposable scratch. The full-repository scratch rebuild was stopped after extraction and merge. Sampled scratch use reached 233 MiB, and the worktree and temp filesystems had at least 61 GiB free (class A floor 5 GiB). The round-three instruction authorizes the public barrel for Minor 6 and counts this plan for N4. Both counts are 12, including the four round-two harness files. Before the fixes, an abort during confirmation returned `DIGEST_CONFLICT`, an empty mandate ID authorized a tombstone, and the public type regression and consumer compile failed for all three imports (`TS2459` in the consumer). The recovery regression rejected a disposable mutation that tombstoned the incumbent while returning `DIGEST_CONFLICT` and passed with the production guard. The literal gate passed in a disposable checkout with writable Vite scratch (32 lot tests, lint, both Studio builds and zero Python). The worktree gate used Vitest’s runner config loader after its shared dependency mount returned `EROFS`. Worktree lint passed before and after the build. The compiled consumer probe and L4 pipeline (24/24) passed. The regenerated registry files matched the disposable build byte for byte, and the graph hook rebuilt the three changed code files in private scratch. The disposable gate used 173 MiB at completion. Samples showed at least 56 GiB free on the worktree and temp filesystems.

#### Row 4 · 1-E1 — Session-front contracts and ingest engine — engram

- Allowed verification: `V-E`, `V-E-L0`, `V-E-PACK`.
- Source: `S1:1663`; contract `S1:179-463`. Deltas applied here: `S1-a` (SJ:518), `S1-e` (SJ:522, the comment only), `S1-g` (SJ:524), `S1-j` (SJ:527). `S1-h`, `S1-k` and `S1-n` are built by rows 10, 31 and 30; this lot implements the frozen port as `S1:459-463` writes it.
- [x] RED: `tests/session-front-ingest.test.ts > an unknown key, a derivedWorktreeId that fails isValidWorktreeId, or an idempotencyKey outside 16..256 bytes is refused`.
- [x] RED: `… > recordExtraction that cites an uncommitted or cross-scope event is refused` (`NOT_FOUND`, `UNAUTHORIZED`).
- [x] RED: `… > a write without a memory identity is refused` (`D18`).
- [x] RED: `… > recordSessionEvent commits the six raw event kinds with their citation tuple, a turn text bounded to 64 KiB, the extraction disposition, the ready slices and the null-mandate signal` (the `mcp-opportunistic` delivery path included).
- [x] RED (`S1-a`): `… > hostId is an open string: a ninth host name is recorded, and CliHostId still lists the eight known CLIs`.
- [x] GUARD (`S1-g`): `… > the receipt and the engine carry no session_summary flag or threshold`.
- [x] GUARD: `… > the bounded current projection never includes speech_turn text` (`M10`).
- [x] GUARD: `… > the compiled entry @sentropic/engram/session-front-contracts resolves from the installed tarball with its declarations`.
- [x] Implement: the Spec 1 contract block, with its pure validators, `deriveSessionFrontIdempotencyKey` and `isValidWorktreeId`, in E:`src/session-front-contracts.ts`; the product adapter that implements `EngramSessionIngestFrontPort` in E:`src/session-front/ingest.ts`, exported from the same entry, with its store taken through an injected port, so that the entry keeps no native, database or LLM-SDK import (`S1:176`); the neutral engine in E:`engram-memory/session-front-engine.ts`. No file is created under `engram-memory/contracts/` (PD-02): the neutral shapes of L0 have their own names and carry no `h2a` or `@sentropic/` string.
- Allowed (12, E): E:`package.json`, E:`tsup.config.ts`, E:`src/session-front-contracts.ts` (new), E:`src/session-front/ingest.ts` (new), E:`engram-memory/session-front-engine.ts` (new), E:`engram-memory/tsconfig.json`, E:`engram-memory/validation.ts`, E:`engram-memory/index.ts`, E:`tests/session-front-ingest.test.ts` (new), E:`tests/memory-neutrality.test.ts`, E:`scripts/substrate-tarball-acceptance.mjs`, E:`scripts/fixtures/packed-surface/check-esm.mjs`.
- Gate: `npm --prefix engram-memory run build && npx --no-install vitest run tests/session-front-ingest.test.ts tests/memory-neutrality.test.ts && npm run lint && npm run build && npm run test:substrate-tarball && GRAPHIFY_PACKED_SKIP_BUILD=1 ./scripts/check-packed-surface.sh && node scripts/check-no-python.mjs`.
- The list is at the limit, and it holds neither derived registry file: the lot adds an entry and an L0 engine that the memory MCP entry does not import. If its build nevertheless changes an asset digest in `registry/entries.v1.json`, the lot stops and the conductor splits it before any further code: the contract and its packed surface first, the L0 engine and the adapter second.
- **1-E1 evidence** — Base `d4b8c81a` (`origin/main`). Conductor scope amendment (fix run): `scripts/substrate-tarball-acceptance.mjs` kept read-only — it auto-walks every `package.json#exports` entry, so the new subpath is covered with no edit and the script still runs in the gate; this plan file takes its slot, branch stays at 12 files. Touched: `package.json`, `tsup.config.ts`, `src/session-front-contracts.ts`, `src/session-front/ingest.ts` (new), `engram-memory/session-front-engine.ts` (new), `engram-memory/tsconfig.json`, `engram-memory/validation.ts`, `engram-memory/index.ts`, `tests/session-front-ingest.test.ts`, `tests/memory-neutrality.test.ts`, `scripts/fixtures/packed-surface/check-esm.mjs` (+ this plan file). Zero Python; frozen port signatures unchanged; one definition per symbol. RED observed: pre-fix suite failed at module load (`Cannot find module './session-front/ingest.js'`, 0 tests) and `memory-neutrality` failed 1 case; after wiring, 7 new per-finding REDs failed (F3 NFD/duplicate-key, F4 JCS derivation, F5 ungrounded candidates, F7 secret-path/mandate, F8 L0 import path, F9 pseudonym/host bounds, N2 citations). Post-fix: `tests/session-front-ingest.test.ts` 25/25 and `tests/memory-neutrality.test.ts` 13/13 (38/38), `npm run lint` clean after `npm run build` supplied the missing root `dist/mcp-memory.d.ts` (built with the package's own script), `dist/session-front-contracts.{js,cjs,d.ts}` emitted with zero `$1` duplicates, packed-surface lane passes (new entry runtime + declarations), zero-Python guard passes. `npm run test:substrate-tarball` passes after warming the harness npm cache (replicated the lane's consumer setup in scratch and ran online `npm ci`, 171 packages; lock/fixtures untouched): `tarball-acceptance OK @sentropic/engram@0.28.0`, new `./session-front-contracts` closure with no fatal findings. Required split note: `npm run build` regenerates `registry/entries.v1.json` + `publisher-assets.v1.json` with a changed `dist/mcp-memory.js` digest (tsup chunk reshuffle from the new entry); both restored to HEAD bytes — conductor to split on merge per the Row 4 rule. Disk: 51 GiB free on `/` and `/tmp` (class B floor 10 GiB). Conductor scope amendment (CI fix, run 44978275918): `tests/shared-provenance-chunk.test.ts` joins row 4's Allowed list, only to add the new `./session-front-contracts` subpath to the expected exports map (keys comparison plus explicit target pin, in the file's sorted order); `candidate-manifest.json` stays frozen at the 0.28.0 pre-candidate so the test expects manifest keys plus the one known delta.

#### Row 5 · SJ-1a — Query, first view, diff — engram

- Allowed verification: `V-E`, `V-E-L0`.
- Source: SJ:655; SJ §2.5, §3.2–§3.4; block A of SJ §12.
- [x] RED t1: `tests/session-context-engine.test.ts > t1: the first noted event of a key creates version 1, the first request gives version 2, a digest is stable and a version never changes`.
- [x] RED t2: `… > t2: nothing changed outside the session: no item, byteLength 0, mode diff`.
- [x] RED t3: `… > t3: a decision added from outside is delivered once with its watermark, and the next request holding that watermark gets 0 bytes`.
- [x] RED t4: `… > t4: reset gives mode full with the request word for word and every decision in scope`.
- [x] RED t5: `… > t5: held and reset together, or neither, is INVALID_SCHEMA`.
- [x] RED t6: `… > t6: an unreadable watermark is answered from engram's own record, and a session never seen gets the full view`.
- [x] Implement: the types of block A named in the one-definition table; the engine: versions keyed by `(tenantId, workspaceId, derivedWorktreeId, roleRef)`, evaluation at a cursor, `delivered = view − held`. Query versions are stored through the L0 engine as neutral records.
- Allowed (6, E): E:`src/session-front-contracts.ts`, E:`src/session-context/engine.ts` (new), E:`engram-memory/session-front-engine.ts`, E:`tests/session-context-engine.test.ts` (new), E:`tests/memory-neutrality.test.ts`, E:`plan/10-BRANCH_MEMORY_SESSION_JOURNAL.md` (row tracking: scope amendment of round 1, same form as rows 1b, 2b and 3).
- Gate: `npm --prefix engram-memory run build && npx --no-install vitest run tests/session-context-engine.test.ts tests/memory-neutrality.test.ts && npm run lint && npm run build && node scripts/check-no-python.mjs`.
- **SJ-1a evidence** — Base `f6760e56` (HEAD, row 4 1-E1 merged; `origin/main` `70f14279` one ahead with unrelated scraper). Allowed list as above (6 files with the round-1 plan-tracking amendment; `registry/publisher-assets.v1.json` sourceHead-only regeneration restored to HEAD bytes, no numbered change). Zero Python; frozen port signatures unchanged; one definition per symbol. RED observed: new suite missing (`Cannot find module '../src/session-context/engine.js'`, 0 tests); after wiring, 3 failures before fix (t1 `commits.length` 0 from missing `queueExtraction`, t3 0 items with cursor stuck at `0`, t4 text-containment on ref-only delivery). Post-fix: `tests/session-context-engine.test.ts` 6/6 and `tests/memory-neutrality.test.ts` 13/13 (19/19 with `--configLoader runner`), `npm run lint` clean (after `npm run build` supplied `dist/mcp-memory.d.ts`), `npm run build` passes, `node scripts/check-no-python.mjs` passes (`ZERO PYTHON OK`). Disk: 55 GiB free on `/` and `/tmp` (class A floor 5 GiB). Round-1 review fixes: 10 strengthened tests fail first (t1, t5-t10), then pass (10/10 engine, 13/13 neutrality, 23/23 with `--configLoader runner`); supplemental `session-front-ingest` + `shared-provenance-chunk` + `release-config` 40/40; `npm run lint` clean; `engram-memory` build + typecheck clean with no tracked churn; zero-Python guard passes. Non-test lot code after round 1 was 144 non-blank non-comment lines (engine 126, contracts block 9, L0 helpers 9). Round-2 review fixes (design note + rulings, tests first): every assertion in `tests/session-context-engine.test.ts` checks an independently computed expected value with a one-line mutant-killing comment (`t1` verifies `v1.digest`, `v2.digest` and committed `neutralDigest` via `canonicalizeJcs` + `node:crypto` SHA-256 per SJ:745; `t3` and `t6` kill deletions of `viewAt(held.queryVersion, held.cursor)` and `readable()`; `t11` rejects array request, non-object `held` and nested `null` fields as `INVALID_SCHEMA`; `t12` serialises concurrent `note*` on the same key via a per-key promise chain). Round-2 RED observed before engine edits: 2 failed (`t11`, `t12`) / 10 passed (12 total). Post-fix mutation proof (local deletion + byte-identical restore): deleting `readable()` failed `t6` and `t9` (2 failed / 10 passed); deleting `viewAt(held.queryVersion, held.cursor)` (replaced with `seen`, `head.version`, or latest `cursor`) failed `t3` (1 failed / 11 passed); restored clean (12/12). Final gates: `npx --no-install vitest run --configLoader runner tests/session-context-engine.test.ts tests/memory-neutrality.test.ts` 25/25 (12/12 engine, 13/13 neutrality), `npm run lint` (`tsc --noEmit`) clean, root `npm run build` passes (including `prebuild` `engram-memory` build, fresh `dist/session-front-contracts.d.ts` and `engram-memory/dist/session-front-engine.d.ts`, `gen-mcp-memory-assets.mjs` with `registry/publisher-assets.v1.json` sourceHead-only diff restored to HEAD bytes, and `build:studio`), `node scripts/check-no-python.mjs` passes (`ZERO PYTHON OK`, 0 unexcused, 16 allowlisted fixture paths). Non-test lot code is 149 non-blank non-comment lines / 158 raw lines (`src/session-context/engine.ts` 131/131, `src/session-front-contracts.ts` +9/+13, `engram-memory/session-front-engine.ts` +9/+14), under the 150-line cap. Disk: 57 GiB free on `/` and `/tmp` (class A floor 5 GiB). Round-3 review minor fixes (tests first): Minor 1 validates plain-object `held` fields (`typeof held.queryId === "string" && typeof held.queryVersion === "number" && typeof held.cursor === "string"`) in `requestContext` before `enqueue`/`ensureQuery`, rejecting malformed plain-object `held` as `INVALID_SCHEMA` (`t13`); Minor 2 guards both shared `cursor` assignments in `persistQuery` and `noteDecision` monotonically with `BigInt(receipt.value.cursor) > BigInt(cursor)` (`t14`, two concurrent distinct keys resolving out of order across `"9"`/`"10"` and `"99"`/`"100"`); R2 new finding 5 updates Commissioning Order row 5 `Files` cell (`plan/10:52`) from `5` to `6` matching `:492`. Round-3 RED observed before engine edits: `2 failed` (`t13`, `t14`) / `12 passed` (`14` total). Empirical mutant-killing verification (local single-clause mutations + exact restore): dropping `queryId`, `queryVersion`, or `cursor` `typeof` checks in `requestContext` each failed `t13`; dropping the monotonic guard or using string comparison in `persistQuery` or `noteDecision` each failed `t14`. Final gates: `npx --no-install vitest run --configLoader runner tests/session-context-engine.test.ts tests/memory-neutrality.test.ts` `27/27` (`14/14` engine, `13/13` neutrality), `npm run lint` clean, `npm run build` passes (`registry/publisher-assets.v1.json` `sourceHead`-only diff restored to HEAD bytes), `node scripts/check-no-python.mjs` passes (`ZERO PYTHON OK`, 0 unexcused, 16 allowlisted fixture paths). Non-test lot code remains `149` non-blank non-comment lines / `158` raw lines (`src/session-context/engine.ts` `131`/`131`, `src/session-front-contracts.ts` `+9`/`+13`, `engram-memory/session-front-engine.ts` `+9`/`+14`), under the 150-line cap. Disk: `58 GiB` free on `/` and `/tmp` (class A floor 5 GiB).

#### Row 6 · SJ-1b — End-to-end proof on Claude Code, by replay — engram

- Allowed verification: `V-E`, `V-E-L0`.
- Source: SJ:656; SJ:649. Deltas `S1-b` (SJ:519) and `S1-c` (SJ:520). Fixture F-CC.
- [ ] RED t1: `tests/session-context-replay.test.ts > t1: every prompt, assistant turn and tool result of the recording is in the journal, and the five journal fields round-trip` (`promptCitation`, `reasoningCitations`, `authorModelRef`, `callCitation`, `durationMs`).
- [ ] RED t2: `… > t2: at a prompt where nothing changed outside, 0 bytes would be injected`.
- [ ] RED t3: `… > t3: at the compaction boundary reset compaction gives the full view, with the same sessionPseudoId`.
- [ ] RED t4: `… > t4: the run makes no model call`.
- [ ] GUARD (added): `… > planCitation, the fourth member of SpeechTurnJournalFieldsV1, round-trips too`. SJ:810 gives its producer to `SJ-12` t4 (row 74), an h2a lot that cannot edit engram: the member is declared, validated and stored here, with the type that holds it, so that all six optional journal fields of `S1-b` and `S1-c` are in R-E1.
- [ ] GUARD: `… > the fixture bytes match the digest of their manifest`.
- [ ] GUARD (F-CC, rule 3): `… > the fixture passes the scan of scripts/session-fixture-scan.mjs, and stays under its size bound`.
- [ ] Implement: a test helper that maps the recorded bytes to Spec 1 envelopes; the two optional field groups of `S1-b` and `S1-c`; the fixture scan; the report command, which prints, per step, what was noted, what would be injected and its size in bytes.
- Allowed (10, E): E:`tests/session-context-replay.test.ts` (new), E:`tests/helpers/claude-code-replay.ts` (new), E:`tests/fixtures/session-replay/claude-code-retry.jsonl` (new, the bytes of F-CC), E:`tests/fixtures/session-replay/claude-code-retry.manifest.json` (new), E:`scripts/session-context-replay-report.mjs` (new), E:`scripts/session-fixture-scan.mjs` (new), E:`src/session-front-contracts.ts`, E:`src/session-front/ingest.ts`, E:`engram-memory/session-front-engine.ts`, E:`tests/memory-neutrality.test.ts`.
- Forbidden: an edit of the recorded bytes; a model call; a network call.
- Gate: `npm --prefix engram-memory run build && npx --no-install vitest run tests/session-context-replay.test.ts tests/memory-neutrality.test.ts && npm run lint && npm run build && node scripts/check-no-python.mjs`.

#### Row 6b · P-REPLAY — The replay record — engram, docs

- Allowed verification: `V-DOC`.
- Source: SJ:649; SJ §9.1. The record of the first proof is a lot, so that it is written inside a branch and a scope.
- [ ] Run (conductor): after the merge of row 6, `node scripts/session-context-replay-report.mjs tests/fixtures/session-replay/claude-code-retry.jsonl` on the built tree.
- [ ] Record (Ember), in E:`docs/evidence/session-journal-replay.md`: the head the run used, the fixture digest and the Claude Code version, the per-step table of the report, the count of model calls, which is zero, and the state of the three checks of SJ §9.1 at the compaction boundary, each under its own word. Check 1, no request or decision missing: proven on the recording. Check 2, no view over the ceiling: measured against the default `viewMaxTokens` and not enforced, since the ceiling is built by row 8. Check 3, each item written by a model cites a raw event: not exercised, since the run makes no model call.
- [ ] GUARD (manual documentary check): the figures of the record are those the command printed; no figure is rounded or restated.
- Allowed (1, E): E:`docs/evidence/session-journal-replay.md` (new).
- Gate: `node scripts/session-context-replay-report.mjs tests/fixtures/session-replay/claude-code-retry.jsonl && git diff --check && git diff --name-only origin/main && node scripts/check-no-python.mjs`; compare the printed table, fixture digest and counts with the single evidence file, recording the documentary GUARD. This proves noting and returning the diff; history search is row 34.

### Step 2 — Journal core and first checkpoint (engram)

#### Row 7 · E-REL-J — Checkpoint release path of `@sentropic/engram` — engram

- Allowed verification: `V-E`.
- Source: this plan, PD-11 and PD-16. The name differs from `E-REL`, which is row 13 of plan/09, the release procedure of the neutral package (`plan/09:59`). The publish job runs a bare `npm publish` (E `.github/workflows/typescript-ci.yml:276-277`), which gives a published version the `latest` dist-tag.
- [ ] RED: `tests/release-dist-tag.test.ts > a package whose publishConfig.tag is sj maps to the dist-tag sj and never to latest`.
- [ ] RED: `… > a package with no publishConfig.tag maps to latest`.
- [ ] RED: `… > a version that carries a prerelease identifier is refused, whatever its dist-tag`: sentropic admits no such version of a peer (S `packages/cluster-mesh/src/modules/semver.ts:5`).
- [ ] RED: `… > the publish step of the workflow passes the computed dist-tag`.
- [ ] Implement: `scripts/release-dist-tag.mjs` reads `package.json` and prints the dist-tag, `publishConfig.tag` or `latest`; the publish step calls it and passes `--tag`. The source of the dist-tag is a committed field of the release commit, read by a reviewer, never the shape of the version.
- Allowed (3, E): E:`.github/workflows/typescript-ci.yml`, E:`scripts/release-dist-tag.mjs` (new), E:`tests/release-dist-tag.test.ts` (new).
- Forbidden: any change to the release guard, to the permissions or to a credential of the workflow; a publication inside the lot.
- Gate: `npx --no-install vitest run tests/release-dist-tag.test.ts && npm run lint && npm run build && npm pack --dry-run && node scripts/check-no-python.mjs`.

#### Row 8 · SJ-1c — The whole view — engram

- Allowed verification: `V-E`.
- Source: SJ:657; SJ §2.7.
- [x] RED t1–t6: `tests/session-context-view.test.ts > t1: the six tiers come in order and give way in that order`; `> t2: no view exceeds viewMaxTokens, and step 500 is under the ceiling of step 1`; `> t3: decisions that do not fit are counted in the pointer line`; `> t4: a pinned request over the ceiling is delivered whole, with overflow`; `> t5: a replaced decision the session holds comes as one withdrawn item`; `> t6: each item has its ref, digest, slice, disclosure, authoredBy and sources`.
- [x] Implement: the view as a pure evaluation; a token is 3 bytes when the host gives no count (SJ:894). Tier 4 takes its items from a provider that row 66 supplies; until then it is empty.
- Allowed (4, E): E:`src/session-context/view.ts` (new), E:`src/session-context/engine.ts`, E:`tests/session-context-view.test.ts` (new), E:`plan/10-BRANCH_MEMORY_SESSION_JOURNAL.md` (row tracking: scope amendment of round 1, same form as rows 1b, 2b, 3 and 5).
- Gate: `npx --no-install vitest run tests/session-context-view.test.ts && npm run lint && npm run build && node scripts/check-no-python.mjs`.
- **SJ-1c evidence** — Base `8f1f514d740faa665d9fb39783acd0917c232d6d` (ancestor of `origin/main`, #487; parent row 5 `SJ-1a` merged as #486 `70cfe1f3707f3ba71927bff070f4d0ab2df3cea2`). Allowed change set (4 files, with round-1 plan-tracking scope amendment): `src/session-context/view.ts` (new), `src/session-context/engine.ts`, `tests/session-context-view.test.ts` (new), `plan/10-BRANCH_MEMORY_SESSION_JOURNAL.md` (`V-E` verification). Zero Python; frozen signatures unchanged; one definition per symbol (`SessionContextQueryV1`, `SessionContextItemRefV1`, `SessionTrackScopeRefV1`, `Sha256Digest`, `Cursor`, `RawSessionEventReceipt` imported from `src/session-front-contracts.ts`); `tests/session-context-view.test.ts` imports nothing from `engram-memory/`. Initial RED observed before implementation: `npx --no-install vitest run --configLoader runner tests/session-context-view.test.ts` exited `1` (`Cannot find module '../src/session-context/view.js'`, 0 tests). Initial post-implementation empirical mutation proof: `13/13` killed. **Round-1 review fixes (tests first):** Finding 1 (MAJOR) filters Tier-3 `trackItems` (before `seenTrack`) and Tier-4 `rulesProvider` output with `.filter(active)` (`t8` + `t9`); Finding 2 (MAJOR) unifies view and diff tier packing via `packView` + `tierByRef`, enforcing ceiling trimming and `overflow: "pinned_request_over_ceiling"` strictly from `added` Tier-1 (never globally from `nowView.overflow`), protecting newly added Tier-1 pinned requests, and emitting `pointer:decisions:N` whenever Tier-2 decisions in `added` must be shed under `viewMaxTokens` (`t10`); Finding 3 (MINOR) records the Row 8 scope amendment (`Files: 4`, `Allowed (4, E)`) and refreshes lint evidence; Finding 4 (MINOR) asserts independent replacement/original digests (`sha256Text(...)`) in `t5`. Round-1 RED observed before `view.ts` edits: `3 failed` (`t8`, `t9`, `t10`) / `7 passed` (`10` total). Round-1 empirical mutation proof (8 single-clause local mutations in `view.ts`, each restored byte-identically): `8/8` killed (`M1` drop `trackItems` filter -> `t8`, `t9`; `M2` `seenTrack` before filter -> `t8`; `M3` drop `rulesProvider` filter -> `t8`, `t9`; `M4` drop `tierByRef` -> `t10`; `M5` propagate `nowView.overflow` -> `t10`; `M6` skip diff trim on `nowView.overflow` -> `t10`; `M7` drop `decisionPtr` in diff trim -> `t1`–`t3`, `t10`; `M8` drop Tier-1 overflow branch -> `t2`, `t4`, `t7`, `t8`, `t10`); `170/170` `expect(...)` calls carry `// Kills a mutant ...` comments. **Round-2 review fixes:** Finding 1 (MINOR) updates `Base` and #486 SHAs to post-reset `origin/main` ancestors (`8f1f514d740faa665d9fb39783acd0917c232d6d` / `70cfe1f3707f3ba71927bff070f4d0ab2df3cea2`); Finding 2 (MINOR) re-runs `npm run build` in the worktree after final edits (restoring the `executableProvenance`-only change in `registry/publisher-assets.v1.json`) and records the post-edit build. Final gates (with current symlink `node_modules -> /home/antoinefa/src/graphify-wt-scrap-mesh/node_modules`, `@sentropic/llm-mesh@0.38.6`): `npx --no-install vitest run --configLoader runner tests/session-context-view.test.ts` `10/10` passed (exit `0`); supplemental regression suites `tests/session-context-engine.test.ts` (`14/14`) + `tests/memory-neutrality.test.ts` (`13/13`) + `tests/session-front-ingest.test.ts` (`30/30`) `57/57` passed (`67/67` total, exit `0`); `npm run lint` (`tsc --noEmit`) exited `0` (clean); post-edit `npm run build` exited `0` in the worktree (`MCP-L4-ASSETS-OK entryDigest=6e96ac84149baf3c2f4eea80f0b3dbcfaecb3076c910754cea4d8daf2040c1a6`, Studio single-file bundle built, zero diff on `registry/entries.v1.json` and `src/workspace/tokens-st-css.generated.ts`, `executableProvenance`-only churn in `registry/publisher-assets.v1.json` restored to `HEAD` via `git show HEAD:registry/publisher-assets.v1.json`); `node scripts/check-no-python.mjs` exited `0` (`ZERO PYTHON OK`, 0 unexcused, 16 allowlisted fixture paths). Non-test lot code: `148` non-blank non-comment added lines / `149` raw added lines (`132` net code / `133` net raw: `src/session-context/view.ts` `96`/`96`, `src/session-context/engine.ts` `+52`/`+53` added, `+36`/`+37` net), within the 150-line SJ cap. Disk peak: generated build outputs `69 MiB` (`dist/` `63 MiB`, `engram-memory/dist/` `988 KiB`, `studio/dist/` `4.8 MiB`); `>= 56 GiB` free on `/` and `/tmp` before and after the gate (class A floor `5 GiB`).

#### Row 9 · SJ-6a — The gate, a pure function — engram

- Allowed verification: `V-E`.
- Source: SJ:666; SJ §2.3.
- [ ] RED t1–t6: `tests/session-context-gate.test.ts > t1: keep adds a selector and gives the next version, and the same keep again is no_change`; `> t2: drop removes a selector by its selectorId, the shadow's included`; `> t3: nothing unpins a request, widens a right or changes the Track scope or the ontologies, and a selector outside the rights is refused outside_rights`; `> t4: beyond maxSelectors the oldest shadow selector goes, and the shadow never evicts an agent selector`; `> t5: a late basedOnVersion runs against the current version`; `> t6: selectorId is scs_ and the digest of the stored match`.
- Allowed (3, E): E:`src/session-front-contracts.ts`, E:`src/session-context/gate.ts` (new), E:`tests/session-context-gate.test.ts` (new).
- Gate: `npx --no-install vitest run tests/session-context-gate.test.ts && npm run lint && npm run build && node scripts/check-no-python.mjs`.

#### Row 10 · SJ-2a — The request and the delivery on the Spec 1 call — engram

- Allowed verification: `V-E`, `V-E-L0`.
- Source: SJ:658. Deltas `S1-d` (SJ:521, `contextRequest`), `S1-e` (SJ:522), `S1-h` (SJ:525).
- [ ] RED t1–t4: `tests/session-context-ingest.test.ts > t1: journalEnabled false answers CAPABILITY_UNAVAILABLE and records nothing`; `> t2: no contextRequest: recorded, no delivery`; `> t3: with contextRequest the payloads hold only the difference, the receipt names watermark and queryDigest, and a call with no host fact renders for an external reader that is not authorized`; `> t4: the request and the answered watermark are stored with the event, and the delivery is recomputed from them`.
- [ ] GUARD t5: `… > t5: no turn text enters .graphify/graph.json`.
- Allowed (6, E): E:`src/session-front-contracts.ts`, E:`src/session-front/ingest.ts`, E:`src/session-context/engine.ts`, E:`engram-memory/session-front-engine.ts`, E:`tests/session-context-ingest.test.ts` (new), E:`tests/memory-neutrality.test.ts`.
- Gate: `npm --prefix engram-memory run build && npx --no-install vitest run tests/session-context-ingest.test.ts tests/memory-neutrality.test.ts && npm run lint && npm run build && node scripts/check-no-python.mjs`.

#### Row 11 · 1-E2-1a — LLM SDK isolation — engram

- Allowed verification: `V-E`.
- Source: `S1:1664`, first part (PD-05).
- [ ] RED: `tests/session-front-privacy.test.ts > any import of src/llm-execution.ts from src/llm-mesh.ts fails` (`F-12`).
- [ ] Implement, the port: the JSON port leaves the SDK module. Three facts fix the files. `src/llm-mesh.ts` is a barrel of 12 lines that re-exports the bridge and one function of `src/llm-execution.ts` (`:1-12`). The only import of the mesh package is in `src/llm-mesh-bridge.ts` (`:11-30`), which also takes the JSON port types from `./llm-execution.js` (`:32-36`). Those types are declared in `src/llm-execution.ts` and re-exported by the root entry (`src/index.ts:199-208`, `:264-282`). So E:`src/llm-json-port.ts` declares the JSON port once (`TextJsonGenerationClient`, its input and result, `parseJsonFromLlmText`, `textClientToCallLlm`); `src/llm-execution.ts` imports and re-exports them, so that `src/index.ts` does not change; `src/llm-mesh.ts` and `src/llm-mesh-bridge.ts` import them from the new file, and the bridge keeps the receiving dependency version until row 11c. Row 37 moves `src/extraction-batch.ts` to the same file.
- Allowed (5, E): E:`src/llm-json-port.ts` (new), E:`src/llm-mesh.ts`, E:`src/llm-mesh-bridge.ts`, E:`src/llm-execution.ts`, E:`tests/session-front-privacy.test.ts` (new).
- The dependency stays at its receiving version in this row; the bridge's dependency-version adaptation belongs to row 11c. The JSON-port symbols are moved, never copied: existing public re-exports retain their identity.
- Gate: `npx --no-install vitest run tests/session-front-privacy.test.ts && npm run lint && npm run build && node scripts/check-no-python.mjs`.

#### Row 11c · 1-E2-1b — Optional mesh peer, smoke lane and locked consumer — engram

- Allowed verification: `V-E`, `V-E-PACK`.
- Source: `S1:1664`, dependency half; Carbon round-2 N1. Depends on row 11. This split is unconditional.
- [ ] RED: `tests/session-front-privacy.test.ts > the mesh is an optional peer admitting 0.39.x and remains an exact development dependency; the installed consumer with no mesh refuses the mesh entry by name`.
- [ ] GUARD: the clean consumer with the mesh peer resolves the entry, and offline tarball acceptance has exactly the committed non-optional dependency closure. `verifyLockedClosure` refuses a required lock entry absent from the installation (E `scripts/substrate-installed-acceptance.mjs:13-23`); the acceptance runner reads the fixture lock at E `scripts/substrate-tarball-acceptance.mjs:706-713` and never refreshes it.
- [ ] Implement: move `@sentropic/llm-mesh` from `dependencies` to optional `peerDependencies` at `>=0.38.0 <0.40.0`, retain an exact published `0.38.x` in `devDependencies`, and adapt the existing bridge to that version without redefining the JSON port. Update both clean-consumer install sites, the workflow and the local packed-surface script. Regenerate the substrate-consumer lock offline from the packed candidate and root-lock pins, following E `scripts/fixtures/substrate-consumer/README.md:10-15`; document the new closure there. Do not weaken `verifyLockedClosure` or turn a required entry optional by hand.
- Allowed (12, E): E:`package.json`, E:`package-lock.json`, E:`src/llm-mesh-bridge.ts`, E:`.github/workflows/typescript-ci.yml`, E:`scripts/check-packed-surface.sh`, E:`scripts/fixtures/packed-surface/check-esm.mjs`, E:`scripts/substrate-tarball-acceptance.mjs`, E:`scripts/fixtures/substrate-consumer/package-lock.json`, E:`scripts/fixtures/substrate-consumer/README.md`, E:`tests/session-front-privacy.test.ts`, E:`registry/entries.v1.json`, E:`registry/publisher-assets.v1.json`.
- Gate: `npm run build && npx --no-install vitest run tests/session-front-privacy.test.ts && npm run lint && npm run test:substrate-tarball && GRAPHIFY_PACKED_SKIP_BUILD=1 ./scripts/check-packed-surface.sh && node scripts/check-no-python.mjs`. Both the peer-present smoke and the peer-absent refusal execute; the ordinary smoke alone cannot prove the latter. The listed test owns that refusal case.

#### Row 11b · PIN-P1 — The platform pins of engram on R-P1 — engram

- Allowed verification: `V-E`, `V-E-PACK`.
- Source: this plan, from the validation of 20/11. engram pins `@sentropic/mcp-platform` exactly, `0.4.0`, as a peer and as a development dependency (E `package.json:186`, `:257`); S `main` is at `0.4.2` and R-P1 is above it. R-E1 must name the platform that S builds, so the move precedes R-E1 instead of riding in row 30.
- [ ] GUARD: `tests/platform-pin.test.ts > the peer pin and the development pin of the platform both hold the version of R-P1, and the lock resolves it with the integrity that the sentropic conductor recorded`.
- [ ] GUARD: the listed installed-closure and packed-smoke suites pass with no runtime source change. Any runtime adaptation is a separate lot.
- [ ] Implement: the two platform literals, root lock, derived registry pair and the offline consumer fixture/README when its closure changes. No runtime source change.
- Allowed (9, E): E:`package.json`, E:`package-lock.json`, E:`tests/platform-pin.test.ts` (new), E:`registry/entries.v1.json`, E:`registry/publisher-assets.v1.json`, E:`scripts/substrate-tarball-acceptance.mjs`, E:`scripts/fixtures/packed-surface/check-esm.mjs`, E:`scripts/fixtures/substrate-consumer/package-lock.json`, E:`scripts/fixtures/substrate-consumer/README.md`. Verify the installed closure after the pin and regenerate its fixture only if needed, using the procedure of row 11c. The row shares no numbered source or test with row 12, which therefore does not wait for R-P1.
- Gate: `npx --no-install vitest run tests/platform-pin.test.ts && npm run lint && npm run build && npm run test:substrate-tarball && GRAPHIFY_PACKED_SKIP_BUILD=1 ./scripts/check-packed-surface.sh && node scripts/check-no-python.mjs`.

#### Row 12 · 1-E2-2 — Privacy modules — engram

- Allowed verification: `V-E`, `V-E-L0`.
- Source: `S1:1664`, second part; `S1:884-894`. Delta `S1-m` (SJ:529) is a statement about the same local-by-default rule; it adds no case here.
- [ ] RED: `tests/session-front-privacy.test.ts > a cross-boundary egress without a PiiArmorStamp fails closed`; `> revoking memory.capture.session/v1 blocks capture with AUTHORIZATION_REVOKED`; `> a deny-list hit is withheld as withheld_d7`; `> an ad-hoc per-CLI retention fails`; `> an expires_at beyond the computed retention deadline fails`.
- [ ] RED: `… > pseudonyms are deterministic per scope`; `> recall stays available after capture is revoked`; `> a purge announcement receipt precedes a purge`; `> the study window filters memory.recall.study/v1 only`.
- Allowed (9, E): E:`engram-memory/privacy/pseudonym.ts` (new), E:`engram-memory/privacy/deny-list.ts` (new), E:`engram-memory/privacy/pii-armor.ts` (new), E:`engram-memory/privacy/retention-window.ts` (new), E:`engram-memory/privacy/study-window.ts` (new), E:`engram-memory/tsconfig.json`, E:`engram-memory/index.ts`, E:`tests/session-front-privacy.test.ts`, E:`tests/memory-neutrality.test.ts`.
- Gate: `npm --prefix engram-memory run build && npx --no-install vitest run tests/session-front-privacy.test.ts tests/memory-neutrality.test.ts && npm run lint && npm run build && node scripts/check-no-python.mjs`.

#### Row 13 · 1-E4 — Derived worktree graph — engram

- Allowed verification: `V-E`, `V-E-LIVE`.
- Source: `S1:1666`. Delta `S4-i` (SJ:568): the `derivedWorktreeId` grammar is Spec 1's, unchanged.
- Start condition: the whole-package strict-check baseline is green; plan/09 row 3 (`L5-P-m8`) owns the two previously recorded snapshot errors (E `plan/09:151`). Row 13 does not widen its scope to repair them.
- Package and release: the lot edits `@sentropic/engram-live`, not the root package. It is in no checkpoint of this plan and no row waits for a release of it; row 28 waits for its merge only (“Row 13 and the neutral package”, PD-29).
- [ ] RED: `tests/derived-worktree-d21.test.ts > a raw absolute host path or an id that is not wt:<64 hex> is refused`; `> an uncertainty state outside the two declared ones is refused`; `> two distinct checkouts are never merged across clones`.
- [ ] RED: `… > the derived worktree node binds clone and worktree identity, parent origin, stable capture digests, the removed-retained state and the optional mergedAt`.
- [ ] GUARD: `… > passive turn recording keeps liveIndexingState unactivated` (`A01`).
- [ ] GUARD (PD-12): `… > the product predicate and derived-worktree record acceptance agree on the shared vector, with no second definition of isValidWorktreeId`.
- Allowed (8, E): E:`engram-live/derived-worktree-graph.ts` (new), E:`engram-live/contracts.ts`, E:`engram-live/index.ts`, E:`engram-live/tsconfig.json`, E:`scripts/build-live.mjs`, E:`scripts/check-live-package.mjs`, E:`tests/live-neutrality.test.ts`, E:`tests/derived-worktree-d21.test.ts` (new).
- Gate: `node scripts/build-live.mjs && node scripts/check-live-package.mjs && npx --no-install tsc --ignoreConfig --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --skipLibCheck --types node engram-live/*.ts && npx --no-install vitest run tests/derived-worktree-d21.test.ts tests/live-neutrality.test.ts tests/live-package.test.ts && npm run lint && npm run build && node scripts/check-no-python.mjs`. This is the literal whole-package strict check of E `plan/09:151`.

### Step 3 — Platform contract, memory namespace and session-front routes (sentropic)

Every path of this step is a proposal, confirmed by the sentropic conductor at branch start. Rows 14 to 17b have no engram dependency and start during step 1, after the reclaim record of the Disk rule. Every row lists S:`BRANCH.md` (“Scope exceptions and the branch file”).

#### Row 14 · SJ-0s — No-Python guard — sentropic, root

- Allowed verification: `V-S`, `V-S-CM`.
- Source: SJ:654; the scope exception SJ calls `BRSJ-EX1` (SJ:647), declared under an identifier of the sentropic grammar (proposed `BR10-EX1`). At S `d6093d568` the repository has no `scripts/check-no-python.mjs` and no `check-no-python` target.
- Start condition: the reclaim record of the Disk rule. This is the first class C row of the plan.
- [ ] RED t1: through `make check-no-python`, a tree with one `*.py`, `pyproject.toml` or `requirements*.txt` outside the allowlist fails and names the path.
- [ ] RED t2: through the same target, the repository as it is passes.
- [ ] Implement: one new target in the root `Makefile`, which runs `node --test scripts/check-no-python.test.mjs && node scripts/check-no-python.mjs` in the existing Node container; no existing target, recipe or image changes (SJ:647). The allowlist is an exact list of data files, as in engram; it may be empty. Before the lot starts the sentropic conductor records that list and confirms that no script, workflow or test executes an entry.
- Allowed (6, S): S:`Makefile`, S:`scripts/check-no-python.mjs` (new), S:`scripts/no-python-allowlist.json` (new), S:`.github/workflows/ci.yml`, S:`scripts/check-no-python.test.mjs` (new), and S:`BRANCH.md`.
- Gate: `make scope-check ENV=test-cluster-mesh && make check-no-python ENV=test-cluster-mesh` (SJ:654). Rollback: revert the lot.

#### Rows 15 and 15b · 6A-S0a-P1, 6A-S0a-P2 — Call context, then the `v2` projection — sentropic, `mcp-platform`

- Allowed verification: `V-S`, `V-S-P1`.
- Source: `S6A:745`, the `mcp-platform` targets, in two rows: with the branch file and the API report of the entry each part changes, one row would exceed 12 files. Deltas `S6A-c` (SJ:576) and `S6A-i` (SJ:582): no seventh tool, no tool that requires `h2a_context_mandate`. Both rows are in the platform stack and are re-pinned by row 17b.
- [ ] RED (row 15): `packages/mcp-platform/tests/memory-call-context-and-v2-claims.spec.ts > BridgeKernel forwards params._meta['sentropic.h2a.mandate'] on stdio and HTTP and X-Sentropic-H2A-Mandate on HTTP through callContext`.
- [ ] RED (row 15b): `… > the v2 projection carries the verified claims and the optional h2a_mandate`.
- [ ] GUARD (row 15b; it replaces test 2 of `S6A:745`): `… > the requiredClaims of the six tools are unchanged, no tool requires h2a_context_mandate, and the v1 projection is unchanged key for key`. The refusal of a `session_context` call with no binding is tested where it is produced, row 34 (`SJ-5b` t4); the invalid input with `v2` off, rows 32 and 53.
- [ ] Neither row adds a name to the public entry: a type that the `v2` projection needs stays inside the package until row 17 exports it, with the barrel, the frozen inventory and the report. Each row lists the API report that its changed signatures move, since that report is verified strictly (S `Makefile:2153`).
- Allowed (9, S, row 15): S:`packages/mcp-platform/src/transport/bridge-kernel.ts`, S:`…/transport/bridge.ts`, S:`packages/mcp-platform/src/memory/invocation-context.ts`, S:`packages/mcp-platform/tests/memory-call-context-and-v2-claims.spec.ts` (new), S:`packages/mcp-platform/etc/mcp-platform.api.md`, S:`packages/mcp-platform/etc/mcp-platform-memory.api.md`, S:`packages/mcp-platform/package.json`, S:`package-lock.json`, S:`BRANCH.md`. Both reports are regenerated and reviewed.
- Allowed (10, S, row 15b): S:`packages/mcp-platform/src/memory/contracts.ts`, S:`…/memory/frozen-context.ts`, S:`…/memory/context-projection.ts`, S:`…/memory/context-validation.ts`, the same spec file, S:`packages/mcp-platform/etc/mcp-platform-memory.api.md`, S:`packages/mcp-platform/etc/mcp-platform.api.md`, S:`packages/mcp-platform/package.json`, S:`package-lock.json`, S:`BRANCH.md`.
- Gate, each row: `make scope-check ENV=test-mcp-platform && make api-extract-mcp-platform API_EXTRACT_LOCAL=1 ENV=test-mcp-platform && make test-mcp-platform SCOPE="tests/memory-call-context-and-v2-claims.spec.ts" ENV=test-mcp-platform && make typecheck ENV=test-typecheck && make api-extract-mcp-platform ENV=test-mcp-platform && make memory-l5-lint ENV=test-mcp-platform && make pack-mcp-platform ENV=test-mcp-platform && make check-no-python ENV=test-mcp-platform`. Regenerate both reports explicitly, review their diffs, then require strict extraction with no local flag (S `Makefile:2153-2157`). P1 qualification is judged at row 17b.

#### Row 16 · 6A-S0a-B — `v2` projection through the broker — sentropic, `mcp-broker`

- Allowed verification: `V-S`, `V-S-P1`.
- Source: `S6A:745`, the `mcp-broker` targets.
- [ ] RED or GUARD: `packages/mcp-broker/tests/memory-v2-projection.spec.ts > compiled dispatch passes the v2 projection on unchanged and authorizes on sub and tid only`.
- [ ] First act: run that case on the receiving base. SJ reads the published `0.1.0` as already passing the projection on (SJ:668, t5). `0.1.0` is on the registry: engram resolves it from there (E `package-lock.json:2249-2252`; E `package.json:185`, `:256`). On S `main` the manifest of the broker still reads `"private": true` (S `packages/mcp-broker/package.json:4`), so the flag of `S6A:745` is not flipped: the row flips it, or records with the sentropic conductor why it stays. If the case passes, it is a GUARD with a mutation and the lot changes no source file.
- Allowed (6, S): S:`packages/mcp-broker/src/memory/compiled-dispatch.ts`, S:`packages/mcp-broker/src/memory/context-projection.ts`, S:`packages/mcp-broker/package.json`, S:`packages/mcp-broker/tests/memory-v2-projection.spec.ts` (new), S:`package-lock.json`, S:`BRANCH.md`.
- Gate: `make scope-check ENV=test-mcp-broker && make test-mcp-broker SCOPE="tests/memory-v2-projection.spec.ts" ENV=test-mcp-broker && make typecheck-mcp-broker ENV=test-mcp-broker && make memory-l5-lint ENV=test-mcp-broker && make check-no-python ENV=test-mcp-broker`. The published broker archive is verified by the mandatory row 17b P1 gate before the stack can merge; a private package becomes subject to the version-bump rule when its flag changes.

#### Row 17 · SJ-7a — The binding in the `v2` projection — sentropic, `mcp-platform`

- Allowed verification: `V-S`, `V-S-P1`.
- Source: SJ:668; block C of SJ §12.
- [ ] RED t1–t5: `memory-session-binding-v2 > t1: MemoryInvocationBindingV1 and the v2 projection carry optional session_binding, closed, with every field of SessionContextBindingV1, and the v1 projection is unchanged`; `> t2: callContext.meta reaches the host whole, and the platform reads none of the three h2a carriers and imports no engram or cluster-mesh module`; `> t3: the requiredClaims of the six tools are unchanged`; `> t4: the v2 wire and tool-schema profile ids are exported beside the v1 ones`; `> t5: the package is a 0.4.x version that the broker's ^0.4.0 range admits`.
- [ ] Implement, the public surface: `SessionContextBindingV1` and the `v2` profile identifiers become names of the public entry. That entry exports by name, the frozen inventory refuses any export it does not list, and the API report of the entry is verified strictly (“Packed-surface rule”, mcp-platform), so the barrel, the inventory and the report change with the contract, in this row.
- Allowed (12, S): S:`packages/mcp-platform/src/memory/contracts.ts`, S:`…/memory/frozen-context.ts`, S:`…/memory/context-projection.ts`, S:`…/memory/context-validation.ts`, S:`…/memory/invocation-context.ts`, S:`…/memory/index.ts`, S:`tools/memory-mcp-l5/exports-v1.json`, S:`packages/mcp-platform/etc/mcp-platform-memory.api.md`, S:`packages/mcp-platform/tests/memory-session-binding-v2.spec.ts` (new), S:`packages/mcp-platform/package.json`, S:`package-lock.json`, S:`BRANCH.md`.
- Gate: `make scope-check ENV=test-mcp-platform && make api-extract-mcp-platform API_EXTRACT_LOCAL=1 ENV=test-mcp-platform && make test-mcp-platform SCOPE="tests/memory-session-binding-v2.spec.ts" ENV=test-mcp-platform && make typecheck ENV=test-typecheck && make api-extract-mcp-platform ENV=test-mcp-platform && make memory-l5-lint ENV=test-mcp-platform && make pack-mcp-platform ENV=test-mcp-platform && make check-no-python ENV=test-mcp-platform`. Both reports are declared generated Allowed inputs/outputs in V-S-P1; if the root API report also needs a persistent change, the 12-file list would become 13: stop and split a report/export companion within the platform stack before acceptance. Row 17b waits for it, then R-P1.

#### Row 17b · P1-RP — `MCP-L5` re-pin for the platform stack — sentropic

- Allowed verification: `V-S`, `V-S-P1`.
- Source: this plan, PD-26; the rule “`MCP-L5` re-pin”. Scope exception: the re-pin set is protected by the tool's own rule (`L5-EX1` in S `Makefile:5023`), declared here under an identifier of the sentropic grammar (proposed `BR10-EX5`).
- [ ] GUARD: the broker's dependency is literally `^` followed by the final R-P1 platform version, not merely a range admitting it. S `tools/memory-mcp-l5/minimal-pack.mjs:12-17` copies it verbatim and `precandidate.mjs:100-101` enforces that equality in the two archives.
- [ ] GUARD: the retired manifest and sidecar survive under their immutable digest identity; the replacement has a new identity, two verified archives and a committed lock snapshot; no retained history or archive is overwritten.
- [ ] Implement: set S:`packages/mcp-broker/package.json` to `^<actual R-P1 platform version>`, regenerate S:`package-lock.json`, and commit those input changes before packing. The source head must contain the complete platform stack and the final broker baseline. The packer's committed-lock check is S `tools/memory-mcp-l5/pack.mjs:124-135`. No version or lock edit is allowed between that input commit and packing.
- Allowed (10, S): S:`packages/mcp-broker/package.json`, S:`package-lock.json`, S:`tools/memory-mcp-l5/artifacts/pre-candidate-manifest.json`, S:`tools/memory-mcp-l5/artifacts/pre-candidate-manifest.json.sha256`, S:`tools/memory-mcp-l5/artifacts/history/<retired-sha256>.json`, S:`tools/memory-mcp-l5/artifacts/history/<retired-sha256>.json.sha256`, S:`tools/memory-mcp-l5/artifacts/lock-snapshots/<committed-lock-sha256>.package-lock.json`, one content-addressed platform archive and one content-addressed broker archive under S:`tools/memory-mcp-l5/artifacts/archives/`, and S:`BRANCH.md`. Digest-derived paths are resolved by the procedure below and recorded as exact paths before qualification; these are two archive slots, never an unlimited directory allowance. The broker archive is required even if row 16 changed no runtime source, because its dependency baseline changed.
- Preparation and rotation: execute the single P1 rotation procedure below. It preserves the old pair before generating into an absent temporary destination, then promotes the verified new pair. `pack.mjs:175-181` does not rotate history and refuses to replace different existing bytes.
- Stack acceptance: every component keeps its own at-most-12-file ledger and parent-head diff. Before the final PR gate, S:`BRANCH.md` on this head records the union of rows 15, 15b, 16, 17 and 17b, with each lot's parent and file count; compare the PR against `origin/main`, not against row 17 alone. The aggregate merge diff may exceed 12; no individual lot may. The hosted `memory-l5-qualification` job must pass on that final head before R-P1.
- Gate: after the literal rotation procedure below, `make scope-check SCOPE_BASE=origin/main ENV=test-memory-mcp && make memory-l5-gate LOT=1 ARTIFACT_MANIFEST=tools/memory-mcp-l5/artifacts/pre-candidate-manifest.json ENV=test-mcp-platform && make memory-l5-lint ENV=test-mcp-platform && make check-no-python ENV=test-mcp-platform`. The procedure executes the named preservation, baseline and digest guards; the final scope check uses the aggregate BRANCH union.

##### P1 rotation procedure — used by row 17b and any later re-pin companion

This is conductor artifact bookkeeping in Node; S build and test commands remain Make-only. Run from S's repository root after committing the final source, manifests, API reports and lock. Reserve the exact history pair, lock snapshot and two archive paths in the lot ledger before the qualification gate. The temporary generation pair and command output are disposable Allowed outputs under `tmp/plan10-p1-*`; they are not committed. The packer alone authors the new manifest, sidecar, snapshot and archives.

```sh
export PLAN10_P1_TMP="$(node --input-type=module <<'NODE'
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root = 'tools/memory-mcp-l5/artifacts';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const platform = JSON.parse(fs.readFileSync('packages/mcp-platform/package.json'));
const broker = JSON.parse(fs.readFileSync('packages/mcp-broker/package.json'));
assert.equal(broker.dependencies['@sentropic/mcp-platform'], '^' + platform.version);
assert.deepEqual(fs.readFileSync('package-lock.json'), execFileSync('git', ['show', 'HEAD:package-lock.json']));
const old = fs.readFileSync(root + '/pre-candidate-manifest.json');
const sidecar = fs.readFileSync(root + '/pre-candidate-manifest.json.sha256');
const digest = hash(old);
assert.equal(sidecar.toString(), digest + '\n');
fs.mkdirSync(root + '/history', { recursive: true });
for (const [path, bytes] of [[root + '/history/' + digest + '.json', old], [root + '/history/' + digest + '.json.sha256', sidecar]]) {
  if (fs.existsSync(path)) assert.deepEqual(fs.readFileSync(path), bytes);
  else fs.writeFileSync(path, bytes, { flag: 'wx' });
}
fs.mkdirSync('tmp', { recursive: true });
process.stdout.write(fs.mkdtempSync('tmp/plan10-p1-'));
NODE
)"
test -n "$PLAN10_P1_TMP" && test -d "$PLAN10_P1_TMP" &&
make memory-l5-pack STAGE=pre-candidate ARTIFACT_MANIFEST="$PLAN10_P1_TMP/pre-candidate-manifest.json" ENV=test-mcp-platform &&
make memory-l5-verify ARTIFACT_MANIFEST="$PLAN10_P1_TMP/pre-candidate-manifest.json" ENV=test-mcp-platform &&
node --input-type=module <<'NODE'
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const root = 'tools/memory-mcp-l5/artifacts';
const canonical = root + '/pre-candidate-manifest.json';
const fresh = process.env.PLAN10_P1_TMP + '/pre-candidate-manifest.json';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const old = fs.readFileSync(canonical), oldDigest = hash(old);
assert.deepEqual(fs.readFileSync(root + '/history/' + oldDigest + '.json'), old);
assert.deepEqual(fs.readFileSync(root + '/history/' + oldDigest + '.json.sha256'), fs.readFileSync(canonical + '.sha256'));
const bytes = fs.readFileSync(fresh), newDigest = hash(bytes);
assert.notEqual(newDigest, oldDigest);
assert.equal(fs.readFileSync(fresh + '.sha256', 'utf8'), newDigest + '\n');
const manifest = JSON.parse(bytes);
assert.equal(manifest.artifacts.length, 2);
for (const artifact of manifest.artifacts) assert.equal(hash(fs.readFileSync(artifact.archive)), artifact.sha256);
fs.renameSync(fresh, canonical);
fs.renameSync(fresh + '.sha256', canonical + '.sha256');
console.log(JSON.stringify({ retired: oldDigest, current: newDigest, history: [root + '/history/' + oldDigest + '.json', root + '/history/' + oldDigest + '.json.sha256'], snapshot: manifest.source.declaredLockSnapshot.path, archives: manifest.artifacts.map(a => a.archive) }, null, 2));
NODE
```

Record that output and the final `ENV=test-mcp-platform` qualification command in S:`BRANCH.md`; run the canonical-path gate only after checking the resulting file set against the ten reserved paths. A failed generation retains the old canonical pair and history; a failed promotion stops before qualification. Do not rerun against a changed occupied destination or edit a retained manifest to make it pass.

#### Row 18 · 6A-S0b — SQLite kernel pre-lot — sentropic, `cluster-mesh`

- Allowed verification: `V-S`, `V-S-CM`.
- Source: `S6A:746`. External: the writer handoff `#679 → #685 → R2/R7a/R3`, and the coordination with chat-mesh lot B2. At S `d6093d568` the pull requests #679 and #685 are merged (`1472d961e`, `9ed96eb83`); the state of `R2/R7a/R3` is `unknown`; and the lot is not delivered: `'session-db'` appears in no file under `packages/cluster-mesh/src/storage/`.
- [ ] RED: `packages/cluster-mesh/tests/storage/sqlite-fenced-outbox-profiles.spec.ts > SqliteKernel provides fenced-writers-v1, immutable-boundaries-v1 and scope-outbox-v1 for session-db and engram-memory under process isolation and exclusive locking, with no sidecar table contention`.
- Allowed (6, S): S:`packages/cluster-mesh/src/storage/sqlite/index.ts`, S:`packages/cluster-mesh/src/storage/contracts.ts`, S:`packages/cluster-mesh/tests/storage/sqlite-fenced-outbox-profiles.spec.ts` (new), and the three common files.
- Gate: `make scope-check ENV=test-cluster-mesh && make test-cluster-mesh SCOPE="tests/storage/sqlite-fenced-outbox-profiles.spec.ts" ENV=test-cluster-mesh && make typecheck ENV=test-typecheck && make pack-cluster-mesh ENV=test-cluster-mesh && make check-no-python ENV=test-cluster-mesh`. This row shares `src/storage/sqlite/index.ts` with plan/09 rows 15, 16, 17 and 24; the sentropic conductor records their serial order.

#### Row 18b · PIN-E0 — engram pin on the published `0.28.0` — sentropic

- Allowed verification: `V-S`, `V-S-CM`, `V-S-PACK`, `V-S-P1`.
- Source: `S6A:747`, whose lot `6A-S1a` depends on “engram `0.28.0+`” and lists the pin lines among its targets (`catalog.ts:18`, `package.json:269,294`). At S `d6093d568` the pin is still `0.22.0`: `ENGRAM_MEMORY_RANGE` is `>=0.22.0 <0.23.0` (S `packages/cluster-mesh/src/modules/catalog.ts:18`) and `CLUSTER_MESH_PEER_TOOLS` names `@sentropic/engram@0.22.0` (S `Makefile:1282`). `0.28.0` is published: h2a resolves it from the registry (H `package-lock.json:2003-2006`). The move is its own row, under the exception that `S1:1672-1676` describes (proposed `BR10-EX3`): with it row 19 would exceed 12 files.
- [ ] GUARD: the cold workspace installs `@sentropic/engram@0.28.0`, the catalogue admits it, and the cluster-mesh suites and the type-check pass with no source change.
- [ ] Implement: the pin set of the [pin rows rule](#commissioning-rules), moved in lockstep to `0.28.0` with the range `>=0.28.0 <0.29.0`. Update the installed-version assertion at S `packages/cluster-mesh/tests/engram-memory/intent-carriage.spec.ts:13` and the in-range partial-provider fixture at S `packages/cluster-mesh/tests/mcp-memory.spec.ts:46` with every pin. Keep the incompatible fixture outside the new range. The later checkpoint-specific export GUARDs are assertions in `intent-carriage.spec.ts`, so the full gate actually executes them.
- [ ] Stop rule: the move crosses six minor versions of engram. If a suite needs a source change of cluster-mesh to accept `0.28.0`, the lot stops: that change belongs to row 19 or to a lot the sentropic conductor records, and the two are then ordered so that `main` never holds a pin its sources refuse.
- Allowed (12, S): S:`Makefile` (lines 1282 and 1318), S:`packages/cluster-mesh/package.json`, S:`packages/cluster-mesh/src/modules/catalog.ts`, S:`package.json`, S:`package-lock.json`, S:`.github/workflows/ci.yml`, S:`packages/cluster-mesh/tests/storage/cold-workspace.sh`, S:`scripts/ci/tool-locks.json`, S:`scripts/ci/publishable-ci-wiring.test.mjs`, S:`packages/cluster-mesh/tests/engram-memory/intent-carriage.spec.ts`, S:`packages/cluster-mesh/tests/mcp-memory.spec.ts`, S:`BRANCH.md`.
- Forbidden: any Make target, recipe, Dockerfile or harness rule change (`S1:1675`).
- Gate: `make scope-check ENV=test-cluster-mesh && make test-cluster-mesh ENV=test-cluster-mesh && make typecheck-cluster-mesh ENV=test-cluster-mesh && make pack-cluster-mesh ENV=test-cluster-mesh && make -f packages/cluster-mesh/packaging.mk test-lazy-package ENV=test-cluster-mesh && make memory-l5-lint ENV=test-cluster-mesh && make check-no-python ENV=test-cluster-mesh`. The installed-peer/export guards execute in `tests/engram-memory/intent-carriage.spec.ts`; the partial-provider fixture executes in `tests/mcp-memory.spec.ts`. The hosted P1 qualification must pass, with a bounded companion if its inputs changed. Revert pin and locks together on rollback.

#### Row 19 · 6A-S1a-1 — `memory-binding-v2` declarations and C6 inventory — sentropic, `cluster-mesh`

- Allowed verification: `V-S`, `V-S-CM`.
- Source: `S6A:747`. Delta `S6A-l` (SJ:585) changes no code here: the class `context_summary` stays, and carries the session context query and the stored requests.
- [ ] RED: `packages/cluster-mesh/tests/engram-memory/l5-v2-binding-and-qualification.spec.ts > the four generic metamodel keys index by scope, lineage, template id, version, digest and record id across the four lineages`.
- [ ] GUARD: the emitted neutral declaration has no import closure and its digest equals `neutral-asset-inventory.json`; the semantic manifest agrees with the source descriptor. The guard at S `packages/cluster-mesh/tests/engram-memory/package-contract.mjs:7-14` rejects changed declaration bytes before copying them. Update the reviewed declaration hash from the compiler output, never disable that assertion.
- Allowed (10, S): S:`packages/cluster-mesh/src/engram-memory/neutral-contract.ts`, S:`packages/cluster-mesh/src/engram-memory/manifest.ts`, S:`packages/cluster-mesh/src/engram-memory/projection.ts`, S:`packages/cluster-mesh/assets/storage/engram-memory/neutral-asset-inventory.json`, S:`packages/cluster-mesh/contracts/engram-memory-neutral-contract-v1.d.ts` (generated; absent from the tracked tree at `origin/main`), S:`packages/cluster-mesh/assets/storage/engram-memory/contract-manifest.json`, S:`packages/cluster-mesh/tests/engram-memory/l5-v2-binding-and-qualification.spec.ts` (new), and the three common files. This is the declaration/projection part of t1; the same test file gains the backend cases in row 19b. The generated declaration is reserved in the count even if it remains ignored.
- Gate: `make scope-check ENV=test-cluster-mesh && make test-cluster-mesh SCOPE="tests/engram-memory/l5-v2-binding-and-qualification.spec.ts" ENV=test-cluster-mesh && make typecheck-cluster-mesh ENV=test-cluster-mesh && make pack-cluster-mesh ENV=test-cluster-mesh && make check-no-python ENV=test-cluster-mesh`. The build runs the C6 declaration/hash guard and copies the snapshot (S `packages/cluster-mesh/tests/storage/cold-workspace.sh:115-121`).

#### Row 19b · 6A-S1a-2 — Backend migration and durable qualification — sentropic, `cluster-mesh`

- Allowed verification: `V-S`, `V-S-CM`.
- Source: `S6A:747`, backend half; Carbon round-2 N5. Depends on row 19; both halves are required wherever `6A-S1a` is named.
- [ ] RED: `packages/cluster-mesh/tests/engram-memory/l5-v2-binding-and-qualification.spec.ts > the four generic keys round-trip on SQLite and real Postgres; both backends reject a track-lineage overwrite without its authority witness; crash-window recovery and single-use elicitation_ref replay refusal hold`.
- Allowed (8, S): S:`packages/cluster-mesh/assets/storage/postgres/engram-memory/003-metamodel-records.sql` (new; take the next free number at branch start), S:`packages/cluster-mesh/src/engram-memory/neutral-handle.ts`, S:`packages/cluster-mesh/src/engram-memory/sqlite.ts`, S:`packages/cluster-mesh/src/engram-memory/postgres.ts`, S:`packages/cluster-mesh/tests/engram-memory/l5-v2-binding-and-qualification.spec.ts`, and the three common files.
- Gate: `make scope-check ENV=test-cluster-mesh && make test-cluster-mesh SCOPE="tests/engram-memory/l5-v2-binding-and-qualification.spec.ts" ENV=test-cluster-mesh && make -f Makefile -f packages/cluster-mesh/tests/storage/postgres.mk cluster-mesh-pg-test SCOPE="tests/engram-memory/l5-v2-binding-and-qualification.spec.ts" ENV=test-cluster-mesh && make -f Makefile -f packages/cluster-mesh/tests/storage/postgres.mk cluster-mesh-pg-down ENV=test-cluster-mesh && make typecheck-cluster-mesh ENV=test-cluster-mesh && make memory-mcp-qualify E2_LOCK=/tmp/sentropic-docker.lock ENV=test-memory-mcp && make pack-cluster-mesh ENV=test-cluster-mesh && make check-no-python ENV=test-cluster-mesh`. No backend case may skip; cleanup also runs on failure through the common S gate setup. Qualification receipts are disposable outputs, not a P1 manifest re-pin.

#### Row 20 · 6A-S1b — Mandate trust root and verifier — sentropic, `cluster-mesh`

- Allowed verification: `V-S`, `V-S-CM`, `V-S-PACK`.
- Source: `S6A:748`. Delta `S6A-c` (SJ:576): the verified mandate with `memory:context:assemble` is one of the two cases in which row 26 builds a binding; it is a claim no tool requires.
- [ ] RED: `packages/cluster-mesh/tests/runtime/h2a-mandate-verifier.spec.ts > the shared golden vector passes for the instance and quorum authorities and fails closed on AGENTS or MANDATAIRE self-signing, on a revoked kid, and on a header that differs from _meta` (`INVALID_DIGEST`).
- [ ] RED: `… > fast-llm and extraction calls route through llm-mesh only`.
- [ ] Implement: writes **V-mandate**, generated in this repository with `node:crypto` Ed25519 over RFC 8785 and NFC bytes, with a test key. `6A-H1` proves that h2a matches it (`S6A:759`, test 1).
- Allowed (8, S): S:`packages/cluster-mesh/src/runtime/h2a-mandate-verifier.ts` (new), S:`packages/cluster-mesh/src/nhi.ts`, S:`packages/cluster-mesh/src/integrations/llm-mesh/decision.ts`, S:`packages/cluster-mesh/tests/runtime/h2a-mandate-verifier.spec.ts` (new), S:`packages/cluster-mesh/tests/fixtures/h2a-mandate.vector.json` (new), and the three common files.
- Gate: `make scope-check ENV=test-cluster-mesh && make test-cluster-mesh SCOPE="tests/runtime/h2a-mandate-verifier.spec.ts" ENV=test-cluster-mesh && make typecheck ENV=test-typecheck && make pack-cluster-mesh ENV=test-cluster-mesh && make -f packages/cluster-mesh/packaging.mk test-lazy-package ENV=test-cluster-mesh && make check-no-python ENV=test-cluster-mesh`.

#### Row 21 · 6A-S1c — `/memory` namespace and degraded mode — sentropic, `cluster-mesh`

- Allowed verification: `V-S`, `V-S-CM`, `V-S-PACK`.
- Source: `S6A:749`. Deltas `S6A-k` (SJ:584): no `degraded` field of a seventh tool; `S6A-g` (SJ:580): the non-memory slices of `D18` are served by the read-only delivery, rows 31 and 79.
- [ ] RED: `packages/cluster-mesh/tests/memory/r12-access-and-degraded.spec.ts > an unreachable remote endpoint gives the degraded state with a banner, commits to engram-memory and the scoped outbox atomically, and drains in causal order on recovery`.
- [ ] RED: `… > the session-front ingest cites the session-db tuple and duplicates no transcript`.
- [ ] RED: `… > a collision on a Track-controlled record keeps the incumbent bytes, and concurrent offline Track templates are refused`.
- Allowed (11, S): S:`packages/cluster-mesh/src/modules/catalog.ts`, S:`packages/cluster-mesh/src/modules/contracts.ts`, S:`packages/cluster-mesh/src/compose/disabled.ts`, S:`packages/cluster-mesh/src/compose/memory.ts` (new), S:`packages/cluster-mesh/src/memory/access-port.ts` (new), S:`packages/cluster-mesh/src/memory/track-guard.ts` (new), S:`packages/cluster-mesh/tests/packaging/types-and-bundlers.spec.ts`, S:`packages/cluster-mesh/tests/memory/r12-access-and-degraded.spec.ts` (new), and the three common files. At S `d6093d568` the package has no `src/compose/memory.ts` and no `src/memory/` directory, only `src/memory.ts`.
- Gate: `make scope-check ENV=test-cluster-mesh && make test-cluster-mesh SCOPE="tests/memory/r12-access-and-degraded.spec.ts" ENV=test-cluster-mesh && make typecheck ENV=test-typecheck && make pack-cluster-mesh ENV=test-cluster-mesh && make -f packages/cluster-mesh/packaging.mk test-lazy-package ENV=test-cluster-mesh && make check-no-python ENV=test-cluster-mesh`. The ordinary test receives one real file path; the separate packaging target enables the packed guard.

#### Row 22 · 6A-S1d — `api` projection of `/memory` — sentropic, `api`

- Allowed verification: `V-S`, `V-S-API`.
- Source: `S6A:750`.
- [ ] RED: `api/tests/api/cluster-mesh-memory.test.ts > /api/v1/memory/v1/* and /memory/v1/* are both projected, and the 38-route receiver table is untouched`.
- Allowed (3, S): S:`api/src/routes/namespaces/memory.ts`, S:`api/tests/api/cluster-mesh-memory.test.ts`, S:`BRANCH.md`. The route file imports the legacy shadow adapter today (S `api/src/routes/namespaces/memory.ts:1-5`): this row moves it onto the composition of row 21 (`S6A:750`), which is what lets row 25 remove the legacy port.
- Gate: `make scope-check ENV=test-api && make test-api-unit SCOPE="tests/api/cluster-mesh-memory.test.ts" ENV=test-api && make typecheck ENV=test-typecheck && make check-no-python ENV=test-api`. Use the API setup and cleanup. The exact scoped unit target replaces the broad API matrix while retaining the specified type-check.

#### Row 23 · 6A-S2-C — MCP composition and memory transport — sentropic, `cluster-mesh`

- Allowed verification: `V-S`, `V-S-CM`, `V-S-PACK`.
- Source: `S6A:751`, the `cluster-mesh` targets (PD-19). Delta `S6A-e` (SJ:578): gate 1 is the `v2` profile switch of row 53; this lot builds no flag that hides a tool, and `tools/list` shows six tools.
- [ ] RED: `packages/cluster-mesh/tests/mcp-composition.spec.ts > compose/mcp mounts the root under the /mcp namespace and projects the sub and tid claims, the authoritative tenant and the connector context`.
- Allowed (10, S): S:`packages/cluster-mesh/src/compose/mcp.ts`, S:`packages/cluster-mesh/src/integrations/mcp/memory.ts`, S:`packages/cluster-mesh/src/integrations/mcp/memory-compose.ts`, S:`packages/cluster-mesh/src/integrations/mcp/memory-manifest.ts`, S:`packages/cluster-mesh/src/integrations/mcp/memory-transport.ts`, S:`packages/cluster-mesh/tests/mcp-composition.spec.ts`, S:`packages/cluster-mesh/tests/mcp-memory.spec.ts`, and the three common files. Both test paths already exist on S `origin/main`.
- Gate: `make scope-check ENV=test-cluster-mesh && make test-cluster-mesh SCOPE="tests/mcp-composition.spec.ts" ENV=test-cluster-mesh && make test-cluster-mesh SCOPE="tests/mcp-memory.spec.ts" ENV=test-cluster-mesh && make typecheck ENV=test-typecheck && make pack-cluster-mesh ENV=test-cluster-mesh && make -f packages/cluster-mesh/packaging.mk test-lazy-package ENV=test-cluster-mesh && make check-no-python ENV=test-cluster-mesh`. Both existing test files execute separately; a pipe is never a Vitest filename filter.

#### Row 24 · 6A-S2-A — Single compiled registry and dispatch — sentropic, `api`

- Allowed verification: `V-S`, `V-S-API`.
- Source: `S6A:751`, the `api` targets.
- [ ] RED: `api/tests/api/registry-dispatch-memory.test.ts > one compiled registry and one host transport dispatcher route the artifacts and the memory connectors, and hide memory tools from tenants and agents that did not opt in`.
- [ ] RED: `… > the nine-field catalogue cache key and the client policy hold, artifact_request_refused is preserved, a memory failure outside RPC answers memory_request_refused, and chat-server imports no engram module`.
- Allowed (7, S): S:`api/src/services/mcp/cluster-registry.ts`, S:`api/src/services/mcp/registry-dispatch.ts`, S:`api/src/services/mcp/client-policy.ts`, S:`api/src/services/artifacts/transport.ts`, S:`api/src/services/catalog/sources/host-registry-source.ts`, S:`api/tests/api/registry-dispatch-memory.test.ts` (new), S:`BRANCH.md`.
- Gate: `make scope-check ENV=test-api && make test-api-unit SCOPE="tests/api/registry-dispatch-memory.test.ts" ENV=test-api && make typecheck ENV=test-typecheck && make check-no-python ENV=test-api`. Use the API setup and cleanup. The exact scoped unit target replaces the broad API matrix while retaining the specified type-check.

#### Row 25 · 6A-S3 — Legacy memory port removed — sentropic, `cluster-mesh`

- Allowed verification: `V-S`, `V-S-CM`, `V-S-PACK`, `V-S-API`.
- Source: `S6A:752`.
- [ ] RED: `packages/cluster-mesh/tests/memory/legacy-port-retired.spec.ts > H2aGraphifyMemoryPort and every GraphifyMemory name are absent from cluster-mesh and api, and MemoryReplicationPort is intact`.
- Allowed (7, S): S:`packages/cluster-mesh/src/memory.ts`, S:`packages/cluster-mesh/src/index.ts`, S:`packages/cluster-mesh/tests/graphify-memory-adapter.spec.ts` (removed), S:`packages/cluster-mesh/tests/memory/legacy-port-retired.spec.ts` (new), and the three common files.
- Builder: Hydrogen, not Ember. The lot is a removal, but it edits the public barrel of a published package (`src/index.ts`) and its gate runs a test of `api`: that is outside the Ember class of the builder rule. If the packaging spec has to change, the lot goes one class up, to Neon.
- Gate: `make scope-check ENV=test-cluster-mesh && make test-cluster-mesh SCOPE="tests/memory/legacy-port-retired.spec.ts" ENV=test-cluster-mesh && make test-api-unit SCOPE="tests/api/cluster-mesh-memory.test.ts" ENV=test-api && make typecheck ENV=test-typecheck && make pack-cluster-mesh ENV=test-cluster-mesh && make -f packages/cluster-mesh/packaging.mk test-lazy-package ENV=test-cluster-mesh && make check-no-python ENV=test-cluster-mesh`. Use the API setup and cleanup too. R-S0 follows.

#### Row 26 · SJ-7c — The session binding at the hop — sentropic, `cluster-mesh`

- Allowed verification: `V-S`, `V-S-CM`.
- Source: SJ:669; SJ §2.6.
- [ ] RED t1–t6: `tests/session-binding.spec.ts > t1: a mandate verified with memory:context:assemble gives a binding with tenant, workspace, worktree, session, role_ref and mandate_digest`; `> t2: a memory identity and no mandate gives a binding with neither role_ref nor mandate_digest`; `> t3: no memory identity, or a mandate that fails a check or lacks the right, gives no binding`; `> t4: a session noted by another caller gives no binding`; `> t5: the worktree and the session come from the session carrier or from the envelope, and a tool argument that names them is ignored`; `> t6: one builder serves both transports, it builds with the journal off, and with no receipt the reader facts are the closed defaults`.
- [ ] Note on t4 (PD-21): the case needs a record, in cluster-mesh, of which caller noted a session, and SJ:246 excludes the engram journal as its source. That record is expected in the neutral `session-db` of chat-mesh B1 and B2 (`unverified`). If it is absent at branch start, t4 moves to row 40, which waits for chat-mesh through row 28; no case is dropped.
- [ ] Implement: writes **V-session**, the golden value of the session carrier that t5 reads: one `params._meta['sentropic.h2a.session']` value with the two fields of `SessionCallerRefV1`. The carrier is read here and written by row 54, which is built later in another repository: the vector is the bytes the two rows share.
- Allowed (6, S): S:`packages/cluster-mesh/src/memory/session-binding.ts` (new), S:`packages/cluster-mesh/tests/session-binding.spec.ts` (new), S:`packages/cluster-mesh/tests/fixtures/h2a-session-carrier.vector.json` (new), and the three common files.
- Gate: `make scope-check ENV=test-cluster-mesh && make test-cluster-mesh SCOPE="tests/session-binding.spec.ts" ENV=test-cluster-mesh && make typecheck-cluster-mesh ENV=test-cluster-mesh && make pack-cluster-mesh ENV=test-cluster-mesh && make check-no-python ENV=test-cluster-mesh`.

#### Row 27 · PIN-E1 — engram pin on R-E1 — sentropic

- Allowed verification: `V-S`, `V-S-CM`, `V-S-PACK`, `V-S-P1`.
- Source: `S1:1672-1676` (the exception S1 calls `BRS1-EX1`, proposed `BR10-EX3`), the pin part of `1-S1a`. It is row 18b at the R-E1 version: the same Allowed list (12, S), the same Forbidden line, the same rollback; its literal gate is below.
- [ ] GUARD: the cold workspace resolves `@sentropic/engram/session-front-contracts`, a subpath that only R-E1 and later versions export, and the cluster-mesh suites and type-check pass with no source change.
- [ ] Implement: the pin set, moved in lockstep to the R-E1 version, with a range of one minor. Nothing else.
- Each later pin row has its own GUARD, on a name that only its version exports: row 39, `noteSessionEvent` (row 30); row 52, the wire codec `toSessionContextWire` (row 32, SJ:806); row 76, the subpath `@sentropic/engram/h2a-lineage` (row 65). A pin row whose GUARD passes on the previous pin has pinned nothing: it fails.
- At branch start the sentropic conductor reconciles the list with the files the sibling exceptions name beyond it (`S3:1039-1043`: the neutral-contract declaration snapshot, `scripts/ci/consumer-locks.json`, the qualification pins). Any additional persistent change triggers the pin-companion split described in the pin rule; twelve files is already the ceiling.
- Gate: `make scope-check ENV=test-cluster-mesh && make test-cluster-mesh ENV=test-cluster-mesh && make typecheck-cluster-mesh ENV=test-cluster-mesh && make pack-cluster-mesh ENV=test-cluster-mesh && make -f packages/cluster-mesh/packaging.mk test-lazy-package ENV=test-cluster-mesh && make memory-l5-lint ENV=test-cluster-mesh && make check-no-python ENV=test-cluster-mesh`. The installed-peer/export guards execute in `tests/engram-memory/intent-carriage.spec.ts`; the partial-provider fixture executes in `tests/mcp-memory.spec.ts`. The hosted P1 qualification must pass, with a bounded companion if its inputs changed. Revert pin and locks together on rollback.

#### Row 28 · 1-S1a — Session-front routes — sentropic, `cluster-mesh`

- Allowed verification: `V-S`, `V-S-CM`, `V-S-PACK`.
- Source: `S1:1682`. Deltas applied here: `S1-a` (SJ:518), `S1-j` (SJ:527). `S1-h` and `S1-n` are built by row 40: here the ingest route calls `recordSessionEvent`, the frozen port.
- [ ] RED: `packages/cluster-mesh/tests/session-front-r12.spec.ts > a missing or unverified mandate, or a cross-scope source event, on the extractions route or on the proposals route is refused 403`; `> an HMI input over 65,536 bytes is refused 413`; `> a SqliteKernel fault answers 503 with the degraded error`.
- [ ] RED: `… > the four routes commit through the two kernels in order: the session-db entry, then engram-memory with the ingested ordinal and the scoped outbox`; `> the content policy, the retention deadline and the pseudonym key ring are checked`.
- [ ] RED (`S1-a`, PD-14): `… > a hostId that the enrolled host attachment does not hold is refused, and an enrolled ninth host is accepted`.
- [ ] GUARD: `packages/cluster-mesh/tests/packaging/types-and-bundlers.spec.ts > the provider catalogue registers @sentropic/engram/session-front-contracts`.
- Allowed (9, S): S:`packages/cluster-mesh/src/modules/contracts.ts`, S:`packages/cluster-mesh/src/modules/catalog.ts`, S:`packages/cluster-mesh/src/loaders/memory.ts` (new), S:`packages/cluster-mesh/src/compose/memory.ts`, S:`packages/cluster-mesh/tests/session-front-r12.spec.ts` (new), S:`packages/cluster-mesh/tests/packaging/types-and-bundlers.spec.ts`, and the three common files. The catalogue is typed by the closed list of module identifiers (S `packages/cluster-mesh/src/modules/catalog.ts:83`; S `packages/cluster-mesh/src/modules/contracts.ts:5-30`): a new entry needs its identifier there, which `S1:1682` does not list. At S `d6093d568` there is no `src/loaders/memory.ts`; the existing loader of the memory MCP is `src/loaders/mcp/memory.ts`.
- Gate: `make scope-check ENV=test-cluster-mesh && make test-cluster-mesh SCOPE="tests/session-front-r12.spec.ts" ENV=test-cluster-mesh && make typecheck-cluster-mesh ENV=test-cluster-mesh && make pack-cluster-mesh ENV=test-cluster-mesh && make -f packages/cluster-mesh/packaging.mk test-lazy-package ENV=test-cluster-mesh && make check-no-python ENV=test-cluster-mesh`. The packed provider-catalogue guard must execute. External chat-mesh B1/B2 and row 13's merge remain prerequisites; no neutral-package release is awaited.

#### Row 29 · 1-S1b — `api` exposure of the session-front routes — sentropic, `api`

- Allowed verification: `V-S`, `V-S-API`.
- Source: `S1:1683`.
- [ ] RED: `api/tests/api/memory-session-front.test.ts > an unauthenticated caller is refused, a store fault answers 503, and the static check fails if api/src/routes/memory/session-front.ts exists`.
- [ ] RED: `… > the four paths are exposed through the memory namespace with no change to the 38-route receiver table`.
- Allowed (3, S): S:`api/src/routes/namespaces/memory.ts`, S:`api/tests/api/memory-session-front.test.ts` (new), S:`BRANCH.md`.
- Gate: `make scope-check ENV=test-api && make test-api-unit SCOPE="tests/api/memory-session-front.test.ts" ENV=test-api && make typecheck-api ENV=test-api && make check-no-python ENV=test-api`. Use the API setup and cleanup. The exact scoped unit target replaces the broad API matrix while retaining the specified type-check.

### Step 4 — Journal wrapper, disclosure rule and `v2` search (engram)

#### Row 30 · SJ-2c — The journal wrapper and the one disclosure rule — engram

- Allowed verification: `V-E`, `V-E-L0`.
- Source: SJ:659; block B of SJ §12. Delta `S1-n` (SJ:530). Depends on row 12 for t3 (PD-06) and on row 11b for the binding type: the platform pins are already on R-P1 when this row starts.
- [ ] RED t1–t7: `tests/session-journal-wrapper.test.ts > t1: noteSessionEvent records exactly what recordSessionEvent records, one event and one commit under the same key, and recorded is the Spec 1 result untouched`; `> t2: one function decides disclosure for both transports`; `> t3: text for an authorized external reader still passes the deny-list and the PII armor, and a hit is withheld`; `> t4: no binding, or a binding with no reader fact, is external and not authorized`; `> t5: an envelope and a binding that disagree on tenant, workspace, worktree, session or mandate digest are refused UNAUTHORIZED, and nothing is recorded`; `> t6: recordSessionEvent alone equals noteSessionEvent with no host fact`; `> t7: the peer and dev pins admit the platform version of R-P1, and engram-memory imports nothing from the platform`.
- [ ] Implement: `noteSessionEvent` wraps the frozen port and changes neither of its signatures; the binding is imported type-only from the platform. The row also declares the type `SessionReadOnlyDeliveryV1`, which two types of block B reference (SJ:840, SJ:844); row 31 implements the delivery behind it. t7 is a GUARD on the pins that row 11b set: this row changes no dependency declaration.
- Allowed (6, E): E:`src/session-front-contracts.ts`, E:`src/session-front/journal.ts` (new), E:`src/session-context/disclosure.ts` (new), E:`src/session-front/ingest.ts`, E:`tests/session-journal-wrapper.test.ts` (new), E:`tests/memory-neutrality.test.ts`.
- Gate: `npm --prefix engram-memory run build && npx --no-install vitest run tests/session-journal-wrapper.test.ts tests/memory-neutrality.test.ts && npm run lint && npm run build && node scripts/check-no-python.mjs`.

#### Row 31 · SJ-2b — Read-only delivery (`D18`) — engram

- Allowed verification: `V-E`.
- Source: SJ:660; SJ §3.6. Deltas `S1-k` (SJ:528), `S4-h` (SJ:567).
- [ ] RED t1–t4: `tests/session-context-readonly.test.ts > t1: no memory identity and a verified policy passed as readOnlyPolicy give zero journal rows, zero memory item and the allowed slices as a diff in readOnlyDelivery, with policyDigest, while recorded is the unchanged Spec 1 refusal`; `> t2: no policy gives the refusal alone`; `> t3: memory in allowedSlices is INVALID_SCHEMA`; `> t4: the computed query is never stored, and its watermark names version 1`.
- Allowed (4, E): E:`src/session-front-contracts.ts`, E:`src/session-front/journal.ts`, E:`src/session-context/engine.ts`, E:`tests/session-context-readonly.test.ts` (new).
- Gate: `npx --no-install vitest run tests/session-context-readonly.test.ts && npm run lint && npm run build && node scripts/check-no-python.mjs`. Checkpoint R-E2 follows.

#### Row 32 · SJ-5a — The `v2` schemas and the wire codec — engram

- Allowed verification: `V-E`.
- Source: SJ:663; SJ §2.4, §12. Deltas `S6A-b` (SJ:575), `S6A-e` (SJ:578).
- [ ] RED t1–t7: `tests/memory-search-v2-schema.test.ts > t1: with v2 off the v1 manifest and schema digests are byte-identical, and session_context is INVALID_SCHEMA`; `> t2: every v2 schema passes the tool-schema dialect, every property name of the page is snake_case at every depth, and any null fails`; `> t3: match and amendment each validate with exactly one branch`; `> t4: session_context with page_cursor is INVALID_SCHEMA, and no next_page_cursor is issued`; `> t5: the codec round-trips journal form and wire form and refuses an unknown key`; `> t6: the v2 profile ids equal the platform's, and the dialect admits them for v2 schemas only`; `> t7: binding the v2 profile set without a valid co-signature receipt makes the provider factory throw`.
- [ ] Implement: writes **V-codec**, the golden vector of t5.
- Allowed (7, E): E:`src/session-front-contracts.ts`, E:`src/mcp/memory/contracts.ts`, E:`src/mcp/memory/schemas.ts`, E:`tests/memory-search-v2-schema.test.ts` (new), E:`tests/fixtures/session-context/wire-codec.vector.json` (new), and the two derived registry files, E:`registry/entries.v1.json` and E:`registry/publisher-assets.v1.json`. The row uses the amendment and verdict types of row 9 in its wire types (SJ:832-835), which is why it waits for it.
- Gate: `npx --no-install vitest run tests/memory-search-v2-schema.test.ts && npm run lint && npm run build && node scripts/check-no-python.mjs`.

#### Row 33 · SJ-5c — The `v2` profile in the provider: the preflight — engram

- Allowed verification: `V-E`.
- Source: SJ:664. Delta `S6A-h` (SJ:581): this lot and row 32 take the place of `6A-E2`, with its tests retargeted.
- [ ] RED t1–t6: `tests/mcp-memory-v2-preflight.test.ts > t1: with the v1 profile set bound the provider starts as today`; `> t2: the v2 set without a valid two-signature receipt throws McpMemoryPreflightError`; `> t3: with the receipt the v2 set is admitted with its two profile ids and digests, and any other set fails as an incompatible frozen profile`; `> t4: step 4 validates the search input with the v2 schema when v2 is on, and with the v1 schema when it is off`; `> t5: the provider copies session_binding from the projection into the read invocation, and copies none when there is none`; `> t6: six tools in both profiles, and the root export imports no MCP peer`.
- [ ] Implement: the receipt fixture is signed with keys generated for the test. The production co-signature is a separate dossier (SJ §11). The `v2` profile assets are emitted files: their guard is the asset generator, which verifies the pinned digests against the shipped bytes (E `src/mcp-memory/profiles.ts:5-6`), and it is in the Allowed list.
- Allowed (9, E): E:`src/mcp-memory/provider.ts`, E:`src/mcp-memory/profiles.ts`, E:`src/mcp/memory/receipts.ts`, E:`src/memory-tools/reads.ts`, E:`scripts/gen-mcp-memory-assets.mjs`, E:`tests/mcp-memory-v2-preflight.test.ts` (new), E:`tests/fixtures/mcp-memory/co-signature-v2.fixture.json` (new), and the two derived registry files, E:`registry/entries.v1.json` and E:`registry/publisher-assets.v1.json`.
- Gate: `npx --no-install vitest run tests/mcp-memory-v2-preflight.test.ts tests/memory-search-v2-schema.test.ts && npm run lint && npm run build && node scripts/check-no-python.mjs`.

#### Row 34 · SJ-5b — Search the history — engram

- Allowed verification: `V-E`, `V-E-L0`.
- Source: SJ:665; SJ §2.4.
- [ ] RED t1–t5: `tests/session-search-history.test.ts > t1: history finds an exact line of a closed session of the same role and space, with its event record id, locator, lines and digest, and finds one on the recording of row 6`; `> t2: another role, workspace or tenant gives no match, and a session with no role searches its own journal only`; `> t3: a match from another session is a reference for an external reader with no authorization, and an own-session match is text`; `> t4: no binding is UNAUTHORIZED, a binding with no journal facet is CAPABILITY_UNAVAILABLE, and a workspace that has not opted in gets no history while the call succeeds`; `> t5: the handler writes to no store`.
- Allowed (8, E): E:`src/memory-tools/reads.ts`, E:`src/memory-tools/session-history.ts` (new), E:`src/mcp-memory/provider.ts`, E:`engram-memory/session-front-engine.ts`, E:`tests/session-search-history.test.ts` (new), E:`tests/memory-neutrality.test.ts`, and the two derived registry files, E:`registry/entries.v1.json` and E:`registry/publisher-assets.v1.json`.
- Gate: `npm --prefix engram-memory run build && npx --no-install vitest run tests/session-search-history.test.ts tests/memory-neutrality.test.ts && npm run lint && npm run build && node scripts/check-no-python.mjs`.

#### Row 35 · SJ-6b — Ask through search, commit on the note — engram

- Allowed verification: `V-E`.
- Source: SJ:667; SJ §2.4. Delta `S1-d` (SJ:521, `contextAmendments`).
- [ ] RED t1–t9: `tests/session-context-amend.test.ts > t1: keep returns the query, the amendment and the verdict and changes no store, and a drop names the id and carries no text`; `> t2: the note of that call commits the next version, the selector cites that note, and the receipt lists the verdict`; `> t3: the same note delivered twice gives one version`; `> t4: with capture revoked the note is refused, the version does not move, and history still answers`; `> t5: journal off gives the memory results with the verdict refused journal_off`; `> t6: contextAmendments on any other event is INVALID_SCHEMA`; `> t7: a selector written in another session reaches an external reader as withheld, and that reader drops it by its id`; `> t8: with nothing noted the amendment names basedOnVersion 0, and its note creates version 1 then commits version 2`; `> t9: an amendment whose match is withheld, or a drop that carries a match, is INVALID_SCHEMA on both transports`.
- Allowed (7, E): E:`src/memory-tools/session-history.ts`, E:`src/session-front/journal.ts`, E:`src/session-front-contracts.ts`, E:`src/session-context/engine.ts`, E:`tests/session-context-amend.test.ts` (new), and the two derived registry files, E:`registry/entries.v1.json` and E:`registry/publisher-assets.v1.json`. The test file imports nothing from `engram-memory/`: this lot does not list the neutrality suite.
- Gate: `npx --no-install vitest run tests/session-context-amend.test.ts && npm run lint && npm run build && node scripts/check-no-python.mjs`.

#### Row 36 · Lot 0.2 — Metamodel grammar validator — engram

- Allowed verification: `V-E`.
- Source: `S0:884-890`. No row of SJ §8 changes this lot.
- [ ] RED: `tests/metamodel-v1-validator.test.ts > complete track and h2a v1 templates validate` (`S0:886`); `> each diagnostic code of the grammar has one negative vector, and the input object is never mutated` (`S0:887`); `> instance validation enforces state transitions and endpoint cardinality` (`S0:888`).
- [ ] Implement: `src/metamodel/types.ts` imports the shared declarations of row 2 and declares none of them again.
- Allowed (5, E): E:`src/metamodel/types.ts` (new), E:`src/metamodel/diagnostics.ts` (new), E:`src/metamodel/validate.ts` (new), E:`src/profile-validate.ts`, E:`tests/metamodel-v1-validator.test.ts` (new). Vectors are written in the test file.
- Gate: `npx --no-install vitest run tests/metamodel-v1-validator.test.ts && npm run lint && npm run build && node scripts/check-no-python.mjs`.

#### Row 37 · 1-E3 — Extraction pipeline — engram

- Allowed verification: `V-E`, `V-E-PACK`.
- Source: `S1:1665`. `S1-f` is built by row 38.
- [ ] RED: `tests/session-extraction-pipeline.test.ts > a project candidate with an unknown template reference fails REGISTRY_VERSION_UNAVAILABLE`; `> a project candidate never enters accepted_current without a Track control verdict`.
- [ ] RED: `… > no public subpath that cluster-mesh consumes reaches llm-execution, an AI SDK, mistral-ocr or an API-key environment read, by import graph and by packed chunk` (`F-12`). Of the seven subpaths `S1:1665` lists, `./metamodel` is not an export of the package today (E `package.json:12-63`) and no lot of this plan adds it: `source-gap`. The case covers the subpaths that exist and names the missing one in its output.
- [ ] RED: `… > the three extraction backends run through recordExtraction with their attempt reference, the five-state review bijection and the source dispositions`.
- Allowed (6, E): E:`src/session-extraction-adapter.ts` (new), E:`src/extraction-batch.ts` (the import at lines 74–78 moves to `./llm-json-port.js`), E:`tsup.config.ts`, E:`tests/session-extraction-pipeline.test.ts` (new), E:`scripts/substrate-tarball-acceptance.mjs`, E:`scripts/fixtures/packed-surface/check-esm.mjs`.
- Gate: `npx --no-install vitest run tests/session-extraction-pipeline.test.ts && npm run lint && npm run build && npm run test:substrate-tarball && GRAPHIFY_PACKED_SKIP_BUILD=1 ./scripts/check-packed-surface.sh && node scripts/check-no-python.mjs`.

#### Row 38 · SJ-10 — The shadow's output in the journal — engram

- Allowed verification: `V-E`.
- Source: SJ:676; SJ §2.3, §3.7, §6.1. Delta `S1-f` (SJ:523).
- [ ] RED t1–t5: `tests/session-shadow-output.test.ts > t1: a shadow item or selector with no authorModelRef or no cited event is refused, and for an amendment the verdict is refused unattributed`; `> t2: a shadow amendment in the batch goes through the gate of row 9, and the extraction receipt lists its verdict`; `> t3: a shadow late by k steps shows in annotatedThroughOrdinal`; `> t4: mode off makes no model call between two steps, and annotatedThroughOrdinal is absent`; `> t5: when the shadow and the main model disagree both items stay, flagged, each with its authoredBy`.
- Allowed (4, E): E:`src/session-front-contracts.ts`, E:`src/session-extraction-adapter.ts`, E:`src/session-context/engine.ts`, E:`tests/session-shadow-output.test.ts` (new).
- Gate: `npx --no-install vitest run tests/session-shadow-output.test.ts && npm run lint && npm run build && node scripts/check-no-python.mjs`. Checkpoint R-E3 follows.

### Step 5 — The journal route and the live proof (sentropic, then h2a)

Every H path of this plan is a proposal, confirmed by h-cond at branch start. The H files that a row edits and does not mark `new` were checked for existence at H `e9ce1a8db`; a file marked `new` was checked absent. The first act of the first H row runs H `scripts/check-no-python.mjs` on the receiving head.

#### Row 39 · PIN-E2 — engram pin on R-E2 — sentropic

- Allowed verification: `V-S`, `V-S-CM`, `V-S-PACK`, `V-S-P1`.
- Source: the exception SJ calls `BRSJ-EX2` (SJ:647; proposed `BR10-EX2`), the pin part of `SJ-3a`. It is row 18b at the R-E2 version: the same Allowed list (12, S), the same rollback; its literal gate is below. Its GUARD is its own: the cold workspace resolves `noteSessionEvent`, which only R-E2 and later versions export.
- Gate: `make scope-check ENV=test-cluster-mesh && make test-cluster-mesh ENV=test-cluster-mesh && make typecheck-cluster-mesh ENV=test-cluster-mesh && make pack-cluster-mesh ENV=test-cluster-mesh && make -f packages/cluster-mesh/packaging.mk test-lazy-package ENV=test-cluster-mesh && make memory-l5-lint ENV=test-cluster-mesh && make check-no-python ENV=test-cluster-mesh`. The installed-peer/export guards execute in `tests/engram-memory/intent-carriage.spec.ts`; the partial-provider fixture executes in `tests/mcp-memory.spec.ts`. The hosted P1 qualification must pass, with a bounded companion if its inputs changed. Revert pin and locks together on rollback.

#### Row 40 · SJ-3a-1 — The route — sentropic, `cluster-mesh`

- Allowed verification: `V-S`, `V-S-CM`.
- Source: SJ:661, tests t1 to t4 and t6 (PD-07). Deltas `S1-h` (SJ:525) and `S1-n` (SJ:530): the route calls `noteSessionEvent`.
- [ ] RED t1: `tests/session-context-route.spec.ts > t1: with the journal off the route answers the refusal of SJ-2a t1 and records nothing`.
- [ ] RED t2: `… > t2: the route calls noteSessionEvent with the binding of SJ-7c, and with no reader fact own-session items are text and other-session items are references`.
- [ ] RED t3: `… > t3: an envelope member the contract does not know is INVALID_SCHEMA: a body cannot carry a host fact`.
- [ ] RED t4: `… > t4: local store down answers 503, with no delivery and no second store`.
- [ ] RED t6: `… > t6: contextRequest or contextAmendments from a caller with no binding and no verified policy is UNAUTHORIZED and records nothing, and the same note without them is recorded as Spec 1 says`.
- [ ] The workspace setting (PD-31): t1 needs to know whether the journal is on for the workspace of the call. SJ calls `journalEnabled` a workspace setting (SJ:825-826) and names neither its store nor its setter: `source-gap`. The route reads it through one injected reader and adds no store of its own. Before the row starts the sentropic conductor names the store that reader reads and the act that sets it for one workspace; P-LIVE uses that act and nothing else.
- Allowed (6, S): S:`packages/cluster-mesh/src/compose/memory.ts`, S:`packages/cluster-mesh/src/memory/session-journal-route.ts` (new), S:`packages/cluster-mesh/tests/session-context-route.spec.ts` (new), and the three common files.
- Gate: `make scope-check ENV=test-cluster-mesh && make test-cluster-mesh SCOPE="tests/session-context-route.spec.ts" ENV=test-cluster-mesh && make typecheck-cluster-mesh ENV=test-cluster-mesh && make pack-cluster-mesh ENV=test-cluster-mesh && make check-no-python ENV=test-cluster-mesh`. R-S1 follows.

#### Row 40b · PIN-H0 — Exact pins of h2a on R-S0 and R-P1 — h2a

- Allowed verification: `V-H`.
- Source: `S6A:759`, which lists the pin lines among the targets of `6A-H1` (`packages/h2a/package.json:80-88`, `packages/h2a-runtime/package.json:27`); the rule “Pin rows (H)”; PD-24. At H `e9ce1a8db` the pins are cluster-mesh `0.26.0`, engram `0.28.0`, llm-mesh `0.38.4` and the platform `0.4.1`.
- [ ] First act, as the first H row of the plan (row 80 does the same if it starts earlier): `node scripts/check-no-python.mjs` passes on the receiving head. If it does not, no H row starts before h-cond has recorded why.
- [ ] GUARD: after `npm ci`, the installed cluster-mesh is the R-S0 version at its recorded integrity, it serves the `/memory` namespace, and the three assertions of the cluster-mesh literal hold at the new value.
- [ ] GUARD: `npm test` and `npm run pack:h2a` pass with no change beyond the files of this row; the payload holds every dependency at its exact locked version (H `scripts/check-publish-payload.mjs:37-40`).
- [ ] Implement: the cluster-mesh pin moves to R-S0 and the platform pin to R-P1, in both manifests, with the lock; the engram and llm-mesh pins move only if the peer ranges of that cluster-mesh ask for it. Nothing else. If a source file of h2a must change for the new cluster-mesh to load, beyond the two that the last move also touched, the lot stops: that change belongs to row 42.
- Allowed (12, H), the file set of the last pin move (`51b22f176`): H:`packages/h2a/package.json`, H:`packages/h2a-runtime/package.json`, H:`package-lock.json`, H:`packages/h2a/test/remote-session-mesh-consumer.test.js`, H:`packages/h2a/test/registry-artifacts-packed.test.js`, H:`packages/h2a/test/runtime-llm-mesh-account.test.js`, H:`packages/h2a/test/install-skills-hosts.test.js`, H:`packages/h2a-runtime/src/llm-mesh-resolution.test.ts`, H:`packages/h2a-runtime/src/mesh-consumer-origin.ts`, H:`packages/h2a-runtime/src/mesh-consumer-origin.test.ts`, H:`packages/h2a-runtime/src/gateway-model-catalog/model-catalog.ts`, H:`packages/h2a-runtime/src/gateway-model-catalog/model-catalog.test.ts`.
- Order with plan/09: its checkpoints R-H and R-H2 move the same literals (`plan/09:120-122`). A pin never moves backwards; h-cond records, at each move of either plan, which checkpoints of the two plans the pinned versions contain.
- Gate: `npm ci && node --input-type=module -e 'import {readInventory} from "./scripts/test-execution-evidence.mjs"; import {declarationFailures} from "./scripts/test-inventory.mjs"; const failures=declarationFailures(process.cwd(),readInventory(process.cwd())); if(failures.length) throw Error(failures.join("\n"));' && npm test && npm run pack:h2a && npm run pack:h2a-runtime && node scripts/check-no-python.mjs`. Put this checkpoint's installed-version, integrity and feature assertions in the existing registered `registry-artifacts-packed.test.js` case; if a new case name is needed, add `scripts/test-inventory.json` to the numbered set (12 files). Revert both manifests and the lock together on rollback.

#### Row 41 · 6A-H1-1 — Canonical JSON hardening and manifest guard — h2a

- Allowed verification: `V-H`.
- Source: `S6A:759`, tests 1 and 4 (PD-19). PR #455, which `S6A:759` calls unmerged, is merged on H `origin/main` (`70c68a21c`): it is no longer an external prerequisite, and its four invariants are GUARDs of the rows that touch its files.
- [ ] RED: `packages/h2a/test/registry-memory.test.js > canonical.ts rejects lone UTF-16 surrogates and matches the shared mandate vector for the instance and quorum authorities`.
- [ ] GUARD: `… > packages/track/package.json declares no @sentropic/engram and no @sentropic/cluster-mesh dependency`. It holds at H `e9ce1a8db`: the case is a GUARD with a mutation.
- Allowed (6, H): H:`packages/h2a/src/canonical.ts`, H:`packages/track/package.json`, H:`packages/h2a/test/helpers/engram-memory-contract.js`, H:`packages/h2a/test/registry-memory.test.js`, H:`packages/h2a/test/fixtures/h2a-mandate.vector.json` (new, the bytes of V-mandate), H:`scripts/test-inventory.json`. The two manifests that `S6A:759` lists for their pin lines are moved by row 40b.
- Gate: `npm --workspace @sentropic/h2a run build && node --input-type=module -e 'import {readInventory} from "./scripts/test-execution-evidence.mjs"; import {declarationFailures} from "./scripts/test-inventory.mjs"; const failures=declarationFailures(process.cwd(),readInventory(process.cwd())); if(failures.length) throw Error(failures.join("\n"));' && node --test packages/h2a/test/registry-memory.test.js && npm --workspace @sentropic/track test && npm run pack:h2a && node scripts/check-no-python.mjs`.

#### Row 42 · 6A-H1-2 — Registry and daemon binding — h2a

- Allowed verification: `V-H`.
- Source: `S6A:759`, tests 2 (daemon) and 3.
- [ ] RED: `packages/h2a/test/registry-memory.test.js > the daemon builds a valid connector context and a signed mandate from the local instance keys and targets the local cluster-mesh daemon over loopback`.
- [ ] RED: `packages/h2a/test/registry-bridge-lock-recovery.test.js > rebootstrap of a missing plugin lock and doctor repair keep options.memory in the default lock, with no regression of PR #455`.
- Allowed (10, H): H:`packages/h2a/src/registry/memory-provider.ts`, `…/sentropic-daemon.ts`, `…/bridge-lock.ts`, `…/descriptors.ts`, `…/cli-registry.ts`, `…/host-bootstrap.ts`, H:`packages/h2a/src/hosts/installation-doctor.ts`, H:`packages/h2a/test/registry-memory.test.js`, H:`packages/h2a/test/registry-bridge-lock-recovery.test.js`, H:`scripts/test-inventory.json`.
- Gate: `npm --workspace @sentropic/h2a run build && node --input-type=module -e 'import {readInventory} from "./scripts/test-execution-evidence.mjs"; import {declarationFailures} from "./scripts/test-inventory.mjs"; const failures=declarationFailures(process.cwd(),readInventory(process.cwd())); if(failures.length) throw Error(failures.join("\n"));' && node --test packages/h2a/test/registry-memory.test.js packages/h2a/test/registry-bridge-lock-recovery.test.js && npm run pack:h2a && node scripts/check-no-python.mjs`.

#### Row 43 · 6A-H1-3 — Mandate carrier on the central attachment — h2a

- Allowed verification: `V-H`.
- Source: `S6A:759`, test 2 (attachment).
- [ ] RED: `packages/h2a/test/registry-memory-round3.test.js > the central attachment sets the signed mandate in params._meta on shared-central and on the standalone fallback`.
- Allowed (7, H): H:`packages/h2a/src/runtime/mcp-central.ts`, `…/mcp-central-attachment.ts`, `…/mcp-central-shim.ts`, `…/mcp-central-policy.ts`, H:`packages/h2a/test/registry-memory-round3.test.js`, H:`packages/h2a/test/helpers/engram-memory-contract.js`, H:`scripts/test-inventory.json`.
- Gate: `npm --workspace @sentropic/h2a run build && node --input-type=module -e 'import {readInventory} from "./scripts/test-execution-evidence.mjs"; import {declarationFailures} from "./scripts/test-inventory.mjs"; const failures=declarationFailures(process.cwd(),readInventory(process.cwd())); if(failures.length) throw Error(failures.join("\n"));' && node --test packages/h2a/test/registry-memory-round3.test.js && npm test && npm --workspace @sentropic/track test && npm run pack:h2a && node scripts/check-no-python.mjs`.

#### Row 46 · 6A-H2-3 — `d11` ceremony on the mesh, before the removals — h2a

- Allowed verification: `V-H`, `V-H-FOCUS`.
- Source: `S6A:760`, tests 2 and 3. The row comes first among the three parts of `6A-H2`: at H `e9ce1a8db` the ceremony imports two of the modules that the lot removes (H `packages/h2a/src/runtime/memory/d11-ceremony.ts:509`, `./port-v1.js`, type-only; `:510-517`, `./promote-client.js`), so removing them before this migration would break the build (PD-20).
- [ ] RED: `packages/h2a/test/memory-d11-ceremony.test.js > the ceremony captures and admits through the cluster-mesh MCP with its two dedicated purposes, and refuses a self-certified verdict and a purpose-mixed recall token`.
- [ ] RED: `… > d11-ceremony.ts imports none of the nine legacy modules`.
- [ ] GUARD: `… > build-focus-dossier --check passes with the evidence corpus unchanged`.
- [ ] The evidence corpus is not edited. `S6A:760` asks for an update of it; at H `e9ce1a8db` the corpus is a frozen manifest of Git blobs at a reference commit (H `packages/h2a/focus-kit/test/fixtures/evidence-corpus.v1.json:2`, with one `blob` identifier per entry), unchanged since 2026-10-18 (`898b84330`), and its digest is pinned with a calibrated performance policy (H `packages/h2a/focus-kit/test/fixtures/evidence-performance-policy.v1.json:12`, checked at `packages/h2a/focus-kit/test/evidence-performance-browser.test.mjs:19`). An edit of a source file therefore does not stale it, and an edit of the corpus would freeze the policy again: that is not a side effect of this lot. If the check fails with the corpus unchanged, the row stops and h-cond decides the re-freeze in a lot of its own.
- Allowed (3, H): H:`packages/h2a/src/runtime/memory/d11-ceremony.ts`, H:`packages/h2a/test/memory-d11-ceremony.test.js`, H:`scripts/test-inventory.json`.
- Gate: `npm --workspace @sentropic/h2a run build && node --input-type=module -e 'import {readInventory} from "./scripts/test-execution-evidence.mjs"; import {declarationFailures} from "./scripts/test-inventory.mjs"; const failures=declarationFailures(process.cwd(),readInventory(process.cwd())); if(failures.length) throw Error(failures.join("\n"));' && node --test packages/h2a/test/memory-d11-ceremony.test.js && npm test && node scripts/build-focus-dossier.mjs --check && npm run pack:h2a && node scripts/check-no-python.mjs`.

#### Rows 44 and 45 · 6A-H2-1, 6A-H2-2 — Legacy memory modules removed — h2a

- Allowed verification: `V-H`, `V-H-FOCUS`.
- Source: `S6A:760`, the removals and test 1. The nine modules are `admit-client.ts`, `graphify-contracts-v2.vendored.ts`, `note-builder.ts`, `port-v1.ts`, `port-v2-adapter.ts`, `port-v2-compat.ts`, `preflight.ts`, `promote-client.ts` and `recall-client.ts` under H:`packages/h2a/src/runtime/memory/`; their nine tests are the eight `packages/h2a/test/memory-<module>.test.js` files and `memory-contracts-drift-guard.test.js`. All eighteen files exist at H `e9ce1a8db`.
- [ ] Implement: row 44 removes five modules and their five tests; row 45 the other four and their four tests. The partition follows the import closure read at H `e9ce1a8db`, importers first, so that the build passes after each row. No file outside the directory imports a legacy module once row 46 is merged. Inside it: `admit-client` imports `preflight` and `port-v1`; `recall-client` imports `note-builder` and `port-v1`; `port-v2-compat` imports `port-v2-adapter`, the vendored contracts and `port-v1`; `port-v2-adapter` imports the vendored contracts and `port-v1`; `preflight`, `note-builder` and `promote-client` import `port-v1`. Proposed: row 44 removes `admit-client`, `recall-client`, `port-v2-compat`, `port-v2-adapter` and `preflight`; row 45 removes `note-builder`, `promote-client`, the vendored contracts and `port-v1`. h-cond confirms it at branch start against the imports of the tests.
- [ ] RED (row 45; test 1 of `S6A:760`): `packages/h2a/test/memory-d11-ceremony.test.js > the nine legacy modules and their nine tests are gone, and no file of packages/h2a or packages/track imports an engram store or engine subpath`.
- [ ] GUARD (each row): the h2a build and the whole `node --test` suite pass, the staged payload has no dangling import, and the evidence corpus is unchanged (row 46).
- Allowed (11, H, row 44): five modules, five test files, H:`scripts/test-inventory.json`. Allowed (10, H, row 45): four modules, four test files, H:`packages/h2a/test/memory-d11-ceremony.test.js`, H:`scripts/test-inventory.json`.
- Gate, each row: `npm --workspace @sentropic/h2a run build && node --input-type=module -e 'import {readInventory} from "./scripts/test-execution-evidence.mjs"; import {declarationFailures} from "./scripts/test-inventory.mjs"; const failures=declarationFailures(process.cwd(),readInventory(process.cwd())); if(failures.length) throw Error(failures.join("\n"));' && npm test && node scripts/build-focus-dossier.mjs --check && npm run pack:h2a && node scripts/check-no-python.mjs`. This runs the whole Node suite, payload and unchanged-corpus guard after each removal.

#### Row 47 · 6A-H3-1 — Host admission, fail-closed rule and the banner — h2a

- Allowed verification: `V-H`.
- Source: `S6A:761`, test 1 (PD-09). Deltas `S6A-f` (SJ:579) and `S6A-j` (SJ:583): no switchover policy, no end date, no host masked.
- [ ] RED: `packages/h2a/test/mcp-central-hosts.test.js > the eight hosts are admitted under one normalized name each, a 503 fails the memory call closed with no local buffer, and the cached banner is rendered through the one banner helper`.
- [ ] Note (PD-22): `S6A:761`, test 1, and `S1:1692` both claim the recording of turns by the eight hosts. The session-front client has one definition: row 48 creates it, and the recording half of that test is the GREEN of row 48. Row 47 delivers the banner helper, the admission and the fail-closed rule that row 48 reuses (`S1:1692`).
- [ ] Where the targets of `S6A:761` went, so that none is dropped unsaid. Kept here: `hosts/plugin.ts`, `hosts/operator-notices.ts`, the banner helper `hosts/status-surface.ts`, `runtime/mcp-central-qualification.ts` and `registry/host-bootstrap.ts`. Moved with the recording half of test 1 (PD-22): `runtime/drumbeat/*` to row 48 and `packages/h2a-runtime` to row 48b. Moved with test 2: `runtime/mcp-central.ts` and the two `runtime/handover/` files to row 55; `registry/bridge-lock.ts` and `registry/descriptors.ts` to row 54, which admits `v2`. Obsolete, because the switchover policy and the masking of a host are withdrawn (`S6A-f`, SJ:579; `S6A-j`, SJ:583): `runtime/mcp-central-policy.ts`, `runtime/mcp-central-shim.ts` and `registry/cli-registry.ts` as targets of this lot. `packages/track/src/ingest/ingest.ts` is edited by no row unless the no-fallback case of row 48 needs it, which h-cond decides at that branch start.
- Allowed (7, H): H:`packages/h2a/src/hosts/operator-notices.ts`, H:`packages/h2a/src/hosts/status-surface.ts` (new), H:`packages/h2a/src/hosts/plugin.ts`, H:`packages/h2a/src/runtime/mcp-central-qualification.ts`, H:`packages/h2a/src/registry/host-bootstrap.ts`, H:`packages/h2a/test/mcp-central-hosts.test.js`, H:`scripts/test-inventory.json`.
- Gate: `npm --workspace @sentropic/h2a run build && node --input-type=module -e 'import {readInventory} from "./scripts/test-execution-evidence.mjs"; import {declarationFailures} from "./scripts/test-inventory.mjs"; const failures=declarationFailures(process.cwd(),readInventory(process.cwd())); if(failures.length) throw Error(failures.join("\n"));' && node --test packages/h2a/test/mcp-central-hosts.test.js && npm test && npm --workspace @sentropic/track test && npm run pack:h2a && node scripts/check-no-python.mjs`.

#### Row 47b · PIN-H1 — Exact pins of h2a on R-S1 and R-E2 — h2a

- Allowed verification: `V-H`.
- Source: the rule “Pin rows (H)”. It is row 40b at a later checkpoint: the same Allowed list (12, H), including H:`packages/h2a/test/install-skills-hosts.test.js`, the same rollback; its literal gate is below.
- [ ] GUARD: the installed cluster-mesh is the R-S1 version at its recorded integrity and serves `/memory/v1/session-front/ingest`, a route that R-S0 does not have; the installed engram is R-E2 or later, as the peer range of that cluster-mesh asks.
- [ ] Implement: the pins and the lock. Nothing else.
- Gate: `npm ci && node --input-type=module -e 'import {readInventory} from "./scripts/test-execution-evidence.mjs"; import {declarationFailures} from "./scripts/test-inventory.mjs"; const failures=declarationFailures(process.cwd(),readInventory(process.cwd())); if(failures.length) throw Error(failures.join("\n"));' && npm test && npm run pack:h2a && npm run pack:h2a-runtime && node scripts/check-no-python.mjs`. Put this checkpoint's installed-version, integrity and feature assertions in the existing registered `registry-artifacts-packed.test.js` case; if a new case name is needed, add `scripts/test-inventory.json` to the numbered set (12 files). Revert both manifests and the lock together on rollback.

#### Row 48 · 1-H1 — Hook generators and the session-front client — h2a

- Allowed verification: `V-H`.
- Source: `S1:1692`; `S1:471-475`. Deltas `S1-a` (SJ:518), `S1-e` (SJ:522), `S1-g` (SJ:524), `S1-j` (SJ:527).
- [ ] RED: `packages/h2a/test/plugin-session-front.test.js > a direct @sentropic/engram runtime import, or a *.test.ts under packages/h2a/src, fails the static guard`; `> a 503 writes no fallback memory file under ~/.h2a or .track`.
- [ ] RED: `… > the eight hosts note turns, tool results and mandates through the session-front ingest` (push hooks; the two `vibe` hooks; the opportunistic flush of `agy` and `muse` on a tool call, a session start and a drumbeat scan); `> a payload is printed only when a receipt carries one`; `> the banner is shown on the eight hosts`; `> the ordinal replay marker is kept in degraded mode`. The bounded poll of `agy` and `muse` runs in the runtime seats, a second package: it is row 48b (PD-28). In this row those two hosts note through the flush alone.
- [ ] GUARD: the four invariants of PR #455 hold (`S1:1692`).
- [ ] Level delivered: “note only” (SJ §4.2). The lot sends no `contextRequest`; by SJ:658, t2, nothing is then delivered. It sets no session-summary trigger (`S1-g`). `hostId` is the host's own identifier, checked at the hop (`S1-a`).
- Allowed (9, H): H:`packages/h2a/src/hosts/plugin.ts`, H:`packages/h2a/hooks/hooks.json`, H:`packages/h2a/hooks/vibe-post-agent.mjs`, H:`packages/h2a/hooks/vibe-post-tool.mjs` (new), H:`packages/h2a/src/hosts/session-front-client.ts` (new), H:`packages/h2a/src/hosts/operator-notices.ts`, H:`packages/h2a/src/hosts/status-surface.ts`, H:`packages/h2a/test/plugin-session-front.test.js` (new), H:`scripts/test-inventory.json`. The drumbeat module that the flush hooks into (`S6A:761` lists `runtime/drumbeat/*`) is named at branch start and joins this list, which has room for three more files.
- Gate: `npm --workspace @sentropic/h2a run build && node --input-type=module -e 'import {readInventory} from "./scripts/test-execution-evidence.mjs"; import {declarationFailures} from "./scripts/test-inventory.mjs"; const failures=declarationFailures(process.cwd(),readInventory(process.cwd())); if(failures.length) throw Error(failures.join("\n"));' && node --test packages/h2a/test/plugin-session-front.test.js && npm test && npm run pack:h2a && node scripts/check-no-python.mjs`.

#### Row 48b · 1-H1-P — Bounded poll of `agy` and `muse` in the runtime seats — h2a, `h2a-runtime`

- Allowed verification: `V-H`.
- Source: `S1:1692`, the part of its GREEN that runs in `packages/h2a-runtime`: a poll of the `session-db` every 5,000 ms, bounded to [1,000 ms, 30,000 ms], for the two hosts that offer no push hook. The sibling row lists no file of that package (PD-28). The row is off the path to P-LIVE, which runs on Claude Code.
- [ ] RED: `packages/h2a-runtime/src/session-front-poll.test.ts > a seat of agy or muse notes its new turns once per poll, inside the bounds, and never twice`.
- [ ] RED: `… > a 503 stops the poll from writing anywhere: no local file, and the ordinal replay marker is kept`.
- [ ] GUARD (SJ-4 t6 poll-parity): `packages/h2a/test/plugin-session-front.test.js > the poll and the flush of row 48 build the same envelope bytes for the same turn` — this row owns the poll-parity subcheck of SJ-4 t6, pending until row 48b (R3-2).
- [ ] Implement: `packages/h2a-runtime` does not depend on `packages/h2a` (H `packages/h2a-runtime/package.json:24-37`): the poll takes the note function as an injected port, which `packages/h2a` binds to the session-front client of row 48. No second client is written.
- Allowed (6, H): H:`packages/h2a-runtime/src/session-front-poll.ts` (new), H:`packages/h2a-runtime/src/session-front-poll.test.ts` (new), the seat module of `packages/h2a-runtime` that starts the poll (named at branch start), H:`packages/h2a/src/hosts/session-front-client.ts`, H:`packages/h2a/test/plugin-session-front.test.js`, H:`scripts/test-inventory.json`.
- Register the runtime test and its required scenarios before the gate (E `S1:1656`; H `scripts/test-inventory.json:2` demonstrates the root-level runtime path form). `h2a-runtime` has no npm test script (H `packages/h2a-runtime/package.json:64-67`); use its actual Vitest configuration from the repository root.
- Gate: `npm --workspace @sentropic/h2a run build && node --input-type=module -e 'import {readInventory} from "./scripts/test-execution-evidence.mjs"; import {declarationFailures} from "./scripts/test-inventory.mjs"; const failures=declarationFailures(process.cwd(),readInventory(process.cwd())); if(failures.length) throw Error(failures.join("\n"));' && node_modules/.bin/vitest run --config packages/h2a-runtime/vitest.config.ts packages/h2a-runtime/src/session-front-poll.test.ts && node --test packages/h2a/test/plugin-session-front.test.js && npm test && npm run pack:h2a && npm run pack:h2a-runtime && node scripts/check-no-python.mjs`. The focused result proves the new cases; `npm test` checks their registration and execution in the repository inventory. The two pack commands verify both changed package surfaces.

#### Row 49 · SJ-4 — Live on Claude Code — h2a

- Allowed verification: `V-H`.
- Source: SJ:662; SJ §3, §4.
- [ ] RED t1–t8: `session-context-claude.test.js > t1: option off makes no call and leaves the tool's output unchanged, and option on with the workspace journal off is silent`; `> t2: nothing changed: the hook prints 0 bytes`; `> t3: on the compaction signal the next call carries reset compaction and the tool's name for the signal, and the printed view holds the pinned request and the decisions in scope`; `> t4: a process restart sends reset restart`; `> t5: a 503 writes no local file and shows a banner`; `> t6: the note of an engram_memory_search call carries session_context_amendment unchanged, and the hook path builds the same bytes as the flush (codec/hook carriage here; the poll-parity subcheck of t6 stays pending until row 48b owns it)`; `> t7: a D18 refusal that carries readOnlyDelivery is printed, its watermark stored, and no error shown`; `> t8: contextRequest is sent only when the mandate carries memory:context:assemble or the session is unassigned`.
- [ ] Implement: the hook keeps the watermark in its own session state; it converts nothing (t6 reads V-codec; hook/codec carriage only here, poll-parity pending until row 48b).
- Allowed (7, H): H:`packages/h2a/src/hosts/session-front-client.ts`, H:`packages/h2a/src/hosts/plugin.ts`, H:`packages/h2a/src/hosts/session-context-state.ts` (new), H:`packages/h2a/hooks/hooks.json`, H:`packages/h2a/test/session-context-claude.test.js` (new), H:`packages/h2a/test/fixtures/session-context-wire-codec.vector.json` (new, the bytes of V-codec), H:`scripts/test-inventory.json`.
- Gate: `npm --workspace @sentropic/h2a run build && node --input-type=module -e 'import {readInventory} from "./scripts/test-execution-evidence.mjs"; import {declarationFailures} from "./scripts/test-inventory.mjs"; const failures=declarationFailures(process.cwd(),readInventory(process.cwd())); if(failures.length) throw Error(failures.join("\n"));' && node --test packages/h2a/test/session-context-claude.test.js && npm run pack:h2a && node scripts/check-no-python.mjs`.

#### Row 49b · P-LIVE — The live record, then release R-H1 — h2a, docs

- Allowed verification: `V-DOC`.
- Source: SJ:649 (“Lot `SJ-4` then gives the same proof live”); SJ §3, §4. The record of the live proof is a lot, so that it is written inside a branch and a scope; H `origin/main` has no `docs/evidence/` directory at `e9ce1a8db`.
- [ ] Precondition: the journal can be switched on for one test workspace through the store that the sentropic conductor named for row 40 (PD-31), and for that workspace only.
- [ ] Run (h-cond): on an installed stack, h2a at the head of row 49, cluster-mesh R-S1 and engram R-E2 as row 47b pinned them, one Claude Code session of the example of SJ §1.2.
- [ ] Record (Ember), in H:`docs/evidence/session-journal-live.md`: the versions and integrities of the installed stack; every step noted, compared with the tool's transcript; 0 bytes printed at a step where nothing changed; after a compaction, the printed view with the pinned request and the decisions, under the same session id; a `503` with its banner and no local file. A step the run could not exercise is recorded as `not covered`, with its reason. What the hooks of Claude Code allow is `unverified` in operation until this run (SJ:394).
- [ ] GUARD (manual documentary check): the record holds no session content beyond what the example of SJ §1.2 already publishes, no token and no path of the operator's account; the scan of row 6 has no equivalent in h2a, so h-cond reads the record before it is committed.
- Allowed (1, H): H:`docs/evidence/session-journal-live.md` (new).
- Gate: `git diff --check && git diff --name-only origin/main && node scripts/check-no-python.mjs`; compare the single evidence file with the conductor's recorded live run and its pinned versions, and record each documentary GUARD before R-H1. This gate does not manufacture a live run.

### Step 6 — Who reads, and the `v2` switch (h2a, sentropic)

#### Row 50 · SJ-7e — The launch receipt — h2a

- Allowed verification: `V-H`.
- Source: SJ:670; block E of SJ §12.
- [ ] RED t1–t4: `seat-launch-receipt.test.js > t1: h2a run signs, with a key of the instance it starts, an event envelope whose body is H2ASeatLaunchBodyV1, which validateH2AEnvelope accepts and verifyEnvelopeSignature verifies`; `> t2: the same signed envelope is sent as X-Sentropic-H2A-Launch on the journal call and set in params._meta on memory tool calls`; `> t3: a seat started outside h2a run has no receipt and sends none`; `> t4: the golden vector of the signed envelope is written`.
- [ ] Implement: writes **V-launch**, signed with a key generated for the test.
- Allowed (7, H): H:`packages/h2a/src/runtime/seat-launch-receipt.ts` (new), the file that implements `h2a run` (named at branch start), H:`packages/h2a/src/hosts/session-front-client.ts`, H:`packages/h2a/src/runtime/mcp-central-attachment.ts`, H:`packages/h2a/test/seat-launch-receipt.test.js` (new), H:`packages/h2a/test/fixtures/h2a-seat-launch.vector.json` (new), H:`scripts/test-inventory.json`.
- Gate: `npm --workspace @sentropic/h2a run build && node --input-type=module -e 'import {readInventory} from "./scripts/test-execution-evidence.mjs"; import {declarationFailures} from "./scripts/test-inventory.mjs"; const failures=declarationFailures(process.cwd(),readInventory(process.cwd())); if(failures.length) throw Error(failures.join("\n"));' && node --test packages/h2a/test/seat-launch-receipt.test.js && npm run pack:h2a && node scripts/check-no-python.mjs`.

#### Row 51 · SJ-7f — Who reads: the launch receipt and the content act — sentropic, `cluster-mesh`

- Allowed verification: `V-S`, `V-S-CM`.
- Source: SJ:671; SJ §2.6, §6.5. Delta `S4-f` (SJ:565): `ModelContentAuthorizationPolicyV1` is defined here.
- [ ] RED t1–t6: `tests/session-reader-facts.spec.ts > t1: a receipt that verifies gives reader_model_ref, and the vector of SJ-7e passes`; `> t2: no receipt, a failed signature, an unknown or revoked key, an instance that is not the caller, or a header that differs from _meta gives no reader fact, and the call is not refused`; `> t3: a model named in a tool argument, in the envelope or in the body is ignored`; `> t4: reader_is_local is true only for a provider llm-mesh lists as local`; `> t5: reader_content_authorized is true only when the policy of that tenant and workspace authorizes the provider, and the decision is logged`; `> t6: through the route an authorized external reader gets other-session text, screened`.
- Allowed (8, S): S:`packages/cluster-mesh/src/memory/session-reader-facts.ts` (new), S:`packages/cluster-mesh/src/memory/session-binding.ts`, S:`packages/cluster-mesh/src/memory/session-journal-route.ts`, S:`packages/cluster-mesh/tests/session-reader-facts.spec.ts` (new), S:`packages/cluster-mesh/tests/fixtures/h2a-seat-launch.vector.json` (new, the bytes of V-launch), and the three common files.
- Gate: `make scope-check ENV=test-cluster-mesh && make test-cluster-mesh SCOPE="tests/session-reader-facts.spec.ts" ENV=test-cluster-mesh && make typecheck-cluster-mesh ENV=test-cluster-mesh && make pack-cluster-mesh ENV=test-cluster-mesh && make check-no-python ENV=test-cluster-mesh`.

#### Row 52 · PIN-E3 — engram pin on R-E3 — sentropic

- Allowed verification: `V-S`, `V-S-CM`, `V-S-PACK`, `V-S-P1`.
- Source: the exception SJ calls `BRSJ-EX2` (SJ:647; proposed `BR10-EX2`), the pin part of `SJ-7b`. It is row 18b at the R-E3 version: the same Allowed list (12, S), the same rollback; its literal gate is below. Its GUARD is its own: the cold workspace resolves the wire codec `toSessionContextWire` (SJ:806), which only R-E3 and later versions export. Row 71 consumes this pin too.
- Gate: `make scope-check ENV=test-cluster-mesh && make test-cluster-mesh ENV=test-cluster-mesh && make typecheck-cluster-mesh ENV=test-cluster-mesh && make pack-cluster-mesh ENV=test-cluster-mesh && make -f packages/cluster-mesh/packaging.mk test-lazy-package ENV=test-cluster-mesh && make memory-l5-lint ENV=test-cluster-mesh && make check-no-python ENV=test-cluster-mesh`. The installed-peer/export guards execute in `tests/engram-memory/intent-carriage.spec.ts`; the partial-provider fixture executes in `tests/mcp-memory.spec.ts`. The hosted P1 qualification must pass, with a bounded companion if its inputs changed. Revert pin and locks together on rollback.

#### Row 53 · SJ-7b — The `v2` switch — sentropic, `cluster-mesh`

- Allowed verification: `V-S`, `V-S-CM`, `V-S-PACK`.
- Source: SJ:672. Deltas `S6A-e` (SJ:578) and `S6A-h` (SJ:581): this lot takes the place of `6A-S4`, with its tests and its gate.
- [ ] RED t1–t3 and t5: `tests/memory-search-v2-profile.spec.ts > t1: without a valid engram and sentropic co-signature v2 does not start and v1 is served unchanged`; `> t2: six tools are listed in v1 and in v2`; `> t3: with v2 off a session_context call is INVALID_SCHEMA`; `> t5: with v2 on the binding rides in session_binding to the provider, and a call with no session carrier has none`.
- [ ] The manifest/qualification half of t4 belongs to row 53c, on this row's head. Source tests prove t1–t3 and t5 here; t4 is not claimed until that companion passes. The two rows form a reviewed stack, with the same parent-diff and aggregate-ledger rules as the platform stack. No downstream row consumes a half-qualified switch.
- Allowed (7, S): S:`packages/cluster-mesh/src/integrations/mcp/memory-manifest.ts`, S:`packages/cluster-mesh/src/integrations/mcp/memory-compose.ts`, S:`packages/cluster-mesh/tests/memory-search-v2-profile.spec.ts` (new), S:`packages/cluster-mesh/tests/fixtures/memory-search-v2-receipt.json` (new, signed with test keys), and the three common files.
- Gate: `make scope-check ENV=test-cluster-mesh && make test-cluster-mesh SCOPE="tests/memory-search-v2-profile.spec.ts" ENV=test-cluster-mesh && make typecheck-cluster-mesh ENV=test-cluster-mesh && make pack-cluster-mesh ENV=test-cluster-mesh && make -f packages/cluster-mesh/packaging.mk test-lazy-package ENV=test-cluster-mesh && make check-no-python ENV=test-cluster-mesh`. Switch tests use test keys; no workspace is activated. Qualification half t4 is completed by row 53c.

#### Row 53c · P1-V2 — P1 verification or rotation for the `v2` switch — sentropic

- Allowed verification: `V-S`, `V-S-CM`, `V-S-P1`.
- Source: SJ:672 t4; Astra N1 and Carbon N2. Depends on row 53 as a reviewed stack parent and external X-P09. Builder: Neon; disk C; owning repository S.
- [ ] GUARD: first run `make memory-l5-verify ARTIFACT_MANIFEST=tools/memory-mcp-l5/artifacts/pre-candidate-manifest.json ENV=test-mcp-platform`. When the P1 inputs are unchanged, retain the incumbent manifest and record t4 as a GUARD on that digest. A cluster-mesh version bump alone is not a reason to rotate.
- [ ] If a P1 input changed, record the specific mismatch, align the broker's exact caret baseline and commit the final lock before using the one P1 rotation procedure of row 17b. It preserves history and generates a fresh identity; never pack different bytes onto the incumbent destination. A failure other than evidenced input drift is diagnosed, not erased by regeneration.
- Allowed (at most 10, S): the exact ten-path change set of row 17b, resolved for this generation. If no re-pin is needed, only S:`BRANCH.md` changes; all incumbent manifest, sidecar, snapshot and archive paths remain read-only Allowed inventory inputs. S:`packages/cluster-mesh/tests/engram-memory/qualification.mk` is a read-only gate input here, not an unlisted potential edit; a necessary change to it or another input is a bounded predecessor lot before this row runs.
- [ ] GUARD: the 22 P09 suites and the P1 qualification pass with executed evidence, and each rotation assertion passes if that branch was taken. Execute the separate P09 block below; `memory-mcp-qualify` alone proves none of that inventory.
- Gate: verify or rotate P1 as stated above, then `make scope-check SCOPE_BASE=origin/main ENV=test-memory-mcp && make memory-mcp-qualify E2_LOCK=/tmp/sentropic-docker.lock ENV=test-memory-mcp && make memory-l5-gate LOT=1 ARTIFACT_MANIFEST=tools/memory-mcp-l5/artifacts/pre-candidate-manifest.json ENV=test-mcp-platform && make check-no-python ENV=test-cluster-mesh`. Record all 22 P09 suite results, canonical digest, retained identity (when rotated) and the hosted qualification result before R-S2. No skipped suite passes t4.

##### P09 execution — row 53c, after external X-P09

The memory-MCP qualification is retained, but it selects `mcp-memory` (S `packages/cluster-mesh/tests/storage/cold-workspace.sh:98-105`) and does not execute P09. The retained inventory has 18 suites (S `tools/memory-mcp-l5/proof-catalog-v1.json:46`); the four additions and four required case IDs are specified by S `spec/evidence/memory-mcp-l5/p3-registry-v9-obligations.md:7-8`. The four added files are absent from the inspected S `origin/main`, and `make memory-l5-test LOT=3` is not an available shortcut (`Makefile:4998-5005` accepts LOT=1 only). **X-P09 is therefore a hard start condition of row 53c**: the later R2/R7a writer must supply those suites and their reviewed file-to-case mapping against the receiving published tuple. This plan neither creates those unrelated implementations nor waives SJ-7b t4.

- Allowed verification: `V-S-CM`, `V-S-PACK`, `V-S-P1`, S:`spec/evidence/memory-mcp-l5/p3-registry-v9-obligations.md`, and all 22 exact test paths below/as named by P09. The two packaging paths are S:`packages/cluster-mesh/tests/packaging/mcp-registry-consumer.spec.ts` and `mcp-tuple.spec.ts` in the same directory. All are read-only in row 53c. Preserve command output in its existing `BRANCH.md` evidence references and disposable qualification output, with the four required P09 case IDs; any persistent harness/inventory fix is a separately bounded predecessor, never an unlisted edit.
- Run the following literal commands as part of row 53c's gate. They name the 20 non-packaging files separately, then execute the enabled packaging lane for the remaining two. Required file/case results must show zero failed, skipped or todo cases, with the published package digests and current source/closure identity. Missing files or missing case-level evidence fail acceptance. Earlier P1, R2 or pre-change reports cannot substitute.

```sh
make test-mcp-platform SCOPE="tests/request-identity.test.ts" ENV=test-mcp-platform &&
make test-mcp-platform SCOPE="tests/wire-parity.test.ts" ENV=test-mcp-platform &&
make test-mcp-platform SCOPE="tests/registry-dispatch.test.ts" ENV=test-mcp-platform &&
make test-mcp-platform SCOPE="tests/capability-scopes.test.ts" ENV=test-mcp-platform &&
make test-mcp-platform SCOPE="tests/streamable-http.test.ts" ENV=test-mcp-platform &&
make test-mcp-platform SCOPE="tests/stdio.test.ts" ENV=test-mcp-platform &&
make test-mcp-platform SCOPE="tests/elicitation.test.ts" ENV=test-mcp-platform &&
make test-mcp-platform SCOPE="tests/writes.test.ts" ENV=test-mcp-platform &&
make test-mcp-platform SCOPE="tests/registry-remote-binding.test.ts" ENV=test-mcp-platform &&
make test-mcp-platform SCOPE="tests/hono.test.ts" ENV=test-mcp-platform &&
make test-mcp-platform SCOPE="tests/transport.test.ts" ENV=test-mcp-platform &&
make test-mcp-platform SCOPE="tests/remote-bound-dispatch.test.ts" ENV=test-mcp-platform &&
make test-cluster-mesh SCOPE="tests/mcp-composition.spec.ts" ENV=test-cluster-mesh &&
make test-cluster-mesh SCOPE="tests/verified-invocation-context.spec.ts" ENV=test-cluster-mesh &&
make test-cluster-mesh SCOPE="tests/mcp-registry.spec.ts" ENV=test-cluster-mesh &&
make test-cluster-mesh SCOPE="tests/integrations/mcp-surface.spec.ts" ENV=test-cluster-mesh &&
make test-cluster-mesh SCOPE="tests/loaders/mcp-platform.spec.ts" ENV=test-cluster-mesh &&
make test-cluster-mesh SCOPE="tests/registry/remote-adapter.spec.ts" ENV=test-cluster-mesh &&
make test-cluster-mesh SCOPE="tests/registry/host-bridge.spec.ts" ENV=test-cluster-mesh &&
make test-cluster-mesh SCOPE="tests/registry/host-bridge.e2e.spec.ts" ENV=test-cluster-mesh &&
make -f packages/cluster-mesh/packaging.mk test-lazy-package ENV=test-cluster-mesh &&
make typecheck ENV=test-typecheck &&
make check-no-python ENV=test-cluster-mesh
```

#### Row 53b · PIN-H2 — Exact pins of h2a on R-S2 and R-E3 — h2a

- Allowed verification: `V-H`.
- Source: the rule “Pin rows (H)”. It is row 40b at a later checkpoint: the same Allowed list (12, H), including H:`packages/h2a/test/install-skills-hosts.test.js`, the same rollback; its literal gate is below.
- [ ] GUARD: the installed cluster-mesh is the R-S2 version at its recorded integrity and lists the `v2` wire profile beside `v1`, which R-S1 does not; the installed engram is R-E3 or later.
- [ ] Implement: the pins and the lock. Nothing else.
- Gate: `npm ci && node --input-type=module -e 'import {readInventory} from "./scripts/test-execution-evidence.mjs"; import {declarationFailures} from "./scripts/test-inventory.mjs"; const failures=declarationFailures(process.cwd(),readInventory(process.cwd())); if(failures.length) throw Error(failures.join("\n"));' && npm test && npm run pack:h2a && npm run pack:h2a-runtime && node scripts/check-no-python.mjs`. Put this checkpoint's installed-version, integrity and feature assertions in the existing registered `registry-artifacts-packed.test.js` case; if a new case name is needed, add `scripts/test-inventory.json` to the numbered set (12 files). Revert both manifests and the lock together on rollback.

#### Row 54 · SJ-7d — h2a admits `v2` — h2a

- Allowed verification: `V-H`.
- Source: SJ:673; block E of SJ §12. Delta `S6A-f` (SJ:579).
- [ ] RED t1–t3: `registry-memory-v2.test.js > t1: validateBridgeLock and normalizeConfiguration admit sentropic.engram.memory-wire/v2 and still admit v1, and a contextToolSwitchover key is refused`; `> t2: the attachment sets params._meta['sentropic.h2a.session'] on memory tool calls with exactly the two fields of SessionCallerRefV1`; `> t3: the four failure modes hardened by PR #455 stay refused`.
- [ ] GUARD (V-session): `… > the value the attachment sets equals the bytes of the vector that row 26 wrote, key for key`. The carrier is written here and read in sentropic by a row built earlier: the vector is what proves the two agree.
- Allowed (6, H): H:`packages/h2a/src/registry/bridge-lock.ts`, H:`packages/h2a/src/registry/descriptors.ts`, H:`packages/h2a/src/runtime/mcp-central-attachment.ts`, H:`packages/h2a/test/registry-memory-v2.test.js` (new), H:`packages/h2a/test/fixtures/h2a-session-carrier.vector.json` (new, the bytes of V-session), H:`scripts/test-inventory.json`.
- Gate: `npm --workspace @sentropic/h2a run build && node --input-type=module -e 'import {readInventory} from "./scripts/test-execution-evidence.mjs"; import {declarationFailures} from "./scripts/test-inventory.mjs"; const failures=declarationFailures(process.cwd(),readInventory(process.cwd())); if(failures.length) throw Error(failures.join("\n"));' && node --test packages/h2a/test/registry-memory-v2.test.js && npm run pack:h2a && node scripts/check-no-python.mjs`. The row starts on the pins of row 53b.

#### Row 55 · 6A-H3-2 — Six tools on eight hosts, `v1` and `v2` — h2a

- Allowed verification: `V-H`.
- Source: `S6A:761`, test 2, as `S6A-j` (SJ:583) and `S6A-f` (SJ:579) rewrite it.
- [ ] RED: `packages/h2a/test/registry-memory-round3.test.js > every host lists six tools in v1 and in v2, session_context is accepted on every host with v2 on, and no host is masked`.
- [ ] GUARD: `… > no 409 integrity mismatch, no degraded catalogue and no tool unavailable on generation`.
- Allowed (5, H): H:`packages/h2a/src/runtime/mcp-central.ts`, H:`packages/h2a/src/runtime/handover/shim-bridge.js`, H:`packages/h2a/src/runtime/handover/catalogue.js`, H:`packages/h2a/test/registry-memory-round3.test.js`, H:`scripts/test-inventory.json`.
- Builder: Neon. The two handover files carry invariants of PR #455 (`S1:1692` names `shim-bridge.js:49,309-387`), which is a host path, not a test-only change.
- Gate: `npm --workspace @sentropic/h2a run build && node --input-type=module -e 'import {readInventory} from "./scripts/test-execution-evidence.mjs"; import {declarationFailures} from "./scripts/test-inventory.mjs"; const failures=declarationFailures(process.cwd(),readInventory(process.cwd())); if(failures.length) throw Error(failures.join("\n"));' && node --test packages/h2a/test/registry-memory-round3.test.js && npm test && npm --workspace @sentropic/track test && npm run pack:h2a && node scripts/check-no-python.mjs`.

#### Row 56 · SJ-8 — CLI switch, and hosts without a signal — h2a

- Allowed verification: `V-H`.
- Source: SJ:674; SJ §2.5, §3.4, §4.4.
- [ ] RED t1–t5: `session-context-switch.test.js > t1: a new session id with the same role and worktree, on Codex, gets the full view at the inherited version, the agent's selector included, with no hand-written note`; `> t2: another role, or no role, inherits nothing`; `> t3: a host with no compaction signal runs 60 turns, sends no reset and gets no full view`; `> t4: on each of the eight hosts option off changes nothing`; `> t5: on each of the eight hosts the note of a search call carries the amendment unchanged`.
- Allowed (5, H): H:`packages/h2a/src/hosts/plugin.ts`, H:`packages/h2a/src/hosts/session-front-client.ts`, H:`packages/h2a/src/hosts/session-context-state.ts`, H:`packages/h2a/test/session-context-switch.test.js` (new), H:`scripts/test-inventory.json`.
- Gate: `npm --workspace @sentropic/h2a run build && node --input-type=module -e 'import {readInventory} from "./scripts/test-execution-evidence.mjs"; import {declarationFailures} from "./scripts/test-inventory.mjs"; const failures=declarationFailures(process.cwd(),readInventory(process.cwd())); if(failures.length) throw Error(failures.join("\n"));' && node --test packages/h2a/test/session-context-switch.test.js && npm run pack:h2a && node scripts/check-no-python.mjs`. The per-host facts of SJ §4.4 stay `unverified` in operation; the cases run on the host adapters.

### Step 7 — Registry, roles and dreaming (engram)

This step waits for no row of S or H. It follows step 4 in the engram serial order; rows 57 and 58 move before step 4 when R-P1 is late. R-E4 is cut when rows 57 to 66 are green; rows 67 to 70, the dreaming rows, follow and ship in R-E5 (PD-27).

#### Row 57 · Lot 0.3 — SemVer gate and composition — engram

- Allowed verification: `V-E`.
- Source: `S0:892-897`. No row of SJ §8 changes this lot.
- [ ] RED: `tests/metamodel-versioning-and-composition.test.ts > the SemVer gate refuses an additive change under a patch bump, a breaking change under a minor bump, an unmapped breaking rename and a duplicate version with another digest, and accepts the matching bumps` (`S0:894`).
- [ ] RED: `… > a cross-lineage composition accepts exact pinned versions and refuses a floating version, a wrong digest, a redefined external type and a cycle` (`S0:895`).
- Allowed (4, E): E:`src/metamodel/semver-gate.ts` (new), E:`src/metamodel/composition.ts` (new), E:`src/profile-bundle.ts`, E:`tests/metamodel-versioning-and-composition.test.ts` (new).
- Gate: `npx --no-install vitest run tests/metamodel-versioning-and-composition.test.ts && npm run lint && npm run build && npm run test:g0 && node scripts/check-no-python.mjs` (`S0:897`).

#### Row 58 · Lot 0.4 — Lineage registry store — engram

- Allowed verification: `V-E`, `V-E-PACK`.
- Source: `S0:899-905`.
- [ ] RED: `tests/lineage-registry.test.ts > the registry starts with archi@1 locked against any write and accepts a distinct archi@2` (`S0:901`); `> a signed mandate with the matching registration right registers a track or an h2a template, and a bare mandate id, an expired or tampered signature, a session-only right or a cross-author write is refused` (`S0:902`); `> three versions of one template coexist and resolve by lineage, id, version and digest` (`S0:903`).
- [ ] Implement: the new public subpath `./lineage-registry`. Mandate signatures are verified with keys generated for the test.
- Allowed (8, E): E:`src/lineage-registry/store.ts` (new), E:`src/lineage-registry/ports.ts` (new), E:`src/index.ts`, E:`package.json`, E:`tsup.config.ts`, E:`tests/lineage-registry.test.ts` (new), E:`scripts/substrate-tarball-acceptance.mjs`, E:`scripts/fixtures/packed-surface/check-esm.mjs`.
- Gate: `npx --no-install vitest run tests/lineage-registry.test.ts && npm run lint && npm run build && npm run test:substrate-tarball && GRAPHIFY_PACKED_SKIP_BUILD=1 ./scripts/check-packed-surface.sh && node scripts/check-no-python.mjs`.

#### Row 59 · SJ-15 — Scope, ontologies and mandate in the query — engram

- Allowed verification: `V-E`.
- Source: SJ:681; SJ §2.2, §2.5. It needs the registry store of row 58 (PD-08).
- [ ] RED t1–t4: `tests/session-context-scope.test.ts > t1: loop on a request sets objectiveLoopId and trackScope in the next version, the same loop again gives no new version, and no loop gives an empty scope`; `> t2: ontologies lists the templates the registry holds for the workspace, and one more registered gives the next version`; `> t3: tier 3 of the view lists the Track items of the scope`; `> t4: roleRef and mandateDigest come from the binding, a changed mandate gives the next version, two sessions of one role on one worktree have one queryId, and with no role each session has its own`.
- Allowed (4, E): E:`src/session-context/engine.ts`, E:`src/session-front/journal.ts`, E:`src/session-context/view.ts`, E:`tests/session-context-scope.test.ts` (new).
- Gate: `npx --no-install vitest run tests/session-context-scope.test.ts && npm run lint && npm run build && node scripts/check-no-python.mjs`.

#### Row 60 · Lot 0.5 — Template-driven projection — engram

- Allowed verification: `V-E`.
- Source: `S0:907-913`.
- [ ] RED: `tests/template-driven-projection.test.ts > a synthetic Track template gives framed events, the head, both snapshots and the link file, without proposed writes or harness decisions, under the owner-table policy and the deny-list, and regenerates over a tampered file` (`S0:909`); `> the unmodified serializer produces the projection of a v2 template` (`S0:910`); `> the .h2a overlay projection is tighten-only, refuses a delta that touches .track or a Track template reference, and never replaces a recorded Track verdict` (`S0:911`).
- Allowed (3, E): E:`src/lineage-registry/projection.ts` (new), E:`src/lineage-registry/verdict-ledger.ts` (new), E:`tests/template-driven-projection.test.ts` (new).
- Forbidden: a write under this repository's own `.track/` or `.h2a/`; the tests project into a temporary directory.
- Gate: `npx --no-install vitest run tests/template-driven-projection.test.ts && npm run lint && npm run build && node scripts/check-no-python.mjs`.

#### Row 61 · 4-E1 — `h2a` lineage registration gate — engram

- Allowed verification: `V-E`, `V-E-L0`.
- Source: `S4:912`; S0 lots 0.1 to 0.5 (`S4:910`). Delta `S4-a` (SJ:560): the freeze on the old Spec 2 ends.
- [ ] RED: `tests/h2a-lineage-registration.test.ts > the two h2a templates register when signed by PRINCIPAL or EXECUTIF with the registration right, and CONDUCTOR, AGENTS, an engram self-write and a Track caller are refused`.
- [ ] RED: `… > archi@1 stays byte-identical, the read-only Track pins and the four external Track skill anchors are accepted, and a Track type redefinition or a cyclic skill graph is refused`.
- [ ] RED: `… > declared capabilities give no authority, and a subagent inherits the AGENTS role by the last tilde`.
- Allowed (3, E): E:`src/h2a-lineage/contracts.ts` (new), E:`src/h2a-lineage/upsert-role-ontology.ts` (new), E:`tests/h2a-lineage-registration.test.ts` (new).
- Gate: `npm --prefix engram-memory run build && npx --no-install vitest run tests/h2a-lineage-registration.test.ts tests/memory-neutrality.test.ts && npm run lint && npm run build && npm run test:g0 && node scripts/check-no-python.mjs` (`S4:912`).

#### Row 62 · 4-E2 — Proactive role analyzer — engram

- Allowed verification: `V-E`, `V-E-L0`.
- Source: `S4:913`. Deltas `S4-c` (SJ:562): role detection reads the Spec 1 events of the one journal, with no flat window of 32 raw events and no second logger; `S4-e` (SJ:564): the wait for the dossier ends.
- [ ] RED: `tests/h2a-proactive-role-analyzer.test.ts > a raw event with a null mandate is committed first, queues the analysis, and gives an advisory proposal by deterministic scoring, in under 25 ms and with no model call`.
- [ ] RED: `… > self-declared capabilities do not change the score, a subagent session is clamped to AGENTS within its parent's scopes, and an unauthenticated activity never proposes PRINCIPAL or EXECUTIF`.
- [ ] RED: `… > with the stage-2 opt-in an ambiguous top-2 margin calls the injected tie-break port when it is healthy, and falls back to stage 1 with no retry otherwise`.
- [ ] GUARD: `… > creating a proposal never changes a role binding, a mandate or a D18 access`.
- Allowed (3, E): E:`src/h2a-lineage/proactive-role-analyzer.ts` (new), E:`src/h2a-lineage/role-decision-port.ts` (new), E:`tests/h2a-proactive-role-analyzer.test.ts` (new).
- Gate: `npm --prefix engram-memory run build && npx --no-install vitest run tests/h2a-proactive-role-analyzer.test.ts tests/memory-neutrality.test.ts && npm run lint && npm run build && node scripts/check-no-python.mjs`.

#### Row 63 · SJ-16e — Signal that a role proposal is ready — engram

- Allowed verification: `V-E`.
- Source: SJ:682. Delta `S1-i` (SJ:526).
- [ ] RED t1–t2: `tests/session-proactive-role-signal.test.ts > t1: a proposal ready for the session's workspace is named once, in pendingProactiveRoleProposalId of the next receipt`; `> t2: with none ready the field is absent, never null`.
- Allowed (3, E): E:`src/session-front/ingest.ts`, E:`src/session-front-contracts.ts`, E:`tests/session-proactive-role-signal.test.ts` (new).
- Gate: `npx --no-install vitest run tests/session-proactive-role-signal.test.ts && npm run lint && npm run build && node scripts/check-no-python.mjs`.

#### Row 64 · 4-E3 — Harness decision ledger and overlay serializer — engram

- Allowed verification: `V-E`.
- Source: `S4:914`. Deltas `S4-d` (SJ:563), `S4-h` (SJ:567): the signed `D18` policy is checked here and consumed by rows 31 and 79.
- [ ] RED: `tests/h2a-harness-overlay-serializer.test.ts > a mandated harness decision is recorded first and gives byte-deterministic JCS files for the repo, workspace and worktree overlays and the link file`.
- [ ] RED: `… > a relaxation of a forbidden path, a scope glob, an autonomy ceiling, a verification category, D18 or D10 is refused, CONTROL may not sign the two repo policies, and contradictory wrappers escalate`.
- [ ] RED: `… > a delta that references .track or a Track template is refused, a path escape is refused, the deny-list screens, and regeneration overwrites a tampered file`.
- Allowed (3, E): E:`src/h2a-lineage/harness-overlay-serializer.ts` (new), E:`src/h2a-lineage/precedence-lattice.ts` (new), E:`tests/h2a-harness-overlay-serializer.test.ts` (new).
- Gate: `npx --no-install vitest run tests/h2a-harness-overlay-serializer.test.ts && npm run lint && npm run build && node scripts/check-no-python.mjs`.

#### Row 65 · 4-E4a — `./h2a-lineage` subpath — engram

- Allowed verification: `V-E`, `V-E-L0`, `V-E-PACK`.
- Source: `S4:915`. Delta `S4-e` (SJ:564): the mirrored route `GET /memory/v1/h2a/proactive-role-proposals` is no longer marked as waiting for a dossier.
- [ ] RED: `tests/h2a-lineage-subpath-export.test.ts > the packed tarball exports ./h2a-lineage with its types, and the L0 closure imports nothing from src/h2a-lineage`.
- [ ] GUARD: `tests/h2a-lineage-subpath-export.test.ts > the three routes of S4:915 are mirrored in S6A section 2.2 and the engram/cluster-mesh contract note`. The test reads both numbered documentary paths; the gate executes it.
- Allowed (8, E): E:`src/h2a-lineage/index.ts` (new), E:`package.json`, E:`tsup.config.ts`, E:`tests/h2a-lineage-subpath-export.test.ts` (new), E:`spec/SPEC_ENGRAM_CLUSTER_MESH_MEMORY_ACCESS_AND_MCP_WIRING.md`, E:`spec/memory/contracts/engram-cluster-mesh.md`, E:`scripts/substrate-tarball-acceptance.mjs`, E:`scripts/fixtures/packed-surface/check-esm.mjs`.
- Gate: `npm --prefix engram-memory run build && npx --no-install vitest run tests/h2a-lineage-subpath-export.test.ts tests/memory-neutrality.test.ts && npm run lint && npm run build && npm run test:substrate-tarball && GRAPHIFY_PACKED_SKIP_BUILD=1 ./scripts/check-packed-surface.sh && node scripts/check-no-python.mjs`.

#### Row 66 · 4-E4b — The `rules` slice — engram (delta lot)

- Allowed verification: `V-E`.
- Source: `S4:916`, as `S4-g` (SJ:566) and `S4-b` (SJ:561) rewrite it: unblocked, and it depends on `SJ-1c` (PD-15).
- [ ] RED: `tests/h2a-context-slices.test.ts > the role, its allowed activities and the harness rules in force are items of the rules slice of the view`.
- [ ] RED: `… > they come in full after a reset and as the difference otherwise`.
- [ ] GUARD: `… > no wire container named roleConsciousnessSlice or harnessEffectiveRules exists`.
- Allowed (4, E): E:`src/h2a-lineage/context-slice-provider.ts` (new), E:`src/session-context/view.ts`, E:`src/h2a-lineage/index.ts`, E:`tests/h2a-context-slices.test.ts` (new).
- Gate: `npx --no-install vitest run tests/h2a-context-slices.test.ts tests/session-context-view.test.ts && npm run lint && npm run build && node scripts/check-no-python.mjs`. Checkpoint R-E4 follows: it holds rows 57 to 66.

#### Row 67 · 3-E1 — Dreaming contracts and triggers — engram

- Allowed verification: `V-E`, `V-E-L0`.
- Source: `S3:1020`. Deltas `S3-i` (SJ:546), `S3-j` (SJ:547), `S3-k` (SJ:548): the triggers count journal activity and read no session summary.
- [ ] RED: `tests/dreaming-triggers-and-catchup.test.ts > the local triggers evaluate over an injected clock, keep the saturation hysteresis and need no sync barrier`.
- [ ] RED (`S3-j`): `… > mid-day fires on 24 noted turns, on 65,536 bytes of noted turn text, or on one closed session since the cursor`.
- [ ] RED (`S3-k`): `… > context-saturation fires once the event is recorded and the extraction sweep is scheduled`.
- [ ] RED: `… > the remote triggers fail closed without a valid barrier receipt`; `> missed local and remote windows coalesce into one catch-up pass each, and a span with no event gives an empty-window receipt with no model call`.
- [ ] GUARD: `tests/memory-neutrality.test.ts > the dreaming modules import no @sentropic package, no AI SDK and read no API-key variable`.
- Allowed (6, E): E:`engram-memory/dreaming-contracts.ts` (new), E:`engram-memory/dreaming-triggers.ts` (new), E:`engram-memory/tsconfig.json`, E:`engram-memory/index.ts`, E:`tests/dreaming-triggers-and-catchup.test.ts` (new), E:`tests/memory-neutrality.test.ts`.
- Gate: `npm --prefix engram-memory run build && npx --no-install vitest run tests/dreaming-triggers-and-catchup.test.ts tests/memory-neutrality.test.ts && npm run lint && npm run build && node scripts/check-no-python.mjs`.

#### Row 68 · 3-E2 — Two-tier shadow engine — engram

- Allowed verification: `V-E`, `V-E-L0`.
- Source: `S3:1021`. No row of SJ §8 changes its cases.
- [ ] RED: `tests/dreaming-d26-shadow-calibration.test.ts > a verifier of the drafter's model family, or of an unknown one, is refused, and a single-family draft is quarantined`.
- [ ] RED: `… > 20 of 20 confirmed stays below the threshold, 24 of 24 with the required passes, windows and canaries reaches it, and an error on a cited path without verified concordance does not count`.
- [ ] RED: `… > one canary false pass, one boundary violation or a family rotation demotes the gate and blocks every non-shadow emission`.
- Allowed (5, E): E:`engram-memory/dreaming-shadow.ts` (new), E:`engram-memory/tsconfig.json`, E:`engram-memory/index.ts`, E:`tests/dreaming-d26-shadow-calibration.test.ts` (new), E:`tests/memory-neutrality.test.ts`.
- Gate: `npm --prefix engram-memory run build && npx --no-install vitest run tests/dreaming-d26-shadow-calibration.test.ts tests/memory-neutrality.test.ts && npm run lint && npm run build && node scripts/check-no-python.mjs`.

#### Row 69 · 3-E3 — Forgotten permanent facts and promotion routers — engram

- Allowed verification: `V-E`, `V-E-L0`, `V-E-PACK`.
- Source: `S3:1022`. Deltas `S3-c` (SJ:540), `S3-d` (SJ:541), `S3-e` (SJ:542), `S3-f` (SJ:543), `S3-g` (SJ:544), `S3-l` (SJ:549), `S3-m` (SJ:550): the lot waits for row 10 where it waited for a Spec 2 lot.
- [ ] RED (test 1, rewritten by the deltas): `tests/dreaming-promotion-and-d23-recall.test.ts > selectForgottenPermanentFactsV1 marks only accepted_current permanent records absent from the last 8 deliveries of the session, recomputed from the stored requests`; `> a mark carries no class weight and no projectedContextTrigger, uses Sha256Digest, is a reference without the content act, is withheld without a memory identity, and goes at once on tombstone or withdraw`.
- [ ] RED (test 2, unchanged): `… > an overwrite of a Track-controlled record is refused, eligibility is read from the Track template with no list of Track types, a self-promotion fails closed, a rejected proposal is never repaired and stays blocked by its extinction marker, and a template evolution request names Track as sole accepting authority`.
- Allowed (11, E): E:`engram-memory/dreaming-promotion.ts` (new), E:`src/dreaming/promotion-contracts.ts` (new), E:`src/dreaming/index.ts` (new), E:`package.json`, E:`tsup.config.ts`, E:`engram-memory/tsconfig.json`, E:`engram-memory/index.ts`, E:`tests/dreaming-promotion-and-d23-recall.test.ts` (new), E:`tests/memory-neutrality.test.ts`, E:`scripts/substrate-tarball-acceptance.mjs`, E:`scripts/fixtures/packed-surface/check-esm.mjs`.
- Gate: `npm --prefix engram-memory run build && npx --no-install vitest run tests/dreaming-promotion-and-d23-recall.test.ts tests/memory-neutrality.test.ts && npm run lint && npm run build && npm run test:substrate-tarball && GRAPHIFY_PACKED_SKIP_BUILD=1 ./scripts/check-packed-surface.sh && node scripts/check-no-python.mjs`.
- Stop and split before accepting any persistent registry drift: adding `./dreaming` changes the shared ESM graph (E `tsup.config.ts:56-79`). If the build moves an asset digest in E:`registry/entries.v1.json`, add that file and E:`registry/publisher-assets.v1.json` together; 13 exceeds 12. Split into the contract/subpath export with its packed-surface guards first, then the L0 promotion module and its adapter/tests. Each child retains its affected REDs, the neutrality and tarball gates, and the applicable registry pair; row 70 and R-E5 wait for both. This is the same stop-and-split rule as row 4, not permission to restore changed asset digests.

#### Row 70 · SJ-13 — Dreaming hand-off — engram

- Allowed verification: `V-E`.
- Source: SJ:679; SJ §7. It needs the gate state of row 68 for t2 (PD-08).
- [ ] RED t1–t3: `tests/session-dreaming-recall.test.ts > t1: a permanent accepted record absent from the last 8 deliveries and within reach of the session's files is marked and arrives in the next diff as an item authoredBy dreaming`; `> t2: a lesson drafted by a model before its threshold never arrives`; `> t3: no memory identity, no recall`.
- Allowed (3, E): E:`src/session-context/engine.ts`, E:`src/dreaming/index.ts`, E:`tests/session-dreaming-recall.test.ts` (new).
- The test file imports nothing from `engram-memory/`: this lot does not list the neutrality suite (“Tests that reach L0”).
- Gate: `npx --no-install vitest run tests/session-dreaming-recall.test.ts && npm run lint && npm run build && node scripts/check-no-python.mjs`. Checkpoint R-E5 follows: it holds rows 67 to 70. No row of this plan pins it; in an installed stack the hand-off starts to work when the sentropic lots of S3 pin an engram that holds these rows and run the dreaming passes (`S3:1016`), which is `not covered` here.

### Step 8 — Annotation service, gate A, levels, role proposals and the `D18` delivery at the route (sentropic, h2a)

#### Row 71 · 1-S2 — Extraction bridge on llm-mesh — sentropic, `cluster-mesh`

- Allowed verification: `V-S`, `V-S-CM`.
- Source: `S1:1684`. It reads the extraction pipeline of row 37 through the pin of row 52. External: chat-mesh lot C2a, the metering sink; at S `d6093d568` `RouteMeteringSink` appears in no file under `packages/llm-mesh/src/`, so it is not delivered. The mesh range of the sibling row, `>=0.38.0 <0.39.0`, is read `>=0.38.0 <0.40.0` (PD-23); the lot itself changes no range: row 71b does.
- [ ] RED: `packages/cluster-mesh/tests/memory-llm-mesh-extraction.spec.ts > a direct provider HTTP call, a missing verified routing subject, a missing metering sink or an injected host SDK client fails`; `> chat-server imports no engram module`.
- [ ] RED: `… > a bounded queue routes the three extraction backends and the D7 triage through llm-mesh only, records the attempt reference and calls recordExtraction in process`.
- Allowed (5, S): S:`packages/cluster-mesh/src/compose/memory/llm-extraction-bridge.ts` (new), S:`packages/cluster-mesh/tests/memory-llm-mesh-extraction.spec.ts` (new), and the three common files.
- Gate: `make scope-check ENV=test-cluster-mesh && make test-cluster-mesh SCOPE="tests/memory-llm-mesh-extraction.spec.ts" ENV=test-cluster-mesh && make typecheck-cluster-mesh ENV=test-cluster-mesh && make pack-cluster-mesh ENV=test-cluster-mesh && make check-no-python ENV=test-cluster-mesh`.

#### Row 71b · SJ-9-L1 — llm-mesh range and all range assertions — sentropic

- Allowed verification: `V-S`, `V-S-CM`, `V-S-PACK`.
- Source: NER r5 §§6.2–7 (PD-33). After row 71 and the packed X-NER handoff, the sentropic conductor coordinates this row with `S21a`/`S21b` and assigns one writer for the range and topology assertions. Use the recorded 0.39.x candidate alongside the existing supported tuples.
- [ ] RED: `packages/cluster-mesh/tests/packaging/tuple-skew.spec.ts > the mesh range admits 0.39.0 and 0.39.9 and still refuses 0.40.0, 0.19.1 and a prerelease`. Today the range is `0.19.2 || >=0.22.0 <0.39.0` and the suite refuses `0.39.0` (S `packages/cluster-mesh/src/modules/catalog.ts:19`; S `packages/cluster-mesh/tests/packaging/tuple-skew.spec.ts:13`, `:23`).
- [ ] RED: all registry, topology, speech and packed-install assertions admit `0.39.0` and `0.39.9`, retain the existing lower bounds and legacy `0.19.2` exception, and refuse `0.40.0` and prereleases. Assertions remain independent literals, not imports of the production range.
- [ ] Implement: widen `LLM_MESH_RANGE` and `LLM_MESH_SPEECH_RANGE` to `<0.40.0`, the manifest peer range and every affected test/fixture together. The six additional paths are evidenced by S `tests/modules/registry.spec.ts:117,137`, `tests/modules/topology-ranges.spec.ts:76`, `tests/packaging/optional-install.spec.ts:34`, `tests/packaging/skew-invariants.spec.ts:28`, `tests/speech-peer.spec.ts:6,15`, and `tests/fixtures/train.ts:9`, all relative to `packages/cluster-mesh/`. Do not replace historical refusal fixtures indiscriminately.
- Allowed (12, S): S:`packages/cluster-mesh/src/modules/catalog.ts`, S:`packages/cluster-mesh/tests/packaging/tuple-skew.spec.ts`, S:`packages/cluster-mesh/tests/modules/registry.spec.ts`, S:`packages/cluster-mesh/tests/modules/topology-ranges.spec.ts`, S:`packages/cluster-mesh/tests/packaging/optional-install.spec.ts`, S:`packages/cluster-mesh/tests/packaging/skew-invariants.spec.ts`, S:`packages/cluster-mesh/tests/packaging/skew-invariants.ts`, S:`packages/cluster-mesh/tests/speech-peer.spec.ts`, S:`packages/cluster-mesh/tests/fixtures/train.ts`, and the three common files.
- Gate: `make scope-check ENV=test-cluster-mesh && make test-cluster-mesh ENV=test-cluster-mesh && make typecheck-cluster-mesh ENV=test-cluster-mesh && make pack-cluster-mesh ENV=test-cluster-mesh && make -f packages/cluster-mesh/packaging.mk test-lazy-package ENV=test-cluster-mesh && make check-no-python ENV=test-cluster-mesh`. Use the matched X-NER archives for the candidate case in the packed lane. Require executed range, topology and `optional-install` assertions for the candidate and retained supported tuples.

#### Row 71c · SJ-9-L2 — The NER catalogue leaf and loader — sentropic

- Allowed verification: `V-S`, `V-S-CM`, `V-S-PACK`.
- Source: the same binding input and X-NER as row 71b; Carbon round-2 N3 and Astra N4. Depends on row 71b. The range is already admitted; this row adds no NER contract.
- [ ] RED: `packages/cluster-mesh/tests/packaging/types-and-bundlers.spec.ts > llm-mesh/ner is registered, imports from the installed 0.39.0 provider with declarations, and emits one export-star leaf with no bundled provider implementation`. Reconcile the receiving leaf count with the existing 18 at S `packages/cluster-mesh/tests/packaging/types-and-bundlers.spec.ts:57-72`; this row adds exactly one, rather than resetting another plan's count to 19.
- [ ] GUARD in the same suite: no `onnxruntime-node`, tokenizer dependency, local `Ner*`/`PinnedOnnxArtifactManifest*` declaration, or `/ner/host` catalogue entry. Native execution stays in `apps/ner-host`; imports use the one contract of llm-mesh.
- Allowed (8, S): S:`packages/cluster-mesh/src/modules/contracts.ts`, S:`packages/cluster-mesh/src/modules/catalog.ts`, S:`packages/cluster-mesh/src/integrations/llm-mesh/ner.ts` (new), S:`packages/cluster-mesh/src/loaders/llm-mesh/ner.ts` (new), S:`packages/cluster-mesh/tests/packaging/types-and-bundlers.spec.ts`, and the three common files. The manifest gains both exports. The selected consumer inventories are read-only in the shared S packaging set; if X-NER has not supplied a matching selected tuple, add `tests/packaging/fixtures/selected/package.json` and `package-lock.json` (both under S:`packages/cluster-mesh/`, total 10) and regenerate them with `make -f packages/cluster-mesh/packaging.mk refresh-lazy-package-lock ENV=test-cluster-mesh` before the gate.
- Gate: `make scope-check ENV=test-cluster-mesh && make test-cluster-mesh SCOPE="tests/modules/registry.spec.ts" ENV=test-cluster-mesh && make typecheck-cluster-mesh ENV=test-cluster-mesh && make pack-cluster-mesh ENV=test-cluster-mesh && make -f packages/cluster-mesh/packaging.mk test-lazy-package ENV=test-cluster-mesh && make check-no-python ENV=test-cluster-mesh`. Require executed NER-import, leaf-count, export-star and no-local-contract guards. Their suite is conditional at S `packages/cluster-mesh/tests/packaging/helpers.ts:18-20` and `types-and-bundlers.spec.ts:37`; `packaging.mk:66-70` enables it.

#### Row 72 · SJ-9 — One annotation service — sentropic, `cluster-mesh`

- Allowed verification: `V-S`, `V-S-CM`.
- Source: SJ:675, SJ §§6.2–6.4 and §12 block D, and NER r5 §6.2 row “72 · SJ-9” (PD-33). Delta `S3-h` (SJ:545) gives dreaming its own model list on the shared annotation path. Before R-S3, consume X-NER, row 71b and the r5 packaging evidence for 71c.
- [ ] RED t1–t5: `tests/annotation-service.spec.ts > t1: the first model of direct is cut and the next one continues with no human act`; `> t2: with one ready account the model of singleAccountByProvider comes first, and it feeds a view only if listed in qualified`; `> t3: with all models down or empty lists no model is called, the view is built by code, a banner is shown and the main model is never called in their place`; `> t4: direct and dreaming use one code path, dreaming reads its own list, each annotation names its model, and each of the five mode values selects its backend`; `> t5: without content authorization the prompt holds references only`.
- [ ] RED (t4, `finetuned`): inject the composition-selected `NerPortV1` and validate in-process and delegated results with the same llm-mesh validator. Use production spans only when the current profile passes, the authoritative receipt validates and original-text offsets resolve to source citations. Disabled or unavailable bindings, invalid or experimental results and missing receipts leave enrichment pending under t3, with zero NER-derived graph claims. Check deterministic span parity and receipt-backed engine and recipe identity against the r5 evidence.
- [ ] GUARD: the annotation code imports only the neutral NER contract. The selected host admits local artifacts only through `PinnedOnnxArtifactManifestV2`. The Spec 3 drafter and verifier ports remain owned by `@sentropic/engram/dreaming` (`S3:771`), with binding in `3-S1b` (`S3:772`, SJ:550).
- [ ] Implement: compose the cluster-mesh NER module as `disabled` by default, `in-process` with the API's selected handle, or `delegated` with the mesh client. Standalone engram selects the local factory at its composition root. `AnnotationRoutePolicyV1` has separate direct and dreaming policies with empty model lists and per-provider map by default (`OP-1`, SJ §11). Resolve taxonomy and content disclosure before dispatch. Keep direct asynchronous and use dreaming's own batch budget. The `rl` mode uses the same V2 path for a supported pinned artifact (SJ:464).
- Allowed (7, S): S:`packages/cluster-mesh/src/memory/annotation-service.ts` (new), S:`packages/cluster-mesh/src/memory/annotation-route-policy.ts` (new), S:`packages/cluster-mesh/src/compose/memory/llm-extraction-bridge.ts`, S:`packages/cluster-mesh/tests/annotation-service.spec.ts` (new), and the three common files.
- Gate: `make scope-check ENV=test-cluster-mesh && make test-cluster-mesh SCOPE="tests/annotation-service.spec.ts" ENV=test-cluster-mesh && make typecheck-cluster-mesh ENV=test-cluster-mesh && make pack-cluster-mesh ENV=test-cluster-mesh && make check-no-python ENV=test-cluster-mesh`. R-S3 also requires the 71b and 71c evidence. Production activation uses `E05a` and the passing, signed `E04b` profile for the selected placement and workflow. Direct must pass the warm complete-sweep p95 against both 2,500 ms and the frozen workload ceiling. Dreaming qualifies separately. Apply each applicable owner GO.

#### Row 72b · PIN-H3 — Exact pins of h2a on R-S3 — h2a

- Allowed verification: `V-H`.
- Source: the rule “Pin rows (H)”. It is row 40b at a later checkpoint: the same Allowed list (12, H), including H:`packages/h2a/test/install-skills-hosts.test.js`, the same rollback; its literal gate is below.
- [ ] GUARD: the installed cluster-mesh is the R-S3 version at its recorded integrity and registers the module `llm-mesh/ner`, which R-S2 does not; the installed llm-mesh is `0.39.0` or later, as its peer range now admits.
- [ ] Implement: the pins and the lock, the llm-mesh pin included (`0.38.4` today, H `packages/h2a/package.json:86`, `packages/h2a-runtime/package.json:29`). Nothing else.
- Gate: `npm ci && node --input-type=module -e 'import {readInventory} from "./scripts/test-execution-evidence.mjs"; import {declarationFailures} from "./scripts/test-inventory.mjs"; const failures=declarationFailures(process.cwd(),readInventory(process.cwd())); if(failures.length) throw Error(failures.join("\n"));' && npm test && npm run pack:h2a && npm run pack:h2a-runtime && node scripts/check-no-python.mjs`. Put this checkpoint's installed-version, integrity and feature assertions in the existing registered `registry-artifacts-packed.test.js` case; if a new case name is needed, add `scripts/test-inventory.json` to the numbered set (12 files). Revert both manifests and the lock together on rollback.

#### Row 73 · SJ-11 — Replay gate and owner report — h2a

- Allowed verification: `V-H`.
- Source: SJ:677; SJ §9.
- [ ] RED t1–t3: `session-context-replay-gate.test.js > t1: one missing request or decision, one view over the ceiling, or one uncited model item fails the gate`; `> t2: the report is in plain French and shows, for each item of the view, the raw fact behind it`; `> t3: the report names the shadow models that passed, and a model that is not in qualified cannot feed a context`.
- [ ] Implement: the three checks of SJ §9.1 have no tolerance. Every other threshold is read from a setting: the numbers are the owner's to set when the first measurements exist (SJ:604).
- Allowed (5, H): H:`packages/h2a/src/runtime/session-context/replay-gate.ts` (new), H:`packages/h2a/src/runtime/session-context/replay-report.ts` (new), H:`packages/h2a/src/cli.ts`, H:`packages/h2a/test/session-context-replay-gate.test.js` (new), H:`scripts/test-inventory.json`.
- Gate: `npm --workspace @sentropic/h2a run build && node --input-type=module -e 'import {readInventory} from "./scripts/test-execution-evidence.mjs"; import {declarationFailures} from "./scripts/test-inventory.mjs"; const failures=declarationFailures(process.cwd(),readInventory(process.cwd())); if(failures.length) throw Error(failures.join("\n"));' && node --test packages/h2a/test/session-context-replay-gate.test.js && npm run pack:h2a && node scripts/check-no-python.mjs`.

#### Row 74 · SJ-12 — Levels A, B, C and the same-session test — h2a

- Allowed verification: `V-H`.
- Source: SJ:678; SJ §4.
- [ ] RED t1–t5: `session-context-levels.test.js > t1: a clear that changes the session id or loses the scrollback fails the host test, and the host falls to B or A with a banner`; `> t2: on a host that passes, with the option on, the prompt is rebuilt at rebuildAtTokens and step 500 is under the ceiling of step 1, and with the option off nothing changes`; `> t3: a summarized tool output keeps every error line and a pointer to the full output`; `> t4: the plan block is copied by code and cited in planCitation`; `> t5: Hermes stays at the default, with no Python module`.
- [ ] Implement: the lot ships every host at its default level. A level opens on a host only after its replay gate (SJ §4.3, §9.2).
- Allowed (6, H): H:`packages/h2a/src/hosts/session-context-levels.ts` (new), H:`packages/h2a/src/hosts/plugin.ts`, H:`packages/h2a/src/hosts/session-front-client.ts`, H:`packages/h2a/src/hosts/operator-notices.ts`, H:`packages/h2a/test/session-context-levels.test.js` (new), H:`scripts/test-inventory.json`.
- Gate: `npm --workspace @sentropic/h2a run build && node --input-type=module -e 'import {readInventory} from "./scripts/test-execution-evidence.mjs"; import {declarationFailures} from "./scripts/test-inventory.mjs"; const failures=declarationFailures(process.cwd(),readInventory(process.cwd())); if(failures.length) throw Error(failures.join("\n"));' && node --test packages/h2a/test/session-context-levels.test.js && npm run pack:h2a && node scripts/check-no-python.mjs`.

#### Row 75 · SJ-14 — Track scope from the objective loop — h2a

- Allowed verification: `V-H`.
- Source: SJ:680; SJ §2.2, §5.
- [ ] RED t1–t4: `session-context-loop-scope.test.js > t1: each H2ALoopTrackRef becomes one SessionTrackScopeRefV1 with repoKey, workspace, aggregateId, role and baselineCommit copied and system left out`; `> t2: a decision gate travels as its id and its digest, and none of its text is copied`; `> t3: an aggregateKind unknown today round-trips`; `> t4: with a loop the client puts loop in the request, and with none loop is absent, never null`.
- Allowed (4, H): H:`packages/h2a/src/hosts/session-context-loop-scope.ts` (new), H:`packages/h2a/src/hosts/session-front-client.ts`, H:`packages/h2a/test/session-context-loop-scope.test.js` (new), H:`scripts/test-inventory.json`.
- Gate: `npm --workspace @sentropic/h2a run build && node --input-type=module -e 'import {readInventory} from "./scripts/test-execution-evidence.mjs"; import {declarationFailures} from "./scripts/test-inventory.mjs"; const failures=declarationFailures(process.cwd(),readInventory(process.cwd())); if(failures.length) throw Error(failures.join("\n"));' && node --test packages/h2a/test/session-context-loop-scope.test.js && npm run pack:h2a && node scripts/check-no-python.mjs`.

#### Row 76 · PIN-E4 — engram pin on R-E4 — sentropic

- Allowed verification: `V-S`, `V-S-CM`, `V-S-PACK`, `V-S-P1`.
- Source: the exceptions S4 calls `BRS4-EX1` and `BRS4-EX2` (`S4:924-931`; proposed `BR10-EX4`), the pin part of `4-S1a`. It is row 18b at the R-E4 version: the same Allowed list (12, S), the same rollback; its literal gate is below. Its GUARD is its own: the cold workspace resolves the subpath `@sentropic/engram/h2a-lineage` (row 65), which only R-E4 and later versions export. R-E4 holds rows 57 to 66 and no dreaming row (PD-27).
- Gate: `make scope-check ENV=test-cluster-mesh && make test-cluster-mesh ENV=test-cluster-mesh && make typecheck-cluster-mesh ENV=test-cluster-mesh && make pack-cluster-mesh ENV=test-cluster-mesh && make -f packages/cluster-mesh/packaging.mk test-lazy-package ENV=test-cluster-mesh && make memory-l5-lint ENV=test-cluster-mesh && make check-no-python ENV=test-cluster-mesh`. The installed-peer/export guards execute in `tests/engram-memory/intent-carriage.spec.ts`; the partial-provider fixture executes in `tests/mcp-memory.spec.ts`. The hosted P1 qualification must pass, with a bounded companion if its inputs changed. Revert pin and locks together on rollback.

#### Row 77 · 4-S1a — `h2a` lineage loader and routes — sentropic, `cluster-mesh`

- Allowed verification: `V-S`, `V-S-CM`, `V-S-PACK`, `V-S-P1`.
- Source: `S4:936`. Delta `S4-e` (SJ:564): the proposals route is no longer gated on a dossier, and nothing polls it; row 83 calls it once per signal.
- [ ] RED: `packages/cluster-mesh/tests/engram-memory/h2a-lineage-and-overlays.spec.ts > the h2a lineage is loaded through the provider catalogue only, and a template registration needs the connector context and a signed mandate with the registration right`.
- [ ] RED: `… > the proposals route serves an authenticated unassigned session only, within its limit and its size ceiling, on SQLite and on real Postgres`.
- [ ] RED: `… > a token of the sentropic-mcp client is refused 403`.
- Allowed (10, S): S:`packages/cluster-mesh/src/modules/contracts.ts`, S:`packages/cluster-mesh/src/modules/catalog.ts`, S:`packages/cluster-mesh/src/loaders/engram/h2a-lineage.ts` (new), S:`packages/cluster-mesh/src/compose/memory.ts`, S:`packages/cluster-mesh/src/memory/h2a-lineage-routes.ts` (new), S:`packages/cluster-mesh/tests/packaging/types-and-bundlers.spec.ts`, S:`packages/cluster-mesh/tests/engram-memory/h2a-lineage-and-overlays.spec.ts` (new), and the three common files.
- Gate: `make scope-check ENV=test-cluster-mesh && make test-cluster-mesh SCOPE="tests/engram-memory/h2a-lineage-and-overlays.spec.ts" ENV=test-cluster-mesh && make -f Makefile -f packages/cluster-mesh/tests/storage/postgres.mk cluster-mesh-pg-test SCOPE="tests/engram-memory/h2a-lineage-and-overlays.spec.ts" ENV=test-cluster-mesh && make -f Makefile -f packages/cluster-mesh/tests/storage/postgres.mk cluster-mesh-pg-down ENV=test-cluster-mesh && make lint-cluster-mesh ENV=test-cluster-mesh && make typecheck-cluster-mesh ENV=test-cluster-mesh && make pack-cluster-mesh ENV=test-cluster-mesh && make -f packages/cluster-mesh/packaging.mk test-lazy-package ENV=test-cluster-mesh && make memory-l5-lint ENV=test-cluster-mesh && make check-no-python ENV=test-cluster-mesh`. Use the PostgreSQL cleanup trap. The hosted P1 check decides whether a bounded re-pin companion is required.

#### Row 78 · 4-S1c — Policy envelope verifier and harness decisions — sentropic, `cluster-mesh`

- Allowed verification: `V-S`, `V-S-CM`, `V-S-PACK`, `V-S-P1`.
- Source: `S4:937`.
- [ ] RED: `packages/cluster-mesh/tests/runtime/h2a-mandate-verifier.spec.ts > verifyH2APolicyEnvelopeV1 verifies a signed policy envelope of the rule d18-readonly-slices/v1 and accepts PRINCIPAL and EXECUTIF only`.
- [ ] RED: `packages/cluster-mesh/tests/engram-memory/h2a-lineage-and-overlays.spec.ts > the harness-decisions route and the overlay export round-trip deterministically on both backends and leave the receiver route table untouched`; `> a token of the sentropic-mcp client is refused 403`.
- Allowed (8, S): S:`packages/cluster-mesh/src/runtime/h2a-mandate-verifier.ts`, S:`packages/cluster-mesh/src/memory/h2a-lineage-routes.ts`, S:`packages/cluster-mesh/src/compose/memory.ts`, S:`packages/cluster-mesh/tests/runtime/h2a-mandate-verifier.spec.ts`, S:`packages/cluster-mesh/tests/engram-memory/h2a-lineage-and-overlays.spec.ts`, and the three common files.
- Gate: `make scope-check ENV=test-cluster-mesh && make test-cluster-mesh SCOPE="tests/runtime/h2a-mandate-verifier.spec.ts" ENV=test-cluster-mesh && make test-cluster-mesh SCOPE="tests/engram-memory/h2a-lineage-and-overlays.spec.ts" ENV=test-cluster-mesh && make -f Makefile -f packages/cluster-mesh/tests/storage/postgres.mk cluster-mesh-pg-test SCOPE="tests/engram-memory/h2a-lineage-and-overlays.spec.ts" ENV=test-cluster-mesh && make -f Makefile -f packages/cluster-mesh/tests/storage/postgres.mk cluster-mesh-pg-down ENV=test-cluster-mesh && make lint-cluster-mesh ENV=test-cluster-mesh && make typecheck-cluster-mesh ENV=test-cluster-mesh && make pack-cluster-mesh ENV=test-cluster-mesh && make -f packages/cluster-mesh/packaging.mk test-lazy-package ENV=test-cluster-mesh && make memory-l5-lint ENV=test-cluster-mesh && make check-no-python ENV=test-cluster-mesh`. Use the PostgreSQL cleanup trap; both functional suites and the packed guard execute.

#### Row 79 · SJ-3a-2 — The read-only delivery at the route — sentropic, `cluster-mesh`

- Allowed verification: `V-S`, `V-S-CM`.
- Source: SJ:661, test t5 (PD-07); SJ §3.6. Deltas `S1-k` (SJ:528), `S4-h` (SJ:567), `S6A-g` (SJ:580).
- [ ] RED t5: `tests/session-context-route.spec.ts > t5: a session without a memory identity whose policy verifies gets the allowed slices in readOnlyDelivery, one more member of the refusal's body, the refusal keeps its Spec 1 status, and nothing is recorded`.
- [ ] Implement: the allowed slices are the intersection of `S4:968`: the slices of the signed policy and the slices of the bridge lock, and the empty set if either is absent, revoked or invalid.
- [ ] Start condition (PD-32): no specification names how the signed policy envelope and the bridge-lock slice list reach the route (`source-gap`), and a member of the body cannot carry them: t3 of `SJ-3a` refuses a host fact in a body (SJ:661). The row starts only when the sentropic conductor and h-cond have recorded the carrier. This plan proposes one signed header of the family already in use (`X-Sentropic-H2A-Mandate`, `S6A:745`; `X-Sentropic-H2A-Launch`, SJ:670), verified by `verifyH2APolicyEnvelopeV1` (row 78). The row does not take the policy half alone: with one half missing the intersection is empty, which is the fail-closed rule of `S4:968`.
- Allowed (5, S): S:`packages/cluster-mesh/src/memory/session-journal-route.ts`, S:`packages/cluster-mesh/tests/session-context-route.spec.ts`, and the three common files.
- Gate: `make scope-check ENV=test-cluster-mesh && make test-cluster-mesh SCOPE="tests/session-context-route.spec.ts" ENV=test-cluster-mesh && make typecheck-cluster-mesh ENV=test-cluster-mesh && make pack-cluster-mesh ENV=test-cluster-mesh && make check-no-python ENV=test-cluster-mesh`. R-S4 follows.

#### Row 79b · PIN-H4 — Exact pins of h2a on R-S4 and R-E4 — h2a

- Allowed verification: `V-H`.
- Source: the rule “Pin rows (H)”. It is row 40b at a later checkpoint: the same Allowed list (12, H), including H:`packages/h2a/test/install-skills-hosts.test.js`, the same rollback; its literal gate is below.
- [ ] GUARD: the installed cluster-mesh is the R-S4 version at its recorded integrity and serves the `h2a` lineage routes, which R-S3 and R-S2 do not; the installed engram is R-E4 or later and exports `@sentropic/engram/h2a-lineage`.
- [ ] Implement: the pins and the lock. Nothing else.
- Reach of rows 81 to 83 (PD-32): they are proven against the local cluster-mesh daemon that h2a starts. The hosted path `/api/v1/memory/v1/h2a/*` is lot `4-S2` (`S4:939`), which waits for `4-S1b` and is outside this plan: against a hosted sentropic these three rows are `not covered`.
- Gate: `npm ci && node --input-type=module -e 'import {readInventory} from "./scripts/test-execution-evidence.mjs"; import {declarationFailures} from "./scripts/test-inventory.mjs"; const failures=declarationFailures(process.cwd(),readInventory(process.cwd())); if(failures.length) throw Error(failures.join("\n"));' && npm test && npm run pack:h2a && npm run pack:h2a-runtime && node scripts/check-no-python.mjs`. Put this checkpoint's installed-version, integrity and feature assertions in the existing registered `registry-artifacts-packed.test.js` case; if a new case name is needed, add `scripts/test-inventory.json` to the numbered set (12 files). Revert both manifests and the lock together on rollback.

#### Row 80 · 4-H1 — Authored `h2a` ontology templates — h2a

- Allowed verification: `V-H`. The ontology test also reads the 13 h2a and 4 Track SKILL.md inventories named by S4:949, the role/authority/method enums and Track declaration files it inventories; these are read-only, never duplicated contracts.
- Source: `S4:949`. It waits for no other row. It edits H:`packages/h2a/package.json` (the `files` list gains the template directory, `S4:944`), which the pin rows also edit: the shared-file rule orders it with them.
- [ ] RED: `packages/h2a/test/h2a-ontology-templates.test.js > every role, artifact kind, authority rule, multi-human mode, verification category, path class and method verb of the code is represented once in the templates, under a deterministic digest`.
- [ ] RED: `… > the 13 skills of packages/h2a and the 4 of packages/track are inventoried with their owner, packages/track declares no engram or cluster-mesh dependency, and the templates ship in the package payload`.
- Allowed (6, H): H:`packages/h2a/ontology/templates/h2a-roles-and-activities.v1.yaml` (new), H:`packages/h2a/ontology/templates/h2a-harness-and-skills.v1.yaml` (new), H:`packages/h2a/package.json`, H:`packages/h2a/src/ontology/index.ts` (new), H:`packages/h2a/test/h2a-ontology-templates.test.js` (new), H:`scripts/test-inventory.json`.
- Gate: `npm --workspace @sentropic/h2a run build && node --input-type=module -e 'import {readInventory} from "./scripts/test-execution-evidence.mjs"; import {declarationFailures} from "./scripts/test-inventory.mjs"; const failures=declarationFailures(process.cwd(),readInventory(process.cwd())); if(failures.length) throw Error(failures.join("\n"));' && node --test packages/h2a/test/h2a-ontology-templates.test.js && npm run typecheck && npm pack --dry-run --ignore-scripts --workspace @sentropic/h2a && npm run pack:h2a && node scripts/check-no-python.mjs`.

#### Row 81 · 4-H2 — Signed template publisher — h2a

- Allowed verification: `V-H`.
- Source: `S4:950`.
- [ ] RED: `packages/h2a/test/h2a-ontology-publish.test.js > h2a ontology publish signs a mandate with the registration right as PRINCIPAL or EXECUTIF, registers both templates idempotently over cluster-mesh, and reports a refusal with its diagnostic and no local bypass`.
- Allowed (4, H): H:`packages/h2a/src/ontology/publish.ts` (new), H:`packages/h2a/src/cli.ts`, H:`packages/h2a/test/h2a-ontology-publish.test.js` (new), H:`scripts/test-inventory.json`. `S4:950` names the command `h2a ontology publish` and lists the new module only; the command is wired in the one CLI entry of the package, which exists at H `e9ce1a8db` and which `S4:951` edits for the same reason.
- Gate: `npm --workspace @sentropic/h2a run build && node --input-type=module -e 'import {readInventory} from "./scripts/test-execution-evidence.mjs"; import {declarationFailures} from "./scripts/test-inventory.mjs"; const failures=declarationFailures(process.cwd(),readInventory(process.cwd())); if(failures.length) throw Error(failures.join("\n"));' && node --test packages/h2a/test/h2a-ontology-publish.test.js && npm run typecheck && npm run pack:h2a && node scripts/check-no-python.mjs`.

#### Row 82 · 4-H3 — Proactive role proposal bridge — h2a

- Allowed verification: `V-H`.
- Source: `S4:951`. Deltas `S4-e` (SJ:564): no polling, the fetch is triggered by row 83; `S4-b` (SJ:561): no slice projection through a seventh tool.
- [ ] RED: `packages/h2a/test/proactive-role-bridge.test.js > an unassigned session receives a proposal, resolves its session to a registered instance, and surfaces a non-binding coach prompt`.
- [ ] RED: `… > org-ratified is accepted only when signed by PRINCIPAL, and a mandate is signed by PRINCIPAL or EXECUTIF and bound through mandate_binding`.
- [ ] RED: `… > a rejected proposal posts a rejection verdict and suppresses duplicate prompts`.
- Allowed (4, H): H:`packages/h2a/src/cli.ts`, H:`packages/h2a/src/runtime/governance/proactive-role-bridge.ts` (new), H:`packages/h2a/test/proactive-role-bridge.test.js` (new), H:`scripts/test-inventory.json`.
- Gate: `npm --workspace @sentropic/h2a run build && node --input-type=module -e 'import {readInventory} from "./scripts/test-execution-evidence.mjs"; import {declarationFailures} from "./scripts/test-inventory.mjs"; const failures=declarationFailures(process.cwd(),readInventory(process.cwd())); if(failures.length) throw Error(failures.join("\n"));' && node --test packages/h2a/test/proactive-role-bridge.test.js && npm run typecheck && npm run pack:h2a && node scripts/check-no-python.mjs`.

#### Row 83 · SJ-16h — Fetch a role proposal without polling — h2a

- Allowed verification: `V-H`.
- Source: SJ:683. Delta `S4-e` (SJ:564).
- [ ] RED t1–t2: `session-proactive-role-fetch.test.js > t1: a receipt that names an id makes the hook call the proposals route once`; `> t2: with no id there is no call and no timer`.
- Allowed (4, H): H:`packages/h2a/src/runtime/governance/proactive-role-bridge.ts`, H:`packages/h2a/src/hosts/session-front-client.ts`, H:`packages/h2a/test/session-proactive-role-fetch.test.js` (new), H:`scripts/test-inventory.json`.
- Gate: `npm --workspace @sentropic/h2a run build && node --input-type=module -e 'import {readInventory} from "./scripts/test-execution-evidence.mjs"; import {declarationFailures} from "./scripts/test-inventory.mjs"; const failures=declarationFailures(process.cwd(),readInventory(process.cwd())); if(failures.length) throw Error(failures.join("\n"));' && node --test packages/h2a/test/session-proactive-role-fetch.test.js && npm run pack:h2a && node scripts/check-no-python.mjs`.

### Step 9 — Our own loop (`proposed`)

Rows 84 and 85 stay `proposed` until the agentic-loop dossier settles (SJ §5). Neither starts on the validation of this plan alone.

#### Row 84 · SJ-18 — The step-context adapter — engram

- Allowed verification: `V-E`.
- Source: SJ:685; SJ §5.
- [ ] RED t1–t4: `tests/session-step-context.test.ts > t1: each prompt is the pinned request, the view, the trailing results and the trigger, with nothing older than the last rebuild`; `> t2: for each terminalReason of StepReceipt engram does what the table of SJ §5 says`; `> t3: with the local store down there is no further change, a replay marker, then a stop, and no second thread`; `> t4: a tool output is noted in full before its summary enters the prompt`.
- Allowed (3, E): E:`src/session-context/step-context.ts` (new), E:`src/session-front-contracts.ts`, E:`tests/session-step-context.test.ts` (new).
- Gate: `npx --no-install vitest run tests/session-step-context.test.ts && npm run lint && npm run build && node scripts/check-no-python.mjs`. `StepReceipt` is used unchanged.

#### Row 85 · SJ-17 — `h2a run stp` and the loop bridge — h2a

- Allowed verification: `V-H`.
- Source: SJ:684; SJ §5, §9.3.
- [ ] RED t1–t4: `session-context-stp.test.js > t1: h2a run stp starts the loop, and there is no stp binary`; `> t2: h2a imports neither chat-core nor a loop engine`; `> t3: the Track references of the loop reach contextRequest.loop`; `> t4: it is not the default runner without gate B`.
- Allowed (4, H): H:`packages/h2a/src/cli.ts`, H:`packages/h2a/src/runtime/session-context/loop-bridge.ts` (new), H:`packages/h2a/test/session-context-stp.test.js` (new), H:`scripts/test-inventory.json`.
- Gate: `npm --workspace @sentropic/h2a run build && node --input-type=module -e 'import {readInventory} from "./scripts/test-execution-evidence.mjs"; import {declarationFailures} from "./scripts/test-inventory.mjs"; const failures=declarationFailures(process.cwd(),readInventory(process.cwd())); if(failures.length) throw Error(failures.join("\n"));' && node --test packages/h2a/test/session-context-stp.test.js && npm run pack:h2a && node scripts/check-no-python.mjs`.

## External prerequisites, not built by this plan

**X-P09 (S, later R2/R7a writer).** Before row 53c, supply the four added remote-binding suites and reviewed four-case mapping of S `spec/evidence/memory-mcp-l5/p3-registry-v9-obligations.md:7-8`, with the published memory tuple and final R7a composition if applicable. The retained 18-suite inventory is S `tools/memory-mcp-l5/proof-catalog-v1.json:46`. All 22 rerun through row 53c's literal gate; none is accepted by inference from `memory-mcp-qualify`. This handoff blocks R-S2, not the first replay or v1 live proof.

Each belongs to another plan, another dossier or the owner. A row that names one starts only when its conductor has recorded the state.

| Prerequisite | Needed by | Owner and source | State |
|---|---|---|---|
| **X-NER**: packed r5 NER service type, cluster-mesh module and V2 handoff | Rows 71b, 71c and 72, then R-S3 and rows 72b, 73 and 74. Engram qualification `E02` and `E03`. | Sentropic conductor (NER r5 §§6.2–7). Engram owns qualification evidence (v0.1.4). | Packed handoff and production qualification pending. GO-1 gates a named local production candidate with unresolved training-data provenance. GO-2 gates a named SaaS provider/account, region, real-data classes and spend ceiling once immutable served revision, residency and retention are evidenced. Synthetic qualification can proceed under its approved test grant and budget. |
| chat-mesh lots B1 and B2, the neutral `session-db` | Row 28; row 26, t4 | sentropic, another plan (`S1:1682`) | Not found at S `d6093d568`: `'session-db'` appears in no file under `packages/cluster-mesh/src/storage/`. Confirmed by the sentropic conductor before row 28 |
| chat-mesh lot C2a, the metering sink in llm-mesh | Row 71 | sentropic, another plan (`S1:1684`) | Not found at S `d6093d568`: `RouteMeteringSink` appears in no file under `packages/llm-mesh/src/` |
| The writer handoff `#679 → #685 → R2/R7a/R3` | Row 18 | sentropic (`S6A:746`) | #679 and #685 merged (`1472d961e`, `9ed96eb83`); `R2/R7a/R3` `unknown` |
| h2a PR #455 | Rows 41, 42, 43, 47, 48, 54, as a GUARD on its four invariants | h2a (`S6A:759`, `S1:1692`) | Merged on H `origin/main` (`70c68a21c`): no longer a prerequisite |
| `@sentropic/engram` `0.28.0` on the registry | Row 18b | engram (`S6A:747`) | Published: tag `v0.28.0` on `809af689`; h2a resolves it from the registry (H `package-lock.json:2003-2006`) |
| `@sentropic/llm-mesh` in `>=0.38.0 <0.40.0` on the registry | Rows 11, 71 | sentropic (`S1:1664`, `S1:1684`, as PD-23 reads them) | `0.38.4` published: h2a resolves it from the registry (H `package-lock.json:2191-2194`). `0.39.0`: X-NER |
| The store and the setter of the workspace setting `journalEnabled` | Row 40; row 49b (P-LIVE) | sentropic conductor (PD-31) | `source-gap` on SJ:825-826 |
| The carrier of the signed `D18` policy and of the bridge-lock slice list | Row 79 | sentropic conductor and h-cond (PD-32) | `source-gap`; one signed header proposed |
| The reclaim record of `plan/09:141` | Row 14, and through it every class C row | The conductors | `unknown` to this author on 2026-11-20 |
| The engram and sentropic co-signature of the `v2` profile | Switching `v2` on; rows 33 and 53 prove the switch with test keys | A separate dossier (SJ §11) | Sequenced act |
| The content authorization | Text of other sessions to an external model; rows 30 and 51 default to closed | The owner, at commissioning (SJ §6.5) | Sequenced act |
| `OP-1`, the ordered lists of shadow models | A model that annotates; row 72 runs with empty lists | The owner (SJ §11) | Open |
| The numeric thresholds of gate A | Opening a level on a host; row 73 | The owner (SJ:604) | Open until the first measurements |
| The agentic-loop dossier, and gate B | Rows 84, 85 | Another dossier (SJ §5, §9.3) | Open |
| The opt-in of a workspace to the journal | Noting real sessions after R-H1 | The owner (`OD:83`) | Off by default |
| The signed `D18` policy file of a real host | Row 79 in operation; the row is proven with a fixture envelope | h2a, lot `4-H4` of S4 (`S4:952`), outside this plan | `not covered` |

## Lots unblocked, not built by this plan

SJ §8 re-points these lots; none is a prerequisite of an SJ lot, so none is a row. `6A-E3` waits for row 33 where it waited for `6A-E2` (SJ:581). The S3 lots that waited for a Spec 2 lot wait for rows 10, 30, 51, 72 and 49 (SJ:550): `3-E4`, `3-E5`, `3-S1a` to `3-S3`, `3-H1` to `3-H4`. Their sentropic part pins an engram that holds rows 67 to 70, which is R-E5 or a later release (`S3:1016`), and binds the ports of Spec 3 to the adapter of row 72 (`S3:772`). Of S4: `4-S1b`, `4-S2`, `4-H4`; until `4-S2` the `h2a` routes of rows 77 and 78 have no hosted exposure (PD-32). Of S1: `1-E0`, `1-E5`, `1-E6`, `1-S0a`, `1-S0b`, `1-S3a`, `1-S3b`, `1-H2`, `1-H3`, `1-H4`. Of S0: Lot 0.6. Also outside this plan: the fold of SJ §8 into the four sibling texts (SJ:707), and the matching edits to `spec/SPEC_MEMORY_MCP_V2.md` (SJ:587).

For NER r5 §7 and engram qualification v0.1.4, `E00` establishes the runner and `E01a`, `E01b` and `E01c` prepare the datasets, scoring and freeze criteria before X-NER is needed. `E02` and `E03` use the packed candidate for local and mesh conformance. `E04a` collects calibration and blind evidence on either side of `E04b`'s signed pre-blind freeze. `E04b` replays the evidence and produces the verdict. `E05a` consumes row 72, placement parity and the passing profile for SJ-9 activation. `E05b` covers repository and ontology adoption and the shared chunker for long repository and dreaming inputs. These ten qualification lots live in the engram qualification spec.

## Sources

One line per lot of a sibling spec. “Deltas” gives the rows of SJ §8 applied, with their SJ line. “Not delivered” gives the evidence at the audited heads: for E, an exact path that is absent at `2cb2aa6a` (every such path was absent at `7d9e2355` too, and none of the eight paths changed since is among them), or a line read there; for S and H, the conductor's `git log origin/main --grep` check relayed in the brief (“brief”), a path read absent at S `d6093d568` or H `e9ce1a8db`, or a declared prerequisite that is itself not delivered (“by dependency”). A state written `unknown` is confirmed by the receiving conductor before the row starts; a lot found delivered closes its row.

| Row | Lot | Source `path:line` | Deltas (SJ line) | Not delivered |
|---|---|---|---|---|
| 2, 2b | Lot 0.1 | `S0:875-882`; `S0:143-174` | — | E:`tests/ontology-profile-format-amendment.test.ts` and E:`src/metamodel-contracts.ts` absent |
| 36 | Lot 0.2 | `S0:884-890` | — | E:`src/metamodel/types.ts` absent |
| 57 | Lot 0.3 | `S0:892-897` | — | E:`src/metamodel/semver-gate.ts` absent |
| 58 | Lot 0.4 | `S0:899-905` | — | E:`src/lineage-registry/store.ts` absent; no `./lineage-registry` export (E `package.json:12-63`) |
| 60 | Lot 0.5 | `S0:907-913` | — | E:`src/lineage-registry/projection.ts` absent |
| 3 | `6A-E1` | `S6A:737` | `S6A-g` (580) | E:`tests/mcp-memory/mandate-and-track-guard.spec.ts` absent |
| 15, 15b, 16 | `6A-S0a` | `S6A:745` | `S6A-c` (576), `S6A-i` (582) | Brief. The broker half may already hold (row 16); its manifest still reads `"private": true` (S `packages/mcp-broker/package.json:4`) |
| 18 | `6A-S0b` | `S6A:746` | — | `'session-db'` appears in no file under S `packages/cluster-mesh/src/storage/` at `d6093d568` |
| 18b, 19, 19b | `6A-S1a` | `S6A:747` | `S6A-l` (585) | By dependency on `6A-S0a`; the engram pin is still `0.22.0` (S `packages/cluster-mesh/src/modules/catalog.ts:18`) |
| 20 | `6A-S1b` | `S6A:748` | `S6A-c` (576) | Brief |
| 21 | `6A-S1c` | `S6A:749` | `S6A-g` (580), `S6A-k` (584) | By dependency on `6A-S1b` |
| 22 | `6A-S1d` | `S6A:750` | — | By dependency on `6A-S1c` |
| 23, 24 | `6A-S2` | `S6A:751` | `S6A-e` (578) | By dependency on `6A-S1d` |
| 25 | `6A-S3` | `S6A:752` | — | By dependency on `6A-S2` |
| 40b, 41, 42, 43 | `6A-H1` | `S6A:759` | — | Brief; the pins are still cluster-mesh `0.26.0` and the platform `0.4.1` (H `packages/h2a/package.json:81`, `:87`) |
| 46, 44, 45 | `6A-H2` | `S6A:760` | — | The nine legacy modules, the ceremony and their ten tests exist at H `e9ce1a8db` (PD-20) |
| 47, 55 | `6A-H3` | `S6A:761` | `S6A-f` (579), `S6A-h` (581), `S6A-j` (583) | By dependency on `6A-H2` |
| 4 | `1-E1` | `S1:1663`; `S1:179-463` | `S1-a` (518), `S1-e` (522), `S1-g` (524), `S1-j` (527) | Brief; E:`src/session-front-contracts.ts` absent; no `./session-front-contracts` export |
| 11, 11c, 12 | `1-E2` | `S1:1664`; `S1:884-894` | `S1-m` (529) | E:`src/llm-json-port.ts` absent; `@sentropic/llm-mesh` still a dependency at `^0.19.0` (E `package.json:152`) |
| 37 | `1-E3` | `S1:1665` | `S1-f` (523), built by row 38 | Brief; E:`src/session-extraction-adapter.ts` absent; E `src/extraction-batch.ts:74-78` still imports `./llm-execution.js` |
| 13 | `1-E4` | `S1:1666` | `S4-i` (568) | E:`engram-live/derived-worktree-graph.ts` absent |
| 27, 28 | `1-S1a` | `S1:1682`; `S1:1672-1676` | `S1-a` (518), `S1-j` (527); `S1-h` (525) and `S1-n` (530), built by row 40 | Brief; S `packages/cluster-mesh/src/compose/memory.ts` and `src/loaders/memory.ts` absent at `d6093d568` |
| 29 | `1-S1b` | `S1:1683` | — | By dependency on `1-S1a` |
| 71 | `1-S2` | `S1:1684` | — | Brief |
| 48, 48b | `1-H1` | `S1:1692`; `S1:471-475` | `S1-a` (518), `S1-e` (522), `S1-g` (524), `S1-j` (527) | Brief; H `packages/h2a/hooks/vibe-post-tool.mjs` absent at `e9ce1a8db` |
| 67 | `3-E1` | `S3:1020` | `S3-i` (546), `S3-j` (547), `S3-k` (548) | E:`engram-memory/dreaming-contracts.ts` absent |
| 68 | `3-E2` | `S3:1021` | — | E:`engram-memory/dreaming-shadow.ts` absent |
| 69 | `3-E3` | `S3:1022`; `S3:1016` | `S3-c` (540), `S3-d` (541), `S3-e` (542), `S3-f` (543), `S3-g` (544), `S3-l` (549), `S3-m` (550) | Brief; no `./dreaming` export (E `package.json:12-63`) |
| 61 | `4-E1` | `S4:912`; `S4:910` | `S4-a` (560) | E:`src/h2a-lineage/contracts.ts` absent |
| 62 | `4-E2` | `S4:913` | `S4-c` (562), `S4-e` (564) | Brief; by dependency on `4-E1` |
| 64 | `4-E3` | `S4:914` | `S4-d` (563), `S4-h` (567) | By dependency on `4-E1` |
| 65 | `4-E4a` | `S4:915` | `S4-e` (564) | No `./h2a-lineage` export (E `package.json:12-63`) |
| 66 | `4-E4b` | `S4:916` | `S4-b` (561), `S4-g` (566) | Blocked until SJ; by dependency on `4-E1` |
| 76, 77 | `4-S1a` | `S4:936`; `S4:924-931` | `S4-e` (564) | By dependency on the published `4-E4a` |
| 78 | `4-S1c` | `S4:937` | `S4-h` (567) | By dependency on `4-S1a` |
| 80 | `4-H1` | `S4:949` | — | No file under H `packages/h2a/src/ontology/` at `e9ce1a8db` |
| 81 | `4-H2` | `S4:950` | — | By dependency on `4-S1a` |
| 82 | `4-H3` | `S4:951` | `S4-b` (561), `S4-e` (564) | By dependency on `4-H2` |

The lots of SJ are defined at SJ:653-685; each section above cites its line. `SJ-0e` (row 1) is delivered. The guard facts of the [packed-surface rule](#commissioning-rules) were read at E `7d9e2355` and hold at `2cb2aa6a`, where none of these files changed: `tests/memory-neutrality.test.ts:240-245`, `:255-257`, `:906-918`, `:1055-1086`; `engram-memory/tsconfig.json:13-35`; `engram-memory/contracts/tsconfig.json:13`; `engram-live/tsconfig.json:15-23`; `scripts/substrate-tarball-acceptance.mjs:15-19`, `:50`; `scripts/check-packed-surface.sh:45-53`; `scripts/fixtures/packed-surface/check-esm.mjs:1-11`; `vitest.config.ts:11`; `tsup.config.ts:56`, `:88`; `.github/workflows/typescript-ci.yml:39-40`, `:101-132`, `:202-204`, `:217-245`, `:267`, `:276-277`; `package.json:3`, `:12-63`, `:98`, `:152`, `:185-186`, `:256-257`; `src/memory-tools/reads.ts:3-5`, `:11-27`; `src/mcp-memory/profiles.ts:7-15`; `src/mcp/memory/contracts.ts:149-156`; `tests/fixtures/sample.py:1`.

## Summary

1. 105 build/documentary lots plus row 0: E 43, S 34, H 28. Row 1 is delivered; 104 remain. Round 1 added 15 to the original 86; round 2 adds four bounded companions/splits.
2. By origin: 37 rows carry the 33 SJ lots; 55 carry sibling prerequisites (S0 6, S1 12, S3 3, S4 11, S6A 23); 13 are plan additions. Stable row identifiers are preserved.
3. Builders: Neon 87 (E 35, S 30, H 22), Hydrogen 13 (E 5, S 4, H 4), Ember 5 (E 3, H 2). Each lot has at most 12 changed files; aggregate stack PRs have a declared union.
4. First proof: row 0, row 2 beside 0b, then 3, 4, 5, 6 with F-CC, and record 6b. It remains an engram-only chain of five serial Neon lots.
5. Live proof: R-P1/R-E1, then R-S0 and H 40b–47 beside S 26–29, then R-E2/R-S1, H 47b/48/49 and record 49b. Row 48b remains off that path.
6. Handoffs retain R-E1–R-E5, R-P1, R-S0–R-S4, R-H1, external X-NER/X-P09 and four vectors. R-E1 includes 11c; R-S0 includes 19b; R-S2 includes 53c; R-S3 includes 71c.
7. Every lot declares inventory and generated-output access, literal commands and executed guards. One definition per symbol, no duplicate NER contract, no frozen-signature changes, and no Python.
8. All nine new round-2 majors, three new minors and both OPEN residues have dispositions below. Rebase remains physically blocked by read-only Git metadata; validator/owner GOs and future build gates are not claimed.

## Validation 20/11 — dispositions

Historical round-1 ledger; the round-2 ledger below supersedes its earlier file counts, row splits and regeneration mechanics. Both round-1 validations of 20/11 returned NO-GO: Fable 5.2 with one blocker, seven majors and 22 minors; Carbon with three blockers, eight majors and four minors. Every finding has one line below, with its status and the place where it is applied. A finding is `Applied` when the plan now does what its fix asks; `Applied in part` when one branch of the fix is contradicted by a line read at `origin/main`, which the line then cites; `Rejected` when the evidence does not hold, with its source. Where the two validations differ, the table that follows says which one the evidence supports. The round-1 validation files are `VALIDATE-plan10-fable-r1.md` and `VALIDATE-plan10-carbon-r1.md`; their primary location is outside this repository's tracked tree (a scratch folder of the conductor).

### Fable 5.2

| Finding | Severity | Status | Disposition, with its place in this plan |
|---|---|---|---|
| B1 | BLOCKER | Applied | The NER contract of llm-mesh `0.39.0` is an external checkpoint, X-NER; row 71b widens the mesh range of cluster-mesh and adds the leaf; row 72 serves `finetuned` through it and declares no artifact or NER type; every llm-mesh range admits `0.39.x` (rows 11, 71, 71b); owner table, checkpoint table, external prerequisites. PD-23. |
| M1 | MAJOR | Applied | Row 13 leaves R-E1. Its module belongs to `@sentropic/engram-live`; `1-S1a` consumes no symbol of it, so row 28 waits for its merge and for no release (“Row 13 and the neutral package”, PD-29). |
| M2 | MAJOR | Applied | Five H pin rows (40b, 47b, 53b, 72b, 79b), one per consumed cluster-mesh checkpoint, each with the manifests, the lock and the assertion files; ordered with R-H and R-H2 of plan/09 (“Pin rows (H)”, “Two plans, one queue per repository”). PD-24. |
| M3 | MAJOR | Applied | Row 11 lists `src/llm-mesh-bridge.ts`, `src/llm-execution.ts` and the workflow of the smoke lane, and edits both install lines; 12 files. |
| M4 | MAJOR | Applied | Row 18b, a pin row on the published `0.28.0`, precedes row 19, which loses `catalog.ts`. The pin was read at S `d6093d568`: still `0.22.0`. PD-10. |
| M5 | MAJOR | Applied in part | The question it leaves to the sentropic conductor is settled by lines read at S `d6093d568`: the manifest qualifies the platform and the broker only, and neither a cluster-mesh bump nor an engram pin move re-pins it (“`MCP-L5` re-pin”). Rows 77 and 78 keep `make memory-l5-lint`, which reads no manifest. The re-pin set is listed where it is due: row 17b and row 53. Not applied: adding the set to every cluster-mesh row, which `S4:929-930` implies and S `main` contradicts; the hosted job runs on every such row and a failure stops the row. |
| M6 | MAJOR | Applied | “Two plans, one queue per repository”: one merge queue and one release train per repository, the shared-file rule across both plans, a stated priority for the class B slot and one class C slot per plan, and the reclaim record before row 14. |
| M7 | MAJOR | Applied | Fixture F-CC: an empty configuration directory, a manual compaction, a size bound, a scan by a Node script that is a GUARD of row 6, and a fallback that is the owner's decision. PD-18. |
| m1 | MINOR | Applied | Heads refreshed (E `2cb2aa6a`, S `d6093d568`, H `e9ce1a8db`); “Receiving-branch confirmation” now binds E lots too. |
| m2 | MINOR | Applied | The text and the table agree: row 2 depends on row 0. Lot 0.1 is split: row 2 (declarations, on the chain) and row 2b (digest, off it). PD-25. |
| m3 | MINOR | Applied | Row 6b records check 1 as proven, check 2 as measured and not enforced, check 3 as not exercised. |
| m4 | MINOR | Applied | Rows 9, 8, 65 and 48 added to the cells of rows 32, 59, 66 and 50. |
| m5 | MINOR | Applied | Row 30 declares `SessionReadOnlyDeliveryV1`; row 31 implements it and declares no type (one-definition table). |
| m6 | MINOR | Applied | The condition holds at H `e9ce1a8db` (`d11-ceremony.ts:509-517`): row 46 comes first, rows 44 and 45 remove, the absence assertion closes row 45. PD-20. |
| m7 | MINOR | Applied | Checkpoint R-S0 after row 25 and pin row 40b: rows 41 to 47 no longer wait for R-S1. PD-24. |
| m8 | MINOR | Applied | R-E4 is cut on rows 57 to 66; rows 67 to 70 ship in R-E5. PD-27. |
| m9 | MINOR | Applied | Neon for the pin rows of sentropic, for row 8 and for row 55. |
| m10 | MINOR | Applied | “Packed-surface rule”: the guards of cluster-mesh, of the platform and of h2a as read at their heads, the rows that list one, and the headroom of the rows that do not. |
| m11 | MINOR | Applied | H `scripts/check-no-python.mjs` exists at `e9ce1a8db`; the first act of the first H row (row 40b, or row 80 if it starts earlier) runs it on the receiving head. |
| m12 | MINOR | Applied | “Disk”: a builder worktree is removed at merge; free space is measured on the worktree, the temporary and the Docker filesystems. |
| m13 | MINOR | Applied | (a) “One release train (E)”: only the engram conductor releases the root package in the window. (b) Removed: there is no prerelease left to re-pack. (c) Shown to the owner as an accepted effect (platform release rule). (d) Row 11b moves the two platform pins before R-E1. |
| m14 | MINOR | Applied | Row 7 is `E-REL-J`. |
| m15 | MINOR | Applied | Rows 15 and 15b point to row 34 for the refusal with no binding and to rows 32 and 53 for the invalid input; row 18 names rows 15, 16, 17 and 24 of plan/09 (`plan/09:366-369`). |
| m16 | MINOR | Applied | Each pin row has a GUARD on a name only its version exports (row 27); the file set was read in the last pin move of S and is reconciled with `S3:1039-1043` at branch start. |
| m17 | MINOR | Applied | Rows 6b and 49b: the two records are documentary lots, recorded by Ember and run by a conductor. |
| m18 | MINOR | Applied | Recorded as a `source-gap` on SJ:825-826; row 40 reads the setting through an injected reader, and P-LIVE waits for the store to be named. PD-31. |
| m19 | MINOR | Applied | The list of 16 data files was merged by the owner with PR #462; row 1b adds the check that nothing executes Python. PD-03. |
| m20 | MINOR | Applied | Row 47 says where each target of `S6A:761` went: kept, moved to rows 48, 48b, 54 or 55, or obsolete under `S6A-f` and `S6A-j`. |
| m21 | MINOR | Applied | “Derived files (E)”: which generated files a lot commits and which it restores. The fact holds at `2cb2aa6a` (`scripts/gen-st-tokens.mjs:70-71`; `scripts/gen-mcp-memory-assets.mjs:202`, `:240`). |
| m22 | MINOR | Applied | Vector V-session, written by row 26 and asserted by row 54. |

### Carbon

| Finding | Severity | Status | Disposition, with its place in this plan |
|---|---|---|---|
| B1 | BLOCKER | Applied | As Fable B1. Its lot `SJ-9-L` is row 71b, with the six files it names and the three common files; the RED guard on `PinnedOnnxArtifactManifestV1` and `model_onnx_sha256` is in rows 71b and 72. One difference: the host subpath `./ner/host` is not registered in cluster-mesh, which runs in the `musl` image (NER:7); the hosted backend is `apps/ner-host`. |
| B2 | BLOCKER | Applied | Every checkpoint is a plain `X.Y.Z` version under a dist-tag other than `latest` (“Checkpoints”, “Checkpoint release rule (E)”); row 7 reads the dist-tag from `publishConfig.tag`, not from the version. The three lines it cites hold at S `d6093d568`. PD-11, PD-16. |
| B3 | BLOCKER | Applied | As Fable M2. The exact pins are at H `packages/h2a/package.json:81-87`. One anchor of the finding does not hold: H `scripts/check-publish-payload.mjs` has 53 lines; the exact-version check is at `:37-40`, not `:68-73`. |
| M1 | MAJOR | Applied | Row 46 precedes rows 44 and 45, and the absence assertion moves to row 45. The evidence corpus leaves row 46: it is a frozen manifest of Git blobs whose digest is pinned with a calibrated policy. The raw `prepack` is replaced by `npm run pack:h2a` in rows 44 to 47 and 55 (gate conventions). |
| M2 | MAJOR | Applied | Row 17 lists the barrel, `invocation-context.ts`, the frozen export inventory and the API report: 12 files with the branch file. Rows 15 and 15b add no export and list the report their signatures move. |
| M3 | MAJOR | Applied | S:`BRANCH.md` is in every S row, the seven non-cluster-mesh rows included; the exception identifiers follow the grammar of the scope check, proposed `BR10-EX1` to `BR10-EX5`, with the specification names quoted. PD-30. |
| M4 | MAJOR | Applied | Row 11 lists the workflow and keeps llm-mesh in `devDependencies`. |
| M5 | MAJOR | Applied | “Derived files (E)” and “Tests that reach L0 (E)”: the two registry files are in rows 3, 11, 11b, 32, 33, 34 and 35 (row 30 no longer changes the lock; row 35 is added because it edits a source of the entry); the release commit follows the 13 files of `809af689`, which hold the three it names; rows 3, 35 and 70 import nothing from `engram-memory/` in their tests. |
| M6 | MAJOR | Applied in part | (1) Applied: row 28 lists `modules/contracts.ts` and marks `loaders/memory.ts` new. (2) Applied where the evidence holds: the re-pin set, `.sha256` and lock snapshot included, is in row 53 and in row 17b; not listed in row 19 or in the pin rows, because the manifest qualifies the platform and the broker only (S `tools/memory-mcp-l5/lock-closure.mjs:1-11`) and the last engram pin move of S (`b2921cdd4`) touched no file of the tool. (3) Rejected: `SJ-9` is not moved after `PIN-E4`. SJ:675 gives it no prerequisite in Spec 3, and SJ:550 makes `3-S1a` and `3-S1b`, which bind the drafter port (`S3:772`), wait for `SJ-9`. The risk it names, a second definition of that port, is closed by a GUARD of row 72. |
| M7 | MAJOR | Applied | Row 81 lists `packages/h2a/src/cli.ts`; `1-H1` is split, row 48b building the poll in `h2a-runtime`; the live record is row 49b, which lists its file. PD-28. |
| M8 | MAJOR | Applied | Row 14 does not start without the reclaim record of `plan/09:141`; the open worktrees of plan/09 count against the limit (“Disk”). |
| m1 | MINOR | Applied | The states it lists were read again: engram `0.28.0` published, PR #455 merged, the nine legacy modules present, #685 merged, the broker targets at S `Makefile:4959`, `:4965`. Rows 16, 18b, 41, 44–46; external prerequisites. |
| m2 | MINOR | Applied | Row 6 has a GUARD on `planCitation`. |
| m3 | MINOR | Applied | Rows 81 to 83 are bound to the local daemon and `4-S2` stays outside (it waits for `4-S1b`); the carrier of the `D18` policy is a start condition of row 79, with one signed header proposed. PD-32. |
| m4 | MINOR | Applied | Row 25 goes to Hydrogen; the pin set cites both `Makefile:1282` and `:1318`. |

### Where the two validations differ

| Point | Fable 5.2 | Carbon | Followed | Reason, at its line |
|---|---|---|---|---|
| Form of a checkpoint version | Keeps prereleases, with four reserves (m13) | Plain versions only (B2) | Carbon | S `packages/cluster-mesh/src/modules/semver.ts:5` parses release versions only, and `:50-56` refuses the rest; S `Makefile:1398-1400` refuses to publish one. |
| Where the h2a pin lives | `packages/h2a-runtime/package.json:27` and two assertions (M2) | `packages/h2a/package.json:81-87` (B3) | Both | Both lines hold at H `e9ce1a8db`; the pin rows list both manifests and the three assertion files. |
| Order of rows 44 to 46 | Minor, conditional on an import (m6) | Major, the import is there (M1) | Carbon | H `packages/h2a/src/runtime/memory/d11-ceremony.ts:509-517`. |
| The h2a no-Python guard | `unverified`, absent from the local tree (m11) | Present on `origin/main` | Carbon | H `scripts/check-no-python.mjs` exists at `e9ce1a8db`. |
| Extent of the `MCP-L5` re-pin | Perhaps every cluster-mesh row; a question for the conductor (M5) | Rows 19, 53 and the pin rows (M6) | Neither in full | S `tools/memory-mcp-l5/lock-closure.mjs:1-11`: the closure is that of the platform and of the broker. The set is due in rows 17b and 53, and in no pin row. |
| Does a row of S or H consume the dreaming rows? | No: R-E4 may leave them (m8) | Yes: `SJ-9` needs the drafter port (M6) | Fable | SJ:675 and SJ:550, as above; `S3:772` gives the binding to `3-S1b`. |
| Builder of row 25 | Not raised | Hydrogen (m4) | Carbon | The lot edits the public barrel S `packages/cluster-mesh/src/index.ts`, outside the Ember class. |
| Files of a pin row | About eleven, with the manifest (M4, m16) | Eleven, plus the cascade (M6) | Neither figure | Ten files, read in S `b2921cdd4` and at S `packages/cluster-mesh/src/modules/catalog.ts:18`, `package.json:269`, `:294`. |
| First proof as early as possible | Delayed by the whole of Lot 0.1 (m2) | Optimal | Fable | `S6A:737` and `S1:180-185` ask for the types of S0 only. |

### Added by the author while re-reading the anchors

- Rows 15 and 15b: `6A-S0a-P` is split. With the branch file and the API report that each half moves, one row would hold 13 files.
- Row 17b: the platform and the broker change the inputs of the pre-candidate manifest (S `tools/memory-mcp-l5/precandidate.mjs:11-21`); neither validation listed a re-pin for rows 15 to 17. They merge as one stack closed by that row (PD-26).
- Row 16: the broker is `"private": true` on S `main` (S `packages/mcp-broker/package.json:4`), although `0.1.0` is on the registry; the first edition said the flag was already flipped.
- Row 21: `compose/memory.ts`, `memory/access-port.ts` and `memory/track-guard.ts` are marked new; none exists at S `d6093d568`.
- Rows 44 to 46: the evidence corpus is not edited by any row, where `S6A:760` asks for an update; the reason is in row 46.
- Release commit of engram: 13 files in the last release, where the first edition said three and Carbon six.
- `src/mcp/memory/gates.ts`: the anchor of the frozen `requiredClaims` now names the six lines, one per tool, where the first edition named the first only (Fable, anchors).
- Row 1: the delivered guard holds its list inline; the third case of the first edition was not built, and the row says why that is no gap.
- Not done by the amending session: the rebase of the authoring worktree onto E `origin/main`, which its Git metadata was read-only (“Reference heads and rebase status”).

Anchors added by this amendment and read at the three heads: E `package.json:4-6`, `:68-74`, `:72`, `:77`; E `engram-live/package.json:2`; E `src/llm-mesh.ts:1-12`; E `src/llm-mesh-bridge.ts:11-30`, `:32-36`; E `src/index.ts:199-208`, `:264-282`; E `.github/workflows/typescript-ci.yml:188-192`, `:219`; E `scripts/check-packed-surface.sh:18-23`, `:30`, `:42`; E `scripts/substrate-tarball-acceptance.mjs:41`; E `scripts/gen-mcp-memory-assets.mjs:179-202`, `:213-240`; E `scripts/gen-st-tokens.mjs:70-71`; E `tests/memory-neutrality.test.ts:350-372`, `:490-518`; E `scripts/check-no-python.mjs:26-43`, `:46`, `:59`; E `tests/check-no-python.test.ts:59`, `:73`, `:84`, `:95`, `:120`, `:142`, `:167`, `:180`; E `src/mcp/memory/gates.ts:205`, `:222`, `:239`, `:255`, `:272`; E `tests/release-config.test.ts:16`; E `package-lock.json:2249-2252`; `plan/09:59`, `:116-117`, `:120-122`, `:126`, `:141`, `:153`, `:366-369`, `:718-720`. S `packages/cluster-mesh/src/modules/semver.ts:5`, `:50-56`; `registry.ts:55-56`; `catalog.ts:18`, `:19-20`, `:83`, `:90-91`; `contracts.ts:5-30`; S `packages/cluster-mesh/package.json:269`, `:271`, `:294`; S `packages/cluster-mesh/tests/packaging/tuple-skew.spec.ts:13`, `:23`; `types-and-bundlers.spec.ts:57-62`, `:63-72`; S `packages/cluster-mesh/tests/storage/cold-workspace.sh:132`; S `Makefile:977`, `:1282`, `:1318`, `:1389-1396`, `:1398-1400`, `:1422`, `:1425`, `:2153`, `:4959`, `:4965`, `:4986-4988`, `:5023-5028`; S `.github/workflows/ci.yml:141-173`, `:150-155`, `:610-618`, `:1417-1428`; S `packages/harness/src/profile/sentropic.ts:10`; S `packages/harness/src/checks/scope-check.ts:27`, `:44-52`; S `rules/MASTER.md:26-28`, `:33`; S `tools/memory-mcp-l5/lock-closure.mjs:1-11`, `:125-133`; `precandidate.mjs:11-21`, `:33-36`; `pack.mjs:124-127`; `import-graph.mjs:185-205`; S `packages/mcp-platform/package.json:3`; S `packages/mcp-broker/package.json:4`, `:47`; S `packages/llm-mesh/package.json:3`; S `api/Dockerfile:11`, `:489`; S `api/src/routes/namespaces/memory.ts:1-5`. H `packages/h2a/package.json:43-65`, `:74`, `:81-87`; H `packages/h2a-runtime/package.json:24-37`, `:27`, `:29`; H `package.json:14`; H `package-lock.json:2003-2006`, `:2191-2194`; H `scripts/check-publish-payload.mjs:6-13`, `:37-40`, `:47-52`; H `packages/h2a/src/runtime/memory/d11-ceremony.ts:509-517`; H `packages/h2a/test/remote-session-mesh-consumer.test.js:240`; H `packages/h2a/test/registry-artifacts-packed.test.js:35`; H `packages/h2a-runtime/src/llm-mesh-resolution.test.ts:20`; H `packages/h2a/focus-kit/test/fixtures/evidence-corpus.v1.json:2`; H `packages/h2a/focus-kit/test/fixtures/evidence-performance-policy.v1.json:12`; H `packages/h2a/focus-kit/test/evidence-performance-browser.test.mjs:19`. Commits read by their file lists: E `809af689`; S `b2921cdd4`, `d453c04bb`, `657c5ada5`, `1472d961e`, `9ed96eb83`; H `51b22f176`, `70c68a21c`, `898b84330`. NER, in the local S tree: 7, 139-143, 170-173, 172, 210-224, 388-400, 607-618, 616, 617, 644-651.

## Validation round 2 — dispositions

Sources: `.graphify/scratch/design/memory-finalization/VALIDATE-plan10-astra-r2.md` and `VALIDATE-plan10-carbon-r2.md`, both round-2 NO-GO; round-1 reports are the `-r1.md` files identified above. Every new finding and every OPEN residue is listed separately. There are no new BLOCKER findings: the remaining Carbon B1 residue is explicitly downgraded to the MAJOR N3. “Applied” describes this plan amendment, not an executed build or a new validation GO.

| Finding | Severity | Disposition and source |
|---|---|---|
| Astra N1 | MAJOR | **Applied.** Row 17b owns one literal preserve/generate/verify/promote procedure, with a new absent destination, retained history pair, canonical pair, lock snapshot and both archives; row 53c reuses it only on evidenced P1 drift. S `tools/memory-mcp-l5/pack.mjs:124-135`, `:175-182`; S `Makefile:5023-5040`. It does not pretend the packer rotates an occupied manifest. |
| Astra N2 | MAJOR | **Applied.** Before packing, row 17b sets the broker dependency to exactly `^` plus the final platform version and commits the resulting root lock. Both are numbered Allowed files, and both archives are verified. S `packages/mcp-broker/package.json:47`; S `tools/memory-mcp-l5/minimal-pack.mjs:12-17`; S `tools/memory-mcp-l5/precandidate.mjs:100-101`. Ordinary caret admission is insufficient. |
| Astra N3 | MAJOR | **Applied.** Row 21 uses the exact `tests/memory/r12-access-and-degraded.spec.ts` path; row 23 separately runs the existing `tests/mcp-composition.spec.ts` and `tests/mcp-memory.spec.ts`, both now numbered Allowed. Packaging uses its own enabled lane. S `packages/cluster-mesh/tests/storage/cold-workspace.sh:161`; E `S1:1655`; the two existing test paths were confirmed at S `origin/main`. |
| Astra N4 | MAJOR | **Applied.** Rows 21, 28, 71b/71c and 77 execute `make -f packages/cluster-mesh/packaging.mk test-lazy-package ENV=test-cluster-mesh`; the same audit also applies it to other changed packed leaves, inherited row 78 and pin rows. S `packages/cluster-mesh/tests/packaging/helpers.ts:18-20`, `types-and-bundlers.spec.ts:37`, `packaging.mk:66-70`. A normal skipped suite or a pack alone is never the guard result. |
| Astra OPEN residue C-M7 | MINOR residue of round-1 MAJOR | **Applied.** Row 48b includes H:`scripts/test-inventory.json` (6 files) and runs the runtime Vitest config, the shared-client test, full registration/execution gate and both package packers. E `S1:1656`; H `scripts/test-execution-evidence.mjs:23-35`; H `scripts/test-inventory.mjs:71-85`. This path evidence takes precedence over Carbon's CLOSED verdict on M7. |
| Carbon N1 | MAJOR | **Applied.** Row 11 is SDK isolation (5); new row 11c is optional peer/smoke/locked consumer (12), including both smoke install sites and substrate fixture lock/README. PIN-P1 carries that closure too (9). E `scripts/substrate-installed-acceptance.mjs:13-23`, `scripts/substrate-tarball-acceptance.mjs:706-713`, `scripts/fixtures/substrate-consumer/README.md:10-15`. No weakening of locked-closure verification. |
| Carbon N2 | MAJOR | **Applied.** Same concrete fix as Astra N1/N2, with row 53 split from qualification row 53c and final aggregate scope recorded. The evidence holds at S `pack.mjs:175-181` and `precandidate.mjs:100-101`, rather than the later line numbers cited in Carbon. Preserving the canonical bytes while packing to an absent temporary destination provides the required fresh identity; a destructive removal before generation is unnecessary. |
| Carbon N3 | MAJOR | **Applied.** Row 71b contains the range and all six omitted assertion/fixture files, plus `skew-invariants.ts` (12); row 71c contains the NER leaf, loader and packed guards (8, or 10 with a selected-fixture refresh). Evidence under S:`packages/cluster-mesh/`: `tests/modules/registry.spec.ts:117,137`, `tests/modules/topology-ranges.spec.ts:76`, `tests/packaging/optional-install.spec.ts:34`, `tests/packaging/skew-invariants.spec.ts:28`, `tests/packaging/skew-invariants.ts`, `tests/speech-peer.spec.ts:6,15,19`, `tests/fixtures/train.ts:9`. Keep literal assertions independent and historical incompatibility cases intact. |
| Carbon OPEN residue B1 | MAJOR residue of round-1 BLOCKER | **Applied.** The range/test omission is closed by rows 71b/71c under Carbon N3, despite Astra closing the original B1. Both agree on NER contract ownership; the six omitted paths above settle the remaining scope defect. X-NER, the multi-file V2 manifest and the native-host boundary are preserved. |
| Carbon N4 | MAJOR | **Applied.** Every PIN-E0..4 lists `tests/engram-memory/intent-carriage.spec.ts` and `tests/mcp-memory.spec.ts`, for 12 files. S `packages/cluster-mesh/tests/engram-memory/intent-carriage.spec.ts:13`, `tests/mcp-memory.spec.ts:46`. Any additional consumer-lock, qualification or manifest edit requires a bounded companion before writing; no claimed headroom remains. |
| Carbon N5 | MAJOR | **Applied.** Row 19 owns declarations/projection plus the C6 inventory, semantic manifest and generated snapshot (10); row 19b owns backend migration/qualification (8). S `packages/cluster-mesh/tests/engram-memory/package-contract.mjs:7-14`, `assets/storage/engram-memory/neutral-asset-inventory.json:7-13`, `tests/storage/cold-workspace.sh:115-121`. The declaration snapshot is absent from the tracked main tree and is copied by the build; it is explicitly reserved as generated, not falsely cited as a tracked file. |
| Carbon n1 | MINOR | **Applied.** Every reviewed stack keeps per-parent at-most-12-file ledgers; its final `BRANCH.md` declares their union, which may exceed 12. Row 17b and row 53c run the origin/main comparison through `make scope-check SCOPE_BASE=origin/main ENV=test-memory-mcp`. S `Makefile:2459-2466` shows why an ordinary Docker scope check would miss committed stack paths. |
| Carbon n2 | MINOR | **Applied.** Row 69 stops and splits if the shared ESM output changes the registry asset pair: 11 plus 2 is 13. Both resulting parts retain the relevant guards and precede row 70/R-E5. E `tsup.config.ts:56-79` is the actual entry/splitting anchor; the cited lines 614/637 do not exist in this 127-line file. |
| Carbon n3 | MINOR | **Applied as a mandatory commissioning precondition; operation remains incomplete.** Fetch and rebase were attempted before editing, but read-only worktree Git metadata prevented both. The header records actual HEAD `a6fec8ac` (= E `origin/main`) and S `origin/main` `13490b16b9`, plus the exact required rebase/ancestry check before row 0 is committed or row 1b starts. No successful rebase is claimed. |

**Whole-plan application of the design note.** Every row now incorporates Allowed verification inventories and generated outputs; named guards have literal execution paths. The audit also corrected unflagged omissions: API report generation before strict extraction; row 21's closed catalogue declarations; emitted-source pack checks in S/H; explicit H inventory validation and focus-dossier check; the whole-package live TypeScript command; documentary comparisons; and row 19b's PostgreSQL cleanup. Common read-only/generated sets do not grant extra tracked edits, and any persistent drift above 12 forces a split.

**Additional gate evidence from the same audit.** SJ-7b t4's 22 P09 suites are not run by `memory-mcp-qualify`: S `Makefile:1390-1396` selects the lane at `packages/cluster-mesh/tests/storage/cold-workspace.sh:98-105`. The 18 retained paths are in S `tools/memory-mcp-l5/proof-catalog-v1.json:46`, and the four absent additions are specified at S `spec/evidence/memory-mcp-l5/p3-registry-v9-obligations.md:7-8`. Row 53c now has a separate literal 22-suite execution block and external prerequisite X-P09; no unrun case is reported green. The unavailable `LOT=3` shortcut is rejected by S `Makefile:4998-5005`.

**Anchor and authoring verification.** New anchors were re-read at the three `origin/main` heads recorded in the header, including the corrected packer/closure/tsup lines, installed fixture inventories, all six range assertions, both pin assertions, C6 inventory/copy guard, API extraction recipe, scope-check recipe, H test inventory/runtime configuration and live strict-compile instruction. The external NER brief retains its explicit working-tree provenance. This amendment changes only this Markdown file and runs no implementation gate, Python, release, commit or graph rebuild. The plan's commands describe future commissioning, not checks falsely claimed as executed in this session.

## Validation round 3 — dispositions

Sources: `.graphify/scratch/design/memory-finalization/VALIDATE-plan10-carbon.md` (M1, M2, m1, m2, m3) and `VALIDATE-plan10-astra.md` (R3-1, R3-2, R3-3). Every new round-3 finding is listed separately. “Applied” describes this plan amendment only.

| Finding | Severity | Disposition |
|---|---|---|
| M1 | MAJOR | **Applied.** Row 71b (SJ-9-L1) adds S:`packages/cluster-mesh/tests/packaging/skew-invariants.ts` to its Allowed list; file count raised from 11 to 12 in the Commissioning Order table and the row body. |
| M2 | MAJOR | **Applied.** The shared PIN-H0..4 template (Row 40b) and the Commissioning Order table add H:`packages/h2a/test/install-skills-hosts.test.js`; all five PIN-H rows (40b, 47b, 53b, 72b, 79b) and the Pin rows (H) rule are raised from 11 to 12; PIN-H1, PIN-H2 and PIN-H4 now include the engram pin assertion file. |
| m1 / R3-1 | MINOR | **Applied.** Rows 18b, 27, 39, 52, 76 now declare `Allowed verification: V-S, V-S-CM, V-S-PACK, V-S-P1` instead of `V-E`. |
| m2 | MINOR | **Applied.** Checkpoint R-S3 Commissioning Order now lists Rows 71, 71b, 71c, 72; Row 72 prose now reads “waits for rows 71b and 71c and for X-NER”. |
| m3 | MINOR | **Applied.** Baseline refresh: Reference heads now record E `a6fec8acd7` (= worktree HEAD, fast-forwarded) and S `13490b16b9`; Carbon n3 ledger updated accordingly. |
| R3-2 | MINOR | **Applied.** SJ-4 t6 poll-parity owned by Row 48b guard (“SJ-4 t6 poll-parity”); Row 49 retains hook/codec carriage and live proof with poll-parity pending until Row 48b. |
| R3-3 | MINOR | **Applied.** Round-2 Sources now point to `VALIDATE-plan10-astra-r2.md` and `VALIDATE-plan10-carbon-r2.md`. |

No Allowed list exceeds 12 files after these edits.
