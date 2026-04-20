import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

import { detect } from "./detect.js";
import { discoverProjectConfig, loadProjectConfig } from "./project-config.js";
import { loadOntologyProfile } from "./ontology-profile.js";
import { loadProfileRegistries, registryRecordsToExtraction } from "./profile-registry.js";
import { resolveGraphifyPaths, type GraphifyPaths } from "./paths.js";
import { prepareSemanticDetection } from "./semantic-prepare.js";
import type {
  DetectionResult,
  Extraction,
  NormalizedOntologyProfile,
  NormalizedProjectConfig,
  RegistryRecord,
} from "./types.js";
import type { PdfOcrMode } from "./pdf-preflight.js";
import type { SemanticPreparationOptions, SemanticPreparationResult } from "./semantic-prepare.js";

const DETECTION_FILE_TYPES = ["code", "document", "paper", "image", "video"] as const;
const CORPUS_WARN_THRESHOLD = 50_000;
const CORPUS_UPPER_THRESHOLD = 500_000;
const FILE_COUNT_UPPER = 200;

export interface ConfiguredDetectionInputs {
  corpusRoots: string[];
  generatedRoots: string[];
  excludeRoots: string[];
  detectRoots: string[];
}

export interface ProfileState {
  profile_id: string;
  profile_version: string;
  profile_hash: string;
  project_config_path: string;
  ontology_profile_path: string | null;
  state_dir: string;
  detect_roots: string[];
  exclude_roots: string[];
  registry_counts: Record<string, number>;
  registry_node_count: number;
  semantic_file_count: number;
  transcript_count: number;
  pdf_artifact_count: number;
}

export interface ConfiguredDataprepOptions {
  configPath?: string;
  profilePath?: string;
  followSymlinks?: boolean;
  incremental?: boolean;
  semanticPrepare?: (
    detection: DetectionResult,
    options: SemanticPreparationOptions,
  ) => Promise<SemanticPreparationResult>;
}

export interface ConfiguredDataprepResult {
  root: string;
  paths: GraphifyPaths;
  projectConfig: NormalizedProjectConfig;
  profile: NormalizedOntologyProfile;
  detection: DetectionResult;
  semanticPreparation: SemanticPreparationResult;
  semanticDetection: DetectionResult;
  registries: Record<string, RegistryRecord[]>;
  registryExtraction: Extraction;
  profileState: ProfileState;
}

function uniqueResolved(paths: string[]): string[] {
  return [...new Set(paths.map((item) => resolve(item)))];
}

function fullPageScreenshotExcludes(config: NormalizedProjectConfig): string[] {
  if (config.dataprep.full_page_screenshot_vision) return [];
  return [
    join(config.configDir, "derived", "full-page-screenshots"),
  ];
}

export function buildConfiguredDetectionInputs(config: NormalizedProjectConfig): ConfiguredDetectionInputs {
  const corpusRoots = uniqueResolved(config.inputs.corpus);
  const generatedRoots = uniqueResolved(config.inputs.generated);
  const excludeRoots = uniqueResolved([
    ...config.inputs.exclude,
    ...fullPageScreenshotExcludes(config),
  ]);
  return {
    corpusRoots,
    generatedRoots,
    excludeRoots,
    detectRoots: uniqueResolved([...corpusRoots, ...generatedRoots]),
  };
}

function emptyDetection(): DetectionResult {
  return {
    files: Object.fromEntries(DETECTION_FILE_TYPES.map((fileType) => [fileType, []])),
    total_files: 0,
    total_words: 0,
    needs_graph: false,
    warning: `Corpus is ~0 words - fits in a single context window. You may not need a graph.`,
    skipped_sensitive: [],
    graphifyignore_patterns: 0,
  };
}

function countWords(filePath: string): number {
  try {
    return readFileSync(filePath, "utf-8").split(/\s+/).filter(Boolean).length;
  } catch {
    return 0;
  }
}

