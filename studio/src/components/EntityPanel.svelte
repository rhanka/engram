<script>
  /**
   * Right column entity panel: wiki description + relations + meta.
   * Mirrors the server `renderEntityPanel` shaping (graphAdapter.relationRowsFor
   * + the description sidecar). Clicking a relation target opens that entity
   * (highlight, NO graph reload) via onOpenEntity.
   */
  import {
    relationRowsFor,
    indexNodes,
    nodeLabel,
    nodeType,
    nodeCommunity,
    nodeSourcePath,
  } from "../lib/graphAdapter.js";
  import { renderInlineMarkdown } from "../lib/markdown.js";

  let { graph, focusId = null, entity = null, onOpenEntity } = $props();

  const node = $derived(focusId ? (indexNodes(graph).get(focusId) ?? null) : null);
  const relations = $derived(focusId ? relationRowsFor(focusId, graph) : []);
  const description = $derived.by(() => {
    const sidecar = entity?.description;
    if (sidecar && sidecar.status === "generated" && typeof sidecar.description === "string") {
      return sidecar.description.trim();
    }
    return null;
  });
</script>

<aside class="entity" aria-label="Entity detail">
  {#if !node}
    <div class="entity-empty">
      <p class="entity-empty-kicker">Entity</p>
      <p>Select a node in the graph or a result in the rail to inspect it here.</p>
    </div>
  {:else}
    <header class="entity-head">
      <p class="entity-kicker">{nodeType(node) ?? "Entity"}</p>
      <h2 class="entity-title">{nodeLabel(node)}</h2>
      <p class="entity-id">{node.id}</p>
    </header>

    <dl class="entity-meta">
      {#if nodeCommunity(node)}
        <div><dt>Community</dt><dd>{nodeCommunity(node)}</dd></div>
      {/if}
      {#if node.status}
        <div><dt>Status</dt><dd>{node.status}</dd></div>
      {/if}
      {#if node.confidence}
        <div><dt>Confidence</dt><dd>{node.confidence}</dd></div>
      {/if}
      {#if nodeSourcePath(node)}
        <div><dt>Source</dt><dd class="entity-src">{nodeSourcePath(node)}</dd></div>
      {/if}
    </dl>

    {#if description}
      <section class="entity-section">
        <h3 class="entity-section-heading">Description</h3>
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        <div class="entity-description">{@html renderInlineMarkdown(description)}</div>
      </section>
    {:else if entity}
      <section class="entity-section">
        <h3 class="entity-section-heading">Description</h3>
        <p class="entity-empty-inline">No generated description for this entity.</p>
      </section>
    {/if}

    <section class="entity-section">
      <h3 class="entity-section-heading">
        Relations <span class="entity-counter">{relations.length}</span>
      </h3>
      {#if relations.length === 0}
        <p class="entity-empty-inline">No relations.</p>
      {:else}
        <ul class="entity-relations">
          {#each relations as rel (rel.direction + rel.otherId + rel.relation)}
            <li>
              <button
                class="entity-relation"
                onclick={() => onOpenEntity?.(rel.otherId)}
                title={rel.otherId}
              >
                <span class="entity-relation-kind">{rel.relation}</span>
                <span class="entity-relation-arrow" aria-hidden="true">
                  {rel.direction === "out" ? "→" : "←"}
                </span>
                <span class="entity-relation-target">{rel.otherLabel}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
</aside>

<style>
  .entity {
    background: var(--st-semantic-surface-default, #fff);
    overflow-y: auto;
    min-height: 0;
    padding: 1rem 1.1rem 2rem;
  }
  .entity-empty,
  .entity-empty-inline {
    color: var(--st-semantic-text-muted, #64748b);
  }
  .entity-empty-kicker,
  .entity-kicker {
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--st-semantic-text-muted, #64748b);
  }
  .entity-title {
    margin: 0.15rem 0 0.2rem;
    font-size: 1.15rem;
    line-height: 1.25;
    color: var(--st-semantic-text-primary, #0f172a);
  }
  .entity-id {
    margin: 0;
    font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
    font-size: 0.72rem;
    color: var(--st-semantic-text-muted, #64748b);
    overflow-wrap: anywhere;
  }
  .entity-meta {
    margin: 0.9rem 0 0;
    display: grid;
    gap: 0.3rem;
    font-size: 0.82rem;
  }
  .entity-meta > div {
    display: grid;
    grid-template-columns: 6.5rem 1fr;
    gap: 0.5rem;
  }
  .entity-meta dt {
    margin: 0;
    color: var(--st-semantic-text-muted, #64748b);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 0.68rem;
    font-weight: 600;
  }
  .entity-meta dd {
    margin: 0;
    color: var(--st-semantic-text-primary, #0f172a);
    overflow-wrap: anywhere;
  }
  .entity-src {
    font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
    font-size: 0.72rem;
  }
  .entity-section {
    margin-top: 1.2rem;
  }
  .entity-section-heading {
    margin: 0 0 0.5rem;
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--st-semantic-text-secondary, #475569);
  }
  .entity-counter {
    color: var(--st-semantic-text-muted, #64748b);
    font-variant-numeric: tabular-nums;
  }
  .entity-description {
    line-height: 1.5;
    color: var(--st-semantic-text-primary, #0f172a);
    font-size: 0.9rem;
  }
  .entity-relations {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.25rem;
  }
  .entity-relation {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    width: 100%;
    text-align: left;
    border: 1px solid var(--st-semantic-border-subtle, #e2e8f0);
    background: var(--st-semantic-surface-subtle, #f8fafc);
    border-radius: var(--st-radius-sm, 4px);
    padding: 0.35rem 0.5rem;
    cursor: pointer;
    color: var(--st-semantic-text-primary, #0f172a);
    font-size: 0.82rem;
  }
  .entity-relation:hover {
    border-color: var(--st-semantic-action-primary, #2563eb);
  }
  .entity-relation-kind {
    color: var(--st-semantic-text-link, #2563eb);
    font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
    font-size: 0.72rem;
    white-space: nowrap;
  }
  .entity-relation-arrow {
    color: var(--st-semantic-text-muted, #64748b);
  }
  .entity-relation-target {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .entity-empty-inline {
    margin: 0;
    font-style: italic;
    font-size: 0.82rem;
  }
</style>
