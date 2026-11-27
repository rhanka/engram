import { describe, expect, it } from "vitest";
import {
  BenchCostSeatError, computeArmCostAndSeat, computeFromRates, convertCurrency, parseResultsNdjson,
  parseValidatedPriceTable, resolveApiCost, resolveSeat, roundCostNano, summarizeInvocationUsage,
} from "../src/bench-dossier/cost-seat.js";
import { validateBenchResultsInvariants } from "../src/bench-dossier/invariants.js";
import { parseBenchResultsFile } from "../src/bench-dossier/results-contract.js";
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
    expect(zeroDelta).toEqual({
      seatStatus: "unknown", seatMethod: "unknown", seatUnknownReason: "no-quota-delta",
      seatSharePerItem: "unknown", seatCostPerItem: "unknown",
      seatPlan: null, seatMonthlyPrice: null, seatLimitScale: null, seatPlanSource: null, seatPlanAsOf: null,
    });
    expect(negativeDelta).toEqual({
      seatStatus: "unknown", seatMethod: "unknown", seatUnknownReason: "no-quota-delta",
      seatSharePerItem: "unknown", seatCostPerItem: "unknown",
      seatPlan: null, seatMonthlyPrice: null, seatLimitScale: null, seatPlanSource: null, seatPlanAsOf: null,
    });
    refuse(() => resolveSeat({ ...measuredBase, planCurrency: "USD" }, apiValid, makeArm(), "CAD"),
      "CURRENCY_MISMATCH", "$.seat.planCurrency");
  });
});

describe("BD-4 tree-10: resolveSeat estimated math, non-identity scale, and unknown projections", () => {
  const fxUsdToCad = { from: "USD" as const, to: "CAD" as const, rate: 1.385, source: "boc", asOf: "2026-11-22" };
  const apiValid = { costUnknownReason: null, apiEquivalentTotal: 4.5705, apiEquivalentPerItem: 0.0026806451612903224 };
  const estimatedBase = {
    status: "estimated" as const, method: "api_cost_proportional" as const, windowMinutes: 10080 as const,
    isolatedSeat: false, observedApiEquivalent: 10, quotaDeltaFraction: 0.25, basePlanMultiplier: 2,
    targetPlanMultiplier: 5, plan: "Max", planMonthlyPrice: 100, planSource: "card", planAsOf: "2026-11-20",
  };

  it("computes estimated api_cost_proportional with exact rational literals and unknown seat blocks", () => {
    // scale = 5/2 = 2.5; DAYS_PER_MONTH = 487/16; WEEKS_PER_MONTH = 487/112;
    // estUsd exact = (4.5705/1705) * (112/487) = 0.000616493343048287739... (IEEE: 0.0006164933430482877).
    expect(resolveSeat({
      ...estimatedBase, planCurrency: "USD", observedCurrency: "USD",
    }, apiValid, makeArm({ fx: fxUsdToCad }), "CAD")).toEqual({
      seatStatus: "estimated", seatMethod: "api_cost_proportional", seatUnknownReason: null,
      seatSharePerItem: "unknown", seatCostPerItem: 0.0006164933430482877,
      seatPlan: "Max", seatMonthlyPrice: 138.5, seatLimitScale: 2.5, seatPlanSource: "card", seatPlanAsOf: "2026-11-20",
    });
    // Omitted planCurrency & observedCurrency default to targetCur ("CAD"); IEEE: 0.0006164933430482878.
    expect(resolveSeat(estimatedBase, apiValid, makeArm({ fx: fxUsdToCad }), "CAD")).toEqual({
      seatStatus: "estimated", seatMethod: "api_cost_proportional", seatUnknownReason: null,
      seatSharePerItem: "unknown", seatCostPerItem: 0.0006164933430482878,
      seatPlan: "Max", seatMonthlyPrice: 100, seatLimitScale: 2.5, seatPlanSource: "card", seatPlanAsOf: "2026-11-20",
    });
    // Mixed: planCurrency CAD (190), observedCurrency USD (10*1.385=13.85);
    // exact = (4.5705/1705) * (190 / ((13.85/0.25)*(487/112)*2.5)) = 0.0008457309399218387759...
    expect(resolveSeat({
      ...estimatedBase, planMonthlyPrice: 190, observedCurrency: "USD",
      planSource: "mix-card", planAsOf: "2026-11-23",
    }, apiValid, makeArm({ fx: fxUsdToCad }), "CAD")).toEqual({
      seatStatus: "estimated", seatMethod: "api_cost_proportional", seatUnknownReason: null,
      seatSharePerItem: "unknown", seatCostPerItem: 0.0008457309399218388,
      seatPlan: "Max", seatMonthlyPrice: 190, seatLimitScale: 2.5,
      seatPlanSource: "mix-card", seatPlanAsOf: "2026-11-23",
    });
    refuse(() => resolveSeat({ ...estimatedBase, observedCurrency: "USD" }, apiValid, makeArm(), "CAD"),
      "CURRENCY_MISMATCH", "$.seat.observedCurrency");
    const unknownReasonFor = (costReason: "missing-usage" | "incomplete-invocation-summary"
      | "unpriced-mission" | "reasoning-rate-missing") => resolveSeat(estimatedBase, {
      costUnknownReason: costReason, apiEquivalentTotal: "unknown", apiEquivalentPerItem: "unknown",
    }, makeArm(), "USD");
    expect(unknownReasonFor("missing-usage")).toEqual({
      seatStatus: "unknown", seatMethod: "unknown", seatUnknownReason: "missing-usage",
      seatSharePerItem: "unknown", seatCostPerItem: "unknown",
      seatPlan: null, seatMonthlyPrice: null, seatLimitScale: null, seatPlanSource: null, seatPlanAsOf: null,
    });
    expect(unknownReasonFor("incomplete-invocation-summary").seatUnknownReason).toBe("missing-usage");
    expect(unknownReasonFor("unpriced-mission").seatUnknownReason).toBe("api-equivalent-source-gap");
    expect(unknownReasonFor("reasoning-rate-missing").seatUnknownReason).toBe("api-equivalent-source-gap");
    expect(resolveSeat(undefined, apiValid, makeArm(), "USD")).toEqual({
      seatStatus: "unknown", seatMethod: "unknown", seatUnknownReason: "missing-observation",
      seatSharePerItem: "unknown", seatCostPerItem: "unknown",
      seatPlan: null, seatMonthlyPrice: null, seatLimitScale: null, seatPlanSource: null, seatPlanAsOf: null,
    });
    expect(resolveSeat({ status: "unknown", reason: "shared-seat-concurrent" }, apiValid, makeArm(), "USD")).toEqual({
      seatStatus: "unknown", seatMethod: "unknown", seatUnknownReason: "shared-seat-concurrent",
      seatSharePerItem: "unknown", seatCostPerItem: "unknown",
      seatPlan: null, seatMonthlyPrice: null, seatLimitScale: null, seatPlanSource: null, seatPlanAsOf: null,
    });
  });
});

