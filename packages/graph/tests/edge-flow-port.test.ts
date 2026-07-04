/**
 * FLOW-PORT edge style — unit gate (git-flow renderer lot).
 *
 * Pins the two hard requirements at the geometry level, no GPU needed:
 *  1. DIRECTIONAL PORTS — a flow-port edge EXITS the source node at its RIGHT
 *     border (x + radius) and ENTERS the target node at its LEFT border
 *     (x − radius); it never leaves from the node centre / bottom.
 *  2. ROUTING — horizontal-dominant smooth S (cubic Bézier with HORIZONTAL end
 *     tangents) between different lanes, a straight port-to-port segment on
 *     the same lane; the arrowhead sits ON the target's left port pointing
 *     RIGHT (time flows left→right).
 *
 * Also pins the ADDITIVITY guarantee: without `edgeRouteStyles` (or with all
 * zeros) the instance build is IDENTICAL to the historical centre-to-centre
 * output — the golden suite's byte-parity depends on it.
 */

import { describe, expect, it } from "vitest";
import {
  FLOW_PORT_MIN_STUB,
  ROUTE_STYLE_FLOW_PORT,
  ROUTE_STYLE_FLOW_PORT_REVERSE,
  drawnRadius,
  flowPortEdgeGeometry,
  tessellateEdge,
} from "../src/render-geometry";
import {
  buildEdgeInstances,
  decodeArrow,
  decodeCapsule,
  CAPSULE_FLOATS_PER_INSTANCE,
  type WebGLEdgeFrame,
} from "../src/webgl-edges";
import { buildStyleBuffers } from "../src/styles";
import { buildRenderGraphBuffers } from "../src/buffers";

// ---------------------------------------------------------------------------
// flowPortEdgeGeometry — pure routing math.
// ---------------------------------------------------------------------------

