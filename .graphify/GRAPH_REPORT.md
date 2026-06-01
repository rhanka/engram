# Graph Report - .  (2026-06-01)

## Corpus Check
- 345 files · ~422,737 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 4841 nodes · 9331 edges · 198 communities detected
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 466 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output
- Edge kinds: contains: 4114 · calls: 2011 · imports: 1060 · imports_from: 629 · re_exports: 527 · uses: 466 · method: 232 · rationale_for: 208 · inherits: 68 · defines: 16


## Input Scope
- Requested: auto
- Resolved: committed (source: default-auto)
- Included files: 345 · Candidates: 374
- Excluded: 6 untracked · 16912 ignored · 8 sensitive · 0 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.

## Graph Freshness
- Built from Git commit: `b1bc68a`
- Compare this hash to `git rev-parse HEAD` before trusting freshness-sensitive graph output.
## God Nodes (most connected - your core abstractions)
1. `Response` - 45 edges
2. `Response` - 45 edges
3. `Request` - 42 edges
4. `Request` - 42 edges
5. `_makeId()` - 29 edges
6. `Client` - 27 edges
7. `Cookies` - 27 edges
8. `Client` - 27 edges
9. `Cookies` - 27 edges
10. `AsyncClient` - 26 edges

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

### Community 0 - "Code extraction (tree-sitter walkers)"
Cohesion: 0.05
Nodes (37): Authentication handlers. Auth objects are callables that modify a request before, Auth, BasicAuth, BearerAuth, DigestAuth, NetRCAuth, Authentication handlers. Auth objects are callables that modify a request before, Load credentials from ~/.netrc based on the request host. (+29 more)

### Community 1 - "PDF preflight & semantic prep"
Cohesion: 0.02
Nodes (79): analysis, analysisPath, analysisValues, article, artifact, cacheKey, captionsDir, configOut (+71 more)

### Community 2 - "Input scope, git, repo clone"
Cohesion: 0.05
Nodes (72): artifactHasDeepRoute(), asRecord(), existingValidSidecarErrors(), importImageDataprepBatchResults(), readCaption(), readJsonl(), asRecord(), bucketMatches() (+64 more)

### Community 3 - "MCP server (graph queries)"
Cohesion: 0.04
Nodes (67): Exception, CloseError, ConnectTimeout, CookieConflict, PoolTimeout, ProtocolError, ProxyError, httpx-like exception hierarchy. All exceptions inherit from HTTPError at the top (+59 more)

### Community 4 - "Audio/video transcription & ingest"
Cohesion: 0.03
Nodes (61): alphaNeighbors, audit, beforeAudit, beforeDecisions, betaNeighbors, candidate, candidateResponse, candidates (+53 more)

### Community 5 - "File detection & Google Workspace"
Cohesion: 0.07
Nodes (19): Auth, BasicAuth, AsyncClient, BaseClient, Client, Limits, The main Client and AsyncClient classes. BaseClient holds all shared logic. Clie, Asynchronous HTTP client. (+11 more)

### Community 6 - "Sample corpus: example Python pipeline (worked/)"
Cohesion: 0.05
Nodes (66): ASSET_DIR_MARKERS, canonicalFilePath(), classifyFile(), convertOfficeFile(), countWords(), detect(), detectIncremental(), DetectOptions (+58 more)

### Community 7 - "Exporters (HTML, canvas, JSON)"
Cohesion: 0.04
Nodes (55): AssistantLlmClientOptions, BatchTextJsonImportInput, BatchTextJsonImportResult, BatchVisionExportInput, BatchVisionExportResult, BatchVisionImportInput, BatchVisionImportResult, BatchVisionJsonClient (+47 more)

### Community 8 - "Sample corpus: mixed analyze.py (worked/)"
Cohesion: 0.04
Nodes (58): buildFlowArtifact(), computeFlowCriticality(), decoratorsOf(), detectEntryPoints(), flowIdFor(), flowListToText(), flowToSteps(), getFlowById() (+50 more)

### Community 9 - "Review delta & risk chains"
Cohesion: 0.04
Nodes (45): analyzeChanges(), changedNodesFromFiles(), mapChangesToNodes(), sortNodesByLocation(), addNode(), qn(), uniqueSorted(), analyzeChanges() (+37 more)

### Community 10 - "Flow detection & criticality"
Cohesion: 0.07
Nodes (33): BearerAuth, DigestAuth, NetRCAuth, Load credentials from ~/.netrc based on the request host., Base class for all authentication handlers., Modify the request. May yield to inspect the response., HTTP Basic Authentication., Bearer token authentication. (+25 more)

### Community 11 - "CLI runtime & search"
Cohesion: 0.04
Nodes (59): braceDelta(), _C_CONFIG, CASE_INSENSITIVE_CALL_MODULES, _CPP_CONFIG, _CSHARP_CONFIG, _DISPATCH, _EXTENSIONS, extractAstro() (+51 more)

### Community 12 - "Cache, paths, benchmark"
Cohesion: 0.07
Nodes (58): asRecord(), asStringArray(), bindOntologyProfile(), hashOntologyProfile(), loadOntologyProfile(), normalizeCitationPolicy(), normalizeHardeningPolicy(), normalizeOntologyProfile() (+50 more)

### Community 13 - "Review analysis (blast radius, communities)"
Cohesion: 0.05
Nodes (53): buildReviewContext(), buildReviewGuidance(), buildSourceSnippets(), changedFunctionsWithoutTests(), extractRelevantLines(), formatLines(), isInside(), isSensitivePath() (+45 more)

### Community 14 - "Portable-check & detection portability"
Cohesion: 0.06
Nodes (51): asBoolean(), asNumber(), asRecord(), asString(), asStringArray(), buildRegistrySources(), loadProjectConfig(), normalizeProjectConfig() (+43 more)

### Community 15 - "Sample corpus: httpx Python client (worked/)"
Cohesion: 0.06
Nodes (46): isRecord(), isStringArray(), validateImageCaption(), validateImageRouting(), artifactId(), buildImageDataprepManifest(), existingImages(), fileHash() (+38 more)

### Community 16 - "Review context builder"
Cohesion: 0.07
Nodes (45): buildProfileReport(), graphLinks(), graphNodes(), highDegreeSection(), humanReviewSection(), invalidRelationsSection(), lowEvidenceSection(), pdfOcrSection() (+37 more)