describe("BD-4 tree-11: computeArmCostAndSeat full literals and Probe P1 end-to-end", () => {
  it("builds full literal COST_SCHEMA outputs for 1,705-ID census and Probe P1 mixed-currency arm", () => {
    const fxUsdToCad = { from: "USD" as const, to: "CAD" as const, rate: 1.385, source: "boc", asOf: "2026-11-22" };
    const censusRows = [
      ...Array.from({ length: 1705 }, (_, index) => ({ id: `c-${index}` })),
      {
        type: "summary", mission_digest: "d1", ok: 1705, failed: 0, calls_total: 1710,
        tokens: { input: 1_000_000, output: 200_000, reasoning: 50_000, total: 1_250_000 },
        cost: { currency: "USD", api_equivalent: 3.3 },
      },
    ];
    const seatOverride = {
      status: "measured" as const, method: "weekly_burn_delta" as const, windowMinutes: 10080 as const,
      isolatedSeat: true as const, remainingBefore: 0.75, remainingAfter: 0.5, observedItems: 50,
      plan: "Pro", planMonthlyPrice: 200, planCurrency: "USD" as const, planSource: "inv", planAsOf: "2026-11-22",
    };
    // 1710/1705 = 1.002932551319648; 3.3*1.385 = 4.5705; 4.5705/1705 = 0.0026806451612903224;
    // share = (0.75-0.5)/50 = 0.005; monthly = 200*1.385 = 277; seatCost = 0.005*(277*7/30.4375) = 0.3185215605749487.
    expect(computeArmCostAndSeat({
      resultRows: censusRows,
      currency: "CAD",
      seatObservation: seatOverride,
      priceTable: {
        source: "pt", as_of: "2026-11-22", currency: "USD", status: "primary",
        per_million: { input: 1.5, output: 6, reasoning: 12 },
      },
      arm: makeArm({ fx: fxUsdToCad, seat: { status: "unknown", reason: "missing-observation" } }),
    })).toEqual({
      calls: 1710,
      callsPerItem: 1.002932551319648,
      tokens: { input: 1_000_000, output: 200_000, reasoning: 50_000, cached: "unknown", total: 1_250_000 },
      cost: {
        currency: "CAD", costBasisItems: 1705, costUnknownReason: null,
        apiEquivalentTotal: 4.5705, apiEquivalentPerItem: 0.0026806451612903224,
        tariffStatus: "primary", tariffSource: "pt", tariffAsOf: "2026-11-22",
        fxApplied: { from: "USD", to: "CAD", rate: 1.385, source: "boc", asOf: "2026-11-22" },
        seatStatus: "measured", seatMethod: "weekly_burn_delta", seatUnknownReason: null,
        seatSharePerItem: 0.005, seatCostPerItem: 0.3185215605749487,
        seatPlan: "Pro", seatMonthlyPrice: 277, seatLimitScale: null, seatPlanSource: "inv", seatPlanAsOf: "2026-11-22",
      },
    });
    // Probe P1 end-to-end: CAD tariffOverride (2 CAD API) + USD seat (277 CAD) with arm.fx USD -> CAD.
    expect(computeArmCostAndSeat({
      resultRows: [
        { id: "p1" },
        {
          type: "summary", ok: 1, failed: 0, calls_total: 1,
          tokens: { input: 500_000, output: 250_000, reasoning: 0, cached: 100, total: 750_000 },
        },
      ],
      currency: "CAD",
      seatObservation: seatOverride,
      arm: makeArm({
        fx: fxUsdToCad,
        tariffOverride: {
          status: "primary", currency: "CAD", source: "ov-cad", asOf: "2026-11-25",
          perMillion: { input: 2, output: 4 },
        },
      }),
    })).toEqual({
      calls: 1,
      callsPerItem: 1,
      tokens: { input: 500_000, output: 250_000, reasoning: 0, cached: 100, total: 750_000 },
      cost: {
        currency: "CAD", costBasisItems: 1, costUnknownReason: null,
        apiEquivalentTotal: 2, apiEquivalentPerItem: 2,
        tariffStatus: "primary", tariffSource: "ov-cad", tariffAsOf: "2026-11-25",
        fxApplied: { from: "USD", to: "CAD", rate: 1.385, source: "boc", asOf: "2026-11-22" },
        seatStatus: "measured", seatMethod: "weekly_burn_delta", seatUnknownReason: null,
        seatSharePerItem: 0.005, seatCostPerItem: 0.3185215605749487,
        seatPlan: "Pro", seatMonthlyPrice: 277, seatLimitScale: null, seatPlanSource: "inv", seatPlanAsOf: "2026-11-22",
      },
    });
  });
});

