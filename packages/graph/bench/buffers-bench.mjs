import { performance } from "node:perf_hooks";
import { buildEdgePolylinePositions, buildRenderGraphBuffers, buildStyleBuffers } from "../dist/index.js";

const nodeCount = Number.parseInt(process.env.GRAPH_BENCH_NODES ?? "100000", 10);
const edgeCount = Number.parseInt(process.env.GRAPH_BENCH_EDGES ?? "200000", 10);

const nodes = Array.from({ length: nodeCount }, (_, index) => ({
  id: `n${index}`,
  x: Math.cos(index * 0.017) * 1000 + (index % 997),
  y: Math.sin(index * 0.019) * 1000 + (index % 991),
  size: 2 + (index % 11) * 0.25,
  color: 0x3366ff + (index % 64),
}));

const edges = Array.from({ length: edgeCount }, (_, index) => ({
  source: `n${index % nodeCount}`,
  target: `n${(index * 48271 + 17) % nodeCount}`,
  width: 0.75 + (index % 5) * 0.25,
  color: index % 3 === 0 ? 0xff6677 : 0x788599,
  dash: index % 17 === 0 ? "dashed" : "solid",
  curvature: index % 13 === 0 ? 0.2 : 0,
}));

const buildStart = performance.now();
const graph = buildRenderGraphBuffers({ nodes, edges });
const buildMs = performance.now() - buildStart;

const styleStart = performance.now();
const style = buildStyleBuffers({ nodes, edges }, graph);
const styleMs = performance.now() - styleStart;

const geometryStart = performance.now();
const lineVertices = buildEdgePolylinePositions(graph, { curve: "straight" });
const geometryMs = performance.now() - geometryStart;

const arcGeometryStart = performance.now();
const arcVertices = buildEdgePolylinePositions(graph, { curve: "arc", curvature: 0.2, segments: 4 });
const arcGeometryMs = performance.now() - arcGeometryStart;

const payload = {
  nodeCount,
  edgeCount,
  droppedEdges: graph.droppedEdges,
  buildMs: Number(buildMs.toFixed(2)),
  styleMs: Number(styleMs.toFixed(2)),
  straightGeometryMs: Number(geometryMs.toFixed(2)),
  arcGeometryMs: Number(arcGeometryMs.toFixed(2)),
  positionBytes: graph.positions.byteLength,
  edgeIndexBytes: graph.edges.byteLength,
  styleBytes:
    style.nodeSizes.byteLength +
    style.nodeColors.byteLength +
    style.edgeWidths.byteLength +
    style.edgeColors.byteLength +
    style.edgeDash.byteLength +
    style.edgeCurvatures.byteLength,
  lineVertexBytes: lineVertices.byteLength,
  arcVertexBytes: arcVertices.byteLength,
};

console.log(JSON.stringify(payload, null, 2));
