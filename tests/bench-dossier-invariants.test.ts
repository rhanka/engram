import { describe, expect, it } from "vitest";
import {
  BenchInvariantError, compatibleMissionFieldShape, validateBenchResultsInvariants, validateProseName, wilson95,
  type BenchInvariantCode,
} from "../src/bench-dossier/invariants.js";
import {
  BenchResultsValidationError, type BenchResultsErrorCode,
} from "../src/bench-dossier/results-guards.js";
import type { BenchResultRecord, BenchResultsFile } from "../src/bench-dossier/results-types.js";
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

  it("accepts non-shape Mission overrides and >1 maxValues differences", () => {
    const golden = makeMission();
    const freeVars: ((candidate: any) => void)[] = [
      (candidate) => { candidate.instruction = "Bounded candidate prompt."; },
      (candidate) => { candidate.tokenCap = 24000; },
      (candidate) => { delete candidate.tokenCap; },
      (candidate) => { candidate.reasoning_budget_tokens = 1000; },
      (candidate) => { delete candidate.reasoning_budget_tokens; },
      (candidate) => { candidate.calls_window_minutes = 10080; },
      (candidate) => { delete candidate.calls_window_minutes; },
      (candidate) => { delete candidate.price_table; },
      (candidate) => { candidate.fields[0] = { name: "headline", kind: "scalar", max_values: 1 }; },
      (candidate) => { candidate.fields[1].fields[0].instruction = "Municipality"; },
      (candidate) => { delete candidate.fields[1].fields[0].instruction; },
      (candidate) => { candidate.fields[2] = "overflow_canadian_offices"; },
    ];
    for (const mutate of freeVars) {
      const candidate = clone(golden);
      mutate(candidate);
      expect(compatibleMissionFieldShape(golden, candidate).maxValuesChanged).toBe(false);
    }
    const maxDiffCandidate = clone(golden) as any;
    maxDiffCandidate.fields[1].max_values = 2;
    expect(compatibleMissionFieldShape(golden, maxDiffCandidate).maxValuesChanged).toBe(true);
    const maxClampGolden = clone(golden) as any;
    const maxClampCandidate = clone(golden) as any;
    maxClampGolden.fields[1].max_values = 5;
    maxClampCandidate.fields[1].max_values = 6;
    expect(compatibleMissionFieldShape(maxClampGolden, maxClampCandidate).maxValuesChanged).toBe(false);
  });
});

describe("validateProseName gates", () => {
  it("accepts valid prose names, default path, h2a and utf-8 tokens", () => {
    validateProseName("OpenAI Astra low");
    for (const ok of [
      "OpenAI Astra low", "Oracle Matrix Queue", "Alpha hrpn note", "h2a", "H2A", "UTF-8", "utf-8", "\"utf-8,\"",
    ]) {
      validateProseName(ok, "$.p");
    }
  });

  it("refuses empty strings, punctuation, digits and internal IDs", () => {
    let emptyErr: unknown;
    try {
      validateProseName(" ", "$.p");
    } catch (caught) {
      emptyErr = caught;
    }
    expect(emptyErr).toBeInstanceOf(BenchResultsValidationError);
    expect([(emptyErr as BenchResultsValidationError).code, (emptyErr as BenchResultsValidationError).path])
      .toEqual(["EMPTY_STRING", "$.p"]);
    refuse(() => validateProseName("Arm 2"), "PROSE_NAME_GATE", "$");
    for (const bad of [
      "a;b", "a(b", "a)b", "Arm 2", "GPT-4.1", "h2a2", "utf-8-x", "O001", "A01", "T01", "r1-D1",
      "J1", "M1", "Q1", "Q-A", "F1", "WP1.2", "D-3", "LOT-4", "AC-1", "rel-1", "hrpn/#5", "PR #6",
    ]) {
      refuse(() => validateProseName(bad, "$.p"), "PROSE_NAME_GATE", "$.p");
    }
  });
});

