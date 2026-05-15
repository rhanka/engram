import * as childProcess from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";

export type PdfOcrMode = "off" | "auto" | "always" | "dry-run";
export type PdfTextLayerProvider = "unpdf" | "pdftotext" | "none";

export interface PdfPreflightOptions {
  minWordsPerPage?: number;
  minTotalWords?: number;
}

export interface PdfPreflightResult {
  filePath: string;
  sha256: string;
  pageCount: number;
  wordCount: number;
  charCount: number;
  imageMarkerCount: number;
  textLayerProvider: PdfTextLayerProvider;
  reason: "ocr_disabled" | "forced" | "text_extractable" | "low_text_density" | "parse_failed";
  shouldOcr: boolean;
}

export interface PdfTextLayerResult {
  text: string;
  pageCount: number;
  provider: PdfTextLayerProvider;
}

interface UnpdfTextResult {
  text: string | string[];
  totalPages: number;
}

const DEFAULT_MIN_WORDS_PER_PAGE = 25;
const DEFAULT_MIN_TOTAL_WORDS = 40;
const IMAGE_MARKER_PATTERN = /\/(?:Image|XObject)\b/g;

export function parsePdfOcrMode(value = process.env.GRAPHIFY_PDF_OCR): PdfOcrMode {
  const normalized = String(value ?? "auto").trim().toLowerCase();
  if (normalized === "" || normalized === "1" || normalized === "true" || normalized === "yes") return "auto";
  if (normalized === "0" || normalized === "false" || normalized === "no") return "off";
  if (normalized === "off" || normalized === "auto" || normalized === "always" || normalized === "dry-run") {
    return normalized;
  }
  throw new Error(
    "Unsupported GRAPHIFY_PDF_OCR mode \"" + value + "\". Use off, auto, always, or dry-run.",
  );
}

function normalizeText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function countImageMarkers(buffer: Buffer): number {
  return (buffer.toString("latin1").match(IMAGE_MARKER_PATTERN) ?? []).length;
}

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

async function extractWithUnpdf(buffer: Buffer): Promise<PdfTextLayerResult | null> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const doc = await getDocumentProxy(new Uint8Array(buffer));
    const parsed = (await extractText(doc, { mergePages: true })) as UnpdfTextResult;
    const text = Array.isArray(parsed.text) ? parsed.text.join("\n") : String(parsed.text ?? "");
    return {
      text: normalizeText(text),
      pageCount: Math.max(1, Number(parsed.totalPages ?? 1)),
      provider: "unpdf",
    };
  } catch {
    return null;
  }
}

function extractWithPdftotext(filePath: string): PdfTextLayerResult | null {
  const textResult = childProcess.spawnSync("pdftotext", [filePath, "-"], {
    encoding: "utf-8",
    maxBuffer: 20 * 1024 * 1024,
  });
  const textOutput = textResult.stdout ?? "";
  if ((textResult.status ?? 0) !== 0 && !textOutput.trim()) {
    return null;
  }
  if (!textOutput.trim()) {
    return null;
  }

  let pageCount = 1;
  const infoResult = childProcess.spawnSync("pdfinfo", [filePath], {
    encoding: "utf-8",
    maxBuffer: 1024 * 1024,
  });
  if ((infoResult.status ?? 0) === 0 || infoResult.stdout) {
    const match = infoResult.stdout.match(/^Pages:\s+(\d+)/m);
    if (match) pageCount = Math.max(1, Number(match[1]));
  }

  return {
    text: normalizeText(textOutput),
    pageCount,
    provider: "pdftotext",
  };
}

export async function extractPdfTextLayer(
  filePath: string,
  buffer = readFileSync(filePath),
  preferredProvider?: Exclude<PdfTextLayerProvider, "none">,
): Promise<PdfTextLayerResult> {
  if (preferredProvider === "pdftotext") {
    const fallback = extractWithPdftotext(filePath);
    if (fallback) return fallback;
  }

  const parsed = await extractWithUnpdf(buffer);
  if (preferredProvider === "unpdf" && parsed) return parsed;

  const fallback = !parsed || countWords(parsed.text) < DEFAULT_MIN_TOTAL_WORDS
    ? extractWithPdftotext(filePath)
    : null;

  const best = fallback && countWords(fallback.text) > countWords(parsed?.text ?? "") ? fallback : parsed;
  return best ?? { text: "", pageCount: 0, provider: "none" };
}

export async function preflightPdf(
  filePath: string,
  mode: PdfOcrMode = parsePdfOcrMode(),
  options: PdfPreflightOptions = {},
): Promise<PdfPreflightResult> {
  const resolved = resolve(filePath);
  const buffer = readFileSync(resolved);
  const hash = sha256(buffer);
  const imageMarkerCount = countImageMarkers(buffer);
  const minWordsPerPage = options.minWordsPerPage ?? DEFAULT_MIN_WORDS_PER_PAGE;
  const minTotalWords = options.minTotalWords ?? DEFAULT_MIN_TOTAL_WORDS;

  if (mode === "off") {
    return {
      filePath: resolved,
      sha256: hash,
      pageCount: 0,
      wordCount: 0,
      charCount: 0,
      imageMarkerCount,
      textLayerProvider: "none",
      reason: "ocr_disabled",
      shouldOcr: false,
    };
  }

  if (mode === "always") {
    return {
      filePath: resolved,
      sha256: hash,
      pageCount: 0,
      wordCount: 0,
      charCount: 0,
      imageMarkerCount,
      textLayerProvider: "none",
      reason: "forced",
      shouldOcr: true,
    };
  }

  const textLayer = await extractPdfTextLayer(resolved, buffer);
  const pageCount = Math.max(1, textLayer.pageCount || 1);
  const wordCount = countWords(textLayer.text);
  const charCount = textLayer.text.length;
  const lowTextDensity = wordCount < Math.max(minTotalWords, pageCount * minWordsPerPage);
  const reason = textLayer.provider === "none" ? "parse_failed" : lowTextDensity ? "low_text_density" : "text_extractable";

  return {
    filePath: resolved,
    sha256: hash,
    pageCount: textLayer.pageCount,
    wordCount,
    charCount,
    imageMarkerCount,
    textLayerProvider: textLayer.provider,
    reason,
    shouldOcr: reason !== "text_extractable" && mode !== "dry-run",
  };
}

export function pdfOcrSidecarStem(filePath: string, sha: string): string {
  return basename(filePath, extname(filePath)).replace(/[^a-zA-Z0-9_.-]+/g, "_") + "_" + sha.slice(0, 12);
}
