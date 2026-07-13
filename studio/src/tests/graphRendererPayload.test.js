import { describe, expect, it } from "vitest";

import {
  buildConnectedDimStyle,
  buildEdgeAlphaShape,
  buildGraphRendererPayload,
  COLOR_BY_CHURN,
  COLOR_BY_FOLDER,
  COLOR_BY_LAYER,
  colorForChurn,
  colorForGroup,
  computeLayoutBuffer,
  DEFAULT_EDGE_CURVATURE,
  DEFAULT_EDGE_OPACITY,
  densityScale,
  DEFAULT_LABEL_MAX_CHARS,
  EDGE_ALPHA_DENSE,
  EDGE_ALPHA_FLAT,
  EDGE_ALPHA_FLOOR,
  EDGE_ALPHA_INVERSE,
  EDGE_ALPHA_MID,
  edgeAlphaShapeFor,
  edgeDensityForDegree,
  findNearestEdge,
  findNearestNode,
  findNearestNodeId,
  GROUP_PALETTE,
  interpolateGroupFadeStyle,
  interpolateMergeStyle,
  interpolateMergePositions,
  isBoxShape,
  LABEL_ZOOM_THRESHOLD,
  LAYOUT_MODE_FORCE,
  LAYOUT_MODE_GRID,
  LAYOUT_MODE_LAYERS,
  LAYOUT_MODE_METRO,
  LAYOUT_MODE_RADIAL,
  LAYOUT_MODES,
  MAX_PRINCIPAL_CHARACTER_LABELS,
  morphPositions,
  nodeTypesForPayload,
  selectPrincipalHubLabels,
  truncateLabel,
} from "../lib/graphRendererPayload.js";
import { buildScene, communityStats, nodeGroup } from "../lib/graphAdapter.js";

// --- BUG B: single source of truth for community → colour ---
// The legend swatch (communityStats[].color) and the canvas node fill
// (buildGraphRendererPayload -> colorForGroup(node.group)) must resolve a
// community to the SAME palette colour. Before the fix the legend assigned a
// DS category token by sorted position while the canvas hashed the name into
// GROUP_PALETTE — two independent schemes that diverged.
describe("community colour single source (BUG B)", () => {
  // 3 named communities of differing sizes so a sort-by-count legend would
  // reorder them (and, with the old scheme, recolour them away from the canvas).
  const GRAPH = {
    nodes: [
      { id: "a1", community_name: "Alpha big" },
      { id: "a2", community_name: "Alpha big" },
      { id: "a3", community_name: "Alpha big" },
      { id: "b1", community_name: "Beta mid" },
      { id: "b2", community_name: "Beta mid" },
      { id: "g1", community_name: "Gamma small" },
    ],
    links: [
      { source: "a1", target: "a2" },
      { source: "a2", target: "a3" },
      { source: "b1", target: "b2" },
      { source: "a1", target: "g1" },
    ],
  };

  it("colorForGroup is a stable palette lookup", () => {
    expect(GROUP_PALETTE).toContain(colorForGroup("Alpha big"));
    expect(colorForGroup("Alpha big")).toBe(colorForGroup("Alpha big"));
  });

  it("every legend swatch colour equals the canvas node fill for that community", () => {
    const scene = buildScene(GRAPH);
    const payload = buildGraphRendererPayload(scene, { nodeRadius: 3 });
    const { live } = communityStats(GRAPH);
    // The legend is sorted by descending count; the canvas is in node order.
    // Regardless of ordering, each community's legend colour must equal the
    // fill of EVERY one of its member nodes on the canvas.
    for (const community of live) {
      const memberNode = GRAPH.nodes.find((n) => n.community_name === community.key);
      const canvasColor = payload.nodeById.get(memberNode.id).color;
      expect(community.color, `legend ${community.key}`).toBe(canvasColor);
      expect(community.color).toBe(colorForGroup(nodeGroup(memberNode)));
    }
  });
});

// --- Item 1: density-aware base node size ---
describe("densityScale", () => {
  it("is 1 at or below the reference node count (1000 confirmed good)", () => {
    expect(densityScale(1)).toBe(1);
    expect(densityScale(500)).toBe(1);
    expect(densityScale(1000)).toBe(1);
  });

  it("shrinks the base radius as node count grows beyond the reference", () => {
    expect(densityScale(2000)).toBeLessThan(1);
    // sqrt(1000/4000) ~= 0.5
    expect(densityScale(4000)).toBeCloseTo(0.5, 5);
    // monotonically decreasing
    expect(densityScale(5000)).toBeLessThan(densityScale(2000));
  });

  it("never drops below the MIN floor (0.45)", () => {
    expect(densityScale(100000)).toBe(0.45);
    expect(densityScale(1e9)).toBe(0.45);
  });

  it("scales the effective node sizes in the payload while preserving the degree spread", () => {
    const dense = Array.from({ length: 4000 }, (_, i) => ({
      id: `n${i}`,
      label: `N${i}`,
      x: i,
      y: 0,
      weight: 1,
    }));
    const sparse = dense.slice(0, 500);
    const densePayload = buildGraphRendererPayload({ nodes: dense, edges: [] }, { nodeRadius: 3 });
    const sparsePayload = buildGraphRendererPayload({ nodes: sparse, edges: [] }, { nodeRadius: 3 });

    // Same weight, but the dense graph renders smaller base nodes.
    expect(densePayload.style.nodeSizes[0]).toBeLessThan(sparsePayload.style.nodeSizes[0]);
    // The ratio matches the density curve (sparse=1, dense=0.5).
    expect(densePayload.style.nodeSizes[0] / sparsePayload.style.nodeSizes[0]).toBeCloseTo(0.5, 5);
  });
});

// --- Item 2: boxed-label degree threshold ---
// Mirrors the degree-count + threshold logic GraphCanvas uses to pick which
// god-nodes get a permanent boxed label (degree >= ratio * maxDegree).
function labelSetFromPayload(payload, ratio = 0.15) {
  const graph = payload.renderGraph;
  const nodeCount = graph.nodeIds.length;
  const degrees = new Array(nodeCount).fill(0);
  const edgeCount = graph.edges.length / 2;
  for (let e = 0; e < edgeCount; e += 1) {
    degrees[graph.edges[e * 2]] += 1;
    degrees[graph.edges[e * 2 + 1]] += 1;
  }
  const max = Math.max(1, ...degrees);
  const threshold = ratio * max;
  const ids = [];
  for (let i = 0; i < nodeCount; i += 1) {
    if (degrees[i] >= threshold && degrees[i] > 0) ids.push(graph.nodeIds[i]);
  }
  return ids;
}

describe("boxed-label degree threshold (item 2)", () => {
  it("selects only nodes whose degree >= 0.15 * maxDegree", () => {
    // Hub "h" has degree 10; leaves l0..l9 each degree 1; "m" degree 2.
    const nodes = [
      { id: "h", label: "Hub", x: 0, y: 0, weight: 1 },
      { id: "m", label: "Mid", x: 50, y: 0, weight: 1 },
    ];
    const edges = [{ source: "h", target: "m" }];
    for (let i = 0; i < 9; i += 1) {
      nodes.push({ id: `l${i}`, label: `Leaf${i}`, x: i, y: 50, weight: 1 });
      edges.push({ source: "h", target: `l${i}` });
    }
    // give "m" a second edge so its degree is 2
    nodes.push({ id: "x", label: "X", x: 80, y: 50, weight: 1 });
    edges.push({ source: "m", target: "x" });

    const payload = buildGraphRendererPayload({ nodes, edges }, { nodeRadius: 3 });
    const labelled = labelSetFromPayload(payload, 0.15);

    // maxDegree = 10 (hub). threshold = 1.5 → only degree >= 2 qualifies: h (10), m (2).
    expect(labelled).toContain("h");
    expect(labelled).toContain("m");
    // leaves (degree 1) and x (degree 1) are below threshold → no label
    expect(labelled).not.toContain("l0");
    expect(labelled).not.toContain("x");
  });
});

