import { describe, expect, it } from "vitest";
import { SvgPrimitiveError, effortProgressionRank, resolveArmColor } from "../src/bench-dossier/svg-primitives.js";
import {
  DEFAULT_LABEL_FONT_SIZE, LABEL_BOLD_WIDTH_FACTOR, LABEL_BOX_PADDING_PX,
  estimateLabelBoxSize, estimateTextWidthPx,
} from "../src/bench-dossier/label-text.js";

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
});
