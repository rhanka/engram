# Graph Report - .  (2026-06-11)

## Corpus Check
- Large corpus: 436 files · ~529 902 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 6109 nodes · 15678 edges · 222 communities detected
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 466 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output
- Edge kinds: contains: 7856 · calls: 2629 · imports: 1917 · imports_from: 1345 · re_exports: 879 · uses: 466 · method: 274 · rationale_for: 222 · inherits: 69 · defines: 17 · references: 4


## Input Scope
- Requested: auto
- Resolved: committed (source: default-auto)
- Included files: 436 · Candidates: 481
- Excluded: 0 untracked · 28598 ignored · 8 sensitive · 0 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.

## Graph Freshness
- Built from Git commit: `12c5fd8`
- Compare this hash to `git rev-parse HEAD` before trusting freshness-sensitive graph output.
## God Nodes (most connected - your core abstractions)
1. `Response` - 46 edges
2. `Response` - 45 edges
3. `Request` - 43 edges
4. `Request` - 42 edges
5. `Extraction` - 39 edges
6. `_makeId()` - 33 edges
7. `Xt` - 31 edges
8. `detect()` - 31 edges
9. `DetectionResult` - 29 edges
10. `NormalizedOntologyProfile` - 28 edges

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

### Community 1 - "PDF preflight & semantic prep"
Cohesion: 0.02
Nodes (89): en, Jo, ea, Kr, Qr, sr, xe, Zt (+81 more)

### Community 108 - "Community 108"
Cohesion: 0.12
Nodes (19): n(), za(), ws(), qi(), ol(), ll(), Cn(), cl() (+11 more)

### Community 119 - "Community 119"
Cohesion: 0.16
Nodes (17): r(), oa(), da(), wn(), Mi(), Ut(), Oi(), ja() (+9 more)

### Community 143 - "Community 143"
Cohesion: 0.15
Nodes (15): Ko(), ta(), ra(), sa(), ia(), Pa(), Ai(), Ba() (+7 more)

### Community 57 - "Community 57"
Cohesion: 0.09
Nodes (30): bi(), xi, ki(), vs(), Wa(), gs(), Di(), Va() (+22 more)

### Community 49 - "Community 49"
Cohesion: 0.18
Nodes (36): gr, fs(), aa(), ot(), at(), J(), ve(), wt() (+28 more)

### Community 88 - "Community 88"
Cohesion: 0.12
Nodes (13): ua(), Nt(), Fi(), el(), We(), nn(), fr(), xs() (+5 more)

### Community 66 - "Community 66"
Cohesion: 0.11
Nodes (13): ye(), Ti(), Pi(), Xt, Ni(), hs(), ps(), Ri() (+5 more)

### Community 170 - "Community 170"
Cohesion: 0.22
Nodes (10): zs(), $a(), eo(), ss(), xc(), Ct(), Au(), Pu() (+2 more)

### Community 194 - "Community 194"
Cohesion: 0.48
Nodes (5): { spawnSync }, { dirname, join }, entry, cli, result

### Community 144 - "Community 144"
Cohesion: 0.25
Nodes (13): nodeCount, edgeCount, nodes, edges, buildStart, graph, styleStart, style (+5 more)

### Community 109 - "Community 109"
Cohesion: 0.15
Nodes (17): finiteOrFallback(), isFixed(), buildRenderGraphBuffers(), NodeId, GraphNodeShape, GraphRendererBackend, GraphRendererActiveBackend, HighLevelGraphNode (+9 more)

### Community 173 - "Community 173"
Cohesion: 0.42
Nodes (8): EdgeCurveMode, EdgePolylineOptions, Point, readPoint(), quadraticPoint(), arcControl(), buildEdgePolylinePositions(), RenderGraphInput

### Community 15 - "Sample corpus: httpx Python client (worked/)"
Cohesion: 0.08
Nodes (64): FileType, Confidence, GraphifyInputScopeMode, GraphifyResolvedInputScopeMode, InputScopeInspection, GraphNode, GraphEdge, Hyperedge (+56 more)

### Community 154 - "Community 154"
Cohesion: 0.36
Nodes (9): createStaticLayoutEngine(), assertPositionArray(), copyPositions(), createPositionFrame(), computePositionBounds(), PositionBounds, PositionFrameMeta, PositionFrame (+1 more)

### Community 51 - "Community 51"
Cohesion: 0.13
Nodes (35): GraphCanvasLike, GraphContext, Graph2DContext, RendererState, AttributeLocations, UniformLocations, DrawProgram, RenderResources (+27 more)

### Community 122 - "Community 122"
Cohesion: 0.25
Nodes (16): RGBA, DEFAULT_NODE_COLOR, DEFAULT_EDGE_COLOR, clampByte(), parseHexColor(), parseColor(), writeColor(), finiteOrDefault() (+8 more)

### Community 186 - "Community 186"
Cohesion: 0.29
Nodes (2): createFakeWebGlContext(), createFakeCanvas2DContext()

### Community 187 - "Community 187"
Cohesion: 0.43
Nodes (6): root, studio, src, dest, run(), warn()

### Community 138 - "Community 138"
Cohesion: 0.23
Nodes (14): root, parseArgs(), die(), args, stateDir, outDir, graphPath, spaDir (+6 more)

### Community 55 - "Community 55"
Cohesion: 0.13
Nodes (33): GraphInstance, JSON_NOISE_LABELS, nodeCommunityMap(), isFileNode(), isConceptNode(), isJsonKeyNode(), fileCategory(), topLevelDir() (+25 more)

### Community 132 - "Community 132"
Cohesion: 0.22
Nodes (15): suggestQuestions(), graphDiff(), buildTestGraph(), G, gods, labels, godIds, communities (+7 more)

### Community 148 - "Community 148"
Cohesion: 0.25
Nodes (12): estimateTokens(), querySubgraphTokens(), loadGraph(), runBenchmark(), printBenchmark(), estimateTokens(), querySubgraphTokens(), SAMPLE_QUESTIONS (+4 more)

### Community 9 - "Review delta & risk chains"
Cohesion: 0.06
Nodes (62): BuildOptions, normalizeSourceFilePath(), normalizedLabel(), dedupLabelKey(), asRecord(), asString(), sourceKey(), rootForOptions() (+54 more)

### Community 91 - "Community 91"
Cohesion: 0.20
Nodes (23): StatIndexEntry, statIndex, statIndexFile(), ensureStatIndex(), flushStatIndex(), statMtimeNs(), CacheOptions, bodyContent() (+15 more)

### Community 174 - "Community 174"
Cohesion: 0.49
Nodes (7): fileHash(), _resetStatIndexForTesting(), loadCached(), saveCached(), checkSemanticCache(), saveSemanticCache(), collectJsonFiles()

### Community 20 - "Configured dataprep (profile mode)"
Cohesion: 0.08
Nodes (60): __filename, __dirname, getVersion(), VERSION, splitFiles(), collectExclude(), changedFilesFromGit(), loadCliGraph() (+52 more)

