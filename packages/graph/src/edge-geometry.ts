import type { RenderGraphInput } from "./types";

export type EdgeCurveMode = "straight" | "arc";

export interface EdgePolylineOptions {
  curve?: EdgeCurveMode;
  curvature?: number;
  segments?: number;
}

interface Point {
  x: number;
  y: number;
}

function readPoint(positions: Float32Array, nodeIndex: number): Point {
  const offset = nodeIndex * 2;
  return {
    x: positions[offset] ?? 0,
    y: positions[offset + 1] ?? 0,
  };
}

function quadraticPoint(source: Point, control: Point, target: Point, t: number): Point {
  const inv = 1 - t;
  const a = inv * inv;
  const b = 2 * inv * t;
  const c = t * t;

  return {
    x: a * source.x + b * control.x + c * target.x,
    y: a * source.y + b * control.y + c * target.y,
  };
}

function arcControl(source: Point, target: Point, curvature: number): Point {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const length = Math.hypot(dx, dy);

  if (length === 0) {
    return { x: source.x, y: source.y };
  }

  const midpointX = source.x + dx / 2;
  const midpointY = source.y + dy / 2;
  const offset = length * curvature;

  return {
    x: midpointX + (dy / length) * offset,
    y: midpointY - (dx / length) * offset,
  };
}

export function buildEdgePolylinePositions(graph: RenderGraphInput, options: EdgePolylineOptions = {}): Float32Array {
  const edgeCount = graph.edges.length / 2;

  if (options.curve !== "arc") {
    const vertices = new Float32Array(edgeCount * 4);
    let cursor = 0;

    for (let edgeIndex = 0; edgeIndex < graph.edges.length; edgeIndex += 2) {
      const source = readPoint(graph.positions, graph.edges[edgeIndex] ?? 0);
      const target = readPoint(graph.positions, graph.edges[edgeIndex + 1] ?? 0);
      vertices[cursor++] = source.x;
      vertices[cursor++] = source.y;
      vertices[cursor++] = target.x;
      vertices[cursor++] = target.y;
    }

    return vertices;
  }

  const segments = Math.max(1, Math.floor(options.segments ?? 8));
  const curvature = options.curvature ?? 0.2;
  const vertices = new Float32Array(edgeCount * segments * 4);
  let cursor = 0;

  for (let edgeIndex = 0; edgeIndex < graph.edges.length; edgeIndex += 2) {
    const source = readPoint(graph.positions, graph.edges[edgeIndex] ?? 0);
    const target = readPoint(graph.positions, graph.edges[edgeIndex + 1] ?? 0);
    const control = arcControl(source, target, curvature);

    for (let segment = 0; segment < segments; segment += 1) {
      const start = quadraticPoint(source, control, target, segment / segments);
      const end = quadraticPoint(source, control, target, (segment + 1) / segments);
      vertices[cursor++] = start.x;
      vertices[cursor++] = start.y;
      vertices[cursor++] = end.x;
      vertices[cursor++] = end.y;
    }
  }

  return vertices;
}
