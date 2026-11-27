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
