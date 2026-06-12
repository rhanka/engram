import { describe, expect, it } from "vitest";

import {
  BOX_SHAPE_CODE,
  STAR_INNER_RATIO,
  shapeCode,
  shapePolygonPoints,
  shapeSvgPath,
} from "../src/index";

describe("shapeCode", () => {
  it("maps scene shape names to renderer codes (box aliases roundedbox)", () => {
    expect(shapeCode("dot")).toBe(0);
    expect(shapeCode("diamond")).toBe(1);
    expect(shapeCode("star")).toBe(2);
    expect(shapeCode("hexagon")).toBe(3);
    expect(shapeCode("square")).toBe(4);
    expect(shapeCode("box")).toBe(BOX_SHAPE_CODE);
    expect(shapeCode("roundedbox")).toBe(BOX_SHAPE_CODE);
    expect(shapeCode("triangle")).toBe(6);
    expect(shapeCode("unknown")).toBe(0);
    expect(shapeCode(undefined)).toBe(0);
  });
});

describe("shapePolygonPoints", () => {
  it("diamond vertices sit on the radius along the axes", () => {
    expect(shapePolygonPoints(1, 5)).toEqual([
      [0, -5],
      [5, 0],
      [0, 5],
      [-5, 0],
    ]);
  });

  it("star alternates outer and inner radii over 10 vertices", () => {
    const points = shapePolygonPoints(2, 10)!;
    expect(points).toHaveLength(10);
    for (let index = 0; index < 10; index += 1) {
      const [x, y] = points[index]!;
      const r = Math.hypot(x, y);
      expect(r).toBeCloseTo(index % 2 === 0 ? 10 : 10 * STAR_INNER_RATIO, 6);
    }
  });

  it("circle (0) and box (5) have no polygon (dedicated paths)", () => {
    expect(shapePolygonPoints(0, 5)).toBeNull();
    expect(shapePolygonPoints(BOX_SHAPE_CODE, 5)).toBeNull();
  });
});

describe("shapeSvgPath", () => {
  it("emits the polygon path for a diamond (same vertices the canvas strokes)", () => {
    expect(shapeSvgPath("diamond", 5)).toBe("M 0 -5 L 5 0 L 0 5 L -5 0 Z");
  });

  it("accepts numeric shape codes and name strings identically", () => {
    expect(shapeSvgPath(6, 5)).toBe(shapeSvgPath("triangle", 5));
  });

  it("circle falls back to a two-arc path", () => {
    expect(shapeSvgPath("dot", 4)).toBe("M -4 0 A 4 4 0 1 0 4 0 A 4 4 0 1 0 -4 0 Z");
  });

  it("box is a rounded square with the renderer's inset and corner ratios", () => {
    const path = shapeSvgPath("roundedbox", 5);
    // half side = 5 * 0.88 = 4.4, corner = 4.4 * 0.6 = 2.64
    expect(path).toContain("M -1.76 -4.4");
    expect(path).toContain("Q 4.4 -4.4 4.4 -1.76");
    expect(path.match(/Q /g)).toHaveLength(4);
  });
});
