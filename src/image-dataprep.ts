import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";

import type { PdfPreparationArtifact } from "./pdf-ocr.js";
import type { DetectionResult, NormalizedProjectConfig } from "./types.js";

export type ImageDataprepSourceKind = "direct_image" | "ocr_crop";

export interface ImageDataprepArtifact {
  id: string;
  path: string;
  source_file: string;
  source_page: number | null;
  source_sidecar: string | null;
  source_kind: ImageDataprepSourceKind;
  mime_type: string;
  sha256: string;
}

export interface ImageDataprepManifest {
  schema: "graphify_image_dataprep_manifest_v1";
  source_state_hash: string;
  mode: "assistant" | "batch" | "mesh" | "off";
  artifact_count: number;
  generated_at: string;
  artifacts: ImageDataprepArtifact[];
}

export interface BuildImageDataprepManifestOptions {
  root: string;
  mode: "assistant" | "batch" | "mesh" | "off";
  detection: DetectionResult;
  pdfArtifacts: PdfPreparationArtifact[];
  includeFullPageScreenshots?: boolean;
}

export interface RunImageDataprepOptions {
  config: NormalizedProjectConfig;
  detection: DetectionResult;
  pdfArtifacts: PdfPreparationArtifact[];
}

export interface RunImageDataprepResult {
  enabled: boolean;
  manifest: ImageDataprepManifest | null;
  manifestPath: string | null;
  assistantInstructionsPath: string | null;
}

function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

function fileHash(path: string): string {
  return sha256(readFileSync(path));
}

function mimeType(path: string): string {
  const ext = extname(path).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "application/octet-stream";
}

function fullPageScreenshot(path: string): boolean {
  return /(^|[/\\])full[-_]page[-_]screenshots([/\\]|$)/iu.test(path);
}

function sourcePage(path: string): number | null {
  const match = basename(path).match(/(?:page|p)[-_]?(\d+)/iu);
  return match ? Number.parseInt(match[1]!, 10) : null;
}

function artifactId(path: string, sourceKind: ImageDataprepSourceKind): string {
  return `${sourceKind}-${sha256(resolve(path)).slice(0, 16)}`;
}

function pdfArtifactByImage(pdfArtifacts: PdfPreparationArtifact[]): Map<string, PdfPreparationArtifact> {
  const map = new Map<string, PdfPreparationArtifact>();
  for (const artifact of pdfArtifacts) {
    for (const imagePath of artifact.imagePaths ?? []) {
      map.set(resolve(imagePath), artifact);
    }
  }
  return map;
}

function existingImages(paths: string[], includeFullPageScreenshots: boolean): string[] {
  return paths
    .map((item) => resolve(item))
    .filter((item) => includeFullPageScreenshots || !fullPageScreenshot(item))
    .filter((item) => {
      try {
        return existsSync(item) && statSync(item).isFile();
      } catch {
        return false;
      }
    })
    .sort();
}

export function buildImageDataprepManifest(options: BuildImageDataprepManifestOptions): ImageDataprepManifest {
  const includeFullPageScreenshots = options.includeFullPageScreenshots ?? false;
  const byImage = pdfArtifactByImage(options.pdfArtifacts);
  const images = existingImages(options.detection.files.image ?? [], includeFullPageScreenshots);
  const artifacts: ImageDataprepArtifact[] = [];

  for (const imagePath of images) {
    const pdfArtifact = byImage.get(resolve(imagePath));
    const sourceKind: ImageDataprepSourceKind = pdfArtifact ? "ocr_crop" : "direct_image";
    artifacts.push({
      id: artifactId(imagePath, sourceKind),
      path: imagePath,
      source_file: pdfArtifact?.sourceFile ?? imagePath,
      source_page: pdfArtifact ? sourcePage(imagePath) : null,
      source_sidecar: pdfArtifact?.markdownPath ?? null,
      source_kind: sourceKind,
      mime_type: mimeType(imagePath),
      sha256: fileHash(imagePath),
    });
  }

  return {
    schema: "graphify_image_dataprep_manifest_v1",
    source_state_hash: sha256(JSON.stringify({
      root: resolve(options.root),
      images,
      pdfArtifacts: options.pdfArtifacts.map((artifact) => ({
        sourceFile: artifact.sourceFile,
        markdownPath: artifact.markdownPath,
        imagePaths: artifact.imagePaths,
        status: artifact.status,
      })),
    })),
    mode: options.mode,
    artifact_count: artifacts.length,
    generated_at: new Date().toISOString(),
    artifacts,
  };
}

function writeAssistantInstructions(path: string, manifest: ImageDataprepManifest, config: NormalizedProjectConfig): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    [
      "# Graphify Image Dataprep Assistant Instructions",
      "",
      "Graphify is running image dataprep in assistant mode. Do not call a provider from Graphify runtime.",
      "",
      `Caption schema: ${config.dataprep.image_analysis.caption_schema}`,
      `Routing profile: ${config.dataprep.image_analysis.routing_profile}`,
      "",
      "Inspect each artifact and write caption/routing JSON sidecars with provenance preserved.",
      "",
      "## Artifacts",
      "",
      ...manifest.artifacts.map((artifact) => `- ${artifact.id}: ${artifact.path}`),
    ].join("\n") + "\n",
    "utf-8",
  );
}

export function runImageDataprep(options: RunImageDataprepOptions): RunImageDataprepResult {
  const policy = options.config.dataprep.image_analysis;
  if (!policy.enabled) {
    return { enabled: false, manifest: null, manifestPath: null, assistantInstructionsPath: null };
  }

  const dir = join(options.config.outputs.state_dir, "image-dataprep");
  const manifestPath = join(dir, "manifest.json");
  const assistantInstructionsPath = policy.mode === "assistant" ? join(dir, "assistant-instructions.md") : null;
  const manifest = buildImageDataprepManifest({
    root: options.config.configDir,
    mode: policy.mode,
    detection: options.detection,
    pdfArtifacts: options.pdfArtifacts,
    includeFullPageScreenshots: options.config.dataprep.full_page_screenshot_vision,
  });

  mkdirSync(dir, { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
  if (assistantInstructionsPath) {
    writeAssistantInstructions(assistantInstructionsPath, manifest, options.config);
  }

  return { enabled: true, manifest, manifestPath, assistantInstructionsPath };
}
