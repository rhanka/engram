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
    fetchModelsManifest,
    fetchScene,
    setStaticBaseProvider,
    __resetEntitiesIndexCache,
  } from "./lib/api.js";
  import { createModelStore } from "./lib/modelStore.svelte.js";
  import {
    buildScene,
    applyWeakFilter,
    attachForceLayout,
    resolveSelectedIds,
    communityStats,
    nodeCommunity,
  } from "./lib/graphAdapter.js";
  import {
    injectOntologyClassNodes,
    applyOntologyCollapse,
    applyGroupCollapse,
    buildClassParentIndex,
    injectCommunityNodes,
    buildCommunityParentIndex,
    mintCommunityNodeIds,
  } from "./lib/classNodes.js";
  import { loadWorkspace } from "./lib/sceneLoader.js";
  import {
    createDefaultViewerState,
    normalizeGroupAxisAvailability,
    toggleType,
    toggleCommunity,
    toggleEntity,
    focusEntity as focusEntityAction,
    setFocus,
    clearSelection,
    setActiveView,
    setQuery,
    setShowWeakLinks,
    setGroupAxis,
    toggleCollapse,
    foldToLevel,
    expandAll,
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
  // EVOL 2.b/2.d: the class-injection granularity is "all" — EVERY class (not
  // just leaves) is injected so that intermediate super-classes exist as collapse
  // HANDLES (click a class node to fold its subtree). With an empty collapsed set
  // this is the 2.a display plus the inter-class subclass_of skeleton; the
  // collapse pass below only ever does work once a class is folded.
  const ontologyClassLevels = "all";

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

  // B2: the active group-by axis (none | community | ontology). `axis:"none"` is
  // the FAST PATH and must be byte-identical to the pre-B2 default (A3).
  const groupAxis = $derived(viewerState.options.groupBy.axis);

  // B2 / C4: which axes the CURRENT graph + artifacts support. Ontology needs the
  // class-hierarchies artifact; Community needs at least one live community. The
  // picker omits absent axes; an unavailable persisted axis is downgraded by
  // normalizeGroupAxisAvailability once the graph is in hand.
  const communityInfo = $derived(communityStats(graph));
  const availableAxes = $derived([
    "none",
    ...(communityInfo.liveCount > 0 ? ["community"] : []),
    ...(classHierarchies?.hierarchies ? ["ontology"] : []),
  ]);

  // B2 / A1+A2: mint the live community keys + their collision-safe synthetic ids
  // + per-key tone ONCE, so the injector and the parent index agree on ids.
  const communityCtx = $derived.by(() => {
    if (groupAxis !== "community") return null;
    const live = communityInfo.live;
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

  // B2: axis-dispatched scene pipeline.
  //   axis "none"      → fast path (applyWeakFilter / buildScene fallback) [A3]
  //   axis "ontology"  → inject classes → applyGroupCollapse(ontology) → buildScene
  //   axis "community" → inject communities → applyGroupCollapse(community) → buildScene
  // A non-"none" axis abandons sceneData and runs force layout (A4 cost accepted).
  const groupedGraph = $derived.by(() => {
    if (groupAxis === "ontology") {
      const injected = injectOntologyClassNodes(graph, classHierarchies, {
        levels: ontologyClassLevels,
      });
      const ids = viewerState.options.groupBy.ontology.collapsedClassIds;
      if (ids.length === 0) return injected;
      const { parentById, descendantClassIds } = buildClassParentIndex(classHierarchies);
      return applyGroupCollapse(injected, {
        parentById,
        collapseTargets: ids,
        descendantsByTarget: descendantClassIds,
      });
    }
    if (groupAxis === "community" && communityCtx) {
      const injected = injectCommunityNodes(graph, communityCtx);
      const keys = viewerState.options.groupBy.community.collapsedKeys;
      if (keys.length === 0) return injected;
      const { parentById, descendantsByTarget, collapseTargetByKey } =
        buildCommunityParentIndex(graph, communityCtx);
      const collapseTargets = keys
        .map((k) => collapseTargetByKey(k))
        .filter((id) => typeof id === "string");
      return applyGroupCollapse(injected, { parentById, collapseTargets, descendantsByTarget });
    }
    return graph;
  });
  const scene = $derived(
    groupAxis !== "none"
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
  // Graph highlight = every entity of every selected type/community + the
  // directly-selected entities (R8-3.B).
  const selectedIds = $derived(resolveSelectedIds(graph, viewerState.selection));
  function handleToggleType(type) {
    viewerState = toggleType(viewerState, type);
  }
  function handleToggleCommunity(community) {
    viewerState = toggleCommunity(viewerState, community);
  }
  // B2 / A2: a click on ANY group-synthetic node folds/unfolds it instead of
  // selecting an entity. Ontology class nodes toggle by their id; community fold
  // nodes toggle by their `community_key` field (NEVER the parsed id). Returns
  // the toggle key when the node is a group node, else null (entity selection).
  function groupNodeToggleKey(id) {
    const node = scene?.nodes?.find((n) => n.id === id);
    if (!node) return null;
    if (node.ontology_node_kind === "class") return node.id;
    if (node.community_node_kind === "community") return node.community_key ?? null;
    return null;
  }
  function handleToggleEntity(id) {
    const groupKey = groupNodeToggleKey(id);
    if (groupKey != null) {
      viewerState = toggleCollapse(viewerState, groupKey);
      return;
    }
    viewerState = toggleEntity(viewerState, id);
    if (viewerState.focusId) void ensureEntity(viewerState.focusId);
  }
  function handleFocusEntity(id) {
    // Double-click on a group node = collapse toggle too (no entity detail).
    const groupKey = groupNodeToggleKey(id);
    if (groupKey != null) {
      viewerState = toggleCollapse(viewerState, groupKey);
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
  // B2: group-by axis callbacks (replace the ontology-class toggle).
  function handleSetAxis(axis) {
    viewerState = setGroupAxis(viewerState, axis);
    // Ontology needs the class-hierarchies artifact; load it lazily the first
    // time the axis is chosen (the derived scene re-runs once it lands).
    if (axis === "ontology") void ensureClassHierarchies();
  }
  function handleToggleCollapse(key) {
    viewerState = toggleCollapse(viewerState, key);
  }
  function handleExpandAll() {
    viewerState = expandAll(viewerState);
  }
  // B2 / F8: BASELINE fold to an ontology level. Compute the exact class ids at
  // the level from the taxonomy, then SET them as the collapse set (not a union).
  function handleFoldToLevel(level) {
    viewerState = foldToLevel(viewerState, classIdsAtLevel(level));
  }
  function handleSetView(view) {
    viewerState = setActiveView(viewerState, view);
  }

  // B2 / F8: the class ids at a given ontology level (0=Domain, 1=Sub-domain,
  // 2=Type), read from the class-hierarchies artifact. Used as the baseline set.
  function classIdsAtLevel(level) {
    const hs = classHierarchies?.hierarchies;
    if (!hs) return [];
    const out = [];
    for (const h of Object.values(hs)) {
      const classes = h?.classes_by_id;
      if (!classes || typeof classes !== "object") continue;
      for (const entry of Object.values(classes)) {
        if (typeof entry?.id === "string" && (entry.level ?? 0) === level) out.push(entry.id);
      }
    }
    return out;
  }

  // B2 / C4: availability coercion at the App seam (the only place with graph +
  // artifact context). A persisted axis that the current graph no longer supports
  // is downgraded → "none" WITHOUT wiping the per-axis collapse sets, so re-loading
  // on a graph that does have the axis restores it. Idempotent; safe to run on
  // every availableAxes change.
  $effect(() => {
    const next = normalizeGroupAxisAvailability(viewerState, availableAxes);
    if (next !== viewerState) viewerState = next;
  });

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
  }

  /** Flip the active model and re-render the SAME studio in place. */
  async function handleSelectModel(id) {
    if (switching || !modelStore.select(id)) return;
    modelId = modelStore.activeId;
    switching = true;
    // B2 regression fix: capture the active group-by axis BEFORE we drop the
    // per-model artifacts. Nulling classHierarchies removes "ontology" from
    // availableAxes, so the availability $effect downgrades the axis to "none"
    // while the new model's taxonomy is in flight. We re-assert the intended
    // axis once the artifact lands (below) IF it is available again, so a model
    // switch within a multi-model bundle keeps an active Ontology grouping (the
    // collapse set already survives in viewerState — only the axis was lost).
    const intendedAxis = viewerState.options.groupBy.axis;
    // The fetch base now points at the new model's dir; clear stale per-model
    // client state before re-loading.
    __resetEntitiesIndexCache();
    entityCache = {};
    // The class-hierarchies artifact is per-model; drop it so the next toggle-on
    // re-fetches under the new model's base.
    classHierarchies = null;
    classHierarchiesFetched = false;
    viewerState = clearSelection(viewerState);
    try {
      await loadActiveModel();
      // Re-fetch eagerly if the ontology axis was active (else lazy). loadActiveModel
      // already eagerly fetches class-hierarchies, so this is a cached no-op.
      if (intendedAxis === "ontology") await ensureClassHierarchies();
      // Restore the intended axis if the new model still supports it. A downgrade
      // happened while the artifact was null; reassert now that availableAxes is
      // up to date. normalizeGroupAxisAvailability is idempotent and keeps the axis
      // only when it is genuinely available (else this re-asserts to a no-op).
      if (intendedAxis !== viewerState.options.groupBy.axis && availableAxes.includes(intendedAxis)) {
        viewerState = setGroupAxis(viewerState, intendedAxis);
      }
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
            {graph}
            {classHierarchies}
            query={viewerState.query}
            selection={viewerState.selection}
            showWeakLinks={viewerState.options.showWeakLinks}
            groupBy={viewerState.options.groupBy}
            {availableAxes}
            stats={scene.stats}
            onToggleType={handleToggleType}
            onToggleCommunity={handleToggleCommunity}
            onToggleEntity={handleToggleEntity}
            onSetQuery={handleSetQuery}
            onToggleWeak={handleToggleWeak}
            onSetAxis={handleSetAxis}
            onToggleCollapse={handleToggleCollapse}
            onFoldToLevel={handleFoldToLevel}
            onExpandAll={handleExpandAll}
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
            {graph}
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
