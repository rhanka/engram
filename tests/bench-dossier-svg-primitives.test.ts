import { describe, expect, it } from "vitest";
import {
  SvgPrimitiveError,
  escapeXml,
  fmtSvgNum,
  requireFiniteNum,
  requireNonEmptyText,
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
});
