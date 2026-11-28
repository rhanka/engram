import type { PlaceLabelsInput } from "./label-types.js";
import { estimateLabelBoxSize } from "./label-text.js";
import { type ColumnFallbackInputItem, placeRightGutterColumn } from "./label-column.js";
import {
  findBestGreedyPlacement,
  MARKER_HALO_PX,
  markerBox,
  sampleSegmentBoxes,
} from "./label-greedy.js";
import type { LabelBox } from "./label-types.js";
import {
  auditLabelOverlaps,
  type PlacedLabel,
  type PlaceLabelsResult,
  renderLabelXml,
} from "./label-render.js";
import { parsePlaceLabelsInput } from "./label-input.js";

export * from "./label-types.js";
export * from "./label-text.js";
export * from "./label-greedy.js";
export * from "./label-render.js";

export const DENSITY_RADIUS_PX = 70;

/** Merge ties, run 24x9 greedy placement, move collisions to dynamic right-gutter column, and emit DS SVG. */
export function placeChartLabels(input: PlaceLabelsInput): PlaceLabelsResult {
  const { layout, fontSize, clusters, tieFootnotes, obstacles, segments } = parsePlaceLabelsInput(input);
  const frame: LabelBox = {
    x1: layout.ml,
    y1: layout.mt,
    x2: layout.ml + layout.baseIw,
    y2: layout.mt + layout.baseIh,
  };
  const allPoints = [...clusters, ...obstacles];
  const markerBoxes = allPoints.map((point) => markerBox(point.x, point.y, point.radius));
  const haloBoxes = allPoints.map((point, index) =>
    index < clusters.length ? markerBox(point.x, point.y, point.radius + MARKER_HALO_PX) : null,
  );
  const density = clusters.map(
    (cluster) =>
      allPoints.filter((point) => Math.hypot(point.x - cluster.x, point.y - cluster.y) < DENSITY_RADIUS_PX).length,
  );
  const order = clusters.map((_, index) => index).sort(
    (leftIndex, rightIndex) =>
      (clusters[rightIndex]!.priority - clusters[leftIndex]!.priority)
      || (density[rightIndex]! - density[leftIndex]!)
      || (leftIndex - rightIndex),
  );
  const lineDots = segments.flatMap((segment) =>
    sampleSegmentBoxes(segment.x1, segment.y1, segment.x2, segment.y2),
  );
  const placedBoxes: LabelBox[] = [];
  const leaderDots: LabelBox[] = [];
  const displaced: ColumnFallbackInputItem[] = [];
  const rawLabels = new Array<Omit<PlacedLabel, "svg">>(clusters.length);
  for (const clusterIndex of order) {
    const cluster = clusters[clusterIndex]!;
    const { width, height } = estimateLabelBoxSize(cluster.displayText, fontSize, cluster.highlighted);
    const best = findBestGreedyPlacement({
      x: cluster.x,
      y: cluster.y,
      radius: cluster.radius,
      width,
      height,
      ownMarkerIndex: clusterIndex,
      frame,
      placedBoxes,
      markerBoxes,
      haloBoxes,
      lineDots,
      leaderDots,
    });
    if (best) {
      placedBoxes.push(best.box);
      const leader = best.leader;
      if (leader) {
        leaderDots.push(...sampleSegmentBoxes(leader.sx, leader.sy, leader.tx, leader.ty, 4));
      }
      rawLabels[clusterIndex] = {
        ...cluster,
        mode: "greedy",
        box: best.box,
        textX: best.box.x1 + 2,
        textY: best.box.y1 + 2 + fontSize * 0.85,
        distance: best.distance,
        angleIndex: best.angleIndex,
        leader,
        columnPolyline: null,
      };
    } else {
      displaced.push({ clusterIndex, x: cluster.x, y: cluster.y, width, height });
    }
  }
  const columnResult = placeRightGutterColumn(displaced, layout, fontSize);
  for (const placedItem of columnResult.placed) {
    rawLabels[placedItem.clusterIndex] = {
      ...clusters[placedItem.clusterIndex]!,
      mode: "column",
      box: placedItem.box,
      textX: placedItem.textX,
      textY: placedItem.textY,
      distance: null,
      angleIndex: null,
      leader: null,
      columnPolyline: placedItem.polyline,
    };
  }
  const labels = rawLabels.map((item) => ({ ...item, svg: renderLabelXml(item, fontSize) }));
  const { labelOverlaps, markerOverlaps } = auditLabelOverlaps(labels.map((label) => label.box), markerBoxes);
  return {
    labels,
    tieFootnotes,
    plotHeight: columnResult.plotHeight,
    rightMargin: columnResult.rightMargin,
    columnX: columnResult.columnX,
    totalWidth: layout.ml + layout.baseIw + columnResult.rightMargin,
    fallbackCount: displaced.length,
    labelOverlaps,
    markerOverlaps,
    svg: labels.map((label) => label.svg).join(""),
  };
}
