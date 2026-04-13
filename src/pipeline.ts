/**
 * Standalone project build pipeline.
 *
 * This is the CLI-safe AST-first entrypoint that turns a folder into the
 * core graphify outputs without depending on assistant slash commands.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type Graph from "graphology";

import { detect, saveManifest } from "./detect.js";
import { buildFromJson } from "./build.js";
import { cluster, scoreAll } from "./cluster.js";
import { godNodes, surprisingConnections, suggestQuestions } from "./analyze.js";
import { generate } from "./report.js";
import { toHtml, toJson } from "./export.js";
import { extractWithDiagnostics, type ExtractionDiagnostic } from "./extract.js";
import { toWiki } from "./wiki.js";
import type {
  DetectionResult,
  Extraction,
  GodNodeEntry,
  SuggestedQuestion,
  SurpriseEntry,
} from "./types.js";

export interface BuildProjectOptions {
  outputDir?: string;
  followSymlinks?: boolean;
  html?: boolean;
  wiki?: boolean;
  directed?: boolean;
}

export interface BuildProjectWarning {
  code: "non_code_skipped" | "partial_extraction" | "html_skipped";
  message: string;
}

export interface BuildProjectArtifacts {
  detectionPath: string;
  manifestPath: string;
  reportPath: string;
  graphPath: string;
  htmlPath?: string;
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

function defaultLabels(communities: Map<number, string[]>): Map<number, string> {
  const labels = new Map<number, string>();
  for (const cid of communities.keys()) {
    labels.set(cid, `Community ${cid}`);
  }
  return labels;
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
  const outputDir = resolve(rootResolved, options?.outputDir ?? "graphify-out");
  const detectionPath = join(rootResolved, ".graphify_detect.json");
  const manifestPath = join(outputDir, "manifest.json");
  const reportPath = join(outputDir, "GRAPH_REPORT.md");
  const graphPath = join(outputDir, "graph.json");
  const warnings: BuildProjectWarning[] = [];

  mkdirSync(outputDir, { recursive: true });

  const detection = detect(rootResolved, { followSymlinks: options?.followSymlinks });
  writeFileSync(detectionPath, JSON.stringify(detection, null, 2), "utf-8");
  saveManifest(detection.files, manifestPath);

  const codeFiles = fileList(detection, "code");

  if (codeFiles.length === 0) {
    const nonCode = countNonCodeFiles(detection);
    if (nonCode > 0) {
      throw new Error(
        "No supported code files found. The standalone CLI currently builds the AST graph " +
        `from code only; this folder has ${nonCode} doc/paper/image/video file(s). ` +
        "Use the graphify skill in your assistant for semantic extraction of non-code inputs.",
      );
    }
    throw new Error(`No supported code files found under ${rootResolved}.`);
  }

  const nonCode = countNonCodeFiles(detection);
  if (nonCode > 0) {
    warnings.push({
      code: "non_code_skipped",
      message:
        `Skipped ${nonCode} non-code file(s) in standalone AST mode ` +
        `(docs=${fileList(detection, "document").length}, papers=${fileList(detection, "paper").length}, images=${fileList(detection, "image").length}, video=${fileList(detection, "video").length}). ` +
        "Use the graphify assistant skill for semantic extraction of those inputs.",
    });
  }

  const { extraction, diagnostics } = await extractWithDiagnostics(codeFiles);

  if (diagnostics.length > 0) {
    warnings.push({
      code: "partial_extraction",
      message:
        `AST extraction failed for ${diagnostics.length}/${codeFiles.length} code file(s). ` +
        formatDiagnosticSummary(diagnostics),
    });
  }

  if (extraction.nodes.length === 0) {
    const detail = diagnostics.length > 0
      ? ` ${formatDiagnosticSummary(diagnostics)}`
      : "";
    throw new Error(
      "AST extraction produced no graph nodes." +
      detail +
      " Install the required tree-sitter grammar packages for the languages in this repo.",
    );
  }

  const G = buildFromJson(extraction, { directed: options?.directed === true });
  if (G.order === 0) {
    throw new Error("Graph is empty after buildFromJson().");
  }

  const communities = cluster(G);
  const cohesion = scoreAll(G, communities);
  const gods = godNodes(G);
  const surprises = surprisingConnections(G, communities);
  const labels = defaultLabels(communities);
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
    rootResolved,
    questions,
  );

  writeFileSync(reportPath, report, "utf-8");
  toJson(G, communities, graphPath, { communityLabels: labels });

  let htmlPath: string | undefined;
  if (options?.html !== false) {
    try {
      htmlPath = join(outputDir, "graph.html");
      toHtml(G, communities, htmlPath, { communityLabels: labels });
    } catch (error) {
      htmlPath = undefined;
      warnings.push({
        code: "html_skipped",
        message:
          `HTML export skipped: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  let wikiDir: string | undefined;
  if (options?.wiki) {
    wikiDir = join(outputDir, "wiki");
    toWiki(G, communities, wikiDir, {
      communityLabels: labels,
      cohesion,
      godNodesData: gods,
    });
  }

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
      htmlPath,
      wikiDir,
    },
  };
}
