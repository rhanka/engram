import {
  buildRenderGraphBuffers,
  buildStyleBuffers,
  DEFAULT_LAYOUT_ID,
  GRID_LAYOUT_ID,
  METRO_LAYOUT_ID,
  RADIAL_LAYOUT_ID,
  resolveLayout,
  TYPED_LAYER_LAYOUT_ID,
} from "@sentropic/graph";
import { semantic } from "@sentropic/design-system-tokens";
import { shapeForType } from "./graphAdapter.js";

/**
 * SINGLE source of truth for a group's (community / type) colour. Both the
 * canvas node fill (`buildGraphRendererPayload`) AND the left-rail community
 * legend swatch resolve a group's colour through {@link colorForGroup} over the
 * SAME key (the group / community name). Previously the legend assigned a DS
 * category token by sorted position while the canvas hashed the name into this
 * palette — two independent schemes that diverged (the biggest community could
 * render blue on the canvas but amber in the legend). Reusing one function over
 * one key guarantees the legend dot and the node fill are byte-identical.
 */
export const GROUP_PALETTE = [
  "#4f7cac",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#8b5cf6",
  "#14b8a6",
  "#f97316",
  "#64748b",
  "#ec4899",
  "#22c55e",
  "#3b82f6",
  "#a855f7",
];

// Studio representation-polish remark 1: main-graph edges render semi-
// transparent by DEFAULT (not opaque) — same #94a3b8 hue as before, now at
// ~0.5 alpha — so the graph reads less like a solid mesh even before any
// hover. `#94a3b8` = rgb(148, 163, 184); packages/graph's buildStyleBuffers
// accepts an [r,g,b,a] ColorInput, so we spell the colour as an array to
// carry the alpha (studio-only — packages/graph's own defaults/goldens are
// untouched).
const EDGE_BASE_OPACITY = 0.5;
const EDGE_MIN_OPACITY = 0.3;
const EDGE_BASE_ALPHA = Math.round(255 * EDGE_BASE_OPACITY); // 128
// ONE slate hue for EVERY edge (remark: edges must all be the same colour and
// differ ONLY by a transparency degree — a whiter hue for "weak" edges reads as
// a colour change and is a bug). Weakness is conveyed by the dotted dash alone,
// never by a paler RGB.
const EDGE_COLOR_RGB = [148, 163, 184];
// Degree 1–2 is visually sparse and stays at the historical 0.50. From there,
// a logarithmic curve handles the long-tailed degree distribution of knowledge
// graphs; the floor (0.30 = the 70%-transparent cap) is now reached by degree
// 16 so hub edges recede enough for the density gradient to READ clearly.
const EDGE_DENSITY_START_DEGREE = 2;
const EDGE_DENSITY_FULL_DEGREE = 16;
const EDGE_CURVE_FACTOR = 0.5;
const DIM_ALPHA = Math.round(255 * 0.35); // 89 — connected-dim for NON-neighbour nodes
// Remark 1: non-incident edges dim FURTHER than nodes on hover (edges are
// mostly noise once a node is focused) — incident edges are left at the
// EDGE_BASE_ALPHA (~0.5+) by simply not being touched by the dim loop below.
const EDGE_DIM_ALPHA = Math.round(255 * 0.15); // 38
// Selection-neighbourhood halo: the renderer draws a scaled, low-alpha copy of
// the same node geometry before the real node fill. This is deliberately a
// filled glow approximation, never a contour/ring, so the node's own colour
// remains the foreground signal.
export const HALO_ALPHA = Math.round(255 * 0.28);
export const HALO_RADIUS_SCALE = 1.65;
const EDGE_HALO_ALPHA = Math.round(255 * 0.7);
const EDGE_HALO_WIDTH_SCALE = 1.25;
const EDGE_HALO_TINT = 0.45;

/** DS token used by the selection-neighbourhood halo. */
export const DS_PRIMARY_TOKEN = "--st-semantic-action-primary";
// The token package is the deterministic non-DOM fallback. Browser rendering
// always tries the active computed CSS custom property first, so theme
// overrides remain authoritative.
const DS_PRIMARY_FALLBACK_CSS = semantic.action.primary;

// --- codeflow-parity Lot 4: Curved-links toggle + Color-by (Folder / Layer) ---
/**
 * Default curvature for a main-graph edge — the studio's CURRENT behaviour.
 * Both @sentropic/graph backends already draw a per-edge quadratic when
 * curvature !== 0 (`styles.ts:259`, `render-geometry.edgeGeometry`), so the
 * "Curved links" toggle is purely this scalar: ON ⇒ this value (default,
 * byte-identical to before), OFF ⇒ 0 (straight). Wiring only — NOT the discrete
 * flow-port S-routing (R3).
 */
export const DEFAULT_EDGE_CURVATURE = 0.15;
/**
 * Color-by mode — colour by directory / container (community/container, i.e.
 * `node.group`). This is the studio's CURRENT default keying (`colorForGroup`).
 */
export const COLOR_BY_FOLDER = "folder";
/** Color-by mode — colour by typed layer / ontology level (`node_type`). */
export const COLOR_BY_LAYER = "layer";
/** Color-by mode — continuous churn/activity heat ramp (degree fallback first). */
export const COLOR_BY_CHURN = "churn";

// --- Configurable edge-transparency (along-edge alpha shape) ------------------
/**
 * Edge-fade mode — DENSE fade (DEFAULT): each edge is opaque at its RARE
 * (low-degree) endpoint and fades toward its DENSE (high-degree) endpoint, so a
 * hub's incident edges recede near the hub and the sparse rim reads clearly.
 */
export const EDGE_ALPHA_DENSE = "dense";
/** Edge-fade mode — INVERSE: opaque at the dense endpoint, faint at the rare one. */
export const EDGE_ALPHA_INVERSE = "inverse";
/** Edge-fade mode — MID fade: opaque near BOTH nodes, faint in the MIDDLE. */
export const EDGE_ALPHA_MID = "mid";
/** Edge-fade mode — FLAT: uniform base alpha, no along-edge gradient. */
export const EDGE_ALPHA_FLAT = "flat";
/** Edge-fade modes exposed by the studio segmented control (default first). */
export const EDGE_ALPHA_MODES = [
  EDGE_ALPHA_DENSE,
  EDGE_ALPHA_INVERSE,
  EDGE_ALPHA_MID,
  EDGE_ALPHA_FLAT,
];
/** Default base edge opacity (0..1) — the flat base alpha before any fade shape. */
export const DEFAULT_EDGE_OPACITY = 0.5;
/**
 * The FAINT fraction the along-edge fade decays to (the dense endpoint / the edge
 * middle). 0.15 keeps a hub's incident edges visible-but-receded rather than
 * vanishing. Applied as a MULTIPLIER of the base alpha inside the shape buffer.
 */
export const EDGE_ALPHA_FLOOR = 0.15;

// Density-aware base node sizing. The user confirmed sizes read well at ~1000
// nodes but are too big at ~5000. We shrink only the BASE radius as the graph
// grows (the per-node degree spread — sqrt(weight), i.e. the RADIUS_RATIO
// god-node multiplier from graphAdapter — is preserved because it multiplies
// the already-scaled base). At n <= DENSITY_REF the factor is 1 (unchanged);
// for larger n it follows 1/sqrt(n) growth and clamps at DENSITY_MIN.
const DENSITY_REF = 1000; // node count at/below which the base radius is unchanged
const DENSITY_MIN = 0.45; // floor for the base-radius scale on very dense graphs

/**
 * Density factor for the base node radius given a node count.
 * densityScale(n) = clamp(sqrt(DENSITY_REF / n), DENSITY_MIN, 1).
 * @param {number} nodeCount  number of nodes in the scene
 * @returns {number} a multiplier in [DENSITY_MIN, 1] applied to the base radius
 */
