/**
 * Track G G-studio-lot2 — graph panel requests the studio-mode canvas.
 *
 * When the panel renders inside the studio (full center, legend-only), it
 * asks the served graph.html for its studio variant via a `studio=1` query
 * on the live (same-origin) URL. The file URL stays plain (the file: served
 * artifact carries the studio CSS already but the class is added server-side
 * over HTTP).
 */
import { describe, expect, it } from "vitest";

import {
  createDefaultViewerState,
  getWorkspaceTokens,
  renderGraphPanel,
  type GraphLike,
} from "../src/workspace/index.js";

const tokens = getWorkspaceTokens("light");
const graph: GraphLike = {
  nodes: [{ id: "a", label: "Alpha", node_type: "Character", community: 0 }],
  edges: [],
};

describe("Track G G-studio-lot2 — graph panel studio mode", () => {
  it("requests studio=1 on the live graph URL when studioMode is set", () => {
    const html = renderGraphPanel({
      state: createDefaultViewerState(),
      graph,
      tokens,
      graphHtmlUrl: "file:///x/.graphify/graph.html",
      liveGraphHtmlUrl: "/api/ontology/artifacts/graph.html",
      studioMode: true,
    });
    expect(html).toContain("data-ws-live-graph-src=\"/api/ontology/artifacts/graph.html?studio=1\"");
  });

  it("does not add studio=1 when studioMode is not set (default export embedding)", () => {
    const html = renderGraphPanel({
      state: createDefaultViewerState(),
      graph,
      tokens,
      graphHtmlUrl: "file:///x/.graphify/graph.html",
      liveGraphHtmlUrl: "/api/ontology/artifacts/graph.html",
    });
    expect(html).not.toContain("studio=1");
  });
});
