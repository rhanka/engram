import type { LabelBox, LeaderSegment } from "./label-types.js";

export function boxOverlapArea(boxA: LabelBox, boxB: LabelBox): number {
  const dx = Math.min(boxA.x2, boxB.x2) - Math.max(boxA.x1, boxB.x1);
  const dy = Math.min(boxA.y2, boxB.y2) - Math.max(boxA.y1, boxB.y1);
  return dx > 0 && dy > 0 ? dx * dy : 0;
}

export function markerBox(x: number, y: number, radius: number): LabelBox {
  return { x1: x - radius, y1: y - radius, x2: x + radius, y2: y + radius };
}

/** Compute clipped leader segment from marker edge to nearest point on box, or null within radius + 4. */
export function computeLeader(
  x: number,
  y: number,
  radius: number,
  box: LabelBox,
): LeaderSegment | null {
  const tx = Math.min(Math.max(x, box.x1), box.x2);
  const ty = Math.min(Math.max(y, box.y1 + 2), box.y2 - 2);
  const length = Math.hypot(tx - x, ty - y);
  if (length <= radius + 4) {
    return null;
  }
  const start = radius + 1.5;
  return {
    sx: x + ((tx - x) / length) * start,
    sy: y + ((ty - y) / length) * start,
    tx,
    ty,
    length,
  };
}

/** Sample a line segment into 3x3 px boxes for soft obstacle / leader-crossing penalties. */
export function sampleSegmentBoxes(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  step = 5,
): LabelBox[] {
  const count = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / step));
  return Array.from({ length: count + 1 }, (_, sampleIndex) => {
    const sampleX = x1 + ((x2 - x1) * sampleIndex) / count;
    const sampleY = y1 + ((y2 - y1) * sampleIndex) / count;
    return { x1: sampleX - 1.5, y1: sampleY - 1.5, x2: sampleX + 1.5, y2: sampleY + 1.5 };
  });
}