export function densityScale(nodeCount) {
  const n = Number.isFinite(nodeCount) && nodeCount > 0 ? nodeCount : 1;
  const raw = Math.sqrt(DENSITY_REF / n);
  return Math.min(1, Math.max(DENSITY_MIN, raw));
}

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function clampUnit(value) {
  if (!finite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function stableHash(value) {
  const text = String(value ?? "");
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Resolve the palette colour for a group key (community / type name). Exported
 * so the legend (LeftRail) reuses the EXACT same mapping as the canvas — the
 * single source of truth for community→colour (BUG B fix).
 */
export function colorForGroup(group) {
  const index = stableHash(group ?? "default") % GROUP_PALETTE.length;
  return GROUP_PALETTE[index];
}

function cssAlpha(value) {
  if (!finite(value)) return 1;
  return clampUnit(value > 1 ? value / 100 : value);
}

function cssChannel(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const numeric = Number.parseFloat(text);
  if (!Number.isFinite(numeric)) return null;
  return text.endsWith("%") ? numeric * 2.55 : numeric;
}

function cssAngle(value) {
  const text = String(value ?? "").trim().toLowerCase();
  const numeric = Number.parseFloat(text);
  if (!Number.isFinite(numeric)) return null;
  if (text.endsWith("rad")) return (numeric * 180) / Math.PI;
  if (text.endsWith("grad")) return numeric * 0.9;
  if (text.endsWith("turn")) return numeric * 360;
  return numeric;
}

function oklchToRgba(value) {
  const match = String(value ?? "").match(/^oklch\((.*)\)$/i);
  if (!match) return null;
  const parts = match[1].replace(/\//g, " / ").trim().split(/\s+/);
  const slash = parts.indexOf("/");
  const channels = slash >= 0 ? parts.slice(0, slash) : parts;
  if (channels.length < 3) return null;

  const lightnessText = channels[0];
  const chromaText = channels[1];
  const lightnessNumber = Number.parseFloat(lightnessText);
  const chromaNumber = Number.parseFloat(chromaText);
  const lightness = lightnessText.endsWith("%") ? lightnessNumber / 100 : lightnessNumber;
  // CSS Color 4 maps OKLCH chroma percentages onto the [0, 0.4] range.
  const chroma = chromaText.endsWith("%") ? (chromaNumber / 100) * 0.4 : chromaNumber;
  const hue = cssAngle(channels[2]);
  if (![lightness, chroma, hue].every(Number.isFinite)) return null;

  const radians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);
  const l = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const m = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const s = lightness - 0.0894841775 * a - 1.291485548 * b;
  const l3 = l ** 3;
  const m3 = m ** 3;
  const s3 = s ** 3;
  const linear = [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  ];
  const toSrgb = (channel) => {
    const clamped = Math.max(0, Math.min(1, channel));
    return clamped <= 0.0031308
      ? clamped * 12.92
      : 1.055 * clamped ** (1 / 2.4) - 0.055;
  };
  const alpha = slash >= 0 ? cssAlpha(Number.parseFloat(parts[slash + 1])) : 1;
  return [
    Math.round(toSrgb(linear[0]) * 255),
    Math.round(toSrgb(linear[1]) * 255),
    Math.round(toSrgb(linear[2]) * 255),
    Math.round(alpha * 255),
  ];
}

/** Resolve the CSS colour syntaxes emitted by the DS theme into renderer RGBA bytes. */
export function cssColorToRgba(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const oklch = oklchToRgba(text);
  if (oklch) return oklch;

  const hex = text.replace(/^#/, "");
  if (/^[0-9a-f]{3,8}$/i.test(hex)) {
    const expanded = hex.length <= 4 ? [...hex].map((digit) => `${digit}${digit}`).join("") : hex;
    const values = [0, 2, 4].map((offset) => Number.parseInt(expanded.slice(offset, offset + 2), 16));
    const alpha = expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) : 255;
    return [...values, alpha];
  }

  const rgbMatch = text.match(/^rgba?\((.*)\)$/i);
  if (!rgbMatch) return null;
  const parts = rgbMatch[1].replace(/,/g, " ").replace(/\//g, " / ").trim().split(/\s+/);
  const slash = parts.indexOf("/");
  const channels = slash >= 0 ? parts.slice(0, slash) : parts;
  if (channels.length < 3) return null;
  const rgb = channels.slice(0, 3).map(cssChannel);
  if (!rgb.every(Number.isFinite)) return null;
  const alpha = slash >= 0 ? cssAlpha(Number.parseFloat(parts[slash + 1])) : cssAlpha(Number.parseFloat(channels[3]));
  return [...rgb.map((channel) => Math.round(Math.max(0, Math.min(255, channel)))), Math.round(alpha * 255)];
}

/** Read the active DS primary token, with a deterministic authored-token fallback for tests/SSR. */
export function resolveDsPrimaryColor() {
  let cssValue = "";
  if (typeof document !== "undefined" && document.documentElement && typeof getComputedStyle === "function") {
    // The theme selector is scoped to the app root (`[data-st-theme]`), not
    // necessarily `<html>`, so read from the actual themed owner first.
    const themedRoot =
      typeof document.querySelector === "function"
        ? document.querySelector("[data-st-theme]")
        : null;
    cssValue = getComputedStyle(themedRoot ?? document.documentElement)
      .getPropertyValue(DS_PRIMARY_TOKEN)
      .trim();
  }
  return cssColorToRgba(cssValue) ?? cssColorToRgba(DS_PRIMARY_FALLBACK_CSS);
}

const CHURN_LOW = [226, 232, 240];
const CHURN_HIGH = [239, 68, 68];

function hex2(value) {
  return value.toString(16).padStart(2, "0");
}

/** Sequential light-slate → red ramp for normalized churn/activity heat. */
export function colorForChurn(value) {
  const t = clampUnit(value);
  const rgb = CHURN_LOW.map((lo, index) => Math.round(lo + (CHURN_HIGH[index] - lo) * t));
  return `#${hex2(rgb[0])}${hex2(rgb[1])}${hex2(rgb[2])}`;
}

function explicitChurnValue(node) {
  const candidates = [node.churn, node.git_churn, node.activity, node.activity_score, node.change_count];
  for (const value of candidates) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 0) return numeric;
  }
  return null;
}

function nodeDegreeFallback(sceneNodes, sceneEdges) {
  const degree = new Map(sceneNodes.map((node) => [node.id, 0]));
  for (const edge of sceneEdges) {
    if (degree.has(edge.source)) degree.set(edge.source, degree.get(edge.source) + 1);
    if (degree.has(edge.target)) degree.set(edge.target, degree.get(edge.target) + 1);
  }
  return degree;
}

export function edgeBaseAlphaForDegree(degree) {
  const endpointDegree = Number.isFinite(degree) ? Math.max(0, degree) : 0;
  if (endpointDegree <= EDGE_DENSITY_START_DEGREE) return EDGE_BASE_ALPHA;
  const range = Math.log2(EDGE_DENSITY_FULL_DEGREE / EDGE_DENSITY_START_DEGREE);
  const density = clampUnit(
    Math.log2(endpointDegree / EDGE_DENSITY_START_DEGREE) / range,
  );
  const opacity = EDGE_BASE_OPACITY - density * (EDGE_BASE_OPACITY - EDGE_MIN_OPACITY);
  return Math.round(255 * opacity);
}

/** Linear interpolation (a at t=0, b at t=1). */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Normalized endpoint DENSITY in [0,1] from a node's undirected degree — the
 * log-scaled position between START (=2, "sparse") and FULL (=16, "hub") the
 * along-edge fade uses. deg ≤ START ⇒ 0 (rare); deg ≥ FULL ⇒ 1 (dense). Reuses
 * the same START/FULL knobs as {@link edgeBaseAlphaForDegree}.
 * @param {number} degree undirected node degree
 * @returns {number} density in [0,1]
 */
export function edgeDensityForDegree(degree) {
  const d = Number.isFinite(degree) ? Math.max(0, degree) : 0;
  const range = Math.log2(EDGE_DENSITY_FULL_DEGREE / EDGE_DENSITY_START_DEGREE);
  return clampUnit(
    Math.log2(Math.max(d, EDGE_DENSITY_START_DEGREE) / EDGE_DENSITY_START_DEGREE) / range,
  );
}

/**
 * Resolve the three along-edge alpha MULTIPLIERS (m0 at source, mMid at 0.5, m1
 * at target — each 0..255) for one edge, from the fade mode + the per-endpoint
 * densities (d0 source, d1 target). These MULTIPLY the flat base alpha in the
 * WebGL shader; (255,255,255) = uniform. See {@link EDGE_ALPHA_DENSE} etc.
 * @param {string} mode  one of EDGE_ALPHA_MODES
 * @param {number} d0    source endpoint density in [0,1]
 * @param {number} d1    target endpoint density in [0,1]
 * @returns {[number, number, number]} [m0, mMid, m1] rounded to 0..255
 */
export function edgeAlphaShapeFor(mode, d0, d1) {
  const F = EDGE_ALPHA_FLOOR;
  if (mode === EDGE_ALPHA_FLAT) return [255, 255, 255];
  if (mode === EDGE_ALPHA_MID) {
    return [255, Math.round(255 * F), 255];
  }
  // dense: opaque at the RARE endpoint (density 0 ⇒ 1), faint at the DENSE one
  // (density 1 ⇒ FLOOR). inverse: swap the ends of the ramp.
  let m0;
  let m1;
  if (mode === EDGE_ALPHA_INVERSE) {
    m0 = Math.round(255 * lerp(F, 1, d0));
    m1 = Math.round(255 * lerp(F, 1, d1));
  } else {
    // EDGE_ALPHA_DENSE (default) and any unknown mode fall back to dense.
    m0 = Math.round(255 * lerp(1, F, d0));
    m1 = Math.round(255 * lerp(1, F, d1));
  }
  return [m0, Math.round((m0 + m1) / 2), m1];
}

/**
 * Build the per-edge ALPHA SHAPE buffer (3 bytes/edge, parallel to
 * `renderGraph.edges`) for a fade mode. Each edge's endpoints are looked up by
 * node id through `degreeById`, converted to a normalized density, then mapped
 * to the [m0, mMid, m1] multipliers by {@link edgeAlphaShapeFor}. Flat mode
 * still emits a buffer (all 255) so the shape is always present + explicit.
 * @param {{ edges: ArrayLike<number>, nodeIds: ArrayLike<string> }} renderGraph
 * @param {Map<string, number>} degreeById  scene node id → undirected degree
 * @param {string} mode  one of EDGE_ALPHA_MODES
 * @returns {Uint8Array} 3·edgeCount bytes
 */
export function buildEdgeAlphaShape(renderGraph, degreeById, mode) {
  const edgeCount = (renderGraph?.edges?.length ?? 0) / 2;
  const shape = new Uint8Array(edgeCount * 3);
  for (let e = 0; e < edgeCount; e += 1) {
    const srcIdx = renderGraph.edges[e * 2];
    const tgtIdx = renderGraph.edges[e * 2 + 1];
    const srcId = renderGraph.nodeIds[srcIdx];
    const tgtId = renderGraph.nodeIds[tgtIdx];
    const d0 = edgeDensityForDegree(degreeById.get(srcId) ?? 0);
    const d1 = edgeDensityForDegree(degreeById.get(tgtId) ?? 0);
    const [m0, mMid, m1] = edgeAlphaShapeFor(mode, d0, d1);
    shape[e * 3] = m0;
    shape[e * 3 + 1] = mMid;
    shape[e * 3 + 2] = m1;
  }
  return shape;
}

function normalizedChurnById(
  sceneNodes,
  sceneEdges,
  degree = nodeDegreeFallback(sceneNodes, sceneEdges),
) {
  const raw = new Map();
  for (const node of sceneNodes) {
    raw.set(node.id, explicitChurnValue(node) ?? degree.get(node.id) ?? 0);
  }
  // Reduce, not `Math.max(0, ...raw.values())`: the spread passes every value as
  // a separate argument, which overflows the engine arg-count limit (RangeError)
  // at ~1e5 nodes when Color-by=Churn.
  let max = 0;
  for (const v of raw.values()) if (v > max) max = v;
  const normalized = new Map();
  for (const [id, value] of raw) normalized.set(id, max > 0 ? value / max : 0);
  return normalized;
}

function positionForNode(node, index, total) {
  if (finite(node.x) && finite(node.y)) return { x: node.x, y: node.y, fixed: node.fixed === true };
  if (finite(node.fx) && finite(node.fy)) return { x: node.fx, y: node.fy, fixed: true };

  const count = Math.max(1, total);
  const angle = (Math.PI * 2 * index) / count;
  const radius = 90 + Math.sqrt(count) * 18;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
    fixed: false,
  };
}

function nodeSize(node, baseRadius, selected, focused) {
  const weight = finite(node.weight) && node.weight > 0 ? node.weight : 1;
  const base = baseRadius * Math.sqrt(weight);
  if (focused) return base * 1.85;
  if (selected) return base * 1.45;
  return base;
}

function edgeWidth(edge) {
  if (finite(edge.width) && edge.width > 0) return edge.width;
  if (edge.emphasis) return 2.5;
  if (edge.weak) return 0.75;
  return 1;
}

/**
 * Box-category scene shapes (legacy vis-network `shape:box` parity). Box nodes
 * draw their OWN label inside the canvas glyph, so every other label layer
 * (the DOM overlay in GraphCanvas) must skip them — one text per box, always.
 * @param {unknown} shape  the scene node `shape` string
 * @returns {boolean} true when the node renders as a labelled rounded box
 */
export function isBoxShape(shape) {
  const value = String(shape ?? "").toLowerCase();
  return value === "box" || value === "roundedbox";
}

const SYNTHETIC_GROUP_FIELDS = [
  "community_node_kind",
  "type_node_kind",
  "ontology_node_kind",
];

function isSyntheticGroupNode(node) {
  return SYNTHETIC_GROUP_FIELDS.some((field) => node?.[field] != null);
}

/**
 * Resolve the shape used by the renderer from the same type mapping as the
 * rail legend. Existing boxes and synthetic fold nodes are scene-level
 * rendering decisions, so their baked shape remains authoritative.
 */
function rendererShapeForNode(node) {
  const bakedShape = node?.shape ?? "dot";
  if (isSyntheticGroupNode(node) || isBoxShape(bakedShape)) return bakedShape;

  const type = node?.type ?? node?.type_name;
  if (typeof type !== "string" || type.trim() === "") return bakedShape;

  return shapeForType({ type }) || bakedShape;
}

/**
 * Default character budget for an in-canvas / overlay node label. The renderer
 * sizes a box glyph to its label's drawn width, so a long entity name (e.g.
 * "Dr. John H. Watson") yields a wide box that overflows a compact recon focal
 * slot. We cap the DRAWN text and append an ellipsis; the full, untruncated name
 * is still reachable on hover (the GraphCanvas tooltip + the recon rail/detail
 * `title`s carry `node.label` verbatim). Parameterizable so a view can opt into
 * a wider/narrower budget without touching the renderer.
 */
export const DEFAULT_LABEL_MAX_CHARS = 22;

/**
 * Truncate a label to at most `maxChars` glyphs, appending a single-character
 * ellipsis (…) when clipped. Trims trailing whitespace before the ellipsis so we
 * never render "Foo …". A non-positive / non-finite `maxChars` disables clipping
 * (returns the label unchanged) so callers can opt out explicitly.
 * @param {unknown} label     the source label (coerced to string)
 * @param {number} [maxChars] max visible glyphs before the ellipsis
 * @returns {string} the display label (truncated when longer than the budget)
 */
export function truncateLabel(label, maxChars = DEFAULT_LABEL_MAX_CHARS) {
  const text = String(label ?? "");
  if (!Number.isFinite(maxChars) || maxChars <= 0) return text;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars).replace(/\s+$/u, "") + "…";
}

