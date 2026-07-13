/**
 * B2 — group-by orchestration (the EXTRACTED, testable App `groupedGraph` chain).
 *
 * The ontology→inject→index→collapse chain used to live INLINE inside
 * `App.svelte`'s `$derived.by`, so no test could drive the REAL App ontology path
 * end-to-end and the Type level had no collapse path at all. This module is the
 * single, pure source of truth the App now calls:
 *
 *   computeGroupedGraph({ graph, classHierarchies, communityCtx, typeCtx, grouped })
 *
 * It folds, over the UNION of every grouped item (ontology classes + communities
 * + leaf TYPES), into ONE `applyGroupCollapse` pass — identical to the old inline
 * derivation for ontology + community, plus the new Type axis. Empty grouped set
 * = the fast path (returns the input graph untouched).
 *
 * It also owns the tri-state bulk-button + NESTING-ABSORPTION math (spec §3/§4):
 *   - effective grouping resolves a class to its NEAREST CHECKED ANCESTOR;
 *   - an absorbed class is EXCLUDED from level counts and rendered disabled;
 *   - per ontology level the {none|partial|all} state + (n/m) count are derived
 *     from the checked set vs the level's non-absorbed members.
 */

import {
  injectOntologyClassNodes,
  buildClassParentIndex,
  injectCommunityNodes,
  buildCommunityParentIndex,
  injectTypeNodes,
  buildTypeParentIndex,
  applyGroupCollapse,
} from "./classNodes.js";
import { splitGroupedKeys } from "./viewerState.js";

/**
 * Compute the COLLAPSED graph for a grouped-key set — the real App `groupedGraph`.
 *
 * @param {object} args
 * @param {{ nodes?: object[], links?: object[] }} args.graph  the raw graph.
 * @param {object|null} args.classHierarchies  the class-hierarchies.json artifact.
 * @param {object|null} [args.communityCtx]  the App's per-key community context
 *        ({ liveKeys, idByKey, communityOf, ... }); null when no community is
 *        grouped or none are live. Pre-built by the App so injector + index agree
 *        on synthetic ids.
 * @param {object|null} [args.typeCtx]  the App's per-key TYPE context
 *        ({ typeNames, idByKey, typeOf }); null when no type is grouped.
 * @param {string[]} args.grouped  the namespaced grouped-key set.
 * @returns {{ nodes: object[], links: object[] }} the collapsed graph, or the
 *        input graph unchanged when nothing is grouped (fast path).
 */
export function computeGroupedGraph({
  graph,
  classHierarchies = null,
  communityCtx = null,
  typeCtx = null,
  grouped = [],
} = {}) {
  const { ontologyClassIds, communityKeys, typeNames } = splitGroupedKeys(grouped);
  const hasOntologyGroup = ontologyClassIds.length > 0;
  const hasCommunityGroup = communityKeys.length > 0;
  const hasTypeGroup = typeNames.length > 0;
  if (!hasOntologyGroup && !hasCommunityGroup && !hasTypeGroup) return graph;

  let injected = graph;
  const parentById = new Map();
  const descendantsByTarget = new Map();
  const collapseTargets = [];

  if (hasOntologyGroup && classHierarchies?.hierarchies) {
    injected = injectOntologyClassNodes(injected, classHierarchies, { levels: "all" });
    const { parentById: classParents, descendantClassIds } =
      buildClassParentIndex(classHierarchies);
    for (const [k, v] of classParents) parentById.set(k, v);
    for (const [k, v] of descendantClassIds) descendantsByTarget.set(k, v);
    for (const id of ontologyClassIds) collapseTargets.push(id);
  }

  if (hasCommunityGroup && communityCtx) {
    injected = injectCommunityNodes(injected, communityCtx);
    const {
      parentById: commParents,
      descendantsByTarget: commDesc,
      collapseTargetByKey,
    } = buildCommunityParentIndex(injected, communityCtx);
    for (const [k, v] of commParents) {
      // Don't clobber an ontology parent mapping for a shared entity.
      if (!parentById.has(k)) parentById.set(k, v);
    }
    for (const [k, v] of commDesc) descendantsByTarget.set(k, v);
    for (const key of communityKeys) {
      const id = collapseTargetByKey(key);
      if (typeof id === "string") collapseTargets.push(id);
    }
  }

  if (hasTypeGroup && typeCtx) {
    injected = injectTypeNodes(injected, typeCtx);
    const {
      parentById: typeParents,
      descendantsByTarget: typeDesc,
      collapseTargetByKey,
    } = buildTypeParentIndex(injected, typeCtx);
    for (const [k, v] of typeParents) {
      // Ontology + community parents win for a shared entity; a Type fold only
      // governs entities the other axes left unmapped.
      if (!parentById.has(k)) parentById.set(k, v);
    }
    for (const [k, v] of typeDesc) descendantsByTarget.set(k, v);
    for (const name of typeNames) {
      const id = collapseTargetByKey(name);
      if (typeof id === "string") collapseTargets.push(id);
    }
  }

  if (collapseTargets.length === 0) return injected;
  return applyGroupCollapse(injected, { parentById, collapseTargets, descendantsByTarget });
}

