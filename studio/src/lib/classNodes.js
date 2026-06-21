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

/**
 * Community synthetic-node id namespace prefix (B2 / Amendment A2). The id of a
 * community fold node is minted ONLY by `communityNodeId`, never by raw concat,
 * so click dispatch and collision detection have a single, auditable mint point
 * — mirroring the `class:` discipline above. This is DISTINCT from the
 * `nodeGroup` tone palette key (`community:<n>`, graphAdapter.js): keep the
 * palette key, the `community_key` passthrough, and this synthetic id three
 * separate, unambiguous things.
 */
const COMMUNITY_ID_PREFIX = "community-node:";

/**
 * Mint the reserved synthetic id for a community fold node from its key
 * (Amendment A2). The id is namespaced so it cannot be confused with a class id;
 * collision against a REAL node id is the caller's concern (see
 * `mintCommunityNodeIds`), which is why this helper is the only mint point.
 * @param {string} key  the community key (a `nodeCommunity` value).
 * @returns {string}
 */
export function communityNodeId(key) {
  return `${COMMUNITY_ID_PREFIX}${key}`;
}

/**
 * Deterministically assign a non-colliding synthetic id to every live community
 * key (Amendment A2 — collision detection is MANDATORY). The naive id is
 * `communityNodeId(key)`; if that literal already exists as a REAL node id we do
 * NOT silently reuse it (which would let re-endpointing land edges on the wrong
 * node). Instead we disambiguate by appending a numeric sentinel until the id is
 * free, and record the chosen id. The mapping is returned so both the injector
 * and the parent-index build from the SAME ids.
 *
 * @param {Iterable<string>} liveKeys  the live community keys to mint ids for.
 * @param {Set<string>} existingIds    every id already present in the graph.
 * @returns {Map<string,string>} community key -> chosen collision-free node id.
 */
export function mintCommunityNodeIds(liveKeys, existingIds) {
  const idByKey = new Map();
  const taken = new Set(existingIds);
  for (const key of liveKeys) {
    if (typeof key !== "string" || key.length === 0 || idByKey.has(key)) continue;
    let id = communityNodeId(key);
    // Collision with a real node id (or an already-minted synthetic) -> append a
    // deterministic sentinel until free. The chosen id is recorded so the real
    // node is never re-endpointed onto.
    let salt = 1;
    while (taken.has(id)) {
      id = `${communityNodeId(key)}#${salt}`;
      salt += 1;
    }
    taken.add(id);
    idByKey.set(key, id);
  }
  return idByKey;
}

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
 * B2 — generalized, AXIS-NEUTRAL collapse engine (single source of truth).
 *
 * Lifted verbatim from `applyOntologyCollapse` (EVOL 2.b/2.d), this is the one
 * re-endpointing engine shared by the Ontology (multi-level) and Community
 * (single-level degenerate) group-by axes. The only axis-specific input is the
 * parent index; the link-bubbling contract (re-endpoint to nearest visible
 * ancestor, drop dangling, drop+tally self-loops, aggregate parallels by
 * `source|target|relation|weak`, structural-only-if-unanimous, weak preserved,
 * `(+N)` fold-node annotations, deterministic order) is identical on every axis.
 *
 * Produces a NEW graph in which every descendant of a collapse target is HIDDEN
 * and folded into that target node (which itself stays visible). For ontology a
 * target's descendants are its sub-class CLASS ids; for community the set is
 * empty (members fold via the entity leg of `parentById` only).
 *
 * @param {{ nodes?: object[], links?: object[], edges?: object[] }} graph
 *        a graph already injected with the axis's synthetic group nodes.
 * @param {object} index
 * @param {Map<string,string|null>} index.parentById     each id -> its parent
 *        (entity -> its leaf group; group -> its parent group, null at a root).
 * @param {Iterable<string>} index.collapseTargets        the group ids to fold.
 * @param {Map<string,Set<string>>} index.descendantsByTarget  target -> its
 *        descendant GROUP ids (∅ for a single-level axis like community).
 * @returns {{ nodes: object[], links: object[] }} a NEW graph, or the input
 *        unchanged when nothing is collapsed.
 */
