/**
 * Export validator and regeneration check (spec sections 8.1, 9.5).
 *
 * Validate a CommittedExportV1, recompute its exportDigest, recompute every
 * quantile from its pinned samples and compare. Hand-edited export bytes
 * fail the regeneration check; generated facts are corrected through source
 * or generator, then regenerated. Pure: no I/O.
 */

import { exportDigestOf, sha256Hex } from "./canonical.js";
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
  for (const series of exp.series) {
    const samples = samplesBySeriesId[series.seriesId];
    if (samples === undefined) {
      errors.push({ code: "missing-samples", message: `no pinned samples for series ${JSON.stringify(series.seriesId)}`, path: `series.${series.seriesId}` });
      continue;
    }
    const rebuilt = buildQuantileSet(samples, {
      method: series.quantiles.quantileMethod,
      support: series.quantiles.support,
      tailQualification: series.quantiles.tailQualification,
      weightsPolicy: series.quantiles.weightsPolicy,
    });
    for (const f of ["p50Seconds", "p80Seconds", "p95Seconds", "sampleCount"] as const) {
      if (rebuilt[f] !== series.quantiles[f]) {
        errors.push({
          code: "quantile-mismatch",
          message: `series ${JSON.stringify(series.seriesId)} ${f}: stored ${String(series.quantiles[f])}, recomputed ${String(rebuilt[f])}`,
          path: `series.${series.seriesId}.quantiles.${f}`,
        });
      }
    }
    if (rebuilt.nEff.numerator !== series.quantiles.nEff.numerator
      || rebuilt.nEff.denominator !== series.quantiles.nEff.denominator) {
      errors.push({
        code: "neff-mismatch",
        message: `series ${JSON.stringify(series.seriesId)} nEff changed`,
        path: `series.${series.seriesId}.quantiles.nEff`,
      });
    }
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
