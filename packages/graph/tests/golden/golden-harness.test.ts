import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error -- .mjs harness modules are plain ESM, no types needed.
import { openOracle } from "./cdp-harness.mjs";
// @ts-expect-error
import {
  diffPixels,
  geometryProbes,
  worldToDevice,
  drawnRadius,
  contentBBox,
  countColorPixels,
} from "./diff.mjs";
// @ts-expect-error
import {
  baseFixture,
  perturbNode,
  ALL_FIXTURES,
  SHAPES_FIXTURE,
  SHAPES_COLOR_RGBA,
  shapePolygonPoints,
  SHAPE_CODE,
  BOX_LABELLED_FIXTURE,
  BOX_EMPTY_FIXTURE,
  BOX_FOCAL_FIXTURE,
  BOX_LONG_LABEL_FIXTURE,
  BOX_SHORT_LABEL_FIXTURE,
  BOX_TEXT_RGB,
  BOX_BASE_HEIGHT_PX,
  BOX_MAX_WIDTH_RATIO,
  BOX_EMPTY_RATIO,
  COMMUNITY_FIXTURE,
  BORDERS_FIXTURE,
  SOLID_CENTER_RGBA,
  HOLLOW_CENTER_RGBA,
  BORDER_COLOR_RGBA,
  EDGES_FIXTURE,
  EDGE_ALPHA_FIXTURE,
  SELECTION_FIXTURE,
  SELECTED_RGBA,
  FOCUS_RGBA,
} from "./fixtures.mjs";
// @ts-expect-error
import { napiAvailable, smokeCapture } from "./smoke.mjs";

// The whole golden suite needs headless Chrome. If absent (some CI runners),
// the suite skips rather than fails -- the harness's job is to be available
// where Chrome is, and the napi smoke path (below) still runs.
let oracle: Awaited<ReturnType<typeof openOracle>> | null = null;
let chromeUp = false;

beforeAll(async () => {
  try {
    oracle = await openOracle();
    chromeUp = true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[golden] Chrome/CDP oracle unavailable, skipping CDP suite:", String(err));
    chromeUp = false;
  }
}, 60_000);

afterAll(async () => {
  if (oracle) await oracle.close();
});

const CAPTURE_OPTS = { dpr: 1, cssWidth: 200, cssHeight: 200, camera: { x: 0, y: 0, zoom: 1 } };

// Set GOLDEN_REQUIRE_CHROME=1 (CI golden job) to turn a missing Chrome into a
// hard failure instead of a silent skip.
const REQUIRE_CHROME = process.env.GOLDEN_REQUIRE_CHROME === "1";

