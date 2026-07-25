<script>
  /**
   * ONE node of the single ontology tree — rendered RECURSIVELY at any depth.
   *
   * The rail used to hardcode exactly two class levels (Domain → Sub-domain →
   * types), which forced every taxonomy into that shape and left a class like
   * `ABP` as a node-type dead end while the REAL multi-level process tree lived
   * in a separate "Hierarchies" accordion. There is only ONE ontology, so a
   * class node here can carry, in this order:
   *
   *   1. the registry FORESTS it owns (`member_hierarchies` → the
   *      scene-hierarchies sidecar) — spliced in place as navigable,
   *      lazy child-direct trees. Several forests stay SEPARATE root sets;
   *      they are never merged into one tree.
   *   2. its child CLASSES (recursion — arbitrary depth, not just 2 levels),
   *   3. its own leaf TYPE rows (the type FILTER facet).
   *
   * Everything else (the per-row 4-state visibility control, the type filter
   * SelectableRow) behaves exactly as before.
   */
  import { SelectableRow, Badge, Collapsible } from "@sentropic/design-system-svelte";
  import TypeShapeGlyph from "./TypeShapeGlyph.svelte";
  import EntityStateControl from "./EntityStateControl.svelte";
  import HierarchyTreeNode from "./HierarchyTreeNode.svelte";
  import Self from "./OntologyClassNode.svelte";
  import { groupKeyForOntology, groupKeyForType } from "../lib/viewerState.js";

  let {
    // { id, label, count, types[], forests[], subs[] } — see LeftRail.typeTree.
    node,
    // Label of the nearest GROUPED ancestor class, or null. A row under a
    // grouped ancestor is absorbed ⇒ its own control is disabled.
    absorbedBy = null,
    // Shared render context (derived state + callbacks) — one object instead of
    // a dozen props threaded through every recursion level.
    ctx,
  } = $props();

  const key = $derived(groupKeyForOntology(node.id));
  const absorption = $derived(ctx.ontologyAbsorbed.get(node.id));
  // A class grouped HERE absorbs everything below it.
  const childAbsorbedBy = $derived(
    absorbedBy ?? (ctx.ontologyCheckedSet.has(node.id) ? node.label : null),
  );
</script>

