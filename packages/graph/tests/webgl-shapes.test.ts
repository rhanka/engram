/**
 * B1 Phase 1 — WebGL instanced node-shape unit gate.
 *
 * Deterministic (no Chrome, no GPU): a recording fake WebGL2 context drives the
 * instanced-shape renderer and the pure `buildShapeInstances` builder, pinning:
 *  - one instanced TRIANGLE_FAN draw per shape family present (N2-N6 + circle),
 *  - the unit geometry uploaded per family == shapePolygonPoints / disc,
 *  - radius-as-radius (N1), hollow fixed-alpha interior (N10), bold ring (N11),
 *  - box (shape 5) is NOT drawn here (Canvas2D in Phase 1),
 *  - N1b non-finite coercion + count surfacing.
 */

import { describe, expect, it } from "vitest";
import { createGraphRenderer } from "../src/renderer";
import {
  buildShapeInstances,
  createWebGLShapeRenderer,
  decodeInstance,
  effectiveStrokeHalfWidth,
  instancedShapeFamilies,
  FLOATS_PER_INSTANCE,
  type WebGLShapeFrame,
} from "../src/webgl-shapes";
import {
  BOX_FILL,
  borderStrokeWidthPx,
  drawnRadius,
  unitShapeGeometry,
} from "../src/render-geometry";
import { shapeCode, shapePolygonPoints } from "../src/shape-geometry";

interface InstancedDraw {
  mode: number;
  first: number;
  count: number;
  instanceCount: number;
  instanceData: number[] | null;
}

function createFakeGL2() {
  const draws: InstancedDraw[] = [];
  const bufferUploads: { length: number; values: number[] | null }[] = [];
  let lastInstanceData: number[] | null = null;
  const TRIANGLE_FAN = 0x0006;

  const gl = {
    draws,
    bufferUploads,
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
    ARRAY_BUFFER: 0x8892,
    STATIC_DRAW: 0x88e4,
    DYNAMIC_DRAW: 0x88e8,
    FLOAT: 0x1406,
    UNSIGNED_BYTE: 0x1401,
    COLOR_BUFFER_BIT: 0x4000,
    LINES: 0x0001,
    POINTS: 0x0000,
    BLEND: 0x0be2,
    SRC_ALPHA: 0x0302,
    ONE_MINUS_SRC_ALPHA: 0x0303,
    TRIANGLE_FAN,
    getAttribLocation: (_p: unknown, name: string) =>
      ({ a_position: 0, a_color: 1, a_size: 2 } as Record<string, number>)[name] ?? -1,
    enableVertexAttribArray2: () => undefined,
    viewport: () => undefined,
    clearColor: () => undefined,
    clear: () => undefined,
    drawArrays: () => undefined,
    createShader: () => ({}),
    shaderSource: () => undefined,
    compileShader: () => undefined,
    getShaderParameter: () => true,
    getShaderInfoLog: () => "",
    deleteShader: () => undefined,
    createProgram: () => ({}),
    attachShader: () => undefined,
    linkProgram: () => undefined,
    getProgramParameter: () => true,
    getProgramInfoLog: () => "",
    deleteProgram: () => undefined,
    useProgram: () => undefined,
    getUniformLocation: (_p: unknown, name: string) => ({ name }),
    uniform1f: () => undefined,
    uniform2f: () => undefined,
    uniformMatrix4fv: () => undefined,
    createVertexArray: () => ({}),
    bindVertexArray: () => undefined,
    deleteVertexArray: () => undefined,
    createBuffer: () => ({}),
    bindBuffer: () => undefined,
    deleteBuffer: () => undefined,
    bufferData: (_t: number, data: ArrayBufferView, usage: number) => {
      const values = data instanceof Float32Array ? Array.from(data) : null;
      bufferUploads.push({ length: data.byteLength, values });
      if (usage === gl.DYNAMIC_DRAW) lastInstanceData = values;
    },
    enableVertexAttribArray: () => undefined,
    vertexAttribPointer: () => undefined,
    vertexAttribDivisor: () => undefined,
    enable: () => undefined,
    blendFunc: () => undefined,
    drawArraysInstanced: (mode: number, first: number, count: number, instanceCount: number) => {
      draws.push({ mode, first, count, instanceCount, instanceData: lastInstanceData });
    },
  };
  return gl;
}

