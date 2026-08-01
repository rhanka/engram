import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  resetProvenanceCache,
  resolveBundleSource,
  resolveSourceChain,
} from "../lib/citedSources.js";

/* ===========================================================================
 * CHARACTERIZATION of the ResolveSource seam — the one-way resolver (A4).
 *
 * READ THIS BEFORE "FIXING" A FAILING TEST HERE.
 *
 * These tests do NOT assert desirable behaviour. They pin the CURRENT shape of
 * the seam, defect included, so that the A4 change becomes PROVABLE against a
 * written reference instead of being eyeballed. The lib's contract is
 *   ResolveSource = (ref) => Promise<P extends {kind: string}>
 * and the frame reads ONLY `kind`. The resolver is therefore strictly one-way:
 * our adapter goes and fetches the ORIGINAL pdf, and has no channel whatsoever
 * to tell the viewer WHICH document it ended up resolving. No consumer prop can
 * correct the header, because nothing the consumer returns is read.
 *
 * The sharp consequence, pinned in `the header names the WRONG document` below:
 * after a provenance hop the only handle the caller still holds is the original
 * `ref`, which describes the MARKDOWN INTERMEDIATE — so a header rendered from
 * it names a document that is not the one on screen.
 *
 * WHEN A4 IS DECIDED and the additive field lands, these tests SHOULD fail.
 * That is their purpose. Update them deliberately, as the record of the change;
 * do not relax them to make a build go green.
 * ======================================================================== */

const CONVERTED = ".graphify/converted/pdf/AM10014.02.01.09_R19.page-images_7668479ef707.md";
const ORIGINAL = "data/derived/llm-wiki/pdf-corpus/AM10014.02.01.09_R19.page-images.pdf";

const DOCUMENTS = {
  [CONVERTED]: {
    original: ORIGINAL,
    conversion: "mistral-ocr-batch",
    via: "frontmatter",
    bundled: true,
  },
};

const SIDECAR = { schema: "graphify_cited_source_provenance_v1", documents: DOCUMENTS };

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

/** The citation as the viewer holds it: it names the INTERMEDIATE, not the pdf. */
const CITATION = { rawRef: CONVERTED, page: 14, modality: "ocr-markdown" };

beforeEach(() => resetProvenanceCache());
afterEach(() => {
  vi.unstubAllGlobals();
  resetProvenanceCache();
});

describe("ResolveSource seam — what the adapter is ALLOWED to say back", () => {
  it("returns kind + payload and NOTHING that names the resolved document", async () => {
    const bytes = new ArrayBuffer(16);
    stubFetch({
      "./sources/provenance.json": { body: JSON.stringify(SIDECAR) },
      [`./sources/${ORIGINAL}`]: { body: "", bytes, headers: { "content-type": "application/pdf" } },
    });

    const out = await resolveBundleSource(CITATION);

    // The whole vocabulary of the return value, exhaustively.
    expect(Object.keys(out).sort()).toEqual(["data", "kind"]);
    // Not one of these exists — this IS the defect, stated as an assertion.
    for (const absent of ["original", "resolved", "locator", "via", "chain", "sourceFile", "title"]) {
      expect(out[absent]).toBeUndefined();
    }
    // Nothing in the payload spells the original's path either.
    expect(JSON.stringify({ kind: out.kind })).not.toContain(ORIGINAL);
  });

  it("the adapter KNOWS the original at that very moment — it simply has nowhere to put it", () => {
    // Same input, same instant, via the internal helper: the information exists
    // in full. The loss is not ignorance, it is the absence of a return channel.
    const chain = resolveSourceChain(CITATION, DOCUMENTS);
    expect(chain).toMatchObject({ locator: ORIGINAL, original: ORIGINAL, via: CONVERTED });
    expect(chain.chain?.[0]).toMatchObject({ ref: ORIGINAL, bundled: true });
  });

  it("the header names the WRONG document after a hop — the caller's only handle is the stale ref", async () => {
    const bytes = new ArrayBuffer(16);
    stubFetch({
      "./sources/provenance.json": { body: JSON.stringify(SIDECAR) },
      [`./sources/${ORIGINAL}`]: { body: "", bytes, headers: { "content-type": "application/pdf" } },
    });

    const out = await resolveBundleSource(CITATION);

    // PDF bytes were delivered...
    expect(out.kind).toBe("pdf");
    // ...while the ref the viewer renders its header from still describes the
    // markdown intermediate, and resolveBundleSource did not mutate it.
    expect(CITATION.rawRef).toBe(CONVERTED);
    expect(CITATION.modality).toBe("ocr-markdown");
    expect(CITATION.rawRef).not.toBe(ORIGINAL);
  });
});

describe("ResolveSource seam — the defect is specific to the HOP", () => {
  it("without a hop the ref and the delivered document agree, so the header is right", async () => {
    stubFetch({
      "./sources/provenance.json": { body: JSON.stringify({ ...SIDECAR, documents: {} }) },
      [`./sources/${CONVERTED}`]: { body: "# OCR text", headers: { "content-type": "text/markdown" } },
    });

    const out = await resolveBundleSource({ rawRef: CONVERTED });
    expect(out).toEqual({ kind: "markdown", text: "# OCR text" });
    // No hop happened, so the citation's own locator IS the delivered document.
    expect(resolveSourceChain({ rawRef: CONVERTED }, {})).toMatchObject({
      locator: CONVERTED,
      via: null,
    });
  });

  it("an unbundled original degrades to the markdown and the header stays truthful", async () => {
    const documents = { [CONVERTED]: { ...DOCUMENTS[CONVERTED], bundled: false } };
    stubFetch({
      "./sources/provenance.json": { body: JSON.stringify({ ...SIDECAR, documents }) },
      [`./sources/${CONVERTED}`]: { body: "# OCR text", headers: { "content-type": "text/markdown" } },
    });

    expect(await resolveBundleSource({ rawRef: CONVERTED })).toEqual({
      kind: "markdown",
      text: "# OCR text",
    });
    // `original` is still NAMED — the breadcrumb survives even when we cannot open it.
    expect(resolveSourceChain({ rawRef: CONVERTED }, documents)).toMatchObject({
      locator: CONVERTED,
      original: ORIGINAL,
      via: null,
    });
  });

  it("pins the closed set of kinds the frame can be handed", async () => {
    const cases = [
      { file: ORIGINAL, headers: { "content-type": "application/pdf" }, kind: "pdf" },
      { file: "corpus/page.html", headers: { "content-type": "text/html" }, kind: "html" },
      { file: "corpus/notes.md", headers: { "content-type": "text/markdown" }, kind: "markdown" },
    ];
    for (const c of cases) {
      resetProvenanceCache();
      stubFetch({
        "./sources/provenance.json": { body: JSON.stringify({ ...SIDECAR, documents: {} }) },
        [`./sources/${c.file}`]: { body: "<p>x</p>", bytes: new ArrayBuffer(4), headers: c.headers },
      });
      const out = await resolveBundleSource({ rawRef: c.file });
      expect(out.kind).toBe(c.kind);
    }
  });
});
