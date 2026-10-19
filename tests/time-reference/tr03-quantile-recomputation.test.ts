/** TR-03 — Quantile recomputation from frozen instants (never rounded reported hours). */
import { describe, expect, it } from "vitest";
import {
  buildQuantileSet,
  nearestRank,
  openToMergeSample,
} from "../../src/time-reference/index.js";
import { cohortSamples, fixtureJson, normalizePr, type GithubSample } from "./l0d.js";

function trio(values: number[]): [number, number, number] {
  return [nearestRank(values, 0.5), nearestRank(values, 0.8), nearestRank(values, 0.95)];
}

describe("TR-03 quantile recomputation (bootstrap)", () => {
  const sample = fixtureJson("github-sample.json") as GithubSample;

  it("astra-merged-desc/1 gives 9918 / 46770 / 108177 s", () => {
    const values = cohortSamples(sample, "rhanka/h2a", "astra-merged-desc/1");
    expect(values).toHaveLength(20);
    expect(trio(values)).toEqual([9918, 46770, 108177]);
  });

  it("sol-created-desc/1 gives 9918 / 13240 / 46770 s", () => {
    const values = cohortSamples(sample, "rhanka/h2a", "sol-created-desc/1");
    expect(values).toHaveLength(20);
    expect(trio(values)).toEqual([9918, 13240, 46770]);
  });

  it("both h2a cohorts are emitted side by side with their rule identifiers", () => {
    const astra = cohortSamples(sample, "rhanka/h2a", "astra-merged-desc/1");
    const sol = cohortSamples(sample, "rhanka/h2a", "sol-created-desc/1");
    const view = [
      { ruleId: "astra-merged-desc/1", quantiles: trio(astra) },
      { ruleId: "sol-created-desc/1", quantiles: trio(sol) },
    ];
    expect(view.map((v) => v.ruleId)).toEqual(["astra-merged-desc/1", "sol-created-desc/1"]);
    // The two cohorts disagree (P95 108177 vs 46770): one alone is not the reference.
    expect(view[0]?.quantiles[2]).not.toBe(view[1]?.quantiles[2]);
  });

  it("engram enriched (n = 60) gives P50 1777 s, P80 3617 s, P95 23992 s", () => {
    const doc = fixtureJson("engram-enriched.json") as { pullRequests: Record<string, unknown>[] };
    expect(doc.pullRequests).toHaveLength(60);
    const values = doc.pullRequests.map((p) => {
      const pr = normalizePr("rhanka/engram", p);
      if (pr.openToMergeSeconds === null) throw new Error("enriched rows are all merged");
      return { id: `rhanka/engram#${pr.number}`, value: pr.openToMergeSeconds };
    });
    const set = buildQuantileSet(values, { method: "nearest-rank/1", support: "descriptive" });
    expect([set.p50Seconds, set.p80Seconds, set.p95Seconds]).toEqual([1777, 3617, 23992]);
    expect(set.support).toBe("descriptive");
    expect(set.calibrated).toBe(false);
    expect(set.sampleCount).toBe(60);
    expect(set.nEff).toEqual({ numerator: "60", denominator: "1" });
  });

  it("engram older (n = 121) gives P50 860 s, P80 12636 s, P95 244338 s", () => {
    const doc = fixtureJson("engram-older.json") as { pullRequests: Record<string, unknown>[] };
    expect(doc.pullRequests).toHaveLength(121);
    const values = doc.pullRequests.map((p) => {
      const pr = normalizePr("rhanka/engram", p);
      if (pr.openToMergeSeconds === null) throw new Error("older rows are all merged");
      return { id: `rhanka/engram#${pr.number}`, value: pr.openToMergeSeconds };
    });
    const set = buildQuantileSet(values, { method: "nearest-rank/1", support: "descriptive" });
    expect([set.p50Seconds, set.p80Seconds, set.p95Seconds]).toEqual([860, 12636, 244338]);
    expect(set.sampleCount).toBe(121);
  });

  it("reported-hours fields are never read as samples and never fill absent instants", () => {
    // A row whose instants are absent yields no sample even when an archived
    // reported-hours value exists beside it: no fallback exists.
    expect(openToMergeSample({ createdAt: "2026-10-18T08:42:22Z", mergedAt: null })).toBe(null);
    const doc = fixtureJson("engram-enriched.json") as { pullRequests: Record<string, unknown>[] };
    for (const p of doc.pullRequests) {
      expect("reportedOpenToMergeHours" in p).toBe(true); // archive posture…
      const pr = normalizePr("rhanka/engram", p);
      expect("reportedOpenToMergeHours" in pr).toBe(false); // …never the canonical sample
    }
  });
});
