import { describe, expect, it } from "vitest";
import {
  assertCountInt, clusteredInvalidInterval, isPlainObject, wilson95,
} from "../src/bench-dossier/metrics-intervals.js";

function expectClose(actual: number | null, expected: number, eps = 1e-12): void {
  expect(actual).not.toBeNull();
  expect(Math.abs(actual! - expected)).toBeLessThan(eps);
}

function refuse(fn: () => unknown, code: string, Err: ErrorConstructor = Error, msg?: RegExp): void {
  let caught: unknown;
  try {
    fn();
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(Err);
  const typed = caught as Error & { code?: string };
  expect(typed.code).toBe(code);
  if (msg) expect(typed.message).toMatch(msg);
}

describe("wilson95, clusteredInvalidInterval & input guards", () => {
  it("checks plain objects and safe non-negative integer counts", () => {
    expect([isPlainObject({}), isPlainObject(Object.create(null))]).toEqual([true, true]);
    for (const bad of [null, undefined, "x", 1, [], new Date(), Object.setPrototypeOf([], null)]) {
      expect(isPlainObject(bad)).toBe(false);
    }
    expect(assertCountInt(0, "c")).toBe(0);
    expect(assertCountInt(Number.MAX_SAFE_INTEGER, "c")).toBe(Number.MAX_SAFE_INTEGER);
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, "1", null]) {
      refuse(() => assertCountInt(bad, "c"), "BAD_COUNT", RangeError, /^BAD_COUNT: c /);
    }
  });

  it("matches independently derived Wilson 95% bounds for 95/95, 7/10, 1/3, 0/7 and handles n=0", () => {
    // z = 1.959963984540054, z^2 = 3.8414588206941254, d = 1 + z^2/n,
    // center = (k/n + z^2/(2n))/d, half = z*sqrt((k/n)(1-k/n)/n + z^2/(4n^2))/d.
    const w95 = wilson95(95, 95); // 95/(95+z^2) = 0.9611351464605271, high = 1.
    expect([w95.estimator, w95.method, w95.clustering, w95.valid]).toEqual([
      "unweighted", "wilson_95_unweighted", "independent_site", true,
    ]);
    expectClose(w95.low, 0.9611351464605271);
    expect(w95.high).toBe(1);
    expect(wilson95(10, 10).high).toBe(1);
    expect(wilson95(30, 30).high).toBe(1);

    const w7 = wilson95(7, 10); // center=0.6444934400274221, half=0.24771529256627676
    expectClose(w7.low, 0.39677814746114537);
    expectClose(w7.high, 0.8922087325936989);
    const w1 = wilson95(1, 3); // center=0.42691617195917425, half=0.365424227238778
    expectClose(w1.low, 0.06149194472039621);
    expectClose(w1.high, 0.7923403991979522);
    const w0 = wilson95(0, 7); // high = z^2/(7+z^2) = 0.35433043506668743
    expect(w0.low).toBe(0);
    expectClose(w0.high, 0.35433043506668743);
    expect(wilson95(0, 0)).toEqual({
      estimator: "unweighted", method: "none", clustering: "independent_site", valid: false, low: null, high: null,
    });
    expect(clusteredInvalidInterval()).toEqual({
      estimator: "unweighted", method: "none", clustering: "clustered_record_invalid",
      valid: false, low: null, high: null,
    });
    for (const [k, n] of [[0, -1], [-1, 5], [1.5, 5], [1, 5.5], [Number.NaN, 5], [1, Infinity]]) {
      refuse(() => wilson95(k, n), "BAD_COUNT", RangeError);
    }
    refuse(() => wilson95(6, 5), "K_EXCEEDS_N", RangeError, /cannot exceed/);
  });
});