// --- recon focal-pair parity: forceBoxLabel bypasses the label gate ---
describe("forceBoxLabel (reconciliation focal-pair override)", () => {
  it("forces the in-box label for flagged box nodes regardless of degree/god-class", () => {
    // Canonical "twin-a" is the god-class hub (high degree, type Character);
    // candidate "twin-b" is its low-degree unmerged twin: under the normal
    // gate it would get NO in-box label. Both are flagged + boxed by the
    // recon view, so BOTH must carry their label in nodeLabels.
    const nodes = [
      { id: "twin-a", label: "Dr. Watson", type: "Character", shape: "roundedbox", forceBoxLabel: true, x: 0, y: 0, weight: 1 },
      { id: "twin-b", label: "Dr. Watson", type: "Character", shape: "roundedbox", forceBoxLabel: true, x: 30, y: 0, weight: 1 },
    ];
    const edges = [{ source: "twin-a", target: "twin-b", relation: "≈ reconcile" }];
    for (let i = 0; i < 9; i += 1) {
      nodes.push({ id: `n${i}`, label: `N${i}`, type: "Character", shape: "diamond", x: i, y: 50, weight: 1 });
      edges.push({ source: "twin-a", target: `n${i}` });
    }

    const payload = buildGraphRendererPayload({ nodes, edges }, { nodeRadius: 3 });
    const aIdx = payload.nodeIndexById.get("twin-a");
    const bIdx = payload.nodeIndexById.get("twin-b");
    // Both twins: identical box shape code AND identical in-box label text.
    expect(payload.baseStyle.nodeShapes[aIdx]).toBe(payload.baseStyle.nodeShapes[bIdx]);
    expect(payload.baseStyle.nodeLabels[aIdx]).toBe("Dr. Watson");
    expect(payload.baseStyle.nodeLabels[bIdx]).toBe("Dr. Watson");
    // The label survives the connected-dim re-style (cloneStyle path).
    const dimmed = buildConnectedDimStyle(payload, { selectedIds: ["twin-a", "twin-b"] });
    expect(dimmed.nodeLabels[bIdx]).toBe("Dr. Watson");
  });

  it("does NOT force labels on unflagged nodes (main-view gate untouched)", () => {
    const nodes = [
      { id: "hub", label: "Hub", type: "Work", shape: "roundedbox", x: 0, y: 0, weight: 1 },
      { id: "leafbox", label: "LeafBox", type: "Work", shape: "roundedbox", x: 30, y: 0, weight: 1 },
    ];
    const edges = [{ source: "hub", target: "leafbox" }];
    for (let i = 0; i < 9; i += 1) {
      nodes.push({ id: `n${i}`, label: `N${i}`, type: "Work", shape: "dot", x: i, y: 50, weight: 1 });
      edges.push({ source: "hub", target: `n${i}` });
    }
    const payload = buildGraphRendererPayload({ nodes, edges }, { nodeRadius: 3 });
    const leafIdx = payload.nodeIndexById.get("leafbox");
    // Degree-1 box below the 15% gate: still NO in-box label without the flag.
    expect(payload.baseStyle.nodeLabels[leafIdx]).toBe("");
  });
});

// --- BUG-1: label truncation (overflow guard for long entity names) ---
describe("truncateLabel", () => {
  it("returns short labels unchanged", () => {
    expect(truncateLabel("Holmes", 22)).toBe("Holmes");
    expect(truncateLabel("Dr. Watson", 22)).toBe("Dr. Watson");
  });

  it("clips long labels and appends a single ellipsis", () => {
    const out = truncateLabel("Dr. John H. Watson, M.D., Late of the Army", 18);
    expect(out.endsWith("…")).toBe(true);
    // 18 visible glyphs (whitespace trimmed) + the ellipsis.
    expect([...out].length).toBeLessThanOrEqual(19);
    expect(out).toBe("Dr. John H. Watson…");
  });

  it("trims trailing whitespace before the ellipsis (no 'Foo …')", () => {
    expect(truncateLabel("Inspector Lestrade Yard", 10)).toBe("Inspector…");
  });

  it("disables clipping for a non-positive / non-finite budget", () => {
    const long = "x".repeat(100);
    expect(truncateLabel(long, 0)).toBe(long);
    expect(truncateLabel(long, Number.POSITIVE_INFINITY)).toBe(long);
  });

  it("coerces non-string input safely", () => {
    expect(truncateLabel(null)).toBe("");
    expect(truncateLabel(undefined)).toBe("");
  });

  it("uses DEFAULT_LABEL_MAX_CHARS when no budget is given", () => {
    const long = "y".repeat(DEFAULT_LABEL_MAX_CHARS + 5);
    const out = truncateLabel(long);
    expect([...out].length).toBe(DEFAULT_LABEL_MAX_CHARS + 1); // budget + ellipsis
  });
});

// --- BUG-1: the renderer payload caps the DRAWN in-box focal label ---
describe("buildGraphRendererPayload focal-box label truncation", () => {
  const longName = "Dr. John H. Watson, M.D., Late of the Army Medical Department";
  const makeScene = () => ({
    nodes: [
      { id: "twin-a", label: longName, type: "Character", shape: "roundedbox", forceBoxLabel: true, x: 0, y: 0, weight: 1 },
      { id: "twin-b", label: "Sherlock Holmes", type: "Character", shape: "roundedbox", forceBoxLabel: true, x: 30, y: 0, weight: 1 },
    ],
    edges: [{ source: "twin-a", target: "twin-b", relation: "≈ reconcile" }],
  });

  it("truncates the long focal-box label by default while keeping node.label full", () => {
    const payload = buildGraphRendererPayload(makeScene(), { nodeRadius: 3 });
    const aIdx = payload.nodeIndexById.get("twin-a");
    const drawn = payload.baseStyle.nodeLabels[aIdx];
    expect(drawn.endsWith("…")).toBe(true);
    expect(drawn.length).toBeLessThan(longName.length);
    // The full name is still on the payload node (hover tooltip source).
    expect(payload.nodeById.get("twin-a").label).toBe(longName);
  });

  it("honours an explicit labelMaxChars override", () => {
    const payload = buildGraphRendererPayload(makeScene(), { nodeRadius: 3, labelMaxChars: 6 });
    const aIdx = payload.nodeIndexById.get("twin-a");
    // "Dr. John...".slice(0,6) -> "Dr. Jo" (no trailing ws) -> "Dr. Jo…"
    expect(payload.baseStyle.nodeLabels[aIdx]).toBe("Dr. Jo…");
  });

  it("leaves short focal labels untouched (no spurious ellipsis)", () => {
    const payload = buildGraphRendererPayload(makeScene(), { nodeRadius: 3 });
    const bIdx = payload.nodeIndexById.get("twin-b");
    expect(payload.baseStyle.nodeLabels[bIdx]).toBe("Sherlock Holmes");
  });
});

// --- BUG-1 REGRESSION: main-graph box labels must truncate too (not only the
// recon focal pair — #160 fixed only forceBoxLabel; the chapter/work boxes on
// the ordinary graph still overflowed). ---
describe("buildGraphRendererPayload main-graph box label truncation (regression)", () => {
  const longChapter =
    "Part I, Chapter I: Being a Reprint of the Reminiscences of John H. Watson, M.D., Late of the Army Medical Department";
  // A box-shaped god-node (highest degree → boxed by the label gate) WITHOUT any
  // forceBoxLabel flag: exactly the main/workspace graph path where the bug lived.
  const makeMainScene = () => {
    const nodes = [
      { id: "chap", label: longChapter, type: "ChapterOrStory", shape: "roundedbox", x: 0, y: 0, weight: 1 },
    ];
    const edges = [];
    for (let i = 0; i < 12; i += 1) {
      nodes.push({ id: `e${i}`, label: `E${i}`, type: "Character", shape: "diamond", x: i, y: 40, weight: 1 });
      edges.push({ source: "chap", target: `e${i}` });
    }
    return { nodes, edges };
  };

  it("truncates a long main-graph box label (no forceBoxLabel) while keeping node.label full", () => {
    const payload = buildGraphRendererPayload(makeMainScene(), { nodeRadius: 3 });
    const idx = payload.nodeIndexById.get("chap");
    const drawn = payload.baseStyle.nodeLabels[idx];
    expect(drawn).toBeTruthy();
    expect(drawn.endsWith("…")).toBe(true);
    expect([...drawn].length).toBeLessThanOrEqual(DEFAULT_LABEL_MAX_CHARS + 1);
    // full name preserved on the payload node for the hover tooltip
    expect(payload.nodeById.get("chap").label).toBe(longChapter);
  });

  it("honours labelMaxChars on main-graph box nodes", () => {
    const payload = buildGraphRendererPayload(makeMainScene(), { nodeRadius: 3, labelMaxChars: 8 });
    const idx = payload.nodeIndexById.get("chap");
    expect([...payload.baseStyle.nodeLabels[idx]].length).toBeLessThanOrEqual(9);
  });
});

