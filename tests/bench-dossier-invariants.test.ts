import { describe, expect, it } from "vitest";
import {
  BenchInvariantError, wilson95,
  type BenchInvariantCode,
} from "../src/bench-dossier/invariants.js";
import {
  BenchResultsValidationError, type BenchResultsErrorCode,
} from "../src/bench-dossier/results-guards.js";

function refuse(
  runCheck: () => void,
  invariant: BenchInvariantCode,
  expectedPath: string,
  code: BenchResultsErrorCode = "BAD_SHAPE",
): BenchInvariantError {
  let caught: unknown;
  try {
    runCheck();
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(BenchResultsValidationError);
  expect(caught).toBeInstanceOf(BenchInvariantError);
  const err = caught as BenchInvariantError;
  expect([err.name, err.code, err.invariant, err.path]).toEqual([
    "BenchInvariantError", code, invariant, expectedPath,
  ]);
  return err;
}

describe("wilson95 and BenchInvariantError", () => {
  it("matches exact 95/95 Wilson bounds, endpoint clamping and BenchInvariantError metadata", () => {
    const w95 = wilson95(95, 95);
    expect(Math.abs(w95.low - 0.9611351464605271)).toBeLessThan(1e-12);
    expect(w95.high).toBe(1);
    const wZero = wilson95(0, 1);
    expect(wZero.low).toBe(0);
    expect(Math.abs(wZero.high - 0.7934506856227626)).toBeLessThan(1e-12);
    const wHalf = wilson95(6, 12);
    expect(Math.abs(wHalf.low - 0.2537815976337061)).toBeLessThan(1e-12);
    expect(Math.abs(wHalf.high - 0.7462184023662939)).toBeLessThan(1e-12);
    const wClampLow = wilson95(0, 21);
    expect(wClampLow.low).toBe(0);
    expect(Math.abs(wClampLow.high - 0.154639018924847)).toBeLessThan(1e-12);
    const wClampHigh = wilson95(16, 16);
    expect(Math.abs(wClampHigh.low - 0.8063923194655637)).toBeLessThan(1e-12);
    expect(wClampHigh.high).toBe(1);
    const defaultErr = new BenchInvariantError("COUNT_IDENTITY", "$.x");
    expect(defaultErr).toBeInstanceOf(BenchResultsValidationError);
    expect([
      defaultErr.name, defaultErr.code, defaultErr.invariant, defaultErr.path, defaultErr.message,
    ]).toEqual([
      "BenchInvariantError", "BAD_SHAPE", "COUNT_IDENTITY", "$.x", "COUNT_IDENTITY (BAD_SHAPE) at $.x",
    ]);
    expect(defaultErr.cause).toBeUndefined();
    const rootCause = new Error("root");
    const withCause = new BenchInvariantError("COUNT_IDENTITY", "$.x", "BAD_SHAPE", rootCause);
    expect(withCause.cause).toBe(rootCause);
  });

  it("refuses out-of-range, non-positive-n, unsafe or non-integer wilson95 inputs", () => {
    for (const [k, n] of [
      [-1, 10], [11, 10], [0, 0], [0, -1], [1.5, 10], [1, 10.5],
      [Number.NaN, 10], [1, Number.POSITIVE_INFINITY],
      [1, Number.MAX_SAFE_INTEGER + 1],
      [Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER + 2],
    ] as const) {
      refuse(() => wilson95(k, n), "WILSON_INTERVAL", "$", "BAD_INTERVAL");
    }
  });
});
