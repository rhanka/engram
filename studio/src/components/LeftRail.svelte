<script>
  /**
   * Left rail: Types / Facets / Results / Communities accordions (collapsed).
   * Pure presentational — derives its lists from the loaded graph and reports
   * intent up via the on* callbacks. Clicking a result row selects+opens the
   * entity (highlight, no graph reload). Clicking a type/community filters.
   */
  import Accordion from "./Accordion.svelte";
  import { graphNodes, nodeType, nodeLabel, groupCounts, nodeCommunity } from "../lib/graphAdapter.js";

  let {
    graph,
    activeGroup = null,
    showWeakLinks = true,
    selectedIds = [],
    focusId = null,
    onSelectEntity,
    onSetGroup,
    onToggleWeak,
  } = $props();

  let query = $state("");

  const typeList = $derived(groupCounts(graph, nodeType));
  const communityList = $derived(groupCounts(graph, nodeCommunity));

  const results = $derived.by(() => {
    const q = query.trim().toLowerCase();
    let nodes = graphNodes(graph);
    if (activeGroup) {
      nodes = nodes.filter(
        (n) => nodeType(n) === activeGroup || nodeCommunity(n) === activeGroup,
      );
    }
    if (q) {
      nodes = nodes.filter(
        (n) =>
          nodeLabel(n).toLowerCase().includes(q) || String(n.id).toLowerCase().includes(q),
      );
    }
    return nodes
      .map((n) => ({ id: n.id, label: nodeLabel(n), type: nodeType(n) }))
      .sort((a, b) => a.label.localeCompare(b.label))
      .slice(0, 200);
  });
</script>

<aside class="rail" aria-label="Workspace navigation">
  <div class="rail-search">
    <input
      type="search"
      placeholder="Search entities…"
      bind:value={query}
      aria-label="Search entities"
    />
  </div>

  <Accordion title="Types" count={typeList.length}>
    {#if typeList.length === 0}
      <p class="rail-empty">No types.</p>
    {:else}
      <ul class="rail-list">
        {#each typeList as t (t.key)}
          <li>
            <button
              class="rail-row"
              class:active={activeGroup === t.key}
              onclick={() => onSetGroup?.(activeGroup === t.key ? null : t.key)}
            >
              <span class="rail-row-label">{t.key}</span>
              <span class="rail-row-count">{t.count}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </Accordion>

  <Accordion title="Facets">
    <label class="rail-facet">
      <input
        type="checkbox"
        checked={showWeakLinks}
        onchange={(e) => onToggleWeak?.(e.currentTarget.checked)}
      />
      Show weak (inferred) links
    </label>
    {#if activeGroup}
      <button class="rail-clear" onclick={() => onSetGroup?.(null)}>
        Clear group filter: {activeGroup}
      </button>
    {/if}
  </Accordion>

  <Accordion title="Results" count={results.length} open={true}>
    {#if results.length === 0}
      <p class="rail-empty">No matching entities.</p>
    {:else}
      <ul class="rail-list">
        {#each results as r (r.id)}
          <li>
            <button
              class="rail-row"
              class:active={focusId === r.id}
              class:selected={selectedIds.includes(r.id)}
              onclick={() => onSelectEntity?.(r.id)}
              title={r.id}
            >
              <span class="rail-row-label">{r.label}</span>
              {#if r.type}<span class="rail-row-type">{r.type}</span>{/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </Accordion>

  <Accordion title="Communities" count={communityList.length}>
    {#if communityList.length === 0}
      <p class="rail-empty">No communities.</p>
    {:else}
      <ul class="rail-list">
        {#each communityList as c (c.key)}
          <li>
            <button
              class="rail-row"
              class:active={activeGroup === c.key}
              onclick={() => onSetGroup?.(activeGroup === c.key ? null : c.key)}
            >
              <span class="rail-row-label">{c.key}</span>
              <span class="rail-row-count">{c.count}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </Accordion>
</aside>

<style>
  .rail {
    background: var(--st-semantic-surface-default, #fff);
    overflow-y: auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .rail-search {
    padding: 0.7rem 0.85rem;
    border-bottom: 1px solid var(--st-semantic-border-subtle, #e2e8f0);
  }
  .rail-search input {
    width: 100%;
    padding: 0.45rem 0.6rem;
    border: 1px solid var(--st-semantic-border-strong, #94a3b8);
    border-radius: var(--st-radius-sm, 4px);
    background: var(--st-semantic-surface-default, #fff);
    color: var(--st-semantic-text-primary, #0f172a);
  }
  .rail-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 1px;
  }
  .rail-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    width: 100%;
    text-align: left;
    border: 1px solid transparent;
    background: transparent;
    border-radius: var(--st-radius-sm, 4px);
    padding: 0.35rem 0.5rem;
    cursor: pointer;
    color: var(--st-semantic-text-primary, #0f172a);
    font-size: 0.85rem;
  }
  .rail-row:hover {
    background: var(--st-semantic-surface-subtle, #f8fafc);
  }
  .rail-row.active {
    border-color: var(--st-semantic-action-primary, #2563eb);
    box-shadow: inset 3px 0 0 var(--st-semantic-action-primary, #2563eb);
  }
  .rail-row.selected .rail-row-label {
    font-weight: 600;
  }
  .rail-row-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rail-row-count {
    font-variant-numeric: tabular-nums;
    color: var(--st-semantic-text-muted, #64748b);
    font-size: 0.72rem;
  }
  .rail-row-type {
    color: var(--st-semantic-text-muted, #64748b);
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .rail-empty {
    margin: 0.25rem 0;
    color: var(--st-semantic-text-muted, #64748b);
    font-size: 0.82rem;
    font-style: italic;
  }
  .rail-facet {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    font-size: 0.82rem;
    color: var(--st-semantic-text-secondary, #475569);
    cursor: pointer;
  }
  .rail-clear {
    margin-top: 0.5rem;
    width: 100%;
    border: 1px solid var(--st-semantic-border-subtle, #e2e8f0);
    background: var(--st-semantic-surface-subtle, #f8fafc);
    border-radius: var(--st-radius-sm, 4px);
    padding: 0.3rem 0.5rem;
    cursor: pointer;
    font-size: 0.78rem;
    color: var(--st-semantic-text-secondary, #475569);
  }
</style>
