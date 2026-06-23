// Golden fixtures for the B1 golden harness.
//
// Phase-0 (PR #193, hardened #206) shipped a SMOKE SUBSET: one mixed scene +
// determinism / 3px-regression / DPR-zoom proofs. This file is the Phase-1
// EXPANSION (test-only, no renderer change): named fixtures that exercise the
// CURRENT canvas2d renderer across the inventory groups in
// .graphify/scratch/B1_WEBGL2_MIGRATION_PLAN_OPUS.md §1 —
//   per-type SHAPES (N1-N6), the labelled/empty/focal BOXES + #199 pixel-fit
//   (N7-N9, L1/L3), COMMUNITY colours (N14), NODE BORDERS (N10/N11), EDGES
//   (E1-E6/E12, styles/curve/dash/arrow), and SELECTION/highlight (N14/N16).
//
// Coordinates are WORLD coordinates. The camera maps them to the canvas at
// capture time (see cdp-harness.capture). All fixtures are deterministic — no
// randomness — so a same-fixture re-capture is byte-identical and the golden
// BASELINE is the current canvas2d renderer itself (A/B model, no stored PNGs).

// ---- renderer geometry constants (mirror src/renderer.ts + shape-geometry.ts)
// These are the SAME literals the canvas2d renderer draws with; the golden
// geometry-parity assertions compute expected device coordinates from them so a
// probe failure is unambiguously geometry/colour drift, not AA. Kept in sync
// with the renderer by the constants-parity test in golden-harness.test.ts.
export const STAR_INNER_RATIO = 0.42;
export const SQUARE_INSET_RATIO = 0.88;
export const BOX_BASE_HEIGHT_PX = 18;
export const BOX_MARGIN_RATIO = 5 / 22;
export const BOX_FONT_RATIO = 12 / 22;
export const BOX_CORNER_RATIO = 1 / 4;
export const BOX_MAX_WIDTH_RATIO = 10;
export const BOX_EMPTY_RATIO = 10 / 22;
/** Translucent white box / hollow interior: rgba(255,255,255,0.5) -> a8=128. */
export const BOX_FILL = [255, 255, 255, 128];
/** Dark box label text (#0f172a slate-900). */
export const BOX_TEXT_RGB = [15, 23, 42];

/**
 * Polygon vertices (relative to centre, radius `r`) for a shape CODE, matching
 * shape-geometry.ts shapePolygonPoints EXACTLY (same start angles + ratios).
 * Returns null for circle (0) and box (5). Used to aim geometry probes at a
 * KNOWN drawn vertex / interior point of each polygon.
 */