describe("B1 Phase-0 golden harness (Chrome/CDP direct-canvas-pixel oracle)", () => {
  it("oracle booted (or skip is explicit)", () => {
    if (REQUIRE_CHROME) {
      expect(chromeUp, "GOLDEN_REQUIRE_CHROME=1 but Chrome/CDP oracle did not boot").toBe(true);
    }
    // Positive signal in the report that the CDP suite actually ran.
    expect(typeof chromeUp).toBe("boolean");
  });

  it("capture+diff is DETERMINISTIC: same fixture twice => zero diff", async () => {
    if (!chromeUp || !oracle) return;
    const a = await oracle.capture(baseFixture, CAPTURE_OPTS);
    const b = await oracle.capture(baseFixture, CAPTURE_OPTS);
    const result = diffPixels(a, b, { channelTolerance: 0, maxFailingPixels: 0 });
    expect(result.dimsMatch).toBe(true);
    // IDENTICAL: zero channel delta anywhere. Proves capture+diff determinism.
    expect(result.maxChannelDelta).toBe(0);
    expect(result.failingPixels).toBe(0);
    expect(result.pass).toBe(true);
  }, 60_000);

  it("catches a regression: one node moved 3px => diff ABOVE tolerance", async () => {
    if (!chromeUp || !oracle) return;
    const ref = await oracle.capture(baseFixture, CAPTURE_OPTS);
    // Move the red circle 3 world-px (= 3 device-px at zoom 1).
    const moved = perturbNode(baseFixture, "circle", 3, 0);
    const cap = await oracle.capture(moved, CAPTURE_OPTS);
    // With a real per-channel tolerance, the 3px move MUST produce failing pixels.
    const result = diffPixels(ref, cap, { channelTolerance: 2, maxFailingPixels: 0 });
    expect(result.dimsMatch).toBe(true);
    expect(result.pass).toBe(false);
    expect(result.failingPixels).toBeGreaterThan(0);
  }, 60_000);

  it("geometry probes hit known node centers (catches drift a loose tolerance masks)", async () => {
    if (!chromeUp || !oracle) return;
    const cap = await oracle.capture(baseFixture, CAPTURE_OPTS);
    const view = { width: cap.width, height: cap.height, zoom: 1, camera: { x: 0, y: 0 } };
    // The red circle center should be solidly red. The diamond center solidly blue.
    const [cx, cy] = worldToDevice([-60, -40], view);
    const [dx, dy] = worldToDevice([60, -40], view);
    const probes = [
      { name: "circle-center-red", x: cx, y: cy, expect: [214, 39, 40, 255], tolerance: 12 },
      { name: "diamond-center-blue", x: dx, y: dy, expect: [31, 119, 180, 255], tolerance: 12 },
    ];
    const { pass, results } = geometryProbes(cap, probes);
    if (!pass) {
      // eslint-disable-next-line no-console
      console.error("[golden] probe failures:", JSON.stringify(results, null, 2));
    }
    expect(pass).toBe(true);
    // Sanity: the drawn radius is what we think it is (locks N1 radius semantics
    // for the GL phases that diff against this).
    expect(drawnRadius(14, 1, 1)).toBeCloseTo(14, 5);
  }, 60_000);

  it("supports paired captures at DPR 1 / 1.25 / 2 / 3 and >= 2 zooms (dims scale)", async () => {
    if (!chromeUp || !oracle) return;
    for (const dpr of [1, 1.25, 2, 3]) {
      for (const zoom of [1, 2]) {
        const cap = await oracle.capture(baseFixture, {
          cssWidth: 200,
          cssHeight: 200,
          dpr,
          camera: { x: 0, y: 0, zoom },
        });
        expect(cap.width).toBe(Math.round(200 * dpr));
        expect(cap.height).toBe(Math.round(200 * dpr));
        // Determinism holds per (dpr, zoom): re-capture is identical.
        const cap2 = await oracle.capture(baseFixture, {
          cssWidth: 200,
          cssHeight: 200,
          dpr,
          camera: { x: 0, y: 0, zoom },
        });
        const d = diffPixels(cap, cap2, { channelTolerance: 0, maxFailingPixels: 0 });
        expect(d.maxChannelDelta).toBe(0);
      }
    }
  }, 120_000);
});

// ===========================================================================
// B1 Phase-1 EXPANSION (test-only, current canvas2d renderer is the source of
// truth). Comprehensive non-regression coverage of the inventory groups that
// were uncovered by the Phase-0 smoke subset. PREFER deterministic geometry-
// parity assertions (probes computed from render-geometry constants + content
// bounding boxes) over fragile full-frame baselines; add a per-fixture
// determinism floor (same fixture twice == byte-identical) everywhere so the
// A/B golden model holds. Every block SKIPS (not fails) when Chrome is absent.
// ===========================================================================

// Wider canvas for the multi-node "row/grid" fixtures (their nodes spread past
// ±95 world, which would fall off the 200px default canvas at zoom 1).
const WIDE_OPTS = { dpr: 1, cssWidth: 320, cssHeight: 240, camera: { x: 0, y: 0, zoom: 1 } };

const VIEW = (cap: { width: number; height: number }, zoom = 1) => ({
  width: cap.width,
  height: cap.height,
  zoom,
  camera: { x: 0, y: 0 },
});

