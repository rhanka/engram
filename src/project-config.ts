import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";

import type {
  GraphifyDataprepPolicy,
  GraphifyOutputPolicy,
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
  const outputs = asRecord(config.outputs) as GraphifyOutputPolicy;

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
  if (dataprep.pdf_ocr !== undefined && !VALID_PDF_OCR_MODES.has(String(dataprep.pdf_ocr))) {
    errors.push("dataprep.pdf_ocr must be one of off, auto, always, dry-run");
  }
  if (
    dataprep.citation_minimum !== undefined &&
    !VALID_CITATION_MINIMUMS.has(String(dataprep.citation_minimum))
  ) {
    errors.push("dataprep.citation_minimum must be one of file, page, section, paragraph");
  }
  if (outputs.state_dir !== undefined && typeof outputs.state_dir !== "string") {
    errors.push("outputs.state_dir must be a path string");
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
  const outputs = asRecord(config.outputs) as GraphifyOutputPolicy;

  const registries = asStringArray(inputs.registries).map((item) => resolvePath(configDir, item));

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
    },
    outputs: {
      state_dir: resolvePath(configDir, outputs.state_dir ?? ".graphify"),
      write_html: asBoolean(outputs.write_html, true),
      write_wiki: asBoolean(outputs.write_wiki, false),
      write_profile_report: asBoolean(outputs.write_profile_report, true),
    },
  };
}

export function loadProjectConfig(configPath: string): NormalizedProjectConfig {
  const resolved = resolve(configPath);
  const raw = readFileSync(resolved, "utf-8");
  return normalizeProjectConfig(parseProjectConfig(raw, resolved), resolved);
}
