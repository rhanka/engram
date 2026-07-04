<script>
  /**
   * Cited-source viewer — INTERIM app-local build of the future
   * `@sentropic/cited-source-viewer` (architect-ratified §S.5, 2026-07-04).
   *
   * PURITY CONTRACT (for the mechanical rebase into the sentropic monorepo):
   * this component imports NOTHING from graphify — only its sibling pure lib
   * (`../lib/cited-source/*`) and Svelte. All graphify-specific glue (reading
   * node.citations, converting via citationToCitedSourceRef, fetching bytes)
   * lives OUTSIDE, in the studio wiring (App.svelte + lib/citedSources.js).
   *
   * Props (the frozen seam, SPEC_WP_CITED_SOURCE_VIZ §S.1/§S.3):
   *   refs          CitedSourceRef[] (shape only — no type import needed in JS):
   *                 { rawRef?, sourceUrl?, docSha?, modality?, page?, section?,
   *                   paragraph_id?, bbox?, excerpt?, citation? }
   *   resolveSource async (ref) => { kind: "pdf", data: ArrayBuffer }
   *                              | { kind: "markdown", text: string }
   *                 The component NEVER reads bytes itself (§S.3).
   *   activeIndex   Initially-active ref index (optional).
   *   title         Header title (e.g. the source file the user clicked).
   *   onClose       Close callback (optional; hides the ✕ when absent).
   *
   * v1 scope: MD (incl. OCR-markdown / plain text) + PDF text-layer only.
   * PDF: render page + highlight the matched quote in the text layer; page
   * navigation; "quote not found on this page" shows the page anyway.
   * Markdown: full render, scroll-to + <mark> the quote.
   */
  import { tick } from "svelte";
  import { computeHighlightRects, loadPdfDocument, renderPdfPage } from "../lib/cited-source/pdfEngine.js";
  import { renderSourceHtml } from "../lib/cited-source/markdownSource.js";

  let {
    refs = [],
    resolveSource,
    activeIndex = 0,
    title = "Cited source",
    onClose = null,
  } = $props();

  // Active ref index — internal state seeded from the prop (prev/next moves it).
  let index = $state(0);
  let lastActiveProp = -1;

  // Load pipeline state.
  let loading = $state(false);
  let loadError = $state(null);
  /** @type {{kind:string, text?:string}|null} resolved non-pdf payload */
  let mdPayload = $state(null);
  let mdHtml = $state("");
  let mdFound = $state(false);

  // PDF state.
  let pdfDoc = $state(null);
  let numPages = $state(0);
  let currentPage = $state(1);
  let highlightRects = $state([]);
  let quoteOnPage = $state(true);
  let canvasEl = $state(null);
  let scrollEl = $state(null);
  let mdEl = $state(null);

  // Token guards: a newer load/render invalidates in-flight older ones.
  let loadToken = 0;
  let renderToken = 0;

  const ref = $derived(refs[index] ?? null);
  const refCount = $derived(refs.length);
  const quoteOf = (r) => r?.excerpt ?? r?.citation ?? null;

  /** Human locator label for the header ("p.3", "§ Chapter 2", …). */
  function locatorLabel(r) {
    if (!r) return "";
    const parts = [];
    if (r.page != null) parts.push(`p.${r.page}`);
    if (r.section) parts.push(r.section);
    else if (r.paragraph_id) parts.push(`¶${r.paragraph_id}`);
    return parts.join(" · ");
  }
  function sourceLabel(r) {
    return r?.rawRef ?? r?.sourceUrl ?? r?.docSha ?? "(no locator)";
  }

  // React to the activeIndex prop (a new click while open re-targets the viewer).
  $effect(() => {
    if (activeIndex !== lastActiveProp) {
      lastActiveProp = activeIndex;
      const clamped = Math.max(0, Math.min(refs.length - 1, activeIndex ?? 0));
      index = refs.length > 0 ? clamped : 0;
    }
  });

  // (Re)load whenever the active ref changes.
  $effect(() => {
    if (ref && typeof resolveSource === "function") void load(ref);
  });

  async function load(target) {
    const token = ++loadToken;
    renderToken++;
    loading = true;
    loadError = null;
    mdPayload = null;
    mdHtml = "";
    mdFound = false;
    pdfDoc = null;
    numPages = 0;
    highlightRects = [];
    quoteOnPage = true;
    try {
      const payload = await resolveSource(target);
      if (token !== loadToken) return;
      if (payload && payload.kind === "pdf") {
        const doc = await loadPdfDocument(payload.data);
        if (token !== loadToken) return;
        pdfDoc = doc;
        numPages = doc.numPages;
        const wanted = Number(target.page);
        const initial = Number.isFinite(wanted) && wanted >= 1 && wanted <= doc.numPages ? wanted : 1;
        loading = false;
        await renderPage(initial);
      } else if (payload && (payload.kind === "markdown" || payload.kind === "text")) {
        const rendered = renderSourceHtml(payload.text ?? "", quoteOf(target));
        mdPayload = payload;
        mdHtml = rendered.html;
        mdFound = rendered.found;
        loading = false;
        await tick();
        scrollToMark();
      } else {
        throw new Error("unsupported source payload (expected kind \"pdf\" or \"markdown\")");
      }
    } catch (err) {
      if (token !== loadToken) return;
      loading = false;
      loadError = err instanceof Error ? err.message : String(err);
    }
  }

  async function renderPage(pageNumber) {
    if (!pdfDoc) return;
    const token = ++renderToken;
    const clamped = Math.min(Math.max(pageNumber, 1), numPages || 1);
    currentPage = clamped;
    const pdfPage = await pdfDoc.getPage(clamped);
    if (token !== renderToken) return;
    await tick();
    if (!canvasEl) return;
    const containerWidth = scrollEl ? Math.max(120, scrollEl.clientWidth - 32) : 720;
    const { viewport, scale } = await renderPdfPage(pdfPage, canvasEl, { containerWidth });
    if (token !== renderToken) return;

    // Highlight only on the ref's own page (radar bug #83 guard: a generic
    // fallback window would otherwise re-highlight on EVERY page).
    const quote = quoteOf(ref);
    const refPage = Number(ref?.page);
    const onRefPage = !Number.isFinite(refPage) || refPage === clamped;
    if (quote && onRefPage) {
      const content = await pdfPage.getTextContent();
      if (token !== renderToken) return;
      const { rects } = computeHighlightRects(content, viewport, scale, quote);
      highlightRects = rects;
      quoteOnPage = rects.length > 0;
      if (rects.length > 0) queueScrollToHighlight(rects[0]);
    } else {
      highlightRects = [];
      // Off the ref page: nothing is expected to highlight — not a degradation.
      quoteOnPage = !quote || !onRefPage ? true : false;
    }
  }

  /** rAF with a setTimeout fallback (jsdom test environments may lack rAF). */
  function raf(fn) {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(fn);
    else setTimeout(fn, 0);
  }

  function queueScrollToHighlight(rect) {
    raf(() => {
      if (!scrollEl || typeof scrollEl.scrollTo !== "function") return;
      const top = rect.top - scrollEl.clientHeight / 3;
      scrollEl.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    });
  }

  function scrollToMark() {
    raf(() => {
      const mark = mdEl?.querySelector("[data-csv-mark]");
      if (mark && typeof mark.scrollIntoView === "function") {
        mark.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    });
  }

  function goPrevPage() {
    if (currentPage > 1) void renderPage(currentPage - 1);
  }
  function goNextPage() {
    if (currentPage < numPages) void renderPage(currentPage + 1);
  }
  function goRef(i) {
    if (i < 0 || i >= refCount || i === index) return;
    index = i;
  }
  function handleKeydown(event) {
    if (event.key === "Escape" && onClose) onClose();
    else if (event.key === "ArrowLeft" && pdfDoc) goPrevPage();
    else if (event.key === "ArrowRight" && pdfDoc) goNextPage();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<section class="csv" aria-label="Cited source viewer">
  <header class="csv-head">
    <div class="csv-head-text">
      <p class="csv-kicker">Cited source</p>
      <h2 class="csv-title" title={sourceLabel(ref)}>{title}</h2>
      {#if ref}
        <p class="csv-locator">
          <span class="csv-locator-file">{sourceLabel(ref)}</span>
          {#if locatorLabel(ref)}<span class="csv-locator-pos">{locatorLabel(ref)}</span>{/if}
        </p>
      {/if}
    </div>
    {#if onClose}
      <button class="csv-close" type="button" onclick={() => onClose()} aria-label="Close source viewer">✕</button>
    {/if}
  </header>

  {#if refCount > 1}
    <nav class="csv-refs" aria-label="Citations in this source set">
      <button
        class="csv-refnav"
        type="button"
        disabled={index <= 0}
        onclick={() => goRef(index - 1)}
        aria-label="Previous citation"
      >←</button>
      <span class="csv-refcount">Citation {index + 1}/{refCount}</span>
      <button
        class="csv-refnav"
        type="button"
        disabled={index >= refCount - 1}
        onclick={() => goRef(index + 1)}
        aria-label="Next citation"
      >→</button>
    </nav>
  {/if}

  {#if quoteOf(ref)}
    <blockquote class="csv-quote">{quoteOf(ref)}</blockquote>
  {/if}

  <div class="csv-body" bind:this={scrollEl}>
    {#if loading}
      <p class="csv-status" role="status">Loading source…</p>
    {:else if loadError}
      <div class="csv-error" role="alert">
        <p class="csv-error-title">Source unavailable</p>
        <p class="csv-error-detail">{loadError}</p>
        <code class="csv-error-ref">{sourceLabel(ref)}</code>
      </div>
    {:else if pdfDoc}
      <div class="csv-page-stage">
        <canvas bind:this={canvasEl}></canvas>
        <div class="csv-hl-layer" aria-hidden="true">
          {#each highlightRects as r, i (i)}
            <div
              class="csv-hl"
              style="left:{r.left}px; top:{r.top}px; width:{r.width}px; height:{r.height}px;"
            ></div>
          {/each}
        </div>
      </div>
    {:else if mdPayload}
      <!-- Safe: renderSourceHtml escapes everything before re-enabling minimal markup. -->
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      <div class="csv-md" bind:this={mdEl}>{@html mdHtml}</div>
    {:else}
      <p class="csv-status">No citation selected.</p>
    {/if}
  </div>

  <footer class="csv-foot">
    {#if pdfDoc}
      <div class="csv-pager" role="group" aria-label="Page navigation">
        <button class="csv-refnav" type="button" onclick={goPrevPage} disabled={currentPage <= 1} aria-label="Previous page">←</button>
        <span class="csv-page-ind">Page {currentPage}/{numPages}</span>
        <button class="csv-refnav" type="button" onclick={goNextPage} disabled={currentPage >= numPages} aria-label="Next page">→</button>
      </div>
      {#if !quoteOnPage}
        <span class="csv-degraded">Quote not located on this page — showing the page anyway.</span>
      {/if}
    {:else if mdPayload && quoteOf(ref) && !mdFound}
      <span class="csv-degraded">Quote not located in the source — showing the document anyway.</span>
    {/if}
  </footer>
</section>

<style>
  .csv {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
    background: var(--st-semantic-surface-default, #fff);
    color: var(--st-semantic-text-primary, #0f172a);
  }
  .csv-head {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
    padding: 0.8rem 1rem 0.6rem;
    border-bottom: 1px solid var(--st-semantic-border-subtle, #e2e8f0);
  }
  .csv-head-text {
    flex: 1;
    min-width: 0;
  }
  .csv-kicker {
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--st-semantic-text-muted, #64748b);
  }
  .csv-title {
    margin: 0.15rem 0 0.1rem;
    font-size: 1rem;
    line-height: 1.3;
    overflow-wrap: anywhere;
  }
  .csv-locator {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    font-size: 0.72rem;
    color: var(--st-semantic-text-muted, #64748b);
  }
  .csv-locator-file {
    font-family: var(--st-font-mono, ui-monospace, monospace);
    overflow-wrap: anywhere;
  }
  .csv-locator-pos {
    font-weight: 600;
    color: var(--st-semantic-text-secondary, #475569);
    white-space: nowrap;
  }
  .csv-close {
    flex-shrink: 0;
    border: 1px solid var(--st-semantic-border-subtle, #e2e8f0);
    background: var(--st-semantic-surface-subtle, #f8fafc);
    border-radius: var(--st-radius-sm, 4px);
    color: var(--st-semantic-text-secondary, #475569);
    cursor: pointer;
    font-size: 0.85rem;
    line-height: 1;
    padding: 0.3rem 0.45rem;
  }
  .csv-close:hover {
    color: var(--st-semantic-feedback-error, #dc2626);
    border-color: var(--st-semantic-feedback-error, #dc2626);
  }
  .csv-refs {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 1rem;
    border-bottom: 1px solid var(--st-semantic-border-subtle, #e2e8f0);
    background: var(--st-semantic-surface-subtle, #f8fafc);
  }
  .csv-refcount {
    font-size: 0.74rem;
    font-weight: 600;
    color: var(--st-semantic-text-secondary, #475569);
  }
  .csv-refnav {
    border: 1px solid var(--st-semantic-border-subtle, #e2e8f0);
    background: var(--st-semantic-surface-default, #fff);
    border-radius: var(--st-radius-sm, 4px);
    color: var(--st-semantic-text-secondary, #475569);
    cursor: pointer;
    font-size: 0.8rem;
    line-height: 1;
    padding: 0.25rem 0.5rem;
  }
  .csv-refnav:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .csv-refnav:not(:disabled):hover {
    border-color: var(--st-semantic-action-primary, #2563eb);
    color: var(--st-semantic-action-primary, #2563eb);
  }
  .csv-quote {
    margin: 0.55rem 1rem 0.2rem;
    padding: 0.3rem 0.6rem;
    border-left: 3px solid var(--st-semantic-action-primary, #2563eb);
    background: var(--st-semantic-surface-subtle, #f8fafc);
    border-radius: 0 var(--st-radius-sm, 4px) var(--st-radius-sm, 4px) 0;
    font-size: 0.8rem;
    font-style: italic;
    line-height: 1.4;
    color: var(--st-semantic-text-primary, #0f172a);
    max-height: 5.6rem;
    overflow-y: auto;
    overflow-wrap: anywhere;
  }
  .csv-body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 0.75rem 1rem;
    background: var(--st-semantic-surface-sunken, #f1f5f9);
  }
  .csv-status {
    margin: 2rem 0;
    text-align: center;
    color: var(--st-semantic-text-muted, #64748b);
  }
  .csv-error {
    margin: 1.5rem auto;
    max-width: 28rem;
    text-align: center;
    display: grid;
    gap: 0.35rem;
  }
  .csv-error-title {
    margin: 0;
    font-weight: 700;
    color: var(--st-semantic-feedback-error, #dc2626);
  }
  .csv-error-detail {
    margin: 0;
    font-size: 0.82rem;
    color: var(--st-semantic-text-secondary, #475569);
    overflow-wrap: anywhere;
  }
  .csv-error-ref {
    font-family: var(--st-font-mono, ui-monospace, monospace);
    font-size: 0.72rem;
    color: var(--st-semantic-text-muted, #64748b);
    overflow-wrap: anywhere;
  }
  .csv-page-stage {
    position: relative;
    width: max-content;
    margin: 0 auto;
    box-shadow: 0 1px 6px rgba(15, 23, 42, 0.18);
  }
  .csv-page-stage canvas {
    display: block;
    background: #fff;
  }
  .csv-hl-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .csv-hl {
    position: absolute;
    background: color-mix(in srgb, var(--st-semantic-feedback-warning, #eab308) 40%, transparent);
    outline: 1px solid color-mix(in srgb, var(--st-semantic-feedback-warning, #eab308) 85%, transparent);
    border-radius: 2px;
  }
  .csv-md {
    max-width: 46rem;
    margin: 0 auto;
    background: var(--st-semantic-surface-default, #fff);
    border: 1px solid var(--st-semantic-border-subtle, #e2e8f0);
    border-radius: var(--st-radius-md, 6px);
    padding: 1rem 1.25rem;
    font-size: 0.88rem;
    line-height: 1.55;
    overflow-wrap: anywhere;
  }
  .csv-md :global(.csv-md-h) {
    margin: 1rem 0 0.4rem;
    font-size: 0.95rem;
    color: var(--st-semantic-text-primary, #0f172a);
  }
  .csv-md :global(.csv-md-p) {
    margin: 0 0 0.6rem;
  }
  .csv-md :global(.csv-mark) {
    background: color-mix(in srgb, var(--st-semantic-feedback-warning, #eab308) 38%, transparent);
    border-radius: 2px;
    padding: 0 0.1em;
  }
  .csv-foot {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.45rem 1rem;
    border-top: 1px solid var(--st-semantic-border-subtle, #e2e8f0);
    min-height: 2.1rem;
  }
  .csv-pager {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }
  .csv-page-ind {
    font-size: 0.76rem;
    font-weight: 600;
    color: var(--st-semantic-text-secondary, #475569);
  }
  .csv-degraded {
    font-size: 0.74rem;
    font-style: italic;
    color: var(--st-semantic-text-muted, #64748b);
  }
</style>
