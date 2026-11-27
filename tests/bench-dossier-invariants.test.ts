import { describe, expect, it } from "vitest";
import {
  BenchInvariantError, compatibleMissionFieldShape, wilson95,
  type BenchInvariantCode,
} from "../src/bench-dossier/invariants.js";
import {
  BenchResultsValidationError, type BenchResultsErrorCode,
} from "../src/bench-dossier/results-guards.js";
import type { Mission } from "../src/scrap/extract.js";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

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

function makeMission(): Mission {
  return {
    instruction: "Extract Canadian offices.", tokenCap: 120000,
    reasoning_budget_tokens: 16384, calls_window_minutes: 60,
    price_table: {
      source: "openai", as_of: "2026-11-20", currency: "USD", status: "primary",
      per_million: { input: 1, output: 4, reasoning: 8 },
    },
    fields: [
      "headline",
      {
        name: "office", kind: "record", max_values: 3,
        fields: [{ name: "city", instruction: "City name" }, { name: "postal_code" }],
      },
      { name: "overflow_canadian_offices", kind: "scalar", max_values: 1 },
    ],
  };
}

describe("compatibleMissionFieldShape via specsOf", () => {
  it("accepts identical golden and candidate missions with nested record fields", () => {
    const golden = makeMission();
    expect(compatibleMissionFieldShape(golden, clone(golden))).toEqual({
      maxValuesChanged: false,
      goldenSpecs: [
        { name: "headline", kind: "scalar", maxValues: 1 },
        {
          name: "office", kind: "record", maxValues: 3,
          subFields: [{ name: "city", instruction: "City name" }, { name: "postal_code" }],
        },
        { name: "overflow_canadian_offices", kind: "scalar", maxValues: 1 },
      ],
      candidateSpecs: [
        { name: "headline", kind: "scalar", maxValues: 1 },
        {
          name: "office", kind: "record", maxValues: 3,
          subFields: [{ name: "city", instruction: "City name" }, { name: "postal_code" }],
        },
        { name: "overflow_canadian_offices", kind: "scalar", maxValues: 1 },
      ],
    });
  });

  it("refuses invalid specs, dotted/duplicate names and every shape mismatch", () => {
    const base = makeMission();
    const goldenErr = refuse(
      () => compatibleMissionFieldShape({ fields: null } as any, base),
      "MISSION_FIELD_SHAPE", "$.golden.fields",
    );
    expect(goldenErr.cause).toBeInstanceOf(Error);
    const candErr = refuse(
      () => compatibleMissionFieldShape(base, { fields: null } as any),
      "MISSION_FIELD_SHAPE", "$.cand.fields",
    );
    expect(candErr.cause).toBeInstanceOf(Error);
    const badCases: [(golden: any, candidate: any) => void, BenchInvariantCode, string][] = [
      [(golden) => { golden.fields = []; }, "MISSION_FIELD_SHAPE", "$.golden.fields"],
      [(_, candidate) => { candidate.fields = []; }, "MISSION_FIELD_SHAPE", "$.cand.fields"],
      [(golden) => { golden.fields[0] = "a.b"; }, "FIELD_NAME_DOT", "$.golden.fields[0].name"],
      [(_, candidate) => { candidate.fields[0] = "a.b"; }, "FIELD_NAME_DOT", "$.cand.fields[0].name"],
      [(golden) => { golden.fields[1].fields[0].name = "c.d"; }, "FIELD_NAME_DOT", "$.golden.fields[1].fields[0].name"],
      [
        (_, candidate) => { candidate.fields[1].fields[1].name = "p.c"; },
        "FIELD_NAME_DOT", "$.cand.fields[1].fields[1].name",
      ],
      [(golden) => { golden.fields.push("headline"); }, "DUPLICATE_FIELD", "$.golden.fields[3].name"],
      [
        (golden) => { golden.fields[1].fields.push({ name: "city" }); },
        "DUPLICATE_FIELD", "$.golden.fields[1].fields[2].name",
      ],
      [(_, candidate) => { candidate.fields.pop(); }, "MISSION_FIELD_SHAPE", "$.cand.fields"],
      [(_, candidate) => { candidate.fields[0] = "title"; }, "MISSION_FIELD_SHAPE", "$.cand.fields[0].name"],
      [
        (_, candidate) => { candidate.fields[0] = { name: "headline", kind: "record", fields: [{ name: "v" }] }; },
        "MISSION_FIELD_SHAPE", "$.cand.fields[0].kind",
      ],
      [
        (_, candidate) => { candidate.fields[0] = { name: "headline", max_values: 2 }; },
        "MISSION_FIELD_SHAPE", "$.cand.fields[0].max_values",
      ],
      [(_, candidate) => { candidate.fields[1].max_values = 1; }, "MISSION_FIELD_SHAPE", "$.cand.fields[1].max_values"],
      [(_, candidate) => { candidate.fields[1].fields.pop(); }, "MISSION_FIELD_SHAPE", "$.cand.fields[1].fields"],
      [
        (_, candidate) => { candidate.fields[1].fields[1].name = "province"; },
        "MISSION_FIELD_SHAPE", "$.cand.fields[1].fields[1].name",
      ],
    ];
    for (const [mutate, invariant, path] of badCases) {
      const golden = clone(base);
      const candidate = clone(base);
      mutate(golden, candidate);
      refuse(() => compatibleMissionFieldShape(golden, candidate), invariant, path);
    }
  });
});
