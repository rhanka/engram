# Graph Report - .  (2026-05-20)

## Corpus Check
- 264 files · ~333,018 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 4168 nodes · 6672 edges · 219 communities detected
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 466 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output


## Input Scope
- Requested: tracked
- Resolved: tracked (source: cli)
- Included files: 264 · Candidates: 284
- Excluded: 0 untracked · 15714 ignored · 4 sensitive · 0 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.

## Graph Freshness
- Built from Git commit: `96ac837`
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

### Community 33 - "Community 33"
Cohesion: 0.11
Nodes (30): GraphInstance, JSON_NOISE_LABELS, nodeCommunityMap(), isFileNode(), isConceptNode(), isJsonKeyNode(), fileCategory(), topLevelDir() (+22 more)

### Community 109 - "Community 109"
Cohesion: 0.23
Nodes (10): estimateTokens(), querySubgraphTokens(), SAMPLE_QUESTIONS, BenchmarkOptions, loadGraph(), runBenchmark(), estimateTokens(), querySubgraphTokens() (+2 more)

### Community 86 - "Community 86"
Cohesion: 0.20
Nodes (14): BuildOptions, normalizeSourceFilePath(), normalizedLabel(), dedupLabelKey(), asRecord(), asString(), sourceKey(), rootForOptions() (+6 more)

### Community 13 - "Community 13"
Cohesion: 0.07
Nodes (43): StatIndexEntry, statIndex, statIndexFile(), ensureStatIndex(), flushStatIndex(), statMtimeNs(), CacheOptions, bodyContent() (+35 more)

### Community 22 - "Community 22"
Cohesion: 0.06
Nodes (25): __filename, __dirname, VERSION, splitFiles(), changedFilesFromGit(), readJson(), isJsonRecord(), loadWikiDescriptionSidecarIndex() (+17 more)

### Community 58 - "Community 58"
Cohesion: 0.16
Nodes (26): writeFileAtomic(), canonicalPlatformName(), runtimeGlobalSkillPlatformName(), platformNamesForError(), resolveGlobalSkillDestination(), previewPath(), emptyPreview(), platformInstallPreview() (+18 more)

### Community 142 - "Community 142"
Cohesion: 0.24
Nodes (10): opencodeConfigPath(), legacyOpencodeConfigPath(), loadOpenCodeConfig(), getAgentsMdSection(), installOpenCodePlugin(), uninstallOpenCodePlugin(), installCodexHook(), uninstallCodexHook() (+2 more)

### Community 154 - "Community 154"
Cohesion: 0.25
Nodes (9): uninstallAll(), uninstallGeminiMcp(), cursorUninstall(), antigravityUninstall(), kiroUninstall(), vscodeUninstall(), uninstallClaudeHook(), claudeUninstall() (+1 more)

### Community 155 - "Community 155"
Cohesion: 0.39
Nodes (7): canonicalizeForPartition(), partition(), splitCommunity(), ClusterOptions, cluster(), cohesionScore(), scoreAll()

### Community 78 - "Community 78"
Cohesion: 0.13
Nodes (13): NumericMapLike, StringMapLike, ReportHighRiskNode, ReportTestGap, ReportReviewOptions, GenerateReportOptions, normalizeFlows(), normalizeAffectedFlows() (+5 more)

### Community 122 - "Community 122"
Cohesion: 0.24
Nodes (9): normalizeCommunityLabel(), readLabelsJson(), readGraphAttributeLabels(), resolveCommunityLabels(), persistCommunityLabels(), cleanupDirs, dir, labelsPath (+1 more)

### Community 54 - "Community 54"
Cohesion: 0.14
Nodes (21): DETECTION_FILE_TYPES, ConfiguredDetectionInputs, ProfileState, ConfiguredDataprepOptions, ConfiguredDataprepResult, uniqueResolved(), fullPageScreenshotExcludes(), buildConfiguredDetectionInputs() (+13 more)

### Community 93 - "Community 93"
Cohesion: 0.16
Nodes (16): uniqueResolved(), fullPageScreenshotExcludes(), buildConfiguredDetectionInputs(), emptyDetection(), warningFor(), recomputeDetection(), mergeScopeInspections(), mergeDetections() (+8 more)

### Community 36 - "Community 36"
Cohesion: 0.06
Nodes (9): ChangedRange, ChangedRangesByFile, ComputeRiskScoreOptions, AnalyzeChangesOptions, DetectChangesNodeRisk, DetectChangesTestGap, DetectChangesResult, DetectChangesMinimalResult (+1 more)

### Community 201 - "Community 201"
Cohesion: 0.60
Nodes (5): uniqueSorted(), sortNodesByLocation(), mapChangesToNodes(), changedNodesFromFiles(), analyzeChanges()

### Community 65 - "Community 65"
Cohesion: 0.10
Nodes (22): CODE_EXTENSIONS, DOC_EXTENSIONS, PAPER_EXTENSIONS, IMAGE_EXTENSIONS, OFFICE_EXTENSIONS, GOOGLE_WORKSPACE_EXTENSIONS, VIDEO_EXTENSIONS, SENSITIVE_PATTERNS (+14 more)

### Community 133 - "Community 133"
Cohesion: 0.22
Nodes (11): isSensitive(), countWords(), isNoiseDir(), matchGlob(), relativeWithin(), matchesIgnorePattern(), isIgnored(), walkDir() (+3 more)

### Community 206 - "Community 206"
Cohesion: 0.67
Nodes (4): officeParseToText(), docxToMarkdown(), xlsxToMarkdown(), convertOfficeFile()

### Community 202 - "Community 202"
Cohesion: 0.50
Nodes (5): md5File(), loadManifest(), normaliseManifestEntry(), saveManifest(), detectIncremental()

### Community 94 - "Community 94"
Cohesion: 0.17
Nodes (13): DirectSemanticFile, DirectSemanticChunk, DirectSemanticExtractionClient, DirectSemanticExtractionOptions, PackSemanticFilesOptions, DirectSemanticClientOptions, toPortableRelative(), estimateFileTokens() (+5 more)

### Community 60 - "Community 60"
Cohesion: 0.10
Nodes (20): BACKUP_ARTIFACTS, todayIso(), backupIfProtected(), COMMUNITY_COLORS, inferNodeShape(), CONFIDENCE_SCORE_DEFAULTS, CommunityLabelsInput, CommunityLabelOptions (+12 more)

### Community 166 - "Community 166"
Cohesion: 0.25
Nodes (8): nodeCommunityMap(), isSvgOptions(), buildFreshnessMetadata(), computeTopologySignatureFromLinks(), computeTopologySignature(), toJson(), toGraphml(), toSvg()

