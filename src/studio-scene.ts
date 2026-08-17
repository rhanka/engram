/**
 * Build-time studio scene preprocessor (ÉTAPE 1 — additive, parity-only).
 *
 * `buildStudioScene` is a pure-TypeScript replica of the SPA scene adapter
 * `studio/src/lib/graphAdapter.js` → `buildScene(graph, { showWeakLinks })`.
 * It produces the exact same `{ nodes, edges, stats }` shape and values, so it
 * can be emitted at build time as a light `scene.json` (instead of the SPA
 * reconstructing it client-side from the full 5.8 MB `graph.json`).
 *
 * PARITY CONTRACT (must match graphAdapter.js byte-for-byte in field set and
 * values):
 *   node  -> { id, label, weight, shape, group?, type?, profile metadata?, x/y/fx/fy/fixed? }
 *   edge  -> { source, target, relation?, dash?, profile metadata?, weak? }
 *   stats -> { nodeCount, edgeCount, weakEdgeCount, communityCount }
 *
 * The helpers below are faithful 1:1 ports of the studio helpers
 * (shapeForType/TYPE_SHAPE, dashForRelation/REL_DASH, weightForDegree
 * normalised by maxDegree, computeDegrees, nodeGroup, nodeLabel, nodeType,
 * communityStats for the live community count). Keep them in lockstep with the
 * studio source until ÉTAPE 2 (client wiring) collapses the duplication.
 *
 * SHARED SCENE CONTRACT — temporal + layout + snapshot (additive, opt-in).
 * ------------------------------------------------------------------------
 * Prerequisite contract that unblocks the display-layout, DB-windowing and
 * time-oriented agent-stats streams. It is a PURE PASS-THROUGH: these fields
 * are CARRIED (allowlist + scene-level copy) but NOT consumed here — no
 * rendering, layout or query depends on them yet.
 *
 *   TEMPORAL (per node AND per edge, both optional):
 *     • `t`     — interval START, epoch milliseconds.
 *     • `t_end` — interval END, epoch milliseconds. OPTIONAL: ABSENT means the
 *                 element is open-ended (still current at query time); PRESENT
 *                 means a CLOSED end and MUST be >= `t`.
 *     Semantics: a CLOSED span [t, t_end]; membership in a time window is
 *     INCLUSIVE OVERLAP (an element is "in window [w0, w1]" iff
 *     t <= w1 && (t_end ?? t) >= w0). A point-in-time element sets
 *     `t_end === t` and matches a window containing that instant. This is the
 *     convention implemented by temporal-recall.ts and the store queryWindow,
 *     and stated by the agent-stats charter. The agreed source-of-truth
 *     representation is bigint epoch-ms; the JSON scene carries the value
 *     verbatim as a `number` (JSON has no bigint) — no coercion happens here.
 *
 *   SCENE-LEVEL META (optional, top of the scene object):
 *     • `layout_id`   — identity of the precomputed layout these x/y/z came from.
 *     • `layout_dims` — 2 | 3, the dimensionality of that layout.
 *     • `snapshot_id` — identity of the graph snapshot this scene was built from
 *                       (DB-windowing / cache key).
 *
 * BACK-COMPAT INVARIANT: every field above is OPTIONAL and only emitted WHEN
 * PRESENT on the input node / edge / graph. A graph WITHOUT these fields
 * produces a BYTE-IDENTICAL scene (no empty keys), so existing golden output
 * and the SPA parity (graphAdapter.js buildScene) are unaffected.
 */

import {
  closedTemporalBounds,
  closedTemporalProjectionMetadata,
  type TemporalProjectionMetadata,
} from "./temporal-interval.js";

// ---------------------------------------------------------------------------
// Input shapes (loose — we only read the fields the adapter reads).
// ---------------------------------------------------------------------------

