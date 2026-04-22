import { Command } from "commander";
import Graph from "graphology";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { graphDiff, godNodes, surprisingConnections, suggestQuestions } from "./analyze.js";
import { runBenchmark, printBenchmark } from "./benchmark.js";
import { saveSemanticCache, checkSemanticCache, type CacheOptions } from "./cache.js";
import { buildFromJson } from "./build.js";
import { cluster, scoreAll } from "./cluster.js";
import { detect, detectIncremental, saveManifest } from "./detect.js";
import { toCypher, toGraphml, toHtml, toJson, toSvg, pushToNeo4j } from "./export.js";
import { safeToHtml } from "./html-export.js";
import { extractWithDiagnostics } from "./extract.js";
import {
  forEachTraversalNeighbor,
  isDirectedGraph,
  loadGraphFromData,
  type SerializedGraphData,
} from "./graph.js";
import { ingest, saveQueryResult } from "./ingest.js";
import { generate } from "./report.js";
import { defaultManifestPath, resolveGraphifyPaths } from "./paths.js";
import { buildFirstHopSummary, firstHopSummaryToText } from "./summary.js";
import { buildReviewDelta, reviewDeltaToText } from "./review.js";
import { buildReviewAnalysis, reviewAnalysisToText, evaluateReviewAnalysis, reviewEvaluationToText } from "./review-analysis.js";
import { buildReviewContext, reviewContextToText } from "./review-context.js";
import { analyzeChanges, detectChangesToMinimal, detectChangesToText } from "./detect-changes.js";
import { buildMinimalContext, minimalContextToText } from "./minimal-context.js";
import { buildCommitRecommendation, commitRecommendationToText } from "./recommend.js";
import { createReviewGraphStore } from "./review-store.js";
import {
  affectedFlowsToText,
  buildFlowArtifact,
  flowDetailToText,
  flowListToText,
  getAffectedFlows,
  getFlowById,
  listFlows,
  readFlowArtifact,
  writeFlowArtifact,
  type ListFlowsOptions,
} from "./flows.js";
import { parsePdfOcrMode } from "./pdf-preflight.js";
import { prepareSemanticDetection } from "./semantic-prepare.js";
import { discoverProjectConfig, loadProjectConfig } from "./project-config.js";
import { loadOntologyProfile } from "./ontology-profile.js";
import { runConfiguredDataprep, type ProfileState } from "./configured-dataprep.js";
import { buildProfileExtractionPrompt, type ProfilePromptState } from "./profile-prompts.js";
import { validateProfileExtraction, profileValidationResultToMarkdown } from "./profile-validate.js";
import { buildProfileReport } from "./profile-report.js";
import { compileOntologyOutputs } from "./ontology-output.js";
import {
  calibrateImageRouting,
  loadImageRoutingLabels,
  loadImageRoutingRules,
  writeImageRoutingCalibrationSamples,
  type ImageRoutingSamplesFile,
} from "./image-routing-calibration.js";
import {
  exportImageDataprepBatchRequests,
  importImageDataprepBatchResults,
} from "./image-dataprep-batch.js";
import { normalizeSearchText } from "./search.js";
import type {
  DetectionResult,
  Extraction,
  GodNodeEntry,
  GraphDiffResult,
  SuggestedQuestion,
  SurpriseEntry,
  NormalizedOntologyProfile,
  NormalizedProjectConfig,
  RegistryRecord,
} from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface AnalysisFile {
  communities: Record<string, string[]>;
  cohesion: Record<string, number>;
  gods: GodNodeEntry[];
  surprises: SurpriseEntry[];
  questions?: SuggestedQuestion[];
  labels?: Record<string, string>;
  diff?: GraphDiffResult;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(path), "utf-8")) as T;
}

function writeJson(path: string, value: unknown): void {
  const resolved = resolve(path);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, JSON.stringify(value, null, 2), "utf-8");
}

function cacheOptionsFromRuntime(opts: { cacheNamespace?: string; profileState?: string }): CacheOptions {
  if (opts.cacheNamespace) return { namespace: opts.cacheNamespace };
  if (!opts.profileState) return {};
  const state = readJson<Record<string, unknown>>(opts.profileState);
  const profileHash = String(state.profile_hash ?? "").trim();
  if (!profileHash) {
    throw new Error(`Profile state ${resolve(opts.profileState)} is missing profile_hash`);
  }
  return { profileHash };
}

interface ProfileRuntimeContext extends ProfilePromptState {
  profileState: ProfileState;
  profile: NormalizedOntologyProfile;
  projectConfig?: NormalizedProjectConfig;
  registries?: Record<string, RegistryRecord[]>;
}

function loadProfileRuntimeContext(profileStatePath: string): ProfileRuntimeContext {
  const resolvedStatePath = resolve(profileStatePath);
  const profileDir = dirname(resolvedStatePath);
  const profileState = readJson<ProfileState>(resolvedStatePath);
  const profile = readJson<NormalizedOntologyProfile>(join(profileDir, "ontology-profile.normalized.json"));
  const projectConfigPath = join(profileDir, "project-config.normalized.json");
  const registriesDir = join(profileDir, "registries");
  const projectConfig = existsSync(projectConfigPath)
    ? readJson<NormalizedProjectConfig>(projectConfigPath)
    : undefined;
  const registries: Record<string, RegistryRecord[]> = {};
  if (existsSync(registriesDir)) {
    for (const file of readdirSync(registriesDir)) {
      if (!file.endsWith(".json")) continue;
      registries[file.slice(0, -".json".length)] = readJson<RegistryRecord[]>(join(registriesDir, file));
    }
  }
  return {
    profileState,
    profile,
    ...(projectConfig ? { projectConfig } : {}),
    registries,
  };
}

function getVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

function defaultLabels(communities: Map<number, string[]>): Map<number, string> {
  const labels = new Map<number, string>();
  for (const cid of communities.keys()) {
    labels.set(cid, `Community ${cid}`);
  }
  return labels;
}

function mapToObject<V>(map: Map<number, V>): Record<string, V> {
  return Object.fromEntries([...map.entries()].map(([k, v]) => [String(k), v]));
}

function objectToStringMap(obj?: Record<string, string> | null): Map<number, string> {
  const result = new Map<number, string>();
  if (!obj) return result;
  for (const [key, value] of Object.entries(obj)) {
    const cid = Number.parseInt(key, 10);
    if (Number.isFinite(cid)) result.set(cid, value);
  }
  return result;
}

function ensureExtractionShape(value?: Partial<Extraction> | null): Extraction {
  return {
    nodes: value?.nodes ?? [],
    edges: value?.edges ?? [],
    hyperedges: value?.hyperedges ?? [],
    input_tokens: value?.input_tokens ?? 0,
    output_tokens: value?.output_tokens ?? 0,
  };
}

function loadGraph(graphPath: string): Graph {
  const raw = readJson<SerializedGraphData>(graphPath);
  return loadGraphFromData(raw);
}

function shouldBuildDirected(
  opts: { directed?: boolean },
  existingGraph?: Graph,
): boolean {
  return opts.directed === true || (existingGraph ? isDirectedGraph(existingGraph) : false);
}

function mergeHyperedges(
  existing: Array<Record<string, unknown>> = [],
  incoming: Array<Record<string, unknown>> = [],
): Array<Record<string, unknown>> {
  const seen = new Set<string>();
  const merged: Array<Record<string, unknown>> = [];
  for (const hyperedge of [...existing, ...incoming]) {
    const id = String(hyperedge.id ?? "");
    const key = id || JSON.stringify(hyperedge);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(hyperedge);
  }
  return merged;
}

