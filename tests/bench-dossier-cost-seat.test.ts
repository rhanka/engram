import { describe, expect, it } from "vitest";
import {
  BenchCostSeatError, computeFromRates, convertCurrency, parseResultsNdjson, parseValidatedPriceTable,
  resolveApiCost, resolveSeat, roundCostNano, summarizeInvocationUsage,
} from "../src/bench-dossier/cost-seat.js";
import type { ArmManifestFile } from "../src/bench-dossier/companion-contracts.js";

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

function makeArm(patch: Partial<ArmManifestFile> = {}): ArmManifestFile {
  return {
    schemaId: "urn:engram:bench-arm-manifest:1.0.0",
    armId: "arm-a",
    provider: "OpenAI",
    model: "gpt-6-astra-low",
    modelLabel: "Astra low",
    proseName: "OpenAI Astra low",
    effort: "low",
    isCascade: false,
    ...patch,
  };
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

describe("BD-4 tree-04: nested usage row guards, Date rejections, and undefined-valued fields", () => {
  it("refuses one defect per vector on every nested usage field including Date instances", () => {
    const okTokens = { input: 1, output: 2, reasoning: 3, cached: 4, total: 10 };
    const okSummary = {
      type: "summary", ok: 1, failed: 0, calls_total: 1, tokens: okTokens, cost: { api_equivalent: 0.1 },
    };
    const negativeCases: [unknown, string, string][] = [
      ["bad", "NOT_ARRAY", "$.resultRows"],
      [[null], "NOT_OBJECT", "$.resultRows[0]"],
      [[Object.assign(new Date(), { id: "a1" })], "NOT_OBJECT", "$.resultRows[0]"],
      [[{ id: "a1", type: "item" }], "BAD_ENUM", "$.resultRows[0].type"],
      [[{ id: "a1", type: null }], "WRONG_TYPE", "$.resultRows[0].type"],
      [[{ id: "a1", type: 123 }], "WRONG_TYPE", "$.resultRows[0].type"],
      [[{}], "MISSING_KEY", "$.resultRows[0].id"],
      [[{ id: 123 }], "WRONG_TYPE", "$.resultRows[0].id"],
      [[{ id: "  " }], "EMPTY_STRING", "$.resultRows[0].id"],
      [[{ id: "a1" }, { type: "summary", failed: 0 }], "MISSING_KEY", "$.resultRows[1].ok"],
      [[{ id: "a1" }, { ...okSummary, ok: undefined }], "WRONG_TYPE", "$.resultRows[1].ok"],
      [[{ id: "a1" }, { ...okSummary, ok: -1 }], "BAD_COUNT", "$.resultRows[1].ok"],
      [[{ id: "a1" }, { type: "summary", ok: 1 }], "MISSING_KEY", "$.resultRows[1].failed"],
      [[{ id: "a1" }, { ...okSummary, failed: 1.5 }], "BAD_COUNT", "$.resultRows[1].failed"],
      [[{ id: "a1" }, { ...okSummary, mission_digest: 42 }], "WRONG_TYPE", "$.resultRows[1].mission_digest"],
      [[{ id: "a1" }, { ...okSummary, mission_digest: " " }], "EMPTY_STRING", "$.resultRows[1].mission_digest"],
      [[{ id: "a1" }, { ...okSummary, calls_total: -1 }], "BAD_COUNT", "$.resultRows[1].calls_total"],
      [[{ id: "a1" }, { ...okSummary, calls_total: "bad" }], "WRONG_TYPE", "$.resultRows[1].calls_total"],
      [[{ id: "a1" }, { ...okSummary, tokens: null }], "NOT_OBJECT", "$.resultRows[1].tokens"],
      [[{ id: "a1" }, { ...okSummary, tokens: Object.assign(new Date(), okTokens) }],
        "NOT_OBJECT", "$.resultRows[1].tokens"],
      [[{ id: "a1" }, { ...okSummary, tokens: { output: 2, reasoning: 3, total: 5 } }],
        "MISSING_KEY", "$.resultRows[1].tokens.input"],
      [[{ id: "a1" }, { ...okSummary, tokens: { ...okTokens, input: -1 } }],
        "BAD_COUNT", "$.resultRows[1].tokens.input"],
      [[{ id: "a1" }, { ...okSummary, tokens: { ...okTokens, output: 1.2 } }],
        "BAD_COUNT", "$.resultRows[1].tokens.output"],
      [[{ id: "a1" }, { ...okSummary, tokens: { ...okTokens, reasoning: -1 } }],
        "BAD_COUNT", "$.resultRows[1].tokens.reasoning"],
      [[{ id: "a1" }, { ...okSummary, tokens: { ...okTokens, total: -1 } }],
        "BAD_COUNT", "$.resultRows[1].tokens.total"],
      [[{ id: "a1" }, { ...okSummary, tokens: { ...okTokens, cached: -1 } }],
        "BAD_COUNT", "$.resultRows[1].tokens.cached"],
      [[{ id: "a1" }, { ...okSummary, tokens: { ...okTokens, cached: null } }],
        "WRONG_TYPE", "$.resultRows[1].tokens.cached"],
      [[{ id: "a1" }, { ...okSummary, cost: null }], "NOT_OBJECT", "$.resultRows[1].cost"],
      [[{ id: "a1" }, { ...okSummary, cost: Object.assign(new Date(), { api_equivalent: 0.1 }) }],
        "NOT_OBJECT", "$.resultRows[1].cost"],
      [[{ id: "a1" }, { ...okSummary, cost: { currency: 99 } }], "WRONG_TYPE", "$.resultRows[1].cost.currency"],
      [[{ id: "a1" }, { ...okSummary, cost: { currency: "EUR" } }], "BAD_ENUM", "$.resultRows[1].cost.currency"],
      [[{ id: "a1" }, { ...okSummary, cost: { api_equivalent: -0.01 } }],
        "NEGATIVE", "$.resultRows[1].cost.api_equivalent"],
      [[{ id: "a1" }, { ...okSummary, cost: { api_equivalent: "bad" } }],
        "WRONG_TYPE", "$.resultRows[1].cost.api_equivalent"],
    ];
    for (const [rows, code, path] of negativeCases) {
      refuse(() => summarizeInvocationUsage(rows as unknown[]), code, path);
    }
    const undefinedUsage = summarizeInvocationUsage([
      { id: "a1", type: undefined },
      {
        type: "summary", ok: 1, failed: 0, mission_digest: null, calls_total: undefined,
        tokens: undefined, cost: { currency: undefined, api_equivalent: undefined },
      },
    ]);
    expect([
      undefinedUsage.hasMissingDigest, undefinedUsage.calls,
      undefinedUsage.tokens, undefinedUsage.summaryApiTotal, undefinedUsage.summaryCurrencies,
    ]).toEqual([true, "unknown", "unknown", "unknown", []]);
  });
});

describe("BD-4 tree-05: exact-half nanodollar rounding, single-FX conversion, and rate pricing", () => {
  it("rounds exact halves half-up at 1e-9 and applies FX once only when currencies differ", () => {
    // 5e-10 = 0.5*1e-9 -> 1e-9; 1.5e-9 = 1.5*1e-9 -> 2e-9; 4.9e-10 -> 0; 0.001*1.0000005 -> 0.001000001.
    expect([
      roundCostNano(5e-10), roundCostNano(1.5e-9), roundCostNano(4.9e-10), roundCostNano(0.001 * 1.0000005),
    ]).toEqual([1e-9, 2e-9, 0, 0.001000001]);
    // 1 * 0.0005 / 1e6 = 5e-10 -> 1e-9; 3 * 0.0005 / 1e6 = 1.5e-9 -> 2e-9.
    expect(computeFromRates(
      { input: 1, output: 0, reasoning: 0, cached: "unknown", total: 1 },
      { input: 0.0005, output: 0 }, "USD", "USD", 1, undefined,
    )).toEqual({ costUnknownReason: null, apiEquivalentTotal: 1e-9, apiEquivalentPerItem: 1e-9 });
    expect(computeFromRates(
      { input: 3, output: 0, reasoning: 0, cached: "unknown", total: 3 },
      { input: 0.0005, output: 0 }, "USD", "USD", 1, undefined,
    )).toEqual({ costUnknownReason: null, apiEquivalentTotal: 2e-9, apiEquivalentPerItem: 2e-9 });
    const fxUsdToCad = { from: "USD" as const, to: "CAD" as const, rate: 1.385, source: "boc", asOf: "2026-11-22" };
    // Same currency skips FX (stays 2 even with USD->CAD fx present); USD->CAD multiplies once: 2 * 1.385 = 2.77.
    expect([
      convertCurrency(2, "CAD", "CAD", fxUsdToCad, "$.fx"),
      convertCurrency(2, "USD", "CAD", fxUsdToCad, "$.fx"),
    ]).toEqual([2, 2.77]);
    refuse(() => convertCurrency(2, "USD", "CAD", undefined, "$.fx"), "CURRENCY_MISMATCH", "$.fx");
    refuse(() => convertCurrency(2, "CAD", "USD", fxUsdToCad, "$.fx"), "CURRENCY_MISMATCH", "$.fx");
    refuse(() => convertCurrency(2, "USD", "CAD", { ...fxUsdToCad, from: "CAD" }, "$.fx"),
      "CURRENCY_MISMATCH", "$.fx");
    refuse(() => convertCurrency(2, "USD", "CAD", { ...fxUsdToCad, to: "USD" }, "$.fx"),
      "CURRENCY_MISMATCH", "$.fx");
  });

  it("computes rate pricing with reasoning check, 1,705-ID divisor, and zero-basis guard", () => {
    const fxUsdToCad = { from: "USD" as const, to: "CAD" as const, rate: 1.385, source: "boc", asOf: "2026-11-22" };
    const tokens = {
      input: 1_000_000, output: 200_000, reasoning: 50_000, cached: "unknown" as const, total: 1_250_000,
    };
    // USD = (1e6*1.5 + 2e5*6 + 5e4*12)/1e6 = 3.3 USD; CAD = 3.3*1.385 = 4.5705;
    // perItem = 4.5705/1705 = 0.00268064516129032258... (IEEE-754: 0.0026806451612903224).
    expect(computeFromRates(tokens, { input: 1.5, output: 6.0, reasoning: 12.0 }, "USD", "CAD", 1705, fxUsdToCad))
      .toEqual({
        costUnknownReason: null,
        apiEquivalentTotal: 4.5705,
        apiEquivalentPerItem: 0.0026806451612903224,
      });
    expect(computeFromRates(tokens, { input: 1.5, output: 6.0 }, "USD", "USD", 10, undefined)).toEqual({
      costUnknownReason: "reasoning-rate-missing", apiEquivalentTotal: "unknown", apiEquivalentPerItem: "unknown",
    });
    expect(computeFromRates(
      { input: 1_000_000, output: 0, reasoning: 0, cached: "unknown", total: 1_000_000 },
      { input: 2, output: 5 }, "USD", "USD", 10, undefined,
    )).toEqual({ costUnknownReason: null, apiEquivalentTotal: 2, apiEquivalentPerItem: 0.2 });
    expect(computeFromRates(
      { input: 0, output: 0, reasoning: 0, cached: "unknown", total: 0 },
      { input: 2, output: 5 }, "USD", "USD", 0, undefined,
    )).toEqual({ costUnknownReason: null, apiEquivalentTotal: 0, apiEquivalentPerItem: 0 });
    refuse(() => computeFromRates(tokens, { input: 1, output: 1, reasoning: 1 }, "USD", "USD", 0, undefined),
      "BAD_SHAPE", "$.cost.apiEquivalentTotal");
  });
});

describe("BD-4 tree-06: resolveApiCost priceTable fallback, summary rounding, and reasoning guards", () => {
  it("resolves priceTable fallback, summary nanodollar rounding, reasoning === 0, and zero-basis guards", () => {
    const fxUsdToCad = { from: "USD" as const, to: "CAD" as const, rate: 1.385, source: "boc", asOf: "2026-11-22" };
    const priceTableUsd = parseValidatedPriceTable({
      source: "op", as_of: "2026-11-22", currency: "USD", per_million: { input: 2, output: 8, reasoning: 10 },
    });
    const priceTableNoReas = parseValidatedPriceTable({
      source: "op", as_of: "2026-11-22", currency: "USD", per_million: { input: 2, output: 8 },
    });
    const usageUnknownApi = summarizeInvocationUsage([{ id: "a1" }, { id: "a2" }, {
      type: "summary", ok: 2, failed: 0, calls_total: 2,
      tokens: { input: 500_000, output: 100_000, reasoning: 20_000, total: 620_000 },
      cost: { currency: "USD", api_equivalent: "unknown" },
    }]);
    // (0.5e6*2 + 0.1e6*8 + 0.02e6*10)/1e6 = 2.0 USD; CAD = 2.0 * 1.385 = 2.77; perItem = 2.77 / 2 = 1.385.
    expect(resolveApiCost(usageUnknownApi, makeArm({ fx: fxUsdToCad }), priceTableUsd, "CAD")).toEqual({
      costUnknownReason: null, apiEquivalentTotal: 2.77, apiEquivalentPerItem: 1.385,
    });
    const usageNumeric = summarizeInvocationUsage([
      { id: "a1" }, { id: "a2" }, { type: "summary", ok: 2, failed: 0, cost: { currency: "USD", api_equivalent: 1.2 } },
    ]);
    expect(resolveApiCost(usageNumeric, makeArm({ fx: fxUsdToCad }), null, "CAD")).toEqual({
      costUnknownReason: null, apiEquivalentTotal: 1.662, apiEquivalentPerItem: 0.831,
    });
    // Summary-path roundCostNano: 0.1 + 0.2 = 0.30000000000000004 -> 0.3; 1e-9 * 1.5 = 1.5e-9 -> 2e-9.
    const usageFloatSum = summarizeInvocationUsage([
      { id: "a1" }, { type: "summary", ok: 1, failed: 0, cost: { currency: "USD", api_equivalent: 0.1 } },
      { id: "a2" }, { type: "summary", ok: 1, failed: 0, cost: { currency: "USD", api_equivalent: 0.2 } },
    ]);
    expect(resolveApiCost(usageFloatSum, makeArm(), null, "USD")).toEqual({
      costUnknownReason: null, apiEquivalentTotal: 0.3, apiEquivalentPerItem: 0.15,
    });
    const usageHalfNano = summarizeInvocationUsage([
      { id: "a1" }, { type: "summary", ok: 1, failed: 0, cost: { currency: "USD", api_equivalent: 1e-9 } },
    ]);
    expect(resolveApiCost(usageHalfNano, makeArm({
      fx: { from: "USD", to: "CAD", rate: 1.5, source: "boc", asOf: "2026-11-22" },
    }), null, "CAD")).toEqual({
      costUnknownReason: null, apiEquivalentTotal: 2e-9, apiEquivalentPerItem: 2e-9,
    });
    // pt lacking reasoning rate with tokens.reasoning === 0 or unknown tokens keeps numeric summaryApiTotal.
    const usageZeroReasNumeric = summarizeInvocationUsage([{ id: "a1" }, {
      type: "summary", ok: 1, failed: 0,
      tokens: { input: 500_000, output: 100_000, reasoning: 0, total: 600_000 },
      cost: { currency: "USD", api_equivalent: 9.99 },
    }]);
    expect(resolveApiCost(usageZeroReasNumeric, makeArm(), priceTableNoReas, "USD")).toEqual({
      costUnknownReason: null, apiEquivalentTotal: 9.99, apiEquivalentPerItem: 9.99,
    });
    const usageNoTokNumeric = summarizeInvocationUsage([{ id: "a1" }, {
      type: "summary", ok: 1, failed: 0, cost: { currency: "USD", api_equivalent: 8.88 },
    }]);
    expect(resolveApiCost(usageNoTokNumeric, makeArm(), priceTableNoReas, "USD")).toEqual({
      costUnknownReason: null, apiEquivalentTotal: 8.88, apiEquivalentPerItem: 8.88,
    });
    // pt WITH reasoning rate keeps numeric summaryApiTotal (7.77 != pt calculation) when reasoning > 0.
    const usagePosReasNumeric = summarizeInvocationUsage([{ id: "a1" }, {
      type: "summary", ok: 1, failed: 0,
      tokens: { input: 10, output: 10, reasoning: 5, total: 25 },
      cost: { currency: "USD", api_equivalent: 7.77 },
    }]);
    expect(resolveApiCost(usagePosReasNumeric, makeArm(), priceTableUsd, "USD")).toEqual({
      costUnknownReason: null, apiEquivalentTotal: 7.77, apiEquivalentPerItem: 7.77,
    });
    const zeroBasisUsage = summarizeInvocationUsage([{
      type: "summary", ok: 0, failed: 0, cost: { api_equivalent: 0 },
    }]);
    expect(resolveApiCost(zeroBasisUsage, makeArm(), null, "USD")).toEqual({
      costUnknownReason: null, apiEquivalentTotal: 0, apiEquivalentPerItem: 0,
    });
    refuse(() => resolveApiCost(summarizeInvocationUsage([
      { type: "summary", ok: 0, failed: 0, cost: { api_equivalent: 0.1 } },
    ]), makeArm(), null, "USD"), "BAD_SHAPE", "$.cost.apiEquivalentTotal");
  });
});

describe("BD-4 tree-07: resolveApiCost tariffOverride precedence, summary currency, and unknowns", () => {
  it("resolves tariffOverride CAD/USD precedence, summary currency fallback, and all CostUnknownReasons", () => {
    const fxUsdToCad = { from: "USD" as const, to: "CAD" as const, rate: 1.385, source: "boc", asOf: "2026-11-22" };
    const priceTableUsd = parseValidatedPriceTable({
      source: "op", as_of: "2026-11-22", currency: "USD", per_million: { input: 2, output: 8, reasoning: 10 },
    });
    const priceTableNoReas = parseValidatedPriceTable({
      source: "op", as_of: "2026-11-22", currency: "USD", per_million: { input: 2, output: 8 },
    });
    const priceTableCad = parseValidatedPriceTable({
      source: "op", as_of: "2026-11-22", currency: "CAD", per_million: { input: 2, output: 8 },
    });
    const usageUnknownApi = summarizeInvocationUsage([{ id: "a1" }, { id: "a2" }, {
      type: "summary", ok: 2, failed: 0, calls_total: 2,
      tokens: { input: 500_000, output: 100_000, reasoning: 20_000, total: 620_000 },
      cost: { currency: "USD", api_equivalent: "unknown" },
    }]);
    const overrideRates = {
      status: "primary" as const, source: "card", asOf: "2026-11-22",
      perMillion: { input: 4, output: 10, reasoning: 10 },
    };
    // Override USD = (5e5*4 + 1e5*10 + 2e4*10)/1e6 = 3.2; CAD = 3.2 * 1.385 = 4.432; perItem = 2.216.
    expect(resolveApiCost(usageUnknownApi, makeArm({ fx: fxUsdToCad, tariffOverride: overrideRates }), null, "CAD"))
      .toEqual({ costUnknownReason: null, apiEquivalentTotal: 4.432, apiEquivalentPerItem: 2.216 });
    // Probe P1: CAD tariffOverride.currency === targetCur ("CAD") succeeds even when arm.fx USD->CAD is set.
    expect(resolveApiCost(usageUnknownApi, makeArm({
      fx: fxUsdToCad, tariffOverride: { ...overrideRates, currency: "CAD" },
    }), priceTableNoReas, "CAD")).toEqual({
      costUnknownReason: null, apiEquivalentTotal: 3.2, apiEquivalentPerItem: 1.6,
    });
    // Override without currency inherits priceTable.currency ("CAD") even with USD->CAD arm.fx.
    expect(resolveApiCost(summarizeInvocationUsage([
      { id: "a1" }, {
        type: "summary", ok: 1, failed: 0,
        tokens: { input: 500_000, output: 100_000, reasoning: 0, total: 600_000 },
      },
    ]), makeArm({ fx: fxUsdToCad, tariffOverride: overrideRates }), priceTableCad, "CAD")).toEqual({
      costUnknownReason: null, apiEquivalentTotal: 3, apiEquivalentPerItem: 3,
    });
    // sumCur ("CAD") takes precedence over arm.fx.from ("USD") when pt is null (M36).
    expect(resolveApiCost(summarizeInvocationUsage([
      { id: "a1" }, { type: "summary", ok: 1, failed: 0, cost: { currency: "CAD", api_equivalent: 2 } },
    ]), makeArm({ fx: fxUsdToCad }), null, "CAD")).toEqual({
      costUnknownReason: null, apiEquivalentTotal: 2, apiEquivalentPerItem: 2,
    });
    // Missing sumCur and null pt: uses metadata override.currency ("CAD") over arm.fx.from ("USD"), else arm.fx.from.
    expect(resolveApiCost(summarizeInvocationUsage([
      { id: "a1" }, { type: "summary", ok: 1, failed: 0, cost: { api_equivalent: 2 } },
    ]), makeArm({
      fx: fxUsdToCad, tariffOverride: { status: "primary", currency: "CAD", source: "s", asOf: "d" },
    }), null, "CAD")).toEqual({ costUnknownReason: null, apiEquivalentTotal: 2, apiEquivalentPerItem: 2 });
    expect(resolveApiCost(summarizeInvocationUsage([
      { id: "a1" }, { type: "summary", ok: 1, failed: 0, cost: { api_equivalent: 2 } },
    ]), makeArm({ fx: fxUsdToCad }), null, "CAD")).toEqual({
      costUnknownReason: null, apiEquivalentTotal: 2.77, apiEquivalentPerItem: 2.77,
    });
    const usageNumericReas = summarizeInvocationUsage([{ id: "a1" }, {
      type: "summary", ok: 1, failed: 0,
      tokens: { input: 10, output: 10, reasoning: 5, total: 25 },
      cost: { currency: "USD", api_equivalent: 0.01 },
    }]);
    const usageNoTokens = summarizeInvocationUsage([{ id: "a1" }, { type: "summary", ok: 1, failed: 0 }]);
    expect(resolveApiCost(usageNumericReas, makeArm(), priceTableNoReas, "USD")).toEqual({
      costUnknownReason: "reasoning-rate-missing", apiEquivalentTotal: "unknown", apiEquivalentPerItem: "unknown",
    });
    expect(resolveApiCost(summarizeInvocationUsage([{ id: "a1" }]), makeArm(), priceTableUsd, "USD")).toEqual({
      costUnknownReason: "incomplete-invocation-summary",
      apiEquivalentTotal: "unknown", apiEquivalentPerItem: "unknown",
    });
    expect(resolveApiCost(usageNoTokens, makeArm({ tariffOverride: overrideRates }), null, "USD")).toEqual({
      costUnknownReason: "missing-usage", apiEquivalentTotal: "unknown", apiEquivalentPerItem: "unknown",
    });
    expect(resolveApiCost(usageNoTokens, makeArm(), priceTableUsd, "USD")).toEqual({
      costUnknownReason: "missing-usage", apiEquivalentTotal: "unknown", apiEquivalentPerItem: "unknown",
    });
    expect(resolveApiCost(usageNoTokens, makeArm(), null, "USD")).toEqual({
      costUnknownReason: "missing-usage", apiEquivalentTotal: "unknown", apiEquivalentPerItem: "unknown",
    });
    expect(resolveApiCost(summarizeInvocationUsage([
      { id: "a1" }, { type: "summary", ok: 1, failed: 0, tokens: { input: 1, output: 1, reasoning: 0, total: 2 } },
    ]), makeArm(), null, "USD")).toEqual({
      costUnknownReason: "unpriced-mission", apiEquivalentTotal: "unknown", apiEquivalentPerItem: "unknown",
    });
  });
});

describe("BD-4 tree-08: resolveApiCost symmetric currency guard matrix (both sides)", () => {
  it("refuses every currency conflict and allows every symmetric valid counterpart", () => {
    const fxUsdToCad = { from: "USD" as const, to: "CAD" as const, rate: 1.385, source: "boc", asOf: "2026-11-22" };
    const fxCadToUsd = { from: "CAD" as const, to: "USD" as const, rate: 0.72, source: "boc", asOf: "2026-11-22" };
    const fxUnitUsd = { from: "USD" as const, to: "USD" as const, rate: 1, source: "id", asOf: "2026-11-22" };
    const fxUnitCad = { from: "CAD" as const, to: "CAD" as const, rate: 1, source: "id", asOf: "2026-11-22" };
    const priceTableUsd = parseValidatedPriceTable({
      source: "op", as_of: "2026-11-22", currency: "USD", per_million: { input: 2, output: 4 },
    });
    const priceTableCad = parseValidatedPriceTable({
      source: "op", as_of: "2026-11-22", currency: "CAD", per_million: { input: 1, output: 2 },
    });
    const makeSummaryRows = (currency: "USD" | "CAD", id = "a1") => [
      { id }, { type: "summary", ok: 1, failed: 0, cost: { currency, api_equivalent: 1 } },
    ];
    const usageUsd = summarizeInvocationUsage(makeSummaryRows("USD"));
    const usageCad = summarizeInvocationUsage(makeSummaryRows("CAD"));
    const usageMixed = summarizeInvocationUsage([...makeSummaryRows("USD", "a1"), ...makeSummaryRows("CAD", "a2")]);
    const usageNoSumCur = summarizeInvocationUsage([
      { id: "a1" },
      {
        type: "summary", ok: 1, failed: 0,
        tokens: { input: 1_000_000, output: 0, reasoning: 0, total: 1_000_000 },
        cost: { api_equivalent: 10 },
      },
    ]);
    const usageNoSumCurUnk = summarizeInvocationUsage([
      { id: "a1" },
      {
        type: "summary", ok: 1, failed: 0,
        tokens: { input: 1_000_000, output: 0, reasoning: 0, total: 1_000_000 },
        cost: { api_equivalent: "unknown" },
      },
    ]);
    const usageCadWithTokens = summarizeInvocationUsage([{ id: "a1" }, {
      type: "summary", ok: 1, failed: 0,
      tokens: { input: 1000, output: 0, reasoning: 0, total: 1000 },
      cost: { currency: "CAD", api_equivalent: 1 },
    }]);
    const overrideRates = { input: 5, output: 1 };
    const mismatchVectors: [ReturnType<typeof summarizeInvocationUsage>, ArmManifestFile,
      typeof priceTableUsd, "USD" | "CAD", string][] = [
      [usageUsd, makeArm({ fx: fxUsdToCad }), null, "USD", "$.arm.fx.to"],
      [usageUsd, makeArm({ fx: { ...fxUnitUsd, rate: 1.2 } }), null, "USD", "$.arm.fx.rate"],
      [usageCad, makeArm({ fx: { ...fxUnitUsd, rate: 0.9 } }), null, "USD", "$.arm.fx.rate"],
      [usageCad, makeArm({ tariffOverride: {
        status: "primary", currency: "USD", source: "s", asOf: "d", perMillion: overrideRates,
      } }), null, "CAD", "$.arm.tariffOverride.currency"],
      [usageCad, makeArm({ fx: fxUnitCad, tariffOverride: {
        status: "primary", currency: "USD", source: "s", asOf: "d", perMillion: overrideRates,
      } }), null, "CAD", "$.arm.tariffOverride.currency"],
      [usageCad, makeArm({ tariffOverride: { status: "primary", currency: "USD", source: "s", asOf: "d" } }),
        null, "CAD", "$.arm.tariffOverride.currency"],
      [usageCad, makeArm({ fx: fxUsdToCad, tariffOverride: {
        status: "primary", currency: "USD", source: "s", asOf: "d",
      } }), null, "CAD", "$.arm.tariffOverride.currency"],
      // Probe P2 & P2b: metadata-only tariffOverride.currency !== priceTable.currency without sumCur.
      [usageNoSumCur, makeArm({ fx: fxCadToUsd, tariffOverride: {
        status: "primary", currency: "CAD", source: "ov", asOf: "2026-11-22",
      } }), priceTableUsd, "USD", "$.arm.tariffOverride.currency"],
      [usageNoSumCurUnk, makeArm({ fx: fxCadToUsd, tariffOverride: {
        status: "primary", currency: "CAD", source: "ov", asOf: "2026-11-22",
      } }), priceTableUsd, "USD", "$.arm.tariffOverride.currency"],
      [usageMixed, makeArm(), null, "USD", "$.resultRows"],
      [usageUsd, makeArm({ fx: fxUsdToCad }), priceTableCad, "CAD", "$.priceTable.currency"],
      [usageUsd, makeArm(), null, "CAD", "$.arm.fx"],
      [usageNoSumCur, makeArm(), priceTableUsd, "CAD", "$.arm.fx"],
      [usageCadWithTokens, makeArm({ tariffOverride: {
        status: "primary", source: "s", asOf: "d", perMillion: overrideRates,
      } }), priceTableUsd, "CAD", "$.arm.fx"],
    ];
    for (const [usage, arm, priceTable, targetCurrency, errorPath] of mismatchVectors) {
      refuse(() => resolveApiCost(usage, arm, priceTable, targetCurrency), "CURRENCY_MISMATCH", errorPath);
    }
    // Positive counterparts: matching metadata-only ov.currency and ov.perMillion overriding pt/sumCur.
    expect(resolveApiCost(usageNoSumCur, makeArm({
      fx: fxCadToUsd, tariffOverride: { status: "primary", currency: "USD", source: "ov", asOf: "2026-11-22" },
    }), priceTableUsd, "USD")).toEqual({ costUnknownReason: null, apiEquivalentTotal: 10, apiEquivalentPerItem: 10 });
    expect(resolveApiCost(usageCadWithTokens, makeArm({
      tariffOverride: { status: "primary", currency: "CAD", source: "s", asOf: "d", perMillion: overrideRates },
    }), priceTableUsd, "CAD")).toEqual({
      costUnknownReason: null, apiEquivalentTotal: 0.005, apiEquivalentPerItem: 0.005,
    });
    const usageUsdWithTokens = summarizeInvocationUsage([{ id: "a1" }, {
      type: "summary", ok: 1, failed: 0,
      tokens: { input: 1000, output: 0, reasoning: 0, total: 1000 },
      cost: { currency: "USD", api_equivalent: 1 },
    }]);
    expect(resolveApiCost(usageUsdWithTokens, makeArm({
      tariffOverride: { status: "primary", source: "s", asOf: "d", perMillion: { input: 5, output: 0 } },
    }), null, "CAD")).toEqual({ costUnknownReason: null, apiEquivalentTotal: 0.005, apiEquivalentPerItem: 0.005 });
  });
});

describe("BD-4 tree-09: resolveSeat measured and unknown seat math", () => {
  const fxUsdToCad = { from: "USD" as const, to: "CAD" as const, rate: 1.385, source: "boc", asOf: "2026-11-22" };
  const apiValid = { costUnknownReason: null, apiEquivalentTotal: 4.5705, apiEquivalentPerItem: 0.0026806451612903224 };
  const measuredBase = {
    status: "measured" as const, method: "weekly_burn_delta" as const, windowMinutes: 10080 as const,
    isolatedSeat: true as const, remainingBefore: 0.92, remainingAfter: 0.72, observedItems: 40,
    plan: "Pro", planMonthlyPrice: 280, planSource: "inv", planAsOf: "2026-11-20",
  };

  it("computes measured weekly_burn_delta with full 10-field literals and zero/negative delta guards", () => {
    // Omitted planCurrency defaults to targetCur ("CAD"); share = (0.92-0.72)/40 = 0.005000000000000002;
    // seatCost = share * ((280*7)/(365.25/12)) = 0.32197125256673511... (IEEE-754: 0.3219712525667352).
    expect(resolveSeat(measuredBase, apiValid, makeArm({ fx: fxUsdToCad }), "CAD")).toEqual({
      seatStatus: "measured",
      seatMethod: "weekly_burn_delta",
      seatUnknownReason: null,
      seatSharePerItem: 0.005000000000000002,
      seatCostPerItem: 0.3219712525667352,
      seatPlan: "Pro",
      seatMonthlyPrice: 280,
      seatLimitScale: null,
      seatPlanSource: "inv",
      seatPlanAsOf: "2026-11-20",
    });
    // Explicit USD planCurrency converts once: 200 * 1.385 = 277 CAD; seatCost = 0.3185215605749488.
    expect(resolveSeat({
      ...measuredBase, planMonthlyPrice: 200, planCurrency: "USD", planSource: "usd-inv", planAsOf: "2026-11-21",
    }, apiValid, makeArm({ fx: fxUsdToCad }), "CAD")).toEqual({
      seatStatus: "measured",
      seatMethod: "weekly_burn_delta",
      seatUnknownReason: null,
      seatSharePerItem: 0.005000000000000002,
      seatCostPerItem: 0.3185215605749488,
      seatPlan: "Pro",
      seatMonthlyPrice: 277,
      seatLimitScale: null,
      seatPlanSource: "usd-inv",
      seatPlanAsOf: "2026-11-21",
    });
    expect(resolveSeat({ ...measuredBase, planMonthlyPrice: 0 }, apiValid, makeArm(), "USD")).toEqual({
      seatStatus: "measured",
      seatMethod: "weekly_burn_delta",
      seatUnknownReason: null,
      seatSharePerItem: 0.005000000000000002,
      seatCostPerItem: 0,
      seatPlan: "Pro",
      seatMonthlyPrice: 0,
      seatLimitScale: null,
      seatPlanSource: "inv",
      seatPlanAsOf: "2026-11-20",
    });
    const zeroDelta = resolveSeat({ ...measuredBase, remainingBefore: 0.72 }, apiValid, makeArm(), "USD");
    const negativeDelta = resolveSeat({ ...measuredBase, remainingBefore: 0.6 }, apiValid, makeArm(), "USD");
    const fullUnknownNoDelta = {
      seatStatus: "unknown", seatMethod: "unknown", seatUnknownReason: "no-quota-delta",
      seatSharePerItem: "unknown", seatCostPerItem: "unknown",
      seatPlan: null, seatMonthlyPrice: null, seatLimitScale: null, seatPlanSource: null, seatPlanAsOf: null,
    };
    expect(zeroDelta).toEqual(fullUnknownNoDelta);
    expect(negativeDelta).toEqual(fullUnknownNoDelta);
    refuse(() => resolveSeat({ ...measuredBase, planCurrency: "USD" }, apiValid, makeArm(), "CAD"),
      "CURRENCY_MISMATCH", "$.seat.planCurrency");
  });
});
