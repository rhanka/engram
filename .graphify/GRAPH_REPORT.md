# Graph Report - .  (2026-07-05)

## Corpus Check
- Large corpus: 629 files · ~892 391 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 8211 nodes · 73768 edges · 257 communities detected
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 466 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output
- Edge kinds: ON_BRANCH: 54786 · contains: 5716 · MODIFIES: 3496 · calls: 3097 · imports: 2332 · PARENT_OF: 1365 · imports_from: 1210 · re_exports: 711 · uses: 466 · method: 275 · rationale_for: 208 · inherits: 96 · defines: 8 · references: 2


## Input Scope
- Requested: auto
- Resolved: committed (source: default-auto)
- Included files: 629 · Candidates: 687
- Excluded: 5 untracked · 2323 ignored · 8 sensitive · 0 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.

## Graph Freshness
- Built from Git commit: `6f67022`
- Compare this hash to `git rev-parse HEAD` before trusting freshness-sensitive graph output.
## God Nodes (most connected - your core abstractions)
1. `Response` - 49 edges
2. `Response` - 45 edges
3. `Request` - 42 edges
4. `Request` - 42 edges
5. `jt` - 34 edges
6. `Extraction` - 33 edges
7. `_makeId()` - 32 edges
8. `Cookies` - 28 edges
9. `Client` - 27 edges
10. `Client` - 27 edges

## Surprising Connections (you probably didn't know these)
- `Utility functions shared across the library. Small helpers that don't belong in` --uses--> `Cookies`  [INFERRED]
  worked/httpx/raw/utils.py → worked/httpx/raw/models.py
- `Convert a primitive value to its string representation.` --uses--> `Cookies`  [INFERRED]
  worked/httpx/raw/utils.py → worked/httpx/raw/models.py
- `Convert a header key to its canonical Title-Case form.` --uses--> `Cookies`  [INFERRED]
  worked/httpx/raw/utils.py → worked/httpx/raw/models.py
- `Expand a params dict into a flat list of (key, value) pairs.     List values bec` --uses--> `Cookies`  [INFERRED]
  worked/httpx/raw/utils.py → worked/httpx/raw/models.py
- `Parse a Content-Type header value.     Returns (media_type, params_dict).     Ex` --uses--> `Cookies`  [INFERRED]
  worked/httpx/raw/utils.py → worked/httpx/raw/models.py

## Communities

### Community 0 - "Community 0"
Cohesion: 0.23
Nodes (340): chore/remove-handover, chore/track-wp9-dossier, ci/pages-nojekyll, correctness-rebase, docs/readme-recenter, feat/agent-stats-fixes, feat/agent-stats-mvp, feat/agent-stats-phase1 (+332 more)

