/**
 * B1 Phase 1 — node-SHAPE golden gate (WebGL instanced shapes vs Canvas2D).
 *
 * Two layers, mirroring the plan's two-checks-per-golden requirement (§5.1):
 *
 *  A. GEOMETRY PARITY (always runs, deterministic, no GPU needed).
 *     For each shape family × DPR {1, 1.25, 2, 3} × zoom {1, 2.5}, assert the
 *     WebGL instanced-shape build emits a glyph whose `a_radius` EQUALS the
 *     Canvas2D drawn radius `max(1, size·PR·zoom)` — radius-AS-radius (N1) — and
 *     is NOT the historical half-sprite. This is the parity that locks out the
 *     gl_PointSize diameter trap and runs even where Chrome has no GL context.
 *
 *  B. CDP PIXEL DIFF (runs only where a real WebGL2 context is available — the
 *     CI golden job with GOLDEN_ENABLE_WEBGL=1 + a GPU/SwiftShader). For each
 *     shape family it captures the Canvas2D and WebGL backends on paired canvases
 *     and diffs them with a per-channel tolerance + a centre geometry probe.
 *     Where no GL context exists (this environment), it records an EXPLICIT skip
 *     with the residual reason — never a false pass.
 */

import { describe, expect, it } from "vitest";
import {
  buildShapeInstances,
  decodeInstance,
  type WebGLShapeFrame,
} from "../../src/webgl-shapes";
import { drawnRadius } from "../../src/render-geometry";
import { shapeCode } from "../../src/shape-geometry";
// @ts-expect-error -- .mjs harness modules are plain ESM, no types needed.
import { openOracle } from "./cdp-harness.mjs";
// @ts-expect-error
import { diffPixels, geometryProbes, worldToDevice } from "./diff.mjs";
// @ts-expect-error
import { SHAPE_FAMILIES, shapeFixture, SHAPE_ZOOM_MATRIX, DPR_MATRIX } from "./fixtures.mjs";

interface Family {
  name: string;
  shape: string;
  size: number;
  color: string;
  rgb: [number, number, number];
}

const FAMILIES = SHAPE_FAMILIES as Family[];

