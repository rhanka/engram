import type {
  GreedyCandidate,
  GreedySearchContext,
  LabelBox,
  LabelLayout,
  LeaderSegment,
} from "./label-types.js";
import {
  boxOverlapArea,
  computeLeader,
  sampleSegmentBoxes,
} from "./label-geometry.js";

export type { GreedyCandidate, GreedySearchContext, LabelBox, LabelLayout, LeaderSegment };
export * from "./label-column.js";
export * from "./label-geometry.js";

export const GREEDY_DISTANCES = [5, 11, 18, 26, 36, 48, 62, 78, 96] as const;
export const GREEDY_ANGLE_COUNT = 24;
export const MARKER_HALO_PX = 7;

/** Evaluate 24-angle x 9-distance grid and return lowest-cost hard-collision-free candidate or null. */
export function findBestGreedyPlacement(ctx: GreedySearchContext): GreedyCandidate | null {
  let best: GreedyCandidate | null = null;
  for (const distance of GREEDY_DISTANCES) {
    const radial = distance + ctx.radius;
    for (let angleIndex = 0; angleIndex < GREEDY_ANGLE_COUNT; angleIndex++) {
      const angle = (angleIndex * Math.PI) / 12;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const anchorX = ctx.x + cos * radial;
      const anchorY = ctx.y + sin * radial;
      const x1 = Math.abs(cos) < 0.3 ? anchorX - ctx.width / 2 : cos > 0 ? anchorX : anchorX - ctx.width;
      const y1 = Math.abs(sin) < 0.3 ? anchorY - ctx.height / 2 : sin > 0 ? anchorY : anchorY - ctx.height;
      const box: LabelBox = { x1, y1, x2: x1 + ctx.width, y2: y1 + ctx.height };
      if (
        box.x1 < ctx.frame.x1
        || box.x2 > ctx.frame.x2
        || box.y1 < ctx.frame.y1
        || box.y2 > ctx.frame.y2
      ) {
        continue;
      }
      if (ctx.placedBoxes.some((placed) => boxOverlapArea(box, placed) > 0)) {
        continue;
      }
      if (ctx.markerBoxes.some((marker) => boxOverlapArea(box, marker) > 0)) {
        continue;
      }
      let cost = distance * 0.9;
      for (let index = 0; index < ctx.haloBoxes.length; index++) {
        const haloBox = ctx.haloBoxes[index];
        if (index !== ctx.ownMarkerIndex && haloBox) {
          cost += boxOverlapArea(box, haloBox) * 12;
        }
      }
      for (const dot of ctx.lineDots) {
        cost += boxOverlapArea(box, dot) * 3;
      }
      for (const dot of ctx.leaderDots) {
        cost += boxOverlapArea(box, dot) * 20;
      }
      const leader = computeLeader(ctx.x, ctx.y, ctx.radius, box);
      if (leader) {
        for (const dot of sampleSegmentBoxes(leader.sx, leader.sy, leader.tx, leader.ty, 4)) {
          for (const placed of ctx.placedBoxes) {
            cost += boxOverlapArea(dot, placed) * 20;
          }
          for (let index = 0; index < ctx.markerBoxes.length; index++) {
            if (index !== ctx.ownMarkerIndex) {
              cost += boxOverlapArea(dot, ctx.markerBoxes[index]!) * 10;
            }
          }
        }
      }
      if (!best || cost < best.cost) {
        best = { box, distance, angleIndex, cost, leader };
      }
    }
  }
  return best;
}
