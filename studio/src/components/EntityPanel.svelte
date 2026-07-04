<script>
  /**
   * Right column entity panel: wiki description + relations + meta.
   * Mirrors the server `renderEntityPanel` shaping (graphAdapter.relationRowsFor
   * + the description sidecar). Clicking a relation target opens that entity
   * (highlight, NO graph reload) via onOpenEntity.
   */
  import { Badge, Collapsible } from "@sentropic/design-system-svelte";
  import {
    relationRowsFor,
    indexNodes,
    nodeLabel,
    nodeType,
    nodeCommunity,
    nodeSourcePath,
    citationsByFile,
    citationsByFileFrom,
  } from "../lib/graphAdapter.js";
  import { renderInlineMarkdown } from "../lib/markdown.js";

  let {
    graph,
    focusId = null,
    entity = null,
    onOpenEntity,
    hideTitle = false,
    onOpenSource = null,
    // §S.6.1 right-panel sync: the RAW citation currently shown in the
    // cited-source viewer (null when the viewer is closed or focused on
    // another entity). The matching passage is highlighted + scrolled into
    // view, and the Citations accordions open to reveal it.
    focusCitation = null,
  } = $props();

  const node = $derived(focusId ? (indexNodes(graph).get(focusId) ?? null) : null);
  const relations = $derived(focusId ? relationRowsFor(focusId, graph) : []);
  // SVELTE-2 + exhaustive-citations: the inline node.citations (K-bounded set)
  // renders INSTANTLY off the already-loaded graph. When the lazy entity sidecar
  // arrives with the full per-entity list (entity.citations.citations), it
  // REPLACES the inline render with the complete file > passages accordion —
  // same renderer, richer data. Passages render locators (section/page) AND, when
  // present, a verbatim `quote` (WP #24: `quote` is now a first-class field on
  // OntologyCitation, populated by `graphify cite`; the blockquote below renders
  // it). Citations grounded by older pipelines may still be locator-only.
  const fullCitations = $derived(
    Array.isArray(entity?.citations?.citations) ? entity.citations.citations : null,
  );
  const citationFiles = $derived.by(() => {
    if (!node) return [];
    if (fullCitations) return citationsByFileFrom(fullCitations, node.source_file ?? null);
    return citationsByFile(node);
  });
  // Level-1: the Citations header shows the TRUE count (node.citation_count),
  // so a hub reads "Citations (214)" immediately, before the full list loads.
  // Old graphs (no citation_count) fall back to summing the inline citations.
  const citationTotal = $derived.by(() => {
    if (node && typeof node.citation_count === "number") return node.citation_count;
    return citationFiles.reduce((n, f) => n + f.count, 0);
  });
  const description = $derived.by(() => {
    const sidecar = entity?.description;
    if (sidecar && sidecar.status === "generated" && typeof sidecar.description === "string") {
      return sidecar.description.trim();
    }
    return null;
  });
  // Provisional rationale fallback (field report ia-aero): the description text
  // came from the extractor's `rationale`, not a real `describe` pass. Mark it so
  // the panel never silently presents a fallback as a curated description.
  const descriptionProvisional = $derived(
    entity?.description?.source === "rationale" && entity?.description?.provisional === true,
  );
  // Cited-source viewer affordance: the FLAT citation list the rendered groups
  // were derived from (full sidecar list when hydrated, else the inline K-set).
  // Passage `index` positions refer to THIS list; the App converts it via the
  // frozen CitedSourceRef projection and opens the viewer on the clicked one.
  const sourceCitations = $derived(fullCitations ?? (Array.isArray(node?.citations) ? node.citations : []));
  function openSource(passage) {
    onOpenSource?.({
      citations: sourceCitations,
      index: passage.index,
      fallbackSourceFile: node?.source_file ?? null,
      label: node ? nodeLabel(node) : null,
      // §S.6.1: the clicked entity's id lets the App aim the SELECTION thread
      // at the right group (and keep/switch to the Sélection scope).
      entityId: node?.id ?? focusId ?? null,
    });
  }

  // §S.6.1 viewer→panel sync: resolve the focused citation to its position in
  // THIS panel's flat citation list. Object identity first (the thread is
  // built from the same arrays), loose field identity as a fallback (list
  // swapped by the lazy sidecar upgrade). -1 = no highlight.
  const focusCitationIndex = $derived.by(() => {
    if (!focusCitation) return -1;
    const byRef = sourceCitations.indexOf(focusCitation);
    if (byRef >= 0) return byRef;
    return sourceCitations.findIndex((c) => citationLooksSame(c, focusCitation));
  });
  function citationLooksSame(a, b) {
    if (!a || !b) return false;
    const norm = (v) => (v == null ? null : String(v));
    return (
      norm(a.source_file) === norm(b.source_file) &&
      norm(a.page) === norm(b.page) &&
      norm(a.section) === norm(b.section) &&
      norm(a.quote ?? a.excerpt) === norm(b.quote ?? b.excerpt)
    );
  }
  // Scroll the highlighted passage into view as the viewer navigates. rAF so
  // the accordions (opened by the prop resync below) have rendered; guarded
  // for jsdom (no scrollIntoView there).
  let panelEl = $state(null);
  $effect(() => {
    if (focusCitationIndex < 0 || !panelEl) return;
    const raf =
      typeof requestAnimationFrame === "function" ? requestAnimationFrame : (fn) => setTimeout(fn, 0);
    raf(() => {
      const el = panelEl?.querySelector("[data-cite-current='true']");
      if (el && typeof el.scrollIntoView === "function") {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    });
  });
</script>

<aside class="entity" aria-label="Entity detail" bind:this={panelEl}>
  {#if !node}
    <div class="entity-empty">
      <p class="entity-empty-kicker">Entity</p>
      <p>Select a node in the graph or a result in the rail to inspect it here.</p>
    </div>
  {:else}
    <header class="entity-head">
      <p class="entity-kicker">{nodeType(node) ?? "Entity"}</p>
      {#if !hideTitle}
        <h2 class="entity-title">{nodeLabel(node)}</h2>
        <p class="entity-id">{node.id}</p>
      {/if}
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
        <h3 class="entity-section-heading">
          Description
          {#if descriptionProvisional}
            <span class="entity-description-provisional" title="From the extractor rationale — run `graphify describe` for a proper description.">provisional</span>
          {/if}
        </h3>
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        <div class="entity-description">{@html renderInlineMarkdown(description)}</div>
      </section>
    {:else if entity}
      <section class="entity-section">
        <h3 class="entity-section-heading">Description</h3>
        <p class="entity-empty-inline">No generated description for this entity.</p>
      </section>
    {/if}

    <!-- SVELTE-1: relations in an accordion, collapsed by default (like citations). -->
    <div class="entity-acc">
      <Collapsible title="Relations" open={false}>
        {#snippet trailing()}
          <Badge shape="circle" size="sm" tone="neutral">{relations.length}</Badge>
        {/snippet}
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
      </Collapsible>
    </div>

    <!-- SVELTE-2: citations as a double accordion (file > passages). §S.6.1:
         a viewer-focused citation OPENS the accordion path down to itself. -->
    <div class="entity-acc">
      <Collapsible title="Citations" open={focusCitationIndex >= 0}>
        {#snippet trailing()}
          <Badge shape="circle" size="sm" tone="neutral">{citationTotal}</Badge>
        {/snippet}
        {#if citationFiles.length === 0}
          <p class="entity-empty-inline">No citations recorded.</p>
        {:else}
          <ul class="entity-cite-files">
            {#each citationFiles as cf (cf.file)}
              <li>
                <Collapsible
                  title={cf.file}
                  open={cf.passages.some((p) => p.index === focusCitationIndex)}
                  size="sm"
                >
                  {#snippet trailing()}
                    <Badge shape="circle" size="sm" tone="neutral">{cf.count}</Badge>
                  {/snippet}
                  <ul class="entity-cite-passages">
                    {#each cf.passages as p, i (cf.file + i)}
                      <li
                        class="entity-cite-passage"
                        class:entity-cite-passage--current={p.index === focusCitationIndex}
                        data-cite-current={p.index === focusCitationIndex ? "true" : undefined}
                      >
                        <div class="entity-cite-loc">
                          {#if p.section}<span class="entity-cite-section">{p.section}</span>{/if}
                          {#if p.page != null}<span class="entity-cite-page">p.{p.page}</span>{/if}
                          {#if !p.section && p.page == null && !p.quote}<span class="entity-cite-section">(passage)</span>{/if}
                        </div>
                        {#if p.quote}<blockquote class="entity-cite-quote">{p.quote}</blockquote>{/if}
                        {#if onOpenSource}
                          <!-- Qualified UX (immo "Voir la preuve · p.N"): FULL-WIDTH
                               button UNDER the quote — never truncates against the
                               panel edge, one per citation. -->
                          <button
                            class="entity-cite-src"
                            type="button"
                            title="Ouvrir la source citée avec ce passage surligné"
                            aria-label="Voir la source de cette citation"
                            onclick={() => openSource(p)}
                          >
                            <svg class="entity-cite-src-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
                            <span>Voir la source{#if p.page != null}&nbsp;· p.{p.page}{/if}</span>
                          </button>
                        {/if}
                      </li>
                    {/each}
                  </ul>
                </Collapsible>
              </li>
            {/each}
          </ul>
        {/if}
      </Collapsible>
    </div>
  {/if}
</aside>

<style>
  .entity {
    background: var(--st-semantic-surface-default, #fff);
    overflow-y: auto;
    min-height: 0;
    /* BUG A: the detail panel is nested inside the right rail's scroll
       container (.sel). min-width:0 lets it shrink to the column width so a
       long unbreakable token (Source path / description / quote) wraps inside
       it; overflow-x:hidden guarantees the detail itself never produces a
       horizontal scrollbar — content wraps, it does not scroll sideways. */
    min-width: 0;
    overflow-x: hidden;
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
    /* BUG A: the value track is `minmax(0, 1fr)` (not `1fr`) so it can shrink
       below the intrinsic width of a long unbreakable token (e.g. a Source
       path/locator). A bare `1fr` track has an implicit min-width of `auto`,
       so a long path widens the grid past the panel and triggers a global
       horizontal scrollbar. Combined with overflow-wrap:anywhere on the dd
       (below), the path now wraps instead of clipping right. */
    grid-template-columns: 6.5rem minmax(0, 1fr);
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
    /* BUG A: min-width:0 lets this grid cell shrink under a long token; pair it
       with overflow-wrap:anywhere + word-break so a long unbreakable Source
       path (e.g. `.graphify/converted/pdf/…_1eaf490f229c.md:Section 1.2.3 — Et
       demain?`) breaks and wraps inside the panel instead of clipping right. */
    min-width: 0;
    overflow-wrap: anywhere;
    word-break: break-word;
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
  .entity-description {
    line-height: 1.5;
    color: var(--st-semantic-text-primary, #0f172a);
    font-size: 0.9rem;
    /* BUG A: a description can carry a long unbreakable token (URL / path /
       identifier). min-width:0 + overflow-wrap:anywhere break it so the text
       wraps inside the panel instead of widening it into a horizontal scroll. */
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .entity-description-provisional {
    margin-left: 0.4rem;
    padding: 0.05rem 0.35rem;
    border-radius: var(--st-radius-sm, 4px);
    background: var(--st-semantic-surface-subtle, #f1f5f9);
    border: 1px solid var(--st-semantic-border-subtle, #e2e8f0);
    color: var(--st-semantic-text-secondary, #64748b);
    font-size: 0.62rem;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    cursor: help;
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
  /* SVELTE-1/2: accordions inside the entity panel sit flush. */
  .entity-acc {
    margin-top: 1rem;
    border-top: 1px solid var(--st-semantic-border-subtle, #e2e8f0);
  }
  .entity-cite-files,
  .entity-cite-passages {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.2rem;
  }
  .entity-cite-passage {
    padding: 0.25rem 0;
    border-bottom: 1px dotted var(--st-semantic-border-subtle, #e2e8f0);
  }
  /* §S.6.1 viewer→panel sync: the citation currently OPEN in the cited-source
     viewer. DS-token highlight (selected surface + primary accent bar). */
  .entity-cite-passage--current {
    background: var(--st-semantic-surface-selected, #eff6ff);
    border-left: 3px solid var(--st-semantic-action-primary, #2563eb);
    border-radius: 0 var(--st-radius-sm, 4px) var(--st-radius-sm, 4px) 0;
    padding-left: 0.45rem;
    padding-right: 0.3rem;
  }
  .entity-cite-section {
    display: block;
    font-size: 0.74rem;
    font-weight: 600;
    color: var(--st-semantic-text-secondary, #475569);
    /* BUG A: the passage locator (e.g. "Section 1.2.3 — Et demain?") wraps
       inside the panel rather than clipping right. */
    min-width: 0;
    overflow-wrap: anywhere;
  }
  /* Cited-source viewer affordance: locator row + full-width source button. */
  .entity-cite-loc {
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    column-gap: 0.4rem;
    align-items: baseline;
  }
  .entity-cite-page {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--st-semantic-text-muted, #64748b);
    white-space: nowrap;
  }
  /* Qualified UX (immo parity): FULL-WIDTH "Voir la source · p.N" under the
     quote — wraps inside the panel, can never clip against the right edge. */
  .entity-cite-src {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    width: 100%;
    margin-top: 0.3rem;
    border: 1px solid var(--st-semantic-border-subtle, #e2e8f0);
    background: var(--st-semantic-surface-subtle, #f8fafc);
    border-radius: var(--st-radius-sm, 4px);
    color: var(--st-semantic-text-link, #2563eb);
    cursor: pointer;
    font-size: 0.74rem;
    font-weight: 600;
    line-height: 1.2;
    padding: 0.3rem 0.5rem;
    min-width: 0;
  }
  .entity-cite-src:hover {
    border-color: var(--st-semantic-action-primary, #2563eb);
    background: var(--st-semantic-surface-selected, #eff6ff);
  }
  .entity-cite-src-ico {
    width: 0.85rem;
    height: 0.85rem;
    flex-shrink: 0;
  }
  /* BUG A: the citation FILE path renders as a DS Collapsible trigger title
     (e.g. ".graphify/converted/pdf/CONTRIBUATION_AI_AERONAUTIQUE_…md"). Its
     long unbreakable token must wrap, otherwise it widens the nested accordion
     and the whole right rail into a horizontal scroll. Scope the wrap to the
     citation-file triggers only so other (short) titles are unaffected. */
  .entity-cite-files :global(.st-collapsible__trigger) {
    min-width: 0;
    overflow-wrap: anywhere;
    word-break: break-word;
    white-space: normal;
    text-align: left;
  }
  .entity-cite-quote {
    margin: 0.2rem 0 0;
    padding: 0.2rem 0.5rem;
    border-left: 2px solid var(--st-semantic-border-strong, #94a3b8);
    color: var(--st-semantic-text-primary, #0f172a);
    font-size: 0.8rem;
    font-style: italic;
    line-height: 1.4;
    /* BUG A: a citation quote can contain a long unbreakable token; wrap it so
       the blockquote never widens the panel into a horizontal scroll. */
    min-width: 0;
    overflow-wrap: anywhere;
  }
</style>
