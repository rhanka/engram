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
import type {
  AppContextDataDialect,
  AppContextHttpClientWrapperConfig,
  AppContextProjectConfig,
  AppContextProjectConfigInput,
  AppContextRouterKind,
  AppContextUiRouteConfig,
  AppContextUrlHelperConfig,
} from "./app-context/types.js";

export type { AppContextProjectConfig, AppContextProjectConfigInput } from "./app-context/types.js";

declare module "./types.js" {
  interface GraphifyProjectConfig {
    app_context?: AppContextProjectConfigInput;
  }
  interface NormalizedProjectConfig {
    app_context: AppContextProjectConfig;
  }
}

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
  "engram.yaml",
  "engram.yml",
  join(".engram", "config.yaml"),
  join(".engram", "config.yml"),
] as const;

/** Legacy (pre-rename) config filenames, probed after the Engram names. */
const LEGACY_CONFIG_CANDIDATES = [
  "graphify.yaml",
  "graphify.yml",
  join(".graphify", "config.yaml"),
  join(".graphify", "config.yml"),
] as const;

function isLegacyConfigPath(resolvedPath: string, root: string): boolean {
  return LEGACY_CONFIG_CANDIDATES.some(
    (candidate) => join(root, candidate) === resolvedPath,
  );
}

const VALID_PDF_OCR_MODES = new Set(["off", "auto", "always", "dry-run"]);
const VALID_CITATION_MINIMUMS = new Set(["file", "page", "section", "paragraph"]);
const VALID_LLM_EXECUTION_MODES = new Set(["assistant", "direct", "batch", "mesh", "off"]);
const VALID_IMAGE_ARTIFACT_SOURCES = new Set(["ocr_crops", "images", "all"]);
const VALID_INPUT_SCOPE_MODES = new Set(["auto", "committed", "tracked", "all"]);

