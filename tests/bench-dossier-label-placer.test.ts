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
});
