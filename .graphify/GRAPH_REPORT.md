# Graph Report - .  (2026-06-08)

## Corpus Check
- 393 files · ~476,271 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 5498 nodes · 10633 edges · 224 communities detected
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 466 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output
- Edge kinds: contains: 4687 · calls: 2552 · imports: 1136 · imports_from: 674 · re_exports: 552 · uses: 466 · method: 274 · rationale_for: 208 · inherits: 68 · defines: 16


## Input Scope
- Requested: auto
- Resolved: committed (source: default-auto)
- Included files: 393 · Candidates: 430
- Excluded: 0 untracked · 28351 ignored · 8 sensitive · 0 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.

## Graph Freshness
- Built from Git commit: `8e7069c`
- Compare this hash to `git rev-parse HEAD` before trusting freshness-sensitive graph output.
## God Nodes (most connected - your core abstractions)
1. `Response` - 45 edges
2. `Response` - 45 edges
3. `Request` - 42 edges
4. `Request` - 42 edges
5. `_makeId()` - 30 edges
6. `It` - 28 edges
7. `Client` - 27 edges
8. `Cookies` - 27 edges
9. `Client` - 27 edges
10. `Cookies` - 27 edges

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

### Community 1 - "PDF preflight & semantic prep"
Cohesion: 0.03
Nodes (74): Nt, Qs, Js, ur, fr, dr, kn, Dn (+66 more)

### Community 49 - "Community 49"
Cohesion: 0.09
Nodes (12): n(), ki(), It, zo(), Bo(), jo, Bi(), $i() (+4 more)

### Community 101 - "Community 101"
Cohesion: 0.11
Nodes (19): r(), Zs(), qi(), Go(), ji(), Rn, Yr(), ht() (+11 more)

### Community 41 - "LLM execution (direct backends)"
Cohesion: 0.17
Nodes (36): Dt(), Ii, kr(), so(), xo(), We(), j(), Tr() (+28 more)

### Community 86 - "Community 86"
Cohesion: 0.10
Nodes (24): Xs(), ro(), Ri(), Gi(), l(), cs(), us(), on (+16 more)

### Community 199 - "Community 199"
Cohesion: 0.33
Nodes (6): io(), Li(), bt(), Fo(), ai(), bl()

### Community 69 - "Community 69"
Cohesion: 0.09
Nodes (26): lo(), ko(), Pi(), Ir(), Vr(), Do(), Ho(), Ui() (+18 more)

### Community 73 - "Community 73"
Cohesion: 0.13
Nodes (18): $t(), ve(), Ni(), Oi(), zi(), Ar(), Cr(), Fi() (+10 more)

### Community 141 - "Community 141"
Cohesion: 0.19
Nodes (12): vt(), Qo(), la(), ua(), da(), ds(), ps(), gs() (+4 more)

### Community 200 - "Community 200"
Cohesion: 0.33
Nodes (5): { spawnSync }, { dirname, join }, entry, cli, result

### Community 142 - "Community 142"
Cohesion: 0.14
Nodes (13): nodeCount, edgeCount, nodes, edges, buildStart, graph, styleStart, style (+5 more)

### Community 136 - "Community 136"
Cohesion: 0.16
Nodes (10): NodeId, HighLevelGraphNode, HighLevelGraphInput, NodeFlags, LayoutOptions, CameraState, FitViewOptions, GraphRendererOptions (+2 more)

### Community 171 - "Community 171"
Cohesion: 0.31
Nodes (8): EdgeCurveMode, EdgePolylineOptions, Point, readPoint(), quadraticPoint(), arcControl(), buildEdgePolylinePositions(), RenderGraphInput

### Community 154 - "Community 154"
Cohesion: 0.24
Nodes (9): assertPositionArray(), copyPositions(), createPositionFrame(), computePositionBounds(), RenderGraphBuffers, PositionBounds, PositionFrameMeta, PositionFrame (+1 more)

### Community 55 - "Community 55"
Cohesion: 0.08
Nodes (25): GraphCanvasLike, GraphContext, Graph2DContext, RendererState, AttributeLocations, UniformLocations, DrawProgram, RenderResources (+17 more)

### Community 130 - "Community 130"
Cohesion: 0.17
Nodes (15): RGBA, DEFAULT_NODE_COLOR, DEFAULT_EDGE_COLOR, clampByte(), parseHexColor(), parseColor(), writeColor(), finiteOrDefault() (+7 more)

### Community 192 - "Community 192"
Cohesion: 0.29
Nodes (4): root, studio, src, dest

### Community 137 - "Community 137"
Cohesion: 0.13
Nodes (12): root, args, stateDir, outDir, graphPath, spaDir, graphRaw, graph (+4 more)

### Community 52 - "Community 52"
Cohesion: 0.11
Nodes (31): GraphInstance, JSON_NOISE_LABELS, nodeCommunityMap(), isFileNode(), isConceptNode(), isJsonKeyNode(), fileCategory(), topLevelDir() (+23 more)

### Community 138 - "Community 138"
Cohesion: 0.13
Nodes (13): graphDiff(), G, gods, labels, godIds, communities, surprises, first (+5 more)

### Community 143 - "Community 143"
Cohesion: 0.21
Nodes (12): estimateTokens(), querySubgraphTokens(), loadGraph(), runBenchmark(), BenchmarkResult, estimateTokens(), querySubgraphTokens(), SAMPLE_QUESTIONS (+4 more)

### Community 45 - "Community 45"
Cohesion: 0.09
Nodes (28): BuildOptions, normalizeSourceFilePath(), normalizedLabel(), dedupLabelKey(), asRecord(), asString(), sourceKey(), rootForOptions() (+20 more)

### Community 29 - "Profile report"
Cohesion: 0.07
Nodes (44): StatIndexEntry, statIndex, statIndexFile(), ensureStatIndex(), flushStatIndex(), statMtimeNs(), CacheOptions, bodyContent() (+36 more)

### Community 26 - "Change detection & risk score"
Cohesion: 0.06
Nodes (31): __filename, __dirname, VERSION, splitFiles(), changedFilesFromGit(), readJson(), isJsonRecord(), loadWikiDescriptionSidecarIndex() (+23 more)

### Community 70 - "Community 70"
Cohesion: 0.15
Nodes (29): writeFileAtomic(), canonicalPlatformName(), runtimeGlobalSkillPlatformName(), platformNamesForError(), resolveGlobalSkillDestination(), previewPath(), emptyPreview(), platformInstallPreview() (+21 more)

### Community 139 - "Community 139"
Cohesion: 0.22
Nodes (15): uninstallSkill(), uninstallAll(), uninstallGeminiMcp(), cursorUninstall(), antigravityUninstall(), kiroUninstall(), vscodeUninstall(), removeProjectSkill() (+7 more)

### Community 58 - "Community 58"
Cohesion: 0.07
Nodes (29): getInvocationExample(), getAgentsMdSection(), installCodexHook(), agentsInstall(), tempDirs, dir, plugin, config (+21 more)

