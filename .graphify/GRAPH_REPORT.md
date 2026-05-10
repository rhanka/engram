# Graph Report - .  (2026-05-10)

## Corpus Check
- Large corpus: 232 files · ~268,315 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 2424 nodes · 4689 edges · 85 communities detected
- Extraction: 90% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 466 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output


## Input Scope
- Requested: auto
- Resolved: committed (source: default-auto)
- Included files: 232 · Candidates: 248
- Excluded: 0 untracked · 20178 ignored · 0 sensitive · 0 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.

## Graph Freshness
- Built from Git commit: `0f8e258`
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
Nodes (69): buildResolvableLabelIndex(), _csharpExtraWalk(), ensureParserInit(), extract(), extractC(), extractCpp(), extractCsharp(), extractElixir() (+61 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (60): addError(), addWarning(), appendJsonLine(), applyOntologyPatch(), auditPath(), changedFiles(), evidenceRefsFromSources(), loadOntologyPatchContext() (+52 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (48): field(), loadProfileRegistry(), normalizeRegistryRecord(), readRegistryRows(), registryRecordsToExtraction(), safeIdPart(), asBoolean(), asNumber() (+40 more)

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (46): execGit(), gitRevParse(), resolveFromGitCwd(), resolveGitContext(), safeExecGit(), safeGitRevParse(), currentBranch(), currentHead() (+38 more)

### Community 4 - "Community 4"
Cohesion: 0.05
Nodes (30): analyzeChanges(), changedNodesFromFiles(), mapChangesToNodes(), sortNodesByLocation(), uniqueSorted(), average(), countHits(), evaluateReviewBenchmarks() (+22 more)

### Community 5 - "Community 5"
Cohesion: 0.05
Nodes (35): bfs(), communitiesFromGraph(), communityName(), dfs(), findNode(), getVersion(), loadGraph(), scoreNodes() (+27 more)

### Community 6 - "Community 6"
Cohesion: 0.06
Nodes (43): detectUrlType(), downloadBinary(), fetchArxiv(), fetchTweet(), fetchWebpage(), htmlToMarkdown(), ingest(), normalizeIngestOptions() (+35 more)

### Community 7 - "Community 7"
Cohesion: 0.07
Nodes (38): augmentDetectionWithPdfPreflight(), cloneDetection(), countWords(), dedupe(), listImageArtifacts(), loadMistralOcrModule(), metadataPath(), preparePdf() (+30 more)

### Community 8 - "Community 8"
Cohesion: 0.06
Nodes (50): handle_delete(), handle_enrich(), handle_get(), handle_list(), handle_search(), handle_upload(), API module - exposes the document pipeline over HTTP. Thin layer over parser, va, Accept a list of file paths, run the full pipeline on each,     and return a sum (+42 more)

### Community 9 - "Community 9"
Cohesion: 0.07
Nodes (48): _cross_community_surprises(), _cross_file_surprises(), _file_category(), god_nodes(), graph_diff(), _is_concept_node(), _is_file_node(), _node_community_map() (+40 more)

### Community 10 - "Community 10"
Cohesion: 0.06
Nodes (32): buildReviewDelta(), changedNodeIds(), compareNodes(), compareStrings(), highRiskChains(), impactedNodeIds(), isTestPath(), likelyTestGaps() (+24 more)

### Community 11 - "Community 11"
Cohesion: 0.07
Nodes (34): buildFlowArtifact(), computeFlowCriticality(), decoratorsOf(), detectEntryPoints(), flowIdFor(), flowListToText(), flowToSteps(), getFlowById() (+26 more)

### Community 12 - "Community 12"
Cohesion: 0.06
Nodes (23): estimateFileTokens(), extractionShape(), extractSemanticFilesDirectParallel(), mergeExtractions(), packSemanticFilesByTokenBudget(), readSemanticFile(), toPortableRelative(), createDirectTextJsonClient() (+15 more)

### Community 13 - "Community 13"
Cohesion: 0.07
Nodes (37): CloseError, ConnectError, ConnectTimeout, NetworkError, PoolTimeout, ProtocolError, ProxyError, An error occurred at the transport layer. (+29 more)

### Community 14 - "Community 14"
Cohesion: 0.07
Nodes (28): buildCommitRecommendation(), commitPrefixForArea(), communityLabel(), dominantCommunity(), groupConfidence(), groupDraftForFile(), isGraphifyStatePath(), mergeDrafts() (+20 more)

### Community 15 - "Community 15"
Cohesion: 0.08
Nodes (38): estimateTokens(), loadGraph(), querySubgraphTokens(), runBenchmark(), defaultGraphPath(), defaultManifestPath(), defaultTranscriptsDir(), legacyGraphPath() (+30 more)

### Community 16 - "Community 16"
Cohesion: 0.06
Nodes (24): average(), buildBlastRadius(), buildReviewAnalysis(), communityRisk(), evaluateReviewAnalysis(), formatMetric(), impactedCommunities(), multimodalSafety() (+16 more)

### Community 17 - "Community 17"
Cohesion: 0.11
Nodes (16): Auth, BasicAuth, BaseClient, Limits, The main Client and AsyncClient classes. BaseClient holds all shared logic. Clie, Asynchronous HTTP client., Shared implementation for Client and AsyncClient.     Handles auth, redirects, c, Synchronous HTTP client. (+8 more)

### Community 18 - "Community 18"
Cohesion: 0.09
Nodes (34): buildReviewContext(), buildReviewGuidance(), buildSourceSnippets(), changedFunctionsWithoutTests(), extractRelevantLines(), formatLines(), isInside(), isSensitivePath() (+26 more)

### Community 19 - "Community 19"
Cohesion: 0.12
Nodes (39): asRecord(), asStringArray(), bindOntologyProfile(), hashOntologyProfile(), loadOntologyProfile(), normalizeCitationPolicy(), normalizeHardeningPolicy(), normalizeOntologyProfile() (+31 more)

### Community 20 - "Community 20"
Cohesion: 0.1
Nodes (36): collectJsonIssues(), collectStringIssues(), collectTextIssues(), hasSchemePrefix(), isIgnoredLocalArtifact(), isWindowsAbsolutePath(), makeDetectionPortable(), normalizeFileMap() (+28 more)

### Community 21 - "Community 21"
Cohesion: 0.07
Nodes (35): Exception, CloseError, ConnectTimeout, CookieConflict, DecodingError, HTTPError, HTTPStatusError, NetworkError (+27 more)

### Community 22 - "Community 22"
Cohesion: 0.12
Nodes (24): addIssue(), citations(), isProfileEdge(), isRegistrySeed(), stringValue(), validateCitations(), validateEdge(), validateNode() (+16 more)

### Community 23 - "Community 23"
Cohesion: 0.11
Nodes (32): applyConfiguredExcludes(), buildConfiguredDetectionInputs(), buildProfileState(), dataprepReport(), emptyDetection(), fullPageScreenshotExcludes(), mergeDetections(), mergeScopeInspections() (+24 more)

### Community 24 - "Community 24"
Cohesion: 0.11
Nodes (34): appendMemoryFiles(), buildGitInventory(), countGitPaths(), fallbackAllScope(), gitInventory(), inspectInputScope(), isInputScopeMode(), makeScope() (+26 more)

### Community 25 - "Community 25"
Cohesion: 0.09
Nodes (15): Config, HttpClient, HttpClientFactory, main(), NewServer(), process(), validate(), Server (+7 more)

### Community 26 - "Community 26"
Cohesion: 0.06
Nodes (34): build_url_with_params(), flatten_queryparams(), is_known_encoding(), normalize_header_key(), obfuscate_sensitive_headers(), parse_content_type(), primitive_value_to_str(), Utility functions shared across the library. Small helpers that don't belong in (+26 more)

### Community 27 - "Community 27"
Cohesion: 0.11
Nodes (30): buildProfileChunkPrompt(), buildProfileExtractionPrompt(), buildProfileValidationPrompt(), chunkGuidance(), citationSection(), genericSafetySection(), hardeningSection(), inputHintsSection() (+22 more)

### Community 28 - "Community 28"
Cohesion: 0.11
Nodes (32): delete_record(), _ensure_storage(), list_records(), load_index(), load_record(), Storage module - persists documents to disk and maintains the search index. All, Load the full document index from disk., Persist the index to disk. (+24 more)

### Community 29 - "Community 29"
Cohesion: 0.14
Nodes (26): buildProfileReport(), graphLinks(), graphNodes(), highDegreeSection(), humanReviewSection(), invalidRelationsSection(), lowEvidenceSection(), pdfOcrSection() (+18 more)

### Community 30 - "Community 30"
Cohesion: 0.17
Nodes (19): ConnectError, An error occurred at the transport layer., Failed to establish a connection., TimeoutException, TransportError, Request, AsyncBaseTransport, AsyncHTTPTransport (+11 more)

### Community 31 - "Community 31"
Cohesion: 0.08
Nodes (12): DataProcessor, Get-Data(), GraphifyDemo, IProcessor, Process-Items(), Processor, DataProcessor, Get-Data() (+4 more)

### Community 32 - "Community 32"
Cohesion: 0.12
Nodes (26): asRecord(), bucketMatches(), calibrateImageRouting(), countArray(), imageRoutingSampleFromCaption(), loadImageRoutingLabels(), loadImageRoutingRules(), normalizeBucket() (+18 more)

### Community 33 - "Community 33"
Cohesion: 0.08
Nodes (10): changedFilesFromGit(), checkSkillVersion(), ensureCliExtractionShape(), getPlatformsToCheck(), loadCliProfileContext(), main(), mergeCliAstAndSemantic(), readJson() (+2 more)

### Community 34 - "Community 34"
Cohesion: 0.1
Nodes (18): compileNodes(), compileOntologyOutputs(), compileRelations(), ontologyNodeType(), safeFilename(), sha256(), stringValue(), writeJson() (+10 more)

### Community 35 - "Community 35"
Cohesion: 0.11
Nodes (22): buildFirstHopSummary(), buildNextBestAction(), communityLabels(), communityMembership(), compareHubs(), compareStrings(), graphDensity(), internalEdgeCounts() (+14 more)

### Community 36 - "Community 36"
Cohesion: 0.12
Nodes (24): crossCommunitySurprises(), crossFileSurprises(), edgeBetweennessSurprises(), fileCategory(), godNodes(), isConceptNode(), isFileNode(), nodeCommunityMap() (+16 more)

### Community 37 - "Community 37"
Cohesion: 0.17
Nodes (15): Auth, BasicAuth, BaseClient, Limits, The main Client and AsyncClient classes. BaseClient holds all shared logic. Clie, Asynchronous HTTP client., Shared implementation for Client and AsyncClient.     Handles auth, redirects, c, Synchronous HTTP client. (+7 more)

### Community 38 - "Community 38"
Cohesion: 0.11
Nodes (11): asRecord(), asString(), build(), buildFromJson(), buildMerge(), deduplicateByLabel(), normalizedLabel(), normalizeSourceFilePath() (+3 more)

### Community 39 - "Community 39"
Cohesion: 0.1
Nodes (14): BearerAuth, DigestAuth, NetRCAuth, Authentication handlers. Auth objects are callables that modify a request before, Load credentials from ~/.netrc based on the request host., Base class for all authentication handlers., Modify the request. May yield to inspect the response., HTTP Basic Authentication. (+6 more)

### Community 40 - "Community 40"
Cohesion: 0.13
Nodes (2): AsyncClient, Client

### Community 41 - "Community 41"
Cohesion: 0.1
Nodes (26): batch_parse(), parse_and_save(), parse_file(), parse_json(), parse_markdown(), parse_plaintext(), Parser module - reads raw input documents and converts them into a structured fo, Read a file from disk and return a structured document. (+18 more)

### Community 42 - "Community 42"
Cohesion: 0.1
Nodes (26): enrich_document(), extract_keywords(), find_cross_references(), normalize_text(), process_and_save(), Processor module - transforms validated documents into enriched records ready fo, Lowercase, strip extra whitespace, remove control characters., Pull non-stopword tokens from text, deduplicated. (+18 more)

### Community 43 - "Community 43"
Cohesion: 0.09
Nodes (6): Core data models: URL, Headers, Cookies, Request, Response. These are the centra, HTTPStatusError, A 4xx or 5xx response was received., Headers, Core data models: URL, Headers, Cookies, Request, Response. These are the centra, URL

### Community 44 - "Community 44"
Cohesion: 0.13
Nodes (13): BearerAuth, DigestAuth, NetRCAuth, Load credentials from ~/.netrc based on the request host., Base class for all authentication handlers., Modify the request. May yield to inspect the response., HTTP Basic Authentication., Bearer token authentication. (+5 more)

### Community 45 - "Community 45"
Cohesion: 0.15
Nodes (23): classifyFile(), convertOfficeFile(), countWords(), detect(), detectIncremental(), docxToMarkdown(), findVcsRoot(), hasCodeShebang() (+15 more)

### Community 46 - "Community 46"
Cohesion: 0.16
Nodes (19): buildFreshnessMetadata(), htmlScript(), htmlStyles(), hyperedgeScript(), isCanvasOptions(), isCommunityLabelOptions(), isSvgOptions(), neo4jLabel() (+11 more)

### Community 47 - "Community 47"
Cohesion: 0.17
Nodes (20): artifactId(), buildImageDataprepManifest(), existingImages(), fileHash(), mimeType(), pdfArtifactByImage(), runImageDataprep(), sha256() (+12 more)

### Community 48 - "Community 48"
Cohesion: 0.16
Nodes (23): antigravityInstall(), canonicalPlatformName(), claudeInstall(), cursorInstall(), emptyPreview(), findSkillFile(), geminiInstall(), getInvocationExample() (+15 more)

### Community 49 - "Community 49"
Cohesion: 0.15
Nodes (14): applyEntry(), collectEntries(), gitAdvice(), migrateGraphifyOut(), normalizeGitPath(), planGraphifyOutMigration(), shellQuote(), applyEntry() (+6 more)

### Community 50 - "Community 50"
Cohesion: 0.11
Nodes (20): build_graph(), cluster(), cohesion_score(), Leiden community detection on NetworkX graphs. Splits oversized communities. Ret, Run Leiden community detection. Returns {community_id: [node_ids]}.      Communi, Build a NetworkX graph from graphify node/edge dicts.      Preserves original ed, Run a second Leiden pass on a community subgraph to split it further., Ratio of actual intra-community edges to maximum possible. (+12 more)

### Community 51 - "Community 51"
Cohesion: 0.17
Nodes (18): allowedPathFor(), buildOntologyDiscoveryDiff(), buildOntologyDiscoverySample(), knownEvidenceRefs(), loadOntologyDiscoveryContext(), readJson(), registrySamples(), relPath() (+10 more)

### Community 52 - "Community 52"
Cohesion: 0.15
Nodes (14): Base, area(), Circle, describe(), Geometry, Point, Shape, LinearAlgebra (+6 more)

### Community 53 - "Community 53"
Cohesion: 0.14
Nodes (2): ApiClient, ApiClient

### Community 54 - "Community 54"
Cohesion: 0.21
Nodes (10): Analyzer, compute_score(), normalize(), Fixture: functions and methods that call each other - for call-graph extraction, run_analysis(), Analyzer, compute_score(), normalize() (+2 more)

### Community 55 - "Community 55"
Cohesion: 0.19
Nodes (12): artifactHasDeepRoute(), asRecord(), existingValidSidecarErrors(), importImageDataprepBatchResults(), readCaption(), readJsonl(), artifactHasDeepRoute(), asRecord() (+4 more)

### Community 56 - "Community 56"
Cohesion: 0.19
Nodes (12): buildMinimalContext(), riskFromScore(), suggestionsForTask(), topCommunities(), topFlowNames(), uniqueSorted(), buildMinimalContext(), riskFromScore() (+4 more)

### Community 57 - "Community 57"
Cohesion: 0.17
Nodes (9): asNumber(), asString(), createReviewGraphStore(), isTestPath(), normalizeKind(), normalizePath(), parseLineRange(), pathMatches() (+1 more)

### Community 58 - "Community 58"
Cohesion: 0.21
Nodes (15): escapeRegExp(), hookBlockRegex(), install(), installGraphAttributes(), installHook(), installMergeDriverConfig(), mergeDriverConfigStatus(), readTextFile() (+7 more)

### Community 59 - "Community 59"
Cohesion: 0.19
Nodes (7): appendFreshnessSection(), appendInputScopeSection(), appendReviewSections(), formatFlow(), generate(), normalizeAffectedFlows(), normalizeFlows()

### Community 60 - "Community 60"
Cohesion: 0.15
Nodes (1): AsyncClient

### Community 61 - "Community 61"
Cohesion: 0.22
Nodes (5): buildProject(), countNonCodeFiles(), defaultLabels(), fileList(), formatDiagnosticSummary()

### Community 62 - "Community 62"
Cohesion: 0.26
Nodes (10): createGraph(), forEachTraversalNeighbor(), isDirectedGraph(), loadGraphFromData(), serializeGraph(), toUndirectedGraph(), traversalNeighbors(), mergedGraphType() (+2 more)

### Community 63 - "Community 63"
Cohesion: 0.28
Nodes (10): communityArticle(), crossCommunityLinks(), flowArticle(), flowsThroughNodes(), godNodeArticle(), indexMd(), normalizeFlows(), safeFilename() (+2 more)

### Community 64 - "Community 64"
Cohesion: 0.18
Nodes (1): Client

### Community 65 - "Community 65"
Cohesion: 0.18
Nodes (10): Animal, -initWithName, -speak, Dog, -fetch, Animal, -initWithName, -speak (+2 more)

### Community 66 - "Community 66"
Cohesion: 0.25
Nodes (4): build_graph(), Graph, build_graph(), Graph

### Community 67 - "Community 67"
Cohesion: 0.24
Nodes (10): agentsInstall(), agentsUninstall(), getAgentsMdSection(), installCodexHook(), installOpenCodePlugin(), legacyOpencodeConfigPath(), loadOpenCodeConfig(), opencodeConfigPath() (+2 more)

### Community 68 - "Community 68"
Cohesion: 0.27
Nodes (10): antigravityUninstall(), claudeUninstall(), cursorUninstall(), geminiUninstall(), kiroUninstall(), uninstallAll(), uninstallClaudeHook(), uninstallGeminiMcp() (+2 more)

### Community 69 - "Community 69"
Cohesion: 0.33
Nodes (6): canonicalizeForPartition(), cluster(), cohesionScore(), partition(), scoreAll(), splitCommunity()

### Community 70 - "Community 70"
Cohesion: 0.39
Nodes (8): addCall(), addFunction(), makeFlowStore(), qn(), addCall(), addFunction(), makeFlowStore(), qn()

### Community 71 - "Community 71"
Cohesion: 0.28
Nodes (6): MyApp.Accounts.User, create(), validate(), MyApp.Accounts.User, create(), validate()

### Community 72 - "Community 72"
Cohesion: 0.28
Nodes (4): addFunction(), qn(), addFunction(), qn()

### Community 73 - "Community 73"
Cohesion: 0.44
Nodes (8): isRecord(), isStringArray(), validateImageCaption(), validateImageRouting(), isRecord(), isStringArray(), validateImageCaption(), validateImageRouting()

### Community 74 - "Community 74"
Cohesion: 0.39
Nodes (8): addCall(), addFunction(), makeStore(), qn(), addCall(), addFunction(), makeStore(), qn()

### Community 75 - "Community 75"
Cohesion: 0.31
Nodes (1): ConnectionPool

### Community 76 - "Community 76"
Cohesion: 0.39
Nodes (8): addCall(), addFunction(), makeBenchmarkStore(), qn(), addCall(), addFunction(), makeBenchmarkStore(), qn()

### Community 77 - "Community 77"
Cohesion: 0.31
Nodes (1): ConnectionPool

### Community 78 - "Community 78"
Cohesion: 0.36
Nodes (4): hyperedgeSortKey(), mergeGraphAttributes(), mergeGraphJsonFiles(), readGraph()

### Community 79 - "Community 79"
Cohesion: 0.32
Nodes (4): builtFromCommit(), checkUpdate(), mergeHyperedges(), rebuildCode()

### Community 80 - "Community 80"
Cohesion: 0.38
Nodes (6): build(), build_from_json(), Merge multiple extraction results into one graph., build(), build_from_json(), Merge multiple extraction results into one graph.

### Community 81 - "Community 81"
Cohesion: 0.38
Nodes (4): addNode(), qn(), addNode(), qn()

### Community 82 - "Community 82"
Cohesion: 0.29
Nodes (2): Transformer, Transformer

### Community 83 - "Community 83"
Cohesion: 0.29
Nodes (6): DecodingError, HTTPError, An error occurred while issuing a request., Decoding of the response failed., Base class for all httpx exceptions., RequestError

### Community 89 - "Community 89"
Cohesion: 1
Nodes (2): runCliInTemp(), runCliWithEnvironment()

## Knowledge Gaps
- **140 isolated node(s):** `GraphifyDemo`, `-initWithName`, `-speak`, `-fetch`, `Fixture: functions and methods that call each other - for call-graph extraction` (+135 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 40`** (2 nodes): `AsyncClient`, `Client`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (2 nodes): `ApiClient`, `ApiClient`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 60`** (1 nodes): `AsyncClient`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 64`** (1 nodes): `Client`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 75`** (1 nodes): `ConnectionPool`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 77`** (1 nodes): `ConnectionPool`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 82`** (2 nodes): `Transformer`, `Transformer`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 89`** (2 nodes): `runCliInTemp()`, `runCliWithEnvironment()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Cookies` connect `Community 17` to `Community 43`, `Community 40`, `Community 21`, `Community 26`?**
  _High betweenness centrality (0.003) - this node is a cross-community bridge._
- **Why does `Cookies` connect `Community 37` to `Community 43`, `Community 64`, `Community 60`, `Community 26`?**
  _High betweenness centrality (0.003) - this node is a cross-community bridge._
- **Why does `InvalidURL` connect `Community 37` to `Community 21`, `Community 64`, `Community 60`?**
  _High betweenness centrality (0.003) - this node is a cross-community bridge._
- **Are the 39 inferred relationships involving `Response` (e.g. with `Auth` and `BasicAuth`) actually correct?**
  _`Response` has 39 INFERRED edges - model-reasoned connections that need verification._
- **Are the 39 inferred relationships involving `Response` (e.g. with `Auth` and `BasicAuth`) actually correct?**
  _`Response` has 39 INFERRED edges - model-reasoned connections that need verification._
- **Are the 39 inferred relationships involving `Request` (e.g. with `Auth` and `BasicAuth`) actually correct?**
  _`Request` has 39 INFERRED edges - model-reasoned connections that need verification._
- **Are the 39 inferred relationships involving `Request` (e.g. with `Auth` and `BasicAuth`) actually correct?**
  _`Request` has 39 INFERRED edges - model-reasoned connections that need verification._