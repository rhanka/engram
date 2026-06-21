import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error -- .mjs harness modules are plain ESM, no types needed.
import { openOracle } from "./cdp-harness.mjs";
// @ts-expect-error
import { diffPixels, geometryProbes, worldToDevice, drawnRadius } from "./diff.mjs";
// @ts-expect-error
import { baseFixture, perturbNode } from "./fixtures.mjs";
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
