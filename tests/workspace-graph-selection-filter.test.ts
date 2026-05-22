/**
 * Track G G6-1 (S0.3) — graph panel filtered by selection state.
 *
 * Empty selection → mode "overview"; non-empty selection.entityIds → mode
 * "selection" with the BFS-1 induced subgraph. The Show weak links toggle
 * flips viewState.graph.showWeakLinks; the legend (Strong / Explicit / Weak)
 * is rendered above the graph surface.
 */
import { describe, expect, it } from "vitest";

import {
  computeFocusSubgraph,
  createDefaultViewerState,
  getWorkspaceTokens,
  renderWorkspaceShell,
  type GraphLike,
} from "../src/workspace/index.js";

const tokens = getWorkspaceTokens("dark");

const graph: GraphLike = {
  nodes: [
    { id: "a", label: "A", node_type: "T1", community: 1 },
    { id: "b", label: "B", node_type: "T1", community: 1 },
    { id: "c", label: "C", node_type: "T2", community: 2 },
    { id: "d", label: "D", node_type: "T2", community: 2 },
  ],
  edges: [
    { source: "a", target: "b", relation: "rel", confidence: "EXTRACTED" },
    { source: "b", target: "c", relation: "rel2", confidence: "EXTRACTED" },
    { source: "c", target: "d", relation: "rel3", confidence: "INFERRED" },
  ],
};

describe("Track G G6-1 — graph panel bound to selection state", () => {
  it("falls back to overview when selectionState.entityIds is empty", () => {
    const state = createDefaultViewerState();
    expect(state.selectionState.entityIds).toEqual([]);
    const subgraph = computeFocusSubgraph(graph, state);
    expect(subgraph.appliedMode).toBe("overview");
    expect(subgraph.nodes.length).toBe(4);
  });

  it("induces a 1-hop subgraph around the selected entities", () => {
    const state = createDefaultViewerState();
    state.selectionState = {
      kind: "members",
      ref: "selection:test",
      entityIds: ["a"],
    };
    state.viewState.graph.mode = "selection";
    state.selectedEntities = ["a"];
    const subgraph = computeFocusSubgraph(graph, state);
    expect(subgraph.appliedMode).toBe("selection");
    // BFS-1 around 'a' through strong edges → {a, b}.
    const ids = subgraph.nodes.map((n) => n.id);
    expect(ids).toContain("a");
  });

  it("emits the selection/focus toggle, the weak-links checkbox, and the legend in the rendered shell", () => {
    const html = renderWorkspaceShell({
      tokens,
      title: "Workspace",
      state: createDefaultViewerState(),
      graph,
    });
    expect(html).toContain('class="ws-graph-controls"');
    expect(html).toContain('data-control="graph-mode-toggle"');
    expect(html).toContain('data-control="graph-weak-links"');
    expect(html).toContain('class="ws-graph-legend"');
    expect(html.toLowerCase()).toContain("strong");
    expect(html.toLowerCase()).toContain("weak");
  });

  it("reflects the weak-links toggle state in the rendered checkbox", () => {
    const state = createDefaultViewerState();
    state.viewState.graph.showWeakLinks = true;
    const html = renderWorkspaceShell({ tokens, title: "Workspace", state, graph });
    // Checkbox must be `checked` when showWeakLinks is true.
    expect(html).toMatch(/data-control="graph-weak-links"[^>]*\bchecked\b/);
  });

  it("renders the graph panel inside the central column, not in a separate region", () => {
    const html = renderWorkspaceShell({ tokens, title: "Workspace", graph });
    // The graph panel section lives inside <main id="central-display">.
    const centralIdx = html.indexOf('id="central-display"');
    const graphIdx = html.indexOf('id="graph-panel"');
    const centralEnd = html.indexOf("</main>", centralIdx);
    expect(centralIdx).toBeGreaterThan(-1);
    expect(graphIdx).toBeGreaterThan(centralIdx);
    expect(graphIdx).toBeLessThan(centralEnd);
  });
});
