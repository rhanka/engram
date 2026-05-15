# Graph Report - .  (2026-05-15)

## Corpus Check
- Large corpus: 247 files · ~305 749 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 2621 nodes · 5046 edges · 107 communities detected
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 466 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output


## Input Scope
- Requested: auto
- Resolved: committed (source: default-auto)
- Included files: 247 · Candidates: 263
- Excluded: 0 untracked · 26088 ignored · 0 sensitive · 0 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.

## Graph Freshness
- Built from Git commit: `e29eabd`
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

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (70): buildResolvableLabelIndex(), _csharpExtraWalk(), ensureParserInit(), extract(), extractAstro(), extractC(), extractCpp(), extractCsharp() (+62 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (59): estimateTokens(), loadGraph(), querySubgraphTokens(), runBenchmark(), defaultGraphPath(), defaultManifestPath(), defaultTranscriptsDir(), legacyGraphPath() (+51 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (55): augmentDetectionWithPdfPreflight(), cloneDetection(), countWords(), dedupe(), listImageArtifacts(), loadMistralOcrModule(), metadataPath(), preparePdf() (+47 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (53): bfs(), communitiesFromGraph(), communityName(), dfs(), findNode(), getVersion(), loadGraph(), scoreNodes() (+45 more)

### Community 4 - "Community 4"
Cohesion: 0.05
Nodes (30): analyzeChanges(), changedNodesFromFiles(), mapChangesToNodes(), sortNodesByLocation(), uniqueSorted(), average(), countHits(), evaluateReviewBenchmarks() (+22 more)

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (44): detectUrlType(), downloadBinary(), fetchArxiv(), fetchTweet(), fetchWebpage(), htmlToMarkdown(), ingest(), normalizeIngestOptions() (+36 more)

### Community 6 - "Community 6"
Cohesion: 0.06
Nodes (48): ASSET_DIR_MARKERS, classifyFile(), CODE_EXTENSIONS, convertOfficeFile(), countWords(), detect(), detectIncremental(), DetectOptions (+40 more)

### Community 7 - "Community 7"
Cohesion: 0.06
Nodes (50): handle_delete(), handle_enrich(), handle_get(), handle_list(), handle_search(), handle_upload(), API module - exposes the document pipeline over HTTP. Thin layer over parser, va, Accept a list of file paths, run the full pipeline on each,     and return a sum (+42 more)

### Community 8 - "Community 8"
Cohesion: 0.07
Nodes (48): _cross_community_surprises(), _cross_file_surprises(), _file_category(), god_nodes(), graph_diff(), _is_concept_node(), _is_file_node(), _node_community_map() (+40 more)

### Community 9 - "Community 9"
Cohesion: 0.06
Nodes (32): buildReviewDelta(), changedNodeIds(), compareNodes(), compareStrings(), highRiskChains(), impactedNodeIds(), isTestPath(), likelyTestGaps() (+24 more)

### Community 10 - "Community 10"
Cohesion: 0.07
Nodes (34): buildFlowArtifact(), computeFlowCriticality(), decoratorsOf(), detectEntryPoints(), flowIdFor(), flowListToText(), flowToSteps(), getFlowById() (+26 more)

### Community 11 - "Community 11"
Cohesion: 0.06
Nodes (24): average(), buildBlastRadius(), buildReviewAnalysis(), communityRisk(), evaluateReviewAnalysis(), formatMetric(), impactedCommunities(), multimodalSafety() (+16 more)

### Community 12 - "Community 12"
Cohesion: 0.09
Nodes (37): applyConfiguredExcludes(), buildConfiguredDetectionInputs(), buildProfileState(), dataprepReport(), emptyDetection(), fullPageScreenshotExcludes(), mergeDetections(), mergeScopeInspections() (+29 more)

### Community 13 - "Community 13"
Cohesion: 0.09
Nodes (36): collectJsonIssues(), collectStringIssues(), collectTextIssues(), hasSchemePrefix(), isIgnoredLocalArtifact(), isWindowsAbsolutePath(), makeDetectionPortable(), normalizeFileMap() (+28 more)

### Community 14 - "Community 14"
Cohesion: 0.1
Nodes (30): ConnectError, ConnectTimeout, PoolTimeout, ProtocolError, ProxyError, An error occurred at the transport layer., Timed out while connecting to the host., Timed out while receiving data from the host. (+22 more)

### Community 15 - "Community 15"
Cohesion: 0.09
Nodes (34): buildReviewContext(), buildReviewGuidance(), buildSourceSnippets(), changedFunctionsWithoutTests(), extractRelevantLines(), formatLines(), isInside(), isSensitivePath() (+26 more)

### Community 16 - "Community 16"
Cohesion: 0.12
Nodes (39): asRecord(), asStringArray(), bindOntologyProfile(), hashOntologyProfile(), loadOntologyProfile(), normalizeCitationPolicy(), normalizeHardeningPolicy(), normalizeOntologyProfile() (+31 more)

### Community 17 - "Community 17"
Cohesion: 0.07
Nodes (35): Exception, CloseError, ConnectTimeout, CookieConflict, DecodingError, HTTPError, HTTPStatusError, NetworkError (+27 more)

### Community 18 - "Community 18"
Cohesion: 0.12
Nodes (24): addIssue(), citations(), isProfileEdge(), isRegistrySeed(), stringValue(), validateCitations(), validateEdge(), validateNode() (+16 more)

### Community 19 - "Community 19"
Cohesion: 0.07
Nodes (14): changedFilesFromGit(), checkSkillVersion(), ensureCliExtractionShape(), getPlatformsToCheck(), graphContentHash(), isJsonRecord(), loadCliProfileContext(), loadFreshWikiDescriptionSidecarIndex() (+6 more)

### Community 20 - "Community 20"
Cohesion: 0.09
Nodes (15): Config, HttpClient, HttpClientFactory, main(), NewServer(), process(), validate(), Server (+7 more)

### Community 21 - "Community 21"
Cohesion: 0.06
Nodes (34): build_url_with_params(), flatten_queryparams(), is_known_encoding(), normalize_header_key(), obfuscate_sensitive_headers(), parse_content_type(), primitive_value_to_str(), Utility functions shared across the library. Small helpers that don't belong in (+26 more)

### Community 22 - "Community 22"
Cohesion: 0.08
Nodes (16): commitPrefixForArea(), communityLabel(), dominantCommunity(), groupDraftForFile(), isGraphifyStatePath(), normalizePath(), sourceMatches(), topLevelArea() (+8 more)

### Community 23 - "Community 23"
Cohesion: 0.11
Nodes (30): buildProfileChunkPrompt(), buildProfileExtractionPrompt(), buildProfileValidationPrompt(), chunkGuidance(), citationSection(), genericSafetySection(), hardeningSection(), inputHintsSection() (+22 more)

### Community 24 - "Community 24"
Cohesion: 0.11
Nodes (32): delete_record(), _ensure_storage(), list_records(), load_index(), load_record(), Storage module - persists documents to disk and maintains the search index. All, Load the full document index from disk., Persist the index to disk. (+24 more)

### Community 25 - "Community 25"
Cohesion: 0.14
Nodes (26): buildProfileReport(), graphLinks(), graphNodes(), highDegreeSection(), humanReviewSection(), invalidRelationsSection(), lowEvidenceSection(), pdfOcrSection() (+18 more)

### Community 26 - "Community 26"
Cohesion: 0.16
Nodes (31): addError(), addWarning(), appendJsonLine(), applyOntologyPatch(), auditPath(), changedFiles(), decisionLogOperation(), decisionLogStatus() (+23 more)

### Community 27 - "Community 27"
Cohesion: 0.17
Nodes (20): Auth, BasicAuth, NetRCAuth, Load credentials from ~/.netrc based on the request host., Base class for all authentication handlers., Modify the request. May yield to inspect the response., HTTP Basic Authentication., BaseClient (+12 more)

### Community 28 - "Community 28"
Cohesion: 0.08
Nodes (12): DataProcessor, Get-Data(), GraphifyDemo, IProcessor, Process-Items(), Processor, DataProcessor, Get-Data() (+4 more)

### Community 29 - "Community 29"
Cohesion: 0.12
Nodes (26): asRecord(), bucketMatches(), calibrateImageRouting(), countArray(), imageRoutingSampleFromCaption(), loadImageRoutingLabels(), loadImageRoutingRules(), normalizeBucket() (+18 more)

### Community 30 - "Community 30"
Cohesion: 0.1
Nodes (18): compileNodes(), compileOntologyOutputs(), compileRelations(), ontologyNodeType(), safeFilename(), sha256(), stringValue(), writeJson() (+10 more)

### Community 31 - "Community 31"
Cohesion: 0.11
Nodes (22): buildFirstHopSummary(), buildNextBestAction(), communityLabels(), communityMembership(), compareHubs(), compareStrings(), graphDensity(), internalEdgeCounts() (+14 more)

### Community 32 - "Community 32"
Cohesion: 0.12
Nodes (24): crossCommunitySurprises(), crossFileSurprises(), edgeBetweennessSurprises(), fileCategory(), godNodes(), isConceptNode(), isFileNode(), nodeCommunityMap() (+16 more)

### Community 33 - "Community 33"
Cohesion: 0.16
Nodes (15): Auth, BasicAuth, Base class for all authentication handlers., BaseClient, Limits, The main Client and AsyncClient classes. BaseClient holds all shared logic. Clie, Asynchronous HTTP client., Shared implementation for Client and AsyncClient.     Handles auth, redirects, c (+7 more)

### Community 34 - "Community 34"
Cohesion: 0.13
Nodes (2): AsyncClient, Client

### Community 35 - "Community 35"
Cohesion: 0.16
Nodes (17): ConnectError, An error occurred at the transport layer., Failed to establish a connection., TimeoutException, TransportError, AsyncBaseTransport, BaseTransport, MockTransport (+9 more)

### Community 36 - "Community 36"
Cohesion: 0.1
Nodes (10): createDirectTextJsonClient(), defaultDirectLlmModel(), directProviderCredentialEnv(), ensureProviderCredential(), instructionFileName(), isDirectLlmProvider(), preflightLlmExecution(), resolveDirectModel() (+2 more)

### Community 37 - "Community 37"
Cohesion: 0.1
Nodes (26): batch_parse(), parse_and_save(), parse_file(), parse_json(), parse_markdown(), parse_plaintext(), Parser module - reads raw input documents and converts them into a structured fo, Read a file from disk and return a structured document. (+18 more)

### Community 38 - "Community 38"
Cohesion: 0.1
Nodes (26): enrich_document(), extract_keywords(), find_cross_references(), normalize_text(), process_and_save(), Processor module - transforms validated documents into enriched records ready fo, Lowercase, strip extra whitespace, remove control characters., Pull non-stopword tokens from text, deduplicated. (+18 more)

### Community 39 - "Community 39"
Cohesion: 0.14
Nodes (21): buildFreshnessMetadata(), computeTopologySignature(), computeTopologySignatureFromLinks(), htmlScript(), htmlStyles(), hyperedgeScript(), isCanvasOptions(), isCommunityLabelOptions() (+13 more)

### Community 40 - "Community 40"
Cohesion: 0.09
Nodes (6): Core data models: URL, Headers, Cookies, Request, Response. These are the centra, HTTPStatusError, A 4xx or 5xx response was received., Headers, Core data models: URL, Headers, Cookies, Request, Response. These are the centra, URL

### Community 41 - "Community 41"
Cohesion: 0.16
Nodes (24): currentBranch(), currentHead(), lifecyclePaths(), markLifecycleAnalyzed(), markLifecycleStale(), mergeBase(), planLifecyclePrune(), readJson() (+16 more)

### Community 42 - "Community 42"
Cohesion: 0.11
Nodes (12): BearerAuth, DigestAuth, NetRCAuth, Authentication handlers. Auth objects are callables that modify a request before, Load credentials from ~/.netrc based on the request host., Modify the request. May yield to inspect the response., HTTP Basic Authentication., Bearer token authentication. (+4 more)

### Community 43 - "Community 43"
Cohesion: 0.17
Nodes (23): buildFallbackSidecar(), buildWikiDescriptionPrompt(), collectCommunityTargetContext(), collectInferredCommunityMap(), collectNodeNeighbors(), collectNodeTargetContext(), collectSourceRefs(), collectWikiDescriptionTargets() (+15 more)

### Community 44 - "Community 44"
Cohesion: 0.16
Nodes (21): appendMemoryFiles(), buildGitInventory(), countGitPaths(), fallbackAllScope(), gitInventory(), inspectInputScope(), isInputScopeMode(), makeScope() (+13 more)

### Community 45 - "Community 45"
Cohesion: 0.17
Nodes (20): artifactId(), buildImageDataprepManifest(), existingImages(), fileHash(), mimeType(), pdfArtifactByImage(), runImageDataprep(), sha256() (+12 more)

### Community 46 - "Community 46"
Cohesion: 0.15
Nodes (14): applyEntry(), collectEntries(), gitAdvice(), migrateGraphifyOut(), normalizeGitPath(), planGraphifyOutMigration(), shellQuote(), applyEntry() (+6 more)

### Community 47 - "Community 47"
Cohesion: 0.15
Nodes (11): asRecord(), asString(), build(), buildFromJson(), buildMerge(), deduplicateByLabel(), normalizedLabel(), normalizeSourceFilePath() (+3 more)

### Community 48 - "Community 48"
Cohesion: 0.18
Nodes (19): buildRegistrySources(), registrySourceName(), asBoolean(), asNumber(), asRecord(), asString(), asStringArray(), buildRegistrySources() (+11 more)

### Community 49 - "Community 49"
Cohesion: 0.11
Nodes (20): build_graph(), cluster(), cohesion_score(), Leiden community detection on NetworkX graphs. Splits oversized communities. Ret, Run Leiden community detection. Returns {community_id: [node_ids]}.      Communi, Build a NetworkX graph from graphify node/edge dicts.      Preserves original ed, Run a second Leiden pass on a community subgraph to split it further., Ratio of actual intra-community edges to maximum possible. (+12 more)

### Community 50 - "Community 50"
Cohesion: 0.11
Nodes (3): Cookies, Headers, URL

### Community 51 - "Community 51"
Cohesion: 0.17
Nodes (18): allowedPathFor(), buildOntologyDiscoveryDiff(), buildOntologyDiscoverySample(), knownEvidenceRefs(), loadOntologyDiscoveryContext(), readJson(), registrySamples(), relPath() (+10 more)

### Community 52 - "Community 52"
Cohesion: 0.15
Nodes (14): Base, area(), Circle, describe(), Geometry, Point, Shape, LinearAlgebra (+6 more)

### Community 53 - "Community 53"
Cohesion: 0.19
Nodes (17): escapeRegExp(), hookBlockRegex(), install(), installGraphAttributes(), installHook(), installMergeDriverConfig(), mergeDriverConfigStatus(), pathIsInside() (+9 more)

### Community 54 - "Community 54"
Cohesion: 0.19
Nodes (13): candidateFilters(), createOntologyStudioRequestHandler(), decisionLogOptions(), generateOntologyStudioToken(), handleOntologyStudioRequest(), htmlResult(), isLoopbackHost(), jsonResult() (+5 more)

### Community 55 - "Community 55"
Cohesion: 0.15
Nodes (8): BearerAuth, DigestAuth, Authentication handlers. Auth objects are callables that modify a request before, Bearer token authentication., HTTP Digest Authentication.     Requires a full request/response cycle: sends th, Extract digest parameters from the WWW-Authenticate header., Compute the Authorization header value for a digest challenge., Response

### Community 56 - "Community 56"
Cohesion: 0.14
Nodes (2): ApiClient, ApiClient

### Community 57 - "Community 57"
Cohesion: 0.15
Nodes (12): field(), loadProfileRegistry(), normalizeRegistryRecord(), readRegistryRows(), registryRecordsToExtraction(), safeIdPart(), field(), loadProfileRegistry() (+4 more)

### Community 58 - "Community 58"
Cohesion: 0.21
Nodes (10): Analyzer, compute_score(), normalize(), Fixture: functions and methods that call each other - for call-graph extraction, run_analysis(), Analyzer, compute_score(), normalize() (+2 more)

### Community 59 - "Community 59"
Cohesion: 0.19
Nodes (12): artifactHasDeepRoute(), asRecord(), existingValidSidecarErrors(), importImageDataprepBatchResults(), readCaption(), readJsonl(), artifactHasDeepRoute(), asRecord() (+4 more)

### Community 60 - "Community 60"
Cohesion: 0.19
Nodes (12): buildMinimalContext(), riskFromScore(), suggestionsForTask(), topCommunities(), topFlowNames(), uniqueSorted(), buildMinimalContext(), riskFromScore() (+4 more)

### Community 61 - "Community 61"
Cohesion: 0.17
Nodes (9): asNumber(), asString(), createReviewGraphStore(), isTestPath(), normalizeKind(), normalizePath(), parseLineRange(), pathMatches() (+1 more)

### Community 62 - "Community 62"
Cohesion: 0.19
Nodes (16): agentsInstall(), antigravityInstall(), claudeInstall(), cursorInstall(), emptyPreview(), geminiInstall(), getAgentsMdSection(), globalSkillInstallPreview() (+8 more)

### Community 63 - "Community 63"
Cohesion: 0.23
Nodes (11): candidateId(), candidateScore(), chooseCanonicalPair(), filterOntologyReconciliationCandidates(), generateOntologyReconciliationCandidates(), nodeTerms(), normalizeTerm(), queryOntologyReconciliationCandidates() (+3 more)

### Community 64 - "Community 64"
Cohesion: 0.19
Nodes (7): appendFreshnessSection(), appendInputScopeSection(), appendReviewSections(), formatFlow(), generate(), normalizeAffectedFlows(), normalizeFlows()

### Community 65 - "Community 65"
Cohesion: 0.23
Nodes (12): execGit(), gitRevParse(), resolveFromGitCwd(), resolveGitContext(), safeExecGit(), safeGitRevParse(), execGit(), gitRevParse() (+4 more)

### Community 66 - "Community 66"
Cohesion: 0.16
Nodes (15): asBoolean(), asNumber(), asRecord(), asString(), asStringArray(), loadProjectConfig(), normalizeProjectConfig(), parseCitationMinimum() (+7 more)

### Community 67 - "Community 67"
Cohesion: 0.15
Nodes (1): AsyncClient

### Community 68 - "Community 68"
Cohesion: 0.22
Nodes (8): readGraphAttributeLabels(), readLabelsJson(), resolveCommunityLabels(), buildProject(), countNonCodeFiles(), defaultLabels(), fileList(), formatDiagnosticSummary()

### Community 69 - "Community 69"
Cohesion: 0.23
Nodes (10): buildWikiDescriptionCacheKey(), checkWikiDescriptionFreshness(), createInsufficientEvidenceRecord(), isNonEmptyString(), isRecord(), isStringArray(), isStringOrNull(), selectFreshWikiDescriptions() (+2 more)

### Community 70 - "Community 70"
Cohesion: 0.18
Nodes (3): writeFixtureGraph(), writeOntologyPatchFixture(), writeOntologyReconciliationFixture()

### Community 71 - "Community 71"
Cohesion: 0.26
Nodes (10): createGraph(), forEachTraversalNeighbor(), isDirectedGraph(), loadGraphFromData(), serializeGraph(), toUndirectedGraph(), traversalNeighbors(), mergedGraphType() (+2 more)

### Community 72 - "Community 72"
Cohesion: 0.21
Nodes (7): acquireRebuildLock(), builtFromCommit(), checkUpdate(), mergeHyperedges(), rebuildCode(), rebuildLockPath(), releaseRebuildLock()

### Community 73 - "Community 73"
Cohesion: 0.31
Nodes (11): communityArticle(), crossCommunityLinks(), flowArticle(), flowsThroughNodes(), godNodeArticle(), indexMd(), normalizeFlows(), renderDescription() (+3 more)

### Community 74 - "Community 74"
Cohesion: 0.18
Nodes (1): Client

### Community 75 - "Community 75"
Cohesion: 0.18
Nodes (10): Animal, -initWithName, -speak, Dog, -fetch, Animal, -initWithName, -speak (+2 more)

### Community 76 - "Community 76"
Cohesion: 0.25
Nodes (4): build_graph(), Graph, build_graph(), Graph

### Community 77 - "Community 77"
Cohesion: 0.27
Nodes (2): ConnectionPool, HTTPTransport

### Community 78 - "Community 78"
Cohesion: 0.27
Nodes (11): canonicalPlatformName(), findSkillFile(), getInvocationExample(), installSkill(), loadSkillContent(), platformNamesForError(), renderAiderSkill(), resolveGlobalSkillDestination() (+3 more)

### Community 79 - "Community 79"
Cohesion: 0.27
Nodes (7): estimateFileTokens(), extractionShape(), extractSemanticFilesDirectParallel(), mergeExtractions(), packSemanticFilesByTokenBudget(), readSemanticFile(), toPortableRelative()

### Community 80 - "Community 80"
Cohesion: 0.38
Nodes (10): getOntologyRebuildStatus(), getOntologyReconciliationCandidate(), listOntologyReconciliationCandidates(), loadReadonlyReconciliationCandidates(), ontologyAppliedPatchesPath(), ontologyNeedsUpdatePath(), ontologyReconciliationCandidatesPath(), previewOntologyDecisionLog() (+2 more)

### Community 81 - "Community 81"
Cohesion: 0.27
Nodes (10): antigravityUninstall(), claudeUninstall(), cursorUninstall(), geminiUninstall(), kiroUninstall(), uninstallAll(), uninstallClaudeHook(), uninstallGeminiMcp() (+2 more)

### Community 82 - "Community 82"
Cohesion: 0.33
Nodes (6): canonicalizeForPartition(), cluster(), cohesionScore(), partition(), scoreAll(), splitCommunity()

### Community 83 - "Community 83"
Cohesion: 0.27
Nodes (5): runCli(), runMain(), runSkillRuntime(), tempProfileProject(), tempProject()

### Community 84 - "Community 84"
Cohesion: 0.39
Nodes (8): addCall(), addFunction(), makeFlowStore(), qn(), addCall(), addFunction(), makeFlowStore(), qn()

### Community 85 - "Community 85"
Cohesion: 0.28
Nodes (6): MyApp.Accounts.User, create(), validate(), MyApp.Accounts.User, create(), validate()

### Community 86 - "Community 86"
Cohesion: 0.28
Nodes (4): addFunction(), qn(), addFunction(), qn()

### Community 87 - "Community 87"
Cohesion: 0.44
Nodes (8): isRecord(), isStringArray(), validateImageCaption(), validateImageRouting(), isRecord(), isStringArray(), validateImageCaption(), validateImageRouting()

### Community 88 - "Community 88"
Cohesion: 0.39
Nodes (8): addCall(), addFunction(), makeStore(), qn(), addCall(), addFunction(), makeStore(), qn()

### Community 89 - "Community 89"
Cohesion: 0.39
Nodes (8): addCall(), addFunction(), makeBenchmarkStore(), qn(), addCall(), addFunction(), makeBenchmarkStore(), qn()

### Community 90 - "Community 90"
Cohesion: 0.31
Nodes (9): buildGitInventory(), countGitPaths(), fallbackAllScope(), gitInventory(), inspectInputScope(), makeScope(), pathspecForPrefix(), resolveGitScopeContext() (+1 more)

### Community 91 - "Community 91"
Cohesion: 0.42
Nodes (5): cloneRepo(), defaultCloneDestination(), execGit(), maybeGithubRepo(), repoNameFromUrl()

### Community 92 - "Community 92"
Cohesion: 0.31
Nodes (1): ConnectionPool

### Community 93 - "Community 93"
Cohesion: 0.25
Nodes (8): CloseError, NetworkError, A network error occurred., Failed to receive data from the network., Failed to send data through the network., Failed to close a connection., ReadError, WriteError

### Community 94 - "Community 94"
Cohesion: 0.36
Nodes (4): hyperedgeSortKey(), mergeGraphAttributes(), mergeGraphJsonFiles(), readGraph()

### Community 95 - "Community 95"
Cohesion: 0.5
Nodes (6): evidenceRefsFromSources(), loadOntologyPatchContext(), loadProfilePatchRuntimeContext(), optionalJson(), readJson(), stringValue()

### Community 97 - "Community 97"
Cohesion: 0.38
Nodes (6): build(), build_from_json(), Merge multiple extraction results into one graph., build(), build_from_json(), Merge multiple extraction results into one graph.

### Community 98 - "Community 98"
Cohesion: 0.38
Nodes (4): addNode(), qn(), addNode(), qn()

### Community 99 - "Community 99"
Cohesion: 0.29
Nodes (2): Transformer, Transformer

### Community 102 - "Community 102"
Cohesion: 0.29
Nodes (6): DecodingError, HTTPError, An error occurred while issuing a request., Decoding of the response failed., Base class for all httpx exceptions., RequestError

### Community 103 - "Community 103"
Cohesion: 0.38
Nodes (7): agentsUninstall(), installOpenCodePlugin(), legacyOpencodeConfigPath(), loadOpenCodeConfig(), opencodeConfigPath(), uninstallCodexHook(), uninstallOpenCodePlugin()

### Community 104 - "Community 104"
Cohesion: 0.47
Nodes (6): buildCommitRecommendation(), groupConfidence(), mergeDrafts(), minConfidence(), stalenessFrom(), uniqueSorted()

### Community 106 - "Community 106"
Cohesion: 0.47
Nodes (6): buildCommitRecommendation(), groupConfidence(), mergeDrafts(), minConfidence(), stalenessFrom(), uniqueSorted()

### Community 115 - "Community 115"
Cohesion: 0.5
Nodes (4): appendMemoryFiles(), toPosixPath(), toRepoRelative(), walkFiles()

### Community 120 - "Community 120"
Cohesion: 1
Nodes (2): discoveryContext(), semanticDetection()

### Community 121 - "Community 121"
Cohesion: 1
Nodes (2): runCliInTemp(), runCliWithEnvironment()

### Community 122 - "Community 122"
Cohesion: 1
Nodes (1): UnpdfTextResult

## Knowledge Gaps
- **173 isolated node(s):** `CODE_EXTENSIONS`, `DOC_EXTENSIONS`, `PAPER_EXTENSIONS`, `IMAGE_EXTENSIONS`, `OFFICE_EXTENSIONS` (+168 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 34`** (2 nodes): `AsyncClient`, `Client`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 56`** (2 nodes): `ApiClient`, `ApiClient`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 67`** (1 nodes): `AsyncClient`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 74`** (1 nodes): `Client`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 77`** (2 nodes): `ConnectionPool`, `HTTPTransport`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 92`** (1 nodes): `ConnectionPool`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 99`** (2 nodes): `Transformer`, `Transformer`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 120`** (2 nodes): `discoveryContext()`, `semanticDetection()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 121`** (2 nodes): `runCliInTemp()`, `runCliWithEnvironment()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 122`** (1 nodes): `UnpdfTextResult`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Cookies` connect `Community 50` to `Community 40`, `Community 27`, `Community 34`, `Community 17`, `Community 21`?**
  _High betweenness centrality (0.003) - this node is a cross-community bridge._
- **Why does `Cookies` connect `Community 33` to `Community 40`, `Community 74`, `Community 67`, `Community 21`?**
  _High betweenness centrality (0.003) - this node is a cross-community bridge._
- **Why does `InvalidURL` connect `Community 33` to `Community 17`, `Community 74`, `Community 67`?**
  _High betweenness centrality (0.003) - this node is a cross-community bridge._
- **Are the 39 inferred relationships involving `Response` (e.g. with `Auth` and `BasicAuth`) actually correct?**
  _`Response` has 39 INFERRED edges - model-reasoned connections that need verification._
- **Are the 39 inferred relationships involving `Response` (e.g. with `Auth` and `BasicAuth`) actually correct?**
  _`Response` has 39 INFERRED edges - model-reasoned connections that need verification._
- **Are the 39 inferred relationships involving `Request` (e.g. with `Auth` and `BasicAuth`) actually correct?**
  _`Request` has 39 INFERRED edges - model-reasoned connections that need verification._
- **Are the 39 inferred relationships involving `Request` (e.g. with `Auth` and `BasicAuth`) actually correct?**
  _`Request` has 39 INFERRED edges - model-reasoned connections that need verification._