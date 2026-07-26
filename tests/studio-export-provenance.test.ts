/**
 * Studio export: the original -> converted -> citation chain.
 *
 * Citations of a PDF corpus point at `.graphify/converted/pdf/<stem>.md`, so the
 * bundle must carry the chain back to the PDF or the viewer can only ever open
 * the OCR transcript. The chain (`sources/provenance.json`) is emitted
 * UNCONDITIONALLY — it is a few short strings per document — while COPYING the
 * originals (which can be tens of GB) stays behind `--include-original-sources`.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildStaticStudio } from "../src/studio-export.js";
import { CITED_SOURCE_PROVENANCE_SCHEMA } from "../src/converted-provenance.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function makeSpaDir(): string {
  const spaDir = mkdtempSync(join(tmpdir(), "graphify-spa-"));
  dirs.push(spaDir);
  writeFileSync(
    join(spaDir, "index.html"),
    '<!doctype html><html><body><div id="app"></div>' +
      '<script type="module" src="./assets/index.js"></script></body></html>',
  );
  mkdirSync(join(spaDir, "assets"), { recursive: true });
  writeFileSync(join(spaDir, "assets", "index.js"), "/* app */\n");
  return spaDir;
}

const CONVERTED_REL = ".graphify/converted/pdf/paper-a1b2.md";

/**
 * A project whose graph cites ONE converted markdown (backed by a real PDF in
 * the corpus) and one hand-written markdown with no conversion behind it.
 */
function makeProject(): { root: string; stateDir: string } {
  const root = mkdtempSync(join(tmpdir(), "graphify-proj-"));
  dirs.push(root);
  mkdirSync(join(root, "corpus"), { recursive: true });
  const pdfPath = join(root, "corpus", "paper.pdf");
  writeFileSync(pdfPath, "%PDF-1.4 fake original\n");
  writeFileSync(join(root, "corpus", "notes.md"), "# Notes\n\nA cited passage.\n");

  const stateDir = join(root, ".graphify");
  const convertedDir = join(stateDir, "converted", "pdf");
  mkdirSync(convertedDir, { recursive: true });
  mkdirSync(join(stateDir, "ontology"), { recursive: true });
  writeFileSync(
    join(convertedDir, "paper-a1b2.md"),
    [
      "---",
      `graphify_source_file: ${JSON.stringify(pdfPath)}`,
      "graphify_conversion: mistral-ocr",
      "---",
      "",
      "# Page 1",
      "",
    ].join("\n"),
    "utf-8",
  );
  writeFileSync(
    join(convertedDir, "paper-a1b2.prep.json"),
    JSON.stringify({ source_file: pdfPath, provider: "mistral-ocr", status: "converted" }),
    "utf-8",
  );

  const nodes = [
    {
      id: "a",
      label: "Alpha",
      source_file: CONVERTED_REL,
      citations: [
        { source_file: CONVERTED_REL, page: 2, quote: "a cited passage" },
        { source_file: "corpus/notes.md", section: "Notes", quote: "A cited passage." },
      ],
    },
  ];
  writeFileSync(join(stateDir, "graph.json"), JSON.stringify({ nodes, links: [] }));
  return { root, stateDir };
}

function readProvenance(outDir: string): {
  schema: string;
  documents: Record<string, { original: string; conversion?: string; via: string; bundled: boolean }>;
} {
  return JSON.parse(readFileSync(join(outDir, "sources", "provenance.json"), "utf-8"));
}

function outDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-out-"));
  dirs.push(dir);
  return dir;
}

