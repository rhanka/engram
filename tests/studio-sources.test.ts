/**
 * WP4 — the LIVE `sources/` route (`graphify ontology studio`).
 *
 * The static export bundles cited documents at `sources/<rel>` next to a
 * `sources/provenance.json` chain, and the SPA's cited-source adapter fetches
 * exactly those. The live server served the same SPA with no such route, so the
 * whole provenance chain worked in an exported bundle and 404'd in the studio
 * running next to the actual corpus.
 *
 * These tests pin the two properties that make the live route trustworthy:
 *   - it serves the SAME documents the exporter would bundle, with a content
 *     type that is never `text/html` (the adapter reads an HTML body on a
 *     non-HTML locator as proof the server fell back to the SPA shell);
 *   - `bundled: true` is decided by whether THIS route can serve the file, so
 *     the chain can never promise an original the route would 404.
 */
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  __resetLiveProvenanceCache,
  buildLiveProvenance,
  resolveSourceFile,
  serveCitedSourceFile,
  serveStudioSource,
  sourceMimeFor,
  studioSourcePathname,
  studioSourceRoots,
} from "../src/studio-sources.js";

/**
 * A project laid out like a real converted-PDF corpus: an original PDF, the OCR
 * markdown that cites it, and the `.ocr.json` sidecar carrying the chain — the
 * exact shape of the ACLP corpus (which has no `.prep.json`).
 */
function makeProject(): { root: string; stateDir: string } {
  const root = mkdtempSync(join(tmpdir(), "graphify-live-sources-"));
  const stateDir = join(root, ".graphify");
  const convertedDir = join(stateDir, "converted", "pdf");
  mkdirSync(convertedDir, { recursive: true });
  mkdirSync(join(stateDir, "ontology"), { recursive: true });
  mkdirSync(join(root, "corpus"), { recursive: true });

  const originalAbs = join(root, "corpus", "report one.pdf");
  writeFileSync(originalAbs, "%PDF-1.7\nreal original bytes\n");

  const mdRel = ".graphify/converted/pdf/report_one_abc123.md";
  writeFileSync(
    join(convertedDir, "report_one_abc123.md"),
    `---\ngraphify_source_file: ${JSON.stringify(originalAbs)}\ngraphify_conversion: mistral-ocr\n---\n\nOCR transcript body\n`,
  );
  writeFileSync(
    join(convertedDir, "report_one_abc123.ocr.json"),
    JSON.stringify({
      schema: "graphify_pdf_ocr_pages_v1",
      source_file: originalAbs,
      model: "mistral-ocr-latest",
      pages: [],
    }),
  );

  writeFileSync(
    join(stateDir, "graph.json"),
    JSON.stringify({
      nodes: [
        {
          id: "work_a",
          source_file: mdRel,
          citations: [{ source_file: mdRel, page: 3, quote: "OCR transcript body" }],
        },
      ],
      edges: [],
    }),
  );
  return { root, stateDir };
}

afterEach(() => {
  __resetLiveProvenanceCache();
});

describe("studioSourcePathname", () => {
  it("matches the SPA-mounted and bare forms, and nothing else", () => {
    expect(studioSourcePathname("/sources/report.pdf")).toBe("report.pdf");
    expect(studioSourcePathname("/sources/a/b/c.pdf")).toBe("a/b/c.pdf");
    expect(studioSourcePathname("/sources/provenance.json")).toBe("provenance.json");
    expect(studioSourcePathname("/sources/")).toBeNull();
    expect(studioSourcePathname("/assets/index.js")).toBeNull();
    expect(studioSourcePathname("/api/ontology/graph.json")).toBeNull();
  });
});

describe("sourceMimeFor", () => {
  it("types a cited document by suffix and never guesses text/html", () => {
    expect(sourceMimeFor("corpus/a.pdf")).toBe("application/pdf");
    expect(sourceMimeFor("x/y.MD")).toBe("text/markdown; charset=utf-8");
    expect(sourceMimeFor("x/y.docx")).toContain("wordprocessingml");
    // Unknown suffixes fall back to octet-stream — NOT to text/html, which the
    // adapter would (correctly) reject as an SPA-shell fallback.
    expect(sourceMimeFor("x/y.weird")).toBe("application/octet-stream");
    expect(sourceMimeFor("x/y")).toBe("application/octet-stream");
  });

  it("still types a genuinely HTML source as HTML", () => {
    expect(sourceMimeFor("capture/page.html")).toBe("text/html; charset=utf-8");
  });
});

describe("resolveSourceFile", () => {
  it("resolves a project-relative locator against the roots, in order", () => {
    const { root, stateDir } = makeProject();
    const roots = studioSourceRoots(stateDir);
    expect(roots[0]).toBe(root);
    expect(resolveSourceFile("corpus/report one.pdf", roots)).toBe(
      join(root, "corpus", "report one.pdf"),
    );
    expect(resolveSourceFile(".graphify/converted/pdf/report_one_abc123.md", roots)).toBe(
      join(stateDir, "converted", "pdf", "report_one_abc123.md"),
    );
  });

  it("refuses traversal, absolute paths and URLs", () => {
    const { stateDir } = makeProject();
    const roots = studioSourceRoots(stateDir);
    expect(resolveSourceFile("../../etc/passwd", roots)).toBeNull();
    expect(resolveSourceFile("corpus/../../escape.pdf", roots)).toBeNull();
    expect(resolveSourceFile("/etc/passwd", roots)).toBeNull();
    expect(resolveSourceFile("https://example.com/x.pdf", roots)).toBeNull();
  });

  it("returns null for a directory, so a dir can never be served as a document", () => {
    const { stateDir } = makeProject();
    const roots = studioSourceRoots(stateDir);
    expect(resolveSourceFile("corpus", roots)).toBeNull();
  });
});