### Community 113 - "Community 113"
Cohesion: 0.11
Nodes (14): cursorInstall(), replaceOrAppendSection(), tempDirs, bannedReportFirstPatterns, paths, dir, claudeSettings, old (+6 more)

### Community 114 - "Community 114"
Cohesion: 0.11
Nodes (16): projectUninstallAll(), tempDirs, project, restore, userSkill, userClaudeMd, projectClaudeMd, logs (+8 more)

### Community 84 - "Community 84"
Cohesion: 0.10
Nodes (22): canonicalizeForPartition(), partition(), splitCommunity(), ClusterOptions, cluster(), cohesionScore(), scoreAll(), G (+14 more)

### Community 90 - "Community 90"
Cohesion: 0.11
Nodes (19): ReportHighRiskNode, ReportTestGap, ReportReviewOptions, GenerateReportOptions, normalizeFlows(), normalizeAffectedFlows(), formatFlow(), appendReviewSections() (+11 more)

### Community 87 - "Community 87"
Cohesion: 0.13
Nodes (21): normalizeCommunityLabel(), readLabelsJson(), readGraphAttributeLabels(), resolveCommunityLabels(), persistCommunityLabels(), ExtractionDiagnostic, BuildProjectOptions, BuildProjectWarning (+13 more)

### Community 34 - "Ontology output (wiki, obsidian, etc.)"
Cohesion: 0.09
Nodes (37): DETECTION_FILE_TYPES, ConfiguredDetectionInputs, ConfiguredDataprepOptions, ConfiguredDataprepResult, uniqueResolved(), fullPageScreenshotExcludes(), buildConfiguredDetectionInputs(), emptyDetection() (+29 more)

### Community 96 - "Community 96"
Cohesion: 0.12
Nodes (16): ProfileState, readJson(), optionalJson(), stringValue(), evidenceRefsFromSources(), loadProfilePatchRuntimeContext(), loadOntologyPatchContext(), NormalizedProjectConfig (+8 more)

### Community 9 - "Review delta & risk chains"
Cohesion: 0.04
Nodes (45): uniqueSorted(), sortNodesByLocation(), mapChangesToNodes(), changedNodesFromFiles(), analyzeChanges(), qn(), addNode(), ChangedRange (+37 more)

### Community 27 - "Profile discovery/extraction prompts"
Cohesion: 0.08
Nodes (46): OFFICE_EXTENSIONS, GOOGLE_WORKSPACE_EXTENSIONS, VIDEO_EXTENSIONS, SENSITIVE_PATTERNS, PAPER_SIGNALS, isSensitive(), looksLikePaper(), ASSET_DIR_MARKERS (+38 more)

### Community 92 - "Community 92"
Cohesion: 0.11
Nodes (19): CODE_EXTENSIONS, DOC_EXTENSIONS, PAPER_EXTENSIONS, IMAGE_EXTENSIONS, makeGraphPortable(), WATCHED_EXTENSIONS, mergeHyperedges(), builtFromCommit() (+11 more)

### Community 147 - "Community 147"
Cohesion: 0.23
Nodes (11): extractPdfText(), officeParseToText(), docxToMarkdown(), xlsxToMarkdown(), convertOfficeFile(), fileWithinSizeCap(), CentralEntry, findEocdOffset() (+3 more)

### Community 79 - "Community 79"
Cohesion: 0.11
Nodes (20): DirectSemanticFile, DirectSemanticChunk, DirectSemanticExtractionClient, DirectSemanticExtractionOptions, PackSemanticFilesOptions, DirectSemanticClientOptions, toPortableRelative(), estimateFileTokens() (+12 more)

### Community 19 - "Profile validation"
Cohesion: 0.07
Nodes (42): BACKUP_ARTIFACTS, COMMUNITY_COLORS, inferNodeShape(), CONFIDENCE_SCORE_DEFAULTS, CommunityLabelsInput, CommunityLabelOptions, HtmlOptions, JsonOptions (+34 more)

### Community 193 - "Community 193"
Cohesion: 0.29
Nodes (6): todayIso(), backupIfProtected(), backup, b1, b2, dated

### Community 104 - "Community 104"
Cohesion: 0.10
Nodes (16): inferEdgeDashes(), dir, htmlPath, warnings, G, communities, result, html (+8 more)

### Community 156 - "Community 156"
Cohesion: 0.17
Nodes (10): toCypher(), cleanupDirs, dir, graphPath, warnings, graph, written, persisted (+2 more)

### Community 59 - "Community 59"
Cohesion: 0.09
Nodes (24): toGraphml(), __filename, __dirname, AnalysisFile, readJson(), writeJson(), scopeOptionDescription(), cacheOptionsFromRuntime() (+16 more)

### Community 11 - "CLI runtime & search"
Cohesion: 0.04
Nodes (59): SyntaxNode, Tree, moduleRequire, _languageCache, ResolvableLabelIndex, CASE_INSENSITIVE_CALL_MODULES, TsconfigAliasEntry, tsconfigAliasCache (+51 more)

### Community 124 - "Community 124"
Cohesion: 0.32
Nodes (17): ensureParserInit(), parseText(), resolveGrammarWasm(), loadLanguage(), qualifiedFileStem(), addLabelCandidate(), resolveUniqueLabels(), buildResolvableLabelIndex() (+9 more)

### Community 97 - "Community 97"
Cohesion: 0.14
Nodes (23): _makeId(), _readText(), _resolveName(), _importPython(), _importJava(), _importC(), _importCsharp(), _importKotlin() (+15 more)

### Community 178 - "Community 178"
Cohesion: 0.43
Nodes (8): toPortablePath(), projectRelativeFilePath(), loadTsconfigAliases(), normalizeJsImportTarget(), resolveJsImportTargetInfo(), resolveJsImportTarget(), remapFileNodeIds(), _importJs()

### Community 115 - "Community 115"
Cohesion: 0.11
Nodes (16): inferCommonRoot(), ExtractionResult, _mergeSwiftExtensions(), extractWithDiagnostics(), GraphNode, GraphEdge, perFile, allNodes (+8 more)

### Community 110 - "Community 110"
Cohesion: 0.10
Nodes (16): extractJs(), extractPhp(), extract(), cleanupDirs, dir, filePath, calls, renderNode (+8 more)

### Community 17 - "Ontology profile loader"
Cohesion: 0.04
Nodes (52): collectFiles(), files, worktreeRoot, labels, relations, fileNodes, importEdge, pageNode (+44 more)

### Community 216 - "Community 216"
Cohesion: 0.50
Nodes (3): __testing, main, target

### Community 8 - "Sample corpus: mixed analyze.py (worked/)"
Cohesion: 0.04
Nodes (58): isTestFile(), decoratorsOf(), hasFrameworkDecorator(), matchesEntryName(), sanitizeFlowName(), flowIdFor(), stableFiles(), detectEntryPoints() (+50 more)