export interface StudioSceneGraphNode {
  id: string;
  label?: unknown;
  title?: unknown;
  name?: unknown;
  node_type?: unknown;
  type?: unknown;
  kind?: unknown;
  file_type?: unknown;
  community?: unknown;
  community_name?: unknown;
  /** Shared scene contract — interval start, epoch-ms (see module header). */
  t?: number;
  /** Shared scene contract — interval end, epoch-ms (see module header). */
  t_end?: number;
  [key: string]: unknown;
}

export interface StudioSceneGraphEdge {
  source: string;
  target: string;
  relation?: unknown;
  confidence?: unknown;
  /** Shared scene contract — interval start, epoch-ms (see module header). */
  t?: number;
  /** Shared scene contract — interval end, epoch-ms (see module header). */
  t_end?: number;
  [key: string]: unknown;
}

export interface StudioSceneGraphLike {
  nodes?: StudioSceneGraphNode[];
  edges?: StudioSceneGraphEdge[];
  links?: StudioSceneGraphEdge[];
  /** Shared scene contract — precomputed layout identity (see module header). */
  layout_id?: string;
  /** Shared scene contract — layout dimensionality (2 or 3). */
  layout_dims?: 2 | 3;
  /** Shared scene contract — graph snapshot identity (DB-windowing key). */
  snapshot_id?: string;
}

export interface BuildStudioSceneOptions {
  /** Mirror of buildScene's `showWeakLinks` (default true). */
  showWeakLinks?: boolean;
  /**
   * Optional ontology profile. When given, each node type's
   * `node_types.*.visual_encoding` (shape / fill / border) OVERRIDES the
   * built-in type defaults (TYPE_SHAPE / TYPE_VARIANT), so packs drive their
   * own visual encoding. Absent (the parity/default path) the built-in maps
   * apply — identical to the client adapter.
   */
  profile?: {
    node_types?: Record<
      string,
      { visual_encoding?: { shape?: unknown; fill?: unknown; border?: unknown } }
    >;
  } | null;
}

// ---------------------------------------------------------------------------
// Output shapes (the scene.json contract).
// ---------------------------------------------------------------------------

export interface StudioSceneNode {
  id: string;
  label: string;
  weight: number;
  shape: string;
  /** Glyph fill variant; only emitted when non-default ("hollow"). */
  fill?: string;
  /** Glyph border weight; only emitted when non-default ("bold"). */
  border?: string;
  group?: string;
  type?: string;
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
  fixed?: boolean;
  /**
   * Shared scene contract — interval start, epoch-ms. Carried through verbatim
   * from the input node WHEN PRESENT (omitted otherwise). Not consumed here.
   */
  t?: number;
  /** Shared scene contract — interval end, epoch-ms. See {@link t}. */
  t_end?: number;
  [key: string]: unknown;
}

export interface StudioSceneEdge {
  source: string;
  target: string;
  relation?: string;
  relation_type?: string;
  dash?: string;
  weak?: true;
  /**
   * Shared scene contract — interval start, epoch-ms. Carried through verbatim
   * from the input edge WHEN PRESENT (omitted otherwise). Not consumed here.
   */
  t?: number;
  /** Shared scene contract — interval end, epoch-ms. See {@link t}. */
  t_end?: number;
  [key: string]: unknown;
}

export interface StudioSceneStats {
  nodeCount: number;
  edgeCount: number;
  weakEdgeCount: number;
  communityCount: number;
}

export interface StudioScene {
  nodes: StudioSceneNode[];
  edges: StudioSceneEdge[];
  /**
   * BUG B: the single source of truth community → colour map (community name →
   * hex). Emitted in the scene so the legend, the canvas, and any downstream
   * consumer read ONE mapping. Identical to the on-canvas node fill + the legend
   * swatch (all resolve via colorForGroup over the same key).
   */
  communityColors: Record<string, string>;
  stats: StudioSceneStats;
  /** Stamped when this scene carries one or more valid temporal intervals. */
  temporal?: TemporalProjectionMetadata;
  /**
   * Shared scene contract (additive, opt-in) — identity of the precomputed
   * layout these node x/y(/z) coordinates came from. Carried through from the
   * input graph WHEN PRESENT; omitted otherwise (back-compat byte-identity).
   * Not consumed here.
   */
  layout_id?: string;
  /** Shared scene contract — layout dimensionality (2 or 3). See {@link layout_id}. */
  layout_dims?: 2 | 3;
  /**
   * Shared scene contract — identity of the graph snapshot this scene was built
   * from (DB-windowing / cache key). Carried through WHEN PRESENT; omitted
   * otherwise. Not consumed here.
   */
  snapshot_id?: string;
}

