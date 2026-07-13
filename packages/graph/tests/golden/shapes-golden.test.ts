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
  effectiveStrokeHalfWidth,
  type WebGLShapeFrame,
} from "../../src/webgl-shapes";
import { drawnRadius } from "../../src/render-geometry";
import { shapeCode } from "../../src/shape-geometry";
// @ts-expect-error -- .mjs harness modules are plain ESM, no types needed.
import { openOracle } from "./cdp-harness.mjs";
// @ts-expect-error
import { diffPixels, geometryProbes, worldToDevice, countColorPixels } from "./diff.mjs";
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

  // ---------------------------------------------------------------------
  // Border-thickness fix: the two-disc ring is built by scaling the WHOLE
  // unit polygon by a RADIAL offset (radius ± effectiveStrokeHalf). For a
  // disc (circle) the radial offset IS the perpendicular gap, but for a
  // flat-faced polygon (diamond/square/hexagon/triangle) the gap measured
  // PERPENDICULAR to a face is `radial offset x apothem/circumradius ratio`
  // (apothem = radius x ratio) — so circles/hexagons rendered a MUCH thicker
  // perpendicular border than diamonds/squares/triangles. The fix compensates
  // by DIVIDING the radial offset by each family's own apothem ratio, so that
  // once re-foreshortened by that SAME ratio the visible PERPENDICULAR width
  // is identical everywhere. This asserts the perpendicular (radial x ratio),
  // NOT the radial offset itself, is uniform — the radial offsets are
  // deliberately UNEQUAL by design (that inequality is what cancels the
  // per-shape foreshortening). Deterministic, no GPU needed.
  // ---------------------------------------------------------------------
  it("border perpendicular half-width is UNIFORM across every shape family (apothem compensation)", () => {
    const dpr = 2;
    const zoom = 1;
    // Documented apothem-per-a_radius ratios (shape-geometry.ts regular
    // polygons; star approximated) — an INDEPENDENT copy of the source's
    // lookup so this test pins the intended per-shape numbers. NOTE square is
    // 0.88 (its own SQUARE_INSET_RATIO), NOT cos(45°)=0.707 — the square's
    // unit outline is pre-inset BEFORE the a_radius scale, unlike diamond
    // (same 4-gon shape, but no inset, so a_radius IS its circumradius).
    const APOTHEM_RATIO_BY_CODE: Record<number, number> = {
      0: 1.0,
      1: 0.707,
      2: 0.5,
      3: 0.866,
      4: 0.88,
      6: 0.5,
    };
    const perpWidths = FAMILIES.map((family) => {
      const code = shapeCode(family.shape);
      const frame: WebGLShapeFrame = {
        positions: new Float32Array([0, 0]),
        nodeCount: 1,
        style: {
          nodeSizes: new Float32Array([family.size]),
          nodeColors: new Uint8Array([...family.rgb, 255]),
          nodeShapes: new Uint8Array([code]),
          nodeFills: new Uint8Array([1]), // hollow -> emits BOTH a border and an inner-fill instance
          nodeBorders: new Uint8Array([1]), // bold, so the effect is not lost in a tiny stroke
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
      const set = buildShapeInstances(frame);
      const border = decodeInstance(set.border.get(code)!, 0);
      const innerFill = decodeInstance(set.fill.get(code)!, 0);
      const radialHalfWidth = (border.radius - innerFill.radius) / 2;
      return { name: family.name, code, perp: radialHalfWidth * APOTHEM_RATIO_BY_CODE[code]! };
    });

    const reference = perpWidths[0]!.perp;
    // Precision 3 (not tighter): this test's ratio table intentionally uses
    // documented ROUNDED literals (e.g. 0.707) while the source computes
    // exact trig (Math.cos(Math.PI/4)), so a ~3e-4 rounding gap is expected
    // and not a regression.
    for (const { name, perp } of perpWidths) {
      expect(
        perp,
        `${name}: PERPENDICULAR border half-width (${perp}) must match every other family` +
          ` (reference ${reference}) — the fix compensates the radial offset by the apothem ratio` +
          ` so the VISIBLE border weight no longer depends on shape.`,
      ).toBeCloseTo(reference, 3);
    }
    // Sanity: circle (ratio 1.0) and diamond (ratio 0.707, genuinely much
    // thinner pre-fix) now match to the pixel — the exact bug this fix
    // targets — as do circle and square (ratio 0.88).
    const circle = perpWidths.find((p) => p.code === 0)!.perp;
    const diamond = perpWidths.find((p) => p.code === 1)!.perp;
    const square = perpWidths.find((p) => p.code === 4)!.perp;
    expect(circle).toBeCloseTo(diamond, 3);
    expect(circle).toBeCloseTo(square, 3);
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

      // -------------------------------------------------------------------
      // OUTLINE WIDTH PARITY (B1 beta fidelity bug, UPDATED for the per-shape
      // apothem-compensation fix). The FAMILIES above are all SOLID fills, so
      // they never exercise the node BORDER. Canvas2D strokes the border
      // CENTRED on the drawn radius (a band of (bold?3:1.5)·PR spanning
      // [radius-half, radius+half]) — UNCHANGED by this fix. The WebGL ring is
      // now DELIBERATELY ~30% THINNER than the pre-existing square/diamond
      // weight (uniform across shapes — see webgl-shapes.ts BORDER_PERP_SCALE),
      // so the probe location and ink-ratio floor below are the NEW intended
      // geometry, not the old "reads a touch heavier than Canvas2D" target.
      // We probe a fraction of the way into the ring (not right at its edge,
      // to stay clear of AA/MSAA at the boundary) using the SAME formula the
      // source computes, so a probe failure means an actual geometry/colour
      // regression, not a stale hardcoded pixel offset.
      const borderRgb: [number, number, number] = [22, 163, 74]; // #16a34a
      const hbFixture = {
        nodes: [{ id: "hb", x: 0, y: 0, size: 20, color: "#16a34a", shape: "circle", fill: "hollow", border: "bold" }],
        edges: [],
      };
      const hbRef = await oracle.capture(hbFixture, { ...opts, backend: "canvas2d" });
      const hbGl = await oracle.capture(hbFixture, { ...opts, backend: "webgl", instancedShapes: true });
      expect(hbGl.backend, "hollow-bold: expected webgl backend").toBe("webgl");

      const view = { width: hbGl.width, height: hbGl.height, zoom, camera: { x: 0, y: 0 } };
      const [cx, cy] = worldToDevice([0, 0], view);
      const radius = drawnRadius(20, dpr, zoom); // 40 device px @ dpr 2
      // Circle's apothem ratio is 1.0, so its radial ring offset IS the new
      // uniform perpendicular half-width directly — probe 60% of the way from
      // the drawn radius to the ring's outer edge (safely inside the ring,
      // clear of the AA boundary), a fraction of the SOURCE's own formula so
      // this stays correct if the constants ever change.
      const ringHalfWidth = effectiveStrokeHalfWidth(0, true, dpr, zoom);
      const probeX = cx + radius + ringHalfWidth * 0.6;
      const refProbe = geometryProbes(hbRef, [
        { name: "ref-border-outer", x: probeX, y: cy, expect: [...borderRgb, 255], tolerance: 40 },
      ]);
      const glProbe = geometryProbes(hbGl, [
        { name: "gl-border-outer", x: probeX, y: cy, expect: [...borderRgb, 255], tolerance: 40 },
      ]);
      // Secondary: the WebGL border must paint a comparable amount of node-colour
      // ink to Canvas2D. The NEW ring is intentionally ~0.69x the Canvas2D width
      // (uniform across shapes, ~30% thinner than the old square/diamond weight,
      // itself already thinner than Canvas2D for those shapes) — floor/ceiling
      // bracket the intended ~0.69 ratio with room for AA-driven pixel-count noise.
      const refBorderInk = countColorPixels(hbRef, borderRgb, 50);
      const glBorderInk = countColorPixels(hbGl, borderRgb, 50);
      const borderRatio = refBorderInk > 0 ? glBorderInk / refBorderInk : 0;
      // eslint-disable-next-line no-console
      console.log(
        `[shapes-golden] OUTLINE width parity: refProbe=${JSON.stringify(refProbe.results[0].got)} ` +
          `glProbe=${JSON.stringify(glProbe.results[0].got)} ` +
          `refBorderInk=${refBorderInk} glBorderInk=${glBorderInk} ratio=${borderRatio.toFixed(3)}`,
      );
      expect(refProbe.pass, "canvas2d border ring must cover the probe point (sanity)").toBe(true);
      expect(
        glProbe.pass,
        `WebGL hollow-bold border vanished/mispositioned at the intended new ring (got ${JSON.stringify(glProbe.results[0].got)})`,
      ).toBe(true);
      expect(
        borderRatio,
        `WebGL border ink ratio ${borderRatio.toFixed(3)} too low — border thinner than the intended ~0.69x Canvas2D`,
      ).toBeGreaterThanOrEqual(0.4);
      expect(
        borderRatio,
        `WebGL border ink ratio ${borderRatio.toFixed(3)} too high — border not thinned as intended (~0.69x Canvas2D)`,
      ).toBeLessThanOrEqual(0.9);

      // -------------------------------------------------------------------
      // HOVER-DIM PARITY (premultiplied-alpha regression). The FAMILIES + the
      // outline fixture above are all alpha=255 (opaque), where a·a == a, so they
      // NEVER exercised the alpha-COMPOSITING path — which is exactly why the
      // straight-alpha + blendFunc(SRC_ALPHA, ONE_MINUS_SRC_ALPHA) bug slipped the
      // gate. That blend squared the source alpha into the framebuffer, so under
      // premultipliedAlpha:true a DIMMED (alpha<1) node — e.g. a non-connected node
      // on hover — composited TOO TRANSPARENT (washed toward the white background)
      // in WebGL vs Canvas2D. The premultiplied output (rgb·a) + blendFunc(ONE,
      // ONE_MINUS_SRC_ALPHA) makes the composite correct. We render a solid node at
      // alpha 0x80 (~0.5) on BOTH backends (composited over the harness white) and
      // assert the CENTRE pixel matches — the regression guard for the hover-dim bug.
      const dimFixture = {
        // "#16a34a80": green at alpha 128/255 (~0.502) — a typical hover-dim node.
        nodes: [{ id: "dim", x: 0, y: 0, size: 24, color: "#16a34a80", shape: "circle" }],
        edges: [],
      };
      const dimRef = await oracle.capture(dimFixture, { ...opts, backend: "canvas2d" });
      const dimGl = await oracle.capture(dimFixture, { ...opts, backend: "webgl", instancedShapes: true });
      expect(dimGl.backend, "hover-dim: expected webgl backend").toBe("webgl");

      const dview = { width: dimGl.width, height: dimGl.height, zoom, camera: { x: 0, y: 0 } };
      const [dcx, dcy] = worldToDevice([0, 0], dview);
      // Read the centre pixel on each backend (interior ⇒ fully covered, so AA is
      // not a factor; only the alpha-compositing math differs). tolerance 1024 just
      // forces geometryProbes to RETURN `got` without failing on the throwaway expect.
      const refCenter = geometryProbes(dimRef, [
        { name: "ref-dim-center", x: dcx, y: dcy, expect: [0, 0, 0, 0], tolerance: 1024 },
      ]).results[0].got;
      const glCenter = geometryProbes(dimGl, [
        { name: "gl-dim-center", x: dcx, y: dcy, expect: [0, 0, 0, 0], tolerance: 1024 },
      ]).results[0].got;
      // eslint-disable-next-line no-console
      console.log(
        `[shapes-golden] HOVER-DIM parity: refCenter=${JSON.stringify(refCenter)} glCenter=${JSON.stringify(glCenter)}`,
      );
      // The WebGL dim composite must match Canvas2D per channel (was washed-white pre-fix).
      for (let c = 0; c < 3; c += 1) {
        expect(
          Math.abs(glCenter[c] - refCenter[c]),
          `hover-dim channel ${c}: gl ${glCenter[c]} vs ref ${refCenter[c]} (WebGL dim composited unlike Canvas2D)`,
        ).toBeLessThanOrEqual(20);
      }
      // Sanity: the dim node stays GREEN-ish (G well above R) on BOTH backends — a
      // washed-to-white result (the bug) would collapse G−R toward 0.
      expect(refCenter[1] - refCenter[0], "canvas2d dim must read green-ish (sanity)").toBeGreaterThan(30);
      expect(
        glCenter[1] - glCenter[0],
        `WebGL dim washed toward white (G−R=${glCenter[1] - glCenter[0]}) — premultiplied-alpha regression`,
      ).toBeGreaterThan(30);
    } finally {
      await oracle.close();
    }
  }, 120_000);
});