### Community 1 - "Community 1"
Cohesion: 0.29
Nodes (352): b1-p1-golden-expand, b1-p2-edges-impl, b1-phase1-shapes, b1-phase5-perf-lod, b1p1-harness-fix, chore/graphify-track-refresh-qa, chore/release-0.17.0, chore/track-mystery-qa-closeout (+344 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (205): feat/track-c-3.5-visual-encoding, feat/track-f-h1-hypergraph, feat/track-f-m2-v08x, feat/track-g-process-std-workspace, feat/track-g-g3-viewer-state, 014aace Address Lot 4 provider review fixes, 0440c1e Merge pull request #25 from rhanka/feat/track-c1-review-precision, 0509dea Add no-Python fallback language coverage (+197 more)

### Community 3 - "Community 3"
Cohesion: 0.40
Nodes (166): b1-phase0-golden-harness, chore/release-0.14.0, chore/wp9-agent-stats-closeout, feat/agent-stats-codex-headless, feat/assembly-hygiene-deorphan, feat/assembly-reconciliation-hardening, feat/citations-pass2-engine, feat/citations-pass2-studio (+158 more)

### Community 4 - "Community 4"
Cohesion: 0.02
Nodes (97): _a, ao(), au(), ba(), bf(), bu(), cu(), ds() (+89 more)

### Community 5 - "Community 5"
Cohesion: 0.05
Nodes (39): Auth, BasicAuth, BearerAuth, DigestAuth, NetRCAuth, Authentication handlers. Auth objects are callables that modify a request before, Load credentials from ~/.netrc based on the request host., Base class for all authentication handlers. (+31 more)

### Community 6 - "Community 6"
Cohesion: 0.08
Nodes (105): feat/track-b-reconciliation-ui, feat/track-g-d12-forcegraph, feat/track-g-studio-impl, spec/reconciliation-algorithm, 00a2d8c Refresh .graphify after community-naming round 1 (top 41 named), 0c6476e Scaffold batch mode for wiki descriptions (Track A Lot A2), 0efa79b Release 0.9.5: ship merged f7160c8 port + .graphify refresh (#44), 0f9fb8c C3 visual encoding: per-file_type shapes, per-relation edge dashes, legend (+97 more)

### Community 7 - "Community 7"
Cohesion: 0.05
Nodes (85): 14160c3 Track G G2: workspace shell static scaffold + a11y baseline, 35d561c Track G G1: workspace token contract + local fallback + DS adapter, html, tokens, buildFacetValues(), collectFieldNames(), DENYLIST, DiscoverFacetsOptions (+77 more)

### Community 8 - "Community 8"
Cohesion: 0.05
Nodes (68): 2e8dff6 feat(graph): git-flow layout — trunk lane 0, gitk-style lane reuse, ALL branches, e9a92e1 feat(ontology): class-hierarchies artifact + schema (EVOL 2.c), buildClassHierarchies(), BuildClassHierarchiesOptions, buildOneClassHierarchy(), ClassHierarchyGraphNode, classNodeId(), clearClassHierarchiesEmitterCache() (+60 more)

### Community 9 - "Community 9"
Cohesion: 0.05
Nodes (61): buildProfileReport(), graphLinks(), graphNodes(), highDegreeSection(), humanReviewSection(), invalidRelationsSection(), lowEvidenceSection(), pdfOcrSection() (+53 more)

### Community 10 - "Community 10"
Cohesion: 0.06
Nodes (62): 094333e wip(studio): ia-aero static-studio fix A (facets type/community + shape per type) + B (community colors) — preserve rate-limited agent work, 8d27f1c fix(studio): guard document-only graph QA, 9a3e1dd feat(studio/reconciliation): type-grouped rail, score bubbles, two-line pairs, batch validate + depth-3 neighbourhood, 9cae385 fix(qa): gate document studio graph regressions, d0b0710 feat(studio): legacy-parity box nodes drawn in canvas (labeled rounded rect, text for central Work/Chapter nodes), applyTimeFilter(), applyWeakFilter(), attachForceLayout() (+54 more)

### Community 11 - "Community 11"
Cohesion: 0.05
Nodes (59): detectTextLanguage(), LANGUAGE_CHARS, LANGUAGE_DISPLAY_NAMES, languageDirectiveLine(), languageDisplayName(), LanguageSelection, normalizeLanguageSelection(), resolveLanguage() (+51 more)

### Community 12 - "Community 12"
Cohesion: 0.06
Nodes (20): Auth, BasicAuth, HTTP Basic Authentication., AsyncClient, BaseClient, Client, Limits, The main Client and AsyncClient classes. BaseClient holds all shared logic. Clie (+12 more)

### Community 13 - "Community 13"
Cohesion: 0.04
Nodes (58): CloseError, ConnectError, ConnectTimeout, DecodingError, HTTPError, NetworkError, PoolTimeout, ProtocolError (+50 more)

### Community 14 - "Community 14"
Cohesion: 0.07
Nodes (33): BearerAuth, DigestAuth, NetRCAuth, Authentication handlers. Auth objects are callables that modify a request before, Load credentials from ~/.netrc based on the request host., Base class for all authentication handlers., Modify the request. May yield to inspect the response., Bearer token authentication. (+25 more)

### Community 15 - "Community 15"
Cohesion: 0.03
Nodes (60): cd9ee17 Port post-0.7.16 path matching guards, de5ef85 Expose read-only reconciliation MCP tools, alphaNeighbors, audit, beforeAudit, beforeDecisions, betaNeighbors, candidate (+52 more)

### Community 16 - "Community 16"
Cohesion: 0.05
Nodes (61): ASSET_DIR_MARKERS, canonicalFilePath(), classifyFile(), convertOfficeFile(), countWords(), detect(), detectIncremental(), DetectOptions (+53 more)

### Community 17 - "Community 17"
Cohesion: 0.05
Nodes (54): 03aa841 test(graph): wire B1 Phase-0 golden harness into vitest + run commands, 1429661 docs(graph): document B1 Phase-0 golden harness + ignore ephemeral CDP profiles, 225398d test(graph): B1-P1 — expand golden harness coverage (current canvas2d renderer), 2d81bd7 test(graph): B1 Phase-0 golden harness — CDP direct-canvas-pixel oracle + napi smoke, c08b3a6 docs(graph): document B1 Phase-0 golden harness + ignore ephemeral CDP profiles, e8694f7 test(graph): wire B1 Phase-0 golden harness into vitest + run commands, eb42268 test(graph): B1 Phase-0 golden harness — CDP direct-canvas-pixel oracle + napi smoke, ALL_FIXTURES (+46 more)

### Community 18 - "Community 18"
Cohesion: 0.05
Nodes (56): d20ad59 Track C-3.5: add OntologyNodeType.visual_encoding (schema + validation), asRecord(), asStringArray(), bindOntologyProfile(), DEFAULT_STATUSES, hashOntologyProfile(), loadOntologyProfile(), normalizeCitationPolicy() (+48 more)

### Community 19 - "Community 19"
Cohesion: 0.05
Nodes (38): 007ceab docs(readme): store mirrors — store push/status + studio serve-with-store, bff82a2 test(cli): store push/status against fake-driver postgres, ContractFixture, ContractGraphStore, describeGraphStoreContract(), createFileGraphStore(), create(), factories (+30 more)

### Community 20 - "Community 20"
Cohesion: 0.04
Nodes (31): 0747b68 test(studio/b2): engine parity, community contract, A5 tone, F2 UI lock, 30466bd feat(studio/b2): LeftRail Group-by sub-menu + relocated reactive count badges, 3f99805 fix(studio): recon score % bubble was pushed off-rail (real 1.c root cause), 433114a chore(studio/b2): reword removed-checkbox comment to satisfy F2 UI-lock assertion, 4fbe144 feat(studio): prefer-server group-by counts for the Types rail (client fallback), 4fcf448 feat(studio): ontology multi-level category collapse with link inheritance (EVOL 2.b+2.d), 682204c test(studio): un-stale the appHeader brand assertion (single "Graphify" title), 68c7e6e fix(studio): force-layout the ontology class/collapse scene (was a ring) (+23 more)

### Community 21 - "Community 21"
Cohesion: 0.05
Nodes (52): buildFlowArtifact(), computeFlowCriticality(), decoratorsOf(), detectEntryPoints(), flowIdFor(), flowListToText(), flowToSteps(), getFlowById() (+44 more)

### Community 22 - "Community 22"
Cohesion: 0.05
Nodes (53): assertPositionArray(), computePositionBounds(), copyPositions(), createPositionFrame(), acquire2DContext(), acquireContext(), applyDash(), AttributeLocations (+45 more)

### Community 23 - "Community 23"
Cohesion: 0.04
Nodes (55): 1a63d0a fix(track-f): filter language built-ins from call-edge resolution (F-0820-0827, 80301a0 #916), 3f9efdc fix(track-f): TypeScript interface-extends and same-file class heritage emit inherits/implements edges (F-0820-0827, 88a8e3b #1095), 415d9a7 feat(extract): Swift enum associated-value type references (#1593), 72aa067 feat(extract): C# field + auto-property type references (#1591), 83426ff fix(track-f): Python decorated methods inherit parentClassNid; already-covered proofs for M6b/M6c/M15 (F-0820-0827, 9f73400 #1050/#1046/#1047), 9c60f74 feat(extract): PHP property + promoted-ctor type references (#1590), d0bc8df feat(extract): Scala val/var field type references (#1587), d298493 feat(extract): Rust struct/enum field type references (#1582, #1579) (+47 more)

### Community 24 - "Community 24"
Cohesion: 0.07
Nodes (50): AgyParseOptions, asToolCall(), commandFromToolArgs(), cwdInScope(), emptySession(), filePathFromToolArgs(), firstString(), handleToolCall() (+42 more)

### Community 25 - "Community 25"
Cohesion: 0.06
Nodes (51): 1ed7fc3 feat(cite): heuristic citation-grounding engine (productizes ia-aero ground.py), 4602c2d docs(spec): WP #24 addendum — cite producer + contract delta in SPEC_CITATIONS, 4f90810 fix(cite): make `cite --source` truly repeatable (Commander collect), 82b4345 fix(cite): ground image nodes via containing OCR doc even when the image file exists, 9d03994 fix(cite): matcher precision — emitted quote must contain the matched term; surname is whole-word, c300699 feat(cli): wire `graphify cite` (a.k.a. ground-citations) command, cf01a74 feat(citations): promote quote?/confidence?/source_location? to OntologyCitation (WP #24 contract), ec74546 test(cite): golden-oracle suite for the grounding producer (+43 more)

### Community 26 - "Community 26"
Cohesion: 0.05
Nodes (37): buildCommitRecommendation(), commitPrefixForArea(), communityLabel(), dominantCommunity(), groupConfidence(), groupDraftForFile(), isGraphifyStatePath(), mergeDrafts() (+29 more)

### Community 27 - "Community 27"
Cohesion: 0.07
Nodes (57): OntologyPatchContext, OntologyReconciliationDecisionLogResponse, getOntologyRebuildStatus(), getOntologyReconciliationCandidate(), listOntologyReconciliationCandidates(), loadReadonlyReconciliationCandidates(), ontologyAppliedPatchesPath(), ontologyNeedsUpdatePath() (+49 more)

### Community 28 - "Community 28"
Cohesion: 0.04
Nodes (6): 3a5a182 fix(studio): dwell-delay hover dim before the first selection (de-strobe), b3e95a4 feat(studio/graph): wire current zoom into the principal-character label LOD, d5aae9e feat(studio): boot on WebGL2 backend with canvas2d fallback (P6 flip), d928dbd perf(studio): backend-aware edge-skip — never skip on WebGL2, raise canvas2d threshold to 6000, createHoverIntent(), shouldDelayConnectedDim()

### Community 29 - "Community 29"
Cohesion: 0.07
Nodes (49): 04aae4e feat(graph): B1-P2 — WebGL2 edges canary (flag-gated, default canvas2d), 208f9d1 feat(renderer): drive GPU world->clip through the mat4 unified camera (2D ortho, byte-parity), 363a809 feat(graph): arrowless flow-port variants — git-flow arrow grammar at the edge level, 686d9aa test(graph): B1-P2 defer box-clip PIXEL parity to Phase 4, 8ed3562 fix(graph): B1-P2 round-pip dash caps + occluded-overlap golden case, bafaf22 feat(graph): flow-port edge style — directional ports + smooth-S routing, DPR_MATRIX, ZOOM_MATRIX (+41 more)

### Community 30 - "Community 30"
Cohesion: 0.05
Nodes (51): b3a0ffc fix(release): address codex review — publish SPA guard, README, drop dead write_html knob, indexHtml, root, asBoolean(), asNumber(), asRecord(), asString(), asStringArray() (+43 more)

### Community 31 - "Community 31"
Cohesion: 0.07
Nodes (49): basenameNoExt(), codexThreadId(), discoverAgy(), discoverClaude(), discoverCodex(), Host, listFilesRec(), repoSlug() (+41 more)

### Community 32 - "Community 32"
Cohesion: 0.05
Nodes (55): handle_delete(), handle_enrich(), handle_get(), handle_list(), handle_search(), handle_upload(), API module - exposes the document pipeline over HTTP. Thin layer over parser, va, Accept a list of file paths, run the full pipeline on each,     and return a sum (+47 more)

### Community 33 - "Community 33"
Cohesion: 0.05
Nodes (43): 170f0ef Merge branch 'feat/studio-show-descriptions' into feat/node-type-boxes, buildEntitySidecar(), CitationSidecarEntry, citationsSidecarCache, CitationsSidecarCacheEntry, CitationsSidecarShape, computeGraphCitationSignature(), EntitySidecarDescription (+35 more)

### Community 34 - "Community 34"
Cohesion: 0.06
Nodes (50): OntologyPatchNode, candidateId(), candidateScore(), chooseCanonicalPair(), CONTAINMENT_HEAD_NOUNS, DEFAULT_FUZZY_EXCLUDE_TYPES, differentEntityReason(), differsOnlyByOrdinal() (+42 more)

### Community 35 - "Community 35"
Cohesion: 0.07
Nodes (46): resolveIdentity(), workspaceLabel(), H2aInstance, loadH2aInstances(), matchInstance(), AGENT_STATS_SCHEMA, AgentReport, AgentStatsReport (+38 more)

### Community 36 - "Community 36"
Cohesion: 0.05
Nodes (37): average(), buildBlastRadius(), buildReviewAnalysis(), communityRisk(), evaluateReviewAnalysis(), formatMetric(), impactedCommunities(), multimodalSafety() (+29 more)

### Community 37 - "Community 37"
Cohesion: 0.06
Nodes (46): commitRecommendationToText(), normalizeSearchText(), scoreSearchText(), textMatchesQuery(), bfs(), communitiesFromGraph(), communityLabelsFromGraph(), communityName() (+38 more)

### Community 38 - "Community 38"
Cohesion: 0.05
Nodes (41): 19a63ca feat(graph): B1-P1 — WebGL2 instanced shapes/nodes canary (flag-gated, default canvas2d), 262fee6 test(graph): realistic cross-rasterizer AA budget for the WebGL shape diff, 2cf6e1f fix(graph): golden harness — give WebGL backend a real webgl2 context, 30dc018 fix(graph): WebGL2 edge width parity with Canvas2D (WP1 beta), 9f1aa80 test(graph): tighten golden-webgl gate to catch edge + outline under-weight, a469534 fix(graph): WebGL2 node shape-outline width parity with Canvas2D (WP1 beta), e63da99 fix(graph): MSAA the WebGL golden capture to match Canvas2D AA edges, f1f06f6 test(graph): git-flow demo golden — full pipeline proof + screenshot artifact (+33 more)

### Community 39 - "Community 39"
Cohesion: 0.06
Nodes (38): affectedFilesToText(), BARREL_BASENAMES, basename(), buildReviewDelta(), changedNodeIds(), clampDepth(), compareNodes(), compareStrings() (+30 more)

### Community 40 - "Community 40"
Cohesion: 0.06
Nodes (44): NumericMapLike, StringMapLike, toNumericMap(), toStringMap(), BACKUP_ARTIFACTS, backupIfProtected(), buildFreshnessMetadata(), buildGraphHtml() (+36 more)

### Community 41 - "Community 41"
Cohesion: 0.05
Nodes (46): 0cbc925 Merge pull request #54 from rhanka/feat/track-g-g5-workspace-alignment, 1b0efd1 Track G G6-1 (S0.2-S0.4): compact description, graph controls, counters, 1bb6d1f Track G G6-1 (S0.1): three-column shell + reconciliation slot scaffolding, a5b19e3 Merge pull request #55 from rhanka/feat/track-g-g6-1-shell-3col, bda565a Track G G5 workspace alignment, cf840ed Merge pull request #52 from rhanka/feat/track-g-g45-central-display, graph, html (+38 more)

### Community 42 - "Community 42"
Cohesion: 0.07
Nodes (38): 2f71950 feat(search): finish Piece 3 PPR — lazy-walk power iteration (work-stream C Phase A), 340bf78 feat(search): in-browser BM25 query + RRF seed fusion (work-stream C Phase A, Piece 2), 3cde4a7 feat(search): in-browser BM25 query + RRF seed fusion (work-stream C Phase A, Piece 2), 41e0e20 feat(search): Piece 4 answer-pack assembler — graphify_answer_pack_v1 (work-stream C Phase A), 56ea97e wip(search): C Phase A Piece 3 PPR scaffold + SHIP'd search spec, 81d8a74 fix(search): specificity + type-demoted answer ranking — surface entities over hubs/chapters, 9bcbe55 feat(search): wire `graphify answer` CLI + `answer_graph` MCP tool (work-stream C Phase A / C9), d53c401 wip(search): C Phase A Piece 3 PPR scaffold + SHIP'd search spec (+30 more)

### Community 43 - "Community 43"
Cohesion: 0.05
Nodes (38): 395e9bb feat(storage): Postgres graph_group_counts aggregate (replace-snapshot, O(#groups)), 5d24377 feat(storage): per-layout positions table + degree-top-n window (postgres, LOT 3), 74d528d feat(studio): GET /api/ontology/window route — degree-top-n windowed loader (LOT 3), ad2dcea feat(storage): widen GraphStore port with optional versioned aggregate capability, OntologyStudioHandlerOptions, StudioGroupCountsStore, StudioStore, AGGREGATE_AXES (+30 more)

### Community 44 - "Community 44"
Cohesion: 0.09
Nodes (39): applyGroupCollapse(), applyOntologyCollapse(), asArray(), buildClassParentIndex(), buildCommunityParentIndex(), buildTypeParentIndex(), communityNodeId(), edgeIsWeak() (+31 more)

### Community 45 - "Community 45"
Cohesion: 0.08
Nodes (39): 391c7f9 feat(search): real BM25F index + search-index.json emitter (work-stream C Phase A, Piece 1), 9cb9b37 feat(search): real BM25F index + search-index.json emitter (work-stream C Phase A, Piece 1), BM25_FIELDS, Bm25Doc, Bm25Field, Bm25Index, Bm25Params, buildBm25Index() (+31 more)

### Community 46 - "Community 46"
Cohesion: 0.05
Nodes (30): b5a7d25 feat(viz): aggregate large surfaces by community for HTML export (WP11), ANTIGRAVITY_RULE_PATH, ANTIGRAVITY_WORKFLOW_PATH, changedFilesFromGit(), __dirname, ensureCliExtractionShape(), __filename, GEMINI_MCP_SERVER (+22 more)

### Community 47 - "Community 47"
Cohesion: 0.07
Nodes (35): applyLabelLanguageDirective(), applySalientCommunityLabels(), buildLabelingPromptLines(), CallLlmFn, cleanLabelInstructionDir(), detectLabelingBackend(), emitLabelInstructions(), generateCommunityLabels() (+27 more)

### Community 48 - "Community 48"
Cohesion: 0.06
Nodes (35): buildHierarchyIndex(), columnValue(), compileHierarchies(), CompileHierarchiesOptions, CompiledNode, CompiledRelation, compileNodes(), compileOntologyOutputs() (+27 more)

### Community 49 - "Community 49"
Cohesion: 0.07
Nodes (48): _cross_community_surprises(), _cross_file_surprises(), _file_category(), god_nodes(), graph_diff(), _is_concept_node(), _is_file_node(), _node_community_map() (+40 more)

### Community 50 - "Community 50"
Cohesion: 0.07
Nodes (39): appendMemoryFiles(), buildGitInventory(), countGitPaths(), fallbackAllScope(), gitInventory(), inspectInputScope(), isInputScopeMode(), makeScope() (+31 more)

### Community 51 - "Community 51"
Cohesion: 0.07
Nodes (25): bs(), ci(), cl(), di(), dl(), dr(), Fi(), Go() (+17 more)

### Community 52 - "Community 52"
Cohesion: 0.07
Nodes (29): aggregateCitations(), AggregateCitationsOptions, backfillCitations(), BackfillCitationsOptions, BackfillCitationsResult, CitationAggregateEntry, CitationAggregateMap, citationKey() (+21 more)

### Community 53 - "Community 53"
Cohesion: 0.07
Nodes (41): BOX_LABEL_NODE_TYPES, buildStudioScene(), BuildStudioSceneOptions, colorForGroup(), communityLiveCount(), communityStats(), computeDegrees(), computeGodClass() (+33 more)

### Community 54 - "Community 54"
Cohesion: 0.08
Nodes (38): 1ba42c9 Merge pull request #14 from rhanka/upstream-0.7.4-traceability, 23e4b4e Merge pull request #14 from rhanka/upstream-0.7.4-traceability, 4d720d0 Merge upstream 0.7.5..0.7.10 parity closure, 6cfe14a feat(v7): close v0.7.0 multi-dev graph lifecycle parity, bd93cf1 Complete upstream 0.7.10 parity closure, d2abb57 Merge upstream 0.7.5..0.7.10 parity closure, GitContext, escapeRegExp() (+30 more)

### Community 55 - "Community 55"
Cohesion: 0.06
Nodes (34): 08eecd8 test(graph): xMode gates — rank regression pin, time ordering, epsilon, undated interpolation, 29061e1 feat(graph): gitflow-labels policy — compaction, priority culling, LOD tiers, anchor fallback (SPEC_GITFLOW_LABELS P1+P2), 4ff2cb8 feat(graph): merged-as merge-back connectors + bare fork descents in git-flow layout, 69b2a81 test(graph): git-flow demo — 4 merged branches, arrow-grammar probes, refreshed screenshots, 6f67022 feat(uat): git-flow live — ALL-repos real graph + Séquence/Temps toggle, 8d186e0 feat(graph): xMode rank|time — git-flow X on one global committer-date axis, b790bd6 feat(graph): git-flow branch labels carry tipX/laneY anchor extras (label-policy inputs), computeGitFlowPositions() (+26 more)

### Community 56 - "Community 56"
Cohesion: 0.07
Nodes (38): b25a47e Add wiki description sidecar model, LlmExecutionMode, GenerateWikiDescriptionSidecarsClients, buildCommunityContentHash(), buildNodeContentHash(), buildWikiDescriptionCacheKey(), checkWikiDescriptionFreshness(), createInsufficientEvidenceRecord() (+30 more)

### Community 57 - "Community 57"
Cohesion: 0.06
Nodes (25): analyzeChanges(), changedNodesFromFiles(), mapChangesToNodes(), sortNodesByLocation(), addNode(), qn(), uniqueSorted(), analyzeChanges() (+17 more)

### Community 58 - "Community 58"
Cohesion: 0.09
Nodes (41): 7394930 Merge pull request #53 from rhanka/feat/track-f-opt-prs, a6269ff Add local PR inspection commands, d029130 Harden local PR inspection commands, authorLogin(), checkUrl(), defaultRunner, formatPrWorktrees(), formatPullRequestConflicts() (+33 more)

### Community 59 - "Community 59"
Cohesion: 0.09
Nodes (44): 9517dd4 Add ontology reconciliation candidate queue, d843b20 Merge pull request #18 from rhanka/feat/wiki-reconciliation-ui, addError(), addWarning(), appendJsonLine(), applyOntologyPatch(), auditPath(), changedFiles() (+36 more)

### Community 60 - "Community 60"
Cohesion: 0.06
Nodes (33): detectChangesToMinimal(), detectChangesToText(), pushToNeo4j(), toCypher(), affectedFlowsToText(), flowDetailToText(), ListFlowsOptions, AnalysisFile (+25 more)

### Community 61 - "Community 61"
Cohesion: 0.12
Nodes (41): 52f29c2 feat(studio/b2): community scene passthrough + A5 numeric tone parity, dc07567 feat(studio/b2): axis-scoped groupBy data model + pure migration, ee690bd feat(studio/b2): generalize collapse into applyGroupCollapse + community index, clearCommunityGrouping(), clearGrouping(), clearOntologyGrouping(), clearSelection(), createDefaultGroupBy() (+33 more)

### Community 62 - "Community 62"
Cohesion: 0.07
Nodes (35): 0cf6cd4 test(graph): dense git-flow golden — 49-branch fixture, 3-tier probes, AC1/AC2/AC4/AC5 gates + policy-wired demo labels, 38533dd fix(agent-stats): T2 committer-date stamps survive parent-stub creation order, 57aeee5 test(graph): labelScale unit gates + boxBaseHeightPx threaded through golden harness capture opts, b1889cc test(graph): gitflow-labels unit suite — compaction table, tiers, culling, hysteresis, AC4/AC5, fc059f1 feat(graph): labelScale 0.8 — −20% git-flow pills via gitFlowLabelBoxHeightPx + renderer boxBaseHeightPx knob (AABBs and drawn pills in sync), Aabb, approximateLabelMeasure(), CLASS_RANK (+27 more)

### Community 63 - "Community 63"
Cohesion: 0.10
Nodes (35): 310d1f1 feat(studio): labeled box nodes for box-category node_types (legacy parity), 3ce9ee0 feat(studio/labels): top-K principal-character label selection (zoom-aware), fd4c7c5 feat(studio): box nodes rendered in canvas, sized to text, single label (legacy parity, fixes duplicate/oversize), buildConnectedDimStyle(), buildGraphRendererPayload(), clampUnit(), cloneStyle(), colorForGroup() (+27 more)

### Community 64 - "Community 64"
Cohesion: 0.12
Nodes (37): add(), artifactHashes(), artifactPathFor(), asRecord(), candidateArrayFromReconciliation(), computeDataOnlyChromeHashes(), computeGraphCitationSignatureFromJson(), DataOnlyChromeHashes (+29 more)

### Community 65 - "Community 65"
Cohesion: 0.07
Nodes (34): DPR_MATRIX, ZOOM_MATRIX, contentBBox(), BOX_GL_FIXTURES, BOX_TEXT_RGB, clampCorner(), AtlasCanvasFactory, AtlasEntry (+26 more)

### Community 66 - "Community 66"
Cohesion: 0.08
Nodes (26): InMemoryPgState, makeFakePgModule(), makePgVectorStore(), RecordedQuery, createPgVectorStore(), deriveNamespace(), GraphStoreConfig, PgClientLike (+18 more)

### Community 67 - "Community 67"
Cohesion: 0.08
Nodes (33): 2289b42 fix(graph): premultiplied alpha for the WebGL2 beta (hover-dim + edge fringe), 84c4152 fix(graph): heavier WebGL2 beta edge + outline stroke (UAT polish), ce37c99 test(graph): premultiplied-alpha hover-dim regression (shapes golden), BOX_FILL, unitOutlinePoints(), unitShapeGeometry(), fmt(), shapeCode() (+25 more)

### Community 68 - "Community 68"
Cohesion: 0.08
Nodes (27): e6d93f2 feat(ontology): WP4 process-std-AM hierarchy lifecycle — overlay status + UAT evidence, arcStatus(), buildOneHierarchy(), buildSceneHierarchySidecar(), BuildSceneHierarchySidecarOptions, arcNodeIds(), clearSceneHierarchiesEmitterCache(), emitSceneHierarchies() (+19 more)

### Community 69 - "Community 69"
Cohesion: 0.10
Nodes (36): f7b39c4 Track G Lot 1 (G1+G2): workspace tokens + shell scaffold (#47), buildNodeFacts(), CompactDescriptionContext, computeCounters(), CountersValues, DEFAULT_INLINE_FACTS, DEFAULT_SECTIONS, displayValue() (+28 more)

### Community 70 - "Community 70"
Cohesion: 0.09
Nodes (35): asRecord(), bucketMatches(), calibrateImageRouting(), countArray(), imageRoutingSampleFromCaption(), loadImageRoutingLabels(), loadImageRoutingRules(), normalizeBucket() (+27 more)

### Community 71 - "Community 71"
Cohesion: 0.08
Nodes (30): godNodes(), isConceptNode(), isFileNode(), isJsonKeyNode(), buildFirstHopSummary(), buildNextBestAction(), communityLabels(), communityMembership() (+22 more)

### Community 72 - "Community 72"
Cohesion: 0.10
Nodes (37): asBoolean(), asNonNegativeNumber(), asPositiveInteger(), asRecord(), asString(), asStringArray(), CitationExtractionContract, loadQualityTargetsConfig() (+29 more)

### Community 73 - "Community 73"
Cohesion: 0.09
Nodes (29): 1092f4b Merge pull request #39 from rhanka/feat/track-f-upstream-parity-p1-p2-m1, 465430e chore(release): bump lock to 0.15.0 + changelog entry + release-config test, 6857518 Merge pull request #39 from rhanka/feat/track-f-upstream-parity-p1-p2-m1, 6a00692 fix(track-f): antigravity path/project-install/uninstall-tree/Read-Glob hook (F-0820-0827, M11/M12/M23/M24), 6a61cbd F upstream parity p1 p2 m1, 77e0834 ci: smoke-test verifies buildStaticStudio export (toHtml removed in 0.15), 7e73508 chore(release): 0.15.0 — eradicate legacy graph.html, static studio export only (BREAKING), 89db804 chore(track-f): update bilan with F-0820-0827 correctness lot results (M5/M6/M9/M10/M11/M12/M13/M15/M21/M23/M24/M26) (+21 more)

### Community 74 - "Community 74"
Cohesion: 0.09
Nodes (29): 03d6f5d Merge pull request #18 from rhanka/feat/wiki-reconciliation-ui, 1ce0e3b Ignore local dotenv files, 2127b64 feat: add ontology write mcp mode, 3eda59f Merge pull request #15 from rhanka/feat/ontology-lifecycle-core, 61c3eb0 Add ontology reconciliation candidate queue, 657af78 chore(release): bump version to 0.7.5, c3b8d99 feat: add ontology patch apply core, e8d09bb Add product acceleration core helpers (+21 more)

### Community 75 - "Community 75"
Cohesion: 0.10
Nodes (32): 9408561 feat(conversations): connector claude/codex/cursor/gemini -> Extraction (WP5), buildConversationsExtraction(), BuildConversationsExtractionOptions, ClaudeCommitResolveOptions, collectPromptStats(), ConversationCompactionEvent, ConversationEventBase, conversationId() (+24 more)

### Community 76 - "Community 76"
Cohesion: 0.09
Nodes (34): allowedPathFor(), buildOntologyDiscoveryDiff(), buildOntologyDiscoverySample(), knownEvidenceRefs(), loadOntologyDiscoveryContext(), OntologyDiscoveryContext, ontologyDiscoveryDiffToMarkdown(), OntologyDiscoveryProposal (+26 more)

### Community 77 - "Community 77"
Cohesion: 0.10
Nodes (34): buildFallbackSidecar(), buildTargetContentHash(), buildWikiDescriptionPrompt(), BuildWikiDescriptionPromptOptions, collectCommunityTargetContext(), collectInferredCommunityMap(), collectNodeNeighbors(), collectNodeTargetContext() (+26 more)

### Community 78 - "Community 78"
Cohesion: 0.09
Nodes (32): GitCommitMeta, aliasForCwd(), buildProjectGraph(), BuildProjectGraphOptions, COMMUNITY, COMMUNITY_LABELS, envelope(), GraphEdgeOut (+24 more)

### Community 79 - "Community 79"
Cohesion: 0.09
Nodes (25): 3049235 feat(search): make search-index reachable to the studio (server route + offline bundle), 41d85d5 fix(studio-export): guard destructive exports, snapshot sources, early profile + stale-bundle cleanup, 66e6489 feat(studio): replace legacy vis-network graph.html with a static Ontology Studio export, 7c40ee2 docs(skills): replace graph.html/HTML-viz with the static studio export across all 8 skills, 8395abd feat(studio): auto-remove a stale legacy graph viz on default emit (migration), 8d873f2 fix(exports): surface CitedSourceRef/CitationModality/OntologyCitation from the public barrel, b5b50e1 test: update codex skill assertion to the static studio export flow, f21f125 feat(search): offline GraphRAG — BM25F + RRF + PPR + answer-pack (work-stream C Phase A) (#192) (+17 more)

### Community 80 - "Community 80"
Cohesion: 0.15
Nodes (27): 98eab37 feat(studio): fetchWindow accessor for the windowed loader (LOT 3, client-integration deferred), BUNDLE_ABSENT, bundleGet(), bundlePresent(), fetchClassHierarchies(), fetchEntity(), fetchGraph(), fetchGroupCounts() (+19 more)

### Community 81 - "Community 81"
Cohesion: 0.06
Nodes (34): build_url_with_params(), flatten_queryparams(), is_known_encoding(), normalize_header_key(), obfuscate_sensitive_headers(), parse_content_type(), primitive_value_to_str(), Utility functions shared across the library. Small helpers that don't belong in (+26 more)

### Community 82 - "Community 82"
Cohesion: 0.08
Nodes (28): average(), countHits(), evaluateReviewBenchmarks(), flowIdentifiers(), formatMetric(), identifiers(), normalize(), ratio() (+20 more)

### Community 83 - "Community 83"
Cohesion: 0.11
Nodes (31): buildReviewContext(), buildReviewGuidance(), buildSourceSnippets(), changedFunctionsWithoutTests(), extractRelevantLines(), formatLines(), isInside(), isSensitivePath() (+23 more)

### Community 84 - "Community 84"
Cohesion: 0.19
Nodes (34): ac(), Be(), cf(), Dd(), de(), Dn(), Do(), dv() (+26 more)

### Community 85 - "Community 85"
Cohesion: 0.09
Nodes (26): 2bb1514 Merge origin/main into feat/time-oriented-view, 3088f4c fix(build): vendor @sentropic/graph typed-layer export so installed CLI resolves, 4564621 feat(graph): time-oriented lanes by repo/project + optional type sub-lanes, 676f4fc feat(graph): inflected (S-curve) edge style, opt-in per scene, 678f9eb feat(layout): time-oriented layout (Variant E) in registry (2D, opt-in), af8251a feat(graph): time-oriented lanes by repo/project + optional type sub-lanes, e619e54 feat(scene): wire repo lanes into the time-oriented studio export, fead34d feat(scene): wire inflected edges into the time-oriented studio export (+18 more)

### Community 86 - "Community 86"
Cohesion: 0.10
Nodes (25): 54d8c24 Harden graphify description contract, d5863ed Merge pull request #23 from rhanka/feat/post-0710-product-acceleration, df849e3 Merge pull request #23 from rhanka/feat/post-0710-product-acceleration, efa8b6b Start post-0.7.10 product acceleration, OntologyWriteFixture, communityArticle(), crossCommunityLinks(), WIKI_DESCRIPTION_SCHEMA (+17 more)

### Community 87 - "Community 87"
Cohesion: 0.13
Nodes (30): 62545ae F M2 (2/6): port upstream d84f07c — node-ID dedup, cache fastpath, absolute paths relativization, absolutizeSourceFilesIn(), bodyContent(), CACHE_BUCKETS, cachedFiles(), cacheDir(), cacheKind(), cacheNamespace() (+22 more)

### Community 88 - "Community 88"
Cohesion: 0.12
Nodes (32): antigravityInstall(), _antigravityWriteRulesWorkflows(), canonicalPlatformName(), claudeInstall(), emptyPreview(), findSkillFile(), globalSkillInstallPreview(), installClaudeHook() (+24 more)

### Community 89 - "Community 89"
Cohesion: 0.07
Nodes (23): main(), NewServer(), process(), Processor, validate(), net8.0, Domain.csproj, Infrastructure.csproj (+15 more)

### Community 90 - "Community 90"
Cohesion: 0.06
Nodes (19): writeOntologyWriteFixture(), boxes, central, dir, fixture, headingMatches, pills, result (+11 more)

### Community 91 - "Community 91"
Cohesion: 0.11
Nodes (32): delete_record(), _ensure_storage(), list_records(), load_index(), load_record(), Storage module - persists documents to disk and maintains the search index. All, Load the full document index from disk., Persist the index to disk. (+24 more)

### Community 92 - "Community 92"
Cohesion: 0.12
Nodes (25): OntologyReconciliationDecisionLogOptions, activeViewFromQuery(), candidateFilters(), decisionLogOptions(), graphHtmlArtifactResult(), graphJsonResult(), handleOntologyGroupsRequest(), handleOntologyStudioRequest() (+17 more)

### Community 93 - "Community 93"
Cohesion: 0.07
Nodes (22): FileGraphStore, FileStoreClearOptions, GraphStore, moduleDir(), resolveToolVersion(), createNeo4jGraphStore(), deriveNamespace(), GraphStore (+14 more)

### Community 94 - "Community 94"
Cohesion: 0.11
Nodes (26): CommitConflict, correlate(), CorrelateInput, detectCommitConflicts(), findByScan(), indexCommits(), indexPrMergesByBranch(), isHousekeepingBranch() (+18 more)

### Community 95 - "Community 95"
Cohesion: 0.13
Nodes (29): currentBranch(), currentHead(), lifecyclePaths(), markLifecycleAnalyzed(), markLifecycleStale(), mergeBase(), planLifecyclePrune(), readJson() (+21 more)

### Community 96 - "Community 96"
Cohesion: 0.10
Nodes (28): codeLanguage(), crossCommunitySurprises(), crossFileSurprises(), edgeBetweennessSurprises(), fileCategory(), graphDiff(), GraphInstance, JSON_NOISE_LABELS (+20 more)

### Community 97 - "Community 97"
Cohesion: 0.11
Nodes (29): CACHED_AUDIO_EXTENSIONS, defaultWhisperCacheDir(), downloadFile(), ensureWhisperArtifacts(), envBoolean(), envNumber(), extractTranscriptText(), FasterWhisperModel (+21 more)

### Community 98 - "Community 98"
Cohesion: 0.09
Nodes (25): 3d3f61c docs(v6): close v0.6.7 traceability deltas, 7a3ba4c feat(v6): close v0.6.9 clustering and source-file parity, canonicalizeForPartition(), cluster(), ClusterOptions, cohesionScore(), partition(), remapCommunitiesToPrevious() (+17 more)

### Community 99 - "Community 99"
Cohesion: 0.11
Nodes (23): applyEntry(), collectEntries(), gitAdvice(), migrateGraphifyOut(), normalizeGitPath(), planGraphifyOutMigration(), shellQuote(), applyEntry() (+15 more)

### Community 100 - "Community 100"
Cohesion: 0.09
Nodes (21): asNumber(), asString(), createReviewGraphStore(), isTestPath(), KNOWN_KINDS, normalizeKind(), normalizePath(), parseLineRange() (+13 more)

### Community 101 - "Community 101"
Cohesion: 0.09
Nodes (27): 5c0cb80 Add wiki describe sidecar generation CLI, bc882be Add Ollama as a credential-free direct LLM provider, AssistantLlmClientOptions, BatchTextJsonImportInput, BatchTextJsonImportResult, BatchVisionExportInput, BatchVisionExportResult, BatchVisionImportInput (+19 more)

### Community 102 - "Community 102"
Cohesion: 0.09
Nodes (22): buildRenderGraphBuffers(), buildStyleBuffers(), clampByte(), computeGodClassType(), computeNodeDegrees(), dashCode(), DEFAULT_EDGE_COLOR, DEFAULT_NODE_COLOR (+14 more)

### Community 103 - "Community 103"
Cohesion: 0.13
Nodes (28): collectJsonIssues(), collectStringIssues(), collectTextIssues(), COMMON_POSIX_LOCAL_PATH_PREFIXES, hasSchemePrefix(), isIgnoredLocalArtifact(), isLikelyLocalAbsolutePath(), isWindowsAbsolutePath() (+20 more)

### Community 104 - "Community 104"
Cohesion: 0.09
Nodes (21): 32d1d93 F M2 (6/6): port upstream 850c545 — raise FILE_COUNT_UPPER 200 -> 500, 3544d19 Release 0.9.6: F-M2 port upstream v0.8.11->v0.8.13 + Track C-3.5, 5d60bd2 F M2 (4/6): port upstream 6939494 — backupIfProtected snapshot before overwrite, 65a45e9 Refresh .graphify after F-M2 ports on 0.9.6, a9d8256 F M2 (5/6): port upstream 2209a9c — treat `graphify <path>` as `graphify extract <path>`, DOC_EXTENSIONS, IMAGE_EXTENSIONS, PAPER_EXTENSIONS (+13 more)

### Community 105 - "Community 105"
Cohesion: 0.13
Nodes (24): ae0c7ed feat: add ontology discovery proposal workflow, f1d2fce feat: extend ontology lifecycle profile validation, OntologyDiscoverySample, buildProfileChunkPrompt(), buildProfileDiscoveryPrompt(), buildProfileExtractionPrompt(), buildProfileValidationPrompt(), chunkGuidance() (+16 more)

### Community 106 - "Community 106"
Cohesion: 0.11
Nodes (20): field(), loadProfileRegistry(), normalizeRegistryRecord(), readRegistryRows(), registryRecordsToExtraction(), safeIdPart(), field(), loadProfileRegistries() (+12 more)

### Community 107 - "Community 107"
Cohesion: 0.12
Nodes (28): _csharpExtraWalk(), _findRequireCall(), _getCFuncName(), _getCppFuncName(), _importC(), _importCsharp(), _importJava(), _importJs() (+20 more)

### Community 108 - "Community 108"
Cohesion: 0.16
Nodes (25): buildCodeFileNodeIdMap(), codeFileNodeId(), CommitInfo, defaultBranch(), detectGitWindow(), discoverBranches(), edgeKey(), emptyExtraction() (+17 more)

### Community 109 - "Community 109"
Cohesion: 0.10
Nodes (25): appendRationaleAttr(), INVALID_FILE_TYPES_FOR_SANITIZE, isPlainObject(), isSentenceLikeRationaleLabel(), LoadValidatedResult, loadValidatedSemanticFragment(), sanitizeSemanticFragment(), SemanticFragment (+17 more)

### Community 110 - "Community 110"
Cohesion: 0.12
Nodes (20): 2810e65 feat(gh): extract pull requests to graphify Extraction (WP9), 29bf908 fix(gh): emit full commit shas for cross-profile join with extract-git (WP9 gate), aggregateChecks(), CheckAggregate, checkBucket(), commitSha(), edgeKey(), emptyExtraction() (+12 more)

### Community 111 - "Community 111"
Cohesion: 0.11
Nodes (20): 8a15e10 test(cited-source): modality-aware validation cases (pdf page-required, md/txt page-less, bbox), 9c081e3 feat(cited-source): export Lot-0 projection/validator from package index, ab7d678 feat(cited-source): modality-aware validateCitedSourceRef + multisource (md/txt), ac93a12 docs(cited-source): reconcile spec with modality-aware multisource validation, b17d33b chore(track): resolve WP1 WebGL2 fidelity bugs (edge + outline width) — golden-gated at 2266cfa, asNumberPage(), citationsToCitedSourceRefs(), citationToCitedSourceRef() (+12 more)

### Community 112 - "Community 112"
Cohesion: 0.10
Nodes (26): batch_parse(), parse_and_save(), parse_file(), parse_json(), parse_markdown(), parse_plaintext(), Parser module - reads raw input documents and converts them into a structured fo, Read a file from disk and return a structured document. (+18 more)

### Community 113 - "Community 113"
Cohesion: 0.10
Nodes (26): enrich_document(), extract_keywords(), find_cross_references(), normalize_text(), process_and_save(), Processor module - transforms validated documents into enriched records ready fo, Lowercase, strip extra whitespace, remove control characters., Pull non-stopword tokens from text, deduplicated. (+18 more)

### Community 114 - "Community 114"
Cohesion: 0.09
Nodes (23): args, artifactSourcePath(), buildResolvedTargetManifest(), candidatesPath, candidatesResponse, classHierarchiesResult, die(), entities (+15 more)

### Community 115 - "Community 115"
Cohesion: 0.08
Nodes (21): 097d796 feat(cli): --no-single-file / --full-offline on `studio export` + default emit, 102fd1c build(studio): flag-gated single-file Vite variant + studio-template.html, 199e3cc feat(export): --include-sources bundles cited source files under sources/ (cited-source viewer), 392abf7 docs(spec): offline file:// double-click static studio export (work-stream A), 3cfccdb docs(studio): cited-source viewer seam, sources/ pathing + honest works-where matrix, 4e9452b feat(studio): open-source affordance + cited-source modal wiring (impure glue via frozen converters), 646e54e feat(studio): cited-source viewer v2 — S.6 qualified UX (immo parity), 7379f9a build(studio): lock vite-plugin-singlefile@2.3.3 (offline single-file build) (+13 more)

### Community 116 - "Community 116"
Cohesion: 0.08
Nodes (24): 0f32886 F M2 (3/6): port upstream f5fea13 — LLM empty / filtered response guard, 5744240 feat(llm): honor direct provider base URL envs, createAssistantTextJsonClient(), createAssistantVisionJsonClient(), parseJsonFromLlmText(), redactSecrets(), anthropicMock, cleanupDirs (+16 more)

### Community 117 - "Community 117"
Cohesion: 0.12
Nodes (22): 103605a feat(storage): runStorePush/runStoreStatus — reusable store push + status, 653ce85 feat(cli): graphify store push|status + ontology studio --store, communitiesFromGraph(), communityLabelsFromGraph(), loadConfig(), normalizeMode(), openStore(), printPushSummary() (+14 more)

### Community 118 - "Community 118"
Cohesion: 0.11
Nodes (21): 2fa6678 feat(pdf-ocr): emit <stem>.ocr.json structured sidecar from OCR v4 response, 7b8f592 feat(pdf-ocr): pure bridge mapping OCR v4 pages -> CitedSourceRef, asArray(), asFiniteNumber(), asRecord(), BuildPdfOcrPagesInput, buildPdfOcrPagesSidecar(), clampUnit() (+13 more)

### Community 119 - "Community 119"
Cohesion: 0.08
Nodes (24): extractC(), extractCpp(), extractCsharp(), _extractGeneric(), extractJava(), extractJs(), extractKotlin(), extractLua() (+16 more)

### Community 120 - "Community 120"
Cohesion: 0.10
Nodes (23): AffectedFlowsResult, ReviewFlowArtifact, appendFreshnessSection(), appendInputScopeSection(), appendReviewSections(), formatFlow(), generate(), GenerateReportOptions (+15 more)

### Community 121 - "Community 121"
Cohesion: 0.13
Nodes (19): applyRepulsion(), attachLayoutPositions(), computeLayout(), ComputeLayoutOptions, defaultLayoutIterations(), fastLayoutEnabled(), insert(), LayoutGraphEdge (+11 more)

### Community 122 - "Community 122"
Cohesion: 0.10
Nodes (20): 6ee0295 Merge pull request #21 from rhanka/feat/upstream-0.7.10-lot3-incremental, 7493d73 chore(graphify): refresh graph artifacts after antigravity parity, 76c6686 Harden community-labels file parsing and extend test coverage, 78499cb test(v6): cover portable path and reinstall parity, e7c7983 Refresh graph after community-labels hardening, buildProject(), BuildProjectArtifacts, BuildProjectOptions (+12 more)

### Community 123 - "Community 123"
Cohesion: 0.13
Nodes (20): AliasDerivationConfig, DeOrphanConfig, SchemaHygieneConfig, applyAssemblyHygiene(), asRecord(), AssemblyHygieneOptions, asString(), buildFromJson() (+12 more)

### Community 124 - "Community 124"
Cohesion: 0.13
Nodes (23): asCitations(), buildAdjacency(), canonicalId(), canonicalType(), capitalize(), DEFAULT_CONTAINER_TYPES_FINEST_FIRST, DEFAULT_HONORIFICS, DEFAULT_ID_PREFIX_SYNONYMS (+15 more)

### Community 125 - "Community 125"
Cohesion: 0.12
Nodes (21): ai(), al(), As(), At(), Ee(), El(), fr, ii() (+13 more)

### Community 126 - "Community 126"
Cohesion: 0.14
Nodes (21): 20dd597 chore(graphify): refresh graph artifacts after tree and ignore parity, 2b5e757 Release 0.9.6: F-M2 port upstream v0.8.11→v0.8.13 + Track C-3.5 wiring (#46), 609fbc6 Add Markdown and Quarto structural extraction, 63686a4 Add TypeScript and TSX parser parity, 6425854 Refresh graph after parser surface catch-up, 8637d56 Merge pull request #20 from rhanka/feat/upstream-0.7.10-lot2-commonjs, 86e8567 F M2 (1/6): port upstream 2d783e5 — cohesion unrounded, save_manifest seed, --resolution + --exclude-hubs, 98bb769 Add no-Python fallback language coverage (+13 more)

### Community 127 - "Community 127"
Cohesion: 0.13
Nodes (18): 4ba8600 UPSTREAM_GAP: record v2 hypergraph as already-covered, withdraw 0.10.0 schema-delta prediction, 6b80ad1 Track F-H1: typed hyperedges data layer (cleanup) + UPSTREAM_GAP v2 already-covered (#48), db91d04 wip(hypergraph): scaffold hyperedges data layer (F-H1, no PR), SerializedGraphData, CONFIDENCE_VALUES, loadHyperedges(), mergeHyperedges(), setHyperedges() (+10 more)

### Community 128 - "Community 128"
Cohesion: 0.11
Nodes (17): agentsInstall(), geminiInstall(), getAgentsMdSection(), getInvocationExample(), installCodexHook(), installGeminiMcp(), replaceOrAppendSection(), tempDirs (+9 more)

### Community 129 - "Community 129"
Cohesion: 0.08
Nodes (22): validateHyperedge(), a, aFlow, aSnapshot, b, bFlow, bSnapshot, cFlow (+14 more)

### Community 130 - "Community 130"
Cohesion: 0.16
Nodes (20): ALLOWED_SCHEMES, BLOCKED_HOSTS, embeddedIPv4(), escapeHtml(), expandIPv6(), isLinkLocalIp(), isPrivateIp(), isRedirectStatus() (+12 more)

### Community 131 - "Community 131"
Cohesion: 0.16
Nodes (22): buildRelationRows(), displayValue(), EntityOccurrence, EntityPanelOccurrences, entityPanelStyles(), escapeHtml(), graphEdges(), HTML_ESCAPE_MAP (+14 more)

### Community 132 - "Community 132"
Cohesion: 0.11
Nodes (22): bl(), Cs(), En(), fl(), Gt(), hl(), Hr(), Is() (+14 more)

### Community 133 - "Community 133"
Cohesion: 0.15
Nodes (17): 05ee028 Add optional Google Workspace shortcut export, 93560d5 Address Lot 4 provider review fixes, dfc9b44 Refresh graph after Lot 4 review fixes, convertGoogleWorkspaceFile(), ConvertGoogleWorkspaceOptions, createDefaultGoogleWorkspaceFetcher(), EXPORT_MIME_TYPE_BY_EXTENSION, extractFileIdFromUrl() (+9 more)

### Community 134 - "Community 134"
Cohesion: 0.16
Nodes (20): applyConfiguredExcludes(), buildConfiguredDetectionInputs(), buildProfileState(), ConfiguredDataprepOptions, ConfiguredDataprepResult, ConfiguredDetectionInputs, dataprepReport(), DETECTION_FILE_TYPES (+12 more)

### Community 135 - "Community 135"
Cohesion: 0.13
Nodes (16): AllChunksFailedError, createDirectSemanticExtractionClient(), DirectSemanticChunk, DirectSemanticClientOptions, DirectSemanticExtractionClient, DirectSemanticExtractionOptions, DirectSemanticFile, estimateFileTokens() (+8 more)

### Community 136 - "Community 136"
Cohesion: 0.09
Nodes (18): extract(), ExtractionResult, extractWithDiagnostics(), inferCommonRoot(), isMcpConfigPath(), _mergeSwiftExtensions(), codeBlockNodes, labels (+10 more)

### Community 137 - "Community 137"
Cohesion: 0.09
Nodes (16): createSpannerGraphStore(), deriveNamespace(), EDGE_SCHEMA_COLS, GraphStore, GraphStoreConfig, moduleDir(), NODE_SCHEMA_COLS, resolveToolVersion() (+8 more)

### Community 138 - "Community 138"
Cohesion: 0.11
Nodes (20): build_graph(), cluster(), cohesion_score(), Leiden community detection on NetworkX graphs. Splits oversized communities. Ret, Run Leiden community detection. Returns {community_id: [node_ids]}.      Communi, Build a NetworkX graph from graphify node/edge dicts.      Preserves original ed, Run a second Leiden pass on a community subgraph to split it further., Ratio of actual intra-community edges to maximum possible. (+12 more)

### Community 139 - "Community 139"
Cohesion: 0.13
Nodes (17): agentsUninstall(), antigravityUninstall(), claudeUninstall(), cursorInstall(), cursorUninstall(), geminiUninstall(), kiroUninstall(), projectUninstall() (+9 more)

### Community 140 - "Community 140"
Cohesion: 0.14
Nodes (12): CODE_GIT_ONTOLOGY_PROFILE, branchId(), commitId(), defaultRepoKeyRunner, remoteKeyFromUrl(), repoKey(), RepoKeyRunner, commit() (+4 more)

### Community 141 - "Community 141"
Cohesion: 0.14
Nodes (19): aliasHit, hit, hits, i18nRecords, ids, index, lower, minimal (+11 more)

### Community 142 - "Community 142"
Cohesion: 0.15
Nodes (16): artifactHasDeepRoute(), asRecord(), existingValidSidecarErrors(), importImageDataprepBatchResults(), readCaption(), readJsonl(), artifactHasDeepRoute(), asRecord() (+8 more)

### Community 143 - "Community 143"
Cohesion: 0.15
Nodes (16): buildMinimalContext(), riskFromScore(), suggestionsForTask(), topCommunities(), topFlowNames(), uniqueSorted(), buildMinimalContext(), BuildMinimalContextOptions (+8 more)

### Community 144 - "Community 144"
Cohesion: 0.17
Nodes (17): augmentDetectionWithPdfPreflight(), cloneDetection(), countWords(), dedupe(), listImageArtifacts(), loadMistralOcrModule(), metadataPath(), MistralOcrModule (+9 more)

### Community 145 - "Community 145"
Cohesion: 0.14
Nodes (12): buildWorkspaceManifest(), BuildWorkspaceManifestOptions, BUNDLE_ARTIFACTS, BundleArtifactSpec, emitWorkspaceManifest(), EmitWorkspaceManifestOptions, EmitWorkspaceManifestResult, WORKSPACE_MANIFEST_SCHEMA_VERSION (+4 more)

### Community 146 - "Community 146"
Cohesion: 0.15
Nodes (7): Hn(), il, jo(), Nt(), ol(), ul(), yi()

### Community 147 - "Community 147"
Cohesion: 0.11
Nodes (6): 0a173d0 Merge remote-tracking branch 'origin/main' into pr/c-graphrag-phase-a, destDist, destPkgDir, root, srcDist, srcPkgDir

### Community 148 - "Community 148"
Cohesion: 0.16
Nodes (15): BatchTextJsonClient, BatchTextJsonExportInput, BatchTextJsonExportResult, buildTargetKindsMap(), buildWikiDescriptionBatchExport(), BuildWikiDescriptionBatchOptions, exportWikiDescriptionBatchToJsonl(), ParseWikiDescriptionBatchOptions (+7 more)

### Community 149 - "Community 149"
Cohesion: 0.29
Nodes (18): addLabelCandidate(), buildResolvableLabelIndex(), ensureParserInit(), extractElixir(), extractGo(), extractJulia(), extractMarkdown(), extractObjc() (+10 more)

### Community 150 - "Community 150"
Cohesion: 0.14
Nodes (15): buildStudioRenderBuffers(), BuildStudioRenderBuffersOptions, edgeWidth(), finiteNumber(), nodeSize(), normalizeOptions(), resolvePosition(), StudioRenderBufferPayload (+7 more)

### Community 151 - "Community 151"
Cohesion: 0.15
Nodes (15): an(), c(), df(), gi(), Gn(), lf(), pi(), qo() (+7 more)

### Community 152 - "Community 152"
Cohesion: 0.14
Nodes (13): 0191fe5 docs(storage): spec the LOT 1 group-by aggregate capability + replace-snapshot guard, 73fa8f7 test(storage): Postgres group-by counts — replace aggregate + merge staleness guard, GraphStore, PostgresGraphStore, answer(), chunkParams(), CountRow, freshArtifactBase() (+5 more)

### Community 153 - "Community 153"
Cohesion: 0.13
Nodes (10): 2d36615 Add global uninstall and repair missing skills, 5d99cb9 Refresh graphify graph after upstream lot1, a39295c Fix buildMerge preserved edge direction, checkSkillVersion(), getPlatformsToCheck(), loadProjectDotEnv(), main(), scopeOptionDescription() (+2 more)

### Community 154 - "Community 154"
Cohesion: 0.18
Nodes (14): 4151efa feat(qa): gate studio publication bundles, 693caa7 feat(qa): evaluate target bundle gates, 860e4dd feat(cli): add graphify qa command, dc13a91 feat(qa): add quality target contract model, ResolvedTargetManifest, NormalizedQualityTarget, graphFixture(), reconciliationQueue() (+6 more)

### Community 155 - "Community 155"
Cohesion: 0.12
Nodes (15): b4caef6 Track G G3: generic workspace viewer state model + URL round-trip + reducer, a, after, b, before, cleared, initial, q (+7 more)

### Community 156 - "Community 156"
Cohesion: 0.21
Nodes (10): Analyzer, compute_score(), normalize(), Fixture: functions and methods that call each other - for call-graph extraction, run_analysis(), Analyzer, compute_score(), normalize() (+2 more)

### Community 157 - "Community 157"
Cohesion: 0.19
Nodes (11): isRecord(), isStringArray(), validateImageCaption(), validateImageRouting(), isRecord(), isStringArray(), VALID_DENSITY, VALID_ROUTING_SIGNAL (+3 more)

### Community 158 - "Community 158"
Cohesion: 0.20
Nodes (15): artifactId(), buildImageDataprepManifest(), BuildImageDataprepManifestOptions, existingImages(), fileHash(), ImageDataprepArtifact, ImageDataprepSourceKind, mimeType() (+7 more)

### Community 159 - "Community 159"
Cohesion: 0.13
Nodes (13): cleanupStaleNodes(), CleanupStaleNodesOptions, CleanupStaleNodesResult, cleanupDirs, dir, formatted, G, graph (+5 more)

### Community 160 - "Community 160"
Cohesion: 0.13
Nodes (14): augmentDetectionWithTranscripts(), buildWhisperPrompt(), cloneDetection(), transcribeAll(), cached, hash, modelDir, outDir (+6 more)

### Community 161 - "Community 161"
Cohesion: 0.13
Nodes (10): Core data models: URL, Headers, Cookies, Request, Response. These are the centra, DecodingError, HTTPError, HTTPStatusError, An error occurred while issuing a request., Decoding of the response failed., A 4xx or 5xx response was received., Base class for all httpx exceptions. (+2 more)

### Community 162 - "Community 162"
Cohesion: 0.23
Nodes (14): defaultGraphPath(), defaultManifestPath(), defaultTranscriptsDir(), GraphifyImageDataprepPaths, GraphifyLegacyRootScratchPaths, GraphifyOntologyOutputPaths, GraphifyPathOptions, GraphifyPaths (+6 more)

### Community 163 - "Community 163"
Cohesion: 0.17
Nodes (13): answer(), EdgeRow, freshArtifactBase(), ingestEdges(), ingestNodes(), ingestPositions(), InMemoryPgState, makeFakePgModule() (+5 more)

### Community 164 - "Community 164"
Cohesion: 0.22
Nodes (10): 0089494 feat(studio): WebGL2 dual-render beta switch in GraphCanvas (Ctrl+Shift+X), ca77ff3 feat(studio): render-backend lib for dual-render switch (selection + overlay + fallback), ff907bf test(studio): cover dual-render toggle, WebGL2 fallback, and overlay paint, backendIndicatorLabel(), createBackendRenderer(), isToggleShortcut(), isWebglActive(), paintBoxTextOverlay() (+2 more)

### Community 165 - "Community 165"
Cohesion: 0.18
Nodes (10): 12ab4ef Refresh graph artifacts after B rebase, 48670cc feat: add ontology reconciliation studio shell, 8cf401a feat: polish ontology reconciliation studio, af46746 fix: prevent ontology studio mobile overflow, d216c3d feat: finish ontology reconciliation UAT flow, createOntologyStudioRequestHandler(), generateOntologyStudioToken(), isLoopbackHost() (+2 more)

### Community 166 - "Community 166"
Cohesion: 0.19
Nodes (6): 1bb692e feat(search): in-studio Answer/Search view — DS-styled grounded retrieval (work-stream C), 2661622 feat(search): clean online-prose seam for the studio Answer view (work-stream C, cadrage D2/D3), buildAnswerView(), emptyView(), formatScore(), panelSource

### Community 167 - "Community 167"
Cohesion: 0.26
Nodes (12): d006e09 feat(graph): mat4 column-major helpers + ortho unified-camera view-projection, cameraToViewProjection(), identity(), Mat4, multiply(), ortho(), scale(), transformVec4() (+4 more)

### Community 168 - "Community 168"
Cohesion: 0.17
Nodes (12): bucketLength(), CITATION_POLICY_GLOBAL_DEFAULT, CitationCapValue, CitationPolicyOverrides, CORPUS_TYPE_DEFAULTS, CorpusType, DetectionLike, resolveCitationPolicy() (+4 more)

### Community 169 - "Community 169"
Cohesion: 0.22
Nodes (11): createGraph(), forEachTraversalNeighbor(), isDirectedGraph(), loadGraphFromData(), serializeGraph(), toUndirectedGraph(), traversalNeighbors(), nodeLabel() (+3 more)

### Community 170 - "Community 170"
Cohesion: 0.22
Nodes (14): countImageMarkers(), countWords(), extractPdfTextLayer(), extractWithPdftotext(), extractWithUnpdf(), normalizeText(), pdfOcrSidecarStem(), PdfPreflightOptions (+6 more)

### Community 171 - "Community 171"
Cohesion: 0.14
Nodes (13): arcGeometryStart, arcVertices, buildStart, edgeCount, edges, geometryStart, graph, lineVertices (+5 more)

### Community 172 - "Community 172"
Cohesion: 0.21
Nodes (12): estimateTokens(), loadGraph(), querySubgraphTokens(), runBenchmark(), BenchmarkOptions, estimateTokens(), loadGraph(), printBenchmark() (+4 more)

### Community 173 - "Community 173"
Cohesion: 0.16
Nodes (11): 1d1c0b6 chore(release): 0.17.2 — default Mistral OCR v4, PdfPreparationArtifact, parsePdfOcrMode(), PdfOcrMode, prepareSemanticDetection(), imagePath, outputDir, packageJson (+3 more)

### Community 174 - "Community 174"
Cohesion: 0.15
Nodes (4): 8ab919d fix(studio): recon rail — default select-all + clip labels so score % stays visible, e7920a8 feat(studio): recon union preview of selected candidates (EVOL 1.b), box, label

### Community 175 - "Community 175"
Cohesion: 0.32
Nodes (13): detectUrlType(), downloadBinary(), fetchArxiv(), fetchTweet(), fetchWebpage(), htmlToMarkdown(), ingest(), IngestOptions (+5 more)

### Community 176 - "Community 176"
Cohesion: 0.18
Nodes (10): ALL_EXTRACTED_CITATION_CONTRACT, canonicalize(), canonicalJson(), discoverQualityTargetsConfig(), hashCitationExtractionContract(), hashQualityTarget(), sha256Prefixed(), validateCitationExtractionContractForTarget() (+2 more)

### Community 177 - "Community 177"
Cohesion: 0.27
Nodes (12): RawCodexSession, agyProjectHash(), cwdInRepo(), dedup(), dedupPaths(), factInRepo(), makeRepoScope(), normalizeAgy() (+4 more)

### Community 178 - "Community 178"
Cohesion: 0.17
Nodes (13): Ae(), bi(), Bn(), br(), ec(), Ia(), jl(), nc() (+5 more)

### Community 179 - "Community 179"
Cohesion: 0.22
Nodes (12): 7f60f1f feat(graph): B1-P1 — WebGL2 instanced shapes/nodes canary (flag-gated, default canvas2d), CHROME_CANDIDATES, __dirname, DIST_DIR, findChrome(), getJson(), GRAPH_PKG, MIME (+4 more)

### Community 180 - "Community 180"
Cohesion: 0.27
Nodes (9): cloneRepo(), CloneRepoOptions, CloneRepoResult, defaultCloneDestination(), execGit(), GithubRepoRef, maybeGithubRepo(), repoNameFromUrl() (+1 more)

### Community 181 - "Community 181"
Cohesion: 0.17
Nodes (11): ast, cached, dir, fresh, input, merged, outPath, runMain() (+3 more)

### Community 182 - "Community 182"
Cohesion: 0.20
Nodes (8): TextJsonGenerationClient, TextJsonGenerationInput, TextJsonGenerationResult, createGraphifyMesh(), CreateGraphifyMeshOptions, meshTextJsonClient(), MeshTextJsonClientOptions, tempDirs

### Community 183 - "Community 183"
Cohesion: 0.21
Nodes (9): GraphNode, adjacency(), components(), endpoint(), HERE, INPUT, measure(), PROOF_DIR (+1 more)

### Community 184 - "Community 184"
Cohesion: 0.29
Nodes (10): 5d37712 docs(spec): document de-orphan giant-component join (TRACKED #3), da9e0c6 fix(assembly-hygiene): de-orphan joins giant component, no 2-node islands, deriveAliasesAndNormalizedTerms(), edge(), endpoint(), extraction(), islandScenario(), node() (+2 more)

### Community 185 - "Community 185"
Cohesion: 0.20
Nodes (9): 683acba Limit direct LLM UAT output tokens, f7cbadc Refresh graph after direct LLM UAT token cap, createDirectTextJsonClient(), defaultDirectLlmModel(), DirectLlmProvider, resolveMaxOutputTokens(), PROVIDERS, providerSelection (+1 more)

### Community 186 - "Community 186"
Cohesion: 0.20
Nodes (8): ImageDataprepManifest, assertAcceptedImageRoutingRules(), bucketMatches(), calibrateImageRouting(), requiresDeep(), routeImageWithRules(), writeImageRoutingCalibrationSamples(), cleanupDirs

### Community 187 - "Community 187"
Cohesion: 0.18
Nodes (10): build(), attrs, edge, ext, ext1, ext2, G, hyper (+2 more)

### Community 188 - "Community 188"
Cohesion: 0.18
Nodes (11): braceDelta(), extractAstro(), extractGroovy(), extractRegexBackedCode(), extractSql(), extractSvelte(), lineForIndex(), normalizeSqlObjectName() (+3 more)

### Community 189 - "Community 189"
Cohesion: 0.18
Nodes (10): communities, communityLabels, dir, G, list, long, outPath, result (+2 more)

### Community 190 - "Community 190"
Cohesion: 0.18
Nodes (9): allStale, article, communities, count, formatted, G, LABELS, stale (+1 more)

### Community 191 - "Community 191"
Cohesion: 0.18
Nodes (9): focused, graph, graphJsonShape, html, state, strongOnly, subgraph, tokens (+1 more)

### Community 192 - "Community 192"
Cohesion: 0.33
Nodes (9): addCall(), addFunction(), makeFlowStore(), qn(), getAffectedFlows(), addCall(), addFunction(), makeFlowStore() (+1 more)

### Community 193 - "Community 193"
Cohesion: 0.27
Nodes (8): Base, LinearAlgebra, area(), Circle, describe(), Geometry, Point, Shape

### Community 194 - "Community 194"
Cohesion: 0.20
Nodes (7): MCP_CONFIG_FILENAMES, collectFiles(), extractMcpConfig(), _extractMcpConfigAsync(), _mcpDetectPackageFromArgs(), _mcpStripVersion(), tempDirs

### Community 195 - "Community 195"
Cohesion: 0.27
Nodes (2): ConnectionPool, Manages a pool of persistent HTTP connections.     Keys connections by (scheme,

### Community 196 - "Community 196"
Cohesion: 0.22
Nodes (9): hs(), ku(), Ln(), mo(), Nu(), Pn(), qu(), Ru() (+1 more)

### Community 197 - "Community 197"
Cohesion: 0.22
Nodes (4): SemanticPreparationOptions, SemanticPreparationResult, cleanupDirs, fixtureRoot

### Community 198 - "Community 198"
Cohesion: 0.31
Nodes (8): CHROME_CANDIDATES, __dirname, findChrome(), getJson(), GL_FLAGS, GRAPH_PKG, main(), require

### Community 199 - "Community 199"
Cohesion: 0.39
Nodes (8): addCall(), addFunction(), makeStore(), qn(), addCall(), addFunction(), makeStore(), qn()

### Community 200 - "Community 200"
Cohesion: 0.39
Nodes (8): addCall(), addFunction(), makeBenchmarkStore(), qn(), addCall(), addFunction(), makeBenchmarkStore(), qn()

### Community 201 - "Community 201"
Cohesion: 0.25
Nodes (2): DataProcessor, IProcessor

### Community 202 - "Community 202"
Cohesion: 0.31
Nodes (8): arcControl(), buildEdgePolylinePositions(), EdgeCurveMode, EdgePolylineOptions, Point, quadraticPoint(), readPoint(), RenderGraphInput

### Community 203 - "Community 203"
Cohesion: 0.31
Nodes (7): assertGraphJsonFileSize(), assertGraphJsonSize(), GraphSizeMode, dir, message, missing, path

### Community 204 - "Community 204"
Cohesion: 0.33
Nodes (7): CustomProviderConfig, CustomProviderMap, globalProvidersPath(), loadCustomProviders(), LoadCustomProvidersOptions, localProvidersPath(), providerBaseUrlOk()

### Community 205 - "Community 205"
Cohesion: 0.31
Nodes (5): cites(), cleanupDirs, hub(), setupProject(), tempDir()

### Community 206 - "Community 206"
Cohesion: 0.25
Nodes (3): exportImageDataprepBatchRequests(), ImageRoutingRulesFile, cleanupDirs

### Community 207 - "Community 207"
Cohesion: 0.29
Nodes (7): args, die(), manifest, manifestModels, outDir, parseArgs(), root

### Community 208 - "Community 208"
Cohesion: 0.25
Nodes (5): edges, forward, order1, order2, reversed

### Community 209 - "Community 209"
Cohesion: 0.25
Nodes (6): importsFromBarrel, importsFromTargets, labels, reExports, reExportTagged, targets

### Community 210 - "Community 210"
Cohesion: 0.25
Nodes (2): cleanupDirs, PROVIDER_KEYS

### Community 211 - "Community 211"
Cohesion: 0.25
Nodes (6): graph, html, occurrences, panelIdx, slotIdx, tokens

### Community 212 - "Community 212"
Cohesion: 0.25
Nodes (7): dataset, dirty, facets, keys, slices, state, status

### Community 213 - "Community 213"
Cohesion: 0.25
Nodes (7): graph, html, idxChar, idxLoc, idxWork, state, tokens

### Community 214 - "Community 214"
Cohesion: 0.38
Nodes (6): build(), build_from_json(), Merge multiple extraction results into one graph., build(), build_from_json(), Merge multiple extraction results into one graph.

### Community 215 - "Community 215"
Cohesion: 0.33
Nodes (7): 21b4be3 Refresh graph after SQL extraction rebase, 2f660d1 Merge pull request #19 from rhanka/feat/upstream-0.7.10-lot2, 387c7f6 Refresh graph after SQL extraction merge, bbdc4fd Refresh graph after CommonJS extraction update, d04e70d Refresh graph after ontology reconciliation merge, d1f6817 Add CommonJS require extraction, d6889f5 Add SQL schema-qualified FK extraction

### Community 216 - "Community 216"
Cohesion: 0.29
Nodes (6): 4d7296f Complete upstream 0.7.10 parity closure, dc7561f Refresh graph after upstream 0.7.10 parity closure, downloadAudio(), runCommand(), cleanupDirs, downloadAudioMock

### Community 217 - "Community 217"
Cohesion: 0.29
Nodes (5): Server, main(), NewServer(), process(), validate()

### Community 218 - "Community 218"
Cohesion: 0.29
Nodes (3): parseCitationCapFlag(), parseTopKFlag(), cleanupDirs

### Community 219 - "Community 219"
Cohesion: 0.38
Nodes (4): tempDirs, write(), writeGraph(), writeJson()

### Community 220 - "Community 220"
Cohesion: 0.29
Nodes (6): evidenceQuery, html, reconHtml, reconQuery, tokens, workspaceHtml

### Community 221 - "Community 221"
Cohesion: 0.29
Nodes (6): query, restored, state, state0, state1, state2

### Community 222 - "Community 222"
Cohesion: 0.33
Nodes (4): 0048854 feat(track-f): add .slnx solution file extractor (F-0832, upstream 29e57cd #1189), CODE_EXTENSIONS, __testing, FIXTURES

### Community 223 - "Community 223"
Cohesion: 0.33
Nodes (6): 0938526 Refresh graph after wiki description export updates, 37045c4 Harden smoke test tarball install sandboxing, 4579f9a Expose wiki description sidecars in CLI exports, 908f265 Clarify post-0.7.10 progress accounting, 9efb5ea Refresh graph after progress accounting update, eee2f35 Refresh graph after product acceleration kickoff

### Community 224 - "Community 224"
Cohesion: 0.33
Nodes (6): 3a149b4 feat(v7): add headless extract cli wrapper, 6547d50 feat(v7): add public export cli parity, 9300160 chore(graphify): refresh graph artifacts after headless extract parity, df82a41 chore(graphify): refresh graph artifacts after parser hardening, f0dca40 feat(v7): harden tsconfig alias extraction, fcd8c95 chore(graphify): refresh graph artifacts after export parity

### Community 225 - "Community 225"
Cohesion: 0.47
Nodes (1): ApiClient

### Community 226 - "Community 226"
Cohesion: 0.33
Nodes (5): cli, { dirname, join }, entry, result, { spawnSync }

### Community 227 - "Community 227"
Cohesion: 0.47
Nodes (1): ApiClient

### Community 228 - "Community 228"
Cohesion: 0.53
Nodes (1): HttpClient

### Community 229 - "Community 229"
Cohesion: 0.33
Nodes (3): spannerDdlLines(), toSpanner(), cleanupDirs

### Community 230 - "Community 230"
Cohesion: 0.33
Nodes (5): config, dir, plugin, previousCwd, tempDirs

### Community 231 - "Community 231"
Cohesion: 0.33
Nodes (4): communitiesIdx, facetsIdx, graph, html

### Community 232 - "Community 232"
Cohesion: 0.40
Nodes (5): ha(), Ka(), qa(), Va(), zo()

### Community 233 - "Community 233"
Cohesion: 0.40
Nodes (5): 07c1c6d docs(plan): mark graph artifact gate complete, 2398474 chore(graphify): refresh graph artifacts after release gate, a674bae chore(graphify): refresh graph artifacts after v0.7.0 parity, d62e433 fix(release): make smoke UAT cache-hermetic, e766ef1 docs(traceability): lock v0.7.x parity to upstream v7

### Community 234 - "Community 234"
Cohesion: 0.40
Nodes (5): 14d4226 docs: research ontology studio design, 40f41b2 chore: refresh ontology lifecycle graph, 6c29a0f chore: refresh ontology lifecycle graph, 99b5335 docs: frame ontology lifecycle mystery UAT, f395141 docs: mark direct backend release complete

### Community 235 - "Community 235"
Cohesion: 0.50
Nodes (2): build_graph(), Graph

### Community 236 - "Community 236"
Cohesion: 0.50
Nodes (1): DataProcessor

### Community 237 - "Community 237"
Cohesion: 0.50
Nodes (1): HttpClient

### Community 238 - "Community 238"
Cohesion: 0.50
Nodes (2): build_graph(), Graph

### Community 239 - "Community 239"
Cohesion: 0.40
Nodes (4): b1, b2, backup, dated

### Community 241 - "Community 241"
Cohesion: 0.40
Nodes (3): { convertPdfMock }, MOCK_OCR_RESPONSE, tempDirs

### Community 242 - "Community 242"
Cohesion: 0.40
Nodes (4): character, dataset, groups, total

### Community 243 - "Community 243"
Cohesion: 0.50
Nodes (4): Bo(), nl(), Sa(), Wt()

### Community 244 - "Community 244"
Cohesion: 0.50
Nodes (4): 2f66d04 Refresh graph after acceleration helpers, 344c065 Clarify post-0.7.10 acceleration progress, 44f0f81 Refresh graph after Gemini UAT timeout update, 6a36196 Allow slower Gemini direct LLM UAT responses

### Community 245 - "Community 245"
Cohesion: 0.50
Nodes (4): 497693b chore(release): bump version to 0.7.4, 75881f2 docs: specify ontology lifecycle reconciliation, 77ad679 chore(graphify): refresh graph artifacts before 0.7.4 release, b6a02e2 docs(plan): mark 0.7.4 release complete

### Community 246 - "Community 246"
Cohesion: 0.50
Nodes (4): 556e8da Persist community labels through rebuildCode (update / hook-rebuild), 8bec1fe Refresh graph after community-labels persistence, c0897f8 Close Lot 3 traceability for 0.7.5..0.7.10 incremental/dedup drift, ea870fc Refresh graph after Lot 3 incremental/dedup closures

### Community 247 - "Community 247"
Cohesion: 0.67
Nodes (3): MyApp.Accounts.User, create(), validate()

### Community 248 - "Community 248"
Cohesion: 0.50
Nodes (2): attrs, G

### Community 249 - "Community 249"
Cohesion: 0.50
Nodes (1): cleanupDirs

### Community 250 - "Community 250"
Cohesion: 0.50
Nodes (1): cleanupDirs

### Community 251 - "Community 251"
Cohesion: 0.67
Nodes (3): 652e487 feat: add direct llm backend extraction, b319059 ci: run direct llm provider uat, f64bc16 chore: refresh graphify ontology lifecycle graph

### Community 252 - "Community 252"
Cohesion: 0.67
Nodes (1): Transformer

### Community 253 - "Community 253"
Cohesion: 0.67
Nodes (3): Animal, -initWithName, -speak

### Community 254 - "Community 254"
Cohesion: 0.67
Nodes (1): Transformer

### Community 255 - "Community 255"
Cohesion: 0.67
Nodes (2): main, target

### Community 256 - "Community 256"
Cohesion: 0.67
Nodes (2): FIXTURES_DIR, TMP_OUT

### Community 257 - "Community 257"
Cohesion: 0.67
Nodes (3): writeFixtureGraph(), writeOntologyPatchFixture(), writeOntologyReconciliationFixture()

## Knowledge Gaps
- **1509 isolated node(s):** `Qt`, `_a`, `ya`, `No`, `Jr` (+1504 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 195`** (2 nodes): `ConnectionPool`, `Manages a pool of persistent HTTP connections.     Keys connections by (scheme,`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 201`** (2 nodes): `DataProcessor`, `IProcessor`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 210`** (2 nodes): `cleanupDirs`, `PROVIDER_KEYS`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 225`** (1 nodes): `ApiClient`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 227`** (1 nodes): `ApiClient`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 228`** (1 nodes): `HttpClient`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 235`** (2 nodes): `build_graph()`, `Graph`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 236`** (1 nodes): `DataProcessor`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 237`** (1 nodes): `HttpClient`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 238`** (2 nodes): `build_graph()`, `Graph`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 248`** (2 nodes): `attrs`, `G`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 249`** (1 nodes): `cleanupDirs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 250`** (1 nodes): `cleanupDirs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 252`** (1 nodes): `Transformer`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 254`** (1 nodes): `Transformer`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 255`** (2 nodes): `main`, `target`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 256`** (2 nodes): `FIXTURES_DIR`, `TMP_OUT`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `jt` connect `Community 51` to `Community 4`, `Community 125`, `Community 146`, `Community 132`, `Community 243`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **Why does `il` connect `Community 146` to `Community 4`, `Community 51`, `Community 151`, `Community 125`?**
  _High betweenness centrality (0.002) - this node is a cross-community bridge._
- **Why does `Geometry` connect `Community 193` to `Community 89`?**
  _High betweenness centrality (0.002) - this node is a cross-community bridge._
- **What connects `Qt`, `_a`, `ya` to the rest of the system?**
  _1509 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.05275865152463561 - nodes in this community are weakly interconnected._
- **Should `Community 4` be split into smaller, more focused modules?**
  _Cohesion score 0.023734592184631524 - nodes in this community are weakly interconnected._
- **Should `Community 5` be split into smaller, more focused modules?**
  _Cohesion score 0.050432022570975135 - nodes in this community are weakly interconnected._