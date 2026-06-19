/**
 * Single client viewer state for the ontology studio SPA (selection rework R8-3).
 *
 * The LEFT column is navigation (search + Types / Communities / Entities lists);
 * the RIGHT column shows the current SELECTION and drills down to an entity.
 *
 *   selection : { types:[], communities:[], entities:[] } — what the user picked
 *               on the left. Each list toggles independently (click = add/remove).
 *   focusId   : the last individually-picked entity → gets the "double" emphasis
 *               (selection highlight + focus shadow) and opens its detail.
 *   options   : { showWeakLinks, showOntologyClasses, collapsedClassIds } — graph
 *               options (ex-"Facets"). `collapsedClassIds` (EVOL 2.b/2.d) is the
 *               set of ontology class ids the user has folded; each click on a
 *               class node toggles its id in/out and the subtree collapses.
 *   query     : free-text filter for the Entities list.
 *   activeView: "workspace" | "reconciliation".
 *
 * The graph's `selectedIds` is DERIVED in App from `selection` + the graph
 * (a selected type/community contributes all its member entity ids).
 */

export function createDefaultViewerState() {
  return {
    activeView: "workspace",
    query: "",
    selection: { types: [], communities: [], entities: [] },
    focusId: null,
    options: { showWeakLinks: true, showOntologyClasses: false, collapsedClassIds: [] },
  };
}

function uniqueStrings(values = []) {
  return [...new Set(values.filter((v) => typeof v === "string" && v.length > 0))];
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
  next.options.showOntologyClasses = Boolean(next.options.showOntologyClasses);
  next.options.collapsedClassIds = uniqueStrings(
    next.options.collapsedClassIds ?? base.options.collapsedClassIds,
  );
  // The focus must be a selected entity; drop it if it was deselected.
  if (next.focusId && !next.selection.entities.includes(next.focusId)) next.focusId = null;
  return next;
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

export function setShowOntologyClasses(state, value) {
  const on = Boolean(value);
  return normalizeViewerState({
    ...state,
    options: {
      ...state.options,
      showOntologyClasses: on,
      // Turning the class layer OFF clears any pending collapse so the next
      // turn-on starts fully expanded (no stale folds against a hidden layer).
      collapsedClassIds: on ? state.options.collapsedClassIds : [],
    },
  });
}

/**
 * EVOL 2.b/2.d — toggle a single ontology CLASS id in/out of the collapsed set.
 * Collapsing folds the class's whole subtree (sub-classes + member entities)
 * into the class node; collapsing again (toggle off) restores it.
 */
export function toggleCollapseClass(state, classId) {
  if (typeof classId !== "string" || !classId) return normalizeViewerState(state);
  return normalizeViewerState({
    ...state,
    options: {
      ...state.options,
      collapsedClassIds: toggleIn(state.options.collapsedClassIds ?? [], classId),
    },
  });
}

/** EVOL 2.b/2.d — expand everything (clear the collapsed set). */
export function expandAllClasses(state) {
  return normalizeViewerState({
    ...state,
    options: { ...state.options, collapsedClassIds: [] },
  });
}

/**
 * EVOL 2.b/2.d — collapse a given set of TOP-LEVEL class ids in one gesture
 * (a convenience reset, e.g. "fold every root class"). Callers pass the ids to
 * collapse; the union with any current set is kept.
 */
export function collapseAllTopClasses(state, classIds = []) {
  const next = uniqueStrings([
    ...(state.options.collapsedClassIds ?? []),
    ...(classIds ?? []),
  ]);
  return normalizeViewerState({
    ...state,
    options: { ...state.options, collapsedClassIds: next },
  });
}
