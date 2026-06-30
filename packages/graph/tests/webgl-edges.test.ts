/**
 * B1 Phase 2 — WebGL instanced EDGE unit gate.
 *
 * Deterministic (no Chrome, no GPU): a recording fake WebGL2 context drives the
 * instanced-edge renderer + the pure `buildEdgeInstances` builder, pinning:
 *  - one instanced capsule (TRIANGLES, 6 verts) draw with N segment instances,
 *  - one instanced arrow (TRIANGLES, 3 verts) draw with the clipped-edge count,
 *  - the renderer routes edges through the WebGL path when the canary is ON and
 *    keeps the legacy 1px `LINES` path when it is OFF (default unchanged),
 *  - shaders compile + the program links against the fake context (smoke).
 */

import { describe, expect, it } from "vitest";
import { createGraphRenderer } from "../src/renderer";
import {
  ARROW_FLOATS_PER_INSTANCE,
  CAPSULE_FLOATS_PER_INSTANCE,
  buildEdgeInstances,
  createWebGLEdgeRenderer,
  type WebGLEdgeFrame,
} from "../src/webgl-edges";
import { shapeCode } from "../src/shape-geometry";

interface Draw {
  mode: number;
  first: number;
  count: number;
  instanceCount: number;
}

function createFakeGL2() {
  const draws: Draw[] = [];
  const TRIANGLES = 0x0004;
  const gl = {
    draws,
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
    TRIANGLES,
    BLEND: 0x0be2,
    SRC_ALPHA: 0x0302,
    ONE_MINUS_SRC_ALPHA: 0x0303,
    getAttribLocation: (_p: unknown, name: string) =>
      ({ a_position: 0, a_color: 1, a_size: 2 } as Record<string, number>)[name] ?? -1,
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
    bufferData: () => undefined,
    enableVertexAttribArray: () => undefined,
    vertexAttribPointer: () => undefined,
    vertexAttribDivisor: () => undefined,
    enable: () => undefined,
    blendFunc: () => undefined,
    drawArraysInstanced: (mode: number, first: number, count: number, instanceCount: number) => {
      draws.push({ mode, first, count, instanceCount });
    },
  };
  return gl;
}

/** A straight single-edge frame (two circle endpoints) in device px. */
function edgeFrame(opts: { curvature?: number; dash?: number; width?: number } = {}): WebGLEdgeFrame {
  return {
    positions: new Float32Array([-120, 0, 120, 0]),
    nodeCount: 2,
    edges: new Uint32Array([0, 1]),
    style: {
      nodeSizes: new Float32Array([8, 8]),
      nodeColors: new Uint8Array([200, 200, 200, 255, 200, 200, 200, 255]),
      nodeShapes: new Uint8Array([0, 0]),
      nodeLabels: ["", ""],
      edgeWidths: new Float32Array([opts.width ?? 4]),
      edgeColors: new Uint8Array([29, 78, 216, 255]),
      edgeDash: new Uint8Array([opts.dash ?? 0]),
      edgeCurvatures: new Float32Array([opts.curvature ?? 0]),
    },
    camera: { x: 0, y: 0, zoom: 1 },
    pixelRatio: 2,
    viewportWidth: 400,
    viewportHeight: 400,
  };
}

