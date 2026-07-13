/**
 * B1 Phase 2 — EDGE golden gate (WebGL2 instanced edges vs Canvas2D).
 *
 * Same two-layer model as the Phase-1 shape gate (shapes-golden.test.ts):
 *
 *  A. GEOMETRY PARITY (always runs, deterministic, no GPU needed).
 *     Asserts the WebGL edge INSTANCE build reproduces the Canvas2D edge math
 *     to the float: E1 stroke half-width = max(1,width·PR)/2; E5 circular clip
 *     stops the capsule on the node border; E6 arrow tip sits on the target
 *     border oriented by the incoming tangent; E4 a curved edge tessellates
 *     off-chord; E3 dash period/on scale by PR; E13 overlapping endpoints draw
 *     the raw segment and emit NO arrow. This is the gate where Chrome has no
 *     GL context (this environment) and the floor everywhere.
 *
 *  B. CDP PIXEL DIFF (runs only where a real WebGL2 context is available — the
 *     CI golden-webgl lane with GOLDEN_ENABLE_WEBGL=1 + SwiftShader). Captures
 *     the Canvas2D and WebGL backends on paired canvases per edge fixture and
 *     diffs them with a per-channel tolerance sized to the stroke-edge AA rim
 *     plus an edge-colour presence probe and an arrow-presence probe. Where no
 *     GL context exists it records an EXPLICIT skip — never a false pass.
 *
 * Default-unchanged: every WebGL capture sets `instancedShapes: true` (the
 * canary). The canvas2d goldens NEVER set it, so the default path is untouched.
 */

import { describe, expect, it } from "vitest";
import {
  alphaShapeAt,
  buildEdgeInstances,
  CAPSULE_FLOATS_PER_INSTANCE,
  decodeArrow,
  decodeCapsule,
  type WebGLEdgeFrame,
} from "../../src/webgl-edges";
import {
  ARROW_LENGTH,
  borderOffset,
  drawnRadius,
  edgeStrokeWidth,
  nodeGeometry,
} from "../../src/render-geometry";
// @ts-expect-error -- .mjs harness modules are plain ESM, no types needed.
import { openOracle } from "./cdp-harness.mjs";
// @ts-expect-error
import { countColorPixels, contentBBox, inkMass } from "./diff.mjs";
// @ts-expect-error
import { EDGE_GL_FIXTURES } from "./fixtures.mjs";

const DPR_MATRIX = [1, 2, 3];
const ZOOM_MATRIX = [1, 2.5];

/** Two-circle straight-edge frame at a given DPR/zoom (world coords, dev px). */
function straightFrame(opts: {
  x0: number;
  x1: number;
  size: number;
  width: number;
  dpr: number;
  zoom: number;
  dash?: number;
  curvature?: number;
  cssW?: number;
}): WebGLEdgeFrame {
  const cssW = opts.cssW ?? 200;
  const dim = Math.round(cssW * opts.dpr);
  return {
    positions: new Float32Array([opts.x0, 0, opts.x1, 0]),
    nodeCount: 2,
    edges: new Uint32Array([0, 1]),
    style: {
      nodeSizes: new Float32Array([opts.size, opts.size]),
      nodeColors: new Uint8Array([200, 200, 200, 255, 200, 200, 200, 255]),
      nodeShapes: new Uint8Array([0, 0]),
      nodeLabels: ["", ""],
      edgeWidths: new Float32Array([opts.width]),
      edgeColors: new Uint8Array([29, 78, 216, 255]),
      edgeDash: new Uint8Array([opts.dash ?? 0]),
      edgeCurvatures: new Float32Array([opts.curvature ?? 0]),
    },
    camera: { x: 0, y: 0, zoom: opts.zoom },
    pixelRatio: opts.dpr,
    viewportWidth: dim,
    viewportHeight: dim,
  };
}

