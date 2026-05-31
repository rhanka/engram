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
    surface: "#0f111a",
    "surface-2": "#1a1d2a",
    border: "#2a2e3e",
    text: "#e6e8ec",
    "text-muted": "#9fa6b2",
    accent: "#4E79A7",
    danger: "#E15759",
    success: "#59A14F",
    warning: "#F28E2B",
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
    "outline-color": "#ffd54f",
  }),
}) as WorkspaceTokens;

const LIGHT_TOKENS: WorkspaceTokens = Object.freeze({
  colour: Object.freeze({
    surface: "#ffffff",
    "surface-2": "#f5f6f8",
    border: "#d6d8df",
    text: "#1a1d2a",
    "text-muted": "#5b6271",
    accent: "#2F5A8A",
    danger: "#B2432D",
    success: "#3F7A39",
    warning: "#B9601E",
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
    "outline-color": "#A05E00",
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
 * Map of every `--ws-*` custom property onto the design-system `--st-*`
 * token that backs it (per the DS-team mapping). Colour, spacing, radius,
 * elevation, focus-ring and font-family roles resolve through real DS
 * tokens; font-size / line-height keep literal values (the DS does not yet
 * publish a type-scale token) but those are never colours, so they never
 * trip the `no-bare-hex` audit. The `--st-*` definitions themselves live in
 * the linked tokens stylesheet (see tokens-st.ts), keeping the inline
 * workspace `<style>` free of hex.
 */
const WS_TO_ST_ALIAS: Record<string, string> = {
  // Colour roles.
  "surface": "var(--st-semantic-surface-default)",
  "surface-2": "var(--st-semantic-surface-subtle)",
  "border": "var(--st-semantic-border-subtle)",
  "border-strong": "var(--st-semantic-border-strong)",
  "text": "var(--st-semantic-text-primary)",
  "text-muted": "var(--st-semantic-text-secondary)",
  "accent": "var(--st-semantic-action-primary)",
  "accent-text": "var(--st-semantic-action-primaryText)",
  "danger": "var(--st-semantic-feedback-error)",
  "success": "var(--st-semantic-feedback-success)",
  "warning": "var(--st-semantic-feedback-warning)",
  // Tooltip / inverse surface.
  "surface-inverse": "var(--st-semantic-surface-inverse)",
  "text-inverse": "var(--st-semantic-text-inverse)",
  // Typography (font families -> DS aliases; sizes/leading stay literal).
  "font-family-sans": "var(--st-font-sans)",
  "font-family-display": "var(--st-font-display)",
  "font-family-mono": "var(--st-font-mono)",
  // Spacing scale (ws-space-0..7 -> nearest DS spacing step by value).
  "space-0": "var(--st-spacing-0)",
  "space-1": "var(--st-spacing-1)",
  "space-2": "var(--st-spacing-2)",
  "space-3": "var(--st-spacing-3)",
  "space-4": "var(--st-spacing-4)",
  "space-5": "var(--st-spacing-6)",
  "space-6": "var(--st-spacing-8)",
  "space-7": "var(--st-spacing-12)",
  // Radius.
  "radius-sm": "var(--st-radius-sm)",
  "radius-md": "var(--st-radius-md)",
  "radius-lg": "var(--st-radius-lg)",
  // Elevation.
  "shadow-card": "var(--st-shadow-subtle)",
  "shadow-popover": "var(--st-shadow-medium)",
  // Focus ring (colour role -> interactive border per DS mapping).
  "outline-color": "var(--st-semantic-border-interactive)",
};

/**
 * The community / category palette `--ws-community-1..8` aliased onto the DS
 * `--st-semantic-data-category1..8` tokens. Emitted alongside the contract
 * roles so any community-coloured swatch resolves through a DS token.
 */
const WS_COMMUNITY_ALIASES: string[] = Array.from({ length: 8 }, (_, i) =>
  `--ws-community-${i + 1}: var(--st-semantic-data-category${i + 1});`,
);

/**
 * Serialise a WorkspaceTokens block to CSS custom properties. Used by
 * shell.ts to inject the resolved palette into the workspace HTML
 * scaffold.
 *
 * Every emitted `--ws-*` value is a `var(--st-*)` reference to a real
 * design-system token when one exists; only the non-colour type-scale
 * values (font-size / line-height) fall through to the literal token value.
 * This is what lets the studio adopt the published `--st-*` tokens without
 * rewriting hundreds of `--ws-*` call sites.
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
      const aliased = WS_TO_ST_ALIAS[key];
      lines.push(`--ws-${key}: ${aliased ?? value};`);
    }
  }
  // Extra `--ws-*` roles that are not part of the base WorkspaceTokens
  // contract but are referenced by the shell (distinct heading/body type
  // pair, accent text, inverse tooltip surface, strong border). Each maps
  // straight onto a DS `--st-*` token.
  for (const key of [
    "font-family-display",
    "accent-text",
    "border-strong",
    "surface-inverse",
    "text-inverse",
  ]) {
    lines.push(`--ws-${key}: ${WS_TO_ST_ALIAS[key]};`);
  }
  lines.push(...WS_COMMUNITY_ALIASES);
  return lines.join("\n");
}
