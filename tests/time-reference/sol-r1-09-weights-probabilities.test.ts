/** Sol R1 F18 (§5.2) + F19 (§5.1) — Weight strictness and the full probability domain. */
import { describe, expect, it } from "vitest";
import {
  effectiveSizeRatio,
  nearestRank,
  parseDecimalWeight,
  parseP,
  weightedEcdf,
  type QuantileError,
} from "../../src/time-reference/index.js";
import { solRule } from "./sol-r1-helpers.js";

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return (e as QuantileError).code ?? "thrown-without-code";
  }
  return "did-not-throw";
}

describe("Sol R1 F18/F19 weights and probabilities", () => {
  it("F18: non-string weights are rejected, never coerced into strings", () => {
    solRule("F18");
    expect(codeOf(() => parseDecimalWeight(1 as unknown as string))).toBe("invalid-weight");
    expect(codeOf(() => effectiveSizeRatio([1 as unknown as string]))).toBe("invalid-weight");
    expect(
      codeOf(() =>
        weightedEcdf(
          [{ id: "a", value: 1, weight: 2 as unknown as string }, { id: "b", value: 2 }],
          0.5,
        ),
      ),
    ).toBe("invalid-weight");
    // String weights keep working, including decimals.
    expect(parseDecimalWeight("0.99")).toEqual({ num: 99n, den: 100n });
  });

  it("F19: the full probability domain parses exactly, including exponent forms", () => {
    const rule = solRule("F19") as { cases: { p: string; nearestRankOf: number[]; expected: number }[] };
    for (const c of rule.cases) {
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
