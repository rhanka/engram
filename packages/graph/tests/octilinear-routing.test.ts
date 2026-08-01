import { describe, expect, it } from "vitest";

import { computeMetroPositions } from "../src/layout-metro";
import {
  CAPSULE_FLOATS_PER_INSTANCE,
  buildEdgeInstances,
  decodeCapsule,
  type WebGLEdgeFrame,
} from "../src/webgl-edges";
import {
  EDGE_CURVE_FACTOR,
  ROUTE_STYLE_DEFAULT,
  ROUTE_STYLE_FLOW_PORT,
  ROUTE_STYLE_FLOW_PORT_NO_ARROW,
  ROUTE_STYLE_FLOW_PORT_REVERSE,
  ROUTE_STYLE_FLOW_PORT_REVERSE_NO_ARROW,
  ROUTE_STYLE_OCTILINEAR,
  edgeGeometry,
  flowPortEdgeGeometry,
  octilinearEdgeGeometry,
  routeIsFlowPort,
  tessellateEdge,
} from "../src/render-geometry";

/** No border clipping — keeps the routing math under test in isolation. */
const noOffset = (): number => 0;

/**
 * The DEFINING invariant of an octilinear route: every drawn segment runs at a
 * multiple of 45° — horizontal (dy=0), vertical (dx=0) or diagonal (|dx|=|dy|).
 */
function assertOctilinear(points: ReadonlyArray<readonly [number, number]>): void {
  expect(points.length).toBeGreaterThanOrEqual(2);
  for (let i = 0; i < points.length - 1; i += 1) {
    const dx = points[i + 1]![0] - points[i]![0];
    const dy = points[i + 1]![1] - points[i]![1];
    const horizontal = Math.abs(dy) < 1e-6;
    const vertical = Math.abs(dx) < 1e-6;
    const diagonal = Math.abs(Math.abs(dx) - Math.abs(dy)) < 1e-6;
    expect(
      horizontal || vertical || diagonal,
      `segment ${i} → (${dx}, ${dy}) is not a multiple of 45°`,
    ).toBe(true);
  }
}

describe("route-style codes", () => {
  it("gives the octilinear route its own code, distinct from default and flow-port", () => {
    expect(ROUTE_STYLE_OCTILINEAR).toBe(5);
    expect(ROUTE_STYLE_OCTILINEAR).not.toBe(ROUTE_STYLE_DEFAULT);
    expect(ROUTE_STYLE_OCTILINEAR).not.toBe(ROUTE_STYLE_FLOW_PORT);
  });

  it("routeIsFlowPort discriminates the S-routes from default AND from octilinear", () => {
    // The regression this guards: both draw paths used to dispatch on
    // `route !== 0`, which would silently render an octilinear edge as a
    // flow-port S. Dispatch must be an explicit predicate.
    expect(routeIsFlowPort(ROUTE_STYLE_FLOW_PORT)).toBe(true);
    expect(routeIsFlowPort(ROUTE_STYLE_FLOW_PORT_REVERSE)).toBe(true);
    expect(routeIsFlowPort(ROUTE_STYLE_FLOW_PORT_NO_ARROW)).toBe(true);
    expect(routeIsFlowPort(ROUTE_STYLE_FLOW_PORT_REVERSE_NO_ARROW)).toBe(true);
    expect(routeIsFlowPort(ROUTE_STYLE_DEFAULT)).toBe(false);
    expect(routeIsFlowPort(ROUTE_STYLE_OCTILINEAR)).toBe(false);
  });
});

