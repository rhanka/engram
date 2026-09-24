/**
 * Central Engram / graphify environment-variable dual-read helper.
 *
 * Every `ENGRAM_*` variable supersedes its legacy `GRAPHIFY_*` counterpart:
 * the new key wins when both are set, the old key is honoured as a fallback
 * so existing checkouts and automation keep working.
 *
 * Deprecation warnings name the KEY ONLY and never echo values — several of
 * these variables carry secrets (DSNs, passwords, API keys). Each key warns
 * at most once per process.
 *
 * All `GRAPHIFY_*` reads in `src/` must go through this module so the
 * fallback posture stays in one auditable place.
 */

const warnedKeys = new Set<string>();

/** Clear recorded deprecation warnings (tests only). */
export function clearEngramEnvWarningsForTests(): void {
  warnedKeys.clear();
}

/**
 * Read an env var trying the Engram name first, then the legacy name.
 *
 * @param newKey - The `ENGRAM_*` variable name (preferred).
 * @param legacyKey - The legacy `GRAPHIFY_*` variable name (fallback).
 * @param env - Environment map; defaults to `process.env`. Accepts an
 *   explicit map so callers stay hermetic under test.
 * @returns The `ENGRAM_*` value when set (even empty), else the legacy
 *   value with a one-time deprecation warning, else `undefined`.
 */
export function engramEnv(
  newKey: string,
  legacyKey?: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const fresh = env[newKey];
  if (fresh !== undefined) return fresh;
  if (legacyKey !== undefined) {
    const legacy = env[legacyKey];
    if (legacy !== undefined) {
      if (!warnedKeys.has(newKey)) {
        warnedKeys.add(newKey);
        console.warn(
          `[engram] ${legacyKey} is deprecated, use ${newKey}`,
        );
      }
      return legacy;
    }
  }
  return undefined;
}

/**
 * Numeric dual-read: `Number(engramEnv(...))` or `fallback` when unset or
 * non-numeric (mirrors the previous ignore-invalid posture).
 */
export function engramEnvNumber(
  newKey: string,
  legacyKey: string | undefined,
  fallback: number,
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = engramEnv(newKey, legacyKey, env);
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Boolean dual-read: false for `0/false/no/off` (case-insensitive),
 * true for any other set value, `fallback` when unset.
 */
export function engramEnvBoolean(
  newKey: string,
  legacyKey: string | undefined,
  fallback: boolean,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = engramEnv(newKey, legacyKey, env);
  if (!raw) return fallback;
  return !["0", "false", "no", "off"].includes(raw.toLowerCase());
}

/**
 * Temporarily override an env pair for the duration of `fn` (or until the
 * returned restore function runs), then restore both keys to their previous
 * values. Both the new and the legacy key are written so nested readers —
 * old or new — observe the override.
 */
export function pushEngramEnv(
  newKey: string,
  legacyKey: string | undefined,
  value: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): () => void {
  const prevNew = env[newKey];
  const prevOld = legacyKey !== undefined ? env[legacyKey] : undefined;
  const restore = (): void => {
    if (prevNew === undefined) delete env[newKey];
    else env[newKey] = prevNew;
    if (legacyKey !== undefined) {
      if (prevOld === undefined) delete env[legacyKey];
      else env[legacyKey] = prevOld;
    }
  };
  if (value === undefined) {
    delete env[newKey];
    if (legacyKey !== undefined) delete env[legacyKey];
  } else {
    env[newKey] = value;
    if (legacyKey !== undefined) env[legacyKey] = value;
  }
  return restore;
}