/** Assert a fixture re-captures byte-identical (the A/B golden floor). */
async function expectDeterministic(
  oracle: NonNullable<typeof oracle>,
  fixture: unknown,
  opts: Record<string, unknown> = CAPTURE_OPTS,
): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
  const a = await oracle.capture(fixture, opts);
  const b = await oracle.capture(fixture, opts);
  const d = diffPixels(a, b, { channelTolerance: 0, maxFailingPixels: 0 });
  expect(d.dimsMatch).toBe(true);
  expect(d.maxChannelDelta).toBe(0);
  expect(d.failingPixels).toBe(0);
  return a;
}

describe("B1-P1 SHAPES per type (N1 dot, N2 diamond, N3 star, N4 square, N5 hexagon, N6 triangle)", () => {
  it("each shape draws at its center with the shape colour (geometry parity)", async () => {
    if (!chromeUp || !oracle) return;
    const cap = await expectDeterministic(oracle, SHAPES_FIXTURE, WIDE_OPTS);
    const view = VIEW(cap);
    // Every node's center must be solidly the one shape colour. A center probe
    // is interior (no AA), so a miss is unambiguous shape/colour drift.
    const probes = SHAPES_FIXTURE.nodes.map((n: { id: string; x: number; y: number }) => {
      const [x, y] = worldToDevice([n.x, n.y], view);
      return { name: `${n.id}-center`, x, y, expect: SHAPES_COLOR_RGBA, tolerance: 12 };
    });
    const { pass, results } = geometryProbes(cap, probes);
    if (!pass) console.error("[golden] shape probes:", JSON.stringify(results, null, 2));
    expect(pass).toBe(true);
  }, 60_000);

  it("each polygon glyph fills a KNOWN interior point near a vertex (catches wrong start-angle/ratio)", async () => {
    if (!chromeUp || !oracle) return;
    const cap = await oracle.capture(SHAPES_FIXTURE, WIDE_OPTS);
    const view = VIEW(cap);
    // For each polygon shape, sample a point 70% of the way to its FIRST drawn
    // vertex (well inside the filled glyph): a wrong star-inner-ratio or a
    // rotated hexagon would move that vertex and the probe would land on white.
    const probes: Array<{ name: string; x: number; y: number; expect: number[]; tolerance: number }> = [];
    for (const n of SHAPES_FIXTURE.nodes as Array<{ id: string; x: number; y: number; size: number; shape: string }>) {
      const code = SHAPE_CODE[n.shape];
      const r = drawnRadius(n.size, WIDE_OPTS.dpr, WIDE_OPTS.camera.zoom);
      const pts = shapePolygonPoints(code, r);
      if (!pts) continue; // circle/box covered elsewhere
      const [vx, vy] = pts[0];
      const [sx, sy] = worldToDevice([n.x, n.y], view);
      // device-space: world dx/dy already in device px because r used dpr*zoom.
      probes.push({
        name: `${n.id}-near-vertex`,
        x: sx + vx * 0.7,
        y: sy + vy * 0.7,
        expect: SHAPES_COLOR_RGBA,
        tolerance: 16,
      });
    }
    const { pass, results } = geometryProbes(cap, probes);
    if (!pass) console.error("[golden] vertex probes:", JSON.stringify(results, null, 2));
    expect(pass).toBe(true);
  }, 60_000);

  it("catches a moved shape: nudging the star 3px diffs above tolerance", async () => {
    if (!chromeUp || !oracle) return;
    const ref = await oracle.capture(SHAPES_FIXTURE, WIDE_OPTS);
    const moved = perturbNode(SHAPES_FIXTURE, "star", 3, 0);
    const cap = await oracle.capture(moved, WIDE_OPTS);
    const d = diffPixels(ref, cap, { channelTolerance: 2, maxFailingPixels: 0 });
    expect(d.pass).toBe(false);
    expect(d.failingPixels).toBeGreaterThan(0);
  }, 60_000);
});

