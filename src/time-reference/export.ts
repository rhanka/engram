/**
 * Export validator and regeneration check (spec sections 8.1, 9.5).
 *
 * Validate a CommittedExportV1, recompute its exportDigest, recompute every
 * quantile from its pinned samples and compare. Hand-edited export bytes
 * fail the regeneration check; generated facts are corrected through source
 * or generator, then regenerated. Pure: no I/O.
 */

import { canonicalDigest, exportDigestOf, sha256Hex } from "./canonical.js";
import {
  effectiveSizeRatio,
  nearestRank,
  weightedEcdf,
  type WeightedEntry,
} from "./quantiles.js";
import type { CommittedExportV1, QuantileSetV1, SupportTier } from "./types.js";
import { SCHEMA_QUANTILE_SET } from "./types.js";
import { validateCommittedExport, type Diagnostic } from "./validators.js";

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

/**
 * Pinned snapshot digest over the canonical COLLECTED sample bytes (spec
 * section 6.1: any sample change changes the digest; identical pinned
 * inputs reproduce it). Only the collected `{id, value}` rows are hashed:
 * weights travel with the versioned weighting policy on the consumer side
 * (h2a spec D5), so a derived weight change never moves the snapshot
 * digest — it surfaces as an `nEff`/quantile mismatch instead. Builders
 * pin `cohortRef.snapshotDigest` with this function so that
 * `regenerateCheck` can authenticate externally supplied samples against
 * the digest committed in the export.
 */
export function sampleSnapshotDigest(samples: WeightedEntry[]): string {
  return canonicalDigest(samples.map(({ id, value }) => ({ id, value })));
}

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
  samplesBySeriesId: Record<string, WeightedEntry[]>,
): Diagnostic[] {
  const errors: Diagnostic[] = [];
  const structural = validateCommittedExport(exp);
  if (!structural.ok) return structural.errors;
  const bySeriesId = new Map(exp.series.map((s) => [s.seriesId, s]));
  for (const series of exp.series) {
    const samples = samplesBySeriesId[series.seriesId];
    if (samples === undefined) {
      errors.push({ code: "missing-samples", message: `no pinned samples for series ${JSON.stringify(series.seriesId)}`, path: `series.${series.seriesId}` });
      continue;
    }
    // Authenticate the supplied samples against the pinned snapshot digest
    // before any recomputation: changed samples fail here even when their
    // quantiles happen to be unchanged (spec section 6.1).
    if (sampleSnapshotDigest(samples) !== series.cohortRef.snapshotDigest) {
      errors.push({
        code: "sample-auth-mismatch",
        message: `series ${JSON.stringify(series.seriesId)} samples do not reproduce the pinned snapshotDigest`,
        path: `series.${series.seriesId}`,
      });
      continue;
    }
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
    const samples = samplesBySeriesId[estimate.seriesRef.seriesId];
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