describe("BD-4 tree-12: BenchResultsFile and invariant round-trip compatibility", () => {
  it("produces BenchCostBlock accepted by parseBenchResultsFile and validateBenchResultsInvariants", () => {
    const invariantResult = computeArmCostAndSeat({
      resultRows: [{ id: "a1" }, {
        type: "summary", ok: 1, failed: 0, calls_total: 1,
        tokens: { input: 1000, output: 500, reasoning: 0, total: 1500 },
        cost: { currency: "USD", api_equivalent: 0.01 },
      }],
      arm: makeArm(), currency: "USD",
    });
    const zeroInterval = {
      estimator: "unweighted" as const, method: "none" as const, clustering: "independent_site" as const,
      valid: false, low: null, high: null,
    };
    const sitePresence = {
      goldPresentSites: 1, goldAbsentSites: 0, unresolvedSites: 0, insufficientSites: 0, tpSites: 1, fnSites: 0,
      wrongValueOnPresentSites: 0, fpOnAbsentSites: 0, tnSites: 0, failedOnAbsentSites: 0,
      siteRecall: 1, siteRecallInterval: zeroInterval, siteAbstentionSpecificity: null,
      siteAbstentionInterval: zeroInterval,
    };
    const pointMetrics = {
      precision: 1, recall: 1, f1: 1, precisionInterval: zeroInterval, recallInterval: zeroInterval,
    };
    const benchDoc = parseBenchResultsFile({
      schemaId: "urn:engram:bench-results:1.0.0", schemaVersion: 1, generatedAt: "2026-11-22T00:00:00Z",
      campaignId: "bd4", supportFloors: { recallMinPositives: 30, precisionMinPredictions: 30, failureCeiling: 0.05 },
      corpus: {
        partition: "eval", primaryEstimator: "unweighted", costBasisLabel: "extracted_packet", currency: "USD",
        goldenMissionSha256: "a".repeat(64), candidateMissionSha256: "b".repeat(64), fieldShapeVerified: true,
        goldenSha256: "c".repeat(64), goldenIds: 1, fields: ["city"], annotatorCount: 2,
        krippendorffAlphaByField: { city: null },
      },
      records: [{
        armId: "arm-a", armMissionSha256: "b".repeat(64), missingDigestAllowed: false, provider: "OpenAI",
        model: "gpt-6-astra-low", modelLabel: "Astra low", proseName: "OpenAI Astra low", effort: "low",
        isCascade: false, isHighlighted: false, incomplete: false, field: "city", comparator: "generic",
        isPrimaryComparator: true, attempted: 1, accepted: 1, failed: 0, failuresByCode: {},
        unverifiedQuotesNulled: 0, unverifiedWholeRecordsDropped: null, goldPositive: 1, goldAbsent: 0, tp: 1, fp: 0,
        fpOnPresent: 0, fpOnAbsent: 0, fpElementsOnAbsent: 0, fn: 0, tn: 0, failedOnAbsent: 0, unresolved: 0,
        insufficient: 0, abstentionSpecificity: null, sitePresence, unweighted: pointMetrics, weighted: null,
        ...pointMetrics, indeterminate: { precision: true, recall: true, f1: true }, ...invariantResult,
      }],
    });
    expect(validateBenchResultsInvariants(benchDoc).records[0]?.cost.apiEquivalentTotal).toBe(0.01);
  });
});