/**
 * Principal-character label LOD (top-K names at zoom-out).
 *
 * The god-class label gate (degree >= LABEL_DEGREE_FRACTION × maxDegree, applied
 * inside @sentropic/graph buildStyleBuffers) can mark MANY Character hubs as
 * labelled boxes on a dense corpus, so a zoomed-OUT main graph paints a wall of
 * overlapping names. Instead we keep only the K highest-degree hubs labelled
 * when zoomed out — the "principal cast" — and reveal the long tail once the
 * user zooms past {@link LABEL_ZOOM_THRESHOLD}. Only the in-box NAME is gated:
 * the hub glyph is untouched and the full name stays on node.label for hover.
 */
/** K — how many principal-character names stay visible when zoomed out. */
export const MAX_PRINCIPAL_CHARACTER_LABELS = 5;
/**
 * world→screen zoom at/below which the long-tail hub names are HIDDEN (only the
 * top-K principal names show). Above it the graph is zoomed in enough that every
 * gated hub name fits, so all are revealed. The renderer maps world to screen as
 * `screen = (world − camera) · zoom`, so zoom > 1 means a node's world unit spans
 * more than one device pixel (a deliberate zoom-in past the default fit).
 */
export const LABEL_ZOOM_THRESHOLD = 1;

/**
 * Choose which god-class hub boxes keep their in-box NAME at the given zoom.
 * Pure + deterministic (degree desc, ties by node index asc) so the studio and
 * the unit tests agree. Above `zoomThreshold` every hub is kept; at/below it
 * only the top-K by degree.
 * @param {Array<{index:number, degree:number}>} hubs labelled hub candidates
 * @param {number} zoom current world→screen zoom
 * @param {{k?:number, zoomThreshold?:number}} [opts]
 * @returns {Set<number>} the node indices whose name should stay visible
 */
