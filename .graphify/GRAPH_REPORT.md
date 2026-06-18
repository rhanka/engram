# Graph Report - .  (2026-06-18)

## Corpus Check
- Large corpus: 520 files · ~683,919 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 8153 nodes · 58146 edges · 271 communities detected
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 466 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output
- Edge kinds: ON_BRANCH: 36400 · contains: 8780 · calls: 3030 · MODIFIES: 2647 · imports: 2505 · imports_from: 1596 · PARENT_OF: 1092 · re_exports: 1027 · uses: 466 · method: 274 · rationale_for: 222 · inherits: 86 · defines: 17 · references: 4


## Input Scope
- Requested: auto
- Resolved: committed (source: default-auto)
- Included files: 520 · Candidates: 569
- Excluded: 0 untracked · 39207 ignored · 8 sensitive · 0 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.

## Graph Freshness
- Built from Git commit: `3286ecd`
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
Cohesion: 0.25
Nodes (346): chore/remove-handover, chore/track-wp9-dossier, ci/pages-nojekyll, correctness-rebase, docs/readme-recenter, feat/agent-stats-fixes, feat/agent-stats-mvp, feat/agent-stats-phase1 (+338 more)

### Community 1 - "PDF preflight & semantic prep"
Cohesion: 0.24
Nodes (294): chore/graphify-track-refresh-qa, chore/release-0.14.0, chore/wp9-agent-stats-closeout, codex/quality-target-qa, feat/agent-stats-codex-headless, feat/assembly-hygiene-deorphan, feat/assembly-reconciliation-hardening, feat/citations-pass2-engine (+286 more)

### Community 2 - "Input scope, git, repo clone"
Cohesion: 0.06
Nodes (189): feat/track-c-3.5-visual-encoding, feat/track-f-h1-hypergraph, feat/track-f-m2-v08x, feat/track-g-process-std-workspace, feat/track-g-g3-viewer-state, 014aace Address Lot 4 provider review fixes, 0440c1e Merge pull request #25 from rhanka/feat/track-c1-review-precision, 0509dea Add no-Python fallback language coverage (+181 more)

### Community 3 - "MCP server (graph queries)"
Cohesion: 0.03
Nodes (155): safeToHtml(), agentsInstall(), agentsUninstall(), ANTIGRAVITY_RULE_PATH, ANTIGRAVITY_WORKFLOW_PATH, antigravityInstall(), antigravityUninstall(), _antigravityWriteRulesWorkflows() (+147 more)

### Community 4 - "Audio/video transcription & ingest"
Cohesion: 0.07
Nodes (136): feat/track-b-reconciliation-ui, feat/track-f-0831-p1-security, feat/track-g-d12-forcegraph, feat/track-g-studio-impl, spec/reconciliation-algorithm, 00a2d8c Refresh .graphify after community-naming round 1 (top 41 named), 07c1c6d docs(plan): mark graph artifact gate complete, 0c6476e Scaffold batch mode for wiki descriptions (Track A Lot A2) (+128 more)

### Community 5 - "File detection & Google Workspace"
Cohesion: 0.02
Nodes (97): _a, ao(), au(), ba(), bf(), bu(), cu(), ds() (+89 more)

### Community 6 - "Sample corpus: example Python pipeline (worked/)"
Cohesion: 0.05
Nodes (85): 1092f4b Merge pull request #39 from rhanka/feat/track-f-upstream-parity-p1-p2-m1, 1ba42c9 Merge pull request #14 from rhanka/upstream-0.7.4-traceability, 23e4b4e Merge pull request #14 from rhanka/upstream-0.7.4-traceability, 4b62fe3 feat(v7): close v0.7.0 multi-dev graph lifecycle parity, 4d720d0 Merge upstream 0.7.5..0.7.10 parity closure, 4d7296f Complete upstream 0.7.10 parity closure, 63fa59a feat(v6): harden Codex and git hook portability, 6857518 Merge pull request #39 from rhanka/feat/track-f-upstream-parity-p1-p2-m1 (+77 more)

### Community 7 - "Exporters (HTML, canvas, JSON)"
Cohesion: 0.05
Nodes (39): Auth, BasicAuth, BearerAuth, DigestAuth, NetRCAuth, Authentication handlers. Auth objects are callables that modify a request before, Load credentials from ~/.netrc based on the request host., Base class for all authentication handlers. (+31 more)

