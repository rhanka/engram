<script>
  /**
   * Collapsed-by-default disclosure section for the left rail.
   * `compact` = a nested (second-level) accordion: smaller, lighter summary so
   * the hierarchy reads (level 2 < level 1).
   */
  let { title, count = null, open = false, compact = false, children } = $props();
</script>

<details class="ws-acc" class:ws-acc--compact={compact} {open}>
  <summary class="ws-acc-summary">
    <span class="ws-acc-title">{title}</span>
    {#if count !== null}
      <span class="ws-acc-count">{count}</span>
    {/if}
  </summary>
  <div class="ws-acc-body">
    {@render children()}
  </div>
</details>

<style>
  .ws-acc {
    border-bottom: 1px solid var(--st-semantic-border-subtle, #e2e8f0);
  }
  .ws-acc-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.6rem 0.85rem;
    cursor: pointer;
    list-style: none;
    user-select: none;
    font-weight: 600;
    font-size: 0.82rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--st-semantic-text-secondary, #475569);
  }
  .ws-acc-summary::-webkit-details-marker {
    display: none;
  }
  .ws-acc-summary::before {
    content: "▸";
    margin-right: 0.4rem;
    font-size: 0.7rem;
    color: var(--st-semantic-text-muted, #64748b);
    transition: transform 0.12s ease;
  }
  /* Child combinator (>) so an open accordion only rotates ITS OWN marker, not
     the markers of nested (collapsed) child accordions. */
  .ws-acc[open] > .ws-acc-summary::before {
    transform: rotate(90deg);
  }
  /* Second-level (nested) accordion: smaller, lighter, no uppercase. */
  .ws-acc--compact > .ws-acc-summary {
    padding: 0.32rem 0.6rem;
    font-size: 0.74rem;
    font-weight: 500;
    text-transform: none;
    letter-spacing: 0;
    color: var(--st-semantic-text-primary, #0f172a);
  }
  .ws-acc--compact > .ws-acc-summary::before {
    font-size: 0.6rem;
  }
  .ws-acc--compact > .ws-acc-body {
    padding: 0.15rem 0.5rem 0.5rem 1rem;
  }
  .ws-acc-title {
    flex: 1;
  }
  .ws-acc-count {
    font-variant-numeric: tabular-nums;
    color: var(--st-semantic-text-muted, #64748b);
    background: var(--st-semantic-surface-subtle, #f8fafc);
    border: 1px solid var(--st-semantic-border-subtle, #e2e8f0);
    border-radius: var(--st-radius-pill, 999px);
    padding: 0.05rem 0.5rem;
    font-size: 0.72rem;
  }
  .ws-acc-body {
    padding: 0.25rem 0.6rem 0.7rem;
  }
</style>
