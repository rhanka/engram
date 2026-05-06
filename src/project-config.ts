import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";

import type {
  GraphifyDataprepPolicy,
  GraphifyImageAnalysisPolicy,
  GraphifyInputScopeMode,
  GraphifyLlmExecutionPolicy,
  GraphifyOutputPolicy,
  GraphifyProjectOntologyOutputPolicy,
  GraphifyProjectOntologyReconciliationPolicy,
  GraphifyProjectConfig,
  GraphifyProjectInputs,
  GraphifyProjectConfigProfile,
  NormalizedProjectConfig,
  ProjectConfigDiscoveryResult,
} from "./types.js";

const CONFIG_CANDIDATES = [
  "graphify.yaml",
  "graphify.yml",
  join(".graphify", "config.yaml"),
  join(".graphify", "config.yml"),
] as const;

const VALID_PDF_OCR_MODES = new Set(["off", "auto", "always", "dry-run"]);
const VALID_CITATION_MINIMUMS = new Set(["file", "page", "section", "paragraph"]);
const VALID_LLM_EXECUTION_MODES = new Set(["assistant", "direct", "batch", "mesh", "off"]);
const VALID_IMAGE_ARTIFACT_SOURCES = new Set(["ocr_crops", "images", "all"]);
const VALID_INPUT_SCOPE_MODES = new Set(["auto", "committed", "tracked", "all"]);

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asStringArray(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function resolvePath(configDir: string, value: string): string {
  return resolve(configDir, value);
}

function registrySourceName(path: string): string {
  const base = basename(path, extname(path));
  return base.trim();
}

function buildRegistrySources(paths: string[]): Record<string, string> {
  const sources: Record<string, string> = {};
  for (const path of paths) {
    const name = registrySourceName(path);
    if (name) sources[name] = path;
  }
  return sources;
}

function parsePdfOcrMode(value: unknown): "off" | "auto" | "always" | "dry-run" {
  const normalized = String(value ?? "auto").trim().toLowerCase();
  return VALID_PDF_OCR_MODES.has(normalized)
    ? normalized as "off" | "auto" | "always" | "dry-run"
    : "auto";
}

function parseCitationMinimum(value: unknown): "file" | "page" | "section" | "paragraph" {
  const normalized = String(value ?? "page").trim().toLowerCase();
  return VALID_CITATION_MINIMUMS.has(normalized)
    ? normalized as "file" | "page" | "section" | "paragraph"
    : "page";
}

function parseLlmExecutionMode(
  value: unknown,
  fallback: "assistant" | "direct" | "batch" | "mesh" | "off",
): "assistant" | "direct" | "batch" | "mesh" | "off" {
  const normalized = String(value ?? fallback).trim().toLowerCase();
  return VALID_LLM_EXECUTION_MODES.has(normalized)
    ? normalized as "assistant" | "direct" | "batch" | "mesh" | "off"
    : fallback;
}

function parseImageArtifactSource(value: unknown): "ocr_crops" | "images" | "all" {
  const normalized = String(value ?? "ocr_crops").trim().toLowerCase();
  return VALID_IMAGE_ARTIFACT_SOURCES.has(normalized)
    ? normalized as "ocr_crops" | "images" | "all"
    : "ocr_crops";
}

function parseInputScopeMode(value: unknown, fallback: GraphifyInputScopeMode): GraphifyInputScopeMode {
  const normalized = String(value ?? fallback).trim().toLowerCase();
  return VALID_INPUT_SCOPE_MODES.has(normalized)
    ? normalized as GraphifyInputScopeMode
    : fallback;
}

export function discoverProjectConfig(root: string = "."): ProjectConfigDiscoveryResult {
  const resolvedRoot = resolve(root);
  const searched = CONFIG_CANDIDATES.map((candidate) => join(resolvedRoot, candidate));
  for (const candidate of searched) {
    if (existsSync(candidate)) {
      return { found: true, path: candidate, searched };
    }
  }
  return { found: false, path: null, searched };
}

export function parseProjectConfig(raw: string, sourcePath: string): GraphifyProjectConfig {
  const trimmed = raw.trim();
  const parsed = extname(sourcePath).toLowerCase() === ".json" || trimmed.startsWith("{")
    ? JSON.parse(trimmed || "{}")
    : parseYaml(trimmed || "{}");
  return asRecord(parsed) as GraphifyProjectConfig;
}

export function validateProjectConfig(config: GraphifyProjectConfig): string[] {
  const errors: string[] = [];
  const profile = asRecord(config.profile) as GraphifyProjectConfigProfile;
  const inputs = asRecord(config.inputs) as GraphifyProjectInputs;
  const dataprep = asRecord(config.dataprep) as GraphifyDataprepPolicy;
  const imageAnalysis = asRecord(dataprep.image_analysis) as GraphifyImageAnalysisPolicy;
  const llmExecution = asRecord(config.llm_execution) as GraphifyLlmExecutionPolicy;
  const outputs = asRecord(config.outputs) as GraphifyOutputPolicy;
  const ontologyOutput = asRecord(outputs.ontology) as GraphifyProjectOntologyOutputPolicy;
  const reconciliation = asRecord(ontologyOutput.reconciliation) as GraphifyProjectOntologyReconciliationPolicy;

  if (config.version !== undefined && config.version !== 1) {
    errors.push("version must be 1");
  }
  if (typeof profile.path !== "string" || profile.path.trim().length === 0) {
    errors.push("profile.path is required");
  }
  if (asStringArray(inputs.corpus).length === 0) {
    errors.push("inputs.corpus must contain at least one path");
  }
  for (const [key, value] of Object.entries({
    "inputs.corpus": inputs.corpus,
    "inputs.registries": inputs.registries,
    "inputs.generated": inputs.generated,
    "inputs.exclude": inputs.exclude,
  })) {
    if (value !== undefined && !Array.isArray(value)) {
      errors.push(`${key} must be a list of paths`);
    }
  }
  if (inputs.scope !== undefined && !VALID_INPUT_SCOPE_MODES.has(String(inputs.scope))) {
    errors.push("inputs.scope must be one of auto, committed, tracked, all");
  }
  if (dataprep.pdf_ocr !== undefined && !VALID_PDF_OCR_MODES.has(String(dataprep.pdf_ocr))) {
    errors.push("dataprep.pdf_ocr must be one of off, auto, always, dry-run");
  }
  if (
    dataprep.citation_minimum !== undefined &&
    !VALID_CITATION_MINIMUMS.has(String(dataprep.citation_minimum))
  ) {
    errors.push("dataprep.citation_minimum must be one of file, page, section, paragraph");
  }
  if (
    imageAnalysis.mode !== undefined &&
    !VALID_LLM_EXECUTION_MODES.has(String(imageAnalysis.mode))
  ) {
    errors.push("dataprep.image_analysis.mode must be one of assistant, direct, batch, mesh, off");
  }
  if (
    imageAnalysis.artifact_source !== undefined &&
    !VALID_IMAGE_ARTIFACT_SOURCES.has(String(imageAnalysis.artifact_source))
  ) {
    errors.push("dataprep.image_analysis.artifact_source must be one of ocr_crops, images, all");
  }
  if (
    llmExecution.mode !== undefined &&
    !VALID_LLM_EXECUTION_MODES.has(String(llmExecution.mode))
  ) {
    errors.push("llm_execution.mode must be one of assistant, direct, batch, mesh, off");
  }
  if (outputs.state_dir !== undefined && typeof outputs.state_dir !== "string") {
    errors.push("outputs.state_dir must be a path string");
  }
  if (reconciliation.decisions_path !== undefined && typeof reconciliation.decisions_path !== "string") {
    errors.push("outputs.ontology.reconciliation.decisions_path must be a path string");
  }
  if (reconciliation.patches_path !== undefined && typeof reconciliation.patches_path !== "string") {
    errors.push("outputs.ontology.reconciliation.patches_path must be a path string");
  }
  return errors;
}

export function normalizeProjectConfig(
  config: GraphifyProjectConfig,
  sourcePath: string,
): NormalizedProjectConfig {
  const errors = validateProjectConfig(config);
  if (errors.length > 0) {
    throw new Error(`Invalid graphify project config:\n${errors.map((item) => `  - ${item}`).join("\n")}`);
  }

  const resolvedSourcePath = resolve(sourcePath);
  const configDir = dirname(resolvedSourcePath);
  const profile = asRecord(config.profile) as GraphifyProjectConfigProfile;
  const inputs = asRecord(config.inputs) as GraphifyProjectInputs;
  const dataprep = asRecord(config.dataprep) as GraphifyDataprepPolicy;
  const imageAnalysis = asRecord(dataprep.image_analysis) as GraphifyImageAnalysisPolicy;
  const imageCalibration = asRecord(imageAnalysis.calibration);
  const imageBatch = asRecord(imageAnalysis.batch);
  const llmExecution = asRecord(config.llm_execution) as GraphifyLlmExecutionPolicy;
  const textJson = asRecord(llmExecution.text_json);
  const visionJson = asRecord(llmExecution.vision_json);
  const llmBatch = asRecord(llmExecution.batch);
  const llmMesh = asRecord(llmExecution.mesh);
  const outputs = asRecord(config.outputs) as GraphifyOutputPolicy;
  const ontologyOutput = asRecord(outputs.ontology) as GraphifyProjectOntologyOutputPolicy;
  const reconciliation = asRecord(ontologyOutput.reconciliation) as GraphifyProjectOntologyReconciliationPolicy;

  const registries = asStringArray(inputs.registries).map((item) => resolvePath(configDir, item));
  const imageRulesPath = asString(imageCalibration.rules_path);
  const imageLabelsPath = asString(imageCalibration.labels_path);

  return {
    version: config.version ?? 1,
    sourcePath: resolvedSourcePath,
    configDir,
    profile: {
      path: profile.path!,
      resolvedPath: resolvePath(configDir, profile.path!),
    },
    inputs: {
      corpus: asStringArray(inputs.corpus).map((item) => resolvePath(configDir, item)),
      scope: parseInputScopeMode(inputs.scope, "all"),
      scope_source: inputs.scope === undefined ? "configured-default" : "config",
      registries,
      registrySources: buildRegistrySources(registries),
      generated: asStringArray(inputs.generated).map((item) => resolvePath(configDir, item)),
      exclude: asStringArray(inputs.exclude).map((item) => resolvePath(configDir, item)),
    },
    dataprep: {
      pdf_ocr: parsePdfOcrMode(dataprep.pdf_ocr),
      prefer_ocr_markdown: asBoolean(dataprep.prefer_ocr_markdown, true),
      use_extracted_pdf_images: asBoolean(dataprep.use_extracted_pdf_images, true),
      full_page_screenshot_vision: asBoolean(dataprep.full_page_screenshot_vision, false),
      citation_minimum: parseCitationMinimum(dataprep.citation_minimum),
      preserve_source_structure: asBoolean(dataprep.preserve_source_structure, true),
      image_analysis: {
        enabled: asBoolean(imageAnalysis.enabled, false),
        mode: parseLlmExecutionMode(imageAnalysis.mode, "off"),
        artifact_source: parseImageArtifactSource(imageAnalysis.artifact_source),
        caption_schema: asString(imageAnalysis.caption_schema) ?? "generic_image_caption_v1",
        routing_profile: asString(imageAnalysis.routing_profile) ?? "generic_image_routing_v1",
        primary_model: asString(imageAnalysis.primary_model),
        deep_model: asString(imageAnalysis.deep_model),
        calibration: {
          rules_path: imageRulesPath,
          resolvedRulesPath: imageRulesPath ? resolvePath(configDir, imageRulesPath) : null,
          labels_path: imageLabelsPath,
          resolvedLabelsPath: imageLabelsPath ? resolvePath(configDir, imageLabelsPath) : null,
        },
        max_markdown_context_chars: asNumber(imageAnalysis.max_markdown_context_chars, 8000),
        batch: {
          completion_window: asString(imageBatch.completion_window) ?? "24h",
          output_dir: resolvePath(configDir, asString(imageBatch.output_dir) ?? ".graphify/image-dataprep/batch"),
        },
      },
    },
    llm_execution: {
      mode: parseLlmExecutionMode(llmExecution.mode, "assistant"),
      provider: asString(llmExecution.provider),
      text_json: {
        model: asString(textJson.model) ?? "",
      },
      vision_json: {
        primary_model: asString(visionJson.primary_model) ?? "",
        deep_model: asString(visionJson.deep_model) ?? "",
      },
      batch: {
        provider: asString(llmBatch.provider) ?? "",
        completion_window: asString(llmBatch.completion_window) ?? "24h",
      },
      mesh: {
        adapter: asString(llmMesh.adapter) ?? "",
      },
    },
    outputs: {
      state_dir: resolvePath(configDir, outputs.state_dir ?? ".graphify"),
      write_html: asBoolean(outputs.write_html, true),
      write_wiki: asBoolean(outputs.write_wiki, false),
      write_profile_report: asBoolean(outputs.write_profile_report, true),
      ontology: {
        reconciliation: {
          decisions_path: asString(reconciliation.decisions_path)
            ? resolvePath(configDir, asString(reconciliation.decisions_path)!)
            : null,
          patches_path: asString(reconciliation.patches_path)
            ? resolvePath(configDir, asString(reconciliation.patches_path)!)
            : null,
        },
      },
    },
  };
}

export function loadProjectConfig(configPath: string): NormalizedProjectConfig {
  const resolved = resolve(configPath);
  const raw = readFileSync(resolved, "utf-8");
  return normalizeProjectConfig(parseProjectConfig(raw, resolved), resolved);
}
