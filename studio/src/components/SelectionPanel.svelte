<script>
  /**
   * Right column = the current SELECTION (R8-3, mirror of the left rail but
   * filtered to what's selected). Top-level accordions Types / Communities /
   * Entities. A selected Type/Community drills down to its entities; every
   * entity row EXPANDS to its detail (description / relations / citations) —
   * the detail also opens when the entity is picked in the graph (focusId).
   * ✕ removes a bucket or entity from the selection.
   */
  import { Badge, Collapsible } from "@sentropic/design-system-svelte";
  import EntityPanel from "./EntityPanel.svelte";
  import {
    entitiesByType,
    entitiesByCommunity,
    indexNodes,
    nodeLabel,
  } from "../lib/graphAdapter.js";

  let {
    graph,
    selection = { types: [], communities: [], entities: [] },
    focusId = null,
    entityCache = {},
    onSetFocus,
    onFocusEntity,
    onToggleType,
    onToggleCommunity,
    onToggleEntity,
    onClear,
  } = $props();

  const total = $derived(
    selection.types.length + selection.communities.length + selection.entities.length,
  );
  const nodeIndex = $derived(indexNodes(graph));
  const directEntities = $derived(
    selection.entities
      .map((id) => ({ id, label: nodeLabel(nodeIndex.get(id) ?? { id }) }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  );
</script>

{#snippet entityRow(e, removable)}
  <div class="sel-entity" class:open={focusId === e.id}>
    <div class="sel-entity-bar">
      <button
        class="sel-entity-head"
        aria-expanded={focusId === e.id}
        onclick={() => onSetFocus?.(focusId === e.id ? null : e.id)}
        title={e.id}
      >
        <span class="sel-chevron" aria-hidden="true">{focusId === e.id ? "▾" : "▸"}</span>
        <span class="sel-entity-label">{e.label}</span>
      </button>
      {#if removable}
        <button class="sel-remove" title="Remove" onclick={() => onToggleEntity?.(e.id)}>✕</button>
      {/if}
    </div>
    {#if focusId === e.id}
      <div class="sel-entity-detail">
        <EntityPanel
          {graph}
          focusId={e.id}
          entity={entityCache[e.id] ?? null}
          hideTitle
          onOpenEntity={onFocusEntity}
        />
      </div>
    {/if}
  </div>
{/snippet}

<aside class="sel" aria-label="Selection">
  <header class="sel-head">
    <span class="sel-kicker">Selection · {total}</span>
    {#if total > 0}
      <button class="sel-clear" onclick={() => onClear?.()}>Clear all</button>
    {/if}
  </header>

  {#if total === 0}
    <p class="sel-empty">
      Pick types, communities or entities on the left. They appear here and are
      highlighted in the graph. Expand an entity (or click it in the graph) to
      see its detail.
    </p>
  {:else}
    <Collapsible title="Types" open={selection.types.length > 0}>
      {#snippet trailing()}
        <Badge shape="circle" size="sm" tone="neutral">{selection.types.length}</Badge>
      {/snippet}
      {#if selection.types.length === 0}
        <p class="sel-muted">No type selected.</p>
      {:else}
        <div class="sel-buckets">
          {#each selection.types as type (type)}
            {@const items = entitiesByType(graph, type)}
            <div class="sel-bucket">
              <div class="sel-bucket-head">
                <span class="sel-bucket-name">{type}</span>
                <button class="sel-remove" title="Remove" onclick={() => onToggleType?.(type)}>✕</button>
              </div>
              <Collapsible title="Entities" open={false} size="sm">
                {#snippet trailing()}
                  <Badge shape="circle" size="sm" tone="neutral">{items.length}</Badge>
                {/snippet}
                <div class="sel-entities">
                  {#each items as e (e.id)}{@render entityRow(e, false)}{/each}
                </div>
              </Collapsible>
            </div>
          {/each}
        </div>
      {/if}
    </Collapsible>

    <Collapsible title="Communities" open={selection.communities.length > 0}>
      {#snippet trailing()}
        <Badge shape="circle" size="sm" tone="neutral">{selection.communities.length}</Badge>
      {/snippet}
      {#if selection.communities.length === 0}
        <p class="sel-muted">No community selected.</p>
      {:else}
        <div class="sel-buckets">
          {#each selection.communities as community (community)}
            {@const items = entitiesByCommunity(graph, community)}
            <div class="sel-bucket">
              <div class="sel-bucket-head">
                <span class="sel-bucket-name">{community}</span>
                <button class="sel-remove" title="Remove" onclick={() => onToggleCommunity?.(community)}>✕</button>
              </div>
              <Collapsible title="Entities" open={false} size="sm">
                {#snippet trailing()}
                  <Badge shape="circle" size="sm" tone="neutral">{items.length}</Badge>
                {/snippet}
                <div class="sel-entities">
                  {#each items as e (e.id)}{@render entityRow(e, false)}{/each}
                </div>
              </Collapsible>
            </div>
          {/each}
        </div>
      {/if}
    </Collapsible>

    <Collapsible title="Entities" open={selection.entities.length > 0}>
      {#snippet trailing()}
        <Badge shape="circle" size="sm" tone="neutral">{selection.entities.length}</Badge>
      {/snippet}
      {#if directEntities.length === 0}
        <p class="sel-muted">No entity selected.</p>
      {:else}
        <div class="sel-entities">
          {#each directEntities as e (e.id)}{@render entityRow(e, true)}{/each}
        </div>
      {/if}
    </Collapsible>
  {/if}
</aside>

<style>
  .sel {
    background: var(--st-semantic-surface-default, #fff);
    /* BUG B: the right rail must scroll INSIDE its column like the left rail
       (.rail), not spill its overflow to the page. The left rail pins
       height:100% + scrollbar-gutter:stable so `overflow-y:auto` engages
       against the column height instead of growing the document; mirror that
       exact pattern here. Without height:100% the panel is content-sized, the
       column height bound is never reached, and a tall selection/detail pushes
       the whole document into an external scrollbar. */
    height: 100%;
    min-height: 0;
    overflow-y: auto;
    /* Reserve the gutter so the content width is identical with or without the
       scrollbar (no reflow when a long detail expands). */
    scrollbar-gutter: stable;
    display: flex;
    flex-direction: column;
  }
  .sel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.6rem 0.85rem;
    border-bottom: 1px solid var(--st-semantic-border-subtle, #e2e8f0);
  }
  .sel-kicker {
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--st-semantic-text-muted, #64748b);
  }
  .sel-clear {
    border: 1px solid var(--st-semantic-border-subtle, #e2e8f0);
    background: var(--st-semantic-surface-subtle, #f8fafc);
    border-radius: var(--st-radius-sm, 4px);
    padding: 0.2rem 0.55rem;
    cursor: pointer;
    font-size: 0.74rem;
    color: var(--st-semantic-text-secondary, #475569);
  }
  .sel-empty,
  .sel-muted {
    margin: 0;
    padding: 0.6rem 0.85rem;
    color: var(--st-semantic-text-muted, #64748b);
    font-size: 0.84rem;
  }
  .sel-muted {
    font-style: italic;
    padding: 0.3rem 0.5rem;
  }
  .sel-buckets {
    display: grid;
    gap: 0.4rem;
  }
  .sel-bucket {
    border: 1px solid var(--st-semantic-border-subtle, #e2e8f0);
    border-radius: var(--st-radius-sm, 4px);
  }
  .sel-bucket-head {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.35rem 0.55rem;
    background: var(--st-semantic-surface-subtle, #f8fafc);
    border-radius: var(--st-radius-sm, 4px) var(--st-radius-sm, 4px) 0 0;
  }
  .sel-bucket-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
    font-size: 0.82rem;
    color: var(--st-semantic-text-primary, #0f172a);
  }
  .sel-entities {
    display: grid;
    gap: 1px;
  }
  .sel-entity-bar {
    display: flex;
    align-items: center;
    gap: 0.2rem;
  }
  .sel-entity-head {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.35rem;
    text-align: left;
    border: 1px solid transparent;
    background: transparent;
    border-radius: var(--st-radius-sm, 4px);
    padding: 0.3rem 0.45rem;
    cursor: pointer;
    color: var(--st-semantic-text-primary, #0f172a);
    font-size: 0.82rem;
  }
  .sel-entity-head:hover {
    background: var(--st-semantic-surface-subtle, #f8fafc);
  }
  .sel-entity.open > .sel-entity-bar > .sel-entity-head {
    background: var(--st-semantic-surface-selected, #eff6ff);
    color: var(--st-semantic-action-primary, #2563eb);
    font-weight: 600;
  }
  .sel-chevron {
    flex-shrink: 0;
    width: 0.7rem;
    font-size: 0.6rem;
    color: var(--st-semantic-text-muted, #64748b);
  }
  .sel-entity-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sel-entity-detail {
    border-left: 2px solid var(--st-semantic-border-subtle, #e2e8f0);
    margin: 0.1rem 0 0.3rem 0.6rem;
  }
  .sel-remove {
    flex-shrink: 0;
    border: none;
    background: transparent;
    cursor: pointer;
    color: var(--st-semantic-text-muted, #64748b);
    font-size: 0.8rem;
    line-height: 1;
    padding: 0.1rem 0.3rem;
    border-radius: var(--st-radius-sm, 4px);
  }
  .sel-remove:hover {
    color: var(--st-semantic-feedback-error, #dc2626);
    background: var(--st-semantic-surface-subtle, #f1f5f9);
  }
</style>
