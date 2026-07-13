/**
 * Single client viewer state for the ontology studio SPA (selection rework R8-3,
 * PER-ITEM group-by B2).
 *
 * The LEFT column is navigation (search + Ontology / Communities / Entities
 * lists); the RIGHT column shows the current SELECTION and drills down to an
 * entity.
 *
 *   selection : { types:[], communities:[], entities:[] } — what the user picked
 *               on the left. Each list toggles independently (click = add/remove).
 *               NOTE: `selection.types` is the ontology FILTER facet and is kept
 *               STRICTLY SEPARATE from the group-by set below — grouping a class
 *               is NOT selecting/filtering it.
 *   focusId   : the last individually-picked entity → gets the "double" emphasis
 *               (selection highlight + focus shadow) and opens its detail.
 *   options   : { showWeakLinks, groupBy } — graph options (ex-"Facets").
 *               `groupBy` (B2 per-item) is a SET of GROUPED ITEM KEYS:
 *                 { grouped: [ "ontology:<classId>" | "community:<key>", … ] }
 *               Every checked item (an Ontology class node OR a community)
 *               contributes one namespaced key; checking GROUPS (collapses) it,
 *               unchecking ungroups it. MULTI-SELECT: several keys — mixing
 *               ontology classes and communities — collapse simultaneously. The
 *               App splits the set back into ontology class ids + community keys
 *               (`splitGroupedKeys`) and feeds the shared engine's collapse-target
 *               SET. An empty set === nothing grouped (fast path, A3).
 *   query     : free-text filter for the Entities list.
 *   activeView: "workspace" | "reconciliation" | "answer".
 *
 * The graph's `selectedIds` is DERIVED in App from `selection` + the graph
 * (a selected type/community contributes all its member entity ids).
 */

/** Ontology baseline levels for `foldToLevel` (0=Domain, 1=Sub-domain, 2=Type). */
export const ONTOLOGY_LEVELS = { domain: 0, subDomain: 1, type: 2 };

/* ---------------------------------------------------------------------------
 * Group-item key namespacing.
 *
 * A grouped item key is a single string that carries BOTH the item's kind
 * (ontology class vs community) and its identifier. The namespace prefix is
 * matched on the FIRST `:`-segment only, so an ontology class id ("class:People")
 * or a colon-bearing community key both round-trip losslessly.
 * ------------------------------------------------------------------------- */

export const GROUP_KIND = { ontology: "ontology", community: "community", type: "type" };

/** Build the grouped key for an Ontology class node id (e.g. "class:People"). */
export function groupKeyForOntology(classId) {
  return `${GROUP_KIND.ontology}:${classId}`;
}

/** Build the grouped key for a community key (free text, may contain colons). */
export function groupKeyForCommunity(communityKey) {
  return `${GROUP_KIND.community}:${communityKey}`;
}

/**
 * Build the grouped key for a leaf TYPE (a node `type` value, e.g. "Character").
 * The Type LEVEL of the ontology taxonomy is the entity `type` itself — the
 * artifact's leaf classes carry `member_node_types`, but there is no per-type
 * CLASS node, so a grouped type folds entities sharing that `type` into one
 * synthetic type node (the single-level, community-like collapse).
 */
export function groupKeyForType(typeName) {
  return `${GROUP_KIND.type}:${typeName}`;
}

/**
 * Split a flat grouped-key set back into its two engine inputs:
 *   - ontologyClassIds : the raw class ids to collapse on the ontology axis.
 *   - communityKeys    : the raw community keys to collapse on the community axis.
 * Unknown / malformed prefixes are ignored. PURE (no graph context).
 *
 * @param {string[]} grouped  the namespaced grouped-key set.
 * @returns {{ ontologyClassIds: string[], communityKeys: string[] }}
 */
export function splitGroupedKeys(grouped = []) {
  const ontologyClassIds = [];
  const communityKeys = [];
  const typeNames = [];
  for (const key of grouped ?? []) {
    if (typeof key !== "string" || key.length === 0) continue;
    const sep = key.indexOf(":");
    if (sep < 0) continue;
    const kind = key.slice(0, sep);
    const rest = key.slice(sep + 1);
    if (rest.length === 0) continue;
    if (kind === GROUP_KIND.ontology) ontologyClassIds.push(rest);
    else if (kind === GROUP_KIND.community) communityKeys.push(rest);
    else if (kind === GROUP_KIND.type) typeNames.push(rest);
  }
  return {
    ontologyClassIds: uniqueStrings(ontologyClassIds),
    communityKeys: uniqueStrings(communityKeys),
    typeNames: uniqueStrings(typeNames),
  };
}

