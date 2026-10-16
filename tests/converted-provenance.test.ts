/**
 * Provenance of a CONVERTED document (original PDF -> converted markdown ->
 * citation). The converter records the original path in up to three carriers
 * (`<stem>.prep.json`, `<stem>.ocr.json`, the markdown's own frontmatter) and a
 * field corpus routinely has only SOME of them, so the resolver is exercised
 * carrier by carrier, on their precedence, and on every degenerate shape
 * (absent, truncated, hand-edited) — none of which may throw.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildCitedSourceProvenance,
  parseConvertedFrontmatter,
  relativizeToRoots,
  resolveConvertedOrigin,
  CITED_SOURCE_PROVENANCE_SCHEMA,
  PROVENANCE_SIDECAR_RELPATH,
} from "../src/converted-provenance.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function makeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-provenance-"));
  dirs.push(dir);
  return dir;
}

/** The frontmatter block `pdf-ocr.ts` prepends to a converted markdown. */
function frontmatter(sourceFile: string, conversion: string): string {
  return ["---", `graphify_source_file: ${JSON.stringify(sourceFile)}`, `graphify_conversion: ${conversion}`, "---", "", "# Page 1", ""].join("\n");
}

/** A converted markdown with any subset of its three provenance carriers. */
function makeConverted(
  dir: string,
  stem: string,
  carriers: {
    prep?: string | object;
    ocr?: string | object;
    front?: { source: string; conversion?: string } | string;
  },
): string {
  const markdownPath = join(dir, `${stem}.md`);
  const body =
    typeof carriers.front === "string"
      ? carriers.front
      : carriers.front
        ? frontmatter(carriers.front.source, carriers.front.conversion ?? "mistral-ocr")
        : "# Page 1\n";
  writeFileSync(markdownPath, body, "utf-8");
  if (carriers.prep !== undefined) {
    writeFileSync(
      join(dir, `${stem}.prep.json`),
      typeof carriers.prep === "string" ? carriers.prep : JSON.stringify(carriers.prep, null, 2),
      "utf-8",
    );
  }
  if (carriers.ocr !== undefined) {
    writeFileSync(
      join(dir, `${stem}.ocr.json`),
      typeof carriers.ocr === "string" ? carriers.ocr : JSON.stringify(carriers.ocr, null, 2),
      "utf-8",
    );
  }
  return markdownPath;
}

describe("resolveConvertedOrigin — carriers", () => {
  it("reads the original from <stem>.prep.json (provider = conversion label)", () => {
    const dir = makeDir();
    const md = makeConverted(dir, "paper", {
      prep: {
        source_file: "/corpus/paper.pdf",
        markdown_path: join(dir, "paper.md"),
        provider: "unpdf",
        mode: "auto",
        status: "converted",
      },
    });
    expect(resolveConvertedOrigin(md)).toEqual({
      original: "/corpus/paper.pdf",
      conversion: "unpdf",
      via: "prep-json",
    });
  });

  it("reads the original from <stem>.ocr.json when prep.json is absent", () => {
    const dir = makeDir();
    const md = makeConverted(dir, "scan", {
      ocr: { source_file: "/corpus/scan.pdf", sha256: "abc", model: "mistral-ocr-latest", pages: [] },
    });
    // The OCR sidecar names a MODEL, not a conversion pipeline, and there is no
    // frontmatter here to fill the label — the path still resolves.
    expect(resolveConvertedOrigin(md)).toEqual({
      original: "/corpus/scan.pdf",
      via: "ocr-json",
    });
  });

  it("labels an ocr-json hit from the markdown frontmatter when both are present", () => {
    const dir = makeDir();
    // The real-world aclp-am shape: prep.json absent, ocr.json + frontmatter present.
    const md = makeConverted(dir, "scan", {
      ocr: { source_file: "/corpus/scan.pdf", sha256: "abc", model: "mistral-ocr-latest", pages: [] },
      front: { source: "/corpus/scan.pdf", conversion: "mistral-ocr-batch" },
    });
    expect(resolveConvertedOrigin(md)).toEqual({
      original: "/corpus/scan.pdf",
      conversion: "mistral-ocr-batch",
      via: "ocr-json",
    });
  });

  it("reads the original from the markdown frontmatter alone", () => {
    const dir = makeDir();
    const md = makeConverted(dir, "text", {
      front: { source: "/corpus/text.pdf", conversion: "pdftotext" },
    });
    expect(resolveConvertedOrigin(md)).toEqual({
      original: "/corpus/text.pdf",
      conversion: "pdftotext",
      via: "frontmatter",
    });
  });
});