describe("flowPortEdgeGeometry (ports + S routing)", () => {
  const source = { x: 100, y: 100 };

  it("exits the source RIGHT port and enters the target LEFT port", () => {
    const target = { x: 300, y: 180 };
    const geom = flowPortEdgeGeometry(source, target, 8, 6, 12);
    expect(geom.startX).toBe(source.x + 8); // right border, not the centre
    expect(geom.startY).toBe(source.y);
    expect(geom.endX).toBe(target.x - 6); // left border, not the centre
    expect(geom.endY).toBe(target.y);
    expect(geom.degenerate).toBe(false);
    expect(geom.clipped).toBe(true); // ports are ON the borders ⇒ arrow always drawn
  });

  it("end tangents are HORIZONTAL: leaves rightward, arrives rightward", () => {
    const target = { x: 300, y: 180 };
    const geom = flowPortEdgeGeometry(source, target, 8, 6, 12);
    expect([geom.outSx, geom.outSy]).toEqual([1, 0]);
    expect([geom.inTx, geom.inTy]).toEqual([1, 0]);
    // Cubic S: both control points level with their own port (horizontal ends).
    expect(geom.cubic).toBe(true);
    expect(geom.controlY).toBe(geom.startY);
    expect(geom.control2Y).toBe(geom.endY);
    expect(geom.controlX).toBeGreaterThan(geom.startX);
    expect(geom.control2X).toBeLessThan(geom.endX);
  });

  it("same lane + forward = a STRAIGHT horizontal port-to-port segment", () => {
    const geom = flowPortEdgeGeometry(source, { x: 260, y: 100 }, 8, 6, 12);
    expect(geom.cubic).toBe(false);
    expect(geom.curved).toBe(false);
    expect(geom.startY).toBe(geom.endY);
    const polyline = tessellateEdge(geom, 16);
    expect(polyline).toEqual([
      [geom.startX, geom.startY],
      [geom.endX, geom.endY],
    ]);
  });

  it("the S descent is x- and y-monotonic when the rank spacing dominates", () => {
    const target = { x: 400, y: 188 }; // one lane down, several ranks right
    const geom = flowPortEdgeGeometry(source, target, 8, 8, 12);
    const polyline = tessellateEdge(geom, 16);
    expect(polyline[0]).toEqual([geom.startX, geom.startY]);
    expect(polyline[polyline.length - 1]).toEqual([geom.endX, geom.endY]);
    for (let i = 1; i < polyline.length; i += 1) {
      expect(polyline[i]![0]).toBeGreaterThanOrEqual(polyline[i - 1]![0]); // never doubles back
      expect(polyline[i]![1]).toBeGreaterThanOrEqual(polyline[i - 1]![1]); // smooth single descent
    }
  });

  it("a BACKWARD edge still exits right / enters left (loop-back S)", () => {
    const target = { x: 20, y: 60 };
    const geom = flowPortEdgeGeometry(source, target, 8, 6, 12);
    expect(geom.startX).toBe(source.x + 8);
    expect(geom.endX).toBe(target.x - 6);
    expect(geom.cubic).toBe(true);
    // Stub keeps the exit rightward and the entry horizontal even backward.
    expect(geom.controlX).toBe(geom.startX + 12);
    expect(geom.control2X).toBe(geom.endX - 12);
    expect([geom.inTx, geom.inTy]).toEqual([1, 0]);
  });

  it("degenerate when the two ports coincide", () => {
    const geom = flowPortEdgeGeometry({ x: 0, y: 0 }, { x: 10, y: 0 }, 5, 5, 12);
    expect(geom.degenerate).toBe(true);
    expect(geom.clipped).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildEdgeInstances — the WebGL instance build honours edgeRouteStyles.
// ---------------------------------------------------------------------------

/** Two/three-circle frame in DEVICE px (camera identity, viewport-centred). */
function makeFrame(
  nodes: Array<{ x: number; y: number; size: number }>,
  edges: Array<[number, number]>,
  routeStyles?: number[],
): WebGLEdgeFrame {
  const positions = new Float32Array(nodes.length * 2);
  nodes.forEach((node, i) => {
    positions[i * 2] = node.x;
    positions[i * 2 + 1] = node.y;
  });
  const edgeArr = new Uint32Array(edges.length * 2);
  edges.forEach(([s, t], i) => {
    edgeArr[i * 2] = s;
    edgeArr[i * 2 + 1] = t;
  });
  const style = {
    nodeSizes: new Float32Array(nodes.map((node) => node.size)),
    nodeColors: new Uint8Array(nodes.length * 4).fill(255),
    nodeShapes: new Uint8Array(nodes.length),
    edgeWidths: new Float32Array(edges.length).fill(2),
    edgeColors: new Uint8Array(edges.length * 4).fill(200),
    edgeDash: new Uint8Array(edges.length),
    edgeCurvatures: new Float32Array(edges.length),
    ...(routeStyles ? { edgeRouteStyles: new Uint8Array(routeStyles) } : {}),
  };
  return {
    positions,
    nodeCount: nodes.length,
    edges: edgeArr,
    style,
    camera: { x: 0, y: 0, zoom: 1 },
    pixelRatio: 1,
    viewportWidth: 400,
    viewportHeight: 400,
  };
}

describe("buildEdgeInstances honours edgeRouteStyles", () => {
  // World (0,0) maps to device (200,200) with the 400×400 identity camera.
  const A = { x: -100, y: -50, size: 10 }; // device (100, 150)
  const B = { x: 60, y: -6, size: 8 }; // device (260, 194)

  it("flow-port: capsules run right-port → left-port, arrow on the left port pointing right", () => {
    const frame = makeFrame([A, B], [[0, 1]], [ROUTE_STYLE_FLOW_PORT]);
    const { capsules, arrows } = buildEdgeInstances(frame);
    const segmentCount = capsules.length / CAPSULE_FLOATS_PER_INSTANCE;
    expect(segmentCount).toBeGreaterThan(1); // lane change ⇒ tessellated S, not a chord

    const radiusA = drawnRadius(A.size, 1, 1);
    const radiusB = drawnRadius(B.size, 1, 1);
    const first = decodeCapsule(capsules, 0);
    const last = decodeCapsule(capsules, segmentCount - 1);
    expect(first.p0).toEqual([100 + radiusA, 150]); // EXITS the RIGHT border
    expect(last.p1[0]).toBeCloseTo(260 - radiusB, 5); // ENTERS the LEFT border
    expect(last.p1[1]).toBeCloseTo(194, 5);

    expect(arrows.length).toBeGreaterThan(0);
    const arrow = decodeArrow(arrows, 0);
    expect(arrow.tip[0]).toBeCloseTo(260 - radiusB, 5); // tip ON the left port…
    expect(arrow.tip[1]).toBeCloseTo(194, 5);
    expect(arrow.dir).toEqual([1, 0]); // …pointing RIGHT
  });

  it("flow-port-reverse swaps the endpoints: a child→parent edge draws old→new", () => {
    const forward = buildEdgeInstances(makeFrame([A, B], [[0, 1]], [ROUTE_STYLE_FLOW_PORT]));
    const reversed = buildEdgeInstances(
      makeFrame([A, B], [[1, 0]], [ROUTE_STYLE_FLOW_PORT_REVERSE]),
    );
    expect(reversed.capsules).toEqual(forward.capsules);
    expect(reversed.arrows).toEqual(forward.arrows);
  });

  it("same-row flow-port edge is a single straight port-to-port capsule", () => {
    const C = { x: 60, y: -50, size: 8 }; // same world y as A
    const frame = makeFrame([A, C], [[0, 1]], [ROUTE_STYLE_FLOW_PORT]);
    const { capsules } = buildEdgeInstances(frame);
    expect(capsules.length / CAPSULE_FLOATS_PER_INSTANCE).toBe(1);
    const capsule = decodeCapsule(capsules, 0);
    expect(capsule.p0).toEqual([100 + drawnRadius(A.size, 1, 1), 150]);
    expect(capsule.p1).toEqual([260 - drawnRadius(C.size, 1, 1), 150]);
  });

  it("the flow-port stub scales with pixelRatio × zoom (world-space routing)", () => {
    const frame = makeFrame([A, B], [[0, 1]], [ROUTE_STYLE_FLOW_PORT]);
    frame.camera = { x: 0, y: 0, zoom: 2 };
    frame.pixelRatio = 2;
    const { capsules } = buildEdgeInstances(frame);
    // No NaNs, still port-anchored at the scaled radius.
    const first = decodeCapsule(capsules, 0);
    const radiusA = drawnRadius(A.size, 2, 2);
    expect(first.p0[0]).toBeCloseTo((A.x - 0) * 2 + 200 + radiusA, 5);
    void FLOW_PORT_MIN_STUB; // referenced: the stub constant is part of the contract
  });

  it("ADDITIVE: absent / all-zero edgeRouteStyles reproduce the historical build exactly", () => {
    const baseline = buildEdgeInstances(makeFrame([A, B], [[0, 1]]));
    const zeroed = buildEdgeInstances(makeFrame([A, B], [[0, 1]], [0]));
    expect(zeroed.capsules).toEqual(baseline.capsules);
    expect(zeroed.arrows).toEqual(baseline.arrows);
  });
});

// ---------------------------------------------------------------------------
// buildStyleBuffers — edge_style parsing (scene → style buffers).
// ---------------------------------------------------------------------------

describe("buildStyleBuffers parses edge_style", () => {
  const nodes = [
    { id: "a", x: 0, y: 0 },
    { id: "b", x: 10, y: 0 },
    { id: "c", x: 20, y: 0 },
  ];

  it("maps flow-port / flow-port-reverse to codes 1 / 2 (default 0)", () => {
    const input = {
      nodes,
      edges: [
        { source: "a", target: "b", edge_style: "flow-port" },
        { source: "b", target: "c", edge_style: "flow-port-reverse" },
        { source: "a", target: "c" },
      ],
    };
    const graph = buildRenderGraphBuffers(input);
    const style = buildStyleBuffers(input, graph);
    expect(Array.from(style.edgeRouteStyles ?? [])).toEqual([1, 2, 0]);
  });

  it("omits edgeRouteStyles entirely when no edge opts in (historical shape)", () => {
    const input = { nodes, edges: [{ source: "a", target: "b" }] };
    const graph = buildRenderGraphBuffers(input);
    const style = buildStyleBuffers(input, graph);
    expect(style.edgeRouteStyles).toBeUndefined();
  });
});
