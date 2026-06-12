import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { listGraphStoreIds } from "./storage/registry.js";

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
  GraphifyStorageMirrorConfig,
  NormalizedProjectConfig,
  NormalizedStorageConfig,
  NormalizedStorageMirrorConfig,
  ProjectConfigDiscoveryResult,
} from "./types.js";

/**
 * Keys that look like secrets and are forbidden inside the storage: YAML block.
 * Credentials must be supplied via environment variables only.
 * (SPEC_STORAGE_BACKENDS.md, "Secret Handling")
 */
const SECRET_KEY_PATTERNS = [
  "password",
  "pass",
  "secret",
  "token",
  "credential",
  "credentials",
  "key",
  "apikey",
  "api_key",
  "private_key",
  // SQL DSN / connection string may embed user:password — env-only, never YAML.
  "connectionstring",
  "connection_string",
  "dsn",
  "url",
];

const VALID_MIRROR_MODES = new Set(["merge", "replace"]);

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

function isSecretKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SECRET_KEY_PATTERNS.some((pattern) => lower === pattern || lower.includes(pattern));
}

function validateStorageMirror(mirror: Record<string, unknown>, index: number): string[] {
  const errors: string[] = [];

  // Check for secret keys — must use env vars instead
  for (const key of Object.keys(mirror)) {
    if (isSecretKey(key)) {
      errors.push(
        `storage.mirrors[${index}]: key "${key}" looks like a secret and is not allowed in YAML config. ` +
          `Use environment variables instead: GRAPHIFY_NEO4J_PASSWORD, GRAPHIFY_NEO4J_USER, ` +
          `GRAPHIFY_NEO4J_URI, GRAPHIFY_NEO4J_DATABASE, GRAPHIFY_SPANNER_PROJECT, ` +
          `GRAPHIFY_SPANNER_INSTANCE, GRAPHIFY_SPANNER_DATABASE, GRAPHIFY_POSTGRES_URL, ` +
          `GRAPHIFY_POSTGRES_SCHEMA, GRAPHIFY_POSTGRES_SSL`,
      );
    }
  }

  // Validate backend id against known registry
  if (typeof mirror.backend === "string" && mirror.backend.trim().length > 0) {
    const knownIds = listGraphStoreIds();
    if (!knownIds.includes(mirror.backend.trim())) {
      errors.push(
        `storage.mirrors[${index}]: unknown backend "${mirror.backend}". ` +
          `Available: ${knownIds.join(", ")}`,
      );
    }
  } else {
    errors.push(`storage.mirrors[${index}]: backend is required and must be a string`);
  }

  // Validate mode if present
  if (mirror.mode !== undefined && !VALID_MIRROR_MODES.has(String(mirror.mode))) {
    errors.push(`storage.mirrors[${index}]: mode must be "merge" or "replace"`);
  }

  return errors;
}

function validateStorage(storage: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const mirrors = storage.mirrors;

  if (mirrors === undefined || mirrors === null) {
    return errors;
  }

  if (!Array.isArray(mirrors)) {
    errors.push("storage.mirrors must be a list of mirror entries");
    return errors;
  }

  for (let i = 0; i < mirrors.length; i++) {
    const mirror = mirrors[i];
    if (typeof mirror !== "object" || mirror === null || Array.isArray(mirror)) {
      errors.push(`storage.mirrors[${i}] must be an object`);
      continue;
    }
    errors.push(...validateStorageMirror(mirror as Record<string, unknown>, i));
  }

  return errors;
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

  // Validate storage block if present
  if (config.storage !== undefined) {
    const storage = asRecord(config.storage);
    errors.push(...validateStorage(storage));
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
    storage: normalizeStorageConfig(config.storage),
  };
}

function normalizeStorageConfig(
  storage: GraphifyProjectConfig["storage"],
): NormalizedStorageConfig | undefined {
  if (storage === undefined || storage === null) return undefined;
  const rec = asRecord(storage);
  const mirrorsRaw = rec.mirrors;
  if (!Array.isArray(mirrorsRaw) || mirrorsRaw.length === 0) {
    // Empty mirrors array — no storage block in normalized output
    if (Array.isArray(mirrorsRaw) && mirrorsRaw.length === 0) {
      return { mirrors: [] };
    }
    return undefined;
  }

  const mirrors: NormalizedStorageMirrorConfig[] = mirrorsRaw.map((m) => {
    const mirror = asRecord(m) as unknown as GraphifyStorageMirrorConfig;
    return {
      backend: String(mirror.backend ?? ""),
      uri: typeof mirror.uri === "string" ? mirror.uri : undefined,
      user: typeof mirror.user === "string" ? mirror.user : undefined,
      database: typeof mirror.database === "string" ? mirror.database : undefined,
      project: typeof mirror.project === "string" ? mirror.project : undefined,
      instance: typeof mirror.instance === "string" ? mirror.instance : undefined,
      mode: mirror.mode === "replace" ? "replace" : "merge",
      namespace: typeof mirror.namespace === "string" ? mirror.namespace : undefined,
      autoPush: typeof mirror.autoPush === "boolean" ? mirror.autoPush : false,
      schema: typeof mirror.schema === "string" ? mirror.schema : undefined,
      ssl: typeof mirror.ssl === "boolean" ? mirror.ssl : undefined,
      citySlug: typeof mirror.citySlug === "string" ? mirror.citySlug : undefined,
      embedding: normalizeEmbeddingConfig(mirror.embedding),
    };
  });

  return { mirrors };
}

/**
 * Normalize the non-secret embedding sub-config of a storage mirror. Returns
 * undefined when nothing meaningful is present so the field stays absent for
 * non-vector backends. The provider API key is never modeled here (env-only).
 */
function normalizeEmbeddingConfig(
  embedding: GraphifyStorageMirrorConfig["embedding"],
): NormalizedStorageMirrorConfig["embedding"] {
  if (embedding === undefined || embedding === null) return undefined;
  const rec = asRecord(embedding);
  const provider = typeof rec.provider === "string" ? rec.provider : undefined;
  const model = typeof rec.model === "string" ? rec.model : undefined;
  const dimension =
    typeof rec.dimension === "number" && Number.isFinite(rec.dimension)
      ? rec.dimension
      : undefined;
  if (provider === undefined && model === undefined && dimension === undefined) {
    return undefined;
  }
  return { provider, model, dimension };
}

export function loadProjectConfig(configPath: string): NormalizedProjectConfig {
  const resolved = resolve(configPath);
  const raw = readFileSync(resolved, "utf-8");
  return normalizeProjectConfig(parseProjectConfig(raw, resolved), resolved);
}
