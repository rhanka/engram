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
const WEAK_EDGE_COLOR = [203, 213, 225, 128];
const EDGE_CURVE_FACTOR = 0.5;

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
      shape: node.shape ?? "dot",
      size: nodeSize(node, nodeRadius, selected, focused),
      color: focused ? FOCUS_COLOR : selected ? SELECTED_COLOR : colorForGroup(node.group),
    };
  });

  const edges = sceneEdges.map((edge) => ({
    source: edge.source,
    target: edge.target,
    relation: edge.relation,
    label: edge.relation,
    weak: edge.weak === true,
    emphasis: edge.emphasis === true,
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
  const renderedEdges = Array.from(renderGraph.edgeInputIndices ?? [], (inputIndex) => edges[inputIndex]);

  return {
    renderGraph,
    style,
    edges: renderedEdges,
    nodeById: new Map(nodes.map((node) => [node.id, node])),
    nodeIndexById,
    stats: {
      nodeCount: renderGraph.nodeIds.length,
      edgeCount: renderGraph.edges.length / 2,
      droppedEdgeCount: renderGraph.droppedEdges,
    },
  };
}

function cloneStyle(style) {
  return {
    nodeSizes: new Float32Array(style.nodeSizes),
    nodeColors: new Uint8Array(style.nodeColors),
    nodeShapes: new Uint8Array(style.nodeShapes),
    edgeWidths: new Float32Array(style.edgeWidths),
    edgeColors: new Uint8Array(style.edgeColors),
    edgeDash: new Uint8Array(style.edgeDash),
    edgeCurvatures: new Float32Array(style.edgeCurvatures),
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

export function interpolateMergeStyle(payload, mergePair, progress) {
  const graph = payload?.renderGraph;
  if (!graph || !payload?.style || !mergePair?.from) return payload?.style ?? null;

  const nodeIndexById =
    payload.nodeIndexById ?? new Map((graph.nodeIds ?? []).map((id, index) => [id, index]));
  const fromIndex = nodeIndexById.get(mergePair.from);
  if (!Number.isInteger(fromIndex)) return payload.style;

  const style = cloneStyle(payload.style);
  const alphaScale = 1 - clampUnit(progress);
  const nodeAlphaOffset = fromIndex * 4 + 3;
  style.nodeColors[nodeAlphaOffset] = Math.round((style.nodeColors[nodeAlphaOffset] ?? 255) * alphaScale);

  const edgeCount = graph.edges.length / 2;
  for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex += 1) {
    const sourceIndex = graph.edges[edgeIndex * 2];
    const targetIndex = graph.edges[edgeIndex * 2 + 1];
    if (sourceIndex !== fromIndex && targetIndex !== fromIndex) continue;
    const alphaOffset = edgeIndex * 4 + 3;
    style.edgeColors[alphaOffset] = Math.round((style.edgeColors[alphaOffset] ?? 255) * alphaScale);
  }

  return style;
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

function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= Number.EPSILON) return Math.hypot(px - x1, py - y1);

  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared));
  const x = x1 + dx * t;
  const y = y1 + dy * t;
  return Math.hypot(px - x, py - y);
}

function quadraticPoint(source, control, target, t) {
  const inv = 1 - t;
  return {
    x: inv * inv * source.x + 2 * inv * t * control.x + t * t * target.x,
    y: inv * inv * source.y + 2 * inv * t * control.y + t * t * target.y,
  };
}

function curveControlPoint(source, target, curvature) {
  const midX = (source.x + target.x) / 2;
  const midY = (source.y + target.y) / 2;
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  return {
    x: midX + (-dy / distance) * distance * curvature * EDGE_CURVE_FACTOR,
    y: midY + (dx / distance) * distance * curvature * EDGE_CURVE_FACTOR,
  };
}

function pointToQuadraticDistance(px, py, source, control, target) {
  let best = Number.POSITIVE_INFINITY;
  let previous = source;
  for (let step = 1; step <= 16; step += 1) {
    const current = quadraticPoint(source, control, target, step / 16);
    best = Math.min(best, pointToSegmentDistance(px, py, previous.x, previous.y, current.x, current.y));
    previous = current;
  }
  return best;
}

export function findNearestEdge(payload, worldX, worldY, maxDistance = 10, positions = null) {
  const graph = payload?.renderGraph;
  if (!graph || !payload?.style) return null;

  const currentPositions = positions ?? graph.positions;
  const edgeCount = graph.edges.length / 2;
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex += 1) {
    const sourceIndex = graph.edges[edgeIndex * 2];
    const targetIndex = graph.edges[edgeIndex * 2 + 1];
    const source = {
      x: currentPositions[sourceIndex * 2] ?? 0,
      y: currentPositions[sourceIndex * 2 + 1] ?? 0,
    };
    const target = {
      x: currentPositions[targetIndex * 2] ?? 0,
      y: currentPositions[targetIndex * 2 + 1] ?? 0,
    };
    const curvature = payload.style.edgeCurvatures[edgeIndex] ?? 0;
    const distance =
      curvature === 0
        ? pointToSegmentDistance(worldX, worldY, source.x, source.y, target.x, target.y)
        : pointToQuadraticDistance(worldX, worldY, source, curveControlPoint(source, target, curvature), target);
    const threshold = Math.max(maxDistance, (payload.style.edgeWidths[edgeIndex] ?? 1) * 1.5);

    if (distance <= threshold && distance < bestDistance) {
      const edge = payload.edges?.[edgeIndex] ?? null;
      bestDistance = distance;
      best = {
        index: edgeIndex,
        edge,
        distance,
        sourceLabel: payload.nodeById?.get(edge?.source)?.label ?? edge?.source ?? "",
        targetLabel: payload.nodeById?.get(edge?.target)?.label ?? edge?.target ?? "",
      };
    }
  }

  return best;
}
