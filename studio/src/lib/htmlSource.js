/**
 * Studio-side (PURE) preparation of an HTML cited source for display.
 *
 * A citation whose source is a captured web page used to reach the viewer as
 * `{ kind: "markdown" }`, and the lib's MarkdownBody escapes any HTML it finds
 * — correctly, it is XSS-safe by construction — so the reader was shown the raw
 * markup of the page instead of the page. Rendering it AS HTML means running
 * somebody else's document inside the studio, so everything here exists to make
 * that safe before it reaches an iframe:
 *
 *   - the document is stripped of scripts, event handlers and other active
 *     content, so nothing executes even if the frame's sandbox is later
 *     loosened;
 *   - a `default-src 'none'` CSP is injected, so the document cannot phone home,
 *     load a tracking pixel, or pull a remote font — a cited source is evidence,
 *     and evidence must not talk to the network;
 *   - `<base target="_blank">` plus a stripped `<base href>` keeps any link the
 *     reader clicks from navigating the frame away from the evidence.
 *
 * The quote highlight is done HERE, on the markup, because the frame runs no
 * scripts: the passage is wrapped in `<mark data-csv-mark>` (the same hook the
 * lib's own bodies use) before the document is ever handed over.
 *
 * Everything in this module is a pure string transform, so it is testable
 * without a DOM.
 */

/** Elements whose content is executable or navigational — removed wholesale. */
const ACTIVE_ELEMENTS = [
  "script",
  "iframe",
  "object",
  "embed",
  "applet",
  "form",
  "link",
  "meta",
  "base",
  "noscript",
];

/**
 * Remove `<tag>…</tag>` (and self-closing / unclosed forms) for every active
 * element. Deliberately a string transform: the alternative is parsing the
 * document with `DOMParser`, which for `<img src=x onerror=…>` means CREATING
 * the node — the exact thing we are trying to avoid — and would tie this
 * module to a DOM it does not otherwise need.
 */
export function stripActiveContent(html) {
  let out = String(html ?? "");
  for (const tag of ACTIVE_ELEMENTS) {
    // Paired form, non-greedy, dot-all.
    out = out.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, "gi"), "");
    // Void / unclosed form.
    out = out.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, "gi"), "");
  }
  // Inline event handlers in any surviving tag: on*="…" | on*='…' | on*=bare.
  out = out.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  // javascript:/vbscript: URLs in href/src/action.
  out = out.replace(
    /\s(href|src|action|xlink:href)\s*=\s*("|')?\s*(javascript|vbscript|data:text\/html)[^"'\s>]*("|')?/gi,
    "",
  );
  return out;
}

/**
 * Byte ranges of `html` that are TEXT rather than markup.
 *
 * The quote search runs only over these, so a passage can never be "found"
 * inside a tag name or an attribute value and turn `<a href="…">` into
 * `<a hr<mark>ef</mark>="…">`. Comments count as markup and are skipped.
 */
export function textRegions(html) {
  const regions = [];
  let i = 0;
  let textStart = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) break;
    if (lt > textStart) regions.push({ start: textStart, end: lt });
    if (html.startsWith("<!--", lt)) {
      const close = html.indexOf("-->", lt + 4);
      i = close < 0 ? html.length : close + 3;
    } else {
      const gt = html.indexOf(">", lt);
      i = gt < 0 ? html.length : gt + 1;
    }
    textStart = i;
  }
  if (textStart < html.length) regions.push({ start: textStart, end: html.length });
  return regions;
}

