/**
 * Schema-id compat contract for the graphify → Engram rename.
 *
 * Writers emit `engram_*_vN` ids. Every validator/reader accepts both the
 * `engram_*_vN` id and its legacy `graphify_*_vN` counterpart indefinitely;
 * persisted artifacts are never rewritten. Reads stay quiet (no deprecation
 * warning — artifact re-read must not spam); only explicit generation of a
 * legacy id warns, and no such flag exists.
 */

export const ENGRAM_SCHEMA_PREFIX = "engram_";
export const LEGACY_SCHEMA_PREFIX = "graphify_";

/**
 * Strict versioned-id shape: `<prefix>_<name>_v<digits>` with a non-empty
 * name. Anything else maps to itself.
 */
const VERSIONED_SCHEMA_ID = /^(engram|graphify)_(.+)_v(\d+)$/;

function swapSchemaPrefix(schemaId: string, from: string, to: string): string {
  const match = VERSIONED_SCHEMA_ID.exec(schemaId);
  if (match?.[1] !== from) return schemaId;
  return `${to}_${match[2]}_v${match[3]}`;
}

/**
 * Map an `engram_*_vN` schema id to its legacy `graphify_*_vN` counterpart.
 * Non-Engram ids (or malformed ones) map to themselves.
 */
export function legacySchemaId(engramId: string): string {
  return swapSchemaPrefix(engramId, "engram", "graphify");
}

/**
 * Map a legacy `graphify_*_vN` schema id to its `engram_*_vN` counterpart.
 * Non-legacy ids map to themselves.
 */
export function engramSchemaId(schemaId: string): string {
  return swapSchemaPrefix(schemaId, "graphify", "engram");
}

/**
 * True when `actual` equals the expected `engram_*_vN` id or its legacy
 * `graphify_*_vN` counterpart. Use in every schema validator.
 */
export function schemaIdAccepted(actual: unknown, expectedEngramId: string): boolean {
  return actual === expectedEngramId || actual === legacySchemaId(expectedEngramId);
}