export function selectPrincipalHubLabels(
  hubs,
  zoom,
  { k = MAX_PRINCIPAL_CHARACTER_LABELS, zoomThreshold = LABEL_ZOOM_THRESHOLD } = {},
) {
  const keep = new Set();
  if (!Array.isArray(hubs) || hubs.length === 0) return keep;
  // Zoomed in past the threshold → reveal every gated hub name.
  if (Number.isFinite(zoom) && zoom > zoomThreshold) {
    for (const hub of hubs) keep.add(hub.index);
    return keep;
  }
  // Zoomed out (the default fit) → only the K highest-degree principal hubs.
  const ranked = [...hubs].sort((a, b) => b.degree - a.degree || a.index - b.index);
  const limit = Math.min(Number.isFinite(k) && k > 0 ? k : 0, ranked.length);
  for (let i = 0; i < limit; i += 1) keep.add(ranked[i].index);
  return keep;
}

/**
 * Undirected degree per node INDEX from a render-graph's flat edge index buffer
 * (`edges` = [src0, tgt0, src1, tgt1, …]). Mirrors @sentropic/graph styles.ts
 * computeNodeDegrees so the LOD ranks hubs by the SAME degree the label gate did.
 * @param {{nodeIds?:ArrayLike<unknown>, edges?:ArrayLike<number>}} graph
 * @returns {Uint32Array} degree by node index
 */
function computeDegreesByIndex(graph) {
  const count = graph?.nodeIds?.length ?? 0;
  const degrees = new Uint32Array(count);
  const edges = graph?.edges ?? [];
  for (let i = 0; i < edges.length; i += 1) {
    const endpoint = edges[i];
    if (Number.isInteger(endpoint) && endpoint >= 0 && endpoint < count) {
      degrees[endpoint] += 1;
    }
  }
  return degrees;
}

function cloneStyle(style) {
  return {
    nodeSizes: new Float32Array(style.nodeSizes),
    nodeColors: new Uint8Array(style.nodeColors),
    nodeShapes: new Uint8Array(style.nodeShapes),
    haloMask: style.haloMask ? new Uint8Array(style.haloMask) : undefined,
    haloColor: style.haloColor ? new Uint8Array(style.haloColor) : undefined,
    // Carry the legacy box labels through dim / merge re-styling so box glyphs
    // keep their text when a node is selected, hovered, or focused.
    nodeLabels: style.nodeLabels ? [...style.nodeLabels] : undefined,
    // Shape variants (hollow / bold) survive dim / merge re-styling too.
    nodeFills: style.nodeFills ? new Uint8Array(style.nodeFills) : undefined,
    nodeBorders: style.nodeBorders ? new Uint8Array(style.nodeBorders) : undefined,
    edgeWidths: new Float32Array(style.edgeWidths),
    edgeColors: new Uint8Array(style.edgeColors),
    edgeDash: new Uint8Array(style.edgeDash),
    edgeCurvatures: new Float32Array(style.edgeCurvatures),
    edgeHaloMask: style.edgeHaloMask ? new Uint8Array(style.edgeHaloMask) : undefined,
    // The along-edge alpha SHAPE is a separate multiplier from edgeColors.a, so
    // it survives dim / hover / merge re-styling unchanged (those only scale the
    // base alpha). Clone it like the other per-edge buffers.
    edgeAlphaShape: style.edgeAlphaShape ? new Uint8Array(style.edgeAlphaShape) : undefined,
  };
}

export function buildConnectedDimStyle(payload, options = {}) {
  const graph = payload?.renderGraph;
  const sourceStyle = payload?.baseStyle ?? payload?.style;
  if (!graph || !sourceStyle) return payload?.style ?? null;

  const style = cloneStyle(sourceStyle);
  const selectedIds = new Set(options.selectedIds ?? []);
  const focusId = options.focusId ?? null;
  const hoveredNodeId = options.hoveredNodeId ?? null;
  const activeFocusIds = new Set([...selectedIds, focusId, hoveredNodeId].filter(Boolean));

  if (activeFocusIds.size === 0) return style;

  const neighbourSet = new Set(activeFocusIds);
  const edgeCount = graph.edges.length / 2;
  for (let e = 0; e < edgeCount; e++) {
    const srcIdx = graph.edges[e * 2];
    const tgtIdx = graph.edges[e * 2 + 1];
    const srcId = graph.nodeIds[srcIdx];
    const tgtId = graph.nodeIds[tgtIdx];
    if (activeFocusIds.has(srcId)) neighbourSet.add(tgtId);
    if (activeFocusIds.has(tgtId)) neighbourSet.add(srcId);
  }

  for (let i = 0; i < graph.nodeIds.length; i++) {
    const id = graph.nodeIds[i];
    if (!neighbourSet.has(id)) {
      style.nodeColors[i * 4 + 3] = DIM_ALPHA;
    }
  }

  const haloColor = resolveDsPrimaryColor();
  style.haloMask = new Uint8Array(graph.nodeIds.length);
  style.haloColor = new Uint8Array(haloColor);
  for (let i = 0; i < graph.nodeIds.length; i++) {
    if (neighbourSet.has(graph.nodeIds[i])) style.haloMask[i] = 1;
  }

  style.edgeHaloMask = new Uint8Array(edgeCount);

  for (let e = 0; e < edgeCount; e++) {
    const srcIdx = graph.edges[e * 2];
    const tgtIdx = graph.edges[e * 2 + 1];
    const srcId = graph.nodeIds[srcIdx];
    const tgtId = graph.nodeIds[tgtIdx];
    const isIncident = activeFocusIds.has(srcId) || activeFocusIds.has(tgtId);
    if (isIncident) {
      style.edgeHaloMask[e] = 1;
      const offset = e * 4;
      style.edgeWidths[e] = (style.edgeWidths[e] ?? 1) * EDGE_HALO_WIDTH_SCALE;
      for (let channel = 0; channel < 3; channel += 1) {
        const existing = style.edgeColors[offset + channel] ?? 0;
        style.edgeColors[offset + channel] = Math.round(
          existing * (1 - EDGE_HALO_TINT) + haloColor[channel] * EDGE_HALO_TINT,
        );
      }
      style.edgeColors[offset + 3] = Math.max(style.edgeColors[offset + 3] ?? 0, EDGE_HALO_ALPHA);
    } else {
      style.edgeColors[e * 4 + 3] = EDGE_DIM_ALPHA;
    }
  }

  return style;
}

