import { describe, expect, it } from "vitest";
import {
  PDF_OCR_PAGES_SCHEMA,
  buildPdfOcrPagesSidecar,
  pdfOcrPagesToCitedSourceRefs,
  type PdfOcrPagesSidecar,
} from "../src/pdf-ocr-refs.js";

// Mock OCR response shaped like the @mistralai/mistralai SDK deserialization
// (camelCase, 0-based `index`, nullable corner coords, `dimensions|null`).
const MOCK_OCR_RESPONSE = {
  model: "mistral-ocr-4-0",
  usageInfo: { pagesProcessed: 2 },
  pages: [
    {
      index: 0,
      markdown: "# Page one",
      dimensions: { dpi: 200, width: 1000, height: 1400 },
      images: [
        { id: "img-0", topLeftX: 100, topLeftY: 140, bottomRightX: 500, bottomRightY: 700, imageBase64: null },
        // No coords -> bbox omitted but image id retained.
        { id: "img-1", topLeftX: null, topLeftY: null, bottomRightX: null, bottomRightY: null },
      ],
      blocks: [
        { text: "Hello world", topLeftX: 0, topLeftY: 0, bottomRightX: 1000, bottomRightY: 70 },
      ],
    },
    {
      index: 1,
      markdown: "# Page two",
      // No dimensions -> cannot normalize -> no width/height and no image bbox.
      dimensions: null,
      images: [{ id: "img-2", topLeftX: 10, topLeftY: 10, bottomRightX: 20, bottomRightY: 20 }],
    },
  ],
};

describe("buildPdfOcrPagesSidecar", () => {
  function build(): PdfOcrPagesSidecar {
    const sidecar = buildPdfOcrPagesSidecar({
      ocrResponse: MOCK_OCR_RESPONSE,
      source_file: "/abs/scan.pdf",
      sha256: "deadbeef",
      model: "mistral-ocr-4-0",
    });
    expect(sidecar).not.toBeNull();
    return sidecar!;
  }

  it("emits the graphify_pdf_ocr_pages_v1 envelope with passthrough metadata", () => {
    const sidecar = build();
    expect(sidecar.schema).toBe(PDF_OCR_PAGES_SCHEMA);
    expect(sidecar.schema).toBe("graphify_pdf_ocr_pages_v1");
    expect(sidecar.source_file).toBe("/abs/scan.pdf");
    expect(sidecar.sha256).toBe("deadbeef");
    expect(sidecar.model).toBe("mistral-ocr-4-0");
    expect(sidecar.pages).toHaveLength(2);
  });

  it("makes pages 1-based and carries dimensions when present", () => {
    const [page1, page2] = build().pages;
    expect(page1!.page).toBe(1); // index 0 -> page 1
    expect(page1!.width).toBe(1000);
    expect(page1!.height).toBe(1400);
    expect(page1!.dpi).toBe(200);
    expect(page2!.page).toBe(2); // index 1 -> page 2
    // dimensions === null -> width/height/dpi omitted entirely.
    expect(page2!).not.toHaveProperty("width");
    expect(page2!).not.toHaveProperty("height");
    expect(page2!).not.toHaveProperty("dpi");
  });

  it("normalizes image bboxes to 0..1 page fractions (pixel ÷ dimensions, top-left)", () => {
    const page1 = build().pages[0]!;
    expect(page1.images).toHaveLength(2);
    // [100/1000, 140/1400, 500/1000, 700/1400] = [0.1, 0.1, 0.5, 0.5]
    expect(page1.images![0]).toEqual({ id: "img-0", bbox: [0.1, 0.1, 0.5, 0.5] });
  });

  it("omits bbox when the API did not provide corner coords", () => {
    const page1 = build().pages[0]!;
    expect(page1.images![1]).toEqual({ id: "img-1" });
    expect(page1.images![1]).not.toHaveProperty("bbox");
  });

  it("omits bbox when page dimensions are missing", () => {
    const page2 = build().pages[1]!;
    expect(page2.images![0]).toEqual({ id: "img-2" });
    expect(page2.images![0]).not.toHaveProperty("bbox");
  });

  it("maps block-level text + normalized bbox when present", () => {
    const page1 = build().pages[0]!;
    expect(page1.blocks).toHaveLength(1);
    // [0/1000, 0/1400, 1000/1000, 70/1400] = [0, 0, 1, 0.05]
    expect(page1.blocks![0]).toEqual({ text: "Hello world", bbox: [0, 0, 1, 0.05] });
  });

  it("does not emit a blocks array for pages without block geometry", () => {
    const page2 = build().pages[1]!;
    expect(page2).not.toHaveProperty("blocks");
  });

  it("accepts the raw snake_case corner form too", () => {
    const sidecar = buildPdfOcrPagesSidecar({
      ocrResponse: {
        pages: [
          {
            index: 0,
            dimensions: { width: 200, height: 100, dpi: 72 },
            images: [{ id: "snake", top_left_x: 50, top_left_y: 25, bottom_right_x: 150, bottom_right_y: 75 }],
          },
        ],
      },
      source_file: "/abs/snake.pdf",
      sha256: "feed",
      model: "mistral-ocr-4-0",
    });
    expect(sidecar!.pages[0]!.images![0]).toEqual({ id: "snake", bbox: [0.25, 0.25, 0.75, 0.75] });
  });

  it("returns null when the response carries no pages", () => {
    expect(buildPdfOcrPagesSidecar({ ocrResponse: null, source_file: "x", sha256: "y", model: "m" })).toBeNull();
    expect(buildPdfOcrPagesSidecar({ ocrResponse: {}, source_file: "x", sha256: "y", model: "m" })).toBeNull();
    expect(buildPdfOcrPagesSidecar({ ocrResponse: { pages: [] }, source_file: "x", sha256: "y", model: "m" })).toBeNull();
  });
});

