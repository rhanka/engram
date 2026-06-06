/**
 * GraphLike -> ForceGraph scene adapter.
 *
 * Pure-data mapping from a Graphify `graph.json` payload to the prop shape the
 * published `@sentropic/design-system-svelte` `ForceGraph` consumes. No DOM, no
 * d3 — the DS component owns the force simulation. This module is the single
 * source of truth the workspace state and the vitest suite both build on.
 *
 * Mapping (handed down by the DS contract):
 *   GraphLike node -> ForceGraph node:
 *     id    <- node.id
 *     label <- node.label || node.title || node.name || node.id
 *     group <- node.community_name || node.community || node.type  (in that order)
 *     weight<- degree-derived (more relations => bigger node)
 *   GraphLike link -> ForceGraph edge:
 *     source/target <- link.source/target
 *     relation      <- link.relation
 *     weak          <- (link.confidence ?? "EXTRACTED") !== "EXTRACTED"
 */

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
 * type. Returns `undefined` when nothing is known so the DS falls back to a
 * per-index tone.
 */
export function nodeGroup(node) {
  const community =
    displayValue(node?.community_name) ??
    (typeof node?.community === "number" ? `community:${node.community}` : null);
  if (community) return community;
  return nodeType(node) ?? undefined;
}

/**
 * SVELTE-4: map an ontology node type to a DS ForceGraph shape, mirroring the
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
  Work: "roundedbox",
  Saga: "roundedbox",
  ChapterOrStory: "roundedbox",
  Author: "roundedbox",
  Translator: "roundedbox",
};

/**
 * Map an ontology relation to a typed dash style (ForceGraph 0.10.5).
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

/** Distinct (type -> shape) legend entries present in a graph (SVELTE-4). */
/** Edge legend (dash family -> relation kind), appended after the node shapes. */
const RELATION_LEGEND = [
  { label: "belonging / structure", dash: "solid" },
  { label: "agency / interaction", dash: "dashed" },
  { label: "spatial / factual", dash: "dotted" },
  { label: "method / usage", dash: "long-dash" },
];
export function shapeLegend(graph) {
  const seen = new Map();
  for (const node of graphNodes(graph)) {
    const t = nodeType(node);
    if (t && !seen.has(t)) seen.set(t, shapeForType(node));
  }
  const shapeEntries = [...seen.entries()].map(([label, shape]) => ({ label, shape }));
  return [...shapeEntries, ...RELATION_LEGEND];
}

/** Strong = EXTRACTED (default). Anything else (INFERRED, …) renders weak. */
export function isStrongEdge(edge) {
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
 * Map degree -> ForceGraph `weight` (relative node radius multiplier).
 * Clamped to a gentle range so hubs read bigger without dwarfing leaves.
 */
// Legacy autosizing: node radius is LINEAR in degree, NORMALISED by the graph's
// max degree — r = rmin + (rmax - rmin) * (deg / maxDeg) (legacy used
// r = 4 + 12*(deg/maxDeg), i.e. an rmax/rmin ratio of 4). The DS renders
// r = nodeRadius * sqrt(weight), so to get that linear r we pass
// weight = (r_target / nodeRadius)^2 with nodeRadius = rmin (3px in GraphCanvas).
const RADIUS_RATIO = 4; // rmax / rmin, matches the legacy 4->16 spread
function weightForDegree(degree, maxDegree) {
  const max = Number.isFinite(maxDegree) && maxDegree > 0 ? maxDegree : 1;
  const ratio = Math.min(1, Math.max(0, (Number.isFinite(degree) ? degree : 0) / max));
  // r_target/rmin = 1 + (RADIUS_RATIO - 1) * ratio ; weight = (r_target/rmin)^2.
  const rOverRmin = 1 + (RADIUS_RATIO - 1) * ratio;
  return rOverRmin * rOverRmin;
}

/**
 * Build the full ForceGraph scene from a GraphLike payload.
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

  const nodes = rawNodes.map((node) => {
    const group = nodeGroup(node);
    const out = {
      id: node.id,
      label: nodeLabel(node),
      weight: weightForDegree(degree.get(node.id) ?? 0, maxDegree),
      shape: shapeForType(node), // SVELTE-4: ontology type -> DS shape
    };
    if (group !== undefined) out.group = group;
    return out;
  });

  const sceneEdges = edges.map((edge) => {
    const out = { source: edge.source, target: edge.target };
    const relation = displayValue(edge.relation);
    if (relation) {
      out.relation = relation;
      // SVELTE/UAT R3-8: typed dash per relation family (ForceGraph 0.10.5).
      const dash = dashForRelation(edge.relation);
      if (dash) out.dash = dash;
    }
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

  const nodes = rawNodes.map((node) => ({
    ...node,
    weight: weightForDegree(degree.get(node.id) ?? 0, maxDegree),
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
export function communityStats(graph) {
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
 * SVELTE-2: group a node's citations by source file, with their passages.
 * Each citation is `{ source_file, section?, quote? }`. Returns one entry per
 * distinct file, with its passages (section + optional verbatim quote). Used by
 * the entity panel's double accordion (file > passages) for full traceability.
 * @returns {{ file: string, count: number, passages: { section: string|null, quote: string|null }[] }[]}
 */
export function citationsByFile(node) {
  const cites = Array.isArray(node?.citations) ? node.citations : [];
  const byFile = new Map();
  for (const c of cites) {
    const file = displayValue(c?.source_file) ?? displayValue(node?.source_file) ?? "(unknown source)";
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
 * SVELTE-7: build a focused subgraph around two reconciliation-candidate
 * entities. Includes both anchors + their neighbours up to `hops` (default 1),
 * and every edge whose endpoints are both in the kept set. Returns a graph
 * shaped like the full one ({ nodes, links }) so buildScene can consume it.
 */
export function candidateSubgraph(graph, idA, idB, hops = 1) {
  const idx = indexNodes(graph);
  const edges = graphEdges(graph);
  const keep = new Set();
  for (const a of [idA, idB]) {
    if (a != null && idx.has(a)) keep.add(a);
  }
  let frontier = new Set(keep);
  for (let h = 0; h < Math.max(0, hops); h++) {
    const next = new Set();
    for (const e of edges) {
      const s = e?.source, t = e?.target;
      if (frontier.has(s) && t != null && idx.has(t) && !keep.has(t)) next.add(t);
      if (frontier.has(t) && s != null && idx.has(s) && !keep.has(s)) next.add(s);
    }
    for (const n of next) keep.add(n);
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
 * relation label so the DS edge tooltip reads it; consumers render it bold.
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
      // UAT R2-7: bold reconcile edge (ForceGraph 0.10.5). `width` takes
      // precedence over `emphasis` per the DS API, so set both for a clear bold.
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

// ---- Selection resolution (R8-3) -----------------------------------------

/** Entities of a given ontology type: [{ id, label }], sorted by label. */
export function entitiesByType(graph, type) {
  return graphNodes(graph)
    .filter((n) => nodeType(n) === type)
    .map((n) => ({ id: n.id, label: nodeLabel(n) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Entities of a given community: [{ id, label }], sorted by label. */
export function entitiesByCommunity(graph, community) {
  return graphNodes(graph)
    .filter((n) => nodeCommunity(n) === community)
    .map((n) => ({ id: n.id, label: nodeLabel(n) }))
    .sort((a, b) => a.label.localeCompare(b.label));
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