### Community 143 - "Community 143"
Cohesion: 0.24
Nodes (10): isCommunityLabelOptions(), isCanvasOptions(), normalizeCommunityLabels(), normalizeMemberCounts(), normalizeProfile(), htmlStyles(), hyperedgeScript(), htmlScript() (+2 more)

### Community 17 - "Community 17"
Cohesion: 0.05
Nodes (38): SyntaxNode, Tree, moduleRequire, _languageCache, TsconfigAliasEntry, tsconfigAliasCache, TsconfigDocument, stripJsonc() (+30 more)

### Community 104 - "Community 104"
Cohesion: 0.39
Nodes (15): ensureParserInit(), parseText(), resolveGrammarWasm(), loadLanguage(), qualifiedFileStem(), buildResolvableLabelIndex(), _extractPythonRationale(), extractJulia() (+7 more)

### Community 70 - "Community 70"
Cohesion: 0.15
Nodes (22): _makeId(), _readText(), _resolveName(), _importPython(), _importJava(), _importC(), _importCsharp(), _importKotlin() (+14 more)

### Community 134 - "Community 134"
Cohesion: 0.25
Nodes (11): toPortablePath(), inferCommonRoot(), projectRelativeFilePath(), loadTsconfigAliases(), normalizeJsImportTarget(), resolveJsImportTargetInfo(), resolveJsImportTarget(), remapFileNodeIds() (+3 more)

### Community 110 - "Community 110"
Cohesion: 0.15
Nodes (13): _extractGeneric(), extractPython(), extractJs(), extractJava(), extractC(), extractCpp(), extractRuby(), extractCsharp() (+5 more)

### Community 144 - "Community 144"
Cohesion: 0.20
Nodes (10): lineForIndex(), extractRegexBackedCode(), simpleGroovyTypeName(), braceDelta(), extractGroovy(), normalizeSqlObjectName(), sqlStatementBlock(), extractSql() (+2 more)

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (48): DetectEntryPointsOptions, TraceFlowsOptions, BuildFlowArtifactOptions, ReviewFlow, ReviewFlowStep, ReviewFlowDetail, ReviewFlowArtifact, AffectedFlowsResult (+40 more)

### Community 98 - "Community 98"
Cohesion: 0.24
Nodes (14): GitContext, execGit(), safeExecGit(), resolveFromGitCwd(), gitRevParse(), safeGitRevParse(), isSafeGitPath(), resolveGitContext() (+6 more)

### Community 95 - "Community 95"
Cohesion: 0.18
Nodes (13): GOOGLE_WORKSPACE_EXTENSIONS, EXPORT_MIME_TYPE_BY_EXTENSION, GoogleWorkspaceShortcut, GoogleWorkspaceFetcher, ConvertGoogleWorkspaceOptions, extractFileIdFromUrl(), extractResourceKey(), readGoogleShortcut() (+5 more)

### Community 156 - "Community 156"
Cohesion: 0.39
Nodes (8): SerializedGraphData, createGraph(), isDirectedGraph(), loadGraphFromData(), serializeGraph(), toUndirectedGraph(), forEachTraversalNeighbor(), traversalNeighbors()

### Community 41 - "Community 41"
Cohesion: 0.10
Nodes (28): HookDefinition, HOOKS, GRAPH_GITATTR_LINES, installHook(), uninstallHook(), hookBlockRegex(), escapeRegExp(), readTextFile() (+20 more)

### Community 185 - "Community 185"
Cohesion: 0.33
Nodes (3): ToHtmlOptions, HtmlWriter, SafeToHtmlOptions

### Community 190 - "Community 190"
Cohesion: 0.33
Nodes (1): CONFIDENCE_VALUES

### Community 130 - "Community 130"
Cohesion: 0.33
Nodes (10): VALID_DENSITY, VALID_ROUTING_SIGNAL, isRecord(), isStringArray(), validateImageCaption(), validateImageRouting(), isRecord(), isStringArray() (+2 more)

### Community 75 - "Community 75"
Cohesion: 0.14
Nodes (16): ExportImageDataprepBatchRequestsOptions, ExportImageDataprepBatchRequestsResult, ImportImageDataprepBatchResultsOptions, ImportImageDataprepBatchResultsResult, readJsonl(), asRecord(), readCaption(), artifactHasDeepRoute() (+8 more)

### Community 43 - "Community 43"
Cohesion: 0.12
Nodes (26): ImageDataprepSourceKind, ImageDataprepArtifact, ImageDataprepManifest, BuildImageDataprepManifestOptions, RunImageDataprepOptions, RunImageDataprepResult, sha256(), fileHash() (+18 more)

### Community 14 - "Community 14"
Cohesion: 0.07
Nodes (40): ImageRoutingLabel, ImageRoute, ImageRoutingCalibrationDecision, ImageRoutingLabelEntry, ImageRoutingLabelsFile, ImageRoutingRuleBucket, ImageRoutingRulesFile, ImageRoutingSample (+32 more)

### Community 71 - "Community 71"
Cohesion: 0.09
Nodes (18): cleanupDirs, detection, dir, G, communities, cohesion, labels, gods (+10 more)

### Community 106 - "Community 106"
Cohesion: 0.33
Nodes (13): yamlStr(), yamlQuoted(), safeFilename(), detectUrlType(), htmlToMarkdown(), fetchTweet(), fetchWebpage(), fetchArxiv() (+5 more)

### Community 63 - "Community 63"
Cohesion: 0.13
Nodes (21): InspectInputScopeOptions, InputScopeInventory, InputScopeSelection, GitScopeContext, VALID_SCOPE_MODES, toPosixPath(), toRepoRelative(), walkFiles() (+13 more)

### Community 157 - "Community 157"
Cohesion: 0.31
Nodes (9): splitGitLines(), pathspecForPrefix(), resolveGitScopeContext(), makeScope(), countGitPaths(), gitInventory(), buildGitInventory(), fallbackAllScope() (+1 more)

### Community 40 - "Community 40"
Cohesion: 0.12
Nodes (30): WorktreeMetadata, BranchMetadata, LifecycleMetadata, RefreshLifecycleOptions, PruneCandidate, PrunePlan, readJson(), writeJson() (+22 more)

### Community 11 - "Community 11"
Cohesion: 0.05
Nodes (34): LlmExecutionCapability, LlmExecutionMode, DirectLlmProvider, DIRECT_LLM_PROVIDERS, TextJsonGenerationInput, VisionJsonAnalysisInput, BatchVisionExportInput, BatchVisionImportInput (+26 more)

### Community 123 - "Community 123"
Cohesion: 0.17
Nodes (6): CreateGraphifyMeshOptions, MeshTextJsonClientOptions, tempDirs, dir, mesh, client

