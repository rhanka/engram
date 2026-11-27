import {
  DS_VARS, escapeXml, fmtSvgNum, requireBool, requireEnum, requireFiniteNum,
  requirePlainObj, requirePositiveNum, resolveGlyphStyle, type GlyphState,
} from "./svg-tokens.js";
import { GLYPH_SHAPES, type GlyphShape } from "./svg-registry.js";
export * from "./svg-tokens.js";
export * from "./svg-registry.js";


const SHAPE_SET = new Set<string>(GLYPH_SHAPES);
const POLY: Readonly<Partial<Record<GlyphShape, readonly [number, number, number?]>>> =
  { triangle: [3, 0.58], diamond: [4, 0.58], pentagon: [5, 0.55], star: [10, 0.75, 0.45 * 0.75] };
export interface GlyphRenderOptions {
  readonly shape: GlyphShape;
  readonly state: GlyphState;
  readonly color: string;
  readonly cx: number;
  readonly cy: number;
  readonly size?: number;
  readonly outerRing?: boolean;
}
function polyPts(cx: number, cy: number, sides: number, outerRadius: number, innerRadius = outerRadius): string {
  return Array.from({ length: sides }, (_, index) => {
    const radius = index % 2 === 0 ? outerRadius : innerRadius;
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / sides;
    return `${fmtSvgNum(cx + radius * Math.cos(angle))},${fmtSvgNum(cy + radius * Math.sin(angle))}`;
  }).join(" ");
}
function crossPts(cx: number, cy: number, arm: number, bar: number): string {
  const offsets = [[-bar, -arm], [bar, -arm], [bar, -bar], [arm, -bar], [arm, bar], [bar, bar],
    [bar, arm], [-bar, arm], [-bar, bar], [-arm, bar], [-arm, -bar], [-bar, -bar]] as const;
  return offsets.map(([offsetX, offsetY]) => `${fmtSvgNum(cx + offsetX)},${fmtSvgNum(cy + offsetY)}`).join(" ");
}
/** Render one closed 7-shape × 5-state SVG marker at (cx, cy). */
export function renderGlyph(opts: GlyphRenderOptions): string {
  requirePlainObj(opts, "glyph");
  const shape = requireEnum<GlyphShape>(opts.shape, SHAPE_SET, "glyph.shape");
  const style = resolveGlyphStyle(opts.state, opts.color, "glyph.state", "glyph.color");
  const cx = requireFiniteNum(opts.cx, "glyph.cx");
  const cy = requireFiniteNum(opts.cy, "glyph.cy");
  const size = requirePositiveNum(opts.size === undefined ? 10 : opts.size, "glyph.size");
  const outerRing = requireBool(opts.outerRing === undefined ? false : opts.outerRing, "glyph.outerRing");
  const dash = style.strokeDasharray ? ` stroke-dasharray="${style.strokeDasharray}"` : "";
  const attrs = `fill="${escapeXml(style.fill)}" stroke="${escapeXml(style.stroke)}"`
    + ` stroke-width="${style.strokeWidth}"${dash}`;
  const [sides, outerRatio, innerRatio] = POLY[shape] ?? [0, 0];
  const element = shape === "circle"
    ? `<circle cx="${fmtSvgNum(cx)}" cy="${fmtSvgNum(cy)}" r="${fmtSvgNum(0.5 * size)}" ${attrs}/>`
    : shape === "square"
      ? `<rect x="${fmtSvgNum(cx - 0.45 * size)}" y="${fmtSvgNum(cy - 0.45 * size)}"`
        + ` width="${fmtSvgNum(0.9 * size)}" height="${fmtSvgNum(0.9 * size)}" ${attrs}/>`
      : `<polygon points="${shape === "cross" ? crossPts(cx, cy, 0.55 * size, 0.2 * size)
        : polyPts(cx, cy, sides, outerRatio * size, (innerRatio ?? outerRatio) * size)}" ${attrs}/>`;
  return outerRing
    ? `<g>${element}<circle cx="${fmtSvgNum(cx)}" cy="${fmtSvgNum(cy)}"`
      + ` r="${fmtSvgNum(0.9 * size)}" fill="none" stroke="${DS_VARS.textPrimary}" stroke-width="2.4"/></g>`
    : element;
}
