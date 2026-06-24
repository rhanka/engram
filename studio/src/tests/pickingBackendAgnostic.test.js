import { describe, expect, it } from "vitest";

import { createGraphRenderer } from "@sentropic/graph";
import {
  buildGraphRendererPayload,
  findNearestNode,
  findNearestNodeId,
} from "../lib/graphRendererPayload.js";

// =============================================================================
// B1-P4 — node PICKING is CPU / studio-owned and BACKEND-AGNOSTIC.
//
// This test VERIFIES (rather than implements) the P4 picking story. Background:
//
//   * GraphCanvas.svelte does ALL hit-testing on the CPU: `pickNode(event)`
//     converts the pointer to WORLD coords via the camera (`eventToWorld`) and
//     calls `findNearestNodeId(payload, worldX, worldY, …)`, which iterates the
//     SHARED render-geometry on the payload — `renderGraph.positions` (node
//     centres) and `style.nodeSizes` (drawn radii). It never reads rendered
//     pixels and never asks the renderer "what node is here?".
//
//   * The @sentropic/graph renderer (renderer.ts / the GraphRenderer interface)
//     exposes NO picking surface at all: setGraph / setStyle / setPositions /
//     updatePositions / fitView / setCamera / render / snapshot / destroy. The
//     WebGL2 canary (P1 shapes, P2 edges, P3 box/text) only changes which pixels
//     are drawn — it consumes the exact same positions + nodeSizes the CPU
//     hit-test reads.
//
// Therefore swapping the draw backend canvas2d → webgl CANNOT move the node
// under the cursor: picking is a pure function of (camera, payload geometry),
// both backend-independent. GPU color-picking (render ids to an offscreen
// attachment + readPixels) is UNNECESSARY for this renderer. The tests below
// lock that invariant in so a future backend change can't silently regress it.
// =============================================================================

// A fake WebGL2 context so `createGraphRenderer(canvas, { backend: "webgl" })`
// genuinely takes the GL path under jsdom (which has no real WebGL2). It is a
// no-op recorder — enough for the renderer to construct + render without
// throwing. `drawArraysInstanced` presence makes isWebGL2() return true.
function createFakeWebGl2Context() {
  let nextId = 1;
  const handle = () => ({ id: nextId++ });
  return {
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
    createShader: handle,
    shaderSource: () => undefined,
    compileShader: () => undefined,
    getShaderParameter: () => true,
    getShaderInfoLog: () => "",
    createProgram: handle,
    attachShader: () => undefined,
    linkProgram: () => undefined,
    getProgramParameter: () => true,
    getProgramInfoLog: () => "",
    deleteShader: () => undefined,
    createBuffer: handle,
    bindBuffer: () => undefined,
    bufferData: () => undefined,
    useProgram: () => undefined,
    getAttribLocation: (_p, name) => (name === "a_position" ? 0 : name === "a_color" ? 1 : 2),
    getUniformLocation: (_p, name) => ({ name }),
    uniform1f: () => undefined,
    uniform2f: () => undefined,
    enableVertexAttribArray: () => undefined,
    vertexAttribPointer: () => undefined,
    viewport: () => undefined,
    clearColor: () => undefined,
    clear: () => undefined,
    enable: () => undefined,
    blendFunc: () => undefined,
    drawArrays: () => undefined,
    // Marks this as WebGL2 (isWebGL2() checks for this method).
    drawArraysInstanced: () => undefined,
  };
}

function createFakeCanvas2DContext() {
  return new Proxy(
    {
      font: "",
      fillStyle: "",
      strokeStyle: "",
      lineCap: "",
      lineJoin: "",
      lineWidth: 0,
      textAlign: "",
      textBaseline: "",
      globalAlpha: 1,
      measureText: (text) => ({ width: String(text).length * 7 }),
    },
    {
      get(target, prop) {
        if (prop in target) return target[prop];
        // Every other 2D-context call is a recorded no-op.
        return () => undefined;
      },
      set(target, prop, value) {
        target[prop] = value;
        return true;
      },
    },
  );
}

function makeCanvas(kind) {
  const gl = kind === "webgl" ? createFakeWebGl2Context() : null;
  const ctx2d = createFakeCanvas2DContext();
  return {
    width: 800,
    height: 600,
    getContext: (type) => {
      if (type === "2d") return ctx2d;
      if (type === "webgl2" || type === "webgl") return gl;
      return null;
    },
  };
}

