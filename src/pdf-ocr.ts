import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { DetectionResult } from "./types.js";
import { extractPdfTextLayer, pdfOcrSidecarStem, parsePdfOcrMode, preflightPdf, type PdfOcrMode, type PdfPreflightResult } from "./pdf-preflight.js";

const MISTRAL_OCR_PACKAGE = "mistral-ocr";
const DEFAULT_OCR_MODEL = "mistral-ocr-latest";
const PDF_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

export interface PdfPreparationArtifact {
  sourceFile: string;
  markdownPath?: string;
  imagePaths?: string[];
  provider: "pdf-parse" | "pdftotext" | "mistral-ocr" | "none";
  mode: PdfOcrMode;
  status: "converted" | "cached" | "skipped" | "failed";
  reason: string;
  preflight: PdfPreflightResult;
}

export interface PdfPreparationOptions {
  outputDir?: string;
  mode?: PdfOcrMode;
  incremental?: boolean;
  apiKey?: string;
  model?: string;
  failOnExplicitOcr?: boolean;
}

interface MistralOcrModule {
  convertPdf(input: string, options?: {
    apiKey?: string;
    model?: string;
    markdownPath?: string;
    imageOutputDir?: string;
    generateDocx?: boolean;
    logger?: false | { log(message: string): void; warn?(message: string): void };
  }): Promise<{ markdown: string; markdownPath?: string; images?: unknown[]; ocrResponse?: unknown }>;
}

let mistralOcrModulePromise: Promise<MistralOcrModule> | null = null;