/* ===========================================================================
 * Collapse/expand ANIMATION signal — direction detection from the FOLD DELTA.
 *
 * When the grouped set changes, the studio animates the transition instead of
 * hard-cutting to the new scene. This PURE helper diffs the previous vs next
 * fold-anchor map (each hidden node id → its group-node anchor, from
 * `readFoldAnchors(computeGroupedGraph(...))`) into a transition descriptor the
 * GraphCanvas consumes:
 *
 *   { direction: "collapse" | "expand", anchorByNodeId: Map<foldedId, groupId> }
 *
 *   - children present in NEXT but not PREV just FOLDED  ⇒ collapse candidates.
 *   - children present in PREV but not NEXT just REVEALED ⇒ expand candidates.
 *   - only-folded (none revealed)  ⇒ COLLAPSE (anchors read from the NEXT map:
 *     the children are still on screen and tween toward their group node).
 *   - only-revealed (none folded)  ⇒ EXPAND (anchors read from the PREV map: the
 *     group is now gone, so its OLD anchor is where the children explode from).
 *   - BOTH folded and revealed (a MIXED change, e.g. Domain→Sub-domain), or
 *     neither (a no-op) ⇒ null (the caller hard-cuts — the safety fallback).
 *
 * Keying off the fold DELTA (not the grouped-key diff) makes the signal robust to
 * the ontology artifact loading ASYNC: the collapse "lands" in whichever reactive
 * tick the fold map actually populates, regardless of when the grouped key
 * changed. Returns null when there is nothing to animate, so an absent descriptor
 * always means "keep the current, non-animated behaviour".
 *
 * @param {object} args
 * @param {Map<string,string>} [args.prevFoldAnchors]  fold map BEFORE the change.
 * @param {Map<string,string>} [args.nextFoldAnchors]  fold map AFTER the change.
 * @returns {{ direction: "collapse"|"expand", anchorByNodeId: Map<string,string> }|null}
 */
export function computeGroupTransition({ prevFoldAnchors, nextFoldAnchors } = {}) {
  const prev = prevFoldAnchors instanceof Map ? prevFoldAnchors : new Map();
  const next = nextFoldAnchors instanceof Map ? nextFoldAnchors : new Map();

  const folded = new Map(); // newly folded: present in next, absent from prev
  const revealed = new Map(); // newly revealed: present in prev, absent from next
  for (const [childId, groupId] of next) if (!prev.has(childId)) folded.set(childId, groupId);
  for (const [childId, groupId] of prev) if (!next.has(childId)) revealed.set(childId, groupId);

  if (folded.size > 0 && revealed.size === 0) {
    return { direction: "collapse", anchorByNodeId: folded };
  }
  if (revealed.size > 0 && folded.size === 0) {
    return { direction: "expand", anchorByNodeId: revealed };
  }
  // Mixed (both folded and revealed) or a no-op → no animation (hard cut).
  return null;
}