### Community 176 - "Community 176"
Cohesion: 0.43
Nodes (5): MergeGraphJsonResult, readGraph(), hyperedgeSortKey(), mergeGraphAttributes(), mergeGraphJsonFiles()

### Community 167 - "Community 167"
Cohesion: 0.36
Nodes (6): MergeGraphsOptions, MergeGraphsResult, mergedGraphType(), mergeHyperedgesFromGraphs(), mergeGraphsFromFiles(), mergeHyperedges()

### Community 64 - "Community 64"
Cohesion: 0.13
Nodes (21): MigrationAction, MigrationEntryType, MigrationEntry, MigrationGitAdvice, GraphifyOutMigrationPlan, GraphifyOutMigrationResult, MigrationOptions, shellQuote() (+13 more)

### Community 79 - "Community 79"
Cohesion: 0.15
Nodes (15): MinimalContextRisk, BuildMinimalContextOptions, MinimalContextResult, uniqueSorted(), riskFromScore(), suggestionsForTask(), topCommunities(), topFlowNames() (+7 more)

### Community 37 - "Community 37"
Cohesion: 0.09
Nodes (30): OntologyDiscoveryProposalKind, OntologyDiscoveryProposalAction, OntologyDiscoverySampleOptions, OntologyDiscoverySampleFile, OntologyDiscoverySampleRegistryRecord, OntologyDiscoverySample, OntologyDiscoveryProposal, OntologyDiscoveryProposalsFile (+22 more)

### Community 15 - "Community 15"
Cohesion: 0.06
Nodes (33): OntologyOutputConfig, CompileOntologyOutputsOptions, CompileOntologyOutputsResult, CompiledNode, CompiledRelation, sha256(), stringValue(), ontologyNodeType() (+25 more)

### Community 158 - "Community 158"
Cohesion: 0.42
Nodes (7): ProfilePatchRuntimeContext, readJson(), optionalJson(), stringValue(), evidenceRefsFromSources(), loadProfilePatchRuntimeContext(), loadOntologyPatchContext()

### Community 45 - "Community 45"
Cohesion: 0.09
Nodes (28): ONTOLOGY_RECONCILIATION_DECISION_LOG_SCHEMA, OntologyPatchOperation, OntologyPatchStatus, OntologyPatch, OntologyPatchNode, OntologyPatchRelation, OntologyPatchContext, OntologyPatchIssue (+20 more)

### Community 145 - "Community 145"
Cohesion: 0.42
Nodes (10): nonEmptyString(), addError(), nodeType(), nodeById(), relationById(), statusTransitionAllowed(), validateAcceptMatch(), validateSetStatus() (+2 more)

### Community 146 - "Community 146"
Cohesion: 0.24
Nodes (10): stringArray(), addWarning(), knownEvidenceRefs(), validateEvidenceRefs(), normalizeOntologyPatch(), validateOntologyPatch(), appendJsonLine(), auditPath() (+2 more)

### Community 16 - "Community 16"
Cohesion: 0.10
Nodes (43): DEFAULT_STATUSES, VALID_CITATION_MINIMUMS, VIS_JS_SHAPE_LIST, VIS_JS_SHAPES, asRecord(), asStringArray(), normalizeStringMap(), stableForHash() (+35 more)

### Community 124 - "Community 124"
Cohesion: 0.33
Nodes (11): OntologyRebuildStatusResponse, readableStatePath(), ontologyReconciliationCandidatesPath(), ontologyAppliedPatchesPath(), ontologyNeedsUpdatePath(), loadReadonlyReconciliationCandidates(), reconciliationQueueIsStale(), listOntologyReconciliationCandidates() (+3 more)

### Community 66 - "Community 66"
Cohesion: 0.13
Nodes (20): ONTOLOGY_RECONCILIATION_CANDIDATES_SCHEMA, ONTOLOGY_RECONCILIATION_CANDIDATES_RESPONSE_SCHEMA, OntologyReconciliationCandidateKind, OntologyReconciliationCandidateStatus, OntologyReconciliationCandidate, OntologyReconciliationCandidateQueue, OntologyReconciliationCandidateFilter, OntologyReconciliationCandidatesResponse (+12 more)

### Community 61 - "Community 61"
Cohesion: 0.13
Nodes (19): LOOPBACK_HOSTS, OntologyStudioWriteOptions, OntologyStudioHandlerOptions, StartOntologyStudioServerOptions, StartedOntologyStudioServer, OntologyStudioRouteResult, optionalString(), optionalNumber() (+11 more)

### Community 69 - "Community 69"
Cohesion: 0.15
Nodes (21): GraphifyPathOptions, GraphifyScratchPaths, GraphifyLegacyRootScratchPaths, GraphifyProfilePaths, GraphifyImageDataprepPaths, GraphifyOntologyOutputPaths, GraphifyPaths, statePath() (+13 more)

### Community 52 - "Community 52"
Cohesion: 0.13
Nodes (26): PDF_IMAGE_EXTENSIONS, PdfPreparationArtifact, PdfPreparationOptions, MistralOcrModule, cloneDetection(), countWords(), metadataPath(), listImageArtifacts() (+18 more)

### Community 46 - "Community 46"
Cohesion: 0.12
Nodes (23): PdfOcrMode, PdfTextLayerProvider, PdfPreflightOptions, PdfPreflightResult, PdfTextLayerResult, UnpdfTextResult, normalizeText(), countWords() (+15 more)

### Community 81 - "Community 81"
Cohesion: 0.13
Nodes (15): BuildProjectOptions, BuildProjectWarning, BuildProjectArtifacts, BuildProjectResult, countNonCodeFiles(), formatDiagnosticSummary(), fileList(), buildProject() (+7 more)

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (49): PortablePathIssueKind, PortablePathIssue, PortableCheckResult, LOCAL_LIFECYCLE_FILES, LOCAL_LIFECYCLE_PREFIXES, TEXT_ARTIFACT_EXTENSIONS, isWindowsAbsolutePath(), hasSchemePrefix() (+41 more)

### Community 32 - "Community 32"
Cohesion: 0.10
Nodes (33): ProfilePromptState, ProfilePromptOptions, ProfilePromptChunk, sampleLimit(), nodeTypeSection(), relationTypeSection(), relationMetadataSection(), registrySection() (+25 more)

### Community 100 - "Community 100"
Cohesion: 0.19
Nodes (12): readRegistryRows(), field(), normalizeRegistryRecord(), loadProfileRegistry(), safeIdPart(), registryRecordsToExtraction(), readRegistryRows(), field() (+4 more)

### Community 24 - "Community 24"
Cohesion: 0.10
Nodes (34): ProfileReportGraphData, ProfileReportPdfArtifact, ProfileReportContext, rel(), stringValue(), graphNodes(), graphLinks(), projectConfigSection() (+26 more)

