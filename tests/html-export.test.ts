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

  it("aligns standalone graph HTML with the workspace token contract", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-html-token-theme-"));
    const htmlPath = join(dir, "graph.html");

    const G = new Graph();
    G.addNode("a", { label: "A", source_file: "src/a.ts", file_type: "code" });
    const communities = new Map([[0, ["a"]]]);

    toHtml(G, communities, htmlPath, { communityLabels: new Map([[0, "Core"]]) });

    const html = readFileSync(htmlPath, "utf-8");
    // The --ws-* contract now aliases onto the published design-system
    // --st-* tokens, which are inlined into the standalone export.
    expect(html).toContain("--ws-surface: var(--st-semantic-surface-default);");
    expect(html).toContain("--ws-surface-2: var(--st-semantic-surface-subtle);");
    expect(html).toContain("--st-semantic-surface-default: #ffffff;");
    expect(html).toContain("body { background: var(--ws-surface); color: var(--ws-text);");
    // G-studio-lot1 #1: the canvas keeps an explicit light background that
    // does NOT follow the (themeable) --ws-surface.
    expect(html).toContain("--graph-canvas-bg: #ffffff;");
    expect(html).toContain("#graph { flex: 1; outline: none; background: var(--graph-canvas-bg);");
    expect(html).toContain("#sidebar { width: 280px; background: var(--ws-surface-2); border-left: 1px solid var(--ws-border);");
    expect(html).toContain("--graph-weak-text: var(--ws-text-muted);");
    expect(html).toContain("--graph-muted-strong: var(--ws-text-muted);");
    expect(html).toContain("--graph-node-label: var(--ws-text);");
    expect(html).toContain("--graph-neighbor-border: var(--ws-border);");
    expect(html).not.toContain("body { background: #0f0f1a;");
    expect(html).not.toContain("color:#aaa");
    expect(html).not.toContain("color:#bbb");

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
    // Port of upstream safishamsi 1494874 — `re_exports` rides the same
    // import-family dash style so barrel-aware viewers render barrel
    // re-exports identically to plain imports.
    expect(inferEdgeDashes("re_exports", "EXTRACTED")).toEqual([6, 4]);
    expect(inferEdgeDashes("tested_by", "EXTRACTED")).toEqual([2, 4]);
    expect(inferEdgeDashes("validated_by", "EXTRACTED")).toEqual([2, 4]);
    expect(inferEdgeDashes("inherits", "EXTRACTED")).toEqual([10, 4]);
    expect(inferEdgeDashes("extends", "EXTRACTED")).toEqual([10, 4]);
    // No relation override -> confidence fallback.
    expect(inferEdgeDashes("uses", "EXTRACTED")).toBe(false);
    expect(inferEdgeDashes("uses", "INFERRED")).toBe(true);
    expect(inferEdgeDashes("", "AMBIGUOUS")).toBe(true);
  });

  it("HTML legend mentions re_exports alongside imports_from (port safishamsi 1494874)", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-html-reexports-"));
    const htmlPath = join(dir, "graph.html");
    const G = new Graph();
    G.addNode("barrel", { label: "barrel", source_file: "src/index.ts", file_type: "code" });
    G.addNode("foo", { label: "foo", source_file: "src/foo.ts", file_type: "code" });
    G.addUndirectedEdge("barrel", "foo", {
      relation: "re_exports",
      confidence: "EXTRACTED",
      context: "re-export",
    });
    const communities = new Map([[0, ["barrel", "foo"]]]);
    toHtml(G, communities, htmlPath, { communityLabels: new Map([[0, "Core"]]) });
    const html = readFileSync(htmlPath, "utf-8");
    // Edge legend must surface re_exports as a documented relation kind so
    // the viewer can attribute barrel arrows to the new edge type.
    expect(html).toContain("re_exports");
    // The dash pattern for re_exports rides the imports family. Match dashes
    // and relation on the same JSON-serialised edge entry (line-based).
    const edgeLine = html.split("\n").find((line) => line.includes('"relation":"re_exports"'));
    expect(edgeLine).toBeDefined();
    expect(edgeLine).toMatch(/"dashes":\[6,4\]/);
    rmSync(dir, { recursive: true, force: true });
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
    expect(html).toContain("box (hollow) &mdash; document");
    expect(html).toContain("square (filled) &mdash; test");
    expect(html).toContain('id="relation-legend"');
    expect(html).toContain("dotted &mdash; tested_by");
    // The vis.js options no longer force shape: 'dot' globally.
    expect(html).toContain("/* shape comes from per-node n.shape */");

    rmSync(dir, { recursive: true, force: true });
  });

  it("C-final-1 / G-studio-lot1 #2: shape 'box' (document/paper/concept) is hollow (semi-opaque white fill)", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-html-c-final-1-"));
    const htmlPath = join(dir, "graph.html");
    const G = new Graph();
    G.addNode("code_a", { label: "AlphaService", source_file: "src/alpha.ts", file_type: "code" });
    G.addNode("doc_a", { label: "DesignNote", source_file: "docs/design.md", file_type: "document" });
    G.addUndirectedEdge("code_a", "doc_a", { relation: "documented_by", confidence: "EXTRACTED" });
    const communities = new Map([[0, ["code_a", "doc_a"]]]);
    toHtml(G, communities, htmlPath, { communityLabels: new Map([[0, "Core"]]) });
    const html = readFileSync(htmlPath, "utf-8");

    // Box (document) carries a semi-opaque white fill so the label stays
    // legible over crossing edges while still reading as "hollow" — visually
    // distinct from the solid square (test).
    expect(html).toMatch(/"id":"doc_a"[^{]*\{[^}]*"background":"rgba\(255,255,255,0\.5\)"/);
    expect(html).toMatch(/"id":"doc_a"[\s\S]*?"shape":"box"/);
    // The fully-transparent fill is gone.
    expect(html).not.toContain('"background":"rgba(0,0,0,0)"');
    // Sanity: a code node keeps a coloured (non-transparent) background.
    expect(html).toMatch(/"id":"code_a"[^{]*\{[^}]*"background":"#[0-9A-Fa-f]{6}"/);

    rmSync(dir, { recursive: true, force: true });
  });
});

