<script>
  /**
   * One node of a registry FOREST (ABP / PROCESS_STD / org unit tree), rendered
   * recursively — and a FIRST-CLASS ontology row.
   *
   * The forests are spliced into the ontology tree (OntologyClassNode), so a
   * process node is not "extra navigation" hanging off the ontology: it IS the
   * ontology, several levels below its class. It therefore carries exactly the
   * affordances of a class row:
   *
   *   - the 4-state VISIBILITY control (Normal · Grouped · Hidden · Show only),
   *     keyed by `hierarchy:<forestKey>:<rawId>`. Hiding a node hides its whole
   *     SUBTREE of entities (entityVisibility expands the key through the
   *     sidecar), and grouping folds that subtree INTO this node (groupBy's
   *     hierarchy axis). A node under a GROUPED ancestor is absorbed ⇒ disabled,
   *     the same rule the class rows follow.
   *   - subtree SELECTION (click the label = select every entity below).
   *
   * Drill-down stays LAZY and CHILD-DIRECT: children mount only when expanded,
   * and only direct children are listed (never a merged/flattened subtree).
   * Cross-tree bridges (candidate_maps_to / evidence_maps_to) are NOT children —
   * they stay weak scene edges, never tree structure.
   *
   * Indentation is ADAPTIVE (lib/railIndent.js): the step decays with the row's
   * rendered depth and the total is budget-capped, so a level-5 row keeps a
   * readable label and its badges inside the 306px rail.
   */
  import { Badge } from "@sentropic/design-system-svelte";
  import EntityStateControl from "./EntityStateControl.svelte";
  import Self from "./HierarchyTreeNode.svelte";
  import { indentStepCss } from "../lib/railIndent.js";
  import { groupKeyForHierarchy } from "../lib/viewerState.js";

  let {
    // Raw registry id of this node (the scene-hierarchies key, e.g. "AM01"/"DE").
    nodeId,
    // The forest this node belongs to (the scene-hierarchies hierarchy key). Part
    // of the visibility/group key, because two forests may reuse a code.
    forestKey,
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
    // Shared rail render context (entityStateOf / onSetEntityState / soloActive).
    // Absent ⇒ the row renders without its visibility control (never crashes).
    ctx = null,
    // Rendered depth in the ONE ontology ladder (class levels included), so the
    // adaptive indent keeps decaying instead of restarting at the forest root.
    depth = 0,
    // Label of the nearest GROUPED ancestor (class or forest node), or null.
    absorbedBy = null,
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

  // This row's own ontology key — the SAME vocabulary as a class row's.
  const key = $derived(groupKeyForHierarchy(String(forestKey), String(nodeId)));
  const grouped = $derived(ctx?.entityStateOf?.(key) === "grouped");
  // A node grouped HERE absorbs everything below it (class-row rule, recursively).
  const childAbsorbedBy = $derived(absorbedBy ?? (grouped ? label : null));
  const childIndent = $derived(indentStepCss(depth));
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
    {#if ctx?.entityStateOf}
      <span class="rail-hier-eye">
        <EntityStateControl
          {key}
          {label}
          state={ctx.entityStateOf(key)}
          disabled={absorbedBy != null}
          {absorbedBy}
          dim={ctx.soloActive}
          onSetState={ctx.onSetEntityState}
        />
      </span>
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
    <ul class="rail-hier-children" style={`padding-left: ${childIndent}`}>
      {#each childIds as cid (cid)}
        <Self
          nodeId={cid}
          {forestKey}
          {nodesById}
          {labelFor}
          {sceneIdFor}
          {selectedSet}
          {onSelectSubtree}
          {ctx}
          depth={depth + 1}
          absorbedBy={childAbsorbedBy}
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
    gap: 0.15rem;
    min-width: 0;
    border-radius: var(--st-radius-sm, 4px);
  }
  .rail-hier-row.is-selected {
    background: var(--st-color-surface-selected, rgba(80, 130, 255, 0.16));
  }
  .rail-hier-toggle {
    flex: 0 0 auto;
    width: 1rem;
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
  /* The eye keeps its intrinsic size at every depth — the indent budget, not the
     control, is what gives way as the tree deepens. */
  .rail-hier-eye {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
  }
  .rail-hier-label {
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.35rem;
    min-width: 0;
    padding: 0.15rem 0.2rem;
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
    margin-right: 0.35rem;
    color: var(--st-color-text-muted, #7a8194);
    font-family: var(--st-font-mono, ui-monospace, monospace);
    font-size: 0.85em;
  }
  .rail-hier-badges {
    flex: 0 0 auto;
    display: inline-flex;
    gap: 0.2rem;
  }
  .rail-hier-children {
    margin: 0;
    /* padding-left is ADAPTIVE (inline, from lib/railIndent.js): the step decays
       with depth and the cumulative indent is budget-capped, so a deep row keeps
       usable label width inside the narrow rail. */
    border-left: 1px solid var(--st-color-border-subtle, rgba(128, 128, 128, 0.22));
  }
</style>