### Community 124 - "Community 124"
Cohesion: 0.25
Nodes (18): writeFileAtomic(), canonicalPlatformName(), runtimeGlobalSkillPlatformName(), platformNamesForError(), resolveGlobalSkillDestination(), emptyPreview(), globalSkillInstallPreview(), findSkillFile() (+10 more)

### Community 71 - "Community 71"
Cohesion: 0.12
Nodes (26): previewPath(), platformInstallPreview(), printMutationPreview(), installGeminiMcp(), cursorInstall(), _antigravityWriteRulesWorkflows(), kiroInstall(), vscodeInstall() (+18 more)

### Community 63 - "Community 63"
Cohesion: 0.07
Nodes (29): getInvocationExample(), getAgentsMdSection(), installCodexHook(), agentsInstall(), tempDirs, withProcessPlatform(), preview, dir (+21 more)

### Community 195 - "Community 195"
Cohesion: 0.29
Nodes (6): cursorUninstall(), tempDirs, dir, rule, rulePath, original

### Community 110 - "Community 110"
Cohesion: 0.12
Nodes (18): projectUninstallAll(), tempDirs, makeTempDir(), silenceConsole(), project, restore, userSkill, userClaudeMd (+10 more)

### Community 40 - "Sample corpus: httpx transport (worked/)"
Cohesion: 0.11
Nodes (30): edgeSortKey(), canonicalizeForPartition(), partition(), splitCommunity(), ClusterOptions, cluster(), remapCommunitiesToPrevious(), cohesionScore() (+22 more)

### Community 125 - "Community 125"
Cohesion: 0.20
Nodes (14): placeholderLabels(), buildLabelingPromptLines(), parseLabelResponse(), detectLabelingBackend(), CallLlmFn, makeDefaultCallLlm(), LabelCommunitiesOptions, labelCommunities() (+6 more)

### Community 45 - "Community 45"
Cohesion: 0.11
Nodes (31): normalizeCommunityLabel(), readLabelsJson(), readGraphAttributeLabels(), resolveCommunityLabels(), persistCommunityLabels(), safeGitRevParse(), projectRootLabel(), makeGraphPortable() (+23 more)

### Community 36 - "Analyze (god nodes, surprising connections)"
Cohesion: 0.11
Nodes (39): DETECTION_FILE_TYPES, ConfiguredDetectionInputs, ProfileState, ConfiguredDataprepOptions, ConfiguredDataprepResult, uniqueResolved(), fullPageScreenshotExcludes(), buildConfiguredDetectionInputs() (+31 more)

### Community 41 - "LLM execution (direct backends)"
Cohesion: 0.08
Nodes (32): compareStrings(), uniqueSorted(), rangeStart(), rangeEnd(), sortNodesByLocation(), nodeRiskRecord(), isSafeGitRef(), parseUnifiedDiff() (+24 more)

### Community 28 - "Sample corpus: example storage.py (worked/)"
Cohesion: 0.10
Nodes (46): OFFICE_EXTENSIONS, GOOGLE_WORKSPACE_EXTENSIONS, VIDEO_EXTENSIONS, SENSITIVE_PATTERNS, PAPER_SIGNALS, isSensitive(), looksLikePaper(), ASSET_DIR_MARKERS (+38 more)

### Community 146 - "Community 146"
Cohesion: 0.20
Nodes (11): CODE_EXTENSIONS, _projectXmlIsSafe(), extractCsproj(), extractSln(), _extractSlnAsync(), _extractCsprojAsync(), __testing, FIXTURES (+3 more)

### Community 139 - "Community 139"
Cohesion: 0.28
Nodes (12): extractPdfText(), officeParseToText(), docxToMarkdown(), xlsxToMarkdown(), convertOfficeFile(), fileWithinSizeCap(), CentralEntry, findEocdOffset() (+4 more)

### Community 26 - "Change detection & risk score"
Cohesion: 0.06
Nodes (44): DirectSemanticFile, DirectSemanticChunk, DirectSemanticExtractionClient, DirectSemanticExtractionOptions, PackSemanticFilesOptions, DirectSemanticClientOptions, toPortableRelative(), estimateFileTokens() (+36 more)

### Community 56 - "Community 56"
Cohesion: 0.11
Nodes (34): BACKUP_ARTIFACTS, COMMUNITY_COLORS, inferNodeShape(), CONFIDENCE_SCORE_DEFAULTS, CommunityLabelsInput, CommunityLabelOptions, HtmlOptions, JsonOptions (+26 more)

### Community 188 - "Community 188"
Cohesion: 0.39
Nodes (6): todayIso(), backupIfProtected(), backup, b1, b2, dated

### Community 140 - "Community 140"
Cohesion: 0.14
Nodes (14): inferEdgeDashes(), renderHtml(), makeProfile(), dir, htmlPath, warnings, G, communities (+6 more)

### Community 111 - "Community 111"
Cohesion: 0.19
Nodes (16): nodeCommunityMap(), isCommunityLabelOptions(), normalizeCommunityLabels(), normalizeMemberCounts(), normalizeProfile(), normalizeStudioMode(), normalizeDescriptions(), htmlStyles() (+8 more)

### Community 126 - "Community 126"
Cohesion: 0.19
Nodes (16): buildFreshnessMetadata(), toJson(), escapeHtml(), sanitizeMetadataString(), sanitizeMetadataValue(), sanitizeMetadata(), result, long (+8 more)

### Community 156 - "Community 156"
Cohesion: 0.15
Nodes (11): toCypher(), tempDir(), cleanupDirs, dir, graphPath, warnings, graph, written (+3 more)

### Community 202 - "Community 202"
Cohesion: 0.53
Nodes (4): toSpanner(), cleanupDirs, tempDir(), makeGraph()

### Community 18 - "Sample corpus: httpx exceptions (worked/)"
Cohesion: 0.07
Nodes (63): SyntaxNode, Tree, getModuleRequire(), moduleRequire, _languageCache, ResolvableLabelIndex, CASE_INSENSITIVE_CALL_MODULES, resolveCalleeNid() (+55 more)

### Community 127 - "Community 127"
Cohesion: 0.29
Nodes (18): ensureParserInit(), parseText(), resolveGrammarWasm(), loadLanguage(), qualifiedFileStem(), addLabelCandidate(), resolveUniqueLabels(), buildResolvableLabelIndex() (+10 more)

### Community 101 - "Community 101"
Cohesion: 0.15
Nodes (22): _makeId(), _readText(), _resolveName(), _importPython(), _importJava(), _importC(), _importCsharp(), _importKotlin() (+14 more)

### Community 189 - "Community 189"
Cohesion: 0.43
Nodes (8): toPortablePath(), projectRelativeFilePath(), loadTsconfigAliases(), normalizeJsImportTarget(), resolveJsImportTargetInfo(), resolveJsImportTarget(), remapFileNodeIds(), _importJs()

### Community 175 - "Community 175"
Cohesion: 0.20
Nodes (3): inferCommonRoot(), extractWithDiagnostics(), collectFiles()

