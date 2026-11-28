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
const reqStr = (val: unknown, key: string) =>
  typeof val === "string" && val.trim() ? val : failUsage(`${key} non-empty`);
const optStr = (val: unknown, key: string) => (val === undefined ? undefined : reqStr(val, key));
const strArr = (val: unknown, key: string) =>
  Array.isArray(val) && val.length > 0
    ? val.map((item, idx) => reqStr(item, `${key}[${idx}]`))
    : failUsage(`${key} non-empty array`);
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
  val === undefined ? undefined : typeof val === "boolean" ? val : failUsage(`${key} must be boolean`);
function optLabels(val: unknown) {
  if (val === undefined) return undefined;
  try {
    LABELS(val, "$.fieldLabels");
    return val as R.BenchResultsFile["corpus"]["fieldLabels"];
  } catch (err) {
    return failUsage("invalid fieldLabels", err);
  }
}
const SHARED_KEYS = [
  "arms", "captureDir", "currency", "costBasis", "seatObservations",
  "recallFloor", "precisionFloor", "failureCeiling", "generatedAt", "fieldLabels",
];
const SCORE_KEYS = [
  ...SHARED_KEYS, "golden", "goldenMission", "candidateMission",
  "out", "campaignId", "partition", "goldenLabel", "fields",
];
const IMPORT_KEYS = [...SHARED_KEYS, "metrics", "out", "golden", "goldenMission", "candidateMission",
  "maxValuesChanged"];
const SCORE_REQ = new Set(["golden", "goldenMission", "candidateMission", "out", "campaignId"]);
const PARSERS: Record<string, (val: unknown, key: string) => unknown> = {
  arms: strArr,
  currency: optEnum(R.CURRENCY_CODES),
  costBasis: optEnum(R.COST_BASIS_KINDS),
  recallFloor: optNum(false),
  precisionFloor: optNum(false),
  failureCeiling: optNum(true),
  fieldLabels: optLabels,
  partition: optEnum(R.PARTITION_KINDS),
  fields: (val, key) => (val === undefined ? undefined : strArr(val, key)),
  maxValuesChanged: optBool,
};
function parseOptions<T>(raw: unknown, allowed: readonly string[], reqKeys: ReadonlySet<string>): T {
  const proto = raw && typeof raw === "object" ? Object.getPrototypeOf(raw) : 0;
  if (proto !== Object.prototype && proto !== null) failUsage("options must be plain object");
  const obj = raw as Record<string, unknown>;
  for (const key of Object.keys(obj)) if (!allowed.includes(key)) failUsage(`unknown option: ${key}`);
  const entries = allowed.map((key) => [key, (PARSERS[key] ?? (reqKeys.has(key) ? reqStr : optStr))(obj[key], key)]);
  return Object.fromEntries(entries) as T;
}

/** Validate programmatic options for `runScrapScore`. */
export const parseScrapScoreOptions = (raw: unknown) => parseOptions<ScrapScoreOptions>(raw, SCORE_KEYS, SCORE_REQ);

/** Validate programmatic options for `importCampaignMetrics`. */
export const parseImportMetricsOptions = (raw: unknown) =>
  parseOptions<ImportCampaignMetricsOptions>(raw, IMPORT_KEYS, new Set(["metrics"]));