// ---------------------------------------------------------------------------
// Helpers — 1:1 port of studio/src/lib/graphAdapter.js.
// ---------------------------------------------------------------------------

/** Graphify persists `links`; some adapters/tests pass `edges`. Accept both. */
function graphEdges(graph: StudioSceneGraphLike | null | undefined): StudioSceneGraphEdge[] {
  if (!graph) return [];
  return graph.edges ?? graph.links ?? [];
}

function graphNodes(graph: StudioSceneGraphLike | null | undefined): StudioSceneGraphNode[] {
  return graph?.nodes ?? [];
}

function displayValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function copyOwnFields(
  source: Record<string, unknown> | undefined,
  target: Record<string, unknown>,
  fields: readonly string[],
): void {
  if (!source) return;
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(source, field) && source[field] !== undefined) {
      target[field] = source[field];
    }
  }
}

// OBJ-2 (process-std-AM review): `ontology_status` was allowlisted here but is
// NEVER produced by any pipeline code (not emitted by compileHierarchies,
// profile loading, reconciliation, or any other source). It would be a pure
// duplicate of `status` (the 5-state lifecycle field: reference / attached /
// needs_review / rejected / superseded) with no distinct semantics.
// Decision: REMOVED. Use `status` for the lifecycle state, `review_status`
// for the human-review axis. Any node/edge carrying `ontology_status` in
// existing graph.json is a stale artefact; the viewer ignores unknown fields.
const NODE_PROFILE_FIELDS = [
  "status",
  "review_status",
  "assertion_basis",
  "derivation_method",
  "confidence_score",
  "evidence_refs",
  "canonical_id",
  // workspace-bundle-contract-v1 (D2): lossless registry passthrough. The
  // scene node keeps its native graphify id (`registry_<reg>_<slug>`), and
  // ADDITIONALLY carries `registry_record_id` = the id_column value VERBATIM
  // (e.g. "AM0104.01", "DE.AI.01", "org:CODE", dashed UUIDs — no `.`/`-`→`_`
  // transformation), so consumers (process-std-am viewer, scene-hierarchies sidecar)
  // can canonicalise/join on the raw registry id without an id_map.
  "registry_id",
  "registry_record_id",
  "entity_url",
  "source_file",
  "source_location",
  // Community membership passthrough: the scene is the SPA's always-present
  // mount payload, so carrying the raw `community`/`community_name` lets the
  // Types/Communities facets + the community→colour legend resolve from the
  // scene ALONE when the heavy graph.json has not (or cannot) hydrate — e.g. the
  // default scene-only `studio.html`, or a multi-file bundle opened over
  // `file://` (cross-origin fetch of a sibling graph.json is blocked). Without
  // this the facets read an empty graph and render "No types / No communities".
  "community",
  "community_name",
  "parent_id",
  "child_ids",
  "level",
  "code",
  "hierarchy_id",
  "hierarchy_ids",
  "badges",
  "documents",
  // Shared scene contract (additive, opt-in): temporal interval [t, t_end],
  // epoch-ms. copyOwnFields only copies an own, defined value, so a node
  // WITHOUT these fields yields NO key (byte-identical scene). Pass-through
  // only — not consumed here. See the module-header SHARED SCENE CONTRACT.
  "t",
  "t_end",
] as const;

const EDGE_PROFILE_FIELDS = [
  "assertion_basis",
  "review_status",
  "status",
  "derivation_method",
  "confidence_score",
  "evidence_refs",
  "hierarchy_id",
  "structural",
  // Shared scene contract (additive, opt-in): temporal interval [t, t_end],
  // epoch-ms. Omitted when absent on the input edge (byte-identical scene).
  // Pass-through only. See the module-header SHARED SCENE CONTRACT.
  "t",
  "t_end",
] as const;

