/** TR-15 — Review-round separation: waves are lot facts, never pull-request fields. */
import { describe, expect, it } from "vitest";
import {
  buildQuantileSet,
  nearestRank,
  summarizeReviewRounds,
  validateReviewRoundsActual,
  validateReviewWaveManifest,
  type ReviewWaveManifestV1,
} from "../../src/time-reference/index.js";
import { normalizePr } from "./l0d.js";

function wave(roundId: string, reviewerRuns: string[], closed: boolean): ReviewWaveManifestV1 {
  return {
    schema: "engram.time-reference/review-wave-manifest/1",
    repo: "rhanka/h2a",
    lotOccurrence: "occ-1",
    roundId,
    candidateRevision: `rev-${roundId}`,
    submittedAt: "2026-10-18T10:00:00Z",
    submissionEvidenceRefs: [`ev-${roundId}`],
    requestEvidenceRefs: [],
    reviewerRuns: reviewerRuns.map((runId) => ({ runId, evidenceRefs: [`ev-${runId}`] })),
    resultEvidenceRefs: [],
    closureEvidenceRefs: [],
    closedAt: closed ? "2026-10-18T11:00:00Z" : null,
  };
}

describe("TR-15 review-round separation", () => {
  it("frozen wave counts [1, 1, 2, 3] give descriptive integer P50/P80/P95 1/3/3 (n = 4)", () => {
    const values = [1, 1, 2, 3];
    expect([nearestRank(values, 0.5), nearestRank(values, 0.8), nearestRank(values, 0.95)]).toEqual([1, 3, 3]);
  });

  it("two parallel reviewers of one submission count as one round and two reviewer runs", () => {
    const waves = [wave("r1", ["run-a", "run-b"], true)];
    expect(validateReviewWaveManifest(waves[0]).ok).toBe(true);
    const summary = summarizeReviewRounds("rhanka/h2a", "occ-1", waves, "coverage-1");
    expect(summary.completedCount).toBe(1);
    expect(summary.reviewerRunCount).toBe(2);
    expect(summary.status).toBe("complete");
    expect(validateReviewRoundsActual(summary).ok).toBe(true);
  });

  it("a corrected resubmission counts as a second round", () => {
    const summary = summarizeReviewRounds("rhanka/h2a", "occ-1", [wave("r1", ["run-a"], true), wave("r2", ["run-b"], false)], "coverage-1");
    expect(summary.completedCount).toBe(1);
    expect(summary.roundIds).toEqual(["r1", "r2"]);
    expect(summary.openRoundIds).toEqual(["r2"]);
    expect(summary.status).toBe("partial");
  });

  it("missing coverage yields null totals with a reason; an empty reviews array never yields zero", () => {
    const summary = summarizeReviewRounds("rhanka/h2a", "occ-1", [wave("r1", ["run-a"], true)], null);
    expect(summary.completedCount).toBe(null);
    expect(summary.reviewerRunCount).toBe(null);
    expect(typeof summary.missingReason).toBe("string");
    expect(summary.status).toBe("partial");
    const empty = summarizeReviewRounds("rhanka/h2a", "occ-1", [], null);
    expect(empty.completedCount).toBe(null);
    expect(empty.status).toBe("unknown");
    // Zero requires complete coverage plus evidence that no round occurred.
    expect(
      validateReviewRoundsActual({
        schema: "engram.time-reference/review-rounds-actual/1",
        repo: "rhanka/h2a",
        lotOccurrence: "occ-1",
        convention: "review-round/1",
        status: "partial",
        completedCount: 0,
        openRoundIds: [],
        reviewerRunCount: 0,
        roundIds: [],
        coverageManifestRef: "coverage-1",
        evidenceRefs: [],
      }).ok,
    ).toBe(false);
  });

  it("duration support never fills count fields; no historical wave is fabricated from L0-D pull requests", () => {
    const set = buildQuantileSet(
      [{ id: "a", value: 100 }],
      { method: "nearest-rank/1", support: "descriptive" },
    );
    for (const k of ["p50Count", "p80Count", "p95Count"]) expect(k in set).toBe(false);
    const pr = normalizePr("rhanka/h2a", {
      number: 327,
      createdAt: "2026-10-17T04:53:00Z",
      mergedAt: "2026-10-17T07:38:18Z",
    });
    for (const k of ["reviewRoundsActual", "roundId", "coverageManifestRef"]) expect(k in pr).toBe(false);
  });
});