### Community 116 - "Community 116"
Cohesion: 0.16
Nodes (11): LANGUAGE_BUILTIN_GLOBALS, extract(), writeBarrel(), importsFromTargets, importsFromBarrel, labels, reExportTagged, reExports (+3 more)

### Community 141 - "Community 141"
Cohesion: 0.23
Nodes (14): ExtractionResult, _mergeSwiftExtensions(), mkNode(), mkEdge(), perFile, allNodes, allEdges, merged (+6 more)

### Community 142 - "Community 142"
Cohesion: 0.23
Nodes (14): extractJs(), extractPhp(), strip(), cleanupDirs, dir, filePath, calls, renderNode (+6 more)

### Community 50 - "Community 50"
Cohesion: 0.12
Nodes (31): ExtractionDiagnostic, safeToHtml(), BuildProjectOptions, BuildProjectWarning, BuildProjectArtifacts, BuildProjectResult, countNonCodeFiles(), formatDiagnosticSummary() (+23 more)

### Community 25 - "Recommendations (commit prefix, area)"
Cohesion: 0.07
Nodes (53): compareStrings(), isTestFile(), decoratorsOf(), hasFrameworkDecorator(), matchesEntryName(), sanitizeFlowName(), flowIdFor(), stableFiles() (+45 more)

### Community 136 - "Community 136"
Cohesion: 0.28
Nodes (14): GitContext, execGit(), safeExecGit(), resolveFromGitCwd(), gitRevParse(), isSafeGitPath(), userEditableHooksDir(), resolveGitContext() (+6 more)

### Community 72 - "Community 72"
Cohesion: 0.12
Nodes (27): googleWorkspaceEnabled(), extractFileIdFromUrl(), extractResourceKey(), readGoogleShortcut(), resolveAccessToken(), createDefaultGoogleWorkspaceFetcher(), safeYamlString(), sidecarPath() (+19 more)

### Community 209 - "Community 209"
Cohesion: 0.60
Nodes (3): communityOf(), communitiesFromGraph(), communityLabelsFromGraph()

### Community 112 - "Community 112"
Cohesion: 0.27
Nodes (16): LayoutGraphNode, LayoutGraphEdge, ComputeLayoutOptions, LayoutResult, stableSeed(), mulberry32(), SimNode, Quad (+8 more)

### Community 166 - "Community 166"
Cohesion: 0.38
Nodes (7): GraphSizeMode, assertGraphJsonSize(), assertGraphJsonFileSize(), message, missing, dir, path

### Community 84 - "Community 84"
Cohesion: 0.18
Nodes (21): SerializedGraphData, createGraph(), isDirectedGraph(), loadGraphFromData(), serializeGraph(), toUndirectedGraph(), forEachTraversalNeighbor(), traversalNeighbors() (+13 more)

### Community 68 - "Community 68"
Cohesion: 0.14
Nodes (28): HookDefinition, HOOKS, GRAPH_GITATTR_LINES, installHook(), uninstallHook(), hookBlockRegex(), escapeRegExp(), readTextFile() (+20 more)

### Community 73 - "Community 73"
Cohesion: 0.14
Nodes (27): CONFIDENCE_VALUES, validateHyperedge(), loadHyperedges(), setHyperedges(), mergeHyperedges(), authFlow(), { confidence_score: _ignored, ...rest }, { id: _ignored, ...rest } (+19 more)

### Community 160 - "Community 160"
Cohesion: 0.33
Nodes (10): isRecord(), isStringArray(), validateImageCaption(), validateImageRouting(), VALID_DENSITY, VALID_ROUTING_SIGNAL, isRecord(), isStringArray() (+2 more)

### Community 99 - "Community 99"
Cohesion: 0.16
Nodes (19): jsonlLine(), readJsonl(), asRecord(), readCaption(), artifactHasDeepRoute(), exportImageDataprepBatchRequests(), existingValidSidecarErrors(), importImageDataprepBatchResults() (+11 more)

### Community 78 - "Community 78"
Cohesion: 0.15
Nodes (26): sha256(), fileHash(), mimeType(), fullPageScreenshot(), sourcePage(), artifactId(), pdfArtifactByImage(), existingImages() (+18 more)

### Community 44 - "Community 44"
Cohesion: 0.10
Nodes (37): asRecord(), parseFile(), stringArray(), numberValue(), countArray(), imageRoutingSampleFromCaption(), normalizeBucket(), loadImageRoutingLabels() (+29 more)

### Community 12 - "Cache, paths, benchmark"
Cohesion: 0.07
Nodes (66): yamlStr(), yamlQuoted(), safeFilename(), detectUrlType(), htmlToMarkdown(), fetchTweet(), fetchWebpage(), fetchArxiv() (+58 more)

### Community 29 - "Profile report"
Cohesion: 0.08
Nodes (45): splitGitLines(), toPosixPath(), toRepoRelative(), pathspecForPrefix(), isGraphifyMemoryPath(), walkFiles(), resolveGitScopeContext(), makeScope() (+37 more)

### Community 48 - "Community 48"
Cohesion: 0.11
Nodes (35): readJson(), writeJson(), currentHead(), currentBranch(), upstreamRef(), mergeBase(), lifecyclePaths(), readLifecycleMetadata() (+27 more)

### Community 14 - "Portable-check & detection portability"
Cohesion: 0.06
Nodes (56): LlmExecutionCapability, DIRECT_LLM_PROVIDERS, TextJsonGenerationInput, VisionJsonAnalysisInput, BatchVisionExportInput, BatchVisionImportInput, BatchTextJsonImportInput, LlmExecutionResult (+48 more)

### Community 0 - "Code extraction (tree-sitter walkers)"
Cohesion: 0.03
Nodes (127): LlmExecutionMode, BatchTextJsonExportInput, BatchTextJsonExportResult, BatchTextJsonClient, queryOntologyReconciliationCandidates(), filterOntologyReconciliationCandidates(), EntitySidecarResponse, buildWikiDescriptionBatchExport() (+119 more)

### Community 117 - "Community 117"
Cohesion: 0.16
Nodes (15): MergeGraphJsonResult, readGraph(), edgeSortKey(), hyperedgeSortKey(), mergeGraphAttributes(), mergeGraphJsonFiles(), tempDir(), tempDirs (+7 more)

### Community 59 - "Community 59"
Cohesion: 0.10
Nodes (29): shellQuote(), normalizeGitPath(), collectEntries(), gitAdvice(), planGraphifyOutMigration(), applyEntry(), migrateGraphifyOut(), migrationResultToText() (+21 more)

### Community 105 - "Community 105"
Cohesion: 0.18
Nodes (18): compareStrings(), uniqueSorted(), riskFromScore(), suggestionsForTask(), topCommunities(), topFlowNames(), buildMinimalContext(), minimalContextToText() (+10 more)

### Community 85 - "Community 85"
Cohesion: 0.13
Nodes (21): truncate(), safeString(), isCodeNode(), NodeContext, collectNeighbors(), collectNodeContext(), rankNodes(), buildNodeDescriptionPrompt() (+13 more)