function frame(
  nodes: Array<{
    x: number;
    y: number;
    size: number;
    shape: string;
    rgb: [number, number, number];
    a?: number;
    fill?: 0 | 1;
    border?: 0 | 1;
    halo?: boolean;
  }>,
  dpr = 2,
  zoom = 1,
): WebGLShapeFrame {
  const n = nodes.length;
  const positions = new Float32Array(n * 2);
  const nodeSizes = new Float32Array(n);
  const nodeShapes = new Uint8Array(n);
  const nodeColors = new Uint8Array(n * 4);
  const nodeFills = new Uint8Array(n);
  const nodeBorders = new Uint8Array(n);
  const haloMask = new Uint8Array(n);
  nodes.forEach((node, i) => {
    positions[i * 2] = node.x;
    positions[i * 2 + 1] = node.y;
    nodeSizes[i] = node.size;
    nodeShapes[i] = shapeCode(node.shape);
    nodeColors[i * 4] = node.rgb[0];
    nodeColors[i * 4 + 1] = node.rgb[1];
    nodeColors[i * 4 + 2] = node.rgb[2];
    nodeColors[i * 4 + 3] = node.a ?? 255;
    nodeFills[i] = node.fill ?? 0;
    nodeBorders[i] = node.border ?? 0;
    haloMask[i] = node.halo ? 1 : 0;
  });
  return {
    positions,
    nodeCount: n,
    style: {
      nodeSizes,
      nodeColors,
      nodeShapes,
      nodeFills,
      nodeBorders,
      haloMask,
      haloColor: new Uint8Array([45, 90, 135, 255]),
      edgeWidths: new Float32Array(),
      edgeColors: new Uint8Array(),
      edgeDash: new Uint8Array(),
      edgeCurvatures: new Float32Array(),
    },
    camera: { x: 0, y: 0, zoom },
    pixelRatio: dpr,
    viewportWidth: Math.round(200 * dpr),
    viewportHeight: Math.round(200 * dpr),
  };
}

describe("B1 Phase 1 — unit shape geometry single-source (N2-N6)", () => {
  it("polygon families reuse shapePolygonPoints(code, 1) (single source, float32)", () => {
    for (const shape of [1, 2, 3, 4, 6]) {
      const poly = shapePolygonPoints(shape, 1)!;
      const unit = unitShapeGeometry(shape);
      // fan = [centre, p0..pN, p0]; the outline points (skip centre + closing).
      // The GPU buffer is Float32Array, so compare to float32 precision — the
      // geometry is single-sourced from shapePolygonPoints, only the storage
      // type differs.
      expect(unit.fanVertexCount).toBe(poly.length + 2);
      for (let i = 0; i < poly.length; i += 1) {
        expect(unit.fan[(i + 1) * 2]).toBeCloseTo(poly[i]![0], 5);
        expect(unit.fan[(i + 1) * 2 + 1]).toBeCloseTo(poly[i]![1], 5);
      }
    }
  });

  it("circle (code 0) is a smooth many-gon disc closed back to its first vertex", () => {
    const unit = unitShapeGeometry(0);
    expect(unit.fanVertexCount).toBeGreaterThan(16);
    // First & last outline vertex coincide (closed fan).
    const firstX = unit.fan[2];
    const lastX = unit.fan[(unit.fanVertexCount - 1) * 2];
    expect(lastX).toBeCloseTo(firstX!, 6);
  });
});

