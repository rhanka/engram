/**
 * WP4 — MULTI-LEVEL grounding: web page -> PDF -> OCR markdown -> citation.
 *
 * The shipped chain was single-level: a cited markdown resolved to the one local
 * document it was converted from, and stopped. That is the whole story only for
 * a corpus somebody assembled by hand. A downloaded corpus has a rung above it —
 * the address the PDF came from — and the PROCESS_STD layout makes the point concrete:
 * its PDFs live under directories named after Google Drive file ids, so the web
 * origin is visibly right there and recorded nowhere.
 *
 * Two things are pinned here. That the ladder is WALKED (each rung tried as a
 * conversion first, then as an acquisition, which is terminal), and that the
 * right rung is PREFERRED: the citation carries a page, so the paginated PDF
 * wins over the HTML page it was published behind — even when both are in the
 * chain and both are openable.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildCitedSourceProvenance,
  preferredProvenanceLink,
  resolveAcquisitionOrigin,
  SOURCE_ORIGIN_SCHEMA,
  sourceOriginSidecarPath,
  writeSourceOriginSidecar,
  type ProvenanceLink,
} from "../src/converted-provenance.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "graphify-multilevel-"));
  dirs.push(root);
  mkdirSync(join(root, "corpus"), { recursive: true });
  mkdirSync(join(root, ".graphify", "converted", "pdf"), { recursive: true });
  return root;
}

/** Write a converted markdown pointing at `originalAbs`. */
function writeConverted(root: string, stem: string, originalAbs: string, conversion: string): string {
  const rel = `.graphify/converted/pdf/${stem}.md`;
  writeFileSync(
    join(root, rel),
    `---\ngraphify_source_file: ${JSON.stringify(originalAbs)}\ngraphify_conversion: ${conversion}\n---\n\nbody\n`,
  );
  return rel;
}

const roots = (root: string) => [root, join(root, ".graphify")];
/** Everything under the roots is openable, which is the live-server rule. */
const allBundled = () => true;

describe("writeSourceOriginSidecar / resolveAcquisitionOrigin", () => {
  it("round-trips the URL a downloaded artifact came from", () => {
    const root = makeRoot();
    const pdf = join(root, "corpus", "paper.pdf");
    writeFileSync(pdf, "%PDF-1.7\n");
    expect(writeSourceOriginSidecar(pdf, { source_url: "https://example.org/papers/42" })).toBe(true);
    // The suffix is APPENDED, so the artifact's own extension survives and the
    // sidecar cannot collide with a same-stem document of another type.
    expect(sourceOriginSidecarPath(pdf)).toBe(`${pdf}.origin.json`);
    expect(resolveAcquisitionOrigin(pdf)).toEqual({
      url: "https://example.org/papers/42",
      via: "origin-json",
    });
  });

  it("stamps the schema and survives a corrupt sidecar", () => {
    const root = makeRoot();
    const pdf = join(root, "corpus", "paper.pdf");
    writeFileSync(pdf, "%PDF\n");
    writeSourceOriginSidecar(pdf, { source_url: "https://example.org/x", retrieved_at: "2026-07-25T00:00:00.000Z" });
    const raw = JSON.parse(
      require("node:fs").readFileSync(sourceOriginSidecarPath(pdf), "utf-8"),
    ) as Record<string, unknown>;
    expect(raw.schema).toBe(SOURCE_ORIGIN_SCHEMA);
    expect(raw.retrieved_at).toBe("2026-07-25T00:00:00.000Z");

    writeFileSync(sourceOriginSidecarPath(pdf), "{ truncated");
    expect(resolveAcquisitionOrigin(pdf)).toBeNull();
  });

  it("reads a markdown's own frontmatter source_url (the ingest branches)", () => {
    const root = makeRoot();
    const md = join(root, "corpus", "captured.md");
    writeFileSync(md, "---\nsource_url: https://example.org/post\ntype: webpage\n---\n\n# Post\n");
    expect(resolveAcquisitionOrigin(md)).toEqual({
      url: "https://example.org/post",
      via: "frontmatter",
    });
  });

  it("ignores a frontmatter source_url that is not a URL", () => {
    const root = makeRoot();
    const md = join(root, "corpus", "weird.md");
    writeFileSync(md, "---\nsource_url: not a url at all\n---\n\nbody\n");
    expect(resolveAcquisitionOrigin(md)).toBeNull();
  });
});