### Community 17 - "Ontology profile loader"
Cohesion: 0.04
Nodes (52): collectFiles(), astroNode, baseNode, buildNode, cardNode, classNode, cleanNode, codeNode (+44 more)

### Community 18 - "Sample corpus: httpx exceptions (worked/)"
Cohesion: 0.06
Nodes (50): handle_delete(), handle_enrich(), handle_get(), handle_list(), handle_search(), handle_upload(), API module - exposes the document pipeline over HTTP. Thin layer over parser, va, Accept a list of file paths, run the full pipeline on each,     and return a sum (+42 more)

### Community 19 - "Profile validation"
Cohesion: 0.07
Nodes (48): _cross_community_surprises(), _cross_file_surprises(), _file_category(), god_nodes(), graph_diff(), _is_concept_node(), _is_file_node(), _node_community_map() (+40 more)

### Community 20 - "Configured dataprep (profile mode)"
Cohesion: 0.06
Nodes (33): average(), buildBlastRadius(), buildReviewAnalysis(), communityRisk(), evaluateReviewAnalysis(), formatMetric(), impactedCommunities(), multimodalSafety() (+25 more)

### Community 21 - "CLI top-level & assistant-integration tests"
Cohesion: 0.07
Nodes (44): crossCommunitySurprises(), crossFileSurprises(), edgeBetweennessSurprises(), fileCategory(), godNodes(), isConceptNode(), isFileNode(), nodeCommunityMap() (+36 more)

### Community 22 - "Multi-language test fixtures"
Cohesion: 0.07
Nodes (42): buildProfileChunkPrompt(), buildProfileExtractionPrompt(), buildProfileValidationPrompt(), chunkGuidance(), citationSection(), genericSafetySection(), hardeningSection(), inputHintsSection() (+34 more)

### Community 23 - "Review benchmark"
Cohesion: 0.06
Nodes (40): average(), countHits(), evaluateReviewBenchmarks(), flowIdentifiers(), formatMetric(), identifiers(), normalize(), ratio() (+32 more)

### Community 24 - "Sample corpus: httpx utils (worked/)"
Cohesion: 0.06
Nodes (31): ANTIGRAVITY_RULE_PATH, ANTIGRAVITY_WORKFLOW_PATH, changedFilesFromGit(), checkSkillVersion(), __dirname, ensureCliExtractionShape(), __filename, GEMINI_MCP_SERVER (+23 more)

### Community 25 - "Recommendations (commit prefix, area)"
Cohesion: 0.06
Nodes (34): buildReviewDelta(), changedNodeIds(), compareNodes(), compareStrings(), highRiskChains(), impactedNodeIds(), isTestPath(), likelyTestGaps() (+26 more)

### Community 26 - "Change detection & risk score"
Cohesion: 0.07
Nodes (44): bodyContent(), cachedFiles(), cacheDir(), cacheKind(), cacheNamespace(), CacheOptions, checkSemanticCache(), clearCache() (+36 more)

### Community 27 - "Profile discovery/extraction prompts"
Cohesion: 0.10
Nodes (44): buildModel(), CompactMetaInline, decisionBasisReason(), descriptionSidecarFor(), displayText(), escapeHtml(), escapeScriptJson(), graphHtmlUrl() (+36 more)

### Community 28 - "Sample corpus: example storage.py (worked/)"
Cohesion: 0.09
Nodes (42): collectJsonIssues(), collectStringIssues(), collectTextIssues(), hasSchemePrefix(), isIgnoredLocalArtifact(), isWindowsAbsolutePath(), makeDetectionPortable(), normalizeFileMap() (+34 more)

### Community 29 - "Profile report"
Cohesion: 0.04
Nodes (44): GraphifyDataprepPolicy, GraphifyImageAnalysisBatchPolicy, GraphifyImageAnalysisCalibrationPolicy, GraphifyImageAnalysisPolicy, GraphifyImageArtifactSource, GraphifyLlmExecutionBatchPolicy, GraphifyLlmExecutionMeshPolicy, GraphifyLlmExecutionMode (+36 more)

### Community 30 - "Ontology patch (validate, dry-run, apply)"
Cohesion: 0.08
Nodes (41): appendMemoryFiles(), buildGitInventory(), countGitPaths(), fallbackAllScope(), gitInventory(), inspectInputScope(), isInputScopeMode(), makeScope() (+33 more)

### Community 31 - "Sample corpus: httpx auth/client (worked/)"
Cohesion: 0.09
Nodes (41): WorkspaceRailLayout, workspaceRailStyles(), buildNodeFacts(), CompactDescriptionContext, computeCounters(), CountersValues, DEFAULT_INLINE_FACTS, DEFAULT_SECTIONS (+33 more)

### Community 32 - "Test fixtures: C#/Java/PowerShell"
Cohesion: 0.09
Nodes (37): applyConfiguredExcludes(), buildConfiguredDetectionInputs(), buildProfileState(), dataprepReport(), emptyDetection(), fullPageScreenshotExcludes(), mergeDetections(), mergeScopeInspections() (+29 more)

### Community 33 - "Image routing calibration"
Cohesion: 0.10
Nodes (41): addError(), addWarning(), appendJsonLine(), applyOntologyPatch(), auditPath(), changedFiles(), decisionLogOperation(), decisionLogStatus() (+33 more)

### Community 34 - "Ontology output (wiki, obsidian, etc.)"
Cohesion: 0.05
Nodes (36): addFunction(), qn(), readFlowArtifact(), writeFlowArtifact(), addFunction(), allNames, api, artifact (+28 more)

### Community 35 - "Graph summary (first-hop orientation)"
Cohesion: 0.07
Nodes (29): bfs(), communitiesFromGraph(), communityName(), dfs(), findNode(), getVersion(), loadGraph(), scoreNodes() (+21 more)

### Community 36 - "Analyze (god nodes, surprising connections)"
Cohesion: 0.07
Nodes (39): allowedPathFor(), buildOntologyDiscoveryDiff(), buildOntologyDiscoverySample(), knownEvidenceRefs(), loadOntologyDiscoveryContext(), OntologyDiscoveryContext, ontologyDiscoveryDiffToMarkdown(), OntologyDiscoveryProposal (+31 more)

