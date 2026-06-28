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
});
