// RFC 8785 canonical JSON + SHA-256 (§7 canonical discipline).
// Preimages below hold only strings, integers, booleans, null, arrays and
// objects, so sorted-key serialization with JSON string/number forms applies.
import { createHash } from "node:crypto";

/**
 * RFC 8785 strings are valid Unicode. A lone surrogate (lead without its
 * trail, trail without its lead) is not a character and refuses here —
 * in values and in property names alike — instead of serializing.
 */
function assertWellFormedUnicode(s: string): void {
  for (let i = 0; i < s.length; i++) {
    const unit = s.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = i + 1 < s.length ? s.charCodeAt(i + 1) : -1;
      if (next < 0xdc00 || next > 0xdfff) throw new Error("invalid-unicode:lone-surrogate");
      i++;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new Error("invalid-unicode:lone-surrogate");
    }
  }
}

function canonicalStringify(value: unknown, active = new Set<object>()): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non-finite-number");
    if (Number.isInteger(value)) return String(value);
    return JSON.stringify(value) as string;
  }
  if (typeof value === "string") {
    assertWellFormedUnicode(value);
    return JSON.stringify(value) as string;
  }
  if (typeof value === "object") {
    if (active.has(value)) throw new Error("invalid-json:cycle");
    const array = Array.isArray(value);
    if (!array && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error("invalid-json:prototype");
    if (Reflect.ownKeys(value).some((key) => typeof key !== "string")) throw new Error("invalid-json:key");
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Object.keys(descriptors).filter((key) => !(array && key === "length"));
    for (const key of keys) {
      assertWellFormedUnicode(key);
      const descriptor = descriptors[key]!;
      if (!descriptor.enumerable || !("value" in descriptor)) throw new Error("invalid-json:property");
    }
    if (array && (keys.length !== value.length || keys.some((key, i) => key !== String(i)))) throw new Error("invalid-json:array");
    active.add(value);
    const bytes = array
      ? `[${keys.map((key) => canonicalStringify(descriptors[key]!.value, active)).join(",")}]`
      : `{${keys.sort().map((key) => `${JSON.stringify(key)}:${canonicalStringify(descriptors[key]!.value, active)}`).join(",")}}`;
    active.delete(value);
    return bytes;
  }
  throw new Error(`unserializable:${typeof value}`);
}

/** RFC 8785 canonical bytes of a JSON value (UTF-8 string). */
export function canonicalBytes(value: unknown): string {
  return canonicalStringify(value);
}

/** SHA-256 over exact UTF-8 bytes, rendered as 64 lowercase hex digits. */
export function sha256Hex(bytes: string): string {
  return createHash("sha256").update(bytes, "utf8").digest("hex");
}

/** Digest of a preimage value: SHA-256 over its RFC 8785 canonical bytes. */
export function digestOfPreimage(preimage: unknown): string {
  return sha256Hex(canonicalBytes(preimage));
}