### Community 37 - "Sample corpus: httpx auth (worked/)"
Cohesion: 0.07
Nodes (36): buildWikiDescriptionCacheKey(), checkWikiDescriptionFreshness(), createInsufficientEvidenceRecord(), CreateInsufficientEvidenceRecordInput, isNonEmptyString(), isRecord(), isStringArray(), isStringOrNull() (+28 more)

### Community 38 - "Tests: wiki description generation"
Cohesion: 0.10
Nodes (35): currentBranch(), currentHead(), lifecyclePaths(), markLifecycleAnalyzed(), markLifecycleStale(), mergeBase(), planLifecyclePrune(), readJson() (+27 more)

### Community 39 - "Sample corpus: httpx client (worked/)"
Cohesion: 0.10
Nodes (33): authorLogin(), CommandRunner, defaultRunner, formatPrWorktrees(), formatPullRequestConflicts(), formatPullRequestDetails(), formatPullRequestList(), getPullRequest() (+25 more)

### Community 40 - "Sample corpus: httpx transport (worked/)"
Cohesion: 0.09
Nodes (15): Config, HttpClient, HttpClientFactory, main(), NewServer(), process(), validate(), Server (+7 more)

### Community 41 - "LLM execution (direct backends)"
Cohesion: 0.10
Nodes (34): LlmExecutionMode, buildFallbackSidecar(), buildWikiDescriptionPrompt(), BuildWikiDescriptionPromptOptions, collectCommunityTargetContext(), collectInferredCommunityMap(), collectNodeNeighbors(), collectNodeTargetContext() (+26 more)

### Community 42 - "Community 42"
Cohesion: 0.06
Nodes (34): build_url_with_params(), flatten_queryparams(), is_known_encoding(), normalize_header_key(), obfuscate_sensitive_headers(), parse_content_type(), primitive_value_to_str(), Utility functions shared across the library. Small helpers that don't belong in (+26 more)

### Community 43 - "Community 43"
Cohesion: 0.08
Nodes (27): normalizeCommunityLabel(), persistCommunityLabels(), readGraphAttributeLabels(), readLabelsJson(), resolveCommunityLabels(), ExtractionDiagnostic, buildProject(), BuildProjectArtifacts (+19 more)

### Community 44 - "Community 44"
Cohesion: 0.10
Nodes (23): communitiesFromGraph(), communityLabelsFromGraph(), activeViewFromQuery(), candidateFilters(), decisionLogOptions(), graphHtmlArtifactResult(), graphJsonResult(), handleOntologyStudioRequest() (+15 more)

### Community 45 - "Community 45"
Cohesion: 0.08
Nodes (31): BatchTextJsonClient, BatchTextJsonExportInput, BatchTextJsonExportResult, buildTargetKindsMap(), buildWikiDescriptionBatchExport(), BuildWikiDescriptionBatchOptions, exportWikiDescriptionBatchToJsonl(), ParseWikiDescriptionBatchOptions (+23 more)

### Community 46 - "Community 46"
Cohesion: 0.09
Nodes (31): OntologyPatchContext, OntologyPatchNode, candidateId(), candidateScore(), chooseCanonicalPair(), filterOntologyReconciliationCandidates(), generateOntologyReconciliationCandidates(), GenerateOntologyReconciliationCandidatesOptions (+23 more)

### Community 47 - "Community 47"
Cohesion: 0.09
Nodes (27): addCall(), addFunction(), makeFlowStore(), qn(), getAffectedFlows(), asNumber(), asString(), createReviewGraphStore() (+19 more)

### Community 48 - "Community 48"
Cohesion: 0.09
Nodes (26): applyEntry(), collectEntries(), gitAdvice(), migrateGraphifyOut(), normalizeGitPath(), planGraphifyOutMigration(), shellQuote(), applyEntry() (+18 more)

### Community 49 - "Community 49"
Cohesion: 0.09
Nodes (28): buildMinimalContext(), riskFromScore(), suggestionsForTask(), addCall(), addFunction(), makeStore(), qn(), topCommunities() (+20 more)

### Community 50 - "Community 50"
Cohesion: 0.11
Nodes (32): delete_record(), _ensure_storage(), list_records(), load_index(), load_record(), Storage module - persists documents to disk and maintains the search index. All, Load the full document index from disk., Persist the index to disk. (+24 more)

### Community 51 - "Community 51"
Cohesion: 0.07
Nodes (29): agentsInstall(), getAgentsMdSection(), getInvocationExample(), installCodexHook(), agents, dir, home, section (+21 more)

### Community 52 - "Community 52"
Cohesion: 0.09
Nodes (23): compileNodes(), compileOntologyOutputs(), compileRelations(), ontologyNodeType(), safeFilename(), sha256(), stringValue(), writeJson() (+15 more)

### Community 53 - "Community 53"
Cohesion: 0.09
Nodes (26): asRecord(), asString(), build(), buildFromJson(), buildMerge(), BuildMergeOptions, BuildOptions, dedupLabelKey() (+18 more)

### Community 54 - "Community 54"
Cohesion: 0.09
Nodes (28): BACKUP_ARTIFACTS, buildFreshnessMetadata(), CanvasOptions, COMMUNITY_COLORS, CommunityLabelOptions, CommunityLabelsInput, computeTopologySignature(), computeTopologySignatureFromLinks() (+20 more)

### Community 55 - "Community 55"
Cohesion: 0.09
Nodes (23): AnalysisFile, analyzeGraph(), cacheOptionsFromRuntime(), defaultLabels(), __dirname, ensureExtractionShape(), __filename, getVersion() (+15 more)

### Community 56 - "Community 56"
Cohesion: 0.08
Nodes (12): DataProcessor, Get-Data(), GraphifyDemo, IProcessor, Process-Items(), Processor, DataProcessor, Get-Data() (+4 more)

### Community 57 - "Community 57"
Cohesion: 0.09
Nodes (26): field(), loadProfileRegistry(), normalizeRegistryRecord(), readRegistryRows(), registryRecordsToExtraction(), safeIdPart(), field(), loadProfileRegistries() (+18 more)

### Community 58 - "Community 58"
Cohesion: 0.10
Nodes (29): GitContext, escapeRegExp(), GRAPH_GITATTR_LINES, hookBlockRegex(), HookDefinition, HOOKS, install(), installGraphAttributes() (+21 more)

### Community 59 - "Community 59"
Cohesion: 0.07
Nodes (26): createOntologyStudioRequestHandler(), generateOntologyStudioToken(), isLoopbackHost(), startOntologyStudioServer(), apply, audit, auditLine, authoritative (+18 more)

