<script>
  /**
   * Ontology studio SPA root.
   *
   * Holds ONE client `viewerState` (selectedIds, focusId, activeView, filters);
   * `$derived` scenes recompute from it + the loaded graph. The key behaviour:
   * clicking a node (onSelect) updates `selectedIds` and `focusId` so the DS
   * ForceGraph highlights and the entity panel opens — WITHOUT re-fetching or
   * re-laying-out the graph. Mirrors the process-std-am viewer architecture.
   */
  import { onMount } from "svelte";
  import { Header, Button, Badge } from "@sentropic/design-system-svelte";

  import GraphCanvas from "./components/GraphCanvas.svelte";
  import LeftRail from "./components/LeftRail.svelte";
  import ReconciliationView from "./components/ReconciliationView.svelte";
  import SelectionPanel from "./components/SelectionPanel.svelte";
  import WorkspaceShell from "./components/WorkspaceShell.svelte";
  import { fetchEntity, fetchGraph } from "./lib/api.js";
  import { buildScene, shapeLegend, resolveSelectedIds } from "./lib/graphAdapter.js";
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
  } from "./lib/viewerState.js";

  const EMPTY_GRAPH = { nodes: [], links: [] };

  // $state.raw: `graph` (1193 nodes) is only ever REASSIGNED in bulk, never
  // mutated in place — raw skips deep proxying (perf: less memory + hydration).
  let graph = $state.raw(EMPTY_GRAPH);
  let loaded = $state(false);
  let loadError = $state(null);
  let viewerState = $state(createDefaultViewerState());
  let entityCache = $state({});

  // ----- derived ------------------------------------------------------------
  // The scene is rebuilt only when the GRAPH or the weak-link option changes —
  // NOT when selection changes. Selection flows through selectedIds/focusId,
  // which the DS applies without re-layout.
  const scene = $derived(
    buildScene(graph, { showWeakLinks: viewerState.options.showWeakLinks }),
  );
  const legend = $derived(shapeLegend(graph));
  // Graph highlight = every entity of every selected type/community + the
  // directly-selected entities (R8-3.B).
  const selectedIds = $derived(resolveSelectedIds(graph, viewerState.selection));
  function handleToggleType(type) {
    viewerState = toggleType(viewerState, type);
  }
  function handleToggleCommunity(community) {
    viewerState = toggleCommunity(viewerState, community);
  }
  function handleToggleEntity(id) {
    viewerState = toggleEntity(viewerState, id);
    if (viewerState.focusId) void ensureEntity(viewerState.focusId);
  }
  function handleFocusEntity(id) {
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
  function handleSetView(view) {
    viewerState = setActiveView(viewerState, view);
  }

  async function ensureEntity(id) {
    if (!id || entityCache[id]) return;
    const data = await fetchEntity(id);
    if (data) entityCache = { ...entityCache, [id]: data };
  }

  onMount(async () => {
    try {
      graph = await fetchGraph();
    } catch (err) {
      loadError = err instanceof Error ? err.message : String(err);
      graph = EMPTY_GRAPH;
    } finally {
      loaded = true;
    }
  });
</script>

<div class="app" data-st-theme="entropic">
  <Header class="app-header" title="Graphify Ontology Studio" label="Graphify Ontology Studio">
    {#snippet logo()}
      <span class="app-logo" aria-hidden="true">◇</span>
    {/snippet}
    {#snippet navigation()}
      <Button
        size="sm"
        variant={viewerState.activeView === "workspace" ? "primary" : "ghost"}
        onclick={() => handleSetView("workspace")}>Workspace</Button
      >
      <Button
        size="sm"
        variant={viewerState.activeView === "reconciliation" ? "primary" : "ghost"}
        onclick={() => handleSetView("reconciliation")}>Reconciliation</Button
      >
    {/snippet}
    {#snippet actions()}
      {#if loaded && !loadError}
        <span class="app-stats">
          <Badge tone="neutral">{scene.stats.nodeCount} nodes</Badge>
          <Badge tone="neutral">{scene.stats.edgeCount} edges</Badge>
          <Badge tone="info">{scene.stats.communityCount} groups</Badge>
        </span>
      {/if}
    {/snippet}
  </Header>

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
            query={viewerState.query}
            selection={viewerState.selection}
            showWeakLinks={viewerState.options.showWeakLinks}
            onToggleType={handleToggleType}
            onToggleCommunity={handleToggleCommunity}
            onToggleEntity={handleToggleEntity}
            onSetQuery={handleSetQuery}
            onToggleWeak={handleToggleWeak}
          />
        </div>
        <div class="col col-center">
          <GraphCanvas
            {scene}
            {legend}
            {selectedIds}
            focusId={viewerState.focusId}
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
  /* DS Header owns layout/surface/border. We only style the logo glyph it
     renders via the `logo` snippet and the stats cluster in `actions`. */
  .app-logo {
    color: var(--st-semantic-action-primary, #2563eb);
    font-size: 1.1rem;
  }
  .app-stats {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-variant-numeric: tabular-nums;
  }
  .app-body {
    flex: 1;
    min-height: 0;
  }
  .col {
    min-height: 0;
    height: 100%;
  }
  .app-loading,
  .app-error {
    display: grid;
    align-content: center;
    gap: 0.4rem;
    padding: 3rem;
    text-align: center;
  }
  .loading-kicker {
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--st-semantic-text-muted, #64748b);
  }
  .app-error-detail {
    color: var(--st-semantic-feedback-error, #dc2626);
    font-family: ui-monospace, monospace;
    font-size: 0.82rem;
  }

  @media (max-width: 1080px) {
    .col {
      height: auto;
    }
    .col-center {
      height: 70vh;
    }
  }
</style>
