import type { Cursor, ValidIntervalV1 } from "./contracts/index.js";
import { isCanonicalCursor } from "./validation.js";

export interface DualAsOfV1 {
  valid_as_of: number;
  system_as_of: Cursor;
}

function hasClosedValidMembership(interval: ValidIntervalV1, validAsOf: number): boolean {
  return Number.isSafeInteger(interval.t)
    && (interval.t_end === undefined || (Number.isSafeInteger(interval.t_end) && interval.t_end >= interval.t))
    && Number.isSafeInteger(validAsOf)
    && interval.t <= validAsOf
    && (interval.t_end === undefined || validAsOf <= interval.t_end);
}

/**
 * A record can participate only when its creating event is at or before the
 * pinned system cursor and its immutable interval contains the valid cursor.
 */
export function isVisibleAtDualAsOf(interval: ValidIntervalV1, recordedCursor: Cursor, asOf: DualAsOfV1): boolean {
  if (!isCanonicalCursor(recordedCursor) || !isCanonicalCursor(asOf.system_as_of)) return false;
  return BigInt(recordedCursor) <= BigInt(asOf.system_as_of)
    && hasClosedValidMembership(interval, asOf.valid_as_of);
}
