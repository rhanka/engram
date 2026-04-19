# Graph Report - .  (2026-04-19)

## Corpus Check
- 117 files · ~0 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1859 nodes · 3602 edges · 84 communities detected
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 233 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## God Nodes (most connected - your core abstractions)
1. `Response` - 45 edges
2. `Request` - 42 edges
3. `Client` - 27 edges
4. `Cookies` - 27 edges
5. `AsyncClient` - 26 edges
6. `_makeId()` - 23 edges
7. `_makeId()` - 23 edges
8. `_makeId()` - 23 edges
9. `_makeId()` - 23 edges
10. `TransportError` - 22 edges

## Surprising Connections (you probably didn't know these)
- `API module - exposes the document pipeline over HTTP. Thin layer over parser, va` --uses--> `ValidationError`  [INFERRED]
  /home/antoinefa/src/graphify/worked/example/raw/api.py → /home/antoinefa/src/graphify/worked/example/raw/validator.py
- `Accept a list of file paths, run the full pipeline on each,     and return a sum` --uses--> `ValidationError`  [INFERRED]
  /home/antoinefa/src/graphify/worked/example/raw/api.py → /home/antoinefa/src/graphify/worked/example/raw/validator.py
- `Fetch a document by ID and return it.` --uses--> `ValidationError`  [INFERRED]
  /home/antoinefa/src/graphify/worked/example/raw/api.py → /home/antoinefa/src/graphify/worked/example/raw/validator.py
- `Delete a document by ID.` --uses--> `ValidationError`  [INFERRED]
  /home/antoinefa/src/graphify/worked/example/raw/api.py → /home/antoinefa/src/graphify/worked/example/raw/validator.py
- `List all document IDs in storage.` --uses--> `ValidationError`  [INFERRED]
  /home/antoinefa/src/graphify/worked/example/raw/api.py → /home/antoinefa/src/graphify/worked/example/raw/validator.py

## Communities

### Community 0 - "Community 0"
Cohesion: 0.01
Nodes (307): agentsInstall(), agentsUninstall(), antigravityInstall(), antigravityUninstall(), applyEntry(), average(), bfs(), bodyContent() (+299 more)

### Community 1 - "Community 1"
Cohesion: 0.01
Nodes (305): applyEntry(), assertValid(), augmentDetectionWithPdfPreflight(), augmentDetectionWithTranscripts(), average(), bfs(), bodyContent(), build() (+297 more)

### Community 2 - "Community 2"
Cohesion: 0.01
Nodes (265): analyzeGraph(), applyEntry(), augmentDetectionWithPdfPreflight(), augmentDetectionWithTranscripts(), average(), bodyContent(), buildBlastRadius(), buildCommitRecommendation() (+257 more)

### Community 3 - "Community 3"
Cohesion: 0.03
Nodes (101): Auth, BasicAuth, BearerAuth, DigestAuth, NetRCAuth, Authentication handlers. Auth objects are callables that modify a request before, Load credentials from ~/.netrc based on the request host., Base class for all authentication handlers. (+93 more)

### Community 4 - "Community 4"
Cohesion: 0.04
Nodes (67): handle_delete(), handle_enrich(), handle_get(), handle_list(), handle_search(), handle_upload(), API module - exposes the document pipeline over HTTP. Thin layer over parser, va, Accept a list of file paths, run the full pipeline on each,     and return a sum (+59 more)

### Community 5 - "Community 5"
Cohesion: 0.04
Nodes (34): Base, Server, LinearAlgebra, Animal, -initWithName, -speak, ApiClient, area() (+26 more)

### Community 6 - "Community 6"
Cohesion: 0.1
Nodes (47): _csharpExtraWalk(), ensureParserInit(), extract(), extractC(), extractCpp(), extractCsharp(), extractElixir(), _extractGeneric() (+39 more)

### Community 7 - "Community 7"
Cohesion: 0.09
Nodes (36): _cross_community_surprises(), _cross_file_surprises(), crossCommunitySurprises(), crossFileSurprises(), edgeBetweennessSurprises(), _file_category(), fileCategory(), god_nodes() (+28 more)

