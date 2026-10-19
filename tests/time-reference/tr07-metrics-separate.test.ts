/** TR-07 — Metrics stay separate: service, longest job, envelope and span never merge. */
import { describe, expect, it } from "vitest";
import {
  ciEnvelopeSeconds,
  ciJobServiceSeconds,
  durationSeconds,
  lastCheckEndToMergeSeconds,
  nearestRank,
  openToMergeSample,
} from "../../src/time-reference/index.js";
import { cohortSamples, fixtureJson, normalizePr, type GithubSample } from "./l0d.js";

const T0 = "2026-10-18T10:00:00Z";
const at = (s: number): string => new Date(Date.parse(T0) + s * 1000).toISOString().replace(".000Z", "Z");

describe("TR-07 metrics stay separate", () => {
  it("parallel jobs: service sum, longest job, envelope and workflow span are four values", () => {
    // Two parallel jobs on one head: A runs [0, 100], B runs [50, 350].
    const a = { status: "completed", conclusion: "success", startedAt: at(0), completedAt: at(100) };
    const b = { status: "completed", conclusion: "success", startedAt: at(50), completedAt: at(350) };
    const serviceA = ciJobServiceSeconds(a);
    const serviceB = ciJobServiceSeconds(b);
    expect(serviceA).toBe(100);
    expect(serviceB).toBe(300);
    const serviceSum = (serviceA ?? 0) + (serviceB ?? 0);
    const longest = Math.max(serviceA ?? 0, serviceB ?? 0);
    const envelope = ciEnvelopeSeconds({ checks: [a, b] });
    // A workflow span (trigger to last job end) is a different clock again.
    const workflowSpan = durationSeconds("2026-10-18T09:59:00Z", at(350)).seconds;
    expect(serviceSum).toBe(400);
    expect(longest).toBe(300);
    expect(envelope).toBe(350);
    expect(workflowSpan).toBe(410);
    expect(new Set([serviceSum, longest, envelope, workflowSpan]).size).toBe(4);
  });

  it("Astra anchors: longest-job Q50 900 s, envelope Q50/Q80/Q95 1151/1635/2043 s", () => {
    const sample = fixtureJson("github-sample.json") as GithubSample;
    const astra = new Set(sample.cohorts["astra-merged-desc/1"]);
    const batches = sample.finalHeadChecks.filter((b) => astra.has(b.pr as number));
    expect(batches).toHaveLength(20);
    const all = batches.flatMap((b) => b.checks as { startedAt: string; completedAt: string }[]);
    expect(all).toHaveLength(285);
    const longest = batches.map((b) => {
      const services = (b.checks as { status: string; conclusion: string; startedAt: string; completedAt: string }[])
        .map((c) => ciJobServiceSeconds(c))
        .filter((v): v is number => v !== null);
      return Math.max(...services);
    });
    const envelopes = batches.map(
      (b) => ciEnvelopeSeconds(b as { checks: { status: string; conclusion: string; startedAt: string; completedAt: string }[] }) as number,
    );
    expect(nearestRank(longest, 0.5)).toBe(900);
    expect([nearestRank(envelopes, 0.5), nearestRank(envelopes, 0.8), nearestRank(envelopes, 0.95)]).toEqual([
      1151, 1635, 2043,
    ]);
  });

  it("Astra anchor: last-check-end to merge Q95 is 19491 s", () => {
    const sample = fixtureJson("github-sample.json") as GithubSample;
    const astra = new Set(sample.cohorts["astra-merged-desc/1"]);
    const byNumber = new Map((sample.pullRequests as { number: number; mergedAt: string }[]).map((p) => [p.number, p]));
    const gaps = sample.finalHeadChecks
      .filter((b) => astra.has(b.pr as number))
      .map((b) => {
        const mergedAt = (byNumber.get(b.pr as number) as { mergedAt: string }).mergedAt;
        return lastCheckEndToMergeSeconds(
          b as { checks: { startedAt: string; completedAt: string }[] },
          mergedAt,
        ) as number;
      });
    expect(nearestRank(gaps, 0.95)).toBe(19491);
  });

  it("CI time is never added to pr_open_to_merge", () => {
    const sample = fixtureJson("github-sample.json") as GithubSample;
    const values = cohortSamples(sample, "rhanka/h2a", "astra-merged-desc/1");
    expect(nearestRank(values, 0.5)).toBe(9918);
    // The open-to-merge sample comes from the pull-request instants alone:
    // no CI duration enters it. PR 327 carries the cohort max (424164 s).
    const row = (sample.pullRequests as Record<string, unknown>[]).find((p) => p["number"] === 327) as Record<string, string>;
    const recomputed = openToMergeSample({ createdAt: row["createdAt"], mergedAt: row["mergedAt"] });
    expect(recomputed).toBe(424164);
    expect(recomputed).toBe(
      (Date.parse(row["mergedAt"]) - Date.parse(row["createdAt"])) / 1000,
    );
  });

  it("firstCommitAt never produces a lot start; a committer date after open yields no negative duration", () => {
    // A committer date rewritten past the PR open (rebase) is still proxy
    // evidence: it never becomes a lot-start clock and never yields a
    // negative start_to_pr_open.
    expect(durationSeconds("2026-10-18T10:00:00Z", "2026-10-17T00:49:23Z").seconds).toBe(null);
    const pr = normalizePr("rhanka/engram", {
      number: 1,
      createdAt: "2026-10-18T08:42:22Z",
      mergedAt: "2026-10-18T09:02:15Z",
      firstCommitAt: "2026-10-19T00:00:00Z",
    });
    expect(pr.firstCommitPolicy).toBe("proxy-only-excluded-from-forecasts");
    expect(pr.openToMergeSeconds).toBe(1193);
    expect("lotStart" in pr).toBe(false);
  });
});
