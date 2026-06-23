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
  instancedShapeFamilies,
  FLOATS_PER_INSTANCE,
  type WebGLShapeFrame,
} from "../src/webgl-shapes";
import {
  BOX_FILL,
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
  nodes: Array<{ x: number; y: number; size: number; shape: string; rgb: [number, number, number]; a?: number; fill?: 0 | 1; border?: 0 | 1 }>,
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