// ---------------------------------------------------------------------------
// A. GEOMETRY PARITY — the WebGL edge instances == the Canvas2D edge math.
// ---------------------------------------------------------------------------
describe("B1 Phase 2 — edge geometry parity (WebGL instances == Canvas2D math)", () => {
  // E1 thick + E14 round-cap half-width: capsule half-width == max(1,w·PR)/2.
  for (const dpr of DPR_MATRIX) {
    for (const zoom of ZOOM_MATRIX) {
      it(`E1 thick: capsule half-width == max(1,width·PR)/2 @ DPR ${dpr} × zoom ${zoom}`, () => {
        const width = 6;
        const set = buildEdgeInstances(straightFrame({ x0: -120, x1: 120, size: 8, width, dpr, zoom }));
        expect(set.capsules.length).toBeGreaterThan(0);
        const cap = decodeCapsule(set.capsules, 0);
        expect(cap.halfWidth).toBeCloseTo(edgeStrokeWidth(width, dpr) / 2, 5);
        // The drawn stroke is NOT the legacy 1px line.
        expect(cap.halfWidth).toBeGreaterThan(0.5);
      });
    }
  }

  it("E1 min-1px clamp: a sub-pixel width still strokes at half-width >= 0.5", () => {
    const set = buildEdgeInstances(straightFrame({ x0: -50, x1: 50, size: 4, width: 0.1, dpr: 1, zoom: 1 }));
    const cap = decodeCapsule(set.capsules, 0);
    expect(cap.halfWidth).toBeCloseTo(0.5, 5); // max(1, 0.1·1)/2 = 0.5
  });

  it("E2/E12 colour+alpha: capsule colour is the per-edge rgba, normalised 0..1", () => {
    const frame = straightFrame({ x0: -120, x1: 120, size: 8, width: 4, dpr: 2, zoom: 1 });
    frame.style!.edgeColors = new Uint8Array([121, 133, 153, 180]); // the a180 fallback split
    const set = buildEdgeInstances(frame);
    const cap = decodeCapsule(set.capsules, 0);
    expect(cap.color[0]).toBeCloseTo(121 / 255, 4);
    expect(cap.color[3]).toBeCloseTo(180 / 255, 4); // honours the 255-vs-180 split
  });

  // E5 circular clip: capsule starts on the source border, the LAST capsule
  // ends on the target border (along the chord), and the arrow tip is there.
  for (const dpr of DPR_MATRIX) {
    it(`E5 circular clip + E6 arrow tip on target border @ DPR ${dpr}`, () => {
      const size = 10;
      const frame = straightFrame({ x0: -120, x1: 120, size, width: 4, dpr, zoom: 1 });
      const set = buildEdgeInstances(frame);
      const cap = decodeCapsule(set.capsules, 0);

      const r = drawnRadius(size, dpr, 1);
      const half = frame.viewportWidth / 2;
      // Source centre device x = half + (-120 - 0)·zoom; clip moves it +r toward target.
      const srcCenterX = half + -120 * 1;
      const tgtCenterX = half + 120 * 1;
      expect(cap.p0[0]).toBeCloseTo(srcCenterX + r, 4);
      // Arrow: exactly one, tip on the target border, pointing +x.
      expect(set.arrows.length / 9).toBe(1);
      const arrow = decodeArrow(set.arrows, 0);
      expect(arrow.tip[0]).toBeCloseTo(tgtCenterX - r, 4);
      expect(arrow.dir[0]).toBeCloseTo(1, 5);
      expect(arrow.dir[1]).toBeCloseTo(0, 5);
      expect(arrow.length).toBeCloseTo(ARROW_LENGTH * 4 * dpr * 1, 4);
    });
  }

  it("E13 overlap fallback: overlapping endpoints draw a raw segment and NO arrow", () => {
    // Two big circles whose combined radii exceed the centre distance.
    const frame = straightFrame({ x0: -6, x1: 6, size: 30, width: 3, dpr: 2, zoom: 1 });
    const set = buildEdgeInstances(frame);
    expect(set.capsules.length).toBeGreaterThan(0); // raw segment still drawn
    const cap = decodeCapsule(set.capsules, 0);
    const half = frame.viewportWidth / 2;
    // Raw (un-clipped) endpoints: the source/target CENTRES, not the borders.
    expect(cap.p0[0]).toBeCloseTo(half + -6, 4);
    expect(set.arrows.length).toBe(0); // E13: no arrow on the overlap fallback
  });

  it("E4 curve: a curved edge tessellates into many off-chord capsules", () => {
    const frame = straightFrame({ x0: -120, x1: 120, size: 8, width: 4, dpr: 2, zoom: 1, curvature: 0.5 });
    const set = buildEdgeInstances(frame);
    const segCount = set.capsules.length / CAPSULE_FLOATS_PER_INSTANCE;
    expect(segCount).toBeGreaterThan(8); // tessellated, not a single chord segment
    // Some mid capsule must bow OFF the chord (y != 0 at the midpoint region).
    let maxOff = 0;
    for (let n = 0; n < segCount; n += 1) {
      const cap = decodeCapsule(set.capsules, n);
      maxOff = Math.max(maxOff, Math.abs(cap.p0[1] - frame.viewportHeight / 2));
    }
    expect(maxOff).toBeGreaterThan(5);
  });

  it("E3 dash families: capsule dash period/on scale with pixelRatio", () => {
    const dpr = 2;
    // dashed = [6,4]·PR -> period 20, on 12 at PR 2.
    const dashed = decodeCapsule(
      buildEdgeInstances(straightFrame({ x0: -120, x1: 120, size: 8, width: 3, dpr, zoom: 1, dash: 1 })).capsules,
      0,
    );
    expect(dashed.dashPeriod).toBeCloseTo((6 + 4) * dpr, 5);
    expect(dashed.dashOn).toBeCloseTo(6 * dpr, 5);
    // dotted = [1.5,4]·PR.
    const dotted = decodeCapsule(
      buildEdgeInstances(straightFrame({ x0: -120, x1: 120, size: 8, width: 3, dpr, zoom: 1, dash: 2 })).capsules,
      0,
    );
    expect(dotted.dashPeriod).toBeCloseTo((1.5 + 4) * dpr, 5);
    // solid edge: period 0 (no dashing).
    const solid = decodeCapsule(
      buildEdgeInstances(straightFrame({ x0: -120, x1: 120, size: 8, width: 3, dpr, zoom: 1, dash: 0 })).capsules,
      0,
    );
    expect(solid.dashPeriod).toBe(0);
  });

  it("E5 box-rect clip: a box endpoint clips via borderOffset's rectangle branch", () => {
    // Two box endpoints, labelled so the box has real extents (a measure service
    // supplies the width, as the renderer wires in DOM environments).
    const dpr = 2;
    const frame: WebGLEdgeFrame = {
      positions: new Float32Array([-120, 0, 120, 0]),
      nodeCount: 2,
      edges: new Uint32Array([0, 1]),
      style: {
        nodeSizes: new Float32Array([11, 11]),
        nodeColors: new Uint8Array([37, 99, 235, 255, 37, 99, 235, 255]),
        nodeShapes: new Uint8Array([5, 5]), // box
        nodeLabels: ["Holmes", "Watson"],
        edgeWidths: new Float32Array([4]),
        edgeColors: new Uint8Array([29, 78, 216, 255]),
        edgeDash: new Uint8Array([0]),
        edgeCurvatures: new Float32Array([0]),
      },
      camera: { x: 0, y: 0, zoom: 1 },
      pixelRatio: dpr,
      viewportWidth: 400,
      viewportHeight: 400,
      // A deterministic measure: 7px per char (so "Holmes"=42, "Watson"=42).
      measureLabelWidth: (text: string) => text.length * 7,
    };
    const set = buildEdgeInstances(frame);
    const cap = decodeCapsule(set.capsules, 0);

    // Recompute the expected box-rect border offset along +x via the shared
    // helper, so the test pins the rectangle branch (NOT the circular radius).
    const geometry = nodeGeometry(
      {
        nodeCount: 2,
        nodeSizes: frame.style!.nodeSizes,
        nodeShapes: frame.style!.nodeShapes,
        nodeLabels: frame.style!.nodeLabels,
      },
      dpr,
      1,
      frame.measureLabelWidth!,
    );
    const rectOffset = borderOffset(geometry, frame.style!.nodeShapes, 0, 1, 0);
    const half = 200;
    expect(cap.p0[0]).toBeCloseTo(half + -120 + rectOffset, 3);
    // The rect offset (box half-width) differs from the circular radius — proves
    // the box branch was taken, not the circle radius.
    expect(rectOffset).not.toBeCloseTo(drawnRadius(11, dpr, 1), 1);
  });

  it("determinism: the same frame builds byte-identical instances", () => {
    const a = buildEdgeInstances(straightFrame({ x0: -120, x1: 120, size: 8, width: 4, dpr: 2, zoom: 1, dash: 1, curvature: 0.3 }));
    const b = buildEdgeInstances(straightFrame({ x0: -120, x1: 120, size: 8, width: 4, dpr: 2, zoom: 1, dash: 1, curvature: 0.3 }));
    expect(a.capsules).toEqual(b.capsules);
    expect(a.arrows).toEqual(b.arrows);
  });

  // --- Configurable edge-transparency: the along-edge ALPHA SHAPE ------------
  // Default (no edgeAlphaShape) is byte-identical to the historical uniform edge;
  // a non-uniform shape fades the sampled alpha along the edge WITHOUT touching
  // the base alpha (v_color.a) or the geometry (endpoints/half-width/dash).
  it("no edgeAlphaShape ⇒ uniform (1,1,1); byte-identical to the pre-shape build", () => {
    const base = straightFrame({ x0: -120, x1: 120, size: 8, width: 4, dpr: 2, zoom: 1 });
    const set = buildEdgeInstances(base);
    const cap = decodeCapsule(set.capsules, 0);
    expect(cap.shape).toEqual([1, 1, 1]);
    // The uniform shape multiplies alpha by 1 at every sample point.
    for (const tt of [0, 0.25, 0.5, 0.75, 1]) expect(alphaShapeAt(cap.shape, tt)).toBeCloseTo(1, 6);
  });

  it("mid-fade shape [255,64,255]: the mid-edge alpha is lower than both endpoints", () => {
    const frame = straightFrame({ x0: -120, x1: 120, size: 8, width: 4, dpr: 2, zoom: 1 });
    frame.style!.edgeAlphaShape = new Uint8Array([255, 64, 255]);
    const cap = decodeCapsule(buildEdgeInstances(frame).capsules, 0);
    const atSource = alphaShapeAt(cap.shape, 0);
    const atMid = alphaShapeAt(cap.shape, 0.5);
    const atTarget = alphaShapeAt(cap.shape, 1);
    expect(atMid).toBeLessThan(atSource);
    expect(atMid).toBeLessThan(atTarget);
    expect(atSource).toBeCloseTo(1, 5);
    expect(atTarget).toBeCloseTo(1, 5);
    expect(atMid).toBeCloseTo(64 / 255, 5);
  });

  it("target-fade shape [255,255,64]: alpha decreases monotonically toward the target", () => {
    const frame = straightFrame({ x0: -120, x1: 120, size: 8, width: 4, dpr: 2, zoom: 1 });
    frame.style!.edgeAlphaShape = new Uint8Array([255, 255, 64]);
    const cap = decodeCapsule(buildEdgeInstances(frame).capsules, 0);
    const atSource = alphaShapeAt(cap.shape, 0);
    const atMid = alphaShapeAt(cap.shape, 0.5);
    const atTarget = alphaShapeAt(cap.shape, 1);
    expect(atSource).toBeCloseTo(1, 5);
    expect(atMid).toBeCloseTo(1, 5);
    expect(atTarget).toBeLessThan(atMid); // fades toward the target endpoint
    expect(atTarget).toBeCloseTo(64 / 255, 5);
  });
});

