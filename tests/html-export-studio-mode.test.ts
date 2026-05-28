/**
 * Track G G-studio-lot2 — center canvas in studio mode.
 *
 * #3 In studio mode the graph takes the FULL center section — the community
 *    list and the node-info panel are removed from inside the canvas area.
 * #4 Only the LEGEND (shapes + edges) stays, bottom-right of the canvas.
 *
 * The default (non-studio) export is unchanged — community list + node-info
 * panel + search stay in the sidebar exactly as before.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Graph from "graphology";
import { toHtml } from "../src/export.js";

function render(studioMode: boolean): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-studio-mode-"));
  const htmlPath = join(dir, "graph.html");
  const g = new Graph();
  g.addNode("a", { label: "Alpha", source_file: "src/a.ts", file_type: "code" });
  g.addNode("doc", { label: "Note", source_file: "docs/n.md", file_type: "document" });
  g.addUndirectedEdge("a", "doc", { relation: "documented_by", confidence: "EXTRACTED" });
  const communities = new Map([[0, ["a", "doc"]]]);
  toHtml(g, communities, htmlPath, { communityLabels: new Map([[0, "Core"]]), studioMode });
  const html = readFileSync(htmlPath, "utf-8");
  rmSync(dir, { recursive: true, force: true });
  return html;
}

describe("Track G G-studio-lot2 — studio center canvas (#3, #4)", () => {
  it("marks the body as studio-mode so the canvas can claim the full center", () => {
    expect(render(true)).toMatch(/<body[^>]*class="[^"]*studio-mode/);
    expect(render(false)).not.toMatch(/<body[^>]*class="[^"]*studio-mode/);
  });

  it("removes the community list and node-info panel from inside the canvas area (#3)", () => {
    const html = render(true);
    // CSS hides the community legend + the node info panel + the search box
    // + the bottom stats line in studio mode.
    expect(html).toMatch(/body\.studio-mode\s+#legend-wrap\s*\{[^}]*display:\s*none/);
    expect(html).toMatch(/body\.studio-mode\s+#info-panel\s*\{[^}]*display:\s*none/);
    expect(html).toMatch(/body\.studio-mode\s+#search-wrap\s*\{[^}]*display:\s*none/);
    expect(html).toMatch(/body\.studio-mode\s+#stats\s*\{[^}]*display:\s*none/);
  });

  it("keeps only the shapes + edges legend, floated bottom-right of the canvas (#4)", () => {
    const html = render(true);
    // The shape + edge legend container is promoted to a floating bottom-right
    // card over the canvas in studio mode.
    expect(html).toMatch(/body\.studio-mode\s+#shapes-legend-card\s*\{[\s\S]*?position:\s*(?:fixed|absolute)/);
    expect(html).toMatch(/body\.studio-mode\s+#shapes-legend-card\s*\{[\s\S]*?(?:right:|bottom:)/);
    // The shape + edge legends are still present.
    expect(html).toContain('id="shape-legend"');
    expect(html).toContain('id="relation-legend"');
  });

  it("leaves the default (non-studio) export untouched — community list visible", () => {
    const html = render(false);
    // The studio CSS rules ship in every export (inert without the body
    // class); the default <body> must NOT carry the studio-mode class, so the
    // community list / node-info panel / search stay visible.
    expect(html).not.toMatch(/<body[^>]*class="[^"]*studio-mode/);
    // The community legend and node-info panel are still in the default sidebar.
    expect(html).toContain('id="legend-wrap"');
    expect(html).toContain('id="info-panel"');
    expect(html).toContain('id="search-wrap"');
  });
});