function asRecord(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? value : {};
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
          `Use environment variables instead: ENGRAM_NEO4J_PASSWORD, ENGRAM_NEO4J_USER, ` +
          `ENGRAM_NEO4J_URI, ENGRAM_NEO4J_DATABASE, ENGRAM_SPANNER_PROJECT, ` +
          `ENGRAM_SPANNER_INSTANCE, ENGRAM_SPANNER_DATABASE, ENGRAM_POSTGRES_URL, ` +
          `ENGRAM_POSTGRES_SCHEMA, ENGRAM_POSTGRES_SSL`,
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
  const searched = [
    ...CONFIG_CANDIDATES.map((candidate) => join(resolvedRoot, candidate)),
    ...LEGACY_CONFIG_CANDIDATES.map((candidate) => join(resolvedRoot, candidate)),
  ];
  for (const candidate of searched) {
    if (existsSync(candidate)) {
      if (isLegacyConfigPath(candidate, resolvedRoot)) {
        console.warn(
          `[engram] using legacy config ${candidate}; rename it to engram.yaml for new work`,
        );
      }
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
  if (asRecord(llmExecution.mesh).adapter !== undefined) {
    errors.push(
      "llm_execution.mesh.adapter is no longer read: it named nothing, since engram has no adapter registry to resolve it against. Mesh mode takes an injected client built with createGraphifyMesh() instead. Remove the key.",
    );
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

  // Validate app_context block if present (§3.4)
  if (config.app_context !== undefined) {
    errors.push(...validateAppContextConfig(config.app_context));
  }

  return errors;
}

export function normalizeProjectConfig(
  config: GraphifyProjectConfig,
  sourcePath: string,
): NormalizedProjectConfig {
  const errors = validateProjectConfig(config);
  if (errors.length > 0) {
    throw new Error(`Invalid engram project config:\n${errors.map((item) => `  - ${item}`).join("\n")}`);
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
    },
    outputs: {
      state_dir: resolvePath(configDir, outputs.state_dir ?? ".graphify"),
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
    app_context: normalizeAppContextConfig(config.app_context),
  };
}

const VALID_APP_CONTEXT_KEYS = new Set([
  "enabled",
  "spec_map",
  "retention",
  "specs",
  "data_model",
  "call_graph",
  "ui",
  "http_client_wrappers",
  "url_helpers",
]);

const VALID_APP_CONTEXT_DIALECTS = new Set<AppContextDataDialect>(["postgres", "mysql", "sqlite"]);
const VALID_APP_CONTEXT_ROUTER_KINDS = new Set<AppContextRouterKind>(["sveltekit", "hash", "pathname"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "string" && item.trim().length > 0)
  );
}

function validateAppContextConfig(raw: unknown): string[] {
  const errors: string[] = [];
  if (!isPlainObject(raw)) {
    errors.push("app_context must be an object");
    return errors;
  }

  for (const key of Object.keys(raw)) {
    if (!VALID_APP_CONTEXT_KEYS.has(key)) {
      errors.push(`app_context.${key} is not a recognized option`);
    }
  }

  if (raw.enabled !== undefined && typeof raw.enabled !== "boolean") {
    errors.push("app_context.enabled must be a boolean");
  }

  if (
    raw.spec_map !== undefined &&
    (typeof raw.spec_map !== "string" || raw.spec_map.trim().length === 0)
  ) {
    errors.push("app_context.spec_map must be a non-empty string");
  }

  if (raw.retention !== undefined) {
    if (!isPlainObject(raw.retention)) {
      errors.push("app_context.retention must be an object");
    } else {
      for (const key of Object.keys(raw.retention)) {
        if (key !== "max_commits_per_repo") {
          errors.push(`app_context.retention.${key} is not a recognized option`);
        }
      }
      const maxCommits = raw.retention.max_commits_per_repo;
      if (
        maxCommits !== undefined &&
        (typeof maxCommits !== "number" || !Number.isInteger(maxCommits) || maxCommits < 1)
      ) {
        errors.push("app_context.retention.max_commits_per_repo must be an integer >= 1");
      }
    }
  }

  if (raw.specs !== undefined) {
    if (!isPlainObject(raw.specs)) {
      errors.push("app_context.specs must be an object");
    } else {
      for (const key of Object.keys(raw.specs)) {
        if (key !== "include" && key !== "exclude") {
          errors.push(`app_context.specs.${key} is not a recognized option`);
        }
      }
      if (raw.specs.include !== undefined && !isNonEmptyStringArray(raw.specs.include)) {
        errors.push("app_context.specs.include must be a list of non-empty strings");
      }
      if (raw.specs.exclude !== undefined && !isNonEmptyStringArray(raw.specs.exclude)) {
        errors.push("app_context.specs.exclude must be a list of non-empty strings");
      }
    }
  }

  if (raw.data_model !== undefined) {
    if (!isPlainObject(raw.data_model)) {
      errors.push("app_context.data_model must be an object");
    } else {
      const allowedDataModelKeys = new Set([
        "default_dialect",
        "default_schema",
        "sql_include",
        "orm_include",
      ]);
      for (const key of Object.keys(raw.data_model)) {
        if (!allowedDataModelKeys.has(key)) {
          errors.push(`app_context.data_model.${key} is not a recognized option`);
        }
      }
      const dialect = raw.data_model.default_dialect;
      if (
        dialect !== undefined &&
        (typeof dialect !== "string" || !VALID_APP_CONTEXT_DIALECTS.has(dialect as AppContextDataDialect))
      ) {
        errors.push("app_context.data_model.default_dialect must be one of postgres, mysql, sqlite");
      }
      const schema = raw.data_model.default_schema;
      if (schema !== undefined && (typeof schema !== "string" || schema.trim().length === 0)) {
        errors.push("app_context.data_model.default_schema must be a non-empty string");
      }
      if (raw.data_model.sql_include !== undefined && !isNonEmptyStringArray(raw.data_model.sql_include)) {
        errors.push("app_context.data_model.sql_include must be a list of non-empty strings");
      }
      if (raw.data_model.orm_include !== undefined && !isNonEmptyStringArray(raw.data_model.orm_include)) {
        errors.push("app_context.data_model.orm_include must be a list of non-empty strings");
      }
    }
  }

  if (raw.call_graph !== undefined) {
    if (!isPlainObject(raw.call_graph)) {
      errors.push("app_context.call_graph must be an object");
    } else {
      for (const key of Object.keys(raw.call_graph)) {
        if (key !== "max_hops") {
          errors.push(`app_context.call_graph.${key} is not a recognized option`);
        }
      }
      const maxHops = raw.call_graph.max_hops;
      if (
        maxHops !== undefined &&
        (typeof maxHops !== "number" || !Number.isInteger(maxHops) || maxHops < 1 || maxHops > 6)
      ) {
        errors.push("app_context.call_graph.max_hops must be an integer between 1 and 6");
      }
    }
  }

  if (raw.ui !== undefined) {
    if (!isPlainObject(raw.ui)) {
      errors.push("app_context.ui must be an object");
    } else {
      for (const key of Object.keys(raw.ui)) {
        if (key !== "routes") {
          errors.push(`app_context.ui.${key} is not a recognized option`);
        }
      }
      if (raw.ui.routes !== undefined) {
        if (!Array.isArray(raw.ui.routes)) {
          errors.push("app_context.ui.routes must be a list of route declarations");
        } else {
          const allowedRouteKeys = new Set(["pattern", "router_kind", "component", "export_name"]);
          raw.ui.routes.forEach((entry, index) => {
            if (!isPlainObject(entry)) {
              errors.push(`app_context.ui.routes[${index}] must be an object`);
              return;
            }
            for (const key of Object.keys(entry)) {
              if (!allowedRouteKeys.has(key)) {
                errors.push(`app_context.ui.routes[${index}].${key} is not a recognized option`);
              }
            }
            if (typeof entry.pattern !== "string" || entry.pattern.trim().length === 0) {
              errors.push(`app_context.ui.routes[${index}].pattern must be a non-empty string`);
            }
            if (
              typeof entry.router_kind !== "string" ||
              !VALID_APP_CONTEXT_ROUTER_KINDS.has(entry.router_kind as AppContextRouterKind)
            ) {
              errors.push(
                `app_context.ui.routes[${index}].router_kind must be one of sveltekit, hash, pathname`,
              );
            }
            if (typeof entry.component !== "string" || entry.component.trim().length === 0) {
              errors.push(`app_context.ui.routes[${index}].component must be a non-empty string`);
            }
            if (
              entry.export_name !== undefined &&
              (typeof entry.export_name !== "string" || entry.export_name.trim().length === 0)
            ) {
              errors.push(`app_context.ui.routes[${index}].export_name must be a non-empty string`);
            }
          });
        }
      }
    }
  }

  if (raw.http_client_wrappers !== undefined) {
    if (!Array.isArray(raw.http_client_wrappers)) {
      errors.push("app_context.http_client_wrappers must be a list");
    } else {
      const allowedWrapperKeys = new Set([
        "import_from",
        "export_name",
        "url_arg_index",
        "options_arg_index",
        "method_option_path",
      ]);
      raw.http_client_wrappers.forEach((entry, index) => {
        if (!isPlainObject(entry)) {
          errors.push(`app_context.http_client_wrappers[${index}] must be an object`);
          return;
        }
        for (const key of Object.keys(entry)) {
          if (!allowedWrapperKeys.has(key)) {
            errors.push(`app_context.http_client_wrappers[${index}].${key} is not a recognized option`);
          }
        }
        if (typeof entry.import_from !== "string" || entry.import_from.trim().length === 0) {
          errors.push(
            `app_context.http_client_wrappers[${index}].import_from must be a non-empty string`,
          );
        }
        if (typeof entry.export_name !== "string" || entry.export_name.trim().length === 0) {
          errors.push(
            `app_context.http_client_wrappers[${index}].export_name must be a non-empty string`,
          );
        }
        if (
          typeof entry.url_arg_index !== "number" ||
          !Number.isInteger(entry.url_arg_index) ||
          entry.url_arg_index < 0
        ) {
          errors.push(
            `app_context.http_client_wrappers[${index}].url_arg_index must be a non-negative integer`,
          );
        }
        if (
          entry.options_arg_index !== undefined &&
          (typeof entry.options_arg_index !== "number" ||
            !Number.isInteger(entry.options_arg_index) ||
            entry.options_arg_index < 0)
        ) {
          errors.push(
            `app_context.http_client_wrappers[${index}].options_arg_index must be a non-negative integer`,
          );
        }
        if (entry.method_option_path !== undefined) {
          if (
            !Array.isArray(entry.method_option_path) ||
            entry.method_option_path.length === 0 ||
            !entry.method_option_path.every(
              (segment) =>
                (typeof segment === "string" && segment.trim().length > 0) ||
                (typeof segment === "number" && Number.isInteger(segment) && segment >= 0),
            )
          ) {
            errors.push(
              `app_context.http_client_wrappers[${index}].method_option_path must be a non-empty list of strings or non-negative integers`,
            );
          }
        }
      });
    }
  }

  if (raw.url_helpers !== undefined) {
    if (!Array.isArray(raw.url_helpers)) {
      errors.push("app_context.url_helpers must be a list");
    } else {
      const allowedHelperKeys = new Set([
        "import_from",
        "export_name",
        "file",
        "local_symbol",
        "path_arg_index",
        "prefix",
      ]);
      raw.url_helpers.forEach((entry, index) => {
        if (!isPlainObject(entry)) {
          errors.push(`app_context.url_helpers[${index}] must be an object`);
          return;
        }
        for (const key of Object.keys(entry)) {
          if (!allowedHelperKeys.has(key)) {
            errors.push(`app_context.url_helpers[${index}].${key} is not a recognized option`);
          }
        }
        const hasImportedAny = entry.import_from !== undefined || entry.export_name !== undefined;
        const hasLocalAny = entry.file !== undefined || entry.local_symbol !== undefined;
        const validImported =
          typeof entry.import_from === "string" &&
          entry.import_from.trim().length > 0 &&
          typeof entry.export_name === "string" &&
          entry.export_name.trim().length > 0 &&
          !hasLocalAny;
        const validLocal =
          typeof entry.file === "string" &&
          entry.file.trim().length > 0 &&
          typeof entry.local_symbol === "string" &&
          entry.local_symbol.trim().length > 0 &&
          !hasImportedAny;
        if (!validImported && !validLocal) {
          errors.push(
            `app_context.url_helpers[${index}] must specify either { import_from, export_name } or { file, local_symbol } (and not both)`,
          );
        }
        if (
          typeof entry.path_arg_index !== "number" ||
          !Number.isInteger(entry.path_arg_index) ||
          entry.path_arg_index < 0
        ) {
          errors.push(
            `app_context.url_helpers[${index}].path_arg_index must be a non-negative integer`,
          );
        }
        if (entry.prefix !== undefined && typeof entry.prefix !== "string") {
          errors.push(`app_context.url_helpers[${index}].prefix must be a string`);
        }
      });
    }
  }

  return errors;
}

function normalizeAppContextConfig(
  raw: GraphifyProjectConfig["app_context"],
): AppContextProjectConfig {
  const rec = asRecord(raw);
  const retention = asRecord(rec.retention);
  const specs = asRecord(rec.specs);
  const dataModel = asRecord(rec.data_model);
  const callGraph = asRecord(rec.call_graph);
  const ui = asRecord(rec.ui);

  const routesRaw = Array.isArray(ui.routes) ? ui.routes : [];
  const routes: AppContextUiRouteConfig[] = routesRaw.map((entry) => {
    const r = asRecord(entry);
    return {
      pattern: String(r.pattern).trim(),
      router_kind: String(r.router_kind).trim() as AppContextRouterKind,
      component: String(r.component).trim(),
      export_name:
        typeof r.export_name === "string" && r.export_name.trim().length > 0
          ? r.export_name.trim()
          : "default",
    };
  });

  const wrappersRaw = Array.isArray(rec.http_client_wrappers) ? rec.http_client_wrappers : [];
  const http_client_wrappers: AppContextHttpClientWrapperConfig[] = wrappersRaw.map((entry) => {
    const w = asRecord(entry);
    const normalized: AppContextHttpClientWrapperConfig = {
      import_from: String(w.import_from).trim(),
      export_name: String(w.export_name).trim(),
      url_arg_index: Number(w.url_arg_index),
    };
    if (typeof w.options_arg_index === "number") {
      normalized.options_arg_index = w.options_arg_index;
    }
    if (Array.isArray(w.method_option_path)) {
      normalized.method_option_path = w.method_option_path.map((seg) =>
        typeof seg === "number" ? seg : String(seg),
      );
    }
    return normalized;
  });

  const helpersRaw = Array.isArray(rec.url_helpers) ? rec.url_helpers : [];
  const url_helpers: AppContextUrlHelperConfig[] = helpersRaw.map((entry) => {
    const h = asRecord(entry);
    if (typeof h.file === "string") {
      const localHelper: Extract<AppContextUrlHelperConfig, { file: string }> = {
        file: h.file.trim(),
        local_symbol: String(h.local_symbol).trim(),
        path_arg_index: Number(h.path_arg_index),
      };
      if (typeof h.prefix === "string") {
        localHelper.prefix = h.prefix;
      }
      return localHelper;
    }
    const importedHelper: Extract<AppContextUrlHelperConfig, { import_from: string }> = {
      import_from: String(h.import_from).trim(),
      export_name: String(h.export_name).trim(),
      path_arg_index: Number(h.path_arg_index),
    };
    if (typeof h.prefix === "string") {
      importedHelper.prefix = h.prefix;
    }
    return importedHelper;
  });

  const normalized: AppContextProjectConfig = {
    enabled: asBoolean(rec.enabled, false),
    retention: {
      max_commits_per_repo:
        typeof retention.max_commits_per_repo === "number" ? retention.max_commits_per_repo : 10,
    },
    specs: {
      include: Array.isArray(specs.include) ? asStringArray(specs.include) : ["docs/spec/**/*.md"],
      exclude: Array.isArray(specs.exclude) ? asStringArray(specs.exclude) : [],
    },
    data_model: {
      default_dialect: (asString(dataModel.default_dialect) as AppContextDataDialect | null) ?? "postgres",
      default_schema: asString(dataModel.default_schema) ?? "public",
      sql_include: Array.isArray(dataModel.sql_include)
        ? asStringArray(dataModel.sql_include)
        : ["**/*.sql"],
      orm_include: Array.isArray(dataModel.orm_include) ? asStringArray(dataModel.orm_include) : [],
    },
    call_graph: {
      max_hops: typeof callGraph.max_hops === "number" ? callGraph.max_hops : 3,
    },
    ui: {
      routes,
    },
    http_client_wrappers,
    url_helpers,
  };

  const specMap = asString(rec.spec_map);
  if (specMap !== null) {
    normalized.spec_map = specMap.trim();
  }

  return normalized;
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
