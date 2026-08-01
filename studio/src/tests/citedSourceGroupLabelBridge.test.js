import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildSelectionThread,
  loadCitedSourceProvenance,
  resetProvenanceCache,
} from "../lib/citedSources.js";

/* ===========================================================================
 * A4 LOCAL BRIDGE — name the ORIGINAL document in the group label.
 *
 * The viewer's frame reads only `kind` from ResolveSource, so after a
 * provenance hop it renders a header describing the MARKDOWN INTERMEDIATE while
 * showing the ORIGINAL pdf (pinned in citedSourceResolverSeam.test.js). The
 * additive field that would fix this properly is a contract negotiation with
 * the lib's owner and is being carried separately.
 *
 * The bridge, meanwhile, uses the one channel we already own: the group label
 * the frame prefixes. Zero lib change, instantly reversible.
 *
 * CONTROL VETO, asserted below: `ref.rawRef` is NEVER rewritten. Rewriting it
 * would collapse the thread's document identity (`threadDocKey`), merging
 * distinct .md citations of one PDF into a single document group and
 * falsifying the provenance the chain exists to preserve.
 *
 * The bridge stays SILENT rather than guess: no provenance, no known original,
 * or a group spanning SEVERAL originals all leave the label exactly as it is
 * today. A label may only name a document when there is exactly one to name.
 * ======================================================================== */

const MD_A = ".graphify/converted/pdf/report_a1b2.md";
const MD_B = ".graphify/converted/pdf/report_c3d4.md";
const MD_OTHER = ".graphify/converted/pdf/annex_e5f6.md";
const PDF = "corpus/pdf/AM10014_R19.page-images.pdf";
const PDF_OTHER = "corpus/pdf/ANNEX_R2.pdf";

/** Two distinct converted markdowns of the SAME original — the veto's target. */
const DOCUMENTS = {
  [MD_A]: { original: PDF, conversion: "mistral-ocr-batch", via: "frontmatter", bundled: true },
  [MD_B]: { original: PDF, conversion: "mistral-ocr-batch", via: "frontmatter", bundled: true },
  [MD_OTHER]: { original: PDF_OTHER, conversion: "mistral-ocr-batch", via: "frontmatter", bundled: true },
};

const ONE_DOC = {
  id: "e:holmes",
  label: "Sherlock Holmes",
  citations: [
    { source_file: MD_A, page: 7, quote: "the detective rose at dawn" },
    { source_file: MD_B, page: 2, quote: "a violin sounded upstairs" },
  ],
};

const TWO_DOCS = {
  id: "e:watson",
  label: "John Watson",
  citations: [
    { source_file: MD_A, page: 1, quote: "Watson kept his revolver close" },
    { source_file: MD_OTHER, page: 3, quote: "the doctor wrote his notes" },
  ],
};

beforeEach(() => resetProvenanceCache());
afterEach(() => {
  vi.unstubAllGlobals();
  resetProvenanceCache();
});

describe("A4 bridge — the group label names the original when it can", () => {
  it("appends the original's basename when every ref resolves to ONE original", () => {
    const { groups } = buildSelectionThread([ONE_DOC], DOCUMENTS);
    expect(groups[0].label).toBe("Sherlock Holmes · AM10014_R19.page-images.pdf");
  });

  it("NEVER rewrites ref.rawRef — the CONTROL veto, and the two .md stay distinct", () => {
    const { groups } = buildSelectionThread([ONE_DOC], DOCUMENTS);
    const rawRefs = groups[0].refs.map((r) => r.rawRef);
    // Both intermediates survive under their own identity...
    expect(new Set(rawRefs)).toEqual(new Set([MD_A, MD_B]));
    // ...and neither was collapsed onto the shared original.
    expect(rawRefs).not.toContain(PDF);
  });

  it("keeps meta parallel and untouched", () => {
    const { groups, meta } = buildSelectionThread([ONE_DOC], DOCUMENTS);
    expect(meta[0].id).toBe("e:holmes");
    expect(meta[0].citations).toHaveLength(groups[0].refs.length);
    expect(meta[0].citations.map((c) => c.source_file).sort()).toEqual([MD_A, MD_B].sort());
  });
});

describe("A4 bridge — it stays silent rather than guess", () => {
  it("leaves the label alone when the group spans SEVERAL originals", () => {
    const { groups } = buildSelectionThread([TWO_DOCS], DOCUMENTS);
    expect(groups[0].label).toBe("John Watson");
  });

  it("leaves the label alone with no provenance at all — today's behaviour", () => {
    const { groups } = buildSelectionThread([ONE_DOC]);
    expect(groups[0].label).toBe("Sherlock Holmes");
  });

  it("leaves the label alone when provenance knows nothing of these documents", () => {
    const { groups } = buildSelectionThread([ONE_DOC], {});
    expect(groups[0].label).toBe("Sherlock Holmes");
  });

  it("leaves a null label null — the bridge decorates, it does not invent", () => {
    const anon = { ...ONE_DOC, label: null };
    const { groups } = buildSelectionThread([anon], DOCUMENTS);
    expect(groups[0].label).toBeNull();
  });

  it("stays silent when only SOME refs have a known original", () => {
    const mixed = {
      id: "e:mixed",
      label: "Mixed",
      citations: [
        { source_file: MD_A, page: 1, quote: "known" },
        { source_file: "corpus/loose.md", page: 2, quote: "unknown" },
      ],
    };
    expect(buildSelectionThread([mixed], DOCUMENTS).groups[0].label).toBe("Mixed");
  });
});

describe("A4 bridge — falls back to the loaded snapshot, like sourceHrefFor", () => {
  it("decorates with no provenance argument once the sidecar has loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ schema: "graphify_cited_source_provenance_v1", documents: DOCUMENTS }),
        text: async () => "",
      })),
    );
    await loadCitedSourceProvenance();
    const { groups } = buildSelectionThread([ONE_DOC]);
    expect(groups[0].label).toBe("Sherlock Holmes · AM10014_R19.page-images.pdf");
  });
});
