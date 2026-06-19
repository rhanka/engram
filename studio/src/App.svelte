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
  import { AppChrome, Button, Badge, ButtonGroup, Select } from "@sentropic/design-system-svelte";

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
  } from "./lib/graphAdapter.js";
  import { injectOntologyClassNodes, applyOntologyCollapse } from "./lib/classNodes.js";
  import { loadWorkspace } from "./lib/sceneLoader.js";
  import {
    createDefaultViewerState,
    toggleType,
    toggleCommunity,
    toggleEntity,
    focusEntity as focusEntityAction,
    setFocus,
    clearSelection,
    setActiveView,
    setQuery,
    setShowWeakLinks,
    setShowOntologyClasses,
    toggleCollapseClass,
    expandAllClasses,
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
  //
  // EVOL 2.a: when "Show ontology classes" is ON we cannot reuse the light
  // sceneData fast-path — synthetic class nodes + has_instance edges must enter
  // BEFORE buildScene so degrees / god-class / the weak filter all operate on
  // the displayed topology. So we inject into the raw graph and rebuild. The
  // injection is a no-op (returns the graph unchanged) when the artifact is
  // absent or the graph has not hydrated yet, so this stays robust during load.
  const ontologyGraph = $derived(
    viewerState.options.showOntologyClasses
      ? injectOntologyClassNodes(graph, classHierarchies, { levels: ontologyClassLevels })
      : graph,
  );
  // EVOL 2.b/2.d: once one or more classes are folded, collapse the injected
  // graph (re-endpoint edges to the nearest visible ancestor, fold the subtree)
  // BEFORE buildScene so degrees / god-class / the weak filter all operate on the
  // collapsed topology. An empty collapsed set returns the graph unchanged.
  const collapsedGraph = $derived(
    viewerState.options.showOntologyClasses && viewerState.options.collapsedClassIds.length > 0
      ? applyOntologyCollapse(ontologyGraph, classHierarchies, {
          collapsedClassIds: viewerState.options.collapsedClassIds,
        })
      : ontologyGraph,
  );
  const scene = $derived(
    viewerState.options.showOntologyClasses
      ? // EVOL 2.a/2.b: the class/collapse scene is rebuilt from graph.json (no
        // positions) — attach a force layout so it doesn't render as a ring.
        attachForceLayout(
          buildScene(collapsedGraph, { showWeakLinks: viewerState.options.showWeakLinks }),
        )
      : sceneData
        ? applyWeakFilter(sceneData, viewerState.options.showWeakLinks)
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
  // EVOL 2.b/2.d: a click on a CLASS node folds/unfolds its subtree instead of
  // selecting it as an entity. We branch on the displayed node's kind (the scene
  // carries ontology_node_kind through from injectOntologyClassNodes).
  function sceneNodeKind(id) {
    return scene?.nodes?.find((n) => n.id === id)?.ontology_node_kind ?? null;
  }
  function handleToggleEntity(id) {
    if (sceneNodeKind(id) === "class") {
      viewerState = toggleCollapseClass(viewerState, id);
      return;
    }
    viewerState = toggleEntity(viewerState, id);
    if (viewerState.focusId) void ensureEntity(viewerState.focusId);
  }
  function handleFocusEntity(id) {
    // Double-click on a class node = collapse toggle too (no entity detail).
    if (sceneNodeKind(id) === "class") {
      viewerState = toggleCollapseClass(viewerState, id);
      return;
    }
    viewerState = focusEntityAction(viewerState, id);
    void ensureEntity(id);
  }
  function handleExpandAllClasses() {
    viewerState = expandAllClasses(viewerState);
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
  function handleToggleOntologyClasses(value) {
    viewerState = setShowOntologyClasses(viewerState, value);
    // Lazily load the artifact the first time the toggle is switched on; the
    // derived scene re-runs once it lands (no-op injection until then).
    if (value) void ensureClassHierarchies();
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
  }

  /** Flip the active model and re-render the SAME studio in place. */
  async function handleSelectModel(id) {
    if (switching || !modelStore.select(id)) return;
    modelId = modelStore.activeId;
    switching = true;
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
      // Re-fetch eagerly if the toggle is currently on (otherwise it stays lazy).
      if (viewerState.options.showOntologyClasses) await ensureClassHierarchies();
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
    brandName="Graphify"
    productName="Ontology Studio"
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
      {#if loaded && !loadError}
        <span class="app-stats" aria-label="Graph summary">
          <Badge tone="neutral">{scene.stats.nodeCount} nodes</Badge>
          <Badge tone="neutral">{scene.stats.edgeCount} edges</Badge>
          <Badge tone="info">{scene.stats.communityCount} groups</Badge>
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
            showOntologyClasses={viewerState.options.showOntologyClasses}
            collapsedClassCount={viewerState.options.collapsedClassIds.length}
            onToggleType={handleToggleType}
            onToggleCommunity={handleToggleCommunity}
            onToggleEntity={handleToggleEntity}
            onSetQuery={handleSetQuery}
            onToggleWeak={handleToggleWeak}
            onToggleOntologyClasses={handleToggleOntologyClasses}
            onExpandAllClasses={handleExpandAllClasses}
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
  .app-stats {
    display: inline-flex;
    align-items: center;
    gap: var(--st-spacing-2, 0.5rem);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
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

  @media (max-width: 720px) {
    .app-stats {
      display: none;
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