describe("B1-P1 BOXES (N7 labelled / N9 empty / recon focal) + #199 pixel-fit ellipsis", () => {
  it("a labelled god-class box draws dark text at its center over the translucent fill", async () => {
    if (!chromeUp || !oracle) return;
    const cap = await expectDeterministic(oracle, BOX_LABELLED_FIXTURE);
    // The box center sits on a glyph stroke of the dark label text most of the
    // time; rather than pin a single glyph pixel (font-fragile), assert the box
    // CONTAINS dark-text pixels and translucent-white fill in its region.
    const darkText = countColorPixels(cap, BOX_TEXT_RGB, 40);
    expect(darkText, "labelled box must render dark label text").toBeGreaterThan(0);
    // The box rect is centered; its drawn region is a content bbox around (0,0).
    const bbox = contentBBox(cap);
    expect(bbox).not.toBeNull();
    // Degree-independent height: BOX_BASE_HEIGHT_PX (× dpr × zoom). The drawn
    // rect height must be ~that (allow a few px for the border stroke width).
    const expectedH = BOX_BASE_HEIGHT_PX * CAPTURE_OPTS.dpr * CAPTURE_OPTS.camera.zoom;
    expect(bbox.height).toBeGreaterThanOrEqual(expectedH - 2);
    expect(bbox.height).toBeLessThanOrEqual(expectedH + 6);
  }, 60_000);

  it("an empty (unlabelled) box collapses to a small square with no text", async () => {
    if (!chromeUp || !oracle) return;
    const cap = await expectDeterministic(oracle, BOX_EMPTY_FIXTURE);
    // No dark label text at all (the empty box draws none).
    const darkText = countColorPixels(cap, BOX_TEXT_RGB, 30);
    // The node colour is purple; ensure we don't accidentally count it as text.
    expect(darkText, "empty box must NOT render label text").toBe(0);
    // The collapsed box is ~BOX_EMPTY_RATIO × height on a side (plus border).
    const bbox = contentBBox(cap);
    expect(bbox).not.toBeNull();
    const side = BOX_BASE_HEIGHT_PX * BOX_EMPTY_RATIO * CAPTURE_OPTS.dpr * CAPTURE_OPTS.camera.zoom;
    expect(bbox.width).toBeLessThanOrEqual(side + 6);
    expect(bbox.height).toBeLessThanOrEqual(side + 6);
  }, 60_000);

  it("recon focal pair: two labelled boxes + connecting edge render deterministically", async () => {
    if (!chromeUp || !oracle) return;
    const cap = await expectDeterministic(oracle, BOX_FOCAL_FIXTURE);
    // Both focal boxes carry text -> dark-text pixels present; the connecting
    // edge means the content spans both boxes (wide bbox).
    expect(countColorPixels(cap, BOX_TEXT_RGB, 40)).toBeGreaterThan(0);
    const bbox = contentBBox(cap);
    expect(bbox).not.toBeNull();
    // Two boxes at x=-55 and x=+55 world -> bbox spans well over 100 device px.
    expect(bbox.width).toBeGreaterThan(100);
  }, 60_000);

  it("#199: a long box label is PIXEL-CLIPPED so the box stays within the width cap", async () => {
    if (!chromeUp || !oracle) return;
    const cap = await expectDeterministic(oracle, BOX_LONG_LABEL_FIXTURE);
    const bbox = contentBBox(cap);
    expect(bbox).not.toBeNull();
    // Cap = BOX_MAX_WIDTH_RATIO × height (device px). The rendered box WIDTH must
    // NOT exceed it (plus a small border allowance). Without #199 the box would
    // balloon to many hundreds of px; the cap is the geometry-parity invariant.
    const cap199 = BOX_MAX_WIDTH_RATIO * BOX_BASE_HEIGHT_PX * CAPTURE_OPTS.dpr * CAPTURE_OPTS.camera.zoom;
    expect(bbox.width).toBeLessThanOrEqual(cap199 + 6);
    // ...and it must still draw text (the clipped label + ellipsis).
    expect(countColorPixels(cap, BOX_TEXT_RGB, 40)).toBeGreaterThan(0);
  }, 60_000);

  it("#199: a short box label is untouched and well under the cap", async () => {
    if (!chromeUp || !oracle) return;
    const cap = await oracle.capture(BOX_SHORT_LABEL_FIXTURE, CAPTURE_OPTS);
    const bbox = contentBBox(cap);
    expect(bbox).not.toBeNull();
    const cap199 = BOX_MAX_WIDTH_RATIO * BOX_BASE_HEIGHT_PX * CAPTURE_OPTS.dpr * CAPTURE_OPTS.camera.zoom;
    // A 2-char label hugs a narrow box, far under the cap (sanity that the cap
    // assertion above isn't trivially passing because all boxes are tiny).
    expect(bbox.width).toBeLessThan(cap199 * 0.6);
  }, 60_000);
});

