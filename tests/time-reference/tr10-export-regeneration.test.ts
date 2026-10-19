/** TR-10 — Export binding and regeneration: digests bind, hand edits fail. */
import { describe, expect, it } from "vitest";
import {
  buildQuantileSet,
  exportDigestOf,
  regenerateCheck,
  validateCommittedExport,
  verifyExportDigest,
  type CommittedExportV1,
} from "../../src/time-reference/index.js";

const DIGEST0 = `sha256:${"0".repeat(64)}`;

function samples(): { id: string; value: number }[] {
  return [
    { id: "rhanka/h2a#1", value: 860 },
    { id: "rhanka/h2a#2", value: 1777 },
    { id: "rhanka/h2a#3", value: 3617 },
  ];
}

function sealedExport(over: Partial<Record<string, unknown>> = {}): CommittedExportV1 {
  const quantiles = buildQuantileSet(samples(), { method: "nearest-rank/1", support: "descriptive" });
  const series = {
    schema: "engram.time-reference/timing-series/1",
    seriesId: "s1",
    subject: "rhanka/h2a",
    metric: "pr_open_to_merge",
    cohortRef: { cohortKey: "astra-merged-desc/1", snapshotDigest: DIGEST0 },
    quantiles,
    unit: "second",
    window: { from: "2026-10-17T04:53:00Z", to: "2026-10-18T07:48:00Z" },
    estimatorVersion: "e1",
    policyVersion: "p1",
    missingCount: 0,
    censoredCount: 0,
    exclusions: [],
    fingerprint: {},
    measured: true,
  };
  const estimate = {
    schema: "engram.time-reference/timing-estimate/1",
    estimateId: "e1",
    seriesRef: { seriesId: "s1", snapshotDigest: DIGEST0 },
    quantiles,
    applicability: "applicable",
    freshness: {
      window: { from: "2026-10-17T04:53:00Z", to: "2026-10-18T07:48:00Z" },
      collectedAt: "2026-10-18T07:48:57Z",
      referencePublishedAt: "2026-10-18T21:00:00Z",
    },
    support: "descriptive",
    limitations: [],
  };
  const provenance = [
    {
      schema: "engram.time-reference/figure-provenance/1",
      figureRef: "s1",
      cohortKey: "astra-merged-desc/1",
      ruleId: "astra-merged-desc/1",
      snapshotDigest: DIGEST0,
      referenceDigest: DIGEST0,
      referencePublishedAt: "2026-10-18T21:00:00Z",
      referencePublicationRevision: "rev-1",
      collectedAt: "2026-10-18T07:48:57Z",
      firstAvailableAt: null,
      appliesToRevision: "46b82b42781709f2a2ab1bec6707ba58131248f0",
      fingerprintDigest: DIGEST0,
      estimatorVersion: "e1",
      policyVersion: "p1",
      quantileMethod: "nearest-rank/1",
    },
    {
      schema: "engram.time-reference/figure-provenance/1",
      figureRef: "e1",
      cohortKey: "astra-merged-desc/1",
      ruleId: "astra-merged-desc/1",
      snapshotDigest: DIGEST0,
      referenceDigest: DIGEST0,
      referencePublishedAt: "2026-10-18T21:00:00Z",
      referencePublicationRevision: "rev-1",
      collectedAt: "2026-10-18T07:48:57Z",
      firstAvailableAt: null,
      appliesToRevision: "46b82b42781709f2a2ab1bec6707ba58131248f0",
      fingerprintDigest: DIGEST0,
      estimatorVersion: "e1",
      policyVersion: "p1",
      quantileMethod: "nearest-rank/1",
    },
  ];
  const budget = {
    schema: "engram.time-reference/timing-budget/1",
    budgetId: "b1",
    subject: "rhanka/h2a",
    targetSeconds: 3600,
    rationale: "owner decision",
    decisionRef: "D1",
    owner: "gr-conductor",
    revisitTrigger: "regime drift",
  };
  const exp = {
    schema: "engram.time-reference/committed-export/1",
    repo: "rhanka/h2a",
    serviceRevision: "0.21.0",
    profileRef: { id: "repo-knowledge", version: "1", contentDigest: DIGEST0 },
    window: { from: "2026-10-17T04:53:00Z", to: "2026-10-18T07:48:00Z" },
    generatedAt: "2026-10-18T21:00:00Z",
    generator: { name: "engram-time-reference", version: "0.21.0" },
    series: [series],
    estimates: [estimate],
    budgets: [budget],
    milestones: [],
    provenance,
    exportDigest: DIGEST0,
    ...over,
  };
  return { ...exp, exportDigest: exportDigestOf(exp) } as unknown as CommittedExportV1;
}

describe("TR-10 export binding and regeneration", () => {
  it("a bound export validates and its digest recomputes exactly", () => {
    const exp = sealedExport();
    expect(validateCommittedExport(exp).ok).toBe(true);
    expect(verifyExportDigest(exp)).toEqual([]);
    expect(regenerateCheck(exp, { s1: samples() })).toEqual([]);
  });

  it("without serviceRevision, without the repo-knowledge@1 pin or without milestones it is refused", () => {
    const codes = (v: unknown): string[] => {
      const r = validateCommittedExport(v);
      return r.ok ? [] : r.errors.map((e) => e.code);
    };
    const base = sealedExport() as unknown as Record<string, unknown>;
    const { serviceRevision: _s, ...noService } = base;
    expect(codes(noService)).toContain("missing-service-binding");
    expect(codes({ ...base, profileRef: { id: "other", version: "1", contentDigest: DIGEST0 } })).toContain(
      "missing-profile-pin",
    );
    const { milestones: _m, ...noMilestones } = base;
    expect(codes(noMilestones)).toContain("missing-milestones");
  });

  it("an export entry carrying a combined held flag is refused", () => {
    const base = sealedExport() as unknown as Record<string, unknown>;
    const series = [{ ...(base["series"] as unknown[])[0] as Record<string, unknown>, held: true }];
    const r = validateCommittedExport({ ...base, series, exportDigest: (base as { exportDigest: string }).exportDigest });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.code)).toContain("combined-held-flag");
  });

  it("changing one sample changes the digest; a hand-edited export fails", () => {
    const exp = sealedExport();
    const changed = sealedExport();
    // 1777 -> 5000 moves P50 (1777 -> 3617), so the committed bytes no longer match.
    const otherSamples = [
      { id: "rhanka/h2a#1", value: 860 },
      { id: "rhanka/h2a#2", value: 5000 },
      { id: "rhanka/h2a#3", value: 3617 },
    ];
    // Regenerating from changed samples no longer matches the committed bytes.
    expect(regenerateCheck(exp, { s1: otherSamples }).map((d) => d.code)).toContain("quantile-mismatch");
    // A hand edit (one quantile touched, digest kept) fails the digest check.
    const edited = JSON.parse(JSON.stringify(exp)) as CommittedExportV1;
    edited.series[0]!.quantiles.p50Seconds = 999999;
    expect(verifyExportDigest(edited).map((d) => d.code)).toContain("digest-mismatch");
    // Regenerating the export from changed samples changes the digest.
    const rebuiltQuantiles = buildQuantileSet(otherSamples, { method: "nearest-rank/1", support: "descriptive" });
    const rebuiltSeries = [{ ...changed.series[0], quantiles: rebuiltQuantiles }];
    const rebuiltBytes = { ...(changed as unknown as Record<string, unknown>), series: rebuiltSeries };
    expect(exportDigestOf(rebuiltBytes)).not.toBe(changed.exportDigest);
  });
});
