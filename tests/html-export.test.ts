import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Graph from "graphology";
import { inferEdgeDashes, inferNodeShape, toHtml } from "../src/export.js";
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

describe("toHtml visual encoding (Track C3)", () => {
  it("inferNodeShape maps file_type and source_file to vis.js shapes (defaults code-corpus)", () => {
    expect(inferNodeShape("code", "src/foo.ts")).toBe("dot");
    expect(inferNodeShape("code", "src/foo.test.ts")).toBe("square");
    expect(inferNodeShape("code", "tests/foo.ts")).toBe("square");
    expect(inferNodeShape("code", "src/types.d.ts")).toBe("diamond");
    expect(inferNodeShape("", "config.yaml")).toBe("triangle");
    expect(inferNodeShape("", "config/app.toml")).toBe("triangle");
    expect(inferNodeShape("document", "docs/intro.md")).toBe("box");
    expect(inferNodeShape("paper", "papers/refs.pdf")).toBe("box");
    expect(inferNodeShape("image", "img/logo.png")).toBe("star");
    expect(inferNodeShape("video", "v/intro.mp4")).toBe("hexagon");
    // Unknown / default -> dot.
    expect(inferNodeShape("", "src/unknown.xyz")).toBe("dot");
  });

  it("inferEdgeDashes maps relations to dash patterns (relation wins over confidence)", () => {
    expect(inferEdgeDashes("calls", "EXTRACTED")).toBe(false);
    expect(inferEdgeDashes("imports_from", "EXTRACTED")).toEqual([6, 4]);
    expect(inferEdgeDashes("imports", "EXTRACTED")).toEqual([6, 4]);
    expect(inferEdgeDashes("tested_by", "EXTRACTED")).toEqual([2, 4]);
    expect(inferEdgeDashes("validated_by", "EXTRACTED")).toEqual([2, 4]);
    expect(inferEdgeDashes("inherits", "EXTRACTED")).toEqual([10, 4]);
    expect(inferEdgeDashes("extends", "EXTRACTED")).toEqual([10, 4]);
    // No relation override -> confidence fallback.
    expect(inferEdgeDashes("uses", "EXTRACTED")).toBe(false);
    expect(inferEdgeDashes("uses", "INFERRED")).toBe(true);
    expect(inferEdgeDashes("", "AMBIGUOUS")).toBe(true);
  });

  it("emits per-node shape, shape legend, and edge legend in the rendered HTML", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-html-c3-"));
    const htmlPath = join(dir, "graph.html");
    const G = new Graph();
    G.addNode("alpha", { label: "AlphaService", source_file: "src/alpha.ts", file_type: "code" });
    G.addNode("beta_test", { label: "BetaTest", source_file: "src/beta.test.ts", file_type: "code" });
    G.addNode("config", { label: "AppConfig", source_file: "config.yaml", file_type: "" });
    G.addUndirectedEdge("alpha", "beta_test", { relation: "tested_by", confidence: "EXTRACTED" });
    G.addUndirectedEdge("alpha", "config", { relation: "imports_from", confidence: "EXTRACTED" });
    const communities = new Map([[0, ["alpha", "beta_test", "config"]]]);
    toHtml(G, communities, htmlPath, { communityLabels: new Map([[0, "Core"]]) });
    const html = readFileSync(htmlPath, "utf-8");

    // Per-node shape attached to each node entry (RAW_NODES JSON).
    expect(html).toMatch(/"shape":"square"/);
    expect(html).toMatch(/"shape":"triangle"/);
    expect(html).toMatch(/"shape":"dot"/);
    // Per-edge dash patterns (relation-aware).
    expect(html).toMatch(/"dashes":\[2,4\]/); // tested_by
    expect(html).toMatch(/"dashes":\[6,4\]/); // imports_from
    // Static shape and edge legends are present in the sidebar.
    expect(html).toContain('id="shape-legend"');
    expect(html).toContain("triangle &mdash; config");
    expect(html).toContain('id="relation-legend"');
    expect(html).toContain("dotted &mdash; tested_by");
    // The vis.js options no longer force shape: 'dot' globally.
    expect(html).toContain("/* shape comes from per-node n.shape */");

    rmSync(dir, { recursive: true, force: true });
  });
});
