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

const assertTpFpFn = (tp: number, fp: number, fn: number): [number, number, number] =>
  [assertCountInt(tp, "tp"), assertCountInt(fp, "fp"), assertCountInt(fn, "fn")];

export function computePointMetrics(tp: number, fp: number, fn: number): PointMetrics {
  const [t, fPos, fNeg] = assertTpFpFn(tp, fp, fn);
  return {
    precision: t + fPos > 0 ? t / (t + fPos) : null,
    recall: t + fNeg > 0 ? t / (t + fNeg) : null,
    f1: 2 * t + fPos + fNeg > 0 ? (2 * t) / (2 * t + fPos + fNeg) : null,
  };
}

export function computeIndeterminate(
  tp: number, fp: number, fn: number, floors: SupportFloorThresholds,
  groupSupport?: BenchResultRecord["independentGroupSupport"],
): BenchResultRecord["indeterminate"] {
  const [t, fPos, fNeg] = assertTpFpFn(tp, fp, fn);
  ensure(isPlainObject(floors), "NOT_OBJECT", "supportFloors must be a plain object");
  ensure(groupSupport === undefined || isPlainObject(groupSupport), "NOT_OBJECT", "groupSupport must be object");
  const pred = groupSupport
    ? assertCountInt(groupSupport.predictions, "independentGroupSupport.predictions") : t + fPos;
  const pos = groupSupport
    ? assertCountInt(groupSupport.positives, "independentGroupSupport.positives") : t + fNeg;
  const precision = pred < assertCountInt(floors.precisionMinPredictions, "precisionMinPredictions");
  const recall = pos < assertCountInt(floors.recallMinPositives, "recallMinPositives");
  return { precision, recall, f1: precision || recall };
}

export function computeUnweightedBlock(tp: number, fp: number, fn: number, independentCIs: boolean) {
  const intervalFor = (k: number, n: number) => (independentCIs ? wilson95(k, n) : clusteredInvalidInterval());
  return {
    ...computePointMetrics(tp, fp, fn),
    precisionInterval: intervalFor(tp, tp + fp),
    recallInterval: intervalFor(tp, tp + fn),
  };
}

export function buildSitePresenceMatrix(counts: SitePresenceCounts): SitePresenceMatrix {
  const goldPresentSites = counts.tpSites + counts.fnSites;
  const abstDen = counts.tnSites + counts.fpOnAbsentSites;
  return {
    ...counts, goldPresentSites,
    siteRecall: goldPresentSites > 0 ? counts.tpSites / goldPresentSites : null,
    siteRecallInterval: wilson95(counts.tpSites, goldPresentSites),
    siteAbstentionSpecificity: abstDen > 0 ? counts.tnSites / abstDen : null,
    siteAbstentionInterval: wilson95(counts.tnSites, abstDen),
  };
}

export function bestBroadSplit(candSet: ReadonlySet<string> | null, variants: readonly ReadonlySet<string>[]) {
  if (!candSet || candSet.size === 0) return { tp: 0, fp: 0, fn: Math.min(...variants.map((v) => v.size)) };
  let best = { tp: -1, fp: 0, fn: 0 };
  for (const v of variants) {
    let tp = 0;
    for (const x of v) if (candSet.has(x)) tp++;
    const fn = v.size - tp;
    if (tp > best.tp || (tp === best.tp && fn < best.fn)) best = { tp, fp: candSet.size - tp, fn };
  }
  return best;
}
