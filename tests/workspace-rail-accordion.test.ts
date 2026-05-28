/**
 * Track G G-studio-lot3 — left column accordion.
 *
 * #5 Left column = accordion, COLLAPSED by default: Type, Facets, Results
 *    (parity with process-std-am LeftWorkbench).
 * #6 A COMMUNITIES panel in the left column, ABOVE Facets, collapsed by
 *    default (Graphify-specific; communities come from graph clustering /
 *    community_labels).
 *
 * Profile-neutral: no corpus-specific strings.
 */
import { describe, expect, it } from "vitest";

import {
  createDefaultViewerState,
  renderWorkspaceRail,
  type GraphLike,
} from "../src/workspace/index.js";

const graph: GraphLike = {
  nodes: [
    { id: "a", label: "Alpha", node_type: "Character", community: 0, community_name: "Detectives", status: "active" },
    { id: "b", label: "Beta", node_type: "Character", community: 0, community_name: "Detectives", status: "active" },
    { id: "c", label: "Gamma", node_type: "Work", community: 1, community_name: "Novels", status: "candidate" },
  ],
  edges: [{ source: "a", target: "b", relation: "knows" }],
};

function rail() {
  return renderWorkspaceRail({ state: createDefaultViewerState(), graph });
}

describe("Track G G-studio-lot3 — left accordion (#5)", () => {
  it("renders Type / Facets / Results sections as collapsible <details>, collapsed by default", () => {
    const html = rail();
    // Each major section is a <details> accordion (no `open` => collapsed).
    expect(html).toMatch(/<details class="ws-rail-accordion" data-rail-section="types"(?![^>]*\bopen\b)/);
    expect(html).toMatch(/<details class="ws-rail-accordion" data-rail-section="facets"(?![^>]*\bopen\b)/);
    expect(html).toMatch(/<details class="ws-rail-accordion" data-rail-section="results"(?![^>]*\bopen\b)/);
    // Summaries carry the section names.
    expect(html).toContain("<summary");
    expect(html).toContain("Types");
    expect(html).toContain("Facets");
    expect(html).toContain("Results");
  });

  it("does not force any accordion open by default", () => {
    const html = rail();
    // No top-level accordion section should be open on first render.
    expect(html).not.toMatch(/<details class="ws-rail-accordion"[^>]*\bopen\b/);
  });
});

describe("Track G G-studio-lot3 — communities panel (#6)", () => {
  it("renders a Communities accordion ABOVE Facets, collapsed by default", () => {
    const html = rail();
    expect(html).toMatch(/<details class="ws-rail-accordion" data-rail-section="communities"(?![^>]*\bopen\b)/);
    // Communities must appear before Facets in the DOM order.
    const communitiesIdx = html.indexOf('data-rail-section="communities"');
    const facetsIdx = html.indexOf('data-rail-section="facets"');
    expect(communitiesIdx).toBeGreaterThan(-1);
    expect(facetsIdx).toBeGreaterThan(-1);
    expect(communitiesIdx).toBeLessThan(facetsIdx);
  });

  it("lists the Louvain communities with member counts from the dataset", () => {
    const html = rail();
    expect(html).toContain("Detectives");
    expect(html).toContain("Novels");
    // Member counts surface (Detectives = 2, Novels = 1).
    expect(html).toMatch(/Detectives[\s\S]*?2/);
    expect(html).toMatch(/Novels[\s\S]*?1/);
  });

  it("falls back to 'Community N' when no community_name is present", () => {
    const html = renderWorkspaceRail({
      state: createDefaultViewerState(),
      graph: {
        nodes: [
          { id: "x", label: "X", node_type: "Thing", community: 3 },
          { id: "y", label: "Y", node_type: "Thing", community: 3 },
        ],
        edges: [],
      },
    });
    expect(html).toContain("Community 3");
  });

  it("emits no communities panel rows when the graph has no community data", () => {
    const html = renderWorkspaceRail({
      state: createDefaultViewerState(),
      graph: {
        nodes: [{ id: "x", label: "X", node_type: "Thing" }],
        edges: [],
      },
    });
    // The panel still renders (accordion present) but reports an empty state.
    expect(html).toContain('data-rail-section="communities"');
    expect(html).toContain("No communities");
  });

  it("does not leak corpus-specific strings", () => {
    const html = rail();
    expect(html).not.toMatch(/\b(?:framework|abp|process_std|ABPProcess|ProcessStdProcess|BusinessObject|DigitalApplicationTool)\b/);
  });
});