### Community 60 - "Community 60"
Cohesion: 0.11
Nodes (29): CACHED_AUDIO_EXTENSIONS, defaultWhisperCacheDir(), downloadFile(), ensureWhisperArtifacts(), envBoolean(), envNumber(), extractTranscriptText(), FasterWhisperModel (+21 more)

### Community 61 - "Community 61"
Cohesion: 0.11
Nodes (26): buildFirstHopSummary(), buildNextBestAction(), communityLabels(), communityMembership(), compareHubs(), compareStrings(), FirstHopCommunity, FirstHopHub (+18 more)

### Community 62 - "Community 62"
Cohesion: 0.15
Nodes (29): antigravityInstall(), canonicalPlatformName(), claudeInstall(), emptyPreview(), findSkillFile(), geminiInstall(), globalSkillInstallPreview(), installClaudeHook() (+21 more)

### Community 63 - "Community 63"
Cohesion: 0.10
Nodes (23): convertGoogleWorkspaceFile(), ConvertGoogleWorkspaceOptions, createDefaultGoogleWorkspaceFetcher(), EXPORT_MIME_TYPE_BY_EXTENSION, extractFileIdFromUrl(), extractResourceKey(), frontmatterWrap(), GOOGLE_WORKSPACE_EXTENSIONS (+15 more)

### Community 64 - "Community 64"
Cohesion: 0.07
Nodes (25): GenerateWikiDescriptionSidecarsClients, cacheKey, communities, communityKey, godNodesData, graph, labels, mesh (+17 more)

### Community 65 - "Community 65"
Cohesion: 0.10
Nodes (25): appendRationaleAttr(), INVALID_FILE_TYPES_FOR_SANITIZE, isPlainObject(), isSentenceLikeRationaleLabel(), LoadValidatedResult, loadValidatedSemanticFragment(), sanitizeSemanticFragment(), SemanticFragment (+17 more)

### Community 66 - "Community 66"
Cohesion: 0.10
Nodes (26): batch_parse(), parse_and_save(), parse_file(), parse_json(), parse_markdown(), parse_plaintext(), Parser module - reads raw input documents and converts them into a structured fo, Read a file from disk and return a structured document. (+18 more)

### Community 67 - "Community 67"
Cohesion: 0.10
Nodes (26): enrich_document(), extract_keywords(), find_cross_references(), normalize_text(), process_and_save(), Processor module - transforms validated documents into enriched records ready fo, Lowercase, strip extra whitespace, remove control characters., Pull non-stopword tokens from text, deduplicated. (+18 more)

### Community 68 - "Community 68"
Cohesion: 0.11
Nodes (20): AllChunksFailedError, createDirectSemanticExtractionClient(), DirectSemanticChunk, DirectSemanticClientOptions, DirectSemanticExtractionClient, DirectSemanticExtractionOptions, DirectSemanticFile, estimateFileTokens() (+12 more)

### Community 69 - "Community 69"
Cohesion: 0.08
Nodes (16): OntologyWriteFixture, writeOntologyWriteFixture(), OntologyPatch, boxes, central, dir, fixture, headingMatches (+8 more)

### Community 70 - "Community 70"
Cohesion: 0.15
Nodes (23): buildScene(), computeDegrees(), displayValue(), graphEdges(), graphNodes(), groupCounts(), indexNodes(), isStrongEdge() (+15 more)

### Community 71 - "Community 71"
Cohesion: 0.14
Nodes (25): augmentDetectionWithPdfPreflight(), cloneDetection(), countWords(), dedupe(), listImageArtifacts(), loadMistralOcrModule(), metadataPath(), preparePdf() (+17 more)

### Community 72 - "Community 72"
Cohesion: 0.14
Nodes (23): countImageMarkers(), countWords(), extractPdfTextLayer(), extractWithPdfParse(), extractWithPdftotext(), normalizeText(), preflightPdf(), sha256() (+15 more)

### Community 73 - "Community 73"
Cohesion: 0.09
Nodes (21): assertValid(), REQUIRED_EDGE_FIELDS, REQUIRED_NODE_FIELDS, VALID_CONFIDENCES, VALID_FILE_TYPES, validateExtraction(), communities, extraction (+13 more)

### Community 74 - "Community 74"
Cohesion: 0.08
Nodes (8): CommitRecommendation, CommitRecommendationConfidence, CommitRecommendationGroup, CommitRecommendationOptions, CommitRecommendationStaleness, FileGraphInfo, GroupDraft, ReviewDelta

### Community 75 - "Community 75"
Cohesion: 0.10
Nodes (22): canonicalizeForPartition(), cluster(), ClusterOptions, cohesionScore(), partition(), scoreAll(), splitCommunity(), allAssigned (+14 more)

### Community 76 - "Community 76"
Cohesion: 0.15
Nodes (22): html, tokens, buildFacetValues(), collectFieldNames(), DENYLIST, DiscoverFacetsOptions, discoverWorkspaceFacets(), isFacetableValue() (+14 more)

### Community 77 - "Community 77"
Cohesion: 0.08
Nodes (21): filterDecisionLogItems(), loadOntologyReconciliationDecisionLog(), ONTOLOGY_RECONCILIATION_DECISION_LOG_SCHEMA, auditPath, authoritativePath, badRelation, badStatus, cleanupDirs (+13 more)

### Community 78 - "Community 78"
Cohesion: 0.14
Nodes (21): escapeHtml(), escapeUrl(), HTML_ESCAPE_MAP, modeLabel(), renderGraphPanel(), RenderGraphPanelOptions, renderLiveGraphScript(), renderMetricsCard() (+13 more)

### Community 79 - "Community 79"
Cohesion: 0.11
Nodes (19): NumericMapLike, StringMapLike, toNumericMap(), toStringMap(), ReviewFlow, appendFreshnessSection(), appendInputScopeSection(), appendReviewSections() (+11 more)

### Community 80 - "Community 80"
Cohesion: 0.16
Nodes (22): defaultGraphPath(), defaultManifestPath(), defaultTranscriptsDir(), legacyGraphPath(), resolveGraphifyPaths(), resolveGraphInputPath(), statePath(), defaultGraphPath() (+14 more)

### Community 81 - "Community 81"
Cohesion: 0.18
Nodes (18): addIssue(), buildEvidenceIds(), buildRegistryRecords(), citations(), isProfileEdge(), isRegistrySeed(), ProfileValidationContext, ProfileValidationIssue (+10 more)

