/**
 * Track G G6-1 (S0.4) — four counters between prose and graph.
 *
 * Selected entities / selected classes / visible nodes / visible edges.
 * Values are read from WorkspaceViewerState + the dataset stats already
 * exposed via computeFocusSubgraph.
 */
import { describe, expect, it } from "vitest";

import {
  createDefaultViewerState,
  getWorkspaceTokens,
  renderWorkspaceShell,
  type GraphLike,
} from "../src/workspace/index.js";

const tokens = getWorkspaceTokens("dark");

const graph: GraphLike = {
  nodes: [
    { id: "a", label: "A", node_type: "T1" },
    { id: "b", label: "B", node_type: "T1" },
    { id: "c", label: "C", node_type: "T2" },
  ],
  edges: [
    { source: "a", target: "b", relation: "r", confidence: "EXTRACTED" },
    { source: "b", target: "c", relation: "r", confidence: "EXTRACTED" },
  ],
};

describe("Track G G6-1 — counters row", () => {
  it("renders four labelled counters in the rendered shell", () => {
    const html = renderWorkspaceShell({
      tokens,
      title: "Workspace",
      state: createDefaultViewerState(),
      graph,
    });
    expect(html).toContain('class="ws-counters"');
    expect(html).toContain('data-counter="selected-entities"');
    expect(html).toContain('data-counter="selected-classes"');
    expect(html).toContain('data-counter="visible-nodes"');
    expect(html).toContain('data-counter="visible-edges"');
  });

  it("reflects the selection state and dataset stats in each counter value", () => {
    const state = {
      ...createDefaultViewerState(),
      selectedTypes: ["T1", "T2"],
      selectedEntities: ["a", "b"],
      selectionState: {
        kind: "members",
        ref: "selection:test",
        entityIds: ["a", "b"],
      },
    };
    const html = renderWorkspaceShell({ tokens, title: "Workspace", state, graph });
    // 2 selected entities, 2 selected classes, visible nodes/edges from
    // the induced subgraph.
    expect(html).toMatch(
      /data-counter="selected-entities"[^>]*>[\s\S]*?<span class="ws-counter-value">\s*2\s*<\/span>/,
    );
    expect(html).toMatch(
      /data-counter="selected-classes"[^>]*>[\s\S]*?<span class="ws-counter-value">\s*2\s*<\/span>/,
    );
    expect(html).toMatch(
      /data-counter="visible-nodes"[^>]*>[\s\S]*?<span class="ws-counter-value">\s*\d+\s*<\/span>/,
    );
    expect(html).toMatch(
      /data-counter="visible-edges"[^>]*>[\s\S]*?<span class="ws-counter-value">\s*\d+\s*<\/span>/,
    );
  });

  it("places the counters between the description block and the graph controls", () => {
    const html = renderWorkspaceShell({
      tokens,
      title: "Workspace",
      state: createDefaultViewerState(),
      graph,
    });
    const idxCounters = html.indexOf('class="ws-counters"');
    const idxControls = html.indexOf('class="ws-graph-controls"');
    const idxGraphPanel = html.indexOf('id="graph-panel"');
    expect(idxCounters).toBeGreaterThan(-1);
    expect(idxControls).toBeGreaterThan(idxCounters);
    expect(idxGraphPanel).toBeGreaterThan(idxCounters);
  });
});
