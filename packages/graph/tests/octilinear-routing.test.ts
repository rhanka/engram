import { describe, expect, it } from "vitest";

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
