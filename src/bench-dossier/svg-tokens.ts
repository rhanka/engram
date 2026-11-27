export type SvgPrimitiveErrorCode =
  | "EMPTY_STRING" | "WRONG_TYPE" | "BAD_SLUG" | "BAD_ENUM" | "BAD_NUMBER" | "NON_POSITIVE"
  | "NOT_OBJECT" | "NOT_ARRAY" | "CASCADE_CONFLICT" | "PROVIDER_SHAPE_OVERFLOW" | "SEAT_UNAVAILABLE";

/** Typed refusal error for SVG primitives and model-shape registry checks. */
export class SvgPrimitiveError extends Error {
  constructor(readonly code: SvgPrimitiveErrorCode, readonly path: string, detail?: string) {
    super(detail ? `${code} at ${path}: ${detail}` : `${code} at ${path}`);
    this.name = "SvgPrimitiveError";
  }
}

export const failSvg = (code: SvgPrimitiveErrorCode, path: string, detail?: string): never => {
  throw new SvgPrimitiveError(code, path, detail);
};
export const requireNonEmptyText = (value: unknown, path: string): string =>
  typeof value === "string" && value.trim() ? value.trim() : failSvg("EMPTY_STRING", path);
export const requireFiniteNum = (value: unknown, path: string): number =>
  typeof value === "number" && Number.isFinite(value) ? value : failSvg("BAD_NUMBER", path);
export const fmtSvgNum = (value: number, path = "value"): string =>
  String(Number(requireFiniteNum(value, path).toFixed(2)));
export const escapeXml = (text: string): string => (typeof text === "string"
  ? text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;") : failSvg("EMPTY_STRING", "text"));

export const ST_FONT_SANS = "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
export const SVG_FONT_FAMILY =
  "var(--st-font-sans, Inter, system-ui, -apple-system, BlinkMacSystemFont, "
  + "'Segoe UI', 'DejaVu Sans', sans-serif)";

const SURFACE_SPEC = {
  surfaceDefault: ["--st-semantic-surface-default", "#ffffff", "#0f172a"],
  surfaceSubtle: ["--st-semantic-surface-subtle", "#f8fafc", "#172033"],
  textPrimary: ["--st-semantic-text-primary", "#0f172a", "#f1f5f9"],
  textSecondary: ["--st-semantic-text-secondary", "#475569", "#cbd5e1"],
  textMuted: ["--st-semantic-text-muted", "#64748b", "#94a3b8"],
  borderSubtle: ["--st-semantic-border-subtle", "#e2e8f0", "#475569"],
  borderStrong: ["--st-semantic-border-strong", "#94a3b8", "#94a3b8"],
  feedbackError: ["--st-semantic-feedback-error", "#dc2626", "#dc2626"],
} as const;
const CATEGORY_HEX = ["#4E79A7", "#F28E2B", "#E15759", "#76B7B2", "#59A14F", "#EDC948", "#B07AA1", "#FF9DA7"] as const;
type DsVarKey = keyof typeof SURFACE_SPEC | `category${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`;

export const DS_VARS = Object.freeze({
  ...Object.fromEntries(Object.entries(SURFACE_SPEC).map(([key, [prop, light]]) => [key, `var(${prop}, ${light})`])),
  ...Object.fromEntries(CATEGORY_HEX.map((hex, index) => [
    `category${index + 1}`, `var(--st-semantic-data-category${index + 1}, ${hex})`,
  ])),
}) as Readonly<Record<DsVarKey, string>>;

const LIGHT_CSS = [
  `--st-font-sans:${ST_FONT_SANS}`, ...Object.values(SURFACE_SPEC).map(([prop, light]) => `${prop}:${light}`),
  ...CATEGORY_HEX.map((hex, index) => `--st-semantic-data-category${index + 1}:${hex}`),
].join(";");
const DARK_CSS = Object.values(SURFACE_SPEC)
  .filter(([, light, dark]) => light !== dark).map(([prop, , dark]) => `${prop}:${dark}`).join(";");
export const SVG_THEME_CSS =
  `:root{${LIGHT_CSS}}:root[data-theme="dark"]{${DARK_CSS}}@media (prefers-color-scheme:dark){:root{${DARK_CSS}}}`;
