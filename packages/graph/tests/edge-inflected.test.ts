/**
 * Inflected (S-curve) edge style — time-oriented v3.
 *
 * The time-oriented lane view draws edges as an INFLECTED cubic Bézier (leaves
 * the source bending one way, reaches the target bending the other) instead of
 * the historical CONVEX quadratic bow. This pins the shared render-geometry shape
 * (two control points on OPPOSITE sides of the chord; a tessellated polyline that
 * CROSSES the chord) and that the opt-in flows through the WebGL instance builder
 * — while the DEFAULT ("convex"/unset) style stays byte-identical (golden-stable).
 */

import { describe, expect, it } from "vitest";
import { edgeGeometry, tessellateEdge } from "../src/render-geometry";
import { buildEdgeInstances, type WebGLEdgeFrame } from "../src/webgl-edges";

const S = { x: 0, y: 0 };
const T = { x: 100, y: 0 }; // horizontal chord ⇒ perpendicular is the Y axis
const noClip = () => 0; // no border clip: start=source, end=target

describe("inflected edge geometry (render-geometry)", () => {
  it("DEFAULT (convex) is unchanged: single control, NOT cubic", () => {
    const straight = edgeGeometry(S, T, 0, noClip);
    expect(straight.curved).toBe(false);
    expect(straight.cubic).toBe(false);

    const bow = edgeGeometry(S, T, 0.3, noClip);
    expect(bow.curved).toBe(true);
    expect(bow.cubic).toBe(false);
    expect(bow.control2X).toBe(0);
    expect(bow.control2Y).toBe(0);
    // A convex bow stays on ONE side of the chord (no inflection).
    const poly = tessellateEdge(bow, 16);
    const ys = poly.map((p) => p[1]);
    expect(ys.every((y) => y >= -1e-9)).toBe(true);
  });

  it("inflected is a CUBIC with the two controls on OPPOSITE sides of the chord", () => {
    const geom = edgeGeometry(S, T, 0, noClip, "inflected");
    expect(geom.curved).toBe(true);
    expect(geom.cubic).toBe(true);
    // c1 near source, c2 near target, offset to opposite sides (S-shape).
    expect(geom.controlY).not.toBe(0);
    expect(geom.control2Y).not.toBe(0);
    expect(Math.sign(geom.controlY)).toBe(-Math.sign(geom.control2Y));
    // Controls sit ~1/3 and ~2/3 along the chord.
    expect(geom.controlX).toBeGreaterThan(0);
    expect(geom.controlX).toBeLessThan(geom.control2X);
    expect(geom.control2X).toBeLessThan(100);
  });

  it("a set per-edge curvature overrides the default inflection amplitude", () => {
    const weak = edgeGeometry(S, T, 0.1, noClip, "inflected");
    const strong = edgeGeometry(S, T, 0.6, noClip, "inflected");
    expect(Math.abs(strong.controlY)).toBeGreaterThan(Math.abs(weak.controlY));
  });

  it("tessellated inflected polyline CROSSES the chord (has an inflection)", () => {
    const geom = edgeGeometry(S, T, 0, noClip, "inflected");
    const poly = tessellateEdge(geom, 16);
    const ys = poly.map((p) => p[1]);
    expect(Math.max(...ys)).toBeGreaterThan(0); // bulges one way
    expect(Math.min(...ys)).toBeLessThan(0); // then the other ⇒ inflection
    // By symmetry the midpoint sits essentially on the chord.
    const mid = poly[Math.floor(poly.length / 2)]!;
    expect(Math.abs(mid[1])).toBeLessThan(1e-6);
  });
});

function singleEdgeFrame(edgeCurve?: "convex" | "inflected"): WebGLEdgeFrame {
  return {
    positions: new Float32Array([-120, 0, 120, 0]),
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
      edgeCurvatures: new Float32Array([0]), // straight unless inflected
      ...(edgeCurve ? { edgeCurve } : {}),
    },
    camera: { x: 0, y: 0, zoom: 1 },
    pixelRatio: 2,
    viewportWidth: 400,
    viewportHeight: 400,
  };
}

describe("inflected edge style flows through the WebGL instance builder", () => {
  it("a STRAIGHT edge (default) ⇒ a single capsule segment", () => {
    const set = buildEdgeInstances(singleEdgeFrame());
    expect(set.capsules.length / 12).toBe(1);
  });

  it("edgeCurve='inflected' tessellates the same straight edge into many segments", () => {
    const set = buildEdgeInstances(singleEdgeFrame("inflected"));
    expect(set.capsules.length / 12).toBeGreaterThan(8);
  });
});