/* ===========================================================================
 * UNIFIED scene transition (4-state visibility) — the CONTENT-DERIVED descriptor.
 *
 * The a2cf207 fold-anchor delta is BLIND to Hide/Solo (they are a scene filter,
 * not a fold), so a naive Hide yields an empty delta ⇒ null ⇒ GraphCanvas refits,
 * violating the sacred no-refit invariant. This generalizes `computeGroupTransition`
 * with a content-derived VISIBILITY delta (the display-hidden id masks) so Hide /
 * Show / Solo route through the SAME carry-over tween as group/ungroup:
 *
 *   { folded, unfolded, hiddenIds, revealedIds, kind } | null
 *     folded      : Map<childId, groupId>  newly folded  → collapse (anchor)
 *     unfolded    : Map<childId, groupId>  newly revealed-from-group → expand
 *     hiddenIds   : Set<nodeId>            newly display-hidden  → fade OUT in place
 *     revealedIds : Set<nodeId>            newly display-shown   → fade IN at target
 *     kind        : "out" | "in" | "mixed"
 *   null ⇒ nothing to animate OR the graph object reference changed (generation gate).
 *
 * Three MANDATORY guards (D3), each closing a real classification trap:
 *   (a) ANCHOR-ID exclusion — a plain collapse makes the group node APPEAR at swap
 *       time; without \ anchorIds it could slip into revealedIds → "mixed" and
 *       silently DEGRADE a shipped pure collapse to a non-animated swap.
 *   (b) ∩ SCENE-IDS — a display-hidden node whose entity is then GROUPED leaves the
 *       collapsed graph entirely; the raw mask diff would misclassify it as
 *       "revealed". Requiring presence in the target scene kills that.
 *   (c) GENERATION gate — a model switch changes the graph object wholesale; the
 *       fold + hidden diffs would then straddle two unrelated coordinate spaces.
 *       `generationChanged` ⇒ null (hard-cut refit, the correct behaviour there).
 *
 * @param {object} args
 * @param {Map<string,string>} [args.prevFoldAnchors]
 * @param {Map<string,string>} [args.nextFoldAnchors]
 * @param {Set<string>} [args.prevHiddenIds]  DISPLAY-hidden mask BEFORE the change.
 * @param {Set<string>} [args.nextHiddenIds]  DISPLAY-hidden mask AFTER the change.
 * @param {Set<string>} [args.prevSceneIds]   pre-time-filter visible ids BEFORE.
 * @param {Set<string>} [args.nextSceneIds]   pre-time-filter visible ids AFTER.
 * @param {boolean} [args.generationChanged]  graph object reference changed.
 * @returns {{ folded: Map<string,string>, unfolded: Map<string,string>,
 *   hiddenIds: Set<string>, revealedIds: Set<string>, kind: "out"|"in"|"mixed" }|null}
 */
export function computeSceneTransition({
  prevFoldAnchors,
  nextFoldAnchors,
  prevHiddenIds,
  nextHiddenIds,
  prevSceneIds,
  nextSceneIds,
  generationChanged = false,
} = {}) {
  // Guard (c): never diff across a wholesale graph swap (model switch).
  if (generationChanged) return null;

  const prevFold = prevFoldAnchors instanceof Map ? prevFoldAnchors : new Map();
  const nextFold = nextFoldAnchors instanceof Map ? nextFoldAnchors : new Map();
  const prevHidden = prevHiddenIds instanceof Set ? prevHiddenIds : new Set(prevHiddenIds ?? []);
  const nextHidden = nextHiddenIds instanceof Set ? nextHiddenIds : new Set(nextHiddenIds ?? []);
  const prevScene = prevSceneIds instanceof Set ? prevSceneIds : new Set(prevSceneIds ?? []);
  const nextScene = nextSceneIds instanceof Set ? nextSceneIds : new Set(nextSceneIds ?? []);

  const folded = new Map(); // next \ prev anchors
  const unfolded = new Map(); // prev \ next anchors
  for (const [childId, groupId] of nextFold) if (!prevFold.has(childId)) folded.set(childId, groupId);
  for (const [childId, groupId] of prevFold) if (!nextFold.has(childId)) unfolded.set(childId, groupId);

  // Guard (a): the group nodes appearing/disappearing at swap time — never let a
  // fold anchor masquerade as a hidden/revealed node.
  const anchorIds = new Set();
  for (const groupId of folded.values()) anchorIds.add(groupId);
  for (const groupId of unfolded.values()) anchorIds.add(groupId);
  const foldedChildren = new Set(folded.keys());
  const unfoldedChildren = new Set(unfolded.keys());

  const hiddenIds = new Set();
  for (const id of nextHidden) {
    // Newly display-hidden AND still present in the PRE-change scene (guard b).
    if (prevHidden.has(id)) continue;
    if (!prevScene.has(id)) continue;
    if (foldedChildren.has(id) || anchorIds.has(id)) continue;
    hiddenIds.add(id);
  }
  const revealedIds = new Set();
  for (const id of prevHidden) {
    // Newly display-shown AND present in the POST-change scene (guard b).
    if (nextHidden.has(id)) continue;
    if (!nextScene.has(id)) continue;
    if (unfoldedChildren.has(id) || anchorIds.has(id)) continue;
    revealedIds.add(id);
  }

  const outSide = folded.size > 0 || hiddenIds.size > 0;
  const inSide = unfolded.size > 0 || revealedIds.size > 0;
  if (!outSide && !inSide) return null;
  const kind = outSide && inSide ? "mixed" : outSide ? "out" : "in";
  return { folded, unfolded, hiddenIds, revealedIds, kind };
}