### Community 135 - "Community 135"
Cohesion: 0.25
Nodes (14): execGit(), safeExecGit(), resolveFromGitCwd(), gitRevParse(), safeGitRevParse(), isSafeGitPath(), userEditableHooksDir(), resolveGitContext() (+6 more)

### Community 63 - "Community 63"
Cohesion: 0.10
Nodes (29): GitContext, HookDefinition, HOOKS, GRAPH_GITATTR_LINES, installHook(), uninstallHook(), hookBlockRegex(), escapeRegExp() (+21 more)

### Community 71 - "Community 71"
Cohesion: 0.10
Nodes (23): googleWorkspaceEnabled(), extractFileIdFromUrl(), extractResourceKey(), readGoogleShortcut(), createDefaultGoogleWorkspaceFetcher(), safeYamlString(), sidecarPath(), frontmatterWrap() (+15 more)

### Community 48 - "Community 48"
Cohesion: 0.10
Nodes (24): communitiesFromGraph(), communityLabelsFromGraph(), LOOPBACK_HOSTS, OntologyStudioWriteOptions, OntologyStudioHandlerOptions, StartOntologyStudioServerOptions, StartedOntologyStudioServer, OntologyStudioRouteResult (+16 more)

### Community 120 - "Community 120"
Cohesion: 0.20
Nodes (15): LayoutGraphNode, LayoutGraphEdge, ComputeLayoutOptions, LayoutResult, stableSeed(), mulberry32(), SimNode, Quad (+7 more)

### Community 174 - "Community 174"
Cohesion: 0.31
Nodes (7): GraphSizeMode, assertGraphJsonSize(), assertGraphJsonFileSize(), message, missing, dir, path

### Community 93 - "Community 93"
Cohesion: 0.14
Nodes (18): createGraph(), isDirectedGraph(), loadGraphFromData(), serializeGraph(), toUndirectedGraph(), forEachTraversalNeighbor(), traversalNeighbors(), MergeGraphsOptions (+10 more)

### Community 116 - "Community 116"
Cohesion: 0.13
Nodes (15): SerializedGraphData, setHyperedges(), MergeGraphJsonResult, readGraph(), hyperedgeSortKey(), mergeGraphAttributes(), mergeGraphJsonFiles(), tempDirs (+7 more)

### Community 68 - "Community 68"
Cohesion: 0.07
Nodes (27): CONFIDENCE_VALUES, validateHyperedge(), loadHyperedges(), mergeHyperedges(), Confidence, Hyperedge, { confidence_score: _ignored, ...rest }, { id: _ignored, ...rest } (+19 more)

### Community 16 - "Review context builder"
Cohesion: 0.06
Nodes (46): isRecord(), isStringArray(), validateImageCaption(), validateImageRouting(), sha256(), fileHash(), mimeType(), sourcePage() (+38 more)

### Community 35 - "Graph summary (first-hop orientation)"
Cohesion: 0.06
Nodes (33): readJsonl(), asRecord(), readCaption(), artifactHasDeepRoute(), existingValidSidecarErrors(), importImageDataprepBatchResults(), ExportImageDataprepBatchRequestsOptions, ExportImageDataprepBatchRequestsResult (+25 more)

### Community 3 - "MCP server (graph queries)"
Cohesion: 0.05
Nodes (72): asRecord(), parseFile(), stringArray(), numberValue(), countArray(), imageRoutingSampleFromCaption(), normalizeBucket(), loadImageRoutingLabels() (+64 more)

### Community 148 - "Community 148"
Cohesion: 0.33
Nodes (13): yamlStr(), yamlQuoted(), safeFilename(), detectUrlType(), htmlToMarkdown(), fetchTweet(), fetchWebpage(), fetchArxiv() (+5 more)

### Community 31 - "Sample corpus: httpx auth/client (worked/)"
Cohesion: 0.08
Nodes (41): splitGitLines(), toPosixPath(), toRepoRelative(), pathspecForPrefix(), walkFiles(), resolveGitScopeContext(), makeScope(), countGitPaths() (+33 more)

### Community 42 - "Community 42"
Cohesion: 0.10
Nodes (35): readJson(), writeJson(), currentHead(), currentBranch(), upstreamRef(), mergeBase(), lifecyclePaths(), readLifecycleMetadata() (+27 more)

### Community 7 - "Exporters (HTML, canvas, JSON)"
Cohesion: 0.04
Nodes (55): LlmExecutionCapability, DirectLlmProvider, DIRECT_LLM_PROVIDERS, VisionJsonAnalysisInput, BatchVisionExportInput, BatchVisionImportInput, BatchTextJsonImportInput, LlmExecutionResult (+47 more)

### Community 46 - "Community 46"
Cohesion: 0.10
Nodes (34): LlmExecutionMode, safeString(), uniqueSorted(), safeTargetId(), parseNodeCommunity(), collectSourceRefs(), collectNodeNeighbors(), collectNodeTargetContext() (+26 more)

### Community 140 - "Community 140"
Cohesion: 0.15
Nodes (11): TextJsonGenerationInput, TextJsonGenerationResult, TextJsonGenerationClient, createGraphifyMesh(), meshTextJsonClient(), CreateGraphifyMeshOptions, MeshTextJsonClientOptions, tempDirs (+3 more)

### Community 50 - "Community 50"
Cohesion: 0.08
Nodes (31): BatchTextJsonExportInput, BatchTextJsonExportResult, BatchTextJsonClient, buildWikiDescriptionBatchExport(), exportWikiDescriptionBatchToJsonl(), parseWikiDescriptionBatchResults(), buildTargetKindsMap(), mkGraph() (+23 more)

### Community 53 - "Community 53"
Cohesion: 0.09
Nodes (26): shellQuote(), normalizeGitPath(), collectEntries(), gitAdvice(), planGraphifyOutMigration(), applyEntry(), migrateGraphifyOut(), MigrationAction (+18 more)

### Community 54 - "Community 54"
Cohesion: 0.09
Nodes (28): uniqueSorted(), riskFromScore(), suggestionsForTask(), topCommunities(), topFlowNames(), buildMinimalContext(), qn(), addFunction() (+20 more)

### Community 38 - "Tests: wiki description generation"
Cohesion: 0.07
Nodes (39): stableJson(), sortJson(), sha256(), readJson(), writeJson(), wordCount(), relPath(), sortedSemanticFiles() (+31 more)

### Community 60 - "Community 60"
Cohesion: 0.09
Nodes (23): sha256(), stringValue(), ontologyNodeType(), writeJson(), safeFilename(), compileNodes(), compileRelations(), writeWiki() (+15 more)

### Community 36 - "Analyze (god nodes, surprising connections)"
Cohesion: 0.10
Nodes (41): isRecord(), readableLogPath(), parseDecisionLogPath(), recordString(), decisionLogStatus(), decisionLogOperation(), decisionLogTarget(), decisionLogTouchesNode() (+33 more)

### Community 88 - "Community 88"
Cohesion: 0.08
Nodes (21): filterDecisionLogItems(), loadOntologyReconciliationDecisionLog(), ONTOLOGY_RECONCILIATION_DECISION_LOG_SCHEMA, cleanupDirs, profile, root, valid, invalid (+13 more)

