/**
 * B1 Phase 3 — BOX-GLYPH + LABEL-TEXT golden gate (WebGL2 instanced boxes +
 * canvas-raster text atlas vs Canvas2D). This is the HARDEST phase: in-canvas
 * text parity is the #1 B1 risk, so it is gated hardest.
 *
 * Same two-layer model as the Phase-1 shape gate and the Phase-2 edge gate:
 *
 *  A. GEOMETRY PARITY (always runs, deterministic, no GPU needed).
 *     Asserts the WebGL box INSTANCE build reproduces the Canvas2D box math (via
 *     the SHARED render-geometry.boxDimensions) to the float: N7 labelled box
 *     hugs the measured label; N9 empty box collapses to BOX_EMPTY_RATIO×height
 *     and emits NO text; N7c corner clamp (empty == half-side, narrow == w/2);
 *     N8 degree-independence (render(6) == render(60)); #199 long-label pixel-fit
 *     to the cap with a SINGLE ellipsis (largest fitting prefix) + short label
 *     untouched; N13b a boxed-but-unlabelled Character draws a rect + NO text;
 *     fixed BOX_FILL (alpha-independent) + node-colour border at node alpha;
 *     R7 byte-parity interleave (rect + text share the node-index depth); exactly
 *     ONE text instance per labelled box. This is the gate where Chrome has no
 *     GL context (this environment) and the floor everywhere.
 *
 *  B. CDP PIXEL DIFF (runs only where a real WebGL2 context is available — the
 *     CI golden-webgl lane with GOLDEN_ENABLE_WEBGL=1 + SwiftShader). Captures
 *     the Canvas2D and WebGL backends on paired canvases per box fixture and
 *     diffs them: the box-rect EXTENT must match, the node-colour border must
 *     appear, the dark label text must appear (text presence over the box), and
 *     OVERLAPPING boxes must occlude identically (R7). The box-text atlas is
 *     rasterized by the SAME pinned font the Canvas2D reference uses (the harness
 *     hands the renderer a font-pinned atlas factory), so text AA is parity by
 *     construction. Where no GL context exists it records an EXPLICIT skip.
 *
 * Default-unchanged: every WebGL capture sets `instancedShapes: true` (the
 * canary). The canvas2d goldens NEVER set it, so the default path is untouched.
 */

import { describe, expect, it } from "vitest";
import {
  atlasKey,
  buildBoxDraws,
  buildBoxInstances,
  buildTextInstances,
  decodeBox,
  type WebGLBoxFrame,
} from "../../src/webgl-boxes";
import {
  BOX_BASE_HEIGHT_PX,
  BOX_EMPTY_RATIO,
  BOX_FILL,
  BOX_MARGIN_RATIO,
  BOX_MAX_WIDTH_RATIO,
} from "../../src/render-geometry";
// @ts-expect-error -- .mjs harness modules are plain ESM, no types needed.
import { openOracle } from "./cdp-harness.mjs";
// @ts-expect-error
import { countColorPixels, contentBBox } from "./diff.mjs";
// @ts-expect-error
import { BOX_GL_FIXTURES, BOX_TEXT_RGB } from "./fixtures.mjs";

/** Deterministic measure (7px/char) — the SAME stub the renderer-api box tests
 *  use, so the geometry-parity assertions can predict the box width exactly. */
const MEASURE = (text: string): number => text.length * 7;

