import { ESTIMATOR_KINDS, INTERVAL_CLUSTERINGS, INTERVAL_METHODS, type BenchInterval } from "./results-types.js";

export type BenchResultsErrorCode =
  | "IO_ERROR" | "BAD_JSON" | "NOT_OBJECT" | "NOT_ARRAY" | "BAD_SCHEMA" | "BAD_VERSION"
  | "UNKNOWN_KEY" | "BAD_MAP_KEY" | "MISSING_KEY" | "WRONG_TYPE" | "EMPTY_STRING"
  | "BAD_ENUM" | "NON_FINITE" | "BAD_COUNT" | "NEGATIVE" | "NON_POSITIVE"
  | "UNIT_RANGE" | "INTERVAL_RANGE" | "INTERVAL_ORDER" | "BAD_INTERVAL" | "BAD_SHAPE";

export type Validator<T> = ((value: unknown, path: string) => void) & { readonly __accepts?: (v: T) => T };
type RequiredKeys<T> = { [K in keyof T]-?: undefined extends T[K] ? never : K }[keyof T];
type OptionalKeys<T> = { [K in keyof T]-?: undefined extends T[K] ? K : never }[keyof T];
type RequiredSchema<T> = { [K in RequiredKeys<T>]: Validator<T[K]> };
type OptionalSchema<T> = { [K in OptionalKeys<T>]: Validator<Exclude<T[K], undefined>> };
type PlainRecord = Record<string, unknown>;

/** Typed schema/file validation refusal carrying stable code, path, and optional errno. */
export class BenchResultsValidationError extends Error {
  readonly errno?: string;
  constructor(
    readonly code: BenchResultsErrorCode, readonly path: string,
    detail?: { readonly errno?: string; readonly cause?: unknown },
  ) {
    super(
      `${code} at ${path}${detail?.errno ? ` (${detail.errno})` : ""}`,
      detail?.cause !== undefined ? { cause: detail.cause } : undefined,
    );
    this.name = "BenchResultsValidationError";
    if (detail?.errno !== undefined) this.errno = detail.errno;
  }
}

const hasOwn = Object.hasOwn;
export function fail(code: BenchResultsErrorCode, path: string): never {
  throw new BenchResultsValidationError(code, path);
}

export function assertPlainObject(value: unknown, path: string): PlainRecord {
  const proto = value && typeof value === "object" && !Array.isArray(value) ? Object.getPrototypeOf(value) : 0;
  if (proto !== Object.prototype && proto !== null) fail("NOT_OBJECT", path);
  return value as PlainRecord;
}

export function validateClosedObject(
  value: unknown, path: string, required: Record<string, Validator<unknown>>,
  optional: Record<string, Validator<unknown>> = {},
): PlainRecord {
  const obj = assertPlainObject(value, path);
  for (const key of Object.keys(obj)) {
    if (!hasOwn(required, key) && !hasOwn(optional, key)) fail("UNKNOWN_KEY", `${path}.${key}`);
  }
  for (const key of Object.keys(required)) {
    if (!hasOwn(obj, key)) fail("MISSING_KEY", `${path}.${key}`);
    required[key]!(obj[key], `${path}.${key}`);
  }
  for (const key of Object.keys(optional)) if (hasOwn(obj, key)) optional[key]!(obj[key], `${path}.${key}`);
  return obj;
}

export function objectSchema<T extends object>(
  required: NoInfer<RequiredSchema<T>>,
  ...rest: [OptionalKeys<T>] extends [never] ? [] : [optional: NoInfer<OptionalSchema<T>>]
): Validator<T> {
  const optional = (rest[0] ?? {}) as Record<string, Validator<unknown>>;
  return (v, p) => { validateClosedObject(v, p, required as Record<string, Validator<unknown>>, optional); };
}

export function fieldsOf<const K extends string, V>(keys: readonly K[], v: Validator<V>): Record<K, Validator<V>> {
  return Object.fromEntries(keys.map((key) => [key, v])) as Record<K, Validator<V>>;
}