### Community 15 - "Sample corpus: httpx Python client (worked/)"
Cohesion: 0.07
Nodes (54): DEFAULT_STATUSES, VALID_CITATION_MINIMUMS, VIS_JS_SHAPE_LIST, VIS_JS_SHAPES, asRecord(), asStringArray(), normalizeStringMap(), relationEndpoints() (+46 more)

### Community 99 - "Community 99"
Cohesion: 0.10
Nodes (15): stableForHash(), parseOntologyProfile(), hashOntologyProfile(), bindOntologyProfile(), loadOntologyProfile(), cleanupDirs, root, profilePath (+7 more)

### Community 132 - "Community 132"
Cohesion: 0.22
Nodes (15): readableStatePath(), ontologyReconciliationCandidatesPath(), ontologyAppliedPatchesPath(), ontologyNeedsUpdatePath(), loadReadonlyReconciliationCandidates(), reconciliationQueueIsStale(), listOntologyReconciliationCandidates(), getOntologyReconciliationCandidate() (+7 more)

### Community 51 - "Community 51"
Cohesion: 0.09
Nodes (31): sha256(), normalizeTerm(), uniqueSorted(), nodeTerms(), statusRank(), chooseCanonicalPair(), candidateScore(), candidateId() (+23 more)

### Community 30 - "Ontology patch (validate, dry-run, apply)"
Cohesion: 0.10
Nodes (44): ReconciliationWorkspaceModel, RenderOntologyStudioWorkspaceOptions, HTML_ESCAPE_MAP, escapeHtml(), percent(), renderStudioStyles(), renderList(), displayText() (+36 more)

### Community 64 - "Community 64"
Cohesion: 0.07
Nodes (26): isLoopbackHost(), generateOntologyStudioToken(), createOntologyStudioRequestHandler(), startOntologyStudioServer(), tempDirs, dir, token, fixture (+18 more)

### Community 91 - "Community 91"
Cohesion: 0.16
Nodes (22): statePath(), resolveGraphifyPaths(), defaultGraphPath(), legacyGraphPath(), resolveGraphInputPath(), defaultManifestPath(), defaultTranscriptsDir(), GraphifyPathOptions (+14 more)

### Community 80 - "Community 80"
Cohesion: 0.14
Nodes (25): PDF_IMAGE_EXTENSIONS, PdfPreparationOptions, MistralOcrModule, cloneDetection(), countWords(), metadataPath(), listImageArtifacts(), textMarkdown() (+17 more)

### Community 146 - "Community 146"
Cohesion: 0.16
Nodes (11): PdfPreparationArtifact, PdfOcrMode, parsePdfOcrMode(), { unpdfExtractTextMock, unpdfGetDocMock, convertPdfMock, spawnSyncMock }, tempDirs, imagePath, packageJson, packageLock (+3 more)

### Community 81 - "Community 81"
Cohesion: 0.14
Nodes (23): PdfTextLayerProvider, PdfPreflightOptions, PdfPreflightResult, PdfTextLayerResult, UnpdfTextResult, normalizeText(), countWords(), countImageMarkers() (+15 more)

### Community 23 - "Review benchmark"
Cohesion: 0.08
Nodes (45): PortablePathIssueKind, PortablePathIssue, PortableCheckResult, LOCAL_LIFECYCLE_FILES, LOCAL_LIFECYCLE_PREFIXES, LOCAL_LIFECYCLE_PATTERNS, TEXT_ARTIFACT_EXTENSIONS, COMMON_POSIX_LOCAL_PATH_PREFIXES (+37 more)

### Community 159 - "Community 159"
Cohesion: 0.18
Nodes (9): makeExtractionPortable(), DetectionResult, tempDirs, root, extraction, portable, detection, graphifyDir (+1 more)

### Community 43 - "Community 43"
Cohesion: 0.10
Nodes (33): CommandRunner, PullRequestSummary, PullRequestDetails, WorktreePrInfo, PrCommandOptions, defaultRunner, optionsWithDefaults(), normalizeString() (+25 more)

### Community 24 - "Sample corpus: httpx utils (worked/)"
Cohesion: 0.07
Nodes (42): sampleLimit(), nodeTypeSection(), relationTypeSection(), relationMetadataSection(), registrySection(), citationSection(), hardeningSection(), inferencePolicySection() (+34 more)

### Community 62 - "Community 62"
Cohesion: 0.09
Nodes (26): readRegistryRows(), field(), normalizeRegistryRecord(), loadProfileRegistry(), safeIdPart(), registryRecordsToExtraction(), NormalizedOntologyRegistrySpec, readRegistryRows() (+18 more)

### Community 66 - "Community 66"
Cohesion: 0.15
Nodes (29): rel(), stringValue(), graphNodes(), graphLinks(), projectConfigSection(), registryCoverageSection(), unattachedEntitiesSection(), invalidRelationsSection() (+21 more)

### Community 56 - "Community 56"
Cohesion: 0.14
Nodes (27): stringValue(), stringArray(), citations(), addIssue(), validateCitations(), validateStatus(), buildEvidenceIds(), buildRegistryRecords() (+19 more)

### Community 155 - "Community 155"
Cohesion: 0.17
Nodes (6): profileValidationResultToJson(), profileValidationResultToMarkdown(), fixtureRoot, result, extraction, registryExtraction

### Community 14 - "Portable-check & detection portability"
Cohesion: 0.06
Nodes (51): asRecord(), asStringArray(), asBoolean(), asString(), asNumber(), resolvePath(), registrySourceName(), buildRegistrySources() (+43 more)

### Community 83 - "Community 83"
Cohesion: 0.08
Nodes (8): ReviewDelta, CommitRecommendationConfidence, CommitRecommendationStaleness, CommitRecommendationGroup, CommitRecommendation, CommitRecommendationOptions, FileGraphInfo, GroupDraft

### Community 176 - "Community 176"
Cohesion: 0.25
Nodes (8): normalizePath(), isGraphifyStatePath(), sourceMatches(), communityLabel(), topLevelArea(), commitPrefixForArea(), dominantCommunity(), groupDraftForFile()

### Community 202 - "Community 202"
Cohesion: 0.47
Nodes (6): uniqueSorted(), mergeDrafts(), stalenessFrom(), minConfidence(), groupConfidence(), buildCommitRecommendation()

### Community 125 - "Community 125"
Cohesion: 0.18
Nodes (13): execGit(), maybeGithubRepo(), repoNameFromUrl(), defaultCloneDestination(), cloneRepo(), CloneRepoOptions, CloneRepoResult, GithubRepoRef (+5 more)

### Community 21 - "CLI top-level & assistant-integration tests"
Cohesion: 0.06
Nodes (33): uniqueSorted(), riskLevel(), communityRisk(), nodeCommunities(), buildBlastRadius(), impactedCommunities(), multimodalSafety(), buildReviewAnalysis() (+25 more)

