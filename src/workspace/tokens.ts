/**
 * Track G Lot 1 / G1 — workspace token contract.
 *
 * Narrow interface the workspace shell consumes for colour, typography,
 * spacing, radius, elevation and focus-ring values. Two adapters
 * implement it:
 *
 *   - tokens-fallback.ts: deterministic slate-neutral palette, always
 *     available, used when @sentropic/design-system is not installed.
 *   - tokens-ds.ts: tries to import @sentropic/design-system/tokens
 *     dynamically and returns null on failure (no hard dep).
 *
 * The shell never reads from a design-system import directly; it goes
 * through resolveWorkspaceTokens() which prefers the DS when available
 * and falls back otherwise. This keeps the workspace usable on a clean
 * checkout without the (currently external) design-system package, and
 * is the exact "fallback adapter pattern" mandated in
 * spec/SPEC_TRACK_G_WORKSPACE.md > "Design system completion requests".
 */

/** Colour roles. Hex strings with optional alpha (#RRGGBB or #RRGGBBAA). */
export interface WorkspaceColourTokens {
  /** Page background, lowest elevation. */
  surface: string;
  /** One elevation above surface (cards, rails). */
  "surface-2": string;
  /** Hairline borders, dividers. */
  border: string;
  /** Default body text colour. WCAG AA on `surface`. */
  text: string;
  /** Secondary text (muted, hints, timestamps). WCAG AA on `surface`. */
  "text-muted": string;
  /** Primary accent (selection, focus, brand-y highlights). */
  accent: string;
  /** Destructive / error state. */
  danger: string;
  /** Success state. */
  success: string;
  /** Caution / pending state. */
  warning: string;
}

export interface WorkspaceTypographyTokens {
  "font-family-sans": string;
  "font-family-mono": string;
  "font-size-sm": string;
  "font-size-md": string;
  "font-size-lg": string;
  "line-height-tight": string;
  "line-height-normal": string;
}

/** Spacing scale (CSS lengths). Convention: space-0 = 0, space-7 = largest. */
export interface WorkspaceSpacingTokens {
  "space-0": string;
  "space-1": string;
  "space-2": string;
  "space-3": string;
  "space-4": string;
  "space-5": string;
  "space-6": string;
  "space-7": string;
}

export interface WorkspaceRadiusTokens {
  "radius-sm": string;
  "radius-md": string;
  "radius-lg": string;
}

export interface WorkspaceElevationTokens {
  "shadow-card": string;
  "shadow-popover": string;
}

/**
 * Focus-ring tokens. Track C / WCAG: must be visible against both
 * `surface` and `surface-2`, and must NOT rely on `accent` alone for
 * contrast.
 */
export interface WorkspaceFocusRingTokens {
  outline: string;
  "outline-offset": string;
  "outline-color": string;
}

export interface WorkspaceTokens {
  colour: WorkspaceColourTokens;
  typography: WorkspaceTypographyTokens;
  spacing: WorkspaceSpacingTokens;
  radius: WorkspaceRadiusTokens;
  elevation: WorkspaceElevationTokens;
  focusRing: WorkspaceFocusRingTokens;
}

/**
 * Light / dark theme tokens. The shell receives the resolved tokens for
 * the active theme; theme switching is a shell-level concern, not a
 * token-level one.
 */
export interface WorkspaceThemedTokens {
  light: WorkspaceTokens;
  dark: WorkspaceTokens;
}

/** Top-level roles enumerated for the test suite to assert coverage. */
export const WORKSPACE_TOKEN_GROUPS = [
  "colour",
  "typography",
  "spacing",
  "radius",
  "elevation",
  "focusRing",
] as const;

export type WorkspaceTokenGroup = (typeof WORKSPACE_TOKEN_GROUPS)[number];