// --- Principal-character label LOD: top-K names at zoom-out, all when zoomed in.
// The god-class gate can label MANY Character hubs on a dense corpus; at zoom-out
// we keep only the K most important (highest-degree) names — the principal cast —
// and reveal the long tail past LABEL_ZOOM_THRESHOLD. ---
describe("selectPrincipalHubLabels (pure top-K-by-degree selection)", () => {
  // 8 hubs with DISTINCT degrees 1..8 (so the ranking is unambiguous).
  const hubs = Array.from({ length: 8 }, (_, i) => ({ index: i, degree: i + 1 }));

  it("keeps exactly the top-K highest-degree hubs when zoomed OUT", () => {
    const keep = selectPrincipalHubLabels(hubs, 0); // zoom 0 ≤ threshold
    expect(keep.size).toBe(MAX_PRINCIPAL_CHARACTER_LABELS);
    // degrees 8,7,6,5,4 → indices 7,6,5,4,3
    expect([...keep].sort((a, b) => a - b)).toEqual([3, 4, 5, 6, 7]);
    // the low-degree tail (indices 0,1,2) is dropped
    expect(keep.has(0)).toBe(false);
    expect(keep.has(2)).toBe(false);
  });

  it("reveals ALL gated hubs once zoomed in past the threshold", () => {
    const keep = selectPrincipalHubLabels(hubs, LABEL_ZOOM_THRESHOLD + 0.5);
    expect(keep.size).toBe(8);
  });

  it("is exactly at the threshold still treated as zoomed OUT (top-K only)", () => {
    const keep = selectPrincipalHubLabels(hubs, LABEL_ZOOM_THRESHOLD);
    expect(keep.size).toBe(MAX_PRINCIPAL_CHARACTER_LABELS);
  });

  it("breaks degree ties by lowest node index (deterministic)", () => {
    const tied = [
      { index: 5, degree: 10 },
      { index: 2, degree: 10 },
      { index: 9, degree: 10 },
    ];
    const keep = selectPrincipalHubLabels(tied, 0, { k: 2 });
    expect([...keep].sort((a, b) => a - b)).toEqual([2, 5]);
  });

  it("does not exceed the candidate count (fewer hubs than K)", () => {
    const keep = selectPrincipalHubLabels([{ index: 1, degree: 3 }], 0);
    expect(keep.size).toBe(1);
  });
});

describe("buildGraphRendererPayload principal-character label LOD (integration)", () => {
  // A clique of `hubCount` Character hubs (so each becomes a god-class labelled
  // box) plus `i` dedicated leaves on hub i, giving DISTINCT degrees
  // (hubCount-1)+i. Leaves are untyped degree-1 nodes (not boxes, not labelled).
  const characterHubGraph = (hubCount = 8) => {
    const nodes = [];
    const links = [];
    for (let i = 0; i < hubCount; i += 1) {
      nodes.push({ id: `c${i}`, label: `Character number ${i}`, node_type: "Character" });
    }
    for (let i = 0; i < hubCount; i += 1) {
      for (let j = i + 1; j < hubCount; j += 1) links.push({ source: `c${i}`, target: `c${j}` });
    }
    for (let i = 0; i < hubCount; i += 1) {
      for (let k = 0; k < i; k += 1) {
        const leaf = `c${i}_leaf${k}`;
        nodes.push({ id: leaf });
        links.push({ source: `c${i}`, target: leaf });
      }
    }
    return { nodes, links };
  };

  const labelOf = (payload, id) => payload.baseStyle.nodeLabels[payload.nodeIndexById.get(id)];
  const countLabels = (payload) =>
    payload.baseStyle.nodeLabels.filter((l) => typeof l === "string" && l.length > 0).length;

  it("labels exactly the top-K principal characters at the default (zoomed-out) view", () => {
    const scene = buildScene(characterHubGraph(8));
    const payload = buildGraphRendererPayload(scene, { nodeRadius: 3 }); // zoom omitted ⇒ out
    expect(countLabels(payload)).toBe(MAX_PRINCIPAL_CHARACTER_LABELS);
    // Highest-degree hubs c7..c3 keep their name; the c0..c2 tail is cleared.
    for (const id of ["c7", "c6", "c5", "c4", "c3"]) expect(labelOf(payload, id)).toBeTruthy();
    for (const id of ["c2", "c1", "c0"]) expect(labelOf(payload, id)).toBe("");
  });

  it("reveals every gated character name when zoomed in past the threshold", () => {
    const scene = buildScene(characterHubGraph(8));
    const payload = buildGraphRendererPayload(scene, {
      nodeRadius: 3,
      zoom: LABEL_ZOOM_THRESHOLD + 1,
    });
    expect(countLabels(payload)).toBe(8);
    for (let i = 0; i < 8; i += 1) expect(labelOf(payload, `c${i}`)).toBeTruthy();
  });

  it("does not regress a graph with ≤ K hubs (all stay labelled at any zoom)", () => {
    const scene = buildScene(characterHubGraph(3));
    const payload = buildGraphRendererPayload(scene, { nodeRadius: 3 });
    expect(countLabels(payload)).toBe(3);
  });
});

// --- legacy box parity: box nodes own their label (single text per box) ---
describe("isBoxShape", () => {
  it("recognises the box-category scene shapes (case-insensitive)", () => {
    expect(isBoxShape("box")).toBe(true);
    expect(isBoxShape("roundedbox")).toBe(true);
    expect(isBoxShape("RoundedBox")).toBe(true);
  });

  it("rejects every non-box shape (their labels may use the DOM overlay)", () => {
    for (const shape of ["dot", "diamond", "star", "hexagon", "triangle", "square", "", null, undefined]) {
      expect(isBoxShape(shape)).toBe(false);
    }
  });
});

// --- helpers for connected-dim tests ---
function makeTriangleScene() {
  return {
    nodes: [
      { id: "a", label: "Alpha", x: 0, y: 0, weight: 1, group: "G1" },
      { id: "b", label: "Beta", x: 100, y: 0, weight: 1, group: "G1" },
      { id: "c", label: "Gamma", x: 50, y: 80, weight: 1, group: "G2" },
      { id: "d", label: "Delta", x: -50, y: 80, weight: 1, group: "G2" },
    ],
    edges: [
      { source: "a", target: "b", relation: "links" },
      { source: "a", target: "c", relation: "links" },
      { source: "b", target: "d", relation: "links" },
    ],
    stats: { nodeCount: 4, edgeCount: 3, communityCount: 2 },
  };
}

