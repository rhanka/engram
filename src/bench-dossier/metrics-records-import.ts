import type { FieldSpec, RecordSubField } from "../scrap/extract.js";
import * as contract from "./results-contract.js";
import * as companion from "./companion-contracts.js";
import { arrayOf, booleanValue, countInt, enumValue, fail, fieldsOf, nonEmptyString, nonNegativeNumber,
  objectSchema, stringMapOf, unitInterval, unknownOr, validateClosedObject, type Validator } from "./results-guards.js";
import { BenchInvariantError, validateBenchResultsInvariants } from "./invariants.js";
import { ensure } from "./metrics-unweighted.js";
import { buildFallbackUsage, projectImportedRecord } from "./metrics-records-score.js";

export type ImportedArmCostInput =
  Pick<contract.BenchResultRecord, "calls" | "callsPerItem" | "tokens" | "cost">
  & { readonly armMissionSha256?: string };

export interface ImportMetricsInput extends Partial<Pick<contract.BenchResultsFile["corpus"],
  "currency" | "costBasisLabel" | "maxValuesChanged" | "captureSuppliedIds"
  | "captureAttemptedIds" | "captureOkIds" | "fieldLabels">> {
  readonly metrics: unknown;
  readonly arms: Readonly<Record<string, unknown>>;
  readonly generatedAt?: string;
  readonly supportFloors?: Partial<contract.BenchResultsFile["supportFloors"]>;
  readonly armCosts?: Readonly<Record<string, ImportedArmCostInput>>;
  readonly missionSpecs?: readonly FieldSpec[];
}

const validateFieldSpec: Validator<FieldSpec> = (val, path) => {
  const spec = validateClosedObject(val, path, {
    name: nonEmptyString, kind: enumValue(["scalar", "record"]),
    maxValues: (maxVal, maxPath) => {
      countInt(maxVal, maxPath);
      if ((maxVal as number) < 1) fail("NON_POSITIVE", maxPath);
    },
  }, { subFields: arrayOf(objectSchema<RecordSubField>({ name: nonEmptyString },
    { instruction: nonEmptyString })) }) as FieldSpec;
  if (spec.kind === "record" && !spec.subFields?.length) fail(spec.subFields ? "BAD_SHAPE" : "MISSING_KEY",
    `${path}.subFields`);
  if (spec.kind === "scalar" && spec.subFields !== undefined) fail("BAD_SHAPE", `${path}.subFields`);
};

const INPUT_OPT: Record<string, Validator<unknown>> = {
  generatedAt: nonEmptyString, maxValuesChanged: booleanValue,
  currency: enumValue(contract.CURRENCY_CODES), costBasisLabel: enumValue(contract.COST_BASIS_KINDS),
  ...fieldsOf(["captureSuppliedIds", "captureAttemptedIds", "captureOkIds"], countInt),
  fieldLabels: stringMapOf(objectSchema(fieldsOf(["en", "fr"], nonEmptyString))),
  supportFloors: objectSchema<Partial<contract.BenchResultsFile["supportFloors"]>>({}, {
    ...fieldsOf(["recallMinPositives", "precisionMinPredictions"], countInt), failureCeiling: unitInterval }),
  armCosts: stringMapOf(objectSchema<ImportedArmCostInput>({
    calls: unknownOr(countInt), callsPerItem: unknownOr(nonNegativeNumber),
    tokens: unknownOr(objectSchema({ ...fieldsOf(["input", "output", "reasoning", "total"], countInt),
      cached: unknownOr(countInt) })), cost: contract.COST_SCHEMA }, { armMissionSha256: nonEmptyString })),
  missionSpecs: arrayOf(validateFieldSpec),
};

const tokensEqual = (left: contract.BenchResultRecord["tokens"], right: contract.BenchResultRecord["tokens"]) =>
  left === right || (typeof left === "object" && typeof right === "object" && left.input === right.input
    && left.output === right.output && left.reasoning === right.reasoning
    && left.cached === right.cached && left.total === right.total);

const definedFields = (obj: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(obj).filter(([, val]) => val !== undefined));