### Community 8 - "Sample corpus: mixed analyze.py (worked/)"
Cohesion: 0.05
Nodes (98): 1a63d0a fix(track-f): filter language built-ins from call-edge resolution (F-0820-0827, 80301a0 #916), 3f9efdc fix(track-f): TypeScript interface-extends and same-file class heritage emit inherits/implements edges (F-0820-0827, 88a8e3b #1095), 83426ff fix(track-f): Python decorated methods inherit parentClassNid; already-covered proofs for M6b/M6c/M15 (F-0820-0827, 9f73400 #1050/#1046/#1047), braceDelta(), _C_CONFIG, CASE_INSENSITIVE_CALL_MODULES, _CPP_CONFIG, _CSHARP_CONFIG (+90 more)

### Community 9 - "Review delta & risk chains"
Cohesion: 0.07
Nodes (87): 14160c3 Track G G2: workspace shell static scaffold + a11y baseline, 35d561c Track G G1: workspace token contract + local fallback + DS adapter, 6b80ad1 Track F-H1: typed hyperedges data layer (cleanup) + UPSTREAM_GAP v2 already-covered (#48), b4caef6 Track G G3: generic workspace viewer state model + URL round-trip + reducer, f7b39c4 Track G Lot 1 (G1+G2): workspace tokens + shell scaffold (#47), buildFacetValues(), collectFieldNames(), DENYLIST (+79 more)

### Community 10 - "Flow detection & criticality"
Cohesion: 0.02
Nodes (90): analysis, analysisPath, analysisValues, article, artifact, cacheKey, captionsDir, configOut (+82 more)

### Community 11 - "CLI runtime & search"
Cohesion: 0.06
Nodes (74): bfs(), communitiesFromGraph(), communityName(), dfs(), findNode(), getVersion(), loadGraph(), scoreNodes() (+66 more)

### Community 12 - "Cache, paths, benchmark"
Cohesion: 0.06
Nodes (62): estimateTokens(), loadGraph(), printBenchmark(), querySubgraphTokens(), runBenchmark(), BenchmarkOptions, estimateTokens(), loadGraph() (+54 more)

### Community 13 - "Review analysis (blast radius, communities)"
Cohesion: 0.06
Nodes (64): augmentDetectionWithPdfPreflight(), cloneDetection(), countWords(), dedupe(), listImageArtifacts(), loadMistralOcrModule(), metadataPath(), preparePdf() (+56 more)

### Community 14 - "Portable-check & detection portability"
Cohesion: 0.06
Nodes (58): buildReviewDelta(), changedNodeIds(), compareNodes(), compareStrings(), highRiskChains(), impactedNodeIds(), isTestPath(), likelyTestGaps() (+50 more)

### Community 15 - "Sample corpus: httpx Python client (worked/)"
Cohesion: 0.07
Nodes (64): StringMapLike, toStringMap(), BACKUP_ARTIFACTS, backupIfProtected(), buildFreshnessMetadata(), buildGraphHtml(), CanvasOptions, COMMUNITY_COLORS (+56 more)

### Community 16 - "Review context builder"
Cohesion: 0.07
Nodes (61): 2810e65 feat(gh): extract pull requests to graphify Extraction (WP9), 29bf908 fix(gh): emit full commit shas for cross-profile join with extract-git (WP9 gate), bad1965 feat(gh): extract pull requests to Extraction (WP9) (#175), aggregateChecks(), CheckAggregate, checkBucket(), commitSha(), edgeKey() (+53 more)

### Community 17 - "Ontology profile loader"
Cohesion: 0.07
Nodes (65): asRecord(), asStringArray(), bindOntologyProfile(), hashOntologyProfile(), loadOntologyProfile(), normalizeCitationPolicy(), normalizeHardeningPolicy(), normalizeOntologyProfile() (+57 more)

### Community 18 - "Sample corpus: httpx exceptions (worked/)"
Cohesion: 0.05
Nodes (64): alphaNeighbors, audit, beforeAudit, beforeDecisions, betaNeighbors, candidate, candidateResponse, candidates (+56 more)

### Community 19 - "Profile validation"
Cohesion: 0.07
Nodes (60): collectJsonIssues(), collectStringIssues(), collectTextIssues(), hasSchemePrefix(), isIgnoredLocalArtifact(), isWindowsAbsolutePath(), makeDetectionPortable(), normalizeFileMap() (+52 more)

### Community 20 - "Configured dataprep (profile mode)"
Cohesion: 0.05
Nodes (60): OntologyPatchContext, OntologyPatchNode, candidateId(), candidateScore(), chooseCanonicalPair(), CONTAINMENT_HEAD_NOUNS, DEFAULT_FUZZY_EXCLUDE_TYPES, differentEntityReason() (+52 more)

### Community 21 - "CLI top-level & assistant-integration tests"
Cohesion: 0.07
Nodes (17): AsyncClient, BaseClient, Client, Limits, The main Client and AsyncClient classes. BaseClient holds all shared logic. Clie, Asynchronous HTTP client., Shared implementation for Client and AsyncClient.     Handles auth, redirects, c, Synchronous HTTP client. (+9 more)

### Community 22 - "Multi-language test fixtures"
Cohesion: 0.05
Nodes (47): Exception, CookieConflict, Attempted to look up a cookie by name but multiple cookies exist., CloseError, ConnectError, ConnectTimeout, CookieConflict, DecodingError (+39 more)

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
Cohesion: 0.10
Nodes (54): applyWeakFilter(), attachReconLayout(), buildGraphIndex(), buildScene(), candidateSubgraph(), citationsByFile(), citationsByFileFrom(), communityStats() (+46 more)

### Community 29 - "Profile report"
Cohesion: 0.07
Nodes (45): baseState(), validationResult(), addIssue(), citations(), isProfileEdge(), isRegistrySeed(), stringValue(), validateCitations() (+37 more)

### Community 30 - "Ontology patch (validate, dry-run, apply)"
Cohesion: 0.06
Nodes (47): average(), buildBlastRadius(), buildReviewAnalysis(), communityLabel(), communityRisk(), compareStrings(), estimateTokens(), evaluateReviewAnalysis() (+39 more)

### Community 31 - "Sample corpus: httpx auth/client (worked/)"
Cohesion: 0.06
Nodes (41): CloseError, ConnectError, ConnectTimeout, DecodingError, NetworkError, PoolTimeout, ProtocolError, ProxyError (+33 more)

### Community 32 - "Test fixtures: C#/Java/PowerShell"
Cohesion: 0.07
Nodes (46): resolveIdentity(), workspaceLabel(), H2aInstance, loadH2aInstances(), matchInstance(), AGENT_STATS_SCHEMA, AgentReport, AgentStatsReport (+38 more)

### Community 33 - "Image routing calibration"
Cohesion: 0.09
Nodes (49): absolutizeSourceFilesIn(), bodyContent(), CACHE_BUCKETS, cachedFiles(), cacheDir(), cacheKind(), cacheNamespace(), CacheOptions (+41 more)

### Community 34 - "Ontology output (wiki, obsidian, etc.)"
Cohesion: 0.06
Nodes (50): handle_delete(), handle_enrich(), handle_get(), handle_list(), handle_search(), handle_upload(), API module - exposes the document pipeline over HTTP. Thin layer over parser, va, Accept a list of file paths, run the full pipeline on each,     and return a sum (+42 more)

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
Cohesion: 0.12
Nodes (42): OntologyReconciliationDecisionLogOptions, getOntologyRebuildStatus(), getOntologyReconciliationCandidate(), listOntologyReconciliationCandidates(), loadReadonlyReconciliationCandidates(), ontologyAppliedPatchesPath(), ontologyNeedsUpdatePath(), OntologyRebuildStatusResponse (+34 more)

### Community 44 - "Community 44"
Cohesion: 0.07
Nodes (35): 05ee028 Add optional Google Workspace shortcut export, 2b5e757 Release 0.9.6: F-M2 port upstream v0.8.11→v0.8.13 + Track C-3.5 wiring (#46), 4ba8600 UPSTREAM_GAP: record v2 hypergraph as already-covered, withdraw 0.10.0 schema-delta prediction, 54d8c24 Harden graphify description contract, 6ee0295 Merge pull request #21 from rhanka/feat/upstream-0.7.10-lot3-incremental, 76c6686 Harden community-labels file parsing and extend test coverage, bc882be Add Ollama as a credential-free direct LLM provider, d2d3c77 Refresh graph after parser surface merge (+27 more)

### Community 45 - "Community 45"
Cohesion: 0.08
Nodes (35): execGit(), gitRevParse(), resolveFromGitCwd(), resolveGitContext(), safeExecGit(), safeGitRevParse(), commit(), initRepo() (+27 more)

### Community 46 - "Community 46"
Cohesion: 0.08
Nodes (38): compileNodes(), compileOntologyOutputs(), compileRelations(), ontologyNodeType(), safeFilename(), sha256(), stringValue(), writeJson() (+30 more)

### Community 47 - "Community 47"
Cohesion: 0.08
Nodes (31): applyCamera(), applyPayload(), cancelMergeFrame(), clearHoveredEdge(), easeMergeProgress(), edgeKey(), ensureRenderer(), eventToWorld() (+23 more)

### Community 48 - "Community 48"
Cohesion: 0.08
Nodes (28): aggregateCitations(), AggregateCitationsOptions, backfillCitations(), BackfillCitationsOptions, BackfillCitationsResult, CitationAggregateEntry, CitationAggregateMap, citationKey() (+20 more)

### Community 49 - "Community 49"
Cohesion: 0.11
Nodes (40): appendMemoryFiles(), buildGitInventory(), countGitPaths(), fallbackAllScope(), gitInventory(), inspectInputScope(), isGraphifyMemoryPath(), isInputScopeMode() (+32 more)

### Community 50 - "Community 50"
Cohesion: 0.11
Nodes (41): acquire2DContext(), acquireContext(), applyDash(), AttributeLocations, bindCameraUniforms(), BOX_FILL, boxDimensions(), buildEdgeColors() (+33 more)

### Community 51 - "Community 51"
Cohesion: 0.11
Nodes (32): CustomProviderConfig, CustomProviderMap, globalProvidersPath(), loadCustomProviders(), LoadCustomProvidersOptions, localProvidersPath(), ALLOWED_SCHEMES, BLOCKED_HOSTS (+24 more)

### Community 52 - "Community 52"
Cohesion: 0.14
Nodes (40): buildNodeFacts(), CompactDescriptionContext, computeCounters(), countEdgeEvidence(), CountersValues, DEFAULT_INLINE_FACTS, DEFAULT_SECTIONS, displayValue() (+32 more)

### Community 53 - "Community 53"
Cohesion: 0.07
Nodes (35): Cookies, build_url_with_params(), flatten_queryparams(), is_known_encoding(), normalize_header_key(), obfuscate_sensitive_headers(), parse_content_type(), primitive_value_to_str() (+27 more)

### Community 54 - "Community 54"
Cohesion: 0.10
Nodes (33): 170f0ef Merge branch 'feat/studio-show-descriptions' into feat/node-type-boxes, buildEntitySidecar(), CitationSidecarEntry, citationsSidecarCache, CitationsSidecarCacheEntry, CitationsSidecarShape, computeGraphCitationSignature(), __dirname (+25 more)

### Community 55 - "Community 55"
Cohesion: 0.06
Nodes (36): addCall(), addFunction(), qn(), tempDir(), addFunction(), allNames, api, artifact (+28 more)

### Community 56 - "Community 56"
Cohesion: 0.10
Nodes (30): buildCommitRecommendation(), commitPrefixForArea(), commitRecommendationToText(), communitiesFromDelta(), communityLabel(), compareStrings(), confidenceRank(), dominantCommunity() (+22 more)

### Community 57 - "Community 57"
Cohesion: 0.13
Nodes (38): buildFallbackSidecar(), buildTargetContentHash(), buildWikiDescriptionPrompt(), BuildWikiDescriptionPromptOptions, collectCommunityTargetContext(), collectInferredCommunityMap(), collectNodeNeighbors(), collectNodeTargetContext() (+30 more)

### Community 58 - "Community 58"
Cohesion: 0.10
Nodes (30): AssistantLlmClientOptions, BatchTextJsonImportInput, BatchTextJsonImportResult, BatchVisionExportInput, BatchVisionExportResult, BatchVisionImportInput, BatchVisionImportResult, BatchVisionJsonClient (+22 more)

### Community 59 - "Community 59"
Cohesion: 0.09
Nodes (34): buildFirstHopSummary(), buildNextBestAction(), communityLabels(), communityMembership(), compareHubs(), compareStrings(), FirstHopCommunity, FirstHopHub (+26 more)

### Community 60 - "Community 60"
Cohesion: 0.08
Nodes (26): InMemoryPgState, makeFakePgModule(), makePgVectorStore(), RecordedQuery, createPgVectorStore(), deriveNamespace(), GraphStoreConfig, PgClientLike (+18 more)

### Community 61 - "Community 61"
Cohesion: 0.11
Nodes (36): asRecord(), assertAcceptedImageRoutingRules(), bucketMatches(), calibrateImageRouting(), countArray(), imageRoutingSampleFromCaption(), loadImageRoutingLabels(), loadImageRoutingRules() (+28 more)

### Community 62 - "Community 62"
Cohesion: 0.07
Nodes (35): 12ab4ef Refresh graph artifacts after B rebase, 48670cc feat: add ontology reconciliation studio shell, 8cf401a feat: polish ontology reconciliation studio, af46746 fix: prevent ontology studio mobile overflow, d216c3d feat: finish ontology reconciliation UAT flow, createOntologyStudioRequestHandler(), generateOntologyStudioToken(), isLoopbackHost() (+27 more)

### Community 63 - "Community 63"
Cohesion: 0.09
Nodes (29): analyzeChanges(), changedNodesFromFiles(), compareStrings(), computeRiskScore(), detectChangesToMinimal(), detectChangesToText(), isRiskScoredKind(), isSafeGitRef() (+21 more)

### Community 64 - "Community 64"
Cohesion: 0.12
Nodes (34): buildProfileChunkPrompt(), buildProfileExtractionPrompt(), buildProfileValidationPrompt(), chunkGuidance(), citationSection(), genericSafetySection(), hardeningSection(), inputHintsSection() (+26 more)

### Community 65 - "Community 65"
Cohesion: 0.13
Nodes (33): buildReviewContext(), buildReviewGuidance(), buildSourceSnippets(), changedFunctionsWithoutTests(), compareStrings(), extractRelevantLines(), formatLines(), isInside() (+25 more)

### Community 66 - "Community 66"
Cohesion: 0.13
Nodes (34): ASSET_DIR_MARKERS, canonicalFilePath(), classifyFile(), CODE_EXTENSIONS, DetectOptions, DOC_EXTENSIONS, envCommandArgs(), GOOGLE_WORKSPACE_EXTENSIONS (+26 more)

### Community 67 - "Community 67"
Cohesion: 0.08
Nodes (25): arcStatus(), buildOneHierarchy(), buildSceneHierarchySidecar(), BuildSceneHierarchySidecarOptions, arcNodeIds(), clearSceneHierarchiesEmitterCache(), emitSceneHierarchies(), EmitSceneHierarchiesOptions (+17 more)

### Community 68 - "Community 68"
Cohesion: 0.10
Nodes (29): applyEntry(), collectEntries(), gitAdvice(), migrateGraphifyOut(), migrationResultToText(), normalizeGitPath(), planGraphifyOutMigration(), shellQuote() (+21 more)

### Community 69 - "Community 69"
Cohesion: 0.10
Nodes (30): average(), compareStrings(), countHits(), estimateTokens(), evaluateReviewBenchmarks(), f1(), flowIdentifiers(), formatMetric() (+22 more)

### Community 70 - "Community 70"
Cohesion: 0.13
Nodes (31): add(), artifactHashes(), artifactPathFor(), asRecord(), candidateArrayFromReconciliation(), computeDataOnlyChromeHashes(), computeGraphCitationSignatureFromJson(), DataOnlyChromeHashes (+23 more)

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
Cohesion: 0.16
Nodes (28): 310d1f1 feat(studio): labeled box nodes for box-category node_types (legacy parity), fd4c7c5 feat(studio): box nodes rendered in canvas, sized to text, single label (legacy parity, fixes duplicate/oversize), buildConnectedDimStyle(), buildGraphRendererPayload(), clampUnit(), cloneStyle(), colorForGroup(), curveControlPoint() (+20 more)

### Community 77 - "Community 77"
Cohesion: 0.11
Nodes (30): buildConversationsExtraction(), BuildConversationsExtractionOptions, ClaudeCommitResolveOptions, collectPromptStats(), ConversationCompactionEvent, ConversationEventBase, conversationId(), CONVERSATIONS_ONTOLOGY_PROFILE (+22 more)

### Community 78 - "Community 78"
Cohesion: 0.14
Nodes (30): buildStudioScene(), BuildStudioSceneOptions, communityLiveCount(), computeDegrees(), computeGodClass(), copyOwnFields(), dashForRelation(), displayValue() (+22 more)

### Community 79 - "Community 79"
Cohesion: 0.11
Nodes (28): 93560d5 Address Lot 4 provider review fixes, dfc9b44 Refresh graph after Lot 4 review fixes, convertGoogleWorkspaceFile(), ConvertGoogleWorkspaceOptions, createDefaultGoogleWorkspaceFetcher(), EXPORT_MIME_TYPE_BY_EXTENSION, extractFileIdFromUrl(), extractResourceKey() (+20 more)

### Community 80 - "Community 80"
Cohesion: 0.09
Nodes (27): field(), loadProfileRegistries(), loadProfileRegistry(), normalizeRegistryRecord(), readRegistryRows(), registryRecordsToExtraction(), safeIdPart(), makeTempDir() (+19 more)

### Community 81 - "Community 81"
Cohesion: 0.11
Nodes (26): CommitConflict, correlate(), CorrelateInput, detectCommitConflicts(), findByScan(), GitCommitMeta, indexCommits(), indexPrMergesByBranch() (+18 more)

### Community 82 - "Community 82"
Cohesion: 0.08
Nodes (12): DataProcessor, Get-Data(), GraphifyDemo, IProcessor, Process-Items(), Processor, DataProcessor, Get-Data() (+4 more)

### Community 83 - "Community 83"
Cohesion: 0.17
Nodes (29): buildProfileReport(), graphLinks(), graphNodes(), highDegreeSection(), humanReviewSection(), invalidRelationsSection(), lowEvidenceSection(), pdfOcrSection() (+21 more)

### Community 84 - "Community 84"
Cohesion: 0.10
Nodes (27): BatchTextJsonClient, BatchTextJsonExportInput, BatchTextJsonExportResult, buildTargetKindsMap(), buildWikiDescriptionBatchExport(), BuildWikiDescriptionBatchOptions, exportWikiDescriptionBatchToJsonl(), ParseWikiDescriptionBatchOptions (+19 more)

### Community 85 - "Community 85"
Cohesion: 0.12
Nodes (30): asBoolean(), asNonNegativeNumber(), asPositiveInteger(), asRecord(), asString(), asStringArray(), CitationExtractionContract, loadQualityTargetsConfig() (+22 more)

### Community 86 - "Community 86"
Cohesion: 0.17
Nodes (26): applyConfiguredExcludes(), buildConfiguredDetectionInputs(), buildProfileState(), ConfiguredDataprepOptions, ConfiguredDataprepResult, ConfiguredDetectionInputs, countWords(), dataprepReport() (+18 more)

### Community 87 - "Community 87"
Cohesion: 0.14
Nodes (23): AllChunksFailedError, buildExtractionPrompt(), createDirectSemanticExtractionClient(), DirectSemanticChunk, DirectSemanticClientOptions, DirectSemanticExtractionClient, DirectSemanticExtractionOptions, DirectSemanticFile (+15 more)

### Community 88 - "Community 88"
Cohesion: 0.16
Nodes (26): appendRationaleAttr(), INVALID_FILE_TYPES_FOR_SANITIZE, isPlainObject(), isSentenceLikeRationaleLabel(), LoadValidatedResult, loadValidatedSemanticFragment(), sanitizeSemanticFragment(), SemanticFragment (+18 more)

### Community 89 - "Community 89"
Cohesion: 0.13
Nodes (17): alternateFixture(), ContractFixture, ContractGraphStore, describeGraphStoreContract(), GraphStore, create(), InMemoryNeo4jState, largeGraph() (+9 more)

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
Cohesion: 0.12
Nodes (24): 0f32886 F M2 (3/6): port upstream f5fea13 — LLM empty / filtered response guard, 32d1d93 F M2 (6/6): port upstream 850c545 — raise FILE_COUNT_UPPER 200 -> 500, 3544d19 Release 0.9.6: F-M2 port upstream v0.8.11->v0.8.13 + Track C-3.5, 5d60bd2 F M2 (4/6): port upstream 6939494 — backupIfProtected snapshot before overwrite, 62545ae F M2 (2/6): port upstream d84f07c — node-ID dedup, cache fastpath, absolute paths relativization, 65a45e9 Refresh .graphify after F-M2 ports on 0.9.6, 86e8567 F M2 (1/6): port upstream 2d783e5 — cohesion unrounded, save_manifest seed, --resolution + --exclude-hubs, a9d8256 F M2 (5/6): port upstream 2209a9c — treat `graphify <path>` as `graphify extract <path>` (+16 more)

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
Cohesion: 0.22
Nodes (23): buildRelationRows(), clampSnippet(), displayValue(), EntityOccurrence, EntityPanelOccurrences, entityPanelStyles(), escapeHtml(), graphEdges() (+15 more)

### Community 105 - "Community 105"
Cohesion: 0.12
Nodes (21): ai(), al(), As(), At(), Ee(), El(), fr, ii() (+13 more)

### Community 106 - "Community 106"
Cohesion: 0.19
Nodes (20): DeOrphanConfig, SchemaHygieneConfig, asRecord(), AssemblyHygieneOptions, asString(), buildFromJson(), buildMerge(), BuildMergeOptions (+12 more)

### Community 107 - "Community 107"
Cohesion: 0.16
Nodes (20): applySalientCommunityLabels(), buildLabelingPromptLines(), CallLlmFn, detectLabelingBackend(), emitLabelInstructions(), generateCommunityLabels(), GenerateCommunityLabelsOptions, GenerateCommunityLabelsResult (+12 more)

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
Cohesion: 0.21
Nodes (16): toNumericMap(), toStringMap(), NumericMapLike, toNumericMap(), appendFreshnessSection(), appendInputScopeSection(), appendReviewSections(), compareFlowCriticality() (+8 more)

### Community 130 - "Community 130"
Cohesion: 0.11
Nodes (18): inferEdgeDashes(), HtmlWriter, safeToHtml(), SafeToHtmlOptions, ToHtmlOptions, communities, dir, edgeLine (+10 more)

### Community 131 - "Community 131"
Cohesion: 0.22
Nodes (13): __dirname, FileGraphStore, FileStoreClearOptions, moduleDir(), resolveToolVersion(), GraphPushOptions, GraphPushResult, GraphStoreCapabilities (+5 more)

### Community 132 - "Community 132"
Cohesion: 0.14
Nodes (12): buildWorkspaceManifest(), BuildWorkspaceManifestOptions, BUNDLE_ARTIFACTS, BundleArtifactSpec, emitWorkspaceManifest(), EmitWorkspaceManifestOptions, EmitWorkspaceManifestResult, WORKSPACE_MANIFEST_SCHEMA_VERSION (+4 more)

### Community 133 - "Community 133"
Cohesion: 0.15
Nodes (7): Hn(), il, jo(), Nt(), ol(), ul(), yi()

### Community 134 - "Community 134"
Cohesion: 0.15
Nodes (14): Base, area(), Circle, describe(), Geometry, Point, Shape, LinearAlgebra (+6 more)

### Community 135 - "Community 135"
Cohesion: 0.29
Nodes (17): clearSelection(), createDefaultViewerState(), focusEntity(), normalizeViewerState(), openEntity(), selectNode(), setActiveView(), setFocus() (+9 more)

### Community 136 - "Community 136"
Cohesion: 0.24
Nodes (17): currentBranch(), currentHead(), lifecyclePaths(), markLifecycleAnalyzed(), markLifecycleStale(), mergeBase(), planLifecyclePrune(), readJson() (+9 more)

### Community 137 - "Community 137"
Cohesion: 0.15
Nodes (16): buildRenderGraphBuffers(), finiteOrFallback(), isFixed(), CameraState, FitViewOptions, GraphNodeShape, GraphRenderer, GraphRendererActiveBackend (+8 more)

### Community 138 - "Community 138"
Cohesion: 0.16
Nodes (11): ensureEntity(), handleClear(), handleFocusEntity(), handleSetFocus(), handleSetQuery(), handleSetView(), handleToggleCommunity(), handleToggleEntity() (+3 more)

### Community 139 - "Community 139"
Cohesion: 0.11
Nodes (10): MCP_CONFIG_FILENAMES, collectFiles(), extractMcpConfig(), _extractMcpConfigAsync(), extractWithDiagnostics(), inferCommonRoot(), isMcpConfigPath(), _mcpDetectPackageFromArgs() (+2 more)

### Community 140 - "Community 140"
Cohesion: 0.13
Nodes (18): currentBranch(), currentHead(), lifecyclePaths(), markLifecycleAnalyzed(), markLifecycleStale(), mergeBase(), planLifecyclePrune(), readJson() (+10 more)

### Community 141 - "Community 141"
Cohesion: 0.22
Nodes (17): asNumber(), asString(), canonicalRelation(), compareStrings(), confidenceValue(), createReviewGraphStore(), isTestPath(), KNOWN_KINDS (+9 more)

### Community 142 - "Community 142"
Cohesion: 0.20
Nodes (15): cleanupStaleNodes(), CleanupStaleNodesOptions, CleanupStaleNodesResult, normaliseStoredSourcePath(), cleanupDirs, dir, formatted, G (+7 more)

### Community 143 - "Community 143"
Cohesion: 0.19
Nodes (11): assertValid(), isExternalReferenceId(), isNonEmptyString(), REQUIRED_EDGE_FIELDS, REQUIRED_NODE_FIELDS, REQUIRED_PROVENANCE_FIELDS, VALID_CONFIDENCES, VALID_FILE_TYPES (+3 more)

### Community 144 - "Community 144"
Cohesion: 0.12
Nodes (17): agentsMd, claudeMd, cwd, hasFiles, hooks, hooksPath, joined, logs (+9 more)

### Community 145 - "Community 145"
Cohesion: 0.20
Nodes (13): 385df0f E follow-up upgrade neo4j ts vitest, c24ce46 E release 0.9.2 Node 24 and query-first install, e9fac4b Merge pull request #38 from rhanka/feat/track-e-major-upgrades-neo4j6-ts6-vitest4, ef274a0 Merge pull request #37 from rhanka/feat/track-e-0.9.2-release, config, dir, plugin, previousCwd (+5 more)

### Community 146 - "Community 146"
Cohesion: 0.17
Nodes (15): 4151efa feat(qa): gate studio publication bundles, 693caa7 feat(qa): evaluate target bundle gates, 860e4dd feat(cli): add graphify qa command, cdd2a39 spec(qa): define target manifest and quality gate, dc13a91 feat(qa): add quality target contract model, ResolvedTargetManifest, NormalizedQualityTarget, graphFixture() (+7 more)

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
Cohesion: 0.11
Nodes (17): after, aPath, bPath, bumped, codeExts, filePath, initial, initialManifest (+9 more)

### Community 154 - "Community 154"
Cohesion: 0.21
Nodes (16): candidateHtml, empty, graph, headerIndex, html, populated, readOnlyHtml, skipIndex (+8 more)

### Community 155 - "Community 155"
Cohesion: 0.15
Nodes (15): an(), c(), df(), gi(), Gn(), lf(), pi(), qo() (+7 more)

### Community 156 - "Community 156"
Cohesion: 0.13
Nodes (13): detection(), makeTempDir(), cleanupDirs, config, cropDir, cropImage, directImage, image (+5 more)

### Community 157 - "Community 157"
Cohesion: 0.14
Nodes (16): OntologyPatch, auditPath, beforeAudit, beforeDecisions, cliOut, cliPreview, fixtureRoot, prepareProject() (+8 more)

### Community 158 - "Community 158"
Cohesion: 0.22
Nodes (15): a, after, b, before, cleared, dispatch(), initial, q (+7 more)

### Community 159 - "Community 159"
Cohesion: 0.13
Nodes (12): 652e487 feat: add direct llm backend extraction, cleanupDirs, configDir, configPath, errors, loaded, makeTempDir(), normalized (+4 more)

### Community 160 - "Community 160"
Cohesion: 0.17
Nodes (9): 9a3e1dd feat(studio/reconciliation): type-grouped rail, score bubbles, two-line pairs, batch validate + depth-3 neighbourhood, applyDecision(), box, decide(), handleMergeComplete(), label, reload(), typeOf() (+1 more)

### Community 161 - "Community 161"
Cohesion: 0.16
Nodes (16): applyConfiguredExcludes(), buildConfiguredDetectionInputs(), buildProfileState(), dataprepReport(), emptyDetection(), fullPageScreenshotExcludes(), mergeDetections(), mergeScopeInspections() (+8 more)

### Community 162 - "Community 162"
Cohesion: 0.16
Nodes (9): HTTPError, HTTPStatusError, A 4xx or 5xx response was received., Base class for all httpx exceptions., is_error(), is_success(), Core data models: URL, Headers, Cookies, Request, Response. These are the centra, text() (+1 more)

### Community 163 - "Community 163"
Cohesion: 0.27
Nodes (10): canonicalizeForPartition(), cluster(), ClusterOptions, cohesionScore(), edgeSortKey(), partition(), remapCommunitiesToPrevious(), scoreAll() (+2 more)

### Community 164 - "Community 164"
Cohesion: 0.28
Nodes (12): convertOfficeFile(), docxToMarkdown(), extractPdfText(), officeParseToText(), xlsxToMarkdown(), CentralEntry, fileWithinSizeCap(), findEocdOffset() (+4 more)

### Community 165 - "Community 165"
Cohesion: 0.27
Nodes (14): ExtractionDiagnostic, buildProject(), BuildProjectArtifacts, BuildProjectOptions, BuildProjectResult, BuildProjectWarning, countNonCodeFiles(), defaultLabels() (+6 more)

### Community 166 - "Community 166"
Cohesion: 0.23
Nodes (14): ExtractionResult, _mergeSwiftExtensions(), allEdges, allNodes, edges, fooNodes, merged, methodEdges (+6 more)

### Community 167 - "Community 167"
Cohesion: 0.23
Nodes (14): extractJs(), extractPhp(), calls, callTargets, cleanupDirs, demoNode, dir, filePath (+6 more)

### Community 168 - "Community 168"
Cohesion: 0.20
Nodes (10): extract(), importsFromBarrel, importsFromTargets, labels, reExports, reExportTagged, targets, writeBarrel() (+2 more)

### Community 169 - "Community 169"
Cohesion: 0.33
Nodes (12): createFileGraphStore(), create(), factories, GraphStoreFactory, listGraphStoreIds(), registerGraphStoreFactory(), resolveGraphStore(), StoreTestDeps (+4 more)

### Community 170 - "Community 170"
Cohesion: 0.33
Nodes (14): communityArticle(), compareFlowCriticality(), crossCommunityLinks(), WikiDescriptionSidecar, flowArticle(), flowsThroughNodes(), godNodeArticle(), indexMd() (+6 more)

### Community 171 - "Community 171"
Cohesion: 0.25
Nodes (13): arcGeometryStart, arcVertices, buildStart, edgeCount, edges, geometryStart, graph, lineVertices (+5 more)

### Community 172 - "Community 172"
Cohesion: 0.13
Nodes (15): 20dd597 chore(graphify): refresh graph artifacts after tree and ignore parity, 22bf10b chore(graphify): refresh graph artifacts after v0.7.4 parser parity, 3a149b4 feat(v7): add headless extract cli wrapper, 3d3f61c docs(v6): close v0.6.7 traceability deltas, 49fb6bf feat(v7): close v0.7.4 parser parity, 6547d50 feat(v7): add public export cli parity, 7493d73 chore(graphify): refresh graph artifacts after antigravity parity, 78499cb test(v6): cover portable path and reinstall parity (+7 more)

### Community 173 - "Community 173"
Cohesion: 0.22
Nodes (13): addCall(), addFunction(), makeBenchmarkStore(), qn(), addCall(), addFunction(), makeBenchmarkStore(), markdown (+5 more)

### Community 174 - "Community 174"
Cohesion: 0.17
Nodes (12): bucketLength(), CITATION_POLICY_GLOBAL_DEFAULT, CitationCapValue, CitationPolicyOverrides, CORPUS_TYPE_DEFAULTS, CorpusType, DetectionLike, resolveCitationPolicy() (+4 more)

### Community 175 - "Community 175"
Cohesion: 0.14
Nodes (14): createDirectTextJsonClient(), defaultDirectLlmModel(), DirectLlmProvider, resolveMaxOutputTokens(), audit, client, credential, hasCredential() (+6 more)

### Community 176 - "Community 176"
Cohesion: 0.25
Nodes (13): buildTestGraph(), communities, diff, first, G, G1, G2, godIds (+5 more)

### Community 177 - "Community 177"
Cohesion: 0.25
Nodes (13): boxes, central, dir, fixture, headingMatches, makeTempDir(), pills, reconciliationCentralBody() (+5 more)

### Community 178 - "Community 178"
Cohesion: 0.25
Nodes (9): main(), NewServer(), process(), validate(), Server, main(), NewServer(), process() (+1 more)

### Community 179 - "Community 179"
Cohesion: 0.33
Nodes (10): createStaticLayoutEngine(), assertPositionArray(), computePositionBounds(), copyPositions(), createPositionFrame(), LayoutEngine, PositionBounds, PositionFrame (+2 more)

### Community 180 - "Community 180"
Cohesion: 0.21
Nodes (10): extractCsproj(), _extractCsprojAsync(), extractSln(), _extractSlnAsync(), _projectXmlIsSafe(), __testing, fixture(), FIXTURES (+2 more)

### Community 181 - "Community 181"
Cohesion: 0.16
Nodes (12): OntologyDiscoveryContext, ontologyDiscoveryDiffToMarkdown(), OntologyDiscoveryProposalsFile, context, diff, discoveryContext(), fixtureRoot, proposals (+4 more)

### Community 182 - "Community 182"
Cohesion: 0.18
Nodes (10): ALL_EXTRACTED_CITATION_CONTRACT, canonicalize(), canonicalJson(), discoverQualityTargetsConfig(), hashCitationExtractionContract(), hashQualityTarget(), sha256Prefixed(), validateCitationExtractionContractForTarget() (+2 more)

### Community 183 - "Community 183"
Cohesion: 0.27
Nodes (12): ast, cached, dir, fresh, input, makeDir(), merged, outPath (+4 more)

### Community 184 - "Community 184"
Cohesion: 0.27
Nodes (11): addCall(), addFunction(), makeFlowStore(), qn(), addCall(), addFunction(), { artifact, store }, { artifact, store, ids } (+3 more)

### Community 185 - "Community 185"
Cohesion: 0.27
Nodes (12): RawCodexSession, agyProjectHash(), cwdInRepo(), dedup(), dedupPaths(), factInRepo(), makeRepoScope(), normalizeAgy() (+4 more)

### Community 186 - "Community 186"
Cohesion: 0.17
Nodes (13): Ae(), bi(), Bn(), br(), ec(), Ia(), jl(), nc() (+5 more)

### Community 187 - "Community 187"
Cohesion: 0.22
Nodes (10): b19e39d Merge pull request #26 from rhanka/feat/track-a3-mesh-llm-mesh, daf6f85 A3 scaffold: bridge graphify TextJsonGenerationClient to @sentropic/llm-mesh, createGraphifyMesh(), meshTextJsonClient(), requireAuthResolver(), client, dir, makeTempDir() (+2 more)

### Community 188 - "Community 188"
Cohesion: 0.22
Nodes (5): Config, HttpClientFactory, Config, HttpClient, HttpClientFactory

### Community 189 - "Community 189"
Cohesion: 0.27
Nodes (11): addCall(), addFunction(), makeStore(), qn(), addCall(), addFunction(), makeStore(), qn() (+3 more)

### Community 190 - "Community 190"
Cohesion: 0.19
Nodes (10): GraphEdge, GraphNode, adjacency(), components(), endpoint(), HERE, INPUT, measure() (+2 more)

### Community 191 - "Community 191"
Cohesion: 0.33
Nodes (10): isRecord(), isStringArray(), validateImageCaption(), validateImageRouting(), isRecord(), isStringArray(), VALID_DENSITY, VALID_ROUTING_SIGNAL (+2 more)

### Community 192 - "Community 192"
Cohesion: 0.17
Nodes (10): OntologyDiscoverySample, documentPrompt, extraction, fixtureRoot, imagePrompt, profile, prompt, promptState() (+2 more)

### Community 193 - "Community 193"
Cohesion: 0.30
Nodes (10): build(), attrs, edge, ext, ext1, ext2, G, hyper (+2 more)

### Community 194 - "Community 194"
Cohesion: 0.20
Nodes (7): countWords(), detect(), findVcsRoot(), isSensitive(), loadGraphifyignore(), parseGraphifyignoreLine(), result

### Community 195 - "Community 195"
Cohesion: 0.17
Nodes (7): CallLlmFn, callLlmWithRetry(), countUnansweredDescriptionBatches(), isTransientBackendError(), NodeContext, sleep(), ORIGINAL_ENV

### Community 196 - "Community 196"
Cohesion: 0.32
Nodes (7): normalizeSearchText(), queryTerms(), scoreSearchText(), textMatchesQuery(), exact, substring, terms

### Community 197 - "Community 197"
Cohesion: 0.30
Nodes (10): affectedFlows, cohesion, communities, detection, flows, G, gods, labels (+2 more)

### Community 198 - "Community 198"
Cohesion: 0.30
Nodes (10): communities, communityLabels, dir, G, list, long, outPath, result (+2 more)

### Community 199 - "Community 199"
Cohesion: 0.30
Nodes (10): allStale, article, communities, count, formatted, G, LABELS, makeGraph() (+2 more)

### Community 200 - "Community 200"
Cohesion: 0.30
Nodes (10): focused, graph, graphJsonShape, html, state, strongOnly, subgraph, tokens (+2 more)

### Community 201 - "Community 201"
Cohesion: 0.20
Nodes (11): 21b4be3 Refresh graph after SQL extraction rebase, 2f660d1 Merge pull request #19 from rhanka/feat/upstream-0.7.10-lot2, 387c7f6 Refresh graph after SQL extraction merge, 609fbc6 Add Markdown and Quarto structural extraction, 63686a4 Add TypeScript and TSX parser parity, 6425854 Refresh graph after parser surface catch-up, 98bb769 Add no-Python fallback language coverage, bbdc4fd Refresh graph after CommonJS extraction update (+3 more)

### Community 202 - "Community 202"
Cohesion: 0.18
Nodes (10): Animal, -initWithName, -speak, Dog, -fetch, Animal, -initWithName, -speak (+2 more)

### Community 203 - "Community 203"
Cohesion: 0.25
Nodes (4): build_graph(), Graph, build_graph(), Graph

### Community 204 - "Community 204"
Cohesion: 0.27
Nodes (7): deduplicateByLabel(), Extraction, ext(), extraction, out, chunkExtraction(), node()

### Community 205 - "Community 205"
Cohesion: 0.18
Nodes (7): buildNodeDescriptionPrompt(), descriptionAnswerFile(), descriptionInstructionFile(), emitDescriptionInstructions(), hasCodeNode(), hasEntityNode(), cleanupDirs

### Community 206 - "Community 206"
Cohesion: 0.35
Nodes (7): findMirror(), resolveStoreConfig(), ResolveStoreConfigInput, StorageCliFlags, envKeys, makeMinimalConfig(), savedEnv

### Community 207 - "Community 207"
Cohesion: 0.33
Nodes (9): attrs, cleanupDirs, deletedAbs, dir, edge, graph, graphPath, root (+1 more)

### Community 208 - "Community 208"
Cohesion: 0.18
Nodes (10): cleanupDirs, cypher, dir, graph, graphPath, outputPath, persisted, tempDir() (+2 more)

### Community 209 - "Community 209"
Cohesion: 0.33
Nodes (9): centralEnd, centralIdx, graph, graphIdx, html, ids, state, subgraph (+1 more)

### Community 210 - "Community 210"
Cohesion: 0.20
Nodes (10): 2f66d04 Refresh graph after acceleration helpers, 344c065 Clarify post-0.7.10 acceleration progress, 44f0f81 Refresh graph after Gemini UAT timeout update, 585f054 Refresh graph after wiki and reconciliation wiring, 5c0cb80 Add wiki describe sidecar generation CLI, 683acba Limit direct LLM UAT output tokens, 6a36196 Allow slower Gemini direct LLM UAT responses, de5ef85 Expose read-only reconciliation MCP tools (+2 more)

### Community 211 - "Community 211"
Cohesion: 0.36
Nodes (8): net8.0, Domain.csproj, Infrastructure.csproj, FluentValidation, MediatR, Microsoft.AspNetCore.Authentication.JwtBearer, Swashbuckle.AspNetCore, Microsoft.NET.Sdk.Web

### Community 212 - "Community 212"
Cohesion: 0.42
Nodes (8): arcControl(), buildEdgePolylinePositions(), EdgeCurveMode, EdgePolylineOptions, Point, quadraticPoint(), readPoint(), RenderGraphInput

### Community 213 - "Community 213"
Cohesion: 0.20
Nodes (8): batch, G, impact, makeReviewGraph(), node, out, store, targets

### Community 214 - "Community 214"
Cohesion: 0.27
Nodes (10): detectIncremental(), isWindowsAbsolutePath(), loadManifest(), manifestKeyForFile(), manifestProjectRoot(), md5File(), normaliseManifestEntry(), portablePath() (+2 more)

### Community 215 - "Community 215"
Cohesion: 0.24
Nodes (10): chunk(), countCoverage(), describeNodes(), detectDescriptionBackend(), generateNodeDescriptions(), ingestDescriptionAnswers(), parseDescriptionResponse(), rankNodes() (+2 more)

### Community 216 - "Community 216"
Cohesion: 0.49
Nodes (8): evidenceRefsFromSources(), loadOntologyPatchContext(), loadProfilePatchRuntimeContext(), optionalJson(), ProfilePatchRuntimeContext, readJson(), stringArray(), stringValue()

### Community 217 - "Community 217"
Cohesion: 0.33
Nodes (6): html, render(), sidecar(), watsonMatch, withDescr, without

### Community 218 - "Community 218"
Cohesion: 0.22
Nodes (5): InMemorySpannerState, makeFakeSpannerModule(), makeSpannerStore(), RecordedSql, RecordedUpsert

### Community 219 - "Community 219"
Cohesion: 0.22
Nodes (9): hs(), ku(), Ln(), mo(), Nu(), Pn(), qu(), Ru() (+1 more)

### Community 220 - "Community 220"
Cohesion: 0.22
Nodes (7): cleanupDirs, dir, graphText, labels, labelsPath, makeProjectDir(), reportText

### Community 221 - "Community 221"
Cohesion: 0.36
Nodes (7): d0b0710 feat(studio): legacy-parity box nodes drawn in canvas (labeled rounded rect, text for central Work/Chapter nodes), __dirname, EDGE_CASES, expectGranularParity(), expectParity(), REPO_ROOT, SMALL_GRAPH

### Community 222 - "Community 222"
Cohesion: 0.31
Nodes (2): HttpClient, buildHeaders()

### Community 223 - "Community 223"
Cohesion: 0.28
Nodes (6): MyApp.Accounts.User, create(), validate(), MyApp.Accounts.User, create(), validate()

### Community 224 - "Community 224"
Cohesion: 0.39
Nodes (7): dump(), edges, extraction(), forward, order1, order2, reversed

### Community 225 - "Community 225"
Cohesion: 0.31
Nodes (5): cites(), cleanupDirs, hub(), setupProject(), tempDir()

### Community 226 - "Community 226"
Cohesion: 0.39
Nodes (7): graph, html, idxControls, idxCounters, idxGraphPanel, state, tokens

### Community 227 - "Community 227"
Cohesion: 0.39
Nodes (7): graph, html, occurrences, panel(), panelIdx, slotIdx, tokens

### Community 228 - "Community 228"
Cohesion: 0.39
Nodes (7): dataset, dirty, facets, keys, slices, state, status

### Community 229 - "Community 229"
Cohesion: 0.39
Nodes (7): dir, fixture, makeTempDir(), result, tempDirs, writeCandidateQueue(), writeGraphPreview()

### Community 230 - "Community 230"
Cohesion: 0.39
Nodes (7): graph, html, idxChar, idxLoc, idxWork, state, tokens

### Community 231 - "Community 231"
Cohesion: 0.36
Nodes (6): build(), build_from_json(), Merge multiple extraction results into one graph., build(), build_from_json(), Merge multiple extraction results into one graph.

### Community 232 - "Community 232"
Cohesion: 0.32
Nodes (5): 3286ecd feat(qa): add target manifest QA gate (#177), tempDirs, write(), writeGraph(), writeJson()

### Community 233 - "Community 233"
Cohesion: 0.29
Nodes (4): lifecycle(), makeGraph(), LifecycleMetadata, recommendation

### Community 234 - "Community 234"
Cohesion: 0.43
Nodes (6): dest, root, run(), src, studio, warn()

### Community 235 - "Community 235"
Cohesion: 0.29
Nodes (7): args, die(), manifest, manifestModels, outDir, parseArgs(), root

### Community 236 - "Community 236"
Cohesion: 0.25
Nodes (8): commitPrefixForArea(), communityLabel(), dominantCommunity(), groupDraftForFile(), isGraphifyStatePath(), normalizePath(), sourceMatches(), topLevelArea()

### Community 237 - "Community 237"
Cohesion: 0.43
Nodes (6): evidenceQuery, html, reconHtml, reconQuery, tokens, workspaceHtml

### Community 238 - "Community 238"
Cohesion: 0.43
Nodes (6): query, restored, state, state0, state1, state2

### Community 239 - "Community 239"
Cohesion: 0.29
Nodes (7): 0938526 Refresh graph after wiki description export updates, 37045c4 Harden smoke test tarball install sandboxing, 4579f9a Expose wiki description sidecars in CLI exports, 908f265 Clarify post-0.7.10 progress accounting, 9efb5ea Refresh graph after progress accounting update, eee2f35 Refresh graph after product acceleration kickoff, efa8b6b Start post-0.7.10 product acceleration

### Community 240 - "Community 240"
Cohesion: 0.29
Nodes (2): Transformer, Transformer

### Community 241 - "Community 241"
Cohesion: 0.48
Nodes (5): cli, { dirname, join }, entry, result, { spawnSync }

### Community 242 - "Community 242"
Cohesion: 0.43
Nodes (4): loadWorkspace(), buildScene(), LIGHT_SCENE, RAW_GRAPH

### Community 243 - "Community 243"
Cohesion: 0.29
Nodes (2): createFakeCanvas2DContext(), createFakeWebGlContext()

### Community 244 - "Community 244"
Cohesion: 0.29
Nodes (4): cleanLabelInstructionDir(), cleanDescriptionInstructionDir(), countUndescribedInGraph(), tempDirs

### Community 245 - "Community 245"
Cohesion: 0.29
Nodes (6): home, previousCwd, readme, skillPath, tempDirs, versionPath

### Community 246 - "Community 246"
Cohesion: 0.48
Nodes (5): communitiesIdx, facetsIdx, graph, html, rail()

### Community 247 - "Community 247"
Cohesion: 0.33
Nodes (3): makeGraph(), delta, text

### Community 248 - "Community 248"
Cohesion: 0.47
Nodes (6): buildCommitRecommendation(), groupConfidence(), mergeDrafts(), minConfidence(), stalenessFrom(), uniqueSorted()

### Community 249 - "Community 249"
Cohesion: 0.53
Nodes (4): b1, b2, backup, dated

### Community 250 - "Community 250"
Cohesion: 0.33
Nodes (1): cleanupDirs

### Community 251 - "Community 251"
Cohesion: 0.53
Nodes (4): r1, r2, r3, result

### Community 252 - "Community 252"
Cohesion: 0.53
Nodes (4): candidateGraph, graph, html, tokens

### Community 253 - "Community 253"
Cohesion: 0.53
Nodes (4): character, dataset, groups, total

### Community 254 - "Community 254"
Cohesion: 0.40
Nodes (5): ha(), Ka(), qa(), Va(), zo()

### Community 255 - "Community 255"
Cohesion: 0.40
Nodes (5): 14d4226 docs: research ontology studio design, 40f41b2 chore: refresh ontology lifecycle graph, 6c29a0f chore: refresh ontology lifecycle graph, 99b5335 docs: frame ontology lifecycle mystery UAT, f395141 docs: mark direct backend release complete

### Community 256 - "Community 256"
Cohesion: 0.70
Nodes (3): escapeHtml(), HTML_ESCAPE_MAP, renderInlineMarkdown()

### Community 257 - "Community 257"
Cohesion: 0.50
Nodes (2): buildPatchFromCandidate(), cand

### Community 258 - "Community 258"
Cohesion: 0.70
Nodes (4): fmt(), shapeCode(), shapePolygonPoints(), shapeSvgPath()

### Community 260 - "Community 260"
Cohesion: 0.60
Nodes (3): graph, html, tokens

### Community 261 - "Community 261"
Cohesion: 0.60
Nodes (3): html, state, tokens

### Community 262 - "Community 262"
Cohesion: 0.50
Nodes (4): Bo(), nl(), Sa(), Wt()

### Community 263 - "Community 263"
Cohesion: 0.50
Nodes (4): 67cb3a8 Track C-3.5: profile-aware shape/color resolution in toHtml, 97d12c9 Track C-3.5: wire ontology profile into HTML export CLI paths, d20ad59 Track C-3.5: add OntologyNodeType.visual_encoding (schema + validation), d52126e Track C-3.5: CHANGELOG Unreleased entry (cosmetic-only TS delta)

### Community 264 - "Community 264"
Cohesion: 0.50
Nodes (2): 9408561 feat(conversations): connector claude/codex/cursor/gemini -> Extraction (WP5), optionalRuntimeDeps

### Community 265 - "Community 265"
Cohesion: 0.67
Nodes (3): ae0c7ed feat: add ontology discovery proposal workflow, f1d2fce feat: extend ontology lifecycle profile validation, f64bc16 chore: refresh graphify ontology lifecycle graph

### Community 266 - "Community 266"
Cohesion: 0.50
Nodes (1): cleanupDirs

### Community 267 - "Community 267"
Cohesion: 0.67
Nodes (2): html, tokens

### Community 268 - "Community 268"
Cohesion: 0.67
Nodes (3): writeFixtureGraph(), writeOntologyPatchFixture(), writeOntologyReconciliationFixture()

### Community 269 - "Community 269"
Cohesion: 1.00
Nodes (1): accordion()

### Community 270 - "Community 270"
Cohesion: 1.00
Nodes (1): UnpdfTextResult

### Community 271 - "Community 271"
Cohesion: 1.00
Nodes (1): here

## Knowledge Gaps
- **1092 isolated node(s):** `Qt`, `_a`, `ya`, `No`, `Jr` (+1087 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 222`** (2 nodes): `HttpClient`, `buildHeaders()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 240`** (2 nodes): `Transformer`, `Transformer`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 243`** (2 nodes): `createFakeCanvas2DContext()`, `createFakeWebGlContext()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 250`** (1 nodes): `cleanupDirs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 257`** (2 nodes): `buildPatchFromCandidate()`, `cand`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 264`** (2 nodes): `9408561 feat(conversations): connector claude/codex/cursor/gemini -> Extraction (WP5)`, `optionalRuntimeDeps`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 266`** (1 nodes): `cleanupDirs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 267`** (2 nodes): `html`, `tokens`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 269`** (1 nodes): `accordion()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 270`** (1 nodes): `UnpdfTextResult`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 271`** (1 nodes): `here`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createReviewGraphStore()` connect `Community 141` to `Recommendations (commit prefix, area)`, `Sample corpus: httpx utils (worked/)`, `Review benchmark`, `Community 184`, `Community 93`, `Community 55`, `Community 189`, `Community 173`, `Community 102`, `Community 213`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Why does `Extraction` connect `Community 204` to `Community 74`, `Community 106`, `MCP server (graph queries)`, `Community 86`, `Community 77`, `Community 87`, `Sample corpus: mixed analyze.py (worked/)`, `Review context builder`, `Community 96`, `Recommendations (commit prefix, area)`, `Community 46`, `Community 165`, `Profile validation`, `Sample corpus: httpx utils (worked/)`, `Community 44`, `Community 193`, `Community 190`, `Community 121`, `Community 143`, `Community 103`, `Review benchmark`, `Community 64`, `Community 80`, `Profile report`, `Community 117`, `Community 150`, `Community 192`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Why does `DetectionResult` connect `Community 165` to `MCP server (graph queries)`, `Community 86`, `Community 66`, `Recommendations (commit prefix, area)`, `Review analysis (blast radius, communities)`, `Profile validation`, `Community 129`, `Sample corpus: httpx utils (worked/)`, `Review benchmark`, `Community 90`, `Community 91`, `Graph summary (first-hop orientation)`, `Community 147`, `Community 156`, `Community 181`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **What connects `Qt`, `_a`, `ya` to the rest of the system?**
  _1092 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Input scope, git, repo clone` be split into smaller, more focused modules?**
  _Cohesion score 0.06080933682373473 - nodes in this community are weakly interconnected._
- **Should `MCP server (graph queries)` be split into smaller, more focused modules?**
  _Cohesion score 0.028937292072060763 - nodes in this community are weakly interconnected._
- **Should `Audio/video transcription & ingest` be split into smaller, more focused modules?**
  _Cohesion score 0.06805495920996135 - nodes in this community are weakly interconnected._