export const requireString = (v: unknown, p: string): string =>
  typeof v === "string" ? v : fail("WRONG_TYPE", p);
export const requireNumber = (v: unknown, p: string): number =>
  typeof v !== "number" ? fail("WRONG_TYPE", p) : Number.isFinite(v) ? v : fail("NON_FINITE", p);
export const nonEmptyString: Validator<string> = (v, p) => {
  if (!requireString(v, p).trim()) fail("EMPTY_STRING", p);
};
export const booleanValue: Validator<boolean> = (v, p) => { if (typeof v !== "boolean") fail("WRONG_TYPE", p); };
export const finiteNumber: Validator<number> = (v, p) => { requireNumber(v, p); };
const checkNumber = (ok: (n: number) => boolean, code: BenchResultsErrorCode): Validator<number> =>
  (v, p) => { if (!ok(requireNumber(v, p))) fail(code, p); };
export const countInt = checkNumber((n) => Number.isSafeInteger(n) && n >= 0, "BAD_COUNT");
export const nonNegativeNumber = checkNumber((n) => n >= 0, "NEGATIVE");
export const positiveNumber = checkNumber((n) => n > 0, "NON_POSITIVE");
export const unitInterval = checkNumber((n) => n >= 0 && n <= 1, "UNIT_RANGE");

export const literalValue = <T>(expected: T, code: BenchResultsErrorCode, pre: Validator<unknown>): Validator<T> =>
  (v, p) => { pre(v, p); if (v !== expected) fail(code, p); };
export const enumValue = <const T extends string>(values: readonly T[]): Validator<T> => {
  const set = new Set<string>(values);
  return (v, p) => { if (!set.has(requireString(v, p))) fail("BAD_ENUM", p); };
};
export const nullable = <T>(inner: Validator<T>): Validator<T | null> => (v, p) => { if (v !== null) inner(v, p); };
export const unknownOr = <T>(inner: Validator<T>): Validator<T | "unknown"> =>
  (v, p) => { if (v !== "unknown") inner(v, p); };
export const arrayOf = <T>(item: Validator<T>): Validator<readonly T[]> => (v, p) => {
  if (!Array.isArray(v)) fail("NOT_ARRAY", p);
  for (let idx = 0; idx < v.length; idx++) item(v[idx], `${p}[${idx}]`);
};
export const stringMapOf = <T>(entry: Validator<T>): Validator<Readonly<Record<string, T>>> => (v, p) => {
  for (const [key, val] of Object.entries(assertPlainObject(v, p))) {
    if (!key.trim() || /^(__proto__|constructor|prototype)$/.test(key)) fail("BAD_MAP_KEY", `${p}.${key}`);
    entry(val, `${p}.${key}`);
  }
};

const INTERVAL_SCHEMA: Record<keyof BenchInterval, Validator<unknown>> = {
  estimator: enumValue(ESTIMATOR_KINDS),
  method: enumValue(INTERVAL_METHODS),
  clustering: enumValue(INTERVAL_CLUSTERINGS),
  valid: booleanValue, low: nullable(finiteNumber), high: nullable(finiteNumber),
};
export const validateBenchInterval: Validator<BenchInterval> = (v, p) => {
  const o = validateClosedObject(v, p, INTERVAL_SCHEMA);
  const low = o.low as number | null, high = o.high as number | null;
  if (low !== null && (low < 0 || low > 1)) fail("INTERVAL_RANGE", `${p}.low`);
  if (high !== null && (high < 0 || high > 1)) fail("INTERVAL_RANGE", `${p}.high`);
  if (low !== null && high !== null && low > high) fail("INTERVAL_ORDER", p);
  const badValid = o.method === "none" || o.clustering === "clustered_record_invalid" || low === null
    || (o.method !== "clopper_pearson_95_one_sided" && high === null);
  if (o.valid ? badValid : low !== null || high !== null) fail("BAD_INTERVAL", p);
};
