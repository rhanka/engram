# Graph Report - .  (2026-05-16)

## Corpus Check
- Large corpus: 248 files · ~310 695 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 2662 nodes · 5089 edges · 104 communities detected
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 466 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output


## Input Scope
- Requested: auto
- Resolved: committed (source: default-auto)
- Included files: 248 · Candidates: 264
- Excluded: 0 untracked · 16584 ignored · 0 sensitive · 0 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.

## Graph Freshness
- Built from Git commit: `bc15a10`
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

### Community 36 - "Community 36"
Cohesion: 0.12
Nodes (24): nodeCommunityMap(), isFileNode(), isConceptNode(), fileCategory(), topLevelDir(), surpriseScore(), godNodes(), surprisingConnections() (+16 more)

### Community 12 - "Community 12"
Cohesion: 0.08
Nodes (38): estimateTokens(), querySubgraphTokens(), loadGraph(), runBenchmark(), bodyContent(), fileHash(), legacyFileHash(), safeNamespace() (+30 more)

### Community 50 - "Community 50"
Cohesion: 0.15
Nodes (11): normalizeSourceFilePath(), normalizedLabel(), asRecord(), asString(), readExistingGraphExtraction(), deduplicateByLabel(), buildFromJson(), build() (+3 more)

### Community 21 - "Community 21"
Cohesion: 0.07
Nodes (14): splitFiles(), changedFilesFromGit(), readJson(), isJsonRecord(), loadWikiDescriptionSidecarIndex(), loadFreshWikiDescriptionSidecarIndex(), graphContentHash(), scopeOptionDescription() (+6 more)

### Community 80 - "Community 80"
Cohesion: 0.27
Nodes (11): writeFileAtomic(), canonicalPlatformName(), platformNamesForError(), resolveGlobalSkillDestination(), findSkillFile(), renderAiderSkill(), loadSkillContent(), getInvocationExample() (+3 more)

### Community 100 - "Community 100"
Cohesion: 0.38
Nodes (7): opencodeConfigPath(), legacyOpencodeConfigPath(), loadOpenCodeConfig(), installOpenCodePlugin(), uninstallOpenCodePlugin(), uninstallCodexHook(), agentsUninstall()

### Community 65 - "Community 65"
Cohesion: 0.19
Nodes (16): previewPath(), emptyPreview(), platformInstallPreview(), globalSkillInstallPreview(), printMutationPreview(), getAgentsMdSection(), installGeminiMcp(), cursorInstall() (+8 more)

### Community 83 - "Community 83"
Cohesion: 0.27
Nodes (10): uninstallSkill(), uninstallAll(), uninstallGeminiMcp(), cursorUninstall(), antigravityUninstall(), kiroUninstall(), vscodeUninstall(), uninstallClaudeHook() (+2 more)

### Community 84 - "Community 84"
Cohesion: 0.33
Nodes (6): canonicalizeForPartition(), partition(), splitCommunity(), cluster(), cohesionScore(), scoreAll()

### Community 67 - "Community 67"
Cohesion: 0.19
Nodes (7): normalizeFlows(), normalizeAffectedFlows(), formatFlow(), appendReviewSections(), appendInputScopeSection(), appendFreshnessSection(), generate()

### Community 70 - "Community 70"
Cohesion: 0.22
Nodes (8): readLabelsJson(), readGraphAttributeLabels(), resolveCommunityLabels(), countNonCodeFiles(), formatDiagnosticSummary(), fileList(), buildProject(), defaultLabels()

### Community 20 - "Community 20"
Cohesion: 0.11
Nodes (32): uniqueResolved(), fullPageScreenshotExcludes(), buildConfiguredDetectionInputs(), emptyDetection(), warningFor(), recomputeDetection(), mergeScopeInspections(), mergeDetections() (+24 more)