### Community 25 - "Recommendations (commit prefix, area)"
Cohesion: 0.06
Nodes (40): normalize(), uniqueSorted(), identifiers(), flowIdentifiers(), ratio(), average(), countHits(), formatMetric() (+32 more)

### Community 13 - "Review analysis (blast radius, communities)"
Cohesion: 0.05
Nodes (53): normalizePath(), uniqueSorted(), sourceMatches(), riskForImpactedNodes(), changedFunctionsWithoutTests(), isSensitivePath(), isInside(), formatLines() (+45 more)

### Community 67 - "Community 67"
Cohesion: 0.09
Nodes (22): normalizePath(), asString(), asNumber(), isTestPath(), pathMatches(), normalizeKind(), parseLineRange(), sortEdges() (+14 more)

### Community 28 - "Sample corpus: example storage.py (worked/)"
Cohesion: 0.06
Nodes (34): IMPORT_RELATIONS, BARREL_BASENAMES, basename(), isBarrelPath(), ReviewNode, ReviewChain, ReviewDeltaOptions, compareStrings() (+26 more)

### Community 121 - "Community 121"
Cohesion: 0.15
Nodes (14): dirname(), sourceFileOf(), clampDepth(), uniqueSorted(), changedNodeIds(), expandChangedIdsViaBarrels(), impactedNodeIds(), likelyTestGaps() (+6 more)

### Community 203 - "Community 203"
Cohesion: 0.33
Nodes (3): reviewDeltaToText(), delta, text

### Community 209 - "Community 209"
Cohesion: 0.40
Nodes (3): affectedFilesToText(), result, text

### Community 164 - "Community 164"
Cohesion: 0.33
Nodes (7): normalizeSearchText(), queryTerms(), textMatchesQuery(), scoreSearchText(), terms, exact, substring

### Community 74 - "Community 74"
Cohesion: 0.12
Nodes (24): ALLOWED_SCHEMES, BLOCKED_HOSTS, validateUrl(), validateUrlSync(), OLLAMA_METADATA_HOSTS, isLinkLocalIp(), ollamaHostIsLinkLocalOrMetadata(), validateOllamaBaseUrl() (+16 more)

### Community 126 - "Community 126"
Cohesion: 0.13
Nodes (13): CleanupStaleNodesOptions, CleanupStaleNodesResult, cleanupStaleNodes(), cleanupDirs, root, G, result, warn (+5 more)

### Community 75 - "Community 75"
Cohesion: 0.10
Nodes (25): VALID_SEMANTIC_FILE_TYPES, SemanticFragment, LoadValidatedResult, validateSemanticFragment(), validateSemanticId(), loadValidatedSemanticFragment(), INVALID_FILE_TYPES_FOR_SANITIZE, sanitizeSemanticFragment() (+17 more)

### Community 12 - "Cache, paths, benchmark"
Cohesion: 0.05
Nodes (51): ServeOptions, McpToolDefinition, McpResourceDefinition, GraphFileSignature, GraphSnapshot, ReloadingGraphStore, MCP_RESOURCES, validateGraphFilePath() (+43 more)

### Community 149 - "Community 149"
Cohesion: 0.20
Nodes (14): optionalString(), optionalNumber(), optionalInteger(), reconciliationCandidateFilters(), toolListReconciliationCandidates(), toolGetReconciliationCandidate(), toolPreviewOntologyDecisionLog(), toolOntologyRebuildStatus() (+6 more)

### Community 105 - "Community 105"
Cohesion: 0.14
Nodes (18): StudioAssetResult, MIME_BY_EXT, TEXT_EXTS, moduleDir(), resolveStudioAppDir(), mimeForPath(), isText(), serveStudioAsset() (+10 more)

### Community 76 - "Community 76"
Cohesion: 0.11
Nodes (23): StudioSceneGraphNode, StudioSceneGraphEdge, StudioSceneGraphLike, BuildStudioSceneOptions, StudioSceneNode, StudioSceneEdge, StudioSceneStats, graphEdges() (+15 more)

### Community 40 - "Sample corpus: httpx transport (worked/)"
Cohesion: 0.08
Nodes (32): compareStrings(), round(), maybeCommunity(), communityLabels(), graphDensity(), nodeSummary(), compareHubs(), communityMembership() (+24 more)

### Community 65 - "Community 65"
Cohesion: 0.11
Nodes (29): defaultWhisperCacheDir(), resolveRequestedModel(), sanitizeCacheSegment(), missingModelFiles(), validateWhisperModelDir(), whisperModelRepoId(), whisperModelRevision(), modelDownloadUrl() (+21 more)

### Community 180 - "Community 180"
Cohesion: 0.25
Nodes (7): runCommand(), downloadAudio(), cleanupDirs, downloadAudioMock, dir, expected, rendered

### Community 127 - "Community 127"
Cohesion: 0.13
Nodes (14): buildWhisperPrompt(), transcribeAll(), cloneDetection(), augmentDetectionWithTranscripts(), { WhisperModelMock, freeMock, transcribeMock }, tempDirs, spawnSyncMock, hash (+6 more)

### Community 32 - "Test fixtures: C#/Java/PowerShell"
Cohesion: 0.05
Nodes (43): PlatformConfig, GraphifyPdfOcrMode, GraphifyLlmExecutionMode, GraphifyImageArtifactSource, GraphifyProjectConfigProfile, GraphifyProjectInputs, GraphifyImageAnalysisCalibrationPolicy, GraphifyImageAnalysisBatchPolicy (+35 more)

### Community 117 - "Community 117"
Cohesion: 0.11
Nodes (18): FileType, codeExts, result, sourceDir, subDir, repoDir, packagesDir, script (+10 more)

### Community 145 - "Community 145"
Cohesion: 0.14
Nodes (11): NormalizedOntologyProfile, cleanupDirs, profile, extraction, root, result, outputDir, profileExtraction (+3 more)

### Community 223 - "Community 223"
Cohesion: 1.00
Nodes (1): UnpdfTextResult

### Community 82 - "Community 82"
Cohesion: 0.09
Nodes (21): validateExtraction(), assertValid(), VALID_FILE_TYPES, VALID_CONFIDENCES, REQUIRED_NODE_FIELDS, REQUIRED_EDGE_FIELDS, tempDirs, fixtureRoot (+13 more)

### Community 39 - "Sample corpus: httpx client (worked/)"
Cohesion: 0.07
Nodes (36): isRecord(), isNonEmptyString(), isStringOrNull(), isStringArray(), sha256(), buildWikiDescriptionCacheKey(), createInsufficientEvidenceRecord(), checkWikiDescriptionFreshness() (+28 more)

### Community 150 - "Community 150"
Cohesion: 0.27
Nodes (12): WikiPageRef, safeFilename(), uniquePageRefs(), normalizeFlows(), flowsThroughNodes(), crossCommunityLinks(), renderDescription(), communityArticle() (+4 more)