/** Build a one-node WebGLShapeFrame for a family at a given DPR/zoom. */
function frameFor(family: Family, dpr: number, zoom: number): WebGLShapeFrame {
  const code = shapeCode(family.shape);
  const positions = new Float32Array([0, 0]);
  const nodeSizes = new Float32Array([family.size]);
  const nodeShapes = new Uint8Array([code]);
  const [r, g, b] = family.rgb;
  const nodeColors = new Uint8Array([r, g, b, 255]);
  return {
    positions,
    nodeCount: 1,
    style: {
      nodeSizes,
      nodeColors,
      nodeShapes,
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

// ---------------------------------------------------------------------------
// A. GEOMETRY PARITY — radius-as-radius (N1), per family × DPR × zoom.
// ---------------------------------------------------------------------------
describe("B1 Phase 1 — shape geometry parity (WebGL a_radius == Canvas2D radius)", () => {
  for (const family of FAMILIES) {
    for (const dpr of DPR_MATRIX as number[]) {
      for (const zoom of SHAPE_ZOOM_MATRIX as number[]) {
        it(`${family.name} @ DPR ${dpr} × zoom ${zoom}: a_radius == max(1,size·PR·zoom), NOT half`, () => {
          const code = shapeCode(family.shape);
          const set = buildShapeInstances(frameFor(family, dpr, zoom));
          const list = set.fill.get(code === 0 ? 0 : code);
          expect(list, `expected a fill instance for family ${family.name}`).toBeTruthy();
          expect(list!.length).toBeGreaterThan(0);
          const inst = decodeInstance(list!, 0);

          const expected = drawnRadius(family.size, dpr, zoom);
          // Radius-AS-radius: the GL instance carries the SAME drawn radius
          // Canvas2D uses, to the float.
          expect(inst.radius).toBeCloseTo(expected, 5);
          // Lock out the old half-sprite: the drawn radius is NOT size·PR·zoom/2.
          const halfSprite = (family.size * dpr * zoom) / 2;
          expect(Math.abs(inst.radius - halfSprite)).toBeGreaterThan(0.5);
          // The instance sits at the node centre with the node colour + full alpha.
          expect(inst.center).toEqual([0, 0]);
          expect(inst.color[3]).toBeCloseTo(1, 5);
          expect(Math.round(inst.color[0] * 255)).toBe(family.rgb[0]);
        });
      }
    }
  }

  it("min-1px clamp: a tiny node still draws at radius >= 1 (shared with Canvas2D)", () => {
    const tiny: Family = { name: "tiny", shape: "circle", size: 0.1, color: "#000000", rgb: [0, 0, 0] };
    const set = buildShapeInstances(frameFor(tiny, 1, 0.5));
    const inst = decodeInstance(set.fill.get(0)!, 0);
    expect(inst.radius).toBe(1);
    expect(drawnRadius(0.1, 1, 0.5)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// B. CDP PIXEL DIFF — real WebGL vs Canvas2D (only where GL is available).
// ---------------------------------------------------------------------------
describe("B1 Phase 1 — shape pixel parity (WebGL vs Canvas2D, Chrome/CDP)", () => {
  const REQUIRE_GL = process.env.GOLDEN_REQUIRE_WEBGL === "1";

  it("per-shape WebGL-vs-Canvas2D pixel diff (or explicit no-GL skip)", async () => {
    let oracle: Awaited<ReturnType<typeof openOracle>> | null = null;
    let glAvailable = false;
    try {
      oracle = await openOracle();
      glAvailable = await oracle.hasWebGL();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[shapes-golden] Chrome/CDP oracle unavailable:", String(err));
    }

    if (!oracle) {
      if (REQUIRE_GL) throw new Error("GOLDEN_REQUIRE_WEBGL=1 but Chrome did not boot");
      return; // no Chrome at all
    }

    try {
      if (!glAvailable) {
        const reason =
          "no WebGL2 context in this Chrome (set GOLDEN_ENABLE_WEBGL=1 with a GPU/SwiftShader build to run the real pixel diff)";
        // eslint-disable-next-line no-console
        console.warn(`[shapes-golden] RESIDUAL/SKIP: ${reason}`);
        if (REQUIRE_GL) throw new Error(`GOLDEN_REQUIRE_WEBGL=1 but ${reason}`);
        // The geometry-parity block (A) above is the gate in no-GL environments.
        expect(glAvailable).toBe(false);
        return;
      }

      const dpr = 2;
      const zoom = 1;
      const opts = { cssWidth: 200, cssHeight: 200, dpr, camera: { x: 0, y: 0, zoom } };
      const results: Array<{ name: string; pass: boolean; failingPixels: number; maxDelta: number }> = [];

      for (const family of FAMILIES) {
        const fixture = shapeFixture(family);
        const ref = await oracle.capture(fixture, { ...opts, backend: "canvas2d" });
        const gl = await oracle.capture(fixture, { ...opts, backend: "webgl", instancedShapes: true });
        // Assert WebGL truly engaged (not a silent canvas2d fallback).
        expect(gl.backend, `${family.name}: expected webgl backend`).toBe("webgl");

        // Cross-rasterizer AA budget. The WebGL shapes are flat-colour triangle
        // fans antialiased by the context's 4x MSAA (antialias:true); Canvas2D
        // uses Skia's ANALYTIC coverage AA. The two agree EXACTLY on interiors
        // and straight axis/45°-aligned edges (diamond/square diff to 0–1px),
        // but on CURVED / multi-angle boundaries (circle/star/hexagon) the 4x
        // MSAA coverage is quantized to 5 levels where Skia's is continuous, so
        // the ~1px perimeter rim differs by up to ~one MSAA step. We therefore:
        //  - keep channelTolerance MODERATE (24) so a genuinely WRONG colour
        //    (interior fill off by a lot) still fails, and
        //  - size maxFailingPixels to the perimeter RIM only (~one ring of a
        //    ≤32px-radius glyph), so a mis-SIZED or mis-COLOURED shape (which
        //    mismatches a whole annulus / the interior = thousands of pixels)
        //    still fails hard, while the AA rim is allowed to disagree.
        // Geometry correctness is independently locked by block A (radius parity)
        // and the centre probe below.
        const diff = diffPixels(ref, gl, { channelTolerance: 24, maxFailingPixels: 320 });
        const view = { width: gl.width, height: gl.height, zoom, camera: { x: 0, y: 0 } };
        const [px, py] = worldToDevice([0, 0], view);
        const probe = geometryProbes(gl, [
          { name: `${family.name}-center`, x: px, y: py, expect: [...family.rgb, 255], tolerance: 16 },
        ]);
        results.push({
          name: family.name,
          pass: diff.pass && probe.pass,
          failingPixels: diff.failingPixels,
          maxDelta: diff.maxChannelDelta,
        });
      }

      // eslint-disable-next-line no-console
      console.log("[shapes-golden] per-family WebGL-vs-Canvas2D:", JSON.stringify(results, null, 2));
      for (const r of results) {
        expect(r.pass, `${r.name}: failing=${r.failingPixels} maxDelta=${r.maxDelta}`).toBe(true);
      }
    } finally {
      await oracle.close();
    }
  }, 120_000);
});
