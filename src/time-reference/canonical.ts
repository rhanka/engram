/**
 * Canonical JSON and SHA-256 digests for the time-reference contract.
 *
 * Canonical form: RFC 8785 style — object keys sorted by UTF-16 code units,
 * no whitespace, arrays preserved in order. Distinct digest computations
 * (spec section 9.4) are separate functions over different bytes; deriving
 * one from another is a contract violation.
 *
 * Neutrality: only `node:crypto` is imported. No filesystem, network or
 * process access.
 */

import { createHash } from "node:crypto";

export function canonicalJson(value: unknown): string {
  return stringify(value);
}

function stringify(value: unknown): string {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "number") {
    if (!Number.isFinite(value as number)) throw new Error("non-finite number is not canonicalizable");
    return JSON.stringify(value);
  }
  if (t === "string" || t === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => stringify(v)).join(",")}]`;
  if (t === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stringify(v)}`).join(",")}}`;
  }
  throw new Error(`value of type ${t} is not canonicalizable`);
}

export function sha256Hex(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Digest in the `sha256:<64 lowercase hex>` form used everywhere except frozen fixture digests. */
export function sha256Digest(bytes: string | Uint8Array): string {
  return `sha256:${sha256Hex(bytes)}`;
}

/** SHA-256 over the canonical bytes of a value. */
export function canonicalDigest(value: unknown): string {
  return sha256Digest(canonicalJson(value));
}

function withoutKey<T extends Record<string, unknown>>(obj: T, key: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (k !== key) out[k] = v;
  return out;
}

/**
 * `snapshotDigest` (section 6.1): SHA-256 over the canonical snapshot bytes
 * of a collection manifest excluding the `snapshotDigest` field itself.
 */
export function snapshotDigestOf(manifest: Record<string, unknown>): string {
  return canonicalDigest(withoutKey(manifest, "snapshotDigest"));
}

/**
 * `exportDigest` (section 6.8): SHA-256 over the canonical export bytes
 * excluding the `exportDigest` field itself.
 */
export function exportDigestOf(exp: Record<string, unknown>): string {
  return canonicalDigest(withoutKey(exp, "exportDigest"));
}

/**
 * `fingerprintDigest`: SHA-256 over the canonical bytes of a regime
 * fingerprint object.
 */
export function fingerprintDigestOf(fingerprint: Record<string, unknown>): string {
  return canonicalDigest(fingerprint);
}

/**
 * `entryDigest` (section 9.4/10): SHA-256 over the RFC 8785 canonical JSON
 * of a whole catalog entry, computed externally, never self-embedded.
 */
export function entryDigestOf(entry: Record<string, unknown>): string {
  if ("entryDigest" in entry) throw new Error("entryDigest is computed externally, never self-embedded");
  return canonicalDigest(entry);
}
