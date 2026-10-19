/**
 * Quantile primitives `nearest-rank/1` and `weighted-ecdf/1` (spec section 5).
 *
 * Pure functions over supplied values/weights. No clock reads, no I/O.
 * Weights and `p` are parsed as exact decimal rationals and compared by
 * integer cross-products — never binary floating-point threshold rounding.
 */

export const QUANTILE_NEAREST_RANK = "nearest-rank/1" as const;
export const QUANTILE_WEIGHTED_ECDF = "weighted-ecdf/1" as const;

export interface QuantileError extends Error {
  code: string;
}

function fail(code: string, message: string): never {
  const e = new Error(message) as QuantileError;
  e.code = code;
  throw e;
}

/** Parse `p` from its decimal rendering into an exact rational. */
interface Rational {
  num: bigint;
  den: bigint;
}

const DECIMAL_RE = /^(\d{1,15})(?:\.(\d{1,12}))?$/;

/** Weights are decimal strings only (spec section 5.2): numbers are never coerced. */
export function parseDecimalWeight(text: string): Rational {
  if (typeof text !== "string") fail("invalid-weight", `weight must be a decimal string, got ${typeof text}`);
  const m = DECIMAL_RE.exec(text);
  if (!m) fail("invalid-weight", `malformed weight: ${JSON.stringify(text)}`);
  const frac = m[2] ?? "";
  const num = BigInt(`${m[1]}${frac}`);
  const den = 10n ** BigInt(frac.length);
  if (num <= 0n) fail("invalid-weight", `weight must be positive: ${JSON.stringify(text)}`);
  return { num, den };
}

const PLAIN_DECIMAL_RE = /^(\d+)(?:\.(\d+))?$/;

/** Expand one exponent-form decimal (`1e-7`) into its exact plain form (`0.0000001`). */
function expandExponent(text: string): string {
  const m = /^(\d)(?:\.(\d+))?[eE]([+-]?\d+)$/.exec(text);
  if (!m) return text;
  const digits = `${m[1]}${m[2] ?? ""}`;
  const pointPos = 1 + Number.parseInt(m[3] as string, 10);
  if (pointPos >= digits.length) return `${digits}${"0".repeat(pointPos - digits.length)}`;
  if (pointPos <= 0) return `0.${"0".repeat(-pointPos)}${digits}`;
  return `${digits.slice(0, pointPos)}.${digits.slice(pointPos)}`;
}

/** Parse `p` (given as a number) exactly via its decimal rendering (spec section 5.1). */
export function parseP(p: number): Rational {
  if (typeof p !== "number" || !Number.isFinite(p) || p <= 0 || p > 1) {
    fail("invalid-p", `p must satisfy 0 < p <= 1, got ${String(p)}`);
  }
  const m = PLAIN_DECIMAL_RE.exec(expandExponent(String(p)));
  if (!m) fail("invalid-p", `p must be a decimal number, got ${String(p)}`);
  const frac = (m as RegExpExecArray)[2] ?? "";
  const num = BigInt(`${(m as RegExpExecArray)[1]}${frac}`);
  const den = 10n ** BigInt(frac.length);
  if (num <= 0n || num > den) fail("invalid-p", `p must satisfy 0 < p <= 1, got ${String(p)}`);
  return { num, den };
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

export interface EffectiveSizeRatio {
  numerator: string;
  denominator: string;
}

/**
 * Exact effective size `nEff = (sum w)^2 / sum(w^2)` as a reduced integer
 * ratio (spec sections 4.3, 6.5). Weights `[1, 1, 98]` give `5000/4803`.
 */
export function effectiveSizeRatio(weights: string[]): EffectiveSizeRatio {
  if (weights.length === 0) fail("empty-series", "nEff of an empty weight set is undefined");
  const parsed = weights.map((w) => parseDecimalWeight(w));
  let sumNum = 0n;
  let sumDen = 1n;
  let sqNum = 0n;
  let sqDen = 1n;
  for (const { num, den } of parsed) {
    // sum += num/den
    sumNum = sumNum * den + num * sumDen;
    sumDen = sumDen * den;
    // sumSq += num^2/den^2
    const w2n = num * num;
    const w2d = den * den;
    sqNum = sqNum * w2d + w2n * sqDen;
    sqDen = sqDen * w2d;
  }
  // nEff = (sumNum/sumDen)^2 / (sqNum/sqDen)
  let n = sumNum * sumNum * sqDen;
  let d = sumDen * sumDen * sqNum;
  const g = gcd(n, d);
  n /= g;
  d /= g;
  return { numerator: n.toString(10), denominator: d.toString(10) };
}

/** Parse and validate an `nEff` ratio object; rejects decimal/float/bare forms. */
export function parseEffectiveSizeRatio(value: unknown): EffectiveSizeRatio {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail("invalid-neff", "nEff must be a {numerator, denominator} object of decimal integer strings");
  }
  for (const k of Object.keys(value)) {
    if (k !== "numerator" && k !== "denominator") {
      fail("invalid-neff", `undeclared field ${JSON.stringify(k)} on the closed nEff ratio object`);
    }
  }
  const { numerator, denominator } = value as Record<string, unknown>;
  if (typeof numerator !== "string" || !/^[0-9]+$/.test(numerator)) {
    fail("invalid-neff", "nEff.numerator must be a decimal integer string");
  }
  if (typeof denominator !== "string" || !/^[0-9]+$/.test(denominator) || BigInt(denominator) <= 0n) {
    fail("invalid-neff", "nEff.denominator must be a decimal integer string > 0");
  }
  const n = BigInt(numerator);
  const d = BigInt(denominator);
  if (gcd(n, d) !== 1n) fail("invalid-neff", `nEff ratio ${numerator}/${denominator} is not reduced`);
  return { numerator, denominator };
}

