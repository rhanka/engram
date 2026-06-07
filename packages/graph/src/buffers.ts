import type { HighLevelGraphInput, HighLevelGraphNode, NodeId, RenderGraphBuffers } from "./types";

function finiteOrFallback(primary: unknown, fallback: unknown): number {
  if (typeof primary === "number" && Number.isFinite(primary)) {
    return primary;
  }

  if (typeof fallback === "number" && Number.isFinite(fallback)) {
    return fallback;
  }

  return 0;
}

function isFixed(node: HighLevelGraphNode): boolean {
  return (
    node.fixed === true ||
    (typeof node.fx === "number" && Number.isFinite(node.fx)) ||
    (typeof node.fy === "number" && Number.isFinite(node.fy))
  );
}

export function buildRenderGraphBuffers(input: HighLevelGraphInput): RenderGraphBuffers {
  const nodeIds: NodeId[] = [];
  const idToIndex = new Map<NodeId, number>();
  const positions = new Float32Array(input.nodes.length * 2);
  const fixed = new Uint8Array(input.nodes.length);
  const edgeInputIndices: number[] = [];
  let hasFixed = false;

  input.nodes.forEach((node, index) => {
    if (idToIndex.has(node.id)) {
      throw new Error(`duplicate node id: ${node.id}`);
    }

    nodeIds.push(node.id);
    idToIndex.set(node.id, index);
    positions[index * 2] = finiteOrFallback(node.x, node.fx);
    positions[index * 2 + 1] = finiteOrFallback(node.y, node.fy);

    if (isFixed(node)) {
      fixed[index] = 1;
      hasFixed = true;
    }
  });

  const edgeIndices: number[] = [];
  let droppedEdges = 0;

  input.edges.forEach((edge, inputIndex) => {
    const source = idToIndex.get(edge.source);
    const target = idToIndex.get(edge.target);

    if (source === undefined || target === undefined) {
      droppedEdges += 1;
      return;
    }

    edgeIndices.push(source, target);
    edgeInputIndices.push(inputIndex);
  });

  const buffers: RenderGraphBuffers = {
    nodeIds,
    idToIndex,
    positions,
    edges: new Uint32Array(edgeIndices),
    edgeInputIndices: new Uint32Array(edgeInputIndices),
    droppedEdges,
  };

  if (hasFixed) {
    buffers.nodeFlags = { fixed };
  }

  return buffers;
}