### Community 94 - "Community 94"
Cohesion: 0.16
Nodes (22): EntityOccurrence, EntityPanelOccurrences, RenderEntityPanelOptions, HTML_ESCAPE_MAP, escapeHtml(), displayValue(), nodeTitle(), nodeType() (+14 more)

### Community 85 - "Community 85"
Cohesion: 0.15
Nodes (22): WorkspaceFacetRecord, WorkspaceFacetValue, WorkspaceFacet, DiscoverFacetsOptions, DENYLIST, isFacetableValue(), collectFieldNames(), buildFacetValues() (+14 more)

### Community 89 - "Community 89"
Cohesion: 0.14
Nodes (21): RenderGraphPanelOptions, withStudioFlag(), HTML_ESCAPE_MAP, escapeHtml(), escapeUrl(), modeLabel(), renderMetricsCard(), renderViewerSurface() (+13 more)

### Community 122 - "Community 122"
Cohesion: 0.24
Nodes (17): HTML_ESCAPE_MAP, escapeHtml(), nodeType(), RenderRailOptions, TypeRow, CommunityRow, renderAccordionSection(), buildCommunityRows() (+9 more)

### Community 33 - "Image routing calibration"
Cohesion: 0.09
Nodes (41): WorkspaceRailLayout, workspaceRailStyles(), WorkspaceEntityLayout, RenderWorkspaceShellOptions, HTML_ESCAPE_MAP, escapeHtml(), displayValue(), nodeType() (+33 more)

### Community 107 - "Community 107"
Cohesion: 0.14
Nodes (19): WorkspaceSearchRecord, WorkspaceSearchIndex, tokenise(), collectRecordTokens(), buildWorkspaceSearchIndex(), RankedHit, resolveTokenMatches(), searchWorkspaceIndex() (+11 more)

### Community 108 - "Community 108"
Cohesion: 0.17
Nodes (20): WorkspaceSelectionState, WorkspaceGraphPanelState, WorkspaceEvidencePanelState, WorkspaceViewState, DEFAULT_FACET_STATE, DEFAULT_GRAPH_PANEL_STATE, DEFAULT_EVIDENCE_PANEL_STATE, DEFAULT_SELECTION_STATE (+12 more)

### Community 131 - "Community 131"
Cohesion: 0.13
Nodes (1): app

### Community 144 - "Community 144"
Cohesion: 0.27
Nodes (11): getJson(), fetchScene(), fetchGraph(), loadEntitiesIndex(), __resetEntitiesIndexCache(), fetchEntity(), fetchReconciliationCandidates(), postPatch() (+3 more)

### Community 22 - "Multi-language test fixtures"
Cohesion: 0.09
Nodes (41): graphEdges(), graphNodes(), displayValue(), NODE_PROFILE_FIELDS, EDGE_PROFILE_FIELDS, nodeLabel(), nodeType(), nodeGroup() (+33 more)

### Community 152 - "Community 152"
Cohesion: 0.26
Nodes (11): GROUP_PALETTE, finite(), clampUnit(), stableHash(), colorForGroup(), positionForNode(), nodeSize(), edgeWidth() (+3 more)

### Community 214 - "Community 214"
Cohesion: 0.67
Nodes (3): HTML_ESCAPE_MAP, escapeHtml(), renderInlineMarkdown()

### Community 215 - "Community 215"
Cohesion: 0.50
Nodes (2): buildPatchFromCandidate(), cand

### Community 201 - "Community 201"
Cohesion: 0.33
Nodes (3): loadWorkspace(), LIGHT_SCENE, RAW_GRAPH

### Community 119 - "Community 119"
Cohesion: 0.24
Nodes (17): createDefaultViewerState(), uniqueStrings(), normalizeViewerState(), toggleIn(), toggleType(), toggleCommunity(), toggleEntity(), focusEntity() (+9 more)

### Community 224 - "Community 224"
Cohesion: 1.00
Nodes (1): appSource

### Community 226 - "Community 226"
Cohesion: 1.00
Nodes (1): here

### Community 217 - "Community 217"
Cohesion: 0.50
Nodes (2): delta, G

### Community 151 - "Community 151"
Cohesion: 0.23
Nodes (12): qn(), addFunction(), addCall(), makeFlowStore(), getAffectedFlows(), qn(), addFunction(), addCall() (+4 more)

### Community 181 - "Community 181"
Cohesion: 0.25
Nodes (5): edges, forward, reversed, order1, order2

### Community 165 - "Community 165"
Cohesion: 0.20
Nodes (8): cleanupDirs, dir, graphPath, graph, edge, attrs, root, deletedAbs

### Community 168 - "Community 168"
Cohesion: 0.22
Nodes (6): cleanupDirs, dir, graphText, reportText, labelsPath, labels

### Community 205 - "Community 205"
Cohesion: 0.33
Nodes (5): tempDirs, dir, settings, commands, matchers

### Community 210 - "Community 210"
Cohesion: 0.40
Nodes (4): result, r1, r2, r3

### Community 2 - "Input scope, git, repo clone"
Cohesion: 0.02
Nodes (79): tempDirs, dir, graphPath, graphDir, output, source, destRoot, dest (+71 more)

### Community 227 - "Community 227"
Cohesion: 1.00
Nodes (2): tempProject(), tempProfileProject()

### Community 220 - "Community 220"
Cohesion: 0.67
Nodes (3): runCli(), runSkillRuntime(), runMain()

### Community 100 - "Community 100"
Cohesion: 0.09
Nodes (18): tempDirs, dir, skillDir, configOut, profileOut, statePath, extractionPath, reportPath (+10 more)

### Community 129 - "Community 129"
Cohesion: 0.13
Nodes (11): SemanticPreparationResult, cleanupDirs, fixtureRoot, root, config, inputs, detection, filtered (+3 more)

### Community 194 - "Community 194"
Cohesion: 0.29
Nodes (6): tempDirs, home, previousCwd, skillPath, versionPath, readme

### Community 182 - "Community 182"
Cohesion: 0.25
Nodes (6): importsFromTargets, importsFromBarrel, labels, reExportTagged, reExports, targets

### Community 44 - "Community 44"
Cohesion: 0.09
Nodes (15): validate(), process(), main(), HttpClient, Server, NewServer(), Config, HttpClientFactory (+7 more)

### Community 61 - "Community 61"
Cohesion: 0.08
Nodes (12): GraphifyDemo, IProcessor, DataProcessor, Processor, Get-Data(), Process-Items(), DataProcessor, Processor (+4 more)

### Community 169 - "Community 169"
Cohesion: 0.28
Nodes (6): MyApp.Accounts.User, create(), validate(), MyApp.Accounts.User, create(), validate()

### Community 111 - "Community 111"
Cohesion: 0.15
Nodes (14): Geometry, LinearAlgebra, Base, Shape, Point, Circle, area(), describe() (+6 more)

### Community 157 - "Community 157"
Cohesion: 0.18
Nodes (10): Animal, -initWithName, -speak, Dog, -fetch, Animal, -initWithName, -speak (+2 more)

