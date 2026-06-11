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
    closePath: number;
    fillText: Array<{ text: string; x: number; y: number }>;
    lineTo: number;
    moveTo: number;
    quadraticCurveTo: number;
    setLineDash: number[][];
    stroke: number;
    fill: number;
  } = {
    arc: [],
    clearRect: 0,
    closePath: 0,
    fillText: [],
    lineTo: 0,
    moveTo: 0,
    quadraticCurveTo: 0,
    setLineDash: [],
    stroke: 0,
    fill: 0,
  };

  return {
    calls,
    font: "",
    fillStyle: "",
    lineCap: "",
    lineJoin: "",
    lineWidth: 0,
    textAlign: "",
    textBaseline: "",
    strokeStyle: "",
    globalAlpha: 1,
    beginPath: () => undefined,
    clearRect: () => {
      calls.clearRect += 1;
    },
    closePath: () => {
      calls.closePath += 1;
    },
    save: () => undefined,
    restore: () => undefined,
    setLineDash: (segments: number[]) => {
      calls.setLineDash.push([...segments]);
    },
    moveTo: () => {
      calls.moveTo += 1;
    },
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
    fillText: (text: string, x: number, y: number) => {
      calls.fillText.push({ text, x, y });
    },
    // Deterministic stub: width proportional to character count so the box
    // sizing path is exercised without a real font metrics engine.
    measureText: (text: string) => ({ width: text.length * 7 }),
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
      nodeShapes: new Uint8Array([0, 0]),
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

  it("skips edge drawing through WebGL when render({ skipEdges: true })", () => {
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
      nodeShapes: new Uint8Array([0, 0]),
      edgeWidths: new Float32Array([1]),
      edgeColors: new Uint8Array([120, 130, 140, 255]),
      edgeDash: new Uint8Array([0]),
      edgeCurvatures: new Float32Array([0]),
    });

    view.fitView({ padding: 10, viewportWidth: 200, viewportHeight: 100 });
    view.render({ skipEdges: true });

    // Only the POINTS (node) draw call should be issued; the LINES (edge) call is skipped.
    expect(gl.calls.drawArrays).toEqual([{ mode: gl.POINTS, first: 0, count: 2 }]);
  });

  it("skips edge drawing through Canvas2D when render({ skipEdges: true })", () => {
    const context2d = createFakeCanvas2DContext();
    const canvas = {
      width: 200,
      height: 100,
      getContext: (kind: string) => (kind === "2d" ? context2d : null),
    };

    const view = createGraphRenderer(canvas as unknown as HTMLCanvasElement, { pixelRatio: 1 });
    view.setGraph({
      nodeIds: ["a", "b"],
      positions: new Float32Array([0, 0, 100, 0]),
      edges: new Uint32Array([0, 1]),
    });
    view.setStyle({
      nodeSizes: new Float32Array([6, 8]),
      nodeColors: new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255]),
      nodeShapes: new Uint8Array([0, 0]),
      edgeWidths: new Float32Array([2]),
      edgeColors: new Uint8Array([120, 130, 140, 255]),
      edgeDash: new Uint8Array([0]),
      edgeCurvatures: new Float32Array([0]),
    });

    view.fitView({ padding: 10, viewportWidth: 200, viewportHeight: 100 });
    view.render({ skipEdges: true });

    // No edge stroke; nodes still filled (2 of them).
    expect(context2d.calls.stroke).toBe(0);
    expect(context2d.calls.fill).toBe(2);
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
      nodeShapes: new Uint8Array([0, 0]),
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
    // World-space node sizing: radius = nodeSize * pixelRatio * cameraZoom.
    // fitView here yields zoom = min(180/100, 80/1) = 1.8, pixelRatio = 2.
    expect(context2d.calls.arc.map((call) => call.radius)).toEqual([21.6, 28.8]);
  });

  it("can force Canvas2D to preserve rich shapes and edge styles when WebGL exists", () => {
    const gl = createFakeWebGlContext();
    const context2d = createFakeCanvas2DContext();
    const requestedContexts: string[] = [];
    const canvas = {
      width: 200,
      height: 100,
      getContext: (kind: string) => {
        requestedContexts.push(kind);
        if (kind === "2d") return context2d;
        return gl;
      },
    };

    const view = createGraphRenderer(canvas as unknown as HTMLCanvasElement, {
      backend: "canvas2d",
      pixelRatio: 1,
    });
    view.setGraph({
      nodeIds: ["diamond", "hex"],
      positions: new Float32Array([0, 0, 100, 0]),
      edges: new Uint32Array([0, 1]),
    });
    view.setStyle({
      nodeSizes: new Float32Array([6, 8]),
      nodeColors: new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255]),
      nodeShapes: new Uint8Array([1, 3]),
      edgeWidths: new Float32Array([3]),
      edgeColors: new Uint8Array([120, 130, 140, 128]),
      edgeDash: new Uint8Array([3]),
      edgeCurvatures: new Float32Array([0.25]),
    });

    view.fitView({ padding: 10, viewportWidth: 200, viewportHeight: 100 });
    view.render();

    expect(requestedContexts).toEqual(["2d"]);
    expect(view.snapshot().hasWebGL).toBe(false);
    expect(view.snapshot().backend).toBe("canvas2d");
    expect(gl.calls.drawArrays).toHaveLength(0);
    expect(context2d.calls.quadraticCurveTo).toBe(1);
    expect(context2d.calls.setLineDash).toContainEqual([10, 6]);
    expect(context2d.calls.arc).toHaveLength(0);
    expect(context2d.calls.lineTo).toBeGreaterThanOrEqual(8);
    expect(context2d.calls.closePath).toBeGreaterThanOrEqual(2);
  });

  it("draws legacy box glyphs in Canvas2D: labelled rounded rect + dark text", () => {
    const context2d = createFakeCanvas2DContext();
    const canvas = {
      width: 200,
      height: 100,
      getContext: (kind: string) => (kind === "2d" ? context2d : null),
    };

    const view = createGraphRenderer(canvas as unknown as HTMLCanvasElement, {
      backend: "canvas2d",
      pixelRatio: 1,
    });
    view.setGraph({
      nodeIds: ["labelled", "empty"],
      positions: new Float32Array([0, 0, 100, 0]),
      edges: new Uint32Array([]),
    });
    view.setStyle({
      nodeSizes: new Float32Array([6, 6]),
      // shape code 5 = box for both; only the first carries a label.
      nodeShapes: new Uint8Array([5, 5]),
      nodeLabels: ["Central Work", ""],
      nodeColors: new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255]),
      edgeWidths: new Float32Array([]),
      edgeColors: new Uint8Array([]),
      edgeDash: new Uint8Array([]),
      edgeCurvatures: new Float32Array([]),
    });
    view.setCamera({ x: 0, y: 0, zoom: 1 });
    view.render();

    expect(view.snapshot().backend).toBe("canvas2d");
    // No circle glyphs: both nodes are boxes (rounded rects via quadraticCurveTo).
    expect(context2d.calls.arc).toHaveLength(0);
    // Only the labelled box draws text; the empty box draws none.
    expect(context2d.calls.fillText).toEqual([{ text: "Central Work", x: 100, y: 50 }]);
    // Both boxes fill (translucent) and stroke (node-coloured border).
    expect(context2d.calls.fill).toBe(2);
    expect(context2d.calls.stroke).toBe(2);
    // Rounded rect = 4 quadratic corners per box.
    expect(context2d.calls.quadraticCurveTo).toBe(8);
  });

  it("box glyphs ignore the selection size multiplier (size derives from the label)", () => {
    const render = (nodeSize: number) => {
      const context2d = createFakeCanvas2DContext();
      const widths: number[] = [];
      const lineToCounts: number[] = [];
      const canvas = {
        width: 200,
        height: 100,
        getContext: (kind: string) => (kind === "2d" ? context2d : null),
      };
      const view = createGraphRenderer(canvas as unknown as HTMLCanvasElement, {
        backend: "canvas2d",
        pixelRatio: 1,
      });
      view.setGraph({
        nodeIds: ["a"],
        positions: new Float32Array([0, 0]),
        edges: new Uint32Array([]),
      });
      view.setStyle({
        // A bigger nodeSize would enlarge a normal glyph; a box must ignore it.
        nodeSizes: new Float32Array([nodeSize]),
        nodeShapes: new Uint8Array([5]),
        nodeLabels: ["Work"],
        nodeColors: new Uint8Array([10, 20, 30, 255]),
        edgeWidths: new Float32Array([]),
        edgeColors: new Uint8Array([]),
        edgeDash: new Uint8Array([]),
        edgeCurvatures: new Float32Array([]),
      });
      view.setCamera({ x: 0, y: 0, zoom: 1 });
      view.render();
      widths.push(context2d.calls.fillText.length);
      lineToCounts.push(context2d.calls.lineTo);
      return { fillTextCount: widths[0]!, lineTo: lineToCounts[0]! };
    };
    // Same label -> identical geometry regardless of the (selection-inflated) size.
    expect(render(6)).toEqual(render(60));
  });
});