function nodeLabel(node: StudioSceneGraphNode | undefined): string {
  return (
    displayValue(node?.label) ??
    displayValue(node?.title) ??
    displayValue(node?.name) ??
    String(node?.id ?? "")
  );
}

function nodeType(node: StudioSceneGraphNode | undefined): string | null {
  return (
    displayValue(node?.node_type) ??
    displayValue(node?.type) ??
    displayValue(node?.kind) ??
    displayValue(node?.file_type)
  );
}

/**
 * Grouping key for tone assignment. Community wins (named, then numeric),
 * falling back to the node type. Returns `undefined` when nothing is known.
 */
function nodeGroup(node: StudioSceneGraphNode | undefined): string | undefined {
  const community =
    displayValue(node?.community_name) ??
    (typeof node?.community === "number" ? `community:${node.community}` : null);
  if (community) return community;
  return nodeType(node) ?? undefined;
}

/** Community name for an entity (named, then numeric, then null). */
function nodeCommunity(node: StudioSceneGraphNode | undefined): string | null {
  return (
    displayValue(node?.community_name) ??
    (typeof node?.community === "number" ? `Community ${node.community}` : null)
  );
}

const TYPE_SHAPE: Record<string, string> = {
  Character: "diamond",
  Alias: "diamond",
  DisguisePersona: "star",
  NarrativeRole: "star",
  Location: "triangle",
  Organization: "hexagon",
  Evidence: "square",
  Object: "square",
  ForensicMethod: "hexagon",
  // Labelled boxes are reserved for data-driven Character hubs (see
  // computeGodClass). Document/work/story types stay non-box by default so
  // corpus structure cannot look like a labelled person hub.
  Work: "hexagon",
  ChapterOrStory: "dot",
  Saga: "hexagon",
  Author: "star",
  Translator: "triangle",
};

/**
 * Shape-per-type fallback ring for types NOT in the curated {@link TYPE_SHAPE}
 * map. A non-profile graph (graphify's own corpus, the aero contribution pack,
 * any `file_type`-typed graph) carries types like `code` / `concept` / `Commit`
 * the narrative TYPE_SHAPE map never anticipated — they previously ALL fell back
 * to the constant `dot`, so the canvas showed one glyph for every type and the
 * legend had no shape-per-type key. Each unknown type now gets a STABLE shape by
 * hashing its name into this ring, so distinct types render as distinct glyphs.
 * Excludes the box family (reserved for god-class hubs / class nodes). Kept in
 * lockstep with studio/src/lib/graphAdapter.js FALLBACK_TYPE_SHAPES (parity).
 */
const FALLBACK_TYPE_SHAPES = ["dot", "triangle", "square", "diamond", "hexagon", "star"];

/** FNV-1a hash (mirrors graphRendererPayload.stableHash) for stable bucketing. */
function stableTypeHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Stable scene shape for a type the curated {@link TYPE_SHAPE} map omits. */
function fallbackShapeForType(type: string): string {
  return FALLBACK_TYPE_SHAPES[stableTypeHash(type) % FALLBACK_TYPE_SHAPES.length] ?? "dot";
}

function shapeForType(node: StudioSceneGraphNode | undefined): string {
  const t = nodeType(node);
  if (!t) return "dot";
  // Curated narrative types keep their hand-picked glyph; everything else
  // (file_type-based / non-profile types) gets a stable per-type shape so the
  // canvas and legend distinguish them instead of collapsing to one dot.
  return TYPE_SHAPE[t] ?? fallbackShapeForType(t);
}

/**
 * Shape VARIANTS (fill: hollow | solid, border: bold | normal) multiplying the
 * 7 base shapes so the ~19 ontology types stay distinguishable: types sharing
 * a TYPE_SHAPE entry get a distinct hollow / bold combination. Defaults
 * (absent = solid + normal) keep every previously-rendered glyph unchanged.
 * Kept in lockstep with studio/src/lib/graphAdapter.js TYPE_VARIANT (parity
 * test enforces this); a profile's visual_encoding.fill/border overrides it.
 */