describe("B1 Phase 1 — instanced draw contract (fake WebGL2)", () => {
  it("issues exactly one instanced TRIANGLE_FAN draw per shape family present", () => {
    const gl = createFakeGL2();
    const renderer = createWebGLShapeRenderer(gl as unknown as WebGL2RenderingContext);
    expect(renderer).toBeTruthy();
    renderer!.renderShapes(
      frame([
        { x: -40, y: 0, size: 14, shape: "circle", rgb: [214, 39, 40] },
        { x: 40, y: 0, size: 14, shape: "diamond", rgb: [31, 119, 180] },
        { x: 0, y: 40, size: 14, shape: "diamond", rgb: [44, 160, 44] }, // 2nd diamond
      ]),
    );
    // One diamond draw (2 instances) + one circle draw (1 instance).
    const fanDraws = gl.draws.filter((d) => d.mode === gl.TRIANGLE_FAN);
    expect(fanDraws).toHaveLength(2);
    const counts = fanDraws.map((d) => d.instanceCount).sort();
    expect(counts).toEqual([1, 2]);
  });

  it("runs a low-alpha expanded halo pass before the main node pass", () => {
    const gl = createFakeGL2();
    const renderer = createWebGLShapeRenderer(gl as unknown as WebGL2RenderingContext)!;
    renderer.renderShapes(
      frame([{ x: 0, y: 0, size: 14, shape: "circle", rgb: [214, 39, 40], halo: true }]),
    );

    expect(gl.draws).toHaveLength(2);
    const halo = gl.draws[0]!.instanceData!;
    const node = gl.draws[1]!.instanceData!;
    expect(halo[2]).toBeGreaterThan(node[2]);
    expect(halo[6]).toBeCloseTo(0.28, 5);
  });

  it("box (shape 5) is NOT drawn by the instanced path (Canvas2D in Phase 1)", () => {
    const gl = createFakeGL2();
    const renderer = createWebGLShapeRenderer(gl as unknown as WebGL2RenderingContext)!;
    renderer.renderShapes(frame([{ x: 0, y: 0, size: 14, shape: "box", rgb: [148, 103, 189] }]));
    expect(gl.draws).toHaveLength(0);
  });

  it("returns null for a non-WebGL2 (no-instancing) context", () => {
    expect(createWebGLShapeRenderer(null)).toBeNull();
    expect(createWebGLShapeRenderer({} as unknown as WebGL2RenderingContext)).toBeNull();
  });
});

