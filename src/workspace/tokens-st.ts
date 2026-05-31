/**
 * Track G — design-system `--st-*` token sourcing.
 *
 * Source of truth: the PUBLISHED npm packages `@sentropic/design-system-tokens`
 * + `@sentropic/design-system-themes` (compileTheme + sentTechTheme), which emit
 * the canonical `--st-*` CSS custom properties.
 *
 * `@sentropic/design-system-themes` is ESM-only (no CJS export), and graphify
 * ships a CJS bundle too, so importing it at RUNTIME breaks `require()`. The
 * token CSS is deterministic, so it is pre-compiled at BUILD time by
 * `scripts/gen-st-tokens.mjs` into `tokens-st-css.generated.ts` (a bundled
 * string). The themes package is therefore a build-only devDependency, kept out
 * of the runtime bundle.
 *
 * The studio maps its legacy `--ws-*` contract onto `var(--st-*)` references
 * (see `tokens-fallback.ts` -> `serialiseTokensToCss`). Every colour resolves
 * through a real DS token.
 */
import { ST_TOKENS_CSS, stLightTokensCss } from "./tokens-st-css.generated.js";

/** Selector used for the default (light) `--st-*` block: bare `:root`. */
export const ST_LIGHT_SELECTOR = ":root";
/** Selector used for the dark `--st-*` block (explicit opt-in). */
export const ST_DARK_SELECTOR = ':root[data-ws-theme="dark"]';

/**
 * Compile the DS `--st-*` CSS for both themes into a single stylesheet body.
 * Returns the pre-compiled string (light at :root, dark opt-in + a
 * `prefers-color-scheme: dark` block).
 */
export function buildStTokensCss(): string {
  return ST_TOKENS_CSS;
}

/**
 * The light `--st-*` block under a custom selector. Used by the standalone HTML
 * export, which is a self-contained file and must inline the DS token defs for
 * the `--ws-* -> var(--st-*)` aliases to resolve.
 */
export function compileStLightTokensCss(selector = ":root"): string {
  return stLightTokensCss(selector);
}

/**
 * HTTP path the studio serves the compiled DS tokens from. Kept off the inline
 * `<style>` so the OKLCH/hex DS values live in a linked stylesheet.
 */
export const ST_TOKENS_ROUTE = "/workspace/tokens.css";