<li class="rail-onto-head">
  <EntityStateControl
    {key}
    label={node.label}
    state={ctx.entityStateOf(key)}
    disabled={absorption?.absorbed === true || absorbedBy != null}
    absorbedBy={absorbedBy ?? (absorption?.absorbed ? absorption.byLabel : null)}
    dim={ctx.soloActive}
    onSetState={ctx.onSetEntityState}
  />
  <Collapsible title={node.label} open={false} size="sm">
    {#snippet trailing()}
      <Badge shape="circle" size="sm" tone="neutral">{node.count}</Badge>
    {/snippet}

    <!-- 1. The registry forests this class OWNS, spliced in place. A single
         forest hangs its roots straight off the class (expanding `ABP` reveals
         DE → DE.AI → DE.AI.01 …); several forests keep one sub-accordion each
         so they are never presented as one merged tree. -->
    {#each node.forests as forest (forest.key)}
      {#if node.forests.length === 1}
        <ul class="rail-hier-children rail-hier-root" aria-label={`${node.label} tree`}>
          {#each forest.rootIds as rid (rid)}
            <HierarchyTreeNode
              nodeId={rid}
              nodesById={forest.hierarchy.nodes_by_id}
              labelFor={ctx.labelForRaw}
              sceneIdFor={ctx.sceneIdForRaw}
              selectedSet={ctx.entitySet}
              onSelectSubtree={(raw) => ctx.onSelectSubtree(forest.hierarchy, raw)}
            />
          {/each}
        </ul>
      {:else}
        <Collapsible title={forest.label} open={false} size="sm">
          {#snippet trailing()}
            <Badge shape="circle" size="sm" tone="neutral">{forest.nodeCount}</Badge>
          {/snippet}
          <ul class="rail-hier-children rail-hier-root" aria-label={`${forest.label} tree`}>
            {#each forest.rootIds as rid (rid)}
              <HierarchyTreeNode
                nodeId={rid}
                nodesById={forest.hierarchy.nodes_by_id}
                labelFor={ctx.labelForRaw}
                sceneIdFor={ctx.sceneIdForRaw}
                selectedSet={ctx.entitySet}
                onSelectSubtree={(raw) => ctx.onSelectSubtree(forest.hierarchy, raw)}
              />
            {/each}
          </ul>
        </Collapsible>
      {/if}
      {#if forest.orphanCount || forest.danglingCount}
        <p class="rail-hier-note">
          {forest.orphanCount} orphan{forest.orphanCount === 1 ? "" : "s"} ·
          {forest.danglingCount} unjoined arc{forest.danglingCount === 1 ? "" : "s"}
        </p>
      {/if}
    {/each}

    <!-- 2. Child classes — recursion, so the taxonomy is no longer capped at
         two levels. -->
    {#if node.subs.length}
      <ul class="rail-type-groups">
        {#each node.subs as sub (sub.id)}
          <Self node={sub} absorbedBy={childAbsorbedBy} {ctx} />
        {/each}
      </ul>
    {/if}

    <!-- 3. This class's own leaf TYPE rows (the FILTER facet), after the tree so
         a class that owns a forest opens ON the forest. -->
    {#if node.types.length}
      <ul class="rail-list">
        {#each node.types as t (t.key)}
          <li class="rail-type-row">
            <span class="esc-slot rail-type-group-check">
              <EntityStateControl
                key={groupKeyForType(t.key)}
                label={t.key}
                state={ctx.entityStateOf(groupKeyForType(t.key))}
                disabled={childAbsorbedBy != null}
                absorbedBy={childAbsorbedBy}
                dim={ctx.soloActive}
                onSetState={ctx.onSetEntityState}
              />
            </span>
            <SelectableRow
              value={t.key}
              selected={ctx.typeSet.has(t.key)}
              onselect={() => ctx.onToggleType?.(t.key)}
            >
              {#snippet leading()}
                <TypeShapeGlyph type={t.key} />
              {/snippet}
              {t.key}
              {#snippet trailing()}
                <Badge shape="circle" size="sm" tone="neutral">{t.count}</Badge>
              {/snippet}
            </SelectableRow>
          </li>
        {/each}
      </ul>
    {/if}
  </Collapsible>
</li>

<style>
  /* These rules used to live in LeftRail's scoped block; they move WITH the
     markup so the recursive node stays self-contained at any depth. */
  .rail-onto-head {
    display: flex;
    align-items: flex-start;
    gap: 0.3rem;
    list-style: none;
  }
  .rail-onto-head > :global(.st-collapsible) {
    flex: 1 1 auto;
    min-width: 0;
  }
  .rail-onto-head > :global(.esc) {
    flex-shrink: 0;
    /* match the sm Collapsible header height so the glyph centres on the title */
    min-height: 1.85rem;
    align-items: center;
  }
  .esc-slot {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
  }
  /* Kill the nested Collapsible region's inline padding so the rail's single
     indent step (--rail-indent, set by LeftRail) is the only offset. */
  .rail-onto-head :global(.st-collapsible__region) {
    padding-left: 0;
    padding-right: 0;
  }
  ul.rail-type-groups,
  ul.rail-list {
    list-style: none;
    margin: 0;
    padding: 0 0 0 0.2rem;
    display: grid;
    gap: 0.15rem;
  }
  ul.rail-list {
    gap: 1px;
  }
  .rail-type-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .rail-type-row :global(.st-selectableRow) {
    flex: 1;
    min-width: 0;
    padding-left: 0;
  }
  ul.rail-hier-root {
    list-style: none;
    margin: 0;
    padding: 0 0 0 0.15rem;
  }
  .rail-hier-note {
    margin: 0.35rem 0 0;
    color: var(--st-semantic-text-muted, #64748b);
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
  }
</style>
