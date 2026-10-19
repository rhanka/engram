/** TR-05 — Missingness preserved: nulls, skips and incoherent checks never become samples. */
import { describe, expect, it } from "vitest";
import { ciJobServiceSeconds, openToMergeSample } from "../../src/time-reference/index.js";
import { fixtureJson } from "./l0d.js";

interface AnomalyCheck {
  id: number;
  name: string;
  status: string;
  conclusion: string;
  startedAt: string;
  completedAt: string;
}

describe("TR-05 missingness preserved", () => {
  it("a row with mergedAt null contributes no sample and is censored, never zero", () => {
    expect(openToMergeSample({ createdAt: "2026-10-18T08:42:22Z", mergedAt: null })).toBe(null);
  });

  it("frozen anomalies: engram PR 399 carries 3 checks at -1 s", () => {
    const doc = fixtureJson("skipped-check-anomalies.json") as { pullRequests: Record<string, unknown>[] };
    const pr = doc.pullRequests.find((p) => p["number"] === 399) as unknown as { checks: AnomalyCheck[] };
    expect(pr.checks).toHaveLength(3);
    for (const c of pr.checks) {
      expect(Date.parse(c.completedAt) - Date.parse(c.startedAt)).toBe(-1000);
      expect(ciJobServiceSeconds(c)).toBe(null);
    }
  });

  it("frozen anomalies: sentropic PR 697 carries 27 checks (16 at -1 s, 11 at 0 s)", () => {
    const doc = fixtureJson("skipped-check-anomalies.json") as { pullRequests: Record<string, unknown>[] };
    const pr = doc.pullRequests.find((p) => p["number"] === 697) as unknown as { checks: AnomalyCheck[] };
    expect(pr.checks).toHaveLength(27);
    const minus1 = pr.checks.filter((c) => Date.parse(c.completedAt) - Date.parse(c.startedAt) === -1000);
    const zero = pr.checks.filter((c) => Date.parse(c.completedAt) - Date.parse(c.startedAt) === 0);
    expect(minus1).toHaveLength(16);
    expect(zero).toHaveLength(11);
    for (const c of pr.checks) expect(ciJobServiceSeconds(c)).toBe(null);
  });

  it("all 30 anomaly checks satisfy completedAt <= startedAt and are quarantined, never averaged in", () => {
    const doc = fixtureJson("skipped-check-anomalies.json") as { pullRequests: Record<string, unknown>[] };
    const all = (doc.pullRequests as unknown as { checks: AnomalyCheck[] }[]).flatMap((p) => p.checks);
    expect(all).toHaveLength(30);
    for (const c of all) {
      expect(Date.parse(c.completedAt) <= Date.parse(c.startedAt)).toBe(true);
    }
    expect(all.every((c) => ciJobServiceSeconds(c) === null)).toBe(true);
  });

  it("a skipped check is never a service sample even with coherent timestamps", () => {
    expect(
      ciJobServiceSeconds({
        status: "completed",
        conclusion: "skipped",
        startedAt: "2026-10-18T08:50:51Z",
        completedAt: "2026-10-18T08:50:52Z",
      }),
    ).toBe(null);
  });
});
