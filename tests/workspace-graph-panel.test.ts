import { describe, expect, it } from "vitest";

import {
  computeFocusSubgraph,
  createDefaultViewerState,
  getWorkspaceTokens,
  renderGraphPanel,
  renderWorkspaceShell,
  workspaceReducer,
  type GraphLike,
  type WorkspaceViewerState,
} from "../src/workspace/index.js";

const graph: GraphLike = {
  nodes: [
    { id: "holmes", label: "Sherlock Holmes", node_type: "Character", community: 1 },
    { id: "watson", label: "Dr Watson", node_type: "Character", community: 1 },
    { id: "crime", label: "Lauriston Gardens murder", node_type: "CrimeOrScheme", community: 2 },
    { id: "ring", label: "Woman's wedding ring", node_type: "Evidence", community: 2 },
  ],
  edges: [
    { source: "holmes", target: "watson", relation: "works_with", confidence: "EXTRACTED" },
    { source: "watson", target: "crime", relation: "observes", confidence: "INFERRED" },
    { source: "crime", target: "ring", relation: "leaves_evidence", confidence: "EXTRACTED" },
  ],
};

const graphJsonShape: GraphLike = {
  nodes: graph.nodes,
  links: graph.edges,
};

function withGraphState(
  state: WorkspaceViewerState,
  patch: Partial<WorkspaceViewerState["viewState"]["graph"]>,
): WorkspaceViewerState {
  return {
    ...state,
    viewState: {
      ...state.viewState,
      graph: { ...state.viewState.graph, ...patch },
    },
  };
}

describe("Track G G4 — graph panel", () => {
  it("slices a focus graph through strong edges unless weak links are enabled", () => {
    const focused = workspaceReducer(createDefaultViewerState(), {
      type: "SET_FOCUS_ENTITY",
      focusEntityId: "holmes",
    });
    const strongOnly = computeFocusSubgraph(
      graph,
      withGraphState(focused, { mode: "focus", focusHops: 2, showWeakLinks: false }),
    );
    expect(strongOnly.appliedMode).toBe("focus");
    expect(strongOnly.nodes.map((n) => n.id)).toEqual(["holmes", "watson"]);
    expect(strongOnly.edges.map((e) => e.relation)).toEqual(["works_with"]);

    const withWeak = computeFocusSubgraph(
      graph,
      withGraphState(focused, { mode: "focus", focusHops: 2, showWeakLinks: true }),
    );
    expect(withWeak.nodes.map((n) => n.id)).toEqual(["holmes", "watson", "crime"]);
    expect(withWeak.edges.map((e) => e.relation)).toEqual(["works_with", "observes"]);
  });

  it("selects graph nodes from workbench memory by type and entity id", () => {
    const state = withGraphState(
      {
        ...createDefaultViewerState(),
        selectedTypes: ["Evidence"],
        selectedEntities: ["holmes"],
        selectionState: { kind: "members", ref: "queue:needs_review", entityIds: ["crime"] },
      },
      { mode: "selection", showWeakLinks: true },
    );

    const subgraph = computeFocusSubgraph(graph, state);
    expect(subgraph.appliedMode).toBe("selection");
    expect(subgraph.nodes.map((n) => n.id)).toEqual(["holmes", "crime", "ring"]);
    expect(subgraph.edges.map((e) => e.relation)).toEqual(["leaves_evidence"]);
    expect(subgraph.metrics).toMatchObject({
      nodes: 3,
      edges: 1,
      communities: 2,
      topHubId: "crime",
    });
  });

  it("accepts native graph.json links as the edge collection", () => {
    const state = withGraphState(createDefaultViewerState(), { mode: "overview" });
    const subgraph = computeFocusSubgraph(graphJsonShape, state);
    expect(subgraph.metrics.edges).toBe(2);
    expect(subgraph.edges.map((e) => e.relation)).toEqual([
      "works_with",
      "leaves_evidence",
    ]);
  });

  it("renders metrics and a static-studio placeholder, escaping the focus id", () => {
    const tokens = getWorkspaceTokens("dark");
    const state = withGraphState(createDefaultViewerState(), { mode: "overview" });

    const html = renderGraphPanel({
      graph,
      state: { ...state, focusEntityId: "<bad>" },
      tokens,
      height: 320,
    });

    expect(html).toContain("<b>Nodes:</b> 4");
    expect(html).toContain("<b>Edges:</b> 2");
    expect(html).toContain("<b>Mode:</b> Overview");
    expect(html).toContain("&lt;bad&gt;");
    expect(html).toContain("min-height:320px");
    // The legacy vis-network iframe is gone; the panel points at the static
    // Ontology Studio export instead and never embeds an interactive surface.
    expect(html).not.toContain("<iframe");
    expect(html).toContain("ws-graph-placeholder");
    expect(html).toContain("graphify studio export");
  });

  it("keeps the placeholder bounded with no embedded surface", () => {
    const html = renderGraphPanel({
      graph,
      state: createDefaultViewerState(),
      tokens: getWorkspaceTokens("dark"),
      height: 80,
    });
    expect(html).not.toContain("<iframe");
    expect(html).toContain("ws-graph-placeholder");
    expect(html).toContain("min-height:120px");
  });

  it("lets the workspace shell replace the G2 graph stub with the rendered panel", () => {
    const graphPanelHtml = '<div id="custom-graph-panel">Graph metrics</div>';
    const html = renderWorkspaceShell({
      tokens: getWorkspaceTokens("dark"),
      title: "Ontology workspace",
      graphPanelHtml,
    });

    expect(html).toContain(graphPanelHtml);
    expect(html).not.toContain("vis.js graph surface arrives in G4.");
  });
});
