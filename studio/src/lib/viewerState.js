/**
 * Single client viewer state for the ontology studio SPA (selection rework R8-3,
 * group-by axis B2).
 *
 * The LEFT column is navigation (search + Types / Communities / Entities lists);
 * the RIGHT column shows the current SELECTION and drills down to an entity.
 *
 *   selection : { types:[], communities:[], entities:[] } — what the user picked
 *               on the left. Each list toggles independently (click = add/remove).
 *   focusId   : the last individually-picked entity → gets the "double" emphasis
 *               (selection highlight + focus shadow) and opens its detail.
 *   options   : { showWeakLinks, groupBy } — graph options (ex-"Facets").
 *               `groupBy` (B2) is the axis-scoped group-by MODE:
 *                 { axis: "none"|"community"|"ontology",   // mutually exclusive
 *                   ontology:  { collapsedClassIds:[] },   // mixed-level class ids
 *                   community: { collapsedKeys:[] } }      // community keys
 *               Only the ACTIVE axis's collapse set is applied; both sets coexist
 *               in state so each axis remembers its own folds (F3 memory). The
 *               pre-B2 `showOntologyClasses` is subsumed: axis:"ontology" + empty
 *               collapse set === "show classes, nothing folded".
 *   query     : free-text filter for the Entities list.
 *   activeView: "workspace" | "reconciliation".
 *
 * The graph's `selectedIds` is DERIVED in App from `selection` + the graph
 * (a selected type/community contributes all its member entity ids).
 */

/** The mutually-exclusive group-by axes (the `groupBy.axis` enum). */
export const GROUP_AXES = ["none", "community", "ontology"];

/** Ontology baseline levels for `foldToLevel` (0=Domain, 1=Sub-domain, 2=Type). */
export const ONTOLOGY_LEVELS = { domain: 0, subDomain: 1, type: 2 };

function createDefaultGroupBy() {
  return {
    axis: "none",
    ontology: { collapsedClassIds: [] },
    community: { collapsedKeys: [] },
  };
}

export function createDefaultViewerState() {
  return {
    activeView: "workspace",
    query: "",
    selection: { types: [], communities: [], entities: [] },
    focusId: null,
    options: { showWeakLinks: true, groupBy: createDefaultGroupBy() },
  };
}

function uniqueStrings(values = []) {
  return [...new Set(values.filter((v) => typeof v === "string" && v.length > 0))];
}

/** Coerce any value to a valid axis enum member (out-of-enum → "none"). */
function coerceAxis(value) {
  return GROUP_AXES.includes(value) ? value : "none";
}

/**
 * Normalize the `groupBy` sub-object, folding the PURE (graph-free) shape
 * migration from the pre-B2 `showOntologyClasses`/`collapsedClassIds` fields:
 *   - showOntologyClasses:true  → axis:"ontology" (unless groupBy.axis is set)
 *   - collapsedClassIds         → groupBy.ontology.collapsedClassIds
 * Availability (artifact present / liveCount>0) is NOT consulted here — that is
 * the separate App-level `normalizeGroupAxisAvailability` step (C4).
 */
function normalizeGroupBy(options = {}) {
  const def = createDefaultGroupBy();
  const raw = options.groupBy ?? {};
  // Migration: old flat fields seed the new shape when groupBy is absent/partial.
  const legacyAxis =
    options.showOntologyClasses === true ? "ontology" : "none";
  const axis = coerceAxis(
    raw.axis !== undefined ? raw.axis : legacyAxis,
  );
  const ontologyIds = uniqueStrings(
    raw.ontology?.collapsedClassIds ??
      // legacy: collapsedClassIds lived flat under options
      options.collapsedClassIds ??
      def.ontology.collapsedClassIds,
  );
  const communityKeys = uniqueStrings(
    raw.community?.collapsedKeys ?? def.community.collapsedKeys,
  );
  return {
    axis,
    ontology: { collapsedClassIds: ontologyIds },
    community: { collapsedKeys: communityKeys },
  };
}

