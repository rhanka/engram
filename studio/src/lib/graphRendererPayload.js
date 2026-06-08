import { buildRenderGraphBuffers, buildStyleBuffers } from "@sentropic/graph";

const GROUP_PALETTE = [
  "#4f7cac",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#8b5cf6",
  "#14b8a6",
  "#f97316",
  "#64748b",
  "#ec4899",
  "#22c55e",
  "#3b82f6",
  "#a855f7",
];

const FOCUS_COLOR = "#ef4444";
const SELECTED_COLOR = "#2563eb";
const EDGE_COLOR = "#94a3b8";
const WEAK_EDGE_COLOR = "#cbd5e1";

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function clampUnit(value) {
  if (!finite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function stableHash(value) {
  const text = String(value ?? "");
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function colorForGroup(group) {
  const index = stableHash(group ?? "default") % GROUP_PALETTE.length;
  return GROUP_PALETTE[index];
}

function positionForNode(node, index, total) {
  if (finite(node.x) && finite(node.y)) return { x: node.x, y: node.y, fixed: node.fixed === true };
  if (finite(node.fx) && finite(node.fy)) return { x: node.fx, y: node.fy, fixed: true };

  const count = Math.max(1, total);
  const angle = (Math.PI * 2 * index) / count;
  const radius = 90 + Math.sqrt(count) * 18;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
    fixed: false,
  };
}

function nodeSize(node, baseRadius, selected, focused) {
  const weight = finite(node.weight) && node.weight > 0 ? node.weight : 1;
  const base = baseRadius * Math.sqrt(weight);
  if (focused) return base * 1.85;
  if (selected) return base * 1.45;
  return base;
}

function edgeWidth(edge) {
  if (finite(edge.width) && edge.width > 0) return edge.width;
  if (edge.emphasis) return 2.5;
  if (edge.weak) return 0.75;
  return 1;
}

export function buildGraphRendererPayload(scene, options = {}) {
  const selectedIds = new Set(options.selectedIds ?? []);
  const focusId = options.focusId ?? null;
  const nodeRadius = options.nodeRadius ?? 3;
  const sceneNodes = scene?.nodes ?? [];
  const sceneEdges = scene?.edges ?? [];

  const nodes = sceneNodes.map((node, index) => {
    const position = positionForNode(node, index, sceneNodes.length);
    const focused = node.id === focusId;
    const selected = focused || selectedIds.has(node.id);
    return {
      id: node.id,
      label: node.label ?? node.id,
      x: position.x,
      y: position.y,
      fixed: position.fixed,
      size: nodeSize(node, nodeRadius, selected, focused),
      color: focused ? FOCUS_COLOR : selected ? SELECTED_COLOR : colorForGroup(node.group),
    };
  });

  const edges = sceneEdges.map((edge) => ({
    source: edge.source,
    target: edge.target,
    label: edge.relation,
    width: edgeWidth(edge),
    color: edge.weak ? WEAK_EDGE_COLOR : EDGE_COLOR,
    dash: edge.dash ?? (edge.weak ? "dotted" : "solid"),
    curvature: finite(edge.curvature) ? edge.curvature : 0.15,
  }));

  const input = { nodes, edges };
  const renderGraph = buildRenderGraphBuffers(input);
  const style = buildStyleBuffers(input, renderGraph, {
    node: { size: nodeRadius },
    edge: { width: 1, color: EDGE_COLOR, dash: "solid", curvature: 0.15 },
  });
  const nodeIndexById = new Map(nodes.map((node, index) => [node.id, index]));

  return {
    renderGraph,
    style,
    nodeById: new Map(nodes.map((node) => [node.id, node])),
    nodeIndexById,
    stats: {
      nodeCount: renderGraph.nodeIds.length,
      edgeCount: renderGraph.edges.length / 2,
      droppedEdgeCount: renderGraph.droppedEdges,
    },
  };
}

export function interpolateMergePositions(payload, mergePair, progress) {
  const graph = payload?.renderGraph;
  if (!graph || !mergePair?.from || !mergePair?.into) return null;

  const nodeIndexById =
    payload.nodeIndexById ?? new Map((graph.nodeIds ?? []).map((id, index) => [id, index]));
  const fromIndex = nodeIndexById.get(mergePair.from);
  const intoIndex = nodeIndexById.get(mergePair.into);
  if (!Number.isInteger(fromIndex) || !Number.isInteger(intoIndex)) return null;

  const positions = new Float32Array(graph.positions);
  const fromOffset = fromIndex * 2;
  const intoOffset = intoIndex * 2;
  const t = clampUnit(progress);
  const fromX = graph.positions[fromOffset] ?? 0;
  const fromY = graph.positions[fromOffset + 1] ?? 0;
  const intoX = graph.positions[intoOffset] ?? 0;
  const intoY = graph.positions[intoOffset + 1] ?? 0;

  positions[fromOffset] = fromX + (intoX - fromX) * t;
  positions[fromOffset + 1] = fromY + (intoY - fromY) * t;

  return positions;
}

export function findNearestNodeId(payload, worldX, worldY, maxDistance = 14) {
  const graph = payload?.renderGraph;
  if (!graph) return null;

  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < graph.nodeIds.length; index += 1) {
    const offset = index * 2;
    const dx = (graph.positions[offset] ?? 0) - worldX;
    const dy = (graph.positions[offset + 1] ?? 0) - worldY;
    const distance = Math.hypot(dx, dy);
    const radius = payload.style.nodeSizes[index] ?? 4;
    const threshold = Math.max(maxDistance, radius);
    if (distance <= threshold && distance < bestDistance) {
      best = graph.nodeIds[index];
      bestDistance = distance;
    }
  }

  return best;
}
