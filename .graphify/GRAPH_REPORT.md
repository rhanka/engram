# Graph Report - .  (2026-04-25)

## Corpus Check
- Large corpus: 203 files · ~228,581 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 1338 nodes · 2243 edges · 74 communities detected
- Extraction: 90% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 233 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output


## Input Scope
- Requested: auto
- Resolved: committed (source: default-auto)
- Included files: 203 · Candidates: 223
- Excluded: 0 untracked · 179 ignored · 0 sensitive · 0 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.
## God Nodes (most connected - your core abstractions)
1. `Response` - 45 edges
2. `Request` - 42 edges
3. `Client` - 27 edges
4. `Cookies` - 27 edges
5. `AsyncClient` - 26 edges
6. `_makeId()` - 24 edges
7. `TransportError` - 22 edges
8. `HTTPTransport` - 22 edges
9. `TimeoutException` - 21 edges
10. `BaseTransport` - 21 edges

## Surprising Connections (you probably didn't know these)
- `build()` --calls--> `buildFromJson()`  [EXTRACTED]
  worked/mixed-corpus/raw/build.py → src/build.ts
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
Cohesion: 0.03
Nodes (84): Auth, BasicAuth, BearerAuth, DigestAuth, NetRCAuth, Authentication handlers. Auth objects are callables that modify a request before, Load credentials from ~/.netrc based on the request host., Base class for all authentication handlers. (+76 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (46): agentsInstall(), agentsUninstall(), antigravityInstall(), antigravityUninstall(), canonicalPlatformName(), changedFilesFromGit(), checkSkillVersion(), claudeInstall() (+38 more)

### Community 2 - "Community 2"
Cohesion: 0.09
Nodes (51): _csharpExtraWalk(), ensureParserInit(), extract(), extractC(), extractCpp(), extractCsharp(), extractElixir(), _extractGeneric() (+43 more)

### Community 3 - "Community 3"
Cohesion: 0.12
Nodes (23): execGit(), gitRevParse(), resolveFromGitCwd(), resolveGitContext(), safeExecGit(), safeGitRevParse(), appendMemoryFiles(), buildGitInventory() (+15 more)

### Community 4 - "Community 4"
Cohesion: 0.11
Nodes (25): handle_delete(), handle_enrich(), handle_get(), handle_list(), handle_search(), handle_upload(), API module - exposes the document pipeline over HTTP. Thin layer over parser, va, Accept a list of file paths, run the full pipeline on each,     and return a sum (+17 more)

### Community 5 - "Community 5"
Cohesion: 0.15
Nodes (24): augmentDetectionWithTranscripts(), buildWhisperPrompt(), cloneDetection(), defaultWhisperCacheDir(), downloadAudio(), downloadFile(), ensureWhisperArtifacts(), envBoolean() (+16 more)

### Community 6 - "Community 6"
Cohesion: 0.12
Nodes (18): analyzeGraph(), cacheOptionsFromRuntime(), defaultLabels(), ensureExtractionShape(), getVersion(), loadGraph(), loadProfileRuntimeContext(), main() (+10 more)

### Community 7 - "Community 7"
Cohesion: 0.13
Nodes (24): _cross_community_surprises(), _cross_file_surprises(), _file_category(), god_nodes(), graph_diff(), _is_concept_node(), _is_file_node(), _node_community_map() (+16 more)

### Community 8 - "Community 8"
Cohesion: 0.13
Nodes (17): buildFlowArtifact(), computeFlowCriticality(), decoratorsOf(), detectEntryPoints(), flowIdFor(), flowListToText(), flowToSteps(), getFlowById() (+9 more)

### Community 9 - "Community 9"
Cohesion: 0.13
Nodes (14): buildCommitRecommendation(), commitPrefixForArea(), communityLabel(), dominantCommunity(), groupConfidence(), groupDraftForFile(), isGraphifyStatePath(), mergeDrafts() (+6 more)

### Community 10 - "Community 10"
Cohesion: 0.13
Nodes (16): buildReviewDelta(), changedNodeIds(), compareNodes(), compareStrings(), highRiskChains(), impactedNodeIds(), isTestPath(), likelyTestGaps() (+8 more)

### Community 11 - "Community 11"
Cohesion: 0.14
Nodes (15): bfs(), communitiesFromGraph(), communityName(), dfs(), findNode(), getVersion(), loadGraph(), scoreNodes() (+7 more)

### Community 12 - "Community 12"
Cohesion: 0.13
Nodes (8): Server, Config, HttpClient, HttpClientFactory, main(), NewServer(), process(), validate()

### Community 13 - "Community 13"
Cohesion: 0.19
Nodes (18): htmlScript(), htmlStyles(), hyperedgeScript(), isCanvasOptions(), isCommunityLabelOptions(), isSvgOptions(), neo4jLabel(), neo4jRelation() (+10 more)

### Community 14 - "Community 14"
Cohesion: 0.2
Nodes (18): collectJsonIssues(), collectStringIssues(), collectTextIssues(), hasSchemePrefix(), isIgnoredLocalArtifact(), isWindowsAbsolutePath(), makeDetectionPortable(), normalizeFileMap() (+10 more)

### Community 15 - "Community 15"
Cohesion: 0.14
Nodes (12): average(), buildBlastRadius(), buildReviewAnalysis(), communityRisk(), evaluateReviewAnalysis(), formatMetric(), impactedCommunities(), multimodalSafety() (+4 more)

### Community 16 - "Community 16"
Cohesion: 0.22
Nodes (16): applyConfiguredExcludes(), buildConfiguredDetectionInputs(), buildProfileState(), dataprepReport(), emptyDetection(), fullPageScreenshotExcludes(), mergeDetections(), mergeScopeInspections() (+8 more)

### Community 17 - "Community 17"
Cohesion: 0.2
Nodes (16): classifyFile(), convertOfficeFile(), countWords(), detect(), detectIncremental(), docxToMarkdown(), isIgnored(), isNoiseDir() (+8 more)

### Community 18 - "Community 18"
Cohesion: 0.22
Nodes (17): asBoolean(), asNumber(), asRecord(), asString(), asStringArray(), buildRegistrySources(), loadProjectConfig(), normalizeProjectConfig() (+9 more)

### Community 19 - "Community 19"
Cohesion: 0.26
Nodes (17): asRecord(), asStringArray(), bindOntologyProfile(), hashOntologyProfile(), loadOntologyProfile(), normalizeCitationPolicy(), normalizeHardeningPolicy(), normalizeOntologyProfile() (+9 more)

### Community 20 - "Community 20"
Cohesion: 0.12
Nodes (17): build_url_with_params(), flatten_queryparams(), is_known_encoding(), normalize_header_key(), obfuscate_sensitive_headers(), parse_content_type(), primitive_value_to_str(), Utility functions shared across the library. Small helpers that don't belong in (+9 more)

### Community 21 - "Community 21"
Cohesion: 0.16
Nodes (5): analyzeChanges(), changedNodesFromFiles(), mapChangesToNodes(), sortNodesByLocation(), uniqueSorted()

### Community 22 - "Community 22"
Cohesion: 0.14
Nodes (6): DataProcessor, Get-Data(), GraphifyDemo, IProcessor, Process-Items(), Processor

### Community 23 - "Community 23"
Cohesion: 0.21
Nodes (16): delete_record(), _ensure_storage(), list_records(), load_index(), load_record(), Storage module - persists documents to disk and maintains the search index. All, Load the full document index from disk., Persist the index to disk. (+8 more)

### Community 24 - "Community 24"
Cohesion: 0.18
Nodes (14): build_graph(), cluster(), cohesion_score(), cohesionScore(), partition(), Leiden community detection on NetworkX graphs. Splits oversized communities. Ret, Run Leiden community detection. Returns {community_id: [node_ids]}.      Communi, Build a NetworkX graph from graphify node/edge dicts.      Preserves original ed (+6 more)

### Community 25 - "Community 25"
Cohesion: 0.23
Nodes (13): asRecord(), bucketMatches(), calibrateImageRouting(), countArray(), imageRoutingSampleFromCaption(), loadImageRoutingLabels(), loadImageRoutingRules(), normalizeBucket() (+5 more)

### Community 26 - "Community 26"
Cohesion: 0.25
Nodes (13): buildReviewContext(), buildReviewGuidance(), buildSourceSnippets(), changedFunctionsWithoutTests(), extractRelevantLines(), formatLines(), isInside(), isSensitivePath() (+5 more)

### Community 27 - "Community 27"
Cohesion: 0.25
Nodes (13): buildProfileChunkPrompt(), buildProfileExtractionPrompt(), buildProfileValidationPrompt(), chunkGuidance(), citationSection(), genericSafetySection(), hardeningSection(), inputHintsSection() (+5 more)

### Community 28 - "Community 28"
Cohesion: 0.26
Nodes (12): crossCommunitySurprises(), crossFileSurprises(), edgeBetweennessSurprises(), fileCategory(), godNodes(), isConceptNode(), isFileNode(), nodeCommunityMap() (+4 more)

### Community 29 - "Community 29"
Cohesion: 0.23
Nodes (9): compileNodes(), compileOntologyOutputs(), compileRelations(), ontologyNodeType(), safeFilename(), sha256(), stringValue(), writeJson() (+1 more)

### Community 30 - "Community 30"
Cohesion: 0.34
Nodes (13): buildProfileReport(), graphLinks(), graphNodes(), highDegreeSection(), humanReviewSection(), invalidRelationsSection(), lowEvidenceSection(), pdfOcrSection() (+5 more)

### Community 31 - "Community 31"
Cohesion: 0.33
Nodes (9): addIssue(), citations(), isProfileEdge(), isRegistrySeed(), stringValue(), validateCitations(), validateEdge(), validateNode() (+1 more)

### Community 32 - "Community 32"
Cohesion: 0.21
Nodes (10): average(), countHits(), evaluateReviewBenchmarks(), flowIdentifiers(), formatMetric(), identifiers(), normalize(), ratio() (+2 more)

### Community 33 - "Community 33"
Cohesion: 0.22
Nodes (9): asNumber(), asString(), createReviewGraphStore(), isTestPath(), normalizeKind(), normalizePath(), parseLineRange(), pathMatches() (+1 more)

### Community 34 - "Community 34"
Cohesion: 0.24
Nodes (11): buildFirstHopSummary(), buildNextBestAction(), communityLabels(), communityMembership(), compareHubs(), compareStrings(), graphDensity(), internalEdgeCounts() (+3 more)

### Community 35 - "Community 35"
Cohesion: 0.2
Nodes (13): batch_parse(), parse_and_save(), parse_file(), parse_json(), parse_markdown(), parse_plaintext(), Parser module - reads raw input documents and converts them into a structured fo, Read a file from disk and return a structured document. (+5 more)

### Community 36 - "Community 36"
Cohesion: 0.2
Nodes (13): enrich_document(), extract_keywords(), find_cross_references(), normalize_text(), process_and_save(), Processor module - transforms validated documents into enriched records ready fo, Lowercase, strip extra whitespace, remove control characters., Pull non-stopword tokens from text, deduplicated. (+5 more)

### Community 37 - "Community 37"
Cohesion: 0.31
Nodes (12): currentBranch(), currentHead(), lifecyclePaths(), markLifecycleAnalyzed(), markLifecycleStale(), mergeBase(), planLifecyclePrune(), readJson() (+4 more)

### Community 38 - "Community 38"
Cohesion: 0.33
Nodes (11): bodyContent(), cachedFiles(), cacheDir(), cacheNamespace(), checkSemanticCache(), clearCache(), fileHash(), loadCached() (+3 more)

### Community 39 - "Community 39"
Cohesion: 0.33
Nodes (10): artifactId(), buildImageDataprepManifest(), existingImages(), fileHash(), mimeType(), pdfArtifactByImage(), runImageDataprep(), sha256() (+2 more)

### Community 40 - "Community 40"
Cohesion: 0.36
Nodes (11): detectUrlType(), downloadBinary(), fetchArxiv(), fetchTweet(), fetchWebpage(), htmlToMarkdown(), ingest(), normalizeIngestOptions() (+3 more)

### Community 41 - "Community 41"
Cohesion: 0.32
Nodes (11): augmentDetectionWithPdfPreflight(), cloneDetection(), countWords(), dedupe(), listImageArtifacts(), loadMistralOcrModule(), metadataPath(), preparePdf() (+3 more)

### Community 42 - "Community 42"
Cohesion: 0.32
Nodes (10): communityArticle(), crossCommunityLinks(), flowArticle(), flowsThroughNodes(), godNodeArticle(), indexMd(), normalizeFlows(), safeFilename() (+2 more)

### Community 43 - "Community 43"
Cohesion: 0.35
Nodes (8): countImageMarkers(), countWords(), extractPdfTextLayer(), extractWithPdfParse(), extractWithPdftotext(), normalizeText(), preflightPdf(), sha256()

### Community 44 - "Community 44"
Cohesion: 0.24
Nodes (8): Base, LinearAlgebra, area(), Circle, describe(), Geometry, Point, Shape

### Community 45 - "Community 45"
Cohesion: 0.24
Nodes (1): ApiClient

### Community 46 - "Community 46"
Cohesion: 0.36
Nodes (6): artifactHasDeepRoute(), asRecord(), existingValidSidecarErrors(), importImageDataprepBatchResults(), readCaption(), readJsonl()

### Community 47 - "Community 47"
Cohesion: 0.42
Nodes (7): applyEntry(), collectEntries(), gitAdvice(), migrateGraphifyOut(), normalizeGitPath(), planGraphifyOutMigration(), shellQuote()

### Community 48 - "Community 48"
Cohesion: 0.36
Nodes (6): buildMinimalContext(), riskFromScore(), suggestionsForTask(), topCommunities(), topFlowNames(), uniqueSorted()

### Community 49 - "Community 49"
Cohesion: 0.31
Nodes (4): isPrivateIp(), safeFetch(), safeFetchText(), validateUrl()

### Community 50 - "Community 50"
Cohesion: 0.31
Nodes (5): runCli(), runMain(), runSkillRuntime(), tempProfileProject(), tempProject()

### Community 51 - "Community 51"
Cohesion: 0.39
Nodes (5): Analyzer, compute_score(), normalize(), Fixture: functions and methods that call each other - for call-graph extraction, run_analysis()

### Community 52 - "Community 52"
Cohesion: 0.36
Nodes (4): escapeRegExp(), hookBlockRegex(), installHook(), uninstallHook()

### Community 53 - "Community 53"
Cohesion: 0.5
Nodes (7): defaultGraphPath(), defaultManifestPath(), defaultTranscriptsDir(), legacyGraphPath(), resolveGraphifyPaths(), resolveGraphInputPath(), statePath()

### Community 54 - "Community 54"
Cohesion: 0.36
Nodes (6): field(), loadProfileRegistry(), normalizeRegistryRecord(), readRegistryRows(), registryRecordsToExtraction(), safeIdPart()

### Community 55 - "Community 55"
Cohesion: 0.43
Nodes (6): appendInputScopeSection(), appendReviewSections(), formatFlow(), generate(), normalizeAffectedFlows(), normalizeFlows()

### Community 56 - "Community 56"
Cohesion: 0.52
Nodes (6): createGraph(), forEachTraversalNeighbor(), isDirectedGraph(), loadGraphFromData(), toUndirectedGraph(), traversalNeighbors()

### Community 58 - "Community 58"
Cohesion: 0.53
Nodes (4): estimateTokens(), loadGraph(), querySubgraphTokens(), runBenchmark()

### Community 59 - "Community 59"
Cohesion: 0.47
Nodes (4): build(), build_from_json(), buildFromJson(), Merge multiple extraction results into one graph.

### Community 60 - "Community 60"
Cohesion: 0.67
Nodes (5): buildProject(), countNonCodeFiles(), defaultLabels(), fileList(), formatDiagnosticSummary()

### Community 62 - "Community 62"
Cohesion: 0.33
Nodes (5): Animal, -initWithName, -speak, Dog, -fetch

### Community 63 - "Community 63"
Cohesion: 0.47
Nodes (2): build_graph(), Graph

### Community 64 - "Community 64"
Cohesion: 0.53
Nodes (4): addEdge(), addFunction(), makeReviewGraph(), qn()

### Community 65 - "Community 65"
Cohesion: 0.8
Nodes (4): isRecord(), isStringArray(), validateImageCaption(), validateImageRouting()

### Community 66 - "Community 66"
Cohesion: 0.7
Nodes (4): addCall(), addFunction(), makeFlowStore(), qn()

### Community 67 - "Community 67"
Cohesion: 0.5
Nodes (3): MyApp.Accounts.User, create(), validate()

### Community 68 - "Community 68"
Cohesion: 0.5
Nodes (2): addFunction(), qn()

### Community 69 - "Community 69"
Cohesion: 0.7
Nodes (4): addCall(), addFunction(), makeStore(), qn()

### Community 70 - "Community 70"
Cohesion: 0.7
Nodes (4): addCall(), addFunction(), makeBenchmarkStore(), qn()

### Community 72 - "Community 72"
Cohesion: 0.83
Nodes (3): normalizeSearchText(), scoreSearchText(), textMatchesQuery()

### Community 74 - "Community 74"
Cohesion: 0.67
Nodes (2): addNode(), qn()

### Community 75 - "Community 75"
Cohesion: 0.5
Nodes (1): Transformer

### Community 78 - "Community 78"
Cohesion: 1
Nodes (2): assertValid(), validateExtraction()

### Community 80 - "Community 80"
Cohesion: 1
Nodes (2): git(), hookPath()

## Knowledge Gaps
- **72 isolated node(s):** `GraphifyDemo`, `LinearAlgebra`, `Base`, `-initWithName`, `-speak` (+67 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 45`** (1 nodes): `ApiClient`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 63`** (2 nodes): `build_graph()`, `Graph`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 68`** (2 nodes): `addFunction()`, `qn()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 74`** (2 nodes): `addNode()`, `qn()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 75`** (1 nodes): `Transformer`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 78`** (2 nodes): `assertValid()`, `validateExtraction()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 80`** (2 nodes): `git()`, `hookPath()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ValidationError` connect `Community 4` to `Community 0`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **Why does `Cookies` connect `Community 0` to `Community 20`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **Are the 39 inferred relationships involving `Response` (e.g. with `Auth` and `BasicAuth`) actually correct?**
  _`Response` has 39 INFERRED edges - model-reasoned connections that need verification._
- **Are the 39 inferred relationships involving `Request` (e.g. with `Auth` and `BasicAuth`) actually correct?**
  _`Request` has 39 INFERRED edges - model-reasoned connections that need verification._
- **Are the 12 inferred relationships involving `Client` (e.g. with `Request` and `Response`) actually correct?**
  _`Client` has 12 INFERRED edges - model-reasoned connections that need verification._
- **Are the 19 inferred relationships involving `Cookies` (e.g. with `Timeout` and `Limits`) actually correct?**
  _`Cookies` has 19 INFERRED edges - model-reasoned connections that need verification._
- **Are the 12 inferred relationships involving `AsyncClient` (e.g. with `Request` and `Response`) actually correct?**
  _`AsyncClient` has 12 INFERRED edges - model-reasoned connections that need verification._