function mergeGraphs(target: Graph, source: Graph): void {
  source.forEachNode((nodeId, attrs) => {
    target.mergeNode(nodeId, attrs);
  });
  source.forEachEdge((_edge, attrs, sourceId, targetId) => {
    if (!target.hasNode(sourceId) || !target.hasNode(targetId)) return;
    try {
      target.mergeEdge(sourceId, targetId, attrs);
    } catch {
      /* ignore */
    }
  });
  const mergedHyperedges = mergeHyperedges(
    (target.getAttribute("hyperedges") as Array<Record<string, unknown>> | undefined) ?? [],
    (source.getAttribute("hyperedges") as Array<Record<string, unknown>> | undefined) ?? [],
  );
  if (mergedHyperedges.length > 0) {
    target.setAttribute("hyperedges", mergedHyperedges);
  }
}

function analyzeGraph(
  G: Graph,
  detection: DetectionResult,
  root: string,
  tokenCost: { input: number; output: number },
  labelsOverride?: Map<number, string>,
): {
  communities: Map<number, string[]>;
  cohesion: Map<number, number>;
  labels: Map<number, string>;
  gods: GodNodeEntry[];
  surprises: SurpriseEntry[];
  questions: SuggestedQuestion[];
  report: string;
  analysis: AnalysisFile;
} {
  const communities = cluster(G);
  const cohesion = scoreAll(G, communities);
  const labels = labelsOverride && labelsOverride.size > 0 ? labelsOverride : defaultLabels(communities);
  const gods = godNodes(G);
  const surprises = surprisingConnections(G, communities);
  const questions = suggestQuestions(G, communities, labels);
  const report = generate(
    G,
    communities,
    cohesion,
    labels,
    gods,
    surprises,
    detection,
    tokenCost,
    root,
    questions,
  );
  return {
    communities,
    cohesion,
    labels,
    gods,
    surprises,
    questions,
    report,
    analysis: {
      communities: mapToObject(communities),
      cohesion: mapToObject(cohesion),
      gods,
      surprises,
      questions,
      labels: mapToObject(labels),
    },
  };
}

function placeholderDetection(root: string = "."): DetectionResult {
  return {
    files: { code: [], document: [], paper: [], image: [], video: [] },
    total_files: 0,
    total_words: 0,
    needs_graph: true,
    warning: `Reused existing graph at ${resolve(root)} without re-running corpus detection.`,
    skipped_sensitive: [],
    graphifyignore_patterns: 0,
  };
}

function mergeSemanticArtifacts(
  cached: Partial<Extraction> | null | undefined,
  fresh: Partial<Extraction> | null | undefined,
): Extraction {
  const cachedExtraction = ensureExtractionShape(cached);
  const freshExtraction = ensureExtractionShape(fresh);

  const dedupedNodes: Extraction["nodes"] = [];
  const seen = new Set<string>();
  for (const node of [...cachedExtraction.nodes, ...freshExtraction.nodes]) {
    if (seen.has(node.id)) continue;
    seen.add(node.id);
    dedupedNodes.push(node);
  }

  return {
    nodes: dedupedNodes,
    edges: [...cachedExtraction.edges, ...freshExtraction.edges],
    hyperedges: [...(cachedExtraction.hyperedges ?? []), ...(freshExtraction.hyperedges ?? [])],
    input_tokens: freshExtraction.input_tokens ?? 0,
    output_tokens: freshExtraction.output_tokens ?? 0,
  };
}

function mergeAstAndSemantic(
  astInput: Partial<Extraction> | null | undefined,
  semanticInput: Partial<Extraction> | null | undefined,
): Extraction {
  const ast = ensureExtractionShape(astInput);
  const semantic = ensureExtractionShape(semanticInput);

  const mergedNodes: Extraction["nodes"] = [...ast.nodes];
  const seen = new Set(ast.nodes.map((node) => node.id));
  for (const node of semantic.nodes) {
    if (seen.has(node.id)) continue;
    seen.add(node.id);
    mergedNodes.push(node);
  }

  return {
    nodes: mergedNodes,
    edges: [...ast.edges, ...semantic.edges],
    hyperedges: semantic.hyperedges ?? [],
    input_tokens: semantic.input_tokens ?? 0,
    output_tokens: semantic.output_tokens ?? 0,
  };
}

function updateCostFile(
  extractionInput: Partial<Extraction> | null | undefined,
  detection: DetectionResult,
  outPath: string,
): {
  runs: Array<{ date: string; input_tokens: number; output_tokens: number; files: number }>;
  total_input_tokens: number;
  total_output_tokens: number;
} {
  const extraction = ensureExtractionShape(extractionInput);
  let cost = {
    runs: [] as Array<{ date: string; input_tokens: number; output_tokens: number; files: number }>,
    total_input_tokens: 0,
    total_output_tokens: 0,
  };
  const resolved = resolve(outPath);
  if (existsSync(resolved)) {
    cost = readJson<typeof cost>(resolved);
  }

  const input = extraction.input_tokens ?? 0;
  const output = extraction.output_tokens ?? 0;
  cost.runs.push({
    date: new Date().toISOString(),
    input_tokens: input,
    output_tokens: output,
    files: detection.total_files,
  });
  cost.total_input_tokens += input;
  cost.total_output_tokens += output;
  writeJson(resolved, cost);
  return cost;
}

function findBestMatchingNode(G: Graph, term: string): string | null {
  const words = normalizeSearchText(term).split(/\s+/).filter(Boolean);
  let bestNodeId: string | null = null;
  let bestScore = 0;
  G.forEachNode((nodeId, data) => {
    const label = normalizeSearchText((data.label as string) ?? "");
    const score = words.filter((word) => label.includes(word)).length;
    if (score > bestScore) {
      bestScore = score;
      bestNodeId = nodeId;
    }
  });
  return bestNodeId;
}

function runtimeInfo(): Record<string, unknown> {
  return {
    runtime: "typescript",
    version: getVersion(),
    node: process.execPath,
    script: __filename,
    module: join(__dirname, "index.js"),
    cli: join(__dirname, "cli.js"),
    paths: resolveGraphifyPaths(),
  };
}