### Community 12 - "Community 12"
Cohesion: 0.09
Nodes (32): ProfileValidationSeverity, ProfileValidationIssue, ProfileValidationContext, ProfileValidationResult, stringValue(), stringArray(), citations(), addIssue() (+24 more)

### Community 57 - "Community 57"
Cohesion: 0.14
Nodes (23): CONFIG_CANDIDATES, VALID_PDF_OCR_MODES, VALID_CITATION_MINIMUMS, VALID_LLM_EXECUTION_MODES, VALID_IMAGE_ARTIFACT_SOURCES, VALID_INPUT_SCOPE_MODES, asRecord(), asStringArray() (+15 more)

### Community 20 - "Community 20"
Cohesion: 0.06
Nodes (23): CommitRecommendationConfidence, CommitRecommendationStaleness, CommitRecommendationGroup, CommitRecommendation, CommitRecommendationOptions, FileGraphInfo, GroupDraft, normalizePath() (+15 more)

### Community 191 - "Community 191"
Cohesion: 0.47
Nodes (6): uniqueSorted(), mergeDrafts(), stalenessFrom(), minConfidence(), groupConfidence(), buildCommitRecommendation()

### Community 87 - "Community 87"
Cohesion: 0.17
Nodes (13): CloneRepoOptions, CloneRepoResult, GithubRepoRef, execGit(), maybeGithubRepo(), repoNameFromUrl(), defaultCloneDestination(), cloneRepo() (+5 more)

### Community 47 - "Community 47"
Cohesion: 0.07
Nodes (11): ReviewRiskLevel, ReviewBlastRadius, ReviewImpactedCommunity, ReviewMultimodalSafety, ReviewAnalysis, ReviewAnalysisOptions, ReviewEvaluationCase, ReviewEvaluationCaseResult (+3 more)

### Community 168 - "Community 168"
Cohesion: 0.25
Nodes (8): uniqueSorted(), riskLevel(), communityRisk(), nodeCommunities(), buildBlastRadius(), impactedCommunities(), multimodalSafety(), buildReviewAnalysis()

### Community 214 - "Community 214"
Cohesion: 1.00
Nodes (2): average(), evaluateReviewAnalysis()

### Community 215 - "Community 215"
Cohesion: 1.00
Nodes (2): formatMetric(), reviewEvaluationToText()

### Community 10 - "Community 10"
Cohesion: 0.06
Nodes (39): ReviewBenchmarkCase, ReviewBenchmarkOptions, ReviewBenchmarkTokenBudgetStatus, ReviewBenchmarkMetrics, ReviewBenchmarkCaseResult, ReviewBenchmarkResult, normalize(), uniqueSorted() (+31 more)

### Community 4 - "Community 4"
Cohesion: 0.05
Nodes (52): ReviewContextDetailLevel, ReviewContextRisk, BuildReviewContextOptions, ReviewContextPayload, ReviewContextResult, normalizePath(), uniqueSorted(), sourceMatches() (+44 more)

### Community 77 - "Community 77"
Cohesion: 0.13
Nodes (16): ReviewGraphNodeKind, ReviewGraphNode, ReviewGraphEdge, ReviewImpactRadius, ReviewGraphStats, ReviewGraphStoreLike, KNOWN_KINDS, normalizePath() (+8 more)

### Community 6 - "Community 6"
Cohesion: 0.05
Nodes (38): ReviewNode, ReviewChain, ReviewDelta, ReviewDeltaOptions, compareStrings(), normalizePath(), uniqueSorted(), maybeCommunity() (+30 more)

### Community 169 - "Community 169"
Cohesion: 0.32
Nodes (6): normalizeSearchText(), textMatchesQuery(), scoreSearchText(), terms, exact, substring

### Community 111 - "Community 111"
Cohesion: 0.22
Nodes (8): ALLOWED_SCHEMES, BLOCKED_HOSTS, validateUrl(), isPrivateIp(), validateHostname(), isRedirectStatus(), safeFetch(), safeFetchText()

### Community 121 - "Community 121"
Cohesion: 0.17
Nodes (8): SemanticPreparationOptions, SemanticPreparationResult, { unpdfExtractTextMock, unpdfGetDocMock, convertPdfMock, spawnSyncMock }, tempDirs, imagePath, packageJson, packageLock, outputDir

### Community 48 - "Community 48"
Cohesion: 0.09
Nodes (16): ServeOptions, McpToolDefinition, McpResourceDefinition, GraphSnapshot, ReloadingGraphStore, MCP_RESOURCES, graphPath, loadGraph() (+8 more)

### Community 159 - "Community 159"
Cohesion: 0.25
Nodes (9): GraphFileSignature, validateGraphFilePath(), readGraphData(), loadGraphSnapshot(), createReloadingGraphStore(), getVersion(), communitiesFromGraph(), serve() (+1 more)

### Community 112 - "Community 112"
Cohesion: 0.21
Nodes (13): communityName(), mcpField(), nodeDisplayLabel(), scoreNodes(), bfs(), dfs(), subgraphToText(), findNode() (+5 more)

### Community 177 - "Community 177"
Cohesion: 0.29
Nodes (7): toolGodNodes(), toolGraphStats(), communityLabelsFromGraph(), resourceConfidenceAudit(), resourceSurprises(), resourceQuestions(), readMcpResource()

### Community 179 - "Community 179"
Cohesion: 0.33
Nodes (7): optionalString(), optionalNumber(), optionalInteger(), reconciliationCandidateFilters(), toolGetReconciliationCandidate(), toolPreviewOntologyDecisionLog(), ontologyAppliedPatchesPath()

### Community 178 - "Community 178"
Cohesion: 0.43
Nodes (7): toolListReconciliationCandidates(), toolOntologyRebuildStatus(), readableStatePath(), ontologyReconciliationCandidatesPath(), ontologyNeedsUpdatePath(), loadReadonlyReconciliationCandidates(), reconciliationQueueIsStale()

### Community 125 - "Community 125"
Cohesion: 0.17
Nodes (7): tempDirs, bannedReportFirstPatterns, paths, dir, claudeSettings, old, updated

### Community 42 - "Community 42"
Cohesion: 0.10
Nodes (22): __filename, __dirname, AnalysisFile, readJson(), writeJson(), scopeOptionDescription(), cacheOptionsFromRuntime(), ProfileRuntimeContext (+14 more)

### Community 28 - "Community 28"
Cohesion: 0.08
Nodes (31): FirstHopHub, FirstHopCommunity, FirstHopSummary, FirstHopSummaryOptions, compareStrings(), round(), maybeCommunity(), communityLabels() (+23 more)

