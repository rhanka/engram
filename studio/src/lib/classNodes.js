/**
 * EVOL 2.a — ontology CLASS-node injection (studio side).
 *
 * Consumes the standalone `class-hierarchies.json` artifact (schema
 * `graphify_ontology_class_hierarchies_v1`, emitted by EVOL 2.c) and injects
 * SYNTHETIC class nodes + their structural edges INTO a GraphLike payload, so
 * the Options toggle can show ontology classes connected to their member
 * entities. The result is a NEW graph ({ nodes, links }) — the original is
 * never mutated — that the existing `buildScene` then turns into a scene, which
 * keeps degrees / god-class / weak-filter operating on the displayed topology.
 *
 * The injection is PURE and ADDITIVE:
 *   - OFF (toggle off, the default) means this module is never called and the
 *     studio renders exactly as before.
 *   - A null / empty `classHierarchies` artifact returns the graph unchanged.
 *
 * Class node shape (id taken VERBATIM from the artifact, e.g. "class:Character"):
 *   { id, label, type: "OntologyClass", ontology_node_kind: "class",
 *     ontology_class_id: "<Name>", level }
 *
 * Synthetic edges (always flagged `structural: true` so the renderer / degree
 * election can exclude them):
 *   - has_instance : class -> each member entity id present in the graph
 *       { relation: "has_instance", ontology_edge_kind: "membership" }
 *   - subclass_of  : parent class -> child class ("all" levels only)
 *       { relation: "subclass_of", ontology_edge_kind: "subclass" }
 *
 * `levels`:
 *   "leaf" (default) — inject only classes that carry `member_node_types`
 *       (leaf classes) plus their `has_instance` member edges; no inter-class
 *       subclass edges.
 *   "all" — inject EVERY class plus the `subclass_of` edges between them.
 *
 * Idempotent: nodes and edges are de-duplicated by id / (source|target|relation)
 * so re-running over an already-injected graph is a no-op.
 */

/** Class id namespace prefix the artifact uses (`class:<Name>`). */
const CLASS_ID_PREFIX = "class:";

function graphNodeList(graph) {
  return graph?.nodes ?? [];
}

/** Graphify persists `links`; some callers/tests pass `edges`. Accept both. */
function graphEdgeList(graph) {
  return graph?.edges ?? graph?.links ?? [];
}

/** True for a class entry that gathers entity members (a leaf class). */
function isLeafClass(entry) {
  return Array.isArray(entry?.member_node_types) && entry.member_node_types.length > 0;
}

/**
 * Inject ontology CLASS nodes + their structural edges into a GraphLike payload.
 *
 * @param {{ nodes?: object[], links?: object[], edges?: object[] }} graph
 *        the source graph (returned unchanged when there is nothing to inject).
 * @param {object|null} classHierarchies  the `class-hierarchies.json` artifact
 *        ({ hierarchies: { <id>: { classes_by_id, ... } } }), or null.
 * @param {object} [options]
 * @param {"leaf"|"all"} [options.levels="leaf"]  which classes to inject.
 * @returns {{ nodes: object[], links: object[] }} a NEW graph (original + class
 *        nodes + synthetic edges), or the original graph when nothing is added.
 */