describe("graphRendererPayload", () => {
  it("maps a studio scene into @sentropic/graph buffers with selection styling", () => {
    const payload = buildGraphRendererPayload(
      {
        nodes: [
          { id: "a", label: "Alpha", x: 0, y: 0, weight: 4, group: "Case", shape: "diamond" },
          { id: "b", label: "Beta", fx: 10, fy: 0, weight: 1, group: "Evidence", shape: "triangle" },
          { id: "c", label: "Gamma", weight: 1, group: "Evidence" },
        ],
        edges: [
          { source: "a", target: "b", relation: "appears_in", dash: "solid" },
          { source: "missing", target: "b", relation: "dangling", dash: "dashed" },
        ],
        stats: { nodeCount: 3, edgeCount: 2, weakEdgeCount: 0, communityCount: 2 },
      },
      { selectedIds: ["b"], focusId: "a", nodeRadius: 3 },
    );

    expect(payload.renderGraph.nodeIds).toEqual(["a", "b", "c"]);
    expect([...payload.renderGraph.edges]).toEqual([0, 1]);
    expect(payload.renderGraph.droppedEdges).toBe(1);
    expect([...payload.renderGraph.positions.slice(0, 4)]).toEqual([0, 0, 10, 0]);
    expect(payload.style.nodeSizes[0]).toBeGreaterThan(payload.style.nodeSizes[1]);
    expect([...payload.style.nodeShapes]).toEqual([1, 6, 0]);
    expect([...payload.style.nodeColors.slice(0, 4)]).toEqual([239, 68, 68, 255]);
    expect([...payload.style.nodeColors.slice(4, 8)]).toEqual([37, 99, 235, 255]);
  });

  it("finds the closest node in world coordinates", () => {
    const payload = buildGraphRendererPayload({
      nodes: [
        { id: "a", label: "Alpha", x: 0, y: 0, weight: 1 },
        { id: "b", label: "Beta", x: 100, y: 0, weight: 1 },
      ],
      edges: [],
      stats: { nodeCount: 2, edgeCount: 0, weakEdgeCount: 0, communityCount: 1 },
    });

    expect(findNearestNodeId(payload, 102, 1, 12)).toBe("b");
    expect(findNearestNodeId(payload, 50, 0, 12)).toBeNull();
  });

  it("findNearestNode reports the hit id, distance, and drawn radius (item 1.3)", () => {
    const payload = buildGraphRendererPayload({
      nodes: [
        { id: "a", label: "Alpha", x: 0, y: 0, weight: 1 },
        { id: "b", label: "Beta", x: 100, y: 0, weight: 1 },
      ],
      edges: [],
      stats: { nodeCount: 2, edgeCount: 0, weakEdgeCount: 0, communityCount: 1 },
    });

    const hit = findNearestNode(payload, 103, 4, 12);
    expect(hit.id).toBe("b");
    expect(hit.distance).toBeCloseTo(5, 6); // hypot(3, 4)
    expect(hit.radius).toBeGreaterThan(0);
    // Out of every node's pick zone → null (parity with findNearestNodeId).
    expect(findNearestNode(payload, 50, 0, 12)).toBeNull();
  });

  it("finds the closest styled edge in world coordinates for hover", () => {
    const payload = buildGraphRendererPayload({
      nodes: [
        { id: "a", label: "Alpha", x: 0, y: 0, weight: 1 },
        { id: "b", label: "Beta", x: 100, y: 0, weight: 1 },
      ],
      edges: [{ source: "a", target: "b", relation: "assists", dash: "dashed", weak: true }],
      stats: { nodeCount: 2, edgeCount: 1, weakEdgeCount: 1, communityCount: 1 },
    });

    const hit = findNearestEdge(payload, 50, 4, 12);

    expect(hit.edge.relation).toBe("assists");
    expect(hit.sourceLabel).toBe("Alpha");
    expect(hit.targetLabel).toBe("Beta");
    expect(findNearestEdge(payload, 50, 50, 12)).toBeNull();
  });

  it("interpolates merge positions by pulling the source node into the target", () => {
    const payload = buildGraphRendererPayload({
      nodes: [
        { id: "candidate", label: "Candidate", x: 0, y: 0, weight: 1 },
        { id: "canonical", label: "Canonical", x: 100, y: 40, weight: 1 },
        { id: "neighbor", label: "Neighbor", x: -20, y: 10, weight: 1 },
      ],
      edges: [
        { source: "candidate", target: "neighbor", relation: "mentions" },
        { source: "neighbor", target: "candidate", relation: "seen_by" },
      ],
      stats: { nodeCount: 3, edgeCount: 2, weakEdgeCount: 0, communityCount: 1 },
    });

    const positions = interpolateMergePositions(payload, { from: "candidate", into: "canonical" }, 0.5);

    expect([...positions]).toEqual([50, 20, 100, 40, -20, 10]);
    expect([...payload.renderGraph.positions]).toEqual([0, 0, 100, 40, -20, 10]);
  });

  // --- connected-dim: hoveredNodeId ---
  it("dims non-neighbour nodes and their edges when hoveredNodeId is set", () => {
    const scene = makeTriangleScene();
    // Hover on "a": neighbours are b and c. d is NOT a neighbour.
    const payload = buildGraphRendererPayload(scene, { hoveredNodeId: "a", nodeRadius: 3 });

    const nodeIndexById = payload.nodeIndexById;
    const iA = nodeIndexById.get("a");
    const iB = nodeIndexById.get("b");
    const iC = nodeIndexById.get("c");
    const iD = nodeIndexById.get("d");

    // focused node (a) and its direct neighbours (b, c) stay fully opaque
    expect(payload.style.nodeColors[iA * 4 + 3]).toBe(255);
    expect(payload.style.nodeColors[iB * 4 + 3]).toBe(255);
    expect(payload.style.nodeColors[iC * 4 + 3]).toBe(255);

    // d is NOT a neighbour → dimmed to ≤ 90 (255 * 0.35 ≈ 89)
    expect(payload.style.nodeColors[iD * 4 + 3]).toBeLessThanOrEqual(90);
  });

  it("recomputes connected-dim style from base buffers without rebuilding graph buffers", () => {
    const scene = makeTriangleScene();
    const payload = buildGraphRendererPayload(scene, { nodeRadius: 3 });

    const hoverStyle = buildConnectedDimStyle(payload, { hoveredNodeId: "a" });

    expect(hoverStyle).not.toBe(payload.style);
    expect(payload.renderGraph.nodeIds).toEqual(["a", "b", "c", "d"]);
    expect(payload.baseStyle.nodeColors[payload.nodeIndexById.get("d") * 4 + 3]).toBe(255);
    expect(hoverStyle.nodeColors[payload.nodeIndexById.get("d") * 4 + 3]).toBeLessThanOrEqual(90);
  });

  // Representation-polish remark 1: main-graph edges are ~0.5 alpha (128) by
  // DEFAULT (not opaque); on hover, INCIDENT edges stay at that base ~0.5+
  // (untouched by the dim loop) while NON-incident edges dim FURTHER, to
  // ~0.15 (38) — well below the 0.35 (89) node dim, since edges are mostly
  // noise once a node is focused.
  it("dims non-incident edges FURTHER than nodes when hoveredNodeId is set", () => {
    const scene = makeTriangleScene();
    // a → b (index 0), a → c (index 1), b → d (index 2)
    // Hover "a": edges 0 and 1 are incident → base alpha; edge 2 is not → dimmed
    const payload = buildGraphRendererPayload(scene, { hoveredNodeId: "a", nodeRadius: 3 });
    const graph = payload.renderGraph;
    const iA = payload.nodeIndexById.get("a");
    const edgeCount = graph.edges.length / 2;

    for (let e = 0; e < edgeCount; e++) {
      const src = graph.edges[e * 2];
      const tgt = graph.edges[e * 2 + 1];
      const isIncident = src === iA || tgt === iA;
      const alpha = payload.style.edgeColors[e * 4 + 3];
      if (isIncident) {
        expect(alpha).toBe(128); // EDGE_BASE_ALPHA: 255 * 0.5, untouched by the dim
      } else {
        expect(alpha).toBe(38); // EDGE_DIM_ALPHA: 255 * 0.15, rounded
      }
    }
  });

  it("renders main-graph edges at ~0.5 alpha by default (no selection/hover/focus)", () => {
    const scene = makeTriangleScene();
    const payload = buildGraphRendererPayload(scene, { nodeRadius: 3 });
    const edgeCount = payload.renderGraph.edges.length / 2;
    for (let e = 0; e < edgeCount; e++) {
      expect(payload.style.edgeColors[e * 4 + 3]).toBe(128); // 255 * 0.5
    }
  });

  it("grades the density falloff via edgeAlphaShape (not the base alpha) at the dense endpoint", () => {
    const nodes = [
      { id: "hub", x: 0, y: 0 },
      { id: "mid", x: 0, y: 100 },
      { id: "low-a", x: 0, y: 200 },
      { id: "low-b", x: 100, y: 200 },
      ...Array.from({ length: 32 }, (_, i) => ({ id: `hub-${i}`, x: 100, y: i })),
      ...Array.from({ length: 8 }, (_, i) => ({ id: `mid-${i}`, x: 100, y: 100 + i })),
    ];
    const edges = [
      { source: "low-a", target: "low-b" },
      ...Array.from({ length: 32 }, (_, i) => ({ source: "hub", target: `hub-${i}` })),
      ...Array.from({ length: 8 }, (_, i) => ({ source: "mid", target: `mid-${i}` })),
    ];
    const payload = buildGraphRendererPayload({ nodes, edges });
    const renderedIndexOf = (inputIndex) =>
      Array.from(payload.renderGraph.edgeInputIndices).indexOf(inputIndex);
    const baseAlphaForInputEdge = (inputIndex) =>
      payload.baseStyle.edgeColors[renderedIndexOf(inputIndex) * 4 + 3];
    // m0 = the SOURCE-endpoint multiplier of the along-edge shape (each edge here
    // is authored source=hub/mid/low, so m0 carries that endpoint's density).
    const sourceShapeForInputEdge = (inputIndex) =>
      payload.baseStyle.edgeAlphaShape[renderedIndexOf(inputIndex) * 3];

    // The BASE alpha is now the flat edgeOpacity default (0.5 → 128) for EVERY
    // edge; density no longer bends it — the shape does.
    expect(baseAlphaForInputEdge(0)).toBe(128);
    expect(baseAlphaForInputEdge(1)).toBe(128);
    expect(baseAlphaForInputEdge(33)).toBe(128);

    const lowShape = sourceShapeForInputEdge(0); // low-a source, degree 1
    const hubShape = sourceShapeForInputEdge(1); // hub source, degree 32
    const midShape = sourceShapeForInputEdge(33); // mid source, degree 8

    // A rare endpoint stays opaque (255); denser endpoints fade toward the floor.
    expect(lowShape).toBe(255);
    expect(midShape).toBeLessThan(lowShape);
    expect(hubShape).toBeLessThan(midShape);
    // Never below the faint floor (0.15 · 255 ≈ 38).
    expect(hubShape).toBeGreaterThanOrEqual(Math.round(255 * EDGE_ALPHA_FLOOR));
  });

  it("dims non-neighbour nodes when a node is selected (selectedIds)", () => {
    const scene = makeTriangleScene();
    // Select "b": neighbours are a and d. c is NOT a direct neighbour of b.
    const payload = buildGraphRendererPayload(scene, { selectedIds: ["b"], nodeRadius: 3 });
    const iA = payload.nodeIndexById.get("a");
    const iB = payload.nodeIndexById.get("b");
    const iC = payload.nodeIndexById.get("c");
    const iD = payload.nodeIndexById.get("d");

    expect(payload.style.nodeColors[iA * 4 + 3]).toBe(255); // neighbour of b
    expect(payload.style.nodeColors[iB * 4 + 3]).toBe(255); // selected itself
    expect(payload.style.nodeColors[iD * 4 + 3]).toBe(255); // neighbour of b
    expect(payload.style.nodeColors[iC * 4 + 3]).toBeLessThanOrEqual(90); // not a neighbour
  });

  it("does NOT dim anything when neither selectedIds nor hoveredNodeId are provided", () => {
    const scene = makeTriangleScene();
    const payload = buildGraphRendererPayload(scene, { nodeRadius: 3 });
    const nodeCount = payload.renderGraph.nodeIds.length;
    for (let i = 0; i < nodeCount; i++) {
      expect(payload.style.nodeColors[i * 4 + 3]).toBe(255);
    }
  });

  it("fades the merging source node and its incident edges during merge", () => {
    const payload = buildGraphRendererPayload({
      nodes: [
        { id: "candidate", label: "Candidate", x: 0, y: 0, weight: 1 },
        { id: "canonical", label: "Canonical", x: 100, y: 40, weight: 1 },
        { id: "neighbor", label: "Neighbor", x: -20, y: 10, weight: 1 },
      ],
      edges: [
        { source: "candidate", target: "neighbor", relation: "mentions" },
        { source: "canonical", target: "neighbor", relation: "seen_by" },
      ],
      stats: { nodeCount: 3, edgeCount: 2, weakEdgeCount: 0, communityCount: 1 },
    });

    const style = interpolateMergeStyle(payload, { from: "candidate", into: "canonical" }, 0.5);

    expect(style.nodeColors[3]).toBe(128);
    // Edge 0 (candidate→neighbor) is incident to the merging "from" node: its
    // base alpha (128, EDGE_BASE_ALPHA — remark 1's ~0.5 default) is halved
    // by the merge fade (alphaScale 0.5) → 64.
    expect(style.edgeColors[3]).toBe(64);
    // Edge 1 (canonical→neighbor) is NOT incident to "candidate" → untouched,
    // stays at the base ~0.5 alpha (128).
    expect(style.edgeColors[7]).toBe(128);
    expect(payload.style.nodeColors[3]).toBe(255);
  });
});

