/**
 * Export validator and regeneration check (spec sections 8.1, 9.5).
 *
 * Validate a CommittedExportV1, recompute its exportDigest, recompute every
 * quantile from its pinned samples and compare. Hand-edited export bytes
 * fail the regeneration check; generated facts are corrected through source
 * or generator, then regenerated. Pure: no I/O.
 */

import { exportDigestOf, sha256Digest, sha256Hex } from "./canonical.js";
import {
  effectiveSizeRatio,
  nearestRank,
  weightedEcdf,
  type WeightedEntry,
} from "./quantiles.js";
import type { CommittedExportV1, QuantileSetV1, SupportTier, TimingSeriesV1 } from "./types.js";
import { SCHEMA_QUANTILE_SET } from "./types.js";
import { validateCommittedExport, type Diagnostic, type MilestoneEvidence } from "./validators.js";

export interface BuildQuantileOptions {
  method: "nearest-rank/1" | "weighted-ecdf/1";
  support: SupportTier;
  /** Required when support is insufficient-evidence or any quantile is null. */
  tailQualification?: string;
  weightsPolicy?: string;
}

/**
 * Build one QuantileSetV1 from pinned samples. n = 0 yields
 * insufficient-evidence nulls before the primitive runs (never zero).
 */
export function buildQuantileSet(entries: WeightedEntry[], opts: BuildQuantileOptions): QuantileSetV1 {
  // `insufficient-evidence` publishes null quantiles with a reason, never
  // zero and never computed values (spec section 6.5) — including for n > 0.
  if (opts.support === "insufficient-evidence") {
    if (!opts.tailQualification) throw new Error("insufficient-evidence publishes null quantiles with a reason");
    const set: QuantileSetV1 = {
      schema: SCHEMA_QUANTILE_SET,
      quantileMethod: opts.method,
      support: opts.support,
      calibrated: false,
      sampleCount: entries.length,
      nEff: entries.length === 0 ? { numerator: "0", denominator: "1" } : effectiveSizeRatio(entries.map((e) => e.weight ?? "1")),
      p50Seconds: null,
      p80Seconds: null,
      p95Seconds: null,
      tailQualification: opts.tailQualification,
    };
    if (opts.weightsPolicy !== undefined) set.weightsPolicy = opts.weightsPolicy;
    return set;
  }
  if (entries.length === 0) {
    throw new Error("n = 0 abstains: support must be insufficient-evidence");
  }
  const values = entries.map((e) => e.value);
  const weights = entries.map((e) => e.weight ?? "1");
  const nEff = effectiveSizeRatio(weights);
  const pick = (p: number): number =>
    opts.method === "nearest-rank/1"
      ? nearestRank(values, p)
      : weightedEcdf(entries, p);
  const set: QuantileSetV1 = {
    schema: SCHEMA_QUANTILE_SET,
    quantileMethod: opts.method,
    support: opts.support,
    calibrated: opts.support === "calibrated",
    sampleCount: entries.length,
    nEff,
    p50Seconds: pick(0.5),
    p80Seconds: pick(0.8),
    p95Seconds: pick(0.95),
    maxSeconds: Math.max(...values),
  };
  if (opts.tailQualification !== undefined) set.tailQualification = opts.tailQualification;
  if (opts.weightsPolicy !== undefined) set.weightsPolicy = opts.weightsPolicy;
  return set;
}

/** SHA-256 over the supplied collected snapshot bytes, before sample derivation (§6.1). */
export function sampleSnapshotDigest(snapshotBytes: string | Uint8Array): string {
  return sha256Digest(snapshotBytes);
}

/** Caller-owned, versioned metric/selection adapter over an authenticated snapshot (§8.2). */
export type SnapshotSampleAdapter = (snapshot: unknown, series: TimingSeriesV1) => WeightedEntry[];

/** Compare one rebuilt quantile set against its committed figure. */
function compareQuantiles(
  rebuilt: QuantileSetV1,
  stored: QuantileSetV1,
  path: string,
  errors: Diagnostic[],
): void {
  for (const f of ["p50Seconds", "p80Seconds", "p95Seconds", "sampleCount"] as const) {
    if (rebuilt[f] !== stored[f]) {
      errors.push({
        code: "quantile-mismatch",
        message: `${path} ${f}: stored ${String(stored[f])}, recomputed ${String(rebuilt[f])}`,
        path: `${path}.${f}`,
      });
    }
  }
  // `maxSeconds` is optional (spec section 6.5): a valid export may omit
  // it, so it is compared only when published.
  if ("maxSeconds" in stored && rebuilt.maxSeconds !== stored.maxSeconds) {
    errors.push({
      code: "quantile-mismatch",
      message: `${path} maxSeconds: stored ${String(stored.maxSeconds)}, recomputed ${String(rebuilt.maxSeconds)}`,
      path: `${path}.maxSeconds`,
    });
  }
  if (rebuilt.nEff.numerator !== stored.nEff.numerator
    || rebuilt.nEff.denominator !== stored.nEff.denominator) {
    errors.push({ code: "neff-mismatch", message: `${path} nEff changed`, path: `${path}.nEff` });
  }
}

