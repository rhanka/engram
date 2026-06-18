# Graph Report - .  (2026-06-18)

## Corpus Check
- Large corpus: 520 files · ~688,087 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 8173 nodes · 58412 edges · 265 communities detected
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 466 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output
- Edge kinds: ON_BRANCH: 36603 · contains: 8795 · calls: 3057 · MODIFIES: 2664 · imports: 2505 · imports_from: 1596 · PARENT_OF: 1096 · re_exports: 1027 · uses: 466 · method: 274 · rationale_for: 222 · inherits: 86 · defines: 17 · references: 4


## Input Scope
- Requested: auto
- Resolved: committed (source: default-auto)
- Included files: 520 · Candidates: 569
- Excluded: 0 untracked · 39219 ignored · 8 sensitive · 0 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.

## Graph Freshness
- Built from Git commit: `9cae385`
- Compare this hash to `git rev-parse HEAD` before trusting freshness-sensitive graph output.
## God Nodes (most connected - your core abstractions)
1. `Extraction` - 48 edges
2. `Response` - 46 edges
3. `Response` - 45 edges
4. `Request` - 43 edges
5. `Request` - 42 edges
6. `jt` - 34 edges
7. `_makeId()` - 34 edges
8. `detect()` - 31 edges
9. `resolveGraphifyPaths()` - 31 edges
10. `DetectionResult` - 29 edges

## Surprising Connections (you probably didn't know these)
- `Core data models: URL, Headers, Cookies, Request, Response. These are the centra` --uses--> `HTTPStatusError`  [INFERRED]
  worked/httpx/raw/models.py → worked/httpx/raw/exceptions.py
- `Utility functions shared across the library. Small helpers that don't belong in` --uses--> `Cookies`  [INFERRED]
  worked/httpx/raw/utils.py → worked/httpx/raw/models.py
- `Convert a primitive value to its string representation.` --uses--> `Cookies`  [INFERRED]
  worked/httpx/raw/utils.py → worked/httpx/raw/models.py
- `Convert a header key to its canonical Title-Case form.` --uses--> `Cookies`  [INFERRED]
  worked/httpx/raw/utils.py → worked/httpx/raw/models.py
- `Expand a params dict into a flat list of (key, value) pairs.     List values bec` --uses--> `Cookies`  [INFERRED]
  worked/httpx/raw/utils.py → worked/httpx/raw/models.py

## Communities

### Community 0 - "Code extraction (tree-sitter walkers)"
Cohesion: 0.24
Nodes (331): chore/remove-handover, chore/track-wp9-dossier, ci/pages-nojekyll, correctness-rebase, docs/readme-recenter, feat/agent-stats-fixes, feat/agent-stats-mvp, feat/agent-stats-phase1 (+323 more)

### Community 1 - "PDF preflight & semantic prep"
Cohesion: 0.25
Nodes (322): chore/graphify-track-refresh-qa, chore/release-0.14.0, chore/wp9-agent-stats-closeout, codex/quality-target-qa, feat/agent-stats-codex-headless, feat/assembly-hygiene-deorphan, feat/assembly-reconciliation-hardening, feat/citations-pass2-engine (+314 more)

### Community 2 - "Input scope, git, repo clone"
Cohesion: 0.05
Nodes (202): feat/track-c-3.5-visual-encoding, feat/track-f-h1-hypergraph, feat/track-f-m2-v08x, feat/track-g-process-std-workspace, feat/track-g-g3-viewer-state, 014aace Address Lot 4 provider review fixes, 0440c1e Merge pull request #25 from rhanka/feat/track-c1-review-precision, 06388da chore(graphify): refresh graph artifacts after tree and ignore parity (+194 more)

### Community 3 - "MCP server (graph queries)"
Cohesion: 0.02
Nodes (174): 6a00692 fix(track-f): antigravity path/project-install/uninstall-tree/Read-Glob hook (F-0820-0827, M11/M12/M23/M24), 89db804 chore(track-f): update bilan with F-0820-0827 correctness lot results (M5/M6/M9/M10/M11/M12/M13/M15/M21/M23/M24/M26), safeToHtml(), agentsInstall(), agentsUninstall(), ANTIGRAVITY_RULE_PATH, ANTIGRAVITY_WORKFLOW_PATH, antigravityInstall() (+166 more)

### Community 4 - "Audio/video transcription & ingest"
Cohesion: 0.04
Nodes (165): feat/track-b-reconciliation-ui, feat/track-g-d12-forcegraph, feat/track-g-studio-impl, spec/reconciliation-algorithm, 00a2d8c Refresh .graphify after community-naming round 1 (top 41 named), 07c1c6d docs(plan): mark graph artifact gate complete, 0938526 Refresh graph after wiki description export updates, 0c6476e Scaffold batch mode for wiki descriptions (Track A Lot A2) (+157 more)

### Community 5 - "File detection & Google Workspace"
Cohesion: 0.03
Nodes (124): 0509dea Add no-Python fallback language coverage, 1ba42c9 Merge pull request #14 from rhanka/upstream-0.7.4-traceability, 21b4be3 Refresh graph after SQL extraction rebase, 23e4b4e Merge pull request #14 from rhanka/upstream-0.7.4-traceability, 2b5e757 Release 0.9.6: F-M2 port upstream v0.8.11→v0.8.13 + Track C-3.5 wiring (#46), 2c9ce6d Persist community labels through rebuildCode (update / hook-rebuild), 2f660d1 Merge pull request #19 from rhanka/feat/upstream-0.7.10-lot2, 387c7f6 Refresh graph after SQL extraction merge (+116 more)

### Community 6 - "Sample corpus: example Python pipeline (worked/)"
Cohesion: 0.02
Nodes (97): _a, ao(), au(), ba(), bf(), bu(), cu(), ds() (+89 more)

### Community 7 - "Exporters (HTML, canvas, JSON)"
Cohesion: 0.05
Nodes (39): Auth, BasicAuth, BearerAuth, DigestAuth, NetRCAuth, Authentication handlers. Auth objects are callables that modify a request before, Load credentials from ~/.netrc based on the request host., Base class for all authentication handlers. (+31 more)