### Community 8 - "Community 8"
Cohesion: 0.15
Nodes (24): augmentDetectionWithTranscripts(), buildWhisperPrompt(), cloneDetection(), defaultWhisperCacheDir(), downloadAudio(), downloadFile(), ensureWhisperArtifacts(), envBoolean() (+16 more)

### Community 9 - "Community 9"
Cohesion: 0.13
Nodes (14): buildCommitRecommendation(), commitPrefixForArea(), communityLabel(), dominantCommunity(), groupConfidence(), groupDraftForFile(), isGraphifyStatePath(), mergeDrafts() (+6 more)

### Community 10 - "Community 10"
Cohesion: 0.13
Nodes (16): buildReviewDelta(), changedNodeIds(), compareNodes(), compareStrings(), highRiskChains(), impactedNodeIds(), isTestPath(), likelyTestGaps() (+8 more)

### Community 11 - "Community 11"
Cohesion: 0.14
Nodes (12): average(), buildBlastRadius(), buildReviewAnalysis(), communityRisk(), evaluateReviewAnalysis(), formatMetric(), impactedCommunities(), multimodalSafety() (+4 more)

### Community 12 - "Community 12"
Cohesion: 0.14
Nodes (14): bfs(), communitiesFromGraph(), communityName(), dfs(), findNode(), loadGraph(), scoreNodes(), serve() (+6 more)

### Community 13 - "Community 13"
Cohesion: 0.19
Nodes (17): htmlScript(), htmlStyles(), hyperedgeScript(), isCanvasOptions(), isCommunityLabelOptions(), isSvgOptions(), neo4jLabel(), neo4jRelation() (+9 more)

### Community 14 - "Community 14"
Cohesion: 0.2
Nodes (15): classifyFile(), convertOfficeFile(), countWords(), detect(), detectIncremental(), docxToMarkdown(), isIgnored(), isNoiseDir() (+7 more)

### Community 15 - "Community 15"
Cohesion: 0.19
Nodes (14): build_graph(), cluster(), cohesion_score(), cohesionScore(), partition(), Leiden community detection on NetworkX graphs. Splits oversized communities. Ret, Run Leiden community detection. Returns {community_id: [node_ids]}.      Communi, Build a NetworkX graph from graphify node/edge dicts.      Preserves original ed (+6 more)

### Community 16 - "Community 16"
Cohesion: 0.24
Nodes (11): buildFirstHopSummary(), buildNextBestAction(), communityLabels(), communityMembership(), compareHubs(), compareStrings(), graphDensity(), internalEdgeCounts() (+3 more)

### Community 17 - "Community 17"
Cohesion: 0.31
Nodes (12): currentBranch(), currentHead(), lifecyclePaths(), markLifecycleAnalyzed(), markLifecycleStale(), mergeBase(), planLifecyclePrune(), readJson() (+4 more)

### Community 18 - "Community 18"
Cohesion: 0.36
Nodes (11): detectUrlType(), downloadBinary(), fetchArxiv(), fetchTweet(), fetchWebpage(), htmlToMarkdown(), ingest(), normalizeIngestOptions() (+3 more)

### Community 19 - "Community 19"
Cohesion: 0.32
Nodes (11): augmentDetectionWithPdfPreflight(), cloneDetection(), countWords(), dedupe(), listImageArtifacts(), loadMistralOcrModule(), metadataPath(), preparePdf() (+3 more)

### Community 20 - "Community 20"
Cohesion: 0.35
Nodes (8): countImageMarkers(), countWords(), extractPdfTextLayer(), extractWithPdfParse(), extractWithPdftotext(), normalizeText(), preflightPdf(), sha256()

### Community 21 - "Community 21"
Cohesion: 0.4
Nodes (9): bodyContent(), cachedFiles(), cacheDir(), checkSemanticCache(), clearCache(), fileHash(), loadCached(), saveCached() (+1 more)

### Community 22 - "Community 22"
Cohesion: 0.42
Nodes (7): applyEntry(), collectEntries(), gitAdvice(), migrateGraphifyOut(), normalizeGitPath(), planGraphifyOutMigration(), shellQuote()

### Community 23 - "Community 23"
Cohesion: 0.31
Nodes (4): isPrivateIp(), safeFetch(), safeFetchText(), validateUrl()

