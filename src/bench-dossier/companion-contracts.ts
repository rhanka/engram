import { readFileSync } from "node:fs";
import * as R from "./results-types.js";
import { arrayOf, assertPlainObject, BenchResultsValidationError, booleanValue, countInt, enumValue, fail,
  fieldsOf, finiteNumber, literalValue, nonEmptyString, nonNegativeNumber, nullable, objectSchema, positiveNumber,
  requireString, stringMapOf, unitInterval, unknownOr, validateBenchInterval,
  type BenchResultsErrorCode, type Validator } from "./results-guards.js";
import * as T from "./companion-types.js";
export * from "./companion-types.js";
export { BenchResultsValidationError, type BenchResultsErrorCode } from "./results-guards.js";

const CURRENCY = enumValue(R.CURRENCY_CODES), METRICS = fieldsOf(["precision", "recall", "f1"], nullable(unitInterval));
const INTERVALS = fieldsOf(["precisionInterval", "recallInterval"], validateBenchInterval);
const schemaId = <S extends string>(id: S) => literalValue(id, "BAD_SCHEMA", requireString);
const seatStatus = <S extends string>(s: S) => literalValue(s, "BAD_ENUM", requireString);
const strFields = <const K extends string>(...keys: K[]) => fieldsOf(keys, nonEmptyString);
const countFields = <const K extends string>(...keys: K[]) => fieldsOf(keys, countInt);
const seatMethod = <M extends string>(m: M): Validator<M> =>
  (v, p) => { enumValue(R.SEAT_METHODS)(v, p); if (v !== m) fail("BAD_SHAPE", p); };
const strLen = (min: number, max = Infinity): Validator<string> => (v, p) => { nonEmptyString(v, p);
  const len = (v as string).trim().length; if (len < min || len > max) fail("BAD_SHAPE", p); };
const posInt: Validator<number> = (v, p) => { countInt(v, p); if ((v as number) < 1) fail("NON_POSITIVE", p); };
const inRange = (min: number, max: number, code: BenchResultsErrorCode = "BAD_SHAPE"): Validator<number> => (v, p) => {
  positiveNumber(v, p); if ((v as number) < min || (v as number) > max) fail(code, p); };
const digitFree: Validator<string> = (v, p) => { nonEmptyString(v, p); if ((v as string).match(/\S+/g)?.some((t) =>
  /\d/.test(t) && !/^(?:h2a|utf-8)$/i.test(t.replace(/^[^\w-]+|[^\w-]+$/g, "")))) fail("BAD_SHAPE", p); };
const dossierRef: Validator<string> = (v, p) => { nonEmptyString(v, p); const s = v as string;
  if (!/^(?:report|decision):[^\s\x00-\x1f\x7f]+$/.test(s) || s.length > 122) fail("BAD_SHAPE", p); };
const SEAT_ID = schemaId(T.SEAT_OBSERVATION_SCHEMA_ID), SEAT_OPT = { schemaId: SEAT_ID, planCurrency: CURRENCY };
const SEAT_PLAN = { windowMinutes: literalValue(T.SEAT_OBSERVATION_WINDOW_MINUTES, "BAD_SHAPE", countInt),
  ...strFields("plan", "planSource", "planAsOf"), planMonthlyPrice: nonNegativeNumber };
const SEAT_ARM: Record<T.SeatObservationInput["status"], Validator<T.SeatObservationInput>> = {
  unknown: objectSchema<T.SeatObservationUnknown>({ status: seatStatus("unknown" as const),
    reason: enumValue(R.SEAT_UNKNOWN_REASONS) }, { schemaId: SEAT_ID, method: seatMethod("unknown") }),
  measured: objectSchema<T.SeatObservationMeasured>({ ...SEAT_PLAN, status: seatStatus("measured" as const),
    method: seatMethod("weekly_burn_delta"), isolatedSeat: literalValue(true as const, "BAD_SHAPE", booleanValue),
    ...fieldsOf(["remainingBefore", "remainingAfter"], unitInterval), observedItems: posInt }, SEAT_OPT),
  estimated: objectSchema<T.SeatObservationEstimated>({ ...SEAT_PLAN, status: seatStatus("estimated" as const),
    method: seatMethod("api_cost_proportional"), observedApiEquivalent: positiveNumber, quotaDeltaFraction:
    inRange(0, 1, "UNIT_RANGE"), ...fieldsOf(["basePlanMultiplier", "targetPlanMultiplier"], positiveNumber) },
  { ...SEAT_OPT, isolatedSeat: booleanValue, observedCurrency: CURRENCY }) };
const validateSeat: Validator<T.SeatObservationInput> = (v, p) => { const o = assertPlainObject(v, p);
  if (!Object.hasOwn(o, "status")) fail("MISSING_KEY", `${p}.status`);
  const s = requireString(o.status, `${p}.status`); if (!Object.hasOwn(SEAT_ARM, s)) fail("BAD_ENUM", `${p}.status`);
  SEAT_ARM[s as T.SeatObservationInput["status"]](v, p);
  if (s === "measured" && (o.remainingAfter as number) > (o.remainingBefore as number)) fail("BAD_SHAPE", p); };