function createDefaultGroupBy() {
  return { grouped: [] };
}

/**
 * Default per-entity VISIBILITY overlay (4-state control). Stored state ∈
 * {Normal, Grouped, Hidden} is exclusive (Grouped lives in `groupBy.grouped`,
 * Hidden here); Solo is a SEPARATE overlay set that never mutates grouped/hidden
 * storage. Both are keyed by the SAME namespaced keys as grouping
 * (`ontology:|community:|type:`). Empty === nothing hidden/soloed (fast path).
 */
function createDefaultVisibility() {
  return { hidden: [], solo: [] };
}

export function createDefaultViewerState() {
  return {
    activeView: "workspace",
    query: "",
    selection: { types: [], communities: [], entities: [] },
    focusId: null,
    // `timeCursor`: time-scrub cursor (epoch-ms) or null = OFF (no temporal
    // filter). Default null so the scene is unfiltered until the user scrubs.
    options: {
      showWeakLinks: true,
      timeCursor: null,
      groupBy: createDefaultGroupBy(),
      visibility: createDefaultVisibility(),
    },
  };
}

/** The four mutually-visible entity states the per-row control cycles through. */
export const ENTITY_STATES = ["normal", "grouped", "hidden", "solo"];

/** True when `key` carries a known group/visibility namespace prefix. */
function hasKnownNamespace(key) {
  return (
    typeof key === "string" &&
    (key.startsWith(`${GROUP_KIND.ontology}:`) ||
      key.startsWith(`${GROUP_KIND.community}:`) ||
      key.startsWith(`${GROUP_KIND.type}:`))
  );
}

function uniqueStrings(values = []) {
  return [...new Set(values.filter((v) => typeof v === "string" && v.length > 0))];
}

/**
 * Normalize the `groupBy` sub-object, folding the PURE (graph-free) shape
 * migration from the pre-B2 axis-scoped / pre-B2-flat shapes into the per-item
 * `grouped` set:
 *   - legacy flat   showOntologyClasses:true → group every collapsedClassId
 *   - legacy flat   collapsedClassIds        → ontology grouped keys
 *   - axis-scoped   groupBy.axis:"ontology"  → ontology grouped keys (from its set)
 *   - axis-scoped   groupBy.axis:"community" → community grouped keys (from its set)
 *   - per-item      groupBy.grouped          → kept as-is (normalized + deduped)
 * Both legacy axis collapse sets fold in regardless of which axis was "active",
 * because per-item grouping has no single active axis — every fold is live.
 * Availability (artifact present / liveCount>0) is NOT consulted here.
 */
function normalizeGroupBy(options = {}) {
  const raw = options.groupBy ?? {};
  const keys = [];

  // Per-item shape: the canonical `grouped` set (already namespaced).
  if (Array.isArray(raw.grouped)) {
    for (const k of raw.grouped) if (typeof k === "string") keys.push(k);
  }

  // Legacy axis-scoped ontology fold set → ontology grouped keys.
  const axisOntologyIds =
    raw.ontology?.collapsedClassIds ??
    // legacy flat: collapsedClassIds lived under options
    options.collapsedClassIds ??
    [];
  for (const id of axisOntologyIds) {
    if (typeof id === "string" && id.length > 0) keys.push(groupKeyForOntology(id));
  }

  // Legacy axis-scoped community fold set → community grouped keys.
  const axisCommunityKeys = raw.community?.collapsedKeys ?? [];
  for (const k of axisCommunityKeys) {
    if (typeof k === "string" && k.length > 0) keys.push(groupKeyForCommunity(k));
  }

  // Legacy flat `showOntologyClasses` only ever meant "inject classes"; with no
  // explicit collapse set it groups nothing, so there is nothing extra to add.

  return { grouped: uniqueStrings(keys) };
}

/**
 * Normalize the per-entity VISIBILITY overlay (4-state control). This is the ONLY
 * "migration" surface — there is NO localStorage persistence of viewerState in
 * studio/src, so an ABSENT `visibility` (every pre-feature state) simply defaults
 * to empty sets. Both lists are deduped, string-only, and restricted to keys with
 * a known namespace prefix so junk can never accumulate through the option
 * spread. Exclusivity (a node's stored state is Grouped XOR Hidden) is enforced
 * grouped-WINS: `hidden := hidden \ grouped`, so a bulk "Group all" that regroups
 * a currently-Hidden entity simply un-hides it (zero bulk-writer changes). `solo`
 * is an overlay and is NOT exclusivity-constrained (solo ∩ grouped / solo ∩ hidden
 * are legal and meaningful — Solo preserves the stored state, §3/§6.2).
 *
 * @param {object} options   the RAW partial options (so absence is detectable).
 * @param {string[]} groupedKeys  the already-normalized `groupBy.grouped` set.
 */