export function shapePolygonPoints(code, r) {
  if (code === 1) return [[0, -r], [r, 0], [0, r], [-r, 0]]; // diamond
  if (code === 2) {
    const inner = r * STAR_INNER_RATIO;
    const pts = [];
    for (let i = 0; i < 10; i += 1) {
      const a = (i * Math.PI) / 5 - Math.PI / 2;
      const rad = i % 2 === 0 ? r : inner;
      pts.push([Math.cos(a) * rad, Math.sin(a) * rad]);
    }
    return pts;
  }
  if (code === 3) {
    const pts = [];
    for (let i = 0; i < 6; i += 1) {
      const a = (i * Math.PI) / 3 - Math.PI / 6;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return pts;
  }
  if (code === 4) {
    const h = r * SQUARE_INSET_RATIO;
    return [[-h, -h], [h, -h], [h, h], [-h, h]];
  }
  if (code === 6) {
    const pts = [];
    for (let i = 0; i < 3; i += 1) {
      const a = (i * 2 * Math.PI) / 3 - Math.PI / 2;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return pts;
  }
  return null;
}

export const SHAPE_CODE = {
  dot: 0,
  circle: 0,
  diamond: 1,
  star: 2,
  hexagon: 3,
  square: 4,
  box: 5,
  roundedbox: 5,
  triangle: 6,
};

/**
 * The Phase-0 base smoke fixture (UNCHANGED — kept so the original smoke proofs
 * keep their reference): a few shapes + a styled edge.
 */
export const baseFixture = {
  nodes: [
    { id: "circle", x: -60, y: -40, size: 14, color: "#d62728", shape: "circle" },
    { id: "diamond", x: 60, y: -40, size: 12, color: "#1f77b4", shape: "diamond" },
    { id: "hexagon", x: -60, y: 40, size: 12, color: "#2ca02c", shape: "hexagon" },
    { id: "box", x: 60, y: 40, size: 11, color: "#9467bd", shape: "box", label: "Work" },
  ],
  edges: [
    { source: "circle", target: "diamond", width: 3, color: "#3344aa", curvature: 0.2 },
    { source: "hexagon", target: "box", width: 2, color: "#777788", dash: "dashed" },
  ],
};

// ---------------------------------------------------------------------------
// GROUP 1.A — per-type SHAPES (N1 dot/circle, N2 diamond, N3 star, N4 square,
// N5 hexagon, N6 triangle). One isolated node per shape, well-separated, large
// enough that a center + a vertex probe land cleanly. The same colour on every
// shape so a probe failure is shape geometry, not colour.
// ---------------------------------------------------------------------------
const SHAPE_COLOR = "#2563eb"; // one strong colour for every shape glyph
export const shapeNode = (id, x, y, shape, size = 18) => ({
  id,
  x,
  y,
  size,
  color: SHAPE_COLOR,
  shape,
});
export const SHAPES_FIXTURE = {
  nodes: [
    shapeNode("dot", -110, -70, "dot"),
    shapeNode("diamond", 0, -70, "diamond"),
    shapeNode("star", 110, -70, "star"),
    shapeNode("hexagon", -110, 70, "hexagon"),
    shapeNode("square", 0, 70, "square"),
    shapeNode("triangle", 110, 70, "triangle"),
  ],
  edges: [],
};
/** Every shape colour, as an rgba probe target. */
export const SHAPES_COLOR_RGBA = [37, 99, 235, 255];

// ---------------------------------------------------------------------------
// GROUP 1.A (N7-N9) — BOXES: god-class Character labelled box, an empty
// (collapsed) box, and the recon FOCAL box (a labelled box on a dense scene).
// Box height is degree-independent (BOX_BASE_HEIGHT_PX), so size is irrelevant
// to the box rect — assertions read the box centre (text colour) + the
// translucent fill just inside a corner.
// ---------------------------------------------------------------------------
export const BOX_LABELLED_FIXTURE = {
  nodes: [
    { id: "char", x: 0, y: 0, size: 12, color: "#ef4444", shape: "box", label: "Sherlock" },
  ],
  edges: [],
};
export const BOX_EMPTY_FIXTURE = {
  nodes: [
    // No label -> collapses to BOX_EMPTY_RATIO × height square, no text.
    { id: "work", x: 0, y: 0, size: 12, color: "#9467bd", shape: "box" },
  ],
  edges: [],
};
// Recon focal pair: two labelled boxes side by side (the recon "focal" twins),
// each a degree-independent box. Different labels so each hugs its own text.
export const BOX_FOCAL_FIXTURE = {
  nodes: [
    { id: "focalA", x: -55, y: 0, size: 11, color: "#2563eb", shape: "box", label: "Holmes" },
    { id: "focalB", x: 55, y: 0, size: 11, color: "#2563eb", shape: "box", label: "Watson" },
  ],
  edges: [{ source: "focalA", target: "focalB", width: 3, color: "#94a3b8" }],
};

// #199 pixel-fit / glyph-aware ellipsis. A label far too long to hug within the
// BOX_MAX_WIDTH_RATIO ceiling MUST be pixel-clipped to fit with a single "…";
// a short label is untouched. We assert the box WIDTH stays within the cap
// (geometry parity) rather than matching exact glyph rasters (font-fragile).
export const BOX_LONG_LABEL_FIXTURE = {
  nodes: [
    {
      id: "long",
      x: 0,
      y: 0,
      size: 12,
      color: "#0ea5e9",
      shape: "box",
      label: "A preposterously long chapter title that overflows the layout entirely",
    },
  ],
  edges: [],
};
export const BOX_SHORT_LABEL_FIXTURE = {
  nodes: [{ id: "short", x: 0, y: 0, size: 12, color: "#0ea5e9", shape: "box", label: "Hi" }],
  edges: [],
};

// ---------------------------------------------------------------------------
// GROUP 1.A (N14) — COMMUNITY colours, single-source. Three pairs: within a
// pair both nodes carry the SAME group colour (must render IDENTICALLY at their
// centres); across pairs the colours DIFFER (must render distinctly). Proves
// the renderer is a faithful single-source colour consumer (the palette lives
// upstream; the renderer must reproduce whatever rgba it is handed).
// ---------------------------------------------------------------------------
export const COMMUNITY_COLORS = ["#e6194b", "#3cb44b", "#4363d8"];
export const COMMUNITY_FIXTURE = {
  nodes: [
    { id: "c0a", x: -100, y: -40, size: 14, color: COMMUNITY_COLORS[0], shape: "circle" },
    { id: "c0b", x: -100, y: 40, size: 14, color: COMMUNITY_COLORS[0], shape: "circle" },
    { id: "c1a", x: 0, y: -40, size: 14, color: COMMUNITY_COLORS[1], shape: "circle" },
    { id: "c1b", x: 0, y: 40, size: 14, color: COMMUNITY_COLORS[1], shape: "circle" },
    { id: "c2a", x: 100, y: -40, size: 14, color: COMMUNITY_COLORS[2], shape: "circle" },
    { id: "c2b", x: 100, y: 40, size: 14, color: COMMUNITY_COLORS[2], shape: "circle" },
  ],
  edges: [],
};

// ---------------------------------------------------------------------------
// GROUP 1.A (N10 hollow, N11 bold) — NODE BORDERS. Four circle variants of the
// SAME node colour: solid / hollow / solid-bold / hollow-bold. A hollow node's
// INTERIOR is fixed translucent white (alpha-independent), NOT the node colour
// — that is the subtle N10 contract we probe (centre ~ white-over-white, edge ~
// node colour). Bold thickens the border (N11).
// ---------------------------------------------------------------------------
const BORDER_COLOR = "#16a34a";
export const BORDERS_FIXTURE = {
  nodes: [
    { id: "solid", x: -90, y: 0, size: 20, color: BORDER_COLOR, shape: "circle", fill: "solid", border: "normal" },
    { id: "hollow", x: -30, y: 0, size: 20, color: BORDER_COLOR, shape: "circle", fill: "hollow", border: "normal" },
    { id: "solidBold", x: 30, y: 0, size: 20, color: BORDER_COLOR, shape: "circle", fill: "solid", border: "bold" },
    { id: "hollowBold", x: 90, y: 0, size: 20, color: BORDER_COLOR, shape: "circle", fill: "hollow", border: "bold" },
  ],
  edges: [],
};
export const BORDER_COLOR_RGBA = [22, 163, 74, 255];
// The solid node centre = node colour; a hollow node centre over a WHITE page =
// white (translucent white over white). These are the two N10 anchors.
export const SOLID_CENTER_RGBA = [22, 163, 74, 255];
export const HOLLOW_CENTER_RGBA = [255, 255, 255, 255];

// ---------------------------------------------------------------------------
// GROUP 1.B — EDGES (E1 thick, E2/E12 colour+alpha, E3 dash families, E4 curve,
// E6 arrow). A row of edge cases: a thick solid edge, the three dash families
// (dashed/dotted/long-dash), a curved edge, and the 255-vs-180 colour-alpha
// split (studio #94a3b8 -> a255 vs a no-style fallback -> a180). Endpoints are
// large circles so the edge clips to the border and the arrow sits on it.
// ---------------------------------------------------------------------------
const EP = (id, x, y) => ({ id, x, y, size: 8, color: "#cbd5e1", shape: "circle" });
export const EDGES_FIXTURE = {
  nodes: [
    EP("a0", -150, -80), EP("a1", 150, -80), // thick solid
    EP("b0", -150, -40), EP("b1", 150, -40), // dashed
    EP("c0", -150, 0), EP("c1", 150, 0), // dotted
    EP("d0", -150, 40), EP("d1", 150, 40), // long-dash
    EP("e0", -150, 80), EP("e1", 150, 80), // curved
  ],
  edges: [
    { source: "a0", target: "a1", width: 5, color: "#1d4ed8", dash: "solid" },
    { source: "b0", target: "b1", width: 2, color: "#dc2626", dash: "dashed" },
    { source: "c0", target: "c1", width: 2, color: "#16a34a", dash: "dotted" },
    { source: "d0", target: "d1", width: 2, color: "#9333ea", dash: "long-dash" },
    { source: "e0", target: "e1", width: 3, color: "#0891b2", curvature: 0.4 },
  ],
};
// Colour-alpha split: same RGB, but one edge is opaque (a255) and one is the
// renderer's no-style fallback alpha (a180). We feed the alpha explicitly via
// "#rrggbbaa" so the capture shows the honoured alpha along the segment.
export const EDGE_ALPHA_FIXTURE = {
  nodes: [
    EP("s0", -140, -30), EP("s1", 140, -30),
    EP("w0", -140, 30), EP("w1", 140, 30),
  ],
  edges: [
    { source: "s0", target: "s1", width: 6, color: "#3b82f6ff" }, // a255 (studio-style)
    { source: "w0", target: "w1", width: 6, color: "#3b82f6b4" }, // a180 (no-style fallback)
  ],
};

// ---------------------------------------------------------------------------
// GROUP — SELECTION / highlight. The renderer is a buffer consumer: selection
// is encoded UPSTREAM as the SELECTED colour (#2563eb) / FOCUS colour (#ef4444)
// in nodeColors and a size multiplier in nodeSizes. We exercise that contract
// directly: a base node, the same node "selected" (selected colour + ×1.45
// size), and the same node "focused" (focus colour). The renderer must render
// the centre as the encoded colour and the glyph at the multiplied size.
// ---------------------------------------------------------------------------
export const SELECT_MULTIPLIER = 1.45; // N16 ×1.45 (non-box)
const BASE_SIZE = 14;
export const SELECTION_FIXTURE = {
  nodes: [
    { id: "base", x: -90, y: 0, size: BASE_SIZE, color: "#64748b", shape: "circle" },
    { id: "selected", x: 0, y: 0, size: BASE_SIZE * SELECT_MULTIPLIER, color: "#2563eb", shape: "circle" },
    { id: "focused", x: 90, y: 0, size: BASE_SIZE, color: "#ef4444", shape: "circle" },
  ],
  edges: [],
};
export const SELECTED_RGBA = [37, 99, 235, 255];
export const FOCUS_RGBA = [239, 68, 68, 255];

/**
 * Deep-clone a fixture so a perturbation never mutates the shared base.
 */
export function cloneFixture(fixture) {
  return {
    nodes: fixture.nodes.map((n) => ({ ...n })),
    edges: fixture.edges.map((e) => ({ ...e })),
  };
}

/**
 * Return a copy of `fixture` with node `nodeId` moved by (dx, dy) WORLD units.
 * Used by the acceptance proof: a 3px move MUST be detected above tolerance
 * (proves the harness catches regressions).
 */
export function perturbNode(fixture, nodeId, dx, dy) {
  const next = cloneFixture(fixture);
  const node = next.nodes.find((n) => n.id === nodeId);
  if (!node) throw new Error(`perturbNode: no node "${nodeId}"`);
  node.x = (node.x ?? 0) + dx;
  node.y = (node.y ?? 0) + dy;
  return next;
}

/**
 * All named fixtures, for the determinism sweep (every fixture must re-capture
 * byte-identical — the floor the A/B golden model rests on).
 */
export const ALL_FIXTURES = {
  base: baseFixture,
  shapes: SHAPES_FIXTURE,
  boxLabelled: BOX_LABELLED_FIXTURE,
  boxEmpty: BOX_EMPTY_FIXTURE,
  boxFocal: BOX_FOCAL_FIXTURE,
  boxLong: BOX_LONG_LABEL_FIXTURE,
  boxShort: BOX_SHORT_LABEL_FIXTURE,
  community: COMMUNITY_FIXTURE,
  borders: BORDERS_FIXTURE,
  edges: EDGES_FIXTURE,
  edgeAlpha: EDGE_ALPHA_FIXTURE,
  selection: SELECTION_FIXTURE,
};

/**
 * The DPR x zoom capture matrix the harness supports.
 */
export const DPR_MATRIX = [1, 1.25, 2, 3];
export const ZOOM_MATRIX = [1, 2]; // at least 2 zooms (plan: >=2)

// ---------------------------------------------------------------------------
// B1 Phase 1 — per-shape-family golden fixtures (N1-N6). One labelled colour
// per family so a geometry probe at the node centre lands on a known colour.
// The box (shape 5) is NOT a Phase-1 GL shape (Canvas2D draws it) so it is not
// in this set. Edges omitted: Phase 1 gates SHAPES only.
// ---------------------------------------------------------------------------

/** Each Phase-1 shape family: a single centred node so a centre probe is exact. */
export const SHAPE_FAMILIES = [
  { name: "circle", shape: "circle", size: 16, color: "#d62728", rgb: [214, 39, 40] },
  { name: "diamond", shape: "diamond", size: 16, color: "#1f77b4", rgb: [31, 119, 180] },
  { name: "star", shape: "star", size: 18, color: "#ff7f0e", rgb: [255, 127, 14] },
  { name: "hexagon", shape: "hexagon", size: 16, color: "#2ca02c", rgb: [44, 160, 44] },
  { name: "square", shape: "square", size: 16, color: "#9467bd", rgb: [148, 103, 189] },
  { name: "triangle", shape: "triangle", size: 16, color: "#8c564b", rgb: [140, 86, 75] },
];

/** A single-node fixture for one shape family, centred at world origin. */
export function shapeFixture(family) {
  return {
    nodes: [{ id: family.name, x: 0, y: 0, size: family.size, color: family.color, shape: family.shape }],
    edges: [],
  };
}

/** GL-phase zoom matrix (>= 2 zooms per the plan). */
export const SHAPE_ZOOM_MATRIX = [1, 2.5];

// ---------------------------------------------------------------------------
// B1 Phase 2 — per-edge-case GL golden fixtures (E1-E6/E12-E14). Each fixture
// is ONE isolated edge (two circle endpoints) so a capture's drawn content is
// unambiguously that edge + its endpoints, and a presence/colour probe is
// exact. Endpoints are circles (NOT boxes) so the circular E5 clip applies; the
// box-rect clip is exercised by a dedicated box-endpoint fixture. The edge
// colour differs from every endpoint colour so an edge-colour probe never
// collides with a node colour. Coordinates are WORLD; the camera maps them.
// ---------------------------------------------------------------------------

/** A circle endpoint sized so the edge clearly clips to its border. */
const EDGE_EP = (id, x, y, size = 8) => ({ id, x, y, size, color: "#cbd5e1", shape: "circle" });

/** A single straight thick solid edge (E1 thick, E6 arrow, E14 round caps). */
export const EDGE_THICK_FIXTURE = {
  nodes: [EDGE_EP("t0", -120, 0), EDGE_EP("t1", 120, 0)],
  edges: [{ source: "t0", target: "t1", width: 6, color: "#1d4ed8", dash: "solid" }],
};
/** The dash families (E3): one fixture each so a presence probe is per-family. */
export const EDGE_DASHED_FIXTURE = {
  nodes: [EDGE_EP("d0", -120, 0), EDGE_EP("d1", 120, 0)],
  edges: [{ source: "d0", target: "d1", width: 3, color: "#dc2626", dash: "dashed" }],
};
export const EDGE_DOTTED_FIXTURE = {
  nodes: [EDGE_EP("o0", -120, 0), EDGE_EP("o1", 120, 0)],
  edges: [{ source: "o0", target: "o1", width: 3, color: "#16a34a", dash: "dotted" }],
};
export const EDGE_LONGDASH_FIXTURE = {
  nodes: [EDGE_EP("l0", -120, 0), EDGE_EP("l1", 120, 0)],
  edges: [{ source: "l0", target: "l1", width: 3, color: "#9333ea", dash: "long-dash" }],
};
/** A curved edge (E4 off-chord) — the curve bows away from the chord. */
export const EDGE_CURVED_FIXTURE = {
  nodes: [EDGE_EP("u0", -120, 0), EDGE_EP("u1", 120, 0)],
  edges: [{ source: "u0", target: "u1", width: 4, color: "#0891b2", curvature: 0.5 }],
};
/** Box endpoints — the E5 RECTANGLE clip (vs the circular clip above). */
export const EDGE_BOX_CLIP_FIXTURE = {
  nodes: [
    { id: "bx0", x: -120, y: 0, size: 11, color: "#2563eb", shape: "box", label: "Holmes" },
    { id: "bx1", x: 120, y: 0, size: 11, color: "#2563eb", shape: "box", label: "Watson" },
  ],
  edges: [{ source: "bx0", target: "bx1", width: 4, color: "#1d4ed8" }],
};
/** Overlapping endpoints (E13): the edge draws a raw segment and NO arrow. */
export const EDGE_OVERLAP_FIXTURE = {
  nodes: [EDGE_EP("v0", -6, 0, 30), EDGE_EP("v1", 6, 0, 30)],
  edges: [{ source: "v0", target: "v1", width: 3, color: "#dc2626" }],
};
/** The R4 combo: curved + thick + dashed + arrow + round-cap all at once. */
export const EDGE_COMBO_FIXTURE = {
  nodes: [EDGE_EP("k0", -120, -30), EDGE_EP("k1", 120, 30)],
  edges: [{ source: "k0", target: "k1", width: 5, color: "#7c3aed", dash: "dashed", curvature: 0.45 }],
};

/**
 * Edge GL fixtures, by name, for the per-edge pixel-diff sweep. Circle/box
 * endpoints only — box-clip's PIXEL parity is deferred to Phase 4 (the WebGL
 * canary does NOT draw the box GLYPH yet, so a box-endpoint capture would only
 * show the edge, not the box, and an extent diff is meaningless); the
 * box-rect-clip GEOMETRY is pinned by the layer-A `E5 box-rect clip` test.
 */
export const EDGE_GL_FIXTURES = [
  { name: "thick", fixture: EDGE_THICK_FIXTURE, rgb: [29, 78, 216], arrow: true, dashed: false },
  { name: "dashed", fixture: EDGE_DASHED_FIXTURE, rgb: [220, 38, 38], arrow: true, dashed: true },
  { name: "dotted", fixture: EDGE_DOTTED_FIXTURE, rgb: [22, 163, 74], arrow: true, dashed: true },
  { name: "long-dash", fixture: EDGE_LONGDASH_FIXTURE, rgb: [147, 51, 234], arrow: true, dashed: true },
  { name: "curved", fixture: EDGE_CURVED_FIXTURE, rgb: [8, 145, 178], arrow: true, dashed: false },
  { name: "overlap", fixture: EDGE_OVERLAP_FIXTURE, rgb: [220, 38, 38], arrow: false, dashed: false },
  { name: "combo", fixture: EDGE_COMBO_FIXTURE, rgb: [124, 58, 237], arrow: true, dashed: true },
];
