/**
 * Track G — design-system `--st-*` token sourcing.
 *
 * Source of truth: the PUBLISHED npm packages
 *   - @sentropic/design-system-tokens  (foundation -> semantic -> component)
 *   - @sentropic/design-system-themes   (compileTheme + sentTechTheme)
 *
 * The themes package emits the canonical `--st-*` CSS custom properties
 * (`--st-foundation-*`, `--st-semantic-*`, `--st-component-*` plus short
 * aliases `--st-font-*`, `--st-radius-*`, `--st-spacing-*`, `--st-shadow-*`,
 * `--st-motion-*`, `--st-z-*`). We compile `sentTechTheme` for light, and a
 * dark variant derived from the same foundation/semantic trees (the DS does
 * not yet ship a published dark theme), then expose both as CSS so the studio
 * shell can serve them via a `<link>`-backed route.
 *
 * The studio then maps its legacy `--ws-*` contract onto `var(--st-*)`
 * references (see `tokens-fallback.ts` -> `serialiseTokensToCss`). The hand
 * rolled hex palette is gone: every colour resolves through a real DS token.
 */
import {
  compileTheme,
  foundation,
  semantic,
  component,
  sentTechTheme,
  type TenantTheme,
} from "@sentropic/design-system-themes";

/** Selector used for the default (light) `--st-*` block: bare `:root`. */
export const ST_LIGHT_SELECTOR = ":root";
/**
 * Selector used for the dark `--st-*` block. Scoped to an explicit
 * `[data-ws-theme="dark"]` opt-in so the default light theme stays stable;
 * the route also wraps it in a `prefers-color-scheme: dark` media query.
 */
export const ST_DARK_SELECTOR = ':root[data-ws-theme="dark"]';

/**
 * Dark semantic overrides. The DS foundation slate scale runs 0 (white) ->
 * 90 (near-black); for dark we invert the surface/text ramp and lean on the
 * existing strong-border + interactive tokens (which are OKLCH and read well
 * on dark). Action / feedback / data-category roles are theme-agnostic and
 * inherited unchanged from the light semantic tree.
 */
const DARK_SEMANTIC = {
  ...semantic,
  surface: {
    ...semantic.surface,
    default: foundation.color.slate[90], // #0f172a
    subtle: foundation.color.slate[80], // #1e293b
    raised: foundation.color.slate[80],
    inverse: foundation.color.slate[0], // #ffffff
  },
  text: {
    ...semantic.text,
    primary: foundation.color.slate[10], // #f8fafc
    secondary: "#94a3b8",
    inverse: foundation.color.slate[90],
  },
  border: {
    ...semantic.border,
    subtle: foundation.color.slate[80], // #1e293b
    strong: foundation.color.slate[60], // #475569
  },
};

/** Published Sent Tech light theme, compiled verbatim. */
export const stLightTheme: TenantTheme = sentTechTheme;

/** Dark theme derived from the same DS foundation + (overridden) semantic. */
export const stDarkTheme: TenantTheme = {
  id: "sent-tech-dark",
  label: "Sent Tech (dark)",
  mode: "dark",
  tokens: {
    foundation,
    semantic: DARK_SEMANTIC,
    component,
  },
};

/**
 * Compile the DS `--st-*` CSS for both themes into a single stylesheet body.
 * The dark block is emitted twice: once under an explicit opt-in selector and
 * once under `prefers-color-scheme: dark` so the studio follows the OS theme
 * unless the user pins `[data-ws-theme]`.
 */
export function buildStTokensCss(): string {
  const light = compileTheme(stLightTheme, { selector: ST_LIGHT_SELECTOR });
  const darkOptIn = compileTheme(stDarkTheme, { selector: ST_DARK_SELECTOR });
  const darkAuto = compileTheme(stDarkTheme, { selector: ":root" });
  return [
    "/* @sentropic/design-system-tokens + themes (compiled --st-* tokens). */",
    light,
    darkOptIn,
    "@media (prefers-color-scheme: dark) {",
    darkAuto,
    "}",
  ].join("\n");
}

/**
 * Compile only the light `--st-*` block under a custom selector. Used by the
 * standalone HTML export, which is a self-contained file (no server / no
 * <link> route) and so must inline the DS token definitions for the
 * `--ws-* -> var(--st-*)` aliases to resolve.
 */
export function compileStLightTokensCss(selector = ":root"): string {
  return compileTheme(stLightTheme, { selector });
}

/**
 * HTTP path the studio serves the compiled DS tokens from. Kept off the
 * inline `<style>` so the OKLCH/hex DS values live in a linked stylesheet
 * (the workspace shell references it via `<link>`).
 */
export const ST_TOKENS_ROUTE = "/workspace/tokens.css";