describe("BD-4 tree-13: no-default-shadowing and top-level input guards", () => {
  it("tests every defaulted and overridden field without shadowing and refuses bad top-level inputs", () => {
    const simpleRows = [{ id: "a1" }, { type: "summary", ok: 1, failed: 0, cost: { api_equivalent: 1 } }];
    const defaultPriceTable = { source: "pt", as_of: "2026-11-22", per_million: { input: 1, output: 2 } };
    expect(computeArmCostAndSeat({
      resultRows: simpleRows, arm: makeArm(), priceTable: defaultPriceTable,
      currency: undefined, seatObservation: undefined,
    }).cost).toEqual({
      currency: "USD", costBasisItems: 1, costUnknownReason: null, apiEquivalentTotal: 1, apiEquivalentPerItem: 1,
      tariffStatus: "secondary_unverified", tariffSource: "pt", tariffAsOf: "2026-11-22", fxApplied: null,
      seatStatus: "unknown", seatMethod: "unknown", seatUnknownReason: "missing-observation",
      seatSharePerItem: "unknown", seatCostPerItem: "unknown",
      seatPlan: null, seatMonthlyPrice: null, seatLimitScale: null, seatPlanSource: null, seatPlanAsOf: null,
    });
    // Non-default tariffOverride { status: "primary", source: "override-card", asOf: "2026-11-25" } (X21-X23).
    const overridePrimaryOut = computeArmCostAndSeat({
      resultRows: simpleRows,
      priceTable: { ...defaultPriceTable, status: "secondary_unverified" },
      arm: makeArm({
        tariffStatus: "secondary_unverified",
        tariffOverride: { status: "primary", source: "override-card", asOf: "2026-11-25" },
      }),
    });
    expect([overridePrimaryOut.cost.tariffStatus, overridePrimaryOut.cost.tariffSource,
      overridePrimaryOut.cost.tariffAsOf]).toEqual(["primary", "override-card", "2026-11-25"]);
    const overrideNullOut = computeArmCostAndSeat({
      resultRows: simpleRows,
      priceTable: { ...defaultPriceTable, status: "primary" },
      arm: makeArm({ tariffOverride: { status: "unknown", source: null, asOf: null } }),
    });
    expect([overrideNullOut.cost.tariffStatus, overrideNullOut.cost.tariffSource, overrideNullOut.cost.tariffAsOf])
      .toEqual(["unknown", null, null]);
    const armStatusOut = computeArmCostAndSeat({
      resultRows: simpleRows,
      arm: makeArm({ tariffStatus: "primary" }),
      currency: "CAD",
      priceTable: { ...defaultPriceTable, currency: "CAD", status: "secondary_unverified" },
    });
    expect([armStatusOut.cost.currency, armStatusOut.cost.tariffStatus,
      armStatusOut.cost.tariffSource, armStatusOut.cost.tariffAsOf]).toEqual([
      "CAD", "primary", "pt", "2026-11-22",
    ]);
    const unpricedOut = computeArmCostAndSeat({ resultRows: simpleRows, arm: makeArm() });
    expect([unpricedOut.cost.tariffStatus, unpricedOut.cost.tariffSource, unpricedOut.cost.tariffAsOf])
      .toEqual(["unknown", null, null]);
    const armSeatOut = computeArmCostAndSeat({
      resultRows: [{ id: "a1" }, { type: "summary", ok: 1, failed: 0, cost: { currency: "USD", api_equivalent: 2 } }],
      arm: makeArm({
        fx: { from: "USD", to: "USD", rate: 1, source: "id", asOf: "2026-11-22" },
        seat: { status: "unknown", reason: "shared-seat-concurrent" },
      }),
      currency: "USD",
    });
    expect([armSeatOut.cost.apiEquivalentTotal, armSeatOut.cost.seatUnknownReason])
      .toEqual([2, "shared-seat-concurrent"]);
    const validInput = { resultRows: simpleRows, arm: makeArm() };
    const topLevelRejections: [unknown, string, string][] = [
      [null, "NOT_OBJECT", "$"],
      [{ ...validInput, extra: 1 }, "UNKNOWN_KEY", "$.extra"],
      [{ arm: makeArm() }, "MISSING_KEY", "$.resultRows"],
      [{ resultRows: simpleRows }, "MISSING_KEY", "$.arm"],
      [{ ...validInput, currency: "EUR" }, "BAD_ENUM", "$.currency"],
      [{ ...validInput, currency: null }, "WRONG_TYPE", "$.currency"],
      [{ ...validInput, arm: {} }, "MISSING_KEY", "$.schemaId"],
      [{ ...validInput, seatObservation: { status: "bad" } }, "BAD_ENUM", "$.status"],
      [{ ...validInput, seatObservation: null }, "NOT_OBJECT", "$"],
      [{ ...validInput, priceTable: "bad" }, "NOT_OBJECT", "$.priceTable"],
    ];
    for (const [badInput, code, path] of topLevelRejections) {
      refuse(() => computeArmCostAndSeat(badInput as never), code, path);
    }
  });
});

