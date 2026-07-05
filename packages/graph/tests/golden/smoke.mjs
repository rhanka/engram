// SUPPLEMENTAL fast smoke path (B1 plan §5.1, fix #4) -- explicitly NOT the
// parity oracle.
//
// @napi-rs/canvas (Canvas2D) gives us a real getImageData-capable canvas in
// pure Node (no browser, no GPU), so the same @sentropic/graph Canvas2D
// backend can be rendered and pixel-diffed in milliseconds for fast local
// iteration. It is a SMOKE pre-filter only: its anti-aliasing and font
// rasterization DIFFER from Chrome, so it can flag gross breakage but is NEVER
// the parity gate. The Chrome/CDP direct-pixel oracle (cdp-harness.mjs) is the
// authority.
//
// headless-gl (the WebGL smoke counterpart) is INTENTIONALLY not wired here:
// in this environment it fails to build (node-gyp needs the X11/Xi -dev
// pkg-config files, absent here). For Phase 0 no WebGL backend exists yet, so
// the napi Canvas2D smoke path fully covers the Phase-0 smoke proof. The GL
// phases can add a headless-gl smoke branch where the native toolchain exists.

import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GRAPH_PKG = path.resolve(__dirname, "../..");
const require = createRequire(pathToFileURL(path.join(GRAPH_PKG, "package.json")));

let napiCanvas = null;
export function napiAvailable() {
  if (napiCanvas !== null) return napiCanvas !== false;
  try {
    napiCanvas = require("@napi-rs/canvas");
    return true;
  } catch {
    napiCanvas = false;
    return false;
  }
}

// Mirror of shape-geometry.ts shapeCode + harness-page buildBuffers, kept in
// sync with harness-page.html. (Shared in spirit; duplicated here because the
// browser page can't import a Node module and vice-versa.)
const SHAPE_CODES = {
  dot: 0, circle: 0, diamond: 1, star: 2, hexagon: 3,
  square: 4, box: 5, roundedbox: 5, triangle: 6,
};
const DASH_CODES = { solid: 0, dashed: 1, dotted: 2, "long-dash": 3 };

function shapeCodeOf(value) {
  if (typeof value === "number") return value;
  return SHAPE_CODES[String(value ?? "dot").trim().toLowerCase()] ?? 0;
}
function toRgba(color, fallback) {
  if (Array.isArray(color)) {
    const [r, g, b, a = 255] = color;
    return [r | 0, g | 0, b | 0, a | 0];
  }
  if (typeof color === "string" && color.startsWith("#")) {
    const h = color.slice(1);
    const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) : 255;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), a];
  }
  return fallback ?? [77, 118, 255, 255];
}

