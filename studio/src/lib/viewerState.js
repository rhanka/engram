/**
 * Single client viewer state for the ontology studio SPA.
 *
 * Mirrors the process-std-am viewer pattern: one plain object that App.svelte holds in
 * a single `let viewerState`, mutated only by returning a fresh normalized
 * object. `$:` derived scenes downstream recompute from it. Kept intentionally
 * small for the first vertical slice.
 *
 *   selectedIds  : node ids highlighted in the ForceGraph (NO re-layout).
 *   focusId      : node id with the accent ring + open in the entity panel.
 *   activeView   : "workspace" | "reconciliation".
 *   filters      : { group: string|null, showWeakLinks: boolean }.
 */

export function createDefaultViewerState() {
  return {
    activeView: "workspace",
    selectedIds: [],
    focusId: null,
    filters: {
      // When set, the rail/scene focus on a single group (community or type).
      group: null,
      showWeakLinks: true,
    },
  };
}

function uniqueStrings(values = []) {
  return [...new Set(values.filter((v) => typeof v === "string" && v.length > 0))];
}

export function normalizeViewerState(partial = {}) {
  const base = createDefaultViewerState();
  const next = {
    ...base,
    ...partial,
    filters: { ...base.filters, ...(partial.filters ?? {}) },
  };
  next.selectedIds = uniqueStrings(next.selectedIds);
  next.focusId = typeof next.focusId === "string" && next.focusId ? next.focusId : null;
  if (next.activeView !== "reconciliation") next.activeView = "workspace";
  next.filters.showWeakLinks = Boolean(next.filters.showWeakLinks);
  next.filters.group =
    typeof next.filters.group === "string" && next.filters.group ? next.filters.group : null;
  return next;
}

/** Toggle a node into/out of the highlight set (does NOT change focus). */
export function toggleSelected(state, id) {
  const set = new Set(state.selectedIds);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  return normalizeViewerState({ ...state, selectedIds: [...set] });
}

/** Select a node: highlight it AND make it the focus (entity panel target). */
export function selectNode(state, id) {
  return normalizeViewerState({
    ...state,
    selectedIds: state.selectedIds.includes(id) ? state.selectedIds : [...state.selectedIds, id],
    focusId: id,
  });
}

/** Open an entity in the panel (focus) without clearing other highlights. */
export function openEntity(state, id) {
  return selectNode(state, id);
}

export function clearSelection(state) {
  return normalizeViewerState({ ...state, selectedIds: [], focusId: null });
}

export function setActiveView(state, view) {
  return normalizeViewerState({ ...state, activeView: view });
}

export function setGroupFilter(state, group) {
  return normalizeViewerState({ ...state, filters: { ...state.filters, group } });
}

export function setShowWeakLinks(state, value) {
  return normalizeViewerState({
    ...state,
    filters: { ...state.filters, showWeakLinks: Boolean(value) },
  });
}