/**
 * Tail readability (section 4.3): a calibrated quantile is displayed only
 * with at least 5 effective observations beyond it, i.e. nEff*(1-p) >= 5.
 * Integer cross-product comparison; rounding is display-only in consumers.
 */
export function meetsTailSupport(nEff: EffectiveSizeRatio, p: number): boolean {
  const r = parseP(p);
  // nEff*(1-p) >= 5  <=>  n*(d_r - n_r)*d... expand exactly:
  // nEff = N/D, (1-p) = (rd-rn)/rd  =>  N*(rd-rn) >= 5*D*rd
  const N = BigInt(nEff.numerator);
  const D = BigInt(nEff.denominator);
  return N * (r.den - r.num) >= 5n * D * r.den;
}

/**
 * `nearest-rank/1`: sort ascending, 1-indexed `Q(p) = x[ceil(n × p)]`
 * for `0 < p <= 1`, no interpolation. Returns the source value.
 */
export function nearestRank(values: number[], p: number): number {
  if (values.length === 0) fail("empty-series", "nearest-rank/1 of an empty series is undefined (abstain)");
  const r = parseP(p);
  for (const v of values) {
    if (typeof v !== "number" || !Number.isFinite(v)) fail("invalid-value", "samples must be finite numbers");
  }
  const sorted = [...values].sort((a, b) => a - b);
  const n = BigInt(sorted.length);
  // k = ceil(n*p) = ceil(n*rn/rd) = (n*rn + rd - 1) // rd ; 1-based
  const k = Number((n * r.num + r.den - 1n) / r.den);
  const v = sorted[k - 1];
  if (v === undefined) fail("invalid-p", "quantile index out of range");
  return v;
}

export interface WeightedEntry {
  id: string;
  value: number;
  /** Omitted weight means `"1"`. */
  weight?: string;
}

/**
 * `weighted-ecdf/1`: after sorting by value then stable observation id,
 * return the first value whose cumulative weight is at least `p × sum(w)`.
 * Exact cumulative-boundary equality returns the boundary value. Equal
 * weights reduce to `nearest-rank/1`; common rescaling preserves the result.
 */
export function weightedEcdf(entries: WeightedEntry[], p: number): number {
  if (entries.length === 0) fail("empty-series", "weighted-ecdf/1 of an empty series is undefined (abstain)");
  const r = parseP(p);
  const seen = new Set<string>();
  const parsed = entries.map((e) => {
    if (typeof e.id !== "string" || e.id.length === 0) fail("invalid-id", "observation identifiers must be non-empty strings");
    if (seen.has(e.id)) fail("duplicate-id", `duplicate observation identifier: ${JSON.stringify(e.id)}`);
    seen.add(e.id);
    if (typeof e.value !== "number" || !Number.isFinite(e.value)) {
      fail("invalid-value", "samples must be finite numbers");
    }
    const w = parseDecimalWeight(e.weight ?? "1");
    return { id: e.id, value: e.value, num: w.num, den: w.den };
  });
  const sorted = [...parsed].sort((a, b) => (a.value === b.value ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.value - b.value));
  // total = T_num/T_den
  let tNum = 0n;
  let tDen = 1n;
  for (const e of sorted) {
    tNum = tNum * e.den + e.num * tDen;
    tDen = tDen * e.den;
  }
  // threshold: p * total = (rn*T_num)/(rd*T_den)
  // cum >= threshold  <=>  cumNum*(rd*T_den) >= rn*T_num*cumDen
  let cNum = 0n;
  let cDen = 1n;
  for (const e of sorted) {
    cNum = cNum * e.den + e.num * cDen;
    cDen = cDen * e.den;
    if (cNum * r.den * tDen >= r.num * tNum * cDen) return e.value;
  }
  fail("internal", "weighted-ecdf/1 reached the end without meeting the threshold");
}