describe("pdfOcrPagesToCitedSourceRefs", () => {
  function sidecar(): PdfOcrPagesSidecar {
    return buildPdfOcrPagesSidecar({
      ocrResponse: MOCK_OCR_RESPONSE,
      source_file: "/abs/scan.pdf",
      sha256: "deadbeef",
      model: "mistral-ocr-4-0",
    })!;
  }

  it("maps blocks (text+bbox) and located images to CitedSourceRef, skipping geometry-less entries", () => {
    const refs = pdfOcrPagesToCitedSourceRefs(sidecar());
    // page1 block (text+bbox) + page1 img-0 (bbox). img-1 (no bbox) and img-2 (no bbox) skipped.
    expect(refs).toEqual([
      { page: 1, bbox: [0, 0, 1, 0.05], excerpt: "Hello world" },
      { page: 1, bbox: [0.1, 0.1, 0.5, 0.5] },
    ]);
  });

  it("stamps radar base fields (docSha/rawRef/sourceUrl) onto every ref", () => {
    const refs = pdfOcrPagesToCitedSourceRefs(sidecar(), {
      base: { docSha: "abc123", rawRef: "raw/scan/cas/abc.pdf" },
    });
    for (const ref of refs) {
      expect(ref.docSha).toBe("abc123");
      expect(ref.rawRef).toBe("raw/scan/cas/abc.pdf");
    }
    expect(refs[0]!.page).toBe(1);
  });

  it("honors includeImages / includeBlocks toggles", () => {
    const onlyBlocks = pdfOcrPagesToCitedSourceRefs(sidecar(), { includeImages: false });
    expect(onlyBlocks).toEqual([{ page: 1, bbox: [0, 0, 1, 0.05], excerpt: "Hello world" }]);
    const onlyImages = pdfOcrPagesToCitedSourceRefs(sidecar(), { includeBlocks: false });
    expect(onlyImages).toEqual([{ page: 1, bbox: [0.1, 0.1, 0.5, 0.5] }]);
  });
});