### Community 30 - "Community 30"
Cohesion: 0.09
Nodes (35): URL_PREFIXES, CACHED_AUDIO_EXTENSIONS, REQUIRED_MODEL_FILES, SUPPORTED_MODELS, MODEL_ALIASES, FasterWhisperSegment, FasterWhisperTranscriptionOptions, FasterWhisperModel (+27 more)

### Community 180 - "Community 180"
Cohesion: 0.33
Nodes (4): RenderTreeOptions, TreeNeighbor, nodeLabel(), renderTree()

### Community 1 - "Community 1"
Cohesion: 0.02
Nodes (82): FileType, Confidence, GraphifyInputScopeMode, GraphifyResolvedInputScopeMode, InputScopeSource, InputScopeInspection, GraphNode, GraphEdge (+74 more)

### Community 216 - "Community 216"
Cohesion: 1.00
Nodes (1): UnpdfTextResult

### Community 160 - "Community 160"
Cohesion: 0.25
Nodes (7): VALID_FILE_TYPES, VALID_CONFIDENCES, REQUIRED_NODE_FIELDS, REQUIRED_EDGE_FIELDS, validateExtraction(), assertValid(), errors

### Community 113 - "Community 113"
Cohesion: 0.21
Nodes (9): WATCHED_EXTENSIONS, mergeHyperedges(), builtFromCommit(), rebuildCode(), CheckUpdateResult, checkUpdate(), rebuildLockPath(), acquireRebuildLock() (+1 more)

### Community 161 - "Community 161"
Cohesion: 0.22
Nodes (4): WIKI_DESCRIPTION_BATCH_SCHEMA, BuildWikiDescriptionBatchOptions, WikiDescriptionBatchResultRecord, ParseWikiDescriptionBatchOptions

### Community 29 - "Community 29"
Cohesion: 0.09
Nodes (36): RawNode, RawCommunity, WikiDescriptionTargetContext, WikiDescriptionNeighbor, CollectWikiDescriptionTargetsOptions, WikiDescriptionTargetCollection, BuildWikiDescriptionPromptOptions, GenerateWikiDescriptionSidecarsClients (+28 more)

### Community 35 - "Community 35"
Cohesion: 0.08
Nodes (32): WIKI_DESCRIPTION_SCHEMA, WIKI_DESCRIPTION_PROMPT_VERSION, WikiDescriptionTargetKind, WikiDescriptionStatus, WikiDescriptionExecutionMode, WikiDescriptionEvidenceRef, WikiDescriptionGenerator, WikiDescriptionCacheKeyInput (+24 more)

### Community 107 - "Community 107"
Cohesion: 0.27
Nodes (12): WikiPageRef, safeFilename(), uniquePageRefs(), normalizeFlows(), flowsThroughNodes(), crossCommunityLinks(), renderDescription(), communityArticle() (+4 more)

### Community 18 - "Community 18"
Cohesion: 0.08
Nodes (38): RenderGraphPanelOptions, HTML_ESCAPE_MAP, escapeHtml(), escapeUrl(), modeLabel(), renderMetricsCard(), renderViewerSurface(), renderGraphPanel() (+30 more)

### Community 26 - "Community 26"
Cohesion: 0.05
Nodes (33): graph, graphJsonShape, focused, strongOnly, withWeak, state, subgraph, tokens (+25 more)

### Community 192 - "Community 192"
Cohesion: 0.47
Nodes (5): RenderWorkspaceShellOptions, HTML_ESCAPE_MAP, escapeHtml(), shellStyles(), renderWorkspaceShell()

### Community 117 - "Community 117"
Cohesion: 0.26
Nodes (11): qn(), addFunction(), addCall(), makeFlowStore(), { artifact, store, ids }, result, { artifact, store }, qn() (+3 more)

### Community 170 - "Community 170"
Cohesion: 0.25
Nodes (7): tempDirs, section, dir, agents, home, skillPath, skill

### Community 108 - "Community 108"
Cohesion: 0.14
Nodes (12): G, gods, labels, godIds, communities, surprises, first, second (+4 more)

### Community 207 - "Community 207"
Cohesion: 0.50
Nodes (3): backup, b1, b2

### Community 171 - "Community 171"
Cohesion: 0.25
Nodes (6): cleanupDirs, dir, graphPath, graph, edge, attrs

### Community 147 - "Community 147"
Cohesion: 0.20
Nodes (9): SAMPLE_EXTRACTION, G, edge, attrs, ext, hyper, hyperedges, ext1 (+1 more)

### Community 193 - "Community 193"
Cohesion: 0.33
Nodes (5): tempDirs, dir, settings, commands, matchers

### Community 0 - "Community 0"
Cohesion: 0.02
Nodes (79): tempDirs, dir, graphPath, graphDir, output, source, destRoot, dest (+71 more)

### Community 217 - "Community 217"
Cohesion: 1.00
Nodes (2): tempProject(), tempProfileProject()

### Community 208 - "Community 208"
Cohesion: 0.67
Nodes (3): runCli(), runSkillRuntime(), runMain()

### Community 72 - "Community 72"
Cohesion: 0.09
Nodes (18): tempDirs, dir, skillDir, configOut, profileOut, statePath, extractionPath, reportPath (+10 more)

### Community 88 - "Community 88"
Cohesion: 0.12
Nodes (15): G, result, allNodes, sizes, louvainMock, partition, nodes, first (+7 more)

### Community 172 - "Community 172"
Cohesion: 0.25
Nodes (7): tempDirs, section, skill, readme, dir, hooks, commands

### Community 97 - "Community 97"
Cohesion: 0.13
Nodes (10): cleanupDirs, fixtureRoot, root, config, inputs, detection, filtered, paths (+2 more)

### Community 181 - "Community 181"
Cohesion: 0.29
Nodes (6): tempDirs, home, previousCwd, skillPath, versionPath, readme

### Community 194 - "Community 194"
Cohesion: 0.33
Nodes (5): tempDirs, dir, rule, rulePath, original

### Community 62 - "Community 62"
Cohesion: 0.09
Nodes (21): qn(), addNode(), parsed, G, funcA, funcB, store, nodes (+13 more)

### Community 89 - "Community 89"
Cohesion: 0.12
Nodes (16): codeExts, result, sourceDir, subDir, repoDir, packagesDir, inventory, filePath (+8 more)

### Community 203 - "Community 203"
Cohesion: 0.40
Nodes (4): root, files, chunks, client

### Community 135 - "Community 135"
Cohesion: 0.18
Nodes (9): PROVIDERS, providerSelection, tempDirs, tempDir, outputPath, client, output, audit (+1 more)

### Community 136 - "Community 136"
Cohesion: 0.18
Nodes (9): cleanupDirs, dir, graphPath, warnings, graph, written, persisted, outputPath (+1 more)

