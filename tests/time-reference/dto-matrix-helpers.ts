import * as api from "../../src/time-reference/index.js";
import {
  baseBatch, baseCohort, baseEstimate, baseExport, baseManifest, basePr,
  baseReceipt, baseSeries, baseWave, SOL_SHARED,
} from "./sol-r1-helpers.js";

export type FieldRow = [dto: string, path: string, format: string, presence: string, source: string];
export type Obj = Record<string, unknown>;
export const validators: Record<string, (value: unknown) => api.ValidationResult<unknown>> = {
  CollectionManifestV1: api.validateCollectionManifest,
  PullRequestTimingV1: api.validatePullRequestTiming,
  CiCheckBatchV1: api.validateCiCheckBatch,
  CohortV1: api.validateCohort,
  QuantileSetV1: api.validateQuantileSet,
  TimingSeriesV1: api.validateTimingSeries,
  TimingEstimateV1: api.validateTimingEstimate,
  TimingBudgetV1: api.validateTimingBudget,
  FigureProvenanceV1: api.validateFigureProvenance,
  DeliveryMilestonesV1: (v) => api.validateDeliveryMilestones(v, evidence()),
  InstallationReceiptV1: api.validateInstallationReceipt,
  CommittedExportV1: (v) => api.validateCommittedExport(v, [evidence()]),
  ReviewWaveManifestV1: api.validateReviewWaveManifest,
  ReviewRoundsActualV1: api.validateReviewRoundsActual,
};
export const samples = Array.from({ length: 100 }, (_, i) => ({ id: `sample-${i}`, value: 100 }));
const bytes = api.canonicalJson(samples);
const pin = api.sampleSnapshotDigest(bytes);
const digest = SOL_SHARED.digest0 as string;
export function quantiles(): api.QuantileSetV1 {
  return api.buildQuantileSet(samples, {
    method: "nearest-rank/1", support: "calibrated", weightsPolicy: "unit/1",
    tailQualification: "100 effective observations, 1 campaign",
  });
}
export function receipt(): api.InstallationReceiptV1 {
  return { ...baseReceipt(), artifactIntegrity: digest } as unknown as api.InstallationReceiptV1;
}
export function qualification(): api.TargetQualification {
  const r = receipt();
  return {
    expectedTargetKind: r.targetKind, expectedPlatform: r.platform,
    expectedInstallationScope: r.installationScope, expectedVersion: r.expectedVersion,
    expectedTuple: r.expectedTuple, expectedIntegrity: r.artifactIntegrity,
    expectedMergeSha: r.mergeSha, expectedReleaseSourceSha: r.releaseSourceSha,
    ancestryProven: true,
  };
}
export function evidence(r = receipt()): api.MilestoneEvidence {
  return { receipts: { receipt: r }, quals: { t: qualification() }, scope: { repo: r.repo, lotOccurrence: "occ-1" } };
}
function milestones(): api.DeliveryMilestonesV1 {
  return {
    schema: api.SCHEMA_DELIVERY_MILESTONES, repo: receipt().repo, lotRef: "lot-1",
    forecastRevision: "forecast-1", mergeSha: "m",
    mergeMilestone: { forecastAt: "2026-10-18T11:00:00Z", mergedAt: "2026-10-18T09:00:00Z", verdict: "held" },
    installMilestones: [{ targetId: "t", forecastAt: "2026-10-18T11:00:00Z", installedAt: receipt().smokeCompletedAt, verdict: "held", receiptRef: "receipt" }],
  };
}
export function provenance(figureRef = "s1"): Obj {
  return {
    schema: api.SCHEMA_FIGURE_PROVENANCE, figureRef, cohortKey: "astra-merged-desc/1",
    ruleId: "astra-merged-desc/1", snapshotDigest: pin, referenceDigest: digest,
    referencePublishedAt: "2026-10-18T21:00:00Z", referencePublicationRevision: "rev-1",
    collectedAt: "2026-10-18T07:48:57Z", firstAvailableAt: "2026-10-18T08:00:00Z",
    appliesToRevision: SOL_SHARED.sourceRevision, fingerprintDigest: SOL_SHARED.fingerprintDigest,
    estimatorVersion: "e1", policyVersion: "p1", quantileMethod: "nearest-rank/1",
  };
}
export function sealedExport(): api.CommittedExportV1 {
  const exp = {
    ...baseExport(),
    series: [{ ...baseSeries(), cohortRef: { cohortKey: "astra-merged-desc/1", snapshotDigest: pin }, quantiles: quantiles() }],
    estimates: [{ ...baseEstimate(), seriesRef: { seriesId: "s1", snapshotDigest: pin }, quantiles: quantiles(), support: "calibrated", limitations: ["one campaign"] }],
    budgets: [{ schema: api.SCHEMA_TIMING_BUDGET, budgetId: "b1", subject: "lot-1", targetSeconds: 100, rationale: "target", decisionRef: "d1", owner: "team", revisitTrigger: "change" }],
    milestones: [milestones()], provenance: [provenance(), provenance("e1")],
  };
  return { ...exp, exportDigest: api.exportDigestOf(exp) } as unknown as api.CommittedExportV1;
}
export function baseDto(dto: string, path = ""): Obj {
  const exp = sealedExport();
  const objects: Record<string, unknown> = {
    CollectionManifestV1: { ...baseManifest(), exclusionIds: [998] },
    PullRequestTimingV1: { ...basePr(), url: "https://example.test/pr/327", headSha: "abc", mergeSha: "m" },
    CiCheckBatchV1: { ...baseBatch(), pageSize: 100, page: 1, hasNextPage: false, checks: [{ ...(baseBatch().checks as Obj[])[0], headSha: "abc", url: "https://example.test/check/1", checkSuiteId: 1 }] },
    CohortV1: baseCohort(), QuantileSetV1: quantiles(), TimingSeriesV1: exp.series[0],
    TimingEstimateV1: exp.estimates[0], TimingBudgetV1: exp.budgets[0],
    FigureProvenanceV1: exp.provenance[0], DeliveryMilestonesV1: exp.milestones[0],
    InstallationReceiptV1: receipt(), CommittedExportV1: exp,
    ReviewWaveManifestV1: { ...baseWave(), requestEvidenceRefs: ["request"], resultEvidenceRefs: ["result"], closureEvidenceRefs: ["closure"] },
    ReviewRoundsActualV1: { schema: api.SCHEMA_REVIEW_ROUNDS_ACTUAL, repo: receipt().repo, lotOccurrence: "occ-1", convention: "review-round/1", status: "complete", completedCount: 1, openRoundIds: ["r2"], reviewerRunCount: 2, roundIds: ["r1", "r2"], coverageManifestRef: "coverage", evidenceRefs: ["submission"], missingReason: "optional annotation" },
  };
  const obj = structuredClone(objects[dto]) as Obj;
  if (path.endsWith("boundSeconds")) {
    const budget = dto === "CommittedExportV1" ? (obj.budgets as Obj[])[0]! : obj;
    delete budget.targetSeconds;
    budget.boundSeconds = 100;
  }
  return obj;
}
export function mutate(base: Obj, path: string, value: unknown, omit = false): Obj {
  const out = structuredClone(base);
  const parts = path.replaceAll("[]", ".0").split(".");
  let parent: unknown = out;
  for (const part of parts.slice(0, -1)) parent = (parent as Obj)[part];
  if (omit) delete (parent as Obj)[parts.at(-1)!];
  else (parent as Obj)[parts.at(-1)!] = value;
  return out;
}

