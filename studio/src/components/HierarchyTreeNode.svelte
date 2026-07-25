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
  import { Badge, Collapsible, SelectableRow } from "@sentropic/design-system-svelte";
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
  // "CODE Label" in ONE string: the row is a DS Collapsible/SelectableRow whose
  // title is plain text. Depth is already carried by the indent ladder, so no
  // `L<n>` badge is needed.
  const rowTitle = $derived(code ? `${code} ${label}` : label);
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
  {#if ctx?.entityStateOf}
    <EntityStateControl
      {key}
      {label}
      state={ctx.entityStateOf(key)}
      disabled={absorbedBy != null}
      {absorbedBy}
      dim={ctx.soloActive}
      onSetState={ctx.onSetEntityState}
    />
  {/if}
  {#if hasChildren}
    <!-- A node WITH children IS a class row: the DS Collapsible owns the
         disclosure and its chevron, so there is no bespoke triangle here. -->
    <Collapsible title={rowTitle} open={false} size="sm">
      {#snippet trailing()}
        <Badge shape="circle" size="sm" tone="neutral">{childIds.length}</Badge>
      {/snippet}
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
    </Collapsible>
  {:else}
    <!-- A LEAF is a leaf type row: the DS SelectableRow carries the click
         (here: select this node's subtree), so no bespoke button. -->
    <SelectableRow
      value={String(nodeId)}
      {selected}
      onselect={() => onSelectSubtree(nodeId)}
    >
      {rowTitle}
    </SelectableRow>
  {/if}
</li>

<style>
  .rail-hier-node {
    /* SAME row contract as a class row (.rail-onto-head): the visibility control
       and the DS row sit side by side, and the item is allowed to shrink so a
       deep row never pushes its trailing badge out of the x-clipped rail. */
    display: flex;
    align-items: flex-start;
    gap: 0.3rem;
    list-style: none;
    min-width: 0;
  }
  /* The DS row takes the remaining width next to the fixed-size eye. */
  .rail-hier-node > :global(*:not(.esc-slot)) {
    flex: 1 1 auto;
    min-width: 0;
  }
  .rail-hier-children {
    margin: 0;
    /* padding-left is ADAPTIVE (inline, lib/railIndent.js): the step decays with
       depth and the cumulative indent is budget-capped, so a deep row keeps a
       usable label width inside the narrow rail. */
    border-left: 1px solid var(--st-color-border-subtle, rgba(128, 128, 128, 0.22));
  }
</style>
