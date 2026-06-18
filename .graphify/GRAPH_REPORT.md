# Graph Report - .  (2026-06-18)

## Corpus Check
- Large corpus: 520 files · ~695,129 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 6002 nodes · 50275 edges · 193 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 233 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output
- Edge kinds: ON_BRANCH: 36600 · contains: 4183 · MODIFIES: 2664 · calls: 2511 · imports: 1304 · PARENT_OF: 1097 · imports_from: 882 · re_exports: 474 · uses: 233 · method: 161 · rationale_for: 104 · inherits: 52 · defines: 8 · references: 2


## Input Scope
- Requested: auto
- Resolved: committed (source: default-auto)
- Included files: 520 · Candidates: 569
- Excluded: 0 untracked · 39228 ignored · 8 sensitive · 0 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.

## Graph Freshness
- Built from Git commit: `6e8338c`
- Compare this hash to `git rev-parse HEAD` before trusting freshness-sensitive graph output.
## God Nodes (most connected - your core abstractions)
1. `Response` - 45 edges
2. `Request` - 42 edges
3. `jt` - 34 edges
4. `_makeId()` - 32 edges
5. `Client` - 27 edges
6. `Cookies` - 27 edges
7. `AsyncClient` - 26 edges
8. `Extraction` - 25 edges
9. `TransportError` - 22 edges
10. `HTTPTransport` - 22 edges

## Surprising Connections (you probably didn't know these)
- `API module - exposes the document pipeline over HTTP. Thin layer over parser, va` --uses--> `ValidationError`  [INFERRED]
  worked/example/raw/api.py → worked/example/raw/validator.py
- `Accept a list of file paths, run the full pipeline on each,     and return a sum` --uses--> `ValidationError`  [INFERRED]
  worked/example/raw/api.py → worked/example/raw/validator.py
- `Fetch a document by ID and return it.` --uses--> `ValidationError`  [INFERRED]
  worked/example/raw/api.py → worked/example/raw/validator.py
- `Delete a document by ID.` --uses--> `ValidationError`  [INFERRED]
  worked/example/raw/api.py → worked/example/raw/validator.py
- `List all document IDs in storage.` --uses--> `ValidationError`  [INFERRED]
  worked/example/raw/api.py → worked/example/raw/validator.py

## Communities

### Community 0 - "Code extraction (tree-sitter walkers)"
Cohesion: 0.06
Nodes (315): ci/pages-nojekyll, feat/docs-readme-knowledge-first, feat/studio-demo-pages, feat/track-b-reconciliation-ui, feat/track-f-0831-p1-security, feat/track-g-d12-forcegraph, feat/track-g-recon-twin-edge, feat/track-g-studio-impl (+307 more)

### Community 1 - "PDF preflight & semantic prep"
Cohesion: 0.25
Nodes (275): chore/graphify-track-refresh-qa, chore/release-0.14.0, chore/wp9-agent-stats-closeout, codex/quality-target-qa, feat/agent-stats-codex-headless, feat/assembly-hygiene-deorphan, feat/assembly-reconciliation-hardening, feat/citations-pass2-engine (+267 more)

### Community 2 - "Input scope, git, repo clone"
Cohesion: 0.33
Nodes (258): chore/remove-handover, chore/track-wp9-dossier, correctness-rebase, docs/readme-recenter, feat/agent-stats-fixes, feat/agent-stats-mvp, feat/agent-stats-phase1, feat/code-graph-descriptions (+250 more)

### Community 3 - "MCP server (graph queries)"
Cohesion: 0.06
Nodes (169): feat/track-c-3.5-visual-encoding, feat/track-f-h1-hypergraph, feat/track-f-m2-v08x, feat/track-g-process-std-workspace, feat/track-g-g3-viewer-state, 014aace Address Lot 4 provider review fixes, 06388da chore(graphify): refresh graph artifacts after tree and ignore parity, 06528d6 Record public mystery reconciliation UAT (+161 more)