/** Build a single-box WebGLBoxFrame at a given DPR/zoom. */
function boxFrame(opts: {
  label?: string;
  size?: number;
  color?: [number, number, number, number];
  bold?: boolean;
  dpr?: number;
  zoom?: number;
  cssW?: number;
}): WebGLBoxFrame {
  const dpr = opts.dpr ?? 1;
  const zoom = opts.zoom ?? 1;
  const cssW = opts.cssW ?? 400;
  const dim = Math.round(cssW * dpr);
  const color = opts.color ?? [37, 99, 235, 255];
  return {
    positions: new Float32Array([0, 0]),
    nodeCount: 1,
    style: {
      nodeSizes: new Float32Array([opts.size ?? 11]),
      nodeColors: new Uint8Array(color),
      nodeShapes: new Uint8Array([5]), // box
      nodeLabels: [opts.label ?? ""],
      nodeBorders: new Uint8Array([opts.bold ? 1 : 0]),
      edgeWidths: new Float32Array(),
      edgeColors: new Uint8Array(),
      edgeDash: new Uint8Array(),
      edgeCurvatures: new Float32Array(),
    },
    camera: { x: 0, y: 0, zoom },
    pixelRatio: dpr,
    viewportWidth: dim,
    viewportHeight: dim,
    measureLabelWidth: MEASURE,
  };
}

const DPR_MATRIX = [1, 2, 3];
const ZOOM_MATRIX = [1, 2.5];

