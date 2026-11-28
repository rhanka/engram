import { describe, expect, it } from "vitest";
import { SvgPrimitiveError, effortProgressionRank, resolveArmColor } from "../src/bench-dossier/svg-primitives.js";
import {
  DEFAULT_LABEL_FONT_SIZE, LABEL_BOLD_WIDTH_FACTOR, LABEL_BOX_PADDING_PX,
  estimateLabelBoxSize, estimateTextWidthPx,
} from "../src/bench-dossier/label-text.js";
import {
  DEFAULT_MARKER_RADIUS, LABEL_TIE_DELTA_PX, LABEL_TIE_INLINE_CAP, mergeCoincidentTies,
} from "../src/bench-dossier/label-ties.js";
import type { LabelPointInput } from "../src/bench-dossier/label-types.js";

function refuse(fn: () => unknown, code: string, path: string): void {
  let caught: unknown;
  try {
    fn();
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(SvgPrimitiveError);
  const err = caught as SvgPrimitiveError;
  expect([err.code, err.path]).toEqual([code, path]);
}

describe("BD-7 text-width model, capped tie-merging and dynamic column fallback", () => {

  it("estimates text widths for all glyph classes, Z bound, bold 1.06x and padding", () => {
    expect([DEFAULT_LABEL_FONT_SIZE, LABEL_BOX_PADDING_PX, LABEL_BOLD_WIDTH_FACTOR]).toEqual([11, 4, 1.06]);
    expect(estimateTextWidthPx("", 10, false)).toBe(4);
    expect(estimateTextWidthPx("iljtI1.,:;'|! ", 10, false)).toBeCloseTo(46, 12);
    expect(estimateTextWidthPx("mwMW@%", 10, false)).toBeCloseTo(55.6, 12);
    expect(estimateTextWidthPx("DZ", 10, false)).toBeCloseTo(17.2, 12);
    expect(estimateTextWidthPx("ABCDEFGHIJKLMNOPQRSTUVWXYZ", 10, false)).toBeCloseTo(176, 12);
    expect(estimateTextWidthPx("[abc02", 10, false)).toBeCloseTo(38.2, 12);
    expect(estimateTextWidthPx("IMWAima1.", 10, false)).toBeCloseTo(54.1, 12);
    expect(estimateTextWidthPx("IMWAima1.", 10, true)).toBeCloseTo(57.106, 12);
    expect(estimateTextWidthPx("Aa")).toBeCloseTo(17.53, 12);
    expect(estimateTextWidthPx("Aa", undefined, undefined)).toBeCloseTo(17.53, 12);
    expect(estimateTextWidthPx("Aa", 12, true)).toBeCloseTo(19.6456, 12);
    expect(estimateLabelBoxSize("Aa")).toEqual({ width: 17.53, height: 15 });
    expect(estimateLabelBoxSize("Aa", 12, true)).toEqual({ width: 19.6456, height: 16 });
    refuse(() => estimateTextWidthPx(null as never, 10, false), "WRONG_TYPE", "text");
    refuse(() => estimateTextWidthPx(12 as never, 10, false), "WRONG_TYPE", "text");
    refuse(() => estimateTextWidthPx("Aa", 0, false), "NON_POSITIVE", "fontSize");
    refuse(() => estimateTextWidthPx("Aa", -5, false), "NON_POSITIVE", "fontSize");
    refuse(() => estimateTextWidthPx("Aa", Number.NaN, false), "BAD_NUMBER", "fontSize");
    refuse(() => estimateTextWidthPx("Aa", null as never, false), "BAD_NUMBER", "fontSize");
    refuse(() => estimateTextWidthPx("Aa", "unknown" as never, false), "BAD_NUMBER", "fontSize");
    refuse(() => estimateTextWidthPx("Aa", 10, null as never), "WRONG_TYPE", "bold");
    refuse(() => estimateTextWidthPx("Aa", 10, "unknown" as never), "WRONG_TYPE", "bold");
  });

  it("merges coincident points (<1 px on both axes), caps at 3 inline and numbers dual footnotes", () => {
    const pt = (text: string, x = 100, y = 200, extra: Partial<LabelPointInput> = {}): LabelPointInput =>
      ({ x, y, text, color: "#4E79A7", ...extra });
    expect(mergeCoincidentTies([])).toEqual({ clusters: [], tieFootnotes: [] });
    expect(mergeCoincidentTies([pt("A", 100, 200, { radius: 9 }), pt("B"), pt("C")]).clusters[0]).toEqual({
      clusterIndex: 0, x: 100, y: 200, color: "#4E79A7", highlighted: false, radius: 9, priority: 0,
      displayText: "A / B / C", parts: [
        { text: "A", color: "#4E79A7", highlighted: false }, { text: "B", color: "#4E79A7", highlighted: false },
        { text: "C", color: "#4E79A7", highlighted: false }], tieCount: 3, tieFootnoteId: null, tieNoteSuffix: null,
    });
    const dual = mergeCoincidentTies([
      pt("Low", 50, 60, { color: "#111", priority: 0 }), pt("Top", 50.5, 60.5, { color: "#222", priority: 2 }),
      pt("Bold", 50, 60, { color: "#333", highlighted: true }), pt("Fourth", 50, 60, { color: "#444" }),
      pt("B1", 150, 160, { color: "#555" }), pt("B2", 150, 160, { color: "#666" }),
      pt("B3", 150, 160, { color: "#777" }), pt("B4", 150, 160, { color: "#888" }),
      pt("B5", 150, 160, { color: "#999" }),
    ]);
    expect(dual.clusters[0]).toEqual({
      clusterIndex: 0, x: 50, y: 60, color: "#222", highlighted: true, radius: 6, priority: 2,
      displayText: "Top / Bold (+2 tied, see #1)", tieCount: 4, tieFootnoteId: 1,
      tieNoteSuffix: " (+2 tied, see #1)", parts: [
        { text: "Top", color: "#222", highlighted: false }, { text: "Bold", color: "#333", highlighted: true },
        { text: "Low", color: "#111", highlighted: false }, { text: "Fourth", color: "#444", highlighted: false }],
    });
    expect(dual.clusters[1]?.clusterIndex).toBe(1);
    expect([dual.clusters[1]?.displayText, dual.clusters[1]?.tieFootnoteId]).toEqual(["B1 / B2 (+3 tied, see #2)", 2]);
    expect(dual.tieFootnotes).toEqual([
      { id: 1, tag: "#1", names: ["Top", "Bold", "Low", "Fourth"], items: dual.clusters[0]!.parts,
        text: "#1: Top / Bold / Low / Fourth" },
      { id: 2, tag: "#2", names: ["B1", "B2", "B3", "B4", "B5"], items: dual.clusters[1]!.parts,
        text: "#2: B1 / B2 / B3 / B4 / B5" },
    ]);
  });
});
