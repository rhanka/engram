import type { LabelBox, LabelLayout } from "./label-types.js";

export const LABEL_COLUMN_OFFSET_X = 18;
export const LABEL_COLUMN_LINE_GAP = 17;
export const LABEL_COLUMN_HEIGHT_PAD = 16;
export const LABEL_COLUMN_MARGIN_PAD = 28;

export type ColumnPolyline = readonly [
  readonly [number, number],
  readonly [number, number],
  readonly [number, number],
];

export interface ColumnFallbackInputItem {
  readonly clusterIndex: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ColumnFallbackPlaced {
  readonly clusterIndex: number;
  readonly box: LabelBox;
  readonly textX: number;
  readonly textY: number;
  readonly polyline: ColumnPolyline;
}

/** Place residual colliding labels in a sorted right-gutter leader column, expanding height and margin. */
export function placeRightGutterColumn(
  items: readonly ColumnFallbackInputItem[],
  layout: LabelLayout,
  fontSize: number,
) {
  const columnX = layout.ml + layout.baseIw + LABEL_COLUMN_OFFSET_X;
  if (items.length === 0) {
    return {
      placed: [] as ColumnFallbackPlaced[],
      plotHeight: layout.baseIh,
      rightMargin: layout.baseMr,
      columnX,
    };
  }
  const lineGap = Math.max(LABEL_COLUMN_LINE_GAP, Math.ceil(fontSize + 4));
  const topPad = Math.max(LABEL_COLUMN_HEIGHT_PAD, Math.ceil(lineGap / 2));
  const plotHeight = Math.max(layout.baseIh, items.length * lineGap + topPad);
  const maxWidth = Math.max(...items.map((item) => item.width));
  const rightMargin = Math.max(layout.baseMr, maxWidth + LABEL_COLUMN_MARGIN_PAD);
  const sorted = [...items].sort(
    (left, right) => (left.y - right.y) || (left.x - right.x) || (left.clusterIndex - right.clusterIndex),
  );
  const top = layout.mt + topPad;
  const bottom = layout.mt + plotHeight - lineGap;
  const lineYPositions = sorted.map((item) => item.y);
  for (let index = 0; index < lineYPositions.length; index++) {
    const floorY = index > 0 ? lineYPositions[index - 1]! + lineGap : top;
    lineYPositions[index] = Math.max(lineYPositions[index]!, floorY);
  }
  if (lineYPositions[lineYPositions.length - 1]! > bottom) {
    lineYPositions[lineYPositions.length - 1] = bottom;
    for (let index = lineYPositions.length - 2; index >= 0; index--) {
      lineYPositions[index] = Math.min(lineYPositions[index]!, lineYPositions[index + 1]! - lineGap);
    }
  }
  const placed = sorted.map((item, index): ColumnFallbackPlaced => {
    const labelY = lineYPositions[index]!;
    return {
      clusterIndex: item.clusterIndex,
      textX: columnX,
      textY: labelY + fontSize * 0.35,
      box: {
        x1: columnX - 2,
        y1: labelY - item.height / 2,
        x2: columnX - 2 + item.width,
        y2: labelY + item.height / 2,
      },
      polyline: [
        [item.x, item.y],
        [columnX - 14, labelY],
        [columnX - 4, labelY],
      ],
    };
  });
  return { placed, plotHeight, rightMargin, columnX };
}