function normalizeVisibility(options = {}, groupedKeys = []) {
  const raw = options.visibility ?? {};
  const grouped = new Set(groupedKeys);
  const hidden = uniqueStrings(Array.isArray(raw.hidden) ? raw.hidden : []).filter(
    (k) => hasKnownNamespace(k) && !grouped.has(k),
  );
  const solo = uniqueStrings(Array.isArray(raw.solo) ? raw.solo : []).filter(hasKnownNamespace);
  return { hidden, solo };
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
  if (next.activeView !== "reconciliation" && next.activeView !== "answer") {
    next.activeView = "workspace";
  }
  next.options.showWeakLinks = Boolean(next.options.showWeakLinks);
  // Time-scrub cursor (epoch-ms) — coerce any non-finite value to null (OFF).
  next.options.timeCursor =
    typeof next.options.timeCursor === "number" && Number.isFinite(next.options.timeCursor)
      ? next.options.timeCursor
      : null;
  // Normalize from the RAW partial options (not the base-merged one) so the
  // absence of `groupBy` is genuinely detectable and the legacy migration fires.
  next.options.groupBy = normalizeGroupBy(partial.options ?? {});
  // Per-entity visibility overlay (4-state control). Normalized AFTER groupBy so
  // the grouped-wins exclusivity (hidden \ grouped) reads the final grouped set.
  next.options.visibility = normalizeVisibility(partial.options ?? {}, next.options.groupBy.grouped);
  // Drop the subsumed legacy flat / axis-scoped fields so they cannot drift.
  delete next.options.showOntologyClasses;
  delete next.options.collapsedClassIds;
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

/** Toggle a TYPE bucket in/out of the selection (FILTER facet, NOT group-by). */
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

/**
 * Set the time-scrub cursor (epoch-ms) or null to turn scrubbing OFF. A
 * non-finite value coerces to null. Additive & opt-in — the default cursor is
 * null so the scene is unfiltered until the user scrubs.
 */
export function setTimeCursor(state, value) {
  const t = typeof value === "number" && Number.isFinite(value) ? value : null;
  return normalizeViewerState({
    ...state,
    options: { ...state.options, timeCursor: t },
  });
}

/* ===========================================================================
 * B2 — PER-ITEM group-by actions.
 *
 * Every groupable left-rail item (an Ontology class node OR a community) owns a
 * checkbox. Checking it adds its namespaced key to the `grouped` SET; unchecking
 * removes it. Multiple keys — mixing ontology classes and communities — group at
 * once. The App splits the set (`splitGroupedKeys`) and feeds the shared engine.
 * ======================================================================== */

/** Replace the grouped set on a state (deduped, string-only). */
function withGrouped(state, nextKeys) {
  return normalizeViewerState({
    ...state,
    options: {
      ...state.options,
      groupBy: { grouped: uniqueStrings(nextKeys) },
    },
  });
}

/**
 * Toggle ANY grouped item by its namespaced key (build it with
 * `groupKeyForOntology` / `groupKeyForCommunity`). A non-string / empty key is a
 * no-op.
 */
export function toggleGroupItem(state, key) {
  if (typeof key !== "string" || !key) return normalizeViewerState(state);
  return withGrouped(state, toggleIn(state.options.groupBy.grouped, key));
}

/** Toggle an Ontology class node into/out of the grouped set. */
export function toggleGroupOntology(state, classId) {
  if (typeof classId !== "string" || !classId) return normalizeViewerState(state);
  return toggleGroupItem(state, groupKeyForOntology(classId));
}

/** Toggle a community into/out of the grouped set. */
export function toggleGroupCommunity(state, communityKey) {
  if (typeof communityKey !== "string" || !communityKey) return normalizeViewerState(state);
  return toggleGroupItem(state, groupKeyForCommunity(communityKey));
}

/** Toggle a leaf TYPE into/out of the grouped set (Type-level group-by). */
export function toggleGroupType(state, typeName) {
  if (typeof typeName !== "string" || !typeName) return normalizeViewerState(state);
  return toggleGroupItem(state, groupKeyForType(typeName));
}

/** Is this Ontology class node currently grouped (checked)? PURE predicate. */
export function isOntologyGrouped(state, classId) {
  return state?.options?.groupBy?.grouped?.includes(groupKeyForOntology(classId)) ?? false;
}

/** Is this community currently grouped (checked)? PURE predicate. */
export function isCommunityGrouped(state, communityKey) {
  return state?.options?.groupBy?.grouped?.includes(groupKeyForCommunity(communityKey)) ?? false;
}

/** Is this leaf TYPE currently grouped (checked)? PURE predicate. */
export function isTypeGrouped(state, typeName) {
  return state?.options?.groupBy?.grouped?.includes(groupKeyForType(typeName)) ?? false;
}

/** Clear the entire grouped set (ungroup everything). */
export function clearGrouping(state) {
  return withGrouped(state, []);
}

/** Keys NOT in the given kind namespace (drop only that scope's keys). */
function keysExceptKind(state, kind) {
  return (state.options.groupBy.grouped ?? []).filter(
    (k) => typeof k === "string" && !k.startsWith(`${kind}:`),
  );
}

/**
 * Ungroup ALL ontology-scoped keys (spec §4 — the Ontology section's
 * `Ungroup all`). Both class ids (Domain/Sub-domain) AND leaf TYPE keys are
 * ontology-scoped; communities are untouched.
 */
export function clearOntologyGrouping(state) {
  const kept = (state.options.groupBy.grouped ?? []).filter(
    (k) =>
      typeof k === "string" &&
      !k.startsWith(`${GROUP_KIND.ontology}:`) &&
      !k.startsWith(`${GROUP_KIND.type}:`),
  );
  return withGrouped(state, kept);
}

/** Ungroup ALL community-scoped keys (spec §5 — Communities `Ungroup all`). */
export function clearCommunityGrouping(state) {
  return withGrouped(state, keysExceptKind(state, GROUP_KIND.community));
}

/** Are ANY ontology-scoped (class OR type) items grouped? (disables Ungroup all) */
export function hasOntologyGrouping(state) {
  return (state?.options?.groupBy?.grouped ?? []).some(
    (k) =>
      typeof k === "string" &&
      (k.startsWith(`${GROUP_KIND.ontology}:`) || k.startsWith(`${GROUP_KIND.type}:`)),
  );
}

/** Are ANY community-scoped items grouped? (disables the community Ungroup all) */
export function hasCommunityGrouping(state) {
  return (state?.options?.groupBy?.grouped ?? []).some(
    (k) => typeof k === "string" && k.startsWith(`${GROUP_KIND.community}:`),
  );
}

/**
 * Group EXACTLY the given ontology level (spec §4 — bulk "Group all to <level>").
 * Replaces ALL ontology-scoped keys (class ids + type names) with the level's
 * members so no stale ancestor/descendant fold survives; communities untouched.
 *
 * @param {object} state
 * @param {number} level  0=Domain, 1=Sub-domain (class ids), 2=Type (type names).
 * @param {string[]} levelClassIds  the class ids at level 0/1 (ignored for L2).
 * @param {string[]} levelTypeNames the type values at level 2 (ignored for L0/L1).
 */
export function groupOntologyLevel(state, level, levelClassIds = [], levelTypeNames = []) {
  const kept = (state.options.groupBy.grouped ?? []).filter(
    (k) =>
      typeof k === "string" &&
      !k.startsWith(`${GROUP_KIND.ontology}:`) &&
      !k.startsWith(`${GROUP_KIND.type}:`),
  );
  const next =
    level === ONTOLOGY_LEVELS.type
      ? uniqueStrings(levelTypeNames).map(groupKeyForType)
      : uniqueStrings(levelClassIds).map(groupKeyForOntology);
  return withGrouped(state, [...kept, ...next]);
}

/**
 * Group EXACTLY the given community keys (spec §5 — Communities `Group all`).
 * Replaces all community-scoped keys; ontology untouched.
 */
export function groupAllCommunities(state, communityKeys = []) {
  const kept = keysExceptKind(state, GROUP_KIND.community);
  return withGrouped(state, [...kept, ...uniqueStrings(communityKeys).map(groupKeyForCommunity)]);
}

/**
 * B2 baseline fold (F8) — group EXACTLY the given ontology class ids, REPLACING
 * the current ontology grouped keys (community keys are untouched). Used by the
 * "Fold all to: Domain / Sub-domain / Type" bulk buttons; the caller computes the
 * level's class ids from the taxonomy. Because the set IS replaced for the
 * ontology kind, no stale ancestor/descendant ontology fold survives.
 *
 * @param {object} state
 * @param {string[]} levelClassIds  the class ids at the target level.
 */
export function foldOntologyToLevel(state, levelClassIds = []) {
  const ids = uniqueStrings(levelClassIds);
  // Keep every NON-ontology grouped key (communities), drop old ontology keys,
  // then add the level's ontology keys.
  const kept = (state.options.groupBy.grouped ?? []).filter(
    (k) => typeof k === "string" && !k.startsWith(`${GROUP_KIND.ontology}:`),
  );
  return withGrouped(state, [...kept, ...ids.map(groupKeyForOntology)]);
}

/* ===========================================================================
 * 4-STATE per-entity VISIBILITY control (Normal · Grouped · Hidden · Solo).
 *
 * D2 schema (double-consensus): keep `groupBy.grouped` UNCHANGED as the Grouped
 * storage; add `options.visibility = { hidden:[], solo:[] }`, keyed by the SAME
 * namespaced keys. Stored state ∈ {Normal, Grouped, Hidden} is EXCLUSIVE; Solo is
 * a SEPARATE overlay set (a Grouped entity soloed shows its group node — Solo
 * never mutates grouped/hidden storage). Reducer = setEntityState / toggleSolo /
 * resetVisibility. Migration = defaults in normalizeViewerState (no localStorage).
 * ======================================================================== */

/**
 * The state the per-row WIDGET displays for a namespaced key. Solo overlay wins
 * visually (§4), then stored Hidden, then Grouped, else Normal. PURE predicate.
 */
export function displayedEntityState(state, key) {
  const v = state?.options?.visibility;
  if (Array.isArray(v?.solo) && v.solo.includes(key)) return "solo";
  if (Array.isArray(v?.hidden) && v.hidden.includes(key)) return "hidden";
  if (state?.options?.groupBy?.grouped?.includes(key)) return "grouped";
  return "normal";
}

/**
 * Radiogroup semantics (D2): clicking a segment PUTS the entity in that state.
 *   - "solo"   → add to the Solo OVERLAY; stored grouped/hidden UNTOUCHED (§3/§6.2).
 *   - "normal" → clear grouped + hidden + solo for the key.
 *   - "grouped"→ exit solo, drop hidden, add to grouped (exclusive stored state).
 *   - "hidden" → exit solo, drop grouped, add to hidden (exclusive stored state).
 * A non-string / empty key or an unknown state is a normalize-only no-op.
 */
export function setEntityState(state, key, next) {
  if (typeof key !== "string" || !key || !ENTITY_STATES.includes(next)) {
    return normalizeViewerState(state);
  }
  const grouped = new Set(state.options.groupBy.grouped);
  const hidden = new Set(state.options.visibility?.hidden ?? []);
  const solo = new Set(state.options.visibility?.solo ?? []);
  if (next === "solo") {
    solo.add(key); // OVERLAY: stored grouped/hidden preserved (§3, §6.2).
  } else {
    solo.delete(key); // any non-solo click exits this entity's Solo.
    grouped.delete(key);
    hidden.delete(key);
    if (next === "grouped") grouped.add(key);
    else if (next === "hidden") hidden.add(key);
    // next === "normal": the deletes above are the whole story.
  }
  return normalizeViewerState({
    ...state,
    options: {
      ...state.options,
      groupBy: { grouped: [...grouped] },
      visibility: { hidden: [...hidden], solo: [...solo] },
    },
  });
}

/**
 * Toggle a key in/out of the Solo overlay (§3 "Exit"). Adding accumulates
 * (multi-Solo); removing returns the entity to its stored state for display.
 * A non-string / empty key is a normalize-only no-op.
 */
export function toggleSolo(state, key) {
  if (typeof key !== "string" || !key) return normalizeViewerState(state);
  const solo = new Set(state.options.visibility?.solo ?? []);
  if (solo.has(key)) solo.delete(key);
  else solo.add(key);
  return normalizeViewerState({
    ...state,
    options: {
      ...state.options,
      visibility: { hidden: [...(state.options.visibility?.hidden ?? [])], solo: [...solo] },
    },
  });
}

/**
 * Global "Show all / Reset" (§1): Hidden + Solo + Grouped → Normal. Everything
 * else (selection, weak-link, time cursor) is kept.
 */
export function resetVisibility(state) {
  return normalizeViewerState({
    ...state,
    options: {
      ...state.options,
      groupBy: { grouped: [] },
      visibility: { hidden: [], solo: [] },
    },
  });
}

/** Is ANY Solo overlay active? (drives the Solo-tier derivation + rail dimming). */
export function soloActive(state) {
  return (state?.options?.visibility?.solo?.length ?? 0) > 0;
}

/** Any Grouped / Hidden / Solo override present? (drives the global Reset's disabled). */
export function hasAnyVisibilityOverride(state) {
  return (
    (state?.options?.groupBy?.grouped?.length ?? 0) > 0 ||
    (state?.options?.visibility?.hidden?.length ?? 0) > 0 ||
    (state?.options?.visibility?.solo?.length ?? 0) > 0
  );
}
