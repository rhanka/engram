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
import {
  WORKSPACE_TOKEN_GROUPS,
  type WorkspaceThemedTokens,
  type WorkspaceTokenGroup,
  type WorkspaceTokens,
} from "./tokens.js";

interface DsTokensModuleShape {
  workspaceTokens?: WorkspaceThemedTokens;
  default?: WorkspaceThemedTokens;
}

const REQUIRED_KEYS: Record<WorkspaceTokenGroup, readonly string[]> = {
  colour: [
    "surface",
    "surface-2",
    "border",
    "text",
    "text-muted",
    "accent",
    "danger",
    "success",
    "warning",
  ],
  typography: [
    "font-family-display",
    "font-family-sans",
    "font-family-mono",
    "font-size-sm",
    "font-size-md",
    "font-size-lg",
    "line-height-tight",
    "line-height-normal",
  ],
  spacing: [
    "space-0",
    "space-1",
    "space-2",
    "space-3",
    "space-4",
    "space-5",
    "space-6",
    "space-7",
  ],
  radius: ["radius-sm", "radius-md", "radius-lg"],
  elevation: ["shadow-card", "shadow-popover"],
  focusRing: ["outline", "outline-offset", "outline-color"],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function hasStringKeys(value: unknown, keys: readonly string[]): boolean {
  if (!isRecord(value)) return false;
  return keys.every((key) => typeof value[key] === "string" && value[key].length > 0);
}

function isWorkspaceTokens(value: unknown): value is WorkspaceTokens {
  if (!isRecord(value)) return false;
  return WORKSPACE_TOKEN_GROUPS.every((group) => hasStringKeys(value[group], REQUIRED_KEYS[group]));
}

export function normaliseDesignSystemTokens(value: unknown): WorkspaceThemedTokens | null {
  if (!isRecord(value)) return null;
  const candidate = value as { light?: unknown; dark?: unknown };
  if (!isWorkspaceTokens(candidate.light) || !isWorkspaceTokens(candidate.dark)) return null;
  return value as unknown as WorkspaceThemedTokens;
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
    return normaliseDesignSystemTokens(candidate);
  } catch {
    return null;
  }
}
