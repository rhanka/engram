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
   * QUALIFIED UX (principal UAT 2026-07-04, immo/radar SignalPdfOverlay
   * parity). This frame is being qualified ONCE for the shared package, so it
   * is GENERIC — toolbar/frame common to ALL modalities, only the body swaps:
   *
   *   header   kicker / title / active locator / ✕ close
   *   toolbar  ONE compact DS bar, common to all modalities:
   *              ‹ Citation x/y ›  active-ref navigator (shown when y > 1)
   *              ‹ Doc x/y ›       source-document navigator (shown when the
   *                                refs span MULTIPLE locators; prev/next jumps
   *                                to the FIRST ref of the neighbour document)
   *              ‹ Page x/y ›      modality segment (page-addressable only)
   *              − NN% +           modality segment (render-scale zoom; the %
   *                                button resets to fit-width)
   *              Ouvrir ↗          opens the raw source in a new tab (shown
   *                                when `sourceHref(ref)` resolves a URL)
   *   body     the ONLY modality-specific region (pdf canvas + highlight
   *            layer · markdown render + <mark>; image canvas later)
   *   footer   degradation strip, shown ONLY when honesty requires it
   *            ("quote not located — showing anyway")
   *
   * The component is NON-modal by design: the consumer hosts it as a central
   * overlay (over its canvas/main view only) and keeps its side panels live; a
   * NEW `refs` array + `activeIndex` RETARGETS an open viewer (no stacking).
   *
   * Props (the frozen seam, SPEC_WP_CITED_SOURCE_VIZ §S.1/§S.3):
   *   refs          CitedSourceRef[] (shape only — no type import needed in JS):
   *                 { rawRef?, sourceUrl?, docSha?, modality?, page?, section?,
   *                   paragraph_id?, bbox?, excerpt?, citation? }
   *   resolveSource async (ref) => { kind: "pdf", data: ArrayBuffer }
   *                              | { kind: "markdown", text: string }
   *                 The component NEVER reads bytes itself (§S.3).
   *   sourceHref    (ref) => string|null — href for the "Ouvrir ↗" raw-source
   *                 link; null/absent hides the button. Pure callback: the
   *                 consumer owns the URL scheme (bundle sources/, API route…).
   *   activeIndex   Active ref index; with a new `refs` array it retargets.
   *   title         Header title (e.g. the source file the user clicked).
   *   onClose       Close callback (optional; hides the ✕ when absent).
   *
   * v1 scope: MD (incl. OCR-markdown / plain text) + PDF text-layer only.
   */
  import { tick } from "svelte";
  import {
    MAX_RENDER_SCALE,
    MIN_RENDER_SCALE,
    computeHighlightRects,
    loadPdfDocument,
    renderPdfPage,
  } from "../lib/cited-source/pdfEngine.js";
  import { renderSourceHtml } from "../lib/cited-source/markdownSource.js";

  let {
    refs = [],
    resolveSource,
    sourceHref = null,
    activeIndex = 0,
    title = "Cited source",
    onClose = null,
  } = $props();

  // Active ref index — internal state seeded from the props. Tracking BOTH the
  // refs identity and the activeIndex prop makes a re-open with the same index
  // on a new refs array retarget correctly (no stale internal position).
  let index = $state(0);
  let lastActiveProp = -1;
  let lastRefsProp = null;

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
  let scale = $state(1); // effective render scale (drives the toolbar %)
  let userScale = $state(null); // manual zoom; null = fit-width (default)
  let canvasEl = $state(null);
  let scrollEl = $state(null);
  let mdEl = $state(null);

  // Token guards: a newer load/render invalidates in-flight older ones.
  let loadToken = 0;
  let renderToken = 0;

  const ref = $derived(refs[index] ?? null);
  const refCount = $derived(refs.length);
  const quoteOf = (r) => r?.excerpt ?? r?.citation ?? null;
  const locatorOf = (r) => r?.rawRef ?? r?.sourceUrl ?? r?.docSha ?? "";

  // ── Document navigator (immo "PDF x/y"): distinct source locators, in ref
  //    order. Prev/next jumps to the FIRST ref of the neighbour document.
  const docLocators = $derived.by(() => {
    const seen = [];
    for (const r of refs) {
      const loc = locatorOf(r);
      if (!seen.includes(loc)) seen.push(loc);
    }
    return seen;
  });
  const docCount = $derived(docLocators.length);
  const docIndex = $derived(ref ? docLocators.indexOf(locatorOf(ref)) : -1);
  function goDoc(delta) {
    const target = docIndex + delta;
    if (target < 0 || target >= docCount) return;
    const loc = docLocators[target];
    const first = refs.findIndex((r) => locatorOf(r) === loc);
    if (first >= 0) index = first;
  }

  const rawHref = $derived(
    ref && typeof sourceHref === "function" ? (sourceHref(ref) ?? null) : null,
  );

  /** Human locator label for the header ("p.3", "§ Chapter 2", …). */
  function locatorLabel(r) {
    if (!r) return "";
    const parts = [];
    if (r.page != null) parts.push(`p.${r.page}`);
    if (r.section) parts.push(r.section);
    else if (r.paragraph_id) parts.push(`¶${r.paragraph_id}`);
    return parts.join(" · ");
  }

  // Retarget on ANY prop change (new refs array and/or new activeIndex): a
  // click on another citation while the overlay is open re-aims the SAME
  // viewer instead of stacking a second one.
  $effect(() => {
    if (refs !== lastRefsProp || activeIndex !== lastActiveProp) {
      lastRefsProp = refs;
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
    userScale = null; // a new source starts back in fit-width (radar #90)
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
    const rendered = await renderPdfPage(pdfPage, canvasEl, { containerWidth, userScale });
    if (token !== renderToken) return;
    scale = rendered.scale;

    // Highlight only on the ref's own page (radar bug #83 guard: a generic
    // fallback window would otherwise re-highlight on EVERY page).
    const quote = quoteOf(ref);
    const refPage = Number(ref?.page);
    const onRefPage = !Number.isFinite(refPage) || refPage === clamped;
    if (quote && onRefPage) {
      const content = await pdfPage.getTextContent();
      if (token !== renderToken) return;
      const { rects } = computeHighlightRects(content, rendered.viewport, rendered.scale, quote);
      highlightRects = rects;
      quoteOnPage = rects.length > 0;
      if (rects.length > 0) queueScrollToHighlight(rects[0]);
    } else {
      highlightRects = [];
      // Off the ref page: nothing is expected to highlight — not a degradation.
      quoteOnPage = !quote || !onRefPage ? true : false;
    }
  }

  // ── Zoom (immo "− 136% +"): manual render-scale override; the % button
  //    resets to fit-width. Re-renders the page + highlights at the new scale.
  function setUserScale(next) {
    const clamped = Math.max(MIN_RENDER_SCALE, Math.min(MAX_RENDER_SCALE, next));
    if (userScale !== null && Math.abs(clamped - userScale) < 0.001) return;
    userScale = clamped;
    if (pdfDoc) void renderPage(currentPage);
  }
  function zoomIn() {
    setUserScale((userScale ?? scale) + 0.2);
  }
  function zoomOut() {
    setUserScale((userScale ?? scale) - 0.2);
  }
  function resetZoom() {
    if (userScale === null) return;
    userScale = null;
    if (pdfDoc) void renderPage(currentPage);
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

  /** True when the key event belongs to a form field. The overlay is NON-modal
   *  (side panels stay interactive), so typing there must never page/close. */
  function isEditableTarget(event) {
    const el = event.target;
    if (!el || typeof el.closest !== "function") return false;
    return Boolean(
      el.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']"),
    );
  }
  function handleKeydown(event) {
    if (isEditableTarget(event)) return;
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
      <h2 class="csv-title" title={locatorOf(ref)}>{title}</h2>
      {#if ref}
        <p class="csv-locator">
          <span class="csv-locator-file">{locatorOf(ref) || "(no locator)"}</span>
          {#if locatorLabel(ref)}<span class="csv-locator-pos">{locatorLabel(ref)}</span>{/if}
        </p>
      {/if}
    </div>
    {#if onClose}
      <button class="csv-close" type="button" onclick={() => onClose()} aria-label="Close source viewer">✕</button>
    {/if}
  </header>

  <!-- QUALIFIED TOOLBAR (immo parity): one compact bar, generic frame; only
       the Page/Zoom segments are modality-gated (page-addressable sources). -->
  <div class="csv-toolbar" role="toolbar" aria-label="Source navigation">
    {#if refCount > 1}
      <div class="csv-tb-group" aria-label="Citation navigator">
        <button class="csv-tb-btn" type="button" disabled={index <= 0} onclick={() => goRef(index - 1)} aria-label="Previous citation">‹</button>
        <span class="csv-tb-label">Citation <strong>{index + 1}/{refCount}</strong></span>
        <button class="csv-tb-btn" type="button" disabled={index >= refCount - 1} onclick={() => goRef(index + 1)} aria-label="Next citation">›</button>
      </div>
    {/if}

    {#if docCount > 1}
      <div class="csv-tb-group" aria-label="Document navigator">
        <button class="csv-tb-btn" type="button" disabled={docIndex <= 0} onclick={() => goDoc(-1)} aria-label="Previous document">‹</button>
        <span class="csv-tb-label">Doc <strong>{docIndex + 1}/{docCount}</strong></span>
        <button class="csv-tb-btn" type="button" disabled={docIndex >= docCount - 1} onclick={() => goDoc(1)} aria-label="Next document">›</button>
      </div>
    {/if}

    {#if pdfDoc}
      <div class="csv-tb-group" aria-label="Page navigator">
        <button class="csv-tb-btn" type="button" disabled={currentPage <= 1} onclick={goPrevPage} aria-label="Previous page">‹</button>
        <span class="csv-tb-label">Page <strong>{currentPage}/{numPages}</strong></span>
        <button class="csv-tb-btn" type="button" disabled={currentPage >= numPages} onclick={goNextPage} aria-label="Next page">›</button>
      </div>

      <div class="csv-tb-group" aria-label="Zoom">
        <button class="csv-tb-btn" type="button" disabled={scale <= MIN_RENDER_SCALE + 0.001} onclick={zoomOut} aria-label="Zoom out">−</button>
        <button
          class="csv-tb-zoom"
          type="button"
          onclick={resetZoom}
          title="Back to fit-width"
          aria-label="Zoom level {Math.round(scale * 100)} percent, click to fit width"
        >{Math.round(scale * 100)}%</button>
        <button class="csv-tb-btn" type="button" disabled={scale >= MAX_RENDER_SCALE - 0.001} onclick={zoomIn} aria-label="Zoom in">+</button>
      </div>
    {/if}

    <span class="csv-tb-spacer"></span>

    {#if rawHref}
      <a class="csv-tb-open" href={rawHref} target="_blank" rel="noopener noreferrer">Ouvrir ↗</a>
    {/if}
  </div>

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
        <code class="csv-error-ref">{locatorOf(ref) || "(no locator)"}</code>
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

  {#if pdfDoc && !quoteOnPage}
    <footer class="csv-foot">
      <span class="csv-degraded">Quote not located on this page — showing the page anyway.</span>
    </footer>
  {:else if mdPayload && quoteOf(ref) && !mdFound}
    <footer class="csv-foot">
      <span class="csv-degraded">Quote not located in the source — showing the document anyway.</span>
    </footer>
  {/if}
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
  /* ── Qualified toolbar (immo parity) ──────────────────────────────────── */
  .csv-toolbar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.55rem;
    padding: 0.35rem 1rem;
    border-bottom: 1px solid var(--st-semantic-border-subtle, #e2e8f0);
    background: var(--st-semantic-surface-subtle, #f8fafc);
    min-height: 2.1rem;
  }
  .csv-tb-group {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    padding: 0.1rem 0.2rem;
    border: 1px solid var(--st-semantic-border-subtle, #e2e8f0);
    border-radius: var(--st-radius-sm, 4px);
    background: var(--st-semantic-surface-default, #fff);
  }
  .csv-tb-label {
    font-size: 0.72rem;
    color: var(--st-semantic-text-secondary, #475569);
    padding: 0 0.25rem;
    white-space: nowrap;
  }
  .csv-tb-label strong {
    font-weight: 700;
    color: var(--st-semantic-text-primary, #0f172a);
  }
  .csv-tb-btn {
    border: none;
    background: transparent;
    border-radius: var(--st-radius-sm, 4px);
    color: var(--st-semantic-text-secondary, #475569);
    cursor: pointer;
    font-size: 0.9rem;
    line-height: 1;
    padding: 0.15rem 0.4rem;
  }
  .csv-tb-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .csv-tb-btn:not(:disabled):hover {
    background: var(--st-semantic-surface-subtle, #f1f5f9);
    color: var(--st-semantic-action-primary, #2563eb);
  }
  .csv-tb-zoom {
    border: none;
    background: transparent;
    border-radius: var(--st-radius-sm, 4px);
    color: var(--st-semantic-text-primary, #0f172a);
    cursor: pointer;
    font-size: 0.72rem;
    font-weight: 700;
    line-height: 1;
    padding: 0.2rem 0.3rem;
    min-width: 2.6rem;
    text-align: center;
  }
  .csv-tb-zoom:hover {
    background: var(--st-semantic-surface-subtle, #f1f5f9);
    color: var(--st-semantic-action-primary, #2563eb);
  }
  .csv-tb-spacer {
    flex: 1;
  }
  .csv-tb-open {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    border: 1px solid var(--st-semantic-border-subtle, #e2e8f0);
    border-radius: var(--st-radius-sm, 4px);
    background: var(--st-semantic-surface-default, #fff);
    color: var(--st-semantic-text-link, #2563eb);
    font-size: 0.74rem;
    font-weight: 600;
    line-height: 1;
    padding: 0.3rem 0.5rem;
    text-decoration: none;
    white-space: nowrap;
  }
  .csv-tb-open:hover {
    border-color: var(--st-semantic-action-primary, #2563eb);
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
    padding: 0.35rem 1rem;
    border-top: 1px solid var(--st-semantic-border-subtle, #e2e8f0);
  }
  .csv-degraded {
    font-size: 0.74rem;
    font-style: italic;
    color: var(--st-semantic-text-muted, #64748b);
  }
</style>
