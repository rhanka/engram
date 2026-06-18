/**
 * GraphLike -> Studio scene adapter.
 *
 * Pure-data mapping from a Graphify `graph.json` payload to the scene shape
 * consumed by GraphCanvas and then converted to `@sentropic/graph` buffers. No
 * DOM, no d3. This module is the single source of truth the workspace state and
 * the vitest suite both build on.
 *
 * Mapping:
 *   GraphLike node -> Studio scene node:
 *     id    <- node.id
 *     label <- node.label || node.title || node.name || node.id
 *     group <- node.community_name || node.community || node.type  (in that order)
 *     weight<- degree-derived (more relations => bigger node)
 *     type/status/profile fields are preserved for profile adapters
 *   GraphLike link -> Studio scene edge:
 *     source/target <- link.source/target
 *     relation      <- link.relation || link.relation_type
 *     weak          <- (link.confidence ?? "EXTRACTED") !== "EXTRACTED"
 *     assertion/review/evidence fields are preserved for profile adapters
 */

import { computeLayout } from "@graphify/graph-layout";

/** Graphify persists `links`; some adapters/tests pass `edges`. Accept both. */
export function graphEdges(graph) {
  if (!graph) return [];
  return graph.edges ?? graph.links ?? [];
}

export function graphNodes(graph) {
  return graph?.nodes ?? [];
}

function displayValue(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function copyOwnFields(source, target, fields) {
  if (!source || typeof source !== "object") return;
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(source, field) && source[field] !== undefined) {
      target[field] = source[field];
    }
  }
}

const NODE_PROFILE_FIELDS = [
  "status",
  "ontology_status",
  "review_status",
  "assertion_basis",
  "derivation_method",
  "confidence_score",
  "evidence_refs",
  "canonical_id",
  // workspace-bundle-contract-v1 (D2): lossless registry passthrough (raw
  // id_column verbatim). Kept in lockstep with src/studio-scene.ts.
  "registry_id",
  "registry_record_id",
  "entity_url",
  "source_file",
  "source_location",
  "parent_id",
  "child_ids",
  "level",
  "code",
  "hierarchy_id",
  "hierarchy_ids",
  "badges",
  "documents",
];

const EDGE_PROFILE_FIELDS = [
  "assertion_basis",
  "review_status",
  "status",
  "ontology_status",
  "derivation_method",
  "confidence_score",
  "evidence_refs",
  "hierarchy_id",
  "structural",
];

export function nodeLabel(node) {
  return (
    displayValue(node?.label) ??
    displayValue(node?.title) ??
    displayValue(node?.name) ??
    String(node?.id ?? "")
  );
}

export function nodeType(node) {
  return (
    displayValue(node?.node_type) ??
    displayValue(node?.type) ??
    displayValue(node?.kind) ??
    displayValue(node?.file_type)
  );
}

/**
 * Grouping key for tone assignment. Community wins (named, then numeric),
 * falling back to the node type so single-community graphs still colour by
 * type. Returns `undefined` when nothing is known so the renderer uses its
 * default group tone.
 */
export function nodeGroup(node) {
  const community =
    displayValue(node?.community_name) ??
    (typeof node?.community === "number" ? `community:${node.community}` : null);
  if (community) return community;
  return nodeType(node) ?? undefined;
}

/**
 * SVELTE-4: map an ontology node type to a scene shape, mirroring the
 * pack profile's visual_encoding (shape signals the entity's ontological
 * nature; colour stays community-driven). Unknown types fall back to "dot".
 * @returns {"diamond"|"star"|"hexagon"|"box"|"triangle"|"square"|"dot"}
 */
const TYPE_SHAPE = {
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
  // corpus structure cannot look like a labelled person hub. Kept in lockstep
  // with src/studio-scene.ts TYPE_SHAPE (parity test enforces this).
  Work: "hexagon",
  ChapterOrStory: "dot",
  Saga: "hexagon",
  Author: "star",
  Translator: "triangle",
};

/**
 * Map an ontology relation to a typed dash style.
 * Four families: solid = belonging/structure, dashed = agency/interaction
 * between characters, dotted = spatial/factual anchoring, long-dash =
 * method/usage. Unmapped relations fall back to solid.
 */
