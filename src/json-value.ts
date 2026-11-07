export const JSON_PROJECTION_VERSION = "engram.json-projection/v1" as const;

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type ToJsonValueResult =
  | { readonly ok: true; readonly value: JsonValue }
  | {
      readonly ok: false;
      readonly path: string;
      readonly reason:
        | "non_finite_number"
        | "invalid_unicode"
        | "non_plain_object"
        | "accessor_property"
        | "symbol_key"
        | "cycle"
        | "unsupported_type";
    };

function isWellFormedUnicode(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const unit = s.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = i + 1 < s.length ? s.charCodeAt(i + 1) : -1;
      if (next < 0xdc00 || next > 0xdfff) return false;
      i++;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function project(value: unknown, path: string, active: Set<object>): ToJsonValueResult {
  if (value === null || typeof value === "boolean") {
    return Object.freeze({ ok: true, value });
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return Object.freeze({ ok: false, path, reason: "non_finite_number" });
    }
    return Object.freeze({ ok: true, value: Object.is(value, -0) ? 0 : value });
  }
  if (typeof value === "string") {
    if (!isWellFormedUnicode(value)) {
      return Object.freeze({ ok: false, path, reason: "invalid_unicode" });
    }
    return Object.freeze({ ok: true, value });
  }
  if (typeof value === "object") {
    if (active.has(value)) {
      return Object.freeze({ ok: false, path, reason: "cycle" });
    }
    if (Array.isArray(value)) {
      active.add(value);
      const out: JsonValue[] = [];
      for (let i = 0; i < value.length; i++) {
        const elemPath = `${path}[${i}]`;
        const desc = Object.getOwnPropertyDescriptor(value, i);
        if (!desc) {
          active.delete(value);
          return Object.freeze({ ok: false, path: elemPath, reason: "unsupported_type" });
        }
        if (!desc.enumerable || !("value" in desc)) {
          active.delete(value);
          return Object.freeze({ ok: false, path: elemPath, reason: "accessor_property" });
        }
        const child = project(desc.value, elemPath, active);
        if (!child.ok) {
          active.delete(value);
          return child;
        }
        out.push(child.value);
      }
      active.delete(value);
      return Object.freeze({ ok: true, value: out });
    }
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      return Object.freeze({ ok: false, path, reason: "non_plain_object" });
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      return Object.freeze({ ok: false, path, reason: "symbol_key" });
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Object.getOwnPropertyNames(value).sort();
    active.add(value);
    const out: Record<string, JsonValue> = {};
    for (const key of keys) {
      const keyPath = path ? `${path}.${key}` : key;
      if (!isWellFormedUnicode(key)) {
        active.delete(value);
        return Object.freeze({ ok: false, path: keyPath, reason: "invalid_unicode" });
      }
      const desc = descriptors[key]!;
      if (!desc.enumerable || !("value" in desc)) {
        active.delete(value);
        return Object.freeze({ ok: false, path: keyPath, reason: "accessor_property" });
      }
      if (desc.value === undefined) continue;
      const child = project(desc.value, keyPath, active);
      if (!child.ok) {
        active.delete(value);
        return child;
      }
      Object.defineProperty(out, key, {
        value: child.value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    active.delete(value);
    return Object.freeze({ ok: true, value: out });
  }
  return Object.freeze({ ok: false, path, reason: "unsupported_type" });
}

export function toJsonValue(value: unknown): ToJsonValueResult {
  return project(value, "", new Set<object>());
}