/* ===========================================================================
 * Tri-state bulk-button + NESTING-ABSORPTION math (spec §3/§4).
 * ======================================================================== */

/** Flatten every class entry across all hierarchies in the artifact. */
function allClassEntries(classHierarchies) {
  const out = [];
  const hierarchies = classHierarchies?.hierarchies;
  if (!hierarchies || typeof hierarchies !== "object") return out;
  for (const h of Object.values(hierarchies)) {
    const classes = h?.classes_by_id;
    if (!classes || typeof classes !== "object") continue;
    for (const entry of Object.values(classes)) {
      if (typeof entry?.id === "string") out.push(entry);
    }
  }
  return out;
}

/** Map class id -> its parent id (null at a root), across all hierarchies. */
function classParentMap(classHierarchies) {
  const parent = new Map();
  for (const entry of allClassEntries(classHierarchies)) {
    parent.set(entry.id, typeof entry.parent_id === "string" ? entry.parent_id : null);
  }
  return parent;
}

/** The class ids at a given ontology level (0=Domain, 1=Sub-domain). */
export function classIdsAtLevel(classHierarchies, level) {
  return allClassEntries(classHierarchies)
    .filter((e) => (e.level ?? 0) === level)
    .map((e) => e.id);
}

/**
 * Every leaf `member_node_types` value (the Type LEVEL) across the taxonomy.
 * De-duplicated, deterministic order (first-seen). These are the group keys for
 * the Type bulk button (level 2) — they are entity `type` strings, NOT class ids.
 */
export function typeNamesInTaxonomy(classHierarchies) {
  const seen = new Set();
  const out = [];
  for (const entry of allClassEntries(classHierarchies)) {
    for (const t of entry.member_node_types ?? []) {
      if (typeof t === "string" && t.length > 0 && !seen.has(t)) {
        seen.add(t);
        out.push(t);
      }
    }
  }
  return out;
}

/**
 * Is `classId` ABSORBED by a CHECKED ancestor (spec §3)? An absorbed class folds
 * via its grouped parent, so it is excluded from level counts and disabled in the
 * rail. PURE — walks the artifact parent chain.
 *
 * @param {string} classId
 * @param {Set<string>} checkedClassIds  the grouped ontology class id set.
 * @param {Map<string,string|null>} parentMap  class id -> parent id.
 * @returns {string|null} the nearest CHECKED ancestor's class id, or null.
 */
function absorbingAncestor(classId, checkedClassIds, parentMap) {
  let current = parentMap.get(classId) ?? null;
  const guard = new Set();
  while (current != null && !guard.has(current)) {
    if (checkedClassIds.has(current)) return current;
    guard.add(current);
    current = parentMap.get(current) ?? null;
  }
  return null;
}

/**
 * Per-class absorption view (spec §3). For every class id in the taxonomy, report
 * whether it is absorbed by a grouped ancestor and, if so, that ancestor's LABEL
 * (for the "grouped by parent <Domain>" tooltip).
 *
 * @param {object|null} classHierarchies
 * @param {Set<string>|string[]} checkedClassIds  the grouped ontology class ids.
 * @returns {Map<string,{ absorbed: boolean, byId: string|null, byLabel: string|null }>}
 */