### Community 137 - "Community 137"
Cohesion: 0.18
Nodes (10): cleanupDirs, dir, filePath, calls, importEdge, demoNode, callTargets, runNode (+2 more)

### Community 31 - "Community 31"
Cohesion: 0.09
Nodes (15): validate(), process(), main(), HttpClient, Server, NewServer(), validate(), process() (+7 more)

### Community 39 - "Community 39"
Cohesion: 0.08
Nodes (12): DataProcessor, Processor, GraphifyDemo, IProcessor, DataProcessor, Processor, Get-Data(), Process-Items() (+4 more)

### Community 82 - "Community 82"
Cohesion: 0.14
Nodes (2): ApiClient, ApiClient

### Community 174 - "Community 174"
Cohesion: 0.29
Nodes (2): Transformer, Transformer

### Community 129 - "Community 129"
Cohesion: 0.25
Nodes (4): Graph, build_graph(), Graph, build_graph()

### Community 83 - "Community 83"
Cohesion: 0.21
Nodes (10): compute_score(), normalize(), run_analysis(), Analyzer, Fixture: functions and methods that call each other - for call-graph extraction, compute_score(), normalize(), run_analysis() (+2 more)

### Community 25 - "Community 25"
Cohesion: 0.05
Nodes (34): tempDirs, qn(), addFunction(), G, entry, helper, caller, decorated (+26 more)

### Community 182 - "Community 182"
Cohesion: 0.29
Nodes (6): tempDirs, dir, geminiMd, settings, skill, readme

### Community 114 - "Community 114"
Cohesion: 0.15
Nodes (9): tempDirs, googleEnvKeys, previousEnv, dir, stub, shortcut, fetcher, rendered (+1 more)

### Community 55 - "Community 55"
Cohesion: 0.08
Nodes (21): OntologyWriteFixture, tempDirs, dir, token, fixture, { body, headers }, json, fixedToken (+13 more)

### Community 115 - "Community 115"
Cohesion: 0.15
Nodes (10): dir, htmlPath, warnings, G, communities, result, html, profile (+2 more)

### Community 67 - "Community 67"
Cohesion: 0.09
Nodes (21): { confidence_score: _ignored, ...rest }, { id: _ignored, ...rest }, graph, h, items, serialized, reloaded, result (+13 more)

### Community 76 - "Community 76"
Cohesion: 0.10
Nodes (16): cleanupDirs, root, out, result, line, input, outputDir, captionsDir (+8 more)

### Community 91 - "Community 91"
Cohesion: 0.13
Nodes (11): cleanupDirs, root, image, config, result, directImage, cropDir, cropImage (+3 more)

### Community 99 - "Community 99"
Cohesion: 0.13
Nodes (12): cleanupDirs, root, labelsPath, rulesPath, route, result, missing, ambiguous (+4 more)

### Community 195 - "Community 195"
Cohesion: 0.33
Nodes (5): cleanupDirs, downloadAudioMock, dir, expected, rendered

### Community 152 - "Community 152"
Cohesion: 0.22
Nodes (2): inventory, ignoredDir

### Community 196 - "Community 196"
Cohesion: 0.33
Nodes (4): tempDirs, preview, dir, logs

### Community 8 - "Community 8"
Cohesion: 0.04
Nodes (51): files, worktreeRoot, labels, relations, fileNodes, importEdge, pageNode, widgetNode (+43 more)

### Community 183 - "Community 183"
Cohesion: 0.29
Nodes (6): head, metadata, stale, analyzed, worktreeDir, plan

### Community 92 - "Community 92"
Cohesion: 0.13
Nodes (13): generateTextMock, openaiMock, anthropicMock, googleMock, mistralMock, cohereMock, cleanupDirs, root (+5 more)

### Community 148 - "Community 148"
Cohesion: 0.20
Nodes (8): tempDirs, dir, ancestor, current, other, result, merged, tooManyNodes

### Community 153 - "Community 153"
Cohesion: 0.22
Nodes (4): cleanupDirs, root, result, text

### Community 118 - "Community 118"
Cohesion: 0.26
Nodes (11): qn(), addFunction(), addCall(), makeStore(), { store }, result, { store, flows }, qn() (+3 more)

### Community 197 - "Community 197"
Cohesion: 0.33
Nodes (5): tempDirs, tmpDir, pdfPath, outputDir, markdown

### Community 149 - "Community 149"
Cohesion: 0.22
Nodes (9): fixtureRoot, semanticDetection(), discoveryContext(), sample, repeat, context, proposals, diff (+1 more)

### Community 96 - "Community 96"
Cohesion: 0.15
Nodes (15): tempDirs, fixtureRoot, tempProfileProject(), runCli(), runSkillRuntime(), runMain(), prepareProject(), cliOut (+7 more)

### Community 73 - "Community 73"
Cohesion: 0.09
Nodes (18): cleanupDirs, profile, root, valid, invalid, context, badStatus, badRelation (+10 more)

### Community 84 - "Community 84"
Cohesion: 0.12
Nodes (10): cleanupDirs, root, profilePath, profile, raw, errors, config, bound (+2 more)

### Community 138 - "Community 138"
Cohesion: 0.18
Nodes (9): profile, dir, path, queue, loaded, response, filters, first (+1 more)

### Community 198 - "Community 198"
Cohesion: 0.33
Nodes (5): tempDirs, dir, plugin, config, previousCwd

### Community 209 - "Community 209"
Cohesion: 0.67
Nodes (2): root, paths

### Community 68 - "Community 68"
Cohesion: 0.09
Nodes (22): FIXTURES_DIR, TMP_OUT, result, exts, raw, errors, realErrors, allClustered (+14 more)

### Community 139 - "Community 139"
Cohesion: 0.20
Nodes (9): tempDirs, runCliInTemp(), runCliWithEnvironment(), rule, workflow, home, project, skill (+1 more)

### Community 85 - "Community 85"
Cohesion: 0.12
Nodes (14): tempDirs, fixtureRoot, root, prompt, semanticExtraction, extraction, profileValidation, graph (+6 more)

### Community 131 - "Community 131"
Cohesion: 0.18
Nodes (8): fixtureRoot, prompt, state, documentPrompt, imagePrompt, extraction, sample, profile

### Community 101 - "Community 101"
Cohesion: 0.13
Nodes (12): cleanupDirs, root, config, profile, registries, jsonPath, yamlPath, components (+4 more)

### Community 105 - "Community 105"
Cohesion: 0.14
Nodes (9): cleanupDirs, root, result, configDir, configPath, loaded, raw, errors (+1 more)

### Community 187 - "Community 187"
Cohesion: 0.33
Nodes (1): recommendation

### Community 204 - "Community 204"
Cohesion: 0.40
Nodes (4): pkg, lock, changelog, workflow

