import { describe, expect, it } from "vitest";
import {
  BenchCostSeatError, parseResultsNdjson, parseValidatedPriceTable,
} from "../src/bench-dossier/cost-seat.js";

type CodedError = Error & { code?: string; path?: string };

function refuse(action: () => unknown, expectedCode: string, expectedPath: string): CodedError {
  let caught: unknown;
  try {
    action();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(Error);
  const typed = caught as CodedError;
  expect([typed.code, typed.path]).toEqual([expectedCode, expectedPath]);
  return typed;
}

describe("BD-4 tree-01: NDJSON parser, BenchCostSeatError, and price_table normalization", () => {
  it("parses valid NDJSON lines and rejects non-string, malformed JSON with cause, and non-object lines", () => {
    expect(parseResultsNdjson('{"id":"a1"}\r\n\n{"id":"a2"}\n')).toEqual([{ id: "a1" }, { id: "a2" }]);
    expect(parseResultsNdjson("  \n")).toEqual([]);
    refuse(() => parseResultsNdjson(123 as unknown as string), "WRONG_TYPE", "$");
    const badJson = refuse(() => parseResultsNdjson('{"id":"a1"}\n{bad'), "BAD_JSON", "$");
    expect(badJson.name).toBe("BenchResultsValidationError");
    expect(badJson.message).toBe("BAD_JSON at $");
    expect(badJson.cause).toBeInstanceOf(SyntaxError);
    refuse(() => parseResultsNdjson('{"id":"a1"}\n[]'), "NOT_OBJECT", "$.lines[1]");
    refuse(() => parseResultsNdjson("null"), "NOT_OBJECT", "$.lines[0]");
  });

  it("normalizes price_table defaults, explicit overrides, degradations, and typed error fields", () => {
    expect(parseValidatedPriceTable(undefined)).toBeNull();
    expect(parseValidatedPriceTable({
      source: "op", as_of: "2026-11-22", per_million: { input: 2, output: 10 },
    })).toEqual({
      source: "op", as_of: "2026-11-22", currency: "USD", status: "secondary_unverified",
      per_million: { input: 2, output: 10 },
    });
    expect(parseValidatedPriceTable({
      source: "op", as_of: "2026-11-22", currency: "CAD", status: "primary",
      per_million: { input: 2, output: 10, reasoning: 4 },
    })).toEqual({
      source: "op", as_of: "2026-11-22", currency: "CAD", status: "primary",
      per_million: { input: 2, output: 10, reasoning: 4 },
    });
    expect(parseValidatedPriceTable({
      source: "", as_of: "2026-11-22", per_million: { input: 2, output: 10 },
    })).toBeNull();
    expect(parseValidatedPriceTable({
      source: "op", as_of: "2026-02-30", per_million: { input: 2, output: 10 },
    })).toBeNull();
    for (const badTable of [null, [], new Date(), "bad"]) {
      refuse(() => parseValidatedPriceTable(badTable), "NOT_OBJECT", "$.priceTable");
    }
    const badCurrency = refuse(() => parseValidatedPriceTable({
      source: "op", as_of: "2026-11-22", currency: "EUR", per_million: { input: 2, output: 10 },
    }), "BAD_ENUM", "$.priceTable.currency");
    expect(badCurrency).toBeInstanceOf(BenchCostSeatError);
    expect(badCurrency.name).toBe("BenchCostSeatError");
    expect(badCurrency.message).toBe("BAD_ENUM at $.priceTable.currency");
    expect(badCurrency.cause).toBeInstanceOf(Error);
    const badStatus = refuse(() => parseValidatedPriceTable({
      source: "op", as_of: "2026-11-22", status: "verified", per_million: { input: 2, output: 10 },
    }), "BAD_ENUM", "$.priceTable.status");
    expect(badStatus.cause).toBeInstanceOf(Error);
    const directError = new BenchCostSeatError("BAD_SHAPE", "$.direct");
    expect([directError.name, directError.message, directError.cause]).toEqual([
      "BenchCostSeatError", "BAD_SHAPE at $.direct", undefined,
    ]);
  });
});
