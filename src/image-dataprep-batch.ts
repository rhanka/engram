import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { ImageDataprepManifest } from "./image-dataprep.js";
import { validateImageCaption, validateImageRouting } from "./image-caption-schema.js";
import {
  assertAcceptedImageRoutingRules,
  imageRoutingSampleFromCaption,
  routeImageWithRules,
  type ImageRoutingRulesFile,
} from "./image-routing-calibration.js";

export interface ExportImageDataprepBatchRequestsOptions {
  manifest: ImageDataprepManifest;
  outputPath: string;
  schema: string;
  prompt: string;
  pass?: "primary" | "deep";
  captionsDir?: string;
  rules?: ImageRoutingRulesFile;
}

export interface ExportImageDataprepBatchRequestsResult {
  outputPath: string;
  requestCount: number;
}

export interface ImportImageDataprepBatchResultsOptions {
  inputPath: string;
  outputDir: string;
  force?: boolean;
}

export interface ImportImageDataprepBatchResultsResult {
  importedCount: number;
  failedCount: number;
  failures: Array<{ artifact_id: string; errors: string[] }>;
}

function jsonlLine(value: unknown): string {
  return JSON.stringify(value) + "\n";
}

function readJsonl(path: string): unknown[] {
  return readFileSync(path, "utf-8")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown);
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readCaption(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf-8")) as unknown;
}

function artifactHasDeepRoute(
  artifactId: string,
  options: ExportImageDataprepBatchRequestsOptions,
): boolean {
  if (!options.rules) throw new Error("Deep-pass export requires routing rules");
  if (!options.captionsDir) throw new Error("Deep-pass export requires captionsDir");
  assertAcceptedImageRoutingRules(options.rules);
  const caption = readCaption(join(options.captionsDir, `${artifactId}.caption.json`));
  const errors = validateImageCaption(caption);
  if (errors.length > 0) {
    throw new Error(`Invalid caption sidecar for ${artifactId}:\n${errors.map((item) => `  - ${item}`).join("\n")}`);
  }
  return routeImageWithRules(options.rules, imageRoutingSampleFromCaption(artifactId, caption)).route === "deep";
}

export function exportImageDataprepBatchRequests(
  options: ExportImageDataprepBatchRequestsOptions,
): ExportImageDataprepBatchRequestsResult {
  mkdirSync(dirname(options.outputPath), { recursive: true });
  const artifacts = options.pass === "deep"
    ? options.manifest.artifacts.filter((artifact) => artifactHasDeepRoute(artifact.id, options))
    : options.manifest.artifacts;
  const content = artifacts.map((artifact) => jsonlLine({
    id: artifact.id,
    schema: options.schema,
    prompt: options.prompt,
    image_path: artifact.path,
    source_file: artifact.source_file,
    source_page: artifact.source_page,
    source_sidecar: artifact.source_sidecar,
    mime_type: artifact.mime_type,
  })).join("");
  writeFileSync(options.outputPath, content, "utf-8");
  return { outputPath: options.outputPath, requestCount: artifacts.length };
}

function existingValidSidecarErrors(captionPath: string, routingPath: string): string[] {
  const errors: string[] = [];
  if (existsSync(captionPath) && validateImageCaption(readCaption(captionPath)).length === 0) {
    errors.push(`caption sidecar already exists: ${captionPath}`);
  }
  if (existsSync(routingPath) && validateImageRouting(readCaption(routingPath)).length === 0) {
    errors.push(`routing sidecar already exists: ${routingPath}`);
  }
  return errors;
}

export function importImageDataprepBatchResults(
  options: ImportImageDataprepBatchResultsOptions,
): ImportImageDataprepBatchResultsResult {
  const captionsDir = join(options.outputDir, "captions");
  const routingDir = join(options.outputDir, "routing");
  const failures: Array<{ artifact_id: string; errors: string[] }> = [];
  let importedCount = 0;

  for (const item of readJsonl(options.inputPath)) {
    const record = asRecord(item);
    const artifactId = String(record.artifact_id ?? record.id ?? "");
    const caption = record.caption;
    const routing = record.routing;
    const captionPath = join(captionsDir, `${artifactId}.caption.json`);
    const routingPath = join(routingDir, `${artifactId}.routing.json`);
    const errors = [
      ...validateImageCaption(caption),
      ...validateImageRouting(routing),
    ];

    if (!artifactId) errors.push("artifact_id is required");
    if (!options.force) {
      errors.push(...existingValidSidecarErrors(captionPath, routingPath));
    }
    if (errors.length > 0) {
      failures.push({ artifact_id: artifactId || "unknown", errors });
      continue;
    }

    mkdirSync(captionsDir, { recursive: true });
    mkdirSync(routingDir, { recursive: true });
    writeFileSync(captionPath, JSON.stringify(caption, null, 2) + "\n", "utf-8");
    writeFileSync(routingPath, JSON.stringify(routing, null, 2) + "\n", "utf-8");
    importedCount++;
  }

  return { importedCount, failedCount: failures.length, failures };
}
