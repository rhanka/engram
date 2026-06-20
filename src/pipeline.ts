/**
 * Standalone project build pipeline.
 *
 * This is the CLI-safe AST-first entrypoint that turns a folder into the
 * core graphify outputs without depending on assistant slash commands.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type Graph from "graphology";

import { detect, saveManifest } from "./detect.js";
import { inspectInputScope } from "./input-scope.js";
import { buildFromJson } from "./build.js";
import { cluster, scoreAll } from "./cluster.js";
import { godNodes, surprisingConnections, suggestQuestions } from "./analyze.js";
import { generate } from "./report.js";
import { backupIfProtected } from "./export.js";
import { buildStaticStudio, StudioSpaNotBuiltError, removeLegacyGraphViz } from "./studio-export.js";
import { extractWithDiagnostics, type ExtractionDiagnostic } from "./extract.js";
import { buildCodeFileNodeIdMap, extractGit, mergeExtractions } from "./extract-git.js";
import { resolveGraphifyPaths } from "./paths.js";
import { markLifecycleAnalyzed } from "./lifecycle.js";
import { resolveCommunityLabels } from "./community-labels.js";
import type { GenerateNodeDescriptionsOptions } from "./node-descriptions.js";
import { finalizeEnrichedGraphBuild } from "./finalize-enriched-graph.js";
import { safeGitRevParse } from "./git.js";
import { toWiki } from "./wiki.js";
import {
  makeDetectionPortable,
  makeExtractionPortable,
  projectRootLabel,
} from "./portable-artifacts.js";
import type {
  DetectionResult,
  Extraction,
  GraphifyInputScopeMode,
  GodNodeEntry,
  InputScopeSource,
  SuggestedQuestion,
  SurpriseEntry,
} from "./types.js";

export interface BuildProjectOptions {
  outputDir?: string;
  followSymlinks?: boolean;
  /**
   * Emit the static Ontology Studio bundle into `<stateDir>/studio` (the
   * visual output that replaced the former HTML graph export). ON by default;
   * best-effort — a missing prebuilt SPA degrades to a warning, never a throw.
   */
  studio?: boolean;
  wiki?: boolean;
  directed?: boolean;
  scope?: GraphifyInputScopeMode;
  scopeSource?: InputScopeSource;
  /**
   * WP11: generate a short `description` for every graph node (entity + code)
   * and stamp it onto the node before graph.json is written. ON by default;
   * the CLI `--no-description` flag sets this to `false`. Degrades gracefully
   * to a no-op when no LLM backend is configured.
   */
  describe?: boolean;
  /** Explicit description backend; defaults to auto-detect from API keys. */
  descriptionBackend?: string;
  descriptionModel?: string;
  descriptionMaxNodes?: number;
  /** Injectable LLM caller for tests; bypasses real network calls. */
  describeCallLlm?: GenerateNodeDescriptionsOptions["callLlm"];
}

export interface BuildProjectWarning {
  code: "non_code_skipped" | "partial_extraction" | "studio_skipped";
  message: string;
}

export interface BuildProjectArtifacts {
  detectionPath: string;
  manifestPath: string;
  reportPath: string;
  graphPath: string;
  studioDir?: string;
  wikiDir?: string;
}

export interface BuildProjectResult {
  root: string;
  outputDir: string;
  detection: DetectionResult;
  extraction: Extraction;
  diagnostics: ExtractionDiagnostic[];
  graph: Graph;
  communities: Map<number, string[]>;
  cohesion: Map<number, number>;
  labels: Map<number, string>;
  gods: GodNodeEntry[];
  surprises: SurpriseEntry[];
  questions: SuggestedQuestion[];
  warnings: BuildProjectWarning[];
  artifacts: BuildProjectArtifacts;
}

function countNonCodeFiles(detection: DetectionResult): number {
  return (
    fileList(detection, "document").length +
    fileList(detection, "paper").length +
    fileList(detection, "image").length +
    fileList(detection, "video").length
  );
}

