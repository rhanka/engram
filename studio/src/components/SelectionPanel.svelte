<script>
  /**
   * Right column = the current SELECTION (R8-3.A/F). Lists the selected buckets
   * (types, communities) and directly-selected entities; each bucket drills down
   * to its entities. Clicking an entity FOCUSES it (double emphasis in the graph
   * + its detail shown here). A ✕ removes a bucket/entity from the selection.
   */
  import Accordion from "./Accordion.svelte";
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
    focusEntity = null,
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
    selection.entities.map((id) => ({ id, label: nodeLabel(nodeIndex.get(id) ?? { id }) })),
  );
</script>

<aside class="sel" aria-label="Selection">
  {#if total === 0}
    <div class="sel-empty">
      <p class="sel-empty-kicker">Selection</p>
      <p>Pick types, communities or entities on the left. They appear here and
        are highlighted in the graph. Click an entity to focus it.</p>
    </div>
  {:else}
    <header class="sel-head">
      <span class="sel-kicker">Selection · {total}</span>
      <button class="sel-clear" onclick={() => onClear?.()}>Clear all</button>
    </header>

    {#if focusId}
      <section class="sel-detail" aria-label="Focused entity">
        <EntityPanel {graph} {focusId} entity={focusEntity} onOpenEntity={onFocusEntity} />
      </section>
    {/if}

    <div class="sel-buckets">
      {#each selection.types as type (type)}
        {@const items = entitiesByType(graph, type)}
        <div class="sel-bucket">
          <div class="sel-bucket-head">
            <span class="sel-bucket-kind">Type</span>
            <span class="sel-bucket-name">{type}</span>
            <button class="sel-remove" title="Remove" onclick={() => onToggleType?.(type)}>✕</button>
          </div>
          <Accordion title="Entities" count={items.length} open={false} compact>
            <ul class="sel-list">
              {#each items as e (e.id)}
                <li>
                  <button
                    class="sel-row"
                    class:focused={focusId === e.id}
                    onclick={() => onFocusEntity?.(e.id)}
                    title={e.id}
                  >{e.label}</button>
                </li>
              {/each}
            </ul>
          </Accordion>
        </div>
      {/each}

      {#each selection.communities as community (community)}
        {@const items = entitiesByCommunity(graph, community)}
        <div class="sel-bucket">
          <div class="sel-bucket-head">
            <span class="sel-bucket-kind">Community</span>
            <span class="sel-bucket-name">{community}</span>
            <button class="sel-remove" title="Remove" onclick={() => onToggleCommunity?.(community)}>✕</button>
          </div>
          <Accordion title="Entities" count={items.length} open={false} compact>
            <ul class="sel-list">
              {#each items as e (e.id)}
                <li>
                  <button
                    class="sel-row"
                    class:focused={focusId === e.id}
                    onclick={() => onFocusEntity?.(e.id)}
                    title={e.id}
                  >{e.label}</button>
                </li>
              {/each}
            </ul>
          </Accordion>
        </div>
      {/each}

      {#if directEntities.length > 0}
        <div class="sel-bucket">
          <div class="sel-bucket-head">
            <span class="sel-bucket-kind">Entities</span>
            <span class="sel-bucket-name">{directEntities.length} picked</span>
          </div>
          <ul class="sel-list">
            {#each directEntities as e (e.id)}
              <li class="sel-row-wrap">
                <button
                  class="sel-row"
                  class:focused={focusId === e.id}
                  onclick={() => onFocusEntity?.(e.id)}
                  title={e.id}
                >{e.label}</button>
                <button class="sel-remove" title="Remove" onclick={() => onToggleEntity?.(e.id)}>✕</button>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </div>
  {/if}
</aside>

<style>
  .sel {
    background: var(--st-semantic-surface-default, #fff);
    overflow-y: auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .sel-empty {
    padding: 1rem 1.1rem;
    color: var(--st-semantic-text-muted, #64748b);
  }
  .sel-empty-kicker,
  .sel-kicker {
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--st-semantic-text-muted, #64748b);
  }
  .sel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.6rem 0.85rem;
    border-bottom: 1px solid var(--st-semantic-border-subtle, #e2e8f0);
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
  .sel-detail {
    border-bottom: 1px solid var(--st-semantic-border-subtle, #e2e8f0);
  }
  .sel-buckets {
    display: grid;
    gap: 0.4rem;
    padding: 0.5rem 0.6rem 1.5rem;
  }
  .sel-bucket {
    border: 1px solid var(--st-semantic-border-subtle, #e2e8f0);
    border-radius: var(--st-radius-sm, 4px);
  }
  .sel-bucket-head {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.4rem 0.55rem;
    background: var(--st-semantic-surface-subtle, #f8fafc);
    border-radius: var(--st-radius-sm, 4px) var(--st-radius-sm, 4px) 0 0;
  }
  .sel-bucket-kind {
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 0.62rem;
    font-weight: 700;
    color: var(--st-semantic-text-muted, #64748b);
  }
  .sel-bucket-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
    font-size: 0.84rem;
    color: var(--st-semantic-text-primary, #0f172a);
  }
  .sel-remove {
    flex-shrink: 0;
    border: none;
    background: transparent;
    cursor: pointer;
    color: var(--st-semantic-text-muted, #64748b);
    font-size: 0.8rem;
    line-height: 1;
    padding: 0.1rem 0.25rem;
    border-radius: var(--st-radius-sm, 4px);
  }
  .sel-remove:hover {
    color: var(--st-semantic-feedback-error, #dc2626);
    background: var(--st-semantic-surface-subtle, #f1f5f9);
  }
  .sel-list {
    list-style: none;
    margin: 0;
    padding: 0.2rem;
    display: grid;
    gap: 1px;
  }
  .sel-row-wrap {
    display: flex;
    align-items: center;
    gap: 0.2rem;
  }
  .sel-row {
    flex: 1;
    min-width: 0;
    text-align: left;
    border: 1px solid transparent;
    background: transparent;
    border-radius: var(--st-radius-sm, 4px);
    padding: 0.3rem 0.45rem;
    cursor: pointer;
    color: var(--st-semantic-text-primary, #0f172a);
    font-size: 0.82rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sel-row:hover {
    background: var(--st-semantic-surface-subtle, #f8fafc);
  }
  .sel-row.focused {
    background: var(--st-semantic-surface-selected, #eff6ff);
    color: var(--st-semantic-action-primary, #2563eb);
    font-weight: 600;
  }
</style>
