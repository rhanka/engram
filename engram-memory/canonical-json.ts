export class CanonicalJsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanonicalJsonError";
  }
}

export type CanonicalJsonValue =
  | null
  | boolean
  | number
  | string
  | CanonicalJsonValue[]
  | { [key: string]: CanonicalJsonValue };

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return true;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Produces the value that can be represented by the record contract's canonical
 * JSON. It normalizes every string to NFC before shape validation and rejects
 * values that cannot have one unambiguous JSON representation.
 */
export function normalizeCanonicalJson(value: unknown, seen = new WeakSet<object>()): CanonicalJsonValue {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (hasUnpairedSurrogate(value)) throw new CanonicalJsonError("string contains an unpaired surrogate");
    return value.normalize("NFC");
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new CanonicalJsonError("number is not canonical JSON");
    }
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
      throw new CanonicalJsonError("integer is outside the safe range");
    }
    return value;
  }
  if (typeof value !== "object" || typeof value === "bigint" || typeof value === "symbol" || typeof value === "function") {
    throw new CanonicalJsonError("value is not JSON");
  }
  if (seen.has(value)) throw new CanonicalJsonError("cyclic value is not JSON");
  seen.add(value);

  if (Array.isArray(value)) {
    const extraKeys = Object.keys(value).filter((key) => !/^(0|[1-9][0-9]*)$/.test(key));
    if (extraKeys.length > 0) throw new CanonicalJsonError("array has non-index properties");
    const normalized = value.map((item) => normalizeCanonicalJson(item, seen));
    seen.delete(value);
    return normalized;
  }

  if (!isPlainObject(value) || Object.getOwnPropertySymbols(value).length > 0) {
    throw new CanonicalJsonError("value is not a plain JSON object");
  }
  const normalized: Record<string, CanonicalJsonValue> = {};
  for (const rawKey of Object.keys(value)) {
    if (hasUnpairedSurrogate(rawKey)) throw new CanonicalJsonError("object key contains an unpaired surrogate");
    const key = rawKey.normalize("NFC");
    if (Object.hasOwn(normalized, key)) throw new CanonicalJsonError("duplicate key after NFC normalization");
    normalized[key] = normalizeCanonicalJson(value[rawKey], seen);
  }
  seen.delete(value);
  return normalized;
}

function stringifyCanonicalJson(value: CanonicalJsonValue): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stringifyCanonicalJson).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stringifyCanonicalJson(value[key]!)}`).join(",")}}`;
}

/** RFC 8785 JSON Canonicalization Scheme bytes represented as a UTF-16 string. */
export function canonicalizeJcs(value: unknown): string {
  return stringifyCanonicalJson(normalizeCanonicalJson(value));
}