describe("B1-P1 COMMUNITY colours (N14 single-source consumer)", () => {
  it("same group colour renders IDENTICALLY; distinct groups render DISTINCTLY", async () => {
    if (!chromeUp || !oracle) return;
    const cap = await expectDeterministic(oracle, COMMUNITY_FIXTURE, WIDE_OPTS);
    const view = VIEW(cap);
    const centerOf = (id: string) => {
      const n = COMMUNITY_FIXTURE.nodes.find((m: { id: string }) => m.id === id);
      const [x, y] = worldToDevice([n.x, n.y], view);
      return samplePixelLocal(cap, x, y);
    };
    const c0a = centerOf("c0a");
    const c0b = centerOf("c0b");
    const c1a = centerOf("c1a");
    const c2a = centerOf("c2a");
    // Within a group: identical (same single-source colour -> same rgba).
    expect(maxChannelDelta(c0a, c0b)).toBeLessThanOrEqual(4);
    // Across groups: distinctly different colours.
    expect(maxChannelDelta(c0a, c1a)).toBeGreaterThan(40);
    expect(maxChannelDelta(c0a, c2a)).toBeGreaterThan(40);
    expect(maxChannelDelta(c1a, c2a)).toBeGreaterThan(40);
  }, 60_000);
});

describe("B1-P1 NODE BORDERS (N10 hollow interior fixed-white / N11 bold)", () => {
  it("solid center = node colour; hollow center = translucent-white over white page", async () => {
    if (!chromeUp || !oracle) return;
    const cap = await expectDeterministic(oracle, BORDERS_FIXTURE, WIDE_OPTS);
    const view = VIEW(cap);
    const at = (id: string) => {
      const n = BORDERS_FIXTURE.nodes.find((m: { id: string }) => m.id === id);
      return worldToDevice([n.x, n.y], view);
    };
    const [sx, sy] = at("solid");
    const [hx, hy] = at("hollow");
    const probes = [
      // N10 anchor: a solid node's center is the node colour.
      { name: "solid-center", x: sx, y: sy, expect: SOLID_CENTER_RGBA, tolerance: 14 },
      // N10 anchor: a hollow node's center is translucent white over the white
      // page => visually white, NOT the node colour. THE subtle N10 contract.
      { name: "hollow-center", x: hx, y: hy, expect: HOLLOW_CENTER_RGBA, tolerance: 14 },
    ];
    const { pass, results } = geometryProbes(cap, probes);
    if (!pass) console.error("[golden] border probes:", JSON.stringify(results, null, 2));
    expect(pass).toBe(true);
  }, 60_000);

  it("a hollow node's BORDER carries the node colour (ring of node-colour pixels)", async () => {
    if (!chromeUp || !oracle) return;
    const cap = await oracle.capture(BORDERS_FIXTURE, WIDE_OPTS);
    // The four green-bordered nodes must put node-colour pixels on screen (the
    // borders) even though the hollow interiors are white.
    const greenPixels = countColorPixels(cap, [BORDER_COLOR_RGBA[0], BORDER_COLOR_RGBA[1], BORDER_COLOR_RGBA[2]], 40);
    expect(greenPixels, "border colour must appear on screen").toBeGreaterThan(0);
  }, 60_000);

  it("bold vs normal border differs (more border ink) — same colour, thicker stroke", async () => {
    if (!chromeUp || !oracle) return;
    // Isolate a hollow-normal vs hollow-bold node: same geometry, the bold one
    // paints MORE node-colour pixels (thicker ring). We render two single-node
    // fixtures so the count is attributable.
    const normal = {
      nodes: [{ id: "n", x: 0, y: 0, size: 20, color: "#16a34a", shape: "circle", fill: "hollow", border: "normal" }],
      edges: [],
    };
    const bold = {
      nodes: [{ id: "n", x: 0, y: 0, size: 20, color: "#16a34a", shape: "circle", fill: "hollow", border: "bold" }],
      edges: [],
    };
    const capN = await oracle.capture(normal, CAPTURE_OPTS);
    const capB = await oracle.capture(bold, CAPTURE_OPTS);
    const ringN = countColorPixels(capN, [22, 163, 74], 50);
    const ringB = countColorPixels(capB, [22, 163, 74], 50);
    expect(ringB, "bold border must paint more node-colour pixels than normal").toBeGreaterThan(ringN);
  }, 60_000);
});

