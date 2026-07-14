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
  import TimeScrub from "./TimeScrub.svelte";
  import EntityStateControl from "./EntityStateControl.svelte";
  import {
    graphNodes,
    nodeType,
    nodeLabel,
    groupCounts,
    communityStats,
  } from "../lib/graphAdapter.js";
  import {
    groupKeyForOntology,
    groupKeyForCommunity,
    groupKeyForType,
  } from "../lib/viewerState.js";

  let {
    graph,
    classHierarchies = null,
    // Storage LOT 2 (prefer-server): the store's precomputed `node_type`
    // group-by counts (the `GET /api/ontology/groups` payload), or null. When
    // present the Types rail uses these O(#groups) counts instead of an O(#nodes)
    // in-memory pass; null (the default flat-JSON studio) keeps the client count.
    serverTypeCounts = null,
    query = "",
    selection = { types: [], communities: [], entities: [] },
    showWeakLinks = true,
    // B2 (per-item): the grouped item SET — namespaced keys
    // ("ontology:<classId>" | "community:<key>"). Every checked rail item adds
    // one key; checking GROUPS (collapses) it. Multi-select is the default.
    groupBy = { grouped: [] },
    // 4-STATE control (D6): the per-entity visibility overlay { hidden:[], solo:[] }
    // keyed by the SAME namespaced keys as groupBy. The per-row EntityStateControl
    // renders the displayed state (Solo > Hidden > Grouped > Normal) and emits
    // (key, nextState) up to onSetEntityState. `soloActive` dims the masked-out
    // rows; `hasVisibilityOverride` drives the global Reset's disabled.
    visibility = { hidden: [], solo: [] },
    soloActive = false,
    hasVisibilityOverride = false,
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
    // Time-scrub (opt-in, #234): the scene's temporal bounds ({min,max} epoch-ms
    // or null = non-temporal scene ⇒ the control hides), the current cursor
    // (epoch-ms or null = OFF), and the cursor setter.
    timeRange = null,
    timeCursor = null,
    onSetTimeCursor,
    // B2 (per-item) group-by callbacks.
    onToggleGroupOntology,
    onToggleGroupCommunity,
    onToggleGroupType,
    // 4-STATE control (D6): the per-row visibility setter + global reset.
    onSetEntityState,
    onResetVisibility,
    onBulkLevel,
    onBulkCommunities,
    onClearOntologyGrouping,
    onClearCommunityGrouping,
  } = $props();

  // 4-STATE control (D6): the displayed state for a namespaced key. Solo overlay
  // wins visually (§4), then stored Hidden, then Grouped, else Normal — mirrors
  // viewerState.displayedEntityState over the same key vocabulary.
  const soloKeySet = $derived(new Set(visibility?.solo ?? []));
  const hiddenKeySet = $derived(new Set(visibility?.hidden ?? []));
  const groupedKeySet = $derived(new Set(groupBy.grouped ?? []));
  function entityStateOf(key) {
    if (soloKeySet.has(key)) return "solo";
    if (hiddenKeySet.has(key)) return "hidden";
    if (groupedKeySet.has(key)) return "grouped";
    return "normal";
  }

  // Storage LOT 2: prefer the store's precomputed counts when present; otherwise
  // `groupCounts` falls back to the in-memory pass (default studio unchanged).
  const typeList = $derived(groupCounts(graph, nodeType, serverTypeCounts));
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
    <!-- 4-STATE control (D6): the GLOBAL "Reset visibility" affordance — clears
         every Grouped + Hidden + Solo override back to Normal in one click. It is
         global (not inside a section) because it also clears cross-section Solo. -->
    <div class="rail-visibility-reset">
      <Button
        size="sm"
        variant="secondary"
        disabled={!hasVisibilityOverride}
        aria-label="Reset all entity visibility"
        onclick={() => onResetVisibility?.()}
      >
        Reset visibility
      </Button>
    </div>
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
          {@const dAbs = ontologyAbsorbed.get(domain.id)}
          <li class="rail-onto-head">
            <EntityStateControl
              key={groupKeyForOntology(domain.id)}
              label={domain.label}
              state={entityStateOf(groupKeyForOntology(domain.id))}
              disabled={dAbs?.absorbed === true}
              absorbedBy={dAbs?.absorbed ? dAbs.byLabel : null}
              dim={soloActive}
              onSetState={onSetEntityState}
            />
            <Collapsible title={domain.label} open={false} size="sm">
              {#snippet trailing()}
                <Badge shape="circle" size="sm" tone="neutral">{domain.count}</Badge>
              {/snippet}
              <ul class="rail-type-groups">
                {#each domain.subs as sub (sub.id)}
                  {@const sAbs = ontologyAbsorbed.get(sub.id)}
                  <li class="rail-onto-head">
                    <EntityStateControl
                      key={groupKeyForOntology(sub.id)}
                      label={sub.label}
                      state={entityStateOf(groupKeyForOntology(sub.id))}
                      disabled={sAbs?.absorbed === true}
                      absorbedBy={sAbs?.absorbed ? sAbs.byLabel : null}
                      dim={soloActive}
                      onSetState={onSetEntityState}
                    />
                    <Collapsible title={sub.label} open={false} size="sm">
                      {#snippet trailing()}
                        <Badge shape="circle" size="sm" tone="neutral">{sub.count}</Badge>
                      {/snippet}
                      <ul class="rail-list">
                        {#each sub.types as t (t.key)}
                          <li class="rail-type-row">
                            <!-- 4-STATE control (D6): the leaf TYPE row carries its
                                 OWN per-entity visibility control on the LEFT —
                                 Normal/Grouped/Hidden/Solo over this `type`. It is
                                 SEPARATE from the Type FILTER SelectableRow
                                 (onToggleType) that follows it. Disabled (absorbed)
                                 when a parent Sub-domain/Domain is grouped. -->
                            <span class="esc-slot rail-type-group-check">
                              <EntityStateControl
                                key={groupKeyForType(t.key)}
                                label={t.key}
                                state={entityStateOf(groupKeyForType(t.key))}
                                disabled={ontologyCheckedSet.has(sub.id) ||
                                  ontologyCheckedSet.has(domain.id)}
                                absorbedBy={ontologyCheckedSet.has(sub.id)
                                  ? sub.label
                                  : ontologyCheckedSet.has(domain.id)
                                    ? domain.label
                                    : null}
                                dim={soloActive}
                                onSetState={onSetEntityState}
                              />
                            </span>
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
      <ul class="rail-list rail-comm-list">
        {#each communityInfo.live as c (c.key)}
          <li>
            <SelectableRow
              value={c.key}
              selected={commSet.has(c.key)}
              onselect={() => onToggleCommunity?.(c.key)}
            >
              {#snippet leading()}
                <!-- 4-STATE control (D6): the per-entity visibility control is the
                     FIRST thing on the row (left edge), before the color swatch.
                     Normal/Grouped/Hidden/Solo over this community; the row's own
                     SELECT (onToggleCommunity, filter) stays a separate concern. -->
                <span class="rail-comm-lead">
                  <span class="esc-slot">
                    <EntityStateControl
                      key={groupKeyForCommunity(c.key)}
                      label={c.key}
                      state={entityStateOf(groupKeyForCommunity(c.key))}
                      dim={soloActive}
                      onSetState={onSetEntityState}
                    />
                  </span>
                  <!-- ia-aero BUG B (#195): single-source community color (c.color),
                       reused identically legend↔canvas — replaces the old c.tone. -->
                  <span
                    class="rail-swatch"
                    style="background: {c.color}"
                    aria-hidden="true"
                  ></span>
                </span>
              {/snippet}
              <!-- B2-UI-4: a long community label (e.g. "The Absence of Mr Glass")
                   is ellipsised by the row content; the titled span carries the
                   FULL text on hover so nothing is lost. -->
              <span class="rail-comm-label" title={c.key}>{c.key}</span>
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

    <!-- Time-scrub (opt-in): hidden unless the scene carries temporal `t` (#234).
         Moving the cursor filters the graph to elements with t ≤ cursor via the
         existing scene → render path (graphAdapter.applyTimeFilter). -->
    <TimeScrub range={timeRange} cursor={timeCursor} onSetCursor={onSetTimeCursor} />

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
    /* B2-UI-9: clip horizontal overflow — never a horizontal scrollbar. With only
       overflow-y:auto set, CSS promotes overflow-x:visible to `auto`, so a long
       row (community label / bulk-button strip) pushed the rail into horizontal
       scroll. Pin it hidden: labels ellipsize, the bulk buttons wrap → nothing lost. */
    overflow-x: hidden;
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
  /* B2-UI-3 + B2-UI-4: DS typography alignment. The bare DS SelectableRow has NO
     font-size of its own — it inherits the rail's base 1rem, which renders the
     leaf Type / Community labels LARGER than the Domain/Sub-domain Collapsible
     triggers (those use the `--sm` accordion token = 0.875rem / weight 500). We
     normalise EVERY rail row to the SAME tokens the AppHeader's horizontal nav
     menu uses — `.st-appHeader__nav` / `.st-appHeader__navLink`:
       font-size: 0.875rem; font-weight: 500; line-height: 1.
     The whole .rail inherits these so SelectableRow labels, Collapsible bodies and
     leaf rows all match the nav scale; smaller token sizes (badges, kickers,
     notes) keep their explicit sizes below. Pinning the font here ALSO shrinks
     long Community labels enough to stop the overflow-x regression (paired with
     the ellipsis on the row content below). */
  .rail {
    font-size: 0.875rem;
    font-weight: 500;
    line-height: 1;
  }
  /* B2-UI-4: ellipsis long labels (Community / Type / Domain) so they never
     overflow the rail horizontally. The DS SelectableRow __content already
     ellipsizes, but the standalone Community rows render their label as a direct
     text child of __content — re-assert nowrap/ellipsis here so any wrapping
     theme cannot let a long name (e.g. "The Absence of Mr Glass") push the rail
     into horizontal scroll. The full text stays reachable via the row tooltip. */
  .rail :global(.st-selectableRow__content) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  /* Entity rows wrap the label in a titled span (hover tooltip = full id). The
     DS row content already ellipsizes; the span just carries the title. */
  .rail-ent-label {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* B2-UI-4: the Community label mirrors the entity label — block + ellipsis with
     the FULL name in the hover tooltip (title). Stops the long-label overflow-x. */
  .rail-comm-label {
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
  /* B2-UI-1/2/5 — uniform indentation.
     The Domain → Sub-domain → Type tree is built from NESTED DS Collapsibles, each
     wrapping its body in a `.st-collapsible__region` with its own 0.25rem inline
     padding. Left unchecked those paddings stack UNEVENLY (region + checkbox +
     gap), making L1 (Domain) over-indented and the L2→L3 (Sub-domain→Type) step
     visibly larger than L0→L1.
     Fix: neutralise the nested region's HORIZONTAL padding inside the tree and
     drive indentation ourselves with ONE equal step per level (`--rail-indent`).
     L1 (Domain) gets ZERO extra indent so its checkbox aligns with the "Ontology"
     header's left edge (both at the region's 0.25rem origin); every deeper level
     adds exactly `--rail-indent`, so L0→L1, L1→L2 and L2→L3 are identical. */
  .rail-onto-tree {
    --rail-indent: 0.75rem;
    margin-top: 0.15rem;
    /* B2-UI-1: L1 (Domain) ALSO gets one indent step — its checkbox sits a step
       to the RIGHT of the "Ontology" header (not flush), and L0→L1 = L1→L2 =
       L2→L3 are all equal. Aligned with the Community first-level checkbox (UI-5). */
    padding-left: var(--rail-indent);
  }
  /* Kill the nested Collapsible region's inline padding INSIDE the tree (keep the
     bottom padding) so our per-level indent is the only horizontal offset. */
  .rail-onto-tree :global(.st-collapsible__region) {
    padding-left: 0;
    padding-right: 0;
  }
  /* One equal indent step applied to each nested level's list. The Domain list
     (rail-onto-tree itself) gets NONE → Domain checkbox aligns with the Ontology
     header; the Sub-domain list and the Type/leaf list each add one step. */
  .rail-onto-tree .rail-type-groups,
  .rail-onto-tree .rail-list {
    /* B2-UI-8: the Domain step (rail-onto-tree padding, 0.75rem) is kept (user:
       "perfect, don't touch"); the DEEPER steps (Domain→Sub-domain, Sub-domain→
       Type) were too large — reduce them. (UI-10: still ~2× too big → halve to 0.2rem.) */
    padding-left: 0.2rem;
  }
  /* B2 (§2): the leaf Type row puts its bare group-by checkbox FIRST (left),
     then the Type FILTER SelectableRow — two separate concerns on one line. */
  .rail-type-row {
    display: flex;
    align-items: center;
    /* B2-UI-11: checkbox→glyph gap. Measured 17px (too large) — the DS SelectableRow's
       own left padding inflated it. Drop that padding (below) + set the gap so the
       checkbox→glyph distance (~8px) matches the community checkbox→swatch. */
    gap: 0.5rem;
  }
  .rail-type-row :global(.st-selectableRow) {
    flex: 1;
    min-width: 0;
    padding-left: 0;
  }
  .rail-type-group-check {
    flex-shrink: 0;
  }
  /* B2 FIX: the DS Collapsible exposes NO `leading` slot, so the Domain/Sub-domain
     group-by checkbox is rendered as a SIBLING before <Collapsible> (not in a
     dropped leading() snippet). align-start keeps the bare checkbox on the header
     line even when the accordion body is expanded below. */
  .rail-onto-head {
    display: flex;
    align-items: flex-start;
    gap: 0.3rem;
  }
  .rail-onto-head > :global(.st-collapsible) {
    flex: 1 1 auto;
    min-width: 0;
  }
  /* 4-STATE control (D6): the per-entity visibility control (EntityStateControl)
     replaces the old group checkbox at each row's LEFT edge. Its root is `.esc`;
     leaf-type / community rows wrap it in a `.esc-slot` for flex alignment. */
  .esc-slot {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
  }
  .rail-onto-head > :global(.esc) {
    flex-shrink: 0;
    /* match the sm Collapsible header height so the glyph centres on the title. */
    min-height: 1.85rem;
    align-items: center;
  }
  /* Global "Reset visibility" — sits under the search count badges (D6). */
  .rail-visibility-reset {
    margin-top: 0.5rem;
  }
  .rail-visibility-reset :global(.st-button) {
    min-height: 1.6rem;
    min-width: 0;
    padding: 0.15rem 0.45rem;
    font-size: 0.78rem;
    line-height: 1.1;
  }
  /* Community row: the per-entity visibility control sits FIRST, then the swatch. */
  .rail-comm-lead {
    display: inline-flex;
    align-items: center;
    /* B2-UI-11: checkbox→swatch gap. Measured 6px (too small) → match the Type
       checkbox→glyph (~8px) so both use the standard checkbox-to-shape distance. */
    gap: 0.5rem;
    /* B2-UI-7: the DS SelectableRow ignores the list's padding-left, so the
       community checkbox sat at the rail edge (measured 4px) vs the Domain
       checkbox at 16px. Shift the lead by one Domain step so they align. */
    margin-left: 0.75rem;
  }
  /* B2-UI-1+5: align the FIRST-LEVEL Community checkbox with the first-level
     Domain checkbox. The Domain checkbox now sits ONE indent step (0.75rem) to
     the right of the "Ontology" header; the community list takes the SAME left
     indent, and the DS SelectableRow's own inline padding is dropped, so BOTH
     first-level checkboxes share the same distance from the rail's left edge. */
  .rail-comm-list {
    padding-left: 0.75rem;
  }
  .rail-comm-list :global(.st-selectableRow) {
    padding-left: 0;
    padding-right: 0.25rem;
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
  /* B2-UI-6: the DS Button has only sm/md/lg — there is NO `xs`. The bulk buttons
     are already `size="sm"`, but in the dense rail that is still too big, so we
     tighten the `sm` button down to an xs scale: a shorter control height, tighter
     inline/block padding and the nav-aligned font (0.875rem → 0.78rem, matching
     the smaller rail density). Applied to every bulk button — the ontology
     "Group all to" trio, "Ungroup all", and the community Group all / Ungroup
     all — via their shared rail wrappers. */
  .rail-fold-bulk :global(.st-button),
  .rail-fold-ungroup :global(.st-button) {
    min-height: 1.6rem;
    min-width: 0;
    padding: 0.15rem 0.45rem;
    font-size: 0.78rem;
    line-height: 1.1;
  }
  .rail-fold-ungroup {
    margin-top: 0.3rem;
  }
  .rail-comm-bulk {
    margin-top: 0.45rem;
  }
</style>