/** Recompute the exportDigest and compare with the stored value. */
export function verifyExportDigest(exp: CommittedExportV1): Diagnostic[] {
  const expected = exportDigestOf(exp as unknown as Record<string, unknown>);
  if (expected !== exp.exportDigest) {
    return [{ code: "digest-mismatch", message: `exportDigest mismatch: stored ${exp.exportDigest}, recomputed ${expected}`, path: "exportDigest" }];
  }
  return [];
}

/**
 * Full regeneration check: structural validation, quantile recomputation
 * from pinned samples, then digest comparison. Any difference fails.
 */
export function regenerateCheck(
  exp: CommittedExportV1,
  snapshotBytesBySeriesId: Record<string, string | Uint8Array>,
  samplesFromSnapshot: SnapshotSampleAdapter,
  milestoneEvidence: readonly (MilestoneEvidence | undefined)[] = [],
): Diagnostic[] {
  const errors: Diagnostic[] = [];
  const structural = validateCommittedExport(exp, milestoneEvidence);
  if (!structural.ok) return structural.errors;
  const bySeriesId = new Map(exp.series.map((s) => [s.seriesId, s]));
  const samplesBySeriesId = new Map<string, WeightedEntry[]>();
  for (const series of exp.series) {
    const bytes = snapshotBytesBySeriesId[series.seriesId];
    if (bytes === undefined) {
      errors.push({ code: "missing-samples", message: `no pinned snapshot bytes for series ${JSON.stringify(series.seriesId)}`, path: `series.${series.seriesId}` });
      continue;
    }
    // Authenticate the collected bytes before parsing or deriving any sample.
    if (sampleSnapshotDigest(bytes) !== series.cohortRef.snapshotDigest) {
      errors.push({
        code: "sample-auth-mismatch",
        message: `series ${JSON.stringify(series.seriesId)} snapshot bytes do not reproduce the pinned snapshotDigest`,
        path: `series.${series.seriesId}`,
      });
      continue;
    }
    let samples: WeightedEntry[];
    try {
      const snapshot = JSON.parse(typeof bytes === "string" ? bytes : new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      samples = samplesFromSnapshot(snapshot, series);
    } catch {
      errors.push({ code: "invalid-snapshot", message: "authenticated snapshot cannot produce samples", path: `series.${series.seriesId}` });
      continue;
    }
    samplesBySeriesId.set(series.seriesId, samples);
    const rebuilt = buildQuantileSet(samples, {
      method: series.quantiles.quantileMethod,
      support: series.quantiles.support,
      tailQualification: series.quantiles.tailQualification,
      weightsPolicy: series.quantiles.weightsPolicy,
    });
    compareQuantiles(rebuilt, series.quantiles, `series.${series.seriesId}.quantiles`, errors);
  }
  for (const estimate of exp.estimates) {
    const series = bySeriesId.get(estimate.seriesRef.seriesId);
    if (series === undefined) {
      errors.push({ code: "missing-samples", message: `estimate ${JSON.stringify(estimate.estimateId)} references unknown series ${JSON.stringify(estimate.seriesRef.seriesId)}`, path: `estimates.${estimate.estimateId}` });
      continue;
    }
    if (estimate.seriesRef.snapshotDigest !== series.cohortRef.snapshotDigest) {
      errors.push({ code: "series-ref-mismatch", message: `estimate ${JSON.stringify(estimate.estimateId)} seriesRef does not pin the referenced series snapshot`, path: `estimates.${estimate.estimateId}.seriesRef` });
      continue;
    }
    const samples = samplesBySeriesId.get(estimate.seriesRef.seriesId);
    if (samples === undefined) {
      errors.push({ code: "missing-samples", message: `no pinned samples for estimate ${JSON.stringify(estimate.estimateId)}`, path: `estimates.${estimate.estimateId}` });
      continue;
    }
    const rebuilt = buildQuantileSet(samples, {
      method: estimate.quantiles.quantileMethod,
      support: estimate.quantiles.support,
      tailQualification: estimate.quantiles.tailQualification,
      weightsPolicy: estimate.quantiles.weightsPolicy,
    });
    compareQuantiles(rebuilt, estimate.quantiles, `estimates.${estimate.estimateId}.quantiles`, errors);
  }
  errors.push(...verifyExportDigest(exp));
  return errors;
}

export interface ContractPinFile {
  path: string;
  sha256: string;
}

/**
 * Offline consumer pin check (TR-11): every locked file's bytes hash to the
 * recorded digest. A locally re-created schema substituted for the locked
 * bytes fails here. Pure over supplied bytes.
 */
export function verifyContractPin(files: Record<string, string>, pin: ContractPinFile[]): Diagnostic[] {
  const errors: Diagnostic[] = [];
  for (const f of pin) {
    const bytes = files[f.path];
    if (bytes === undefined) {
      errors.push({ code: "pin-missing-file", message: `locked file ${JSON.stringify(f.path)} not supplied`, path: f.path });
      continue;
    }
    if (sha256Hex(bytes) !== f.sha256) {
      errors.push({ code: "pin-digest-mismatch", message: `locked file ${JSON.stringify(f.path)} digest mismatch`, path: f.path });
    }
  }
  return errors;
}
