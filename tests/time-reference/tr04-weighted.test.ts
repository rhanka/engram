/** TR-04 — Weighted quantiles: frozen values, exact ratio, rejections. */
import { describe, expect, it } from "vitest";
import {
  buildQuantileSet,
  effectiveSizeRatio,
  meetsTailSupport,
  parseEffectiveSizeRatio,
  weightedEcdf,
} from "../../src/time-reference/index.js";

function entries(values: number[], weights?: string[]) {
  return values.map((value, i) => ({ id: `obs-${i}`, value, ...(weights === undefined ? {} : { weight: weights[i] as string }) }));
}

describe("TR-04 weighted quantiles", () => {
  it("[10, 20, 100] with [1, 1, 98] gives P50/P80/P95 = 100", () => {
    const e = entries([10, 20, 100], ["1", "1", "98"]);
    expect([weightedEcdf(e, 0.5), weightedEcdf(e, 0.8), weightedEcdf(e, 0.95)]).toEqual([100, 100, 100]);
  });

  it("[10, 1000] with [99, 1] gives 10; unit weights give P80/P95 = 1000", () => {
    const skewed = entries([10, 1000], ["99", "1"]);
    expect([weightedEcdf(skewed, 0.5), weightedEcdf(skewed, 0.8), weightedEcdf(skewed, 0.95)]).toEqual([10, 10, 10]);
    const unit = entries([10, 1000]);
    expect(weightedEcdf(unit, 0.5)).toBe(10);
    expect([weightedEcdf(unit, 0.8), weightedEcdf(unit, 0.95)]).toEqual([1000, 1000]);
  });

  it('decimal-string weights ["0.99", "0.01"] match [99, 1]', () => {
    const e = entries([10, 1000], ["0.99", "0.01"]);
    expect([weightedEcdf(e, 0.5), weightedEcdf(e, 0.8), weightedEcdf(e, 0.95)]).toEqual([10, 10, 10]);
  });

  it("exact cumulative-boundary equality returns the boundary value", () => {
    expect(weightedEcdf(entries([10, 1000], ["1", "1"]), 0.5)).toBe(10);
  });

  it("rejects invalid weights, duplicate ids, empty series and invalid p", () => {
    for (const w of ["0", "-1", "abc", "", "1e3", "0.5.5", "12345678901234567", "1.1234567890123"]) {
      expect(() => weightedEcdf(entries([1, 2], [w, "1"]), 0.5)).toThrow();
    }
    expect(() => weightedEcdf([{ id: "a", value: 1 }, { id: "a", value: 2 }], 0.5)).toThrow();
    expect(() => weightedEcdf([], 0.5)).toThrow();
    for (const p of [0, -0.5, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => weightedEcdf(entries([1, 2]), p)).toThrow();
    }
  });

  it("n = 0 yields insufficient-evidence before the primitive runs", () => {
    const set = buildQuantileSet([], {
      method: "nearest-rank/1",
      support: "insufficient-evidence",
      tailQualification: "n=0: no observations",
    });
    expect([set.p50Seconds, set.p80Seconds, set.p95Seconds]).toEqual([null, null, null]);
    expect(() => buildQuantileSet([], { method: "nearest-rank/1", support: "descriptive" })).toThrow();
  });

  it("nEff for [1, 1, 98] is the reduced ratio 5000/4803", () => {
    expect(effectiveSizeRatio(["1", "1", "98"])).toEqual({ numerator: "5000", denominator: "4803" });
    expect(effectiveSizeRatio(Array(60).fill("1"))).toEqual({ numerator: "60", denominator: "1" });
  });

  it("decimal-string, floating-point, bare-number and non-reduced nEff are rejected", () => {
    expect(() => parseEffectiveSizeRatio("5000/4803")).toThrow();
    expect(() => parseEffectiveSizeRatio(1.041)).toThrow();
    expect(() => parseEffectiveSizeRatio({ numerator: "10000", denominator: "9606" })).toThrow();
    expect(() => parseEffectiveSizeRatio({ numerator: "60", denominator: "0" })).toThrow();
    expect(parseEffectiveSizeRatio({ numerator: "5000", denominator: "4803" })).toEqual({
      numerator: "5000",
      denominator: "4803",
    });
  });

  it("tail support needs 5 effective observations beyond the quantile", () => {
    expect(meetsTailSupport({ numerator: "5000", denominator: "4803" }, 0.95)).toBe(false);
    expect(meetsTailSupport({ numerator: "100", denominator: "1" }, 0.95)).toBe(true);
    expect(meetsTailSupport({ numerator: "100", denominator: "1" }, 0.8)).toBe(true);
  });
});