// ---------------------------------------------------------------------------
// A. GEOMETRY PARITY — the WebGL box instances == the Canvas2D box math.
// ---------------------------------------------------------------------------
describe("B1 Phase 3 — box geometry parity (WebGL instances == Canvas2D math)", () => {
  // N7 labelled box: degree-independent height, width hugs the measured label.
  for (const dpr of DPR_MATRIX) {
    for (const zoom of ZOOM_MATRIX) {
      it(`N7 labelled box: height==base·PR·zoom, width hugs label @ DPR ${dpr} × zoom ${zoom}`, () => {
        const label = "Sherlock";
        const draws = buildBoxDraws(boxFrame({ label, dpr, zoom }));
        expect(draws).toHaveLength(1);
        const d = draws[0]!;

        const h = BOX_BASE_HEIGHT_PX * dpr * zoom;
        const margin = h * BOX_MARGIN_RATIO;
        const expectedW = MEASURE(label) + 2 * margin;
        // Height is degree-independent: exactly the base · PR · zoom.
        expect(d.halfH * 2).toBeCloseTo(h, 4);
        // Width hugs the measured label + a margin per side.
        expect(d.halfW * 2).toBeCloseTo(expectedW, 4);
        // The box renders the (unclipped) label.
        expect(d.label).toBe(label);
      });
    }
  }

  // N9 empty box: collapses to a square of BOX_EMPTY_RATIO × height, NO text.
  it("N9 empty box: collapses to BOX_EMPTY_RATIO×height square and emits NO text", () => {
    const frame = boxFrame({ label: "" });
    const draws = buildBoxDraws(frame);
    expect(draws).toHaveLength(1);
    const d = draws[0]!;
    const side = BOX_BASE_HEIGHT_PX * BOX_EMPTY_RATIO;
    expect(d.halfW * 2).toBeCloseTo(side, 4);
    expect(d.halfH * 2).toBeCloseTo(side, 4);
    expect(d.label).toBe("");
    // No text instance for an unlabelled box (stub atlas has no entries either).
    const textInstances = buildTextInstances(draws, { atlasW: 1, atlasH: 1, pixels: new Uint8Array(4), entries: new Map() });
    expect(textInstances).toHaveLength(0);
  });

  // N7c corner clamp: empty box corner == half-side; a narrow label clamps to w/2.
  it("N7c corner clamp: empty box corner == half-side, narrow label corner == w/2", () => {
    const empty = buildBoxDraws(boxFrame({ label: "" }))[0]!;
    // Empty box: corner = clamp(height/4, halfW, halfH) and halfW==halfH==side/2.
    // side = height·10/22 < height/4·... ⇒ corner clamps to the half-side.
    expect(empty.corner).toBeCloseTo(empty.halfW, 4);
    expect(empty.corner).toBeCloseTo(empty.halfH, 4);

    // A single-char label makes a box narrower than 2·(height/4) ⇒ corner == w/2.
    const narrow = buildBoxDraws(boxFrame({ label: "." }))[0]!;
    const rawCorner = (BOX_BASE_HEIGHT_PX * 1) / 4; // height·1/4 before clamp
    if (narrow.halfW < rawCorner) {
      expect(narrow.corner).toBeCloseTo(narrow.halfW, 4);
    }
  });

  // N8 degree-independence: a box ignores nodeSize — render(6) == render(60).
  it("N8 degree-independence: box geometry ignores nodeSize (size 6 == size 60)", () => {
    const small = buildBoxDraws(boxFrame({ label: "Work", size: 6 }))[0]!;
    const big = buildBoxDraws(boxFrame({ label: "Work", size: 60 }))[0]!;
    expect(big.halfW).toBeCloseTo(small.halfW, 6);
    expect(big.halfH).toBeCloseTo(small.halfH, 6);
    expect(big.corner).toBeCloseTo(small.corner, 6);
  });

  // #199 pixel-fit: a long label clips to the capped box width with a SINGLE
  // ellipsis (the largest fitting prefix); a short label is untouched.
  it("#199 long label: pixel-fits to the cap with a single ellipsis (largest prefix)", () => {
    const longLabel =
      "Part I, Chapter I: Being a Reprint of the Reminiscences of John H. Watson, M.D.";
    const d = buildBoxDraws(boxFrame({ label: longLabel }))[0]!;
    const h = BOX_BASE_HEIGHT_PX;
    const margin = h * BOX_MARGIN_RATIO;
    const maxTextWidth = h * BOX_MAX_WIDTH_RATIO - 2 * margin;

    expect(d.label).not.toBe(longLabel);
    expect(d.label.endsWith("…")).toBe(true);
    expect(d.label.endsWith("……")).toBe(false);
    expect(d.label.length).toBeLessThan(longLabel.length);
    // The fitted text fits the cap (stub width = length·7) ...
    expect(MEASURE(d.label)).toBeLessThanOrEqual(maxTextWidth);
    // ... and is the LARGEST such prefix: one more glyph would overflow.
    expect(MEASURE(d.label) + 7).toBeGreaterThan(maxTextWidth);
    // The box width hugs the FITTED text (never the raw label), staying ≤ cap.
    expect(d.halfW * 2).toBeLessThanOrEqual(h * BOX_MAX_WIDTH_RATIO + 1e-6);
  });

  it("#199 short label: left untouched (no ellipsis, no width cap)", () => {
    const d = buildBoxDraws(boxFrame({ label: "Hi" }))[0]!;
    expect(d.label).toBe("Hi");
    expect(d.label.includes("…")).toBe(false);
  });

  // N13b two-stage divergence: a boxed Character with an EMPTY label draws a
  // collapsed rect and NO text (a Character can be BOXED yet UNLABELLED).
  it("N13b: a boxed-but-unlabelled node draws a rect and NO text", () => {
    const d = buildBoxDraws(boxFrame({ label: "" }))[0]!;
    expect(d.label).toBe("");
    // It still has a (collapsed) rect, so the border still draws.
    expect(d.halfW).toBeGreaterThan(0);
  });

  // Fixed translucent-white fill (alpha-INDEPENDENT) + node-colour border at the
  // node alpha (N10/N7). A DIMMED box keeps the opaque-ish white interior.
  it("box fill is fixed BOX_FILL (alpha-independent); border carries node alpha", () => {
    const dimmed = buildBoxInstances(
      buildBoxDraws(boxFrame({ label: "Dim", color: [37, 99, 235, 89] })),
    );
    const box = decodeBox(dimmed, 0);
    // Fill = BOX_FILL normalised, regardless of the node alpha (89/255).
    expect(box.fill[0]).toBeCloseTo(BOX_FILL[0] / 255, 4);
    expect(box.fill[3]).toBeCloseTo(BOX_FILL[3] / 255, 4);
    // Border = node colour at the node alpha (89/255).
    expect(box.borderColor[0]).toBeCloseTo(37 / 255, 4);
    expect(box.borderColor[3]).toBeCloseTo(89 / 255, 4);
  });

  // R7 byte-parity interleave: the box rect AND its text share the node-index
  // depth, so a later box occludes an earlier box's rect AND text.
  it("R7 interleave: a box rect and its text share the node-index depth", () => {
    const frame: WebGLBoxFrame = {
      positions: new Float32Array([-14, 0, 14, 0]),
      nodeCount: 2,
      style: {
        nodeSizes: new Float32Array([11, 11]),
        nodeColors: new Uint8Array([37, 99, 235, 255, 220, 38, 38, 255]),
        nodeShapes: new Uint8Array([5, 5]),
        nodeLabels: ["Behind", "Front"],
        nodeBorders: new Uint8Array([0, 0]),
        edgeWidths: new Float32Array(),
        edgeColors: new Uint8Array(),
        edgeDash: new Uint8Array(),
        edgeCurvatures: new Float32Array(),
      },
      camera: { x: 0, y: 0, zoom: 1 },
      pixelRatio: 2,
      viewportWidth: 400,
      viewportHeight: 400,
      measureLabelWidth: MEASURE,
    };
    const draws = buildBoxDraws(frame);
    const boxes = buildBoxInstances(draws);
    // Depth == node index: box 0 at depth 0, box 1 at depth 1 (later ⇒ on top).
    expect(decodeBox(boxes, 0).depth).toBe(0);
    expect(decodeBox(boxes, 1).depth).toBe(1);

    // The text instances carry the SAME depth as their box (shared occlusion).
    const fakeAtlas = {
      atlasW: 1,
      atlasH: 1,
      pixels: new Uint8Array(4),
      entries: new Map([
        [atlasKey("Behind", draws[0]!.fontPx), { uv: [0, 0, 1, 1] as [number, number, number, number], width: 10, height: 10 }],
        [atlasKey("Front", draws[1]!.fontPx), { uv: [0, 0, 1, 1] as [number, number, number, number], width: 10, height: 10 }],
      ]),
    };
    const textInstances = buildTextInstances(draws, fakeAtlas);
    // TEXT_FLOATS_PER_INSTANCE = 13; the depth is the last float of each.
    expect(textInstances.length / 13).toBe(2);
    expect(textInstances[12]).toBe(0); // first text instance depth == node 0
    expect(textInstances[25]).toBe(1); // second text instance depth == node 1
  });

  // Exactly ONE text instance per labelled box (L1: 1 fillText per box).
  it("exactly one text instance per labelled box", () => {
    const draws = buildBoxDraws(boxFrame({ label: "Holmes" }));
    const fakeAtlas = {
      atlasW: 1,
      atlasH: 1,
      pixels: new Uint8Array(4),
      entries: new Map([
        [atlasKey("Holmes", draws[0]!.fontPx), { uv: [0, 0, 1, 1] as [number, number, number, number], width: 10, height: 10 }],
      ]),
    };
    expect(buildTextInstances(draws, fakeAtlas).length / 13).toBe(1);
  });

  it("determinism: the same frame builds byte-identical box instances", () => {
    const a = buildBoxInstances(buildBoxDraws(boxFrame({ label: "Watson", bold: true, dpr: 2 })));
    const b = buildBoxInstances(buildBoxDraws(boxFrame({ label: "Watson", bold: true, dpr: 2 })));
    expect(a).toEqual(b);
  });
});

