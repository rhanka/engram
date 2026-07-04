import { describe, expect, it } from "vitest";

import {
  buildPageText,
  findCitationInPage,
  normalizeForMatch,
} from "../lib/cited-source/quoteMatch.js";
import { renderSourceHtml } from "../lib/cited-source/markdownSource.js";

/**
 * Pure quote-matcher port (radar pdf-citation-match lift) — the deterministic
 * core shared by the PDF text-layer highlight and the markdown mark. Covers the
 * viewer's three contract cases: exact match, normalized (whitespace/accents)
 * match, and not-found (graceful degradation).
 */
describe("cited-source quoteMatch", () => {
  const page =
    "ATTENDU QUE la municipalité a adopté le règlement de zonage 2024-17;\n" +
    "CONSIDÉRANT l'avis du comité consultatif d'urbanisme rendu le 4 mars,\n" +
    "le conseil autorise la dérogation mineure pour le lot 5 431 220.";

  it("finds an exact quote and returns its raw interval with coverage 1", () => {
    const quote = "le conseil autorise la dérogation mineure";
    const match = findCitationInPage(page, quote);
    expect(match).not.toBeNull();
    expect(match.coverage).toBe(1);
    expect(page.slice(match.start, match.end)).toBe(quote);
  });

  it("matches across whitespace / accent / ligature normalization", () => {
    // Quote differs from the page by case, collapsed whitespace and accents.
    const quote = "considerant   l'avis du comite consultatif d'urbanisme";
    const match = findCitationInPage(page, quote);
    expect(match).not.toBeNull();
    expect(match.coverage).toBe(1);
    // The raw interval points at the ORIGINAL accented text.
    expect(page.slice(match.start, match.end)).toMatch(/^CONSIDÉRANT l'avis du comité consultatif d'urbanisme$/);
  });

  it("falls back to the longest consecutive-word window when the quote is clipped", () => {
    // Head is noise not present in the page; the 8-word tail is verbatim.
    const quote = "xxxx yyyy zzzz la municipalité a adopté le règlement de zonage";
    const match = findCitationInPage(page, quote, { minWords: 6, minCoverage: 0.4 });
    expect(match).not.toBeNull();
    expect(match.coverage).toBeGreaterThan(0.4);
    expect(match.coverage).toBeLessThan(1);
    expect(page.slice(match.start, match.end)).toContain("municipalité a adopté");
  });

  it("returns null when the quote is not on the page (no fake highlight)", () => {
    expect(findCitationInPage(page, "totally unrelated sentence about spacecraft telemetry systems")).toBeNull();
    expect(findCitationInPage(page, "")).toBeNull();
    expect(findCitationInPage("", "le conseil autorise")).toBeNull();
  });

  it("normalizeForMatch folds accents, ligatures, quotes and whitespace", () => {
    expect(normalizeForMatch("Œuvre  d’été\n—  cœur")).toBe("oeuvre d'ete - coeur");
  });

  it("buildPageText concatenates pdf.js items with offsets, skipping non-text items", () => {
    const items = [
      { str: "Hello", transform: [1, 0, 0, 1, 0, 0], width: 10, height: 10 },
      { type: "beginMarkedContent" }, // TextMarkedContent — no `str`
      { str: "world", transform: [1, 0, 0, 1, 20, 0], width: 10, height: 10 },
    ];
    const { pageText, offsets } = buildPageText(items);
    expect(pageText).toBe("Hello world ");
    expect(offsets).toHaveLength(2);
    expect(offsets[0]).toMatchObject({ start: 0, end: 5 });
    expect(offsets[1]).toMatchObject({ start: 6, end: 11 });
    // A match over the concatenation overlaps both items.
    const match = findCitationInPage(pageText, "hello world", { minWords: 2, minCoverage: 0.4 });
    expect(match).not.toBeNull();
  });
});

describe("cited-source markdownSource", () => {
  const md =
    "# The Adventure of the Blue Study\n" +
    "\n" +
    "Holmes examined the **ledger** in silence.\n" +
    "\n" +
    "## Chapter 2\n" +
    "\n" +
    "The banker, Mr. Holder, confessed that the coronet had vanished from his private safe during the night.";

  it("renders the source with the quote wrapped in a <mark>", () => {
    const quote = "the coronet had vanished from his private safe";
    const { html, found } = renderSourceHtml(md, quote);
    expect(found).toBe(true);
    expect(html).toContain('<mark class="csv-mark"');
    expect(html).toContain("coronet had vanished from his private safe</mark>");
    // Headings and bold survive outside the mark.
    expect(html).toContain('class="csv-md-h"');
    expect(html).toContain("<strong>ledger</strong>");
  });

  it("escapes HTML in the source (safe for {@html})", () => {
    const { html } = renderSourceHtml("evil <script>alert(1)</script> text", null);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("degrades gracefully when the quote is absent: renders, found=false, no mark", () => {
    const { html, found } = renderSourceHtml(md, "a passage that simply is not in the document at all");
    expect(found).toBe(false);
    expect(html).not.toContain("<mark");
    expect(html).toContain("Holmes examined");
  });
});