### Community 82 - "Community 82"
Cohesion: 0.11
Nodes (19): CODE_EXTENSIONS, DOC_EXTENSIONS, IMAGE_EXTENSIONS, PAPER_EXTENSIONS, makeGraphPortable(), acquireRebuildLock(), builtFromCommit(), checkUpdate() (+11 more)

### Community 83 - "Community 83"
Cohesion: 0.16
Nodes (22): buildRelationRows(), displayValue(), EntityOccurrence, EntityPanelOccurrences, entityPanelStyles(), escapeHtml(), graphEdges(), HTML_ESCAPE_MAP (+14 more)

### Community 84 - "Community 84"
Cohesion: 0.15
Nodes (20): ALLOWED_SCHEMES, BLOCKED_HOSTS, embeddedIPv4(), escapeHtml(), expandIPv6(), isPrivateIp(), isRedirectStatus(), safeFetch() (+12 more)

### Community 85 - "Community 85"
Cohesion: 0.09
Nodes (21): a, aFlow, aSnapshot, b, bFlow, bSnapshot, cFlow, { confidence_score: _ignored, ...rest } (+13 more)

### Community 86 - "Community 86"
Cohesion: 0.09
Nodes (22): allClustered, count, cypher, data, errors, exts, FIXTURES_DIR, G2 (+14 more)

### Community 87 - "Community 87"
Cohesion: 0.15
Nodes (22): _csharpExtraWalk(), extractMarkdown(), _findRequireCall(), _getCFuncName(), _getCppFuncName(), _importC(), _importCsharp(), _importJava() (+14 more)

### Community 88 - "Community 88"
Cohesion: 0.09
Nodes (18): configOut, dir, discoveryDiffPath, discoveryDir, discoveryPromptPath, discoveryProposalsPath, discoveryReportPath, discoverySample (+10 more)

### Community 89 - "Community 89"
Cohesion: 0.11
Nodes (20): build_graph(), cluster(), cohesion_score(), Leiden community detection on NetworkX graphs. Splits oversized communities. Ret, Run Leiden community detection. Returns {community_id: [node_ids]}.      Communi, Build a NetworkX graph from graphify node/edge dicts.      Preserves original ed, Run a second Leiden pass on a community subgraph to split it further., Ratio of actual intra-community edges to maximum possible. (+12 more)

### Community 90 - "Community 90"
Cohesion: 0.10
Nodes (16): inferEdgeDashes(), HtmlWriter, safeToHtml(), SafeToHtmlOptions, ToHtmlOptions, communities, dir, edgeLine (+8 more)

### Community 91 - "Community 91"
Cohesion: 0.10
Nodes (16): blocked, captionPath, captionsDir, cleanupDirs, dense, forced, graphifyManifest, input (+8 more)

### Community 92 - "Community 92"
Cohesion: 0.10
Nodes (18): WIKI_DESCRIPTION_PROMPT_VERSION, WIKI_DESCRIPTION_SCHEMA, WikiDescriptionSidecarIndex, article, descriptions, G, generator, communities (+10 more)

### Community 93 - "Community 93"
Cohesion: 0.14
Nodes (19): aliasHit, hit, hits, i18nRecords, ids, index, lower, minimal (+11 more)

### Community 94 - "Community 94"
Cohesion: 0.17
Nodes (20): createDefaultViewerState(), DEFAULT_EVIDENCE_PANEL_STATE, DEFAULT_FACET_STATE, DEFAULT_GRAPH_PANEL_STATE, DEFAULT_SELECTION_STATE, isEvidenceMode(), isFiniteNonNegativeInt(), isGraphAggregation() (+12 more)

### Community 95 - "Community 95"
Cohesion: 0.10
Nodes (18): benchmark, canvas, cleanupDirs, cohesion, communities, detection, dir, G (+10 more)

### Community 96 - "Community 96"
Cohesion: 0.11
Nodes (17): extract(), ExtractionResult, extractWithDiagnostics(), inferCommonRoot(), _mergeSwiftExtensions(), GraphEdge, GraphNode, allEdges (+9 more)

### Community 97 - "Community 97"
Cohesion: 0.14
Nodes (17): buildEntitySidecar(), __dirname, EntitySidecarResponse, __filename, isText(), loadDescriptionIndex(), loadJsonSafe(), MIME_BY_EXT (+9 more)

### Community 98 - "Community 98"
Cohesion: 0.15
Nodes (14): Base, area(), Circle, describe(), Geometry, Point, Shape, LinearAlgebra (+6 more)

### Community 99 - "Community 99"
Cohesion: 0.11
Nodes (10): DecodingError, HTTPError, HTTPStatusError, An error occurred while issuing a request., Decoding of the response failed., A 4xx or 5xx response was received., Base class for all httpx exceptions., RequestError (+2 more)

### Community 100 - "Community 100"
Cohesion: 0.11
Nodes (14): cursorInstall(), replaceOrAppendSection(), dir, original, rule, rulePath, tempDirs, bannedReportFirstPatterns (+6 more)

### Community 101 - "Community 101"
Cohesion: 0.11
Nodes (16): projectUninstallAll(), agentsMd, claudeMd, cwd, hasFiles, hooks, hooksPath, joined (+8 more)

### Community 102 - "Community 102"
Cohesion: 0.14
Nodes (2): ApiClient, ApiClient

### Community 103 - "Community 103"
Cohesion: 0.15
Nodes (14): buildReviewDelta(), changedNodeIds(), clampDepth(), computeAffectedFiles(), dirname(), expandChangedIdsViaBarrels(), highRiskChains(), impactedNodeIds() (+6 more)

### Community 104 - "Community 104"
Cohesion: 0.24
Nodes (17): buildCommunityRows(), buildTypeRows(), CommunityRow, escapeHtml(), HTML_ESCAPE_MAP, nodeType(), recordsFromGraph(), renderAccordionSection() (+9 more)

### Community 105 - "Community 105"
Cohesion: 0.21
Nodes (10): Analyzer, compute_score(), normalize(), Fixture: functions and methods that call each other - for call-graph extraction, run_analysis(), Analyzer, compute_score(), normalize() (+2 more)

### Community 106 - "Community 106"
Cohesion: 0.12
Nodes (10): bound, cleanupDirs, config, errors, first, profile, profilePath, raw (+2 more)