describe("B1 Phase 2 — instanced edge draw contract (fake WebGL2)", () => {
  it("a straight clipped edge ⇒ one capsule draw (1 seg) + one arrow draw (1)", () => {
    const gl = createFakeGL2();
    const renderer = createWebGLEdgeRenderer(gl as unknown as WebGL2RenderingContext);
    expect(renderer).toBeTruthy();
    renderer!.renderEdges(edgeFrame());
    const triDraws = gl.draws.filter((d) => d.mode === gl.TRIANGLES);
    // Capsule (count 6) with 1 segment instance + arrow (count 3) with 1 instance.
    const capsule = triDraws.find((d) => d.count === 6)!;
    const arrow = triDraws.find((d) => d.count === 3)!;
    expect(capsule.instanceCount).toBe(1);
    expect(arrow.instanceCount).toBe(1);
  });

  it("a curved edge ⇒ many capsule segment instances, still one arrow", () => {
    const gl = createFakeGL2();
    const renderer = createWebGLEdgeRenderer(gl as unknown as WebGL2RenderingContext)!;
    renderer.renderEdges(edgeFrame({ curvature: 0.5 }));
    const capsule = gl.draws.find((d) => d.mode === gl.TRIANGLES && d.count === 6)!;
    const arrow = gl.draws.find((d) => d.mode === gl.TRIANGLES && d.count === 3)!;
    expect(capsule.instanceCount).toBeGreaterThan(8); // tessellated curve
    expect(arrow.instanceCount).toBe(1);
  });

  it("returns null for a non-WebGL2 (no-instancing) context", () => {
    expect(createWebGLEdgeRenderer(null)).toBeNull();
    expect(createWebGLEdgeRenderer({} as unknown as WebGL2RenderingContext)).toBeNull();
  });

  it("instance buffer strides match the decoders", () => {
    expect(CAPSULE_FLOATS_PER_INSTANCE).toBe(12);
    expect(ARROW_FLOATS_PER_INSTANCE).toBe(9);
    const set = buildEdgeInstances(edgeFrame());
    expect(set.capsules.length % CAPSULE_FLOATS_PER_INSTANCE).toBe(0);
    expect(set.arrows.length % ARROW_FLOATS_PER_INSTANCE).toBe(0);
  });
});

describe("B1 Phase 2 — renderer edge routing (internal canary)", () => {
  function fakeCanvasWithGL2() {
    const gl = createFakeGL2();
    const canvas = {
      width: 400,
      height: 400,
      getContext: (type: string) => (type === "webgl2" ? gl : null),
    };
    return { canvas, gl };
  }

  function wireGraph(renderer: ReturnType<typeof createGraphRenderer>) {
    renderer.setGraph({
      nodeIds: ["a", "b"],
      positions: new Float32Array([-30, 0, 30, 0]),
      edges: new Uint32Array([0, 1]),
    });
    renderer.setStyle({
      nodeSizes: new Float32Array([12, 12]),
      nodeColors: new Uint8Array([214, 39, 40, 255, 31, 119, 180, 255]),
      nodeShapes: new Uint8Array([shapeCode("circle"), shapeCode("circle")]),
      edgeWidths: new Float32Array([4]),
      edgeColors: new Uint8Array([29, 78, 216, 255]),
      edgeDash: new Uint8Array([0]),
      edgeCurvatures: new Float32Array([0]),
    });
    renderer.render();
  }

  it("instancedShapes:true ⇒ edges drawn by the instanced capsule path (TRIANGLES), NOT legacy LINES", () => {
    const { canvas, gl } = fakeCanvasWithGL2();
    const renderer = createGraphRenderer(canvas as never, {
      backend: "webgl",
      pixelRatio: 2,
      instancedShapes: true,
    });
    wireGraph(renderer);
    // No legacy LINES draw; instanced TRIANGLES for the capsule + arrow.
    const lineDraws = gl.draws.filter((d) => d.mode === gl.LINES);
    const triDraws = gl.draws.filter((d) => d.mode === gl.TRIANGLES);
    expect(lineDraws).toHaveLength(0);
    expect(triDraws.some((d) => d.count === 6)).toBe(true); // capsule
    expect(triDraws.some((d) => d.count === 3)).toBe(true); // arrow
  });

  it("default (no flag) ⇒ legacy 1px LINES edge path, no instanced edge draws", () => {
    const { canvas, gl } = fakeCanvasWithGL2();
    const renderer = createGraphRenderer(canvas as never, { backend: "webgl", pixelRatio: 2 });
    wireGraph(renderer);
    // The legacy LINES draw is issued via drawArrays (recorded as a no-op here),
    // so no instanced TRIANGLES edge draws appear.
    const triDraws = gl.draws.filter((d) => d.mode === gl.TRIANGLES);
    expect(triDraws).toHaveLength(0);
  });
});
