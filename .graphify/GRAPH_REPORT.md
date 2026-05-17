# Graph Report - .  (2026-05-17)

## Corpus Check
- Large corpus: 248 files · ~311,536 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 3938 nodes · 6368 edges · 188 communities detected
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 466 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output


## Input Scope
- Requested: auto
- Resolved: committed (source: default-auto)
- Included files: 248 · Candidates: 264
- Excluded: 0 untracked · 15527 ignored · 0 sensitive · 0 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.

## Graph Freshness
- Built from Git commit: `075efba`
- Compare this hash to `git rev-parse HEAD` before trusting freshness-sensitive graph output.
## God Nodes (most connected - your core abstractions)
1. `Response` - 45 edges
2. `Response` - 45 edges
3. `Request` - 42 edges
4. `Request` - 42 edges
5. `_makeId()` - 28 edges
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

### Community 0 - "Community 0"
Cohesion: 0.02
Nodes (79): analysis, analysisPath, analysisValues, article, artifact, cacheKey, captionsDir, configOut (+71 more)

### Community 1 - "Community 1"
Cohesion: 0.02
Nodes (80): BenchmarkResult, Confidence, DetectionResult, Extraction, FileType, GodNodeEntry, GraphDiffResult, GraphEdge (+72 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (66): addError(), addWarning(), appendJsonLine(), applyOntologyPatch(), auditPath(), changedFiles(), decisionLogOperation(), decisionLogStatus() (+58 more)

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (58): bfs(), communitiesFromGraph(), communityName(), dfs(), findNode(), getVersion(), loadGraph(), scoreNodes() (+50 more)

### Community 4 - "Community 4"
Cohesion: 0.03
Nodes (55): alphaNeighbors, audit, beforeAudit, beforeDecisions, betaNeighbors, candidate, candidateResponse, candidates (+47 more)

### Community 5 - "Community 5"
Cohesion: 0.05
Nodes (48): buildFlowArtifact(), computeFlowCriticality(), decoratorsOf(), detectEntryPoints(), flowIdFor(), flowListToText(), flowToSteps(), getFlowById() (+40 more)

### Community 6 - "Community 6"
Cohesion: 0.05
Nodes (52): buildReviewContext(), buildReviewGuidance(), buildSourceSnippets(), changedFunctionsWithoutTests(), extractRelevantLines(), formatLines(), isInside(), isSensitivePath() (+44 more)

### Community 7 - "Community 7"
Cohesion: 0.05
Nodes (38): average(), buildBlastRadius(), buildReviewAnalysis(), communityRisk(), evaluateReviewAnalysis(), formatMetric(), impactedCommunities(), multimodalSafety() (+30 more)

### Community 8 - "Community 8"
Cohesion: 0.06
Nodes (49): collectJsonIssues(), collectStringIssues(), collectTextIssues(), hasSchemePrefix(), isIgnoredLocalArtifact(), isWindowsAbsolutePath(), makeDetectionPortable(), normalizeFileMap() (+41 more)

### Community 9 - "Community 9"
Cohesion: 0.05
Nodes (38): buildReviewDelta(), changedNodeIds(), compareNodes(), compareStrings(), highRiskChains(), impactedNodeIds(), isTestPath(), likelyTestGaps() (+30 more)

### Community 10 - "Community 10"
Cohesion: 0.05
Nodes (43): normalizeSearchText(), scoreSearchText(), textMatchesQuery(), AnalysisFile, analyzeGraph(), cacheOptionsFromRuntime(), defaultLabels(), __dirname (+35 more)

### Community 11 - "Community 11"
Cohesion: 0.06
Nodes (50): handle_delete(), handle_enrich(), handle_get(), handle_list(), handle_search(), handle_upload(), API module - exposes the document pipeline over HTTP. Thin layer over parser, va, Accept a list of file paths, run the full pipeline on each,     and return a sum (+42 more)

### Community 12 - "Community 12"
Cohesion: 0.07
Nodes (48): _cross_community_surprises(), _cross_file_surprises(), _file_category(), god_nodes(), graph_diff(), _is_concept_node(), _is_file_node(), _node_community_map() (+40 more)

### Community 13 - "Community 13"
Cohesion: 0.06
Nodes (39): average(), countHits(), evaluateReviewBenchmarks(), flowIdentifiers(), formatMetric(), identifiers(), normalize(), ratio() (+31 more)

### Community 14 - "Community 14"
Cohesion: 0.09
Nodes (32): addIssue(), citations(), isProfileEdge(), isRegistrySeed(), stringValue(), validateCitations(), validateEdge(), validateNode() (+24 more)

### Community 15 - "Community 15"
Cohesion: 0.07
Nodes (40): asRecord(), bucketMatches(), calibrateImageRouting(), countArray(), imageRoutingSampleFromCaption(), loadImageRoutingLabels(), loadImageRoutingRules(), normalizeBucket() (+32 more)

### Community 16 - "Community 16"
Cohesion: 0.06
Nodes (33): compileNodes(), compileOntologyOutputs(), compileRelations(), ontologyNodeType(), safeFilename(), sha256(), stringValue(), writeJson() (+25 more)

### Community 17 - "Community 17"
Cohesion: 0.05
Nodes (43): astroNode, buildNode, cardNode, codeNode, constructorCall, deepPath, entryNode, fileNode (+35 more)

### Community 18 - "Community 18"
Cohesion: 0.11
Nodes (41): asRecord(), asStringArray(), bindOntologyProfile(), hashOntologyProfile(), loadOntologyProfile(), normalizeCitationPolicy(), normalizeHardeningPolicy(), normalizeOntologyProfile() (+33 more)

### Community 19 - "Community 19"
Cohesion: 0.05
Nodes (37): _C_CONFIG, _CPP_CONFIG, _CSHARP_CONFIG, _DISPATCH, _EXTENSIONS, ExtractionDiagnostic, ExtractionResult, ExtractorFn (+29 more)

### Community 20 - "Community 20"
Cohesion: 0.1
Nodes (30): ConnectError, ConnectTimeout, PoolTimeout, ProtocolError, ProxyError, An error occurred at the transport layer., Timed out while connecting to the host., Timed out while receiving data from the host. (+22 more)

### Community 21 - "Community 21"
Cohesion: 0.06
Nodes (23): commitPrefixForArea(), communityLabel(), dominantCommunity(), groupDraftForFile(), isGraphifyStatePath(), normalizePath(), sourceMatches(), topLevelArea() (+15 more)

### Community 22 - "Community 22"
Cohesion: 0.11
Nodes (26): BearerAuth, NetRCAuth, Authentication handlers. Auth objects are callables that modify a request before, Load credentials from ~/.netrc based on the request host., Base class for all authentication handlers., Modify the request. May yield to inspect the response., HTTP Basic Authentication., Bearer token authentication. (+18 more)

### Community 23 - "Community 23"
Cohesion: 0.05
Nodes (28): AssistantLlmClientOptions, BatchTextJsonClient, BatchTextJsonExportInput, BatchTextJsonExportResult, BatchTextJsonImportInput, BatchTextJsonImportResult, BatchVisionExportInput, BatchVisionExportResult (+20 more)

### Community 24 - "Community 24"
Cohesion: 0.07
Nodes (35): Cookies, build_url_with_params(), flatten_queryparams(), is_known_encoding(), normalize_header_key(), obfuscate_sensitive_headers(), parse_content_type(), primitive_value_to_str() (+27 more)

### Community 25 - "Community 25"
Cohesion: 0.1
Nodes (34): buildProfileReport(), graphLinks(), graphNodes(), highDegreeSection(), humanReviewSection(), invalidRelationsSection(), lowEvidenceSection(), pdfOcrSection() (+26 more)

### Community 26 - "Community 26"
Cohesion: 0.06
Nodes (25): ANTIGRAVITY_RULE_PATH, ANTIGRAVITY_WORKFLOW_PATH, changedFilesFromGit(), checkSkillVersion(), __dirname, ensureCliExtractionShape(), __filename, GEMINI_MCP_SERVER (+17 more)

### Community 27 - "Community 27"
Cohesion: 0.05
Nodes (30): CreateGraphifyMeshOptions, MeshTextJsonClientOptions, client, dir, mesh, tempDirs, cacheKey, communities (+22 more)

### Community 28 - "Community 28"
Cohesion: 0.05
Nodes (34): addFunction(), qn(), addFunction(), allNames, api, artifact, callee, caller (+26 more)

### Community 29 - "Community 29"
Cohesion: 0.08
Nodes (33): estimateTokens(), loadGraph(), querySubgraphTokens(), runBenchmark(), defaultGraphPath(), defaultManifestPath(), defaultTranscriptsDir(), legacyGraphPath() (+25 more)

### Community 30 - "Community 30"
Cohesion: 0.07
Nodes (35): Exception, CloseError, ConnectTimeout, CookieConflict, DecodingError, HTTPError, HTTPStatusError, NetworkError (+27 more)

### Community 31 - "Community 31"
Cohesion: 0.08
Nodes (31): buildFirstHopSummary(), buildNextBestAction(), communityLabels(), communityMembership(), compareHubs(), compareStrings(), FirstHopCommunity, FirstHopHub (+23 more)

### Community 32 - "Community 32"
Cohesion: 0.09
Nodes (36): buildFallbackSidecar(), buildWikiDescriptionPrompt(), BuildWikiDescriptionPromptOptions, collectCommunityTargetContext(), collectInferredCommunityMap(), collectNodeNeighbors(), collectNodeTargetContext(), collectSourceRefs() (+28 more)

### Community 33 - "Community 33"
Cohesion: 0.09
Nodes (35): augmentDetectionWithTranscripts(), buildWhisperPrompt(), CACHED_AUDIO_EXTENSIONS, cloneDetection(), defaultWhisperCacheDir(), downloadAudio(), downloadFile(), ensureWhisperArtifacts() (+27 more)

### Community 34 - "Community 34"
Cohesion: 0.09
Nodes (15): Config, HttpClient, HttpClientFactory, main(), NewServer(), process(), validate(), Server (+7 more)

### Community 35 - "Community 35"
Cohesion: 0.1
Nodes (33): buildProfileChunkPrompt(), buildProfileExtractionPrompt(), buildProfileValidationPrompt(), chunkGuidance(), citationSection(), genericSafetySection(), hardeningSection(), inputHintsSection() (+25 more)

### Community 36 - "Community 36"
Cohesion: 0.09
Nodes (33): bodyContent(), cachedFiles(), cacheDir(), cacheKind(), cacheNamespace(), CacheOptions, checkSemanticCache(), clearCache() (+25 more)

### Community 37 - "Community 37"
Cohesion: 0.09
Nodes (25): applyEntry(), collectEntries(), gitAdvice(), migrateGraphifyOut(), normalizeGitPath(), planGraphifyOutMigration(), shellQuote(), applyEntry() (+17 more)

### Community 38 - "Community 38"
Cohesion: 0.11
Nodes (32): delete_record(), _ensure_storage(), list_records(), load_index(), load_record(), Storage module - persists documents to disk and maintains the search index. All, Load the full document index from disk., Persist the index to disk. (+24 more)

### Community 39 - "Community 39"
Cohesion: 0.08
Nodes (32): buildWikiDescriptionCacheKey(), checkWikiDescriptionFreshness(), createInsufficientEvidenceRecord(), CreateInsufficientEvidenceRecordInput, isNonEmptyString(), isRecord(), isStringArray(), isStringOrNull() (+24 more)

### Community 40 - "Community 40"
Cohesion: 0.06
Nodes (9): AnalyzeChangesOptions, ChangedRange, ChangedRangesByFile, ComputeRiskScoreOptions, DetectChangesMinimalResult, DetectChangesNodeRisk, DetectChangesResult, DetectChangesTestGap (+1 more)

### Community 41 - "Community 41"
Cohesion: 0.09
Nodes (30): allowedPathFor(), buildOntologyDiscoveryDiff(), buildOntologyDiscoverySample(), knownEvidenceRefs(), loadOntologyDiscoveryContext(), OntologyDiscoveryContext, OntologyDiscoveryProposal, OntologyDiscoveryProposalAction (+22 more)

### Community 42 - "Community 42"
Cohesion: 0.16
Nodes (16): Auth, BasicAuth, BaseClient, Limits, The main Client and AsyncClient classes. BaseClient holds all shared logic. Clie, Asynchronous HTTP client., Shared implementation for Client and AsyncClient.     Handles auth, redirects, c, Synchronous HTTP client. (+8 more)

### Community 43 - "Community 43"
Cohesion: 0.08
Nodes (12): DataProcessor, Get-Data(), GraphifyDemo, IProcessor, Process-Items(), Processor, DataProcessor, Get-Data() (+4 more)

### Community 44 - "Community 44"
Cohesion: 0.12
Nodes (30): currentBranch(), currentHead(), lifecyclePaths(), markLifecycleAnalyzed(), markLifecycleStale(), mergeBase(), planLifecyclePrune(), readJson() (+22 more)

### Community 45 - "Community 45"
Cohesion: 0.1
Nodes (28): escapeRegExp(), GRAPH_GITATTR_LINES, hookBlockRegex(), HookDefinition, HOOKS, install(), installGraphAttributes(), installHook() (+20 more)

### Community 46 - "Community 46"
Cohesion: 0.12
Nodes (26): artifactId(), buildImageDataprepManifest(), existingImages(), fileHash(), mimeType(), pdfArtifactByImage(), runImageDataprep(), sha256() (+18 more)

### Community 47 - "Community 47"
Cohesion: 0.16
Nodes (15): Auth, BasicAuth, Base class for all authentication handlers., BaseClient, Limits, The main Client and AsyncClient classes. BaseClient holds all shared logic. Clie, Asynchronous HTTP client., Shared implementation for Client and AsyncClient.     Handles auth, redirects, c (+7 more)

### Community 48 - "Community 48"
Cohesion: 0.13
Nodes (25): crossCommunitySurprises(), crossFileSurprises(), edgeBetweennessSurprises(), fileCategory(), godNodes(), isConceptNode(), isFileNode(), nodeCommunityMap() (+17 more)

### Community 49 - "Community 49"
Cohesion: 0.12
Nodes (23): countImageMarkers(), countWords(), extractPdfTextLayer(), extractWithPdfParse(), extractWithPdftotext(), normalizeText(), preflightPdf(), sha256() (+15 more)

### Community 50 - "Community 50"
Cohesion: 0.13
Nodes (2): AsyncClient, Client

### Community 51 - "Community 51"
Cohesion: 0.1
Nodes (26): batch_parse(), parse_and_save(), parse_file(), parse_json(), parse_markdown(), parse_plaintext(), Parser module - reads raw input documents and converts them into a structured fo, Read a file from disk and return a structured document. (+18 more)

### Community 52 - "Community 52"
Cohesion: 0.13
Nodes (26): augmentDetectionWithPdfPreflight(), cloneDetection(), countWords(), dedupe(), listImageArtifacts(), loadMistralOcrModule(), metadataPath(), preparePdf() (+18 more)

### Community 53 - "Community 53"
Cohesion: 0.1
Nodes (26): enrich_document(), extract_keywords(), find_cross_references(), normalize_text(), process_and_save(), Processor module - transforms validated documents into enriched records ready fo, Lowercase, strip extra whitespace, remove control characters., Pull non-stopword tokens from text, deduplicated. (+18 more)

### Community 54 - "Community 54"
Cohesion: 0.14
Nodes (21): applyConfiguredExcludes(), buildConfiguredDetectionInputs(), buildProfileState(), dataprepReport(), emptyDetection(), fullPageScreenshotExcludes(), mergeDetections(), mergeScopeInspections() (+13 more)

### Community 55 - "Community 55"
Cohesion: 0.08
Nodes (21): OntologyWriteFixture, apply, audit, auditLine, authoritative, { body, headers }, decision, decisionLine (+13 more)

### Community 56 - "Community 56"
Cohesion: 0.09
Nodes (6): Core data models: URL, Headers, Cookies, Request, Response. These are the centra, HTTPStatusError, A 4xx or 5xx response was received., Headers, Core data models: URL, Headers, Cookies, Request, Response. These are the centra, URL

### Community 57 - "Community 57"
Cohesion: 0.14
Nodes (23): asBoolean(), asNumber(), asRecord(), asString(), asStringArray(), buildRegistrySources(), CONFIG_CANDIDATES, loadProjectConfig() (+15 more)

### Community 58 - "Community 58"
Cohesion: 0.09
Nodes (24): ASSET_DIR_MARKERS, classifyFile(), CODE_EXTENSIONS, DetectOptions, DOC_EXTENSIONS, findVcsRoot(), GOOGLE_WORKSPACE_EXTENSIONS, GraphifyIgnoreRule (+16 more)

### Community 59 - "Community 59"
Cohesion: 0.11
Nodes (12): BearerAuth, DigestAuth, NetRCAuth, Authentication handlers. Auth objects are callables that modify a request before, Load credentials from ~/.netrc based on the request host., Modify the request. May yield to inspect the response., HTTP Basic Authentication., Bearer token authentication. (+4 more)

### Community 60 - "Community 60"
Cohesion: 0.13
Nodes (19): candidateFilters(), createOntologyStudioRequestHandler(), decisionLogOptions(), generateOntologyStudioToken(), handleOntologyStudioRequest(), htmlResult(), isLoopbackHost(), jsonResult() (+11 more)

### Community 61 - "Community 61"
Cohesion: 0.09
Nodes (21): addNode(), qn(), addNode(), caller, fallback, flows, funcA, funcB (+13 more)

### Community 62 - "Community 62"
Cohesion: 0.13
Nodes (21): appendMemoryFiles(), isInputScopeMode(), parseInputScopeMode(), resolveCliInputScopeSelection(), resolveConfiguredInputScopeSelection(), toPosixPath(), toRepoRelative(), walkFiles() (+13 more)

### Community 63 - "Community 63"
Cohesion: 0.15
Nodes (24): antigravityInstall(), canonicalPlatformName(), claudeInstall(), cursorInstall(), emptyPreview(), findSkillFile(), geminiInstall(), getInvocationExample() (+16 more)

### Community 64 - "Community 64"
Cohesion: 0.14
Nodes (23): _csharpExtraWalk(), extractMarkdown(), extractSql(), _findRequireCall(), _getCFuncName(), _getCppFuncName(), _importC(), _importCsharp() (+15 more)

### Community 65 - "Community 65"
Cohesion: 0.13
Nodes (20): candidateId(), candidateScore(), chooseCanonicalPair(), filterOntologyReconciliationCandidates(), generateOntologyReconciliationCandidates(), GenerateOntologyReconciliationCandidatesOptions, nodeTerms(), normalizeTerm() (+12 more)

### Community 66 - "Community 66"
Cohesion: 0.09
Nodes (22): allClustered, count, cypher, data, errors, exts, FIXTURES_DIR, G2 (+14 more)

### Community 67 - "Community 67"
Cohesion: 0.09
Nodes (18): benchmark, canvas, cleanupDirs, cohesion, communities, detection, dir, G (+10 more)

### Community 68 - "Community 68"
Cohesion: 0.09
Nodes (18): configOut, dir, discoveryDiffPath, discoveryDir, discoveryPromptPath, discoveryProposalsPath, discoveryReportPath, discoverySample (+10 more)

### Community 69 - "Community 69"
Cohesion: 0.11
Nodes (20): build_graph(), cluster(), cohesion_score(), Leiden community detection on NetworkX graphs. Splits oversized communities. Ret, Run Leiden community detection. Returns {community_id: [node_ids]}.      Communi, Build a NetworkX graph from graphify node/edge dicts.      Preserves original ed, Run a second Leiden pass on a community subgraph to split it further., Ratio of actual intra-community edges to maximum possible. (+12 more)

### Community 70 - "Community 70"
Cohesion: 0.14
Nodes (16): artifactHasDeepRoute(), asRecord(), existingValidSidecarErrors(), importImageDataprepBatchResults(), readCaption(), readJsonl(), artifactHasDeepRoute(), asRecord() (+8 more)

### Community 71 - "Community 71"
Cohesion: 0.1
Nodes (16): blocked, captionPath, captionsDir, cleanupDirs, dense, forced, graphifyManifest, input (+8 more)

### Community 72 - "Community 72"
Cohesion: 0.13
Nodes (16): asNumber(), asString(), createReviewGraphStore(), isTestPath(), KNOWN_KINDS, normalizeKind(), normalizePath(), parseLineRange() (+8 more)

### Community 73 - "Community 73"
Cohesion: 0.13
Nodes (13): NumericMapLike, StringMapLike, appendFreshnessSection(), appendInputScopeSection(), appendReviewSections(), formatFlow(), generate(), GenerateReportOptions (+5 more)

### Community 74 - "Community 74"
Cohesion: 0.15
Nodes (15): buildMinimalContext(), riskFromScore(), suggestionsForTask(), topCommunities(), topFlowNames(), uniqueSorted(), buildMinimalContext(), BuildMinimalContextOptions (+7 more)

### Community 75 - "Community 75"
Cohesion: 0.15
Nodes (14): Base, area(), Circle, describe(), Geometry, Point, Shape, LinearAlgebra (+6 more)

### Community 76 - "Community 76"
Cohesion: 0.13
Nodes (15): buildProject(), BuildProjectArtifacts, BuildProjectOptions, BuildProjectResult, BuildProjectWarning, countNonCodeFiles(), defaultLabels(), fileList() (+7 more)

### Community 77 - "Community 77"
Cohesion: 0.12
Nodes (13): CanvasOptions, COMMUNITY_COLORS, CommunityLabelOptions, CommunityLabelsInput, CONFIDENCE_SCORE_DEFAULTS, HtmlOptions, JsonOptions, neo4jLabel() (+5 more)

### Community 78 - "Community 78"
Cohesion: 0.14
Nodes (2): ApiClient, ApiClient

### Community 79 - "Community 79"
Cohesion: 0.15
Nodes (12): readGraphAttributeLabels(), readLabelsJson(), resolveCommunityLabels(), acquireRebuildLock(), builtFromCommit(), checkUpdate(), CheckUpdateResult, mergeHyperedges() (+4 more)

### Community 80 - "Community 80"
Cohesion: 0.21
Nodes (10): Analyzer, compute_score(), normalize(), Fixture: functions and methods that call each other - for call-graph extraction, run_analysis(), Analyzer, compute_score(), normalize() (+2 more)

### Community 81 - "Community 81"
Cohesion: 0.12
Nodes (10): bound, cleanupDirs, config, errors, first, profile, profilePath, raw (+2 more)

### Community 82 - "Community 82"
Cohesion: 0.12
Nodes (14): communities, extraction, fixtureRoot, graph, graphJson, graphPath, processNode, profileValidation (+6 more)

### Community 83 - "Community 83"
Cohesion: 0.14
Nodes (13): hyperedgeSortKey(), mergeGraphAttributes(), mergeGraphJsonFiles(), MergeGraphJsonResult, readGraph(), ancestor, current, dir (+5 more)

### Community 84 - "Community 84"
Cohesion: 0.17
Nodes (13): cloneRepo(), CloneRepoOptions, CloneRepoResult, defaultCloneDestination(), execGit(), GithubRepoRef, maybeGithubRepo(), repoNameFromUrl() (+5 more)

### Community 85 - "Community 85"
Cohesion: 0.13
Nodes (15): client, communities, dir, exportInput, first, graph, { index, dropped }, lines (+7 more)

### Community 86 - "Community 86"
Cohesion: 0.13
Nodes (11): cleanupDirs, config, cropDir, cropImage, directImage, image, manifest, markdown (+3 more)

### Community 87 - "Community 87"
Cohesion: 0.13
Nodes (13): anthropicMock, cleanupDirs, client, cohereMock, config, generateTextMock, googleMock, mistralMock (+5 more)

### Community 88 - "Community 88"
Cohesion: 0.16
Nodes (16): applyConfiguredExcludes(), buildConfiguredDetectionInputs(), buildProfileState(), dataprepReport(), emptyDetection(), fullPageScreenshotExcludes(), mergeDetections(), mergeScopeInspections() (+8 more)

### Community 89 - "Community 89"
Cohesion: 0.17
Nodes (13): DirectSemanticChunk, DirectSemanticClientOptions, DirectSemanticExtractionClient, DirectSemanticExtractionOptions, DirectSemanticFile, estimateFileTokens(), extractionShape(), extractSemanticFilesDirectParallel() (+5 more)

### Community 90 - "Community 90"
Cohesion: 0.18
Nodes (13): convertGoogleWorkspaceFile(), ConvertGoogleWorkspaceOptions, createDefaultGoogleWorkspaceFetcher(), EXPORT_MIME_TYPE_BY_EXTENSION, extractFileIdFromUrl(), extractResourceKey(), frontmatterWrap(), GOOGLE_WORKSPACE_EXTENSIONS (+5 more)

### Community 91 - "Community 91"
Cohesion: 0.13
Nodes (10): cleanupDirs, config, detection, filtered, fixtureRoot, inputs, paths, root (+2 more)

### Community 92 - "Community 92"
Cohesion: 0.13
Nodes (12): ambiguous, captionsDir, cleanupDirs, labelsPath, manifest, missing, outDir, result (+4 more)

### Community 93 - "Community 93"
Cohesion: 0.19
Nodes (12): field(), loadProfileRegistry(), normalizeRegistryRecord(), readRegistryRows(), registryRecordsToExtraction(), safeIdPart(), field(), loadProfileRegistry() (+4 more)

### Community 94 - "Community 94"
Cohesion: 0.13
Nodes (12): cleanupDirs, components, config, csvPath, extraction, jsonPath, profile, record (+4 more)

### Community 95 - "Community 95"
Cohesion: 0.16
Nodes (15): asBoolean(), asNumber(), asRecord(), asString(), asStringArray(), loadProjectConfig(), normalizeProjectConfig(), parseCitationMinimum() (+7 more)

### Community 96 - "Community 96"
Cohesion: 0.15
Nodes (1): AsyncClient

### Community 97 - "Community 97"
Cohesion: 0.39
Nodes (15): buildResolvableLabelIndex(), ensureParserInit(), extractElixir(), extractGo(), extractJulia(), extractObjc(), extractPowershell(), _extractPythonRationale() (+7 more)

### Community 98 - "Community 98"
Cohesion: 0.13
Nodes (13): allNodes, communities, first, G, louvainMock, multiNodeCommunities, nodes, partition (+5 more)

### Community 99 - "Community 99"
Cohesion: 0.25
Nodes (13): execGit(), gitRevParse(), resolveFromGitCwd(), resolveGitContext(), safeExecGit(), safeGitRevParse(), execGit(), GitContext (+5 more)

### Community 100 - "Community 100"
Cohesion: 0.14
Nodes (9): cleanupDirs, configDir, configPath, errors, loaded, normalized, raw, result (+1 more)

### Community 101 - "Community 101"
Cohesion: 0.33
Nodes (13): detectUrlType(), downloadBinary(), fetchArxiv(), fetchTweet(), fetchWebpage(), htmlToMarkdown(), ingest(), IngestOptions (+5 more)

### Community 102 - "Community 102"
Cohesion: 0.27
Nodes (12): communityArticle(), crossCommunityLinks(), flowArticle(), flowsThroughNodes(), godNodeArticle(), indexMd(), normalizeFlows(), renderDescription() (+4 more)

### Community 103 - "Community 103"
Cohesion: 0.15
Nodes (13): extractC(), extractCpp(), extractCsharp(), _extractGeneric(), extractJava(), extractJs(), extractKotlin(), extractLua() (+5 more)

### Community 104 - "Community 104"
Cohesion: 0.22
Nodes (8): ALLOWED_SCHEMES, BLOCKED_HOSTS, isPrivateIp(), isRedirectStatus(), safeFetch(), safeFetchText(), validateHostname(), validateUrl()

### Community 105 - "Community 105"
Cohesion: 0.15
Nodes (11): communities, diff, first, G, G1, G2, gods, labels (+3 more)

### Community 106 - "Community 106"
Cohesion: 0.15
Nodes (9): calls, dir, fetcher, googleEnvKeys, previousEnv, rendered, shortcut, stub (+1 more)

### Community 107 - "Community 107"
Cohesion: 0.26
Nodes (11): addCall(), addFunction(), makeFlowStore(), qn(), addCall(), addFunction(), { artifact, store }, { artifact, store, ids } (+3 more)

### Community 108 - "Community 108"
Cohesion: 0.26
Nodes (11): addCall(), addFunction(), makeStore(), qn(), addCall(), addFunction(), makeStore(), qn() (+3 more)

### Community 109 - "Community 109"
Cohesion: 0.18
Nodes (1): Headers

### Community 110 - "Community 110"
Cohesion: 0.18
Nodes (1): Client

### Community 111 - "Community 111"
Cohesion: 0.17
Nodes (8): SemanticPreparationOptions, SemanticPreparationResult, imagePath, outputDir, packageJson, packageLock, tempDirs, { unpdfExtractTextMock, unpdfGetDocMock, convertPdfMock, spawnSyncMock }

### Community 112 - "Community 112"
Cohesion: 0.29
Nodes (11): asRecord(), asString(), build(), buildFromJson(), buildMerge(), BuildMergeOptions, BuildOptions, deduplicateByLabel() (+3 more)

### Community 113 - "Community 113"
Cohesion: 0.33
Nodes (11): getOntologyRebuildStatus(), getOntologyReconciliationCandidate(), listOntologyReconciliationCandidates(), loadReadonlyReconciliationCandidates(), ontologyAppliedPatchesPath(), ontologyNeedsUpdatePath(), OntologyRebuildStatusResponse, ontologyReconciliationCandidatesPath() (+3 more)

### Community 114 - "Community 114"
Cohesion: 0.17
Nodes (11): bumped, codeExts, filePath, initial, inventory, manifest, manifestPath, packagesDir (+3 more)

### Community 115 - "Community 115"
Cohesion: 0.17
Nodes (10): cached, hash, modelDir, outDir, spawnSyncMock, tempDirs, video, videoA (+2 more)

### Community 116 - "Community 116"
Cohesion: 0.17
Nodes (10): base, cache_key, community, communityBase, fresh, generator, index, result (+2 more)

### Community 117 - "Community 117"
Cohesion: 0.17
Nodes (11): communities, communityArticle, count, descriptions, files, flows, G, generator (+3 more)

### Community 118 - "Community 118"
Cohesion: 0.18
Nodes (10): Animal, -initWithName, -speak, Dog, -fetch, Animal, -initWithName, -speak (+2 more)

### Community 119 - "Community 119"
Cohesion: 0.25
Nodes (4): build_graph(), Graph, build_graph(), Graph

### Community 120 - "Community 120"
Cohesion: 0.33
Nodes (10): isRecord(), isStringArray(), validateImageCaption(), validateImageRouting(), isRecord(), isStringArray(), VALID_DENSITY, VALID_ROUTING_SIGNAL (+2 more)

### Community 121 - "Community 121"
Cohesion: 0.18
Nodes (8): documentPrompt, extraction, fixtureRoot, imagePrompt, profile, prompt, sample, state

### Community 122 - "Community 122"
Cohesion: 0.27
Nodes (2): ConnectionPool, HTTPTransport

### Community 123 - "Community 123"
Cohesion: 0.25
Nodes (11): extract(), extractWithDiagnostics(), _importJs(), inferCommonRoot(), loadTsconfigAliases(), normalizeJsImportTarget(), projectRelativeFilePath(), remapFileNodeIds() (+3 more)

### Community 124 - "Community 124"
Cohesion: 0.18
Nodes (9): audit, client, credential, output, outputPath, PROVIDERS, providerSelection, tempDir (+1 more)

### Community 125 - "Community 125"
Cohesion: 0.18
Nodes (9): cleanupDirs, cypher, dir, graph, graphPath, outputPath, persisted, warnings (+1 more)

### Community 126 - "Community 126"
Cohesion: 0.18
Nodes (9): dir, filters, first, loaded, path, profile, queue, response (+1 more)

### Community 127 - "Community 127"
Cohesion: 0.18
Nodes (10): affectedFlows, cohesion, communities, detection, flows, G, gods, labels (+2 more)

### Community 128 - "Community 128"
Cohesion: 0.2
Nodes (7): batch, G, impact, node, out, store, targets

### Community 129 - "Community 129"
Cohesion: 0.24
Nodes (10): agentsInstall(), agentsUninstall(), getAgentsMdSection(), installCodexHook(), installOpenCodePlugin(), legacyOpencodeConfigPath(), loadOpenCodeConfig(), opencodeConfigPath() (+2 more)

### Community 130 - "Community 130"
Cohesion: 0.27
Nodes (10): antigravityUninstall(), claudeUninstall(), cursorUninstall(), geminiUninstall(), kiroUninstall(), uninstallAll(), uninstallClaudeHook(), uninstallGeminiMcp() (+2 more)

### Community 131 - "Community 131"
Cohesion: 0.2
Nodes (9): attrs, edge, ext, ext1, ext2, G, hyper, hyperedges (+1 more)

### Community 132 - "Community 132"
Cohesion: 0.22
Nodes (9): context, diff, discoveryContext(), fixtureRoot, proposals, repeat, sample, semanticDetection() (+1 more)

### Community 133 - "Community 133"
Cohesion: 0.28
Nodes (6): MyApp.Accounts.User, create(), validate(), MyApp.Accounts.User, create(), validate()

### Community 134 - "Community 134"
Cohesion: 0.31
Nodes (9): buildGitInventory(), countGitPaths(), fallbackAllScope(), gitInventory(), inspectInputScope(), makeScope(), pathspecForPrefix(), resolveGitScopeContext() (+1 more)

### Community 135 - "Community 135"
Cohesion: 0.22
Nodes (2): ignoredDir, inventory

### Community 136 - "Community 136"
Cohesion: 0.25
Nodes (9): htmlScript(), htmlStyles(), hyperedgeScript(), isCanvasOptions(), isCommunityLabelOptions(), normalizeCommunityLabels(), normalizeMemberCounts(), toCanvas() (+1 more)

### Community 137 - "Community 137"
Cohesion: 0.39
Nodes (8): createGraph(), forEachTraversalNeighbor(), isDirectedGraph(), loadGraphFromData(), SerializedGraphData, serializeGraph(), toUndirectedGraph(), traversalNeighbors()

### Community 138 - "Community 138"
Cohesion: 0.31
Nodes (9): buildGitInventory(), countGitPaths(), fallbackAllScope(), gitInventory(), inspectInputScope(), makeScope(), pathspecForPrefix(), resolveGitScopeContext() (+1 more)

### Community 139 - "Community 139"
Cohesion: 0.42
Nodes (7): evidenceRefsFromSources(), loadOntologyPatchContext(), loadProfilePatchRuntimeContext(), optionalJson(), ProfilePatchRuntimeContext, readJson(), stringValue()

### Community 140 - "Community 140"
Cohesion: 0.25
Nodes (7): assertValid(), REQUIRED_EDGE_FIELDS, REQUIRED_NODE_FIELDS, VALID_CONFIDENCES, VALID_FILE_TYPES, validateExtraction(), errors

### Community 141 - "Community 141"
Cohesion: 0.22
Nodes (4): BuildWikiDescriptionBatchOptions, ParseWikiDescriptionBatchOptions, WIKI_DESCRIPTION_BATCH_SCHEMA, WikiDescriptionBatchResultRecord

### Community 142 - "Community 142"
Cohesion: 0.22
Nodes (7): communities, dir, G, html, htmlPath, result, warnings

### Community 143 - "Community 143"
Cohesion: 0.31
Nodes (1): ConnectionPool

### Community 144 - "Community 144"
Cohesion: 0.32
Nodes (4): DigestAuth, HTTP Digest Authentication.     Requires a full request/response cycle: sends th, Extract digest parameters from the WWW-Authenticate header., Compute the Authorization header value for a digest challenge.

### Community 145 - "Community 145"
Cohesion: 0.25
Nodes (8): CloseError, NetworkError, A network error occurred., Failed to receive data from the network., Failed to send data through the network., Failed to close a connection., ReadError, WriteError

### Community 146 - "Community 146"
Cohesion: 0.46
Nodes (6): canonicalizeForPartition(), cluster(), cohesionScore(), partition(), scoreAll(), splitCommunity()

### Community 147 - "Community 147"
Cohesion: 0.32
Nodes (8): countWords(), detect(), isIgnored(), isNoiseDir(), isSensitive(), relativeWithin(), resolveCandidateFiles(), walkDir()

### Community 148 - "Community 148"
Cohesion: 0.25
Nodes (8): buildFreshnessMetadata(), computeTopologySignature(), computeTopologySignatureFromLinks(), isSvgOptions(), nodeCommunityMap(), toGraphml(), toJson(), toSvg()

### Community 149 - "Community 149"
Cohesion: 0.25
Nodes (7): agents, dir, home, section, skill, skillPath, tempDirs

### Community 150 - "Community 150"
Cohesion: 0.25
Nodes (6): attrs, cleanupDirs, dir, edge, graph, graphPath

### Community 151 - "Community 151"
Cohesion: 0.25
Nodes (7): commands, dir, hooks, readme, section, skill, tempDirs

### Community 152 - "Community 152"
Cohesion: 0.25
Nodes (7): calls, callTargets, cleanupDirs, demoNode, dir, filePath, importEdge

### Community 153 - "Community 153"
Cohesion: 0.38
Nodes (6): build(), build_from_json(), Merge multiple extraction results into one graph., build(), build_from_json(), Merge multiple extraction results into one graph.

### Community 154 - "Community 154"
Cohesion: 0.29
Nodes (2): Transformer, Transformer

### Community 155 - "Community 155"
Cohesion: 0.29
Nodes (6): DecodingError, HTTPError, An error occurred while issuing a request., Decoding of the response failed., Base class for all httpx exceptions., RequestError

### Community 156 - "Community 156"
Cohesion: 0.38
Nodes (5): mergedGraphType(), mergeGraphsFromFiles(), MergeGraphsOptions, MergeGraphsResult, mergeHyperedges()

### Community 157 - "Community 157"
Cohesion: 0.33
Nodes (4): nodeLabel(), renderTree(), RenderTreeOptions, TreeNeighbor

### Community 158 - "Community 158"
Cohesion: 0.29
Nodes (6): home, previousCwd, readme, skillPath, tempDirs, versionPath

### Community 159 - "Community 159"
Cohesion: 0.29
Nodes (6): dir, geminiMd, readme, settings, skill, tempDirs

### Community 160 - "Community 160"
Cohesion: 0.29
Nodes (6): analyzed, head, metadata, plan, stale, worktreeDir

### Community 161 - "Community 161"
Cohesion: 0.33
Nodes (6): rule, runCliInTemp(), runCliWithEnvironment(), skillPath, tempDirs, workflow

### Community 162 - "Community 162"
Cohesion: 0.29
Nodes (6): ALL_SKILL_DOCS, content, DISTRIBUTED_SKILL_DOCS, EXTRACTION_PROMPT_DOCS, SKILLS, TRIGGER_DESCRIPTION_DOCS

### Community 163 - "Community 163"
Cohesion: 0.33
Nodes (3): HtmlWriter, SafeToHtmlOptions, ToHtmlOptions

### Community 164 - "Community 164"
Cohesion: 0.47
Nodes (6): buildCommitRecommendation(), groupConfidence(), mergeDrafts(), minConfidence(), stalenessFrom(), uniqueSorted()

### Community 165 - "Community 165"
Cohesion: 0.33
Nodes (1): recommendation

### Community 166 - "Community 166"
Cohesion: 0.4
Nodes (6): directProviderCredentialEnv(), ensureProviderCredential(), isDirectLlmProvider(), preflightLlmExecution(), resolveDirectModel(), resolveProviderCredential()

### Community 167 - "Community 167"
Cohesion: 0.47
Nodes (6): buildCommitRecommendation(), groupConfidence(), mergeDrafts(), minConfidence(), stalenessFrom(), uniqueSorted()

### Community 168 - "Community 168"
Cohesion: 0.33
Nodes (5): commands, dir, matchers, settings, tempDirs

### Community 169 - "Community 169"
Cohesion: 0.33
Nodes (5): dir, original, rule, rulePath, tempDirs

### Community 170 - "Community 170"
Cohesion: 0.33
Nodes (5): cleanupDirs, dir, downloadAudioMock, expected, rendered

### Community 171 - "Community 171"
Cohesion: 0.33
Nodes (5): markdown, outputDir, pdfPath, tempDirs, tmpDir

### Community 172 - "Community 172"
Cohesion: 0.33
Nodes (5): config, dir, plugin, previousCwd, tempDirs

### Community 173 - "Community 173"
Cohesion: 0.33
Nodes (4): contents, dir, lockPath, tempDirs

### Community 174 - "Community 174"
Cohesion: 0.6
Nodes (5): analyzeChanges(), changedNodesFromFiles(), mapChangesToNodes(), sortNodesByLocation(), uniqueSorted()

### Community 175 - "Community 175"
Cohesion: 0.6
Nodes (5): analyzeChanges(), changedNodesFromFiles(), mapChangesToNodes(), sortNodesByLocation(), uniqueSorted()

### Community 176 - "Community 176"
Cohesion: 0.4
Nodes (4): chunks, client, files, root

### Community 177 - "Community 177"
Cohesion: 0.4
Nodes (4): dir, logs, preview, tempDirs

### Community 178 - "Community 178"
Cohesion: 0.4
Nodes (4): graphifyOut, long, result, tmpDir

### Community 179 - "Community 179"
Cohesion: 0.67
Nodes (4): convertOfficeFile(), docxToMarkdown(), officeParseToText(), xlsxToMarkdown()

### Community 180 - "Community 180"
Cohesion: 0.5
Nodes (4): detectIncremental(), loadManifest(), md5File(), saveManifest()

### Community 181 - "Community 181"
Cohesion: 0.5
Nodes (4): extractAstro(), extractRegexBackedCode(), extractSvelte(), lineForIndex()

### Community 182 - "Community 182"
Cohesion: 0.67
Nodes (3): runCli(), runMain(), runSkillRuntime()

### Community 183 - "Community 183"
Cohesion: 0.67
Nodes (3): writeFixtureGraph(), writeOntologyPatchFixture(), writeOntologyReconciliationFixture()

### Community 184 - "Community 184"
Cohesion: 1
Nodes (2): buildRegistrySources(), registrySourceName()

### Community 185 - "Community 185"
Cohesion: 1
Nodes (1): UnpdfTextResult

### Community 186 - "Community 186"
Cohesion: 1
Nodes (2): tempProfileProject(), tempProject()

### Community 187 - "Community 187"
Cohesion: 1
Nodes (1): optionalRuntimeDeps

## Knowledge Gaps
- **1484 isolated node(s):** `GraphInstance`, `SAMPLE_QUESTIONS`, `BenchmarkOptions`, `BuildOptions`, `BuildMergeOptions` (+1479 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 50`** (2 nodes): `AsyncClient`, `Client`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 78`** (2 nodes): `ApiClient`, `ApiClient`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 96`** (1 nodes): `AsyncClient`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 109`** (1 nodes): `Headers`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 110`** (1 nodes): `Client`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 122`** (2 nodes): `ConnectionPool`, `HTTPTransport`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 135`** (2 nodes): `ignoredDir`, `inventory`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 143`** (1 nodes): `ConnectionPool`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 154`** (2 nodes): `Transformer`, `Transformer`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 165`** (1 nodes): `recommendation`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 184`** (2 nodes): `buildRegistrySources()`, `registrySourceName()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 185`** (1 nodes): `UnpdfTextResult`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 186`** (2 nodes): `tempProfileProject()`, `tempProject()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 187`** (1 nodes): `optionalRuntimeDeps`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Cookies` connect `Community 24` to `Community 56`, `Community 109`, `Community 42`, `Community 50`, `Community 30`?**
  _High betweenness centrality (0.001) - this node is a cross-community bridge._
- **Why does `Cookies` connect `Community 47` to `Community 56`, `Community 110`, `Community 96`, `Community 24`?**
  _High betweenness centrality (0.001) - this node is a cross-community bridge._
- **Why does `InvalidURL` connect `Community 47` to `Community 30`, `Community 110`, `Community 96`?**
  _High betweenness centrality (0.001) - this node is a cross-community bridge._
- **Are the 39 inferred relationships involving `Response` (e.g. with `Auth` and `BasicAuth`) actually correct?**
  _`Response` has 39 INFERRED edges - model-reasoned connections that need verification._
- **Are the 39 inferred relationships involving `Response` (e.g. with `Auth` and `BasicAuth`) actually correct?**
  _`Response` has 39 INFERRED edges - model-reasoned connections that need verification._
- **Are the 39 inferred relationships involving `Request` (e.g. with `Auth` and `BasicAuth`) actually correct?**
  _`Request` has 39 INFERRED edges - model-reasoned connections that need verification._
- **Are the 39 inferred relationships involving `Request` (e.g. with `Auth` and `BasicAuth`) actually correct?**
  _`Request` has 39 INFERRED edges - model-reasoned connections that need verification._