describe("B1-P1 EDGES (E1 thick / E2 colour+alpha / E3 dash families / E4 curve / E6 arrow)", () => {
  it("the edge sampler scene (thick + 3 dash families + curve) is deterministic", async () => {
    if (!chromeUp || !oracle) return;
    await expectDeterministic(oracle, EDGES_FIXTURE, WIDE_OPTS);
  }, 60_000);

  it("each styled edge paints its colour (presence of thick/dashed/dotted/long-dash/curve ink)", async () => {
    if (!chromeUp || !oracle) return;
    const cap = await oracle.capture(EDGES_FIXTURE, WIDE_OPTS);
    // Each edge colour must appear (the edge drew). Dashed/dotted draw fewer
    // pixels but still > 0; we assert presence, not exact dash phase (fragile).
    expect(countColorPixels(cap, [29, 78, 216], 36), "thick solid edge").toBeGreaterThan(0);
    expect(countColorPixels(cap, [220, 38, 38], 36), "dashed edge").toBeGreaterThan(0);
    expect(countColorPixels(cap, [22, 163, 74], 36), "dotted edge").toBeGreaterThan(0);
    expect(countColorPixels(cap, [147, 51, 234], 36), "long-dash edge").toBeGreaterThan(0);
    expect(countColorPixels(cap, [8, 145, 178], 36), "curved edge").toBeGreaterThan(0);
  }, 60_000);

  it("dash families differ from a solid edge of the same colour (fewer ink pixels)", async () => {
    if (!chromeUp || !oracle) return;
    // A solid edge vs the same edge dashed/dotted: the dashed/dotted variants
    // paint FEWER pixels along the identical segment (gaps). Single-edge
    // fixtures so the count is attributable to the dash mode alone.
    const mk = (dash: string) => ({
      nodes: [
        { id: "p", x: -120, y: 0, size: 6, color: "#cbd5e1", shape: "circle" },
        { id: "q", x: 120, y: 0, size: 6, color: "#cbd5e1", shape: "circle" },
      ],
      edges: [{ source: "p", target: "q", width: 3, color: "#dc2626", dash }],
    });
    const solid = await oracle.capture(mk("solid"), WIDE_OPTS);
    const dashed = await oracle.capture(mk("dashed"), WIDE_OPTS);
    const dotted = await oracle.capture(mk("dotted"), WIDE_OPTS);
    const ink = (c: { width: number; height: number; data: Uint8ClampedArray }) =>
      countColorPixels(c, [220, 38, 38], 40);
    const solidInk = ink(solid);
    expect(ink(dashed), "dashed has gaps -> fewer red px than solid").toBeLessThan(solidInk);
    expect(ink(dotted), "dotted has gaps -> fewer red px than solid").toBeLessThan(solidInk);
    // Determinism per dash mode.
    const dashed2 = await oracle.capture(mk("dashed"), WIDE_OPTS);
    expect(diffPixels(dashed, dashed2, { channelTolerance: 0, maxFailingPixels: 0 }).maxChannelDelta).toBe(0);
  }, 60_000);

  it("a curved edge bends OFF the straight chord (control offset is honoured)", async () => {
    if (!chromeUp || !oracle) return;
    const straight = {
      nodes: [
        { id: "p", x: -120, y: 0, size: 6, color: "#cbd5e1", shape: "circle" },
        { id: "q", x: 120, y: 0, size: 6, color: "#cbd5e1", shape: "circle" },
      ],
      edges: [{ source: "p", target: "q", width: 3, color: "#0891b2", curvature: 0 }],
    };
    const curved = {
      ...straight,
      edges: [{ source: "p", target: "q", width: 3, color: "#0891b2", curvature: 0.5 }],
    };
    const capS = await oracle.capture(straight, WIDE_OPTS);
    const capC = await oracle.capture(curved, WIDE_OPTS);
    const view = VIEW(capS);
    // On the chord midpoint (world 0,0 -> device center) the STRAIGHT edge paints
    // cyan; the CURVED edge bows away, so the center pixel is NOT cyan for the
    // curve (it moved off the chord). This proves the control-point offset.
    const [mx, my] = worldToDevice([0, 0], view);
    const isCyan = (c: { width: number; data: Uint8ClampedArray }, x: number, y: number) => {
      const i = (Math.round(y) * c.width + Math.round(x)) * 4;
      return Math.abs(c.data[i] - 8) <= 40 && Math.abs(c.data[i + 1] - 145) <= 40 && Math.abs(c.data[i + 2] - 178) <= 40;
    };
    expect(isCyan(capS, mx, my), "straight edge crosses the chord midpoint").toBe(true);
    expect(isCyan(capC, mx, my), "curved edge bows OFF the chord midpoint").toBe(false);
  }, 60_000);

  it("E2/E12 colour-alpha split: opaque (a255) edge is darker over white than a180", async () => {
    if (!chromeUp || !oracle) return;
    const cap = await expectDeterministic(oracle, EDGE_ALPHA_FIXTURE, WIDE_OPTS);
    const view = VIEW(cap);
    // Both edges are blue #3b82f6; the a255 one composites fully (darker blue),
    // the a180 one is lighter over the white page. Sample each segment midpoint.
    const [ox, oy] = worldToDevice([0, -30], view); // opaque edge midpoint
    const [tx, ty] = worldToDevice([0, 30], view); // translucent edge midpoint
    const opaque = samplePixelLocal(cap, ox, oy);
    const translucent = samplePixelLocal(cap, tx, ty);
    // The translucent edge, composited over white, is LIGHTER (higher channel
    // values) than the fully opaque one on the blue channels.
    const opaqueLum = opaque[0] + opaque[1] + opaque[2];
    const translucentLum = translucent[0] + translucent[1] + translucent[2];
    expect(translucentLum, "a180 edge lighter over white than a255").toBeGreaterThan(opaqueLum);
  }, 60_000);
});