const embedded: Record<string, string> = {
  QuantileSetV1: "series.0.quantiles", TimingSeriesV1: "series.0", TimingEstimateV1: "estimates.0",
  TimingBudgetV1: "budgets.0", FigureProvenanceV1: "provenance.0", DeliveryMilestonesV1: "milestones.0",
};
/** Source DTOs are not export fields: the caller's injected snapshot adapter (§8.2)
 * validates them before deriving samples. Embedded DTOs and receipts use native paths. */
export function regeneration(dto: string, value: Obj, path = ""): api.Diagnostic[] {
  let exp = sealedExport();
  let ev = evidence();
  let snapshot = bytes;
  let adapter: api.SnapshotSampleAdapter = () => samples;
  if (dto === "CommittedExportV1") exp = value as unknown as api.CommittedExportV1;
  else if (embedded[dto]) exp = mutate(exp as unknown as Obj, embedded[dto]!, value) as unknown as api.CommittedExportV1;
  else if (dto === "InstallationReceiptV1") ev.receipts.receipt = value as unknown as api.InstallationReceiptV1;
  else {
    snapshot = api.canonicalJson(value);
    const sourcePin = api.sampleSnapshotDigest(snapshot);
    exp.series[0]!.cohortRef.snapshotDigest = sourcePin;
    exp.estimates[0]!.seriesRef.snapshotDigest = sourcePin;
    for (const p of exp.provenance) p.snapshotDigest = sourcePin;
    adapter = (source) => {
      if (!validators[dto]!(source).ok) throw new Error("invalid source DTO");
      return samples;
    };
  }
  // Reseal to ensure rejection is structural, never a stale export digest.
  if (!(dto === "CommittedExportV1" && path === "exportDigest")) {
    exp.exportDigest = api.exportDigestOf(exp as unknown as Obj);
  }
  return api.regenerateCheck(exp, { s1: snapshot }, adapter, [ev]);
}