### Community 46 - "Community 46"
Cohesion: 0.10
Nodes (35): stableJson(), sortJson(), sha256(), readJson(), wordCount(), relPath(), sortedSemanticFiles(), sampleFile() (+27 more)

### Community 54 - "Community 54"
Cohesion: 0.12
Nodes (35): writeJson(), ontologyDiscoveryDiffToMarkdown(), writeOntologyDiscoverySample(), writeOntologyDiscoveryDiff(), __filename, __dirname, AnalysisFile, readJson() (+27 more)

### Community 10 - "Flow detection & criticality"
Cohesion: 0.05
Nodes (57): CompileHierarchiesOptions, compileHierarchies(), columnValue(), buildHierarchyIndex(), OntologyOutputConfig, CompileOntologyOutputsOptions, CompileOntologyOutputsResult, CompiledNode (+49 more)

### Community 167 - "Community 167"
Cohesion: 0.42
Nodes (9): readJson(), optionalJson(), stringValue(), stringArray(), evidenceRefsFromSources(), loadProfilePatchRuntimeContext(), loadOntologyPatchContext(), ProfilePatchRuntimeContext (+1 more)

### Community 33 - "Image routing calibration"
Cohesion: 0.12
Nodes (44): isRecord(), readableLogPath(), parseDecisionLogPath(), recordString(), decisionLogStatus(), decisionLogOperation(), decisionLogTarget(), decisionLogTouchesNode() (+36 more)

### Community 7 - "Exporters (HTML, canvas, JSON)"
Cohesion: 0.06
Nodes (70): DEFAULT_STATUSES, VALID_CITATION_MINIMUMS, VIS_JS_SHAPE_LIST, VIS_JS_SHAPES, asRecord(), asStringArray(), normalizeStringMap(), stableForHash() (+62 more)

### Community 158 - "Community 158"
Cohesion: 0.41
Nodes (11): readableStatePath(), ontologyReconciliationCandidatesPath(), ontologyAppliedPatchesPath(), ontologyNeedsUpdatePath(), loadReadonlyReconciliationCandidates(), reconciliationQueueIsStale(), listOntologyReconciliationCandidates(), getOntologyReconciliationCandidate() (+3 more)

### Community 65 - "Community 65"
Cohesion: 0.11
Nodes (30): sha256(), normalizeTerm(), uniqueSorted(), nodeTerms(), statusRank(), chooseCanonicalPair(), candidateScore(), candidateId() (+22 more)

### Community 32 - "Test fixtures: C#/Java/PowerShell"
Cohesion: 0.14
Nodes (45): ReconciliationWorkspaceModel, RenderOntologyStudioWorkspaceOptions, HTML_ESCAPE_MAP, escapeHtml(), candidateHref(), percent(), renderStudioStyles(), renderList() (+37 more)

### Community 64 - "Community 64"
Cohesion: 0.15
Nodes (30): LOOPBACK_HOSTS, OntologyStudioWriteOptions, OntologyStudioHandlerOptions, StartOntologyStudioServerOptions, StartedOntologyStudioServer, OntologyStudioRouteResult, optionalString(), optionalNumber() (+22 more)

### Community 69 - "Community 69"
Cohesion: 0.08
Nodes (30): isLoopbackHost(), generateOntologyStudioToken(), createOntologyStudioRequestHandler(), startOntologyStudioServer(), tempDirs, makeTempDir(), postBody(), writeCandidateQueue() (+22 more)

### Community 89 - "Community 89"
Cohesion: 0.16
Nodes (23): statePath(), resolveGraphifyPaths(), defaultGraphPath(), legacyGraphPath(), resolveGraphInputPath(), defaultManifestPath(), defaultTranscriptsDir(), GraphifyPathOptions (+15 more)

### Community 74 - "Community 74"
Cohesion: 0.15
Nodes (28): PDF_IMAGE_EXTENSIONS, PdfPreparationArtifact, PdfPreparationOptions, MistralOcrModule, cloneDetection(), countWords(), metadataPath(), listImageArtifacts() (+20 more)

### Community 83 - "Community 83"
Cohesion: 0.17
Nodes (23): PdfOcrMode, PdfTextLayerProvider, PdfPreflightOptions, PdfTextLayerResult, UnpdfTextResult, normalizeText(), countWords(), countImageMarkers() (+15 more)

### Community 23 - "Review benchmark"
Cohesion: 0.08
Nodes (53): PortablePathIssueKind, PortablePathIssue, PortableCheckResult, LOCAL_LIFECYCLE_FILES, LOCAL_LIFECYCLE_PREFIXES, LOCAL_LIFECYCLE_PATTERNS, TEXT_ARTIFACT_EXTENSIONS, COMMON_POSIX_LOCAL_PATH_PREFIXES (+45 more)

### Community 47 - "Community 47"
Cohesion: 0.16
Nodes (35): CommandRunner, PullRequestSummary, PullRequestDetails, WorktreePrInfo, PrCommandOptions, defaultRunner, optionsWithDefaults(), normalizeString() (+27 more)

### Community 52 - "Community 52"
Cohesion: 0.12
Nodes (34): sampleLimit(), rel(), nodeTypeSection(), relationTypeSection(), relationMetadataSection(), registrySection(), citationSection(), hardeningSection() (+26 more)

### Community 34 - "Ontology output (wiki, obsidian, etc.)"
Cohesion: 0.06
Nodes (37): readRegistryRows(), field(), normalizeRegistryRecord(), loadProfileRegistry(), loadProfileRegistries(), safeIdPart(), registryRecordsToExtraction(), promptState() (+29 more)

### Community 5 - "File detection & Google Workspace"
Cohesion: 0.05
Nodes (74): rel(), stringValue(), graphNodes(), graphLinks(), projectConfigSection(), registryCoverageSection(), unattachedEntitiesSection(), invalidRelationsSection() (+66 more)

### Community 6 - "Sample corpus: example Python pipeline (worked/)"
Cohesion: 0.05
Nodes (71): SECRET_KEY_PATTERNS, VALID_MIRROR_MODES, CONFIG_CANDIDATES, VALID_PDF_OCR_MODES, VALID_CITATION_MINIMUMS, VALID_LLM_EXECUTION_MODES, VALID_IMAGE_ARTIFACT_SOURCES, VALID_INPUT_SCOPE_MODES (+63 more)

### Community 42 - "Community 42"
Cohesion: 0.12
Nodes (28): CustomProviderConfig, CustomProviderMap, globalProvidersPath(), localProvidersPath(), LoadCustomProvidersOptions, loadCustomProviders(), ALLOWED_SCHEMES, BLOCKED_HOSTS (+20 more)

### Community 21 - "CLI top-level & assistant-integration tests"
Cohesion: 0.06
Nodes (49): compareStrings(), normalizePath(), uniqueSorted(), isGraphifyStatePath(), maybeCommunity(), sourceMatches(), communityLabel(), topLevelArea() (+41 more)

### Community 118 - "Community 118"
Cohesion: 0.19
Nodes (15): execGit(), maybeGithubRepo(), repoNameFromUrl(), defaultCloneDestination(), cloneRepo(), tempDir(), initRepo(), CloneRepoOptions (+7 more)