const TYPE_VARIANT: Record<string, { fill?: string; border?: string }> = {
  Alias: { fill: "hollow" }, // vs Character (diamond)
  DisguisePersona: { fill: "hollow" }, // vs NarrativeRole (star)
  Author: { border: "bold" }, // vs NarrativeRole / DisguisePersona (star)
  Translator: { fill: "hollow" }, // vs Location (triangle)
  ForensicMethod: { fill: "hollow" }, // vs Organization (hexagon)
  Saga: { border: "bold" }, // vs Organization / ForensicMethod (hexagon)
  Object: { fill: "hollow" }, // vs Evidence (square)
  Work: { fill: "hollow", border: "bold" }, // vs Organization / ForensicMethod / Saga
  ChapterOrStory: { border: "bold" }, // vs generic dot-like domain facts
};

function variantForType(node: StudioSceneGraphNode | undefined): { fill?: string; border?: string } {
  const t = nodeType(node);
  return (t && TYPE_VARIANT[t]) || {};
}

/**
 * Map an ontology relation to a typed dash style.
 * Unmapped relations fall back to "solid".
 */
const REL_DASH: Record<string, string> = {
  // structure / belonging (the skeleton)
  appears_in: "solid",
  part_of: "solid",
  belongs_to_saga: "solid",
  contains_evidence: "solid",
  written_by: "solid",
  narrates: "solid",
  alias_of: "solid",
  same_as: "solid",
  // agency / interaction
  commits: "dashed",
  investigates: "dashed",
  assists: "dashed",
  opposes: "dashed",
  targets: "dashed",
  suspected_of: "dashed",
  disguises_as: "dashed",
  motivates: "dashed",
  // spatial / factual anchoring
  occurs_at: "dotted",
  located_in: "dotted",
  establishes_fact: "dotted",
  mentions: "dotted",
  // method / usage
  used_in: "long-dash",
  uses_method: "long-dash",
  involves: "long-dash",
};

function dashForRelation(relation: unknown): string | undefined {
  if (!relation) return undefined;
  return REL_DASH[String(relation)] ?? "solid";
}

/** Strong = EXTRACTED (default). Anything else (INFERRED, …) renders weak. */
function isStrongEdge(edge: StudioSceneGraphEdge | undefined): boolean {
  const basis = displayValue(edge?.assertion_basis)?.toLowerCase();
  if (basis === "heuristic_guess" || basis === "document_inferred") return false;
  const conf = String(edge?.confidence ?? "EXTRACTED").toUpperCase();
  return conf === "EXTRACTED";
}

/** Undirected degree per node id, used to scale node radius. */
function computeDegrees(
  nodes: StudioSceneGraphNode[],
  edges: StudioSceneGraphEdge[],
): Map<string, number> {
  const degree = new Map<string, number>();
  for (const node of nodes) degree.set(node.id, 0);
  for (const edge of edges) {
    if (degree.has(edge.source)) degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    if (degree.has(edge.target)) degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }
  return degree;
}

/**
 * Box-label gate fraction — mirror of @sentropic/graph styles.ts
 * LABEL_DEGREE_FRACTION. Kept in lockstep so the scene-level god-class box
 * override and the buffer-level label gate select the same central nodes.
 */
const LABEL_DEGREE_FRACTION = 0.15;

/**
 * Character-gated "god-class" (UAT box-label): only Character nodes are
 * eligible for the labelled hub-box override. Earlier revisions selected the
 * most-connected type generically, which let document/story or implementation
 * nodes become labelled boxes when they dominated a corpus. Null when the graph
 * has no eligible Character hub. Kept in lockstep with graphAdapter.js
 * computeGodClass (parity test enforces scene equality).
 */
const BOX_LABEL_NODE_TYPES = new Set(["Character"]);

