/**
 * Track G G-studio-lot1 — graph rendering.
 *
 * #1 The graph canvas keeps a LIGHT background regardless of the app
 *    theme. The `#graph` element must NOT follow `var(--ws-surface)`
 *    (which can be flipped dark by a host theme); it must resolve to an
 *    explicit light fill so crossing edges + node labels stay readable.
 * #2 Outlined "box" nodes (document / paper / concept) keep their
 *    coloured border but get a SEMI-OPAQUE WHITE fill (~50%), not a fully
 *    transparent one. Arrows leave from the box centre, so a 0-alpha fill
 *    leaves the label unreadable over crossing edges; a 50% white fill
 *    keeps the text legible while still looking "hollow".
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Graph from "graphology";
import { toHtml } from "../src/export.js";

function renderHtml(setup: (g: Graph) => Map<number, string[]>): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-studio-canvas-"));
  const htmlPath = join(dir, "graph.html");
  const g = new Graph();
  const communities = setup(g);
  toHtml(g, communities, htmlPath, { communityLabels: new Map([[0, "Core"]]) });
  const html = readFileSync(htmlPath, "utf-8");
  rmSync(dir, { recursive: true, force: true });
  return html;
}

describe("Track G G-studio-lot1 — light canvas (#1)", () => {
  it("forces an explicit light canvas background that does not follow --ws-surface", () => {
    const html = renderHtml((g) => {
      g.addNode("a", { label: "A", source_file: "src/a.ts", file_type: "code" });
      return new Map([[0, ["a"]]]);
    });
    // A dedicated light token is declared for the canvas.
    expect(html).toContain("--graph-canvas-bg: #ffffff;");
    // The #graph rule paints with the dedicated token, NOT var(--ws-surface).
    expect(html).toMatch(/#graph\s*\{[^}]*background:\s*var\(--graph-canvas-bg\)/);
    expect(html).not.toMatch(/#graph\s*\{[^}]*background:\s*var\(--ws-surface\)/);
  });

  it("keeps the canvas light even when the host flips --ws-surface to a dark value", () => {
    // The dedicated token is a literal light colour, so a host theme that
    // overrides --ws-surface cannot darken the canvas.
    const html = renderHtml((g) => {
      g.addNode("a", { label: "A", source_file: "src/a.ts", file_type: "code" });
      return new Map([[0, ["a"]]]);
    });
    const tokenLine = html.split("\n").find((line) => line.includes("--graph-canvas-bg:"));
    expect(tokenLine).toBeDefined();
    expect(tokenLine).not.toContain("var(");
  });
});

describe("Track G G-studio-lot1 — semi-opaque white box fill (#2)", () => {
  it("paints outlined box nodes with a ~50% white fill (not 0-alpha transparent)", () => {
    const html = renderHtml((g) => {
      g.addNode("code_a", { label: "AlphaService", source_file: "src/alpha.ts", file_type: "code" });
      g.addNode("doc_a", { label: "DesignNote", source_file: "docs/design.md", file_type: "document" });
      g.addUndirectedEdge("code_a", "doc_a", { relation: "documented_by", confidence: "EXTRACTED" });
      return new Map([[0, ["code_a", "doc_a"]]]);
    });
    // Box (document) carries the semi-opaque white background.
    expect(html).toMatch(/"id":"doc_a"[^{]*\{[^}]*"background":"rgba\(255,255,255,0\.5\)"/);
    expect(html).toMatch(/"id":"doc_a"[\s\S]*?"shape":"box"/);
    // The fully-transparent fill is gone.
    expect(html).not.toContain('"background":"rgba(0,0,0,0)"');
    // A non-box code node keeps its solid coloured background.
    expect(html).toMatch(/"id":"code_a"[^{]*\{[^}]*"background":"#[0-9A-Fa-f]{6}"/);
  });

  it("keeps the box border as the node colour (only the fill changes)", () => {
    const html = renderHtml((g) => {
      g.addNode("doc_a", { label: "DesignNote", source_file: "docs/design.md", file_type: "document" });
      return new Map([[0, ["doc_a"]]]);
    });
    expect(html).toMatch(/"id":"doc_a"[^{]*\{[^}]*"border":"#[0-9A-Fa-f]{6}"/);
  });
});
