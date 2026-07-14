/**
 * 4-state per-entity VISIBILITY — the PURE display mask (D1 + D5).
 *
 * Hide and Solo are a scene FILTER + a transition delta; they NEVER touch the
 * fold engine (`classNodes.js`). This module owns:
 *   - `computeDisplayHiddenIds` — the D1 ownership rule (Normal ABSTAINS; Hidden =
 *     union suppression; the ≥1-visible whitelist applies ONLY in the Solo tier);
 *   - `applyVisibilityToScene` — the scene filter (empty mask ⇒ SAME reference for
 *     the byte-identity fast path, mirroring applyWeakFilter/applyTimeFilter).
 *
 * D1 ownership rule (both review passes dissent from spec §6.1). A node's owning
 * rail entities span three axes: its community, its type, and its ontology leaf
 * class + that class's ANCESTOR chain. Each entity's stored state votes:
 *   - soloActive?  visible = owned-by-≥1-Solo  AND  NOT owned-by-(storedHidden\solo)
 *   - else         hidden  = owned-by-≥1-Hidden           (Normal owners abstain)
 * so "hide type:Character" hides EVERY Character even though their communities are
 * Normal (Hide is not a no-op at mystery scale), while "solo type:Character" shows
 * only Characters — even if a Character's community was separately Hidden (Solo
 * membership overrides that entity's own stored Hidden).
 */

import { buildClassParentIndex } from "./classNodes.js";
import { splitGroupedKeys } from "./viewerState.js";
import { nodeCommunity, nodeType } from "./graphAdapter.js";

/**
 * Expand a set of ontology class ids to {each id ∪ its descendant class ids} via
 * the class-hierarchies index, so a Hidden/Solo DOMAIN governs its whole subtree.
 * @param {Iterable<string>} classIds
 * @param {Map<string,Set<string>>} descendantClassIds  from buildClassParentIndex
 * @returns {Set<string>}
 */
function expandClassIds(classIds, descendantClassIds) {
  const out = new Set();
  for (const id of classIds ?? []) {
    if (typeof id !== "string" || !id) continue;
    out.add(id);
    for (const d of descendantClassIds.get(id) ?? []) out.add(d);
  }
  return out;
}

/**
 * The owning entity keys of a scene node, split per axis. A SYNTHETIC group node
 * is owned by ITS OWN key (so "a grouped entity's group node follows the entity"
 * falls out for free); an entity node is owned by its community, its type, and its
 * ontology leaf class. Never parses a synthetic id — reads `community_key` /
 * `type_name` / the class node's own id, matching the A2 discipline.
 * @returns {{ community: string|null, type: string|null, classId: string|null }}
 */
function nodeOwnership(node, classIdByMemberId) {
  if (node?.community_node_kind === "community") {
    return { community: node.community_key ?? null, type: null, classId: null };
  }
  if (node?.type_node_kind === "type") {
    return { community: null, type: node.type_name ?? null, classId: null };
  }
  if (node?.ontology_node_kind === "class") {
    return { community: null, type: null, classId: typeof node.id === "string" ? node.id : null };
  }
  return {
    community: nodeCommunity(node),
    type: nodeType(node),
    classId: classIdByMemberId.get(node?.id) ?? null,
  };
}

/**
 * Compute the DISPLAY-hidden node id set for a scene, per the D1 two-tier rule.
 *
 * @param {object} args
 * @param {object[]} args.nodes            the POST-FOLD scene nodes (entities + group nodes).
 * @param {string[]} args.hiddenKeys       stored Hidden namespaced keys (visibility.hidden).
 * @param {string[]} args.soloKeys         Solo overlay namespaced keys (visibility.solo).
 * @param {object|null} args.classHierarchies  the class-hierarchies.json artifact.
 * @returns {Set<string>} the ids to remove from the rendered scene (empty ⇒ nothing hidden).
 */
export function computeDisplayHiddenIds({ nodes = [], hiddenKeys = [], soloKeys = [], classHierarchies = null } = {}) {
  const hiddenSplit = splitGroupedKeys(hiddenKeys);
  const soloSplit = splitGroupedKeys(soloKeys);
  const soloActive = soloKeys.length > 0;
  if (hiddenKeys.length === 0 && soloKeys.length === 0) return new Set();

  const { classIdByMemberId, descendantClassIds } = buildClassParentIndex(classHierarchies);

  // Solo TIER: effective-Hidden = storedHidden \ solo (a soloed entity overrides
  // its own stored Hidden). HIDDEN tier: effective-Hidden = the whole stored set.
  const soloCommunities = new Set(soloSplit.communityKeys);
  const soloTypes = new Set(soloSplit.typeNames);
  const soloClasses = expandClassIds(soloSplit.ontologyClassIds, descendantClassIds);

  const effHiddenCommunities = new Set(
    hiddenSplit.communityKeys.filter((k) => !soloActive || !soloCommunities.has(k)),
  );
  const effHiddenTypes = new Set(
    hiddenSplit.typeNames.filter((k) => !soloActive || !soloTypes.has(k)),
  );
  const effHiddenClasses = expandClassIds(
    hiddenSplit.ontologyClassIds.filter(
      (k) => !soloActive || !soloSplit.ontologyClassIds.includes(k),
    ),
    descendantClassIds,
  );

  const hiddenIds = new Set();
  for (const node of nodes) {
    const id = node?.id;
    if (typeof id !== "string") continue;
    const own = nodeOwnership(node, classIdByMemberId);

    const suppressed =
      (own.community != null && effHiddenCommunities.has(own.community)) ||
      (own.type != null && effHiddenTypes.has(own.type)) ||
      (own.classId != null && effHiddenClasses.has(own.classId));

    if (soloActive) {
      const soloed =
        (own.community != null && soloCommunities.has(own.community)) ||
        (own.type != null && soloTypes.has(own.type)) ||
        (own.classId != null && soloClasses.has(own.classId));
      // Solo tier: visible iff owned by a Solo entity AND not effectively hidden.
      if (!soloed || suppressed) hiddenIds.add(id);
    } else if (suppressed) {
      hiddenIds.add(id);
    }
  }
  return hiddenIds;
}

/**
 * Filter a scene to the visible nodes (D5). Drops hidden nodes + any edge with a
 * dropped endpoint, and updates node/edge counts — the SAME contract as
 * applyWeakFilter / applyTimeFilter. An EMPTY mask returns the input scene BY
 * REFERENCE (the A3/A4 byte-identity fast path depends on it). communityCount is
 * left stable (like applyTimeFilter), since the rail's group count is recomputed
 * from the facet graph, not from scene.stats.
 *
 * @param {{ nodes?: object[], edges?: object[], stats?: object } | null} scene
 * @param {Set<string>|Iterable<string>} hiddenIds
 * @returns {object} a new scene (or the same scene when the mask is empty)
 */
export function applyVisibilityToScene(scene, hiddenIds) {
  if (!scene) return scene;
  const hidden = hiddenIds instanceof Set ? hiddenIds : new Set(hiddenIds ?? []);
  if (hidden.size === 0) return scene; // fast path — byte-identical (same reference).

  const nodes = (scene.nodes ?? []).filter((n) => !hidden.has(n.id));
  const keptIds = new Set(nodes.map((n) => n.id));
  const edges = (scene.edges ?? []).filter(
    (e) => keptIds.has(e.source) && keptIds.has(e.target),
  );
  return {
    ...scene,
    nodes,
    edges,
    stats: {
      ...scene.stats,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      weakEdgeCount: edges.filter((e) => e.weak).length,
    },
  };
}