### Community 8 - "Sample corpus: mixed analyze.py (worked/)"
Cohesion: 0.05
Nodes (98): 1a63d0a fix(track-f): filter language built-ins from call-edge resolution (F-0820-0827, 80301a0 #916), 3f9efdc fix(track-f): TypeScript interface-extends and same-file class heritage emit inherits/implements edges (F-0820-0827, 88a8e3b #1095), 83426ff fix(track-f): Python decorated methods inherit parentClassNid; already-covered proofs for M6b/M6c/M15 (F-0820-0827, 9f73400 #1050/#1046/#1047), braceDelta(), _C_CONFIG, CASE_INSENSITIVE_CALL_MODULES, _CPP_CONFIG, _CSHARP_CONFIG (+90 more)

### Community 9 - "Review delta & risk chains"
Cohesion: 0.05
Nodes (81): bfs(), communitiesFromGraph(), communityName(), dfs(), findNode(), getVersion(), loadGraph(), scoreNodes() (+73 more)

### Community 10 - "Flow detection & criticality"
Cohesion: 0.02
Nodes (84): analysis, analysisPath, analysisValues, article, artifact, cacheKey, captionsDir, configOut (+76 more)

### Community 11 - "CLI runtime & search"
Cohesion: 0.06
Nodes (64): augmentDetectionWithPdfPreflight(), cloneDetection(), countWords(), dedupe(), listImageArtifacts(), loadMistralOcrModule(), metadataPath(), preparePdf() (+56 more)

### Community 12 - "Cache, paths, benchmark"
Cohesion: 0.06
Nodes (62): estimateTokens(), loadGraph(), printBenchmark(), querySubgraphTokens(), runBenchmark(), BenchmarkOptions, estimateTokens(), loadGraph() (+54 more)

### Community 13 - "Review analysis (blast radius, communities)"
Cohesion: 0.06
Nodes (58): buildReviewDelta(), changedNodeIds(), compareNodes(), compareStrings(), highRiskChains(), impactedNodeIds(), isTestPath(), likelyTestGaps() (+50 more)

### Community 14 - "Portable-check & detection portability"
Cohesion: 0.07
Nodes (61): 2810e65 feat(gh): extract pull requests to graphify Extraction (WP9), 29bf908 fix(gh): emit full commit shas for cross-profile join with extract-git (WP9 gate), bad1965 feat(gh): extract pull requests to Extraction (WP9) (#175), aggregateChecks(), CheckAggregate, checkBucket(), commitSha(), edgeKey() (+53 more)

### Community 15 - "Sample corpus: httpx Python client (worked/)"
Cohesion: 0.07
Nodes (65): asRecord(), asStringArray(), bindOntologyProfile(), hashOntologyProfile(), loadOntologyProfile(), normalizeCitationPolicy(), normalizeHardeningPolicy(), normalizeOntologyProfile() (+57 more)

### Community 16 - "Review context builder"
Cohesion: 0.05
Nodes (64): alphaNeighbors, audit, beforeAudit, beforeDecisions, betaNeighbors, candidate, candidateResponse, candidates (+56 more)

### Community 17 - "Ontology profile loader"
Cohesion: 0.07
Nodes (60): collectJsonIssues(), collectStringIssues(), collectTextIssues(), hasSchemePrefix(), isIgnoredLocalArtifact(), isWindowsAbsolutePath(), makeDetectionPortable(), normalizeFileMap() (+52 more)

### Community 18 - "Sample corpus: httpx exceptions (worked/)"
Cohesion: 0.08
Nodes (59): StringMapLike, toStringMap(), BACKUP_ARTIFACTS, backupIfProtected(), buildFreshnessMetadata(), buildGraphHtml(), CanvasOptions, COMMUNITY_COLORS (+51 more)

### Community 19 - "Profile validation"
Cohesion: 0.05
Nodes (60): OntologyPatchContext, OntologyPatchNode, candidateId(), candidateScore(), chooseCanonicalPair(), CONTAINMENT_HEAD_NOUNS, DEFAULT_FUZZY_EXCLUDE_TYPES, differentEntityReason() (+52 more)

### Community 20 - "Configured dataprep (profile mode)"
Cohesion: 0.07
Nodes (17): AsyncClient, BaseClient, Client, Limits, The main Client and AsyncClient classes. BaseClient holds all shared logic. Clie, Asynchronous HTTP client., Shared implementation for Client and AsyncClient.     Handles auth, redirects, c, Synchronous HTTP client. (+9 more)

### Community 21 - "CLI top-level & assistant-integration tests"
Cohesion: 0.05
Nodes (47): Exception, CookieConflict, Attempted to look up a cookie by name but multiple cookies exist., CloseError, ConnectError, ConnectTimeout, CookieConflict, DecodingError (+39 more)

### Community 22 - "Multi-language test fixtures"
Cohesion: 0.09
Nodes (57): 9a3e1dd feat(studio/reconciliation): type-grouped rail, score bubbles, two-line pairs, batch validate + depth-3 neighbourhood, applyWeakFilter(), attachReconLayout(), BOX_LABEL_NODE_TYPES, buildGraphIndex(), buildScene(), candidateSubgraph(), citationsByFile() (+49 more)

### Community 23 - "Review benchmark"
Cohesion: 0.05
Nodes (61): detectChangesToMinimal(), detectChangesToText(), toCypher(), affectedFlowsToText(), buildFlowArtifact(), flowDetailToText(), flowListToText(), flowToSteps() (+53 more)

### Community 24 - "Sample corpus: httpx utils (worked/)"
Cohesion: 0.09
Nodes (56): 03d6f5d Merge pull request #18 from rhanka/feat/wiki-reconciliation-ui, 1ce0e3b Ignore local dotenv files, 2127b64 feat: add ontology write mcp mode, 3eda59f Merge pull request #15 from rhanka/feat/ontology-lifecycle-core, 61c3eb0 Add ontology reconciliation candidate queue, 657af78 chore(release): bump version to 0.7.5, 9517dd4 Add ontology reconciliation candidate queue, b319059 ci: run direct llm provider uat (+48 more)

### Community 25 - "Recommendations (commit prefix, area)"
Cohesion: 0.08
Nodes (57): BenchmarkResult, ExtractionProvenance, FileType, GraphDiffResult, GraphifyImageAnalysisBatchPolicy, GraphifyImageAnalysisCalibrationPolicy, GraphifyImageArtifactSource, GraphifyLlmExecutionBatchPolicy (+49 more)

### Community 26 - "Change detection & risk score"
Cohesion: 0.08
Nodes (58): asBoolean(), asNumber(), asRecord(), asString(), asStringArray(), buildRegistrySources(), loadProjectConfig(), normalizeProjectConfig() (+50 more)

### Community 27 - "Profile discovery/extraction prompts"
Cohesion: 0.07
Nodes (50): AgyParseOptions, asToolCall(), commandFromToolArgs(), cwdInScope(), emptySession(), filePathFromToolArgs(), firstString(), handleToolCall() (+42 more)

### Community 28 - "Sample corpus: example storage.py (worked/)"
Cohesion: 0.07
Nodes (45): baseState(), validationResult(), addIssue(), citations(), isProfileEdge(), isRegistrySeed(), stringValue(), validateCitations() (+37 more)

### Community 29 - "Profile report"
Cohesion: 0.06
Nodes (47): average(), buildBlastRadius(), buildReviewAnalysis(), communityLabel(), communityRisk(), compareStrings(), estimateTokens(), evaluateReviewAnalysis() (+39 more)

### Community 30 - "Ontology patch (validate, dry-run, apply)"
Cohesion: 0.06
Nodes (41): CloseError, ConnectError, ConnectTimeout, DecodingError, NetworkError, PoolTimeout, ProtocolError, ProxyError (+33 more)

### Community 31 - "Sample corpus: httpx auth/client (worked/)"
Cohesion: 0.07
Nodes (46): resolveIdentity(), workspaceLabel(), H2aInstance, loadH2aInstances(), matchInstance(), AGENT_STATS_SCHEMA, AgentReport, AgentStatsReport (+38 more)

### Community 32 - "Test fixtures: C#/Java/PowerShell"
Cohesion: 0.09
Nodes (49): absolutizeSourceFilesIn(), bodyContent(), CACHE_BUCKETS, cachedFiles(), cacheDir(), cacheKind(), cacheNamespace(), CacheOptions (+41 more)

### Community 33 - "Image routing calibration"
Cohesion: 0.06
Nodes (50): handle_delete(), handle_enrich(), handle_get(), handle_list(), handle_search(), handle_upload(), API module - exposes the document pipeline over HTTP. Thin layer over parser, va, Accept a list of file paths, run the full pipeline on each,     and return a sum (+42 more)

### Community 34 - "Ontology output (wiki, obsidian, etc.)"
Cohesion: 0.07
Nodes (47): ALL_EXTRACTED_CITATION_CONTRACT, asBoolean(), asNonNegativeNumber(), asPositiveInteger(), asRecord(), asString(), asStringArray(), canonicalize() (+39 more)

### Community 35 - "Graph summary (first-hop orientation)"
Cohesion: 0.09
Nodes (48): augmentDetectionWithTranscripts(), buildWhisperPrompt(), CACHED_AUDIO_EXTENSIONS, cloneDetection(), defaultWhisperCacheDir(), downloadAudio(), downloadFile(), ensureWhisperArtifacts() (+40 more)

### Community 36 - "Analyze (god nodes, surprising connections)"
Cohesion: 0.04
Nodes (51): astroNode, baseNode, buildNode, cardNode, classNode, cleanNode, codeNode, constructorCall (+43 more)

### Community 37 - "Sample corpus: httpx auth (worked/)"
Cohesion: 0.08
Nodes (48): _cross_community_surprises(), _cross_file_surprises(), _file_category(), god_nodes(), graph_diff(), _is_concept_node(), _is_file_node(), _node_community_map() (+40 more)

### Community 38 - "Tests: wiki description generation"
Cohesion: 0.08
Nodes (47): affectedFlowsToText(), buildFlowArtifact(), compareStrings(), computeFlowCriticality(), decoratorsOf(), detectEntryPoints(), flowDetailToText(), flowIdFor() (+39 more)

### Community 39 - "Sample corpus: httpx client (worked/)"
Cohesion: 0.08
Nodes (41): basenameNoExt(), codexThreadId(), discoverAgy(), discoverClaude(), discoverCodex(), Host, listFilesRec(), repoSlug() (+33 more)

### Community 40 - "Sample corpus: httpx transport (worked/)"
Cohesion: 0.09
Nodes (44): b25a47e Add wiki description sidecar model, LlmExecutionMode, buildCommunityContentHash(), buildNodeContentHash(), buildWikiDescriptionCacheKey(), checkWikiDescriptionFreshness(), createInsufficientEvidenceRecord(), CreateInsufficientEvidenceRecordInput (+36 more)

### Community 41 - "LLM execution (direct backends)"
Cohesion: 0.13
Nodes (47): OntologyReconciliationCandidate, OntologyReconciliationCandidatesResponse, buildModel(), candidateHref(), CompactMetaInline, decisionBasisReason(), descriptionSidecarFor(), displayText() (+39 more)

### Community 42 - "Community 42"
Cohesion: 0.07
Nodes (25): bs(), ci(), cl(), di(), dl(), dr(), Fi(), Go() (+17 more)

### Community 43 - "Community 43"
Cohesion: 0.08
Nodes (38): compileNodes(), compileOntologyOutputs(), compileRelations(), ontologyNodeType(), safeFilename(), sha256(), stringValue(), writeJson() (+30 more)

### Community 44 - "Community 44"
Cohesion: 0.10
Nodes (39): d0b0710 feat(studio): legacy-parity box nodes drawn in canvas (labeled rounded rect, text for central Work/Chapter nodes), fd4c7c5 feat(studio): box nodes rendered in canvas, sized to text, single label (legacy parity, fixes duplicate/oversize), BOX_LABEL_NODE_TYPES, buildStudioScene(), BuildStudioSceneOptions, communityLiveCount(), computeDegrees(), computeGodClass() (+31 more)

### Community 45 - "Community 45"
Cohesion: 0.08
Nodes (31): applyCamera(), applyPayload(), cancelMergeFrame(), clearHoveredEdge(), easeMergeProgress(), edgeKey(), ensureRenderer(), eventToWorld() (+23 more)

### Community 46 - "Community 46"
Cohesion: 0.08
Nodes (28): aggregateCitations(), AggregateCitationsOptions, backfillCitations(), BackfillCitationsOptions, BackfillCitationsResult, CitationAggregateEntry, CitationAggregateMap, citationKey() (+20 more)

### Community 47 - "Community 47"
Cohesion: 0.13
Nodes (42): entityPanelStyles(), buildNodeFacts(), CompactDescriptionContext, computeCounters(), countEdgeEvidence(), CountersValues, DEFAULT_INLINE_FACTS, DEFAULT_SECTIONS (+34 more)

### Community 48 - "Community 48"
Cohesion: 0.11
Nodes (40): appendMemoryFiles(), buildGitInventory(), countGitPaths(), fallbackAllScope(), gitInventory(), inspectInputScope(), isGraphifyMemoryPath(), isInputScopeMode() (+32 more)

### Community 49 - "Community 49"
Cohesion: 0.11
Nodes (41): acquire2DContext(), acquireContext(), applyDash(), AttributeLocations, bindCameraUniforms(), BOX_FILL, boxDimensions(), buildEdgeColors() (+33 more)

### Community 50 - "Community 50"
Cohesion: 0.07
Nodes (35): Cookies, build_url_with_params(), flatten_queryparams(), is_known_encoding(), normalize_header_key(), obfuscate_sensitive_headers(), parse_content_type(), primitive_value_to_str() (+27 more)

### Community 51 - "Community 51"
Cohesion: 0.12
Nodes (37): add(), artifactHashes(), artifactPathFor(), asRecord(), candidateArrayFromReconciliation(), computeDataOnlyChromeHashes(), computeGraphCitationSignatureFromJson(), DataOnlyChromeHashes (+29 more)

### Community 52 - "Community 52"
Cohesion: 0.10
Nodes (33): 170f0ef Merge branch 'feat/studio-show-descriptions' into feat/node-type-boxes, buildEntitySidecar(), CitationSidecarEntry, citationsSidecarCache, CitationsSidecarCacheEntry, CitationsSidecarShape, computeGraphCitationSignature(), __dirname (+25 more)

### Community 53 - "Community 53"
Cohesion: 0.06
Nodes (36): addCall(), addFunction(), qn(), tempDir(), addFunction(), allNames, api, artifact (+28 more)

### Community 54 - "Community 54"
Cohesion: 0.10
Nodes (30): buildCommitRecommendation(), commitPrefixForArea(), commitRecommendationToText(), communitiesFromDelta(), communityLabel(), compareStrings(), confidenceRank(), dominantCommunity() (+22 more)

### Community 55 - "Community 55"
Cohesion: 0.13
Nodes (38): buildFallbackSidecar(), buildTargetContentHash(), buildWikiDescriptionPrompt(), BuildWikiDescriptionPromptOptions, collectCommunityTargetContext(), collectInferredCommunityMap(), collectNodeNeighbors(), collectNodeTargetContext() (+30 more)

### Community 56 - "Community 56"
Cohesion: 0.09
Nodes (22): alternateFixture(), ContractFixture, ContractGraphStore, describeGraphStoreContract(), GraphStore, create(), InMemoryNeo4jState, largeGraph() (+14 more)

### Community 57 - "Community 57"
Cohesion: 0.10
Nodes (30): AssistantLlmClientOptions, BatchTextJsonImportInput, BatchTextJsonImportResult, BatchVisionExportInput, BatchVisionExportResult, BatchVisionImportInput, BatchVisionImportResult, BatchVisionJsonClient (+22 more)

### Community 58 - "Community 58"
Cohesion: 0.09
Nodes (34): buildFirstHopSummary(), buildNextBestAction(), communityLabels(), communityMembership(), compareHubs(), compareStrings(), FirstHopCommunity, FirstHopHub (+26 more)

### Community 59 - "Community 59"
Cohesion: 0.08
Nodes (26): InMemoryPgState, makeFakePgModule(), makePgVectorStore(), RecordedQuery, createPgVectorStore(), deriveNamespace(), GraphStoreConfig, PgClientLike (+18 more)

### Community 60 - "Community 60"
Cohesion: 0.11
Nodes (36): asRecord(), assertAcceptedImageRoutingRules(), bucketMatches(), calibrateImageRouting(), countArray(), imageRoutingSampleFromCaption(), loadImageRoutingLabels(), loadImageRoutingRules() (+28 more)

### Community 61 - "Community 61"
Cohesion: 0.09
Nodes (29): analyzeChanges(), changedNodesFromFiles(), compareStrings(), computeRiskScore(), detectChangesToMinimal(), detectChangesToText(), isRiskScoredKind(), isSafeGitRef() (+21 more)

### Community 62 - "Community 62"
Cohesion: 0.12
Nodes (34): buildProfileChunkPrompt(), buildProfileExtractionPrompt(), buildProfileValidationPrompt(), chunkGuidance(), citationSection(), genericSafetySection(), hardeningSection(), inputHintsSection() (+26 more)

### Community 63 - "Community 63"
Cohesion: 0.10
Nodes (32): 05ee028 Add optional Google Workspace shortcut export, 18e62d0 Refresh graph after Lot 4 Ollama and Google Workspace ports, 93560d5 Address Lot 4 provider review fixes, bc882be Add Ollama as a credential-free direct LLM provider, c627b66 Close Lot 4 traceability: Ollama covered, Bedrock deferred, GWorkspace covered, dfc9b44 Refresh graph after Lot 4 review fixes, convertGoogleWorkspaceFile(), ConvertGoogleWorkspaceOptions (+24 more)

### Community 64 - "Community 64"
Cohesion: 0.13
Nodes (33): buildReviewContext(), buildReviewGuidance(), buildSourceSnippets(), changedFunctionsWithoutTests(), compareStrings(), extractRelevantLines(), formatLines(), isInside() (+25 more)

### Community 65 - "Community 65"
Cohesion: 0.13
Nodes (34): ASSET_DIR_MARKERS, canonicalFilePath(), classifyFile(), CODE_EXTENSIONS, DetectOptions, DOC_EXTENSIONS, envCommandArgs(), GOOGLE_WORKSPACE_EXTENSIONS (+26 more)

### Community 66 - "Community 66"
Cohesion: 0.08
Nodes (25): arcStatus(), buildOneHierarchy(), buildSceneHierarchySidecar(), BuildSceneHierarchySidecarOptions, arcNodeIds(), clearSceneHierarchiesEmitterCache(), emitSceneHierarchies(), EmitSceneHierarchiesOptions (+17 more)

### Community 67 - "Community 67"
Cohesion: 0.16
Nodes (25): createFileGraphStore(), __dirname, FileGraphStore, FileStoreClearOptions, moduleDir(), resolveToolVersion(), create(), factories (+17 more)

### Community 68 - "Community 68"
Cohesion: 0.10
Nodes (29): applyEntry(), collectEntries(), gitAdvice(), migrateGraphifyOut(), migrationResultToText(), normalizeGitPath(), planGraphifyOutMigration(), shellQuote() (+21 more)

### Community 69 - "Community 69"
Cohesion: 0.10
Nodes (30): average(), compareStrings(), countHits(), estimateTokens(), evaluateReviewBenchmarks(), f1(), flowIdentifiers(), formatMetric() (+22 more)

### Community 70 - "Community 70"
Cohesion: 0.15
Nodes (31): OntologyReconciliationDecisionLogOptions, OntologyReconciliationCandidateFilter, activeViewFromQuery(), bearerToken(), candidateFilters(), decisionLogOptions(), graphHtmlArtifactResult(), graphJsonResult() (+23 more)

### Community 71 - "Community 71"
Cohesion: 0.14
Nodes (31): crossCommunitySurprises(), crossFileSurprises(), edgeBetweennessSurprises(), fileCategory(), godNodes(), isConceptNode(), isFileNode(), nodeCommunityMap() (+23 more)

### Community 72 - "Community 72"
Cohesion: 0.19
Nodes (34): ac(), Be(), cf(), Dd(), de(), Dn(), Do(), dv() (+26 more)

### Community 73 - "Community 73"
Cohesion: 0.13
Nodes (16): Auth, BasicAuth, BearerAuth, DigestAuth, NetRCAuth, Authentication handlers. Auth objects are callables that modify a request before, Load credentials from ~/.netrc based on the request host., Base class for all authentication handlers. (+8 more)

### Community 74 - "Community 74"
Cohesion: 0.10
Nodes (31): 5d37712 docs(spec): document de-orphan giant-component join (TRACKED #3), da9e0c6 fix(assembly-hygiene): de-orphan joins giant component, no 2-node islands, AliasDerivationConfig, asCitations(), buildAdjacency(), canonicalId(), canonicalType(), capitalize() (+23 more)

### Community 75 - "Community 75"
Cohesion: 0.12
Nodes (32): delete_record(), _ensure_storage(), list_records(), load_index(), load_record(), Storage module - persists documents to disk and maintains the search index. All, Load the full document index from disk., Persist the index to disk. (+24 more)

### Community 76 - "Community 76"
Cohesion: 0.11
Nodes (30): buildConversationsExtraction(), BuildConversationsExtractionOptions, ClaudeCommitResolveOptions, collectPromptStats(), ConversationCompactionEvent, ConversationEventBase, conversationId(), CONVERSATIONS_ONTOLOGY_PROFILE (+22 more)

### Community 77 - "Community 77"
Cohesion: 0.19
Nodes (24): 14160c3 Track G G2: workspace shell static scaffold + a11y baseline, 35d561c Track G G1: workspace token contract + local fallback + DS adapter, html, tokens, buildFacetValues(), collectFieldNames(), DENYLIST, DiscoverFacetsOptions (+16 more)

### Community 78 - "Community 78"
Cohesion: 0.09
Nodes (27): field(), loadProfileRegistries(), loadProfileRegistry(), normalizeRegistryRecord(), readRegistryRows(), registryRecordsToExtraction(), safeIdPart(), makeTempDir() (+19 more)

### Community 79 - "Community 79"
Cohesion: 0.08
Nodes (30): createOntologyStudioRequestHandler(), generateOntologyStudioToken(), isLoopbackHost(), startOntologyStudioServer(), apply, audit, auditLine, authoritative (+22 more)

### Community 80 - "Community 80"
Cohesion: 0.15
Nodes (25): ALLOWED_SCHEMES, BLOCKED_HOSTS, embeddedIPv4(), escapeHtml(), expandIPv6(), isLinkLocalIp(), isPrivateIp(), isRedirectStatus() (+17 more)

### Community 81 - "Community 81"
Cohesion: 0.11
Nodes (26): CommitConflict, correlate(), CorrelateInput, detectCommitConflicts(), findByScan(), GitCommitMeta, indexCommits(), indexPrMergesByBranch() (+18 more)

### Community 82 - "Community 82"
Cohesion: 0.09
Nodes (24): 3286ecd feat(qa): add target manifest QA gate (#177), 4151efa feat(qa): gate studio publication bundles, 693caa7 feat(qa): evaluate target bundle gates, 860e4dd feat(cli): add graphify qa command, 8d27f1c fix(studio): guard document-only graph QA, 9cae385 fix(qa): gate document studio graph regressions, cdd2a39 spec(qa): define target manifest and quality gate, dc13a91 feat(qa): add quality target contract model (+16 more)

### Community 83 - "Community 83"
Cohesion: 0.08
Nodes (12): DataProcessor, Get-Data(), GraphifyDemo, IProcessor, Process-Items(), Processor, DataProcessor, Get-Data() (+4 more)

### Community 84 - "Community 84"
Cohesion: 0.18
Nodes (26): buildConnectedDimStyle(), buildGraphRendererPayload(), clampUnit(), cloneStyle(), colorForGroup(), curveControlPoint(), densityScale(), DIM_ALPHA (+18 more)

### Community 85 - "Community 85"
Cohesion: 0.17
Nodes (29): buildProfileReport(), graphLinks(), graphNodes(), highDegreeSection(), humanReviewSection(), invalidRelationsSection(), lowEvidenceSection(), pdfOcrSection() (+21 more)

### Community 86 - "Community 86"
Cohesion: 0.10
Nodes (27): BatchTextJsonClient, BatchTextJsonExportInput, BatchTextJsonExportResult, buildTargetKindsMap(), buildWikiDescriptionBatchExport(), BuildWikiDescriptionBatchOptions, exportWikiDescriptionBatchToJsonl(), ParseWikiDescriptionBatchOptions (+19 more)

### Community 87 - "Community 87"
Cohesion: 0.17
Nodes (26): applyConfiguredExcludes(), buildConfiguredDetectionInputs(), buildProfileState(), ConfiguredDataprepOptions, ConfiguredDataprepResult, ConfiguredDetectionInputs, countWords(), dataprepReport() (+18 more)

### Community 88 - "Community 88"
Cohesion: 0.14
Nodes (23): AllChunksFailedError, buildExtractionPrompt(), createDirectSemanticExtractionClient(), DirectSemanticChunk, DirectSemanticClientOptions, DirectSemanticExtractionClient, DirectSemanticExtractionOptions, DirectSemanticFile (+15 more)

### Community 89 - "Community 89"
Cohesion: 0.16
Nodes (26): appendRationaleAttr(), INVALID_FILE_TYPES_FOR_SANITIZE, isPlainObject(), isSentenceLikeRationaleLabel(), LoadValidatedResult, loadValidatedSemanticFragment(), sanitizeSemanticFragment(), SemanticFragment (+18 more)

### Community 90 - "Community 90"
Cohesion: 0.15
Nodes (26): artifactId(), buildImageDataprepManifest(), existingImages(), fileHash(), mimeType(), pdfArtifactByImage(), runImageDataprep(), sha256() (+18 more)

### Community 91 - "Community 91"
Cohesion: 0.15
Nodes (27): allowedPathFor(), buildOntologyDiscoveryDiff(), buildOntologyDiscoverySample(), knownEvidenceRefs(), loadOntologyDiscoveryContext(), OntologyDiscoveryProposal, OntologyDiscoveryProposalAction, OntologyDiscoveryProposalKind (+19 more)

### Community 92 - "Community 92"
Cohesion: 0.14
Nodes (27): assistantClient(), cacheKey, communities, communityKey, completedClient(), godNodesData, graph, labels (+19 more)

### Community 93 - "Community 93"
Cohesion: 0.08
Nodes (25): addEdge(), addNode(), qn(), computeRiskScore(), isSafeGitRef(), parseUnifiedDiff(), addNode(), caller (+17 more)

### Community 94 - "Community 94"
Cohesion: 0.11
Nodes (26): batch_parse(), parse_and_save(), parse_file(), parse_json(), parse_markdown(), parse_plaintext(), Parser module - reads raw input documents and converts them into a structured fo, Read a file from disk and return a structured document. (+18 more)

### Community 95 - "Community 95"
Cohesion: 0.11
Nodes (26): enrich_document(), extract_keywords(), find_cross_references(), normalize_text(), process_and_save(), Processor module - transforms validated documents into enriched records ready fo, Lowercase, strip extra whitespace, remove control characters., Pull non-stopword tokens from text, deduplicated. (+18 more)

### Community 96 - "Community 96"
Cohesion: 0.16
Nodes (25): buildCodeFileNodeIdMap(), codeFileNodeId(), CommitInfo, defaultBranch(), detectGitWindow(), discoverBranches(), edgeKey(), emptyExtraction() (+17 more)

### Community 97 - "Community 97"
Cohesion: 0.18
Nodes (19): fetchEntity(), fetchGraph(), fetchModelsManifest(), fetchReconciliationCandidates(), fetchScene(), getJson(), loadEntitiesIndex(), postPatch() (+11 more)

### Community 98 - "Community 98"
Cohesion: 0.12
Nodes (23): args, artifactSourcePath(), buildResolvedTargetManifest(), candidatesPath, candidatesResponse, die(), entities, graph (+15 more)

### Community 99 - "Community 99"
Cohesion: 0.20
Nodes (23): escapeHtml(), escapeUrl(), HTML_ESCAPE_MAP, modeLabel(), renderGraphPanel(), RenderGraphPanelOptions, renderLiveGraphScript(), renderMetricsCard() (+15 more)

### Community 100 - "Community 100"
Cohesion: 0.14
Nodes (16): OntologyWriteFixture, writeOntologyWriteFixture(), tempDirs, GRAPH_FIXTURE, makeTempDir(), tempDirs, writeGraph(), actionsSection() (+8 more)

### Community 101 - "Community 101"
Cohesion: 0.21
Nodes (22): defaultGraphPath(), defaultManifestPath(), defaultTranscriptsDir(), legacyGraphPath(), resolveGraphifyPaths(), resolveGraphInputPath(), statePath(), defaultGraphPath() (+14 more)

### Community 102 - "Community 102"
Cohesion: 0.11
Nodes (22): addEdge(), addFunction(), makeReviewGraph(), qn(), addEdge(), addFunction(), allEdges, changed (+14 more)

### Community 103 - "Community 103"
Cohesion: 0.12
Nodes (17): buildHierarchyIndex(), columnValue(), compileHierarchies(), CompileHierarchiesOptions, NormalizedOntologyHierarchySpec, NormalizedOntologyRegistrySpec, OntologyHierarchyIndex, RegistryRecord (+9 more)

### Community 104 - "Community 104"
Cohesion: 0.12
Nodes (21): ai(), al(), As(), At(), Ee(), El(), fr, ii() (+13 more)

### Community 105 - "Community 105"
Cohesion: 0.19
Nodes (20): DeOrphanConfig, SchemaHygieneConfig, asRecord(), AssemblyHygieneOptions, asString(), buildFromJson(), buildMerge(), BuildMergeOptions (+12 more)

### Community 106 - "Community 106"
Cohesion: 0.16
Nodes (20): applySalientCommunityLabels(), buildLabelingPromptLines(), CallLlmFn, detectLabelingBackend(), emitLabelInstructions(), generateCommunityLabels(), GenerateCommunityLabelsOptions, GenerateCommunityLabelsResult (+12 more)

### Community 107 - "Community 107"
Cohesion: 0.23
Nodes (22): buildRelationRows(), clampSnippet(), displayValue(), EntityOccurrence, EntityPanelOccurrences, escapeHtml(), graphEdges(), HTML_ESCAPE_MAP (+14 more)

### Community 108 - "Community 108"
Cohesion: 0.11
Nodes (22): bl(), Cs(), En(), fl(), Gt(), hl(), Hr(), Is() (+14 more)

### Community 109 - "Community 109"
Cohesion: 0.09
Nodes (19): makeTempDir(), manifest(), ImageRoutingRulesFile, blocked, captionPath, captionsDir, cleanupDirs, dense (+11 more)

### Community 110 - "Community 110"
Cohesion: 0.18
Nodes (18): buildStyleBuffers(), clampByte(), computeGodClassType(), computeNodeDegrees(), dashCode(), DEFAULT_EDGE_COLOR, DEFAULT_NODE_COLOR, finiteOrDefault() (+10 more)

### Community 111 - "Community 111"
Cohesion: 0.23
Nodes (18): applyRepulsion(), attachLayoutPositions(), computeLayout(), ComputeLayoutOptions, defaultLayoutIterations(), fastLayoutEnabled(), insert(), LayoutGraphEdge (+10 more)

### Community 112 - "Community 112"
Cohesion: 0.13
Nodes (21): CitationCap, collectCitationContext(), collectNeighbors(), collectNodeContext(), CollectNodeContextOptions, DescribeNodesOptions, DescriptionCoverage, DescriptionCoverageReasons (+13 more)

### Community 113 - "Community 113"
Cohesion: 0.09
Nodes (22): ONTOLOGY_RECONCILIATION_DECISION_LOG_SCHEMA, auditPath, authoritativePath, badRelation, badStatus, cleanupDirs, context, decisionsPath (+14 more)

### Community 114 - "Community 114"
Cohesion: 0.13
Nodes (19): WIKI_DESCRIPTION_PROMPT_VERSION, WIKI_DESCRIPTION_SCHEMA, WikiDescriptionSidecarIndex, article, buildDescriptions(), descriptions, G, generator (+11 more)

### Community 115 - "Community 115"
Cohesion: 0.21
Nodes (19): aliasHit, hit, hits, i18nRecords, ids, index, lower, minimal (+11 more)

### Community 116 - "Community 116"
Cohesion: 0.09
Nodes (16): createSpannerGraphStore(), deriveNamespace(), EDGE_SCHEMA_COLS, GraphStore, GraphStoreConfig, moduleDir(), NODE_SCHEMA_COLS, resolveToolVersion() (+8 more)

### Community 117 - "Community 117"
Cohesion: 0.09
Nodes (22): allClustered, count, cypher, data, errors, exts, FIXTURES_DIR, G2 (+14 more)

### Community 118 - "Community 118"
Cohesion: 0.13
Nodes (20): build_graph(), cluster(), cohesion_score(), Leiden community detection on NetworkX graphs. Splits oversized communities. Ret, Run Leiden community detection. Returns {community_id: [node_ids]}.      Communi, Build a NetworkX graph from graphify node/edge dicts.      Preserves original ed, Run a second Leiden pass on a community subgraph to split it further., Ratio of actual intra-community edges to maximum possible. (+12 more)

### Community 119 - "Community 119"
Cohesion: 0.16
Nodes (19): artifactHasDeepRoute(), asRecord(), existingValidSidecarErrors(), exportImageDataprepBatchRequests(), importImageDataprepBatchResults(), jsonlLine(), readCaption(), readJsonl() (+11 more)

### Community 120 - "Community 120"
Cohesion: 0.16
Nodes (19): buildMinimalContext(), compareStrings(), minimalContextToText(), riskFromScore(), suggestionsForTask(), topCommunities(), topFlowNames(), uniqueSorted() (+11 more)

### Community 121 - "Community 121"
Cohesion: 0.14
Nodes (13): CODE_GIT_ONTOLOGY_PROFILE, branchId(), commitId(), defaultRepoKeyRunner, prId(), remoteKeyFromUrl(), repoKey(), RepoKeyRunner (+5 more)

### Community 122 - "Community 122"
Cohesion: 0.19
Nodes (18): assertKnownPosition(), buildStudioRenderBuffers(), BuildStudioRenderBuffersOptions, edgeDash(), edgeWidth(), finiteNumber(), nodeSize(), normalizeOptions() (+10 more)

### Community 123 - "Community 123"
Cohesion: 0.11
Nodes (17): createPostgresGraphStore(), deriveCitySlug(), EDGE_SCHEMA_COLS, GraphStore, GraphStoreConfig, moduleDir(), NODE_SCHEMA_COLS, PgClient (+9 more)

### Community 124 - "Community 124"
Cohesion: 0.09
Nodes (21): configOut, dir, discoveryDiffPath, discoveryDir, discoveryPromptPath, discoveryProposalsPath, discoveryReportPath, discoverySample (+13 more)

### Community 125 - "Community 125"
Cohesion: 0.10
Nodes (20): benchmark, canvas, cleanupDirs, cohesion, communities, detection, dir, G (+12 more)

### Community 126 - "Community 126"
Cohesion: 0.10
Nodes (18): makeTempDir(), assertAcceptedImageRoutingRules(), bucketMatches(), calibrateImageRouting(), requiresDeep(), routeImageWithRules(), ambiguous, captionsDir (+10 more)

### Community 127 - "Community 127"
Cohesion: 0.18
Nodes (18): createAssistantTextJsonClient(), createAssistantVisionJsonClient(), parseJsonFromLlmText(), redactSecrets(), anthropicMock, cleanupDirs, client, cohereMock (+10 more)

### Community 128 - "Community 128"
Cohesion: 0.23
Nodes (18): detectUrlType(), downloadBinary(), fetchArxiv(), fetchTweet(), fetchWebpage(), htmlToMarkdown(), ingest(), IngestOptions (+10 more)

### Community 129 - "Community 129"
Cohesion: 0.28
Nodes (19): buildCommunityRows(), buildTypeRows(), CommunityRow, escapeHtml(), HTML_ESCAPE_MAP, nodeType(), recordsFromGraph(), renderAccordionSection() (+11 more)

### Community 130 - "Community 130"
Cohesion: 0.24
Nodes (19): DEFAULT_EVIDENCE_PANEL_STATE, DEFAULT_FACET_STATE, DEFAULT_GRAPH_PANEL_STATE, DEFAULT_SELECTION_STATE, isEvidenceMode(), isFiniteNonNegativeInt(), isGraphAggregation(), isGraphMode() (+11 more)

### Community 131 - "Community 131"
Cohesion: 0.21
Nodes (16): toNumericMap(), toStringMap(), NumericMapLike, toNumericMap(), appendFreshnessSection(), appendInputScopeSection(), appendReviewSections(), compareFlowCriticality() (+8 more)

### Community 132 - "Community 132"
Cohesion: 0.15
Nodes (12): 310d1f1 feat(studio): labeled box nodes for box-category node_types (legacy parity), ensureEntity(), handleClear(), handleFocusEntity(), handleSetFocus(), handleSetQuery(), handleSetView(), handleToggleCommunity() (+4 more)

### Community 133 - "Community 133"
Cohesion: 0.17
Nodes (18): 6b80ad1 Track F-H1: typed hyperedges data layer (cleanup) + UPSTREAM_GAP v2 already-covered (#48), b4caef6 Track G G3: generic workspace viewer state model + URL round-trip + reducer, f7b39c4 Track G Lot 1 (G1+G2): workspace tokens + shell scaffold (#47), a, after, b, before, cleared (+10 more)

### Community 134 - "Community 134"
Cohesion: 0.11
Nodes (18): inferEdgeDashes(), HtmlWriter, safeToHtml(), SafeToHtmlOptions, ToHtmlOptions, communities, dir, edgeLine (+10 more)

### Community 135 - "Community 135"
Cohesion: 0.14
Nodes (12): buildWorkspaceManifest(), BuildWorkspaceManifestOptions, BUNDLE_ARTIFACTS, BundleArtifactSpec, emitWorkspaceManifest(), EmitWorkspaceManifestOptions, EmitWorkspaceManifestResult, WORKSPACE_MANIFEST_SCHEMA_VERSION (+4 more)

### Community 136 - "Community 136"
Cohesion: 0.15
Nodes (7): Hn(), il, jo(), Nt(), ol(), ul(), yi()

### Community 137 - "Community 137"
Cohesion: 0.15
Nodes (14): Base, area(), Circle, describe(), Geometry, Point, Shape, LinearAlgebra (+6 more)

### Community 138 - "Community 138"
Cohesion: 0.29
Nodes (17): clearSelection(), createDefaultViewerState(), focusEntity(), normalizeViewerState(), openEntity(), selectNode(), setActiveView(), setFocus() (+9 more)

### Community 139 - "Community 139"
Cohesion: 0.24
Nodes (17): currentBranch(), currentHead(), lifecyclePaths(), markLifecycleAnalyzed(), markLifecycleStale(), mergeBase(), planLifecyclePrune(), readJson() (+9 more)

### Community 140 - "Community 140"
Cohesion: 0.15
Nodes (16): buildRenderGraphBuffers(), finiteOrFallback(), isFixed(), CameraState, FitViewOptions, GraphNodeShape, GraphRenderer, GraphRendererActiveBackend (+8 more)

### Community 141 - "Community 141"
Cohesion: 0.11
Nodes (10): MCP_CONFIG_FILENAMES, collectFiles(), extractMcpConfig(), _extractMcpConfigAsync(), extractWithDiagnostics(), inferCommonRoot(), isMcpConfigPath(), _mcpDetectPackageFromArgs() (+2 more)

### Community 142 - "Community 142"
Cohesion: 0.13
Nodes (18): currentBranch(), currentHead(), lifecyclePaths(), markLifecycleAnalyzed(), markLifecycleStale(), mergeBase(), planLifecyclePrune(), readJson() (+10 more)

### Community 143 - "Community 143"
Cohesion: 0.19
Nodes (15): cloneRepo(), CloneRepoOptions, CloneRepoResult, defaultCloneDestination(), execGit(), GithubRepoRef, maybeGithubRepo(), repoNameFromUrl() (+7 more)

### Community 144 - "Community 144"
Cohesion: 0.22
Nodes (17): asNumber(), asString(), canonicalRelation(), compareStrings(), confidenceValue(), createReviewGraphStore(), isTestPath(), KNOWN_KINDS (+9 more)

### Community 145 - "Community 145"
Cohesion: 0.20
Nodes (15): cleanupStaleNodes(), CleanupStaleNodesOptions, CleanupStaleNodesResult, normaliseStoredSourcePath(), cleanupDirs, dir, formatted, G (+7 more)

### Community 146 - "Community 146"
Cohesion: 0.19
Nodes (11): assertValid(), isExternalReferenceId(), isNonEmptyString(), REQUIRED_EDGE_FIELDS, REQUIRED_NODE_FIELDS, REQUIRED_PROVENANCE_FIELDS, VALID_CONFIDENCES, VALID_FILE_TYPES (+3 more)

### Community 147 - "Community 147"
Cohesion: 0.12
Nodes (14): allFiles(), makeProject(), SemanticPreparationOptions, SemanticPreparationResult, cleanupDirs, config, detection, filtered (+6 more)

### Community 148 - "Community 148"
Cohesion: 0.14
Nodes (4): ApiClient, ApiClient, parse_response(), parseResponse()

### Community 149 - "Community 149"
Cohesion: 0.22
Nodes (10): Analyzer, compute_score(), normalize(), Fixture: functions and methods that call each other - for call-graph extraction, run_analysis(), Analyzer, compute_score(), normalize() (+2 more)

### Community 150 - "Community 150"
Cohesion: 0.11
Nodes (15): makeProject(), communities, extraction, fixtureRoot, graph, graphJson, graphPath, processNode (+7 more)

### Community 151 - "Community 151"
Cohesion: 0.29
Nodes (18): addLabelCandidate(), buildResolvableLabelIndex(), ensureParserInit(), extractElixir(), extractGo(), extractJulia(), extractMarkdown(), extractObjc() (+10 more)

### Community 152 - "Community 152"
Cohesion: 0.22
Nodes (16): buildNodeCommunityMap(), chunk(), computeTopologySignature(), createNeo4jGraphStore(), deriveNamespace(), __dirname, moduleDir(), Neo4jClearOptions (+8 more)

### Community 153 - "Community 153"
Cohesion: 0.21
Nodes (16): allAssigned, allNodes, communities, first, G, louvainMock, makeGraph(), multiNodeCommunities (+8 more)

### Community 154 - "Community 154"
Cohesion: 0.11
Nodes (17): after, aPath, bPath, bumped, codeExts, filePath, initial, initialManifest (+9 more)

### Community 155 - "Community 155"
Cohesion: 0.21
Nodes (16): candidateHtml, empty, graph, headerIndex, html, populated, readOnlyHtml, skipIndex (+8 more)

### Community 156 - "Community 156"
Cohesion: 0.15
Nodes (15): an(), c(), df(), gi(), Gn(), lf(), pi(), qo() (+7 more)

### Community 157 - "Community 157"
Cohesion: 0.13
Nodes (13): detection(), makeTempDir(), cleanupDirs, config, cropDir, cropImage, directImage, image (+5 more)

### Community 158 - "Community 158"
Cohesion: 0.14
Nodes (16): OntologyPatch, auditPath, beforeAudit, beforeDecisions, cliOut, cliPreview, fixtureRoot, prepareProject() (+8 more)

### Community 159 - "Community 159"
Cohesion: 0.13
Nodes (12): 652e487 feat: add direct llm backend extraction, cleanupDirs, configDir, configPath, errors, loaded, makeTempDir(), normalized (+4 more)

### Community 160 - "Community 160"
Cohesion: 0.16
Nodes (16): applyConfiguredExcludes(), buildConfiguredDetectionInputs(), buildProfileState(), dataprepReport(), emptyDetection(), fullPageScreenshotExcludes(), mergeDetections(), mergeScopeInspections() (+8 more)

### Community 161 - "Community 161"
Cohesion: 0.16
Nodes (9): HTTPError, HTTPStatusError, A 4xx or 5xx response was received., Base class for all httpx exceptions., is_error(), is_success(), Core data models: URL, Headers, Cookies, Request, Response. These are the centra, text() (+1 more)

### Community 162 - "Community 162"
Cohesion: 0.27
Nodes (10): canonicalizeForPartition(), cluster(), ClusterOptions, cohesionScore(), edgeSortKey(), partition(), remapCommunitiesToPrevious(), scoreAll() (+2 more)

### Community 163 - "Community 163"
Cohesion: 0.28
Nodes (12): convertOfficeFile(), docxToMarkdown(), extractPdfText(), officeParseToText(), xlsxToMarkdown(), CentralEntry, fileWithinSizeCap(), findEocdOffset() (+4 more)

### Community 164 - "Community 164"
Cohesion: 0.27
Nodes (14): ExtractionDiagnostic, buildProject(), BuildProjectArtifacts, BuildProjectOptions, BuildProjectResult, BuildProjectWarning, countNonCodeFiles(), defaultLabels() (+6 more)

### Community 165 - "Community 165"
Cohesion: 0.23
Nodes (14): ExtractionResult, _mergeSwiftExtensions(), allEdges, allNodes, edges, fooNodes, merged, methodEdges (+6 more)

### Community 166 - "Community 166"
Cohesion: 0.23
Nodes (14): extractJs(), extractPhp(), calls, callTargets, cleanupDirs, demoNode, dir, filePath (+6 more)

### Community 167 - "Community 167"
Cohesion: 0.20
Nodes (10): extract(), importsFromBarrel, importsFromTargets, labels, reExports, reExportTagged, targets, writeBarrel() (+2 more)

### Community 168 - "Community 168"
Cohesion: 0.33
Nodes (14): communityArticle(), compareFlowCriticality(), crossCommunityLinks(), WikiDescriptionSidecar, flowArticle(), flowsThroughNodes(), godNodeArticle(), indexMd() (+6 more)

### Community 169 - "Community 169"
Cohesion: 0.25
Nodes (13): arcGeometryStart, arcVertices, buildStart, edgeCount, edges, geometryStart, graph, lineVertices (+5 more)

### Community 170 - "Community 170"
Cohesion: 0.22
Nodes (13): addCall(), addFunction(), makeBenchmarkStore(), qn(), addCall(), addFunction(), makeBenchmarkStore(), markdown (+5 more)

### Community 171 - "Community 171"
Cohesion: 0.17
Nodes (12): bucketLength(), CITATION_POLICY_GLOBAL_DEFAULT, CitationCapValue, CitationPolicyOverrides, CORPUS_TYPE_DEFAULTS, CorpusType, DetectionLike, resolveCitationPolicy() (+4 more)

### Community 172 - "Community 172"
Cohesion: 0.14
Nodes (14): createDirectTextJsonClient(), defaultDirectLlmModel(), DirectLlmProvider, resolveMaxOutputTokens(), audit, client, credential, hasCredential() (+6 more)

### Community 173 - "Community 173"
Cohesion: 0.25
Nodes (13): buildTestGraph(), communities, diff, first, G, G1, G2, godIds (+5 more)

### Community 174 - "Community 174"
Cohesion: 0.25
Nodes (13): boxes, central, dir, fixture, headingMatches, makeTempDir(), pills, reconciliationCentralBody() (+5 more)

### Community 175 - "Community 175"
Cohesion: 0.25
Nodes (9): main(), NewServer(), process(), validate(), Server, main(), NewServer(), process() (+1 more)

### Community 176 - "Community 176"
Cohesion: 0.33
Nodes (10): createStaticLayoutEngine(), assertPositionArray(), computePositionBounds(), copyPositions(), createPositionFrame(), LayoutEngine, PositionBounds, PositionFrame (+2 more)

### Community 177 - "Community 177"
Cohesion: 0.34
Nodes (10): normalizeCommunityLabel(), persistCommunityLabels(), readGraphAttributeLabels(), readLabelsJson(), resolveCommunityLabels(), cleanupDirs, dir, labelsPath (+2 more)

### Community 178 - "Community 178"
Cohesion: 0.21
Nodes (10): extractCsproj(), _extractCsprojAsync(), extractSln(), _extractSlnAsync(), _projectXmlIsSafe(), __testing, fixture(), FIXTURES (+2 more)

### Community 179 - "Community 179"
Cohesion: 0.16
Nodes (12): OntologyDiscoveryContext, ontologyDiscoveryDiffToMarkdown(), OntologyDiscoveryProposalsFile, context, diff, discoveryContext(), fixtureRoot, proposals (+4 more)

### Community 180 - "Community 180"
Cohesion: 0.27
Nodes (12): ast, cached, dir, fresh, input, makeDir(), merged, outPath (+4 more)

### Community 181 - "Community 181"
Cohesion: 0.27
Nodes (11): addCall(), addFunction(), makeFlowStore(), qn(), addCall(), addFunction(), { artifact, store }, { artifact, store, ids } (+3 more)

### Community 182 - "Community 182"
Cohesion: 0.27
Nodes (12): RawCodexSession, agyProjectHash(), cwdInRepo(), dedup(), dedupPaths(), factInRepo(), makeRepoScope(), normalizeAgy() (+4 more)

### Community 183 - "Community 183"
Cohesion: 0.17
Nodes (13): Ae(), bi(), Bn(), br(), ec(), Ia(), jl(), nc() (+5 more)

### Community 184 - "Community 184"
Cohesion: 0.22
Nodes (10): dd38f77 Merge pull request #26 from rhanka/feat/track-a3-mesh-llm-mesh, e737422 A3 scaffold: bridge graphify TextJsonGenerationClient to @sentropic/llm-mesh, createGraphifyMesh(), meshTextJsonClient(), requireAuthResolver(), client, dir, makeTempDir() (+2 more)

### Community 185 - "Community 185"
Cohesion: 0.22
Nodes (7): applyDecision(), box, decide(), handleMergeComplete(), label, reload(), typeOf()

### Community 186 - "Community 186"
Cohesion: 0.22
Nodes (5): Config, HttpClientFactory, Config, HttpClient, HttpClientFactory

### Community 187 - "Community 187"
Cohesion: 0.27
Nodes (11): addCall(), addFunction(), makeStore(), qn(), addCall(), addFunction(), makeStore(), qn() (+3 more)

### Community 188 - "Community 188"
Cohesion: 0.41
Nodes (11): getOntologyRebuildStatus(), getOntologyReconciliationCandidate(), listOntologyReconciliationCandidates(), loadReadonlyReconciliationCandidates(), ontologyAppliedPatchesPath(), ontologyNeedsUpdatePath(), OntologyRebuildStatusResponse, ontologyReconciliationCandidatesPath() (+3 more)

### Community 189 - "Community 189"
Cohesion: 0.19
Nodes (10): GraphEdge, GraphNode, adjacency(), components(), endpoint(), HERE, INPUT, measure() (+2 more)

### Community 190 - "Community 190"
Cohesion: 0.33
Nodes (10): isRecord(), isStringArray(), validateImageCaption(), validateImageRouting(), isRecord(), isStringArray(), VALID_DENSITY, VALID_ROUTING_SIGNAL (+2 more)

### Community 191 - "Community 191"
Cohesion: 0.17
Nodes (10): OntologyDiscoverySample, documentPrompt, extraction, fixtureRoot, imagePrompt, profile, prompt, promptState() (+2 more)

### Community 192 - "Community 192"
Cohesion: 0.30
Nodes (10): build(), attrs, edge, ext, ext1, ext2, G, hyper (+2 more)

### Community 193 - "Community 193"
Cohesion: 0.20
Nodes (7): countWords(), detect(), findVcsRoot(), isSensitive(), loadGraphifyignore(), parseGraphifyignoreLine(), result

### Community 194 - "Community 194"
Cohesion: 0.17
Nodes (7): CallLlmFn, callLlmWithRetry(), countUnansweredDescriptionBatches(), isTransientBackendError(), NodeContext, sleep(), ORIGINAL_ENV

### Community 195 - "Community 195"
Cohesion: 0.23
Nodes (10): home, project, rule, runCliInTemp(), runCliWithEnvironment(), skill, skillPath, tempDirs (+2 more)

### Community 196 - "Community 196"
Cohesion: 0.30
Nodes (10): affectedFlows, cohesion, communities, detection, flows, G, gods, labels (+2 more)

### Community 197 - "Community 197"
Cohesion: 0.30
Nodes (10): communities, communityLabels, dir, G, list, long, outPath, result (+2 more)

### Community 198 - "Community 198"
Cohesion: 0.30
Nodes (10): allStale, article, communities, count, formatted, G, LABELS, makeGraph() (+2 more)

### Community 199 - "Community 199"
Cohesion: 0.30
Nodes (10): focused, graph, graphJsonShape, html, state, strongOnly, subgraph, tokens (+2 more)

### Community 200 - "Community 200"
Cohesion: 0.18
Nodes (10): Animal, -initWithName, -speak, Dog, -fetch, Animal, -initWithName, -speak (+2 more)

### Community 201 - "Community 201"
Cohesion: 0.25
Nodes (4): build_graph(), Graph, build_graph(), Graph

### Community 202 - "Community 202"
Cohesion: 0.27
Nodes (7): deduplicateByLabel(), Extraction, ext(), extraction, out, chunkExtraction(), node()

### Community 203 - "Community 203"
Cohesion: 0.18
Nodes (7): buildNodeDescriptionPrompt(), descriptionAnswerFile(), descriptionInstructionFile(), emitDescriptionInstructions(), hasCodeNode(), hasEntityNode(), cleanupDirs

### Community 204 - "Community 204"
Cohesion: 0.40
Nodes (7): CustomProviderConfig, CustomProviderMap, globalProvidersPath(), loadCustomProviders(), LoadCustomProvidersOptions, localProvidersPath(), providerBaseUrlOk()

### Community 205 - "Community 205"
Cohesion: 0.35
Nodes (7): findMirror(), resolveStoreConfig(), ResolveStoreConfigInput, StorageCliFlags, envKeys, makeMinimalConfig(), savedEnv

### Community 206 - "Community 206"
Cohesion: 0.33
Nodes (9): attrs, cleanupDirs, deletedAbs, dir, edge, graph, graphPath, root (+1 more)

### Community 207 - "Community 207"
Cohesion: 0.18
Nodes (10): cleanupDirs, cypher, dir, graph, graphPath, outputPath, persisted, tempDir() (+2 more)

### Community 208 - "Community 208"
Cohesion: 0.33
Nodes (9): centralEnd, centralIdx, graph, graphIdx, html, ids, state, subgraph (+1 more)

### Community 209 - "Community 209"
Cohesion: 0.36
Nodes (8): net8.0, Domain.csproj, Infrastructure.csproj, FluentValidation, MediatR, Microsoft.AspNetCore.Authentication.JwtBearer, Swashbuckle.AspNetCore, Microsoft.NET.Sdk.Web

### Community 210 - "Community 210"
Cohesion: 0.24
Nodes (5): commit(), initRepo(), write(), ignoredDir, inventory

### Community 211 - "Community 211"
Cohesion: 0.42
Nodes (8): arcControl(), buildEdgePolylinePositions(), EdgeCurveMode, EdgePolylineOptions, Point, quadraticPoint(), readPoint(), RenderGraphInput

### Community 212 - "Community 212"
Cohesion: 0.20
Nodes (8): batch, G, impact, makeReviewGraph(), node, out, store, targets

### Community 213 - "Community 213"
Cohesion: 0.27
Nodes (10): detectIncremental(), isWindowsAbsolutePath(), loadManifest(), manifestKeyForFile(), manifestProjectRoot(), md5File(), normaliseManifestEntry(), portablePath() (+2 more)

### Community 214 - "Community 214"
Cohesion: 0.24
Nodes (10): chunk(), countCoverage(), describeNodes(), detectDescriptionBackend(), generateNodeDescriptions(), ingestDescriptionAnswers(), parseDescriptionResponse(), rankNodes() (+2 more)

### Community 215 - "Community 215"
Cohesion: 0.49
Nodes (8): evidenceRefsFromSources(), loadOntologyPatchContext(), loadProfilePatchRuntimeContext(), optionalJson(), ProfilePatchRuntimeContext, readJson(), stringArray(), stringValue()

### Community 216 - "Community 216"
Cohesion: 0.33
Nodes (6): html, render(), sidecar(), watsonMatch, withDescr, without

### Community 217 - "Community 217"
Cohesion: 0.36
Nodes (8): ALL_SKILL_DOCS, content, DISTRIBUTED_SKILL_DOCS, EXTRACTION_PROMPT_DOCS, INLINE_MERGE_SKILLS, QUERY_WORKFLOW_DOCS, SKILLS, TRIGGER_DESCRIPTION_DOCS

### Community 218 - "Community 218"
Cohesion: 0.22
Nodes (9): hs(), ku(), Ln(), mo(), Nu(), Pn(), qu(), Ru() (+1 more)

### Community 219 - "Community 219"
Cohesion: 0.22
Nodes (7): cleanupDirs, dir, graphText, labels, labelsPath, makeProjectDir(), reportText

### Community 220 - "Community 220"
Cohesion: 0.31
Nodes (2): HttpClient, buildHeaders()

### Community 221 - "Community 221"
Cohesion: 0.28
Nodes (6): MyApp.Accounts.User, create(), validate(), MyApp.Accounts.User, create(), validate()

### Community 222 - "Community 222"
Cohesion: 0.39
Nodes (7): dump(), edges, extraction(), forward, order1, order2, reversed

### Community 223 - "Community 223"
Cohesion: 0.31
Nodes (5): cites(), cleanupDirs, hub(), setupProject(), tempDir()

### Community 224 - "Community 224"
Cohesion: 0.39
Nodes (7): graph, html, idxControls, idxCounters, idxGraphPanel, state, tokens

### Community 225 - "Community 225"
Cohesion: 0.39
Nodes (7): graph, html, occurrences, panel(), panelIdx, slotIdx, tokens

### Community 226 - "Community 226"
Cohesion: 0.39
Nodes (7): dataset, dirty, facets, keys, slices, state, status

### Community 227 - "Community 227"
Cohesion: 0.39
Nodes (7): dir, fixture, makeTempDir(), result, tempDirs, writeCandidateQueue(), writeGraphPreview()

### Community 228 - "Community 228"
Cohesion: 0.39
Nodes (7): graph, html, idxChar, idxLoc, idxWork, state, tokens

### Community 229 - "Community 229"
Cohesion: 0.36
Nodes (6): build(), build_from_json(), Merge multiple extraction results into one graph., build(), build_from_json(), Merge multiple extraction results into one graph.

### Community 230 - "Community 230"
Cohesion: 0.29
Nodes (4): lifecycle(), makeGraph(), LifecycleMetadata, recommendation

### Community 231 - "Community 231"
Cohesion: 0.43
Nodes (6): dest, root, run(), src, studio, warn()

### Community 232 - "Community 232"
Cohesion: 0.29
Nodes (7): args, die(), manifest, manifestModels, outDir, parseArgs(), root

### Community 233 - "Community 233"
Cohesion: 0.25
Nodes (8): commitPrefixForArea(), communityLabel(), dominantCommunity(), groupDraftForFile(), isGraphifyStatePath(), normalizePath(), sourceMatches(), topLevelArea()

### Community 234 - "Community 234"
Cohesion: 0.43
Nodes (6): evidenceQuery, html, reconHtml, reconQuery, tokens, workspaceHtml

### Community 235 - "Community 235"
Cohesion: 0.43
Nodes (6): query, restored, state, state0, state1, state2

### Community 236 - "Community 236"
Cohesion: 0.29
Nodes (2): Transformer, Transformer

### Community 237 - "Community 237"
Cohesion: 0.48
Nodes (5): cli, { dirname, join }, entry, result, { spawnSync }

### Community 238 - "Community 238"
Cohesion: 0.43
Nodes (4): loadWorkspace(), buildScene(), LIGHT_SCENE, RAW_GRAPH

### Community 239 - "Community 239"
Cohesion: 0.29
Nodes (2): createFakeCanvas2DContext(), createFakeWebGlContext()

### Community 240 - "Community 240"
Cohesion: 0.29
Nodes (4): cleanLabelInstructionDir(), cleanDescriptionInstructionDir(), countUndescribedInGraph(), tempDirs

### Community 241 - "Community 241"
Cohesion: 0.43
Nodes (5): spannerDdlLines(), toSpanner(), cleanupDirs, makeGraph(), tempDir()

### Community 242 - "Community 242"
Cohesion: 0.29
Nodes (6): home, previousCwd, readme, skillPath, tempDirs, versionPath

### Community 243 - "Community 243"
Cohesion: 0.48
Nodes (5): config, dir, plugin, previousCwd, tempDirs

### Community 244 - "Community 244"
Cohesion: 0.48
Nodes (5): communitiesIdx, facetsIdx, graph, html, rail()

### Community 245 - "Community 245"
Cohesion: 0.33
Nodes (3): makeGraph(), delta, text

### Community 246 - "Community 246"
Cohesion: 0.47
Nodes (6): buildCommitRecommendation(), groupConfidence(), mergeDrafts(), minConfidence(), stalenessFrom(), uniqueSorted()

### Community 247 - "Community 247"
Cohesion: 0.53
Nodes (4): b1, b2, backup, dated

### Community 248 - "Community 248"
Cohesion: 0.33
Nodes (1): cleanupDirs

### Community 249 - "Community 249"
Cohesion: 0.53
Nodes (4): r1, r2, r3, result

### Community 250 - "Community 250"
Cohesion: 0.53
Nodes (4): candidateGraph, graph, html, tokens

### Community 251 - "Community 251"
Cohesion: 0.53
Nodes (4): character, dataset, groups, total

### Community 252 - "Community 252"
Cohesion: 0.40
Nodes (5): ha(), Ka(), qa(), Va(), zo()

### Community 253 - "Community 253"
Cohesion: 0.70
Nodes (3): escapeHtml(), HTML_ESCAPE_MAP, renderInlineMarkdown()

### Community 254 - "Community 254"
Cohesion: 0.50
Nodes (2): buildPatchFromCandidate(), cand

### Community 255 - "Community 255"
Cohesion: 0.70
Nodes (4): fmt(), shapeCode(), shapePolygonPoints(), shapeSvgPath()

### Community 257 - "Community 257"
Cohesion: 0.60
Nodes (3): graph, html, tokens

### Community 258 - "Community 258"
Cohesion: 0.60
Nodes (3): html, state, tokens

### Community 259 - "Community 259"
Cohesion: 0.50
Nodes (4): Bo(), nl(), Sa(), Wt()

### Community 260 - "Community 260"
Cohesion: 0.50
Nodes (2): 9408561 feat(conversations): connector claude/codex/cursor/gemini -> Extraction (WP5), optionalRuntimeDeps

### Community 261 - "Community 261"
Cohesion: 0.67
Nodes (3): ae0c7ed feat: add ontology discovery proposal workflow, f1d2fce feat: extend ontology lifecycle profile validation, f64bc16 chore: refresh graphify ontology lifecycle graph

### Community 262 - "Community 262"
Cohesion: 0.50
Nodes (1): cleanupDirs

### Community 263 - "Community 263"
Cohesion: 0.67
Nodes (3): runCli(), runMain(), runSkillRuntime()

### Community 264 - "Community 264"
Cohesion: 0.67
Nodes (3): writeFixtureGraph(), writeOntologyPatchFixture(), writeOntologyReconciliationFixture()

### Community 265 - "Community 265"
Cohesion: 1.00
Nodes (2): tempProfileProject(), tempProject()

## Knowledge Gaps
- **1097 isolated node(s):** `Qt`, `_a`, `ya`, `No`, `Jr` (+1092 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 220`** (2 nodes): `HttpClient`, `buildHeaders()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 236`** (2 nodes): `Transformer`, `Transformer`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 239`** (2 nodes): `createFakeCanvas2DContext()`, `createFakeWebGlContext()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 248`** (1 nodes): `cleanupDirs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 254`** (2 nodes): `buildPatchFromCandidate()`, `cand`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 260`** (2 nodes): `9408561 feat(conversations): connector claude/codex/cursor/gemini -> Extraction (WP5)`, `optionalRuntimeDeps`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 262`** (1 nodes): `cleanupDirs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 265`** (2 nodes): `tempProfileProject()`, `tempProject()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createReviewGraphStore()` connect `Community 144` to `Recommendations (commit prefix, area)`, `Sample corpus: httpx utils (worked/)`, `Review benchmark`, `Community 181`, `Community 93`, `Community 53`, `Community 187`, `Community 170`, `Community 102`, `Community 212`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Why does `Extraction` connect `Community 202` to `Community 74`, `Community 105`, `MCP server (graph queries)`, `Community 87`, `Community 76`, `Community 88`, `Sample corpus: mixed analyze.py (worked/)`, `Portable-check & detection portability`, `Community 96`, `Recommendations (commit prefix, area)`, `Community 43`, `Community 164`, `Ontology profile loader`, `Sample corpus: httpx utils (worked/)`, `File detection & Google Workspace`, `Community 192`, `Community 189`, `Community 121`, `Community 146`, `Community 103`, `Review benchmark`, `Community 62`, `Community 78`, `Sample corpus: example storage.py (worked/)`, `Community 117`, `Community 150`, `Community 191`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Why does `DetectionResult` connect `Community 164` to `MCP server (graph queries)`, `Community 87`, `Community 65`, `Recommendations (commit prefix, area)`, `CLI runtime & search`, `Ontology profile loader`, `Community 131`, `Sample corpus: httpx utils (worked/)`, `Review benchmark`, `Community 90`, `Community 91`, `Graph summary (first-hop orientation)`, `Community 147`, `Community 157`, `Community 179`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **What connects `Qt`, `_a`, `ya` to the rest of the system?**
  _1097 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Input scope, git, repo clone` be split into smaller, more focused modules?**
  _Cohesion score 0.05202526941657377 - nodes in this community are weakly interconnected._
- **Should `MCP server (graph queries)` be split into smaller, more focused modules?**
  _Cohesion score 0.02477386934673367 - nodes in this community are weakly interconnected._
- **Should `Audio/video transcription & ingest` be split into smaller, more focused modules?**
  _Cohesion score 0.04455374964357 - nodes in this community are weakly interconnected._