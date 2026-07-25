<script>
  /**
   * Lot 2 — one node of a scene-hierarchies process tree (ABP / PROCESS_STD / org),
   * rendered recursively. Drill-down is LAZY and CHILD-DIRECT: children mount
   * only when the row is expanded, and only the direct children are listed
   * (never a merged/flattened subtree). Selecting a node selects its whole
   * subtree (the rail maps raw registry ids → scene-node ids and folds them into
   * the selection). Cross-tree bridges (candidate_maps_to / evidence_maps_to) are
   * NOT children here — they stay weak scene edges, never tree structure.
   */
  import { Badge } from "@sentropic/design-system-svelte";
  import Self from "./HierarchyTreeNode.svelte";

  let {
    // Raw registry id of this node (the scene-hierarchies key, e.g. "AM01"/"DE").
    nodeId,
    // The hierarchy's `nodes_by_id` map (raw id → { child_ids, level, … }).
    nodesById,
    // Resolver: raw id → display label (from the graph, falls back to the id).
    labelFor,
    // Resolver: raw id → scene-node id, or null when the record is not joinable.
    sceneIdFor,
    // The current selection's scene-node id SET (drives the checked state).
    selectedSet,
    // Select/deselect this node's subtree (called with THIS node's raw id).
    onSelectSubtree,
  } = $props();

  let expanded = $state(false);

  const entry = $derived(nodesById?.[nodeId] ?? null);
  const childIds = $derived(entry?.child_ids ?? []);
  const hasChildren = $derived(childIds.length > 0);
  // Prefer the sidecar's OWN label: the artifact is self-describing, so a row
  // stays readable even for a record with no joinable scene node. Fall back to
  // the graph join, then to the raw id (which is itself the process code).
  const entryLabel = $derived(
    typeof entry?.label === "string" && entry.label ? entry.label : null,
  );
  const label = $derived(entryLabel ?? labelFor(nodeId));
  // "process code + label" — show the code alongside the name, unless the row is
  // self-labelled (label === id) and the code would just be printed twice.
  const code = $derived(label === String(nodeId) ? null : String(nodeId));
  const level = $derived(entry?.level ?? 0);
  const sceneId = $derived(sceneIdFor(nodeId));
  const selected = $derived(sceneId != null && selectedSet.has(sceneId));
</script>

<li class="rail-hier-node">
  <div class="rail-hier-row" class:is-selected={selected}>
    {#if hasChildren}
      <button
        type="button"
        class="rail-hier-toggle"
        aria-expanded={expanded}
        aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
        onclick={() => (expanded = !expanded)}
      >
        {expanded ? "▾" : "▸"}
      </button>
    {:else}
      <span class="rail-hier-toggle rail-hier-leaf" aria-hidden="true">·</span>
    {/if}
    <button
      type="button"
      class="rail-hier-label"
      class:is-selected={selected}
      aria-pressed={selected}
      title={nodeId}
      onclick={() => onSelectSubtree(nodeId)}
    >
      <span class="rail-hier-text">
        {#if code}<span class="rail-hier-code">{code}</span>{/if}{label}
      </span>
      <span class="rail-hier-badges">
        <Badge shape="circle" size="sm" tone="neutral">L{level}</Badge>
        {#if hasChildren}
          <Badge shape="circle" size="sm" tone="info">{childIds.length}</Badge>
        {/if}
      </span>
    </button>
  </div>
  {#if hasChildren && expanded}
    <ul class="rail-hier-children">
      {#each childIds as cid (cid)}
        <Self
          nodeId={cid}
          {nodesById}
          {labelFor}
          {sceneIdFor}
          {selectedSet}
          {onSelectSubtree}
        />
      {/each}
    </ul>
  {/if}
</li>

<style>
  .rail-hier-node {
    list-style: none;
  }
  .rail-hier-row {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    min-width: 0;
    border-radius: var(--st-radius-sm, 4px);
  }
  .rail-hier-row.is-selected {
    background: var(--st-color-surface-selected, rgba(80, 130, 255, 0.16));
  }
  .rail-hier-toggle {
    flex: 0 0 auto;
    width: 1.25rem;
    height: 1.25rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--st-color-text-muted, #7a8194);
    cursor: pointer;
    font-size: 0.7rem;
    line-height: 1;
  }
  .rail-hier-toggle:hover {
    color: var(--st-color-text, inherit);
  }
  .rail-hier-leaf {
    cursor: default;
  }
  .rail-hier-label {
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    min-width: 0;
    padding: 0.15rem 0.35rem;
    border: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
    text-align: left;
    font: inherit;
    border-radius: var(--st-radius-sm, 4px);
  }
  .rail-hier-label:hover {
    background: var(--st-color-surface-hover, rgba(128, 128, 128, 0.12));
  }
  .rail-hier-label.is-selected {
    font-weight: 600;
  }
  .rail-hier-text {
    /* Nested INSIDE the ontology tree these rows can sit 5+ levels deep, so the
       label must be allowed to shrink: without `min-width: 0` a flex item never
       goes below its content width, the row overflows the rail (which clips on
       x) and the trailing badges disappear off the right edge. */
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rail-hier-code {
    margin-right: 0.4rem;
    color: var(--st-color-text-muted, #7a8194);
    font-family: var(--st-font-mono, ui-monospace, monospace);
    font-size: 0.85em;
  }
  .rail-hier-badges {
    flex: 0 0 auto;
    display: inline-flex;
    gap: 0.25rem;
  }
  .rail-hier-children {
    margin: 0;
    /* One deep tree can nest many levels inside the ontology accordion; keep the
       per-level step small so a level-5 row still has usable label width. */
    padding: 0 0 0 0.55rem;
    border-left: 1px solid var(--st-color-border-subtle, rgba(128, 128, 128, 0.22));
  }
</style>