export function normalizeViewerState(partial = {}) {
  const base = createDefaultViewerState();
  const sel = partial.selection ?? {};
  const next = {
    ...base,
    ...partial,
    selection: {
      types: uniqueStrings(sel.types ?? base.selection.types),
      communities: uniqueStrings(sel.communities ?? base.selection.communities),
      entities: uniqueStrings(sel.entities ?? base.selection.entities),
    },
    options: { ...base.options, ...(partial.options ?? {}) },
  };
  next.query = typeof next.query === "string" ? next.query : "";
  next.focusId = typeof next.focusId === "string" && next.focusId ? next.focusId : null;
  if (next.activeView !== "reconciliation") next.activeView = "workspace";
  next.options.showWeakLinks = Boolean(next.options.showWeakLinks);
  // Normalize from the RAW partial options (not the base-merged one) so the
  // absence of `groupBy` is genuinely detectable and the legacy migration fires.
  next.options.groupBy = normalizeGroupBy(partial.options ?? {});
  // Drop the subsumed legacy flat fields so they cannot drift out of sync.
  delete next.options.showOntologyClasses;
  delete next.options.collapsedClassIds;
  // The focus must be a selected entity; drop it if it was deselected.
  if (next.focusId && !next.selection.entities.includes(next.focusId)) next.focusId = null;
  return next;
}

/**
 * App-level AVAILABILITY coercion (C4) — SEPARATE from the pure normalizer.
 *
 * Runs only where graph/artifact context exists (the App seam that already knows
 * `availableAxes` from artifact presence + communityStats().liveCount). Downgrades
 * a persisted, enum-valid `axis` to "none" when it is not currently available,
 * WITHOUT touching the per-axis collapse sets (so F3 memory survives a downgrade
 * and is restored on a graph that has the axis). Idempotent; "none" and any
 * available axis pass through unchanged.
 *
 * @param {object} state          a (normalized) viewer state.
 * @param {string[]} availableAxes  the axes the current graph/artifacts support
 *        (always includes "none").
 * @returns {object} the state, possibly with `groupBy.axis` downgraded to "none".
 */
export function normalizeGroupAxisAvailability(state, availableAxes = GROUP_AXES) {
  const available = new Set(["none", ...(availableAxes ?? [])]);
  const axis = state?.options?.groupBy?.axis ?? "none";
  if (axis === "none" || available.has(axis)) return state;
  return normalizeViewerState({
    ...state,
    options: {
      ...state.options,
      groupBy: { ...state.options.groupBy, axis: "none" },
    },
  });
}

function toggleIn(list, value) {
  const set = new Set(list);
  if (set.has(value)) set.delete(value);
  else set.add(value);
  return [...set];
}

/** Toggle a TYPE bucket in/out of the selection. */
export function toggleType(state, type) {
  return normalizeViewerState({
    ...state,
    selection: { ...state.selection, types: toggleIn(state.selection.types, type) },
  });
}

/** Toggle a COMMUNITY bucket in/out of the selection. */
export function toggleCommunity(state, community) {
  return normalizeViewerState({
    ...state,
    selection: { ...state.selection, communities: toggleIn(state.selection.communities, community) },
  });
}

/**
 * Toggle a single ENTITY in/out of the selection. Adding makes it the focus
 * (double emphasis); removing the focused one clears the focus.
 */
export function toggleEntity(state, id) {
  const has = state.selection.entities.includes(id);
  const entities = toggleIn(state.selection.entities, id);
  const focusId = has ? (state.focusId === id ? null : state.focusId) : id;
  return normalizeViewerState({
    ...state,
    selection: { ...state.selection, entities },
    focusId,
  });
}

/**
 * Focus an entity (right-column drill-down or graph dblclick): ensure it is
 * selected AND make it the focus, without touching the other buckets.
 */
export function focusEntity(state, id) {
  const entities = state.selection.entities.includes(id)
    ? state.selection.entities
    : [...state.selection.entities, id];
  return normalizeViewerState({
    ...state,
    selection: { ...state.selection, entities },
    focusId: id,
  });
}

/**
 * Set (or clear with null) the focused entity — used to expand/collapse the
 * entity detail in the right column. A non-null id is also added to the
 * selection (focusing implies selecting).
 */
export function setFocus(state, id) {
  if (!id) return normalizeViewerState({ ...state, focusId: null });
  return focusEntity(state, id);
}

export function clearSelection(state) {
  return normalizeViewerState({
    ...state,
    selection: { types: [], communities: [], entities: [] },
    focusId: null,
  });
}