### Community 118 - "Community 118"
Cohesion: 0.14
Nodes (2): ApiClient, ApiClient

### Community 190 - "Community 190"
Cohesion: 0.29
Nodes (2): Transformer, Transformer

### Community 158 - "Community 158"
Cohesion: 0.25
Nodes (4): Graph, build_graph(), Graph, build_graph()

### Community 123 - "Community 123"
Cohesion: 0.21
Nodes (10): compute_score(), normalize(), run_analysis(), Analyzer, Fixture: functions and methods that call each other - for call-graph extraction, compute_score(), normalize(), run_analysis() (+2 more)

### Community 37 - "Sample corpus: httpx auth (worked/)"
Cohesion: 0.05
Nodes (36): qn(), addFunction(), writeFlowArtifact(), readFlowArtifact(), tempDirs, qn(), addFunction(), G (+28 more)

### Community 95 - "Community 95"
Cohesion: 0.09
Nodes (14): writeOntologyWriteFixture(), tempDirs, GRAPH_FIXTURE, tempDirs, dir, fixture, result, central (+6 more)

### Community 195 - "Community 195"
Cohesion: 0.33
Nodes (6): sidecar(), render(), html, watsonMatch, withDescr, without

### Community 170 - "Community 170"
Cohesion: 0.22
Nodes (2): inventory, ignoredDir

### Community 206 - "Community 206"
Cohesion: 0.33
Nodes (4): tempDirs, preview, dir, logs

### Community 207 - "Community 207"
Cohesion: 0.33
Nodes (5): tempDirs, tmpDir, pdfPath, outputDir, markdown

### Community 133 - "Community 133"
Cohesion: 0.15
Nodes (15): tempProfileProject(), runCli(), runSkillRuntime(), runMain(), prepareProject(), tempDirs, fixtureRoot, cliOut (+7 more)

### Community 98 - "Community 98"
Cohesion: 0.09
Nodes (22): FIXTURES_DIR, TMP_OUT, result, exts, raw, errors, realErrors, allClustered (+14 more)

### Community 160 - "Community 160"
Cohesion: 0.20
Nodes (9): tempDirs, runCliInTemp(), runCliWithEnvironment(), rule, workflow, home, project, skill (+1 more)

### Community 109 - "Community 109"
Cohesion: 0.10
Nodes (18): cleanupDirs, detection, dir, G, communities, cohesion, labels, gods (+10 more)

### Community 177 - "Community 177"
Cohesion: 0.25
Nodes (3): LifecycleMetadata, commitRecommendationToText(), recommendation

### Community 211 - "Community 211"
Cohesion: 0.40
Nodes (4): pkg, lock, changelog, workflow

### Community 173 - "Community 173"
Cohesion: 0.22
Nodes (6): reviewAnalysisToText(), formatMetric(), reviewEvaluationToText(), analysis, text, evaluation

### Community 161 - "Community 161"
Cohesion: 0.18
Nodes (10): result, long, list, sym, dir, outPath, G, communities (+2 more)

### Community 6 - "Sample corpus: example Python pipeline (worked/)"
Cohesion: 0.03
Nodes (58): tempDirs, tsRoot, graphifyOutRoot, cliPath, packageVersion, dir, graphPath, [clientTransport, serverTransport] (+50 more)

### Community 221 - "Community 221"
Cohesion: 0.67
Nodes (3): writeFixtureGraph(), writeOntologyPatchFixture(), writeOntologyReconciliationFixture()

### Community 153 - "Community 153"
Cohesion: 0.17
Nodes (11): tmpDirs, runSkillRuntime(), runMain(), dir, cached, fresh, outPath, merged (+3 more)

### Community 175 - "Community 175"
Cohesion: 0.22
Nodes (8): SKILLS, ALL_SKILL_DOCS, EXTRACTION_PROMPT_DOCS, DISTRIBUTED_SKILL_DOCS, TRIGGER_DESCRIPTION_DOCS, content, QUERY_WORKFLOW_DOCS, INLINE_MERGE_SKILLS

### Community 196 - "Community 196"
Cohesion: 0.29
Nodes (4): __dirname, REPO_ROOT, SMALL_GRAPH, EDGE_CASES

### Community 72 - "Community 72"
Cohesion: 0.07
Nodes (25): tempDirs, mkGraph(), graph, communities, targets, prompt, outputDir, persistedSidecar (+17 more)

### Community 106 - "Community 106"
Cohesion: 0.10
Nodes (18): generator, G, descriptions, article, WIKI_DESCRIPTION_SCHEMA, WIKI_DESCRIPTION_PROMPT_VERSION, WikiDescriptionSidecarIndex, G (+10 more)

### Community 162 - "Community 162"
Cohesion: 0.18
Nodes (9): LABELS, G, communities, count, article, allStale, warn, formatted (+1 more)

### Community 197 - "Community 197"
Cohesion: 0.29
Nodes (6): tokens, html, workspaceHtml, reconHtml, reconQuery, evidenceQuery

### Community 183 - "Community 183"
Cohesion: 0.25
Nodes (7): tokens, graph, html, state, idxCounters, idxControls, idxGraphPanel

### Community 212 - "Community 212"
Cohesion: 0.40
Nodes (4): tokens, graph, html, candidateGraph

### Community 184 - "Community 184"
Cohesion: 0.25
Nodes (6): graph, html, occurrences, tokens, slotIdx, panelIdx

### Community 185 - "Community 185"
Cohesion: 0.25
Nodes (7): dataset, facets, keys, dirty, status, slices, state

### Community 218 - "Community 218"
Cohesion: 0.50
Nodes (3): tokens, graph, html

### Community 163 - "Community 163"
Cohesion: 0.18
Nodes (9): graph, graphJsonShape, focused, strongOnly, withWeak, state, subgraph, tokens (+1 more)

### Community 166 - "Community 166"
Cohesion: 0.20
Nodes (9): tokens, graph, state, subgraph, ids, html, centralIdx, graphIdx (+1 more)

### Community 208 - "Community 208"
Cohesion: 0.33
Nodes (4): graph, html, communitiesIdx, facetsIdx

### Community 167 - "Community 167"
Cohesion: 0.20
Nodes (5): tempDirs, dir, fixture, result, html

### Community 186 - "Community 186"
Cohesion: 0.25
Nodes (4): tempDirs, dir, fixture, result

### Community 213 - "Community 213"
Cohesion: 0.40
Nodes (4): dataset, groups, character, total

### Community 198 - "Community 198"
Cohesion: 0.29
Nodes (6): state0, state1, state2, state, query, restored

### Community 219 - "Community 219"
Cohesion: 0.50
Nodes (3): tokens, html, state

### Community 128 - "Community 128"
Cohesion: 0.12
Nodes (16): tokens, html, studioState, skipIndex, headerIndex, styleBlock, writeHtml, readOnlyHtml (+8 more)

### Community 187 - "Community 187"
Cohesion: 0.25
Nodes (7): tokens, graph, html, idxChar, idxLoc, idxWork, state