function warningFor(totalFiles: number, totalWords: number): string | null {
  if (totalWords < CORPUS_WARN_THRESHOLD) {
    return `Corpus is ~${totalWords.toLocaleString()} words - fits in a single context window. You may not need a graph.`;
  }
  if (totalWords >= CORPUS_UPPER_THRESHOLD || totalFiles >= FILE_COUNT_UPPER) {
    return (
      `Large corpus: ${totalFiles} files · ~${totalWords.toLocaleString()} words. ` +
      `Semantic extraction will be expensive (many Claude tokens). ` +
      `Consider running on a subfolder, or use --no-semantic to run AST-only.`
    );
  }
  return null;
}

function recomputeDetection(detection: DetectionResult): DetectionResult {
  const totalFiles = Object.values(detection.files).reduce((sum, files) => sum + files.length, 0);
  const totalWords = Object.entries(detection.files).reduce((sum, [fileType, files]) => {
    if (fileType === "video" || fileType === "image") return sum;
    return sum + files.reduce((inner, filePath) => inner + countWords(filePath), 0);
  }, 0);
  return {
    ...detection,
    total_files: totalFiles,
    total_words: totalWords,
    needs_graph: totalWords >= CORPUS_WARN_THRESHOLD,
    warning: warningFor(totalFiles, totalWords),
  };
}

function mergeDetections(detections: DetectionResult[]): DetectionResult {
  const merged = emptyDetection();
  const seen = new Set<string>();
  for (const detection of detections) {
    for (const fileType of DETECTION_FILE_TYPES) {
      for (const filePath of detection.files[fileType] ?? []) {
        const resolved = resolve(filePath);
        if (seen.has(resolved)) continue;
        seen.add(resolved);
        merged.files[fileType]!.push(resolved);
      }
    }
    merged.skipped_sensitive.push(...detection.skipped_sensitive);
    merged.graphifyignore_patterns += detection.graphifyignore_patterns;
  }
  return recomputeDetection(merged);
}

function isInside(path: string, root: string): boolean {
  const resolvedPath = resolve(path);
  const resolvedRoot = resolve(root);
  const rel = relative(resolvedRoot, resolvedPath);
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith(sep) && rel !== "..");
}

