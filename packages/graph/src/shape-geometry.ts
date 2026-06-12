/**
 * Single source of truth for node-glyph GEOMETRY.
 *
 * The Canvas2D renderer (drawNodeShapePath) and any DOM/SVG glyph (e.g. the
 * studio left-rail type list) both derive their outlines from here, so a shape
 * swatch is guaranteed to match what the canvas actually draws — never a
 * hand-drawn approximation.
 */

/** Inner-to-outer radius ratio of the 5-point star glyph. */
export const STAR_INNER_RATIO = 0.42;

/** Square / box glyphs are slightly inset so they read the same weight as a circle. */
export const SQUARE_INSET_RATIO = 0.88;

/** Corner radius of the small rounded-box glyph, as a fraction of its half-side. */
export const BOX_GLYPH_CORNER_RATIO = 0.6;

/** Shape code drawn as the legacy labelled rounded-box node glyph. */
export const BOX_SHAPE_CODE = 5;

/**
 * Map a scene shape name to the renderer's numeric shape code.
 * `box` aliases `roundedbox` (legacy vis-network `shape:box` parity); anything
 * unknown falls back to 0 (circle/dot).
 */
export function shapeCode(value: unknown): number {
  const shape = String(value ?? "dot").trim().toLowerCase();
  if (shape === "diamond") return 1;
  if (shape === "star") return 2;
  if (shape === "hexagon") return 3;
  if (shape === "square") return 4;
  if (shape === "box" || shape === "roundedbox") return 5;
  if (shape === "triangle") return 6;
  return 0;
}

/**
 * Polygon vertices (relative to the node centre) for the polygonal shape
 * codes: 1 diamond, 2 star, 3 hexagon, 4 square, 6 triangle. Returns null for
 * non-polygon glyphs (0 circle, 5 rounded box), which have dedicated paths.
 */
export function shapePolygonPoints(shape: number, radius: number): Array<[number, number]> | null {
  if (shape === 1) {
    return [
      [0, -radius],
      [radius, 0],
      [0, radius],
      [-radius, 0],
    ];
  }

  if (shape === 2) {
    const inner = radius * STAR_INNER_RATIO;
    const points: Array<[number, number]> = [];
    for (let index = 0; index < 10; index += 1) {
      const angle = (index * Math.PI) / 5 - Math.PI / 2;
      const r = index % 2 === 0 ? radius : inner;
      points.push([Math.cos(angle) * r, Math.sin(angle) * r]);
    }
    return points;
  }

  if (shape === 3) {
    const points: Array<[number, number]> = [];
    for (let index = 0; index < 6; index += 1) {
      const angle = (index * Math.PI) / 3 - Math.PI / 6;
      points.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
    }
    return points;
  }

  if (shape === 4) {
    const half = radius * SQUARE_INSET_RATIO;
    return [
      [-half, -half],
      [half, -half],
      [half, half],
      [-half, half],
    ];
  }

  if (shape === 6) {
    const points: Array<[number, number]> = [];
    for (let index = 0; index < 3; index += 1) {
      const angle = (index * 2 * Math.PI) / 3 - Math.PI / 2;
      points.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
    }
    return points;
  }

  return null;
}

function fmt(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

/**
 * SVG path (centred on 0,0) for a node shape, built from the SAME geometry the
 * Canvas2D renderer draws. Accepts a scene shape name ("diamond", "star",
 * "roundedbox", …) or a numeric shape code. Circle (0) is two arcs; the box
 * (5) is the renderer's small rounded square (inset side, rounded corners);
 * everything else is its polygon.
 */
export function shapeSvgPath(shape: string | number, radius: number): string {
  const code = typeof shape === "number" ? shape : shapeCode(shape);
  const points = shapePolygonPoints(code, radius);
  if (points) {
    const [first, ...rest] = points;
    return `M ${fmt(first![0])} ${fmt(first![1])} ${rest
      .map(([x, y]) => `L ${fmt(x)} ${fmt(y)}`)
      .join(" ")} Z`;
  }

  if (code === BOX_SHAPE_CODE) {
    const half = radius * SQUARE_INSET_RATIO;
    const c = half * BOX_GLYPH_CORNER_RATIO;
    return [
      `M ${fmt(-half + c)} ${fmt(-half)}`,
      `L ${fmt(half - c)} ${fmt(-half)}`,
      `Q ${fmt(half)} ${fmt(-half)} ${fmt(half)} ${fmt(-half + c)}`,
      `L ${fmt(half)} ${fmt(half - c)}`,
      `Q ${fmt(half)} ${fmt(half)} ${fmt(half - c)} ${fmt(half)}`,
      `L ${fmt(-half + c)} ${fmt(half)}`,
      `Q ${fmt(-half)} ${fmt(half)} ${fmt(-half)} ${fmt(half - c)}`,
      `L ${fmt(-half)} ${fmt(-half + c)}`,
      `Q ${fmt(-half)} ${fmt(-half)} ${fmt(-half + c)} ${fmt(-half)}`,
      "Z",
    ].join(" ");
  }

  return `M ${fmt(-radius)} 0 A ${fmt(radius)} ${fmt(radius)} 0 1 0 ${fmt(radius)} 0 A ${fmt(
    radius,
  )} ${fmt(radius)} 0 1 0 ${fmt(-radius)} 0 Z`;
}