function computeGodClass(
  nodes: StudioSceneGraphNode[],
  degree: Map<string, number>,
  maxDegree: number,
): string | null {
  if (!(Number.isFinite(maxDegree) && maxDegree > 0)) return null;
  const threshold = LABEL_DEGREE_FRACTION * maxDegree;
  const byType = new Map<string, { maxDeg: number; gateCount: number }>();
  for (const node of nodes) {
    const type = nodeType(node);
    if (!type || !BOX_LABEL_NODE_TYPES.has(type)) continue;
    const deg = degree.get(node.id) ?? 0;
    let rec = byType.get(type);
    if (!rec) byType.set(type, (rec = { maxDeg: 0, gateCount: 0 }));
    if (deg > rec.maxDeg) rec.maxDeg = deg;
    if (deg >= threshold) rec.gateCount += 1;
  }
  let best: string | null = null;
  let bestRec: { maxDeg: number; gateCount: number } | null = null;
  for (const [type, rec] of byType) {
    if (
      bestRec === null ||
      rec.maxDeg > bestRec.maxDeg ||
      (rec.maxDeg === bestRec.maxDeg &&
        (rec.gateCount > bestRec.gateCount ||
          (rec.gateCount === bestRec.gateCount && best !== null && type < best)))
    ) {
      best = type;
      bestRec = rec;
    }
  }
  return best;
}

/**
 * Legacy autosizing: node radius is LINEAR in degree, NORMALISED by the graph's
 * max degree. weight = (1 + (RADIUS_RATIO - 1) * (deg / maxDeg))^2.
 */
const RADIUS_RATIO = 4; // rmax / rmin, matches the legacy 4->16 spread
// UAT: the LARGEST degree-sized (non-box) glyphs read too small next to the
// god-class boxes. Hub growth: scale a node's RADIUS by up to +HUB_GROWTH,
// linear in degree normalised by the LARGEST DEGREE-SIZED (non-box) node. The
// global max degree always belongs to a god-class box hub whose glyph is
// degree-INDEPENDENT, so normalising the boost by maxDegree would waste the
// top of the boost curve on boxes. With this, the biggest diamond/dot/etc
// grows exactly +20% while leaves barely change (boost ~ +0 at degree ~ 0).
// MUST stay in lockstep with studio/src/lib/graphAdapter.js weightForDegree.
const HUB_GROWTH = 0.2;
function weightForDegree(degree: number, maxDegree: number, sizedMaxDegree?: number): number {
  const max = Number.isFinite(maxDegree) && maxDegree > 0 ? maxDegree : 1;
  const deg = Number.isFinite(degree) ? degree : 0;
  const ratio = Math.min(1, Math.max(0, deg / max));
  const rOverRmin = 1 + (RADIUS_RATIO - 1) * ratio;
  const sizedMax =
    typeof sizedMaxDegree === "number" && Number.isFinite(sizedMaxDegree) && sizedMaxDegree > 0
      ? sizedMaxDegree
      : max;
  const hubT = Math.min(1, Math.max(0, deg / sizedMax));
  const boosted = rOverRmin * (1 + HUB_GROWTH * hubT);
  return boosted * boosted;
}

/** Box-category scene shapes (degree-INDEPENDENT glyphs sized to their label). */
function isBoxSceneShape(shape: unknown): boolean {
  const value = String(shape ?? "").toLowerCase();
  return value === "box" || value === "roundedbox";
}

/**
 * Group / community → colour palette and lookup. THE single source of truth for
 * BUG B: both this build-time scene emitter AND the SPA canvas/legend resolve a
 * group's colour through colorForGroup() over the SAME key, so the emitted
 * scene.communityColors map, the on-canvas node fill, and the legend swatch are
 * all identical. Kept in lockstep with studio/src/lib/graphRendererPayload.js
 * GROUP_PALETTE / colorForGroup (the offline-render test cross-checks them).
 */
const GROUP_PALETTE = [
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
] as const;

function groupHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function colorForGroup(group: string | undefined): string {
  return GROUP_PALETTE[groupHash(group ?? "default") % GROUP_PALETTE.length] ?? GROUP_PALETTE[0];
}

/**
 * Community breakdown that EXCLUDES isolated singletons. Mirrors graphAdapter.js
 * computeCommunityStats EXACTLY (same node order, same nodeGroup colour key,
 * same descending-count/key sort) so the emitted `communityColors` map and the
 * `communityCount` are byte-identical to the SPA's. Returns the live-count and
 * the colour map (keyed by community name, descending-count order).
 */
function communityStats(graph: StudioSceneGraphLike): {
  liveCount: number;
  communityColors: Record<string, string>;
} {
  const nodes = graphNodes(graph);
  const ids = new Set(nodes.map((n) => n.id));
  const deg = new Map<string, number>();
  for (const e of graphEdges(graph)) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue;
    deg.set(e.source, (deg.get(e.source) ?? 0) + 1);
    deg.set(e.target, (deg.get(e.target) ?? 0) + 1);
  }

  const byComm = new Map<string, { count: number; live: boolean; group: string | undefined }>();
  for (const node of nodes) {
    const key = nodeCommunity(node);
    const live = (deg.get(node.id) ?? 0) > 0;
    if (key === undefined || key === null || key === "") continue;
    const rec = byComm.get(key) ?? { count: 0, live: false, group: nodeGroup(node) };
    rec.count += 1;
    if (live) rec.live = true;
    byComm.set(key, rec);
  }
  const liveList: Array<{ key: string; count: number; color: string }> = [];
  for (const [key, rec] of byComm) {
    if (rec.live) {
      liveList.push({ key: String(key), count: rec.count, color: colorForGroup(rec.group ?? key) });
    }
  }
  liveList.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  const communityColors: Record<string, string> = {};
  for (const c of liveList) communityColors[c.key] = c.color;
  return { liveCount: liveList.length, communityColors };
}

// ---------------------------------------------------------------------------
// Public API.
// ---------------------------------------------------------------------------

/**
 * Build the full Studio scene from a GraphLike payload. Strict parity with
 * studio/src/lib/graphAdapter.js → buildScene.
 */