export function ontologyAbsorption(classHierarchies, checkedClassIds = new Set()) {
  const checked = new Set(checkedClassIds);
  const parentMap = classParentMap(classHierarchies);
  const labelById = new Map();
  for (const entry of allClassEntries(classHierarchies)) {
    labelById.set(
      entry.id,
      typeof entry.label === "string" && entry.label
        ? entry.label
        : String(entry.id).replace(/^class:/, ""),
    );
  }
  const out = new Map();
  for (const entry of allClassEntries(classHierarchies)) {
    const by = absorbingAncestor(entry.id, checked, parentMap);
    out.set(entry.id, {
      absorbed: by != null,
      byId: by,
      byLabel: by != null ? (labelById.get(by) ?? null) : null,
    });
  }
  return out;
}

/**
 * Tri-state of a bulk "Group all to <level>" button (spec §4).
 *
 * The denominator EXCLUDES absorbed classes (a class whose effective grouping
 * resolves to a grouped ancestor doesn't count). For the Type level (2) the
 * members are entity `type` strings, never absorbed (single level).
 *
 *   total  = non-absorbed members at the level
 *   done   = those whose own key is checked
 *   state  = "none" | "partial" | "all"  (all only when total>0 && done===total)
 *
 * @param {object} args
 * @param {object|null} args.classHierarchies
 * @param {number} args.level  0=Domain, 1=Sub-domain, 2=Type.
 * @param {Set<string>|string[]} args.checkedOntologyIds  grouped class ids.
 * @param {Set<string>|string[]} args.checkedTypeNames    grouped type values.
 * @returns {{ state: "none"|"partial"|"all", done: number, total: number,
 *             members: string[] }}
 */
export function ontologyLevelState({
  classHierarchies,
  level,
  checkedOntologyIds = new Set(),
  checkedTypeNames = new Set(),
} = {}) {
  if (level === 2) {
    // Type level: members are the taxonomy's Type values; none can be absorbed.
    const members = typeNamesInTaxonomy(classHierarchies);
    const checked = new Set(checkedTypeNames);
    const done = members.filter((m) => checked.has(m)).length;
    return { state: stateOf(done, members.length), done, total: members.length, members };
  }
  const checked = new Set(checkedOntologyIds);
  const parentMap = classParentMap(classHierarchies);
  // Non-absorbed members at the level (absorbed = has a CHECKED ancestor).
  const members = classIdsAtLevel(classHierarchies, level).filter(
    (id) => absorbingAncestor(id, checked, parentMap) == null,
  );
  const done = members.filter((id) => checked.has(id)).length;
  return { state: stateOf(done, members.length), done, total: members.length, members };
}

function stateOf(done, total) {
  if (total === 0 || done === 0) return "none";
  if (done >= total) return "all";
  return "partial";
}

/**
 * Map a level's tri-state to its DS-Button render contract (spec §4). The DS
 * Button has only primary/secondary, so PARTIAL is secondary + a count Badge.
 *
 *   none    -> secondary, aria-pressed="false"  (click groups the level)
 *   all     -> primary,   aria-pressed="true"   (click toggles OFF)
 *   partial -> secondary, aria-pressed="false", badge "done/total" (click completes)
 *
 * NEVER aria-checked="mixed" — these are toggle BUTTONS (aria-pressed), not
 * checkboxes.
 *
 * @param {{ state: string, done: number, total: number }} levelState
 * @returns {{ variant: "primary"|"secondary", ariaPressed: "true"|"false",
 *             showBadge: boolean, badge: string|null }}
 */
export function levelButtonView(levelState) {
  const { state, done, total } = levelState ?? { state: "none", done: 0, total: 0 };
  if (state === "all") {
    return { variant: "primary", ariaPressed: "true", showBadge: false, badge: null };
  }
  if (state === "partial") {
    return {
      variant: "secondary",
      ariaPressed: "false",
      showBadge: true,
      badge: `${done}/${total}`,
    };
  }
  return { variant: "secondary", ariaPressed: "false", showBadge: false, badge: null };
}