const ARM_SCHEMA = objectSchema<T.ArmManifestFile>({ schemaId: schemaId(T.ARM_MANIFEST_SCHEMA_ID), effort:
  enumValue(R.EFFORT_LEVELS), isCascade: booleanValue, ...strFields("armId", "provider", "model", "modelLabel",
  "proseName") }, { ...strFields("missionPath", "missionSha256"), seat: validateSeat, tariffStatus:
  enumValue(T.ARM_TARIFF_STATUSES), ...fieldsOf(["allowLegacyMissingMissionDigest", "isHighlighted", "incomplete"],
  booleanValue), fx: objectSchema({ from: CURRENCY, to: CURRENCY, rate: positiveNumber,
  ...strFields("source", "asOf") }), tariffOverride: objectSchema({ status: enumValue(R.TARIFF_STATUSES),
  ...fieldsOf(["source", "asOf"], nullable(nonEmptyString)) }, { currency: CURRENCY,
  perMillion: objectSchema(fieldsOf(["input", "output"], nonNegativeNumber), { reasoning: nonNegativeNumber }) }) });
const SEAT_FILE = objectSchema<T.SeatObservationsFile>({ schemaId: SEAT_ID, observations: stringMapOf(validateSeat) });
const SITE_SCHEMA: Validator<R.SitePresenceMatrix> = objectSchema({ ...countFields("goldPresentSites",
  "goldAbsentSites", "unresolvedSites", "insufficientSites", "tpSites", "fnSites", "wrongValueOnPresentSites",
  "fpOnAbsentSites", "tnSites", "failedOnAbsentSites"),
  ...fieldsOf(["siteRecall", "siteAbstentionSpecificity"], nullable(unitInterval)),
  ...fieldsOf(["siteRecallInterval", "siteAbstentionInterval"], validateBenchInterval) });
const REC_SCHEMA: Validator<T.MetricsImportRecord> = objectSchema({ ...strFields("armId", "field", "comparator"),
  isPrimaryComparator: booleanValue, failuresByCode: stringMapOf(countInt), ...countFields("attempted", "accepted",
    "failed", "unverifiedQuotesNulled", "goldPositive", "goldAbsent", "tp", "fp", "fpOnPresent", "fpOnAbsent",
    "fpElementsOnAbsent", "fn", "tn", "failedOnAbsent", "unresolved", "insufficient"), unverifiedWholeRecordsDropped:
  nullable(countInt), sitePresence: SITE_SCHEMA, unweighted: objectSchema({ ...METRICS, ...INTERVALS }), weighted:
  nullable(objectSchema({ scheme: nonEmptyString, deff: nullable(positiveNumber), nEff: nullable(nonNegativeNumber),
    ...METRICS, ...INTERVALS }, { f1Interval: validateBenchInterval })) }, { independentGroupSupport: objectSchema(
  countFields("predictions", "positives")), armMissionSha256: nonEmptyString, calls: unknownOr(countInt),
  diagnostics: objectSchema({}, { broad: objectSchema({ ...countFields("tp", "fp", "fn"), ...METRICS }),
    conditionalRetainedRecall: nullable(unitInterval) }), costBasisItems: countInt, apiEquivalentTotal:
  unknownOr(nonNegativeNumber), tokens: unknownOr(objectSchema({ ...countFields("input", "output", "reasoning",
    "total"), cached: unknownOr(countInt) })) });
const METRICS_SCHEMA = objectSchema<T.BenchMetricsImportFile>({ schemaId: schemaId(T.METRICS_IMPORT_SCHEMA_ID),
  campaignId: nonEmptyString, partition: enumValue(R.PARTITION_KINDS), primaryEstimator: enumValue(R.ESTIMATOR_KINDS),
  fieldShapeVerified: literalValue(true as const, "BAD_SHAPE", booleanValue), ...strFields("goldenSha256",
    "goldenMissionSha256", "candidateMissionSha256"), ...countFields("goldenIds", "annotatorCount"), fields:
  arrayOf(nonEmptyString), krippendorffAlphaByField: stringMapOf(nullable(finiteNumber)), records: arrayOf(REC_SCHEMA)
}, { goldenLabel: nonEmptyString, costBasisLabel: enumValue(R.COST_BASIS_KINDS), currency: CURRENCY,
  missingDigestRuns: arrayOf(nonEmptyString), annotatorRunStats: stringMapOf(objectSchema(countFields("answered",
    "failed", "missing"))), supportFloors: objectSchema({ ...countFields("recallMinPositives",
    "precisionMinPredictions"), failureCeiling: unitInterval }) });
