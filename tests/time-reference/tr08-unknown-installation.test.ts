/** TR-08 — Unknown installation by default: no identified context, no milestones. */
import { describe, expect, it } from "vitest";
import {
  buildDeliveryMilestones,
  exportDigestOf,
  summarizeReviewRounds,
  validateCommittedExport,
  validatePullRequestTiming,
} from "../../src/time-reference/index.js";
import { fixtureJson, type GithubSample } from "./l0d.js";

function emptyExport(): Record<string, unknown> {
  const exp = {
    schema: "engram.time-reference/committed-export/1",
    repo: "rhanka/h2a",
    serviceRevision: "0.21.0",
    profileRef: { id: "repo-knowledge", version: "1", contentDigest: `sha256:${"0".repeat(64)}` },
    window: { from: "2026-10-17T04:53:00Z", to: "2026-10-18T07:48:00Z" },
    generatedAt: "2026-10-18T21:00:00Z",
    generator: { name: "engram-time-reference", version: "0.21.0" },
    series: [],
    estimates: [],
    budgets: [],
    milestones: [],
    provenance: [],
    exportDigest: `sha256:${"0".repeat(64)}`,
  };
  return { ...exp, exportDigest: exportDigestOf(exp) };
}

describe("TR-08 unknown installation (default)", () => {
  it("canonical pull-request records carry neither installedAt nor reviewRoundsActual", () => {
    const sample = fixtureJson("github-sample.json") as GithubSample;
    for (const row of sample.pullRequests) {
      expect("installedAt" in (row as Record<string, unknown>)).toBe(true); // archive posture…
    }
    // …but the canonical DTO refuses both fields on every row.
    const base = {
      schema: "engram.time-reference/pull-request-timing/1",
      repo: "rhanka/h2a",
      number: 327,
      createdAt: "2026-10-17T04:53:00Z",
      mergedAt: "2026-10-17T07:38:18Z",
      firstCommitAt: null,
      firstCommitPolicy: "proxy-only-excluded-from-forecasts",
      openToMergeSeconds: 9918,
      commits: null,
      commitsCollectionState: "not-collected",
    };
    expect(validatePullRequestTiming(base).ok).toBe(true);
    expect(validatePullRequestTiming({ ...base, installedAt: "unknown" }).ok).toBe(false);
    expect(validatePullRequestTiming({ ...base, reviewRoundsActual: null }).ok).toBe(false);
  });

  it("without an identified context, bootstrap data alone requires milestones: []", () => {
    expect(buildDeliveryMilestones(null, [])).toBe(null);
    expect(buildDeliveryMilestones(undefined, [])).toBe(null);
    expect(
      buildDeliveryMilestones(
        { repo: "x", lotRef: "", lotOccurrence: "", forecastRevision: "", forecastMergeAt: null, mergedAt: null, mergeSha: null },
        [],
      ),
    ).toBe(null);
    const checked = validateCommittedExport(emptyExport());
    expect(checked.ok).toBe(true);
    if (checked.ok) expect(checked.value.milestones).toEqual([]);
  });

  it("only a caller-injected identified context sources a DeliveryMilestonesV1", () => {
    const built = buildDeliveryMilestones(
      {
        repo: "rhanka/h2a",
        lotRef: "01KABCD",
        lotOccurrence: "occ-1",
        forecastRevision: "r1",
        forecastMergeAt: "2026-10-20T00:00:00Z",
        mergedAt: null,
        mergeSha: null,
      },
      [],
    );
    expect(built).not.toBe(null);
    // No target declared: empty installMilestones, rendered unknown with
    // that reason; merge verdict is pending while unmerged with a dated claim.
    expect(built?.record.installMilestones).toEqual([]);
    expect(built?.record.mergeMilestone.verdict).toBe("pending");
    // Merge verdicts are computed from instants.
    const held = buildDeliveryMilestones(
      {
        repo: "rhanka/h2a",
        lotRef: "01KABCD",
        lotOccurrence: "occ-1",
        forecastRevision: "r1",
        forecastMergeAt: "2026-10-20T00:00:00Z",
        mergedAt: "2026-10-19T00:00:00Z",
        mergeSha: "abc",
      },
      [],
    );
    expect(held?.record.mergeMilestone.verdict).toBe("held");
  });

  it("lot round totals stay null with a reason until coverage is attested", () => {
    const summary = summarizeReviewRounds("rhanka/h2a", "occ-1", [], null);
    expect(summary.completedCount).toBe(null);
    expect(summary.reviewerRunCount).toBe(null);
    expect(typeof summary.missingReason).toBe("string");
  });

  it("no code path invents a lot association, an installed instant or a round total from pull-request history", () => {
    // The canonical pull-request shape carries no lot, target, receipt or
    // round field to invent from.
    const base = {
      schema: "engram.time-reference/pull-request-timing/1",
      repo: "rhanka/h2a",
      number: 327,
      createdAt: "2026-10-17T04:53:00Z",
      mergedAt: "2026-10-17T07:38:18Z",
      firstCommitAt: null,
      firstCommitPolicy: "proxy-only-excluded-from-forecasts",
      openToMergeSeconds: 9918,
      commits: null,
      commitsCollectionState: "not-collected",
    };
    const checked = validatePullRequestTiming(base);
    expect(checked.ok).toBe(true);
    if (checked.ok) {
      for (const k of ["lotRef", "lotOccurrence", "forecastRevision", "installedAt", "reviewRoundsActual"]) {
        expect(k in checked.value).toBe(false);
      }
    }
  });
});
