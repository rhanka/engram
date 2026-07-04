/**
 * `--include-sources` (cited-source viewer): the exporter copies the CITED
 * source documents into `<out>/sources/<project-relative-path>` so the served
 * bundle can open them. Opt-in, size-conscious (only cited files), missing
 * files warn without failing, unsafe locators are never mirrored.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildStaticStudio,
  collectCitedSourceFiles,
  normalizeSourceRelPath,
} from "../src/studio-export.js";

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

/**
 * A project root with a corpus + a .graphify state dir whose graph carries
 * citations pointing at project-root-relative source files (the graphify
 * `cite` convention), plus one missing file and one absolute locator.
 */
function makeProject(): { root: string; stateDir: string } {
  const root = mkdtempSync(join(tmpdir(), "graphify-proj-"));
  dirs.push(root);
  mkdirSync(join(root, "corpus"), { recursive: true });
  writeFileSync(join(root, "corpus", "report.pdf"), "%PDF-1.4 fake\n");
  writeFileSync(join(root, "corpus", "notes.md"), "# Notes\n\nA cited passage.\n");
  const stateDir = join(root, ".graphify");
  mkdirSync(join(stateDir, "ontology"), { recursive: true });
  const nodes = [
    {
      id: "a",
      label: "Alpha",
      type: "Character",
      source_file: "corpus/notes.md",
      citations: [
        { source_file: "corpus/report.pdf", page: 2, quote: "a cited passage" },
        { source_file: "corpus/notes.md", section: "Notes", quote: "A cited passage." },
        { source_file: "corpus/missing.md", section: "Gone", quote: "nope" },
        { source_file: "/etc/passwd", section: "evil" },
        { source_file: "../outside.md", section: "escape" },
      ],
    },
    { id: "b", label: "Beta", type: "Place" },
  ];
  writeFileSync(join(stateDir, "graph.json"), JSON.stringify({ nodes, links: [] }));
  // Level-2 sidecar citing one EXTRA file beyond the inline set.
  mkdirSync(join(root, "corpus", "extra"), { recursive: true });
  writeFileSync(join(root, "corpus", "extra", "appendix.md"), "# Appendix\n");
  writeFileSync(
    join(stateDir, "ontology", "citations.json"),
    JSON.stringify({
      schema: "graphify_ontology_citations_v1",
      nodes: { a: { citations: [{ source_file: "corpus/extra/appendix.md", section: "Appendix" }] } },
    }),
  );
  return { root, stateDir };
}

describe("collectCitedSourceFiles / normalizeSourceRelPath", () => {
  it("collects node.source_file + inline citations + sidecar (deep scan), deduped", () => {
    const files = collectCitedSourceFiles(
      [
        { source_file: "corpus/notes.md", citations: [{ source_file: "corpus/report.pdf" }] },
        { citations: [{ source_file: "corpus/notes.md" }] },
      ],
      { nodes: { a: { citations: [{ source_file: "corpus/extra/appendix.md" }] } } },
    );
    expect(files).toEqual(["corpus/extra/appendix.md", "corpus/notes.md", "corpus/report.pdf"]);
  });

  it("rejects absolute, URL and root-escaping locators", () => {
    expect(normalizeSourceRelPath("/etc/passwd")).toBeNull();
    expect(normalizeSourceRelPath("../outside.md")).toBeNull();
    expect(normalizeSourceRelPath("corpus/../../outside.md")).toBeNull();
    expect(normalizeSourceRelPath("https://example.com/a.pdf")).toBeNull();
    expect(normalizeSourceRelPath("./corpus/report.pdf")).toBe("corpus/report.pdf");
  });
});

describe("buildStaticStudio --include-sources", () => {
  it("is OFF by default: no sources/ dir, result.sources null", () => {
    const { stateDir } = makeProject();
    const outDir = mkdtempSync(join(tmpdir(), "graphify-out-"));
    dirs.push(outDir);
    const result = buildStaticStudio({ stateDir, outDir, spaDir: makeSpaDir(), singleFile: false });
    expect(result.sources).toBeNull();
    expect(existsSync(join(outDir, "sources"))).toBe(false);
  });

  it("copies cited files (incl. sidecar-only ones) under sources/, skips missing + unsafe", () => {
    const { root, stateDir } = makeProject();
    const outDir = mkdtempSync(join(tmpdir(), "graphify-out-"));
    dirs.push(outDir);
    const warnings: string[] = [];
    const result = buildStaticStudio({
      stateDir,
      outDir,
      spaDir: makeSpaDir(),
      singleFile: false,
      includeSources: true,
      sourcesRoot: root,
      onWarning: (m) => warnings.push(m),
    });
    expect(result.sources).not.toBeNull();
    // report.pdf + notes.md + extra/appendix.md copied.
    expect(result.sources!.copied).toBe(3);
    expect(readFileSync(join(outDir, "sources", "corpus", "report.pdf"), "utf-8")).toContain("%PDF");
    expect(existsSync(join(outDir, "sources", "corpus", "notes.md"))).toBe(true);
    expect(existsSync(join(outDir, "sources", "corpus", "extra", "appendix.md"))).toBe(true);
    // missing.md + /etc/passwd + ../outside.md are counted missing, never copied.
    expect(result.sources!.missing).toBe(3);
    expect(existsSync(join(outDir, "sources", "etc"))).toBe(false);
    expect(warnings.join("\n")).toMatch(/could not bundle 3 cited file/);
    expect(result.sources!.bytes).toBeGreaterThan(0);
  });

  it("defaults the sources root to the parent of the state dir", () => {
    const { stateDir } = makeProject();
    const outDir = mkdtempSync(join(tmpdir(), "graphify-out-"));
    dirs.push(outDir);
    const result = buildStaticStudio({
      stateDir,
      outDir,
      spaDir: makeSpaDir(),
      singleFile: false,
      includeSources: true,
      onWarning: () => {},
    });
    expect(result.sources!.copied).toBe(3);
  });

  it("wipes a stale sources/ dir on re-export without the flag", () => {
    const { root, stateDir } = makeProject();
    const outDir = mkdtempSync(join(tmpdir(), "graphify-out-"));
    dirs.push(outDir);
    const spaDir = makeSpaDir();
    buildStaticStudio({
      stateDir,
      outDir,
      spaDir,
      singleFile: false,
      includeSources: true,
      sourcesRoot: root,
      onWarning: () => {},
    });
    expect(existsSync(join(outDir, "sources"))).toBe(true);
    buildStaticStudio({ stateDir, outDir, spaDir, singleFile: false });
    expect(existsSync(join(outDir, "sources"))).toBe(false);
  });
});