const WILSON_6_OF_12 = {
  estimator: "unweighted", method: "wilson_95_unweighted", clustering: "independent_site", valid: true,
  low: 0.2537815976337061, high: 0.7462184023662939,
} as const;

const WILSON_6_OF_8 = {
  estimator: "unweighted", method: "wilson_95_unweighted", clustering: "independent_site", valid: true,
  low: 0.40927543031016883, high: 0.9285207872478909,
} as const;

function makeScalarRecord(overrides: Partial<BenchResultRecord> = {}): BenchResultRecord {
  return {
    armId: "arm-astra-low", armMissionSha256: "a".repeat(64), missingDigestAllowed: false,
    provider: "OpenAI", model: "gpt-6-astra-low", modelLabel: "Astra low", proseName: "OpenAI Astra low",
    effort: "low", isCascade: false, isHighlighted: true, incomplete: false,
    field: "headline", comparator: "generic", isPrimaryComparator: true,
    attempted: 20, accepted: 18, failed: 2, failuresByCode: { llm_error: 2 },
    unverifiedQuotesNulled: 1, unverifiedWholeRecordsDropped: null, goldPositive: 8, goldAbsent: 10,
    tp: 6, fp: 6, fpOnPresent: 4, fpOnAbsent: 2, fpElementsOnAbsent: 2, fn: 2, tn: 6,
    failedOnAbsent: 2, unresolved: 1, insufficient: 1, abstentionSpecificity: 0.75,
    sitePresence: {
      goldPresentSites: 8, goldAbsentSites: 10, unresolvedSites: 1, insufficientSites: 1,
      tpSites: 6, fnSites: 2, wrongValueOnPresentSites: 1, fpOnAbsentSites: 2, tnSites: 6, failedOnAbsentSites: 2,
      siteRecall: 0.75, siteRecallInterval: { ...WILSON_6_OF_8 },
      siteAbstentionSpecificity: 0.75, siteAbstentionInterval: { ...WILSON_6_OF_8 },
    },
    unweighted: {
      precision: 0.5, recall: 0.75, f1: 0.6,
      precisionInterval: { ...WILSON_6_OF_12 }, recallInterval: { ...WILSON_6_OF_8 },
    },
    weighted: null, precision: 0.5, recall: 0.75, f1: 0.6,
    precisionInterval: { ...WILSON_6_OF_12 }, recallInterval: { ...WILSON_6_OF_8 },
    indeterminate: { precision: true, recall: true, f1: true },
    calls: 25, callsPerItem: 0.25,
    tokens: { input: 5000, output: 900, reasoning: 100, cached: "unknown", total: 6000 },
    cost: {
      currency: "CAD", costBasisItems: 100, costUnknownReason: null,
      apiEquivalentTotal: 0.25, apiEquivalentPerItem: 0.0025,
      tariffStatus: "primary", tariffSource: "openai", tariffAsOf: "2026-11-20", fxApplied: null,
      seatStatus: "measured", seatMethod: "weekly_burn_delta", seatUnknownReason: null,
      seatSharePerItem: 0.002, seatCostPerItem: 0.04, seatPlan: "Pro", seatMonthlyPrice: 280,
      seatLimitScale: 1, seatPlanSource: "invoice", seatPlanAsOf: "2026-11-20",
    },
    ...overrides,
  };
}

function makeResultsFile(records: BenchResultRecord[] = [makeScalarRecord()]): BenchResultsFile {
  return {
    schemaId: "urn:engram:bench-results:1.0.0", schemaVersion: 1,
    generatedAt: "2026-11-25T10:00:00Z", campaignId: "lotb-eval",
    corpus: {
      partition: "eval", primaryEstimator: "unweighted", costBasisLabel: "extracted_packet", currency: "CAD",
      goldenMissionSha256: "b".repeat(64), candidateMissionSha256: "c".repeat(64), fieldShapeVerified: true,
      goldenSha256: "d".repeat(64), goldenIds: 20, fields: ["headline"], annotatorCount: 3,
      krippendorffAlphaByField: { headline: 0.8 },
    },
    supportFloors: { recallMinPositives: 30, precisionMinPredictions: 30, failureCeiling: 0.05 },
    records,
  };
}