### Community 140 - "Community 140"
Cohesion: 0.18
Nodes (10): G, communities, cohesion, labels, gods, surprises, detection, report (+2 more)

### Community 188 - "Community 188"
Cohesion: 0.33
Nodes (3): analysis, text, evaluation

### Community 141 - "Community 141"
Cohesion: 0.20
Nodes (7): store, node, impact, targets, G, out, batch

### Community 205 - "Community 205"
Cohesion: 0.40
Nodes (4): long, tmpDir, graphifyOut, result

### Community 2 - "Community 2"
Cohesion: 0.03
Nodes (58): tempDirs, tsRoot, graphifyOutRoot, cliPath, packageVersion, dir, graphPath, [clientTransport, serverTransport] (+50 more)

### Community 210 - "Community 210"
Cohesion: 0.67
Nodes (3): writeFixtureGraph(), writeOntologyPatchFixture(), writeOntologyReconciliationFixture()

### Community 184 - "Community 184"
Cohesion: 0.29
Nodes (6): SKILLS, ALL_SKILL_DOCS, EXTRACTION_PROMPT_DOCS, DISTRIBUTED_SKILL_DOCS, TRIGGER_DESCRIPTION_DOCS, content

### Community 116 - "Community 116"
Cohesion: 0.15
Nodes (10): { WhisperModelMock, freeMock, transcribeMock }, tempDirs, spawnSyncMock, hash, cached, video, outDir, modelDir (+2 more)

### Community 199 - "Community 199"
Cohesion: 0.33
Nodes (4): tempDirs, dir, lockPath, contents

### Community 90 - "Community 90"
Cohesion: 0.13
Nodes (15): tempDirs, dir, mkGraph(), graph, communities, targets, outputPath, exportInput (+7 more)

### Community 49 - "Community 49"
Cohesion: 0.07
Nodes (24): tempDirs, mkGraph(), graph, communities, targets, prompt, outputDir, persistedSidecar (+16 more)

### Community 126 - "Community 126"
Cohesion: 0.17
Nodes (10): generator, base, cache_key, sidecar, result, fresh, stale, communityBase (+2 more)

### Community 127 - "Community 127"
Cohesion: 0.17
Nodes (11): G, communities, labels, count, index, flows, generator, descriptions (+3 more)

### Community 218 - "Community 218"
Cohesion: 1.00
Nodes (1): optionalRuntimeDeps

### Community 7 - "Community 7"
Cohesion: 0.06
Nodes (50): handle_upload(), handle_get(), handle_delete(), handle_list(), handle_search(), handle_enrich(), API module - exposes the document pipeline over HTTP. Thin layer over parser, va, Accept a list of file paths, run the full pipeline on each,     and return a sum (+42 more)

### Community 51 - "Community 51"
Cohesion: 0.10
Nodes (26): parse_file(), parse_markdown(), parse_json(), parse_plaintext(), parse_and_save(), batch_parse(), Parser module - reads raw input documents and converts them into a structured fo, Read a file from disk and return a structured document. (+18 more)

### Community 53 - "Community 53"
Cohesion: 0.10
Nodes (26): normalize_text(), extract_keywords(), enrich_document(), find_cross_references(), process_and_save(), reprocess_all(), Processor module - transforms validated documents into enriched records ready fo, Lowercase, strip extra whitespace, remove control characters. (+18 more)

### Community 34 - "Community 34"
Cohesion: 0.11
Nodes (32): _ensure_storage(), load_index(), save_index(), save_parsed(), save_processed(), load_record(), delete_record(), list_records() (+24 more)

### Community 27 - "Community 27"
Cohesion: 0.07
Nodes (35): Exception, CookieConflict, httpx-like exception hierarchy. All exceptions inherit from HTTPError at the top, Attempted to look up a cookie by name but multiple cookies exist., HTTPError, RequestError, ConnectTimeout, ReadTimeout (+27 more)

### Community 59 - "Community 59"
Cohesion: 0.11
Nodes (12): BearerAuth, DigestAuth, NetRCAuth, Authentication handlers. Auth objects are callables that modify a request before, Modify the request. May yield to inspect the response., HTTP Basic Authentication., Bearer token authentication., HTTP Digest Authentication.     Requires a full request/response cycle: sends th (+4 more)

### Community 44 - "Community 44"
Cohesion: 0.16
Nodes (15): Auth, BasicAuth, Base class for all authentication handlers., Timeout, Limits, BaseClient, The main Client and AsyncClient classes. BaseClient holds all shared logic. Clie, Shared implementation for Client and AsyncClient.     Handles auth, redirects, c (+7 more)

### Community 103 - "Community 103"
Cohesion: 0.15
Nodes (1): AsyncClient

### Community 120 - "Community 120"
Cohesion: 0.18
Nodes (1): Client

### Community 175 - "Community 175"
Cohesion: 0.29
Nodes (6): HTTPError, RequestError, DecodingError, Base class for all httpx exceptions., An error occurred while issuing a request., Decoding of the response failed.

### Community 19 - "Community 19"
Cohesion: 0.10
Nodes (30): TransportError, TimeoutException, ConnectTimeout, ReadTimeout, WriteTimeout, PoolTimeout, ConnectError, ProxyError (+22 more)

### Community 164 - "Community 164"
Cohesion: 0.25
Nodes (8): NetworkError, ReadError, WriteError, CloseError, A network error occurred., Failed to receive data from the network., Failed to send data through the network., Failed to close a connection.

### Community 56 - "Community 56"
Cohesion: 0.09
Nodes (6): HTTPStatusError, A 4xx or 5xx response was received., URL, Headers, Core data models: URL, Headers, Cookies, Request, Response. These are the centra, Core data models: URL, Headers, Cookies, Request, Response. These are the centra

### Community 132 - "Community 132"
Cohesion: 0.27
Nodes (2): ConnectionPool, HTTPTransport

### Community 23 - "Community 23"
Cohesion: 0.07
Nodes (35): primitive_value_to_str(), normalize_header_key(), flatten_queryparams(), parse_content_type(), obfuscate_sensitive_headers(), unset_all_cookies(), is_known_encoding(), build_url_with_params() (+27 more)

### Community 9 - "Community 9"
Cohesion: 0.07
Nodes (48): _node_community_map(), _is_file_node(), god_nodes(), surprising_connections(), _is_concept_node(), _file_category(), _top_level_dir(), _surprise_score() (+40 more)

### Community 173 - "Community 173"
Cohesion: 0.38
Nodes (6): build_from_json(), build(), Merge multiple extraction results into one graph., build_from_json(), build(), Merge multiple extraction results into one graph.