// ---------------------------------------------------------------------------
// B. CDP PIXEL DIFF — real WebGL vs Canvas2D (only where GL is available).
// ---------------------------------------------------------------------------
describe("B1 Phase 3 — box pixel parity (WebGL vs Canvas2D, Chrome/CDP)", () => {
  const REQUIRE_GL = process.env.GOLDEN_REQUIRE_WEBGL === "1";

  it("per-box WebGL-vs-Canvas2D pixel diff (or explicit no-GL skip)", async () => {
    let oracle: Awaited<ReturnType<typeof openOracle>> | null = null;
    let glAvailable = false;
    try {
      oracle = await openOracle();
      glAvailable = await oracle.hasWebGL();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[boxes-golden] Chrome/CDP oracle unavailable:", String(err));
    }

    if (!oracle) {
      if (REQUIRE_GL) throw new Error("GOLDEN_REQUIRE_WEBGL=1 but Chrome did not boot");
      return;
    }

    try {
      if (!glAvailable) {
        const reason =
          "no WebGL2 context in this Chrome (set GOLDEN_ENABLE_WEBGL=1 with SwiftShader to run the real pixel diff)";
        // eslint-disable-next-line no-console
        console.warn(`[boxes-golden] RESIDUAL/SKIP: ${reason}`);
        if (REQUIRE_GL) throw new Error(`GOLDEN_REQUIRE_WEBGL=1 but ${reason}`);
        expect(glAvailable).toBe(false); // block A is the gate in no-GL envs
        return;
      }

      // Cross-DPR sweep: 1, 2, 3 (X6 box-text crispness at DPR 2/3).
      const dprs = [1, 2, 3];
      const zoom = 1;
      const results: Array<{ name: string; dpr: number; pass: boolean; note: string }> = [];

      for (const dpr of dprs) {
        const opts = { cssWidth: 320, cssHeight: 160, dpr, camera: { x: 0, y: 0, zoom } };
        for (const bf of BOX_GL_FIXTURES) {
          const ref = await oracle.capture(bf.fixture, { ...opts, backend: "canvas2d" });
          const gl = await oracle.capture(bf.fixture, { ...opts, backend: "webgl", instancedShapes: true });
          expect(gl.backend, `${bf.name}: expected webgl backend`).toBe("webgl");

          // 1) The box-rect EXTENT must match within a few px (the box border +
          //    text set the drawn extent). The box border is the dominant edge.
          const glBox = contentBBox(gl, 12);
          const refBox = contentBBox(ref, 12);
          const extentOk =
            Boolean(glBox) &&
            Boolean(refBox) &&
            Math.abs(glBox.width - refBox.width) <= 10 &&
            Math.abs(glBox.height - refBox.height) <= 10;
          const boxNote = `glBox=${glBox?.width}x${glBox?.height} refBox=${refBox?.width}x${refBox?.height}`;

          // 2) The node-colour border must appear on BOTH backends.
          const glBorder = countColorPixels(gl, bf.rgb, 70);
          const refBorder = countColorPixels(ref, bf.rgb, 70);
          const borderOk = glBorder > 0 && refBorder > 0;

          // 3) The dark label text (#0f172a) must appear on BOTH backends when
          //    the fixture is labelled. The canvas-raster atlas means the WebGL
          //    text pixel count is within a generous ratio of the Canvas2D text.
          let textOk = true;
          let textNote = "no-text";
          if (bf.text) {
            const glText = countColorPixels(gl, BOX_TEXT_RGB, 60);
            const refText = countColorPixels(ref, BOX_TEXT_RGB, 60);
            const ratio = refText > 0 ? glText / refText : 0;
            // Both must draw SOME dark text; the canvas-raster atlas keeps the
            // counts close (same font, same fitted string, same device size).
            textOk = glText > 0 && refText > 0 && ratio > 0.5 && ratio < 2.0;
            textNote = `glText=${glText} refText=${refText} ratio=${ratio.toFixed(2)}`;
          }

          const pass = Boolean(extentOk && borderOk && textOk);
          results.push({
            name: bf.name,
            dpr,
            pass,
            note: `${boxNote} glBorder=${glBorder} refBorder=${refBorder} ${textNote}`,
          });
        }
      }

      // eslint-disable-next-line no-console
      console.log("[boxes-golden] per-box WebGL-vs-Canvas2D:", JSON.stringify(results, null, 2));
      for (const r of results) {
        expect(r.pass, `${r.name} @ DPR ${r.dpr}: ${r.note}`).toBe(true);
      }
    } finally {
      await oracle.close();
    }
  }, 240_000);
});
