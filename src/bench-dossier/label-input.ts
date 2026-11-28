import {
  failSvg,
  requireFiniteNum,
  requirePlainObj,
  requirePositiveNum,
} from "./svg-primitives.js";
import type { LabelLayout, PlaceLabelsInput } from "./label-types.js";
import { DEFAULT_LABEL_FONT_SIZE, DEFAULT_MARKER_RADIUS, mergeCoincidentTies } from "./label-text.js";

function requireNonNegativeNum(value: unknown, path: string): number {
  const num = requireFiniteNum(value, path);
  return num < 0 ? failSvg("BAD_NUMBER", path) : num;
}

function parseLayout(raw: LabelLayout): LabelLayout {
  requirePlainObj(raw, "input.layout");
  const layoutPath = "input.layout";
  return {
    ml: requireNonNegativeNum(raw.ml, `${layoutPath}.ml`),
    mt: requireNonNegativeNum(raw.mt, `${layoutPath}.mt`),
    baseIw: requirePositiveNum(raw.baseIw, `${layoutPath}.baseIw`),
    baseIh: requirePositiveNum(raw.baseIh, `${layoutPath}.baseIh`),
    baseMr: requireNonNegativeNum(raw.baseMr, `${layoutPath}.baseMr`),
  };
}

function parseOptionalArray<T, R>(
  raw: readonly T[] | undefined,
  path: string,
  parseItem: (item: Record<string, unknown>, itemPath: string) => R,
): R[] {
  if (raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw)) {
    failSvg("NOT_ARRAY", path);
  }
  return Array.from({ length: raw.length }, (_, index) => {
    const itemPath = `${path}[${index}]`;
    return parseItem(requirePlainObj(raw[index], itemPath), itemPath);
  });
}

export function parsePlaceLabelsInput(input: PlaceLabelsInput) {
  requirePlainObj(input, "input");
  const layout = parseLayout(input.layout);
  const rawFontSize = input.fontSize;
  const fontSize = requirePositiveNum(
    rawFontSize === undefined ? DEFAULT_LABEL_FONT_SIZE : rawFontSize,
    "input.fontSize",
  );
  const { clusters, tieFootnotes } = mergeCoincidentTies(input.points, "input.points");
  const obstacles = parseOptionalArray(input.obstacles, "input.obstacles", (item, itemPath) => ({
    x: requireFiniteNum(item.x, `${itemPath}.x`),
    y: requireFiniteNum(item.y, `${itemPath}.y`),
    radius: requirePositiveNum(
      item.radius === undefined ? DEFAULT_MARKER_RADIUS : item.radius,
      `${itemPath}.radius`,
    ),
  }));
  const segments = parseOptionalArray(input.segments, "input.segments", (item, itemPath) => ({
    x1: requireFiniteNum(item.x1, `${itemPath}.x1`),
    y1: requireFiniteNum(item.y1, `${itemPath}.y1`),
    x2: requireFiniteNum(item.x2, `${itemPath}.x2`),
    y2: requireFiniteNum(item.y2, `${itemPath}.y2`),
  }));
  return { layout, fontSize, clusters, tieFootnotes, obstacles, segments };
}
