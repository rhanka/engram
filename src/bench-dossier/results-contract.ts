import { readFileSync } from "node:fs";
import {
  BENCH_RESULTS_SCHEMA_ID, BENCH_RESULTS_SCHEMA_VERSION, COST_BASIS_KINDS, CURRENCY_CODES,
  ESTIMATOR_KINDS, PARTITION_KINDS, type BenchResultRecord, type BenchResultsFile,
} from "./results-types.js";
import {
  arrayOf, assertPlainObject, BenchResultsValidationError, booleanValue, countInt, enumValue,
  fieldsOf, finiteNumber, literalValue, nonEmptyString, nullable, objectSchema, requireNumber,
  requireString, stringMapOf, unitInterval, type Validator,
} from "./results-guards.js";
export * from "./results-types.js";
export { BenchResultsValidationError, type BenchResultsErrorCode } from "./results-guards.js";

const CURRENCY = enumValue(CURRENCY_CODES);
const RECORD_SCHEMA: Validator<BenchResultRecord> = (v, p) => { assertPlainObject(v, p); };

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