describe("resolveConvertedOrigin — precedence", () => {
  it("prefers prep.json over ocr.json over frontmatter", () => {
    const dir = makeDir();
    const md = makeConverted(dir, "all", {
      prep: { source_file: "/corpus/from-prep.pdf", provider: "mistral-ocr" },
      ocr: { source_file: "/corpus/from-ocr.pdf", pages: [] },
      front: { source: "/corpus/from-front.pdf", conversion: "unpdf" },
    });
    expect(resolveConvertedOrigin(md)).toEqual({
      original: "/corpus/from-prep.pdf",
      conversion: "mistral-ocr",
      via: "prep-json",
    });

    rmSync(join(dir, "all.prep.json"));
    expect(resolveConvertedOrigin(md)).toEqual({
      original: "/corpus/from-ocr.pdf",
      conversion: "unpdf",
      via: "ocr-json",
    });

    rmSync(join(dir, "all.ocr.json"));
    expect(resolveConvertedOrigin(md)).toEqual({
      original: "/corpus/from-front.pdf",
      conversion: "unpdf",
      via: "frontmatter",
    });
  });

  it("falls through a prep.json that carries no source_file", () => {
    const dir = makeDir();
    const md = makeConverted(dir, "partial", {
      prep: { provider: "none", status: "skipped", reason: "missing_mistral_api_key" },
      front: { source: "/corpus/partial.pdf", conversion: "unpdf" },
    });
    expect(resolveConvertedOrigin(md)?.via).toBe("frontmatter");
  });
});

describe("resolveConvertedOrigin — degrades, never throws", () => {
  it("returns null for a markdown with no provenance at all", () => {
    const dir = makeDir();
    const md = makeConverted(dir, "plain", {});
    expect(resolveConvertedOrigin(md)).toBeNull();
  });

  it("returns null for a file that does not exist", () => {
    const dir = makeDir();
    expect(resolveConvertedOrigin(join(dir, "ghost.md"))).toBeNull();
  });

  it("returns null for a non-markdown path (a cited PDF is already the original)", () => {
    const dir = makeDir();
    const pdf = join(dir, "paper.pdf");
    writeFileSync(pdf, "%PDF-1.4\n");
    expect(resolveConvertedOrigin(pdf)).toBeNull();
  });

  it("survives corrupt sidecars and still uses the surviving carrier", () => {
    const dir = makeDir();
    const md = makeConverted(dir, "corrupt", {
      prep: "{ this is not json",
      ocr: "",
      front: { source: "/corpus/corrupt.pdf", conversion: "mistral-ocr" },
    });
    expect(resolveConvertedOrigin(md)).toEqual({
      original: "/corpus/corrupt.pdf",
      conversion: "mistral-ocr",
      via: "frontmatter",
    });
  });

  it("returns null (no throw) when every carrier is corrupt", () => {
    const dir = makeDir();
    const md = makeConverted(dir, "wrecked", {
      prep: "not json at all",
      ocr: "[1,2,3]",
      front: "---\ngraphify_source_file:\n---\n\nbody\n",
    });
    expect(resolveConvertedOrigin(md)).toBeNull();
  });

  it("ignores a `---` rule further down the body (only the LEADING block counts)", () => {
    const dir = makeDir();
    const md = makeConverted(dir, "rule", {
      front: "# Title\n\n---\ngraphify_source_file: \"/corpus/not-metadata.pdf\"\n---\n",
    });
    expect(resolveConvertedOrigin(md)).toBeNull();
  });
});

describe("parseConvertedFrontmatter", () => {
  it("decodes a JSON-quoted path with spaces and non-ASCII characters", () => {
    const original = "/home/user/Mes Documents/Étude sur l'« affaire » (2019).pdf";
    const parsed = parseConvertedFrontmatter(frontmatter(original, "mistral-ocr"));
    expect(parsed.source_file).toBe(original);
    expect(parsed.conversion).toBe("mistral-ocr");
  });

  it("resolves a converted markdown whose original path has spaces and accents", () => {
    const dir = makeDir();
    const original = "/corpus/Rapport final — édition 2020 (relu).pdf";
    const md = makeConverted(dir, "accents", { front: { source: original } });
    expect(resolveConvertedOrigin(md)?.original).toBe(original);
  });

  it("accepts bare (unquoted) values", () => {
    const parsed = parseConvertedFrontmatter(
      "---\ngraphify_source_file: /corpus/bare.pdf\ngraphify_conversion: unpdf\n---\n\nbody\n",
    );
    expect(parsed).toEqual({ source_file: "/corpus/bare.pdf", conversion: "unpdf" });
  });

  it("tolerates CRLF line endings and a UTF-8 BOM", () => {
    const parsed = parseConvertedFrontmatter(
      "﻿---\r\ngraphify_source_file: \"/corpus/crlf.pdf\"\r\ngraphify_conversion: unpdf\r\n---\r\n",
    );
    expect(parsed.source_file).toBe("/corpus/crlf.pdf");
  });

  it("returns nothing when the document has no leading block", () => {
    expect(parseConvertedFrontmatter("# Just a title\n")).toEqual({});
  });
});