### Community 150 - "Community 150"
Cohesion: 0.21
Nodes (8): RepoKeyRunner, defaultRepoKeyRunner, remoteKeyFromUrl(), repoKey(), commitId(), branchId(), prId(), tempDirs

### Community 22 - "Multi-language test fixtures"
Cohesion: 0.06
Nodes (48): compareStrings(), uniqueSorted(), maybeCommunity(), communityLabel(), riskLevel(), communityRisk(), nodeCommunities(), buildBlastRadius() (+40 more)

### Community 60 - "Community 60"
Cohesion: 0.10
Nodes (30): compareStrings(), normalize(), uniqueSorted(), identifiers(), flowIdentifiers(), ratio(), f1(), average() (+22 more)

### Community 53 - "Community 53"
Cohesion: 0.12
Nodes (34): compareStrings(), normalizePath(), uniqueSorted(), sourceMatches(), riskForImpactedNodes(), changedFunctionsWithoutTests(), isSensitivePath(), isInside() (+26 more)

### Community 67 - "Community 67"
Cohesion: 0.10
Nodes (28): compareStrings(), normalizePath(), asString(), asNumber(), isTestPath(), pathMatches(), normalizeKind(), parseLineRange() (+20 more)

### Community 11 - "CLI runtime & search"
Cohesion: 0.06
Nodes (60): IMPORT_RELATIONS, BARREL_BASENAMES, basename(), dirname(), isBarrelPath(), sourceFileOf(), ReviewNode, ReviewChain (+52 more)

### Community 8 - "Sample corpus: mixed analyze.py (worked/)"
Cohesion: 0.06
Nodes (71): reviewDeltaToText(), ServeOptions, McpToolDefinition, McpResourceDefinition, GraphFileSignature, GraphSnapshot, ReloadingGraphStore, MCP_RESOURCES (+63 more)

### Community 159 - "Community 159"
Cohesion: 0.28
Nodes (7): normalizeSearchText(), queryTerms(), textMatchesQuery(), scoreSearchText(), terms, exact, substring

### Community 75 - "Community 75"
Cohesion: 0.16
Nodes (26): VALID_SEMANTIC_FILE_TYPES, SemanticFragment, LoadValidatedResult, validateSemanticFragment(), validateSemanticId(), loadValidatedSemanticFragment(), INVALID_FILE_TYPES_FOR_SANITIZE, sanitizeSemanticFragment() (+18 more)

### Community 155 - "Community 155"
Cohesion: 0.24
Nodes (9): prepareSemanticDetection(), { unpdfExtractTextMock, unpdfGetDocMock, convertPdfMock, spawnSyncMock }, tempDirs, imagePath, packageJson, packageLock, outputDir, SemanticPreparationOptions (+1 more)

### Community 16 - "Review context builder"
Cohesion: 0.09
Nodes (53): moduleDir(), resolveToolVersion(), FileStoreClearOptions, FileGraphStore, createFileGraphStore(), neo4jLabel(), neo4jRelation(), scalarProps() (+45 more)

### Community 102 - "Community 102"
Cohesion: 0.20
Nodes (18): StudioAssetResult, MIME_BY_EXT, TEXT_EXTS, moduleDir(), resolveStudioAppDir(), mimeForPath(), isText(), serveStudioAsset() (+10 more)

### Community 103 - "Community 103"
Cohesion: 0.19
Nodes (18): StudioRenderEdgeDash, StudioRenderSceneNode, StudioRenderSceneEdge, StudioRenderScene, StudioRenderGraphBuffers, StudioRenderStyleBuffers, StudioRenderBufferStats, StudioRenderBufferPayload (+10 more)

### Community 4 - "Audio/video transcription & ingest"
Cohesion: 0.06
Nodes (80): StudioSceneGraphNode, StudioSceneGraphEdge, StudioSceneGraphLike, BuildStudioSceneOptions, StudioSceneNode, StudioSceneEdge, StudioSceneStats, graphEdges() (+72 more)

### Community 43 - "Community 43"
Cohesion: 0.09
Nodes (35): compareStrings(), round(), maybeCommunity(), communityLabels(), graphDensity(), nodeSummary(), compareHubs(), communityMembership() (+27 more)

### Community 216 - "Community 216"
Cohesion: 0.67
Nodes (1): UnpdfTextResult

### Community 86 - "Community 86"
Cohesion: 0.18
Nodes (23): WikiPageRef, safeFilename(), uniquePageRefs(), normalizeFlows(), compareFlowCriticality(), flowsThroughNodes(), crossCommunityLinks(), renderDescription() (+15 more)

### Community 92 - "Community 92"
Cohesion: 0.22
Nodes (23): EntityOccurrence, EntityPanelOccurrences, RenderEntityPanelOptions, HTML_ESCAPE_MAP, escapeHtml(), displayValue(), nodeTitle(), nodeType() (+15 more)

### Community 77 - "Community 77"
Cohesion: 0.20
Nodes (22): WorkspaceFacetRecord, WorkspaceFacetValue, WorkspaceFacet, DiscoverFacetsOptions, DENYLIST, isFacetableValue(), collectFieldNames(), buildFacetValues() (+14 more)

### Community 87 - "Community 87"
Cohesion: 0.20
Nodes (23): RenderGraphPanelOptions, withStudioFlag(), HTML_ESCAPE_MAP, escapeHtml(), escapeUrl(), modeLabel(), renderMetricsCard(), renderViewerSurface() (+15 more)

### Community 106 - "Community 106"
Cohesion: 0.28
Nodes (19): HTML_ESCAPE_MAP, escapeHtml(), nodeType(), WorkspaceRailLayout, RenderRailOptions, TypeRow, CommunityRow, renderAccordionSection() (+11 more)

### Community 95 - "Community 95"
Cohesion: 0.21
Nodes (19): WorkspaceSearchRecord, WorkspaceSearchIndex, tokenise(), collectRecordTokens(), buildWorkspaceSearchIndex(), RankedHit, resolveTokenMatches(), searchWorkspaceIndex() (+11 more)

### Community 37 - "Sample corpus: httpx auth (worked/)"
Cohesion: 0.13
Nodes (41): WorkspaceEntityLayout, RenderWorkspaceShellOptions, HTML_ESCAPE_MAP, escapeHtml(), displayValue(), nodeType(), nodeTitle(), nodeDirectSummary() (+33 more)

### Community 107 - "Community 107"
Cohesion: 0.24
Nodes (19): WorkspaceSelectionState, WorkspaceGraphPanelState, WorkspaceEvidencePanelState, WorkspaceViewState, DEFAULT_FACET_STATE, DEFAULT_GRAPH_PANEL_STATE, DEFAULT_EVIDENCE_PANEL_STATE, DEFAULT_SELECTION_STATE (+11 more)

### Community 123 - "Community 123"
Cohesion: 0.18
Nodes (11): handleToggleType(), handleToggleCommunity(), handleToggleEntity(), handleFocusEntity(), handleSetFocus(), handleClear(), handleSetQuery(), handleToggleWeak() (+3 more)

