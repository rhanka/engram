/** TR-02 — Closed DTOs: valid fixtures validate, every opening fails typed. */
import { describe, expect, it } from "vitest";
import {
  validateCiCheckBatch,
  validateCommittedExport,
  validateDeliveryMilestones,
  validatePullRequestTiming,
  validateQuantileSet,
  validateTimingSeries,
  type PullRequestTimingV1,
} from "../../src/time-reference/index.js";
import { fixtureJson, normalizeBatch, normalizePr, type GithubSample } from "./l0d.js";

function validPr(): PullRequestTimingV1 {
  const sample = fixtureJson("github-sample.json") as GithubSample;
  const row = sample.pullRequests.find((p) => p.number === 327) as Record<string, unknown>;
  return normalizePr("rhanka/h2a", row);
}

function codesOf(result: { ok: boolean; errors?: { code: string }[] }): string[] {
  return result.ok ? [] : (result.errors ?? []).map((e) => e.code);
}

describe("TR-02 closed DTOs", () => {
  it("a valid PullRequestTimingV1 validates", () => {
    expect(validatePullRequestTiming(validPr()).ok).toBe(true);
  });

  it("undeclared, missing and out-of-enumeration fields fail typed", () => {
    const base = validPr() as unknown as Record<string, unknown>;
    expect(codesOf(validatePullRequestTiming({ ...base, extra: 1 }))).toContain("undeclared-field");
    const { createdAt: _drop, ...missing } = base;
    expect(codesOf(validatePullRequestTiming(missing))).not.toHaveLength(0);
    expect(codesOf(validatePullRequestTiming({ ...base, commitsCollectionState: "sometimes" }))).toContain("bad-enum");
    expect(codesOf(validatePullRequestTiming({ ...base, schema: "engram.time-reference/pull-request-timing/2" }))).toContain(
      "bad-schema-literal",
    );
  });

  it("archived pull-request fields are rejected, never dual-read", () => {
    const base = validPr() as unknown as Record<string, unknown>;
    for (const field of ["reportedOpenToMergeHours", "reportedFirstCommitToMergeHours", "installedAt", "reviewRoundsActual"]) {
      expect(codesOf(validatePullRequestTiming({ ...base, [field]: field === "installedAt" ? "unknown" : null }))).toContain(
        "removed-field",
      );
    }
  });

  it("a CiCheckBatchV1 carrying pr is rejected; number is canonical", () => {
    const sample = fixtureJson("github-sample.json") as GithubSample;
    const batch = normalizeBatch("rhanka/h2a", sample.finalHeadChecks[0] as Record<string, unknown>);
    expect(validateCiCheckBatch(batch).ok).toBe(true);
    const withPr = { ...(batch as unknown as Record<string, unknown>), pr: batch.number };
    delete (withPr as Record<string, unknown>)["number"];
    expect(codesOf(validateCiCheckBatch(withPr))).toContain("archived-spelling");
  });

  it("nEff encoded as decimal string, float or bare number is refused", () => {
    const good = {
      schema: "engram.time-reference/quantile-set/1",
      quantileMethod: "nearest-rank/1",
      support: "descriptive",
      calibrated: false,
      sampleCount: 20,
      nEff: { numerator: "20", denominator: "1" },
      p50Seconds: 9918,
      p80Seconds: 46770,
      p95Seconds: 108177,
      tailQualification: "nEff 20/1: descriptive tail over 20 samples, 1 campaign",
    };
    expect(validateQuantileSet(good).ok).toBe(true);
    for (const nEff of ["20", 20, 1.0, { numerator: "20.0", denominator: "1" }, { numerator: "40", denominator: "2" }]) {
      expect(codesOf(validateQuantileSet({ ...good, nEff }))).toContain("invalid-neff");
    }
  });

  it("a TimingSeriesV1 exclusion without a reason fails", () => {
    const series = {
      schema: "engram.time-reference/timing-series/1",
      seriesId: "s",
      subject: "rhanka/h2a",
      metric: "pr_open_to_merge",
      cohortRef: { cohortKey: "astra-merged-desc/1", snapshotDigest: `sha256:${"0".repeat(64)}` },
      quantiles: {
        schema: "engram.time-reference/quantile-set/1",
        quantileMethod: "nearest-rank/1",
        support: "descriptive",
        calibrated: false,
        sampleCount: 1,
        nEff: { numerator: "1", denominator: "1" },
        p50Seconds: 1,
        p80Seconds: 1,
        p95Seconds: 1,
      },
      unit: "second",
      window: { from: "2026-10-17T04:53:00Z", to: "2026-10-18T07:48:00Z" },
      estimatorVersion: "e1",
      policyVersion: "p1",
      missingCount: 0,
      censoredCount: 0,
      exclusions: [{ id: 327, reason: "" }],
      fingerprint: {},
      measured: true,
    };
    expect(codesOf(validateTimingSeries(series))).toContain("missing-exclusion-reason");
  });

  it("commits/state mismatches fail", () => {
    const base = validPr() as unknown as Record<string, unknown>;
    expect(
      codesOf(validatePullRequestTiming({ ...base, commitsCollectionState: "collected", commits: null })),
    ).toContain("state-mismatch");
    expect(
      codesOf(validatePullRequestTiming({ ...base, commitsCollectionState: "not-collected", commits: [] })),
    ).toContain("state-mismatch");
  });

  it("duplicate installMilestones targetId fails", () => {
    const record = {
      schema: "engram.time-reference/delivery-milestones/1",
      repo: "rhanka/h2a",
      lotRef: "01KABCD",
      forecastRevision: "r1",
      mergeSha: null,
      mergeMilestone: { forecastAt: "2026-10-20T00:00:00Z", mergedAt: null, verdict: "pending" },
      installMilestones: [
        { targetId: "t", forecastAt: null, installedAt: "unknown", verdict: "unknown" },
        { targetId: "t", forecastAt: null, installedAt: "unknown", verdict: "unknown" },
      ],
    };
    expect(codesOf(validateDeliveryMilestones(record))).toContain("duplicate-target");
  });

  it("a CommittedExportV1 without milestones is refused", () => {
    const exp = {
      schema: "engram.time-reference/committed-export/1",
      repo: "rhanka/h2a",
      serviceRevision: "0.21.0",
      profileRef: { id: "repo-knowledge", version: "1", contentDigest: `sha256:${"0".repeat(64)}` },
      window: { from: "2026-10-17T04:53:00Z", to: "2026-10-18T07:48:00Z" },
      generatedAt: "2026-10-18T21:00:00Z",
      generator: { name: "engram", version: "0.21.0" },
      series: [],
      estimates: [],
      budgets: [],
      provenance: [],
      exportDigest: `sha256:${"0".repeat(64)}`,
    };
    expect(codesOf(validateCommittedExport(exp))).toContain("missing-milestones");
  });
});
