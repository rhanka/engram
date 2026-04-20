import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { ImageDataprepManifest } from "./image-dataprep.js";
import { validateImageCaption, validateImageRouting } from "./image-caption-schema.js";

export interface ExportImageDataprepBatchRequestsOptions {
  manifest: ImageDataprepManifest;
  outputPath: string;
  schema: string;
  prompt: string;
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

export function exportImageDataprepBatchRequests(
  options: ExportImageDataprepBatchRequestsOptions,
): ExportImageDataprepBatchRequestsResult {
  mkdirSync(dirname(options.outputPath), { recursive: true });
  const content = options.manifest.artifacts.map((artifact) => jsonlLine({
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
  return { outputPath: options.outputPath, requestCount: options.manifest.artifacts.length };
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
    const errors = [
      ...validateImageCaption(caption),
      ...validateImageRouting(routing),
    ];

    if (!artifactId) errors.push("artifact_id is required");
    if (errors.length > 0) {
      failures.push({ artifact_id: artifactId || "unknown", errors });
      continue;
    }

    mkdirSync(captionsDir, { recursive: true });
    mkdirSync(routingDir, { recursive: true });
    writeFileSync(join(captionsDir, `${artifactId}.caption.json`), JSON.stringify(caption, null, 2) + "\n", "utf-8");
    writeFileSync(join(routingDir, `${artifactId}.routing.json`), JSON.stringify(routing, null, 2) + "\n", "utf-8");
    importedCount++;
  }

  return { importedCount, failedCount: failures.length, failures };
}
