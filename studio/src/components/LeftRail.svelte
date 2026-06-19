<script>
  /**
   * Left rail = navigation (R8-3). Order: Options (top) → Search → Types →
   * Communities → Entities. Each Type/Community/Entity row TOGGLES into/out of
   * the selection (click = add/remove); selected rows are marked. The selection
   * itself is shown in the right column (SelectionPanel).
   */
  import {
    SelectableList,
    SelectableRow,
    Search,
    Badge,
    Collapsible,
  } from "@sentropic/design-system-svelte";
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
    showOntologyClasses = false,
    collapsedClassCount = 0,
    onToggleType,
    onToggleCommunity,
    onToggleEntity,
    onSetQuery,
    onToggleWeak,
    onToggleOntologyClasses,
    onExpandAllClasses,
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

  // Communities + Entities use STANDALONE SelectableRows (selected/onselect), so
  // they need the selection-membership sets for the per-row `selected` flag.
  // (Types uses a SelectableList controlled by selection.types — see below.)
  const commSet = $derived(new Set(selection.communities));
  const entSet = $derived(new Set(selection.entities));

  // Types is wrapped in a DS SelectableList (only ~3 rows, so the listbox roving
  // tabindex is cheap). The list is controlled by the current selection array and
  // emits the FULL new array on every change; the studio's viewerState model is a
  // per-element toggle (toggleType), so recover the single key that flipped between
  // `prev` and `next` and forward it to the existing toggle action. A multi-toggle
  // changes exactly one key per activate.
  //
  // NOTE: Communities (222) and Entities (1000s) deliberately do NOT use
  // SelectableList — its register()/sortByDom() is O(n) per row → O(n²) at mount
  // of a large list, which pegs the main thread when those accordions expand.
  // Standalone rows keep the multi-toggle behavior at zero registration cost.
  function toggledKey(prev, next) {
    const before = new Set(prev);
    const after = new Set(next);
    for (const k of after) if (!before.has(k)) return k; // added
    for (const k of before) if (!after.has(k)) return k; // removed
    return null;
  }
  function onListChange(prev, next, toggle) {
    const key = toggledKey(prev, next);
    if (key != null) toggle?.(key);
  }
</script>