### Community 215 - "Community 215"
Cohesion: 0.67
Nodes (1): accordion()

### Community 35 - "Graph summary (first-hop orientation)"
Cohesion: 0.08
Nodes (31): readPixelRatio(), resizeCanvas(), ensureRenderer(), fitAndRender(), applyCamera(), handleWheel(), handlePointerDown(), handlePointerUp() (+23 more)

### Community 184 - "Community 184"
Cohesion: 0.43
Nodes (6): label(), typeOf(), reload(), decide(), handleMergeComplete(), applyDecision()

### Community 137 - "Community 137"
Cohesion: 0.34
Nodes (12): getJson(), fetchScene(), fetchGraph(), loadEntitiesIndex(), __resetEntitiesIndexCache(), fetchEntity(), fetchReconciliationCandidates(), postPatch() (+4 more)

### Community 79 - "Community 79"
Cohesion: 0.19
Nodes (24): GROUP_PALETTE, WEAK_EDGE_COLOR, DIM_ALPHA, densityScale(), finite(), clampUnit(), stableHash(), colorForGroup() (+16 more)

### Community 208 - "Community 208"
Cohesion: 0.70
Nodes (3): HTML_ESCAPE_MAP, escapeHtml(), renderInlineMarkdown()

### Community 200 - "Community 200"
Cohesion: 0.40
Nodes (2): buildPatchFromCandidate(), cand

### Community 185 - "Community 185"
Cohesion: 0.36
Nodes (4): loadWorkspace(), LIGHT_SCENE, RAW_GRAPH, buildScene()

### Community 115 - "Community 115"
Cohesion: 0.29
Nodes (17): createDefaultViewerState(), uniqueStrings(), normalizeViewerState(), toggleIn(), toggleType(), toggleCommunity(), toggleEntity(), focusEntity() (+9 more)

### Community 217 - "Community 217"
Cohesion: 0.67
Nodes (1): appSource

### Community 218 - "Community 218"
Cohesion: 0.67
Nodes (1): graphCanvasSource()

### Community 219 - "Community 219"
Cohesion: 0.67
Nodes (1): here

### Community 210 - "Community 210"
Cohesion: 0.60
Nodes (3): nonBarrelNameGraph(), delta, G

### Community 147 - "Community 147"
Cohesion: 0.24
Nodes (12): qn(), addFunction(), addCall(), makeFlowStore(), getAffectedFlows(), qn(), addFunction(), addCall() (+4 more)

### Community 214 - "Community 214"
Cohesion: 0.50
Nodes (1): cleanupDirs

### Community 171 - "Community 171"
Cohesion: 0.20
Nodes (7): makeProjectDir(), cleanupDirs, dir, graphText, reportText, labelsPath, labels

### Community 196 - "Community 196"
Cohesion: 0.29
Nodes (5): tempDirs, dir, settings, commands, matchers

### Community 203 - "Community 203"
Cohesion: 0.53
Nodes (4): result, r1, r2, r3

### Community 3 - "MCP server (graph queries)"
Cohesion: 0.03
Nodes (89): tempDirs, removeTempDir(), tempProject(), tempProfileProject(), writeGraph(), writeFlowGraph(), writeLargeGraph(), initGitRepo() (+81 more)

### Community 96 - "Community 96"
Cohesion: 0.09
Nodes (21): tempProfileProject(), writeGraph(), runCli(), tempDirs, dir, skillDir, configOut, profileOut (+13 more)

### Community 130 - "Community 130"
Cohesion: 0.13
Nodes (13): makeProject(), allFiles(), SemanticPreparationResult, cleanupDirs, fixtureRoot, root, config, inputs (+5 more)

### Community 80 - "Community 80"
Cohesion: 0.08
Nodes (25): qn(), addNode(), addEdge(), isSafeGitRef(), parseUnifiedDiff(), computeRiskScore(), qn(), addNode() (+17 more)

### Community 172 - "Community 172"
Cohesion: 0.36
Nodes (8): Microsoft.NET.Sdk.Web, net8.0, Microsoft.AspNetCore.Authentication.JwtBearer, Swashbuckle.AspNetCore, MediatR, FluentValidation, Domain.csproj, Infrastructure.csproj

### Community 149 - "Community 149"
Cohesion: 0.25
Nodes (9): validate(), process(), main(), Server, NewServer(), validate(), process(), main() (+1 more)

### Community 152 - "Community 152"
Cohesion: 0.22
Nodes (5): HttpClient, Config, HttpClientFactory, Config, HttpClientFactory

### Community 70 - "Community 70"
Cohesion: 0.08
Nodes (12): GraphifyDemo, IProcessor, DataProcessor, Processor, Get-Data(), Process-Items(), DataProcessor, Processor (+4 more)

### Community 178 - "Community 178"
Cohesion: 0.28
Nodes (6): MyApp.Accounts.User, create(), validate(), MyApp.Accounts.User, create(), validate()

### Community 114 - "Community 114"
Cohesion: 0.15
Nodes (14): Geometry, LinearAlgebra, Base, Shape, Point, Circle, area(), describe() (+6 more)

### Community 164 - "Community 164"
Cohesion: 0.18
Nodes (10): Animal, -initWithName, -speak, Dog, -fetch, Animal, -initWithName, -speak (+2 more)

### Community 120 - "Community 120"
Cohesion: 0.14
Nodes (4): ApiClient, parseResponse(), parse_response(), ApiClient

### Community 193 - "Community 193"
Cohesion: 0.29
Nodes (2): Transformer, Transformer

### Community 165 - "Community 165"
Cohesion: 0.25
Nodes (4): Graph, build_graph(), Graph, build_graph()

### Community 177 - "Community 177"
Cohesion: 0.31
Nodes (2): buildHeaders(), HttpClient

### Community 121 - "Community 121"
Cohesion: 0.22
Nodes (10): compute_score(), normalize(), run_analysis(), Analyzer, Fixture: functions and methods that call each other - for call-graph extraction, compute_score(), normalize(), run_analysis() (+2 more)

### Community 38 - "Tests: wiki description generation"
Cohesion: 0.05
Nodes (38): tempDir(), qn(), addFunction(), addCall(), writeFlowArtifact(), readFlowArtifact(), tempDirs, qn() (+30 more)

### Community 58 - "Community 58"
Cohesion: 0.11
Nodes (27): writeOntologyWriteFixture(), tempDirs, makeTempDir(), GRAPH_FIXTURE, writeGraph(), tempDirs, makeTempDir(), writeCandidateQueue() (+19 more)

### Community 190 - "Community 190"
Cohesion: 0.46
Nodes (6): sidecar(), render(), html, watsonMatch, withDescr, without

### Community 211 - "Community 211"
Cohesion: 0.60
Nodes (3): renderHtml(), html, tokenLine

### Community 93 - "Community 93"
Cohesion: 0.09
Nodes (20): makeTempDir(), manifest(), exportImageDataprepBatchRequests(), ImageRoutingRulesFile, cleanupDirs, root, out, result (+12 more)