describe("B1 Phase 1 — instance attribute parity (N1/N10/N11)", () => {
  it("solid node: radius-as-radius + node colour + alpha (N1)", () => {
    const set = buildShapeInstances(frame([{ x: 0, y: 0, size: 14, shape: "circle", rgb: [214, 39, 40], a: 128 }]));
    const inst = decodeInstance(set.fill.get(0)!, 0);
    expect(inst.radius).toBeCloseTo(drawnRadius(14, 2, 1), 6);
    expect(inst.color[3]).toBeCloseTo(128 / 255, 5);
    expect(Math.round(inst.color[0] * 255)).toBe(214);
  });

  it("hollow node: interior is FIXED translucent-white alpha-INDEPENDENT, border carries node alpha (N10)", () => {
    const dimmed = buildShapeInstances(
      frame([{ x: 0, y: 0, size: 14, shape: "circle", rgb: [214, 39, 40], a: 50, fill: 1 }]),
    );
    // Fill list has the outer (full-radius) translucent-white + inner interior.
    const fill = dimmed.fill.get(0)!;
    const outer = decodeInstance(fill, 0);
    // Fixed white at 0.5 alpha regardless of the node's 50/255 alpha.
    expect(Math.round(outer.color[0] * 255)).toBe(BOX_FILL[0]);
    expect(outer.color[3]).toBeCloseTo(BOX_FILL[3] / 255, 5);
    // Border carries the node alpha (50/255).
    const border = decodeInstance(dimmed.border.get(0)!, 0);
    expect(border.color[3]).toBeCloseTo(50 / 255, 5);
    expect(Math.round(border.color[0] * 255)).toBe(214);
  });

  it("solid+bold node: a darkened-colour ring (factor 0.62) under the fill (N11)", () => {
    const set = buildShapeInstances(
      frame([{ x: 0, y: 0, size: 14, shape: "square", rgb: [200, 100, 50], border: 1 }]),
    );
    const code = shapeCode("square");
    const border = decodeInstance(set.border.get(code)!, 0);
    expect(Math.round(border.color[0] * 255)).toBe(Math.round(200 * 0.62));
    expect(Math.round(border.color[1] * 255)).toBe(Math.round(100 * 0.62));
  });

  // ---------------------------------------------------------------------
  // Border-thickness geometry (per-shape apothem compensation + per-shape
  // THINNING, 2026-07-13 user request): circles/hexagons used to draw a MUCH
  // thicker PERPENDICULAR border than diamonds/squares. The two-disc ring is
  // built by scaling the WHOLE unit polygon by a RADIAL offset (radius ±
  // effectiveStrokeHalf); for a disc (apothem == radius) the radial offset IS
  // the perpendicular gap, but for a flat polygon face the gap between the
  // outer/inner similar polygons, measured PERPENDICULAR to that face, is
  // `effectiveStrokeHalf · apothemRatio(family)` (apothem = radius ·
  // apothemRatio). The apothem-compensation fix set
  // `effectiveStrokeHalf(family) = strokeHalf · BORDER_PERP_SCALE /
  // apothemRatio(family)` — a RADIAL offset that VARIES by family — so that,
  // once foreshortened by that same family's apothem ratio, every family's
  // VISIBLE perpendicular width landed on a COMMON `strokeHalf ·
  // BORDER_PERP_SCALE` baseline. On TOP of that baseline, `SHAPE_BORDER_THIN`
  // now applies an ADDITIONAL per-shape cut: circle/hexagon × 0.5, and
  // diamond/square/star/triangle × 0.8 — so the perpendicular width is no
  // longer fully uniform, but a deliberate TWO-TIER geometry: circle/hexagon
  // together (thinner), and diamond/square/star/triangle together (the other
  // tier), each tier internally uniform.
  // ---------------------------------------------------------------------
  describe("border perpendicular half-width: two-tier by shape (circle/hexagon thinner)", () => {
    const SHAPE_NAME_BY_FAMILY: Record<number, string> = {
      0: "circle",
      1: "diamond",
      2: "star",
      3: "hexagon",
      4: "square",
      6: "triangle",
    };
    // Documented apothem-per-a_radius ratios (shape-geometry.ts regular
    // polygons; star approximated) — an INDEPENDENT copy of the source's
    // lookup so this test pins the intended per-shape numbers, not merely
    // the implementation's own arithmetic. NOTE square is 0.88 (its own
    // SQUARE_INSET_RATIO), NOT cos(45°)=0.707 — the square's unit outline is
    // pre-inset BEFORE the a_radius scale (shape-geometry.ts), unlike diamond
    // (same 4-gon shape, but no inset, so a_radius IS its circumradius).
    const APOTHEM_RATIO_BY_FAMILY: Record<number, number> = {
      0: 1.0,
      1: 0.707,
      2: 0.5,
      3: 0.866,
      4: 0.88,
      6: 0.5,
    };
    // Independent copy of SHAPE_BORDER_THIN (webgl-shapes.ts): circle/hexagon
    // get the 50%-thinner cut, diamond/square/star/triangle the 20%-thinner
    // cut (star/triangle NOT specified by the user request — defaulted to
    // the same 0.8 as the other angular shapes).
    const THIN_FACTOR_BY_FAMILY: Record<number, number> = {
      0: 0.5,
      3: 0.5,
      1: 0.8,
      4: 0.8,
      2: 0.8,
      6: 0.8,
    };
    const dpr = 2;
    const zoom = 1;

    function radialHalfWidth(family: number, bold: boolean): number {
      const shapeName = SHAPE_NAME_BY_FAMILY[family]!;
      const code = shapeCode(shapeName);
      const set = buildShapeInstances(
        frame([{ x: 0, y: 0, size: 20, shape: shapeName, rgb: [10, 20, 30], fill: 1, border: bold ? 1 : 0 }], dpr, zoom),
      );
      const border = decodeInstance(set.border.get(code)!, 0);
      const innerFill = decodeInstance(set.fill.get(code)!, 0);
      return (border.radius - innerFill.radius) / 2;
    }

    it.each(instancedShapeFamilies())(
      "family %i: RADIAL ring half-width matches effectiveStrokeHalfWidth (varies BY DESIGN)",
      (family) => {
        const halfWidth = radialHalfWidth(family, false);
        const expected = effectiveStrokeHalfWidth(family, false, dpr, zoom);
        expect(halfWidth).toBeCloseTo(expected, 5);
      },
    );

    it("circle & hexagon PERPENDICULAR width == (0.5/0.8) x the square/diamond PERPENDICULAR width", () => {
      // NOTE: the two SHAPE_BORDER_THIN multipliers (0.5 for circle/hexagon,
      // 0.8 for square/diamond) are each applied to the SAME shared
      // BORDER_PERP_SCALE baseline (0.616 x strokeHalf), so the resulting
      // CROSS-TIER ratio is 0.5 / 0.8 = 0.625, NOT 0.5 — 0.5 is only the
      // circle/hexagon multiplier value itself, not its ratio to the other
      // tier's already-different (0.8x) multiplier. Verified numerically
      // (0.308 / 0.493 = 0.625) before writing this assertion.
      const perpWidths = instancedShapeFamilies().map((family) => {
        const radial = radialHalfWidth(family, true);
        return { family, perp: radial * APOTHEM_RATIO_BY_FAMILY[family]! };
      });
      const circle = perpWidths.find((p) => p.family === 0)!.perp;
      const hexagon = perpWidths.find((p) => p.family === 3)!.perp;
      const square = perpWidths.find((p) => p.family === 4)!.perp;
      const diamond = perpWidths.find((p) => p.family === 1)!.perp;
      const expectedRatio = 0.5 / 0.8; // 0.625
      // Precision 2: same rounding-literal tolerance as elsewhere in this
      // file (documented ROUNDED apothem ratios vs the source's exact trig).
      expect(circle / square).toBeCloseTo(expectedRatio, 2);
      expect(hexagon / diamond).toBeCloseTo(expectedRatio, 2);
    });

    it("square, diamond, star, triangle PERPENDICULAR widths are equal to each other (same tier)", () => {
      const perpWidths = instancedShapeFamilies().map((family) => {
        const radial = radialHalfWidth(family, true);
        return { family, perp: radial * APOTHEM_RATIO_BY_FAMILY[family]! };
      });
      const angularFamilies = [1, 2, 4, 6];
      const reference = perpWidths.find((p) => p.family === angularFamilies[0])!.perp;
      for (const family of angularFamilies) {
        const perp = perpWidths.find((p) => p.family === family)!.perp;
        expect(perp, `family ${family}: perpendicular width ${perp} != reference ${reference}`).toBeCloseTo(
          reference,
          3,
        );
      }
    });

    it("circle & hexagon PERPENDICULAR widths are equal to each other (same tier)", () => {
      const perpWidths = instancedShapeFamilies().map((family) => {
        const radial = radialHalfWidth(family, true);
        return { family, perp: radial * APOTHEM_RATIO_BY_FAMILY[family]! };
      });
      const circle = perpWidths.find((p) => p.family === 0)!.perp;
      const hexagon = perpWidths.find((p) => p.family === 3)!.perp;
      expect(circle).toBeCloseTo(hexagon, 3);
    });

    it("REGRESSION LOCK: absolute perpendicular widths, relative to raw strokeHalfWidth", () => {
      // Raw (uncompensated, un-thinned) stroke half-width — the common unit
      // both tiers are expressed as a fraction of.
      const base = borderStrokeWidthPx(true, dpr, zoom) / 2;
      const OUTLINE_WEIGHT_BOOST = 1.12; // WEBGL_OUTLINE_WEIGHT_BOOST, unchanged by this fix
      const rawStrokeHalf = base * OUTLINE_WEIGHT_BOOST;

      const perpWidths = instancedShapeFamilies().map((family) => {
        const radial = radialHalfWidth(family, true);
        return { family, perp: radial * APOTHEM_RATIO_BY_FAMILY[family]! };
      });
      const circle = perpWidths.find((p) => p.family === 0)!.perp;
      const hexagon = perpWidths.find((p) => p.family === 3)!.perp;
      const square = perpWidths.find((p) => p.family === 4)!.perp;
      const diamond = perpWidths.find((p) => p.family === 1)!.perp;

      // circle/hexagon: 0.616 (BORDER_PERP_SCALE) x 0.5 (thin factor) = 0.308
      expect(circle / rawStrokeHalf).toBeCloseTo(0.308, 2);
      expect(hexagon / rawStrokeHalf).toBeCloseTo(0.308, 2);
      // square/diamond (and star/triangle, same tier): 0.616 x 0.8 = 0.493
      expect(square / rawStrokeHalf).toBeCloseTo(0.493, 2);
      expect(diamond / rawStrokeHalf).toBeCloseTo(0.493, 2);
    });

    it("per-shape thin factor matches effectiveStrokeHalfWidth directly (unit-level, no ring geometry)", () => {
      for (const family of instancedShapeFamilies()) {
        const withThin = effectiveStrokeHalfWidth(family, false, dpr, zoom);
        // Reconstruct the pre-thin (apothem-compensated only) baseline the
        // same way the source's BORDER_PERP_SCALE doc describes it, then
        // check the ratio against THIN_FACTOR_BY_FAMILY.
        const base = borderStrokeWidthPx(false, dpr, zoom) / 2;
        const rawStrokeHalf = base * 1.12;
        const apothem = APOTHEM_RATIO_BY_FAMILY[family]!;
        const preThinBaseline = (rawStrokeHalf * (0.7 * 0.88)) / apothem;
        expect(withThin / preThinBaseline).toBeCloseTo(THIN_FACTOR_BY_FAMILY[family]!, 2);
      }
    });
  });
});

