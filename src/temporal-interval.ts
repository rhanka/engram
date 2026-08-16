/** The single valid-time interval convention for temporal projections. */
export const TEMPORAL_INTERVAL_CONVENTION = "closed-v1" as const;

export type TemporalIntervalConvention = typeof TEMPORAL_INTERVAL_CONVENTION;

export interface TemporalProjectionMetadata {
  interval_convention: TemporalIntervalConvention;
}

export interface ClosedTemporalBounds {
  t: number;
  tEnd?: number;
}

function own(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

/**
 * Validates the native projection shape for the closed `[t, t_end]` interval.
 * An absent `t_end` is open-ended; untimed, malformed, and inverted values have
 * no temporal interval and are excluded whenever a temporal filter is active.
 */
export function closedTemporalBounds(value: unknown): ClosedTemporalBounds | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const t = record.t;
  if (typeof t !== "number" || !Number.isFinite(t)) return undefined;
  if (!own(record, "t_end")) return { t };

  const tEnd = record.t_end;
  if (typeof tEnd !== "number" || !Number.isFinite(tEnd) || tEnd < t) return undefined;
  return { t, tEnd };
}

/** Closed overlap: `t <= toMs && (t_end absent || t_end >= fromMs)`. */
export function overlapsClosedTemporalWindow(
  value: unknown,
  fromMs: number,
  toMs: number,
): boolean {
  const bounds = closedTemporalBounds(value);
  return bounds !== undefined && bounds.t <= toMs && (bounds.tEnd === undefined || bounds.tEnd >= fromMs);
}

/** Closed point membership: `t <= cursor && (t_end absent || cursor <= t_end)`. */
export function isActiveAtClosedTemporalCursor(value: unknown, cursor: number): boolean {
  const bounds = closedTemporalBounds(value);
  return bounds !== undefined && bounds.t <= cursor && (bounds.tEnd === undefined || cursor <= bounds.tEnd);
}

/** Return a fresh temporal metadata object for a serialized projection. */
export function closedTemporalProjectionMetadata(): TemporalProjectionMetadata {
  return { interval_convention: TEMPORAL_INTERVAL_CONVENTION };
}