describe("BD-4 tree-14: Round-3 survivors, FX override, zero-basis, and Check 9 symmetry", () => {
  const fxUsdToCad = { from: "USD" as const, to: "CAD" as const, rate: 1.385, source: "boc", asOf: "2026-11-22" };
  const fxCadToUsd = { from: "CAD" as const, to: "USD" as const, rate: 0.72, source: "boc", asOf: "2026-11-22" };

  it("resolves USD tariffOverride FX, reasoning: 0, and reverse currency conflict directions", () => {
    const tokensWithReasoning = {
      input: 1_000_000, output: 0, reasoning: 500_000, cached: "unknown" as const, total: 1_500_000,
    };
    const usageWithReasoning = summarizeInvocationUsage([{ id: "a1" }, {
      type: "summary", ok: 1, failed: 0, tokens: tokensWithReasoning, cost: { currency: "USD", api_equivalent: 9.99 },
    }]);
    const usageNoSumCurNumeric = summarizeInvocationUsage([
      { id: "a1" }, { type: "summary", ok: 1, failed: 0, cost: { api_equivalent: 10 } },
    ]);
    const usageNoSumCurTokens = summarizeInvocationUsage([{ id: "a1" }, {
      type: "summary", ok: 1, failed: 0, tokens: { input: 1_000_000, output: 0, reasoning: 0, total: 1_000_000 },
    }]);
    const usageUsd = summarizeInvocationUsage([
      { id: "a1" }, { type: "summary", ok: 1, failed: 0, cost: { currency: "USD", api_equivalent: 2 } },
    ]);
    const usageCad = summarizeInvocationUsage([
      { id: "a1" }, { type: "summary", ok: 1, failed: 0, cost: { currency: "CAD", api_equivalent: 2 } },
    ]);
    const priceTableUsd = parseValidatedPriceTable({
      source: "op", as_of: "2026-11-22", currency: "USD", per_million: { input: 2, output: 4 },
    });
    const priceTableCad = parseValidatedPriceTable({
      source: "op", as_of: "2026-11-22", currency: "CAD", per_million: { input: 1, output: 2 },
    });
    const priceTableZeroReason = parseValidatedPriceTable({
      source: "op", as_of: "2026-11-22", currency: "USD", per_million: { input: 2, output: 4, reasoning: 0 },
    });
    // F01: USD tariffOverride.currency converts USD -> CAD via arm.fx for perMillion and metadata-only.
    expect(resolveApiCost(usageNoSumCurTokens, makeArm({
      fx: fxUsdToCad,
      tariffOverride: {
        status: "primary", currency: "USD", source: "ov-usd", asOf: "2026-11-22", perMillion: { input: 4, output: 0 },
      },
    }), null, "CAD")).toEqual({ costUnknownReason: null, apiEquivalentTotal: 5.54, apiEquivalentPerItem: 5.54 });
    expect(resolveApiCost(usageUsd, makeArm({
      fx: fxUsdToCad, tariffOverride: { status: "primary", currency: "USD", source: "ov-usd", asOf: "2026-11-22" },
    }), null, "CAD")).toEqual({ costUnknownReason: null, apiEquivalentTotal: 2.77, apiEquivalentPerItem: 2.77 });
    // F03 & F04: valid reasoning: 0 rate on computeFromRates and priceTable.
    expect(computeFromRates(tokensWithReasoning, { input: 2, output: 4, reasoning: 0 }, "USD", "USD", 1, undefined))
      .toEqual({ costUnknownReason: null, apiEquivalentTotal: 2, apiEquivalentPerItem: 2 });
    expect(resolveApiCost(usageWithReasoning, makeArm(), priceTableZeroReason, "USD")).toEqual({
      costUnknownReason: null, apiEquivalentTotal: 9.99, apiEquivalentPerItem: 9.99,
    });
    // F07: ov.perMillion with CAD currency overrides USD priceTable when summary currency is absent.
    expect(resolveApiCost(usageNoSumCurTokens, makeArm({
      tariffOverride: {
        status: "primary", currency: "CAD", source: "ov-cad", asOf: "2026-11-22", perMillion: { input: 5, output: 0 },
      },
    }), priceTableUsd, "CAD")).toEqual({ costUnknownReason: null, apiEquivalentTotal: 5, apiEquivalentPerItem: 5 });
    // F05, F06a, F06b, F14: reverse directional and compound FX currency rejections + positive counterpart.
    expect(resolveApiCost(usageNoSumCurNumeric, makeArm({
      fx: fxUsdToCad, tariffOverride: { status: "primary", currency: "USD", source: "ov", asOf: "2026-11-22" },
    }), priceTableUsd, "CAD")).toEqual({
      costUnknownReason: null, apiEquivalentTotal: 13.85, apiEquivalentPerItem: 13.85,
    });
    const reverseMismatchCases: [ReturnType<typeof summarizeInvocationUsage>, ArmManifestFile,
      typeof priceTableUsd, "USD" | "CAD", string][] = [
      [usageCad, makeArm({ fx: fxUsdToCad }), priceTableUsd, "CAD", "$.priceTable.currency"],
      [usageNoSumCurNumeric, makeArm({
        fx: fxUsdToCad, tariffOverride: { status: "primary", currency: "USD", source: "ov", asOf: "2026-11-22" },
      }), priceTableCad, "CAD", "$.arm.tariffOverride.currency"],
      [usageUsd, makeArm({
        fx: fxCadToUsd, tariffOverride: { status: "primary", currency: "CAD", source: "ov", asOf: "2026-11-22" },
      }), null, "USD", "$.arm.tariffOverride.currency"],
      [usageUsd, makeArm({ fx: { from: "CAD", to: "CAD", rate: 1, source: "id", asOf: "2026-11-22" } }),
        null, "USD", "$.arm.fx.to"],
    ];
    for (const [usage, arm, priceTable, targetCurrency, errorPath] of reverseMismatchCases) {
      refuse(() => resolveApiCost(usage, arm, priceTable, targetCurrency), "CURRENCY_MISMATCH", errorPath);
    }
  });

  it("defaults omitted calls_total, handles zero-basis callsSum, Summary-2 gaps, and undefined keys", () => {
    // F63 + Check 8 cached: "unknown": omitted calls_total on complete summary defaults to "unknown".
    expect(summarizeInvocationUsage([
      { id: "a1" },
      {
        type: "summary", mission_digest: "d1", ok: 1, failed: 0,
        tokens: { input: 10, output: 20, reasoning: 0, cached: "unknown", total: 30 },
        cost: { currency: "USD", api_equivalent: 0.5 },
      },
    ])).toEqual({
      nonSummaryRows: 1, summaryRows: 1, summaryItemCount: 1, interrupted: false, costBasisItems: 1,
      calls: "unknown", callsPerItem: "unknown",
      tokens: { input: 10, output: 20, reasoning: 0, cached: "unknown", total: 30 },
      summaryApiTotal: 0.5, summaryCurrencies: ["USD"], missionDigests: ["d1"], hasMissingDigest: false,
    });
    // F32: interrupted or degraded zero-basis runs with positive callsSum degrade to "unknown" instead of throwing.
    expect(summarizeInvocationUsage([{ type: "summary", ok: 1, failed: 0, calls_total: 3 }])).toEqual({
      nonSummaryRows: 0, summaryRows: 1, summaryItemCount: 1, interrupted: true, costBasisItems: 0,
      calls: "unknown", callsPerItem: "unknown", tokens: "unknown", summaryApiTotal: "unknown",
      summaryCurrencies: [], missionDigests: [], hasMissingDigest: true,
    });
    expect(summarizeInvocationUsage([
      { type: "summary", ok: 0, failed: 0, calls_total: 3 },
      { type: "summary", ok: 0, failed: 0, calls_total: "unknown" },
    ])).toEqual({
      nonSummaryRows: 0, summaryRows: 2, summaryItemCount: 0, interrupted: false, costBasisItems: 0,
      calls: "unknown", callsPerItem: "unknown", tokens: "unknown", summaryApiTotal: "unknown",
      summaryCurrencies: [], missionDigests: [], hasMissingDigest: true,
    });
    // F24, F25, F42: explicit undefined on mission_digest, cost, and tokens.cached.
    expect(summarizeInvocationUsage([
      { id: "a1" },
      {
        type: "summary", ok: 1, failed: 0, mission_digest: undefined, calls_total: 2,
        tokens: { input: 1, output: 2, reasoning: 0, cached: undefined, total: 3 }, cost: undefined,
      },
    ])).toEqual({
      nonSummaryRows: 1, summaryRows: 1, summaryItemCount: 1, interrupted: false, costBasisItems: 1,
      calls: 2, callsPerItem: 2, tokens: { input: 1, output: 2, reasoning: 0, cached: "unknown", total: 3 },
      summaryApiTotal: "unknown", summaryCurrencies: [], missionDigests: [], hasMissingDigest: true,
    });
    // F43, F31, F36: Summary-2 degradations (omitted calls_total, tokens: "unknown", omitted mission_digest).
    const baseSummary = {
      type: "summary", mission_digest: "d1", ok: 1, failed: 0, calls_total: 5,
      tokens: { input: 10, output: 20, reasoning: 0, cached: 4, total: 30 },
      cost: { currency: "USD", api_equivalent: 1.5 },
    };
    const summaryTwoMissingCalls = summarizeInvocationUsage([
      { id: "a1" }, baseSummary, { id: "a2" },
      { type: "summary", mission_digest: "d2", ok: 1, failed: 0, tokens: baseSummary.tokens, cost: baseSummary.cost },
    ]);
    expect([summaryTwoMissingCalls.calls, summaryTwoMissingCalls.callsPerItem]).toEqual(["unknown", "unknown"]);
    const summaryTwoUnknownTokens = summarizeInvocationUsage([
      { id: "a1" }, baseSummary, { id: "a2" }, { ...baseSummary, mission_digest: "d2", tokens: "unknown" },
    ]);
    expect(summaryTwoUnknownTokens.tokens).toBe("unknown");
    const summaryTwoMissingDigest = summarizeInvocationUsage([
      { id: "a1" }, baseSummary, { id: "a2" },
      { type: "summary", ok: 1, failed: 0, calls_total: 1, tokens: baseSummary.tokens, cost: baseSummary.cost },
    ]);
    expect([summaryTwoMissingDigest.missionDigests, summaryTwoMissingDigest.hasMissingDigest])
      .toEqual([["d1"], true]);
  });
});

