import type { PositionBounds, PositionFrame, PositionFrameMeta } from "./types";

export function assertPositionArray(positions: Float32Array, nodeCount?: number): void {
  if (!(positions instanceof Float32Array)) {
    throw new TypeError("positions must be a Float32Array");
  }

  if (positions.length % 2 !== 0) {
    throw new RangeError("positions length must be even");
  }

  if (nodeCount !== undefined && positions.length !== nodeCount * 2) {
    throw new RangeError(`positions length ${positions.length} does not match node count ${nodeCount}`);
  }
}

export function copyPositions(positions: Float32Array, nodeCount?: number): Float32Array {
  assertPositionArray(positions, nodeCount);
  return new Float32Array(positions);
}

export function createPositionFrame(positions: Float32Array, meta: PositionFrameMeta = {}): PositionFrame {
  assertPositionArray(positions);
  return {
    ...meta,
    positions,
  };
}

export function computePositionBounds(positions: Float32Array): PositionBounds {
  assertPositionArray(positions);

  if (positions.length === 0) {
    return {
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
      width: 0,
      height: 0,
      centerX: 0,
      centerY: 0,
    };
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < positions.length; index += 2) {
    const x = positions[index] ?? 0;
    const y = positions[index + 1] ?? 0;

    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const width = maxX - minX;
  const height = maxY - minY;

  return {
    minX,
    minY,
    maxX,
    maxY,
    width,
    height,
    centerX: minX + width / 2,
    centerY: minY + height / 2,
  };
}
