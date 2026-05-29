/**
 * Track G Lot 1 / G1 — local fallback token adapter.
 *
 * Deterministic slate-neutral palette. WCAG AA: `text` (#e6e8ec) on
 * `surface` (#0f111a) measures 14.3:1 (well above AA 4.5:1 for body,
 * above AAA 7:1). `text-muted` (#9fa6b2) on `surface` measures 7.7:1
 * (above AA 4.5:1, above AAA 7:1). No client-org / no PROCESS_STD look-and-feel:
 * the fallback intentionally stays neutral so the workspace identity
 * is Graphify-only until @sentropic/design-system ships its full
 * token contract.
 */
import type {
  WorkspaceTheme,
  ResolvedWorkspaceTokens,
  WorkspaceTokens,
  WorkspaceThemedTokens,
} from "./tokens.js";
import { DEFAULT_WORKSPACE_THEME } from "./tokens.js";
import { tryGetDsTokens } from "./tokens-ds.js";

const SHARED_TYPOGRAPHY = Object.freeze({
  "font-family-display":
    '"Segoe UI", system-ui, "Helvetica Neue", Arial, sans-serif',
  "font-family-sans":
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  "font-family-mono":
    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  "font-size-sm": "12px",
  "font-size-md": "14px",
  "font-size-lg": "16px",
  "line-height-tight": "1.25",
  "line-height-normal": "1.5",
});

const SHARED_SPACING = Object.freeze({
  "space-0": "0",
  "space-1": "4px",
  "space-2": "8px",
  "space-3": "12px",
  "space-4": "16px",
  "space-5": "24px",
  "space-6": "32px",
  "space-7": "48px",
});

const SHARED_RADIUS = Object.freeze({
  "radius-sm": "4px",
  "radius-md": "6px",
  "radius-lg": "10px",
});

const DARK_TOKENS: WorkspaceTokens = Object.freeze({
  colour: Object.freeze({
    surface: "oklch(0.18 0.0188 274.65)",
    "surface-2": "oklch(0.2339 0.0255 274.22)",
    border: "oklch(0.3044 0.0295 273.63)",
    text: "oklch(0.9306 0.0058 264.53)",
    "text-muted": "oklch(0.7233 0.0191 261.33)",
    accent: "oklch(0.5645 0.0863 251.12)",
    danger: "oklch(0.6383 0.1726 22.53)",
    success: "oklch(0.6422 0.1371 141.33)",
    warning: "oklch(0.7384 0.1595 59.42)",
  }),
  typography: SHARED_TYPOGRAPHY,
  spacing: SHARED_SPACING,
  radius: SHARED_RADIUS,
  elevation: Object.freeze({
    "shadow-card": "0 1px 2px rgba(0,0,0,0.6), 0 2px 4px rgba(0,0,0,0.4)",
    "shadow-popover": "0 4px 12px rgba(0,0,0,0.65), 0 8px 24px rgba(0,0,0,0.45)",
  }),
  focusRing: Object.freeze({
    outline: "3px solid",
    "outline-offset": "2px",
    "outline-color": "oklch(0.8859 0.1539 91.23)",
  }),
}) as WorkspaceTokens;

const LIGHT_TOKENS: WorkspaceTokens = Object.freeze({
  colour: Object.freeze({
    surface: "oklch(1 0 0)",
    "surface-2": "oklch(0.9729 0.0029 264.54)",
    border: "oklch(0.8827 0.0098 273.34)",
    text: "oklch(0.2339 0.0255 274.22)",
    "text-muted": "oklch(0.4955 0.0255 265.57)",
    accent: "oklch(0.4601 0.0923 252.7)",
    danger: "oklch(0.5319 0.1493 33.1)",
    success: "oklch(0.5232 0.1151 141.93)",
    warning: "oklch(0.5844 0.1367 51.89)",
  }),
  typography: SHARED_TYPOGRAPHY,
  spacing: SHARED_SPACING,
  radius: SHARED_RADIUS,
  elevation: Object.freeze({
    "shadow-card": "0 1px 2px rgba(15,17,26,0.08), 0 2px 4px rgba(15,17,26,0.05)",
    "shadow-popover":
      "0 4px 12px rgba(15,17,26,0.12), 0 8px 24px rgba(15,17,26,0.08)",
  }),
  focusRing: Object.freeze({
    outline: "3px solid",
    "outline-offset": "2px",
    "outline-color": "oklch(0.5448 0.1227 64.54)",
  }),
}) as WorkspaceTokens;

/** Returns the fallback theme pair (light + dark) used when @sentropic/design-system is unavailable. */
export function getWorkspaceTokensFallback(): WorkspaceThemedTokens {
  return { light: LIGHT_TOKENS, dark: DARK_TOKENS };
}

/**
 * Convenience: get the fallback tokens for a single theme. The default
 * follows the design-system default theme instead of forcing a dark
 * override at each call site.
 */
export function getWorkspaceTokens(
  theme: WorkspaceTheme = DEFAULT_WORKSPACE_THEME,
): WorkspaceTokens {
  return theme === "light" ? LIGHT_TOKENS : DARK_TOKENS;
}

export async function resolveWorkspaceTokens(
  theme: WorkspaceTheme = DEFAULT_WORKSPACE_THEME,
): Promise<ResolvedWorkspaceTokens> {
  const dsTokens = await tryGetDsTokens();
  if (dsTokens) {
    return {
      source: "design-system",
      themedTokens: dsTokens,
      tokens: dsTokens[theme],
    };
  }
  const themedTokens = getWorkspaceTokensFallback();
  return {
    source: "fallback",
    themedTokens,
    tokens: themedTokens[theme],
  };
}

/**
 * Serialise a WorkspaceTokens block to CSS custom properties. Used by
 * shell.ts to inject the resolved palette into the workspace HTML
 * scaffold.
 */
export function serialiseTokensToCss(tokens: WorkspaceTokens): string {
  const groups = [
    tokens.colour,
    tokens.typography,
    tokens.spacing,
    tokens.radius,
    tokens.elevation,
    tokens.focusRing,
  ];
  const lines: string[] = [];
  for (const group of groups) {
    for (const [key, value] of Object.entries(group)) {
      lines.push(`--ws-${key}: ${value};`);
    }
  }
  return lines.join("\n");
}