### Community 26 - "Community 26"
Cohesion: 0.08
Nodes (10): uniqueSorted(), sortNodesByLocation(), mapChangesToNodes(), changedNodesFromFiles(), analyzeChanges(), uniqueSorted(), sortNodesByLocation(), mapChangesToNodes() (+2 more)

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (48): CODE_EXTENSIONS, DOC_EXTENSIONS, PAPER_EXTENSIONS, IMAGE_EXTENSIONS, OFFICE_EXTENSIONS, GOOGLE_WORKSPACE_EXTENSIONS, VIDEO_EXTENSIONS, SENSITIVE_PATTERNS (+40 more)

### Community 81 - "Community 81"
Cohesion: 0.27
Nodes (7): toPortableRelative(), estimateFileTokens(), readSemanticFile(), extractionShape(), mergeExtractions(), packSemanticFilesByTokenBudget(), extractSemanticFilesDirectParallel()

### Community 7 - "Community 7"
Cohesion: 0.06
Nodes (37): COMMUNITY_COLORS, CONFIDENCE_SCORE_DEFAULTS, CommunityLabelsInput, CommunityLabelOptions, HtmlOptions, JsonOptions, SvgOptions, CanvasOptions (+29 more)

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (70): ensureParserInit(), parseText(), resolveGrammarWasm(), loadLanguage(), _makeId(), toPortablePath(), inferCommonRoot(), projectRelativeFilePath() (+62 more)

