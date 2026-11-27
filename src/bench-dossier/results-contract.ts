import { readFileSync } from "node:fs";
import {
  BENCH_RESULTS_SCHEMA_ID, BENCH_RESULTS_SCHEMA_VERSION, COST_BASIS_KINDS, COST_UNKNOWN_REASONS, CURRENCY_CODES,
  EFFORT_LEVELS, ESTIMATOR_KINDS, PARTITION_KINDS, SEAT_METHODS, SEAT_STATUSES, SEAT_UNKNOWN_REASONS,
  TARIFF_STATUSES, type BenchCostBlock, type BenchResultRecord, type BenchResultsFile,
  type SitePresenceMatrix, type WeightedEstimateBlock,
} from "./results-types.js";
import {
  arrayOf, BenchResultsValidationError, booleanValue, countInt, enumValue, fieldsOf, finiteNumber, literalValue,
  nonEmptyString, nonNegativeNumber, nullable, objectSchema, positiveNumber, requireNumber, requireString,
  stringMapOf, unitInterval, unknownOr, validateBenchInterval, type Validator,
} from "./results-guards.js";
export * from "./results-types.js";
export { BenchResultsValidationError, type BenchResultsErrorCode } from "./results-guards.js";

const METRICS = fieldsOf(["precision", "recall", "f1"], nullable(unitInterval));
const INTERVALS = fieldsOf(["precisionInterval", "recallInterval"], validateBenchInterval);
const CURRENCY = enumValue(CURRENCY_CODES);

const SITE_PRESENCE_SCHEMA: Validator<SitePresenceMatrix> = objectSchema({
  ...fieldsOf(["goldPresentSites", "goldAbsentSites", "unresolvedSites", "insufficientSites", "tpSites",
    "fnSites", "wrongValueOnPresentSites", "fpOnAbsentSites", "tnSites", "failedOnAbsentSites"], countInt),
  ...fieldsOf(["siteRecall", "siteAbstentionSpecificity"], nullable(unitInterval)),
  ...fieldsOf(["siteRecallInterval", "siteAbstentionInterval"], validateBenchInterval),
});

const WEIGHTED_SCHEMA: Validator<WeightedEstimateBlock> = objectSchema(
  { scheme: nonEmptyString, deff: nullable(positiveNumber),
    nEff: nullable(nonNegativeNumber), ...METRICS, ...INTERVALS },
  { f1Interval: validateBenchInterval },
);

export const COST_SCHEMA: Validator<BenchCostBlock> = objectSchema({
  currency: CURRENCY, costBasisItems: countInt, costUnknownReason: nullable(enumValue(COST_UNKNOWN_REASONS)),
  ...fieldsOf(["apiEquivalentTotal", "apiEquivalentPerItem", "seatSharePerItem", "seatCostPerItem"],
    unknownOr(nonNegativeNumber)),
  tariffStatus: enumValue(TARIFF_STATUSES),
  ...fieldsOf(["tariffSource", "tariffAsOf", "seatPlan", "seatPlanSource", "seatPlanAsOf"], nullable(nonEmptyString)),
  fxApplied: nullable(objectSchema({
    from: CURRENCY, to: CURRENCY, rate: positiveNumber, ...fieldsOf(["source", "asOf"], nonEmptyString),
  })),
  seatStatus: enumValue(SEAT_STATUSES), seatMethod: enumValue(SEAT_METHODS),
  seatUnknownReason: nullable(enumValue(SEAT_UNKNOWN_REASONS)),
  seatMonthlyPrice: nullable(nonNegativeNumber), seatLimitScale: nullable(positiveNumber),
});

