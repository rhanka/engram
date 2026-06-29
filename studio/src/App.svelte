<script>
  /**
   * Ontology studio SPA root.
   *
   * Holds ONE client `viewerState` (selectedIds, focusId, activeView, filters);
   * `$derived` scenes recompute from it + the loaded graph. The key behaviour:
   * clicking a node (onSelect) updates `selectedIds` and `focusId` so the
   * @sentropic/graph canvas highlights and the entity panel opens — WITHOUT
   * re-fetching or re-laying-out the graph. Mirrors the process-std-am viewer
   * architecture.
   */
  import { onMount } from "svelte";
  import { AppChrome, Button, ButtonGroup, Select } from "@sentropic/design-system-svelte";

  import GraphCanvas from "./components/GraphCanvas.svelte";
  import LeftRail from "./components/LeftRail.svelte";
  import ReconciliationView from "./components/ReconciliationView.svelte";
  import SelectionPanel from "./components/SelectionPanel.svelte";
  import WorkspaceShell from "./components/WorkspaceShell.svelte";
  import {
    fetchClassHierarchies,
    fetchEntity,
    fetchGraph,
    fetchGroupCounts,
    fetchModelsManifest,
    fetchScene,
    setStaticBaseProvider,
    __resetEntitiesIndexCache,
  } from "./lib/api.js";
  import { createModelStore } from "./lib/modelStore.svelte.js";
  import {
    buildScene,
    applyWeakFilter,
    applyTimeFilter,
    sceneTimeRange,
    attachForceLayout,
    resolveSelectedIds,
    communityStats,
    nodeCommunity,
    nodeType,
  } from "./lib/graphAdapter.js";
  import {
    mintCommunityNodeIds,
    mintTypeNodeIds,
  } from "./lib/classNodes.js";
  import {
    computeGroupedGraph,
    classIdsAtLevel,
    typeNamesInTaxonomy,
    ontologyLevelState,
    ontologyAbsorption,
  } from "./lib/groupBy.js";
  import { loadWorkspace } from "./lib/sceneLoader.js";
  import {
    createDefaultViewerState,
    splitGroupedKeys,
    groupKeyForOntology,
    groupKeyForCommunity,
    groupKeyForType,
    toggleType,
    toggleCommunity,
    toggleEntity,
    focusEntity as focusEntityAction,
    setFocus,
    clearSelection,
    setActiveView,
    setQuery,
    setShowWeakLinks,
    setTimeCursor,
    toggleGroupOntology,
    toggleGroupCommunity,
    toggleGroupType,
    toggleGroupItem,
    groupOntologyLevel,
    groupAllCommunities,
    clearOntologyGrouping,
    clearCommunityGrouping,
    hasOntologyGrouping,
    hasCommunityGrouping,
  } from "./lib/viewerState.js";

  const EMPTY_GRAPH = { nodes: [], links: [] };

  // $state.raw: `graph` (1193 nodes) is only ever REASSIGNED in bulk, never
  // mutated in place — raw skips deep proxying (perf: less memory + hydration).
  let graph = $state.raw(EMPTY_GRAPH);
  // ÉTAPE 1b: the light scene.json (mount payload). When set, the central graph
  // renders from it directly (no buildScene); null = legacy fallback mode where
  // the scene is rebuilt from the raw graph.
  let sceneData = $state.raw(null);
  let loaded = $state(false);
  let loadError = $state(null);
  let viewerState = $state(createDefaultViewerState());
  let entityCache = $state({});
  // EVOL 2.a: the class-hierarchies.json artifact (schema
  // graphify_ontology_class_hierarchies_v1) backing the "Show ontology classes"
  // toggle. Lazily fetched once (like models.json); null until loaded / when
  // absent, in which case the toggle injects nothing. $state.raw — only ever
  // reassigned in bulk, never mutated in place.
  let classHierarchies = $state.raw(null);
  // Storage LOT 2 (prefer-server group counts): the precomputed `node_type`
  // group-by counts from a configured GraphStore mirror, fetched once per model
  // via `GET /api/ontology/groups`. null when no store is configured (the
  // default flat-JSON studio) — the Types rail then recomputes counts in-memory
  // exactly as before. $state.raw: reassigned in bulk, never mutated in place.
  let serverTypeCounts = $state.raw(null);
  // EVOL 2.b/2.d: the class-injection granularity is "all" — EVERY class (not
  // just leaves) is injected so that intermediate super-classes exist as collapse
  // HANDLES. `computeGroupedGraph` (lib/groupBy.js) owns the inject granularity;
  // the collapse pass only ever does work once a class is folded.

  // ----- in-UI model switcher ----------------------------------------------
  // The store holds the manifest + active model; api.js resolves static fetches
  // under `models/<id>/` via the base provider registered below. Empty manifest
  // (no models.json) = single-model mode and the switcher is hidden.
  const modelStore = createModelStore();
  setStaticBaseProvider(() => modelStore.base);
  let modelId = $state(null);
  let switching = $state(false);

  // ----- derived ------------------------------------------------------------
  // The scene drives the central graph; selection flows separately through
  // selectedIds/focusId (no re-layout). The weak-link toggle re-filters the
  // scene WITHOUT the raw graph (ÉTAPE 1b): on the light scene via
  // applyWeakFilter, or — in legacy fallback — by rebuilding from the graph.

  // B2 (per-item): the grouped item SET split back into its engine inputs.
  // An EMPTY set is the FAST PATH and must be byte-identical to the pre-B2
  // default (A3). Several keys — mixing ontology classes, communities AND leaf
  // TYPES — collapse simultaneously.
  const groupedSplit = $derived(splitGroupedKeys(viewerState.options.groupBy.grouped));
  const hasOntologyGroup = $derived(groupedSplit.ontologyClassIds.length > 0);
  const hasCommunityGroup = $derived(groupedSplit.communityKeys.length > 0);
  const hasTypeGroup = $derived(groupedSplit.typeNames.length > 0);
  const hasAnyGroup = $derived(hasOntologyGroup || hasCommunityGroup || hasTypeGroup);

  // C4: which kinds are AVAILABLE to group. Ontology needs the class-hierarchies
  // artifact; Community needs at least one live community. The rail hides the
  // checkbox affordance for an absent kind (and grouped keys for an unavailable
  // kind simply contribute no collapse target — the engine ignores them).
  const communityInfo = $derived(communityStats(graph));
  const canGroupOntology = $derived(Boolean(classHierarchies?.hierarchies));
  const canGroupCommunity = $derived(communityInfo.liveCount > 0);

  // B2 / A1+A2: mint the synthetic community fold ids + per-key tone ONCE, so the
  // injector and the parent index agree on ids. Built only when at least one
  // community is grouped (the injector is skipped otherwise).
  //
  // ROOT-CAUSE FIX (community grouping was broken): `liveKeys` is the set fed to
  // `injectCommunityNodes` / `buildCommunityParentIndex`, which mint a fold node +
  // re-parent members for EVERY key in it. Passing ALL live communities here
  // injected an orphan box (plus its has_member edges) for every NON-grouped
  // community — at mystery scale, checking ONE community spawned 120+ stray fold
  // boxes and thousands of structural edges that never collapsed, so the graph
  // visibly failed to "regroup". Restrict the set to the GROUPED ∩ LIVE keys: only
  // the communities the user actually checked get a fold node, and they collapse.
  const communityCtx = $derived.by(() => {
    if (!hasCommunityGroup) return null;
    const groupedSet = new Set(groupedSplit.communityKeys);
    const live = communityInfo.live.filter((c) => groupedSet.has(c.key));
    if (live.length === 0) return null;
    const liveKeys = live.map((c) => c.key);
    const idByKey = mintCommunityNodeIds(liveKeys, new Set((graph?.nodes ?? []).map((n) => n.id)));
    const toneKeyByKey = new Map(live.map((c) => [c.key, c.groupKey ?? c.key]));
    return {
      liveKeys,
      idByKey,
      communityOf: nodeCommunity,
      toneKeyOf: (k) => toneKeyByKey.get(k),
      labelOf: (k) => k,
    };
  });

  // B2 (per-item): the TYPE fold context — mint synthetic type-node ids ONCE so
  // the injector and parent index agree. Only built when a Type is grouped. The
  // Type LEVEL is the entity `type` itself (no per-type class node in the
  // artifact), so a grouped type folds entities sharing that `type` (§2).
  const typeCtx = $derived.by(() => {
    if (!hasTypeGroup) return null;
    const typeNames = groupedSplit.typeNames;
    const idByKey = mintTypeNodeIds(typeNames, new Set((graph?.nodes ?? []).map((n) => n.id)));
    return { typeNames, idByKey, typeOf: nodeType };
  });

  // B2 (per-item): the REAL App grouping chain, now a single EXTRACTED + tested
  // function (`computeGroupedGraph`). It folds the UNION of every grouped item
  // (ontology classes + communities + leaf types) into ONE collapse pass. An
  // empty grouped set is the fast path (returns the raw graph untouched, A3).
  const groupedGraph = $derived(
    computeGroupedGraph({
      graph,
      classHierarchies,
      communityCtx,
      typeCtx,
      grouped: viewerState.options.groupBy.grouped,
    }),
  );

  // Tri-state of each ontology bulk button (spec §4) + per-class absorption view
  // (spec §3). Denominators EXCLUDE absorbed classes; the rail renders the
  // {none|partial|all} variant + (n/m) badge and disables absorbed rows.
  const checkedOntologyIds = $derived(new Set(groupedSplit.ontologyClassIds));
  const checkedTypeNames = $derived(new Set(groupedSplit.typeNames));
  const ontologyLevelStates = $derived({
    domain: ontologyLevelState({
      classHierarchies,
      level: 0,
      checkedOntologyIds,
      checkedTypeNames,
    }),
    subDomain: ontologyLevelState({
      classHierarchies,
      level: 1,
      checkedOntologyIds,
      checkedTypeNames,
    }),
    type: ontologyLevelState({
      classHierarchies,
      level: 2,
      checkedOntologyIds,
      checkedTypeNames,
    }),
  });
  const ontologyAbsorbed = $derived(ontologyAbsorption(classHierarchies, checkedOntologyIds));
  // Community bulk button state (spec §5 — FLAT, 2-state): all-grouped when every
  // live community key is checked.
  const allCommunitiesGrouped = $derived(
    canGroupCommunity &&
      communityInfo.live.length > 0 &&
      communityInfo.live.every((c) => groupedSplit.communityKeys.includes(c.key)),
  );
  // Scope-specific "anything grouped" flags → native `disabled` on each
  // section's Ungroup all (spec §4/§5).
  const ontologyGrouped = $derived(hasOntologyGrouping(viewerState));
  const communityGrouped = $derived(hasCommunityGrouping(viewerState));
  // BASE scene (pre time-scrub) — the existing weak-link / group-by path.
  const baseScene = $derived(
    hasAnyGroup
      ? // B2/A4: the grouped scene is rebuilt from graph.json (no positions) —
        // attach a force layout so it doesn't render as a ring.
        attachForceLayout(
          buildScene(groupedGraph, { showWeakLinks: viewerState.options.showWeakLinks }),
        )
      : sceneData
        ? // A3 FAST PATH — byte-identical to the pre-B2 default-off.
          applyWeakFilter(sceneData, viewerState.options.showWeakLinks)
        : buildScene(graph, { showWeakLinks: viewerState.options.showWeakLinks }),
  );
  // Temporal bounds of the BASE scene (#234 `t`); null on a non-temporal scene →
  // the time-scrub control hides. Read from the base so the bounds stay STABLE
  // while the cursor moves (the filtered scene must not shrink the range).
  const timeRange = $derived(sceneTimeRange(baseScene));
  // Time-scrub: filter the base scene to elements with `t <= cursor`. With the
  // default cursor (null = OFF) this returns the base scene UNCHANGED, so the
  // default view is byte-identical to before.
  const scene = $derived(applyTimeFilter(baseScene, viewerState.options.timeCursor));
  // BUG A: facet / selection source. The left rail (Types / Communities /
  // Entities), the selection panel, and the selected-id resolution all read a
  // graph-like. Normally that is the hydrated raw `graph` (richest source). But
  // when graph.json is NOT available — the default scene-only `studio.html`, or
  // a multi-file static bundle opened over `file://` where a sibling fetch is
  // blocked — `graph` stays EMPTY_GRAPH and EVERY facet renders empty ("No
  // types / No communities"). The light scene IS always present and now carries
  // `type` + `community`/`community_name` per node (+ its edges), so fall back to
  // it: the facets populate from the scene alone. The scene's edges drive the
  // community live/degree computation, identical to the graph path.
  const facetGraph = $derived(
    (graph?.nodes?.length ?? 0) > 0
      ? graph
      : scene
        ? { nodes: scene.nodes, links: scene.edges }
        : graph,
  );
  // Graph highlight = every entity of every selected type/community + the
  // directly-selected entities (R8-3.B).
  const selectedIds = $derived(resolveSelectedIds(facetGraph, viewerState.selection));
  function handleToggleType(type) {
    viewerState = toggleType(viewerState, type);
  }
  function handleToggleCommunity(community) {
    viewerState = toggleCommunity(viewerState, community);
  }
  // B2 / A2: a click on ANY group-synthetic node UNGROUPS it instead of selecting
  // an entity. Ontology class nodes toggle their namespaced ontology key (by id);
  // community fold nodes toggle their namespaced community key (read from the
  // `community_key` field, NEVER the parsed id). Returns the namespaced grouped
  // key when the node is a group node, else null (entity selection).
  function groupNodeToggleKey(id) {
    const node = scene?.nodes?.find((n) => n.id === id);
    if (!node) return null;
    if (node.ontology_node_kind === "class") return groupKeyForOntology(node.id);
    if (node.community_node_kind === "community")
      return node.community_key != null ? groupKeyForCommunity(node.community_key) : null;
    if (node.type_node_kind === "type")
      return node.type_name != null ? groupKeyForType(node.type_name) : null;
    return null;
  }
  function handleToggleEntity(id) {
    const groupKey = groupNodeToggleKey(id);
    if (groupKey != null) {
      viewerState = toggleGroupItem(viewerState, groupKey);
      return;
    }
    viewerState = toggleEntity(viewerState, id);
    if (viewerState.focusId) void ensureEntity(viewerState.focusId);
  }
  function handleFocusEntity(id) {
    // Double-click on a group node = ungroup toggle too (no entity detail).
    const groupKey = groupNodeToggleKey(id);
    if (groupKey != null) {
      viewerState = toggleGroupItem(viewerState, groupKey);
      return;
    }
    viewerState = focusEntityAction(viewerState, id);
    void ensureEntity(id);
  }
  function handleSetFocus(id) {
    // Expand/collapse the right-column entity detail (null = collapse).
    viewerState = setFocus(viewerState, id);
    if (id) void ensureEntity(id);
  }
  function handleClear() {
    viewerState = clearSelection(viewerState);
  }
  function handleSetQuery(q) {
    viewerState = setQuery(viewerState, q);
  }
  function handleToggleWeak(value) {
    viewerState = setShowWeakLinks(viewerState, value);
  }
  function handleSetTimeCursor(value) {
    viewerState = setTimeCursor(viewerState, value);
  }
  // B2 (per-item): group-by callbacks. Every groupable rail item owns a checkbox
  // that GROUPS (collapses) the item when checked. Ontology classes and
  // communities each toggle their own kind; the App splits the grouped set and
  // collapses the union (handled in `groupedGraph`).
  function handleToggleGroupOntology(classId) {
    viewerState = toggleGroupOntology(viewerState, classId);
    // Ontology grouping needs the class-hierarchies artifact; load it lazily the
    // first time something ontology is grouped (the scene re-runs once it lands).
    void ensureClassHierarchies();
  }
  function handleToggleGroupCommunity(communityKey) {
    viewerState = toggleGroupCommunity(viewerState, communityKey);
  }
  // B2 (§2): a leaf TYPE row owns its OWN group-by checkbox (separate from the
  // Type FILTER select). Checking it folds entities of that `type`.
  function handleToggleGroupType(typeName) {
    viewerState = toggleGroupType(viewerState, typeName);
    void ensureClassHierarchies();
  }
  // B2 (§4): clear ONLY the ontology scope (class + type keys). Community
  // grouping survives — each section's `Ungroup all` is scope-local.
  function handleClearOntologyGrouping() {
    viewerState = clearOntologyGrouping(viewerState);
  }
  // B2 (§5): clear ONLY the community scope.
  function handleClearCommunityGrouping() {
    viewerState = clearCommunityGrouping(viewerState);
  }

  // B2 (§4): TRI-STATE bulk "Group all to <level>". By the level's current state:
  //   none    → group every (non-absorbed) member at that level
  //   all     → toggle OFF (ungroup the level — clears the ontology scope)
  //   partial → complete to ALL (re-group every member at the level)
  // For Domain/Sub-domain the members are class ids; for Type they are the
  // taxonomy's `type` values.
  function handleBulkLevel(level) {
    const ls =
      level === 0
        ? ontologyLevelStates.domain
        : level === 1
          ? ontologyLevelStates.subDomain
          : ontologyLevelStates.type;
    if (ls.state === "all") {
      // Toggle OFF: drop only the ontology scope (class + type keys).
      viewerState = clearOntologyGrouping(viewerState);
      return;
    }
    // none OR partial → group every member at the level (replaces ontology scope).
    if (level === 2) {
      viewerState = groupOntologyLevel(viewerState, 2, [], typeNamesInTaxonomy(classHierarchies));
    } else {
      viewerState = groupOntologyLevel(viewerState, level, classIdsAtLevel(classHierarchies, level));
    }
    void ensureClassHierarchies();
  }

  // B2 (§5): FLAT community bulk toggle — `Group all` groups every live
  // community; when all are already grouped, the same button ungroups them.
  function handleBulkCommunities() {
    if (allCommunitiesGrouped) {
      viewerState = clearCommunityGrouping(viewerState);
    } else {
      viewerState = groupAllCommunities(
        viewerState,
        communityInfo.live.map((c) => c.key),
      );
    }
  }
  function handleSetView(view) {
    viewerState = setActiveView(viewerState, view);
  }

  async function ensureEntity(id) {
    if (!id || entityCache[id]) return;
    const data = await fetchEntity(id);
    if (data) entityCache = { ...entityCache, [id]: data };
  }

  // EVOL 2.a: fetch the class-hierarchies artifact at most once. A null result
  // (absent artifact) is cached as "attempted" so we never re-fetch; the toggle
  // then simply injects nothing. Reset on a model switch (per-model artifact).
  let classHierarchiesFetched = false;
  async function ensureClassHierarchies() {
    if (classHierarchiesFetched) return;
    classHierarchiesFetched = true;
    classHierarchies = await fetchClassHierarchies();
  }

  /**
   * Load the ACTIVE model's workspace (scene + lazy graph) and swap it into the
   * reactive state IN PLACE — no page reload, no new tab. Used both at mount and
   * on every model switch. Resets the entities cache so the new model's sidecars
   * are fetched fresh, and clears selection (ids don't carry across models).
   */
  async function loadActiveModel() {
    const result = await loadWorkspace({
      fetchScene,
      fetchGraph,
      buildScene: (g) => buildScene(g, { showWeakLinks: viewerState.options.showWeakLinks }),
    });
    if (result.mode === "error") {
      loadError = result.error;
      graph = EMPTY_GRAPH;
      sceneData = null;
    } else if (result.mode === "scene") {
      // Render straight from the light scene; graph may still be null if its
      // lazy load failed (panels degrade, the graph view stays up).
      loadError = null;
      sceneData = result.scene;
      graph = result.graph ?? EMPTY_GRAPH;
    } else {
      // Legacy fallback: scene rebuilt from the raw graph each toggle.
      loadError = null;
      sceneData = null;
      graph = result.graph ?? EMPTY_GRAPH;
    }
    // EVOL: the Types facet renders a Domain → Sub-domain → Type accordion from
    // the class taxonomy, so fetch class-hierarchies eagerly (not just on the
    // class-display toggle). Cached; a no-op when the artifact is absent.
    await ensureClassHierarchies();
    // Storage LOT 2: prefer the store's precomputed `node_type` counts for the
    // Types rail when a mirror is configured. Resolves null off the default
    // flat-JSON studio, in which case the rail keeps computing counts in-memory.
    serverTypeCounts = await fetchGroupCounts("node_type");
  }

  /** Flip the active model and re-render the SAME studio in place. */
  async function handleSelectModel(id) {
    if (switching || !modelStore.select(id)) return;
    modelId = modelStore.activeId;
    switching = true;
    // B2 (per-item): the grouped item SET survives a model switch — it lives in
    // viewerState.options.groupBy.grouped and clearSelection() below only touches
    // the selection/focus, never the grouping. Capture whether any ONTOLOGY item
    // is grouped so we can guarantee the per-model taxonomy is re-fetched
    // (loadActiveModel does this eagerly anyway, but keep the intent explicit) —
    // grouped ontology keys reference class ids that the new model's taxonomy must
    // provide for the fold to take effect again.
    const hadOntologyGroup = splitGroupedKeys(
      viewerState.options.groupBy.grouped,
    ).ontologyClassIds.length > 0;
    // The fetch base now points at the new model's dir; clear stale per-model
    // client state before re-loading.
    __resetEntitiesIndexCache();
    entityCache = {};
    // The class-hierarchies artifact is per-model; drop it so the next toggle-on
    // re-fetches under the new model's base.
    classHierarchies = null;
    classHierarchiesFetched = false;
    // The store group-counts are per-model too; drop them so the rail recomputes
    // in-memory until loadActiveModel re-fetches for the new model.
    serverTypeCounts = null;
    viewerState = clearSelection(viewerState);
    try {
      await loadActiveModel();
      // Re-fetch eagerly if any ontology item was grouped (else lazy).
      // loadActiveModel already eagerly fetches class-hierarchies, so this is a
      // cached no-op — but it guarantees the grouped ontology folds re-apply.
      if (hadOntologyGroup) await ensureClassHierarchies();
    } finally {
      switching = false;
    }
  }

  onMount(async () => {
    // Multi-model bundle: discover available re-indexations first. With a
    // manifest, the active model's data lives under `models/<id>/`; without one
    // the studio runs single-model (server route / flat ./scene.json) unchanged.
    const manifest = await fetchModelsManifest();
    if (manifest) {
      modelStore.setManifest(manifest);
      // Optional deep-link: `?model=<id>` picks the initial model (the dropdown
      // still does the in-place switch afterwards). Unknown ids are ignored.
      const wanted =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("model")
          : null;
      if (wanted) modelStore.select(wanted);
      modelId = modelStore.activeId;
    }
    // ÉTAPE 1b: mount from the light scene.json; the raw graph hydrates lazily
    // for the side panels. Falls back to fetchGraph()+buildScene() if there is
    // no scene.json (older server / static export).
    await loadActiveModel();
    loaded = true;
  });