describe("toHtml visual encoding (Track C-3.5: profile-aware)", () => {
  function makeProfile(nodeTypes: Record<string, { visual_encoding?: { shape?: string; color_hex?: string } }>) {
    return {
      id: "test-profile",
      version: "1",
      default_language: "en",
      profile_hash: "deadbeef",
      node_types: nodeTypes as Record<string, { visual_encoding?: { shape?: "diamond" | "star"; color_hex?: string } }>,
      relation_types: {},
      registries: {},
      citation_policy: {
        minimum_granularity: "page",
        require_source_file: true,
        allow_bbox: "when_available",
      },
      hardening: {
        statuses: ["candidate"],
        default_status: "candidate",
        promotion_requires: [],
        status_transitions: [],
      },
      inference_policy: {
        allow_inferred_relations: false,
        allowed_relation_types: [],
        require_evidence_refs: false,
      },
      evidence_policy: {
        require_evidence_refs: false,
        min_refs: 0,
        node_types: [],
        relation_types: [],
      },
      hierarchies: {},
      outputs: {
        ontology: {
          enabled: false,
          artifact_schema: "",
          canonical_node_types: [],
          source_node_types: [],
          occurrence_node_types: [],
          alias_fields: [],
          relation_exports: [],
          wiki: {
            enabled: false,
            page_node_types: [],
            include_backlinks: false,
            include_source_snippets: false,
          },
        },
      },
    } as unknown as Parameters<typeof toHtml>[3] extends infer T
      ? T extends { profile?: infer P } ? P : never
      : never;
  }

  it("uses profile visual_encoding.shape over inferNodeShape when node_type matches", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-html-c35-"));
    const htmlPath = join(dir, "graph.html");
    const G = new Graph();
    G.addNode("c1", {
      label: "Detective",
      source_file: "corpus/characters/detective.md",
      file_type: "document",
      node_type: "Character",
    });
    G.addNode("k1", {
      label: "Murder",
      source_file: "corpus/crimes/murder.md",
      file_type: "document",
      node_type: "Crime",
    });
    G.addUndirectedEdge("c1", "k1", { relation: "investigates", confidence: "EXTRACTED" });
    const communities = new Map([[0, ["c1", "k1"]]]);
    const profile = makeProfile({
      Character: { visual_encoding: { shape: "diamond", color_hex: "#11AABB" } },
      Crime: { visual_encoding: { shape: "star" } },
    });

    toHtml(G, communities, htmlPath, {
      communityLabels: new Map([[0, "Core"]]),
      profile,
    });
    const html = readFileSync(htmlPath, "utf-8");

    // Per-node shape overridden by profile.
    expect(html).toMatch(/"id":"c1"[\s\S]*?"shape":"diamond"/);
    expect(html).toMatch(/"id":"k1"[\s\S]*?"shape":"star"/);
    // Profile color_hex used for Character border (and background since shape != box).
    expect(html).toMatch(/"id":"c1"[^{]*\{[^}]*"border":"#11AABB"/);
    expect(html).toMatch(/"id":"c1"[^{]*\{[^}]*"background":"#11AABB"/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("falls back to inferNodeShape when profile does not declare visual_encoding for that type", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-html-c35-fb-"));
    const htmlPath = join(dir, "graph.html");
    const G = new Graph();
    // Character has visual_encoding -> diamond override.
    G.addNode("c1", {
      label: "Detective",
      source_file: "corpus/c.md",
      file_type: "document",
      node_type: "Character",
    });
    // UnknownType has NO entry -> falls back to inferNodeShape (document -> box).
    G.addNode("u1", {
      label: "Unknown",
      source_file: "corpus/u.md",
      file_type: "document",
      node_type: "UnknownType",
    });
    // No node_type at all -> falls back to inferNodeShape (document -> box).
    G.addNode("d1", {
      label: "PlainDoc",
      source_file: "corpus/d.md",
      file_type: "document",
    });
    G.addUndirectedEdge("c1", "u1", { relation: "links_to", confidence: "EXTRACTED" });
    G.addUndirectedEdge("c1", "d1", { relation: "links_to", confidence: "EXTRACTED" });
    const communities = new Map([[0, ["c1", "u1", "d1"]]]);
    const profile = makeProfile({
      Character: { visual_encoding: { shape: "diamond" } },
    });

    toHtml(G, communities, htmlPath, {
      communityLabels: new Map([[0, "Core"]]),
      profile,
    });
    const html = readFileSync(htmlPath, "utf-8");

    expect(html).toMatch(/"id":"c1"[\s\S]*?"shape":"diamond"/);
    // u1 has a node_type with no visual_encoding -> fallback to file_type=document -> box.
    expect(html).toMatch(/"id":"u1"[\s\S]*?"shape":"box"/);
    // d1 has no node_type -> fallback to file_type=document -> box.
    expect(html).toMatch(/"id":"d1"[\s\S]*?"shape":"box"/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("box shape resolved via profile still gets transparent background (outlined)", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-html-c35-box-"));
    const htmlPath = join(dir, "graph.html");
    const G = new Graph();
    G.addNode("n1", {
      label: "Concept",
      source_file: "src/a.ts",
      file_type: "code",
      node_type: "Concept",
    });
    const communities = new Map([[0, ["n1"]]]);
    const profile = makeProfile({
      Concept: { visual_encoding: { shape: "box", color_hex: "#445566" } },
    });

    toHtml(G, communities, htmlPath, {
      communityLabels: new Map([[0, "Core"]]),
      profile,
    });
    const html = readFileSync(htmlPath, "utf-8");

    expect(html).toMatch(/"id":"n1"[\s\S]*?"shape":"box"/);
    expect(html).toMatch(/"id":"n1"[^{]*\{[^}]*"background":"rgba\(255,255,255,0\.5\)"/);
    expect(html).toMatch(/"id":"n1"[^{]*\{[^}]*"border":"#445566"/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("output is byte-identical when profile is undefined vs omitted (regression: no breakage)", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-html-c35-noop-"));
    const htmlPath = join(dir, "graph.html");
    const G = new Graph();
    G.addNode("a", { label: "A", source_file: "src/a.ts", file_type: "code", node_type: "Character" });
    G.addNode("b", { label: "B", source_file: "src/b.ts", file_type: "code" });
    G.addUndirectedEdge("a", "b", { relation: "uses", confidence: "EXTRACTED" });
    const communities = new Map([[0, ["a", "b"]]]);

    toHtml(G, communities, htmlPath, { communityLabels: new Map([[0, "Core"]]) });
    const noProfile = readFileSync(htmlPath, "utf-8");
    toHtml(G, communities, htmlPath, { communityLabels: new Map([[0, "Core"]]), profile: undefined });
    const undefProfile = readFileSync(htmlPath, "utf-8");

    // Output strictly identical; profile undefined must not change the HTML.
    expect(undefProfile).toBe(noProfile);
    rmSync(dir, { recursive: true, force: true });
  });
});
