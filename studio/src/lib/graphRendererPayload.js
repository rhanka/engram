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

const FOCUS_COLOR = "#ef4444";
const SELECTED_COLOR = "#2563eb";
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
const EDGE_COLOR = [...EDGE_COLOR_RGB, EDGE_BASE_ALPHA];
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

  for (let e = 0; e < edgeCount; e++) {
    const srcIdx = graph.edges[e * 2];
    const tgtIdx = graph.edges[e * 2 + 1];
    const srcId = graph.nodeIds[srcIdx];
    const tgtId = graph.nodeIds[tgtIdx];
    const isIncident = activeFocusIds.has(srcId) || activeFocusIds.has(tgtId);
    if (!isIncident) {
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
    // Selection/focus overrides still win.
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
      shape: node.shape ?? "dot",
      // Shape variants (ontology visual_encoding): hollow / bold pass through
      // to the style buffers; absent = solid / normal (back-compatible).
      fill: node.fill,
      border: node.border,
      // Recon focal-pair override (ReconciliationView): always draw this box
      // node's label in-box, bypassing the degree/god-class label gate.
      forceBoxLabel: node.forceBoxLabel === true,
      size: nodeSize(node, nodeRadius, selected, focused),
      color: focused ? FOCUS_COLOR : selected ? SELECTED_COLOR : baseColor,
    };
  });

  const edges = sceneEdges.map((edge) => {
    const endpointDegree = Math.max(
      degreeById.get(edge.source) ?? 0,
      degreeById.get(edge.target) ?? 0,
    );
    const alpha = edgeBaseAlphaForDegree(endpointDegree);
    return {
      source: edge.source,
      target: edge.target,
      relation: edge.relation,
      label: edge.relation,
      weak: edge.weak === true,
      emphasis: edge.emphasis === true,
      width: edgeWidth(edge),
      // Uniform slate hue for all edges; only the density alpha varies. Weak
      // edges stay this same colour and are distinguished by the dotted dash.
      color: [...EDGE_COLOR_RGB, alpha],
      dash: edge.dash ?? (edge.weak ? "dotted" : "solid"),
      curvature: finite(edge.curvature) ? edge.curvature : edgeCurvature,
    };
  });

  const input = { nodes, edges };
  const renderGraph = buildRenderGraphBuffers(input);
  const baseStyle = buildStyleBuffers(input, renderGraph, {
    node: { size: nodeRadius },
    edge: { width: 1, color: EDGE_COLOR, dash: "solid", curvature: edgeCurvature },
  });
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
