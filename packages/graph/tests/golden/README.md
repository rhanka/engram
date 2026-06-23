# B1 Phase-0 — golden-image non-regression harness

The non-regression guarantee of the Canvas2D → WebGL renderer migration
(`/home/antoinefa/src/graphify/.graphify/scratch/B1_migration_plan_v2.md`)
depends on this harness existing FIRST. **Phase 0 builds ONLY the harness** — it
does not touch the renderer and does not start WebGL parity.

## What it is

A Chrome/CDP-driven golden-image oracle that renders a fixture graph with
`@sentropic/graph` onto a REAL `<canvas>` in headless Chrome and reads the
**canvas backing-store pixels DIRECTLY** (`getImageData` for Canvas2D,
`gl.readPixels` for WebGL) — **not** a whole-page `Page.captureScreenshot`. It
pins a deterministic font and `await document.fonts.ready` before every capture,
and diffs two captures with **both** a per-channel pixel tolerance **and**
geometry probes at known device-pixel coordinates.

## Files

| File | Role |
|---|---|
| `harness-page.html` | The page Chrome loads. Imports the `@sentropic/graph` dist, builds `RenderGraphBuffers`+`GraphStyleBuffers` from a fixture, renders Canvas2D onto a real canvas, pins the font, exposes `__renderFixture` + `__readPixels` (direct `getImageData`/`gl.readPixels`). |
| `cdp-harness.mjs` | The CDP driver / **primary parity oracle**. Boots headless Chrome, serves the page + dist over HTTP, awaits `document.fonts.ready`, captures direct canvas pixels at a given DPR/zoom. `openOracle()` → `capture(fixture, opts)` → `{width,height,data}`. |
| `diff.mjs` | `diffPixels` (per-channel tolerance), `geometryProbes` (sample known coords), `worldToDevice`/`drawnRadius` (the renderer's exact transforms). |
| `fixtures.mjs` | The base smoke fixture, `perturbNode` (move a node N px), DPR/zoom matrices. |
| `smoke.mjs` | **Supplemental** fast smoke path via `@napi-rs/canvas` — explicitly **NOT** the parity oracle (its AA/font differ from Chrome). |
| `golden-harness.test.ts` | vitest wiring + the Phase-0 acceptance proof. |

## Run

```bash
# from packages/graph
npm run test:golden        # build the JS bundle + run the golden harness vitest
npm run golden:selftest    # boot Chrome, render one fixture, assert pixels drew

# raw CDP self-test (no vitest, dist must already be built):
node tests/golden/cdp-harness.mjs --selftest
```

> The golden scripts build the JS bundle with `tsup --no-dts` (`golden:build`)
> because the package's `.d.ts` emit currently errors on an unrelated
> pre-existing `src/styles.ts` strictness issue; the harness only needs the JS
> bundle, so it sidesteps the typings step.

CI: set `GOLDEN_REQUIRE_CHROME=1` in the golden job to make a missing Chrome a
hard failure instead of a silent skip. The supplemental napi smoke path runs in
the normal `npm test` vitest job as a fast pre-filter, never the gate.

## Phase-0 acceptance (the smoke proof)

1. **Determinism** — same fixture captured twice → zero diff (`failingPixels=0`,
   `maxChannelDelta=0`).
2. **Regression caught** — one node moved 3px → diff above tolerance
   (`failingPixels>0`, `pass=false`).
3. **DPR/zoom** — paired captures at DPR `1 / 1.25 / 2 / 3` × zoom `{1, 2}` with
   correct device backing-store dimensions, deterministic per pair.

## Notes for the GL phases

- The harness already wires the WebGL branch: `__renderFixture({...,backend:"webgl"})`
  and `__readPixels` flips GL's bottom-left origin to top-left. The GL phases
  need **zero harness changes** to start diffing WebGL vs Canvas2D.
- `worldToDevice`/`drawnRadius` mirror the renderer's exact transforms
  (`screenPoint` renderer.ts:437, radius `nodeSize·PR·zoom` renderer.ts:723), so
  geometry probes are computed, not hard-coded.
- `headless-gl` (the WebGL smoke counterpart) is **not viable in this
  environment**: its native node-gyp build needs the X11/Xi `-dev`
  pkg-config files (`xi.pc`, `x11.pc`), which are absent. `@napi-rs/canvas`
  installs from a prebuilt binary and works. For Phase 0 (no WebGL backend yet)
  the napi Canvas2D smoke path fully covers the smoke proof.