function resolveUsage(
  rec: companion.MetricsImportRecord, arm: companion.ArmManifestFile, currency: contract.CurrencyCode,
  candidateSha: string, armCost?: ImportedArmCostInput,
) {
  const digests = [rec.armMissionSha256, armCost?.armMissionSha256, arm.missionSha256]
    .filter((val) => val !== undefined);
  ensure(new Set(digests).size <= 1, "MISSION_DIGEST_MISMATCH", `${rec.armId}: conflicting mission digest`);
  ensure(digests.length > 0 || !arm.missionPath, "MISSING_ARM_DIGEST", `${rec.armId}: missing missionSha256`);
  const armMissionSha256 = digests[0] ?? candidateSha;
  if (!armCost) return buildFallbackUsage(rec, arm, currency, armMissionSha256);
  const { calls, callsPerItem, tokens, cost } = armCost;
  ensure((rec.calls === undefined || rec.calls === calls)
    && (rec.costBasisItems === undefined || rec.costBasisItems === cost.costBasisItems)
    && (rec.apiEquivalentTotal === undefined || rec.apiEquivalentTotal === cost.apiEquivalentTotal)
    && (rec.tokens === undefined || tokensEqual(rec.tokens, tokens)), "COST_CONFLICT", `${rec.armId}: conflict`);
  return { armMissionSha256, calls, callsPerItem, tokens, cost };
}

/** Map a validated metrics.json import file and arm manifests losslessly to BenchResultsFile. */
export function mapMetricsImportToBenchResults(input: ImportMetricsInput): contract.BenchResultsFile {
  validateClosedObject(input, "$", { metrics: (val) => void companion.parseMetricsImportFile(val),
    arms: stringMapOf((val) => void companion.parseArmManifest(val)) }, INPUT_OPT);
  const metrics = input.metrics as companion.BenchMetricsImportFile;
  const arms = input.arms as Readonly<Record<string, companion.ArmManifestFile>>;
  for (const [armKey, arm] of Object.entries(arms)) ensure(arm.armId === armKey, "ARM_ID_MISMATCH", armKey);
  ensure(!metrics.currency || !input.currency || metrics.currency === input.currency, "CURRENCY_MISMATCH", "conflict");
  ensure(!metrics.costBasisLabel || !input.costBasisLabel || metrics.costBasisLabel === input.costBasisLabel,
    "COST_BASIS_CONFLICT", "costBasisLabel conflict");
  const currency = metrics.currency ?? input.currency ?? "USD";
  for (const [armKey, armCost] of Object.entries(input.armCosts ?? {})) {
    ensure(Object.hasOwn(arms, armKey), "MISSING_ARM", `unknown ${armKey}`);
    ensure(armCost.cost.currency === currency, "CURRENCY_MISMATCH", `${armKey}: armCost currency mismatch`);
  }
  const costBasisLabel = metrics.costBasisLabel ?? input.costBasisLabel ?? "extracted_packet";
  const supportFloors = { recallMinPositives: 30, precisionMinPredictions: 30, failureCeiling: 0.05,
    ...metrics.supportFloors, ...(input.supportFloors ? definedFields(input.supportFloors) : {}) };
  const records = metrics.records.map((rec, idx): contract.BenchResultRecord => {
    ensure(Object.hasOwn(arms, rec.armId), "MISSING_ARM", `missing arm ${rec.armId}`);
    if (metrics.primaryEstimator === "weighted" && !rec.weighted) throw new BenchInvariantError("ESTIMATOR_PAIRING",
      `$.records[${idx}].weighted`);
    const arm = arms[rec.armId]!;
    const armCost = input.armCosts && Object.hasOwn(input.armCosts, rec.armId) ? input.armCosts[rec.armId] : undefined;
    const usage = resolveUsage(rec, arm, currency, metrics.candidateMissionSha256, armCost);
    return projectImportedRecord(rec, arm, metrics.primaryEstimator, supportFloors, usage);
  });
  const { schemaId: _i, records: _r, supportFloors: _f, campaignId, costBasisLabel: _l, currency: _c, ...cRest } =
    metrics;
  return validateBenchResultsInvariants(contract.parseBenchResultsFile({
    schemaId: contract.BENCH_RESULTS_SCHEMA_ID, schemaVersion: contract.BENCH_RESULTS_SCHEMA_VERSION, campaignId,
    generatedAt: input.generatedAt ?? new Date().toISOString().replace(".000Z", "Z"),
    corpus: { ...cRest, costBasisLabel, currency, ...definedFields({ maxValuesChanged: input.maxValuesChanged,
      captureSuppliedIds: input.captureSuppliedIds, captureAttemptedIds: input.captureAttemptedIds,
      captureOkIds: input.captureOkIds, fieldLabels: input.fieldLabels }) },
    supportFloors, records }), input.missionSpecs ? { missionSpecs: input.missionSpecs } : undefined);
}
