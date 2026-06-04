<script>
  /**
   * Left rail: Types / Facets / Results / Communities accordions (collapsed).
   * Pure presentational — derives its lists from the loaded graph and reports
   * intent up via the on* callbacks. Clicking a result row selects+opens the
   * entity (highlight, no graph reload). Clicking a type/community filters.
   */
  import Accordion from "./Accordion.svelte";
  import {
    graphNodes,
    nodeType,
    nodeLabel,
    groupCounts,
    nodeCommunity,
    communityStats,
  } from "../lib/graphAdapter.js";

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
  // Communities excluding degree-0 singletons (folded into `isolatedCount`).
  const communityInfo = $derived(communityStats(graph));

  // SVELTE-3: results grouped by type (count) -> entities, like the legacy rail.
  // No cap: every matching entity is reachable (the per-type accordions stay
  // collapsed, so only an opened type renders its rows).
  const resultsByType = $derived.by(() => {
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
    const byType = new Map();
    for (const n of nodes) {
      const t = nodeType(n) ?? "—";
      if (!byType.has(t)) byType.set(t, []);
      byType.get(t).push({ id: n.id, label: nodeLabel(n) });
    }
    return [...byType.entries()]
      .map(([type, items]) => ({
        type,
        count: items.length,
        items: items.sort((a, b) => a.label.localeCompare(b.label)),
      }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
  });
  const resultsTotal = $derived(resultsByType.reduce((n, g) => n + g.count, 0));
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

  <Accordion title="Results" count={resultsTotal} open={true}>
    {#if resultsTotal === 0}
      <p class="rail-empty">No matching entities.</p>
    {:else}
      <ul class="rail-type-groups">
        {#each resultsByType as grp (grp.type)}
          <li>
            <Accordion title={grp.type} count={grp.count} open={false}>
              <ul class="rail-list">
                {#each grp.items as r (r.id)}
                  <li>
                    <button
                      class="rail-row"
                      class:active={focusId === r.id}
                      class:selected={selectedIds.includes(r.id)}
                      onclick={() => onSelectEntity?.(r.id)}
                      title={r.id}
                    >
                      <span class="rail-row-label">{r.label}</span>
                    </button>
                  </li>
                {/each}
              </ul>
            </Accordion>
          </li>
        {/each}
      </ul>
    {/if}
  </Accordion>

  <Accordion title="Communities" count={communityInfo.liveCount}>
    {#if communityInfo.liveCount === 0}
      <p class="rail-empty">No communities.</p>
    {:else}
      <ul class="rail-list">
        {#each communityInfo.live as c (c.key)}
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
      {#if communityInfo.isolatedCount > 0}
        <p class="rail-isolated">
          Isolated · {communityInfo.isolatedCount}
          <span class="rail-isolated-note">degree-0, excluded from the count</span>
        </p>
      {/if}
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
  .rail-type-groups {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.15rem;
  }
  .rail-empty {
    margin: 0.25rem 0;
    color: var(--st-semantic-text-muted, #64748b);
    font-size: 0.82rem;
    font-style: italic;
  }
  .rail-isolated {
    margin: 0.35rem 0 0;
    padding: 0.3rem 0.5rem;
    border-top: 1px dotted var(--st-semantic-border-subtle, #e2e8f0);
    color: var(--st-semantic-text-secondary, #475569);
    font-size: 0.78rem;
    font-variant-numeric: tabular-nums;
  }
  .rail-isolated-note {
    display: block;
    color: var(--st-semantic-text-muted, #64748b);
    font-size: 0.68rem;
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
