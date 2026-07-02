<script>
  /**
   * Answer / Search view (work-stream C, Phase A) — GROUNDED RETRIEVAL surfaced
   * inside the studio, design-system-styled (NOT raw markdown).
   *
   * On a query it runs the offline answer-pack IN THE BROWSER over the bundled
   * search-index.json (the SAME BM25 → RRF → PPR → specificity / structural-
   * demotion pipeline as `graphify answer`), then renders:
   *
   *   - a "Most relevant" hero — the single top-ranked entity with its grounding
   *     quote, HONESTLY labeled as RETRIEVAL (no synthesized prose); and
   *   - the ranked relevant entities as scored cards (score + type + community +
   *     grounding quote), each openable in the graph.
   *
   * HONESTY: without an LLM there is no answer string. The panel says so plainly
   * ("Retrieval, not a written answer") and never fabricates one. The ranked
   * entities + grounding are exactly the evidence an LLM would answer from.
   */
  import { Badge, Button, Search, Collapsible } from "@sentropic/design-system-svelte";
  import { buildAnswerView, formatScore } from "../lib/retrieval.js";
  import { renderInlineMarkdown } from "../lib/markdown.js";

  let {
    /** Parsed search-index.json (graphify_search_index_v1), or null when absent. */
    searchIndex = null,
    /** Open an entity in the graph view (highlight + detail, no reload). */
    onOpenEntity,
    /**
     * ONLINE PROSE SEAM (architect cadrage D2/D3 — deferred, do NOT use offline).
     *
     * The typed mount-point contract for the future online answer. When the
     * chat-lane ships the llm-gateway (WP16) + the `@sentropic/chat-ui` markdown
     * primitive, it passes a Svelte snippet here that renders `view.answer`
     * (the synthesized prose) into the empty `.ans-answer-slot` region below.
     *
     * OFFLINE this is undefined AND `view.answer` is always null, so the slot
     * renders NOTHING — no fabricated prose. Leaving the contract typed + the
     * region present means the online channel mounts here with no change to this
     * file: a clean seam, not a stub.
     *
     * @type {import('svelte').Snippet<[{ answer: string, question: string }]>|undefined}
     */
    renderAnswer = undefined,
  } = $props();

  let query = $state("");
  // The query actually retrieved for (set on submit / Enter) — keeps typing from
  // re-running the O(N) PPR on every keystroke.
  let submitted = $state("");

  const indexNodeCount = $derived(searchIndex?.docs?.length ?? 0);
  const hasIndex = $derived(indexNodeCount > 0);

  // The retrieval view-model. Recomputes only when the SUBMITTED query (or the
  // index) changes — empty until the user runs a query.
  const view = $derived(
    hasIndex && submitted ? buildAnswerView(searchIndex, submitted, { neighborhoodSize: 24 }) : null,
  );

  function run() {
    submitted = query.trim();
  }
  function onKeydown(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      run();
    }
  }
  function communityLabel(view, id) {
    return view?.communities?.find((c) => c.id === id)?.label ?? null;
  }
</script>