export function buildGraphRendererPayload(scene, options = {}) {
  const selectedIds = new Set(options.selectedIds ?? []);
  const focusId = options.focusId ?? null;
  const hoveredNodeId = options.hoveredNodeId ?? null;
  const requestedRadius = options.nodeRadius ?? 3;
  // BUG-1: max DRAWN chars for in-box labels (recon focal pair). Default keeps
  // long names from overflowing; a view can override via options.labelMaxChars.
  const labelMaxChars = Number.isFinite(options.labelMaxChars)
    ? options.labelMaxChars
    : DEFAULT_LABEL_MAX_CHARS;
  // Current world→screen zoom drives the principal-character label LOD (top-K
  // names at zoom-out). Undefined ⇒ treat as zoomed OUT so the default fit view
  // already shows only the principal cast (see selectPrincipalHubLabels).
  const labelZoom = Number.isFinite(options.zoom) ? options.zoom : 0;
  // codeflow-parity Lot 4 — Color-by (R4): Folder keys the categorical colour on
  // community/container (node.group, the CURRENT default); Layer keys it on the
  // typed layer (node_type). Both resolve through the SAME palette (colorForGroup)
  // so the legend swatch and node fill stay one source of truth. Default = Folder,
  // so an unset option is byte-identical to before this lot.
  const colorBy =
    options.colorBy === COLOR_BY_LAYER
      ? COLOR_BY_LAYER
      : options.colorBy === COLOR_BY_CHURN
        ? COLOR_BY_CHURN
        : COLOR_BY_FOLDER;
  // codeflow-parity Lot 4 — Curved links (R3): ON ⇒ DEFAULT_EDGE_CURVATURE (the
  // current behaviour), OFF ⇒ 0 (straight). Default ON so an unset option is
  // byte-identical to before this lot. It is a per-edge RENDER attribute — the
  // caller re-renders live with no layout recompute.
  const edgeCurvature = options.curvedLinks === false ? 0 : DEFAULT_EDGE_CURVATURE;
  // Configurable edge-transparency: the along-edge fade MODE (default dense) and
  // the flat BASE opacity (default 0.5). The mode drives a per-edge alpha SHAPE
  // (a separate multiplier); the opacity sets the uniform base alpha. An unset
  // option is byte-identical to the historical ~0.5 base + dense falloff.
  const edgeAlphaMode = EDGE_ALPHA_MODES.includes(options.edgeAlphaMode)
    ? options.edgeAlphaMode
    : EDGE_ALPHA_DENSE;
  const edgeOpacity = Number.isFinite(options.edgeOpacity)
    ? clampUnit(options.edgeOpacity)
    : DEFAULT_EDGE_OPACITY;
  const edgeBaseAlpha = Math.round(255 * edgeOpacity);
  const sceneNodes = scene?.nodes ?? [];
  const sceneEdges = scene?.edges ?? [];
  // One degree pass serves both churn fallback and density-graded edge alpha.
  const degreeById = nodeDegreeFallback(sceneNodes, sceneEdges);
  const churnById =
    colorBy === COLOR_BY_CHURN ? normalizedChurnById(sceneNodes, sceneEdges, degreeById) : null;

  // Shrink the BASE radius on dense graphs while keeping the per-node degree
  // spread (sqrt(weight)) intact. nodeRadius is the effective base used both for
  // the per-node sizes and the style buffer fallback size.
  const nodeRadius = requestedRadius * densityScale(sceneNodes.length);

  const nodes = sceneNodes.map((node, index) => {
    const position = positionForNode(node, index, sceneNodes.length);
    const focused = node.id === focusId;
    const selected = focused || selectedIds.has(node.id);
    const nodeType = node.node_type ?? node.type ?? null;
    // Color-by (R4/R5): Layer keys the categorical colour on the typed layer,
    // Folder (default) on community/container, Churn on a continuous activity heat.
    // Selection/focus preserve that node colour; size and connected-dim styling
    // provide the emphasis cues instead.
    const colorKey = colorBy === COLOR_BY_LAYER ? nodeType : node.group;
    const baseColor =
      colorBy === COLOR_BY_CHURN ? colorForChurn(churnById?.get(node.id) ?? 0) : colorForGroup(colorKey);
    return {
      id: node.id,
      label: node.label ?? node.id,
      node_type: nodeType,
      x: position.x,
      y: position.y,
      fixed: position.fixed,
      shape: rendererShapeForNode(node),
      // Shape variants (ontology visual_encoding): hollow / bold pass through
      // to the style buffers; absent = solid / normal (back-compatible).
      fill: node.fill,
      border: node.border,
      // Recon focal-pair override (ReconciliationView): always draw this box
      // node's label in-box, bypassing the degree/god-class label gate.
      forceBoxLabel: node.forceBoxLabel === true,
      size: nodeSize(node, nodeRadius, selected, focused),
      color: baseColor,
    };
  });

  const edges = sceneEdges.map((edge) => {
    return {
      source: edge.source,
      target: edge.target,
      relation: edge.relation,
      label: edge.relation,
      weak: edge.weak === true,
      emphasis: edge.emphasis === true,
      width: edgeWidth(edge),
      // Uniform slate hue AND uniform base alpha (edgeOpacity). The density
      // falloff now lives in the per-edge alpha SHAPE (edgeAlphaShape, a separate
      // multiplier), so dim/hover/merge — which scale this base alpha — compose
      // with the fade automatically. Weak edges stay this colour, distinguished
      // by the dotted dash.
      color: [...EDGE_COLOR_RGB, edgeBaseAlpha],
      dash: edge.dash ?? (edge.weak ? "dotted" : "solid"),
      curvature: finite(edge.curvature) ? edge.curvature : edgeCurvature,
    };
  });

  const input = { nodes, edges };
  const renderGraph = buildRenderGraphBuffers(input);
  const baseStyle = buildStyleBuffers(input, renderGraph, {
    node: { size: nodeRadius },
    edge: { width: 1, color: [...EDGE_COLOR_RGB, edgeBaseAlpha], dash: "solid", curvature: edgeCurvature },
  });
  // Along-edge alpha SHAPE (configurable edge-transparency). Parallel to
  // renderGraph.edges; a separate multiplier of the base alpha the WebGL edge
  // shader applies. Carried through cloneStyle so dim/hover/merge keep it.
  baseStyle.edgeAlphaShape = buildEdgeAlphaShape(renderGraph, degreeById, edgeAlphaMode);
  const nodeIndexById = new Map(nodes.map((node, index) => [node.id, index]));

  // Recon focal-pair parity: nodes flagged `forceBoxLabel` (the two entities
  // under comparison in the reconciliation view) ALWAYS carry their in-box
  // label, overriding the degree/god-class label gate applied inside
  // buildStyleBuffers — both twins must read as identical labelled rounded
  // boxes. The renderer sizes a box to its label text, so forcing the same
  // label path on both yields the same glyph. View-scoped: only the recon
  // view sets the flag; main-view scenes never do, so the god-class gate is
  // untouched there. Applied to baseStyle BEFORE buildConnectedDimStyle so
  // the label survives dim / merge re-styling (cloneStyle copies nodeLabels).
  // BUG-1 (regression fix): the renderer sizes a box glyph to its DRAWN label
  // width, so a long entity / chapter name (e.g. "Part I, Chapter I: Being a
  // Reprint of the Reminiscences of John H. Watson, M.D., …") overflows far past
  // the box — on the MAIN graph, not just the recon focal slot. Truncation must
  // cover EVERY box node, not only the `forceBoxLabel` recon pair. We truncate
  // the SOURCE label (never an already-clipped string, so no double ellipsis);
  // the full name stays on node.label for the hover tooltip + recon rail/detail.
  if (baseStyle.nodeLabels) {
    for (const node of nodes) {
      if (!isBoxShape(node.shape)) continue;
      const index = nodeIndexById.get(node.id);
      if (!Number.isInteger(index)) continue;
      const forced = node.forceBoxLabel === true;
      const existing = baseStyle.nodeLabels[index];
      const hasExisting = typeof existing === "string" && existing.length > 0;
      // forceBoxLabel nodes always get a label; main-graph box nodes only carry
      // one when buildStyleBuffers' label gate already set it. Skip the rest.
      if (!forced && !hasExisting) continue;
      const source = forced ? (node.label || String(node.id)) : existing;
      baseStyle.nodeLabels[index] = truncateLabel(source, labelMaxChars);
    }
  }

  // Principal-character label LOD: when zoomed out keep only the top-K
  // highest-degree god-class hub NAMES (declutter the wall of names a dense
  // corpus produces); reveal the long tail once zoomed past LABEL_ZOOM_THRESHOLD.
  // forceBoxLabel (recon focal pair) is EXEMPT — those twins always read as
  // identical labelled boxes. The hub glyph is untouched; only the in-box name
  // is cleared, and node.label keeps the full name for the hover tooltip.
  if (baseStyle.nodeLabels) {
    const degreesByIndex = computeDegreesByIndex(renderGraph);
    const hubs = [];
    for (const node of nodes) {
      if (node.forceBoxLabel === true) continue;
      const index = nodeIndexById.get(node.id);
      if (!Number.isInteger(index)) continue;
      const label = baseStyle.nodeLabels[index];
      if (typeof label === "string" && label.length > 0) {
        hubs.push({ index, degree: degreesByIndex[index] ?? 0 });
      }
    }
    if (hubs.length > 0) {
      const keep = selectPrincipalHubLabels(hubs, labelZoom);
      for (const hub of hubs) {
        if (!keep.has(hub.index)) baseStyle.nodeLabels[hub.index] = "";
      }
    }
  }
  const renderedEdges = Array.from(renderGraph.edgeInputIndices ?? [], (inputIndex) => edges[inputIndex]);

  const payload = {
    renderGraph,
    baseStyle,
    style: baseStyle,
    edges: renderedEdges,
    nodeById: new Map(nodes.map((node) => [node.id, node])),
    nodeIndexById,
    stats: {
      nodeCount: renderGraph.nodeIds.length,
      edgeCount: renderGraph.edges.length / 2,
      droppedEdgeCount: renderGraph.droppedEdges,
    },
  };

  payload.style = buildConnectedDimStyle(payload, { selectedIds, focusId, hoveredNodeId });
  return payload;
}

