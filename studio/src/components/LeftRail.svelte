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
    classHierarchies = null,
    query = "",
    selection = { types: [], communities: [], entities: [] },
    showWeakLinks = true,
    // B2: axis-scoped group-by state + the axes the current graph supports.
    groupBy = { axis: "none", ontology: { collapsedClassIds: [] }, community: { collapsedKeys: [] } },
    availableAxes = ["none"],
    // The scene's count badges (relocated under the search bar).
    stats = { nodeCount: 0, edgeCount: 0, communityCount: 0 },
    onToggleType,
    onToggleCommunity,
    onToggleEntity,
    onSetQuery,
    onToggleWeak,
    // B2 group-by callbacks (replace the ontology-class toggle).
    onSetAxis,
    onToggleCollapse,
    onFoldToLevel,
    onExpandAll,
  } = $props();

  const typeList = $derived(groupCounts(graph, nodeType));
  // Communities excluding degree-0 singletons (folded into `isolatedCount`).
  const communityInfo = $derived(communityStats(graph));

  // B2: which axes the picker offers (omit absent axes, C4). "none" always shown.
  const axisAvailable = $derived(new Set(availableAxes));
  const showCommunityAxis = $derived(axisAvailable.has("community"));
  const showOntologyAxis = $derived(axisAvailable.has("ontology"));

  // B2: the active axis's folded set, for per-row glyphs/state.
  const ontologyFolded = $derived(new Set(groupBy.ontology?.collapsedClassIds ?? []));
  const communityFolded = $derived(new Set(groupBy.community?.collapsedKeys ?? []));
  const activeFoldedCount = $derived(
    groupBy.axis === "ontology"
      ? ontologyFolded.size
      : groupBy.axis === "community"
        ? communityFolded.size
        : 0,
  );

  const typeSet = $derived(new Set(selection.types));
  // EVOL: nested Domain → Sub-domain → Type tree from the ontology class
  // taxonomy (class-hierarchies.json). Each leaf type keeps its live count and
  // its toggle behaviour; when no taxonomy is loaded the Types facet falls back
  // to the previous flat list.
  const typeTree = $derived.by(() => {
    const hs = classHierarchies?.hierarchies;
    if (!hs) return null;
    const h = hs[Object.keys(hs)[0]];
    if (!h?.classes_by_id || !(h.root_class_ids?.length)) return null;
    const classes = h.classes_by_id;
    const countByType = new Map(typeList.map((t) => [t.key, t.count]));
    const labelOf = (id) => classes[id]?.label || String(id).replace(/^class:/, "");
    const seen = new Set();
    const domains = h.root_class_ids
      .map((rootId) => {
        const subs = (classes[rootId]?.child_ids ?? [])
          .map((subId) => {
            const types = (classes[subId]?.member_node_types ?? []).map((t) => {
              seen.add(t);
              return { key: t, count: countByType.get(t) ?? 0 };
            });
            return { id: subId, label: labelOf(subId), types, count: types.reduce((n, t) => n + t.count, 0) };
          })
          .filter((s) => s.types.length);
        return { id: rootId, label: labelOf(rootId), subs, count: subs.reduce((n, s) => n + s.count, 0) };
      })
      .filter((d) => d.subs.length);
    // Types not covered by the taxonomy (and not synthetic class nodes) keep a
    // home so nothing disappears from the facet.
    const other = typeList.filter((t) => !seen.has(t.key) && t.key !== "OntologyClass");
    if (other.length) {
      const types = other.map((t) => ({ key: t.key, count: t.count }));
      const count = types.reduce((n, t) => n + t.count, 0);
      domains.push({ id: "__other__", label: "Other", count, subs: [{ id: "__other_sub__", label: "Ungrouped", types, count }] });
    }
    return domains;
  });

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

  // Tracked UI: the count badges live UNDER the search bar now. The node badge is
  // REACTIVE — it shows "x / total nodes" where x is the entity count matching the
  // current search query (entityTotal) and total is the full graph node count.
  // When there is no query, x === total. The denominator is the raw graph node
  // count (every node, not the scene's filtered count) so the ratio is stable as
  // the user types. Edges/groups come from the scene stats (unaffected by search).
  const totalNodeCount = $derived(graphNodes(graph).length);
  const hasQuery = $derived(query.trim().length > 0);

  // B2 / C2: the ontology FOLD tree (per-node "fold here" pills + glyphs), built
  // from the same taxonomy the Types facet uses but rendered as fold controls, not
  // selectable rows (the §Two-Concepts separation device). Domains/sub-domains get
  // a fold pill; leaf Type rows are read-only in v1 (F5 deferred).
  const foldTree = $derived.by(() => {
    const hs = classHierarchies?.hierarchies;
    if (!hs) return null;
    const h = hs[Object.keys(hs)[0]];
    if (!h?.classes_by_id || !(h.root_class_ids?.length)) return null;
    const classes = h.classes_by_id;
    const countByType = new Map(typeList.map((t) => [t.key, t.count]));
    const labelOf = (id) => classes[id]?.label || String(id).replace(/^class:/, "");
    const domains = h.root_class_ids
      .map((rootId) => {
        const subs = (classes[rootId]?.child_ids ?? [])
          .map((subId) => {
            const types = (classes[subId]?.member_node_types ?? []).map((t) => ({
              key: t,
              count: countByType.get(t) ?? 0,
            }));
            return {
              id: subId,
              label: labelOf(subId),
              types,
              count: types.reduce((n, t) => n + t.count, 0),
            };
          })
          .filter((s) => s.types.length);
        return {
          id: rootId,
          label: labelOf(rootId),
          subs,
          count: subs.reduce((n, s) => n + s.count, 0),
        };
      })
      .filter((d) => d.subs.length);
    return domains;
  });

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
    <!-- Tracked UI: count badges moved here from the AppChrome header. The node
         badge is REACTIVE to the search query: "x / total nodes". -->
    <span class="rail-stats" aria-label="Graph summary">
      <Badge tone={hasQuery ? "info" : "neutral"}>
        {#if hasQuery}{entityTotal} / {totalNodeCount} nodes{:else}{totalNodeCount} nodes{/if}
      </Badge>
      <Badge tone="neutral">{stats.edgeCount} edges</Badge>
      <Badge tone="info">{stats.communityCount} groups</Badge>
    </span>
  </div>

  <Collapsible title="Ontology" open={false}>
    {#snippet trailing()}
      <Badge shape="circle" size="sm" tone="neutral">{typeList.length}</Badge>
    {/snippet}
    {#if typeList.length === 0}
      <p class="rail-empty">No types.</p>
    {:else if typeTree}
      <!-- EVOL: nested Domain → Sub-domain → Type accordions (taxonomy-driven). -->
      <ul class="rail-type-groups">
        {#each typeTree as domain (domain.id)}
          <li>
            <Collapsible title={domain.label} open={false} size="sm">
              {#snippet trailing()}
                <Badge shape="circle" size="sm" tone="neutral">{domain.count}</Badge>
              {/snippet}
              <ul class="rail-type-groups">
                {#each domain.subs as sub (sub.id)}
                  <li>
                    <Collapsible title={sub.label} open={false} size="sm">
                      {#snippet trailing()}
                        <Badge shape="circle" size="sm" tone="neutral">{sub.count}</Badge>
                      {/snippet}
                      <ul class="rail-list">
                        {#each sub.types as t (t.key)}
                          <li>
                            <SelectableRow
                              value={t.key}
                              selected={typeSet.has(t.key)}
                              onselect={() => onToggleType?.(t.key)}
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
                    </Collapsible>
                  </li>
                {/each}
              </ul>
            </Collapsible>
          </li>
        {/each}
      </ul>
    {:else}
      <SelectableList
        class="rail-list"
        label="Ontology"
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

    <!-- B2 / C1+F1: the legacy ontology-class checkbox is removed (F2) — group-by
         is a nested sub-menu with an axis selector (None / Community / Ontology). -->
    <Collapsible title="Group by" open={false} size="sm">
      {#snippet trailing()}
        <Badge shape="circle" size="sm" tone="neutral">{groupBy.axis}</Badge>
      {/snippet}

      <div class="rail-axis" role="radiogroup" aria-label="Group-by axis">
        <button
          type="button"
          class="rail-axis-btn"
          role="radio"
          aria-checked={groupBy.axis === "none"}
          class:rail-axis-btn--on={groupBy.axis === "none"}
          onclick={() => onSetAxis?.("none")}
        >None</button>
        {#if showCommunityAxis}
          <button
            type="button"
            class="rail-axis-btn"
            role="radio"
            aria-checked={groupBy.axis === "community"}
            class:rail-axis-btn--on={groupBy.axis === "community"}
            onclick={() => onSetAxis?.("community")}
          >Community</button>
        {/if}
        {#if showOntologyAxis}
          <button
            type="button"
            class="rail-axis-btn"
            role="radio"
            aria-checked={groupBy.axis === "ontology"}
            class:rail-axis-btn--on={groupBy.axis === "ontology"}
            onclick={() => onSetAxis?.("ontology")}
          >Ontology</button>
        {/if}
      </div>

      {#if groupBy.axis === "ontology"}
        <p class="rail-facet-hint">Collapse the graph at any class — folding re-lays out the graph.</p>
        {#if foldTree}
          <div class="rail-fold-tree" aria-label="Collapse the graph at">
            {#each foldTree as domain (domain.id)}
              <Collapsible title={domain.label} open={false} size="sm">
                {#snippet trailing()}
                  <span class="rail-fold-trailing">
                    <Badge shape="circle" size="sm" tone="neutral">{domain.count}</Badge>
                    <button
                      type="button"
                      class="rail-fold-pill"
                      class:rail-fold-pill--on={ontologyFolded.has(domain.id)}
                      aria-pressed={ontologyFolded.has(domain.id)}
                      onclick={(e) => { e.stopPropagation(); onToggleCollapse?.(domain.id); }}
                    >
                      <span class="rail-fold-glyph" aria-hidden="true"
                        >{ontologyFolded.has(domain.id) ? "●" : "◯"}</span
                      >{ontologyFolded.has(domain.id) ? "folded" : "fold"}
                    </button>
                  </span>
                {/snippet}
                <ul class="rail-type-groups">
                  {#each domain.subs as sub (sub.id)}
                    <li>
                      <Collapsible title={sub.label} open={false} size="sm">
                        {#snippet trailing()}
                          <span class="rail-fold-trailing">
                            <Badge shape="circle" size="sm" tone="neutral">{sub.count}</Badge>
                            <button
                              type="button"
                              class="rail-fold-pill"
                              class:rail-fold-pill--on={ontologyFolded.has(sub.id)}
                              aria-pressed={ontologyFolded.has(sub.id)}
                              disabled={ontologyFolded.has(domain.id)}
                              onclick={(e) => { e.stopPropagation(); onToggleCollapse?.(sub.id); }}
                            >
                              <span class="rail-fold-glyph" aria-hidden="true"
                                >{ontologyFolded.has(sub.id) ? "●" : "◯"}</span
                              >{ontologyFolded.has(sub.id) ? "folded" : "fold"}
                            </button>
                          </span>
                        {/snippet}
                        <ul class="rail-list">
                          {#each sub.types as t (t.key)}
                            <li class="rail-fold-leaf">
                              <span class="rail-fold-glyph rail-fold-glyph--leaf" aria-hidden="true">·</span>
                              <span class="rail-fold-leaf-label">{t.key}</span>
                              <Badge shape="circle" size="sm" tone="neutral">{t.count}</Badge>
                            </li>
                          {/each}
                        </ul>
                      </Collapsible>
                    </li>
                  {/each}
                </ul>
              </Collapsible>
            {/each}
          </div>
          <div class="rail-fold-bulk">
            <span class="rail-fold-bulk-label">Fold all to:</span>
            <button type="button" class="rail-fold-baseline" onclick={() => onFoldToLevel?.(0)}>Domain</button>
            <button type="button" class="rail-fold-baseline" onclick={() => onFoldToLevel?.(1)}>Sub-domain</button>
            <button type="button" class="rail-fold-baseline" onclick={() => onFoldToLevel?.(2)}>Type</button>
          </div>
          {#if activeFoldedCount > 0}
            <button type="button" class="rail-reset-btn" onclick={() => onExpandAll?.()}>
              Expand all ({activeFoldedCount} folded)
            </button>
          {/if}
        {:else}
          <p class="rail-empty">No ontology taxonomy loaded.</p>
        {/if}
      {:else if groupBy.axis === "community"}
        <p class="rail-facet-hint">Fold members into their community — folding re-lays out the graph.</p>
        {#if communityInfo.liveCount === 0}
          <p class="rail-empty">No communities.</p>
        {:else}
          <ul class="rail-list">
            {#each communityInfo.live as c (c.key)}
              <li class="rail-fold-row">
                <span
                  class="rail-swatch"
                  style="background: var(--st-semantic-data-{c.tone}, #94a3b8)"
                  aria-hidden="true"
                ></span>
                <span class="rail-fold-leaf-label">{c.key}</span>
                <Badge shape="circle" size="sm" tone="neutral">{c.count}</Badge>
                <button
                  type="button"
                  class="rail-fold-pill"
                  class:rail-fold-pill--on={communityFolded.has(c.key)}
                  aria-pressed={communityFolded.has(c.key)}
                  onclick={() => onToggleCollapse?.(c.key)}
                >
                  <span class="rail-fold-glyph" aria-hidden="true"
                    >{communityFolded.has(c.key) ? "●" : "◯"}</span
                  >{communityFolded.has(c.key) ? "folded" : "fold"}
                </button>
              </li>
            {/each}
          </ul>
          {#if activeFoldedCount > 0}
            <button type="button" class="rail-reset-btn" onclick={() => onExpandAll?.()}>
              Expand all ({activeFoldedCount} folded)
            </button>
          {/if}
        {/if}
      {/if}
    </Collapsible>
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
  /* Tracked UI: the relocated count badges sit just under the search input. */
  .rail-stats {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--st-spacing-1, 0.25rem);
    margin-top: 0.45rem;
    font-variant-numeric: tabular-nums;
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

  /* B2 — group-by axis selector (segmented control). */
  .rail-axis {
    display: inline-flex;
    margin: 0.35rem 0 0.2rem;
    border: 1px solid var(--st-semantic-border-muted, #e2e8f0);
    border-radius: 5px;
    overflow: hidden;
  }
  .rail-axis-btn {
    padding: 0.28rem 0.6rem;
    border: 0;
    border-right: 1px solid var(--st-semantic-border-muted, #e2e8f0);
    background: var(--st-semantic-surface-default, #fff);
    color: var(--st-semantic-text-secondary, #475569);
    font-size: 0.76rem;
    cursor: pointer;
  }
  .rail-axis-btn:last-child {
    border-right: 0;
  }
  .rail-axis-btn--on {
    background: var(--st-semantic-action-primary, #2563eb);
    color: #fff;
  }
  /* B2 — fold tree + pills (the §Two-Concepts separation device: NO selectable
     rows / shape glyphs here; fold pills + state glyphs only). */
  .rail-fold-tree {
    display: grid;
    gap: 0.15rem;
    margin-top: 0.2rem;
  }
  .rail-fold-trailing {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  .rail-fold-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.12rem 0.4rem;
    border: 1px solid var(--st-semantic-border-muted, #e2e8f0);
    border-radius: 999px;
    background: var(--st-semantic-surface-default, #fff);
    color: var(--st-semantic-action-primary, #2563eb);
    font-size: 0.68rem;
    cursor: pointer;
  }
  .rail-fold-pill--on {
    background: var(--st-semantic-action-primary, #2563eb);
    color: #fff;
    border-color: var(--st-semantic-action-primary, #2563eb);
  }
  .rail-fold-pill:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .rail-fold-glyph {
    font-size: 0.7rem;
    line-height: 1;
  }
  .rail-fold-glyph--leaf {
    color: var(--st-semantic-text-muted, #64748b);
  }
  .rail-fold-leaf,
  .rail-fold-row {
    list-style: none;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.2rem 0.1rem;
    font-size: 0.78rem;
    color: var(--st-semantic-text-secondary, #475569);
  }
  .rail-fold-leaf-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rail-fold-bulk {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem;
    margin-top: 0.35rem;
  }
  .rail-fold-bulk-label {
    font-size: 0.72rem;
    color: var(--st-semantic-text-muted, #64748b);
  }
  .rail-fold-baseline {
    padding: 0.22rem 0.5rem;
    border: 1px solid var(--st-semantic-border-muted, #e2e8f0);
    border-radius: 4px;
    background: var(--st-semantic-surface-default, #fff);
    color: var(--st-semantic-action-primary, #2563eb);
    font-size: 0.72rem;
    cursor: pointer;
  }
  .rail-fold-baseline:hover {
    background: var(--st-semantic-surface-hover, #f1f5f9);
  }
</style>