describe("relativizeToRoots", () => {
  it("expresses the original relative to the FIRST containing root", () => {
    const root = makeDir();
    const state = join(root, ".graphify");
    expect(relativizeToRoots(join(root, "corpus", "a.pdf"), [root, state])).toBe("corpus/a.pdf");
    // Under the state dir: the project root still contains it, so it wins.
    expect(relativizeToRoots(join(state, "converted", "b.md"), [root, state])).toBe(
      ".graphify/converted/b.md",
    );
    // Root order decides when only the second root contains the file.
    const other = makeDir();
    expect(relativizeToRoots(join(other, "c.pdf"), [root, other])).toBe("c.pdf");
  });

  it("keeps an original that escapes every root ABSOLUTE (still a breadcrumb)", () => {
    const root = makeDir();
    const outside = makeDir();
    const target = join(outside, "archive", "old.pdf");
    expect(relativizeToRoots(target, [root])).toBe(target);
  });
});

describe("buildCitedSourceProvenance", () => {
  /**
   * A project root with a converted markdown (frontmatter + prep.json) whose
   * original lives in the corpus, plus a hand-written markdown carrying no
   * conversion at all.
   */
  function makeProject(): { root: string; convertedRel: string } {
    const root = makeDir();
    mkdirSync(join(root, "corpus"), { recursive: true });
    writeFileSync(join(root, "corpus", "paper.pdf"), "%PDF-1.4 fake\n");
    writeFileSync(join(root, "corpus", "notes.md"), "# Notes\n");
    const convertedDir = join(root, ".graphify", "converted", "pdf");
    mkdirSync(convertedDir, { recursive: true });
    makeConverted(convertedDir, "paper-a1b2", {
      prep: { source_file: join(root, "corpus", "paper.pdf"), provider: "mistral-ocr" },
      front: { source: join(root, "corpus", "paper.pdf"), conversion: "mistral-ocr" },
    });
    return { root, convertedRel: ".graphify/converted/pdf/paper-a1b2.md" };
  }

  it("maps a cited converted locator to its original, skipping non-converted ones", () => {
    const { root, convertedRel } = makeProject();
    const result = buildCitedSourceProvenance(
      [convertedRel, "corpus/notes.md", "corpus/does-not-exist.md", "https://example.com/a.pdf"],
      { roots: [root] },
    );
    expect(result.schema).toBe(CITED_SOURCE_PROVENANCE_SCHEMA);
    expect(Object.keys(result.documents)).toEqual([convertedRel]);
    expect(result.documents[convertedRel]).toEqual({
      original: "corpus/paper.pdf",
      conversion: "mistral-ocr",
      via: "prep-json",
      bundled: false,
    });
  });

  it("reports bundled per original, from the caller's bundle predicate", () => {
    const { root, convertedRel } = makeProject();
    const bundledSet = new Set(["corpus/paper.pdf"]);
    const yes = buildCitedSourceProvenance([convertedRel], {
      roots: [root],
      isBundled: (rel) => bundledSet.has(rel),
    });
    expect(yes.documents[convertedRel]!.bundled).toBe(true);
    const no = buildCitedSourceProvenance([convertedRel], {
      roots: [root],
      isBundled: () => false,
    });
    expect(no.documents[convertedRel]!.bundled).toBe(false);
  });

  it("records an out-of-root original as ABSOLUTE and never bundled", () => {
    const root = makeDir();
    const outside = makeDir();
    const convertedDir = join(root, ".graphify", "converted", "pdf");
    mkdirSync(convertedDir, { recursive: true });
    const outsidePdf = join(outside, "archive.pdf");
    writeFileSync(outsidePdf, "%PDF-1.4 fake\n");
    makeConverted(convertedDir, "archive-c3d4", { front: { source: outsidePdf, conversion: "unpdf" } });
    const rel = ".graphify/converted/pdf/archive-c3d4.md";
    const result = buildCitedSourceProvenance([rel], {
      roots: [root],
      // Would return true for anything — an absolute original must never consult it.
      isBundled: () => true,
    });
    expect(result.documents[rel]).toEqual({
      original: outsidePdf,
      conversion: "unpdf",
      via: "frontmatter",
      bundled: false,
    });
  });

  it("resolves locators against the roots in order and dedupes", () => {
    const { root, convertedRel } = makeProject();
    const stateDir = join(root, ".graphify");
    // Cited as `converted/pdf/...` (state-dir-relative) — the second root answers.
    const stateRel = "converted/pdf/paper-a1b2.md";
    const result = buildCitedSourceProvenance([convertedRel, stateRel, ` ${convertedRel} `], {
      roots: [root, stateDir],
    });
    expect(Object.keys(result.documents).sort()).toEqual([convertedRel, stateRel].sort());
    expect(result.documents[stateRel]!.original).toBe("corpus/paper.pdf");
  });

  it("emits an empty document map (no throw) for a corpus with no conversions", () => {
    const { root } = makeProject();
    const result = buildCitedSourceProvenance(["corpus/notes.md"], { roots: [root] });
    expect(result.documents).toEqual({});
    expect(PROVENANCE_SIDECAR_RELPATH).toBe("sources/provenance.json");
  });
});
