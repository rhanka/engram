import { describe, expect, it } from "vitest";
import {
  BenchResultsValidationError, booleanValue, countInt, fieldsOf, finiteNumber,
  nonEmptyString, nonNegativeNumber, objectSchema, positiveNumber, requireString, unitInterval,
  validateClosedObject, type BenchResultsErrorCode,
} from "../src/bench-dossier/results-guards.js";

function refuse(fn: () => void, code: BenchResultsErrorCode, expectedPath: string): void {
  let caught: unknown;
  try { fn(); } catch (err) { caught = err; }
  expect(caught).toBeInstanceOf(BenchResultsValidationError);
  const err = caught as BenchResultsValidationError;
  expect(err.name).toBe("BenchResultsValidationError");
  expect([err.code, err.path]).toEqual([code, expectedPath]);
}

describe("BenchResults guards", () => {
  it("validates closed objects, fieldsOf, and scalar numeric/string/boolean guards", () => {
    const schema = objectSchema<{ name: string; count: number; opt?: number }>(
      { ...fieldsOf(["name"], nonEmptyString), count: countInt },
      { opt: positiveNumber },
    );
    schema({ name: "arm-1", count: 0 }, "$");
    schema(Object.assign(Object.create(null), { name: "arm-2", count: 3, opt: 0.5 }), "$");
    for (const bad of [null, [], "x", 42, new Date()]) refuse(() => schema(bad, "$"), "NOT_OBJECT", "$");
    refuse(() => schema({ name: "arm-1", count: 0, extra: 1 }, "$"), "UNKNOWN_KEY", "$.extra");
    refuse(() => schema({ name: "arm-1" }, "$"), "MISSING_KEY", "$.count");
    refuse(() => validateClosedObject({ count: 0 }, "$", { toString: nonEmptyString, count: countInt }),
      "MISSING_KEY", "$.toString");
    refuse(() => schema({ name: 1, count: 0 }, "$"), "WRONG_TYPE", "$.name");
    refuse(() => schema({ name: "   ", count: 0 }, "$"), "EMPTY_STRING", "$.name");
    refuse(() => schema({ name: "ok", count: -1 }, "$"), "BAD_COUNT", "$.count");
    refuse(() => schema({ name: "ok", count: 1.5 }, "$"), "BAD_COUNT", "$.count");
    refuse(() => schema({ name: "ok", count: Number.MAX_SAFE_INTEGER + 1 }, "$"), "BAD_COUNT", "$.count");
    refuse(() => schema({ name: "ok", count: 0, opt: 0 }, "$"), "NON_POSITIVE", "$.opt");
    refuse(() => requireString(1, "$.s"), "WRONG_TYPE", "$.s");
    refuse(() => booleanValue("true", "$.b"), "WRONG_TYPE", "$.b");
    for (const badNum of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      refuse(() => finiteNumber(badNum, "$.f"), "NON_FINITE", "$.f");
    }
    nonNegativeNumber(0, "$.nn");
    refuse(() => nonNegativeNumber(-0.001, "$.nn"), "NEGATIVE", "$.nn");
    unitInterval(0, "$.u");
    unitInterval(1, "$.u");
    refuse(() => unitInterval(-0.001, "$.u"), "UNIT_RANGE", "$.u");
    refuse(() => unitInterval(1.001, "$.u"), "UNIT_RANGE", "$.u");
    const ioErr = new BenchResultsValidationError("IO_ERROR", "/missing.json", { errno: "ENOENT" });
    expect([ioErr.name, ioErr.code, ioErr.errno, ioErr.message]).toEqual([
      "BenchResultsValidationError", "IO_ERROR", "ENOENT", "IO_ERROR at /missing.json (ENOENT)",
    ]);
  });
});
