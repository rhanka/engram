/** Sol R1 F18 (§5.2) + F19 (§5.1) — Weight strictness and the full probability domain. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildQuantileSet,
  effectiveSizeRatio,
  nearestRank,
  parseDecimalWeight,
  parseP,
  weightedEcdf,
  type QuantileError,
  type WeightedEntry,
} from "../../src/time-reference/index.js";
import { drivenCases, solRule } from "./sol-r1-helpers.js";

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return (e as QuantileError).code ?? "thrown-without-code";
  }
  return "did-not-throw";
}

describe("Sol R1 F18/F19 weights and probabilities", () => {
  it("F18: only omitted weights default in every public quantile path", () => {
    const cases = JSON.parse(readFileSync(new URL("./fixtures/weight-type-cases.json", import.meta.url), "utf8")) as { weight?: unknown; presentUndefined?: boolean }[];
    expect(cases.length).toBeGreaterThan(0);
    for (const c of cases) {
      const entries = [{ id: "a", value: 100, weight: c.presentUndefined ? undefined : c.weight }] as WeightedEntry[];
      expect(codeOf(() => weightedEcdf(entries, 0.5))).toBe("invalid-weight");
      for (const method of ["nearest-rank/1", "weighted-ecdf/1"] as const) {
        for (const support of ["descriptive", "insufficient-evidence"] as const) {
          expect(codeOf(() => buildQuantileSet(entries, { method, support, tailQualification: "unavailable" }))).toBe("invalid-weight");
        }
      }
    }
    const entries = [{ id: "a", value: 100 }];
    expect(weightedEcdf(entries, 0.5)).toBe(100);
    for (const method of ["nearest-rank/1", "weighted-ecdf/1"] as const) {
      expect(buildQuantileSet(entries, { method, support: "descriptive" }).p50Seconds).toBe(100);
      expect(buildQuantileSet(entries, { method, support: "insufficient-evidence", tailQualification: "unavailable" }).p50Seconds).toBeNull();
    }
  });

  it("F18: every fixture case rejects through the public weight parsers", () => {
    const rule = solRule("F18") as { cases: { mutation: string }[] };
    for (const c of drivenCases("F18", rule.cases)) {
      if (c.mutation !== "numeric-weight") throw new Error(`unknown F18 mutation ${c.mutation}`);
      expect(codeOf(() => parseDecimalWeight(1 as unknown as string)), c.mutation).toBe(
        "invalid-weight",
      );
      expect(codeOf(() => effectiveSizeRatio([1 as unknown as string])), c.mutation).toBe(
        "invalid-weight",
      );
      expect(
        codeOf(() =>
          weightedEcdf(
            [{ id: "a", value: 1, weight: 2 as unknown as string }, { id: "b", value: 2 }],
            0.5,
          ),
        ),
        c.mutation,
      ).toBe("invalid-weight");
    }
    // String weights keep working, including decimals.
    expect(parseDecimalWeight("0.99")).toEqual({ num: 99n, den: 100n });
  });

  it("F19: the full probability domain parses exactly, including exponent forms", () => {
    const rule = solRule("F19") as { cases: { p: string; nearestRankOf: number[]; expected: number }[] };
    for (const c of drivenCases("F19", rule.cases)) {
      const p = Number(c.p);
      expect(p > 0 && p <= 1, c.p).toBe(true);
      expect(nearestRank(c.nearestRankOf, p), c.p).toBe(c.expected);
    }
    expect(parseP(1e-7)).toEqual({ num: 1n, den: 10000000n });
    expect(parseP(1)).toEqual({ num: 1n, den: 1n });
    // Out-of-domain probabilities are still refused.
    for (const p of [0, -0.5, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(codeOf(() => parseP(p))).toBe("invalid-p");
    }
  });
});