### Community 107 - "Community 107"
Cohesion: 0.32
Nodes (17): addLabelCandidate(), buildResolvableLabelIndex(), ensureParserInit(), extractElixir(), extractGo(), extractJulia(), extractObjc(), extractPowershell() (+9 more)

### Community 108 - "Community 108"
Cohesion: 0.15
Nodes (13): hyperedgeSortKey(), mergeGraphAttributes(), mergeGraphJsonFiles(), MergeGraphJsonResult, readGraph(), ancestor, current, dir (+5 more)

### Community 109 - "Community 109"
Cohesion: 0.18
Nodes (13): cloneRepo(), CloneRepoOptions, CloneRepoResult, defaultCloneDestination(), execGit(), GithubRepoRef, maybeGithubRepo(), repoNameFromUrl() (+5 more)

### Community 110 - "Community 110"
Cohesion: 0.13
Nodes (13): cleanupStaleNodes(), CleanupStaleNodesOptions, CleanupStaleNodesResult, cleanupDirs, dir, formatted, G, graph (+5 more)

### Community 111 - "Community 111"
Cohesion: 0.13
Nodes (14): augmentDetectionWithTranscripts(), buildWhisperPrompt(), cloneDetection(), transcribeAll(), cached, hash, modelDir, outDir (+6 more)

### Community 112 - "Community 112"
Cohesion: 0.12
Nodes (16): candidateHtml, empty, graph, headerIndex, html, populated, readOnlyHtml, skipIndex (+8 more)

### Community 113 - "Community 113"
Cohesion: 0.13
Nodes (11): SemanticPreparationResult, cleanupDirs, config, detection, filtered, fixtureRoot, inputs, paths (+3 more)

### Community 114 - "Community 114"
Cohesion: 0.20
Nodes (12): createGraph(), forEachTraversalNeighbor(), isDirectedGraph(), loadGraphFromData(), serializeGraph(), toUndirectedGraph(), traversalNeighbors(), sanitizeLabel() (+4 more)

### Community 115 - "Community 115"
Cohesion: 0.17
Nodes (13): CONFIDENCE_VALUES, loadHyperedges(), mergeHyperedges(), setHyperedges(), validateHyperedge(), mergedGraphType(), mergeGraphsFromFiles(), MergeGraphsOptions (+5 more)

### Community 116 - "Community 116"
Cohesion: 0.22
Nodes (15): OntologyReconciliationDecisionLogOptions, OntologyReconciliationDecisionLogResponse, getOntologyRebuildStatus(), getOntologyReconciliationCandidate(), listOntologyReconciliationCandidates(), loadReadonlyReconciliationCandidates(), ontologyAppliedPatchesPath(), ontologyNeedsUpdatePath() (+7 more)

### Community 117 - "Community 117"
Cohesion: 0.15
Nodes (15): auditPath, beforeAudit, beforeDecisions, cliOut, cliPreview, fixtureRoot, prepareProject(), queue (+7 more)

### Community 118 - "Community 118"
Cohesion: 0.13
Nodes (14): a, after, b, before, cleared, initial, q, query (+6 more)

### Community 119 - "Community 119"
Cohesion: 0.19
Nodes (13): estimateTokens(), loadGraph(), querySubgraphTokens(), runBenchmark(), BenchmarkOptions, estimateTokens(), loadGraph(), printBenchmark() (+5 more)

### Community 120 - "Community 120"
Cohesion: 0.25
Nodes (14): execGit(), gitRevParse(), resolveFromGitCwd(), resolveGitContext(), safeExecGit(), safeGitRevParse(), execGit(), gitRevParse() (+6 more)

### Community 121 - "Community 121"
Cohesion: 0.22
Nodes (15): agentsUninstall(), antigravityUninstall(), claudeUninstall(), cursorUninstall(), geminiUninstall(), kiroUninstall(), projectUninstall(), removeProjectClaudeMdRegistration() (+7 more)

### Community 122 - "Community 122"
Cohesion: 0.13
Nodes (13): extractJs(), extractPhp(), calls, callTargets, cleanupDirs, demoNode, dir, filePath (+5 more)

### Community 123 - "Community 123"
Cohesion: 0.15
Nodes (11): TextJsonGenerationClient, TextJsonGenerationInput, TextJsonGenerationResult, createGraphifyMesh(), CreateGraphifyMeshOptions, meshTextJsonClient(), MeshTextJsonClientOptions, client (+3 more)

### Community 124 - "Community 124"
Cohesion: 0.14
Nodes (11): NormalizedOntologyProfile, ambiguous, cleanupDirs, extraction, nodes, outputDir, page, profile (+3 more)

### Community 125 - "Community 125"
Cohesion: 0.16
Nodes (11): PdfPreparationArtifact, parsePdfOcrMode(), PdfOcrMode, prepareSemanticDetection(), SemanticPreparationOptions, imagePath, outputDir, packageJson (+3 more)

### Community 126 - "Community 126"
Cohesion: 0.33
Nodes (13): detectUrlType(), downloadBinary(), fetchArxiv(), fetchTweet(), fetchWebpage(), htmlToMarkdown(), ingest(), IngestOptions (+5 more)

### Community 127 - "Community 127"
Cohesion: 0.20
Nodes (14): loadReadonlyReconciliationCandidates(), ontologyAppliedPatchesPath(), ontologyNeedsUpdatePath(), ontologyReconciliationCandidatesPath(), optionalInteger(), optionalNumber(), optionalString(), readableStatePath() (+6 more)

### Community 128 - "Community 128"
Cohesion: 0.27
Nodes (12): communityArticle(), crossCommunityLinks(), flowArticle(), flowsThroughNodes(), godNodeArticle(), indexMd(), normalizeFlows(), renderDescription() (+4 more)

### Community 129 - "Community 129"
Cohesion: 0.21
Nodes (13): bfs(), communityName(), dfs(), findNode(), mcpField(), nodeDisplayLabel(), scoreNodes(), subgraphToText() (+5 more)

### Community 130 - "Community 130"
Cohesion: 0.17
Nodes (11): ast, cached, dir, fresh, input, merged, outPath, runMain() (+3 more)

### Community 131 - "Community 131"
Cohesion: 0.17
Nodes (6): profileValidationResultToJson(), profileValidationResultToMarkdown(), extraction, fixtureRoot, registryExtraction, result