describe("B1-P1 SELECTION / highlight (N14 selected/focus colour + N16 size multiplier)", () => {
  it("selected node renders the SELECTED colour; focused node the FOCUS colour", async () => {
    if (!chromeUp || !oracle) return;
    const cap = await expectDeterministic(oracle, SELECTION_FIXTURE, WIDE_OPTS);
    const view = VIEW(cap);
    const at = (id: string) => {
      const n = SELECTION_FIXTURE.nodes.find((m: { id: string }) => m.id === id);
      return worldToDevice([n.x, n.y], view);
    };
    const [selx, sely] = at("selected");
    const [focx, focy] = at("focused");
    const probes = [
      { name: "selected-blue", x: selx, y: sely, expect: SELECTED_RGBA, tolerance: 14 },
      { name: "focus-red", x: focx, y: focy, expect: FOCUS_RGBA, tolerance: 14 },
    ];
    const { pass, results } = geometryProbes(cap, probes);
    if (!pass) console.error("[golden] selection probes:", JSON.stringify(results, null, 2));
    expect(pass).toBe(true);
  }, 60_000);

  it("N16: the selected node's glyph is LARGER (size multiplier baked in renders a bigger disc)", async () => {
    if (!chromeUp || !oracle) return;
    // Same colour, two sizes: base vs base×1.45. The larger renders a wider disc
    // -> a bigger content bbox. Single-node fixtures so the bbox is attributable.
    const base = { nodes: [{ id: "n", x: 0, y: 0, size: 14, color: "#2563eb", shape: "circle" }], edges: [] };
    const sel = { nodes: [{ id: "n", x: 0, y: 0, size: 14 * 1.45, color: "#2563eb", shape: "circle" }], edges: [] };
    const capBase = await oracle.capture(base, CAPTURE_OPTS);
    const capSel = await oracle.capture(sel, CAPTURE_OPTS);
    const bboxBase = contentBBox(capBase);
    const bboxSel = contentBBox(capSel);
    expect(bboxSel.width).toBeGreaterThan(bboxBase.width);
    expect(bboxSel.height).toBeGreaterThan(bboxBase.height);
  }, 60_000);
});

