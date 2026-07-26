import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  loadCitedSourceProvenance,
  resetProvenanceCache,
  resolveBundleSource,
  resolveSourceChain,
  sourceHrefFor,
} from "../lib/citedSources.js";
import { citationsByFileFrom } from "../lib/graphAdapter.js";

/* ===========================================================================
 * PROVENANCE CHAIN: original document → converted markdown → citation.
 *
 * A PDF corpus is OCR'd to markdown before extraction, so a citation's
 * `source_file` names the CONVERTED artifact. Opening THAT as "the cited
 * source" shows the reader a machine intermediate — no pagination, no figures,
 * no layout — and presents it as if it were the document. The exporter records
 * the chain in `sources/provenance.json`; these lock the three behaviours that
 * make the chain trustworthy:
 *
 *   1. the viewer opens the ORIGINAL when it is bundled, keeping the markdown
 *      as the intermediate breadcrumb (`via`) rather than the presented artifact;
 *   2. it degrades to the markdown — never silently, never to something else —
 *      when the original is too large to bundle (the PROCESS_STD corpus is 28 GB);
 *   3. it NEVER renders the studio's own `index.html`, which is what a static
 *      server's SPA fallback hands back for a file that is not in the bundle.
 * ======================================================================== */

const CONVERTED =
  ".graphify/converted/pdf/AM10014.02.01.09_R19.page-images_7668479ef707.md";
const ORIGINAL = "data/derived/llm-wiki/pdf-corpus/AM10014.02.01.09_R19.page-images.pdf";

const PROVENANCE = {
  schema: "graphify_cited_source_provenance_v1",
  documents: {
    [CONVERTED]: {
      original: ORIGINAL,
      conversion: "mistral-ocr-batch",
      via: "frontmatter",
      bundled: true,
    },
  },
};