// --- Collapse/expand group animation: interpolateGroupFadeStyle --------------
// The SET generalization of interpolateMergeStyle used by the group transition:
// fade + shrink a whole set of folding/revealing nodes and their incident edges.
describe("interpolateGroupFadeStyle (collapse/expand fade)", () => {
  const makePayload = () =>
    buildGraphRendererPayload({
      nodes: [
        { id: "a", label: "A", x: 0, y: 0, weight: 1 },
        { id: "b", label: "B", x: 100, y: 40, weight: 1 },
        { id: "c", label: "C", x: -20, y: 10, weight: 1 },
      ],
      edges: [
        { source: "a", target: "c", relation: "mentions" },
        { source: "b", target: "c", relation: "seen_by" },
      ],
      stats: { nodeCount: 3, edgeCount: 2, weakEdgeCount: 0, communityCount: 1 },
    });

  it("fades + shrinks the folding set and its incident edges, leaving others intact", () => {
    const payload = makePayload();
    const baseSizeA = payload.style.nodeSizes[0];
    // Fold node index 0 ("a") at half alpha, half size.
    const style = interpolateGroupFadeStyle(payload, new Set([0]), 0.5, 0.5);
    // Node a: alpha 255→128, size halved.
    expect(style.nodeColors[3]).toBe(128);
    expect(style.nodeSizes[0]).toBeCloseTo(baseSizeA * 0.5, 5);
    // Node b (not folding) untouched.
    expect(style.nodeColors[7]).toBe(255);
    expect(style.nodeSizes[1]).toBe(payload.style.nodeSizes[1]);
    // Edge 0 (a→c) is incident to a → its base alpha (128) halved to 64.
    expect(style.edgeColors[3]).toBe(64);
    // Edge 1 (b→c) not incident to a → untouched.
    expect(style.edgeColors[7]).toBe(128);
    // The base style is never mutated (a fresh clone is returned).
    expect(payload.style.nodeColors[3]).toBe(255);
    expect(payload.style.nodeSizes[0]).toBe(baseSizeA);
  });

  it("t=0 fully hides (alpha 0) and t=1 (scale 1) is byte-identical to base alpha", () => {
    const payload = makePayload();
    const hidden = interpolateGroupFadeStyle(payload, new Set([0]), 0, 1);
    expect(hidden.nodeColors[3]).toBe(0);
    expect(hidden.edgeColors[3]).toBe(0);
    const full = interpolateGroupFadeStyle(payload, new Set([0]), 1, 1);
    expect(full.nodeColors[3]).toBe(payload.style.nodeColors[3]);
    expect(full.edgeColors[3]).toBe(payload.style.edgeColors[3]);
  });

  it("returns the base style unchanged when the folding set is empty", () => {
    const payload = makePayload();
    expect(interpolateGroupFadeStyle(payload, new Set(), 0.5)).toBe(payload.style);
  });

  it("clamps alpha/size scales to [0,1] and accepts any iterable of indices", () => {
    const payload = makePayload();
    // Out-of-range scales clamp; an array (not a Set) is accepted.
    const style = interpolateGroupFadeStyle(payload, [0], 5, -3);
    expect(style.nodeColors[3]).toBe(255); // alpha clamped to 1
    expect(style.nodeSizes[0]).toBe(0); // size clamped to 0
  });
});