function cloneDetection(detection: DetectionResult): DetectionResult {
  return JSON.parse(JSON.stringify(detection)) as DetectionResult;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function metadataPath(markdownPath: string): string {
  return markdownPath.replace(/\.md$/i, ".ocr.json");
}

function listImageArtifacts(imageOutputDir: string): string[] {
  if (!existsSync(imageOutputDir)) return [];
  return readdirSync(imageOutputDir)
    .map((entry) => join(imageOutputDir, entry))
    .filter((entryPath) => {
      try {
        const extension = entryPath.slice(entryPath.lastIndexOf(".")).toLowerCase();
        return PDF_IMAGE_EXTENSIONS.has(extension) && statSync(entryPath).isFile();
      } catch {
        return false;
      }
    })
    .sort();
}

function textMarkdown(sourceFile: string, text: string, provider: "pdf-parse" | "pdftotext"): string {
  return [
    "---",
    "graphify_source_file: " + JSON.stringify(sourceFile),
    "graphify_conversion: " + provider,
    "---",
    "",
    "<!-- extracted from PDF text layer by graphify pdf preflight -->",
    "",
    text.trim(),
    "",
  ].join("\n");
}

async function loadMistralOcrModule(): Promise<MistralOcrModule> {
  if (!mistralOcrModulePromise) {
    mistralOcrModulePromise = import(MISTRAL_OCR_PACKAGE)
      .then((imported) => {
        const convertPdf = Reflect.get(imported, "convertPdf");
        if (typeof convertPdf !== "function") {
          throw new Error("mistral-ocr did not expose convertPdf");
        }
        return { convertPdf } as MistralOcrModule;
      })
      .catch((error) => {
        mistralOcrModulePromise = null;
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(
          "PDF OCR requires the optional dependency mistral-ocr. Install graphify with optional dependencies, then retry. " + detail,
        );
      });
  }
  return mistralOcrModulePromise;
}

function writeMetadata(path: string, artifact: PdfPreparationArtifact): void {
  writeFileSync(path, JSON.stringify({
    source_file: artifact.sourceFile,
    markdown_path: artifact.markdownPath,
    image_paths: artifact.imagePaths,
    provider: artifact.provider,
    mode: artifact.mode,
    status: artifact.status,
    reason: artifact.reason,
    preflight: artifact.preflight,
  }, null, 2), "utf-8");
}

function shouldFail(mode: PdfOcrMode, options: PdfPreparationOptions): boolean {
  return mode === "always" || options.failOnExplicitOcr === true;
}

async function preparePdf(
  filePath: string,
  outputDir: string,
  options: PdfPreparationOptions,
): Promise<PdfPreparationArtifact> {
  const mode = options.mode ?? parsePdfOcrMode();
  const preflight = await preflightPdf(filePath, mode);
  const stem = pdfOcrSidecarStem(filePath, preflight.sha256);
  const markdownPath = join(outputDir, stem + ".md");
  const imageOutputDir = join(outputDir, stem + "_images");
  const ocrMetadataPath = metadataPath(markdownPath);

  if (existsSync(markdownPath)) {
    const provider = preflight.shouldOcr ? "mistral-ocr" : preflight.textLayerProvider === "pdftotext" ? "pdftotext" : "pdf-parse";
    const artifact: PdfPreparationArtifact = {
      sourceFile: resolve(filePath),
      markdownPath,
      imagePaths: listImageArtifacts(imageOutputDir),
      provider,
      mode,
      status: "cached",
      reason: "sidecar_exists",
      preflight,
    };
    writeMetadata(ocrMetadataPath, artifact);
    return artifact;
  }

  if (!preflight.shouldOcr) {
    if (preflight.reason === "text_extractable") {
      const preferredTextProvider = preflight.textLayerProvider === "none" ? undefined : preflight.textLayerProvider;
      const textLayer = await extractPdfTextLayer(filePath, undefined, preferredTextProvider);
      const text = textLayer.text;
      if (countWords(text) > 0 && textLayer.provider !== "none") {
        writeFileSync(markdownPath, textMarkdown(resolve(filePath), text, textLayer.provider), "utf-8");
        const artifact: PdfPreparationArtifact = {
          sourceFile: resolve(filePath),
          markdownPath,
          provider: textLayer.provider,
          mode,
          status: "converted",
          reason: preflight.reason,
          preflight,
        };
        writeMetadata(ocrMetadataPath, artifact);
        return artifact;
      }
    }

    return {
      sourceFile: resolve(filePath),
      provider: "none",
      mode,
      status: "skipped",
      reason: preflight.reason,
      preflight,
    };
  }

  const apiKey = options.apiKey ?? process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    const artifact: PdfPreparationArtifact = {
      sourceFile: resolve(filePath),
      provider: "mistral-ocr",
      mode,
      status: "skipped",
      reason: "missing_mistral_api_key",
      preflight,
    };
    if (shouldFail(mode, options)) {
      throw new Error("MISTRAL_API_KEY is required for PDF OCR with mistral-ocr.");
    }
    return artifact;
  }

  try {
    const mistralOcr = await loadMistralOcrModule();
    await mistralOcr.convertPdf(resolve(filePath), {
      apiKey,
      model: options.model ?? process.env.GRAPHIFY_PDF_OCR_MODEL ?? DEFAULT_OCR_MODEL,
      markdownPath,
      imageOutputDir,
      generateDocx: false,
      logger: false,
    });
    const originalMarkdown = existsSync(markdownPath) ? readFileSync(markdownPath, "utf-8") : "";
    if (originalMarkdown && !originalMarkdown.startsWith("---\n")) {
      writeFileSync(
        markdownPath,
        [
          "---",
          "graphify_source_file: " + JSON.stringify(resolve(filePath)),
          "graphify_conversion: mistral-ocr",
          "---",
          "",
          originalMarkdown,
        ].join("\n"),
        "utf-8",
      );
    }
    const artifact: PdfPreparationArtifact = {
      sourceFile: resolve(filePath),
      markdownPath,
      imagePaths: listImageArtifacts(imageOutputDir),
      provider: "mistral-ocr",
      mode,
      status: "converted",
      reason: preflight.reason,
      preflight,
    };
    writeMetadata(ocrMetadataPath, artifact);
    return artifact;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (shouldFail(mode, options)) {
      throw error;
    }
    return {
      sourceFile: resolve(filePath),
      provider: "mistral-ocr",
      mode,
      status: "failed",
      reason: detail,
      preflight,
    };
  }
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

export async function augmentDetectionWithPdfPreflight(
  detection: DetectionResult,
  options: PdfPreparationOptions = {},
): Promise<{ detection: DetectionResult; pdfArtifacts: PdfPreparationArtifact[] }> {
  const nextDetection = cloneDetection(detection);
  const source = options.incremental && nextDetection.new_files ? nextDetection.new_files : nextDetection.files;
  const paperFiles = [...(source.paper ?? [])];
  if (paperFiles.length === 0) {
    return { detection: nextDetection, pdfArtifacts: [] };
  }

  const outputDir = resolve(options.outputDir ?? join(".graphify", "converted", "pdf"));
  mkdirSync(outputDir, { recursive: true });

  const pdfArtifacts: PdfPreparationArtifact[] = [];
  const convertedSources = new Set<string>();
  const markdownPaths: string[] = [];
  const imagePaths: string[] = [];

  for (const paperFile of paperFiles) {
    const artifact = await preparePdf(paperFile, outputDir, options);
    pdfArtifacts.push(artifact);
    if (artifact.markdownPath && (artifact.status === "converted" || artifact.status === "cached")) {
      convertedSources.add(resolve(paperFile));
      markdownPaths.push(artifact.markdownPath);
      imagePaths.push(...(artifact.imagePaths ?? []));
    } else if (artifact.status === "failed") {
      console.log("  warning: PDF OCR failed for " + paperFile + ": " + artifact.reason);
    } else if (artifact.status === "skipped" && artifact.reason === "missing_mistral_api_key") {
      console.log("  warning: PDF OCR skipped for " + paperFile + ": MISTRAL_API_KEY is not set");
    }
  }

  source.paper = paperFiles.filter((paperFile) => !convertedSources.has(resolve(paperFile)));
  source.document = dedupe([...(source.document ?? []), ...markdownPaths]);
  source.image = dedupe([...(source.image ?? []), ...imagePaths]);

  return { detection: nextDetection, pdfArtifacts };
}