### Community 24 - "Community 24"
Cohesion: 0.39
Nodes (5): Analyzer, compute_score(), normalize(), Fixture: functions and methods that call each other - for call-graph extraction, run_analysis()

### Community 25 - "Community 25"
Cohesion: 0.36
Nodes (6): build(), build_from_json(), buildFromJson(), Merge multiple extraction results into one graph., assertValid(), validateExtraction()

### Community 26 - "Community 26"
Cohesion: 0.36
Nodes (4): escapeRegExp(), hookBlockRegex(), installHook(), uninstallHook()

### Community 27 - "Community 27"
Cohesion: 0.5
Nodes (7): defaultGraphPath(), defaultManifestPath(), defaultTranscriptsDir(), legacyGraphPath(), resolveGraphifyPaths(), resolveGraphInputPath(), statePath()

### Community 28 - "Community 28"
Cohesion: 0.52
Nodes (6): execGit(), gitRevParse(), resolveFromGitCwd(), resolveGitContext(), safeExecGit(), safeGitRevParse()

### Community 29 - "Community 29"
Cohesion: 0.52
Nodes (6): createGraph(), forEachTraversalNeighbor(), isDirectedGraph(), loadGraphFromData(), toUndirectedGraph(), traversalNeighbors()

### Community 30 - "Community 30"
Cohesion: 0.52
Nodes (6): communityArticle(), crossCommunityLinks(), godNodeArticle(), indexMd(), safeFilename(), toWiki()

### Community 31 - "Community 31"
Cohesion: 0.53
Nodes (4): estimateTokens(), loadGraph(), querySubgraphTokens(), runBenchmark()

### Community 32 - "Community 32"
Cohesion: 0.67
Nodes (5): buildProject(), countNonCodeFiles(), defaultLabels(), fileList(), formatDiagnosticSummary()

### Community 33 - "Community 33"
Cohesion: 0.47
Nodes (3): runCli(), runMain(), runSkillRuntime()

### Community 34 - "Community 34"
Cohesion: 0.4
Nodes (0):

### Community 35 - "Community 35"
Cohesion: 0.4
Nodes (0):

### Community 36 - "Community 36"
Cohesion: 0.83
Nodes (3): normalizeSearchText(), scoreSearchText(), textMatchesQuery()

### Community 37 - "Community 37"
Cohesion: 0.67
Nodes (0):

### Community 38 - "Community 38"
Cohesion: 1
Nodes (2): git(), hookPath()

### Community 39 - "Community 39"
Cohesion: 0.67
Nodes (0):

### Community 40 - "Community 40"
Cohesion: 0.67
Nodes (0):

### Community 41 - "Community 41"
Cohesion: 0.67
Nodes (0):

### Community 42 - "Community 42"
Cohesion: 1
Nodes (0):

### Community 43 - "Community 43"
Cohesion: 1
Nodes (0):

### Community 44 - "Community 44"
Cohesion: 1
Nodes (0):

### Community 45 - "Community 45"
Cohesion: 1
Nodes (0):

### Community 46 - "Community 46"
Cohesion: 1
Nodes (0):

### Community 47 - "Community 47"
Cohesion: 1
Nodes (0):

### Community 48 - "Community 48"
Cohesion: 1
Nodes (0):

### Community 49 - "Community 49"
Cohesion: 1
Nodes (0):

### Community 50 - "Community 50"
Cohesion: 1
Nodes (0):

### Community 51 - "Community 51"
Cohesion: 1
Nodes (0):

### Community 52 - "Community 52"
Cohesion: 1
Nodes (0):

### Community 53 - "Community 53"
Cohesion: 1
Nodes (0):

### Community 54 - "Community 54"
Cohesion: 1
Nodes (0):

### Community 55 - "Community 55"
Cohesion: 1
Nodes (0):

### Community 56 - "Community 56"
Cohesion: 1
Nodes (0):

### Community 57 - "Community 57"
Cohesion: 1
Nodes (0):

### Community 58 - "Community 58"
Cohesion: 1
Nodes (0):

### Community 59 - "Community 59"
Cohesion: 1
Nodes (0):

### Community 60 - "Community 60"
Cohesion: 1
Nodes (0):

### Community 61 - "Community 61"
Cohesion: 1
Nodes (0):

