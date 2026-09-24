/**
 * Schema-id compat contract for the graphify → Engram rename.
 *
 * Writers emit `engram_*_v1` ids. Every validator/reader accepts both the
 * `engram_*_v1` id and its legacy `graphify_*_v1` counterpart indefinitely;
 * persisted artifacts are never rewritten. Reads stay quiet (no deprecation
 * warning — artifact re-read must not spam); only explicit generation of a
 * legacy id warns, and no such flag exists.
 */

export const ENGRAM_SCHEMA_PREFIX = "engram_";
export const LEGACY_SCHEMA_PREFIX = "graphify_";
const SCHEMA_SUFFIX = "_v1";

/**
 * Map an `engram_*_v1` schema id to its legacy `graphify_*_v1` counterpart.
 * Non-Engram ids (or malformed ones) map to themselves.
 */
export function legacySchemaId(engramId: string): string {
  if (engramId.startsWith(ENGRAM_SCHEMA_PREFIX) && engramId.endsWith(SCHEMA_SUFFIX)) {
    return LEGACY_SCHEMA_PREFIX + engramId.slice(ENGRAM_SCHEMA_PREFIX.length);
  }
  return engramId;
}

/**
 * Map a legacy `graphify_*_v1` schema id to its `engram_*_v1` counterpart.
 * Non-legacy ids map to themselves.
 */
export function engramSchemaId(schemaId: string): string {
  if (schemaId.startsWith(LEGACY_SCHEMA_PREFIX) && schemaId.endsWith(SCHEMA_SUFFIX)) {
    return ENGRAM_SCHEMA_PREFIX + schemaId.slice(LEGACY_SCHEMA_PREFIX.length);
  }
  return schemaId;
}

/**
 * True when `actual` equals the expected `engram_*_v1` id or its legacy
 * `graphify_*_v1` counterpart. Use in every schema validator.
 */
export function schemaIdAccepted(actual: unknown, expectedEngramId: string): boolean {
  return actual === expectedEngramId || actual === legacySchemaId(expectedEngramId);
}