describe("record uniqueness, primary comparator and proseName coherence", () => {
  it("validates empty records, secondary comparators, multi-field and multi-arm records", () => {
    const secondField = makeScalarRecord({ field: "province", comparator: "generic" });
    const secondaryComparator = makeScalarRecord({ comparator: "alt", isPrimaryComparator: false });
    const secondArm = makeScalarRecord({ armId: "arm-astra-med", proseName: "OpenAI Astra med" });
    const file = makeResultsFile([makeScalarRecord(), secondaryComparator, secondField, secondArm]);
    expect(validateBenchResultsInvariants(file).records).toHaveLength(4);
    expect(validateBenchResultsInvariants(makeResultsFile([])).records).toEqual([]);
  });

  it("refuses duplicate keys, primary comparator mismatches and proseName arm collisions", () => {
    refuse(
      () => validateBenchResultsInvariants(makeResultsFile([makeScalarRecord(), makeScalarRecord()])),
      "DUPLICATE_RECORD_KEY",
      "$.records[1]",
    );
    refuse(() => validateBenchResultsInvariants(makeResultsFile([
      makeScalarRecord(), makeScalarRecord({ comparator: "alt", isPrimaryComparator: true }),
    ])), "PRIMARY_COMPARATOR", "$.records[1].isPrimaryComparator");
    refuse(() => validateBenchResultsInvariants(makeResultsFile([
      makeScalarRecord({ isPrimaryComparator: false }),
      makeScalarRecord({ comparator: "alt", isPrimaryComparator: false }),
    ])), "PRIMARY_COMPARATOR", "$.records[0].isPrimaryComparator");
    refuse(() => validateBenchResultsInvariants(makeResultsFile([
      makeScalarRecord(), makeScalarRecord({ field: "province", proseName: "OpenAI Astra med" }),
    ])), "PROSE_NAME_CONFLICT", "$.records[1].proseName");
    refuse(() => validateBenchResultsInvariants(makeResultsFile([
      makeScalarRecord(), makeScalarRecord({ armId: "arm-other", field: "province" }),
    ])), "PROSE_NAME_DUPLICATE", "$.records[1].proseName");
    refuse(() => validateBenchResultsInvariants(makeResultsFile([
      makeScalarRecord({ proseName: "OpenAI GPT-4.1" }),
    ])), "PROSE_NAME_GATE", "$.records[0].proseName");
  });
});