export function applyGroupCollapse(
  graph,
  { parentById = new Map(), collapseTargets = [], descendantsByTarget = new Map() } = {},
) {
  const collapsed = new Set(
    [...(collapseTargets ?? [])].filter((id) => typeof id === "string" && id.length > 0),
  );
  if (collapsed.size === 0) return graph;

  const baseNodes = graphNodeList(graph);
  const baseEdges = graphEdgeList(graph);

  // Ids hidden by the collapse: every GROUP + ENTITY descendant of any collapse
  // target. The target node itself STAYS visible (it is the fold target).
  const hidden = new Set();
  for (const targetId of collapsed) {
    for (const descId of descendantsByTarget.get(targetId) ?? []) hidden.add(descId);
  }
  // Entity members fold under a collapse target when their leaf group is the
  // target itself OR one of its (now hidden) descendant groups. For the
  // single-level community axis `descendantsByTarget` is empty, so this reduces
  // to "entity whose community is the collapsed one folds in one hop".
  for (const node of baseNodes) {
    const id = node?.id;
    if (typeof id !== "string") continue;
    const leafGroupId = parentById.get(id); // entity -> its leaf group (or undefined)
    if (typeof leafGroupId !== "string") continue;
    if (collapsed.has(leafGroupId) || hidden.has(leafGroupId)) hidden.add(id);
  }
  // The collapse target nodes are never themselves hidden.
  for (const targetId of collapsed) hidden.delete(targetId);

  const visibleIds = new Set();
  for (const node of baseNodes) {
    if (typeof node?.id === "string" && !hidden.has(node.id)) visibleIds.add(node.id);
  }

  // Re-endpoint + aggregate every edge. Aggregation key is directional and keeps
  // strong/weak and relation distinct so different relation types never merge.
  const aggregated = new Map();
  // internal_edge_count: edges that became self-loops inside a collapse target.
  const internalCountByTarget = new Map();

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
    // collapse target it folded into.
    if (source === target) {
      if (collapsed.has(source)) {
        internalCountByTarget.set(source, (internalCountByTarget.get(source) ?? 0) + 1);
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

  // Count hidden nodes per collapse target (its whole hidden subtree). A hidden
  // node is attributed to the nearest collapsed ancestor on its parent chain.
  const hiddenCountByTarget = new Map();
  for (const hiddenId of hidden) {
    let current = parentById.get(hiddenId) ?? null;
    const guard = new Set();
    while (current != null && !guard.has(current)) {
      if (collapsed.has(current)) {
        hiddenCountByTarget.set(current, (hiddenCountByTarget.get(current) ?? 0) + 1);
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
      const hiddenCount = hiddenCountByTarget.get(node.id) ?? 0;
      const baseLabel = typeof node.label === "string" && node.label ? node.label : node.id;
      return {
        ...node,
        collapsed: true,
        hidden_node_count: hiddenCount,
        internal_edge_count: internalCountByTarget.get(node.id) ?? 0,
        // Visual cue: a collapsed target shows its folded-member count so the
        // renderer's in-box label reads e.g. "Character (+42)".
        label: hiddenCount > 0 ? `${baseLabel} (+${hiddenCount})` : baseLabel,
      };
    });

  return { nodes, links };
}

/**
 * EVOL 2.b/2.d — ontology collapse, now a thin ADAPTER over `applyGroupCollapse`.
 *
 * Builds the ontology parent index (`buildClassParentIndex`) and delegates to the
 * shared engine; behaviour is byte-for-byte identical to the pre-B2 monolithic
 * `applyOntologyCollapse` (same back-compat signature for existing callers/tests).
 *
 * @param {{ nodes?: object[], links?: object[], edges?: object[] }} graph
 *        a graph already injected with class nodes (levels: "all").
 * @param {object|null} classHierarchies the class-hierarchies.json artifact.
 * @param {object} [options]
 * @param {string[]} [options.collapsedClassIds=[]] class ids to collapse.
 * @returns {{ nodes: object[], links: object[] }} a NEW graph, or the input
 *        unchanged when nothing is collapsed.
 */
export function applyOntologyCollapse(graph, classHierarchies, { collapsedClassIds = [] } = {}) {
  const collapseTargets = (collapsedClassIds ?? []).filter(
    (id) => typeof id === "string" && id.length > 0,
  );
  if (collapseTargets.length === 0) return graph;
  const { parentById, descendantClassIds } = buildClassParentIndex(classHierarchies);
  return applyGroupCollapse(graph, {
    parentById,
    collapseTargets,
    descendantsByTarget: descendantClassIds,
  });
}

/* ===========================================================================
 * B2 — COMMUNITY group-by axis: single-level "class layer in disguise".
 *
 * Communities are FLAT (no parent/level/sub-community schema anywhere), so the
 * community axis is a degenerate single-level collapse. A synthetic community
 * fold node is injected per LIVE community key; the multi-level engine
 * degenerates correctly — a hidden entity resolves to its community node in one
 * hop, a visible entity resolves to itself, no special-casing.
 *
 * The studio (graphAdapter) owns `nodeCommunity` and `communityStats`; to avoid
 * a module cycle, the App layer passes the per-node community key + the live-key
 * set + per-key tone IN, rather than this module importing graphAdapter.
 * ======================================================================== */

/**
 * Build the community parent index for `applyGroupCollapse` (Amendments A1+A2).
 *
 * `parentById` maps each entity id to its community fold node id — but ONLY when
 * the entity's community key is in the LIVE set (A1). Entities with no live
 * community key get NO parent, so `nearestVisibleAncestor` resolves them to
 * themselves and they never fold into a missing ancestor (which would make them
 * vanish). Community nodes have no parent (single level) and an EMPTY descendant
 * set (members fold via the entity leg only).
 *
 * @param {{ nodes?: object[] }} graph
 * @param {object} index
 * @param {(node:object)=>string|null} index.communityOf  entity -> community key.
 * @param {Iterable<string>} index.liveKeys                the live community keys.
 * @param {Map<string,string>} [index.idByKey]             key -> synthetic node id
 *        (from `mintCommunityNodeIds`); minted here against the graph if omitted.
 * @returns {{ parentById: Map<string,string|null>,
 *             descendantsByTarget: Map<string,Set<string>>,
 *             idByKey: Map<string,string>,
 *             collapseTargetByKey: (key:string)=>string|undefined }}
 */
export function buildCommunityParentIndex(graph, { communityOf, liveKeys, idByKey } = {}) {
  const baseNodes = graphNodeList(graph);
  const live = new Set([...(liveKeys ?? [])].filter((k) => typeof k === "string" && k.length > 0));
  const ids =
    idByKey instanceof Map
      ? idByKey
      : mintCommunityNodeIds(live, new Set(baseNodes.map((n) => n.id)));

  const parentById = new Map();
  // A1: only entities whose community key is live get a parent (their community
  // fold node). Non-live / community-less entities are left unmapped.
  for (const node of baseNodes) {
    const id = node?.id;
    if (typeof id !== "string") continue;
    const key = communityOf?.(node);
    if (typeof key !== "string" || !live.has(key)) continue;
    const targetId = ids.get(key);
    if (typeof targetId === "string") parentById.set(id, targetId);
  }
  // The community node itself has no parent (single level) — leave it unmapped so
  // it resolves to itself.
  const descendantsByTarget = new Map();
  for (const targetId of ids.values()) descendantsByTarget.set(targetId, new Set());

  return {
    parentById,
    descendantsByTarget,
    idByKey: ids,
    collapseTargetByKey: (key) => ids.get(key),
  };
}

/**
 * Inject one synthetic community fold node per LIVE key + its `has_member`
 * structural edges (mirrors `injectOntologyClassNodes`). Collision-safe ids come
 * from `mintCommunityNodeIds` (Amendment A2) so a real node whose id literally
 * equals `community-node:<key>` is never clobbered or re-endpointed onto.
 *
 * Each community node carries (A2):
 *   - id                : the collision-free synthetic id
 *   - community_node_kind: "community"   (click dispatch recognizes it)
 *   - community_key     : the original key (click reads THIS, never the id)
 *   - type              : "OntologyCommunity"  (box shape via TYPE_SHAPE)
 *   - tone passthrough  : `group` set to the key's `nodeGroup` tone key so the
 *                         fold-node swatch matches the rail/canvas (see A5)
 *
 * @param {{ nodes?: object[], links?: object[], edges?: object[] }} graph
 * @param {object} options
 * @param {(node:object)=>string|null} options.communityOf  entity -> key.
 * @param {Iterable<string>} options.liveKeys                live keys to inject.
 * @param {Map<string,string>} [options.idByKey]            shared minted ids.
 * @param {(key:string)=>string|undefined} [options.toneKeyOf]  key -> nodeGroup
 *        palette key for the swatch (A5); defaults to the key itself.
 * @param {(key:string)=>string|undefined} [options.labelOf]  key -> display label.
 * @returns {{ nodes: object[], links: object[], idByKey: Map<string,string> }}
 *        a NEW graph (original + community nodes + has_member edges).
 */
export function injectCommunityNodes(
  graph,
  { communityOf, liveKeys, idByKey, toneKeyOf, labelOf } = {},
) {
  const baseNodes = graphNodeList(graph);
  const baseEdges = graphEdgeList(graph);
  const live = new Set([...(liveKeys ?? [])].filter((k) => typeof k === "string" && k.length > 0));
  const ids =
    idByKey instanceof Map
      ? idByKey
      : mintCommunityNodeIds(live, new Set(baseNodes.map((n) => n.id)));

  if (live.size === 0) return { nodes: baseNodes, links: baseEdges, idByKey: ids };

  const addedNodes = [];
  for (const key of live) {
    const nodeId = ids.get(key);
    if (typeof nodeId !== "string") continue;
    const node = {
      id: nodeId,
      label: (labelOf && labelOf(key)) || key,
      type: "OntologyCommunity",
      community_node_kind: "community",
      community_key: key,
    };
    const tone = toneKeyOf ? toneKeyOf(key) : key;
    // `group` drives the DS categorical palette; reuse the community's tone key
    // (its `nodeGroup` palette key, A5) so the fold node matches rail/canvas.
    if (tone != null) node.group = tone;
    addedNodes.push(node);
  }

  // has_member: community node -> each live member entity present in the graph.
  const addedEdges = [];
  for (const node of baseNodes) {
    const id = node?.id;
    if (typeof id !== "string") continue;
    const key = communityOf?.(node);
    if (typeof key !== "string" || !live.has(key)) continue;
    const nodeId = ids.get(key);
    if (typeof nodeId !== "string") continue;
    addedEdges.push({
      source: nodeId,
      target: id,
      relation: "has_member",
      structural: true,
      community_edge_kind: "membership",
    });
  }

  return {
    nodes: [...baseNodes, ...addedNodes],
    links: [...baseEdges, ...addedEdges],
    idByKey: ids,
  };
}
