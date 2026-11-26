import type { BenchInterval, BenchResultRecord, BenchResultsFile, SitePresenceMatrix } from "./results-types.js";

export const WILSON_Z_95 = 1.959963984540054;
export type PointMetrics = Pick<BenchResultRecord, "precision" | "recall" | "f1">;
export type SupportFloorThresholds = Pick<BenchResultsFile["supportFloors"],
  "recallMinPositives" | "precisionMinPredictions">;
export type SitePresenceCounts = Pick<SitePresenceMatrix,
  | "goldAbsentSites" | "unresolvedSites" | "insufficientSites" | "tpSites" | "fnSites"
  | "wrongValueOnPresentSites" | "fpOnAbsentSites" | "tnSites" | "failedOnAbsentSites">;

export const metricsError = (code: string, msg: string, range = false): Error & { readonly code: string } =>
  Object.assign(range ? new RangeError(`${code}: ${msg}`) : new Error(`${code}: ${msg}`), { code });

export function ensure(cond: boolean, code: string, msg: string, range = false): asserts cond {
  if (!cond) throw metricsError(code, msg, range);
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  const proto = v && typeof v === "object" && !Array.isArray(v) ? Object.getPrototypeOf(v) : 0;
  return proto === Object.prototype || proto === null;
}

export function assertCountInt(value: unknown, name: string): number {
  ensure(typeof value === "number" && Number.isSafeInteger(value) && value >= 0,
    "BAD_COUNT", `${name} must be a non-negative safe integer, got ${String(value)}`, true);
  return value;
}

const invalidInterval = (clustering: BenchInterval["clustering"]): BenchInterval =>
  ({ estimator: "unweighted", method: "none", clustering, valid: false, low: null, high: null });

export const clusteredInvalidInterval = (): BenchInterval => invalidInterval("clustered_record_invalid");

export function wilson95(k: number, n: number): BenchInterval {
  const safeK = assertCountInt(k, "k");
  const safeN = assertCountInt(n, "n");
  ensure(safeK <= safeN, "K_EXCEEDS_N", `k (${safeK}) cannot exceed n (${safeN})`, true);
  if (safeN === 0) return invalidInterval("independent_site");
  const p = safeK / safeN;
  const z2 = WILSON_Z_95 * WILSON_Z_95;
  const d = 1 + z2 / safeN;
  const center = (p + z2 / (2 * safeN)) / d;
  const half = (WILSON_Z_95 * Math.sqrt((p * (1 - p) + z2 / (4 * safeN)) / safeN)) / d;
  return {
    estimator: "unweighted", method: "wilson_95_unweighted", clustering: "independent_site", valid: true,
    low: safeK === 0 ? 0 : Math.max(0, center - half), high: safeK === safeN ? 1 : Math.min(1, center + half),
  };
}