function buildBuffers(fixture) {
  const nodes = fixture.nodes ?? [];
  const edges = fixture.edges ?? [];
  const nodeIds = nodes.map((n) => n.id);
  const idToIndex = new Map(nodeIds.map((id, i) => [id, i]));

  const positions = new Float32Array(nodes.length * 2);
  const nodeSizes = new Float32Array(nodes.length);
  const nodeColors = new Uint8Array(nodes.length * 4);
  const nodeShapes = new Uint8Array(nodes.length);
  const nodeFills = new Uint8Array(nodes.length);
  const nodeBorders = new Uint8Array(nodes.length);
  const nodeLabels = [];

  nodes.forEach((node, i) => {
    positions[i * 2] = node.x ?? 0;
    positions[i * 2 + 1] = node.y ?? 0;
    nodeSizes[i] = node.size ?? 6;
    const [r, g, b, a] = toRgba(node.color, [77, 118, 255, 255]);
    nodeColors[i * 4] = r; nodeColors[i * 4 + 1] = g;
    nodeColors[i * 4 + 2] = b; nodeColors[i * 4 + 3] = a;
    nodeShapes[i] = shapeCodeOf(node.shape);
    nodeFills[i] = node.fill === "hollow" ? 1 : 0;
    nodeBorders[i] = node.border === "bold" ? 1 : 0;
    nodeLabels[i] = node.label ?? "";
  });

  const edgeArr = new Uint32Array(edges.length * 2);
  const edgeWidths = new Float32Array(edges.length);
  const edgeColors = new Uint8Array(edges.length * 4);
  const edgeDash = new Uint8Array(edges.length);
  const edgeCurvatures = new Float32Array(edges.length);
  const edgeRouteStyles = new Uint8Array(edges.length);
  let hasRouteStyles = false;
  // Per-edge ROUTE style (git-flow lot) — mirrors harness-page buildBuffers.
  const ROUTE_CODES = {
    default: 0, "flow-port": 1, "flow-port-reverse": 2,
    "flow-port-no-arrow": 3, "flow-port-reverse-no-arrow": 4,
  };
  edges.forEach((edge, i) => {
    edgeArr[i * 2] = idToIndex.get(edge.source) ?? 0;
    edgeArr[i * 2 + 1] = idToIndex.get(edge.target) ?? 0;
    edgeWidths[i] = edge.width ?? 1;
    const [r, g, b, a] = toRgba(edge.color, [121, 133, 153, 180]);
    edgeColors[i * 4] = r; edgeColors[i * 4 + 1] = g;
    edgeColors[i * 4 + 2] = b; edgeColors[i * 4 + 3] = a;
    edgeDash[i] = DASH_CODES[edge.dash ?? "solid"] ?? 0;
    edgeCurvatures[i] = edge.curvature ?? 0;
    edgeRouteStyles[i] = ROUTE_CODES[edge.edge_style ?? "default"] ?? 0;
    if (edgeRouteStyles[i] !== 0) hasRouteStyles = true;
  });

  return {
    graph: { nodeIds, positions, edges: edgeArr },
    style: {
      nodeSizes, nodeColors, nodeShapes, nodeFills, nodeBorders, nodeLabels,
      edgeWidths, edgeColors, edgeDash, edgeCurvatures,
      ...(hasRouteStyles ? { edgeRouteStyles } : {}),
    },
  };
}

/**
 * Render a fixture with the Canvas2D backend onto a napi canvas and read its
 * pixels directly. Returns { width, height, data: Uint8ClampedArray (RGBA) }.
 *
 * NOTE: this loads the @sentropic/graph dist bundle. Build it first
 * (npm run build in packages/graph) -- the test harness ensures this.
 */
export async function smokeCapture(fixture, opts = {}) {
  if (!napiAvailable()) throw new Error("@napi-rs/canvas not installed");
  const { createCanvas } = napiCanvas;
  const dpr = opts.dpr ?? 1;
  const cssWidth = opts.cssWidth ?? 200;
  const cssHeight = opts.cssHeight ?? 200;
  const camera = opts.camera ?? { x: 0, y: 0, zoom: opts.zoom ?? 1 };

  const Graph = await import(pathToFileURL(path.join(GRAPH_PKG, "dist/index.js")).href);
  const canvas = createCanvas(Math.round(cssWidth * dpr), Math.round(cssHeight * dpr));
  const { graph, style } = buildBuffers(fixture);

  const renderer = Graph.createGraphRenderer(canvas, {
    backend: "canvas2d",
    pixelRatio: dpr,
    // Git-flow label-scale knob; absent = legacy metric (goldens identical).
    ...(opts.boxBaseHeightPx !== undefined ? { boxBaseHeightPx: opts.boxBaseHeightPx } : {}),
  });
  renderer.setGraph(graph);
  renderer.setStyle(style);
  renderer.setCamera(camera);
  renderer.render();

  const ctx = canvas.getContext("2d");
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return {
    width: canvas.width,
    height: canvas.height,
    data: new Uint8ClampedArray(img.data),
    backend: renderer.snapshot().backend,
  };
}
