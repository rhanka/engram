import type { CitedSourceRef } from "./types.js";

/**
 * Schema identifier for the structured per-page OCR sidecar (`<stem>.ocr.json`)
 * emitted alongside the markdown when Mistral OCR v4 returns a structured
 * response. The sidecar is additive: the markdown sidecar is unchanged.
 */
export const PDF_OCR_PAGES_SCHEMA = "graphify_pdf_ocr_pages_v1";

/** Normalized 0..1 page fractions, top-left origin: [x0, y0, x1, y1]. */
export type NormalizedBbox = [number, number, number, number];

export interface PdfOcrImageRef {
  /** Image id as reported by the OCR response (matches the markdown image ref). */
  id: string;
  /** Normalized [x0,y0,x1,y1] page fractions. Omitted when the API gave no coords. */
  bbox?: NormalizedBbox;
}

export interface PdfOcrBlockRef {
  /** Verbatim block text, when the response carried block-level text. */
  text?: string;
  /** Normalized [x0,y0,x1,y1] page fractions. Omitted when the API gave no coords. */
  bbox?: NormalizedBbox;
}

export interface PdfOcrPageRef {
  /** 1-based page number (OCR `index` + 1). */
  page: number;
  /** Page screenshot width in pixels, when the API reported dimensions. */
  width?: number;
  /** Page screenshot height in pixels, when the API reported dimensions. */
  height?: number;
  /** Dots-per-inch of the page screenshot, when the API reported dimensions. */
  dpi?: number;
  /** Extracted images with normalized bboxes (when coords were provided). */
  images?: PdfOcrImageRef[];
  /**
   * Block-level text regions with normalized bboxes. The standard Mistral OCR
   * v4 response only carries image geometry, so this is populated only when the
   * response includes block/segment geometry (e.g. via bbox annotations).
   */
  blocks?: PdfOcrBlockRef[];
}

export interface PdfOcrPagesSidecar {
  schema: typeof PDF_OCR_PAGES_SCHEMA;
  source_file: string;
  sha256: string;
  model: string;
  pages: PdfOcrPageRef[];
}

export interface BuildPdfOcrPagesInput {
  /** Raw Mistral OCR response (`convertPdf(...).ocrResponse`). Defensively parsed. */
  ocrResponse: unknown;
  source_file: string;
  sha256: string;
  model: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function pickNumber(record: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const found = asFiniteNumber(record[key]);
    if (found !== undefined) return found;
  }
  return undefined;
}

