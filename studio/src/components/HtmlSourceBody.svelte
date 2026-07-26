<script>
  /**
   * A CONSUMER-REGISTERED body renderer for `kind: "html"` cited sources.
   *
   * The published @sentropic/cited-source-viewer ships bodies for `pdf`,
   * `markdown` and `text` only, and its v1 payload union is closed on purpose —
   * a new kind arrives through `registerBodyRenderer(kind, component)`, which is
   * exactly the seam this uses. Nothing in the lib is modified or forked: this
   * file implements the published `CitedSourceBodyProps` contract and is
   * registered by the studio at startup.
   *
   * The document is rendered in a SANDBOXED iframe with no `allow-scripts` and
   * no `allow-same-origin`, so it runs in an opaque origin with scripting
   * disabled: it cannot read the studio's DOM, its storage, or its cookies. The
   * markup is separately stripped of active content and pinned under a
   * `default-src 'none'` CSP by `lib/htmlSource.js` — defence in depth, so
   * loosening any one of those three does not by itself make a cited source
   * dangerous.
   *
   * Because the frame runs no scripts, the citation's quote is highlighted in
   * the MARKUP before injection (`<mark data-csv-mark>`, the lib's own hook),
   * and the height is driven from a resize observer on the host rather than
   * measured inside the frame.
   */
  import { buildSourceSrcdoc, readDsTokens } from "../lib/htmlSource.js";

  let {
    sourceRef = null,
    payload = null,
    quote = null,
    onStatus = null,
    registerCommands = null,
    onRenderError = null,
  } = $props();

  /**
   * Theme tokens are read once per mount rather than tracked: the frame is
   * rebuilt whenever the payload or quote changes anyway, and a token read on
   * every reactive tick would force a layout flush per keystroke of navigation.
   */
  const tokens = $derived.by(() =>
    typeof document !== "undefined" ? readDsTokens(document) : {},
  );

  const built = $derived.by(() => {
    const html = typeof payload?.html === "string" ? payload.html : payload?.text;
    if (typeof html !== "string") {
      return { srcdoc: "", quoteLocated: false, error: "html payload carries no markup" };
    }
    try {
      return { ...buildSourceSrcdoc({ html, quote, tokens }), error: null };
    } catch (err) {
      return {
        srcdoc: "",
        quoteLocated: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  $effect(() => {
    if (built.error) {
      onRenderError?.(built.error);
      return;
    }
    // An HTML capture has no pages, so the toolbar's page controls must stay
    // hidden rather than offering navigation that cannot go anywhere — the same
    // reason the exporter prefers a PDF over the page it was published behind.
    onStatus?.({ pageAddressable: false, quoteLocated: built.quoteLocated });
  });

  // No page nav, no zoom: the frame reflows with the panel.
  $effect(() => {
    registerCommands?.(null);
    return () => registerCommands?.(null);
  });

  const title = $derived(
    `Cited source${sourceRef?.rawRef ? `: ${sourceRef.rawRef}` : ""} (sandboxed)`,
  );
</script>

{#if built.error}
  <p class="html-body-error">Could not render this HTML source: {built.error}</p>
{:else}
  <iframe
    class="html-body-frame"
    {title}
    sandbox=""
    referrerpolicy="no-referrer"
    loading="lazy"
    srcdoc={built.srcdoc}
  ></iframe>
{/if}

<style>
  .html-body-frame {
    display: block;
    width: 100%;
    /* The frame cannot measure itself (no scripts), so it takes the space the
       panel gives it and scrolls internally, like the PDF body does. */
    height: 100%;
    min-height: 320px;
    border: 1px solid var(--st-color-border, #d9dee5);
    border-radius: var(--st-radius-sm, 4px);
    background: var(--st-color-bg, #fff);
  }

  .html-body-error {
    margin: 0;
    padding: 12px 16px;
    color: var(--st-color-text-muted, #5b6470);
    font-size: 13px;
  }
</style>