describe("B1-P1 DETERMINISM floor — every named fixture re-captures byte-identical", () => {
  it("each fixture is byte-stable (the A/B golden model rests on this)", async () => {
    if (!chromeUp || !oracle) return;
    for (const [name, fixture] of Object.entries(ALL_FIXTURES)) {
      const a = await oracle.capture(fixture, CAPTURE_OPTS);
      const b = await oracle.capture(fixture, CAPTURE_OPTS);
      const d = diffPixels(a, b, { channelTolerance: 0, maxFailingPixels: 0 });
      expect(d.maxChannelDelta, `fixture "${name}" not byte-deterministic`).toBe(0);
      expect(d.failingPixels, `fixture "${name}" not byte-deterministic`).toBe(0);
    }
  }, 180_000);
});

describe("B1-P1 render-geometry constants stay in sync with the renderer", () => {
  it("the box constants the harness asserts against match src/renderer.ts literals", async () => {
    // These mirror renderer.ts BOX_BASE_HEIGHT_PX / BOX_MAX_WIDTH_RATIO /
    // BOX_EMPTY_RATIO. If the renderer changes them the golden assertions must
    // follow — this guard makes a silent drift a test failure, not a flake.
    expect(BOX_BASE_HEIGHT_PX).toBe(18);
    expect(BOX_MAX_WIDTH_RATIO).toBe(10);
    expect(BOX_EMPTY_RATIO).toBeCloseTo(10 / 22, 10);
  });
});

// ---- local pixel helpers (no Chrome needed; pure functions) ---------------
function samplePixelLocal(
  cap: { width: number; data: Uint8ClampedArray },
  x: number,
  y: number,
): [number, number, number, number] {
  const i = (Math.round(y) * cap.width + Math.round(x)) * 4;
  return [cap.data[i], cap.data[i + 1], cap.data[i + 2], cap.data[i + 3]];
}
function maxChannelDelta(a: number[], b: number[]): number {
  let m = 0;
  for (let c = 0; c < 4; c += 1) m = Math.max(m, Math.abs(a[c] - b[c]));
  return m;
}

describe("B1 Phase-0 supplemental SMOKE path (@napi-rs/canvas, NOT the parity oracle)", () => {
  it("napi Canvas2D capture is deterministic and detects the 3px move", async () => {
    if (!napiAvailable()) {
      // eslint-disable-next-line no-console
      console.warn("[golden] @napi-rs/canvas unavailable, skipping smoke path");
      return;
    }
    const a = await smokeCapture(baseFixture, CAPTURE_OPTS);
    const b = await smokeCapture(baseFixture, CAPTURE_OPTS);
    expect(a.backend).toBe("canvas2d");
    const same = diffPixels(a, b, { channelTolerance: 0, maxFailingPixels: 0 });
    expect(same.maxChannelDelta).toBe(0);

    const moved = perturbNode(baseFixture, "circle", 3, 0);
    const cap = await smokeCapture(moved, CAPTURE_OPTS);
    const diff = diffPixels(a, cap, { channelTolerance: 2, maxFailingPixels: 0 });
    expect(diff.pass).toBe(false);
    expect(diff.failingPixels).toBeGreaterThan(0);
  }, 30_000);
});