function clampUnit(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function roundFraction(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

interface PixelBox {
  x0?: number;
  y0?: number;
  x1?: number;
  y1?: number;
}

/**
 * Read pixel-space corner coordinates from an OCR image/block record. Accepts
 * both the SDK camelCase form (`topLeftX`) and the raw API snake_case form
 * (`top_left_x`), plus an explicit `bbox: [x0,y0,x1,y1]` pixel array.
 */
function readPixelBox(record: Record<string, unknown>): PixelBox {
  const bboxArray = record["bbox"] ?? record["bounding_box"];
  if (Array.isArray(bboxArray) && bboxArray.length >= 4) {
    return {
      x0: asFiniteNumber(bboxArray[0]),
      y0: asFiniteNumber(bboxArray[1]),
      x1: asFiniteNumber(bboxArray[2]),
      y1: asFiniteNumber(bboxArray[3]),
    };
  }
  return {
    x0: pickNumber(record, "topLeftX", "top_left_x"),
    y0: pickNumber(record, "topLeftY", "top_left_y"),
    x1: pickNumber(record, "bottomRightX", "bottom_right_x"),
    y1: pickNumber(record, "bottomRightY", "bottom_right_y"),
  };
}

/**
 * Normalize pixel-space corners to 0..1 page fractions (top-left origin):
 *   x ÷ pageWidthPx, y ÷ pageHeightPx, clamped to [0,1].
 * Returns undefined when any corner or the page dimensions are missing.
 */
function normalizeBbox(box: PixelBox, width?: number, height?: number): NormalizedBbox | undefined {
  const { x0, y0, x1, y1 } = box;
  if (
    x0 === undefined || y0 === undefined || x1 === undefined || y1 === undefined ||
    width === undefined || height === undefined || width <= 0 || height <= 0
  ) {
    return undefined;
  }
  return [
    roundFraction(clampUnit(x0 / width)),
    roundFraction(clampUnit(y0 / height)),
    roundFraction(clampUnit(x1 / width)),
    roundFraction(clampUnit(y1 / height)),
  ];
}

/**
 * Build the structured per-page OCR sidecar from a Mistral OCR v4 response.
 * Pure: no IO. Returns null when the response carries no pages (so the caller
 * skips writing the sidecar — e.g. mocks/non-OCR providers that don't expose
 * the structured response).
 */
export function buildPdfOcrPagesSidecar(input: BuildPdfOcrPagesInput): PdfOcrPagesSidecar | null {
  const root = asRecord(input.ocrResponse);
  if (!root) return null;
  const rawPages = asArray(root["pages"]);
  if (rawPages.length === 0) return null;

  const pages: PdfOcrPageRef[] = [];
  rawPages.forEach((rawPage, position) => {
    const pageRecord = asRecord(rawPage);
    if (!pageRecord) return;

    const index = asFiniteNumber(pageRecord["index"]);
    const page = (index !== undefined ? index : position) + 1;

    const dimensions = asRecord(pageRecord["dimensions"]);
    const width = dimensions ? pickNumber(dimensions, "width") : undefined;
    const height = dimensions ? pickNumber(dimensions, "height") : undefined;
    const dpi = dimensions ? pickNumber(dimensions, "dpi") : undefined;

    const pageRef: PdfOcrPageRef = { page };
    if (width !== undefined) pageRef.width = width;
    if (height !== undefined) pageRef.height = height;
    if (dpi !== undefined) pageRef.dpi = dpi;

    const images: PdfOcrImageRef[] = [];
    for (const rawImage of asArray(pageRecord["images"])) {
      const imageRecord = asRecord(rawImage);
      if (!imageRecord) continue;
      const id = asNonEmptyString(imageRecord["id"]);
      if (id === undefined) continue;
      const bbox = normalizeBbox(readPixelBox(imageRecord), width, height);
      const imageRef: PdfOcrImageRef = { id };
      if (bbox) imageRef.bbox = bbox;
      images.push(imageRef);
    }
    if (images.length > 0) pageRef.images = images;

    const blocks: PdfOcrBlockRef[] = [];
    for (const rawBlock of [...asArray(pageRecord["blocks"]), ...asArray(pageRecord["segments"])]) {
      const blockRecord = asRecord(rawBlock);
      if (!blockRecord) continue;
      const text = asNonEmptyString(blockRecord["text"] ?? blockRecord["markdown"] ?? blockRecord["content"]);
      const bbox = normalizeBbox(readPixelBox(blockRecord), width, height);
      if (text === undefined && !bbox) continue;
      const blockRef: PdfOcrBlockRef = {};
      if (text !== undefined) blockRef.text = text;
      if (bbox) blockRef.bbox = bbox;
      blocks.push(blockRef);
    }
    if (blocks.length > 0) pageRef.blocks = blocks;

    pages.push(pageRef);
  });

  if (pages.length === 0) return null;

  return {
    schema: PDF_OCR_PAGES_SCHEMA,
    source_file: input.source_file,
    sha256: input.sha256,
    model: input.model,
    pages,
  };
}

export interface PdfOcrRefOptions {
  /**
   * Base fields stamped onto every produced ref (docSha / rawRef / sourceUrl /
   * citation / publishedAt …), matching the radar CitedSourceRef convention.
   */
  base?: Partial<CitedSourceRef>;
  /** Emit refs for images with a bbox (geometry only, no excerpt). Default true. */
  includeImages?: boolean;
  /** Emit refs for blocks with text and/or a bbox. Default true. */
  includeBlocks?: boolean;
}

/**
 * Map a structured OCR pages sidecar to CitedSourceRef[] (radar convention:
 * 1-based page + normalized [x0,y0,x1,y1] bbox + optional verbatim excerpt).
 * Block refs carry the block text as `excerpt`; image refs carry geometry only.
 * Entries with neither geometry nor text are skipped.
 */
export function pdfOcrPagesToCitedSourceRefs(
  sidecar: PdfOcrPagesSidecar,
  options: PdfOcrRefOptions = {},
): CitedSourceRef[] {
  const includeImages = options.includeImages ?? true;
  const includeBlocks = options.includeBlocks ?? true;
  const base = options.base ?? {};
  const refs: CitedSourceRef[] = [];

  for (const page of sidecar.pages) {
    if (includeBlocks && page.blocks) {
      for (const block of page.blocks) {
        if (block.text === undefined && !block.bbox) continue;
        const ref: CitedSourceRef = { ...base, page: page.page };
        if (block.bbox) ref.bbox = block.bbox;
        if (block.text !== undefined) ref.excerpt = block.text;
        refs.push(ref);
      }
    }
    if (includeImages && page.images) {
      for (const image of page.images) {
        if (!image.bbox) continue;
        refs.push({ ...base, page: page.page, bbox: image.bbox });
      }
    }
  }

  return refs;
}