export async function main(argv: string[] = process.argv): Promise<void> {
  const program = new Command();
  program.name("graphify-skill-runtime");

  program
    .command("runtime-info")
    .description("Print the runtime metadata for the Codex TypeScript skill")
    .action(() => {
      console.log(JSON.stringify(runtimeInfo(), null, 2));
    });

  program
    .command("paths")
    .description("Print the graphify state path contract for a workspace root")
    .argument("[root]", "Workspace root", ".")
    .action((root) => {
      console.log(JSON.stringify(resolveGraphifyPaths({ root: resolve(root) }), null, 2));
    });

  program
    .command("project-config")
    .description("Load and normalize a configured Graphify project profile")
    .option("--root <path>", "Workspace root", ".")
    .option("--config <path>", "Explicit graphify.yaml path")
    .requiredOption("--out <path>", "Path to write normalized project config JSON")
    .option("--profile-out <path>", "Path to write bound ontology profile JSON")
    .action((opts) => {
      const root = resolve(opts.root);
      const configPath = opts.config
        ? resolve(opts.config)
        : discoverProjectConfig(root).path;
      if (!configPath) {
        throw new Error(`No graphify project config found under ${root}`);
      }
      const projectConfig = loadProjectConfig(configPath);
      const profile = loadOntologyProfile(projectConfig.profile.resolvedPath, { projectConfig });
      writeJson(opts.out, projectConfig);
      if (opts.profileOut) writeJson(opts.profileOut, profile);
      console.log(`Loaded profile ${profile.id} from ${projectConfig.sourcePath}`);
    });

  program
    .command("configured-dataprep")
    .description("Run deterministic local dataprep for a configured profile project")
    .option("--root <path>", "Workspace root", ".")
    .option("--config <path>", "Explicit graphify.yaml path")
    .option("--out-dir <path>", "State output directory relative to root or absolute")
    .action(async (opts) => {
      const result = await runConfiguredDataprep(resolve(opts.root), {
        ...(opts.config ? { configPath: resolve(opts.config) } : {}),
        ...(opts.outDir ? { stateDir: opts.outDir } : {}),
      });
      console.log(
        `Configured dataprep: ${result.semanticDetection.total_files} semantic file(s), ` +
        `${result.registryExtraction.nodes.length} registry node(s)`,
      );
    });

  program
    .command("profile-prompt")
    .description("Write a profile-aware extraction prompt for assistant skills")
    .requiredOption("--profile-state <path>", "Path to .graphify/profile/profile-state.json")
    .requiredOption("--out <path>", "Prompt markdown output path")
    .action((opts) => {
      const context = loadProfileRuntimeContext(opts.profileState);
      writeFileSync(resolve(opts.out), buildProfileExtractionPrompt(context), "utf-8");
      console.log(`Profile prompt written to ${resolve(opts.out)}`);
    });

  program
    .command("profile-validate-extraction")
    .description("Validate an extraction JSON against a profile state")
    .requiredOption("--profile-state <path>", "Path to .graphify/profile/profile-state.json")
    .requiredOption("--input <path>", "Extraction JSON to validate")
    .option("--json", "Print JSON instead of markdown")
    .action((opts) => {
      const context = loadProfileRuntimeContext(opts.profileState);
      const extraction = ensureExtractionShape(readJson<Partial<Extraction>>(opts.input));
      const result = validateProfileExtraction(extraction, { profile: context.profile });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(profileValidationResultToMarkdown(result));
      }
      if (!result.valid) process.exit(1);
    });

  program
    .command("profile-report")
    .description("Write an additive profile QA report")
    .requiredOption("--profile-state <path>", "Path to .graphify/profile/profile-state.json")
    .requiredOption("--graph <path>", "Graph JSON path")
    .requiredOption("--out <path>", "Report markdown output path")
    .action((opts) => {
      const context = loadProfileRuntimeContext(opts.profileState);
      const graph = readJson<{ nodes?: unknown[]; links?: unknown[] }>(opts.graph);
      const report = buildProfileReport({ ...context, graph });
      writeFileSync(resolve(opts.out), report, "utf-8");
      console.log(`Profile report written to ${resolve(opts.out)}`);
    });

  program
    .command("ontology-output")
    .description("Compile optional profile-declared ontology output artifacts")
    .requiredOption("--profile-state <path>", "Path to .graphify/profile/profile-state.json")
    .requiredOption("--input <path>", "Extraction JSON to compile")
    .requiredOption("--out-dir <path>", "Ontology output directory")
    .action((opts) => {
      const context = loadProfileRuntimeContext(opts.profileState);
      const extraction = ensureExtractionShape(readJson<Partial<Extraction>>(opts.input));
      const result = compileOntologyOutputs({
        outputDir: resolve(opts.outDir),
        extraction,
        profile: context.profile,
        config: context.profile.outputs.ontology,
      });
      if (!result.enabled) {
        console.log("Ontology outputs disabled by profile config");
        return;
      }
      console.log(
        `Ontology outputs: ${result.nodeCount} node(s), ${result.relationCount} relation(s), ` +
        `${result.wikiPageCount} wiki page(s)`,
      );
    });

  program
    .command("image-calibration-samples")
    .description("Write deterministic image routing calibration samples")
    .requiredOption("--manifest <path>", "Image dataprep manifest JSON")
    .requiredOption("--captions-dir <path>", "Caption sidecar directory")
    .requiredOption("--out-dir <path>", "Calibration root directory")
    .requiredOption("--run-id <id>", "Calibration run id")
    .option("--max-samples <n>", "Maximum sample count")
    .action((opts) => {
      const result = writeImageRoutingCalibrationSamples({
        manifest: readJson(opts.manifest),
        captionsDir: resolve(opts.captionsDir),
        outputDir: resolve(opts.outDir),
        runId: opts.runId,
        ...(opts.maxSamples ? { maxSamples: Number.parseInt(opts.maxSamples, 10) } : {}),
      });
      console.log(`Image calibration samples: ${result.sampleCount} written to ${result.samplesPath}`);
    });

  program
    .command("image-calibration-replay")
    .description("Replay proposed image routing rules against project labels")
    .requiredOption("--samples <path>", "Calibration samples JSON")
    .requiredOption("--labels <path>", "Project-owned labels YAML/JSON")
    .requiredOption("--rules <path>", "Project-owned or proposed rules YAML/JSON")
    .requiredOption("--out <path>", "Replay result JSON")
    .action((opts) => {
      const samples = readJson<ImageRoutingSamplesFile>(opts.samples);
      const result = calibrateImageRouting({
        samples: samples.samples,
        labels: loadImageRoutingLabels(resolve(opts.labels)),
        rules: loadImageRoutingRules(resolve(opts.rules)),
      });
      writeJson(opts.out, result);
      console.log(`Image calibration replay: ${result.decision}`);
    });

  program
    .command("image-batch-export")
    .description("Export provider-neutral image dataprep JSONL requests")
    .requiredOption("--manifest <path>", "Image dataprep manifest JSON")
    .requiredOption("--out <path>", "JSONL output path")
    .requiredOption("--schema <name>", "Expected result schema")
    .requiredOption("--prompt <text>", "Prompt text")
    .option("--pass <pass>", "Batch pass: primary or deep", "primary")
    .option("--captions-dir <path>", "Caption sidecar directory for deep pass")
    .option("--rules <path>", "Accepted routing rules YAML/JSON for deep pass")
    .action((opts) => {
      const result = exportImageDataprepBatchRequests({
        manifest: readJson(opts.manifest),
        outputPath: resolve(opts.out),
        schema: opts.schema,
        prompt: opts.prompt,
        pass: opts.pass === "deep" ? "deep" : "primary",
        ...(opts.captionsDir ? { captionsDir: resolve(opts.captionsDir) } : {}),
        ...(opts.rules ? { rules: loadImageRoutingRules(resolve(opts.rules)) } : {}),
      });
      console.log(`Image batch export: ${result.requestCount} request(s) written to ${result.outputPath}`);
    });

  program
    .command("image-batch-import")
    .description("Import provider-normalized image dataprep JSONL results")
    .requiredOption("--input <path>", "Provider-normalized JSONL input")
    .requiredOption("--out-dir <path>", "Image dataprep output directory")
    .option("--force", "Overwrite valid existing sidecars")
    .action((opts) => {
      const result = importImageDataprepBatchResults({
        inputPath: resolve(opts.input),
        outputDir: resolve(opts.outDir),
        force: opts.force === true,
      });
      console.log(`Image batch import: ${result.importedCount} imported, ${result.failedCount} failed`);
      if (result.failedCount > 0) process.exit(1);
    });

  program
    .command("migrate-state")
    .description("Migrate legacy graphify-out state into .graphify")
    .option("--root <path>", "Workspace root", ".")
    .option("--dry-run", "Print the migration plan without writing files")
    .option("--force", "Overwrite existing files under .graphify")
    .option("--json", "Print JSON output")
    .action(async (opts) => {
      const { migrateGraphifyOut, migrationResultToText } = await import("./migrate-state.js");
      const result = migrateGraphifyOut({ root: opts.root, dryRun: opts.dryRun, force: opts.force });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(migrationResultToText(result));
      }
    });

  program
    .command("detect")
    .argument("<inputPath>")
    .option("--out <path>")
    .action((inputPath, opts) => {
      const result = detect(resolve(inputPath));
      if (opts.out) {
        writeJson(opts.out, result);
        console.log(`Detected ${result.total_files} files in ${resolve(inputPath)}`);
      } else {
        console.log(JSON.stringify(result, null, 2));
      }
    });

  program
    .command("detect-incremental")
    .argument("<inputPath>")
    .option("--manifest <path>", "Path to manifest.json", defaultManifestPath())
    .option("--out <path>")
    .action((inputPath, opts) => {
      const result = detectIncremental(resolve(inputPath), resolve(opts.manifest));
      if (opts.out) {
        writeJson(opts.out, result);
        console.log(`${result.new_total ?? 0} new/changed file(s) under ${resolve(inputPath)}`);
      } else {
        console.log(JSON.stringify(result, null, 2));
      }
    });

  program
    .command("prepare-semantic-detect")
    .requiredOption("--detect <path>", "Path to the base detection JSON")
    .requiredOption("--out <path>", "Path to the augmented semantic detection JSON")
    .requiredOption("--transcripts-out <path>", "Path to the transcript path list JSON")
    .option("--pdf-out <path>", "Path to the PDF preflight/OCR artifact list JSON")
    .option("--analysis <path>", "Optional analysis JSON from a previous run")
    .option("--incremental", "Use detection.new_files.video/paper and force derived artifacts")
    .option("--whisper-model <name>", "Whisper model override for local transcription")
    .option("--pdf-ocr <mode>", "PDF OCR mode: off, auto, always, dry-run", "auto")
    .option("--pdf-ocr-model <name>", "Mistral OCR model override")
    .action(async (opts) => {
      const detection = readJson<DetectionResult>(opts.detect);
      const analysis = opts.analysis && existsSync(resolve(opts.analysis))
        ? readJson<AnalysisFile>(opts.analysis)
        : null;
      const stateDir = dirname(resolve(opts.out));
      const { detection: semanticDetection, transcriptPaths, pdfArtifacts } = await prepareSemanticDetection(detection, {
        transcriptOutputDir: join(stateDir, "transcripts"),
        pdfOutputDir: join(stateDir, "converted", "pdf"),
        godNodes: analysis?.gods,
        incremental: opts.incremental,
        whisperModel: opts.whisperModel,
        pdfOcrMode: parsePdfOcrMode(opts.pdfOcr),
        pdfOcrModel: opts.pdfOcrModel,
      });

      writeJson(opts.out, semanticDetection);
      writeJson(opts.transcriptsOut, transcriptPaths);
      if (opts.pdfOut) writeJson(opts.pdfOut, pdfArtifacts);
      const pdfConverted = pdfArtifacts.filter((item) => item.markdownPath).length;
      console.log(`Prepared semantic inputs: ${transcriptPaths.length} transcript(s), ${pdfConverted} PDF sidecar(s)`);
    });

  program
    .command("extract-ast")
    .requiredOption("--detect <path>", "Path to detection JSON")
    .requiredOption("--out <path>", "Path to AST extraction JSON")
    .option("--incremental", "Use detection.new_files.code instead of detection.files.code")
    .action(async (opts) => {
      const detection = readJson<DetectionResult>(opts.detect);
      const codeFiles = opts.incremental
        ? detection.new_files?.code ?? []
        : detection.files.code ?? [];

      if (codeFiles.length === 0) {
        writeJson(opts.out, ensureExtractionShape());
        console.log("No code files - skipping AST extraction");
        return;
      }

      const { extraction, diagnostics } = await extractWithDiagnostics(codeFiles);
      writeJson(opts.out, extraction);
      if (diagnostics.length > 0) {
        const sample = diagnostics
          .slice(0, 3)
          .map((d) => `${d.filePath}: ${d.error}`)
          .join(" | ");
        console.log(`AST: ${extraction.nodes.length} nodes, ${extraction.edges.length} edges (${diagnostics.length} file(s) failed: ${sample})`);
        return;
      }
      console.log(`AST: ${extraction.nodes.length} nodes, ${extraction.edges.length} edges`);
    });

  program
    .command("check-semantic-cache")
    .requiredOption("--detect <path>", "Path to detection JSON")
    .option("--incremental", "Use detection.new_files when present")
    .option("--root <path>", "Graph root for cache resolution", ".")
    .option("--cache-namespace <value>", "Optional semantic cache namespace")
    .option("--profile-state <path>", "Optional profile-state.json used to derive a profile cache namespace")
    .requiredOption("--cached-out <path>", "Path to cached extraction JSON")
    .requiredOption("--uncached-out <path>", "Path to newline-delimited uncached file list")
    .action((opts) => {
      const detection = readJson<DetectionResult>(opts.detect);
      const source = opts.incremental && detection.new_files ? detection.new_files : detection.files;
      const allFiles = [
        ...(source.document ?? []),
        ...(source.paper ?? []),
        ...(source.image ?? []),
      ];
      const [cachedNodes, cachedEdges, cachedHyperedges, uncached] = checkSemanticCache(
        allFiles,
        resolve(opts.root),
        cacheOptionsFromRuntime(opts),
      );
      writeJson(opts.cachedOut, {
        nodes: cachedNodes,
        edges: cachedEdges,
        hyperedges: cachedHyperedges,
      });
      mkdirSync(dirname(resolve(opts.uncachedOut)), { recursive: true });
      writeFileSync(resolve(opts.uncachedOut), uncached.join("\n"), "utf-8");
      console.log(`Cache: ${allFiles.length - uncached.length} files hit, ${uncached.length} files need extraction`);
    });

  program
    .command("save-semantic-cache")
    .requiredOption("--input <path>", "Path to semantic extraction JSON")
    .option("--root <path>", "Graph root for cache resolution", ".")
    .option("--cache-namespace <value>", "Optional semantic cache namespace")
    .option("--profile-state <path>", "Optional profile-state.json used to derive a profile cache namespace")
    .action((opts) => {
      const extraction = ensureExtractionShape(readJson<Partial<Extraction>>(opts.input));
      const saved = saveSemanticCache(
        extraction.nodes as Array<Record<string, unknown>>,
        extraction.edges as Array<Record<string, unknown>>,
        (extraction.hyperedges ?? []) as Array<Record<string, unknown>>,
        resolve(opts.root),
        cacheOptionsFromRuntime(opts),
      );
      console.log(`Cached ${saved} files`);
    });

  program
    .command("merge-semantic")
    .requiredOption("--cached <path>")
    .requiredOption("--new <path>")
    .requiredOption("--out <path>")
    .action((opts) => {
      const cached = ensureExtractionShape(readJson<Partial<Extraction>>(opts.cached));
      const fresh = ensureExtractionShape(readJson<Partial<Extraction>>(opts.new));

      const dedupedNodes: Extraction["nodes"] = [];
      const seen = new Set<string>();
      for (const node of [...cached.nodes, ...fresh.nodes]) {
        if (seen.has(node.id)) continue;
        seen.add(node.id);
        dedupedNodes.push(node);
      }

      const merged: Extraction = {
        nodes: dedupedNodes,
        edges: [...cached.edges, ...fresh.edges],
        hyperedges: [...(cached.hyperedges ?? []), ...(fresh.hyperedges ?? [])],
        input_tokens: fresh.input_tokens ?? 0,
        output_tokens: fresh.output_tokens ?? 0,
      };
      writeJson(opts.out, merged);
      console.log(
        `Extraction complete - ${merged.nodes.length} nodes, ${merged.edges.length} edges (${cached.nodes.length} from cache, ${fresh.nodes.length} new)`,
      );
    });

  program
    .command("merge-extraction")
    .requiredOption("--ast <path>")
    .requiredOption("--semantic <path>")
    .requiredOption("--out <path>")
    .action((opts) => {
      const ast = ensureExtractionShape(readJson<Partial<Extraction>>(opts.ast));
      const semantic = ensureExtractionShape(readJson<Partial<Extraction>>(opts.semantic));

      const mergedNodes: Extraction["nodes"] = [...ast.nodes];
      const seen = new Set(ast.nodes.map((node) => node.id));
      for (const node of semantic.nodes) {
        if (seen.has(node.id)) continue;
        seen.add(node.id);
        mergedNodes.push(node);
      }

      const merged: Extraction = {
        nodes: mergedNodes,
        edges: [...ast.edges, ...semantic.edges],
        hyperedges: semantic.hyperedges ?? [],
        input_tokens: semantic.input_tokens ?? 0,
        output_tokens: semantic.output_tokens ?? 0,
      };
      writeJson(opts.out, merged);
      console.log(
        `Merged: ${merged.nodes.length} nodes, ${merged.edges.length} edges (${ast.nodes.length} AST + ${semantic.nodes.length} semantic)`,
      );
    });

  program
    .command("finalize-build")
    .requiredOption("--detect <path>")
    .requiredOption("--ast <path>")
    .requiredOption("--root <path>")
    .requiredOption("--graph-out <path>")
    .requiredOption("--report-out <path>")
    .requiredOption("--analysis-out <path>")
    .requiredOption("--cost-out <path>")
    .option("--directed", "Build a directed graph (preserves source->target)")
    .option("--cached <path>", "Optional cached semantic JSON")
    .option("--semantic-new <path>", "Optional fresh semantic JSON")
    .option("--html-out <path>", "Optional graph.html output path")
    .action((opts) => {
      const detection = readJson<DetectionResult>(opts.detect);
      const ast = ensureExtractionShape(readJson<Partial<Extraction>>(opts.ast));
      const cached = opts.cached && existsSync(resolve(opts.cached))
        ? readJson<Partial<Extraction>>(opts.cached)
        : null;
      const semanticNew = opts.semanticNew && existsSync(resolve(opts.semanticNew))
        ? readJson<Partial<Extraction>>(opts.semanticNew)
        : null;

      if (semanticNew) {
        saveSemanticCache(
          semanticNew.nodes as Array<Record<string, unknown>>,
          semanticNew.edges as Array<Record<string, unknown>>,
          (semanticNew.hyperedges ?? []) as Array<Record<string, unknown>>,
          ".",
        );
      }

      const semantic = mergeSemanticArtifacts(cached, semanticNew);
      const extraction = mergeAstAndSemantic(ast, semantic);
      const G = buildFromJson(extraction, { directed: shouldBuildDirected(opts) });
      if (G.order === 0) {
        throw new Error("Graph is empty - extraction produced no nodes.");
      }

      const analyzed = analyzeGraph(
        G,
        detection,
        resolve(opts.root),
        { input: extraction.input_tokens ?? 0, output: extraction.output_tokens ?? 0 },
      );

      toJson(G, analyzed.communities, resolve(opts.graphOut), {
        communityLabels: analyzed.labels,
      });
      writeFileSync(resolve(opts.reportOut), analyzed.report, "utf-8");
      writeJson(opts.analysisOut, analyzed.analysis);
      if (opts.htmlOut) {
        safeToHtml(G, analyzed.communities, resolve(opts.htmlOut), {
          communityLabels: analyzed.labels,
        }, {
          onWarning: (message) => console.warn(message),
        });
      }
      saveManifest(detection.files, join(dirname(resolve(opts.graphOut)), "manifest.json"));
      const cost = updateCostFile(extraction, detection, opts.costOut);

      console.log(`Graph: ${G.order} nodes, ${G.size} edges, ${analyzed.communities.size} communities`);
      console.log(`This run: ${(extraction.input_tokens ?? 0).toLocaleString()} input tokens, ${(extraction.output_tokens ?? 0).toLocaleString()} output tokens`);
      console.log(`All time: ${cost.total_input_tokens.toLocaleString()} input, ${cost.total_output_tokens.toLocaleString()} output (${cost.runs.length} runs)`);
    });

  program
    .command("finalize-update")
    .requiredOption("--detect <path>")
    .requiredOption("--ast <path>")
    .requiredOption("--existing-graph <path>")
    .requiredOption("--root <path>")
    .requiredOption("--graph-out <path>")
    .requiredOption("--report-out <path>")
    .requiredOption("--analysis-out <path>")
    .requiredOption("--cost-out <path>")
    .option("--directed", "Build a directed graph (preserves source->target)")
    .option("--cached <path>", "Optional cached semantic JSON")
    .option("--semantic-new <path>", "Optional fresh semantic JSON")
    .option("--html-out <path>", "Optional graph.html output path")
    .action((opts) => {
      const detection = readJson<DetectionResult>(opts.detect);
      const ast = ensureExtractionShape(readJson<Partial<Extraction>>(opts.ast));
      const cached = opts.cached && existsSync(resolve(opts.cached))
        ? readJson<Partial<Extraction>>(opts.cached)
        : null;
      const semanticNew = opts.semanticNew && existsSync(resolve(opts.semanticNew))
        ? readJson<Partial<Extraction>>(opts.semanticNew)
        : null;

      if (semanticNew) {
        saveSemanticCache(
          semanticNew.nodes as Array<Record<string, unknown>>,
          semanticNew.edges as Array<Record<string, unknown>>,
          (semanticNew.hyperedges ?? []) as Array<Record<string, unknown>>,
          ".",
        );
      }

      const semantic = mergeSemanticArtifacts(cached, semanticNew);
      const extraction = mergeAstAndSemantic(ast, semantic);

      const oldGraph = loadGraph(opts.existingGraph);
      const mergedGraph = loadGraph(opts.existingGraph);
      const newGraph = buildFromJson(extraction, {
        directed: shouldBuildDirected(opts, oldGraph),
      });
      mergeGraphs(mergedGraph, newGraph);

      const analyzed = analyzeGraph(
        mergedGraph,
        detection,
        resolve(opts.root),
        { input: extraction.input_tokens ?? 0, output: extraction.output_tokens ?? 0 },
      );
      analyzed.analysis.diff = graphDiff(oldGraph, mergedGraph);

      toJson(mergedGraph, analyzed.communities, resolve(opts.graphOut), {
        communityLabels: analyzed.labels,
      });
      writeFileSync(resolve(opts.reportOut), analyzed.report, "utf-8");
      writeJson(opts.analysisOut, analyzed.analysis);
      if (opts.htmlOut) {
        safeToHtml(mergedGraph, analyzed.communities, resolve(opts.htmlOut), {
          communityLabels: analyzed.labels,
        }, {
          onWarning: (message) => console.warn(message),
        });
      }
      saveManifest(detection.files, join(dirname(resolve(opts.graphOut)), "manifest.json"));
      const cost = updateCostFile(extraction, detection, opts.costOut);

      console.log(`Merged: ${mergedGraph.order} nodes, ${mergedGraph.size} edges`);
      console.log(analyzed.analysis.diff.summary);
      console.log(`This run: ${(extraction.input_tokens ?? 0).toLocaleString()} input tokens, ${(extraction.output_tokens ?? 0).toLocaleString()} output tokens`);
      console.log(`All time: ${cost.total_input_tokens.toLocaleString()} input, ${cost.total_output_tokens.toLocaleString()} output (${cost.runs.length} runs)`);
    });

  program
    .command("analyze-build")
    .requiredOption("--extract <path>")
    .requiredOption("--detect <path>")
    .requiredOption("--root <path>")
    .requiredOption("--graph-out <path>")
    .requiredOption("--report-out <path>")
    .requiredOption("--analysis-out <path>")
    .option("--directed", "Build a directed graph (preserves source->target)")
    .action((opts) => {
      const extraction = ensureExtractionShape(readJson<Partial<Extraction>>(opts.extract));
      const detection = readJson<DetectionResult>(opts.detect);
      const root = resolve(opts.root);
      const G = buildFromJson(extraction, { directed: shouldBuildDirected(opts) });

      if (G.order === 0) {
        throw new Error("Graph is empty - extraction produced no nodes.");
      }

      const analyzed = analyzeGraph(
        G,
        detection,
        root,
        { input: extraction.input_tokens ?? 0, output: extraction.output_tokens ?? 0 },
      );

      mkdirSync(dirname(resolve(opts.graphOut)), { recursive: true });
      toJson(G, analyzed.communities, resolve(opts.graphOut), {
        communityLabels: analyzed.labels,
      });
      writeFileSync(resolve(opts.reportOut), analyzed.report, "utf-8");
      writeJson(opts.analysisOut, analyzed.analysis);
      saveManifest(detection.files, join(dirname(resolve(opts.graphOut)), "manifest.json"));
      console.log(`Graph: ${G.order} nodes, ${G.size} edges, ${analyzed.communities.size} communities`);
    });

  program
    .command("write-labeled-report")
    .requiredOption("--extract <path>")
    .requiredOption("--detect <path>")
    .requiredOption("--analysis <path>")
    .requiredOption("--labels <path>")
    .requiredOption("--root <path>")
    .requiredOption("--report-out <path>")
    .option("--directed", "Build a directed graph (preserves source->target)")
    .option("--graph-out <path>")
    .option("--html-out <path>")
    .action((opts) => {
      const extraction = ensureExtractionShape(readJson<Partial<Extraction>>(opts.extract));
      const detection = readJson<DetectionResult>(opts.detect);
      const analysis = readJson<AnalysisFile>(opts.analysis);
      const labelObject = readJson<Record<string, string>>(opts.labels);
      const labels = objectToStringMap(labelObject);
      const G = buildFromJson(extraction, { directed: shouldBuildDirected(opts) });
      const communities = new Map<number, string[]>(
        Object.entries(analysis.communities).map(([key, value]) => [Number.parseInt(key, 10), value]),
      );
      const cohesion = new Map<number, number>(
        Object.entries(analysis.cohesion).map(([key, value]) => [Number.parseInt(key, 10), value]),
      );
      const questions = suggestQuestions(G, communities, labels);
      const report = generate(
        G,
        communities,
        cohesion,
        labels,
        analysis.gods,
        analysis.surprises,
        detection,
        { input: extraction.input_tokens ?? 0, output: extraction.output_tokens ?? 0 },
        resolve(opts.root),
        questions,
      );

      analysis.questions = questions;
      analysis.labels = mapToObject(labels);
      writeFileSync(resolve(opts.reportOut), report, "utf-8");
      if (opts.graphOut) {
        toJson(G, communities, resolve(opts.graphOut), { communityLabels: labels });
      }
      if (opts.htmlOut) {
        safeToHtml(G, communities, resolve(opts.htmlOut), { communityLabels: labels }, {
          onWarning: (message) => console.warn(message),
        });
      }
      writeJson(opts.analysis, analysis);
      console.log("Labeled artifacts updated");
    });

  program
    .command("export-html")
    .requiredOption("--extract <path>")
    .requiredOption("--analysis <path>")
    .option("--labels <path>")
    .requiredOption("--out <path>")
    .option("--directed", "Build a directed graph (preserves source->target)")
    .action((opts) => {
      const extraction = ensureExtractionShape(readJson<Partial<Extraction>>(opts.extract));
      const analysis = readJson<AnalysisFile>(opts.analysis);
      const labels = opts.labels ? objectToStringMap(readJson<Record<string, string>>(opts.labels)) : objectToStringMap(analysis.labels);
      const communities = new Map<number, string[]>(
        Object.entries(analysis.communities).map(([key, value]) => [Number.parseInt(key, 10), value]),
      );
      const G = buildFromJson(extraction, { directed: shouldBuildDirected(opts) });
      toHtml(G, communities, resolve(opts.out), { communityLabels: labels });
      console.log("graph.html written - open in any browser, no server needed");
    });

  program
    .command("export-svg")
    .requiredOption("--extract <path>")
    .requiredOption("--analysis <path>")
    .option("--labels <path>")
    .requiredOption("--out <path>")
    .option("--directed", "Build a directed graph (preserves source->target)")
    .action((opts) => {
      const extraction = ensureExtractionShape(readJson<Partial<Extraction>>(opts.extract));
      const analysis = readJson<AnalysisFile>(opts.analysis);
      const labels = opts.labels ? objectToStringMap(readJson<Record<string, string>>(opts.labels)) : objectToStringMap(analysis.labels);
      const communities = new Map<number, string[]>(
        Object.entries(analysis.communities).map(([key, value]) => [Number.parseInt(key, 10), value]),
      );
      const G = buildFromJson(extraction, { directed: shouldBuildDirected(opts) });
      toSvg(G, communities, resolve(opts.out), labels);
      console.log("graph.svg written - embeds in Obsidian, Notion, GitHub READMEs");
    });

  program
    .command("export-graphml")
    .requiredOption("--extract <path>")
    .requiredOption("--analysis <path>")
    .requiredOption("--out <path>")
    .option("--directed", "Build a directed graph (preserves source->target)")
    .action((opts) => {
      const extraction = ensureExtractionShape(readJson<Partial<Extraction>>(opts.extract));
      const analysis = readJson<AnalysisFile>(opts.analysis);
      const communities = new Map<number, string[]>(
        Object.entries(analysis.communities).map(([key, value]) => [Number.parseInt(key, 10), value]),
      );
      const G = buildFromJson(extraction, { directed: shouldBuildDirected(opts) });
      toGraphml(G, communities, resolve(opts.out));
      console.log("graph.graphml written - open in Gephi, yEd, or any GraphML tool");
    });

  program
    .command("export-cypher")
    .requiredOption("--extract <path>")
    .requiredOption("--out <path>")
    .option("--directed", "Build a directed graph (preserves source->target)")
    .action((opts) => {
      const extraction = ensureExtractionShape(readJson<Partial<Extraction>>(opts.extract));
      const G = buildFromJson(extraction, { directed: shouldBuildDirected(opts) });
      toCypher(G, resolve(opts.out));
      console.log("cypher.txt written - import with: cypher-shell < .graphify/cypher.txt");
    });

  program
    .command("push-neo4j")
    .requiredOption("--extract <path>")
    .requiredOption("--analysis <path>")
    .requiredOption("--uri <uri>")
    .requiredOption("--user <user>")
    .requiredOption("--password <password>")
    .option("--directed", "Build a directed graph (preserves source->target)")
    .action(async (opts) => {
      const extraction = ensureExtractionShape(readJson<Partial<Extraction>>(opts.extract));
      const analysis = readJson<AnalysisFile>(opts.analysis);
      const G = buildFromJson(extraction, { directed: shouldBuildDirected(opts) });
      const communities = new Map<number, string[]>(
        Object.entries(analysis.communities).map(([key, value]) => [Number.parseInt(key, 10), value]),
      );
      const result = await pushToNeo4j(G, {
        uri: opts.uri,
        user: opts.user,
        password: opts.password,
        communities,
      });
      console.log(`Pushed to Neo4j: ${result.nodes} nodes, ${result.edges} edges`);
    });

  program
    .command("benchmark")
    .requiredOption("--graph <path>")
    .option("--corpus-words <n>")
    .action((opts) => {
      const corpusWords = opts.corpusWords ? Number.parseInt(opts.corpusWords, 10) : undefined;
      const result = runBenchmark(resolve(opts.graph), corpusWords);
      printBenchmark(result);
    });

  program
    .command("update-cost")
    .requiredOption("--extract <path>")
    .requiredOption("--detect <path>")
    .requiredOption("--out <path>")
    .action((opts) => {
      const extraction = ensureExtractionShape(readJson<Partial<Extraction>>(opts.extract));
      const detection = readJson<DetectionResult>(opts.detect);
      const outPath = resolve(opts.out);

      let cost = {
        runs: [] as Array<{ date: string; input_tokens: number; output_tokens: number; files: number }>,
        total_input_tokens: 0,
        total_output_tokens: 0,
      };
      if (existsSync(outPath)) {
        cost = readJson<typeof cost>(outPath);
      }

      const input = extraction.input_tokens ?? 0;
      const output = extraction.output_tokens ?? 0;
      cost.runs.push({
        date: new Date().toISOString(),
        input_tokens: input,
        output_tokens: output,
        files: detection.total_files,
      });
      cost.total_input_tokens += input;
      cost.total_output_tokens += output;
      writeJson(outPath, cost);

      console.log(`This run: ${input.toLocaleString()} input tokens, ${output.toLocaleString()} output tokens`);
      console.log(
        `All time: ${cost.total_input_tokens.toLocaleString()} input, ${cost.total_output_tokens.toLocaleString()} output (${cost.runs.length} runs)`,
      );
    });

  program
    .command("merge-update")
    .requiredOption("--existing-graph <path>")
    .requiredOption("--extract <path>")
    .requiredOption("--detect <path>")
    .requiredOption("--root <path>")
    .requiredOption("--graph-out <path>")
    .requiredOption("--report-out <path>")
    .requiredOption("--analysis-out <path>")
    .option("--directed", "Build a directed graph (preserves source->target)")
    .action((opts) => {
      const oldGraph = loadGraph(opts.existingGraph);
      const mergedGraph = loadGraph(opts.existingGraph);
      const extraction = ensureExtractionShape(readJson<Partial<Extraction>>(opts.extract));
      const detection = readJson<DetectionResult>(opts.detect);
      const newGraph = buildFromJson(extraction, {
        directed: shouldBuildDirected(opts, oldGraph),
      });

      mergeGraphs(mergedGraph, newGraph);

      const analyzed = analyzeGraph(
        mergedGraph,
        detection,
        resolve(opts.root),
        { input: extraction.input_tokens ?? 0, output: extraction.output_tokens ?? 0 },
      );
      analyzed.analysis.diff = graphDiff(oldGraph, mergedGraph);

      toJson(mergedGraph, analyzed.communities, resolve(opts.graphOut), {
        communityLabels: analyzed.labels,
      });
      writeFileSync(resolve(opts.reportOut), analyzed.report, "utf-8");
      writeJson(opts.analysisOut, analyzed.analysis);
      saveManifest(detection.files, join(dirname(resolve(opts.graphOut)), "manifest.json"));

      console.log(`Merged: ${mergedGraph.order} nodes, ${mergedGraph.size} edges`);
      console.log(analyzed.analysis.diff.summary);
    });

  program
    .command("cluster-only")
    .requiredOption("--graph <path>")
    .requiredOption("--root <path>")
    .requiredOption("--graph-out <path>")
    .requiredOption("--report-out <path>")
    .requiredOption("--analysis-out <path>")
    .option("--html-out <path>")
    .action((opts) => {
      const G = loadGraph(opts.graph);
      const analyzed = analyzeGraph(
        G,
        placeholderDetection(opts.root),
        resolve(opts.root),
        { input: 0, output: 0 },
      );
      toJson(G, analyzed.communities, resolve(opts.graphOut), {
        communityLabels: analyzed.labels,
      });
      writeFileSync(resolve(opts.reportOut), analyzed.report, "utf-8");
      writeJson(opts.analysisOut, analyzed.analysis);
      if (opts.htmlOut) {
        safeToHtml(G, analyzed.communities, resolve(opts.htmlOut), {
          communityLabels: analyzed.labels,
        }, {
          onWarning: (message) => console.warn(message),
        });
      }
      console.log(`Re-clustered: ${analyzed.communities.size} communities`);
    });

  program
    .command("summary")
    .requiredOption("--graph <path>")
    .option("--top-hubs <n>", "Number of hubs to include", "5")
    .option("--top-communities <n>", "Number of communities to include", "5")
    .option("--nodes-per-community <n>", "Number of representative nodes per community", "3")
    .action((opts) => {
      const G = loadGraph(opts.graph);
      const summary = buildFirstHopSummary(G, {
        topHubs: Number(opts.topHubs),
        topCommunities: Number(opts.topCommunities),
        nodesPerCommunity: Number(opts.nodesPerCommunity),
      });
      console.log(firstHopSummaryToText(summary));
    });

  program
    .command("flows-build")
    .requiredOption("--graph <path>")
    .requiredOption("--out <path>")
    .option("--max-depth <n>", "Maximum CALLS depth", "15")
    .option("--include-tests", "Include tests as possible entry points")
    .action((opts) => {
      const G = loadGraph(opts.graph);
      const artifact = buildFlowArtifact(createReviewGraphStore(G), {
        graphPath: opts.graph,
        maxDepth: Number(opts.maxDepth),
        includeTests: opts.includeTests === true,
      });
      writeFlowArtifact(artifact, opts.out);
      console.log(`Execution flows: ${artifact.flows.length} written to ${opts.out}`);
      for (const warning of artifact.warnings) console.warn(warning);
    });

  program
    .command("flows-list")
    .requiredOption("--flows <path>")
    .option("--sort <key>", "criticality|depth|node-count|file-count|name", "criticality")
    .option("--limit <n>", "Maximum flows to show", "50")
    .option("--json", "Print JSON")
    .action((opts) => {
      const artifact = readFlowArtifact(opts.flows);
      const sortBy = ["criticality", "depth", "node-count", "file-count", "name"].includes(String(opts.sort))
        ? String(opts.sort) as ListFlowsOptions["sortBy"]
        : "criticality";
      const listOptions: ListFlowsOptions = {
        sortBy,
        limit: Number(opts.limit),
      };
      if (opts.json) {
        console.log(JSON.stringify(listFlows(artifact, listOptions), null, 2));
        return;
      }
      console.log(flowListToText(artifact, listOptions));
    });

  program
    .command("flows-get")
    .requiredOption("--flows <path>")
    .requiredOption("--graph <path>")
    .requiredOption("--id <flow-id>")
    .option("--json", "Print JSON")
    .action((opts) => {
      const detail = getFlowById(readFlowArtifact(opts.flows), opts.id, createReviewGraphStore(loadGraph(opts.graph)));
      if (!detail) throw new Error(`flow not found: ${opts.id}`);
      if (opts.json) {
        console.log(JSON.stringify(detail, null, 2));
        return;
      }
      console.log(flowDetailToText(detail));
    });

  program
    .command("affected-flows")
    .requiredOption("--flows <path>")
    .requiredOption("--graph <path>")
    .requiredOption("--files <csv>", "Comma or newline separated changed files")
    .option("--json", "Print JSON")
    .action((opts) => {
      const files = String(opts.files)
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean);
      const result = getAffectedFlows(
        readFlowArtifact(opts.flows),
        files,
        createReviewGraphStore(loadGraph(opts.graph)),
      );
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(affectedFlowsToText(result));
    });

  program
    .command("review-context")
    .requiredOption("--graph <path>")
    .requiredOption("--files <csv>", "Comma or newline separated changed files")
    .option("--detail-level <level>", "minimal|standard", "standard")
    .option("--include-source", "Include capped source snippets")
    .option("--max-depth <n>", "Impact radius depth", "2")
    .option("--max-lines-per-file <n>", "Maximum full-file snippet lines", "200")
    .option("--repo-root <path>", "Repository root for source snippets", ".")
    .option("--json", "Print JSON")
    .action((opts) => {
      const files = String(opts.files)
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean);
      const result = buildReviewContext(createReviewGraphStore(loadGraph(opts.graph)), files, {
        detailLevel: opts.detailLevel === "minimal" ? "minimal" : "standard",
        includeSource: opts.includeSource === true,
        maxDepth: Number(opts.maxDepth),
        maxLinesPerFile: Number(opts.maxLinesPerFile),
        repoRoot: opts.repoRoot,
      });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(reviewContextToText(result));
    });

  program
    .command("detect-changes")
    .requiredOption("--graph <path>")
    .requiredOption("--files <csv>", "Comma or newline separated changed files")
    .option("--flows <path>", "Optional path to flows.json")
    .option("--detail-level <level>", "minimal|standard", "standard")
    .option("--json", "Print JSON")
    .action((opts) => {
      const files = String(opts.files)
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean);
      const flowsArtifact = opts.flows ? readFlowArtifact(opts.flows) : null;
      const result = analyzeChanges(createReviewGraphStore(loadGraph(opts.graph)), files, {
        flows: flowsArtifact,
      });
      const output = opts.detailLevel === "minimal" ? detectChangesToMinimal(result) : result;
      if (opts.json) {
        console.log(JSON.stringify(output, null, 2));
        return;
      }
      console.log(detectChangesToText(output));
    });

  program
    .command("minimal-context")
    .requiredOption("--graph <path>")
    .option("--files <csv>", "Comma or newline separated changed files", "")
    .option("--flows <path>", "Optional path to flows.json")
    .option("--task <text>", "Task intent used to route next graph tools", "")
    .option("--json", "Print JSON")
    .action((opts) => {
      const files = String(opts.files)
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean);
      const result = buildMinimalContext(createReviewGraphStore(loadGraph(opts.graph)), {
        changedFiles: files,
        flows: opts.flows ? readFlowArtifact(opts.flows) : null,
        task: opts.task,
      });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(minimalContextToText(result));
    });

  program
    .command("review-delta")
    .requiredOption("--graph <path>")
    .requiredOption("--files <csv>", "Comma or newline separated changed files")
    .option("--max-nodes <n>", "Maximum impacted nodes", "80")
    .option("--max-chains <n>", "Maximum high-risk chains", "8")
    .action((opts) => {
      const G = loadGraph(opts.graph);
      const files = String(opts.files)
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean);
      const delta = buildReviewDelta(G, files, {
        maxNodes: Number(opts.maxNodes),
        maxChains: Number(opts.maxChains),
      });
      console.log(reviewDeltaToText(delta));
    });

  program
    .command("review-analysis")
    .requiredOption("--graph <path>")
    .requiredOption("--files <csv>", "Comma or newline separated changed files")
    .option("--max-nodes <n>", "Maximum impacted nodes", "120")
    .option("--max-chains <n>", "Maximum high-risk chains", "12")
    .option("--max-communities <n>", "Maximum impacted communities", "8")
    .action((opts) => {
      const G = loadGraph(opts.graph);
      const files = String(opts.files)
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean);
      const analysis = buildReviewAnalysis(G, files, {
        maxNodes: Number(opts.maxNodes),
        maxChains: Number(opts.maxChains),
        maxCommunities: Number(opts.maxCommunities),
      });
      console.log(reviewAnalysisToText(analysis));
    });

  program
    .command("review-eval")
    .requiredOption("--graph <path>")
    .requiredOption("--cases <path>", "JSON file: array of cases or {cases:[...]}")
    .option("--default-file-tokens <n>", "Fallback naive token estimate per file", "800")
    .action((opts) => {
      const rawCases = JSON.parse(readFileSync(resolve(opts.cases), "utf-8"));
      const cases = Array.isArray(rawCases) ? rawCases : rawCases.cases;
      if (!Array.isArray(cases)) throw new Error("--cases must contain an array or an object with a cases array");
      const G = loadGraph(opts.graph);
      const evaluation = evaluateReviewAnalysis(G, cases, {
        defaultFileTokens: Number(opts.defaultFileTokens),
      });
      console.log(reviewEvaluationToText(evaluation));
    });

  program
    .command("recommend-commits")
    .requiredOption("--graph <path>")
    .requiredOption("--files <csv>", "Comma or newline separated changed files")
    .option("--max-groups <n>", "Maximum commit groups", "6")
    .option("--max-nodes <n>", "Maximum impacted nodes per group", "60")
    .option("--max-chains <n>", "Maximum high-risk chains per group", "4")
    .action((opts) => {
      const G = loadGraph(opts.graph);
      const files = String(opts.files)
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean);
      const recommendation = buildCommitRecommendation(G, files, {
        maxGroups: Number(opts.maxGroups),
        maxNodes: Number(opts.maxNodes),
        maxChains: Number(opts.maxChains),
      });
      console.log(commitRecommendationToText(recommendation));
    });

  program
    .command("path")
    .requiredOption("--graph <path>")
    .argument("<nodeA>")
    .argument("<nodeB>")
    .action(async (nodeA, nodeB, opts) => {
      const G = loadGraph(opts.graph);
      const source = findBestMatchingNode(G, nodeA);
      const target = findBestMatchingNode(G, nodeB);
      if (!source || !target) {
        console.log(`Could not find nodes matching: ${JSON.stringify(nodeA)} or ${JSON.stringify(nodeB)}`);
        return;
      }
      let path: string[];
      try {
        const shortestPath = await import("graphology-shortest-path/unweighted.js");
        path = shortestPath.bidirectional(G, source, target) ?? [];
      } catch {
        throw new Error("graphology-shortest-path is unavailable");
      }
      if (path.length === 0) {
        console.log(`No path found between ${JSON.stringify(nodeA)} and ${JSON.stringify(nodeB)}`);
        return;
      }
      console.log(`Shortest path (${path.length - 1} hops):`);
      for (let i = 0; i < path.length; i++) {
        const nodeId = path[i]!;
        const label = (G.getNodeAttribute(nodeId, "label") as string) ?? nodeId;
        if (i === path.length - 1) {
          console.log(`  ${label}`);
          break;
        }
        const nextNode = path[i + 1]!;
        const edgeId = G.edge(nodeId, nextNode);
        const attrs = edgeId ? G.getEdgeAttributes(edgeId) : {};
        console.log(`  ${label} --${attrs.relation ?? ""}--> [${attrs.confidence ?? ""}]`);
      }
    });

  program
    .command("explain")
    .requiredOption("--graph <path>")
    .argument("<nodeName>")
    .action((nodeName, opts) => {
      const G = loadGraph(opts.graph);
      const nodeId = findBestMatchingNode(G, nodeName);
      if (!nodeId) {
        console.log(`No node matching ${JSON.stringify(nodeName)}`);
        return;
      }
      const attrs = G.getNodeAttributes(nodeId);
      console.log(`NODE: ${(attrs.label as string) ?? nodeId}`);
      console.log(`  source: ${(attrs.source_file as string) ?? "unknown"}`);
      console.log(`  type: ${(attrs.file_type as string) ?? "unknown"}`);
      console.log(`  degree: ${G.degree(nodeId)}`);
      console.log("");
      console.log("CONNECTIONS:");
      forEachTraversalNeighbor(G, nodeId, (neighbor) => {
        const edgeId = G.edge(nodeId, neighbor);
        const edge = edgeId ? G.getEdgeAttributes(edgeId) : {};
        const label = (G.getNodeAttribute(neighbor, "label") as string) ?? neighbor;
        const sourceFile = (G.getNodeAttribute(neighbor, "source_file") as string) ?? "";
        console.log(`  --${edge.relation ?? ""}--> ${label} [${edge.confidence ?? ""}] (${sourceFile})`);
      });
    });

  program
    .command("ingest")
    .alias("add")
    .argument("<url>")
    .option("--target-dir <path>", "Directory to save fetched content", "./raw")
    .option("--author <name>")
    .option("--contributor <name>")
    .action(async (url, opts) => {
      const outPath = await ingest(url, resolve(opts.targetDir), {
        author: opts.author ?? null,
        contributor: opts.contributor ?? null,
      });
      console.log(`Saved to ${outPath}`);
    });

  program
    .command("save-query-result")
    .requiredOption("--question <text>")
    .requiredOption("--answer <text>")
    .requiredOption("--memory-dir <path>")
    .option("--query-type <type>", "Type label for the saved Q&A", "query")
    .option("--source-nodes-json <json>", "JSON array of source node labels", "[]")
    .action((opts) => {
      const outPath = saveQueryResult({
        question: opts.question,
        answer: opts.answer,
        memoryDir: resolve(opts.memoryDir),
        queryType: opts.queryType,
        sourceNodes: JSON.parse(opts.sourceNodesJson) as string[],
      });
      console.log(`Saved to ${outPath}`);
    });

  await program.parseAsync(argv);
}

function isDirectRuntimeExecution(): boolean {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === __filename;
  } catch {
    return resolve(process.argv[1]) === __filename;
  }
}

if (isDirectRuntimeExecution()) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  });
}
