import { describe, expect, it } from "vitest";
import { citationKey, unionCitations } from "../src/citations.js";
import { citationToCitedSourceRef, validateCitedSourceRef } from "../src/cited-source-refs.js";
import type { OntologyCitation } from "../src/types.js";

describe("cited-source refs projection", () => {
  it("projects Graphify citations to Radar-compatible PDF refs", () => {
    const citation: OntologyCitation = {
      source_file: "proces-verbaux/montreal.pdf",
      source_url: "https://example.test/pv.pdf",
      rawRef: "raw/proces-verbaux-montreal/cas/abc.pdf",
      docSha: "abc",
      page: "12",
      bbox: [0.1, 0.2, 0.3, 0.4],
      quote: "verbatim excerpt",
      quoteSpan: [10, 27],
      modality: "pdf",
    };

    expect(citationToCitedSourceRef(citation)).toEqual({
      docSha: "abc",
      rawRef: "raw/proces-verbaux-montreal/cas/abc.pdf",
      sourceUrl: "https://example.test/pv.pdf",
      page: 12,
      bbox: [0.1, 0.2, 0.3, 0.4],
      excerpt: "verbatim excerpt",
      citation: "verbatim excerpt",
      quoteSpan: [10, 27],
    });
  });

  it("keeps page+excerpt fallback when bbox is unavailable", () => {
    const citation: OntologyCitation = {
      source_file: "ocr.md",
      rawRef: "raw/doc.pdf",
      page: 3,
      excerpt: "fallback text",
    };

    expect(citationToCitedSourceRef(citation)).toEqual({
      rawRef: "raw/doc.pdf",
      page: 3,
      excerpt: "fallback text",
    });
  });

  it("validates Radar completeness semantics", () => {
    expect(
      validateCitedSourceRef({
        rawRef: "raw/proces-verbaux-test/cas/synthetic.pdf",
        docSha: "synthetic-sha256",
        page: 1,
        bbox: [0.1, 0.2, 0.3, 0.4],
        excerpt: "safe excerpt",
      }),
    ).toEqual({ ok: true, errors: [] });

    expect(validateCitedSourceRef({ rawRef: "raw/doc.pdf", page: 2, excerpt: "page-level proof" })).toEqual({
      ok: true,
      errors: [],
    });
  });

  it("rejects incomplete or non-normalized Radar refs", () => {
    expect(validateCitedSourceRef({ sourceUrl: "https://example.test/doc.pdf", page: 0, excerpt: "x" }).errors).toContain(
      "page must be a 1-based integer",
    );
    expect(validateCitedSourceRef({ page: 1, excerpt: "x" }).errors).toContain(
      "missing locator: expected rawRef, sourceUrl, or docSha",
    );
    expect(validateCitedSourceRef({ rawRef: "raw/doc.pdf", page: 1 }).errors).toContain(
      "missing evidence text: expected excerpt or citation",
    );
    expect(validateCitedSourceRef({ rawRef: "raw/doc.pdf", page: 1, excerpt: "x", bbox: [0, 0.2, 1.2, 0.4] }).errors).toContain(
      "bbox must be normalized [x0,y0,x1,y1] page fractions with finite 0..1 values",
    );
  });

  it("does not let viewer-only fields change citation identity", () => {
    const base: OntologyCitation = { source_file: "doc.pdf", page: 1, section: "s", paragraph_id: "p" };
    const enriched: OntologyCitation = {
      ...base,
      rawRef: "raw/doc.pdf",
      docSha: "sha",
      sourceUrl: "https://example.test/doc.pdf",
      modality: "pdf",
      region: [0, 0, 1, 1],
      quote: "quote",
      excerpt: "quote",
      quoteSpan: [0, 5],
    };

    expect(citationKey(enriched)).toBe(citationKey(base));
    expect(unionCitations([[base], [enriched]])).toHaveLength(1);
  });

  it("requires a page for page-addressable modalities (pdf)", () => {
    const result = validateCitedSourceRef({ rawRef: "raw/doc.pdf", modality: "pdf", excerpt: "verbatim" });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("page must be a 1-based integer");
  });

  it("accepts md/txt/web refs without a page (locator + section/paragraph_id + excerpt)", () => {
    // markdown — anchored by section, no page
    expect(
      validateCitedSourceRef({
        rawRef: "raw/notes.md",
        docSha: "md-sha",
        modality: "markdown",
        section: "Background",
        excerpt: "grounded passage",
      }),
    ).toEqual({ ok: true, errors: [] });

    // plain-text — anchored by paragraph_id, citation as evidence
    expect(
      validateCitedSourceRef({
        sourceUrl: "https://example.test/story.txt",
        modality: "plain-text",
        paragraph_id: "p-42",
        citation: "chapter quote",
      }).ok,
    ).toBe(true);

    // web — anchored by section, no page
    expect(
      validateCitedSourceRef({
        sourceUrl: "https://example.test/article",
        modality: "web",
        section: "Methods",
        excerpt: "web passage",
      }).ok,
    ).toBe(true);
  });

  it("requires a section/paragraph anchor for non-page modalities", () => {
    const result = validateCitedSourceRef({ rawRef: "raw/notes.md", modality: "markdown", excerpt: "passage" });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("missing anchor: expected section or paragraph_id for non-page modalities");
  });

  it("still validates bbox normalization when present, including non-page modalities", () => {
    const result = validateCitedSourceRef({
      rawRef: "raw/notes.md",
      modality: "markdown",
      section: "Background",
      excerpt: "passage",
      bbox: [0, 0, 1.5, 1],
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("bbox must be normalized [x0,y0,x1,y1] page fractions with finite 0..1 values");
  });

  it("derives page-addressability from the locator suffix when modality is absent", () => {
    // .pdf locator, no modality → page required
    expect(validateCitedSourceRef({ rawRef: "raw/x.pdf", excerpt: "q" }).errors).toContain(
      "page must be a 1-based integer",
    );
    // .md locator, no modality → lenient (no page), valid with a section anchor
    expect(validateCitedSourceRef({ rawRef: "raw/x.md", section: "S", excerpt: "q" }).ok).toBe(true);
  });
});
