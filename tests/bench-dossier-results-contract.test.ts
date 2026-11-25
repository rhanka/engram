import { describe, expect, it } from "vitest";
import {
  arrayOf, BenchResultsValidationError, booleanValue, countInt, enumValue, fieldsOf, finiteNumber,
  literalValue, nonEmptyString, nonNegativeNumber, nullable, objectSchema, positiveNumber,
  requireString, stringMapOf, unitInterval, unknownOr, validateBenchInterval,
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

  it("validates literal, enum, nullable, unknownOr, array, map and BenchInterval guards", () => {
    literalValue(1, "BAD_VERSION", finiteNumber)(1, "$.v");
    refuse(() => literalValue(1, "BAD_VERSION", finiteNumber)(2, "$.v"), "BAD_VERSION", "$.v");
    const cur = enumValue(["USD", "CAD"]);
    cur("USD", "$.c");
    refuse(() => cur(123, "$.c"), "WRONG_TYPE", "$.c");
    refuse(() => cur("EUR", "$.c"), "BAD_ENUM", "$.c");
    nullable(countInt)(null, "$.n");
    refuse(() => nullable(countInt)(undefined, "$.n"), "WRONG_TYPE", "$.n");
    unknownOr(countInt)("unknown", "$.u");
    refuse(() => unknownOr(countInt)(1.5, "$.u"), "BAD_COUNT", "$.u");
    arrayOf(nonEmptyString)(["a"], "$.a");
    refuse(() => arrayOf(nonEmptyString)("a", "$.a"), "NOT_ARRAY", "$.a");
    refuse(() => arrayOf(nonEmptyString)(["a", ""], "$.a"), "EMPTY_STRING", "$.a[1]");
    const sparse: string[] = []; sparse[1] = "a";
    refuse(() => arrayOf(nonEmptyString)(sparse, "$.a"), "WRONG_TYPE", "$.a[0]");
    refuse(() => stringMapOf(countInt)([], "$.m"), "NOT_OBJECT", "$.m");
    for (const k of ["", "  ", "__proto__", "constructor", "prototype"]) {
      const m: Record<string, number> = {};
      Object.defineProperty(m, k, { value: 1, enumerable: true, configurable: true });
      refuse(() => stringMapOf(countInt)(m, "$.m"), "BAD_MAP_KEY", `$.m.${k}`);
    }
    const base = { estimator: "unweighted", method: "wilson_95_unweighted",
      clustering: "independent_site", valid: true, low: 0.4, high: 0.8 };
    validateBenchInterval(base, "$.iv");
    validateBenchInterval({ ...base, method: "clopper_pearson_95_one_sided", high: null }, "$.iv");
    validateBenchInterval({ ...base, method: "none", clustering: "clustered_record_invalid",
      valid: false, low: null, high: null }, "$.iv");
    refuse(() => validateBenchInterval({ ...base, low: -0.01 }, "$.iv"), "INTERVAL_RANGE", "$.iv.low");
    refuse(() => validateBenchInterval({ ...base, high: 1.01 }, "$.iv"), "INTERVAL_RANGE", "$.iv.high");
    refuse(() => validateBenchInterval({ ...base, low: 0.9 }, "$.iv"), "INTERVAL_ORDER", "$.iv");
    refuse(() => validateBenchInterval({ ...base, clustering: "clustered_record_invalid" }, "$.iv"),
      "BAD_INTERVAL", "$.iv");
    refuse(() => validateBenchInterval({ ...base, method: "none" }, "$.iv"), "BAD_INTERVAL", "$.iv");
    refuse(() => validateBenchInterval({ ...base, low: null }, "$.iv"), "BAD_INTERVAL", "$.iv");
    refuse(() => validateBenchInterval({ ...base, high: null }, "$.iv"), "BAD_INTERVAL", "$.iv");
    refuse(() => validateBenchInterval({ ...base, valid: false }, "$.iv"), "BAD_INTERVAL", "$.iv");
  });
});
