/**
 * Markdown / plain-text source rendering with the cited quote highlighted.
 *
 * PURE (no DOM, no graphify import): given the raw source text and the quote,
 * emit safe HTML — everything escaped, minimal markdown affordances re-enabled
 * (headings + bold/italic), and the matched quote range wrapped in
 * `<mark class="csv-mark">`. The viewer injects the result via {@html} and
 * scrolls to the mark. Kept deliberately self-contained (no studio markdown.js
 * import) so the module lifts into `@sentropic/cited-source-viewer` unchanged.
 */

import { findCitationInPage } from "./quoteMatch.js";

const HTML_ESCAPE_RE = /[&<>"']/g;
const HTML_ESCAPE_MAP = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** @param {unknown} value */
export function escapeHtml(value) {
  return String(value ?? "").replace(HTML_ESCAPE_RE, (ch) => HTML_ESCAPE_MAP[ch] ?? ch);
}

/** Escaped text with **bold** / *italic* runs re-enabled (mirrors studio markdown.js). */
function inlineMd(escaped) {
  return escaped
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1<em>$2</em>");
}

/**
 * Render ONE block (paragraph or heading) of already-sliced raw text to HTML.
 * `marked` wraps the block in the highlight mark (block fully inside the match).
 * @param {string} block
 */
function renderBlock(block) {
  const heading = /^(#{1,6})\s+(.*)$/.exec(block.trim());
  if (heading) {
    const level = Math.min(heading[1].length + 2, 6); // demote: source h1 -> h3
    return `<h${level} class="csv-md-h">${inlineMd(escapeHtml(heading[2]))}</h${level}>`;
  }
  return `<p class="csv-md-p">${inlineMd(escapeHtml(block)).replace(/\n/g, "<br>")}</p>`;
}

/**
 * Render the whole source with the quote's matched range wrapped in a <mark>.
 *
 * The match runs over the RAW text (quoteMatch keeps a normalized->raw map), so
 * the mark lands on the verbatim passage even when the quote differs by
 * whitespace/accents/ligatures. When the quote cannot be located the source is
 * rendered WITHOUT a mark and `found` is false (graceful degradation — the
 * viewer says so instead of pretending).
 *
 * @param {string} text  Raw markdown / plain-text source.
 * @param {string|null|undefined} quote  Verbatim quote to highlight.
 * @param {{ minWords?: number, minCoverage?: number }} [matchOptions]
 * @returns {{ html: string, found: boolean, coverage: number }}
 */
export function renderSourceHtml(text, quote, matchOptions = {}) {
  const raw = String(text ?? "");
  const match = quote ? findCitationInPage(raw, quote, matchOptions) : null;

  // Split into blocks on blank lines, tracking each block's raw offset so the
  // match interval can be projected into per-block mark ranges.
  const blocks = [];
  const re = /[^\n]+(?:\n(?!\s*\n)[^\n]*)*/g; // runs of non-blank lines
  let m;
  while ((m = re.exec(raw)) !== null) {
    blocks.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
  }

  const parts = [];
  for (const block of blocks) {
    if (!match || match.end <= block.start || match.start >= block.end) {
      parts.push(renderBlock(block.text));
      continue;
    }
    // Overlap: split the block into pre / marked / post, escape each side, and
    // rebuild one paragraph (heading blocks with a partial match render as a
    // paragraph too — precision over prettiness for the highlighted region).
    const relStart = Math.max(0, match.start - block.start);
    const relEnd = Math.min(block.text.length, match.end - block.start);
    const pre = escapeHtml(block.text.slice(0, relStart)).replace(/\n/g, "<br>");
    const hit = escapeHtml(block.text.slice(relStart, relEnd)).replace(/\n/g, "<br>");
    const post = escapeHtml(block.text.slice(relEnd)).replace(/\n/g, "<br>");
    parts.push(
      `<p class="csv-md-p">${pre}<mark class="csv-mark" data-csv-mark="1">${hit}</mark>${post}</p>`,
    );
  }

  return {
    html: parts.join("\n"),
    found: Boolean(match),
    coverage: match?.coverage ?? 0,
  };
}