describe("count and sitePresence matrix invariants", () => {
  it("accepts single-field count, costBasis and scalar vs record variations", () => {
    const intervalPooled = {
      estimator: "unweighted", method: "none", clustering: "clustered_record_invalid", valid: false,
      low: null, high: null,
    } as const;
    const positiveCases: [(doc: any) => void, any?][] = [
      [(doc) => {
        doc.corpus.currency = "USD";
        doc.records[0].cost.currency = "USD";
      }],
      [(doc) => {
        const cost = doc.records[0].cost;
        cost.costBasisItems = 18;
        cost.apiEquivalentTotal = 0.18;
        cost.apiEquivalentPerItem = 0.01;
      }],
      [(doc) => {
        const record = doc.records[0];
        record.calls = "unknown";
        record.callsPerItem = "unknown";
        record.tokens = "unknown";
        record.cost.costBasisItems = 10;
        record.cost.costUnknownReason = "incomplete-invocation-summary";
        record.cost.apiEquivalentTotal = "unknown";
        record.cost.apiEquivalentPerItem = "unknown";
      }],
      [(doc) => {
        doc.records[0].sitePresence.wrongValueOnPresentSites = 2;
      }],
      [
        (doc) => {
          const record = doc.records[0];
          record.field = "tags";
          record.fpElementsOnAbsent = 4;
          record.fpOnPresent = 2;
          record.unweighted.precisionInterval = { ...intervalPooled };
          record.unweighted.recallInterval = { ...intervalPooled };
          record.precisionInterval = { ...intervalPooled };
          record.recallInterval = { ...intervalPooled };
        },
        { missionSpecs: [{ name: "tags", kind: "scalar", maxValues: 3 }] },
      ],
      [
        (doc) => {
          const record = doc.records[0];
          record.field = "office.city";
          record.goldAbsent = 99;
          record.unweighted.precisionInterval = { ...intervalPooled };
          record.unweighted.recallInterval = { ...intervalPooled };
          record.precisionInterval = { ...intervalPooled };
          record.recallInterval = { ...intervalPooled };
        },
        { missionSpecs: [{ name: "office", kind: "record", maxValues: 3, subFields: [{ name: "city" }] }] },
      ],
    ];
    for (const [mutate, opts] of positiveCases) {
      const doc = clone(makeResultsFile());
      mutate(doc);
      expect(validateBenchResultsInvariants(doc, opts).records).toHaveLength(1);
    }
    expect(validateBenchResultsInvariants(makeResultsFile(), {}).records).toHaveLength(1);
    expect(validateBenchResultsInvariants(makeResultsFile(), {
      missionSpecs: [{ name: "headline", kind: "scalar", maxValues: 1 }],
    }).records).toHaveLength(1);
  });

  it("refuses core currency, attempted, count and sitePresence matrix mismatches", () => {
    const coreCases: [(doc: any) => void, BenchInvariantCode, string][] = [
      [(doc) => { doc.records[0].cost.currency = "USD"; }, "CURRENCY_MISMATCH", "$.records[0].cost.currency"],
      [(doc) => { doc.records[0].attempted = 19; }, "ATTEMPTED_MISMATCH", "$.records[0].attempted"],
      [(doc) => { doc.records[0].accepted = 17; }, "COUNT_IDENTITY", "$.records[0].accepted"],
      [(doc) => { doc.records[0].cost.costBasisItems = 17; }, "COST_BASIS", "$.records[0].cost.costBasisItems"],
      [(doc) => { doc.records[0].fp = 7; }, "COUNT_IDENTITY", "$.records[0].fp"],
      [(doc) => { doc.records[0].tp = 7; }, "COUNT_IDENTITY", "$.records[0].tp"],
      [(doc) => { doc.records[0].tn = 5; }, "COUNT_IDENTITY", "$.records[0].tn"],
      [(doc) => { doc.records[0].abstentionSpecificity = 0.7; },
        "COUNT_IDENTITY", "$.records[0].abstentionSpecificity"],
      [(doc) => { doc.records[0].sitePresence.tpSites = 5; },
        "SITE_MATRIX_IDENTITY", "$.records[0].sitePresence.tpSites"],
      [(doc) => { doc.records[0].sitePresence.tnSites = 5; },
        "SITE_MATRIX_IDENTITY", "$.records[0].sitePresence.tnSites"],
      [(doc) => { doc.records[0].sitePresence.siteRecall = 0.5; },
        "SITE_MATRIX_IDENTITY", "$.records[0].sitePresence.siteRecall"],
    ];
    for (const [mutate, invariant, path] of coreCases) {
      const doc = clone(makeResultsFile());
      mutate(doc);
      refuse(() => validateBenchResultsInvariants(doc), invariant, path);
    }
  });
});

const WILSON_6_OF_10 = {
  estimator: "unweighted", method: "wilson_95_unweighted", clustering: "independent_site", valid: true,
  low: 0.31267376973365824, high: 0.8318196702937638,
} as const;