describe("buildStaticStudio — sources/provenance.json", () => {
  it("emits the chain with NO flag at all (recording is cheap, copying is not)", () => {
    const { stateDir } = makeProject();
    const out = outDir();
    const result = buildStaticStudio({
      stateDir,
      outDir: out,
      spaDir: makeSpaDir(),
      singleFile: false,
      onWarning: () => {},
    });
    expect(result.provenancePath).toBe(join(out, "sources", "provenance.json"));
    expect(result.provenanceCount).toBe(1);
    // No copy happened: only the sidecar lives under sources/.
    expect(result.sources).toBeNull();
    expect(result.originalSources).toBeNull();
    expect(existsSync(join(out, "sources", "corpus", "paper.pdf"))).toBe(false);

    const provenance = readProvenance(out);
    expect(provenance.schema).toBe(CITED_SOURCE_PROVENANCE_SCHEMA);
    expect(provenance.documents[CONVERTED_REL]).toEqual({
      original: "corpus/paper.pdf",
      conversion: "mistral-ocr",
      via: "prep-json",
      bundled: false,
    });
    // The hand-written markdown IS the original — no chain entry for it.
    expect(provenance.documents["corpus/notes.md"]).toBeUndefined();
  });

  it("copies the ORIGINAL documents and flips bundled with --include-original-sources", () => {
    const { stateDir } = makeProject();
    const out = outDir();
    const result = buildStaticStudio({
      stateDir,
      outDir: out,
      spaDir: makeSpaDir(),
      singleFile: false,
      includeOriginalSources: true,
      onWarning: () => {},
    });
    expect(result.originalSources).toEqual({
      copied: 1,
      missing: 0,
      bytes: result.originalSources!.bytes,
    });
    expect(result.originalSources!.bytes).toBeGreaterThan(0);
    expect(readFileSync(join(out, "sources", "corpus", "paper.pdf"), "utf-8")).toContain(
      "fake original",
    );
    expect(readProvenance(out).documents[CONVERTED_REL]!.bundled).toBe(true);
    // The CONVERTED markdown itself is not copied by this flag (that is
    // --include-sources' job).
    expect(existsSync(join(out, "sources", ".graphify"))).toBe(false);
  });

  it("combines with --include-sources: converted docs AND their originals", () => {
    const { stateDir } = makeProject();
    const out = outDir();
    const result = buildStaticStudio({
      stateDir,
      outDir: out,
      spaDir: makeSpaDir(),
      singleFile: false,
      includeSources: true,
      includeOriginalSources: true,
      onWarning: () => {},
    });
    expect(result.sources!.copied).toBe(2); // converted .md + corpus/notes.md
    expect(result.originalSources!.copied).toBe(1); // corpus/paper.pdf
    expect(existsSync(join(out, "sources", CONVERTED_REL))).toBe(true);
    expect(existsSync(join(out, "sources", "corpus", "paper.pdf"))).toBe(true);
    expect(existsSync(join(out, "sources", "provenance.json"))).toBe(true);
  });

  it("warns (never fails) when an original has been moved away", () => {
    const { root, stateDir } = makeProject();
    rmSync(join(root, "corpus", "paper.pdf"));
    const out = outDir();
    const warnings: string[] = [];
    const result = buildStaticStudio({
      stateDir,
      outDir: out,
      spaDir: makeSpaDir(),
      singleFile: false,
      includeOriginalSources: true,
      onWarning: (m) => warnings.push(m),
    });
    expect(result.originalSources).toEqual({ copied: 0, missing: 1, bytes: 0 });
    // The chain is still recorded — the breadcrumb survives the missing bytes.
    expect(result.provenanceCount).toBe(1);
    expect(readProvenance(out).documents[CONVERTED_REL]!.bundled).toBe(false);
    expect(warnings.join("\n")).toMatch(/--include-original-sources could not bundle 1/);
  });

  it("emits no sidecar for a corpus with no converted document", () => {
    const { root, stateDir } = makeProject();
    // Re-point the graph at the hand-written markdown only.
    writeFileSync(
      join(stateDir, "graph.json"),
      JSON.stringify({
        nodes: [{ id: "a", source_file: "corpus/notes.md", citations: [] }],
        links: [],
      }),
    );
    rmSync(join(root, ".graphify", "converted"), { recursive: true, force: true });
    const out = outDir();
    const result = buildStaticStudio({
      stateDir,
      outDir: out,
      spaDir: makeSpaDir(),
      singleFile: false,
      onWarning: () => {},
    });
    expect(result.provenancePath).toBeNull();
    expect(result.provenanceCount).toBe(0);
    expect(existsSync(join(out, "sources"))).toBe(false);
  });

  it("wipes a stale sources/ (sidecar included) on re-export", () => {
    const { stateDir } = makeProject();
    const out = outDir();
    const spaDir = makeSpaDir();
    buildStaticStudio({
      stateDir,
      outDir: out,
      spaDir,
      singleFile: false,
      includeOriginalSources: true,
      onWarning: () => {},
    });
    expect(existsSync(join(out, "sources", "corpus", "paper.pdf"))).toBe(true);
    buildStaticStudio({ stateDir, outDir: out, spaDir, singleFile: false, onWarning: () => {} });
    expect(existsSync(join(out, "sources", "corpus", "paper.pdf"))).toBe(false);
    // The chain itself is re-emitted (it is unconditional).
    expect(existsSync(join(out, "sources", "provenance.json"))).toBe(true);
  });
});