describe("serveCitedSourceFile", () => {
  it("serves the original PDF bytes with application/pdf", () => {
    const { stateDir } = makeProject();
    const roots = studioSourceRoots(stateDir);
    const result = serveCitedSourceFile("corpus/report one.pdf", roots);
    expect(result.status).toBe(200);
    expect(result.contentType).toBe("application/pdf");
    expect(Buffer.isBuffer(result.body)).toBe(true);
    expect(result.body.toString()).toContain("real original bytes");
  });

  it("404s a miss with a text/plain body — never the SPA shell", () => {
    const { stateDir } = makeProject();
    const roots = studioSourceRoots(stateDir);
    const result = serveCitedSourceFile("corpus/absent.pdf", roots);
    expect(result.status).toBe(404);
    expect(result.contentType).toBe("text/plain; charset=utf-8");
    expect(String(result.body)).not.toContain("<html");
  });
});

describe("buildLiveProvenance", () => {
  it("records the converted -> original chain and marks it servable", () => {
    const { stateDir } = makeProject();
    const roots = studioSourceRoots(stateDir);
    const { json, count } = buildLiveProvenance(stateDir, roots);
    const parsed = JSON.parse(json) as {
      schema: string;
      documents: Record<string, { original: string; via: string; bundled: boolean }>;
    };
    expect(parsed.schema).toBe("engram_cited_source_provenance_v1");
    expect(count).toBe(1);
    const entry = parsed.documents[".graphify/converted/pdf/report_one_abc123.md"];
    expect(entry).toBeDefined();
    expect(entry!.original).toBe("corpus/report one.pdf");
    // The `.ocr.json` sidecar outranks the frontmatter (first hit wins).
    expect(entry!.via).toBe("ocr-json");
    // LIVE: no copy is needed for the original to be openable, so the chain
    // hops by default — unlike a default static export.
    expect(entry!.bundled).toBe(true);
  });

  it("never claims `bundled` for an original this route cannot serve", () => {
    const root = mkdtempSync(join(tmpdir(), "graphify-live-sources-outside-"));
    const stateDir = join(root, ".graphify");
    const convertedDir = join(stateDir, "converted", "pdf");
    mkdirSync(convertedDir, { recursive: true });
    // An original OUTSIDE every root: recorded as a breadcrumb, never servable.
    const outside = join(tmpdir(), "graphify-outside-corpus-absent.pdf");
    const mdRel = ".graphify/converted/pdf/x_deadbeef.md";
    writeFileSync(
      join(convertedDir, "x_deadbeef.md"),
      `---\ngraphify_source_file: ${JSON.stringify(outside)}\ngraphify_conversion: unpdf\n---\nbody\n`,
    );
    writeFileSync(
      join(stateDir, "graph.json"),
      JSON.stringify({ nodes: [{ id: "n", citations: [{ source_file: mdRel }] }], edges: [] }),
    );
    const { json } = buildLiveProvenance(stateDir, studioSourceRoots(stateDir));
    const entry = (JSON.parse(json) as { documents: Record<string, { bundled: boolean }> })
      .documents[mdRel];
    expect(entry).toBeDefined();
    expect(entry!.bundled).toBe(false);
  });

  it("is memoized on the identity of its inputs, and refreshed when graph.json moves", () => {
    const { stateDir } = makeProject();
    const roots = studioSourceRoots(stateDir);
    const first = buildLiveProvenance(stateDir, roots);
    expect(buildLiveProvenance(stateDir, roots).json).toBe(first.json);
    // Rewriting graph.json without the citation drops the entry.
    writeFileSync(join(stateDir, "graph.json"), JSON.stringify({ nodes: [], edges: [] }));
    expect(buildLiveProvenance(stateDir, roots).count).toBe(0);
  });
});

describe("serveStudioSource", () => {
  it("synthesizes provenance.json on the route the adapter fetches", () => {
    const { stateDir } = makeProject();
    const result = serveStudioSource("provenance.json", stateDir);
    expect(result.status).toBe(200);
    expect(result.contentType).toBe("application/json; charset=utf-8");
    const parsed = JSON.parse(String(result.body)) as { documents: Record<string, unknown> };
    expect(Object.keys(parsed.documents)).toHaveLength(1);
  });

  it("serves the ORIGINAL the provenance chain hopped to", () => {
    const { stateDir } = makeProject();
    const chain = JSON.parse(String(serveStudioSource("provenance.json", stateDir).body)) as {
      documents: Record<string, { original: string }>;
    };
    const original = Object.values(chain.documents)[0]!.original;
    const served = serveStudioSource(original, stateDir);
    expect(served.status).toBe(200);
    expect(served.contentType).toBe("application/pdf");
  });

  it("honours an explicit sourcesRoot", () => {
    const { root, stateDir } = makeProject();
    // A root that does not contain the corpus cannot serve it.
    const elsewhere = mkdtempSync(join(tmpdir(), "graphify-live-sources-alt-"));
    expect(serveStudioSource("corpus/report one.pdf", stateDir, elsewhere).status).toBe(404);
    expect(serveStudioSource("corpus/report one.pdf", stateDir, root).status).toBe(200);
  });
});
