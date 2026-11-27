import { BenchResultsValidationError, type BenchResultsErrorCode } from "./results-guards.js";
import type { BenchResultRecord } from "./results-types.js";
import type { FieldSpec } from "../scrap/extract.js";

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
export const sameNum = (left: number | null, right: number | null): boolean =>
  left === right || (left !== null && right !== null && Math.abs(left - right) <= 1e-12);
const sameRatio = (actual: number | null, num: number, denom: number): boolean =>
  sameNum(actual, denom === 0 ? null : num / denom);
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
export type InvCheck = readonly [string, boolean, BenchInvariantCode?, BenchResultsErrorCode?];
export function checkAll(base: string, items: readonly InvCheck[], defaultInv: BenchInvariantCode): void {
  for (const [key, ok, invariant = defaultInv, code = "BAD_SHAPE"] of items)
    if (!ok) failInv(invariant, `${base}.${key}`, code);
}

/** Validate currency, attempted/accepted counts, confusion equations, and sitePresence matrix identities. */
export function validateCountsAndSites(record: BenchResultRecord, base: string,
  goldenIds: number, currency: string, spec?: FieldSpec): void {
  const site = record.sitePresence;
  const isScalar = spec ? spec.kind === "scalar" : !record.field.includes(".");
  checkAll(base, [
    ["cost.currency", record.cost.currency === currency, "CURRENCY_MISMATCH"],
    ["attempted", record.attempted === goldenIds, "ATTEMPTED_MISMATCH"],
    ["accepted", record.accepted + record.failed === record.attempted],
    ["cost.costBasisItems", record.calls === "unknown" || record.cost.costBasisItems >= record.accepted, "COST_BASIS"],
    ["fp", record.fp === record.fpOnPresent + record.fpElementsOnAbsent],
    ["tp", record.tp + record.fn === record.goldPositive],
    ["fpElementsOnAbsent", (record.fpOnAbsent === 0 || (spec?.kind === "scalar" && spec.maxValues === 1))
      ? record.fpElementsOnAbsent === record.fpOnAbsent : record.fpElementsOnAbsent >= record.fpOnAbsent],
    ["tn", !isScalar || record.tn + record.fpOnAbsent + record.failedOnAbsent === record.goldAbsent],
    ["abstentionSpecificity", sameRatio(record.abstentionSpecificity, record.tn, record.tn + record.fpOnAbsent)],
  ], "COUNT_IDENTITY");
  checkAll(`${base}.sitePresence`, [
    ["tpSites", site.tpSites + site.fnSites === site.goldPresentSites],
    ["wrongValueOnPresentSites", site.wrongValueOnPresentSites <= site.fnSites],
    ["tnSites", site.tnSites + site.fpOnAbsentSites + site.failedOnAbsentSites === site.goldAbsentSites],
    ["goldPresentSites", site.goldPresentSites + site.goldAbsentSites
      + site.unresolvedSites + site.insufficientSites === record.attempted],
    ["siteRecall", sameRatio(site.siteRecall, site.tpSites, site.goldPresentSites)],
    ["siteAbstentionSpecificity",
      sameRatio(site.siteAbstentionSpecificity, site.tnSites, site.tnSites + site.fpOnAbsentSites)],
  ], "SITE_MATRIX_IDENTITY");
}