const REL_DASH = {
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
export function dashForRelation(relation) {
  if (!relation) return undefined;
  return REL_DASH[String(relation)] ?? "solid";
}
export function shapeForType(node) {
  const t = nodeType(node);
  return (t && TYPE_SHAPE[t]) || "dot";
}

/**
 * Shape VARIANTS (fill: hollow | solid, border: bold | normal) multiplying the
 * 7 base shapes so the ~19 ontology types stay distinguishable: types sharing
 * a TYPE_SHAPE entry get a distinct hollow / bold combination. Defaults
 * (absent = solid + normal) keep every previously-rendered glyph unchanged.
 * Kept in lockstep with src/studio-scene.ts TYPE_VARIANT (parity test
 * enforces this); a pack profile's visual_encoding.fill/border overrides it
 * in the build-time scene.json.
 */
const TYPE_VARIANT = {
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

/** Variant (fill/border) for a node's ontology type; {} when default. */
export function variantForType(node) {
  const t = nodeType(node);
  return (t && TYPE_VARIANT[t]) || {};
}

/** Strong = EXTRACTED (default). Anything else (INFERRED, …) renders weak. */
export function isStrongEdge(edge) {
  const basis = displayValue(edge?.assertion_basis)?.toLowerCase();
  if (basis === "heuristic_guess" || basis === "document_inferred") return false;
  const conf = String(edge?.confidence ?? "EXTRACTED").toUpperCase();
  return conf === "EXTRACTED";
}

/** Undirected degree per node id, used to scale node radius. */
export function computeDegrees(nodes, edges) {
  const degree = new Map();
  for (const node of nodes) degree.set(node.id, 0);
  for (const edge of edges) {
    if (degree.has(edge.source)) degree.set(edge.source, degree.get(edge.source) + 1);
    if (degree.has(edge.target)) degree.set(edge.target, degree.get(edge.target) + 1);
  }
  return degree;
}

/**
 * Map degree -> scene `weight` (relative node radius multiplier).
 * Clamped to a gentle range so hubs read bigger without dwarfing leaves.
 */
// Legacy autosizing: node radius is LINEAR in degree, NORMALISED by the graph's
// max degree — r = rmin + (rmax - rmin) * (deg / maxDeg) (legacy used
// r = 4 + 12*(deg/maxDeg), i.e. an rmax/rmin ratio of 4). GraphCanvas renders
// r = nodeRadius * sqrt(weight), so to get that linear r we pass
// weight = (r_target / nodeRadius)^2 with nodeRadius = rmin.
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
 * has no eligible Character hub. Kept in lockstep with src/studio-scene.ts
 * computeGodClass (parity test enforces scene equality).
 */
const BOX_LABEL_NODE_TYPES = new Set(["Character"]);

export function computeGodClass(nodes, degree, maxDegree) {
  if (!(Number.isFinite(maxDegree) && maxDegree > 0)) return null;
  const threshold = LABEL_DEGREE_FRACTION * maxDegree;
  const byType = new Map();
  for (const node of nodes) {
    const type = nodeType(node);
    if (!type || !BOX_LABEL_NODE_TYPES.has(type)) continue;
    const deg = degree.get(node.id) ?? 0;
    let rec = byType.get(type);
    if (!rec) byType.set(type, (rec = { maxDeg: 0, gateCount: 0 }));
    if (deg > rec.maxDeg) rec.maxDeg = deg;
    if (deg >= threshold) rec.gateCount += 1;
  }
  let best = null;
  let bestRec = null;
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

const RADIUS_RATIO = 4; // rmax / rmin, matches the legacy 4->16 spread
// UAT: the LARGEST degree-sized (non-box) glyphs read too small next to the
// god-class boxes. Hub growth: scale a node's RADIUS by up to +HUB_GROWTH,
// linear in degree normalised by the LARGEST DEGREE-SIZED (non-box) node. The
// global max degree always belongs to a god-class box hub whose glyph is
// degree-INDEPENDENT, so normalising the boost by maxDegree would waste the
// top of the boost curve on boxes. With this, the biggest diamond/dot/etc
// grows exactly +20% while leaves barely change (boost ~ +0 at degree ~ 0).
// MUST stay in lockstep with src/studio-scene.ts weightForDegree.
const HUB_GROWTH = 0.2;
function weightForDegree(degree, maxDegree, sizedMaxDegree) {
  const max = Number.isFinite(maxDegree) && maxDegree > 0 ? maxDegree : 1;
  const deg = Number.isFinite(degree) ? degree : 0;
  // r_target/rmin = 1 + (RADIUS_RATIO - 1) * ratio ; weight = (r_target/rmin)^2.
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
function isBoxSceneShape(shape) {
  const value = String(shape ?? "").toLowerCase();
  return value === "box" || value === "roundedbox";
}

/**
 * Build the full Studio scene from a GraphLike payload.
 *
 * @param {object} graph        graph.json payload ({ nodes, links|edges }).
 * @param {object} [options]
 * @param {boolean} [options.showWeakLinks=true]  drop weak (non-EXTRACTED)
 *        edges (and any node that would be orphaned by that drop is kept).
 * @returns {{ nodes: object[], edges: object[], stats: object }}
 */
export function buildScene(graph, options = {}) {
  const { showWeakLinks = true } = options;
  const rawNodes = graphNodes(graph);
  const rawEdges = graphEdges(graph);

  const nodeIds = new Set(rawNodes.map((n) => n.id));
  // Only keep edges whose endpoints both exist; dangling refs would crash the sim.
  let edges = rawEdges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
  if (!showWeakLinks) edges = edges.filter(isStrongEdge);

  const degree = computeDegrees(rawNodes, edges);
  // Autosizing is normalised by the graph's max degree (legacy method), so the
  // largest hub is rmax and a leaf is rmin regardless of the absolute degrees.
  const maxDegree = degree.size > 0 ? Math.max(...degree.values()) : 1;
  // God-class hubs (the most-connected class's central nodes) render as
  // labelled boxes: their glyph is overridden to the box shape so the label
  // (gated per-type in @sentropic/graph styles.ts) sits inside the box.
  const godClass = computeGodClass(rawNodes, degree, maxDegree);
  const hubDegreeThreshold = LABEL_DEGREE_FRACTION * maxDegree;

  // Final scene shape per node (god-class hub override > type default),
  // resolved up front so the hub-growth boost can be normalised by the max
  // degree among DEGREE-SIZED (non-box) nodes.
  const finalShapes = rawNodes.map((node) => {
    const isGodClassHub =
      godClass !== null &&
      nodeType(node) === godClass &&
      (degree.get(node.id) ?? 0) >= hubDegreeThreshold;
    // SVELTE-4: ontology type -> scene shape; god-class hubs become boxes.
    return isGodClassHub ? "roundedbox" : shapeForType(node);
  });
  let sizedMaxDegree = 0;
  rawNodes.forEach((node, index) => {
    if (isBoxSceneShape(finalShapes[index])) return;
    const deg = degree.get(node.id) ?? 0;
    if (deg > sizedMaxDegree) sizedMaxDegree = deg;
  });

  const nodes = rawNodes.map((node, index) => {
    const group = nodeGroup(node);
    const type = nodeType(node);
    const x = finiteNumber(node?.x) ? node.x : finiteNumber(node?.fx) ? node.fx : undefined;
    const y = finiteNumber(node?.y) ? node.y : finiteNumber(node?.fy) ? node.fy : undefined;
    const variant = variantForType(node);
    const out = {
      id: node.id,
      label: nodeLabel(node),
      weight: weightForDegree(degree.get(node.id) ?? 0, maxDegree, sizedMaxDegree),
      shape: finalShapes[index],
    };
    // Shape variants (hollow / bold) multiply the base shapes per type.
    if (variant.fill && variant.fill !== "solid") out.fill = variant.fill;
    if (variant.border && variant.border !== "normal") out.border = variant.border;
    if (group !== undefined) out.group = group;
    if (type) out.type = type;
    copyOwnFields(node, out, NODE_PROFILE_FIELDS);
    if (x !== undefined) out.x = x;
    if (y !== undefined) out.y = y;
    if (finiteNumber(node?.fx)) out.fx = node.fx;
    if (finiteNumber(node?.fy)) out.fy = node.fy;
    if (typeof node?.fixed === "boolean") out.fixed = node.fixed;
    return out;
  });

  const sceneEdges = edges.map((edge) => {
    const out = { source: edge.source, target: edge.target };
    const relation = displayValue(edge.relation) ?? displayValue(edge.relation_type);
    if (relation) {
      out.relation = relation;
      // SVELTE/UAT R3-8: typed dash per relation family.
      const dash = dashForRelation(relation);
      if (dash) out.dash = dash;
    }
    const relationType = displayValue(edge.relation_type);
    if (relationType) out.relation_type = relationType;
    copyOwnFields(edge, out, EDGE_PROFILE_FIELDS);
    if (!isStrongEdge(edge)) out.weak = true;
    return out;
  });

  return {
    nodes,
    edges: sceneEdges,
    stats: {
      nodeCount: nodes.length,
      edgeCount: sceneEdges.length,
      weakEdgeCount: sceneEdges.filter((e) => e.weak).length,
      // Isolated singletons (degree-0) are excluded from the community count.
      communityCount: communityStats(graph).liveCount,
    },
  };
}

/**
 * ÉTAPE 1b: re-apply the weak-link filter on an ALREADY-BUILT scene, without the
 * raw graph. The SPA mounts the light `scene.json` (the full scene, weak links
 * included), then the Options toggle flips weak links on/off purely on the scene
 * — no graph re-fetch, no buildScene re-run.
 *
 * STRICT PARITY: `applyWeakFilter(buildScene(g, { showWeakLinks: true }), false)`
 * deep-equals `buildScene(g, { showWeakLinks: false })`. To hold, this mirrors
 * buildScene's `showWeakLinks:false` path exactly:
 *   - drop edges flagged `weak` (kept-edge order is preserved);
 *   - KEEP every node (buildScene never drops orphaned nodes), but RECOMPUTE
 *     each node's `weight` from the now-filtered degrees, re-normalised by the
 *     new max degree (a node that loses all its strong neighbours falls to rmin);
 *   - RECOMPUTE the god-class box override from the filtered degrees: hubs of
 *     the (possibly changed) god-class get the box glyph; an ex-hub whose box
 *     came from the override is restored to its type's base shape;
 *   - stats: edgeCount = strong edges, weakEdgeCount = 0; nodeCount and
 *     communityCount are stable (communityCount is computed over ALL edges, so
 *     the weak filter never moves it).
 *
 * @param {{ nodes: object[], edges: object[], stats: object }} scene  full scene
 * @param {boolean} showWeak  when true, return the scene unchanged
 * @returns {{ nodes: object[], edges: object[], stats: object }} a new scene
 */
export function applyWeakFilter(scene, showWeak) {
  if (!scene) return scene;
  if (showWeak) return scene;

  const rawNodes = scene.nodes ?? [];
  const edges = (scene.edges ?? []).filter((e) => !e.weak);

  const degree = computeDegrees(rawNodes, edges);
  const maxDegree = degree.size > 0 ? Math.max(...degree.values()) : 1;
  const godClass = computeGodClass(rawNodes, degree, maxDegree);
  const hubDegreeThreshold = LABEL_DEGREE_FRACTION * maxDegree;

  // Final shape under the filtered degrees, resolved up front (same two-pass
  // as buildScene) so the hub-growth boost is normalised by the max degree
  // among DEGREE-SIZED (non-box) nodes of the FILTERED scene.
  const finalShapes = rawNodes.map((node) => {
    const isGodClassHub =
      godClass !== null &&
      nodeType(node) === godClass &&
      (degree.get(node.id) ?? 0) >= hubDegreeThreshold;
    if (isGodClassHub) return "roundedbox";
    if (
      (node.shape === "roundedbox" || node.shape === "box") &&
      nodeType(node) &&
      shapeForType(node) !== node.shape
    ) {
      // The box glyph came from the god-class hub override (the type's own
      // shape is not a box): restore the base shape now the node is no longer
      // a hub under the filtered degrees.
      return shapeForType(node);
    }
    return node.shape;
  });
  let sizedMaxDegree = 0;
  rawNodes.forEach((node, index) => {
    if (isBoxSceneShape(finalShapes[index])) return;
    const deg = degree.get(node.id) ?? 0;
    if (deg > sizedMaxDegree) sizedMaxDegree = deg;
  });

  const nodes = rawNodes.map((node, index) => ({
    ...node,
    weight: weightForDegree(degree.get(node.id) ?? 0, maxDegree, sizedMaxDegree),
    shape: finalShapes[index],
  }));

  return {
    ...scene,
    nodes,
    edges,
    stats: {
      ...scene.stats,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      weakEdgeCount: 0,
    },
  };
}

/**
 * Index nodes by id for O(1) lookups in the entity panel / relations.
 * @returns {Map<string, object>}
 */
export function indexNodes(graph) {
  const map = new Map();
  for (const node of graphNodes(graph)) map.set(node.id, node);
  return map;
}

// ---- Memoised per-graph index (quick-win C) ------------------------------
// LeftRail and SelectionPanel call entitiesByType / entitiesByCommunity /
// communityStats on every selection toggle and keystroke — each was an O(n)
// filter + O(n log n) sort over the WHOLE node array, and SelectionPanel loops
// them per selected type/community (O(types × n log n)). With $state.raw(graph)
// the graph object reference is stable for a session, so we bucket the nodes
// ONCE per graph and memoise on a WeakMap (auto-released when the graph object
// is replaced/reloaded). Buckets are pre-sorted by label, so the output matches
// the previous per-call result exactly (value parity).
const INDEX_CACHE = new WeakMap();

function buildGraphIndex(graph) {
  const byType = new Map();
  const byCommunity = new Map();
  for (const n of graphNodes(graph)) {
    const t = nodeType(n);
    let tb = byType.get(t);
    if (!tb) byType.set(t, (tb = []));
    tb.push({ id: n.id, label: nodeLabel(n) });

    const c = nodeCommunity(n);
    let cb = byCommunity.get(c);
    if (!cb) byCommunity.set(c, (cb = []));
    cb.push({ id: n.id, label: nodeLabel(n) });
  }
  const byLabel = (a, b) => a.label.localeCompare(b.label);
  for (const bucket of byType.values()) bucket.sort(byLabel);
  for (const bucket of byCommunity.values()) bucket.sort(byLabel);
  return { byType, byCommunity, communityStats: null };
}

/**
 * Memoised bucket index for a graph object: `{ byType, byCommunity }` maps of
 * pre-sorted `{ id, label }[]`, plus a lazily-filled `communityStats` slot.
 * Recomputed only when a different graph reference is passed; empty for null.
 */
export function graphIndex(graph) {
  if (!graph) return { byType: new Map(), byCommunity: new Map(), communityStats: null };
  let idx = INDEX_CACHE.get(graph);
  if (!idx) INDEX_CACHE.set(graph, (idx = buildGraphIndex(graph)));
  return idx;
}

/**
 * Relation rows for an entity, mirroring the server entity-panel shaping:
 * out-edges first then in-edges, each carrying the relation kind + the OTHER
 * node's id and resolved label.
 *
 * @returns {{ direction: "out"|"in", relation: string, otherId: string, otherLabel: string }[]}
 */
export function relationRowsFor(nodeId, graph) {
  const byId = indexNodes(graph);
  const rows = [];
  for (const edge of graphEdges(graph)) {
    if (edge.source === nodeId) {
      rows.push({
        direction: "out",
        relation: displayValue(edge.relation) ?? "related_to",
        otherId: edge.target,
        otherLabel: nodeLabel(byId.get(edge.target)) || edge.target,
      });
    } else if (edge.target === nodeId) {
      rows.push({
        direction: "in",
        relation: displayValue(edge.relation) ?? "related_to",
        otherId: edge.source,
        otherLabel: nodeLabel(byId.get(edge.source)) || edge.source,
      });
    }
  }
  return rows;
}

/** Community name for an entity (named, then numeric, then null). */
export function nodeCommunity(node) {
  return (
    displayValue(node?.community_name) ??
    (typeof node?.community === "number" ? `Community ${node.community}` : null)
  );
}

/** Source path "file:loc" (or just file) for an entity, or null. */
export function nodeSourcePath(node) {
  const file = displayValue(node?.source_file);
  const loc = displayValue(node?.source_location);
  if (!file) return null;
  return loc ? `${file}:${loc}` : file;
}

/**
 * Group nodes by their grouping key for the left-rail Types/Communities lists.
 * @returns {{ key: string, count: number }[]} sorted by descending count.
 */
export function groupCounts(graph, keyFn) {
  const counts = new Map();
  for (const node of graphNodes(graph)) {
    const key = keyFn(node);
    if (key === undefined || key === null || key === "") continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key: String(key), count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/**
 * Community breakdown that EXCLUDES isolated singletons from the count.
 * A community is "live" when at least one member has a relation (degree > 0
 * over ALL links, strong + weak, so the set is stable regardless of the weak
 * filter). Communities whose members are all degree-0 — the D9 isolated nodes
 * that each form their own singleton — are not counted; their members fold into
 * a single `isolatedCount`. This drops the public-pack count 141 -> 100.
 */
function computeCommunityStats(graph) {
  const nodes = graphNodes(graph);
  const ids = new Set(nodes.map((n) => n.id));
  const deg = new Map();
  for (const e of graphEdges(graph)) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue;
    deg.set(e.source, (deg.get(e.source) ?? 0) + 1);
    deg.set(e.target, (deg.get(e.target) ?? 0) + 1);
  }
  // Reproduce the DS tone assignment: it walks scene nodes and assigns
  // category1..8 to each new `group` in first-seen order. We mirror that here
  // (same node order, same nodeGroup key) so the rail swatch matches the graph.
  const TONES = [
    "category1", "category2", "category3", "category4",
    "category5", "category6", "category7", "category8",
  ];
  const toneByGroup = new Map();
  for (const node of nodes) {
    const g = nodeGroup(node);
    if (g === undefined || g === null || toneByGroup.has(g)) continue;
    toneByGroup.set(g, TONES[toneByGroup.size % TONES.length]);
  }

  const byComm = new Map();
  let isolatedCount = 0;
  for (const node of nodes) {
    const key = nodeCommunity(node);
    const live = (deg.get(node.id) ?? 0) > 0;
    if (key === undefined || key === null || key === "") {
      if (!live) isolatedCount += 1;
      continue;
    }
    const rec = byComm.get(key) ?? { count: 0, live: false };
    rec.count += 1;
    if (live) rec.live = true;
    byComm.set(key, rec);
  }
  const liveList = [];
  for (const [key, rec] of byComm) {
    if (rec.live) {
      liveList.push({ key: String(key), count: rec.count, tone: toneByGroup.get(key) ?? "category1" });
    } else {
      isolatedCount += rec.count;
    }
  }
  liveList.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  return { live: liveList, isolatedCount, liveCount: liveList.length };
}

/**
 * Community breakdown, memoised per graph object (quick-win C). buildScene,
 * LeftRail and SelectionPanel each call this; the result is a pure function of
 * the graph, so compute it once and cache it on the shared graph index.
 */
export function communityStats(graph) {
  if (!graph) return computeCommunityStats(graph);
  const idx = graphIndex(graph);
  if (!idx.communityStats) idx.communityStats = computeCommunityStats(graph);
  return idx.communityStats;
}

/**
 * SVELTE-2: group an EXPLICIT citation list by source file, with their
 * passages. Each citation is `{ source_file, section?, page?, quote? }`. Used
 * for the citations lazy upgrade: the panel feeds the inline K-set (instant)
 * first, then the sidecar's full per-entity list once `fetchEntity` resolves —
 * the same renderer over richer data. `fallbackSourceFile` covers citations
 * with no own `source_file` (legacy graphs). Passages render LOCATORS
 * (section/page); there is no verbatim `quote` field in the citation schema, so
 * `quote` stays null on the new lazy path (the render guards on it).
 * @param {Array<object>|null|undefined} list
 * @param {string|null} [fallbackSourceFile]
 * @returns {{ file: string, count: number, passages: { section: string|null, quote: string|null }[] }[]}
 */
export function citationsByFileFrom(list, fallbackSourceFile = null) {
  const cites = Array.isArray(list) ? list : [];
  const byFile = new Map();
  for (const c of cites) {
    const file = displayValue(c?.source_file) ?? displayValue(fallbackSourceFile) ?? "(unknown source)";
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file).push({
      section: displayValue(c?.section) ?? null,
      quote: displayValue(c?.quote) ?? null,
    });
  }
  return [...byFile.entries()]
    .map(([file, passages]) => ({ file, count: passages.length, passages }))
    .sort((a, b) => b.count - a.count || a.file.localeCompare(b.file));
}

/**
 * SVELTE-2: group a node's inline citations by source file. Thin wrapper over
 * {@link citationsByFileFrom} that reads `node.citations` (now the K-bounded
 * inline set) and falls back to `node.source_file`. Renders instantly off the
 * already-loaded graph; the lazy upgrade calls `citationsByFileFrom` directly
 * with the sidecar's full list.
 * @returns {{ file: string, count: number, passages: { section: string|null, quote: string|null }[] }[]}
 */
export function citationsByFile(node) {
  return citationsByFileFrom(node?.citations, node?.source_file ?? null);
}

/**
 * SVELTE-7: build a focused subgraph around two reconciliation-candidate
 * entities. Includes both anchors + their neighbours up to `hops` (default 1),
 * and every edge whose endpoints are both in the kept set. Returns a graph
 * shaped like the full one ({ nodes, links }) so buildScene can consume it.
 */
// #4.1: default neighbourhood depth for the recon focal pair. The two entities
// under comparison are expanded to DEPTH-3 so the operator can judge the match
// from the surrounding context (shared neighbours, shared communities), not just
// the bare twins. `maxNodes` CAPS the fan-out: a depth-3 ball around a
// high-degree hub can pull in hundreds of nodes (an unreadable hairball that
// also stalls the force layout), so once the kept set reaches the cap we stop
// growing the frontier and return the partial ball. The two seed twins are
// always kept (added before any cap check), so the pair can never be dropped.
export const RECON_SUBGRAPH_DEPTH = 3;
export const RECON_SUBGRAPH_MAX_NODES = 160;

export function candidateSubgraph(
  graph,
  idA,
  idB,
  hops = 1,
  { maxNodes = RECON_SUBGRAPH_MAX_NODES } = {},
) {
  const idx = indexNodes(graph);
  const edges = graphEdges(graph);
  const keep = new Set();
  for (const a of [idA, idB]) {
    if (a != null && idx.has(a)) keep.add(a);
  }
  const cap = Number.isFinite(maxNodes) ? Math.max(keep.size, maxNodes) : Infinity;
  let frontier = new Set(keep);
  for (let h = 0; h < Math.max(0, hops); h++) {
    if (keep.size >= cap) break; // fan-out cap reached — stop expanding.
    const next = new Set();
    for (const e of edges) {
      const s = e?.source, t = e?.target;
      if (frontier.has(s) && t != null && idx.has(t) && !keep.has(t)) next.add(t);
      if (frontier.has(t) && s != null && idx.has(s) && !keep.has(s)) next.add(s);
    }
    for (const n of next) {
      if (keep.size >= cap) break; // never exceed the cap (twins already kept).
      keep.add(n);
    }
    frontier = next;
    if (next.size === 0) break;
  }
  const nodes = [...keep].map((id) => idx.get(id)).filter(Boolean);
  const links = edges.filter((e) => keep.has(e?.source) && keep.has(e?.target));
  return { nodes, links };
}

/**
 * SVELTE-7: add a synthetic "reconciliation" edge between the two candidate
 * entities so the force layout pulls them side by side and the link is visible
 * (the twins usually have no direct edge). Marked `reconcile: true` and given a
 * relation label so consumers can render and label it consistently.
 */
export function withReconcileEdge(scene, idA, idB) {
  if (!scene || !idA || !idB) return scene;
  const ids = new Set((scene.nodes ?? []).map((n) => n.id));
  if (!ids.has(idA) || !ids.has(idB)) return scene;
  const exists = (scene.edges ?? []).some(
    (e) =>
      (e.source === idA && e.target === idB) || (e.source === idB && e.target === idA),
  );
  if (exists) return scene;
  return {
    ...scene,
    edges: [
      ...(scene.edges ?? []),
      // UAT R2-7: bold reconcile edge. Keep both semantic emphasis and an
      // explicit width so renderers can choose the strongest signal they support.
      {
        source: idA,
        target: idB,
        relation: "≈ reconcile",
        reconcile: true,
        emphasis: true,
        width: 3,
        dash: "solid",
      },
    ],
  };
}

// ---- Recon twin spacing (focal box overlap fix) ---------------------------
//
// Mirror of the renderer's legacy `shape:box` metrics (packages/graph/src/
// renderer.ts `boxDimensions`): box height = BOX_BASE_HEIGHT_PX × pixelRatio ×
// zoom DEVICE px, font = height × 12/22, margin = height × 5/22 per side,
// drawn width = measureText(label, font) + 2 × margin. Positions map world →
// device px through the camera zoom alone (screen = (world − cam.x) × zoom +
// w/2), so dividing the screen width by zoom CANCELS the zoom: a box's
// WORLD-space width depends only on pixelRatio and the label —
//   worldWidth(label) = BOX_BASE_HEIGHT_PX × pixelRatio
//                       × ((12/22) × textW(label)@1px + 10/22)
// — which lets the recon view pick a pin offset that clears the boxes at ANY
// fit zoom, without knowing the zoom at pin time.
const RECON_BOX_BASE_HEIGHT_PX = 18; // renderer BOX_BASE_HEIGHT_PX
const RECON_BOX_FONT_RATIO = 12 / 22; // renderer BOX_FONT_RATIO
const RECON_BOX_MARGIN_RATIO = 5 / 22; // renderer BOX_MARGIN_RATIO
const RECON_BOX_EMPTY_RATIO = 10 / 22; // renderer BOX_EMPTY_RATIO (no-label box)
// Gap between the two focal boxes, as a fraction of the box height (world
// units, so it scales with zoom exactly like the boxes — the pair reads the
// same at any fit). Half a box height ≈ 23 CSS px at the typical mystery-pack
// recon fit zoom (measured), inside the 16–24 px band.
const RECON_TWIN_GAP_RATIO = 0.5;
// Approximate average sans-serif glyph advance (fraction of the font size)
// for headless environments without a Canvas2D `measureText` (vitest/jsdom).
const RECON_FALLBACK_GLYPH_RATIO = 0.6;

let reconMeasureContext; // lazily created offscreen 2d context (browser only)

function measureLabelWidthPx(text, font) {
  if (reconMeasureContext === undefined) {
    try {
      // jsdom THROWS on getContext (no canvas package) — treat as "no 2d".
      reconMeasureContext =
        typeof document !== "undefined" && typeof document.createElement === "function"
          ? (document.createElement("canvas").getContext?.("2d") ?? null)
          : null;
    } catch {
      reconMeasureContext = null;
    }
  }
  if (reconMeasureContext) {
    reconMeasureContext.font = font;
    const width = reconMeasureContext.measureText?.(text)?.width;
    if (finiteNumber(width)) return width;
  }
  const size = Number.parseFloat(font);
  return text.length * (finiteNumber(size) ? size : 12) * RECON_FALLBACK_GLYPH_RATIO;
}

/**
 * WORLD-space drawn width of a labelled recon focal box (zoom-independent, see
 * the derivation above). `measure(text, font)` is injectable for tests.
 */
export function reconBoxWorldWidth(label, { pixelRatio = 1, measure = measureLabelWidthPx } = {}) {
  const ratio = finiteNumber(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
  const heightWorld = RECON_BOX_BASE_HEIGHT_PX * ratio;
  const text = label == null ? "" : String(label);
  if (!text) return heightWorld * RECON_BOX_EMPTY_RATIO;
  // Measure at the box's WORLD font size (screen font / zoom); measureText is
  // ~linear in font size, so this is the screen width / zoom we need.
  const fontWorld = heightWorld * RECON_BOX_FONT_RATIO;
  const textWidth = measure(text, `${fontWorld}px sans-serif`);
  return textWidth + 2 * heightWorld * RECON_BOX_MARGIN_RATIO;
}

/**
 * Horizontal pin half-offset `dx` for the two recon focal boxes, COMPUTED from
 * the labels' drawn widths (not a hand-tuned constant): the twins sit at
 * (cx − dx, cy) / (cx + dx, cy), so non-overlap needs
 *   2 × dx ≥ worldWidth(A)/2 + worldWidth(B)/2 + gap.
 * Long labels (e.g. "Dr. John H. Watson" twice) get pushed apart exactly far
 * enough; short labels stay compact because dx tracks the actual widths.
 */
export function reconTwinPinOffset(labelA, labelB, options = {}) {
  const pixelRatio = finiteNumber(options.pixelRatio)
    ? options.pixelRatio
    : (typeof window !== "undefined" && finiteNumber(window.devicePixelRatio)
        ? window.devicePixelRatio
        : 1);
  const opts = { ...options, pixelRatio };
  const ratio = pixelRatio > 0 ? pixelRatio : 1;
  const gap = RECON_BOX_BASE_HEIGHT_PX * ratio * RECON_TWIN_GAP_RATIO;
  const halfA = reconBoxWorldWidth(labelA, opts) / 2;
  const halfB = reconBoxWorldWidth(labelB, opts) / 2;
  return (halfA + halfB + gap) / 2;
}

/**
 * Reconciliation centering (#2.2): run a LOCAL deterministic force layout over a
 * reconciliation subgraph so the neighbours arrange AROUND the side-by-side twins.
 *
 * The two twins are expected to already carry `fx`/`fy` pins (set by the recon
 * view at the centre of the layout box); `computeLayout` holds any node with
 * finite fx/fy FIXED, so they stay put while the rest settle around them. After
 * the sim we WRITE BACK the settled positions onto every node as BOTH `x`/`y`
 * and `fx`/`fy`, so GraphCanvas renders the pinned, compact, centred cluster
 * directly (no live sim) and `fitView` frames a tight, twinned group.
 *
 * @param {{ nodes: object[], edges: object[] }} scene  subgraph scene (twins pinned)
 * @param {object} [options]  forwarded to computeLayout (iterations/width/height…)
 * @returns {{ nodes: object[], edges: object[] }} a NEW scene with positions set
 */
export function attachReconLayout(scene, options = {}) {
  if (!scene || !Array.isArray(scene.nodes) || scene.nodes.length === 0) return scene;
  // Centre the layout box on the twins' pin centre so the settled cluster (and
  // the gravity well) sits where the twins are pinned.
  const pinned = scene.nodes.filter((n) => finiteNumber(n.fx) && finiteNumber(n.fy));
  const width = finiteNumber(options.width) ? options.width : 720;
  const height = finiteNumber(options.height) ? options.height : 560;
  const cx = pinned.length ? pinned.reduce((s, n) => s + n.fx, 0) / pinned.length : width / 2;
  const cy = pinned.length ? pinned.reduce((s, n) => s + n.fy, 0) / pinned.length : height / 2;
  // computeLayout pulls free nodes toward (width/2, height/2); offset the box so
  // that centre lands on the twins' pin centre.
  const layoutNodes = scene.nodes.map((n) => ({
    id: n.id,
    fx: finiteNumber(n.fx) ? n.fx - cx + width / 2 : undefined,
    fy: finiteNumber(n.fy) ? n.fy - cy + height / 2 : undefined,
  }));
  const positions = computeLayout(layoutNodes, scene.edges ?? [], {
    iterations: 120,
    width,
    height,
    ...options,
  });
  const byId = new Map(positions.map((p) => [p.id, p]));
  const nodes = scene.nodes.map((n) => {
    const p = byId.get(n.id);
    if (!p) return n;
    // Shift the settled box back so the twins' pin centre is honoured.
    const x = p.x - width / 2 + cx;
    const y = p.y - height / 2 + cy;
    return { ...n, x, y, fx: x, fy: y };
  });
  return { ...scene, nodes };
}

// ---- Selection resolution (R8-3) -----------------------------------------

/** Entities of a given ontology type: [{ id, label }], sorted by label. */
export function entitiesByType(graph, type) {
  return graphIndex(graph).byType.get(type) ?? [];
}

/** Entities of a given community: [{ id, label }], sorted by label. */
export function entitiesByCommunity(graph, community) {
  return graphIndex(graph).byCommunity.get(community) ?? [];
}

/**
 * Graph `selectedIds` derived from a selection: every entity of every selected
 * type/community, plus the directly-selected entities. One pass over the nodes.
 */
export function resolveSelectedIds(graph, selection) {
  const ids = new Set(selection?.entities ?? []);
  const types = new Set(selection?.types ?? []);
  const comms = new Set(selection?.communities ?? []);
  if (types.size > 0 || comms.size > 0) {
    for (const n of graphNodes(graph)) {
      if (types.has(nodeType(n)) || comms.has(nodeCommunity(n))) ids.add(n.id);
    }
  }
  return [...ids];
}
