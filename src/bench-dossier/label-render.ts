import { DS_VARS, escapeXml, fmtSvgNum, renderSvgText } from "./svg-primitives.js";
import type { LabelBox, LabelPart, LeaderSegment } from "./label-types.js";
import type { LabelTieFootnote } from "./label-text.js";
import type { ColumnPolyline } from "./label-column.js";
import { boxOverlapArea } from "./label-geometry.js";

export interface PlacedLabel {
  readonly clusterIndex: number;
  readonly mode: "greedy" | "column";
  readonly x: number;
  readonly y: number;
  readonly box: LabelBox;
  readonly textX: number;
  readonly textY: number;
  readonly displayText: string;
  readonly parts: readonly LabelPart[];
  readonly highlighted: boolean;
  readonly color: string;
  readonly tieCount: number;
  readonly tieFootnoteId: number | null;
  readonly tieNoteSuffix: string | null;
  readonly distance: number | null;
  readonly angleIndex: number | null;
  readonly leader: LeaderSegment | null;
  readonly columnPolyline: ColumnPolyline | null;
  readonly svg: string;
}

export interface PlaceLabelsResult {
  readonly labels: readonly PlacedLabel[];
  readonly tieFootnotes: readonly LabelTieFootnote[];
  readonly plotHeight: number;
  readonly rightMargin: number;
  readonly totalWidth: number;
  readonly columnX: number;
  readonly fallbackCount: number;
  readonly labelOverlaps: number;
  readonly markerOverlaps: number;
  readonly svg: string;
}

export function renderLabelXml(label: Omit<PlacedLabel, "svg">, fontSize: number): string {
  let leadSvg = "";
  if (label.leader) {
    leadSvg = `<path d="M${fmtSvgNum(label.leader.sx)} ${fmtSvgNum(label.leader.sy)}`
      + ` L${fmtSvgNum(label.leader.tx)} ${fmtSvgNum(label.leader.ty)}" fill="none"`
      + ` stroke="${escapeXml(label.color)}" stroke-width="1"/>`;
  } else if (label.columnPolyline) {
    const pointsAttr = label.columnPolyline
      .map(([pointX, pointY]) => `${fmtSvgNum(pointX)},${fmtSvgNum(pointY)}`)
      .join(" ");
    leadSvg = `<polyline points="${pointsAttr}" fill="none" stroke="${DS_VARS.textMuted}"`
      + ` stroke-width="0.8" opacity="0.7"/>`;
  }
  if (label.parts.length === 1) {
    return leadSvg + renderSvgText({
      x: label.textX,
      y: label.textY,
      text: label.displayText,
      fontSize,
      fill: label.color,
      anchor: "start",
      highlighted: label.highlighted,
    });
  }
  const inlineParts = label.tieNoteSuffix !== null ? label.parts.slice(0, 2) : label.parts;
  const separator = `<tspan fill="${DS_VARS.textSecondary}"> / </tspan>`;
  const suffix = label.tieNoteSuffix
    ? `<tspan fill="${DS_VARS.textSecondary}">${escapeXml(label.tieNoteSuffix)}</tspan>`
    : "";
  const spans = inlineParts
    .map((part) => `<tspan fill="${escapeXml(part.color)}">${escapeXml(part.text)}</tspan>`)
    .join(separator) + suffix;
  return `${leadSvg}<text x="${fmtSvgNum(label.textX)}" y="${fmtSvgNum(label.textY)}"`
    + ` font-size="${fmtSvgNum(fontSize)}" font-weight="${label.highlighted ? "700" : "400"}"`
    + ` text-anchor="start">${spans}</text>`;
}

/** Count pairwise label-box overlaps and label-vs-marker overlaps. */
export function auditLabelOverlaps(boxes: readonly LabelBox[], markerBoxes: readonly LabelBox[]) {
  let labelOverlaps = 0;
  let markerOverlaps = 0;
  for (let index = 0; index < boxes.length; index++) {
    for (let otherIndex = index + 1; otherIndex < boxes.length; otherIndex++) {
      if (boxOverlapArea(boxes[index]!, boxes[otherIndex]!) > 0) {
        labelOverlaps++;
      }
    }
    for (const marker of markerBoxes) {
      if (boxOverlapArea(boxes[index]!, marker) > 0) {
        markerOverlaps++;
      }
    }
  }
  return { labelOverlaps, markerOverlaps };
}