export function interpolateMergePositions(payload, mergePair, progress) {
  const graph = payload?.renderGraph;
  if (!graph || !mergePair?.from || !mergePair?.into) return null;

  const nodeIndexById =
    payload.nodeIndexById ?? new Map((graph.nodeIds ?? []).map((id, index) => [id, index]));
  const fromIndex = nodeIndexById.get(mergePair.from);
  const intoIndex = nodeIndexById.get(mergePair.into);
  if (!Number.isInteger(fromIndex) || !Number.isInteger(intoIndex)) return null;

  const positions = new Float32Array(graph.positions);
  const fromOffset = fromIndex * 2;
  const intoOffset = intoIndex * 2;
  const t = clampUnit(progress);
  const fromX = graph.positions[fromOffset] ?? 0;
  const fromY = graph.positions[fromOffset + 1] ?? 0;
  const intoX = graph.positions[intoOffset] ?? 0;
  const intoY = graph.positions[intoOffset + 1] ?? 0;

  positions[fromOffset] = fromX + (intoX - fromX) * t;
  positions[fromOffset + 1] = fromY + (intoY - fromY) * t;

  return positions;
}

// ---------------------------------------------------------------------------
// Layout switcher seam (codeflow-parity Lot 1). The studio does not otherwise
// consume the @sentropic/graph layout registry; these helpers are the ONE seam
// that resolves a named layout into a node-order-keyed position buffer and
// morphs the on-screen buffer toward it. Every registered layout returns a
// `Float32Array` of `2 · nodeCount` floats PARALLEL to `graph.nodeIds`, so a
// cross-layout tween is a trivial per-index lerp between two static buffers —
// no correspondence problem (see SPEC_STUDIO_GRAPH_UX_CODEFLOW_PARITY §2.6).
// ---------------------------------------------------------------------------

/** Layout mode id — force-directed (the default baked positions). */
export const LAYOUT_MODE_FORCE = "force";
/** Layout mode id — typed swimlanes (registered `typed-layer`, ≈ "Layers"). */
export const LAYOUT_MODE_LAYERS = "layers";
/** Layout mode id — radial concentric rings (registered `radial`). */
export const LAYOUT_MODE_RADIAL = "radial";
/** Layout mode id — regular grid (registered `grid`). */
export const LAYOUT_MODE_GRID = "grid";
/** Layout mode id — metro lanes (registered `metro`; MVP, orthogonal edges deferred). */
export const LAYOUT_MODE_METRO = "metro";

/**
 * The layout modes exposed by the studio switcher (Lot 1 = Force + Layers; Lot 2
 * adds Radial + Grid on the already-registered engines). `registryId` is the id
 * passed to {@link resolveLayout}; Force has none because its target is the
 * CACHED initial force positions, not a (cold) registry re-solve (Lot 1 does not
 * re-solve force). Radial and Grid are pure, deterministic O(n[+e]) engines and
 * morph for free through the same all-node tween (index-parallel buffers, §2.6).
 */
export const LAYOUT_MODES = [
  { id: LAYOUT_MODE_FORCE, label: "Force", registryId: DEFAULT_LAYOUT_ID },
  { id: LAYOUT_MODE_RADIAL, label: "Radial", registryId: RADIAL_LAYOUT_ID },
  { id: LAYOUT_MODE_LAYERS, label: "Layers", registryId: TYPED_LAYER_LAYOUT_ID },
  { id: LAYOUT_MODE_GRID, label: "Grid", registryId: GRID_LAYOUT_ID },
  { id: LAYOUT_MODE_METRO, label: "Metro", registryId: METRO_LAYOUT_ID },
];

/**
 * Node-order-keyed per-node TYPE labels for a built payload (parallel to
 * `payload.renderGraph.nodeIds`). Read from the payload's node objects
 * (`node_type`), so the typed-layer layout bands the SAME nodes the canvas
 * drew. A missing node → `null` (the untyped lane).
 * @param {object} payload  a buildGraphRendererPayload result
 * @returns {(string|null)[]}
 */
export function nodeTypesForPayload(payload) {
  const graph = payload?.renderGraph;
  const ids = graph?.nodeIds ?? [];
  const types = new Array(ids.length);
  for (let i = 0; i < ids.length; i += 1) {
    const node = payload?.nodeById?.get(ids[i]);
    types[i] = node?.node_type ?? null;
  }
  return types;
}

/**
 * Resolve a layout MODE into a fresh node-order-keyed position buffer
 * (`2 · nodeCount` floats) for the payload's render graph — the morph TARGET
 * (`bufB`). Never throws: an unknown mode / missing payload degrades to the
 * force passthrough.
 *
 *   • `"layers"` → the registered `typed-layer` swimlane layout, banded by the
 *     payload's per-node types.
 *   • `"radial"` → the registered `radial` layout (highest-degree hub at the
 *     centre, BFS levels on concentric rings). Pure O(n+e) from the graph.
 *   • `"grid"`   → the registered `grid` layout (regular `ceil(√n)` grid centred
 *     on the origin, node-id order). Pure O(n) from the node count.
 *   • `"force"`  → the CACHED initial force positions (`forceBuffer`) — Lot 1
 *     does NOT cold re-solve force (warm-started re-solve is Lot 3). When no
 *     cached buffer is supplied it falls back to the registry force passthrough
 *     (a copy of the CURRENT positions).
 *
 * @param {object} payload  a buildGraphRendererPayload result
 * @param {string} mode     a LAYOUT_MODES id
 * @param {{ forceBuffer?: Float32Array|null }} [opts]
 * @returns {Float32Array|null}
 */
export function computeLayoutBuffer(payload, mode, { forceBuffer = null } = {}) {
  const graph = payload?.renderGraph;
  if (!graph) return null;
  const floatCount = (graph.nodeIds?.length ?? 0) * 2;

  if (mode === LAYOUT_MODE_LAYERS) {
    const nodeTypes = nodeTypesForPayload(payload);
    return resolveLayout(TYPED_LAYER_LAYOUT_ID)(graph, { nodeTypes });
  }

  if (mode === LAYOUT_MODE_RADIAL) {
    return resolveLayout(RADIAL_LAYOUT_ID)(graph, { nodeTypes: nodeTypesForPayload(payload) });
  }

  if (mode === LAYOUT_MODE_GRID) {
    return resolveLayout(GRID_LAYOUT_ID)(graph, { nodeTypes: nodeTypesForPayload(payload) });
  }

  if (mode === LAYOUT_MODE_METRO) {
    return resolveLayout(METRO_LAYOUT_ID)(graph, { nodeTypes: nodeTypesForPayload(payload) });
  }

  // Force (default): the cached pristine force positions when we have them.
  if (forceBuffer && forceBuffer.length === floatCount) {
    return new Float32Array(forceBuffer);
  }
  // No cache → passthrough a copy of the current baked positions.
  return resolveLayout(DEFAULT_LAYOUT_ID)(graph);
}

/**
 * ALL-NODE layout morph — the general form of {@link interpolateMergePositions}.
 * Linearly interpolates EVERY one of the `2 · nodeCount` floats between two
 * index-parallel position buffers: `out[i] = a[i] + (b[i] − a[i]) · t`. Edges
 * follow for free (they are re-derived from node positions each frame). `t` is
 * clamped to [0, 1]; the CALLER applies any easing to `t` before calling (so
 * `t = 0.5` is the exact midpoint — testable, deterministic). An optional `out`
 * buffer is reused when large enough (rAF loops reuse one allocation).
 *
 * @param {Float32Array} bufA  start buffer (2·n floats)
 * @param {Float32Array} bufB  target buffer (2·n floats, same length as bufA)
 * @param {number} t           progress in [0, 1] (already eased by the caller)
 * @param {Float32Array} [out] optional reusable output buffer
 * @returns {Float32Array|null} the interpolated buffer, or null on bad input
 */
export function morphPositions(bufA, bufB, t, out = null) {
  if (!bufA || !bufB) return null;
  const len = Math.min(bufA.length, bufB.length);
  const result = out && out.length >= len ? out : new Float32Array(len);
  const progress = clampUnit(t);
  for (let i = 0; i < len; i += 1) {
    const a = bufA[i] ?? 0;
    const b = bufB[i] ?? 0;
    result[i] = a + (b - a) * progress;
  }
  return result;
}