function formatDiagnosticSummary(diagnostics: ExtractionDiagnostic[]): string {
  return diagnostics
    .slice(0, 3)
    .map((d) => `${d.filePath}: ${d.error}`)
    .join(" | ");
}

function fileList(detection: DetectionResult, kind: string): string[] {
  return detection.files[kind] ?? [];
}

export async function buildProject(
  root: string = ".",
  options?: BuildProjectOptions,
): Promise<BuildProjectResult> {
  const rootResolved = resolve(root);
  const paths = resolveGraphifyPaths({ root: rootResolved, stateDir: options?.outputDir });
  const outputDir = paths.stateDir;
  const detectionPath = paths.scratch.detect;
  const manifestPath = paths.manifest;
  const reportPath = paths.report;
  const graphPath = paths.graph;
  const warnings: BuildProjectWarning[] = [];

  mkdirSync(outputDir, { recursive: true });

  const scopeInventory = inspectInputScope(rootResolved, {
    mode: options?.scope ?? "auto",
    source: options?.scopeSource ?? (options?.scope ? "cli" : "default-auto"),
  });
  const rawDetection = detect(rootResolved, {
    followSymlinks: options?.followSymlinks,
    candidateFiles: scopeInventory.candidateFiles,
    candidateRoot: scopeInventory.scope.git_root ?? rootResolved,
    scope: scopeInventory.scope,
  });
  const detection = makeDetectionPortable(rawDetection, rootResolved);
  writeFileSync(detectionPath, JSON.stringify(detection, null, 2), "utf-8");
  if (detection.scope) {
    writeFileSync(paths.scope, JSON.stringify(detection.scope, null, 2), "utf-8");
  }
  saveManifest(rawDetection.files, manifestPath, { root: rootResolved });

  const codeFiles = fileList(rawDetection, "code");

  if (codeFiles.length === 0) {
    const nonCode = countNonCodeFiles(rawDetection);
    if (nonCode > 0) {
      throw new Error(
        "No supported code files found. The standalone CLI currently builds the AST graph " +
        `from code only; this folder has ${nonCode} doc/paper/image/video file(s). ` +
        "Use the graphify skill in your assistant for semantic extraction of non-code inputs.",
      );
    }
    throw new Error(`No supported code files found under ${rootResolved}.`);
  }

  const nonCode = countNonCodeFiles(rawDetection);
  if (nonCode > 0) {
    warnings.push({
      code: "non_code_skipped",
      message:
        `Skipped ${nonCode} non-code file(s) in standalone AST mode ` +
        `(docs=${fileList(rawDetection, "document").length}, papers=${fileList(rawDetection, "paper").length}, images=${fileList(rawDetection, "image").length}, video=${fileList(rawDetection, "video").length}). ` +
        "Use the graphify assistant skill for semantic extraction of those inputs.",
    });
  }

  const extracted = await extractWithDiagnostics(codeFiles);
  const gitExtraction = extractGit(rootResolved, {
    fileNodeIds: buildCodeFileNodeIdMap(rootResolved, codeFiles),
  });
  const mergedExtraction = mergeExtractions(extracted.extraction, gitExtraction);
  const diagnostics = extracted.diagnostics;

  if (diagnostics.length > 0) {
    warnings.push({
      code: "partial_extraction",
      message:
        `AST extraction failed for ${diagnostics.length}/${codeFiles.length} code file(s). ` +
        formatDiagnosticSummary(diagnostics),
    });
  }

  if (mergedExtraction.nodes.length === 0) {
    const detail = diagnostics.length > 0
      ? ` ${formatDiagnosticSummary(diagnostics)}`
      : "";
    throw new Error(
      "AST extraction produced no graph nodes." +
      detail +
      " Install the required tree-sitter grammar packages for the languages in this repo.",
    );
  }

  const extraction = makeExtractionPortable(mergedExtraction, rootResolved);
  const G = buildFromJson(extraction, { directed: options?.directed === true });
  if (G.order === 0) {
    throw new Error("Graph is empty after buildFromJson().");
  }

  const communities = cluster(G);
  const cohesion = scoreAll(G, communities);
  const gods = godNodes(G);
  const surprises = surprisingConnections(G, communities);
  const labels = resolveCommunityLabels(communities, {
    labelsPath: paths.scratch.labels,
    graph: G,
  });

  // Upstream 6939494 (#834): snapshot existing artifacts before overwrite if
  // the previous graph cost real LLM tokens or has been human-curated.
  backupIfProtected(paths.stateDir);

  // SPEC_GRAPHIFY § Enrichment Stages: run the shared finalization step
  // (salient labels → node descriptions → citation projection writer) so this
  // path converges with `graphify update` / `extract`. Previously buildProject
  // described but only resolved existing labels and never applied salient names.
  //
  // The finalizer runs BEFORE report/question generation: it mutates `labels`
  // in place with the salient/ingested community names. Generating the report
  // or the suggested questions first would bake GENERIC labels into both
  // artifacts even when salient names (or an ingested answer) resolved.
  await finalizeEnrichedGraphBuild({
    graph: G,
    communities,
    labels,
    graphPath,
    stateDir: paths.stateDir,
    labelsPath: paths.scratch.labels,
    gods,
    ...(options?.describe !== undefined ? { describe: options.describe } : {}),
    ...(options?.descriptionBackend ? { descriptionBackend: options.descriptionBackend } : {}),
    ...(options?.descriptionModel ? { descriptionModel: options.descriptionModel } : {}),
    ...(options?.descriptionMaxNodes !== undefined ? { descriptionMaxNodes: options.descriptionMaxNodes } : {}),
    // `describeCallLlm` is a DESCRIPTION-only caller; pass it solely to the
    // description stage. An injected callLlm is a programmatic direct opt-in
    // (community-labeling.ts:535), so handing it to the label stage too would
    // silently drive labels into direct mode with label prompts. buildProject
    // exposes no label caller, so the label stage stays assistant/auto here.
    ...(options?.describeCallLlm ? { descriptionCallLlm: options.describeCallLlm } : {}),
  });

  // Report + suggested questions are derived from the FINALIZED labels.
  const questions = suggestQuestions(G, communities, labels);
  const report = generate(
    G,
    communities,
    cohesion,
    labels,
    gods,
    surprises,
    detection,
    { input: extraction.input_tokens ?? 0, output: extraction.output_tokens ?? 0 },
    projectRootLabel(rootResolved),
    {
      suggestedQuestions: questions,
      freshness: { builtFromCommit: safeGitRevParse(rootResolved, ["HEAD"]) },
    },
  );
  writeFileSync(reportPath, report, "utf-8");

  // Visual output: the self-contained static Ontology Studio bundle (the
  // replacement for the former HTML graph export). Best-effort — a missing
  // prebuilt SPA degrades to a warning, never a throw.
  let studioDir: string | undefined;
  if (options?.studio !== false) {
    try {
      const result = buildStaticStudio({
        stateDir: paths.stateDir,
        outDir: paths.studioDir,
        onWarning: (message) => warnings.push({ code: "studio_skipped", message }),
      });
      studioDir = result.outDir;
      // Migration: erase a stale legacy graph viz left by an older graphify version.
      removeLegacyGraphViz(paths.stateDir);
    } catch (err) {
      const message =
        err instanceof StudioSpaNotBuiltError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err);
      warnings.push({ code: "studio_skipped", message });
    }
  }

  let wikiDir: string | undefined;
  if (options?.wiki) {
    wikiDir = paths.wikiDir;
    toWiki(G, communities, wikiDir, {
      communityLabels: labels,
      cohesion,
      godNodesData: gods,
    });
  }

  markLifecycleAnalyzed(rootResolved);

  return {
    root: rootResolved,
    outputDir,
    detection,
    extraction,
    diagnostics,
    graph: G,
    communities,
    cohesion,
    labels,
    gods,
    surprises,
    questions,
    warnings,
    artifacts: {
      detectionPath,
      manifestPath,
      reportPath,
      graphPath,
      studioDir,
      wikiDir,
    },
  };
}
