import { describe, expect, it } from "vitest";
import {
  BenchCostSeatError, parseResultsNdjson, parseValidatedPriceTable, summarizeInvocationUsage,
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

describe("BD-4 tree-02: summarizeInvocationUsage 1,705-ID census and trimmed digests", () => {
  it("computes 1,705-ID census costBasisItems, sums multi-invocation summaries, and trims digests", () => {
    const itemRows: Record<string, unknown>[] = Array.from({ length: 1705 }, (_, index) => ({ id: `s-${index + 1}` }));
    const allRows: Record<string, unknown>[] = [
      ...itemRows,
      {
        type: "summary", mission_digest: "  d1  ", ok: 1700, failed: 5, calls_total: 1705,
        tokens: { input: 500_000, output: 100_000, reasoning: 50_000, cached: 1200, total: 650_000 },
        cost: { currency: "USD", api_equivalent: 1.5 },
      },
      ...itemRows.slice(0, 5),
      {
        type: "summary", mission_digest: "d2", ok: 5, failed: 0, calls_total: 7,
        tokens: { input: 10_000, output: 2_000, reasoning: 1_000, cached: 300, total: 13_000 },
        cost: { currency: "USD", api_equivalent: 0.05 },
      },
    ];
    // 1712 / 1705 = 1.004105571847507331... (IEEE-754: 1.0041055718475074).
    expect(summarizeInvocationUsage(allRows)).toEqual({
      nonSummaryRows: 1710,
      summaryRows: 2,
      summaryItemCount: 1710,
      interrupted: false,
      costBasisItems: 1705,
      calls: 1712,
      callsPerItem: 1.0041055718475074,
      tokens: { input: 510_000, output: 102_000, reasoning: 51_000, cached: 1500, total: 663_000 },
      summaryApiTotal: 1.55,
      summaryCurrencies: ["USD"],
      missionDigests: ["d1", "d2"],
      hasMissingDigest: false,
    });
  });
});

describe("BD-4 tree-03: interrupted summaries, multi-summary degradation, and zero-basis calls", () => {
  it("handles empty runs, 0-item runs, zero-basis positive calls, and interrupted populated summaries", () => {
    expect(summarizeInvocationUsage([])).toEqual({
      nonSummaryRows: 0, summaryRows: 0, summaryItemCount: 0, interrupted: false, costBasisItems: 0,
      calls: "unknown", callsPerItem: "unknown", tokens: "unknown", summaryApiTotal: "unknown",
      summaryCurrencies: [], missionDigests: [], hasMissingDigest: false,
    });
    expect(summarizeInvocationUsage([{ type: "summary", ok: 0, failed: 0, calls_total: 0 }])).toEqual({
      nonSummaryRows: 0, summaryRows: 1, summaryItemCount: 0, interrupted: false, costBasisItems: 0,
      calls: 0, callsPerItem: 0, tokens: "unknown", summaryApiTotal: "unknown",
      summaryCurrencies: [], missionDigests: [], hasMissingDigest: true,
    });
    refuse(() => summarizeInvocationUsage([{ type: "summary", ok: 0, failed: 0, calls_total: 3 }]),
      "BAD_SHAPE", "$.calls");
    expect(summarizeInvocationUsage([{ type: "summary", ok: 0, failed: 0, calls_total: "unknown" }])).toEqual({
      nonSummaryRows: 0, summaryRows: 1, summaryItemCount: 0, interrupted: false, costBasisItems: 0,
      calls: "unknown", callsPerItem: "unknown", tokens: "unknown", summaryApiTotal: "unknown",
      summaryCurrencies: [], missionDigests: [], hasMissingDigest: true,
    });
    const noSummary = summarizeInvocationUsage([{ id: "a1" }, { id: "a2" }]);
    expect(noSummary).toEqual({
      nonSummaryRows: 2, summaryRows: 0, summaryItemCount: 0, interrupted: true, costBasisItems: 2,
      calls: "unknown", callsPerItem: "unknown", tokens: "unknown", summaryApiTotal: "unknown",
      summaryCurrencies: [], missionDigests: [], hasMissingDigest: false,
    });
    const fullPopulatedSummary = {
      type: "summary", mission_digest: "d1", ok: 1, failed: 0, calls_total: 2,
      tokens: { input: 10, output: 5, reasoning: 1, cached: 2, total: 16 },
      cost: { currency: "USD", api_equivalent: 1.5 },
    };
    const shortInterrupted = summarizeInvocationUsage([{ id: "a1" }, { id: "a2" }, fullPopulatedSummary]);
    expect(shortInterrupted).toEqual({
      nonSummaryRows: 2, summaryRows: 1, summaryItemCount: 1, interrupted: true, costBasisItems: 2,
      calls: "unknown", callsPerItem: "unknown", tokens: "unknown", summaryApiTotal: "unknown",
      summaryCurrencies: ["USD"], missionDigests: ["d1"], hasMissingDigest: false,
    });
    const retryInterrupted = summarizeInvocationUsage([{ id: "a1" }, { id: "a1" }, fullPopulatedSummary]);
    expect(retryInterrupted).toEqual({
      nonSummaryRows: 2, summaryRows: 1, summaryItemCount: 1, interrupted: true, costBasisItems: 1,
      calls: "unknown", callsPerItem: "unknown", tokens: "unknown", summaryApiTotal: "unknown",
      summaryCurrencies: ["USD"], missionDigests: ["d1"], hasMissingDigest: false,
    });
    const overInterrupted = summarizeInvocationUsage([{ id: "a1" }, { ...fullPopulatedSummary, ok: 2 }]);
    expect(overInterrupted).toEqual({
      nonSummaryRows: 1, summaryRows: 1, summaryItemCount: 2, interrupted: true, costBasisItems: 1,
      calls: "unknown", callsPerItem: "unknown", tokens: "unknown", summaryApiTotal: "unknown",
      summaryCurrencies: ["USD"], missionDigests: ["d1"], hasMissingDigest: false,
    });
  });

  it("degrades partial single and multi-summary usage across calls, tokens, cached, and cost", () => {
    const partialSingle = summarizeInvocationUsage([
      { id: "a1" },
      {
        type: "summary", ok: 1, failed: 0, calls_total: "unknown",
        tokens: "unknown", cost: { api_equivalent: "unknown" },
      },
    ]);
    expect([partialSingle.interrupted, partialSingle.calls, partialSingle.tokens, partialSingle.summaryApiTotal])
      .toEqual([false, "unknown", "unknown", "unknown"]);
    const baseSummary = {
      type: "summary", ok: 1, failed: 0, calls_total: 5,
      tokens: { input: 10, output: 20, reasoning: 0, cached: 4, total: 30 },
      cost: { currency: "USD", api_equivalent: 1.5 },
    };
    const multiMissingCalls = summarizeInvocationUsage([
      { id: "a1" }, baseSummary, { id: "a2" }, { ...baseSummary, calls_total: "unknown" },
    ]);
    expect([multiMissingCalls.calls, multiMissingCalls.callsPerItem]).toEqual(["unknown", "unknown"]);
    const multiMissingCached = summarizeInvocationUsage([
      { id: "a1" }, baseSummary,
      { id: "a2" }, { ...baseSummary, tokens: { input: 1, output: 2, reasoning: 0, total: 3 } },
    ]);
    expect(multiMissingCached.tokens).toEqual({ input: 11, output: 22, reasoning: 0, cached: "unknown", total: 33 });
    const multiMissingApi = summarizeInvocationUsage([
      { id: "a1" }, baseSummary, { id: "a2" }, { ...baseSummary, cost: { currency: "USD" } },
    ]);
    expect(multiMissingApi.summaryApiTotal).toBe("unknown");
    const multiMissingCostBlock = summarizeInvocationUsage([
      { id: "a1" }, baseSummary, { id: "a2" },
      { type: "summary", ok: 1, failed: 0, calls_total: 1, tokens: baseSummary.tokens },
    ]);
    expect(multiMissingCostBlock.summaryApiTotal).toBe("unknown");
    const multiMissingTokens = summarizeInvocationUsage([
      { id: "a1" }, baseSummary, { id: "a2" },
      { type: "summary", ok: 1, failed: 0, calls_total: 1, cost: baseSummary.cost },
    ]);
    expect(multiMissingTokens.tokens).toBe("unknown");
  });
});