export function buildStudioScene(
  graph: StudioSceneGraphLike | null | undefined,
  options: BuildStudioSceneOptions = {},
): StudioScene {
  const { showWeakLinks = true, profile = null } = options;
  const safeGraph = graph ?? {};
  const rawNodes = graphNodes(safeGraph);
  const rawEdges = graphEdges(safeGraph);

  const nodeIds = new Set(rawNodes.map((n) => n.id));
  let edges = rawEdges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
  if (!showWeakLinks) edges = edges.filter(isStrongEdge);

  const degree = computeDegrees(rawNodes, edges);
  const maxDegree = degree.size > 0 ? Math.max(...degree.values()) : 1;
  // God-class hubs (the most-connected class's central nodes) render as
  // labelled boxes: their glyph is overridden to the box shape so the label
  // (gated per-type in @sentropic/graph styles.ts) sits inside the box.
  const godClass = computeGodClass(rawNodes, degree, maxDegree);
  const hubDegreeThreshold = LABEL_DEGREE_FRACTION * maxDegree;

  // Final scene shape per node (god-class hub override > profile encoding >
  // type default), resolved up front so the hub-growth boost can be normalised
  // by the max degree among DEGREE-SIZED (non-box) nodes.
  const finalShapes: string[] = rawNodes.map((node) => {
    const type = nodeType(node);
    const encoding = type ? profile?.node_types?.[type]?.visual_encoding : undefined;
    const isGodClassHub =
      godClass !== null && type === godClass && (degree.get(node.id) ?? 0) >= hubDegreeThreshold;
    return isGodClassHub ? "roundedbox" : (displayValue(encoding?.shape) ?? shapeForType(node));
  });
  let sizedMaxDegree = 0;
  rawNodes.forEach((node, index) => {
    if (isBoxSceneShape(finalShapes[index])) return;
    const deg = degree.get(node.id) ?? 0;
    if (deg > sizedMaxDegree) sizedMaxDegree = deg;
  });

  const nodes: StudioSceneNode[] = rawNodes.map((node, index) => {
    const group = nodeGroup(node);
    const type = nodeType(node);
    const x = finiteNumber(node.x) ? node.x : finiteNumber(node.fx) ? node.fx : undefined;
    const y = finiteNumber(node.y) ? node.y : finiteNumber(node.fy) ? node.fy : undefined;
    // Profile visual_encoding (shape / fill / border) overrides the built-in
    // type defaults; otherwise TYPE_SHAPE / TYPE_VARIANT apply (client parity).
    const encoding = type ? profile?.node_types?.[type]?.visual_encoding : undefined;
    const variant = variantForType(node);
    const fill = displayValue(encoding?.fill) ?? variant.fill;
    const border = displayValue(encoding?.border) ?? variant.border;
    const out: StudioSceneNode = {
      id: node.id,
      label: nodeLabel(node),
      weight: weightForDegree(degree.get(node.id) ?? 0, maxDegree, sizedMaxDegree),
      // finalShapes is index-aligned with rawNodes; ?? only satisfies
      // noUncheckedIndexedAccess (shapeForType's own fallback is "dot" too).
      shape: finalShapes[index] ?? "dot",
    };
    if (fill && fill !== "solid") out.fill = fill;
    if (border && border !== "normal") out.border = border;
    if (group !== undefined) out.group = group;
    if (type) out.type = type;
    copyOwnFields(node, out, NODE_PROFILE_FIELDS);
    if (x !== undefined) out.x = x;
    if (y !== undefined) out.y = y;
    if (finiteNumber(node.fx)) out.fx = node.fx;
    if (finiteNumber(node.fy)) out.fy = node.fy;
    if (typeof node.fixed === "boolean") out.fixed = node.fixed;
    return out;
  });

  const sceneEdges: StudioSceneEdge[] = edges.map((edge) => {
    const out: StudioSceneEdge = { source: edge.source, target: edge.target };
    const relation = displayValue(edge.relation) ?? displayValue(edge.relation_type);
    if (relation) {
      out.relation = relation;
      const dash = dashForRelation(relation);
      if (dash) out.dash = dash;
    }
    const relationType = displayValue(edge.relation_type);
    if (relationType) out.relation_type = relationType;
    copyOwnFields(edge, out, EDGE_PROFILE_FIELDS);
    if (!isStrongEdge(edge)) out.weak = true;
    return out;
  });

  const cstats = communityStats(safeGraph);
  const scene: StudioScene = {
    nodes,
    edges: sceneEdges,
    // BUG B: emitted single source of truth community → colour map (see
    // communityStats / colorForGroup). Byte-identical to the SPA buildScene
    // output (parity test enforces it).
    communityColors: cstats.communityColors,
    stats: {
      nodeCount: nodes.length,
      edgeCount: sceneEdges.length,
      weakEdgeCount: sceneEdges.filter((e) => e.weak).length,
      communityCount: cstats.liveCount,
    },
  };

  // Shared scene contract (additive, opt-in) — layout + snapshot meta. Carried
  // through from the INPUT graph WHEN PRESENT, omitted otherwise so a graph
  // without these fields serialises BYTE-IDENTICALLY to before (no empty keys).
  // Pass-through only — nothing here consumes them. See module-header contract.
  const snapshotId = displayValue(graph?.snapshot_id);
  if (snapshotId) scene.snapshot_id = snapshotId;
  const layoutId = displayValue(graph?.layout_id);
  if (layoutId) scene.layout_id = layoutId;
  const layoutDims = graph?.layout_dims;
  if (layoutDims === 2 || layoutDims === 3) scene.layout_dims = layoutDims;
  if ([...nodes, ...sceneEdges].some((element) => closedTemporalBounds(element) !== undefined)) {
    scene.temporal = closedTemporalProjectionMetadata();
  }

  return scene;
}