const META_OBJ = objectSchema<T.DossierMetaFile>({ schemaId: schemaId(T.DOSSIER_META_SCHEMA_ID), ref: dossierRef,
  language: enumValue(T.DOSSIER_LANGUAGES), ...strFields("title", "subject"), ownerRequestQuote: strLen(8), stakes:
  strLen(20), stakesLevel: enumValue(T.STAKES_LEVELS), provenance: objectSchema(strFields("source", "readAt")),
  reviewStatus: objectSchema({ complete: booleanValue, summaryProse: digitFree }), origins: objectSchema({
    ...strFields("defaultRepo", "defaultRevision") }, { sourcePaths: stringMapOf((v, p) => (Object.hasOwn(
    assertPlainObject(v, p), "uri") ? objectSchema<T.SourceOrigin>({ uri: nonEmptyString })
    : objectSchema<T.SourceOrigin>(strFields("repo", "revision", "path")))(v, p)) }) }, {
  cursor: nonEmptyString, readingBudgetMinutes: inRange(1, 30), fieldLabels: stringMapOf(objectSchema(strFields("en",
    "fr"))), amendmentTrace: arrayOf(objectSchema<T.AmendmentStep>(strFields("at", "author", "summary"))),
  glossaryExtra: arrayOf(objectSchema(strFields("term", "definition"))) });
const META_SCHEMA: Validator<T.DossierMetaFile> = (v, p) => { META_OBJ(v, p); const m = v as T.DossierMetaFile;
  if (m.readingBudgetMinutes !== undefined && m.readingBudgetMinutes > ({ low: 2, medium: 8, high: 30 })[m.stakesLevel])
    fail("BAD_SHAPE", `${p}.readingBudgetMinutes`); };
const QUESTION_OBJ = objectSchema<T.BenchDecisionQuestion>({ ...strFields("id", "title", "question", "context",
  "recommendedOptionId", "recommendedAnswer", "strongestObjectionProse", "overturnConditionProse",
  "failureScenarioProse", "presenterConvenienceProse"), options: arrayOf(objectSchema<T.BenchDecisionOption>({
  ...strFields("id", "label", "body"), consequence: strLen(1, 160) })) }, { completionCriterion: nonEmptyString,
  readingTimeMinutes: inRange(0, 2) });
const uniq = (xs: readonly { id: string }[], at: (i: number) => string): Set<string> => { const s = new Set<string>();
  xs.forEach((x, i) => { if (s.has(x.id)) fail("BAD_SHAPE", at(i)); s.add(x.id); }); return s; };
const validateQuestion: Validator<T.BenchDecisionQuestion> = (v, p) => { QUESTION_OBJ(v, p);
  const q = v as T.BenchDecisionQuestion; if (q.options.length < 2 || q.options.length > 4) fail("BAD_SHAPE",
  `${p}.options`); if (!uniq(q.options, (i) => `${p}.options[${i}].id`).has(q.recommendedOptionId))
  fail("BAD_SHAPE", `${p}.recommendedOptionId`); const words = [q.title, q.question, q.context, q.recommendedAnswer,
  q.completionCriterion ?? "", ...q.options.flatMap((o) => [o.label, o.consequence, o.body])].join(" ")
  .match(/\S+/gu)?.length ?? 0; if (words > (q.readingTimeMinutes ?? 2) * 180) fail("BAD_SHAPE", p); };
const DECISIONS_SCHEMA = objectSchema<T.BenchDecisionsFile>({ schemaId: schemaId(T.DECISIONS_SCHEMA_ID),
  questions: (v, p) => { arrayOf(validateQuestion)(v, p); const qs = v as readonly T.BenchDecisionQuestion[];
    if (qs.length < 1) fail("BAD_SHAPE", p); uniq(qs, (i) => `${p}[${i}].id`); },
  ownerCriteria: arrayOf(objectSchema<T.OwnerCriterionRow>({ ...strFields("criterion", "requestSource", "addressedBy"),
    gapOrDeparture: requireString })) });
const reader = <T>(schema: Validator<T>): readonly [(v: unknown) => T, (p: string) => T] => {
  const parse = (v: unknown): T => { schema(v, "$"); return v as T; };
  return [parse, (p: string): T => { let raw: string, val: unknown;
    try { raw = readFileSync(p, "utf8"); } catch (c) { const code = (c as NodeJS.ErrnoException | undefined)?.code;
      throw new BenchResultsValidationError("IO_ERROR", p,
        { errno: typeof code === "string" ? code : undefined, cause: c }); }
    try { val = JSON.parse(raw); } catch (c) { throw new BenchResultsValidationError("BAD_JSON", "$", { cause: c }); }
    return parse(val); }]; };
export const [parseArmManifest, readArmManifest] = reader(ARM_SCHEMA);
export const [parseSeatObservationInput, readSeatObservationInput] = reader(validateSeat);
export const [parseSeatObservationsFile, readSeatObservationsFile] = reader(SEAT_FILE);
export const [parseMetricsImportFile, readMetricsImportFile] = reader(METRICS_SCHEMA);
export const [parseDossierMetaFile, readDossierMetaFile] = reader(META_SCHEMA);
export const [parseDecisionsFile, readDecisionsFile] = reader(DECISIONS_SCHEMA);