describe("BD-4 tree-15: independent seat currency, fxApplied copy, and Check 8 four-form inputs", () => {
  const fxUsdToCad = { from: "USD" as const, to: "CAD" as const, rate: 1.385, source: "boc", asOf: "2026-11-22" };

  it("keeps estimated observedCurrency independent, checks guard order, and shallow-copies fxApplied", () => {
    const apiValid = {
      costUnknownReason: null, apiEquivalentTotal: 4.5705, apiEquivalentPerItem: 0.0026806451612903224,
    };
    const apiUnknown = {
      costUnknownReason: "missing-usage" as const,
      apiEquivalentTotal: "unknown" as const,
      apiEquivalentPerItem: "unknown" as const,
    };
    const estimatedBase = {
      status: "estimated" as const, method: "api_cost_proportional" as const, windowMinutes: 10080 as const,
      isolatedSeat: false, observedApiEquivalent: 10, quotaDeltaFraction: 0.25, basePlanMultiplier: 2,
      targetPlanMultiplier: 5, plan: "Max", planMonthlyPrice: 100, planSource: "card", planAsOf: "2026-11-20",
    };
    // F46: planCurrency: "USD" with omitted observedCurrency defaults observedApiEquivalent to targetCurrency ("CAD").
    // exact = (4.5705/1705) * (138.5 / ((10/0.25)*(487/112)*2.5)) = 0.000853843280121878518911...
    expect(resolveSeat({ ...estimatedBase, planCurrency: "USD" }, apiValid, makeArm({ fx: fxUsdToCad }), "CAD"))
      .toEqual({
        seatStatus: "estimated", seatMethod: "api_cost_proportional", seatUnknownReason: null,
        seatSharePerItem: "unknown", seatCostPerItem: 0.0008538432801218785,
        seatPlan: "Max", seatMonthlyPrice: 138.5, seatLimitScale: 2.5,
        seatPlanSource: "card", seatPlanAsOf: "2026-11-20",
      });
    // F52 & F62: estimated observedCurrency guard runs before unknown API check; planCurrency requires FX.
    refuse(() => resolveSeat({ ...estimatedBase, observedCurrency: "USD" }, apiUnknown, makeArm(), "CAD"),
      "CURRENCY_MISMATCH", "$.seat.observedCurrency");
    refuse(() => resolveSeat({ ...estimatedBase, planCurrency: "USD" }, apiValid, makeArm(), "CAD"),
      "CURRENCY_MISMATCH", "$.seat.planCurrency");
    // F75 & F53: seatObservation: undefined falls back to arm.seat; fxApplied is a fresh shallow copy.
    const fallbackOut = computeArmCostAndSeat({
      resultRows: [{ id: "a1" }, { type: "summary", ok: 1, failed: 0, cost: { currency: "USD", api_equivalent: 2 } }],
      arm: makeArm({ fx: fxUsdToCad, seat: { status: "unknown", reason: "shared-seat-concurrent" } }),
      currency: "CAD",
      seatObservation: undefined,
    });
    expect(fallbackOut.cost.fxApplied).toEqual({
      from: "USD", to: "CAD", rate: 1.385, source: "boc", asOf: "2026-11-22",
    });
    expect(fallbackOut.cost.fxApplied).not.toBe(fxUsdToCad);
    expect(fallbackOut.cost.seatUnknownReason).toBe("shared-seat-concurrent");
  });

  it("distinguishes absent, null, undefined, and unknown forms across defaulted and nullable inputs", () => {
    expect(parseValidatedPriceTable({
      source: "op", as_of: "2026-11-22", currency: undefined, status: undefined,
      per_million: { input: 2, output: 10, reasoning: undefined },
    })).toEqual({
      source: "op", as_of: "2026-11-22", currency: "USD", status: "secondary_unverified",
      per_million: { input: 2, output: 10 },
    });
    expect(parseValidatedPriceTable({
      source: "op", as_of: "2026-11-22", per_million: { input: 2, output: 10, reasoning: 0 },
    })).toEqual({
      source: "op", as_of: "2026-11-22", currency: "USD", status: "secondary_unverified",
      per_million: { input: 2, output: 10, reasoning: 0 },
    });
    expect(parseValidatedPriceTable({
      source: "op", as_of: "2026-11-22", per_million: { input: 2, output: 10, reasoning: null },
    })).toBeNull();
    expect(parseValidatedPriceTable({
      source: "op", as_of: "2026-11-22", per_million: { input: 2, output: 10, reasoning: "unknown" },
    })).toBeNull();
    refuse(() => parseValidatedPriceTable("unknown"), "NOT_OBJECT", "$.priceTable");
    for (const badValue of [null, "unknown"]) {
      refuse(() => parseValidatedPriceTable({
        source: "op", as_of: "2026-11-22", currency: badValue, per_million: { input: 2, output: 10 },
      }), "BAD_ENUM", "$.priceTable.currency");
      refuse(() => parseValidatedPriceTable({
        source: "op", as_of: "2026-11-22", status: badValue, per_million: { input: 2, output: 10 },
      }), "BAD_ENUM", "$.priceTable.status");
    }
    const validSummary = {
      type: "summary", ok: 1, failed: 0, calls_total: 1,
      tokens: { input: 1, output: 2, reasoning: 0, cached: 0, total: 3 }, cost: { api_equivalent: 0.1 },
    };
    const unknownDigestUsage = summarizeInvocationUsage([
      { id: "a1" }, { ...validSummary, mission_digest: "unknown" },
    ]);
    expect([unknownDigestUsage.missionDigests, unknownDigestUsage.hasMissingDigest])
      .toEqual([["unknown"], false]);
    const fourFormRejections: [unknown[], string, string][] = [
      [[{ id: "a1", type: "unknown" }], "BAD_ENUM", "$.resultRows[0].type"],
      [[{ id: "a1" }, { ...validSummary, calls_total: null }], "WRONG_TYPE", "$.resultRows[1].calls_total"],
      [[{ id: "a1" }, { ...validSummary, cost: "unknown" }], "NOT_OBJECT", "$.resultRows[1].cost"],
      [[{ id: "a1" }, { ...validSummary, cost: { currency: null } }], "WRONG_TYPE", "$.resultRows[1].cost.currency"],
      [[{ id: "a1" }, { ...validSummary, cost: { currency: "unknown" } }],
        "BAD_ENUM", "$.resultRows[1].cost.currency"],
      [[{ id: "a1" }, { ...validSummary, cost: { api_equivalent: null } }],
        "WRONG_TYPE", "$.resultRows[1].cost.api_equivalent"],
    ];
    for (const [rows, code, path] of fourFormRejections) {
      refuse(() => summarizeInvocationUsage(rows), code, path);
    }
    expect(computeFromRates(
      { input: 10, output: 0, reasoning: 1, cached: "unknown", total: 11 },
      { input: 2, output: 4, reasoning: undefined }, "USD", "USD", 1, undefined,
    )).toEqual({
      costUnknownReason: "reasoning-rate-missing", apiEquivalentTotal: "unknown", apiEquivalentPerItem: "unknown",
    });
    const simpleUsage = [{ id: "a1" }, {
      type: "summary", ok: 1, failed: 0, tokens: { input: 10, output: 10, reasoning: 0, total: 20 },
    }];
    const secondaryArmOut = computeArmCostAndSeat({
      resultRows: simpleUsage, priceTable: undefined,
      seatObservation: { status: "unknown", reason: "non-weekly-window" },
      arm: makeArm({
        seat: { status: "unknown", reason: "missing-observation" },
        tariffOverride: { status: "secondary_unverified", source: "sec-ov", asOf: "2026-11-26" },
      }),
    });
    expect([
      secondaryArmOut.cost.costUnknownReason, secondaryArmOut.cost.tariffStatus,
      secondaryArmOut.cost.tariffSource, secondaryArmOut.cost.tariffAsOf, secondaryArmOut.cost.seatUnknownReason,
    ]).toEqual(["unpriced-mission", "secondary_unverified", "sec-ov", "2026-11-26", "non-weekly-window"]);
    refuse(() => computeArmCostAndSeat({ resultRows: simpleUsage, arm: makeArm(), priceTable: null }),
      "NOT_OBJECT", "$.priceTable");
    refuse(() => computeArmCostAndSeat({ resultRows: simpleUsage, arm: makeArm(), priceTable: "unknown" }),
      "NOT_OBJECT", "$.priceTable");
    refuse(() => computeArmCostAndSeat({ resultRows: simpleUsage, arm: makeArm(), currency: "unknown" as never }),
      "BAD_ENUM", "$.currency");
    refuse(() => computeArmCostAndSeat({ resultRows: simpleUsage, arm: makeArm(), seatObservation: "unknown" }),
      "NOT_OBJECT", "$");
  });
});