export function injectOntologyClassNodes(graph, classHierarchies, { levels = "leaf" } = {}) {
  const hierarchies = classHierarchies?.hierarchies;
  if (!hierarchies || typeof hierarchies !== "object") return graph;

  const baseNodes = graphNodeList(graph);
  const baseEdges = graphEdgeList(graph);

  // Entity ids already present in the graph — has_instance edges are only drawn
  // to members that actually exist in the displayed topology.
  const entityIds = new Set(baseNodes.map((n) => n.id));
  // Track ids already present so re-injection (idempotency) never duplicates a
  // class node, and an existing entity id can never be overwritten by a class.
  const nodeIds = new Set(entityIds);
  // Dedup synthetic edges by directional key so parallel injections collapse.
  const edgeKeys = new Set(
    baseEdges.map((e) => `${e.source} ${e.target} ${e.relation ?? e.relation_type ?? ""}`),
  );

  const addedNodes = [];
  const addedEdges = [];
  const all = levels === "all";

  function pushEdge(source, target, relation, ontologyEdgeKind) {
    const key = `${source} ${target} ${relation}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    addedEdges.push({
      source,
      target,
      relation,
      structural: true,
      ontology_edge_kind: ontologyEdgeKind,
    });
  }

  for (const hierarchy of Object.values(hierarchies)) {
    const classesById = hierarchy?.classes_by_id;
    if (!classesById || typeof classesById !== "object") continue;

    for (const entry of Object.values(classesById)) {
      const id = typeof entry?.id === "string" ? entry.id : null;
      if (!id) continue;
      const leaf = isLeafClass(entry);
      // "leaf" mode only injects leaf classes (those with entity members).
      if (!all && !leaf) continue;

      // Class node (deduped by id; an existing entity id is never clobbered).
      if (!nodeIds.has(id)) {
        nodeIds.add(id);
        const name = id.startsWith(CLASS_ID_PREFIX) ? id.slice(CLASS_ID_PREFIX.length) : id;
        addedNodes.push({
          id,
          label: typeof entry.label === "string" && entry.label ? entry.label : name,
          type: "OntologyClass",
          ontology_node_kind: "class",
          ontology_class_id: name,
          level: typeof entry.level === "number" ? entry.level : 0,
        });
      }

      // has_instance: class -> each member entity present in the graph.
      if (leaf && Array.isArray(entry.member_ids)) {
        for (const memberId of entry.member_ids) {
          if (entityIds.has(memberId)) pushEdge(id, memberId, "has_instance", "membership");
        }
      }
    }

    // subclass_of: parent class -> child class. "all" levels only — leaf mode
    // injects no inter-class edges. Drawn only between injected class nodes.
    if (all) {
      for (const entry of Object.values(classesById)) {
        const id = typeof entry?.id === "string" ? entry.id : null;
        if (!id || !Array.isArray(entry.child_ids)) continue;
        for (const childId of entry.child_ids) {
          if (nodeIds.has(childId)) pushEdge(id, childId, "subclass_of", "subclass");
        }
      }
    }
  }

  if (addedNodes.length === 0 && addedEdges.length === 0) return graph;

  return {
    nodes: [...baseNodes, ...addedNodes],
    links: [...baseEdges, ...addedEdges],
  };
}

/* ===========================================================================
 * EVOL 2.b + 2.d — ontology category COLLAPSE with multi-level link inheritance
 *
 * `applyOntologyCollapse` folds the descendants (sub-classes AND member
 * entities) of any collapsed class into the collapsed class node, re-endpointing
 * every edge to the NEAREST VISIBLE ANCESTOR of each former endpoint. Because
 * the re-endpointing walks each id's parent chain to the nearest *visible*
 * ancestor, collapsing at ANY level just works (2.d, multi-level): collapse a
 * high super-class and its whole subtree folds into it; collapse a leaf class
 * and only its entities fold; leave an inner class expanded and the edge renders
 * at that inner (still-visible) level. v1 = collapsedClasses only (no expand
 * override), per consensus D3.
 *
 * It runs on a graph that was ALREADY injected with class nodes at `levels:
 * "all"` (so every intermediate class exists as a collapse handle). The output
 * is a NEW graph; empty `collapsedClassIds` returns the input unchanged.
 * ======================================================================== */

/**
 * Build the parent-chain index used by collapse re-endpointing.
 *
 * `parentById` covers BOTH directions of the chain in one map:
 *   - class node      `class:X` -> its `parent_id` (or null at a root)
 *   - entity node     `<entityId>` -> the LEAF class id it is a member of
 * so an entity's ancestor chain is `leafClass -> … -> rootClass`, and any id can
 * be walked upward uniformly.
 *
 * `classIdByMemberId` is the entity -> leaf-class lookup on its own (the entity
 * leg of `parentById`). `descendantClassIds` maps every class id to the set of
 * its descendant CLASS ids (transitive child_ids, excluding itself).
 *
 * @param {object|null} classHierarchies the class-hierarchies.json artifact.
 * @returns {{ parentById: Map<string,string|null>,
 *             classIdByMemberId: Map<string,string>,
 *             descendantClassIds: Map<string,Set<string>> }}
 */
export function buildClassParentIndex(classHierarchies) {
  const parentById = new Map();
  const classIdByMemberId = new Map();
  const descendantClassIds = new Map();

  const hierarchies = classHierarchies?.hierarchies;
  if (!hierarchies || typeof hierarchies !== "object") {
    return { parentById, classIdByMemberId, descendantClassIds };
  }

  const childIdsByClass = new Map();

  for (const hierarchy of Object.values(hierarchies)) {
    const classesById = hierarchy?.classes_by_id;
    if (!classesById || typeof classesById !== "object") continue;

    for (const entry of Object.values(classesById)) {
      const id = typeof entry?.id === "string" ? entry.id : null;
      if (!id) continue;

      // Class -> parent class (null at a root).
      parentById.set(id, typeof entry.parent_id === "string" ? entry.parent_id : null);
      childIdsByClass.set(id, Array.isArray(entry.child_ids) ? entry.child_ids : []);

      // Entity -> its leaf class. A node listed under several classes keeps the
      // first (deterministic by classes_by_id iteration) — mono-parent v1.
      if (Array.isArray(entry.member_ids)) {
        for (const memberId of entry.member_ids) {
          if (typeof memberId === "string" && !classIdByMemberId.has(memberId)) {
            classIdByMemberId.set(memberId, id);
            parentById.set(memberId, id);
          }
        }
      }
    }
  }

  // Transitive class descendants (DFS over child_ids), memoized per class.
  function collectDescendants(classId, seen) {
    const cached = descendantClassIds.get(classId);
    if (cached) return cached;
    const out = new Set();
    if (seen.has(classId)) return out; // cycle guard (artifact is mono-parent, but be safe)
    seen.add(classId);
    for (const childId of childIdsByClass.get(classId) ?? []) {
      if (typeof childId !== "string") continue;
      out.add(childId);
      for (const deep of collectDescendants(childId, seen)) out.add(deep);
    }
    seen.delete(classId);
    descendantClassIds.set(classId, out);
    return out;
  }
  for (const classId of childIdsByClass.keys()) collectDescendants(classId, new Set());

  return { parentById, classIdByMemberId, descendantClassIds };
}

/**
 * Resolve `id` to the nearest VISIBLE ancestor along its parent chain.
 *
 * Returns `id` itself when it is visible; otherwise walks `parentById` upward
 * and returns the first visible ancestor; `null` when nothing in the chain is
 * visible (e.g. the chain runs off the top with everything collapsed away).
 *
 * @param {string} id
 * @param {Set<string>} visibleIds
 * @param {Map<string,string|null>} parentById
 * @returns {string|null}
 */
export function nearestVisibleAncestor(id, visibleIds, parentById) {
  let current = id;
  const guard = new Set();
  while (current != null && !guard.has(current)) {
    if (visibleIds.has(current)) return current;
    guard.add(current);
    current = parentById.get(current) ?? null;
  }
  return null;
}

/** True when an edge is "weak" (inferred), mirroring graphAdapter's rule. */
function edgeIsWeak(edge) {
  if (typeof edge?.weak === "boolean") return edge.weak;
  return (edge?.confidence ?? "EXTRACTED") !== "EXTRACTED";
}

function edgeRelation(edge) {
  return edge?.relation ?? edge?.relation_type ?? "";
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

/**
 * EVOL 2.b + 2.d — collapse ontology classes with multi-level link inheritance.
 *
 * Produces a NEW graph in which every descendant (sub-class + member entity) of
 * a collapsed class is HIDDEN and folded into that collapsed class node (which
 * itself stays visible). Every edge is re-endpointed to the nearest visible
 * ancestor of each endpoint; edges whose endpoint resolves to nothing are
 * dropped, self-loops are dropped (and counted as internal), and parallel edges
 * are aggregated.
 *
 * @param {{ nodes?: object[], links?: object[], edges?: object[] }} graph
 *        a graph already injected with class nodes (levels: "all").
 * @param {object|null} classHierarchies the class-hierarchies.json artifact.
 * @param {object} [options]
 * @param {string[]} [options.collapsedClassIds=[]] class ids to collapse.
 * @returns {{ nodes: object[], links: object[] }} a NEW graph, or the input
 *        unchanged when nothing is collapsed.
 */
export function applyOntologyCollapse(
  graph,
  classHierarchies,
  { collapsedClassIds = [] } = {},
) {
  const collapsed = new Set(
    (collapsedClassIds ?? []).filter((id) => typeof id === "string" && id.length > 0),
  );
  if (collapsed.size === 0) return graph;

  const baseNodes = graphNodeList(graph);
  const baseEdges = graphEdgeList(graph);
  const { parentById, descendantClassIds } = buildClassParentIndex(classHierarchies);

  // Ids hidden by the collapse: every CLASS + ENTITY descendant of any collapsed
  // class. The collapsed class node itself STAYS visible (it is the fold target).
  const hidden = new Set();
  for (const classId of collapsed) {
    for (const descClassId of descendantClassIds.get(classId) ?? []) hidden.add(descClassId);
  }
  // Entity members fold under a collapsed class when their leaf class is the
  // collapsed class OR one of its (now hidden) descendant classes.
  for (const node of baseNodes) {
    const id = node?.id;
    if (typeof id !== "string") continue;
    const leafClassId = parentById.get(id); // entity -> its leaf class (or undefined)
    if (typeof leafClassId !== "string") continue;
    if (collapsed.has(leafClassId) || hidden.has(leafClassId)) hidden.add(id);
  }
  // The collapsed class nodes are never themselves hidden.
  for (const classId of collapsed) hidden.delete(classId);

  const visibleIds = new Set();
  for (const node of baseNodes) {
    if (typeof node?.id === "string" && !hidden.has(node.id)) visibleIds.add(node.id);
  }

  // Re-endpoint + aggregate every edge. Aggregation key is directional and keeps
  // strong/weak and relation distinct so different relation types never merge.
  const aggregated = new Map();
  // internal_edge_count: edges that became self-loops inside a collapsed class.
  const internalCountByClass = new Map();

  // Stable edge order so aggregation (and thus output) is deterministic.
  const orderedEdges = [...baseEdges]
    .map((edge, index) => ({ edge, index }))
    .sort((a, b) => {
      const ka = `${a.edge.source}|${a.edge.target}|${edgeRelation(a.edge)}`;
      const kb = `${b.edge.source}|${b.edge.target}|${edgeRelation(b.edge)}`;
      return ka < kb ? -1 : ka > kb ? 1 : a.index - b.index;
    });

  for (const { edge } of orderedEdges) {
    const source = nearestVisibleAncestor(edge.source, visibleIds, parentById);
    const target = nearestVisibleAncestor(edge.target, visibleIds, parentById);
    // An endpoint that resolves to nothing visible -> drop the edge.
    if (source == null || target == null) continue;
    // Self-loop after folding -> drop, but tally it as an internal edge of the
    // collapsed class it folded into.
    if (source === target) {
      if (collapsed.has(source)) {
        internalCountByClass.set(source, (internalCountByClass.get(source) ?? 0) + 1);
      }
      continue;
    }

    const weak = edgeIsWeak(edge);
    const relation = edgeRelation(edge);
    const key = `${source}|${target}|${relation}|${weak ? 1 : 0}`;
    const existing = aggregated.get(key);
    if (existing) {
      existing.aggregate_count += 1;
      for (const ref of asArray(edge.evidence_refs)) existing._evidence.add(ref);
      // Structural only survives when EVERY aggregated edge was structural.
      if (!edge.structural) existing._structural = false;
    } else {
      const evidence = new Set(asArray(edge.evidence_refs));
      aggregated.set(key, {
        ...edge,
        source,
        target,
        aggregate_count: 1,
        _evidence: evidence,
        _structural: edge.structural === true,
      });
    }
  }

  const links = [...aggregated.values()].map((agg) => {
    const { _evidence, _structural, ...rest } = agg;
    const out = { ...rest };
    if (_evidence.size > 0) out.evidence_refs = [..._evidence].sort();
    else delete out.evidence_refs;
    if (_structural) out.structural = true;
    else delete out.structural;
    return out;
  });
  // Deterministic edge order for stable test snapshots.
  links.sort((a, b) => {
    const ka = `${a.source}|${a.target}|${edgeRelation(a)}|${edgeIsWeak(a) ? 1 : 0}`;
    const kb = `${b.source}|${b.target}|${edgeRelation(b)}|${edgeIsWeak(b) ? 1 : 0}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

  // Count hidden nodes per collapsed class (its whole hidden subtree). A hidden
  // node is attributed to the nearest collapsed ancestor on its parent chain.
  const hiddenCountByClass = new Map();
  for (const hiddenId of hidden) {
    let current = parentById.get(hiddenId) ?? null;
    const guard = new Set();
    while (current != null && !guard.has(current)) {
      if (collapsed.has(current)) {
        hiddenCountByClass.set(current, (hiddenCountByClass.get(current) ?? 0) + 1);
        break;
      }
      guard.add(current);
      current = parentById.get(current) ?? null;
    }
  }

  const nodes = baseNodes
    .filter((node) => typeof node?.id === "string" && visibleIds.has(node.id))
    .map((node) => {
      if (!collapsed.has(node.id)) return node;
      const hiddenCount = hiddenCountByClass.get(node.id) ?? 0;
      const baseLabel = typeof node.label === "string" && node.label ? node.label : node.id;
      return {
        ...node,
        collapsed: true,
        hidden_node_count: hiddenCount,
        internal_edge_count: internalCountByClass.get(node.id) ?? 0,
        // Visual cue: a collapsed class shows its folded-member count so the
        // renderer's in-box label reads e.g. "Character (+42)".
        label: hiddenCount > 0 ? `${baseLabel} (+${hiddenCount})` : baseLabel,
      };
    });

  return { nodes, links };
}