<aside class="rail" aria-label="Search">
  <header class="rail-head">
    <span class="rail-kicker">Search</span>
  </header>

  <div class="rail-search">
    <Search
      size="sm"
      placeholder="Search entities…"
      value={query}
      oninput={(e) => onSetQuery?.(e.currentTarget.value)}
      aria-label="Search entities"
    />
  </div>

  <Collapsible title="Types" open={false}>
    {#snippet trailing()}
      <Badge shape="circle" size="sm" tone="neutral">{typeList.length}</Badge>
    {/snippet}
    {#if typeList.length === 0}
      <p class="rail-empty">No types.</p>
    {:else}
      <SelectableList
        class="rail-list"
        label="Types"
        multiple
        value={selection.types}
        onchange={(next) => onListChange(selection.types, next, onToggleType)}
      >
        {#each typeList as t (t.key)}
          <SelectableRow value={t.key}>
            {#snippet leading()}
              <TypeShapeGlyph type={t.key} />
            {/snippet}
            {t.key}
            {#snippet trailing()}
              <Badge shape="circle" size="sm" tone="neutral">{t.count}</Badge>
            {/snippet}
          </SelectableRow>
        {/each}
      </SelectableList>
    {/if}
  </Collapsible>

  <Collapsible title="Communities" open={false}>
    {#snippet trailing()}
      <Badge shape="circle" size="sm" tone="neutral">{communityInfo.liveCount}</Badge>
    {/snippet}
    {#if communityInfo.liveCount === 0}
      <p class="rail-empty">No communities.</p>
    {:else}
      <ul class="rail-list">
        {#each communityInfo.live as c (c.key)}
          <li>
            <SelectableRow
              value={c.key}
              selected={commSet.has(c.key)}
              onselect={() => onToggleCommunity?.(c.key)}
            >
              {#snippet leading()}
                <span
                  class="rail-swatch"
                  style="background: var(--st-semantic-data-{c.tone}, #94a3b8)"
                  aria-hidden="true"
                ></span>
              {/snippet}
              {c.key}
              {#snippet trailing()}
                <Badge shape="circle" size="sm" tone="neutral">{c.count}</Badge>
              {/snippet}
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
  </Collapsible>

  <Collapsible title="Entities" open={false}>
    {#snippet trailing()}
      <Badge shape="circle" size="sm" tone="neutral">{entityTotal}</Badge>
    {/snippet}
    {#if entityTotal === 0}
      <p class="rail-empty">No matching entities.</p>
    {:else}
      <ul class="rail-type-groups">
        {#each entitiesByType as grp (grp.type)}
          <li>
            <Collapsible title={grp.type} open={false} size="sm">
              {#snippet trailing()}
                <Badge shape="circle" size="sm" tone="neutral">{grp.count}</Badge>
              {/snippet}
              <ul class="rail-list">
                {#each grp.items as r (r.id)}
                  <li>
                    <SelectableRow
                      value={r.id}
                      selected={entSet.has(r.id)}
                      onselect={() => onToggleEntity?.(r.id)}
                    >
                      <span class="rail-ent-label" title={r.id}>{r.label}</span>
                    </SelectableRow>
                  </li>
                {/each}
              </ul>
            </Collapsible>
          </li>
        {/each}
      </ul>
    {/if}
  </Collapsible>

  <Collapsible title="Options" open={false}>
    <label class="rail-facet">
      <input
        type="checkbox"
        checked={showWeakLinks}
        onchange={(e) => onToggleWeak?.(e.currentTarget.checked)}
      />
      Show weak (inferred) links
    </label>
    <label class="rail-facet">
      <input
        type="checkbox"
        checked={showOntologyClasses}
        onchange={(e) => onToggleOntologyClasses?.(e.currentTarget.checked)}
      />
      Show ontology classes
    </label>
    {#if showOntologyClasses}
      <p class="rail-facet-hint">
        Click a class node to fold its subtree; click again to expand.
      </p>
      {#if collapsedClassCount > 0}
        <button
          type="button"
          class="rail-reset-btn"
          onclick={() => onExpandAllClasses?.()}
        >
          Expand all classes ({collapsedClassCount} collapsed)
        </button>
      {/if}
    {/if}
  </Collapsible>
</aside>

<style>
  .rail {
    background: var(--st-semantic-surface-default, #fff);
    overflow-y: auto;
    min-height: 0;
    /* Contain accordion growth INSIDE the rail: without a height bound,
       `overflow-y: auto` never engages — an expanded menu grows the rail past
       the viewport, the DOCUMENT gets a scrollbar, the layout viewport narrows
       and the graph canvas resizes/shifts. height:100% (of the .col column)
       makes the rail itself scroll instead. */
    height: 100%;
    /* Reserve the scrollbar gutter permanently so the rail's content width is
       identical whether or not the scrollbar is visible (no reflow, no canvas
       resize, when a menu expands past the fold). */
    scrollbar-gutter: stable;
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
  /* The Communities/Entities lists are plain <ul> of standalone SelectableRows. */
  ul.rail-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 1px;
  }
  /* The Types list is a DS SelectableList (listbox wrapper, roving tabindex); each
     SelectableRow owns leading | content | trailing layout + selected styling. We
     only tighten the inter-row gap to the rail's dense 1px feel. */
  :global(.rail-list.st-selectableList) {
    gap: 1px;
  }
  /* Entity rows wrap the label in a titled span (hover tooltip = full id). The
     DS row content already ellipsizes; the span just carries the title. */
  .rail-ent-label {
    display: block;
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
  .rail-facet-hint {
    margin: 0.35rem 0 0.15rem;
    color: var(--st-semantic-text-muted, #64748b);
    font-size: 0.72rem;
    font-style: italic;
    line-height: 1.3;
  }
  .rail-reset-btn {
    margin-top: 0.25rem;
    padding: 0.3rem 0.55rem;
    border: 1px solid var(--st-semantic-border-muted, #e2e8f0);
    border-radius: 4px;
    background: var(--st-semantic-surface-default, #fff);
    color: var(--st-semantic-action-primary, #2563eb);
    font-size: 0.76rem;
    cursor: pointer;
  }
  .rail-reset-btn:hover {
    background: var(--st-semantic-surface-hover, #f1f5f9);
  }
</style>
