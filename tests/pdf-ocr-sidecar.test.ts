import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { convertPdfMock } = vi.hoisted(() => ({ convertPdfMock: vi.fn() }));

vi.mock("mistral-ocr", () => ({ convertPdf: convertPdfMock }));

import { augmentDetectionWithPdfPreflight } from "../src/pdf-ocr.js";
import type { DetectionResult } from "../src/types.js";

const MARKDOWN_BODY = "# OCR markdown\n\nDetected text";

const MOCK_OCR_RESPONSE = {
  model: "mistral-ocr-4-0",
  pages: [
    {
      index: 0,
      markdown: "# Page one",
      dimensions: { dpi: 200, width: 1000, height: 1400 },
      images: [
        { id: "img-0", topLeftX: 100, topLeftY: 140, bottomRightX: 500, bottomRightY: 700 },
        { id: "img-1", topLeftX: null, topLeftY: null, bottomRightX: null, bottomRightY: null },
      ],
    },
  ],
};

const tempDirs: string[] = [];

function detection(pdfPath: string, root: string): DetectionResult {
  return {
    files: { code: [], document: [], paper: [pdfPath], image: [], video: [] },
    skipped_sensitive: [],
    root,
    total_files: 1,
    total_words: 0,
    needs_graph: false,
    warning: null,
    graphifyignore_patterns: 0,
  } as DetectionResult;
}

describe("Mistral OCR v4 structured sidecar capture", () => {
  let tmpDir: string;
  let pdfPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "graphify-ocr-sidecar-"));
    tempDirs.push(tmpDir);
    pdfPath = join(tmpDir, "scan.pdf");
    writeFileSync(pdfPath, Buffer.from("%PDF-1.7\n/Image /XObject\n"));
    process.env.MISTRAL_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    convertPdfMock.mockReset();
    delete process.env.MISTRAL_API_KEY;
    delete process.env.GRAPHIFY_PDF_OCR;
    delete process.env.GRAPHIFY_PDF_OCR_MODEL;
    while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true });
  });

  it("writes <stem>.ocr.json with normalized geometry when the response is structured", async () => {
    convertPdfMock.mockImplementation(async (_input: string, options: { markdownPath: string }) => {
      writeFileSync(options.markdownPath, MARKDOWN_BODY, "utf-8");
      return { markdown: MARKDOWN_BODY, markdownPath: options.markdownPath, images: [], ocrResponse: MOCK_OCR_RESPONSE };
    });

    const outputDir = join(tmpDir, "out");
    const result = await augmentDetectionWithPdfPreflight(detection(pdfPath, tmpDir), { outputDir, mode: "always" });

    const markdownPath = result.detection.files.document[0]!;
    const ocrPath = markdownPath.replace(/\.md$/, ".ocr.json");
    expect(existsSync(ocrPath)).toBe(true);

    const sidecar = JSON.parse(readFileSync(ocrPath, "utf-8"));
    expect(sidecar.schema).toBe("graphify_pdf_ocr_pages_v1");
    expect(sidecar.model).toBe("mistral-ocr-4-0");
    expect(sidecar.source_file).toBe(pdfPath);
    expect(sidecar.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(sidecar.pages).toHaveLength(1);
    expect(sidecar.pages[0]).toMatchObject({ page: 1, width: 1000, height: 1400, dpi: 200 });
    expect(sidecar.pages[0].images[0]).toEqual({ id: "img-0", bbox: [0.1, 0.1, 0.5, 0.5] });
    expect(sidecar.pages[0].images[1]).toEqual({ id: "img-1" });
  });

  it("moves prep bookkeeping to <stem>.prep.json (distinct from the structured .ocr.json)", async () => {
    convertPdfMock.mockImplementation(async (_input: string, options: { markdownPath: string }) => {
      writeFileSync(options.markdownPath, MARKDOWN_BODY, "utf-8");
      return { markdown: MARKDOWN_BODY, markdownPath: options.markdownPath, images: [], ocrResponse: MOCK_OCR_RESPONSE };
    });

    const outputDir = join(tmpDir, "out");
    const result = await augmentDetectionWithPdfPreflight(detection(pdfPath, tmpDir), { outputDir, mode: "always" });
    const markdownPath = result.detection.files.document[0]!;
    const prepPath = markdownPath.replace(/\.md$/, ".prep.json");

    expect(existsSync(prepPath)).toBe(true);
    const prep = JSON.parse(readFileSync(prepPath, "utf-8"));
    expect(prep).toHaveProperty("provider", "mistral-ocr");
    expect(prep).not.toHaveProperty("pages"); // prep bookkeeping, not the OCR sidecar
  });

  it("leaves the markdown sidecar byte-identical whether or not the structured response is present", async () => {
    // Run A: convertPdf returns a structured ocrResponse.
    convertPdfMock.mockImplementation(async (_input: string, options: { markdownPath: string }) => {
      writeFileSync(options.markdownPath, MARKDOWN_BODY, "utf-8");
      return { markdown: MARKDOWN_BODY, markdownPath: options.markdownPath, images: [], ocrResponse: MOCK_OCR_RESPONSE };
    });
    const outA = join(tmpDir, "outA");
    const resA = await augmentDetectionWithPdfPreflight(detection(pdfPath, tmpDir), { outputDir: outA, mode: "always" });
    const mdA = resA.detection.files.document[0]!;
    const markdownBytesA = readFileSync(mdA);

    // Run B: same source, convertPdf returns NO ocrResponse (legacy/non-structured).
    convertPdfMock.mockReset();
    convertPdfMock.mockImplementation(async (_input: string, options: { markdownPath: string }) => {
      writeFileSync(options.markdownPath, MARKDOWN_BODY, "utf-8");
      return { markdown: MARKDOWN_BODY, markdownPath: options.markdownPath, images: [] };
    });
    const outB = join(tmpDir, "outB");
    const resB = await augmentDetectionWithPdfPreflight(detection(pdfPath, tmpDir), { outputDir: outB, mode: "always" });
    const mdB = resB.detection.files.document[0]!;
    const markdownBytesB = readFileSync(mdB);

    // Markdown is identical; the .ocr.json is the only additive difference.
    expect(markdownBytesB.equals(markdownBytesA)).toBe(true);
    expect(existsSync(mdA.replace(/\.md$/, ".ocr.json"))).toBe(true);
    expect(existsSync(mdB.replace(/\.md$/, ".ocr.json"))).toBe(false);
  });
});