// The scene the studio actually hit-tests: assorted shapes + sizes spread out so
// each node owns a distinct pick zone, plus two near-coincident nodes so the
// "nearest wins" tie-break is exercised identically across backends.
function makeScene() {
  return {
    nodes: [
      { id: "alpha", label: "Alpha", x: -200, y: -150, weight: 4, group: "Case", shape: "diamond" },
      { id: "beta", label: "Beta", x: 180, y: -120, weight: 1, group: "Evidence", shape: "triangle" },
      { id: "gamma", label: "Gamma", x: 60, y: 140, weight: 2, group: "Place", shape: "hexagon" },
      { id: "work", label: "Central Work", x: -40, y: 40, weight: 6, group: "Work", shape: "roundedbox" },
      // Two close neighbours: the nearest-centre rule must resolve them the same
      // way no matter which backend drew them.
      { id: "twinA", label: "Twin A", x: 300, y: 200, weight: 1, group: "People", shape: "dot" },
      { id: "twinB", label: "Twin B", x: 312, y: 205, weight: 1, group: "People", shape: "dot" },
    ],
    edges: [
      { source: "alpha", target: "work", relation: "appears_in" },
      { source: "beta", target: "gamma", relation: "near" },
      { source: "twinA", target: "twinB", relation: "reconcile" },
    ],
    stats: { nodeCount: 6, edgeCount: 3, communityCount: 5 },
  };
}

// Inverse of GraphCanvas.worldToScreen — exactly mirrors GraphCanvas.eventToWorld
// so the test resolves a world point from a CSS-pixel cursor the way the live
// canvas does (camera-centred, devicePixelRatio backing store).
function cursorToWorld(canvas, camera, cssX, cssY) {
  // Test canvases render at devicePixelRatio 1 with the CSS rect == backing
  // store, so scaleX = scaleY = 1 (GraphCanvas computes these from the live rect).
  const scaleX = 1;
  const scaleY = 1;
  const rectWidth = canvas.width;
  const rectHeight = canvas.height;
  const screenX = (cssX - rectWidth / 2) * scaleX;
  const screenY = (cssY - rectHeight / 2) * scaleY;
  return {
    x: camera.x + screenX / camera.zoom,
    y: camera.y + screenY / camera.zoom,
    scale: Math.max(scaleX, scaleY),
  };
}

// GraphCanvas.worldToScreen — to place a cursor exactly over a node's centre.
function worldToCursor(canvas, camera, worldX, worldY) {
  const rectWidth = canvas.width;
  const rectHeight = canvas.height;
  return {
    x: (worldX - camera.x) * camera.zoom + rectWidth / 2,
    y: (worldY - camera.y) * camera.zoom + rectHeight / 2,
  };
}

// PICK_RADIUS / world.scale as GraphCanvas.pickNode computes it (scale = 1 here).
const PICK_RADIUS = 16;

function pickAt(payload, canvas, camera, cssX, cssY) {
  const world = cursorToWorld(canvas, camera, cssX, cssY);
  const maxDistance = PICK_RADIUS * world.scale;
  return findNearestNodeId(payload, world.x, world.y, maxDistance);
}