</script>

<div class="app" data-st-theme="entropic">
  <AppChrome
    class="app-header"
    productName="Graphify"
  >
    {#snippet identity()}
      <ButtonGroup attached size="sm" label="Studio view" class="app-view-switcher">
        <Button
          size="sm"
          variant={viewerState.activeView === "workspace" ? "primary" : "secondary"}
          aria-pressed={viewerState.activeView === "workspace"}
          aria-label="Knowledge graph view"
          onclick={() => handleSetView("workspace")}
        >
          <span class="view-label view-label--full">Knowledge graph</span>
          <span class="view-label view-label--compact" aria-hidden="true">Graph</span>
        </Button>
        <Button
          size="sm"
          variant={viewerState.activeView === "reconciliation" ? "primary" : "secondary"}
          aria-pressed={viewerState.activeView === "reconciliation"}
          aria-label="Entity reconciliation view"
          onclick={() => handleSetView("reconciliation")}
        >
          <span class="view-label view-label--full">Entity reconciliation</span>
          <span class="view-label view-label--compact" aria-hidden="true">Recon</span>
        </Button>
      </ButtonGroup>
    {/snippet}
    {#snippet extraSelectors()}
      {#if modelStore.models.length > 1}
        <span class="app-model-switch">
          <Select
            size="sm"
            label="Model"
            class="app-model-select"
            aria-label="Re-indexation model"
            value={modelId}
            disabled={switching}
            onchange={(event) => handleSelectModel(event.currentTarget.value)}
          >
            {#each modelStore.models as model (model.id)}
              <option value={model.id}>
                {model.label}{model.nodeCount != null ? ` — ${model.nodeCount} nodes` : ""}
              </option>
            {/each}
          </Select>
        </span>
      {/if}
    {/snippet}
  </AppChrome>

  <main class="app-body">
    {#if !loaded}
      <section class="app-loading" aria-live="polite">
        <p class="loading-kicker">Loading</p>
        <h2>Fetching knowledge graph…</h2>
      </section>
    {:else if loadError}
      <section class="app-error" aria-live="polite">
        <p class="loading-kicker">Error</p>
        <h2>Could not load graph.json</h2>
        <p class="app-error-detail">{loadError}</p>
      </section>
    {:else if viewerState.activeView === "reconciliation"}
      <ReconciliationView {graph} onOpenEntity={handleFocusEntity} />
    {:else}
      <WorkspaceShell>
        <div class="col col-left">
          <LeftRail
            graph={facetGraph}
            {classHierarchies}
            {serverTypeCounts}
            query={viewerState.query}
            selection={viewerState.selection}
            showWeakLinks={viewerState.options.showWeakLinks}
            groupBy={viewerState.options.groupBy}
            {canGroupOntology}
            {canGroupCommunity}
            {ontologyLevelStates}
            {ontologyAbsorbed}
            {allCommunitiesGrouped}
            {ontologyGrouped}
            {communityGrouped}
            stats={scene.stats}
            onToggleType={handleToggleType}
            onToggleCommunity={handleToggleCommunity}
            onToggleEntity={handleToggleEntity}
            onSetQuery={handleSetQuery}
            onToggleWeak={handleToggleWeak}
            {timeRange}
            timeCursor={viewerState.options.timeCursor}
            onSetTimeCursor={handleSetTimeCursor}
            onToggleGroupOntology={handleToggleGroupOntology}
            onToggleGroupCommunity={handleToggleGroupCommunity}
            onToggleGroupType={handleToggleGroupType}
            onBulkLevel={handleBulkLevel}
            onBulkCommunities={handleBulkCommunities}
            onClearOntologyGrouping={handleClearOntologyGrouping}
            onClearCommunityGrouping={handleClearCommunityGrouping}
          />
        </div>
        <div class="col col-center">
          <GraphCanvas
            {scene}
            {selectedIds}
            focusId={viewerState.focusId}
            labelMode="none"
            onSelect={handleToggleEntity}
            onOpenEntity={handleFocusEntity}
          />
        </div>
        <div class="col col-right">
          <SelectionPanel
            graph={facetGraph}
            selection={viewerState.selection}
            focusId={viewerState.focusId}
            {entityCache}
            onSetFocus={handleSetFocus}
            onFocusEntity={handleFocusEntity}
            onToggleType={handleToggleType}
            onToggleCommunity={handleToggleCommunity}
            onToggleEntity={handleToggleEntity}
            onClear={handleClear}
          />
        </div>
      </WorkspaceShell>
    {/if}
  </main>
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }
  /* DS AppChrome owns surface/layout/sticky; local CSS only sizes slot content. */
  :global(.app-view-switcher) {
    white-space: nowrap;
  }
  /* Model switcher: keep the DS Select unobtrusive in the chrome — inline label,
     compact width — without reaching into DS internals beyond layout. */
  .app-model-switch {
    display: inline-flex;
    align-items: center;
    white-space: nowrap;
  }
  :global(.app-model-select) {
    max-width: none;
  }
  :global(.app-model-select .st-field__control) {
    grid-auto-flow: column;
    align-items: center;
    gap: var(--st-spacing-2, 0.5rem);
  }
  :global(.app-model-select .st-select) {
    min-width: 11rem;
  }
  .view-label--compact {
    display: none;
  }
  .app-body {
    flex: 1;
    min-height: 0;
  }
  .col {
    min-height: 0;
    height: 100%;
  }
  /* DS-token alignment (sent-tech-design audit): 4px spacing grid +
     12/14px type scale + DS mono stack; values fall back to the same scale. */
  .app-loading,
  .app-error {
    display: grid;
    align-content: center;
    gap: var(--st-spacing-2, 0.5rem);
    padding: var(--st-spacing-12, 3rem);
    text-align: center;
  }
  .loading-kicker {
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--st-semantic-text-muted, #64748b);
  }
  .app-error-detail {
    color: var(--st-semantic-feedback-error, #dc2626);
    font-family: var(--st-font-mono, ui-monospace, monospace);
    font-size: var(--st-typography-label-size, 0.875rem);
  }

  @media (max-width: 1080px) {
    .col {
      height: auto;
    }
    .col-center {
      height: 70vh;
    }
  }

  @media (max-width: 460px) {
    .view-label--full {
      display: none;
    }
    .view-label--compact {
      display: inline;
    }
  }
</style>