const RECORD_SCHEMA: Validator<BenchResultRecord> = objectSchema(
  {
    ...fieldsOf(["armId", "armMissionSha256", "provider", "model", "modelLabel",
      "proseName", "field", "comparator"], nonEmptyString),
    ...fieldsOf(["missingDigestAllowed", "isCascade", "isHighlighted",
      "incomplete", "isPrimaryComparator"], booleanValue),
    ...fieldsOf(["attempted", "accepted", "failed", "unverifiedQuotesNulled", "goldPositive", "goldAbsent",
      "tp", "fp", "fpOnPresent", "fpOnAbsent", "fpElementsOnAbsent", "fn", "tn", "failedOnAbsent",
      "unresolved", "insufficient"], countInt),
    effort: enumValue(EFFORT_LEVELS), failuresByCode: stringMapOf(countInt),
    unverifiedWholeRecordsDropped: nullable(countInt), abstentionSpecificity: nullable(unitInterval),
    sitePresence: SITE_PRESENCE_SCHEMA,
    unweighted: objectSchema({ ...METRICS, ...INTERVALS }), weighted: nullable(WEIGHTED_SCHEMA),
    ...METRICS, ...INTERVALS,
    indeterminate: objectSchema(fieldsOf(["precision", "recall", "f1"], booleanValue)),
    calls: unknownOr(countInt), callsPerItem: unknownOr(nonNegativeNumber),
    tokens: unknownOr(objectSchema({
      ...fieldsOf(["input", "output", "reasoning", "total"], countInt), cached: unknownOr(countInt),
    })),
    cost: COST_SCHEMA,
  },
  {
    independentGroupSupport: objectSchema(fieldsOf(["predictions", "positives"], countInt)),
    diagnostics: objectSchema({}, {
      broad: objectSchema({ ...fieldsOf(["tp", "fp", "fn"], countInt), ...METRICS }),
      conditionalRetainedRecall: nullable(unitInterval),
    }),
  },
);

const FILE_SCHEMA: Validator<BenchResultsFile> = objectSchema({
  schemaId: literalValue(BENCH_RESULTS_SCHEMA_ID, "BAD_SCHEMA", requireString),
  schemaVersion: literalValue(BENCH_RESULTS_SCHEMA_VERSION, "BAD_VERSION", requireNumber),
  ...fieldsOf(["generatedAt", "campaignId"], nonEmptyString),
  corpus: objectSchema(
    {
      ...fieldsOf(["goldenMissionSha256", "candidateMissionSha256", "goldenSha256"], nonEmptyString),
      ...fieldsOf(["goldenIds", "annotatorCount"], countInt),
      partition: enumValue(PARTITION_KINDS), primaryEstimator: enumValue(ESTIMATOR_KINDS),
      costBasisLabel: enumValue(COST_BASIS_KINDS), currency: CURRENCY,
      fieldShapeVerified: literalValue(true as const, "BAD_SHAPE", booleanValue),
      fields: arrayOf(nonEmptyString), krippendorffAlphaByField: stringMapOf(nullable(finiteNumber)),
    },
    {
      ...fieldsOf(["captureSuppliedIds", "captureAttemptedIds", "captureOkIds"], countInt),
      goldenLabel: nonEmptyString, maxValuesChanged: booleanValue,
      fieldLabels: stringMapOf(objectSchema({ en: nonEmptyString, fr: nonEmptyString })),
      annotatorRunStats: stringMapOf(objectSchema(fieldsOf(["answered", "failed", "missing"], countInt))),
      missingDigestRuns: arrayOf(nonEmptyString),
    },
  ),
  supportFloors: objectSchema({
    ...fieldsOf(["recallMinPositives", "precisionMinPredictions"], countInt), failureCeiling: unitInterval,
  }),
  records: arrayOf(RECORD_SCHEMA),
});

/** Validate and return an unknown value as a closed BenchResultsFile. */
export function parseBenchResultsFile(value: unknown): BenchResultsFile {
  FILE_SCHEMA(value, "$");
  return value as BenchResultsFile;
}
/** Read and validate a BenchResultsFile JSON document from disk. */
export function readBenchResultsFile(filePath: string): BenchResultsFile {
  let raw: string;
  try { raw = readFileSync(filePath, "utf8"); } catch (cause) {
    const code = (cause as NodeJS.ErrnoException | undefined)?.code;
    throw new BenchResultsValidationError("IO_ERROR", filePath, {
      errno: typeof code === "string" ? code : undefined, cause,
    });
  }
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch (cause) {
    throw new BenchResultsValidationError("BAD_JSON", "$", { cause });
  }
  return parseBenchResultsFile(parsed);
}
