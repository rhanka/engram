// Golden fixtures for the B1 Phase-0 harness. These are the minimal Phase-0
// smoke fixtures; the GL phases extend this with the full §5.2 matrix
// (shape x fill x border x alpha x state, OVERLAP, Unicode text, edge families).
//
// Coordinates are WORLD coordinates. The camera maps them to the canvas at
// capture time (see cdp-harness.capture).

/**
 * The Phase-0 base smoke fixture: a few node shapes + a styled edge, so the
 * capture exercises arcs (circle), polygons (diamond/hexagon), a labelled box
 * (text path), and a curved arrowed edge. Deterministic, no randomness.
 */
export const baseFixture = {
  nodes: [
    { id: "circle", x: -60, y: -40, size: 14, color: "#d62728", shape: "circle" },
    { id: "diamond", x: 60, y: -40, size: 12, color: "#1f77b4", shape: "diamond" },
    { id: "hexagon", x: -60, y: 40, size: 12, color: "#2ca02c", shape: "hexagon" },
    { id: "box", x: 60, y: 40, size: 11, color: "#9467bd", shape: "box", label: "Work" },
  ],
  edges: [
    { source: "circle", target: "diamond", width: 3, color: "#3344aa", curvature: 0.2 },
    { source: "hexagon", target: "box", width: 2, color: "#777788", dash: "dashed" },
  ],
};

/**
 * Deep-clone a fixture so a perturbation never mutates the shared base.
 */
export function cloneFixture(fixture) {
  return {
    nodes: fixture.nodes.map((n) => ({ ...n })),
    edges: fixture.edges.map((e) => ({ ...e })),
  };
}

/**
 * Return a copy of `fixture` with node `nodeId` moved by (dx, dy) WORLD units.
 * Used by the Phase-0 acceptance proof: a 3px move MUST be detected above
 * tolerance (proves the harness catches regressions).
 */
export function perturbNode(fixture, nodeId, dx, dy) {
  const next = cloneFixture(fixture);
  const node = next.nodes.find((n) => n.id === nodeId);
  if (!node) throw new Error(`perturbNode: no node "${nodeId}"`);
  node.x = (node.x ?? 0) + dx;
  node.y = (node.y ?? 0) + dy;
  return next;
}

/**
 * The DPR x zoom capture matrix the harness supports (B1 §5.2 subset for
 * Phase-0 smoke). The GL phases extend zoom to {0.05, 1, high}.
 */
export const DPR_MATRIX = [1, 1.25, 2, 3];
export const ZOOM_MATRIX = [1, 2]; // at least 2 zooms (plan: >=2)