describe("B1 Phase 1 — N1b non-finite world-coord coercion", () => {
  it("coerces NaN/Inf positions to the centre and surfaces the count (never silent NaN-drop)", () => {
    const f = frame([{ x: 0, y: 0, size: 14, shape: "circle", rgb: [0, 0, 0] }]);
    f.positions = new Float32Array([Number.NaN, Number.POSITIVE_INFINITY]);
    f.centerX = 7;
    f.centerY = 9;
    const set = buildShapeInstances(f);
    expect(set.nonFiniteCount).toBe(2);
    const inst = decodeInstance(set.fill.get(0)!, 0);
    expect(inst.center).toEqual([7, 9]);
  });
});

describe("B1 Phase 1 — instance buffer encoding", () => {
  it("FLOATS_PER_INSTANCE matches a decoded instance stride; families exclude the box", () => {
    expect(FLOATS_PER_INSTANCE).toBe(8);
    expect(instancedShapeFamilies()).not.toContain(5);
    expect(instancedShapeFamilies()).toEqual([0, 1, 2, 3, 4, 6]);
  });
});

describe("B1 Phase 1 — renderer flag wiring (internal canary)", () => {
  function fakeCanvasWithGL2() {
    const gl = createFakeGL2();
    const canvas = {
      width: 400,
      height: 400,
      getContext: (type: string) => (type === "webgl2" ? gl : null),
    };
    return { canvas, gl };
  }

  it("instancedShapes:true + WebGL2 context ⇒ snapshot.instancedShapes true, draws instanced", () => {
    const { canvas, gl } = fakeCanvasWithGL2();
    const renderer = createGraphRenderer(canvas as never, {
      backend: "webgl",
      pixelRatio: 2,
      instancedShapes: true,
    });
    renderer.setGraph({
      nodeIds: ["a", "b"],
      positions: new Float32Array([-30, 0, 30, 0]),
      edges: new Uint32Array([]),
    });
    renderer.setStyle({
      nodeSizes: new Float32Array([12, 12]),
      nodeColors: new Uint8Array([214, 39, 40, 255, 31, 119, 180, 255]),
      nodeShapes: new Uint8Array([shapeCode("circle"), shapeCode("diamond")]),
      edgeWidths: new Float32Array(),
      edgeColors: new Uint8Array(),
      edgeDash: new Uint8Array(),
      edgeCurvatures: new Float32Array(),
    });
    renderer.render();
    const snap = renderer.snapshot();
    expect(snap.backend).toBe("webgl");
    expect(snap.instancedShapes).toBe(true);
    // Two families ⇒ two instanced fan draws.
    expect(gl.draws.filter((d) => d.mode === gl.TRIANGLE_FAN)).toHaveLength(2);
  });

  it("default (no flag) ⇒ legacy point-sprite path, snapshot.instancedShapes false", () => {
    const { canvas, gl } = fakeCanvasWithGL2();
    const renderer = createGraphRenderer(canvas as never, { backend: "webgl", pixelRatio: 1 });
    renderer.setGraph({
      nodeIds: ["a"],
      positions: new Float32Array([0, 0]),
      edges: new Uint32Array([]),
    });
    renderer.render();
    expect(renderer.snapshot().instancedShapes).toBe(false);
    // No instanced draws on the legacy path.
    expect(gl.draws.filter((d) => d.mode === gl.TRIANGLE_FAN)).toHaveLength(0);
  });
});