### Community 131 - "Community 131"
Cohesion: 0.13
Nodes (13): makeTempDir(), detection(), cleanupDirs, root, image, config, result, directImage (+5 more)

### Community 100 - "Community 100"
Cohesion: 0.10
Nodes (19): makeTempDir(), assertAcceptedImageRoutingRules(), writeImageRoutingCalibrationSamples(), bucketMatches(), routeImageWithRules(), requiresDeep(), calibrateImageRouting(), cleanupDirs (+11 more)

### Community 153 - "Community 153"
Cohesion: 0.27
Nodes (11): qn(), addFunction(), addCall(), makeStore(), qn(), addFunction(), addCall(), makeStore() (+3 more)

### Community 133 - "Community 133"
Cohesion: 0.17
Nodes (15): tempProfileProject(), runCli(), runSkillRuntime(), runMain(), prepareProject(), tempDirs, fixtureRoot, cliOut (+7 more)

### Community 94 - "Community 94"
Cohesion: 0.09
Nodes (22): makeTempDir(), makePatch(), makeContext(), ONTOLOGY_RECONCILIATION_DECISION_LOG_SCHEMA, cleanupDirs, profile, root, valid (+14 more)

### Community 198 - "Community 198"
Cohesion: 0.48
Nodes (5): tempDirs, dir, plugin, config, previousCwd

### Community 162 - "Community 162"
Cohesion: 0.23
Nodes (10): tempDirs, runCliInTemp(), runCliWithEnvironment(), withProcessPlatform(), rule, workflow, home, project (+2 more)

### Community 161 - "Community 161"
Cohesion: 0.18
Nodes (8): baseState(), validationResult(), ProfileValidationResult, fixtureRoot, projectConfig, profile, registries, report

### Community 104 - "Community 104"
Cohesion: 0.10
Nodes (20): makeTempDir(), makeGraph(), cleanupDirs, detection, dir, G, communities, cohesion (+12 more)

### Community 205 - "Community 205"
Cohesion: 0.53
Nodes (4): pkg, lock, changelog, workflow

### Community 157 - "Community 157"
Cohesion: 0.27
Nodes (11): G, communities, cohesion, labels, gods, surprises, detection, report (+3 more)

### Community 145 - "Community 145"
Cohesion: 0.22
Nodes (13): qn(), addFunction(), addCall(), makeBenchmarkStore(), qn(), addFunction(), addCall(), makeBenchmarkStore() (+5 more)

### Community 90 - "Community 90"
Cohesion: 0.11
Nodes (22): tempProject(), qn(), addFunction(), addEdge(), makeReviewGraph(), tempDirs, { G }, store (+14 more)

### Community 201 - "Community 201"
Cohesion: 0.33
Nodes (3): makeGraph(), delta, text

### Community 13 - "Review analysis (blast radius, communities)"
Cohesion: 0.05
Nodes (67): tempDirs, tsRoot, graphifyOutRoot, cliPath, packageVersion, makeTempDir(), makeExternalTempDir(), writeFixtureGraph() (+59 more)

### Community 151 - "Community 151"
Cohesion: 0.27
Nodes (12): tmpDirs, makeDir(), runSkillRuntime(), runMain(), dir, cached, fresh, outPath (+4 more)

### Community 176 - "Community 176"
Cohesion: 0.36
Nodes (8): SKILLS, ALL_SKILL_DOCS, EXTRACTION_PROMPT_DOCS, DISTRIBUTED_SKILL_DOCS, TRIGGER_DESCRIPTION_DOCS, content, QUERY_WORKFLOW_DOCS, INLINE_MERGE_SKILLS

### Community 76 - "Community 76"
Cohesion: 0.13
Nodes (28): tempDirs, makeTempDir(), mkGraph(), assistantClient(), completedClient(), graph, communities, targets (+20 more)

### Community 191 - "Community 191"
Cohesion: 0.43
Nodes (6): tokens, html, workspaceHtml, reconHtml, reconQuery, evidenceQuery

### Community 179 - "Community 179"
Cohesion: 0.39
Nodes (7): tokens, graph, html, state, idxCounters, idxControls, idxGraphPanel

### Community 206 - "Community 206"
Cohesion: 0.53
Nodes (4): tokens, graph, html, candidateGraph

### Community 180 - "Community 180"
Cohesion: 0.39
Nodes (7): graph, panel(), html, occurrences, tokens, slotIdx, panelIdx

### Community 181 - "Community 181"
Cohesion: 0.39
Nodes (7): dataset, facets, keys, dirty, status, slices, state

### Community 212 - "Community 212"
Cohesion: 0.60
Nodes (3): tokens, graph, html

### Community 163 - "Community 163"
Cohesion: 0.30
Nodes (10): graph, graphJsonShape, withGraphState(), focused, strongOnly, withWeak, state, subgraph (+2 more)

### Community 168 - "Community 168"
Cohesion: 0.33
Nodes (9): tokens, graph, state, subgraph, ids, html, centralIdx, graphIdx (+1 more)

### Community 199 - "Community 199"
Cohesion: 0.48
Nodes (5): graph, rail(), html, communitiesIdx, facetsIdx

### Community 169 - "Community 169"
Cohesion: 0.33
Nodes (9): tempDirs, makeTempDir(), writeCandidateQueue(), writeGraphPreview(), actionsSection(), dir, fixture, result (+1 more)

### Community 207 - "Community 207"
Cohesion: 0.53
Nodes (4): dataset, groups, character, total

### Community 192 - "Community 192"
Cohesion: 0.43
Nodes (6): state0, state1, state2, state, query, restored

### Community 213 - "Community 213"
Cohesion: 0.60
Nodes (3): tokens, html, state

### Community 129 - "Community 129"
Cohesion: 0.21
Nodes (16): tokens, html, studioState, skipIndex, headerIndex, styleBlock, writeHtml, readOnlyHtml (+8 more)

### Community 182 - "Community 182"
Cohesion: 0.39
Nodes (7): tokens, graph, html, idxChar, idxLoc, idxWork, state

### Community 134 - "Community 134"
Cohesion: 0.22
Nodes (15): s, a, b, initial, query, restored, q, dispatch() (+7 more)

### Community 221 - "Community 221"
Cohesion: 1.00
Nodes (1): here

### Community 27 - "Profile discovery/extraction prompts"
Cohesion: 0.06
Nodes (50): handle_upload(), handle_get(), handle_delete(), handle_list(), handle_search(), handle_enrich(), API module - exposes the document pipeline over HTTP. Thin layer over parser, va, Accept a list of file paths, run the full pipeline on each,     and return a sum (+42 more)

### Community 81 - "Community 81"
Cohesion: 0.11
Nodes (26): parse_file(), parse_markdown(), parse_json(), parse_plaintext(), parse_and_save(), batch_parse(), Parser module - reads raw input documents and converts them into a structured fo, Read a file from disk and return a structured document. (+18 more)

