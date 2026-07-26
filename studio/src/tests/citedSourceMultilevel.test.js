/**
 * WP4 — the studio adapter against a MULTI-LEVEL provenance chain.
 *
 * The sidecar can now describe a ladder (web page -> PDF -> OCR markdown), with
 * the exporter naming the rung a viewer should present. The adapter's job is to
 * honour that choice, expose the rest as a breadcrumb, and — the part that was
 * broken — make the "Ouvrir ↗" toolbar link agree with the document rendered
 * beneath it.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import {
  loadCitedSourceProvenance,
  resetProvenanceCache,
  resolveSourceChain,
  sourceHrefFor,
} from "../lib/citedSources.js";

const CITED = ".graphify/converted/pdf/paper_abc123.md";
const PDF = "corpus/paper.pdf";
const PAGE = "https://drive.example/file/1Eip4GEQ";

/** A three-rung chain whose preferred target is the PDF, not the web page. */
const MULTILEVEL = {
  schema: "graphify_cited_source_provenance_v1",
  documents: {
    [CITED]: {
      original: PDF,
      conversion: "mistral-ocr",
      via: "frontmatter",
      bundled: true,
      preferred: PDF,
      chain: [
        { ref: PDF, kind: "file", via: "frontmatter", conversion: "mistral-ocr", bundled: true },
        { ref: PAGE, kind: "url", via: "origin-json", bundled: false },
      ],
    },
  },
};

beforeEach(() => {
  resetProvenanceCache();
});

afterEach(() => {
  resetProvenanceCache();
  vi.unstubAllGlobals();
});

describe("resolveSourceChain over a multi-level ladder", () => {
  it("presents the PDF and keeps the web page as a breadcrumb", () => {
    const chain = resolveSourceChain({ rawRef: CITED }, MULTILEVEL.documents);
    expect(chain.locator).toBe(PDF);
    expect(chain.original).toBe(PDF);
    // The markdown it hopped OVER.
    expect(chain.via).toBe(CITED);
    // The whole ladder is available for display, web rung included.
    expect(chain.chain.map((l) => l.ref)).toEqual([PDF, PAGE]);
    expect(chain.chain[1]).toMatchObject({ kind: "url", bundled: false });
  });

  it("does not hop when the preferred document is not openable", () => {
    const docs = {
      [CITED]: { ...MULTILEVEL.documents[CITED], bundled: false },
    };
    const chain = resolveSourceChain({ rawRef: CITED }, docs);
    expect(chain.locator).toBe(CITED);
    // Still reports where it came from, both rungs.
    expect(chain.original).toBe(PDF);
    expect(chain.chain.map((l) => l.ref)).toEqual([PDF, PAGE]);
  });
});

describe('sourceHrefFor — the "Ouvrir ↗" link', () => {
  it("falls back to the cited locator before provenance has loaded", () => {
    expect(sourceHrefFor({ rawRef: CITED })).toBe(
      `./sources/${CITED.split("/").map(encodeURIComponent).join("/")}`,
    );
  });

  it("points at the ORIGINAL once provenance is loaded, with no argument passed", async () => {
    // The viewer passes this prop by reference and calls it with ONE argument,
    // so the fix has to work without the caller supplying the map.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => MULTILEVEL,
      })),
    );
    await loadCitedSourceProvenance();

    expect(sourceHrefFor({ rawRef: CITED })).toBe(
      `./sources/${PDF.split("/").map(encodeURIComponent).join("/")}`,
    );
  });

  it("still honours an explicitly supplied map", () => {
    expect(sourceHrefFor({ rawRef: CITED }, MULTILEVEL.documents)).toBe(
      `./sources/${PDF.split("/").map(encodeURIComponent).join("/")}`,
    );
  });
});