describe("BD-4 tree-16: required row.id undefined, guard order, summary CAD fallback, and arm tariffStatus", () => {
  const fxUsdToCad = { from: "USD" as const, to: "CAD" as const, rate: 1.385, source: "boc", asOf: "2026-11-22" };
  const apiValid = {
    costUnknownReason: null, apiEquivalentTotal: 4.5705, apiEquivalentPerItem: 0.0026806451612903224,
  };
  const apiUnknown = {
    costUnknownReason: "missing-usage" as const,
    apiEquivalentTotal: "unknown" as const,
    apiEquivalentPerItem: "unknown" as const,
  };
  const measuredBase = {
    status: "measured" as const, method: "weekly_burn_delta" as const, windowMinutes: 10080 as const,
    isolatedSeat: true as const, remainingBefore: 0.92, remainingAfter: 0.72, observedItems: 40,
    plan: "Pro", planMonthlyPrice: 280, planSource: "inv", planAsOf: "2026-11-20",
  };
  const estimatedBase = {
    status: "estimated" as const, method: "api_cost_proportional" as const, windowMinutes: 10080 as const,
    isolatedSeat: false, observedApiEquivalent: 10, quotaDeltaFraction: 0.25, basePlanMultiplier: 2,
    targetPlanMultiplier: 5, plan: "Max", planMonthlyPrice: 100, planSource: "card", planAsOf: "2026-11-20",
  };

  it("enforces fail-closed row.id and currency guard order before early unknown returns", () => {
    refuse(() => summarizeInvocationUsage([{ id: undefined }]), "WRONG_TYPE", "$.resultRows[0].id");
    const interruptedNoSummary = summarizeInvocationUsage([{ id: "a1" }]);
    const interruptedMixedCurrencies = summarizeInvocationUsage([
      { id: "a1" },
      { type: "summary", ok: 1, failed: 0, cost: { currency: "USD", api_equivalent: 1 } },
      { type: "summary", ok: 1, failed: 0, cost: { currency: "CAD", api_equivalent: 1 } },
    ]);
    const interruptedSumUsd = summarizeInvocationUsage([
      { id: "a1" }, { id: "a2" }, { type: "summary", ok: 1, failed: 0, cost: { currency: "USD", api_equivalent: 1 } },
    ]);
    const priceTableCad = parseValidatedPriceTable({
      source: "op", as_of: "2026-11-22", currency: "CAD", per_million: { input: 1, output: 2 },
    });
    const guardOrderVectors: [ReturnType<typeof summarizeInvocationUsage>, ArmManifestFile,
      typeof priceTableCad, "USD" | "CAD", string][] = [
      [interruptedNoSummary, makeArm({ fx: fxUsdToCad }), null, "USD", "$.arm.fx.to"],
      [interruptedNoSummary, makeArm({
        fx: { from: "USD", to: "USD", rate: 1.2, source: "id", asOf: "2026-11-22" },
      }), null, "USD", "$.arm.fx.rate"],
      [interruptedNoSummary, makeArm({
        tariffOverride: { status: "primary", currency: "USD", source: "s", asOf: "d" },
      }), null, "CAD", "$.arm.tariffOverride.currency"],
      [interruptedMixedCurrencies, makeArm(), null, "USD", "$.resultRows"],
      [interruptedSumUsd, makeArm({ fx: fxUsdToCad }), priceTableCad, "CAD", "$.priceTable.currency"],
      [interruptedSumUsd, makeArm({
        fx: fxUsdToCad, tariffOverride: { status: "primary", currency: "CAD", source: "ov", asOf: "2026-11-22" },
      }), null, "CAD", "$.arm.tariffOverride.currency"],
    ];
    for (const [usage, arm, priceTable, targetCurrency, errorPath] of guardOrderVectors) {
      refuse(() => resolveApiCost(usage, arm, priceTable, targetCurrency), "CURRENCY_MISMATCH", errorPath);
    }
    refuse(() => resolveSeat({ ...measuredBase, remainingBefore: 0.72, planCurrency: "USD" }, apiValid,
      makeArm(), "CAD"), "CURRENCY_MISMATCH", "$.seat.planCurrency");
    refuse(() => resolveSeat({ ...estimatedBase, planCurrency: "USD" }, apiUnknown, makeArm(), "CAD"),
      "CURRENCY_MISMATCH", "$.seat.planCurrency");
  });

  it("verifies summary CAD fallback, priceTable.currency precedence, and arm.tariffStatus precedence", () => {
    const summaryNoCurrency = summarizeInvocationUsage([
      { id: "a1" }, { type: "summary", ok: 1, failed: 0, cost: { api_equivalent: 2 } },
    ]);
    const priceTableCad = parseValidatedPriceTable({
      source: "op", as_of: "2026-11-22", currency: "CAD", per_million: { input: 1, output: 2 },
    });
    expect(resolveApiCost(summaryNoCurrency, makeArm(), null, "CAD")).toEqual({
      costUnknownReason: null, apiEquivalentTotal: 2, apiEquivalentPerItem: 2,
    });
    expect(resolveApiCost(summaryNoCurrency, makeArm({ fx: fxUsdToCad }), priceTableCad, "CAD")).toEqual({
      costUnknownReason: null, apiEquivalentTotal: 2, apiEquivalentPerItem: 2,
    });
    const simpleRows = [{ id: "a1" }, { type: "summary", ok: 1, failed: 0, cost: { api_equivalent: 1 } }];
    expect(computeArmCostAndSeat({
      resultRows: simpleRows, arm: makeArm({ tariffStatus: "primary" }),
    }).cost).toEqual({
      currency: "USD", costBasisItems: 1, costUnknownReason: null, apiEquivalentTotal: 1, apiEquivalentPerItem: 1,
      tariffStatus: "primary", tariffSource: null, tariffAsOf: null, fxApplied: null,
      seatStatus: "unknown", seatMethod: "unknown", seatUnknownReason: "missing-observation",
      seatSharePerItem: "unknown", seatCostPerItem: "unknown",
      seatPlan: null, seatMonthlyPrice: null, seatLimitScale: null, seatPlanSource: null, seatPlanAsOf: null,
    });
    expect(computeArmCostAndSeat({
      resultRows: simpleRows,
      arm: makeArm({ tariffStatus: "secondary_unverified" }),
      priceTable: { source: "pt", as_of: "2026-11-22", status: "primary", per_million: { input: 1, output: 2 } },
    }).cost).toEqual({
      currency: "USD", costBasisItems: 1, costUnknownReason: null, apiEquivalentTotal: 1, apiEquivalentPerItem: 1,
      tariffStatus: "secondary_unverified", tariffSource: "pt", tariffAsOf: "2026-11-22", fxApplied: null,
      seatStatus: "unknown", seatMethod: "unknown", seatUnknownReason: "missing-observation",
      seatSharePerItem: "unknown", seatCostPerItem: "unknown",
      seatPlan: null, seatMonthlyPrice: null, seatLimitScale: null, seatPlanSource: null, seatPlanAsOf: null,
    });
  });
});