### Community 132 - "Community 132"
Cohesion: 0.17
Nodes (10): toCypher(), cleanupDirs, cypher, dir, graph, graphPath, outputPath, persisted (+2 more)

### Community 133 - "Community 133"
Cohesion: 0.18
Nodes (10): Animal, -initWithName, -speak, Dog, -fetch, Animal, -initWithName, -speak (+2 more)

### Community 134 - "Community 134"
Cohesion: 0.25
Nodes (4): build_graph(), Graph, build_graph(), Graph

### Community 135 - "Community 135"
Cohesion: 0.35
Nodes (10): clearSelection(), createDefaultViewerState(), normalizeViewerState(), openEntity(), selectNode(), setActiveView(), setGroupFilter(), setShowWeakLinks() (+2 more)

### Community 136 - "Community 136"
Cohesion: 0.40
Nodes (11): buildGraphHtml(), htmlScript(), htmlStyles(), hyperedgeScript(), isCommunityLabelOptions(), normalizeCommunityLabels(), normalizeDescriptions(), normalizeMemberCounts() (+3 more)

### Community 137 - "Community 137"
Cohesion: 0.18
Nodes (9): makeExtractionPortable(), DetectionResult, detection, extraction, graphifyDir, portable, result, root (+1 more)

### Community 138 - "Community 138"
Cohesion: 0.20
Nodes (9): home, project, rule, runCliInTemp(), runCliWithEnvironment(), skill, skillPath, tempDirs (+1 more)

### Community 139 - "Community 139"
Cohesion: 0.18
Nodes (10): communities, communityLabels, dir, G, list, long, outPath, result (+2 more)

### Community 140 - "Community 140"
Cohesion: 0.18
Nodes (9): allStale, article, communities, count, formatted, G, LABELS, stale (+1 more)

### Community 141 - "Community 141"
Cohesion: 0.18
Nodes (9): focused, graph, graphJsonShape, html, state, strongOnly, subgraph, tokens (+1 more)

### Community 142 - "Community 142"
Cohesion: 0.20
Nodes (7): batch, G, impact, node, out, store, targets

### Community 143 - "Community 143"
Cohesion: 0.33
Nodes (7): normalizeSearchText(), queryTerms(), scoreSearchText(), textMatchesQuery(), exact, substring, terms

### Community 144 - "Community 144"
Cohesion: 0.20
Nodes (9): centralEnd, centralIdx, graph, graphIdx, html, ids, state, subgraph (+1 more)

### Community 145 - "Community 145"
Cohesion: 0.28
Nodes (6): MyApp.Accounts.User, create(), validate(), MyApp.Accounts.User, create(), validate()

### Community 146 - "Community 146"
Cohesion: 0.22
Nodes (2): ignoredDir, inventory

### Community 147 - "Community 147"
Cohesion: 0.47
Nodes (9): addIssue(), citations(), isProfileEdge(), isRegistrySeed(), stringValue(), validateCitations(), validateEdge(), validateNode() (+1 more)

### Community 148 - "Community 148"
Cohesion: 0.31
Nodes (1): ConnectionPool

### Community 149 - "Community 149"
Cohesion: 0.22
Nodes (6): formatMetric(), reviewAnalysisToText(), reviewEvaluationToText(), analysis, evaluation, text

### Community 150 - "Community 150"
Cohesion: 0.22
Nodes (1): app

### Community 151 - "Community 151"
Cohesion: 0.31
Nodes (7): assertGraphJsonFileSize(), assertGraphJsonSize(), GraphSizeMode, dir, message, missing, path

### Community 152 - "Community 152"
Cohesion: 0.25
Nodes (9): communitiesFromGraph(), createReloadingGraphStore(), getVersion(), GraphFileSignature, loadGraph(), loadGraphSnapshot(), readGraphData(), serve() (+1 more)

### Community 153 - "Community 153"
Cohesion: 0.22
Nodes (8): ALL_SKILL_DOCS, content, DISTRIBUTED_SKILL_DOCS, EXTRACTION_PROMPT_DOCS, INLINE_MERGE_SKILLS, QUERY_WORKFLOW_DOCS, SKILLS, TRIGGER_DESCRIPTION_DOCS

### Community 154 - "Community 154"
Cohesion: 0.25
Nodes (8): commitPrefixForArea(), communityLabel(), dominantCommunity(), groupDraftForFile(), isGraphifyStatePath(), normalizePath(), sourceMatches(), topLevelArea()

### Community 155 - "Community 155"
Cohesion: 0.25
Nodes (3): LifecycleMetadata, commitRecommendationToText(), recommendation

### Community 156 - "Community 156"
Cohesion: 0.43
Nodes (8): _importJs(), loadTsconfigAliases(), normalizeJsImportTarget(), projectRelativeFilePath(), remapFileNodeIds(), resolveJsImportTarget(), resolveJsImportTargetInfo(), toPortablePath()

### Community 157 - "Community 157"
Cohesion: 0.25
Nodes (8): commitPrefixForArea(), communityLabel(), dominantCommunity(), groupDraftForFile(), isGraphifyStatePath(), normalizePath(), sourceMatches(), topLevelArea()

### Community 158 - "Community 158"
Cohesion: 0.29
Nodes (6): firstHopSummaryToText(), graph, makeGraph(), summary, textA, textB

### Community 159 - "Community 159"
Cohesion: 0.25
Nodes (7): downloadAudio(), runCommand(), cleanupDirs, dir, downloadAudioMock, expected, rendered

### Community 160 - "Community 160"
Cohesion: 0.25
Nodes (6): attrs, cleanupDirs, dir, edge, graph, graphPath

### Community 161 - "Community 161"
Cohesion: 0.25
Nodes (6): importsFromBarrel, importsFromTargets, labels, reExports, reExportTagged, targets

### Community 162 - "Community 162"
Cohesion: 0.25
Nodes (7): graph, html, idxControls, idxCounters, idxGraphPanel, state, tokens

### Community 163 - "Community 163"
Cohesion: 0.25
Nodes (6): graph, html, occurrences, panelIdx, slotIdx, tokens

### Community 164 - "Community 164"
Cohesion: 0.25
Nodes (7): dataset, dirty, facets, keys, slices, state, status

### Community 165 - "Community 165"
Cohesion: 0.25
Nodes (7): graph, html, idxChar, idxLoc, idxWork, state, tokens