describe("B1-P4 picking is backend-agnostic (no GPU pick needed)", () => {
  it("the renderer exposes NO picking / hit-test / readPixels API on EITHER backend", () => {
    const payload = buildGraphRendererPayload(makeScene(), { nodeRadius: 3 });
    for (const backend of ["canvas2d", "webgl"]) {
      const renderer = createGraphRenderer(makeCanvas(backend), { backend, pixelRatio: 1 });
      renderer.setGraph(payload.renderGraph);
      renderer.setStyle(payload.style);
      renderer.setCamera({ x: 0, y: 0, zoom: 1 });
      expect(() => renderer.render()).not.toThrow();

      // The studio NEVER asks the renderer "what node is under the cursor?".
      // Assert the renderer has no such surface, so picking CANNOT be backend-
      // dependent: there is simply no per-backend hook to diverge.
      for (const method of ["pick", "hitTest", "nodeAt", "pickNode", "readPixels"]) {
        expect(renderer[method], `renderer.${method}`).toBeUndefined();
      }
      // The snapshot reports which backend drew, confirming we exercised both.
      expect(renderer.snapshot().backend).toBe(backend);
      renderer.destroy();
    }
  });

  it("the CPU hit-test returns the SAME node under canvas2d and webgl for every cursor", () => {
    const scene = makeScene();
    const camera = { x: 0, y: 0, zoom: 1.4 };

    // ONE shared payload drives BOTH backends. The renderers below merely DRAW
    // it; the hit-test reads positions + nodeSizes off this same payload — that
    // is the whole point: there is one source of pick geometry, backend-free.
    const payload = buildGraphRendererPayload(scene, { nodeRadius: 3 });

    const canvas2d = makeCanvas("canvas2d");
    const webgl = makeCanvas("webgl");
    const r2d = createGraphRenderer(canvas2d, { backend: "canvas2d", pixelRatio: 1 });
    const rgl = createGraphRenderer(webgl, { backend: "webgl", pixelRatio: 1 });
    for (const r of [r2d, rgl]) {
      r.setGraph(payload.renderGraph);
      r.setStyle(payload.style);
      r.setCamera(camera);
      r.render();
    }
    // Sanity: the two renderers really took different draw backends.
    expect(r2d.snapshot().backend).toBe("canvas2d");
    expect(rgl.snapshot().backend).toBe("webgl");

    // A battery of cursors: dead-centre over each node, a few off-node points
    // (background → null), and the close-twins midpoint (nearest-centre wins).
    const cursors = [];
    for (const node of scene.nodes) {
      cursors.push(worldToCursor(canvas2d, camera, node.x, node.y));
    }
    cursors.push(worldToCursor(canvas2d, camera, 0, 0)); // empty centre region
    cursors.push(worldToCursor(canvas2d, camera, 500, -300)); // far corner → null
    cursors.push(worldToCursor(canvas2d, camera, 306, 202)); // between twinA/twinB

    // The hit-test is a pure function of (payload, camera) — identical canvases →
    // identical results. The renderers exist only to prove the SAME payload was
    // drawn by each backend, with picking unchanged.
    for (const cursor of cursors) {
      const hit2d = pickAt(payload, canvas2d, camera, cursor.x, cursor.y);
      const hitGl = pickAt(payload, webgl, camera, cursor.x, cursor.y);
      expect(hitGl).toBe(hit2d);
    }

    r2d.destroy();
    rgl.destroy();
  });

  it("a cursor dead-centre on each node picks THAT node, independent of backend", () => {
    const scene = makeScene();
    const camera = { x: 20, y: -10, zoom: 1 };
    const payload = buildGraphRendererPayload(scene, { nodeRadius: 3 });
    const canvas = makeCanvas("webgl"); // drawn by the WebGL canary…

    const renderer = createGraphRenderer(canvas, { backend: "webgl", pixelRatio: 1 });
    renderer.setGraph(payload.renderGraph);
    renderer.setStyle(payload.style);
    renderer.setCamera(camera);
    renderer.render();
    expect(renderer.snapshot().backend).toBe("webgl");

    // …yet every node is hit by the CPU test at its own centre. (twinA/twinB sit
    // within each other's pick zone; centring exactly on a twin still resolves to
    // the nearer centre, which is itself.)
    for (const node of scene.nodes) {
      const cursor = worldToCursor(canvas, camera, node.x, node.y);
      const hit = pickAt(payload, canvas, camera, cursor.x, cursor.y);
      expect(hit, `cursor over ${node.id}`).toBe(node.id);
    }
    renderer.destroy();
  });

  it("findNearestNode geometry comes from the shared payload, not any backend", () => {
    // The hit-test reads renderGraph.positions + style.nodeSizes — the SAME
    // buffers handed to setGraph/setStyle on every backend. Prove it returns the
    // expected nearest node + distance with NO renderer in play at all.
    const payload = buildGraphRendererPayload(makeScene(), { nodeRadius: 3 });
    const hit = findNearestNode(payload, 180, -120, 16); // dead-centre on "beta"
    expect(hit.id).toBe("beta");
    expect(hit.distance).toBeCloseTo(0, 6);
    expect(hit.radius).toBeGreaterThan(0);
    // Far from any node → no hit.
    expect(findNearestNode(payload, 900, 900, 16)).toBeNull();
  });
});