### Community 82 - "Community 82"
Cohesion: 0.11
Nodes (26): normalize_text(), extract_keywords(), enrich_document(), find_cross_references(), process_and_save(), reprocess_all(), Processor module - transforms validated documents into enriched records ready fo, Lowercase, strip extra whitespace, remove control characters. (+18 more)

### Community 62 - "Community 62"
Cohesion: 0.12
Nodes (32): _ensure_storage(), load_index(), save_index(), save_parsed(), save_processed(), load_record(), delete_record(), list_records() (+24 more)

### Community 19 - "Profile validation"
Cohesion: 0.05
Nodes (47): Exception, CookieConflict, Attempted to look up a cookie by name but multiple cookies exist., Transport layer: connection management and low-level HTTP sending. HTTPTransport, HTTPError, RequestError, TransportError, TimeoutException (+39 more)

### Community 61 - "Community 61"
Cohesion: 0.13
Nodes (16): Auth, BasicAuth, BearerAuth, DigestAuth, NetRCAuth, Authentication handlers. Auth objects are callables that modify a request before, Base class for all authentication handlers., Modify the request. May yield to inspect the response. (+8 more)

### Community 17 - "Ontology profile loader"
Cohesion: 0.07
Nodes (17): Timeout, Limits, BaseClient, Client, AsyncClient, The main Client and AsyncClient classes. BaseClient holds all shared logic. Clie, Shared implementation for Client and AsyncClient.     Handles auth, redirects, c, Synchronous HTTP client. (+9 more)

### Community 24 - "Sample corpus: httpx utils (worked/)"
Cohesion: 0.06
Nodes (41): RequestError, TransportError, TimeoutException, ConnectTimeout, ReadTimeout, WriteTimeout, PoolTimeout, NetworkError (+33 more)

### Community 135 - "Community 135"
Cohesion: 0.16
Nodes (9): HTTPError, HTTPStatusError, Base class for all httpx exceptions., A 4xx or 5xx response was received., text(), is_success(), is_error(), Core data models: URL, Headers, Cookies, Request, Response. These are the centra (+1 more)

### Community 39 - "Sample corpus: httpx client (worked/)"
Cohesion: 0.07
Nodes (35): Cookies, primitive_value_to_str(), normalize_header_key(), flatten_queryparams(), parse_content_type(), obfuscate_sensitive_headers(), unset_all_cookies(), is_known_encoding() (+27 more)

### Community 31 - "Sample corpus: httpx auth/client (worked/)"
Cohesion: 0.08
Nodes (48): _node_community_map(), _is_file_node(), god_nodes(), surprising_connections(), _is_concept_node(), _file_category(), _top_level_dir(), _surprise_score() (+40 more)

### Community 183 - "Community 183"
Cohesion: 0.36
Nodes (6): build_from_json(), build(), Merge multiple extraction results into one graph., build_from_json(), build(), Merge multiple extraction results into one graph.

### Community 98 - "Community 98"
Cohesion: 0.13
Nodes (20): build_graph(), cluster(), _split_community(), cohesion_score(), score_all(), Leiden community detection on NetworkX graphs. Splits oversized communities. Ret, Build a NetworkX graph from graphify node/edge dicts.      Preserves original ed, Run Leiden community detection. Returns {community_id: [node_ids]}.      Communi (+12 more)

### Community 113 - "Community 113"
Cohesion: 0.10
Nodes (19): f, h1, h2, data, loaded, [semanticNodes, , , uncached], legacyHash, legacyCachePath (+11 more)

### Community 197 - "Community 197"
Cohesion: 0.29
Nodes (6): tempDirs, home, previousCwd, skillPath, versionPath, readme

### Community 128 - "Community 128"
Cohesion: 0.11
Nodes (17): codeExts, result, sourceDir, subDir, repoDir, packagesDir, script, inventory (+9 more)

### Community 30 - "Ontology patch (validate, dry-run, apply)"
Cohesion: 0.04
Nodes (51): files, worktreeRoot, labels, relations, fileNodes, importEdge, pageNode, widgetNode (+43 more)

### Community 204 - "Community 204"
Cohesion: 0.33
Nodes (5): tempDirs, tmpDir, pdfPath, outputDir, markdown

### Community 97 - "Community 97"
Cohesion: 0.09
Nodes (22): FIXTURES_DIR, TMP_OUT, result, exts, raw, errors, realErrors, allClustered (+14 more)

### Community 220 - "Community 220"
Cohesion: 1.00
Nodes (1): optionalRuntimeDeps

### Community 2 - "Input scope, git, repo clone"
Cohesion: 0.05
Nodes (39): Auth, BasicAuth, BearerAuth, DigestAuth, NetRCAuth, Authentication handlers. Auth objects are callables that modify a request before, Base class for all authentication handlers., Modify the request. May yield to inspect the response. (+31 more)

## Knowledge Gaps
- **957 isolated node(s):** `en`, `Jo`, `ea`, `Kr`, `Qr` (+952 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 186`** (2 nodes): `createFakeWebGlContext()`, `createFakeCanvas2DContext()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 216`** (1 nodes): `UnpdfTextResult`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 215`** (1 nodes): `accordion()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 200`** (2 nodes): `buildPatchFromCandidate()`, `cand`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 217`** (1 nodes): `appSource`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 218`** (1 nodes): `graphCanvasSource()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 219`** (1 nodes): `here`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 214`** (1 nodes): `cleanupDirs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 193`** (2 nodes): `Transformer`, `Transformer`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 177`** (2 nodes): `buildHeaders()`, `HttpClient`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 221`** (1 nodes): `here`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 220`** (1 nodes): `optionalRuntimeDeps`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `loadProjectConfig()` connect `Sample corpus: example Python pipeline (worked/)` to `Configured dataprep (profile mode)`, `Analyze (god nodes, surprising connections)`, `Sample corpus: httpx Python client (worked/)`, `Community 54`, `Code extraction (tree-sitter walkers)`, `Community 130`, `Community 46`, `Ontology output (wiki, obsidian, etc.)`, `Community 161`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **Why does `buildStudioScene()` connect `Audio/video transcription & ingest` to `Sample corpus: httpx Python client (worked/)`, `Community 64`, `Community 58`, `Code extraction (tree-sitter walkers)`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **Are the 39 inferred relationships involving `Response` (e.g. with `Auth` and `BasicAuth`) actually correct?**
  _`Response` has 39 INFERRED edges - model-reasoned connections that need verification._
- **Are the 39 inferred relationships involving `Response` (e.g. with `Auth` and `BasicAuth`) actually correct?**
  _`Response` has 39 INFERRED edges - model-reasoned connections that need verification._
- **Are the 39 inferred relationships involving `Request` (e.g. with `Auth` and `BasicAuth`) actually correct?**
  _`Request` has 39 INFERRED edges - model-reasoned connections that need verification._
- **Are the 39 inferred relationships involving `Request` (e.g. with `Auth` and `BasicAuth`) actually correct?**
  _`Request` has 39 INFERRED edges - model-reasoned connections that need verification._
- **What connects `en`, `Jo`, `ea` to the rest of the system?**
  _957 weakly-connected nodes found - possible documentation gaps or missing edges._