/** A fetch stub routing the provenance sidecar and the source files. */
function stubFetch(routes) {
  const mock = vi.fn(async (url) => {
    const hit = routes[url];
    if (!hit) return { ok: false, status: 404, statusText: "Not Found", headers: new Headers() };
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers(hit.headers ?? {}),
      json: async () => JSON.parse(hit.body),
      text: async () => hit.body,
      arrayBuffer: async () => hit.bytes ?? new ArrayBuffer(4),
    };
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

beforeEach(() => resetProvenanceCache());
afterEach(() => {
  vi.unstubAllGlobals();
  resetProvenanceCache();
});

describe("resolveSourceChain — which artifact is PRESENTED", () => {
  it("hops to the original and keeps the markdown as the intermediate", () => {
    const chain = resolveSourceChain({ rawRef: CONVERTED }, PROVENANCE.documents);
    expect(chain).toMatchObject({ locator: ORIGINAL, original: ORIGINAL, via: CONVERTED });
    // A single-rung ladder is synthesized from `original` so callers always see one.
    expect(chain.chain).toEqual([
      { ref: ORIGINAL, kind: "file", via: "frontmatter", bundled: true },
    ]);
  });

  it("stays on the markdown when the original is NOT bundled, but still names it", () => {
    const docs = { [CONVERTED]: { ...PROVENANCE.documents[CONVERTED], bundled: false } };
    const chain = resolveSourceChain({ rawRef: CONVERTED }, docs);
    // The markdown is what we can show; the original stays a breadcrumb.
    expect(chain).toMatchObject({ locator: CONVERTED, original: ORIGINAL, via: null });
  });

  it("passes a citation that already points at the original straight through", () => {
    const chain = resolveSourceChain({ rawRef: "corpus/report.pdf" }, PROVENANCE.documents);
    expect(chain).toEqual({ locator: "corpus/report.pdf", original: null, via: null, chain: [] });
  });

  it("tolerates a `./`-prefixed locator and an absent sidecar", () => {
    expect(resolveSourceChain({ rawRef: `./${CONVERTED}` }, PROVENANCE.documents).locator).toBe(
      ORIGINAL,
    );
    expect(resolveSourceChain({ rawRef: CONVERTED }, {}).locator).toBe(CONVERTED);
    expect(resolveSourceChain({ rawRef: CONVERTED }, null).locator).toBe(CONVERTED);
    expect(resolveSourceChain({ section: "no locator" }, PROVENANCE.documents)).toBeNull();
  });
});

describe("resolveBundleSource — opens the original PDF, never the SPA shell", () => {
  it("fetches the ORIGINAL pdf for a citation that names the converted markdown", async () => {
    const bytes = new ArrayBuffer(16);
    const fetchMock = stubFetch({
      "./sources/provenance.json": { body: JSON.stringify(PROVENANCE) },
      [`./sources/${ORIGINAL}`]: { body: "", bytes, headers: { "content-type": "application/pdf" } },
    });

    const out = await resolveBundleSource({
      rawRef: CONVERTED,
      page: 14,
      // The citation's own modality describes the MARKDOWN intermediate. After
      // the hop it must not be trusted, or PDF bytes reach the md renderer.
      modality: "ocr-markdown",
    });
    expect(out).toEqual({ kind: "pdf", data: bytes });
    expect(fetchMock).toHaveBeenCalledWith(`./sources/${ORIGINAL}`);
  });

  it("falls back to the converted markdown when the original is not bundled", async () => {
    const docs = {
      schema: PROVENANCE.schema,
      documents: { [CONVERTED]: { ...PROVENANCE.documents[CONVERTED], bundled: false } },
    };
    stubFetch({
      "./sources/provenance.json": { body: JSON.stringify(docs) },
      [`./sources/${CONVERTED}`]: {
        body: "# OCR text",
        headers: { "content-type": "text/markdown" },
      },
    });
    expect(await resolveBundleSource({ rawRef: CONVERTED })).toEqual({
      kind: "markdown",
      text: "# OCR text",
    });
  });

  it("REFUSES an HTML body — a 200 from the SPA fallback is not the document", async () => {
    stubFetch({
      "./sources/provenance.json": { body: "{}" },
      "./sources/corpus/missing.md": {
        body: "<!doctype html><title>Graphify Ontology Studio</title>",
        headers: { "content-type": "text/html; charset=utf-8" },
      },
    });
    await expect(resolveBundleSource({ rawRef: "corpus/missing.md" })).rejects.toThrow(
      /returned HTML, not the cited source/,
    );
  });

  it("still serves a source that genuinely IS an html file", async () => {
    stubFetch({
      "./sources/provenance.json": { body: "{}" },
      "./sources/corpus/page.html": {
        body: "<h1>a real cited page</h1>",
        headers: { "content-type": "text/html" },
      },
    });
    // It passes the SPA-shell guard (an HTML content-type is legitimate for an
    // HTML locator) and is now served AS HTML: handing it to the markdown body
    // showed the reader the page's raw markup, since MarkdownBody escapes HTML
    // by design. `kind: "html"` is the consumer-registered body.
    expect(await resolveBundleSource({ rawRef: "corpus/page.html" })).toEqual({
      kind: "html",
      html: "<h1>a real cited page</h1>",
    });
  });

  it("treats a missing/!ok sidecar as 'no provenance', not as a failure", async () => {
    stubFetch({
      "./sources/corpus/notes.md": { body: "plain", headers: { "content-type": "text/markdown" } },
    });
    await expect(loadCitedSourceProvenance()).resolves.toEqual({});
    expect(await resolveBundleSource({ rawRef: "corpus/notes.md" })).toEqual({
      kind: "markdown",
      text: "plain",
    });
  });

  it("memoizes the sidecar — one fetch however many citations are opened", async () => {
    const fetchMock = stubFetch({
      "./sources/provenance.json": { body: JSON.stringify(PROVENANCE) },
      [`./sources/${ORIGINAL}`]: { body: "", headers: { "content-type": "application/pdf" } },
    });
    await resolveBundleSource({ rawRef: CONVERTED });
    await resolveBundleSource({ rawRef: CONVERTED });
    const sidecarCalls = fetchMock.mock.calls.filter((c) => c[0] === "./sources/provenance.json");
    expect(sidecarCalls).toHaveLength(1);
  });
});

describe("sourceHrefFor — 'Ouvrir ↗' points at the original", () => {
  it("links the original when bundled, the cited file otherwise", () => {
    expect(sourceHrefFor({ rawRef: CONVERTED }, PROVENANCE.documents)).toBe(
      `./sources/${ORIGINAL}`,
    );
    // No provenance passed ⇒ historical behaviour, unchanged.
    expect(sourceHrefFor({ rawRef: CONVERTED })).toBe(`./sources/${CONVERTED}`);
    expect(sourceHrefFor({ section: "no locator" }, PROVENANCE.documents)).toBeNull();
  });
});

describe("a page locator is a page NUMBER or nothing (no more p.unknown)", () => {
  it("drops the literal 'unknown' the extraction corpus carries", () => {
    // 43 297 citations in the PROCESS_STD graph carry page:"unknown"; rendering
    // "p.unknown" invents a reference to a page that does not exist.
    const [group] = citationsByFileFrom([
      { source_file: "doc.md", page: "unknown" },
      { source_file: "doc.md", page: 14 },
      // A numeric STRING is a real page — the frozen converter parses it, so
      // the panel must too, or the two disagree about what is navigable.
      { source_file: "doc.md", page: "12" },
      { source_file: "doc.md" },
    ]);
    expect(group.passages.map((p) => p.page)).toEqual([null, 14, 12, null]);
  });
});
