/**
 * Track G Lot 1 / G1 — optional @sentropic/design-system token adapter.
 *
 * Tries to import the DS tokens via a fully dynamic import so the
 * Graphify package never declares @sentropic/design-system as a hard
 * dependency. Returns null when the DS is not installed (current state)
 * or when its export shape does not match our narrow WorkspaceTokens
 * contract. The shell logic then falls back to tokens-fallback.ts.
 *
 * When @sentropic/design-system ships the 5 completion requests listed
 * in spec/SPEC_TRACK_G_WORKSPACE.md (token contract export, light+dark
 * parity, reduced-motion neutral, focus-ring token, ESM tokens
 * subpath), this adapter's success path becomes the primary token
 * source and the fallback becomes a safety net.
 */
import type { WorkspaceThemedTokens } from "./tokens.js";

interface DsTokensModuleShape {
  workspaceTokens?: WorkspaceThemedTokens;
  default?: WorkspaceThemedTokens;
}

function isThemedTokens(value: unknown): value is WorkspaceThemedTokens {
  if (!value || typeof value !== "object") return false;
  const v = value as { light?: unknown; dark?: unknown };
  return (
    !!v.light && typeof v.light === "object" &&
    !!v.dark && typeof v.dark === "object"
  );
}

/**
 * Attempts to resolve @sentropic/design-system/tokens.
 * Resolves to null on any failure (missing package, invalid export, etc.).
 */
export async function tryGetDsTokens(): Promise<WorkspaceThemedTokens | null> {
  try {
    const mod = (await import(
      /* @vite-ignore */ "@sentropic/design-system/tokens"
    )) as DsTokensModuleShape;
    const candidate = mod.workspaceTokens ?? mod.default;
    return isThemedTokens(candidate) ? candidate : null;
  } catch {
    return null;
  }
}