### Community 4 - "Audio/video transcription & ingest"
Cohesion: 0.03
Nodes (139): 3286ecd feat(qa): add target manifest QA gate (#177), 4151efa feat(qa): gate studio publication bundles, 693caa7 feat(qa): evaluate target bundle gates, 6e8338c chore(graphify): refresh graph after QA guards, 860e4dd feat(cli): add graphify qa command, 8d27f1c fix(studio): guard document-only graph QA, 9cae385 fix(qa): gate document studio graph regressions, dc13a91 feat(qa): add quality target contract model (+131 more)

### Community 5 - "File detection & Google Workspace"
Cohesion: 0.03
Nodes (106): 54d8c24 Harden graphify description contract, 5c0cb80 Add wiki describe sidecar generation CLI, b25a47e Add wiki description sidecar model, efa8b6b Start post-0.7.10 product acceleration, communityArticle(), crossCommunityLinks(), buildFallbackSidecar(), buildTargetContentHash() (+98 more)

### Community 6 - "Sample corpus: example Python pipeline (worked/)"
Cohesion: 0.02
Nodes (97): _a, ao(), au(), ba(), bf(), bu(), cu(), ds() (+89 more)

### Community 7 - "Exporters (HTML, canvas, JSON)"
Cohesion: 0.02
Nodes (104): arcControl(), buildEdgePolylinePositions(), EdgeCurveMode, EdgePolylineOptions, Point, quadraticPoint(), readPoint(), assertPositionArray() (+96 more)

### Community 8 - "Sample corpus: mixed analyze.py (worked/)"
Cohesion: 0.04
Nodes (82): 2810e65 feat(gh): extract pull requests to graphify Extraction (WP9), 29bf908 fix(gh): emit full commit shas for cross-profile join with extract-git (WP9 gate), bad1965 feat(gh): extract pull requests to Extraction (WP9) (#175), cdd2a39 spec(qa): define target manifest and quality gate, aggregateChecks(), CheckAggregate, checkBucket(), commitSha() (+74 more)

### Community 9 - "Review delta & risk chains"
Cohesion: 0.04
Nodes (81): 6ee0295 Merge pull request #21 from rhanka/feat/upstream-0.7.10-lot3-incremental, applySalientCommunityLabels(), buildLabelingPromptLines(), CallLlmFn, cleanLabelInstructionDir(), detectLabelingBackend(), emitLabelInstructions(), generateCommunityLabels() (+73 more)

### Community 10 - "Flow detection & criticality"
Cohesion: 0.03
Nodes (79): 5d37712 docs(spec): document de-orphan giant-component join (TRACKED #3), da9e0c6 fix(assembly-hygiene): de-orphan joins giant component, no 2-node islands, AliasDerivationConfig, asCitations(), buildAdjacency(), canonicalId(), canonicalType(), capitalize() (+71 more)

### Community 11 - "CLI runtime & search"
Cohesion: 0.03
Nodes (81): 0f32886 F M2 (3/6): port upstream f5fea13 — LLM empty / filtered response guard, 5d60bd2 F M2 (4/6): port upstream 6939494 — backupIfProtected snapshot before overwrite, 652e487 feat: add direct llm backend extraction, b319059 ci: run direct llm provider uat, AllChunksFailedError, createDirectSemanticExtractionClient(), DirectSemanticChunk, DirectSemanticClientOptions (+73 more)

### Community 12 - "Cache, paths, benchmark"
Cohesion: 0.04
Nodes (57): buildHierarchyIndex(), columnValue(), compileHierarchies(), CompileHierarchiesOptions, CompiledNode, CompiledRelation, compileNodes(), compileOntologyOutputs() (+49 more)

### Community 13 - "Review analysis (blast radius, communities)"
Cohesion: 0.05
Nodes (50): 1f265c3 chore(release): bump version to 0.7.5, 2127b64 feat: add ontology write mcp mode, 3eda59f Merge pull request #15 from rhanka/feat/ontology-lifecycle-core, 657af78 chore(release): bump version to 0.7.5, 726d9e7 feat: add ontology patch apply core, 88dc625 feat: add ontology write mcp mode, 9517dd4 Add ontology reconciliation candidate queue, aeb5ed9 Merge pull request #15 from rhanka/feat/ontology-lifecycle-core (+42 more)

### Community 14 - "Portable-check & detection portability"
Cohesion: 0.04
Nodes (53): d0b0710 feat(studio): legacy-parity box nodes drawn in canvas (labeled rounded rect, text for central Work/Chapter nodes), fd4c7c5 feat(studio): box nodes rendered in canvas, sized to text, single label (legacy parity, fixes duplicate/oversize), fmt(), shapeCode(), shapePolygonPoints(), shapeSvgPath(), BOX_LABEL_NODE_TYPES, buildStudioScene() (+45 more)

### Community 15 - "Sample corpus: httpx Python client (worked/)"
Cohesion: 0.05
Nodes (55): 4ba8600 UPSTREAM_GAP: record v2 hypergraph as already-covered, withdraw 0.10.0 schema-delta prediction, 6b80ad1 Track F-H1: typed hyperedges data layer (cleanup) + UPSTREAM_GAP v2 already-covered (#48), db91d04 wip(hypergraph): scaffold hyperedges data layer (F-H1, no PR), createGraph(), forEachTraversalNeighbor(), isDirectedGraph(), loadGraphFromData(), SerializedGraphData (+47 more)

### Community 16 - "Review context builder"
Cohesion: 0.05
Nodes (55): 03d6f5d Merge pull request #18 from rhanka/feat/wiki-reconciliation-ui, 1ce0e3b Ignore local dotenv files, 61c3eb0 Add ontology reconciliation candidate queue, d5863ed Merge pull request #23 from rhanka/feat/post-0710-product-acceleration, df849e3 Merge pull request #23 from rhanka/feat/post-0710-product-acceleration, e8d09bb Add product acceleration core helpers, f5a3ffb Add product acceleration core helpers, candidateId() (+47 more)

### Community 17 - "Ontology profile loader"
Cohesion: 0.04
Nodes (56): 1a63d0a fix(track-f): filter language built-ins from call-edge resolution (F-0820-0827, 80301a0 #916), 3f9efdc fix(track-f): TypeScript interface-extends and same-file class heritage emit inherits/implements edges (F-0820-0827, 88a8e3b #1095), 83426ff fix(track-f): Python decorated methods inherit parentClassNid; already-covered proofs for M6b/M6c/M15 (F-0820-0827, 9f73400 #1050/#1046/#1047), _C_CONFIG, CASE_INSENSITIVE_CALL_MODULES, _CPP_CONFIG, _CSHARP_CONFIG, _DISPATCH (+48 more)

### Community 18 - "Sample corpus: httpx exceptions (worked/)"
Cohesion: 0.03
Nodes (58): alphaNeighbors, audit, beforeAudit, beforeDecisions, betaNeighbors, candidate, candidateResponse, candidates (+50 more)

### Community 19 - "Profile validation"
Cohesion: 0.06
Nodes (45): 9a3e1dd feat(studio/reconciliation): type-grouped rail, score bubbles, two-line pairs, batch validate + depth-3 neighbourhood, box, label, applyWeakFilter(), attachReconLayout(), BOX_LABEL_NODE_TYPES, buildGraphIndex(), buildScene() (+37 more)

### Community 20 - "Configured dataprep (profile mode)"
Cohesion: 0.06
Nodes (49): 19bf248 Merge pull request #41 from rhanka/feat/track-f-v0811-bilan2-godnodes, b6f14db fix: exclude npm dep-block keys from god nodes, cd5d41a docs: refresh Track F status, codeLanguage(), crossCommunitySurprises(), crossFileSurprises(), edgeBetweennessSurprises(), fileCategory() (+41 more)

### Community 21 - "CLI top-level & assistant-integration tests"
Cohesion: 0.07
Nodes (46): resolveIdentity(), workspaceLabel(), H2aInstance, loadH2aInstances(), matchInstance(), AGENT_STATS_SCHEMA, AgentReport, AgentStatsReport (+38 more)

### Community 22 - "Multi-language test fixtures"
Cohesion: 0.07
Nodes (52): 0509dea Add no-Python fallback language coverage, 0f8e258 Merge pull request #20 from rhanka/feat/upstream-0.7.10-lot2-commonjs, 2b5e757 Release 0.9.6: F-M2 port upstream v0.8.11→v0.8.13 + Track C-3.5 wiring (#46), 69986ec Add Markdown and Quarto structural extraction, 79b9ceb Track C-3.5: profile-aware visual encoding per ontology node type (#45), 86e8567 F M2 (1/6): port upstream 2d783e5 — cohesion unrounded, save_manifest seed, --resolution + --exclude-hubs, aebd295 Refresh graph after parser surface catch-up, ASSET_DIR_MARKERS (+44 more)

### Community 23 - "Review benchmark"
Cohesion: 0.06
Nodes (47): ae0c7ed feat: add ontology discovery proposal workflow, f1d2fce feat: extend ontology lifecycle profile validation, f64bc16 chore: refresh graphify ontology lifecycle graph, field(), loadProfileRegistry(), normalizeRegistryRecord(), readRegistryRows(), registryRecordsToExtraction() (+39 more)

### Community 24 - "Sample corpus: httpx utils (worked/)"
Cohesion: 0.07
Nodes (44): buildNodeDescriptionPrompt(), CallLlmFn, callLlmWithRetry(), chunk(), CitationCap, collectCitationContext(), collectNeighbors(), collectNodeContext() (+36 more)

### Community 25 - "Recommendations (commit prefix, area)"
Cohesion: 0.06
Nodes (50): asBoolean(), asNumber(), asRecord(), asString(), asStringArray(), buildRegistrySources(), CONFIG_CANDIDATES, isSecretKey() (+42 more)

### Community 26 - "Change detection & risk score"
Cohesion: 0.06
Nodes (38): affectedFilesToText(), BARREL_BASENAMES, basename(), buildReviewDelta(), changedNodeIds(), clampDepth(), compareNodes(), compareStrings() (+30 more)

### Community 27 - "Profile discovery/extraction prompts"
Cohesion: 0.07
Nodes (44): asRecord(), asStringArray(), bindOntologyProfile(), DEFAULT_STATUSES, hashOntologyProfile(), loadOntologyProfile(), normalizeCitationPolicy(), normalizeEvidencePolicy() (+36 more)

### Community 28 - "Sample corpus: example storage.py (worked/)"
Cohesion: 0.08
Nodes (41): basenameNoExt(), codexThreadId(), discoverAgy(), discoverClaude(), discoverCodex(), Host, listFilesRec(), repoSlug() (+33 more)

### Community 29 - "Profile report"
Cohesion: 0.08
Nodes (44): 62545ae F M2 (2/6): port upstream d84f07c — node-ID dedup, cache fastpath, absolute paths relativization, absolutizeSourceFilesIn(), bodyContent(), CACHE_BUCKETS, cachedFiles(), cacheDir(), cacheKind(), cacheNamespace() (+36 more)

### Community 30 - "Ontology patch (validate, dry-run, apply)"
Cohesion: 0.07
Nodes (25): bs(), ci(), cl(), di(), dl(), dr(), Fi(), Go() (+17 more)

### Community 31 - "Sample corpus: httpx auth/client (worked/)"
Cohesion: 0.08
Nodes (37): CloseError, ConnectError, ConnectTimeout, NetworkError, PoolTimeout, ProtocolError, ProxyError, httpx-like exception hierarchy. All exceptions inherit from HTTPError at the top (+29 more)

### Community 32 - "Test fixtures: C#/Java/PowerShell"
Cohesion: 0.06
Nodes (33): 18e62d0 Refresh graph after Lot 4 Ollama and Google Workspace ports, 22bf10b chore(graphify): refresh graph artifacts after v0.7.4 parser parity, 32d1d93 F M2 (6/6): port upstream 850c545 — raise FILE_COUNT_UPPER 200 -> 500, 3544d19 Release 0.9.6: F-M2 port upstream v0.8.11->v0.8.13 + Track C-3.5, 3a149b4 feat(v7): add headless extract cli wrapper, 49fb6bf feat(v7): close v0.7.4 parser parity, 6547d50 feat(v7): add public export cli parity, 65a45e9 Refresh .graphify after F-M2 ports on 0.9.6 (+25 more)

### Community 33 - "Image routing calibration"
Cohesion: 0.05
Nodes (24): 05ee028 Add optional Google Workspace shortcut export, bc882be Add Ollama as a credential-free direct LLM provider, ANTIGRAVITY_RULE_PATH, ANTIGRAVITY_WORKFLOW_PATH, changedFilesFromGit(), checkSkillVersion(), __dirname, ensureCliExtractionShape() (+16 more)

### Community 34 - "Ontology output (wiki, obsidian, etc.)"
Cohesion: 0.08
Nodes (28): aggregateCitations(), AggregateCitationsOptions, backfillCitations(), BackfillCitationsOptions, BackfillCitationsResult, CitationAggregateEntry, CitationAggregateMap, citationKey() (+20 more)

### Community 35 - "Graph summary (first-hop orientation)"
Cohesion: 0.10
Nodes (42): OntologyReconciliationCandidatesResponse, buildModel(), CompactMetaInline, decisionBasisReason(), descriptionSidecarFor(), displayText(), escapeHtml(), escapeScriptJson() (+34 more)

### Community 36 - "Analyze (god nodes, surprising connections)"
Cohesion: 0.08
Nodes (38): augmentDetectionWithPdfPreflight(), cloneDetection(), countWords(), dedupe(), listImageArtifacts(), loadMistralOcrModule(), metadataPath(), MistralOcrModule (+30 more)

### Community 37 - "Sample corpus: httpx auth (worked/)"
Cohesion: 0.10
Nodes (35): ClaudeParseOptions, cwdInScope(), emptySession(), parseClaudeTranscript(), PendingTool, pushUnique(), RawClaudeSession, recordToolUse() (+27 more)

### Community 39 - "Sample corpus: httpx client (worked/)"
Cohesion: 0.09
Nodes (38): f7b39c4 Track G Lot 1 (G1+G2): workspace tokens + shell scaffold (#47), WorkspaceRailLayout, workspaceRailStyles(), buildNodeFacts(), CompactDescriptionContext, computeCounters(), CountersValues, DEFAULT_INLINE_FACTS (+30 more)

### Community 40 - "Sample corpus: httpx transport (worked/)"
Cohesion: 0.08
Nodes (28): communitiesFromGraph(), communityLabelsFromGraph(), getOntologyRebuildStatus(), getOntologyReconciliationCandidate(), listOntologyReconciliationCandidates(), loadReadonlyReconciliationCandidates(), ontologyAppliedPatchesPath(), ontologyNeedsUpdatePath() (+20 more)

### Community 41 - "LLM execution (direct backends)"
Cohesion: 0.09
Nodes (31): collectJsonIssues(), collectStringIssues(), collectTextIssues(), COMMON_POSIX_LOCAL_PATH_PREFIXES, hasSchemePrefix(), isIgnoredLocalArtifact(), isLikelyLocalAbsolutePath(), isWindowsAbsolutePath() (+23 more)

### Community 42 - "Community 42"
Cohesion: 0.09
Nodes (34): augmentDetectionWithTranscripts(), buildWhisperPrompt(), cloneDetection(), defaultWhisperCacheDir(), downloadAudio(), downloadFile(), ensureWhisperArtifacts(), envBoolean() (+26 more)

### Community 43 - "Community 43"
Cohesion: 0.08
Nodes (26): InMemoryPgState, makeFakePgModule(), makePgVectorStore(), RecordedQuery, createPgVectorStore(), deriveNamespace(), GraphStoreConfig, PgClientLike (+18 more)

### Community 44 - "Community 44"
Cohesion: 0.09
Nodes (29): 1092f4b Merge pull request #39 from rhanka/feat/track-f-upstream-parity-p1-p2-m1, 6857518 Merge pull request #39 from rhanka/feat/track-f-upstream-parity-p1-p2-m1, 6a00692 fix(track-f): antigravity path/project-install/uninstall-tree/Read-Glob hook (F-0820-0827, M11/M12/M23/M24), 6a61cbd F upstream parity p1 p2 m1, 89db804 chore(track-f): update bilan with F-0820-0827 correctness lot results (M5/M6/M9/M10/M11/M12/M13/M15/M21/M23/M24/M26), b7b75b9 Refresh graph after parser surface merge, d6046e5 Merge pull request #21 from rhanka/feat/upstream-0.7.10-lot3-incremental, ff0522a F upstream parity p1 p2 m1 (+21 more)

### Community 45 - "Community 45"
Cohesion: 0.09
Nodes (33): 9408561 feat(conversations): connector claude/codex/cursor/gemini -> Extraction (WP5), buildConversationsExtraction(), BuildConversationsExtractionOptions, ClaudeCommitResolveOptions, collectPromptStats(), ConversationCompactionEvent, ConversationEventBase, conversationId() (+25 more)

### Community 46 - "Community 46"
Cohesion: 0.09
Nodes (29): 170f0ef Merge branch 'feat/studio-show-descriptions' into feat/node-type-boxes, buildEntitySidecar(), CitationSidecarEntry, citationsSidecarCache, CitationsSidecarCacheEntry, CitationsSidecarShape, computeGraphCitationSignature(), EntitySidecarResponse (+21 more)

### Community 47 - "Community 47"
Cohesion: 0.10
Nodes (23): 2d36615 Add global uninstall and repair missing skills, 4b62fe3 feat(v7): close v0.7.0 multi-dev graph lifecycle parity, 4d720d0 Merge upstream 0.7.5..0.7.10 parity closure, 4d7296f Complete upstream 0.7.10 parity closure, 5d99cb9 Refresh graphify graph after upstream lot1, 6cfe14a feat(v7): close v0.7.0 multi-dev graph lifecycle parity, 7516436 docs(track-f): reclassify 0fdfded as already-covered (F-0831-P2b), a39295c Fix buildMerge preserved edge direction (+15 more)

### Community 48 - "Community 48"
Cohesion: 0.08
Nodes (27): buildFlowArtifact(), computeFlowCriticality(), decoratorsOf(), detectEntryPoints(), flowIdFor(), flowListToText(), flowToSteps(), getFlowById() (+19 more)

### Community 49 - "Community 49"
Cohesion: 0.09
Nodes (26): normalizeSearchText(), queryTerms(), scoreSearchText(), textMatchesQuery(), communitiesFromGraph(), communityLabelsFromGraph(), createReloadingGraphStore(), getVersion() (+18 more)

### Community 50 - "Community 50"
Cohesion: 0.19
Nodes (34): ac(), Be(), cf(), Dd(), de(), Dn(), Do(), dv() (+26 more)

### Community 51 - "Community 51"
Cohesion: 0.13
Nodes (14): BaseClient, Limits, The main Client and AsyncClient classes. BaseClient holds all shared logic. Clie, Asynchronous HTTP client., Shared implementation for Client and AsyncClient.     Handles auth, redirects, c, Synchronous HTTP client., Timeout, InvalidURL (+6 more)

### Community 52 - "Community 52"
Cohesion: 0.13
Nodes (16): Auth, BasicAuth, BearerAuth, DigestAuth, NetRCAuth, Authentication handlers. Auth objects are callables that modify a request before, Load credentials from ~/.netrc based on the request host., Base class for all authentication handlers. (+8 more)

### Community 53 - "Community 53"
Cohesion: 0.08
Nodes (25): 7a3ba4c feat(v6): close v0.6.9 clustering and source-file parity, a2db5cf chore(graphify): refresh graph artifacts after v0.6.9 parity, canonicalizeForPartition(), cluster(), ClusterOptions, cohesionScore(), partition(), remapCommunitiesToPrevious() (+17 more)

### Community 54 - "Community 54"
Cohesion: 0.16
Nodes (31): addError(), addWarning(), appendJsonLine(), applyOntologyPatch(), auditPath(), changedFiles(), decisionLogOperation(), decisionLogStatus() (+23 more)

### Community 55 - "Community 55"
Cohesion: 0.11
Nodes (26): CommitConflict, correlate(), CorrelateInput, detectCommitConflicts(), findByScan(), GitCommitMeta, indexCommits(), indexPrMergesByBranch() (+18 more)

### Community 56 - "Community 56"
Cohesion: 0.14
Nodes (31): antigravityInstall(), _antigravityWriteRulesWorkflows(), canonicalPlatformName(), cursorInstall(), emptyPreview(), findSkillFile(), geminiInstall(), getInvocationExample() (+23 more)

### Community 57 - "Community 57"
Cohesion: 0.12
Nodes (23): createFileGraphStore(), FileGraphStore, FileStoreClearOptions, moduleDir(), resolveToolVersion(), create(), factories, GraphStoreFactory (+15 more)

### Community 58 - "Community 58"
Cohesion: 0.13
Nodes (25): 14160c3 Track G G2: workspace shell static scaffold + a11y baseline, 35d561c Track G G1: workspace token contract + local fallback + DS adapter, html, state, tokens, buildFacetValues(), collectFieldNames(), DENYLIST (+17 more)

### Community 59 - "Community 59"
Cohesion: 0.08
Nodes (13): writeOntologyWriteFixture(), tempDirs, GRAPH_FIXTURE, tempDirs, dir, fixture, html, result (+5 more)

### Community 60 - "Community 60"
Cohesion: 0.08
Nodes (22): BACKUP_ARTIFACTS, CanvasOptions, COMMUNITY_COLORS, CommunityLabelOptions, CommunityLabelsInput, CONFIDENCE_SCORE_DEFAULTS, HtmlOptions, inferEdgeDashes() (+14 more)

### Community 61 - "Community 61"
Cohesion: 0.13
Nodes (26): execGit(), GitContext, gitRevParse(), isSafeGitPath(), resolveFromGitCwd(), resolveGitContext(), safeExecGit(), userEditableHooksDir() (+18 more)

### Community 62 - "Community 62"
Cohesion: 0.10
Nodes (25): appendRationaleAttr(), INVALID_FILE_TYPES_FOR_SANITIZE, isPlainObject(), isSentenceLikeRationaleLabel(), LoadValidatedResult, loadValidatedSemanticFragment(), sanitizeSemanticFragment(), SemanticFragment (+17 more)

### Community 63 - "Community 63"
Cohesion: 0.11
Nodes (25): handle_delete(), handle_enrich(), handle_get(), handle_list(), handle_search(), handle_upload(), API module - exposes the document pipeline over HTTP. Thin layer over parser, va, Accept a list of file paths, run the full pipeline on each,     and return a sum (+17 more)

### Community 64 - "Community 64"
Cohesion: 0.13
Nodes (2): AsyncClient, Client

### Community 65 - "Community 65"
Cohesion: 0.13
Nodes (22): applyConfiguredExcludes(), buildConfiguredDetectionInputs(), buildProfileState(), ConfiguredDataprepOptions, ConfiguredDataprepResult, ConfiguredDetectionInputs, dataprepReport(), DETECTION_FILE_TYPES (+14 more)

### Community 66 - "Community 66"
Cohesion: 0.11
Nodes (18): Cookies, build_url_with_params(), flatten_queryparams(), is_known_encoding(), normalize_header_key(), obfuscate_sensitive_headers(), parse_content_type(), primitive_value_to_str() (+10 more)

### Community 67 - "Community 67"
Cohesion: 0.09
Nodes (22): args, artifactSourcePath(), buildResolvedTargetManifest(), candidatesPath, candidatesResponse, die(), entities, graph (+14 more)

### Community 68 - "Community 68"
Cohesion: 0.13
Nodes (24): _cross_community_surprises(), _cross_file_surprises(), _file_category(), god_nodes(), graph_diff(), _is_concept_node(), _is_file_node(), _node_community_map() (+16 more)

### Community 69 - "Community 69"
Cohesion: 0.13
Nodes (16): 0440c1e Merge pull request #25 from rhanka/feat/track-c1-review-precision, 162b2b1 F3: extend review-store tests to cover full spec matrix, 5b8af21 F5: extend review-context tests + canonicalize INHERITS/IMPLEMENTS, asNumber(), asString(), createReviewGraphStore(), isTestPath(), normalizeKind() (+8 more)

### Community 70 - "Community 70"
Cohesion: 0.10
Nodes (20): 385df0f E follow-up upgrade neo4j ts vitest, c24ce46 E release 0.9.2 Node 24 and query-first install, e9fac4b Merge pull request #38 from rhanka/feat/track-e-major-upgrades-neo4j6-ts6-vitest4, ef274a0 Merge pull request #37 from rhanka/feat/track-e-0.9.2-release, agentsInstall(), getAgentsMdSection(), installCodexHook(), replaceOrAppendSection() (+12 more)

### Community 71 - "Community 71"
Cohesion: 0.13
Nodes (25): _csharpExtraWalk(), _findRequireCall(), _getCFuncName(), _getCppFuncName(), _importC(), _importCsharp(), _importJava(), _importJs() (+17 more)

### Community 72 - "Community 72"
Cohesion: 0.14
Nodes (21): escapeHtml(), escapeUrl(), HTML_ESCAPE_MAP, modeLabel(), renderGraphPanel(), RenderGraphPanelOptions, renderLiveGraphScript(), renderMetricsCard() (+13 more)

### Community 73 - "Community 73"
Cohesion: 0.12
Nodes (21): ai(), al(), As(), At(), Ee(), El(), fr, ii() (+13 more)

### Community 74 - "Community 74"
Cohesion: 0.11
Nodes (14): ContractFixture, ContractGraphStore, describeGraphStoreContract(), StoreTestDeps, InMemoryNeo4jState, makeFakeDriver(), makeFakeDriverModule(), makeNeo4jStore() (+6 more)

### Community 75 - "Community 75"
Cohesion: 0.13
Nodes (14): buildCommitRecommendation(), commitPrefixForArea(), communityLabel(), dominantCommunity(), groupConfidence(), groupDraftForFile(), isGraphifyStatePath(), mergeDrafts() (+6 more)

### Community 76 - "Community 76"
Cohesion: 0.16
Nodes (22): buildRelationRows(), displayValue(), EntityOccurrence, EntityPanelOccurrences, entityPanelStyles(), escapeHtml(), graphEdges(), HTML_ESCAPE_MAP (+14 more)

### Community 77 - "Community 77"
Cohesion: 0.11
Nodes (22): bl(), Cs(), En(), fl(), Gt(), hl(), Hr(), Is() (+14 more)

### Community 78 - "Community 78"
Cohesion: 0.17
Nodes (18): fetchEntity(), fetchGraph(), fetchModelsManifest(), fetchReconciliationCandidates(), fetchScene(), getJson(), loadEntitiesIndex(), postPatch() (+10 more)

### Community 79 - "Community 79"
Cohesion: 0.19
Nodes (17): addIssue(), buildEvidenceIds(), buildRegistryRecords(), citations(), isProfileEdge(), isRegistrySeed(), profileValidationResultToJson(), profileValidationResultToMarkdown() (+9 more)

### Community 80 - "Community 80"
Cohesion: 0.15
Nodes (20): ALLOWED_SCHEMES, BLOCKED_HOSTS, embeddedIPv4(), escapeHtml(), expandIPv6(), isLinkLocalIp(), isPrivateIp(), isRedirectStatus() (+12 more)

### Community 81 - "Community 81"
Cohesion: 0.09
Nodes (16): createSpannerGraphStore(), deriveNamespace(), EDGE_SCHEMA_COLS, GraphStore, GraphStoreConfig, moduleDir(), NODE_SCHEMA_COLS, resolveToolVersion() (+8 more)

### Community 82 - "Community 82"
Cohesion: 0.11
Nodes (17): createPostgresGraphStore(), deriveCitySlug(), EDGE_SCHEMA_COLS, GraphStore, GraphStoreConfig, moduleDir(), NODE_SCHEMA_COLS, PgClient (+9 more)

### Community 83 - "Community 83"
Cohesion: 0.14
Nodes (12): average(), buildBlastRadius(), buildReviewAnalysis(), communityRisk(), evaluateReviewAnalysis(), formatMetric(), impactedCommunities(), multimodalSafety() (+4 more)

### Community 84 - "Community 84"
Cohesion: 0.18
Nodes (17): applyRepulsion(), attachLayoutPositions(), computeLayout(), ComputeLayoutOptions, defaultLayoutIterations(), fastLayoutEnabled(), insert(), LayoutGraphEdge (+9 more)

### Community 85 - "Community 85"
Cohesion: 0.14
Nodes (19): aliasHit, hit, hits, i18nRecords, ids, index, lower, minimal (+11 more)

### Community 86 - "Community 86"
Cohesion: 0.17
Nodes (20): createDefaultViewerState(), DEFAULT_EVIDENCE_PANEL_STATE, DEFAULT_FACET_STATE, DEFAULT_GRAPH_PANEL_STATE, DEFAULT_SELECTION_STATE, isEvidenceMode(), isFiniteNonNegativeInt(), isGraphAggregation() (+12 more)

### Community 87 - "Community 87"
Cohesion: 0.12
Nodes (14): 1ba42c9 Merge pull request #14 from rhanka/upstream-0.7.4-traceability, 23e4b4e Merge pull request #14 from rhanka/upstream-0.7.4-traceability, fb67d23 feat(v6): cover tree, dynamic imports, and ignore negation parity, nodeLabel(), renderTree(), attrs, edge, ext (+6 more)

### Community 88 - "Community 88"
Cohesion: 0.15
Nodes (7): Hn(), il, jo(), Nt(), ol(), ul(), yi()

### Community 89 - "Community 89"
Cohesion: 0.21
Nodes (17): appendMemoryFiles(), buildGitInventory(), countGitPaths(), fallbackAllScope(), gitInventory(), inspectInputScope(), isInputScopeMode(), makeScope() (+9 more)

### Community 90 - "Community 90"
Cohesion: 0.18
Nodes (18): clampUnit(), cloneStyle(), colorForGroup(), curveControlPoint(), DIM_ALPHA, edgeWidth(), findNearestEdge(), finite() (+10 more)

### Community 91 - "Community 91"
Cohesion: 0.17
Nodes (16): agentsUninstall(), antigravityUninstall(), claudeUninstall(), cursorUninstall(), geminiUninstall(), kiroUninstall(), projectUninstall(), projectUninstallAll() (+8 more)

### Community 92 - "Community 92"
Cohesion: 0.11
Nodes (14): extract(), ExtractionResult, codeBlockNodes, labels, allEdges, allNodes, edges, fooNodes (+6 more)

### Community 93 - "Community 93"
Cohesion: 0.19
Nodes (15): AgyParseOptions, asToolCall(), commandFromToolArgs(), cwdInScope(), emptySession(), filePathFromToolArgs(), firstString(), handleToolCall() (+7 more)

### Community 94 - "Community 94"
Cohesion: 0.12
Nodes (12): Exception, CookieConflict, DecodingError, HTTPError, HTTPStatusError, An error occurred while issuing a request., Decoding of the response failed., A 4xx or 5xx response was received. (+4 more)

### Community 95 - "Community 95"
Cohesion: 0.12
Nodes (13): net8.0, Domain.csproj, Infrastructure.csproj, FluentValidation, MediatR, Microsoft.AspNetCore.Authentication.JwtBearer, Swashbuckle.AspNetCore, Config (+5 more)

### Community 96 - "Community 96"
Cohesion: 0.29
Nodes (18): addLabelCandidate(), buildResolvableLabelIndex(), ensureParserInit(), extractElixir(), extractGo(), extractJulia(), extractMarkdown(), extractObjc() (+10 more)

### Community 97 - "Community 97"
Cohesion: 0.24
Nodes (17): buildCommunityRows(), buildTypeRows(), CommunityRow, escapeHtml(), HTML_ESCAPE_MAP, nodeType(), recordsFromGraph(), renderAccordionSection() (+9 more)

### Community 98 - "Community 98"
Cohesion: 0.15
Nodes (15): an(), c(), df(), gi(), Gn(), lf(), pi(), qo() (+7 more)

### Community 99 - "Community 99"
Cohesion: 0.12
Nodes (15): b4caef6 Track G G3: generic workspace viewer state model + URL round-trip + reducer, a, after, b, before, cleared, initial, q (+7 more)

### Community 100 - "Community 100"
Cohesion: 0.16
Nodes (5): analyzeChanges(), changedNodesFromFiles(), mapChangesToNodes(), sortNodesByLocation(), uniqueSorted()

### Community 101 - "Community 101"
Cohesion: 0.21
Nodes (16): delete_record(), _ensure_storage(), list_records(), load_index(), load_record(), Storage module - persists documents to disk and maintains the search index. All, Load the full document index from disk., Persist the index to disk. (+8 more)

### Community 102 - "Community 102"
Cohesion: 0.23
Nodes (13): asRecord(), bucketMatches(), calibrateImageRouting(), countArray(), imageRoutingSampleFromCaption(), loadImageRoutingLabels(), loadImageRoutingRules(), normalizeBucket() (+5 more)

### Community 103 - "Community 103"
Cohesion: 0.25
Nodes (13): buildReviewContext(), buildReviewGuidance(), buildSourceSnippets(), changedFunctionsWithoutTests(), extractRelevantLines(), formatLines(), isInside(), isSensitivePath() (+5 more)

### Community 104 - "Community 104"
Cohesion: 0.14
Nodes (9): createNeo4jGraphStore(), deriveNamespace(), moduleDir(), Neo4jClearOptions, Neo4jDriver, Neo4jGraphStore, Neo4jGraphStoreConfig, Neo4jSession (+1 more)

### Community 105 - "Community 105"
Cohesion: 0.21
Nodes (14): 21b4be3 Refresh graph after SQL extraction rebase, 2f660d1 Merge pull request #19 from rhanka/feat/upstream-0.7.10-lot2, 387c7f6 Refresh graph after SQL extraction merge, 609fbc6 Add Markdown and Quarto structural extraction, 63686a4 Add TypeScript and TSX parser parity, 6425854 Refresh graph after parser surface catch-up, 8637d56 Merge pull request #20 from rhanka/feat/upstream-0.7.10-lot2-commonjs, 98bb769 Add no-Python fallback language coverage (+6 more)

### Community 106 - "Community 106"
Cohesion: 0.17
Nodes (12): bucketLength(), CITATION_POLICY_GLOBAL_DEFAULT, CitationCapValue, CitationPolicyOverrides, CORPUS_TYPE_DEFAULTS, CorpusType, DetectionLike, resolveCitationPolicy() (+4 more)

### Community 107 - "Community 107"
Cohesion: 0.13
Nodes (13): extractJs(), extractPhp(), calls, callTargets, cleanupDirs, demoNode, dir, filePath (+5 more)

### Community 108 - "Community 108"
Cohesion: 0.14
Nodes (13): arcGeometryStart, arcVertices, buildStart, edgeCount, edges, geometryStart, graph, lineVertices (+5 more)

### Community 109 - "Community 109"
Cohesion: 0.14
Nodes (1): 310d1f1 feat(studio): labeled box nodes for box-category node_types (legacy parity)

### Community 110 - "Community 110"
Cohesion: 0.31
Nodes (13): clearSelection(), createDefaultViewerState(), focusEntity(), normalizeViewerState(), setActiveView(), setFocus(), setQuery(), setShowWeakLinks() (+5 more)

### Community 111 - "Community 111"
Cohesion: 0.20
Nodes (13): batch_parse(), parse_and_save(), parse_file(), parse_json(), parse_markdown(), parse_plaintext(), Parser module - reads raw input documents and converts them into a structured fo, Read a file from disk and return a structured document. (+5 more)

### Community 112 - "Community 112"
Cohesion: 0.20
Nodes (13): enrich_document(), extract_keywords(), find_cross_references(), normalize_text(), process_and_save(), Processor module - transforms validated documents into enriched records ready fo, Lowercase, strip extra whitespace, remove control characters., Pull non-stopword tokens from text, deduplicated. (+5 more)

### Community 113 - "Community 113"
Cohesion: 0.34
Nodes (13): buildProfileReport(), graphLinks(), graphNodes(), highDegreeSection(), humanReviewSection(), invalidRelationsSection(), lowEvidenceSection(), pdfOcrSection() (+5 more)

### Community 114 - "Community 114"
Cohesion: 0.21
Nodes (10): average(), countHits(), evaluateReviewBenchmarks(), flowIdentifiers(), formatMetric(), identifiers(), normalize(), ratio() (+2 more)

### Community 115 - "Community 115"
Cohesion: 0.15
Nodes (10): graphContentHash(), isJsonRecord(), loadCliProfileContext(), loadFreshWikiDescriptionSidecarIndex(), loadWikiDescriptionSidecarIndex(), parseCitationCapFlag(), parseTopKFlag(), readJson() (+2 more)

### Community 116 - "Community 116"
Cohesion: 0.23
Nodes (11): convertOfficeFile(), docxToMarkdown(), extractPdfText(), officeParseToText(), xlsxToMarkdown(), CentralEntry, fileWithinSizeCap(), findEocdOffset() (+3 more)

### Community 117 - "Community 117"
Cohesion: 0.24
Nodes (11): buildFirstHopSummary(), buildNextBestAction(), communityLabels(), communityMembership(), compareHubs(), compareStrings(), graphDensity(), internalEdgeCounts() (+3 more)

### Community 118 - "Community 118"
Cohesion: 0.14
Nodes (9): boxes, central, dir, fixture, headingMatches, pills, result, sections (+1 more)

### Community 119 - "Community 119"
Cohesion: 0.27
Nodes (12): RawCodexSession, agyProjectHash(), cwdInRepo(), dedup(), dedupPaths(), factInRepo(), makeRepoScope(), normalizeAgy() (+4 more)

### Community 120 - "Community 120"
Cohesion: 0.17
Nodes (13): Ae(), bi(), Bn(), br(), ec(), Ia(), jl(), nc() (+5 more)

### Community 121 - "Community 121"
Cohesion: 0.31
Nodes (12): currentBranch(), currentHead(), lifecyclePaths(), markLifecycleAnalyzed(), markLifecycleStale(), mergeBase(), planLifecyclePrune(), readJson() (+4 more)

### Community 122 - "Community 122"
Cohesion: 0.36
Nodes (12): detectUrlType(), downloadBinary(), fetchArxiv(), fetchTweet(), fetchWebpage(), htmlToMarkdown(), ingest(), normalizeIngestOptions() (+4 more)

### Community 123 - "Community 123"
Cohesion: 0.21
Nodes (13): bfs(), communityName(), dfs(), findNode(), mcpField(), nodeDisplayLabel(), scoreNodes(), subgraphToText() (+5 more)

### Community 124 - "Community 124"
Cohesion: 0.17
Nodes (5): InMemoryPgState, makeFakePgModule(), makePostgresStore(), RecordedSql, tempDirs

### Community 125 - "Community 125"
Cohesion: 0.22
Nodes (10): build_graph(), cluster(), cohesion_score(), Leiden community detection on NetworkX graphs. Splits oversized communities. Ret, Run Leiden community detection. Returns {community_id: [node_ids]}.      Communi, Build a NetworkX graph from graphify node/edge dicts.      Preserves original ed, Run a second Leiden pass on a community subgraph to split it further., Ratio of actual intra-community edges to maximum possible. (+2 more)

### Community 126 - "Community 126"
Cohesion: 0.18
Nodes (8): MCP_CONFIG_FILENAMES, collectFiles(), extractMcpConfig(), _extractMcpConfigAsync(), isMcpConfigPath(), _mcpDetectPackageFromArgs(), _mcpStripVersion(), tempDirs

### Community 127 - "Community 127"
Cohesion: 0.18
Nodes (5): toHtml(), html, html, tokenLine, html

### Community 128 - "Community 128"
Cohesion: 0.18
Nodes (11): braceDelta(), extractAstro(), extractGroovy(), extractRegexBackedCode(), extractSql(), extractSvelte(), lineForIndex(), normalizeSqlObjectName() (+3 more)

### Community 129 - "Community 129"
Cohesion: 0.18
Nodes (10): communities, communityLabels, dir, G, list, long, outPath, result (+2 more)

### Community 130 - "Community 130"
Cohesion: 0.18
Nodes (9): focused, graph, graphJsonShape, html, state, strongOnly, subgraph, tokens (+1 more)

### Community 131 - "Community 131"
Cohesion: 0.27
Nodes (8): Base, LinearAlgebra, area(), Circle, describe(), Geometry, Point, Shape

### Community 132 - "Community 132"
Cohesion: 0.31
Nodes (7): buildConnectedDimStyle(), buildGraphRendererPayload(), densityScale(), findNearestNode(), findNearestNodeId(), isBoxShape(), truncateLabel()

### Community 133 - "Community 133"
Cohesion: 0.20
Nodes (8): CODE_EXTENSIONS, extractCsproj(), _extractCsprojAsync(), extractSln(), _extractSlnAsync(), _projectXmlIsSafe(), __testing, FIXTURES

### Community 134 - "Community 134"
Cohesion: 0.29
Nodes (10): buildGraphHtml(), htmlScript(), htmlStyles(), hyperedgeScript(), isCommunityLabelOptions(), normalizeCommunityLabels(), normalizeDescriptions(), normalizeMemberCounts() (+2 more)

### Community 135 - "Community 135"
Cohesion: 0.31
Nodes (10): activeViewFromQuery(), candidateFilters(), decisionLogOptions(), handleOntologyStudioRequest(), htmlResult(), optionalInteger(), optionalNumber(), optionalString() (+2 more)

### Community 136 - "Community 136"
Cohesion: 0.20
Nodes (9): centralEnd, centralIdx, graph, graphIdx, html, ids, state, subgraph (+1 more)

### Community 137 - "Community 137"
Cohesion: 0.27
Nodes (2): ConnectionPool, Manages a pool of persistent HTTP connections.     Keys connections by (scheme,

### Community 138 - "Community 138"
Cohesion: 0.22
Nodes (9): hs(), ku(), Ln(), mo(), Nu(), Pn(), qu(), Ru() (+1 more)

### Community 139 - "Community 139"
Cohesion: 0.39
Nodes (5): Analyzer, compute_score(), normalize(), Fixture: functions and methods that call each other - for call-graph extraction, run_analysis()

### Community 140 - "Community 140"
Cohesion: 0.36
Nodes (6): artifactHasDeepRoute(), asRecord(), existingValidSidecarErrors(), importImageDataprepBatchResults(), readCaption(), readJsonl()

### Community 141 - "Community 141"
Cohesion: 0.42
Nodes (7): applyEntry(), collectEntries(), gitAdvice(), migrateGraphifyOut(), normalizeGitPath(), planGraphifyOutMigration(), shellQuote()

### Community 142 - "Community 142"
Cohesion: 0.36
Nodes (6): buildMinimalContext(), riskFromScore(), suggestionsForTask(), topCommunities(), topFlowNames(), uniqueSorted()

### Community 143 - "Community 143"
Cohesion: 0.25
Nodes (2): DataProcessor, IProcessor

### Community 144 - "Community 144"
Cohesion: 0.22
Nodes (9): buildFreshnessMetadata(), computeTopologySignature(), computeTopologySignatureFromLinks(), isSvgOptions(), nodeCommunityMap(), persistGraphWithCitations(), toGraphml(), toJson() (+1 more)

### Community 145 - "Community 145"
Cohesion: 0.22
Nodes (6): extractWithDiagnostics(), inferCommonRoot(), _mergeSwiftExtensions(), projectRelativeFilePath(), remapFileNodeIds(), toPortablePath()

### Community 146 - "Community 146"
Cohesion: 0.33
Nodes (7): CustomProviderConfig, CustomProviderMap, globalProvidersPath(), loadCustomProviders(), LoadCustomProvidersOptions, localProvidersPath(), providerBaseUrlOk()

### Community 147 - "Community 147"
Cohesion: 0.42
Nodes (5): cloneRepo(), defaultCloneDestination(), execGit(), maybeGithubRepo(), repoNameFromUrl()

### Community 148 - "Community 148"
Cohesion: 0.31
Nodes (5): cites(), cleanupDirs, hub(), setupProject(), tempDir()

### Community 149 - "Community 149"
Cohesion: 0.29
Nodes (7): args, die(), manifest, manifestModels, outDir, parseArgs(), root

### Community 150 - "Community 150"
Cohesion: 0.25
Nodes (6): importsFromBarrel, importsFromTargets, labels, reExports, reExportTagged, targets

### Community 151 - "Community 151"
Cohesion: 0.25
Nodes (7): graph, html, idxControls, idxCounters, idxGraphPanel, state, tokens

### Community 152 - "Community 152"
Cohesion: 0.25
Nodes (6): graph, html, occurrences, panelIdx, slotIdx, tokens

### Community 153 - "Community 153"
Cohesion: 0.25
Nodes (7): dataset, dirty, facets, keys, slices, state, status

### Community 154 - "Community 154"
Cohesion: 0.25
Nodes (7): graph, html, idxChar, idxLoc, idxWork, state, tokens

### Community 155 - "Community 155"
Cohesion: 0.29
Nodes (5): Server, main(), NewServer(), process(), validate()

### Community 156 - "Community 156"
Cohesion: 0.29
Nodes (4): dest, root, src, studio

### Community 157 - "Community 157"
Cohesion: 0.29
Nodes (6): backupIfProtected(), todayIso(), b1, b2, backup, dated

### Community 158 - "Community 158"
Cohesion: 0.33
Nodes (7): optionalInteger(), optionalNumber(), optionalString(), reconciliationCandidateFilters(), toolGetReconciliationCandidate(), toolListReconciliationCandidates(), toolPreviewOntologyDecisionLog()

### Community 159 - "Community 159"
Cohesion: 0.38
Nodes (4): tempDirs, write(), writeGraph(), writeJson()

### Community 160 - "Community 160"
Cohesion: 0.29
Nodes (6): evidenceQuery, html, reconHtml, reconQuery, tokens, workspaceHtml

### Community 161 - "Community 161"
Cohesion: 0.29
Nodes (6): query, restored, state, state0, state1, state2

### Community 162 - "Community 162"
Cohesion: 0.53
Nodes (4): estimateTokens(), loadGraph(), querySubgraphTokens(), runBenchmark()

### Community 163 - "Community 163"
Cohesion: 0.33
Nodes (6): 20dd597 chore(graphify): refresh graph artifacts after tree and ignore parity, 3d3f61c docs(v6): close v0.6.7 traceability deltas, 7493d73 chore(graphify): refresh graph artifacts after antigravity parity, 78499cb test(v6): cover portable path and reinstall parity, c909614 feat(v6): cover tree, dynamic imports, and ignore negation parity, e7ce896 feat(v6): add antigravity frontmatter parity

### Community 164 - "Community 164"
Cohesion: 0.33
Nodes (3): loadWorkspace(), LIGHT_SCENE, RAW_GRAPH

### Community 165 - "Community 165"
Cohesion: 0.47
Nodes (1): ApiClient

### Community 166 - "Community 166"
Cohesion: 0.53
Nodes (1): HttpClient

### Community 167 - "Community 167"
Cohesion: 0.33
Nodes (4): claudeInstall(), installClaudeHook(), tempDirs, tempDirs

### Community 168 - "Community 168"
Cohesion: 0.33
Nodes (3): spannerDdlLines(), toSpanner(), cleanupDirs

### Community 169 - "Community 169"
Cohesion: 0.33
Nodes (1): cleanupDirs

### Community 170 - "Community 170"
Cohesion: 0.33
Nodes (4): communitiesIdx, facetsIdx, graph, html

### Community 171 - "Community 171"
Cohesion: 0.70
Nodes (4): addCall(), addFunction(), makeFlowStore(), qn()

### Community 172 - "Community 172"
Cohesion: 0.40
Nodes (5): ha(), Ka(), qa(), Va(), zo()

### Community 173 - "Community 173"
Cohesion: 0.50
Nodes (2): addFunction(), qn()

### Community 174 - "Community 174"
Cohesion: 0.80
Nodes (4): isRecord(), isStringArray(), validateImageCaption(), validateImageRouting()

### Community 175 - "Community 175"
Cohesion: 0.70
Nodes (4): addCall(), addFunction(), makeStore(), qn()

### Community 176 - "Community 176"
Cohesion: 0.70
Nodes (4): addCall(), addFunction(), makeBenchmarkStore(), qn()

### Community 177 - "Community 177"
Cohesion: 0.50
Nodes (2): build_graph(), Graph

### Community 178 - "Community 178"
Cohesion: 0.60
Nodes (5): installOpenCodePlugin(), legacyOpencodeConfigPath(), loadOpenCodeConfig(), opencodeConfigPath(), uninstallOpenCodePlugin()

### Community 179 - "Community 179"
Cohesion: 0.40
Nodes (4): r1, r2, r3, result

### Community 180 - "Community 180"
Cohesion: 0.40
Nodes (4): candidateGraph, graph, html, tokens

### Community 181 - "Community 181"
Cohesion: 0.40
Nodes (4): character, dataset, groups, total

### Community 182 - "Community 182"
Cohesion: 0.50
Nodes (4): Bo(), nl(), Sa(), Wt()

### Community 183 - "Community 183"
Cohesion: 0.67
Nodes (3): build(), build_from_json(), Merge multiple extraction results into one graph.

### Community 184 - "Community 184"
Cohesion: 0.67
Nodes (2): addNode(), qn()

### Community 186 - "Community 186"
Cohesion: 0.67
Nodes (3): escapeHtml(), HTML_ESCAPE_MAP, renderInlineMarkdown()

### Community 187 - "Community 187"
Cohesion: 0.67
Nodes (3): MyApp.Accounts.User, create(), validate()

### Community 188 - "Community 188"
Cohesion: 0.50
Nodes (1): tempDirs

### Community 189 - "Community 189"
Cohesion: 1.00
Nodes (3): 5a77fb5 C3 visual encoding: per-file_type shapes, per-relation edge dashes, legend, a73a9d9 Merge pull request #29 from rhanka/feat/track-c3-visual-encoding, b02d92b Bump version to 0.8.0

### Community 196 - "Community 196"
Cohesion: 0.67
Nodes (3): Animal, -initWithName, -speak

### Community 197 - "Community 197"
Cohesion: 0.67
Nodes (1): Transformer

### Community 198 - "Community 198"
Cohesion: 0.67
Nodes (3): writeFixtureGraph(), writeOntologyPatchFixture(), writeOntologyReconciliationFixture()

### Community 204 - "Community 204"
Cohesion: 1.00
Nodes (2): Dog, -fetch

### Community 205 - "Community 205"
Cohesion: 1.00
Nodes (1): Processor

## Knowledge Gaps
- **1083 isolated node(s):** `Qt`, `_a`, `ya`, `No`, `Jr` (+1078 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 64`** (2 nodes): `AsyncClient`, `Client`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 109`** (1 nodes): `310d1f1 feat(studio): labeled box nodes for box-category node_types (legacy parity)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 137`** (2 nodes): `ConnectionPool`, `Manages a pool of persistent HTTP connections.     Keys connections by (scheme,`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 143`** (2 nodes): `DataProcessor`, `IProcessor`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 165`** (1 nodes): `ApiClient`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 166`** (1 nodes): `HttpClient`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 169`** (1 nodes): `cleanupDirs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 173`** (2 nodes): `addFunction()`, `qn()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 177`** (2 nodes): `build_graph()`, `Graph`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 184`** (2 nodes): `addNode()`, `qn()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 188`** (1 nodes): `tempDirs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 197`** (1 nodes): `Transformer`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 204`** (2 nodes): `Dog`, `-fetch`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 205`** (1 nodes): `Processor`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `jt` connect `Ontology patch (validate, dry-run, apply)` to `Sample corpus: example Python pipeline (worked/)`, `Community 73`, `Community 88`, `Community 77`, `Community 182`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **Why does `Geometry` connect `Community 131` to `Community 95`?**
  _High betweenness centrality (0.003) - this node is a cross-community bridge._
- **Why does `il` connect `Community 88` to `Sample corpus: example Python pipeline (worked/)`, `Ontology patch (validate, dry-run, apply)`, `Community 98`, `Community 73`?**
  _High betweenness centrality (0.003) - this node is a cross-community bridge._
- **What connects `Qt`, `_a`, `ya` to the rest of the system?**
  _1083 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Code extraction (tree-sitter walkers)` be split into smaller, more focused modules?**
  _Cohesion score 0.062346947895254266 - nodes in this community are weakly interconnected._
- **Should `MCP server (graph queries)` be split into smaller, more focused modules?**
  _Cohesion score 0.059484346224677714 - nodes in this community are weakly interconnected._
- **Should `Audio/video transcription & ingest` be split into smaller, more focused modules?**
  _Cohesion score 0.028352932688839188 - nodes in this community are weakly interconnected._