<section class="ans" aria-label="Search and answer">
  <header class="ans-head">
    <p class="ans-kicker">Search · grounded retrieval</p>
    <div class="ans-searchbar">
      <div class="ans-search-field">
        <Search
          size="md"
          placeholder="Ask a question — e.g. “who is the murderer?”"
          value={query}
          oninput={(e) => (query = e.currentTarget.value)}
          onkeydown={onKeydown}
          aria-label="Retrieval query"
        />
      </div>
      <Button size="md" variant="primary" onclick={run} disabled={!hasIndex || !query.trim()}>
        Retrieve
      </Button>
    </div>
    <p class="ans-honesty">
      This runs <strong>offline retrieval</strong> over the graph (BM25 + Personalized
      PageRank), in your browser — <em>no LLM, no network</em>. It surfaces the
      ranked relevant entities and the grounding an answer would be written from.
      It is <strong>not</strong> a synthesized written answer.
    </p>
  </header>

  {#if !hasIndex}
    <div class="ans-empty">
      <p class="ans-empty-title">No search index in this bundle</p>
      <p>
        The Answer view needs <code>search-index.json</code>. Re-export the studio
        (<code>graphify studio export</code>) so the offline retrieval substrate is
        bundled, or run inside the live studio server.
      </p>
    </div>
  {:else if !view}
    <div class="ans-empty">
      <p class="ans-empty-title">Ask a question</p>
      <p>
        Retrieval ranks the {indexNodeCount.toLocaleString()} entities in this graph by
        relevance to your query (lift over background centrality), demoting
        structural containers like chapters and works so the specific entities
        surface.
      </p>
    </div>
  {:else if view.refused}
    <div class="ans-empty">
      <p class="ans-empty-title">No lexical match</p>
      <p>
        Nothing in the index matched <strong>“{view.question}”</strong>, so there is
        no seeded neighborhood to rank. Try different or broader terms.
      </p>
    </div>
  {:else if view.entities.length === 0}
    <div class="ans-empty">
      <p class="ans-empty-title">No results</p>
      <p>The query seeded the walk but no neighborhood entities ranked above zero.</p>
    </div>
  {:else}
    <!--
      ONLINE PROSE SEAM (cadrage D2/D3) — the empty answer region.

      Offline `view.answer` is ALWAYS null, so this renders NOTHING (the grounded
      retrieval below is the whole offline surface — no fabricated prose). When
      the chat-lane wires the online channel, `view.answer` becomes a string and
      a `renderAnswer` snippet (a `@sentropic/chat-ui` markdown primitive) mounts
      the prose HERE, above the supporting evidence. Both conditions gate it so
      no half-online state can leak a bare/escaped string.
    -->
    {#if view.answer && renderAnswer}
      <section class="ans-answer-slot" aria-label="Synthesized answer">
        {@render renderAnswer({ answer: view.answer, question: view.question })}
      </section>
    {/if}

    <!-- MOST RELEVANT (hero) — honestly labeled as retrieval, not an answer. -->
    {#if view.top}
      {@const top = view.top}
      <article class="ans-hero">
        <div class="ans-hero-bar">
          <Badge tone="info" size="sm">Most relevant</Badge>
          <span class="ans-hero-note">retrieval, not a written answer</span>
          <span class="ans-hero-score" title="Specificity: lift over background centrality">
            score {formatScore(top.score)}
          </span>
        </div>
        <button
          type="button"
          class="ans-hero-title"
          onclick={() => onOpenEntity?.(top.nodeId)}
          title={top.nodeId}
        >
          {top.label}
        </button>
        <div class="ans-hero-meta">
          {#if top.type}<Badge tone="neutral" size="sm">{top.type}</Badge>{/if}
          {#if top.community >= 0}
            <Badge tone="neutral" size="sm">
              {communityLabel(view, top.community) ?? `Community ${top.community}`}
            </Badge>
          {/if}
        </div>
        {#if top.quote}
          <blockquote class="ans-hero-quote">{top.quote}</blockquote>
        {:else if top.description}
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          <p class="ans-hero-desc">{@html renderInlineMarkdown(top.description)}</p>
        {/if}
      </article>
    {/if}

    <!-- RANKED RELEVANT ENTITIES — scored cards with grounding. -->
    <div class="ans-results-head">
      <span class="ans-results-title">Relevant entities</span>
      <Badge shape="circle" size="sm" tone="neutral">{view.entities.length}</Badge>
    </div>
    <ol class="ans-list">
      {#each view.entities as e (e.nodeId)}
        <li class="ans-card" class:ans-card--top={e.rank === 1}>
          <div class="ans-card-bar">
            <span class="ans-rank" aria-hidden="true">{e.rank}</span>
            <button
              type="button"
              class="ans-card-title"
              onclick={() => onOpenEntity?.(e.nodeId)}
              title={e.nodeId}
            >
              {e.label}
            </button>
            <span class="ans-card-score" title="Specificity: lift over background centrality">
              {formatScore(e.score)}
            </span>
          </div>
          <div class="ans-card-meta">
            {#if e.type}<Badge tone="neutral" size="sm">{e.type}</Badge>{/if}
            {#if e.community >= 0}
              <span class="ans-card-community">
                {communityLabel(view, e.community) ?? `Community ${e.community}`}
              </span>
            {/if}
          </div>
          {#if e.quote}
            <blockquote class="ans-card-quote">{e.quote}</blockquote>
          {:else if e.description}
            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
            <p class="ans-card-desc">{@html renderInlineMarkdown(e.description)}</p>
          {/if}
        </li>
      {/each}
    </ol>

    <!-- The lexical seeds + provenance, folded away (the "how"). -->
    <Collapsible title="Retrieval details" open={false} size="sm">
      <div class="ans-details">
        {#if view.seeds.length > 0}
          <p class="ans-details-label">Lexical seeds (BM25 → RRF)</p>
          <ul class="ans-seeds">
            {#each view.seeds.slice(0, 8) as s (s.nodeId)}
              <li>
                <button type="button" class="ans-seed" onclick={() => onOpenEntity?.(s.nodeId)} title={s.nodeId}>
                  {s.label}
                </button>
                {#if s.bm25 != null}<span class="ans-seed-score">bm25 {formatScore(s.bm25)}</span>{/if}
              </li>
            {/each}
          </ul>
        {/if}
        <p class="ans-details-note">
          Ranking = personalized PageRank seeded by the fused lexical hits, scored
          by specificity (lift over query-agnostic background centrality), with
          structural/document types demoted. Offline, deterministic, no LLM.
        </p>
      </div>
    </Collapsible>
  {/if}
</section>

<style>
  .ans {
    height: 100%;
    min-height: 0;
    overflow-y: auto;
    background: var(--st-semantic-surface-subtle, #f8fafc);
    padding: var(--st-spacing-6, 1.5rem);
    display: flex;
    flex-direction: column;
    gap: var(--st-spacing-4, 1rem);
  }
  .ans-head {
    display: flex;
    flex-direction: column;
    gap: var(--st-spacing-3, 0.75rem);
    max-width: 56rem;
    width: 100%;
    margin: 0 auto;
  }
  .ans-kicker {
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--st-semantic-text-muted, #64748b);
  }
  .ans-searchbar {
    display: flex;
    align-items: stretch;
    gap: var(--st-spacing-2, 0.5rem);
  }
  .ans-search-field {
    flex: 1;
    min-width: 0;
  }
  .ans-honesty {
    margin: 0;
    font-size: 0.82rem;
    line-height: 1.45;
    color: var(--st-semantic-text-secondary, #475569);
  }
  .ans-empty {
    max-width: 56rem;
    width: 100%;
    margin: 0 auto;
    padding: var(--st-spacing-6, 1.5rem);
    border: 1px dashed var(--st-semantic-border-subtle, #e2e8f0);
    border-radius: var(--st-radius-md, 8px);
    background: var(--st-semantic-surface-default, #fff);
    color: var(--st-semantic-text-secondary, #475569);
    font-size: 0.88rem;
    line-height: 1.5;
  }
  .ans-empty-title {
    margin: 0 0 0.4rem;
    font-weight: 700;
    color: var(--st-semantic-text-primary, #0f172a);
  }
  .ans-empty code {
    font-family: var(--st-font-mono, ui-monospace, monospace);
    font-size: 0.82em;
    background: var(--st-semantic-surface-subtle, #f1f5f9);
    padding: 0.05rem 0.3rem;
    border-radius: var(--st-radius-sm, 4px);
  }

  /* Online prose seam (D2/D3) — empty offline; the online channel mounts here. */
  .ans-answer-slot {
    max-width: 56rem;
    width: 100%;
    margin: 0 auto;
  }

  /* Most-relevant hero */
  .ans-hero {
    max-width: 56rem;
    width: 100%;
    margin: 0 auto;
    background: var(--st-semantic-surface-default, #fff);
    border: 1px solid var(--st-semantic-border-subtle, #e2e8f0);
    border-left: 3px solid var(--st-semantic-action-primary, #2563eb);
    border-radius: var(--st-radius-md, 8px);
    padding: var(--st-spacing-4, 1rem);
    display: flex;
    flex-direction: column;
    gap: var(--st-spacing-2, 0.5rem);
  }
  .ans-hero-bar {
    display: flex;
    align-items: center;
    gap: var(--st-spacing-2, 0.5rem);
  }
  .ans-hero-note {
    font-size: 0.72rem;
    font-style: italic;
    color: var(--st-semantic-text-muted, #64748b);
  }
  .ans-hero-score {
    margin-left: auto;
    font-variant-numeric: tabular-nums;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--st-semantic-action-primary, #2563eb);
  }
  .ans-hero-title {
    align-self: flex-start;
    border: none;
    background: transparent;
    padding: 0;
    cursor: pointer;
    text-align: left;
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--st-semantic-text-primary, #0f172a);
  }
  .ans-hero-title:hover {
    color: var(--st-semantic-action-primary, #2563eb);
    text-decoration: underline;
  }
  .ans-hero-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--st-spacing-2, 0.5rem);
  }
  .ans-hero-quote {
    margin: 0;
    padding: 0.4rem 0 0.4rem 0.75rem;
    border-left: 2px solid var(--st-semantic-border-subtle, #e2e8f0);
    color: var(--st-semantic-text-secondary, #475569);
    font-size: 0.9rem;
    line-height: 1.5;
    font-style: italic;
  }
  .ans-hero-desc {
    margin: 0;
    color: var(--st-semantic-text-secondary, #475569);
    font-size: 0.9rem;
    line-height: 1.5;
  }

  /* Ranked results */
  .ans-results-head {
    max-width: 56rem;
    width: 100%;
    margin: var(--st-spacing-2, 0.5rem) auto 0;
    display: flex;
    align-items: center;
    gap: var(--st-spacing-2, 0.5rem);
  }
  .ans-results-title {
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--st-semantic-text-muted, #64748b);
  }
  .ans-list {
    list-style: none;
    margin: 0 auto;
    padding: 0;
    max-width: 56rem;
    width: 100%;
    display: grid;
    gap: var(--st-spacing-2, 0.5rem);
  }
  .ans-card {
    background: var(--st-semantic-surface-default, #fff);
    border: 1px solid var(--st-semantic-border-subtle, #e2e8f0);
    border-radius: var(--st-radius-md, 8px);
    padding: var(--st-spacing-3, 0.75rem);
    display: flex;
    flex-direction: column;
    gap: var(--st-spacing-1, 0.35rem);
  }
  .ans-card--top {
    border-color: var(--st-semantic-action-primary, #2563eb);
  }
  .ans-card-bar {
    display: flex;
    align-items: baseline;
    gap: var(--st-spacing-2, 0.5rem);
  }
  .ans-rank {
    flex-shrink: 0;
    width: 1.5rem;
    text-align: right;
    font-variant-numeric: tabular-nums;
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--st-semantic-text-muted, #94a3b8);
  }
  .ans-card-title {
    flex: 1;
    min-width: 0;
    border: none;
    background: transparent;
    padding: 0;
    cursor: pointer;
    text-align: left;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--st-semantic-text-primary, #0f172a);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ans-card-title:hover {
    color: var(--st-semantic-action-primary, #2563eb);
    text-decoration: underline;
  }
  .ans-card-score {
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--st-semantic-text-secondary, #475569);
  }
  .ans-card-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--st-spacing-2, 0.5rem);
    padding-left: calc(1.5rem + var(--st-spacing-2, 0.5rem));
  }
  .ans-card-community {
    font-size: 0.74rem;
    color: var(--st-semantic-text-muted, #64748b);
  }
  .ans-card-quote {
    margin: 0;
    padding: 0.2rem 0 0.2rem 0.65rem;
    margin-left: calc(1.5rem + var(--st-spacing-2, 0.5rem));
    border-left: 2px solid var(--st-semantic-border-subtle, #e2e8f0);
    color: var(--st-semantic-text-secondary, #475569);
    font-size: 0.84rem;
    line-height: 1.45;
    font-style: italic;
  }
  .ans-card-desc {
    margin: 0 0 0 calc(1.5rem + var(--st-spacing-2, 0.5rem));
    color: var(--st-semantic-text-secondary, #475569);
    font-size: 0.84rem;
    line-height: 1.45;
  }

  /* Retrieval details */
  .ans-details {
    display: flex;
    flex-direction: column;
    gap: var(--st-spacing-2, 0.5rem);
    font-size: 0.82rem;
    color: var(--st-semantic-text-secondary, #475569);
  }
  .ans-details-label {
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 0.68rem;
    font-weight: 700;
    color: var(--st-semantic-text-muted, #64748b);
  }
  .ans-seeds {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .ans-seeds li {
    display: inline-flex;
    align-items: baseline;
    gap: 0.25rem;
    background: var(--st-semantic-surface-subtle, #f1f5f9);
    border-radius: var(--st-radius-sm, 4px);
    padding: 0.15rem 0.45rem;
  }
  .ans-seed {
    border: none;
    background: transparent;
    padding: 0;
    cursor: pointer;
    font-size: 0.78rem;
    color: var(--st-semantic-text-primary, #0f172a);
  }
  .ans-seed:hover {
    color: var(--st-semantic-action-primary, #2563eb);
    text-decoration: underline;
  }
  .ans-seed-score {
    font-variant-numeric: tabular-nums;
    font-size: 0.68rem;
    color: var(--st-semantic-text-muted, #94a3b8);
  }
  .ans-details-note {
    margin: 0;
    font-size: 0.76rem;
    line-height: 1.45;
    color: var(--st-semantic-text-muted, #64748b);
  }
</style>