export function setActiveView(state, view) {
  return normalizeViewerState({ ...state, activeView: view });
}

export function setQuery(state, query) {
  return normalizeViewerState({ ...state, query });
}

export function setShowWeakLinks(state, value) {
  return normalizeViewerState({
    ...state,
    options: { ...state.options, showWeakLinks: Boolean(value) },
  });
}

/* ===========================================================================
 * B2 — group-by AXIS actions (replace the pre-B2 ontology-only ones).
 *
 * One axis-dispatched API: the canvas click and the rail row call the SAME fns
 * regardless of axis. The active axis's collapse set is the one mutated; both
 * per-axis sets always survive (F3 memory — `setGroupAxis` NEVER wipes).
 * ======================================================================== */

/** Read the active axis's collapse-set array out of a state. */
function activeCollapseSet(groupBy) {
  if (groupBy.axis === "ontology") return groupBy.ontology.collapsedClassIds ?? [];
  if (groupBy.axis === "community") return groupBy.community.collapsedKeys ?? [];
  return [];
}

/** Return a new groupBy with the active axis's collapse set replaced. */
function withActiveCollapseSet(groupBy, nextSet) {
  if (groupBy.axis === "ontology") {
    return { ...groupBy, ontology: { collapsedClassIds: uniqueStrings(nextSet) } };
  }
  if (groupBy.axis === "community") {
    return { ...groupBy, community: { collapsedKeys: uniqueStrings(nextSet) } };
  }
  return groupBy;
}

/**
 * B2 (replaces setShowOntologyClasses) — set the group-by axis. An out-of-enum
 * value coerces to "none" (pure check). RETAINS every per-axis collapse set, so
 * Ontology → Community → Ontology restores the ontology folds (F3). Availability
 * of the chosen axis is the caller's concern (the picker only offers available
 * axes; the App availability step downgrades a now-unavailable persisted axis).
 */
export function setGroupAxis(state, axis) {
  return normalizeViewerState({
    ...state,
    options: {
      ...state.options,
      groupBy: { ...state.options.groupBy, axis: coerceAxis(axis) },
    },
  });
}

/**
 * B2 (replaces toggleCollapseClass) — toggle a key in/out of the ACTIVE axis's
 * collapse set (a class id for ontology, a community key for community). One
 * action, axis-dispatched: the canvas click and the rail row share it.
 */
export function toggleCollapse(state, key) {
  if (typeof key !== "string" || !key) return normalizeViewerState(state);
  const groupBy = state.options.groupBy;
  if (groupBy.axis === "none") return normalizeViewerState(state);
  const next = toggleIn(activeCollapseSet(groupBy), key);
  return normalizeViewerState({
    ...state,
    options: { ...state.options, groupBy: withActiveCollapseSet(groupBy, next) },
  });
}

/**
 * B2 (replaces expandAllClasses) — clear the ACTIVE axis's collapse set.
 */
export function expandAll(state) {
  const groupBy = state.options.groupBy;
  if (groupBy.axis === "none") return normalizeViewerState(state);
  return normalizeViewerState({
    ...state,
    options: { ...state.options, groupBy: withActiveCollapseSet(groupBy, []) },
  });
}

/**
 * B2 (replaces collapseAllTopClasses) — ontology BASELINE fold (F8). SETS the
 * ontology collapse set to exactly `levelClassIds` (the class ids at the chosen
 * level, computed by the caller from the taxonomy), discarding the previous set.
 * Because the new set IS exactly the level-N ids, no conflicting ancestor or
 * descendant fold can remain — "fold to level" is a SET operation, not a blind
 * union. Per-node folds the user adds afterward mix freely on top. No-op unless
 * the active axis is ontology.
 *
 * @param {object} state
 * @param {string[]} levelClassIds  the class ids at the target level.
 */
export function foldToLevel(state, levelClassIds = []) {
  const groupBy = state.options.groupBy;
  if (groupBy.axis !== "ontology") return normalizeViewerState(state);
  return normalizeViewerState({
    ...state,
    options: {
      ...state.options,
      groupBy: { ...groupBy, ontology: { collapsedClassIds: uniqueStrings(levelClassIds) } },
    },
  });
}