/** Collapse runs of whitespace to a single space, for tolerant matching. */
function normalizeForMatch(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Locate `quote` inside the TEXT of `html`, tolerating differing whitespace
 * (an OCR'd quote is routinely re-wrapped relative to the markup it came from).
 *
 * Returns the source-offset ranges the match covers — one per text region it
 * spans, since a passage crossing an inline tag (`a <em>bold</em> claim`) must
 * be marked in each piece rather than not at all. Null when the quote is not
 * present as text.
 */
export function findQuoteRanges(html, quote) {
  const needle = normalizeForMatch(quote);
  if (!needle) return null;

  const regions = textRegions(html);
  // Normalized haystack + a map from each normalized char to its source offset.
  let haystack = "";
  const offsets = [];
  let pendingSpace = false;
  for (const region of regions) {
    for (let i = region.start; i < region.end; i += 1) {
      const ch = html[i];
      if (/\s/.test(ch)) {
        pendingSpace = haystack.length > 0;
        continue;
      }
      if (pendingSpace) {
        haystack += " ";
        offsets.push(i);
        pendingSpace = false;
      }
      haystack += ch;
      offsets.push(i);
    }
  }

  const at = haystack.indexOf(needle);
  if (at < 0) return null;
  const from = offsets[at];
  const to = offsets[at + needle.length - 1] + 1;

  // Clip the source span back to the text regions it covers, so the inserted
  // marks never straddle a tag.
  const ranges = [];
  for (const region of regions) {
    const start = Math.max(region.start, from);
    const end = Math.min(region.end, to);
    if (start < end) ranges.push({ start, end });
  }
  return ranges.length > 0 ? ranges : null;
}

/**
 * Wrap the cited passage in `<mark data-csv-mark>` — the same hook the lib's own
 * bodies use, so the highlight is styled consistently wherever it appears.
 * Returns the original markup unchanged when the quote is not found as text.
 */
export function highlightQuote(html, quote) {
  const ranges = findQuoteRanges(html, quote);
  if (!ranges) return { html, quoteLocated: false };
  let out = "";
  let cursor = 0;
  for (const { start, end } of ranges) {
    out += html.slice(cursor, start);
    out += `<mark data-csv-mark>${html.slice(start, end)}</mark>`;
    cursor = end;
  }
  out += html.slice(cursor);
  return { html: out, quoteLocated: true };
}

/**
 * The design-system custom properties the fallback stylesheet reads.
 *
 * They have to be INLINED rather than inherited: an iframe is a separate
 * document, so the host's `:root` custom properties simply do not exist inside
 * it. The caller resolves them against the live document and passes the values
 * through, which is also what makes the frame follow the studio's light/dark
 * theme.
 */
export const DS_TOKENS = [
  "--st-color-bg",
  "--st-color-surface",
  "--st-color-text",
  "--st-color-text-muted",
  "--st-color-border",
  "--st-color-accent",
  "--st-font-family-base",
  "--st-font-family-mono",
];

/** Every value that lands in the frame is escaped; nothing is interpolated raw. */
function escapeCss(value) {
  return String(value ?? "").replace(/[<>"'\\]/g, "");
}

/**
 * The fallback stylesheet.
 *
 * A captured page arrives WITHOUT its stylesheets — `<link>` is stripped as
 * active content and the CSP forbids fetching one anyway — so left alone it
 * renders as unstyled Times New Roman on white, which reads as "broken" rather
 * than "evidence". This gives it the studio's typography, colours and spacing
 * so it looks like part of the application, while any `<style>` block the
 * document carried inline still wins over it (it is emitted first).
 */
export function fallbackStylesheet(tokens = {}) {
  const v = (name, fallback) => escapeCss(tokens[name] || fallback);
  return `
:root {
  color-scheme: light dark;
  --st-color-bg: ${v("--st-color-bg", "#ffffff")};
  --st-color-surface: ${v("--st-color-surface", "#f7f8fa")};
  --st-color-text: ${v("--st-color-text", "#1a1d21")};
  --st-color-text-muted: ${v("--st-color-text-muted", "#5b6470")};
  --st-color-border: ${v("--st-color-border", "#d9dee5")};
  --st-color-accent: ${v("--st-color-accent", "#0b6bcb")};
}
html, body {
  margin: 0;
  padding: 0;
  background: var(--st-color-bg);
  color: var(--st-color-text);
  font-family: ${v("--st-font-family-base", "system-ui, -apple-system, Segoe UI, Roboto, sans-serif")};
  font-size: 14px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}
body { padding: 16px 20px; }
h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 1.2em 0 0.5em; }
h1 { font-size: 1.5em; } h2 { font-size: 1.3em; } h3 { font-size: 1.15em; }
p, ul, ol, blockquote, table, pre { margin: 0 0 0.9em; }
a { color: var(--st-color-accent); }
blockquote {
  margin-left: 0; padding: 0.2em 0 0.2em 0.9em;
  border-left: 3px solid var(--st-color-border); color: var(--st-color-text-muted);
}
code, pre { font-family: ${v("--st-font-family-mono", "ui-monospace, SFMono-Regular, Menlo, monospace")}; font-size: 0.92em; }
pre { background: var(--st-color-surface); padding: 0.8em; overflow-x: auto; }
/* Tables and images must never force the FRAME to scroll sideways. */
table { border-collapse: collapse; display: block; overflow-x: auto; max-width: 100%; }
th, td { border: 1px solid var(--st-color-border); padding: 0.35em 0.6em; text-align: left; }
img, video { max-width: 100%; height: auto; }
/* SVG is capped but NOT given height:auto. A capture's inline icons usually
   carry a viewBox and no intrinsic size, and max-width:100% together with
   height:auto scales exactly those to the full container width — a 16px chevron
   rendered 600px tall, which is what a real Google Sites capture did. Without
   the height rule an unsized SVG keeps its 300x150 default and an explicitly
   sized one keeps its own size, so icons stay icons and diagrams still fit. */
svg { max-width: 100%; }
hr { border: 0; border-top: 1px solid var(--st-color-border); margin: 1.4em 0; }
mark[data-csv-mark] {
  background: color-mix(in srgb, var(--st-color-accent) 24%, transparent);
  color: inherit; padding: 0.05em 0.1em; border-radius: 2px;
}
`.trim();
}

/**
 * Build the complete `srcdoc` for the frame: CSP first, then the fallback
 * stylesheet, then the sanitized (and highlighted) document.
 *
 * The CSP is the real guarantee here rather than a nicety. `default-src 'none'`
 * means the document cannot reach the network at all; `img-src data:` keeps
 * inlined images working (an OCR/capture pipeline embeds them) without allowing
 * a remote one, which would leak the reader's IP and the fact that this exact
 * source was opened.
 */
export function buildSourceSrcdoc({ html, quote = null, tokens = {} } = {}) {
  const sanitized = stripActiveContent(html);
  const { html: body, quoteLocated } = quote
    ? highlightQuote(sanitized, quote)
    : { html: sanitized, quoteLocated: false };
  const srcdoc = [
    "<!doctype html>",
    '<html><head><meta charset="utf-8">',
    '<meta http-equiv="Content-Security-Policy" ',
    "content=\"default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:\">",
    '<base target="_blank">',
    `<style>${fallbackStylesheet(tokens)}</style>`,
    "</head><body>",
    body,
    "</body></html>",
  ].join("");
  return { srcdoc, quoteLocated };
}

/** Read {@link DS_TOKENS} off a live document, for inlining into the frame. */
export function readDsTokens(doc) {
  const out = {};
  const root = doc?.documentElement;
  if (!root || typeof doc?.defaultView?.getComputedStyle !== "function") return out;
  const style = doc.defaultView.getComputedStyle(root);
  for (const name of DS_TOKENS) {
    const value = style.getPropertyValue(name);
    if (value && value.trim()) out[name] = value.trim();
  }
  return out;
}

/** True when a locator names an HTML document (the resolver's modality sniff). */
export function looksLikeHtml(locator) {
  return /\.x?html?(?:[?#]|$)/i.test(String(locator ?? ""));
}