describe("the PROCESS_STD chain: web -> pdf -> ocr markdown", () => {
  it("records both rungs and prefers the PDF over the web page", () => {
    const root = makeRoot();
    const pdf = join(root, "corpus", "paper.pdf");
    writeFileSync(pdf, "%PDF-1.7\n");
    writeSourceOriginSidecar(pdf, { source_url: "https://drive.example/file/1Eip4GEQ" });
    const cited = writeConverted(root, "paper_abc123", pdf, "mistral-ocr");

    const { documents } = buildCitedSourceProvenance([cited], {
      roots: roots(root),
      isBundled: allBundled,
    });
    const entry = documents[cited]!;
    expect(entry.chain).toEqual([
      {
        ref: "corpus/paper.pdf",
        kind: "file",
        via: "frontmatter",
        conversion: "mistral-ocr",
        bundled: true,
      },
      {
        ref: "https://drive.example/file/1Eip4GEQ",
        kind: "url",
        via: "origin-json",
        bundled: false,
      },
    ]);
    // The citation carries a page; only the PDF can go to it.
    expect(entry.preferred).toBe("corpus/paper.pdf");
    // Back-compat: the single-level fields describe the PREFERRED link, so a
    // consumer that never learned about `chain` still lands on the right doc.
    expect(entry.original).toBe("corpus/paper.pdf");
    expect(entry.bundled).toBe(true);
    expect(entry.via).toBe("frontmatter");
  });

  it("keeps preferring the PDF when a captured HTML page sits between them", () => {
    // pdf -> html capture -> url. The deepest OPENABLE file is the HTML, and it
    // must still lose: it has no page 3 for the citation to point at.
    const root = makeRoot();
    const html = join(root, "corpus", "landing.html");
    writeFileSync(html, "<!doctype html><p>landing</p>");
    writeSourceOriginSidecar(html, { source_url: "https://example.org/landing" });
    const pdf = join(root, "corpus", "paper.pdf");
    writeFileSync(pdf, "%PDF-1.7\n");
    writeFileSync(
      join(root, "corpus", "paper.prep.json"),
      JSON.stringify({ source_file: html, provider: "html-to-pdf" }),
    );
    const cited = writeConverted(root, "paper_abc123", pdf, "mistral-ocr");

    const { documents } = buildCitedSourceProvenance([cited], {
      roots: roots(root),
      isBundled: allBundled,
    });
    const entry = documents[cited]!;
    expect(entry.chain?.map((l) => l.ref)).toEqual([
      "corpus/paper.pdf",
      "corpus/landing.html",
      "https://example.org/landing",
    ]);
    expect(entry.preferred).toBe("corpus/paper.pdf");
  });

  it("falls back to the deepest openable file when nothing is paginated", () => {
    const root = makeRoot();
    const html = join(root, "corpus", "landing.html");
    writeFileSync(html, "<!doctype html><p>landing</p>");
    writeSourceOriginSidecar(html, { source_url: "https://example.org/landing" });
    const cited = writeConverted(root, "page_abc123", html, "html-to-markdown");

    const { documents } = buildCitedSourceProvenance([cited], {
      roots: roots(root),
      isBundled: allBundled,
    });
    expect(documents[cited]!.preferred).toBe("corpus/landing.html");
  });

  it("omits `chain` entirely for an ordinary single-rung corpus", () => {
    // The overwhelmingly common case must produce EXACTLY the payload it
    // produced before multi-level existed.
    const root = makeRoot();
    const pdf = join(root, "corpus", "paper.pdf");
    writeFileSync(pdf, "%PDF-1.7\n");
    const cited = writeConverted(root, "paper_abc123", pdf, "unpdf");

    const { documents } = buildCitedSourceProvenance([cited], {
      roots: roots(root),
      isBundled: allBundled,
    });
    expect(documents[cited]).toEqual({
      original: "corpus/paper.pdf",
      conversion: "unpdf",
      via: "frontmatter",
      bundled: true,
    });
  });
});

describe("walk safety", () => {
  it("stops on a cycle instead of spinning", () => {
    const root = makeRoot();
    const a = join(root, ".graphify", "converted", "pdf", "a.md");
    const b = join(root, ".graphify", "converted", "pdf", "b.md");
    writeFileSync(a, `---\ngraphify_source_file: ${JSON.stringify(b)}\n---\nA\n`);
    writeFileSync(b, `---\ngraphify_source_file: ${JSON.stringify(a)}\n---\nB\n`);
    const cited = ".graphify/converted/pdf/a.md";

    const { documents } = buildCitedSourceProvenance([cited], {
      roots: roots(root),
      isBundled: allBundled,
    });
    // b is reached once; the hop back to a is refused as already-visited, so the
    // ladder is one rung long and `chain` is (correctly) omitted.
    expect(documents[cited]!.original).toBe(".graphify/converted/pdf/b.md");
    expect(documents[cited]!.chain).toBeUndefined();
  });

  it("caps a long ladder rather than walking it forever", () => {
    const root = makeRoot();
    const dir = join(root, ".graphify", "converted", "pdf");
    // 0 <- 1 <- 2 <- … : each level converted from the next.
    for (let i = 0; i < 14; i += 1) {
      writeFileSync(
        join(dir, `lvl${i}.md`),
        `---\ngraphify_source_file: ${JSON.stringify(join(dir, `lvl${i + 1}.md`))}\n---\nL${i}\n`,
      );
    }
    writeFileSync(join(dir, "lvl14.md"), "no frontmatter\n");
    const cited = ".graphify/converted/pdf/lvl0.md";

    const { documents } = buildCitedSourceProvenance([cited], {
      roots: roots(root),
      isBundled: allBundled,
    });
    expect(documents[cited]!.chain).toHaveLength(8);
  });
});

describe("preferredProvenanceLink", () => {
  const link = (over: Partial<ProvenanceLink>): ProvenanceLink => ({
    ref: "x",
    kind: "file",
    via: "frontmatter",
    ...over,
  });

  it("prefers an unopenable file over a URL", () => {
    const chosen = preferredProvenanceLink([
      link({ ref: "corpus/a.pdf", bundled: false }),
      link({ ref: "https://x/y", kind: "url", bundled: false }),
    ]);
    expect(chosen?.ref).toBe("corpus/a.pdf");
  });

  it("returns null for an empty chain", () => {
    expect(preferredProvenanceLink([])).toBeNull();
  });

  it("returns the URL when it is the only rung", () => {
    const chosen = preferredProvenanceLink([link({ ref: "https://x/y", kind: "url" })]);
    expect(chosen?.ref).toBe("https://x/y");
  });
});
