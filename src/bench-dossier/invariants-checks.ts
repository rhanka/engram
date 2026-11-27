import { BenchResultsValidationError, type BenchResultsErrorCode } from "./results-guards.js";
export type BenchInvariantCode =
  | "MISSION_FIELD_SHAPE" | "FIELD_NAME_DOT" | "DUPLICATE_FIELD" | "PROSE_NAME_GATE" | "PROSE_NAME_CONFLICT"
  | "PROSE_NAME_DUPLICATE" | "DUPLICATE_RECORD_KEY" | "PRIMARY_COMPARATOR" | "CURRENCY_MISMATCH" | "ATTEMPTED_MISMATCH"
  | "COST_BASIS" | "COUNT_IDENTITY" | "SITE_MATRIX_IDENTITY" | "ESTIMATOR_PAIRING" | "INTERVAL_ESTIMATOR"
  | "UNWEIGHTED_METRIC" | "WILSON_INTERVAL" | "POOLED_WILSON_FORBIDDEN" | "COST_CONSISTENCY" | "SEAT_CONSISTENCY";
/** Typed cross-field or mission-shape invariant failure carrying code, path and invariant id. */
export class BenchInvariantError extends BenchResultsValidationError {
  constructor(readonly invariant: BenchInvariantCode, path: string,
    code: BenchResultsErrorCode = "BAD_SHAPE", cause?: unknown) {
    super(code, path, cause !== undefined ? { cause } : undefined);
    this.name = "BenchInvariantError";
    this.message = `${invariant} (${code}) at ${path}`;
  }
}
const Z95 = 1.959963984540054;
export function failInv(invariant: BenchInvariantCode, path: string, code: BenchResultsErrorCode = "BAD_SHAPE"): never {
  throw new BenchInvariantError(invariant, path, code);
}
/** Two-sided 95% Wilson score interval for k successes in n independent trials. */
export function wilson95(k: number, n: number): { readonly low: number; readonly high: number } {
  if (!Number.isSafeInteger(k) || !Number.isSafeInteger(n) || n <= 0 || k < 0 || k > n)
    failInv("WILSON_INTERVAL", "$", "BAD_INTERVAL");
  const proportion = k / n;
  const denom = 1 + (Z95 * Z95) / n;
  const center = (proportion + (Z95 * Z95) / (2 * n)) / denom;
  const half = (Z95 * Math.sqrt((proportion * (1 - proportion) + (Z95 * Z95) / (4 * n)) / n)) / denom;
  return { low: Math.max(0, center - half), high: Math.min(1, center + half) };
}
