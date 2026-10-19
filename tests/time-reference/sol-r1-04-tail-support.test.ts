/** Sol R1 F05 (§4.3, §6.5) — Effective tail thresholds and required qualifications. */
import { describe, expect, it } from "vitest";
import { validateQuantileSet } from "../../src/time-reference/index.js";
import { codesOf, solRule } from "./sol-r1-helpers.js";

interface F05Case {
  name: string;
  support: string;
  sampleCount: number;
  nEff: { numerator: string; denominator: string };
  p50Seconds: number | null;
  p80Seconds: number | null;
  p95Seconds: number | null;
  tailQualification?: string;
  expectOk: boolean;
  code?: string;
}

describe("Sol R1 F05 tail support and qualifications", () => {
  const rule = solRule("F05") as { cases: F05Case[] };

  it("tail thresholds and qualification rules hold per fixture case", () => {
    for (const c of rule.cases) {
      const set: Record<string, unknown> = {
        schema: "engram.time-reference/quantile-set/1",
        quantileMethod: "nearest-rank/1",
        support: c.support,
        calibrated: c.support === "calibrated",
        sampleCount: c.sampleCount,
        nEff: c.nEff,
        p50Seconds: c.p50Seconds,
        p80Seconds: c.p80Seconds,
        p95Seconds: c.p95Seconds,
      };
      if (c.tailQualification !== undefined) set["tailQualification"] = c.tailQualification;
      const r = validateQuantileSet(set);
      expect(r.ok, c.name).toBe(c.expectOk);
      if (!c.expectOk && c.code !== undefined) expect(codesOf(r), c.name).toContain(c.code);
    }
  });
});
