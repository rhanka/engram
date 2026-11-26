import { describe, expect, it } from "vitest";
import {
  assertCountInt, bestBroadSplit, buildSitePresenceMatrix, clusteredInvalidInterval, computeIndeterminate,
  computePointMetrics, computeUnweightedBlock, isPlainObject, wilson95,
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

  it("computes point metrics, support floors at 30/29, unweighted block, sitePresence & broad split", () => {
    expect(computePointMetrics(0, 0, 0)).toEqual({ precision: null, recall: null, f1: null });
    expect(computePointMetrics(0, 2, 0)).toEqual({ precision: 0, recall: null, f1: 0 });
    expect(computePointMetrics(0, 0, 3)).toEqual({ precision: null, recall: 0, f1: 0 });
    const pm = computePointMetrics(7, 3, 2);
    expectClose(pm.precision, 0.7);
    expectClose(pm.recall, 7 / 9);
    expectClose(pm.f1, 14 / 19);
    const floors = { precisionMinPredictions: 30, recallMinPositives: 30 };
    expect(computeIndeterminate(20, 10, 10, floors)).toEqual({ precision: false, recall: false, f1: false });
    expect(computeIndeterminate(19, 10, 11, floors)).toEqual({ precision: true, recall: false, f1: true });
    expect(computeIndeterminate(20, 10, 9, floors)).toEqual({ precision: false, recall: true, f1: true });
    expect(computeIndeterminate(25, 15, 15, floors, { predictions: 29, positives: 30 }))
      .toEqual({ precision: true, recall: false, f1: true });
    expect(computeIndeterminate(25, 15, 15, floors, { predictions: 30, positives: 29 }))
      .toEqual({ precision: false, recall: true, f1: true });
    expect(computeIndeterminate(0, 0, 0, { precisionMinPredictions: 0, recallMinPositives: 0 }))
      .toEqual({ precision: false, recall: false, f1: false });
    const badCounts: [() => unknown, RegExp][] = [
      [() => computePointMetrics(-1, 0, 0), /\btp\b/], [() => computePointMetrics(0, 1.5, 0), /\bfp\b/],
      [() => computePointMetrics(0, 0, Number.NaN), /\bfn\b/],
      [() => computeIndeterminate(1, 1, 1, { precisionMinPredictions: -1, recallMinPositives: 30 }), /precisionMin/],
      [() => computeIndeterminate(1, 1, 1, { precisionMinPredictions: 30, recallMinPositives: 1.5 }), /recallMin/],
      [() => computeIndeterminate(1, 1, 1, floors, { predictions: -1, positives: 30 }), /predictions/],
      [() => computeIndeterminate(1, 1, 1, floors, { predictions: 30, positives: -1 }), /positives/],
    ];
    for (const [fn, pattern] of badCounts) refuse(fn, "BAD_COUNT", RangeError, pattern);
    for (const bad of [[], new Date(), null]) refuse(() => computeIndeterminate(1, 1, 1, bad as any), "NOT_OBJECT");
    for (const bad of [[], new Date(), null]) {
      refuse(() => computeIndeterminate(1, 1, 1, floors, bad as any), "NOT_OBJECT");
    }
    const ind = computeUnweightedBlock(7, 3, 2, true);
    expectClose(ind.precisionInterval.low, 0.39677814746114537);
    expectClose(ind.recallInterval.high, 0.9367748928821533);
    expect(computeUnweightedBlock(7, 3, 2, false).precisionInterval).toEqual(clusteredInvalidInterval());
    const zeroSites = buildSitePresenceMatrix({
      goldAbsentSites: 0, unresolvedSites: 0, insufficientSites: 0, tpSites: 0, fnSites: 0,
      wrongValueOnPresentSites: 0, fpOnAbsentSites: 0, tnSites: 0, failedOnAbsentSites: 0,
    });
    expect([zeroSites.goldPresentSites, zeroSites.siteRecall, zeroSites.siteAbstentionSpecificity])
      .toEqual([0, null, null]);
    expect([zeroSites.siteRecallInterval.valid, zeroSites.siteAbstentionInterval.valid]).toEqual([false, false]);
    const nonEmpty = buildSitePresenceMatrix({
      goldAbsentSites: 4, unresolvedSites: 1, insufficientSites: 1, tpSites: 7, fnSites: 3,
      wrongValueOnPresentSites: 2, fpOnAbsentSites: 1, tnSites: 2, failedOnAbsentSites: 1,
    });
    expect(nonEmpty.goldPresentSites).toBe(10);
    expectClose(nonEmpty.siteRecall, 0.7);
    expectClose(nonEmpty.siteAbstentionSpecificity, 2 / 3);
    expectClose(nonEmpty.siteRecallInterval.low, 0.39677814746114537);
    expectClose(nonEmpty.siteRecallInterval.high, 0.8922087325936989);
    expectClose(nonEmpty.siteAbstentionInterval.low, 0.2076596008020477);
    expectClose(nonEmpty.siteAbstentionInterval.high, 0.9385080552796037);
    const v1 = new Set(["a", "b", "c"]), v2 = new Set(["a", "b"]), v3 = new Set(["d"]);
    expect(bestBroadSplit(null, [v1, v2])).toEqual({ tp: 0, fp: 0, fn: 2 });
    expect(bestBroadSplit(new Set(), [v1, v3])).toEqual({ tp: 0, fp: 0, fn: 1 });
    expect(bestBroadSplit(new Set(["a", "d"]), [v1, v3])).toEqual({ tp: 1, fp: 1, fn: 0 });
    expect(bestBroadSplit(new Set(["a", "x"]), [v1, v2])).toEqual({ tp: 1, fp: 1, fn: 1 });
  });
});
