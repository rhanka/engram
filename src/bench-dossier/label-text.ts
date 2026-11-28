import {
  failSvg,
  requireBool,
  requirePositiveNum,
} from "./svg-tokens.js";
import type {
  LabelPart,
  LabelPointInput,
  LabelTieFootnote,
  MergedLabelCluster,
} from "./label-types.js";

export type { LabelPart, LabelPointInput, LabelTieFootnote, MergedLabelCluster };
export * from "./label-ties.js";

export const DEFAULT_LABEL_FONT_SIZE = 11;
export const LABEL_BOX_PADDING_PX = 4;
export const LABEL_BOLD_WIDTH_FACTOR = 1.06;

const NARROW_CHARS = new Set("iljtI1.,:;'|! ");
const WIDE_CHARS = new Set("mwMW@%");
const UPPER_RE = /^[A-Z]$/;

/** Estimate label bounding-box width in px calibrated to Inter / DejaVu Sans plus 4 px padding. */
export function estimateTextWidthPx(
  text: string,
  fontSize = DEFAULT_LABEL_FONT_SIZE,
  bold = false,
): number {
  if (typeof text !== "string") {
    failSvg("WRONG_TYPE", "text");
  }
  const size = requirePositiveNum(fontSize, "fontSize");
  const isBold = requireBool(bold, "bold");
  let factorSum = 0;
  for (const character of text) {
    if (NARROW_CHARS.has(character)) {
      factorSum += 0.3;
    } else if (WIDE_CHARS.has(character)) {
      factorSum += 0.86;
    } else if (UPPER_RE.test(character)) {
      factorSum += 0.66;
    } else {
      factorSum += 0.57;
    }
  }
  return factorSum * size * (isBold ? LABEL_BOLD_WIDTH_FACTOR : 1) + LABEL_BOX_PADDING_PX;
}

/** Estimate label bounding-box width and height (fontSize + 4 px). */
export function estimateLabelBoxSize(
  text: string,
  fontSize = DEFAULT_LABEL_FONT_SIZE,
  bold = false,
): { readonly width: number; readonly height: number } {
  return {
    width: estimateTextWidthPx(text, fontSize, bold),
    height: fontSize + LABEL_BOX_PADDING_PX,
  };
}