### Community 166 - "Community 166"
Cohesion: 0.38
Nodes (6): build(), build_from_json(), Merge multiple extraction results into one graph., build(), build_from_json(), Merge multiple extraction results into one graph.

### Community 167 - "Community 167"
Cohesion: 0.29
Nodes (2): Transformer, Transformer

### Community 168 - "Community 168"
Cohesion: 0.29
Nodes (4): dest, root, src, studio

### Community 169 - "Community 169"
Cohesion: 0.29
Nodes (6): backupIfProtected(), todayIso(), b1, b2, backup, dated

### Community 170 - "Community 170"
Cohesion: 0.29
Nodes (6): home, previousCwd, readme, skillPath, tempDirs, versionPath

### Community 171 - "Community 171"
Cohesion: 0.33
Nodes (6): html, render(), sidecar(), watsonMatch, withDescr, without

### Community 172 - "Community 172"
Cohesion: 0.29
Nodes (6): evidenceQuery, html, reconHtml, reconQuery, tokens, workspaceHtml

### Community 173 - "Community 173"
Cohesion: 0.29
Nodes (6): query, restored, state, state0, state1, state2

### Community 174 - "Community 174"
Cohesion: 0.33
Nodes (5): cli, { dirname, join }, entry, result, { spawnSync }

### Community 175 - "Community 175"
Cohesion: 0.47
Nodes (6): buildCommitRecommendation(), groupConfidence(), mergeDrafts(), minConfidence(), stalenessFrom(), uniqueSorted()

### Community 176 - "Community 176"
Cohesion: 0.33
Nodes (3): reviewDeltaToText(), delta, text

### Community 177 - "Community 177"
Cohesion: 0.47
Nodes (6): buildCommitRecommendation(), groupConfidence(), mergeDrafts(), minConfidence(), stalenessFrom(), uniqueSorted()

### Community 178 - "Community 178"
Cohesion: 0.33
Nodes (5): commands, dir, matchers, settings, tempDirs

### Community 179 - "Community 179"
Cohesion: 0.33
Nodes (4): dir, logs, preview, tempDirs

### Community 180 - "Community 180"
Cohesion: 0.33
Nodes (5): markdown, outputDir, pdfPath, tempDirs, tmpDir

### Community 181 - "Community 181"
Cohesion: 0.33
Nodes (4): communitiesIdx, facetsIdx, graph, html

### Community 182 - "Community 182"
Cohesion: 0.70
Nodes (4): fetchEntity(), fetchGraph(), fetchReconciliationCandidates(), getJson()

### Community 183 - "Community 183"
Cohesion: 0.40
Nodes (3): affectedFilesToText(), result, text

### Community 184 - "Community 184"
Cohesion: 0.40
Nodes (4): changelog, lock, pkg, workflow

### Community 185 - "Community 185"
Cohesion: 0.40
Nodes (4): candidateGraph, graph, html, tokens

### Community 186 - "Community 186"
Cohesion: 0.40
Nodes (4): character, dataset, groups, total

### Community 187 - "Community 187"
Cohesion: 0.67
Nodes (3): escapeHtml(), HTML_ESCAPE_MAP, renderInlineMarkdown()

### Community 188 - "Community 188"
Cohesion: 0.50
Nodes (2): delta, G

### Community 189 - "Community 189"
Cohesion: 0.50
Nodes (2): html, tokenLine

### Community 190 - "Community 190"
Cohesion: 0.50
Nodes (3): graph, html, tokens

### Community 191 - "Community 191"
Cohesion: 0.50
Nodes (3): html, state, tokens

### Community 192 - "Community 192"
Cohesion: 0.67
Nodes (3): runCli(), runMain(), runSkillRuntime()

### Community 193 - "Community 193"
Cohesion: 0.67
Nodes (1): html

### Community 194 - "Community 194"
Cohesion: 0.67
Nodes (1): html

### Community 195 - "Community 195"
Cohesion: 1.00
Nodes (1): UnpdfTextResult

### Community 196 - "Community 196"
Cohesion: 1.00
Nodes (2): tempProfileProject(), tempProject()

### Community 197 - "Community 197"
Cohesion: 1.00
Nodes (1): optionalRuntimeDeps

## Knowledge Gaps
- **1594 isolated node(s):** `{ spawnSync }`, `{ dirname, join }`, `entry`, `cli`, `result` (+1589 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 102`** (2 nodes): `ApiClient`, `ApiClient`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 146`** (2 nodes): `ignoredDir`, `inventory`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 148`** (1 nodes): `ConnectionPool`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 150`** (1 nodes): `app`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 167`** (2 nodes): `Transformer`, `Transformer`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 188`** (2 nodes): `delta`, `G`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 189`** (2 nodes): `html`, `tokenLine`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 193`** (1 nodes): `html`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 194`** (1 nodes): `html`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 195`** (1 nodes): `UnpdfTextResult`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 196`** (2 nodes): `tempProfileProject()`, `tempProject()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 197`** (1 nodes): `optionalRuntimeDeps`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createReviewGraphStore()` connect `Community 47` to `Input scope, git, repo clone`, `Community 55`, `Review delta & risk chains`, `Ontology output (wiki, obsidian, etc.)`, `Community 49`, `Review benchmark`, `Review analysis (blast radius, communities)`, `Community 142`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **Why does `OntologyReconciliationCandidate` connect `Community 46` to `Input scope, git, repo clone`, `Community 116`, `Profile discovery/extraction prompts`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **Why does `OntologyReconciliationDecisionLogResponse` connect `Community 116` to `Input scope, git, repo clone`, `Image routing calibration`, `Profile discovery/extraction prompts`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **Are the 39 inferred relationships involving `Response` (e.g. with `Auth` and `BasicAuth`) actually correct?**
  _`Response` has 39 INFERRED edges - model-reasoned connections that need verification._
- **Are the 39 inferred relationships involving `Response` (e.g. with `Auth` and `BasicAuth`) actually correct?**
  _`Response` has 39 INFERRED edges - model-reasoned connections that need verification._
- **Are the 39 inferred relationships involving `Request` (e.g. with `Auth` and `BasicAuth`) actually correct?**
  _`Request` has 39 INFERRED edges - model-reasoned connections that need verification._
- **Are the 39 inferred relationships involving `Request` (e.g. with `Auth` and `BasicAuth`) actually correct?**
  _`Request` has 39 INFERRED edges - model-reasoned connections that need verification._