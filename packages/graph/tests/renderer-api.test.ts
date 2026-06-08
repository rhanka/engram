import { describe, expect, it } from "vitest";
import { createGraphRenderer, createPositionFrame } from "../src/index";

function createFakeWebGlContext() {
  const calls: {
    drawArrays: Array<{ mode: number; first: number; count: number }>;
    bufferData: Array<{ target: number; length: number; usage: number }>;
  } = {
    drawArrays: [],
    bufferData: [],
  };

  let nextShader = 1;
  let nextProgram = 1;
  let nextBuffer = 1;

  return {
    calls,
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
    ARRAY_BUFFER: 0x8892,
    STATIC_DRAW: 0x88e4,
    FLOAT: 0x1406,
    UNSIGNED_BYTE: 0x1401,
    COLOR_BUFFER_BIT: 0x4000,
    LINES: 0x0001,
    POINTS: 0x0000,
    BLEND: 0x0be2,
    SRC_ALPHA: 0x0302,
    ONE_MINUS_SRC_ALPHA: 0x0303,
    createShader: () => ({ id: nextShader++ }),
    shaderSource: () => undefined,
    compileShader: () => undefined,
    getShaderParameter: () => true,
    getShaderInfoLog: () => "",
    createProgram: () => ({ id: nextProgram++ }),
    attachShader: () => undefined,
    linkProgram: () => undefined,
    getProgramParameter: () => true,
    getProgramInfoLog: () => "",
    deleteShader: () => undefined,
    createBuffer: () => ({ id: nextBuffer++ }),
    bindBuffer: () => undefined,
    bufferData: (target: number, data: ArrayBufferView, usage: number) => {
      calls.bufferData.push({ target, length: data.byteLength, usage });
    },
    useProgram: () => undefined,
    getAttribLocation: (_program: unknown, name: string) => (name === "a_position" ? 0 : 1),
    getUniformLocation: (_program: unknown, name: string) => ({ name }),
    uniform2f: () => undefined,
    uniform1f: () => undefined,
    enableVertexAttribArray: () => undefined,
    vertexAttribPointer: () => undefined,
    viewport: () => undefined,
    clearColor: () => undefined,
    clear: () => undefined,
    enable: () => undefined,
    blendFunc: () => undefined,
    drawArrays: (mode: number, first: number, count: number) => {
      calls.drawArrays.push({ mode, first, count });
    },
  };
}

function createFakeCanvas2DContext() {
  const calls: {
    arc: Array<{ x: number; y: number; radius: number }>;
    clearRect: number;
    lineTo: number;
    quadraticCurveTo: number;
    stroke: number;
    fill: number;
  } = {
    arc: [],
    clearRect: 0,
    lineTo: 0,
    quadraticCurveTo: 0,
    stroke: 0,
    fill: 0,
  };

  return {
    calls,
    fillStyle: "",
    lineCap: "",
    lineJoin: "",
    lineWidth: 0,
    strokeStyle: "",
    beginPath: () => undefined,
    clearRect: () => {
      calls.clearRect += 1;
    },
    save: () => undefined,
    restore: () => undefined,
    setLineDash: () => undefined,
    moveTo: () => undefined,
    lineTo: () => {
      calls.lineTo += 1;
    },
    quadraticCurveTo: () => {
      calls.quadraticCurveTo += 1;
    },
    stroke: () => {
      calls.stroke += 1;
    },
    arc: (x: number, y: number, radius: number) => {
      calls.arc.push({ x, y, radius });
    },
    fill: () => {
      calls.fill += 1;
    },
  };
}

describe("createGraphRenderer", () => {
  it("keeps rendering state separate from layout physics", () => {
    const view = createGraphRenderer(null, { interaction: { hover: true } });
    view.setGraph({
      nodeIds: ["a", "b"],
      positions: new Float32Array([0, 0, 100, 50]),
      edges: new Uint32Array([0, 1]),
    });

    view.setPositions(new Float32Array([10, 20, 110, 70]));
    view.updatePositions(createPositionFrame(new Float32Array([20, 30, 120, 80]), { tick: 2 }));
    view.fitView({ padding: 10, viewportWidth: 200, viewportHeight: 100 });
    view.setCamera({ x: 1, y: 2, zoom: 3 });
    expect(() => view.render()).not.toThrow();

    const snapshot = view.snapshot();
    expect(snapshot.nodeCount).toBe(2);
    expect(snapshot.edgeCount).toBe(1);
    expect(snapshot.positions).toEqual([20, 30, 120, 80]);
    expect(snapshot.camera).toEqual({ x: 1, y: 2, zoom: 3 });
    expect(snapshot.layoutOptions).toBeUndefined();

    view.destroy();
    expect(view.snapshot().destroyed).toBe(true);
  });

  it("draws styled edges and nodes through WebGL", () => {
    const gl = createFakeWebGlContext();
    const canvas = {
      width: 200,
      height: 100,
      getContext: () => gl,
    };

    const view = createGraphRenderer(canvas as unknown as HTMLCanvasElement);
    view.setGraph({
      nodeIds: ["a", "b"],
      positions: new Float32Array([0, 0, 100, 0]),
      edges: new Uint32Array([0, 1]),
    });
    view.setStyle({
      nodeSizes: new Float32Array([6, 8]),
      nodeColors: new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255]),
      edgeWidths: new Float32Array([1]),
      edgeColors: new Uint8Array([120, 130, 140, 255]),
      edgeDash: new Uint8Array([0]),
      edgeCurvatures: new Float32Array([0]),
    });

    view.fitView({ padding: 10, viewportWidth: 200, viewportHeight: 100 });
    view.render();

    expect(gl.calls.drawArrays).toEqual([
      { mode: gl.LINES, first: 0, count: 2 },
      { mode: gl.POINTS, first: 0, count: 2 },
    ]);
    expect(gl.calls.bufferData.some((call) => call.length === 4 * Float32Array.BYTES_PER_ELEMENT)).toBe(true);
    expect(gl.calls.bufferData.some((call) => call.length === 8 * Uint8Array.BYTES_PER_ELEMENT)).toBe(true);
  });

  it("falls back to Canvas2D when WebGL is unavailable", () => {
    const context2d = createFakeCanvas2DContext();
    const canvas = {
      width: 200,
      height: 100,
      getContext: (kind: string) => (kind === "2d" ? context2d : null),
    };

    const view = createGraphRenderer(canvas as unknown as HTMLCanvasElement, { pixelRatio: 2 });
    view.setGraph({
      nodeIds: ["a", "b"],
      positions: new Float32Array([0, 0, 100, 0]),
      edges: new Uint32Array([0, 1]),
    });
    view.setStyle({
      nodeSizes: new Float32Array([6, 8]),
      nodeColors: new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255]),
      edgeWidths: new Float32Array([2]),
      edgeColors: new Uint8Array([120, 130, 140, 255]),
      edgeDash: new Uint8Array([0]),
      edgeCurvatures: new Float32Array([0]),
    });

    view.fitView({ padding: 10, viewportWidth: 200, viewportHeight: 100 });
    view.render();

    expect(view.snapshot().hasWebGL).toBe(false);
    expect(context2d.calls.clearRect).toBe(1);
    expect(context2d.calls.stroke).toBe(1);
    expect(context2d.calls.fill).toBe(2);
    expect(context2d.calls.arc.map((call) => call.radius)).toEqual([12, 16]);
  });
});