// --- codeflow-parity Lot 1: layout switcher seam + all-node morph tween ------
// morphPositions generalizes the one-node merge lerp into a per-index morph
// between two index-parallel buffers; computeLayoutBuffer is the studio↔registry
// seam that resolves a mode ("layers" → typed-layer, "force" → cached buffer).
describe("layout switcher seam (Lot 1) — morphPositions / computeLayoutBuffer", () => {
  const makeTypedScene = () => ({
    nodes: [
      { id: "a", label: "A", type: "Character", x: 10, y: 10, weight: 1 },
      { id: "b", label: "B", type: "Character", x: 20, y: 20, weight: 1 },
      { id: "c", label: "C", type: "Location", x: 30, y: 30, weight: 1 },
      { id: "d", label: "D", x: 40, y: 40, weight: 1 }, // untyped
    ],
    edges: [{ source: "a", target: "b", relation: "knows" }],
    stats: { nodeCount: 4, edgeCount: 1, weakEdgeCount: 0, communityCount: 1 },
  });

  it("morphPositions: t=0 → bufA, t=1 → bufB, midpoint = average, all nodes moved", () => {
    const bufA = new Float32Array([0, 0, 10, 10, -4, 8]);
    const bufB = new Float32Array([2, 2, 30, -10, 0, 0]);

    expect(Array.from(morphPositions(bufA, bufB, 0))).toEqual(Array.from(bufA));
    expect(Array.from(morphPositions(bufA, bufB, 1))).toEqual(Array.from(bufB));

    const mid = morphPositions(bufA, bufB, 0.5);
    for (let i = 0; i < bufA.length; i += 1) {
      expect(mid[i]).toBeCloseTo((bufA[i] + bufB[i]) / 2, 5);
    }
    // EVERY node moved between the endpoints (no correspondence problem: all
    // 2·nodeCount floats are lerped in one loop).
    const nodeCount = bufA.length / 2;
    for (let n = 0; n < nodeCount; n += 1) {
      expect(mid[n * 2]).not.toBe(bufA[n * 2]);
      expect(mid[n * 2 + 1]).not.toBe(bufA[n * 2 + 1]);
    }
  });

  it("morphPositions clamps t to [0,1] and reuses a supplied out buffer", () => {
    const bufA = new Float32Array([0, 0]);
    const bufB = new Float32Array([10, 20]);
    expect(Array.from(morphPositions(bufA, bufB, -1))).toEqual([0, 0]);
    expect(Array.from(morphPositions(bufA, bufB, 2))).toEqual([10, 20]);
    const out = new Float32Array(2);
    const result = morphPositions(bufA, bufB, 1, out);
    expect(result).toBe(out); // reused, no fresh allocation
    expect(Array.from(out)).toEqual([10, 20]);
  });

  it("morphPositions returns null on missing input", () => {
    expect(morphPositions(null, new Float32Array(2), 0.5)).toBeNull();
    expect(morphPositions(new Float32Array(2), null, 0.5)).toBeNull();
  });

  it("nodeTypesForPayload reads node_type node-order-keyed (parallel to nodeIds)", () => {
    const payload = buildGraphRendererPayload(makeTypedScene(), { nodeRadius: 3 });
    const types = nodeTypesForPayload(payload);
    expect(types.length).toBe(payload.renderGraph.nodeIds.length);
    for (let i = 0; i < types.length; i += 1) {
      const id = payload.renderGraph.nodeIds[i];
      expect(types[i]).toBe(payload.nodeById.get(id)?.node_type ?? null);
    }
    expect(types[payload.nodeIndexById.get("d")]).toBeNull(); // untyped node
  });

  it("computeLayoutBuffer('layers') bands typed nodes into swimlanes (2·n floats)", () => {
    const payload = buildGraphRendererPayload(makeTypedScene(), { nodeRadius: 3 });
    const n = payload.renderGraph.nodeIds.length;
    const layers = computeLayoutBuffer(payload, LAYOUT_MODE_LAYERS);

    expect(layers).toBeInstanceOf(Float32Array);
    expect(layers.length).toBe(n * 2);

    const iA = payload.nodeIndexById.get("a");
    const iB = payload.nodeIndexById.get("b");
    const iC = payload.nodeIndexById.get("c");
    // Same type ⇒ same lane (y); different type ⇒ different lane.
    expect(layers[iA * 2 + 1]).toBe(layers[iB * 2 + 1]);
    expect(layers[iA * 2 + 1]).not.toBe(layers[iC * 2 + 1]);
    // The target differs from the (force) input positions → a real morph.
    expect(Array.from(layers)).not.toEqual(Array.from(payload.renderGraph.positions));
  });

  it("computeLayoutBuffer('force') returns a COPY of the cached buffer (no cold re-solve)", () => {
    const payload = buildGraphRendererPayload(makeTypedScene(), { nodeRadius: 3 });
    const n = payload.renderGraph.nodeIds.length;
    const cached = new Float32Array(n * 2).fill(3);
    const out = computeLayoutBuffer(payload, LAYOUT_MODE_FORCE, { forceBuffer: cached });
    expect(Array.from(out)).toEqual(Array.from(cached));
    expect(out).not.toBe(cached); // fresh copy, never the caller's buffer
  });

  it("computeLayoutBuffer('force') falls back to the current positions without a cache", () => {
    const payload = buildGraphRendererPayload(makeTypedScene(), { nodeRadius: 3 });
    const out = computeLayoutBuffer(payload, LAYOUT_MODE_FORCE);
    expect(Array.from(out)).toEqual(Array.from(payload.renderGraph.positions));
  });

  it("computeLayoutBuffer degrades to null for a missing payload", () => {
    expect(computeLayoutBuffer(null, LAYOUT_MODE_LAYERS)).toBeNull();
  });

  // --- Lots 2/6: Radial + Grid + Metro appear in the switcher --------------
  it("the switcher offers Force / Radial / Layers / Grid / Metro", () => {
    const ids = LAYOUT_MODES.map((m) => m.id);
    expect(ids).toEqual([
      LAYOUT_MODE_FORCE,
      LAYOUT_MODE_RADIAL,
      LAYOUT_MODE_LAYERS,
      LAYOUT_MODE_GRID,
      LAYOUT_MODE_METRO,
    ]);
    expect(LAYOUT_MODES.map((m) => m.label)).toEqual(["Force", "Radial", "Layers", "Grid", "Metro"]);
  });

  it("every switcher mode yields a valid 2·n buffer via computeLayoutBuffer", () => {
    const payload = buildGraphRendererPayload(makeTypedScene(), { nodeRadius: 3 });
    const n = payload.renderGraph.nodeIds.length;
    const cached = new Float32Array(n * 2).fill(2);
    for (const mode of LAYOUT_MODES) {
      const buf = computeLayoutBuffer(payload, mode.id, { forceBuffer: cached });
      expect(buf, `mode ${mode.id}`).toBeInstanceOf(Float32Array);
      expect(buf.length, `mode ${mode.id}`).toBe(n * 2);
      for (const v of buf) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("computeLayoutBuffer('radial') hubs the highest-degree node at the origin", () => {
    const payload = buildGraphRendererPayload(makeTypedScene(), { nodeRadius: 3 });
    const n = payload.renderGraph.nodeIds.length;
    const radial = computeLayoutBuffer(payload, LAYOUT_MODE_RADIAL);
    expect(radial).toBeInstanceOf(Float32Array);
    expect(radial.length).toBe(n * 2);
    // In makeTypedScene, a & b share the only edge → degree 1 (max); a (earlier)
    // is the hub at the origin.
    const iA = payload.nodeIndexById.get("a");
    expect(radial[iA * 2]).toBe(0);
    expect(radial[iA * 2 + 1]).toBe(0);
  });

  it("computeLayoutBuffer('grid') lays nodes on a centred ceil(√n) grid", () => {
    const payload = buildGraphRendererPayload(makeTypedScene(), { nodeRadius: 3 });
    const n = payload.renderGraph.nodeIds.length; // 4 → 2×2 grid
    const grid = computeLayoutBuffer(payload, LAYOUT_MODE_GRID);
    expect(grid).toBeInstanceOf(Float32Array);
    expect(grid.length).toBe(n * 2);
    // Centred bounding box: x and y extents are symmetric around 0.
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < grid.length; i += 2) {
      minX = Math.min(minX, grid[i]); maxX = Math.max(maxX, grid[i]);
      minY = Math.min(minY, grid[i + 1]); maxY = Math.max(maxY, grid[i + 1]);
    }
    expect(minX + maxX).toBeCloseTo(0, 5);
    expect(minY + maxY).toBeCloseTo(0, 5);
    // A real morph target (differs from the force input positions).
    expect(Array.from(grid)).not.toEqual(Array.from(payload.renderGraph.positions));
  });

  // Representation-polish remark 3: edge hover must work in EVERY layout, not
  // just Force. GraphCanvas.settleLayout persists the settled buffer into
  // `payload.renderGraph.positions` IN PLACE (`positions.set(buffer)`), and
  // handlePointerMove reads findNearestEdge off that SAME array — this locks
  // in that (a) findNearestEdge sees the settled non-Force positions right
  // after a "settle", (b) it still sees them after a later payload rebuild
  // (selection/hover/display-style change) re-applies the active layout
  // buffer on top of a freshly-built payload (reapplyLayoutPositions), for
  // EVERY registered layout mode.
  describe("edge hover after a layout settles (remark 3)", () => {
    const makeRingScene = (n = 8) => {
      const nodes = Array.from({ length: n }, (_, i) => ({ id: `n${i}`, label: `N${i}` }));
      const edges = Array.from({ length: n }, (_, i) => ({ source: `n${i}`, target: `n${(i + 1) % n}` }));
      return { nodes, edges };
    };

    for (const mode of LAYOUT_MODES) {
      it(`findNearestEdge hits an edge midpoint right after settling "${mode.id}"`, () => {
        const scene = makeRingScene();
        const payload = buildGraphRendererPayload(scene, { nodeRadius: 3 });
        const forceBase = new Float32Array(payload.renderGraph.positions);

        const settled = computeLayoutBuffer(payload, mode.id, { forceBuffer: forceBase });
        // Mirror GraphCanvas.settleLayout: mutate renderGraph.positions IN PLACE.
        payload.renderGraph.positions.set(settled);

        const iA = payload.nodeIndexById.get("n0");
        const iB = payload.nodeIndexById.get("n1");
        const midX = (payload.renderGraph.positions[iA * 2] + payload.renderGraph.positions[iB * 2]) / 2;
        const midY = (payload.renderGraph.positions[iA * 2 + 1] + payload.renderGraph.positions[iB * 2 + 1]) / 2;

        const hit = findNearestEdge(payload, midX, midY, 40);
        expect(hit, `mode ${mode.id}`).not.toBeNull();
        expect([hit.edge.source, hit.edge.target]).toEqual(["n0", "n1"]);
      });

      it(`findNearestEdge still hits after a payload REBUILD re-applies the settled "${mode.id}" buffer`, () => {
        const scene = makeRingScene();
        let payload = buildGraphRendererPayload(scene, { nodeRadius: 3 });
        const forceBase = new Float32Array(payload.renderGraph.positions);
        const settled = computeLayoutBuffer(payload, mode.id, { forceBuffer: forceBase });
        payload.renderGraph.positions.set(settled);
        const activeLayoutBuffer = new Float32Array(settled);

        // Mirror rebuildPayload(): a FRESH payload (fresh, force-baked positions)
        // with reapplyLayoutPositions re-applying the settled buffer on top —
        // exactly what a selection/hover/display-style change triggers.
        const rebuilt = buildGraphRendererPayload(scene, { selectedIds: ["n0"], nodeRadius: 3 });
        rebuilt.renderGraph.positions.set(activeLayoutBuffer);

        const iA = rebuilt.nodeIndexById.get("n0");
        const iB = rebuilt.nodeIndexById.get("n1");
        const midX = (rebuilt.renderGraph.positions[iA * 2] + rebuilt.renderGraph.positions[iB * 2]) / 2;
        const midY = (rebuilt.renderGraph.positions[iA * 2 + 1] + rebuilt.renderGraph.positions[iB * 2 + 1]) / 2;

        const hit = findNearestEdge(rebuilt, midX, midY, 40);
        expect(hit, `mode ${mode.id}`).not.toBeNull();
        expect([hit.edge.source, hit.edge.target]).toEqual(["n0", "n1"]);
      });
    }
  });
});

// --- codeflow-parity Lot 4: Curved-links toggle + Color-by (Folder / Layer) ---
// R3: curved links are a per-edge 0↔0.15 scalar (both backends already draw the
// curve). R4: Color-by re-keys the categorical node colour — Folder (default) on
// community/container (node.group), Layer on the typed layer (node_type). Both
// re-style with NO layout recompute; defaults MUST stay byte-identical to before.
describe("Curved-links toggle (Lot 4, R3)", () => {
  const makeEdgeScene = () => ({
    nodes: [
      { id: "a", label: "A", x: 0, y: 0, weight: 1, group: "G1" },
      { id: "b", label: "B", x: 100, y: 0, weight: 1, group: "G1" },
    ],
    // A plain edge with NO explicit curvature → the default scalar applies.
    edges: [{ source: "a", target: "b", relation: "links" }],
    stats: { nodeCount: 2, edgeCount: 1, weakEdgeCount: 0, communityCount: 1 },
  });

  it("defaults to the current curved behaviour (0.15) when the option is unset", () => {
    const payload = buildGraphRendererPayload(makeEdgeScene(), { nodeRadius: 3 });
    expect(payload.style.edgeCurvatures[0]).toBeCloseTo(DEFAULT_EDGE_CURVATURE, 6);
    expect(DEFAULT_EDGE_CURVATURE).toBe(0.15);
    // The emitted per-edge input carries the same scalar.
    expect(payload.edges[0].curvature).toBeCloseTo(0.15, 6);
  });

  it("OFF → 0 (straight) and ON → 0.15, flipping the curvature the builder emits", () => {
    const straight = buildGraphRendererPayload(makeEdgeScene(), { nodeRadius: 3, curvedLinks: false });
    const curved = buildGraphRendererPayload(makeEdgeScene(), { nodeRadius: 3, curvedLinks: true });
    expect(straight.style.edgeCurvatures[0]).toBe(0);
    expect(curved.style.edgeCurvatures[0]).toBeCloseTo(0.15, 6);
    expect(straight.edges[0].curvature).toBe(0);
    expect(curved.edges[0].curvature).toBeCloseTo(0.15, 6);
  });

  it("explicit curvedLinks:true is byte-identical to the unset default", () => {
    const def = buildGraphRendererPayload(makeEdgeScene(), { nodeRadius: 3 });
    const on = buildGraphRendererPayload(makeEdgeScene(), { nodeRadius: 3, curvedLinks: true });
    expect(Array.from(on.style.edgeCurvatures)).toEqual(Array.from(def.style.edgeCurvatures));
  });
});

describe("Color-by Folder vs Layer (Lot 4, R4)", () => {
  // group ("Folder-A") and node_type ("Layer-Z") hash to DIFFERENT palette slots
  // (7 vs 1) so the two keyings produce a visibly different node fill.
  const GROUP = "Folder-A";
  const TYPE = "Layer-Z";
  const makeScene = () => ({
    nodes: [{ id: "a", label: "A", x: 0, y: 0, weight: 1, group: GROUP, type: TYPE }],
    edges: [],
    stats: { nodeCount: 1, edgeCount: 0, weakEdgeCount: 0, communityCount: 1 },
  });

  it("precondition: the two keys map to distinct palette colours", () => {
    expect(colorForGroup(GROUP)).not.toBe(colorForGroup(TYPE));
  });

  it("defaults to Folder (community/container) keying when colorBy is unset", () => {
    const payload = buildGraphRendererPayload(makeScene(), { nodeRadius: 3 });
    expect(payload.nodeById.get("a").color).toBe(colorForGroup(GROUP));
  });

  it("Folder keys the node colour on node.group; Layer keys it on node_type", () => {
    const folder = buildGraphRendererPayload(makeScene(), { nodeRadius: 3, colorBy: COLOR_BY_FOLDER });
    const layer = buildGraphRendererPayload(makeScene(), { nodeRadius: 3, colorBy: COLOR_BY_LAYER });
    expect(folder.nodeById.get("a").color).toBe(colorForGroup(GROUP));
    expect(layer.nodeById.get("a").color).toBe(colorForGroup(TYPE));
    // Switching the axis actually re-colours the node in the style buffer.
    expect(Array.from(layer.style.nodeColors)).not.toEqual(Array.from(folder.style.nodeColors));
  });

  it("explicit colorBy:'folder' is byte-identical to the unset default", () => {
    const def = buildGraphRendererPayload(makeScene(), { nodeRadius: 3 });
    const folder = buildGraphRendererPayload(makeScene(), { nodeRadius: 3, colorBy: COLOR_BY_FOLDER });
    expect(Array.from(folder.style.nodeColors)).toEqual(Array.from(def.style.nodeColors));
  });

  it("selection / focus colour still overrides both keyings", () => {
    const payload = buildGraphRendererPayload(makeScene(), {
      nodeRadius: 3,
      colorBy: COLOR_BY_LAYER,
      selectedIds: ["a"],
    });
    // Selected node uses SELECTED_COLOR (#2563eb → 37,99,235), not the layer hue.
    expect([...payload.baseStyle.nodeColors.slice(0, 3)]).toEqual([37, 99, 235]);
  });
});

// --- codeflow-parity Lot 5: Color-by Churn (degree/activity fallback first) ---
describe("Color-by Churn heat ramp (Lot 5, R4/D2)", () => {
  it("exports a deterministic low→high sequential ramp", () => {
    expect(colorForChurn(0)).toBe("#e2e8f0");
    expect(colorForChurn(1)).toBe("#ef4444");
    expect(colorForChurn(-1)).toBe("#e2e8f0");
    expect(colorForChurn(2)).toBe("#ef4444");
  });

  it("uses explicit churn/activity scalars when present", () => {
    const payload = buildGraphRendererPayload(
      {
        nodes: [
          { id: "cold", x: 0, y: 0, churn: 0 },
          { id: "hot", x: 1, y: 1, churn: 10 },
        ],
        edges: [],
      },
      { nodeRadius: 3, colorBy: COLOR_BY_CHURN },
    );
    expect(payload.nodeById.get("cold").color).toBe(colorForChurn(0));
    expect(payload.nodeById.get("hot").color).toBe(colorForChurn(1));
  });

  it("falls back to normalized degree when no churn source exists", () => {
    const payload = buildGraphRendererPayload(
      {
        nodes: [
          { id: "hub", x: 0, y: 0 },
          { id: "leaf1", x: 1, y: 1 },
          { id: "leaf2", x: 2, y: 2 },
        ],
        edges: [
          { source: "hub", target: "leaf1" },
          { source: "hub", target: "leaf2" },
        ],
      },
      { nodeRadius: 3, colorBy: COLOR_BY_CHURN },
    );
    expect(payload.nodeById.get("hub").color).toBe(colorForChurn(1));
    expect(payload.nodeById.get("leaf1").color).toBe(colorForChurn(0.5));
  });

  // MINOR-3 (double-consensus review): normalizedChurnById must compute the max
  // with a reduce/loop, NOT `Math.max(0, ...raw.values())`. The spread passes
  // every value as a separate call argument, which overflows the engine's
  // arg-count limit (RangeError: Maximum call stack size exceeded) well before
  // ~1e5 nodes — silently breaking Color-by=Churn on any real large graph.
  it("does not throw on a many-node churn scene (no spread over node values)", () => {
    const N = 150000; // > the ~128k spread arg-count limit measured on V8.
    const nodes = new Array(N);
    for (let i = 0; i < N; i++) {
      nodes[i] = { id: `n${i}`, x: i % 500, y: (i / 500) | 0, churn: i % 37 };
    }
    let payload;
    expect(() => {
      payload = buildGraphRendererPayload({ nodes, edges: [] }, { nodeRadius: 3, colorBy: COLOR_BY_CHURN });
    }).not.toThrow();
    expect(payload.renderGraph.nodeIds.length).toBe(N);
    // Ramp still normalizes: the max-churn node maps to the hot end.
    expect(payload.nodeById.get(`n${36}`).color).toBe(colorForChurn(1));
  });
});

// --- Configurable edge-transparency: along-edge alpha SHAPE + edge opacity ----
// The density falloff and the fade modes live in the per-edge alpha SHAPE
// (edgeAlphaShape, a separate multiplier of the flat base alpha). Defaults
// (dense mode, 0.5 opacity) keep the ~0.5 base + hub-fade the studio already had.
describe("edge alpha modes + opacity", () => {
  const FLOOR = Math.round(255 * EDGE_ALPHA_FLOOR); // 38

  describe("edgeDensityForDegree (log-scaled endpoint density)", () => {
    it("is 0 at/below START (deg ≤ 2) and 1 at/above FULL (deg ≥ 16)", () => {
      expect(edgeDensityForDegree(0)).toBe(0);
      expect(edgeDensityForDegree(1)).toBe(0);
      expect(edgeDensityForDegree(2)).toBe(0);
      expect(edgeDensityForDegree(16)).toBe(1);
      expect(edgeDensityForDegree(32)).toBe(1); // clamped
    });

    it("increases monotonically between START and FULL", () => {
      expect(edgeDensityForDegree(4)).toBeLessThan(edgeDensityForDegree(8));
      expect(edgeDensityForDegree(8)).toBeLessThan(edgeDensityForDegree(16));
      expect(edgeDensityForDegree(8)).toBeCloseTo(2 / 3, 5);
    });
  });

  describe("edgeAlphaShapeFor (pure mode → [m0, mMid, m1])", () => {
    it("flat: uniform 255 regardless of density", () => {
      expect(edgeAlphaShapeFor(EDGE_ALPHA_FLAT, 0.4, 0.9)).toEqual([255, 255, 255]);
    });

    it("mid: opaque at both ends, faint (FLOOR) in the middle", () => {
      expect(edgeAlphaShapeFor(EDGE_ALPHA_MID, 0.4, 0.9)).toEqual([255, FLOOR, 255]);
    });

    it("dense: opaque at the RARE endpoint (density 0), faint at the DENSE one (density 1)", () => {
      // rare source (d0=0) → 255; dense target (d1=1) → FLOOR; mid = average.
      const shape = edgeAlphaShapeFor(EDGE_ALPHA_DENSE, 0, 1);
      expect(shape[0]).toBe(255);
      expect(shape[2]).toBe(FLOOR);
      expect(shape[1]).toBe(Math.round((255 + FLOOR) / 2));
    });

    it("inverse: mirror of dense — faint at the rare endpoint, opaque at the dense one", () => {
      const shape = edgeAlphaShapeFor(EDGE_ALPHA_INVERSE, 0, 1);
      expect(shape[0]).toBe(FLOOR);
      expect(shape[2]).toBe(255);
    });

    it("an unknown mode falls back to dense", () => {
      expect(edgeAlphaShapeFor("bogus", 0, 1)).toEqual(edgeAlphaShapeFor(EDGE_ALPHA_DENSE, 0, 1));
    });
  });

  // A hub of degree 17 (density 1) → one leaf of degree 1 (density 0). Input
  // edge 0 is authored hub→leaf, so its shape reads [m0=hub, mMid, m1=leaf].
  const makeHubScene = () => {
    const nodes = [{ id: "hub" }, { id: "leaf" }];
    const edges = [{ source: "hub", target: "leaf" }];
    for (let i = 0; i < 16; i += 1) {
      nodes.push({ id: `x${i}` });
      edges.push({ source: "hub", target: `x${i}` });
    }
    return { nodes, edges };
  };
  const shapeForInputEdge0 = (payload) => {
    const rendered = Array.from(payload.renderGraph.edgeInputIndices).indexOf(0);
    const s = payload.baseStyle.edgeAlphaShape;
    return [s[rendered * 3], s[rendered * 3 + 1], s[rendered * 3 + 2]];
  };

  it("buildGraphRendererPayload always attaches a 3-per-edge shape buffer", () => {
    const payload = buildGraphRendererPayload(makeHubScene(), { nodeRadius: 3 });
    const edgeCount = payload.renderGraph.edges.length / 2;
    expect(payload.baseStyle.edgeAlphaShape).toBeInstanceOf(Uint8Array);
    expect(payload.baseStyle.edgeAlphaShape.length).toBe(edgeCount * 3);
  });

  it("defaults to dense mode (opaque at the rare leaf, faint at the dense hub)", () => {
    const payload = buildGraphRendererPayload(makeHubScene(), { nodeRadius: 3 });
    const [m0, , m1] = shapeForInputEdge0(payload);
    expect(m0).toBe(FLOOR); // hub side (dense) faded to the floor
    expect(m1).toBe(255); // leaf side (rare) opaque
  });

  it("inverse mode swaps the ramp (opaque at the hub, faint at the leaf)", () => {
    const payload = buildGraphRendererPayload(makeHubScene(), { nodeRadius: 3, edgeAlphaMode: EDGE_ALPHA_INVERSE });
    const [m0, , m1] = shapeForInputEdge0(payload);
    expect(m0).toBe(255);
    expect(m1).toBe(FLOOR);
  });

  it("mid mode fades the middle, keeping both endpoints opaque", () => {
    const payload = buildGraphRendererPayload(makeHubScene(), { nodeRadius: 3, edgeAlphaMode: EDGE_ALPHA_MID });
    const [m0, mMid, m1] = shapeForInputEdge0(payload);
    expect(m0).toBe(255);
    expect(m1).toBe(255);
    expect(mMid).toBe(FLOOR);
  });

  it("flat mode emits an all-255 (uniform) shape for every edge", () => {
    const payload = buildGraphRendererPayload(makeHubScene(), { nodeRadius: 3, edgeAlphaMode: EDGE_ALPHA_FLAT });
    for (const v of payload.baseStyle.edgeAlphaShape) expect(v).toBe(255);
  });

  it("edgeOpacity sets the uniform base alpha (0..1 → 0..255); default is 0.5", () => {
    const def = buildGraphRendererPayload(makeHubScene(), { nodeRadius: 3 });
    const dim = buildGraphRendererPayload(makeHubScene(), { nodeRadius: 3, edgeOpacity: 0.2 });
    const bright = buildGraphRendererPayload(makeHubScene(), { nodeRadius: 3, edgeOpacity: 0.8 });
    expect(DEFAULT_EDGE_OPACITY).toBe(0.5);
    expect(def.baseStyle.edgeColors[3]).toBe(128); // 255 * 0.5
    expect(dim.baseStyle.edgeColors[3]).toBe(Math.round(255 * 0.2)); // 51
    expect(bright.baseStyle.edgeColors[3]).toBe(Math.round(255 * 0.8)); // 204
    // The base alpha is uniform: every edge shares it (density is in the shape).
    const edgeCount = dim.renderGraph.edges.length / 2;
    for (let e = 0; e < edgeCount; e += 1) expect(dim.baseStyle.edgeColors[e * 4 + 3]).toBe(51);
  });

  it("buildEdgeAlphaShape reproduces the payload's shape from the same degrees", () => {
    const payload = buildGraphRendererPayload(makeHubScene(), { nodeRadius: 3 });
    const edgeCount = payload.renderGraph.edges.length / 2;
    // Recompute undirected degrees exactly as the payload does.
    const deg = new Map();
    for (const id of payload.renderGraph.nodeIds) deg.set(id, 0);
    for (let e = 0; e < edgeCount; e += 1) {
      const s = payload.renderGraph.nodeIds[payload.renderGraph.edges[e * 2]];
      const t = payload.renderGraph.nodeIds[payload.renderGraph.edges[e * 2 + 1]];
      deg.set(s, (deg.get(s) ?? 0) + 1);
      deg.set(t, (deg.get(t) ?? 0) + 1);
    }
    const rebuilt = buildEdgeAlphaShape(payload.renderGraph, deg, EDGE_ALPHA_DENSE);
    expect(rebuilt.length).toBe(edgeCount * 3);
    expect(Array.from(rebuilt)).toEqual(Array.from(payload.baseStyle.edgeAlphaShape));
  });

  it("the shape survives connected-dim re-styling (only edgeColors.a is dimmed)", () => {
    const payload = buildGraphRendererPayload(makeHubScene(), { nodeRadius: 3, selectedIds: ["leaf"] });
    // The dimmed style keeps the EXACT shape buffer (cloneStyle carries it).
    expect(Array.from(payload.style.edgeAlphaShape)).toEqual(
      Array.from(payload.baseStyle.edgeAlphaShape),
    );
    // Some non-incident edge's BASE alpha was dimmed below the 128 base…
    let sawDim = false;
    const edgeCount = payload.renderGraph.edges.length / 2;
    for (let e = 0; e < edgeCount; e += 1) {
      if (payload.style.edgeColors[e * 4 + 3] < 128) sawDim = true;
    }
    expect(sawDim).toBe(true);
  });
});
