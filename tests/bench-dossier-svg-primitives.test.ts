import { describe, expect, it } from "vitest";
import {
  SvgPrimitiveError,
  escapeXml,
  fmtSvgNum,
  requireFiniteNum,
  requireNonEmptyText,
  DS_VARS,
  ST_FONT_SANS,
  SVG_FONT_FAMILY,
  SVG_THEME_CSS,
} from "../src/bench-dossier/svg-primitives.js";

function parseLeafSvg(xml: string): { tag: string; attrs: Record<string, string>; text?: string } {
  const match = /^<([a-z]+)\s+([^<>]*?)(?:\/>|>([^<>]*)<\/\1>)$/.exec(xml);
  expect(match).not.toBeNull();
  const attrs: Record<string, string> = Object.create(null);
  let rest = match![2]!;
  while (rest.length > 0) {
    const attrMatch = /^([a-z-]+)="([^"]*)"(?:\s+|$)/.exec(rest);
    expect(attrMatch).not.toBeNull();
    attrs[attrMatch![1]!] = attrMatch![2]!;
    rest = rest.slice(attrMatch![0].length);
  }
  return match![3] !== undefined ? { tag: match![1]!, attrs, text: match![3]! } : { tag: match![1]!, attrs };
}

function refuse(fn: () => unknown, code: string, path: string, message?: string): void {
  let caught: unknown;
  try {
    fn();
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(SvgPrimitiveError);
  const err = caught as SvgPrimitiveError;
  expect([err.code, err.path]).toEqual([code, path]);
  if (message) expect(err.message).toBe(message);
}

describe("BD-6 DS-token SVG primitives, normalization & 7x5 glyph registry", () => {

  it("formats SVG numbers, escapes all 5 XML characters and enforces base text/number guards", () => {
    expect(escapeXml("")).toBe("");
    expect(escapeXml(`a&b<c>"d"'e'`)).toBe("a&amp;b&lt;c&gt;&quot;d&quot;&#39;e&#39;");
    expect([fmtSvgNum(-0.001), fmtSvgNum(12.345), fmtSvgNum(-3.5)]).toEqual(["0", "12.35", "-3.5"]);
    expect(requireNonEmptyText(" ok ", "k")).toBe("ok");
    expect(requireFiniteNum(0, "n")).toBe(0);
    const err = new SvgPrimitiveError("BAD_ENUM", "p", "bad");
    expect([err.name, err.message]).toEqual(["SvgPrimitiveError", "BAD_ENUM at p: bad"]);
    refuse(() => requireNonEmptyText("", "k"), "EMPTY_STRING", "k", "EMPTY_STRING at k");
    refuse(() => requireNonEmptyText("  ", "k"), "EMPTY_STRING", "k");
    refuse(() => requireNonEmptyText(1 as unknown as string, "k"), "EMPTY_STRING", "k");
    refuse(() => requireFiniteNum(Number.NaN, "x"), "BAD_NUMBER", "x");
    refuse(() => fmtSvgNum(Number.NaN), "BAD_NUMBER", "value");
    refuse(() => fmtSvgNum(Number.POSITIVE_INFINITY, "x"), "BAD_NUMBER", "x");
    refuse(() => fmtSvgNum(Number.NEGATIVE_INFINITY, "x"), "BAD_NUMBER", "x");
    refuse(() => fmtSvgNum("1" as unknown as number, "x"), "BAD_NUMBER", "x");
    refuse(() => escapeXml(null as unknown as string), "EMPTY_STRING", "text");
  });

  it("exports exact --st-* variables with hex fallbacks and light/dark CSS", () => {
    expect(ST_FONT_SANS).toBe("Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif");
    expect(SVG_FONT_FAMILY).toBe(
      "var(--st-font-sans, Inter, system-ui, -apple-system, BlinkMacSystemFont, "
      + "'Segoe UI', 'DejaVu Sans', sans-serif)",
    );
    expect(Object.isFrozen(DS_VARS)).toBe(true);
    expect(DS_VARS).toEqual({
      surfaceDefault: "var(--st-semantic-surface-default, #ffffff)",
      surfaceSubtle: "var(--st-semantic-surface-subtle, #f8fafc)",
      textPrimary: "var(--st-semantic-text-primary, #0f172a)",
      textSecondary: "var(--st-semantic-text-secondary, #475569)",
      textMuted: "var(--st-semantic-text-muted, #64748b)",
      borderSubtle: "var(--st-semantic-border-subtle, #e2e8f0)",
      borderStrong: "var(--st-semantic-border-strong, #94a3b8)",
      feedbackError: "var(--st-semantic-feedback-error, #dc2626)",
      category1: "var(--st-semantic-data-category1, #4E79A7)",
      category2: "var(--st-semantic-data-category2, #F28E2B)",
      category3: "var(--st-semantic-data-category3, #E15759)",
      category4: "var(--st-semantic-data-category4, #76B7B2)",
      category5: "var(--st-semantic-data-category5, #59A14F)",
      category6: "var(--st-semantic-data-category6, #EDC948)",
      category7: "var(--st-semantic-data-category7, #B07AA1)",
      category8: "var(--st-semantic-data-category8, #FF9DA7)",
    });
    const darkCss = "--st-semantic-surface-default:#0f172a;--st-semantic-surface-subtle:#172033;"
      + "--st-semantic-text-primary:#f1f5f9;--st-semantic-text-secondary:#cbd5e1;"
      + "--st-semantic-text-muted:#94a3b8;--st-semantic-border-subtle:#475569";
    expect(SVG_THEME_CSS).toBe(
      ":root{--st-font-sans:Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;"
      + "--st-semantic-surface-default:#ffffff;--st-semantic-surface-subtle:#f8fafc;"
      + "--st-semantic-text-primary:#0f172a;--st-semantic-text-secondary:#475569;"
      + "--st-semantic-text-muted:#64748b;--st-semantic-border-subtle:#e2e8f0;"
      + "--st-semantic-border-strong:#94a3b8;--st-semantic-feedback-error:#dc2626;"
      + "--st-semantic-data-category1:#4E79A7;--st-semantic-data-category2:#F28E2B;"
      + "--st-semantic-data-category3:#E15759;--st-semantic-data-category4:#76B7B2;"
      + "--st-semantic-data-category5:#59A14F;--st-semantic-data-category6:#EDC948;"
      + "--st-semantic-data-category7:#B07AA1;--st-semantic-data-category8:#FF9DA7}"
      + `:root[data-theme="dark"]{${darkCss}}@media (prefers-color-scheme:dark){:root{${darkCss}}}`,
    );
  });
});