### Community 134 - "Community 134"
Cohesion: 0.13
Nodes (14): s, a, b, initial, query, restored, q, before (+6 more)

### Community 228 - "Community 228"
Cohesion: 1.00
Nodes (1): optionalRuntimeDeps

### Community 18 - "Sample corpus: httpx exceptions (worked/)"
Cohesion: 0.06
Nodes (50): handle_upload(), handle_get(), handle_delete(), handle_list(), handle_search(), handle_enrich(), API module - exposes the document pipeline over HTTP. Thin layer over parser, va, Accept a list of file paths, run the full pipeline on each,     and return a sum (+42 more)

### Community 77 - "Community 77"
Cohesion: 0.10
Nodes (26): parse_file(), parse_markdown(), parse_json(), parse_plaintext(), parse_and_save(), batch_parse(), Parser module - reads raw input documents and converts them into a structured fo, Read a file from disk and return a structured document. (+18 more)

### Community 78 - "Community 78"
Cohesion: 0.10
Nodes (26): normalize_text(), extract_keywords(), enrich_document(), find_cross_references(), process_and_save(), reprocess_all(), Processor module - transforms validated documents into enriched records ready fo, Lowercase, strip extra whitespace, remove control characters. (+18 more)

### Community 57 - "Community 57"
Cohesion: 0.11
Nodes (32): _ensure_storage(), load_index(), save_index(), save_parsed(), save_processed(), load_record(), delete_record(), list_records() (+24 more)

### Community 4 - "Audio/video transcription & ingest"
Cohesion: 0.04
Nodes (67): Exception, ConnectTimeout, ReadTimeout, WriteTimeout, PoolTimeout, ReadError, WriteError, CloseError (+59 more)

### Community 0 - "Code extraction (tree-sitter walkers)"
Cohesion: 0.05
Nodes (37): Authentication handlers. Auth objects are callables that modify a request before, Auth, BasicAuth, BearerAuth, DigestAuth, NetRCAuth, Authentication handlers. Auth objects are callables that modify a request before, Base class for all authentication handlers. (+29 more)

### Community 5 - "File detection & Google Workspace"
Cohesion: 0.07
Nodes (19): Auth, BasicAuth, Timeout, Limits, BaseClient, Client, AsyncClient, The main Client and AsyncClient classes. BaseClient holds all shared logic. Clie (+11 more)

### Community 10 - "Flow detection & criticality"
Cohesion: 0.07
Nodes (33): BearerAuth, DigestAuth, NetRCAuth, Base class for all authentication handlers., Modify the request. May yield to inspect the response., HTTP Basic Authentication., Bearer token authentication., HTTP Digest Authentication.     Requires a full request/response cycle: sends th (+25 more)

### Community 112 - "Community 112"
Cohesion: 0.11
Nodes (10): HTTPError, RequestError, DecodingError, HTTPStatusError, Base class for all httpx exceptions., An error occurred while issuing a request., Decoding of the response failed., A 4xx or 5xx response was received. (+2 more)

### Community 47 - "Community 47"
Cohesion: 0.06
Nodes (34): primitive_value_to_str(), normalize_header_key(), flatten_queryparams(), parse_content_type(), obfuscate_sensitive_headers(), unset_all_cookies(), is_known_encoding(), build_url_with_params() (+26 more)

### Community 20 - "Configured dataprep (profile mode)"
Cohesion: 0.07
Nodes (48): _node_community_map(), _is_file_node(), god_nodes(), surprising_connections(), _is_concept_node(), _file_category(), _top_level_dir(), _surprise_score() (+40 more)

### Community 188 - "Community 188"
Cohesion: 0.38
Nodes (6): build_from_json(), build(), Merge multiple extraction results into one graph., build_from_json(), build(), Merge multiple extraction results into one graph.

### Community 102 - "Community 102"
Cohesion: 0.11
Nodes (20): build_graph(), cluster(), _split_community(), cohesion_score(), score_all(), Leiden community detection on NetworkX graphs. Splits oversized communities. Ret, Build a NetworkX graph from graphify node/edge dicts.      Preserves original ed, Run Leiden community detection. Returns {community_id: [node_ids]}.      Communi (+12 more)

### Community 179 - "Community 179"
Cohesion: 0.25
Nodes (8): normalizePath(), isGraphifyStatePath(), sourceMatches(), communityLabel(), topLevelArea(), commitPrefixForArea(), dominantCommunity(), groupDraftForFile()

### Community 204 - "Community 204"
Cohesion: 0.47
Nodes (6): uniqueSorted(), mergeDrafts(), stalenessFrom(), minConfidence(), groupConfidence(), buildCommitRecommendation()

### Community 172 - "Community 172"
Cohesion: 0.31
Nodes (1): ConnectionPool

## Knowledge Gaps
- **1709 isolated node(s):** `Nt`, `Qs`, `Js`, `ur`, `fr` (+1704 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 223`** (1 nodes): `UnpdfTextResult`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 131`** (1 nodes): `app`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 215`** (2 nodes): `buildPatchFromCandidate()`, `cand`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 224`** (1 nodes): `appSource`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 226`** (1 nodes): `here`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 217`** (2 nodes): `delta`, `G`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 227`** (2 nodes): `tempProject()`, `tempProfileProject()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 118`** (2 nodes): `ApiClient`, `ApiClient`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 190`** (2 nodes): `Transformer`, `Transformer`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 170`** (2 nodes): `inventory`, `ignoredDir`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 228`** (1 nodes): `optionalRuntimeDeps`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 172`** (1 nodes): `ConnectionPool`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `buildScene()` connect `Multi-language test fixtures` to `Community 196`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Why does `loadProjectConfig()` connect `Portable-check & detection portability` to `Change detection & risk score`, `Ontology output (wiki, obsidian, etc.)`, `MCP server (graph queries)`, `Community 59`, `Community 129`, `Tests: wiki description generation`, `Sample corpus: httpx utils (worked/)`, `Community 96`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Why does `discoverProjectConfig()` connect `Portable-check & detection portability` to `Change detection & risk score`, `Ontology output (wiki, obsidian, etc.)`, `MCP server (graph queries)`, `Community 59`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **Are the 39 inferred relationships involving `Response` (e.g. with `Auth` and `BasicAuth`) actually correct?**
  _`Response` has 39 INFERRED edges - model-reasoned connections that need verification._
- **Are the 39 inferred relationships involving `Response` (e.g. with `Auth` and `BasicAuth`) actually correct?**
  _`Response` has 39 INFERRED edges - model-reasoned connections that need verification._
- **Are the 39 inferred relationships involving `Request` (e.g. with `Auth` and `BasicAuth`) actually correct?**
  _`Request` has 39 INFERRED edges - model-reasoned connections that need verification._
- **Are the 39 inferred relationships involving `Request` (e.g. with `Auth` and `BasicAuth`) actually correct?**
  _`Request` has 39 INFERRED edges - model-reasoned connections that need verification._