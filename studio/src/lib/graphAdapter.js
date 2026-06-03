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
function weightForDegree(degree) {
  if (!Number.isFinite(degree) || degree <= 0) return 1;
  // 0->1, 5->~1.6, 20->~2.3; log keeps the spread readable.
  return Math.min(2.6, 1 + Math.log1p(degree) / 2.2);
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

  const nodes = rawNodes.map((node) => {
    const group = nodeGroup(node);
    const out = {
      id: node.id,
      label: nodeLabel(node),
      weight: weightForDegree(degree.get(node.id) ?? 0),
    };
    if (group !== undefined) out.group = group;
    return out;
  });

  const sceneEdges = edges.map((edge) => {
    const out = { source: edge.source, target: edge.target };
    const relation = displayValue(edge.relation);
    if (relation) out.relation = relation;
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
      communityCount: new Set(nodes.map((n) => n.group).filter((g) => g !== undefined)).size,
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