/* ===========================================================================
 * Collapse/expand GROUP-transition PURE cores (redesign spec §3).
 *
 * These are the deterministic, DOM-free maths of the animation extracted from
 * GraphCanvas so they are unit-testable (jsdom has no WebGL, so the component's
 * rAF/renderer wiring can only be source-asserted). The .svelte component owns
 * the reactive flags, the rAF loop, and the renderer calls; it delegates the
 * position bookkeeping to the three helpers below.
 * ======================================================================== */

// ~137.5° in radians — the golden angle. Successive multiples spread points
// evenly with no two ever landing on the same ray, giving the sunflower/
// phyllotaxis fan used for expand when there is no cached prior constellation.
export const GROUP_FAN_GOLDEN_ANGLE = 2.399963229728653;

/**
 * Resolve which node INDICES fold (grouped by anchor) and each group's on-screen
 * anchor position, against a given position buffer. The anchor rule (spec §3.4
 * step 2): the group node's OWN current position when it is on screen (its id is
 * in the payload), else the CENTROID of the folding members' current positions.
 * Absent children (ids not in the payload) are skipped. Returns null when NONE of
 * the anchor children resolve (nothing to animate → the caller carries-swaps).
 *
 * Pure: no reference to the component or the renderer. The caller passes the
 * live position buffer (currentLayoutBuffer — live-morph aware).
 *
 * @param {object} args
 * @param {string[]} args.nodeIds                node ids in render order.
 * @param {ArrayLike<number>} args.positions     2·n position floats (index-parallel).
 * @param {Map<string,string>} args.anchors      foldedChildId → groupNodeId.
 * @param {Map<string,number>} [args.nodeIndexById]  id → index (derived if absent).
 * @returns {{ foldingSet: Set<number>, groupMembers: Map<string, number[]>,
 *   anchorPosByGroup: Map<string, {x:number,y:number}> } | null}
 */
export function resolveGroupFolds({ nodeIds, positions, anchors, nodeIndexById } = {}) {
  if (!nodeIds?.length || !positions || !(anchors instanceof Map) || anchors.size === 0) {
    return null;
  }
  const idx = nodeIndexById instanceof Map ? nodeIndexById : new Map(nodeIds.map((id, i) => [id, i]));

  const foldingSet = new Set();
  const groupMembers = new Map(); // groupNodeId -> [nodeIndex]
  for (const [childId, groupId] of anchors) {
    const i = idx.get(childId);
    if (!Number.isInteger(i)) continue;
    foldingSet.add(i);
    let members = groupMembers.get(groupId);
    if (!members) {
      members = [];
      groupMembers.set(groupId, members);
    }
    members.push(i);
  }
  if (foldingSet.size === 0) return null;

  const anchorPosByGroup = new Map();
  for (const [groupId, members] of groupMembers) {
    const gi = idx.get(groupId);
    if (Number.isInteger(gi)) {
      // Group node is ON SCREEN (nested case: folding into a visible ancestor) →
      // its own position is the anchor.
      anchorPosByGroup.set(groupId, {
        x: positions[gi * 2] ?? 0,
        y: positions[gi * 2 + 1] ?? 0,
      });
    } else {
      // Usual case: the group node lives only in the OTHER scene → centroid of
      // the folding members' current positions.
      let sx = 0;
      let sy = 0;
      for (const i of members) {
        sx += positions[i * 2] ?? 0;
        sy += positions[i * 2 + 1] ?? 0;
      }
      anchorPosByGroup.set(groupId, { x: sx / members.length, y: sy / members.length });
    }
  }
  return { foldingSet, groupMembers, anchorPosByGroup };
}

/**
 * Carry a coordinate space across a scene swap (spec §3.2). Builds a NEW position
 * buffer for the NEW scene, resolving each node's position BY ID:
 *   1. an explicit placement (`placedPosById`) — group node at the fold centroid
 *      on collapse; revealed children stacked on the anchor on expand;
 *   2. else a carried-over position (`carriedPosById`) — shared nodes keep their
 *      exact on-screen spot;
 *   3. else, for a brand-new node with neither (e.g. a newly-injected visible
 *      class handle), the CENTROID of its already-placed graph neighbours over
 *      the NEW scene's edges;
 *   4. else the scene-baked position (the last-resort fallback, already in
 *      `positions`).
 *
 * Neighbour placement (step 3) reads ONLY step-1/2 results, so it is order-
 * independent (deterministic). Returns a fresh Float32Array; never mutates input.
 *
 * @param {object} args
 * @param {string[]} args.nodeIds               NEW-scene node ids in render order.
 * @param {ArrayLike<number>} args.positions    NEW-scene scene-baked 2·n floats.
 * @param {ArrayLike<number>} [args.edges]      NEW-scene edge INDEX pairs (2·e).
 * @param {Map<string,{x:number,y:number}>} [args.carriedPosById]  old on-screen pos.
 * @param {Map<string,{x:number,y:number}>} [args.placedPosById]   explicit new pos.
 * @returns {Float32Array|null}
 */
export function carryScenePositions({ nodeIds, positions, edges, carriedPosById, placedPosById } = {}) {
  if (!nodeIds?.length || !positions || positions.length < nodeIds.length * 2) return null;
  const carried = carriedPosById instanceof Map ? carriedPosById : new Map();
  const placed = placedPosById instanceof Map ? placedPosById : new Map();

  const out = new Float32Array(positions); // start from scene-baked (step 4).
  const isPlaced = new Array(nodeIds.length).fill(false);

  // Pass 1: explicit placement (step 1) then carried-over (step 2), by id.
  for (let i = 0; i < nodeIds.length; i += 1) {
    const id = nodeIds[i];
    const p = placed.get(id) ?? carried.get(id);
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
      out[i * 2] = p.x;
      out[i * 2 + 1] = p.y;
      isPlaced[i] = true;
    }
  }

  // Pass 2: brand-new nodes → neighbour centroid over the new edges (step 3);
  // else the scene-baked value already sitting in `out` (step 4).
  if (edges && edges.length) {
    const neighbours = new Map(); // index -> [neighbour indices]
    const addNeighbour = (a, b) => {
      let list = neighbours.get(a);
      if (!list) {
        list = [];
        neighbours.set(a, list);
      }
      list.push(b);
    };
    const edgeCount = Math.floor(edges.length / 2);
    for (let e = 0; e < edgeCount; e += 1) {
      const a = edges[e * 2];
      const b = edges[e * 2 + 1];
      if (!Number.isInteger(a) || !Number.isInteger(b)) continue;
      addNeighbour(a, b);
      addNeighbour(b, a);
    }
    for (let i = 0; i < nodeIds.length; i += 1) {
      if (isPlaced[i]) continue;
      const nbrs = neighbours.get(i);
      if (!nbrs || nbrs.length === 0) continue;
      let sx = 0;
      let sy = 0;
      let count = 0;
      for (const j of nbrs) {
        if (!isPlaced[j]) continue; // ONLY already-placed neighbours
        sx += out[j * 2];
        sy += out[j * 2 + 1];
        count += 1;
      }
      if (count > 0) {
        out[i * 2] = sx / count;
        out[i * 2 + 1] = sy / count;
      }
    }
  }
  return out;
}

/**
 * Deterministic golden-angle (sunflower) fan of `childIds` around `anchor`
 * (spec §3.5.2) — the expand fallback when there is no cached prior constellation.
 * Children are sorted by id, so the SAME id set always lands on the SAME slots.
 * Child j of m sits at angle `j · GROUP_FAN_GOLDEN_ANGLE`, radius
 * `min(spacing · √(j+1), cap)`.
 *
 * @param {object} args
 * @param {{x:number,y:number}} args.anchor    the fan centre.
 * @param {Iterable<string>} args.childIds     ids to place (sorted internally).
 * @param {number} args.spacing                radial spacing factor (world units).
 * @param {number} [args.cap=Infinity]         max radius (world units).
 * @returns {Map<string,{x:number,y:number}>}
 */
