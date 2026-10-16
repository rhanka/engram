import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { unpdfExtractTextMock, unpdfGetDocMock, convertPdfMock, spawnSyncMock } = vi.hoisted(() => ({
  unpdfExtractTextMock: vi.fn(),
  unpdfGetDocMock: vi.fn(),
  convertPdfMock: vi.fn(),
  spawnSyncMock: vi.fn(),
}));

vi.mock("unpdf", () => ({
  extractText: unpdfExtractTextMock,
  getDocumentProxy: unpdfGetDocMock,
}));

vi.mock("mistral-ocr", () => ({
  convertPdf: convertPdfMock,
}));

vi.mock("node:child_process", () => ({
  spawnSync: spawnSyncMock,
}));

import { augmentDetectionWithPdfPreflight } from "../src/pdf-ocr.js";
import { parsePdfOcrMode, preflightPdf } from "../src/pdf-preflight.js";
import { prepareSemanticDetection } from "../src/semantic-prepare.js";

const tempDirs: string[] = [];

describe("PDF preflight and OCR preparation", () => {
  let tmpDir: string;
  let pdfPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "graphify-pdf-preflight-"));
    tempDirs.push(tmpDir);
    pdfPath = join(tmpDir, "scan.pdf");
    writeFileSync(pdfPath, Buffer.from("%PDF-1.7\n/Image /XObject\n"));
    unpdfGetDocMock.mockResolvedValue({});
    unpdfExtractTextMock.mockResolvedValue({ text: "", totalPages: 1 });
    spawnSyncMock.mockReturnValue({ output: [], pid: 0, signal: null, status: 1, stderr: "", stdout: "" });
    convertPdfMock.mockImplementation(async (_input, options) => {
      writeFileSync(options.markdownPath, "# OCR markdown\n\nDetected text", "utf-8");
      mkdirSync(options.imageOutputDir, { recursive: true });
      const imagePath = join(options.imageOutputDir, "page-1.png");
      writeFileSync(imagePath, "png-bytes", "utf-8");
      return { markdown: "# OCR markdown\n\nDetected text", markdownPath: options.markdownPath, images: [{ path: imagePath }] };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    unpdfExtractTextMock.mockReset();
    unpdfGetDocMock.mockReset();
    convertPdfMock.mockReset();
    spawnSyncMock.mockReset();
    delete process.env.GRAPHIFY_PDF_OCR;
    delete process.env.GRAPHIFY_PDF_OCR_MODEL;
    delete process.env.MISTRAL_API_KEY;
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it("normalizes PDF OCR mode aliases", () => {
    expect(parsePdfOcrMode()).toBe("auto");
    expect(parsePdfOcrMode("false")).toBe("off");
    expect(parsePdfOcrMode("always")).toBe("always");
    expect(() => parsePdfOcrMode("bad")).toThrow(/Unsupported/);
  });

  it("packages mistral-ocr as a required runtime dependency", () => {
    const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8")) as {
      dependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };
    const packageLock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf-8")) as {
      packages?: Record<string, { dependencies?: Record<string, string>; optionalDependencies?: Record<string, string> }>;
    };

    expect(packageJson.dependencies).toHaveProperty("mistral-ocr");
    expect(packageJson.optionalDependencies ?? {}).not.toHaveProperty("mistral-ocr");
    expect(packageLock.packages?.[""]?.dependencies).toHaveProperty("mistral-ocr");
    expect(packageLock.packages?.[""]?.optionalDependencies ?? {}).not.toHaveProperty("mistral-ocr");
  });

  it("marks low-text PDFs as needing OCR in auto mode", async () => {
    unpdfExtractTextMock.mockResolvedValueOnce({ text: "tiny", totalPages: 3 });

    const result = await preflightPdf(pdfPath, "auto");

    expect(result.reason).toBe("low_text_density");
    expect(result.shouldOcr).toBe(true);
    expect(result.imageMarkerCount).toBeGreaterThan(0);
  });

  it("falls back to pdftotext when unpdf cannot read a text layer", async () => {
    unpdfExtractTextMock.mockRejectedValueOnce(new Error("parse failed"));
    spawnSyncMock.mockImplementation((command) => {
      if (command === "pdftotext") {
        return {
          error: new Error("EPERM but stdout is usable"),
          output: [],
          pid: 0,
          signal: null,
          status: 0,
          stderr: "",
          stdout: Array(80).fill("fallback").join(" "),
        };
      }
      if (command === "pdfinfo") {
        return {
          output: [],
          pid: 0,
          signal: null,
          status: 0,
          stderr: "",
          stdout: "Pages: 2\n",
        };
      }
      return { output: [], pid: 0, signal: null, status: 1, stderr: "", stdout: "" };
    });

    const result = await preflightPdf(pdfPath, "auto");

    expect(result.reason).toBe("text_extractable");
    expect(result.textLayerProvider).toBe("pdftotext");
    expect(result.wordCount).toBe(80);
    expect(result.shouldOcr).toBe(false);
  });

  it("converts text-layer PDFs locally without calling Mistral OCR", async () => {
    unpdfExtractTextMock.mockResolvedValue({ text: Array(100).fill("word").join(" "), totalPages: 1 });
    const outputDir = join(tmpDir, "converted");

    const result = await augmentDetectionWithPdfPreflight({
      files: { code: [], document: [], paper: [pdfPath], image: [], video: [] },
      skipped_sensitive: [],
      root: tmpDir,
      total_files: 1,
      total_words: 0,
      needs_graph: false,
      warning: null,
      graphifyignore_patterns: 0,
    }, { outputDir, mode: "auto" });

    expect(result.detection.files.paper).toEqual([]);
    expect(result.detection.files.document).toHaveLength(1);
    expect(convertPdfMock).not.toHaveBeenCalled();
    expect(readFileSync(result.detection.files.document[0]!, "utf-8")).toContain("graphify_conversion: unpdf");
  });

  it("uses mistral-ocr for scanned PDFs when preflight detects low text", async () => {
    process.env.MISTRAL_API_KEY = "test-key";
    const outputDir = join(tmpDir, "converted");

    const result = await augmentDetectionWithPdfPreflight({
      files: { code: [], document: [], paper: [pdfPath], image: [], video: [] },
      skipped_sensitive: [],
      root: tmpDir,
      total_files: 1,
      total_words: 0,
      needs_graph: false,
      warning: null,
      graphifyignore_patterns: 0,
    }, { outputDir, mode: "auto" });

    expect(convertPdfMock).toHaveBeenCalledWith(pdfPath, expect.objectContaining({
      apiKey: "test-key",
      generateDocx: false,
      model: "mistral-ocr-latest",
    }));
    expect(result.detection.files.paper).toEqual([]);
    expect(result.detection.files.document).toHaveLength(1);
    expect(result.detection.files.image).toHaveLength(1);
    expect(result.detection.files.image[0]).toMatch(/page-1\.png$/);
    expect(existsSync(result.detection.files.document[0]!)).toBe(true);
    expect(existsSync(result.detection.files.image[0]!)).toBe(true);
    expect(readFileSync(result.detection.files.document[0]!, "utf-8")).toContain("graphify_conversion: mistral-ocr");
  });

  it("does not call Mistral OCR in dry-run mode", async () => {
    process.env.MISTRAL_API_KEY = "test-key";

    const result = await augmentDetectionWithPdfPreflight({
      files: { code: [], document: [], paper: [pdfPath], image: [], video: [] },
      skipped_sensitive: [],
      root: tmpDir,
      total_files: 1,
      total_words: 0,
      needs_graph: false,
      warning: null,
      graphifyignore_patterns: 0,
    }, { outputDir: join(tmpDir, "converted"), mode: "dry-run" });

    expect(convertPdfMock).not.toHaveBeenCalled();
    expect(result.detection.files.paper).toEqual([pdfPath]);
    expect(result.pdfArtifacts[0]?.status).toBe("skipped");
  });

  it("keeps the source PDF when auto OCR needs a missing API key", async () => {
    const result = await augmentDetectionWithPdfPreflight({
      files: { code: [], document: [], paper: [pdfPath], image: [], video: [] },
      skipped_sensitive: [],
      root: tmpDir,
      total_files: 1,
      total_words: 0,
      needs_graph: false,
      warning: null,
      graphifyignore_patterns: 0,
    }, { outputDir: join(tmpDir, "converted"), mode: "auto" });

    expect(convertPdfMock).not.toHaveBeenCalled();
    expect(result.detection.files.paper).toEqual([pdfPath]);
    expect(result.pdfArtifacts[0]?.reason).toBe("missing_mistral_api_key");
  });


  it("fails clearly when OCR is forced without a Mistral API key", async () => {
    await expect(augmentDetectionWithPdfPreflight({
      files: { code: [], document: [], paper: [pdfPath], image: [], video: [] },
      skipped_sensitive: [],
      root: tmpDir,
      total_files: 1,
      total_words: 0,
      needs_graph: false,
      warning: null,
      graphifyignore_patterns: 0,
    }, { outputDir: join(tmpDir, "converted"), mode: "always" })).rejects.toThrow(/MISTRAL_API_KEY/);
  });

  it("prepares transcripts and PDF sidecars through the unified semantic preparation step", async () => {
    unpdfExtractTextMock.mockResolvedValue({ text: Array(80).fill("text").join(" "), totalPages: 1 });
    mkdirSync(join(tmpDir, "semantic"), { recursive: true });

    const result = await prepareSemanticDetection({
      files: { code: [], document: [], paper: [pdfPath], image: [], video: [] },
      skipped_sensitive: [],
      root: tmpDir,
      total_files: 1,
      total_words: 0,
      needs_graph: false,
      warning: null,
      graphifyignore_patterns: 0,
    }, {
      pdfOutputDir: join(tmpDir, "semantic", "pdf"),
      transcriptOutputDir: join(tmpDir, "semantic", "transcripts"),
      pdfOcrMode: "auto",
    });

    expect(result.transcriptPaths).toEqual([]);
    expect(result.pdfArtifacts).toHaveLength(1);
    expect(result.detection.files.paper).toEqual([]);
    expect(result.detection.files.document).toHaveLength(1);
  });
});
