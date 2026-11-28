import * as R from "./results-contract.js";
import { nonEmptyString, objectSchema, stringMapOf } from "./results-guards.js";
import { BenchIngestError } from "./ingest-golden.js";

export interface SharedIngestOptions {
  readonly arms: readonly string[];
  readonly captureDir?: string;
  readonly currency?: R.CurrencyCode;
  readonly costBasis?: R.CostBasisKind;
  readonly seatObservations?: string;
  readonly recallFloor?: number;
  readonly precisionFloor?: number;
  readonly failureCeiling?: number;
  readonly generatedAt?: string;
  readonly fieldLabels?: R.BenchResultsFile["corpus"]["fieldLabels"];
}

export interface ScrapScoreOptions extends SharedIngestOptions {
  readonly golden: string;
  readonly goldenMission: string;
  readonly candidateMission: string;
  readonly out: string;
  readonly campaignId: string;
  readonly partition?: R.PartitionKind;
  readonly goldenLabel?: string;
  readonly fields?: readonly string[];
}

export interface ImportCampaignMetricsOptions extends SharedIngestOptions {
  readonly metrics: string;
  readonly out?: string;
  readonly golden?: string;
  readonly goldenMission?: string;
  readonly candidateMission?: string;
  readonly maxValuesChanged?: boolean;
}

const LABELS = stringMapOf(objectSchema({ en: nonEmptyString, fr: nonEmptyString }));
const INT_RE = /^(?:0|[1-9]\d*)$/;
const UNIT_RE = /^(?:\d+(?:\.\d+)?|\.\d+)$/;
const failUsage = (msg: string, cause?: unknown): never => { throw new BenchIngestError("BAD_USAGE", msg, cause); };
const reqStr = (val: unknown, key: string) => (typeof val === "string" && val.trim() ? val : failUsage(`${key} str`));
const optStr = (val: unknown, key: string) => (val === undefined ? undefined : reqStr(val, key));
const strArr = (val: unknown, key: string) => Array.isArray(val) && val.length > 0
  ? val.map((item, idx) => reqStr(item, `${key}[${idx}]`)) : failUsage(`${key} non-empty array`);
const optEnum = <T extends string>(vals: readonly T[]) => (val: unknown, key: string) =>
  val === undefined ? undefined : (vals as readonly unknown[]).includes(val) ? (val as T) : failUsage(`${key} enum`);
const optNum = (unit: boolean) => (val: unknown, key: string) => {
  if (val === undefined) return undefined;
  const num = typeof val === "number" ? val
    : typeof val === "string" && (unit ? UNIT_RE : INT_RE).test(val) ? Number(val) : NaN;
  const valid = unit ? Number.isFinite(num) && num >= 0 && num <= 1 : Number.isSafeInteger(num) && num >= 0;
  return valid ? num : failUsage(`${key} invalid number`);
};
const optBool = (val: unknown, key: string) =>
  val === undefined ? undefined : typeof val === "boolean" ? val : failUsage(`${key} bool`);
function optLabels(val: unknown) {
  if (val === undefined) return undefined;
  try {
    LABELS(val, "$.fieldLabels");
    return val as R.BenchResultsFile["corpus"]["fieldLabels"];
  } catch (err) {
    return failUsage("invalid fieldLabels", err);
  }
}
type FieldParser = (val: unknown, key: string) => unknown;
const fieldsMap = (keys: readonly string[], fn: FieldParser) => Object.fromEntries(keys.map((key) => [key, fn]));
const SHARED_SPEC: Record<string, FieldParser> = {
  arms: strArr,
  ...fieldsMap(["captureDir", "seatObservations", "generatedAt"], optStr),
  currency: optEnum(R.CURRENCY_CODES),
  costBasis: optEnum(R.COST_BASIS_KINDS),
  ...fieldsMap(["recallFloor", "precisionFloor"], optNum(false)),
  failureCeiling: optNum(true),
  fieldLabels: optLabels,
};
const SCORE_SPEC: Record<string, FieldParser> = {
  ...SHARED_SPEC,
  ...fieldsMap(["golden", "goldenMission", "candidateMission", "out", "campaignId"], reqStr),
  partition: optEnum(R.PARTITION_KINDS),
  goldenLabel: optStr,
  fields: (val, key) => (val === undefined ? undefined : strArr(val, key)),
};
const IMPORT_SPEC: Record<string, FieldParser> = {
  ...SHARED_SPEC,
  metrics: reqStr,
  ...fieldsMap(["out", "golden", "goldenMission", "candidateMission"], optStr),
  maxValuesChanged: optBool,
};
function parseOptions<T>(raw: unknown, spec: Record<string, FieldParser>): T {
  const proto = raw && typeof raw === "object" ? Object.getPrototypeOf(raw) : 0;
  if (proto !== Object.prototype && proto !== null) failUsage("options must be plain object");
  const obj = raw as Record<string, unknown>;
  for (const key of Object.keys(obj)) if (!Object.hasOwn(spec, key)) failUsage(`unknown option: ${key}`);
  return Object.fromEntries(Object.keys(spec).map((key) => [key, spec[key]!(obj[key], key)])) as T;
}

/** Validate programmatic options for `runScrapScore`. */
export const parseScrapScoreOptions = (raw: unknown) => parseOptions<ScrapScoreOptions>(raw, SCORE_SPEC);

/** Validate programmatic options for `importCampaignMetrics`. */
export const parseImportMetricsOptions = (raw: unknown) => parseOptions<ImportCampaignMetricsOptions>(raw, IMPORT_SPEC);