### Community 62 - "Community 62"
Cohesion: 1
Nodes (0):

### Community 63 - "Community 63"
Cohesion: 1
Nodes (0):

### Community 64 - "Community 64"
Cohesion: 1
Nodes (0):

### Community 65 - "Community 65"
Cohesion: 1
Nodes (0):

### Community 66 - "Community 66"
Cohesion: 1
Nodes (0):

### Community 67 - "Community 67"
Cohesion: 1
Nodes (0):

### Community 68 - "Community 68"
Cohesion: 1
Nodes (0):

### Community 69 - "Community 69"
Cohesion: 1
Nodes (0):

### Community 70 - "Community 70"
Cohesion: 1
Nodes (0):

### Community 71 - "Community 71"
Cohesion: 1
Nodes (0):

### Community 72 - "Community 72"
Cohesion: 1
Nodes (0):

### Community 73 - "Community 73"
Cohesion: 1
Nodes (0):

### Community 74 - "Community 74"
Cohesion: 1
Nodes (0):

### Community 75 - "Community 75"
Cohesion: 1
Nodes (0):

### Community 76 - "Community 76"
Cohesion: 1
Nodes (0):

### Community 77 - "Community 77"
Cohesion: 1
Nodes (0):

### Community 78 - "Community 78"
Cohesion: 1
Nodes (0):

### Community 79 - "Community 79"
Cohesion: 1
Nodes (0):

### Community 80 - "Community 80"
Cohesion: 1
Nodes (0):

### Community 81 - "Community 81"
Cohesion: 1
Nodes (0):

### Community 82 - "Community 82"
Cohesion: 1
Nodes (0):

### Community 83 - "Community 83"
Cohesion: 1
Nodes (0):

## Knowledge Gaps
- **72 isolated node(s):** `GraphifyDemo`, `LinearAlgebra`, `Base`, `-initWithName`, `-speak` (+67 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 42`** (2 nodes): `html-export.ts`, `safeToHtml()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (2 nodes): `report.ts`, `generate()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (2 nodes): `semantic-prepare.ts`, `prepareSemanticDetection()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (2 nodes): `analyze.test.ts`, `buildTestGraph()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 46`** (2 nodes): `build-project.test.ts`, `makeProjectDir()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (2 nodes): `cluster.test.ts`, `makeGraph()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (2 nodes): `platform-v4-integration.test.ts`, `runCliInTemp()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (2 nodes): `review-analysis.test.ts`, `makeGraph()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (2 nodes): `review.test.ts`, `makeGraph()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 51`** (2 nodes): `summary.test.ts`, `makeGraph()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (2 nodes): `transcribe.test.ts`, `mockYtDlpDownload()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (1 nodes): `index.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 55`** (1 nodes): `aider-integration.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 56`** (1 nodes): `build.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 57`** (1 nodes): `cache.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 58`** (1 nodes): `claude-integration.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 59`** (1 nodes): `cli.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 60`** (1 nodes): `codex-integration.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 61`** (1 nodes): `copilot-integration.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 62`** (1 nodes): `cursor-integration.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 63`** (1 nodes): `detect.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 64`** (1 nodes): `extract-call-confidence.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 65`** (1 nodes): `gemini-integration.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 66`** (1 nodes): `html-export.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 67`** (1 nodes): `ingest.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 68`** (1 nodes): `install-preview.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 69`** (1 nodes): `language-surface.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 70`** (1 nodes): `lifecycle.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 71`** (1 nodes): `mistral-ocr.integration.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 72`** (1 nodes): `opencode-integration.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 73`** (1 nodes): `paths.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 74`** (1 nodes): `pdf-preflight.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 75`** (1 nodes): `pipeline.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 76`** (1 nodes): `report.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 77`** (1 nodes): `search.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 78`** (1 nodes): `security.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 79`** (1 nodes): `skills.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 80`** (1 nodes): `validate.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 81`** (1 nodes): `wiki.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 82`** (1 nodes): `tsup.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 83`** (1 nodes): `vitest.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ValidationError` connect `Community 4` to `Community 3`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
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
- **What connects `GraphifyDemo`, `LinearAlgebra`, `Base` to the rest of the system?**
  _72 weakly-connected nodes found - possible documentation gaps or missing edges._