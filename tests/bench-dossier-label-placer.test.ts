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
import { boxOverlapArea, computeLeader, markerBox, sampleSegmentBoxes } from "../src/bench-dossier/label-geometry.js";
import {
  LABEL_COLUMN_HEIGHT_PAD, LABEL_COLUMN_LINE_GAP, LABEL_COLUMN_MARGIN_PAD, LABEL_COLUMN_OFFSET_X,
  placeRightGutterColumn,
} from "../src/bench-dossier/label-column.js";
import { GREEDY_ANGLE_COUNT, GREEDY_DISTANCES, findBestGreedyPlacement } from "../src/bench-dossier/label-greedy.js";
import { auditLabelOverlaps, renderLabelXml } from "../src/bench-dossier/label-render.js";
import { parsePlaceLabelsInput } from "../src/bench-dossier/label-input.js";
import { DENSITY_RADIUS_PX, MARKER_HALO_PX, placeChartLabels } from "../src/bench-dossier/label-placer.js";

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
    refuse(() => estimateLabelBoxSize("Aa", null as never, false), "BAD_NUMBER", "fontSize");
    refuse(() => estimateLabelBoxSize("Aa", 10, null as never), "WRONG_TYPE", "bold");
  });

  it("merges coincident points (<1 px on both axes), caps at 3 inline and numbers dual footnotes", () => {
    const pt = (text: string, x = 100, y = 200, extra: Partial<LabelPointInput> = {}): LabelPointInput =>
      ({ x, y, text, color: "#4E79A7", ...extra });
    expect(mergeCoincidentTies([])).toEqual({ clusters: [], tieFootnotes: [] });
    expect(mergeCoincidentTies([pt("A"), pt("B", 100, 200, { radius: 9 }), pt("C", 100, 200, { radius: 7 })])
      .clusters[0]).toEqual({
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
      {
        id: 1, tag: "#1", names: ["Top", "Bold", "Low", "Fourth"],
        items: [
          { text: "Top", color: "#222", highlighted: false },
          { text: "Bold", color: "#333", highlighted: true },
          { text: "Low", color: "#111", highlighted: false },
          { text: "Fourth", color: "#444", highlighted: false },
        ],
        text: "#1: Top / Bold / Low / Fourth",
      },
      {
        id: 2, tag: "#2", names: ["B1", "B2", "B3", "B4", "B5"],
        items: [
          { text: "B1", color: "#555", highlighted: false },
          { text: "B2", color: "#666", highlighted: false },
          { text: "B3", color: "#777", highlighted: false },
          { text: "B4", color: "#888", highlighted: false },
          { text: "B5", color: "#999", highlighted: false },
        ],
        text: "#2: B1 / B2 / B3 / B4 / B5",
      },
    ]);
  });

  it("validates mergeCoincidentTies boundaries, 4-form defaults, tie-breakers and path prefixes", () => {
    expect([DEFAULT_MARKER_RADIUS, LABEL_TIE_INLINE_CAP, LABEL_TIE_DELTA_PX]).toEqual([6, 3, 1]);
    const pt = (text: string, x = 10, y = 20, extra: Partial<LabelPointInput> = {}): LabelPointInput =>
      ({ x, y, text, color: "#4E79A7", ...extra });
    expect(mergeCoincidentTies([pt("A", 100, 200), pt("B", 100.99, 199.01)]).clusters[0]).toEqual({
      clusterIndex: 0, x: 100, y: 200, color: "#4E79A7", highlighted: false, radius: 6, priority: 0,
      displayText: "A / B", parts: [{ text: "A", color: "#4E79A7", highlighted: false },
        { text: "B", color: "#4E79A7", highlighted: false }], tieCount: 2, tieFootnoteId: null, tieNoteSuffix: null,
    });
    const bound = mergeCoincidentTies([pt("A", 10, 20), pt("X1", 11, 20), pt("Y1", 10, 21),
      pt("XNeg", 9, 20), pt("YNeg", 10, 19), pt("Chain", 10.6, 20), pt("Far", 11.2, 20)]);
    expect(bound.clusters.map((item) => item.displayText)).toEqual(["A / Chain", "X1 / Far", "Y1", "XNeg", "YNeg"]);
    const tieSort = mergeCoincidentTies([
      pt("H1", 10, 20, { color: "#111", highlighted: true }),
      pt("H2", 10, 20, { color: "#222", highlighted: true }),
      pt("P0", 10, 20, { color: "#333", highlighted: false }),
    ]);
    expect(tieSort.clusters[0]?.parts.map((part) => part.text)).toEqual(["H1", "H2", "P0"]);
    const forms = mergeCoincidentTies([
      pt("Absent", 10, 20),
      pt("Undef", 30, 40, { highlighted: undefined, radius: undefined, priority: undefined }),
      pt("Explicit", 50, 60, { highlighted: true, radius: 11, priority: 4 }),
    ]);
    expect(forms.clusters.map((c) => [c.highlighted, c.radius, c.priority])).toEqual([
      [false, 6, 0], [false, 6, 0], [true, 11, 4],
    ]);
    refuse(() => mergeCoincidentTies(null as never), "NOT_ARRAY", "points");
    refuse(() => mergeCoincidentTies("unknown" as never), "NOT_ARRAY", "points");
    refuse(() => mergeCoincidentTies(null as never, "custom.points"), "NOT_ARRAY", "custom.points");
    refuse(() => mergeCoincidentTies([null as never]), "NOT_OBJECT", "points[0]");
    refuse(() => mergeCoincidentTies([pt("Ok"), null as never]), "NOT_OBJECT", "points[1]");
    refuse(() => mergeCoincidentTies([pt("A", Number.NaN, 1)], "custom.points"), "BAD_NUMBER", "custom.points[0].x");
    for (const [bad, code, path] of [
      [[pt("A", Number.NaN, 1)], "BAD_NUMBER", "points[0].x"],
      [[pt("Ok"), pt("A", Number.NaN, 1)], "BAD_NUMBER", "points[1].x"],
      [[pt("A", 1, Number.POSITIVE_INFINITY)], "BAD_NUMBER", "points[0].y"],
      [[pt("", 1, 2)], "EMPTY_STRING", "points[0].text"],
      [[pt("A", 1, 2, { color: "" })], "EMPTY_STRING", "points[0].color"],
      [[pt("A", 1, 2, { highlighted: null as never })], "WRONG_TYPE", "points[0].highlighted"],
      [[pt("A", 1, 2, { highlighted: "unknown" as never })], "WRONG_TYPE", "points[0].highlighted"],
      [[pt("A", 1, 2, { radius: 0 })], "NON_POSITIVE", "points[0].radius"],
      [[pt("A", 1, 2, { radius: null as never })], "BAD_NUMBER", "points[0].radius"],
      [[pt("A", 1, 2, { radius: "unknown" as never })], "BAD_NUMBER", "points[0].radius"],
      [[pt("A", 1, 2, { priority: Number.NaN })], "BAD_NUMBER", "points[0].priority"],
      [[pt("A", 1, 2, { priority: null as never })], "BAD_NUMBER", "points[0].priority"],
      [[pt("A", 1, 2, { priority: "unknown" as never })], "BAD_NUMBER", "points[0].priority"],
    ] as const) {
      refuse(() => mergeCoincidentTies(bad), code, path);
    }
  });

  it("computes box overlap, marker boxes, diagonal leaders and diagonal segment boxes", () => {
    const boxA = { x1: 10, y1: 20, x2: 30, y2: 40 };
    expect(boxOverlapArea(boxA, { x1: 30, y1: 20, x2: 50, y2: 40 })).toBe(0);
    expect(boxOverlapArea(boxA, { x1: 26, y1: 37, x2: 40, y2: 50 })).toBe(12);
    expect(markerBox(100, 50, 6)).toEqual({ x1: 94, y1: 44, x2: 106, y2: 56 });
    expect(computeLeader(100, 100, 6, { x1: 110, y1: 95, x2: 130, y2: 105 })).toBeNull();
    expect(computeLeader(100, 100, 6, { x1: 111, y1: 93, x2: 128.2, y2: 107 })).toEqual({
      sx: 107.5, sy: 100, tx: 111, ty: 100, length: 11,
    });
    expect(computeLeader(100, 100, 6, { x1: 112, y1: 107, x2: 132, y2: 121 })).toEqual({
      sx: 106, sy: 104.5, tx: 112, ty: 109, length: 15,
    });
    expect(computeLeader(100, 125, 6, { x1: 112, y1: 97, x2: 132, y2: 111 })).toEqual({
      sx: 104.5, sy: 119, tx: 112, ty: 109, length: 20,
    });
    expect(computeLeader(140, 100, 6, { x1: 112, y1: 95, x2: 128, y2: 105 })).toEqual({
      sx: 132.5, sy: 100, tx: 128, ty: 100, length: 12,
    });
    expect(sampleSegmentBoxes(0, 0, 0, 0)).toEqual([
      { x1: -1.5, y1: -1.5, x2: 1.5, y2: 1.5 },
      { x1: -1.5, y1: -1.5, x2: 1.5, y2: 1.5 },
    ]);
    expect(sampleSegmentBoxes(0, 0, 6, 8, 5)).toEqual([
      { x1: -1.5, y1: -1.5, x2: 1.5, y2: 1.5 },
      { x1: 1.5, y1: 2.5, x2: 4.5, y2: 5.5 },
      { x1: 4.5, y1: 6.5, x2: 7.5, y2: 9.5 },
    ]);
    expect(sampleSegmentBoxes(0, 0, 12, 16)).toEqual([
      { x1: -1.5, y1: -1.5, x2: 1.5, y2: 1.5 },
      { x1: 1.5, y1: 2.5, x2: 4.5, y2: 5.5 },
      { x1: 4.5, y1: 6.5, x2: 7.5, y2: 9.5 },
      { x1: 7.5, y1: 10.5, x2: 10.5, y2: 13.5 },
      { x1: 10.5, y1: 14.5, x2: 13.5, y2: 17.5 },
    ]);
  });

  it("places right-gutter column fallback with dynamic scaling, top clamp and sort tie-breakers", () => {
    expect([
      LABEL_COLUMN_OFFSET_X, LABEL_COLUMN_LINE_GAP, LABEL_COLUMN_HEIGHT_PAD, LABEL_COLUMN_MARGIN_PAD,
    ]).toEqual([18, 17, 16, 28]);
    const emptyCol = placeRightGutterColumn([], { ml: 50, mt: 20, baseIw: 400, baseIh: 10, baseMr: 5 }, 11);
    expect(emptyCol).toEqual({ placed: [], plotHeight: 10, rightMargin: 5, columnX: 468 });
    const topItem = placeRightGutterColumn(
      [{ clusterIndex: 0, x: 100, y: 0, width: 40, height: 15 }],
      { ml: 10, mt: 30, baseIw: 100, baseIh: 200, baseMr: 90 },
      11,
    );
    expect([topItem.plotHeight, topItem.rightMargin, topItem.columnX]).toEqual([200, 90, 128]);
    expect(topItem.placed[0]).toEqual({
      clusterIndex: 0, textX: 128, textY: 49.85,
      box: { x1: 126, y1: 38.5, x2: 166, y2: 53.5 }, polyline: [[100, 0], [114, 46], [124, 46]],
    });
    const gap135 = placeRightGutterColumn(
      [
        { clusterIndex: 5, x: 100, y: 0, width: 40, height: 17.5 },
        { clusterIndex: 2, x: 100, y: 0, width: 40, height: 17.5 },
        { clusterIndex: 9, x: 90, y: 0, width: 40, height: 17.5 },
      ],
      { ml: 50, mt: 30, baseIw: 100, baseIh: 10, baseMr: 10 },
      13.5,
    );
    expect([gap135.plotHeight, gap135.rightMargin]).toEqual([70, 68]);
    expect(gap135.placed.map((p) => p.clusterIndex)).toEqual([9, 2, 5]);
    expect(gap135.placed[1]?.polyline).toEqual([[100, 0], [154, 64], [164, 64]]);
    const col30 = placeRightGutterColumn(
      [
        { clusterIndex: 0, x: 100, y: 0, width: 40, height: 34 },
        { clusterIndex: 1, x: 100, y: 0, width: 40, height: 34 },
      ],
      { ml: 50, mt: 20, baseIw: 100, baseIh: 10, baseMr: 20 },
      30,
    );
    expect([col30.plotHeight, col30.placed[0]!.box.y1, col30.placed[1]!.box.y2]).toEqual([85, 20, 88]);
    const items = Array.from({ length: 30 }, (_, i) => ({
      clusterIndex: i, x: 200 + (i % 3), y: 140 - (i % 2), width: 60 + (i === 7 ? 32 : 0), height: 15,
    }));
    const col = placeRightGutterColumn(items, { ml: 78, mt: 30, baseIw: 600, baseIh: 120, baseMr: 30 }, 11);
    expect([col.columnX, col.plotHeight, col.rightMargin, col.placed.length]).toEqual([696, 526, 120, 30]);
    expect(col.placed[0]).toEqual({
      clusterIndex: 3, textX: 696, textY: 49.85,
      box: { x1: 694, y1: 38.5, x2: 754, y2: 53.5 }, polyline: [[200, 139], [682, 46], [692, 46]],
    });
    expect([col.placed[0]!.box.y1, col.placed[29]!.box.y2]).toEqual([38.5, 546.5]);
    for (let i = 0; i < col.placed.length; i++) {
      for (let j = i + 1; j < col.placed.length; j++) {
        expect(boxOverlapArea(col.placed[i]!.box, col.placed[j]!.box)).toBe(0);
      }
    }
  });

  it("evaluates 24x9 greedy placement, all 9 distance rings and cost penalties", () => {
    expect(GREEDY_DISTANCES).toEqual([5, 11, 18, 26, 36, 48, 62, 78, 96]);
    expect(GREEDY_ANGLE_COUNT).toBe(24);
    const frame = { x1: 50, y1: 20, x2: 500, y2: 400 };
    const clear = findBestGreedyPlacement({
      x: 200, y: 200, radius: 6, width: 17.2, height: 14, ownMarkerIndex: 0, frame,
      placedBoxes: [], markerBoxes: [markerBox(200, 200, 6)], haloBoxes: [markerBox(200, 200, 13)],
      lineDots: [], leaderDots: [],
    });
    expect(clear).toEqual({
      box: { x1: 211, y1: 193, x2: 228.2, y2: 207 }, distance: 5, angleIndex: 0, cost: 4.5,
      leader: { sx: 207.5, sy: 200, tx: 211, ty: 200, length: 11 },
    });
    const ownLeader = findBestGreedyPlacement({
      x: 200, y: 200, radius: 6, width: 17.2, height: 14, ownMarkerIndex: 0, frame,
      placedBoxes: [{ x1: 211, y1: 193, x2: 228.2, y2: 207 }], markerBoxes: [markerBox(200, 200, 6)],
      haloBoxes: [null], lineDots: [], leaderDots: [],
    });
    expect([ownLeader?.distance, ownLeader?.angleIndex, ownLeader?.cost]).toEqual([5, 3, 4.5]);
    const avoidHalo = findBestGreedyPlacement({
      x: 200, y: 200, radius: 6, width: 17.2, height: 14, ownMarkerIndex: 0, frame,
      placedBoxes: [], markerBoxes: [markerBox(200, 200, 6), markerBox(236, 200, 6)],
      haloBoxes: [markerBox(200, 200, 13), markerBox(236, 200, 13)], lineDots: [], leaderDots: [],
    });
    expect([avoidHalo?.distance, avoidHalo?.angleIndex, Number(avoidHalo?.box.x1.toFixed(1))]).toEqual([5, 4, 205.5]);
    const dots = sampleSegmentBoxes(208, 200, 235, 200);
    const avoidLine = findBestGreedyPlacement({
      x: 200, y: 200, radius: 6, width: 17.2, height: 14, ownMarkerIndex: 0, frame,
      placedBoxes: [], markerBoxes: [markerBox(200, 200, 6)], haloBoxes: [null], lineDots: dots, leaderDots: [],
    });
    const avoidLeader = findBestGreedyPlacement({
      x: 200, y: 200, radius: 6, width: 17.2, height: 14, ownMarkerIndex: 0, frame,
      placedBoxes: [], markerBoxes: [markerBox(200, 200, 6)], haloBoxes: [null], lineDots: [], leaderDots: dots,
    });
    expect([avoidLine?.angleIndex, avoidLeader?.angleIndex]).toEqual([2, 2]);
    const leadPlaced = findBestGreedyPlacement({
      x: 200, y: 200, radius: 6, width: 12, height: 14, ownMarkerIndex: 0,
      frame: { x1: 150, y1: 192, x2: 300, y2: 208 },
      placedBoxes: [{ x1: 208, y1: 198, x2: 210, y2: 202 }],
      markerBoxes: [markerBox(200, 200, 6)], haloBoxes: [null], lineDots: [], leaderDots: [],
    });
    expect([leadPlaced?.distance, leadPlaced?.angleIndex]).toEqual([5, 12]);
    const leadMarker = findBestGreedyPlacement({
      x: 200, y: 200, radius: 6, width: 12, height: 14, ownMarkerIndex: 0,
      frame: { x1: 150, y1: 192, x2: 300, y2: 208 }, placedBoxes: [],
      markerBoxes: [markerBox(200, 200, 6), { x1: 208, y1: 198, x2: 210, y2: 202 }],
      haloBoxes: [null, null], lineDots: [], leaderDots: [],
    });
    expect([leadMarker?.distance, leadMarker?.angleIndex]).toEqual([5, 12]);
    const expectedRings = [
      [121, 5, 121], [122, 11, 127], [128, 18, 134], [135, 26, 142],
      [143, 36, 152], [153, 48, 164], [165, 62, 178], [179, 78, 194], [195, 96, 212],
    ] as const;
    for (const [obsEnd, expectedDist, expectedX1] of expectedRings) {
      const placed = findBestGreedyPlacement({
        x: 110, y: 45, radius: 6, width: 20, height: 14, ownMarkerIndex: 0,
        frame: { x1: 100, y1: 38, x2: 300, y2: 52 },
        placedBoxes: [{ x1: 120, y1: 38, x2: obsEnd, y2: 41 }],
        markerBoxes: [markerBox(110, 45, 6)], haloBoxes: [null], lineDots: [], leaderDots: [],
      });
      expect([placed?.distance, placed?.angleIndex, placed?.box.x1]).toEqual([expectedDist, 0, expectedX1]);
    }
  });

  it("enforces all 4 frame edges, cos/sin centering, hard skips and d=96/k=23 limits", () => {
    const baseCtx = {
      x: 200, y: 200, radius: 6, width: 20, height: 14, ownMarkerIndex: 0,
      markerBoxes: [markerBox(200, 200, 6)], haloBoxes: [null], lineDots: [], leaderDots: [],
    };
    const leftEdge = findBestGreedyPlacement({
      ...baseCtx, frame: { x1: 190, y1: 170, x2: 240, y2: 230 },
      placedBoxes: [{ x1: 211, y1: 170, x2: 240, y2: 230 }],
    });
    expect([leftEdge?.distance, leftEdge?.angleIndex, leftEdge?.box]).toEqual([
      5, 6, { x1: 190, y1: 211, x2: 210, y2: 225 },
    ]);
    const rightEdge = findBestGreedyPlacement({
      ...baseCtx, frame: { x1: 170, y1: 170, x2: 215, y2: 230 }, placedBoxes: [],
    });
    expect([rightEdge?.distance, rightEdge?.angleIndex]).toEqual([5, 5]);
    const rightTouch = findBestGreedyPlacement({
      ...baseCtx, frame: { x1: 180, y1: 170, x2: 231, y2: 230 }, placedBoxes: [],
    });
    expect([rightTouch?.distance, rightTouch?.angleIndex, rightTouch?.box]).toEqual([
      5, 0, { x1: 211, y1: 193, x2: 231, y2: 207 },
    ]);
    const topEdge = findBestGreedyPlacement({
      ...baseCtx, frame: { x1: 170, y1: 195, x2: 240, y2: 230 },
      placedBoxes: [{ x1: 208, y1: 190, x2: 240, y2: 230 }],
    });
    expect([topEdge?.distance, topEdge?.angleIndex]).toEqual([5, 7]);
    const bottomEdge = findBestGreedyPlacement({
      ...baseCtx, frame: { x1: 170, y1: 170, x2: 240, y2: 205 },
      placedBoxes: [{ x1: 208, y1: 170, x2: 240, y2: 205 }],
    });
    expect([bottomEdge?.distance, bottomEdge?.angleIndex]).toEqual([5, 14]);
    const ringCtx = (obsRadius: number) => ({
      x: 110, y: 45, radius: 6, width: 20, height: 14, ownMarkerIndex: 0,
      frame: { x1: 100, y1: 30, x2: 300, y2: 60 }, placedBoxes: [],
      markerBoxes: [markerBox(110, 45, 6), markerBox(158, 45, obsRadius)],
      haloBoxes: [null, null], lineDots: [], leaderDots: [],
    });
    expect(findBestGreedyPlacement(ringCtx(45))).toEqual({
      box: { x1: 212, y1: 38, x2: 232, y2: 52 }, distance: 96, angleIndex: 0, cost: 2077.65,
      leader: { sx: 117.5, sy: 45, tx: 212, ty: 45, length: 102 },
    });
    expect(findBestGreedyPlacement(ringCtx(55))).toBeNull();
    const angCtx = (x2: number) => ({
      x: 200, y: 200, radius: 6, width: 12, height: 14, ownMarkerIndex: 0,
      frame: { x1: 190, y1: 188, x2, y2: 205 }, placedBoxes: [],
      markerBoxes: [markerBox(200, 200, 6)], haloBoxes: [null], lineDots: [], leaderDots: [],
    });
    expect([findBestGreedyPlacement(angCtx(222.8))?.distance, findBestGreedyPlacement(angCtx(222.8))?.angleIndex])
      .toEqual([5, 23]);
    expect(findBestGreedyPlacement(angCtx(222.5))).toBeNull();
    expect(findBestGreedyPlacement({
      x: 200, y: 200, radius: 6, width: 20, height: 14, ownMarkerIndex: 0,
      frame: { x1: 195, y1: 190, x2: 240, y2: 215 }, placedBoxes: [{ x1: 210, y1: 190, x2: 240, y2: 215 }],
      markerBoxes: [markerBox(200, 200, 6)], haloBoxes: [null], lineDots: [], leaderDots: [],
    })).toBeNull();
    const k5 = findBestGreedyPlacement({
      x: 200, y: 200, radius: 6, width: 12, height: 14, ownMarkerIndex: 0,
      frame: { x1: 195, y1: 195, x2: 211, y2: 235 }, placedBoxes: [],
      markerBoxes: [markerBox(200, 200, 6)], haloBoxes: [null], lineDots: [], leaderDots: [],
    });
    expect(k5?.angleIndex).toBe(5);
    expect(k5?.box.x1).toBeCloseTo(196.847, 2);
  });

  it("audits overlaps and renders single highlighted XML-escaped SVG", () => {
    expect(auditLabelOverlaps(
      [{ x1: 0, y1: 0, x2: 10, y2: 10 }, { x1: 5, y1: 5, x2: 15, y2: 15 }],
      [{ x1: 0, y1: 0, x2: 4, y2: 4 }],
    )).toEqual({ labelOverlaps: 1, markerOverlaps: 1 });
    expect(renderLabelXml({
      clusterIndex: 0, mode: "greedy", x: 100, y: 100,
      box: { x1: 111, y1: 93, x2: 130, y2: 107 }, textX: 113, textY: 103.5,
      displayText: "A&B", parts: [{ text: "A&B", color: 'c"1', highlighted: true }],
      highlighted: true, color: 'c"1', tieCount: 1, tieFootnoteId: null, tieNoteSuffix: null,
      distance: 5, angleIndex: 0, leader: { sx: 107.5, sy: 100, tx: 111, ty: 100, length: 11 },
      columnPolyline: null,
    }, 12)).toBe(
      '<path d="M107.5 100 L111 100" fill="none" stroke="c&quot;1" stroke-width="1"/>'
      + '<text x="113" y="103.5" font-size="12" font-weight="700" text-anchor="start" fill="c&quot;1">A&amp;B</text>',
    );
  });

  it("renders multi-part tie and column polyline SVG with DS tokens and escaping", () => {
    expect(renderLabelXml({
      clusterIndex: 1, mode: "column", x: 50, y: 60,
      box: { x1: 200, y1: 30, x2: 300, y2: 45 }, textX: 202, textY: 41.85,
      displayText: "A / B (+2 tied, see #1)", parts: [
        { text: "A<1>", color: 'c"1', highlighted: false }, { text: "B&2", color: "c'2", highlighted: false },
        { text: "C", color: "#333", highlighted: false }, { text: "D", color: "#444", highlighted: false },
      ],
      highlighted: false, color: 'c"1', tieCount: 4, tieFootnoteId: 1, tieNoteSuffix: " (+2 tied, see #1)",
      distance: null, angleIndex: null, leader: null, columnPolyline: [[50, 60], [188, 38], [198, 38]],
    }, 11)).toBe(
      '<polyline points="50,60 188,38 198,38" fill="none" stroke="var(--st-semantic-text-muted, #64748b)"'
      + ' stroke-width="0.8" opacity="0.7"/><text x="202" y="41.85" font-size="11" font-weight="400"'
      + ' text-anchor="start"><tspan fill="c&quot;1">A&lt;1&gt;</tspan>'
      + '<tspan fill="var(--st-semantic-text-secondary, #475569)"> / </tspan>'
      + '<tspan fill="c&#39;2">B&amp;2</tspan>'
      + '<tspan fill="var(--st-semantic-text-secondary, #475569)"> (+2 tied, see #1)</tspan></text>',
    );
  });

  it("validates placeChartLabels layout symmetry, optional arrays and 4-form input guards", () => {
    const layout = { ml: 78, mt: 30, baseIw: 400, baseIh: 120, baseMr: 30 };
    const pt = { x: 200, y: 80, text: "P", color: "#111" };
    const zeroMargins = parsePlaceLabelsInput({
      layout: { ml: 0, mt: 0, baseIw: 100, baseIh: 100, baseMr: 0 }, points: [],
    });
    expect([zeroMargins.layout, zeroMargins.fontSize]).toEqual([
      { ml: 0, mt: 0, baseIw: 100, baseIh: 100, baseMr: 0 }, 11,
    ]);
    const undInput = parsePlaceLabelsInput({
      layout,
      points: [{ ...pt, highlighted: undefined, radius: undefined, priority: undefined }],
      fontSize: undefined,
      obstacles: [{ x: 10, y: 20 }, { x: 30, y: 40, radius: undefined }],
      segments: undefined,
    });
    expect([undInput.fontSize, undInput.obstacles, undInput.segments]).toEqual([
      11, [{ x: 10, y: 20, radius: 6 }, { x: 30, y: 40, radius: 6 }], [],
    ]);
    const obsUndef = parsePlaceLabelsInput({ layout, points: [], obstacles: undefined, segments: undefined });
    expect([obsUndef.obstacles, obsUndef.segments]).toEqual([[], []]);
    for (const [badInput, code, path] of [
      [null, "NOT_OBJECT", "input"],
      [{ layout: null, points: [] }, "NOT_OBJECT", "input.layout"],
      [{ layout: { ...layout, ml: Number.NaN }, points: [] }, "BAD_NUMBER", "input.layout.ml"],
      [{ layout: { ...layout, ml: -0.1 }, points: [] }, "BAD_NUMBER", "input.layout.ml"],
      [{ layout: { ...layout, mt: Number.POSITIVE_INFINITY }, points: [] }, "BAD_NUMBER", "input.layout.mt"],
      [{ layout: { ...layout, mt: -0.1 }, points: [] }, "BAD_NUMBER", "input.layout.mt"],
      [{ layout: { ...layout, baseIw: 0 }, points: [] }, "NON_POSITIVE", "input.layout.baseIw"],
      [{ layout: { ...layout, baseIh: -1 }, points: [] }, "NON_POSITIVE", "input.layout.baseIh"],
      [{ layout: { ...layout, baseMr: -0.1 }, points: [] }, "BAD_NUMBER", "input.layout.baseMr"],
      [{ layout: { ...layout, baseMr: Number.NaN }, points: [] }, "BAD_NUMBER", "input.layout.baseMr"],
      [{ layout, points: [], fontSize: null }, "BAD_NUMBER", "input.fontSize"],
      [{ layout, points: [], fontSize: "unknown" }, "BAD_NUMBER", "input.fontSize"],
      [{ layout, points: [], fontSize: 0 }, "NON_POSITIVE", "input.fontSize"],
      [{ layout, points: null }, "NOT_ARRAY", "input.points"],
      [{ layout, points: "unknown" }, "NOT_ARRAY", "input.points"],
      [{ layout, points: [null] }, "NOT_OBJECT", "input.points[0]"],
      [{ layout, points: [{ ...pt, x: Number.NaN }] }, "BAD_NUMBER", "input.points[0].x"],
      [{ layout, points: [pt, { ...pt, x: Number.NaN }] }, "BAD_NUMBER", "input.points[1].x"],
      [{ layout, points: [], obstacles: null }, "NOT_ARRAY", "input.obstacles"],
      [{ layout, points: [], obstacles: "unknown" }, "NOT_ARRAY", "input.obstacles"],
      [{ layout, points: [], obstacles: [null] }, "NOT_OBJECT", "input.obstacles[0]"],
      [{ layout, points: [], obstacles: [{ x: Number.NaN, y: 1 }] }, "BAD_NUMBER", "input.obstacles[0].x"],
      [{ layout, points: [], obstacles: [{ x: 1, y: 1 }, { x: Number.NaN, y: 1 }] },
        "BAD_NUMBER", "input.obstacles[1].x"],
      [{ layout, points: [], obstacles: [{ x: 1, y: Number.NaN }] }, "BAD_NUMBER", "input.obstacles[0].y"],
      [{ layout, points: [], obstacles: [{ x: 1, y: 1, radius: 0 }] }, "NON_POSITIVE", "input.obstacles[0].radius"],
      [{ layout, points: [], obstacles: [{ x: 1, y: 1, radius: null }] }, "BAD_NUMBER", "input.obstacles[0].radius"],
      [{ layout, points: [], obstacles: [{ x: 1, y: 1, radius: "unknown" }] },
        "BAD_NUMBER", "input.obstacles[0].radius"],
      [{ layout, points: [], segments: null }, "NOT_ARRAY", "input.segments"],
      [{ layout, points: [], segments: "unknown" }, "NOT_ARRAY", "input.segments"],
      [{ layout, points: [], segments: [null] }, "NOT_OBJECT", "input.segments[0]"],
      [{ layout, points: [], segments: [{ x1: Number.NaN, y1: 0, x2: 1, y2: 1 }] },
        "BAD_NUMBER", "input.segments[0].x1"],
      [{ layout, points: [], segments: [{ x1: 0, y1: 0, x2: 1, y2: 1 }, { x1: Number.NaN, y1: 0, x2: 1, y2: 1 }] },
        "BAD_NUMBER", "input.segments[1].x1"],
      [{ layout, points: [], segments: [{ x1: 0, y1: Number.NaN, x2: 1, y2: 1 }] },
        "BAD_NUMBER", "input.segments[0].y1"],
      [{ layout, points: [], segments: [{ x1: 0, y1: 0, x2: Number.NaN, y2: 1 }] },
        "BAD_NUMBER", "input.segments[0].x2"],
      [{ layout, points: [], segments: [{ x1: 0, y1: 0, x2: 1, y2: Number.NaN }] },
        "BAD_NUMBER", "input.segments[0].y2"],
    ] as const) {
      refuse(() => parsePlaceLabelsInput(badInput as never), code, path);
    }
  });

  it("orchestrates empty and deterministic greedy chart label placement with full object literals", () => {
    const layout = { ml: 78, mt: 30, baseIw: 400, baseIh: 200, baseMr: 30 };
    expect(placeChartLabels({ layout, points: [] })).toEqual({
      labels: [], tieFootnotes: [], plotHeight: 200, rightMargin: 30, totalWidth: 508,
      columnX: 496, fallbackCount: 0, labelOverlaps: 0, markerOverlaps: 0, svg: "",
    });
    const single = placeChartLabels({
      layout, fontSize: 10, points: [{ x: 200, y: 100, text: "AA", color: "#4E79A7" }],
    });
    expect(single).toEqual(placeChartLabels({
      layout, fontSize: 10, points: [{ x: 200, y: 100, text: "AA", color: "#4E79A7" }],
    }));
    expect(single.labels[0]).toEqual({
      clusterIndex: 0, x: 200, y: 100, color: "#4E79A7", highlighted: false, radius: 6, priority: 0,
      displayText: "AA", parts: [{ text: "AA", color: "#4E79A7", highlighted: false }],
      tieCount: 1, tieFootnoteId: null, tieNoteSuffix: null, mode: "greedy",
      box: { x1: 211, y1: 93, x2: 228.2, y2: 107 }, textX: 213, textY: 103.5, distance: 5, angleIndex: 0,
      leader: { sx: 207.5, sy: 100, tx: 211, ty: 100, length: 11 }, columnPolyline: null,
      svg: '<path d="M207.5 100 L211 100" fill="none" stroke="#4E79A7" stroke-width="1"/>'
        + '<text x="213" y="103.5" font-size="10" font-weight="400" text-anchor="start" fill="#4E79A7">AA</text>',
    });
    expect([single.fallbackCount, single.labelOverlaps, single.markerOverlaps, single.totalWidth])
      .toEqual([0, 0, 0, 508]);
  });

  it("renders exact single-part bold 1.06x, multi-part tie and XML-escaped placeChartLabels SVG", () => {
    const layout = { ml: 78, mt: 30, baseIw: 400, baseIh: 200, baseMr: 30 };
    const boldSingle = placeChartLabels({
      layout, fontSize: 10, points: [{ x: 200, y: 100, text: "MM", color: "#4E79A7", highlighted: true }],
    });
    expect(boldSingle.labels[0]).toEqual({
      clusterIndex: 0, x: 200, y: 100, color: "#4E79A7", highlighted: true, radius: 6, priority: 0,
      displayText: "MM", parts: [{ text: "MM", color: "#4E79A7", highlighted: true }],
      tieCount: 1, tieFootnoteId: null, tieNoteSuffix: null, mode: "greedy",
      box: { x1: 211, y1: 93, x2: 233.232, y2: 107 }, textX: 213, textY: 103.5, distance: 5, angleIndex: 0,
      leader: { sx: 207.5, sy: 100, tx: 211, ty: 100, length: 11 }, columnPolyline: null,
      svg: '<path d="M207.5 100 L211 100" fill="none" stroke="#4E79A7" stroke-width="1"/>'
        + '<text x="213" y="103.5" font-size="10" font-weight="700" text-anchor="start" fill="#4E79A7">MM</text>',
    });
    const res = placeChartLabels({
      layout, fontSize: 10, points: [
        { x: 200, y: 100, text: "AA", color: "#4E79A7" },
        { x: 300, y: 100, text: "B", color: "#F28E2B" },
        { x: 300.5, y: 100, text: "C", color: "#59A14F", highlighted: true },
      ],
    });
    expect(res.labels[1]).toEqual({
      clusterIndex: 1, x: 300, y: 100, color: "#59A14F", highlighted: true, radius: 6, priority: 0,
      displayText: "C / B",
      parts: [{ text: "C", color: "#59A14F", highlighted: true }, { text: "B", color: "#F28E2B", highlighted: false }],
      tieCount: 2, tieFootnoteId: null, tieNoteSuffix: null, mode: "greedy",
      box: { x1: 311, y1: 93, x2: 341.394, y2: 107 }, textX: 313, textY: 103.5, distance: 5, angleIndex: 0,
      leader: { sx: 307.5, sy: 100, tx: 311, ty: 100, length: 11 }, columnPolyline: null,
      svg: '<path d="M307.5 100 L311 100" fill="none" stroke="#59A14F" stroke-width="1"/>'
        + '<text x="313" y="103.5" font-size="10" font-weight="700" text-anchor="start">'
        + '<tspan fill="#59A14F">C</tspan><tspan fill="var(--st-semantic-text-secondary, #475569)"> / </tspan>'
        + '<tspan fill="#F28E2B">B</tspan></text>',
    });
    expect(res.svg).toBe(
      '<path d="M207.5 100 L211 100" fill="none" stroke="#4E79A7" stroke-width="1"/>'
      + '<text x="213" y="103.5" font-size="10" font-weight="400" text-anchor="start" fill="#4E79A7">AA</text>'
      + '<path d="M307.5 100 L311 100" fill="none" stroke="#59A14F" stroke-width="1"/>'
      + '<text x="313" y="103.5" font-size="10" font-weight="700" text-anchor="start">'
      + '<tspan fill="#59A14F">C</tspan><tspan fill="var(--st-semantic-text-secondary, #475569)"> / </tspan>'
      + '<tspan fill="#F28E2B">B</tspan></text>',
    );
    const escTie = placeChartLabels({
      layout, fontSize: 10, points: [
        { x: 200, y: 80, text: "A&B<1>", color: 'c"1\'' },
        { x: 200, y: 80, text: "D>E", color: "c&2" },
        { x: 320, y: 80, text: "Z\'", color: "<z>" },
      ],
    });
    expect(escTie.svg).toBe(
      '<path d="M207.5 80 L211 80" fill="none" stroke="c&quot;1&#39;" stroke-width="1"/>'
      + '<text x="213" y="83.5" font-size="10" font-weight="400" text-anchor="start">'
      + '<tspan fill="c&quot;1&#39;">A&amp;B&lt;1&gt;</tspan>'
      + '<tspan fill="var(--st-semantic-text-secondary, #475569)"> / </tspan>'
      + '<tspan fill="c&amp;2">D&gt;E</tspan></text>'
      + '<path d="M327.5 80 L331 80" fill="none" stroke="&lt;z&gt;" stroke-width="1"/>'
      + '<text x="333" y="83.5" font-size="10" font-weight="400" text-anchor="start" fill="&lt;z&gt;">Z&#39;</text>',
    );
  });

  it("pins MARKER_HALO_PX=7, DENSITY_RADIUS_PX=70 and exact placement coordinates", () => {
    expect([MARKER_HALO_PX, DENSITY_RADIUS_PX]).toEqual([7, 70]);
    const layout = { ml: 78, mt: 30, baseIw: 400, baseIh: 120, baseMr: 30 };
    const haloIn = placeChartLabels({
      layout, fontSize: 10, points: [
        { x: 200, y: 80, text: "AA", color: "#111", priority: 1 },
        { x: 241, y: 80, text: "BB", color: "#222", priority: 0 },
      ],
    });
    const haloOut = placeChartLabels({
      layout, fontSize: 10, points: [
        { x: 200, y: 80, text: "AA", color: "#111", priority: 1 },
        { x: 242, y: 80, text: "BB", color: "#222", priority: 0 },
      ],
    });
    expect([haloIn.labels[0]?.distance, haloIn.labels[0]?.angleIndex, haloOut.labels[0]?.angleIndex])
      .toEqual([5, 1, 0]);
    expect(haloOut.labels[0]?.box).toEqual({ x1: 211, y1: 73, x2: 228.2, y2: 87 });
    const pt = { x: 200, y: 80, text: "P", color: "#111" };
    const obsDef = placeChartLabels({ layout, points: [pt], obstacles: [{ x: 216, y: 89 }] }).labels[0]!;
    const obsSm = placeChartLabels({ layout, points: [pt], obstacles: [{ x: 216, y: 89, radius: 1 }] }).labels[0]!;
    expect([obsDef.distance, obsDef.angleIndex, obsSm.distance, obsSm.angleIndex]).toEqual([5, 5, 5, 0]);
    expect(obsSm.box).toEqual({ x1: 211, y1: 72.5, x2: 222.26, y2: 87.5 });
    const prio = placeChartLabels({
      layout: { ml: 50, mt: 48, baseIw: 185, baseIh: 120, baseMr: 20 }, fontSize: 10,
      points: [{ x: 200, y: 80, text: "Lo", color: "#111", priority: 0 },
        { x: 218, y: 56, text: "Hi", color: "#222", priority: 1 }],
    });
    expect([prio.labels[0]?.distance, prio.labels[0]?.angleIndex, prio.labels[1]?.distance, prio.labels[1]?.angleIndex])
      .toEqual([5, 2, 5, 5]);
    const compLayout = { ml: 50, mt: 30, baseIw: 300, baseIh: 30, baseMr: 20 };
    const compPts = [{ x: 150, y: 45, text: "WWW", color: "#111" }, { x: 215, y: 45, text: "WWW", color: "#222" }];
    const baseObs = [{ x: 120, y: 45 }, { x: 245, y: 45 }, { x: 215, y: 100 }];
    for (const obstacles of [
      baseObs,
      [...baseObs, { x: 150, y: 115 }],
      [...baseObs, { x: 145, y: 120 }, { x: 144, y: 120 }],
    ]) {
      const dens = placeChartLabels({ layout: compLayout, fontSize: 10, points: compPts, obstacles });
      expect([dens.labels[0]?.distance, dens.labels[0]?.angleIndex, dens.labels[1]?.distance,
        dens.labels[1]?.angleIndex]).toEqual([36, 12, 5, 11]);
    }
    const densTie = placeChartLabels({
      layout: compLayout, fontSize: 10, points: compPts, obstacles: [{ x: 120, y: 45 }, { x: 245, y: 45 }],
    });
    expect([densTie.labels[0]?.distance, densTie.labels[0]?.angleIndex, densTie.labels[0]?.box]).toEqual([
      5, 0, { x1: 161, y1: 38, x2: 190.8, y2: 52 },
    ]);
    const lead = placeChartLabels({
      layout: { ml: 180, mt: 40, baseIw: 100, baseIh: 68, baseMr: 20 }, fontSize: 10,
      points: [{ x: 190, y: 80, text: "Lead", color: "#111", priority: 2 },
        { x: 208, y: 103, text: "a", color: "#222", priority: 0 }],
      obstacles: [{ x: 204, y: 65, radius: 12 }, { x: 224, y: 100, radius: 10 }, { x: 192, y: 100, radius: 8 }],
    });
    expect([lead.labels[1]?.distance, lead.labels[1]?.angleIndex]).toEqual([36, 20]);
    const seg = placeChartLabels({ layout, points: [pt], segments: [{ x1: 208, y1: 80, x2: 240, y2: 80 }] });
    expect([seg.labels[0]?.distance, seg.labels[0]?.angleIndex]).toEqual([5, 2]);
  });

  it("handles 20-way tie and 30-label column fallback with exact coordinates and SVG", () => {
    const layout = { ml: 78, mt: 30, baseIw: 400, baseIh: 120, baseMr: 30 };
    const tie20 = placeChartLabels({
      layout, fontSize: 11,
      points: Array.from({ length: 20 }, (_, i) => ({
        x: 220 + (i % 2) * 0.4, y: 80 + (i % 3) * 0.2, text: `Arm${i + 1}`, color: "#4E79A7",
      })),
    });
    expect([tie20.labels.length, tie20.fallbackCount, tie20.labelOverlaps, tie20.markerOverlaps]).toEqual([1, 0, 0, 0]);
    expect(tie20.labels[0]?.displayText).toBe("Arm1 / Arm2 (+18 tied, see #1)");
    expect(tie20.labels[0]?.svg).toBe(
      '<path d="M227.5 80 L231 80" fill="none" stroke="#4E79A7" stroke-width="1"/>'
      + '<text x="233" y="83.85" font-size="11" font-weight="400" text-anchor="start">'
      + '<tspan fill="#4E79A7">Arm1</tspan>'
      + '<tspan fill="var(--st-semantic-text-secondary, #475569)"> / </tspan>'
      + '<tspan fill="#4E79A7">Arm2</tspan>'
      + '<tspan fill="var(--st-semantic-text-secondary, #475569)"> (+18 tied, see #1)</tspan></text>',
    );
    const expectedTie20Names = Array.from({ length: 20 }, (_, i) => `Arm${i + 1}`);
    expect(tie20.tieFootnotes).toEqual([{
      id: 1, tag: "#1", names: expectedTie20Names,
      items: expectedTie20Names.map((text) => ({ text, color: "#4E79A7", highlighted: false })),
      text: `#1: ${expectedTie20Names.join(" / ")}`,
    }]);
    const tieSvg = placeChartLabels({ layout, points: [
      { x: 200, y: 80, text: "P1", color: "#111" }, { x: 200, y: 80, text: "P2", color: "#222", highlighted: true },
      { x: 200, y: 80, text: "P3", color: "#333" }, { x: 200, y: 80, text: "P4", color: "#444" },
    ] });
    expect(tieSvg.svg).toBe(
      '<path d="M207.5 80 L211 80" fill="none" stroke="#222" stroke-width="1"/>'
      + '<text x="213" y="83.85" font-size="11" font-weight="700" text-anchor="start">'
      + '<tspan fill="#222">P2</tspan><tspan fill="var(--st-semantic-text-secondary, #475569)"> / </tspan>'
      + '<tspan fill="#111">P1</tspan>'
      + '<tspan fill="var(--st-semantic-text-secondary, #475569)"> (+2 tied, see #1)</tspan></text>',
    );
    const overflow30 = placeChartLabels({
      layout: { ml: 50, mt: 20, baseIw: 160, baseIh: 120, baseMr: 20 }, fontSize: 11,
      points: Array.from({ length: 30 }, (_, i) => ({
        x: 110 + (i % 3) * 4, y: 36 + i * 2, text: `Model-${i + 1}`, color: "#F28E2B", highlighted: i === 5,
      })),
    });
    expect([
      overflow30.labels.length, overflow30.labelOverlaps, overflow30.markerOverlaps,
      overflow30.fallbackCount, overflow30.plotHeight, overflow30.rightMargin, overflow30.totalWidth,
      overflow30.columnX,
    ]).toEqual([30, 0, 0, 18, 322, 82.38, 292.38, 228]);
    expect(overflow30.labels[10]).toEqual({
      clusterIndex: 10, x: 114, y: 56, color: "#F28E2B", highlighted: false, radius: 6, priority: 0,
      displayText: "Model-11", parts: [{ text: "Model-11", color: "#F28E2B", highlighted: false }],
      tieCount: 1, tieFootnoteId: null, tieNoteSuffix: null, mode: "column",
      box: { x1: 226, y1: 28.5, x2: 274.44, y2: 43.5 }, textX: 228, textY: 39.85,
      distance: null, angleIndex: null, leader: null, columnPolyline: [[114, 56], [214, 36], [224, 36]],
      svg: '<polyline points="114,56 214,36 224,36" fill="none" stroke="var(--st-semantic-text-muted, #64748b)"'
        + ' stroke-width="0.8" opacity="0.7"/>'
        + '<text x="228" y="39.85" font-size="11" font-weight="400" text-anchor="start" fill="#F28E2B">Model-11</text>',
    });
    const hugeFont = placeChartLabels({
      layout: { ml: 50, mt: 20, baseIw: 30, baseIh: 10, baseMr: 20 }, fontSize: 30,
      points: [{ x: 65, y: 21, text: "Huge1", color: "#111" }, { x: 65, y: 23, text: "Huge2", color: "#222" }],
    });
    expect([hugeFont.fallbackCount, hugeFont.plotHeight, hugeFont.labels[0]?.box.y1]).toEqual([2, 85, 20]);
  });

  it("places all 42 immo v12 arms on P-R and F1-cost with effort segments, 0 overlaps and 0 throws", () => {
    type Row = readonly [string, string, string, number, number | null, number, number | null, number | null, boolean];
    const rows: readonly Row[] = [
      ["GPT-6 Astra medium", "OpenAI", "medium", 0.534, 0.371, 0.438, 0.4689, 0.0207, false],
      ["CP actuel", "Cascades", "cascade", 0.533, 0.484, 0.507, 0.4813, 0.0212, false],
      ["CP-low", "Cascades", "cascade", 0.491, 0.479, 0.485, null, null, false],
      ["GPT-6 Astra low", "OpenAI", "low", 0.491, 0.373, 0.424, 0.4072, 0.018, false],
      ["GPT-5.6 Sol xhigh", "OpenAI", "xhigh", 0.488, 0.308, 0.378, 0.5498, 0.0243, false],
      ["Gemini 4 Argon low", "Google", "low", 0.429, 0.33, 0.373, 0.2074, 0.00801, false],
      ["GPT-5.6 Sol medium", "OpenAI", "medium", 0.398, 0.444, 0.42, 0.2686, 0.0119, false],
      ["GPT-5.6 Sol low", "OpenAI", "low", 0.358, 0.465, 0.404, 0.1967, 0.0087, false],
      ["C2", "Cascades", "cascade", 0.358, 0.456, 0.401, 0.0689, 0.00277, false],
      ["C3", "Cascades", "cascade", 0.353, 0.461, 0.4, 0.0543, 0.00211, false],
      ["GPT-5.6 Sol high", "OpenAI", "high", 0.337, 0.377, 0.356, 0.346, 0.0153, false],
      ["Muse Wonder 1.0 low", "Meta", "low", 0.333, 0.361, 0.346, 0.2731, null, false],
      ["Opus 5.5 medium", "Anthropic", "medium", 0.311, 0.328, 0.319, 0.4999, 0.0151, false],
      ["Gemini 3.8 Flash low", "Google", "low", 0.3, 0.475, 0.368, 0.0376, 0.00143, false],
      ["GPT-6 Astra xhigh", "OpenAI", "xhigh", 0.297, 0.252, 0.273, 0.9929, 0.0439, false],
      ["Opus 5 low", "Anthropic", "low", 0.292, 0.35, 0.319, 0.3976, 0.012, false],
      ["GPT-6 Astra high", "OpenAI", "high", 0.26, 0.289, 0.274, 0.5896, 0.0261, false],
      ["Opus 5 off", "Anthropic", "off", 0.258, 0.314, 0.283, 0.6507, 0.0197, false],
      ["Opus 5 high", "Anthropic", "high", 0.251, 0.318, 0.28, 0.6472, 0.0196, false],
      ["Muse Ember 1.0 max (v12)", "Meta", "max", 0.24, 0.271, 0.255, 0.0116, null, true],
      ["Muse Spark 1.3 xhigh", "Meta", "xhigh", 0.225, 0.302, 0.258, 0.0343, null, false],
      ["Gemini 3.8 Flash medium", "Google", "medium", 0.223, 0.449, 0.298, 0.0539, 0.00204, false],
      ["Opus 5.5 low", "Anthropic", "low", 0.217, 0.325, 0.26, 0.4239, 0.0128, false],
      ["Muse Spark 1.3 medium", "Meta", "medium", 0.207, 0.355, 0.262, 0.0305, null, false],
      ["Muse Ember 1.0 xhigh (v12)", "Meta", "xhigh", 0.194, 0.243, 0.215, 0.00991, null, true],
      ["Sonnet 5 high", "Anthropic", "high", 0.193, 0.33, 0.243, 0.2295, 0.00694, false],
      ["GPT-5.6 Luna high", "OpenAI", "high", 0.185, 0.371, 0.247, 0.0199, 0.00088, false],
      ["Sonnet 5 off", "Anthropic", "off", 0.185, 0.333, 0.238, 0.2307, 0.00698, false],
      ["GPT-5.6 Luna medium", "OpenAI", "medium", 0.175, 0.454, 0.252, 0.0117, 0.00052, false],
      ["Muse Spark 1.3 low", "Meta", "low", 0.17, 0.347, 0.228, 0.0284, null, false],
      ["Muse Spark 1.3 high", "Meta", "high", 0.155, 0.297, 0.204, 0.031, null, false],
      ["GPT-5.6 Luna xhigh", "OpenAI", "xhigh", 0.147, 0.24, 0.182, 0.0346, 0.00153, false],
      ["Gemini 3.8 Flash high", "Google", "high", 0.141, 0.386, 0.206, 0.1123, 0.00426, false],
      ["Sonnet 5 low", "Anthropic", "low", 0.136, 0.393, 0.203, 0.1114, 0.00337, false],
      ["GPT-5.6 Luna low", "OpenAI", "low", 0.109, 0.448, 0.176, 0.00949, 0.00042, false],
      ["Muse Spark 1.3 minimal", "Meta", "minimal", 0.102, 0.385, 0.161, 0.0279, null, false],
      ["Sonnet 4.6 off", "Anthropic", "off", 0.096, 0.307, 0.146, 0.175, null, false],
      ["Sonnet 4.6 low", "Anthropic", "low", 0.058, 0.453, 0.102, 0.1478, null, false],
      ["Muse Spark 1.3 max", "Meta", "max", 0.03, 0.606, 0.056, null, null, false],
      ["GPT-4.1 off", "OpenAI", "off", 0.013, 0.048, 0.021, 0.0542, null, false],
      ["Mistral Small 4 off", "Mistral", "off", 0.007, 0.227, 0.014, 0.005, null, false],
      ["Sonnet 4.6 high", "Anthropic", "high", 0, null, 0, null, null, false],
    ];
    expect(rows).toHaveLength(42);
    const layout = { ml: 78, mt: 30, baseIw: 1332, baseIh: 760, baseMr: 30 };
    const xPr = (r: number) => 78 + ((r + 0.02) / 0.64) * 1332;
    const yPr = (p: number) => 30 + 760 - ((p + 0.02) / 0.68) * 760;
    const lo = Math.log10(0.0003);
    const hi = Math.log10(2.0);
    const xCost = (c: number) => 78 + ((Math.log10(c) - lo) / (hi - lo)) * 1332;
    const yCost = (f: number) => 30 + 760 - ((f + 0.03) / 0.6) * 760;
    const effortSegs = (subset: readonly Row[], gx: (r: Row) => number, gy: (r: Row) => number) => {
      const byModel = new Map<string, Row[]>();
      for (const row of subset) {
        if (row[1] !== "Cascades") {
          const fam = row[0].replace(/ \([^)]+\)$/, "").replace(/ \S+$/, "");
          byModel.set(fam, [...(byModel.get(fam) ?? []), row]);
        }
      }
      return [...byModel.values()].flatMap((list) => {
        const sorted = [...list].sort((a, b) =>
          effortProgressionRank(a[2] as never) - effortProgressionRank(b[2] as never));
        return sorted.slice(1).map((r, i) => ({ x1: gx(sorted[i]!), y1: gy(sorted[i]!), x2: gx(r), y2: gy(r) }));
      });
    };
    const prRows = rows.filter((r) => r[4] !== null);
    const prRes = placeChartLabels({
      layout, fontSize: 11.5, segments: effortSegs(prRows, (r) => xPr(r[3]), (r) => yPr(r[4]!)),
      points: prRows.map(([t, prov, , r, p, , , , hl]) => ({
        x: xPr(r), y: yPr(p!), text: t, color: resolveArmColor(prov, prov === "Cascades"), highlighted: hl,
        radius: 6, priority: hl ? 2 : prov === "Cascades" ? 1 : 0,
      })),
    });
    expect([
      prRes.labels.length, prRes.fallbackCount, prRes.labelOverlaps, prRes.markerOverlaps,
      prRes.plotHeight, prRes.rightMargin, prRes.totalWidth,
    ]).toEqual([41, 0, 0, 0, 760, 30, 1440]);
    expect(prRes.labels[0]?.svg).toBe(
      '<path d="M1238.51 353 L1242.01 353" fill="none" stroke="var(--st-semantic-data-category1, #4E79A7)"'
      + ' stroke-width="1"/><text x="1244.01" y="357.03" font-size="11.5" font-weight="400"'
      + ' text-anchor="start" fill="var(--st-semantic-data-category1, #4E79A7)">GPT-6 Astra medium</text>',
    );
    const costRows = rows.filter((r) => r[6] !== null && r[6] > 0);
    const costInput = {
      layout, fontSize: 12,
      obstacles: costRows.filter((r) => r[7] !== null).map((r) => ({ x: xCost(r[7]!), y: yCost(r[5]), radius: 6 })),
      segments: [
        ...effortSegs(costRows, (r) => xCost(r[6]!), (r) => yCost(r[5])),
        ...costRows.filter((r) => r[7] !== null).map((r) =>
          ({ x1: xCost(r[7]!), y1: yCost(r[5]), x2: xCost(r[6]!), y2: yCost(r[5]) })),
      ],
      points: costRows.map(([t, prov, , , , f1, api, , hl]) => ({
        x: xCost(api!), y: yCost(f1), text: t, color: resolveArmColor(prov, prov === "Cascades"), highlighted: hl,
        radius: 7, priority: hl ? 2 : prov === "Cascades" ? 1 : 0,
      })),
    };
    const costRes = placeChartLabels(costInput);
    expect([
      costRes.labels.length, costRes.fallbackCount, costRes.labelOverlaps, costRes.markerOverlaps,
      costRes.plotHeight, costRes.rightMargin, costRes.totalWidth,
    ]).toEqual([39, 0, 0, 0, 760, 30, 1440]);
    expect(costRes.labels[0]?.svg).toBe(
      '<path d="M1199.07 197.2 L1202.57 197.2" fill="none" stroke="var(--st-semantic-data-category1, #4E79A7)"'
      + ' stroke-width="1"/><text x="1204.57" y="201.4" font-size="12" font-weight="400"'
      + ' text-anchor="start" fill="var(--st-semantic-data-category1, #4E79A7)">GPT-6 Astra medium</text>',
    );
    expect(costRes.svg).toBe(placeChartLabels(costInput).svg);
  });

  it("preserves interior column y-positions, odd lineGap topPad rounding and cluster-only density", () => {
    const midCol = placeRightGutterColumn(
      [
        { clusterIndex: 0, x: 100, y: 120, width: 40, height: 15 },
        { clusterIndex: 1, x: 100, y: 125, width: 40, height: 15 },
        { clusterIndex: 2, x: 100, y: 195, width: 40, height: 15 },
        { clusterIndex: 3, x: 100, y: 300, width: 40, height: 15 },
      ],
      { ml: 50, mt: 20, baseIw: 200, baseIh: 200, baseMr: 30 },
      11,
    );
    expect([midCol.plotHeight, midCol.placed[0]!.box.y1, midCol.placed[3]!.box.y2]).toEqual([200, 112.5, 210.5]);
    expect(midCol.placed.map((item) => item.polyline)).toEqual([
      [[100, 120], [254, 120], [264, 120]],
      [[100, 125], [254, 137], [264, 137]],
      [[100, 195], [254, 186], [264, 186]],
      [[100, 300], [254, 203], [264, 203]],
    ]);
    const col29 = placeRightGutterColumn(
      [
        { clusterIndex: 0, x: 100, y: 0, width: 40, height: 33 },
        { clusterIndex: 1, x: 100, y: 0, width: 40, height: 33 },
      ],
      { ml: 50, mt: 20, baseIw: 100, baseIh: 10, baseMr: 20 },
      29,
    );
    expect([col29.plotHeight, col29.placed[0]!.box.y1, col29.placed[1]!.box.y2]).toEqual([83, 20.5, 86.5]);
    const clusterDens = placeChartLabels({
      layout: { ml: 50, mt: 30, baseIw: 300, baseIh: 30, baseMr: 20 },
      fontSize: 10,
      points: [
        { x: 130, y: 45, text: "WWWW", color: "#111" },
        { x: 200, y: 45, text: "WWWWW", color: "#222" },
        { x: 230, y: 45, text: "WWW", color: "#333" },
      ],
      obstacles: [],
    });
    expect([
      clusterDens.labels[0]?.distance, clusterDens.labels[0]?.angleIndex,
      clusterDens.labels[1]?.distance, clusterDens.labels[1]?.angleIndex,
    ]).toEqual([5, 11, 5, 11]);
    expect([clusterDens.labels[2]?.distance, clusterDens.labels[2]?.angleIndex, clusterDens.labels[2]?.box])
      .toEqual([5, 0, { x1: 241, y1: 38, x2: 270.8, y2: 52 }]);
  });

  it("pins soft penalty cost weights, leader step=4 sampling and gutter marker overlap", () => {
    const tightCtx = {
      x: 200, y: 200, radius: 6, width: 12, height: 14, ownMarkerIndex: 0,
      frame: { x1: 211, y1: 193, x2: 223, y2: 207 },
    };
    const overlapBox = { x1: 211, y1: 193, x2: 213, y2: 198 };
    const haloCost = findBestGreedyPlacement({
      ...tightCtx, placedBoxes: [], markerBoxes: [markerBox(200, 200, 6)],
      haloBoxes: [null, overlapBox], lineDots: [], leaderDots: [],
    })?.cost;
    const lineCost = findBestGreedyPlacement({
      ...tightCtx, placedBoxes: [], markerBoxes: [markerBox(200, 200, 6)],
      haloBoxes: [null], lineDots: [overlapBox], leaderDots: [],
    })?.cost;
    const leaderDotsCost = findBestGreedyPlacement({
      ...tightCtx, placedBoxes: [], markerBoxes: [markerBox(200, 200, 6)],
      haloBoxes: [null], lineDots: [], leaderDots: [overlapBox],
    })?.cost;
    const leadPlacedCost = findBestGreedyPlacement({
      ...tightCtx, placedBoxes: [{ x1: 208, y1: 198, x2: 210, y2: 202 }],
      markerBoxes: [markerBox(200, 200, 6)], haloBoxes: [null], lineDots: [], leaderDots: [],
    })?.cost;
    expect([haloCost, lineCost, leaderDotsCost, leadPlacedCost]).toEqual([124.5, 34.5, 204.5, 94.5]);
    const leaderStep = placeChartLabels({
      layout: { ml: 90, mt: 90, baseIw: 70, baseIh: 70, baseMr: 20 }, fontSize: 10,
      points: [
        { x: 100, y: 100, text: "A", color: "#111", priority: 2 },
        { x: 102, y: 120, text: "i", color: "#222", priority: 0 },
      ],
      obstacles: [
        { x: 120, y: 100, radius: 13 }, { x: 100, y: 120, radius: 13 },
        { x: 85, y: 100, radius: 15 }, { x: 100, y: 85, radius: 15 },
      ],
    });
    expect([leaderStep.labels[1]?.distance, leaderStep.labels[1]?.angleIndex, leaderStep.labels[1]?.box])
      .toEqual([18, 0, { x1: 126, y1: 113, x2: 133, y2: 127 }]);
    const gutterObs = placeChartLabels({
      layout: { ml: 50, mt: 20, baseIw: 30, baseIh: 100, baseMr: 20 }, fontSize: 11,
      points: [{ x: 65, y: 40, text: "Gutter", color: "#111" }],
      obstacles: [{ x: 105, y: 40, radius: 6 }],
    });
    expect([gutterObs.fallbackCount, gutterObs.labelOverlaps, gutterObs.markerOverlaps, gutterObs.labels[0]?.box])
      .toEqual([1, 0, 1, { x1: 96, y1: 32.5, x2: 132.67, y2: 47.5 }]);
  });
});