const WILSON_0_OF_2 = {
  estimator: "unweighted", method: "wilson_95_unweighted", clustering: "independent_site", valid: true,
  low: 0, high: 0.6576197724933469,
} as const;

const WILSON_8_OF_8 = {
  estimator: "unweighted", method: "wilson_95_unweighted", clustering: "independent_site", valid: true,
  low: 0.6755924351161198, high: 1,
} as const;

describe("zero-denominator, count and sitePresence failure matrix", () => {
  it("accepts isolated zero-denominator null metrics across precision, recall and abstention", () => {
    const intervalOff = {
      estimator: "unweighted", method: "none", clustering: "independent_site", valid: false, low: null, high: null,
    } as const;
    const positiveCases: ((doc: any) => void)[] = [
      (doc) => {
        const record = doc.records[0];
        record.tp = 0;
        record.fn = 2;
        record.goldPositive = 2;
        record.fp = 0;
        record.fpOnPresent = 0;
        record.fpOnAbsent = 0;
        record.fpElementsOnAbsent = 0;
        record.tn = 8;
        record.failedOnAbsent = 2;
        record.abstentionSpecificity = 1;
        record.precision = null;
        record.recall = 0;
        record.f1 = 0;
        record.precisionInterval = { ...intervalOff };
        record.recallInterval = { ...WILSON_0_OF_2 };
        record.unweighted = {
          precision: null, recall: 0, f1: 0,
          precisionInterval: { ...intervalOff }, recallInterval: { ...WILSON_0_OF_2 },
        };
        record.sitePresence = {
          ...record.sitePresence, goldPresentSites: 2, unresolvedSites: 4, insufficientSites: 4,
          tpSites: 0, fnSites: 2, wrongValueOnPresentSites: 0, fpOnAbsentSites: 0, tnSites: 8,
          siteRecall: 0, siteRecallInterval: { ...WILSON_0_OF_2 },
          siteAbstentionSpecificity: 1, siteAbstentionInterval: { ...WILSON_8_OF_8 },
        };
      },
      (doc) => {
        const record = doc.records[0];
        record.tp = 0;
        record.fn = 0;
        record.goldPositive = 0;
        record.fp = 2;
        record.fpOnPresent = 0;
        record.fpOnAbsent = 2;
        record.fpElementsOnAbsent = 2;
        record.precision = 0;
        record.recall = null;
        record.f1 = 0;
        record.precisionInterval = { ...WILSON_0_OF_2 };
        record.recallInterval = { ...intervalOff };
        record.unweighted = {
          precision: 0, recall: null, f1: 0,
          precisionInterval: { ...WILSON_0_OF_2 }, recallInterval: { ...intervalOff },
        };
        record.sitePresence = {
          ...record.sitePresence, goldPresentSites: 0, unresolvedSites: 5, insufficientSites: 5,
          tpSites: 0, fnSites: 0, wrongValueOnPresentSites: 0,
          siteRecall: null, siteRecallInterval: { ...intervalOff },
        };
      },
      (doc) => {
        const record = doc.records[0];
        record.tn = 0;
        record.fp = 4;
        record.fpOnPresent = 4;
        record.fpOnAbsent = 0;
        record.fpElementsOnAbsent = 0;
        record.failedOnAbsent = 10;
        record.abstentionSpecificity = null;
        record.precision = 0.6;
        record.recall = 0.75;
        record.f1 = 2 / 3;
        record.precisionInterval = { ...WILSON_6_OF_10 };
        record.recallInterval = { ...WILSON_6_OF_8 };
        record.unweighted = {
          precision: 0.6, recall: 0.75, f1: 2 / 3,
          precisionInterval: { ...WILSON_6_OF_10 }, recallInterval: { ...WILSON_6_OF_8 },
        };
        record.sitePresence = {
          ...record.sitePresence, tnSites: 0, fpOnAbsentSites: 0, failedOnAbsentSites: 10,
          siteAbstentionSpecificity: null, siteAbstentionInterval: { ...intervalOff },
        };
      },
      (doc) => {
        const record = doc.records[0];
        record.tp = 0;
        record.fp = 0;
        record.fpOnPresent = 0;
        record.fpOnAbsent = 0;
        record.fpElementsOnAbsent = 0;
        record.fn = 0;
        record.goldPositive = 0;
        record.tn = 8;
        record.failedOnAbsent = 2;
        record.abstentionSpecificity = 1;
        record.precision = null;
        record.recall = null;
        record.f1 = null;
        record.precisionInterval = { ...intervalOff };
        record.recallInterval = { ...intervalOff };
        record.unweighted = {
          precision: null, recall: null, f1: null,
          precisionInterval: { ...intervalOff }, recallInterval: { ...intervalOff },
        };
        record.sitePresence = {
          ...record.sitePresence, goldPresentSites: 0, unresolvedSites: 5, insufficientSites: 5,
          tpSites: 0, fnSites: 0, wrongValueOnPresentSites: 0, fpOnAbsentSites: 0, tnSites: 8,
          siteRecall: null, siteRecallInterval: { ...intervalOff },
          siteAbstentionSpecificity: 1, siteAbstentionInterval: { ...WILSON_8_OF_8 },
        };
      },
    ];
    for (const mutate of positiveCases) {
      const doc = clone(makeResultsFile());
      mutate(doc);
      expect(validateBenchResultsInvariants(doc).records).toHaveLength(1);
    }
  });

  it("refuses remaining single-defect count identity violations", () => {
    const cases: [(doc: any) => void, BenchInvariantCode, string, any?][] = [
      [(doc) => { doc.corpus.goldenIds = 21; }, "ATTEMPTED_MISMATCH", "$.records[0].attempted"],
      [(doc) => { doc.records[0].failed = 3; }, "COUNT_IDENTITY", "$.records[0].accepted"],
      [(doc) => { doc.records[0].fpOnPresent = 5; }, "COUNT_IDENTITY", "$.records[0].fp"],
      [(doc) => { doc.records[0].fpElementsOnAbsent = 3; }, "COUNT_IDENTITY", "$.records[0].fp"],
      [
        (doc) => {
          doc.records[0].fp = 5;
          doc.records[0].fpElementsOnAbsent = 1;
        },
        "COUNT_IDENTITY",
        "$.records[0].fpElementsOnAbsent",
      ],
      [
        (doc) => {
          doc.records[0].fp = 7;
          doc.records[0].fpElementsOnAbsent = 3;
        },
        "COUNT_IDENTITY",
        "$.records[0].fpElementsOnAbsent",
        { missionSpecs: [{ name: "headline", kind: "scalar", maxValues: 1 }] },
      ],
      [
        (doc) => {
          doc.records[0].fp = 4;
          doc.records[0].fpOnAbsent = 0;
          doc.records[0].fpElementsOnAbsent = 1;
          doc.records[0].fpOnPresent = 3;
        },
        "COUNT_IDENTITY",
        "$.records[0].fpElementsOnAbsent",
      ],
      [(doc) => { doc.records[0].fn = 3; }, "COUNT_IDENTITY", "$.records[0].tp"],
      [(doc) => { doc.records[0].goldPositive = 9; }, "COUNT_IDENTITY", "$.records[0].tp"],
      [
        (doc) => {
          doc.records[0].fpOnAbsent = 3;
          doc.records[0].fpElementsOnAbsent = 3;
          doc.records[0].fp = 7;
        },
        "COUNT_IDENTITY",
        "$.records[0].tn",
      ],
      [(doc) => { doc.records[0].failedOnAbsent = 1; }, "COUNT_IDENTITY", "$.records[0].tn"],
      [(doc) => { doc.records[0].goldAbsent = 11; }, "COUNT_IDENTITY", "$.records[0].tn"],
      [
        (doc) => {
          const record = doc.records[0];
          record.tn = 0;
          record.fp = 4;
          record.fpOnPresent = 4;
          record.fpOnAbsent = 0;
          record.fpElementsOnAbsent = 0;
          record.failedOnAbsent = 10;
          record.abstentionSpecificity = 0;
          record.unweighted.precision = 0.6;
          record.precision = 0.6;
          record.unweighted.f1 = 2 / 3;
          record.f1 = 2 / 3;
          record.unweighted.precisionInterval = { ...WILSON_6_OF_10 };
          record.precisionInterval = { ...WILSON_6_OF_10 };
        },
        "COUNT_IDENTITY",
        "$.records[0].abstentionSpecificity",
      ],
      [
        (doc) => {
          doc.records[0].field = "tags";
          doc.records[0].fp = 4;
          doc.records[0].fpOnAbsent = 0;
          doc.records[0].fpElementsOnAbsent = 1;
          doc.records[0].fpOnPresent = 3;
        },
        "COUNT_IDENTITY",
        "$.records[0].fpElementsOnAbsent",
        { missionSpecs: [{ name: "tags", kind: "scalar", maxValues: 3 }] },
      ],
    ];
    for (const [mutate, invariant, path, opts] of cases) {
      const doc = clone(makeResultsFile());
      mutate(doc);
      refuse(() => validateBenchResultsInvariants(doc, opts), invariant, path);
    }
  });

  it("refuses remaining single-defect sitePresence matrix violations", () => {
    const cases: [(doc: any) => void, BenchInvariantCode, string][] = [
      [
        (doc) => { doc.records[0].sitePresence.fnSites = 3; },
        "SITE_MATRIX_IDENTITY",
        "$.records[0].sitePresence.tpSites",
      ],
      [
        (doc) => { doc.records[0].sitePresence.goldPresentSites = 9; },
        "SITE_MATRIX_IDENTITY",
        "$.records[0].sitePresence.tpSites",
      ],
      [
        (doc) => { doc.records[0].sitePresence.wrongValueOnPresentSites = 3; },
        "SITE_MATRIX_IDENTITY",
        "$.records[0].sitePresence.wrongValueOnPresentSites",
      ],
      [
        (doc) => { doc.records[0].sitePresence.fpOnAbsentSites = 3; },
        "SITE_MATRIX_IDENTITY",
        "$.records[0].sitePresence.tnSites",
      ],
      [
        (doc) => { doc.records[0].sitePresence.failedOnAbsentSites = 1; },
        "SITE_MATRIX_IDENTITY",
        "$.records[0].sitePresence.tnSites",
      ],
      [
        (doc) => { doc.records[0].sitePresence.goldAbsentSites = 11; },
        "SITE_MATRIX_IDENTITY",
        "$.records[0].sitePresence.tnSites",
      ],
      [
        (doc) => { doc.records[0].sitePresence.unresolvedSites = 2; },
        "SITE_MATRIX_IDENTITY",
        "$.records[0].sitePresence.goldPresentSites",
      ],
      [
        (doc) => { doc.records[0].sitePresence.insufficientSites = 2; },
        "SITE_MATRIX_IDENTITY",
        "$.records[0].sitePresence.goldPresentSites",
      ],
      [
        (doc) => {
          doc.records[0].sitePresence.goldPresentSites = 9;
          doc.records[0].sitePresence.tpSites = 7;
        },
        "SITE_MATRIX_IDENTITY",
        "$.records[0].sitePresence.goldPresentSites",
      ],
      [
        (doc) => { doc.records[0].sitePresence.siteAbstentionSpecificity = 0.5; },
        "SITE_MATRIX_IDENTITY",
        "$.records[0].sitePresence.siteAbstentionSpecificity",
      ],
    ];
    for (const [mutate, invariant, path] of cases) {
      const doc = clone(makeResultsFile());
      mutate(doc);
      refuse(() => validateBenchResultsInvariants(doc), invariant, path);
    }
  });
});
