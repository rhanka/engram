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
    Button,
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
    // B2 (per-item): the grouped item SET — namespaced keys
    // ("ontology:<classId>" | "community:<key>"). Every checked rail item adds
    // one key; checking GROUPS (collapses) it. Multi-select is the default.
    groupBy = { grouped: [] },
    // Which kinds are AVAILABLE to group (C4): ontology needs the taxonomy,
    // community needs ≥1 live community. The checkbox affordance is hidden for an
    // absent kind.
    canGroupOntology = false,
    canGroupCommunity = false,
    // B2 (§4) TRI-STATE bulk buttons: per-level { state:"none"|"partial"|"all",
    // done, total }. B2 (§3) absorption: class id -> { absorbed, byLabel }.
    ontologyLevelStates = {
      domain: { state: "none", done: 0, total: 0 },
      subDomain: { state: "none", done: 0, total: 0 },
      type: { state: "none", done: 0, total: 0 },
    },
    ontologyAbsorbed = new Map(),
    // B2 (§5) FLAT community bulk: true when EVERY live community is grouped.
    allCommunitiesGrouped = false,
    // B2 (§4/§5) scope-local "anything grouped" → native disabled on Ungroup all.
    ontologyGrouped = false,
    communityGrouped = false,
    // The scene's count badges (relocated under the search bar).
    stats = { nodeCount: 0, edgeCount: 0, communityCount: 0 },
    onToggleType,
    onToggleCommunity,
    onToggleEntity,
    onSetQuery,
    onToggleWeak,
    // B2 (per-item) group-by callbacks.
    onToggleGroupOntology,
    onToggleGroupCommunity,
    onToggleGroupType,
    onBulkLevel,
    onBulkCommunities,
    onClearOntologyGrouping,
    onClearCommunityGrouping,
  } = $props();

  const typeList = $derived(groupCounts(graph, nodeType));
  // Communities excluding degree-0 singletons (folded into `isolatedCount`).
  const communityInfo = $derived(communityStats(graph));

  // B2 (per-item): split the namespaced grouped SET into per-row membership sets.
  // A class/community/type is "grouped" when its namespaced key is present.
  // Mixing kinds is allowed; each row renders its own checked state here.
  const ontologyCheckedSet = $derived(
    new Set(
      (groupBy.grouped ?? [])
        .filter((k) => typeof k === "string" && k.startsWith("ontology:"))
        .map((k) => k.slice("ontology:".length)),
    ),
  );
  const communityCheckedSet = $derived(
    new Set(
      (groupBy.grouped ?? [])
        .filter((k) => typeof k === "string" && k.startsWith("community:"))
        .map((k) => k.slice("community:".length)),
    ),
  );
  const typeCheckedSet = $derived(
    new Set(
      (groupBy.grouped ?? [])
        .filter((k) => typeof k === "string" && k.startsWith("type:"))
        .map((k) => k.slice("type:".length)),
    ),
  );

  // B2 (§4): map a level's tri-state to the DS Button render contract. The DS
  // Button has only primary/secondary, so PARTIAL = secondary + a count Badge.
  //   none    → secondary, aria-pressed=false  (groups the level)
  //   all     → primary,   aria-pressed=true   (toggles OFF)
  //   partial → secondary, aria-pressed=false, badge "n/m" (completes to all)
  function levelButton(ls) {
    const s = ls ?? { state: "none", done: 0, total: 0 };
    if (s.state === "all") {
      return { variant: "primary", ariaPressed: "true", showBadge: false, badge: null };
    }
    if (s.state === "partial") {
      return {
        variant: "secondary",
        ariaPressed: "false",
        showBadge: true,
        badge: `${s.done}/${s.total}`,
      };
    }
    return { variant: "secondary", ariaPressed: "false", showBadge: false, badge: null };
  }
  const domainBtn = $derived(levelButton(ontologyLevelStates.domain));
  const subDomainBtn = $derived(levelButton(ontologyLevelStates.subDomain));
  const typeBtn = $derived(levelButton(ontologyLevelStates.type));

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

  <Collapsible title="Ontology" open={true}>
    {#snippet trailing()}
      <Badge shape="circle" size="sm" tone="neutral">{typeList.length}</Badge>
    {/snippet}
    {#if typeList.length === 0}
      <p class="rail-empty">No types.</p>
    {:else if typeTree}
      <!-- EVOL: nested Domain → Sub-domain → Type accordions (taxonomy-driven).
           B2 (per-item): each Ontology CLASS node (Domain + Sub-domain) carries an
           always-visible GROUP-BY checkbox in its header. Checking it GROUPS
           (collapses) that class; the FILTER facet (leaf Type SelectableRows →
           onToggleType) stays a SEPARATE concern. -->
      <ul class="rail-type-groups rail-onto-tree" aria-label="Ontology classes">
        {#each typeTree as domain (domain.id)}
          <li>
            <Collapsible title={domain.label} open={false} size="sm">
              {#snippet leading()}
                {@const dAbs = ontologyAbsorbed.get(domain.id)}
                <label
                  class="rail-group-check"
                  class:rail-group-check--on={ontologyCheckedSet.has(domain.id)}
                  title={dAbs?.absorbed
                    ? `grouped by parent ${dAbs.byLabel}`
                    : `Group by ${domain.label}`}
                  onclick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={ontologyCheckedSet.has(domain.id)}
                    disabled={dAbs?.absorbed === true}
                    aria-label="Group by {domain.label}"
                    onchange={() => onToggleGroupOntology?.(domain.id)}
                  />
                </label>
              {/snippet}
              {#snippet trailing()}
                <Badge shape="circle" size="sm" tone="neutral">{domain.count}</Badge>
              {/snippet}
              <ul class="rail-type-groups">
                {#each domain.subs as sub (sub.id)}
                  <li>
                    <Collapsible title={sub.label} open={false} size="sm">
                      {#snippet leading()}
                        {@const sAbs = ontologyAbsorbed.get(sub.id)}
                        <label
                          class="rail-group-check"
                          class:rail-group-check--on={ontologyCheckedSet.has(sub.id)}
                          title={sAbs?.absorbed
                            ? `grouped by parent ${sAbs.byLabel}`
                            : `Group by ${sub.label}`}
                          onclick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={ontologyCheckedSet.has(sub.id)}
                            disabled={sAbs?.absorbed === true}
                            aria-label="Group by {sub.label}"
                            onchange={() => onToggleGroupOntology?.(sub.id)}
                          />
                        </label>
                      {/snippet}
                      {#snippet trailing()}
                        <Badge shape="circle" size="sm" tone="neutral">{sub.count}</Badge>
                      {/snippet}
                      <ul class="rail-list">
                        {#each sub.types as t (t.key)}
                          <li class="rail-type-row">
                            <!-- B2 (§2): the leaf TYPE row carries its OWN bare
                                 group-by checkbox on the LEFT — folds entities of
                                 this `type`. It is SEPARATE from the Type FILTER
                                 SelectableRow (onToggleType) that follows it. -->
                            <label
                              class="rail-group-check rail-type-group-check"
                              class:rail-group-check--on={typeCheckedSet.has(t.key)}
                              title="Group by {t.key}"
                            >
                              <input
                                type="checkbox"
                                checked={typeCheckedSet.has(t.key)}
                                disabled={ontologyCheckedSet.has(sub.id) ||
                                  ontologyCheckedSet.has(domain.id)}
                                aria-label="Group by {t.key}"
                                onchange={() => onToggleGroupType?.(t.key)}
                              />
                            </label>
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
      <!-- B2 (§4): TRI-STATE bulk "Group all to: Domain | Sub-domain | Type" via
           the DS Button (secondary↔primary + a count Badge for partial) + a
           scope-local Ungroup all (native disabled when nothing ontology is
           grouped). Only shown when the taxonomy supports grouping. -->
      {#if canGroupOntology}
        <div class="rail-fold-bulk" role="group" aria-label="Group all ontology to level">
          <span class="rail-fold-bulk-label">Group all to:</span>
          <span class="rail-fold-btn">
            <Button
              variant={domainBtn.variant}
              size="sm"
              aria-pressed={domainBtn.ariaPressed}
              aria-label={domainBtn.showBadge
                ? `Group all to Domain (${ontologyLevelStates.domain.done} of ${ontologyLevelStates.domain.total} grouped)`
                : "Group all to Domain"}
              onclick={() => onBulkLevel?.(0)}
            >
              Domain{#if domainBtn.showBadge}&nbsp;<Badge tone="neutral" size="sm">{domainBtn.badge}</Badge>{/if}
            </Button>
          </span>
          <span class="rail-fold-btn">
            <Button
              variant={subDomainBtn.variant}
              size="sm"
              aria-pressed={subDomainBtn.ariaPressed}
              aria-label={subDomainBtn.showBadge
                ? `Group all to Sub-domain (${ontologyLevelStates.subDomain.done} of ${ontologyLevelStates.subDomain.total} grouped)`
                : "Group all to Sub-domain"}
              onclick={() => onBulkLevel?.(1)}
            >
              Sub-domain{#if subDomainBtn.showBadge}&nbsp;<Badge tone="neutral" size="sm">{subDomainBtn.badge}</Badge>{/if}
            </Button>
          </span>
          <span class="rail-fold-btn">
            <Button
              variant={typeBtn.variant}
              size="sm"
              aria-pressed={typeBtn.ariaPressed}
              aria-label={typeBtn.showBadge
                ? `Group all to Type (${ontologyLevelStates.type.done} of ${ontologyLevelStates.type.total} grouped)`
                : "Group all to Type"}
              onclick={() => onBulkLevel?.(2)}
            >
              Type{#if typeBtn.showBadge}&nbsp;<Badge tone="neutral" size="sm">{typeBtn.badge}</Badge>{/if}
            </Button>
          </span>
        </div>
        <div class="rail-fold-ungroup">
          <Button
            variant="secondary"
            size="sm"
            disabled={!ontologyGrouped}
            aria-label="Ungroup all ontology"
            onclick={() => onClearOntologyGrouping?.()}
          >
            Ungroup all
          </Button>
        </div>
      {/if}
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

  <Collapsible title="Communities" open={true}>
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
                <!-- B2 (per-item): the GROUP-BY checkbox is the FIRST thing on the
                     row (left edge), before the color swatch. Checking it GROUPS
                     (collapses) the community; the row's own SELECT
                     (onToggleCommunity, filter) stays a separate concern. -->
                <span class="rail-comm-lead">
                  <label
                    class="rail-group-check"
                    class:rail-group-check--on={communityCheckedSet.has(c.key)}
                    title="Group by {c.key}"
                    onclick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={communityCheckedSet.has(c.key)}
                      aria-label="Group by {c.key}"
                      onchange={() => onToggleGroupCommunity?.(c.key)}
                    />
                  </label>
                  <span
                    class="rail-swatch"
                    style="background: var(--st-semantic-data-{c.tone}, #94a3b8)"
                    aria-hidden="true"
                  ></span>
                </span>
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
      <!-- B2 (§5): FLAT 2-state community bulk — NO level, NO partial, NO count.
           `Group all` (secondary→primary when ALL grouped, click toggles) +
           a scope-local `Ungroup all` (native disabled when none grouped). -->
      {#if canGroupCommunity}
        <div class="rail-fold-bulk rail-comm-bulk" role="group" aria-label="Group all communities">
          <span class="rail-fold-btn">
            <Button
              variant={allCommunitiesGrouped ? "primary" : "secondary"}
              size="sm"
              aria-pressed={allCommunitiesGrouped ? "true" : "false"}
              aria-label="Group all communities"
              onclick={() => onBulkCommunities?.()}
            >
              Group all
            </Button>
          </span>
          <span class="rail-fold-btn">
            <Button
              variant="secondary"
              size="sm"
              disabled={!communityGrouped}
              aria-label="Ungroup all communities"
              onclick={() => onClearCommunityGrouping?.()}
            >
              Ungroup all
            </Button>
          </span>
        </div>
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

    <!-- B2 (per-item): group-by is NOT a separate axis sub-menu anymore — every
         groupable Ontology class / Community owns its OWN checkbox inline in its
         facet section above (the legacy class-display checkbox and the axis
         selector were both removed, F2). Options keeps only true graph options
         (weak links). -->
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
  .rail-onto-tree {
    margin-top: 0.15rem;
  }
  /* B2 (§2): the leaf Type row puts its bare group-by checkbox FIRST (left),
     then the Type FILTER SelectableRow — two separate concerns on one line. */
  .rail-type-row {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }
  .rail-type-row :global(.st-selectableRow) {
    flex: 1;
    min-width: 0;
  }
  .rail-type-group-check {
    flex-shrink: 0;
  }
  /* B2 (per-item): the per-item GROUP-BY checkbox affordance, now the FIRST
     element on the LEFT edge of every groupable row (Ontology class header /
     Community row), BEFORE the label. At rest it is a BARE checkbox — NO text.
     The "group by" meaning is signalled on HOVER only (the title tooltip plus a
     subtle ring around the box); never a persistent text label. */
  .rail-group-check {
    display: inline-flex;
    align-items: center;
    cursor: pointer;
    /* A faint hover ring is layered behind the box; keep a transparent baseline
       so only hover/focus reveals it (no persistent visual chrome at rest). */
    border-radius: 4px;
    outline: 1px solid transparent;
    outline-offset: 1px;
    transition: outline-color 0.12s ease;
  }
  .rail-group-check input {
    margin: 0;
    cursor: pointer;
  }
  /* Hover/focus-only hint: a faint outline appears around the bare checkbox when
     the row is hovered or the box is focused, signalling "group by …" WITHOUT any
     text. The title tooltip carries the wording. */
  :global(.st-collapsible__header:hover) .rail-group-check,
  :global(.st-selectableRow:hover) .rail-group-check,
  .rail-group-check:focus-within {
    outline-color: var(--st-semantic-action-primary, #2563eb);
  }
  /* A grouped (checked) row keeps the accent ring so the active fold is legible. */
  .rail-group-check--on {
    outline-color: var(--st-semantic-action-primary, #2563eb);
  }
  /* Community row: the bare group-by checkbox sits FIRST, then the color swatch. */
  .rail-comm-lead {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
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
  /* The tri-state DS Button keeps its label + (n/m) Badge on one line. */
  .rail-fold-btn :global(.st-button) {
    display: inline-flex;
    align-items: center;
  }
  .rail-fold-ungroup {
    margin-top: 0.3rem;
  }
  .rail-comm-bulk {
    margin-top: 0.45rem;
  }
</style>