export function goldenAngleFan({ anchor, childIds, spacing, cap = Infinity } = {}) {
  const out = new Map();
  const ids = childIds ? [...childIds].sort() : [];
  const ax = Number.isFinite(anchor?.x) ? anchor.x : 0;
  const ay = Number.isFinite(anchor?.y) ? anchor.y : 0;
  const s = Number.isFinite(spacing) && spacing > 0 ? spacing : 1;
  const maxR = Number.isFinite(cap) ? cap : Infinity;
  for (let j = 0; j < ids.length; j += 1) {
    const angle = j * GROUP_FAN_GOLDEN_ANGLE;
    const radius = Math.min(s * Math.sqrt(j + 1), maxR);
    out.set(ids[j], { x: ax + radius * Math.cos(angle), y: ay + radius * Math.sin(angle) });
  }
  return out;
}

export function interpolateMergeStyle(payload, mergePair, progress) {
  const graph = payload?.renderGraph;
  if (!graph || !payload?.style || !mergePair?.from) return payload?.style ?? null;

  const nodeIndexById =
    payload.nodeIndexById ?? new Map((graph.nodeIds ?? []).map((id, index) => [id, index]));
  const fromIndex = nodeIndexById.get(mergePair.from);
  if (!Number.isInteger(fromIndex)) return payload.style;

  const style = cloneStyle(payload.style);
  const alphaScale = 1 - clampUnit(progress);
  const nodeAlphaOffset = fromIndex * 4 + 3;
  style.nodeColors[nodeAlphaOffset] = Math.round((style.nodeColors[nodeAlphaOffset] ?? 255) * alphaScale);

  const edgeCount = graph.edges.length / 2;
  for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex += 1) {
    const sourceIndex = graph.edges[edgeIndex * 2];
    const targetIndex = graph.edges[edgeIndex * 2 + 1];
    if (sourceIndex !== fromIndex && targetIndex !== fromIndex) continue;
    const alphaOffset = edgeIndex * 4 + 3;
    style.edgeColors[alphaOffset] = Math.round((style.edgeColors[alphaOffset] ?? 255) * alphaScale);
  }

  return style;
}

/**
 * The SET generalization of {@link interpolateMergeStyle} for the collapse/expand
 * group animation: fade (and optionally shrink) a whole SET of folding/revealing
 * nodes and their incident edges over the same rAF loop as the layout morph.
 *
 * Clones the payload style and, for every node index in `foldingIndices`, scales
 * its colour ALPHA by `alphaScale` and its drawn SIZE by `sizeScale`; every edge
 * touching a folding node has its base alpha scaled by `alphaScale` too, so an
 * edge fades with its endpoint. `alphaScale`/`sizeScale` are clamped to [0, 1].
 * Non-folding nodes/edges keep the base style byte-for-byte. Returns the base
 * style unchanged when there is nothing to fade.
 *
 * @param {object} payload  a buildGraphRendererPayload result
 * @param {Set<number>|Iterable<number>} foldingIndices  node indices to fade
 * @param {number} alphaScale  colour-alpha multiplier for folding nodes/edges
 * @param {number} [sizeScale=1]  size multiplier for folding nodes (shrink)
 * @returns {object|null} a cloned, faded style (or the base style on bad input)
 */
export function interpolateGroupFadeStyle(payload, foldingIndices, alphaScale, sizeScale = 1) {
  const graph = payload?.renderGraph;
  if (!graph || !payload?.style) return payload?.style ?? null;
  const set = foldingIndices instanceof Set ? foldingIndices : new Set(foldingIndices ?? []);
  if (set.size === 0) return payload.style;

  const style = cloneStyle(payload.style);
  const a = clampUnit(alphaScale);
  const s = clampUnit(sizeScale);
  for (const index of set) {
    if (!Number.isInteger(index) || index < 0) continue;
    const alphaOffset = index * 4 + 3;
    style.nodeColors[alphaOffset] = Math.round((style.nodeColors[alphaOffset] ?? 255) * a);
    style.nodeSizes[index] = (style.nodeSizes[index] ?? 4) * s;
  }

  const edgeCount = graph.edges.length / 2;
  for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex += 1) {
    const sourceIndex = graph.edges[edgeIndex * 2];
    const targetIndex = graph.edges[edgeIndex * 2 + 1];
    if (!set.has(sourceIndex) && !set.has(targetIndex)) continue;
    const alphaOffset = edgeIndex * 4 + 3;
    style.edgeColors[alphaOffset] = Math.round((style.edgeColors[alphaOffset] ?? 255) * a);
  }

  return style;
}

/**
 * Nearest node to (worldX, worldY) within the pick zone, returning the id, the
 * world-space distance to its centre, and its drawn world radius. The pick zone
 * is `max(maxDistance, radius)` so a generous grab still works, while callers
 * that need a TIGHT (on-glyph) test can compare `distance <= radius` themselves.
 * @returns {{ id: string, distance: number, radius: number } | null}
 */
export function findNearestNode(payload, worldX, worldY, maxDistance = 14) {
  const graph = payload?.renderGraph;
  if (!graph) return null;

  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestRadius = 0;
  for (let index = 0; index < graph.nodeIds.length; index += 1) {
    const offset = index * 2;
    const dx = (graph.positions[offset] ?? 0) - worldX;
    const dy = (graph.positions[offset + 1] ?? 0) - worldY;
    const distance = Math.hypot(dx, dy);
    const radius = payload.style.nodeSizes[index] ?? 4;
    const threshold = Math.max(maxDistance, radius);
    if (distance <= threshold && distance < bestDistance) {
      best = graph.nodeIds[index];
      bestDistance = distance;
      bestRadius = radius;
    }
  }

  return best === null ? null : { id: best, distance: bestDistance, radius: bestRadius };
}

export function findNearestNodeId(payload, worldX, worldY, maxDistance = 14) {
  return findNearestNode(payload, worldX, worldY, maxDistance)?.id ?? null;
}

function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= Number.EPSILON) return Math.hypot(px - x1, py - y1);

  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared));
  const x = x1 + dx * t;
  const y = y1 + dy * t;
  return Math.hypot(px - x, py - y);
}

function quadraticPoint(source, control, target, t) {
  const inv = 1 - t;
  return {
    x: inv * inv * source.x + 2 * inv * t * control.x + t * t * target.x,
    y: inv * inv * source.y + 2 * inv * t * control.y + t * t * target.y,
  };
}

function curveControlPoint(source, target, curvature) {
  const midX = (source.x + target.x) / 2;
  const midY = (source.y + target.y) / 2;
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  return {
    x: midX + (-dy / distance) * distance * curvature * EDGE_CURVE_FACTOR,
    y: midY + (dx / distance) * distance * curvature * EDGE_CURVE_FACTOR,
  };
}

function pointToQuadraticDistance(px, py, source, control, target) {
  let best = Number.POSITIVE_INFINITY;
  let previous = source;
  for (let step = 1; step <= 16; step += 1) {
    const current = quadraticPoint(source, control, target, step / 16);
    best = Math.min(best, pointToSegmentDistance(px, py, previous.x, previous.y, current.x, current.y));
    previous = current;
  }
  return best;
}

export function findNearestEdge(payload, worldX, worldY, maxDistance = 10, positions = null) {
  const graph = payload?.renderGraph;
  if (!graph || !payload?.style) return null;

  const currentPositions = positions ?? graph.positions;
  const edgeCount = graph.edges.length / 2;
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex += 1) {
    const sourceIndex = graph.edges[edgeIndex * 2];
    const targetIndex = graph.edges[edgeIndex * 2 + 1];
    const source = {
      x: currentPositions[sourceIndex * 2] ?? 0,
      y: currentPositions[sourceIndex * 2 + 1] ?? 0,
    };
    const target = {
      x: currentPositions[targetIndex * 2] ?? 0,
      y: currentPositions[targetIndex * 2 + 1] ?? 0,
    };
    const curvature = payload.style.edgeCurvatures[edgeIndex] ?? 0;
    const distance =
      curvature === 0
        ? pointToSegmentDistance(worldX, worldY, source.x, source.y, target.x, target.y)
        : pointToQuadraticDistance(worldX, worldY, source, curveControlPoint(source, target, curvature), target);
    const threshold = Math.max(maxDistance, (payload.style.edgeWidths[edgeIndex] ?? 1) * 1.5);

    if (distance <= threshold && distance < bestDistance) {
      const edge = payload.edges?.[edgeIndex] ?? null;
      bestDistance = distance;
      best = {
        index: edgeIndex,
        edge,
        distance,
        sourceLabel: payload.nodeById?.get(edge?.source)?.label ?? edge?.source ?? "",
        targetLabel: payload.nodeById?.get(edge?.target)?.label ?? edge?.target ?? "",
      };
    }
  }

  return best;
}