### Community 74 - "Community 74"
Cohesion: 0.11
Nodes (20): build_graph(), cluster(), _split_community(), cohesion_score(), score_all(), Leiden community detection on NetworkX graphs. Splits oversized communities. Ret, Build a NetworkX graph from graphify node/edge dicts.      Preserves original ed, Run Leiden community detection. Returns {community_id: [node_ids]}.      Communi (+12 more)

### Community 200 - "Community 200"
Cohesion: 0.60
Nodes (5): uniqueSorted(), sortNodesByLocation(), mapChangesToNodes(), changedNodesFromFiles(), analyzeChanges()

### Community 151 - "Community 151"
Cohesion: 0.31
Nodes (9): splitGitLines(), pathspecForPrefix(), resolveGitScopeContext(), makeScope(), countGitPaths(), gitInventory(), buildGitInventory(), fallbackAllScope() (+1 more)

### Community 186 - "Community 186"
Cohesion: 0.47
Nodes (6): uniqueSorted(), mergeDrafts(), stalenessFrom(), minConfidence(), groupConfidence(), buildCommitRecommendation()

### Community 165 - "Community 165"
Cohesion: 0.25
Nodes (8): uniqueSorted(), riskLevel(), communityRisk(), nodeCommunities(), buildBlastRadius(), impactedCommunities(), multimodalSafety(), buildReviewAnalysis()

### Community 212 - "Community 212"
Cohesion: 1.00
Nodes (2): average(), evaluateReviewAnalysis()

### Community 213 - "Community 213"
Cohesion: 1.00
Nodes (2): formatMetric(), reviewEvaluationToText()

### Community 150 - "Community 150"
Cohesion: 0.28
Nodes (6): MyApp.Accounts.User, create(), validate(), MyApp.Accounts.User, create(), validate()

### Community 80 - "Community 80"
Cohesion: 0.15
Nodes (14): Geometry, LinearAlgebra, Base, Shape, Point, Circle, area(), describe() (+6 more)

### Community 128 - "Community 128"
Cohesion: 0.18
Nodes (10): Animal, -initWithName, -speak, Dog, -fetch, Animal, -initWithName, -speak (+2 more)

### Community 38 - "Community 38"
Cohesion: 0.16
Nodes (16): Auth, BasicAuth, Timeout, Limits, BaseClient, The main Client and AsyncClient classes. BaseClient holds all shared logic. Clie, Shared implementation for Client and AsyncClient.     Handles auth, redirects, c, Synchronous HTTP client. (+8 more)

### Community 21 - "Community 21"
Cohesion: 0.11
Nodes (26): BearerAuth, NetRCAuth, Authentication handlers. Auth objects are callables that modify a request before, Base class for all authentication handlers., Modify the request. May yield to inspect the response., HTTP Basic Authentication., Bearer token authentication., Load credentials from ~/.netrc based on the request host. (+18 more)

### Community 163 - "Community 163"
Cohesion: 0.32
Nodes (4): DigestAuth, HTTP Digest Authentication.     Requires a full request/response cycle: sends th, Extract digest parameters from the WWW-Authenticate header., Compute the Authorization header value for a digest challenge.

### Community 50 - "Community 50"
Cohesion: 0.13
Nodes (2): Client, AsyncClient

### Community 119 - "Community 119"
Cohesion: 0.18
Nodes (1): Headers

### Community 162 - "Community 162"
Cohesion: 0.31
Nodes (1): ConnectionPool

### Community 189 - "Community 189"
Cohesion: 0.33
Nodes (6): scoreNodes(), bfs(), dfs(), subgraphToText(), toolQueryGraph(), toolShortestPath()

### Community 102 - "Community 102"
Cohesion: 0.16
Nodes (15): asRecord(), asStringArray(), asBoolean(), asString(), asNumber(), resolvePath(), parsePdfOcrMode(), parseCitationMinimum() (+7 more)

### Community 211 - "Community 211"
Cohesion: 1.00
Nodes (2): registrySourceName(), buildRegistrySources()

## Knowledge Gaps
- **1621 isolated node(s):** `GraphInstance`, `JSON_NOISE_LABELS`, `SAMPLE_QUESTIONS`, `BenchmarkOptions`, `BuildOptions` (+1616 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 190`** (1 nodes): `CONFIDENCE_VALUES`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 214`** (2 nodes): `average()`, `evaluateReviewAnalysis()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 215`** (2 nodes): `formatMetric()`, `reviewEvaluationToText()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 216`** (1 nodes): `UnpdfTextResult`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 217`** (2 nodes): `tempProject()`, `tempProfileProject()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 82`** (2 nodes): `ApiClient`, `ApiClient`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 174`** (2 nodes): `Transformer`, `Transformer`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 152`** (2 nodes): `inventory`, `ignoredDir`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 209`** (2 nodes): `root`, `paths`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 187`** (1 nodes): `recommendation`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 218`** (1 nodes): `optionalRuntimeDeps`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 103`** (1 nodes): `AsyncClient`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 120`** (1 nodes): `Client`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 132`** (2 nodes): `ConnectionPool`, `HTTPTransport`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 212`** (2 nodes): `average()`, `evaluateReviewAnalysis()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 213`** (2 nodes): `formatMetric()`, `reviewEvaluationToText()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (2 nodes): `Client`, `AsyncClient`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 119`** (1 nodes): `Headers`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 162`** (1 nodes): `ConnectionPool`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 211`** (2 nodes): `registrySourceName()`, `buildRegistrySources()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Cookies` connect `Community 23` to `Community 56`, `Community 119`, `Community 38`, `Community 50`, `Community 27`?**
  _High betweenness centrality (0.001) - this node is a cross-community bridge._
- **Why does `Cookies` connect `Community 44` to `Community 56`, `Community 120`, `Community 103`, `Community 23`?**
  _High betweenness centrality (0.001) - this node is a cross-community bridge._
- **Why does `InvalidURL` connect `Community 44` to `Community 27`, `Community 120`, `Community 103`?**
  _High betweenness centrality (0.001) - this node is a cross-community bridge._
- **Are the 39 inferred relationships involving `Response` (e.g. with `Auth` and `BasicAuth`) actually correct?**
  _`Response` has 39 INFERRED edges - model-reasoned connections that need verification._
- **Are the 39 inferred relationships involving `Response` (e.g. with `Auth` and `BasicAuth`) actually correct?**
  _`Response` has 39 INFERRED edges - model-reasoned connections that need verification._
- **Are the 39 inferred relationships involving `Request` (e.g. with `Auth` and `BasicAuth`) actually correct?**
  _`Request` has 39 INFERRED edges - model-reasoned connections that need verification._
- **Are the 39 inferred relationships involving `Request` (e.g. with `Auth` and `BasicAuth`) actually correct?**
  _`Request` has 39 INFERRED edges - model-reasoned connections that need verification._