export function applyConfiguredExcludes(
  detection: DetectionResult,
  config: NormalizedProjectConfig,
): DetectionResult {
  const { excludeRoots } = buildConfiguredDetectionInputs(config);
  const files = Object.fromEntries(
    Object.entries(detection.files).map(([fileType, filePaths]) => [
      fileType,
      filePaths.filter((filePath) => !excludeRoots.some((excludeRoot) => isInside(filePath, excludeRoot))),
    ]),
  ) as Record<string, string[]>;
  return recomputeDetection({
    ...detection,
    files,
    skipped_sensitive: detection.skipped_sensitive.filter(
      (filePath) => !excludeRoots.some((excludeRoot) => isInside(filePath, excludeRoot)),
    ),
  });
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function writeRegistries(paths: GraphifyPaths, registries: Record<string, RegistryRecord[]>): void {
  mkdirSync(paths.profile.registriesDir, { recursive: true });
  for (const [registryId, records] of Object.entries(registries)) {
    writeJson(join(paths.profile.registriesDir, `${registryId}.json`), records);
  }
}

function buildProfileState(
  result: Omit<ConfiguredDataprepResult, "profileState">,
  inputs: ConfiguredDetectionInputs,
): ProfileState {
  return {
    profile_id: result.profile.id,
    profile_version: result.profile.version,
    profile_hash: result.profile.profile_hash,
    project_config_path: result.projectConfig.sourcePath,
    ontology_profile_path: result.profile.sourcePath ?? null,
    state_dir: result.paths.stateDir,
    detect_roots: inputs.detectRoots,
    exclude_roots: inputs.excludeRoots,
    registry_counts: Object.fromEntries(
      Object.entries(result.registries).map(([registryId, records]) => [registryId, records.length]),
    ),
    registry_node_count: result.registryExtraction.nodes.length,
    semantic_file_count: result.semanticDetection.total_files,
    transcript_count: result.semanticPreparation.transcriptPaths.length,
    pdf_artifact_count: result.semanticPreparation.pdfArtifacts.length,
  };
}

export function writeProfileState(paths: GraphifyPaths, state: ProfileState): void {
  writeJson(paths.profile.state, state);
}

function dataprepReport(result: ConfiguredDataprepResult): string {
  const registryLines = Object.entries(result.profileState.registry_counts)
    .map(([registryId, count]) => `- ${registryId}: ${count} records`)
    .join("\n");
  return [
    `# Graphify Profile Dataprep Report`,
    ``,
    `Profile: ${result.profile.id} ${result.profile.version}`,
    `Profile hash: ${result.profile.profile_hash}`,
    ``,
    `## Inputs`,
    `- Detection roots: ${result.profileState.detect_roots.length}`,
    `- Exclude roots: ${result.profileState.exclude_roots.length}`,
    ``,
    `## Detection`,
    `- Local files: ${result.detection.total_files}`,
    `- Semantic files: ${result.semanticDetection.total_files}`,
    `- Words: ${result.semanticDetection.total_words}`,
    ``,
    `## Registry Extraction`,
    registryLines || `- No registries`,
    `- Registry nodes: ${result.registryExtraction.nodes.length}`,
    ``,
    `## Local Preparation`,
    `- Transcripts: ${result.semanticPreparation.transcriptPaths.length}`,
    `- PDF artifacts: ${result.semanticPreparation.pdfArtifacts.length}`,
    ``,
  ].join("\n");
}

function resolveConfigPath(root: string, options: ConfiguredDataprepOptions): string {
  if (options.configPath) return resolve(options.configPath);
  const discovery = discoverProjectConfig(root);
  if (!discovery.path) {
    throw new Error(`No graphify project config found under ${resolve(root)}`);
  }
  return discovery.path;
}

export async function runConfiguredDataprep(
  root: string = ".",
  options: ConfiguredDataprepOptions = {},
): Promise<ConfiguredDataprepResult> {
  const resolvedRoot = resolve(root);
  const projectConfig = loadProjectConfig(resolveConfigPath(resolvedRoot, options));
  const profile = loadOntologyProfile(options.profilePath ?? projectConfig.profile.resolvedPath, {
    projectConfig,
  });
  const paths = resolveGraphifyPaths({ root: resolvedRoot, stateDir: projectConfig.outputs.state_dir });
  const inputs = buildConfiguredDetectionInputs(projectConfig);
  const rootDetections = inputs.detectRoots
    .filter((detectRoot) => existsSync(detectRoot))
    .map((detectRoot) => detect(detectRoot, { followSymlinks: options.followSymlinks }));
  const detection = applyConfiguredExcludes(mergeDetections(rootDetections), projectConfig);
  const semanticPrepare = options.semanticPrepare ?? prepareSemanticDetection;
  const semanticPreparation = await semanticPrepare(detection, {
    transcriptOutputDir: paths.transcriptsDir,
    pdfOutputDir: join(paths.convertedDir, "pdf"),
    pdfOcrMode: projectConfig.dataprep.pdf_ocr as PdfOcrMode,
    incremental: options.incremental,
  });
  const registries = loadProfileRegistries(profile);
  const registryExtraction = registryRecordsToExtraction(registries, profile);
  const baseResult: Omit<ConfiguredDataprepResult, "profileState"> = {
    root: resolvedRoot,
    paths,
    projectConfig,
    profile,
    detection,
    semanticPreparation,
    semanticDetection: semanticPreparation.detection,
    registries,
    registryExtraction,
  };
  const profileState = buildProfileState(baseResult, inputs);
  const result: ConfiguredDataprepResult = { ...baseResult, profileState };

  writeJson(paths.profile.projectConfig, projectConfig);
  writeJson(paths.profile.ontologyProfile, profile);
  writeRegistries(paths, registries);
  writeJson(paths.profile.registryExtraction, registryExtraction);
  writeJson(paths.profile.semanticDetection, result.semanticDetection);
  writeProfileState(paths, profileState);
  mkdirSync(dirname(paths.profile.dataprepReport), { recursive: true });
  writeFileSync(paths.profile.dataprepReport, dataprepReport(result), "utf-8");

  return result;
}
