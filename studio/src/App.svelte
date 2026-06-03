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

  import EntityPanel from "./components/EntityPanel.svelte";
  import GraphCanvas from "./components/GraphCanvas.svelte";
  import LeftRail from "./components/LeftRail.svelte";
  import ReconciliationView from "./components/ReconciliationView.svelte";
  import WorkspaceShell from "./components/WorkspaceShell.svelte";
  import { fetchEntity, fetchGraph } from "./lib/api.js";
  import { buildScene, graphNodes, nodeType, nodeCommunity, shapeLegend } from "./lib/graphAdapter.js";
  import {
    createDefaultViewerState,
    selectNode,
    setActiveView,
    setGroupFilter,
    setShowWeakLinks,
  } from "./lib/viewerState.js";

  const EMPTY_GRAPH = { nodes: [], links: [] };

  let graph = $state(EMPTY_GRAPH);
  let loaded = $state(false);
  let loadError = $state(null);
  let viewerState = $state(createDefaultViewerState());
  let entityCache = $state({});

  // ----- derived scene ------------------------------------------------------
  // The scene is rebuilt only when the GRAPH or the weak-link filter changes —
  // NOT when selection changes. Selection flows through selectedIds/focusId,
  // which the DS applies without re-layout.
  const scene = $derived(
    buildScene(graph, { showWeakLinks: viewerState.filters.showWeakLinks }),
  );
  // SVELTE-4: shape->type legend for the graph canvas.
  const legend = $derived(shapeLegend(graph));

  const focusEntity = $derived(
    viewerState.focusId ? (entityCache[viewerState.focusId] ?? null) : null,
  );

  function handleSelect(id) {
    // Highlight + focus. No graph reload, no re-layout.
    viewerState = selectNode(viewerState, id);
    void ensureEntity(id);
  }

  function handleOpenEntity(id) {
    // dblclick / Enter — same target, the panel is already the detail surface.
    viewerState = selectNode(viewerState, id);
    void ensureEntity(id);
  }

  async function ensureEntity(id) {
    if (entityCache[id]) return;
    const data = await fetchEntity(id);
    if (data) entityCache = { ...entityCache, [id]: data };
  }

  function handleSetGroup(group) {
    viewerState = setGroupFilter(viewerState, group);
  }

  function handleToggleWeak(value) {
    viewerState = setShowWeakLinks(viewerState, value);
  }

  function handleSetView(view) {
    viewerState = setActiveView(viewerState, view);
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
  <header class="app-header">
    <div class="app-brand">
      <span class="app-logo" aria-hidden="true">◇</span>
      <span class="app-name">Graphify Ontology Studio</span>
    </div>
    <nav class="app-nav" aria-label="Views">
      <button
        class="app-tab"
        class:active={viewerState.activeView === "workspace"}
        onclick={() => handleSetView("workspace")}>Workspace</button
      >
      <button
        class="app-tab"
        class:active={viewerState.activeView === "reconciliation"}
        onclick={() => handleSetView("reconciliation")}>Reconciliation</button
      >
    </nav>
    <div class="app-stats">
      {#if loaded && !loadError}
        <span>{scene.stats.nodeCount} nodes</span>
        <span>{scene.stats.edgeCount} edges</span>
        <span>{scene.stats.communityCount} groups</span>
      {/if}
    </div>
  </header>

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
      <ReconciliationView {graph} onOpenEntity={handleOpenEntity} />
    {:else}
      <WorkspaceShell>
        <div class="col col-left">
          <LeftRail
            {graph}
            activeGroup={viewerState.filters.group}
            showWeakLinks={viewerState.filters.showWeakLinks}
            selectedIds={viewerState.selectedIds}
            focusId={viewerState.focusId}
            onSelectEntity={handleSelect}
            onSetGroup={handleSetGroup}
            onToggleWeak={handleToggleWeak}
          />
        </div>
        <div class="col col-center">
          <GraphCanvas
            {scene}
            {legend}
            selectedIds={viewerState.selectedIds}
            focusId={viewerState.focusId}
            onSelect={handleSelect}
            onOpenEntity={handleOpenEntity}
          />
        </div>
        <div class="col col-right">
          <EntityPanel
            {graph}
            focusId={viewerState.focusId}
            entity={focusEntity}
            onOpenEntity={handleOpenEntity}
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
  .app-header {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    padding: 0.55rem 1.1rem;
    background: var(--st-semantic-surface-default, #fff);
    border-bottom: 1px solid var(--st-semantic-border-subtle, #e2e8f0);
  }
  .app-brand {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 700;
  }
  .app-logo {
    color: var(--st-semantic-action-primary, #2563eb);
    font-size: 1.1rem;
  }
  .app-name {
    color: var(--st-semantic-text-primary, #0f172a);
  }
  .app-nav {
    display: flex;
    gap: 0.25rem;
  }
  .app-tab {
    border: 1px solid transparent;
    background: transparent;
    border-radius: var(--st-radius-sm, 4px);
    padding: 0.3rem 0.7rem;
    cursor: pointer;
    color: var(--st-semantic-text-secondary, #475569);
    font-size: 0.85rem;
  }
  .app-tab:hover {
    background: var(--st-semantic-surface-subtle, #f8fafc);
  }
  .app-tab.active {
    color: var(--st-semantic-action-primaryText, #fff);
    background: var(--st-semantic-action-primary, #2563eb);
  }
  .app-stats {
    margin-left: auto;
    display: flex;
    gap: 0.85rem;
    color: var(--st-semantic-text-muted, #64748b);
    font-size: 0.78rem;
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
