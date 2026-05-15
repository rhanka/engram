import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Graph from "graphology";
import { toHtml } from "../src/export.js";
import { safeToHtml } from "../src/html-export.js";

describe("safeToHtml", () => {
  it("removes stale HTML and returns a warning when optional export fails", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-html-export-"));
    const htmlPath = join(dir, "graph.html");
    writeFileSync(htmlPath, "stale html", "utf-8");
    const warnings: string[] = [];

    const G = new Graph();
    G.addNode("a", { label: "A" });
    const communities = new Map([[0, ["a"]]]);

    const result = safeToHtml(G, communities, htmlPath, {}, {
      onWarning: (message) => warnings.push(message),
      writer: () => {
        throw new Error("too large");
      },
    });

    expect(result).toBeUndefined();
    expect(existsSync(htmlPath)).toBe(false);
    expect(warnings).toEqual(["HTML export skipped: too large"]);

    rmSync(dir, { recursive: true, force: true });
  });

  it("renders aggregated community member counts when provided", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-html-export-"));
    const htmlPath = join(dir, "graph.html");

    const G = new Graph();
    G.addNode("a", { label: "A", source_file: "src/a.ts", file_type: "code" });
    const communities = new Map([[0, ["a"]]]);

    toHtml(G, communities, htmlPath, {
      communityLabels: new Map([[0, "Core"]]),
      memberCounts: new Map([[0, 7]]),
    });

    const html = readFileSync(htmlPath, "utf-8");
    expect(html).toContain("\"count\":7");
    expect(html).toContain("select-all-cb");
    expect(html).toContain("legend-cb");
    expect(html).toContain("updateSelectAllState");
    expect(html).toContain("toggleAllCommunities");
    expect(html).not.toContain("Show All");
    expect(html).not.toContain("Hide All");

    rmSync(dir, { recursive: true, force: true });
  });

  it("does not crash when source_file is nullish", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-html-export-"));
    const htmlPath = join(dir, "graph.html");

    const G = new Graph();
    G.addNode("a", { label: "A", source_file: null, file_type: "code" });
    const communities = new Map([[0, ["a"]]]);

    expect(() => toHtml(G, communities, htmlPath)).not.toThrow();
    expect(readFileSync(htmlPath, "utf-8")).toContain("\"source_file\":\"\"");

    rmSync(dir, { recursive: true, force: true });
  });
});

describe("toHtml accessibility (Track C2)", () => {
  function renderHtml(): string {
    const dir = mkdtempSync(join(tmpdir(), "graphify-html-a11y-"));
    const htmlPath = join(dir, "graph.html");
    const G = new Graph();
    G.addNode("a", { label: "AlphaService", source_file: "src/a.ts", file_type: "code" });
    G.addNode("b", { label: "BetaRepo", source_file: "src/b.ts", file_type: "code" });
    G.addUndirectedEdge("a", "b", { relation: "uses", confidence: "EXTRACTED" });
    const communities = new Map([[0, ["a", "b"]]]);
    toHtml(G, communities, htmlPath, { communityLabels: new Map([[0, "Core"]]) });
    const html = readFileSync(htmlPath, "utf-8");
    rmSync(dir, { recursive: true, force: true });
    return html;
  }

  it("exposes a skip-link, ARIA live region, and aria-label on the graph container", () => {
    const html = renderHtml();
    expect(html).toContain('class="skip-link"');
    expect(html).toContain('href="#sidebar"');
    expect(html).toMatch(/<div[^>]*id="live-status"[^>]*role="status"[^>]*aria-live="polite"/);
    expect(html).toContain('aria-label="Graphify knowledge graph"');
  });

  it("labels the search input and exposes the search results as a listbox", () => {
    const html = renderHtml();
    // Visually-hidden label for screen readers.
    expect(html).toMatch(/<label[^>]*for="search"[^>]*class="sr-only"[^>]*>Search nodes<\/label>/);
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-controls="search-results"');
    expect(html).toContain('aria-autocomplete="list"');
    expect(html).toContain('role="listbox"');
  });

  it("ships a help dialog wired to F1/?, escape and a help button", () => {
    const html = renderHtml();
    expect(html).toContain('id="help-button"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-controls="help-overlay"');
    expect(html).toMatch(/<div[^>]*id="help-overlay"[^>]*role="dialog"[^>]*aria-modal="true"/);
    expect(html).toContain('id="help-title"');
    // Keyboard shortcuts surface for screen readers.
    expect(html).toContain("<kbd>F1</kbd>");
    expect(html).toContain("<kbd>Esc</kbd>");
    // Toggle wired in the script block.
    expect(html).toContain("toggleHelp");
    expect(html).toMatch(/e\.key === 'F1'/);
    expect(html).toMatch(/e\.key === 'Escape'/);
  });

  it("enables vis.js keyboard navigation and announces graph state", () => {
    const html = renderHtml();
    expect(html).toMatch(/keyboard:\s*\{\s*enabled:\s*true/);
    expect(html).toContain("function announce(");
    expect(html).toContain("Graph loaded:");
  });

  it("ships a high-contrast toggle wired with aria-pressed", () => {
    const html = renderHtml();
    expect(html).toContain('id="contrast-toggle"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("body.high-contrast");
    expect(html).toContain("@media (prefers-contrast: more)");
  });

  it("uses :focus-visible rings and labels community filter checkboxes", () => {
    const html = renderHtml();
    expect(html).toContain(":focus-visible");
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Community filters"');
  });
});