### Community 10 - "Community 10"
Cohesion: 0.07
Nodes (34): isTestFile(), decoratorsOf(), hasFrameworkDecorator(), matchesEntryName(), sanitizeFlowName(), flowIdFor(), stableFiles(), detectEntryPoints() (+26 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (51): execGit(), safeExecGit(), resolveFromGitCwd(), gitRevParse(), safeGitRevParse(), resolveGitContext(), splitGitLines(), toPosixPath() (+43 more)

### Community 73 - "Community 73"
Cohesion: 0.26
Nodes (10): createGraph(), isDirectedGraph(), loadGraphFromData(), serializeGraph(), toUndirectedGraph(), forEachTraversalNeighbor(), traversalNeighbors(), mergedGraphType() (+2 more)

### Community 56 - "Community 56"
Cohesion: 0.19
Nodes (17): installHook(), uninstallHook(), hookBlockRegex(), escapeRegExp(), readTextFile(), installGraphAttributes(), uninstallGraphAttributes(), mergeDriverConfigStatus() (+9 more)

### Community 88 - "Community 88"
Cohesion: 0.44
Nodes (8): isRecord(), isStringArray(), validateImageCaption(), validateImageRouting(), isRecord(), isStringArray(), validateImageCaption(), validateImageRouting()

### Community 62 - "Community 62"
Cohesion: 0.19
Nodes (12): readJsonl(), asRecord(), readCaption(), artifactHasDeepRoute(), existingValidSidecarErrors(), importImageDataprepBatchResults(), readJsonl(), asRecord() (+4 more)

### Community 48 - "Community 48"
Cohesion: 0.17
Nodes (20): sha256(), fileHash(), mimeType(), sourcePage(), artifactId(), pdfArtifactByImage(), existingImages(), buildImageDataprepManifest() (+12 more)

### Community 33 - "Community 33"
Cohesion: 0.12
Nodes (26): asRecord(), parseFile(), stringArray(), numberValue(), countArray(), imageRoutingSampleFromCaption(), normalizeBucket(), loadImageRoutingLabels() (+18 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (44): yamlStr(), yamlQuoted(), safeFilename(), detectUrlType(), htmlToMarkdown(), fetchTweet(), fetchWebpage(), fetchArxiv() (+36 more)

### Community 45 - "Community 45"
Cohesion: 0.16
Nodes (24): readJson(), writeJson(), currentHead(), currentBranch(), upstreamRef(), mergeBase(), lifecyclePaths(), readLifecycleMetadata() (+16 more)

### Community 41 - "Community 41"
Cohesion: 0.1
Nodes (10): safeName(), instructionFileName(), isDirectLlmProvider(), defaultDirectLlmModel(), directProviderCredentialEnv(), resolveProviderCredential(), ensureProviderCredential(), resolveDirectModel() (+2 more)

### Community 92 - "Community 92"
Cohesion: 0.36
Nodes (4): readGraph(), hyperedgeSortKey(), mergeGraphAttributes(), mergeGraphJsonFiles()

### Community 49 - "Community 49"
Cohesion: 0.15
Nodes (14): shellQuote(), normalizeGitPath(), collectEntries(), gitAdvice(), planGraphifyOutMigration(), applyEntry(), migrateGraphifyOut(), shellQuote() (+6 more)

### Community 63 - "Community 63"
Cohesion: 0.19
Nodes (12): uniqueSorted(), riskFromScore(), suggestionsForTask(), topCommunities(), topFlowNames(), buildMinimalContext(), uniqueSorted(), riskFromScore() (+4 more)

### Community 54 - "Community 54"
Cohesion: 0.17
Nodes (18): stableJson(), sortJson(), sha256(), readJson(), writeJson(), wordCount(), relPath(), sortedSemanticFiles() (+10 more)

### Community 34 - "Community 34"
Cohesion: 0.1
Nodes (18): sha256(), stringValue(), ontologyNodeType(), writeJson(), safeFilename(), compileNodes(), compileRelations(), writeWiki() (+10 more)

### Community 93 - "Community 93"
Cohesion: 0.5
Nodes (6): readJson(), optionalJson(), stringValue(), evidenceRefsFromSources(), loadProfilePatchRuntimeContext(), loadOntologyPatchContext()

### Community 30 - "Community 30"
Cohesion: 0.16
Nodes (31): isRecord(), readableLogPath(), parseDecisionLogPath(), recordString(), decisionLogStatus(), decisionLogOperation(), decisionLogTarget(), decisionLogTouchesNode() (+23 more)

### Community 17 - "Community 17"
Cohesion: 0.12
Nodes (39): asRecord(), asStringArray(), normalizeStringMap(), stableForHash(), relationEndpoints(), normalizeRelation(), normalizeRegistry(), normalizeCitationPolicy() (+31 more)

### Community 82 - "Community 82"
Cohesion: 0.38
Nodes (10): readableStatePath(), ontologyReconciliationCandidatesPath(), ontologyAppliedPatchesPath(), ontologyNeedsUpdatePath(), loadReadonlyReconciliationCandidates(), reconciliationQueueIsStale(), listOntologyReconciliationCandidates(), getOntologyReconciliationCandidate() (+2 more)

### Community 66 - "Community 66"
Cohesion: 0.23
Nodes (11): sha256(), normalizeTerm(), uniqueSorted(), nodeTerms(), statusRank(), chooseCanonicalPair(), candidateScore(), candidateId() (+3 more)

### Community 57 - "Community 57"
Cohesion: 0.19
Nodes (13): optionalString(), optionalNumber(), optionalInteger(), candidateFilters(), decisionLogOptions(), jsonResult(), htmlResult(), statusForError() (+5 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (55): PDF_IMAGE_EXTENSIONS, PdfPreparationArtifact, PdfPreparationOptions, MistralOcrModule, cloneDetection(), countWords(), metadataPath(), listImageArtifacts() (+47 more)

### Community 14 - "Community 14"
Cohesion: 0.09
Nodes (36): isWindowsAbsolutePath(), hasSchemePrefix(), portablePath(), stripLeadingDotSlash(), toProjectRelativePath(), projectRootLabel(), normalizeMaybePath(), normalizeScopePath() (+28 more)

### Community 27 - "Community 27"
Cohesion: 0.11
Nodes (30): sampleLimit(), nodeTypeSection(), relationTypeSection(), relationMetadataSection(), registrySection(), citationSection(), hardeningSection(), inferencePolicySection() (+22 more)

### Community 60 - "Community 60"
Cohesion: 0.15
Nodes (12): readRegistryRows(), field(), normalizeRegistryRecord(), loadProfileRegistry(), safeIdPart(), registryRecordsToExtraction(), readRegistryRows(), field() (+4 more)

### Community 29 - "Community 29"
Cohesion: 0.14
Nodes (26): rel(), stringValue(), graphNodes(), graphLinks(), projectConfigSection(), registryCoverageSection(), unattachedEntitiesSection(), invalidRelationsSection() (+18 more)

### Community 19 - "Community 19"
Cohesion: 0.12
Nodes (24): stringValue(), stringArray(), citations(), addIssue(), validateCitations(), validateStatus(), buildEvidenceIds(), buildRegistryRecords() (+16 more)

### Community 51 - "Community 51"
Cohesion: 0.18
Nodes (19): asRecord(), asStringArray(), asBoolean(), asString(), asNumber(), resolvePath(), registrySourceName(), buildRegistrySources() (+11 more)

### Community 25 - "Community 25"
Cohesion: 0.08
Nodes (16): normalizePath(), isGraphifyStatePath(), sourceMatches(), communityLabel(), topLevelArea(), commitPrefixForArea(), dominantCommunity(), groupDraftForFile() (+8 more)

### Community 101 - "Community 101"
Cohesion: 0.47
Nodes (6): uniqueSorted(), mergeDrafts(), stalenessFrom(), minConfidence(), groupConfidence(), buildCommitRecommendation()

### Community 13 - "Community 13"
Cohesion: 0.06
Nodes (24): uniqueSorted(), riskLevel(), communityRisk(), nodeCommunities(), buildBlastRadius(), impactedCommunities(), multimodalSafety(), buildReviewAnalysis() (+16 more)

### Community 23 - "Community 23"
Cohesion: 0.08
Nodes (28): normalize(), uniqueSorted(), identifiers(), flowIdentifiers(), ratio(), average(), countHits(), formatMetric() (+20 more)

### Community 16 - "Community 16"
Cohesion: 0.09
Nodes (34): normalizePath(), uniqueSorted(), sourceMatches(), riskForImpactedNodes(), changedFunctionsWithoutTests(), isSensitivePath(), isInside(), formatLines() (+26 more)

### Community 64 - "Community 64"
Cohesion: 0.17
Nodes (9): normalizePath(), asString(), asNumber(), isTestPath(), pathMatches(), normalizeKind(), parseLineRange(), sortEdges() (+1 more)

### Community 9 - "Community 9"
Cohesion: 0.06
Nodes (32): compareStrings(), normalizePath(), uniqueSorted(), maybeCommunity(), nodeInfo(), compareNodes(), sourceMatches(), changedNodeIds() (+24 more)

### Community 11 - "Community 11"
Cohesion: 0.06
Nodes (31): normalizeSearchText(), textMatchesQuery(), scoreSearchText(), readJson(), writeJson(), scopeOptionDescription(), cacheOptionsFromRuntime(), loadProfileRuntimeContext() (+23 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (53): loadGraph(), getVersion(), communitiesFromGraph(), communityName(), mcpField(), nodeDisplayLabel(), scoreNodes(), bfs() (+45 more)

### Community 35 - "Community 35"
Cohesion: 0.11
Nodes (22): compareStrings(), round(), maybeCommunity(), communityLabels(), graphDensity(), nodeSummary(), compareHubs(), communityMembership() (+14 more)

### Community 116 - "Community 116"
Cohesion: 1
Nodes (1): UnpdfTextResult

### Community 74 - "Community 74"
Cohesion: 0.21
Nodes (7): mergeHyperedges(), builtFromCommit(), rebuildCode(), checkUpdate(), rebuildLockPath(), acquireRebuildLock(), releaseRebuildLock()

### Community 47 - "Community 47"
Cohesion: 0.17
Nodes (23): safeString(), uniqueSorted(), safeTargetId(), parseNodeCommunity(), collectSourceRefs(), collectNodeNeighbors(), collectNodeTargetContext(), collectCommunityTargetContext() (+15 more)

### Community 71 - "Community 71"
Cohesion: 0.23
Nodes (10): isRecord(), isNonEmptyString(), isStringOrNull(), isStringArray(), sha256(), buildWikiDescriptionCacheKey(), createInsufficientEvidenceRecord(), checkWikiDescriptionFreshness() (+2 more)

### Community 75 - "Community 75"
Cohesion: 0.31
Nodes (11): safeFilename(), uniquePageRefs(), normalizeFlows(), flowsThroughNodes(), crossCommunityLinks(), renderDescription(), communityArticle(), godNodeArticle() (+3 more)

### Community 85 - "Community 85"
Cohesion: 0.39
Nodes (8): qn(), addFunction(), addCall(), makeFlowStore(), qn(), addFunction(), addCall(), makeFlowStore()

### Community 96 - "Community 96"
Cohesion: 0.38
Nodes (4): qn(), addNode(), qn(), addNode()

### Community 22 - "Community 22"
Cohesion: 0.09
Nodes (15): validate(), process(), main(), HttpClient, Server, NewServer(), Config, HttpClientFactory (+7 more)

### Community 32 - "Community 32"
Cohesion: 0.08
Nodes (12): GraphifyDemo, IProcessor, DataProcessor, Processor, Get-Data(), Process-Items(), GraphifyDemo, IProcessor (+4 more)

### Community 86 - "Community 86"
Cohesion: 0.28
Nodes (6): MyApp.Accounts.User, create(), validate(), MyApp.Accounts.User, create(), validate()

### Community 55 - "Community 55"
Cohesion: 0.15
Nodes (14): Geometry, LinearAlgebra, Base, Shape, Point, Circle, area(), describe() (+6 more)

### Community 77 - "Community 77"
Cohesion: 0.18
Nodes (10): Animal, -initWithName, -speak, Dog, -fetch, Animal, -initWithName, -speak (+2 more)

### Community 59 - "Community 59"
Cohesion: 0.14
Nodes (2): ApiClient, ApiClient

### Community 97 - "Community 97"
Cohesion: 0.29
Nodes (2): Transformer, Transformer

### Community 78 - "Community 78"
Cohesion: 0.25
Nodes (4): Graph, build_graph(), Graph, build_graph()

### Community 61 - "Community 61"
Cohesion: 0.21
Nodes (10): compute_score(), normalize(), run_analysis(), Analyzer, Fixture: functions and methods that call each other - for call-graph extraction, compute_score(), normalize(), run_analysis() (+2 more)

### Community 87 - "Community 87"
Cohesion: 0.28
Nodes (4): qn(), addFunction(), qn(), addFunction()

### Community 89 - "Community 89"
Cohesion: 0.39
Nodes (8): qn(), addFunction(), addCall(), makeStore(), qn(), addFunction(), addCall(), makeStore()

### Community 114 - "Community 114"
Cohesion: 1
Nodes (2): semanticDetection(), discoveryContext()

### Community 115 - "Community 115"
Cohesion: 1
Nodes (2): runCliInTemp(), runCliWithEnvironment()

### Community 72 - "Community 72"
Cohesion: 0.18
Nodes (3): writeFixtureGraph(), writeOntologyPatchFixture(), writeOntologyReconciliationFixture()

### Community 38 - "Community 38"
Cohesion: 0.07
Nodes (24): tempDirs, mkGraph(), graph, communities, targets, prompt, outputDir, persistedSidecar (+16 more)

### Community 6 - "Community 6"
Cohesion: 0.06
Nodes (50): handle_upload(), handle_get(), handle_delete(), handle_list(), handle_search(), handle_enrich(), API module - exposes the document pipeline over HTTP. Thin layer over parser, va, Accept a list of file paths, run the full pipeline on each,     and return a sum (+42 more)

### Community 42 - "Community 42"
Cohesion: 0.1
Nodes (26): parse_file(), parse_markdown(), parse_json(), parse_plaintext(), parse_and_save(), batch_parse(), Parser module - reads raw input documents and converts them into a structured fo, Read a file from disk and return a structured document. (+18 more)

### Community 43 - "Community 43"
Cohesion: 0.1
Nodes (26): normalize_text(), extract_keywords(), enrich_document(), find_cross_references(), process_and_save(), reprocess_all(), Processor module - transforms validated documents into enriched records ready fo, Lowercase, strip extra whitespace, remove control characters. (+18 more)

### Community 28 - "Community 28"
Cohesion: 0.11
Nodes (32): _ensure_storage(), load_index(), save_index(), save_parsed(), save_processed(), load_record(), delete_record(), list_records() (+24 more)

### Community 18 - "Community 18"
Cohesion: 0.07
Nodes (35): Exception, HTTPError, RequestError, ConnectTimeout, ReadTimeout, WriteTimeout, PoolTimeout, NetworkError (+27 more)

### Community 46 - "Community 46"
Cohesion: 0.11
Nodes (12): BearerAuth, DigestAuth, NetRCAuth, Authentication handlers. Auth objects are callables that modify a request before, Modify the request. May yield to inspect the response., HTTP Basic Authentication., Bearer token authentication., HTTP Digest Authentication.     Requires a full request/response cycle: sends th (+4 more)

### Community 31 - "Community 31"
Cohesion: 0.17
Nodes (20): Auth, BasicAuth, NetRCAuth, Base class for all authentication handlers., Modify the request. May yield to inspect the response., HTTP Basic Authentication., Load credentials from ~/.netrc based on the request host., Timeout (+12 more)

### Community 58 - "Community 58"
Cohesion: 0.15
Nodes (8): BearerAuth, DigestAuth, Authentication handlers. Auth objects are callables that modify a request before, Bearer token authentication., HTTP Digest Authentication.     Requires a full request/response cycle: sends th, Extract digest parameters from the WWW-Authenticate header., Compute the Authorization header value for a digest challenge., Response

### Community 37 - "Community 37"
Cohesion: 0.16
Nodes (15): Auth, BasicAuth, Base class for all authentication handlers., Timeout, Limits, BaseClient, The main Client and AsyncClient classes. BaseClient holds all shared logic. Clie, Shared implementation for Client and AsyncClient.     Handles auth, redirects, c (+7 more)

### Community 39 - "Community 39"
Cohesion: 0.13
Nodes (2): Client, AsyncClient

### Community 40 - "Community 40"
Cohesion: 0.16
Nodes (17): TransportError, TimeoutException, ConnectError, An error occurred at the transport layer., Failed to establish a connection., BaseTransport, AsyncBaseTransport, MockTransport (+9 more)

### Community 44 - "Community 44"
Cohesion: 0.09
Nodes (6): Core data models: URL, Headers, Cookies, Request, Response. These are the centra, HTTPStatusError, A 4xx or 5xx response was received., URL, Headers, Core data models: URL, Headers, Cookies, Request, Response. These are the centra

### Community 53 - "Community 53"
Cohesion: 0.11
Nodes (3): URL, Headers, Cookies

### Community 15 - "Community 15"
Cohesion: 0.1
Nodes (30): TransportError, TimeoutException, ConnectTimeout, ReadTimeout, WriteTimeout, PoolTimeout, ConnectError, ProxyError (+22 more)

### Community 90 - "Community 90"
Cohesion: 0.31
Nodes (1): ConnectionPool

### Community 24 - "Community 24"
Cohesion: 0.06
Nodes (34): primitive_value_to_str(), normalize_header_key(), flatten_queryparams(), parse_content_type(), obfuscate_sensitive_headers(), unset_all_cookies(), is_known_encoding(), build_url_with_params() (+26 more)

### Community 8 - "Community 8"
Cohesion: 0.07
Nodes (48): _node_community_map(), _is_file_node(), god_nodes(), surprising_connections(), _is_concept_node(), _file_category(), _top_level_dir(), _surprise_score() (+40 more)

### Community 95 - "Community 95"
Cohesion: 0.38
Nodes (6): build_from_json(), build(), Merge multiple extraction results into one graph., build_from_json(), build(), Merge multiple extraction results into one graph.

### Community 52 - "Community 52"
Cohesion: 0.11
Nodes (20): build_graph(), cluster(), _split_community(), cohesion_score(), score_all(), Leiden community detection on NetworkX graphs. Splits oversized communities. Ret, Build a NetworkX graph from graphify node/edge dicts.      Preserves original ed, Run Leiden community detection. Returns {community_id: [node_ids]}.      Communi (+12 more)

### Community 103 - "Community 103"
Cohesion: 0.47
Nodes (6): uniqueSorted(), mergeDrafts(), stalenessFrom(), minConfidence(), groupConfidence(), buildCommitRecommendation()

### Community 69 - "Community 69"
Cohesion: 0.15
Nodes (1): AsyncClient

### Community 76 - "Community 76"
Cohesion: 0.18
Nodes (1): Client

### Community 99 - "Community 99"
Cohesion: 0.29
Nodes (6): HTTPError, RequestError, DecodingError, Base class for all httpx exceptions., An error occurred while issuing a request., Decoding of the response failed.

### Community 91 - "Community 91"
Cohesion: 0.25
Nodes (8): NetworkError, ReadError, WriteError, CloseError, A network error occurred., Failed to receive data from the network., Failed to send data through the network., Failed to close a connection.

### Community 79 - "Community 79"
Cohesion: 0.27
Nodes (2): ConnectionPool, HTTPTransport

### Community 68 - "Community 68"
Cohesion: 0.16
Nodes (15): asRecord(), asStringArray(), asBoolean(), asString(), asNumber(), resolvePath(), parsePdfOcrMode(), parseCitationMinimum() (+7 more)

## Knowledge Gaps
- **211 isolated node(s):** `CODE_EXTENSIONS`, `DOC_EXTENSIONS`, `PAPER_EXTENSIONS`, `IMAGE_EXTENSIONS`, `OFFICE_EXTENSIONS` (+206 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 116`** (1 nodes): `UnpdfTextResult`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 59`** (2 nodes): `ApiClient`, `ApiClient`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 97`** (2 nodes): `Transformer`, `Transformer`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 114`** (2 nodes): `semanticDetection()`, `discoveryContext()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 115`** (2 nodes): `runCliInTemp()`, `runCliWithEnvironment()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (2 nodes): `Client`, `AsyncClient`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 90`** (1 nodes): `ConnectionPool`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 69`** (1 nodes): `AsyncClient`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 76`** (1 nodes): `Client`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 79`** (2 nodes): `ConnectionPool`, `HTTPTransport`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Cookies` connect `Community 53` to `Community 44`, `Community 31`, `Community 39`, `Community 18`, `Community 24`?**
  _High betweenness centrality (0.003) - this node is a cross-community bridge._
- **Why does `Cookies` connect `Community 37` to `Community 44`, `Community 76`, `Community 69`, `Community 24`?**
  _High betweenness centrality (0.003) - this node is a cross-community bridge._
- **Why does `InvalidURL` connect `Community 37` to `Community 18`, `Community 76`, `Community 69`?**
  _High betweenness centrality (0.003) - this node is a cross-community bridge._
- **Are the 39 inferred relationships involving `Response` (e.g. with `Auth` and `BasicAuth`) actually correct?**
  _`Response` has 39 INFERRED edges - model-reasoned connections that need verification._
- **Are the 39 inferred relationships involving `Response` (e.g. with `Auth` and `BasicAuth`) actually correct?**
  _`Response` has 39 INFERRED edges - model-reasoned connections that need verification._
- **Are the 39 inferred relationships involving `Request` (e.g. with `Auth` and `BasicAuth`) actually correct?**
  _`Request` has 39 INFERRED edges - model-reasoned connections that need verification._
- **Are the 39 inferred relationships involving `Request` (e.g. with `Auth` and `BasicAuth`) actually correct?**
  _`Request` has 39 INFERRED edges - model-reasoned connections that need verification._