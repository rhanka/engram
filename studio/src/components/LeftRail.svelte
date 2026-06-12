<script>
  /**
   * Left rail = navigation (R8-3). Order: Options (top) → Search → Types →
   * Communities → Entities. Each Type/Community/Entity row TOGGLES into/out of
   * the selection (click = add/remove); selected rows are marked. The selection
   * itself is shown in the right column (SelectionPanel).
   */
  import { SelectableRow } from "@sentropic/design-system-svelte";
  import Accordion from "./Accordion.svelte";
  import TypeShapeGlyph from "./TypeShapeGlyph.svelte";
  import {
    graphNodes,
    nodeType,
    nodeLabel,
    groupCounts,
    communityStats,
  } from "../lib/graphAdapter.js";

  let {
    graph,
    query = "",
    selection = { types: [], communities: [], entities: [] },
    showWeakLinks = true,
    onToggleType,
    onToggleCommunity,
    onToggleEntity,
    onSetQuery,
    onToggleWeak,
  } = $props();

  const typeList = $derived(groupCounts(graph, nodeType));
  // Communities excluding degree-0 singletons (folded into `isolatedCount`).
  const communityInfo = $derived(communityStats(graph));

  // Entities grouped by type (count) -> rows, filtered by the search query.
  // No cap: per-type accordions stay collapsed so all entities are reachable.
  const entitiesByType = $derived.by(() => {
    const q = query.trim().toLowerCase();
    let nodes = graphNodes(graph);
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
  const entityTotal = $derived(entitiesByType.reduce((n, g) => n + g.count, 0));

  const typeSet = $derived(new Set(selection.types));
  const commSet = $derived(new Set(selection.communities));
  const entSet = $derived(new Set(selection.entities));
</script>

<aside class="rail" aria-label="Search">
  <header class="rail-head">
    <span class="rail-kicker">Search</span>
  </header>

  <div class="rail-search">
    <input
      type="search"
      placeholder="Search entities…"
      value={query}
      oninput={(e) => onSetQuery?.(e.currentTarget.value)}
      aria-label="Search entities"
    />
  </div>

  <Accordion title="Types" count={typeList.length} open={false}>
    {#if typeList.length === 0}
      <p class="rail-empty">No types.</p>
    {:else}
      <ul class="rail-list">
        {#each typeList as t (t.key)}
          <li>
            <SelectableRow value={t.key} selected={typeSet.has(t.key)} onselect={() => onToggleType?.(t.key)}>
              <span class="rail-row-content">
                <TypeShapeGlyph type={t.key} />
                <span class="rail-row-label">{t.key}</span>
                <span class="rail-row-count">{t.count}</span>
              </span>
            </SelectableRow>
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
            <SelectableRow value={c.key} selected={commSet.has(c.key)} onselect={() => onToggleCommunity?.(c.key)}>
              <span class="rail-row-content">
                <span
                  class="rail-swatch"
                  style="background: var(--st-semantic-data-{c.tone}, #94a3b8)"
                  aria-hidden="true"
                ></span>
                <span class="rail-row-label">{c.key}</span>
                <span class="rail-row-count">{c.count}</span>
              </span>
            </SelectableRow>
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

  <Accordion title="Entities" count={entityTotal} open={false}>
    {#if entityTotal === 0}
      <p class="rail-empty">No matching entities.</p>
    {:else}
      <ul class="rail-type-groups">
        {#each entitiesByType as grp (grp.type)}
          <li>
            <Accordion title={grp.type} count={grp.count} open={false} compact>
              <ul class="rail-list">
                {#each grp.items as r (r.id)}
                  <li>
                    <SelectableRow value={r.id} selected={entSet.has(r.id)} onselect={() => onToggleEntity?.(r.id)}>
                      <span class="rail-row-content" title={r.id}>
                        <span class="rail-row-label">{r.label}</span>
                      </span>
                    </SelectableRow>
                  </li>
                {/each}
              </ul>
            </Accordion>
          </li>
        {/each}
      </ul>
    {/if}
  </Accordion>

  <Accordion title="Options" open={false}>
    <label class="rail-facet">
      <input
        type="checkbox"
        checked={showWeakLinks}
        onchange={(e) => onToggleWeak?.(e.currentTarget.checked)}
      />
      Show weak (inferred) links
    </label>
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
  .rail-head {
    padding: 0.6rem 0.85rem 0;
  }
  .rail-kicker {
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--st-semantic-text-muted, #64748b);
  }
  .rail-search {
    padding: 0.5rem 0.85rem 0.7rem;
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
  /* SelectableRow (DS, R8-5) owns the row wrapper + selected styling; this is
     just the inner layout (swatch | label | count). */
  .rail-row-content {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    min-width: 0;
    font-size: 0.85rem;
  }
  .rail-row-label {
    flex: 1;
    /* min-width:0 lets the flex item shrink below its content so the ellipsis
       kicks in (and the count to its right stays in view) instead of overflowing. */
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rail-swatch {
    flex-shrink: 0;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1px solid rgba(0, 0, 0, 0.12);
  }
  .rail-row-count {
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
    color: var(--st-semantic-text-muted, #64748b);
    background: var(--st-semantic-surface-subtle, #f8fafc);
    border: 1px solid var(--st-semantic-border-subtle, #e2e8f0);
    border-radius: var(--st-radius-pill, 999px);
    padding: 0.02rem 0.45rem;
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
</style>