// ---------------------------------------------------------------------------
// B. CDP PIXEL DIFF — real WebGL vs Canvas2D (only where GL is available).
// ---------------------------------------------------------------------------
describe("B1 Phase 2 — edge pixel parity (WebGL vs Canvas2D, Chrome/CDP)", () => {
  const REQUIRE_GL = process.env.GOLDEN_REQUIRE_WEBGL === "1";

  it("per-edge WebGL-vs-Canvas2D pixel diff (or explicit no-GL skip)", async () => {
    let oracle: Awaited<ReturnType<typeof openOracle>> | null = null;
    let glAvailable = false;
    try {
      oracle = await openOracle();
      glAvailable = await oracle.hasWebGL();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[edges-golden] Chrome/CDP oracle unavailable:", String(err));
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
        console.warn(`[edges-golden] RESIDUAL/SKIP: ${reason}`);
        if (REQUIRE_GL) throw new Error(`GOLDEN_REQUIRE_WEBGL=1 but ${reason}`);
        expect(glAvailable).toBe(false); // block A is the gate in no-GL envs
        return;
      }

      const dpr = 2;
      const zoom = 1;
      const opts = { cssWidth: 280, cssHeight: 200, dpr, camera: { x: 0, y: 0, zoom } };
      const results: Array<{ name: string; pass: boolean; note: string }> = [];

      for (const ef of EDGE_GL_FIXTURES) {
        // E13 overlap: the raw segment is fully COVERED by the (overlapping)
        // glyphs, so NO edge ink shows on EITHER backend — that is the correct
        // behaviour. Parity here = the drawn EXTENT (the two glyphs) matches and
        // no arrow leaks out; an edge-ink count would be 0 on both and is N/A.
        const isOverlap = ef.name === "overlap";

        const ref = await oracle.capture(ef.fixture, { ...opts, backend: "canvas2d" });
        const gl = await oracle.capture(ef.fixture, { ...opts, backend: "webgl", instancedShapes: true });
        expect(gl.backend, `${ef.name}: expected webgl backend`).toBe("webgl");

        // The WebGL backend must have drawn the edge: count pixels near the edge
        // colour. (Both backends composite over white, so on-screen RGB is the
        // honoured colour blended toward white by alpha / AA / dash gaps.)
        const glInk = countColorPixels(gl, ef.rgb, 60);
        const refInk = countColorPixels(ref, ef.rgb, 60);
        const drew = glInk > 0 && refInk > 0;

        // The drawn content's extent on both captures must match within a few px
        // (the clip + arrow + glyphs set the extent). Shared by every case.
        const glBox = contentBBox(gl, 12);
        const refBox = contentBBox(ref, 12);
        const extentOk =
          Boolean(glBox) &&
          Boolean(refBox) &&
          Math.abs(glBox.width - refBox.width) <= 8 &&
          Math.abs(glBox.height - refBox.height) <= 8;
        const boxNote = `glBox=${glBox?.width}x${glBox?.height} refBox=${refBox?.width}x${refBox?.height}`;

        if (isOverlap) {
          // E13: edge correctly occluded ⇒ no edge ink expected on either side;
          // parity is the matching glyph extent (and the arrow-absence the
          // geometry-parity layer already pins).
          results.push({ name: ef.name, pass: extentOk, note: `overlap (edge occluded, E13); glInk=${glInk} refInk=${refInk} ${boxNote}` });
          continue;
        }

        // Edge ink presence within a comparable budget: the WebGL edge ink count
        // is within a generous ratio of the Canvas2D ink count (same width/dash/
        // clip ⇒ comparable stroked area). A grossly wrong stroke (1px legacy
        // line, no clip, missing round-pip dash caps) would blow this.
        const ratio = refInk > 0 ? glInk / refInk : 0;
        const inkOk = drew && ratio > 0.5 && ratio < 2.0;

        results.push({
          name: ef.name,
          pass: Boolean(inkOk && extentOk),
          note: `glInk=${glInk} refInk=${refInk} ratio=${ratio.toFixed(2)} ${boxNote}`,
        });
      }

      // eslint-disable-next-line no-console
      console.log("[edges-golden] per-edge WebGL-vs-Canvas2D:", JSON.stringify(results, null, 2));
      for (const r of results) {
        expect(r.pass, `${r.name}: ${r.note}`).toBe(true);
      }

      // -------------------------------------------------------------------
      // E1 WIDTH PARITY (B1 beta fidelity bug — was masked by the loose
      // 0.5..2.0 ink-ratio above). The instanced capsule expanded its quad to
      // EXACTLY ±halfWidth, which CLIPPED the fragment SDF's outer coverage
      // feather, so a WebGL edge rendered ~1px THINNER than the Canvas2D line of
      // the same max(1,width·PR) width. A THIN edge (≈2 device px here) makes
      // that lost ~1px a LARGE fraction of the stroke, so the under-weight shows
      // up as proportionally FEWER edge-colour pixels. We require the WebGL
      // edge-ink to stay within a TIGHT ratio of Canvas2D — this FAILS on the
      // pre-fix capsule and PASSES once the quad is padded to fit the feather.
      const thinRgb: [number, number, number] = [190, 24, 93]; // pink-700
      const thinFixture = {
        nodes: [
          { id: "tn0", x: -120, y: 0, size: 8, color: "#cbd5e1", shape: "circle" },
          { id: "tn1", x: 120, y: 0, size: 8, color: "#cbd5e1", shape: "circle" },
        ],
        edges: [{ source: "tn0", target: "tn1", width: 1, color: "#be185d", dash: "solid" }],
      };
      const thinRef = await oracle.capture(thinFixture, { ...opts, backend: "canvas2d" });
      const thinGl = await oracle.capture(thinFixture, { ...opts, backend: "webgl", instancedShapes: true });
      expect(thinGl.backend, "thin edge: expected webgl backend").toBe("webgl");
      // Measure the AA-INVARIANT ink mass in a CENTRAL band that holds ONLY the
      // edge (no endpoint nodes): the green channel is the high-contrast one for
      // pink (#be185d, G=24). Ink mass ∝ stroke width, independent of how each
      // rasterizer spreads its AA — so it isolates WIDTH from softness.
      const cx = thinGl.width / 2;
      const band = { x0: cx - 50, x1: cx + 50, y0: 0, y1: thinGl.height };
      const thinRefMass = inkMass(thinRef, band, 1);
      const thinGlMass = inkMass(thinGl, band, 1);
      const thinRatio = thinRefMass > 0 ? thinGlMass / thinRefMass : 0;
      // eslint-disable-next-line no-console
      console.log(
        `[edges-golden] E1 thin-edge WIDTH parity (ink mass): glMass=${thinGlMass} refMass=${thinRefMass} ratio=${thinRatio.toFixed(3)}`,
      );
      expect(thinRefMass, "canvas2d thin edge must paint ink").toBeGreaterThan(0);
      expect(
        thinRatio,
        `thin-edge width-parity ratio ${thinRatio.toFixed(3)} below floor — WebGL edge is too thin vs Canvas2D`,
      ).toBeGreaterThanOrEqual(0.85);
      expect(thinRatio, `thin-edge ratio ${thinRatio.toFixed(3)} above ceiling — WebGL edge is too thick`).toBeLessThanOrEqual(1.3);
    } finally {
      await oracle.close();
    }
  }, 180_000);
});