describe("octilinearEdgeGeometry", () => {
  it("routes a horizontal-dominant edge as run → 45° diagonal → run", () => {
    const geom = octilinearEdgeGeometry({ x: 0, y: 0 }, { x: 100, y: 20 }, noOffset);
    expect(geom.polyline).toBeDefined();
    const points = geom.polyline!;
    assertOctilinear(points);
    // |dx| > |dy| ⇒ the excess (80) is HORIZONTAL, split evenly (40 | 40) around
    // a 45° diagonal that covers the whole vertical extent (20).
    expect(points).toEqual([
      [0, 0],
      [40, 0],
      [60, 20],
      [100, 20],
    ]);
  });

  it("routes a vertical-dominant edge with VERTICAL runs at both ends", () => {
    const geom = octilinearEdgeGeometry({ x: 0, y: 0 }, { x: 20, y: 100 }, noOffset);
    assertOctilinear(geom.polyline!);
    expect(geom.polyline).toEqual([
      [0, 0],
      [0, 40],
      [20, 60],
      [20, 100],
    ]);
  });

  it("keeps an already-octilinear edge a SINGLE segment (no gratuitous bends)", () => {
    const pureDiagonal = octilinearEdgeGeometry({ x: 0, y: 0 }, { x: 50, y: 50 }, noOffset);
    expect(pureDiagonal.polyline).toEqual([
      [0, 0],
      [50, 50],
    ]);

    const pureHorizontal = octilinearEdgeGeometry({ x: 0, y: 0 }, { x: 70, y: 0 }, noOffset);
    expect(pureHorizontal.polyline).toEqual([
      [0, 0],
      [70, 0],
    ]);

    const pureVertical = octilinearEdgeGeometry({ x: 5, y: 0 }, { x: 5, y: 70 }, noOffset);
    expect(pureVertical.polyline).toEqual([
      [5, 0],
      [5, 70],
    ]);
  });

  it("stays octilinear in all four quadrants", () => {
    const targets: Array<[number, number]> = [
      [130, 40],
      [-130, 40],
      [130, -40],
      [-130, -40],
      [40, 130],
      [-40, -130],
      [3, 197],
      [-197, 3],
    ];
    for (const [x, y] of targets) {
      const geom = octilinearEdgeGeometry({ x: 0, y: 0 }, { x, y }, noOffset);
      assertOctilinear(geom.polyline!);
      // The route must actually ARRIVE at the endpoints it reports.
      const points = geom.polyline!;
      expect(points[0]).toEqual([geom.startX, geom.startY]);
      expect(points[points.length - 1]).toEqual([geom.endX, geom.endY]);
    }
  });

  it("reports tangents taken from the FIRST and LAST drawn segments", () => {
    const geom = octilinearEdgeGeometry({ x: 0, y: 0 }, { x: 100, y: 20 }, noOffset);
    // First segment is horizontal-right, last segment is horizontal-right.
    expect(geom.outSx).toBeCloseTo(1, 10);
    expect(geom.outSy).toBeCloseTo(0, 10);
    expect(geom.inTx).toBeCloseTo(1, 10);
    expect(geom.inTy).toBeCloseTo(0, 10);

    const vertical = octilinearEdgeGeometry({ x: 0, y: 0 }, { x: 20, y: 100 }, noOffset);
    expect(vertical.outSx).toBeCloseTo(0, 10);
    expect(vertical.outSy).toBeCloseTo(1, 10);
    expect(vertical.inTx).toBeCloseTo(0, 10);
    expect(vertical.inTy).toBeCloseTo(1, 10);
  });

  it("clips to the node borders along the first/last segment and stays octilinear", () => {
    const geom = octilinearEdgeGeometry({ x: 0, y: 0 }, { x: 200, y: 60 }, () => 10);
    expect(geom.clipped).toBe(true);
    // Clipped 10px along the outgoing tangent (horizontal) and 10px back along
    // the incoming tangent.
    expect(geom.startX).toBeCloseTo(10, 10);
    expect(geom.startY).toBeCloseTo(0, 10);
    expect(geom.endX).toBeCloseTo(190, 10);
    expect(geom.endY).toBeCloseTo(60, 10);
    assertOctilinear(geom.polyline!);
    expect(geom.polyline![0]).toEqual([geom.startX, geom.startY]);
    expect(geom.polyline![geom.polyline!.length - 1]).toEqual([geom.endX, geom.endY]);
  });

  it("marks coincident endpoints degenerate and never emits NaN", () => {
    const geom = octilinearEdgeGeometry({ x: 7, y: 7 }, { x: 7, y: 7 }, noOffset);
    expect(geom.degenerate).toBe(true);
    expect(geom.clipped).toBe(false);
    for (const value of [geom.startX, geom.startY, geom.endX, geom.endY, geom.outSx, geom.outSy]) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it("is a straight-segment route — never a Bézier", () => {
    const geom = octilinearEdgeGeometry({ x: 0, y: 0 }, { x: 100, y: 20 }, noOffset);
    expect(geom.curved).toBe(false);
    expect(geom.cubic).toBe(false);
  });
});

describe("tessellateEdge with an octilinear route", () => {
  it("returns the routed polyline VERBATIM (no Bézier resampling)", () => {
    const geom = octilinearEdgeGeometry({ x: 0, y: 0 }, { x: 100, y: 20 }, noOffset);
    const points = tessellateEdge(geom, 16);
    expect(points).toEqual([
      [0, 0],
      [40, 0],
      [60, 20],
      [100, 20],
    ]);
    assertOctilinear(points);
  });

  it("does NOT collapse the route to its two endpoints", () => {
    // The trap: an octilinear geometry has `curved === false`, so a tessellator
    // that checks `curved` first would drop every intermediate waypoint and draw
    // a plain straight line — the bend would vanish at render time.
    const geom = octilinearEdgeGeometry({ x: 0, y: 0 }, { x: 100, y: 20 }, noOffset);
    expect(tessellateEdge(geom, 16).length).toBeGreaterThan(2);
  });
});

/**
 * A single-edge frame whose endpoints are NOT axis-aligned and NOT at 45°, so a
 * correct octilinear route must bend. `route` goes into `edgeRouteStyles`.
 */
function routedFrame(route: number): WebGLEdgeFrame {
  return {
    positions: new Float32Array([-100, -20, 100, 20]),
    nodeCount: 2,
    edges: new Uint32Array([0, 1]),
    style: {
      nodeSizes: new Float32Array([8, 8]),
      nodeColors: new Uint8Array([200, 200, 200, 255, 200, 200, 200, 255]),
      nodeShapes: new Uint8Array([0, 0]),
      nodeLabels: ["", ""],
      edgeWidths: new Float32Array([4]),
      edgeColors: new Uint8Array([29, 78, 216, 255]),
      edgeDash: new Uint8Array([0]),
      edgeCurvatures: new Float32Array([0]),
      edgeRouteStyles: new Uint8Array([route]),
    },
    camera: { x: 0, y: 0, zoom: 1 },
    pixelRatio: 2,
    viewportWidth: 400,
    viewportHeight: 400,
  };
}

function capsulesOf(route: number): Array<ReturnType<typeof decodeCapsule>> {
  const set = buildEdgeInstances(routedFrame(route));
  return Array.from({ length: set.capsules.length / CAPSULE_FLOATS_PER_INSTANCE }, (_, index) =>
    decodeCapsule(set.capsules, index),
  );
}

describe("RENDER wiring — the WebGL2 instanced path actually draws the route", () => {
  it("emits capsules that are every one a multiple of 45°, and more than one", () => {
    // This is the test that proves the ROUTE renders, not merely that the
    // geometry function exists: these are the capsule instances the GPU draws.
    const capsules = capsulesOf(ROUTE_STYLE_OCTILINEAR);
    expect(capsules.length).toBeGreaterThan(1);
    const points: Array<readonly [number, number]> = [
      [capsules[0]!.p0[0], capsules[0]!.p0[1]],
      ...capsules.map((capsule) => [capsule.p1[0], capsule.p1[1]] as const),
    ];
    assertOctilinear(points);
  });

  it("draws a CONTIGUOUS chain — each capsule starts where the previous ended", () => {
    const capsules = capsulesOf(ROUTE_STYLE_OCTILINEAR);
    for (let i = 0; i < capsules.length - 1; i += 1) {
      expect(capsules[i]!.p1[0]).toBeCloseTo(capsules[i + 1]!.p0[0], 6);
      expect(capsules[i]!.p1[1]).toBeCloseTo(capsules[i + 1]!.p0[1], 6);
    }
  });

  it("does NOT render an octilinear edge as a flow-port S", () => {
    // The dispatch regression: both draw paths keyed off `route !== 0`, so code
    // 5 would have produced the horizontal-port cubic S instead of the metro
    // route. A flow-port S leaves its source HORIZONTALLY from the right port;
    // this edge is vertical-dominant-free but its first segment must follow the
    // octilinear plan, and the two routes must not coincide.
    const octilinear = capsulesOf(ROUTE_STYLE_OCTILINEAR);
    const flowPort = capsulesOf(ROUTE_STYLE_FLOW_PORT);
    const sameShape =
      octilinear.length === flowPort.length &&
      octilinear.every(
        (capsule, index) =>
          Math.abs(capsule.p1[0] - flowPort[index]!.p1[0]) < 1e-6 &&
          Math.abs(capsule.p1[1] - flowPort[index]!.p1[1]) < 1e-6,
      );
    expect(sameShape).toBe(false);
  });

  it("leaves the flow-port and default routes rendering exactly as before", () => {
    // Flow-port stays a resampled cubic S (CURVE_SEGMENTS capsules), default
    // stays the single straight segment.
    expect(capsulesOf(ROUTE_STYLE_FLOW_PORT).length).toBeGreaterThan(2);
    expect(capsulesOf(ROUTE_STYLE_DEFAULT).length).toBe(1);
  });
});

describe("METRO composition — the layout the route was built for", () => {
  /** Star + a chain, so the BFS produces several lanes with several columns. */
  function metroGraph() {
    const nodeIds = ["hub", "a", "b", "c", "leaf"];
    return {
      nodeIds,
      idToIndex: new Map(nodeIds.map((id, index) => [id, index])),
      positions: new Float32Array(nodeIds.length * 2),
      // hub–a, hub–b, hub–c, c–leaf
      edges: new Uint32Array([0, 1, 0, 2, 0, 3, 3, 4]),
      droppedEdges: 0,
    };
  }

  it("routes every metro edge octilinearly from the layout's own positions", () => {
    const graph = metroGraph();
    const positions = computeMetroPositions(graph);
    let bent = 0;
    for (let e = 0; e + 1 < graph.edges.length; e += 2) {
      const s = graph.edges[e]!;
      const t = graph.edges[e + 1]!;
      const geom = octilinearEdgeGeometry(
        { x: positions[s * 2]!, y: positions[s * 2 + 1]! },
        { x: positions[t * 2]!, y: positions[t * 2 + 1]! },
        noOffset,
      );
      assertOctilinear(geom.polyline!);
      if (geom.polyline!.length > 2) bent += 1;
    }
    // A transit map is not a fan of straight spokes: lane-crossing edges whose
    // columns differ MUST bend, otherwise the route adds nothing over default.
    expect(bent).toBeGreaterThan(0);
  });

  it("keeps a same-column lane change a single vertical segment", () => {
    // hub sits alone on lane 0 at x=0; its middle child also lands on x=0.
    const graph = metroGraph();
    const positions = computeMetroPositions(graph);
    const hub = { x: positions[0]!, y: positions[1]! };
    const middleChild = { x: positions[2 * 2]!, y: positions[2 * 2 + 1]! };
    expect(middleChild.x).toBeCloseTo(hub.x, 10);
    const geom = octilinearEdgeGeometry(hub, middleChild, noOffset);
    expect(geom.polyline).toHaveLength(2);
    expect(geom.outSx).toBeCloseTo(0, 10);
    expect(Math.abs(geom.outSy)).toBeCloseTo(1, 10);
  });
});

describe("non-regression: the existing routes are untouched", () => {
  it("edgeGeometry emits no polyline and tessellates exactly as before", () => {
    const straight = edgeGeometry({ x: 0, y: 0 }, { x: 100, y: 0 }, 0, noOffset);
    expect(straight.polyline).toBeUndefined();
    expect(tessellateEdge(straight, 16)).toEqual([
      [0, 0],
      [100, 0],
    ]);

    const curved = edgeGeometry({ x: 0, y: 0 }, { x: 100, y: 0 }, 0.3, noOffset);
    expect(curved.polyline).toBeUndefined();
    expect(curved.curved).toBe(true);
    const points = tessellateEdge(curved, 16);
    expect(points.length).toBe(17);
    // Quadratic control point per the historical formula, unchanged.
    expect(curved.controlY).toBeCloseTo(100 * 0.3 * EDGE_CURVE_FACTOR, 10);
  });

  it("flowPortEdgeGeometry emits no polyline and stays a cubic S", () => {
    const geom = flowPortEdgeGeometry({ x: 0, y: 0 }, { x: 100, y: 40 }, 5, 5);
    expect(geom.polyline).toBeUndefined();
    expect(geom.cubic).toBe(true);
    expect(tessellateEdge(geom, 16).length).toBe(17);
  });
});
