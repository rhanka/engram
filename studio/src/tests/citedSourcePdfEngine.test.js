import { describe, expect, it } from "vitest";

import { computeHighlightRects } from "../lib/cited-source/pdfEngine.js";

/**
 * Pure geometry half of the pdf.js engine: quote -> text-layer rects. Verifies
 * the radar #82 space split (position via viewport.transform, dimensions via
 * renderScale) without loading pdf.js (computeHighlightRects is plain math).
 */
describe("cited-source pdfEngine.computeHighlightRects", () => {
  const scale = 2;
  const pageHeight = 100; // PDF-space page height
  // pdf.js viewport transform for scale s, top-left origin flip:
  // [s, 0, 0, -s, 0, s*pageHeight]
  const viewport = {
    transform: [scale, 0, 0, -scale, 0, scale * pageHeight],
    width: 200 * scale,
    height: pageHeight * scale,
  };
  // Two items on one text line at PDF y=50: "the coronet had" + "vanished tonight".
  const content = {
    items: [
      { str: "the coronet had", transform: [10, 0, 0, 10, 10, 50], width: 60, height: 10 },
      { str: "vanished tonight", transform: [10, 0, 0, 10, 75, 50], width: 64, height: 10 },
      { type: "marked-content" }, // ignored (no str)
    ],
  };

  it("emits one rect per overlapping item, scaled correctly", () => {
    const { rects, coverage } = computeHighlightRects(
      content,
      viewport,
      scale,
      "the coronet had vanished tonight",
      { minWords: 3, minCoverage: 0.4 },
    );
    expect(coverage).toBe(1);
    expect(rects).toHaveLength(2);
    // First item: tx = s*e = 2*10 = 20; ty = -s*f + s*H = 2*(100-50) = 100.
    // fontHeight = |d| * s = 10*2 = 20 -> top = ty - fontHeight = 80.
    expect(rects[0].left).toBeCloseTo(20);
    expect(rects[0].top).toBeCloseTo(80);
    expect(rects[0].width).toBeCloseTo(60 * scale);
    expect(rects[0].height).toBeCloseTo(20 * 1.15);
    // Second item starts at e=75 -> left 150.
    expect(rects[1].left).toBeCloseTo(150);
  });

  it("returns no rects when the quote is not on the page", () => {
    const { rects, coverage } = computeHighlightRects(
      content,
      viewport,
      scale,
      "an entirely different passage about spacecraft telemetry frames",
    );
    expect(rects).toEqual([]);
    expect(coverage).toBe(0);
  });
});
